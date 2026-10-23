<p><img src="apps/web/public/logo.svg" width="56" height="56" alt="Hoax logo"></p>

# Hoax

Hoax cuts a dreamDEX perp position down to safe size before the liquidation engine can take it, and proves every save with an on-chain receipt.

Liquidation is the worst exit in perps: a 1% penalty, a forced close at whatever the book pays, and no say in the exit. Hoax gives traders a cheaper one, automatically, without ever touching their funds. A trader links Hoax to a dreamDEX wallet as a trade-only bot and sets a trigger health and a target health. When health falls to the trigger, Hoax closes the smallest slice that restores the target, but only when that close costs less than the liquidation it prevents.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail), MVP track (bots and agents, trader tools). Runs on both networks the dreamDEX testnet app trades on: Somnia Hideki (Tokyo, chain 50383) and Somnia Shannon (chain 50312), one engine per network.

**Who it is for:** anyone holding a leveraged dreamDEX perp position who isn't watching it every minute. Mark price and hourly funding move health on an idle position, and a stop-loss closes everything at a fixed price. Hoax closes just enough, only when it is cheaper than liquidation.

## What it does

1. **Opt in.** Connect the wallet you trade with on `/start` and sign a free sign-in message. Hoax finds the wallet's dreamDEX trading account (the Safe 1.5.0 smart account the account factory derives from it), the watcher makes a key just for that account, and one transaction from your wallet links the key on every perp pool: per-pool `OperatorPermissionsRegistry` grants of `placeOrderFor`, `cancelOrderFor` and `reduceOrderFor`, executed by your own Safe, plus the builder-fee approval if you want it. That is a tighter grant than dreamDEX's own Link a bot, which also adds a registry-wide one. Pasting the key into Link a bot still works. Hoax notices the link on chain.
2. **Watch.** Every second (and immediately on `PositionUpdated` / `PositionLiquidated`) the watcher reads account health: equity over maintenance margin, where 1.0 is liquidation. It never acts on a mark the pool calls stale.
3. **Size.** At the trigger it solves for the smallest close that restores the target, using the cross-margin form of the spec's formula:

   `n = (H_target × M − E) / (H_target × m − c)`

   where E is equity, M the account's maintenance requirement, m the market's maintenance rate and c the close's cost per unit of notional (read from the live book). The size is rounded up to the lot, raised to the market minimum, capped at the policy's max close per action, and turned into a full close only when a partial one would leave less than the floor.
4. **Gate.** It acts only when `C_close ≤ λ × C_liq`, where `C_liq = penalty × N + forced-close slippage`. Both are read from chain: the LiquidationEngine's 100 bps penalty and 50 bps minimum spread, and the book's depth.
5. **Close.** One immediate-or-cancel `placeOrderFor` from the linked key, priced at mark ∓ max slippage, sized from a fresh read. The builder fee is attached only when the trader's on-chain approval covers it.
6. **Reconcile.** It re-reads the position after the fill. dreamDEX has no reduce-only flag, so if a race flipped the position, Hoax flattens the flipped amount at once and pauses the account until the trader confirms.
7. **Prove.** Every action gets a receipt: health before and after, size closed, average fill, cost paid, estimated liquidation cost, liquidation price before and after, and tx links. It is signed (EIP-191) by the account's Hoax key. For 24 hours Hoax watches the mark: if it reaches the old liquidation price while the reduced position survives, the action becomes **saved** with the equity preserved. Otherwise it is **not needed** and its cost is shown as the price of insurance. Misses (liquidations Hoax could not prevent) are recorded and shown too.

## Repo layout

```
apps/web/            Next.js app: wallet connect (wagmi, EIP-6963), sign-in, one-transaction link, positions,
                     receipts, stats, live markets, crash simulator, replay + HTTP API
services/watcher/    health loop, executor, reconciler, counterfactual tracker, link detection, gas drips, keystore
packages/core/       sizing, cost gate, flip guard, decisions, receipts, counterfactual (pure, unit-tested)
packages/chain/      Venue interface; networks (Hideki, Shannon); DreamDexVenue (SDK reads, placeOrderFor via viem); SimVenue;
                     DreamDexAccounts (wallet → dreamDEX Safe, link/revoke transaction, link status)
packages/db/         Store interface; Postgres and in-memory backends; schema in migrations/
spike/               proof scripts for the spec's spike tests, with logged evidence in spike/evidence/
e2e/                 browser end to end: fresh wallet → protected → revoked, on a local fork of Hideki
feedback/            Feedback-track items in the bounty format
demo/                replay harness and path recorder
```

