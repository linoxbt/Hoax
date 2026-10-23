"use client";
import { AppHead } from "@/components/AppHead";
import { useApp } from "@/lib/appContext";
import { ago } from "@/lib/format";

export default function Alerts() {
  const { view } = useApp();
  return (
    <>
      <AppHead kicker="Alerts" title="What Hoax told you" />
      <div className="wrap pad-s">
        {view && view.isOwner === false && <p className="note">Alerts are only shown with a valid manage token.</p>}
        {view && view.alerts.length === 0 && view.isOwner && <p className="copy soft">No alerts. Hoax writes one when it skips a close, misses a save, pauses, or runs low on gas.</p>}
        {view && view.alerts.length > 0 && (
          <div className="rows">
            {view.alerts.map((a) => (
              <div className="r text" key={a.id}>
                <span>
                  <span className="tag pending" style={{ marginRight: 10 }}>
                    {a.kind}
                  </span>
                  {ago(a.createdAt)}
                </span>
                <span>{a.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
