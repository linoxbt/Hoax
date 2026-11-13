"use client";
import { AppHead } from "@/components/AppHead";
import { useApp } from "@/lib/appContext";
import { ago } from "@/lib/format";

export default function Alerts() {
  const { view } = useApp();
  const n = view?.alerts.length ?? 0;
  return (
    <>
      <AppHead kicker={`Alerts / ${view ? n : "–"}`} title="Alerts" />
      {view && view.isOwner === false && (
        <p className="note db-gap">Alerts are shown to the wallet that owns this account. Verify your wallet to see them.</p>
      )}
      {view && view.alerts.length === 0 && view.isOwner && (
        <div className="panel db-quiet">
          <div className="panel-in">
            <div className="h5 ink">No alerts.</div>
          </div>
        </div>
      )}
      {view && view.alerts.length > 0 && (
        <section className="card db-alerts">
          {view.alerts.map((a) => (
            <div className="db-alert" key={a.id}>
              <div className="db-alert-k">
                <span className="tag pending">{a.kind}</span>
                <span className="mono-xs soft">{ago(a.createdAt)}</span>
              </div>
              <p className="ink">{a.message}</p>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
