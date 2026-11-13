import { hashCode, replyTelegram, siteUrl, webhookAuthorized } from "@/lib/notify";
import { getStore, json } from "@/lib/server";

export const dynamic = "force-dynamic";

type Update = { message?: { text?: string; chat?: { id?: number | string } } };

/**
 * Telegram's webhook (set once with setWebhook and a secret_token). "/start <code>"
 * from Hoax's settings links the chat to that account's alerts; "/stop" unlinks it.
 * Always answers 200 so Telegram does not retry a message Hoax chose to ignore.
 */
export async function POST(req: Request) {
  if (!webhookAuthorized(req)) return new Response("forbidden", { status: 403 });
  const update = (await req.json().catch(() => null)) as Update | null;
  const text = update?.message?.text?.trim() ?? "";
  const chat = update?.message?.chat?.id;
  if (chat === undefined || chat === null) return json({ ok: true });
  const chatId = String(chat);
  const store = await getStore();
  try {
    const start = /^\/start(?:@\w+)?(?:\s+(\S+))?$/.exec(text);
    if (start?.[1]) {
      const row = await store.verifyNotifyTarget("telegram", hashCode(start[1]), new Date(), chatId);
      await replyTelegram(
        chatId,
        row
          ? {
              title: "Hoax alerts are on",
              lines: [
                `This chat now gets alerts for the dreamDEX account ${row.owner.slice(0, 6)}…${row.owner.slice(-4)}: every close Hoax sends, saves, liquidations and anything that needs you.`,
                "Send /stop to turn them off.",
              ],
              link: { label: "Open your dashboard", url: `${siteUrl()}/app` },
              tone: "good",
            }
          : {
              title: "That link has expired",
              lines: ["Open Hoax's settings and press Connect Telegram again: each link works once, for 30 minutes."],
              link: { label: "Open settings", url: `${siteUrl()}/app/settings#alerts` },
              tone: "warn",
            },
      );
    } else if (/^\/stop(?:@\w+)?$/.test(text)) {
      const n = await store.deleteNotifyTargetByValue("telegram", chatId);
      await replyTelegram(chatId, {
        title: n ? "Hoax alerts are off" : "This chat had no Hoax alerts",
        lines: [n ? "Nothing more will be sent here. Connect again from Hoax's settings at any time." : "Connect it from Hoax's settings to get alerts here."],
        tone: "info",
      });
    } else {
      await replyTelegram(chatId, {
        title: "Hoax alerts",
        lines: ["To get alerts here, open Hoax's settings, press Connect Telegram and follow the link back to this chat. Send /stop to turn alerts off."],
        link: { label: "Open settings", url: `${siteUrl()}/app/settings#alerts` },
        tone: "info",
      });
    }
  } catch (err) {
    console.error("telegram webhook:", err instanceof Error ? err.message : String(err));
  }
  return json({ ok: true });
}
