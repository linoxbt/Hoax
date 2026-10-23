// Spike 9: the in-app link, end to end, on a local fork of Hideki. A fresh
// wallet gets a dreamDEX Safe, sends Hoax's one link transaction, and every
// perp pool then reports the Hoax key as authorized for all three selectors;
// the revoke transaction takes it all back. Runs against real contract code
// with no testnet funds.
//
//   anvil --fork-url https://api.hideki2.infra.testnet.somnia.network --chain-id 50383 --port 8545
//   FORK_RPC=http://127.0.0.1:8545 npm run spike -- 09-link-fork

import { createAccountCall } from "@somnia-chain/accounts-sdk";
import { DreamDexAccounts, HIDEKI, HOAX_SELECTORS } from "@hoax/chain";
import { createPublicClient, createWalletClient, http, parseAbi, parseEther, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { Evidence, venue } from "./lib.ts";

const rpc = process.env.FORK_RPC ?? "http://127.0.0.1:8545";
const ev = new Evidence("09-link-fork");
const fork = createPublicClient({ chain: HIDEKI.chain, transport: http(rpc) });
const head = await fork.getBlockNumber();
ev.log("fork", { rpc, forkedAtBlock: head });

const owner = privateKeyToAccount(generatePrivateKey());
const wallet = createWalletClient({ account: owner, chain: HIDEKI.chain, transport: http(rpc) });
await fork.request({ method: "anvil_setBalance" as never, params: [owner.address, `0x${parseEther("10").toString(16)}`] as never });

// 1. The wallet's dreamDEX account: the factory's Safe at index 0.
const create = createAccountCall(HIDEKI.chain.id, owner.address, 0n);
const createHash = await wallet.sendTransaction({ to: create.to, data: create.data, value: 0n, gas: create.gas });
const created = await fork.waitForTransactionReceipt({ hash: createHash });
const accounts = new DreamDexAccounts(rpc);
const slots = await accounts.tradingAccounts(owner.address);
const safe = slots.find((s) => s.deployed)?.address as Address | undefined;
ev.log("account", { owner: owner.address, createStatus: created.status, safe: safe ?? null, controls: safe ? await accounts.controls(owner.address, safe) : false });
if (!safe) {
  await ev.finish({ pass: false, summary: "the factory did not deploy a Safe on the fork" });
  process.exit(1);
}

// 2. Link: one transaction from the wallet to its Safe.
const pools = (await venue.listMarkets()).map((m) => m.pool);
const operator = privateKeyToAccount(generatePrivateKey()).address;
const link = await accounts.buildLinkTx({ wallet: owner.address, account: safe, operator, pools, approved: true });
const linkHash = await wallet.sendTransaction({ to: link.to, data: link.data, value: link.value, gas: 60_000_000n });
const linked = await fork.waitForTransactionReceipt({ hash: linkHash });
const after = await accounts.linkStatus(safe, operator, pools);
const pool = createPublicClient({ chain: HIDEKI.chain, transport: http(rpc) });
const perSelector = await Promise.all(
  HOAX_SELECTORS.map((sel) =>
    pool.readContract({
      address: pools[0],
      abi: parseAbi(["function isOperatorAuthorized(address owner, address operator, bytes4 selector) view returns (bool)"]),
      functionName: "isOperatorAuthorized",
      args: [safe, operator, sel],
    }),
  ),
);
const linkedCount = Object.values(after).filter(Boolean).length;
ev.log("link", { tx: linkHash, status: linked.status, gasUsed: linked.gasUsed, poolsLinked: linkedCount, of: pools.length, selectorsOnFirstPool: perSelector });

// 3. Revoke: the same transaction with approved=false.
const revoke = await accounts.buildLinkTx({ wallet: owner.address, account: safe, operator, pools, approved: false });
const revokeHash = await wallet.sendTransaction({ to: revoke.to, data: revoke.data, value: revoke.value, gas: 60_000_000n });
const revoked = await fork.waitForTransactionReceipt({ hash: revokeHash });
const afterRevoke = Object.values(await accounts.linkStatus(safe, operator, pools)).filter(Boolean).length;
ev.log("revoke", { tx: revokeHash, status: revoked.status, gasUsed: revoked.gasUsed, poolsStillLinked: afterRevoke });

const pass = linked.status === "success" && linkedCount === pools.length && perSelector.every(Boolean) && revoked.status === "success" && afterRevoke === 0;
await ev.finish({
  pass,
  summary: pass
    ? `one transaction linked the key on all ${pools.length} perp pools (all three selectors), and one revoked it`
    : `linked ${linkedCount}/${pools.length}, still linked after revoke ${afterRevoke}`,
});
