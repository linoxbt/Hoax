// The demo's controlled comparison: two identical accounts, the same position,
// the same mark path. Hoax protects one; the other is left alone. The real
// watcher code (engine, sizing, cost gate, receipts, counterfactual) runs
// against the simulated venue, whose market and liquidation parameters and
// book shape are read from Hideki. This is a replay, and it says so: the live
// segment of the demo is a separate run on testnet.
//
//   npx tsx demo/replay.ts                         synthetic 4.5% drop from today's mark
//   PATH_FILE=demo/paths/ETH-PERP-….json npx tsx demo/replay.ts   a recorded path
//   DROP_PCT=6 COLLATERAL=150 SIZE=1 LIVE=0 npx tsx demo/replay.ts

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { DEFAULT_POLICY, fromFloat, toFloat } from "@hoax/core";
import { DreamDexVenue, SimVenue, type BookShapeLevel, type MarketInfo } from "@hoax/chain";
import { MemoryStore } from "@hoax/db";
import { CounterfactualTracker, DEFAULT_ENGINE_CONFIG, Engine, Linker, MemoryKeystore, silentLogger } from "@hoax/watcher";
import { getAddress, type Address } from "viem";

const E18 = 10n ** 18n;
const WITH: Address = getAddress("0x000000000000000000000000000000000000a11c");
const WITHOUT: Address = getAddress("0x000000000000000000000000000000000000b0b0");

interface PathFile {
  market: string;
  recordedAt: string;
  shape?: { bids: Array<{ offsetBps: number; quantity: string }>; asks: Array<{ offsetBps: number; quantity: string }> };
  path: Array<{ t: number; mark: string }>;
}

const FALLBACK_MARKET: MarketInfo = {
  symbol: "ETH-PERP",
  baseSymbol: "ETH",
  pool: getAddress("0xd6cb1dd58580b84d76068ac21594219ce03aeddf"),
  marginBank: getAddress("0x478769e1177c0773c43a593dccc4ad15f15f1394"),
  baseDecimals: 18,
  tickSize: 10n ** 16n,
  lotSize: 10n ** 14n,
  minQuantity: 4n * 10n ** 15n,
  maintenanceMarginBps: 250,
  takerFeeBpsTimes1k: 0,
};

async function loadLive(symbol: string) {
  if (process.env.LIVE === "0") return null;
  const live = new DreamDexVenue();
  try {
    const market = (await live.listMarkets()).find((m) => m.symbol === symbol);
    if (!market) return null;
    const [liquidation, feed, book] = await Promise.all([
      live.liquidationParams(market.marginBank),
      live.readFeed(market),
      live.readBook(market, 40),
    ]);
    const off = (p: bigint) => Number(((p > feed.markPrice ? p - feed.markPrice : feed.markPrice - p) * 1_000_000n) / feed.markPrice) / 100;
    const shape = {
      bids: book.bids.map((l) => ({ offsetBps: off(l.price), quantity: l.quantity })),
      asks: book.asks.map((l) => ({ offsetBps: off(l.price), quantity: l.quantity })),
    };
    return { market, liquidation, mark: feed.markPrice, shape, block: book.blockNumber };
  } finally {
    await live.close();
  }
}

function syntheticPath(start: bigint, dropPct: number): Array<{ t: number; mark: bigint }> {
  // 30 s flat, a 120 s slide to the low, 60 s at the low, 90 s of partial recovery.
  const out: Array<{ t: number; mark: bigint }> = [];
  const t0 = Date.UTC(2026, 9, 23, 12, 0, 0);
  const low = 1 - dropPct / 100;
  const at = (f: number) => (start * BigInt(Math.round(f * 1_000_000))) / 1_000_000n;
  let s = 0;
  for (let i = 0; i < 30; i++) out.push({ t: t0 + 1000 * s++, mark: start });
  for (let i = 1; i <= 120; i++) {
    const wobble = Math.sin(i / 3) * 0.0006;
    out.push({ t: t0 + 1000 * s++, mark: at(1 - (1 - low) * (i / 120) + wobble) });
  }
  for (let i = 0; i < 60; i++) out.push({ t: t0 + 1000 * s++, mark: at(low + Math.sin(i / 2) * 0.0004) });
  for (let i = 1; i <= 90; i++) out.push({ t: t0 + 1000 * s++, mark: at(low + (1 - low) * 0.6 * (i / 90)) });
  return out;
}

