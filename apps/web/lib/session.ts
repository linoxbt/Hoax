"use client";
// The manage token lives in this browser only. Losing it means registering
// again: a new Hoax key, linked the same way.

export interface Session {
  owner: string;
  accountId: string;
  token: string;
}

const KEY = "hoax.session";

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function saveSession(s: Session): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // private mode: the session lasts as long as the page
  }
}

export function clearSession(): void {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}
