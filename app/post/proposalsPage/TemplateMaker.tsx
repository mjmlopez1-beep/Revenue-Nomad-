"use client";

/**
 * Make a template (Proposals.dc.html's builder): three steps and a preview that follows every
 * choice. Each step is backed by what Merlin already keeps:
 *
 *   1. Pick an example   one of the five in the library (lib/proposals/templates.json)
 *   2. Set your voice    greeting, tone and length, saved as the member's writing voice (the
 *                        "voice" action, lib/voice.ts): drafts and follow-up notes use it
 *   3. Add your signature  the saved signature (MySignature.tsx: typed or drawn, the consent box
 *                        unticked until they tick it). How they sign is picked on each proposal as it goes.
 *
 * Save writes the example as a template of their own: the same Markdown an upload reads into
 * sections (model.ts templateMarkdown, POST /api/proposals/template), named as they choose. It costs
 * no credits and none of the Merlin allowance. Editing one of theirs renames it and saves the voice.
 */
import { useEffect, useMemo, useState } from "react";
import type { TemplateChoice } from "@/lib/proposals/types";
import { styleOf, type VoiceFormality, type VoiceGreeting, type VoiceLength } from "@/lib/voice";
import { useAppMaybe } from "../shell/pages";
import { uploadTemplate } from "../ProposalStart";
import { api } from "../ProposalParts";
import { MySignature, useMySignature } from "../MySignature";
import { BUILT_FROM, GREETINGS, LENGTHS, LIBRARY, TONES, openingLine, previewSections, templateMarkdown } from "./model";
import { IconCheck } from "../../ui/shared";

export interface MakerStart {
  /** The library example to start from (its index in LIBRARY). */
  ex: number;
  /** The step to open at: 0 pick, 1 voice, 2 signature. */
  step: 0 | 1 | 2;
  /** One of their own templates, to rename (and set the voice for). */
  edit?: { id: string; title: string };
}

const STEPS = ["Pick an example", "Set your voice", "Add your signature"];

