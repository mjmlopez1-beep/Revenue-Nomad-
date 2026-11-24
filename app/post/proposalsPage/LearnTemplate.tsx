"use client";

/**
 * "Make a template from a proposal I've used" (RN_PROPOSALS2): the member picks a proposal they sent
 * (a PDF, a deck too) and, if they like, its agreement. Merlin reads the structure, the headings and
 * the voice (lib/proposals/learn.ts), shows what it learned, and the member edits it before saving
 * it as their own template. Theirs alone; the files aren't kept.
 */
import { useState } from "react";
import type { LearnedSection, LearnedTemplate } from "@/lib/proposals/learn";
import type { MyTemplate } from "@/lib/proposals/types";
import { Sheet } from "../ui";
import { errorText } from "../../ui/shared";
import { api } from "../ProposalParts";
import "./p2.css";

const toB64 = (f: File) =>
  new Promise<string>((done, fail) => {
    const r = new FileReader();
    r.onload = () => done(String(r.result).replace(/^data:[^,]*,/, ""));
    r.onerror = () => fail(r.error);
    r.readAsDataURL(f);
  });

function Sections({ label, xs, onChange }: { label: string; xs: LearnedSection[]; onChange: (xs: LearnedSection[]) => void }) {
  if (!xs.length) return null;
  const set = (i: number, patch: Partial<LearnedSection>) => onChange(xs.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  return (
    <div className="p2-learn-secs">
      <h3 className="p2-k">{label}</h3>
      <ol>
        {xs.map((x, i) => (
          <li key={i}>
            <input className="input" aria-label={`Section ${i + 1} heading`} value={x.title} onChange={(e) => set(i, { title: e.target.value })} />
            {x.purpose && <p className="p2-muted">{x.purpose}</p>}
            <textarea className="input" rows={3} aria-label={`Section ${i + 1} starter text`} value={x.body} onChange={(e) => set(i, { body: e.target.value })} />
            <button type="button" className="tp-flink" onClick={() => onChange(xs.filter((_, j) => j !== i))}>
              Remove
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function LearnTemplate({ onClose, onSaved }: { onClose: () => void; onSaved: (t: MyTemplate[]) => void }) {
  const [proposal, setProposal] = useState<File | null>(null);
  const [agreement, setAgreement] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [got, setGot] = useState<LearnedTemplate | null>(null);
  const read = async () => {
    if (!proposal) return;
    setBusy(true);
    setErr(null);
    try {
      const files = await Promise.all([proposal, agreement].filter((f): f is File => !!f).map(async (f) => ({ name: f.name, data: await toB64(f) })));
      const r = await fetch("/api/proposals/template?learn=1", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ files, agree: true }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) setErr(errorText(r.status, j.error, "Merlin couldn't read that file. Try again."));
      else setGot(j as LearnedTemplate);
    } catch {
      setErr("We couldn't reach Merlin. Check your connection and try again.");
    }
    setBusy(false);
  };
  const save = async () => {
    if (!got) return;
    setBusy(true);
    const r = await api<{ templates: MyTemplate[] }>({ op: "template_learned_save", title: got.title, sections: got.sections, agreement: got.agreement, voice: got.voice, files: got.files });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onSaved(r.templates);
  };
  return (
    <Sheet
      title="Make a template from a proposal you've used"
      onClose={onClose}
      dialog
      className="p2-learn"
      footer={
        got ? (
          <button type="button" className="btn btn-pine btn-lg" disabled={busy || !got.sections.length} onClick={() => void save()}>
            {busy ? "Saving" : "Save as my template"}
          </button>
        ) : (
          <button type="button" className="btn btn-pine btn-lg" aria-busy={busy} disabled={busy || !proposal} onClick={() => void read()}>
            {busy ? "Reading it" : "Read it"}
          </button>
        )
      }
    >
      {!got ? (
        <>
          <p className="p2-muted">Merlin reads how it&#39;s built: the sections in order, how you write headings, your voice. It takes the old client out. You check it before it&#39;s saved.</p>
          <label className="p2-note">
            <span>The proposal you sent (PDF or Word)</span>
            <input type="file" accept=".pdf,.docx,.md,.txt" onChange={(e) => setProposal(e.target.files?.[0] ?? null)} />
          </label>
          <label className="p2-note">
            <span>Its agreement, if you have one (optional)</span>
            <input type="file" accept=".pdf,.docx,.md,.txt" onChange={(e) => setAgreement(e.target.files?.[0] ?? null)} />
          </label>
          <p className="p2-muted">The files are read once and not kept. The template is yours alone: never shown to another member or used for anyone else.</p>
        </>
      ) : (
        <>
          {got.note && <p className="pp-err">{got.note}</p>}
          <label className="p2-note">
            <span>Template name</span>
            <input className="input" value={got.title} onChange={(e) => setGot({ ...got, title: e.target.value })} />
          </label>
          {got.by === "ai" && (got.voice.tone || got.voice.headings) && (
            <p className="p2-muted" data-voice>
              Your voice: {[got.voice.tone, got.voice.headings, got.voice.length].filter(Boolean).join(". ")}
            </p>
          )}
          <Sections label={`The proposal: ${got.sections.length} sections`} xs={got.sections} onChange={(xs) => setGot({ ...got, sections: xs })} />
          <Sections label={`The agreement: ${got.agreement.length} sections`} xs={got.agreement} onChange={(xs) => setGot({ ...got, agreement: xs })} />
        </>
      )}
      {err && (
        <p className="pp-err" role="alert">
          {err}
        </p>
      )}
    </Sheet>
  );
}
