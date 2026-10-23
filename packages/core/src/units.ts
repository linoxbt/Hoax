// Fixed-point helpers. dreamDEX prices and collateral (USDso) carry 18 decimals;
// base quantities carry each market's own decimals (6 to 24).

export const WAD = 10n ** 18n;

export function abs(x: bigint): bigint {
  return x < 0n ? -x : x;
}

export function sign(x: bigint): -1 | 0 | 1 {
  return x > 0n ? 1 : x < 0n ? -1 : 0;
}

export function minBig(a: bigint, b: bigint): bigint {
  return a < b ? a : b;
}

export function maxBig(a: bigint, b: bigint): bigint {
  return a > b ? a : b;
}

export function ceilDiv(a: bigint, b: bigint): bigint {
  if (b <= 0n) throw new Error("ceilDiv by non-positive");
  return a <= 0n ? a / b : (a + b - 1n) / b;
}

/** Round a quantity up to the lot grid. */
export function roundUpToLot(qty: bigint, lot: bigint): bigint {
  return ceilDiv(qty, lot) * lot;
}

/** Round a quantity down to the lot grid. */
export function roundDownToLot(qty: bigint, lot: bigint): bigint {
  return (qty / lot) * lot;
}

/** Quote value (18 decimals) of `qty` base units at `price` (18 decimals per whole base). */
export function notional(qty: bigint, price: bigint, baseDecimals: number): bigint {
  return (abs(qty) * price) / 10n ** BigInt(baseDecimals);
}

/** An 18-decimal amount as a float, for ratios and display only. */
export function toFloat(x: bigint, decimals = 18): number {
  const scale = 10n ** BigInt(decimals);
  const whole = x / scale;
  const frac = x % scale;
  return Number(whole) + Number(frac) / Number(scale);
}

/**
 * A float as a fixed-point amount, truncated. Only the 15 significant digits a
 * double carries are kept, so 0.1 becomes exactly 1e17 at 18 decimals.
 */
export function fromFloat(x: number, decimals = 18): bigint {
  if (!Number.isFinite(x)) throw new Error(`fromFloat: ${x} is not finite`);
  if (x === 0) return 0n;
  const negative = x < 0;
  const [mantissa, expPart] = Math.abs(x).toExponential(14).split("e");
  const digits = mantissa.replace(".", ""); // 15 digits, decimal point after the first
  const exponent = Number(expPart) - 14 + decimals; // power of ten applied to `digits`
  const magnitude = exponent >= 0 ? BigInt(digits) * 10n ** BigInt(exponent) : BigInt(digits) / 10n ** BigInt(-exponent);
  return negative ? -magnitude : magnitude;
}

/** Multiply an amount by basis points. */
export function bps(x: bigint, basisPoints: bigint | number): bigint {
  return (x * BigInt(basisPoints)) / 10_000n;
}
