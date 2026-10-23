// Spike 10: the engine closes a real dreamDEX position, on a local fork of
// Hideki or Shannon. It takes a real trader's Safe that holds open perp positions,
// impersonates the Safe's owner to send Hoax's link transaction, then runs one
// tick of the real engine (decide, cost gate, IOC placeOrderFor from the Hoax
// key, fill decoding, reconcile, signed receipt) against the forked pools and
// order book. Nothing touches the real chain.
//
// A policy only acts below its trigger, and a healthy account is above any
// sensible one, so the spike sets the trigger just above the account's current
// health: the engine then has to close the slice that lifts it to the target.
// Testnet traders often run far from liquidation (Shannon's riskiest Safe sits
// above health 30), past any policy's reach, so on the fork the Safe first
// withdraws collateral down to health ~3: the same position, run hotter.
//
//   anvil --fork-url https://api.hideki2.infra.testnet.somnia.network --chain-id 50383 --port 8545
//   FORK_RPC=http://127.0.0.1:8545 npm run spike -- 10-engine-fork
//   (WALLET=0x… picks the trader; default is one seen linking a bot on Hideki)
//
//   anvil --fork-url https://dream-rpc.somnia.network --chain-id 50312 --port 8545
//   NETWORK=shannon SAFE=0x70Cf98d26427d19285Ea4344461D867C961e5313 FORK_RPC=http://127.0.0.1:8545 npm run spike -- 10-engine-fork
//   (SAFE=0x… names the account itself; its first owner sends the link.
//    ACCOUNT=0x… names a trader who trades from the wallet itself: one
//    registry-wide grant links it.)

import { randomUUID } from "node:crypto";
import { DreamDexAccounts, DreamDexVenue, NETWORKS } from "@hoax/chain";
import { DEFAULT_POLICY, notional, toFloat } from "@hoax/core";
import { MemoryStore } from "@hoax/db";
import { DEFAULT_ENGINE_CONFIG, Engine, MemoryKeystore, consoleLogger } from "@hoax/watcher";
import { createPublicClient, encodeFunctionData, getAddress, http, parseAbi, parseEther, type Address, type Hex } from "viem";
import { Evidence } from "./lib.ts";

const rpc = process.env.FORK_RPC ?? "http://127.0.0.1:8545";
const network = NETWORKS.find((n) => n.key === (process.env.NETWORK ?? "hideki"));
if (!network) throw new Error("NETWORK must be hideki or shannon");
const ev = new Evidence(network.key === "hideki" ? "10-engine-fork" : `10-engine-fork-${network.key}`);
const fork = createPublicClient({ chain: network.chain, transport: http(rpc) });
const anvil = (method: string, params: unknown[]) => fork.request({ method: method as never, params: params as never });

// Blocks one second apart from the fork point, so the forked price feeds stay fresh.
await anvil("anvil_setBlockTimestampInterval", [1]);
const forkBlock = await fork.getBlockNumber();
ev.log("fork", { network: network.name, chainId: network.id, rpc, forkBlock });

