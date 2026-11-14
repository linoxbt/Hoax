// Alerts outside the dashboard: one notice, rendered for Telegram and sent through
// the Telegram Bot API. No SDK: plain fetch, injectable for tests. The token comes
// from the caller.

export interface Notice {
  /** One line: "Hoax closed 0.8 SOL on SOL-PERP". */
  title: string;
  /** The facts, one per line. */
  lines: string[];
  /** A page to open, such as the signed receipt. */
  link?: { label: string; url: string };
  tone: "info" | "good" | "warn" | "bad";
}

type Fetch = typeof fetch;

const MARK: Record<Notice["tone"], string> = { info: "🔵", good: "✅", warn: "⚠️", bad: "🔴" };

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/** The notice as a Telegram message in HTML parse mode. */
export function telegramText(n: Notice): string {
  const out = [`${MARK[n.tone]} <b>${escapeHtml(n.title)}</b>`, ...n.lines.map(escapeHtml)];
  if (n.link) out.push(`<a href="${escapeHtml(n.link.url)}">${escapeHtml(n.link.label)}</a>`);
  return out.join("\n");
}

/** Send one Telegram message. Throws with Telegram's description when it refuses. */
export async function sendTelegram(token: string, chatId: string, text: string, f: Fetch = fetch): Promise<void> {
  const res = await f(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, parse_mode: "HTML", disable_web_page_preview: true }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { description?: string } | null;
    throw new Error(`telegram ${res.status}: ${body?.description ?? "refused"}`);
  }
}
