"use client";
// Telegram alerts for this account: link a chat, test it, unlink it. The engine
// sends every alert, close, save and liquidation to the linked chat.
import { useCallback, useEffect, useState } from "react";
import { api } from "@/lib/session";
import { Arrow, Eyebrow } from "./Ui";

type Status = { telegram: { available: boolean; linked: boolean; pending: boolean } };

export function AlertChannels({ owner, token, chainId, sample, canManage }: { owner: string; token: string; chainId: number; sample: boolean; canManage: boolean }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);
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

  useEffect(() => void load(), [load]);

  // While a link is open, watch for the chat to press Start.
  useEffect(() => {
    if (!link || status?.telegram.linked) return;
    const t = setInterval(load, 3000);
    const stop = setTimeout(() => clearInterval(t), 5 * 60_000);
    return () => (clearInterval(t), clearTimeout(stop));
  }, [link, status?.telegram.linked, load]);

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
  const off = sample || !canManage;
  const tg = status?.telegram;

  return (
    <section className="panel al" id="alerts" aria-label="Telegram alerts">
      <div className="al-head">
        <div className="stack" style={{ gap: "1rem" }}>
          <Eyebrow>Your alerts / Telegram</Eyebrow>
          <h2 className="h3">Get alerts where you are.</h2>
          <p className="txt">Every close Hoax sends, every save, a liquidation, and anything that needs you: in Telegram as well as the dashboard.</p>
        </div>
      </div>

      {sample && <p className="note">Telegram alerts are for real accounts. Connect your own wallet to turn them on.</p>}

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
            <div className="row">
              <button
                className="btn sm"
                disabled={off || busy !== null}
                onClick={() =>
                  run("test", async () => {
                    const r = await post<{ sent: number }>({ kind: "test" });
                    setNote(r.sent ? "Test sent. Check Telegram." : "No linked chat could be reached.");
                  })
                }
              >
                <span>{busy === "test" ? "Sending…" : "Send a test alert"}</span>
              </button>
              <button
                className="btn ghost sm"
                disabled={off || busy !== null}
                onClick={() => run("off", async () => void (await api(`${base}?chain=${chainId}`, { method: "DELETE", token })))}
              >
                <span>{busy === "off" ? "Unlinking…" : "Unlink Telegram"}</span>
              </button>
            </div>
          </>
        ) : link ? (
          <>
            <p className="mono-s soft">Open the link, press Start in Telegram, and this card turns green. The link works once, for 30 minutes.</p>
            <a className="btn sm" href={link} target="_blank" rel="noreferrer">
              Open Telegram
              <Arrow dir="ne" />
            </a>
          </>
        ) : (
          <>
            <p className="mono-s soft">One tap: open Hoax&apos;s bot and press Start. No phone number is shared with Hoax.</p>
            <button className="btn sm" disabled={off || busy !== null || !tg} onClick={() => run("tg", async () => setLink((await post<{ link: string }>({ kind: "telegram" })).link))}>
              <span>{busy === "tg" ? "Preparing…" : "Connect Telegram"}</span>
              <Arrow />
            </button>
          </>
        )}
      </div>

      {note && <p className="note">{note}</p>}
      {err && <p className="note bad">{err}</p>}
    </section>
  );
}