const pathFile = process.env.PATH_FILE ? (JSON.parse(readFileSync(process.env.PATH_FILE, "utf8")) as PathFile) : null;
const symbol = pathFile?.market ?? process.env.MARKET ?? "ETH-PERP";
const live = await loadLive(symbol);
const market = live?.market ?? FALLBACK_MARKET;
const liquidation = live?.liquidation ?? { penaltyBps: 100, minSpreadBps: 50 };
const shape: { bids: BookShapeLevel[]; asks: BookShapeLevel[] } | undefined = pathFile?.shape
  ? {
      bids: pathFile.shape.bids.map((l) => ({ offsetBps: l.offsetBps, quantity: BigInt(l.quantity) })),
      asks: pathFile.shape.asks.map((l) => ({ offsetBps: l.offsetBps, quantity: BigInt(l.quantity) })),
    }
  : live?.shape;

const path = pathFile
  ? pathFile.path.map((p) => ({ t: p.t, mark: BigInt(p.mark) }))
  : syntheticPath(live?.mark ?? 2400n * E18, Number(process.env.DROP_PCT ?? "4.5"));
const startMark = path[0].mark;
const collateral = fromFloat(Number(process.env.COLLATERAL ?? "150"));
const size = fromFloat(Number(process.env.SIZE ?? "1"), market.baseDecimals);

// --- the simulated venue, seeded with the live parameters ---------------------
const venue = new SimVenue(liquidation);
venue.addMarket({ info: market, mark: startMark, markOk: true, halfSpreadBps: 1, levels: 40, levelStepBps: 1, levelSize: 5n * E18, shape });
for (const owner of [WITH, WITHOUT]) {
  venue.openAccount(owner, collateral);
  venue.setPosition(owner, market.pool, size, startMark);
}

const store = new MemoryStore();
const keys = new MemoryKeystore();
const clock = { now: path[0].t };
const now = () => clock.now;
const engine = new Engine({ venue, store, keys, log: silentLogger, config: DEFAULT_ENGINE_CONFIG, now });
const linker = new Linker(venue, store, keys, null, silentLogger, now);
const tracker = new CounterfactualTracker(venue, store, silentLogger, now);

await store.createAccount({ id: "with-hoax", owner: WITH });
store.accounts.get("with-hoax")!.createdAt = new Date(clock.now);
await linker.run();
venue.link(WITH, getAddress((await store.getAccount("with-hoax"))!.hoaxKey!));
await linker.run();
await store.upsertPolicy("with-hoax", market.symbol, DEFAULT_POLICY);

// --- run the path ---------------------------------------------------------------
interface Side { health: number | null; equity: number; size: number }
interface Frame { t: number; mark: number; with: Side; without: Side; events: string[] }
const frames: Frame[] = [];
const read = async (owner: Address): Promise<Side> => {
  const m = await venue.readMargin(market.marginBank, owner);
  const p = await venue.readPosition(market, owner);
  return {
    health: m.mmReq > 0n ? toFloat(m.equity) / toFloat(m.mmReq) : null,
    equity: toFloat(m.equity),
    size: toFloat(p.size, market.baseDecimals),
  };
};
let lastBlock = 0n;
for (const step of path) {
  clock.now = step.t;
  venue.setMark(market.pool, step.mark);
  const events: string[] = [];
  for (const [owner, name] of [[WITH, "with Hoax"], [WITHOUT, "without Hoax"]] as const) {
    const liqs = (await venue.liquidationsSince(market.marginBank, owner, lastBlock + 1n)).events;
    if (liqs.length) events.push(`${name}: liquidated ${liqs.reduce((s, l) => s + toFloat(l.sizeDelta < 0n ? -l.sizeDelta : l.sizeDelta, market.baseDecimals), 0).toFixed(4)} ${market.baseSymbol} at mark ${toFloat(step.mark).toFixed(2)}`);
  }
  lastBlock = await venue.blockNumber();
  const r = await engine.tick((await store.getAccount("with-hoax"))!);
  if (r.kind === "acted") {
    const a = (await store.getAction(r.actionId))!;
    events.push(`with Hoax: closed ${toFloat(a.sizeFilled, market.baseDecimals).toFixed(4)} ${market.baseSymbol}, health ${a.healthBefore.toFixed(3)} -> ${a.healthAfter?.toFixed(3)}, cost ${toFloat(a.cost ?? 0n).toFixed(4)} USDso`);
  }
  await tracker.run();
  lastBlock = await venue.blockNumber();
  frames.push({ t: step.t, mark: toFloat(step.mark), with: await read(WITH), without: await read(WITHOUT), events });
}

