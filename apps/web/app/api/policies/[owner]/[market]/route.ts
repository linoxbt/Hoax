import { DEFAULT_POLICY, validatePolicy, type Policy } from "@hoax/core";
import { BAD_CHAIN, authorized, chainOf, error, getMarkets, getStore, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Create or update the policy for one market. Missing fields take the defaults. ?chain= picks the network (Hideki by default). */
export async function PUT(req: Request, { params }: { params: Promise<{ owner: string; market: string }> }) {
  const { owner, market } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainId = chainOf(req);
  if (!chainId) return error(400, BAD_CHAIN);
  const markets = await getMarkets(chainId);
  if (!markets.some((m) => m.symbol === market)) return error(400, `unknown market ${market}`);
  const store = await getStore();
  const url = new URL(req.url);
  const id = url.searchParams.get("account");
  const account = id ? await store.getAccount(id) : await store.getAccountByOwner(owner, chainId);
  if (!account || account.owner !== owner.toLowerCase() || account.chainId !== chainId) return error(404, "no Hoax registration for this wallet on this network");
  if (!(await authorized(req, account))) return error(401, "sign in with the wallet that owns this account");

  const body = (await req.json().catch(() => ({}))) as Partial<Record<keyof Policy, unknown>>;
  const num = (k: keyof Policy, fallback: number) => (body[k] === undefined ? fallback : Number(body[k]));
  const policy: Policy = {
    triggerHealth: num("triggerHealth", DEFAULT_POLICY.triggerHealth),
    targetHealth: num("targetHealth", DEFAULT_POLICY.targetHealth),
    maxClosePct: num("maxClosePct", DEFAULT_POLICY.maxClosePct),
    maxSlippageBps: num("maxSlippageBps", DEFAULT_POLICY.maxSlippageBps),
    cooldownSec: num("cooldownSec", DEFAULT_POLICY.cooldownSec),
    floorSize: body.floorSize === undefined || body.floorSize === null || body.floorSize === "" ? null : BigInt(String(body.floorSize)),
    lambda: num("lambda", DEFAULT_POLICY.lambda),
    triggerMargin: num("triggerMargin", DEFAULT_POLICY.triggerMargin),
    allowFullClose: body.allowFullClose === undefined ? DEFAULT_POLICY.allowFullClose : Boolean(body.allowFullClose),
    enabled: body.enabled === undefined ? true : Boolean(body.enabled),
  };
  const problems = validatePolicy(policy);
  if (problems.length > 0) return error(400, problems.join("; "));
  return json(await store.upsertPolicy(account.id, market, policy));
}
