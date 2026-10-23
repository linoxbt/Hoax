"use client";
// A statement whose words go from pencil grey to ink as it scrolls through.
import { useEffect, useRef, useState } from "react";

export function ScrollText({ text, className = "h3", as: Tag = "p" }: { text: string; className?: string; as?: "p" | "h2" }) {
  const ref = useRef<HTMLParagraphElement>(null);
  const words = text.split(" ");
  const [lit, setLit] = useState(words.length);
  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      const vh = window.innerHeight;
      const k = Math.min(1, Math.max(0, (vh * 0.8 - r.top) / (r.height + vh * 0.3)));
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
    <Tag ref={ref} className={`${className} scrolltext`}>
      {words.map((w, i) => (
        <span key={i} className={`wd${i < lit ? " lit" : ""}`}>
          {w}{" "}
        </span>
      ))}
    </Tag>
  );
}
