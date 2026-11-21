"use client";

/**
 * Your writing voice (lib/voice.ts): the style the notes Merlin drafts are written in. A handful
 * of conclusions (greeting, sign-off, length, tone, contractions, exclamation marks, emoji, how
 * they open, a few stock phrases), never text from a message. It comes from the member's own
 * Claude, which reads their sent mail on its side and saves conclusions only (the connector's
 * save_my_voice), or from their own hand here. Merlin never reads email. Only the member sees it.
 *
 *   VoiceLine     the one quiet line under a drafted note: how to get a voice, or "In your voice"
 *                 with Edit and Remove.
 *   VoiceSection  Your profile's "Your writing voice": the saved fields, Edit and Remove.
 *   VoiceSheet    the fields, editable by hand (the "voice" action checks every value on the server).
 */
import { useContext, useState } from "react";
import type { Me } from "@/lib/tableTypes";
import {
  NEUTRAL_VOICE, VOICE_EXCLAMATIONS, VOICE_FORMALITY, VOICE_GREETINGS, VOICE_LENGTHS, VOICE_NAMES, VOICE_OPENERS, VOICE_PHRASES_MAX, VOICE_PHRASE_CHARS, VOICE_SIGNOFFS,
  greetingWords, phraseProblem, styleOf, voiceRows, type VoiceProfile, type VoiceStyle,
} from "@/lib/voice";
import "./moves.css";
import "./movenote.css";
import { IconCheck, timeAgo } from "../ui/shared";
import { Sheet, UiCtx } from "./ui";

/** Where a member's own Claude is set up (Integrations, at the Claude section). */
const CLAUDE_HREF = "/?p=claude";
const NEVER = "Merlin never reads your email.";

const fromWords = (v: VoiceProfile) => (v.by === "claude" ? "from your Claude" : "set by you");
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

function useVoiceActs() {
  const ui = useContext(UiCtx);
  const [busy, setBusy] = useState(false);
  const remove = async () => {
    if (!ui || busy) return;
    setBusy(true);
    await ui.act({ type: "voice", remove: true });
    setBusy(false);
  };
  return { ui, busy, remove };
}

/** Under a drafted note: one quiet line. */
export function VoiceLine({ me, onClaude }: { me: Me; onClaude?: () => void }) {
  const { busy, remove } = useVoiceActs();
  const [edit, setEdit] = useState(false);
  const v = me.voice ?? null;
  const how = onClaude ? (
    <button type="button" className="mv-link" onClick={onClaude}>
      How it works
    </button>
  ) : (
    <a className="mv-link" href={CLAUDE_HREF}>
      How it works
    </a>
  );
  return (
    <>
      {v ? (
        <p className="vo-line">
          <span className="vo-on">
            <IconCheck size={12} /> In your voice
          </span>
          <span className="vo-muted">· {fromWords(v)}</span>
          <button type="button" className="mv-link" onClick={() => setEdit(true)}>
            Edit
          </button>
          <button type="button" className="mv-link" disabled={busy} onClick={() => void remove()}>
            Remove
          </button>
        </p>
      ) : (
        <p className="vo-line vo-muted">
          <span>
            Want these in your voice? Your own Claude can learn it from your sent mail. {NEVER} {how}
            {" · "}
            <button type="button" className="mv-link" onClick={() => setEdit(true)}>
              Set it by hand
            </button>
          </span>
        </p>
      )}
      {edit && <VoiceSheet me={me} onClose={() => setEdit(false)} />}
    </>
  );
}

