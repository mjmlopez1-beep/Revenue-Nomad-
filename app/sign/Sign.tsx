"use client";

/**
 * The client's signing page, /sign/<token> (ClientView.dc.html): for someone who has never heard of
 * Merlin. The sender leads the header, then the proposal's title, the three steps (read it, pick
 * an option, sign) and the proposal in full, with a summary beside it that stays on screen on wide
 * screens: the option and add-ons picked and the total as it changes, Review and sign, Ask a
 * question, Send to someone else to sign, Decline. Signing is three short steps: confirm your
 * email with the 6-digit code we send to it, agree to sign electronically, type or draw your
 * signature. Asking, passing it on and declining need the code first too, as they speak for the
 * signer named. Keyboard focus moves into each step's heading and back to the button that opened
 * it. No account. Phones: one column, 16px gutters, 48px fields, the action bar at the foot.
 *
 * Every request goes to /api/sign with the link's token; the server records each step with the
 * time, IP address and browser (lib/proposals/store.ts), and checks the document's SHA-256 at signing.
 */
import { useEffect, useRef, useState, type RefObject } from "react";
import { IconCheck } from "../ui/shared";
import { Logo } from "../ui/Logo";
import { Spot } from "../ui/fractions/art";
import type { Choice, SignerView } from "@/lib/proposals/types";
import { choiceRec, priced, startOption } from "@/lib/proposals/pricing";
import { dayOf } from "./doc";
import { Parties, ProposalView, SealCard, memberState, totalWords } from "./ProposalView";
import { DrawPad } from "./DrawPad";
import { ActivityNotice, useProposalActivity } from "./activity";
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
      <Logo height={30} />
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
  expired: { h: "This link has expired", p: "This link has stopped working. Ask the sender for a new one." },
  passed: { h: "You passed this on to sign", p: "They have their own link now, with the same email code check. This one is read only." },
};

const initialsOf = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 2);

/** The page's own header: who sent it and to whom, Secure signing, and the one action (Review and sign, or Your sealed copy). */
function ClientTop({ d, label, onGo }: { d: SignerView["doc"]; label: string | null; onGo: () => void }) {
  return (
    <header className="sg-top cv-top">
      <div className="cv-top-in">
        <span className="cv-from">
          <span className="cv-from-av" aria-hidden>
            {initialsOf(d.from.name)}
          </span>
          <span className="cv-from-t">
            <strong>{d.from.name}</strong>
            <span>
              {d.from.title ? `${d.from.title} · ` : ""}sent this to {d.to.name}
              {d.company ? ` at ${d.company}` : ""}
            </span>
          </span>
        </span>
        <span className="sg-secure">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <rect x="5" y="11" width="14" height="10" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          Secure signing
        </span>
        {label && (
          <button type="button" className="cv-top-go" data-go="sign" onClick={onGo}>
            {label}
          </button>
        )}
      </div>
    </header>
  );
}

type Step = "read" | "sign" | "decline" | "ask" | "handoff";

