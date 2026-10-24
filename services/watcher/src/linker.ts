// Onboarding on the watcher side: make a key for each new registration, notice
// when the trader links it in dreamDEX, notice when they unlink it (or relink
// it), and warn when a protected market is not covered by the link.

import type { MarketInfo, Venue } from "@hoax/chain";
import type { AccountRow, Store } from "@hoax/db";
import { getAddress } from "viem";
import type { GasManager } from "./gas.ts";
import type { KeyProvider } from "./keystore.ts";
import type { Logger } from "./log.ts";

/** Registrations that never link are dropped from the poll after this long. */
const PENDING_LINK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Unlinked accounts are watched for a relink with the same key for this long. */
const RELINK_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;
const LINK_CHECK_EVERY_MS = 30_000;

export class Linker {
  private lastLinkCheck = Number.NEGATIVE_INFINITY;
  /** Accounts already told that a protected market is not linked, per market. */
  private readonly warnedUnlinked = new Map<string, Set<string>>();

  constructor(
    private readonly venue: Venue,
    private readonly store: Store,
    private readonly keys: KeyProvider,
    private readonly gas: GasManager | null,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  /** The market a link is checked on first. Hoax's link grants every perp market at once. */
  private probeMarket(markets: MarketInfo[]): MarketInfo | null {
    return markets.find((m) => m.baseSymbol === "ETH") ?? markets[0] ?? null;
  }

  /** One pass. A failure on one account is logged and does not hold up the others. */
  async run(): Promise<void> {
    for (const a of await this.store.listAccounts("pending_key", this.venue.chainId)) {
      await this.each(a, async () => {
        const key = await this.keys.create();
        await this.store.setHoaxKey(a.id, key.address);
        this.log.info("made a Hoax key", { owner: a.owner, key: key.address });
      });
    }

    const markets = await this.venue.listMarkets();
    const probe = this.probeMarket(markets);
    if (!probe) return;

    for (const a of await this.store.listAccounts("pending_link", this.venue.chainId)) {
      if (!a.hoaxKey || this.now() - a.createdAt.getTime() > PENDING_LINK_MAX_AGE_MS) continue;
      await this.each(a, async () => {
        if (await this.venue.isLinked(probe, getAddress(a.owner), getAddress(a.hoaxKey!))) await this.activate(a);
      });
    }

    if (this.now() - this.lastLinkCheck < LINK_CHECK_EVERY_MS) return;
    this.lastLinkCheck = this.now();
    const bySymbol = new Map(markets.map((m) => [m.symbol, m]));

    for (const a of await this.store.listAccounts("active", this.venue.chainId)) {
      if (!a.hoaxKey) continue;
      await this.each(a, async () => {
        const owner = getAddress(a.owner);
        const key = getAddress(a.hoaxKey!);
        if (!(await this.venue.isLinked(probe, owner, key))) {
          await this.store.setStatus(a.id, "unlinked");
          await this.store.insertAlert({
            accountId: a.id,
            kind: "unlinked",
            message: "The Hoax key is no longer linked to this wallet, so Hoax has stopped protecting it.",
          });
          this.log.info("key unlinked", { owner: a.owner, key: a.hoaxKey });
          return;
        }
        // Every market with protection on must be linked too, or its closes revert.
        const warned = this.warnedUnlinked.get(a.id) ?? new Set<string>();
        for (const p of await this.store.listPolicies(a.id)) {
          const market = bySymbol.get(p.market);
          if (!p.enabled || !market || market.pool === probe.pool) continue;
          const linked = await this.venue.isLinked(market, owner, key);
          if (linked) {
            warned.delete(p.market);
          } else if (!warned.has(p.market)) {
            warned.add(p.market);
            await this.store.insertAlert({
              accountId: a.id,
              kind: "unlinked",
              message: `The Hoax key is not linked on ${p.market}, so Hoax cannot close there. Link Hoax again from Settings to cover every market.`,
            });
          }
        }
        this.warnedUnlinked.set(a.id, warned);
      });
    }

    // A trader who removed the key and later linked the same key again.
    for (const a of await this.store.listAccounts("unlinked", this.venue.chainId)) {
      if (!a.hoaxKey || this.now() - (a.linkedAt ?? a.createdAt).getTime() > RELINK_MAX_AGE_MS) continue;
      await this.each(a, async () => {
        const current = await this.store.getAccountByOwner(a.owner, a.chainId);
        if (current && current.id !== a.id && current.status !== "unlinked") return; // a newer registration owns it
        if (await this.venue.isLinked(probe, getAddress(a.owner), getAddress(a.hoaxKey!))) await this.activate(a);
      });
    }
  }

  private async each(a: AccountRow, fn: () => Promise<void>): Promise<void> {
    try {
      await fn();
    } catch (err) {
      this.log.warn("onboarding check failed", { owner: a.owner, error: String(err).slice(0, 200) });
    }
  }

  private async activate(a: AccountRow): Promise<void> {
    // The newest link wins: an older active registration for the same owner retires for good.
    const current = await this.store.getAccountByOwner(a.owner, a.chainId);
    if (current && current.id !== a.id && current.status === "active") {
      await this.store.setStatus(current.id, "retired");
    }
    // Liquidations count from the moment protection starts.
    await this.store.setLiqScanFrom(a.id, await this.venue.blockNumber());
    await this.store.setStatus(a.id, "active");
    this.log.info("link detected", { owner: a.owner, key: a.hoaxKey });
    if (this.gas && a.hoaxKey) await this.gas.topUp(a.hoaxKey, a.id);
  }
}
