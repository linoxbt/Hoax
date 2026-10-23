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
| `10-engine-fork` | 1 and 2, on a fork | on a local fork only | `FORK_RPC`; optional `WALLET` (a trader with open positions); `NETWORK=shannon` with `SAFE=` or `ACCOUNT=` for Shannon |

For the order-sending spikes, make a key with `cast wallet new` (or any EOA), link it to a spare dreamDEX wallet with **Link a bot** (Perps ticked, send it gas), open a small leveraged ETH-PERP position in that wallet, then run the script. Without `CONFIRM=yes` the scripts check the link and stop.

Any bug a spike turns up goes into `../feedback/` in the bounty's format.

## The in-app link (08, 09)

dreamDEX accounts are Safe 1.5.0 smart accounts (the SomniaAccountFactory's account at index 0, owned 1-of-1 by the trader's wallet). Decoding recent `OperatorPermissionsRegistry` traffic on Hideki shows dreamDEX's Link a bot is one Safe `execTransaction` through MultiSend: `setOperatorApprovalGlobal(bot, [placeOrderFor, cancelOrderFor, reduceOrderFor])` plus per-pool grants. Hoax sends the per-pool grants on perp pools only, as a pre-validated Safe execution from the owner.

- **08** builds that transaction for a real dreamDEX user's Safe and proves with `eth_estimateGas` that the Safe accepts it from its owner and refuses it from anyone else (GS025). Nothing is sent.
- **09** runs it on an Anvil fork: a fresh wallet gets a Safe, one transaction links the key on all 21 perp pools for all three selectors, one transaction revokes it.

## The engine closing a real position (10)

On an Anvil fork, spike 10 takes a real trader's dreamDEX Safe with open BTC, SOL and ETH perp positions (health 3.07), impersonates its owner to send Hoax's link transaction, sets a policy whose trigger sits just above the current health, and runs the real engine for one tick. Recorded run (`evidence/10-engine-fork-*.json`): the engine sized a 0.05374 BTC close, sent it as an IOC `placeOrderFor` from the Hoax key against the forked book, filled it in full, reconciled the position (0.12836 → 0.07462 BTC, still long, no flip) and wrote a receipt signed by the key, with health 3.071 → 3.595 against a 3.58 target. On a cold fork the first reads pull state from Hideki, so the spike warms the fork and uses a long RPC timeout; the engine fails closed (no order, a signed "skipped" receipt) whenever a read times out, which the earlier attempts showed.

On Shannon (`NETWORK=shannon`, recorded in `evidence/10-engine-fork-shannon-*.json`) the same run takes a real 1-of-1 Safe (Safe 1.4.1) holding 0.2 SOL-PERP. Shannon's traders run far from liquidation (its riskiest Safe sat above health 30), out of any policy's reach, so on the fork the Safe first withdraws collateral down to health 3.2: the same position, run hotter. Hoax's link batch then granted the key on all 24 Shannon perp pools in one transaction from the owner, and one engine tick closed 0.1 SOL (the market minimum, half the position) through `placeOrderFor`, health 3.2 → 6.39, with a signed receipt. Most Shannon traders trade from the wallet itself, with no Safe; for them Hoax links with one registry-wide `setOperatorApprovalGlobal` grant of the same three order selectors, and on the fork that grant made the pool report the key as authorised (`isOperatorAuthorized` true). Their positions on the fork sat in books with nobody on the closing side, so that run could not show a fill.