const venue = new DreamDexVenue({ network, rpcUrl: rpc, wsUrl: rpc.replace(/^http/, "ws"), rpcTimeoutMs: 180_000 });
const accounts = new DreamDexAccounts(rpc, network);
const SAFE_ABI = parseAbi(["function getOwners() view returns (address[])", "function getThreshold() view returns (uint256)"]);
let wallet: Address;
let safe: Address | undefined;
if (process.env.ACCOUNT) {
  wallet = safe = getAddress(process.env.ACCOUNT);
} else if (process.env.SAFE) {
  safe = getAddress(process.env.SAFE);
  const [owners, threshold] = await Promise.all([
    fork.readContract({ address: safe, abi: SAFE_ABI, functionName: "getOwners" }),
    fork.readContract({ address: safe, abi: SAFE_ABI, functionName: "getThreshold" }),
  ]);
  if (threshold !== 1n) throw new Error(`${safe} needs ${threshold} signatures; Hoax links 1-of-n Safes`);
  wallet = getAddress(owners[0]);
} else {
  wallet = getAddress(process.env.WALLET ?? "0x64C4b28753b3a35F22425feD179573684da250BB");
  safe = (await accounts.tradingAccounts(wallet)).find((s) => s.deployed)?.address;
}
if (!safe) {
  await ev.finish({ pass: null, summary: `${wallet} has no dreamDEX account` });
  process.exit(0);
}
const markets = await venue.listMarkets();
// The first reads make the fork pull every slot they touch from Hideki; retry until it has them.
async function warm<T>(label: string, f: () => Promise<T>): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await f();
    } catch (err) {
      if (i >= 20) throw err;
      console.log(`warming the fork (${label}, try ${i + 1})`);
    }
  }
}
let margin = await warm("margin", () => venue.readMargin(markets[0].marginBank, safe));
// Run the position hotter on the fork when it is out of any policy's reach.
if (margin.mmReq > 0n && Number(margin.equity) / Number(margin.mmReq) > 9) {
  const before = Number(margin.equity) / Number(margin.mmReq);
  // Keep what the margin bank requires to stay withdrawable: the initial requirement, with headroom.
  const keep = [(margin.mmReq * 32n) / 10n, (margin.cmReq * 105n) / 100n].reduce((x, y) => (y > x ? y : x));
  const amount = margin.equity - keep;
  const withdraw = encodeFunctionData({ abi: parseAbi(["function withdraw(uint256 amount)"]), functionName: "withdraw", args: [amount] });
  await anvil("anvil_impersonateAccount", [safe]);
  await anvil("anvil_setBalance", [safe, `0x${parseEther("1").toString(16)}`]);
  const h = (await anvil("eth_sendTransaction", [{ from: safe, to: markets[0].marginBank, data: withdraw, gas: "0x1C9C380" }])) as Hex;
  const rc = await fork.waitForTransactionReceipt({ hash: h });
  if (safe !== wallet) await anvil("anvil_stopImpersonatingAccount", [safe]);
  margin = await venue.readMargin(markets[0].marginBank, safe);
  ev.log("run hotter", { healthBefore: before, mmReq: margin.mmReq, cmReq: margin.cmReq, withdrawn: amount, status: rc.status, healthAfter: Number(margin.equity) / Number(margin.mmReq) });
}
const health = Number(margin.equity) / Number(margin.mmReq);
const positions = (
  await Promise.all(
    margin.activePools.map(async (pool) => {
      const m = markets.find((x) => x.pool.toLowerCase() === pool.toLowerCase())!;
      const [p, f] = await warm(m.symbol, () => Promise.all([venue.readPosition(m, safe), venue.readFeed(m)]));
      return { market: m, size: p.size, mark: f.markPrice, notional: notional(p.size < 0n ? -p.size : p.size, f.markPrice, m.baseDecimals) };
    }),
  )
).filter((p) => p.size !== 0n);
positions.sort((a, b) => (b.notional > a.notional ? 1 : -1));
const target = positions[0];
ev.log("account", {
  wallet,
  safe,
  equity: margin.equity,
  mmReq: margin.mmReq,
  health,
  positions: positions.map((p) => ({ market: p.market.symbol, size: p.size, mark: p.mark })),
});
// A plain-key account the fork cannot run hotter (its margin is not
// withdrawable) still proves the registry-wide link: the Hoax key sends one
// real reduce-only IOC close for it through the engine's order path.
if (target && process.env.ACCOUNT && health > 9) {
  const keys = new MemoryKeystore();
  const signer = await keys.create();
  await anvil("anvil_impersonateAccount", [wallet]);
  await anvil("anvil_setBalance", [wallet, `0x${parseEther("10").toString(16)}`]);
  await anvil("anvil_setBalance", [signer.address, `0x${parseEther("1").toString(16)}`]);
  const link = await accounts.buildLinkTx({ wallet, account: safe, operator: signer.address, pools: markets.map((m) => m.pool), approved: true });
  const linkHash = (await anvil("eth_sendTransaction", [{ from: wallet, to: link.to, data: link.data, gas: "0x1C9C380" }])) as Hex;
  const linkRc = await fork.waitForTransactionReceipt({ hash: linkHash });
  const linked = await venue.isLinked(target.market, safe, signer.address);
  ev.log("link", { scope: link.scope, tx: linkHash, status: linkRc.status, linked });
  // The close needs someone on the other side: use the first position whose book has them.
  let pick = target;
  let top: { price: bigint; quantity: bigint } | undefined;
  for (const p of positions) {
    const book = await warm("book", () => venue.readBook(p.market, 20));
    top = p.size > 0n ? book.bids[0] : book.asks[0];
    if (top) {
      pick = p;
      break;
    }
  }
  const long = pick.size > 0n;
  const quantity = pick.market.minQuantity;
  const price = top ? (long ? (top.price * 97n) / 100n : (top.price * 103n) / 100n) : 0n;
  const placed = top
    ? await venue.placeIocFor(signer, safe, pick.market, { isBid: !long, price: price - (price % pick.market.tickSize), quantity, builder: null, builderFeeBpsTimes1k: 0n })
    : null;
  const after = await venue.readPosition(pick.market, safe);
  const reduced = long ? after.size < pick.size : after.size > pick.size;
  ev.log("close", { market: pick.market.symbol, tx: placed?.hash ?? null, noFill: placed?.noFill ?? null, sizeBefore: pick.size, sizeAfter: after.size });
  const pass = linked && reduced;
  await ev.finish({
    pass,
    summary: pass
      ? `one registry-wide grant linked a plain-key trader; the Hoax key closed ${toFloat(pick.size - after.size, pick.market.baseDecimals)} ${pick.market.baseSymbol} of their real ${pick.market.symbol} position (health ${health.toFixed(2)}, too far from liquidation for a policy)`
      : `linked=${linked} reduced=${reduced}`,
  });
  process.exit(pass ? 0 : 1);
}
if (!target || !Number.isFinite(health) || health > 9) {
  await ev.finish({ pass: null, summary: `no usable position (health ${health.toFixed(2)})` });
  process.exit(0);
}

