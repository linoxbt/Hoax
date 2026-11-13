import { parseRadarChains, radarSignals, radarSnapshot } from "@/lib/radar";
import { clientIp, error, failure, json, rateLimitedLocal } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Every dreamDEX perp liquidation in a window, from the markets indexer, priced with the
 * protocol's own parameters. Public. ?chain=50383|50312|all (default all), ?hours=24|168 (default 24).
 * The 24-hour view also carries `signals`: markets liquidating faster than their own 7-day pace.
 */
export async function GET(req: Request) {
  if (rateLimitedLocal(`radar-ip:${clientIp(req)}`, 60, 60_000)) return error(429, "too many requests; try again shortly");
  const url = new URL(req.url);
  const chains = parseRadarChains(url.searchParams.get("chain"));
  if (!chains) return error(400, "chain must be 50383 (Tokyo), 50312 (Shannon) or all");
  const hours = url.searchParams.get("hours") === "168" ? 168 : 24;
  try {
    if (hours === 24) {
      const { day, signals } = await radarSignals(chains);
      return json({ ...day, signals });
    }
    return json(await radarSnapshot(chains, hours));
  } catch (err) {
    return failure(502, "the markets indexer did not answer; try again shortly", err);
  }
}
