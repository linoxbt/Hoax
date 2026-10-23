// The product: a bar from liquidation (left, health 1.0) to safe (right), with
// the trigger and target as ticks and the live health as a marker.

export function HealthBar({ health, trigger, target }: { health: number | null; trigger: number; target: number }) {
  const max = Math.max(3, target + 1);
  const pos = (h: number) => `${Math.min(100, Math.max(0, ((h - 1) / (max - 1)) * 100))}%`;
  const label = health === null ? "flat" : Number.isFinite(health) ? health.toFixed(2) : "∞";
  return (
    <div>
      <div className="healthbar" role="img" aria-label={`Health ${label}; Hoax acts at ${trigger} and restores ${target}`}>
        <div className="track" />
        <div className="tick trigger" style={{ left: pos(trigger) }}>
          <span>trigger {trigger}</span>
        </div>
        <div className="tick target" style={{ left: pos(target) }}>
          <span>target {target}</span>
        </div>
        {health !== null && <div className="marker" style={{ left: pos(Number.isFinite(health) ? health : max) }} />}
        <div className="ends">
          <span>1.0 liquidation</span>
          <span>{max.toFixed(1)}+ safe</span>
        </div>
      </div>
    </div>
  );
}
