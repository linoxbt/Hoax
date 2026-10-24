import { isNetworkId } from "@hoax/chain";
import { clientIp, error, getStore, isAddress, json, rateLimitedLocal } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * Receipts, newest first, each with its counterfactual. Receipts are public:
 * every field comes from public chain data. ?owner= one account, ?chain= one
 * network, ?limit= 1 to 200 (50 by default).
 */
export async function GET(req: Request) {
  if (rateLimitedLocal(`actions-ip:${clientIp(req)}`, 120, 60_000)) return error(429, "too many requests; try again shortly");
  const url = new URL(req.url);
  const owner = url.searchParams.get("owner");
  if (owner && !isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainRaw = url.searchParams.get("chain");
  const chainId = chainRaw ? Number(chainRaw) : undefined;
  if (chainId !== undefined && !isNetworkId(chainId)) return error(400, "chain must be 50312 (Shannon) or 50383 (Hideki)");
  const limitRaw = url.searchParams.get("limit") ?? "50";
  if (!/^\d{1,4}$/.test(limitRaw)) return error(400, "limit must be a whole number");
  const limit = Math.min(200, Math.max(1, Number(limitRaw)));
  const store = await getStore();
  const actions = await store.listActions({ owner: owner ?? undefined, chainId, limit });
  const cfs = await store.getCounterfactuals(actions.map((a) => a.id));
  return json(actions.map((a) => ({ ...a, counterfactual: cfs.get(a.id) ?? null })));
}
