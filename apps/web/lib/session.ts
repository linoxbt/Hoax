"use client";
// What the app pages run on: the dreamDEX account Hoax protects and the wallet
// session token that manages it (empty until the wallet signs in).

export interface Session {
  /** The dreamDEX account (the wallet's Safe), lowercase. */
  owner: string;
  accountId: string;
  /** Wallet session token; "" when the wallet has not signed in. */
  token: string;
  /** The network the account lives on: 50312 (Shannon) or 50383 (Hideki). */
  chainId: number;
}

export async function api<T>(path: string, init: RequestInit & { token?: string } = {}): Promise<T> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token) headers.authorization = `Bearer ${init.token}`;
  let res: Response;
  try {
    // A request that never answers would leave its button spinning forever.
    res = await fetch(path, { signal: AbortSignal.timeout(45_000), ...init, headers: { ...headers, ...(init.headers as Record<string, string>) } });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") throw new Error("Hoax did not answer in time; try again in a moment");
    throw err;
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (body as { error?: string }).error;
    if (msg) throw new Error(msg);
    throw new Error(res.status >= 500 ? `Hoax's server is not answering right now (${res.status}); try again in a moment` : `request failed (${res.status})`);
  }
  return body as T;
}
