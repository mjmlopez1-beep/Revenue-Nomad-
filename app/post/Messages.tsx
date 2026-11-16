"use client";

/**
 * Messages between members: the Messages page (the list, newest first, and one conversation at
 * a time), the compose sheet a member opens from a seat holder they unlocked ("Message Ana"),
 * the unread count for the badges, and the admins' list of reported messages.
 *
 * The list comes from GET /api/table?messages=1, and every change is a POST action
 * (message.start, .send, .close, .block, .report, .read). Neither member's email or phone is
 * ever on screen. On a phone a conversation fills the screen and the reply box sits at the
 * bottom, above the keyboard.
 */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ConversationRec, MessageRec, ReportedMessage } from "@/lib/tableTypes";
import { IconChevron, LockedName, initials, post, useToast } from "../ui/shared";
import { HIDDEN_COMPANY } from "@/lib/tableFields";
import { Sheet, useUi } from "./ui";
import { useLayout } from "./hooks";
import "./messages.css";

const MAX = 2000;

/* ---------- the unread count ---------- */

/** Sent on window when the unread count changes here (a conversation was read), so the badges follow at once. */
const UNREAD_EVENT = "tp-unread";
const tellUnread = (n: number) => window.dispatchEvent(new CustomEvent(UNREAD_EVENT, { detail: n }));

/**
 * Conversations with something unread: the view's count, kept fresh by a light check every
 * minute while the tab is in view, and at once when Messages reads one.
 */
export function useUnread(fromView: number | undefined): number {
  const [n, setN] = useState(fromView ?? 0);
  useEffect(() => setN(fromView ?? 0), [fromView]);
  useEffect(() => {
    const on = (e: Event) => setN(Number((e as CustomEvent).detail) || 0);
    window.addEventListener(UNREAD_EVENT, on);
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/table?unread=1", { cache: "no-store" });
        const j = await r.json();
        if (r.ok && typeof j.unread === "number") setN(j.unread);
      } catch {}
    };
    const t = setInterval(tick, 60_000);
    return () => {
      clearInterval(t);
      window.removeEventListener(UNREAD_EVENT, on);
    };
  }, []);
  return n;
}

/* ---------- words ---------- */

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Fractional VP Sales, 2023 to 2024", from what the viewer can see of the seat. */
const seatDetail = (c: ConversationRec) => [c.about.seat, c.about.years].filter(Boolean).join(", ");

/** The line above the first message: why this conversation exists. */
function contextLine(c: ConversationRec): string {
  const d = seatDetail(c);
  const at = `${c.about.company && c.about.company !== HIDDEN_COMPANY ? c.about.company : "a company that's hiring"}${d ? ` (${d})` : ""}`;
  return c.started ? `You wrote to ${c.with.first} about their seat at ${at}.` : `${c.with.first} unlocked your seat at ${at} and wants to talk.`;
}

/** Why the reply box is gone, said plainly. */
function closedLine(c: ConversationRec): string | null {
  if (c.blocked) return `You blocked ${c.with.first}. They can't start a conversation with you or write here.`;
  if (c.status !== "closed") return null;
  if (c.closedBy === "you") return `You said not now. Write again any time to reopen it.`;
  return c.started ? "They're not taking intros right now." : `${c.with.first} closed this conversation.`;
}

/** The opener a member can edit before sending. */
export function suggestedOpener(first: string, company: string, seat: string | null): string {
  const what = seat ? `the ${seat} seat` : "a fractional seat";
  return `Hi ${first}, I saw you held ${what} at ${company}. I'm looking at them now and would love to hear how it went. Open to a quick chat?`;
}

function when(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", ...(d.getFullYear() === now.getFullYear() ? {} : { year: "numeric" }) });
}

/* ---------- data ---------- */

type Act = { type: string; [k: string]: unknown };
type ActAnswer = { message?: string; conversation?: ConversationRec; unread?: number; error?: string };
const send = (action: Act) => post<ActAnswer>({ action });