/** Your profile: "Your writing voice". */
export function VoiceSection() {
  const { ui, busy, remove } = useVoiceActs();
  const [edit, setEdit] = useState(false);
  if (!ui) return null;
  const me = ui.me;
  const v = me.voice ?? null;
  return (
    <div className="hunt-sub vo-sec" id="voice">
      <div className="hunt-h">Your writing voice</div>
      <p className="hunt-lead">
        The notes Merlin drafts for your moves are written this way. Style only, never the text of a message: your own Claude can summarise it from your sent mail, or set it by hand. {NEVER} Only you see this.
      </p>
      {v ? (
        <>
          <dl className="vo-dl">
            {voiceRows(v, me.name).map(([k, val]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{val}</dd>
              </div>
            ))}
          </dl>
          <p className="vo-muted vo-when">
            Saved {timeAgo(v.at)}, {fromWords(v)}.
          </p>
          <div className="vo-acts">
            <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>
              Edit
            </button>
            <button type="button" className="btn btn-sm btn-ghost" disabled={busy} aria-busy={busy} onClick={() => void remove()}>
              Remove
            </button>
          </div>
        </>
      ) : (
        <div className="vo-acts">
          <button type="button" className="btn btn-sm" onClick={() => setEdit(true)}>
            Set it by hand
          </button>
          <a className="mv-link" href={CLAUDE_HREF}>
            Let your Claude learn it
          </a>
        </div>
      )}
      {edit && <VoiceSheet me={me} onClose={() => setEdit(false)} />}
    </div>
  );
}

