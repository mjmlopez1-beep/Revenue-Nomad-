"use client";

/**
 * The signing page for a document (a /sign/<token> link whose token is a document signer's,
 * lib/documents/store.ts). The same security as a proposal's: the signed link, a 6-digit code to
 * the signer's email, the consent and its version. Then the signer adopts a signature, typed or
 * drawn, fills their own fields on the PDF (drawn here with pdf.js), and signs. Only their fields
 * are theirs to fill; who signs before and after them is shown. Phone first: one column, 16px
 * gutters, 48px fields, the action bar at the foot of the screen.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { IconCheck } from "../ui/shared";
import { PdfPages } from "../ui/PdfPages";
import { ActivityNotice, useProposalActivity } from "./activity";
import type { DocField, DocSignerView } from "@/lib/documents/types";
import { FIELD_SAY } from "@/lib/documents/types";
import { ConsentBox, SignLegal, SignTop, SignedArt, useOnScreen } from "./Sign";
import { dayOf } from "./doc";
import "../ui/pdf.css";
import "./sign.css";

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: +\p{L}[\p{L}'’.-]*)+$/u;

async function call<T = DocSignerView>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

const SAY: Record<DocSignerView["status"], { h: string; p: string }> = {
  open: { h: "", p: "" },
  waiting: { h: "It isn't your turn yet", p: "Someone signs before you. We'll email you when it's your turn." },
  signed: { h: "You signed it", p: "Thank you. When everyone has signed, the final PDF with its audit trail comes to your email." },
  done: { h: "Signed by everyone", p: "The final PDF, with every signature and an audit trail page, is in your email and on its page." },
  declined: { h: "This document was declined", p: "Someone declined to sign it, so it can't be signed. The sender knows." },
  void: { h: "This document was withdrawn", p: "The sender withdrew it, so it can't be signed. Ask them if you expected to sign it." },
  expired: { h: "This link has expired", p: "Links to sign work for 30 days. Ask the sender for a new one." },
};
const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4);

/** A box to draw a signature in with a finger or a mouse. Gives a PNG, or null when empty. Also the member's own signature (app/post/MySignature.tsx). */
export function DrawPad({ onChange }: { onChange: (png: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const any = useRef(false);
  useEffect(() => {
    const c = ref.current!;
    const r = c.getBoundingClientRect();
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.width = Math.round(r.width * dpr);
    c.height = Math.round(r.height * dpr);
    const g = c.getContext("2d")!;
    g.scale(dpr, dpr);
    g.lineWidth = 2.4;
    g.lineCap = "round";
    g.lineJoin = "round";
    g.strokeStyle = "#0a1a13";
  }, []);
  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top] as const;
  };
  return (
    <div className="ds-pad">
      <canvas
        ref={ref}
        className="ds-pad-c"
        aria-label="Draw your signature"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture(e.pointerId);
          drawing.current = true;
          const g = ref.current!.getContext("2d")!;
          const [x, y] = at(e);
          g.beginPath();
          g.moveTo(x, y);
        }}
        onPointerMove={(e) => {
          if (!drawing.current) return;
          const g = ref.current!.getContext("2d")!;
          const [x, y] = at(e);
          g.lineTo(x, y);
          g.stroke();
          any.current = true;
        }}
        onPointerUp={() => {
          drawing.current = false;
          if (any.current) onChange(ref.current!.toDataURL("image/png"));
        }}
      />
      <span className="ds-pad-line" aria-hidden />
      <button
        type="button"
        className="sg-link ds-pad-clear"
        onClick={() => {
          const c = ref.current!;
          c.getContext("2d")!.clearRect(0, 0, c.width, c.height);
          any.current = false;
          onChange(null);
        }}
      >
        Clear
      </button>
    </div>
  );
}

