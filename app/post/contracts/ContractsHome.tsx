"use client";

/**
 * Contracts: the home is a drop zone for a PDF and the contracts sent, with their status. Drop in
 * a contract written anywhere, and Merlin
 * reads it (lib/documents/smart.ts), finds where everyone signs and places the fields. The review
 * shows the page with each field over its line, coloured by who fills it, who signs in order and
 * where each was found, how many fields were placed, a note drafted in the member's voice, and
 * Send for signature. "Adjust fields by hand" opens the field placer (DocBuilder.tsx) with the
 * fields already there. When Merlin finds no signature lines, the field placer opens with a line
 * that says so.
 *
 * PDF only: Merlin has no way to turn a Word file into a PDF, so the drop zone says to save one
 * first. Placing the fields for you is Close (the trial included): without it, the upload opens
 * the field placer as before, with the Close prompt. A contract in the list opens in the field
 * placer (its fields, signers and audit trail). A page of its own: the left nav links it.
 */
import { useRef, useState } from "react";
import type { ProposalsView } from "@/lib/proposals/types";
import type { DocField, DocumentRec } from "@/lib/documents/types";
import type { SmartReading, SmartSigner } from "@/lib/documents/smart";
import { IconChevron, useToast } from "../../ui/shared";
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

type Step = "drop" | "busy" | "review" | "sent";
const first = (s: string) => s.trim().split(/\s+/)[0] || s;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i;

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
  const toast = useToast();
  const [step, setStep] = useState<Step>("drop");
  const [busy, setBusy] = useState<string>("");
  const [drop, setDrop] = useState(false);
  const [doc, setDoc] = useState<DocumentRec | null>(null);
  const [r, setR] = useState<SmartReading | null>(null);
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState<SmartSigner[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const smart = data.canBuild;
  // How long the links work, the reminders to whoever signs (lib/close), and the member's own saved signature for when they sign last.
  const [days, setDays] = useState<LinkDays>(30);
  const [rem, setRem] = useSendReminders(doc?.id, data.canSend);
  const [mySig, setMySig] = useMySignature();

  const take = async (f: File | undefined) => {
    if (!f) return;
    setErr(null);
    if (!/\.pdf$/i.test(f.name) && f.type !== "application/pdf") return setErr(/\.docx?$/i.test(f.name) ? "Merlin reads PDFs only. In Word or Google Docs: File, then Save as or Download, then PDF." : "That isn't a PDF. Save it as a PDF and drop that in.");
    setStep("busy");
    setBusy("Uploading it");
    const up = await uploadPdf(f);
    if ("error" in up) return setStep("drop"), setErr(up.error);
    onSaved(up);
    if (!smart) return onManual(up);
    setBusy("Merlin is reading your contract");
    const res = await dapi<{ document: DocumentRec; reading: SmartReading }>({ op: "read", id: up.id });
    if (res.error) return onManual(up, res.error);
    if (!res.reading.found) return onManual(up, NOTHING_FOUND);
    setDoc(res.document);
    setR(res.reading);
    setTitle(res.reading.title || res.document.title);
    setMessage(res.reading.message);
    setSigners(res.reading.signers);
    setEditing(res.reading.signers.find((x) => !x.me && (!x.name || !EMAIL_RE.test(x.email)))?.key ?? null);
    setStep("review");
  };
  const example = async () => {
    setStep("busy");
    setBusy("Making the example");
    const { makeSamplePdf, SAMPLE_NAME } = await import("@/lib/documents/samples");
    const bytes = await makeSamplePdf("two-column", { member: data.me.name });
    await take(new File([bytes as BlobPart], SAMPLE_NAME["two-column"], { type: "application/pdf" }));
  };

  /** Save what Merlin placed into the draft: the signers in order, the fields, the title and the note. */
  const save = async (): Promise<DocumentRec | null> => {
    if (!doc || !r) return null;
    const bad = signers.find((x) => !x.name.trim() || !EMAIL_RE.test(x.email.trim()));
    if (bad) {
      setEditing(bad.key);
      setErr(bad.me ? "Your own email is missing from your profile." : `Type the name and email of who signs for ${bad.party || "them"}.`);
      return null;
    }
    const res = await dapi<DocumentRec>({
      op: "update",
      id: doc.id,
      title,
      message,
      ordered: true,
      signers: signers.map((x) => ({ id: x.key, name: x.name.trim(), email: x.email.trim(), ...(x.title.trim() ? { title: x.title.trim() } : {}) })),
      fields: r.fields.map((f) => (f.kind === "text" && f.label === "Title" ? { ...f, prefill: signers.find((x) => x.key === f.signer)?.title || undefined } : f)),
      ...(r.company.id ? { companyId: r.company.id, companyName: r.company.name } : r.company.name ? { companyName: r.company.name } : {}),
    });
    if (res.error) return setErr(res.error), null;
    setDoc(res);
    onSaved(res);
    return res;
  };
  const send = async () => {
    setErr(null);
    if (!data.canSend) return openPlans("proposals");
    setSending(true);
    const saved = await save();
    if (!saved) return setSending(false);
    const off = await saveReminders(saved.id, rem);
    if (off) return setSending(false), setErr(off);
    const res = await dapi<{ document: DocumentRec; message: string }>({ op: "send", id: saved.id, message, linkDays: days });
    setSending(false);
    if (res.error) return setErr(res.error);
    setDoc(res.document);
    onSaved(res.document);
    setStep("sent");
  };
  const byHand = async () => {
    setErr(null);
    const saved = await save();
    if (saved) onManual(saved);
  };

  const other = signers.find((x) => !x.me) ?? null;
  const otherFirst = other ? first(other.name) || "them" : "them";
  const colorOf = (key: string) => (signers.find((x) => x.key === key)?.me ? "me" : "them");
  const fieldText = (f: DocField) => {
    const s = signers.find((x) => x.key === f.signer);
    const who = s?.me ? "You" : first(s?.name ?? "") || "Signer";
    if (f.kind === "signature") return `Signature · ${who}`;
    if (f.kind === "name") return s?.name || "Full name";
    if (f.kind === "date") return "Date signed";
    return s?.title || f.label || "Text";
  };

  return (
    <div className="page-wide pp-page cu-page">
      {onBack && (
        <button type="button" className="page-back" onClick={onBack}>
          <IconChevron dir="left" /> Proposals
        </button>
      )}
      <header className="cu-head">
        <h1 className="cu-h1">Send a contract for signature</h1>
        <p className="cu-lead">Drop in a contract you wrote anywhere. Merlin reads it, finds where everyone signs, and places the fields for you.</p>
      </header>

      {(step === "drop" || step === "busy") && (
        <section
          className="cu-drop"
          data-on={drop}
          aria-busy={step === "busy"}
          onDragOver={(e) => (e.preventDefault(), setDrop(true))}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => (e.preventDefault(), setDrop(false), void take(e.dataTransfer.files?.[0]))}
        >
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 16V4" />
            <path d="M7 9l5-5 5 5" />
            <path d="M4 16v3a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-3" />
          </svg>
          {step === "busy" ? (
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
                  <button type="button" className="btn btn-pine btn-lg" onClick={() => void example()}>
                    Try it with an example
                  </button>
                )}
              </div>
            </>
          )}
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" hidden onChange={(e) => (void take(e.target.files?.[0]), (e.target.value = ""))} />
        </section>
      )}
      {step === "drop" && !smart && <CloseBuildPrompt compact />}
      {step === "drop" && err && (
        <p className="pp-err" role="alert">
          {err}
        </p>
      )}
      {step === "drop" && data.documents.length > 0 && (
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

      {step === "review" && doc && r && (
        <div className="cu-review">
          <section className="cu-doc" aria-label={`The contract, ${r.pages.map((p) => `page ${p + 1}`).join(" and ")} of ${doc.pages.length}`}>
            <div className="cu-doc-top">
              <span>{doc.fileName}</span>
              <span>
                {r.pages.length === 1 ? `Page ${r.pages[0] + 1} of ${doc.pages.length}` : `${r.pages.length} pages with fields`} ·{" "}
                <button type="button" className="tp-flink" onClick={() => void byHand()}>
                  see all pages
                </button>
              </span>
            </div>
            <PdfPages
              src={`/api/documents/file?id=${encodeURIComponent(doc.id)}`}
              pages={doc.pages}
              only={r.pages}
              overlay={(page) => (
                <div className="df-layer">
                  {r.fields
                    .filter((f) => f.page === page)
                    .map((f) => (
                      <div key={f.id} className="df-field cu-field" data-who={colorOf(f.signer)} data-kind={f.kind} style={{ left: `${f.x * 100}%`, top: `${f.y * 100}%`, width: `${f.w * 100}%`, height: `${f.h * 100}%` }}>
                        <span className="df-field-l">{fieldText(f)}</span>
                      </div>
                    ))}
                </div>
              )}
            />
            <div className="cu-legend">
              {other && (
                <span>
                  <span className="cu-swatch" data-who="them" aria-hidden />
                  {otherFirst} fills this
                </span>
              )}
              {signers.some((x) => x.me) && (
                <span>
                  <span className="cu-swatch" data-who="me" aria-hidden />
                  You fill this
                </span>
              )}
              <span>To move a field or change who fills it, adjust the fields by hand.</span>
            </div>
          </section>

          <aside className="cu-side">
            <div className="cu-card">
              <span className="cu-kicker">Merlin read your contract</span>
              <label className="cu-label">
                Title
                <input className="input cu-input" value={title} maxLength={160} onChange={(e) => setTitle(e.target.value)} />
              </label>
              <div className="cu-who">
                <span className="cu-label-t">Who signs, in this order</span>
                {signers.map((x, i) => (
                  <div key={x.key} className="cu-signer">
                    <span className="cu-num" data-me={x.me}>
                      {i + 1}
                    </span>
                    {editing === x.key && !x.me ? (
                      <span className="cu-signer-edit">
                        <input className="input" aria-label="Their name" placeholder="Their name" value={x.name} onChange={(e) => setSigners(signers.map((y) => (y.key === x.key ? { ...y, name: e.target.value } : y)))} />
                        <input className="input" aria-label="Their email" type="email" placeholder="Their email" value={x.email} onChange={(e) => setSigners(signers.map((y) => (y.key === x.key ? { ...y, email: e.target.value } : y)))} />
                        <input className="input" aria-label="Their title" placeholder="Their title" value={x.title} onChange={(e) => setSigners(signers.map((y) => (y.key === x.key ? { ...y, title: e.target.value } : y)))} />
                        <span className="cu-found">{x.found}</span>
                        {x.name.trim() && EMAIL_RE.test(x.email.trim()) && (
                          <button type="button" className="tp-flink" onClick={() => setEditing(null)}>
                            Done
                          </button>
                        )}
                      </span>
                    ) : (
                      <span className="cu-signer-main">
                        <strong>{x.me ? `You, ${x.name}` : `${x.name}${x.title ? `, ${x.title}` : ""}`}</strong>
                        {!x.me && <span className="cu-email">{x.email}</span>}
                        <span className="cu-found">{x.found}</span>
                        {!x.me && (
                          <button type="button" className="tp-flink cu-change" onClick={() => setEditing(x.key)}>
                            Change
                          </button>
                        )}
                      </span>
                    )}
                  </div>
                ))}
                <button type="button" className="tp-flink cu-add" onClick={() => void byHand()}>
                  Add a signer
                </button>
              </div>
              <div className="cu-placed">
                <strong>
                  {r.count} {r.count === 1 ? "field" : "fields"} placed
                </strong>
                <span>{r.summary}</span>
              </div>
              {other && (
                <label className="cu-label">
                  Message to {otherFirst}
                  <textarea className="input cu-input" rows={3} maxLength={600} value={message} onChange={(e) => setMessage(e.target.value)} />
                </label>
              )}
              {data.canSend && <LinkDaysPick value={days} onChange={setDays} />}
              {data.canSend && other && <SendReminders value={rem} onChange={setRem} noEnd={days === 0} disabled={sending} />}
              {other && <span className="cu-muted">{AFTER_SEND(otherFirst)}</span>}
              {data.canSend && other && signers.some((x) => x.me) && mySig.loaded && (
                <div className="cu-mysig" data-section="contract-signature">
                  <span className="cu-label-t">Your signature</span>
                  <span className="cu-muted">{SIGN_LAST(otherFirst, !!mySig.sig)}</span>
                  <MySignature value={mySig.sig} name={mySig.name} title={mySig.title} onChange={setMySig} />
                </div>
              )}
              {!data.email && <span className="pp-warn">Email isn&#39;t set up on Merlin yet, so a contract can&#39;t go out for signature.</span>}
              {err && (
                <p className="pp-err" role="alert">
                  {err}
                </p>
              )}
              <button type="button" className="btn btn-pine btn-lg cu-send" aria-busy={sending} disabled={sending} onClick={() => void send()}>
                {sending ? "Sending" : data.canSend ? "Send for signature" : "See the Close plan to send it"}
              </button>
              <button type="button" className="btn btn-lg cu-hand" onClick={() => void byHand()}>
                Adjust fields by hand
              </button>
            </div>
          </aside>
        </div>
      )}

      {step === "sent" && doc && (
        <section className="cu-sent" role="status">
          <span className="cu-sent-t">Sent to {otherFirst === "them" ? "the first signer" : otherFirst} for signature</span>
          <span className="cu-sent-s">
            {doc.company.id && doc.company.name ? `${doc.company.name} is in your pipeline at Proposal. ` : ""}
            You&#39;ll hear when {otherFirst} opens it, and again when it&#39;s signed.
            {signers.some((x) => x.me) && other ? ` You countersign right after ${otherFirst}.` : ""}
          </span>
          <div className="cu-sent-btns">
            <button type="button" className="btn btn-lg cu-sent-go" onClick={() => onOpenDoc(doc)}>
              See its activity
            </button>
            <button type="button" className="btn btn-lg cu-sent-again" onClick={() => (setStep("drop"), setDoc(null), setR(null), setErr(null), toast("Ready for the next one."))}>
              Start over
            </button>
          </div>
        </section>
      )}

      {step === "review" && r && (
        <p className="cu-foot">
          No export, no titling, no dragging fields one by one. Merlin found {signers.length === 1 ? "the signer" : `${signers.length} signers`}, placed {r.count} fields and drafted the message.
        </p>
      )}
    </div>
  );
}
