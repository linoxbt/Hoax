import Link from "next/link";

export function Footer() {
  return (
    <footer className="foot">
      <div style={{ background: "var(--char)" }}>
        <div className="wrap pad-s">
          <div className="grid g3">
            <div className="cap">
              Hoax cuts a dreamDEX perp position down to safe size before liquidation can take it, and proves every save
              with a signed receipt.
            </div>
            <div className="cap">
              It trades a linked wallet and can never withdraw from it. Unlink the bot in dreamDEX to revoke it
              completely.
            </div>
            <div className="cap" style={{ display: "grid", gap: 4 }}>
              <Link href="/start">Protect positions</Link>
              <Link href="/stats">The record</Link>
              <Link href="/replay">Replay</Link>
              <a href="https://github.com/linoxbt/Hoax">Source</a>
            </div>
          </div>
          <div className="striate xl" style={{ marginTop: 48, display: "block", textAlign: "center" }} aria-hidden>
            Hoax
          </div>
          <div className="spread cap soft" style={{ marginTop: 24 }}>
            <span>dreamDEX perps · Somnia Tokyo testnet (chain 50383)</span>
            <span>Not financial advice. Testnet only.</span>
          </div>
        </div>
      </div>
    </footer>
  );
}
