"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";
import { WalletButton } from "./WalletButton";

const PRIMARY = [
  ["/", "Home"],
  ["/how-it-works", "How it works"],
  ["/markets", "Markets"],
  ["/security", "Security"],
  ["/stats", "Track record"],
  ["/replay", "Replay"],
] as const;

const APP = [
  ["/start", "Get protected"],
  ["/app", "Overview"],
  ["/app/positions", "Positions"],
  ["/app/receipts", "Receipts"],
  ["/app/settings", "Settings"],
] as const;

export function Header() {
  const path = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    document.documentElement.style.overflow = open ? "hidden" : "";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const on = (href: string) => (href === "/" ? path === "/" : path === href || path.startsWith(`${href}/`));

  return (
    <>
      <header className={`top${open ? " menu-open" : ""}`}>
        <div className="wrap">
          <div className="bar">
            <button className="burger" aria-label={open ? "Close menu" : "Open menu"} aria-expanded={open} onClick={() => setOpen(!open)}>
              <span className="lines" aria-hidden>
                <i />
                <i />
                <i />
              </span>
              <span className="lbl">{open ? "Close" : "Menu"}</span>
            </button>
            <Link href="/" className="mark" aria-label="Hoax home">
              <Logo />
            </Link>
            <div className="right">
              <Link href="/app" className="pill ghost">
                Launch app
              </Link>
              <WalletButton />
            </div>
          </div>
        </div>
      </header>

      <div className={`menu${open ? " open" : ""}`} aria-hidden={!open}>
        <div className="wrap menu-inner">
          <nav className="menu-main">
            {PRIMARY.map(([href, label], i) => (
              <Link key={href} href={href} className={on(href) ? "on" : undefined} style={{ ["--i" as string]: i }} tabIndex={open ? 0 : -1}>
                <span className="idx">{String(i + 1).padStart(2, "0")}</span>
                {label}
              </Link>
            ))}
          </nav>
          <div className="menu-side" style={{ ["--i" as string]: PRIMARY.length }}>
            <div className="cap soft">App</div>
            {APP.map(([href, label]) => (
              <Link key={href} href={href} className={on(href) ? "on" : undefined} tabIndex={open ? 0 : -1}>
                {label}
              </Link>
            ))}
            <div className="cap soft" style={{ marginTop: 28 }}>
              Network
            </div>
            <span>dreamDEX perps · Somnia</span>
          </div>
        </div>
      </div>
    </>
  );
}
