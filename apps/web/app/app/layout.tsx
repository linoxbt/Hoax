"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { EngineBadge } from "@/components/EngineBadge";
import { LogoLoader } from "@/components/Logo";
import { Arrow, Btn, Eyebrow } from "@/components/Ui";
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

/** Small line icons for the rail, one per page. */
function NavIcon({ href }: { href: (typeof NAV)[number][0] }) {
  const p = {
    "/app": <path d="M2.5 2.5h4.5v4.5H2.5zM9 2.5h4.5v4.5H9zM2.5 9h4.5v4.5H2.5zM9 9h4.5v4.5H9z" />,
    "/app/positions": <path d="M2 12.5l3.5-4 3 2.5L14 4.5M10.5 4.5H14V8" />,
    "/app/alerts": <path d="M4 11V7a4 4 0 018 0v4l1 1.5H3L4 11zM6.5 14h3" />,
    "/app/receipts": <path d="M3.5 1.8h9v12.4l-2.2-1.4-2.3 1.4-2.3-1.4-2.2 1.4zM6 5.5h4M6 8.5h4" />,
    "/app/settings": <path d="M2.5 4.5h11M2.5 11.5h11M5.5 3v3M10.5 10v3" />,
  }[href];
  return (
    <svg
      className="db-ico"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.4}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {p}
    </svg>
  );
}

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
    <section className="db-gate">
      <div className="card db-gate-main">
        <Eyebrow>Dashboard</Eyebrow>
        {noAccount ? (
          <>
            <h1 className="h2">No dreamDEX account yet</h1>
            <p className="txt">
              {short(hoax.wallet)} owns no dreamDEX trading account on Somnia Shannon or Hideki. Open one in dreamDEX, then come back.
              {hoax.walletInfo &&
                !hoax.walletInfo.indexed &&
                " The accounts indexer did not answer, so only accounts derived from this wallet were checked."}
            </p>
            {checking ? (
              <div className="db-gate-act">
                <LogoLoader label="Checking Shannon and Hideki for your dreamDEX account…" />
              </div>
            ) : (
              <div className="db-gate-act">
                <Btn href={DREAMDEX_APP} fill external>
                  Open dreamDEX
                </Btn>
                <Btn onClick={() => void checkAgain()} arrow={false}>
                  Check again
                </Btn>
              </div>
            )}
          </>
        ) : hoax.walletErr ? (
          <>
            <h1 className="h2">Chain unreachable</h1>
            <p className="note bad">{hoax.walletErr}</p>
          </>
        ) : (
          <>
            <h1 className="h2">Connect your wallet</h1>
            <p className="txt">The wallet you trade dreamDEX perps with. Hoax finds your trading account and reads its positions live.</p>
            <div className="db-gate-act">
              <Btn onClick={hoax.openConnect} fill>
                Connect wallet
              </Btn>
              {process.env.NEXT_PUBLIC_HOAX_DEMO === "1" && <Btn onClick={hoax.useSample}>Explore a sample account</Btn>}
            </div>
          </>
        )}
      </div>
      <div className="panel db-gate-side">
        <Eyebrow>Your workspace / once connected</Eyebrow>
        <div className="db-gate-list">
          {[
            ["Positions", "Every open perp position and its health, read live."],
            ["Policy", "The health Hoax acts at, and the health it restores."],
            ["Receipts", "A signed receipt for every close Hoax sends."],
          ].map(([k, v]) => (
            <div className="panel-in" key={k}>
              <div className="h5">{k}</div>
              <p className="mono-s soft">{v}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hoax = useHoax();
  const session = hoax.session;
  const { view, err, setErr, refresh } = useAccount(session ?? null);
  const navRef = useRef<HTMLElement>(null);
  // On a phone the rail is a scrolling tab bar: keep the current page's tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const on = nav?.querySelector<HTMLElement>("a.on");
    if (nav && on && nav.scrollWidth > nav.clientWidth) nav.scrollLeft = on.offsetLeft - nav.clientWidth / 2 + on.offsetWidth / 2;
  }, [path, session]);

  if (session === undefined) return <section className="card db-wait" aria-busy="true" />;
  if (!session) return <Gate />;

  const on = (href: string) => ((href === "/app" ? path === "/app" : path === href || path.startsWith(`${href}/`)) ? "on" : undefined);
  const unread = view?.alerts.length ?? 0;

  return (
    <AppContext.Provider value={{ session, view, err, setErr, refresh }}>
      <div className="db-shell">
        <aside className="db-rail">
          <div className="db-who">
            <Eyebrow tone="soft">{hoax.sample ? "Sample account" : `dreamDEX · ${NETWORK_NAMES[session.chainId] ?? session.chainId}`}</Eyebrow>
            <div className="db-who-id">
              <Avatar address={session.owner} size={32} />
              <a className="db-acct" href={addressUrl(session.owner, session.chainId)} target="_blank" rel="noreferrer">
                <span>{short(session.owner)}</span>
                <Arrow dir="ne" />
              </a>
            </div>
            {!hoax.sample && (hoax.walletInfo?.accounts.length ?? 0) > 1 && (
              <label className="field db-pick">
                <span>Account</span>
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
            <div className="db-who-engine">
              <EngineBadge chainId={session.chainId} />
            </div>
            {!hoax.sample && !hoax.signedIn && (
              <button className="btn ghost sm wide db-verify" onClick={hoax.openConnect}>
                Verify to manage
              </button>
            )}
          </div>
          <nav className="db-nav" aria-label="Dashboard" ref={navRef}>
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={on(href)} aria-current={on(href) ? "page" : undefined}>
                <NavIcon href={href} />
                <span>{label}</span>
                {href === "/app/alerts" && unread > 0 && <b className="db-count">{unread}</b>}
              </Link>
            ))}
          </nav>
        </aside>
        <div className="db-main">
          {err && <p className="note bad db-err">{err}</p>}
          {children}
        </div>
      </div>
    </AppContext.Provider>
  );
}
