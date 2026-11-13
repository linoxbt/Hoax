"use client";
// The live Radar: every dreamDEX liquidation, refreshed every ten seconds.
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import type { RadarLiquidation, RadarSnapshot } from "@/lib/radar";
import { qty, usdso } from "@/lib/radarFormat";

const NETS: Array<[string, string]> = [
  ["all", "Both networks"],
  ["50383", "Somnia Tokyo"],
  ["50312", "Shannon"],
];
const NET_SHORT: Record<number, string> = { 50383: "Tokyo", 50312: "Shannon" };
/** Rows the feed shows at first, and adds with each "Show more". */
const PAGE = 30;

function clock(t: number): string {
  return new Date(t * 1000).toISOString().slice(11, 16) + " UTC";
}
function since(t: number, now: number): string {
  const s = Math.max(0, Math.round(now / 1000 - t));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function RadarLive({ initial }: { initial: RadarSnapshot | null }) {
  const [chain, setChain] = useState("all");
  const [hours, setHours] = useState(24);
  const [snap, setSnap] = useState<RadarSnapshot | null>(initial);
  const [err, setErr] = useState<string | null>(initial ? null : "The markets indexer did not answer. Retrying.");
  // Relative times only after mount, so the server's HTML and the first client render agree.
  const [now, setNow] = useState<number | null>(null);
  const seen = useRef(new Set((initial?.items ?? []).map(key)));
  const [fresh, setFresh] = useState<Set<string>>(new Set());
  const [shown, setShown] = useState(PAGE);

  useEffect(() => {
    let stop = false;
    let first = true;
    const load = async () => {
      try {
        const res = await fetch(`/api/radar?chain=${chain}&hours=${hours}`, { cache: "no-store" });
        if (!res.ok) throw new Error(String(res.status));
        const next = (await res.json()) as RadarSnapshot;
        if (stop) return;
        const added = new Set(next.items.map(key).filter((k) => !seen.current.has(k)));
        next.items.forEach((l) => seen.current.add(key(l)));
        setFresh(first ? new Set() : added);
        first = false;
        setSnap(next);
        setErr(null);
      } catch {
        if (!stop) setErr("The markets indexer did not answer. Retrying.");
      }
    };
    void load();
    const id = setInterval(load, 10_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, [chain, hours]);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const t = snap?.totals;
  const params = snap ? Object.values(snap.params)[0] : null;
  const maxNotional = Math.max(1, ...(snap?.markets.map((m) => m.notional) ?? [1]));

  return (
    <>
      <div className="rd-controls">
        <div className="seg" role="tablist" aria-label="Network">
          {NETS.map(([v, l]) => (
            <button key={v} role="tab" aria-selected={chain === v} className={chain === v ? "on" : ""} onClick={() => setChain(v)}>
              {l}
            </button>
          ))}
        </div>
        <div className="seg" role="tablist" aria-label="Window">
          {[
            [24, "24 hours"],
            [168, "7 days"],
          ].map(([v, l]) => (
            <button key={v} role="tab" aria-selected={hours === v} className={hours === v ? "on" : ""} onClick={() => setHours(Number(v))}>
              {l}
            </button>
          ))}
        </div>
        <span className="rd-live mono-s">
          <i aria-hidden />
          {err ? err : snap && now ? `Updated ${since(Math.floor(snap.generatedAt / 1000), now)}` : "Live"}
        </span>
      </div>

      <section className="rd-kpis" aria-label="Totals">
        {(
          [
            ["Liquidations", t ? t.count.toLocaleString("en-US") : "–", ""],
            ["Notional liquidated", t ? usdso(t.notional) : "–", "USDso"],
            [`Penalties at ${params ? params.penaltyBps / 100 : 1}%`, t ? usdso(t.penalty) : "–", "USDso"],
            ["Accounts hit", t ? t.accounts.toLocaleString("en-US") : "–", ""],
          ] as const
        ).map(([k, v, u]) => (
          <div key={k}>
            <span className="mono-s soft">{k}</span>
            <span className="num">
              {v}
              {u && <small>{u}</small>}
            </span>
          </div>
        ))}
      </section>

      <div className="rd-grid">
        <section className="sec rd-feed" style={{ marginTop: 0 }} aria-label="Latest liquidations">
          <div className="rd-feed-head between">
            <span className="h5">Latest liquidations</span>
            <span className="mono-s muted">{snap ? `${Math.min(shown, snap.items.length)} of ${snap.totals.count}` : ""}</span>
          </div>
          <div className="scroll-x">
            <table className="list rd-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Market</th>
                  <th className="rd-closed">Closed</th>
                  <th className="rd-notional" style={{ textAlign: "right" }}>Notional</th>
                  <th style={{ textAlign: "right" }}>Cost, at least</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(snap?.items ?? []).slice(0, shown).map((l) => (
                  <tr key={key(l)} className={fresh.has(key(l)) ? "rd-new" : undefined}>
                    <td>
                      <span className="ink">{now ? since(l.time, now) : clock(l.time)}</span>
                      <span className="muted rd-net"> · {NET_SHORT[l.chainId]}</span>
                    </td>
                    <td className="ink">{l.legs.map((x) => x.symbol).join(" + ")}</td>
                    <td className="rd-closed">
                      {l.legs.map((x, i) => (
                        <span key={i} className={x.side === "long" ? "rd-long" : "rd-short"}>
                          {i > 0 ? " · " : ""}
                          {x.side} {qty(x.size)} @ {usdso(x.price)}
                        </span>
                      ))}
                    </td>
                    <td className="rd-notional" style={{ textAlign: "right" }}>{usdso(l.notional)}</td>
                    <td style={{ textAlign: "right" }} className="rd-cost">
                      {usdso(l.penalty + l.spreadFloor)}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <Link href={`/radar/${l.chainId}/${l.txHash}`} aria-label="Liquidation card">
                        <span className="rd-net">Card </span>↗
                      </Link>
                    </td>
                  </tr>
                ))}
                {snap && snap.items.length === 0 && (
                  <tr>
                    <td colSpan={6} className="soft">
                      No liquidations in this window.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {snap && snap.items.length > shown && (
            <div className="rd-more">
              <button className="pill ghost sm" onClick={() => setShown((n) => n + PAGE)}>
                Show {Math.min(PAGE, snap.items.length - shown)} more
              </button>
            </div>
          )}
        </section>

        <aside className="rd-side">
          <section className="sec" style={{ marginTop: 0 }} aria-label="Busiest markets">
            <div className="p">
              <span className="h5">Where it happens</span>
              <p className="txt" style={{ marginTop: "0.6rem" }}>
                Notional liquidated by market, {hours === 24 ? "last 24 hours" : "last 7 days"}.
              </p>
              <div className="rd-bars">
                {(snap?.markets ?? []).map((m) => (
                  <div key={`${m.chainId}:${m.symbol}`} className="rd-bar">
                    <div className="between">
                      <span className="ink">
                        {m.symbol} <span className="muted mono-xs">{NET_SHORT[m.chainId]}</span>
                      </span>
                      <span className="mono-s soft">
                        {usdso(m.notional)} · {m.count}
                      </span>
                    </div>
                    <i style={{ width: `${(m.notional / maxNotional) * 100}%` }} />
                  </div>
                ))}
              </div>
            </div>
          </section>
          <section className="sec rd-gate" aria-label="Hoax's cost gate">
            <div className="p">
              <span className="mono-s" style={{ color: "var(--brand)" }}>
                With Hoax
              </span>
              <div className="h4" style={{ marginTop: "1rem" }}>
                A trim first, and only if it costs at most half of this.
              </div>
              <p className="txt" style={{ marginTop: "1rem" }}>
                Hoax watches health every second and closes the smallest slice that restores your target before the engine can act. It skips any trim
                that would cost more than half of the liquidation it prevents.
              </p>
              <Link className="pill" href="/start" style={{ marginTop: "2rem" }}>
                Protect my positions
              </Link>
            </div>
          </section>
          <p className="mono-xs muted" style={{ marginTop: "1.2rem" }}>
            Cost, at least = penalty ({params ? params.penaltyBps / 100 : 1}%) + the minimum forced-close spread ({params ? params.minSpreadBps / 100 : 0.5}%), both
            {params?.source === "chain" ? " read from the LiquidationEngine" : " at the protocol's documented rates"}. The real spread can be wider. dreamDEX&apos;s
            test pools are left out.
          </p>
        </aside>
      </div>
    </>
  );
}

function key(l: RadarLiquidation): string {
  return `${l.chainId}:${l.txHash}:${l.account}`;
}
