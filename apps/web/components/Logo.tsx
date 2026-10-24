// The Hoax mark, drawn as a technical line: two stems of an H and a crossbar
// that steps up from left to right, a position lifted from danger back to safe
// health. Geometry is shared with app/icon.svg, so change both together.

export function LogoMark({ size = 38, className, still = false }: { size?: number; className?: string; still?: boolean }) {
  return (
    <svg className={`logo-mark${className ? ` ${className}` : ""}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth={3}>
      <rect x="10.5" y="9.5" width="11" height="45" />
      <rect x="42.5" y="9.5" width="11" height="45" />
      <path d="M2 41.5h6" strokeWidth={1.5} opacity={0.6} />
      <path d="M56 22.5h6" strokeWidth={1.5} opacity={0.6} />
      {still ? (
        <path d="M21.5 41.5H32V22.5H42.5" stroke="var(--brand, #fa3600)" strokeWidth={4} />
      ) : (
        <path className="logo-step" d="M21.5 41.5H32V22.5H42.5" stroke="var(--brand, #fa3600)" strokeWidth={4} pathLength={1} />
      )}
    </svg>
  );
}

/** The mark as a loader: the crossbar keeps drawing and clearing while work is in flight. */
export function LogoLoader({ size = 40, label }: { size?: number; label: string }) {
  return (
    <span className="logo-loader" role="status" aria-live="polite">
      <LogoMark size={size} />
      <span className="cap soft">{label}</span>
    </span>
  );
}

export function Logo({ size = 38 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Hoax</span>
    </span>
  );
}
