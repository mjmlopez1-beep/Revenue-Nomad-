"use client";

/**
 * "New proposal from a call": start from the conversation the member already had, in three steps.
 *
 *  1. Where's the conversation: From Granola (a slot the Granola picker renders into, which hands
 *     back the transcript; there only while Granola is switched on for Merlin), a transcript pasted
 *     or dropped (.txt, .vtt, .srt, .md, or a .docx read here in the browser), or "Tell Merlin what
 *     was agreed", typed or said (the browser's speech recognition, where there is one).
 *  2. Which of their templates: theirs first, the best fit for what was asked for marked
 *     (lib/proposals/startCall.ts bestTemplate), and how often each was used.
 *  3. Who signs: from the call, the company's decision maker on their Merlin record, or typed.
 *
 * Draft it: with drafting on (RN_AI_DRAFTS, ProposalsView.ai "on") and the box ticked, the server
 * writes it with Claude (lib/proposals/draft.ts; the transcript used for that request only).
 * Without it, Merlin's own reader (lib/proposals/extract.ts) and what was agreed (readTerms) run
 * here in the browser, and only the lines it finds are saved. Either way the draft reads "Draft
 * ready": what was done, the things to check (anything the call didn't settle is a labelled blank,
 * never guessed), and where each part came from.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { dropWantCases, peekWantCases } from "./WriteProposal";
import type { ProposalRec, ProposalsView, TemplateChoice } from "@/lib/proposals/types";
import { DISCOVERY_TARGET, acceptInto, blanksInWords, blanksOf, docFields, fieldLabel } from "@/lib/proposals/library";
import { extract, transcriptOk } from "@/lib/proposals/extract";
import { bestTemplate, browserInflateRaw, docxText, properCase, readTerms } from "@/lib/proposals/startCall";
import { IconCheck, IconChevron, useToast, errorText } from "../ui/shared";
import { MicButton, useSpeech } from "./ChangeIt";
import { LiveView, useLive } from "./Live";
import { LiveSteps } from "./proposalsPage/LiveSteps";
import { LinkCompany } from "./ProposalLink";
import { AddCompany } from "./AddCompany";
import type { CoInfo } from "./model";
import type { View } from "@/lib/tableTypes";
import { fixesFor } from "./proposalFixes";
import { useLeaveGuard } from "./leaveGuard";
import { companyForCall } from "./callPick";

const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";
/** What ticking the box agrees to, in plain words (the Privacy page names the provider). */
const AI_CONSENT = "To write the draft, Merlin sends this transcript to its AI provider. The transcript isn't kept after, only the draft.";

const PACK_WORDS = "Add a $10 usage pack";

async function post<T>(body: Record<string, unknown>): Promise<T & { error?: string; upgrade?: string }> {
  try {
    const r = await fetch("/api/proposals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { ...j, error: errorText(r.status, j.error, "That didn't go through. Try again.") };
  } catch {
    return { error: NETWORK } as T & { error: string };
  }
}

/** Upload a file of theirs as a template. */
export async function uploadTemplate(f: File): Promise<{ id?: string; title?: string; blocks?: unknown[]; error?: string }> {
  try {
    const r = await fetch(`/api/proposals/template?name=${encodeURIComponent(f.name)}`, { method: "POST", body: f });
    const j = await r.json().catch(() => ({}));
    return r.ok ? j : { error: errorText(r.status, j.error, "That file didn't read. Try again.") };
  } catch {
    return { error: NETWORK };
  }
}
export const TEMPLATE_ACCEPT = ".docx,.pdf,.md,.txt,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf,text/markdown,text/plain";

const dayWords = (d: string) => (d ? new Date(`${d}T12:00:00Z`).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }) : "");

/** Titles that sign: a line in the call that names one beside a name is the signer. */
const SIGNER_TITLE = /\b(CEO|CFO|COO|CTO|CRO|CMO|CPO|Chief [A-Z][a-z]+(?: [A-Z][a-z]+)? Officer|Founder|Co-founder|Cofounder|President|Managing Director|General Manager|Owner|VP(?: of)? [A-Z][A-Za-z]+|Vice President(?: of)? [A-Z][A-Za-z]+|Head of [A-Z][A-Za-z]+)\b/;
const PERSON = "([A-Z][a-z'’-]+(?: [A-Z][a-z'’-]+){1,2})";
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/;

/**
 * Who signs, before "Draft it" sends the draft: the call's "with" line ("Avery Ashby, CEO"), else a
 * name beside a title in the call itself ("Avery Ashby (CEO)", "CEO Avery Ashby"), else the company's
 * decision maker on the record, where the member sees their name. The email is the call's (an
 * address on a line with their first name, else the only one) or the record's. Nothing is guessed:
 * what isn't found stays blank. Read here, in the browser: the call itself is never sent.
 */
export function signerFrom(o: { withWho: string; text: string; me: string; company?: CoInfo | null }): { name?: string; title?: string; email?: string } {
  const out: { name?: string; title?: string; email?: string } = {};
  const mine = o.me.trim().toLowerCase();
  const take = (name: string, title?: string) => {
    if (!name || name.trim().toLowerCase() === mine) return false;
    out.name = name.trim();
    if (title) out.title = title.trim();
    return true;
  };
  const w = o.withWho.trim();
  const wm = w.match(new RegExp(`^${PERSON}\\s*(?:,|\\(|-|\u2013|\u2014)\\s*([^),]+)\\)?`)) ?? w.match(new RegExp(`^${PERSON}$`));
  if (wm) take(wm[1], wm[2]);
  if (!out.name) {
    for (const line of o.text.split("\n")) {
      const a = line.match(new RegExp(`${PERSON}\\s*(?:,|\\(|-|\u2013|\u2014)\\s*${SIGNER_TITLE.source}`));
      const b = !a ? line.match(new RegExp(`${SIGNER_TITLE.source}\\s+${PERSON}`)) : null;
      if (a && take(a[1], a[2])) break;
      if (b && take(b[2], b[1])) break;
    }
  }
  // The company's decision maker on the record, when the call named nobody.
  if (!out.name && o.company) {
    const dm = o.company.c.people.find((p) => p.cells.relationship?.s === "value" && /decision maker/i.test(p.cells.relationship.v) && p.cells.name?.s === "value");
    if (dm && dm.cells.name?.s === "value") {
      take(dm.cells.name.v, dm.cells.title?.s === "value" ? dm.cells.title.v : undefined);
      if (dm.cells.email?.s === "value") out.email = dm.cells.email.v;
    }
  }
  if (!out.email) {
    const first = out.name?.split(/\s+/)[0]?.toLowerCase();
    const lines = o.text.split("\n");
    const near = first ? lines.find((l) => l.toLowerCase().includes(first) && EMAIL.test(l)) : undefined;
    const all = [...new Set((o.text.match(new RegExp(EMAIL.source, "g")) ?? []).map((x) => x.toLowerCase()))];
    const email = near?.match(EMAIL)?.[0] ?? (all.length === 1 ? all[0] : undefined);
    if (email && out.name) out.email = email;
  }
  return out;
}

