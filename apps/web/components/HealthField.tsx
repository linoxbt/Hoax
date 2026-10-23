// The product: health from liquidation (1.0, left) to safe (right) as a field
// of bars. Bars up to the live health are solid; the trigger and the target
// stand taller, with their labels.

export function HealthField({ health, trigger, target }: { health: number | null; trigger: number; target: number }) {
  const max = Math.max(3, target + 1);
  const n = 90;
  const at = (h: number) => Math.round(((Math.min(max, Math.max(1, h)) - 1) / (max - 1)) * (n - 1));
  const iTrig = at(trigger);
  const iTarg = at(target);
  const iLive = health === null ? -1 : at(Number.isFinite(health) ? health : max);
  const pct = (i: number) => `${(i / (n - 1)) * 100}%`;
  const label = health === null ? "flat" : Number.isFinite(health) ? health.toFixed(2) : "∞";
  const step = 3;
  return (
    <div className="hfield" role="img" aria-label={`Health ${label}; Hoax acts at ${trigger} and restores ${target}`}>
      <span className="lbl left" style={{ left: pct(iTrig) }}>
        act {trigger}
      </span>
      <span className="lbl rightside" style={{ left: pct(iTarg) }}>
        restore {target}
      </span>
      <svg viewBox={`0 0 ${n * step} 100`} preserveAspectRatio="none">
        {Array.from({ length: n }, (_, i) => {
          const marker = i === iTrig || i === iTarg;
          const live = i === iLive;
          const filled = i <= iLive;
          const h = live ? 100 : marker ? 92 : 30 + ((i * 53) % 23);
          return (
            <rect
              key={i}
              x={i * step}
              y={100 - h}
              width={live ? 2.6 : 1.6}
              height={h}
              fill="currentColor"
              className={live ? "live" : undefined}
              opacity={live ? 1 : marker ? 0.9 : filled ? 0.85 : 0.22}
            />
          );
        })}
      </svg>
      <div className="ends">
        <span>1.0 liquidation</span>
        <span>
          health <b className="mono" style={{ fontSize: 12 }}>{label}</b>
        </span>
        <span>{max.toFixed(1)}+ safe</span>
      </div>
    </div>
  );
}
