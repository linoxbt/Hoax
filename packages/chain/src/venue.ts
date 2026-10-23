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
  hash: Hex;
  blockNumber: bigint;
  fills: Fill[];
  /** The IOC found nothing to cross (the pool reverts ImmediateOrCancelNoFill). */
  noFill: boolean;
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
  /** Send an immediate-or-cancel order for `owner`, signed by the linked key. */
  placeIocFor(signer: TradingSigner, owner: Address, market: MarketInfo, order: IocOrder): Promise<PlaceResult>;
  /** Liquidations of `owner` from `fromBlock` to the head. Implementations may bound how far back they look. */
  liquidationsSince(marginBank: Address, owner: Address, fromBlock: bigint): Promise<LiquidationEvent[]>;
  nativeBalance(address: Address): Promise<bigint>;
  sendNative(from: TradingSigner, to: Address, amount: bigint): Promise<Hex>;
  blockNumber(): Promise<bigint>;
  /** Push position changes and liquidations for these owners. Returns an unsubscribe. */
  watchAccounts(marginBank: Address, owners: Address[], handlers: AccountEventHandlers): () => void;
  close(): Promise<void>;
}
