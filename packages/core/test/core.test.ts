import { describe, expect, it } from "vitest";
import {
  DEFAULT_POLICY,
  canonicalReceipt,
  clampClose,
  costGate,
  decide,
  equityPreserved,
  estimateCloseCost,
  estimateLiquidationCost,
  evaluateTracking,
  fromFloat,
  health,
  limitPrice,
  receiptHash,
  reconcile,
  sizeClose,
  toFloat,
  validatePolicy,
  walkBook,
  type BookLevel,
  type DecideInput,
  type MarketParams,
  type Receipt,
} from "../src/index.ts";

const E18 = 10n ** 18n;
const usd = (x: number) => fromFloat(x);
const eth = (x: number) => fromFloat(x, 18);

// ETH-PERP on Hideki as read on 2026-10-23: 2.5% maintenance, 0 taker fee.
const ETH: MarketParams = {
  symbol: "ETH",
  pool: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
  baseDecimals: 18,
  tickSize: 10n ** 16n,
  lotSize: 10n ** 14n,
  minQuantity: 4n * 10n ** 15n,
  maintenanceMarginBps: 250,
  takerFeeBpsTimes1k: 0,
};

const MARK = 2400n * E18;

function deepBook(mark: bigint, isBid: boolean): BookLevel[] {
  // 10 levels, 1 bp apart, 5 ETH each.
  return Array.from({ length: 10 }, (_, i) => ({
    price: isBid ? mark - (mark * BigInt(i + 1)) / 10_000n : mark + (mark * BigInt(i + 1)) / 10_000n,
    quantity: 5n * E18,
  }));
}

describe("units", () => {
  it("round-trips floats including negatives", () => {
    expect(fromFloat(1.5)).toBe(15n * 10n ** 17n);
    expect(fromFloat(-0.5)).toBe(-5n * 10n ** 17n);
    expect(toFloat(fromFloat(2400.25))).toBeCloseTo(2400.25, 9);
  });
});

describe("sizing", () => {
  const base = { equity: usd(72), mmReq: usd(60), positionSize: eth(1), mark: MARK, market: ETH, policy: DEFAULT_POLICY };

  it("closes exactly enough to restore the target with zero cost", () => {
    // M = 2.5% of 2400 = 60, E = 72, H = 1.2. n = (1.6*60 - 72) / (1.6*0.025) = 600 => 0.25 ETH.
    const r = sizeClose({ ...base, costRate: 0 });
    expect(r.kind).toBe("close");
    if (r.kind !== "close") return;
    expect(r.quantity).toBe(eth(0.25));
    expect(r.full).toBe(false);
    expect(r.projectedHealth).toBeCloseTo(1.6, 6);
  });

  it("closes more when the close itself costs equity, and still reaches the target", () => {
    const r = sizeClose({ ...base, costRate: 0.001 });
    expect(r.kind).toBe("close");
    if (r.kind !== "close") return;
    expect(r.quantity).toBeGreaterThan(eth(0.25));
    expect(r.projectedHealth).toBeGreaterThanOrEqual(1.6 - 1e-9);
  });

  it("caps one action at max close per action", () => {
    const r = sizeClose({ ...base, costRate: 0, policy: { ...DEFAULT_POLICY, maxClosePct: 10 } });
    expect(r.kind).toBe("close");
    if (r.kind !== "close") return;
    expect(r.quantity).toBe(eth(0.1));
    expect(r.capped).toBe(true);
    expect(r.projectedHealth).toBeLessThan(1.6);
  });

  it("raises a tiny close to the market minimum", () => {
    // Just under target: the formula asks for a sliver, the venue needs 0.004.
    const r = sizeClose({ ...base, equity: usd(95.9), costRate: 0 });
    expect(r.kind).toBe("close");
    if (r.kind !== "close") return;
    expect(r.quantity).toBe(ETH.minQuantity);
  });

  it("closes fully when a partial close would leave less than the floor", () => {
    // 0.006 ETH position; the close rounds up to the 0.004 minimum, leaving 0.002 < floor.
    const small = { ...base, positionSize: eth(0.006), equity: usd(0.4), mmReq: usd(0.36) };
    const r = sizeClose({ ...small, costRate: 0 });
    expect(r.kind).toBe("close");
    if (r.kind !== "close") return;
    expect(r.full).toBe(true);
    expect(r.quantity).toBe(eth(0.006));

    const forbidden = sizeClose({ ...small, costRate: 0, policy: { ...DEFAULT_POLICY, allowFullClose: false } });
    expect(forbidden.kind).toBe("none");
  });

  it("does nothing at or above target", () => {
    expect(sizeClose({ ...base, equity: usd(100), costRate: 0 }).kind).toBe("none");
  });

  it("refuses when closing costs more per unit than it frees", () => {
    // H_t*m = 0.04; a 5% cost rate can never raise health.
    expect(sizeClose({ ...base, costRate: 0.05 }).kind).toBe("none");
  });

  it("handles shorts by absolute size", () => {
    const r = sizeClose({ ...base, positionSize: -eth(1), costRate: 0 });
    expect(r.kind).toBe("close");
    if (r.kind === "close") expect(r.quantity).toBe(eth(0.25));
  });
});

