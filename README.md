# csv-reader-speed

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/sontv01034/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/sontv01034/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A faster drop-in for make.fun's csv-reader 1.0.0, written for the
[csv-reader-speed-01-run-20261121 bounty](https://make.fun/bounty/csv-reader-speed-01-run-20261121).

`solve.js` answers exactly as csv-reader 1.0.0 does (`{text, header}` →
`{columns, rows, errors}`), including every broken-row quirk: BOM, CRLF/LF ends,
empty lines, stray CRs, quote junk, unterminated quotes, short/long rows. It is
faster because it reads with bulk string operations instead of one character at a
time: a record whose line holds no quote and no stray CR is split with the native
`String.split`, and other fields are scanned with `indexOf` for their next
delimiter, so a quoted field's value is one slice.

- `solve.js` — the fast reader (`run(input)`).
- `main.ts` — the driver the harness runs: reads `/input/cases.json`, answers each
  case with `run`, writes `/output/answers.json`.

MIT licensed. No dependencies.