// The Hoax side: a fresh key, an active registration, a policy on the largest position.
const keys = new MemoryKeystore();
const key = await keys.create();
const store = new MemoryStore();
const id = randomUUID();
await store.createAccount({ id, owner: safe, manageTokenHash: "spike", chainId: network.id });
await store.setHoaxKey(id, key.address);
await store.setStatus(id, "active");
const trigger = Math.min(9.5, Math.ceil((health + 0.1) * 100) / 100);
const policy = { ...DEFAULT_POLICY, triggerHealth: trigger, targetHealth: Math.min(10, trigger + 0.4), triggerMargin: 0.02, maxSlippageBps: 100 };
await store.upsertPolicy(id, target.market.symbol, policy);
ev.log("policy", { market: target.market.symbol, trigger: policy.triggerHealth, target: policy.targetHealth, hoaxKey: key.address });

// The trader's side: the owner sends Hoax's link transaction to their Safe.
await anvil("anvil_impersonateAccount", [wallet]);
await anvil("anvil_setBalance", [wallet, `0x${parseEther("10").toString(16)}`]);
await anvil("anvil_setBalance", [key.address, `0x${parseEther("1").toString(16)}`]);
const link = await accounts.buildLinkTx({ wallet, account: safe, operator: key.address, pools: markets.map((m) => m.pool), approved: true });
const linkHash = (await anvil("eth_sendTransaction", [{ from: wallet, to: link.to, data: link.data, gas: "0x3938700" }])) as Hex;
const linkRc = await fork.waitForTransactionReceipt({ hash: linkHash });
const linked = await venue.isLinked(target.market, safe, key.address);
ev.log("link", { scope: link.scope, tx: linkHash, status: linkRc.status, linked });

// One tick of the real engine.
const engine = new Engine({ venue, store, keys, log: consoleLogger, config: { ...DEFAULT_ENGINE_CONFIG, bookDepth: 40 } });
const account = (await store.getAccount(id))!;
await warm("book", () => venue.readBook(target.market, 40));
// The engine fails closed on a read error (no order); a slow fork read is that, so tick again.
let result = await engine.tick(account);
for (let i = 0; result.kind === "error" && i < 8; i++) {
  console.log(`tick failed closed (${result.message.slice(0, 80)}); ticking again`);
  result = await engine.tick(account);
}
const actions = await store.listActions({ owner: safe, limit: 5 });
const action = actions[0] ?? null;
const after = await venue.readPosition(target.market, safe);
const marginAfter = await venue.readMargin(markets[0].marginBank, safe);
ev.log("tick", {
  result,
  action: action && {
    outcome: action.outcome,
    reason: action.reason,
    tx: action.txHash,
    sizeBefore: action.sizeBefore,
    sizeRequested: action.sizeRequested,
    sizeFilled: action.sizeFilled,
    sizeAfter: action.sizeAfter,
    avgPrice: action.avgPrice,
    mark: action.mark,
    cost: action.cost,
    estLiqCost: action.estLiqCost,
    healthBefore: action.healthBefore,
    healthAfter: action.healthAfter,
    signature: action.signature,
  },
  positionAfter: after.size,
  healthAfter: Number(marginAfter.equity) / Number(marginAfter.mmReq),
});

const reduced = (target.size > 0n ? after.size < target.size : after.size > target.size) && after.size !== 0n && Math.sign(Number(after.size)) === Math.sign(Number(target.size));
const pass = result.kind === "acted" && Boolean(action?.txHash) && reduced && Boolean(action?.signature);
await ev.finish({
  pass,
  summary: pass
    ? `the engine closed ${toFloat(target.size - after.size, target.market.baseDecimals).toFixed(6)} ${target.market.baseSymbol} of a real ${target.market.symbol} position through placeOrderFor; health ${health.toFixed(3)} → ${(Number(marginAfter.equity) / Number(marginAfter.mmReq)).toFixed(3)}; signed receipt written`
    : `engine result ${JSON.stringify(result)}`,
});

process.exit(pass ? 0 : 1);