function Pick<T extends string | boolean>({ label, value, options, onChange }: { label: string; value: T; options: readonly (readonly [T, string])[]; onChange: (v: T) => void }) {
  return (
    <fieldset className="vo-q">
      <legend className="hunt-h">{label}</legend>
      <div className="hunt-chips" role="radiogroup" aria-label={label}>
        {options.map(([v, words]) => (
          <button key={String(v)} type="button" role="radio" aria-checked={value === v} className={`chip hunt-chip${value === v ? " chip-on" : ""}`} onClick={() => onChange(v)}>
            {value === v && <IconCheck size={11} />}
            {words}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** The fields, by hand. Saved with the "voice" action, which checks each one. */
export function VoiceSheet({ me, onClose }: { me: Me; onClose: () => void }) {
  const ui = useContext(UiCtx);
  const [v, setV] = useState<VoiceStyle>(() => styleOf(me.voice ?? { ...NEUTRAL_VOICE, signoff: "Best," }));
  const [phrases, setPhrases] = useState<string[]>(() => [...(me.voice?.phrases ?? [])]);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof VoiceStyle>(k: K, val: VoiceStyle[K]) => setV((x) => ({ ...x, [k]: val }));
  const clean = phrases.map((p) => p.trim()).filter(Boolean);
  const bad = clean.map((p) => phraseProblem(p)).find(Boolean) ?? null;
  const save = async () => {
    if (!ui || busy) return;
    if (bad) return setErr(`A phrase ${bad}. Keep each one short and your own: no names, addresses, links or numbers.`);
    setBusy(true);
    setErr(null);
    const r = await ui.act({ type: "voice", voice: { ...v, phrases: clean } }, { silentError: true });
    setBusy(false);
    if (!r.ok) return setErr(r.message);
    onClose();
  };
  return (
    <Sheet
      dialog
      className="vo-sheet"
      title="Your writing voice"
      onClose={onClose}
      footer={
        <div className="tp-sheet-actions">
          <button type="button" className="btn btn-pine btn-lg tp-grow" disabled={busy} aria-busy={busy} onClick={() => void save()}>
            {busy ? "Saving" : "Save"}
          </button>
        </div>
      }
    >
      <div className="vo-form">
        <p className="hunt-lead">How you write a short note. Merlin drafts your moves&apos; notes this way, and you still edit and send each one yourself.</p>
        <Pick label="Greeting" value={v.greeting} options={VOICE_GREETINGS.map((g) => [g, greetingWords(g)] as const)} onChange={(x) => set("greeting", x)} />
        <Pick label="Sign-off" value={v.signoff} options={VOICE_SIGNOFFS.map((s) => [s, s === "none" ? "None" : s] as const)} onChange={(x) => set("signoff", x)} />
        <Pick
          label="Signed with"
          value={v.name}
          options={VOICE_NAMES.map((n) => [n, n === "first" ? me.name.trim().split(/\s+/)[0] || "First name" : n === "full" ? me.name || "Full name" : "No name"] as const)}
          onChange={(x) => set("name", x)}
        />
        <Pick label="Length" value={v.length} options={VOICE_LENGTHS.map((l) => [l, l === "short" ? "Short · 3 sentences" : "Medium · 5 sentences"] as const)} onChange={(x) => set("length", x)} />
        <Pick label="Tone" value={v.formality} options={VOICE_FORMALITY.map((f) => [f, cap(f)] as const)} onChange={(x) => set("formality", x)} />
        <Pick
          label="Contractions"
          value={v.contractions}
          options={[
            [true, "I'd, it's"],
            [false, "I would, it is"],
          ]}
          onChange={(x) => set("contractions", x)}
        />
        <Pick label="Exclamation marks" value={v.exclamations} options={VOICE_EXCLAMATIONS.map((e) => [e, cap(e)] as const)} onChange={(x) => set("exclamations", x)} />
        <Pick
          label="Emoji"
          value={v.emoji}
          options={[
            [false, "No"],
            [true, "Yes"],
          ]}
          onChange={(x) => set("emoji", x)}
        />
        <Pick label="Opens with" value={v.opener} options={VOICE_OPENERS.map((o) => [o, o === "direct" ? "Straight to the point" : "A line of small talk"] as const)} onChange={(x) => set("opener", x)} />
        <fieldset className="vo-q">
          <legend className="hunt-h">Phrases you use</legend>
          <p className="hunt-lead vo-small">
            Up to {VOICE_PHRASES_MAX} short ones of your own, like “Hope you&apos;re well” or “No rush at all”. At most one goes into a note, where it fits. Never paste from a message.
          </p>
          <div className="vo-phrases">
            {Array.from({ length: Math.min(VOICE_PHRASES_MAX, Math.max(1, phrases.length + (phrases.every((p) => p.trim()) ? 1 : 0))) }, (_, k) => (
              <input
                key={k}
                className="input"
                value={phrases[k] ?? ""}
                maxLength={VOICE_PHRASE_CHARS}
                aria-label={`Phrase ${k + 1}`}
                placeholder={k === 0 ? "Hope you're well" : "Another phrase"}
                onChange={(e) => setPhrases((list) => Object.assign([...list, ...Array(Math.max(0, k + 1 - list.length)).fill("")], { [k]: e.target.value }))}
              />
            ))}
          </div>
        </fieldset>
        {err && (
          <p className="mn-warn" role="alert">
            {err}
          </p>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Integrations, the Claude section: how their own Claude learns it ---------- */

export const VOICE_PROMPT =
  "Read about 40 short emails I sent in the last few months and work out how I write: my greeting, my sign-off, how long my notes are, how formal I am, and a few phrases I use a lot. Show me the summary. When I say it's right, save my writing voice to Merlin. Don't send Merlin any email text, names or addresses.";

/** The prompt to copy, and what Merlin keeps. Shown to every member: it needs no Google connection on Merlin. */
export function VoicePrompt() {
  const ui = useContext(UiCtx);
  const [copied, setCopied] = useState(false);
  const [edit, setEdit] = useState(false);
  if (!ui) return null;
  const v = ui.me.voice ?? null;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(VOICE_PROMPT);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {}
  };
  return (
    <section className="tp-card in-card vo-card" id="claude-voice" aria-labelledby="vo-claude-h">
      <h3 className="tp-card-h" id="vo-claude-h">
        Teach Merlin your writing voice through your own Claude
      </h3>
      <p className="vo-body">
        Merlin drafts a short note for each of your moves. With Merlin and your mail both connected in your Claude, ask it to read what you&apos;ve sent. Claude reads your email on your side and saves only conclusions here: your greeting, sign-off, length, tone and a few stock phrases. {NEVER}
      </p>
      <blockquote className="vo-prompt">{VOICE_PROMPT}</blockquote>
      <div className="vo-acts">
        <button type="button" className="btn btn-primary" onClick={() => void copy()}>
          {copied ? "Copied. Paste it into Claude." : "Copy the prompt"}
        </button>
        <button type="button" className="btn" onClick={() => setEdit(true)}>
          {v ? "Edit your voice" : "Or set it by hand"}
        </button>
      </div>
      <p className="vo-muted vo-when">
        What Merlin keeps: those style settings and up to {VOICE_PHRASES_MAX} short phrases. Never a subject, a name, an address or a word of an email. Only you see it, and you can change or remove it in Your profile.
        {v ? ` Saved ${timeAgo(v.at)}, ${fromWords(v)}.` : ""}
      </p>
      {edit && <VoiceSheet me={ui.me} onClose={() => setEdit(false)} />}
    </section>
  );
}
