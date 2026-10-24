// dreamDEX trading accounts and the Hoax link, from the trader's side.
//
// A dreamDEX trader does not trade from their wallet key. The app gives each
// wallet a Safe 1.5.0 smart account, and that Safe is the perp `owner`. Older
// accounts are the SomniaAccountFactory's account at index 0 of the wallet,
// owned 1-of-1 by it. The current app derives the account from a session key
// instead and adds the wallet as an owner (threshold 1), so nothing derived
// from the wallet finds it: the accounts indexer, asked "controlled by", does.
// dreamDEX's own "Link a bot" is one Safe transaction batching
// OperatorPermissionsRegistry grants of placeOrderFor, cancelOrderFor and
// reduceOrderFor (read from mainnet Hideki traffic, see spike/README.md).
//
// Hoax builds the same transaction, scoped tighter: per-pool grants on the
// perp pools only, never the registry's global grant, so the key cannot touch
// a spot pool, and placeOrderFor only, the one call the engine makes: the key
// cannot cancel or shrink the trader's resting orders. The wallet sends it straight to its Safe as a pre-validated
// execution (msg.sender is the owner), so one confirmation links every market.

import { accountsAt, getAccountsPage, planExecution, prevalidatedExecution, type Call } from "@somnia-chain/accounts-sdk";
import {
  ContractFunctionExecutionError,
  createPublicClient,
  encodeFunctionData,
  getAddress,
  http,
  parseAbi,
  type Address,
  type Hex,
  type PublicClient,
} from "viem";
import { TRADING_KEY_SELECTOR } from "./dreamdex.ts";
import { HIDEKI, type Network } from "./networks.ts";

export const REGISTRY_ABI = parseAbi([
  "function setOperatorApprovalForPool(address pool, address operator, bytes4[] selectors, bool approved)",
  "function setOperatorApprovalGlobal(address operator, bytes4[] selectors, bool approved)",
  "function isApprovedForPool(address pool, address owner, address operator, bytes4 selector) view returns (bool)",
]);

const POOL_ABI = parseAbi([
  "function getOperatorPermissionsRegistry() view returns (address)",
  "function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)",
  "function approveBuilder(address builder, uint256 maxFeeBpsTimes1k)",
]);

const SAFE_ABI = parseAbi(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)"]);

/** How many factory indices to look at for an account derived from the wallet. dreamDEX used index 0. */
const ACCOUNT_INDICES = [0n, 1n, 2n, 3n] as const;

/** What the Hoax key is granted: the engine only ever places IOC closes. */
export const HOAX_SELECTORS = [TRADING_KEY_SELECTOR.placeOrderFor] as const satisfies readonly Hex[];

/**
 * What an unlink revokes: everything "Link a bot" can grant, so a key linked
 * there (or by an older Hoax that granted all three) is fully removed.
 */
export const REVOKE_SELECTORS = [
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
  /** The trader's Safe (a call to its execTransaction), or the registry for a plain-key account. */
  to: Address;
  data: Hex;
  value: bigint;
  /** The only address that may send it (the Safe's owner). */
  from: Address;
  /** What the batch does, one line per call, for the confirmation screen. */
  calls: Array<{ to: Address; label: string }>;
  /**
   * "pool": per-pool grants on the perp pools, batched through the Safe.
   * "global": one registry-wide grant, for an account that is the wallet itself.
   */
  scope: "pool" | "global";
  /** A builder approval was asked for but cannot ride a registry-wide link (no Safe to batch through). */
  builderSkipped: boolean;
}

export interface LinkRequest {
  wallet: Address;
  account: Address;
  operator: Address;
  pools: Address[];
  approved: boolean;
  builder?: { address: Address; feeBpsTimes1k: bigint } | null;
}

/** An account the accounts indexer says a wallet owns now. */
export interface OwnedAccount {
  chainId: number;
  address: Address;
  /** The key the address derives from: the wallet itself for older accounts, a session key for newer ones. */
  derivedFrom: Address;
}

