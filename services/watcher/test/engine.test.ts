// The watcher end to end against the simulated venue: onboarding, a save, the
// counterfactual, a flip under a race, a stale mark, an empty book, a gap
// straight to liquidation, and gas drips.
import { DEFAULT_POLICY, fromFloat, toFloat } from "@hoax/core";
import { SimVenue, type MarketInfo } from "@hoax/chain";
import { MemoryStore, type AccountRow } from "@hoax/db";
import { getAddress, parseEther, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import {
  CounterfactualTracker,
  DEFAULT_ENGINE_CONFIG,
  Engine,
  GasManager,
  Linker,
  MemoryKeystore,
  silentLogger,
} from "../src/index.ts";

const E18 = 10n ** 18n;
const usd = (x: number) => fromFloat(x);
const eth = (x: number) => fromFloat(x, 18);

const ETH: MarketInfo = {
  symbol: "ETH-PERP",
  baseSymbol: "ETH",
  pool: getAddress("0xd6cb1dd58580b84d76068ac21594219ce03aeddf"),
  marginBank: getAddress("0x000000000000000000000000000000000000ba11"),
  baseDecimals: 18,
  tickSize: 10n ** 16n,
  lotSize: 10n ** 14n,
  minQuantity: 4n * 10n ** 15n,
  maintenanceMarginBps: 250,
  takerFeeBpsTimes1k: 0,
};

const PROTECTED = getAddress("0x00000000000000000000000000000000000000a1") as Address;
const TWIN = getAddress("0x00000000000000000000000000000000000000b2") as Address;

interface World {
  venue: SimVenue;
  store: MemoryStore;
  keys: MemoryKeystore;
  engine: Engine;
  linker: Linker;
  account: AccountRow;
  clock: { now: number };
}

async function world(opts: { halfSpreadBps?: number } = {}): Promise<World> {
  const venue = new SimVenue({ penaltyBps: 100, minSpreadBps: 50 });
  venue.addMarket({
    info: ETH,
    mark: 2400n * E18,
    markOk: true,
    halfSpreadBps: opts.halfSpreadBps ?? 1,
    levels: 40,
    levelStepBps: 1,
    levelSize: 5n * E18,
  });
  // Two identical accounts: 150 USDso and 1 ETH long from 2400, health 2.5.
  for (const owner of [PROTECTED, TWIN]) {
    venue.openAccount(owner, usd(150));
    venue.setPosition(owner, ETH.pool, eth(1), 2400n * E18);
  }
  const store = new MemoryStore();
  const keys = new MemoryKeystore();
  const clock = { now: 1_800_000_000_000 };
  const now = () => clock.now;
  const engine = new Engine({ venue, store, keys, log: silentLogger, config: DEFAULT_ENGINE_CONFIG, now });
  const linker = new Linker(venue, store, keys, null, silentLogger, now);

  await store.createAccount({ id: "acct-1", owner: PROTECTED });
  (store.accounts.get("acct-1") as AccountRow).createdAt = new Date(clock.now);
  await linker.run(); // makes the key
  const pending = (await store.getAccount("acct-1"))!;
  expect(pending.status).toBe("pending_link");
  venue.link(PROTECTED, getAddress(pending.hoaxKey!)); // the trader links it in dreamDEX
  await linker.run(); // notices the link
  const account = (await store.getAccount("acct-1"))!;
  expect(account.status).toBe("active");
  await store.upsertPolicy(account.id, "ETH-PERP", DEFAULT_POLICY);
  await engine.tick(account);
  return { venue, store, keys, engine, linker, account, clock };
}

async function healthOf(venue: SimVenue, owner: Address): Promise<number> {
  const m = await venue.readMargin(ETH.marginBank, owner);
  return m.mmReq > 0n ? toFloat(m.equity) / toFloat(m.mmReq) : Infinity;
}

describe("watcher against the simulated venue", () => {
  let w: World;
  beforeEach(async () => {
    w = await world();
  });

  it("does nothing while health is above the trigger", async () => {
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).toBe("idle");
    expect(w.store.actions.size).toBe(0);
    expect((await w.store.latestHealth(w.account.id))[0].health).toBeCloseTo(2.5, 6);
  });

  it("cuts just enough to restore the target, then the twin is liquidated and the save is counted", async () => {
    // Mark falls to 2318: health ~1.17, under the 1.25 trigger.
    w.venue.setMark(ETH.pool, 2318n * E18);
    expect(await healthOf(w.venue, PROTECTED)).toBeLessThan(1.23);

    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).toBe("acted");
    if (r.kind !== "acted") return;
    const action = (await w.store.getAction(r.actionId))!;
    expect(action.outcome).toBe("pending");
    expect(action.sizeFilled).toBeGreaterThan(0n);
    expect(action.sizeFilled).toBeLessThan(eth(0.5)); // a cut, not a full close
    expect(action.healthAfter!).toBeGreaterThanOrEqual(1.59);
    expect(action.signature).toMatch(/^0x/);
    expect(action.receipt.hoaxKey.toLowerCase()).toBe(w.account.hoaxKey);

    // Cooldown: the next tick does not act again.
    expect((await w.engine.tick((await w.store.getAccount(w.account.id))!)).kind).not.toBe("acted");

    // The mark falls through the protected account's ORIGINAL liquidation price.
    w.clock.now += 60_000;
    w.venue.setMark(ETH.pool, 2300n * E18);
    const twinLiquidated = (await w.venue.liquidationsSince(ETH.marginBank, TWIN, 0n)).events.length > 0;
    expect(twinLiquidated).toBe(true);
    expect((await w.venue.liquidationsSince(ETH.marginBank, PROTECTED, 0n)).events.length).toBe(0);

    const tracker = new CounterfactualTracker(w.venue, w.store, silentLogger, () => w.clock.now);
    expect(await tracker.run()).toBe(1);
    const saved = (await w.store.getAction(r.actionId))!;
    expect(saved.outcome).toBe("saved");
    const cf = (await w.store.getCounterfactual(r.actionId))!;
    expect(cf.preserved!).toBeGreaterThan(0n);

    // The protected account holds more equity than its liquidated twin.
    const a = await w.venue.readMargin(ETH.marginBank, PROTECTED);
    const b = await w.venue.readMargin(ETH.marginBank, TWIN);
    expect(a.equity).toBeGreaterThan(b.equity);
    expect((await w.store.stats()).saves).toBe(1);
  });

  it("marks a close not-needed after 24 hours without reaching the old liquidation price", async () => {
    w.venue.setMark(ETH.pool, 2318n * E18);
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).toBe("acted");
    w.venue.setMark(ETH.pool, 2400n * E18);
    w.clock.now += 24 * 60 * 60 * 1000;
    const tracker = new CounterfactualTracker(w.venue, w.store, silentLogger, () => w.clock.now);
    await tracker.run();
    if (r.kind === "acted") expect((await w.store.getAction(r.actionId))!.outcome).toBe("not-needed");
    expect((await w.store.stats()).insuranceCost).toBeGreaterThanOrEqual(0n);
  });

  it("flattens a flip when another bot closes most of the position first, then pauses", async () => {
    w.venue.setMark(ETH.pool, 2318n * E18);
    // In the same block as Hoax's order, another bot sells 0.9 ETH of the position.
    w.venue.beforeNextOrder = () => w.venue.externalTrade(PROTECTED, ETH.pool, false, eth(0.9));
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).toBe("acted");
    if (r.kind !== "acted") return;
    const action = (await w.store.getAction(r.actionId))!;
    expect(action.outcome).toBe("conflict");
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(0n); // never left on the wrong side
    expect((await w.store.getAccount(w.account.id))!.paused).toBe(true);
    expect(w.store.alerts.some((a) => a.kind === "paused")).toBe(true);
  });

  it("never acts on a stale mark", async () => {
    w.venue.setMark(ETH.pool, 2318n * E18, false);
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r).toEqual({ kind: "skip", reason: "mark feed stale" });
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
  });

  it("does nothing while paused", async () => {
    await w.store.setPaused(w.account.id, true);
    w.venue.setMark(ETH.pool, 2318n * E18);
    expect((await w.engine.tick((await w.store.getAccount(w.account.id))!)).kind).toBe("idle");
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
  });

  it("writes a missed receipt when the price gaps straight through to liquidation", async () => {
    w.venue.setMark(ETH.pool, 2290n * E18); // from health 2.5 to under 1.0 in one move
    w.clock.now += DEFAULT_ENGINE_CONFIG.liqScanEveryMs; // the next liquidation scan is due
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).not.toBe("error");
    const missed = [...w.store.actions.values()].filter((a) => a.outcome === "missed");
    expect(missed).toHaveLength(1);
    expect(missed[0].reason).toContain("gapped");
    expect((await w.store.stats()).misses).toBe(1);
  });
});

