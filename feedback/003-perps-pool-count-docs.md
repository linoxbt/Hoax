# PERPS.md describes 10 testnet perp pools with four restricted; Hideki has 21, none restricted

Severity: normal
Area: docs

## Steps to reproduce

1. Read `docs/PERPS.md` in `@somnia-chain/markets-sdk@0.32.1`, under "Market discovery is a chain read": "Testnet today has 10 pools, four of them restricted `SBTC*` arena markets."
2. Run:

```ts
const statuses = await exchange.client.listPerpPoolStatuses({ factory: "0xE631fAEE547baeE07353E290f0562ea67d856560" });
console.log(statuses.length, statuses.filter((s) => s.restricted).length, statuses.filter((s) => s.tradeable).length);
```

## Expected

The documented testnet pool set matches the chain, or the sentence is dated.

## Actual

21 pools, 0 restricted, 21 tradeable. There are no `SBTC*` arena markets on Hideki 2. A reader sizing a market list or a restricted-market check from the docs gets the wrong picture.

## Evidence

`listPerpPoolStatuses` on 2026-10-23: `pools 21 restricted 0 tradeable 21`. `listPerpMarkets()` also returns 21 markets (ZRO, LIT, VVV, 1000PEPE, PUMP, ZEC, TAO, WLD, NEAR, XLM, AVAX, LINK, SUI, ADA, BNB, DOGE, XRP, HYPE, SOL, ETH, BTC).

## Environment

@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet (Hideki 2, chain 50383), read-only (no wallet).
