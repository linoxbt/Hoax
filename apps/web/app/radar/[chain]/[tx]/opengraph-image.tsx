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
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 64, background: "linear-gradient(180deg, #f7f9fe 0%, #e8f0ff 100%)", color: "#101b35" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            <svg width="48" height="48" viewBox="0 0 64 64">
              <rect width="64" height="64" rx="16" fill="#1954f5" />
              <rect x="15" y="14" width="7" height="36" rx="3.5" fill="#fff" />
              <rect x="42" y="14" width="7" height="36" rx="3.5" fill="#fff" />
              <path d="M22 39h7.5V26H42" fill="none" stroke="#fff" strokeWidth="5" strokeLinejoin="round" />
            </svg>
            <span style={{ fontSize: 36, fontWeight: 700, letterSpacing: -1 }}>hoax radar</span>
          </div>
          <span style={{ fontSize: 22, color: "#1954f5", letterSpacing: 1 }}>EVERY LIQUIDATION ON DREAMDEX, LIVE</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", background: "#ffffff", borderRadius: 28, padding: "40px 48px", boxShadow: "0 30px 60px -30px rgba(16,27,53,0.25)", border: "1px solid #e3e9f4" }}>
          <span style={{ fontSize: 22, color: "#1954f5", letterSpacing: 1 }}>LIQUIDATED · LOST TO THE ENGINE, AT LEAST</span>
          <div style={{ display: "flex", alignItems: "baseline", gap: 18, marginTop: 10 }}>
            <span style={{ fontSize: 140, fontWeight: 600, letterSpacing: -6, color: "#d6402b", lineHeight: 1 }}>{lost}</span>
            <span style={{ fontSize: 34, color: "#8a95ad" }}>USDso</span>
          </div>
          <span style={{ fontSize: 30, marginTop: 14, color: "#2a3654" }}>{line}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 24, color: "#5c6880" }}>
          <span>Hoax trims first, and only when it costs less than half of this.</span>
          <span style={{ color: "#1954f5" }}>usehoax.netlify.app</span>
        </div>
      </div>
    ),
    size,
  );
}
