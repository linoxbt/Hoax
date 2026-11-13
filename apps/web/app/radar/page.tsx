import { RadarLive } from "@/components/RadarLive";
import { Label, Split } from "@/components/Ui";
import { RADAR_CHAINS, radarSnapshot } from "@/lib/radar";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Radar",
  description: "Every liquidation on dreamDEX perps, live, and what each one cost: read from the markets indexer and priced with the protocol's own rates.",
};

export default async function RadarPage() {
  const initial = await radarSnapshot([...RADAR_CHAINS], 24).catch((err) => {
    console.error("radar unavailable:", err instanceof Error ? err.message : String(err));
    return null;
  });
  return (
    <>
      <section className="phead">
        <div className="phead-title">
          <Label dot>Radar · live</Label>
          <Split as="h1" className="h1">
            Every liquidation on dreamDEX, as it happens.
          </Split>
        </div>
        <div className="phead-side">
          <div className="txt" data-reveal>
            Read straight from dreamDEX&apos;s markets indexer on Somnia Tokyo and Shannon, and priced with the protocol&apos;s own rates: the size the engine
            closed, the price it got, and the <b>penalty and forced spread</b> the trader paid for it.
          </div>
        </div>
      </section>
      <RadarLive initial={initial} />
    </>
  );
}
