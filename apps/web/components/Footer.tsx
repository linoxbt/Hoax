import Link from "next/link";
import { Logo } from "./Logo";

export function Footer() {
  return (
    <footer className="foot sec deep">
      <div className="wrap pad-s">
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div>
            <Logo size={36} />
            <p className="lede" style={{ maxWidth: 420, marginTop: 20 }}>
              Liquidation protection for perpetual futures. Non-custodial. Provable on-chain.
            </p>
          </div>
          <div className="row cap" style={{ gap: 28 }}>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/security">Security</Link>
            <Link href="/stats">Track record</Link>
            <Link href="/app">Launch app</Link>
            <a href="https://github.com/linoxbt/Hoax">GitHub ↗</a>
          </div>
        </div>
        <div className="striate xl" style={{ marginTop: 48, display: "block", textAlign: "center" }} aria-hidden data-reveal>
          Hoax
        </div>
        <div className="spread cap soft" style={{ marginTop: 24 }}>
          <span>© Hoax · Built on dreamDEX, Somnia</span>
          <span>Testnet</span>
        </div>
      </div>
    </footer>
  );
}
