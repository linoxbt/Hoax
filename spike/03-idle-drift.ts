// Spike 3 (read-only): does the watcher see health move on an idle position
// within 2 s of a mark move? Polls one account's health and the mark every
// 250 ms, and counts funding updates in the window.
//   [OWNER_ADDRESS=0x…] DURATION_S=120 npm run spike -- 03-idle-drift
import { HIDEKI } from "@hoax/chain";
import { marginBankEventsAbi, perpPoolEventsAbi } from "@somnia-chain/markets-sdk";
import { getAddress, type Address } from "viem";
import { Evidence, market, publicClient, sleep, venue } from "./lib.ts";

const ev = new Evidence("03-idle-drift");
const m = await market(process.env.MARKET ?? "BTC-PERP");

async function findAccount(): Promise<Address | null> {
  let head = await publicClient.getBlockNumber();
  for (let i = 0; i < 40; i++) {
    const logs = await publicClient.getContractEvents({ address: m.marginBank, abi: marginBankEventsAbi, eventName: "PositionUpdated", fromBlock: head - 999n, toBlock: head });
    head -= 1000n;
    for (const l of logs.reverse()) {
      const a = l.args as { account: Address; perpPool: Address; newSize: bigint };
      if (a.newSize === 0n || a.perpPool.toLowerCase() !== m.pool.toLowerCase()) continue;
      if ((await venue.readPosition(m, a.account)).size !== 0n) return getAddress(a.account);
    }
  }
  return null;
}

const owner = process.env.OWNER_ADDRESS ? getAddress(process.env.OWNER_ADDRESS) : await findAccount();
if (!owner) {
  await ev.finish({ pass: null, summary: `no account with an open ${m.symbol} position found; set OWNER_ADDRESS` });
  process.exit(2);
}
ev.log("watching", { owner, market: m.symbol, chain: HIDEKI.chain.id });

const durationMs = Number(process.env.DURATION_S ?? "120") * 1000;
const startBlock = await publicClient.getBlockNumber();
const end = Date.now() + durationMs;
let lastMark: bigint | null = null;
let lastHealth: number | null = null;
let pendingMarkAt: number | null = null;
const delays: number[] = [];
let markMoves = 0;
let healthMoves = 0;
let reads = 0;
while (Date.now() < end) {
  const t = Date.now();
  const [feed, margin] = await Promise.all([venue.readFeed(m), venue.readMargin(m.marginBank, owner)]);
  reads++;
  const h = margin.mmReq > 0n ? Number(margin.equity) / Number(margin.mmReq) : null;
  if (lastMark !== null && feed.markPrice !== lastMark) {
    markMoves++;
    pendingMarkAt ??= t;
  }
  if (lastHealth !== null && h !== lastHealth) {
    healthMoves++;
    if (pendingMarkAt !== null) {
      delays.push(Date.now() - pendingMarkAt);
      pendingMarkAt = null;
    }
  }
  lastMark = feed.markPrice;
  lastHealth = h;
  await sleep(Math.max(0, 250 - (Date.now() - t)));
}
const endBlock = await publicClient.getBlockNumber();

// Funding settlements in the window, read in 1000-block windows.
let fundingUpdates = 0;
for (let from = startBlock; from <= endBlock; from += 1000n) {
  const to = from + 999n < endBlock ? from + 999n : endBlock;
  const logs = await publicClient.getContractEvents({ address: m.pool, abi: perpPoolEventsAbi, eventName: "FundingUpdated", fromBlock: from, toBlock: to });
  fundingUpdates += logs.length;
}

delays.sort((a, b) => a - b);
const median = delays.length ? delays[Math.floor(delays.length / 2)] : null;
const within2s = delays.filter((d) => d <= 2000).length;
ev.log("result", { reads, markMoves, healthMoves, delaysMs: delays, fundingUpdates, blocks: [startBlock, endBlock] });
await ev.finish({
  pass: delays.length > 0 ? within2s / delays.length >= 0.95 : null,
  summary:
    `${reads} reads over ${durationMs / 1000} s: ${markMoves} mark moves, ${healthMoves} health moves, ` +
    `median mark-to-health delay ${median ?? "n/a"} ms, ${within2s}/${delays.length} within 2 s; ${fundingUpdates} FundingUpdated events`,
});
process.exit(0);
