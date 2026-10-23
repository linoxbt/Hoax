"use client";
// The bottom-right notice: this deployment has no protection engine running,
// so receipts and stats are sample data. Dismissed once per browser.
import { useEffect, useState } from "react";

export function Notice() {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    try {
      setOpen(localStorage.getItem("hoax.notice") !== "1");
    } catch {
      setOpen(true);
    }
  }, []);
  if (!open) return null;
  const close = () => {
    try {
      localStorage.setItem("hoax.notice", "1");
    } catch {}
    setOpen(false);
  };
  return (
    <div className="notice" role="status">
      <p>
        Engine offline: receipts and stats are sample data. Markets and wallets are live.{" "}
        <a href="/security" className="mono-s accent">
          Learn more
        </a>
      </p>
      <div className="notice-act">
        <button className="pill" onClick={close}>
          Got it
        </button>
      </div>
    </div>
  );
}