describe("thin books", () => {
  it("skips with a receipt when nothing sits inside max slippage", async () => {
    // The nearest bid sits 50 bps under the mark, outside the 30 bps max slippage.
    const w = await world({ halfSpreadBps: 50 });
    w.venue.setMark(ETH.pool, 2318n * E18);
    const first = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(first.kind).toBe("skip");
    expect([...w.store.actions.values()].some((a) => a.reason === "no liquidity within max slippage")).toBe(true);
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
  });
});

describe("gas", () => {
  it("drips to a low key within the caps and stops at the cap", async () => {
    const w = await world();
    const gasWallet = privateKeyToAccount(generatePrivateKey());
    w.venue.balances.set(gasWallet.address.toLowerCase(), parseEther("1"));
    const gas = new GasManager(
      w.venue,
      w.store,
      gasWallet,
      { minBalance: parseEther("0.01"), dripAmount: parseEther("0.05"), perKeyDailyCap: parseEther("0.1"), dailyCap: parseEther("1"), minGapMs: 0 },
      silentLogger,
    );
    const key = w.account.hoaxKey!;
    expect(await gas.topUp(key, w.account.id)).not.toBeNull();
    expect(await w.venue.nativeBalance(getAddress(key))).toBe(parseEther("0.05"));
    expect(await gas.topUp(key, w.account.id)).toBeNull(); // not low any more
    w.venue.balances.set(key.toLowerCase(), 0n);
    expect(await gas.topUp(key, w.account.id)).not.toBeNull(); // 0.10 of 0.10
    w.venue.balances.set(key.toLowerCase(), 0n);
    expect(await gas.topUp(key, w.account.id)).toBeNull(); // cap reached
    expect(w.store.alerts.some((a) => a.kind === "gas")).toBe(true);
  });
});

