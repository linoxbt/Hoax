// Line drawings for the home page, all drawn here. Each one shows the thing its
// copy says: the engine's sweep through the book, health drifting overnight, a
// stop against a slice, the penalty on the way out, the two exits side by side,
// and the traders it is for. Thin grey construction lines,
// ink where it matters, one orange accent.

const GREY = "#9a9a96";
const INK = "#282828";
const ORANGE = "#fa3600";
const PAPER = "#f5f5ef";
const MONO = "var(--mono)";

function T({ x, y, children, size = 10, fill = INK, anchor = "start" }: { x: number; y: number; children: React.ReactNode; size?: number; fill?: string; anchor?: "start" | "middle" | "end" }) {
  return (
    <text x={x} y={y} fontFamily={MONO} fontSize={size} fill={fill} textAnchor={anchor} style={{ textTransform: "uppercase" }}>
      {children}
    </text>
  );
}

function Hatch({ id, color = INK, gap = 4 }: { id: string; color?: string; gap?: number }) {
  return (
    <pattern id={id} width={gap} height={gap} patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <line x1="0" y1="0" x2="0" y2={gap} stroke={color} strokeWidth="1" />
    </pattern>
  );
}

/** [01] Forced: the engine market-sells the whole position down the bid ladder. */
export function ArtForced() {
  const bids = [70, 46, 58, 34, 52, 40, 64];
  const row = (i: number) => 52 + i * 17;
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <defs>
        <Hatch id="forced-h" color={ORANGE} />
      </defs>
      <T x={20} y={22} fill={GREY}>
        Bid book
      </T>
      <line x1="20" x2="180" y1={row(0) - 9} y2={row(0) - 9} stroke={INK} strokeDasharray="2 3" />
      <T x={180} y={row(0) - 12} anchor="end">
        Mark
      </T>
      {bids.map((w, i) => (
        <g key={i}>
          <rect x={180 - w} y={row(i) - 6} width={w} height="12" fill={i < 5 ? "url(#forced-h)" : "none"} stroke={i < 5 ? ORANGE : GREY} />
          <T x={180 - w - 4} y={row(i) + 3} anchor="end" fill={GREY} size={8}>
            {(81.7 - i * 0.14).toFixed(2)}
          </T>
        </g>
      ))}
      {/* the sweep */}
      <line x1="34" x2="34" y1={row(0) - 6} y2={row(4) + 6} stroke={ORANGE} strokeWidth="1.6" />
      <path d={`M29 ${row(4)} L34 ${row(4) + 8} L39 ${row(4)}`} fill="none" stroke={ORANGE} strokeWidth="1.6" />
      <rect x="14" y={row(0) - 20} width="40" height="13" fill={INK} />
      <T x={34} y={row(0) - 10} anchor="middle" fill="#fff" size={9}>
        Engine
      </T>
      <T x={14} y={row(4) + 26} fill={ORANGE} size={10}>
        Sells 100%
      </T>
      {/* the spread it pays */}
      <path d={`M184 ${row(0) - 6} h4 v${row(4) - row(0) + 12} h-4`} fill="none" stroke={INK} />
      <g transform={`translate(194 ${row(2)}) rotate(90)`}>
        <T x={0} y={0} anchor="middle" size={9}>
          Spread
        </T>
      </g>
    </svg>
  );
}

