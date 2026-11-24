"use client";

/**
 * Settings / Connections: Fathom's row (RN_FATHOM; nothing renders while it is off), a call
 * recorder next to Granola for the "A call ends" workflows. Its own small part, beside the
 * Connections table's rows: a pasted Fathom API key, checked with one call to Fathom, kept sealed
 * (only its last four characters come back), and Remove. GET/POST /api/integrations/fathom/<op>.
 */
import { useEffect, useState } from "react";
import type { FathomStatus } from "@/lib/calls/fathom";

async function call(op: string, body?: unknown): Promise<{ status?: FathomStatus; message?: string; error?: string }> {
  try {
    const r = await fetch(`/api/integrations/fathom/${op}`, body !== undefined ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : { cache: "no-store" });
    const j = (await r.json().catch(() => ({}))) as { status?: FathomStatus; message?: string; error?: string };
    return r.ok ? j : { error: j.error ?? "That didn't go through. Try again." };
  } catch {
    return { error: "We couldn't reach Merlin. Check your connection and try again." };
  }
}
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export function FathomRow({ flash }: { flash: (t: string, err?: boolean) => void }) {
  const [st, setSt] = useState<FathomStatus | null>(null);
  const [open, setOpen] = useState(false);
  const [asking, setAsking] = useState(false);
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void call("status").then((r) => r.status && setSt(r.status));
  }, []);
  if (!st?.on) return null;
  const connect = async () => {
    const k = key.trim();
    if (!k) return setErr("Paste the API key from Fathom, Settings, API Access.");
    setBusy(true);
    const r = await call("connect", { key: k });
    setBusy(false);
    if (r.error) return setErr(r.error);
    setKey("");
    setErr(null);
    if (r.status) setSt(r.status);
    setOpen(false);
    flash(r.message ?? "Fathom is connected.");
  };
  const remove = async () => {
    setBusy(true);
    const r = await call("disconnect", {});
    setBusy(false);
    setAsking(false);
    if (r.error) return flash(r.error, true);
    if (r.status) setSt(r.status);
    flash(r.message ?? "Fathom is disconnected.");
  };
  const on = st.connected;
  return (
    <div className="st-conn-group" role="rowgroup">
      <div className={`st-conn-row${open ? " open" : ""}`} role="row" data-conn="fathom">
        <span role="cell" className="st-conn-name">
          <span className="st-tile st-tile-fathom" aria-hidden>
            Fa
          </span>
          <span className="st-two">
            <strong>Fathom</strong>
            <span>Call recorder</span>
          </span>
        </span>
        <span role="cell" className="st-two">
          <span className={`st-pill${on && !st.broken ? " on" : ""}${st.broken ? " warn" : ""}`}>{on ? (st.broken ? "Key stopped working" : "Connected") : "Not set up"}</span>
          <span className="st-faint">{on && st.connectedAt ? `Since ${day(st.connectedAt)}` : "For your call workflows"}</span>
        </span>
        <span role="cell" className="st-reads">
          <span>When a call ends: who was on it, and its transcript for that run</span>
          <span className="st-never">
            <strong>Never:</strong> keeps a transcript, or sends anything to your client
          </span>
        </span>
        <span role="cell" className="st-feeds">
          <span className="st-feed">Workflows</span>
        </span>
        <span role="cell" className="st-last">
          {on ? "Read after your calls" : "None yet"}
        </span>
        <span role="cell" className="st-conn-acts">
          <button type="button" className={`btn btn-sm${!on && !open ? " st-go-off" : ""}`} aria-expanded={open} aria-label={`${open ? "Close" : on ? "Manage" : "Connect"} Fathom`} onClick={() => (setOpen(!open), setAsking(false))}>
            {open ? "Close" : on ? "Manage" : "Connect"}
          </button>
          {on && !asking && (
            <button type="button" className="btn btn-sm btn-ghost st-remove" aria-label="Remove Fathom" disabled={busy} onClick={() => setAsking(true)}>
              Remove
            </button>
          )}
        </span>
      </div>
      {asking && (
        <div className="st-conn-ask" role="row">
          <div role="cell" className="st-ask" aria-label="Please confirm">
            <span>Disconnect Fathom? Merlin deletes your key. Call workflows stop reading Fathom.</span>
            <span className="st-ask-acts">
              <button type="button" className="btn btn-sm st-btn-red" disabled={busy} aria-busy={busy} onClick={() => void remove()}>
                {busy ? "Removing" : "Disconnect"}
              </button>
              <button type="button" className="btn btn-sm btn-pine" autoFocus onClick={() => setAsking(false)}>
                Keep it
              </button>
            </span>
          </div>
        </div>
      )}
      {open && (
        <div className="st-conn-detail" role="row">
          <div role="cell">
            <div className="st-detail">
              <div className="st-detail-main">
                {on ? (
                  <>
                    <strong className="st-detail-h">Fathom is connected</strong>
                    <span>
                      When a call ends, your call workflows read who was on it and its transcript, and build what you agreed to send: drafts for you, in about 10 minutes. Merlin keeps the drafts, never the transcript. Key ending <span className="mono">••••{st.last4}</span>.
                    </span>
                    {st.broken && <span className="st-warn">Fathom stopped accepting this key. Remove it, make a new key in Fathom and connect that one.</span>}
                  </>
                ) : (
                  <>
                    <strong className="st-detail-h">Connect Fathom to build what you agreed on a call</strong>
                    <span>In Fathom, open Settings, then API Access, and make a key. Paste it here. Merlin checks it with one call, then keeps it sealed. You only ever see its last four characters.</span>
                    <form
                      className="st-form"
                      noValidate
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!busy) void connect();
                      }}
                    >
                      <label className="st-label" htmlFor="st-fathom-key">
                        Fathom API key
                      </label>
                      <span className="st-inrow">
                        <input id="st-fathom-key" className={`input mono${err ? " bad" : ""}`} type="password" autoComplete="off" spellCheck={false} placeholder="Paste your key" value={key} aria-invalid={!!err} onChange={(e) => (setKey(e.target.value), err && setErr(null))} />
                        <button type="submit" className="btn btn-pine" disabled={busy} aria-busy={busy}>
                          {busy ? "Checking" : "Connect Fathom"}
                        </button>
                      </span>
                      {err && (
                        <span className="st-err" role="alert">
                          {err}
                        </span>
                      )}
                    </form>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
