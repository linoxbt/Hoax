// The Hoax mark: a blue tile with an H whose crossbar steps up from left to right,
// a position lifted from danger back to safe health. Geometry is shared with
// app/icon.svg, so change both together.

export function LogoMark({ size = 32, className, tone = "blue" }: { size?: number; className?: string; tone?: "blue" | "white" }) {
  const tile = tone === "white" ? "#ffffff" : "var(--blue, #1954f5)";
  const ink = tone === "white" ? "var(--blue, #1954f5)" : "#ffffff";
  return (
    <svg className={`logo-mark${className ? ` ${className}` : ""}`} viewBox="0 0 64 64" width={size} height={size} aria-hidden focusable="false">
      <rect width="64" height="64" rx="16" fill={tile} />
      <rect className="logo-bar" x="15" y="14" width="7" height="36" rx="3.5" fill={ink} />
      <rect className="logo-bar" x="42" y="14" width="7" height="36" rx="3.5" fill={ink} />
      <path className="logo-bar" d="M22 39h7.5V26H42" fill="none" stroke={ink} strokeWidth="5" strokeLinejoin="round" />
    </svg>
  );
}

/** The mark as a loader: its strokes pulse while work is in flight. */
export function LogoLoader({ size = 36, label }: { size?: number; label: string }) {
  return (
    <span className="logo-loader" role="status" aria-live="polite">
      <LogoMark size={size} />
      <span className="mono-s soft">{label}</span>
    </span>
  );
}

export function Logo({ size = 32, tone = "blue" }: { size?: number; tone?: "blue" | "white" }) {
  return (
    <span className="logo">
      <LogoMark size={size} tone={tone} />
      <span className="logo-word">hoax</span>
    </span>
  );
}
