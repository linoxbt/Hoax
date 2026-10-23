// One dedicated key per protected account, kept in the watcher's own secret
// store and never in the database. Each key is encrypted at rest with
// AES-256-GCM under HOAX_KEYSTORE_SECRET. The key can only trade (the dreamDEX
// link grants placeOrderFor, cancelOrderFor and reduceOrderFor, never a
// withdrawal), so a leak means unwanted trades, not lost funds, and the trader
// revokes it by unlinking the bot.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { TradingSigner } from "@hoax/chain";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import type { Hex } from "viem";

export interface KeyProvider {
  create(): Promise<TradingSigner>;
  get(address: string): Promise<TradingSigner | null>;
}

interface KeyFile {
  address: string;
  iv: string;
  tag: string;
  ciphertext: string;
}

export class FileKeystore implements KeyProvider {
  private readonly key: Buffer;
  private readonly cache = new Map<string, TradingSigner>();

  constructor(
    private readonly dir: string,
    secret: string,
  ) {
    if (!secret || secret.length < 32) throw new Error("HOAX_KEYSTORE_SECRET must be at least 32 characters");
    this.key = createHash("sha256").update(secret).digest();
    mkdirSync(dir, { recursive: true, mode: 0o700 });
  }

  private path(address: string) {
    return join(this.dir, `${address.toLowerCase()}.json`);
  }

  async create(): Promise<TradingSigner> {
    const pk = generatePrivateKey();
    const account = privateKeyToAccount(pk);
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(pk, "utf8"), cipher.final()]);
    const file: KeyFile = {
      address: account.address.toLowerCase(),
      iv: iv.toString("hex"),
      tag: cipher.getAuthTag().toString("hex"),
      ciphertext: ciphertext.toString("hex"),
    };
    writeFileSync(this.path(account.address), JSON.stringify(file), { mode: 0o600, flag: "wx" });
    this.cache.set(file.address, account);
    return account;
  }

  async get(address: string): Promise<TradingSigner | null> {
    const lower = address.toLowerCase();
    const hit = this.cache.get(lower);
    if (hit) return hit;
    const p = this.path(lower);
    if (!existsSync(p)) return null;
    const file = JSON.parse(readFileSync(p, "utf8")) as KeyFile;
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(file.iv, "hex"));
    decipher.setAuthTag(Buffer.from(file.tag, "hex"));
    const pk = Buffer.concat([decipher.update(Buffer.from(file.ciphertext, "hex")), decipher.final()]).toString("utf8");
    const account = privateKeyToAccount(pk as Hex);
    if (account.address.toLowerCase() !== lower) throw new Error(`keystore entry ${lower} decrypts to another address`);
    this.cache.set(lower, account);
    return account;
  }
}

/** Keys held in memory only: for tests and the replay. */
export class MemoryKeystore implements KeyProvider {
  readonly keys = new Map<string, TradingSigner>();

  async create(): Promise<TradingSigner> {
    const account = privateKeyToAccount(generatePrivateKey());
    this.keys.set(account.address.toLowerCase(), account);
    return account;
  }

  async get(address: string): Promise<TradingSigner | null> {
    return this.keys.get(address.toLowerCase()) ?? null;
  }
}
