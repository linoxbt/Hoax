import { Eyebrow } from "./Ui";

/** The head of each dashboard page: eyebrow, heading, an optional line of copy, and actions on the right. */
export function AppHead({
  kicker,
  title,
  sub,
  children,
}: {
  kicker: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <div className="apphead db-head">
      <div className="db-head-t">
        <Eyebrow>{kicker}</Eyebrow>
        <h1 className="h2">{title}</h1>
        {sub && <p className="txt">{sub}</p>}
      </div>
      {children && <div className="db-head-act">{children}</div>}
    </div>
  );
}