const actions = await store.listActions({ limit: 100 });
const receipts = await Promise.all(
  actions.map(async (a) => ({
    outcome: a.outcome,
    reason: a.reason,
    closed: toFloat(a.sizeFilled, market.baseDecimals),
    healthBefore: a.healthBefore,
    healthAfter: a.healthAfter,
    cost: toFloat(a.cost ?? 0n),
    liqPriceBefore: a.liqPriceBefore ? toFloat(a.liqPriceBefore) : null,
    preserved: (await store.getCounterfactual(a.id))?.preserved ?? null,
    signature: a.signature,
    receiptHash: a.receiptHash,
  })),
);
const last = frames[frames.length - 1];
const liquidatedWithout = frames.some((f) => f.events.some((e) => e.startsWith("without Hoax: liquidated")));
const liquidatedWith = frames.some((f) => f.events.some((e) => e.startsWith("with Hoax: liquidated")));
const out = {
  kind: "replay",
  label: pathFile ? `Replay of a mark path recorded on ${pathFile.recordedAt}` : `Replay of a synthetic ${process.env.DROP_PCT ?? "4.5"}% drop`,
  note: "Simulation: the Hoax engine runs against an in-memory venue using dreamDEX market and liquidation parameters" +
    (live ? ` and the order book shape read from Hideki at block ${live.block}` : " (defaults; LIVE=0)") + ".",
  market: market.symbol,
  params: { maintenanceMarginBps: market.maintenanceMarginBps, penaltyBps: liquidation.penaltyBps, minSpreadBps: liquidation.minSpreadBps, policy: { trigger: DEFAULT_POLICY.triggerHealth, target: DEFAULT_POLICY.targetHealth } },
  start: { mark: toFloat(startMark), collateral: toFloat(collateral), size: toFloat(size, market.baseDecimals) },
  result: {
    withoutHoax: { liquidated: liquidatedWithout, finalEquity: last.without.equity, finalSize: last.without.size },
    withHoax: { liquidated: liquidatedWith, finalEquity: last.with.equity, finalSize: last.with.size },
    equityDifference: last.with.equity - last.without.equity,
  },
  receipts,
  frames,
};
const json = JSON.stringify(out, (_k, v) => (typeof v === "bigint" ? v.toString() : v), 2);
mkdirSync("demo/out", { recursive: true });
writeFileSync("demo/out/replay.json", json);
copyFileSync("demo/out/replay.json", "apps/web/public/replay.json");

console.log(out.label);
console.log(out.note);
for (const f of frames) for (const e of f.events) console.log(`  t+${Math.round((f.t - path[0].t) / 1000)}s mark ${f.mark.toFixed(2)}  ${e}`);
console.log(`\nwithout Hoax: ${liquidatedWithout ? "liquidated" : "survived"}, final equity ${last.without.equity.toFixed(2)} USDso, size ${last.without.size.toFixed(4)}`);
console.log(`with Hoax:    ${liquidatedWith ? "liquidated" : "survived"}, final equity ${last.with.equity.toFixed(2)} USDso, size ${last.with.size.toFixed(4)}`);
console.log(`difference:   ${out.result.equityDifference.toFixed(2)} USDso`);
for (const r of receipts) console.log(`receipt: ${r.outcome}${r.preserved !== null ? `, preserved ${toFloat(BigInt(r.preserved)).toFixed(2)} USDso` : ""}${r.reason ? ` (${r.reason})` : ""}`);
console.log("\nwrote demo/out/replay.json and apps/web/public/replay.json");
process.exit(0);
