// Runs the loops: health ticks for every active account (clock-driven, plus an
// immediate tick on PositionUpdated / PositionLiquidated), onboarding, gas,
// counterfactual tracking and pruning.
//
// Each account is ticked on its own: the clock starts a tick for every account
// that is not already mid-tick, without waiting for the others, so one slow
// account (a hung read, a close waiting on its receipt) never delays the rest.

import type { Venue } from "@hoax/chain";
import type { Store } from "@hoax/db";
import { getAddress, type Address } from "viem";
import { Engine, type EngineConfig } from "./engine.ts";
import type { GasManager } from "./gas.ts";
import type { KeyProvider } from "./keystore.ts";
import { Linker } from "./linker.ts";
import type { Logger } from "./log.ts";
import { CounterfactualTracker } from "./tracker.ts";

export interface WatcherOptions {
  venue: Venue;
  store: Store;
  keys: KeyProvider;
  gas: GasManager | null;
  log: Logger;
  engine: EngineConfig;
  tickMs: number;
  /** The heartbeat's name: one per engine process, e.g. watcher-hideki. */
  service?: string;
}

export interface WatcherStatus {
  startedAt: string;
  /** When the clock last started a pass over the active accounts. */
  lastTickAt: string | null;
  /** When an account tick last finished. */
  lastProgressAt: string | null;
  /** When the heartbeat last reached the database. */
  lastBeatAt: string | null;
  activeAccounts: number;
  /** Account ticks running right now. */
  inFlight: number;
  ticks: number;
  errors: number;
  dryRun: boolean;
}

export class Watcher {
  readonly engine: Engine;
  private readonly linker: Linker;
  private readonly tracker: CounterfactualTracker;
  private timers: NodeJS.Timeout[] = [];
  private unwatch: (() => void) | null = null;
  private watchedSig = "";
  private byOwner = new Map<string, string>();
  private urgent = new Set<string>();
  private busy = new Set<string>();
  private inflight = new Set<Promise<unknown>>();
  private stopped = false;
  readonly status: WatcherStatus;

  constructor(private readonly opts: WatcherOptions) {
    this.engine = new Engine({ venue: opts.venue, store: opts.store, keys: opts.keys, log: opts.log, config: opts.engine });
    this.linker = new Linker(opts.venue, opts.store, opts.keys, opts.engine.dryRun ? null : opts.gas, opts.log);
    this.tracker = new CounterfactualTracker(opts.venue, opts.store, opts.log, Date.now, opts.keys);
    this.status = {
      startedAt: new Date().toISOString(),
      lastTickAt: null,
      lastProgressAt: null,
      lastBeatAt: null,
      activeAccounts: 0,
      inFlight: 0,
      ticks: 0,
      errors: 0,
      dryRun: opts.engine.dryRun,
    };
  }

  /**
   * Start a tick for every active account that is not mid-tick. With `wait`,
   * resolve when they finish (tests); the clock does not wait.
   */
  async tickAll(wait = false): Promise<void> {
    const accounts = await this.opts.store.listAccounts("active", this.opts.venue.chainId);
    this.status.activeAccounts = accounts.length;
    this.status.lastTickAt = new Date().toISOString();
    const started = accounts.map((a) => this.tickOne(a.id));
    if (wait) await Promise.all(started);
  }

  private tickOne(accountId: string): Promise<void> {
    if (this.busy.has(accountId) || this.stopped) return Promise.resolve(); // a tick in flight finishes before the next look
    this.busy.add(accountId);
    const run = (async () => {
      try {
        const account = await this.opts.store.getAccount(accountId);
        if (!account || account.status !== "active") return;
        const r = await this.engine.tick(account);
        this.status.ticks++;
        if (r.kind === "error") this.status.errors++;
      } catch (err) {
        this.status.errors++;
        this.opts.log.warn("account tick failed", { account: accountId, error: String(err).slice(0, 200) });
      } finally {
        this.busy.delete(accountId);
        this.status.lastProgressAt = new Date().toISOString();
      }
    })();
    this.track(run);
    return run;
  }

  private track(p: Promise<unknown>): void {
    this.inflight.add(p);
    this.status.inFlight = this.busy.size;
    void p.finally(() => {
      this.inflight.delete(p);
      this.status.inFlight = this.busy.size;
    });
  }

