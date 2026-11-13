"use client";
// The motion layer: inertial scrolling, headings that rise in line by line,
// blocks that fade up, rules that draw, and the first-visit loader. Everything respects prefers-reduced-motion.
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return reduced;
}

export function Motion() {
  const path = usePathname();
  const reduced = useReducedMotion();

  // Inertial scroll, as one continuous drawing being panned.
  useEffect(() => {
    if (reduced) return;
    // A light lerp keeps the glide but answers the wheel at once; touch stays native.
    const lenis = new Lenis({ lerp: 0.14, smoothWheel: true, anchors: true });
    let raf = 0;
    const loop = (t: number) => {
      lenis.raf(t);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    (window as unknown as { __lenis?: Lenis }).__lenis = lenis;
    return () => {
      cancelAnimationFrame(raf);
      lenis.destroy();
    };
  }, [reduced]);

  // Back to the top of each new page.
  useEffect(() => {
    const l = (window as unknown as { __lenis?: Lenis }).__lenis;
    if (l) l.scrollTo(0, { immediate: true });
    else window.scrollTo(0, 0);
  }, [path]);

  // Reveals for anything marked data-reveal, data-split or data-draw.
  useEffect(() => {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add("in");
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: "0px 0px -4% 0px", threshold: 0.01 },
    );
    const scan = () => document.querySelectorAll("[data-reveal]:not(.in),[data-split]:not(.in),[data-draw]:not(.in)").forEach((el) => io.observe(el));
    scan();
    // Live data re-renders often; batch rescans to one per frame.
    let pending = 0;
    const mo = new MutationObserver(() => {
      if (!pending) pending = requestAnimationFrame(() => ((pending = 0), scan()));
    });
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
      cancelAnimationFrame(pending);
    };
  }, [path]);

  return (
    <>
      <Loader />
    </>
  );
}

/** Once per session: the mark and a short progress bar while the page settles. */
function Loader() {
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(true);

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem("hoax.loaded") === "1";
      sessionStorage.setItem("hoax.loaded", "1");
    } catch {}
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDone(false);
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 700);
      setPct(Math.round((1 - Math.pow(1 - k, 3)) * 100));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setDone(true), 120);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`loader${done ? " done" : ""}`} aria-hidden>
      <Logo size={40} />
      <div className="loader-line">
        <i style={{ ["--p" as string]: `${pct}%` }} />
      </div>
    </div>
  );
}
