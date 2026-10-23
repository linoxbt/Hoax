# CHAINS.md says Hideki's Multicall3 is not at the canonical address; the chain and the SDK say it is

Severity: normal
Area: docs

## Steps to reproduce

1. Read `docs/CHAINS.md` in `@somnia-chain/markets-sdk@0.32.1`: "Mainnet, Shannon and Hideki each have their own Multicall3 deployment at different addresses (`0x5e44…5a11`, `0x841b…4223` and `0x540B…D131`)" and "`0xcA11bde0…` is unreachable for good".
2. Read `hidekiTestnet.contracts.multicall3` from `@somnia-chain/markets-sdk/chains`.
3. `eth_getCode` at `0xcA11bde05977b3631167028862bE2a173976CA11` on Hideki.

## Expected

The docs, the chain definition and the chain agree on Hideki's Multicall3 address.

## Actual

- The SDK's own `hidekiTestnet` definition uses `0xcA11bde05977b3631167028862bE2a173976CA11` (`blockCreated: 1`).
- That address holds 3,808 bytes of code on Hideki.
- `docs/reference/networks-and-endpoints.md` agrees ("Hideki `0xcA11…CA11` (the canonical address; v2 predeploys it)").
- Only `CHAINS.md` still says Hideki uses `0x540B…D131` and that the canonical address is unreachable. It reads as written for Hideki 1, before the 2026-09-17 regenesis.

## Evidence

`getCode(0xcA11bde05977b3631167028862bE2a173976CA11)` returned 3,808 bytes on 2026-10-23 (head ~30976500). `hidekiTestnet.contracts` = `{"multicall3":{"address":"0xcA11bde05977b3631167028862bE2a173976CA11","blockCreated":1}}`.

## Environment

@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet (Hideki 2, chain 50383), read-only (no wallet).
