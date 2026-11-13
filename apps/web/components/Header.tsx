"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Logo } from "./Logo";
import { useHoax } from "@/lib/wallet";
import { Arrow } from "./Ui";
import { WalletButton } from "./WalletButton";

const NAV = [
  ["/radar", "Radar"],
  ["/markets", "Markets"],
  ["/how-it-works", "Method"],
  ["/stats", "Track record"],
  ["/security", "Security"],
] as const;

const MENU = [
  ["/", "Home"],
  ["/radar", "Radar · live"],
  ["/how-it-works", "Method"],
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
  const nav = wallet ? [...NAV.slice(0, 4), ["/app", "Dashboard"] as const] : NAV;
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const last = useRef(0);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Hide on the way down, return on the way up; a hairline appears once the page has moved.
  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      setScrolled(y > 8);
      if (Math.abs(y - last.current) < 6) return;
      setHidden(y > last.current && y > 160);
      last.current = y;
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <>
      <header className={`header${hidden && !open ? " hide" : ""}${scrolled || open ? " scrolled" : ""}${open ? " menu-open" : ""}`}>
        <div className="header-in">
          <div className="header-logo">
            <Link href="/" aria-label="Hoax home">
              <Logo size={30} />
            </Link>
          </div>
          <nav className="header-nav" aria-label="Primary">
            {nav.map(([href, label]) => (
              <Link key={href} href={href} className={`hlink${on(href) ? " on" : ""}`}>
                {href === "/radar" && <span className="live-dot" aria-hidden />}
                {label}
              </Link>
            ))}
          </nav>
          <div className="header-act">
            <div className="wallet-slot">
              <WalletButton />
            </div>
            <Link href="/start" className="btn sm">
              Get protected
              <Arrow />
            </Link>
            <button className="hmenu-btn" aria-expanded={open} aria-label={open ? "Close menu" : "Open menu"} onClick={() => setOpen(!open)}>
              <span className="burger-lines" aria-hidden>
                <i />
                <i />
                <i />
              </span>
            </button>
          </div>
        </div>
      </header>

      <div className={`menu${open ? " open" : ""}`} aria-hidden={!open}>
        <nav className="menu-list">
          {menu.map(([href, label], i) => (
            <Link key={href} href={href} className={on(href) ? "on" : undefined} style={{ ["--i" as string]: i }} tabIndex={open ? 0 : -1}>
              {label}
              <span className="mono-s">{String(i + 1).padStart(2, "0")}</span>
            </Link>
          ))}
        </nav>
        <div className="menu-foot">
          <div>
            <div className="mono-s soft">Wallet</div>
            <div style={{ marginTop: "1rem" }}>
              <WalletButton />
            </div>
          </div>
          <div>
            <div className="mono-s soft">Network</div>
            <p className="txt ink" style={{ marginTop: "1rem" }}>
              Market intelligence for dreamDEX perps · Somnia Tokyo and Shannon
            </p>
          </div>
        </div>
      </div>
    </>
  );
}
