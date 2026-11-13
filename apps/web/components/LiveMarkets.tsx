"use client";
// Every dreamDEX perp market with its live mark from chain. A cell flashes when
// its mark moves.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Arrow } from "@/components/Ui";
import { units } from "@/lib/format";
import { api } from "@/lib/session";
import type { MarketJson } from "@/lib/types";

function price(m: MarketJson): string {
  if (!m.mark) return "–";
  const v = Number(m.mark) / 1e18;
  const frac = v >= 1000 ? 0 : v >= 10 ? 2 : v >= 0.1 ? 4 : 6;
  return v.toLocaleString(undefined, { minimumFractionDigits: frac, maximumFractionDigits: frac });
}

/** Live perp markets on one network: Hideki (50383) unless asked. */
export function useMarkets(everyMs = 5000, chainId = 50383) {
  const [rows, setRows] = useState<MarketJson[] | null>(null);
  const [moves, setMoves] = useState<Record<string, "up" | "down">>({});
  const prev = useRef<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const { markets } = await api<{ markets: MarketJson[] }>(`/api/markets?chain=${chainId}`);
        if (!alive) return;
        const next: Record<string, "up" | "down"> = {};
        for (const m of markets) {
          const before = prev.current[m.pool];
          if (before && m.mark && before !== m.mark) next[m.pool] = BigInt(m.mark) > BigInt(before) ? "up" : "down";
          prev.current[m.pool] = m.mark;
        }
        setRows(markets);
        setMoves(next);
      } catch {
        // keep the last good rows
      }
    };
    void load();
    const t = setInterval(load, everyMs);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [everyMs, chainId]);
  return { rows, moves };
}

/** A scrolling tape of every market's mark. */
export function MarketTape() {
  const { rows, moves } = useMarkets();
  if (!rows) return <div className="pg-tape" aria-hidden style={{ height: "4.4rem" }} />;
  const real = rows.filter((m) => !m.baseSymbol.toUpperCase().startsWith("LOADTEST"));
  const items = [...real, ...real];
  return (
    <div className="pg-tape" aria-label="Live dreamDEX perp marks">
      <div className="pg-tape-track">
        {items.map((m, i) => (
          <span key={`${m.pool}-${i}`} className={moves[m.pool] ?? ""}>
            <b>{m.baseSymbol}</b> {price(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The full table, for /markets: a white card with a live pill, three overview tiles and the table. */
export function MarketTable() {
  const { rows, moves } = useMarkets();
  const live = rows?.filter((m) => m.markOk).length ?? 0;
  return (
    <div className="card pg-markets">
      <div className="pg-card-head pg-markets-head">
        <div className="stack" style={{ gap: "0.6rem" }}>
          <span className="eyebrow">Coverage / Somnia Hideki</span>
          <div className="h4">dreamDEX perp markets</div>
        </div>
        <span className={`live-pill${rows && live === 0 ? " err" : ""}`}>
          <i />
          {rows ? `Live · ${live} of ${rows.length} feeds` : "Connecting"}
        </span>
      </div>
      <div className="pg-tiles pg-markets-tiles">
        <div className="pg-tile lead">
          <span className="pg-tile-k">Markets</span>
          <div className="num s accent">{rows ? rows.length : "–"}</div>
        </div>
        <div className="pg-tile">
          <span className="pg-tile-k">Live marks</span>
          <div className="num s">{rows ? live : "–"}</div>
        </div>
        <div className="pg-tile">
          <span className="pg-tile-k">Refresh</span>
          <div className="num s">
            5<small>s</small>
          </div>
        </div>
        <div className="pg-tile">
          <span className="pg-tile-k">Links needed</span>
          <div className="num s">1</div>
        </div>
      </div>
      <div className="scroll-x">
        <table className="list pg-mtable" aria-label="dreamDEX perp markets">
          <thead>
            <tr>
              <th>Market</th>
              <th>Mark</th>
              <th>Maintenance</th>
              <th>Min size</th>
              <th>Feed</th>
              <th aria-label="Action" />
            </tr>
          </thead>
          <tbody>
            {!rows &&
              Array.from({ length: 8 }, (_, i) => (
                <tr key={i} className="pg-skel">
                  {Array.from({ length: 6 }, (_, j) => (
                    <td key={j}>
                      <i />
                    </td>
                  ))}
                </tr>
              ))}
            {rows?.map((m) => (
              <tr key={m.pool}>
                <td className="c-mk">
                  <span className="pg-mk">
                    <span className="pg-mk-ico" aria-hidden>
                      {m.baseSymbol.slice(0, 1)}
                    </span>
                    <b>{m.baseSymbol}</b>
                    <small>-PERP</small>
                  </span>
                </td>
                <td className={`c-mark pg-mark-cell ${moves[m.pool] ?? ""}`}>{price(m)}</td>
                <td className="c-mm" data-label="Maintenance">
                  {(m.maintenanceMarginBps / 100).toFixed(2)}%
                </td>
                <td className="c-min" data-label="Min size">
                  {units(m.minQuantity, m.baseDecimals, 6)} {m.baseSymbol}
                </td>
                <td className="c-feed">{m.markOk ? <span className="tag saved">live</span> : <span className="tag skipped">stale</span>}</td>
                <td className="c-act pg-act">
                  <Link href="/start" className="corner-link">
                    <span>Protect</span>
                    <Arrow />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
