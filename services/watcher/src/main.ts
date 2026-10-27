// The watcher process: reads its configuration from the environment, connects
// to Postgres and one Somnia network, and runs until stopped. NETWORK picks it:
// hideki (default) or shannon. Run one process per network against the same
// database and keystore; each protects only its own network's accounts.

import { createServer } from "node:http";
import { DreamDexVenue, NETWORKS } from "@hoax/chain";
import { MemoryStore, PgStore, migrate, type Store } from "@hoax/db";
import { formatEther, getAddress, parseEther, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { DEFAULT_ENGINE_CONFIG } from "./engine.ts";
import { GasManager } from "./gas.ts";
import { FileKeystore } from "./keystore.ts";
import { consoleLogger as log } from "./log.ts";
import { Watcher } from "./watcher.ts";

function env(name: string, fallback?: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

async function main() {
  const databaseUrl = env("DATABASE_URL");
  let store: Store;
  if (databaseUrl) {
    await migrate(databaseUrl);
    store = new PgStore(databaseUrl);
  } else {
    log.warn("DATABASE_URL is not set: using an in-memory store, nothing survives a restart");
    store = new MemoryStore();
  }

  const secret = env("HOAX_KEYSTORE_SECRET");
  if (!secret) throw new Error("HOAX_KEYSTORE_SECRET is required: it encrypts the per-account Hoax keys");
  const keys = new FileKeystore(env("KEYSTORE_DIR", "./keystore")!, secret);

  const networkKey = env("NETWORK", "hideki")!;
  const network = NETWORKS.find((n) => n.key === networkKey);
  if (!network) throw new Error(`NETWORK must be one of ${NETWORKS.map((n) => n.key).join(", ")}`);
  const venue = new DreamDexVenue({ network, rpcUrl: env("RPC_URL"), wsUrl: env("WS_URL"), indexerUrl: env("INDEXER_URL") });

  const gasKey = env("GAS_WALLET_PRIVATE_KEY");
  const gas = gasKey
    ? new GasManager(
        venue,
        store,
        privateKeyToAccount(gasKey as Hex),
        {
          minBalance: parseEther(env("GAS_MIN_BALANCE", "0.01")!),
          dripAmount: parseEther(env("GAS_DRIP_AMOUNT", "0.05")!),
          perKeyDailyCap: parseEther(env("GAS_PER_KEY_DAILY_CAP", "0.2")!),
          dailyCap: parseEther(env("GAS_DAILY_CAP", "2")!),
          walletLow: parseEther(env("GAS_WALLET_LOW", "0.5")!),
        },
        log,
      )
    : null;
  if (!gas) log.warn("GAS_WALLET_PRIVATE_KEY is not set: traders fund their Hoax key themselves (Send it for gas when linking)");

  const builder = env("HOAX_BUILDER_ADDRESS");
  const watcher = new Watcher({
    venue,
    store,
    keys,
    gas,
    log,
    tickMs: Number(env("TICK_MS", "1000")),
    service: `watcher-${network.key}`,
    engine: {
      ...DEFAULT_ENGINE_CONFIG,
      builder: builder ? getAddress(builder) : null,
      builderFeeBpsTimes1k: BigInt(env("HOAX_BUILDER_FEE_BPS_1K", "0")!),
      dryRun: env("DRY_RUN", "false") === "true",
    },
  });

  const port = Number(env("PORT", "8080"));
  const server = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(
        JSON.stringify({
          ok: true,
          gasWallet: gas?.address ?? null,
          gasBalance: gas?.walletBalance == null ? null : formatEther(gas.walletBalance),
          gasLow: gas?.walletLow ?? false,
          ...watcher.status,
        }),
      );
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => log.info(`health endpoint on :${port}/healthz`));

  watcher.start();

  const shutdown = async (signal: string) => {
    log.info(`${signal}: stopping`);
    await watcher.stop();
    server.close();
    await venue.close();
    await store.close();
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