function useConversations() {
  const [list, setList] = useState<ConversationRec[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch("/api/table?messages=1", { cache: "no-store" });
      const j = await r.json();
      if (!r.ok) return setFailed(j?.error || "Messages didn't load. Try again.");
      setFailed(null);
      setList(j.conversations ?? []);
      if (typeof j.unread === "number") tellUnread(j.unread);
    } catch {
      setFailed("We couldn't reach Trading Post. Check your connection and try again.");
    }
  }, []);
  useEffect(() => {
    void load();
    // New replies show up while the page is open, without a reload.
    const t = setInterval(() => document.visibilityState === "visible" && void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);
  /** Put one conversation's new state in the list (the answer to an action). */
  const put = useCallback((c: ConversationRec) => {
    setList((l) => {
      const rest = (l ?? []).filter((x) => x.id !== c.id);
      return [c, ...rest].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    });
  }, []);
  return { list, failed, load, put };
}

/* ---------- the page ---------- */

/** The conversation id in the address bar (?m=), from a message email's link. Read once, when the page opens. */
function readM(): string | null {
  try {
    return new URLSearchParams(window.location.search).get("m");
  } catch {
    return null;
  }
}
export function MessagesPage({ onBack, openCompany }: { onBack: () => void; openCompany: (id: string) => void }) {
  const phone = useLayout() === "phone";
  const { list, failed, load, put } = useConversations();
  const [openId, setOpenId] = useState<string | null>(() => readM());
  const open = list?.find((c) => c.id === openId) ?? null;
  // On a wide screen the newest conversation is open from the start.
  useEffect(() => {
    if (!phone && list?.length && !openId) setOpenId(list[0].id);
  }, [phone, list, openId]);

  // Opening a conversation with something unread marks it read.
  const unread = open?.unread ?? 0;
  useEffect(() => {
    if (!open || unread === 0) return;
    void send({ type: "message.read", conversationId: open.id }).then((r) => {
      if (r.conversation) put(r.conversation);
      if (typeof r.unread === "number") tellUnread(r.unread);
    });
  }, [open?.id, unread, put]); // eslint-disable-line react-hooks/exhaustive-deps

  const listEl = (
    <div className="ms-list" role="list" aria-label="Conversations">
      {list?.map((c) => {
        const last = c.messages[c.messages.length - 1];
        return (
          <button
            key={c.id}
            type="button"
            role="listitem"
            className={`ms-row${c.id === openId ? " on" : ""}${c.unread ? " unread" : ""}`}
            aria-current={c.id === openId ? "true" : undefined}
            onClick={() => setOpenId(c.id)}
          >
            <span className="ms-av" aria-hidden>
              {initials(c.with.name)}
            </span>
            <span className="ms-row-main">
              <span className="ms-row-top">
                <span className="ms-row-name">{c.with.name}</span>
                <span className="ms-row-when num">{when(c.updatedAt)}</span>
              </span>
              <span className="ms-row-about">
                {c.about.company === HIDDEN_COMPANY ? <LockedName seed={c.about.companyId} /> : c.about.company}
                {c.about.seat ? ` · ${c.about.seat}` : ""}
              </span>
              <span className="ms-row-last">
                {last ? `${last.mine ? "You: " : ""}${last.removed ? "An admin removed this message." : last.text}` : ""}
              </span>
            </span>
            {c.unread > 0 && (
              <span className="ms-dot num" aria-label={`${c.unread} unread`}>
                {c.unread}
              </span>
            )}
            {c.status === "closed" && !c.unread && <span className="ms-closed">Closed</span>}
          </button>
        );
      })}
    </div>
  );

  const empty = (
    <div className="ms-empty">
      <h2>No messages yet</h2>
      <p>When you unlock who held a seat and they&apos;re a member, you can write to them from the record. Their replies land here.</p>
      <button type="button" className="btn btn-pine" onClick={onBack}>
        Go to the table
      </button>
    </div>
  );

  return (
    <div className="tp-page ms-page">
      <button type="button" className="tp-back" onClick={onBack}>
        <IconChevron dir="left" /> Back to the table
      </button>
      <h1 className="tp-page-h">Messages</h1>
      {failed && !list ? (
        <div className="ms-empty" role="alert">
          <p>{failed}</p>
          <button type="button" className="btn" onClick={() => void load()}>
            Try again
          </button>
        </div>
      ) : !list ? (
        <p className="muted" role="status">
          Opening your messages
        </p>
      ) : !list.length ? (
        empty
      ) : phone ? (
        <>
          {listEl}
          {open && <Thread key={open.id} c={open} put={put} onClose={() => setOpenId(null)} openCompany={openCompany} phone />}
        </>
      ) : (
        <div className="ms-wrap">
          {listEl}
          {open ? <Thread key={open.id} c={open} put={put} openCompany={openCompany} /> : <div className="ms-thread ms-thread-none">Pick a conversation.</div>}
        </div>
      )}
    </div>
  );
}

/* ---------- one conversation ---------- */

/** On a phone the thread takes the visible part of the screen, so the reply box rides above the keyboard. */
function useVisualViewport(on: boolean, ref: React.RefObject<HTMLElement | null>) {
  useLayoutEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    if (!on || !vv) return;
    const fit = () => {
      const el = ref.current;
      if (!el) return;
      el.style.height = `${vv.height}px`;
      el.style.transform = `translateY(${vv.offsetTop}px)`;
    };
    fit();
    vv.addEventListener("resize", fit);
    vv.addEventListener("scroll", fit);
    return () => {
      vv.removeEventListener("resize", fit);
      vv.removeEventListener("scroll", fit);
    };
  }, [on, ref]);
}

