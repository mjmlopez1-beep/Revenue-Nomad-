"use client";

/**
 * A document to sign (lib/documents), in Proposals: a PDF the member wrote anywhere, its pages
 * drawn here with pdf.js (app/ui/PdfPages.tsx), and the fields placed on them for each signer:
 * Signature, Initials, Date signed, Full name, Text and Checkbox. Phone first: pick who fills it,
 * tap a field type, tap where it goes. On a desktop the field types also drag onto the page.
 * A placed field drags to move, its corner resizes it, and tapping it picks its signer, whether
 * it's required, or removes it.
 *
 * Signers sign in the order listed (or all at once), the member too when they add themselves.
 * Changes save as they are made; once sent it is read-only (Copy it to change and send again),
 * with each signer's progress and the audit trail. When everyone has signed, the final PDF is here
 * to download, with its audit trail page.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ProposalsView } from "@/lib/proposals/types";
import { SENDER_DUTY } from "@/lib/proposals/types";
import { FIELD_KINDS, FIELD_SAY, FIELD_SIZE, type DocField, type DocumentRec, type FieldKind } from "@/lib/documents/types";
import { PRICES } from "@/lib/billing/rules";
import { IconCheck, IconChevron, IconPlus, IconX, useToast, errorText } from "../ui/shared";
import { PdfPages } from "../ui/PdfPages";
import { Sheet } from "./ui";
import { openPlans } from "./Billing";
import { dayOf, stamp } from "../sign/doc";
import type { CoInfo } from "./model";
import { ProposalStatus } from "./ProposalParts";
import "../ui/pdf.css";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const NAME_OK = (s: string) => s.trim().length > 0;

export async function uploadPdf(f: File): Promise<DocumentRec | { error: string }> {
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf")
    return { error: /\.docx?$/i.test(f.name) ? "Upload a PDF. In Word or Google Docs: File, then Save as or Download, then PDF." : "Upload a PDF." };
  try {
    const r = await fetch(`/api/documents?op=upload&name=${encodeURIComponent(f.name)}`, { method: "POST", headers: { "Content-Type": "application/pdf" }, body: f });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: errorText(r.status, j.error, "That PDF didn't upload. Try again.") };
  } catch {
    return { error: NETWORK };
  }
}
export async function dapi<T>(body: Record<string, unknown>): Promise<T & { error?: string; upgrade?: string }> {
  try {
    const r = await fetch("/api/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

type LocalSigner = { id: string; name: string; email: string; title?: string };
const SIGNER_SAY = { waiting: "Waiting for their turn", sent: "Link sent", viewed: "Opened it", signed: "Signed", declined: "Declined" } as const;
const EVENT_WORDS: Record<string, string> = {
  uploaded: "Uploaded",
  sent: "Sent for signature",
  notified: "Link emailed",
  viewed: "Opened",
  code_sent: "Code sent",
  code_failed: "A wrong code was typed",
  code_verified: "Email confirmed",
  signed: "Signed",
  declined: "Declined",
  voided: "Voided",
  completed: "Complete: everyone signed",
  copy_sent: "Final PDF emailed",
  expired_open: "Opened after the link expired",
};
let seq = 0;
const tempId = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
const first = (s: string) => s.trim().split(/\s+/)[0] || s;

export function DocBuilder({
  notice,
  initial,
  data,
  infos,
  onSaved,
  onBack,
  onGone,
  onOpen,
}: {
  /** A line at the top: why it opened here (Merlin found no signature lines, or reading it was refused). */
  notice?: string | null;
  initial: DocumentRec;
  data: ProposalsView;
  infos: CoInfo[];
  onSaved: (d: DocumentRec) => void;
  onBack: () => void;
  onGone: (id: string) => void;
  onOpen: (d: DocumentRec) => void;
}) {
  const toast = useToast();
  const [d, setD] = useState(initial);
  const [title, setTitle] = useState(initial.title);
  const [signers, setSigners] = useState<LocalSigner[]>(() => initial.signers.map((x) => ({ id: x.id, name: x.name, email: x.email, ...(x.title ? { title: x.title } : {}) })));
  const [fields, setFields] = useState<DocField[]>(initial.fields);
  const [ordered, setOrdered] = useState(initial.ordered);
  const [company, setCompany] = useState<{ id: string | null; name: string }>(initial.company);
  const [who, setWho] = useState<string | null>(initial.signers[0]?.id ?? null);
  const [placing, setPlacing] = useState<FieldKind | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  const [save, setSave] = useState<"saved" | "saving" | "error">("saved");
  const [sending, setSending] = useState(false);
  const draft = d.status === "draft";
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const state = useRef({ title, signers, fields, ordered, company });
  state.current = { title, signers, fields, ordered, company };
  const dirty = useRef(false);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current), (timer.current = null);
    if (!dirty.current) return;
    dirty.current = false;
    const cur = state.current;
    setSave("saving");
    const r = await dapi<DocumentRec>({
      op: "update",
      id: initial.id,
      title: cur.title,
      ordered: cur.ordered,
      signers: cur.signers,
      fields: cur.fields,
      companyId: cur.company.id,
      companyName: cur.company.name,
    });
    if (r.error) return setSave("error"), toast(r.error, true);
    setSave("saved");
    setD(r);
    onSaved(r);
    // New signers got Merlin's ids: the same ones here, so what is placed next keeps its signer.
    const map = new Map<string, string>();
    cur.signers.forEach((x, i) => r.signers[i]?.email === x.email.toLowerCase() && x.id !== r.signers[i].id && map.set(x.id, r.signers[i].id));
    if (map.size) {
      setSigners((ss) => ss.map((x) => (map.has(x.id) ? { ...x, id: map.get(x.id)! } : x)));
      setFields((fs) => fs.map((f) => (map.has(f.signer) ? { ...f, signer: map.get(f.signer)! } : f)));
      setWho((w) => (w && map.has(w) ? map.get(w)! : w));
    }
  }, [initial.id, onSaved, toast]);
  useEffect(() => () => void flush(), [flush]);
  const touch = () => {
    if (!draft) return;
    dirty.current = true;
    setSave("saving");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => void flush(), 700);
  };
  useEffect(touch, [title, signers, fields, ordered, company]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    dirty.current = false;
    setSave("saved");
  }, []);

  const color = (signerId: string) => Math.max(0, signers.findIndex((x) => x.id === signerId)) % 5;
  const place = (kind: FieldKind, page: number, fx: number, fy: number) => {
    if (!who) return toast("Add who signs first, then place their fields.", true);
    const sz = FIELD_SIZE[kind];
    const pg = d.pages[page];
    // Sizes are shares of a portrait Letter page: on any other page the field keeps its size in points.
    const w = Math.min(0.9, (sz.w * 612) / pg.w);
    const h = Math.min(0.5, (sz.h * 792) / pg.h);
    const f: DocField = { id: tempId("f"), page, kind, signer: who, required: kind !== "checkbox", x: Math.max(0, Math.min(1 - w, fx - w / 2)), y: Math.max(0, Math.min(1 - h, fy - h / 2)), w, h };
    setFields((fs) => [...fs, f]);
    setSel(f.id);
    setPlacing(null);
  };

  // Moving and resizing a field: shares of its page, from the pointer.
  const drag = useRef<{ id: string; mode: "move" | "size"; x0: number; y0: number; f: DocField; rect: DOMRect } | null>(null);
  const onFieldDown = (e: React.PointerEvent, f: DocField, mode: "move" | "size") => {
    if (!draft) return;
    e.stopPropagation();
    const page = (e.currentTarget as HTMLElement).closest(".pdf-page") as HTMLElement | null;
    if (!page) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, x0: e.clientX, y0: e.clientY, f: { ...f }, rect: page.getBoundingClientRect() };
    setSel(f.id);
  };
  const onFieldMove = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.x0) / g.rect.width;
    const dy = (e.clientY - g.y0) / g.rect.height;
    setFields((fs) =>
      fs.map((f) => {
        if (f.id !== g.id) return f;
        if (g.mode === "move") return { ...f, x: Math.max(0, Math.min(1 - f.w, g.f.x + dx)), y: Math.max(0, Math.min(1 - f.h, g.f.y + dy)) };
        return { ...f, w: Math.max(0.02, Math.min(1 - f.x, g.f.w + dx)), h: Math.max(0.012, Math.min(1 - f.y, g.f.h + dy)) };
      }),
    );
  };
  const onFieldUp = () => (drag.current = null);

  const overlay = (page: number) => (
    <div
      className="df-layer"
      data-placing={!!placing}
      onPointerDown={(e) => {
        if (!placing) return setSel(null);
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        place(placing, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
      onDragOver={(e) => draft && e.dataTransfer.types.includes("text/x-field") && e.preventDefault()}
      onDrop={(e) => {
        const kind = e.dataTransfer.getData("text/x-field") as FieldKind;
        if (!FIELD_KINDS.includes(kind)) return;
        e.preventDefault();
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        place(kind, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
      }}
    >
      {fields
        .filter((f) => f.page === page)
        .map((f) => {
          const s = signers.find((x) => x.id === f.signer);
          return (
            <div
              key={f.id}
              className={`df-field df-c${color(f.signer)}`}
              data-kind={f.kind}
              data-sel={sel === f.id}
              style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
              onPointerDown={(e) => onFieldDown(e, f, "move")}
              onPointerMove={onFieldMove}
              onPointerUp={onFieldUp}
              role="button"
              tabIndex={0}
              aria-label={`${FIELD_SAY[f.kind]} for ${s?.name ?? "a signer"}`}
              onKeyDown={(e) => draft && (e.key === "Delete" || e.key === "Backspace") && (setFields((fs) => fs.filter((x) => x.id !== f.id)), setSel(null))}
            >
              <span className="df-field-l">
                {f.kind === "checkbox" ? "" : f.kind === "text" && (f.prefill || f.label) ? f.prefill || f.label : FIELD_SAY[f.kind]}
                {f.kind !== "checkbox" && s ? <span className="df-field-who"> · {first(s.name)}</span> : null}
              </span>
              {draft && sel === f.id && <span className="df-handle" onPointerDown={(e) => onFieldDown(e, f, "size")} onPointerMove={onFieldMove} onPointerUp={onFieldUp} aria-hidden />}
              {draft && sel === f.id && (
                <div className="df-pop" onPointerDown={(e) => e.stopPropagation()}>
                  <select className="input df-pop-who" aria-label="Who fills it" value={f.signer} onChange={(e) => setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, signer: e.target.value } : x)))}>
                    {signers.map((x) => (
                      <option key={x.id} value={x.id}>
                        {x.name}
                      </option>
                    ))}
                  </select>
                  {(f.kind === "text" || f.kind === "checkbox") && (
                    <label className="df-pop-req">
                      <input type="checkbox" checked={f.required} onChange={(e) => setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, required: e.target.checked } : x)))} /> Required
                    </label>
                  )}
                  {f.kind === "text" && (
                    <input className="input df-pop-label" placeholder="What to type" maxLength={60} value={f.label ?? ""} onChange={(e) => setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, label: e.target.value } : x)))} />
                  )}
                  {f.kind === "text" && (
                    <input className="input df-pop-label" aria-label="Filled in as" placeholder="Filled in as (they can change it)" maxLength={200} value={f.prefill ?? ""} onChange={(e) => setFields((fs) => fs.map((x) => (x.id === f.id ? { ...x, prefill: e.target.value } : x)))} />
                  )}
                  <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label="Remove this field" onClick={() => (setFields((fs) => fs.filter((x) => x.id !== f.id)), setSel(null))}>
                    <IconX size={14} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
    </div>
  );

  const issues = useMemo(() => {
    if (!signers.length) return ["Add who signs."];
    return signers.filter((x) => !fields.some((f) => f.signer === x.id && f.kind === "signature")).map((x) => `Place a Signature field for ${x.name}.`);
  }, [signers, fields]);
  const act = async (op: "void" | "delete" | "copy") => {
    if (op === "delete" && !window.confirm("Delete this document? It can't be undone.")) return;
    if (op === "void" && !window.confirm("Void it? Every signer's link stops working.")) return;
    await flush();
    const r = await dapi<DocumentRec & { ok?: boolean }>({ op, id: d.id });
    if (r.error) return toast(r.error, true);
    if (op === "delete") return toast("Deleted."), onGone(d.id);
    if (op === "copy") return toast("A copy to change and send."), onOpen(r);
    setD(r), onSaved(r), toast("Voided. The links stopped working.");
  };
  const me = d.signers.find((x) => x.sender);
  const myTurn = !!me && (me.status === "sent" || me.status === "viewed");
  const signNow = async () => {
    const r = await dapi<{ link: string }>({ op: "mylink", id: d.id });
    if (r.error) return toast(r.error, true);
    window.open(r.link, "_blank", "noopener");
  };

  return (
    <div className="page-wide pp-page pp-editing df-page">
      <button type="button" className="page-back" onClick={() => (void flush(), onBack())}>
        <IconChevron dir="left" /> All proposals
      </button>
      <header className="pp-top">
        <div className="pp-top-main">
          <input className="pp-title df-title" aria-label="Document title" value={title} readOnly={!draft} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
          <p className="pp-top-s">
            <ProposalStatus status={d.status} />
            <span>
              Document · {d.fileName} · {d.pages.length} {d.pages.length === 1 ? "page" : "pages"}
            </span>
            <span className="pp-save" aria-live="polite">
              {draft ? (save === "saving" ? "Saving" : save === "error" ? "Not saved" : "Saved") : ""}
            </span>
          </p>
        </div>
        <div className="pp-top-act">
          {draft && (
            <button type="button" className="btn btn-pine" onClick={() => (void flush(), setSending(true))}>
              Send to sign
            </button>
          )}
          {myTurn && (
            <button type="button" className="btn btn-pine" onClick={() => void signNow()}>
              Sign it now
            </button>
          )}
          {d.status === "signed" && (
            <a className="btn btn-pine" href={`/api/documents/file?id=${encodeURIComponent(d.id)}&final=1&download=1`}>
              Download the signed PDF
            </a>
          )}
          {(d.status === "sent" || d.status === "viewed") && (
            <button type="button" className="btn" onClick={() => act("void")}>
              Void
            </button>
          )}
          {!draft && (
            <button type="button" className="btn btn-ghost" onClick={() => act("copy")}>
              Copy to change
            </button>
          )}
          {d.status !== "signed" && d.status !== "sent" && d.status !== "viewed" && (
            <button type="button" className="btn btn-ghost" onClick={() => act("delete")}>
              Delete
            </button>
          )}
        </div>
      </header>

      {notice && draft && (
        <p className="pp-banner df-notice" role="status">
          {notice}
        </p>
      )}
      {draft && (
        <div className="df-tools" role="toolbar" aria-label="Place fields">
          <div className="df-who" role="radiogroup" aria-label="Who fills it">
            {signers.map((x) => (
              <button key={x.id} type="button" role="radio" aria-checked={who === x.id} className={`df-whochip df-c${color(x.id)}`} data-on={who === x.id} onClick={() => setWho(x.id)}>
                <span className="df-dot" aria-hidden />
                {first(x.name)}
              </button>
            ))}
            {!signers.length && <span className="pp-muted">Add who signs, then place their fields.</span>}
          </div>
          <div className="df-kinds">
            {FIELD_KINDS.map((k) => (
              <button
                key={k}
                type="button"
                className="df-kind"
                data-on={placing === k}
                aria-pressed={placing === k}
                disabled={!signers.length}
                draggable={!!signers.length}
                onDragStart={(e) => (e.dataTransfer.setData("text/x-field", k), (e.dataTransfer.effectAllowed = "copy"))}
                onClick={() => setPlacing((p) => (p === k ? null : k))}
              >
                {FIELD_SAY[k]}
              </button>
            ))}
          </div>
          {placing && <p className="df-hint">Tap the page where the {FIELD_SAY[placing].toLowerCase()} goes.</p>}
        </div>
      )}

      <div className="pp-edit df-edit">
        <div className="df-doc">
          <PdfPages src={`/api/documents/file?id=${encodeURIComponent(d.id)}`} pages={d.pages} overlay={overlay} />
        </div>
        <aside className="pp-side">
          <SignersCard
            draft={draft}
            rec={d}
            signers={signers}
            ordered={ordered}
            meName={data.me.name}
            meEmail={data.me.email}
            color={color}
            onSigners={(ss) => {
              setSigners(ss);
              setFields((fs) => fs.filter((f) => ss.some((x) => x.id === f.signer)));
              if (!ss.some((x) => x.id === who)) setWho(ss[0]?.id ?? null);
            }}
            onAdded={(id) => setWho(id)}
            onOrdered={setOrdered}
          />
          {draft && <CompanyCard infos={infos} company={company} onCompany={setCompany} />}
          {draft && issues.length > 0 && (
            <section className="pp-card">
              <h2 className="pp-h2">Before you send</h2>
              <ul className="pp-fixes">
                {issues.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </section>
          )}
          {!draft && <DocTrail d={d} />}
        </aside>
      </div>

      {sending && (
        <DocSendSheet
          d={d}
          canSend={data.canSend}
          email={data.email}
          issues={issues}
          onClose={() => setSending(false)}
          onSent={(r, message) => (setD(r), onSaved(r), setSending(false), toast(message))}
        />
      )}
    </div>
  );
}

