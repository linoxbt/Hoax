"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { Arrow, Roll } from "./Ui";
import { useHoax } from "@/lib/wallet";
import { WalletButton } from "./WalletButton";

const NAV = [
  ["/how-it-works", "Product"],
  ["/markets", "Markets"],
  ["/security", "Security"],
  ["/stats", "Track record"],
] as const;

const MENU = [
  ["/", "Home"],
  ["/how-it-works", "How it works"],
  ["/markets", "Markets"],
  ["/security", "Security"],
  ["/stats", "Track record"],
  ["/replay", "Replay"],
  ["/app", "Dashboard"],
  ["/start", "Get protected"],
] as const;

// Pages about one wallet's account: listed only once a wallet is connected.
const WALLET_ONLY = new Set<string>(["/app"]);

export function Header() {
  const path = usePathname();
  const { wallet } = useHoax();
  const menu = MENU.filter(([href]) => wallet || !WALLET_ONLY.has(href));
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const last = useRef(0);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Hide on the way down, return on the way up, like a drawing being scrolled.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (Math.abs(y - last.current) < 6) return;
      setHidden(y > last.current && y > 120);
      last.current = y;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <>
      <header className={`header${hidden && !open ? " hide" : ""}${open ? " menu-open" : ""}`}>
        <div className="header-in">
          <div className="header-logo">
            <Link href="/" aria-label="Hoax home">
              <Logo />
            </Link>
          </div>
          <nav className="header-nav" aria-label="Primary">
            {NAV.map(([href, label]) => (
              <Link key={href} href={href} className={`hcell${on(href) ? " on" : ""}`}>
                <Roll>{label}</Roll>
                <span className="corner" aria-hidden />
              </Link>
            ))}
            <div className="hcell wide keep wallet-slot">
              <WalletButton />
            </div>
            <Link href="/start" className="hcell cta">
              <Roll>Get protected</Roll>
              <Arrow />
            </Link>
            <button className="hcell hmenu-btn keep" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
              <Roll>{open ? "Close" : "Menu"}</Roll>
              <span className="burger-lines" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </button>
          </nav>
        </div>
      </header>

      <div className={`menu${open ? " open" : ""}`} aria-hidden={!open}>
        <nav className="menu-list">
          {menu.map(([href, label], i) => (
            <Link key={href} href={href} className={on(href) ? "on" : undefined} style={{ ["--i" as string]: i }} tabIndex={open ? 0 : -1}>
              {label}
              <span className="mono-s">[{String(i + 1).padStart(2, "0")}]</span>
            </Link>
          ))}
        </nav>
        <div className="menu-foot">
          <div>
            <div className="mono-s soft">Wallet</div>
            <div style={{ height: "4.8rem", marginTop: "0.8rem", border: "var(--b) solid var(--line)" }}>
              <WalletButton />
            </div>
          </div>
          <div>
            <div className="mono-s soft">Network</div>
            <p className="txt ink" style={{ marginTop: "0.8rem" }}>
              dreamDEX perps · Somnia Hideki
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
