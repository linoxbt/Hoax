import { Edge } from "@/components/Bars";
import { Kicker, Marquee } from "@/components/Kicker";
import { ReceiptTable } from "@/components/ReceiptRow";
import { StatsGrid } from "@/components/StatsGrid";
import { getStore } from "@/lib/server";
import type { ActionJson } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function StatsPage() {
  const store = await getStore();
  const [stats, actions] = await Promise.all([store.stats(), store.listActions({ limit: 25 })]);
  const rows = JSON.parse(JSON.stringify(actions, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as ActionJson[];
  return (
    <>
      <section className="sec alt">
        <div className="wrap pad">
          <Kicker>The record</Kicker>
          <h1>Track record</h1>
          <div style={{ marginTop: 56 }}>
            <StatsGrid stats={stats} />
          </div>
          <div className="grid g3" style={{ marginTop: 0, gap: 0 }}>
            {(
              [
                [stats.actionsTaken, "closes sent"],
                [stats.pending, "in 24 h window"],
                [stats.conflicts, "conflicts"],
              ] as const
            ).map(([v, l], i) => (
              <div key={l} style={{ padding: "28px 20px 28px 0", borderTop: "1px solid var(--rule)", borderLeft: i ? "1px solid var(--rule)" : undefined, paddingLeft: i ? 20 : 0 }}>
                <div className="num m">{v}</div>
                <div className="cap soft" style={{ marginTop: 14 }}>
                  {l}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="sec">
        <Edge seed={6} opacity={0.5} />
        <div className="wrap" style={{ paddingTop: 24 }}>
          <Marquee text="Latest receipts" />
        </div>
        <div className="wrap pad" style={{ paddingTop: 40 }}>
          <ReceiptTable actions={rows} />
        </div>
      </section>
    </>
  );
}
