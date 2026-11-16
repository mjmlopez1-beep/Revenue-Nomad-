"use client";

/**
 * Sign-in panel. Members paste their personal link or the code at the end of it.
 * With an email provider on, they can also ask for the link by email.
 * A dialog on desktop, a bottom sheet on phones. It always says where to get a lost link:
 * the support address when the server sends one, otherwise the member who invited them.
 * Opening it adds a history entry, so the back gesture closes it instead of leaving the site.
 */
import { useEffect, useId, useRef, useState } from "react";
import { IconX, post } from "../ui/shared";
import { mailto, signInFailText } from "./contact";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export interface SignInProps {
  open: boolean;
  onClose: () => void;
  emailOn: boolean;
  /** Credits a new member starts with (the server's stats.starter). */
  starter: number;
  /** Why the panel opened, e.g. the join form found a member email, or a sign-in link failed. */
  note: string | null;
  /** "error" when the note says something went wrong (a link that didn't work). */
  noteTone?: "info" | "error";
  /** Where to ask for a lost link (View.contact.support), or null. */
  support: string | null;
  onSignedIn: () => Promise<void> | void;
  /** "New here?" goes back to the join form. */
  onJoin: () => void;
}

/**
 * While the panel is open it owns one history entry: back closes it, and closing it any other
 * way takes the entry back off. `leave()` takes it off before the page changes underneath
 * (a successful sign-in), so the app never sees a stray back step.
 */
function useBackCloses(open: boolean, onClose: () => void) {
  const close = useRef(onClose);
  close.current = onClose;
  const ours = useRef(false);
  useEffect(() => {
    if (!open) return;
    window.history.pushState({ lpSignIn: 1 }, "");
    ours.current = true;
    const onPop = () => {
      ours.current = false;
      close.current();
    };
    window.addEventListener("popstate", onPop);
    return () => {
      window.removeEventListener("popstate", onPop);
      if (ours.current && window.history.state?.lpSignIn) window.history.back();
      ours.current = false;
    };
  }, [open]);
  return () =>
    new Promise<void>((done) => {
      if (!ours.current || !window.history.state?.lpSignIn) return done();
      ours.current = false;
      const finish = () => {
        window.removeEventListener("popstate", finish);
        clearTimeout(t);
        done();
      };
      const t = setTimeout(finish, 500);
      window.addEventListener("popstate", finish);
      window.history.back();
    });
}

/** Where a member without their link gets a new one. Shown in the panel at all times. */
function LostLink({ support, emailOn }: { support: string | null; emailOn: boolean }) {
  const href = support ? mailto(support, "Trading Post sign-in link") : null;
  if (support)
    return (
      <p className="lp-dialog-help">
        Can&apos;t find your link? Email{" "}
        {href ? (
          <a className="mono" href={href}>
            {support}
          </a>
        ) : (
          <span className="mono">{support}</span>
        )}{" "}
        and we&apos;ll send you a new one.
      </p>
    );
  return (
    <p className="lp-dialog-help">
      Can&apos;t find your link? Ask the member who invited you to send your link again.{emailOn ? " Or get it by email below." : ""}
    </p>
  );
}

