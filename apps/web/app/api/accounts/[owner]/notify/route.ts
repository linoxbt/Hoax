import { CODE_TTL_MS, hashCode, newCode, notifyConfig, replyTelegram, siteUrl } from "@/lib/notify";
import { BAD_CHAIN, DEMO, authorized, chainOf, error, failure, getStore, isAddress, json, rateLimited } from "@/lib/server";

export const dynamic = "force-dynamic";

type Body = { kind?: string; chain?: number } | null;

async function owned(req: Request, owner: string, body: Body, fresh: boolean) {
  if (!isAddress(owner)) return { res: error(400, "owner must be a 0x address") };
  const chainId = chainOf(req, body);
  if (!chainId) return { res: error(400, BAD_CHAIN) };
  const store = await getStore();
  const account = await store.getAccountByOwner(owner, chainId);
  if (!account) return { res: error(404, "no Hoax registration for this wallet") };
  try {
    if (!(await authorized(req, account, { fresh }))) return { res: error(401, "sign in with the wallet that owns this account") };
  } catch (err) {
    return { res: failure(502, "could not check the account on chain; try again", err) };
  }
  return { store, account };
}

/** Whether this account's alerts also go to Telegram. */
export async function GET(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const o = await owned(req, owner, null, false);
  if ("res" in o) return o.res;
  const cfg = notifyConfig();
  const tg = (await o.store.listNotifyTargets(o.account.owner)).find((r) => r.kind === "telegram");
  return json({ telegram: { available: Boolean(cfg.telegramToken && cfg.telegramBot), linked: Boolean(tg?.verified), pending: Boolean(tg && !tg.verified) } });
}

/**
 * { kind: "telegram" } → { link }: open it in Telegram and press Start.
 * { kind: "test" } → one test message to the linked chat.
 */
export async function POST(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const body = (await req.json().catch(() => null)) as Body;
  const o = await owned(req, owner, body, true);
  if ("res" in o) return o.res;
  if (DEMO) return error(400, "Telegram alerts are not available for the sample account");
  const cfg = notifyConfig();
  if (!cfg.telegramToken || !cfg.telegramBot) return error(503, "Telegram alerts are not configured on this deployment");
  const who = o.account.owner.toLowerCase();

  if (body?.kind === "telegram") {
    const code = newCode();
    await o.store.startNotifyTarget({ owner: who, kind: "telegram", target: null, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
    return json({ link: `https://t.me/${cfg.telegramBot}?start=${code}` });
  }

  if (body?.kind === "test") {
    if (await rateLimited(`notify-test:${who}`, 5, 10 * 60_000)) return error(429, "too many test messages; try again in a few minutes");
    const chat = (await o.store.listNotifyTargets(who)).find((r) => r.kind === "telegram" && r.verified && r.target);
    if (!chat?.target) return json({ sent: 0 });
    try {
      await replyTelegram(chat.target, {
        title: "Test alert from Hoax",
        lines: ["Alerts for your dreamDEX account will arrive here: closes, saves, liquidations and anything that needs you."],
        link: { label: "Open your dashboard", url: `${siteUrl()}/app` },
        tone: "good",
      });
    } catch (err) {
      return failure(502, "Telegram did not accept the message; reconnect the chat and try again", err);
    }
    return json({ sent: 1 });
  }

  return error(400, 'kind must be "telegram" or "test"');
}

/** Unlink the Telegram chat. */
export async function DELETE(req: Request, { params }: { params: Promise<{ owner: string }> }) {
  const { owner } = await params;
  const o = await owned(req, owner, null, true);
  if ("res" in o) return o.res;
  await o.store.deleteNotifyTarget(o.account.owner, "telegram");
  return json({ removed: "telegram" });
}
