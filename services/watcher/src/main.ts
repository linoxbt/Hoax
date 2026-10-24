// The watcher process: reads its configuration from the environment, connects
// to Postgres and one Somnia network, and runs until stopped. NETWORK picks it:
// hideki (default) or shannon. Run one process per network against the same
// database and keystore; each protects only its own network's accounts. A
// lease in Postgres makes sure only one process per network ever trades: a
// second one (an overlapping redeploy, a NETWORK left unset) exits.

import { createServer } from "node:http";
import { DreamDexVenue, NETWORKS } from "@hoax/chain";
import { MemoryStore, PgStore, migrate, type Store } from "@hoax/db";
import { getAddress, parseEther, type Hex } from "viem";
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
  } else if (env("HOAX_ALLOW_MEMORY_STORE") === "1") {
    log.warn("DATABASE_URL is not set: using an in-memory store, nothing survives a restart (HOAX_ALLOW_MEMORY_STORE=1)");
    store = new MemoryStore();
  } else {
    throw new Error("DATABASE_URL is required (set HOAX_ALLOW_MEMORY_STORE=1 to run without one, for development only)");
  }

  const secret = env("HOAX_KEYSTORE_SECRET");
  if (!secret) throw new Error("HOAX_KEYSTORE_SECRET is required: it encrypts the per-account Hoax keys");
  const keys = new FileKeystore(env("KEYSTORE_DIR", "./keystore")!, secret);

  const networkKey = env("NETWORK", "hideki")!;
  const network = NETWORKS.find((n) => n.key === networkKey);
  if (!network) throw new Error(`NETWORK must be one of ${NETWORKS.map((n) => n.key).join(", ")}`);
  if (!(await store.acquireLease(`engine:${network.id}`))) {
    throw new Error(`another Hoax engine already holds the ${network.key} lease; exiting so only one trades`);
  }
  const rpcTimeoutMs = env("RPC_TIMEOUT_MS") ? Number(env("RPC_TIMEOUT_MS")) : undefined;
  const venue = new DreamDexVenue({ network, rpcUrl: env("RPC_URL"), wsUrl: env("WS_URL"), indexerUrl: env("INDEXER_URL"), rpcTimeoutMs });

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
          minGapMs: 5 * 60_000,
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
      feedCacheMs: Number(env("FEED_CACHE_MS", "250")),
    },
  });

  const port = Number(env("PORT", "8080"));
  const server = createServer((req, res) => {
    if (req.url === "/healthz" || req.url === "/") {
      const h = watcher.health();
      if (store instanceof PgStore && !store.leaseHeld) h.problems.push("the engine lease was lost");
      const ok = h.problems.length === 0;
      res.writeHead(ok ? 200 : 503, { "content-type": "application/json" });
      // Served on 127.0.0.1 by docker-compose; the gas wallet's address is public on chain anyway.
      res.end(JSON.stringify({ ok, problems: h.problems, network: network.key, gasWallet: gas?.address ?? null, ...watcher.status }));
      return;
    }
    res.writeHead(404).end();
  });
  server.listen(port, () => log.info(`health endpoint on :${port}/healthz`));

  watcher.start();

  // The lease is a database session: if that connection drops, another engine
  // may take over, so this one must stop trading.
  const leaseCheck = setInterval(() => {
    if (store instanceof PgStore && !store.leaseHeld) {
      log.error("lost the engine lease; stopping");
      void shutdown("lease lost", 1);
    }
  }, 5_000);

  // Docker restarts a process that exits, not one that hangs: if the engine
  // stays unhealthy (the clock stopped, ticks not finishing, the database gone)
  // for two minutes, exit so the supervisor starts a fresh one.
  const UNHEALTHY_EXIT_MS = Number(env("UNHEALTHY_EXIT_MS", "120000"));
  let unhealthySince: number | null = null;
  const watchdog = setInterval(() => {
    const h = watcher.health();
    if (h.ok) {
      unhealthySince = null;
      return;
    }
    unhealthySince ??= Date.now();
    if (Date.now() - unhealthySince >= UNHEALTHY_EXIT_MS) {
      log.error("unhealthy for too long; exiting for a restart", { problems: h.problems.join("; ") });
      void shutdown("watchdog", 1);
    }
  }, 15_000);

  let stopping = false;
  const shutdown = async (signal: string, code = 0) => {
    if (stopping) return;
    stopping = true;
    log.info(`${signal}: stopping, waiting for ticks in flight`);
    clearInterval(leaseCheck);
    clearInterval(watchdog);
    await watcher.stop();
    server.close();
    await venue.close().catch(() => {});
    await store.close().catch(() => {});
    process.exit(code);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

// A stray rejection is logged, never fatal: crashing mid-close is worse than a missed alert.
process.on("unhandledRejection", (err) => {
  log.error("unhandled rejection", { error: err instanceof Error ? err.message : String(err) });
});

main().catch((err) => {
  log.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