function SignersCard({
  draft,
  rec,
  signers,
  ordered,
  meName,
  meEmail,
  color,
  onSigners,
  onAdded,
  onOrdered,
}: {
  draft: boolean;
  rec: DocumentRec;
  signers: LocalSigner[];
  ordered: boolean;
  meName: string;
  meEmail: string;
  color: (id: string) => number;
  onSigners: (s: LocalSigner[]) => void;
  onAdded: (id: string) => void;
  onOrdered: (v: boolean) => void;
}) {
  const [n, setN] = useState({ name: "", email: "", title: "" });
  const [err, setErr] = useState<string | null>(null);
  const add = (x: { name: string; email: string; title?: string }) => {
    setErr(null);
    if (!NAME_OK(x.name) || !EMAIL_RE.test(x.email.trim())) return setErr("Type their name and email.");
    if (signers.some((y) => y.email.toLowerCase() === x.email.trim().toLowerCase())) return setErr("They're on the list already.");
    if (signers.length >= 10) return setErr("Up to 10 signers.");
    const id = tempId("new_");
    onSigners([...signers, { id, name: x.name.trim(), email: x.email.trim(), ...(x.title?.trim() ? { title: x.title.trim() } : {}) }]);
    onAdded(id);
    setN({ name: "", email: "", title: "" });
  };
  const move = (i: number, j: number) => {
    if (j < 0 || j >= signers.length) return;
    const s = [...signers];
    const [x] = s.splice(i, 1);
    s.splice(j, 0, x);
    onSigners(s);
  };
  const meOn = signers.some((x) => x.email.toLowerCase() === meEmail.toLowerCase());
  if (!draft)
    return (
      <section className="pp-card" aria-labelledby="df-sg-h">
        <h2 className="pp-h2" id="df-sg-h">
          Who signs{rec.ordered && rec.signers.length > 1 ? ", in order" : ""}
        </h2>
        <ol className="df-signers">
          {rec.signers.map((x) => (
            <li key={x.id} className={`df-c${color(x.id)}`} data-status={x.status}>
              <span className="df-dot" aria-hidden />
              <span>
                <b>{x.name}</b>
                {x.sender && <span className="pp-muted"> (you)</span>}
                <span className="pp-muted">
                  {SIGNER_SAY[x.status]}
                  {x.signedAt ? ` · ${dayOf(x.signedAt)}` : x.viewedAt ? ` · ${dayOf(x.viewedAt)}` : x.notifiedAt ? ` · ${dayOf(x.notifiedAt)}` : ""}
                  {x.declineReason ? `: "${x.declineReason}"` : ""}
                </span>
              </span>
              {x.status === "signed" && <IconCheck size={14} />}
            </li>
          ))}
        </ol>
      </section>
    );
  return (
    <section className="pp-card" aria-labelledby="df-sg-h">
      <h2 className="pp-h2" id="df-sg-h">
        Who signs
      </h2>
      {signers.length > 0 && (
        <ol className="df-signers">
          {signers.map((x, i) => (
            <li key={x.id} className={`df-c${color(x.id)}`}>
              <span className="df-dot" aria-hidden />
              <span>
                <b>{x.name}</b>
                <span className="pp-muted">
                  {x.title ? `${x.title} · ` : ""}
                  {x.email}
                </span>
              </span>
              <span className="pp-block-act">
                {ordered && (
                  <>
                    <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${x.name} up`} disabled={i === 0} onClick={() => move(i, i - 1)}>
                      <IconChevron dir="up" />
                    </button>
                    <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Move ${x.name} down`} disabled={i === signers.length - 1} onClick={() => move(i, i + 1)}>
                      <IconChevron dir="down" />
                    </button>
                  </>
                )}
                <button type="button" className="tp-iconbtn tp-iconbtn-sm" aria-label={`Remove ${x.name}`} onClick={() => onSigners(signers.filter((y) => y.id !== x.id))}>
                  <IconX size={14} />
                </button>
              </span>
            </li>
          ))}
        </ol>
      )}
      {signers.length > 1 && (
        <label className="pp-ai df-order">
          <input type="checkbox" checked={ordered} onChange={(e) => onOrdered(e.target.checked)} />
          <span>
            <b>Sign in this order</b>
            <span className="pp-muted">{ordered ? "Each one gets the link when the one before has signed." : "Everyone gets the link at once."}</span>
          </span>
        </label>
      )}
      <form
        className="df-add"
        onSubmit={(e) => {
          e.preventDefault();
          add(n);
        }}
      >
        <input className="input" placeholder="Their name" value={n.name} autoComplete="off" onChange={(e) => setN({ ...n, name: e.target.value })} aria-label="Signer's name" />
        <input className="input" placeholder="Their email" type="email" value={n.email} autoComplete="off" onChange={(e) => setN({ ...n, email: e.target.value })} aria-label="Signer's email" />
        <input className="input" placeholder="Their title (optional)" value={n.title} autoComplete="off" onChange={(e) => setN({ ...n, title: e.target.value })} aria-label="Signer's title" />
        <div className="pp-btns">
          <button type="submit" className="btn btn-sm">
            <IconPlus /> Add a signer
          </button>
          {!meOn && (
            <button type="button" className="btn btn-sm" onClick={() => add({ name: meName, email: meEmail })}>
              Add me
            </button>
          )}
        </div>
        {err && <p className="pp-err">{err}</p>}
      </form>
    </section>
  );
}

