// csv-reader-speed: a faster drop-in for make.fun's csv-reader 1.0.0.
//
// Answers exactly as csv-reader 1.0.0 does ({text, header} -> {columns, rows, errors}),
// but reads with bulk string operations instead of one character at a time:
//
//   - Any stretch of a record that holds no quote and no stray CR is split with the
//     native String.split: the whole record when it is plain, the fields before a
//     quoted field, and the tail after the last quoted field. A record with one
//     quoted field therefore costs one quoted-field scan plus two splits, not one
//     scan per field.
//   - Other fields are scanned with indexOf for their next delimiter, and a quoted
//     field is found with indexOf('"', ...) skipping doubled quotes, so its value
//     is one slice (plus a replace only when "" or a CR/LF is inside it).
//
// Every quirk of the reference is kept: BOM drop, CRLF/LF ends, empty lines are no
// record, stray CR dropped with an error, quote junk appended, an unterminated quote
// read again as unquoted, short/long rows padded or cut, error order and line/row.

const COMMA = 0;
const LINE_BREAK = 1;
const END = 2;

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  // Reads unquoted characters onto `value` up to the next comma or line break: a CR not followed by LF is dropped
  // (stray_cr). Returns the field and how it ended; `added` counts the characters kept.
  function readUnquoted(value) {
    let added = 0;
    while (pos < n) {
      const ci = text.indexOf(',', pos);
      const ni = text.indexOf('\n', pos);
      const ri = text.indexOf('\r', pos);
      let m = -1;
      let kind = 0; // 0 comma, 1 LF, 2 CR
      if (ci !== -1) { m = ci; kind = 0; }
      if (ni !== -1 && (m === -1 || ni < m)) { m = ni; kind = 1; }
      if (ri !== -1 && (m === -1 || ri < m)) { m = ri; kind = 2; }
      if (m === -1) {
        value += text.slice(pos);
        added += n - pos;
        pos = n;
        return { value, ended: END, added };
      }
      if (m > pos) {
        value += text.slice(pos, m);
        added += m - pos;
        pos = m;
      }
      if (kind === 0) {
        pos += 1;
        return { value, ended: COMMA, added };
      }
      if (kind === 1) {
        pos += 1;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      // A CR: a line break when followed by LF, else a dropped stray CR.
      if (text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
        return { value, ended: LINE_BREAK, added };
      }
      error('stray_cr');
      pos += 1;
    }
    return { value, ended: END, added };
  }

  // Reads a quoted field whose opening quote is at pos.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    pos += 1;
    // Find the closing quote: the next quote that is not doubled.
    let q = text.indexOf('"', pos);
    let doubled = false;
    while (q !== -1 && text.charCodeAt(q + 1) === 34) {
      doubled = true;
      q = text.indexOf('"', q + 2);
    }
    if (q === -1) {
      // The quote never closes: it is a literal character, and the text after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      error('unterminated_quote');
      return readUnquoted('"');
    }
    let value = text.slice(open + 1, q);
    if (value.indexOf('\n') !== -1 || value.indexOf('\r') !== -1) {
      // Each CRLF or lone CR inside quotes is one LF; count every line break.
      const breaks = value.match(/\r\n|[\r\n]/g);
      line += breaks === null ? 0 : breaks.length;
      value = value.replace(/\r\n?/g, '\n');
    }
    if (doubled) value = value.replace(/""/g, '"');
    pos = q + 1;
    if (pos >= n) return { value, ended: END };
    const c = text[pos];
    if (c === ',') {
      pos += 1;
      return { value, ended: COMMA };
    }
    if (c === '\n') {
      pos += 1;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    if (c === '\r' && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      return { value, ended: LINE_BREAK };
    }
    // What follows the closing quote is appended as it stands, up to the next comma or line break.
    const junk = readUnquoted(value);
    if (junk.added > 0) error('quote_junk');
    return junk;
  }

  // Finishes a record read into `fields` (its last field quoted when `quoted`).
  function finish(fields, quoted) {
    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) return;
    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      return;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }

  while (true) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    const fields = [];
    let quoted = false;
    let ended = COMMA;
    while (ended === COMMA) {
      // This record's line from pos, up to its LF (or the end of the text).
      const lineEnd = text.indexOf('\n', pos);
      const le = lineEnd === -1 ? n : lineEnd;
      const seg = text.slice(pos, le);
      const qi = seg.indexOf('"');
      if (qi === -1) {
        // No quote on the line: one native split finishes the record, unless a
        // stray CR is in it (a trailing CR is the CRLF end, only when a LF follows).
        const ri = seg.indexOf('\r');
        if (ri === -1 || (ri === seg.length - 1 && lineEnd !== -1)) {
          const tail = (ri === seg.length - 1 ? seg.slice(0, -1) : seg).split(',');
          for (let i = 0; i < tail.length; i++) fields.push(tail[i]);
          if (lineEnd !== -1) line += 1;
          pos = lineEnd === -1 ? n : lineEnd + 1;
          ended = LINE_BREAK;
          quoted = false;
          break;
        }
        // A stray CR: read one unquoted field, which drops it with an error.
        quoted = false;
        const field = readUnquoted('');
        fields.push(field.value);
        ended = field.ended;
        continue;
      }
      // A quote is on the line. When it opens a field and nothing before it is a
      // stray CR, the fields before it are one native split (no quote, no CR and
      // no LF can be in them: the quote is the first one, and a CR before it
      // cannot be the line's CRLF, which sits past the quote).
      if (qi > 0 && seg.charCodeAt(qi - 1) === 44) {
        const ri = seg.indexOf('\r');
        if (ri === -1 || ri >= qi) {
          const head = seg.slice(0, qi - 1).split(',');
          for (let i = 0; i < head.length; i++) fields.push(head[i]);
          pos += qi;
        }
      }
      // One field, quoted or not (a quote inside an unquoted field is literal,
      // so readUnquoted is right when the quote does not open the field).
      quoted = text[pos] === '"';
      const field = quoted ? readQuoted() : readUnquoted('');
      fields.push(field.value);
      ended = field.ended;
    }
    finish(fields, quoted);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
