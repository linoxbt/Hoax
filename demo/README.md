# Demo

The 3-minute video shows one real save on testnet and one controlled comparison, and every number on screen links to a transaction or a read.

## The controlled comparison (replay)

Spike 6 found that the liquidation mark follows the index feed, so a liquidation cannot be staged by trading on the book. The comparison therefore runs as a replay:

```sh
npm run replay                                   # synthetic 4.5% drop from today's mark
npx tsx demo/record.ts                           # or record a real path (MINUTES=10)
PATH_FILE=demo/paths/ETH-PERP-….json npm run replay
```

The real Hoax engine runs on two identical accounts against `SimVenue`, using dreamDEX's market and liquidation parameters and the ETH book shape read from Hideki. The result goes to `apps/web/public/replay.json` and shows at `/replay`.

## The live segment

1. Link a Hoax key to a spare wallet and open a small leveraged ETH-PERP position.
2. Set a policy whose trigger sits just under the current health (for example 0.05 below).
3. Record until the mark moves the account through the trigger. Hoax closes a slice and the receipt appears at `/app/receipts`.

## Script

| Time | On screen | Point |
|---|---|---|
| 0:00–0:20 | A liquidation receipt from dreamDEX testnet | Liquidation is the worst exit in perps |
| 0:20–0:50 | `/start`: link the Hoax key, set trigger 1.25 and target 1.60 | Hoax can trade your account but never withdraw |
| 0:50–1:40 | `/replay`: same position, same path; left liquidated, right sheds a slice and survives | Same market, same moment, two outcomes |
| 1:40–2:10 | The saved receipt: health before and after, cost, liquidation cost avoided, tx links | Every save is provable |
| 2:10–2:40 | Live testnet run: a real position crosses the trigger, Hoax closes a slice, the receipt appears | This is running on dreamDEX now |
| 2:40–3:00 | `/stats`: saved equity next to insurance cost, plus misses | We show the misses too |

Rules: never say "saved X%" without the counterfactual method on screen; show the cost of every close; label the replay as a replay.
