"use client";

/**
 * Review and send: step 4 of sending for signature (Contracts, RN_CONTRACTS2), shared by the
 * Contracts send flow (SendFlow.tsx) and Proposals. Title, message, one Reminders switch, how long
 * the link works, "Send a copy to someone" folded away, and one button that says what will happen:
 * Send, Sign and send (you sign first) or Sign now (Just me).
 *
 * ---------------------------------------------------------------------------------------------
 * For Proposals (the proposals3 rebuild, RN_PROPOSALS2), at the merge: replace the temporary send
 * sheet with
 *
 *     import { openSend } from "../contracts/SendSheet";
 *     const sent = await openSend({ kind: "proposal", id: proposal.id, signers: [{ name, email, title }, { name: me.name, email: me.email, me: true }], message });
 *     if (sent) reload(); // sent.message: "Sent to Sam. Sam signs first. Then you."
 *
 *   openSend(args: OpenSendArgs): Promise<SendResult | null>     null when closed without sending
 *     kind      "proposal" | "contract"
 *     id        the proposal's id (p_...) or the contract draft's id (dc_...)
 *     signers   in signing order; the member's own row has `me: true`. A proposal has one client
 *               signer: where "me" sits sets memberSign (last "after", first "now", absent "none",
 *               lib/documents/whoSigns.ts memberSignOf). Default for Me and others: client first.
 *     message   the note to the signer, drafted in the member's voice (they can change it)
 *     title?    shown read only for a proposal (it is the proposal's own title); editable for a contract
 *     linkDays? 14, 30 (default), 60, 90 or 0 (no end date)
 *     canClose? the member has Close (the trial too): the Reminders switch is shown. Asked of
 *               GET /api/contracts when left out.
 *     onChangeSigners?  "Change who signs": the caller's step 2. Left out: no link.
 *
 * It mounts its own sheet on document.body (no app context needed) and removes it when done.
 * `SendStep` is the same step drawn inline (the Contracts flow uses it).
 * ---------------------------------------------------------------------------------------------
 *
 * Saving: a contract's title and message with POST /api/documents { op: "update" }, the reminders
 * with POST /api/activity { op: "reminders" } (Close), then { op: "send", linkDays, cc }. A
 * proposal: POST /api/proposals { op: "send", signer, message, memberSign, linkDays }. When the
 * member's own turn comes first, the answer carries their signing link and the page opens it.
 */
import { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import { LINK_DAYS, LINK_DAYS_SAY, type LinkDays } from "@/lib/proposals/types";
import { actionWord, memberSignOf, orderLine } from "@/lib/documents/whoSigns";
import { saveReminders } from "../SendReminders";
import { dapi } from "../DocBuilder";
import { errorText } from "../../ui/shared";
import "./contracts2.css";

export interface SendSigner {
  name: string;
  email: string;
  title?: string;
  me?: boolean;
}
export interface OpenSendArgs {
  kind: "proposal" | "contract";
  id: string;
  signers: SendSigner[];
  message?: string;
  title?: string;
  linkDays?: LinkDays;
  /** One at a time, in the list's order (default), or everyone at once (a contract only). */
  ordered?: boolean;
  canClose?: boolean;
  onChangeSigners?: () => void;
}
export interface SendResult {
  message: string;
  /** The member signs first: their signing link, opened at once. */
  link?: string;
  /** The words for the confirmation: "Sent to Sam.", "Sam signs first. Then you." */
  head: string;
  order: string;
  remind: boolean;
  days: LinkDays;
}

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const first = (s: string) => s.trim().split(/\s+/)[0] || s;
const names = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

async function papi<T>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

/** A switch (role="switch") with its words and the line under them. */
export function Switch({ label, sub, on, onChange, disabled }: { label: string; sub?: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="c2-sw" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="c2-sw-k" aria-hidden />
      <span className="c2-sw-t">
        <strong>{label}</strong>
        {sub && <span>{sub}</span>}
      </span>
    </button>
  );
}

export function SendStep({ args, onSent, onCancel, sheet }: { args: OpenSendArgs; onSent: (r: SendResult) => void; onCancel?: () => void; sheet?: boolean }) {
  const [title, setTitle] = useState(args.title ?? "");
  const [message, setMessage] = useState(args.message ?? "");
  const [remind, setRemind] = useState(true);
  const [days, setDays] = useState<LinkDays>(args.linkDays ?? 30);
  const [ccOpen, setCcOpen] = useState(false);
  const [cc, setCc] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [canClose, setCanClose] = useState<boolean | undefined>(args.canClose);
  useEffect(() => {
    if (canClose !== undefined) return;
    void fetch("/api/contracts", { headers: { accept: "application/json" } })
      .then((r) => (r.ok ? r.json() : null))
      .then((j: { canClose?: boolean } | null) => setCanClose(j?.canClose ?? false))
      .catch(() => setCanClose(false));
  }, [canClose]);
  const ordered = args.ordered !== false;
  const word = actionWord(args.signers, ordered);
  const theirs = args.signers.filter((x) => !x.me);
  const ccList = cc
    .split(/[\s,;]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  const ccBad = ccList.some((x) => !EMAIL.test(x));

  const send = async () => {
    setBusy(true);
    setErr(null);
    const fail = (e: string) => (setBusy(false), setErr(e));
    if (args.kind === "contract") {
      const u = await dapi({ op: "update", id: args.id, title: title.trim() || undefined, message });
      if (u.error) return fail(u.error);
    }
    if (canClose && theirs.length) {
      const re = await saveReminders(args.id, { d2: remind, d7: remind, expiry: remind });
      if (re) return fail(re);
    }
    let out: { message: string; link?: string; error?: string };
    if (args.kind === "contract") {
      out = await dapi<{ message: string; link?: string }>({ op: "send", id: args.id, message, linkDays: days, cc: ccOpen ? ccList : [] });
    } else {
      const client = theirs[0];
      if (!client) return fail("A proposal needs the client's signer.");
      out = await papi<{ message: string }>({ op: "send", id: args.id, signer: { name: client.name, email: client.email, ...(client.title ? { title: client.title } : {}) }, message, memberSign: memberSignOf(args.signers), linkDays: days });
    }
    if (out.error) return fail(out.error);
    setBusy(false);
    const firstUp = ordered ? args.signers.slice(0, 1) : theirs;
    onSent({
      message: out.message,
      link: out.link,
      head: firstUp.every((x) => x.me) ? "Ready for you to sign." : `Sent to ${names(firstUp.filter((x) => !x.me).map((x) => first(x.name)))}.`,
      order: orderLine(args.signers.map((x) => ({ me: !!x.me, name: x.name })), ordered),
      remind: !!canClose && remind && theirs.length > 0,
      days,
    });
  };

  return (
    <div className={`c2-review${sheet ? " c2-review-sheet" : ""}`}>
      <div className="c2-review-main">
        <h2 className="c2-h">{word === "Sign now" ? "Review and sign" : "Review and send"}</h2>
        <p className="c2-lead">{word === "Sign now" ? "You sign it here, right after this." : `Nothing goes out until you tap ${word}.`}</p>
        <label className="c2-fl">
          <span className="c2-label">Title</span>
          <input className="input" value={title} maxLength={160} readOnly={args.kind === "proposal"} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {theirs.length > 0 && (
          <label className="c2-fl">
            <span className="c2-label">Message</span>
            <textarea className="input c2-msg" rows={6} maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={`Hi ${first(theirs[0].name)}, here it is to sign.`} />
          </label>
        )}
        {theirs.length > 0 && canClose && <Switch label="Remind them" sub="On day 2 if it isn't opened, on day 7 if it isn't signed, and 2 days before the link ends. Stops when they sign." on={remind} onChange={setRemind} />}
        <label className="c2-fl c2-days">
          <span className="c2-label">The link works for</span>
          <select className="input" value={days} onChange={(e) => setDays(Number(e.target.value) as LinkDays)}>
            {LINK_DAYS.map((d) => (
              <option key={d} value={d}>
                {LINK_DAYS_SAY[d]}
              </option>
            ))}
          </select>
        </label>
        {args.kind === "contract" && (
          <div className="c2-cc">
            <button type="button" className="c2-fold" aria-expanded={ccOpen} onClick={() => setCcOpen((x) => !x)}>
              <span aria-hidden>{ccOpen ? "▾" : "▸"}</span> Send a copy to someone
            </button>
            {ccOpen && (
              <label className="c2-fl">
                <span className="c2-label">They get the signed PDF. They don&#39;t sign.</span>
                <input className="input" type="email" multiple placeholder="finance@company.example" value={cc} onChange={(e) => setCc(e.target.value)} aria-invalid={ccBad} />
              </label>
            )}
          </div>
        )}
        {err && (
          <p className="c2-err" role="alert">
            {err}
          </p>
        )}
        <div className="c2-review-act">
          {onCancel && (
            <button type="button" className="btn" onClick={onCancel} disabled={busy}>
              {sheet ? "Cancel" : "Back"}
            </button>
          )}
          <button type="button" className="btn btn-pine" data-send aria-busy={busy} disabled={busy || (ccOpen && ccBad) || (args.kind === "contract" && !title.trim())} onClick={() => void send()}>
            {busy ? (word === "Send" ? "Sending" : "Opening") : word}
          </button>
        </div>
      </div>
      <aside className="c2-review-side" aria-label="Signers">
        <h3 className="c2-h3">Signers</h3>
        <ol className="c2-who-list">
          {args.signers.map((x, i) => (
            <li key={`${x.email}${i}`}>
              <span className="c2-num">{ordered ? i + 1 : ""}</span>
              <span className="c2-dot" data-c={x.me ? "me" : String(args.signers.filter((y) => !y.me).indexOf(x) % 5)} aria-hidden />
              <span>
                <strong>{x.me ? "You" : x.name}</strong>
                <span className="c2-sub">{x.me ? (i === args.signers.length - 1 && args.signers.length > 1 ? "You sign last" : i === 0 && args.signers.length > 1 ? "You sign first" : "You sign") : x.email}</span>
              </span>
            </li>
          ))}
        </ol>
        {args.onChangeSigners && (
          <button type="button" className="c2-link" onClick={args.onChangeSigners}>
            Change who signs
          </button>
        )}
      </aside>
    </div>
  );
}

/**
 * Open Review and send over the page, from anywhere (Proposals). Resolves with what was sent, or
 * null when the member closes it. The member's own turn first: their signing page opens.
 */
export function openSend(args: OpenSendArgs): Promise<SendResult | null> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    host.className = "c2-sheet-host";
    document.body.appendChild(host);
    const root = createRoot(host);
    const done = (r: SendResult | null) => {
      root.unmount();
      host.remove();
      if (r?.link) window.location.assign(r.link);
      resolve(r);
    };
    root.render(
      <div className="c2-scrim" role="dialog" aria-modal="true" aria-label="Review and send" onKeyDown={(e) => e.key === "Escape" && done(null)}>
        <div className="c2-sheet">
          <SendStep sheet args={{ ...args, onChangeSigners: args.onChangeSigners ? () => (done(null), args.onChangeSigners!()) : undefined }} onSent={done} onCancel={() => done(null)} />
        </div>
      </div>,
    );
  });
}
