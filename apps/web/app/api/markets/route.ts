import { HIDEKI, isNetworkId } from "@hoax/chain";
import { cachedFor, clientIp, error, getMarkets, getVenue, json, rateLimitedLocal } from "@/lib/server";

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

const TTL_MS = 5_000;

async function load(chainId: number): Promise<MarketRow[]> {
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
  return rows.sort((a, b) => rank(a.baseSymbol) - rank(b.baseSymbol) || a.baseSymbol.localeCompare(b.baseSymbol));
}

/**
 * Every dreamDEX perp market on one network (?chain=, Hideki by default) with
 * its live mark, read from chain. Cached 5 s and shared: callers arriving
 * while a read is under way wait for that one instead of starting their own.
 */
export async function GET(req: Request) {
  if (rateLimitedLocal(`markets-ip:${clientIp(req)}`, 120, 60_000)) return error(429, "too many requests; try again shortly");
  const chainId = Number(new URL(req.url).searchParams.get("chain") ?? HIDEKI.id);
  if (!isNetworkId(chainId)) return error(400, "chain must be 50312 (Shannon) or 50383 (Hideki)");
  return json({ chainId, markets: await cachedFor(`markets:${chainId}`, TTL_MS, () => load(chainId)) });
}
