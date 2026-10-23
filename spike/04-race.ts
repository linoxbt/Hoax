// Spike 4: no flip under races. Each round, the Hoax key and a rival bot key
// close on the same position in the same moment. Hoax sizes from a fresh read,
// sends IOC only, reconciles, and flattens any flip. Pass: zero rounds end on
// the opposite side.
//
// Sends real orders and uses up the position. Needs two keys linked to the
// same wallet and a position of several minimums:
//   OWNER_ADDRESS=0x… BOT_PRIVATE_KEY=0x… RIVAL_PRIVATE_KEY=0x… ROUNDS=50 CONFIRM=yes npm run spike -- 04-race
import { abs, clampClose, limitPrice, reconcile } from "@hoax/core";
import { Evidence, keyFromEnv, market, ownerFromEnv, venue } from "./lib.ts";

const ev = new Evidence("04-race");
const owner = ownerFromEnv();
const hoax = keyFromEnv("BOT_PRIVATE_KEY");
const rival = keyFromEnv("RIVAL_PRIVATE_KEY");
const m = await market();
const rounds = Number(process.env.ROUNDS ?? "50");
for (const k of [hoax, rival]) {
  if (!(await venue.isLinked(m, owner, k.address))) {
    await ev.finish({ pass: null, summary: `${k.address} is not linked to ${owner}` });
    process.exit(2);
  }
}
if (process.env.CONFIRM !== "yes") {
  await ev.finish({ pass: null, summary: "dry run: set CONFIRM=yes to send orders" });
  process.exit(0);
}

let flippedAtEnd = 0;
let ran = 0;
for (let i = 0; i < rounds; i++) {
  const pos = await venue.readPosition(m, owner);
  if (abs(pos.size) < 3n * m.minQuantity) {
    ev.log("stop", { reason: "position under 3 minimums; reopen it to continue", size: pos.size });
    break;
  }
  const feed = await venue.readFeed(m);
  const isBid = pos.size < 0n;
  const price = limitPrice(feed.markPrice, isBid, 50, m.tickSize);
  // Hoax asks for 2 minimums from its fresh read; the rival takes 1 at the same moment.
  const want = clampClose(2n * m.minQuantity, pos.size);
  const [h, r] = await Promise.allSettled([
    venue.placeIocFor(hoax, owner, m, { isBid, price, quantity: want, builder: null, builderFeeBpsTimes1k: 0n }),
    venue.placeIocFor(rival, owner, m, { isBid, price, quantity: m.minQuantity, builder: null, builderFeeBpsTimes1k: 0n }),
  ]);
  const filled = h.status === "fulfilled" ? h.value.fills.reduce((s, f) => s + f.quantity, 0n) : 0n;
  const after = await venue.readPosition(m, owner);
  const rec = reconcile({ sizeBefore: pos.size, requested: want, filled, sizeAfter: after.size });
  let final = after.size;
  if (rec.status === "flipped") {
    await venue.placeIocFor(hoax, owner, m, {
      isBid: after.size < 0n,
      price: limitPrice(feed.markPrice, after.size < 0n, 100, m.tickSize),
      quantity: rec.flipAmount,
      builder: null,
      builderFeeBpsTimes1k: 0n,
    });
    final = (await venue.readPosition(m, owner)).size;
  }
  const wrongSide = final !== 0n && (final > 0n) !== (pos.size > 0n);
  if (wrongSide) flippedAtEnd++;
  ran++;
  ev.log("round", {
    i,
    sizeBefore: pos.size,
    hoaxTx: h.status === "fulfilled" ? h.value.hash : String(h.reason).slice(0, 120),
    rivalTx: r.status === "fulfilled" ? r.value.hash : String(r.reason).slice(0, 120),
    filled,
    sizeAfter: after.size,
    status: rec.status,
    final,
    wrongSide,
  });
}
await ev.finish({
  pass: ran > 0 ? flippedAtEnd === 0 : null,
  summary: `${ran} racing rounds, ${flippedAtEnd} ended on the opposite side`,
});
process.exit(0);
