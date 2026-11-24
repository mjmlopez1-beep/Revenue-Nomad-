"use client";

/**
 * Send for signature, in four steps (Contracts, RN_CONTRACTS2; the Dropbox Sign order):
 *
 *   1 Add the document   drop a PDF (Merlin reads it and places the fields, Close), start from a
 *                        contract template (a saved contract, its fields placed) or a proposal you
 *                        wrote, or use an example. PDF only: a Word file gets "Save it as a PDF first".
 *   2 Who needs to sign  Just me, Me and others, Just others. Name and email rows, filled from the
 *                        contract, the template, the proposal or the pipeline (one-tap chips). "Set
 *                        signing order" numbers the rows; default: they sign, you countersign last.
 *   3 Prepare            the placer (Prepare.tsx). Skipped for a proposal: Merlin built its
 *                        signature block. Next waits until every signer has a Signature.
 *   4 Review and send    SendSheet.tsx SendStep, shared with Proposals.
 *
 * Everything saves through the existing routes (/api/documents upload, read, update, use, send;
 * /api/proposals send). Leaving keeps the contract as a Draft to continue.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { DocField, DocumentRec } from "@/lib/documents/types";
import type { SmartReading } from "@/lib/documents/smart";
import type { Contracts2View } from "@/lib/documents/contracts2";
import { PDF_ONLY, WHO_SAY, blankRow, missingSignature, modeOf, rowsFor, rowsProblem, type WhoMode, type WhoRow } from "@/lib/documents/whoSigns";
import { IconCheck, IconX } from "../../ui/shared";
import { dapi } from "../DocBuilder";
import { readUpload, starterFile } from "./ContractsHome";
import { Prepare, colourOf, type PrepSigner } from "./Prepare";
import { SendStep, Switch, type SendResult } from "./SendSheet";
import "./contracts2.css";

export type FlowInit = { kind: "new" } | { kind: "draft"; doc: DocumentRec } | { kind: "proposal"; id: string };
type Source = { kind: "doc"; doc: DocumentRec; reading?: SmartReading | null; notice?: string | null; demo?: boolean } | { kind: "saved"; saved: Contracts2View["saved"][number] } | { kind: "proposal"; p: Contracts2View["proposals"][number] };

const STEPS = ["Add document", "Signers", "Prepare", "Review and send"] as const;
const first = (s: string) => s.trim().split(/\s+/)[0] || s;
const isPdf = (f: File) => /\.pdf$/i.test(f.name) || f.type === "application/pdf";

function rowsOfDoc(d: DocumentRec): WhoRow[] {
  return d.signers.map((x) => ({ key: x.id, name: x.name, email: x.email, ...(x.title ? { title: x.title } : {}), me: x.sender }));
}

export function SendFlow({ view, init, phone, onClose, onSent, toast }: { view: Contracts2View; init: FlowInit; phone: boolean; onClose: () => void; onSent: (r: SendResult & { docId: string | null; kind: "contract" | "proposal" }) => void; toast: (t: string, err?: boolean) => void }) {
  const me = { name: view.me.name, email: view.me.email };
  const startDoc = init.kind === "draft" ? init.doc : null;
  const startProp = init.kind === "proposal" ? view.proposals.find((p) => p.id === init.id) ?? null : null;
  const [step, setStep] = useState<1 | 2 | 3 | 4>(startDoc ? (startDoc.signers.length ? (startDoc.fields.length ? 3 : 2) : 2) : startProp ? 2 : 1);
  const [src, setSrc] = useState<Source | null>(startDoc ? { kind: "doc", doc: startDoc } : startProp ? { kind: "proposal", p: startProp } : null);
  const [doc, setDoc] = useState<DocumentRec | null>(startDoc);
  const [rows, setRows] = useState<WhoRow[]>(() => (startDoc?.signers.length ? rowsOfDoc(startDoc) : startProp ? rowsFor("both", me, startProp.signer ? [{ key: "p0", ...startProp.signer, me: false, found: "From the proposal" }] : []) : rowsFor("both", me, [])));
  const [ordered, setOrdered] = useState(startDoc?.ordered ?? true);
  const [fields, setFields] = useState<DocField[]>(startDoc?.fields ?? []);
  const [pending, setPending] = useState<DocField[] | null>(null);
  const [placedBy, setPlacedBy] = useState<"merlin" | "template" | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileIn = useRef<HTMLInputElement>(null);
  const mode = modeOf(rows);

  /* ----- step 1 ----- */
  const took = (r: Awaited<ReturnType<typeof readUpload>>, demo = false) => {
    if ("error" in r) return setErr(r.error);
    if ("doc" in r) {
      setSrc({ kind: "doc", doc: r.doc, reading: r.reading, demo });
      setDoc(r.doc);
      const theirs = r.reading.signers.filter((x) => !x.me).map((x) => ({ key: x.key, name: x.name, email: x.email, ...(x.title ? { title: x.title } : {}), me: false, found: x.found }));
      const mineKey = r.reading.signers.find((x) => x.me)?.key;
      // Default: they sign first, you countersign last.
      setRows(rowsFor("both", me, [...theirs, ...(mineKey ? [{ key: mineKey, name: me.name, email: me.email, me: true }] : [])]));
      setPending(r.reading.fields);
      setPlacedBy(r.reading.count ? "merlin" : null);
    } else {
      setSrc({ kind: "doc", doc: r.manual, notice: r.notice ?? null, demo });
      setDoc(r.manual);
      setRows(rowsFor("both", me, []));
      setPending(null);
    }
    setStep(2);
  };
  const upload = async (f: File | undefined | null) => {
    if (!f) return;
    setErr(null);
    if (!isPdf(f)) return setErr(PDF_ONLY);
    setBusy("upload");
    const r = await readUpload(f, view.canClose);
    setBusy(null);
    took(r);
  };
  const example = async () => {
    setErr(null);
    setBusy("upload");
    const r = await readUpload(await starterFile("two-column", view.me.name), view.canClose);
    setBusy(null);
    took(r, true);
  };
  const fromSaved = (s: Contracts2View["saved"][number]) => {
    setSrc({ kind: "saved", saved: s });
    setOrdered(s.ordered);
    const theirs = s.roles.map((r) => ({ key: r.id, name: "", email: "", ...(r.title ? { title: r.title } : {}), me: false, found: r.label }));
    setRows(rowsFor(s.meSigns ? "both" : "others", me, theirs));
    setStep(2);
  };
  const fromProposal = (p: Contracts2View["proposals"][number]) => {
    setSrc({ kind: "proposal", p });
    setRows(rowsFor("both", me, p.signer ? [{ key: "p0", ...p.signer, me: false, found: "From the proposal" }] : []));
    setStep(2);
  };

  /* ----- step 2 ----- */
  const setMode = (m: WhoMode) => setRows((rs) => rowsFor(m, me, rs));
  const edit = (i: number, patch: Partial<WhoRow>) => setRows((rs) => rs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const moveRow = (i: number, d: -1 | 1) =>
    setRows((rs) => {
      const j = i + d;
      if (j < 0 || j >= rs.length) return rs;
      const out = [...rs];
      [out[i], out[j]] = [out[j], out[i]];
      return out;
    });
  const addRow = (x?: Partial<WhoRow>) =>
    setRows((rs) => {
      const blank = rs.findIndex((r) => !r.me && !r.name && !r.email);
      const row = { ...blankRow(), ...x, me: false };
      if (x && blank >= 0) return rs.map((r, i) => (i === blank ? { ...row, key: r.key } : r));
      const mi = rs.findIndex((r) => r.me);
      // A new signer goes before you when you sign last.
      return mi === rs.length - 1 && mi > 0 ? [...rs.slice(0, mi), row, rs[mi]] : [...rs, row];
    });

  const saveWho = async (): Promise<boolean> => {
    const why = rowsProblem(rows);
    if (why) return setErr(why), false;
    setErr(null);
    if (src?.kind === "proposal") {
      if (rows.filter((x) => !x.me).length !== 1) return setErr("A proposal has one signer on the client's side. They can pass it on from their page."), false;
      return true;
    }
    setBusy("who");
    let d = doc;
    if (src?.kind === "saved") {
      const theirs = rows.filter((x) => !x.me);
      if (theirs.length !== src.saved.roles.length) {
        setBusy(null);
        return setErr(src.saved.roles.length === 1 ? "This template has one place for their side." : `This template has ${src.saved.roles.length} places for their side.`), false;
      }
      const u = await dapi<DocumentRec>({ op: "use", id: src.saved.id, signers: theirs.map((x) => ({ name: x.name.trim(), email: x.email.trim(), ...(x.title ? { title: x.title } : {}) })), me: mode !== "others" });
      if (u.error) return setBusy(null), setErr(u.error), false;
      d = u;
      // In the order the rows say.
      const order = rows.map((r) => (r.me ? d!.signers.find((x) => x.sender) : d!.signers.find((x) => x.email === r.email.trim().toLowerCase()))).filter(Boolean) as DocumentRec["signers"];
      const o = await dapi<DocumentRec>({ op: "update", id: d.id, ordered, signers: order.map((x) => ({ id: x.id, name: x.name, email: x.email, ...(x.title ? { title: x.title } : {}) })) });
      if (o.error) return setBusy(null), setErr(o.error), false;
      d = o;
      setSrc({ kind: "doc", doc: d });
      setPlacedBy(d.fields.length ? "template" : null);
    } else if (d) {
      const keys = new Set(rows.map((r) => r.key));
      const carry = [...fields, ...(pending ?? []).filter((f) => keys.has(f.signer))];
      const u = await dapi<DocumentRec>({ op: "update", id: d.id, ordered, signers: rows.map((r) => ({ id: r.key, name: r.me ? me.name : r.name.trim(), email: r.me ? me.email : r.email.trim(), ...(r.title ? { title: r.title } : {}) })), fields: carry });
      if (u.error) return setBusy(null), setErr(u.error), false;
      d = u;
      setPending(null);
    }
    setBusy(null);
    if (d) {
      setDoc(d);
      setFields(d.fields);
      setRows(rowsOfDoc(d).map((x, i) => ({ ...x, found: rows[i]?.found })));
    }
    return true;
  };

  /* ----- step 3: fields save as they change ----- */
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const dirty = useRef<DocField[] | null>(null);
  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current), (timer.current = null);
    const f = dirty.current;
    if (!f || !doc) return true;
    dirty.current = null;
    const u = await dapi<DocumentRec>({ op: "update", id: doc.id, fields: f });
    if (u.error) return toast(u.error, true), false;
    setDoc(u);
    return true;
  }, [doc, toast]);
  useEffect(() => () => void flush(), [flush]);
  const onFields = (f: DocField[]) => {
    setFields(f);
    dirty.current = f;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 600);
  };
  const prepSigners: PrepSigner[] = (doc?.signers ?? []).map((x) => ({ id: x.id, name: x.name, me: x.sender }));
  const missing = missingSignature(prepSigners, fields);

  /* ----- moving between steps ----- */
  const next = async () => {
    if (step === 2) {
      if (!(await saveWho())) return;
      setStep(src?.kind === "proposal" ? 4 : 3);
    } else if (step === 3) {
      if (missing.length) return;
      if (!(await flush())) return;
      setStep(4);
    }
  };
  const back = async () => {
    setErr(null);
    if (step === 3) await flush();
    if (step === 4 && src?.kind === "proposal") return setStep(2);
    if (step === 2 && (startDoc || startProp)) return onClose();
    setStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s));
  };

  const title = src?.kind === "proposal" ? src.p.title : doc?.title ?? "";
  const theirs = rows.filter((x) => !x.me);
  const defaultMsg = (src?.kind === "doc" && src.reading?.message) || (theirs.length ? `Hi ${theirs.map((x) => first(x.name)).join(" and ")},\n\nHere is ${title || "the document"} to sign. It takes a few minutes, and you can sign on your phone. Happy to answer anything first.\n\n${first(view.me.name)}` : "");

  const stepper = phone ? (
    <p className="c2-stepnow">
      Step {step} of 4 · {STEPS[step - 1]}
    </p>
  ) : (
    <ol className="c2-steps" aria-label="Steps">
      {STEPS.map((s, i) => {
        const n = i + 1;
        const done = n < step || (n === 3 && src?.kind === "proposal" && step === 4);
        return (
          <li key={s} className="c2-stepi" data-on={n === step} data-done={done} aria-current={n === step ? "step" : undefined}>
            <span className="c2-stepn">{done ? <IconCheck size={12} /> : n}</span>
            {s}
          </li>
        );
      })}
    </ol>
  );

  return (
    <div className="c2-flow" data-step={step}>
      <header className="c2-flowbar">
        <button type="button" className="c2-x" aria-label="Close" onClick={() => void flush().then(onClose)}>
          <IconX size={16} />
        </button>
        {stepper}
        <div className="c2-flowact">
          {step > 1 && (
            <button type="button" className="btn" onClick={() => void back()} disabled={!!busy}>
              Back
            </button>
          )}
          {(step === 2 || step === 3) && (
            <button type="button" className="btn btn-pine" data-next onClick={() => void next()} disabled={!!missing.length && step === 3 ? true : !!busy} title={step === 3 && missing.length ? "Every signer needs a Signature first" : undefined}>
              {busy === "who" ? "Saving" : "Next"}
            </button>
          )}
        </div>
      </header>
      {err && step !== 4 && (
        <p className="c2-err c2-err-top" role="alert">
          {err}
        </p>
      )}

      {step === 1 && (
        <section className="c2-body c2-add">
          <h1 className="c2-h">Add the document</h1>
          <p className="c2-lead">Upload a PDF, or start from something you already have.</p>
          <div
            className="c2-drop"
            data-over={drag}
            onDragOver={(e) => (e.preventDefault(), setDrag(true))}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              void upload(e.dataTransfer.files?.[0]);
            }}
          >
            <span className="c2-drop-i" aria-hidden>
              ⇪
            </span>
            <strong>{busy === "upload" ? "Reading it" : "Drop a PDF here"}</strong>
            <span>{view.canClose ? "Merlin finds where everyone signs and places the fields." : "Then add who signs and place the fields."}</span>
            <button type="button" className="btn btn-pine" disabled={!!busy} onClick={() => fileIn.current?.click()}>
              Choose a PDF
            </button>
            <input ref={fileIn} type="file" accept="application/pdf,.pdf,.doc,.docx" hidden onChange={(e) => (void upload(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
          <button type="button" className="c2-link c2-example" disabled={!!busy} onClick={() => void example()}>
            No file to hand? Use an example
          </button>
          {(view.proposals.length > 0 || view.saved.length > 0) && <p className="c2-over">Or start from</p>}
          <div className="c2-starts">
            {view.proposals.length > 0 && (
              <section className="c2-card">
                <h2 className="c2-h3">A proposal you wrote</h2>
                {view.proposals.slice(0, 4).map((p) => (
                  <button key={p.id} type="button" className="c2-start" onClick={() => fromProposal(p)}>
                    <span className="c2-docicon" aria-hidden />
                    <span>
                      <strong>{p.title}</strong>
                      <span className="c2-sub">{p.status === "draft" ? "Ready to send" : p.status === "declined" ? "Declined, send again" : p.status === "expired" ? "Link ended, send again" : "Send again"}{p.company ? ` · ${p.company}` : ""}</span>
                    </span>
                  </button>
                ))}
              </section>
            )}
            {view.saved.length > 0 && (
              <section className="c2-card">
                <h2 className="c2-h3">A contract template</h2>
                {view.saved.slice(0, 4).map((s) => (
                  <button key={s.id} type="button" className="c2-start" onClick={() => fromSaved(s)}>
                    <span className="c2-docicon" aria-hidden />
                    <span>
                      <strong>{s.name}</strong>
                      <span className="c2-sub">
                        {s.pages} {s.pages === 1 ? "page" : "pages"}
                        {s.uses ? ` · used ${s.uses} ${s.uses === 1 ? "time" : "times"}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </section>
            )}
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="c2-body c2-who">
          <h1 className="c2-h">Who needs to sign?</h1>
          <p className="c2-lead">{src?.kind === "proposal" ? src.p.title : src?.kind === "saved" ? src.saved.name : doc?.fileName}</p>
          {src?.kind === "doc" && src.notice && <p className="c2-notice">{src.notice}</p>}
          <div className="c2-modes" role="radiogroup" aria-label="Who signs">
            {(["me", "both", "others"] as WhoMode[]).map((m) => (
              <button key={m} type="button" role="radio" aria-checked={mode === m} className="c2-mode" disabled={src?.kind === "proposal" && m === "me"} onClick={() => setMode(m)}>
                <span className="c2-mode-i" data-m={m} aria-hidden>
                  {m !== "others" && <span className="c2-person" data-c="me" />}
                  {m !== "me" && <span className="c2-person" data-c="0" />}
                  {m === "others" && <span className="c2-person" data-c="1" />}
                </span>
                <strong>{WHO_SAY[m].label}</strong>
                <span>{WHO_SAY[m].sub}</span>
              </button>
            ))}
          </div>
          <h2 className="c2-h3">Who signs</h2>
          <ol className="c2-rows">
            {rows.map((r, i) => {
              const sig: PrepSigner[] = rows.map((x) => ({ id: x.key, name: x.name, me: x.me }));
              return (
                <li key={r.key} className="c2-row" data-me={r.me}>
                  {ordered && rows.length > 1 && <span className="c2-num">{i + 1}</span>}
                  <span className="c2-dot" data-c={colourOf(sig, r.key)} aria-hidden />
                  {r.me ? (
                    <span className="c2-row-me">
                      <strong>You</strong> <span className="c2-sub">{view.me.name} · {view.me.email}</span>
                    </span>
                  ) : (
                    <span className="c2-row-in">
                      <input className="input" aria-label={`Signer ${i + 1} name`} placeholder={r.found && !r.name ? r.found : "Full name"} value={r.name} maxLength={100} onChange={(e) => edit(i, { name: e.target.value })} />
                      <input className="input" type="email" aria-label={`Signer ${i + 1} email`} placeholder="Email" value={r.email} maxLength={200} onChange={(e) => edit(i, { email: e.target.value })} />
                    </span>
                  )}
                  {ordered && rows.length > 1 && (
                    <span className="c2-row-ord">
                      <button type="button" className="c2-ib" aria-label="Move up" disabled={i === 0} onClick={() => moveRow(i, -1)}>
                        ↑
                      </button>
                      <button type="button" className="c2-ib" aria-label="Move down" disabled={i === rows.length - 1} onClick={() => moveRow(i, 1)}>
                        ↓
                      </button>
                    </span>
                  )}
                  {!r.me && rows.filter((x) => !x.me).length > 1 && (
                    <button type="button" className="c2-ib" aria-label={`Remove ${r.name || "this signer"}`} onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  )}
                  {r.found && r.name && <span className="c2-found">{r.found}</span>}
                </li>
              );
            })}
          </ol>
          {mode !== "me" && src?.kind !== "proposal" && rows.length < 10 && (
            <button type="button" className="c2-link" onClick={() => addRow()}>
              + Add another signer
            </button>
          )}
          {mode !== "me" && view.people.length > 0 && (
            <p className="c2-chips">
              <span className="c2-sub">From your pipeline:</span>
              {view.people
                .filter((p) => !rows.some((r) => r.name === p.name))
                .slice(0, 4)
                .map((p) => (
                  <button key={p.name + p.email} type="button" className="c2-chip" onClick={() => addRow({ name: p.name, email: p.email, ...(p.title ? { title: p.title } : {}), found: "From your pipeline" })}>
                    {p.name}
                    {p.company ? ` · ${p.company}` : ""}
                  </button>
                ))}
            </p>
          )}
          {src?.kind === "proposal" && <p className="c2-sub">A proposal has one signer on their side. They can pass it on from their page.</p>}
          {rows.length > 1 && (
            <div className="c2-order">
              <Switch label="Set signing order" sub={ordered ? "One at a time, top to bottom. The next person gets it when the one before signs." : "Everyone gets it at once."} on={ordered} onChange={setOrdered} disabled={src?.kind === "proposal"} />
            </div>
          )}
        </section>
      )}

      {step === 3 && doc && (
        <Prepare pdf={`/api/documents/file?id=${encodeURIComponent(doc.id)}`} pages={doc.pages} signers={prepSigners} fields={fields} onFields={onFields} phone={phone} placedBy={placedBy} onToast={(t) => toast(t)} />
      )}

      {step === 4 && (
        <section className="c2-body c2-send">
          <SendStep
            args={{
              kind: src?.kind === "proposal" ? "proposal" : "contract",
              id: src?.kind === "proposal" ? src.p.id : doc!.id,
              signers: rows.map((r) => ({ name: r.me ? view.me.name : r.name, email: r.me ? view.me.email : r.email, ...(r.title ? { title: r.title } : {}), me: r.me })),
              message: defaultMsg,
              title,
              ordered,
              canClose: view.canClose,
              onChangeSigners: () => setStep(2),
            }}
            onCancel={() => void back()}
            onSent={(r) => {
              if (r.link) return window.location.assign(r.link);
              onSent({ ...r, docId: src?.kind === "proposal" ? null : doc?.id ?? null, kind: src?.kind === "proposal" ? "proposal" : "contract" });
            }}
          />
        </section>
      )}
    </div>
  );
}
