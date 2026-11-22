"use client";

/**
 * "New proposal from a call": the one way in to Proposals, as short as asking Claude. Pick the
 * company, paste or drop the transcript or your notes, pick a template (yours or ours), Draft.
 * Everything else is optional.
 *
 * Draft, with drafting on (RN_AI_DRAFTS, ProposalsView.ai "on") and the box ticked: the server
 * writes the whole proposal with Claude (lib/proposals/draft.ts); the transcript is used for that
 * one request and not kept. Without it: Merlin's own reader (lib/proposals/extract.ts) runs here
 * in the browser, the lines it finds fill the template's fields, and only those are saved; the
 * transcript never leaves the browser. "Build it in Claude" copies a ready prompt for the
 * member's own Claude (with Granola or Drive connected) and the connector does the rest.
 */
import { useMemo, useRef, useState } from "react";
import type { ProposalRec, ProposalsView, TemplateChoice } from "@/lib/proposals/types";
import { DISCOVERY_TARGET, acceptInto } from "@/lib/proposals/library";
import { extract, transcriptOk } from "@/lib/proposals/extract";
import { IconCheck, IconExternal, useToast } from "../ui/shared";
import { Sheet, useUi } from "./ui";
import { copyText } from "./hooks";
import type { CoInfo } from "./model";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
export const CLAUDE_NEW = "https://claude.ai/new";
const AI_CONSENT = "Claude reads the transcript through Anthropic's API to write the draft. Merlin keeps the draft, not the transcript.";

const PACK_WORDS = "Add a $10 usage pack";

