"use client";
// Whether the protection engine is running, from its heartbeat: for one
// network when given (the account's), else for any. Never claims "protected"
// when the engine has not reported in.

import { useHoax } from "@/lib/wallet";

export function EngineBadge({ label = true, chainId }: { label?: boolean; chainId?: number }) {
  const { engine: all } = useHoax();
  const net = chainId !== undefined ? all?.networks?.[chainId] : undefined;
  const engine = all && net ? { ...all, ...net } : all;
  const state = !engine ? "pending" : engine.online ? "on" : "off";
  const text = !engine
    ? "Checking engine"
    : engine.online
      ? "Engine live"
      : engine.mode === "demo"
        ? "Engine offline · demo"
        : engine.ageSec === null
          ? "Engine not started"
          : `Engine silent ${engine.ageSec}s`;
  return (
    <span className={`engine ${state}`} title={engine?.lastBeatAt ? `Last heartbeat ${engine.lastBeatAt}` : undefined}>
      <i aria-hidden />
      {label && text}
    </span>
  );
}
