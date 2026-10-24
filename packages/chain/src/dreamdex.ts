// The real venue: dreamDEX perps on one Somnia network, Hideki (50383) unless
// told otherwise. See networks.ts for Shannon.
//
// Reads go through @somnia-chain/markets-sdk. Writes for a linked account go
// straight to the pool with viem, because the SDK has no perp `...For` writes:
// the app's "Link a bot" grants a key placeOrderFor, cancelOrderFor and
// reduceOrderFor on every perp pool, and nothing else. This mirrors the
// trading-key path of the official dreamDEX bot kit (MIT).

import {
  SomniaMarkets,
  contractErrorsAbi,
  decodePlaceOrder,
  liquidationEngineEventsAbi,
  marginBankEventsAbi,
} from "@somnia-chain/markets-sdk";
import type { LiquidationParams } from "@hoax/core";
import {
  BaseError,
  ContractFunctionRevertedError,
  TransactionReceiptNotFoundError,
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  getAddress,
  http,
  keccak256,
  parseAbi,
  webSocket,
  type Address,
  type Hex,
  type PublicClient,
  type TransactionReceipt,
} from "viem";
import type {
  AccountEventHandlers,
  BookRead,
  FeedRead,
  IocOrder,
  LiquidationEvent,
  LiquidationScan,
  MarginRead,
  MarketInfo,
  PlaceResult,
  PositionRead,
  TradingSigner,
  Venue,
} from "./venue.ts";
import { TxRejectedError, TxRevertedError, TxUnknownError } from "./venue.ts";
import { HIDEKI, type Network } from "./networks.ts";

/** The selectors "Link a bot" grants, as the OperatorPermissionsRegistry keys them. */
export const TRADING_KEY_SELECTOR = {
  placeOrderFor: "0x80054449",
  cancelOrderFor: "0xe37b444b",
  reduceOrderFor: "0x364c2587",
} as const;

export const OPERATOR_ABI = [
  ...parseAbi([
    "function placeOrderFor(address owner, bool isBid, uint64 userData, uint256 price, uint256 quantity, uint64 expireTimestampNs, uint8 orderType, uint8 selfMatchingOption, address builder, uint96 builderFeeBpsTimes1k) payable returns (bool success, uint128 orderId)",
    "function cancelOrderFor(address owner, uint128 orderId)",
    "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
  ]),
  ...contractErrorsAbi,
] as const;

/** Somnia bills gas used, not the limit; an IOC crossing several levels estimated 7.7M. */
const ORDER_GAS = 10_000_000n;
const ORDER_TYPE_IOC = 2;
const ZERO = "0x0000000000000000000000000000000000000000" as const;
const MARKET_TTL_MS = 5 * 60 * 1000;
/** eth_getLogs span the Hideki RPC accepts: toBlock - fromBlock <= 1000. */
const LOG_WINDOW = 1000n;
/** Blocks one liquidation scan covers at most (20 windows); callers page forward from toBlock + 1. */
const DEFAULT_SCAN_BLOCKS = 20_000n;
/** How long a sent transaction's receipt is awaited before its result counts as unknown. */
const RECEIPT_TIMEOUT_MS = 60_000;
/** SDK reads go over its own WebSocket transport, which has no timeout of its own. */
const DEFAULT_READ_TIMEOUT_MS = 15_000;

/**
 * A broadcast the node refused outright: nothing entered its mempool. Anything
 * else (a timeout, a dropped connection) may have gone out.
 */
function refusedOutright(err: unknown): boolean {
  const m = (err instanceof BaseError ? `${err.shortMessage} ${err.details ?? ""}` : String(err)).toLowerCase();
  return /insufficient funds|intrinsic gas|nonce too low|exceeds block gas limit|invalid sender|gas limit reached|underpriced/.test(m);
}

/** The revert's name when the error carries one (e.g. ImmediateOrCancelNoFill), else viem's short message. */
export function revertName(err: unknown): string {
  if (err instanceof BaseError) {
    const revert = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (revert instanceof ContractFunctionRevertedError) return revert.data?.errorName ?? revert.reason ?? revert.shortMessage;
    return err.shortMessage;
  }
  return err instanceof Error ? err.message : String(err);
}

