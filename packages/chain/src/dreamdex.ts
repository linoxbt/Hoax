// The real venue: dreamDEX perps on Somnia Tokyo testnet (Hideki, chain 50383).
//
// Reads go through @somnia-chain/markets-sdk. Writes for a linked account go
// straight to the pool with viem, because the SDK has no perp `...For` writes:
// the app's "Link a bot" grants a key placeOrderFor, cancelOrderFor and
// reduceOrderFor on every perp pool, and nothing else. This mirrors the
// trading-key path of the official dreamDEX bot kit (MIT).

import {
  SOMNIA_HIDEKI_TESTNET_ADDRESSES,
  SomniaMarkets,
  contractErrorsAbi,
  decodePlaceOrder,
  liquidationEngineEventsAbi,
  marginBankEventsAbi,
} from "@somnia-chain/markets-sdk";
import { hidekiTestnet } from "@somnia-chain/markets-sdk/chains";
import type { LiquidationParams } from "@hoax/core";
import {
  createPublicClient,
  createWalletClient,
  getAddress,
  http,
  parseAbi,
  webSocket,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import type {
  AccountEventHandlers,
  BookRead,
  FeedRead,
  IocOrder,
  LiquidationEvent,
  MarginRead,
  MarketInfo,
  PlaceResult,
  PositionRead,
  TradingSigner,
  Venue,
} from "./venue.ts";

export const HIDEKI = {
  chain: hidekiTestnet,
  rpcUrl: "https://api.hideki2.infra.testnet.somnia.network",
  wsUrl: "wss://api.hideki2.infra.testnet.somnia.network/ws",
  indexerUrl: "https://hideki-dev.smk.somnia.host/v1/graphql",
  explorer: "https://explorer.testnet.somnia.network/tokyo",
} as const;

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
/** How far back a liquidation scan reaches: 12,000 blocks of 100 ms, 20 minutes. */
const MAX_LOG_LOOKBACK = 12_000n;

export interface DreamDexVenueOptions {
  rpcUrl?: string;
  wsUrl?: string;
  indexerUrl?: string;
}

export class DreamDexVenue implements Venue {
  readonly name = "dreamdex-hideki";
  private readonly exchange: SomniaMarkets;
  private readonly publicClient: PublicClient;
  private readonly rpcUrl: string;
  private readonly wsUrl: string;
  private markets: { at: number; list: MarketInfo[] } | null = null;
  private liquidation = new Map<string, { engine: Address; params: LiquidationParams }>();

  constructor(opts: DreamDexVenueOptions = {}) {
    this.rpcUrl = opts.rpcUrl ?? HIDEKI.rpcUrl;
    this.wsUrl = opts.wsUrl ?? HIDEKI.wsUrl;
    this.exchange = new SomniaMarkets({
      chain: HIDEKI.chain,
      wsRpcUrl: this.wsUrl,
      indexerUrl: opts.indexerUrl ?? HIDEKI.indexerUrl,
      addresses: SOMNIA_HIDEKI_TESTNET_ADDRESSES,
    });
    this.publicClient = createPublicClient({ chain: HIDEKI.chain, transport: http(this.rpcUrl) }) as PublicClient;
  }

  private get client() {
    return this.exchange.client;
  }

  async listMarkets(): Promise<MarketInfo[]> {
    if (this.markets && Date.now() - this.markets.at < MARKET_TTL_MS) return this.markets.list;
    const rows = await this.client.listPerpMarkets();
    const list = await Promise.all(
      rows.map(async (m): Promise<MarketInfo> => {
        const risk = await this.client.getPerpRiskParams(m.poolAddress);
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
    const system = await this.client.getPerpSystemConfig(marginBank);
    const engine = getAddress(system.liquidationEngine);
    const config = await this.client.getLiquidationEngineConfig(engine);
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
    const a = await this.client.getMarginAccount(marginBank, owner);
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
    const p = await this.client.getPerpPosition({ marginBank: market.marginBank, account: owner, pool: market.pool });
    return { size: p.size, avgEntryPrice: p.avgEntryPrice };
  }

  async readFeed(market: MarketInfo): Promise<FeedRead> {
    const f = await this.client.getPerpFeedStatus(market.pool);
    return { markPrice: f.markPrice, markOk: f.markPriceOk && f.markPrice > 0n };
  }

  async readLiquidationPrice(market: MarketInfo, owner: Address): Promise<bigint | null> {
    return this.client.getLiquidationPrice({ marginBank: market.marginBank, pool: market.pool, account: owner });
  }

  async readBook(market: MarketInfo, depth: number): Promise<BookRead> {
    const b = await this.client.getSpotOrderBook(market.pool, { depth });
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
    return this.client.getEffectiveBuilderApproval({ pool: market.pool, user: owner, builder });
  }

  async maxBuilderFee(market: MarketInfo): Promise<bigint> {
    return this.client.getMaxBuilderFeeBpsTimes1k(market.pool);
  }

  async placeIocFor(signer: TradingSigner, owner: Address, market: MarketInfo, order: IocOrder): Promise<PlaceResult> {
    const wallet = createWalletClient({ account: signer, chain: HIDEKI.chain, transport: http(this.rpcUrl) });
    const expire = BigInt(Math.floor(Date.now() / 1000) + 3600) * 1_000_000_000n;
    let request;
    try {
      // Simulate first so a revert arrives with its name instead of a bare status 0.
      ({ request } = await this.publicClient.simulateContract({
        address: market.pool,
        abi: OPERATOR_ABI,
        functionName: "placeOrderFor",
        args: [
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
        ],
        account: signer,
        gas: ORDER_GAS,
      }));
    } catch (err) {
      if (String((err as Error).message).includes("ImmediateOrCancelNoFill")) {
        return { hash: "0x", blockNumber: await this.blockNumber(), fills: [], noFill: true };
      }
      throw err;
    }
    const hash = await wallet.writeContract(request);
    const receipt = await this.publicClient.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      throw new Error(`placeOrderFor reverted on chain (tx ${hash})`);
    }
    const decoded = decodePlaceOrder(receipt, market.pool);
    return {
      hash,
      blockNumber: receipt.blockNumber,
      fills: decoded.fills.map((f) => ({ quantity: f.quantityFilled, price: f.fillPrice })),
      noFill: decoded.fills.length === 0,
    };
  }

  async liquidationsSince(marginBank: Address, owner: Address, fromBlock: bigint): Promise<LiquidationEvent[]> {
    const { engine } = await this.engineFor(marginBank);
    const head = await this.publicClient.getBlockNumber();
    // The Hideki RPC refuses eth_getLogs when toBlock - fromBlock exceeds 1000
    // (100 s of blocks), so read in windows, never further back than MAX_LOG_LOOKBACK.
    let from = fromBlock > head - MAX_LOG_LOOKBACK ? fromBlock : head - MAX_LOG_LOOKBACK;
    const out: LiquidationEvent[] = [];
    while (from <= head) {
      const to = from + LOG_WINDOW < head ? from + LOG_WINDOW : head;
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
    return out;
  }

  async nativeBalance(address: Address): Promise<bigint> {
    return this.publicClient.getBalance({ address });
  }

  async sendNative(from: TradingSigner, to: Address, amount: bigint): Promise<Hex> {
    const wallet = createWalletClient({ account: from, chain: HIDEKI.chain, transport: http(this.rpcUrl) });
    const hash = await wallet.sendTransaction({ to, value: amount, chain: HIDEKI.chain });
    await this.publicClient.waitForTransactionReceipt({ hash });
    return hash;
  }

  async blockNumber(): Promise<bigint> {
    return this.publicClient.getBlockNumber();
  }

  watchAccounts(marginBank: Address, owners: Address[], handlers: AccountEventHandlers): () => void {
    if (owners.length === 0) return () => {};
    const ws = createPublicClient({ chain: HIDEKI.chain, transport: webSocket(this.wsUrl) });
    const stops: Array<() => void> = [];
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
      for (const stop of stops) stop();
    };
  }

  async close(): Promise<void> {
    await this.exchange.close();
  }
}
