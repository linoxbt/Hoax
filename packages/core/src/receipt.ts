// Every Hoax action produces a receipt anyone can re-check from public chain
// data. The receipt hash is signed by the account's Hoax key.

import { keccak256, toBytes } from "viem";
import type { Outcome, Side } from "./types.ts";

export interface Receipt {
  version: 1;
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
