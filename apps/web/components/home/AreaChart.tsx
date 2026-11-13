// A smooth area chart in the MarketSnack manner: one blue line, a soft fill under
// it, faint dashed guides and a few time labels. Values are drawn as they are;
// the chart has no y-axis because it shows the shape of activity, not a reading.

function smooth(points: Array<[number, number]>): string {
  if (points.length < 2) return "";
  let d = `M${points[0][0].toFixed(1)},${points[0][1].toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i - 1] ?? points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] ?? p2;
    const t = 0.18;
    const c1 = [p1[0] + (p2[0] - p0[0]) * t, p1[1] + (p2[1] - p0[1]) * t];
    const c2 = [p2[0] - (p3[0] - p1[0]) * t, p2[1] - (p3[1] - p1[1]) * t];
    d += ` C${c1[0].toFixed(1)},${c1[1].toFixed(1)} ${c2[0].toFixed(1)},${c2[1].toFixed(1)} ${p2[0].toFixed(1)},${p2[1].toFixed(1)}`;
  }
  return d;
}

export function AreaChart({
  values,
  labels = [],
  height = 200,
  id,
  guides = 3,
}: {
  values: number[];
  /** Time labels spread evenly under the chart. */
  labels?: string[];
  height?: number;
  /** Unique per page, for the gradient. */
  id: string;
  guides?: number;
}) {
  const W = 600;
  const H = height;
  const top = 12;
  const bottom = 8;
  // A gentle moving average keeps one big hour from flattening the rest into a line.
  const v = values.map((_, i) => {
    const w = values.slice(Math.max(0, i - 1), i + 2);
    return w.reduce((s, x) => s + x, 0) / w.length;
  });
  const max = Math.max(1e-9, ...v);
  const pts: Array<[number, number]> = v.map((x, i) => [(i / Math.max(1, v.length - 1)) * W, top + (1 - x / max) * (H - top - bottom)]);
  const line = smooth(pts);
  const area = `${line} L${W},${H} L0,${H} Z`;
  return (
    <div className="ac">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Activity over the window">
        <defs>
          <linearGradient id={`ac-${id}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1954f5" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#1954f5" stopOpacity="0" />
          </linearGradient>
        </defs>
        {Array.from({ length: guides }, (_, i) => {
          const y = top + ((i + 0.5) / guides) * (H - top - bottom);
          return <line key={i} x1="0" x2={W} y1={y} y2={y} stroke="#cbd6ea" strokeDasharray="4 6" strokeWidth="1" vectorEffect="non-scaling-stroke" />;
        })}
        <path d={area} fill={`url(#ac-${id})`} />
        <path d={line} fill="none" stroke="#1954f5" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      </svg>
      {labels.length > 0 && (
        <div className="ac-x">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
    </div>
  );
}

/** Evenly spaced time labels for a series of buckets. */
export function timeLabels(series: Array<{ t: number }>, count = 4, fmt: (t: number) => string): string[] {
  if (!series.length) return [];
  const out: string[] = [];
  for (let i = 0; i < count; i++) out.push(fmt(series[Math.round((i / (count - 1)) * (series.length - 1))].t));
  return out;
}
