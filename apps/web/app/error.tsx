"use client";
// Any page that fails on the server (the database or the chain unreachable)
// lands here instead of a bare 500.
import Link from "next/link";
import { useEffect } from "react";

export default function PageError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <section className="sec first phead">
      <div className="phead-title">
        <h1 className="h1">Something is unreachable</h1>
      </div>
      <div className="phead-side">
        <div className="p">
          <p className="txt">
            This page could not load its data just now. Protection does not run in this site: the engine keeps watching your positions either way.
          </p>
          <div className="row" style={{ marginTop: "2.4rem" }}>
            <button className="pill" onClick={reset}>
              Try again
            </button>
            <Link href="/" className="pill ghost">
              Home
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
