import { DEFAULT_POLICY, validatePolicy, type Policy } from "@hoax/core";
import { authorized, error, getMarkets, getStore, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Create or update the policy for one market. Missing fields take the defaults. */
export async function PUT(req: Request, { params }: { params: Promise<{ owner: string; market: string }> }) {
  const { owner, market } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const markets = await getMarkets();
  if (!markets.some((m) => m.symbol === market)) return error(400, `unknown market ${market}`);
  const store = await getStore();
  const url = new URL(req.url);
  const id = url.searchParams.get("account");
  const account = id ? await store.getAccount(id) : await store.getAccountByOwner(owner);
  if (!account || account.owner !== owner.toLowerCase()) return error(404, "no Hoax registration for this wallet");
  if (!authorized(req, account)) return error(401, "missing or wrong manage token");

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
