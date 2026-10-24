import { DEFAULT_POLICY, type Policy } from "./types.ts";

/** Reasons a policy cannot be saved, or an empty list. */
export function validatePolicy(p: Policy): string[] {
  const errors: string[] = [];
  if (!(p.triggerHealth > 1)) errors.push("trigger health must be above 1.0, where liquidation starts");
  if (!(p.targetHealth > p.triggerHealth)) errors.push("target health must be above the trigger");
  if (p.targetHealth > 10) errors.push("target health above 10 would close almost everything");
  if (!(p.maxClosePct > 0 && p.maxClosePct <= 100)) errors.push("max close per action must be between 0 and 100%");
  if (!(p.maxSlippageBps > 0 && p.maxSlippageBps <= 500)) errors.push("max slippage must be between 0 and 500 bps");
  // At least 5 s: back-to-back closes on one position give the book no time to refill.
  if (!(Number.isInteger(p.cooldownSec) && p.cooldownSec >= 5 && p.cooldownSec <= 3600)) {
    errors.push("cooldown must be a whole number of seconds between 5 and 3600");
  }
  if (!(p.lambda > 0 && p.lambda <= 1)) errors.push("lambda must be between 0 and 1");
  if (!(p.triggerMargin >= 0 && p.triggerMargin < p.triggerHealth - 1)) {
    errors.push("trigger margin must be at least 0 and keep the effective trigger above 1.0");
  }
  if (p.floorSize !== null && p.floorSize < 0n) errors.push("floor size cannot be negative");
  if (typeof p.allowFullClose !== "boolean" || typeof p.enabled !== "boolean") errors.push("allowFullClose and enabled must be true or false");
  return errors;
}

/** Fill a partial policy from the defaults. */
export function withDefaults(partial: Partial<Policy>): Policy {
  return { ...DEFAULT_POLICY, ...partial };
}

/** Policy checks that need the market: a floor under the venue minimum leaves dust nothing can close. */
export function validatePolicyForMarket(p: Policy, market: { minQuantity: bigint }): string[] {
  const errors = validatePolicy(p);
  if (p.floorSize !== null && p.floorSize > 0n && p.floorSize < market.minQuantity) {
    errors.push(`floor size must be 0 or at least the market minimum (${market.minQuantity} base units)`);
  }
  return errors;
}
