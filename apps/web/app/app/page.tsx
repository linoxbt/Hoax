"use client";
// Overview: is Hoax protecting this wallet, how each position stands, and what happened lately.
import Link from "next/link";
import { useEffect, useState } from "react";
import { formatEther } from "viem";
import { AppHead } from "@/components/AppHead";
import { EngineBadge } from "@/components/EngineBadge";
import { HealthField } from "@/components/HealthField";
import { ReceiptTable } from "@/components/ReceiptRow";
import { useApp } from "@/lib/appContext";
import { short, units, usd } from "@/lib/format";
import { api } from "@/lib/session";
import type { ActionJson } from "@/lib/types";

/** Health colour: red under the default trigger, amber under the target, green above. */
const hl = (h: number | null | undefined) => (h === null || h === undefined ? "" : h < 1.25 ? "hl-bad" : h < 1.6 ? "hl-warn" : "hl-ok");

export default function Overview() {
  const { session, view } = useApp();
  const [recent, setRecent] = useState<ActionJson[] | null>(null);
  useEffect(() => {
    api<ActionJson[]>(`/api/actions?owner=${session.owner}&limit=5`).then(setRecent, () => setRecent([]));
  }, [session.owner]);

  const account = view?.account;
  const status = !view
    ? "Loading"
    : account?.status === "active"
      ? account.paused
        ? "Paused"
        : "Protecting"
      : account?.status === "pending_key" || account?.status === "pending_link"
        ? "Setting up"
        : account?.status === "unlinked"
          ? "Unlinked"
          : "Not protected";
  const linkedCount = view?.links ? Object.values(view.links).filter(Boolean).length : null;
  const gas = view?.keyBalance ? Number(formatEther(BigInt(view.keyBalance))) : null;
  const lowest = view?.positions.reduce<number | null>((m, p) => (p.health === null ? m : m === null ? p.health : Math.min(m, p.health)), null) ?? null;

  return (
    <>
      <AppHead kicker="Overview" title={status}>
        <div className="row">
          <Link href="/app/positions" className="pill">
            Positions
          </Link>
          <Link href="/app/settings" className="pill ghost">
            Settings
          </Link>
        </div>
      </AppHead>
      <div className="wrap pad-s">
        <div className="statusbar">
          <EngineBadge />
          <span>
            <b>{linkedCount === null ? "–" : `${linkedCount}/${view?.markets.length ?? 21}`}</b> markets linked
          </span>
          <span>
            <b>{gas === null ? "–" : gas.toFixed(3)}</b> STT key gas
          </span>
          <span>
            <b>{view ? view.policies.filter((p) => p.enabled).length : "–"}</b> policies on
          </span>
        </div>
        {view && !view.protectable && (
          <div className="cta-band">
            <div>
              <div className="cap accent">Live view · {view.network.name}</div>
              <p className="copy" style={{ marginTop: "0.6rem" }}>
                Positions on this account are read live from {view.network.name}. Automatic protection runs on Somnia Hideki for now.
              </p>
            </div>
          </div>
        )}
        {view && view.protectable && (!account || account.status === "pending_key" || account.status === "pending_link") && (
          <div className="cta-band">
            <div>
              <div className="cap accent">Not protected yet</div>
              <p className="copy" style={{ marginTop: "0.6rem" }}>
                Link Hoax in one transaction and every position on this account is covered.
              </p>
            </div>
            <Link href={account ? "/start/link" : "/start"} className="pill">
              Activate protection →
            </Link>
          </div>
        )}
        {account?.status === "unlinked" && (
          <p className="note bad" style={{ marginBottom: "2.4rem" }}>
            Key unlinked in dreamDEX. Protection is off.
          </p>
        )}
        <div className="grid g4">
          <div className="card">
            <div className="cap soft">Lowest health</div>
            <div className={`num s ${hl(lowest)}`} style={{ marginTop: "1rem" }}>
              {lowest === null ? "–" : lowest.toFixed(2)}
            </div>
          </div>
          <div className="card">
            <div className="cap soft">Open positions</div>
            <div className="num s" style={{ marginTop: "1rem" }}>
              {view?.positions.length ?? "–"}
            </div>
          </div>
          <div className="card">
            <div className="cap soft">Protected</div>
            <div className="num s" style={{ marginTop: "1rem" }}>
              {view ? view.policies.filter((p) => p.enabled).length : "–"}
            </div>
          </div>
          <Link href="/app/alerts" className="card">
            <div className="cap soft">Alerts</div>
            <div className="num s" style={{ marginTop: "1rem" }}>
              {view?.alerts.length ?? "–"}
            </div>
          </Link>
        </div>

        <h3 style={{ margin: "48px 0 16px" }}>Positions</h3>
        {view && view.positions.length === 0 && <p className="copy soft">No open perp positions on this account.</p>}
        <div className="grid g3">
          {view?.positions.map((p) => {
            const policy = view.policies.find((x) => x.market === p.market);
            return (
              <Link key={p.market} href={`/app/positions/${p.market}`} className="card">
                <div className="spread" style={{ alignItems: "center" }}>
                  <span className="cap soft">{p.side}</span>
                  {policy?.enabled ? <span className="tag saved">protected</span> : <span className="tag not-needed">not protected</span>}
                </div>
                <h3 style={{ margin: "10px 0" }}>{p.market}</h3>
                <div className={`num s ${hl(p.health)}`}>{p.health === null ? "–" : p.health.toFixed(2)}</div>
                <div className="pos-facts">
                  <span>Size</span>
                  <b>
                    {units(p.size.replace("-", ""), p.baseDecimals)} {p.baseSymbol}
                  </b>
                  <span>Mark</span>
                  <b>{p.markOk ? usd(p.mark) : "stale"}</b>
                  <span>Notional</span>
                  <b>{usd((BigInt(p.size.replace("-", "")) * BigInt(p.mark)) / 10n ** BigInt(p.baseDecimals))}</b>
                  <span>Liq. price</span>
                  <b>{p.liqPrice ? usd(p.liqPrice) : "–"}</b>
                </div>
                <HealthField health={p.health} trigger={policy?.triggerHealth ?? 1.25} target={policy?.targetHealth ?? 1.6} />
                <div className="go" style={{ marginTop: "1.4rem" }}>
                  Open →
                </div>
              </Link>
            );
          })}
        </div>

        <div className="spread" style={{ margin: "48px 0 16px" }}>
          <h3>Recent activity</h3>
          <Link href="/app/receipts" className="cap accent">
            View all →
          </Link>
        </div>
        {recent && <ReceiptTable actions={recent} />}
        {account?.hoaxKey && (
          <p className="cap soft" style={{ marginTop: "2.4rem" }}>
            Key <span className="mono">{short(account.hoaxKey)}</span>
            {view && view.isOwner === false ? " · read-only" : ""}
          </p>
        )}
      </div>
    </>
  );
}
