import { getAddress } from "viem";
import { accountsClient, controls } from "@/lib/auth";
import { BAD_CHAIN, BUILDER, chainOf, clientIp, error, failure, getMarkets, getStore, isAddress, json, rateLimitedLocal, sessionFor } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * The transaction that links (or unlinks) this account's Hoax key on every
 * perp pool, built for the signed-in wallet to send to its own Safe.
 * Body: { owner, chain?: number, approved?: boolean, builderFee?: boolean }.
 */
export async function POST(req: Request) {
  if (rateLimitedLocal(`link-ip:${clientIp(req)}`, 60, 10 * 60_000)) return error(429, "too many requests; try again shortly");
  const body = (await req.json().catch(() => null)) as { owner?: string; chain?: number; approved?: boolean; builderFee?: boolean } | null;
  const owner = body?.owner?.trim() ?? "";
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainId = chainOf(req, body);
  if (!chainId) return error(400, BAD_CHAIN);
  const session = await sessionFor(req, chainId);
  if (!session) return error(401, "sign in with your wallet first");
  const wallet = session.wallet;
  try {
    if (!(await controls(wallet, owner, chainId))) return error(403, "this wallet does not own that dreamDEX account");
  } catch (err) {
    return failure(502, "could not check the account on chain; try again", err);
  }

  const store = await getStore();
  const account = await store.getAccountByOwner(owner, chainId);
  if (!account?.hoaxKey) return error(409, "the Hoax key for this account is not ready yet");

  const approved = body?.approved !== false;
  const markets = await getMarkets(chainId);
  const accounts = accountsClient(chainId);
  // Linking approves the fee when one is charged and the trader agrees; unlinking clears it.
  const builder =
    BUILDER.address && BUILDER.feeBpsTimes1k > 0 && (approved ? body?.builderFee !== false : true)
      ? { address: getAddress(BUILDER.address), feeBpsTimes1k: BigInt(BUILDER.feeBpsTimes1k) }
      : null;
  try {
    const tx = await accounts.buildLinkTx({
      wallet,
      account: getAddress(owner),
      operator: getAddress(account.hoaxKey),
      pools: markets.map((m) => m.pool),
      approved,
      builder,
    });
    const gas = await accounts.estimateGas(tx);
    return json({ ...tx, gas, markets: markets.length, hoaxKey: account.hoaxKey, chainId });
  } catch (err) {
    return failure(502, "could not build the link transaction; try again", err);
  }
}
