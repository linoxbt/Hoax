export function Kicker({ children, center = false }: { children: React.ReactNode; center?: boolean }) {
  return <div className={`kicker${center ? " center" : ""}`}>{children}</div>;
}

export function Marquee({ text }: { text: string }) {
  const items = Array.from({ length: 8 }, (_, i) => <span key={i}>{text}</span>);
  return (
    <div className="marquee" aria-label={text}>
      <div className="track" aria-hidden>
        {items}
        {items}
      </div>
    </div>
  );
}

/** The title band every page opens with. */
export function PageHead({ kicker, title, children, alt = false }: { kicker: string; title: React.ReactNode; children?: React.ReactNode; alt?: boolean }) {
  return (
    <section className={`sec${alt ? " alt" : ""}`}>
      <div className="wrap pad" style={{ paddingBottom: 44 }}>
        <div className="hero-in" style={{ ["--d" as string]: "0.05s" }}>
          <Kicker>{kicker}</Kicker>
        </div>
        <div className="spread">
          <h1 className="hero-in" style={{ ["--d" as string]: "0.15s" }}>
            {title}
          </h1>
          {children}
        </div>
      </div>
    </section>
  );
}
