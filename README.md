<p><img src="apps/web/public/logo.svg" width="56" height="56" alt="Hoax logo"></p>

# Hoax

Hoax cuts a dreamDEX perp position down to safe size before the liquidation engine can take it, and proves every save with an on-chain receipt.

Liquidation is the worst exit in perps: a 1% penalty, a forced close at whatever the book pays, and no say in the exit. Hoax gives traders a cheaper one, automatically, without ever touching their funds. A trader links Hoax to a dreamDEX wallet as a place-order-only bot and sets a trigger health and a target health. When health falls to the trigger, Hoax closes the smallest slice that restores the target, but only when that close costs less than the liquidation it prevents.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail), MVP track (bots and agents, trader tools). Runs on both networks the dreamDEX testnet app trades on: Somnia Hideki (Tokyo, chain 50383) and Somnia Shannon (chain 50312), one engine per network.

**Who it is for:** anyone holding a leveraged dreamDEX perp position who isn't watching it every minute. Mark price and hourly funding move health on an idle position, and a stop-loss closes everything at a fixed price. Hoax closes just enough, only when it is cheaper than liquidation.

## What it does

1. **Opt in.** Connect the wallet you trade with on `/start` and sign a free sign-in message. Hoax finds the wallet's dreamDEX trading account (the Safe 1.5.0 smart account the account factory derives from it), the watcher makes a key just for that account, and one transaction from your wallet links the key on every perp pool: per-pool `OperatorPermissionsRegistry` grants of `placeOrderFor` only, the one call the engine makes, executed by your own Safe, plus the builder-fee approval if you want it. That is a tighter grant than dreamDEX's own Link a bot, which grants `placeOrderFor`, `cancelOrderFor` and `reduceOrderFor` registry-wide: the Hoax key cannot cancel or shrink your own resting orders. A trader who trades from the wallet itself has no Safe to batch through, so Hoax grants that wallet `placeOrderFor` registry-wide in one call (spot pools included) and says so before the wallet signs; the engine only ever trades perps. Unlinking revokes all three selectors, and the builder approval with them. Pasting the key into Link a bot still works. Hoax notices the link on chain, and warns when a market with protection on is not covered.
2. **Watch.** Every second (and immediately on `PositionUpdated` / `PositionLiquidated`) the watcher reads account health: equity over maintenance margin, where 1.0 is liquidation. Each account is ticked on its own, so one slow read never delays another account. It never acts on a mark the pool calls stale. It acts once health is under the trigger by the policy's trigger margin (0.02 by default: the default 1.25 trigger acts below 1.23), so health hovering at the trigger does not set it off.
3. **Size.** At the trigger it solves for the smallest close that restores the target, using the cross-margin form of the spec's formula:

   `n = (H_target × M − E) / (H_target × m − c)`

   where E is equity, M the account's maintenance requirement, m the market's maintenance rate and c the close's cost per unit of notional (read from the live book). The size is rounded up to the lot, raised to the market minimum, capped at the policy's max close per action, and turned into a full close only when a partial one would leave less than the floor.
4. **Gate.** It acts only when `C_close ≤ λ × C_liq`, where `C_liq = penalty × N + forced-close slippage`. Both are read from chain: the LiquidationEngine's 100 bps penalty and 50 bps minimum spread, and the book's depth.
5. **Close.** One immediate-or-cancel `placeOrderFor` from the linked key, priced at mark ∓ max slippage, sized from a fresh read. The builder fee is attached only when the trader's on-chain approval covers it. The order is on record the moment it has a transaction hash; if its receipt is lost (a timeout, a restart), the next tick asks the chain what it did before Hoax will act on that market again, so a lost receipt never becomes a second close. A rejected or reverted order backs off (5 s, doubling, up to 10 minutes).
6. **Reconcile.** It re-reads the position after the fill. dreamDEX has no reduce-only flag, so if a race flipped the position, Hoax undoes its own overshoot at once (never more than it filled, so a trader who reversed on purpose keeps their position), checks the result on chain, and pauses the account until the trader confirms. If the flatten does not fill, the receipt and the alert say so and ask the trader to close it.
7. **Prove.** Every action gets a receipt: the network, health before and after, size closed, average fill, cost paid, estimated liquidation cost, liquidation price before and after, and tx links. It is signed (EIP-191) by the account's Hoax key and never changed afterwards. For 24 hours Hoax watches the mark: if it reaches the old liquidation price while the reduced position survives (checked against the chain's own liquidation log, not just Hoax's records), the action becomes **saved** with the equity preserved. Otherwise it is **not needed** and its cost is shown as the price of insurance. The outcome is a second record, signed by the same key, that names the receipt by its hash. Misses (liquidations Hoax could not prevent on a market it protects) are recorded and shown too; the liquidation scan keeps its place in the database, so a restart or an outage never skips one.

   Equity preserved is an upper bound: it compares with a liquidation of the whole position at the old liquidation price, while dreamDEX liquidates in steps and can stop early. Every page that shows it says so.

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

