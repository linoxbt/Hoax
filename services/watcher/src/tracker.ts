// Counterfactual accounting. A close only becomes "saved" if, within 24 hours,
// the mark reaches the liquidation price the position had before the close and
// the reduced position survives. Otherwise it is "not-needed" and its cost is
// the price of insurance. A liquidation after the close turns it into "missed".

import { equityPreserved, evaluateTracking } from "@hoax/core";
import type { MarketInfo, Venue } from "@hoax/chain";
import type { ActionRow, Store } from "@hoax/db";
import { getAddress } from "viem";
import type { Logger } from "./log.ts";

export class CounterfactualTracker {
  constructor(
    private readonly venue: Venue,
    private readonly store: Store,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
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
        if (!feed.ok) continue; // judge nothing on a stale mark

        // The engine writes a "missed" receipt for every liquidation of a
        // protected account, so the store answers this without scanning logs.
        const liquidatedSince = await this.store.liquidatedAfter(action.accountId, action.pool, action.createdAt);
        const verdict = evaluateTracking({
          side: action.side,
          originalLiquidationPrice: action.liqPriceBefore,
          mark: feed.mark,
          liquidatedSince,
          ageMs: this.now() - action.createdAt.getTime(),
        });
        if (verdict === "pending") continue;
        await this.resolve(action, market, verdict, feed.mark, liquidation.penaltyBps);
        resolved++;
      } catch (err) {
        this.log.warn("counterfactual check failed", { action: action.id, error: String(err).slice(0, 200) });
      }
    }
    return resolved;
  }

  private async resolve(
    action: ActionRow,
    market: MarketInfo,
    verdict: "reached" | "expired" | "liquidated",
    mark: bigint,
    penaltyBps: number,
  ): Promise<void> {
    const base = {
      actionId: action.id,
      originalLiqPrice: action.liqPriceBefore,
      resolvedAt: new Date(this.now()),
    };
    if (verdict === "expired") {
      await this.store.upsertCounterfactual({
        ...base,
        reachedAtBlock: null,
        equityAtReach: null,
        equityIfLiquidated: null,
        preserved: null,
        finalOutcome: "not-needed",
      });
      await this.store.updateActionOutcome(action.id, "not-needed");
      return;
    }
    if (verdict === "liquidated") {
      await this.store.upsertCounterfactual({
        ...base,
        reachedAtBlock: null,
        equityAtReach: null,
        equityIfLiquidated: null,
        preserved: null,
        finalOutcome: "missed",
      });
      await this.store.updateActionOutcome(action.id, "missed", "liquidated after the close: the cut was not enough");
      return;
    }
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
    await this.store.upsertCounterfactual({
      ...base,
      reachedAtBlock: margin.blockNumber,
      equityAtReach: margin.equity,
      equityIfLiquidated: result.equityIfLiquidated,
      preserved: result.preserved,
      finalOutcome: "saved",
    });
    await this.store.updateActionOutcome(action.id, "saved");
    this.log.info("save confirmed", { action: action.id, mark, preserved: result.preserved });
  }
}
