"use client";
import Link from "next/link";
import { useEffect } from "react";
import { Label } from "@/components/Ui";

/** Any page that throws while rendering lands here, inside the normal header and footer. */
export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => console.error(error), [error]);
  return (
    <section className="sec first">
      <div className="pad" style={{ minHeight: "60vh", paddingTop: "6.4rem" }}>
        <Label dot>Error</Label>
        <h1 className="h3" style={{ marginTop: "1.6rem" }}>This page hit a problem</h1>
        <p className="txt ink" style={{ marginTop: "2.4rem", maxWidth: "62rem" }}>
          Nothing was sent from your wallet. Try again; if it keeps happening, the chain or the engine may be unreachable for a moment.
          {error.digest && <span className="mono soft"> Reference {error.digest}.</span>}
        </p>
        <div className="row" style={{ marginTop: "3.2rem" }}>
          <button className="pill" onClick={reset}>
            Try again
          </button>
          <Link href="/" className="pill ghost">
            Home
          </Link>
        </div>
      </div>
    </section>
  );
}
