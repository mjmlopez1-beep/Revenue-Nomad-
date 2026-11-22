"use client";

/**
 * The client's signing page, /sign/<token>: for someone who has never heard of Merlin. The sender's
 * name leads, the proposal reads in full, and signing is three short steps in one panel: confirm
 * your email with the 6-digit code we send to it, agree to sign electronically, type your full
 * name. Decline is there too, with an optional reason. No account. Phone first: one column, 16px
 * gutters, 48px fields, the action bar at the foot of the screen.
 *
 * Every request goes to /api/sign with the link's token; the server records each step with the
 * time, IP address and browser (lib/proposals/store.ts), and checks the document's SHA-256 at signing.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { IconCheck } from "../ui/shared";
import { Logo } from "../ui/Logo";
import { Spot } from "../ui/fractions/art";
import type { Choice, SignerView } from "@/lib/proposals/types";
import { choiceRec, startOption } from "@/lib/proposals/pricing";
import { dayOf } from "./doc";
import { Parties, ProposalView } from "./ProposalView";
import "./sign.css";
import "./clientview.css";

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: +\p{L}[\p{L}'’.-]*)+$/u;

async function call<T = SignerView>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

export function SignTop() {
  return (
    <header className="sg-top">
      <Logo tone="white" height={30} />
      <span className="sg-secure">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <rect x="5" y="11" width="14" height="10" rx="2" />
          <path d="M8 11V8a4 4 0 0 1 8 0v3" />
        </svg>
        Secure signing
      </span>
    </header>
  );
}

/** Is this element on screen? The sticky sign bar hides while the card's own button shows. */
export function useOnScreen(ref: RefObject<HTMLElement | null>, on = true): boolean {
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || !on || typeof IntersectionObserver === "undefined") return setSeen(false);
    const io = new IntersectionObserver((es) => setSeen(es.some((e) => e.isIntersecting)));
    io.observe(el);
    return () => io.disconnect();
  }, [ref, on]);
  return seen;
}

