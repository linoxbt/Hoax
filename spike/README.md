# Spike tests

Proof scripts for the build spec's spike tests. Each writes a JSON log with block numbers, the SDK version and tx hashes to `evidence/`. Run them from the repo root with `npm run spike -- <name>`.

| Script | Spec test | Sends orders? | Needs |
|---|---|---|---|
| `01-health-read` | reads (0) | no | nothing; `OWNER_ADDRESS` adds an account's health |
| `02-operator-close` | 1 and 2 | yes, one minimum-size close | `OWNER_ADDRESS`, `BOT_PRIVATE_KEY` (linked to it), an open position of 2+ minimums, `CONFIRM=yes` |
| `03-idle-drift` | 3 | no | nothing (finds an open position), or `OWNER_ADDRESS`; `DURATION_S` |
| `04-race` | 4 | yes, many small closes | `OWNER_ADDRESS`, `BOT_PRIVATE_KEY`, `RIVAL_PRIVATE_KEY` (both linked), `ROUNDS`, `CONFIRM=yes` |
| `05-latency` | 5 | no | `DATABASE_URL` of a watcher that has made live closes |
| `06-mark-source` | 6 | no | `MARKET`, `DURATION_S` |
| `07-subscription` | 7 | no | nothing (probe only) |

For the order-sending spikes, make a key with `cast wallet new` (or any EOA), link it to a spare dreamDEX wallet with **Link a bot** (Perps ticked, send it gas), open a small leveraged ETH-PERP position in that wallet, then run the script. Without `CONFIRM=yes` the scripts check the link and stop.

Any bug a spike turns up goes into `../feedback/` in the bounty's format.
