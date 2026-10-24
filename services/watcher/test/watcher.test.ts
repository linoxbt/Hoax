// The loop around the engine: scheduling, health, shutdown, dry run, and the keystore.
import { mkdtempSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fromFloat } from "@hoax/core";
import { SimVenue, type MarketInfo } from "@hoax/chain";
import { MemoryStore } from "@hoax/db";
import { getAddress, parseEther, type Address } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { describe, expect, it } from "vitest";
import { DEFAULT_ENGINE_CONFIG, FileKeystore, GasManager, MemoryKeystore, Watcher, silentLogger } from "../src/index.ts";

const E18 = 10n ** 18n;
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
const A = getAddress("0x00000000000000000000000000000000000000a1") as Address;
const B = getAddress("0x00000000000000000000000000000000000000b2") as Address;

async function setup(opts: { dryRun?: boolean; gas?: boolean } = {}) {
  const venue = new SimVenue();
  venue.addMarket({ info: ETH, mark: 2400n * E18, markOk: true, halfSpreadBps: 1, levels: 40, levelStepBps: 1, levelSize: 5n * E18 });
  const store = new MemoryStore();
  const keys = new MemoryKeystore();
  const gasWallet = privateKeyToAccount(generatePrivateKey());
  venue.balances.set(gasWallet.address.toLowerCase(), parseEther("1"));
  const gas = opts.gas
    ? new GasManager(venue, store, gasWallet, { minBalance: parseEther("0.01"), dripAmount: parseEther("0.05"), perKeyDailyCap: parseEther("1"), dailyCap: parseEther("1"), minGapMs: 0 }, silentLogger)
    : null;
  const watcher = new Watcher({ venue, store, keys, gas, log: silentLogger, tickMs: 1000, engine: { ...DEFAULT_ENGINE_CONFIG, dryRun: opts.dryRun ?? false } });
  const ids: string[] = [];
  for (const owner of [A, B]) {
    venue.openAccount(owner, fromFloat(150));
    venue.setPosition(owner, ETH.pool, E18, 2400n * E18);
    const a = await store.createAccount({ id: `acct-${owner.slice(-2)}`, owner });
    ids.push(a.id);
  }
  await watcher.runOnce(); // keys
  for (const [i, owner] of [A, B].entries()) venue.link(owner, getAddress((await store.getAccount(ids[i]))!.hoaxKey!));
  await watcher.runOnce(); // links
  return { venue, store, watcher, ids };
}

describe("the watcher loop", () => {
  it("ticks every account without waiting for a hung one", async () => {
    const { store, watcher, ids } = await setup();
    const getAccount = store.getAccount.bind(store);
    store.getAccount = (id: string) => (id === ids[0] ? new Promise(() => {}) : getAccount(id)); // A's tick hangs
    const before = watcher.status.ticks;
    await watcher.tickAll(); // returns without waiting
    await new Promise((r) => setTimeout(r, 20));
    expect(watcher.status.ticks).toBe(before + 1); // B ticked
    expect(watcher.status.inFlight).toBe(1);
    await watcher.tickAll();
    await new Promise((r) => setTimeout(r, 20));
    expect(watcher.status.ticks).toBe(before + 2); // B again; A is not started twice
    expect(watcher.status.inFlight).toBe(1);
  });

  it("reports unhealthy when ticks stop finishing or the heartbeat stops", async () => {
    const { watcher } = await setup();
    const t0 = Date.parse(watcher.status.startedAt);
    watcher.status.lastTickAt = new Date(t0 + 60_000).toISOString();
    watcher.status.lastProgressAt = new Date(t0 + 60_000).toISOString();
    watcher.status.lastBeatAt = new Date(t0 + 60_000).toISOString();
    expect(watcher.health(t0 + 61_000).ok).toBe(true);
    watcher.status.activeAccounts = 2;
    const later = watcher.health(t0 + 200_000);
    expect(later.ok).toBe(false);
    expect(later.problems).toEqual(expect.arrayContaining(["no account tick has finished recently", "the heartbeat cannot reach the database"]));
  });

  it("waits for ticks in flight when it stops", async () => {
    const { store, watcher, ids } = await setup();
    let release: () => void = () => {};
    const getAccount = store.getAccount.bind(store);
    store.getAccount = (id: string) => (id === ids[0] ? new Promise((r) => (release = () => r(getAccount(id)))) : getAccount(id));
    await watcher.tickAll();
    let stopped = false;
    const stopping = watcher.stop(5_000).then(() => (stopped = true));
    await new Promise((r) => setTimeout(r, 20));
    expect(stopped).toBe(false);
    release();
    await stopping;
    expect(stopped).toBe(true);
  });

  it("sends nothing on chain in a dry run: no orders, no gas, no pause", async () => {
    const { venue, store, watcher, ids } = await setup({ dryRun: true, gas: true });
    venue.setMark(ETH.pool, 2318n * E18);
    await watcher.runOnce();
    expect((await venue.readPosition(ETH, A)).size).toBe(E18);
    expect(store.drips).toHaveLength(0);
    expect((await store.getAccount(ids[0]))!.paused).toBe(false);
  });

  it("lets only one engine per network hold the lease", async () => {
    const store = new MemoryStore();
    expect(await store.acquireLease("engine:50383")).toBe(true);
    expect(await store.acquireLease("engine:50383")).toBe(false);
    expect(await store.acquireLease("engine:50312")).toBe(true);
  });
});

describe("the file keystore", () => {
  it("round-trips a key, writes it private, and refuses the wrong secret or a swapped file", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hoax-keys-"));
    const secret = "s".repeat(40);
    const ks = new FileKeystore(dir, secret);
    const key = await ks.create();
    const file = join(dir, `${key.address.toLowerCase()}.json`);
    expect(statSync(file).mode & 0o777).toBe(0o600);
    const stored = JSON.parse(readFileSync(file, "utf8")) as { kdf?: string; salt?: string; ciphertext: string };
    expect(stored.kdf).toBe("scrypt");
    expect(stored.salt).toMatch(/^[0-9a-f]{32}$/);
    const again = await new FileKeystore(dir, secret).get(key.address);
    expect(again?.address).toBe(key.address);
    await expect(new FileKeystore(dir, "t".repeat(40)).get(key.address)).rejects.toThrow();
    // A file renamed to another address decrypts to the wrong key and is refused.
    const other = "0x00000000000000000000000000000000000000c3";
    writeFileSync(join(dir, `${other}.json`), readFileSync(file));
    await expect(new FileKeystore(dir, secret).get(other)).rejects.toThrow(/another address/);
    expect(() => new FileKeystore(dir, "short")).toThrow(/32/);
  });

  it("still opens key files written before scrypt (a bare SHA-256 of the secret)", async () => {
    const { createCipheriv, createHash, randomBytes } = await import("node:crypto");
    const dir = mkdtempSync(join(tmpdir(), "hoax-keys-"));
    const secret = "s".repeat(40);
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", createHash("sha256").update(secret).digest(), iv);
    const ciphertext = Buffer.concat([cipher.update(pk, "utf8"), cipher.final()]);
    writeFileSync(
      join(dir, `${account.address.toLowerCase()}.json`),
      JSON.stringify({ address: account.address.toLowerCase(), iv: iv.toString("hex"), tag: cipher.getAuthTag().toString("hex"), ciphertext: ciphertext.toString("hex") }),
    );
    expect((await new FileKeystore(dir, secret).get(account.address))?.address).toBe(account.address);
  });
});
