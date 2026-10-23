// Vertical bars: Hoax's one recurring mark. Deterministic, so server and
// client render the same picture.

function rng(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

type Shape = "edge" | "story";

/** Heights in 0..1 for `n` bars. */
export function barHeights(n: number, shape: Shape, seed = 7): number[] {
  const rand = rng(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const x = i / (n - 1);
    let h: number;
    if (shape === "edge") {
      // A slow wave with ragged tips, like a torn edge between two sections.
      h = 0.35 + 0.25 * Math.sin(x * Math.PI * 2.2 + seed) + 0.12 * Math.sin(x * 37 + seed * 3) + rand() * 0.22;
    } else {
      // Health over time: a slide toward liquidation, one cut that restores it,
      // a second slide, a second cut, then calm.
      const slide1 = x < 0.42 ? 0.86 - x * 1.35 : 0;
      const after1 = x >= 0.42 && x < 0.7 ? 0.72 - (x - 0.42) * 1.1 : 0;
      const after2 = x >= 0.7 ? 0.7 + Math.sin((x - 0.7) * 9) * 0.03 : 0;
      h = slide1 + after1 + after2 + (rand() - 0.5) * 0.06;
    }
    out.push(Math.max(0.02, Math.min(1, h)));
  }
  return out;
}

export function Bars({
  n = 180,
  shape = "edge",
  seed = 7,
  hang = false,
  className = "bars",
  height,
  label,
}: {
  n?: number;
  shape?: Shape;
  seed?: number;
  /** Bars hang from the top instead of standing on the bottom. */
  hang?: boolean;
  className?: string;
  height?: number;
  label?: string;
}) {
  const hs = barHeights(n, shape, seed);
  const step = 3;
  return (
    <svg
      className={className}
      viewBox={`0 0 ${n * step} 100`}
      preserveAspectRatio="none"
      style={height ? { height } : undefined}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    >
      {hs.map((h, i) => (
        <rect
          key={i}
          x={i * step}
          y={hang ? 0 : 100 - h * 100}
          width={1.7}
          height={h * 100}
          fill="currentColor"
          style={{ ["--d" as string]: `${Math.round((i / n) * 900)}ms` }}
        />
      ))}
    </svg>
  );
}

/** A fringe of indigo bars that opens a section. */
export function Edge({ seed = 3, opacity = 0.9 }: { seed?: number; opacity?: number }) {
  return (
    <div style={{ color: "var(--indigo)", opacity, lineHeight: 0 }} data-reveal="bars">
      <Bars n={220} shape="edge" seed={seed} hang className="edge" />
    </div>
  );
}

/** A small row of bars, used as a bullet and in the corner of sections. */
export function TickMark({ n = 9 }: { n?: number }) {
  return (
    <span className="tick-mark" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <i key={i} style={{ height: `${40 + ((i * 37) % 60)}%` }} />
      ))}
    </span>
  );
}
