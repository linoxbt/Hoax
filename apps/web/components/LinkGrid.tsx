// One cell per perp market: lit when the Hoax key may trade it for this account.
import type { AccountJson } from "@/lib/types";

export function LinkGrid({ view }: { view: AccountJson | null }) {
  if (!view) return null;
  const links = view.links;
  const linked = links ? view.markets.filter((m) => links[m.pool.toLowerCase()]).length : 0;
  return (
    <div>
      <div className="st-lg-head">
        <span className="eyebrow">Place-order access by market</span>
        <span className={`st-lg-count${links && linked === view.markets.length && linked > 0 ? " full" : ""}`}>
          {links ? `${linked} / ${view.markets.length}` : "–"}
        </span>
      </div>
      <div className="st-lg">
        {view.markets.map((m) => {
          const on = links ? links[m.pool.toLowerCase()] : null;
          return (
            <span
              key={m.pool}
              className={on ? "on" : on === false ? "off" : ""}
              title={`${m.symbol}: ${on ? "linked" : on === false ? "not linked" : "unknown"} · ${m.pool}`}
              aria-label={`${m.symbol} ${on ? "linked" : on === false ? "not linked" : "unknown"}`}
            >
              {on ? "✓ " : on === false ? "× " : ""}
              {m.symbol.replace("-PERP", "")}
            </span>
          );
        })}
      </div>
    </div>
  );
}