Stack: TypeScript, Next.js 15, React 19, wagmi 2, viem 2, `@somnia-chain/markets-sdk@0.32.1`, `@somnia-chain/accounts-sdk@0.4.0`, Postgres, Vitest, Playwright.

## Run it

Needs Node 22 and, for persistence, Postgres.

```sh
npm install
cp .env.example .env            # set HOAX_KEYSTORE_SECRET (32+ chars) and DATABASE_URL

npm run db:migrate              # create the tables
npm run watcher                 # the watcher; health at http://localhost:8080/healthz
npm run web                     # the app at http://localhost:3000
```

`DRY_RUN=true` makes the watcher decide and log without sending orders. `HOAX_DEMO=1 npm run web` runs the web app with no database or watcher: receipts and stats are sample data and the engine shows offline, while markets and connected wallets are still read live from chain. Set `HOAX_SESSION_SECRET` (32+ chars) on the web app so wallet sign-ins survive restarts.

To protect a wallet: open `/start`, connect the wallet you trade dreamDEX perps with, sign the free sign-in message, then on step 02 press **Link Hoax · one transaction**. Step 03 tops the key up with STT (the watcher's gas wallet does it automatically when configured), step 04 sets the policy. Revoke from Settings with one more transaction, or remove the bot in dreamDEX.

### The engine on a real position

`spike/10-engine-fork.ts` runs the real engine against a real trader's dreamDEX account on an Anvil fork of Hideki: one tick sized a 0.05374 BTC close, sent it through `placeOrderFor` from the Hoax key, filled it against the forked book, reconciled, and signed the receipt (health 3.071 → 3.595, target 3.58). With `NETWORK=shannon` it does the same on a fork of Shannon: a real Safe linked on all 24 Shannon perp pools in one transaction, then 0.1 SOL closed, health 3.2 → 6.39. See `spike/README.md`.

### End to end on a fork

`e2e/onboarding.ts` drives the real web app with a scripted wallet against a local Anvil fork of Hideki, with the real watcher running: a fresh wallet gets a dreamDEX Safe, connects, signs in, receives its key, links 21 markets in one transaction, is activated by the watcher, gets gas, sets a policy and revokes. See `e2e/README.md`.

### Tests and checks

```sh
npm test                                         # 41 unit and end-to-end tests
TEST_DATABASE_URL=postgres://… npm test          # also runs the store contract against Postgres
npm run typecheck
npm run build -w @hoax/web
```

The watcher's end-to-end tests drive the real engine against `SimVenue`: onboarding and link detection, a save confirmed by the counterfactual tracker, a close marked not-needed after 24 hours, a flip under a race (flattened, account paused), a stale mark, a pause, a price gap straight through to liquidation (one missed receipt per episode), a book with nothing inside max slippage, and the gas-drip caps.

## Deploy

- **Watcher on Railway.** `railway.toml` builds the root `Dockerfile`. Set `DATABASE_URL` (a Railway Postgres), `HOAX_KEYSTORE_SECRET`, optionally `GAS_WALLET_PRIVATE_KEY`, `HOAX_BUILDER_ADDRESS` and `HOAX_BUILDER_FEE_BPS_1K`, and mount a volume at `/data` for the keystore. It runs the migrations on start.
- **Web on Vercel.** Root directory `apps/web` (`vercel.json` installs from the repo root). Set the same `DATABASE_URL`, plus `HOAX_BUILDER_ADDRESS` and `HOAX_BUILDER_FEE_BPS_1K` if a fee is charged.

## Spike tests

Each script writes block numbers, the SDK version and every tx hash to `spike/evidence/`. See [spike/README.md](spike/README.md).

| # | Test | Result |
|---|------|--------|
| 0 | Read everything a decision needs | **Pass.** 21 perp markets, all with a live mark. LiquidationEngine penalty 100 bps, min spread 50 bps. Builder fee cap 10 bps. ETH: maintenance 2.5%, close-out 1.25%, taker fee 0 |
| 1 | Operator can trade (`placeOrderFor` for the owner) | Script ready (`02-operator-close`); needs a linked wallet |
| 1b | Contract as operator | Not attempted: v1 uses the off-chain watcher with a bot key, the spec's fallback |
| 2 | Partial close raises health as the formula predicts (within 5%) | Script ready (`02-operator-close`); needs a linked wallet |
| 3 | Watcher catches idle drift within 2 s | **Pass.** 62/62 mark moves showed in health within 2 s, median 478 ms (polling at 250 ms). No funding settlement fell in the 2-minute window |
| 4 | No flip under races (50 runs) | Script ready (`04-race`); needs two keys linked to one wallet. The simulated race passes in the test suite |
| 5 | Latency, trigger to close | Script ready (`05-latency`); reads the watcher's records after live closes |
| 6 | Does book trading move the liquidation mark? | **Mark follows the index feed** (71 of 86 mark moves came with an index move), so the demo comparison runs as a replay |
| 7 | On-chain reactivity subscription on Hideki | Subscription reads answer; creating one needs a funded owner. v1 stays off-chain |

## Demo

`npm run replay` runs the controlled comparison: two identical accounts, the same position, the same mark path, one protected. The real Hoax engine runs against `SimVenue`, seeded with dreamDEX's market and liquidation parameters and the ETH order book shape read live from Hideki. The result shows at `/replay`, labelled as a replay. On a 4.5% drop from today's ETH mark:

- Without Hoax: liquidated in 7 steps, ending with 59.45 USDso.
- With Hoax: two closes (0.24 ETH, then 0.20 ETH after the cooldown) for 0.85 USDso in total. It survived with 85.35 USDso, **25.90 USDso more**. The first receipt resolved as saved.

`npx tsx demo/record.ts` records a real mark path and book for `PATH_FILE=… npm run replay`. The live segment of the demo is a real testnet account set near its trigger. See [demo/README.md](demo/README.md).

## Security and trust

- Hoax can never move a trader's funds. A linked key can only place, cancel and reduce orders for the wallet, and every fill settles to the wallet. The worst a leaked key can do is trade badly; the trader revokes it by unlinking the bot in dreamDEX.
- One key per account, generated by the watcher and stored AES-256-GCM-encrypted in its keystore volume. Keys are never in the database and never shared between accounts.
- Every order is IOC, sized from a fresh read, capped per action, and inside max slippage. A flip is flattened and the account paused.
- Hoax fails closed: no order on a stale mark or after a read error. Repeated read failures alert the trader.
- Fees come only from the on-chain approval and the pool's cap, and are shown on every receipt. Paper USDso accounts are never charged.
- Gas drips go only to keys with a confirmed link, under per-key and daily caps.
- Management: registering a wallet returns a manage token (stored hashed). A registration only becomes active when its owner links the Hoax key in dreamDEX, which nobody else can do.
- Vulnerabilities found in dreamDEX contracts go privately to security@dreamdex.io, not into this repo.

## Where v1 differs from the spec

- **Plain SQL over `pg` instead of Prisma.** It is the same tables; the store is an interface with Postgres and in-memory backends, so tests and the replay run without a database.
- **No on-chain `HoaxHandler`.** Spike 1b and 7 were not passed, so the spec's fallback applies: an off-chain watcher with a bot key.
- **Event push uses `eth_subscribe` logs** for `PositionUpdated` and `PositionLiquidated`, with the 1-second clock as the backbone.
- **Management uses a token, not wallet signatures.** dreamDEX wallets are app-managed Somnia Accounts that a browser wallet usually cannot sign for. Linking the key is the proof of control.
- **Equity preserved does not subtract the close cost a second time.** The cost was already paid out of the equity being compared.

## Feedback track

Five verified items are in [feedback/](feedback/):

1. The SDK docs give Hideki 10 ms blocks; the chain runs 100 ms blocks.
2. The Hideki Multicall3 address in `CHAINS.md` contradicts the chain and the SDK.
3. `PERPS.md`'s testnet pool count is stale (10 pools with 4 restricted, versus 21 with none).
4. The RPC caps `eth_getLogs` at a 1000-block span, undocumented, with a generic `-1` error.
5. The SDK has no perp writes for a linked bot.

## X posts

- _to add: 2–3 posts tagging @DreamDEXSomnia_

## License

MIT
