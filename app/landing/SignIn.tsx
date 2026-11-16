"use client";

/**
 * Sign-in panel. Members paste their personal link or the code at the end of it.
 * With an email provider on, they can also ask for the link by email.
 * A dialog on desktop, a bottom sheet on phones.
 */
import { useEffect, useId, useRef, useState } from "react";
import { IconX, post } from "../ui/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** Where a member without email sign-in asks for a lost link. Inlined at build time; unset shows nothing. */
const SUPPORT = (process.env.NEXT_PUBLIC_RN_SUPPORT_EMAIL ?? "").trim();

export interface SignInProps {
  open: boolean;
  onClose: () => void;
  emailOn: boolean;
  /** Credits a new member starts with (the server's stats.starter). */
  starter: number;
  /** Why the panel opened, e.g. the join form found a member email. */
  note: string | null;
  onSignedIn: () => Promise<void> | void;
  /** "New here?" goes back to the join form. */
  onJoin: () => void;
}

export default function SignIn({ open, onClose, emailOn, starter, note, onSignedIn, onJoin }: SignInProps) {
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [mail, setMail] = useState("");
  const [mailState, setMailState] = useState<"idle" | "busy" | "sent">("idle");
  const [mailErr, setMailErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const id = useId();

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
      setCodeErr(r.error);
      return;
    }
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
          <p className="lp-dialog-note">{note}</p>
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
          {!emailOn && SUPPORT ? (
            <p className="lp-dialog-help">
              Can&apos;t find your link? Email{" "}
              <a className="mono" href={`mailto:${SUPPORT}?subject=${encodeURIComponent("Trading Post sign-in link")}`}>
                {SUPPORT}
              </a>{" "}
              and we&apos;ll send it again.
            </p>
          ) : null}
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
          <button type="button" className="lp-linkbtn lp-linkbtn-ink num" onClick={onJoin}>
            Join and get {starter} credits
          </button>
        </div>
      </div>
    </div>
  );
}
