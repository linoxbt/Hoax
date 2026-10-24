import { DEFAULT_POLICY, validatePolicyForMarket, type Policy } from "@hoax/core";
import { BAD_CHAIN, authorized, chainOf, error, failure, getMarkets, getStore, isAddress, isUuid, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** A number from the body, or the default when absent; NaN (rejected by validation) when not a number. */
function numberField(v: unknown, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === "number") return v;
  if (typeof v === "string" && v.trim() !== "") return Number(v);
  return Number.NaN;
}

function boolField(v: unknown, fallback: boolean): boolean | null {
  if (v === undefined) return fallback;
  return typeof v === "boolean" ? v : null;
}

/** Create or update the policy for one market. Missing fields take the defaults. ?chain= picks the network (Hideki by default). */
export async function PUT(req: Request, { params }: { params: Promise<{ owner: string; market: string }> }) {
  const { owner, market } = await params;
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainId = chainOf(req);
  if (!chainId) return error(400, BAD_CHAIN);
  const markets = await getMarkets(chainId);
  const info = markets.find((m) => m.symbol === market);
  if (!info) return error(400, `unknown market ${market}`);
  const store = await getStore();
  const id = new URL(req.url).searchParams.get("account");
  if (id !== null && !isUuid(id)) return error(400, "account must be a registration id");
  const account = id ? await store.getAccount(id) : await store.getAccountByOwner(owner, chainId);
  if (!account || account.owner !== owner.toLowerCase() || account.chainId !== chainId) return error(404, "no Hoax registration for this wallet on this network");
  try {
    if (!(await authorized(req, account, { fresh: true }))) return error(401, "sign in with the wallet that owns this account");
  } catch (err) {
    return failure(502, "could not check the account on chain; try again", err);
  }

  const body = (await req.json().catch(() => null)) as Partial<Record<keyof Policy, unknown>> | null;
  if (!body || typeof body !== "object") return error(400, "the body must be a JSON object");
  const floorRaw = body.floorSize;
  if (floorRaw !== undefined && floorRaw !== null && floorRaw !== "" && !/^\d+$/.test(String(floorRaw))) {
    return error(400, "floor size must be a whole number of base units");
  }
  const allowFullClose = boolField(body.allowFullClose, DEFAULT_POLICY.allowFullClose);
  const enabled = boolField(body.enabled, true);
  if (allowFullClose === null || enabled === null) return error(400, "allowFullClose and enabled must be true or false");
  const policy: Policy = {
    triggerHealth: numberField(body.triggerHealth, DEFAULT_POLICY.triggerHealth),
    targetHealth: numberField(body.targetHealth, DEFAULT_POLICY.targetHealth),
    maxClosePct: numberField(body.maxClosePct, DEFAULT_POLICY.maxClosePct),
    maxSlippageBps: numberField(body.maxSlippageBps, DEFAULT_POLICY.maxSlippageBps),
    cooldownSec: numberField(body.cooldownSec, DEFAULT_POLICY.cooldownSec),
    floorSize: floorRaw === undefined || floorRaw === null || floorRaw === "" ? null : BigInt(String(floorRaw)),
    lambda: numberField(body.lambda, DEFAULT_POLICY.lambda),
    triggerMargin: numberField(body.triggerMargin, DEFAULT_POLICY.triggerMargin),
    allowFullClose,
    enabled,
  };
  const problems = validatePolicyForMarket(policy, info);
  if (problems.length > 0) return error(400, problems.join("; "));
  return json(await store.upsertPolicy(account.id, market, policy));
}
