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
import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { ConversationRec, MessageRec, ReportedMessage } from "@/lib/tableTypes";
import { IconChevron, LockedName, initials, useToast } from "../ui/shared";
import { HIDDEN_COMPANY } from "@/lib/tableFields";
import { Sheet, askSpend, needsSpendConfirm, spendWhat, useFocusTrap, useUi } from "./ui";
import { useLayout } from "./hooks";
import type { FactRef } from "./model";
import { partnerOpener, seatOpener, type SharedCompanies } from "@/lib/partners";
import "./messages.css";
import { IntroLine } from "./IntroLine";
import { Prop } from "../ui/fractions/lazy";
import { EmptyState, PageHead } from "../ui/system";
import { useAppMaybe } from "./shell/pages";
import { Messages2 } from "./messages/Messages2";
import { SEAT_LOCKED_FIRST, openConversation, readM, rememberOne, send, tellUnread, unlockSendCost, unlockSendPrice, useConversationAbout, useConversations, when, type Act, type ActAnswer } from "./messages/data";

export { useUnread, openConversation, startSeatMessage } from "./messages/data";

const MAX = 2000;

/* ---------- words ---------- */

const firstOf = (name: string) => name.trim().split(/\s+/)[0] || name;

/** "Fractional VP Sales, 2023 to 2024", from what the viewer can see of the seat. */
const seatDetail = (c: ConversationRec) => [c.about.seat, c.about.years].filter(Boolean).join(", ");

/** The line above the first message: why this conversation exists. */
function contextLine(c: ConversationRec): string {
  if (c.kind === "partners") return c.started ? `You and ${c.with.first} are peers on Merlin.` : `${c.with.first} found you in Peers and wants to connect.`;
  if (c.kind === "team") {
    const co = c.about.company && c.about.company !== HIDDEN_COMPANY ? c.about.company : "a company";
    return c.started ? `You asked ${c.with.first} to team up on ${co}. This is your shared thread.` : `${c.with.first} asked you to team up on ${co}. This is your shared thread.`;
  }
  const d = seatDetail(c);
  const at = `${c.about.company && c.about.company !== HIDDEN_COMPANY ? c.about.company : "a company that's hiring"}${d ? ` (${d})` : ""}`;
  // Opened by itself when the seat holder claimed their seat through the invite (Invite to connect).
  if (c.kind === "invite")
    return c.started
      ? `${c.with.first} claimed their seat at ${at} through your invite. You're connected as referral partners.`
      : `You claimed your seat at ${at} through ${c.with.first}'s invite. You're connected as referral partners.`;
  return c.started ? `You wrote to ${c.with.first} about their seat at ${at}.` : `${c.with.first} unlocked your seat at ${at} and wants to talk.`;
}

/** Why the reply box is gone, said plainly. */
function closedLine(c: ConversationRec): string | null {
  if (c.blocked) return `You blocked ${c.with.first}. They can't start a conversation with you or write here.`;
  if (c.status !== "closed") return null;
  if (c.closedBy === "you") return `You said not now. Write again any time to reopen it.`;
  return c.started ? "They're not taking intros right now." : `${c.with.first} closed this conversation.`;
}


/* ---------- the page ---------- */

/** Messages: the new look's three columns (messages/Messages2.tsx), or the old look's list and conversation. */
export function MessagesPage(p: { onBack: () => void; openCompany: (id: string) => void }) {
  const app = useAppMaybe();
  return app?.ui2 ? <Messages2 /> : <MessagesOld {...p} />;
}

