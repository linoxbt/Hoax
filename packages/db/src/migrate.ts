// Apply every migration not yet recorded in schema_migrations, in order. Each
// file is still written to be idempotent (IF NOT EXISTS), because databases
// from before the table existed run every file once more on their first start.
// An advisory lock serialises processes that start together (one watcher per
// network), since concurrent CREATEs can collide. Each file runs in a
// transaction with its record, so a failed file leaves nothing half applied.
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
    await client.query("CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TIMESTAMPTZ NOT NULL DEFAULT now())");
    const done = new Set((await client.query("SELECT name FROM schema_migrations")).rows.map((r) => String(r.name)));
    for (const f of files) {
      if (done.has(f)) continue;
      await client.query("BEGIN");
      try {
        await client.query(readFileSync(join(dir, f), "utf8"));
        await client.query("INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT DO NOTHING", [f]);
        await client.query("COMMIT");
      } catch (err) {
        await client.query("ROLLBACK");
        throw new Error(`migration ${f} failed: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
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
