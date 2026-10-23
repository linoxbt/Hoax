// Onboarding on the watcher side: make a key for each new registration, notice
// when the trader links it in dreamDEX, and notice when they unlink it.

import type { MarketInfo, Venue } from "@hoax/chain";
import type { AccountRow, Store } from "@hoax/db";
import { getAddress } from "viem";
import type { GasManager } from "./gas.ts";
import type { KeyProvider } from "./keystore.ts";
import type { Logger } from "./log.ts";

/** Registrations that never link are dropped from the poll after this long. */
const PENDING_LINK_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export class Linker {
  private lastUnlinkCheck = 0;

  constructor(
    private readonly venue: Venue,
    private readonly store: Store,
    private readonly keys: KeyProvider,
    private readonly gas: GasManager | null,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  /** The market a link is checked on. "Link a bot" grants every perp market at once. */
  private async probeMarket(): Promise<MarketInfo | null> {
    const markets = await this.venue.listMarkets();
    return markets.find((m) => m.baseSymbol === "ETH") ?? markets[0] ?? null;
  }

  async run(): Promise<void> {
    for (const a of await this.store.listAccounts("pending_key")) {
      const key = await this.keys.create();
      await this.store.setHoaxKey(a.id, key.address);
      this.log.info("made a Hoax key", { owner: a.owner, key: key.address });
    }

    const market = await this.probeMarket();
    if (!market) return;

    for (const a of await this.store.listAccounts("pending_link")) {
      if (!a.hoaxKey || this.now() - a.createdAt.getTime() > PENDING_LINK_MAX_AGE_MS) continue;
      const linked = await this.venue.isLinked(market, getAddress(a.owner), getAddress(a.hoaxKey));
      if (!linked) continue;
      await this.activate(a);
    }

    if (this.now() - this.lastUnlinkCheck >= 30_000) {
      this.lastUnlinkCheck = this.now();
      for (const a of await this.store.listAccounts("active")) {
        if (!a.hoaxKey) continue;
        const linked = await this.venue.isLinked(market, getAddress(a.owner), getAddress(a.hoaxKey));
        if (linked) continue;
        await this.store.setStatus(a.id, "unlinked");
        await this.store.insertAlert({
          accountId: a.id,
          kind: "unlinked",
          message: "The Hoax key is no longer linked to this wallet, so Hoax has stopped protecting it.",
        });
        this.log.info("key unlinked", { owner: a.owner, key: a.hoaxKey });
      }
    }
  }

  private async activate(a: AccountRow): Promise<void> {
    // The newest link wins: an older active registration for the same owner retires.
    const current = await this.store.getAccountByOwner(a.owner);
    if (current && current.id !== a.id && current.status === "active") {
      await this.store.setStatus(current.id, "unlinked");
    }
    await this.store.setStatus(a.id, "active");
    this.log.info("link detected", { owner: a.owner, key: a.hoaxKey });
    if (this.gas && a.hoaxKey) await this.gas.topUp(a.hoaxKey, a.id);
  }
}
