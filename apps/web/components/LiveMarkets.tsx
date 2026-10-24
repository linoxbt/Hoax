"use client";
// Every dreamDEX perp market with its live mark from chain. A cell flashes when
// its mark moves.

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
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
          const before = prev.current[m.symbol];
          if (before && m.mark && before !== m.mark) next[m.symbol] = BigInt(m.mark) > BigInt(before) ? "up" : "down";
          prev.current[m.symbol] = m.mark;
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
  if (!rows) return <div className="tape" aria-hidden style={{ height: "4.4rem" }} />;
  const items = [...rows, ...rows];
  return (
    <div className="tape" aria-label="Live dreamDEX perp marks">
      <div className="tape-track">
        {items.map((m, i) => (
          <span key={`${m.symbol}-${i}`} className={moves[m.symbol] ?? ""}>
            <b>{m.baseSymbol}</b> {price(m)}
          </span>
        ))}
      </div>
    </div>
  );
}

/** The full table, for /markets. */
export function MarketTable() {
  const { rows, moves } = useMarkets();
  return (
    <div className="mtable" role="table" aria-label="dreamDEX perp markets">
      <div className="mrow head" role="row">
        <span>Market</span>
        <span>Mark</span>
        <span>Maintenance</span>
        <span>Min size</span>
        <span>Feed</span>
        <span />
      </div>
      {!rows &&
        Array.from({ length: 8 }, (_, i) => (
          <div key={i} className="mrow skel" role="row">
            <span />
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
        ))}
      {rows?.map((m) => (
        <div key={m.symbol} className="mrow" role="row">
          <span>
            <b>{m.baseSymbol}</b>
            <small>-PERP</small>
          </span>
          <span className={`mono ${moves[m.symbol] ?? ""}`}>{price(m)}</span>
          <span className="mono">{(m.maintenanceMarginBps / 100).toFixed(2)}%</span>
          <span className="mono">
            {units(m.minQuantity, m.baseDecimals, 6)} {m.baseSymbol}
          </span>
          <span>{m.markOk ? <span className="tag saved">live</span> : <span className="tag skipped">stale</span>}</span>
          <span>
            <Link href="/start" className="cap accent">
              Protect →
            </Link>
          </span>
        </div>
      ))}
    </div>
  );
}
