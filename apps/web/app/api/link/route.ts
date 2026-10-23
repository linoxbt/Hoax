import { getAddress } from "viem";
import { accountsClient, bearer, controls, sessionWallet } from "@/lib/auth";
import { BAD_CHAIN, BUILDER, chainOf, error, getMarkets, getStore, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * The transaction that links (or unlinks) this account's Hoax key on every
 * perp pool, built for the signed-in wallet to send to its own Safe.
 * Body: { owner, chain?: number, approved?: boolean, builderFee?: boolean }.
 */
export async function POST(req: Request) {
  const wallet = sessionWallet(bearer(req));
  if (!wallet) return error(401, "sign in with your wallet first");
  const body = (await req.json().catch(() => null)) as { owner?: string; chain?: number; approved?: boolean; builderFee?: boolean } | null;
  const owner = body?.owner?.trim() ?? "";
  if (!isAddress(owner)) return error(400, "owner must be a 0x address");
  const chainId = chainOf(req, body);
  if (!chainId) return error(400, BAD_CHAIN);
  if (!(await controls(wallet, owner, chainId))) return error(403, "this wallet does not own that dreamDEX account");

  const store = await getStore();
  const account = await store.getAccountByOwner(owner, chainId);
  if (!account?.hoaxKey) return error(409, "the Hoax key for this account is not ready yet");

  const markets = await getMarkets(chainId);
  const accounts = accountsClient(chainId);
  const builder =
    body?.builderFee !== false && BUILDER.address && BUILDER.feeBpsTimes1k > 0
      ? { address: getAddress(BUILDER.address), feeBpsTimes1k: BigInt(BUILDER.feeBpsTimes1k) }
      : null;
  try {
    const tx = await accounts.buildLinkTx({
      wallet,
      account: getAddress(owner),
      operator: getAddress(account.hoaxKey),
      pools: markets.map((m) => m.pool),
      approved: body?.approved !== false,
      builder,
    });
    const gas = await accounts.estimateGas(tx);
    return json({ ...tx, gas, markets: markets.length, hoaxKey: account.hoaxKey, chainId });
  } catch (err) {
    return error(400, (err as Error).message);
  }
}