export interface DreamDexVenueOptions {
  rpcUrl?: string;
  wsUrl?: string;
  indexerUrl?: string;
  /** Per-request RPC timeout. viem's 10 s default is too short for a cold fork. */
  rpcTimeoutMs?: number;
  /** Timeout for reads through the markets SDK. */
  readTimeoutMs?: number;
  /** Which network's dreamDEX. Defaults to Hideki. */
  network?: Network;
}

export class DreamDexVenue implements Venue {
  readonly name: string;
  readonly network: Network;
  readonly chainId: number;
  private readonly exchange: SomniaMarkets;
  private readonly publicClient: PublicClient;
  private readonly rpcUrl: string;
  private readonly rpcTimeoutMs: number | undefined;
  private readonly readTimeoutMs: number;
  private readonly wsUrl: string;
  private markets: { at: number; list: MarketInfo[] } | null = null;
  private liquidation = new Map<string, { engine: Address; params: LiquidationParams }>();

  constructor(opts: DreamDexVenueOptions = {}) {
    this.network = opts.network ?? HIDEKI;
    this.name = `dreamdex-${this.network.key}`;
    this.chainId = this.network.id;
    this.rpcUrl = opts.rpcUrl ?? this.network.rpcUrl;
    this.rpcTimeoutMs = opts.rpcTimeoutMs;
    this.readTimeoutMs = opts.readTimeoutMs ?? Math.max(DEFAULT_READ_TIMEOUT_MS, opts.rpcTimeoutMs ?? 0);
    this.wsUrl = opts.wsUrl ?? this.network.wsUrl;
    this.exchange = new SomniaMarkets({
      chain: this.network.chain,
      wsRpcUrl: this.wsUrl,
      indexerUrl: opts.indexerUrl ?? this.network.indexerUrl,
      addresses: this.network.addresses,
    });
    this.publicClient = createPublicClient({ chain: this.network.chain, transport: http(this.rpcUrl, { timeout: this.rpcTimeoutMs }) }) as PublicClient;
  }

  private get client() {
    return this.exchange.client;
  }