`DRY_RUN=true` makes the watcher decide and log without sending anything on chain (no orders, no gas). `HOAX_DEMO=1 npm run web` runs the web app with no database or watcher: receipts and stats are sample data and the engine shows offline, while markets and connected wallets are still read live from chain. A production web app needs `HOAX_SESSION_SECRET` (32+ chars), `DATABASE_URL` and its site address in `HOAX_SITE_HOSTS` (Netlify's and Vercel's own URLs are added at build time); without them it refuses rather than run half-configured. The watcher needs `DATABASE_URL` (`HOAX_ALLOW_MEMORY_STORE=1` runs it in memory, for development). Every variable is in `.env.example`.

To protect a wallet: open `/start`, connect the wallet you trade dreamDEX perps with, sign the free sign-in message, then on step 02 press **Link Hoax · one transaction**. Step 03 tops the key up with STT (the watcher's gas wallet does it automatically when configured), step 04 sets the policy. Revoke from Settings with one more transaction, or remove the bot in dreamDEX.

### The engine on a real position

`spike/10-engine-fork.ts` runs the real engine against a real trader's dreamDEX account on an Anvil fork of Hideki: one tick sized a 0.05374 BTC close, sent it through `placeOrderFor` from the Hoax key, filled it against the forked book, reconciled, and signed the receipt (health 3.071 → 3.595, target 3.58). With `NETWORK=shannon` it does the same on a fork of Shannon: a real Safe linked on all 24 Shannon perp pools in one transaction, then 0.1 SOL closed, health 3.2 → 6.39. See `spike/README.md`.

### End to end on a fork

`e2e/onboarding.ts` drives the real web app with a scripted wallet against a local Anvil fork of Hideki, with the real watcher running: a fresh wallet gets a dreamDEX Safe, connects, signs in, receives its key, links 21 markets in one transaction, is activated by the watcher, gets gas, sets a policy and revokes. See `e2e/README.md`.

### Tests and checks

```sh
npm test                                         # 74 unit and end-to-end tests
TEST_DATABASE_URL=postgres://… npm test          # also runs the store contract against Postgres
npm run typecheck
npm run build -w @hoax/web
```

The watcher's end-to-end tests drive the real engine against `SimVenue`: onboarding and link detection, a save confirmed by the counterfactual tracker, a close marked not-needed after 24 hours, a flip under a race (flattened, account paused), a stale mark, a pause, a price gap straight through to liquidation (one missed receipt per episode), a book with nothing inside max slippage, the gas-drip caps, an order whose receipt is lost (confirmed on the next tick, never sent twice), an order that never lands, a reverting order (backed off, not resent every second), a restart (cooldown and liquidation cursor kept), a trader reversing by hand during a close (only Hoax's overshoot undone), a flatten that does not fill, the builder fee, a liquidation the engine has not scanned yet (never credited as a save), signed outcome records, gas reservations under concurrency and lost receipts, per-account scheduling with a hung account, the health status, a draining shutdown, the dry run and the keystore. The store contract (both backends) covers registration races, action upserts, gas reservations, rate limits and session revocation.

## Deploy

