// Record a market's mark path and book shape from Hideki, for the replay.
//   MARKET=ETH-PERP MINUTES=10 npx tsx demo/record.ts
import { writeFileSync } from "node:fs";
import { DreamDexVenue } from "@hoax/chain";

const venue = new DreamDexVenue();
const symbol = process.env.MARKET ?? "ETH-PERP";
const minutes = Number(process.env.MINUTES ?? "10");
const m = (await venue.listMarkets()).find((x) => x.symbol === symbol);
if (!m) throw new Error(`no market ${symbol}`);

const book = await venue.readBook(m, 40);
const feed = await venue.readFeed(m);
const bps = (p: bigint) => Number(((p > feed.markPrice ? p - feed.markPrice : feed.markPrice - p) * 1_000_000n) / feed.markPrice) / 100;
const shape = {
  bids: book.bids.map((l) => ({ offsetBps: bps(l.price), quantity: l.quantity.toString() })),
  asks: book.asks.map((l) => ({ offsetBps: bps(l.price), quantity: l.quantity.toString() })),
};
const path: Array<{ t: number; mark: string }> = [];
const end = Date.now() + minutes * 60_000;
while (Date.now() < end) {
  const f = await venue.readFeed(m);
  if (f.markOk) path.push({ t: Date.now(), mark: f.markPrice.toString() });
  await new Promise((r) => setTimeout(r, 1000));
}
const file = `demo/paths/${symbol}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
writeFileSync(file, JSON.stringify({ market: symbol, recordedAt: new Date().toISOString(), block: book.blockNumber.toString(), shape, path }, null, 2));
console.log(`recorded ${path.length} marks and a ${book.bids.length}+${book.asks.length} level book to ${file}`);
await venue.close();
process.exit(0);
