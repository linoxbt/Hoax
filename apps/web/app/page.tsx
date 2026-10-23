import Link from "next/link";
import { StatsGrid } from "@/components/StatsGrid";
import { OutcomeBadge } from "@/components/Outcome";
import { getStore } from "@/lib/server";
import { health, usd } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function Landing() {
  const store = await getStore();
  const [stats, recent] = await Promise.all([store.stats(), store.listActions({ limit: 50 })]);
  const example = recent.find((a) => a.outcome === "saved") ?? recent.find((a) => a.txHash) ?? null;
  const cf = example ? await store.getCounterfactual(example.id) : null;

  return (
    <div className="stack">
      <h1>Liquidation is the worst exit in perps. Hoax gives you a cheaper one.</h1>
      <p className="lead">
        Link Hoax to your dreamDEX wallet as a trade-only bot. When your account health falls to your trigger, Hoax closes
        the smallest slice that brings it back to your target, but only when that close costs less than the liquidation it
        prevents. Every action leaves a receipt you can check on chain.
      </p>
      <div className="row">
        <Link href="/start" className="btn primary">
          Protect my positions
        </Link>
        <Link href="/stats" className="btn">
          See the record
        </Link>
      </div>

      <h2>The record so far</h2>
      <StatsGrid stats={stats} />
      <p className="small muted">
        A close counts as saved only if, within 24 hours, the mark reached the liquidation price the position had before
        the close and the reduced position survived. Otherwise its cost is shown as the price of insurance.
      </p>

      {example && (
        <>
          <h2>A receipt</h2>
          <Link href={`/r/${example.id}`} className="card" style={{ display: "block", color: "inherit" }}>
            <div className="spread">
              <strong>
                {example.market} {example.side}
              </strong>
              <OutcomeBadge outcome={example.outcome} />
            </div>
            <p className="mono">
              health {health(example.healthBefore)} → {health(example.healthAfter)} · cost {usd(example.cost)} USDso
              {cf?.preserved ? ` · ${usd(cf.preserved)} USDso preserved` : ""}
            </p>
            <span className="small">Open the receipt →</span>
          </Link>
        </>
      )}

      <h2>How it works</h2>
      <ol className="steps">
        <li>Hoax makes a key just for your wallet. You add it in dreamDEX with Link a bot, Perps ticked.</li>
        <li>It reads your account health every second: equity over maintenance margin. 1.0 is liquidation.</li>
        <li>At your trigger it sizes the close that restores your target, checks it against the cost of liquidation, and sends one IOC order.</li>
        <li>It reconciles the fill, signs a receipt, and watches the next 24 hours to say whether the close was needed.</li>
      </ol>
    </div>
  );
}
