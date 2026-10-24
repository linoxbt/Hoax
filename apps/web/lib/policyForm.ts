// The server's own policy rules (@hoax/core validatePolicy), run in the
// browser as the trader types, so a form never sends what the API will refuse.
import { validatePolicy, type Policy } from "@hoax/core";
import type { PolicyJson } from "./types";

/** What an empty number input holds: NaN, which validation reports. */
export const fromInput = (v: string): number => (v.trim() === "" ? Number.NaN : Number(v));
export const toInput = (n: number): string | number => (Number.isNaN(n) ? "" : n);

export function policyProblems(form: Omit<PolicyJson, "market">): string[] {
  const p: Policy = {
    triggerHealth: form.triggerHealth,
    targetHealth: form.targetHealth,
    maxClosePct: form.maxClosePct,
    maxSlippageBps: form.maxSlippageBps,
    cooldownSec: form.cooldownSec,
    floorSize: form.floorSize === null || form.floorSize === "" ? null : /^\d+$/.test(form.floorSize) ? BigInt(form.floorSize) : -1n,
    lambda: form.lambda,
    triggerMargin: form.triggerMargin,
    allowFullClose: form.allowFullClose,
    enabled: form.enabled,
  };
  return validatePolicy(p);
}

/** Input bounds, matching validatePolicy, for the browser's own checks and spinners. */
export const BOUNDS: Record<string, { min: number; max: number }> = {
  triggerHealth: { min: 1.01, max: 10 },
  targetHealth: { min: 1.02, max: 10 },
  maxClosePct: { min: 1, max: 100 },
  maxSlippageBps: { min: 1, max: 500 },
  cooldownSec: { min: 0, max: 3600 },
  lambda: { min: 0.01, max: 1 },
};
