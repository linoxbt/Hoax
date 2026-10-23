// Line drawings for the home page, all drawn here: isometric problem studies,
// the intro tower of health bars, the use-case composition and the extruded
// mark. Thin grey construction lines, ink where it matters, one orange accent.

const C = Math.cos(Math.PI / 6);
const S = 0.5;
/** Isometric projection around an origin. */
const iso = (ox: number, oy: number) => (x: number, y: number, z: number) => [ox + (x - y) * C, oy + (x + y) * S - z] as const;
const pts = (a: ReadonlyArray<readonly [number, number]>) => a.map((p) => p.join(",")).join(" ");

const GREY = "#9a9a96";

/** An isometric box as three visible faces. */
function Box({ p, x, y, z, w, d, h, fill = "none", stroke = GREY, dash }: { p: ReturnType<typeof iso>; x: number; y: number; z: number; w: number; d: number; h: number; fill?: string; stroke?: string; dash?: string }) {
  const top = [p(x, y, z + h), p(x + w, y, z + h), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const left = [p(x, y + d, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x, y + d, z + h)];
  const right = [p(x + w, y, z), p(x + w, y + d, z), p(x + w, y + d, z + h), p(x + w, y, z + h)];
  return (
    <g stroke={stroke} strokeWidth="1" fill={fill} strokeDasharray={dash} strokeLinejoin="round">
      <polygon points={pts(top)} />
      <polygon points={pts(left)} />
      <polygon points={pts(right)} />
    </g>
  );
}

/** [01] Forced: a position block with the engine's cut through it. */
export function ArtForced() {
  const p = iso(100, 70);
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <Box p={p} x={-40} y={-40} z={0} w={80} d={80} h={40} />
      <Box p={p} x={-40} y={-40} z={46} w={80} d={80} h={22} dash="3 3" />
      <polyline points={pts([p(-60, -60, 43), p(60, -60, 43), p(60, 60, 43), p(-60, 60, 43), p(-60, -60, 43)])} fill="none" stroke="#282828" strokeWidth="1" />
      <line x1={p(60, 60, 43)[0]} y1={p(60, 60, 43)[1]} x2={p(60, 60, 43)[0] + 26} y2={p(60, 60, 43)[1] + 14} stroke={GREY} strokeWidth="1" />
    </svg>
  );
}

/** [02] Blind: a dial whose needle drifts with nobody watching. */
export function ArtBlind() {
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <circle cx="100" cy="100" r="62" fill="none" stroke={GREY} strokeWidth="1" />
      <circle cx="100" cy="100" r="48" fill="none" stroke={GREY} strokeWidth="1" strokeDasharray="2 4" />
      {Array.from({ length: 24 }, (_, i) => {
        const a = (i / 24) * Math.PI * 2;
        const r1 = i % 6 === 0 ? 54 : 58;
        return <line key={i} x1={100 + Math.cos(a) * r1} y1={100 + Math.sin(a) * r1} x2={100 + Math.cos(a) * 62} y2={100 + Math.sin(a) * 62} stroke={GREY} strokeWidth="1" />;
      })}
      <line x1="100" y1="100" x2="138" y2="128" stroke="#282828" strokeWidth="1.2" />
      <circle cx="100" cy="100" r="3" fill="#282828" />
      <line x1="30" y1="100" x2="170" y2="100" stroke={GREY} strokeWidth="0.6" strokeDasharray="1 3" />
      <line x1="100" y1="30" x2="100" y2="170" stroke={GREY} strokeWidth="0.6" strokeDasharray="1 3" />
    </svg>
  );
}

/** [03] Blunt: a stop-loss removes the whole stack, not a slice. */
export function ArtBlunt() {
  const p = iso(100, 62);
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <Box key={i} p={p} x={-36} y={-36} z={i * 22} w={72} d={72} h={16} dash={i > 0 ? "3 3" : undefined} />
      ))}
      <line x1={p(-36, 36, 0)[0]} y1={p(-36, 36, 0)[1]} x2={p(-36, 36, 88)[0]} y2={p(-36, 36, 88)[1]} stroke="#282828" strokeWidth="1" />
      <line x1={p(-36, 36, 0)[0] - 6} y1={p(-36, 36, 0)[1]} x2={p(-36, 36, 0)[0] + 6} y2={p(-36, 36, 0)[1]} stroke="#282828" strokeWidth="1" />
      <line x1={p(-36, 36, 88)[0] - 6} y1={p(-36, 36, 88)[1]} x2={p(-36, 36, 88)[0] + 6} y2={p(-36, 36, 88)[1]} stroke="#282828" strokeWidth="1" />
    </svg>
  );
}

/** [04] Costly: three slabs, the bottom one shaved off as the penalty. */
export function ArtCostly() {
  const p = iso(100, 58);
  return (
    <svg viewBox="0 0 200 200" className="art" aria-hidden>
      <Box p={p} x={-44} y={-44} z={0} w={88} d={88} h={14} />
      <Box p={p} x={-44} y={-44} z={30} w={88} d={88} h={14} />
      <Box p={p} x={-44} y={-44} z={60} w={88} d={88} h={14} />
      <Box p={p} x={44} y={-44} z={0} w={10} d={88} h={14} stroke="#282828" />
      {[0, 30, 60].map((z) => (
        <line key={z} x1={p(-44, 44, z)[0]} y1={p(-44, 44, z)[1]} x2={p(-44, 44, z + 30)[0]} y2={p(-44, 44, z + 30)[1]} stroke={GREY} strokeWidth="0.8" strokeDasharray="2 3" />
      ))}
    </svg>
  );
}