  private async refreshSubscriptions(): Promise<void> {
    const accounts = await this.opts.store.listAccounts("active", this.opts.venue.chainId);
    const owners = accounts.map((a) => getAddress(a.owner) as Address).sort();
    // Ids are part of the signature: a relink swaps the account behind an owner.
    const sig = accounts
      .map((a) => `${a.owner.toLowerCase()}:${a.id}`)
      .sort()
      .join(",");
    this.byOwner = new Map(accounts.map((a) => [a.owner.toLowerCase(), a.id]));
    if (sig === this.watchedSig) return;
    this.unwatch?.();
    this.unwatch = null;
    this.watchedSig = "";
    if (owners.length === 0) {
      this.watchedSig = sig;
      return;
    }
    const markets = await this.opts.venue.listMarkets();
    if (markets.length === 0) return;
    const poke = (account: string) => {
      const id = this.byOwner.get(account.toLowerCase());
      if (id) this.urgent.add(id);
    };
    this.unwatch = this.opts.venue.watchAccounts(markets[0].marginBank, owners, {
      onPositionChange: (account) => poke(account),
      onLiquidation: (ev) => poke(ev.account),
      onError: (err) => {
        // Resubscribe on the next refresh; the clock keeps every account covered meanwhile.
        this.watchedSig = "";
        this.opts.log.warn("event stream error; resubscribing, the clock keeps running", { error: String(err).slice(0, 160) });
      },
    });
    // Only now is this set of owners covered.
    this.watchedSig = sig;
  }

  private loop(name: string, everyMs: number, fn: () => Promise<unknown>): void {
    let running = false;
    const run = async () => {
      if (running || this.stopped) return;
      running = true;
      try {
        await fn();
      } catch (err) {
        this.opts.log.warn(`${name} loop failed`, { error: String(err).slice(0, 200) });
      } finally {
        running = false;
      }
    };
    const first = run();
    this.track(first);
    this.timers.push(
      setInterval(() => {
        this.track(run());
      }, everyMs),
    );
  }

  start(): void {
    const { log } = this.opts;
    log.info("watcher starting", { venue: this.opts.venue.name, tickMs: this.opts.tickMs, dryRun: this.opts.engine.dryRun });
    this.loop("health", this.opts.tickMs, () => this.tickAll());
    this.loop("events", 100, async () => {
      const ids = [...this.urgent];
      this.urgent.clear();
      for (const id of ids) void this.tickOne(id);
    });
    this.loop("subscriptions", 15_000, () => this.refreshSubscriptions());
    this.loop("onboarding", 2_000, () => this.linker.run());
    this.loop("counterfactuals", 2_000, () => this.tracker.run());
    // A dry run sends nothing on chain, gas included.
    if (this.opts.gas && !this.opts.engine.dryRun) this.loop("gas", 30_000, () => this.opts.gas!.run());
    this.loop("heartbeat", 5_000, async () => {
      await this.opts.store.beat(this.opts.service ?? "watcher", {
        ...this.status,
        venue: this.opts.venue.name,
        gasWallet: this.opts.gas?.address ?? null,
      });
      this.status.lastBeatAt = new Date().toISOString();
    });
    this.loop("prune", 60 * 60_000, async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
      await this.opts.store.pruneHealthTicks(dayAgo);
      await this.opts.store.pruneRateHits(dayAgo);
    });
  }

  /**
   * Whether the process is doing its job: the clock is starting passes, ticks
   * are finishing, and the heartbeat reaches the database.
   */
  health(nowMs = Date.now()): { ok: boolean; problems: string[] } {
    const problems: string[] = [];
    const age = (iso: string | null) => (iso ? nowMs - Date.parse(iso) : Number.POSITIVE_INFINITY);
    const started = nowMs - Date.parse(this.status.startedAt);
    const grace = Math.max(30_000, this.opts.tickMs * 10);
    if (started > grace) {
      if (age(this.status.lastTickAt) > grace) problems.push("the health clock has stopped");
      if (this.status.activeAccounts > 0 && age(this.status.lastProgressAt) > grace) problems.push("no account tick has finished recently");
      if (age(this.status.lastBeatAt) > grace) problems.push("the heartbeat cannot reach the database");
    }
    if (this.stopped) problems.push("stopping");
    return { ok: problems.length === 0, problems };
  }

  /** Stop the loops and wait (up to `timeoutMs`) for ticks in flight, so a close in progress is recorded. */
  async stop(timeoutMs = 30_000): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.unwatch?.();
    let timer: NodeJS.Timeout | undefined;
    await Promise.race([
      Promise.allSettled([...this.inflight]),
      new Promise((resolve) => {
        timer = setTimeout(resolve, timeoutMs);
      }),
    ]);
    clearTimeout(timer);
    if (this.inflight.size > 0) this.opts.log.warn("stopped with work in flight; unconfirmed orders are confirmed on the next start", { inFlight: this.inflight.size });
  }

  /** For tests: run each loop body once. */
  async runOnce(): Promise<void> {
    await this.linker.run();
    await this.tickAll(true);
    await this.tracker.run();
  }
}