/** A transcript a source hands over: Granola's picker (lib/granola, wired in Proposals), a file, or what was pasted. */
export interface CallPick {
  transcript: string;
  attendees?: { name?: string; email?: string }[];
  noteId?: string;
  /** When the call was, ISO. */
  when?: string;
}
/**
 * The slot "From Granola" renders into: the picker (GranolaCallPicker.tsx, wired in Proposals.tsx),
 * given the company and the call picked so far, hands back a transcript, or sends the member to
 * paste one instead. Who signs is not passed: typing it must never search Granola.
 */
export type GranolaSlot = (o: { companyId: string | null; companyName?: string; pickedId?: string | null; onPick: (c: CallPick) => void; onPaste: () => void }) => React.ReactNode;

type Source = "granola" | "paste" | "agreed";
type Ready = { proposal: ProposalRec; toFix: string[]; done: string[]; check: string[]; used: { from: string; what: string }[]; site?: string | null };

const readable = (k: string) => fieldLabel(k).replace(/\s*\([^)]*\)$/, "").toLowerCase();
const listWords = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** Who signs, and where Merlin found them: the call, the company's Merlin record, or both. */
function whoSigns(o: { withWho: string; text: string; me: string; company: CoInfo | null }): { name?: string; title?: string; email?: string; found: string } {
  const call = signerFrom({ withWho: o.withWho, text: o.text, me: o.me, company: null });
  const both = signerFrom({ ...o, company: o.company ?? null });
  const rec = o.company ? signerFrom({ withWho: "", text: "", me: o.me, company: o.company }) : {};
  const co = o.company && !o.company.c.hidden ? o.company.c.name : "";
  const onRecord = !!rec.name && (!call.name || rec.name.toLowerCase() === call.name.toLowerCase());
  const s = call.name ? { ...call, title: call.title || (onRecord ? rec.title : undefined), email: call.email || (onRecord ? rec.email : undefined) } : both;
  const found = call.name ? (onRecord ? `On the call, and in your Merlin record${co ? ` for ${co}` : ""}` : "On the call") : rec.name ? `In your Merlin record${co ? ` for ${co}` : ""}` : "";
  return { ...s, found };
}