export function DocSignView({ token }: { token: string }) {
  const [v, setV] = useState<DocSignerView | null>(null);
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
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [png, setPng] = useState<string | null>(null);
  const [adopted, setAdopted] = useState(false);
  // The sender signing their own document while signed in here: their saved signature, in one click.
  const [saved, setSaved] = useState<DocSignerView["saved"]>(null);
  const [useSaved, setUseSaved] = useState(false);
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [reason, setReason] = useState("");
  const panel = useRef<HTMLDivElement>(null);
  const cardGo = useRef<HTMLButtonElement>(null);
  const cardShows = useOnScreen(cardGo, !!v && v.status === "open" && step === "read");
  // What the sender sees: opens and which pages are read, said near the footer (lib/close).
  useProposalActivity(token, { enabled: v?.status === "open" || v?.status === "waiting" });

  useEffect(() => {
    void call({ token, op: "view" }).then((r) => (r.error ? setFatal(r.error) : (setV(r), setName(r.me.name), setSaved(r.saved ?? null))));
  }, [token]);
  useEffect(() => {
    if (step !== "read") panel.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [step]);

  const mine = useMemo(() => v?.fields ?? [], [v]);
  const left = mine.filter((f) => f.required && ((f.kind === "text" && !String(values[f.id] ?? "").trim()) || (f.kind === "checkbox" && values[f.id] !== true)));
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

  const run = async (what: string, body: Record<string, unknown>) => {
    setBusy(what);
    setErr(null);
    const r = await call<DocSignerView & { sent?: boolean; emailHint?: string }>({ token, ...body });
    setBusy(null);
    if (r.error) return setErr(r.error), setErrAt(what), null;
    return r;
  };
  const open = v.status === "open";
  const nameOk = NAME_RE.test(name.trim());
  const sigOk = method === "typed" ? nameOk : nameOk && !!png;
  const ready = open && v.codeVerified && agree && adopted;
  const sigShow = (f: DocField) =>
    f.kind === "signature" ? (
      method === "drawn" && png ? <img src={png} alt="Your signature" className="ds-sigimg" /> : <span className="ds-script">{name}</span>
    ) : f.kind === "initials" ? (
      <span className="ds-script">{String(values[f.id] ?? "") || initialsOf(name)}</span>
    ) : f.kind === "date" ? (
      <span>{dayOf(new Date().toISOString())}</span>
    ) : f.kind === "name" ? (
      <span>{name}</span>
    ) : null;

  const overlay = (page: number) => (
    <div className="df-layer ds-layer">
      {mine
        .filter((f) => f.page === page)
        .map((f) => (
          <div key={f.id} className="df-field ds-field df-c0" data-kind={f.kind} data-ready={ready} data-done={!!(ready && (f.kind === "text" ? String(values[f.id] ?? "").trim() : f.kind === "checkbox" ? values[f.id] === true : true))} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
            {!ready ? (
              <span className="df-field-l">
                {f.kind === "checkbox" ? "" : f.label || FIELD_SAY[f.kind]}
              </span>
            ) : f.kind === "text" ? (
              <input className="ds-in" aria-label={f.label || "Text"} placeholder={f.label || "Type here"} maxLength={200} value={String(values[f.id] ?? "")} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
            ) : f.kind === "checkbox" ? (
              <input type="checkbox" className="ds-box" aria-label={f.label || "Tick this box"} checked={values[f.id] === true} onChange={(e) => setValues({ ...values, [f.id]: e.target.checked })} />
            ) : (
              <span className="ds-filled">{sigShow(f)}</span>
            )}
          </div>
        ))}
    </div>
  );

  return (
    <div className="sg ds">
      <SignTop />
      <main className="sg-main ds-main">
        <section className="sg-card sg-head" aria-labelledby="sg-title">
          <p className="sg-from">Document to sign from</p>
          <p className="sg-sender">{v.from.name}</p>
          {v.from.title && <p className="sg-sender-t">{v.from.title}</p>}
          <h1 className="sg-title" id="sg-title">
            {v.title}
          </h1>
          <dl className="sg-meta">
            <div>
              <dt>For</dt>
              <dd>
                {v.me.name}
                {v.me.title ? `, ${v.me.title}` : ""}
              </dd>
            </div>
            {v.others.length > 0 && (
              <div>
                <dt>Also signing</dt>
                <dd>{v.others.map((o) => `${o.name}${o.status === "signed" ? " (signed)" : ""}`).join(", ")}</dd>
              </div>
            )}
            {open && (
              <div>
                <dt>Sign by</dt>
                <dd>{v.expiresAt ? dayOf(v.expiresAt) : "No end date"}</dd>
              </div>
            )}
            <div>
              <dt>Your fields</dt>
              <dd>
                {mine.length} on {new Set(mine.map((f) => f.page)).size} {new Set(mine.map((f) => f.page)).size === 1 ? "page" : "pages"}
              </dd>
            </div>
          </dl>
        </section>

        {!open && (
          <section className="sg-card sg-state" data-status={v.status}>
            {(v.status === "signed" || v.status === "done") && (
              <SignedArt on={v.status === "signed" ? "mint" : "white"} />
            )}
            <h2 className="sg-h">{SAY[v.status].h}</h2>
            <p className="sg-p">{SAY[v.status].p}</p>
            {v.copyUrl && (
              <a className="btn btn-pine btn-lg sg-wide" href={v.copyUrl}>
                Open the signed copy
              </a>
            )}
          </section>
        )}

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
                <h2 className="sg-h2">Decline to sign</h2>
                <label className="sg-label" htmlFor="sg-reason">
                  Tell {v.from.name.split(" ")[0]} why (optional)
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
              <div className="sg-ready">
                <h2 className="sg-h2">Ready to sign?</h2>
                <p className="sg-help">Read the document below. Your {mine.length === 1 ? "field is" : `${mine.length} fields are`} marked. We confirm it&#39;s you with a code sent to {v.emailHint}.</p>
                <button ref={cardGo} type="button" className="btn btn-pine btn-lg sg-wide" onClick={() => setStep("sign")}>
                  Start signing
                </button>
                <button type="button" className="sg-link" onClick={() => setStep("decline")}>
                  Decline
                </button>
              </div>
            ) : (
              <div className="sg-steps">
                <h2 className="sg-h2">Sign this document</h2>
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
                          <input id="sg-code" className="input sg-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
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
                  <li className="sg-step" data-off={!v.codeVerified || !agree} data-done={adopted}>
                    <span className="sg-num" aria-hidden>
                      {adopted ? <IconCheck size={14} /> : 3}
                    </span>
                    <div className="sg-stepbody">
                      <h3 className="sg-h3">Your signature</h3>
                      {adopted ? (
                        <>
                          <div className="sg-sig ds-sig-done">{method === "drawn" && png ? <img src={png} alt="Your signature" className="ds-sigimg" /> : <span className="sg-sig-name">{name}</span>}</div>
                          <button type="button" className="sg-link" onClick={() => (setAdopted(false), setUseSaved(false))}>
                            Change it
                          </button>
                        </>
                      ) : (
                        <>
                          {saved && (
                            <button
                              type="button"
                              className="btn btn-lg"
                              disabled={!v.codeVerified || !agree}
                              onClick={() => (setMethod(saved.kind), setPng(saved.img), setUseSaved(true), setAdopted(true))}
                            >
                              Use my saved signature
                            </button>
                          )}
                          <label className="sg-label" htmlFor="ds-name">
                            Your full name
                          </label>
                          <input id="ds-name" className="input sg-name" autoComplete="name" maxLength={100} value={name} disabled={!v.codeVerified || !agree} onChange={(e) => setName(e.target.value)} />
                          <div className="ds-tabs" role="tablist" aria-label="How to sign">
                            {(["typed", "drawn"] as const).map((m) => (
                              <button key={m} type="button" role="tab" aria-selected={method === m} className="ds-tab" data-on={method === m} disabled={!v.codeVerified || !agree} onClick={() => setMethod(m)}>
                                {m === "typed" ? "Type it" : "Draw it"}
                              </button>
                            ))}
                          </div>
                          {method === "typed" ? (
                            <div className="sg-sig" data-empty={!name.trim()}>
                              <span className="sg-sig-name">{name.trim() || "Your signature"}</span>
                              <span className="sg-sig-line">Signature · {dayOf(new Date().toISOString())}</span>
                            </div>
                          ) : (
                            v.codeVerified && agree && <DrawPad onChange={setPng} />
                          )}
                          <button type="button" className="btn btn-lg" disabled={!v.codeVerified || !agree || !sigOk} onClick={() => setAdopted(true)}>
                            Use this signature
                          </button>
                        </>
                      )}
                    </div>
                  </li>
                </ol>
                {ready && (
                  <p className="sg-help ds-fill-help">
                    {left.length ? `Fill ${left.length === 1 ? "the field" : `the ${left.length} fields`} marked on the document, then sign.` : "Your fields are filled in on the document below. Check them, then sign."}
                  </p>
                )}
                {err && errAt === "sign" && (
                  <p className="sg-err" role="alert">
                    {err}
                  </p>
                )}
                <button type="button" className="sg-link" onClick={() => (setStep("decline"), setErr(null))}>
                  Decline instead
                </button>
              </div>
            )}
          </div>
        )}

        <article className="sg-card ds-doc" aria-label="The document">
          <PdfPages src={`/api/documents/file?s=${encodeURIComponent(token)}`} pages={v.pages} overlay={open ? overlay : undefined} />
        </article>

        <footer className="sg-foot">
          <p>Sent by {v.from.name} with Merlin, from Revenue Nomad. Merlin keeps the signed copy and an audit trail: when it was sent, opened, the email confirmed and signed.</p>
          <p>
            Document fingerprint (SHA-256): <span className="sg-hash">{v.sha256}</span>
          </p>
          {(v.status === "open" || v.status === "waiting") && <ActivityNotice sender={v.from.name} />}
          <SignLegal />
        </footer>
      </main>
      {open && step === "read" && !cardShows && (
        <div className="sg-bar">
          <button type="button" className="btn btn-pine btn-lg" onClick={() => setStep("sign")}>
            Start signing
          </button>
        </div>
      )}
      {ready && (
        <div className="sg-bar">
          <button
            type="button"
            className="btn btn-pine btn-lg"
            aria-busy={busy === "sign"}
            disabled={!!busy || left.length > 0}
            onClick={async () => {
              const vals: Record<string, string | boolean> = {};
              for (const f of mine) if (f.kind === "text" || f.kind === "checkbox" || f.kind === "initials") vals[f.id] = f.kind === "initials" ? String(values[f.id] ?? initialsOf(name)) : (values[f.id] ?? (f.kind === "checkbox" ? false : ""));
              const r = await run("sign", { op: "sign", name: name.trim(), method: useSaved ? "saved" : method, png: method === "drawn" && !useSaved ? png : undefined, values: vals, consent: agree, hash: v.sha256 });
              if (r) setV(r), window.scrollTo({ top: 0, behavior: "smooth" });
            }}
          >
            {busy === "sign" ? "Signing" : left.length ? `${left.length} to fill` : "Sign"}
          </button>
        </div>
      )}
    </div>
  );
}
