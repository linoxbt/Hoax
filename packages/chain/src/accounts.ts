// dreamDEX trading accounts and the Hoax link, from the trader's side.
//
// A dreamDEX trader does not trade from their wallet key. The app gives each
// wallet a Safe 1.5.0 smart account (the SomniaAccountFactory's account at
// index 0, owned 1-of-1 by the wallet), and that Safe is the perp `owner`.
// dreamDEX's own "Link a bot" is one Safe transaction batching
// OperatorPermissionsRegistry grants of placeOrderFor, cancelOrderFor and
// reduceOrderFor (read from mainnet Hideki traffic, see spike/README.md).
//
// Hoax builds the same transaction, scoped tighter: per-pool grants on the
// perp pools only, never the registry's global grant, so the key cannot touch
// a spot pool. The wallet sends it straight to its Safe as a pre-validated
// execution (msg.sender is the owner), so one confirmation links every market.

import { accountsAt, planExecution, prevalidatedExecution, type Call } from "@somnia-chain/accounts-sdk";
import { createPublicClient, encodeFunctionData, getAddress, http, parseAbi, type Address, type Hex, type PublicClient } from "viem";
import { HIDEKI, TRADING_KEY_SELECTOR } from "./dreamdex.ts";

export const REGISTRY_ABI = parseAbi([
  "function setOperatorApprovalForPool(address pool, address operator, bytes4[] selectors, bool approved)",
  "function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)",
]);

const POOL_ABI = parseAbi([
  "function getOperatorPermissionsRegistry() view returns (address)",
  "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
  "function approveBuilder(address builder, uint256 maxFeeBpsTimes1k)",
]);

const SAFE_ABI = parseAbi(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)"]);

/** How many factory indices to look at for a wallet's trading account. dreamDEX uses index 0. */
const ACCOUNT_INDICES = [0n, 1n, 2n, 3n] as const;

export const HOAX_SELECTORS = [
  TRADING_KEY_SELECTOR.placeOrderFor,
  TRADING_KEY_SELECTOR.cancelOrderFor,
  TRADING_KEY_SELECTOR.reduceOrderFor,
] as const satisfies readonly Hex[];

export interface TradingAccount {
  index: number;
  address: Address;
  deployed: boolean;
}

export interface LinkTx {
  /** The trader's Safe: the transaction is a call to its execTransaction. */
  to: Address;
  data: Hex;
  value: bigint;
  /** The only address that may send it (the Safe's owner). */
  from: Address;
  /** What the batch does, one line per call, for the confirmation screen. */
  calls: Array<{ to: Address; label: string }>;
}

export interface LinkRequest {
  wallet: Address;
  account: Address;
  operator: Address;
  pools: Address[];
  approved: boolean;
  builder?: { address: Address; feeBpsTimes1k: bigint } | null;
}

export class DreamDexAccounts {
  private readonly client: PublicClient;
  private registry: Address | null = null;

  constructor(rpcUrl: string = HIDEKI.rpcUrl) {
    this.client = createPublicClient({ chain: HIDEKI.chain, transport: http(rpcUrl) }) as PublicClient;
  }

  /** The wallet's dreamDEX trading accounts, deployed or not, lowest index first. */
  async tradingAccounts(wallet: Address): Promise<TradingAccount[]> {
    const scan = await accountsAt(this.client, HIDEKI.chain.id, wallet, ACCOUNT_INDICES);
    return scan.slots.map((s) => ({ index: Number(s.index), address: getAddress(s.address), deployed: s.deployed === true }));
  }

  /**
   * Whether `wallet` controls `account`: the account is the wallet itself, or a
   * Safe the wallet owns at threshold 1 (what a pre-validated execution needs).
   */
  async controls(wallet: Address, account: Address): Promise<boolean> {
    if (wallet.toLowerCase() === account.toLowerCase()) return true;
    try {
      const [owners, threshold] = await Promise.all([
        this.client.readContract({ address: account, abi: SAFE_ABI, functionName: "getOwners" }),
        this.client.readContract({ address: account, abi: SAFE_ABI, functionName: "getThreshold" }),
      ]);
      return threshold === 1n && owners.some((o) => o.toLowerCase() === wallet.toLowerCase());
    } catch {
      return false;
    }
  }

  async operatorRegistry(anyPerpPool: Address): Promise<Address> {
    if (!this.registry) {
      this.registry = getAddress(await this.client.readContract({ address: anyPerpPool, abi: POOL_ABI, functionName: "getOperatorPermissionsRegistry" }));
    }
    return this.registry;
  }

  /** For each pool, whether `operator` may place orders for `owner`. */
  async linkStatus(owner: Address, operator: Address, pools: Address[]): Promise<Record<string, boolean>> {
    const out: Record<string, boolean> = {};
    await Promise.all(
      pools.map(async (pool) => {
        try {
          out[pool.toLowerCase()] = await this.client.readContract({
            address: pool,
            abi: POOL_ABI,
            functionName: "isOperatorAuthorized",
            args: [owner, operator, TRADING_KEY_SELECTOR.placeOrderFor],
          });
        } catch {
          out[pool.toLowerCase()] = false;
        }
      }),
    );
    return out;
  }

  async balance(address: Address): Promise<bigint> {
    return this.client.getBalance({ address });
  }

  /**
   * The one transaction that links (or, with approved=false, unlinks) the Hoax
   * key on every given perp pool, plus the builder approvals when asked. Sent
   * by the wallet to its own Safe.
   */
  async buildLinkTx(req: LinkRequest): Promise<LinkTx> {
    if (req.pools.length === 0) throw new Error("no perp pools to link");
    const registry = await this.operatorRegistry(req.pools[0]);
    const calls: Call[] = [];
    const labels: LinkTx["calls"] = [];
    for (const pool of req.pools) {
      calls.push({
        to: registry,
        value: 0n,
        data: encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "setOperatorApprovalForPool",
          args: [pool, req.operator, [...HOAX_SELECTORS], req.approved],
        }),
      });
      labels.push({ to: registry, label: `${req.approved ? "grant" : "revoke"} trade-only on ${pool}` });
    }
    if (req.builder && req.builder.feeBpsTimes1k > 0n) {
      const fee = req.approved ? req.builder.feeBpsTimes1k : 0n;
      for (const pool of req.pools) {
        calls.push({
          to: pool,
          value: 0n,
          data: encodeFunctionData({ abi: POOL_ABI, functionName: "approveBuilder", args: [req.builder.address, fee] }),
        });
        labels.push({ to: pool, label: `builder fee up to ${Number(fee) / 1000} bps on ${pool}` });
      }
    }

    if (req.wallet.toLowerCase() === req.account.toLowerCase()) {
      // A plain key account (no Safe) can only send the calls one by one; the
      // web app does that itself. Refuse here so nobody wraps a key in execTransaction.
      throw new Error("this account is a plain key, not a dreamDEX Safe: send each call directly");
    }
    const plan = planExecution({ chainId: HIDEKI.chain.id, account: req.account, calls, nonce: 0n });
    const tx = prevalidatedExecution(plan, req.wallet);
    return { to: getAddress(tx.to), data: tx.data, value: tx.value, from: req.wallet, calls: labels };
  }

  /** Gas for the link transaction, from the wallet that will send it, with headroom. */
  async estimateGas(tx: LinkTx): Promise<bigint | null> {
    try {
      const g = await this.client.estimateGas({ account: tx.from, to: tx.to, data: tx.data, value: tx.value });
      return (g * 13n) / 10n;
    } catch {
      return null;
    }
  }
}
