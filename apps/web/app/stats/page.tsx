import { PageHead, SectionHead } from "@/components/Kicker";
import { ReceiptTable } from "@/components/ReceiptRow";
import { usd } from "@/lib/format";
import { DEMO, getStore } from "@/lib/server";
import type { ActionJson } from "@/lib/types";

export const dynamic = "force-dynamic";
export const metadata = { title: "Track record" };

export default async function StatsPage() {
  const store = await getStore();
  const [stats, actions] = await Promise.all([store.stats(), store.listActions({ limit: 25 })]);
  const rows = JSON.parse(JSON.stringify(actions, (_k, v) => (typeof v === "bigint" ? v.toString() : v))) as ActionJson[];
  const cells: Array<[string, string, string]> = [
    ["Saved equity (up to)", usd(stats.savedEquity), "USDso"],
    ["Insurance cost", usd(stats.insuranceCost), "USDso"],
    ["Accounts protected", String(stats.accountsProtected), ""],
    ["Misses", String(stats.misses), ""],
    ["Saves", String(stats.saves), ""],
    ["Closes filled", String(stats.actionsTaken), ""],
    ["In 24 h window", String(stats.pending), ""],
    ["Conflicts", String(stats.conflicts), ""],
  ];
  return (
    <>
      <PageHead
        kicker={DEMO ? "Track record · sample data" : "Track record"}
        title="Every action, on the record"
        sub={
          <>
            Saved equity is only claimed when the old liquidation price was actually reached. Otherwise the close cost is shown as <b>the price of insurance</b>,
            next to it.
          </>
        }
        actions={[{ href: "/replay", label: "Watch the replay" }]}
      />

      {/* the overview card: stat tiles inside one white sheet */}
      <section className="card pg-kpi" data-reveal>
        <div className="pg-card-head">
          <div className="h4">Protection overview</div>
          <span className="mono-xs muted">{DEMO ? "SAMPLE DATA" : "ALL PROTECTED ACCOUNTS"}</span>
        </div>
        <div className="pg-tiles">
          {cells.slice(0, 4).map(([k, v, u], i) => (
            <div key={k} className={`pg-tile${i === 0 ? " lead" : ""}`}>
              <span className="pg-tile-k">{k}</span>
              <div className={`num m${i === 0 ? " accent" : ""}`}>
                {v}
                {u && <small>{u}</small>}
              </div>
            </div>
          ))}
        </div>
        <div className="pg-tiles small">
          {cells.slice(4).map(([k, v]) => (
            <div key={k} className="pg-tile">
              <span className="pg-tile-k">{k}</span>
              <div className="num s">{v}</div>
            </div>
          ))}
        </div>
      </section>

      {/* receipts */}
      <section className="sp">
        <SectionHead label="Receipts" title="Latest receipts" sub="Each row links to a public receipt page with its transaction, signature and counterfactual." split />
        <div className="card pg-list" data-reveal>
          <div className="pg-card-head pg-list-head">
            <div className="h5 ink">Newest first</div>
            <span className="mono-xs muted">
              {rows.length} SHOWN{DEMO ? " · SAMPLE DATA" : ""}
            </span>
          </div>
          <ReceiptTable actions={rows} />
        </div>
      </section>
    </>
  );
}
