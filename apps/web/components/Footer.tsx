import Link from "next/link";

export function Footer() {
  return (
    <footer className="foot sec deep">
      <div className="wrap pad-s">
        <div className="grid g4">
          <div className="cap soft" style={{ gridColumn: "span 2" }}>
            Hoax cuts a dreamDEX perp position down to safe size before liquidation can take it, and proves every save with
            a signed receipt. It trades a linked wallet and can never withdraw from it.
          </div>
          <div className="cap" style={{ display: "grid", gap: 4, alignContent: "start" }}>
            <span className="soft">Product</span>
            <Link href="/how-it-works">How it works</Link>
            <Link href="/security">Security</Link>
            <Link href="/stats">Record</Link>
            <Link href="/replay">Replay</Link>
          </div>
          <div className="cap" style={{ display: "grid", gap: 4, alignContent: "start" }}>
            <span className="soft">App</span>
            <Link href="/start">Protect positions</Link>
            <Link href="/app">Overview</Link>
            <Link href="/app/receipts">Receipts</Link>
            <a href="https://github.com/linoxbt/Hoax">Source ↗</a>
          </div>
        </div>
        <div className="striate xl" style={{ marginTop: 48, display: "block", textAlign: "center" }} aria-hidden>
          Hoax
        </div>
        <div className="spread cap soft" style={{ marginTop: 24 }}>
          <span>dreamDEX perps · Somnia Tokyo testnet (chain 50383)</span>
          <span>Testnet only · not financial advice</span>
        </div>
      </div>
    </footer>
  );
}
