"use client";

/**
 * Inline join. Email first (one field, one button), then the name field opens in place.
 * Without an email provider the member is signed in at once; with one, we email a one-time
 * link to finish joining, with a 6-digit code for finishing on another device.
 * Each step says what happens next, and the name step says what other members will see.
 */
import { useEffect, useId, useRef, useState } from "react";
import { post } from "../ui/shared";
import { PERSON_NAME_RE } from "@/lib/tableFields";
import type { Me } from "@/lib/tableTypes";

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

/** The discount code the visitor arrived with (?code=RN-SURVEY10, kept by Root as tp_code), so checkout can apply it later. */
function readCode(): string | undefined {
  try {
    return new URLSearchParams(window.location.search).get("code") || localStorage.getItem("tp_code") || undefined;
  } catch {
    return undefined;
  }
}

export interface JoinFormProps {
  /** Email sign-in is on: joining emails a link instead of signing in here. */
  emailOn: boolean;
  /** Credits a new member starts with (the server's stats.starter). */
  starter: number;
  /** Signed in. Joining passes the new member's Me (the join answer's), so onboarding can open before the table arrives. */
  onSignedIn: (me?: Me) => Promise<void> | void;
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
  /** The 6-digit code from the email, for finishing on another device. */
  const [code, setCode] = useState("");
  const [codeErr, setCodeErr] = useState<string | null>(null);
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
    // The same test a seat holder's name gets, so the member can be matched to seats they held.
    const n = name.trim().replace(/\s+/g, " ");
    if (!PERSON_NAME_RE.test(n)) {
      setError({ text: "Add your first and last name, like Jane Smith." });
      return;
    }
    setBusy(true);
    setError(null);
    const r = await post<{ ok?: boolean; sent?: boolean; me?: Me }>({ join: { name: n, email, ref: readRef(), code: readCode() } });
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
    await onSignedIn(r.me);
    setBusy(false);
  };

  const reset = () => {
    setStep("email");
    setName("");
    setError(null);
  };

  const submitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const v = code.replace(/\D/g, "");
    if (v.length !== 6) return setCodeErr("Type the 6 digits from the email.");
    setBusy(true);
    setCodeErr(null);
    const r = await post({ signInCode: { email, code: v } });
    if (r.error) {
      setBusy(false);
      return setCodeErr(r.error);
    }
    await onSignedIn();
    setBusy(false);
  };

  if (step === "sent")
    return (
      <div className="lp-join-sent" role="status" data-place={place}>
        <p className="lp-join-sent-h">Check your inbox</p>
        <p>
          We sent a link to <strong className="mono">{email}</strong>. Open it and you&apos;re in. It works once, for 20 minutes. It can take a minute,
          and it sometimes lands in spam.
        </p>
        <form className="lp-join-code" onSubmit={submitCode} noValidate>
          <label className="lp-join-label" htmlFor={`${id}-code`}>
            Opening it on another device? Type the 6-digit code from the email here
          </label>
          <div className="lp-join-row">
            <input
              id={`${id}-code`}
              className="input lp-join-input num"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={7}
              placeholder="123456"
              value={code}
              onChange={(e) => {
                setCode(e.target.value);
                if (codeErr) setCodeErr(null);
              }}
              aria-invalid={!!codeErr}
              aria-describedby={codeErr ? `${id}-code-err` : undefined}
            />
            <button type="submit" className="btn btn-primary btn-lg lp-join-btn" disabled={busy} aria-busy={busy}>
              {busy ? "Opening" : "Open Merlin"}
            </button>
          </div>
          {codeErr && (
            <div className="lp-join-err" role="alert" id={`${id}-code-err`}>
              <span>{codeErr}</span>
            </div>
          )}
        </form>
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
            {busy ? (emailOn ? "Sending your link" : "Opening") : emailOn ? "Email me my link" : "Open Merlin"}
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
