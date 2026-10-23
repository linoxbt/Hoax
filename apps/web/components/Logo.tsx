// The Hoax mark: an H whose crossbar steps up from the left stem to the right,
// a position lifted from danger back to safe health. Geometry is shared with
// app/icon.svg, so change both together.

export function LogoMark({ size = 32, className }: { size?: number; className?: string }) {
  return (
    <svg className={`logo-mark${className ? ` ${className}` : ""}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      <rect width="64" height="64" rx="16" fill="var(--logo-tile, #4338ca)" />
      <g fill="var(--logo-glyph, #fff)">
        <rect x="14" y="13" width="9" height="38" rx="2" />
        <rect x="41" y="13" width="9" height="38" rx="2" />
      </g>
      <path className="logo-step" d="M23 39.5H29.5V24.5H41" fill="none" stroke="var(--logo-glyph, #fff)" strokeWidth="6" pathLength={1} />
    </svg>
  );
}

export function Logo({ size = 30 }: { size?: number }) {
  return (
    <span className="logo">
      <LogoMark size={size} />
      <span className="logo-word">Hoax</span>
    </span>
  );
}
