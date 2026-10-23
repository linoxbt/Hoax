import { usd } from "@/lib/format";
import type { Stats } from "@hoax/db";

/** Saved equity beside the price of insurance, and the misses beside them. */
export function StatsGrid({ stats }: { stats: Stats }) {
  const cells: Array<[string, string, string]> = [
    [usd(stats.savedEquity), "USDso", `saved · ${stats.saves} saves`],
    [usd(stats.insuranceCost), "USDso", "insurance cost"],
    [String(stats.accountsProtected), "", "wallets protected"],
    [String(stats.misses), "", "misses"],
  ];
  return (
    <div className="grid g4" style={{ gap: 0 }}>
      {cells.map(([v, unit, label], i) => (
        <div key={label} style={{ padding: "28px 20px 28px 0", borderTop: "1px solid var(--rule)", borderLeft: i % 4 ? "1px solid var(--rule)" : undefined, paddingLeft: i % 4 ? 20 : 0 }}>
          <div className="num m accent">
            {v}
            {unit && <small>{unit}</small>}
          </div>
          <div className="cap soft" style={{ marginTop: 14 }}>
            {label}
          </div>
        </div>
      ))}
    </div>
  );
}