export function SignView({ token }: { token: string }) {
  const [v, setV] = useState<SignerView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("read");
  // Ask a question (sent to the member by email), or pass it to someone else to sign.
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<string | null>(null);
  const [next, setNext] = useState({ name: "", title: "", email: "", note: "" });
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // Which step an error belongs to: it shows there, and only there.
  const [errAt, setErrAt] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  // Type it or draw it: a drawing goes with the name typed (the record keeps both).
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [png, setPng] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  // The option and add-ons picked (a proposal with options): theirs to change until they sign.
  const [choice, setChoice] = useState<Choice | null>(null);
  const signRef = useRef<HTMLDivElement>(null);
  const sideRef = useRef<HTMLDivElement>(null);
  const cardGo = useRef<HTMLButtonElement>(null);
  /*
   * Keyboard focus: into each step's heading when it opens, back to the button that opened it when
   * it closes. The button is remembered itself, and by its place on the page (data-region) and its
   * step (data-go), for when the read view draws its buttons afresh on return.
   */
  const trigger = useRef<{ el: HTMLElement | null; key: string; region: string | null } | null>(null);
  const go = (to: Step) => {
    if (to !== "read" && step === "read") {
      const el = typeof document !== "undefined" ? (document.activeElement as HTMLElement | null) : null;
      trigger.current = { el, key: to, region: el?.closest<HTMLElement>("[data-region]")?.dataset.region ?? null };
    }
    setErr(null);
    setStep(to);
  };
  const cardShows = useOnScreen(cardGo, !!v && v.status === "open" && step === "read");
  // What the sender sees: opens, which sections and options are read, what is picked, said near the footer (lib/close).
  // Once it is signed only a download of the signed PDF is told.
  const track = useProposalActivity(token, { enabled: v?.status === "open" || v?.status === "signed", mode: v?.status === "signed" ? "downloads" : "read" });

  useEffect(() => {
    void call({ token, op: "view" }).then((r) => (r.error ? setFatal(r.error) : (setV(r), setChoice(r.choice ?? (r.doc.pricing ? { optionId: startOption(r.doc.pricing), addOnIds: [] } : null)))));
  }, [token]);
  useEffect(() => {
    if (step !== "read") {
      const host = step === "sign" ? signRef.current : sideRef.current;
      host?.scrollIntoView({ behavior: "smooth", block: "start" });
      host?.querySelector<HTMLElement>("[data-step-head]")?.focus({ preventScroll: true });
    } else if (trigger.current) {
      const t = trigger.current;
      trigger.current = null;
      requestAnimationFrame(() => {
        const el = t.el?.isConnected ? t.el : document.querySelector<HTMLElement>(`${t.region ? `[data-region="${t.region}"] ` : ""}[data-go="${t.key}"]`) ?? document.querySelector<HTMLElement>(`[data-go="${t.key}"]`);
        el?.focus();
      });
    }
    // The code confirmed inside a step: on to that step's own heading.
  }, [step, v?.codeVerified]);

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
  const sigOk = method === "typed" ? nameOk : nameOk && !!png;
  const fromFirst = d.from.name.split(" ")[0] || d.from.name;
  const picked = d.pricing && choice ? choiceRec(d.pricing, choice) : null;
  const pickTo = (c: Choice) => {
    if (!open) return;
    // The sender's activity: the option picked, and each add-on turned on or off.
    if (d.pricing) {
      if (c.optionId !== choice?.optionId) track.picked(c.optionId, d.pricing.options.find((o) => o.id === c.optionId)?.name);
      for (const a of d.pricing.addOns) {
        const was = !!choice?.addOnIds.includes(a.id);
        const now = c.addOnIds.includes(a.id);
        if (was !== now) track.addon(a.id, now, a.name);
      }
    }
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

  // Confirm your email: the 6-digit code. Signing needs it, and so do asking, passing it on and declining, which speak for the signer named.
  const codeStep = v.codeVerified ? (
    <p className="sg-help">Confirmed: {v.emailHint}</p>
  ) : !sentTo && !v.codeSent ? (
    <>
      <p className="sg-help">We&#39;ll email a 6-digit code to {v.emailHint}.</p>
      <button
        type="button"
        className="btn btn-pine btn-lg"
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
        The 6 digit code we sent to {sentTo ?? v.emailHint}
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
        <button type="submit" className="btn btn-pine btn-lg" aria-busy={busy === "verify"} disabled={!!busy || code.length !== 6}>
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
  );
  /** Ask, pass on, decline: the code first, in the same panel, then the step itself. */
  const gate = (head: string, what: string) => (
    <div className="sg-form">
      <h2 className="cv-h3 cv-side-h" tabIndex={-1} data-step-head>
        {head}
      </h2>
      <p className="sg-help">First, confirm it&#39;s you. {what} speaks for {v.signer.name}, so it needs the code from your email, as signing does.</p>
      {codeStep}
      <div className="sg-row">
        <button type="button" className="btn" onClick={() => go("read")}>
          Back
        </button>
      </div>
    </div>
  );

  /* ----- beside the proposal: ask, pass it on, decline (each after the code) ----- */
  const sideStep =
    step === "ask" && !v.codeVerified ? (
      gate(`Ask ${fromFirst} a question`, "A question")
    ) : step === "handoff" && !v.codeVerified ? (
      gate("Send to someone else to sign", "Passing it on")
    ) : step === "decline" && !v.codeVerified ? (
      gate("Decline this proposal", "Declining")
    ) : step === "ask" ? (
      asked ? (
        <div className="cv-wait" role="status">
          <span className="cv-wait-h" tabIndex={-1} data-step-head>
            Sent to {asked}. They&#39;ll reply by email.
          </span>
          <button type="button" className="sg-link" onClick={() => (go("read"), setAsked(null), setQuestion(""))}>
            Back to the proposal
          </button>
        </div>
      ) : (
        <form
          className="sg-form"
          onSubmit={async (e) => {
            e.preventDefault();
            const r = await run("ask", { op: "ask", question });
            if (r) setAsked((r as unknown as { to: string }).to || fromFirst);
          }}
        >
          <h2 className="cv-h3 cv-side-h" tabIndex={-1} data-step-head>
            Ask {fromFirst} a question
          </h2>
          <label className="sg-label" htmlFor="sg-q">
            Your question
          </label>
          <textarea id="sg-q" className="input sg-area" rows={4} maxLength={2000} placeholder="Like: can it start a week later?" value={question} onChange={(e) => setQuestion(e.target.value)} />
          <span className="cv-fine">It goes to {fromFirst} by email with a link back to this proposal. {fromFirst} replies to your email. Nothing is signed by asking.</span>
          {err && errAt === "ask" && (
            <p className="sg-err" role="alert">
              {err}
            </p>
          )}
          <div className="sg-row">
            <button type="submit" className="btn btn-pine" aria-busy={busy === "ask"} disabled={!!busy || !question.trim()}>
              {busy === "ask" ? "Sending" : "Send the question"}
            </button>
            <button type="button" className="btn" onClick={() => go("read")}>
              Back
            </button>
          </div>
        </form>
      )
    ) : step === "handoff" ? (
      <form
        className="sg-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run("handoff", { op: "handoff", signer: { name: next.name.trim(), title: next.title.trim(), email: next.email.trim() }, note: next.note });
          if (r) setV(r), setStep("read"), window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      >
        <h2 className="cv-h3 cv-side-h" tabIndex={-1} data-step-head>
          Send to someone else to sign
        </h2>
        <p className="sg-help">They get their own link, and confirm their email with a code before signing. Yours becomes read only. {fromFirst} is told.</p>
        {(["name", "title", "email"] as const).map((k) => (
          <label key={k} className="sg-label">
            {k === "name" ? "Their full name" : k === "title" ? "Their title (optional)" : "Their work email"}
            <input className="input" type={k === "email" ? "email" : "text"} autoComplete="off" maxLength={k === "email" ? 160 : 100} value={next[k]} onChange={(e) => setNext({ ...next, [k]: e.target.value })} />
          </label>
        ))}
        <label className="sg-label">
          A note for them (optional)
          <textarea className="input sg-area" rows={2} maxLength={600} value={next.note} onChange={(e) => setNext({ ...next, note: e.target.value })} />
        </label>
        {err && errAt === "handoff" && (
          <p className="sg-err" role="alert">
            {err}
          </p>
        )}
        <div className="sg-row">
          <button type="submit" className="btn btn-pine" aria-busy={busy === "handoff"} disabled={!!busy || !NAME_RE.test(next.name.trim()) || !/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(next.email.trim())}>
            {busy === "handoff" ? "Sending" : `Send it to ${next.name.trim().split(" ")[0] || "them"}`}
          </button>
          <button type="button" className="btn" onClick={() => go("read")}>
            Back
          </button>
        </div>
      </form>
    ) : step === "decline" ? (
      <form
        className="sg-form"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await run("decline", { op: "decline", reason });
          if (r) setV(r), setStep("read");
        }}
      >
        <h2 className="cv-h3 cv-side-h" tabIndex={-1} data-step-head>
          Decline this proposal
        </h2>
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
          <button type="submit" className="btn sg-red" aria-busy={busy === "decline"} disabled={!!busy}>
            {busy === "decline" ? "Declining" : "Decline"}
          </button>
          <button type="button" className="btn" onClick={() => go("read")}>
            Back
          </button>
        </div>
      </form>
    ) : null;

  /* ----- the signatures section: Accept and sign, the three steps, or how it stands ----- */
  const signPanel =
    step === "sign" ? (
      <div className="sg-steps">
        <h2 className="cv-h2" tabIndex={-1} data-step-head>
          Sign this proposal
        </h2>
        <span className="cv-accept-l">{accepting}</span>
        <ol className="sg-ol">
          <li className="sg-step" data-done={v.codeVerified}>
            <span className="sg-num" aria-hidden>
              {v.codeVerified ? <IconCheck size={14} /> : 1}
            </span>
            <div className="sg-stepbody">
              <h3 className="sg-h3">Confirm your email</h3>
              {codeStep}
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
                const r = await run("sign", { op: "sign", name: name.trim(), consent: agree, hash: v.hash, ...(choice ? { choice } : {}), ...(method === "drawn" && png ? { method: "drawn", png } : {}) });
                if (r) setV(r), setChoice(r.choice), setStep("read"), window.scrollTo({ top: 0, behavior: "smooth" });
              }}
            >
              <h3 className="sg-h3">Add your signature</h3>
              <div className="cv-sigtabs" role="tablist" aria-label="How to sign">
                {(["typed", "drawn"] as const).map((m) => (
                  <button key={m} type="button" role="tab" aria-selected={method === m} className="cv-sigtab" data-on={method === m} disabled={!v.codeVerified || !agree} onClick={() => setMethod(m)}>
                    {m === "typed" ? "Type it" : "Draw it"}
                  </button>
                ))}
              </div>
              <label className="sg-label" htmlFor="sg-name">
                Your full name
              </label>
              <input id="sg-name" className="input sg-name" autoComplete="name" maxLength={100} placeholder={d.to.name} value={name} disabled={!v.codeVerified || !agree} onChange={(e) => setName(e.target.value)} />
              {method === "typed" ? (
                <div className="sg-sig" aria-label="Your signature" data-empty={!name.trim()}>
                  <span className="sg-sig-name">{name.trim() || "Your signature"}</span>
                  <span className="sg-sig-line">Signature · {dayOf(new Date().toISOString())}</span>
                </div>
              ) : v.codeVerified && agree ? (
                <DrawPad onChange={setPng} />
              ) : null}
              {err && errAt === "sign" && (
                <p className="sg-err" role="alert">
                  {err}
                </p>
              )}
              <button type="submit" className="btn btn-pine btn-lg cv-signbtn" aria-busy={busy === "sign"} disabled={!!busy || !v.codeVerified || !agree || !sigOk}>
                {busy === "sign" ? "Signing" : "Sign"}
              </button>
              <span className="cv-fine" aria-live="polite">
                {!v.codeVerified ? "Confirm your email first." : !agree ? "Tick the box in step 2 first." : !sigOk ? (method === "typed" ? "Type your first and last name." : "Type your name and draw your signature in the box.") : "Ready."}
              </span>
              <p className="sg-fine">
                Signing records the time, this device&#39;s IP address and browser, {picked ? "the option you picked, " : ""}
                {method === "drawn" ? "your drawing, " : ""}and the document&#39;s fingerprint (SHA-256): <span className="sg-hash">{v.hash}</span>
              </p>
            </form>
          </li>
        </ol>
        <div className="sg-row">
          <button type="button" className="btn" onClick={() => go("read")}>
            Back to the proposal
          </button>
          <button type="button" className="sg-link" data-go="decline" onClick={() => go("decline")}>
            Decline instead
          </button>
        </div>
      </div>
    ) : open ? (
      <div className="cv-acceptin" data-region="accept">
        <h2 className="cv-h2">Accept and sign</h2>
        <span className="cv-accept-l">{accepting}</span>
        <Parties doc={d} client={{ state: "here", name: v.signer.name, title: v.signer.title }} member={{ state: memberState(v.memberMode, v.member, false), sig: v.member }} />
        {err && errAt === "choose" && (
          <p className="sg-err" role="alert">
            {err}
          </p>
        )}
        <div className="cv-acts">
          <button ref={cardGo} type="button" className="cv-go" data-go="sign" onClick={() => go("sign")}>
            Accept and sign
          </button>
          <button type="button" className="cv-btn cv-btn-lg" data-go="ask" onClick={() => go("ask")}>
            Ask {fromFirst} a question
          </button>
          {v.handoffsLeft > 0 && (
            <button type="button" className="cv-btn cv-btn-lg" data-go="handoff" onClick={() => go("handoff")}>
              Send to someone else to sign
            </button>
          )}
          <button type="button" className="cv-decline" data-go="decline" onClick={() => go("decline")}>
            Decline
          </button>
        </div>
        <span className="cv-fine">
          Next you&#39;ll get a code by email at {v.emailHint}, then type or draw your signature.{" "}
          {v.memberMode === "after"
            ? `You'll get the ${v.sealOnSign ? "sealed" : "signed"} copy by email once you and ${d.from.name} have both signed.`
            : v.memberMode === "now" && v.member
              ? `${fromFirst} has already signed, so you ${v.sealOnSign ? "receive the sealed copy" : "get the signed copy by email"} as soon as you sign.`
              : v.sealOnSign
                ? "You'll receive a sealed copy as soon as you sign."
                : "You'll get the signed copy by email as soon as you sign."}
        </span>
      </div>
    ) : v.status === "signed" && v.awaitingMember ? (
      <div className="cv-acceptin">
        <div className="cv-wait" role="status">
          <span className="cv-wait-h">Signed by you · waiting for {d.from.name} to countersign</span>
          <span className="cv-fine">
            {v.signedChoice ? `You chose ${v.signedChoice.summary}: ${v.signedChoice.total}. That's locked now. ` : ""}
            {fromFirst} countersigns next. You&#39;ll both get the {v.sealOnSign ? "sealed" : "signed"} copy by email as soon as they do.
          </span>
        </div>
        <Parties doc={d} client={{ state: "signed", name: v.signedName, title: v.signer.title, at: v.signedAt, img: v.signedImg }} member={{ state: memberState(v.memberMode, v.member, true), sig: v.member }} />
      </div>
    ) : v.status === "signed" ? (
      <div className="cv-acceptin">
        <div className="cv-done">
          <span className="cv-done-h">Signed. Thank you, {(v.signedName ?? d.to.name).split(" ")[0]}.</span>
          <span className="cv-done-p">
            {v.signedChoice ? `You chose ${v.signedChoice.summary}: ${v.signedChoice.total}. That is locked now. ` : ""}
            {v.sealed ? `Your sealed copy is on its way to ${v.emailHint}, and here to download.` : "Your signed copy, with its audit trail, is on its way to your email."} {fromFirst} has been told.
          </span>
          <div className="cv-acts">
            {v.sealed && (
              <a className="cv-btn cv-btn-pine" href={v.sealed.pdf} data-tracked-download onClick={() => track.downloaded()}>
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
        {v.sealed && <SealCard at={v.sealed.at} signers={[v.signedName ?? d.to.name, ...(v.member ? [v.member.name] : [])]} pdf={null} check="/check" />}
        <Parties doc={d} client={{ state: "signed", name: v.signedName, title: v.signer.title, at: v.signedAt, img: v.signedImg }} member={{ state: memberState(v.memberMode, v.member, true), sig: v.member }} />
      </div>
    ) : (
      <div className="cv-acceptin">
        <h2 className="cv-h2">{v.status === "passed" && v.passedTo ? `You passed this to ${v.passedTo.name} to sign` : STATUS_SAY[v.status].h}</h2>
        <span className="cv-fine">{STATUS_SAY[v.status].p}</span>
      </div>
    );

  /* ----- the summary beside the proposal ----- */
  const t = picked ? totalWords(picked) : null;
  const pickedOpt = d.pricing && choice ? d.pricing.options.find((o) => o.id === choice.optionId) ?? null : null;
  const signedDone = v.status === "signed" && !v.awaitingMember;
  const side = (
    <div className="cv-sidein" ref={sideRef} data-region="side">
      <section className="cv-sidecard" aria-label={open ? "Your choice" : signedDone ? "Signed" : "As offered"}>
        <span className="cv-kicker">{open ? "Your choice" : v.status === "signed" ? "Signed" : "As offered"}</span>
        {picked && t ? (
          <>
            <ul className="cv-lines">
              <li>
                <span>{picked.option}</span>
                <span>{pickedOpt ? priced(pickedOpt.price, pickedOpt.billing) : ""}</span>
              </li>
              {picked.addOns.map((a) => (
                <li key={a.name}>
                  <span>{a.name}</span>
                  <span>{a.price}</span>
                </li>
              ))}
            </ul>
            <span className="cv-sidetotal" aria-live="polite">
              {t.line}
            </span>
            <span className="cv-sidesub">{t.sub}</span>
            {pickedOpt?.note && <span className="cv-fine">{pickedOpt.note}.</span>}
          </>
        ) : (
          <span className="cv-sidesub">{d.title}</span>
        )}
        {open && step !== "sign" ? (
          <button type="button" className="cv-go cv-sidego" data-go="sign" onClick={() => go("sign")}>
            Review and sign
          </button>
        ) : signedDone && v.sealed ? (
          <a className="cv-go cv-sidego" href={v.sealed.pdf} data-tracked-download onClick={() => track.downloaded()}>
            Download the sealed copy
          </a>
        ) : null}
        {open && d.pricing && d.pricing.options.length + d.pricing.addOns.length > 1 && (
          <a className="sg-link cv-sidelink" href="#invest">
            Change option or add-ons
          </a>
        )}
      </section>
      {open && (
        <section className="cv-sidecard" aria-label="Not ready to sign">
          {sideStep ?? (
            <>
              <h2 className="cv-h3 cv-side-h">Not ready to sign?</h2>
              <button type="button" className="cv-btn" data-go="ask" onClick={() => go("ask")}>
                Ask {fromFirst} a question
              </button>
              {v.handoffsLeft > 0 && (
                <button type="button" className="cv-btn" data-go="handoff" onClick={() => go("handoff")}>
                  Send to someone else to sign
                </button>
              )}
              <button type="button" className="sg-link cv-sidelink" data-go="decline" onClick={() => go("decline")}>
                Decline this proposal
              </button>
            </>
          )}
        </section>
      )}
      <div className="cv-notice">{open ? <ActivityNotice sender={d.from.name} /> : v.status === "signed" && v.sealed ? <ActivityNotice sender={d.from.name} signed /> : null}</div>
    </div>
  );

  /* ----- the three steps under the title, while it can be signed ----- */
  const chose = !!choice && !!d.pricing && (choice.optionId !== startOption(d.pricing) || choice.addOnIds.length > 0);
  const guide = open ? (
    <div className="cv-guide" data-region="guide">
      <ol className="cv-steps3">
        <li data-on="true">
          <span className="cv-n" aria-hidden>
            1
          </span>
          <span>
            <strong>Read it</strong>
            <span>About the scope, the plan, then the price and the terms.</span>
          </span>
        </li>
        {d.pricing && d.pricing.options.length > 1 ? (
          <li data-on={!chose} data-done={chose}>
            <span className="cv-n" aria-hidden>
              {chose ? <IconCheck size={13} /> : 2}
            </span>
            <span>
              <strong>Pick an option</strong>
              <span>
                {d.pricing.options.length} to choose from{d.pricing.addOns.length ? ", and add-ons to tick" : ""}. Now picked: {picked ? `${picked.option}, ${picked.total}` : "none"}.
              </span>
            </span>
          </li>
        ) : null}
        <li>
          <span className="cv-n" aria-hidden>
            {d.pricing && d.pricing.options.length > 1 ? 3 : 2}
          </span>
          <span>
            <strong>Sign</strong>
            <span>A code goes to {v.emailHint}. Then type or draw your name. About a minute.</span>
          </span>
        </li>
      </ol>
      <p className="cv-help">
        No account needed.{" "}
        {v.handoffsLeft > 0 && (
          <>
            Not the one who signs?{" "}
            <button type="button" className="sg-link" data-go="handoff" onClick={() => go("handoff")}>
              Send it to someone else
            </button>
            .{" "}
          </>
        )}
        Something unclear?{" "}
        <button type="button" className="sg-link" data-go="ask" onClick={() => go("ask")}>
          Ask {fromFirst} a question
        </button>
        .
      </p>
    </div>
  ) : null;

  return (
    <div className="sg cv-page">
      <ClientTop d={d} label={open && step !== "sign" ? "Review and sign" : signedDone ? "Your sealed copy" : null} onGo={() => (open ? go("sign") : document.getElementById("sign")?.scrollIntoView({ behavior: "smooth", block: "start" }))} />
      {!open && (
        <section className="cv-banner" data-status={v.status}>
          <div className="cv-banner-in">
            {v.status === "signed" && <SignedArt />}
            <span className="cv-banner-t">
              <h2 className="cv-banner-h">{v.status === "passed" && v.passedTo ? `You passed this to ${v.passedTo.name} to sign` : v.awaitingMember ? `Signed by you · waiting for ${d.from.name} to countersign` : v.status === "signed" && v.signedName ? `Signed by ${v.signedName} on ${dayOf(v.signedAt)}` : STATUS_SAY[v.status].h}</h2>
              <span className="cv-banner-p">{v.awaitingMember ? `You'll both get the ${v.sealOnSign ? "sealed" : "signed"} copy by email once ${fromFirst} countersigns.` : STATUS_SAY[v.status].p}</span>
            </span>
            {v.status === "signed" && (
              <a className="sg-link cv-banner-go" href={v.sealed ? "#sign" : v.copyUrl ?? "#sign"}>
                {v.sealed ? "See the sealed copy" : "Open the signed copy"}
              </a>
            )}
          </div>
        </section>
      )}
      <main className="cv-main">
        <ProposalView
          doc={d}
          openUntil={open ? v.expiresAt ?? "none" : null}
          canSign={open}
          choice={choice}
          onPick={open && d.pricing ? (id) => pickTo({ optionId: id, addOnIds: choice?.addOnIds ?? [] }) : undefined}
          onAddOn={open && d.pricing ? (id, on) => pickTo({ optionId: choice?.optionId ?? startOption(d.pricing!), addOnIds: on ? [...(choice?.addOnIds ?? []), id] : (choice?.addOnIds ?? []).filter((x) => x !== id) }) : undefined}
          sign={
            <div ref={signRef} className="cv-accept" id="sg-panel">
              {signPanel}
            </div>
          }
          guide={guide}
          side={side}
          signedAt={v.status === "signed" ? v.signedAt : null}
          sealed={!!v.sealed}
        />

        <footer className="sg-foot cv-foot">
          <p>
            <strong>Sent with Merlin.</strong> {d.from.name} sent this with Merlin, from Revenue Nomad. Merlin keeps the signed copy and an audit trail: when it was sent, opened, the email confirmed and signed.
          </p>
          <p>
            Document fingerprint (SHA-256): <span className="sg-hash">{v.hash}</span>
          </p>
          <SignLegal />
        </footer>
      </main>
      {open && step === "read" && !cardShows && (
        <div className="sg-bar">
          <button type="button" className="btn btn-pine btn-lg" data-go="sign" onClick={() => go("sign")}>
            Sign this proposal
          </button>
        </div>
      )}
    </div>
  );
}