describe("orders whose result is not known", () => {
  it("records a sent order at once, confirms it on the next tick and never sends a second", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown"; // fills on chain, but the receipt wait times out
    const first = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(first).toEqual({ kind: "skip", reason: "order sent, result unknown" });
    const rows = [...w.store.actions.values()];
    expect(rows).toHaveLength(1);
    expect(rows[0].outcome).toBe("unconfirmed");
    expect(rows[0].txHash).toMatch(/^0x/);
    const afterFirst = (await w.venue.readPosition(ETH, PROTECTED)).size;
    expect(afterFirst).toBeLessThan(eth(1)); // it did fill

    // Next tick: confirmed from the chain, settled as a normal close; no new order.
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    const settled = (await w.store.getAction(rows[0].id))!;
    expect(settled.outcome).toBe("pending");
    expect(settled.sizeFilled).toBe(eth(1) - afterFirst);
    expect(settled.signature).toMatch(/^0x/);
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(afterFirst);
    expect([...w.store.actions.values()].filter((a) => a.txHash)).toHaveLength(1);
  });

  it("holds the market while a sent order is stuck, cancels its nonce, and only then settles it", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown-dropped"; // sent, waiting in the mempool
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    const [row] = [...w.store.actions.values()];
    expect(row.outcome).toBe("unconfirmed");
    expect(row.txNonce).toBe(0);

    w.clock.now += 60_000; // past the cooldown, still inside the confirm window
    expect(await w.engine.tick((await w.store.getAccount(w.account.id))!)).toEqual({ kind: "skip", reason: "an earlier order is not confirmed yet" });

    // Past the window: its nonce is replaced, and the market stays held until the chain shows that.
    w.clock.now += DEFAULT_ENGINE_CONFIG.confirmTimeoutMs;
    expect(await w.engine.tick((await w.store.getAccount(w.account.id))!)).toEqual({ kind: "skip", reason: "an earlier order is not confirmed yet" });
    expect((await w.store.getAction(row.id))!.outcome).toBe("unconfirmed");
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    // Settled only now that the slot is used: it can never land.
    expect((await w.store.getAction(row.id))!.outcome).toBe("skipped");
    expect((await w.store.getAction(row.id))!.reason).toContain("slot was cancelled");
    w.venue.releaseStuck();
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1) - [...w.store.actions.values()].reduce((s, a) => s + a.sizeFilled, 0n));
  });

  it("records a late confirmation without trading, even when the trader reversed meanwhile", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown"; // fills, receipt lost
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    const [row] = [...w.store.actions.values()];
    const afterHoax = (await w.venue.readPosition(ETH, PROTECTED)).size;
    // Before the engine looks again, the trader pauses Hoax and reverses by hand.
    await w.store.setPaused(w.account.id, true);
    w.venue.externalTrade(PROTECTED, ETH.pool, false, afterHoax + eth(0.3));
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(-eth(0.3)); // the trader's short stands: no flatten
    const settled = (await w.store.getAction(row.id))!;
    expect(settled.outcome).toBe("conflict");
    expect(settled.sizeAfter).toBe(afterHoax); // as the fill left it
    expect(settled.signature).toMatch(/^0x/);
  });

  it("does not resend a reverting order every second", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "revert";
    expect(await w.engine.tick((await w.store.getAccount(w.account.id))!)).toEqual({ kind: "skip", reason: "order reverted" });
    w.clock.now += 1_000;
    w.venue.nextOrderFault = "revert";
    expect(await w.engine.tick((await w.store.getAccount(w.account.id))!)).toEqual({ kind: "skip", reason: "backing off after a failed order" });
    expect(w.venue.nextOrderFault).toBe("revert"); // nothing was sent
    const reverted = [...w.store.actions.values()].filter((a) => a.reason === "the order reverted on chain");
    expect(reverted).toHaveLength(1);
    expect(reverted[0].txHash).toMatch(/^0x/);
    expect(w.store.alerts.filter((a) => a.kind === "skipped")).toHaveLength(1);
  });

  it("keeps the cooldown and the liquidation cursor across a restart", async () => {
    const w = await world();
    w.clock.now = Date.now(); // the store stamps rows on the real clock
    w.venue.setMark(ETH.pool, 2318n * E18);
    expect((await w.engine.tick((await w.store.getAccount(w.account.id))!)).kind).toBe("acted");
    // A fresh engine on the same store, as after a restart: inside the cooldown it does not act.
    w.venue.setMark(ETH.pool, 2290n * E18);
    const restarted = new Engine({ venue: w.venue, store: w.store, keys: w.keys, log: silentLogger, config: DEFAULT_ENGINE_CONFIG, now: () => w.clock.now });
    expect((await restarted.tick((await w.store.getAccount(w.account.id))!)).kind).not.toBe("acted");
    expect((await w.store.getAccount(w.account.id))!.liqScanFrom).not.toBeNull();
  });
});

