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
    ["Saved equity", usd(stats.savedEquity), "USDso"],
    ["Insurance cost", usd(stats.insuranceCost), "USDso"],
    ["Accounts protected", String(stats.accountsProtected), ""],
    ["Misses", String(stats.misses), ""],
    ["Saves", String(stats.saves), ""],
    ["Closes sent", String(stats.actionsTaken), ""],
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
      <section className="sec cells c4">
        {cells.slice(0, 4).map(([k, v, u], i) => (
          <div key={k} className="p stat-cell" data-reveal style={{ ["--d" as string]: `${i * 0.05}s` }}>
            <div className="mono-s soft">{k}</div>
            <div className={`num m${i === 0 ? " accent" : ""}`}>
              {v}
              {u && <small>{u}</small>}
            </div>
          </div>
        ))}
      </section>
      <section className="sec cells c4">
        {cells.slice(4).map(([k, v]) => (
          <div key={k} className="p">
            <div className="mono-s soft">{k}</div>
            <div className="num s" style={{ marginTop: "1.6rem" }}>
              {v}
            </div>
          </div>
        ))}
      </section>
      <section className="sec">
        <SectionHead label="Receipts" title="Latest receipts" sub="Each row links to a public receipt page with its transaction, signature and counterfactual." />
        <div className="bt">
          <ReceiptTable actions={rows} />
        </div>
      </section>
    </>
  );
}
