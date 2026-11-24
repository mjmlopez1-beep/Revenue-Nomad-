"use client";

/**
 * The drafted note: a move's Draft button opens it. A short note the member can edit, written from
 * a template for the situation (someone they know, asking for an intro, the seat holder, an invite
 * to connect, an open role), in their own voice when they saved one (lib/moves.ts draftNote,
 * lib/voice.ts). No service writes it: the words are templates, filled with facts already on the
 * member's own screen and nothing else. Never a locked fact, a rate or anything of another member's.
 *
 * Merlin drafts, the member sends: Copy, Open in Gmail (a compose link with the subject and the
 * note, and the address only when the member already has it: their own contacts, or a contact they
 * unlocked) or another mail app, and Message on Merlin for a seat holder who is a member. Nothing
 * here sends on its own. What they edit stays in this sheet. "Mark as sent", or using the note,
 * puts the company in the member's pipeline at Sent (lib/pipeline.ts) and the move leaves today's.
 *
 * With Approve and send on (lib/send, RN_SEND): To is a field (the address on file, or one they
 * type), and "Approve and send" sends the note from the member's own Gmail after 30 seconds to
 * undo. Once it went, the server does what Mark as sent does (`sendAs.effect`), and the page's
 * own follow-on runs (`sendAs.onGmailSent`). Off: the sheet is exactly as before.
 */
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import type { RadarRow } from "@/lib/radar/types";
import { buyerWhat, knowLine, type Move } from "@/lib/moves";
import { draftNote, gmailLink, mailtoLink, noteFacts, type NoteFacts } from "@/lib/moveNote";
import { firstOf } from "@/lib/partners";
import { webLink } from "@/lib/links";
import { IconExternal, initials, useToast } from "../ui/shared";
import { copyText } from "./hooks";
import { Sheet, useUi } from "./ui";
import { startSeatMessage, openConversation } from "./Messages";
import { VoiceLine } from "./Voice";
import { IntroBlock } from "./network/IntroWhy";
import { STRENGTH_WORDS, type Warmth } from "@/lib/google/types";
import { WarmthChip, type Strength } from "../ui/system";
import type { IntroPlanView } from "@/lib/paths/intro";
import { moveSent } from "@/lib/moves";
import type { SendEffect, SendItemView, SendKind } from "@/lib/send/types";
import { SendIcon, SendPromise, ToInput, draftKey, useApprove } from "./send/Send";
import { useSend, whenSent } from "./send/sendStore";
import { loadPipeline } from "./pipelineStore";
import "./movenote.css";

const MAX = 2000;

/**
 * The chip by the person the note is to. From Your network (`strength`: the sheet says how strong the
 * relationship is), the strength words: Strong, Good, Fading or Cold, in the same colours as the warmth.
 */
export function WhoWarmth({ w, strength }: { w: Warmth; strength?: boolean }) {
  return <WarmthChip warmth={strength ? (STRENGTH_WORDS[w] as Strength) : w} />;
}

