"use client";

/**
 * Integrations, Granola: connect a personal API key from Granola, so a proposal can start from a
 * call it recorded (GranolaCallPicker). The key is pasted in a password field, checked with one
 * call to Granola, kept encrypted, and only its last four characters ever come back. Disconnect
 * deletes it. Nothing renders with RN_GRANOLA off. Connecting works on every plan; drafting from a
 * call is Close.
 */
import { useRef, useState } from "react";
import { Chip } from "../ui/system";
import { useToast } from "../ui/shared";
import { openPlans } from "./Billing";
import { connectKey, disconnectKey, useGranola } from "./granolaClient";
import "./granola.css";

const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", ...(new Date(iso).getFullYear() !== new Date().getFullYear() ? { year: "numeric" } : {}) });

/** A plain notepad mark, drawn here (Granola's own logo isn't used). */
export function GranolaMark({ size = 24 }: { size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} aria-hidden focusable="false" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" className="gr-mark">
      <rect x="4.5" y="3.5" width="15" height="17" rx="3" />
      <path d="M8.5 9h7M8.5 12.5h7M8.5 16h4" />
    </svg>
  );
}

export const GRANOLA_PLAN = "Personal API keys need a Granola Business or Enterprise plan. On Enterprise, your Granola admin may have to turn on API access first.";

export function GranolaSection() {
  const { status } = useGranola();
  const toast = useToast();
  const [key, setKey] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"connect" | "disconnect" | null>(null);
  const [asking, setAsking] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  if (!status || !status.on) return null;

  const connect = async () => {
    const k = key.trim();
    if (!k) {
      setErr("Paste the API key from Granola. It starts with grn_.");
      input.current?.focus();
      return;
    }
    setBusy("connect");
    const r = await connectKey(k);
    setBusy(null);
    if (r.error !== undefined) {
      setErr(r.error);
      input.current?.focus();
      return;
    }
    setKey("");
    setErr(null);
    toast(r.message);
  };
  const disconnect = async () => {
    setBusy("disconnect");
    const r = await disconnectKey();
    setBusy(null);
    setAsking(false);
    if (r.error !== undefined) toast(r.error, true);
    else toast(r.message);
  };

  return (
    <section className="in-section" id="granola" aria-labelledby="in-granola-h">
      <h2 className="in-h" id="in-granola-h">
        Your calls from Granola
      </h2>
      <p className="uc-lead">Start a proposal from a call Granola recorded. Merlin reads a call only when you pick it, and keeps the draft, not the transcript.</p>
      <section className="tp-card in-card" aria-labelledby="in-granola-card">
        <div className="in-card-h">
          <span className="in-mark in-mark-sm gr-mark-box" aria-hidden>
            <GranolaMark />
          </span>
          <h3 className="tp-card-h" id="in-granola-card">
            Granola
          </h3>
          <Chip tone={status.connected && !status.broken ? "mint" : "outline"}>{status.connected ? (status.broken ? "Key stopped working" : "Connected") : "Not set up"}</Chip>
        </div>
        {status.connected ? (
          <div className="in-conn">
            <p className="in-conn-where">
              Connected · key ending <span className="mono">••••{status.last4}</span>
            </p>
            {status.connectedAt && <p className="in-conn-meta">Since {day(status.connectedAt)}. Merlin keeps the key encrypted and never shows the rest of it.</p>}
            {status.broken && (
              <p className="in-problem" role="status">
                Granola stopped accepting this key. Disconnect it, make a new key in Granola and connect that one.
              </p>
            )}
            {!status.canDraft && (
              <div className="gr-close" data-plan="free">
                <span className="bl-tag bl-tag-lock">Close</span>
                <p>Drafting a proposal from a call is on Close. Your key stays connected.</p>
                <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
                  See the Close plan
                </button>
              </div>
            )}
            {asking ? (
              <div className="in-ask" role="group" aria-label="Disconnect Granola">
                <span>Disconnect Granola? Merlin deletes your key.</span>
                <button type="button" className="btn btn-pine" onClick={() => void disconnect()} aria-busy={busy === "disconnect"} disabled={!!busy}>
                  {busy === "disconnect" ? "Disconnecting" : "Disconnect"}
                </button>
                <button type="button" className="btn btn-ghost" onClick={() => setAsking(false)} disabled={!!busy}>
                  Keep it
                </button>
              </div>
            ) : (
              <div className="in-actions">
                <button type="button" className="btn btn-ghost" onClick={() => setAsking(true)}>
                  Disconnect
                </button>
              </div>
            )}
          </div>
        ) : (
          <>
            <ol className="uc-steps in-steps">
              <li>In the Granola desktop app, open Settings, then Connectors, then API keys.</li>
              <li>Pick Create new key. Tick Personal notes, then pick Generate API Key.</li>
              <li>Copy the key. It starts with grn_. Paste it below and pick Connect Granola.</li>
            </ol>
            <p className="cr-note">{GRANOLA_PLAN}</p>
            {/* Connecting works on every plan; drafting from a call doesn't, so it is said before they connect. */}
            {!status.canDraft && <p className="cr-note">Drafting a proposal from a Granola call is on Close. You can connect your key now, and draft from your calls once you're on Close.</p>}
            <form
              className="in-form"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!busy) void connect();
              }}
            >
              <label className="in-label" htmlFor="in-granola-key">
                Granola API key
              </label>
              <div className="in-row">
                <input
                  ref={input}
                  id="in-granola-key"
                  className={`input mono in-input${err ? " bad" : ""}`}
                  type="password"
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="grn_…"
                  value={key}
                  onChange={(e) => {
                    setKey(e.target.value);
                    if (err) setErr(null);
                  }}
                  aria-invalid={!!err}
                  aria-describedby={`${err ? "in-granola-err " : ""}in-granola-hint`}
                />
                <button type="submit" className="btn btn-pine" aria-busy={busy === "connect"} disabled={!!busy}>
                  {busy === "connect" ? "Checking" : "Connect Granola"}
                </button>
              </div>
              {err && (
                <p className="in-err" id="in-granola-err" role="alert">
                  {err}
                </p>
              )}
              <p className="in-hint" id="in-granola-hint">
                Merlin checks the key with Granola once, then keeps it encrypted. You only ever see its last four characters.
              </p>
            </form>
          </>
        )}
      </section>
    </section>
  );
}
