export function Kicker({ children, left = false }: { children: React.ReactNode; left?: boolean }) {
  return <div className={`kicker${left ? " left" : ""}`}>{children}</div>;
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
