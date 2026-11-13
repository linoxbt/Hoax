// Number formatting for Radar, shared by the live client component and the server-rendered pages.

/** A USDso amount: fewer decimals as it grows. */
export function usdso(n: number): string {
  const a = Math.abs(n);
  const d = a >= 1000 ? 0 : a >= 1 ? 2 : a >= 0.01 ? 3 : 4;
  return n.toLocaleString("en-US", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });
}

/** A position size in base units. */
export function qty(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: n >= 100 ? 2 : n >= 1 ? 4 : 6 });
}

export const NET_SHORT: Record<number, string> = { 50383: "Somnia Tokyo", 50312: "Somnia Shannon" };

/** A large amount in short form: 1.9M, 71.9K, 842. */
export function compact(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e9) return `${(n / 1e9).toFixed(a >= 1e10 ? 0 : 1)}B`;
  if (a >= 1e6) return `${(n / 1e6).toFixed(a >= 1e7 ? 0 : 1)}M`;
  if (a >= 1e4) return `${(n / 1e3).toFixed(a >= 1e5 ? 0 : 1)}K`;
  return Math.round(n).toLocaleString("en-US");
}

/** "BTC-PERP" → "BTC". */
export const base = (symbol: string) => symbol.replace(/-PERP$/, "");

/** A unix time as HH:MM UTC. */
export const hhmm = (t: number) => new Date(t * 1000).toISOString().slice(11, 16);
