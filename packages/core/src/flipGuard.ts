// dreamDEX has no reduce-only flag, so an oversized close opens the opposite
// position. Three layers stop that: size from a fresh read (clampClose), IOC only
// (no remainder rests), and reconcile after every fill.

import { abs, sign } from "./units.ts";

/** Never ask to close more than the position read just before sending. */
export function clampClose(requested: bigint, positionSize: bigint): bigint {
  const size = abs(positionSize);
  return requested > size ? size : requested;
}

export type ReconcileStatus =
  /** Everything requested filled and the position moved by exactly that much. */
  | "ok"
  /** Some filled; the position moved by exactly what filled. */
  | "partial"
  /** Nothing filled and nothing else changed. */
  | "none"
  /** The position crossed zero: Hoax must flatten `flipAmount` at once. */
  | "flipped"
  /** The position changed by something other than Hoax's fill (another bot, a liquidation). */
  | "conflict";

export interface Reconciliation {
  status: ReconcileStatus;
  /**
   * Raw base units Hoax must buy or sell back after a flip: the part of the
   * crossing its own fill caused, never more than it filled. Another trade that
   * reversed the position on purpose is left alone. 0 when not flipped.
   */
  flipAmount: bigint;
  /** sizeAfter - expected, signed. Non-zero means someone else moved the position. */
  externalChange: bigint;
  expectedAfter: bigint;
}

export function reconcile(args: {
  sizeBefore: bigint;
  requested: bigint;
  filled: bigint;
  sizeAfter: bigint;
}): Reconciliation {
  const { sizeBefore, requested, filled, sizeAfter } = args;
  const direction = BigInt(sign(sizeBefore));
  const expectedAfter = sizeBefore - direction * filled;
  const externalChange = sizeAfter - expectedAfter;

  const flipped = sizeAfter !== 0n && sign(sizeAfter) !== sign(sizeBefore);
  if (flipped) {
    // Hoax filled `filled` towards zero. Whatever lies past zero beyond that is
    // someone else's trade, so the most Hoax undoes is its own fill.
    const over = abs(sizeAfter);
    return { status: "flipped", flipAmount: over < filled ? over : filled, externalChange, expectedAfter };
  }
  if (externalChange !== 0n) return { status: "conflict", flipAmount: 0n, externalChange, expectedAfter };
  if (filled === 0n) return { status: "none", flipAmount: 0n, externalChange, expectedAfter };
  if (filled < requested) return { status: "partial", flipAmount: 0n, externalChange, expectedAfter };
  return { status: "ok", flipAmount: 0n, externalChange, expectedAfter };
}