async function post<T>(body: Record<string, unknown>): Promise<T & { error?: string; upgrade?: string }> {
  try {
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: j.error || "That didn't go through. Try again." };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

/** Upload a file of theirs as a template. */
export async function uploadTemplate(f: File): Promise<{ id?: string; title?: string; blocks?: unknown[]; error?: string }> {
  try {
    const r = await fetch(`/api/proposals/template?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: j.error || "That file didn't read. Try again." };
  } catch {
    return { error: NETWORK };
  }
}
export const TEMPLATE_ACCEPT = ".docx,.pdf,.md,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/markdown,text/plain";

const dayWords = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

/** The words to paste into Claude: the template, the company, the call. */
export function claudePrompt(o: { template: TemplateChoice | null; company: string; date?: string; with?: string }): string {
  const tpl = o.template ? (o.template.mine ? `my "${o.template.title}" template` : `the "${o.template.title.split(":")[0]}" template`) : "a blank template";
  const call = `my ${o.date ? `${dayWords(o.date)} ` : "latest "}call${o.with ? ` with ${o.with}` : ""}`;
  return `Use ${tpl} in Merlin and draft a proposal for ${o.company || "[the company]"} from ${call}. Find the call in my meeting notes. Call get_proposal_kit first, then write it in my voice using their own words, with the price stated and a decision at day 30, 60 and 90. Save it to Merlin with create_or_update_proposal and show me before anything is sent.`;
}

/** Copy the prompt and open Claude. */
export async function buildInClaude(text: string, toast: (t: string, err?: boolean) => void) {
  const w = window.open(CLAUDE_NEW, "_blank", "noopener");
  const ok = await copyText(text);
  toast(ok ? "Copied. Paste it into Claude, with Merlin connected." : "That didn't copy. Select the words and copy them yourself.", !ok);
  void w;
}

export function StartSheet({
  data,
  infos,
  companyId,
  onClose,
  onMade,
  onTemplate,
}: {
  data: ProposalsView;
  infos: CoInfo[];
  companyId: string | null;
  onClose: () => void;
  onMade: (p: ProposalRec, toFix?: string[]) => void;
  onTemplate: (t: TemplateChoice) => void;
}) {
  const toast = useToast();
  const ui = useUi();
  const known = useMemo(() => infos.filter((i) => !i.c.hidden && i.c.name).sort((a, b) => a.c.name.localeCompare(b.c.name)), [infos]);
  const preset = companyId ? infos.find((i) => i.c.id === companyId) : undefined;
  const [q, setQ] = useState(preset && !preset.c.hidden ? preset.c.name : "");
  const [pick, setPick] = useState<string | null>(companyId);
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const [more, setMore] = useState(false);
  const [date, setDate] = useState("");
  const [withWho, setWith] = useState("");
  const open = data.templates.filter((t) => t.open);
  const [tpl, setTpl] = useState<string>(open.find((t) => t.mine)?.id ?? open[0]?.id ?? "blank");
  const [useAi, setUseAi] = useState(data.ai === "on");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  // The AI usage all used (ProposalsView.aiUsedUp, or the draft's refusal): the draft explains, with the pack and Build it in Claude.
  const [usedUp, setUsedUp] = useState<{ words: string; pack: string; button: string } | null>(data.aiUsedUp ?? null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tplRef = useRef<HTMLInputElement>(null);

  const matches = q.trim().length >= 2 && !pick ? known.filter((i) => i.c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const picked = pick ? infos.find((i) => i.c.id === pick) : undefined;
  const company = picked && !picked.c.hidden ? picked.c.name : q.trim();
  const template = data.templates.find((t) => t.id === tpl) ?? null;
  const hasCall = text.trim().length > 0;
  const ai = data.ai === "on" && useAi && hasCall;
  const aiOut = ai && !!usedUp;

  const readFile = (f: File | undefined) => {
    if (!f) return;
    if (!transcriptOk(f.name)) return toast("That file type doesn't read here. Use .txt, .vtt, .srt or .md, or paste the text.", true);
    if (f.size > 2_000_000) return toast("That file is over 2 MB. Paste the part that matters.", true);
    void f.text().then((t) => (setText(t), setFileName(f.name)));
  };
  const addTemplate = async (f: File | undefined) => {
    if (!f) return;
    setBusy("template");
    const r = await uploadTemplate(f);
    setBusy(null);
    if (r.error || !r.id) return toast(r.error ?? "That file didn't read.", true);
    const t: TemplateChoice = { id: r.id, title: r.title ?? f.name, about: f.name, mine: true, open: true, sections: r.blocks?.length ?? 0 };
    onTemplate(t);
    setTpl(t.id);
    toast(`Added ${t.title}, ${t.sections} sections.`);
  };

  const draft = async () => {
    setErr(null);
    if (!company && !pick) return setErr("Pick the company, or type its name.");
    const base = { templateId: tpl === "blank" ? null : tpl, companyId: pick, companyName: picked && !picked.c.hidden ? undefined : q.trim() };
    if (ai) {
      setBusy("draft");
      const r = await post<{ proposal: ProposalRec; toFix: string[] }>({ op: "draft", ...base, transcript: text, callDate: dayWords(date) || undefined, callWith: withWho.trim() || undefined, agree: true });
      setBusy(null);
      if (r.error && r.upgrade) return setUsedUp({ words: r.error, pack: r.upgrade, button: PACK_WORDS });
      if (r.error) return setErr(r.error);
      // The transcript is gone from here too once the draft is made.
      setText("");
      return onMade(r.proposal, r.toFix);
    }
    // Merlin's own reader, in this browser: only the lines it finds are sent, never the transcript.
    let fields: Record<string, string> = {};
    let notes: { key: string; text: string; at: string }[] = [];
    let signerOnCall: boolean | null = null;
    if (hasCall) {
      const ex = extract(text, data.me.name);
      const per = new Map<string, number>();
      const at = new Date().toISOString();
      for (const s of ex.suggestions) {
        const target = DISCOVERY_TARGET[s.key];
        const k = target ?? s.key;
        const n = per.get(k) ?? 0;
        if (n >= (target ? 3 : 2) || !s.buyer) continue;
        per.set(k, n + 1);
        const r = acceptInto(fields, notes, s.key, s.text, at);
        fields = r.fields;
        notes = r.notes;
      }
      signerOnCall = ex.signerOnCall;
      if (date) fields["discovery.callDate"] = dayWords(date);
    }
    setBusy("draft");
    const r = await post<ProposalRec>({ op: "create", ...base, ...(hasCall ? { fields, notes, signerOnCall } : {}) });
    setBusy(null);
    if (r.error) return setErr(r.error);
    setText("");
    onMade(r);
  };

  const prompt = claudePrompt({ template, company, date, with: withWho.trim() });
  return (
    <Sheet
      title="New proposal from a call"
      onClose={onClose}
      dialog
      className="pp-start"
      footer={
        <div className="pp-start-foot">
          {aiOut && usedUp && (
            <div className="pp-aiout" role="note">
              <p className="pp-help">{usedUp.words}</p>
              {/* The pack's purchase posts to /api/billing/ai-pack once billing has it (lib/proposals/aiUsage.ts AI_PACK_ROUTE); until then, Settings, Plan. */}
              <a className="btn btn-pine btn-lg pp-wide" href={usedUp.pack}>
                {usedUp.button}
              </a>
            </div>
          )}
          <button type="button" className="btn btn-pine btn-lg pp-wide" aria-busy={busy === "draft"} disabled={!!busy || (!company && !pick) || aiOut} onClick={draft}>
            {busy === "draft" ? (ai ? "Claude is drafting it" : "Drafting") : hasCall ? "Draft it" : "Start from the template"}
          </button>
          <button type="button" className="btn btn-lg pp-wide pp-claude-btn" onClick={() => void buildInClaude(prompt, toast)}>
            Build it in Claude <IconExternal />
          </button>
        </div>
      }
    >
      <div className="pp-start-body">
        <label className="pp-label" htmlFor="pp-co">
          <span className="pp-step">1</span> The company
        </label>
        <div className="pp-co">
          <input id="pp-co" className="input" autoComplete="off" placeholder="Search Merlin, or type its name" value={q} onChange={(e) => (setQ(e.target.value), picked?.c.hidden || setPick(null))} />
          {picked && (
            <p className="pp-co-picked">
              <IconCheck /> {picked.c.hidden ? "A locked company on Merlin. Type its name: it stays on your proposal only." : "On Merlin: its facts fill in."}
            </p>
          )}
          {matches.length > 0 && (
            <ul className="pp-co-list" role="listbox" aria-label="Companies on Merlin">
              {matches.map((i) => (
                <li key={i.c.id}>
                  <button type="button" role="option" aria-selected={false} onClick={() => (setPick(i.c.id), setQ(i.c.name))}>
                    <b>{i.c.name}</b>
                    <span>{[i.c.cells.industry, i.c.cells.revenue].map((c) => (c?.s === "value" ? String(c.v) : "")).filter(Boolean).join(" · ")}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <label className="pp-label" htmlFor="pp-call">
          <span className="pp-step">2</span> The call
        </label>
        <div
          className="pp-drop"
          data-on={drop}
          onDragOver={(e) => (e.preventDefault(), setDrop(true))}
          onDragLeave={() => setDrop(false)}
          onDrop={(e) => (e.preventDefault(), setDrop(false), readFile(e.dataTransfer.files?.[0]))}
        >
          <textarea
            id="pp-call"
            className="input pp-paste"
            placeholder="Paste the transcript or your meeting notes, or drop a .txt, .vtt, .srt or .md file here"
            value={text}
            onChange={(e) => (setText(e.target.value), setFileName(null))}
            rows={5}
          />
          <div className="pp-drop-row">
            <button type="button" className="tp-flink" onClick={() => fileRef.current?.click()}>
              Choose a file
            </button>
            {fileName && <span className="pp-muted">{fileName}</span>}
            {hasCall && <span className="pp-muted">{text.trim().split(/\s+/).length.toLocaleString("en-US")} words</span>}
            <button type="button" className="tp-flink" aria-expanded={more} onClick={() => setMore((x) => !x)}>
              {more ? "Hide the call's details" : "Add its date and who was on it"}
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".txt,.vtt,.srt,.md,text/plain,text/vtt,text/markdown" hidden onChange={(e) => (readFile(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
        {more && (
          <div className="pp-start-more">
            <label className="pp-field">
              <span className="pp-field-l">The call&#39;s date</span>
              <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </label>
            <label className="pp-field">
              <span className="pp-field-l">Who you spoke with</span>
              <input className="input" value={withWho} placeholder="Their name" onChange={(e) => setWith(e.target.value)} />
            </label>
          </div>
        )}

        <p className="pp-label">
          <span className="pp-step">3</span> The template
        </p>
        <div className="pp-tplchips" role="radiogroup" aria-label="Template">
          {[...data.templates, { id: "blank", title: "A blank page", about: "", mine: false, open: true, sections: 6 }].map((t) => (
            <button key={t.id} type="button" role="radio" aria-checked={tpl === t.id} className="pp-tplchip" data-on={tpl === t.id} data-mine={t.mine} disabled={!t.open} onClick={() => setTpl(t.id)} title={t.about}>
              {t.mine && <span className="pp-yours">Yours</span>}
              <span className="pp-tplchip-t">{t.title.split(":")[0]}</span>
              {!t.open && <span className="bl-tag bl-tag-lock">Pro</span>}
            </button>
          ))}
          <button type="button" className="pp-tplchip pp-tplchip-add" aria-busy={busy === "template"} disabled={!!busy} onClick={() => tplRef.current?.click()}>
            {busy === "template" ? "Reading it" : "+ Upload a past proposal"}
          </button>
          <input ref={tplRef} type="file" accept={TEMPLATE_ACCEPT} hidden onChange={(e) => (void addTemplate(e.target.files?.[0]), (e.target.value = ""))} />
        </div>
        {template && !template.mine && template.id !== "blank" && <p className="pp-help pp-tpl-about">{template.about}</p>}

        {data.ai === "on" && (
          <label className="pp-ai">
            <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
            <span>
              <b>Draft the whole proposal with Claude</b>
              <span className="pp-muted">{AI_CONSENT}</span>
            </span>
          </label>
        )}
        {data.ai !== "on" && hasCall && (
          <p className="pp-help">
            Draft fills the template from what Merlin finds in the call, read in this browser and not kept. For a full first draft in your words, use Build it in Claude.
          </p>
        )}
        {data.ai === "plan" && <p className="pp-help">Drafting with Claude on Merlin is on Pro. Build it in Claude works on every plan.</p>}
        <p className="pp-help pp-claude-how">
          Build it in Claude copies a prompt for Claude with your meeting notes connected. It needs Merlin connected to Claude once:{" "}
          <button type="button" className="tp-flink" onClick={() => (onClose(), ui.openPage("integrations"))}>
            see how
          </button>
          .
        </p>
        {err && <p className="pp-err">{err}</p>}
      </div>
    </Sheet>
  );
}
