"use client";

/**
 * Inline join. Email first (one field, one button), then the name field opens in place.
 * Without an email provider the member is signed in at once; with one, we email a link.
 * Each step says what happens next, and the name step says what other members will see.
 */
import { useEffect, useId, useRef, useState } from "react";
import { post } from "../ui/shared";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
/** Server errors that mean "this email already has an account, use your link". */
const MEMBER_RE = /sign-in link|personal link|your link|already joined/i;

function readRef(): string | undefined {
  try {
    return localStorage.getItem("tp_ref") || undefined;
  } catch {
    return undefined;
  }
}

export interface JoinFormProps {
  /** Email sign-in is on: joining emails a link instead of signing in here. */
  emailOn: boolean;
  /** Credits a new member starts with (the server's stats.starter). */
  starter: number;
  onSignedIn: () => Promise<void> | void;
  /** The email belongs to an existing member. Opens the sign-in panel. */
  onMember: (message: string) => void;
  /** Where the form sits (hero or the closing call to action). */
  place: "hero" | "final";
  /** Helper line under the email field (what joining costs). The name step has its own. */
  hint?: string;
}

export default function JoinForm({ emailOn, starter, onSignedIn, onMember, place, hint }: JoinFormProps) {
  const [step, setStep] = useState<"email" | "name" | "sent">("email");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<{ text: string; member?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const id = useId();

  useEffect(() => {
    if (step === "name") nameRef.current?.focus();
  }, [step]);

  const submitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    const v = email.trim();
    if (!EMAIL_RE.test(v)) {
      setError({ text: v ? "That doesn't look like an email address. Check it for a typo." : "Type your email first." });
      return;
    }
    setEmail(v);
    setError(null);
    setStep("name");
  };

  const submitName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const n = name.trim();
    if (n.length < 2) {
      setError({ text: "Add your first and last name." });
      return;
    }
    setBusy(true);
    setError(null);
    const r = await post<{ ok?: boolean; sent?: boolean }>({ join: { name: n, email, ref: readRef() } });
    if (r.error) {
      setBusy(false);
      const member = MEMBER_RE.test(r.error);
      setError({ text: r.error, member });
      if (member) onMember(r.error);
      return;
    }
    if (r.sent) {
      setBusy(false);
      setStep("sent");
      return;
    }
    await onSignedIn();
    setBusy(false);
  };

  const reset = () => {
    setStep("email");
    setName("");
    setError(null);
  };

  if (step === "sent")
    return (
      <div className="lp-join-sent" role="status" data-place={place}>
        <p className="lp-join-sent-h">Check your inbox</p>
        <p>
          We sent a sign-in link to <strong className="mono">{email}</strong>. Open it and you&apos;re in. It can take a minute, and it sometimes
          lands in spam.
        </p>
        <button type="button" className="lp-linkbtn" onClick={reset}>
          Use a different email
        </button>
      </div>
    );

  const err = error && (
    <div className="lp-join-err" role="alert" id={`${id}-err`}>
      <span>{error.text}</span>
      {error.member ? (
        <button type="button" className="lp-linkbtn lp-linkbtn-dark" onClick={() => onMember(error.text)}>
          Sign in with your link
        </button>
      ) : null}
    </div>
  );

  if (step === "name")
    return (
      <form className="lp-join" onSubmit={submitName} noValidate data-place={place}>
        <label className="lp-join-label" htmlFor={`${id}-name`}>
          Your first and last name
        </label>
        <div className="lp-join-row">
          <input
            ref={nameRef}
            id={`${id}-name`}
            className="input lp-join-input"
            name="name"
            autoComplete="name"
            placeholder="Jane Smith"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (error) setError(null);
            }}
            aria-invalid={!!error}
            aria-describedby={error ? `${id}-err ${id}-help` : `${id}-help`}
            maxLength={80}
          />
          <button type="submit" className="btn btn-primary btn-lg lp-join-btn" disabled={busy} aria-busy={busy}>
            {busy ? (emailOn ? "Sending your link" : "Opening") : emailOn ? "Email me my link" : "Open Trading Post"}
          </button>
        </div>
        {err}
        <p className="lp-join-help" id={`${id}-help`}>
          Use the name you work under. It shows on seats you held, behind a lock. Your email is never shown.
        </p>
        <p className="lp-join-who">
          <span>
            Joining as <span className="mono">{email}</span>
          </span>
          <button type="button" className="lp-linkbtn" onClick={reset}>
            Change email
          </button>
        </p>
      </form>
    );

  return (
    <form className="lp-join" onSubmit={submitEmail} noValidate data-place={place}>
      <label className="lp-join-label" htmlFor={`${id}-email`}>
        Your email
      </label>
      <div className="lp-join-row">
        <input
          id={`${id}-email`}
          className="input lp-join-input"
          type="email"
          name="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@yourfirm.com"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : hint ? `${id}-help` : undefined}
        />
        <button type="submit" className="btn btn-primary btn-lg lp-join-btn num">
          Get {starter} credits
        </button>
      </div>
      {err}
      {hint ? (
        <p className="lp-join-help" id={`${id}-help`}>
          {hint}
        </p>
      ) : null}
    </form>
  );
}
