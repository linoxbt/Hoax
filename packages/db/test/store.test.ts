// One contract, both stores. The Postgres half runs when TEST_DATABASE_URL is set.
import { randomUUID } from "node:crypto";
import { DEFAULT_POLICY, type Receipt } from "@hoax/core";
import pg from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MemoryStore, PgStore, migrate, pgConfig, type NewAction, type Store } from "../src/index.ts";

const OWNER = "0xAbC0000000000000000000000000000000000001";
const KEY = "0xdef0000000000000000000000000000000000002";

function action(accountId: string, over: Partial<NewAction> = {}): NewAction {
  const receipt = { version: 1, account: OWNER, outcome: "pending" } as unknown as Receipt;
  return {
    id: randomUUID(),
    accountId,
    owner: OWNER,
    market: "ETH-PERP",
    pool: "0xd6cb1dd58580b84d76068ac21594219ce03aeddf",
    side: "long",
    block: 10n,
    txHash: "0x01",
    sizeBefore: 10n ** 18n,
    sizeRequested: 25n * 10n ** 16n,
    sizeFilled: 25n * 10n ** 16n,
    sizeAfter: 75n * 10n ** 16n,
    avgPrice: 2399n * 10n ** 18n,
    mark: 2400n * 10n ** 18n,
    cost: 25n * 10n ** 16n,
    estCloseCost: 25n * 10n ** 16n,
    estLiqCost: 30n * 10n ** 18n,
    forcedSlippage: 10n * 10n ** 18n,
    equityBefore: 72n * 10n ** 18n,
    mmReqBefore: 60n * 10n ** 18n,
    healthBefore: 1.2,
    healthAfter: 1.6,
    liqPriceBefore: 2350n * 10n ** 18n,
    liqPriceAfter: 2300n * 10n ** 18n,
    builderFee1k: 0n,
    outcome: "pending",
    reason: null,
    receipt,
    receiptHash: "0xhash",
    signature: "0xsig",
    ...over,
  };
}

