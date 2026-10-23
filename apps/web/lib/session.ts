"use client";
// What the app pages run on: the dreamDEX account Hoax protects and the wallet
// session token that manages it (empty until the wallet signs in).

export interface Session {
  /** The dreamDEX account (the wallet's Safe), lowercase. */
  owner: string;
  accountId: string;
  /** Wallet session token; "" when the wallet has not signed in. */
  token: string;
}

export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  const res = await fetch(path, { ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((body as { error?: string }).error ?? `request failed (${res.status})`);
  return body as T;
}
