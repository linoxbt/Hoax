// Every Hoax action produces a receipt anyone can re-check from public chain
// data. The receipt hash is signed by the account's Hoax key.

import { keccak256, toBytes } from "viem";
import type { Outcome, Side } from "./types.ts";

export interface Receipt {
  /** 2 adds chainId. Version 1 receipts (Hideki only) are still verifiable as written. */
  version: 1 | 2;
  /** The network the txHash and pool belong to. Absent on version 1. */
  chainId?: number;
  account: `0x${string}`;
  hoaxKey: `0x${string}`;
  market: string;
  pool: `0x${string}`;
  side: Side;
  outcome: Outcome;
  /** Why, for skipped, missed and conflict outcomes. */
  reason: string | null;
  blockNumber: string | null;
  txHash: `0x${string}` | null;
  /** Raw base units. */
  sizeBefore: string;
  sizeRequested: string;
  sizeFilled: string;
  sizeAfter: string | null;
  /** 18-decimal quote per whole base. */
  avgFillPrice: string | null;
  markAtClose: string;
  /** 18-decimal quote units. */
  closeCost: string | null;
  estCloseCost: string | null;
  estLiquidationCost: string | null;
  healthBefore: number;
  healthAfter: number | null;
  liqPriceBefore: string | null;
  liqPriceAfter: string | null;
  builderFeeBpsTimes1k: number;
  createdAt: string;
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.keys(value as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((value as Record<string, unknown>)[k])]),
    );
  }
  return value;
}

/** The exact bytes the signature covers: keys sorted, no whitespace. */
export function canonicalReceipt(receipt: Receipt): string {
  return JSON.stringify(sortKeys(receipt), (_k, v) => {
    if (typeof v === "bigint") throw new Error("receipt fields must be strings, not bigint");
    if (typeof v === "number" && !Number.isFinite(v)) return String(v);
    return v;
  });
}

export function receiptHash(receipt: Receipt): `0x${string}` {
  return keccak256(toBytes(canonicalReceipt(receipt)));
}

/**
 * How a pending receipt turned out, signed separately by the same key when the
 * 24-hour window resolves it. The original receipt is never rewritten, so its
 * signature keeps covering exactly what Hoax knew at the close; this record
 * binds the final outcome to that receipt by its hash.
 */
export interface Resolution {
  version: 1;
  chainId: number | null;
  /** The receipt being resolved. */
  receiptHash: `0x${string}`;
  outcome: Outcome;
  reason: string | null;
  /** Upper bound on equity preserved for a save, 18-decimal quote units. */
  preserved: string | null;
  /** Block at which the mark reached the original liquidation price, for a save. */
  reachedAtBlock: string | null;
  resolvedAt: string;
}

export function canonicalResolution(r: Resolution): string {
  return JSON.stringify(sortKeys(r));
}

export function resolutionHash(r: Resolution): `0x${string}` {
  return keccak256(toBytes(canonicalResolution(r)));
}
