"use client";

/**
 * Sending a message out of Merlin, two ways, on one set of share buttons (ShareButtons):
 *
 *  - InvitePanel, "Invite a fractional": a message written for the member's function with their
 *    invite link in it. Share it on a phone, Email it, or Copy message. The zero-credits wall opens
 *    it in place, and Get started and the account menu open it in a sheet.
 *  - InviteConnect, "Invite to connect" on a seat holder who isn't on Merlin yet: a note to them
 *    (their first name, the seat, the member's function and kind of clients, lib/partners.ts) ending
 *    in the seat's claim link with the member's invite code. Copy message, Find them on LinkedIn
 *    (the message is copied first, to paste there), Email it (only when their email is on file and
 *    the member unlocked it) and Share where the device can. The first time one is used, the invite
 *    is recorded (one per member and seat, "Invited Nov 18"), with the note as the member left it:
 *    it is the first message of the conversation that opens when they claim the seat.
 */
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { EngagementRec } from "@/lib/tableTypes";
import { REFERRAL_BONUS } from "@/lib/tableFields";
import { firstOf, inviteNote } from "@/lib/partners";
import { IconExternal, useToast } from "../ui/shared";
import { copyText } from "./hooks";
import { inviteMessage, inviteUrl } from "./earnBack";
import { fmtStamp } from "./RoleDate";
import { Sheet, useUi } from "./ui";
import "./partners.css";

/** The device has a share sheet (phones and some tablets). */
const canShareNow = () => typeof navigator !== "undefined" && typeof navigator.share === "function";

export type Way = "share" | "email" | "copy" | "linkedin";

/**
 * The buttons a ready message goes out with, in the order given, the first one the primary.
 * `text` is the whole message (link included); `shareText` the part a share sheet takes beside the
 * link. `emailTo`: an address to write to (else the member picks one in their mail app).
 * `linkedin`: a people search to open, after the message is copied. `onSent` runs each time a way
 * is used.
 */
export function ShareButtons({
  ways,
  text,
  shareText,
  link,
  subject,
  emailTo,
  linkedin,
  copied = "Message copied. Paste it wherever you talk to them.",
  onSent,
}: {
  ways: Way[];
  text: string;
  shareText?: string;
  link: string;
  subject: string;
  emailTo?: string | null;
  linkedin?: string | null;
  copied?: string;
  onSent?: (way: Way) => void;
}) {
  const toast = useToast();
  const [canShare, setCanShare] = useState(false);
  // Read after mounting: the server's render has no navigator.
  useEffect(() => setCanShare(canShareNow()), []);
  const shown = ways.filter((w) => (w === "share" ? canShare : w === "linkedin" ? !!linkedin : true));
  const copy = async (done = copied) => {
    const ok = await copyText(text);
    toast(ok ? done : "That didn't copy. Select the message and copy it yourself.", !ok);
    return ok;
  };
  const run: Record<Way, () => void> = {
    copy: () => void copy().then((ok) => ok && onSent?.("copy")),
    linkedin: () => {
      // Copied first, so it is ready to paste into a LinkedIn message.
      void copy("Message copied. Paste it into a LinkedIn message.");
      window.open(linkedin!, "_blank", "noopener,noreferrer");
      onSent?.("linkedin");
    },
    email: () => {
      onSent?.("email");
      window.location.href = emailTo
        ? `mailto:${encodeURIComponent(emailTo)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
        : `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
    },
    share: () =>
      void (async () => {
        try {
          await navigator.share({ title: "Merlin", text: shareText ?? text, url: link });
          onSent?.("share");
        } catch (e) {
          // Closing the sheet is a choice, not a failure. Anything else: the message can still be copied.
          if (!(e instanceof DOMException && e.name === "AbortError") && (await copy())) onSent?.("copy");
        }
      })(),
  };
  const label: Record<Way, React.ReactNode> = {
    share: "Share it",
    email: "Email it",
    copy: "Copy message",
    linkedin: (
      <>
        Find them on LinkedIn <IconExternal size={11} />
      </>
    ),
  };
  return (
    <div className="tp-invite-acts">
      {shown.map((w, k) => (
        <button key={w} type="button" className={`btn${k === 0 ? " btn-pine" : ""}`} onClick={run[w]}>
          {label[w]}
        </button>
      ))}
    </div>
  );
}