export default function SignIn({ open, onClose, emailOn, starter, note, noteTone = "info", support, onSignedIn, onJoin }: SignInProps) {
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState("");
  const [mailState, setMailState] = useState<"idle" | "busy" | "sent">("idle");
  const [mailErr, setMailErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();
  const leave = useBackCloses(open, onClose);

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => inputRef.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const els = panelRef.current.querySelectorAll<HTMLElement>("button:not([disabled]), input, a[href]");
        if (!els.length) return;
        const first = els[0];
        const last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      clearTimeout(t);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
      prev?.focus?.();
    };
  }, [open, onClose]);

  if (!open) return null;

  const signIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = code.trim();
    if (!v) {
      setCodeErr("Paste your link first, or the code at the end of it.");
      return;
    }
    setBusy(true);
    setCodeErr(null);
    const r = await post({ signIn: v });
    if (r.error) {
      setBusy(false);
      setCodeErr(signInFailText(r.error, "pasted"));
      return;
    }
    await leave();
    await onSignedIn();
    setBusy(false);
  };

  const emailLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mailState === "busy") return;
    const v = mail.trim();
    if (!EMAIL_RE.test(v)) {
      setMailErr("Type the email you joined with.");
      return;
    }
    setMailErr(null);
    setMailState("busy");
    const r = await post({ emailLink: v });
    if (r.error) {
      setMailState("idle");
      setMailErr(r.error);
      return;
    }
    setMailState("sent");
  };

  return (
    <div className="lp-scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={panelRef} className="lp-dialog" role="dialog" aria-modal="true" aria-labelledby={`${id}-h`}>
        <div className="lp-dialog-head">
          <h2 id={`${id}-h`}>Sign in</h2>
          <button type="button" className="btn btn-ghost btn-sm lp-dialog-x" onClick={onClose} aria-label="Close">
            <IconX />
          </button>
        </div>
        {note ? (
          <p className={`lp-dialog-note${noteTone === "error" ? " lp-dialog-note-err" : ""}`} role={noteTone === "error" ? "alert" : undefined}>
            {note}
          </p>
        ) : (
          <p className="lp-dialog-sub">Paste your personal link, or the code at the end of it. There is no password.</p>
        )}

        <form onSubmit={signIn} noValidate className="lp-dialog-form">
          <label className="lp-field-label" htmlFor={`${id}-code`}>
            Your sign-in link or code
          </label>
          <div className="lp-dialog-row">
            <input
              ref={inputRef}
              id={`${id}-code`}
              className="input lp-dialog-input"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Paste it here"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeErr) setCodeErr(null);
              }}
              aria-invalid={!!codeErr}
              aria-describedby={codeErr ? `${id}-code-err` : undefined}
            />
            <button type="submit" className="btn btn-pine lp-dialog-btn" disabled={busy} aria-busy={busy}>
              {busy ? "Signing in" : "Sign in"}
            </button>
          </div>
          {codeErr ? (
            <p className="lp-field-err" id={`${id}-code-err`} role="alert">
              {codeErr}
            </p>
          ) : null}
          <LostLink support={support} emailOn={emailOn} />
        </form>

        {emailOn ? (
          <>
            <hr className="lp-or" />
            {mailState === "sent" ? (
              <p className="lp-dialog-ok" role="status">
                If that email has an account, your link is on its way. Give it a minute, and check spam if it doesn&apos;t show up.
              </p>
            ) : (
              <form onSubmit={emailLink} noValidate className="lp-dialog-form">
                <label className="lp-field-label" htmlFor={`${id}-mail`}>
                  Or get your link by email
                </label>
                <div className="lp-dialog-row">
                  <input
                    id={`${id}-mail`}
                    className="input lp-dialog-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="The email you joined with"
                    value={mail}
                    onChange={(e) => {
                      setMail(e.target.value);
                      if (mailErr) setMailErr(null);
                    }}
                    aria-invalid={!!mailErr}
                    aria-describedby={mailErr ? `${id}-mail-err` : undefined}
                  />
                  <button type="submit" className="btn lp-dialog-btn" disabled={mailState === "busy"} aria-busy={mailState === "busy"}>
                    {mailState === "busy" ? "Sending" : "Email my link"}
                  </button>
                </div>
                {mailErr ? (
                  <p className="lp-field-err" id={`${id}-mail-err`} role="alert">
                    {mailErr}
                  </p>
                ) : null}
              </form>
            )}
          </>
        ) : null}

        <div className="lp-dialog-foot">
          New here?{" "}
          <button
            type="button"
            className="lp-linkbtn lp-linkbtn-ink num"
            onClick={async () => {
              // Off the history entry first, so its scroll restore can't undo the scroll to the form.
              await leave();
              onJoin();
            }}
          >
            Join and get {starter} credits
          </button>
        </div>
      </div>
    </div>
  );
}
