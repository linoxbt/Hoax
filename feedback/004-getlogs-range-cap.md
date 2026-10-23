# Hideki RPC caps eth_getLogs at a 1000-block span, undocumented, with a generic -1 error

Severity: normal
Area: API

## Steps to reproduce

```ts
const head = await publicClient.getBlockNumber();
const address = "0x478769E1177C0773c43A593DCCc4Ad15F15F1394"; // MarginBank
await publicClient.getLogs({ address, fromBlock: head - 1000n, toBlock: head }); // ok
await publicClient.getLogs({ address, fromBlock: head - 1001n, toBlock: head }); // fails
```

## Expected

Either a larger range, or the cap documented on "Perps on Testnet for Developers" (which tells bots to read `PositionUpdated` / `PositionLiquidated` events) with a standard limit error code so clients can split the range automatically.

## Actual

Any query with `toBlock - fromBlock > 1000` fails with JSON-RPC `{ code: -1, message: "block range exceeds 1000" }`. At Hideki's 100 ms blocks that is 100 s of history per call, so backfilling a day of liquidations for one account takes 864 calls. The cap is not mentioned in the developer page or the SDK docs, and code `-1` is not one of the usual limit codes (`-32005`) that viem and other clients recognise.

## Evidence

On 2026-10-23 at head 30976664: span 1000 ok, span 1001 / 1002 / 1500 `block range exceeds 1000`, span 5000 (fromBlock 0x1d87090, toBlock 0x1d88418) `block range exceeds 1000`.

## Environment

viem 2.x against https://api.hideki2.infra.testnet.somnia.network, Somnia Tokyo testnet (Hideki 2, chain 50383), read-only (no wallet).
