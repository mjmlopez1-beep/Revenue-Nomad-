"use client";

/**
 * Send for signature, as one sheet (the one-screen Proposals, RN_PROPOSALS2): who signs, a note in
 * the member's voice, and the defaults said in one line (the client signs first, the member
 * countersigns last, the link works 30 days, reminders on day 2 and day 7). Send uses the EXISTING
 * proposal send path: the reminders saved through /api/activity, then POST /api/proposals op "send"
 * (lib/proposals/store.ts sendProposal), so the signing page, the audit trail and the pipeline move
 * exactly as before.
 *
 * Self-contained on purpose. The editor calls it the way the Contracts rebuild's shared sheet is
 * called (app/post/contracts/SendSheet.tsx openSend, RN_CONTRACTS2): openSend({ kind, id, signers,
 * message, title?, linkDays?, canClose? }) resolves with what was sent, or null. Signers come in
 * signing order with `me: true` on the member's row (last: they countersign after the client, the
 * default; first: they sign as they send; absent: no signature from them). At the merge, the import
 * of openSend moves to the shared sheet and <SendSheetHost /> goes: the call site stays as it is.
 */
import { useEffect, useMemo, useState } from "react";
import type { MemberSignMode, ProposalRec } from "@/lib/proposals/types";
import { SENDER_DUTY } from "@/lib/proposals/types";
import type { VoiceStyle } from "@/lib/voice";
import { blanksInWords } from "@/lib/proposals/library";
import { Sheet } from "../ui";
import { api } from "../ProposalParts";
import { REMINDERS_ON, saveReminders, SendReminders, type ReminderChoice } from "../SendReminders";
import { openPlans } from "../Billing";
import "./proposalsPage.css";
import "./p2.css";

export interface Signer {
  name: string;
  email: string;
  title?: string;
  /** The member's own row. */
  me?: boolean;
}

/** openSend's arguments: the same shape as the shared sheet's (contracts2). */
export interface SendArgs {
  kind: "proposal" | "contract";
  id: string;
  /** In signing order; `me: true` on the member's row. */
  signers: Signer[];
  /** The note above the link, already in the member's voice (noteInVoice). */
  message: string;
  title?: string;
  linkDays?: number;
  /** Sending is on their plan (Close). */
  canClose?: boolean;
  onChangeSigners?: (s: Signer[]) => void;
}
export interface SendResult {
  proposal: ProposalRec;
  message: string;
}

/** The member's signature from where their row sits: last is "after" (the default), first is "now", none is "none". */
export const modeOfSigners = (signers: Signer[]): MemberSignMode => {
  const i = signers.findIndex((x) => x.me);
  return i < 0 ? "none" : i === 0 && signers.length > 1 ? "now" : "after";
};

let host: ((a: SendArgs, done: (r: SendResult | null) => void) => void) | null = null;
/** Open the Send sheet. Resolves with what was sent, or null when it closed without sending. */
export function openSend(a: SendArgs): Promise<SendResult | null> {
  return new Promise((done) => (host ? host(a, done) : done(null)));
}

/** Where openSend's sheet draws, with what the editor knows (blanks, whether email is set up, the save before sending). */
export function SendSheetHost(ctx: Omit<SendSheetProps, keyof SendArgs | "onSent" | "onClose">) {
  const [cur, setCur] = useState<{ a: SendArgs; done: (r: SendResult | null) => void } | null>(null);
  useEffect(() => {
    host = (a, done) => setCur({ a, done });
    return () => void (host = null);
  }, []);
  if (!cur) return null;
  const end = (r: SendResult | null) => (cur.done(r), setCur(null));
  return <SendSheet {...cur.a} {...ctx} onSent={(proposal, message) => end({ proposal, message })} onClose={() => end(null)} />;
}

/** What the sheet needs: openSend's arguments, and the editor's context. */
export interface SendSheetProps extends SendArgs {
  /** The member's own name, for "You sign last". */
  memberName: string;
  /** Sending is on their plan, and email is set up on Merlin. */
  canSend: boolean;
  email: boolean;
  /** Blanks still in the document: it can't go until they're filled. */
  blanks: string[];
  /** Before it goes: the editor's edits on their way are saved first. False: they didn't save. */
  before?: () => Promise<boolean>;
  onSent: (p: ProposalRec, message: string) => void;
  onClose: () => void;
}