export function NoteSheet({
  m, row, me, onClose, onSent, onClaude, facts: given, sentLabel = "Mark as sent", onUsed, intro, sendAs,
}: {
  m: Move;
  row: RadarRow;
  me: Me;
  onClose: () => void;
  /** Mark as sent, or sent on Merlin ("merlin"). */
  onSent: (channel?: "merlin") => void;
  /** The note was used (Open in Gmail, another mail app, Copy): it goes into the member's pipeline (lib/pipeline.ts). */
  onUsed?: () => void;
  onClaude: () => void;
  /** Your network: the note's facts as that page has them (an "ask" for an introduction), instead of the move's. */
  facts?: NoteFacts | null;
  /** The last button's words (Your network has no move to mark done). */
  sentLabel?: string;
  /** Your network: "Why Jake", and who this person can introduce the member to (lib/paths/intro.ts), or that the note asks generally. */
  intro?: { plan: IntroPlanView | null; first: string; strength: string | null } | null;
  /**
   * Approve and send: what a sent note does on the server (default: the company into the pipeline
   * at Sent, from a record) and what the page does after (default: nothing more).
   */
  sendAs?: { effect?: SendEffect; kind?: SendKind; onGmailSent?: (it: SendItemView) => void };
}) {
  const ui = useUi();
  const toast = useToast();
  const facts = useMemo(() => given ?? noteFacts(m, row, me, typeof window === "undefined" ? "" : window.location.origin), [given, m, row, me]);
  const voice = me.voice ?? null;
  const draft = useMemo(() => (facts ? draftNote(facts, voice) : null), [facts, voice]);
  const [subject, setSubject] = useState(draft?.subject ?? "");
  const [body, setBody] = useState(draft?.body ?? "");
  // The words they typed stay theirs: a voice saved or removed while the sheet is open rewrites the note only when it is still as drafted.
  const drafted = useRef({ subject: draft?.subject ?? "", body: draft?.body ?? "" });
  useEffect(() => {
    if (!draft) return;
    if (body === drafted.current.body) setBody(draft.body);
    if (subject === drafted.current.subject) setSubject(draft.subject);
    drafted.current = { subject: draft.subject, body: draft.body };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);
  const [used, setUsed] = useState(false);
  const send = useSend();
  const approve = useApprove();
  const [toAddr, setToAddr] = useState(facts?.to?.email ?? "");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  // The note grows with its text (CSS caps it), so the whole of it shows.
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [body]);
  if (!facts || !draft) return null;

  const to = facts.to;
  const first = to ? firstOf(to.name) : null;
  const way = m.way;
  const holder = way.kind === "holder" ? way : null;
  const onMerlin = facts.kind === "holderMessage" && !!holder;
  const invite = facts.kind === "holderInvite" && holder ? holder : null;
  const linkKept = !invite || !facts.link || body.includes(facts.link);
  // An invite to connect is recorded the first time it goes out, with the note as it reads now: it opens the conversation when they claim the seat.
  const record = () => {
    setUsed(true);
    onUsed?.();
    if (invite) void ui.act({ type: "invite", engagementId: invite.seatId, note: body }, { quiet: true, silentError: true });
  };
  const copy = async () => {
    const ok = await copyText(body);
    toast(ok ? "Note copied. Paste it wherever you reach them." : "That didn't copy. Select the note and copy it yourself.", !ok);
    if (ok) record();
  };
  const sendOnMerlin = async () => {
    if (!holder || busy || !body.trim()) return;
    setBusy(true);
    setErr(null);
    const r = await startSeatMessage(holder.seatId, body.trim());
    setBusy(false);
    if (r.error) return setErr(r.error);
    const c = r.conversation;
    toast(r.message || "Sent.", false, { action: { label: "Open conversation", onClick: () => (c ? openConversation(ui.openPage, c.id) : ui.openPage("messages")) } });
    onSent("merlin");
  };
  const title = facts.kind === "roleCold" && !to ? "A note for the open role" : `A note to ${first ?? "them"}`;
  // Approve and send: every note but a message to a seat holder on Merlin (that one goes on Merlin).
  const sendable = send.on && !onMerlin;
  const approveIt = () => {
    const addr = toAddr.trim();
    const effect: SendEffect = sendAs?.effect ?? { type: "pipeline.sent", companyId: m.id, from: "record", ...moveSent(m), channel: m.do === "intro" ? "intro" : "email" };
    void approve.go(
      !addr ? "Add their email address to send it." : !subject.trim() ? "Add a subject." : !body.trim() ? "The note is empty." : !linkKept ? `Keep the link in it. It's how ${first} claims the seat.` : {
        key: draftKey(`note:${facts.kind}:${m.id}`, addr, subject, body),
        to: addr,
        toName: to?.name ?? null,
        subject,
        body,
        kind: sendAs?.kind ?? (m.do === "intro" ? "intro" : "move"),
        company: m.id,
        effect,
      },
      (it) => {
        whenSent(it.id, (x) => {
          // An invite to connect is recorded once it went, as with the mail buttons.
          if (invite) void ui.act({ type: "invite", engagementId: invite.seatId, note: body }, { quiet: true, silentError: true });
          if (sendAs?.onGmailSent) sendAs.onGmailSent(x);
          else void loadPipeline(true);
        });
        onClose();
      },
    );
  };
  const buyer = way.kind === "buyer" ? way : null;
  // An open role's note says "I've applied": the posting comes first, then the note.
  const posting = m.do === "reply" && m.open?.posting && m.open.posting !== "locked" ? webLink(m.open.posting) : null;
  const len = [...body].length;
  return (
    <Sheet
      title={title}
      onClose={onClose}
      dialog
      className="mn-sheet"
      footer={
        <div className="mn-foot">
          <div className="mn-acts">
            {posting && (
              <a className="btn btn-pine mn-go" href={posting} target="_blank" rel="noreferrer">
                <IconExternal size={14} /> Open the posting
              </a>
            )}
            {onMerlin && (
              <button type="button" className="btn btn-pine mn-go" disabled={busy || !body.trim() || len > MAX} aria-busy={busy} onClick={() => void sendOnMerlin()}>
                {busy ? "Sending" : "Message on Merlin"}
              </button>
            )}
            {sendable && (
              <button type="button" className={`btn${posting ? "" : " btn-pine"} mn-go sd-approve`} disabled={approve.busy} aria-busy={approve.busy} onClick={approveIt}>
                <SendIcon /> {approve.busy ? "Sending" : "Approve and send"}
              </button>
            )}
            <a className={`btn${onMerlin || posting || sendable ? "" : " btn-pine"} mn-go`} href={gmailLink(to?.email, subject, body)} target="_blank" rel="noreferrer" onClick={record}>
              <IconExternal size={14} /> Open in Gmail
            </a>
            <button type="button" className="btn mn-go" onClick={() => void copy()}>
              Copy
            </button>
            <a className="mn-other" href={mailtoLink(to?.email, subject, body)} onClick={record}>
              Another mail app
            </a>
          </div>
          <div className="mn-last">
          <p className="mn-promise">
            <svg className="mn-shield" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden focusable="false">
              <path d="M12 3 5 6v5c0 4.5 3 8.3 7 10 4-1.7 7-5.5 7-10V6z" />
              <path d="m9 12 2 2 4-4" />
            </svg>
            <SendPromise
              more
              off={
                <span>
                  <b>Merlin drafts, you send.</b> Merlin never sends for you.
                  <span className="mn-promise-more">
                    {" "}
                    {onMerlin
                      ? "Message on Merlin goes to their Merlin inbox when you press it. The mail buttons open a draft in your own mail."
                      : "This opens as a draft in your own mail, and nothing goes out until you press Send there. Merlin never reads your email."}
                  </span>
                </span>
              }
            />
          </p>
            <button type="button" className={`btn${used ? " btn-pine" : ""} mn-done`} onClick={() => onSent()}>
              {sentLabel}
            </button>
          </div>
        </div>
      }
    >
      <div className="mn">
        <div className="mn-why">
          {to ? (
            <div className="mn-who">
              <span className="mv-av" aria-hidden>
                {initials(to.name)}
              </span>
              <div className="mv-who-t">
                <span className="mn-who-n">{to.name}</span>
                <span className="mv-who-s">
                  {way.kind === "know"
                    ? [[way.person.title, m.name].filter(Boolean).join(", "), knowLine(way.person).replace(/^Last/, "last")].filter(Boolean).join(" · ")
                    : buyer
                    ? [[buyer.title, m.name].filter(Boolean).join(", "), buyerWhat(buyer)].filter(Boolean).join(" · ")
                    : holder
                      ? [holder.role ?? (holder.fn ? `${holder.fn} seat` : "A fractional seat"), m.name, holder.member ? "on Merlin" : "not on Merlin yet"].filter(Boolean).join(" · ")
                      : m.name}
                </span>
              </div>
              {way.kind === "know" ? <WhoWarmth w={way.person.warmth} strength={!!intro} /> : null}
            </div>
          ) : null}
          {intro ? (
            facts.kind === "introAsk" || facts.kind === "ask" ? (
              <IntroBlock plan={intro.plan} first={intro.first} strength={intro.strength} />
            ) : (
              <>
                {m.why ? (
                  <p className="mn-now">
                    <b>Why now.</b> {m.why}
                  </p>
                ) : null}
                {intro.plan || intro.strength ? (
                  <p className="mn-now">
                    <b>Why {intro.first}:</b> {intro.plan?.why ?? intro.strength}
                  </p>
                ) : null}
              </>
            )
          ) : m.why ? (
            <p className="mn-now">
              <b>Why now.</b> {m.why}
            </p>
          ) : null}
        </div>

        <div className="mn-fields">
          {sendable ? (
            <>
              <ToInput id="mn-to" value={toAddr} onChange={setToAddr} name={to?.name ?? null} />
              {to?.email && toAddr.trim().toLowerCase() === to.email.toLowerCase() ? (
                <span className="mn-from">{to.from === "your own contacts" ? "from your own contacts" : "a contact you unlocked"}</span>
              ) : !to?.email && buyer?.email === "locked" ? (
                <span className="mn-from">{first}&apos;s email is on the record, 1 credit. Or type an address you have.</span>
              ) : null}
            </>
          ) : !onMerlin || to?.email ? (
            <div className="mn-field">
              <span className="mn-k">To</span>
              {to?.email ? (
                <>
                  <span className="mn-v">
                    {to.name} <span className="mn-addr">{to.email}</span>
                  </span>
                  <span className="mn-from">{to.from === "your own contacts" ? "from your own contacts" : "a contact you unlocked"}</span>
                </>
              ) : (
                <span className="mn-v mn-v-none">
                  {buyer?.email === "locked"
                    ? `${first}'s email is on the record, 1 credit. Or add the address in your mail.`
                    : to
                      ? `No address for ${first} on file. Add it in your mail.`
                      : "Whoever the posting names. Add the address in your mail."}
                </span>
              )}
            </div>
          ) : null}
          <div className="mn-field">
            <label className="mn-k" htmlFor="mn-subject">
              Subject
            </label>
            <input id="mn-subject" className="mn-subject" value={subject} maxLength={160} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <label className="sr-only" htmlFor="mn-body">
            Your note
          </label>
          <textarea ref={box} id="mn-body" className="mn-body" value={body} rows={8} maxLength={MAX} onChange={(e) => setBody(e.target.value)} />
        </div>
        {!linkKept && (
          <p className="mn-warn" role="alert">
            Keep the link in it. It&apos;s how {first} claims the seat and connects with you.
          </p>
        )}
        {err && (
          <p className="mn-warn" role="alert">
            {err}
          </p>
        )}
        {approve.err && (
          <p className="mn-warn" role="alert">
            {approve.err}
          </p>
        )}
        <VoiceLine me={me} onClaude={onClaude} />
      </div>
    </Sheet>
  );
}
