import { usd } from "@/lib/format";
import type { Stats } from "@hoax/db";

/** Saved equity next to the price of insurance, and the misses beside them. */
export function StatsGrid({ stats }: { stats: Stats }) {
  return (
    <div className="grid cols-4">
      <div className="card stat">
        <div className="value" style={{ color: "var(--saved)" }}>{usd(stats.savedEquity)}</div>
        <div className="label">USDso equity saved ({stats.saves} saves)</div>
      </div>
      <div className="card stat">
        <div className="value" style={{ color: "var(--not-needed)" }}>{usd(stats.insuranceCost)}</div>
        <div className="label">USDso paid for closes that turned out not needed</div>
      </div>
      <div className="card stat">
        <div className="value">{stats.accountsProtected}</div>
        <div className="label">wallets protected</div>
      </div>
      <div className="card stat">
        <div className="value" style={{ color: stats.misses ? "var(--missed)" : undefined }}>{stats.misses}</div>
        <div className="label">misses (liquidated anyway)</div>
      </div>
    </div>
  );
}
