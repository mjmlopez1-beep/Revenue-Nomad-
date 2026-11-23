"use client";

/**
 * Sending a contract for signature, in four steps (Contracts.dc.html): drop the PDF, check the
 * fields Merlin placed, say who signs, send. Drop in a contract written anywhere and Merlin reads
 * it (lib/documents/smart.ts), finds where everyone signs and places the fields; the member checks
 * them on the page, coloured by who fills them, says who signs and in what order, and sends with a
 * note drafted in their voice, the link's length and the reminders. "Adjust by hand" opens the
 * field placer (DocBuilder.tsx) with the fields already there and a field type ready to place.
 *
 *   ContractFlow   the steps, from a contract Merlin read, a saved contract (lib/documents/
 *                  templates.ts: its fields placed already, only who signs is new) or a draft
 *   readUpload     upload a PDF and have Merlin read it (or say why the field placer opens instead)
 *   ContractsHome  the old look's Contracts screen inside Proposals: the drop zone, the contracts
 *                  sent, and the flow once one is read. The new look's page is ContractsPage.tsx.
 *
 * PDF only: Merlin has no way to turn a Word file into a PDF, so the drop zone says to save one
 * first. Placing the fields for you is Close (the trial included): without it, the upload opens
 * the field placer as before, with the Close prompt.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProposalsView } from "@/lib/proposals/types";
import { FIELD_SAY, FIELD_SIZE, type DocField, type DocumentRec, type FieldKind } from "@/lib/documents/types";
import type { SmartReading, SmartSigner } from "@/lib/documents/smart";
import type { SavedContract } from "@/lib/documents/templates";
import { IconCheck, IconChevron, IconX, useToast } from "../../ui/shared";
import { PdfPages } from "../../ui/PdfPages";
import { openPlans } from "../Billing";
import { dapi, uploadPdf } from "../DocBuilder";
import { CloseBuildPrompt } from "../Proposals";
import { ProposalStatus } from "../ProposalParts";
import { dayOf } from "../../sign/doc";
import { LinkDaysPick } from "../LinkDays";
import type { LinkDays } from "@/lib/proposals/types";
import { SendReminders, saveReminders, useSendReminders } from "../SendReminders";
import { MySignature, useMySignature } from "../MySignature";
import "../../ui/pdf.css";
import "../proposals.css";
import "./contracts.css";

/** Merlin couldn't find a signature line (lib/documents/smart.ts NOTHING_FOUND says the same). */
export const NOTHING_FOUND = "Merlin couldn't find signature lines in this contract, so place the fields by hand.";
/**
 * What happens after it's sent, true of a document as of a proposal (lib/close): an alert when the
 * signer opens it and when everyone has signed. The reminders say their own days in the switches
 * above this line (SendReminders.tsx), so this doesn't repeat them.
 */
export const AFTER_SEND = (first: string) => `You'll get an alert when ${first} opens it, and when it's signed.`;
/** The member signs too, last: their saved signature (MySignature.tsx) makes it one click on the signing page. */
export const SIGN_LAST = (first: string, saved: boolean) =>
  saved ? `You sign last, after ${first}. Your saved signature goes on in one click: Use my saved signature.` : `You sign last, after ${first}. Save your signature now and it's one click then.`;

const firstOf = (s: string) => s.trim().split(/\s+/)[0] || s;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;
const DAY = 86_400_000;
const short = (ms: number) => new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/* ---------- upload and read ---------- */

export type Read = { doc: DocumentRec; reading: SmartReading } | { manual: DocumentRec; notice?: string } | { error: string };

/**
 * Upload a PDF and have Merlin read it. Without Close (smart off), or when Merlin found no
 * signature lines, the answer is the field placer with a line on why.
 */
export async function readUpload(f: File, smart: boolean, onUploaded?: (d: DocumentRec) => void): Promise<Read> {
  if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf")
    return { error: /\.docx?$/i.test(f.name) ? "Merlin reads PDFs only. In Word or Google Docs: File, then Save as or Download, then PDF." : "That isn't a PDF. Save it as a PDF and drop that in." };
  const up = await uploadPdf(f);
  if ("error" in up) return { error: up.error };
  onUploaded?.(up);
  if (!smart) return { manual: up };
  const res = await dapi<{ document: DocumentRec; reading: SmartReading }>({ op: "read", id: up.id });
  if (res.error) return { manual: up, notice: res.error };
  if (!res.reading.found) return { manual: up, notice: NOTHING_FOUND };
  return { doc: res.document, reading: res.reading };
}

/** A starter contract (lib/documents/samples.ts STARTERS): made up, read like any other. */
export async function starterFile(layout: "two-column" | "nda", member: string): Promise<File> {
  const { makeSamplePdf, SAMPLE_NAME } = await import("@/lib/documents/samples");
  const bytes = await makeSamplePdf(layout, { member });
  return new File([bytes as BlobPart], SAMPLE_NAME[layout], { type: "application/pdf" });
}

/* ---------- the flow ---------- */

