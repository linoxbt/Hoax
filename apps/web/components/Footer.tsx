import Link from "next/link";
import { EngineBadge } from "./EngineBadge";
import { LogoMark } from "./Logo";

// The wordmark as a construction drawing: letter outlines with a tick at every
// vertex. The H keeps the mark's stepped crossbar.
const LETTERS: Array<{ outer: number[][]; inner?: number[][] }> = [
  { outer: [[0, 30], [50, 30], [50, 120], [85, 120], [85, 100], [120, 100], [120, 30], [170, 30], [170, 230], [120, 230], [120, 145], [85, 145], [85, 165], [50, 165], [50, 230], [0, 230]] },
  { outer: [[240, 30], [340, 30], [380, 70], [380, 190], [340, 230], [240, 230], [200, 190], [200, 70]], inner: [[262, 80], [318, 80], [330, 92], [330, 168], [318, 180], [262, 180], [250, 168], [250, 92]] },
  { outer: [[470, 30], [530, 30], [590, 230], [540, 230], [528, 190], [472, 190], [460, 230], [410, 230]], inner: [[485, 146], [515, 146], [500, 96]] },
  { outer: [[610, 30], [665, 30], [700, 92], [735, 30], [790, 30], [729, 130], [790, 230], [735, 230], [700, 168], [665, 230], [610, 230], [671, 130]] },
];

function Wordmark() {
  const pts = (p: number[][]) => p.map(([x, y]) => `${x},${y}`).join(" ");
  const ticks = LETTERS.flatMap((l) => [...l.outer, ...(l.inner ?? [])]);
  return (
    <svg viewBox="-12 0 814 260" role="img" aria-label="Hoax" data-reveal>
      <line x1="-12" x2="802" y1="230" y2="230" stroke="#b3b3af" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      <line x1="-12" x2="802" y1="30" y2="30" stroke="#b3b3af" strokeDasharray="2 4" vectorEffect="non-scaling-stroke" />
      {LETTERS.map((l, i) => (
        <g key={i} fill="none" stroke="#282828" strokeWidth="1.2" vectorEffect="non-scaling-stroke">
          <polygon points={pts(l.outer)} vectorEffect="non-scaling-stroke" />
          {l.inner && <polygon points={pts(l.inner)} vectorEffect="non-scaling-stroke" />}
        </g>
      ))}
      <g stroke="#282828" strokeWidth="0.8" vectorEffect="non-scaling-stroke">
        {ticks.map(([x, y], i) => (
          <g key={i}>
            <line x1={x - 5} x2={x + 5} y1={y} y2={y} vectorEffect="non-scaling-stroke" />
            <line x1={x} x2={x} y1={y - 5} y2={y + 5} vectorEffect="non-scaling-stroke" />
          </g>
        ))}
      </g>
      <rect x="83" y="131" width="4" height="4" fill="#fa3600" />
      <rect x="288" y="128" width="4" height="4" fill="#282828" />
    </svg>
  );
}

const COLS: Array<{ title: string; links: Array<[string, string, boolean?]> }> = [
  { title: "Product", links: [["/start", "Get protected"], ["/app", "Dashboard"], ["/markets", "Markets"], ["/replay", "Replay"]] },
  { title: "Resources", links: [["/how-it-works", "How it works"], ["/security", "Security"], ["/stats", "Track record"]] },
  { title: "Build", links: [["https://github.com/linoxbt/Hoax", "GitHub", true], ["https://app.testnet.dreamdex.io", "dreamDEX", true], ["https://x.com/DreamDEXSomnia", "X · @DreamDEXSomnia", true]] },
];

export function Footer() {
  return (
    <footer className="footer">
      <div className="footer-main">
        <div className="footer-col">
          <div className="blk grow">
            <p className="h4" style={{ maxWidth: "36rem" }}>
              Exit before the liquidation engine does
            </p>
          </div>
          <div className="blk">
            <span className="mono-s">Status</span>
            <EngineBadge />
          </div>
        </div>
        {COLS.map((c) => (
          <div className="footer-col" key={c.title}>
            <div className="blk grow">
              <span className="mono-s">{c.title}</span>
              <div className="footer-links">
                {c.links.map(([href, label, ext]) =>
                  ext ? (
                    <a key={href} href={href} target="_blank" rel="noreferrer" className="hover-un" style={{ justifySelf: "start" }}>
                      {label}
                    </a>
                  ) : (
                    <Link key={href} href={href} className="hover-un" style={{ justifySelf: "start" }}>
                      {label}
                    </Link>
                  ),
                )}
              </div>
            </div>
            <div className="blk">
              <span className="mono-s">{c.title === "Product" ? "Network" : c.title === "Resources" ? "Chain" : "Licence"}</span>
              <p className="txt ink">{c.title === "Product" ? "dreamDEX perps" : c.title === "Resources" ? "Somnia Hideki · 50383" : "MIT, open source"}</p>
            </div>
          </div>
        ))}
        <div className="footer-mark">
          <LogoMark size={140} still />
        </div>
      </div>
      <div className="footer-word">
        <span className="plus tl" aria-hidden />
        <span className="plus tr" aria-hidden />
        <span className="plus bl" aria-hidden />
        <span className="plus br" aria-hidden />
        <Wordmark />
      </div>
      <div className="footer-bar">
        <span>©2026 Hoax. Liquidation protection for dreamDEX perps.</span>
        <span>Testnet</span>
      </div>
    </footer>
  );
}