/** The consent box: its first sentence, and on phones the rest behind "Read the full consent". */
export function ConsentBox({ text, checked, disabled, onChange }: { text: string; checked: boolean; disabled: boolean; onChange: (v: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const cut = text.indexOf(". ") + 1;
  const first = cut > 0 ? text.slice(0, cut) : text;
  const rest = cut > 0 ? text.slice(cut) : "";
  return (
    <div className="sg-consent" data-open={open}>
      <input type="checkbox" id="sg-agree" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <div>
        <label htmlFor="sg-agree">
          {first}
          {rest && <span className="sg-consent-rest">{rest}</span>}
        </label>
        {rest && (
          <button type="button" className="sg-link sg-consent-more" aria-expanded={open} onClick={() => setOpen((x) => !x)}>
            {open ? "Show less" : "Read the full consent"}
          </button>
        )}
      </div>
    </div>
  );
}

/** Signed: the lock is open, a Fractions spot holding the screen's one ember, in place of a bare check.
 * `on` is the card it sits on: the mint signed card (the default), or white. */
export const SignedArt = ({ on = "mint" }: { on?: "mint" | "white" }) => <Spot name="unlocked" size={112} on={on} ember className="sg-done-art" />;

/** Merlin's Privacy Policy and Terms, under every state of the signing page and the signed copy. */
export function SignLegal() {
  return (
    <nav className="sg-legal" aria-label="Merlin's policies">
      <a href="/privacy">Privacy</a>
      <a href="/terms">Terms</a>
    </nav>
  );
}

const STATUS_SAY: Record<SignerView["status"], { h: string; p: string }> = {
  open: { h: "", p: "" },
  signed: { h: "Signed", p: "Thank you. Your signed copy, with its audit trail, is on its way to your email." },
  declined: { h: "You declined this proposal", p: "The sender knows. If you change your mind, ask them for a new one." },
  void: { h: "This proposal was withdrawn", p: "The sender withdrew it, so it can't be signed. Ask them if you expected to sign it." },
  changed: { h: "There's a newer version", p: "The sender changed this proposal after sending it, so this version can't be signed. They'll send you the new one." },
  expired: { h: "This link has expired", p: "Links to sign work for 30 days. Ask the sender for a new one." },
};

export function SignView({ token }: { token: string }) {
  const [v, setV] = useState<SignerView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [step, setStep] = useState<"read" | "sign" | "decline">("read");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Which step an error belongs to: it shows there, and only there.
  const [errAt, setErrAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  // The option and add-ons picked (a proposal with options): theirs to change until they sign.
  const [choice, setChoice] = useState<Choice | null>(null);
  const panel = useRef<HTMLDivElement>(null);
  const cardGo = useRef<HTMLButtonElement>(null);
  const cardShows = useOnScreen(cardGo, !!v && v.status === "open" && step === "read");

  useEffect(() => {
    void call({ token, op: "view" }).then((r) => (r.error ? setFatal(r.error) : (setV(r), setChoice(r.choice ?? (r.doc.pricing ? { optionId: startOption(r.doc.pricing), addOnIds: [] } : null)))));
  }, [token]);
  useEffect(() => {
    if (step !== "read") panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  if (fatal)
    return (
      <div className="sg">
        <SignTop />
        <main className="sg-main">
          <div className="sg-card sg-state">
            <h1 className="sg-h">This link doesn&#39;t work</h1>
            <p className="sg-p">{fatal}</p>
          </div>
          <SignLegal />
        </main>
      </div>
    );
  if (!v)
    return (
      <div className="sg">
        <SignTop />
        <main className="sg-main" aria-busy="true">
          <div className="sg-card sg-skel" />
          <SignLegal />
        </main>
      </div>
    );

  const d = v.doc;
  const run = async (what: string, body: Record<string, unknown>) => {
    setBusy(what);
    setErr(null);
    const r = await call<SignerView & { sent?: boolean; emailHint?: string }>({ token, ...body });
    setBusy(null);
    if (r.error) return setErr(r.error), setErrAt(what), null;
    return r;
  };
  const open = v.status === "open";
  const nameOk = NAME_RE.test(name.trim());
  const fromFirst = d.from.name.split(" ")[0] || d.from.name;
  const picked = d.pricing && choice ? choiceRec(d.pricing, choice) : null;
  const pickTo = (c: Choice) => {
    if (!open) return;
    setChoice(c);
    // Kept on the server, so the page opens on it again; the choice signed is the one sent with the signature.
    void call({ token, op: "choose", choice: c }).then((r) => {
      if (r.error) setErr(r.error), setErrAt("choose");
      else if (errAt === "choose") setErr(null);
    });
  };
  const accepting = picked ? (
    <>
      You&#39;re accepting <strong>{picked.summary}</strong>
      {picked.addOns.length || picked.once ? `, ${picked.total} in all,` : ""} on the terms above.
    </>
  ) : (
    <>You&#39;re accepting this proposal, on the terms above.</>
  );

  const signPanel = (
    <div ref={panel} className="cv-accept" id="sg-panel">
      {step === "decline" ? (
        <form
          className="sg-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run("decline", { op: "decline", reason });
            if (r) setV(r);
          }}
        >
          <h2 className="cv-h2">Decline this proposal</h2>
          <label className="sg-label" htmlFor="sg-reason">
            Tell {fromFirst} why (optional)
          </label>
          <textarea id="sg-reason" className="input sg-area" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
          {err && errAt === "decline" && (
            <p className="sg-err" role="alert">
              {err}
            </p>
          )}
          <div className="sg-row">
            <button type="button" className="btn btn-lg" onClick={() => (setStep("read"), setErr(null))}>
              Back
            </button>
            <button type="submit" className="btn btn-lg sg-red" aria-busy={busy === "decline"} disabled={!!busy}>
              {busy === "decline" ? "Declining" : "Decline"}
            </button>
          </div>
        </form>
      ) : step === "read" ? (
        <>
          <h2 className="cv-h2">Accept and sign</h2>
          <span className="cv-accept-l">{accepting}</span>
          <Parties doc={d} client="Signs here" member={`Sent ${dayOf(d.preparedAt)}`} />
          {err && errAt === "choose" && (
            <p className="sg-err" role="alert">
              {err}
            </p>
          )}
          <div className="cv-acts">
            <button ref={cardGo} type="button" className="cv-go" onClick={() => setStep("sign")}>
              Accept and sign
            </button>
            <button type="button" className="cv-decline" onClick={() => setStep("decline")}>
              Decline
            </button>
          </div>
          <span className="cv-fine">
            Next you&#39;ll get a code by email at {v.emailHint}, then type your full name. {v.sealOnSign ? "You'll receive a sealed copy as soon as you sign." : "You'll get the signed copy by email as soon as you sign."}
          </span>
        </>
      ) : (
        <div className="sg-steps">
          <h2 className="cv-h2">Sign this proposal</h2>
          <span className="cv-accept-l">{accepting}</span>
          <ol className="sg-ol">
            <li className="sg-step" data-done={v.codeVerified}>
              <span className="sg-num" aria-hidden>
                {v.codeVerified ? <IconCheck size={14} /> : 1}
              </span>
              <div className="sg-stepbody">
                <h3 className="sg-h3">Confirm your email</h3>
                {v.codeVerified ? (
                  <p className="sg-help">Confirmed: {v.emailHint}</p>
                ) : !sentTo && !v.codeSent ? (
                  <>
                    <p className="sg-help">We&#39;ll email a 6-digit code to {v.emailHint}.</p>
                    <button
                      type="button"
                      className="btn btn-lg"
                      aria-busy={busy === "code"}
                      disabled={!!busy}
                      onClick={async () => {
                        const r = await run("code", { op: "code" });
                        if (r) setSentTo(r.emailHint ?? v.emailHint);
                      }}
                    >
                      {busy === "code" ? "Sending" : "Email me a code"}
                    </button>
                    {err && (errAt === "code" || errAt === "verify") && (
                      <p className="sg-err" role="alert">
                        {err}
                      </p>
                    )}
                  </>
                ) : (
                  <form
                    className="sg-form"
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const r = await run("verify", { op: "verify", code });
                      if (r) setV(r);
                    }}
                  >
                    <label className="sg-label" htmlFor="sg-code">
                      The code we sent to {sentTo ?? v.emailHint}
                    </label>
                    <input
                      id="sg-code"
                      className="input sg-code"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      pattern="[0-9]*"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                      autoFocus
                    />
                    {err && (errAt === "code" || errAt === "verify") && (
                      <p className="sg-err" role="alert">
                        {err}
                      </p>
                    )}
                    <div className="sg-row">
                      <button type="submit" className="btn btn-lg" aria-busy={busy === "verify"} disabled={!!busy || code.length !== 6}>
                        {busy === "verify" ? "Checking" : "Confirm"}
                      </button>
                      <button
                        type="button"
                        className="sg-link"
                        disabled={!!busy}
                        onClick={async () => {
                          const r = await run("code", { op: "code" });
                          if (r) setSentTo(r.emailHint ?? v.emailHint), setCode("");
                        }}
                      >
                        Send a new code
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </li>
            <li className="sg-step" data-off={!v.codeVerified} data-done={agree}>
              <span className="sg-num" aria-hidden>
                {agree ? <IconCheck size={14} /> : 2}
              </span>
              <div className="sg-stepbody">
                <h3 className="sg-h3">Agree to sign electronically</h3>
                <ConsentBox text={v.consent} checked={agree} disabled={!v.codeVerified} onChange={setAgree} />
              </div>
            </li>
            <li className="sg-step" data-off={!v.codeVerified || !agree}>
              <span className="sg-num" aria-hidden>
                3
              </span>
              <form
                className="sg-stepbody sg-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await run("sign", { op: "sign", name: name.trim(), consent: agree, hash: v.hash, ...(choice ? { choice } : {}) });
                  if (r) setV(r), setChoice(r.choice), window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <h3 className="sg-h3">Type your full name</h3>
                <input
                  id="sg-name"
                  className="input sg-name"
                  aria-label="Your full name"
                  autoComplete="name"
                  maxLength={100}
                  placeholder={d.to.name}
                  value={name}
                  disabled={!v.codeVerified || !agree}
                  onChange={(e) => setName(e.target.value)}
                />
                <div className="sg-sig" aria-label="Your signature" data-empty={!name.trim()}>
                  <span className="sg-sig-name">{name.trim() || "Your signature"}</span>
                  <span className="sg-sig-line">Signature · {dayOf(new Date().toISOString())}</span>
                </div>
                {err && errAt === "sign" && (
                  <p className="sg-err" role="alert">
                    {err}
                  </p>
                )}
                <button type="submit" className="btn btn-pine btn-lg sg-wide" aria-busy={busy === "sign"} disabled={!!busy || !v.codeVerified || !agree || !nameOk}>
                  {busy === "sign" ? "Signing" : "Sign"}
                </button>
                <p className="sg-fine">
                  Signing records the time, this device&#39;s IP address and browser, {picked ? "the option you picked, " : ""}and the document&#39;s fingerprint (SHA-256): <span className="sg-hash">{v.hash}</span>
                </p>
              </form>
            </li>
          </ol>
          <button type="button" className="sg-link" onClick={() => (setStep("decline"), setErr(null))}>
            Decline instead
          </button>
        </div>
      )}
    </div>
  );

  const signedPart =
    v.status === "signed" ? (
      <div className="cv-accept">
        <div className="cv-done">
          <span className="cv-done-h">Signed. Thank you, {(v.signedName ?? d.to.name).split(" ")[0]}.</span>
          <span className="cv-done-p">
            {v.signedChoice ? `You chose ${v.signedChoice.summary}: ${v.signedChoice.total}. ` : ""}
            {v.sealed ? "Your sealed copy is on its way to your email, and here to download." : "Your signed copy, with its audit trail, is on its way to your email."} {fromFirst} has been told.
          </span>
          <div className="cv-acts">
            {v.sealed && (
              <a className="cv-btn" href={v.sealed.pdf}>
                Download the signed PDF
              </a>
            )}
            {v.copyUrl && (
              <a className="cv-btn" href={v.copyUrl}>
                Open the signed copy
              </a>
            )}
          </div>
        </div>
        <Parties doc={d} client={`Signed ${dayOf(v.signedAt)}`} member={`Sent ${dayOf(d.preparedAt)}`} />
      </div>
    ) : (
      <div className="cv-accept">
        <h2 className="cv-h2">{STATUS_SAY[v.status].h}</h2>
        <span className="cv-fine">{STATUS_SAY[v.status].p}</span>
      </div>
    );

  return (
    <div className="sg">
      <SignTop />
      <main className="sg-main cv-main">
        {!open && (
          <section className="sg-card sg-state" data-status={v.status}>
            {v.status === "signed" && <SignedArt />}
            <h2 className="sg-h">{STATUS_SAY[v.status].h}</h2>
            <p className="sg-p">
              {v.status === "signed" && v.signedName ? `Signed by ${v.signedName} on ${dayOf(v.signedAt)}. ` : ""}
              {STATUS_SAY[v.status].p}
            </p>
            {v.copyUrl && (
              <a className="btn btn-pine btn-lg sg-wide" href={v.copyUrl}>
                Open the signed copy
              </a>
            )}
          </section>
        )}

        <ProposalView
          doc={d}
          openUntil={open ? v.expiresAt : null}
          canSign={open}
          choice={choice}
          onPick={open && d.pricing ? (id) => pickTo({ optionId: id, addOnIds: choice?.addOnIds ?? [] }) : undefined}
          onAddOn={open && d.pricing ? (id, on) => pickTo({ optionId: choice?.optionId ?? startOption(d.pricing!), addOnIds: on ? [...(choice?.addOnIds ?? []), id] : (choice?.addOnIds ?? []).filter((x) => x !== id) }) : undefined}
          sign={open ? signPanel : signedPart}
        />

        <footer className="sg-foot">
          <p>
            Sent by {d.from.name} with Merlin, from Revenue Nomad. Merlin keeps the signed copy and an audit trail: when it was sent, opened, the email confirmed and signed.
          </p>
          <p>
            Document fingerprint (SHA-256): <span className="sg-hash">{v.hash}</span>
          </p>
          <SignLegal />
        </footer>
      </main>
      {open && step === "read" && !cardShows && (
        <div className="sg-bar">
          <button type="button" className="btn btn-pine btn-lg" onClick={() => setStep("sign")}>
            Sign this proposal
          </button>
        </div>
      )}
    </div>
  );
}
