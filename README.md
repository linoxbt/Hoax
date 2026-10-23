# Hoax

Hoax watches a dreamDEX perp account on Somnia Tokyo testnet (Hideki, chain id 50383). When the account gets close to liquidation, Hoax closes just enough of the position to bring health back to a safe level. It acts only when that close costs less than the liquidation it prevents. It runs as a linked trade-only bot, so it can place and cancel orders but never withdraw, and every save gets an on-chain receipt.

Built for the [dreamDEX Perps Builder Bounty](https://dorahacks.io/hackathon/dreamdex-perps-bounty/detail), MVP track.

## Status

Spike tests: checking what the dreamDEX perps API and `@somnia-chain/markets-sdk` support before writing product code.

| Spike | What it checks | Status |
| --- | --- | --- |
| 01 health read | List perp markets, mark feed status, account health and liquidation price | Works on testnet |

## Run

Needs Node 20 or later.

```sh
npm install
npm run spike:health                       # markets and mark feeds
ACCOUNT=0xYourAddress npm run spike:health # plus that account's health
```

Spike 01 is read-only: it needs no private key and signs nothing.
