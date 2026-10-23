// Spike 6 (read-only): does trading on the book move the mark used for
// liquidation, or only the index feed? Samples mark, index and book mid.
// The answer decides how the demo is staged.
//   MARKET=ETH-PERP DURATION_S=120 npm run spike -- 06-mark-source
import { Evidence, market, sleep, venue } from "./lib.ts";
import { SomniaMarkets, SOMNIA_HIDEKI_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";

const ev = new Evidence("06-mark-source");
const m = await market();
const ex = new SomniaMarkets({ chain: hidekiTestnet, indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql", addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES });
const durationMs = Number(process.env.DURATION_S ?? "120") * 1000;
const end = Date.now() + durationMs;
type S = { t: number; mark: bigint; index: bigint; mid: bigint };
const samples: S[] = [];
while (Date.now() < end) {
  const t = Date.now();
  const [state, book] = await Promise.all([ex.client.getPerpState(m.pool), venue.readBook(m, 1)]);
  const mid = book.bids[0] && book.asks[0] ? (book.bids[0].price + book.asks[0].price) / 2n : 0n;
  samples.push({ t, mark: state.markPrice, index: state.indexPrice, mid });
  await sleep(Math.max(0, 500 - (Date.now() - t)));
}
let markMoves = 0;
let withIndex = 0;
let withMidOnly = 0;
for (let i = 1; i < samples.length; i++) {
  const a = samples[i - 1];
  const b = samples[i];
  if (b.mark === a.mark) continue;
  markMoves++;
  if (b.index !== a.index) withIndex++;
  else if (b.mid !== a.mid) withMidOnly++;
}
const bps = (x: bigint, y: bigint) => (y > 0n ? Number(((x - y) * 1_000_000n) / y) / 100 : 0);
const markVsIndex = samples.map((s) => Math.abs(bps(s.mark, s.index)));
const markVsMid = samples.filter((s) => s.mid > 0n).map((s) => Math.abs(bps(s.mark, s.mid)));
const avg = (xs: number[]) => (xs.length ? xs.reduce((p, q) => p + q, 0) / xs.length : 0);
ev.log("samples", { n: samples.length, markMoves, movesWithIndexMove: withIndex, movesWithOnlyBookMove: withMidOnly, avgMarkIndexBps: avg(markVsIndex), avgMarkMidBps: avg(markVsMid) });
for (const s of samples.filter((_, i) => i % 10 === 0)) ev.log("sample", s);
const indexDriven = markMoves > 0 && withIndex / markMoves >= 0.8;
await ex.close();
await ev.finish({
  pass: null,
  summary: indexDriven
    ? `mark follows the index feed (${withIndex}/${markMoves} mark moves came with an index move): book trades do not move the liquidation mark, so the demo comparison runs as a replay`
    : `mark moved ${markMoves} times, ${withIndex} with the index and ${withMidOnly} with only the book: inspect the evidence before staging a live liquidation`,
  indexDriven,
});
process.exit(0);
