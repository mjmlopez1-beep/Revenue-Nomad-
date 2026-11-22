"use client";

/**
 * "Change it" beside a proposal (Proposals.tsx's editor): say or type what should be different,
 * and Merlin rewrites the sections that need it (lib/proposals/change.ts), checks the numbers
 * still agree, and shows the changed sections marked in sand with a line each. Accept all saves
 * it as a new version (the one before is kept: Compare versions, and bring it back); Undo drops it.
 *
 * The ideas come from the proposal and the lines kept from the call (lib/proposals/changeIdeas.ts).
 * The mic uses the browser's own speech recognition where there is one, and is hidden where there
 * isn't. Without drafting switched on for Merlin (ProposalsView.ai "off"), the panel says so in a
 * line and the sections stay editable as always.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type { ProposalRec, ProposalVersion, ProposalsView } from "@/lib/proposals/types";
import type { ChangeProposal } from "@/lib/proposals/changeShape";
import { changeIdeas, usualTerms } from "@/lib/proposals/changeIdeas";
import { fieldLabel, fill } from "@/lib/proposals/library";
import { DocText, dayOf } from "../sign/doc";
import { Sheet } from "./ui";
import { openPlans } from "./Billing";
import { api } from "./ProposalParts";
import { LiveView, useLive } from "./Live";

/** Said when asking isn't switched on (lib/proposals/change.ts CHANGE_OFF says the same). */
export const CHANGE_OFF_WORDS = "Asking Merlin to change it isn't switched on yet. You can edit any section directly.";
const CONSENT = "Merlin makes the change from this proposal, the lines you kept from the call and your request.";

