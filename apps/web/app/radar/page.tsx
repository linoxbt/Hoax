import { PageHead } from "@/components/Kicker";
import { RadarLive } from "@/components/RadarLive";
import { RADAR_CHAINS, radarSignals } from "@/lib/radar";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Radar",
  description: "Every liquidation on dreamDEX perps, live, and what each one cost: read from the markets indexer and priced with the protocol's own rates.",
};

export default async function RadarPage() {
  const initial = await radarSignals([...RADAR_CHAINS])
    .then(({ day, signals }) => ({ ...day, signals }))
    .catch((err) => {
      console.error("radar unavailable:", err instanceof Error ? err.message : String(err));
      return null;
    });
  return (
    <>
      <PageHead
        split
        kicker="Radar / live"
        title="Every liquidation on dreamDEX, as it happens."
        sub={
          <>
            Read straight from dreamDEX&apos;s markets indexer on Somnia Tokyo and Shannon, and priced with the protocol&apos;s own rates: the size the
            engine closed, the price it got, and the <b>penalty and forced spread</b> the trader paid for it.
          </>
        }
      />
      <RadarLive initial={initial} />
    </>
  );
}
