# USDso cannot be bridged from Shannon to Hideki: the router's hook reverts every quote and transfer

Severity: major
Area: contracts

## Steps to reproduce

```ts
import { BridgeToken, ChainId, createBridgeTransfer, sendBridgeStep } from "@somnia-chain/markets-sdk/chains";

const plan = createBridgeTransfer({
  token: BridgeToken.USDso,
  from: ChainId.somniaShannon,
  to: ChainId.hidekiTestnet,
  amount: 100n * 10n ** 18n,
  recipient: account.address,
});
await sendBridgeStep(shannonClient, plan.approveStep!, { account }); // succeeds
await sendBridgeStep(shannonClient, plan.bridgeStep, { account });   // reverts
```

The same failure can be seen without sending anything. Read `quoteTransferRemote(50383, recipient, 1e18)` on the Shannon USDso router `0x94E2E7f4B2B0a8E3032c7D3ff3c86790BB5979E6`: it reverts.

## Expected

The docs ("Networks and endpoints", "Testnet tokens") say USDso on Hideki "cannot be minted" and is obtained with "Bridge from Shannon". Hideki perps settle in that USDso, so this bridge is the only documented way to fund a Hideki perp account from a wallet outside Perps Arena. It should deliver USDso on Hideki in seconds, as the STT route does.

## Actual

`transferRemote` reverts on Shannon with no reason string, after the approval has already gone through. `eth_call` of the same step also reverts with no reason, with `msg.value` of 0, 0.01, 0.1, 0.5 and 1 STT and amounts of 1 or 100 USDso. Nothing is delivered on Hideki.

Here is how the two Shannon routers on the same lane differ:

| Router | Model | `hook()` | `quoteTransferRemote(50383, …)` | Transfer |
|---|---|---|---|---|
| STT `0x67CD0778A719099DAF2D346aD0Db0d9E6FF6674C` | native | `0x0` (mailbox default) | ok, fee 0 | delivered in ~5 s |
| USDso `0x94E2E7f4B2B0a8E3032c7D3ff3c86790BB5979E6` | collateral | `0xF11C364Da4B5e22b3040be8EA77DccDBfD1277De` | reverts | reverts |

Both routers share the mailbox (`0xF805734aAC42cf238eAef9E905e3A04F2Ab554f9`) and owner (`0x6ba08d7F0da8875218fD688f862Aa8Ab827D4FfB`). The USDso router's remote router for 50383 is the documented Hideki USDso (`0xed7993A74dAe1e6656B704A424DcD8711aAf4F72`), and its `wrappedToken()` is Shannon USDso. The custom hook is the only difference, and every quote through it reverts. Either the hook is misconfigured for the Hideki 2 lane, or it is meant to restrict USDso. If it is a restriction, the docs and the SDK (`exchange.bridge`, `ensureFunds`, `createOrder(…, { funding: "auto" })`) should say so and fail with a reason. Today they fail blind.

## Evidence

- Approve (success): `0x87c5261288587196ce5248fc488626763fd2a2c74eeb3fa42cbe5549e72c1496`
- Bridge (reverted, 213,551 gas): `0x8dd5e9816232479dbfbdc4ec175658a853e8267e3c786df67a6c80a410871b07`
- For contrast, an STT bridge on the same lane the day before, delivered in ~5 s: `0x56ee37d6658ca252f70287d0d20a4acb7678aee7344df3bded343dfda2e7e4da`
- At the time: wallet USDso balance 140, allowance to the router 100.

## Environment

`@somnia-chain/markets-sdk@0.32.1`, viem 2.x. Shannon (50312) → Somnia Tokyo testnet (Hideki 2, 50383), 2026-10-28. Wallet `0xFB9bf638d05d480A68093AEb0be3A31A6E62143b`, a fresh test wallet that is not in Perps Arena.
