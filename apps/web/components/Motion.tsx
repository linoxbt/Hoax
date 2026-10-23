"use client";
// The motion layer: inertial scrolling, headings that rise in line by line,
// blocks that fade up, rules that draw, a square cursor, and the first-visit
// loader. Everything respects prefers-reduced-motion.
import Lenis from "lenis";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

function useReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches), []);
  return reduced;
}

export function Motion() {
  const path = usePathname();
  const reduced = useReducedMotion();
  const cursor = useRef<HTMLDivElement>(null);

  // Inertial scroll, as one continuous drawing being panned.
  useEffect(() => {
    if (reduced) return;
    const lenis = new Lenis({ duration: 1.1, smoothWheel: true });
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
      { rootMargin: "0px 0px -6% 0px", threshold: 0.05 },
    );
    const scan = () => document.querySelectorAll("[data-reveal]:not(.in),[data-split]:not(.in),[data-draw]:not(.in)").forEach((el) => io.observe(el));
    scan();
    const mo = new MutationObserver(scan);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      io.disconnect();
      mo.disconnect();
    };
  }, [path]);

  // The cursor: a small orange square that trails the pointer.
  useEffect(() => {
    if (reduced || !window.matchMedia("(pointer: fine)").matches) return;
    let x = -100;
    let y = -100;
    let cx = x;
    let cy = y;
    let raf = 0;
    const move = (e: PointerEvent) => {
      x = e.clientX;
      y = e.clientY;
    };
    const tick = () => {
      cx += (x - cx) * 0.25;
      cy += (y - cy) * 0.25;
      if (cursor.current) cursor.current.style.transform = `translate(${cx - 3}px, ${cy - 3}px)`;
      raf = requestAnimationFrame(tick);
    };
    window.addEventListener("pointermove", move);
    raf = requestAnimationFrame(tick);
    return () => {
      window.removeEventListener("pointermove", move);
      cancelAnimationFrame(raf);
    };
  }, [reduced]);

  return (
    <>
      <div className="frame" aria-hidden />
      <div className="cursor" ref={cursor} aria-hidden style={{ transform: "translate(-100px,-100px)" }} />
      <Loader />
    </>
  );
}

/** Once per session: a progress rule across the frame with the pointer's coordinates. */
function Loader() {
  const [pct, setPct] = useState(0);
  const [done, setDone] = useState(true);
  const [xy, setXy] = useState({ x: 0, y: 0 });

  useEffect(() => {
    let seen = true;
    try {
      seen = sessionStorage.getItem("hoax.loaded") === "1";
      sessionStorage.setItem("hoax.loaded", "1");
    } catch {}
    if (seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setDone(false);
    setXy({ x: Math.round(window.innerWidth / 2), y: Math.round(window.innerHeight / 2) });
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / 1400);
      const eased = 1 - Math.pow(1 - k, 3);
      setPct(Math.round(eased * 100));
      if (k < 1) raf = requestAnimationFrame(tick);
      else setTimeout(() => setDone(true), 250);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div className={`loader${done ? " done" : ""}`} aria-hidden>
      <div className="loader-line">
        <i style={{ ["--p" as string]: `${pct}%` }} />
      </div>
      <div className="loader-pct">{pct}%</div>
      <span className="loader-plus" style={{ left: "50%", top: "50%" }} />
      <div className="loader-xy" style={{ left: "calc(50% + 1.2rem)", top: "calc(50% - 3.6rem)" }}>
        X:{xy.x}PX
        <br />
        Y:{xy.y}PX
      </div>
      <div className="loader-foot">
        <div className="h4" style={{ maxWidth: "40rem" }}>
          Liquidation protection for dreamDEX perps
        </div>
        <div className="mono-s soft" style={{ textAlign: "right" }}>
          Hoax · Somnia Hideki
          <br />
          Loading the drawing
        </div>
      </div>
    </div>
  );
}
