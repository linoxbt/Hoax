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