describe("cost gate", () => {
  it("walks the book and stops at the limit", () => {
    const bids = deepBook(MARK, true);
    const w = walkBook(bids, eth(12), { isBid: false });
    expect(w.filled).toBe(eth(12));
    const limited = walkBook(bids, eth(12), { isBid: false, limit: bids[1].price });
    expect(limited.filled).toBe(eth(10));
  });

  it("prices a close against the mark", () => {
    const bids = deepBook(MARK, true);
    const c = estimateCloseCost({ side: "long", qty: eth(5), mark: MARK, levels: bids, market: ETH });
    // All 5 ETH fill at the first level, 1 bp under the mark: 5 * 0.24 = 1.2 USDso.
    expect(toFloat(c.cost)).toBeCloseTo(1.2, 6);
    expect(c.rate).toBeCloseTo(0.0001, 8);
  });

  it("adds fees on notional", () => {
    const bids = [{ price: MARK, quantity: eth(10) }];
    const c = estimateCloseCost({
      side: "long",
      qty: eth(1),
      mark: MARK,
      levels: bids,
      market: { ...ETH, takerFeeBpsTimes1k: 1500 },
      builderFeeBpsTimes1k: 10_000,
    });
    // 11.5 bps of 2400 = 2.76
    expect(toFloat(c.cost)).toBeCloseTo(2.76, 6);
    expect(toFloat(c.fees)).toBeCloseTo(2.76, 6);
  });

  it("charges the penalty and at least the minimum spread on liquidation", () => {
    const l = estimateLiquidationCost({
      side: "long",
      positionSize: eth(1),
      mark: MARK,
      liquidationPrice: 2000n * E18,
      levels: deepBook(MARK, true),
      market: ETH,
      liquidation: { penaltyBps: 100, minSpreadBps: 50 },
    });
    expect(toFloat(l.penalty)).toBeCloseTo(20, 6);
    expect(toFloat(l.forcedSlippage)).toBeCloseTo(10, 6);
    expect(toFloat(l.cost)).toBeCloseTo(30, 6);
  });

  it("passes only when close <= lambda x liquidation", () => {
    expect(costGate(usd(10), usd(30), 0.5).pass).toBe(true);
    expect(costGate(usd(15), usd(30), 0.5).pass).toBe(true);
    expect(costGate(usd(16), usd(30), 0.5).pass).toBe(false);
  });
});

