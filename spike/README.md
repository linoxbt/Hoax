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
| `08-link-tx` | in-app link | no (eth_estimateGas only) | nothing (finds a recent dreamDEX linker), or `WALLET` |
| `09-link-fork` | in-app link, executed | on a local fork only | `FORK_RPC` of an Anvil fork of Hideki |

For the order-sending spikes, make a key with `cast wallet new` (or any EOA), link it to a spare dreamDEX wallet with **Link a bot** (Perps ticked, send it gas), open a small leveraged ETH-PERP position in that wallet, then run the script. Without `CONFIRM=yes` the scripts check the link and stop.

Any bug a spike turns up goes into `../feedback/` in the bounty's format.

## The in-app link (08, 09)

dreamDEX accounts are Safe 1.5.0 smart accounts (the SomniaAccountFactory's account at index 0, owned 1-of-1 by the trader's wallet). Decoding recent `OperatorPermissionsRegistry` traffic on Hideki shows dreamDEX's Link a bot is one Safe `execTransaction` through MultiSend: `setOperatorApprovalGlobal(bot, [placeOrderFor, cancelOrderFor, reduceOrderFor])` plus per-pool grants. Hoax sends the per-pool grants on perp pools only, as a pre-validated Safe execution from the owner.

- **08** builds that transaction for a real dreamDEX user's Safe and proves with `eth_estimateGas` that the Safe accepts it from its owner and refuses it from anyone else (GS025). Nothing is sent.
- **09** runs it on an Anvil fork: a fresh wallet gets a Safe, one transaction links the key on all 21 perp pools for all three selectors, one transaction revokes it.
