import { CornerLink, Label, Split } from "./Ui";

export function Kicker({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return <div className={`kicker${center ? " center" : ""}`}>{children}</div>;
}

type Action = { href: string; label: string; ink?: boolean; external?: boolean };

/**
 * The title band inner pages open with: a label and a big heading in the wide
 * cell, a short description and up to two corner links in the side cell.
 */
export function PageHead({ kicker, title, sub, actions = [], children }: { kicker: string; title: string; sub?: React.ReactNode; actions?: Action[]; children?: React.ReactNode }) {
  return (
    <section className="sec first phead">
      <div className="phead-title">
        <span className="plus tl" aria-hidden />
        <Label dot>{kicker}</Label>
        <Split as="h1" className="h1">
          {title}
        </Split>
      </div>
      <div className="phead-side">
        {sub && (
          <div className="txt ink" style={{ padding: "var(--pad)" }} data-reveal>
            {sub}
          </div>
        )}
        {children}
        {actions.length > 0 && (
          <div className="actions" style={actions.length === 1 ? { gridTemplateColumns: "1fr" } : undefined}>
            {actions.map((a) => (
              <CornerLink key={a.href} href={a.href} ink={a.ink} external={a.external}>
                {a.label}
              </CornerLink>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** A section head inside a page: label and heading on the left, a line of copy on the right. */
export function SectionHead({ label, title, sub }: { label: string; title: string; sub?: React.ReactNode }) {
  return (
    <div className="between prob-head">
      <div>
        <Label>{label}</Label>
        <Split className="h2" delay={0.05}>
          {title}
        </Split>
      </div>
      {sub && (
        <p className="txt prob-sub" data-reveal>
          {sub}
        </p>
      )}
    </div>
  );
}
