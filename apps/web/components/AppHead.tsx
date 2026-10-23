import { Label } from "./Ui";

/** The title band at the top of each app page. */
export function AppHead({ kicker, title, children }: { kicker: string; title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="apphead">
      <div>
        <Label dot>{kicker}</Label>
        <h1 className="h2" style={{ marginTop: "1.6rem" }}>
          {title}
        </h1>
      </div>
      {children}
    </div>
  );
}
