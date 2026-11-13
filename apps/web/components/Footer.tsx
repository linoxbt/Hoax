"use client";
import Link from "next/link";
import { useHoax } from "@/lib/wallet";
import { EngineBadge } from "./EngineBadge";
import { Logo } from "./Logo";
import { Btn } from "./Ui";

const COLS: Array<{ title: string; links: Array<[string, string, boolean?]> }> = [
  { title: "Explore", links: [["/radar", "Radar"], ["/markets", "Markets"], ["/replay", "Replay"], ["/start", "Get protected"], ["/app", "Dashboard"]] },
  { title: "Go deeper", links: [["/how-it-works", "Our method"], ["/stats", "Track record"], ["/security", "Security"]] },
  { title: "Build", links: [["https://github.com/linoxbt/Hoax", "GitHub", true], ["https://app.testnet.dreamdex.io", "dreamDEX", true], ["https://x.com/DreamDEXSomnia", "@DreamDEXSomnia", true]] },
];

/** The closing band: one last call, then the site map, on Hoax blue. */
export function Footer() {
  const { wallet } = useHoax();
  return (
    <footer className="footer">
      <div className="footer-in">
        <div className="footer-cta">
          <div>
            <span className="cap">Before the engine does</span>
            <h2 className="display">Less noise. One clear signal.</h2>
          </div>
          <div style={{ paddingTop: "3.6rem" }}>
            <p>Watch every liquidation on dreamDEX as it happens. Then make sure the next one isn&apos;t yours.</p>
            <Btn href="/radar" white>
              Find your signal
            </Btn>
          </div>
        </div>
        <div className="footer-top">
          <div className="footer-brand">
            <Link href="/" aria-label="Hoax home">
              <Logo size={30} tone="white" />
            </Link>
            <p>Market intelligence for dreamDEX perps on Somnia, and the protection that acts on it.</p>
            <div style={{ marginTop: "2.4rem" }}>
              <EngineBadge />
            </div>
          </div>
          {COLS.map((c) => (
            <div key={c.title}>
              <span className="cap">{c.title}</span>
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
          <span>Research and protection tools on testnet, not investment advice. Apache-2.0, open source.</span>
          <a href="#top" onClick={(e) => (e.preventDefault(), window.scrollTo({ top: 0, behavior: "smooth" }))}>
            Back to top ↑
          </a>
        </div>
      </div>
    </footer>
  );
}
