"use client";
// The markets strip under the intro: every perp market as a cell with its live
// mark, stepped with the arrow controls like a carousel.
import { useState } from "react";
import { useMarkets } from "@/components/LiveMarkets";
import { Arrow } from "@/components/Ui";

const PER = 4;

function price(mark: string | null): string {
  if (!mark) return "–";
  const v = Number(mark) / 1e18;
  const frac = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 0.1 ? 4 : 6;
  return v.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

export function MarketStrip() {
  const { rows, moves } = useMarkets(5000);
  const [page, setPage] = useState(0);
  const n = rows?.length ?? 0;
  const pages = Math.max(1, Math.ceil(n / PER));
  const shown = rows ? Array.from({ length: PER }, (_, i) => rows[(page * PER + i) % Math.max(1, n)]) : [];
  return (
    <div className="mstrip bt">
      <div className="mstrip-head">
        <span className="mono-s ink">Markets</span>
        <div className="mstrip-ctl">
          <button aria-label="Previous markets" onClick={() => setPage((p) => (p - 1 + pages) % pages)}>
            <Arrow dir="e" className="arrow flip" />
          </button>
          <button aria-label="Next markets" onClick={() => setPage((p) => (p + 1) % pages)}>
            <Arrow dir="e" />
          </button>
        </div>
      </div>
      <div className="mstrip-cells">
        {(rows ? shown : Array.from({ length: PER }, () => null)).map((m, i) => (
          <div key={m ? `${m.symbol}-${page}` : i} className="mstrip-cell">
            {m ? (
              <>
                <b>{m.baseSymbol}</b>
                <span className={`mono-s ${moves[m.symbol] ?? ""}`}>{price(m.mark)}</span>
              </>
            ) : (
              <span className="mono-s muted">…</span>
            )}
          </div>
        ))}
      </div>
      <div className="mstrip-desc mono-xs soft bt">
        Covers all {n || 21} dreamDEX perp markets, read live from the pools on Somnia Hideki.
      </div>
    </div>
  );
}