/** [02] Blind: health on a dial at 3 a.m., the needle drifting into the danger arc. */
export function ArtBlind() {
  const cx = 100;
  const cy = 112;
  const r = 62;
  // the dial runs from health 1.0 (left) to 3.0 (right) across the top half
  const ang = (h: number) => Math.PI + ((h - 1) / 2) * Math.PI;
  const at = (h: number, rr: number) => [cx + Math.cos(ang(h)) * rr, cy + Math.sin(ang(h)) * rr] as const;
  const arc = (h1: number, h2: number, rr: number) => {
    const [x1, y1] = at(h1, rr);
    const [x2, y2] = at(h2, rr);
    return `M${x1} ${y1} A${rr} ${rr} 0 0 ${h2 > h1 ? 1 : 0} ${x2} ${y2}`;
  };
  const [nx, ny] = at(1.18, 50);
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <path d={arc(1, 3, r)} fill="none" stroke={GREY} />
      <path d={arc(1, 1.25, r)} fill="none" stroke={ORANGE} strokeWidth="5" />
      {Array.from({ length: 21 }, (_, i) => {
        const h = 1 + i * 0.1;
        const [x1, y1] = at(h, i % 5 === 0 ? 52 : 56);
        const [x2, y2] = at(h, r - 3);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={GREY} />;
      })}
      <T x={at(1, 66)[0]} y={cy + 4} anchor="end" size={9}>
        1.0
      </T>
      <T x={at(3, 66)[0]} y={cy + 4} size={9} fill={GREY}>
        3.0
      </T>
      <T x={at(2, 72)[0]} y={at(2, 72)[1]} anchor="middle" size={9} fill={GREY}>
        2.0
      </T>
      {/* the drift: where it was at midnight, where it is now */}
      <path d={arc(2.4, 1.22, 40)} fill="none" stroke={INK} strokeDasharray="2 3" />
      <line x1={cx} y1={cy} x2={nx} y2={ny} stroke={INK} strokeWidth="1.6" />
      <circle cx={cx} cy={cy} r="3.5" fill={INK} />
      <T x={cx} y={cy + 24} anchor="middle" size={12}>
        Health 1.18
      </T>
      <T x={cx} y={cy + 40} anchor="middle" size={9} fill={GREY}>
        03:12 · Mark −4.1%
      </T>
      {/* the hour nobody is watching */}
      <path d="M160 22 a10 10 0 1 0 10 14 a8 8 0 1 1 -10 -14 z" fill="none" stroke={INK} />
    </svg>
  );
}

/** [03] Blunt: a stop closes the whole stack; a slice would have done. */
export function ArtBlunt() {
  const Stack = ({ x, label, cut, note }: { x: number; label: string; cut: number; note: string }) => (
    <g>
      <T x={x + 30} y={34} anchor="middle" fill={GREY}>
        {label}
      </T>
      {[0, 1, 2, 3].map((i) => {
        const y = 48 + i * 26;
        const gone = i < cut;
        return <rect key={i} x={x} y={y} width="60" height="20" fill={gone ? "none" : PAPER} stroke={gone ? (cut === 1 ? ORANGE : GREY) : INK} strokeDasharray={gone ? "3 3" : undefined} />;
      })}
      <line x1={x} x2={x + 60} y1={48 + 4 * 26 + 6} y2={48 + 4 * 26 + 6} stroke={INK} />
      <T x={x + 30} y={48 + 4 * 26 + 22} anchor="middle" size={12} fill={cut === 1 ? ORANGE : INK}>
        {note}
      </T>
    </g>
  );
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <Stack x={22} label="Stop-loss" cut={4} note="−100%" />
      <Stack x={118} label="Hoax" cut={1} note="−25%" />
      {/* the stop's line through every slice */}
      <line x1="16" x2="88" y1="100" y2="100" stroke={INK} />
      <line x1="16" x2="16" y1="96" y2="104" stroke={INK} />
      <T x={52} y={186} anchor="middle" size={9} fill={GREY}>
        Position gone
      </T>
      <T x={148} y={186} anchor="middle" size={9} fill={GREY}>
        Trade kept
      </T>
    </svg>
  );
}