export function StartSheet({
  data,
  infos,
  companyId,
  onClose,
  onMade,
  onTemplate,
  granolaSlot,
  granolaFirst,
  view,
  layout = "page",
  mode = "call",
  onDrafted,
  templateId,
}: {
  /** Start on this template (a My templates tile's Use). */
  templateId?: string;
  /**
   * "page": today's full screen. "panel": the new look's start panel on Proposals (Proposals.dc.html),
   * in three columns under the start row, with the draft ready in place.
   */
  layout?: "page" | "panel";
  /** The panel's start: from a call, from a template (nothing read from a call), or blank. */
  mode?: "call" | "template" | "blank";
  /** The panel: the draft is saved (it is the table's first row now), before the member opens it. */
  onDrafted?: (p: ProposalRec) => void;
  /** The member's view: the "Draft ready" list counts what to fix as the editor does (proposalFixes.ts). */
  view?: View;
  data: ProposalsView;
  infos: CoInfo[];
  companyId: string | null;
  onClose: () => void;
  onMade: (p: ProposalRec, toFix?: string[]) => void;
  onTemplate: (t: TemplateChoice) => void;
  /** "From Granola": the picker, while Granola is switched on for Merlin (RN_GRANOLA). Without it there is no Granola card at all: paste, drop or say what was agreed. */
  granolaSlot?: GranolaSlot;
  /** Start on "From Granola" (the member has Granola connected). */
  granolaFirst?: boolean;
}) {
  const toast = useToast();
  const known = useMemo(() => infos.filter((i) => !i.c.hidden && i.c.name).sort((a, b) => a.c.name.localeCompare(b.c.name)), [infos]);
  const preset = companyId ? infos.find((i) => i.c.id === companyId) : undefined;
  // Evidence Bank's Use in a new proposal: these cases start its Proof (WriteProposal.tsx).
  const [cases] = useState(() => peekWantCases());
  const casesWords = cases?.length ? ` Proof starts with the ${cases.length === 1 ? "case" : "two cases"} you picked in Evidence Bank.` : "";
  const [q, setQ] = useState(preset && !preset.c.hidden ? preset.c.name : "");
  const [pick, setPick] = useState<string | null>(companyId);
  const [src, setSrc] = useState<Source>(granolaSlot && granolaFirst ? "granola" : "paste");
  const [srcPicked, setSrcPicked] = useState(false);
  const [text, setText] = useState("");
  // The Granola call the transcript came from, shown as chosen in the picker, and the signer's email when that call gave it.
  const [noteId, setNoteId] = useState<string | null>(null);
  const [fromCall, setFromCall] = useState<string | null>(null);
  // Granola's status arrives a moment after the sheet opens: start there once it says connected, unless they already chose or typed.
  useEffect(() => {
    if (granolaSlot && granolaFirst && !srcPicked && !text && !agreed) setSrc("granola");
    if (!granolaSlot && src === "granola") setSrc("paste");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!granolaSlot, granolaFirst]);
  const [agreed, setAgreed] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [drop, setDrop] = useState(false);
  const [date, setDate] = useState("");
  const [withWho, setWith] = useState("");
  const [allTpl, setAllTpl] = useState(false);
  // Unticked until the member ticks it (once they agreed before, it starts ticked): nothing leaves Merlin without it.
  const [useAi, setUseAi] = useState(data.ai === "on" && !!data.aiAgreed);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [usedUp, setUsedUp] = useState<{ words: string; pack: string; button: string } | null>(data.aiUsedUp ?? null);
  const [editSigner, setEditSigner] = useState(false);
  const [typed, setTyped] = useState<{ name: string; title: string; email: string } | null>(null);
  const [ready, setReady] = useState<Ready | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const tplRef = useRef<HTMLInputElement>(null);
  const speech = useSpeech((t) => setAgreed((x) => `${x} ${t}`.trim()));
  const live = useLive();
  const [addCo, setAddCo] = useState(false);
  // Typed text is work: leaving asks first (Esc, Back, the Proposals link). Focus starts on the screen's heading.
  const dirty = !ready && (!!text.trim() || !!agreed.trim());
  const ask = () => !dirty || window.confirm("Leave without drafting? What you typed here is lost.");
  useLeaveGuard(ask);
  const leave = () => ask() && onClose();
  const head = useRef<HTMLHeadingElement>(null);
  useEffect(() => head.current?.focus({ preventScroll: true }), [!!ready]);

  const matches = q.trim().length >= 2 && !pick ? known.filter((i) => i.c.name.toLowerCase().includes(q.trim().toLowerCase())).slice(0, 6) : [];
  const picked = pick ? infos.find((i) => i.c.id === pick) : undefined;
  const company = picked && !picked.c.hidden ? picked.c.name : q.trim();
  // Whatever the source, the drafting reads one text: the transcript, or what was agreed.
  const callText = mode !== "call" ? "" : src === "agreed" ? agreed : text;
  const hasCall = callText.trim().length > 0;
  const found = useMemo(() => whoSigns({ withWho, text: callText, me: data.me.name, company: picked ?? null }), [withWho, callText, data.me.name, picked]);
  const signer = typed ?? { name: found.name ?? "", title: found.title ?? "", email: found.email ?? "" };
  const used = useMemo(() => Object.fromEntries(data.templates.map((t) => [t.id, data.proposals.filter((p) => p.templateId === t.id).length])), [data.templates, data.proposals]);
  const best = useMemo(() => bestTemplate(data.templates, callText, used), [data.templates, callText, used]);
  const open = data.templates.filter((t) => t.open);
  const [tpl, setTpl] = useState<string>(templateId && open.some((t) => t.id === templateId) ? templateId : open.find((t) => t.mine)?.id ?? open[0]?.id ?? "blank");
  const [tplPicked, setTplPicked] = useState(!!templateId);
  // Until the member picks one, the template follows the best fit for what was said.
  const tplNow = mode === "blank" ? "blank" : !tplPicked && best.score >= 2 && best.id ? best.id : tpl;
  const template = data.templates.find((t) => t.id === tplNow) ?? null;
  const ai = data.ai === "on" && useAi && callText.trim().length >= 200;
  const aiOut = ai && !!usedUp;

  const takeCall = (c: CallPick) => {
    setText(c.transcript);
    setFileName(null);
    setNoteId(c.noteId ?? null);
    setSrc("granola");
    if (c.when) setDate(c.when.slice(0, 10));
    const them = c.attendees?.find((a) => a.name && a.name.trim().toLowerCase() !== data.me.name.trim().toLowerCase() && a.email?.toLowerCase() !== data.me.email.toLowerCase());
    if (them?.name && !withWho) setWith(them.name);
    if (them?.email && !typed && !found.email && them.name) setTyped({ name: them.name, title: "", email: them.email }), setFromCall(them.email);
    // The company the call was with, when it is open to the member on Merlin (an attendee's work domain): Draft it needs no typing.
    if (!pick) {
      const co = companyForCall(c.attendees ?? [], infos, data.me);
      if (co && (!q.trim() || co.c.name.toLowerCase().includes(q.trim().toLowerCase()))) (setPick(co.c.id), setQ(co.c.name), setAddCo(false));
    }
  };
  const readFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 2_000_000) return toast("That file is over 2 MB. Paste the part that matters.", true);
    if (/\.docx$/i.test(f.name)) {
      try {
        const t = await docxText(new Uint8Array(await f.arrayBuffer()), browserInflateRaw);
        return setText(t), setFileName(f.name), setSrc("paste");
      } catch (e) {
        return toast((e as Error).message || "That .docx didn't open.", true);
      }
    }
    if (!transcriptOk(f.name)) return toast("That file type doesn't read here. Use .txt, .vtt, .srt, .md or .docx, or paste the text.", true);
    void f.text().then((t) => (setText(t), setFileName(f.name), setSrc("paste")));
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
    setTplPicked(true);
    toast(`Added ${t.title}, ${t.sections} sections.`);
  };

  /** What the draft did, what to check and where each part came from, from the saved draft itself. */
  const summarise = (p: ProposalRec, toFix: string[], loose: string[]): Ready => {
    const f = docFields(p);
    const fromCall = Object.keys(p.fields).filter((k) => ["discovery", "claude"].includes(p.sources[k] ?? "") && !k.startsWith("client.signer") && k !== "discovery.callDate");
    const fromRecord = Object.keys(p.fields).filter((k) => p.sources[k] === "record" && k.startsWith("company."));
    const blanks = blanksOf(p.blocks, f);
    const unused = Object.keys(p.fields).filter((k) => p.sources[k] === "discovery" && /^(pricing|term|start)\./.test(k) && !p.blocks.some((b) => b.body.includes(`{{${k}}}`)));
    const who = p.signer?.name || p.fields["client.signerName"];
    const done = [
      template ? (template.mine ? `Used your "${template.title}" template` : `Used Merlin's "${template.title.split(":")[0]}" template`) : "Started from a blank page",
      ...(fromCall.length ? [`Filled in ${listWords(fromCall.slice(0, 4).map(readable))}${fromCall.length > 4 ? ` and ${fromCall.length - 4} more` : ""} from ${src === "agreed" ? "what you told Merlin" : "the call"}`] : []),
      ...(p.fields["pricing.monthlyFee"] && fromCall.includes("pricing.monthlyFee") ? [`Set the fee at ${p.fields["pricing.monthlyFee"]} a month${p.fields["pricing.fixedFee"] ? `, with ${p.fields["pricing.fixedFee"]} fixed up front` : ""}, as discussed`] : []),
      ...(fromRecord.length && p.company.name ? [`Added ${p.company.name}'s ${listWords(fromRecord.map((k) => readable(k)))} from Merlin`] : []),
      ...(who ? [`Put ${who} in as the signer`] : []),
    ];
    // One list for here and the editor: what the draft said to check goes to the editor as its own, and both count it with fixesFor.
    const draftSaid = [...loose, ...unused.map((k) => `The call gave the ${readable(k)} (${p.fields[k]}), and the template has no place for it yet. Add it where it fits.`), ...toFix];
    const check = view
      ? fixesFor(p, view, draftSaid)
      : [...draftSaid, ...(blanks.length ? [`${blanks.length === 1 ? "One thing wasn't" : `${blanks.length} things weren't`} settled, so ${blanks.length === 1 ? "it's" : "they're"} left as labelled blanks: ${blanksInWords(blanks, 5)}.`] : [])];
    toFix = draftSaid;
    const usedRows = [
      ...(fromCall.length ? [{ from: src === "agreed" ? "What you told Merlin" : "The call", what: `${listWords(fromCall.slice(0, 5).map(readable))}`.replace(/^./, (c) => c.toUpperCase()) }] : []),
      { from: template?.mine ? "Your template" : "The template", what: template?.mine ? "Section order and your standing language, like your terms" : "Section order and the starting text for each part" },
      ...(fromRecord.length || found.found.includes("Merlin record") ? [{ from: "Merlin", what: [fromRecord.length ? `${p.company.name || "The company"}'s ${listWords(fromRecord.map(readable))}` : "", found.found.includes("Merlin record") && who ? `${who}'s title and email` : ""].filter(Boolean).join(", and ") }] : []),
      ...(data.voice && ai ? [{ from: "Your writing", what: "Tone and phrasing from your saved voice" }] : []),
    ];
    return { proposal: p, toFix, done, check, used: usedRows };
  };

  const draft = async () => {
    setErr(null);
    if (!company && !pick) return setErr("Pick the company, or type its name.");
    const base = { templateId: tplNow === "blank" ? null : tplNow, companyId: pick, companyName: picked && !picked.c.hidden ? undefined : q.trim(), ...(cases?.length ? { proofCases: cases } : {}) };
    const sign = signer.name.trim() && /^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(signer.email.trim()) ? { name: signer.name.trim(), email: signer.email.trim(), ...(signer.title.trim() ? { title: signer.title.trim() } : {}) } : null;
    const terms = hasCall ? readTerms(callText) : { fields: {}, checks: [] };
    if (ai) {
      // Live: each real step as it happens (Live.tsx), and the sections filling in.
      setBusy("draft");
      const end = await live.start({ op: "draft", ...base, transcript: callText, callDate: dayWords(date) || undefined, callWith: signer.name || withWho.trim() || undefined, agree: true });
      const r = (end.ok ? end.result : end.result) as { proposal: ProposalRec; toFix: string[]; company?: { website: string | null } } | undefined;
      if (!end.ok && !r?.proposal) {
        setBusy(null);
        live.reset();
        if (end.status === 402) return setUsedUp({ words: end.message, pack: "/?p=billing&plans=1&from=ai-pack", button: PACK_WORDS });
        if (end.status === 499) return;
        return setErr(end.message);
      }
      let p = r!.proposal;
      if (sign && !p.signer) {
        const u = await post<ProposalRec>({ op: "update", id: p.id, signer: sign });
        if (!u.error) p = u;
      }
      // The cases picked in Evidence Bank fill Proof, as the member asked (the draft from a call doesn't take them itself).
      if (cases?.length && (p.proofCases ?? []).join() !== cases.join()) {
        const u = await post<ProposalRec>({ op: "update", id: p.id, proofCases: cases });
        if (!u.error) p = u;
      }
      dropWantCases();
      setBusy(null);
      setText(""), setAgreed("");
      live.reset();
      const ready = summarise(p, r!.toFix ?? [], end.ok ? terms.checks : [end.message, ...terms.checks]);
      onDrafted?.(p);
      return setReady({ ...ready, site: r!.company?.website ?? null });
    }
    // Merlin's own reader, in this browser: only the lines it finds are sent, never the transcript.
    let fields: Record<string, string> = {};
    let notes: { key: string; text: string; at: string }[] = [];
    let signerOnCall: boolean | null = null;
    if (hasCall) {
      const ex = extract(callText, data.me.name);
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
      fields = { ...fields, ...terms.fields };
      if (date) fields["discovery.callDate"] = dayWords(date);
    }
    if (signer.name && !fields["client.signerName"]) fields["client.signerName"] = signer.name;
    if (signer.title && !fields["client.signerTitle"]) fields["client.signerTitle"] = signer.title;
    if (signer.email && !fields["client.signerEmail"]) fields["client.signerEmail"] = signer.email;
    setBusy("draft");
    const r = await post<ProposalRec>({ op: "create", ...base, ...(hasCall ? { fields, notes, signerOnCall } : Object.keys(fields).length ? { fields } : {}), ...(sign ? { signer: sign } : {}) });
    setBusy(null);
    if (r.error) return setErr(r.error);
    dropWantCases();
    setText(""), setAgreed("");
    onDrafted?.(r);
    setReady(summarise(r, [], terms.checks));
  };

  const title = picked && !picked.c.hidden ? `New proposal for ${picked.c.name}` : ready?.proposal.company.name ? `New proposal for ${ready.proposal.company.name}` : "New proposal from a call";
  const shownTpl = [...data.templates].sort((a, b) => (a.id === best.id && best.score >= 2 ? -1 : b.id === best.id && best.score >= 2 ? 1 : 0) || Number(b.mine) - Number(a.mine));
  const tplList = allTpl ? shownTpl : shownTpl.slice(0, 3);
  const signerFirst = (signer.name || "").split(/\s+/)[0];

  // A source to pick: a card on the page, a chip in the panel (its line is the chip's tooltip).
  const card = (s: Source, t: string, sub: string) =>
    layout === "panel" ? (
      <button type="button" className="pz-chip" aria-pressed={src === s} title={sub} onClick={() => (setSrc(s), setSrcPicked(true))}>
        {t}
      </button>
    ) : (
      <button type="button" className="sc-opt" aria-pressed={src === s} data-on={src === s} onClick={() => (setSrc(s), setSrcPicked(true))}>
        <span className="sc-opt-t">{t}</span>
        <span className="sc-opt-s">{sub}</span>
      </button>
    );

  if (layout === "panel") {
    const isCall = mode === "call";
    const panelTitle = ready ? "Draft ready" : isCall ? "New proposal from a call" : mode === "blank" ? "New blank proposal" : "New proposal from a template";
    const panelSub = ready ? "Read it through before you send it." : `${isCall ? "Start from the conversation you already had." : "Nothing is filled in from a call."}${casesWords}`;
    const running = live.state.status === "running" || (busy === "draft" && live.state.status !== "idle");
    const companyField = (
      <div className="pz-cofield">
        <label className="pz-k" htmlFor="pz-co">
          {isCall ? "The company" : "1. Which company"}
        </label>
        <input id="pz-co" className="input" autoComplete="off" placeholder="Search Merlin, or type its name" value={q} onChange={(e) => (setQ(e.target.value), picked?.c.hidden || setPick(null))} />
        {picked && <p className="pp-co-picked">{picked.c.hidden ? "A locked company on Merlin. Type its name: it stays on your proposal only." : "On Merlin: its size and industry fill in."}</p>}
        {!pick && q.trim().length >= 3 && matches.length === 0 &&
          (addCo ? (
            <AddCompany name={q.trim()} onCancel={() => setAddCo(false)} onAdded={(r) => (setPick(r.companyId), setQ(r.name), setAddCo(false), toast(r.added ? `Added ${r.name} to Merlin.` : `${r.name} was on Merlin already.`))} />
          ) : (
            <p className="pz-note">
              Not on Merlin yet?{" "}
              <button type="button" className="tp-flink" onClick={() => setAddCo(true)}>
                Add {properCase(q.trim())} to Merlin
              </button>{" "}
              or keep typing: Merlin links it when you draft.
            </p>
          ))}
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
        {!isCall && <span className="pz-note">A company on Merlin fills in its size and industry. On a company page, Write a proposal brings you here with it picked.</span>}
      </div>
    );
    return (
      <div className="pz-panel" data-mode={mode}>
        <div className="pz-panel-head">
          <span className="pz-panel-t">
            <h3 className="pz-panel-h" ref={head} tabIndex={-1}>
              {panelTitle}
            </h3>
            <span>{panelSub}</span>
          </span>
          <button type="button" className="pz-x" aria-label="Close this panel" onClick={leave}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        {ready ? (
          <>
            <div className="pz-ready" role="status">
              <div className="pz-ready-col">
                <span className="pz-k">What Merlin did</span>
                {ready.done.map((d) => (
                  <span key={d} className="pz-ready-i">
                    <IconCheck size={14} /> {d}
                  </span>
                ))}
              </div>
              <div className="pz-ready-col">
                <span className="pz-k">{ready.check.length ? `Check ${ready.check.length === 1 ? "this" : "these"} before you send` : "Nothing left blank"}</span>
                {ready.check.length ? ready.check.map((c) => <span key={c} className="pz-ready-i pz-ready-check">{c}</span>) : <span className="pz-ready-i">Read it through before you send it.</span>}
              </div>
              <div className="pz-ready-col">
                <span className="pz-k">Where each part came from</span>
                {ready.used.map((u) => (
                  <span key={u.from} className="pz-ready-i">
                    <strong>{u.from}:</strong> {u.what}
                  </span>
                ))}
              </div>
            </div>
            {!ready.proposal.company.id && (
              <LinkCompany
                p={ready.proposal}
                site={ready.site}
                lead={ready.proposal.company.name ? `${ready.proposal.company.name} isn't linked to a company on Merlin yet, so your pipeline won't move when they sign.` : undefined}
                onLinked={(r) => setReady({ ...ready, proposal: { ...ready.proposal, company: r.company } })}
              />
            )}
            <div className="pz-go">
              <button type="button" className="btn btn-pine btn-lg" onClick={() => onMade(ready.proposal, ready.toFix)}>
                Open the draft
              </button>
              <button type="button" className="btn btn-lg" onClick={() => setReady(null)}>
                Start another
              </button>
              <span className="pz-note">It is the first row of the table below, as a draft. Nothing has been sent.</span>
            </div>
          </>
        ) : running ? (
          <LiveSteps state={live.state} source={src === "granola" ? "the Granola call you picked" : src === "agreed" ? "what you told Merlin" : fileName ? fileName : "the transcript you pasted"} onCancel={() => void live.cancel()} />
        ) : (
          <div className="pz-cols">
            <div className="pz-col">
              {isCall ? (
                <>
                  <span className="pz-k">1. Where the conversation is</span>
                  <div className="pz-chips" role="group" aria-label="Where the conversation is">
                    {granolaSlot && card("granola", "From Granola", "Pick the call, and Merlin reads its transcript.")}
                    {card("paste", "Paste or drop a transcript", "From Zoom, Gong, Otter or anywhere else.")}
                    {card("agreed", "Tell Merlin what was agreed", "Type or talk for a minute. Good for calls you didn't record.")}
                  </div>
                  {src === "granola" && granolaSlot && (
                    <div className="sc-granola" data-slot="granola">
                      {granolaSlot({ companyId: pick, companyName: company || undefined, pickedId: noteId, onPick: takeCall, onPaste: () => (setSrc("paste"), setSrcPicked(true)) })}
                      {text && noteId && <p className="pz-note">{text.trim().split(/\s+/).length.toLocaleString("en-US")} words from Granola</p>}
                    </div>
                  )}
                  {src === "paste" && (
                    <div
                      className="pp-drop"
                      data-on={drop}
                      onDragOver={(e) => (e.preventDefault(), setDrop(true))}
                      onDragLeave={() => setDrop(false)}
                      onDrop={(e) => (e.preventDefault(), setDrop(false), void readFile(e.dataTransfer.files?.[0]))}
                    >
                      <textarea className="input pp-paste" aria-label="Transcript or meeting notes" placeholder="Paste the transcript or your meeting notes" value={text} onChange={(e) => (setText(e.target.value), setFileName(null))} rows={5} />
                      <span className="pz-note">
                        Or drop a .txt, .vtt, .srt, .md or .docx file, up to 2 MB.{" "}
                        <button type="button" className="tp-flink" onClick={() => fileRef.current?.click()}>
                          Choose a file
                        </button>
                        {fileName ? ` · ${fileName}` : ""}
                        {text.trim() ? ` · ${text.trim().split(/\s+/).length.toLocaleString("en-US")} words` : ""}
                      </span>
                      <input ref={fileRef} type="file" accept=".txt,.vtt,.srt,.md,.docx,text/plain,text/vtt,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => (void readFile(e.target.files?.[0]), (e.target.value = ""))} />
                    </div>
                  )}
                  {src === "agreed" && (
                    <div className="sc-agreed">
                      <textarea
                        className="input pp-paste"
                        aria-label="What was agreed"
                        rows={5}
                        placeholder="Like: two phases. A 45 day assessment at $24,000 fixed, then fractional CRO at $11,000 a month. Dana, the CEO, signs."
                        value={agreed}
                        onChange={(e) => setAgreed(e.target.value)}
                      />
                      <span className="ci-row">
                        <MicButton speech={speech} label="Talk instead of typing" />
                        <span className="pz-note">Good for calls you did not record. Anything you leave out stays a labelled blank.</span>
                      </span>
                    </div>
                  )}
                  {src !== "granola" && (
                    <label className="pz-date">
                      <span>The call&#39;s date (optional)</span>
                      <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                    </label>
                  )}
                  {!(picked && !picked.c.hidden && companyId) && companyField}
                  {picked && !picked.c.hidden && companyId && <span className="pz-note">For {picked.c.name}.</span>}
                  {src === "granola" && <span className="pz-note">Merlin reads a transcript only when you pick the call, and keeps the draft, not the transcript.</span>}
                </>
              ) : (
                companyField
              )}
            </div>
            <div className="pz-col">
              <span className="pz-k">{mode === "blank" ? "2. What you start with" : "2. Which template"}</span>
              {mode === "blank" ? (
                <span className="pz-note">The usual sections: a cover, what you heard, what you recommend, the investment, next steps and the signature. Each one starts empty.</span>
              ) : (
                <>
                  <div className="pz-radios" role="radiogroup" aria-label="Which template">
                    {tplList.map((t) => {
                      const n = used[t.id] ?? 0;
                      const on = tplNow === t.id;
                      return (
                        <button key={t.id} type="button" role="radio" aria-checked={on} className="pz-radio" disabled={!t.open} onClick={() => (setTpl(t.id), setTplPicked(true))}>
                          <span className="pz-dot" aria-hidden />
                          <span className="pz-radio-t">
                            <strong>{t.title.split(":")[0]}</strong>
                            <span>
                              {t.sections} sections · {t.mine ? (n ? `used ${n === 1 ? "once" : `${n} times`}` : "yours") : "a Merlin example"}
                            </span>
                          </span>
                          {isCall && t.id === best.id && best.score >= 2 && <span className="pz-best">Best fit</span>}
                          {!t.open && <span className="bl-tag bl-tag-lock">Close</span>}
                        </button>
                      );
                    })}
                  </div>
                  {shownTpl.length > 3 && (
                    <button type="button" className="tp-flink pz-more" onClick={() => setAllTpl((x) => !x)}>
                      {allTpl ? "Show fewer" : `Show all ${shownTpl.length}`}
                    </button>
                  )}
                  <span className="pz-note">{data.templates.some((t) => t.mine) ? "Yours come first. Best fit is the one closest to what was asked for on the call." : "These are Merlin examples. Make your own template and it shows here first."}</span>
                </>
              )}
            </div>
            <div className="pz-col">
              <span className="pz-k">3. Who signs, then draft</span>
              {!editSigner && signer.name ? (
                <div className="pz-signer">
                  <strong>
                    {signer.name}
                    {signer.title ? `, ${signer.title}` : ""}
                  </strong>
                  {signer.email && <span>{signer.email}</span>}
                  <span className="pz-note">{typed ? (fromCall && typed.email === fromCall ? "On the call you picked in Granola" : "Typed by you") : found.found}. You can change who signs in the draft.</span>
                  <button type="button" className="tp-flink" onClick={() => (setTyped(signer), setEditSigner(true))}>
                    Change
                  </button>
                </div>
              ) : (
                <div className="pz-signer pz-signer-edit">
                  {!signer.name && !editSigner && (
                    <span className="pz-note">{isCall ? "Merlin looks for who signs in the words. If it is not there, it is a labelled blank in the draft." : picked ? "From its Merlin record when the company is open to you. Or type who signs." : "Add the company first, or leave both for the draft."}</span>
                  )}
                  <input className="input" aria-label="Their name" placeholder="Their name" value={signer.name} onChange={(e) => setTyped({ ...signer, name: e.target.value })} />
                  <input className="input" aria-label="Their title" placeholder="Their title" value={signer.title} onChange={(e) => setTyped({ ...signer, title: e.target.value })} />
                  <input className="input" aria-label="Their email" type="email" placeholder="Their email" value={signer.email} onChange={(e) => setTyped({ ...signer, email: e.target.value })} />
                  {editSigner && (
                    <button type="button" className="tp-flink" onClick={() => setEditSigner(false)}>
                      Done
                    </button>
                  )}
                </div>
              )}
              {isCall && data.ai === "on" && hasCall && (
                <label className="pz-switch">
                  <input type="checkbox" role="switch" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
                  <span className="pz-track" aria-hidden>
                    <span />
                  </span>
                  <span>
                    <strong>Draft the whole proposal with Merlin</strong>
                    <span className="pz-note">
                      {callText.trim().length < 200 ? (
                        "Needs a few more lines than this. Merlin fills the template from what you wrote instead."
                      ) : useAi ? (
                        <>
                          {AI_CONSENT}{" "}
                          <a href="/privacy" target="_blank" rel="noreferrer">
                            Privacy
                          </a>
                        </>
                      ) : (
                        "Off. Merlin only fills the blanks it finds, read in this browser, and nothing is kept."
                      )}
                    </span>
                  </span>
                </label>
              )}
              {isCall && data.ai !== "on" && hasCall && <span className="pz-note">Merlin fills the template from what it finds, read in this browser and not kept. Anything not settled is left as a labelled blank.</span>}
              {aiOut && usedUp && (
                <div className="pp-aiout" role="note">
                  <p className="pz-note">{usedUp.words}</p>
                  <a className="btn btn-pine" href={usedUp.pack}>
                    {usedUp.button}
                  </a>
                </div>
              )}
              {err && <p className="pp-err">{err}</p>}
              <div className="pz-go">
                <button type="button" className="btn btn-pine btn-lg" aria-busy={busy === "draft"} disabled={!!busy || (!company && !pick) || aiOut} onClick={() => void draft()}>
                  {busy === "draft" ? (ai ? "Merlin is drafting it" : "Drafting") : hasCall ? "Draft it" : mode === "blank" ? "Start blank" : "Start from the template"}
                </button>
                <span className="pz-note">{!company && !pick ? "Type who it's for first." : ai ? "About 30 seconds. Uses your Merlin allowance, no credits. You review everything before it is sent." : "No credits. You review everything before it is sent."}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (ready)
    return (
      <div className="page-wide pp-page sc-page">
        <button type="button" className="page-back" onClick={leave}>
          <IconChevron dir="left" /> Proposals
        </button>
        <header className="cu-head">
          <h1 className="cu-h1" ref={head} tabIndex={-1}>
            {title}
          </h1>
        </header>
        <div className="sc-ready">
          <section className="sc-done" aria-labelledby="sc-ready-h">
            <span id="sc-ready-h" className="sc-done-t">
              Draft ready
            </span>
            {ready.done.map((d) => (
              <div key={d} className="sc-tick">
                <IconCheck size={18} />
                <span>{d}</span>
              </div>
            ))}
            {ready.check.length > 0 ? (
              <div className="sc-check">
                <strong>
                  {ready.check.length} {ready.check.length === 1 ? "thing" : "things"} to check
                </strong>
                <ul>
                  {ready.check.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ) : (
              <div className="sc-check" data-ok>
                <strong>Nothing left blank</strong>
                <span>Read it through before you send it.</span>
              </div>
            )}
            {/* Not on Merlin by its name or the website the call gave: add it or pick it, here (AddCompany.tsx). */}
            {!ready.proposal.company.id && (
              <LinkCompany
                p={ready.proposal}
                site={ready.site}
                lead={ready.proposal.company.name ? `${ready.proposal.company.name} isn't linked to a company on Merlin yet, so your pipeline won't move when they sign.` : undefined}
                onLinked={(r) => setReady({ ...ready, proposal: { ...ready.proposal, company: r.company } })}
              />
            )}
            <div className="sc-btns">
              <button type="button" className="btn btn-pine btn-lg" onClick={() => onMade(ready.proposal, ready.toFix)}>
                Open the draft
              </button>
              <button type="button" className="btn btn-lg" onClick={() => setReady(null)}>
                Start over
              </button>
            </div>
          </section>
          <section className="sc-used" aria-labelledby="sc-used-h">
            <span id="sc-used-h" className="sc-used-t">
              Where each part came from
            </span>
            {ready.used.map((u) => (
              <div key={u.from} className="sc-used-row">
                <span className="sc-used-from">{u.from}</span>
                <span>{u.what}</span>
              </div>
            ))}
          </section>
        </div>
      </div>
    );

  if (live.state.status === "running" || (busy === "draft" && live.state.status !== "idle"))
    return (
      <div className="page-wide pp-page sc-page">
        <header className="cu-head">
          <h1 className="cu-h1">{title}</h1>
          <p className="cu-lead">Merlin is drafting it from the call, in your template and your words.</p>
        </header>
        <LiveView state={live.state} title="Drafting your proposal" onCancel={() => void live.cancel()} />
      </div>
    );

  return (
    <div className="page-wide pp-page sc-page">
      <button type="button" className="page-back" onClick={leave}>
        <IconChevron dir="left" /> Proposals
      </button>
      <header className="cu-head">
        <h1 className="cu-h1" ref={head} tabIndex={-1}>
          {title}
        </h1>
        <p className="cu-lead">Start from the conversation you already had. Merlin fills in what was said, in your template, in your words.{casesWords}</p>
      </header>

      {!(picked && !picked.c.hidden) && (
        <section className="sc-step" aria-labelledby="sc-co-h">
          <h2 className="sc-h2" id="sc-co-h">
            Who is it for?
          </h2>
          <div className="pp-co">
            <input id="pp-co" className="input" aria-label="The company" autoComplete="off" placeholder="Search Merlin, or type its name" value={q} onChange={(e) => (setQ(e.target.value), picked?.c.hidden || setPick(null))} />
            {picked && <p className="pp-co-picked">{picked.c.hidden ? "A locked company on Merlin. Type its name: it stays on your proposal only." : "On Merlin: its facts fill in."}</p>}
            {/* Nothing on Merlin by that name: add it from its website, here. */}
            {!pick && q.trim().length >= 3 && matches.length === 0 &&
              (addCo ? (
                <AddCompany name={q.trim()} onCancel={() => setAddCo(false)} onAdded={(r) => (setPick(r.companyId), setQ(r.name), setAddCo(false), toast(r.added ? `Added ${r.name} to Merlin.` : `${r.name} was on Merlin already.`))} />
              ) : (
                <p className="pp-help">
                  Not on Merlin yet?{" "}
                  <button type="button" className="tp-flink" onClick={() => setAddCo(true)}>
                    Add {properCase(q.trim())} to Merlin
                  </button>{" "}
                  or keep typing: Merlin links it when you draft, by its name or the website in the call.
                </p>
              ))}
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
        </section>
      )}

      <section className="sc-step" aria-labelledby="sc-h1">
        <h2 className="sc-h2" id="sc-h1">
          1. Where&#39;s the conversation?
        </h2>
        <div className="sc-opts">
          {granolaSlot && card("granola", "From Granola", "Pick the call, and Merlin reads its transcript.")}
          {card("paste", "Paste or drop a transcript", "From Zoom, Gong, Otter or anywhere else.")}
          {card("agreed", "Tell Merlin what was agreed", "Type or talk for a minute. Good for calls you didn't record.")}
        </div>
        {src === "granola" && granolaSlot && (
          /* The Granola picker (GranolaCallPicker.tsx, lib/granola): it hands back the transcript, like a dropped file. */
          <div className="sc-granola" data-slot="granola">
            {granolaSlot({ companyId: pick, companyName: company || undefined, pickedId: noteId, onPick: takeCall, onPaste: () => (setSrc("paste"), setSrcPicked(true)) })}
            {text && noteId && <p className="pp-muted">{text.trim().split(/\s+/).length.toLocaleString("en-US")} words from Granola</p>}
          </div>
        )}
        {src === "paste" && (
          <div
            className="pp-drop"
            data-on={drop}
            onDragOver={(e) => (e.preventDefault(), setDrop(true))}
            onDragLeave={() => setDrop(false)}
            onDrop={(e) => (e.preventDefault(), setDrop(false), void readFile(e.dataTransfer.files?.[0]))}
          >
            <textarea
              id="pp-call"
              className="input pp-paste"
              aria-label="The transcript"
              placeholder="Paste the transcript or your meeting notes, or drop a .txt, .vtt, .srt or .docx file here"
              value={text}
              onChange={(e) => (setText(e.target.value), setFileName(null))}
              rows={6}
            />
            <div className="pp-drop-row">
              <button type="button" className="tp-flink" onClick={() => fileRef.current?.click()}>
                Choose a file
              </button>
              {fileName && <span className="pp-muted">{fileName}</span>}
              {text.trim() && <span className="pp-muted">{text.trim().split(/\s+/).length.toLocaleString("en-US")} words</span>}
            </div>
            <input ref={fileRef} type="file" accept=".txt,.vtt,.srt,.md,.docx,text/plain,text/vtt,text/markdown,application/vnd.openxmlformats-officedocument.wordprocessingml.document" hidden onChange={(e) => (void readFile(e.target.files?.[0]), (e.target.value = ""))} />
          </div>
        )}
        {src === "agreed" && (
          <div className="sc-agreed">
            <textarea
              className="input pp-paste"
              aria-label="What was agreed"
              rows={5}
              placeholder="Like: two phases. A 45-day assessment at $24k fixed, then the fractional CRO at $11k a month if they opt in. Dana, the CEO, signs."
              value={agreed}
              onChange={(e) => setAgreed(e.target.value)}
            />
            <div className="ci-row">
              <MicButton speech={speech} label="Talk instead of typing" />
              <span className="ci-hint">{speech.can ? "Tap the mic and say what was agreed. " : ""}Anything you don&#39;t say is left as a blank to fill.</span>
            </div>
          </div>
        )}
        <div className="pp-start-more">
          <label className="pp-field">
            <span className="pp-field-l">The call&#39;s date (optional)</span>
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </label>
        </div>
      </section>

      <section className="sc-step" aria-labelledby="sc-h2">
        <h2 className="sc-h2" id="sc-h2">
          2. Start from one of your templates
        </h2>
        <div className="sc-opts">
          {tplList.map((t) => {
            const n = used[t.id] ?? 0;
            return (
              <button key={t.id} type="button" className="sc-opt" aria-pressed={tplNow === t.id} data-on={tplNow === t.id} disabled={!t.open} onClick={() => (setTpl(t.id), setTplPicked(true))}>
                <span className="sc-opt-t">
                  {t.mine && <span className="pp-yours">Yours</span>} {t.title.split(":")[0]}
                </span>
                <span className="sc-opt-s">
                  {t.mine ? `${t.sections} sections, from ${t.about}` : t.about}
                  {n ? ` Used ${n === 1 ? "once" : n === 2 ? "twice" : `${n} times`}.` : ""}
                </span>
                {t.id === best.id && best.score >= 2 && <span className="sc-best">Best fit for {signerFirst ? `what ${signerFirst} asked for` : "this call"}</span>}
                {!t.open && <span className="bl-tag bl-tag-lock">Close</span>}
              </button>
            );
          })}
          {allTpl && (
            <button type="button" className="sc-opt" aria-pressed={tplNow === "blank"} data-on={tplNow === "blank"} onClick={() => (setTpl("blank"), setTplPicked(true))}>
              <span className="sc-opt-t">A blank page</span>
              <span className="sc-opt-s">The usual sections, nothing filled in.</span>
            </button>
          )}
        </div>
        <span className="pp-help">
          {shownTpl.length > 3 && (
            <>
              <button type="button" className="tp-flink" onClick={() => setAllTpl((x) => !x)}>
                {allTpl ? "Show fewer" : `Show all ${shownTpl.length + 1}`}
              </button>{" "}
              ·{" "}
            </>
          )}
          {data.templates.some((t) => t.mine) ? "Your templates came from proposals you uploaded. " : ""}
          <button type="button" className="tp-flink" aria-busy={busy === "template"} disabled={!!busy} onClick={() => tplRef.current?.click()}>
            {busy === "template" ? "Reading it" : "Add one from a .docx or PDF"}
          </button>
        </span>
        <input ref={tplRef} type="file" accept={TEMPLATE_ACCEPT} hidden onChange={(e) => (void addTemplate(e.target.files?.[0]), (e.target.value = ""))} />
      </section>

      <section className="sc-step" aria-labelledby="sc-h3">
        <h2 className="sc-h2" id="sc-h3">
          3. Who signs
        </h2>
        {!editSigner && signer.name ? (
          <div className="sc-signer">
            <span className="sc-signer-main">
              <strong>
                {signer.name}
                {signer.title ? `, ${signer.title}` : ""}
              </strong>
              {signer.email && <span>{signer.email}</span>}
              <span className="cu-found">{typed ? (fromCall && typed.email === fromCall ? "On the call you picked in Granola" : "Typed by you") : found.found}</span>
            </span>
            <button type="button" className="tp-flink" onClick={() => (setTyped(signer), setEditSigner(true))}>
              Change
            </button>
          </div>
        ) : (
          <div className="sc-signer-edit">
            {!signer.name && <p className="pp-help">Merlin didn&#39;t find who signs in the call or your record. Type them, or leave it for later.</p>}
            <input className="input" aria-label="Their name" placeholder="Their name" value={signer.name} onChange={(e) => setTyped({ ...signer, name: e.target.value })} />
            <input className="input" aria-label="Their title" placeholder="Their title" value={signer.title} onChange={(e) => setTyped({ ...signer, title: e.target.value })} />
            <input className="input" aria-label="Their email" type="email" placeholder="Their email" value={signer.email} onChange={(e) => setTyped({ ...signer, email: e.target.value })} />
            {editSigner && (
              <button type="button" className="tp-flink" onClick={() => setEditSigner(false)}>
                Done
              </button>
            )}
          </div>
        )}
      </section>

      {data.ai === "on" && hasCall && (
        <label className="pp-ai">
          <input type="checkbox" checked={useAi} onChange={(e) => setUseAi(e.target.checked)} />
          <span>
            <b>Draft the whole proposal with Merlin</b>
            <span className="pp-muted">
              {callText.trim().length < 200 ? (
                "Needs a few more lines than this. Merlin fills the template from what you wrote instead."
              ) : (
                <>
                  {AI_CONSENT}{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer">
                    Privacy
                  </a>
                </>
              )}
            </span>
          </span>
        </label>
      )}
      {data.ai !== "on" && hasCall && <p className="pp-help">Merlin fills the template from what it finds, read in this browser and not kept. Anything not settled is left as a labelled blank.</p>}
      {aiOut && usedUp && (
        <div className="pp-aiout" role="note">
          <p className="pp-help">{usedUp.words}</p>
          <a className="btn btn-pine btn-lg" href={usedUp.pack}>
            {usedUp.button}
          </a>
        </div>
      )}
      {err && <p className="pp-err">{err}</p>}
      <div className="sc-go">
        <button type="button" className="btn btn-pine btn-lg" aria-busy={busy === "draft"} disabled={!!busy || (!company && !pick) || aiOut} onClick={() => void draft()}>
          {busy === "draft" ? (ai ? "Merlin is drafting it" : "Drafting") : hasCall ? "Draft it" : "Start from the template"}
        </button>
        <span className="pp-muted">{!company && !pick ? "Type who it's for first, at the top." : ai ? "About 30 seconds. You review everything before it's sent." : "You review everything before it's sent."}</span>
      </div>
    </div>
  );
}
