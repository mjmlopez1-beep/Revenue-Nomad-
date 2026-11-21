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
import { useEffect, useRef, useState } from "react";
import { Brand, IconCheck } from "../ui/shared";
import type { SignerView } from "@/lib/proposals/types";
import { DocBlocks, dayOf } from "./doc";
import "./sign.css";

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
      <Brand dark size={30} />
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
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [reason, setReason] = useState("");
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    void call({ token, op: "view" }).then((r) => (r.error ? setFatal(r.error) : setV(r)));
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
        </main>
      </div>
    );
  if (!v)
    return (
      <div className="sg">
        <SignTop />
        <main className="sg-main" aria-busy="true">
          <div className="sg-card sg-skel" />
        </main>
      </div>
    );

  const d = v.doc;
  const run = async (what: string, body: Record<string, unknown>) => {
    setBusy(what);
    setErr(null);
    const r = await call<SignerView & { sent?: boolean; emailHint?: string }>({ token, ...body });
    setBusy(null);
    if (r.error) return setErr(r.error), null;
    return r;
  };
  const open = v.status === "open";
  const nameOk = NAME_RE.test(name.trim());

  return (
    <div className="sg">
      <SignTop />
      <main className="sg-main">
        <section className="sg-card sg-head" aria-labelledby="sg-title">
          <p className="sg-from">Proposal from</p>
          <p className="sg-sender">{d.from.name}</p>
          {d.from.title && <p className="sg-sender-t">{d.from.title}</p>}
          <h1 className="sg-title" id="sg-title">
            {d.title}
          </h1>
          <dl className="sg-meta">
            <div>
              <dt>Prepared for</dt>
              <dd>
                {d.to.name}
                {d.to.title ? `, ${d.to.title}` : ""}
                {d.company ? ` · ${d.company}` : ""}
              </dd>
            </div>
            <div>
              <dt>Sent</dt>
              <dd>
                {dayOf(d.preparedAt)} · Version {d.version}
              </dd>
            </div>
            {open && (
              <div>
                <dt>Sign by</dt>
                <dd>{dayOf(v.expiresAt)}</dd>
              </div>
            )}
          </dl>
        </section>

        {!open && (
          <section className="sg-card sg-state" data-status={v.status}>
            {v.status === "signed" && (
              <span className="sg-done" aria-hidden>
                <IconCheck size={20} />
              </span>
            )}
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

        <article className="sg-card sg-doc" aria-label="The proposal">
          <DocBlocks blocks={d.blocks} />
        </article>

        {open && (
          <div ref={panel} className="sg-card sg-panel" id="sg-panel">
            {step === "decline" ? (
              <form
                className="sg-form"
                onSubmit={async (e) => {
                  e.preventDefault();
                  const r = await run("decline", { op: "decline", reason });
                  if (r) setV(r);
                }}
              >
                <h2 className="sg-h2">Decline this proposal</h2>
                <label className="sg-label" htmlFor="sg-reason">
                  Tell {d.from.name.split(" ")[0]} why (optional)
                </label>
                <textarea id="sg-reason" className="input sg-area" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                {err && <p className="sg-err">{err}</p>}
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
              <div className="sg-ready">
                <h2 className="sg-h2">Ready to sign?</h2>
                <p className="sg-help">It takes a minute. We confirm it&#39;s you with a code sent to {v.emailHint}.</p>
                <button type="button" className="btn btn-primary btn-lg sg-wide" onClick={() => setStep("sign")}>
                  Sign this proposal
                </button>
                <button type="button" className="sg-link" onClick={() => setStep("decline")}>
                  Decline
                </button>
              </div>
            ) : (
              <div className="sg-steps">
                <h2 className="sg-h2">Sign this proposal</h2>
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
                      )}
                    </div>
                  </li>
                  <li className="sg-step" data-off={!v.codeVerified} data-done={agree}>
                    <span className="sg-num" aria-hidden>
                      {agree ? <IconCheck size={14} /> : 2}
                    </span>
                    <div className="sg-stepbody">
                      <h3 className="sg-h3">Agree to sign electronically</h3>
                      <label className="sg-consent">
                        <input type="checkbox" checked={agree} disabled={!v.codeVerified} onChange={(e) => setAgree(e.target.checked)} />
                        <span>{v.consent}</span>
                      </label>
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
                        const r = await run("sign", { op: "sign", name: name.trim(), consent: agree, hash: v.hash });
                        if (r) setV(r), window.scrollTo({ top: 0, behavior: "smooth" });
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
                      {err && <p className="sg-err">{err}</p>}
                      <button type="submit" className="btn btn-primary btn-lg sg-wide" aria-busy={busy === "sign"} disabled={!!busy || !v.codeVerified || !agree || !nameOk}>
                        {busy === "sign" ? "Signing" : "Sign"}
                      </button>
                      <p className="sg-fine">
                        Signing records the time, this device&#39;s IP address and browser, and the document&#39;s fingerprint (SHA-256): <span className="sg-hash">{v.hash}</span>
                      </p>
                    </form>
                  </li>
                </ol>
                {err && !v.codeVerified && <p className="sg-err">{err}</p>}
                <button type="button" className="sg-link" onClick={() => (setStep("decline"), setErr(null))}>
                  Decline instead
                </button>
              </div>
            )}
          </div>
        )}

        <footer className="sg-foot">
          <p>
            Sent by {d.from.name} with Merlin, from Revenue Nomad. Merlin keeps the signed copy and an audit trail: when it was sent, opened, the email confirmed and signed.
          </p>
          <p>
            Document fingerprint (SHA-256): <span className="sg-hash">{v.hash}</span>
          </p>
        </footer>
      </main>
      {open && step === "read" && (
        <div className="sg-bar">
          <button type="button" className="btn btn-primary btn-lg" onClick={() => setStep("sign")}>
            Sign this proposal
          </button>
        </div>
      )}
    </div>
  );
}
