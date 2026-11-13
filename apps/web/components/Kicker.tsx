import { Btn, Eyebrow, Split } from "./Ui";

export function Kicker({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return <div className={`kicker${center ? " center" : ""}`}>{children}</div>;
}

type Action = { href: string; label: string; ink?: boolean; external?: boolean };

/**
 * The head every inner page opens with, as on MarketSnack: an eyebrow, a large
 * heading, a line of copy and up to two buttons, left-aligned in one column.
 * `split` puts the copy and actions in a column beside the heading.
 */
export function PageHead({
  kicker,
  title,
  sub,
  actions = [],
  children,
  split = false,
}: {
  kicker: string;
  title: string;
  sub?: React.ReactNode;
  actions?: Action[];
  children?: React.ReactNode;
  split?: boolean;
}) {
  return (
    <section className={`phead${split ? " split" : ""}`}>
      <div className="phead-title">
        <Eyebrow>{kicker}</Eyebrow>
        <Split as="h1" className="h1">
          {title}
        </Split>
      </div>
      <div className="phead-side">
        {sub && (
          <div className="txt" data-reveal>
            {sub}
          </div>
        )}
        {children}
        {actions.length > 0 && (
          <div className="actions" data-reveal>
            {actions.map((a, i) => (
              <Btn key={a.href} href={a.href} fill={i === 0 && !a.ink} external={a.external}>
                {a.label}
              </Btn>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/** A section head inside a page: eyebrow, heading, and an optional line of copy below. */
export function SectionHead({ label, title, sub, split = false }: { label: string; title: string; sub?: React.ReactNode; split?: boolean }) {
  return (
    <div className={`shead${split ? " split" : ""}`}>
      <div className="stack" style={{ gap: "2rem" }}>
        <Eyebrow>{label}</Eyebrow>
        <Split className="h2" delay={0.05}>
          {title}
        </Split>
      </div>
      {sub && (
        <p className="txt" data-reveal>
          {sub}
        </p>
      )}
    </div>
  );
}
