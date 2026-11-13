"use client";
import { useState } from "react";

export function CopyButton({ text, label = "Copy", ghost = false, sm = false }: { text: string; label?: string; ghost?: boolean; sm?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className={`btn${ghost ? " ghost" : ""}${sm ? " sm" : ""} db-copy`}
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text.startsWith("/") ? `${location.origin}${text}` : text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {}
      }}
    >
      <svg
        className="arrow"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        {done ? <path d="M3 8.5l3.2 3L13 4.5" /> : <path d="M5.5 5.5V3h7.5v7.5h-2.5M3 5.5h7.5V13H3z" />}
      </svg>
      <span>{done ? "Copied" : label}</span>
    </button>
  );
}