describe("flips", () => {
  it("undoes only its own overshoot when the trader reverses the position by hand", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    // In the same block, the trader sells 1.5 ETH by hand: from 1 long to 0.5 short on purpose.
    w.venue.beforeNextOrder = () => w.venue.externalTrade(PROTECTED, ETH.pool, false, eth(1.5));
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).toBe("acted");
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(-eth(0.5)); // the trader's short stands
    expect((await w.store.getAccount(w.account.id))!.paused).toBe(true);
  });

  it("says so when the flatten does not fill", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.beforeNextOrder = () => {
      w.venue.externalTrade(PROTECTED, ETH.pool, false, eth(0.9));
      w.venue.nextOrderFault = "reject"; // the flatten that follows is refused
    };
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    if (r.kind !== "acted") throw new Error(`expected a close, got ${JSON.stringify(r)}`);
    const action = (await w.store.getAction(r.actionId))!;
    expect(action.outcome).toBe("conflict");
    expect(action.reason).toContain("could not flatten");
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBeLessThan(0n);
    expect(w.store.alerts.some((a) => a.kind === "paused" && a.message.includes("Close it manually"))).toBe(true);
  });
});

describe("builder fee", () => {
  it("attaches the fee only when the trader's approval covers it", async () => {
    const w = await world();
    const builder = getAddress("0x00000000000000000000000000000000000000f1");
    const engine = new Engine({
      venue: w.venue,
      store: w.store,
      keys: w.keys,
      log: silentLogger,
      config: { ...DEFAULT_ENGINE_CONFIG, builder, builderFeeBpsTimes1k: 5_000n },
      now: () => w.clock.now,
    });
    w.venue.approvals.set(`${PROTECTED.toLowerCase()}:${builder.toLowerCase()}`, 5_000n);
    w.venue.setMark(ETH.pool, 2318n * E18);
    const r = await engine.tick((await w.store.getAccount(w.account.id))!);
    if (r.kind !== "acted") throw new Error("expected a close");
    const a = (await w.store.getAction(r.actionId))!;
    expect(a.builderFee1k).toBe(5_000n);
    expect(a.receipt.builderFeeBpsTimes1k).toBe(5_000);
    expect(a.receipt.chainId).toBe(50383); // the simulator has no network of its own: the account's
    expect(a.receipt.version).toBe(2);
  });
});

