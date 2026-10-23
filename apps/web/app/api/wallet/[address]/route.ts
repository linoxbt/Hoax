import { NETWORKS, ownedAccounts } from "@hoax/chain";
import { getAddress, type Address } from "viem";
import { accountsClient } from "@/lib/auth";
import { error, getVenue, isAddress, json } from "@/lib/server";

export const dynamic = "force-dynamic";

interface Found {
  chainId: number;
  network: string;
  networkName: string;
  address: Address;
  /** "owner": the indexer lists the wallet as an owner. "derived": the factory account of the wallet itself. */
  via: "owner" | "derived";
  equity: bigint | null;
  mmReq: bigint | null;
  health: number | null;
  positions: number;
  marginError: string | null;
}

/**
 * A wallet's dreamDEX trading accounts on every network Hoax reads, with a
 * live margin summary of each, and the one to show first. Public chain data.
 *
 * Two lookups, because neither covers everything: the accounts indexer knows
 * every account the wallet owns, however it was derived (the dreamDEX app
 * derives from a session key and adds the wallet as owner), but can lag the
 * chain by hours; the factory derivation from the wallet itself is instant but
 * only finds older accounts.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ address: string }> }) {
  const { address } = await params;
  if (!isAddress(address)) return error(400, "address must be a 0x address");
  const wallet = getAddress(address);
  try {
    const [owned, derived, balances] = await Promise.all([
      ownedAccounts(
        wallet,
        NETWORKS.map((n) => n.id),
      ),
      Promise.all(NETWORKS.map((n) => accountsClient(n.id).tradingAccounts(wallet).catch(() => []))),
      Promise.all(NETWORKS.map((n) => accountsClient(n.id).balance(wallet).catch(() => null))),
    ]);

    const seen = new Set<string>();
    const found: Array<{ chainId: number; address: Address; via: Found["via"] }> = [];
    const add = (chainId: number, a: Address, via: Found["via"]) => {
      const k = `${chainId}:${a.toLowerCase()}`;
      if (!seen.has(k)) seen.add(k), found.push({ chainId, address: a, via });
    };
    for (const o of owned ?? []) if (NETWORKS.some((n) => n.id === o.chainId)) add(o.chainId, o.address, "owner");
    NETWORKS.forEach((n, i) => derived[i].filter((s) => s.deployed).forEach((s) => add(n.id, s.address, "derived")));

    const accounts: Found[] = await Promise.all(
      found.map(async (f) => {
        const network = NETWORKS.find((n) => n.id === f.chainId)!;
        const base = { ...f, network: network.key, networkName: network.name };
        const venue = getVenue(f.chainId);
        const bank = network.addresses.marginBank;
        if (!venue || !bank) return { ...base, equity: null, mmReq: null, health: null, positions: 0, marginError: null };
        try {
          const m = await venue.readMargin(bank, f.address);
          return { ...base, equity: m.equity, mmReq: m.mmReq, health: m.mmReq > 0n ? Number(m.equity) / Number(m.mmReq) : null, positions: m.activePools.length, marginError: null };
        } catch (err) {
          // A failed margin read (a stale feed, say) blanks this account's summary, not the list.
          return { ...base, equity: null, mmReq: null, health: null, positions: 0, marginError: String(err).slice(0, 160) };
        }
      }),
    );

    // Open positions first, then the most equity, then network order.
    const order = (a: Found) => NETWORKS.findIndex((n) => n.id === a.chainId);
    accounts.sort((a, b) => b.positions - a.positions || Number((b.equity ?? 0n) - (a.equity ?? 0n)) || order(a) - order(b));
    const primary = accounts[0] ?? null;

    return json({
      wallet,
      walletBalance: balances[NETWORKS.findIndex((n) => n.key === "hideki")],
      balances: Object.fromEntries(NETWORKS.map((n, i) => [n.id, balances[i]])),
      accounts,
      primary: primary?.address ?? null,
      primaryChain: primary?.chainId ?? null,
      margin: primary && primary.equity !== null ? { equity: primary.equity, mmReq: primary.mmReq, health: primary.health, positions: primary.positions } : null,
      marginError: primary?.marginError ?? null,
      /** False when the accounts indexer did not answer: only accounts derived from the wallet were checked. */
      indexed: owned !== null,
    });
  } catch (err) {
    return error(502, `could not read the chain: ${String(err).slice(0, 160)}`);
  }
}
