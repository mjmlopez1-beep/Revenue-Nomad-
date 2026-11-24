"use client";

/**
 * Approve, then send, the app's parts (lib/send). Every draft Merlin shows gets "Approve and send"
 * next to Copy and Open in Gmail; the member sees To, Subject and the note (all editable) first.
 *
 *   ApproveButton  the tap, for a sheet that already shows the note (the drafted note, a follow-up)
 *   SendLaunch     a button that opens SendSheet, for the places that show a note without To
 *   SendSheet      To, Subject and the note to read and change, Approve and send, Undo while it waits
 *   ToInput        the To field for an address the member types
 *   WhenPick       a follow-up's "Send Tuesday 9am if no reply"
 *   SendPromise    "Merlin sends only what you approve, from your own Gmail."
 *   SendHost       mounted once in the shell: the toasts, and the way back from Google's consent page
 *   Outbox         Messages: notes waiting for the member's approval, going out, and sent
 *
 * With RN_SEND off none of these draws anything (useSend says off), so every page is as before.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { UNDO_MS, WORDS, cleanAddress, firstOf, whenWords, workMorning, type ApproveInput, type SendEffect, type SendItemView, type SendKind } from "@/lib/send/types";
import { IconExternal, useToast } from "../../ui/shared";
import { copyText } from "../hooks";
import { Sheet } from "../ui";
import { approveDraft, cancelSend, dismissSend, loadSend, sendSnap, setToaster, stopSending, useSend, watchSent, whenSent } from "./sendStore";
import "../movenote.css";
import "./send.css";

type Toast = ReturnType<typeof useToast>;

/** Say it is going, with Undo for the rest of the 30 seconds; then look for Sent. */
function queuedToast(toast: Toast, it: SendItemView) {
  const first = firstOf(it.toName, it.to);
  if (it.status === "scheduled" && it.sendAt) {
    toast(`Set to go ${whenWords(it.sendAt)} if ${first} hasn't replied. You can cancel it in Messages.`, false, {
      action: { label: "Cancel", onClick: () => void cancelSend(it.id).then((c) => toast(c.ok ? c.message : c.error, !c.ok)) },
      ms: 9000,
    });
    return;
  }
  const left = it.sendAt ? Math.max(3000, Date.parse(it.sendAt) - Date.now()) : UNDO_MS;
  toast(WORDS.queued(first), false, { action: { label: WORDS.undo, onClick: () => void cancelSend(it.id).then((c) => toast(c.ok ? c.message : c.error, !c.ok)) }, ms: left });
  watchSent(it.id, it.sendAt);
}

/** A draft's key: where it came from and what it says, so a second tap on the same note is the same send. */
export function draftKey(base: string, ...parts: (string | null | undefined)[]): string {
  let h = 5381;
  for (const ch of parts.map((x) => String(x ?? "").trim()).join("\u0001")) h = ((h * 33) ^ ch.charCodeAt(0)) >>> 0;
  return `${base.slice(0, 120)}:${h.toString(36)}`;
}

/** The tap itself: Google's permission first when needed (it comes back here and sends), else queued with Undo. */
export function useApprove() {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const go = async (d: ApproveInput | string, onQueued?: (it: SendItemView) => void): Promise<boolean> => {
    if (busy) return false;
    if (typeof d === "string") return setErr(d), false;
    setBusy(true);
    setErr(null);
    const r = await approveDraft(d);
    if (!r.ok) {
      setBusy(false);
      setErr(r.error);
      return false;
    }
    if (r.grant) {
      // Google asks once; the note waits and goes when the member comes back here.
      toast(WORDS.grant);
      window.location.assign(`${r.grant}&back=${encodeURIComponent(window.location.pathname + window.location.search)}`);
      return true;
    }
    setBusy(false);
    if (r.again) {
      const it = r.item;
      toast(
        it.status === "sent"
          ? "You sent this note already. It's in your Gmail Sent folder."
          : it.status === "scheduled" && it.sendAt
            ? `It's set to go ${whenWords(it.sendAt)} already.`
            : it.status === "held"
              ? it.note ?? "It's waiting. See Messages."
              : "It's going out already.",
      );
      onQueued?.(it);
      return true;
    }
    queuedToast(toast, r.item);
    onQueued?.(r.item);
    return true;
  };
  return { go, busy, err, setErr };
}