/** [04] Costly: equity before, after a liquidation, and after a Hoax trim. */
export function ArtCostly() {
  const W = 150;
  const rowY = [46, 96, 146];
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <defs>
        <Hatch id="costly-h" />
      </defs>
      {/* before */}
      <T x={24} y={rowY[0] - 6} fill={GREY}>
        Equity
      </T>
      <rect x="24" y={rowY[0]} width={W} height="16" fill={PAPER} stroke={INK} />
      {/* after liquidation: penalty and spread cut away */}
      <T x={24} y={rowY[1] - 6} fill={GREY}>
        After liquidation
      </T>
      <rect x="24" y={rowY[1]} width={W - 46} height="16" fill={PAPER} stroke={INK} />
      <rect x={24 + W - 46} y={rowY[1]} width="22" height="16" fill={ORANGE} />
      <rect x={24 + W - 24} y={rowY[1]} width="24" height="16" fill="url(#costly-h)" stroke={INK} />
      <T x={24 + W - 26} y={rowY[1] + 28} anchor="end" size={9} fill={ORANGE}>
        100 bps
      </T>
      <T x={24 + W - 22} y={rowY[1] + 28} size={9}>
        Spread
      </T>
      {/* after a trim: a sliver of fees */}
      <T x={24} y={rowY[2] - 6} fill={GREY}>
        After Hoax
      </T>
      <rect x="24" y={rowY[2]} width={W - 5} height="16" fill={PAPER} stroke={INK} />
      <rect x={24 + W - 5} y={rowY[2]} width="5" height="16" fill={INK} />
      <T x={24 + W} y={rowY[2] + 28} anchor="end" size={9}>
        Fee only
      </T>
      <line x1={24 + W} x2={24 + W} y1={rowY[0] - 2} y2={rowY[2] + 18} stroke={GREY} strokeDasharray="2 3" />
    </svg>
  );
}

/**
 * The intro: the same slide toward liquidation, twice. Above, nobody acts and
 * the engine closes everything at 1.0. Below, Hoax trims a slice at 1.25 and
 * the position lives on at 1.6.
 */
export function ArtTower() {
  const X0 = 80;
  const X1 = 740;
  const xs = (t: number) => X0 + t * (X1 - X0);
  // health over time, shared until the trigger
  const path = (y: (h: number) => number, hoax: boolean) => {
    const out: string[] = [];
    for (let i = 0; i <= 60; i++) {
      const t = i / 60;
      let h = 2.4 - 1.5 * Math.min(1, t / 0.55) + Math.sin(i * 0.8) * 0.05;
      if (hoax && t >= 0.45) h = t < 0.47 ? 1.25 : 1.6 + Math.sin(i * 0.7) * 0.05 - (t - 0.47) * 0.15;
      if (!hoax && t >= 0.55) break;
      out.push(`${i ? "L" : "M"}${xs(t).toFixed(1)} ${y(Math.max(0.95, h)).toFixed(1)}`);
    }
    return out.join(" ");
  };
  const panel = (top: number, hoax: boolean) => {
    const y = (h: number) => top + 30 + (1 - (h - 0.8) / 2) * 160;
    const sizeY = top + 214;
    return (
      <g>
        <T x={X0} y={top + 12} size={13} fill={hoax ? ORANGE : INK}>
          {hoax ? "With Hoax" : "Without Hoax"}
        </T>
        <rect x={X0} y={top + 24} width={X1 - X0} height="172" fill="none" stroke={GREY} />
        {[1, 1.6, 2.4].map((h) => (
          <g key={h}>
            <line x1={X0} x2={X1} y1={y(h)} y2={y(h)} stroke={h === 1 ? INK : GREY} strokeDasharray={h === 1 ? "8 5" : "2 5"} />
            <T x={X0 - 10} y={y(h) + 4} anchor="end" size={11} fill={h === 1 ? INK : GREY}>
              {h.toFixed(1)}
            </T>
          </g>
        ))}
        <T x={X1 - 8} y={y(1) - 8} anchor="end" size={11}>
          Liquidation
        </T>
        <path d={path(y, hoax)} fill="none" stroke={INK} strokeWidth="2.2" />
        {hoax ? (
          <g>
            <line x1={X0} x2={X1} y1={y(1.25)} y2={y(1.25)} stroke={ORANGE} strokeDasharray="8 6" />
            <rect x={xs(0.46) - 9} y={y(1.25) - 9} width="18" height="18" fill={ORANGE} />
            <line x1={xs(0.46)} x2={xs(0.46)} y1={y(1.25) - 9} y2={y(1.6) + 4} stroke={ORANGE} strokeWidth="2" />
            <T x={xs(0.46) + 16} y={y(1.25) + 22} size={11} fill={ORANGE}>
              Trim 18% at 1.25 → 1.60
            </T>
          </g>
        ) : (
          <g>
            <rect x={xs(0.55) - 9} y={y(1) - 9} width="18" height="18" fill={INK} />
            <T x={xs(0.55) + 16} y={y(1) - 14} size={11}>
              Engine closes 100% + penalty
            </T>
          </g>
        )}
        {/* position size underneath */}
        <T x={X0 - 10} y={sizeY + 12} anchor="end" size={11} fill={GREY}>
          Size
        </T>
        {Array.from({ length: 33 }, (_, i) => {
          const t = i / 32;
          const k = hoax ? (t < 0.46 ? 1 : 0.82) : t < 0.55 ? 1 : 0;
          return k > 0 ? (
            <rect key={i} x={xs(t) - 6} y={sizeY + 20 - 20 * k} width="12" height={20 * k} fill={hoax && t >= 0.46 ? ORANGE : INK} opacity={hoax && t >= 0.46 ? 0.85 : 1} />
          ) : (
            <rect key={i} x={xs(t) - 6} y={sizeY} width="12" height="20" fill="none" stroke={GREY} strokeDasharray="2 2" />
          );
        })}
      </g>
    );
  };
  return (
    <svg viewBox="0 0 800 560" className="art-fill" aria-hidden preserveAspectRatio="xMidYMid meet" style={{ padding: "2.4rem" }}>
      {panel(10, false)}
      {panel(290, true)}
    </svg>
  );
}