/** "Hi Dana, here is the proposal we talked about. ..." in the member's greeting and contractions. One paragraph (the note is one line on the email). */
export function noteInVoice(first: string, voice: Partial<VoiceStyle> | null | undefined): string {
  const g = voice?.greeting && voice.greeting !== "none" ? voice.greeting.replace("{first}", first || "there") : first ? `Hi ${first},` : "Hi,";
  const c = voice?.contractions !== false;
  return `${g} here is the proposal we talked about. Pick the option that fits and sign when ${c ? "you're" : "you are"} ready. ${c ? "I'm" : "I am"} happy to walk through it on a call.`;
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

/** Who signs for the client, from the proposal: the signer kept on it, else the fields the start filled (the call, the deal). */
export function signersOf(p: Pick<ProposalRec, "signer">, fields: Record<string, string>, me?: { name: string; email: string }): Signer[] {
  const client = { name: p.signer?.name || fields["client.signerName"] || "", email: p.signer?.email || fields["client.signerEmail"] || "", title: p.signer?.title || fields["client.signerTitle"] || "" };
  // The client first; the member last, so they countersign after the client (the owner's default).
  return me ? [client, { name: me.name, email: me.email, me: true }] : [client];
}

export function SendSheet(x: SendSheetProps) {
  const first = x.signers.find((y) => !y.me) ?? { name: "", email: "" };
  const [s, setS] = useState<Signer>({ name: first.name, email: first.email, title: first.title ?? "" });
  const [editing, setEditing] = useState(!first.name || !EMAIL.test(first.email));
  const [note, setNote] = useState(x.message);
  // The owner's default: the client signs first, the member countersigns last (their row last).
  const [mode, setMode] = useState<MemberSignMode>(modeOfSigners(x.signers));
  const [rem, setRem] = useState<ReminderChoice>(REMINDERS_ON);
  const [more, setMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const who = s.name.trim().split(/\s+/)[0] || "them";
  const why = useMemo(
    () =>
      !x.canSend
        ? "Sending for signature is on Close."
        : !x.email
          ? "Email isn't set up on Merlin yet, so it can't go out."
          : !s.name.trim() || !EMAIL.test(s.email.trim())
            ? "Add the name and email of the person who signs."
            : x.blanks.length
              ? `Fill ${x.blanks.length === 1 ? "the last blank" : `the ${x.blanks.length} blanks`} first: ${blanksInWords(x.blanks)}.`
              : "",
    [x.canSend, x.email, x.blanks, s],
  );
  const send = async () => {
    setBusy(true);
    setErr(null);
    if (x.before && !(await x.before())) return setBusy(false), setErr("Your last edit isn't saved yet. Check your connection, then send again.");
    const off = await saveReminders(x.id, rem);
    if (off) return setBusy(false), setErr(off);
    const r = await api<{ proposal: ProposalRec; message: string }>({ op: "send", id: x.id, signer: { name: s.name.trim(), email: s.email.trim(), title: (s.title ?? "").trim() }, message: note, memberSign: mode, linkDays: x.linkDays ?? 30 });
    setBusy(false);
    if (r.error) return setErr(r.error);
    x.onSent(r.proposal, r.message);
  };
  const order = mode === "after" ? `${who} signs first. You sign last.` : mode === "now" ? `You sign as it goes. Then ${who} signs.` : `${who} signs. No signature from you.`;
  return (
    <Sheet
      title="Send for signature"
      onClose={x.onClose}
      dialog
      className="p2-send"
      footer={
        x.canSend ? (
          <>
            <button type="button" className="btn btn-pine btn-lg" data-send aria-busy={busy} disabled={!!why || busy} onClick={() => void send()}>
              {busy ? "Sending" : "Send"}
            </button>
            <button type="button" className="btn btn-lg" onClick={x.onClose}>
              Not yet
            </button>
          </>
        ) : (
          <button type="button" className="btn btn-pine btn-lg" onClick={() => openPlans("proposals")}>
            See the Close plan
          </button>
        )
      }
    >
      <div className="p2-send-body">
        <p className="p2-muted">They get a link to read it, pick an option and sign. Nothing goes until you tap Send.</p>
        <ol className="p2-signers" aria-label="Who signs, in order">
          <li data-signer="client">
            <span className="p2-n">1</span>
            {editing ? (
              <span className="p2-signer-form">
                <label>
                  <span>Their name</span>
                  <input className="input" value={s.name} autoComplete="off" onChange={(e) => setS({ ...s, name: e.target.value })} />
                </label>
                <label>
                  <span>Their email</span>
                  <input className="input" type="email" value={s.email} autoComplete="off" onChange={(e) => setS({ ...s, email: e.target.value })} />
                </label>
                <label>
                  <span>Their title</span>
                  <input className="input" value={s.title ?? ""} autoComplete="off" onChange={(e) => setS({ ...s, title: e.target.value })} />
                </label>
              </span>
            ) : (
              <span className="p2-signer">
                <strong>
                  {s.name}
                  {s.title ? `, ${s.title}` : ""}
                </strong>
                <span className="p2-muted">{s.email}</span>
              </span>
            )}
            {!editing && (
              <button type="button" className="tp-flink" onClick={() => setEditing(true)}>
                Change
              </button>
            )}
          </li>
          {mode === "after" && (
            <li data-signer="member">
              <span className="p2-n">2</span>
              <span className="p2-signer">
                <strong>{x.memberName}</strong>
                <span className="p2-muted">You countersign after they sign</span>
              </span>
            </li>
          )}
        </ol>
        <label className="p2-note">
          <span>A note with the link</span>
          <textarea className="input" rows={3} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <p className="p2-muted" data-defaults>
          {order} The link works for {x.linkDays ?? 30} days. Reminders on day 2 and day 7 if it isn&#39;t signed.{" "}
          <button type="button" className="tp-flink" aria-expanded={more} onClick={() => setMore((m) => !m)}>
            {more ? "Done" : "Change"}
          </button>
        </p>
        {more && (
          <div className="p2-send-more">
            <fieldset className="p2-mode">
              <legend>Your signature</legend>
              <label>
                <input type="radio" name="p2-mode" checked={mode === "after"} onChange={() => setMode("after")} /> I sign after they do
              </label>
              <label>
                <input type="radio" name="p2-mode" checked={mode === "none"} onChange={() => setMode("none")} /> No signature from me
              </label>
            </fieldset>
            <SendReminders value={rem} onChange={setRem} disabled={busy} />
          </div>
        )}
        <p className="p2-muted p2-duty">{SENDER_DUTY}</p>
        {why && <p className="p2-why">{why}</p>}
        {err && (
          <p className="pp-err" role="alert">
            {err}
          </p>
        )}
      </div>
    </Sheet>
  );
}