- **Engines and Postgres on a server.** `deploy/vps-setup.sh` runs `docker-compose.yml`: Postgres 16 (TLS only, with a self-signed certificate) and one engine per network, Hideki and Shannon, sharing the database, the keystore volume and the gas wallet. The engines run the migrations on start. See [deploy/README.md](deploy/README.md).
- **Web on Netlify.** `netlify.toml` builds `apps/web` with the Next.js runtime. Set `DATABASE_URL` and `DATABASE_CA_CERT` (both printed by the setup script; the second pins the database's certificate), `HOAX_SESSION_SECRET`, `HOAX_SITE_HOSTS` for a custom domain, and `HOAX_BUILDER_ADDRESS` / `HOAX_BUILDER_FEE_BPS_1K` if a fee is charged.
- Other hosts still work but are not what runs: `railway.toml` builds the same engine image (one network per service, a volume at `/data`), and `apps/web/vercel.json` deploys the web app to Vercel.

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

- Without Hoax: liquidated in 5 steps, ending with 70.89 USDso.
- With Hoax: two closes (0.24 ETH, then 0.20 ETH after the cooldown) for 0.15 USDso in total. It survived with 86.00 USDso, **15.11 USDso more**. The first receipt resolved as saved, with up to 35.76 USDso preserved: the upper bound against a full liquidation, more than the 15.11 the twin actually lost here because its liquidation stopped after five steps.

The numbers move with the book and mark read at the time; these are from a run on 2026-10-24.

`npx tsx demo/record.ts` records a real mark path and book for `PATH_FILE=… npm run replay`. The live segment of the demo is a real testnet account set near its trigger. See [demo/README.md](demo/README.md).

## Security and trust

- Hoax can never withdraw or transfer a trader's funds. A linked key can only place orders for the account, and every fill settles to the account. A leaked key is still dangerous: it could place orders at any price, including against an attacker's resting orders at off-market prices, which moves value out through the book. The engine never does this (IOC only, inside max slippage), the key never leaves the watcher, and the trader revokes it by unlinking the bot in dreamDEX or from Settings.
- One key per account, generated by the watcher and stored AES-256-GCM-encrypted in its keystore volume, under a key derived from the keystore secret with scrypt and a salt per file. Keys are never in the database and never shared between accounts. The engine runs as an unprivileged user.
- Every order is IOC, sized from a fresh read, capped per action, and inside max slippage. Hoax's own overshoot after a flip is flattened and the account paused. Only one engine per network can trade: a lease in Postgres makes a second one exit.
- Hoax fails closed: no order on a stale mark or after a read error. Repeated read failures alert the trader.
- Fees come only from the on-chain approval and the pool's cap, and are shown on every receipt. Paper USDso accounts are never charged.
- Gas drips go only to keys with a confirmed link, under per-key and per-network daily caps, reserved in the database before they are sent so they hold across processes and lost receipts.
- Management: the trader signs in with their wallet (a free signed message, bound to this site's address and checked on the wallet's own network; each message works once). Sessions last a day, are bound to the network for a smart wallet, and "Sign out everywhere" ends them all. Every change is checked on chain, fresh, against the owners of the dreamDEX Safe; trigger levels and alerts are shown to the owner only. A registration only becomes active when its owner links the Hoax key, which nobody else can do; a bare wallet needs margin on dreamDEX to register. Registrations and sign-ins are rate-limited per address, per wallet and overall, counted in the database; read endpoints are limited per instance. Pages that ask a wallet to sign cannot be framed.
- The web app reaches Postgres over TLS only and trusts exactly one certificate, the database's own (`DATABASE_CA_CERT`); a production web app refuses a remote Postgres without it. Postgres accepts only TLS, only the `hoax` user and database, with SCRAM. Its port is public because Netlify has no fixed addresses: see [deploy/README.md](deploy/README.md) for keeping it private.
- Vulnerabilities found in dreamDEX contracts go privately to security@dreamdex.io, not into this repo.

## Where v1 differs from the spec

- **Plain SQL over `pg` instead of Prisma.** It is the same tables; the store is an interface with Postgres and in-memory backends, so tests and the replay run without a database.
- **No on-chain `HoaxHandler`.** Spike 1b and 7 were not passed, so the spec's fallback applies: an off-chain watcher with a bot key.
- **Event push uses `eth_subscribe` logs** for `PositionUpdated` and `PositionLiquidated`, with the 1-second clock as the backbone.
- **Management is by wallet sign-in, not by the account's own signature.** dreamDEX accounts are Safes that a browser wallet does not sign for directly, so the wallet signs in and Hoax checks on chain that it owns the Safe. Linking the key is the proof of control that activates protection.
- **Equity preserved does not subtract the close cost a second time.** The cost was already paid out of the equity being compared. It is an upper bound (see Prove, above).

## Public API

Receipts are public: anyone can fetch one and re-check it.

- `GET /api/actions?owner=&chain=&limit=` receipts, newest first, each with its counterfactual.
- `GET /api/actions/<id>` one receipt with both signature checks (the receipt, and its outcome record).
- `GET /api/stats` the track record. `GET /api/markets?chain=` live marks. `GET /api/engine` whether each network's engine is alive.

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

Apache-2.0. See [LICENSE](LICENSE).