export type FlowStart =
  /** Merlin read it. `demo`: a starter contract, so the link goes to the member's own email. */
  | { kind: "read"; doc: DocumentRec; reading: SmartReading; demo?: boolean }
  /** A saved contract: its fields are placed already; who signs is new. */
  | { kind: "saved"; saved: SavedContract; doc: DocumentRec }
  /** A draft the member started. */
  | { kind: "draft"; doc: DocumentRec };

type Step = "fields" | "signers" | "send" | "sent";
type Who = SmartSigner;

/** A switch in the flow (role="switch"), with its words and the line under them. */
function Toggle({ label, sub, on, onChange, disabled }: { label: string; sub: string; on: boolean; onChange: (v: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} className="ct-sw" disabled={disabled} onClick={() => onChange(!on)}>
      <span className="ct-sw-t">
        <span className="ct-sw-l">{label}</span>
        <span className="ct-sw-s">{sub}</span>
      </span>
      <span className="ct-track" data-on={on} aria-hidden>
        <span className="ct-knob" />
      </span>
    </button>
  );
}

const roleOf = (d: DocumentRec, s: SavedContract): Who[] => [
  ...s.roles.map((r) => ({ key: r.id, name: "", email: "", title: r.title ?? "", me: false, party: "", found: "A saved contract. Type who signs it this time." })),
  ...d.signers.filter((x) => x.sender).map((x) => ({ key: x.id, name: x.name, email: x.email, title: x.title ?? "", me: true, party: "", found: "" })),
];

