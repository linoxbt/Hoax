import { requestHost, verify } from "@/lib/auth";
import { clientIp, error, json, rateLimited, useNonce } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Exchange a signed challenge for a session token. Body: { message, signature }. Each challenge works once. */
export async function POST(req: Request) {
  if (await rateLimited(`verify-ip:${clientIp(req)}`, 30, 10 * 60_000)) return error(429, "too many sign-in attempts; try again shortly");
  const body = (await req.json().catch(() => null)) as { message?: string; signature?: string } | null;
  if (typeof body?.message !== "string" || typeof body.signature !== "string" || !/^0x[0-9a-fA-F]+$/.test(body.signature) || body.message.length > 2000) {
    return error(400, "message and signature are required");
  }
  const host = requestHost(req);
  if (!host) return error(401, "this sign-in message was made for another site");
  try {
    return json(await verify(body.message, body.signature as `0x${string}`, host, useNonce));
  } catch (err) {
    // verify's own errors are written for the user; anything else (an RPC failure) is not shown.
    const msg = err instanceof Error ? err.message : "";
    const known = /sign-in|signature|expired|already used|another site/.test(msg);
    if (!known) console.error("sign-in failed:", msg);
    return error(401, known ? msg : "could not check the signature right now; try again");
  }
}
