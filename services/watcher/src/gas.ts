// Keeps each linked Hoax key able to pay for its orders. Drips only to keys
// with a confirmed link, with a per-key and a per-network daily cap so a bug or
// an abuse cannot drain the gas wallet. Each drip is reserved in the store
// before it is sent, so the caps hold across processes and across a lost
// receipt: a drip that was sent counts whether or not its receipt came back.

import { TxUnknownError, type TradingSigner, type Venue } from "@hoax/chain";
import type { Store } from "@hoax/db";
import { getAddress, parseEther } from "viem";
import type { Logger } from "./log.ts";

export interface GasConfig {
  /**
   * Top up when a key holds less than this (wei), or less than the chain's up-front
   * charge for one close, whichever is higher: 10M gas at ~7 gwei is 0.072 STT today.
   */
  minBalance: bigint;
  dripAmount: bigint;
  perKeyDailyCap: bigint;
  dailyCap: bigint;
  /** No second drip to the same key within this long (the balance read may not show the first yet). */
  minGapMs?: number;
  /** Warn when the gas wallet itself holds less than this (wei). Default 0.5 STT, ten drips. */
  walletLow?: bigint;
}

export const DEFAULT_GAS_CONFIG: GasConfig = {
  minBalance: parseEther("0.15"),
  dripAmount: parseEther("0.25"),
  perKeyDailyCap: parseEther("0.75"),
  dailyCap: parseEther("3"),
  minGapMs: 5 * 60_000,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
const WALLET_LOW = parseEther("0.5");
/** A "cap reached" alert is repeated at most this often per key. */
const CAP_ALERT_EVERY_MS = 6 * 60 * 60_000;

export class GasManager {
  private readonly capAlerted = new Map<string, number>();

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
    const [balance, reserve] = await Promise.all([this.venue.nativeBalance(key), this.venue.orderGasReserve()]);
    // Below the chain's up-front charge the key cannot send a close at all, whatever it would really cost.
    const floor = reserve > this.config.minBalance ? reserve : this.config.minBalance;
    if (balance >= floor) return null;
    // Leave room for two closes at today's fee, even when a single drip would not.
    const amount = floor * 2n - balance > this.config.dripAmount ? floor * 2n - balance : this.config.dripAmount;
    // Reserved atomically against the caps before it is sent, so they hold
    // across both engines and across a lost receipt.
    const reservation = await this.store.reserveDrip({
      hoaxKey: key,
      chainId: this.venue.chainId ?? null,
      amount,
      perKeyCap: this.config.perKeyDailyCap,
      dailyCap: this.config.dailyCap,
      windowMs: DAY_MS,
      minGapMs: this.config.minGapMs ?? DEFAULT_GAS_CONFIG.minGapMs!,
    });
    if (!reservation.ok) {
      if (reservation.reason === "recent") return null; // one is on its way
      const last = this.capAlerted.get(key);
      if (last === undefined || this.now() - last >= CAP_ALERT_EVERY_MS) {
        this.capAlerted.set(key, this.now());
        await this.store.insertAlert({
          accountId,
          kind: "gas",
          message: "Hoax's key is low on STT and today's gas allowance is used up. Top it up from dreamDEX (Bots tab, Top up).",
        });
      }
      return null;
    }
    try {
      const hash = await this.venue.sendNative(this.wallet, key, amount);
      await this.store.completeDrip(reservation.id, hash);
      this.log.info("gas drip", { key, amount, tx: hash });
      return hash;
    } catch (err) {
      if (err instanceof TxUnknownError) {
        // Sent: it counts against the caps whether or not it lands.
        await this.store.completeDrip(reservation.id, err.hash);
        this.log.warn("gas drip sent, receipt not confirmed", { key, tx: err.hash });
        return err.hash;
      }
      await this.store.cancelDrip(reservation.id);
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
    // A failed balance read of the gas wallet must not hold up the drips themselves.
    await this.checkWallet().catch((err) => this.log.warn("could not read the gas wallet's balance", { error: String(err).slice(0, 160) }));
    for (const a of await this.store.listAccounts("active", this.venue.chainId)) {
      if (!a.hoaxKey) continue;
      try {
        await this.topUp(a.hoaxKey, a.id);
      } catch (err) {
        this.log.warn("gas check failed", { account: a.owner, error: String(err).slice(0, 200) });
      }
    }
  }
}
