"use client";
// Telegram and email alerts for this account: link, confirm, test and unlink.
// The engine sends every alert, close, save and liquidation to the confirmed channels.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/session";
import { Arrow, Eyebrow } from "./Ui";

type Status = {
  telegram: { available: boolean; linked: boolean; pending: boolean };
  email: { available: boolean; address: string | null; verified: boolean };
};

export function AlertChannels({ owner, token, chainId, sample, canManage }: { owner: string; token: string; chainId: number; sample: boolean; canManage: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [tgLink, setTgLink] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const base = `/api/accounts/${owner}/notify`;

  const load = useCallback(async () => {
    if (sample || !token) return;
    try {
      setStatus(await api<Status>(`${base}?chain=${chainId}`, { token }));
    } catch (e) {
      setErr((e as Error).message);
    }
  }, [base, chainId, token, sample]);

  useEffect(() => {
    void load();
    const q = new URLSearchParams(window.location.search).get("email");
    if (q === "confirmed") setNote("Email confirmed. Alerts will arrive there.");
    if (q === "expired") setErr("That confirmation link has expired or was already used. Send a new one.");
  }, [load]);

  // While a Telegram link is open, watch for the chat to press Start.
  useEffect(() => {
    if (!tgLink || status?.telegram.linked) return;
    const t = setInterval(load, 3000);
    const stop = setTimeout(() => clearInterval(t), 5 * 60_000);
    return () => (clearInterval(t), clearTimeout(stop));
  }, [tgLink, status?.telegram.linked, load]);

  async function run(what: string, f: () => Promise<void>) {
    if (busy) return;
    setBusy(what);
    setErr(null);
    setNote(null);
    try {
      await f();
      await load();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  const post = <T,>(body: Record<string, unknown>) => api<T>(base, { method: "POST", token, body: JSON.stringify({ ...body, chain: chainId }) });
  const remove = (kind: string) => api(`${base}?kind=${kind}&chain=${chainId}`, { method: "DELETE", token });
  const off = sample || !canManage;
  const tg = status?.telegram;
  const em = status?.email;
  const anyOn = Boolean(tg?.linked || em?.verified);

  return (
    <section className="panel al" id="alerts" aria-label="Alert channels">
      <div className="al-head">
        <div className="stack" style={{ gap: "1rem" }}>
          <Eyebrow>Your alert channels</Eyebrow>
          <h2 className="h3">Get alerts where you are.</h2>
          <p className="txt">
            Every close Hoax sends, every save, a liquidation, and anything that needs you: sent to Telegram, email or both, as well as the
            dashboard.
          </p>
        </div>
        {anyOn && (
          <button className="btn ghost sm" disabled={off || busy !== null} onClick={() => run("test", async () => {
            const r = await post<{ sent: number }>({ kind: "test" });
            setNote(r.sent ? `Test sent to ${r.sent} channel${r.sent === 1 ? "" : "s"}.` : "No confirmed channel could be reached.");
          })}>
            <span>{busy === "test" ? "Sending…" : "Send a test alert"}</span>
          </button>
        )}
      </div>

      {sample && <p className="note">Alert channels are for real accounts. Connect your own wallet to turn them on.</p>}

      <div className="al-grid">
        <div className="panel-in al-card">
          <div className="between">
            <span className="h4">Telegram</span>
            <span className={`tag ${tg?.linked ? "saved" : tg?.pending ? "pending" : "not-needed"}`}>{tg?.linked ? "Connected" : tg?.pending ? "Waiting for Start" : "Off"}</span>
          </div>
          {tg && !tg.available ? (
            <p className="mono-s soft">Telegram alerts are not set up on this deployment yet.</p>
          ) : tg?.linked ? (
            <>
              <p className="mono-s soft">Alerts arrive in the chat you connected. Send /stop there, or unlink here.</p>
              <button className="btn ghost sm" disabled={off || busy !== null} onClick={() => run("tg-off", async () => void (await remove("telegram")))}>
                <span>{busy === "tg-off" ? "Unlinking…" : "Unlink Telegram"}</span>
              </button>
            </>
          ) : tgLink ? (
            <>
              <p className="mono-s soft">Open the link, press Start in Telegram, and this card turns green. The link works once, for 30 minutes.</p>
              <a className="btn sm" href={tgLink} target="_blank" rel="noreferrer">
                Open Telegram
                <Arrow dir="ne" />
              </a>
            </>
          ) : (
            <>
              <p className="mono-s soft">One tap: open Hoax&apos;s bot and press Start. No phone number is shared with Hoax.</p>
              <button className="btn sm" disabled={off || busy !== null || !tg} onClick={() => run("tg", async () => setTgLink((await post<{ link: string }>({ kind: "telegram" })).link))}>
                <span>{busy === "tg" ? "Preparing…" : "Connect Telegram"}</span>
                <Arrow />
              </button>
            </>
          )}
        </div>

        <div className="panel-in al-card">
          <div className="between">
            <span className="h4">Email</span>
            <span className={`tag ${em?.verified ? "saved" : em?.address ? "pending" : "not-needed"}`}>{em?.verified ? "Confirmed" : em?.address ? "Check your inbox" : "Off"}</span>
          </div>
          {em && !em.available ? (
            <p className="mono-s soft">Email alerts are not set up on this deployment yet.</p>
          ) : em?.verified ? (
            <>
              <p className="mono-s soft">Alerts go to {em.address}.</p>
              <button className="btn ghost sm" disabled={off || busy !== null} onClick={() => run("em-off", async () => void (await remove("email")))}>
                <span>{busy === "em-off" ? "Removing…" : "Remove email"}</span>
              </button>
            </>
          ) : (
            <>
              <p className="mono-s soft">
                {em?.address ? `We sent a confirmation link to ${em.address}. Open it within 30 minutes, or send it again.` : "We send one confirmation link first. Nothing else until you confirm."}
              </p>
              <form
                className="al-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  void run("em", async () => {
                    const r = await post<{ address: string }>({ kind: "email", email });
                    setNote(`Confirmation sent to ${r.address}.`);
                  });
                }}
              >
                <input type="email" required placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} disabled={off || !em} aria-label="Email address" />
                <button className="btn sm" type="submit" disabled={off || busy !== null || !email || !em}>
                  <span>{busy === "em" ? "Sending…" : "Send link"}</span>
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {note && <p className="note">{note}</p>}
      {err && <p className="note bad">{err}</p>}
    </section>
  );
}
