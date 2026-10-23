"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { EngineBadge } from "@/components/EngineBadge";
import { Kicker } from "@/components/Kicker";
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
    (href === "/start/gas" && linked && Boolean(view?.keyBalance && BigInt(view.keyBalance) > 10n ** 16n));
  const reachable = (href: string) => href === "/start" || ready;

  return (
    <StartContext.Provider value={{ session, view, err, setErr, refresh, linked, linkedMarkets }}>
      <section className="sec">
        <div className="wrap pad" style={{ paddingBottom: 32 }}>
          <div className="spread" style={{ alignItems: "center" }}>
            <Kicker>Get protected · 2 minutes</Kicker>
            <EngineBadge />
          </div>
          <h1 className="hero-in">Get protected</h1>
        </div>
        <div className="wrap">
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
        <div className="wrap pad" style={{ paddingTop: 48, minHeight: "48vh" }}>
          {err && (
            <p className="note bad" style={{ marginBottom: 28 }}>
              {err}
            </p>
          )}
          {children}
        </div>
      </section>
    </StartContext.Provider>
  );
}
