import { getAddress } from "viem";
import { accountsClient } from "@/lib/auth";
import { error, getMarkets, getVenue, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

/**
 * A wallet's dreamDEX trading accounts (the Safes the account factory derives
 * from it) and a live margin summary of the primary one. Public chain data.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return error(400, "address must be a 0x address");
  const wallet = getAddress(address);
  const accounts = accountsClient();
  try {
    const [slots, walletBalance] = await Promise.all([accounts.tradingAccounts(wallet), accounts.balance(wallet)]);
    const primary = slots.find((s) => s.deployed) ?? null;
    let margin: { equity: bigint; mmReq: bigint; health: number | null; positions: number } | null = null;
    let marginError: string | null = null;
    const venue = getVenue();
    if (primary && venue) {
      // The account list stands on its own; a failed margin read (a stale feed, say) only blanks the summary.
      try {
        const markets = await getMarkets();
        if (markets[0]) {
          const m = await venue.readMargin(markets[0].marginBank, primary.address);
          margin = {
            equity: m.equity,
            mmReq: m.mmReq,
            health: m.mmReq > 0n ? Number(m.equity) / Number(m.mmReq) : null,
            positions: m.activePools.length,
          };
        }
      } catch (err) {
        marginError = String(err).slice(0, 160);
      }
    }
    return json({ wallet, walletBalance, accounts: slots, primary: primary?.address ?? null, margin, marginError });
  } catch (err) {
    return error(502, `could not read the chain: ${String(err).slice(0, 160)}`);
  }
}
