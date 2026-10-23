// Apply every migration in order. Each file is idempotent (IF NOT EXISTS), so
// running this twice is safe. An advisory lock serialises processes that start
// together (one watcher per network), since concurrent CREATEs can collide.
import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { pgConfig } from "./connection.ts";

export async function migrate(connectionString: string): Promise<string[]> {
  const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const client = new pg.Client(pgConfig(connectionString));
  await client.connect();
  try {
    await client.query("SELECT pg_advisory_lock(4884)");
    for (const f of files) await client.query(readFileSync(join(dir, f), "utf8"));
  } finally {
    await client.end(); // releases the lock with the session
  }
  return files;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set");
    process.exit(1);
  }
  migrate(url).then(
    (files) => console.log(`applied ${files.join(", ")}`),
    (err) => {
      console.error(err);
      process.exit(1);
    },
  );
}
