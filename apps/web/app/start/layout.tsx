"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { EngineBadge } from "@/components/EngineBadge";
import { KEY_GAS_FLOOR } from "@/lib/format";
import { LogoLoader } from "@/components/Logo";
import { Eyebrow, Split } from "@/components/Ui";
import { StartContext } from "@/lib/startContext";
import { useAccount } from "@/lib/useAccount";
import { useHoax } from "@/lib/wallet";

const STEPS = [
  ["/start", "01 / Connect", "Your wallet"],
  ["/start/link", "02 / Link", "Link Hoax"],
  ["/start/gas", "03 / Gas", "Fund its gas"],
  ["/start/policy", "04 / Policy", "Set your policy"],
] as const;

export default function StartLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const hoax = useHoax();
  const session = hoax.sample ? null : hoax.session;
  const { view, err, setErr, refresh } = useAccount(session, 2500);
  const linkedMarkets = view?.links ? Object.values(view.links).filter(Boolean).length : 0;
  const linked = view?.account?.status === "active";
  const ready = Boolean(session && hoax.signedIn);
  const done = (href: string) =>
    (href === "/start" && ready) ||
    (href === "/start/link" && linked) ||
    (href === "/start/gas" && linked && Boolean(view?.keyBalance && BigInt(view.keyBalance) >= KEY_GAS_FLOOR));
  // Gas and policy only make sense once the key is linked.
  const reachable = (href: string) => href === "/start" || (href === "/start/link" ? ready : ready && linked);
  // Steps past 01 are about the connected wallet's account: without one, back to step 01.
  // hoax.session is undefined while the wallet reconnects, and a signed-in wallet's account is
  // unknown until its first read: wait for both before deciding, so a reload of /start/gas stays there.
  const router = useRouter();
  const settled = hoax.session !== undefined && (!ready || view !== null || err !== null);
  const allowed = reachable(path);
  useEffect(() => {
    if (settled && !allowed) router.replace("/start");
  }, [settled, allowed, router]);

  return (
    <StartContext.Provider value={{ session, view, err, setErr, refresh, linked, linkedMarkets }}>
      <section className="st-head">
        <div className="st-head-l">
          <Eyebrow>Get protected / 2 minutes</Eyebrow>
          <Split as="h1" className="h1">
            Get protected
          </Split>
          <p className="txt" data-reveal>
            Connect the wallet you trade with, link a trade-only Hoax key in one transaction, fund its gas and choose when it acts.
          </p>
        </div>
        <div className="st-head-r">
          <span className="st-engine">
            <EngineBadge chainId={session?.chainId} />
          </span>
        </div>
      </section>

      <nav aria-label="Onboarding steps">
        <ol className="st-rail">
          {STEPS.map(([href, num, title]) => {
            const on = path === href;
            const isDone = done(href) && !on;
            const open = reachable(href);
            const cls = `st-rail-i${on ? " on" : isDone ? " done" : !open ? " locked" : ""}`;
            const status = on ? "Current step" : isDone ? "Done" : open ? "Open" : "Locked";
            const body = (
              <>
                <span className="eyebrow">
                  {num.slice(0, 2)}
                  <span className="st-rail-w">{num.slice(2)}</span>
                </span>
                <span className="st-rail-t">{title}</span>
                <span className="st-rail-s">
                  <i aria-hidden>{isDone ? "✓" : ""}</i>
                  <span>{status}</span>
                </span>
              </>
            );
            return (
              <li key={href} style={{ display: "contents" }}>
                {open ? (
                  <Link href={href} className={cls} aria-current={on ? "step" : undefined}>
                    {body}
                  </Link>
                ) : (
                  <span className={cls} aria-disabled="true">
                    {body}
                  </span>
                )}
              </li>
            );
          })}
        </ol>
      </nav>

      <div className="st-body">
        {err && <p className="note bad">{err}</p>}
        {allowed ? (
          children
        ) : (
          <div className="card st-wait">
            <LogoLoader label={settled ? "Connect your wallet first…" : "Reading your wallet…"} />
          </div>
        )}
      </div>
    </StartContext.Provider>
  );
}