describe("counterfactuals", () => {
  it("never credits a save for a position liquidated in blocks the engine has not scanned", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    if (r.kind !== "acted") throw new Error("expected a close");
    // The mark goes through both liquidation prices before the engine looks again.
    w.venue.setMark(ETH.pool, 2000n * E18);
    expect((await w.venue.liquidationsSince(ETH.marginBank, PROTECTED, 0n)).events.length).toBeGreaterThan(0);
    const tracker = new CounterfactualTracker(w.venue, w.store, silentLogger, () => w.clock.now, w.keys);
    await tracker.run();
    expect((await w.store.getAction(r.actionId))!.outcome).toBe("missed");
  });

  it("signs the resolution with the receipt's key and leaves the receipt as signed", async () => {
    const { receiptSigner, resolutionSigner } = await import("@hoax/chain");
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    if (r.kind !== "acted") throw new Error("expected a close");
    w.venue.setMark(ETH.pool, 2400n * E18);
    w.clock.now += 24 * 60 * 60 * 1000;
    await new CounterfactualTracker(w.venue, w.store, silentLogger, () => w.clock.now, w.keys).run();
    const action = (await w.store.getAction(r.actionId))!;
    const cf = (await w.store.getCounterfactual(r.actionId))!;
    expect(action.outcome).toBe("not-needed");
    expect(action.receipt.outcome).toBe("pending");
    expect((await receiptSigner(action.receipt, action.signature as `0x${string}`)).toLowerCase()).toBe(w.account.hoaxKey);
    expect(cf.resolution?.receiptHash).toBe(action.receiptHash);
    expect(cf.resolution?.outcome).toBe("not-needed");
    expect((await resolutionSigner(cf.resolution!, cf.resolutionSignature as `0x${string}`)).toLowerCase()).toBe(w.account.hoaxKey);
  });
});

