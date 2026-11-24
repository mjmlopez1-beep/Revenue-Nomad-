"use client";

/**
 * The signer's page for a document, rebuilt (RN_CONTRACTS2; off, DocSign.tsx as before). The
 * document, and one bar with the title, how many fields are theirs and one button:
 *
 *   Start   opens "Before you sign": the 6-digit email code and the consent on one sheet, then
 *           jumps to the first field with a flag
 *   Next    moves to the next empty field
 *   Finish  once every required field is done: signs
 *
 * Tapping a Signature or Initials field the first time opens "Adopt your signature" (Type or Draw;
 * the sender signing their own also gets "Use my saved signature"); every later one fills with a
 * tap. Date signed and Name fill on tap; a Title Merlin filled in arrives filled for them to check.
 * Decline and Download sit under the ••• menu. Phones: the bar is at the foot.
 *
 * The same security and API calls as before (/api/sign view, code, verify, sign, decline): the signed
 * link, the code, the consent text and version exactly as the server gives them (ConsentBox).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { DocField, DocSignerView } from "@/lib/documents/types";
import { FIELD_SAY } from "@/lib/documents/types";
import { PdfPages } from "../ui/PdfPages";
import { ActivityNotice, useProposalActivity } from "./activity";
import { ConsentBox, SignLegal, SignedArt } from "./Sign";
import { DrawPad } from "./DrawPad";
import { dayOf } from "./doc";
import "../ui/pdf.css";
import "./sign.css";
import "./sign2.css";

const NETWORK = "We couldn't reach the server. Check your connection and try again.";
const NAME_RE = /^\p{L}[\p{L}'’.-]*(?: +\p{L}[\p{L}'’.-]*)+$/u;
const initialsOf = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]!.toUpperCase())
    .join("")
    .slice(0, 4);
const SAY: Record<DocSignerView["status"], { h: string; p: string }> = {
  open: { h: "", p: "" },
  waiting: { h: "It isn't your turn yet", p: "Someone signs before you. We'll email you when it's your turn." },
  signed: { h: "You signed it", p: "Thank you. When everyone has signed, the final PDF with its audit trail comes to your email." },
  done: { h: "Signed by everyone", p: "The final PDF, with every signature and an audit trail page, is in your email and on its page." },
  declined: { h: "This document was declined", p: "Someone declined to sign it, so it can't be signed. The sender knows." },
  void: { h: "This was canceled", p: "The sender canceled it, so it can't be signed. Ask them if you expected to sign it." },
  expired: { h: "This link has expired", p: "Ask the sender for a new one." },
};

async function call<T = DocSignerView>(body: Record<string, unknown>): Promise<T & { error?: string }> {
  try {
    const r = await fetch("/api/sign", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

type Sheet = null | "start" | { adopt: string } | "decline";

export function DocSign2({ token }: { token: string }) {
  const [v, setV] = useState<DocSignerView | null>(null);
  const [fatal, setFatal] = useState<string | null>(null);
  const [sheet, setSheet] = useState<Sheet>(null);
  const [menu, setMenu] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [name, setName] = useState("");
  const [method, setMethod] = useState<"typed" | "drawn">("typed");
  const [png, setPng] = useState<string | null>(null);
  const [adopted, setAdopted] = useState(false);
  const [useSaved, setUseSaved] = useState(false);
  const [filled, setFilled] = useState<Set<string>>(new Set());
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [cur, setCur] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const refs = useRef<Record<string, HTMLDivElement | null>>({});
  useProposalActivity(token, { enabled: v?.status === "open" || v?.status === "waiting" });

  useEffect(() => {
    void call({ token, op: "view" }).then((r) => {
      if (r.error) return setFatal(r.error);
      setV(r);
      setName(r.me.name);
      // A text field Merlin filled in for them to check (a title) starts with that text.
      setValues(Object.fromEntries((r.fields ?? []).flatMap((f) => (f.prefill ? [[f.id, f.prefill]] : []))));
    });
  }, [token]);

  const mine = useMemo(() => [...(v?.fields ?? [])].sort((a, b) => a.page - b.page || a.y - b.y || a.x - b.x), [v]);
  if (fatal)
    return (
      <div className="s2">
        <main className="s2-state">
          <h1 className="sg-h">This link doesn&#39;t work</h1>
          <p className="sg-p">{fatal}</p>
          <SignLegal />
        </main>
      </div>
    );
  if (!v)
    return (
      <div className="s2" aria-busy="true">
        <main className="s2-state">
          <div className="sg-card sg-skel" />
        </main>
      </div>
    );

  const open = v.status === "open";
  const ready = open && v.codeVerified && agree;
  const isDone = (f: DocField) => (f.kind === "text" ? !!String(values[f.id] ?? "").trim() : f.kind === "checkbox" ? values[f.id] === true : filled.has(f.id));
  const left = mine.filter((f) => f.required && !isDone(f));
  const doneN = mine.filter(isDone).length;
  const run = async (what: string, body: Record<string, unknown>) => {
    setBusy(what);
    setErr(null);
    const r = await call<DocSignerView & { sent?: boolean; emailHint?: string }>({ token, ...body });
    setBusy(null);
    if (r.error) return setErr(r.error), null;
    return r;
  };
  const goTo = (f: DocField | undefined) => {
    if (!f) return;
    setCur(f.id);
    refs.current[f.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
  };
  const nextEmpty = () => {
    const i = mine.findIndex((f) => f.id === cur);
    const after = [...mine.slice(i + 1), ...mine.slice(0, i + 1)];
    return after.find((f) => !isDone(f) && f.required) ?? after.find((f) => !isDone(f));
  };
  const fill = (f: DocField) => {
    setFilled((s) => new Set(s).add(f.id));
    setCur(f.id);
  };
  const tap = (f: DocField) => {
    if (!ready) return setSheet("start");
    if ((f.kind === "signature" || f.kind === "initials") && !adopted) return setSheet({ adopt: f.id });
    if (f.kind === "signature" || f.kind === "initials" || f.kind === "date" || f.kind === "name") return filled.has(f.id) ? setCur(f.id) : fill(f);
    if (f.kind === "checkbox") return setValues((x) => ({ ...x, [f.id]: x[f.id] !== true })), setCur(f.id);
    setCur(f.id);
  };
  const finish = async () => {
    const vals: Record<string, string | boolean> = {};
    for (const f of mine) if (f.kind === "text" || f.kind === "checkbox" || f.kind === "initials") vals[f.id] = f.kind === "initials" ? String(values[f.id] ?? initialsOf(name)) : (values[f.id] ?? (f.kind === "checkbox" ? false : ""));
    const r = await run("sign", { op: "sign", name: name.trim(), method: useSaved ? "saved" : method, png: method === "drawn" && !useSaved ? png : undefined, values: vals, consent: agree, hash: v.sha256 });
    if (r) setV(r), window.scrollTo({ top: 0, behavior: "smooth" });
  };
  const primary = !ready
    ? { label: "Start", go: () => setSheet("start") }
    : left.length
      ? { label: "Next", go: () => goTo(nextEmpty()) }
      : { label: "Finish", go: () => void finish() };

  const sigShow = (f: DocField) =>
    f.kind === "signature" ? (
      method === "drawn" && png ? <img src={png} alt="Your signature" className="ds-sigimg" /> : <span className="ds-script">{name}</span>
    ) : f.kind === "initials" ? (
      <span className="ds-script">{String(values[f.id] ?? "") || initialsOf(name)}</span>
    ) : f.kind === "date" ? (
      <span>{dayOf(new Date().toISOString())}</span>
    ) : (
      <span>{name}</span>
    );
  const overlay = (page: number) => (
    <div className="c2s-layer">
      {mine
        .filter((f) => f.page === page)
        .map((f) => {
          const done = isDone(f);
          return (
            <div
              key={f.id}
              ref={(el) => {
                refs.current[f.id] = el;
              }}
              className="s2-field"
              data-kind={f.kind}
              data-done={done}
              data-cur={cur === f.id}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
              onClick={() => f.kind !== "text" && tap(f)}
              role={f.kind === "text" ? undefined : "button"}
              tabIndex={f.kind === "text" ? undefined : 0}
              aria-label={`${f.label || FIELD_SAY[f.kind]}${f.required ? ", required" : ""}${done ? ", done" : ""}`}
              onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && f.kind !== "text" && (e.preventDefault(), tap(f))}
            >
              {cur === f.id && !done && (
                <span className="s2-flag" aria-hidden>
                  {f.kind === "signature" ? "Sign" : "Fill"}
                </span>
              )}
              {f.kind === "text" ? (
                <input className="s2-in" aria-label={f.label || "Text"} placeholder={f.label || "Type here"} maxLength={200} value={String(values[f.id] ?? "")} disabled={!ready} onFocus={() => setCur(f.id)} onChange={(e) => setValues({ ...values, [f.id]: e.target.value })} />
              ) : f.kind === "checkbox" ? (
                <span className="s2-box" data-on={values[f.id] === true} aria-hidden>
                  {values[f.id] === true ? "✓" : ""}
                </span>
              ) : done ? (
                <span className="s2-filled">{sigShow(f)}</span>
              ) : (
                <span className="s2-field-l">
                  {f.kind === "signature" ? "Sign here" : f.label || FIELD_SAY[f.kind]}
                  {f.required ? " *" : ""}
                </span>
              )}
            </div>
          );
        })}
    </div>
  );

  const codeBlock = v.codeVerified ? (
    <p className="s2-ok">Email confirmed: {v.emailHint}</p>
  ) : !sentTo && !v.codeSent ? (
    <div className="s2-step">
      <p className="sg-help">We email a 6-digit code to {v.emailHint} to confirm it&#39;s you.</p>
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
    </div>
  ) : (
    <form
      className="s2-step"
      onSubmit={async (e) => {
        e.preventDefault();
        const r = await run("verify", { op: "verify", code });
        if (r) setV(r);
      }}
    >
      <label className="sg-label" htmlFor="s2-code">
        The code we sent to {sentTo ?? v.emailHint}
      </label>
      <div className="s2-coderow">
        <input id="s2-code" className="input sg-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} autoFocus />
        <button type="submit" className="btn btn-lg" aria-busy={busy === "verify"} disabled={!!busy || code.length !== 6}>
          {busy === "verify" ? "Checking" : "Confirm"}
        </button>
      </div>
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
    </form>
  );

  const adoptFor = sheet && typeof sheet === "object" ? sheet.adopt : null;
  const nameOk = NAME_RE.test(name.trim());
  const sigOk = method === "typed" ? nameOk : nameOk && !!png;

  return (
    <div className="s2" data-open={open}>
      <header className="s2-bar">
        <div className="s2-what">
          <h1 className="s2-title">{v.title}</h1>
          <p className="s2-from">
            From {v.from.name}
            {v.company ? ` · ${v.company}` : v.from.title ? ` · ${v.from.title}` : ""}
          </p>
        </div>
        <div className="s2-act">
          {open && <span className="s2-count">{ready ? `${doneN} of ${mine.length} done` : `${mine.length} ${mine.length === 1 ? "field" : "fields"} for you`}</span>}
          {open && (
            <button type="button" className="btn btn-pine s2-go" data-primary aria-busy={busy === "sign"} disabled={busy === "sign"} onClick={primary.go}>
              {busy === "sign" ? "Signing" : primary.label}
            </button>
          )}
          <div className="s2-more">
            <button type="button" className="s2-dots" aria-haspopup="menu" aria-expanded={menu} aria-label="More" onClick={() => setMenu((x) => !x)}>
              •••
            </button>
            {menu && (
              <div className="s2-menu" role="menu">
                <a role="menuitem" href={`/api/documents/file?s=${encodeURIComponent(token)}&download=1`} onClick={() => setMenu(false)}>
                  Download PDF
                </a>
                {open && (
                  <button type="button" role="menuitem" onClick={() => (setMenu(false), setErr(null), setSheet("decline"))}>
                    Decline to sign
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </header>
      {err && !sheet && (
        <p className="sg-err s2-errbar" role="alert">
          {err}
        </p>
      )}

      <main className="s2-main">
        {!open && (
          <section className="sg-card sg-state s2-statecard" data-status={v.status}>
            {(v.status === "signed" || v.status === "done") && <SignedArt on={v.status === "signed" ? "mint" : "white"} />}
            <h2 className="sg-h">{SAY[v.status].h}</h2>
            <p className="sg-p">{SAY[v.status].p}</p>
            {v.copyUrl && (
              <a className="btn btn-pine btn-lg" href={v.copyUrl}>
                Open the signed copy
              </a>
            )}
          </section>
        )}
        <article className="s2-doc" aria-label="The document">
          <PdfPages src={`/api/documents/file?s=${encodeURIComponent(token)}`} pages={v.pages} overlay={open ? overlay : undefined} />
        </article>
        <footer className="sg-foot s2-foot">
          <p>
            Sent by {v.from.name} with Merlin. Each signature is checked with a code to the signer&#39;s email. Document fingerprint (SHA-256): <span className="sg-hash">{v.sha256}</span>
          </p>
          {(v.status === "open" || v.status === "waiting") && <ActivityNotice sender={v.from.name} />}
          <SignLegal />
        </footer>
      </main>

      {sheet && (
        <div className="s2-scrim" onClick={(e) => e.target === e.currentTarget && setSheet(null)}>
          <div className="s2-sheet" role="dialog" aria-modal="true" aria-labelledby="s2-sheet-h">
            <button type="button" className="s2-close" aria-label="Close" onClick={() => setSheet(null)}>
              ×
            </button>
            {sheet === "start" && (
              <>
                <h2 className="s2-h" id="s2-sheet-h">
                  Before you sign
                </h2>
                {codeBlock}
                <ConsentBox text={v.consent} checked={agree} disabled={!v.codeVerified} onChange={setAgree} />
                {err && (
                  <p className="sg-err" role="alert">
                    {err}
                  </p>
                )}
                <button
                  type="button"
                  className="btn btn-pine btn-lg s2-wide"
                  disabled={!v.codeVerified || !agree}
                  onClick={() => {
                    setSheet(null);
                    requestAnimationFrame(() => goTo(mine.find((f) => !isDone(f)) ?? mine[0]));
                  }}
                >
                  Continue
                </button>
              </>
            )}
            {adoptFor && (
              <>
                <h2 className="s2-h" id="s2-sheet-h">
                  Adopt your signature
                </h2>
                {v.saved && (
                  <button
                    type="button"
                    className="btn btn-lg s2-wide"
                    onClick={() => {
                      setMethod(v.saved!.kind);
                      setPng(v.saved!.img);
                      setUseSaved(true);
                      setAdopted(true);
                      setSheet(null);
                      setFilled((s) => new Set(s).add(adoptFor));
                    }}
                  >
                    Use my saved signature
                  </button>
                )}
                <div className="s2-tabs" role="tablist" aria-label="How to sign">
                  {(["typed", "drawn"] as const).map((m) => (
                    <button key={m} type="button" role="tab" aria-selected={method === m} className="s2-tab" onClick={() => setMethod(m)}>
                      {m === "typed" ? "Type" : "Draw"}
                    </button>
                  ))}
                </div>
                <label className="sg-label" htmlFor="s2-name">
                  Your full name
                </label>
                <input id="s2-name" className="input" autoComplete="name" maxLength={100} value={name} onChange={(e) => setName(e.target.value)} />
                {method === "typed" ? (
                  <div className="s2-preview">
                    <span className="ds-script s2-big">{name.trim() || "Your signature"}</span>
                    <span className="ds-script s2-ini">{initialsOf(name)}</span>
                  </div>
                ) : (
                  <DrawPad onChange={setPng} />
                )}
                <p className="sg-help">This is your legal signature on this document.</p>
                <div className="s2-row">
                  <button type="button" className="btn btn-lg" onClick={() => setSheet(null)}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-pine btn-lg"
                    disabled={!sigOk}
                    onClick={() => {
                      setUseSaved(false);
                      setAdopted(true);
                      setSheet(null);
                      const f = mine.find((x) => x.id === adoptFor);
                      if (f) fill(f);
                    }}
                  >
                    Adopt and sign
                  </button>
                </div>
              </>
            )}
            {sheet === "decline" && (
              <>
                <h2 className="s2-h" id="s2-sheet-h">
                  Decline to sign
                </h2>
                {!v.codeVerified ? (
                  <>
                    <p className="sg-help">First, confirm it&#39;s you. Declining speaks for you, as signing does.</p>
                    {codeBlock}
                  </>
                ) : (
                  <form
                    onSubmit={async (e) => {
                      e.preventDefault();
                      const r = await run("decline", { op: "decline", reason });
                      if (r) setV(r), setSheet(null);
                    }}
                  >
                    <label className="sg-label" htmlFor="s2-reason">
                      Tell {v.from.name.split(" ")[0]} why (optional)
                    </label>
                    <textarea id="s2-reason" className="input sg-area" rows={3} maxLength={1000} value={reason} onChange={(e) => setReason(e.target.value)} />
                    <div className="s2-row">
                      <button type="button" className="btn btn-lg" onClick={() => setSheet(null)}>
                        Back
                      </button>
                      <button type="submit" className="btn btn-lg sg-red" disabled={!!busy}>
                        {busy === "decline" ? "Declining" : "Decline"}
                      </button>
                    </div>
                  </form>
                )}
                {err && (
                  <p className="sg-err" role="alert">
                    {err}
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
