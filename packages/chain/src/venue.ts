// What the watcher needs from a venue. DreamDexVenue talks to Somnia Tokyo
// testnet; SimVenue models the same margin rules in memory for tests and the
// demo replay. The watcher only ever sees this interface.

import type { BookLevel, LiquidationParams, MarketParams } from "@hoax/core";
import type { Address, Hex, LocalAccount } from "viem";

export interface MarketInfo extends MarketParams {
  baseSymbol: string;
  marginBank: Address;
}

export interface MarginRead {
  blockNumber: bigint;
  equity: bigint;
  mmReq: bigint;
  cmReq: bigint;
  status: string;
  /** Pools the account holds a position in. */
  activePools: Address[];
}

export interface PositionRead {
  /** Signed raw base units. */
  size: bigint;
  avgEntryPrice: bigint;
}

export interface FeedRead {
  markPrice: bigint;
  markOk: boolean;
}

export interface BookRead {
  blockNumber: bigint;
  bids: BookLevel[];
  asks: BookLevel[];
}

export interface Fill {
  quantity: bigint;
  price: bigint;
}

export interface PlaceResult {
  /** null when nothing was sent (the IOC simulated to no fill). */
  hash: Hex | null;
  blockNumber: bigint;
  fills: Fill[];
  /** The IOC found nothing to cross (the pool reverts ImmediateOrCancelNoFill). */
  noFill: boolean;
}

/** A transaction was never sent: the simulation refused it. Nothing changed on chain. */
export class TxRejectedError extends Error {
  constructor(readonly reason: string) {
    super(`rejected: ${reason}`);
    this.name = "TxRejectedError";
  }
}

/** A transaction was mined and reverted: gas was spent, nothing else changed. */
export class TxRevertedError extends Error {
  constructor(readonly hash: Hex) {
    super(`reverted on chain (tx ${hash})`);
    this.name = "TxRevertedError";
  }
}

/**
 * A transaction was sent but its result is not known: the receipt wait timed
 * out or the connection dropped. It may still land, or may already have.
 */
export class TxUnknownError extends Error {
  constructor(
    readonly hash: Hex,
    readonly cause?: unknown,
  ) {
    super(`sent, result unknown (tx ${hash})`);
    this.name = "TxUnknownError";
  }
}

export interface LiquidationScan {
  events: LiquidationEvent[];
  /** The last block the scan covered. The next scan starts after it. */
  toBlock: bigint;
}

/** A key that signs for an account it was linked to. */
export type TradingSigner = LocalAccount;

export interface LiquidationEvent {
  account: Address;
  pool: Address;
  sizeDelta: bigint;
  markPrice: bigint;
  blockNumber: bigint;
  txHash: Hex;
}

export interface AccountEventHandlers {
  onPositionChange(account: Address, pool: Address): void;
  onLiquidation(event: LiquidationEvent): void;
  onError?(err: unknown): void;
}

export interface IocOrder {
  isBid: boolean;
  price: bigint;
  quantity: bigint;
  builder: Address | null;
  builderFeeBpsTimes1k: bigint;
}

export interface Venue {
  readonly name: string;
  /** The chain this venue trades on. Unset on the simulator, which serves every account. */
  readonly chainId?: number;
  listMarkets(): Promise<MarketInfo[]>;
  liquidationParams(marginBank: Address): Promise<LiquidationParams>;
  readMargin(marginBank: Address, owner: Address): Promise<MarginRead>;
  readPosition(market: MarketInfo, owner: Address): Promise<PositionRead>;
  readFeed(market: MarketInfo): Promise<FeedRead>;
  readLiquidationPrice(market: MarketInfo, owner: Address): Promise<bigint | null>;
  readBook(market: MarketInfo, depth: number): Promise<BookRead>;
  /** Whether the pool lets `operator` place orders for `owner`. */
  isLinked(market: MarketInfo, owner: Address, operator: Address): Promise<boolean>;
  /** The owner's effective builder-fee approval for `builder`, bps x 1000. */
  builderApproval(market: MarketInfo, owner: Address, builder: Address): Promise<bigint>;
  maxBuilderFee(market: MarketInfo): Promise<bigint>;
  /**
   * Send an immediate-or-cancel order for `owner`, signed by the linked key.
   * The transaction is signed locally first, so `onSent` runs with its hash
   * and nonce before it is broadcast. Throws TxRejectedError (never sent: the
   * simulation or the node refused it), TxRevertedError (mined and reverted)
   * or TxUnknownError (maybe sent, result unknown).
   */
  placeIocFor(
    signer: TradingSigner,
    owner: Address,
    market: MarketInfo,
    order: IocOrder,
    onSent?: (hash: Hex, nonce: number) => Promise<void>,
  ): Promise<PlaceResult>;
  /** Transactions this address has had mined (the next nonce once everything pending has landed). */
  minedNonce(address: Address): Promise<number>;
  /** Whether the node still holds this transaction, mined or waiting in its mempool. */
  knowsTransaction(hash: Hex): Promise<boolean>;
  /**
   * Replace whatever is waiting at `nonce` with an empty self-transfer at a
   * higher fee, so a stuck order can never land later. Returns its hash.
   */
  cancelNonce(signer: TradingSigner, nonce: number, onSent?: (hash: Hex) => Promise<void>): Promise<Hex>;
  /** The result of an order sent earlier: its fills, "reverted", or null while it has no receipt. */
  orderResult(hash: Hex, market: MarketInfo): Promise<PlaceResult | "reverted" | null>;
  /**
   * Liquidations of `owner` from `fromBlock`, covering at most `maxBlocks`
   * blocks towards the head. Page forward from `toBlock + 1`.
   */
  liquidationsSince(marginBank: Address, owner: Address, fromBlock: bigint, maxBlocks?: bigint): Promise<LiquidationScan>;
  nativeBalance(address: Address): Promise<bigint>;
  /**
   * The STT a key must hold before the chain will accept one close from it: the
   * order's gas limit times the fee it would offer now. Somnia bills gas used, but
   * admits a transaction only when the balance covers the whole limit.
   */
  orderGasReserve(): Promise<bigint>;
  /** Throws TxUnknownError when it was sent but not confirmed. */
  sendNative(from: TradingSigner, to: Address, amount: bigint): Promise<Hex>;
  blockNumber(): Promise<bigint>;
  /** Push position changes and liquidations for these owners. Returns an unsubscribe. */
  watchAccounts(marginBank: Address, owners: Address[], handlers: AccountEventHandlers): () => void;
  close(): Promise<void>;
}
