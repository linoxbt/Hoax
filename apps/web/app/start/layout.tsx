"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { EngineBadge } from "@/components/EngineBadge";
import { KEY_GAS_FLOOR } from "@/lib/format";
import { LogoLoader } from "@/components/Logo";
import { Label, Split } from "@/components/Ui";
import { StartContext } from "@/lib/startContext";
import { useAccount } from "@/lib/useAccount";
import { useHoax } from "@/lib/wallet";

const STEPS = [
  ["/start", "01 Wallet"],
  ["/start/link", "02 Link"],
  ["/start/gas", "03 Gas"],
  ["/start/policy", "04 Policy"],
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
  // hoax.session is undefined while the wallet reconnects, so wait for it before deciding.
  const router = useRouter();
  const settled = hoax.session !== undefined;
  const allowed = reachable(path);
  useEffect(() => {
    if (settled && !allowed) router.replace("/start");
  }, [settled, allowed, router]);

  return (
    <StartContext.Provider value={{ session, view, err, setErr, refresh, linked, linkedMarkets }}>
      <section className="sec first">
        <div className="between" style={{ padding: "6.4rem var(--pad) 3.2rem", alignItems: "flex-end" }}>
          <div>
            <Label dot>Get protected · 2 minutes</Label>
            <Split as="h1" className="h1">
              Get protected
            </Split>
          </div>
          <EngineBadge chainId={session?.chainId} />
        </div>
        <div>
          <div className="rail">
            {STEPS.map(([href, label]) => {
              const cls = [path === href ? "on" : "", done(href) && path !== href ? "done" : ""].join(" ").trim() || undefined;
              return reachable(href) ? (
                <Link key={href} href={href} className={cls}>
                  {label}
                </Link>
              ) : (
                <span key={href} className={cls}>
                  {label}
                </span>
              );
            })}
          </div>
        </div>
      </section>
      <section className="sec">
        <div className="pad start-body">
          {err && (
            <p className="note bad" style={{ marginBottom: "2.4rem" }}>
              {err}
            </p>
          )}
          {allowed ? children : <LogoLoader label={settled ? "Connect your wallet first…" : "Reading your wallet…"} />}
        </div>
      </section>
    </StartContext.Provider>
  );
}
