"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { Kicker } from "@/components/Kicker";
import { AppContext } from "@/lib/appContext";
import { short } from "@/lib/format";
import { useAccount, useSession } from "@/lib/useAccount";

const NAV = [
  ["/app", "Overview"],
  ["/app/positions", "Positions"],
  ["/app/alerts", "Alerts"],
  ["/app/receipts", "Receipts"],
  ["/app/settings", "Settings"],
] as const;

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useSession();
  const { view, err, setErr, refresh } = useAccount(session ?? null);
  const [restore, setRestore] = useState({ owner: "", token: "" });

  if (session === undefined) return <section className="sec" style={{ minHeight: "60vh" }} />;

  if (!session) {
    return (
      <section className="sec">
        <div className="wrap pad">
          <Kicker>App</Kicker>
          <h1 className="hero-in">Connect a wallet</h1>
          <p className="lede" style={{ marginTop: 20 }}>
            <Link href="/start" className="accent">Get protected →</Link> or restore with your manage token.
          </p>
          <div className="card" style={{ marginTop: 40, maxWidth: 820 }}>
            <div className="grid g3" style={{ alignItems: "end" }}>
              <label className="field">
                <span>dreamDEX wallet</span>
                <input value={restore.owner} onChange={(e) => setRestore({ ...restore, owner: e.target.value })} placeholder="0x…" />
              </label>
              <label className="field">
                <span>Manage token</span>
                <input value={restore.token} onChange={(e) => setRestore({ ...restore, token: e.target.value })} />
              </label>
              <div>
                <button
                  className="pill"
                  disabled={!/^0x[0-9a-fA-F]{40}$/.test(restore.owner.trim()) || !restore.token.trim()}
                  onClick={() => setSession({ owner: restore.owner.trim().toLowerCase(), accountId: "", token: restore.token.trim() })}
                >
                  Restore
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>
    );
  }

  const on = (href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`)) ? "on" : undefined;
  const unread = view?.alerts.length ?? 0;

  return (
    <AppContext.Provider value={{ session, setSession, view, err, setErr, refresh }}>
      <div className="shell">
        <aside className="side">
          <nav>
            <div className="who cap">
              Wallet
              <div className="mono" style={{ color: "var(--ink)", fontSize: 13 }}>
                {short(session.owner)}
              </div>
            </div>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={on(href)}>
                {label}
                {href === "/app/alerts" && unread > 0 ? ` · ${unread}` : ""}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="content">
          {err && (
            <div className="wrap" style={{ paddingTop: 20 }}>
              <p className="note bad">{err}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </AppContext.Provider>
  );
}
