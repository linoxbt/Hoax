import { ImageResponse } from "next/og";
import { RADAR_CHAINS, radarTx } from "@/lib/radar";
import { NET_SHORT, qty, usdso } from "@/lib/radarFormat";

export const alt = "A dreamDEX liquidation on Hoax Radar";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/** The share card: what the engine took, on the night ground with Hoax's mark. */
export default async function Image({ params }: { params: Promise<{ chain: string; tx: string }> }) {
  const { chain, tx } = await params;
  const chainId = Number(chain);
  const ok = (RADAR_CHAINS as readonly number[]).includes(chainId) && /^0x[0-9a-fA-F]{64}$/.test(tx);
  const l = ok ? (await radarTx(chainId, tx.toLowerCase()).catch(() => ({ items: [] }))).items[0] : undefined;
  const lost = l ? usdso(l.penalty + l.spreadFloor) : "–";
  const line = l ? `${l.legs[0].side} ${qty(l.legs[0].size)} ${l.legs[0].symbol} @ ${usdso(l.legs[0].price)} · ${NET_SHORT[l.chainId]}` : "dreamDEX perps";
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "#0a0b0c", color: "#e1e5e5" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="44" height="44" viewBox="0 0 64 64" fill="none" stroke="#e1e5e5" strokeWidth="3">
              <rect x="10.5" y="9.5" width="11" height="45" />
              <rect x="42.5" y="9.5" width="11" height="45" />
              <path d="M21.5 41.5H32V22.5H42.5" stroke="#fa3600" strokeWidth="4" />
            </svg>
            <span style={{ fontSize: 34, fontWeight: 600 }}>Hoax Radar</span>
          </div>
          <span style={{ fontSize: 24, color: "#929699" }}>Every liquidation on dreamDEX, live</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column" }}>
          <span style={{ fontSize: 30, color: "#929699" }}>Liquidated. Lost to the engine, at least</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 20, marginTop: 8 }}>
            <span style={{ fontSize: 150, fontWeight: 600, letterSpacing: -6, color: "#ef5b3f" }}>{lost}</span>
            <span style={{ fontSize: 36, color: "#929699" }}>USDso</span>
          </div>
          <span style={{ fontSize: 30, marginTop: 8 }}>{line}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#929699" }}>
          <span>Hoax trims first, and only when it costs less than half of this.</span>
          <span style={{ color: "#3e8fb3" }}>usehoax.netlify.app</span>
        </div>
      </div>
    ),
    size,
  );
}
