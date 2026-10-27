// Keeps each linked Hoax key able to pay for its orders. Drips only to keys
// with a confirmed link, with a per-key and a global daily cap so a bug or an
// abuse cannot drain the gas wallet.

import type { TradingSigner, Venue } from "@hoax/chain";
import type { Store } from "@hoax/db";
import { getAddress, parseEther } from "viem";
import type { Logger } from "./log.ts";

export interface GasConfig {
  /** Top up when a key holds less than this (wei). Three orders' worth with margin. */
  minBalance: bigint;
  dripAmount: bigint;
  perKeyDailyCap: bigint;
  dailyCap: bigint;
  /** Warn when the gas wallet itself holds less than this (wei). Default 0.5 STT, ten drips. */
  walletLow?: bigint;
}

export const DEFAULT_GAS_CONFIG: GasConfig = {
  minBalance: parseEther("0.01"),
  dripAmount: parseEther("0.05"),
  perKeyDailyCap: parseEther("0.2"),
  dailyCap: parseEther("2"),
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WALLET_LOW = parseEther("0.5");

export class GasManager {
  constructor(
    private readonly venue: Venue,
    private readonly store: Store,
    private readonly wallet: TradingSigner,
    private readonly config: GasConfig,
    private readonly log: Logger,
    private readonly now: () => number = Date.now,
  ) {}

  /** The gas wallet's own balance at the last check; null before the first. */
  walletBalance: bigint | null = null;
  private warnedAt = -Infinity;

  get address() {
    return this.wallet.address;
  }

  get walletLow(): boolean {
    return this.walletBalance !== null && this.walletBalance < (this.config.walletLow ?? WALLET_LOW);
  }

  /** Read the gas wallet's balance, warning at most hourly while it runs low so the operator refills it in time. */
  async checkWallet(): Promise<void> {
    this.walletBalance = await this.venue.nativeBalance(this.wallet.address);
    if (!this.walletLow || this.now() - this.warnedAt < HOUR_MS) return;
    this.warnedAt = this.now();
    this.log.warn("gas wallet low: refill it so drips keep working", { wallet: this.wallet.address, balance: this.walletBalance });
  }

  /** Top a key up if it is low and the caps allow. Returns the tx hash, or null. */
  async topUp(hoaxKey: string, accountId: string): Promise<string | null> {
    const key = getAddress(hoaxKey);
    const balance = await this.venue.nativeBalance(key);
    if (balance >= this.config.minBalance) return null;
    const since = new Date(this.now() - DAY_MS);
    const [forKey, total] = await Promise.all([this.store.dripsSince(since, key), this.store.dripsSince(since)]);
    if (forKey + this.config.dripAmount > this.config.perKeyDailyCap || total + this.config.dripAmount > this.config.dailyCap) {
      await this.store.insertAlert({
        accountId,
        kind: "gas",
        message: "Hoax's key is low on STT and today's gas allowance is used up. Top it up from dreamDEX (Bots tab, Top up).",
      });
      return null;
    }
    try {
      const hash = await this.venue.sendNative(this.wallet, key, this.config.dripAmount);
      await this.store.recordDrip(key, this.config.dripAmount, hash);
      this.log.info("gas drip", { key, amount: this.config.dripAmount, tx: hash });
      return hash;
    } catch (err) {
      this.log.error("gas drip failed", { key, error: String(err).slice(0, 200) });
      await this.store.insertAlert({
        accountId,
        kind: "gas",
        message: "Hoax could not top up its key with STT. Top it up from dreamDEX (Bots tab, Top up) so it can keep acting.",
      });
      return null;
    }
  }

  async run(): Promise<void> {
    await this.checkWallet();
    for (const a of await this.store.listAccounts("active", this.venue.chainId)) {
      if (a.hoaxKey) await this.topUp(a.hoaxKey, a.id);
    }
  }
}