function Thread({
  c,
  put,
  onClose,
  openCompany,
  phone,
}: {
  c: ConversationRec;
  put: (c: ConversationRec) => void;
  onClose?: () => void;
  openCompany: (id: string) => void;
  phone?: boolean;
}) {
  const toast = useToast();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [asking, setAsking] = useState<"block" | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const id = useId();
  useVisualViewport(!!phone, boxRef);

  // Newest at the bottom, in view.
  const count = c.messages.length;
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);
  // A phone's thread is a layer of its own: Esc and the back button close it, and the page under it doesn't scroll.
  useEffect(() => {
    if (!phone) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose?.();
    document.addEventListener("keydown", onKey);
    boxRef.current?.focus();
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener("keydown", onKey);
    };
  }, [phone, onClose]);

  const run = async (what: string, action: Act, done?: (r: ActAnswer) => void) => {
    setBusy(what);
    setErr(null);
    const r = await send(action);
    setBusy(null);
    if (r.error) {
      setErr(r.error);
      return false;
    }
    if (r.conversation) put(r.conversation);
    if (typeof r.unread === "number") tellUnread(r.unread);
    done?.(r);
    return true;
  };
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    const v = text.trim();
    if (!v || busy) return;
    if (await run("send", { type: "message.send", conversationId: c.id, text: v })) {
      setText("");
      inputRef.current?.focus();
    }
  };
  const len = [...text].length;
  const note = closedLine(c);
  const reportedNote = (m: MessageRec) =>
    m.removed ? <span className="ms-msg-meta">An admin removed this message.</span> : m.reported ? <span className="ms-msg-meta">You reported this message.</span> : null;

  return (
    <section
      ref={boxRef}
      className={`ms-thread${phone ? " ms-thread-phone" : ""}`}
      aria-labelledby={`${id}-h`}
      tabIndex={phone ? -1 : undefined}
      role={phone ? "dialog" : undefined}
      aria-modal={phone ? true : undefined}
    >
      <header className="ms-head">
        {phone && (
          <button type="button" className="tp-iconbtn ms-head-back" aria-label="Back to your messages" onClick={onClose}>
            <IconChevron dir="left" size={18} />
          </button>
        )}
        <div className="ms-head-main">
          <h2 className="ms-head-name" id={`${id}-h`}>
            {c.with.name}
          </h2>
          <p className="ms-head-sub">
            {[c.with.title, c.about.company === HIDDEN_COMPANY ? "" : c.about.company].filter(Boolean).join(" · ")}
            {c.about.company === HIDDEN_COMPANY && (
              <>
                {c.with.title ? " · " : ""}
                <LockedName seed={c.about.companyId} />
              </>
            )}
            {c.about.company && (
              <>
                {" · "}
                <button type="button" className="ms-link" onClick={() => openCompany(c.about.companyId)}>
                  Open the record
                </button>
              </>
            )}
          </p>
        </div>
        <div className="ms-head-acts">
          {c.status === "open" && !c.blocked && (
            <button type="button" className="btn btn-sm" disabled={!!busy} aria-busy={busy === "close"} onClick={() => void run("close", { type: "message.close", conversationId: c.id }, (r) => r.message && toast(r.message))}>
              Not now
            </button>
          )}
          {c.blocked ? (
            <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => void run("block", { type: "message.block", conversationId: c.id, on: false }, (r) => r.message && toast(r.message))}>
              Unblock
            </button>
          ) : (
            <button type="button" className="btn btn-sm btn-ghost" disabled={!!busy} onClick={() => setAsking("block")}>
              Block
            </button>
          )}
        </div>
      </header>
      {asking === "block" && (
        <div className="ms-ask" role="group" aria-label={`Block ${c.with.first}?`}>
          <p>Block {c.with.first}? They can&apos;t start a conversation with you, and this one closes. They see that you&apos;re not taking intros right now.</p>
          <span className="ms-ask-acts">
            <button
              type="button"
              className="btn btn-sm btn-pine"
              autoFocus
              disabled={!!busy}
              aria-busy={busy === "block"}
              onClick={() => void run("block", { type: "message.block", conversationId: c.id }, (r) => (setAsking(null), r.message && toast(r.message)))}
            >
              Block {c.with.first}
            </button>
            <button type="button" className="btn btn-sm btn-ghost" onClick={() => setAsking(null)}>
              Cancel
            </button>
          </span>
        </div>
      )}
      <div ref={scrollRef} className="ms-scroll" aria-live="polite" aria-relevant="additions">
        <p className="ms-context">{contextLine(c)}</p>
        {c.messages.map((m) => (
          <div key={m.id} className={`ms-msg${m.mine ? " mine" : ""}`}>
            <div className={`ms-bubble${m.removed ? " removed" : ""}`}>{m.removed ? "Removed by an admin." : m.text}</div>
            <div className="ms-msg-foot">
              <span className="ms-msg-meta num">{when(m.at)}</span>
              {reportedNote(m)}
              {!m.mine && !m.reported && !m.removed && (
                <button
                  type="button"
                  className="ms-report"
                  disabled={!!busy}
                  onClick={() => void run("report", { type: "message.report", conversationId: c.id, messageId: m.id }, (r) => r.message && toast(r.message))}
                >
                  Report
                </button>
              )}
            </div>
          </div>
        ))}
        {note && <p className="ms-note">{note}</p>}
      </div>
      {c.canSend ? (
        <form className="ms-reply" onSubmit={submit}>
          <label className="sr-only" htmlFor={`${id}-t`}>
            Reply to {c.with.first}
          </label>
          <textarea
            ref={inputRef}
            id={`${id}-t`}
            className="input ms-input"
            rows={phone ? 1 : 3}
            placeholder={`Write to ${c.with.first}`}
            value={text}
            maxLength={MAX + 200}
            onChange={(e) => {
              setText(e.target.value);
              if (err) setErr(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
            }}
            aria-invalid={!!err || len > MAX}
            aria-describedby={err ? `${id}-err` : undefined}
          />
          <button type="submit" className="btn btn-pine ms-send" disabled={!text.trim() || len > MAX || !!busy} aria-busy={busy === "send"}>
            {busy === "send" ? "Sending" : "Send"}
          </button>
          {(err || len > MAX - 200) && (
            <p className={`ms-reply-note${err || len > MAX ? " bad" : ""}`} id={`${id}-err`} role={err ? "alert" : undefined}>
              {err ?? (len > MAX ? `That's ${len.toLocaleString("en-US")} characters. Keep it to 2,000.` : `${(MAX - len).toLocaleString("en-US")} characters left`)}
            </p>
          )}
        </form>
      ) : err ? (
        <p className="ms-reply-note bad" role="alert">
          {err}
        </p>
      ) : null}
    </section>
  );
}

