// Telegram delivery for an owner's alerts, closes and outcomes. The
// dashboard's alert list stays the record; this is a copy sent where the trader
// will see it. Fire and forget: a failed send is logged and never slows or stops
// trading. The same notice is sent once per 15 minutes at most, and a Telegram
// chat that blocked the bot is unlinked.
import { type Notice, sendTelegram, telegramText, toFloat } from "@hoax/core";
import type { NotifyTargetRow, Store } from "@hoax/db";
import type { Logger } from "./log.ts";

export interface NotifierConfig {
  telegramToken: string | null;
  /** Where receipts and the dashboard live, without a trailing slash. */
  siteUrl: string;
  /** The network this engine serves, named in each notice. */
  networkName: string;
}

const DEDUPE_MS = 15 * 60_000;
const TARGETS_TTL_MS = 30_000;

export class Notifier {
  private targets = new Map<string, { at: number; rows: NotifyTargetRow[] }>();
  private recent = new Map<string, number>();

  constructor(
    private readonly store: Store,
    readonly cfg: NotifierConfig,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
    private readonly f: typeof fetch = fetch,
  ) {}

  get enabled(): boolean {
    return Boolean(this.cfg.telegramToken);
  }

  receiptUrl(actionId: string): string {
    return `${this.cfg.siteUrl}/r/${actionId}`;
  }

  /** Queue a notice for an owner; returns at once. */
  send(owner: string, n: Notice): void {
    if (!this.enabled) return;
    void this.deliver(owner, n).catch((err) => this.log.warn("notify failed", { owner, error: String(err).slice(0, 200) }));
  }

  /** Send a notice to every verified channel of an owner. Resolves to the number of channels it reached. */
  async deliver(owner: string, n: Notice): Promise<number> {
    if (!this.enabled) return 0;
    const now = this.now();
    const key = `${owner.toLowerCase()}|${n.title}|${n.lines.join("|")}`;
    for (const [k, at] of this.recent) if (now - at > DEDUPE_MS) this.recent.delete(k);
    if (this.recent.has(key)) return 0;
    this.recent.set(key, now);

    const rows = await this.targetsOf(owner);
    let sent = 0;
    for (const t of rows) {
      if (!t.verified || !t.target) continue;
      try {
        if (t.kind === "telegram" && this.cfg.telegramToken) {
          await sendTelegram(this.cfg.telegramToken, t.target, telegramText(n), this.f);
          sent++;
        }
      } catch (err) {
        const msg = String(err);
        this.log.warn("notify channel failed", { owner, kind: t.kind, error: msg.slice(0, 200) });
        // The trader blocked the bot or deleted the chat: stop trying it.
        if (t.kind === "telegram" && /403|blocked|chat not found|deactivated/i.test(msg)) {
          await this.store.deleteNotifyTargetByValue("telegram", t.target).catch(() => undefined);
          this.targets.delete(owner.toLowerCase());
        }
      }
    }
    return sent;
  }

  private async targetsOf(owner: string): Promise<NotifyTargetRow[]> {
    const k = owner.toLowerCase();
    const hit = this.targets.get(k);
    if (hit && this.now() - hit.at < TARGETS_TTL_MS) return hit.rows;
    const rows = await this.store.listNotifyTargets(k);
    this.targets.set(k, { at: this.now(), rows });
    return rows;
  }
}

// ---------- the notices ----------

const ALERT_TITLE: Record<string, string> = {
  paused: "Hoax paused your account",
  skipped: "Hoax did not close",
  key: "Hoax's key for your account is missing",
  rpc: "Hoax cannot read your account",
  stale: "A market's mark is stale",
  missed: "Your position was liquidated",
};

const fmt = (x: number, d = 2) => x.toLocaleString("en-US", { maximumFractionDigits: d });
const usdso = (raw: bigint | null) => (raw === null ? "–" : `${fmt(toFloat(raw), toFloat(raw) < 1 ? 4 : 2)} USDso`);
const health = (h: number | null) => (h === null || !Number.isFinite(h) ? "flat" : h.toFixed(2));

export function alertNotice(n: Notifier, kind: string, message: string): Notice {
  return {
    title: ALERT_TITLE[kind] ?? "Hoax alert",
    lines: [message, `Network: ${n.cfg.networkName}`],
    link: { label: "Open your alerts", url: `${n.cfg.siteUrl}/app/alerts` },
    tone: kind === "paused" || kind === "key" || kind === "missed" ? "bad" : "warn",
  };
}

export function closeNotice(
  n: Notifier,
  a: { id: string; market: string; side: string; filled: bigint; baseDecimals: number; healthBefore: number; healthAfter: number | null; cost: bigint | null; estLiqCost: bigint | null },
): Notice {
  const base = a.market.replace(/-PERP$/, "");
  return {
    title: `Hoax closed ${fmt(toFloat(a.filled, a.baseDecimals), 6)} ${base} on ${a.market}`,
    lines: [
      `Your ${a.side} was trimmed before liquidation could take it.`,
      `Health ${health(a.healthBefore)} → ${health(a.healthAfter)}`,
      `Close cost ${usdso(a.cost)}; liquidation would have cost about ${usdso(a.estLiqCost)}`,
      `Network: ${n.cfg.networkName}`,
    ],
    link: { label: "Open the signed receipt", url: n.receiptUrl(a.id) },
    tone: "info",
  };
}

export function outcomeNotice(n: Notifier, a: { id: string; market: string; outcome: "saved" | "missed"; preserved: bigint | null }): Notice {
  return a.outcome === "saved"
    ? {
        title: `Saved on ${a.market}`,
        lines: [
          "The mark reached your old liquidation price and the trimmed position survived.",
          `Equity preserved, up to ${usdso(a.preserved)}`,
          `Network: ${n.cfg.networkName}`,
        ],
        link: { label: "Open the signed receipt", url: n.receiptUrl(a.id) },
        tone: "good",
      }
    : {
        title: `Liquidated on ${a.market} after a Hoax close`,
        lines: ["The close was not enough: the position was liquidated afterwards.", `Network: ${n.cfg.networkName}`],
        link: { label: "Open the receipt", url: n.receiptUrl(a.id) },
        tone: "bad",
      };
}
