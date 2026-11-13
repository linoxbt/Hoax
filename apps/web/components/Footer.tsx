"use client";
import Link from "next/link";
import { useHoax } from "@/lib/wallet";
import { EngineBadge } from "./EngineBadge";
import { Logo } from "./Logo";

const COLS: Array<{ title: string; links: Array<[string, string, boolean?]> }> = [
  { title: "Product", links: [["/start", "Get protected"], ["/app", "Dashboard"], ["/markets", "Markets"], ["/replay", "Replay"]] },
  { title: "Resources", links: [["/how-it-works", "How it works"], ["/security", "Security"], ["/stats", "Track record"]] },
  { title: "Build", links: [["https://github.com/linoxbt/Hoax", "GitHub", true], ["https://app.testnet.dreamdex.io", "dreamDEX", true], ["https://x.com/DreamDEXSomnia", "@DreamDEXSomnia", true]] },
];

export function Footer() {
  const { wallet } = useHoax();
  return (
    <footer className="footer">
      <div className="footer-top">
        <div className="stack" style={{ gap: "2rem" }}>
          <Link href="/" aria-label="Hoax home">
            <Logo size={30} />
          </Link>
          <p className="txt" style={{ maxWidth: "32rem" }}>
            Exit before the liquidation engine does. Liquidation protection for dreamDEX perps on Somnia.
          </p>
          <EngineBadge />
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <span className="mono-s">{c.title}</span>
            <div className="footer-links">
              {c.links
                .filter(([href]) => wallet || href !== "/app")
                .map(([href, label, ext]) =>
                  ext ? (
                    <a key={href} href={href} target="_blank" rel="noreferrer" style={{ justifySelf: "start" }}>
                      {label} ↗
                    </a>
                  ) : (
                    <Link key={href} href={href} style={{ justifySelf: "start" }}>
                      {label}
                    </Link>
                  ),
                )}
            </div>
          </div>
        ))}
      </div>
      <div className="footer-bar">
        <span>© 2026 Hoax · Apache-2.0, open source · Testnet</span>
        <a href="#top" onClick={(e) => (e.preventDefault(), window.scrollTo({ top: 0, behavior: "smooth" }))}>
          Back to top ↑
        </a>
      </div>
    </footer>
  );
}