/* ---------- writing from the record ---------- */

/**
 * "Message Ana" under a seat holder the member unlocked who is a member who has signed in.
 * Opens the compose sheet with an opener they can change.
 */
export function MessageButton({ engagementId, name, company, seat }: { engagementId: string; name: string; company: string; seat: string | null }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const first = firstOf(name);
  return (
    <>
      <button ref={btn} type="button" className="btn btn-sm btn-pine" onClick={() => setOpen(true)}>
        Message {first}
      </button>
      {open && <Compose engagementId={engagementId} name={name} company={company} seat={seat} onClose={() => setOpen(false)} restore={() => btn.current} />}
    </>
  );
}

function Compose({ engagementId, name, company, seat, onClose, restore }: { engagementId: string; name: string; company: string; seat: string | null; onClose: () => void; restore: () => HTMLElement | null }) {
  const ui = useUi();
  const toast = useToast();
  const first = firstOf(name);
  const [text, setText] = useState(() => suggestedOpener(first, company, seat));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = useId();
  const len = [...text].length;
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !text.trim() || len > MAX) return;
    setBusy(true);
    setErr(null);
    const r = await send({ type: "message.start", engagementId, text: text.trim() });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onClose();
    toast(r.message || "Sent.", false, { action: { label: "Open Messages", onClick: () => ui.openPage("messages") } });
  };
  return (
    <Sheet
      title={`Message ${first}`}
      onClose={onClose}
      dialog
      className="ms-compose"
      restore={restore}
      footer={
        <div className="ms-compose-acts">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" form={`${id}-f`} className="btn btn-pine" disabled={busy || !text.trim() || len > MAX} aria-busy={busy}>
            {busy ? "Sending" : "Send"}
          </button>
        </div>
      }
    >
      <form id={`${id}-f`} onSubmit={submit} className="ms-compose-form">
        <p className="ms-compose-about">
          About the {seat ? `${seat} ` : ""}seat at {company}. {first} sees your name and title, never your email.
        </p>
        <label className="tp-lbl" htmlFor={`${id}-t`}>
          Your message
        </label>
        <textarea
          id={`${id}-t`}
          className="input ms-compose-input"
          rows={6}
          value={text}
          autoFocus
          maxLength={MAX + 200}
          onChange={(e) => {
            setText(e.target.value);
            if (err) setErr(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) void submit();
          }}
          aria-invalid={!!err || len > MAX}
          aria-describedby={`${id}-n`}
        />
        <p className={`ms-reply-note${err || len > MAX ? " bad" : ""}`} id={`${id}-n`} role={err ? "alert" : undefined}>
          {err ?? (len > MAX ? `That's ${len.toLocaleString("en-US")} characters. Keep it to 2,000.` : "Change it however you like. Replies land in Messages.")}
        </p>
      </form>
    </Sheet>
  );
}

