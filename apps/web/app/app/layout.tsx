"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { EngineBadge } from "@/components/EngineBadge";
import { LogoLoader } from "@/components/Logo";
import { Label } from "@/components/Ui";
import { Avatar } from "@/components/WalletButton";
import { AppContext } from "@/lib/appContext";
import { DREAMDEX_APP, NETWORK_NAMES, addressUrl, short } from "@/lib/format";
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
  const [checking, setChecking] = useState(false);
  const noAccount = hoax.wallet && hoax.walletInfo && !hoax.walletInfo.primary;
  const checkAgain = async () => {
    setChecking(true);
    // Held for a beat so a fast answer still reads as a check, not a flicker.
    await Promise.all([hoax.refreshWallet(), new Promise((r) => setTimeout(r, 700))]);
    setChecking(false);
  };
  return (
    <section className="sec first">
      <div className="pad" style={{ minHeight: "60vh", paddingTop: "6.4rem" }}>
        <Label dot>Dashboard</Label>
        {noAccount ? (
          <>
            <h1 className="h3" style={{ marginTop: "1.6rem" }}>No dreamDEX account yet</h1>
            <p className="txt ink" style={{ marginTop: "2.4rem", maxWidth: "62rem" }}>
              {short(hoax.wallet)} owns no dreamDEX trading account on Somnia Shannon or Hideki. Open one in dreamDEX, then come back.
              {hoax.walletInfo && !hoax.walletInfo.indexed && " The accounts indexer did not answer, so only accounts derived from this wallet were checked."}
            </p>
            {checking ? (
              <div style={{ marginTop: "3.2rem" }}>
                <LogoLoader label="Checking Shannon and Hideki for your dreamDEX account…" />
              </div>
            ) : (
              <div className="row" style={{ marginTop: "3.2rem" }}>
                <a href={DREAMDEX_APP} className="pill" target="_blank" rel="noreferrer">
                  Open dreamDEX ↗
                </a>
                <button className="pill ghost" onClick={() => void checkAgain()}>
                  Check again
                </button>
              </div>
            )}
          </>
        ) : hoax.walletErr ? (
          <>
            <h1 className="h1" style={{ marginTop: "1.6rem" }}>Chain unreachable</h1>
            <p className="note bad" style={{ marginTop: "2.4rem", maxWidth: "62rem" }}>
              {hoax.walletErr}
            </p>
          </>
        ) : (
          <>
            <h1 className="h1" style={{ marginTop: "1.6rem" }}>Connect your wallet</h1>
            <p className="txt ink" style={{ marginTop: "2.4rem", maxWidth: "62rem" }}>
              The wallet you trade dreamDEX perps with. Hoax finds your trading account and reads its positions live.
            </p>
            <div className="row" style={{ marginTop: "3.2rem" }}>
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

  if (session === undefined) return <section className="sec wait" aria-busy="true" />;
  if (!session) return <Gate />;

  const on = (href: string) => (href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`)) ? "on" : undefined;
  const unread = view?.alerts.length ?? 0;

  return (
    <AppContext.Provider value={{ session, view, err, setErr, refresh }}>
      <div className="shell">
        <aside className="side">
          <nav>
            <div className="who">
              <div className="row" style={{ gap: "1.2rem", alignItems: "center" }}>
                <Avatar address={session.owner} size={28} />
                <div>
                  <div className="cap soft">{hoax.sample ? "Sample account" : `dreamDEX · ${NETWORK_NAMES[session.chainId] ?? session.chainId}`}</div>
                  <a className="mono acct-link" href={addressUrl(session.owner, session.chainId)} target="_blank" rel="noreferrer">
                    {short(session.owner)} ↗
                  </a>
                </div>
              </div>
              {!hoax.sample && (hoax.walletInfo?.accounts.length ?? 0) > 1 && (
                <label className="acct-pick">
                  <span className="cap soft">Account</span>
                  <select
                    value={`${session.chainId}:${session.owner}`}
                    onChange={(e) => {
                      const [c, a] = e.target.value.split(":");
                      hoax.selectAccount(Number(c), a);
                    }}
                  >
                    {hoax.walletInfo!.accounts.map((a) => (
                      <option key={`${a.chainId}:${a.address}`} value={`${a.chainId}:${a.address.toLowerCase()}`}>
                        {a.networkName.replace("Somnia ", "")} · {short(a.address)} · {a.positions} open
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <div style={{ marginTop: "1.6rem" }}>
                <EngineBadge chainId={session.chainId} />
              </div>
              {!hoax.sample && !hoax.signedIn && (
                <button className="pill ghost" style={{ marginTop: "1.6rem", width: "100%" }} onClick={hoax.openConnect}>
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
            <div style={{ padding: "2rem var(--pad) 0" }}>
              <p className="note bad">{err}</p>
            </div>
          )}
          {children}
        </div>
      </div>
    </AppContext.Provider>
  );
}