describe("gas reservations", () => {
  it("counts a drip whose receipt was lost, and never drips twice to one key at once", async () => {
    const w = await world();
    const gasWallet = privateKeyToAccount(generatePrivateKey());
    w.venue.balances.set(gasWallet.address.toLowerCase(), parseEther("1"));
    const cfg = { minBalance: parseEther("0.01"), dripAmount: parseEther("0.05"), perKeyDailyCap: parseEther("0.05"), dailyCap: parseEther("1"), minGapMs: 60_000 };
    const gas = new GasManager(w.venue, w.store, gasWallet, cfg, silentLogger);
    const key = w.account.hoaxKey!;
    // Two at once (activation and the gas loop): one drip.
    const both = await Promise.all([gas.topUp(key, w.account.id), gas.topUp(key, w.account.id)]);
    expect(both.filter(Boolean)).toHaveLength(1);
    expect(await w.venue.nativeBalance(getAddress(key))).toBe(parseEther("0.05"));

    // A lost receipt still counts against the cap.
    const other = new GasManager(w.venue, w.store, gasWallet, { ...cfg, minGapMs: 0, perKeyDailyCap: parseEther("1") }, silentLogger);
    w.venue.balances.set(key.toLowerCase(), 0n);
    w.venue.nextSendUnknown = true;
    expect(await other.topUp(key, w.account.id)).toMatch(/^0x/);
    expect(await w.store.dripsSince(new Date(0), { hoaxKey: key })).toBe(parseEther("0.1"));
  });
});

describe("round two", () => {
  it("still closes when the liquidation scan is failing", async () => {
    const w = await world();
    w.venue.liquidationsSince = async () => {
      throw new Error("getLogs refused");
    };
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.clock.now += DEFAULT_ENGINE_CONFIG.liqScanEveryMs;
    expect((await w.engine.tick((await w.store.getAccount(w.account.id))!)).kind).toBe("acted");
  });

  it("never credits a save after a liquidation inside an earlier miss's episode", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    if (r.kind !== "acted") throw new Error("expected a close");
    // A miss was recorded just before (its episode suppresses new miss receipts for 10 minutes).
    w.store.insertAction({ ...(await w.store.getAction(r.actionId))!, id: "00000000-0000-4000-8000-0000000000aa", outcome: "missed" });
    w.venue.setMark(ETH.pool, 2000n * E18); // liquidated
    w.clock.now += DEFAULT_ENGINE_CONFIG.liqScanEveryMs;
    await w.engine.tick((await w.store.getAccount(w.account.id))!); // scans: the steps reach the ledger
    expect(w.store.liquidations.size).toBeGreaterThan(0);
    await new CounterfactualTracker(w.venue, w.store, silentLogger, () => w.clock.now, w.keys).run();
    expect((await w.store.getAction(r.actionId))!.outcome).toBe("missed");
  });

  it("puts the flatten on its own record", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.beforeNextOrder = () => w.venue.externalTrade(PROTECTED, ETH.pool, false, eth(0.9));
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    if (r.kind !== "acted") throw new Error("expected a close");
    const flattens = [...w.store.actions.values()].filter((a) => a.reason?.startsWith("flatten:"));
    expect(flattens).toHaveLength(1);
    expect(flattens[0].txHash).toMatch(/^0x/);
    expect(flattens[0].sizeFilled).toBeGreaterThan(0n);
    expect(flattens[0].outcome).toBe("conflict");
    expect(flattens[0].signature).toMatch(/^0x/);
  });

  it("confirms an order left unconfirmed on an account that was unlinked since", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown";
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    await w.store.setStatus(w.account.id, "unlinked");
    await w.engine.confirmOutstanding((await w.store.getAccount(w.account.id))!);
    expect([...w.store.actions.values()].some((a) => a.outcome === "unconfirmed")).toBe(false);
  });

  it("refuses a stored policy that would not pass validation", async () => {
    const w = await world();
    await w.store.upsertPolicy(w.account.id, "ETH-PERP", { ...DEFAULT_POLICY, maxSlippageBps: 5000 });
    w.venue.setMark(ETH.pool, 2318n * E18);
    expect(await w.engine.tick((await w.store.getAccount(w.account.id))!)).toEqual({ kind: "skip", reason: "invalid policy" });
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
  });
});

