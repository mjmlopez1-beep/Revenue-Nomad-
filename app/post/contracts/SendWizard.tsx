"use client";

/**
 * Send for signature, modeled step for step on Dropbox Sign's sender flow:
 *
 *   1 Select documents   upload a PDF (drag or Upload) or start from a template (a saved contract)
 *   2 Add signers        name and email cards, Add another signer, I'm the only signer, Set signer order
 *   3 Place fields       left: signer and field types; middle: the pages; right: the selected field
 *   4 Review and send    signers, expiration, the email's title and message, save as a template
 *
 * Everything after sending (the email with a code, the signing page, the sealed PDF and its audit
 * trail) is Merlin's existing signing (lib/documents/store.ts, app/sign). When the member is on
 * Close, Merlin reads the upload (lib/documents/smart.ts) and pre-fills who signs and the fields;
 * the member sees them on steps 2 and 3 and can change anything.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProposalsView, LinkDays } from "@/lib/proposals/types";
import { LINK_DAYS_SAY } from "@/lib/proposals/types";
import { FIELD_KINDS, FIELD_SAY, FIELD_SIZE, type DocField, type DocumentRec, type FieldKind } from "@/lib/documents/types";
import type { SmartReading } from "@/lib/documents/smart";
import type { SavedContract } from "@/lib/documents/templates";
import { IconCheck, IconX, useToast } from "../../ui/shared";
import { PdfPages } from "../../ui/PdfPages";
import { openPlans } from "../Billing";
import { dapi, uploadPdf } from "../DocBuilder";
import "../../ui/pdf.css";
import "./sendwizard.css";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const firstOf = (s: string) => s.trim().split(/\s+/)[0] || s;
const ini = (s: string) =>
  s
    .trim()
    .split(/\s+/)
    .map((x) => x[0] ?? "")
    .join("")
    .slice(0, 2)
    .toUpperCase() || "S";
let seq = 0;
const tmp = (p: string) => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;

export type WizardStart = { kind: "new" } | { kind: "draft"; doc: DocumentRec } | { kind: "saved"; saved: SavedContract; doc: DocumentRec };

type Step = 1 | 2 | 3 | 4;
const STEPS: [Step, string][] = [
  [1, "Select documents"],
  [2, "Add signers"],
  [3, "Place fields"],
  [4, "Review and send"],
];

/** A signer card on step 2. `from`: the key Merlin's reading gave them, so Auto-place can find their fields. */
interface Who {
  key: string;
  name: string;
  email: string;
  title: string;
  role?: string;
  from?: string;
  touched?: boolean;
}

const GROUPS: [string, FieldKind[]][] = [
  ["Signature fields", ["signature", "initials"]],
  ["Auto-fill fields", ["date", "name"]],
  ["Standard fields", ["text", "checkbox"]],
];
const KIND_SAY: Record<FieldKind, string> = { ...FIELD_SAY, text: "Textbox" };