/** Use cases: one small study per kind of trader, in a 2 by 3 sheet. */
export function ArtCases() {
  const cells: Array<[string, React.ReactNode]> = [
    [
      "Swing",
      // a multi-day hold: daily candles, nights shaded
      <g key="s">
        {[0, 1, 2].map((d) => (
          <rect key={d} x={40 + d * 100 + 60} y="40" width="40" height="150" fill={GREY} opacity="0.12" />
        ))}
        {Array.from({ length: 12 }, (_, i) => {
          const o = 120 - Math.sin(i * 0.9) * 30 - i * 3;
          const c = o - 14 + ((i * 7) % 28);
          return (
            <g key={i}>
              <line x1={52 + i * 26} x2={52 + i * 26} y1={Math.min(o, c) - 12} y2={Math.max(o, c) + 12} stroke={INK} />
              <rect x={46 + i * 26} y={Math.min(o, c)} width="12" height={Math.abs(o - c) + 2} fill={c < o ? PAPER : INK} stroke={INK} />
            </g>
          );
        })}
        <T x={40} y={210} size={11} fill={GREY}>
          Day 1 · Day 2 · Day 3
        </T>
      </g>,
    ],
    [
      "Market makers",
      // a two-sided book with the inventory skew
      <g key="m">
        {[0, 1, 2, 3, 4].map((i) => (
          <g key={i}>
            <rect x={200 - 30 - i * 26} y={60 + i * 26} width={30 + i * 26} height="18" fill={INK} />
            <rect x={210} y={60 + i * 26} width={20 + i * 30} height="18" fill="none" stroke={INK} />
          </g>
        ))}
        <line x1="205" x2="205" y1="44" y2="200" stroke={ORANGE} strokeWidth="2" />
        <T x={60} y={210} size={11} fill={GREY}>
          Bids
        </T>
        <T x={300} y={210} size={11} fill={GREY}>
          Asks
        </T>
      </g>,
    ],
    [
      "Funds and desks",
      // many accounts, one policy, one receipt trail
      <g key="f">
        {[0, 1, 2, 3].map((i) => (
          <g key={i}>
            <rect x={60 + i * 18} y={50 + i * 18} width="150" height="100" fill={PAPER} stroke={INK} />
            <line x1={72 + i * 18} x2={190 + i * 18} y1={74 + i * 18} y2={74 + i * 18} stroke={GREY} />
            <line x1={72 + i * 18} x2={160 + i * 18} y1={90 + i * 18} y2={90 + i * 18} stroke={GREY} />
          </g>
        ))}
        <rect x={252} y={140} width="18" height="18" fill={ORANGE} />
        <T x={276} y={154} size={11}>
          Signed
        </T>
      </g>,
    ],
    [
      "Trading bots",
      // a heartbeat with a gap where the bot went down, covered by Hoax
      <g key="b">
        <path d="M40 120 h40 l10 -40 l12 70 l10 -30 h40" fill="none" stroke={INK} strokeWidth="1.6" />
        <path d="M152 120 h70" fill="none" stroke={GREY} strokeDasharray="3 4" />
        <path d="M222 120 h20 l10 -40 l12 70 l10 -30 h60" fill="none" stroke={INK} strokeWidth="1.6" />
        <rect x="152" y="84" width="70" height="72" fill="none" stroke={ORANGE} />
        <T x={187} y={176} anchor="middle" size={11} fill={ORANGE}>
          Bot down · Hoax on
        </T>
      </g>,
    ],
    [
      "Part-time",
      // a clock face: the hours away from the screen
      <g key="p">
        <circle cx="190" cy="118" r="72" fill="none" stroke={INK} />
        <path d="M190 118 L190 46 A72 72 0 0 1 252 154 Z" fill={ORANGE} opacity="0.9" />
        {Array.from({ length: 12 }, (_, i) => {
          const a = (i / 12) * Math.PI * 2;
          return <line key={i} x1={190 + Math.sin(a) * 62} y1={118 - Math.cos(a) * 62} x2={190 + Math.sin(a) * 72} y2={118 - Math.cos(a) * 72} stroke={INK} />;
        })}
        <T x={270} y={70} size={11}>
          Away
        </T>
      </g>,
    ],
    [
      "High leverage",
      // health a hair above 1.0: the buffer is thin
      <g key="h">
        <line x1="40" x2="340" y1="160" y2="160" stroke={INK} strokeDasharray="8 5" />
        <T x={340} y={178} anchor="end" size={11}>
          1.0
        </T>
        <line x1="40" x2="340" y1="130" y2="130" stroke={ORANGE} strokeDasharray="6 5" />
        <path d="M40 90 C 90 100, 120 140, 160 132 S 220 92, 260 124 S 320 140, 340 120" fill="none" stroke={INK} strokeWidth="1.6" />
        <T x={40} y={120} size={11} fill={ORANGE}>
          1.25
        </T>
      </g>,
    ],
  ];
  return (
    <svg viewBox="0 0 800 720" className="art-fill" aria-hidden preserveAspectRatio="xMidYMid meet">
      {cells.map(([label, body], i) => {
        const x = (i % 2) * 400;
        const y = Math.floor(i / 2) * 240;
        return (
          <g key={label} transform={`translate(${x} ${y})`}>
            <rect x="0.5" y="0.5" width="399" height="239" fill="none" stroke="#b3b3af" />
            <T x={16} y={24} size={11}>
              {`[0${i + 1}] ${label}`}
            </T>
            {body}
          </g>
        );
      })}
    </svg>
  );
}

/** Small cell icons for the feature rows. */
export function Icon({ kind }: { kind: "link" | "clock" | "slice" | "sign" }) {
  const common = { fill: "none", stroke: INK, strokeWidth: 1.2 } as const;
  return (
    <svg viewBox="0 0 32 32" width="100%" height="100%" aria-hidden>
      <circle cx="16" cy="16" r="15" {...common} stroke="#b3b3af" />
      {kind === "link" && <path d="M11 18l-2 2a3 3 0 004 4l3-3a3 3 0 000-4M21 14l2-2a3 3 0 00-4-4l-3 3a3 3 0 000 4" {...common} />}
      {kind === "clock" && <path d="M16 9v7l5 3" {...common} />}
      {kind === "slice" && <path d="M9 21h14M9 16h14M9 11h9" {...common} />}
      {kind === "sign" && <path d="M9 21c3-6 5-8 6-8s-1 6 1 6 3-4 5-4M9 24h14" {...common} />}
    </svg>
  );
}
