// Small building blocks of the drawing system: the arrow, the rolling label,
// the two-cell button, corner links and drawing furniture.
import Link from "next/link";

export function Arrow({ dir = "ne", className = "arrow" }: { dir?: "ne" | "e"; className?: string }) {
  return dir === "e" ? (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <path d="M1 7h12M8 2l5 5-5 5" />
    </svg>
  ) : (
    <svg className={className} viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth={1.4} aria-hidden>
      <path d="M3 11L11 3M4.5 3H11v6.5" />
    </svg>
  );
}

/** Text that rolls up to a copy of itself on hover. */
export function Roll({ children }: { children: string }) {
  return (
    <span className="roll">
      <span>{children}</span>
      <span aria-hidden>{children}</span>
    </span>
  );
}

type BtnProps = { children: string; fill?: boolean; sm?: boolean; wide?: boolean; arrow?: "ne" | "e" };

/** The two-cell button: a rolling label and an arrow cell. Renders a Link, an anchor or a button. */
export function Btn({ href, onClick, disabled, children, fill, sm, wide, arrow = "e", external, type }: BtnProps & { href?: string; onClick?: () => void; disabled?: boolean; external?: boolean; type?: "button" | "submit" }) {
  const cls = `btn${fill ? " fill" : ""}${sm ? " sm" : ""}${wide ? " wide" : ""}`;
  const inner = (
    <>
      <span className="lbl">
        <Roll>{children}</Roll>
      </span>
      <span className="ico">
        <Arrow dir={arrow} />
      </span>
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

/** A cell-filling link: mono label top-left, arrow bottom-right. */
export function CornerLink({ href, children, ink, external }: { href: string; children: string; ink?: boolean; external?: boolean }) {
  const cls = `corner-link${ink ? " ink" : ""}`;
  const body = (
    <>
      <Roll>{children}</Roll>
      <Arrow />
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

/** Crosshairs at the four corners of a drawing. */
export function Corners() {
  return (
    <>
      <span className="plus tl" aria-hidden />
      <span className="plus tr" aria-hidden />
      <span className="plus bl" aria-hidden />
      <span className="plus br" aria-hidden />
    </>
  );
}

/** A mono label like PROBLEMS, optionally with an orange square. */
export function Label({ children, dot, className = "" }: { children: React.ReactNode; dot?: boolean; className?: string }) {
  return (
    <div className={`mono-s ink row ${className}`} style={{ gap: "0.8rem" }}>
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
