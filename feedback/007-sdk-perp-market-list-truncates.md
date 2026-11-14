# `listPerpMarkets()` stops at 50 markets on Hideki, newest first, so BTC, ETH and SOL drop out

Severity: major
Area: SDK

## Steps to reproduce

```ts
import { SomniaMarketsClient } from "@somnia-chain/markets-sdk"; // 0.32.1

const all = await hidekiClient.listPerpMarkets();             // no options
const full = await hidekiClient.listPerpMarkets({ limit: 500 });

all.length;   // 50
full.length;  // 60
["BTC", "ETH", "SOL"].map((s) => all.some((m) => m.baseSymbol === s));   // [false, false, false]
["BTC", "ETH", "SOL"].map((s) => full.some((m) => m.baseSymbol === s));  // [true, true, true]
```

Run on 2026-11-13 against `https://hideki-dev.smk.somnia.host/v1/graphql`. Shannon has 24 perp markets, so the same call there returns everything and the problem stays hidden.

## Expected

A call with no filter that is named "list perp markets" returns every perp market, or makes it obvious that it did not. Its result is what an app builds its market list from, and what a bot iterates to find the positions it manages.

## Actual

The default `limit` is 50 and the order is newest first. On Hideki that cuts off the 10 oldest markets, and those include the original majors: BTC-PERP, ETH-PERP and SOL-PERP. They are also where liquidations concentrate: in the 7 days to 2026-11-13, the engine closed 401 BTC, ETH and SOL positions, across Hideki's 767 liquidations (dreamDEX's markets indexer, test pools excluded). Nothing in the result says it was cut short. There is no total, no cursor, no `offset` option, and no warning.

The 50 is stated only in the type's JSDoc (`limit` (max rows, default 50)). `docs/PERPS.md` shows `listPerpMarkets({ baseSymbol: "WBTC", limit: 20 })` and describes only the filters, not the default.

Hoax hit this in production. Its Tokyo engine listed markets with `listPerpMarkets()`, so it never watched BTC, ETH or SOL positions, and its link transaction never granted the bot key on those three pools. The fix on our side is one argument (`{ limit: 500 }`), plus a warning when the page comes back full.

## Evidence

Run on 2026-11-14 06:08 UTC through the SDK client (`new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", ... }).client`):

```
listPerpMarkets()               → 50 markets
listPerpMarkets({ limit: 500 }) → 60 markets
missing from the default list (base symbol, pool):
  LINK  0xf71b619450bafe953f47b9b556416a3a67b443b5
  SUI   0x1be21287cfb865a7c462ff3c4f275e70bcccefe4
  ADA   0x34fa62909f77699a7a6278d992f72ff31c7a619d
  BNB   0x3d2a99fe1e2bdeaa25024515a2d2202daf9531ad
  DOGE  0xc410012e39765cd5f772e84bacb19554aec040df
  XRP   0x7058579f3248559963f79adb937c6de9f953e060
  HYPE  0x63b47ed4a7de0fde659b0d82441dd74828b7297a
  SOL   0xb483ec1fb34996638677c20ab087b16f1896fa53
  ETH   0xd6cb1dd58580b84d76068ac21594219ce03aeddf
  BTC   0x4181dd08e73bbcdd1ba3e615a18f6abd941b94c0
```

Hoax's fix and its warning when the page comes back full: `packages/chain/src/dreamdex.ts`, `listMarkets()`.

## Environment

`@somnia-chain/markets-sdk@0.32.1`, viem 2.x, Node 22. Somnia Tokyo testnet (Hideki 2, chain 50383), markets indexer `https://hideki-dev.smk.somnia.host/v1/graphql`. Read-only calls: no wallet involved.

## Suggested fix

- Return every market when no `limit` is given (the full list is 60 rows), or page internally until the indexer runs out.
- If a default limit stays, document it in `PERPS.md` next to the example, and return the total (or a `hasMore` flag) so callers can tell.
- Order by symbol or creation ascending, so a truncated list loses the newest markets, not the original ones.
