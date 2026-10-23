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

  await store.createAccount({ id: "acct-1", owner: PROTECTED, manageTokenHash: "h" });
  (store.accounts.get("acct-1") as AccountRow).createdAt = new Date(clock.now);
  await linker.run(); // makes the key
  const pending = (await store.getAccount("acct-1"))!;
  expect(pending.status).toBe("pending_link");
  venue.link(PROTECTED, getAddress(pending.hoaxKey!)); // the trader links it in dreamDEX
  await linker.run(); // notices the link
  const account = (await store.getAccount("acct-1"))!;
  expect(account.status).toBe("active");
  await store.upsertPolicy(account.id, "ETH-PERP", DEFAULT_POLICY);
  await engine.tick(account); // first tick sets the liquidation scan origin
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
    const twinLiquidated = (await w.venue.liquidationsSince(ETH.marginBank, TWIN, 0n)).length > 0;
    expect(twinLiquidated).toBe(true);
    expect((await w.venue.liquidationsSince(ETH.marginBank, PROTECTED, 0n)).length).toBe(0);

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
    const r = await w.engine.tick((await w.store.getAccount(w.account.id))!);
    expect(r.kind).not.toBe("error");
    const missed = [...w.store.actions.values()].filter((a) => a.outcome === "missed");
    expect(missed).toHaveLength(1);
    expect(missed[0].reason).toContain("gapped");
    expect((await w.store.stats()).misses).toBe(1);
  });
});

describe("thin books", () => {
  it("retries once on an empty fill, then records a skip and alerts", async () => {
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
      { minBalance: parseEther("0.01"), dripAmount: parseEther("0.05"), perKeyDailyCap: parseEther("0.1"), dailyCap: parseEther("1") },
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
