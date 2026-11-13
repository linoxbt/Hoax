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

## Suggested fix

- Return every market when no `limit` is given (the full list is 60 rows), or page internally until the indexer runs out.
- If a default limit stays, document it in `PERPS.md` next to the example, and return the total (or a `hasMore` flag) so callers can tell.
- Order by symbol or creation ascending, so a truncated list loses the newest markets, not the original ones.