  /** A read that gives up after the read timeout, so one hung socket cannot stall a tick. */
  private timed<T>(what: string, p: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} timed out after ${this.readTimeoutMs} ms`)), this.readTimeoutMs);
    });
    return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
  }

  async listMarkets(): Promise<MarketInfo[]> {
    if (this.markets && Date.now() - this.markets.at < MARKET_TTL_MS) return this.markets.list;
    const rows = await this.timed("listPerpMarkets", this.client.listPerpMarkets());
    const list = await Promise.all(
      rows.map(async (m): Promise<MarketInfo> => {
        const risk = await this.timed("getPerpRiskParams", this.client.getPerpRiskParams(m.poolAddress));
        return {
          symbol: `${m.baseSymbol ?? "?"}-PERP`,
          baseSymbol: m.baseSymbol ?? "?",
          pool: getAddress(m.poolAddress),
          marginBank: getAddress(m.marginBank),
          baseDecimals: m.baseDecimals,
          tickSize: BigInt(m.tickSize),
          lotSize: BigInt(m.lotSize),
          minQuantity: BigInt(m.minQuantity),
          maintenanceMarginBps: Number(risk.maintenanceMarginBps),
          takerFeeBpsTimes1k: Number(risk.takerFeeBpsTimes1k),
        };
      }),
    );
    this.markets = { at: Date.now(), list };
    return list;
  }

  private async engineFor(marginBank: Address) {
    const cached = this.liquidation.get(marginBank.toLowerCase());
    if (cached) return cached;
    const system = await this.timed("getPerpSystemConfig", this.client.getPerpSystemConfig(marginBank));
    const engine = getAddress(system.liquidationEngine);
    const config = await this.timed("getLiquidationEngineConfig", this.client.getLiquidationEngineConfig(engine));
    const entry = {
      engine,
      params: { penaltyBps: Number(config.penaltyBps), minSpreadBps: Number(config.minSpreadBps) },
    };
    this.liquidation.set(marginBank.toLowerCase(), entry);
    return entry;
  }

  async liquidationParams(marginBank: Address): Promise<LiquidationParams> {
    return (await this.engineFor(marginBank)).params;
  }

  async readMargin(marginBank: Address, owner: Address): Promise<MarginRead> {
    const a = await this.timed("getMarginAccount", this.client.getMarginAccount(marginBank, owner));
    return {
      blockNumber: a.asOfBlock,
      equity: a.equity,
      mmReq: a.mmReq,
      cmReq: a.cmReq,
      status: String(a.marginStatus),
      activePools: a.activePerpPools.map((p) => getAddress(p)),
    };
  }

  async readPosition(market: MarketInfo, owner: Address): Promise<PositionRead> {
    const p = await this.timed("getPerpPosition", this.client.getPerpPosition({ marginBank: market.marginBank, account: owner, pool: market.pool }));
    return { size: p.size, avgEntryPrice: p.avgEntryPrice };
  }

  async readFeed(market: MarketInfo): Promise<FeedRead> {
    const f = await this.timed("getPerpFeedStatus", this.client.getPerpFeedStatus(market.pool));
    return { markPrice: f.markPrice, markOk: f.markPriceOk && f.markPrice > 0n };
  }

  async readLiquidationPrice(market: MarketInfo, owner: Address): Promise<bigint | null> {
    return this.timed("getLiquidationPrice", this.client.getLiquidationPrice({ marginBank: market.marginBank, pool: market.pool, account: owner }));
  }

  async readBook(market: MarketInfo, depth: number): Promise<BookRead> {
    const b = await this.timed("getSpotOrderBook", this.client.getSpotOrderBook(market.pool, { depth }));
    return {
      blockNumber: b.blockNumber ?? 0n,
      bids: b.bids.map((l) => ({ price: BigInt(l.price), quantity: BigInt(l.quantity) })),
      asks: b.asks.map((l) => ({ price: BigInt(l.price), quantity: BigInt(l.quantity) })),
    };
  }

  async isLinked(market: MarketInfo, owner: Address, operator: Address): Promise<boolean> {
    return (await this.publicClient.readContract({
      address: market.pool,
      abi: OPERATOR_ABI,
      functionName: "isOperatorAuthorized",
      args: [owner, operator, TRADING_KEY_SELECTOR.placeOrderFor],
    })) as boolean;
  }

  async builderApproval(market: MarketInfo, owner: Address, builder: Address): Promise<bigint> {
    return this.timed("getEffectiveBuilderApproval", this.client.getEffectiveBuilderApproval({ pool: market.pool, user: owner, builder }));
  }

  async maxBuilderFee(market: MarketInfo): Promise<bigint> {
    return this.timed("getMaxBuilderFeeBpsTimes1k", this.client.getMaxBuilderFeeBpsTimes1k(market.pool));
  }

  private wallet(signer: TradingSigner) {
    return createWalletClient({ account: signer, chain: this.network.chain, transport: http(this.rpcUrl, { timeout: this.rpcTimeoutMs }) });
  }

  /**
   * Sign locally, report the hash and nonce, then broadcast. A broadcast error
   * the node gave for a transaction it refused is "rejected"; any other is
   * "unknown", because the transaction may be out.
   */
  private async signAndSend(
    signer: TradingSigner,
    tx: { to: Address; data?: Hex; value?: bigint; gas?: bigint; nonce?: number; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint; gasPrice?: bigint },
    onSent?: (hash: Hex, nonce: number) => Promise<void>,
  ): Promise<Hex> {
    const wallet = this.wallet(signer);
    let serialized: Hex;
    let nonce: number;
    // Preparing reads the nonce and fees from the RPC: a failure here is the
    // RPC's, nothing was signed or sent, and it is thrown as it is.
    const prepared = await wallet.prepareTransactionRequest({ ...tx, account: signer, chain: this.network.chain } as never);
    nonce = Number((prepared as { nonce: number }).nonce);
    serialized = await wallet.signTransaction(prepared as never);
    const hash = keccak256(serialized);
    if (onSent) await onSent(hash, nonce);
    try {
      await wallet.sendRawTransaction({ serializedTransaction: serialized });
    } catch (err) {
      if (refusedOutright(err)) throw new TxRejectedError(revertName(err));
      throw new TxUnknownError(hash, err);
    }
    return hash;
  }

  async placeIocFor(
    signer: TradingSigner,
    owner: Address,
    market: MarketInfo,
    order: IocOrder,
    onSent?: (hash: Hex, nonce: number) => Promise<void>,
  ): Promise<PlaceResult> {
    const expire = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n;
    const args = [
      owner,
      order.isBid,
      0n,
      order.price,
      order.quantity,
      expire,
      ORDER_TYPE_IOC,
      0,
      order.builder ?? ZERO,
      order.builderFeeBpsTimes1k,
    ] as const;
    try {
      // Simulate first so a revert arrives with its name instead of a bare status 0.
      await this.publicClient.simulateContract({ address: market.pool, abi: OPERATOR_ABI, functionName: "placeOrderFor", args, account: signer, gas: ORDER_GAS });
    } catch (err) {
      const name = revertName(err);
      if (name.includes("ImmediateOrCancelNoFill")) {
        return { hash: null, blockNumber: await this.blockNumber(), fills: [], noFill: true };
      }
      // A revert is the pool refusing the order; anything else (a timeout, a
      // dropped connection) is the RPC, which says nothing about the order.
      if (err instanceof BaseError && err.walk((e) => e instanceof ContractFunctionRevertedError)) throw new TxRejectedError(name);
      throw err;
    }
    const data = encodeFunctionData({ abi: OPERATOR_ABI, functionName: "placeOrderFor", args });
    const hash = await this.signAndSend(signer, { to: market.pool, data, gas: ORDER_GAS }, onSent);
    let receipt: TransactionReceipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    } catch (err) {
      throw new TxUnknownError(hash, err);
    }
    if (receipt.status !== "success") throw new TxRevertedError(hash);
    return this.placeResult(hash, receipt, market);
  }

  private placeResult(hash: Hex, receipt: TransactionReceipt, market: MarketInfo): PlaceResult {
    const decoded = decodePlaceOrder(receipt, market.pool);
    return {
      hash,
      blockNumber: receipt.blockNumber,
      fills: decoded.fills.map((f) => ({ quantity: f.quantityFilled, price: f.fillPrice })),
      noFill: decoded.fills.length === 0,
    };
  }

  async orderResult(hash: Hex, market: MarketInfo): Promise<PlaceResult | "reverted" | null> {
    let receipt: TransactionReceipt;
    try {
      receipt = await this.publicClient.getTransactionReceipt({ hash });
    } catch (err) {
      if (err instanceof TransactionReceiptNotFoundError) return null;
      throw err;
    }
    if (receipt.status !== "success") return "reverted";
    return this.placeResult(hash, receipt, market);
  }

  async liquidationsSince(marginBank: Address, owner: Address, fromBlock: bigint, maxBlocks = DEFAULT_SCAN_BLOCKS): Promise<LiquidationScan> {
    const { engine } = await this.engineFor(marginBank);
    const head = await this.publicClient.getBlockNumber();
    // The Hideki RPC refuses eth_getLogs when toBlock - fromBlock exceeds 1000
    // (100 s of blocks), so read in windows. A scan covers at most maxBlocks;
    // the caller keeps its cursor and pages forward, so nothing is skipped.
    const end = fromBlock + maxBlocks - 1n < head ? fromBlock + maxBlocks - 1n : head;
    let from = fromBlock;
    const out: LiquidationEvent[] = [];
    while (from <= end) {
      const to = from + LOG_WINDOW < end ? from + LOG_WINDOW : end;
      const logs = await this.publicClient.getContractEvents({
        address: engine,
        abi: liquidationEngineEventsAbi,
        eventName: "PositionLiquidated",
        args: { account: owner },
        fromBlock: from,
        toBlock: to,
      });
      for (const log of logs) {
        const args = log.args as { account: Address; perpPool: Address; sizeDelta: bigint; markPrice: bigint };
        out.push({
          account: getAddress(args.account),
          pool: getAddress(args.perpPool),
          sizeDelta: args.sizeDelta,
          markPrice: args.markPrice,
          blockNumber: log.blockNumber ?? 0n,
          txHash: (log.transactionHash ?? "0x") as Hex,
        });
      }
      from = to + 1n;
    }
    return { events: out, toBlock: end < fromBlock ? fromBlock - 1n : end };
  }

  async nativeBalance(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  async minedNonce(address: Address): Promise<number> {
    return this.publicClient.getTransactionCount({ address, blockTag: "latest" });
  }

  async knowsTransaction(hash: Hex): Promise<boolean> {
    try {
      await this.publicClient.getTransaction({ hash });
      return true;
    } catch (err) {
      if (err instanceof BaseError && err.name === "TransactionNotFoundError") return false;
      throw err;
    }
  }

  async cancelNonce(signer: TradingSigner, nonce: number, onSent?: (hash: Hex) => Promise<void>): Promise<Hex> {
    // Twice the current fee outbids whatever is stuck at this nonce.
    const fees = await this.publicClient.estimateFeesPerGas().catch(() => null);
    const bump =
      fees && "maxFeePerGas" in fees && fees.maxFeePerGas
        ? { maxFeePerGas: fees.maxFeePerGas * 2n, maxPriorityFeePerGas: (fees.maxPriorityFeePerGas ?? 0n) * 2n + 1n }
        : { gasPrice: ((await this.publicClient.getGasPrice()) * 2n) as bigint };
    return this.signAndSend(signer, { to: signer.address, value: 0n, gas: 21_000n, nonce, ...bump }, onSent ? (hash) => onSent(hash) : undefined);
  }

  async sendNative(from: TradingSigner, to: Address, amount: bigint): Promise<Hex> {
    const hash = await this.signAndSend(from, { to, value: amount });
    let receipt: TransactionReceipt;
    try {
      receipt = await this.publicClient.waitForTransactionReceipt({ hash, timeout: RECEIPT_TIMEOUT_MS });
    } catch (err) {
      throw new TxUnknownError(hash, err);
    }
    if (receipt.status !== "success") throw new TxRevertedError(hash);
    return hash;
  }

  async blockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  watchAccounts(marginBank: Address, owners: Address[], handlers: AccountEventHandlers): () => void {
    if (owners.length === 0) return () => {};
    const ws = createPublicClient({ chain: this.network.chain, transport: webSocket(this.wsUrl) });
    const stops: Array<() => void> = [];
    let stopped = false;
    stops.push(
      ws.watchContractEvent({
        address: marginBank,
        abi: marginBankEventsAbi,
        eventName: "PositionUpdated",
        args: { account: owners },
        onLogs: (logs) => {
          for (const log of logs) {
            const a = log.args as { account: Address; perpPool: Address };
            handlers.onPositionChange(getAddress(a.account), getAddress(a.perpPool));
          }
        },
        onError: handlers.onError,
      }),
    );
    void this.engineFor(marginBank).then(({ engine }) => {
      if (stopped) return; // unsubscribed before the engine address resolved
      stops.push(
        ws.watchContractEvent({
          address: engine,
          abi: liquidationEngineEventsAbi,
          eventName: "PositionLiquidated",
          args: { account: owners },
          onLogs: (logs) => {
            for (const log of logs) {
              const a = log.args as { account: Address; perpPool: Address; sizeDelta: bigint; markPrice: bigint };
              handlers.onLiquidation({
                account: getAddress(a.account),
                pool: getAddress(a.perpPool),
                sizeDelta: a.sizeDelta,
                markPrice: a.markPrice,
                blockNumber: log.blockNumber ?? 0n,
                txHash: (log.transactionHash ?? "0x") as Hex,
              });
            }
          },
          onError: handlers.onError,
        }),
      );
    }, handlers.onError);
    return () => {
      // The socket itself is viem's, cached per URL and shared with the SDK's
      // reads, so only the subscriptions stop here.
      stopped = true;
      for (const stop of stops) stop();
    };
  }

  async close(): Promise<void> {
    await this.exchange.close();
  }
}