/** "Approve and send", for a sheet that already shows To, Subject and the note. Nothing while sending is off. */
export function ApproveButton({
  draft, onQueued, className = "btn btn-pine mn-go", label = WORDS.approve,
}: {
  /** The note as it reads now, or the words why it can't go yet. */
  draft: () => ApproveInput | string;
  onQueued?: (it: SendItemView) => void;
  className?: string;
  label?: string;
}) {
  const s = useSend();
  const a = useApprove();
  if (!s.on) return null;
  return (
    <>
      <button type="button" className={`${className} sd-approve`} disabled={a.busy} aria-busy={a.busy} onClick={() => void a.go(draft(), onQueued)}>
        <SendIcon /> {a.busy ? "Sending" : label}
      </button>
      {a.err && (
        <p className="mn-warn sd-err" role="alert">
          {a.err}
        </p>
      )}
    </>
  );
}

export const SendIcon = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4z" />
  </svg>
);

/** The To field for an address the member types (when Merlin has none for them). */
export function ToInput({ id, value, onChange, name }: { id: string; value: string; onChange: (v: string) => void; name?: string | null }) {
  return (
    <div className="mn-field sd-to">
      <label className="mn-k" htmlFor={id}>
        To
      </label>
      <input
        id={id}
        className="mn-subject sd-to-in"
        type="email"
        inputMode="email"
        autoComplete="off"
        spellCheck={false}
        placeholder={name ? `${firstOf(name)}'s email address` : "Their email address"}
        value={value}
        maxLength={254}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

/** "When": now (30 seconds to undo), or a working morning at 9 if they haven't replied. */
export type When = "now" | "1" | "3";
export function WhenPick({ value, onChange, first, can }: { value: When; onChange: (v: When) => void; first: string; can: boolean }) {
  const now = Date.now();
  if (!can) return <p className="sd-when-none">Merlin can wait for a reply only with your Gmail connected. This one goes when you approve it.</p>;
  return (
    <div className="sd-when" role="radiogroup" aria-label="When it goes">
      {(
        [
          ["now", "Now"],
          ["1", `${whenWords(workMorning(now, 1))} if no reply`],
          ["3", `${whenWords(workMorning(now, 3))} if no reply`],
        ] as [When, string][]
      ).map(([k, t]) => (
        <button key={k} type="button" role="radio" aria-checked={value === k} className={`sd-when-b${value === k ? " on" : ""}`} onClick={() => onChange(k)}>
          {t}
        </button>
      ))}
      {value !== "now" && <span className="sd-when-s">Merlin checks first. If {first} replied, it doesn&apos;t send and tells you.</span>}
    </div>
  );
}
export const whenAt = (w: When) => (w === "now" ? null : workMorning(Date.now(), Number(w)).toISOString());

/** The promise under every draft: while sending is on, what is true now; otherwise the line the page had. */
export function SendPromise({ off, more, small }: { off: ReactNode; more?: boolean; /** One quiet line under a page's own note. */ small?: boolean }) {
  const s = useSend();
  if (s.status !== "on") return <>{off}</>;
  if (small) return <span className="nw-small sd-small">{WORDS.promise} Nothing goes until you approve it, and you can undo it for 30 seconds.</span>;
  return (
    <span>
      <b>{WORDS.promise}</b>
      {more && <span className="mn-promise-more"> {WORDS.promiseMore}</span>}
    </span>
  );
}
/** True while sending is on (for a page that changes a line of its own). */
export const useSendOn = () => useSend().on;

/* ---------- the sheet ---------- */

export interface SendDraft {
  key: string;
  kind: SendKind;
  to?: string | null;
  toName?: string | null;
  subject: string;
  body: string;
  company?: string | null;
  pipelineId?: string | null;
  effect?: SendEffect | null;
  /** A follow-up may wait for a working morning. */
  followUp?: boolean;
  /** An agent's queued note (its id). */
  id?: string | null;
}

/** To, Subject and the note, all editable, then Approve and send. While it waits: the same note with Undo. */
export function SendSheet({
  d, title, onClose, item: given, onQueued,
}: {
  d: SendDraft;
  title?: string;
  onClose: () => void;
  item?: SendItemView | null;
  /** The note was approved (queued or scheduled). */
  onQueued?: (it: SendItemView) => void;
}) {
  const s = useSend();
  const toast = useToast();
  const a = useApprove();
  const [to, setTo] = useState(d.to ?? "");
  const [subject, setSubject] = useState(d.subject);
  const [body, setBody] = useState(d.body);
  const [when, setWhen] = useState<When>("now");
  const [mine, setMine] = useState<SendItemView | null>(given ?? null);
  const live = mine ? s.view?.items.find((x) => x.id === mine.id) ?? mine : null;
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [body]);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (live?.status !== "queued" && live?.status !== "sending") return;
    const t = setInterval(() => setTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [live?.status]);
  useEffect(() => {
    if (live?.status === "queued" || live?.status === "sending") {
      const t = setTimeout(() => loadSend(true), Math.max(1500, Date.parse(live.sendAt ?? "") - Date.now() + 1500));
      return () => clearTimeout(t);
    }
  }, [live?.status, live?.sendAt, tick]);
  const first = firstOf(d.toName, to);
  const draft = (): ApproveInput | string => {
    const addr = cleanAddress(to);
    if (!to.trim()) return WORDS.noAddress;
    if (!addr) return WORDS.badAddress;
    if (!subject.trim()) return "Add a subject.";
    if (!body.trim()) return "The note is empty.";
    return { key: d.key, to: addr, toName: d.toName ?? null, subject, body, kind: d.kind, company: d.company ?? null, pipelineId: d.pipelineId ?? null, effect: d.effect ?? null, at: d.followUp ? whenAt(when) : null, id: d.id ?? null };
  };
  if (!s.on) return null;
  const waiting = live && (live.status === "queued" || live.status === "sending");
  const secs = waiting && live.sendAt ? Math.max(0, Math.ceil((Date.parse(live.sendAt) - Date.now()) / 1000)) : 0;
  void tick;
  const done = live?.status === "sent";
  const undo = async () => {
    if (!live) return;
    const c = await cancelSend(live.id);
    toast(c.ok ? c.message : c.error, !c.ok);
    if (c.ok) setMine(null);
  };
  return (
    <Sheet
      title={title ?? `A note to ${first}`}
      onClose={onClose}
      dialog
      className="mn-sheet sd-sheet"
      footer={
        <div className="mn-foot">
          <div className="mn-acts">
            {done ? (
              <span className="sd-sent" role="status">
                <SendIcon /> {WORDS.sentFrom}
                {live.sentAt ? `, ${new Date(live.sentAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}
              </span>
            ) : waiting ? (
              <>
                <span className="sd-going" role="status">
                  {live.status === "sending" || secs === 0 ? "Sending from your Gmail now" : `Sending from your Gmail in ${secs} seconds`}
                </span>
                {live.status === "queued" && (
                  <button type="button" className="btn btn-pine mn-go" onClick={() => void undo()}>
                    {WORDS.undo}
                  </button>
                )}
              </>
            ) : live?.status === "scheduled" ? (
              <>
                <span className="sd-going" role="status">
                  Set to go {live.sendAt ? whenWords(live.sendAt) : "later"} if {first} hasn&apos;t replied
                </span>
                <button type="button" className="btn mn-go" onClick={() => void undo()}>
                  Cancel it
                </button>
              </>
            ) : (
              <>
                <button type="button" className="btn btn-pine mn-go sd-approve" disabled={a.busy} aria-busy={a.busy} onClick={() => void a.go(draft(), (it) => (setMine(it), onQueued?.(it)))}>
                  <SendIcon /> {a.busy ? "Sending" : WORDS.approve}
                </button>
                <a className="btn mn-go" href={`https://mail.google.com/mail/?view=cm&fs=1${cleanAddress(to) ? `&to=${encodeURIComponent(cleanAddress(to)!)}` : ""}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`} target="_blank" rel="noreferrer">
                  <IconExternal size={14} /> Open in Gmail
                </a>
                <button type="button" className="btn mn-go" onClick={() => void copyText(body).then((ok) => toast(ok ? "Note copied." : "That didn't copy. Select the note and copy it yourself.", !ok))}>
                  Copy
                </button>
              </>
            )}
          </div>
          <div className="mn-last">
            <p className="mn-promise">
              <span>
                <b>{WORDS.promise}</b> <span className="mn-promise-more">{WORDS.promiseMore}</span>
              </span>
            </p>
          </div>
        </div>
      }
    >
      <div className="mn">
        {live?.byAgent && !waiting && !done && <p className="mn-now sd-agent">An agent drafted this for you. It goes only when you approve it here.</p>}
        <div className="mn-fields">
          {waiting || done || live?.status === "scheduled" ? (
            <div className="mn-field">
              <span className="mn-k">To</span>
              <span className="mn-v">
                {live.toName ?? ""} <span className="mn-addr">{live.to}</span>
              </span>
            </div>
          ) : (
            <ToInput id={`sd-to-${d.key}`} value={to} onChange={setTo} name={d.toName} />
          )}
          <div className="mn-field">
            <label className="mn-k" htmlFor={`sd-su-${d.key}`}>
              Subject
            </label>
            <input id={`sd-su-${d.key}`} className="mn-subject" value={live?.subject ?? subject} readOnly={!!(waiting || done)} maxLength={160} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor={`sd-bd-${d.key}`}>
            Your note
          </label>
          <textarea ref={box} id={`sd-bd-${d.key}`} className="mn-body" value={(waiting ? live.body : null) ?? body} readOnly={!!(waiting || done)} rows={8} maxLength={5000} onChange={(e) => setBody(e.target.value)} />
        </div>
        {d.followUp && !live && <WhenPick value={when} onChange={setWhen} first={first} can={!!s.view?.replyCheck} />}
        {live?.status === "held" || live?.status === "failed" || live?.status === "replied" ? (
          <p className="mn-warn" role="alert">
            {live.note}
          </p>
        ) : null}
        {a.err && (
          <p className="mn-warn" role="alert">
            {a.err}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/** A button that opens the sheet, for a page that shows a note without its own To field. */
export function SendLaunch({
  d, className = "btn btn-sm", title, label = WORDS.approve, onSent,
}: {
  d: SendDraft | (() => SendDraft);
  className?: string;
  title?: string;
  label?: string;
  /** What the page does once the note went from Gmail (a plan's step): runs even after the sheet closed. */
  onSent?: (it: SendItemView) => void;
}) {
  const s = useSend();
  const [open, setOpen] = useState<SendDraft | null>(null);
  if (!s.on) return null;
  return (
    <>
      <button type="button" className={`${className} sd-approve`} onClick={() => setOpen(typeof d === "function" ? d() : d)}>
        <SendIcon /> {label}
      </button>
      {open && <SendSheet d={open} title={title} onClose={() => setOpen(null)} onQueued={onSent ? (it) => whenSent(it.id, onSent) : undefined} />}
    </>
  );
}

/* ---------- the shell's host ---------- */

/** Mounted once: gives the store its toast, and brings the member back to their note after Google's consent page. */
export function SendHost() {
  const toast = useToast();
  const s = useSend();
  const [back, setBack] = useState<{ id: string; outcome: string } | null>(null);
  useEffect(() => {
    setToaster(toast);
    return () => setToaster(null);
  }, [toast]);
  useEffect(() => {
    // Back from Google's consent page: the hash, or (when the page tidied its address first) the cookie the callback set.
    const fromHash = /#rn-send=(send|senddenied|sendfailed|failed)(?:\.([\w-]{4,40}))?/.exec(window.location.hash);
    const fromCookie = /(?:^|;\s*)rn_send_back=(send|senddenied|sendfailed|failed)(?:\.([\w-]{4,40}))?/.exec(document.cookie);
    const m = fromHash ?? fromCookie;
    if (!m) return;
    document.cookie = "rn_send_back=; Max-Age=0; path=/; SameSite=Lax";
    if (fromHash) window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
    if (m[1] === "send") toast("Google said yes. Your note goes from your Gmail in 30 seconds.");
    else if (m[1] === "senddenied") toast("Google didn't give Merlin permission to send, so nothing was sent. Your note is still here.", true);
    else toast("That didn't work with Google. Nothing was sent. Try again.", true);
    if (m[2]) setBack({ id: m[2], outcome: m[1] });
    loadSend(true);
  }, [toast]);
  const it = back ? s.view?.items.find((x) => x.id === back.id) ?? null : null;
  useEffect(() => {
    if (it && (it.status === "queued" || it.status === "sending")) watchSent(it.id, it.sendAt);
  }, [it]);
  if (!s.on || !it) return null;
  return (
    <SendSheet
      key={it.id}
      item={it.status === "grant" || it.status === "draft" ? null : it}
      d={{ key: it.key, kind: it.kind, to: it.to, toName: it.toName, subject: it.subject ?? "", body: it.body ?? "", company: it.company, pipelineId: it.pipelineId, id: it.status === "draft" ? it.id : null }}
      onClose={() => setBack(null)}
    />
  );
}

/* ---------- Messages: the outbox ---------- */

const ago = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : d.toLocaleDateString([], { month: "short", day: "numeric" });
};
const STATUS_WORDS: Partial<Record<SendItemView["status"], string>> = {
  draft: "Waiting for your approval",
  grant: "Waiting for Google's permission",
  queued: "Going out",
  sending: "Going out",
  scheduled: "Scheduled",
  sent: WORDS.sentFrom,
  replied: "They replied, not sent",
  held: "Held",
  failed: "Not sent",
  cancelled: "Undone",
};

/** Notes an agent queued for the member's tap, notes going out, and the last ones sent from their Gmail. Nothing while sending is off or the outbox is empty. */
export function Outbox() {
  const s = useSend();
  const toast = useToast();
  const [open, setOpen] = useState<SendItemView | null>(null);
  const items = useMemo(() => (s.view?.items ?? []).filter((x) => x.status !== "cancelled"), [s.view]);
  if (!s.on || (!items.length && !s.view?.granted)) return null;
  const stop = () =>
    void stopSending().then((r) => toast(r.ok ? r.message : r.error, !r.ok));
  const waiting = items.filter((x) => x.status === "draft" || x.status === "grant" || x.status === "held");
  const going = items.filter((x) => x.status === "queued" || x.status === "sending" || x.status === "scheduled");
  const done = items.filter((x) => x.status === "sent" || x.status === "replied" || x.status === "failed").slice(0, 5);
  const row = (x: SendItemView) => (
    <li key={x.id} className="sd-row">
      <button type="button" className="sd-row-b" onClick={() => setOpen(x)}>
        <span className="sd-row-t">
          {x.toName ?? (x.to || "No address yet")}
          {x.companyName ? <span className="sd-row-co"> · {x.companyName}</span> : null}
        </span>
        <span className="sd-row-s">
          <span className={`sd-tag sd-tag-${x.status}`}>{STATUS_WORDS[x.status]}</span>
          {x.status === "scheduled" && x.sendAt ? ` ${whenWords(x.sendAt)} if no reply` : x.status === "sent" ? ` ${ago(x.sentAt)}` : x.byAgent && x.status === "draft" ? " Drafted by an agent" : ""}
          {x.threaded ? " · Same thread" : ""}
        </span>
      </button>
      {(x.status === "sent" || x.status === "replied" || x.status === "failed") && (
        <button type="button" className="tp-flink sd-row-x" onClick={() => void dismissSend(x.id)}>
          Clear
        </button>
      )}
      {(x.status === "scheduled" || x.status === "draft" || x.status === "held") && (
        <button type="button" className="tp-flink sd-row-x" onClick={() => void cancelSend(x.id).then((c) => toast(c.ok ? c.message : c.error, !c.ok))}>
          {x.status === "draft" ? "Remove" : "Cancel"}
        </button>
      )}
    </li>
  );
  return (
    <section className="sd-outbox" aria-label="Sent from your Gmail">
      <div className="sd-outbox-h">
        <strong>From your Gmail</strong>
        <span className="sd-sub">
          {WORDS.promise} {s.view ? `${s.view.today} of ${s.view.cap} today.` : ""}
        </span>
        {s.view?.granted && (
          <span className="sd-sub">
            {s.view.from ? `Sends from ${s.view.from}. ` : ""}
            <button type="button" className="tp-flink" onClick={stop}>
              Stop sending from my Gmail
            </button>
          </span>
        )}
      </div>
      {waiting.length > 0 && (
        <>
          <h3 className="sd-h3">Waiting for your approval</h3>
          <ul className="sd-list">{waiting.map(row)}</ul>
        </>
      )}
      {going.length > 0 && (
        <>
          <h3 className="sd-h3">Going out</h3>
          <ul className="sd-list">{going.map(row)}</ul>
        </>
      )}
      {done.length > 0 && (
        <>
          <h3 className="sd-h3">{WORDS.sentFrom}</h3>
          <ul className="sd-list">{done.map(row)}</ul>
        </>
      )}
      {open && (
        <SendSheet
          key={open.id}
          item={open.status === "draft" || open.status === "held" || open.status === "grant" ? null : open}
          d={{ key: open.key, kind: open.kind, to: open.to, toName: open.toName, subject: open.subject ?? "", body: open.body ?? "", company: open.company, pipelineId: open.pipelineId, id: open.status === "draft" ? open.id : null }}
          title={open.byAgent && open.status === "draft" ? "A note waiting for your approval" : undefined}
          onClose={() => setOpen(null)}
        />
      )}
    </section>
  );
}

/** For tests and pages that ask without a hook. */
export const sendIsOn = () => sendSnap().status === "on";
