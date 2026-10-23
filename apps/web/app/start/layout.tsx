"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Kicker } from "@/components/Kicker";
import { StartContext } from "@/lib/startContext";
import { useAccount, useSession } from "@/lib/useAccount";

const STEPS = [
  ["/start", "01 Wallet"],
  ["/start/link", "02 Link"],
  ["/start/gas", "03 Gas"],
  ["/start/fee", "04 Builder fee"],
  ["/start/policy", "05 Policy"],
] as const;

export default function StartLayout({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const [session, setSession] = useSession();
  const { view, err, setErr, refresh } = useAccount(session, 2500);
  const linked = view?.account?.status === "active";
  const done = (href: string) =>
    (href === "/start" && Boolean(session)) || (href === "/start/link" && linked);
  const reachable = (href: string) => href === "/start" || Boolean(session);

  return (
    <StartContext.Provider value={{ session, setSession, view, err, setErr, refresh, linked }}>
      <section className="sec">
        <div className="wrap pad" style={{ paddingBottom: 32 }}>
          <Kicker>Onboarding · about two minutes</Kicker>
          <h1>Protect your positions</h1>
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