function KindIcon({ k }: { k: FieldKind }) {
  const p = { width: 16, height: 16, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.9, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (k) {
    case "signature":
      return (
        <svg {...p}>
          <path d="M3 17c3-6 5-9 6-8s-2 8 0 8 3-5 4-5 1 4 3 4 3-2 5-3" />
          <path d="M3 21h18" />
        </svg>
      );
    case "initials":
      return (
        <svg {...p}>
          <path d="M4 18 8 6l4 12M5.5 14h5" />
          <path d="M15 18v-6m0 0a3 3 0 0 1 6 0v6" />
        </svg>
      );
    case "date":
      return (
        <svg {...p}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M3 10h18M8 3v4M16 3v4" />
        </svg>
      );
    case "name":
      return (
        <svg {...p}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "text":
      return (
        <svg {...p}>
          <rect x="3" y="4" width="18" height="16" rx="2" />
          <path d="M8 9h8M12 9v7" />
        </svg>
      );
    default:
      return (
        <svg {...p}>
          <rect x="4" y="4" width="16" height="16" rx="2" />
          <path d="m8 12 3 3 5-6" />
        </svg>
      );
  }
}

export function SendWizard({
  data,
  start,
  saved,
  onSaved,
  onClose,
  onSent,
}: {
  data: ProposalsView;
  start: WizardStart;
  /** The member's templates, for Add template. */
  saved: SavedContract[];
  onSaved: (d: DocumentRec) => void;
  onClose: (draft: DocumentRec | null) => void;
  onSent: (d: DocumentRec, words: string) => void;
}) {
  const toast = useToast();
  const meEmail = data.me.email.toLowerCase();
  const fromDoc = (d: DocumentRec): Who[] => d.signers.map((x) => ({ key: x.id, name: x.name, email: x.email, title: x.title ?? "" }));
  const fromSaved = (s: SavedContract, d: DocumentRec): Who[] => [
    ...s.roles.map((r) => ({ key: r.id, name: "", email: "", title: r.title ?? "", role: r.label })),
    ...d.signers.filter((x) => x.sender).map((x) => ({ key: x.id, name: x.name, email: x.email, title: x.title ?? "" })),
  ];

  const [step, setStep] = useState<Step>(start.kind === "new" ? 1 : 2);
  const [reached, setReached] = useState<Step>(start.kind === "draft" && start.doc.fields.length ? 4 : start.kind === "new" ? 1 : 2);
  const [doc, setDoc] = useState<DocumentRec | null>(start.kind === "new" ? null : start.doc);
  const [savedFrom, setSavedFrom] = useState<SavedContract | null>(start.kind === "saved" ? start.saved : null);
  const [reading, setReading] = useState<SmartReading | null>(null);
  const [mine, setMine] = useState(start.kind === "draft");
  const [signers, setSigners] = useState<Who[]>(() => (start.kind === "draft" ? fromDoc(start.doc) : start.kind === "saved" ? fromSaved(start.saved, start.doc) : []));
  const [ordered, setOrdered] = useState(start.kind === "draft" ? start.doc.ordered : start.kind === "saved" ? start.saved.ordered : false);
  const [fields, setFields] = useState<DocField[]>(start.kind === "draft" ? start.doc.fields : []);
  const [company, setCompany] = useState<{ id: string | null; name: string }>(start.kind === "draft" ? start.doc.company : { id: null, name: "" });
  const [title, setTitle] = useState(start.kind === "draft" ? start.doc.title : start.kind === "saved" ? start.saved.name : "");
  const [message, setMessage] = useState("");
  const [expires, setExpires] = useState(false);
  const [days, setDays] = useState<Exclude<LinkDays, 0>>(30);
  const [keep, setKeep] = useState(false);
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [dropOn, setDropOn] = useState(false);
  const [tplOpen, setTplOpen] = useState(false);
  const [menu, setMenu] = useState<string | null>(null);
  const [dragKey, setDragKey] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const head = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    setErr(null);
    setMenu(null);
    head.current?.focus({ preventScroll: true });
    window.scrollTo({ top: 0 });
  }, [step]);

  const color = (key: string) => Math.max(0, signers.findIndex((x) => x.key === key)) % 5;
  const isMe = (w: Who) => w.email.trim().toLowerCase() === meEmail;
  const signerName = (w: Who, i: number) => (isMe(w) ? `${w.name || data.me.name} (you)` : w.name.trim() || w.role || (signers.length > 1 ? `Signer ${i + 1}` : "Signer"));

  /* ---------- step 1: select documents ---------- */

  const take = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf")
      return setErr(/\.docx?$/i.test(f.name) ? "Upload a PDF. In Word or Google Docs: File, then Save as or Download, then PDF." : "Upload a PDF.");
    setBusy("Uploading files...");
    const up = await uploadPdf(f);
    if ("error" in up) return setBusy(""), setErr(up.error);
    // Replacing a document uploaded in this flow: the old draft goes, so it doesn't sit in the list.
    if (doc && mine && doc.id !== up.id) void dapi({ op: "delete", id: doc.id });
    setDoc(up);
    setMine(true);
    setSavedFrom(null);
    setTitle(up.title);
    setFields([]);
    setSigners([]);
    setReading(null);
    onSaved(up);
    if (data.canBuild) {
      setBusy("Merlin is reading it...");
      const r = await dapi<{ document: DocumentRec; reading: SmartReading }>({ op: "read", id: up.id });
      if (!r.error && r.reading?.found) {
        const rd = r.reading;
        setReading(rd);
        setTitle(rd.title || up.title);
        setMessage(rd.message || "");
        setCompany(rd.company);
        setSigners(rd.signers.map((x) => ({ key: x.key, from: x.key, name: x.me ? data.me.name : x.name, email: x.me ? data.me.email : x.email, title: x.title })));
        setOrdered(rd.signers.length > 1);
        setFields(rd.fields.map((x) => ({ ...x })));
      }
    }
    setBusy("");
  };
  const removeDoc = () => {
    if (doc && mine) void dapi({ op: "delete", id: doc.id });
    setDoc(null);
    setMine(false);
    setSavedFrom(null);
    setSigners([]);
    setFields([]);
    setReading(null);
    setReached(1);
  };
  const pickTemplate = async (s: SavedContract) => {
    setTplOpen(false);
    setBusy(`Adding ${s.name}...`);
    const r = await fetch(`/api/documents?saved=${encodeURIComponent(s.id)}`)
      .then(async (x) => (x.ok ? ((await x.json()) as { saved: SavedContract; document: DocumentRec }) : { error: "That template didn't open. Try again." }))
      .catch(() => ({ error: "We couldn't reach Merlin. Check your connection and try again." }));
    setBusy("");
    if ("error" in r) return setErr(r.error);
    if (doc && mine) void dapi({ op: "delete", id: doc.id });
    setMine(false);
    setReading(null);
    setDoc(r.document);
    setSavedFrom(r.saved);
    setSigners(fromSaved(r.saved, r.document));
    setOrdered(r.saved.ordered);
    setFields(r.document.fields);
    setTitle(r.saved.name);
  };

  /* ---------- step 2: add signers ---------- */

  const blank = (): Who => ({ key: tmp("new_"), name: "", email: "", title: "" });
  useEffect(() => {
    if (step === 2 && signers.length === 0) setSigners([blank()]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const patch = (key: string, p: Partial<Who>) => setSigners((ss) => ss.map((x) => (x.key === key ? { ...x, ...p } : x)));
  const signerErr = (w: Who): { name?: string; email?: string } => {
    const out: { name?: string; email?: string } = {};
    if (!w.name.trim()) out.name = "A signer name is required";
    if (!w.email.trim()) out.email = "An email address is required";
    else if (!EMAIL_RE.test(w.email.trim())) out.email = "Enter a valid email address";
    else if (signers.filter((y) => y.email.trim().toLowerCase() === w.email.trim().toLowerCase()).length > 1) out.email = "This email is already a signer";
    return out;
  };
  const signersOk = signers.length > 0 && signers.every((w) => !Object.keys(signerErr(w)).length);
  const onlyMe = () => {
    setSigners([{ key: signers.find(isMe)?.key ?? tmp("new_"), name: data.me.name, email: data.me.email, title: data.me.title }]);
    setOrdered(false);
  };
  const hasMe = signers.some(isMe);
  const moveTo = (from: string, to: string) => {
    if (from === to) return;
    setSigners((ss) => {
      const a = [...ss];
      const i = a.findIndex((x) => x.key === from);
      const j = a.findIndex((x) => x.key === to);
      if (i < 0 || j < 0) return ss;
      const [x] = a.splice(i, 1);
      a.splice(j, 0, x);
      return a;
    });
  };

  /** Save signers (and whatever fields there are) into the draft. Returns false and says why when it can't. */
  const saveSigners = async (): Promise<boolean> => {
    if (!doc) return false;
    if (savedFrom) {
      const others = signers.filter((x) => !isMe(x));
      const res = await dapi<DocumentRec>({
        op: "use",
        id: savedFrom.id,
        signers: others.map((x) => ({ name: x.name.trim(), email: x.email.trim(), ...(x.title.trim() ? { title: x.title.trim() } : {}) })),
        me: hasMe,
      });
      if (res.error) return setErr(res.error), false;
      setSavedFrom(null);
      setMine(true);
      setDoc(res);
      onSaved(res);
      setSigners(fromDoc(res));
      setFields(res.fields);
      setTitle(res.title);
      return true;
    }
    const res = await dapi<DocumentRec>({
      op: "update",
      id: doc.id,
      title: title.trim() || doc.title,
      ordered: signers.length > 1 && ordered,
      signers: signers.map((x) => ({ id: x.key, name: x.name.trim(), email: x.email.trim(), ...(x.title.trim() ? { title: x.title.trim() } : {}) })),
      fields,
      ...(company.id ? { companyId: company.id, companyName: company.name } : company.name ? { companyName: company.name } : {}),
    });
    if (res.error) return setErr(res.error), false;
    setDoc(res);
    onSaved(res);
    // Merlin's ids in place of the temporary ones; `from` stays, for Auto-place.
    setSigners((ss) => ss.map((x) => ({ ...x, key: res.signers.find((y) => y.email === x.email.trim().toLowerCase())?.id ?? x.key })));
    setFields(res.fields);
    return true;
  };

  /* ---------- step 3: place fields ---------- */

  const [active, setActive] = useState<string | null>(null);
  const [placing, setPlacing] = useState<FieldKind | null>(null);
  const [sel, setSel] = useState<string | null>(null);
  useEffect(() => {
    if (step === 3 && (!active || !signers.some((x) => x.key === active))) setActive(signers[0]?.key ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, signers]);
  const selField = fields.find((f) => f.id === sel) ?? null;
  const place = (kind: FieldKind, page: number, fx: number, fy: number) => {
    if (!doc || !active) return;
    const sz = FIELD_SIZE[kind];
    const pg = doc.pages[page];
    const w = Math.min(0.9, (sz.w * 612) / pg.w);
    const h = Math.min(0.5, (sz.h * 792) / pg.h);
    const f: DocField = { id: tmp("f"), page, kind, signer: active, required: kind !== "checkbox", x: Math.max(0, Math.min(1 - w, fx - w / 2)), y: Math.max(0, Math.min(1 - h, fy - h / 2)), w, h };
    setFields((fs) => [...fs, f]);
    setSel(f.id);
    setPlacing(null);
  };
  const setField = (id: string, p: Partial<DocField>) => setFields((fs) => fs.map((f) => (f.id === id ? { ...f, ...p } : f)));
  const removeField = (id: string) => (setFields((fs) => fs.filter((f) => f.id !== id)), setSel(null));
  const drag = useRef<{ id: string; mode: "move" | "size"; x0: number; y0: number; f: DocField; rect: DOMRect } | null>(null);
  const down = (e: React.PointerEvent, f: DocField, mode: "move" | "size") => {
    e.stopPropagation();
    const page = (e.currentTarget as HTMLElement).closest(".pdf-page") as HTMLElement | null;
    if (!page) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    drag.current = { id: f.id, mode, x0: e.clientX, y0: e.clientY, f: { ...f }, rect: page.getBoundingClientRect() };
    setSel(f.id);
  };
  const move = (e: React.PointerEvent) => {
    const g = drag.current;
    if (!g) return;
    const dx = (e.clientX - g.x0) / g.rect.width;
    const dy = (e.clientY - g.y0) / g.rect.height;
    setFields((fs) =>
      fs.map((f) =>
        f.id !== g.id
          ? f
          : g.mode === "move"
            ? { ...f, x: Math.max(0, Math.min(1 - f.w, g.f.x + dx)), y: Math.max(0, Math.min(1 - f.h, g.f.y + dy)) }
            : { ...f, w: Math.max(0.02, Math.min(1 - f.x, g.f.w + dx)), h: Math.max(0.012, Math.min(1 - f.y, g.f.h + dy)) },
      ),
    );
  };
  const up = () => (drag.current = null);
  useEffect(() => {
    if (step !== 3) return;
    const k = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName)) return;
      if ((e.key === "Delete" || e.key === "Backspace") && sel) (e.preventDefault(), removeField(sel));
      if (e.key === "Escape") setPlacing(null), setSel(null);
    };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [step, sel]);
  /** Auto-place: Merlin's fields for the signers it found, added beside what is placed already. */
  const autoFields = useMemo(() => {
    if (!reading) return [];
    return reading.fields.flatMap((f) => {
      const w = signers.find((x) => x.from === f.signer);
      return w ? [{ ...f, signer: w.key }] : [];
    });
  }, [reading, signers]);
  const autoPlace = () => {
    const have = new Set(fields.map((f) => f.id));
    const add = autoFields.filter((f) => !have.has(f.id));
    setFields((fs) => [...fs, ...add]);
    toast(add.length ? `Placed ${add.length} ${add.length === 1 ? "field" : "fields"}. Fields already placed stayed as they were.` : "Every field Merlin found is placed already.");
  };
  const missingSig = signers.filter((w) => !fields.some((f) => f.signer === w.key && f.kind === "signature"));
  const saveFields = async (): Promise<boolean> => {
    if (!doc) return false;
    const res = await dapi<DocumentRec>({ op: "update", id: doc.id, fields });
    if (res.error) return setErr(res.error), false;
    setDoc(res);
    onSaved(res);
    setFields(res.fields);
    return true;
  };

  /* ---------- step 4: review and send ---------- */

  const send = async () => {
    if (!doc) return;
    if (!data.canSend) return openPlans("proposals");
    if (!title.trim()) return setErr("Add a title for the email.");
    const soloMe = signers.length === 1 && isMe(signers[0]);
    const w = soloMe ? window.open("", "_blank") : null;
    setBusy("send");
    setErr(null);
    const u = await dapi<DocumentRec>({ op: "update", id: doc.id, title: title.trim(), message: message.trim(), ordered: signers.length > 1 && ordered });
    if (u.error) return setBusy(""), w?.close(), setErr(u.error);
    const r = await dapi<{ document: DocumentRec; message: string }>({ op: "send", id: doc.id, message: message.trim(), linkDays: expires ? days : 0 });
    if (r.error) return setBusy(""), w?.close(), setErr(r.error);
    if (keep) {
      const k = await dapi<{ name: string }>({ op: "save", id: doc.id });
      if (k.error) toast(k.error, true);
    }
    if (soloMe) {
      const l = await dapi<{ link: string }>({ op: "mylink", id: doc.id });
      if (!l.error && w) w.location.href = l.link;
      else w?.close();
    }
    setBusy("");
    const firstUp = signers.length > 1 && ordered ? [signers[0]] : signers;
    onSent(r.document, soloMe ? "Ready for your signature. It opened in a new tab." : `Sent to ${firstUp.map((x) => firstOf(x.name)).join(", ")} for signature.`);
  };

  /* ---------- moving between steps ---------- */

  const go = async (to: Step) => {
    setErr(null);
    if (to <= step) return setStep(to);
    if (step === 1 && !doc) return;
    if (step <= 2 && to > 2) {
      // Jumping ahead from step 1 skips no checks: signers are saved on the way.
      if (!signersOk) return setStep(2), setSigners((ss) => (ss.length ? ss.map((x) => ({ ...x, touched: true })) : [blank()]));
    }
    if (step === 2) {
      if (!signersOk) return setSigners((ss) => ss.map((x) => ({ ...x, touched: true })));
      setBusy("next");
      const ok = await saveSigners();
      setBusy("");
      if (!ok) return;
    }
    if (step === 3 && to === 4) {
      if (missingSig.length) return setErr(`Place a signature field for ${missingSig.map((x) => signerName(x, signers.indexOf(x))).join(" and ")}.`);
      setBusy("next");
      const ok = await saveFields();
      setBusy("");
      if (!ok) return;
    }
    setStep(to);
    setReached((r) => (to > r ? to : r));
  };
  const close = () => onClose(doc && mine ? doc : null);

  /* ---------- drawing ---------- */

  const top = (
    <div className="sw-top">
      <button type="button" className="sw-close" onClick={close} aria-label="Close and keep it as a draft">
        <IconX size={18} />
        <span>Send for signature</span>
      </button>
      <ol className="sw-steps" aria-label="Steps">
        {STEPS.map(([n, label], i) => (
          <li key={n}>
            {i > 0 && <span className="sw-dash" aria-hidden />}
            <button type="button" className="sw-step" data-cur={step === n} data-done={n < step} aria-current={step === n ? "step" : undefined} disabled={n > reached || !!busy} onClick={() => void go(n)}>
              <span className="sw-step-ic" aria-hidden>
                {n < step ? <IconCheck size={13} /> : n}
              </span>
              {label}
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
  const errLine = err && (
    <p className="sw-err" role="alert">
      {err}
    </p>
  );

  if (step === 1)
    return (
      <div className="sw">
        {top}
        <div className="sw-body">
          <h1 className="sw-h1" ref={head} tabIndex={-1}>
            Select documents to be signed
          </h1>
          <div className="sw-srcs">
            <button type="button" className="sw-src sw-src-up" disabled={!!busy} onClick={() => fileRef.current?.click()}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 15V3M7 8l5-5 5 5M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4" />
              </svg>
              Upload
            </button>
            <span className="sw-src-sep" aria-hidden />
            <button type="button" className="sw-src" disabled={!!busy} onClick={() => setTplOpen(true)}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                <path d="M14 3v5h5" />
              </svg>
              Add template
            </button>
          </div>
          <div
            className="sw-drop"
            data-on={dropOn}
            aria-busy={!!busy}
            onDragOver={(e) => (e.preventDefault(), !dropOn && setDropOn(true))}
            onDragLeave={() => setDropOn(false)}
            onDrop={(e) => (e.preventDefault(), setDropOn(false), void take(e.dataTransfer.files?.[0]))}
            onClick={() => !busy && fileRef.current?.click()}
          >
            {busy ? (
              <span className="sw-drop-busy" role="status">
                <span className="sw-bar" aria-hidden>
                  <span />
                </span>
                {busy}
              </span>
            ) : (
              <>
                <svg width="30" height="36" viewBox="0 0 30 36" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden>
                  <path d="M3 3h16l8 8v22H3z" />
                  <path d="M19 3v8h8M15 28V16M10 21l5-5 5 5" strokeLinecap="round" />
                </svg>
                <span>Drag documents here to upload</span>
                <span className="sw-drop-s">One PDF, up to 15 MB</span>
              </>
            )}
          </div>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
          <h2 className="sw-h3">Selected documents</h2>
          <p className="sw-sub">{doc ? (savedFrom ? "From your templates, with its fields already placed" : `${doc.pages.length} ${doc.pages.length === 1 ? "page" : "pages"}`) : "Nothing selected yet"}</p>
          {doc && (
            <ul className="sw-files">
              <li>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" aria-hidden>
                  <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
                  <path d="M14 3v5h5" />
                </svg>
                <span className="sw-file-n">{savedFrom ? savedFrom.name : doc.fileName}</span>
                {reading && <span className="sw-tag">Merlin found {reading.signers.length === 1 ? "1 signer" : `${reading.signers.length} signers`} and {reading.count} fields</span>}
                <button type="button" className="sw-iconbtn" aria-label={`Remove ${doc.fileName}`} disabled={!!busy} onClick={removeDoc}>
                  <IconX size={15} />
                </button>
              </li>
            </ul>
          )}
          {errLine}
          <div className="sw-foot">
            <span />
            <button type="button" className="sw-btn sw-btn-dark" disabled={!doc || !!busy} onClick={() => void go(2)}>
              Next
            </button>
          </div>
        </div>
        {tplOpen && (
          <div className="sw-modal-bg" role="presentation" onClick={() => setTplOpen(false)}>
            <div className="sw-modal" role="dialog" aria-modal="true" aria-labelledby="sw-tpl-h" onClick={(e) => e.stopPropagation()}>
              <div className="sw-modal-top">
                <h2 id="sw-tpl-h">Add a template</h2>
                <button type="button" className="sw-iconbtn" aria-label="Close" onClick={() => setTplOpen(false)}>
                  <IconX size={16} />
                </button>
              </div>
              {saved.length === 0 ? (
                <div className="sw-modal-empty">
                  <strong>No templates yet</strong>
                  <p>Templates are for contracts you send again and again. Send one with &quot;Save as a reusable template&quot; checked on the last step, and it shows here with its fields in place.</p>
                </div>
              ) : (
                <ul className="sw-tpls">
                  {saved.map((s) => (
                    <li key={s.id}>
                      <button type="button" onClick={() => void pickTemplate(s)}>
                        <strong>{s.name}</strong>
                        <span>
                          {s.pages} {s.pages === 1 ? "page" : "pages"} · {s.roles.length + (s.meSigns ? 1 : 0)} {s.roles.length + (s.meSigns ? 1 : 0) === 1 ? "signer" : "signers"} · {s.fields} fields
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    );

  if (step === 2)
    return (
      <div className="sw">
        {top}
        <div className="sw-body">
          <div className="sw-headrow">
            <h1 className="sw-h1" ref={head} tabIndex={-1}>
              Add signers
            </h1>
            {!savedFrom && (
              <button type="button" className="sw-link" onClick={onlyMe}>
                I&#39;m the only signer
              </button>
            )}
          </div>
          <ol className="sw-signers">
            {signers.map((w, i) => {
              const e = w.touched ? signerErr(w) : {};
              const num = ordered && signers.length > 1;
              return (
                <li
                  key={w.key}
                  className="sw-signer"
                  data-drag={dragKey === w.key}
                  onDragOver={(ev) => num && dragKey && (ev.preventDefault(), moveTo(dragKey, w.key))}
                >
                  {num && (
                    <span
                      className="sw-grip"
                      draggable
                      aria-hidden
                      onDragStart={(ev) => (ev.dataTransfer.setData("text/plain", w.key), (ev.dataTransfer.effectAllowed = "move"), setDragKey(w.key))}
                      onDragEnd={() => setDragKey(null)}
                    >
                      <svg width="12" height="16" viewBox="0 0 12 16" fill="currentColor">
                        <circle cx="3" cy="3" r="1.6" />
                        <circle cx="9" cy="3" r="1.6" />
                        <circle cx="3" cy="8" r="1.6" />
                        <circle cx="9" cy="8" r="1.6" />
                        <circle cx="3" cy="13" r="1.6" />
                        <circle cx="9" cy="13" r="1.6" />
                      </svg>
                    </span>
                  )}
                  <div className="sw-signer-head">
                    <strong>
                      {num ? `${i + 1}. ` : ""}
                      {w.name.trim() ? (isMe(w) ? `${w.name} (you)` : w.name) : w.role || "Signer"}
                    </strong>
                    {num && (
                      <span className="sw-order">
                        <button type="button" className="sw-iconbtn" aria-label={`Move ${w.name || "this signer"} up`} disabled={i === 0} onClick={() => moveTo(w.key, signers[i - 1].key)}>
                          ↑
                        </button>
                        <button type="button" className="sw-iconbtn" aria-label={`Move ${w.name || "this signer"} down`} disabled={i === signers.length - 1} onClick={() => moveTo(w.key, signers[i + 1].key)}>
                          ↓
                        </button>
                      </span>
                    )}
                    {!savedFrom && (
                      <span className="sw-more">
                        <button type="button" className="sw-iconbtn" aria-label={`More for ${w.name || "this signer"}`} aria-expanded={menu === w.key} onClick={() => setMenu(menu === w.key ? null : w.key)}>
                          •••
                        </button>
                        {menu === w.key && (
                          <span className="sw-menu" role="menu">
                            <button type="button" role="menuitem" disabled={signers.length === 1} onClick={() => (setSigners((ss) => ss.filter((x) => x.key !== w.key)), setFields((fs) => fs.filter((f) => f.signer !== w.key)), setMenu(null))}>
                              Remove signer
                            </button>
                          </span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="sw-signer-row">
                    <label className="sw-field">
                      <span>Name</span>
                      <input
                        className="sw-input"
                        data-bad={!!e.name}
                        placeholder="Signer's name"
                        autoComplete="off"
                        value={w.name}
                        autoFocus={i === signers.length - 1 && !w.name && !w.email}
                        onChange={(ev) => patch(w.key, { name: ev.target.value })}
                        onBlur={() => patch(w.key, { touched: true })}
                      />
                      {e.name && <span className="sw-bad">{e.name}</span>}
                    </label>
                    <label className="sw-field">
                      <span>Email address</span>
                      <input
                        className="sw-input"
                        data-bad={!!e.email}
                        type="email"
                        placeholder="email@example.com"
                        autoComplete="off"
                        value={w.email}
                        onChange={(ev) => patch(w.key, { email: ev.target.value })}
                        onBlur={() => patch(w.key, { touched: true })}
                      />
                      {e.email && <span className="sw-bad">{e.email}</span>}
                    </label>
                  </div>
                </li>
              );
            })}
          </ol>
          {!savedFrom && (
            <div className="sw-adds">
              <button type="button" className="sw-btn sw-btn-soft" disabled={signers.length >= 10} onClick={() => setSigners((ss) => [...ss, blank()])}>
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                  <circle cx="10" cy="8" r="4" />
                  <path d="M3 21a7 7 0 0 1 12-5M19 14v6M16 17h6" />
                </svg>
                Add another signer
              </button>
              {!hasMe && (
                <button type="button" className="sw-btn sw-btn-soft" disabled={signers.length >= 10} onClick={() => setSigners((ss) => [...ss.filter((x) => x.name || x.email), { key: tmp("new_"), name: data.me.name, email: data.me.email, title: data.me.title }])}>
                  Add me
                </button>
              )}
            </div>
          )}
          {savedFrom && hasMe && <p className="sw-sub">You sign this template too, last. Your fields are already on it.</p>}
          {signers.length > 1 && (
            <>
              <h2 className="sw-h3">Signer settings</h2>
              <label className="sw-check">
                <input type="checkbox" checked={ordered} onChange={(e) => setOrdered(e.target.checked)} />
                Set signer order
              </label>
              {ordered && <p className="sw-sub">Each signer gets the email when the one before has signed. Drag to reorder.</p>}
            </>
          )}
          {errLine}
          <div className="sw-foot">
            <button type="button" className="sw-link" disabled={!!busy} onClick={() => void go(1)}>
              Back
            </button>
            <button type="button" className="sw-btn sw-btn-dark" aria-busy={busy === "next"} disabled={!!busy || !signers.length} onClick={() => void go(3)}>
              {busy === "next" ? "Saving" : "Next"}
            </button>
          </div>
        </div>
      </div>
    );

  if (step === 3 && doc) {
    const activeIdx = signers.findIndex((x) => x.key === active);
    const overlay = (page: number) => (
      <div
        className="df-layer"
        data-placing={!!placing}
        onPointerDown={(e) => {
          if (!placing) return setSel(null);
          const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
          place(placing, page, (e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height);
        }}
        onDragOver={(e) => e.dataTransfer.types.includes("text/x-field") && e.preventDefault()}
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
            const w = signers.find((x) => x.key === f.signer);
            const nm = w ? firstOf(isMe(w) ? "You" : w.name) : "";
            return (
              <div
                key={f.id}
                className={`df-field sw-pf df-c${color(f.signer)}`}
                data-kind={f.kind}
                data-sel={sel === f.id}
                style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}
                onPointerDown={(e) => down(e, f, "move")}
                onPointerMove={move}
                onPointerUp={up}
                role="button"
                tabIndex={0}
                aria-label={`${KIND_SAY[f.kind]} for ${w?.name ?? "a signer"}`}
                onFocus={() => setSel(f.id)}
              >
                {sel === f.id && <span className="sw-pf-tip">{`${nm}'s ${KIND_SAY[f.kind]}`}</span>}
                <span className="df-field-l">
                  {f.kind === "checkbox" ? "" : f.kind === "signature" || f.kind === "initials" ? <KindIcon k={f.kind} /> : f.kind === "date" ? "MM / DD / YYYY" : f.kind === "text" ? f.prefill || f.label || "Textbox" : KIND_SAY[f.kind]}
                </span>
                {sel === f.id && <span className="df-handle" onPointerDown={(e) => down(e, f, "size")} onPointerMove={move} onPointerUp={up} aria-hidden />}
              </div>
            );
          })}
      </div>
    );
    return (
      <div className="sw sw-place">
        {top}
        <div className="sw-pl">
          <aside className="sw-pl-left" aria-label="Fields">
            <h1 className="sw-sr" ref={head} tabIndex={-1}>
              Place fields
            </h1>
            <label className="sw-pl-lab sw-first" htmlFor="sw-who">
              Signer
            </label>
            <div className={`sw-who df-c${Math.max(0, activeIdx) % 5}`}>
              <span className="sw-av" aria-hidden>
                {ini(signers[activeIdx]?.name ?? "")}
              </span>
              <select id="sw-who" value={active ?? ""} onChange={(e) => setActive(e.target.value)}>
                {signers.map((w, i) => (
                  <option key={w.key} value={w.key}>
                    {signerName(w, i)}
                  </option>
                ))}
              </select>
            </div>
            {reading && autoFields.length > 0 && (
              <>
                <span className="sw-pl-lab">Automatic fields</span>
                <button type="button" className="sw-auto" onClick={autoPlace}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                    <path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2 2M16 16l2 2M6 18l2-2M16 8l2-2" />
                  </svg>
                  Auto-place fields
                </button>
              </>
            )}
            {GROUPS.map(([g, ks]) => (
              <div key={g} className="sw-kgroup">
                <span className="sw-pl-lab">{g}</span>
                {ks.map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`sw-kind df-c${Math.max(0, activeIdx) % 5}`}
                    data-on={placing === k}
                    aria-pressed={placing === k}
                    draggable
                    onDragStart={(e) => (e.dataTransfer.setData("text/x-field", k), (e.dataTransfer.effectAllowed = "copy"))}
                    onClick={() => setPlacing((p) => (p === k ? null : k))}
                  >
                    <span className="sw-kind-ic">
                      <KindIcon k={k} />
                    </span>
                    {KIND_SAY[k]}
                  </button>
                ))}
              </div>
            ))}
          </aside>
          <div className="sw-pl-doc">
            {placing && (
              <p className="sw-hint" role="status">
                Click the page where the {KIND_SAY[placing].toLowerCase()} goes, or drag it there. Esc to cancel.
              </p>
            )}
            {reading && fields.length > 0 && step === 3 && !placing && <p className="sw-hint sw-hint-soft">Merlin placed fields where this contract asks for signatures. Drag to move, pull a corner to resize.</p>}
            <PdfPages src={`/api/documents/file?id=${encodeURIComponent(doc.id)}`} pages={doc.pages} overlay={overlay} />
          </div>
          <aside className="sw-pl-right" aria-label="The selected field">
            {selField ? (
              <>
                <label className="sw-pl-lab sw-first" htmlFor="sw-assign">
                  Assigned to
                </label>
                <div className={`sw-who df-c${color(selField.signer)}`}>
                  <span className="sw-av" aria-hidden>
                    {ini(signers.find((x) => x.key === selField.signer)?.name ?? "")}
                  </span>
                  <select id="sw-assign" value={selField.signer} onChange={(e) => setField(selField.id, { signer: e.target.value })}>
                    {signers.map((w, i) => (
                      <option key={w.key} value={w.key}>
                        {signerName(w, i)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="sw-prop-h">
                  <KindIcon k={selField.kind} />
                  <strong>{KIND_SAY[selField.kind]}</strong>
                  <button type="button" className="sw-iconbtn" aria-label="Delete this field" onClick={() => removeField(selField.id)}>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden>
                      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6" />
                    </svg>
                  </button>
                </div>
                {selField.kind === "text" && (
                  <>
                    <label className="sw-field">
                      <span>Label</span>
                      <input className="sw-input" maxLength={60} placeholder="What to type, e.g. Start date" value={selField.label ?? ""} onChange={(e) => setField(selField.id, { label: e.target.value })} />
                    </label>
                    <label className="sw-field">
                      <span>Filled in as (they can change it)</span>
                      <input className="sw-input" maxLength={200} value={selField.prefill ?? ""} onChange={(e) => setField(selField.id, { prefill: e.target.value })} />
                    </label>
                  </>
                )}
                <div className="sw-prop-sec">
                  <strong>Required</strong>
                  <label className="sw-check">
                    <input type="checkbox" checked={selField.required} disabled={selField.kind === "signature"} onChange={(e) => setField(selField.id, { required: e.target.checked })} />
                    Required field
                  </label>
                </div>
              </>
            ) : (
              <div className="sw-none">
                <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M4 20h4L19 9l-4-4L4 16z" />
                  <path d="M3 22h18" />
                </svg>
                <strong>Nothing selected</strong>
                <span>Select a field to make changes</span>
              </div>
            )}
          </aside>
        </div>
        <div className="sw-pl-foot">
          {err ? (
            <p className="sw-err" role="alert">
              {err}
            </p>
          ) : missingSig.length ? (
            <span className="sw-sub">
              Each signer needs a signature field. Still needed: {missingSig.map((x) => signerName(x, signers.indexOf(x))).join(", ")}
            </span>
          ) : (
            <span className="sw-sub">
              {fields.length} {fields.length === 1 ? "field" : "fields"} placed
            </span>
          )}
          <button type="button" className="sw-link" disabled={!!busy} onClick={() => void go(2)}>
            Back
          </button>
          <button type="button" className="sw-btn sw-btn-dark" aria-busy={busy === "next"} disabled={!!busy || missingSig.length > 0} onClick={() => void go(4)}>
            {busy === "next" ? "Saving" : "Next"}
          </button>
        </div>
      </div>
    );
  }

  // Step 4: review and send.
  const solo = signers.length === 1 && isMe(signers[0]);
  return (
    <div className="sw">
      {top}
      <div className="sw-body">
        <h1 className="sw-h1" ref={head} tabIndex={-1}>
          Review and send
        </h1>
        <h2 className="sw-h3">Signers</h2>
        <ol className="sw-review">
          {signers.map((w, i) => (
            <li key={w.key}>
              {signers.length > 1 ? `${i + 1}. ` : ""}
              {isMe(w) ? `${w.name} (you)` : w.name} ({w.email})
            </li>
          ))}
        </ol>
        {signers.length > 1 && <p className="sw-sub">{ordered ? "In this order: each gets the email when the one before has signed." : "Everyone gets the email at once."}</p>}

        <h2 className="sw-h3">
          Document expiration <span className="sw-opt">(optional)</span>
        </h2>
        <label className="sw-check">
          <input type="checkbox" checked={expires} onChange={(e) => setExpires(e.target.checked)} />
          Set an expiration for the signing link
        </label>
        {expires && (
          <label className="sw-field sw-field-narrow">
            <span>The link works for</span>
            <select className="sw-input" value={days} onChange={(e) => setDays(Number(e.target.value) as Exclude<LinkDays, 0>)}>
              {([14, 30, 60, 90] as const).map((d) => (
                <option key={d} value={d}>
                  {LINK_DAYS_SAY[d]}
                </option>
              ))}
            </select>
          </label>
        )}

        <h2 className="sw-h3">Email to signers</h2>
        <label className="sw-field">
          <span>Title</span>
          <input className="sw-input" maxLength={160} value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <label className="sw-field">
          <span>
            Message <span className="sw-opt">(optional)</span>
          </span>
          <textarea className="sw-input sw-ta" rows={4} maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} />
        </label>
        <p className="sw-note">Each signer confirms their email with a 6 digit code before signing. Everyone gets the completed, sealed PDF by email once all have signed.</p>

        {!savedFrom && (
          <div className="sw-again">
            <strong>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8z" />
              </svg>
              Want to use this document again in the future?
            </strong>
            <label className="sw-check">
              <input type="checkbox" checked={keep} onChange={(e) => setKeep(e.target.checked)} />
              Yes, save it as a reusable template after it is sent.
            </label>
          </div>
        )}
        {!data.email && <p className="sw-err">Email isn&#39;t set up on Merlin yet, so a contract can&#39;t go out for signature.</p>}
        {errLine}
        <div className="sw-foot">
          <button type="button" className="sw-link" disabled={!!busy} onClick={() => void go(3)}>
            Back
          </button>
          <button type="button" className="sw-btn sw-btn-dark" aria-busy={busy === "send"} disabled={!!busy || !title.trim()} onClick={() => void send()}>
            {busy === "send" ? "Sending" : !data.canSend ? "See the Close plan to send" : solo ? "Sign now" : "Send for signature"}
          </button>
        </div>
      </div>
    </div>
  );
}
