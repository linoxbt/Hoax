// Spike 5: median time from health crossing the trigger to the close landing,
// on the off-chain path, measured from the watcher's own records. Read-only.
//   DATABASE_URL=postgres://… npm run spike -- 05-latency
import pg from "pg";
import { Evidence, need } from "./lib.ts";

const ev = new Evidence("05-latency");
const db = new pg.Client({ connectionString: need("DATABASE_URL") });
await db.connect();
// For each close Hoax sent, the first health reading at or under the policy
// trigger in the two minutes before it.
const { rows } = await db.query(`
  SELECT a.id, a.tx_hash, a.created_at AS closed_at,
         (SELECT min(t.created_at) FROM health_ticks t
           WHERE t.account_id = a.account_id AND t.market = a.market
             AND t.created_at BETWEEN a.created_at - interval '2 minutes' AND a.created_at
             AND t.health <= p.trigger_health) AS crossed_at
  FROM actions a JOIN policies p ON p.account_id = a.account_id AND p.market = a.market
  WHERE a.tx_hash IS NOT NULL
  ORDER BY a.created_at DESC LIMIT 200`);
await db.end();
const ms = rows
  .filter((r) => r.crossed_at)
  .map((r) => new Date(r.closed_at).getTime() - new Date(r.crossed_at).getTime())
  .sort((x, y) => x - y);
for (const r of rows) ev.log("close", { id: r.id, tx: r.tx_hash, crossedAt: r.crossed_at, closedAt: r.closed_at });
const median = ms.length ? ms[Math.floor(ms.length / 2)] : null;
const p90 = ms.length ? ms[Math.floor(ms.length * 0.9)] : null;
await ev.finish({
  pass: ms.length > 0 ? true : null,
  summary: ms.length ? `median ${median} ms, p90 ${p90} ms over ${ms.length} closes (trigger read to receipt written)` : "no closes recorded yet",
  medianMs: median,
  p90Ms: p90,
});
process.exit(0);