export function ContractFlow({
  data,
  start,
  onSaved,
  onManual,
  onDone,
  onHome,
  onKept,
  onAlerts,
  onStep,
}: {
  data: ProposalsView;
  start: FlowStart;
  /** A document changed (saved, sent). */
  onSaved: (d: DocumentRec) => void;
  /** The field placer, for this document, with a line at its top and a field type ready to place. */
  onManual: (d: DocumentRec, notice?: string, place?: { kind: FieldKind; email: string }) => void;
  /** It went out: see it with the others. */
  onDone: (d: DocumentRec) => void;
  /** Back to all contracts. */
  onHome: () => void;
  /** A contract was saved to reuse. */
  onKept?: () => void;
  /** Where the member changes their alerts. */
  onAlerts?: () => void;
  /** The step on screen, for the page's breadcrumb. */
  onStep?: (s: Step) => void;
}) {
  const toast = useToast();
  const savedMode = start.kind === "saved";
  const demo = start.kind === "read" && !!start.demo;
  const [doc, setDoc] = useState<DocumentRec>(start.doc);
  const [savedFrom, setSavedFrom] = useState<SavedContract | null>(savedMode ? start.saved : null);
  const [step, setStep] = useState<Step>(savedMode ? "signers" : "fields");
  const initial = useMemo((): { signers: Who[]; fields: DocField[]; title: string; message: string; company: { id: string | null; name: string } } => {
    if (start.kind === "read") {
      let signers = start.reading.signers.map((x) => ({ ...x }));
      let fields = start.reading.fields.map((f) => ({ ...f }));
      let company = start.reading.company;
      if (start.demo) {
        // A starter: made-up names, the link to the member's own email, no company of Merlin's and so no pipeline move.
        const mine = signers.filter((x) => x.me).map((x) => x.key);
        signers = signers.filter((x) => !x.me).map((x) => ({ ...x, email: data.me.email, found: "This is an example, so the link goes to your own email. You see what a client sees." }));
        fields = fields.filter((f) => !mine.includes(f.signer));
        company = { id: null, name: `${start.reading.signers.find((x) => !x.me)?.party || "Cedar and Pine"} (example)` };
      }
      return { signers, fields, title: start.reading.title || start.doc.title, message: start.reading.message, company };
    }
    if (start.kind === "saved") return { signers: roleOf(start.doc, start.saved), fields: start.doc.fields.map((f) => ({ ...f })), title: start.saved.name, message: "", company: { id: null, name: "" } };
    const d = start.doc;
    return {
      signers: d.signers.map((x) => ({ key: x.id, name: x.name, email: x.email, title: x.title ?? "", me: x.sender, party: x.sender ? "" : d.company.name, found: "" })),
      fields: d.fields.map((f) => ({ ...f })),
      title: d.title,
      message: "",
      company: d.company,
    };
  }, [start, data.me.email]);
  const [signers, setSigners] = useState<Who[]>(initial.signers);
  const [fields, setFields] = useState<DocField[]>(initial.fields);
  const [title, setTitle] = useState(initial.title);
  const [company] = useState(initial.company);
  const [ordered, setOrdered] = useState(start.kind === "draft" ? start.doc.ordered : savedMode ? start.saved.ordered : true);
  // "I sign this too" off: the member's place and fields go, kept aside to bring back.
  const [meAside, setMeAside] = useState<{ who: Who; fields: DocField[] } | null>(null);
  const [editing, setEditing] = useState<string | null>(() => initial.signers.find((x) => !x.me && (!x.name || !EMAIL_RE.test(x.email)))?.key ?? null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<"" | "next" | "send" | "hand">("");
  const [days, setDays] = useState<LinkDays>(30);
  const [rem, setRem] = useSendReminders(savedFrom ? null : doc.id, data.canSend);
  const [mySig, setMySig] = useMySignature();
  const [keep, setKeep] = useState(false);
  const [addFor, setAddFor] = useState<string | null>(null);

  const others = signers.filter((x) => !x.me);
  const me = signers.find((x) => x.me) ?? null;
  const other = others[0] ?? null;
  const otherFirst = other ? firstOf(other.name) || "them" : "them";
  const kindWords = (start.kind === "read" ? start.reading.kind : savedMode ? start.saved.name : doc.title.split(" · ").pop() ?? "contract").toLowerCase();
  const myFirst = firstOf(data.me.name);
  const defaultNote = `Hi ${otherFirst === "them" ? "there" : otherFirst}, here is the ${kindWords} we talked through. It takes a few minutes to read, and you can sign on your phone. Happy to answer anything first. ${myFirst}`;
  const [message, setMessage] = useState<string | null>(initial.message || null);
  const note = message ?? defaultNote;
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    onStep?.(step);
    head.current?.focus({ preventScroll: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const whoOf = (key: string) => signers.find((x) => x.key === key);
  const nameOf = (key: string) => {
    const s = whoOf(key);
    if (s?.me) return "You";
    const i = others.findIndex((x) => x.key === key);
    return firstOf(s?.name ?? "") || (others.length > 1 ? `Signer ${i + 1}` : "Their signer");
  };
  const fieldText = (f: DocField) => {
    const s = whoOf(f.signer);
    if (f.kind === "signature") return `Signature · ${nameOf(f.signer)}`;
    if (f.kind === "name") return s?.name || "Full name";
    if (f.kind === "date") return "Date signed";
    if (f.kind === "text") return f.prefill || s?.title || f.label || "Text";
    return FIELD_SAY[f.kind];
  };
  const fieldLine = (f: DocField) => (f.kind === "text" && /^title$/i.test(f.label ?? "") ? `Title${(whoOf(f.signer)?.title || f.prefill) ? `, filled in as ${whoOf(f.signer)?.title || f.prefill}` : ""}` : f.kind === "text" ? f.label || "Text" : FIELD_SAY[f.kind]);
  const pagesWith = [...new Set(fields.map((f) => f.page))].sort((a, b) => a - b);
  const shownPages = pagesWith.length ? pagesWith : [doc.pages.length - 1];

  /** Save what's on screen into the draft (not in saved mode, which has no draft yet). */
  const save = async (): Promise<DocumentRec | null> => {
    const bad = signers.find((x) => !x.name.trim() || !EMAIL_RE.test(x.email.trim()));
    if (bad) {
      setEditing(bad.key);
      setStep("signers");
      setErr(bad.me ? "Your own email is missing from your profile." : `Type the name and email of who signs${bad.party ? ` for ${bad.party}` : ""}.`);
      return null;
    }
    const res = await dapi<DocumentRec>({
      op: "update",
      id: doc.id,
      title,
      message: note,
      ordered,
      signers: signers.map((x) => ({ id: x.key, name: x.name.trim(), email: x.email.trim(), ...(x.title.trim() ? { title: x.title.trim() } : {}) })),
      fields: fields.map((f) => (f.kind === "text" && f.label === "Title" ? { ...f, prefill: whoOf(f.signer)?.title || undefined } : f)),
      ...(company.id ? { companyId: company.id, companyName: company.name } : company.name ? { companyName: company.name } : {}),
    });
    if (res.error) return setErr(res.error), null;
    // Merlin's signer ids in place of the app's own, so the fields keep their signer.
    const map = new Map<string, string>();
    signers.forEach((x) => {
      const y = res.signers.find((z) => z.email === x.email.trim().toLowerCase());
      if (y && y.id !== x.key) map.set(x.key, y.id);
    });
    if (map.size) {
      setSigners((ss) => ss.map((x) => ({ ...x, key: map.get(x.key) ?? x.key })));
      setFields(res.fields);
    }
    setDoc(res);
    onSaved(res);
    return res;
  };

  /** A saved contract: on to sending makes the new draft from it, with who signs now. */
  const useSaved = async (): Promise<boolean> => {
    if (!savedFrom) return true;
    const res = await dapi<DocumentRec>({ op: "use", id: savedFrom.id, signers: others.map((x) => ({ name: x.name.trim(), email: x.email.trim(), ...(x.title.trim() ? { title: x.title.trim() } : {}) })), me: !!me });
    if (res.error) return setErr(res.error), false;
    setDoc(res);
    onSaved(res);
    setSavedFrom(null);
    setSigners(res.signers.map((x) => ({ key: x.id, name: x.name, email: x.email, title: x.title ?? "", me: x.sender, party: "", found: "" })));
    setFields(res.fields);
    setTitle(res.title);
    return true;
  };

  const toSigners = () => (setErr(null), setStep("signers"));
  const toSend = async () => {
    setErr(null);
    const bad = others.find((x) => !x.name.trim() || !EMAIL_RE.test(x.email.trim()));
    if (bad) return setEditing(bad.key), setErr(`Type the name and email of who signs${bad.party ? ` for ${bad.party}` : ""}.`);
    if (demo && others.some((x) => x.email.trim().toLowerCase() !== data.me.email.toLowerCase())) return setErr("This is an example, so it goes to your own email only.");
    setBusy("next");
    const ok = savedFrom ? await useSaved() : !!(await save());
    setBusy("");
    if (ok) setStep("send");
  };
  const send = async () => {
    setErr(null);
    if (!data.canSend) return openPlans("proposals");
    setBusy("send");
    const saved = await save();
    if (!saved) return setBusy("");
    const off = await saveReminders(saved.id, rem);
    if (off) return setBusy(""), setErr(off);
    const res = await dapi<{ document: DocumentRec; message: string }>({ op: "send", id: saved.id, message: note, linkDays: days });
    if (res.error) return setBusy(""), setErr(res.error);
    setDoc(res.document);
    onSaved(res.document);
    if (keep) {
      const k = await dapi<{ name: string }>({ op: "save", id: saved.id });
      if (k.error) toast(k.error, true);
      else onKept?.();
    }
    setBusy("");
    setStep("sent");
  };
  /** Adjust by hand: saved first, then the field placer with this field type ready. */
  const byHand = async (kind?: FieldKind) => {
    if (savedFrom) return setErr("Say who signs first. Then the new contract opens in the field placer.");
    setErr(null);
    setBusy("hand");
    const saved = await save();
    setBusy("");
    const who = signers.find((x) => x.key === (addFor ?? signers[0]?.key));
    if (saved) onManual(saved, undefined, kind && who ? { kind, email: who.email.trim() } : undefined);
  };

  /** A signature and a date field for a new signer, under the last field on the signing page. */
  const twoFields = (key: string): DocField[] => {
    const sig = fields.find((f) => f.kind === "signature" && f.signer === other?.key) ?? fields.find((f) => f.kind === "signature");
    const page = sig?.page ?? doc.pages.length - 1;
    const low = Math.max(0.6, ...fields.filter((f) => f.page === page).map((f) => f.y + f.h));
    const pg = doc.pages[page];
    const sw = Math.min(0.9, (FIELD_SIZE.signature.w * 612) / pg.w);
    const sh = Math.min(0.5, (FIELD_SIZE.signature.h * 792) / pg.h);
    const dw = Math.min(0.9, (FIELD_SIZE.date.w * 612) / pg.w);
    const dh = Math.min(0.5, (FIELD_SIZE.date.h * 792) / pg.h);
    const y = Math.min(1 - sh, low + 0.03);
    const x0 = sig ? sig.x : 0.12;
    const now = `${Date.now().toString(36)}${key.slice(-3)}`;
    return [
      { id: `f_s${now}`, page, kind: "signature", signer: key, required: true, x: Math.min(1 - sw, x0), y, w: sw, h: sh },
      { id: `f_d${now}`, page, kind: "date", signer: key, required: true, x: Math.min(1 - dw, x0 + sw + 0.02), y: Math.min(1 - dh, y + (sh - dh) / 2), w: dw, h: dh },
    ];
  };
  /** A second (or third) signer for their side, before the member. */
  const addSigner = () => {
    const key = `new_${Date.now().toString(36)}`;
    setSigners((ss) => {
      const at = ss.findIndex((x) => x.me);
      const n: Who = { key, name: "", email: "", title: "", me: false, party: other?.party ?? "", found: "A signature and a date field are placed for them. Move them on the fields step." };
      return at < 0 ? [...ss, n] : [...ss.slice(0, at), n, ...ss.slice(at)];
    });
    setFields((fs) => [...fs, ...twoFields(key)]);
    setEditing(key);
  };
  const removeSigner = (key: string) => {
    setSigners((ss) => ss.filter((x) => x.key !== key));
    setFields((fs) => fs.filter((f) => f.signer !== key));
    if (editing === key) setEditing(null);
  };
  const meToo = (on: boolean) => {
    if (on && meAside) {
      setSigners((ss) => [...ss, meAside.who]);
      setFields((fs) => [...fs, ...meAside.fields]);
      setMeAside(null);
    } else if (!on && me) {
      setMeAside({ who: me, fields: fields.filter((f) => f.signer === me.key) });
      setSigners((ss) => ss.filter((x) => !x.me));
      setFields((fs) => fs.filter((f) => f.signer !== me.key));
    } else if (on && !me && !demo) {
      // No place of theirs was found: they sign last, with a signature and a date under the others'.
      setSigners((ss) => [...ss, { key: "new_me", name: data.me.name, email: data.me.email, title: data.me.title, me: true, party: "", found: "" }]);
      setFields((fs) => [...fs, ...twoFields("new_me")]);
    }
  };

  const linkEnd = days ? short(Date.now() + days * DAY) : "";
  const nexts: [string, string][] = [["Now", `${otherFirst === "them" ? "They get" : `${otherFirst} gets`} an email with their own link, confirms their email with a 6 digit code, then types or draws a signature.`]];
  if (rem.d2) nexts.push([short(Date.now() + 2 * DAY), "A reminder, if it is not opened."]);
  if (rem.d7) nexts.push([short(Date.now() + 7 * DAY), "A reminder, if it is opened but not signed."]);
  if (days) nexts.push([linkEnd, `The link closes.${rem.expiry ? ` ${otherFirst === "them" ? "They are" : `${otherFirst} is`} warned 2 days before.` : ""}`]);
  nexts.push(["When signed", `${me ? "You countersign in one click. Then " : "Then "}Merlin seals the PDF and emails it to ${me || others.length > 1 ? "everyone" : "you both"}.`]);

  const planLine = demo
    ? `This is an example, so it goes to ${data.me.email} and no one else.${data.canSend ? " Sending is free on your trial." : ""}`
    : data.canSend
      ? "Sending is part of the Close plan, in your trial too. It never spends credits."
      : "Sending is on the Close plan. It never spends credits.";
  const pipeLine = demo
    ? "Cedar and Pine is a made-up company in this example. A real contract links to its company on Merlin."
    : company.id && company.name
      ? `Linked to ${company.name} on Merlin. Sending moves its deal in your pipeline to Proposal, and signing moves it to Won.`
      : company.name
        ? `${company.name} isn't linked to a company on Merlin, so your pipeline doesn't move with it.`
        : "Not linked to a company on Merlin, so your pipeline doesn't move with it.";
  const facts =
    start.kind === "read"
      ? [
          `Signature blocks found on ${start.reading.pages.length === 1 ? `page ${start.reading.pages[0] + 1}` : `${start.reading.pages.length} pages`}.`,
          ...signers.filter((x) => !x.me && x.found && !demo).map((x) => `${x.name || "Their signer"}: ${x.found}`),
          pipeLine,
        ]
      : savedMode
        ? ["A saved contract. Its fields are where you placed them last time.", pipeLine]
        : ["A draft you started. Its fields are as you left them.", pipeLine];

  const STEPS: [Step | "drop", string][] = [
    ["drop", "Drop the PDF"],
    ["fields", savedMode ? "Fields, placed already" : "Check the fields"],
    ["signers", "Who signs"],
    ["send", "Send"],
  ];
  const at = { fields: 1, signers: 2, send: 3, sent: 4 }[step];
  const sentLine = step === "sent" ? "sent" : "saved as a draft";

  const page = (
    <section className="ct-doc" aria-label={`The contract, ${shownPages.map((p) => `page ${p + 1}`).join(" and ")} of ${doc.pages.length}`}>
      <div className="ct-doc-top">
        <span>{doc.fileName}</span>
        <span>
          {shownPages.length === 1 ? `Page ${shownPages[0] + 1} of ${doc.pages.length}${pagesWith.length === 1 ? ", the only page with fields" : ""}` : `${shownPages.length} pages with fields`}
        </span>
      </div>
      <PdfPages
        src={`/api/documents/file?id=${encodeURIComponent(doc.id)}`}
        pages={doc.pages}
        only={shownPages}
        overlay={(pg) => (
          <div className="df-layer">
            {fields
              .filter((f) => f.page === pg)
              .map((f) => (
                <div key={f.id} className="df-field ct-field" data-who={whoOf(f.signer)?.me ? "me" : "them"} data-kind={f.kind} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
                  <span className="df-field-l">{f.kind === "checkbox" ? "" : fieldText(f)}</span>
                </div>
              ))}
          </div>
        )}
      />
      <div className="ct-legend">
        {others.length > 0 && (
          <span>
            <span className="ct-swatch" data-who="them" aria-hidden />
            {others.map((x, i) => firstOf(x.name) || (others.length > 1 ? `Signer ${i + 1}` : "Their signer")).join(" and ")} {others.length > 1 ? "fill these" : "fills these"}
          </span>
        )}
        {me && (
          <span>
            <span className="ct-swatch" data-who="me" aria-hidden />
            You fill these
          </span>
        )}
        {start.kind === "read" && (
          <span>
            <span className="ct-swatch" data-who="printed" aria-hidden />
            Printed already, no field
          </span>
        )}
      </div>
    </section>
  );

  return (
    <div className="ct-flow">
      <div className="ct-flowbar">
        <button type="button" className="btn ct-back" onClick={onHome}>
          All contracts
        </button>
        <div className="ct-flowt">
          <span className="ct-flowt-h">{title}</span>
          <span className="ct-flowt-s">
            {doc.fileName} · {doc.pages.length} {doc.pages.length === 1 ? "page" : "pages"} · {savedFrom ? "a saved contract" : sentLine}
          </span>
        </div>
        <ol className="ct-steps" aria-label="Steps">
          {STEPS.map(([k, label], i) => {
            const cur = i === at;
            const was = i < at;
            const can = k !== "drop" && step !== "sent" && i <= Math.max(at, 1);
            return (
              <li key={k}>
                <button
                  type="button"
                  className="ct-step"
                  data-cur={cur}
                  data-was={was}
                  aria-current={cur ? "step" : undefined}
                  disabled={k === "drop" ? step === "sent" : !can}
                  onClick={() => (k === "drop" ? onHome() : (setErr(null), setStep(k as Step)))}
                >
                  <span className="ct-step-n" aria-hidden>
                    {was ? <IconCheck size={12} /> : i + 1}
                  </span>
                  {label}
                </button>
              </li>
            );
          })}
        </ol>
      </div>

      {step === "sent" ? (
        <section className="ct-sent" role="status">
          <h2 className="ct-sent-h" ref={head} tabIndex={-1}>
            {demo ? "Sent to your own email" : `Sent to ${otherFirst === "them" ? "the first signer" : otherFirst} for signature`}
          </h2>
          <p className="ct-sent-s">
            {demo
              ? `Open the email and sign as ${otherFirst} would. Then come back here to see the signed copy and its seal.`
              : `${doc.company.id && doc.company.name ? `${doc.company.name} is in your pipeline at Proposal. ` : ""}You'll hear when ${otherFirst} opens it, and again when it's signed.${me && other ? ` You countersign right after ${otherFirst}.` : ""}`}
          </p>
          <ol className="ct-timeline" aria-label="What happens next">
            {nexts.map(([w, t]) => (
              <li key={w}>
                <span className="ct-time-w">{w}</span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <div className="ct-row">
            <button type="button" className="btn btn-pine btn-lg" onClick={() => onDone(doc)}>
              See it with your contracts
            </button>
            <button type="button" className="btn btn-lg" onClick={() => (toast("Ready for the next one."), onHome())}>
              Send another
            </button>
          </div>
        </section>
      ) : (
        <div className="ct-work">
          {page}
          <aside className="ct-panel" aria-labelledby="ct-panel-h">
            {step === "fields" && (
              <div className="ct-pane">
                <span className="ct-kicker">{savedMode ? "A saved contract · fields placed already" : start.kind === "read" ? `Merlin read your contract · ${doc.pages.length} ${doc.pages.length === 1 ? "page" : "pages"}` : "Your draft"}</span>
                <h2 id="ct-panel-h" className="ct-sr" ref={head} tabIndex={-1}>
                  Check the fields
                </h2>
                <label className="ct-label">
                  Title
                  <input className="input ct-input" value={title} maxLength={160} disabled={!!savedFrom} onChange={(e) => setTitle(e.target.value)} />
                </label>
                <div className="ct-placed">
                  <strong>
                    {fields.length} {fields.length === 1 ? "field" : "fields"} placed
                  </strong>
                  <span>{start.kind === "read" ? start.reading.summary : "Every one sits where it was placed. Change any of them by hand."}</span>
                </div>
                <ul className="ct-facts">
                  {facts.map((t) => (
                    <li key={t}>
                      <IconCheck size={14} /> {t}
                    </li>
                  ))}
                </ul>
                <ul className="ct-flist" aria-label="The fields">
                  {fields.map((f) => (
                    <li key={f.id}>
                      <span className="ct-swatch" data-who={whoOf(f.signer)?.me ? "me" : "them"} aria-hidden />
                      <strong>{fieldLine(f)}</strong>
                      <span className="ct-flist-s">
                        {nameOf(f.signer)} · page {f.page + 1}
                        {f.required ? " · required" : ""}
                      </span>
                      {!savedFrom && (
                        <button type="button" className="ct-x" aria-label={`Remove the ${fieldLine(f).toLowerCase()} field for ${nameOf(f.signer)}`} onClick={() => setFields((fs) => fs.filter((x) => x.id !== f.id))}>
                          <IconX size={14} />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                {!savedFrom && (
                  <div className="ct-hand">
                    <span className="ct-label-t">Adjust by hand: add a field for</span>
                    <div className="ct-pills" role="radiogroup" aria-label="Who fills it">
                      {signers.map((x) => (
                        <button key={x.key} type="button" role="radio" aria-checked={(addFor ?? signers[0]?.key) === x.key} className="ct-pill" data-on={(addFor ?? signers[0]?.key) === x.key} onClick={() => setAddFor(x.key)}>
                          {nameOf(x.key)}
                        </button>
                      ))}
                    </div>
                    <div className="ct-pills">
                      {(["signature", "initials", "date", "name", "text", "checkbox"] as FieldKind[]).map((k) => (
                        <button key={k} type="button" className="ct-pill ct-pill-add" disabled={!!busy} onClick={() => void byHand(k)}>
                          {FIELD_SAY[k]}
                        </button>
                      ))}
                    </div>
                    <span className="ct-note">The field placer opens with it ready: tap where it goes on the page, drag it to move, pull its corner to size it.</span>
                  </div>
                )}
                {err && (
                  <p className="pp-err" role="alert">
                    {err}
                  </p>
                )}
                <div className="ct-foot">
                  <span />
                  <button type="button" className="btn btn-pine btn-lg" onClick={toSigners}>
                    Next: who signs
                  </button>
                </div>
              </div>
            )}

            {step === "signers" && (
              <div className="ct-pane">
                <h2 id="ct-panel-h" className="ct-h2" ref={head} tabIndex={-1}>
                  Who signs
                </h2>
                <ol className="ct-who">
                  {others.map((x, i) => (
                    <li key={x.key} className="ct-signer">
                      <span className="ct-num" data-who="them">
                        {i + 1}
                      </span>
                      {editing === x.key ? (
                        <span className="ct-signer-edit">
                          <label className="ct-label">
                            {others.length > 1 ? `Name of signer ${i + 1}` : "Their name"}
                            <input className="input" autoComplete="off" value={x.name} onChange={(e) => setSigners(signers.map((y) => (y.key === x.key ? { ...y, name: e.target.value } : y)))} />
                          </label>
                          <label className="ct-label">
                            {others.length > 1 ? `Email of signer ${i + 1}` : "Their email"}
                            <input className="input" type="email" autoComplete="off" value={x.email} disabled={demo} onChange={(e) => setSigners(signers.map((y) => (y.key === x.key ? { ...y, email: e.target.value } : y)))} />
                          </label>
                          <label className="ct-label">
                            Their title
                            <input className="input" autoComplete="off" value={x.title} onChange={(e) => setSigners(signers.map((y) => (y.key === x.key ? { ...y, title: e.target.value } : y)))} />
                          </label>
                          {x.found && <span className="ct-note">{x.found}</span>}
                          <span className="ct-row">
                            {x.name.trim() && EMAIL_RE.test(x.email.trim()) && (
                              <button type="button" className="tp-flink" onClick={() => (setEditing(null), setErr(null))}>
                                Done
                              </button>
                            )}
                            {x.key.startsWith("new_") && (
                              <button type="button" className="tp-flink" onClick={() => removeSigner(x.key)}>
                                Remove this signer
                              </button>
                            )}
                          </span>
                        </span>
                      ) : (
                        <span className="ct-signer-main">
                          <strong>
                            {x.name}
                            {x.title ? `, ${x.title}` : ""}
                          </strong>
                          <span className="ct-email">{x.email}</span>
                          {x.found && <span className="ct-note">{x.found}</span>}
                          <button type="button" className="tp-flink ct-change" aria-label={`Change ${x.name || "this signer"}`} onClick={() => setEditing(x.key)}>
                            Change
                          </button>
                        </span>
                      )}
                    </li>
                  ))}
                  {me && (
                    <li className="ct-signer">
                      <span className="ct-num" data-who="me">
                        {others.length + 1}
                      </span>
                      <span className="ct-signer-main">
                        <strong>You, {me.name}</strong>
                        <span className="ct-note">You sign last. Your saved signature goes on in one click, and Merlin never signs for you.</span>
                      </span>
                    </li>
                  )}
                </ol>
                {!savedFrom && !demo && others.length < 3 && (
                  <button type="button" className="btn ct-addsigner" onClick={addSigner}>
                    Add another signer for their side
                  </button>
                )}
                {others.length > 1 && <Toggle label="Sign in this order" sub={ordered ? "Each one gets the link when the one before has signed." : "Everyone gets the link at once."} on={ordered} onChange={setOrdered} />}
                {!demo && (
                  <Toggle
                    label="I sign this too"
                    sub={me ? "You countersign last. Your fields are on the page." : "It says prepared and sent by you, with no signature from you."}
                    on={!!me}
                    onChange={meToo}
                  />
                )}
                {err && (
                  <p className="pp-err" role="alert">
                    {err}
                  </p>
                )}
                <div className="ct-foot">
                  {!savedFrom ? (
                    <button type="button" className="btn btn-lg" onClick={() => (setErr(null), setStep("fields"))}>
                      Back
                    </button>
                  ) : (
                    <span />
                  )}
                  <button type="button" className="btn btn-pine btn-lg" aria-busy={busy === "next"} disabled={!!busy} onClick={() => void toSend()}>
                    {busy === "next" ? "Saving" : "Next: message and send"}
                  </button>
                </div>
              </div>
            )}

            {step === "send" && (
              <div className="ct-pane">
                <h2 id="ct-panel-h" className="ct-sr" ref={head} tabIndex={-1}>
                  Message and send
                </h2>
                {other && (
                  <label className="ct-label">
                    Message to {otherFirst}
                    <textarea className="input ct-input" rows={4} maxLength={600} value={note} onChange={(e) => setMessage(e.target.value)} />
                    <span className="ct-note">{data.voice ? "Drafted by Merlin in your saved voice. Change any of it." : "Drafted by Merlin. Change any of it."}</span>
                  </label>
                )}
                {data.canSend && <LinkDaysPick value={days} onChange={setDays} />}
                {data.canSend && other && <SendReminders value={rem} onChange={setRem} noEnd={days === 0} disabled={busy === "send"} />}
                {data.canSend && other && me && mySig.loaded && (
                  <div className="ct-mysig" data-section="contract-signature">
                    <span className="ct-label-t">Your signature</span>
                    <span className="ct-note">{SIGN_LAST(otherFirst, !!mySig.sig)}</span>
                    <MySignature value={mySig.sig} name={mySig.name} title={mySig.title} onChange={setMySig} />
                  </div>
                )}
                {other && (
                  <span className="ct-note ct-alerts">
                    {AFTER_SEND(otherFirst)}{" "}
                    {onAlerts && (
                      <button type="button" className="tp-flink" onClick={onAlerts}>
                        Change alerts
                      </button>
                    )}
                  </span>
                )}
                {!demo && <Toggle label="Save to reuse" sub={keep ? "It goes to Saved contracts with these fields in place." : "Keep this PDF and its fields for the next client."} on={keep} onChange={setKeep} />}
                <p className="ct-cost">{planLine}</p>
                {!data.email && <span className="pp-warn">Email isn&#39;t set up on Merlin yet, so a contract can&#39;t go out for signature.</span>}
                {err && (
                  <p className="pp-err" role="alert">
                    {err}
                  </p>
                )}
                <div className="ct-foot">
                  <button type="button" className="btn btn-lg" onClick={() => (setErr(null), setStep("signers"))}>
                    Back
                  </button>
                  <button type="button" className="btn btn-pine btn-lg" aria-busy={busy === "send"} disabled={!!busy} onClick={() => void send()}>
                    {busy === "send" ? "Sending" : data.canSend ? "Send for signature" : "See the Close plan to send it"}
                  </button>
                </div>
              </div>
            )}
          </aside>
        </div>
      )}
    </div>
  );
}

/* ---------- the old look: Contracts inside Proposals ---------- */

export function ContractsHome({
  data,
  onBack,
  onManual,
  onSaved,
  onOpenDoc,
}: {
  data: ProposalsView;
  /** Back to where it was opened from, when it was (until Contracts has its own place in the nav). */
  onBack?: () => void;
  /** The field placer, for this document, with a line to show at its top. */
  onManual: (d: DocumentRec, notice?: string) => void;
  onSaved: (d: DocumentRec) => void;
  onOpenDoc: (d: DocumentRec) => void;
}) {
  // Opened: keyboard focus on the screen's heading, so a screen reader and Tab start here.
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus({ preventScroll: true }), []);
  const [busy, setBusy] = useState<string>("");
  const [drop, setDrop] = useState(false);
  const [flow, setFlow] = useState<FlowStart | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const smart = data.canBuild;

  const take = async (f: File | undefined, demo = false) => {
    if (!f) return;
    setErr(null);
    setBusy(demo ? "Making the example" : "Merlin is reading your contract");
    const r = await readUpload(f, smart, onSaved);
    setBusy("");
    if ("error" in r) return setErr(r.error);
    if ("manual" in r) return onManual(r.manual, r.notice);
    setFlow({ kind: "read", doc: r.doc, reading: r.reading, demo });
  };

  if (flow)
    return (
      <div className="page-wide pp-page cu-page">
        <ContractFlow data={data} start={flow} onSaved={onSaved} onManual={(d, n) => onManual(d, n)} onDone={onOpenDoc} onHome={() => setFlow(null)} />
      </div>
    );

  return (
    <div className="page-wide pp-page cu-page">
      {onBack && (
        <button type="button" className="page-back" onClick={onBack}>
          <IconChevron dir="left" /> Proposals
        </button>
      )}
      <header className="cu-head">
        <h1 className="cu-h1" ref={head} tabIndex={-1}>
          Send a contract for signature
        </h1>
        <p className="cu-lead">Drop in a contract you wrote anywhere. Merlin reads it, finds where everyone signs, and places the fields for you.</p>
      </header>

      <section
        className="cu-drop"
        data-on={drop}
        aria-busy={!!busy}
        onDragOver={(e) => (e.preventDefault(), setDrop(true))}
        onDragLeave={() => setDrop(false)}
        onDrop={(e) => (e.preventDefault(), setDrop(false), void take(e.dataTransfer.files?.[0]))}
      >
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 16V4" />
          <path d="M7 9l5-5 5 5" />
          <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
        </svg>
        {busy ? (
          <span className="cu-drop-t" role="status">
            {busy}
          </span>
        ) : (
          <>
            <span className="cu-drop-t">Drop your contract here</span>
            <span className="cu-drop-s">A PDF, up to 15 MB. From Word or Google Docs, save it as a PDF first.</span>
            <div className="cu-drop-btns">
              <button type="button" className="btn btn-lg" onClick={() => fileRef.current?.click()}>
                Choose a file
              </button>
              {smart && (
                <button type="button" className="btn btn-pine btn-lg" onClick={async () => void take(await starterFile("two-column", data.me.name), true)}>
                  Try it with an example
                </button>
              )}
            </div>
          </>
        )}
        <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
      </section>
      {!smart && <CloseBuildPrompt compact />}
      {err && (
        <p className="pp-err" role="alert">
          {err}
        </p>
      )}
      {data.documents.length > 0 && (
        <section aria-labelledby="ch-sent-h">
          <h2 className="ch-h2" id="ch-sent-h">
            Your contracts
          </h2>
          <ul className="pp-list ch-list" aria-label="Your contracts">
            {data.documents.map((d) => (
              <li key={d.id}>
                <button type="button" className="pp-row" onClick={() => onOpenDoc(d)}>
                  <span className="pp-row-main">
                    <span className="pp-row-t">{d.title}</span>
                    <span className="pp-row-s">
                      {d.company.name || d.fileName}
                      {d.signers.length ? ` · ${d.signers.filter((x) => x.status === "signed").length} of ${d.signers.length} signed` : ""} ·{" "}
                      {d.status === "draft" ? `Edited ${dayOf(d.updatedAt)}` : d.status === "signed" ? `Signed ${dayOf(d.completedAt)}` : `Sent ${dayOf(d.sentAt)}`}
                    </span>
                  </span>
                  <ProposalStatus status={d.status} />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
