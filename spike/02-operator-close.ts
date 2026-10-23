// Spikes 1 and 2: a linked bot key closes part of the owner's position with
// placeOrderFor, the fill lands in the owner's account, and health moves the
// way the sizing formula says it will.
//
// Sends a real order. Needs a wallet you linked the bot key to, with an open
// leveraged position larger than the market minimum:
//   OWNER_ADDRESS=0x… BOT_PRIVATE_KEY=0x… MARKET=ETH-PERP CONFIRM=yes npm run spike -- 02-operator-close
import { health, limitPrice, projectHealth, abs, notional, toFloat } from "@hoax/core";
import { Evidence, keyFromEnv, market, ownerFromEnv, venue } from "./lib.ts";

const ev = new Evidence("02-operator-close");
const owner = ownerFromEnv();
const key = keyFromEnv();
const m = await market();

const linked = await venue.isLinked(m, owner, key.address);
ev.log("link", { owner, operator: key.address, pool: m.pool, linked });
if (!linked) {
  await ev.finish({ pass: false, summary: "the bot key is not linked to this wallet on this market (spike 1 cannot run)" });
  process.exit(1);
}
const before = await venue.readMargin(m.marginBank, owner);
const pos = await venue.readPosition(m, owner);
const feed = await venue.readFeed(m);
ev.log("before", { block: before.blockNumber, equity: before.equity, mmReq: before.mmReq, size: pos.size, mark: feed.markPrice });
if (pos.size === 0n || abs(pos.size) < 2n * m.minQuantity) {
  await ev.finish({ pass: null, summary: `open a ${m.symbol} position of at least 2x the minimum (${m.minQuantity} raw) first` });
  process.exit(2);
}
if (process.env.CONFIRM !== "yes") {
  await ev.finish({ pass: null, summary: "dry run: set CONFIRM=yes to send the closing order" });
  process.exit(0);
}

const isBid = pos.size < 0n;
const qty = m.minQuantity;
const price = limitPrice(feed.markPrice, isBid, 50, m.tickSize);
const t0 = Date.now();
const result = await venue.placeIocFor(key, owner, m, { isBid, price, quantity: qty, builder: null, builderFeeBpsTimes1k: 0n });
ev.log("order", { tx: result.hash, block: result.blockNumber, fills: result.fills, noFill: result.noFill, ms: Date.now() - t0 });

const after = await venue.readMargin(m.marginBank, owner);
const posAfter = await venue.readPosition(m, owner);
const filled = result.fills.reduce((s, f) => s + f.quantity, 0n);
ev.log("after", { block: after.blockNumber, equity: after.equity, mmReq: after.mmReq, size: posAfter.size });

// Spike 1: the fill landed in the owner's account.
const moved = abs(pos.size) - abs(posAfter.size);
const spike1 = filled > 0n && moved === filled;

// Spike 2: health rose, and by what the formula predicts at the measured cost.
const oneBase = 10n ** BigInt(m.baseDecimals);
const slip = result.fills.reduce((s, f) => s + ((isBid ? f.price - feed.markPrice : feed.markPrice - f.price) * f.quantity) / oneBase, 0n);
const costRate = filled > 0n ? toFloat(slip) / toFloat(notional(filled, feed.markPrice, m.baseDecimals)) : 0;
const hBefore = health(before.equity, before.mmReq);
const hAfter = health(after.equity, after.mmReq);
const projected = projectHealth({ equity: before.equity, mmReq: before.mmReq, mark: feed.markPrice, market: m, costRate }, filled);
const relErr = Math.abs((hAfter - hBefore) - (projected - hBefore)) / Math.max(1e-9, Math.abs(projected - hBefore));
ev.log("health", { before: hBefore, after: hAfter, projected, costRate, relativeErrorOfChange: relErr });

await ev.finish({
  pass: spike1 && hAfter > hBefore && relErr <= 0.05,
  summary:
    `spike 1 ${spike1 ? "passed" : "failed"} (filled ${filled}, position moved ${moved}); ` +
    `spike 2: health ${hBefore.toFixed(4)} -> ${hAfter.toFixed(4)}, formula ${projected.toFixed(4)}, error of change ${(relErr * 100).toFixed(1)}% (pass <= 5%)`,
  tx: result.hash,
});
process.exit(0);