describe("flip guard", () => {
  it("clamps a close to the fresh position", () => {
    expect(clampClose(eth(2), eth(1))).toBe(eth(1));
    expect(clampClose(eth(0.5), -eth(1))).toBe(eth(0.5));
  });

  it("classifies fills", () => {
    expect(reconcile({ sizeBefore: eth(1), requested: eth(0.25), filled: eth(0.25), sizeAfter: eth(0.75) }).status).toBe("ok");
    expect(reconcile({ sizeBefore: eth(1), requested: eth(0.25), filled: eth(0.1), sizeAfter: eth(0.9) }).status).toBe("partial");
    expect(reconcile({ sizeBefore: eth(1), requested: eth(0.25), filled: 0n, sizeAfter: eth(1) }).status).toBe("none");
    expect(reconcile({ sizeBefore: -eth(1), requested: eth(0.25), filled: eth(0.25), sizeAfter: -eth(0.75) }).status).toBe("ok");
  });

  it("detects a flip and the amount to flatten", () => {
    // Another bot closed 0.9 first; Hoax's 0.25 then crossed zero.
    const r = reconcile({ sizeBefore: eth(1), requested: eth(0.25), filled: eth(0.25), sizeAfter: -eth(0.15) });
    expect(r.status).toBe("flipped");
    expect(r.flipAmount).toBe(eth(0.15));
  });

  it("detects someone else moving the position", () => {
    const r = reconcile({ sizeBefore: eth(1), requested: eth(0.25), filled: eth(0.25), sizeAfter: eth(0.5) });
    expect(r.status).toBe("conflict");
    expect(r.externalChange).toBe(-eth(0.25));
  });
});

describe("decide", () => {
  const input = (over: Partial<DecideInput> = {}): DecideInput => ({
    nowMs: 1_000_000,
    policy: DEFAULT_POLICY,
    market: ETH,
    state: {
      equity: usd(72),
      mmReq: usd(60),
      positionSize: eth(1),
      mark: MARK,
      markOk: true,
      liquidationPrice: 2350n * E18,
      bids: deepBook(MARK, true),
      asks: deepBook(MARK, false),
    },
    liquidation: { penaltyBps: 100, minSpreadBps: 50 },
    lastActionAtMs: null,
    paused: false,
    builderFeeBpsTimes1k: 0,
    ...over,
  });

  it("acts under the trigger with a sell IOC inside max slippage", () => {
    const d = decide(input());
    expect(d.type).toBe("act");
    if (d.type !== "act") return;
    expect(d.isBid).toBe(false);
    expect(d.quantity).toBeGreaterThanOrEqual(eth(0.25));
    expect(d.limitPrice).toBeGreaterThanOrEqual((MARK * 9970n) / 10_000n);
    expect(d.limitPrice % ETH.tickSize).toBe(0n);
    expect(d.sizing.projectedHealth).toBeGreaterThanOrEqual(1.6 - 1e-9);
    expect(d.gate.pass).toBe(true);
  });

  it("stays idle above the trigger and inside the trigger margin", () => {
    expect(decide(input({ state: { ...input().state, equity: usd(80) } })).type).toBe("idle");
    // H = 1.24: under 1.25 but not by 0.02.
    expect(decide(input({ state: { ...input().state, equity: usd(74.4) } })).type).toBe("idle");
  });

  it("never acts on a stale mark", () => {
    const d = decide(input({ state: { ...input().state, markOk: false } }));
    expect(d.type).toBe("skip");
    if (d.type === "skip") expect(d.reason).toBe("mark feed stale");
  });

  it("respects the cooldown and the pause", () => {
    expect(decide(input({ lastActionAtMs: 1_000_000 - 10_000 })).type).toBe("skip");
    expect(decide(input({ lastActionAtMs: 1_000_000 - 31_000 })).type).toBe("act");
    expect(decide(input({ paused: true })).type).toBe("idle");
  });

  it("skips when the book has nothing within max slippage", () => {
    const thin = [{ price: (MARK * 9900n) / 10_000n, quantity: eth(10) }];
    const d = decide(input({ state: { ...input().state, bids: thin } }));
    expect(d.type).toBe("skip");
    if (d.type === "skip") expect(d.reason).toBe("no liquidity within max slippage");
  });

  it("skips when the close costs more than lambda x liquidation", () => {
    // Fees of 400 bps make the close dearer than half a liquidation.
    const d = decide(input({ builderFeeBpsTimes1k: 400_000 }));
    expect(d.type).toBe("skip");
  });
});

