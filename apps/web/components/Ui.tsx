// Building blocks of the system: the arrow, the button, the eyebrow and the
// heading that rises into place.
import Link from "next/link";

export function Arrow({ dir = "e", className = "arrow" }: { dir?: "ne" | "e" | "w"; className?: string }) {
  if (dir === "w")
    return (
      <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M14 8H2M7 3L2 8l5 5" />
      </svg>
    );
  return dir === "e" ? (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 8h12M9 3l5 5-5 5" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 12L12 4M5.5 4H12v6.5" />
    </svg>
  );
}

/** Kept for older call sites: plain text. */
export function Roll({ children }: { children: string }) {
  return <span>{children}</span>;
}

type BtnProps = { children: React.ReactNode; fill?: boolean; white?: boolean; sm?: boolean; wide?: boolean; arrow?: "ne" | "e" | "w" | false };

/**
 * The button: a label and an arrow. `fill` is the blue primary, `white` the
 * button on blue, and the default the white outlined secondary.
 * Renders a Link, an anchor or a button.
 */
export function Btn({ href, onClick, disabled, children, fill, white, sm, wide, arrow = "e", external, type }: BtnProps & { href?: string; onClick?: () => void; disabled?: boolean; external?: boolean; type?: "button" | "submit" }) {
  const cls = `btn${fill ? "" : white ? " white" : " ghost"}${sm ? " sm" : ""}${wide ? " wide" : ""}`;
  const inner = (
    <>
      {arrow === "w" && <Arrow dir="w" />}
      <span>{children}</span>
      {arrow && arrow !== "w" && <Arrow dir={external && arrow === "e" ? "ne" : arrow} />}
    </>
  );
  if (href && external)
    return (
      <a className={cls} href={href} target="_blank" rel="noreferrer">
        {inner}
      </a>
    );
  if (href)
    return (
      <Link className={cls} href={href}>
        {inner}
      </Link>
    );
  return (
    <button className={cls} onClick={onClick} disabled={disabled} type={type ?? "button"}>
      {inner}
    </button>
  );
}

/** A text link with an arrow. */
export function CornerLink({ href, children, ink, external }: { href: string; children: React.ReactNode; ink?: boolean; external?: boolean }) {
  const cls = `corner-link${ink ? " ink" : ""}`;
  const body = (
    <>
      <span>{children}</span>
      <Arrow dir={external ? "ne" : "e"} />
    </>
  );
  return external ? (
    <a className={cls} href={href} target="_blank" rel="noreferrer">
      {body}
    </a>
  ) : (
    <Link className={cls} href={href}>
      {body}
    </Link>
  );
}

/** Kept for older call sites: renders nothing. */
export function Corners() {
  return null;
}

/** The eyebrow: "01 / A CLEARER PERSPECTIVE", small, uppercase, blue. */
export function Eyebrow({ children, className = "", tone }: { children: React.ReactNode; className?: string; tone?: "ink" | "soft" | "white" }) {
  const style = tone === "white" ? { color: "var(--white)" } : undefined;
  return (
    <div className={`eyebrow${tone && tone !== "white" ? ` ${tone}` : ""}${className ? ` ${className}` : ""}`} style={style}>
      {children}
    </div>
  );
}

/** Older name for the eyebrow; `dot` adds a live dot before it. */
export function Label({ children, dot, className = "" }: { children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <div className={`eyebrow row ${className}`} style={{ gap: "0.8rem" }}>
      {dot && <span className="dotsq" aria-hidden />}
      {children}
    </div>
  );
}

/** A heading whose words rise into place when it scrolls in. */
export function Split({ as: Tag = "h2", className = "h2", children, delay = 0 }: { as?: "h1" | "h2" | "h3" | "div" | "p"; className?: string; children: string; delay?: number }) {
  let i = 0;
  return (
    <Tag className={className} data-split style={{ ["--d" as string]: `${delay}s` }}>
      {children.split(" ").map((word, wi, all) => (
        <span key={wi}>
          <span className="w">
            <span style={{ ["--i" as string]: i++ }}>{word}</span>
          </span>
          {wi < all.length - 1 ? " " : ""}
        </span>
      ))}
    </Tag>
  );
}
