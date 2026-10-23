// Spike 0 (read-only): can Hoax read everything a decision needs?
// Lists the perp markets, checks each mark feed, reads the liquidation
// parameters, and, with OWNER_ADDRESS set, that account's health and
// liquidation prices.
//   npm run spike -- 01-health-read          (OWNER_ADDRESS optional)
import { getAddress } from "viem";
import { Evidence, market, venue } from "./lib.ts";

const ev = new Evidence("01-health-read");
const markets = await venue.listMarkets();
ev.log("markets", { count: markets.length, symbols: markets.map((m) => m.symbol) });
let live = 0;
for (const m of markets) {
  const f = await venue.readFeed(m);
  if (f.markOk) live++;
  ev.log("market", { symbol: m.symbol, pool: m.pool, mark: f.markPrice, markOk: f.markOk, mmBps: m.maintenanceMarginBps, takerFee1k: m.takerFeeBpsTimes1k, lot: m.lotSize, min: m.minQuantity, decimals: m.baseDecimals });
}
const eth = await market("ETH-PERP");
const liq = await venue.liquidationParams(eth.marginBank);
ev.log("liquidation engine", { ...liq });
ev.log("builder fee cap", { pool: eth.pool, maxBuilderFeeBpsTimes1k: await venue.maxBuilderFee(eth) });

const ownerEnv = process.env.OWNER_ADDRESS;
if (ownerEnv) {
  const owner = getAddress(ownerEnv);
  const margin = await venue.readMargin(eth.marginBank, owner);
  ev.log("account", { owner, block: margin.blockNumber, equity: margin.equity, mmReq: margin.mmReq, status: margin.status, health: margin.mmReq > 0n ? Number(margin.equity) / Number(margin.mmReq) : null });
  for (const m of markets.filter((x) => margin.activePools.map((p) => p.toLowerCase()).includes(x.pool.toLowerCase()))) {
    const [pos, l] = await Promise.all([venue.readPosition(m, owner), venue.readLiquidationPrice(m, owner)]);
    ev.log("position", { symbol: m.symbol, size: pos.size, entry: pos.avgEntryPrice, liquidationPrice: l });
  }
}
await ev.finish({
  pass: live > 0 && liq.penaltyBps > 0,
  summary: `${markets.length} perp markets, ${live} with a live mark; liquidation penalty ${liq.penaltyBps} bps, min spread ${liq.minSpreadBps} bps`,
});
process.exit(0);
