import { cachedFor, clientIp, engineStatus, error, json, rateLimitedLocal } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Whether the protection engine is running, from its last heartbeat (cached 3 s). */
export async function GET(req: Request) {
  if (rateLimitedLocal(`engine-ip:${clientIp(req)}`, 60, 60_000)) return error(429, "too many requests; try again shortly");
  return json(await cachedFor("engine", 3_000, engineStatus));
}