function CompanyCard({ infos, company, onCompany }: { infos: CoInfo[]; company: { id: string | null; name: string }; onCompany: (c: { id: string | null; name: string }) => void }) {
  const known = useMemo(() => infos.filter((i) => !i.c.hidden && i.c.name), [infos]);
  const [q, setQ] = useState(company.name);
  const matches = q.trim().length >= 2 && !company.id ? known.filter((i) => i.c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 5) : [];
  return (
    <section className="pp-card" aria-labelledby="df-co-h">
      <h2 className="pp-h2" id="df-co-h">
        For which company <span className="pp-muted">(optional)</span>
      </h2>
      <p className="pp-help">On Merlin, your pipeline moves when it&#39;s sent, signed or declined.</p>
      <div className="pp-co">
        <input
          className="input"
          value={q}
          placeholder="Search Merlin, or type its name"
          aria-label="Company"
          onChange={(e) => (setQ(e.target.value), onCompany({ id: null, name: e.target.value }))}
        />
        {company.id && (
          <p className="pp-co-picked">
            <IconCheck /> On Merlin.
          </p>
        )}
        {matches.length > 0 && (
          <ul className="pp-co-list" role="listbox" aria-label="Companies on Merlin">
            {matches.map((i) => (
              <li key={i.c.id}>
                <button type="button" role="option" aria-selected={false} onClick={() => (setQ(i.c.name), onCompany({ id: i.c.id, name: i.c.name }))}>
                  <b>{i.c.name}</b>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}

function DocTrail({ d }: { d: DocumentRec }) {
  return (
    <section className="pp-card pp-status" aria-label="Audit trail">
      <h2 className="pp-h2">Audit trail</h2>
      {d.copyUrl && (
        <p>
          <a className="tp-flink" href={d.copyUrl} target="_blank" rel="noreferrer">
            Open the signed copy&#39;s page
          </a>
        </p>
      )}
      <ol className="df-trail">
        {d.events.map((e, i) => (
          <li key={i}>
            <span className="pp-muted">{stamp(e.at)}</span> {EVENT_WORDS[e.kind] ?? e.kind}
            {e.who ? ` · ${e.who}` : ""}
            {e.ip ? <span className="pp-muted"> · {e.ip}</span> : null}
          </li>
        ))}
      </ol>
      <p className="pp-muted">
        Uploaded file (SHA-256): <span className="sg-hash">{d.sha256}</span>
      </p>
      {d.finalSha256 && (
        <p className="pp-muted">
          Signed file (SHA-256): <span className="sg-hash">{d.finalSha256}</span>
        </p>
      )}
    </section>
  );
}

function DocSendSheet({ d, canSend, email, issues, onClose, onSent }: { d: DocumentRec; canSend: boolean; email: boolean; issues: string[]; onClose: () => void; onSent: (d: DocumentRec, message: string) => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const ok = canSend && email && issues.length === 0;
  const go = async () => {
    setBusy(true);
    setErr(null);
    const r = await dapi<{ document: DocumentRec; message: string }>({ op: "send", id: d.id, message: note });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onSent(r.document, r.message);
  };
  const firstUp = d.ordered ? d.signers.slice(0, 1) : d.signers;
  return (
    <Sheet
      title="Send to sign"
      onClose={onClose}
      dialog
      className="pp-send"
      footer={
        canSend ? (
          <button type="button" className="btn btn-pine btn-lg pp-wide" aria-busy={busy} disabled={!ok || busy} onClick={go}>
            {busy ? "Sending" : `Send to ${firstUp.map((x) => first(x.name)).join(" and ") || "the signers"}`}
          </button>
        ) : (
          <button type="button" className="btn btn-pine btn-lg pp-wide" onClick={() => openPlans("proposals")}>
            See the Close plan: ${PRICES.closeMonth} a month
          </button>
        )
      }
    >
      <div className="pp-send-body">
        {!canSend && <p className="pp-warn">Sending documents for signature is on Close: ${PRICES.closeMonth} a month. You can prepare them on Free and Pro.</p>}
        {!email && canSend && <p className="pp-warn">Email isn&#39;t set up on Merlin yet, so a document can&#39;t go out for signature.</p>}
        <p className="pp-help">
          {d.ordered && d.signers.length > 1 ? "Each signer gets an email with their own link in turn, when the one before has signed." : "Each signer gets an email with their own link."} They confirm their email with a
          code, agree to sign electronically, and type or draw their signature. When everyone has signed, you all get the final PDF with an audit trail page.
        </p>
        <p className="pp-help">{SENDER_DUTY.replace("this proposal", "this document")}</p>
        <label className="pp-field">
          <span className="pp-field-l">A note in the email (optional)</span>
          <textarea className="input pp-note" rows={2} maxLength={600} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Here's the agreement we discussed." />
        </label>
        {issues.length > 0 && (
          <ul className="pp-flaglist">
            {issues.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        )}
        {err && <p className="pp-err">{err}</p>}
      </div>
    </Sheet>
  );
}