/** The intro panel: a tower of health bars, the last few trimmed, under an orange sun. */
export function ArtTower() {
  const bars = Array.from({ length: 22 }, (_, i) => {
    const t = i / 21;
    const h = 520 - Math.pow(t, 1.6) * 330 + Math.sin(i * 1.3) * 18;
    return { x: 120 + i * 24, h };
  });
  return (
    <svg viewBox="0 0 800 820" className="art-fill" aria-hidden preserveAspectRatio="xMidYMid slice">
      <defs>
        <pattern id="tower-hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <line x1="0" y1="0" x2="0" y2="5" stroke="#282828" strokeWidth="1.2" />
        </pattern>
      </defs>
      <circle cx="520" cy="250" r="150" fill="#fa3600" />
      {Array.from({ length: 18 }, (_, i) => (
        <circle key={i} cx={430 + ((i * 37) % 160)} cy={380 + ((i * 53) % 40)} r={2 + (i % 4)} fill="#fa3600" opacity={0.85} />
      ))}
      {bars.map((b, i) => (
        <g key={i}>
          <rect x={b.x} y={700 - b.h} width="14" height={b.h} fill={i % 3 === 0 ? "url(#tower-hatch)" : "#282828"} />
          <rect x={b.x + 14} y={700 - b.h + 6} width="6" height={b.h - 6} fill="#f5f5ef" stroke="#282828" strokeWidth="1" />
        </g>
      ))}
      <path d="M40 700 L760 700 M40 700 L0 760 M760 700 L800 760 M0 760 L800 760" stroke="#282828" strokeWidth="1.2" fill="none" />
      {Array.from({ length: 16 }, (_, i) => (
        <line key={i} x1={40 + i * 48} y1="700" x2={i * 53} y2="760" stroke="#282828" strokeWidth="0.6" />
      ))}
      <line x1="40" x2="760" y1="430" y2="430" stroke="#fa3600" strokeWidth="1.2" strokeDasharray="8 6" />
      <text x="760" y="420" textAnchor="end" fontFamily="var(--mono)" fontSize="13" fill="#fa3600">
        ACT · H 1.25
      </text>
    </svg>
  );
}

/** Use cases: an orange sun, a tall orange panel and a ramp of health bars. */
export function ArtCases() {
  return (
    <svg viewBox="0 0 800 900" className="art-fill" aria-hidden preserveAspectRatio="xMidYMid slice">
      <rect x="430" y="0" width="160" height="560" fill="#fa3600" opacity="0.9" />
      <circle cx="250" cy="560" r="190" fill="#fa3600" />
      <circle cx="560" cy="860" r="120" fill="#ebe7da" />
      <g transform="translate(230 900) skewX(-38)">
        {Array.from({ length: 30 }, (_, i) => (
          <rect key={i} x={i * 26} y={-120 - (i % 5) * 18 - i * 6} width="14" height={120 + (i % 5) * 18 + i * 6} fill={i % 4 === 0 ? "#f5f5ef" : "#282828"} stroke="#282828" />
        ))}
      </g>
      <line x1="0" x2="800" y1="770" y2="770" stroke="#282828" strokeWidth="1" />
    </svg>
  );
}

/** The mark, extruded in isometric with its construction lines. */
export function ArtMark3d() {
  const p = iso(400, 130);
  const depth = 40;
  // the H-step mark on a 64 grid, lifted into a slab
  const stems = [
    { x: 10.5, w: 11 },
    { x: 42.5, w: 11 },
  ];
  const k = 4.2;
  return (
    <svg viewBox="0 0 800 520" className="art-fill" aria-hidden>
      <circle cx="560" cy="170" r="70" fill="#fa3600" />
      {stems.map((s, i) => (
        <Box key={i} p={p} x={(s.x - 32) * k} y={-depth / 2} z={0} w={s.w * k} d={depth} h={45 * k} stroke="#282828" fill="#f5f5ef" />
      ))}
      <polyline
        points={pts([p((21.5 - 32) * k, 0, 13 * k), p(0, 0, 13 * k), p(0, 0, 32 * k), p((42.5 - 32) * k, 0, 32 * k)])}
        fill="none"
        stroke="#fa3600"
        strokeWidth="9"
      />
      {[-200, 200].map((dx) => (
        <line key={dx} x1={400 + dx} x2={400 + dx} y1="40" y2="480" stroke={GREY} strokeWidth="0.6" strokeDasharray="2 4" />
      ))}
      <line x1="80" x2="720" y1={p(0, 0, 0)[1] + 34} y2={p(0, 0, 0)[1] + 34} stroke={GREY} strokeWidth="0.6" strokeDasharray="2 4" />
    </svg>
  );
}

/** Small cell icons for the feature rows. */
export function Icon({ kind }: { kind: "link" | "clock" | "slice" | "sign" }) {
  const common = { fill: "none", stroke: "#282828", strokeWidth: 1.2 } as const;
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
