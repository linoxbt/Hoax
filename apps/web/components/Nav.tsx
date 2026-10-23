import Link from "next/link";

export function Nav() {
  return (
    <header className="nav">
      <div className="wrap">
        <Link href="/" className="brand">
          Hoax
        </Link>
        <Link href="/app" className="link">
          Positions
        </Link>
        <Link href="/app/receipts" className="link">
          Receipts
        </Link>
        <Link href="/stats" className="link">
          Stats
        </Link>
        <Link href="/replay" className="link">
          Replay
        </Link>
        <Link href="/start" className="link">
          Start
        </Link>
      </div>
    </header>
  );
}
