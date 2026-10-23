import Link from "next/link";

const LINKS = [
  ["/app", "Positions"],
  ["/app/receipts", "Receipts"],
  ["/stats", "Record"],
  ["/replay", "Replay"],
] as const;

export function Header() {
  return (
    <header className="top">
      <div className="wrap">
        <div className="bar">
          <nav>
            {LINKS.map(([href, label]) => (
              <Link key={href} href={href}>
                {label}
              </Link>
            ))}
          </nav>
          <Link href="/" className="mark striate" aria-label="Hoax home">
            Hoax
          </Link>
          <div className="right">
            <span className="net">Somnia testnet</span>
            <Link href="/start" className="pill">
              Protect positions
            </Link>
          </div>
        </div>
        <nav className="mobile-nav">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </header>
  );
}
