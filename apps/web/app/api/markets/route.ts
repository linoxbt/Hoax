import { HIDEKI, isNetworkId } from "@hoax/chain";
import { error, getMarkets, getVenue, json } from "@/lib/server";

export const dynamic = "force-dynamic";

interface MarketRow {
  symbol: string;
  baseSymbol: string;
  pool: string;
  mark: string | null;
  markOk: boolean;
  maintenanceMarginBps: number;
  minQuantity: string;
  baseDecimals: number;
}

const g = globalThis as unknown as { __hoaxMarkets?: Map<number, { at: number; rows: MarketRow[] }> };
const TTL_MS = 5_000;

/** Every dreamDEX perp market on one network (?chain=, Hideki by default) with its live mark, read from chain (cached 5 s). */
export async function GET(req: Request) {
  const chainId = Number(new URL(req.url).searchParams.get("chain") ?? HIDEKI.id);
  if (!isNetworkId(chainId)) return error(400, "chain must be 50312 (Shannon) or 50383 (Hideki)");
  g.__hoaxMarkets ??= new Map();
  const hit = g.__hoaxMarkets.get(chainId);
  if (hit && Date.now() - hit.at < TTL_MS) return json({ chainId, markets: hit.rows, cached: true });
  const markets = await getMarkets(chainId);
  const venue = getVenue(chainId);
  const rows = await Promise.all(
    markets.map(async (m): Promise<MarketRow> => {
      const feed = venue ? await venue.readFeed(m).catch(() => null) : null;
      return {
        symbol: m.symbol,
        baseSymbol: m.baseSymbol,
        pool: m.pool,
        mark: feed ? feed.markPrice.toString() : null,
        markOk: feed?.markOk ?? false,
        maintenanceMarginBps: m.maintenanceMarginBps,
        minQuantity: m.minQuantity.toString(),
        baseDecimals: m.baseDecimals,
      };
    }),
  );
  // Majors first, then alphabetical.
  const rank = (b: string) => {
    const i = ["BTC", "ETH", "SOL"].indexOf(b);
    return i === -1 ? 99 : i;
  };
  rows.sort((a, b) => rank(a.baseSymbol) - rank(b.baseSymbol) || a.baseSymbol.localeCompare(b.baseSymbol));
  g.__hoaxMarkets.set(chainId, { at: Date.now(), rows });
  return json({ chainId, markets: rows, cached: false });
}
