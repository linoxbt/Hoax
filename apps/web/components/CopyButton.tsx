"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy", ghost = false }: { text: string; label?: string; ghost?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`pill${ghost ? " ghost" : ""}`}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.startsWith("/") ? `${location.origin}${text}` : text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      {done ? "Copied" : label}
    </button>
  );
}
