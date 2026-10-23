import { requestHost, verify } from "@/lib/auth";
import { error, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/** Exchange a signed challenge for a session token. Body: { message, signature }. */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { message?: string; signature?: string } | null;
  if (!body?.message || !body.signature || !/^0x[0-9a-fA-F]+$/.test(body.signature)) return error(400, "message and signature are required");
  const host = requestHost(req);
  if (!host) return error(401, "this sign-in message was made for another site");
  try {
    return json(await verify(body.message, body.signature as `0x${string}`, host));
  } catch (err) {
    return error(401, (err as Error).message);
  }
}