/* ---------- admins: reported messages ---------- */

/** The admins' list of reported messages. Each shows the one message, never the rest of its conversation. */
export function ReportedMessages({ list, refresh }: { list: ReportedMessage[]; refresh?: () => Promise<void> | void }) {
  const toast = useToast();
  const [gone, setGone] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const shown = list.filter((r) => !gone.has(r.id));
  const decide = async (r: ReportedMessage, decision: "keep" | "remove") => {
    setBusy(r.id);
    const a = await send({ type: "message.review", reportId: r.id, decision });
    setBusy(null);
    if (a.error) return toast(a.error, true);
    setGone((g) => new Set(g).add(r.id));
    if (a.message) toast(a.message);
    void refresh?.();
  };
  return (
    <section className="tp-card ms-reports" aria-labelledby="ms-reports-h">
      <h2 className="tp-card-h" id="ms-reports-h">
        Reported messages
      </h2>
      {!shown.length ? (
        <p className="cr-note">Nothing to review. A message lands here when the member who got it reports it. You see that one message and nothing else from the conversation.</p>
      ) : (
        shown.map((r) => (
          <div key={r.id} className="ms-report-row">
            <p className="ms-report-text">{r.text}</p>
            <p className="ms-report-who">
              From {r.from}, reported by {r.reporter}
            </p>
            <span className="ms-report-acts">
              <button type="button" className="btn btn-sm" disabled={busy === r.id} onClick={() => void decide(r, "keep")}>
                Keep
              </button>
              <button type="button" className="btn btn-sm btn-ghost" disabled={busy === r.id} onClick={() => void decide(r, "remove")}>
                Remove
              </button>
            </span>
          </div>
        ))
      )}
    </section>
  );
}