describe("round three", () => {
  it("stays paused, with the close on record as a flip, when the flatten's reads fail", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.beforeNextOrder = () => w.venue.externalTrade(PROTECTED, ETH.pool, false, eth(0.9));
    const place = w.venue.placeIocFor.bind(w.venue);
    const readMargin = w.venue.readMargin.bind(w.venue);
    let calls = 0;
    w.venue.placeIocFor = async (...args) => {
      const r = await place(...args);
      if (++calls === 2) w.venue.readMargin = async () => Promise.reject(new Error("rpc timeout")); // after the flatten fills
      return r;
    };
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect((await w.store.getAccount(w.account.id))!.paused).toBe(true);
    const close = [...w.store.actions.values()].find((a) => a.txHash && !a.reason?.startsWith("flatten:"))!;
    expect(close.outcome).toBe("conflict"); // never a normal close
    const flatten = [...w.store.actions.values()].find((a) => a.reason?.startsWith("flatten:"))!;
    expect(flatten.outcome).toBe("unconfirmed"); // its reads failed: confirmed on the next tick
    // Reads recover; every record settles as a conflict, none as a normal close.
    w.venue.readMargin = readMargin;
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    const rows = [...w.store.actions.values()].filter((a) => a.txHash);
    expect(rows.every((a) => a.outcome === "conflict")).toBe(true);
    expect((await w.store.getAccount(w.account.id))!.paused).toBe(true);
    expect(w.store.counterfactuals.size).toBe(0);
  });

  it("holds the market for a new registration while a retired one's order is stuck", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown-dropped";
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    // The trader registers again and links a new key: the old registration retires.
    await w.store.setStatus(w.account.id, "retired");
    const b = await w.store.createAccount({ id: "acct-2", owner: PROTECTED });
    await w.linker.run();
    w.venue.link(PROTECTED, getAddress((await w.store.getAccount(b.id))!.hoaxKey!));
    await w.linker.run();
    await w.store.upsertPolicy(b.id, "ETH-PERP", DEFAULT_POLICY);
    w.clock.now += 60_000;
    expect(await w.engine.tick((await w.store.getAccount(b.id))!)).toEqual({ kind: "skip", reason: "an earlier order is not confirmed yet" });
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
  });

  it("sends nothing when the order cannot be put on record first", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    const insert = w.store.insertAction.bind(w.store);
    w.store.insertAction = async (a) => (a.outcome === "unconfirmed" ? Promise.reject(new Error("db down")) : insert(a));
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r).toEqual({ kind: "skip", reason: "order rejected" });
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
  });
});

