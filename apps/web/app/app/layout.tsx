"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EngineBadge } from "@/components/EngineBadge";
import { Kicker } from "@/components/Kicker";
import { Avatar } from "@/components/WalletButton";
import { AppContext } from "@/lib/appContext";
import { DREAMDEX_APP, short } from "@/lib/format";
import { useAccount } from "@/lib/useAccount";
import { useHoax } from "@/lib/wallet";

const NAV = [
  ["/app", "Overview"],
  ["/app/positions", "Positions"],
  ["/app/alerts", "Alerts"],
  ["/app/receipts", "Receipts"],
  ["/app/settings", "Settings"],
] as const;

function Gate() {
  const hoax = useHoax();
  const noAccount = hoax.wallet && hoax.walletInfo && !hoax.walletInfo.primary;
  return (
    <section className="sec">
      <div className="wrap pad">
        <Kicker>App</Kicker>
        {noAccount ? (
          <>
            <h1 className="hero-in">No dreamDEX account yet</h1>
            <p className="lede" style={{ marginTop: 20, maxWidth: 620 }}>
              {short(hoax.wallet)} has no dreamDEX trading account on Hideki. Open one in dreamDEX, then come back.
            </p>
            <div className="row" style={{ marginTop: 32 }}>
              <a href={DREAMDEX_APP} className="pill" target="_blank" rel="noreferrer">
                Open dreamDEX ↗
              </a>
              <button className="pill ghost" onClick={() => void hoax.refreshWallet()}>
                Check again
              </button>
            </div>
          </>
        ) : hoax.walletErr ? (
          <>
            <h1 className="hero-in">Chain unreachable</h1>
            <p className="note bad" style={{ marginTop: 24, maxWidth: 620 }}>
              {hoax.walletErr}
            </p>
          </>
        ) : (
          <>
            <h1 className="hero-in">Connect your wallet</h1>
            <p className="lede" style={{ marginTop: 20, maxWidth: 620 }}>
              The wallet you trade dreamDEX perps with. Hoax finds your trading account and reads its positions live.
            </p>
            <div className="row" style={{ marginTop: 32 }}>
              <button className="pill" onClick={hoax.openConnect}>
                Connect wallet
              </button>
              {process.env.NEXT_PUBLIC_HOAX_DEMO === "1" && (
                <button className="pill ghost" onClick={hoax.useSample}>
                  Explore a sample account
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hoax = useHoax();
  const session = hoax.session;
  const { view, err, setErr, refresh } = useAccount(session ?? null);

  if (session === undefined) return <section className="sec" style={{ minHeight: "60vh" }} />;
  if (!session) return <Gate />;

  const on = (href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`)) ? "on" : undefined;
  const unread = view?.alerts.length ?? 0;

  return (
    <AppContext.Provider value={{ session, view, err, setErr, refresh }}>
      <div className="shell">
        <aside className="side">
          <nav>
            <div className="who">
              <div className="row" style={{ gap: 10, alignItems: "center" }}>
                <Avatar address={session.owner} size={28} />
                <div>
                  <div className="cap soft">{hoax.sample ? "Sample account" : "dreamDEX account"}</div>
                  <div className="mono" style={{ color: "var(--ink)", fontSize: 13 }}>
                    {short(session.owner)}
                  </div>
                </div>
              </div>
              <div style={{ marginTop: 14 }}>
                <EngineBadge />
              </div>
              {!hoax.sample && !hoax.signedIn && (
                <button className="pill ghost" style={{ marginTop: 14 }} onClick={hoax.openConnect}>
                  Verify to manage
                </button>
              )}
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
