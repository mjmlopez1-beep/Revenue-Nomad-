"use client";

/**
 * Sign-in panel. Members paste their personal link or the code at the end of it.
 * With an email provider on, they can also ask for the link by email.
 * A dialog on desktop, a bottom sheet on phones.
 */
import { useEffect, useId, useRef, useState } from "react";
import { IconX, post } from "../ui/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

export interface SignInProps {
  open: boolean;
  onClose: () => void;
  emailOn: boolean;
  /** Why the panel opened, e.g. the join form found a member email. */
  note: string | null;
  onSignedIn: () => Promise<void> | void;
  /** "New here?" goes back to the join form. */
  onJoin: () => void;
}

export default function SignIn({ open, onClose, emailOn, note, onSignedIn, onJoin }: SignInProps) {
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
      setCodeErr("Paste your sign-in link or the code at the end of it.");
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
      setMailErr("Enter the email you joined with.");
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
        {note ? <p className="lp-dialog-note">{note}</p> : <p className="lp-dialog-sub">Revenue Nomad member? Use the personal link we sent you.</p>}

        <form onSubmit={signIn} noValidate className="lp-dialog-form">
          <label className="lp-field-label" htmlFor={`${id}-code`}>
            Paste your sign-in link or code
          </label>
          <div className="lp-dialog-row">
            <input
              ref={inputRef}
              id={`${id}-code`}
              className="input mono lp-dialog-input"
              autoComplete="off"
              autoCapitalize="off"
              spellCheck={false}
              placeholder="Link or code"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeErr) setCodeErr(null);
              }}
              aria-invalid={!!codeErr}
              aria-describedby={codeErr ? `${id}-code-err` : undefined}
            />
            <button type="submit" className="btn btn-pine lp-dialog-btn" disabled={busy}>
              {busy ? "Signing in" : "Sign in"}
            </button>
          </div>
          {codeErr ? (
            <p className="lp-field-err" id={`${id}-code-err`} role="alert">
              {codeErr}
            </p>
          ) : null}
        </form>

        {emailOn ? (
          <>
            <div className="lp-or">
              <span>or</span>
            </div>
            {mailState === "sent" ? (
              <p className="lp-dialog-ok" role="status">
                If that email is a member, a link is on its way.
              </p>
            ) : (
              <form onSubmit={emailLink} noValidate className="lp-dialog-form">
                <label className="lp-field-label" htmlFor={`${id}-mail`}>
                  Email me a sign-in link
                </label>
                <div className="lp-dialog-row">
                  <input
                    id={`${id}-mail`}
                    className="input lp-dialog-input"
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    value={mail}
                    onChange={(e) => {
                      setMail(e.target.value);
                      if (mailErr) setMailErr(null);
                    }}
                    aria-invalid={!!mailErr}
                  />
                  <button type="submit" className="btn lp-dialog-btn" disabled={mailState === "busy"}>
                    {mailState === "busy" ? "Sending" : "Send link"}
                  </button>
                </div>
                {mailErr ? (
                  <p className="lp-field-err" role="alert">
                    {mailErr}
                  </p>
                ) : null}
              </form>
            )}
          </>
        ) : null}

        <div className="lp-dialog-foot">
          New to Trading Post?{" "}
          <button type="button" className="lp-linkbtn lp-linkbtn-ink" onClick={onJoin}>
            Get 50 credits
          </button>
        </div>
      </div>
    </div>
  );
}
