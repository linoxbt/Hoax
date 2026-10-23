"use client";
// A statement whose words light up one by one as it scrolls through the viewport.
import { useEffect, useRef, useState } from "react";

export function ScrollText({ text, accent = [] }: { text: string; accent?: string[] }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  const [lit, setLit] = useState(words.length);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const k = Math.min(1, Math.max(0, (vh * 0.85 - r.top) / (r.height + vh * 0.35)));
      setLit(Math.round(k * words.length));
    };
    update();
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [words.length]);
  return (
    <p ref={ref} className="quote">
      {words.map((w, i) => (
        <span key={i} className={`w${i < lit ? " lit" : ""}${accent.includes(w.replace(/[^\w]/g, "")) ? " accent" : ""}`}>
          {w}{" "}
        </span>
      ))}
    </p>
  );
}
