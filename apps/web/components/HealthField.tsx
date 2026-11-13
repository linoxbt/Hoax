// The product: account health on a light gauge, from liquidation (1.0, left)
// to safe (right). Red up to the trigger, amber up to the target, blue above.
// The fill runs to the live health, with its reading pinned above it; the
// trigger and the target are marked with their labels.

export function HealthField({ health, trigger, target }: { health: number | null; trigger: number; target: number }) {
  const max = Math.max(3, target + 1);
  const pos = (h: number) => ((Math.min(max, Math.max(1, h)) - 1) / (max - 1)) * 100;
  const pTrig = pos(trigger);
  const pTarg = pos(target);
  const live = health === null ? null : pos(Number.isFinite(health) ? health : max);
  const label = health === null ? "flat" : Number.isFinite(health) ? health.toFixed(2) : "∞";
  const zone = health === null ? "flat" : health <= trigger ? "bad" : health < target ? "warn" : "ok";
  const align = live === null ? "start" : live < 12 ? "start" : live > 88 ? "end" : "mid";
  return (
    <div className={`db-gauge z-${zone}`} role="img" aria-label={`Health ${label}; Hoax acts at ${trigger} and restores ${target}`}>
      <div className="db-gauge-pinrow">
        <span className={`db-gauge-pin ${align}`} style={{ left: `${live ?? 0}%` }}>
          health <b>{label}</b>
        </span>
      </div>
      <div className="db-gauge-track">
        <i className="zb" style={{ left: 0, width: `${pTrig}%` }} />
        <i className="zw" style={{ left: `${pTrig}%`, width: `${Math.max(0, pTarg - pTrig)}%` }} />
        <i className="zo" style={{ left: `${pTarg}%`, right: 0 }} />
        {live !== null && <i className="fill" style={{ width: `${live}%` }} />}
        <i className="tick" style={{ left: `${pTrig}%` }} />
        <i className="tick" style={{ left: `${pTarg}%` }} />
        {live !== null && <i className="knob" style={{ left: `${live}%` }} />}
      </div>
      <div className="db-gauge-marks">
        <span className={`act${pTrig < 14 ? " near" : ""}`} style={{ left: pTrig < 14 ? 0 : `${pTrig}%` }}>
          act {trigger}
        </span>
        <span className="restore" style={{ left: `${pTarg}%` }}>
          restore {target}
        </span>
      </div>
      <div className="db-gauge-ends">
        <span>1.0 liquidation</span>
        <span>{max.toFixed(1)}+ safe</span>
      </div>
    </div>
  );
}
