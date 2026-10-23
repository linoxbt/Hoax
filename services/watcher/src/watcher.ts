// Runs the loops: health ticks for every active account (clock-driven, plus an
// immediate tick on PositionUpdated / PositionLiquidated), onboarding, gas,
// counterfactual tracking and pruning.

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
  lastTickAt: string | null;
  activeAccounts: number;
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
  private watchedOwners = "";
  private urgent = new Set<string>();
  private busy = new Set<string>();
  private stopped = false;
  readonly status: WatcherStatus;

  constructor(private readonly opts: WatcherOptions) {
    this.engine = new Engine({ venue: opts.venue, store: opts.store, keys: opts.keys, log: opts.log, config: opts.engine });
    this.linker = new Linker(opts.venue, opts.store, opts.keys, opts.gas, opts.log);
    this.tracker = new CounterfactualTracker(opts.venue, opts.store, opts.log);
    this.status = {
      startedAt: new Date().toISOString(),
      lastTickAt: null,
      activeAccounts: 0,
      ticks: 0,
      errors: 0,
      dryRun: opts.engine.dryRun,
    };
  }

  /** One health pass over every active account. */
  async tickAll(): Promise<void> {
    const accounts = await this.opts.store.listAccounts("active", this.opts.venue.chainId);
    this.status.activeAccounts = accounts.length;
    await Promise.all(accounts.map((a) => this.tickOne(a.id)));
    this.status.lastTickAt = new Date().toISOString();
  }

  private async tickOne(accountId: string): Promise<void> {
    if (this.busy.has(accountId)) return; // a close in flight finishes before the next look
    this.busy.add(accountId);
    try {
      const account = await this.opts.store.getAccount(accountId);
      if (!account || account.status !== "active") return;
      const r = await this.engine.tick(account);
      this.status.ticks++;
      if (r.kind === "error") this.status.errors++;
    } finally {
      this.busy.delete(accountId);
    }
  }

  private async refreshSubscriptions(): Promise<void> {
    const accounts = await this.opts.store.listAccounts("active", this.opts.venue.chainId);
    const owners = accounts.map((a) => getAddress(a.owner) as Address).sort();
    const sig = owners.join(",");
    if (sig === this.watchedOwners) return;
    this.watchedOwners = sig;
    this.unwatch?.();
    this.unwatch = null;
    const markets = await this.opts.venue.listMarkets();
    if (owners.length === 0 || markets.length === 0) return;
    const byOwner = new Map(accounts.map((a) => [a.owner.toLowerCase(), a.id]));
    const poke = (account: string) => {
      const id = byOwner.get(account.toLowerCase());
      if (id) this.urgent.add(id);
    };
    this.unwatch = this.opts.venue.watchAccounts(markets[0].marginBank, owners, {
      onPositionChange: (account) => poke(account),
      onLiquidation: (ev) => poke(ev.account),
      onError: (err) => this.opts.log.warn("event stream error; the clock keeps running", { error: String(err).slice(0, 160) }),
    });
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
    void run();
    this.timers.push(setInterval(run, everyMs));
  }

  start(): void {
    const { log } = this.opts;
    log.info("watcher starting", { venue: this.opts.venue.name, tickMs: this.opts.tickMs, dryRun: this.opts.engine.dryRun });
    this.loop("health", this.opts.tickMs, () => this.tickAll());
    this.loop("events", 100, async () => {
      const ids = [...this.urgent];
      this.urgent.clear();
      await Promise.all(ids.map((id) => this.tickOne(id)));
    });
    this.loop("subscriptions", 15_000, () => this.refreshSubscriptions());
    this.loop("onboarding", 2_000, () => this.linker.run());
    this.loop("counterfactuals", 2_000, () => this.tracker.run());
    if (this.opts.gas) this.loop("gas", 30_000, () => this.opts.gas!.run());
    this.loop("heartbeat", 5_000, () =>
      this.opts.store.beat(this.opts.service ?? "watcher", { ...this.status, venue: this.opts.venue.name, gasWallet: this.opts.gas?.address ?? null }),
    );
    this.loop("prune", 60 * 60_000, async () => {
      const dayAgo = new Date(Date.now() - 24 * 60 * 60_000);
      await this.opts.store.pruneHealthTicks(dayAgo);
      await this.opts.store.pruneRateHits(dayAgo);
    });
  }

  async stop(): Promise<void> {
    this.stopped = true;
    for (const t of this.timers) clearInterval(t);
    this.unwatch?.();
  }

  /** For tests: run each loop body once. */
  async runOnce(): Promise<void> {
    await this.linker.run();
    await this.tickAll();
    await this.tracker.run();
  }
}