function contract(name: string, make: () => Promise<Store>) {
  describe(name, () => {
    let store: Store;
    beforeAll(async () => {
      store = await make();
    });
    afterAll(async () => {
      await store.close();
    });

    it("walks an account from registration to active", async () => {
      const id = randomUUID();
      const a = await store.createAccount({ id, owner: OWNER });
      expect(a.status).toBe("pending_key");
      expect(a.owner).toBe(OWNER.toLowerCase());
      await store.setHoaxKey(id, KEY);
      expect((await store.getAccount(id))?.status).toBe("pending_link");
      await store.setStatus(id, "active");
      const active = await store.getAccountByOwner(OWNER);
      expect(active?.id).toBe(id);
      expect(active?.linkedAt).not.toBeNull();
      expect((await store.listAccounts("active")).map((x) => x.id)).toContain(id);
      await store.setPaused(id, true);
      await store.setBuilderApproval(id, 10_000n);
      const after = await store.getAccount(id);
      expect(after?.paused).toBe(true);
      expect(after?.builderApproval1k).toBe(10_000n);
    });

    it("stores policies, ticks, actions, counterfactuals, alerts and stats", async () => {
      const id = randomUUID();
      await store.createAccount({ id, owner: "0x00000000000000000000000000000000000000aa" });
      await store.setStatus(id, "active");

      await store.upsertPolicy(id, "ETH-PERP", { ...DEFAULT_POLICY, floorSize: 4n * 10n ** 15n });
      await store.upsertPolicy(id, "ETH-PERP", { ...DEFAULT_POLICY, triggerHealth: 1.3 });
      const policies = await store.listPolicies(id);
      expect(policies).toHaveLength(1);
      expect(policies[0].triggerHealth).toBe(1.3);
      expect(policies[0].floorSize).toBeNull();

      const tick = {
        accountId: id,
        market: "ETH-PERP",
        block: 1n,
        health: 1.5,
        equity: 90n * 10n ** 18n,
        mmReq: 60n * 10n ** 18n,
        mark: 2400n * 10n ** 18n,
        markOk: true,
        size: 10n ** 18n,
        liqPrice: 2300n * 10n ** 18n,
      };
      await store.insertHealthTicks([tick]);
      await new Promise((r) => setTimeout(r, 5));
      await store.insertHealthTicks([{ ...tick, block: 2n, health: null }]);
      const latest = await store.latestHealth(id);
      expect(latest).toHaveLength(1);
      expect(latest[0].block).toBe(2n);
      expect(latest[0].health).toBeNull();

      const a = await store.insertAction(action(id));
      expect(a.sizeFilled).toBe(25n * 10n ** 16n);
      expect((await store.listPendingActions()).some((x) => x.id === a.id)).toBe(true);
      expect(await store.lastActionAt(id, "ETH-PERP")).not.toBeNull();

      const before = await store.stats();
      await store.updateActionOutcome(a.id, "saved");
      await store.upsertCounterfactual({
        actionId: a.id,
        originalLiqPrice: 2350n * 10n ** 18n,
        reachedAtBlock: 5n,
        equityAtReach: 50n * 10n ** 18n,
        equityIfLiquidated: 20n * 10n ** 18n,
        preserved: 30n * 10n ** 18n,
        finalOutcome: "saved",
        resolvedAt: new Date(),
        resolution: null,
        resolutionHash: null,
        resolutionSignature: null,
      });
      const after = await store.stats();
      expect(after.saves).toBe(before.saves + 1);
      expect(after.savedEquity - before.savedEquity).toBe(30n * 10n ** 18n);
      expect((await store.getCounterfactual(a.id))?.preserved).toBe(30n * 10n ** 18n);

      const nn = await store.insertAction(action(id, { outcome: "not-needed", cost: 2n * 10n ** 18n }));
      expect((await store.getAction(nn.id))?.outcome).toBe("not-needed");
      expect((await store.stats()).insuranceCost - after.insuranceCost).toBe(2n * 10n ** 18n);

      await store.insertAlert({ accountId: id, kind: "stale", message: "mark stale for 60 s" });
      expect((await store.listAlerts(id, 5))[0].kind).toBe("stale");

      const drip = await store.reserveDrip({ hoaxKey: KEY, chainId: 50383, amount: 5n * 10n ** 16n, perKeyCap: 10n ** 18n, dailyCap: 10n ** 19n, windowMs: 86_400_000, minGapMs: 0 });
      expect(drip.ok).toBe(true);
      if (drip.ok) await store.completeDrip(drip.id, "0xd");
      expect(await store.dripsSince(new Date(Date.now() - 60_000), { hoaxKey: KEY })).toBeGreaterThanOrEqual(5n * 10n ** 16n);
      expect((await store.listActions({ owner: OWNER, limit: 10 })).length).toBeGreaterThanOrEqual(2);
    });

    it("keeps an owner's accounts apart per network", async () => {
      const owner = "0x00000000000000000000000000000000000000bb";
      const hideki = randomUUID();
      const shannon = randomUUID();
      await store.createAccount({ id: hideki, owner });
      await store.createAccount({ id: shannon, owner, chainId: 50312 });
      expect((await store.getAccount(shannon))?.chainId).toBe(50312);
      expect((await store.getAccountByOwner(owner))?.id).toBe(hideki);
      expect((await store.getAccountByOwner(owner, 50312))?.id).toBe(shannon);
      // The same Safe address may be active on both networks at once.
      await store.setStatus(hideki, "active");
      await store.setStatus(shannon, "active");
      const onShannon = (await store.listAccounts("active", 50312)).map((x) => x.id);
      expect(onShannon).toContain(shannon);
      expect(onShannon).not.toContain(hideki);
      expect((await store.listAccounts("active")).map((x) => x.id)).toEqual(expect.arrayContaining([hideki, shannon]));
    });

    it("finds pending actions per network and a liquidation after a close", async () => {
      const owner = "0x00000000000000000000000000000000000000cc";
      const hideki = randomUUID();
      const shannon = randomUUID();
      await store.createAccount({ id: hideki, owner });
      await store.createAccount({ id: shannon, owner, chainId: 50312 });
      // The same pool address on both networks.
      const onHideki = await store.insertAction(action(hideki, { owner }));
      const onShannon = await store.insertAction(action(shannon, { owner }));
      const hidekiPending = (await store.listPendingActions(50383)).map((x) => x.id);
      expect(hidekiPending).toContain(onHideki.id);
      expect(hidekiPending).not.toContain(onShannon.id);
      expect((await store.listPendingActions()).map((x) => x.id)).toEqual(expect.arrayContaining([onHideki.id, onShannon.id]));

      expect(await store.liquidatedAfter(hideki, onHideki.pool, onHideki.createdAt)).toBe(false);
      await new Promise((r) => setTimeout(r, 5));
      // A miss on the other network's account does not count.
      await store.insertAction(action(shannon, { owner, outcome: "missed" }));
      expect(await store.liquidatedAfter(hideki, onHideki.pool, onHideki.createdAt)).toBe(false);
      // Nor do newer receipts crowding it out: the lookup is exact, not the last N.
      for (let i = 0; i < 3; i++) await store.insertAction(action(hideki, { owner, outcome: "skipped" }));
      await store.insertAction(action(hideki, { owner, outcome: "missed", pool: `0x${onHideki.pool.slice(2).toUpperCase()}` }));
      for (let i = 0; i < 3; i++) await store.insertAction(action(hideki, { owner, outcome: "skipped" }));
      expect(await store.liquidatedAfter(hideki, onHideki.pool, onHideki.createdAt)).toBe(true);
      expect(await store.liquidatedAfter(hideki, "0x0000000000000000000000000000000000000001", onHideki.createdAt)).toBe(false);
    });

    it("counts rate-limit hits per bucket within the window", async () => {
      const bucket = `test:${randomUUID()}`;
      expect(await store.rateHit(bucket, 60_000, 2)).toBe(1);
      expect(await store.rateHit(bucket, 60_000, 2)).toBe(2);
      // Over the limit: counted as refused, not stored.
      expect(await store.rateHit(bucket, 60_000, 2)).toBe(3);
      expect(await store.rateHit(bucket, 60_000, 2)).toBe(3);
      expect(await store.rateHit(`${bucket}:other`, 60_000, 2)).toBe(1);
      await new Promise((r) => setTimeout(r, 30));
      expect(await store.rateHit(bucket, 10, 2)).toBe(1);
      // How many rows remain to prune differs: the memory store drops expired hits as it counts.
      expect(await store.pruneRateHits(new Date(Date.now() + 1000))).toBeGreaterThan(0);
      expect(await store.rateHit(bucket, 60_000, 2)).toBe(1);
    });

    it("hands back the waiting registration instead of making a second one", async () => {
      const owner = "0x00000000000000000000000000000000000000dd";
      const first = await store.createAccount({ id: randomUUID(), owner });
      const again = await store.createAccount({ id: randomUUID(), owner });
      expect(again.id).toBe(first.id);
      // Another network is another registration.
      expect((await store.createAccount({ id: randomUUID(), owner, chainId: 50312 })).id).not.toBe(first.id);
      // Once the first one is no longer waiting, a new one is made.
      await store.setStatus(first.id, "retired");
      expect((await store.createAccount({ id: randomUUID(), owner })).id).not.toBe(first.id);
    });

    it("replaces an action by id, keeping when it was first written", async () => {
      const id = randomUUID();
      await store.createAccount({ id, owner: "0x00000000000000000000000000000000000000ee" });
      const draft = await store.insertAction(action(id, { outcome: "unconfirmed", healthBefore: Number.POSITIVE_INFINITY }));
      expect((await store.listUnconfirmedActions(id)).map((x) => x.id)).toEqual([draft.id]);
      expect((await store.getAction(draft.id))?.healthBefore).toBe(Number.POSITIVE_INFINITY);
      await new Promise((r) => setTimeout(r, 5));
      const final = await store.insertAction({ ...action(id, { outcome: "pending", sizeFilled: 1n }), id: draft.id });
      expect(final.createdAt.getTime()).toBe(draft.createdAt.getTime());
      expect((await store.getAction(draft.id))?.sizeFilled).toBe(1n);
      expect(await store.listUnconfirmedActions(id)).toHaveLength(0);
      expect((await store.getCounterfactuals([draft.id, randomUUID()])).size).toBe(0);
    });

    it("keeps gas reservations inside the caps", async () => {
      const key = `0x${randomUUID().replace(/-/g, "").slice(0, 32)}00000000`;
      const base = { hoaxKey: key, chainId: 50312, amount: 5n, perKeyCap: 10n, dailyCap: 1_000_000n, windowMs: 86_400_000, minGapMs: 0 };
      const a = await store.reserveDrip(base);
      const b = await store.reserveDrip(base);
      expect(a.ok && b.ok).toBe(true);
      expect(await store.reserveDrip(base)).toEqual({ ok: false, reason: "key-cap" });
      if (b.ok) await store.cancelDrip(b.id);
      expect((await store.reserveDrip(base)).ok).toBe(true);
      expect(await store.reserveDrip({ ...base, hoaxKey: `${key.slice(0, -1)}1`, minGapMs: 0, perKeyCap: 100n, dailyCap: 0n })).toEqual({ ok: false, reason: "daily-cap" });
      expect(await store.reserveDrip({ ...base, perKeyCap: 100n, minGapMs: 60_000 })).toEqual({ ok: false, reason: "recent" });
    });

    it("keeps the newest heartbeat per service", async () => {
      expect(await store.lastBeat("watcher-test")).toBeNull();
      await store.beat("watcher-test", { ticks: 1 });
      await store.beat("watcher-test", { ticks: 2 });
      const b = await store.lastBeat("watcher-test");
      expect(b?.info.ticks).toBe(2);
      expect(Date.now() - b!.beatAt.getTime()).toBeLessThan(60_000);
    });
  });
}

contract("MemoryStore", async () => new MemoryStore());

const url = process.env.TEST_DATABASE_URL;
if (url) {
  contract("PgStore", async () => {
    const admin = new pg.Client(pgConfig(url));
    await admin.connect();
    await admin.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
    await admin.end();
    await migrate(url);
    return new PgStore(url);
  });
}
