/** The title band at the top of each app page. */
export function AppHead({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="wrap" style={{ paddingTop: 48, paddingBottom: 28, borderBottom: "1px solid var(--line)" }}>
      <div className="kicker">{kicker}</div>
      <div className="spread">
        <h1 className="h2">{title}</h1>
        {children}
      </div>
    </div>
  );
}
