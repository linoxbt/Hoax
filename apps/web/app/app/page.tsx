"use client";
// Overview: is Hoax protecting this wallet, how each position stands, and what happened lately.
import Link from "next/link";
import { useEffect, useState } from "react";
import { AppHead } from "@/components/AppHead";
import { ReceiptTable } from "@/components/ReceiptRow";
import { useApp } from "@/lib/appContext";
import { short } from "@/lib/format";
import { api } from "@/lib/session";
import type { ActionJson } from "@/lib/types";

export default function Overview() {
  const { session, view } = useApp();
  const [recent, setRecent] = useState<ActionJson[] | null>(null);
  useEffect(() => {
    api<ActionJson[]>(`/api/actions?owner=${session.owner}&limit=5`).then(setRecent, () => setRecent([]));
  }, [session.owner]);

  const account = view?.account;
  const status = account?.status === "active" ? (account.paused ? "Paused" : "Protecting") : account ? account.status.replace("_", " ") : "Loading";
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
        {account?.status === "pending_link" && (
          <p className="note" style={{ marginBottom: 24 }}>
            Key not linked. <Link href="/start/link" className="accent">Finish setup →</Link>
          </p>
        )}
        {account?.status === "unlinked" && (
          <p className="note bad" style={{ marginBottom: 24 }}>
            Key unlinked in dreamDEX. Protection is off.
          </p>
        )}
        <div className="grid g4">
          <div className="card">
            <div className="cap soft">Lowest health</div>
            <div className="num s accent" style={{ marginTop: 10 }}>
              {lowest === null ? "–" : lowest.toFixed(2)}
            </div>
          </div>
          <div className="card">
            <div className="cap soft">Open positions</div>
            <div className="num s" style={{ marginTop: 10 }}>
              {view?.positions.length ?? "–"}
            </div>
          </div>
          <div className="card">
            <div className="cap soft">Protected</div>
            <div className="num s" style={{ marginTop: 10 }}>
              {view ? view.policies.filter((p) => p.enabled).length : "–"}
            </div>
          </div>
          <Link href="/app/alerts" className="card">
            <div className="cap soft">Alerts</div>
            <div className="num s" style={{ marginTop: 10 }}>
              {view?.alerts.length ?? "–"}
            </div>
          </Link>
        </div>

        <h3 style={{ margin: "48px 0 16px" }}>Positions</h3>
        {view && view.positions.length === 0 && <p className="copy soft">No open perp positions on this wallet.</p>}
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
                <div className="num s accent">{p.health === null ? "–" : p.health.toFixed(2)}</div>
                <div className="cap soft" style={{ marginTop: 8 }}>
                  health · trigger {policy?.triggerHealth ?? 1.25}
                </div>
                <div className="go" style={{ marginTop: 14 }}>
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
        <p className="cap soft" style={{ marginTop: 24 }}>
          Key <span className="mono">{short(account?.hoaxKey)}</span>
          {view && view.isOwner === false ? " · read-only" : ""}
        </p>
      </div>
    </>
  );
}