/**
 * Every account the wallet currently owns on the given chains, from the
 * accounts indexer. This is how the dreamDEX app finds a trader's account.
 * Resolves to null when the indexer does not answer in time, so a caller can
 * tell "none" from "unknown" and fall back to the derived scan.
 */
export async function ownedAccounts(wallet: Address, chainIds: readonly number[], timeoutMs = 6000): Promise<OwnedAccount[] | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<null>((resolve) => (timer = setTimeout(() => resolve(null), timeoutMs)));
  const read = getAccountsPage({ controlledBy: wallet, chainIds, limit: 100 })
    .then((page) => page.items.map((a) => ({ chainId: a.chainId, address: getAddress(a.address), derivedFrom: getAddress(a.derivation.accountId) })))
    .catch(() => null);
  try {
    return await Promise.race([read, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

export class DreamDexAccounts {
  readonly network: Network;
  private readonly client: PublicClient;
  private registry: Address | null = null;

  constructor(rpcUrl?: string, network: Network = HIDEKI) {
    this.network = network;
    this.client = createPublicClient({ chain: network.chain, transport: http(rpcUrl ?? network.rpcUrl) }) as PublicClient;
  }

  /** The accounts derived from the wallet itself, deployed or not, lowest index first. */
  async tradingAccounts(wallet: Address): Promise<TradingAccount[]> {
    const scan = await accountsAt(this.client, this.network.id, wallet, ACCOUNT_INDICES);
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
    } catch (err) {
      // The call reverted or returned nothing: not a Safe, so the wallet does
      // not control it. Anything else (the RPC failed) is "unknown", which the
      // caller must not treat or cache as "no".
      if (err instanceof ContractFunctionExecutionError) return false;
      throw err;
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
    const selectors = req.approved ? [...HOAX_SELECTORS] : [...REVOKE_SELECTORS];
    for (const pool of req.pools) {
      calls.push({
        to: registry,
        value: 0n,
        data: encodeFunctionData({
          abi: REGISTRY_ABI,
          functionName: "setOperatorApprovalForPool",
          args: [pool, req.operator, selectors, req.approved],
        }),
      });
      labels.push({ to: registry, label: `${req.approved ? "grant place-order only" : "revoke the key"} on ${pool}` });
    }
    // A key also linked through dreamDEX's own Link a bot holds a registry-wide
    // grant, which per-pool revokes do not touch: revoking clears that too.
    if (!req.approved) {
      calls.push({
        to: registry,
        value: 0n,
        data: encodeFunctionData({ abi: REGISTRY_ABI, functionName: "setOperatorApprovalGlobal", args: [req.operator, [...REVOKE_SELECTORS], false] }),
      });
      labels.push({ to: registry, label: "revoke the key registry-wide (a Link a bot grant)" });
    }
    // Granting needs a fee to approve; revoking clears any approval for the builder.
    if (req.builder && (req.approved ? req.builder.feeBpsTimes1k > 0n : true)) {
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
      // A trader who trades from the wallet itself has no Safe to batch through,
      // and one confirmation per pool would be dozens. So the key gets
      // placeOrderFor registry-wide in one call (dreamDEX's own "Link a bot"
      // grants three selectors that way). Still no withdraw or transfer; the
      // engine only ever trades the perp pools. Builder approvals need a call
      // per pool and are skipped: the result says so in `builderSkipped`.
      return {
        to: registry,
        data: encodeFunctionData({ abi: REGISTRY_ABI, functionName: "setOperatorApprovalGlobal", args: [req.operator, selectors, req.approved] }),
        value: 0n,
        from: req.wallet,
        calls: [{ to: registry, label: `${req.approved ? "grant place-order only" : "revoke the key"} on every pool, registry-wide` }],
        scope: "global",
        builderSkipped: Boolean(req.builder),
      };
    }
    // A pre-validated execTransaction carries no nonce; planExecution's field is unused on this path.
    const plan = planExecution({ chainId: this.network.id, account: req.account, calls, nonce: 0n });
    const tx = prevalidatedExecution(plan, req.wallet);
    return { to: getAddress(tx.to), data: tx.data, value: tx.value, from: req.wallet, calls: labels, scope: "pool", builderSkipped: false };
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
