// Spike 10: the engine closes a real dreamDEX position, on a local fork of
// Hideki. It takes a real trader's Safe that holds open perp positions,
// impersonates the Safe's owner to send Hoax's link transaction, then runs one
// tick of the real engine (decide, cost gate, IOC placeOrderFor from the Hoax
// key, fill decoding, reconcile, signed receipt) against the forked pools and
// order book. Nothing touches the real chain.
//
// A policy only acts below its trigger, and a healthy account is above any
// sensible one, so the spike sets the trigger just above the account's current
// health: the engine then has to close the slice that lifts it to the target.
//
//   anvil --fork-url https://api.hideki2.infra.testnet.somnia.network --chain-id 50383 --port 8545
//   FORK_RPC=http://127.0.0.1:8545 npm run spike -- 10-engine-fork
//   (WALLET=0x… picks the trader; default is one seen linking a bot on Hideki)

import { randomUUID } from "node:crypto";
import { DreamDexAccounts, DreamDexVenue, HIDEKI } from "@hoax/chain";
import { DEFAULT_POLICY, notional, toFloat } from "@hoax/core";
import { MemoryStore } from "@hoax/db";
import { DEFAULT_ENGINE_CONFIG, Engine, MemoryKeystore, consoleLogger } from "@hoax/watcher";
import { createPublicClient, getAddress, http, parseEther, type Address, type Hex } from "viem";
import { Evidence } from "./lib.ts";

const rpc = process.env.FORK_RPC ?? "http://127.0.0.1:8545";
const ev = new Evidence("10-engine-fork");
const fork = createPublicClient({ chain: HIDEKI.chain, transport: http(rpc) });
const anvil = (method: string, params: unknown[]) => fork.request({ method: method as never, params: params as never });

// Blocks one second apart from the fork point, so the forked price feeds stay fresh.
await anvil("anvil_setBlockTimestampInterval", [1]);
const forkBlock = await fork.getBlockNumber();
ev.log("fork", { rpc, forkBlock });

const venue = new DreamDexVenue({ rpcUrl: rpc, wsUrl: rpc.replace(/^http/, "ws") });
const accounts = new DreamDexAccounts(rpc);
const wallet = getAddress(process.env.WALLET ?? "0x64C4b28753b3a35F22425feD179573684da250BB");
const safe = (await accounts.tradingAccounts(wallet)).find((s) => s.deployed)?.address;
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
const margin = await warm("margin", () => venue.readMargin(markets[0].marginBank, safe));
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
if (!target || !Number.isFinite(health) || health > 9) {
  await ev.finish({ pass: null, summary: `no usable position (health ${health.toFixed(2)})` });
  process.exit(0);
}

// The Hoax side: a fresh key, an active registration, a policy on the largest position.
const keys = new MemoryKeystore();
const key = await keys.create();
const store = new MemoryStore();
const id = randomUUID();
await store.createAccount({ id, owner: safe, manageTokenHash: "spike" });
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
ev.log("link", { tx: linkHash, status: linkRc.status, linked });

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
