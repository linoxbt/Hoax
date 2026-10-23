// Display helpers, safe on client and server. Amounts arrive as decimal strings
// of raw on-chain units.

export function units(raw: string | bigint | null | undefined, decimals: number, maxFrac = 4): string {
  if (raw === null || raw === undefined || raw === "") return "–";
  const v = typeof raw === "bigint" ? raw : BigInt(raw);
  const neg = v < 0n;
  const abs = neg ? -v : v;
  const scale = 10n ** BigInt(decimals);
  const whole = abs / scale;
  let frac = (abs % scale).toString().padStart(decimals, "0").slice(0, maxFrac).replace(/0+$/, "");
  if (decimals === 0) frac = "";
  const w = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "-" : ""}${w}${frac ? `.${frac}` : ""}`;
}

/** USDso and prices: 18 decimals. */
export function usd(raw: string | bigint | null | undefined, maxFrac = 2): string {
  return units(raw, 18, maxFrac);
}

export function health(h: number | null | undefined): string {
  if (h === null || h === undefined) return "–";
  if (!Number.isFinite(h)) return "∞";
  return h.toFixed(2);
}

export function short(addr: string | null | undefined): string {
  if (!addr) return "–";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function ago(iso: string | Date): string {
  const t = typeof iso === "string" ? Date.parse(iso) : iso.getTime();
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const EXPLORER = "https://explorer.testnet.somnia.network/tokyo";
/** Block explorers by chain id: Hideki (50383) and Shannon (50312). */
const EXPLORERS: Record<number, string> = { 50383: EXPLORER, 50312: "https://shannon-explorer.somnia.network" };
const explorerOf = (chainId?: number) => (chainId && EXPLORERS[chainId]) || EXPLORER;
export const txUrl = (hash: string, chainId?: number) => `${explorerOf(chainId)}/tx/${hash}`;
export const addressUrl = (addr: string, chainId?: number) => `${explorerOf(chainId)}/address/${addr}`;
export const NETWORK_NAMES: Record<number, string> = { 50383: "Somnia Hideki", 50312: "Somnia Shannon" };
export const DREAMDEX_APP = process.env.NEXT_PUBLIC_DREAMDEX_APP_URL || "https://app.testnet.dreamdex.io";
