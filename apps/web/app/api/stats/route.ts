import { cachedFor, clientIp, error, getStore, json, rateLimitedLocal } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Saved equity next to the price of insurance, so the benefit is never overstated. Cached 10 s. */
export async function GET(req: Request) {
  if (rateLimitedLocal(`stats-ip:${clientIp(req)}`, 60, 60_000)) return error(429, "too many requests; try again shortly");
  return json(await cachedFor("stats", 10_000, async () => (await getStore()).stats()));
}