export function TemplateMaker({ start, first, onSaved, onUse, onAnother }: { start: MakerStart; first: boolean; onSaved: (t: TemplateChoice) => void; onUse: (id: string) => void; onAnother: () => void }) {
  const c = useAppMaybe();
  const voice0 = styleOf(c?.me.voice);
  const [step, setStep] = useState<0 | 1 | 2>(start.edit ? Math.max(1, start.step) as 1 | 2 : start.step);
  const [ex, setEx] = useState(start.ex);
  const lib = LIBRARY[ex] ?? LIBRARY[0];
  const [name, setName] = useState(start.edit?.title ?? `${lib.short}, in your voice`);
  const [named, setNamed] = useState(!!start.edit);
  useEffect(() => {
    if (!named) setName(`${lib.short}, in your voice`);
  }, [lib.short, named]);
  const [greeting, setGreeting] = useState(Math.max(0, GREETINGS.indexOf(voice0.greeting as (typeof GREETINGS)[number])));
  const [tone, setTone] = useState(Math.max(0, TONES.findIndex((t) => t.key === voice0.formality)));
  const [length, setLength] = useState(Math.max(0, LENGTHS.findIndex((l) => l.key === voice0.length)));
  const [sig, setSig] = useMySignature();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [saved, setSaved] = useState<TemplateChoice | null>(null);
  const secs = useMemo(() => previewSections(lib.id), [lib.id]);

  const save = async () => {
    setBusy(true);
    setErr(null);
    // The voice: what they picked here, the rest of a saved voice kept as it was.
    if (c) {
      const v = { ...voice0, greeting: GREETINGS[greeting] as VoiceGreeting, formality: TONES[tone].key as VoiceFormality, length: LENGTHS[length].key as VoiceLength };
      const changed = v.greeting !== voice0.greeting || v.formality !== voice0.formality || v.length !== voice0.length || !c.me.voice;
      if (changed) await c.act({ type: "voice", voice: v }, { silentError: true });
    }
    if (start.edit) {
      const r = await api<{ id: string; title: string }>({ op: "template_rename", id: start.edit.id, title: name });
      setBusy(false);
      if (r.error) return setErr(r.error);
      const t: TemplateChoice = { id: start.edit.id, title: r.title ?? name, about: "", mine: true, open: true, sections: 0 };
      setSaved(t);
      return onSaved(t);
    }
    const md = templateMarkdown(lib.id, name);
    const r = await uploadTemplate(new File([md], BUILT_FROM, { type: "text/markdown" }));
    setBusy(false);
    if (r.error || !r.id) return setErr(r.error ?? "That didn't save. Try again.");
    const t: TemplateChoice = { id: r.id, title: r.title ?? name, about: BUILT_FROM, mine: true, open: true, sections: r.blocks?.length ?? lib.sections };
    setSaved(t);
    onSaved(t);
  };

  const chip = (on: boolean, label: string, pick: () => void) => (
    <button key={label} type="button" className="pz-chip" aria-pressed={on} onClick={pick}>
      {label}
    </button>
  );
  const sigName = sig.sig?.typed ?? sig.name;

  return (
    <div className="pz-make">
      <div className="pz-make-main">
        {saved ? (
          <div className="pz-saved" role="status">
            <strong>
              <IconCheck size={14} /> Saved to My templates: {saved.title}
            </strong>
            <span>Every proposal you start from it opens in this structure, in your voice. Only you see it.</span>
            <span className="pz-go">
              <button type="button" className="btn btn-pine" onClick={() => onUse(saved.id)}>
                Start a proposal from it
              </button>
              <button type="button" className="btn" onClick={() => (setSaved(null), setStep(0), setNamed(false), onAnother())}>
                Make another
              </button>
            </span>
          </div>
        ) : (
          <>
            <div className="pz-tabs" role="tablist" aria-label="Steps to make a template">
              {STEPS.map((s, i) => (
                <button key={s} type="button" role="tab" aria-selected={step === i} disabled={!!start.edit && i === 0} onClick={() => setStep(i as 0 | 1 | 2)}>
                  {i + 1}. {s}
                </button>
              ))}
            </div>
            {step === 0 && (
              <div className="pz-radios" role="radiogroup" aria-label="Examples from the library">
                {LIBRARY.map((l, i) => (
                  <button key={l.id} type="button" role="radio" aria-checked={ex === i} className="pz-radio" onClick={() => setEx(i)}>
                    <span className="pz-dot" aria-hidden />
                    <span className="pz-radio-t">
                      <strong>{l.title}</strong>
                      <span>
                        {l.sections} sections · {l.about}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
            )}
            {step === 1 && (
              <div className="pz-voice">
                <div role="group" aria-label="Greeting" className="pz-vrow">
                  <span className="pz-k">Greeting</span>
                  {GREETINGS.map((g, i) => chip(greeting === i, g.replace("{first}", "Dana"), () => setGreeting(i)))}
                </div>
                <div role="group" aria-label="Tone" className="pz-vrow">
                  <span className="pz-k">Tone</span>
                  {TONES.map((t, i) => chip(tone === i, t.label, () => setTone(i)))}
                </div>
                <div role="group" aria-label="Length" className="pz-vrow">
                  <span className="pz-k">Length</span>
                  {LENGTHS.map((l, i) => chip(length === i, l.label, () => setLength(i)))}
                </div>
              </div>
            )}
            {step === 2 && (sig.loaded ? <MySignature value={sig.sig} name={sig.name} title={sig.title} onChange={setSig} /> : <div className="pp-skel" aria-busy="true" />)}
            <label className="pz-name">
              <span className="pz-k">Name your template</span>
              <input className="input" maxLength={120} value={name} onChange={(e) => (setName(e.target.value), setNamed(true))} />
            </label>
            <span className="pz-note">
              {step === 0
                ? "Have a proposal you already like? Upload it under My templates instead, and Merlin reads its sections."
                : step === 1
                  ? "Merlin writes your drafts and follow-up notes in this voice. An agent you connect can read your sent mail on its side and save your style here. Merlin never reads your email."
                  : "Applying your saved signature is signing electronically, with the same effect as signing by hand. On each proposal you pick as you send it: add it as it goes, countersign after they sign, or no signature."}{" "}
              {step === 1 && c?.ui2 && (
                <a href={c.hrefOf("agent")} onClick={(e) => (e.preventDefault(), c.openPage("agent"))}>
                  Agent access
                </a>
              )}
            </span>
            {err && <p className="pp-err">{err}</p>}
            <div className="pz-go">
              {step > 0 && !(start.edit && step === 1) && (
                <button type="button" className="btn" onClick={() => setStep((step - 1) as 0 | 1)}>
                  Back
                </button>
              )}
              {step < 2 && (
                <button type="button" className="btn btn-pine" onClick={() => setStep((step + 1) as 1 | 2)}>
                  {step === 0 ? "Next: your voice" : "Next: your signature"}
                </button>
              )}
              {(step === 2 || start.edit) && (
                <button type="button" className="btn btn-pine" aria-busy={busy} disabled={busy || !name.trim()} onClick={() => void save()}>
                  {busy ? "Saving" : "Save template"}
                </button>
              )}
              <span className="pz-note">Free. Making a template uses no credits and none of your Merlin allowance.</span>
            </div>
          </>
        )}
      </div>
      <div className="pz-preview" role="group" aria-label="Preview of the template">
        <span className="pz-k">Preview · as your client reads it</span>
        <strong className="pz-pv-t">{name.trim() || lib.title}</strong>
        <span className="pz-pv-open">
          {openingLine(GREETINGS[greeting], tone)}
          {length > 0 ? " The first 90 days are laid out week by week." : ""}
        </span>
        {secs.map((x) => (
          <div key={x.title} className="pz-pv-sec">
            <strong>{x.title}</strong>
            <span data-from={x.from.startsWith("Evidence") ? "empty" : x.from.startsWith("Your") ? "kept" : undefined}>{x.from}</span>
          </div>
        ))}
        <div className="pz-pv-sig">
          {sig.sig ? <span className="pz-pv-name">{sigName}</span> : <span className="pz-pv-line" aria-hidden />}
          <span className="pz-note">
            {sig.sig ? `${sig.name}${sig.title ? `, ${sig.title}` : ""}. Your saved signature, ready to add.` : "Your signature goes here once you save one."} {lib.sections} sections in all, {secs.length} shown.
          </span>
        </div>
        {first && <span className="pz-note">Proof fills from your Evidence Bank cases, the closest to each client. With none ready it stays empty: Merlin never writes a case.</span>}
      </div>
    </div>
  );
}
