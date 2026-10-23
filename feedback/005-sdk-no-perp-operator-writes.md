# The SDK has no perp writes for a linked bot (placeOrderFor, cancelOrderFor, reduceOrderFor)

Severity: normal
Area: SDK

## Steps to reproduce

1. Link a bot key to a wallet in the app (wallet, Link a bot, Perps). The app grants the key `placeOrderFor`, `cancelOrderFor` and `reduceOrderFor` on every perp pool.
2. Look for a way to place a perp order for that wallet with `@somnia-chain/markets-sdk@0.32.1`: `trader.placePerpOrder` places for the signer only, `buildPlacePerpOrder` builds `placeOrder`, and `perpPoolWriteAbi` contains only `placeOrder`, `cancelOrder`, `updateFunding` and `marginBank`. Only binary pools have `placeBinaryOrderFor`.

## Expected

A trader bound to a bot key that can act for an owner, e.g. `trader.placePerpOrder({ pool, owner, ... })` / `cancelOrder({ pool, owner, orderId })`, or at least the three `...For` functions in `perpPoolWriteAbi`, decoded the same way as `placeOrder`.

## Actual

Every bot that uses Link a bot has to hand-write the ABI and selectors. The official bot kit does exactly that in `packages/perp-core/src/operator.ts` ("The markets SDK has no perp `…For` writes, so the three calls are sent here with viem"), and so does this project. Hand-written ABIs drift silently when the pool changes, and each bot re-learns the gas and IOC-revert gotchas the developer page lists.

## Evidence

`grep -c placeOrderFor` over `dist/tradeAbi.d.ts` = 0; `perpPoolWriteAbi` function names: `placeOrder`, `cancelOrder`, `updateFunding`, `marginBank`. Bot kit: https://github.com/somnia-chain/dreamdex-bot-kit/blob/main/packages/perp-core/src/operator.ts

## Environment

@somnia-chain/markets-sdk 0.32.1, Somnia Tokyo testnet (Hideki 2, chain 50383).
