"use client";
import { useEffect } from "react";
import { Btn, Eyebrow } from "@/components/Ui";

/** Any page that throws while rendering lands here, inside the normal header and footer. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section className="pg-center-wrap">
      <div className="card pg-center">
        <Eyebrow>Error / Something went wrong</Eyebrow>
        <h1 className="h2">This page hit a problem</h1>
        <p className="txt">
          Nothing was sent from your wallet, and protection does not run in this site: the engine keeps watching your positions either way. Try again;
          if it keeps happening, the chain or the database may be unreachable for a moment.
        </p>
        {error.digest && <p className="pg-center-ref">Reference {error.digest}</p>}
        <div className="pg-center-act">
          <Btn onClick={reset} fill arrow={false}>
            Try again
          </Btn>
          <Btn href="/">Home</Btn>
        </div>
      </div>
    </section>
  );
}
