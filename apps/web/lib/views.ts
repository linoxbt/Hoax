import "server-only";
import { receiptSigner, HIDEKI, networkOf, type MarketInfo } from "@hoax/chain";
import type { AccountRow, ActionRow, CounterfactualRow, Store } from "@hoax/db";
import { getAddress, type Hex } from "viem";
import { accountsClient } from "./auth";
import { DEMO_OWNER } from "./demo";
import { BUILDER, DEMO, getMarkets, getVenue } from "./server";

export interface PositionView {
  market: string;
  baseSymbol: string;
  pool: string;
  baseDecimals: number;
  size: bigint;
  side: "long" | "short";
  mark: bigint;
  markOk: boolean;
  liqPrice: bigint | null;
  health: number | null;
  equity: bigint;
  mmReq: bigint;
  source: "chain" | "watcher";
}

async function livePositions(owner: string, markets: MarketInfo[], chainId: number): Promise<PositionView[] | null> {
  const venue = getVenue(chainId);
  if (!venue || markets.length === 0) return null;
  const who = getAddress(owner);
  const margin = await venue.readMargin(markets[0].marginBank, who);
  const health = margin.mmReq > 0n ? Number(margin.equity) / Number(margin.mmReq) : null;
  const byPool = new Map(markets.map((m) => [m.pool.toLowerCase(), m]));
  const out = await Promise.all(
    margin.activePools.map(async (pool) => {
      const m = byPool.get(pool.toLowerCase());
      if (!m) return null;
      const [pos, feed, liq] = await Promise.all([
        venue.readPosition(m, who),
        venue.readFeed(m),
        venue.readLiquidationPrice(m, who),
      ]);
      if (pos.size === 0n) return null;
      const v: PositionView = {
        market: m.symbol,
        baseSymbol: m.baseSymbol,
        pool: m.pool,
        baseDecimals: m.baseDecimals,
        size: pos.size,
        side: pos.size > 0n ? "long" : "short",
        mark: feed.markPrice,
        markOk: feed.markOk,
        liqPrice: liq,
        health,
        equity: margin.equity,
        mmReq: margin.mmReq,
        source: "chain",
      };
      return v;
    }),
  );
  return out.filter((x): x is PositionView => x !== null);
}

export async function positionsFor(store: Store, owner: string, account: AccountRow | null, chainId: number = HIDEKI.id): Promise<PositionView[]> {
  const markets = await getMarkets(chainId);
  // The demo account is sample data with nothing on chain: show its recorded ticks.
  const sample = DEMO && owner.toLowerCase() === DEMO_OWNER;
  try {
    const live = sample ? null : await livePositions(owner, markets, chainId);
    if (live) return live;
  } catch {
    // fall back to the watcher's last reading
  }
  if (!account) return [];
  const bySymbol = new Map(markets.map((m) => [m.symbol, m]));
  return (await store.latestHealth(account.id))
    .filter((t) => t.size !== 0n)
    .map((t) => {
      const m = bySymbol.get(t.market);
      return {
        market: t.market,
        baseSymbol: m?.baseSymbol ?? t.market.replace("-PERP", ""),
        pool: m?.pool ?? "",
        baseDecimals: m?.baseDecimals ?? 18,
        size: t.size,
        side: t.size > 0n ? "long" : "short",
        mark: t.mark,
        markOk: t.markOk,
        liqPrice: t.liqPrice,
        health: t.health,
        equity: t.equity,
        mmReq: t.mmReq,
        source: "watcher",
      } satisfies PositionView;
    });
}

/**
 * Everything the dashboard shows for one dreamDEX account on one network.
 * Hoax's own records (policies, the key, alerts) exist only for accounts it
 * protects, which today are on Hideki; on Shannon the view is live chain data.
 */
export async function accountView(store: Store, owner: string, account: AccountRow | null, isOwner: boolean, chainId: number = HIDEKI.id) {
  const network = networkOf(chainId);
  const venue = getVenue(chainId);
  const markets = await getMarkets(chainId);
  const live = account?.hoaxKey && !(DEMO && owner.toLowerCase() === DEMO_OWNER);
  const [policies, positions, alerts, keyBalance, links] = await Promise.all([
    account ? store.listPolicies(account.id) : Promise.resolve([]),
    positionsFor(store, owner, account, chainId),
    account && isOwner ? store.listAlerts(account.id, 20) : Promise.resolve([]),
    account?.hoaxKey && venue ? venue.nativeBalance(getAddress(account.hoaxKey)).catch(() => null) : Promise.resolve(null),
    live
      ? accountsClient()
          .linkStatus(getAddress(owner), getAddress(account!.hoaxKey!), markets.map((m) => m.pool))
          .catch(() => null)
      : Promise.resolve(null),
  ]);
  return {
    owner: owner.toLowerCase(),
    chainId: network.id,
    network: { id: network.id, key: network.key, name: network.name, explorer: network.explorer },
    /** Whether the Hoax engine can protect accounts on this network yet. */
    protectable: network.id === HIDEKI.id,
    account: account && {
      id: account.id,
      status: account.status,
      hoaxKey: account.hoaxKey,
      paused: account.paused,
      linkedAt: account.linkedAt,
      builderApproval1k: account.builderApproval1k,
      createdAt: account.createdAt,
    },
    isOwner,
    policies,
    positions,
    alerts,
    keyBalance,
    /** Per perp pool (lowercase), whether the Hoax key may trade for this account. Null when unknown. */
    links,
    builder: BUILDER,
    markets: markets.map((m) => ({ symbol: m.symbol, pool: m.pool, baseDecimals: m.baseDecimals, minQuantity: m.minQuantity })),
  };
}

export async function receiptView(action: ActionRow, cf: CounterfactualRow | null) {
  let signatureValid: boolean | null = null;
  if (action.signature) {
    try {
      const signer = await receiptSigner(action.receipt, action.signature as Hex);
      signatureValid = signer.toLowerCase() === action.receipt.hoaxKey.toLowerCase();
    } catch {
      signatureValid = false;
    }
  }
  const markets = await getMarkets();
  const market = markets.find((m) => m.symbol === action.market);
  return {
    ...action,
    baseDecimals: market?.baseDecimals ?? 18,
    counterfactual: cf,
    signatureValid,
    explorer: HIDEKI.explorer,
  };
}
