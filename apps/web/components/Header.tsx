"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  ["/how-it-works", "How it works"],
  ["/security", "Security"],
  ["/stats", "Record"],
  ["/replay", "Replay"],
] as const;

export function Header() {
  const path = usePathname();
  const on = (href: string) => (path === href || path.startsWith(`${href}/`) ? "on" : undefined);
  return (
    <header className="top">
      <div className="wrap">
        <div className="bar">
          <nav>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href} className={on(href)}>
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="mark striate" aria-label="Hoax home">
            Hoax
          </Link>
          <div className="right">
            <span className="net">Somnia testnet</span>
            <Link href="/app" className="pill ghost">
              Open app
            </Link>
            <Link href="/start" className="pill">
              Protect positions
            </Link>
          </div>
        </div>
        <nav className="mobile-nav">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={on(href)}>
              {label}
            </Link>
          ))}
          <Link href="/app" className={on("/app")}>
            App
          </Link>
        </nav>
      </div>
    </header>
  );
}