describe("limit price", () => {
  it("rounds inside the slippage bound", () => {
    const tick = 10n ** 16n;
    const sell = limitPrice(2400n * E18 + 3n, false, 30, tick);
    expect(sell % tick).toBe(0n);
    expect(sell).toBeGreaterThanOrEqual(((2400n * E18 + 3n) * 9970n) / 10_000n);
    const buy = limitPrice(2400n * E18 + 3n, true, 30, tick);
    expect(buy).toBeLessThanOrEqual(((2400n * E18 + 3n) * 10030n) / 10_000n);
  });
});

describe("counterfactual", () => {
  it("tracks the original liquidation price for 24 hours", () => {
    const liq = 2350n * E18;
    expect(evaluateTracking({ side: "long", originalLiquidationPrice: liq, mark: 2360n * E18, liquidatedSince: false, ageMs: 1000 })).toBe("pending");
    expect(evaluateTracking({ side: "long", originalLiquidationPrice: liq, mark: 2349n * E18, liquidatedSince: false, ageMs: 1000 })).toBe("reached");
    expect(evaluateTracking({ side: "short", originalLiquidationPrice: liq, mark: 2349n * E18, liquidatedSince: false, ageMs: 1000 })).toBe("pending");
    expect(evaluateTracking({ side: "long", originalLiquidationPrice: liq, mark: 2360n * E18, liquidatedSince: false, ageMs: 86_400_000 })).toBe("expired");
    expect(evaluateTracking({ side: "long", originalLiquidationPrice: liq, mark: 2340n * E18, liquidatedSince: true, ageMs: 1 })).toBe("liquidated");
  });

  it("computes equity preserved against a liquidation at the original price", () => {
    const r = equityPreserved({
      equityNow: usd(50),
      mmReqBefore: usd(60),
      positionSizeBefore: eth(1),
      markBefore: MARK,
      originalLiquidationPrice: 2000n * E18,
      market: ETH,
      penaltyBps: 100,
      forcedSlippage: usd(10),
    });
    // Equity at liquidation = 2.5% of 2000 = 50; minus 20 penalty and 10 slippage = 20 left.
    expect(toFloat(r.equityAtLiquidation)).toBeCloseTo(50, 6);
    expect(toFloat(r.equityIfLiquidated)).toBeCloseTo(20, 6);
    expect(toFloat(r.preserved)).toBeCloseTo(30, 6);
  });
});

describe("receipts", () => {
  const receipt: Receipt = {
    version: 1,
    account: "0x0000000000000000000000000000000000000001",
    hoaxKey: "0x0000000000000000000000000000000000000002",
    market: "ETH",
    pool: ETH.pool,
    side: "long",
    outcome: "pending",
    reason: null,
    blockNumber: "1",
    txHash: null,
    sizeBefore: "1",
    sizeRequested: "1",
    sizeFilled: "1",
    sizeAfter: "0",
    avgFillPrice: null,
    markAtClose: "1",
    closeCost: null,
    estCloseCost: null,
    estLiquidationCost: null,
    healthBefore: 1.2,
    healthAfter: 1.6,
    liqPriceBefore: null,
    liqPriceAfter: null,
    builderFeeBpsTimes1k: 0,
    createdAt: "2026-10-23T00:00:00.000Z",
  };

  it("hashes independently of key order", () => {
    const shuffled = Object.fromEntries(Object.entries(receipt).reverse()) as unknown as Receipt;
    expect(receiptHash(shuffled)).toBe(receiptHash(receipt));
    expect(canonicalReceipt(receipt).startsWith('{"account"')).toBe(true);
  });
});

describe("policy", () => {
  it("accepts the defaults and rejects a target under the trigger", () => {
    expect(validatePolicy(DEFAULT_POLICY)).toEqual([]);
    expect(validatePolicy({ ...DEFAULT_POLICY, targetHealth: 1.2 }).length).toBeGreaterThan(0);
  });

  it("reports health as equity over maintenance", () => {
    expect(health(usd(72), usd(60))).toBeCloseTo(1.2, 9);
    expect(health(usd(1), 0n)).toBe(Number.POSITIVE_INFINITY);
  });
});
