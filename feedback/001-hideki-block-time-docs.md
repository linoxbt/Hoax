# SDK docs give Hideki a 10 ms block time; the chain produces 100 ms blocks

Severity: normal
Area: docs

## Steps to reproduce

1. Read `docs/CHAINS.md` in `@somnia-chain/markets-sdk@0.32.1` (the chain table lists `hidekiTestnet | 50383 | STT | **10 ms**`), and `docs/reference/networks-and-endpoints.md` (also 10 ms). `CHAINS.md` adds "Hideki is the low-latency Tokyo network — ~100 blocks/s".
2. Read two block timestamps 100,000 blocks apart on `https://api.hideki2.infra.testnet.somnia.network`:

```ts
const head = await publicClient.getBlockNumber();
const [a, b] = await Promise.all([
  publicClient.getBlock({ blockNumber: head - 100_000n }),
  publicClient.getBlock({ blockNumber: head }),
]);
console.log(Number(b.timestamp - a.timestamp) / 100_000); // seconds per block
```

## Expected

About 0.01 s per block (10 ms, ~100 blocks/s), as documented.

## Actual

0.1 s per block: 100,000 blocks span 10,005 s; 10,000 blocks span 1,000 s. Hideki runs at about 10 blocks/s, ten times slower than the docs say.

This matters for anything sized in blocks: a 1,000-block `eth_getLogs` window (the RPC's cap, see 004) is 100 s, not 10 s, and latency budgets that assume 10 ms blocks are off by 10x.

## Evidence

Measured at head block 30976825 on 2026-10-23: `10000 blocks over 1000 s => 100.0 ms per block`, `100000 blocks over 10005 s => 100.0 ms per block`.

## Environment

@somnia-chain/markets-sdk 0.32.1, viem 2.x, Somnia Tokyo testnet (Hideki 2, chain 50383), read-only (no wallet).