describe("round four", () => {
  it("never writes off a retired registration's stuck order it cannot cancel: the market stays held and the active account pauses", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown-dropped"; // registration A's close sits in the mempool
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    const [stuck] = [...w.store.actions.values()];
    // The trader registers again (B); A retires. A's key cannot pay for a cancel.
    await w.store.setStatus(w.account.id, "retired");
    const b = await w.store.createAccount({ id: "acct-2", owner: PROTECTED });
    await w.linker.run();
    w.venue.link(PROTECTED, getAddress((await w.store.getAccount(b.id))!.hoaxKey!));
    await w.linker.run();
    await w.store.upsertPolicy(b.id, "ETH-PERP", DEFAULT_POLICY);
    w.venue.cancelNonce = async () => {
      throw new Error("insufficient funds for gas");
    };
    for (let i = 0; i < 8; i++) {
      w.clock.now += DEFAULT_ENGINE_CONFIG.confirmTimeoutMs;
      const r = await w.engine.tick((await w.store.getAccount(b.id))!);
      expect(r.kind).not.toBe("acted"); // no second close, however long it takes
    }
    expect((await w.store.getAction(stuck.id))!.outcome).toBe("unconfirmed");
    expect((await w.store.getAccount(b.id))!.paused).toBe(true);
    expect(w.store.alerts.filter((a) => a.accountId === b.id && a.kind === "paused")).toHaveLength(1);
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1));
    // When it finally lands, it is recorded as the fill it was.
    w.venue.releaseStuck();
    await w.engine.tick((await w.store.getAccount(b.id))!);
    const settled = (await w.store.getAction(stuck.id))!;
    expect(settled.sizeFilled).toBeGreaterThan(0n);
    expect(settled.signature).toMatch(/^0x/);
  });
});

describe("round five", () => {
  it("does not trade in the same tick that a late confirmation paused the account", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown";
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    const afterHoax = (await w.venue.readPosition(ETH, PROTECTED)).size;
    w.venue.externalTrade(PROTECTED, ETH.pool, false, afterHoax + eth(1)); // the trader reverses to 1 short
    w.clock.now += 60 * 60_000; // long past the cooldown; health is under the trigger
    expect(await w.engine.tick((await w.store.getAccount(w.account.id))!)).toEqual({ kind: "idle", reason: "paused" });
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(-eth(1));
    expect((await w.store.getAccount(w.account.id))!.paused).toBe(true);
  });

  it("pauses and tells a newer registration about an older one's stuck order, once", async () => {
    const w = await world();
    w.venue.setMark(ETH.pool, 2318n * E18);
    w.venue.nextOrderFault = "unknown-dropped";
    await w.engine.tick((await w.store.getAccount(w.account.id))!);
    w.venue.cancelNonce = async () => {
      throw new Error("insufficient funds for gas");
    };
    for (let i = 0; i < 6; i++) {
      w.clock.now += DEFAULT_ENGINE_CONFIG.confirmTimeoutMs;
      await w.engine.tick((await w.store.getAccount(w.account.id))!);
    }
    expect((await w.store.getAccount(w.account.id))!.paused).toBe(true); // A was told
    // The trader re-registers as B after that alert.
    const b = await w.store.createAccount({ id: "acct-2", owner: PROTECTED });
    (w.store.accounts.get("acct-2") as AccountRow).createdAt = new Date(w.clock.now);
    await w.linker.run();
    w.venue.link(PROTECTED, getAddress((await w.store.getAccount(b.id))!.hoaxKey!));
    await w.linker.run();
    await w.store.upsertPolicy(b.id, "ETH-PERP", DEFAULT_POLICY);
    for (let i = 0; i < 6; i++) {
      w.clock.now += DEFAULT_ENGINE_CONFIG.confirmTimeoutMs;
      expect((await w.engine.tick((await w.store.getAccount(b.id))!)).kind).not.toBe("acted");
    }
    expect((await w.store.getAccount(b.id))!.paused).toBe(true);
    expect(w.store.alerts.filter((a) => a.accountId === b.id && a.kind === "paused")).toHaveLength(1);
    // A restarted engine does not pause B again once the trader resumes.
    await w.store.setPaused(b.id, false);
    const restarted = new Engine({ venue: w.venue, store: w.store, keys: w.keys, log: silentLogger, config: DEFAULT_ENGINE_CONFIG, now: () => w.clock.now });
    await restarted.tick((await w.store.getAccount(b.id))!);
    expect((await w.store.getAccount(b.id))!.paused).toBe(false);
    expect((await w.venue.readPosition(ETH, PROTECTED)).size).toBe(eth(1)); // still held: no second close
  });
});
