// Counterfactual accounting. A close only becomes "saved" if, within 24 hours,
// the mark reaches the liquidation price the position had before the close and
// the reduced position survives. Otherwise it is "not-needed" and its cost is
// the price of insurance. A liquidation after the close turns it into "missed".
//
// The receipt written at the close is never changed: it was signed as
// "pending". The resolution is its own record, signed by the same key, that
// names the receipt by its hash.

import { equityPreserved, evaluateTracking, type Outcome, type Resolution } from "@hoax/core";
import { signResolution, type MarketInfo, type Venue } from "@hoax/chain";
import type { ActionRow, CounterfactualRow, Store } from "@hoax/db";
import { getAddress } from "viem";
import type { KeyProvider } from "./keystore.ts";
import type { Logger } from "./log.ts";

export class CounterfactualTracker {
  constructor(
    private readonly venue: Venue,
    private readonly store: Store,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
    private readonly keys: KeyProvider | null = null,
  ) {}

  async run(): Promise<number> {
    // Only this network's actions: the same pool address can exist on both networks.
    const pending = await this.store.listPendingActions(this.venue.chainId);
    if (pending.length === 0) return 0;
    const markets = await this.venue.listMarkets();
    const byPool = new Map(markets.map((m) => [m.pool.toLowerCase(), m]));
    const feeds = new Map<string, { mark: bigint; ok: boolean }>();
    const liquidation = markets[0] ? await this.venue.liquidationParams(markets[0].marginBank) : null;
    let resolved = 0;

    for (const action of pending) {
      const market = byPool.get(action.pool.toLowerCase());
      if (!market || !liquidation) continue;
      try {
        let feed = feeds.get(market.pool);
        if (!feed) {
          const f = await this.venue.readFeed(market);
          feed = { mark: f.markPrice, ok: f.markOk };
          feeds.set(market.pool, feed);
        }
        // The window runs from the close itself, as the signed receipt stamps it.
        const closedAt = Date.parse(action.receipt.createdAt) || action.createdAt.getTime();
        const ageMs = this.now() - closedAt;
        // The engine records every liquidation step it has scanned, with its
        // block; the store answers for everything up to the engine's cursor.
        let liquidatedSince = await this.store.liquidatedAfter(action.accountId, action.pool, action.block ?? 0n);
        let verdict = evaluateTracking({
          side: action.side,
          originalLiquidationPrice: action.liqPriceBefore,
          mark: feed.ok ? feed.mark : 0n,
          liquidatedSince,
          ageMs,
        });
        // A stale mark reads as 0 above, so it can never count as "reached".
        if (verdict === "pending") continue;
        if (verdict !== "liquidated") {
          // Before crediting anything, look at the chain itself past the engine's
          // cursor, so a liquidation it has not scanned yet cannot become a save.
          liquidatedSince = await this.liquidatedOnChain(action, market);
          if (liquidatedSince) verdict = "liquidated";
        }
        await this.resolve(action, market, verdict, feed.mark, liquidation.penaltyBps);
        resolved++;
      } catch (err) {
        this.log.warn("counterfactual check failed", { action: action.id, error: String(err).slice(0, 200) });
      }
    }
    return resolved;
  }

  /** Liquidations of this action's pool after it, in the blocks the engine has not scanned yet. */
  private async liquidatedOnChain(action: ActionRow, market: MarketInfo): Promise<boolean> {
    const account = await this.store.getAccount(action.accountId);
    const after = action.block ?? 0n;
    let from = account?.liqScanFrom !== null && account?.liqScanFrom !== undefined && account.liqScanFrom > after ? account.liqScanFrom : after + 1n;
    const head = await this.venue.blockNumber();
    while (from <= head) {
      const scan = await this.venue.liquidationsSince(market.marginBank, getAddress(action.owner), from);
      if (scan.events.some((e) => e.pool.toLowerCase() === action.pool.toLowerCase() && e.blockNumber > after)) return true;
      if (scan.toBlock < from) break;
      from = scan.toBlock + 1n;
    }
    return false;
  }

  private async resolve(
    action: ActionRow,
    market: MarketInfo,
    verdict: "reached" | "expired" | "liquidated",
    mark: bigint,
    penaltyBps: number,
  ): Promise<void> {
    const resolvedAt = new Date(this.now());
    const base = {
      actionId: action.id,
      originalLiqPrice: action.liqPriceBefore,
      resolvedAt,
    };
    let row: Omit<CounterfactualRow, "resolution" | "resolutionHash" | "resolutionSignature">;
    let reason: string | null = null;
    if (verdict === "expired") {
      row = { ...base, reachedAtBlock: null, equityAtReach: null, equityIfLiquidated: null, preserved: null, finalOutcome: "not-needed" };
    } else if (verdict === "liquidated") {
      reason = "liquidated after the close: the cut was not enough";
      row = { ...base, reachedAtBlock: null, equityAtReach: null, equityIfLiquidated: null, preserved: null, finalOutcome: "missed" };
    } else {
      const margin = await this.venue.readMargin(market.marginBank, getAddress(action.owner));
      const result = equityPreserved({
        equityNow: margin.equity,
        mmReqBefore: action.mmReqBefore,
        positionSizeBefore: action.sizeBefore,
        markBefore: action.mark,
        originalLiquidationPrice: action.liqPriceBefore!,
        market,
        penaltyBps,
        forcedSlippage: action.forcedSlippage ?? 0n,
      });
      row = {
        ...base,
        reachedAtBlock: margin.blockNumber,
        equityAtReach: margin.equity,
        equityIfLiquidated: result.equityIfLiquidated,
        preserved: result.preserved,
        finalOutcome: "saved",
      };
    }
    const outcome: Outcome = row.finalOutcome;
    const signed = await this.sign(action, outcome, reason, row.preserved, row.reachedAtBlock, resolvedAt);
    await this.store.upsertCounterfactual({ ...row, ...signed });
    await this.store.updateActionOutcome(action.id, outcome, reason ?? undefined);
    if (outcome === "saved") this.log.info("save confirmed", { action: action.id, mark, preserved: row.preserved });
  }

  private async sign(
    action: ActionRow,
    outcome: Outcome,
    reason: string | null,
    preserved: bigint | null,
    reachedAtBlock: bigint | null,
    resolvedAt: Date,
  ): Promise<Pick<CounterfactualRow, "resolution" | "resolutionHash" | "resolutionSignature">> {
    const resolution: Resolution = {
      version: 1,
      chainId: action.receipt.chainId ?? this.venue.chainId ?? null,
      receiptHash: action.receiptHash as `0x${string}`,
      outcome,
      reason,
      preserved: preserved?.toString() ?? null,
      reachedAtBlock: reachedAtBlock?.toString() ?? null,
      resolvedAt: resolvedAt.toISOString(),
    };
    const signer = this.keys ? await this.keys.get(action.receipt.hoaxKey) : null;
    if (!signer) return { resolution, resolutionHash: null, resolutionSignature: null };
    const { hash, signature } = await signResolution(signer, resolution);
    return { resolution, resolutionHash: hash, resolutionSignature: signature };
  }
}