function MessagesOld({ onBack, openCompany }: { onBack: () => void; openCompany: (id: string) => void }) {
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
                {c.kind === "partners" ? (
                  "Peers"
                ) : c.kind === "team" ? (
                  <>Team: {c.about.company === HIDDEN_COMPANY ? <LockedName seed={c.about.companyId} /> : c.about.company}</>
                ) : (
                  <>
                    {c.about.company === HIDDEN_COMPANY ? <LockedName seed={c.about.companyId} /> : c.about.company}
                    {c.about.seat ? ` · ${c.about.seat}` : ""}
                  </>
                )}
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
    <EmptyState spot="noMessages" title="No messages yet" action={{ label: "Go to the table", onClick: onBack }}>
      When you unlock who held a seat and they&apos;re a member, you can write to them from the record. Their replies land here.
    </EmptyState>
  );

  return (
    <div className="page-wide ms-page">
      <PageHead title="Messages" art={list?.length ? <Prop name="bubbles" height={72} on="bg" /> : undefined} />
      {failed && !list ? (
        <EmptyState spot="offline" title="Your messages didn't load" role="alert" action={{ label: "Try again", onClick: () => void load() }}>
          {failed}
        </EmptyState>
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
  // A phone's conversation is full screen and aria-modal: Tab stays inside it.
  useFocusTrap(boxRef, !!phone);
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
          {c.with.title && <p className="ms-head-sub">{c.with.title}</p>}
          {/* The company is the seat being talked about, not where this person works. A conversation from Referral partners is about no seat. */}
          {c.kind === "partners" ? (
            <p className="ms-head-sub">Peers on Merlin</p>
          ) : c.kind === "team" ? (
            <p className="ms-head-sub">
              Your team thread on {c.about.company === HIDDEN_COMPANY ? <LockedName seed={c.about.companyId} /> : c.about.company || "a company"}
              {" · "}
              <button type="button" className="ms-link" onClick={() => openCompany(c.about.companyId)}>
                Open the record
              </button>
            </p>
          ) : (
            <p className="ms-head-sub">
              {c.started ? "About their " : "About your "}
              {c.about.seat ? `${c.about.seat} ` : ""}seat at {c.about.company === HIDDEN_COMPANY ? <LockedName seed={c.about.companyId} /> : c.about.company || "a company"}
              {c.about.company && (
                <>
                  {" · "}
                  <button type="button" className="ms-link" onClick={() => openCompany(c.about.companyId)}>
                    Open the record
                  </button>
                </>
              )}
            </p>
          )}
        </div>
        <div className="ms-head-acts">
          {/* Not now is the answer to an intro, so only the member who was written to has it. */}
          {c.status === "open" && !c.blocked && !c.started && (
            <button
              type="button"
              className="btn btn-sm"
              title={`Close this for now. ${c.with.first} sees that you're not taking intros right now. Write again any time to reopen it.`}
              disabled={!!busy} aria-busy={busy === "close"} onClick={() => void run("close", { type: "message.close", conversationId: c.id }, (r) => r.message && toast(r.message))}>
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
      {/* An intro at the seat's company: logged by the member who asked, marked made by either side (IntroLine.tsx, Your pipeline). */}
      <IntroLine c={c} />
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
 * Opens the compose sheet with an opener they can change ("Hi Ana, I saw you held the fractional
 * CMO seat at Acme…", lib/partners.ts seatOpener). Once a conversation about this seat exists it
 * becomes "Open conversation" (with the unread count when they replied), never a second opener.
 */
export function MessageButton({
  engagementId,
  name,
  company,
  role,
  fn,
  unlockFirst,
}: {
  engagementId: string;
  name: string;
  company: string;
  role: string | null;
  fn: string | null;
  /** What has to open before the message can go (a company named for one search only): the sheet's button unlocks it, then sends. */
  unlockFirst?: FactRef | null;
}) {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const first = firstOf(name);
  const conv = useConversationAbout(engagementId);
  if (conv) return <OpenConversation conv={conv} first={first} />;
  return (
    <>
      <button ref={btn} type="button" className="btn btn-sm btn-pine" onClick={() => setOpen(true)}>
        Message {first}
      </button>
      {open && (
        <Compose
          to={{ engagementId }}
          first={first}
          about={`About the ${role || fn ? `${role || fn} ` : ""}seat at ${company}.`}
          opener={seatOpener({ first, role, fn, company, myTitle: ui.me.title, myFn: ui.me.function })}
          onClose={() => setOpen(false)}
          restore={() => btn.current}
          unlockFirst={unlockFirst ?? null}
        />
      )}
    </>
  );
}

export { SEAT_LOCKED_FIRST, unlockSendCost, unlockSendPrice } from "./messages/data";

/** "Open conversation", with what happened last in it, where a conversation with them already exists. */
function OpenConversation({ conv, first }: { conv: ConversationRec; first: string }) {
  const ui = useUi();
  const last = conv.messages[conv.messages.length - 1];
  const state = conv.blocked
    ? `You blocked ${first}.`
    : conv.status === "closed" && conv.closedBy === "them"
      ? `${first} isn't taking intros right now.`
      : conv.unread
        ? `${first} replied.`
        : last && !last.mine
          ? `${first} wrote to you.`
          : `You wrote to ${first}.`;
  return (
    <>
      <button type="button" className="btn btn-sm btn-pine tp-has-badge ms-rec-open" onClick={() => openConversation(ui.openPage, conv.id)}>
        Open conversation
        {conv.unread > 0 && (
          <span className="tp-badge tp-badge-dot num" aria-label={`${conv.unread} unread`}>
            {conv.unread}
          </span>
        )}
      </button>
      <span className="ms-rec-state">{state}</span>
    </>
  );
}

/**
 * "Message" a member in Fractionals ("Connect" on Referral partners before it): a conversation about
 * no seat (message.connect), with an opener they can change (lib/partners.ts partnerOpener). One per
 * pair: once there is a conversation with them, it opens that one instead.
 */
export function ConnectButton({
  member,
  conversationId,
  label = "Connect",
  className = "btn btn-sm btn-pine",
  shared,
}: {
  member: { id: string; first: string };
  conversationId?: string | null;
  label?: React.ReactNode;
  className?: string;
  /** Companies in the member's Crystal Ball this fractional serves (named only where the member has them unlocked): said in the first message. */
  shared?: SharedCompanies | null;
}) {
  const ui = useUi();
  const [open, setOpen] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const known = conversationId ?? sent;
  if (known)
    return (
      <button type="button" className={className.replace(" btn-pine", "")} onClick={() => openConversation(ui.openPage, known)}>
        {label === "Connect" ? "Open conversation" : label}
      </button>
    );
  return (
    <>
      <button ref={btn} type="button" className={className} onClick={() => setOpen(true)}>
        {label}
      </button>
      {open && (
        <Compose
          to={{ memberId: member.id }}
          first={member.first}
          about="From Peers: a fractional who serves the same kind of clients."
          opener={partnerOpener({ first: member.first, myTitle: ui.me.title, myFn: ui.me.function, icp: ui.me.icp, shared })}
          onClose={() => setOpen(false)}
          onSent={(c) => setSent(c.id)}
          restore={() => btn.current}
        />
      )}
    </>
  );
}

function Compose({
  to,
  first,
  about,
  opener,
  onClose,
  onSent,
  restore,
  unlockFirst,
}: {
  /** A seat holder (a conversation about their seat), or a member from Referral partners (about no seat). */
  to: { engagementId: string } | { memberId: string };
  first: string;
  /** What the conversation is about, the line over the message. */
  about: string;
  opener: string;
  onClose: () => void;
  onSent?: (c: ConversationRec) => void;
  restore: () => HTMLElement | null;
  /** Unlock this first, then send (the button says "Unlock and send" with the price). */
  unlockFirst?: FactRef | null;
}) {
  const ui = useUi();
  const toast = useToast();
  const [text, setText] = useState(opener);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  /**
   * What has to open before this can be sent: given, or learned from the server's refusal (who held
   * the seat is locked for the member). The message stays as typed; the button unlocks, then sends.
   */
  const [needs, setNeeds] = useState<FactRef | null>(unlockFirst ?? null);
  const id = useId();
  const len = [...text].length;
  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (busy || !text.trim() || len > MAX) return;
    setErr(null);
    if (needs) {
      // One question, here, before anything is spent: what the credits open, and that the message then sends.
      // Nothing reads "Sending" while it is asked; the unlock after it doesn't ask again (asked).
      const cost = unlockSendCost(ui.me, needs);
      if (needsSpendConfirm(cost) && ui.me.credits >= cost) {
        const yes = await askSpend({ cost, what: spendWhat(needs), credits: ui.me.credits, then: `Then your message to ${first} sends.`, go: "Unlock and send" });
        if (!yes) return;
      }
      setBusy(true);
      const ok = await ui.unlock(needs, { asked: true });
      if (ok === false) return setBusy(false);
      setNeeds(null);
    } else setBusy(true);
    const r = await send("engagementId" in to ? { type: "message.start", engagementId: to.engagementId, text: text.trim() } : { type: "message.connect", memberId: to.memberId, text: text.trim() });
    setBusy(false);
    if (r.error && "engagementId" in to && SEAT_LOCKED_FIRST.test(r.error)) {
      // Never a dead end: the same sheet unlocks who held the seat and sends, the text kept.
      setNeeds({ entity: "engagement", id: to.engagementId, field: "operator" });
      return setErr(`To write to ${first}, unlock who held this seat first. Your message is kept.`);
    }
    if (r.error) return setErr(r.error);
    const c = r.conversation;
    if (c) {
      rememberOne(c);
      onSent?.(c);
    }
    onClose();
    toast(r.message || "Sent.", false, { action: { label: "Open conversation", onClick: () => (c ? openConversation(ui.openPage, c.id) : ui.openPage("messages")) } });
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
            {busy ? "Sending" : needs ? `Unlock and send · ${unlockSendPrice(ui.me, needs)}` : "Send"}
          </button>
        </div>
      }
    >
      <form id={`${id}-f`} onSubmit={submit} className="ms-compose-form">
        <p className="ms-compose-about">
          {about} {first} sees your name and title, never your email.
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