export function InvitePanel({ fn, code }: { fn: string | null; code: string }) {
  const link = inviteUrl(code);
  const text = inviteMessage(fn, link);
  return (
    <div className="tp-invite">
      <label className="tp-invite-l" htmlFor="tp-invite-text">
        Your message
      </label>
      <textarea id="tp-invite-text" className="input tp-invite-text" readOnly value={text} rows={6} onFocus={(e) => e.currentTarget.select()} />
      <ShareButtons
        ways={["share", "email", "copy"]}
        text={text}
        shareText={text.slice(0, text.lastIndexOf("\n\n"))}
        link={link}
        subject="Join me on Merlin"
        copied="Message copied. Paste it to a fractional you know."
      />
      <p className="tp-invite-note">You both get {REFERRAL_BONUS} credits once they add their first fact.</p>
    </div>
  );
}

/* ---------- Invite to connect ---------- */

/**
 * "Invite to connect" under a seat holder the member can see who isn't on Merlin yet
 * (EngagementRec.invite). Opens the note in a sheet. Once sent it reads "Invited Nov 18", and the
 * sheet can be opened again to send it once more (no second invite is recorded).
 */
export function InviteConnect({ e, name, company, emailTo }: { e: EngagementRec; name: string; company: string; emailTo?: string | null }) {
  const [open, setOpen] = useState(false);
  const btn = useRef<HTMLButtonElement>(null);
  const first = firstOf(name);
  if (!e.invite) return null;
  return (
    <>
      {e.invite.at ? (
        <>
          <span className="tp-invited">Invited {fmtStamp(e.invite.at)}</span>
          <button ref={btn} type="button" className="btn btn-sm" onClick={() => setOpen(true)}>
            Send it again
          </button>
        </>
      ) : (
        <button ref={btn} type="button" className="btn btn-sm btn-pine" onClick={() => setOpen(true)}>
          Invite to connect
        </button>
      )}
      {open && <InviteSheet e={e} first={first} name={name} company={company} emailTo={emailTo} onClose={() => setOpen(false)} restore={() => btn.current} />}
    </>
  );
}

function InviteSheet({
  e,
  first,
  name,
  company,
  emailTo,
  onClose,
  restore,
}: {
  e: EngagementRec;
  first: string;
  name: string;
  company: string;
  emailTo?: string | null;
  onClose: () => void;
  restore: () => HTMLElement | null;
}) {
  const ui = useUi();
  const link = `${typeof window === "undefined" ? "" : window.location.origin}${e.invite!.path}`;
  const role = e.cells.role?.s === "value" ? e.cells.role.v : null;
  const fn = e.cells.function?.s === "value" ? e.cells.function.v : null;
  const [text, setText] = useState(() => inviteNote({ first, role, fn, company, myTitle: ui.me.title, myFn: ui.me.function, icp: ui.me.icp, link }));
  const kept = text.includes(link);
  // The note grows with its text (CSS caps it at half the screen), so the claim link at its end shows.
  const box = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const t = box.current;
    if (!t) return;
    t.style.height = "auto";
    t.style.height = `${t.scrollHeight + 2}px`;
  }, [text]);
  // Each way used records the invite (the server keeps one per member and seat, with its first date) and the note as it reads now: the conversation it opens starts with it.
  const record = () => void ui.act({ type: "invite", engagementId: e.id, note: text }, { quiet: true, silentError: true });
  return (
    <Sheet title={`Invite ${first} to connect`} onClose={onClose} dialog className="tp-invite-sheet" restore={restore}>
      <div className="tp-invite">
        <p className="tp-invite-lead">
          {first} isn&apos;t on Merlin yet. Send them this note. When they claim their seat with the link in it, a conversation opens between you on Merlin.
        </p>
        <label className="tp-invite-l" htmlFor="tp-connect-text">
          Your note
        </label>
        <textarea ref={box} id="tp-connect-text" className="input tp-invite-text tp-connect-text" value={text} rows={9} maxLength={2000} onChange={(ev) => setText(ev.target.value)} />
        {!kept && (
          <p className="tp-invite-warn" role="alert">
            Keep the link in it. It&apos;s how {first} claims the seat and connects with you.
          </p>
        )}
        <ShareButtons
          ways={["copy", "linkedin", ...(emailTo ? (["email"] as const) : []), "share"]}
          text={text}
          shareText={text.replace(link, "").trim()}
          link={link}
          subject={`Your seat at ${company}`}
          emailTo={emailTo}
          linkedin={`https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(name)}`}
          copied="Note copied. Paste it wherever you can reach them."
          onSent={record}
        />
        <p className="tp-invite-note">
          {e.invite!.at ? `You invited ${first} on ${fmtStamp(e.invite!.at)}. ` : ""}If {first} is new to Merlin, you both get {REFERRAL_BONUS} credits when they claim the seat.
        </p>
      </div>
    </Sheet>
  );
}
