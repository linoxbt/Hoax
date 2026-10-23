import { StatsGrid } from "@/components/StatsGrid";
import { ReceiptTable } from "@/components/ReceiptRow";
import { getStore } from "@/lib/server";
import type { ActionJson } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const store = await getStore();
  const [stats, actions] = await Promise.all([store.stats(), store.listActions({ limit: 25 })]);
  const rows = JSON.parse(JSON.stringify(actions, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as ActionJson[];
  return (
    <div className="stack">
      <h1>Stats</h1>
      <StatsGrid stats={stats} />
      <div className="grid cols-4">
        <div className="card stat">
          <div className="value">{stats.actionsTaken}</div>
          <div className="label">closes sent</div>
        </div>
        <div className="card stat">
          <div className="value">{stats.pending}</div>
          <div className="label">closes still in their 24 h window</div>
        </div>
        <div className="card stat">
          <div className="value">{stats.conflicts}</div>
          <div className="label">conflicts (paused for the trader)</div>
        </div>
      </div>
      <h2>Latest receipts, misses included</h2>
      <ReceiptTable actions={rows} />
    </div>
  );
}