type SpeechRec = { lang: string; interimResults: boolean; continuous: boolean; start: () => void; stop: () => void; onresult: ((e: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type SpeechCtor = new () => SpeechRec;

/** The browser's speech recognition, where it has one: talking adds to the text. */
export function useSpeech(onText: (t: string) => void) {
  const [can, setCan] = useState(false);
  const [on, setOn] = useState(false);
  const rec = useRef<SpeechRec | null>(null);
  const cb = useRef(onText);
  cb.current = onText;
  useEffect(() => {
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    setCan(!!(w.SpeechRecognition ?? w.webkitSpeechRecognition));
    return () => rec.current?.stop();
  }, []);
  const toggle = () => {
    if (on) return rec.current?.stop();
    const w = window as unknown as { SpeechRecognition?: SpeechCtor; webkitSpeechRecognition?: SpeechCtor };
    const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition;
    if (!Ctor) return;
    const r = new Ctor();
    r.lang = navigator.language || "en-US";
    r.interimResults = false;
    r.continuous = true;
    r.onresult = (e) => {
      let t = "";
      for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) t += e.results[i][0].transcript;
      if (t.trim()) cb.current(t.trim());
    };
    r.onend = () => setOn(false);
    r.onerror = () => setOn(false);
    rec.current = r;
    r.start();
    setOn(true);
  };
  return { can, on, toggle };
}

export function MicButton({ speech, label = "Talk instead of typing" }: { speech: ReturnType<typeof useSpeech>; label?: string }) {
  if (!speech.can) return null;
  return (
    <button type="button" className="ci-mic" aria-label={speech.on ? "Stop listening" : label} aria-pressed={speech.on} onClick={speech.toggle}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <rect x="9" y="3" width="6" height="11" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <path d="M12 18v3" />
      </svg>
    </button>
  );
}

const first = (s: string | undefined) => (s ?? "").trim().split(/\s+/)[0] ?? "";

export function ChangeItPanel({
  p,
  data,
  readOnly,
  preview,
  saved,
  onPreview,
  onAccepted,
}: {
  p: ProposalRec;
  data: ProposalsView;
  readOnly: boolean;
  preview: ChangeProposal | null;
  /** A change just accepted: version and how many sections. */
  saved: { version: number; previous: number; changed: number } | null;
  onPreview: (c: ChangeProposal | null) => void;
  onAccepted: (r: ProposalRec, saved: { version: number; previous: number; changed: number }) => void;
}) {
  const [text, setText] = useState("");
  const [more, setMore] = useState("");
  const [busy, setBusy] = useState<"ask" | "accept" | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const speech = useSpeech((t) => (preview || saved ? setMore((x) => `${x} ${t}`.trim()) : setText((x) => `${x} ${t}`.trim())));
  const others = data.proposals.filter((x) => x.id !== p.id);
  const ideas = useMemo(() => changeIdeas(p, usualTerms(others)), [p, others]);
  const signer = first(p.signer?.name || p.fields["client.signerName"]);
  const live = useLive();

  const ask = async (instruction: string) => {
    if (!instruction.trim()) return setErr("Say what you want different, in a sentence.");
    setErr(null);
    setBusy("ask");
    // Live: the sections Merlin is rewriting show as it writes them, and the numbers check (Live.tsx).
    const end = await live.start({ op: "change", id: p.id, instruction: instruction.trim(), agree: true });
    setBusy(null);
    live.reset();
    if (!end.ok) return end.status === 499 ? undefined : setErr(end.message);
    const r = end.result as ChangeProposal;
    if (r.unclear && !r.changes.length) return setErr(r.unclear);
    setMore("");
    onPreview(r);
  };
  const accept = async () => {
    if (!preview) return;
    setBusy("accept");
    const r = await api<{ proposal: ProposalRec; saved: { version: number; previous: number; changed: number } }>({ op: "change_accept", id: p.id, rev: p.rev, changes: preview.changes, fields: preview.fields, instruction: preview.instruction });
    setBusy(null);
    if (r.error) return setErr(r.error);
    setText("");
    onAccepted(r.proposal, r.saved);
  };

  const head = (
    <div className="ci-head">
      <span className="ci-t">Change it</span>
      <span className="ci-s">Say what you want different. Merlin rewrites the sections, keeps your wording style and checks the numbers add up.</span>
    </div>
  );
  if (data.ai === "off")
    return (
      <section className="ci-card" aria-label="Change it" data-off>
        {head}
        <p className="ci-note">{CHANGE_OFF_WORDS}</p>
      </section>
    );
  if (data.ai === "plan")
    return (
      <section className="ci-card" aria-label="Change it">
        {head}
        <p className="ci-note">Changing it by asking is on Close. You can edit any section directly.</p>
        <button type="button" className="btn btn-sm" onClick={() => openPlans("proposals")}>
          See the Close plan
        </button>
      </section>
    );
  if (readOnly && !preview)
    return (
      <section className="ci-card" aria-label="Change it">
        {head}
        <p className="ci-note">{p.status === "signed" || p.status === "client_signed" ? "It's signed, so it stays as it was signed." : "It's out for signature. Press Change it above the document to make a new version first."}</p>
      </section>
    );
  if (data.aiUsedUp && !preview)
    return (
      <section className="ci-card" aria-label="Change it">
        {head}
        <p className="ci-note">{data.aiUsedUp.words}</p>
        <a className="btn btn-sm" href={data.aiUsedUp.pack}>
          {data.aiUsedUp.button}
        </a>
      </section>
    );

  if (preview)
    return (
      <section className="ci-card" aria-label="Change it">
        {head}
        <div className="ci-asked">{preview.instruction}</div>
        <div className="ci-done">
          <span className="ci-done-t">
            Done. {preview.changes.length} {preview.changes.length === 1 ? "section" : "sections"} changed{preview.changes.length ? ":" : "."}
          </span>
          {preview.changes.map((c) => (
            <div key={c.id + c.title} className="ci-sum">
              <span className="ci-dot" aria-hidden />
              <span>
                <strong>{c.title}</strong> {c.summary}
              </span>
            </div>
          ))}
          <div className="ci-check" data-ok={preview.check.ok}>
            {preview.check.line}
          </div>
        </div>
        {err && <p className="pp-err">{err}</p>}
        <div className="ci-btns">
          <button type="button" className="btn btn-pine btn-lg" aria-busy={busy === "accept"} disabled={!!busy} onClick={() => void accept()}>
            {busy === "accept" ? "Saving" : "Accept all"}
          </button>
          <button type="button" className="btn btn-lg" disabled={!!busy} onClick={() => (onPreview(null), setErr(null))}>
            Undo
          </button>
        </div>
        <form className="ci-more" onSubmit={(e) => (e.preventDefault(), void ask(`${preview.instruction} Also: ${more}`))}>
          <label className="ci-label" htmlFor="ci-more">
            Anything else?
          </label>
          <span className="ci-row">
            <input id="ci-more" className="input" value={more} placeholder="Like: make the opt-in date day 40, not day 45" onChange={(e) => setMore(e.target.value)} disabled={!!busy} />
            <MicButton speech={speech} />
          </span>
          {live.state.status === "running" && <LiveView compact state={live.state} title="Making the change" onCancel={() => void live.cancel()} />}
        </form>
      </section>
    );

  return (
    <section className="ci-card" aria-label="Change it">
      {head}
      {saved && (
        <p className="ci-saved">
          Saved as version {saved.version}. {signer ? `When you send it, ${signer} sees one clean proposal.` : "When you send it, they see one clean proposal."}
        </p>
      )}
      {ideas.length > 0 && (
        <div className="ci-ideas">
          <span className="ci-label">{p.notes.length && signer ? `Ideas from your call with ${signer}` : "Ideas"}</span>
          <div className="ci-chips">
            {ideas.map((c) => (
              <button key={c.label} type="button" className="ci-chip" disabled={!!busy} onClick={() => (setText(c.instruction), void ask(c.instruction))}>
                {c.label}
              </button>
            ))}
          </div>
        </div>
      )}
      <label className="ci-label" htmlFor="ci-ask">
        {saved ? "Change something else" : "Or say it your way"}
      </label>
      <textarea id="ci-ask" className="input ci-ask" rows={4} value={text} placeholder="Like: make it two phases, a 45-day assessment at a fixed fee, then the ongoing role if they opt in" onChange={(e) => setText(e.target.value)} disabled={!!busy} />
      {live.state.status === "running" && <LiveView compact state={live.state} title="Making the change" onCancel={() => void live.cancel()} />}
      {err && <p className="pp-err">{err}</p>}
      <div className="ci-row">
        <MicButton speech={speech} />
        <button type="button" className="btn btn-pine btn-lg ci-go" aria-busy={busy === "ask"} disabled={!!busy || !text.trim()} onClick={() => void ask(text)}>
          {busy === "ask" ? "Making the change" : "Make the change"}
        </button>
      </div>
      <span className="ci-hint">{speech.can ? "Tap the mic to talk instead of typing. " : ""}Nothing changes until you accept it.</span>
      {!data.aiAgreed && <span className="ci-hint">{CONSENT}</span>}
    </section>
  );
}

/** Compare versions: each kept version beside the one now, section by section, and bring one back. */
export function VersionsSheet({ p, onClose, onRestored }: { p: ProposalRec; onClose: () => void; onRestored: (r: ProposalRec) => void }) {
  const [list, setList] = useState<ProposalVersion[] | null>(null);
  const [cur, setCur] = useState<ProposalRec | null>(null);
  const [pick, setPick] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ current: ProposalRec; versions: ProposalVersion[] }>({ op: "versions", id: p.id }).then((r) => {
      if (r.error) return setErr(r.error);
      setList(r.versions);
      setCur(r.current);
      setPick(r.versions[0]?.version ?? null);
    });
  }, [p.id]);
  const v = list?.find((x) => x.version === pick) ?? null;
  const rows = useMemo(() => {
    if (!v || !cur) return [];
    const was = v.blocks.map((b) => ({ key: b.id, title: b.title, text: fill(b.body, v.fields) }));
    const now = cur.blocks.map((b) => ({ key: b.id, title: b.title, text: fill(b.body, cur.fields) }));
    const keys = [...new Set([...was.map((x) => x.key), ...now.map((x) => x.key)])];
    return keys.map((k) => ({ was: was.find((x) => x.key === k) ?? null, now: now.find((x) => x.key === k) ?? null })).filter((r) => r.was?.text !== r.now?.text || r.was?.title !== r.now?.title);
  }, [v, cur]);
  const restore = async () => {
    if (!v) return;
    setBusy(true);
    const r = await api<ProposalRec>({ op: "version_restore", id: p.id, version: v.version, rev: p.rev });
    setBusy(false);
    if (r.error) return setErr(r.error);
    onRestored(r);
  };
  return (
    <Sheet
      title="Compare versions"
      onClose={onClose}
      dialog
      className="pp-start"
      footer={
        v && p.status !== "signed" && p.status !== "client_signed" ? (
          <button type="button" className="btn btn-pine btn-lg pp-wide" aria-busy={busy} disabled={busy} onClick={() => void restore()}>
            {busy ? "Bringing it back" : `Bring back version ${v.version}`}
          </button>
        ) : undefined
      }
    >
      <div className="pp-start-body ci-versions">
        {err && <p className="pp-err">{err}</p>}
        {!list && !err && <div className="pp-skel" aria-busy="true" />}
        {list && list.length === 0 && <p className="pp-muted">No earlier versions yet. Each change you accept keeps the one before here.</p>}
        {list && list.length > 0 && (
          <div className="ci-vpick" role="radiogroup" aria-label="Version">
            {list.map((x) => (
              <button key={x.version} type="button" role="radio" aria-checked={pick === x.version} className="pp-tplchip" data-on={pick === x.version} onClick={() => setPick(x.version)}>
                <span className="pp-tplchip-t">Version {x.version}</span>
                <span className="pp-muted">{dayOf(x.at)}</span>
              </button>
            ))}
          </div>
        )}
        {v && <p className="pp-help">What changed after version {v.version}: {v.note}</p>}
        {v && rows.length === 0 && <p className="pp-muted">It reads the same as version {cur?.version}.</p>}
        {rows.map((r, i) => (
          <div key={i} className="ci-diff">
            <h3 className="pp-h2">{r.now?.title ?? r.was?.title}</h3>
            <div className="ci-diff-cols">
              <div className="ci-was">
                <span className="ci-label">Version {v?.version}</span>
                <div className="sg-text">{r.was ? <DocText text={r.was.text} blanks label={fieldLabel} /> : <p className="pp-muted">Not in this version.</p>}</div>
              </div>
              <div className="ci-now">
                <span className="ci-label">Now, version {cur?.version}</span>
                <div className="sg-text">{r.now ? <DocText text={r.now.text} blanks label={fieldLabel} /> : <p className="pp-muted">Taken out.</p>}</div>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  );
}
