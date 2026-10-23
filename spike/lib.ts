// Shared setup for the spike tests: the live venue, env parsing, and an
// evidence log written to spike/evidence/ with block numbers, the SDK version
// and every tx hash, as the spec requires.
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { DreamDexVenue, HIDEKI, type MarketInfo } from "@hoax/chain";
import { createPublicClient, getAddress, http, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const here = dirname(fileURLToPath(import.meta.url));
const sdkVersion = JSON.parse(
  readFileSync(join(here, "..", "node_modules", "@somnia-chain", "markets-sdk", "package.json"), "utf8"),
).version as string;

export const venue = new DreamDexVenue();
export const publicClient = createPublicClient({ chain: HIDEKI.chain, transport: http(HIDEKI.rpcUrl) });

export function need(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`${name} is required for this spike. See spike/README.md.`);
    process.exit(2);
  }
  return v;
}

export const ownerFromEnv = (): Address => getAddress(need("OWNER_ADDRESS"));
export const keyFromEnv = (name = "BOT_PRIVATE_KEY") => privateKeyToAccount(need(name) as Hex);

export async function market(symbol = process.env.MARKET ?? "ETH-PERP"): Promise<MarketInfo> {
  const m = (await venue.listMarkets()).find((x) => x.symbol === symbol);
  if (!m) throw new Error(`no market ${symbol}`);
  return m;
}

export class Evidence {
  readonly startedAt = new Date().toISOString();
  readonly entries: Array<Record<string, unknown>> = [];
  constructor(readonly spike: string) {}

  log(event: string, data: Record<string, unknown> = {}): void {
    const entry = { at: new Date().toISOString(), event, ...data };
    this.entries.push(entry);
    console.log(event, JSON.stringify(data, big));
  }

  async finish(result: { pass: boolean | null; summary: string; [k: string]: unknown }): Promise<string> {
    const block = await publicClient.getBlockNumber();
    const dir = join(here, "evidence");
    mkdirSync(dir, { recursive: true });
    const file = join(dir, `${this.spike}-${this.startedAt.replace(/[:.]/g, "-")}.json`);
    const body = {
      spike: this.spike,
      sdk: `@somnia-chain/markets-sdk@${sdkVersion}`,
      network: { chainId: HIDEKI.chain.id, rpc: HIDEKI.rpcUrl },
      startedAt: this.startedAt,
      finishedAt: new Date().toISOString(),
      finishedAtBlock: block.toString(),
      result,
      entries: this.entries,
    };
    writeFileSync(file, JSON.stringify(body, big, 2));
    console.log(`\n${result.pass === null ? "INCONCLUSIVE" : result.pass ? "PASS" : "FAIL"}: ${result.summary}\nevidence: ${file}`);
    await venue.close();
    return file;
  }
}

function big(_k: string, v: unknown) {
  return typeof v === "bigint" ? v.toString() : v;
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
