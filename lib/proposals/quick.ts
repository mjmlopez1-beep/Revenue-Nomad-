/**
 * The one-tap start (RN_PROPOSALS2): tap a call or a company and the document opens at once,
 * with everything Merlin already knows in place and no AI on that path.
 *
 *   quickProposal   one request, no model, no call recorder: the member's last-used template (else
 *                   the one that fits best), cut to the sections Merlin can fill; the company's facts
 *                   as the member sees them; who signs (the call's reading, else the call's other
 *                   person, else the deal in their pipeline); the price from ONE calculation with
 *                   "What should I charge" (lib/proposals/rates.ts proposalRate, worked out in the app
 *                   from the same view and sent here, the call's own fee first); the closest Evidence
 *                   Bank cases; their standing terms and profile from their last proposal. Lines the
 *                   template has for things nobody knows yet are left out, so a new proposal opens
 *                   with a few blanks (a start date), not thirty-six.
 *   writeSections   then only "What we heard" and "What I recommend" are written by Merlin's AI, from
 *                   the call's reading (lib/proposals/recent.ts CallPrep: a summary, what was agreed, a
 *                   few of the buyer's lines), never the whole transcript, streamed into the document
 *                   through the live job (lib/proposals/live.ts). The member's edits win: the app puts
 *                   each section in only where the member hasn't changed it; if the app is gone, the
 *                   server puts them in a few seconds later on the same rule.
 *
 * Consent, the AI budget and the Close gate are the draft's own (lib/proposals/draft.ts, aiUsage.ts).
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member, type State } from "../table";
import { styleOf, voiceSummary } from "../voice";
import { autoProof } from "../evidenceWire";
import { blockDef, fieldDefaults, guidanceFor, moneyOf, newBlockId, placeholders, templateBlocks, templateDef } from "./library";
import { blocksOfMine, isMineId, templatesOf } from "./mine";
import { templateChoices } from "./kit";
import { bestTemplate, properCase } from "./startCall";
import { ProposalProblem, buildGate, companyFor, createProposal, recOf, touch } from "./store";
import { aiConfigured, aiModel, aiTestBase } from "./aiConfig";
import { AI_PACK_LINK, budgetOf, chargeIn, usedUpWords } from "./aiUsage";
import { AI_OFF, AI_PLAN, agreeToAi, agreedAt } from "./draft";
import { sectionsSoFar } from "./streamParse";
import { ensurePrep, keptCall, pastePrep, prepFor, prepFrom, type CallPrep } from "./recent";
import { rateMath } from "./rates";
import type { Progress } from "./live";
import { mergeWritten, type WrittenSection } from "./written";
export { mergeWritten, type WrittenSection };
import { briefNotes, cleanCall, daysPerWeekIn, daysWords, deciderOf, emptyWrite, readBrief, shortRole, type BriefMiss, type CallBrief } from "./brief";
import { isOperatorTemplate, operatorSections, type OperatorCtx } from "./operator";
import { SENIOR_OPERATOR } from "./operatorLib";
import { hoursWeekOf } from "./rates";
import { readTranscript, recorderOf } from "../calls/providers";
import type { DiscoveryNote, ProposalBlock, ProposalRec, StoredProposal } from "./types";

/** The two sections Merlin's AI writes. Everything else is filled from Merlin's data. */
export const AI_BLOCKS = ["what_we_heard", "recommendation"] as const;
/** Library sections a quick proposal keeps (in the template's order). The rest need words only the member has. */
export const QUICK_KEEP = new Set(["addendum_header", "cover", "what_we_heard", "recommendation", "milestones", "operating_cadence", "proof", "investment", "payment_schedule", "next_steps", "terms", "agreement", "signature"]);
/** Unknown keys that stay as a blank to fill (the member has to say). Lines with any other unknown key are left out. */
export const ASK_KEYS = new Set(["client.signerName", "client.companyName", "pricing.monthlyFee", "pricing.allocation", "terms.governingLaw", "start.date", "pains", "seats"]);
/** Standing terms and profile carried over from the member's last proposal when the call didn't say. */
// Never the days a week: those come from this call or the member, never silently from the last proposal (a carried-over
// "40 hours a week" priced a 2.5-day plan as full time).
const STANDING = ["term.initialMonths", "term.noticeDays", "term.optOutDay", "billing.dueDays", "terms.governingLaw", "provider.about"];
/** "What I heard" while Merlin reads the call, and when it couldn't: plain words, never an empty box. */
export const HEARD_WAIT = "Merlin is reading the call and writes this section in a few seconds.";
export const HEARD_MISS = "Write what you heard on the call here, or ask Merlin to read the call again.";
/** The sections of the Senior operator family the call brief writes (the rest are Merlin's data). */
export const BRIEF_BLOCKS = ["cover", "what_we_heard", "thesis", "pitfalls", "why_fractional", "engagement_glance", "phases_workstreams", "day30", "the_math", "org_chart", "questions", "next_steps"] as const;
/** Pasted calls, kept in this server's memory only until the brief is read (or this long), then dropped. Never the state, a file or a log. */
export const PASTE_KEEP_MS = 30 * 60_000;
const pasteMap = new Map<string, { at: number; text: string }>();
export const pasteKept = {
  set: (memberId: string, proposalId: string, text: string, nowMs = Date.now()) => {
    for (const [k, v] of pasteMap) if (nowMs - v.at > PASTE_KEEP_MS) pasteMap.delete(k);
    pasteMap.set(`${memberId}|${proposalId}`, { at: nowMs, text });
  },
  peek: (memberId: string, proposalId: string, nowMs = Date.now()) => {
    const v = pasteMap.get(`${memberId}|${proposalId}`);
    return v && nowMs - v.at <= PASTE_KEEP_MS ? v.text : null;
  },
  drop: (memberId: string, proposalId: string) => void pasteMap.delete(`${memberId}|${proposalId}`),
  size: () => pasteMap.size,
};

const money = (n: number) => `$${Math.round(n).toLocaleString("en-US")}`;
const dayWords = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n) : s);

/**
 * One section's text with what Merlin knows: a {{key}} it knows stays (it fills in place); one it
 * doesn't but the member must say stays as a blank; any other unknown is left out (", {{x}}" out of
 * a list, else its whole line). Pure.
 */
export function trimUnknown(body: string, known: (k: string) => boolean): string {
  const unknown = (k: string) => !known(k) && !ASK_KEYS.has(k) && k !== "proposal.version";
  let t = body.replace(/,\s*\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g, (m, k: string) => (unknown(k) ? "" : m)).replace(/\{\{\s*([A-Za-z0-9_.]+)\s*\}\},\s*/g, (m, k: string) => (unknown(k) ? "" : m));
  t = t
    .split("\n")
    .filter((line) => !placeholders(line).some(unknown))
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return t;
}

/**
 * The quick document's sections: a library template cut to QUICK_KEEP with unknown lines left
 * out, or the member's own template whole; "What we heard" and "What I recommend" always there
 * (after the cover), with `heard` and `recommend` as their first words. Pure.
 */
export function quickBlocks(src: ProposalBlock[], known: (k: string) => boolean, o: { mine: boolean; heard: string; recommend: string }): ProposalBlock[] {
  let out = o.mine ? src.map((b) => ({ ...b })) : src.filter((b) => QUICK_KEEP.has(b.blockId)).map((b) => ({ ...b, body: trimUnknown(b.body, known) }));
  // Proof stays only when it holds cases; a section left with nothing but a heading line goes.
  out = out.filter((b) => (b.blockId === "proof" ? known("caseStudies") : o.mine || b.body.replace(/[^A-Za-z0-9{}]/g, "").length > 0));
  for (const [id, text] of [["what_we_heard", o.heard], ["recommendation", o.recommend]] as const) {
    const at = out.findIndex((b) => b.blockId === id);
    if (at >= 0) out[at] = { ...out[at], body: text };
    else {
      const def = blockDef(id)!;
      const nb = { id: newBlockId(), blockId: id, title: id === "recommendation" ? "What I recommend" : def.title, body: text };
      const after = id === "recommendation" ? out.findIndex((b) => b.blockId === "what_we_heard") : out.findIndex((b) => b.blockId === "cover" || b.blockId === "addendum_header");
      out.splice(after + 1, 0, nb);
    }
  }
  return out;
}

/** "What we heard" by Merlin's rules, from the call's reading: the buyer's goal and lines as bullets. */
export function heardByRules(prep: CallPrep | null, callDate: string | null): string {
  if (!prep) return "{{pains}}";
  const lines = prep.lines.filter((l) => l.key !== "budget.signals").slice(0, 4).map((l) => `- ${l.text}`);
  const items = lines.length ? lines : prep.items.slice(0, 4).map((x) => `- ${x}`);
  return `${callDate ? `What we heard on ${callDate}:` : "What we heard:"}\n${items.join("\n") || "{{pains}}"}`;
}
/** "What I recommend" by Merlin's rules: the role, the days or hours, and the first decision. */
export const recommendByRules = (role: string) => `We recommend one option: ${role}, for {{pricing.allocation}}.\n\nAt day 30 you get a readout of what we found and a ranked list of changes, and you decide what we fix first.`;

export interface QuickArgs {
  /** A call from the home's list: its recorder and id, with what the home showed (so nothing waits on the recorder). */
  call?: { recorder?: unknown; id?: unknown; companyId?: unknown; who?: { name?: unknown; email?: unknown } | null; when?: unknown };
  companyId?: unknown;
  companyName?: unknown;
  templateId?: unknown;
  blank?: unknown;
  /** Pasted notes or a transcript: read here by Merlin's rules, kept in memory as a reading, dropped. */
  transcript?: unknown;
  /** The price from proposalRate (the app's one calculation): the fee and the days or hours it covers. */
  rate?: { fee?: unknown; allocation?: unknown } | null;
}
export interface QuickResult {
  proposal: ProposalRec;
  /** This call's draft was there already: it opened instead of a copy. */
  opened: boolean;
  /** The sections Merlin's AI writes next (block ids in this proposal), and whether it can now. */
  ai: { blocks: string[]; state: "ready" | "consent" | "off" | "plan" | "usedup" | "none" };
  /** The call was read in the background, so its terms and who signs are in. */
  prepared: boolean;
}

const role = (s: State, me: Member, pitch?: string | null) => {
  const t = pitch || s.profiles[me.id]?.title || (me.title === "Member" ? "" : me.title);
  const fn = s.profiles[me.id]?.function;
  return (t && t.trim()) || (fn ? `Fractional ${fn} leadership` : "Fractional leadership");
};

/** The AI pass's state for this member now (no model call). */
export function aiState(s: State, memberId: string, nowMs: number, hasCall: boolean): QuickResult["ai"]["state"] {
  if (!hasCall) return "none";
  if (!aiConfigured()) return "off";
  if (!T.closeNow(s, memberId, nowMs)) return "plan";
  if (!budgetOf(s, memberId, nowMs).open) return "usedup";
  return agreedAt(s, memberId) ? "ready" : "consent";
}

/** A pasted call's date from its "Date:" line ("Sep 30" reads "September 30"), or null. Pure. */
export function headerDate(text: string, nowMs = Date.now()): string | null {
  const m = /^\s*date\s*:\s*([^\n]{3,40})$/im.exec(text);
  if (!m) return null;
  const raw = m[1].trim();
  const t = Date.parse(/\d{4}/.test(raw) ? raw : `${raw} ${new Date(nowMs).getUTCFullYear()}`);
  return Number.isNaN(t) ? null : new Date(t).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });
}

/**
 * The Senior operator family as a quick start opens it: the cover, What I heard (Merlin reading the
 * call), Why us from Evidence Bank (only when there is real proof), and the investment with the days
 * a week as said or asked. The other sections arrive from the call brief, in the template's order. Pure.
 */
export function operatorQuick(src: ProposalBlock[], known: (k: string) => boolean, o: { heard: string; proofText: string | null; workedWith: string[]; allocation: string | null }): ProposalBlock[] {
  const empty = { by: "rules", at: "", company: "", people: [], memberRole: "unknown", operator: "", summary: "", insights: [], constraint: null, alternatives: [], shape: { daysPerWeek: null, hoursPerWeek: null, duration: "", phases: [], start: "", reportsTo: "" }, success: [], risks: [], nextSteps: [], questions: [], write: emptyWrite() } as CallBrief;
  const sec = operatorSections(empty, { me: { name: "", title: "", firm: "" }, company: "", callDate: null, proofText: o.proofText, workedWith: o.workedWith, allocation: o.allocation, math: null });
  const out: ProposalBlock[] = [];
  for (const b of src) {
    if (b.blockId === "cover") out.push({ ...b, body: trimUnknown("{{headline}}\nPrepared for {{client.signerName}}, {{client.companyName}}\nPrepared by {{provider.name}}, {{provider.title}}", known) });
    else if (b.blockId === "what_we_heard") out.push({ ...b, title: "What I heard", body: o.heard });
    else if (b.blockId === "proof" && sec.proof) out.push({ ...b, title: sec.proof.title, body: sec.proof.body });
    else if (b.blockId === "investment") out.push({ ...b, title: sec.investment.title, body: sec.investment.body });
  }
  return out;
}

/** The one-tap start. No model, no recorder: everything it uses is already in Merlin (or in this server's memory). */
export async function quickProposal(token: string | null, a: QuickArgs, origin?: string, nowMs = Date.now()): Promise<QuickResult> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) throw new ProposalProblem("You're signed out. Sign in again to work on proposals.", 401);
  buildGate(s, me.id, nowMs, origin);
  const recorder = typeof a.call?.recorder === "string" && /^[a-z]{2,20}$/.test(a.call.recorder) ? a.call.recorder : null;
  const callId = recorder && typeof a.call?.id === "string" && /^[\w-]{1,80}$/.test(a.call.id) ? a.call.id : null;
  const fromCall = recorder && callId ? { recorder, id: callId } : undefined;
  // A second tap on the same call opens the draft already made from it (the call trigger's too).
  if (fromCall) {
    const had = [...(s.proposals ?? [])].reverse().find((p) => p.memberId === me.id && p.fromCall?.recorder === recorder && p.fromCall.id === callId && !p.sends.length);
    if (had) return { proposal: recOf(had, nowMs, origin), opened: true, ai: { blocks: [], state: "none" }, prepared: true };
  }
  const kept = fromCall ? keptCall(me.id, fromCall.recorder, fromCall.id) : null;
  const pasted = typeof a.transcript === "string" ? a.transcript.replace(/\r\n?/g, "\n").trim().slice(0, 400_000) : "";
  const pub = typeof a.companyId === "string" && a.companyId ? a.companyId : typeof a.call?.companyId === "string" && a.call.companyId ? a.call.companyId : kept?.company.id ?? null;
  const co = pub ? await companyFor(token!, pub) : null;
  const name = co?.name || properCase(clip(String(a.companyName ?? kept?.company.name ?? "").trim(), 120)) || "";
  const prep = fromCall ? prepFor(me.id, fromCall.recorder, fromCall.id, nowMs) : pasted.length >= 40 ? prepFrom(pasted, me, { company: name || "the client", minutes: null }, nowMs) : null;
  const when = kept?.startedAt ?? (typeof a.call?.when === "string" && !Number.isNaN(Date.parse(a.call.when)) ? a.call.when : null);
  // A pasted call's date: the recorder's "Date:" line when it has one, never today's date passed off as the call's.
  const callDate = when ? dayWords(when) : pasted ? headerDate(pasted, nowMs) : null;
  const talk = !!fromCall || pasted.length >= 40;

  // The template: picked, blank, else the one they used last, else the closest fit to the call.
  const mineList = templatesOf(s, me.id);
  const valid = (id: string | null) => !!id && (isMineId(id) ? mineList.some((t) => t.id === id) : !!templateDef(id));
  const mineProps = (s.proposals ?? []).filter((p) => p.memberId === me.id).sort((x, y) => y.createdAt.localeCompare(x.createdAt));
  const picked = typeof a.templateId === "string" && a.templateId && a.templateId !== "blank" ? a.templateId : null;
  if (picked && !valid(picked)) throw new ProposalProblem("That template isn't there anymore. Pick another.");
  const blank = a.blank === true || a.templateId === "blank";
  const lastUsed = mineProps.map((p) => p.templateId).find((id) => valid(id)) ?? null;
  // From a call: the Senior operator family (or the member's own template, when they used one last).
  const callDefault = lastUsed && (isMineId(lastUsed) || isOperatorTemplate(lastUsed)) ? lastUsed : SENIOR_OPERATOR;
  const templateId = blank ? null : picked ?? (talk ? callDefault : null) ?? lastUsed ?? bestTemplate(templateChoices(s, me.id, false), [prep?.summary ?? "", ...(prep?.lines.map((l) => l.text) ?? [])].join("\n")).id;
  const mineT = isMineId(templateId) ? mineList.find((t) => t.id === templateId) : undefined;
  const src = mineT ? blocksOfMine(mineT) : templateBlocks(templateId);

  // What Merlin knows, without AI.
  const last = mineProps[0]?.fields ?? {};
  const deal = co ? [...(s.pipeline?.[me.id]?.entries ?? [])].filter((e) => e.companyId === co.internal).sort((x, y) => (y.updatedAt ?? "").localeCompare(x.updatedAt ?? ""))[0] : undefined;
  const r = role(s, me, deal?.pitch);
  const fields: Record<string, string> = {};
  const set = (k: string, v: string | null | undefined) => v && v.trim() && !fields[k] && (fields[k] = clip(v.trim(), 2000));
  if (name) set("headline", isOperatorTemplate(templateId) ? "A senior operator inside the business" : `${r} for ${name}`);
  // Who signs: the call's reading, else the call's other person, else the deal (createProposal fills that one).
  const who = a.call?.who && typeof a.call.who === "object" ? { name: clip(String(a.call.who.name ?? "").trim(), 100), email: clip(String(a.call.who.email ?? "").trim().toLowerCase(), 160) } : null;
  const fromList = kept?.people.find((p) => p.name) ?? kept?.people[0] ?? null;
  const sName = prep?.signer.name || who?.name || fromList?.name || "";
  const sEmail = (prep?.signer.email || (sName && sName === (who?.name || fromList?.name) ? who?.email || fromList?.email : "") || "").toLowerCase();
  set("client.signerName", sName);
  set("client.signerTitle", prep?.signer.title);
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(sEmail)) set("client.signerEmail", sEmail);
  set("discovery.callDate", callDate);
  set("goals.target", prep?.goal);
  // The price: what the call agreed first, then the app's one calculation (proposalRate).
  for (const [k, v] of Object.entries(prep?.terms ?? {})) set(k, v);
  const rf = a.rate && typeof a.rate === "object" ? moneyOf(String(a.rate.fee ?? "")) : null;
  if (rf && rf > 0 && rf < 1_000_000) set("pricing.monthlyFee", money(rf));
  if (a.rate && typeof a.rate === "object" && typeof a.rate.allocation === "string" && hoursWeekOf(a.rate.allocation)) set("pricing.allocation", clip(a.rate.allocation, 80));
  // Days a week said outright in a pasted call ("2.5 days a week"). Never assumed.
  if (pasted) {
    const d = daysPerWeekIn(cleanCall(pasted).text);
    if (d) set("pricing.allocation", daysWords(d));
  }
  for (const k of STANDING) set(k, last[k]);
  const fee = moneyOf(fields["pricing.monthlyFee"]);
  const m = rateMath(fee, fields["pricing.allocation"]);
  if (fee) set("pricing.stepDownFee", money(Math.round((fee * 2) / 3 / 250) * 250));
  if (m.hourly) set("pricing.overageRate", money(Math.round(m.hourly / 5) * 5));
  if (m.hoursMonth) set("pricing.hoursMonth", String(m.hoursMonth));
  // Evidence Bank: the closest one or two ready cases (Close), as createProposal would pick them.
  const proof = co && T.closeNow(s, me.id, nowMs) ? await autoProof(me.id, co.internal, nowMs) : null;
  const defaults = fieldDefaults(src);
  const filled = new Set([...Object.keys(fields), ...Object.keys(defaults), ...Object.keys(co?.facts ?? {}), "provider.name", "provider.signerName", "provider.title", "proposal.date", ...(name ? ["client.companyName"] : []), ...(proof?.ids.length ? ["caseStudies"] : []), ...(deal?.to?.name && !deal.to.google ? ["client.signerName", "client.signerTitle"] : [])]);
  const stateNow = aiState(s, me.id, nowMs, talk);
  // From a call, What I heard waits for Merlin's reading of it (never the rules' guesses from the talk); said plainly when it can't come.
  const heard = talk ? (stateNow === "ready" ? HEARD_WAIT : HEARD_MISS) : heardByRules(null, callDate);
  const blocks = isOperatorTemplate(templateId) && !mineT ? operatorQuick(src, (k) => filled.has(k), { heard, proofText: proof?.text ?? null, workedWith: workedWithOf(s, me.id), allocation: fields["pricing.allocation"] ?? null }) : quickBlocks(src, (k) => filled.has(k), { mine: !!mineT, heard, recommend: recommendByRules(r) });

  const at = new Date(nowMs).toISOString();
  // From the call, until Merlin's brief replaces them: only the terms the call settled (never lines guessed from the talk).
  const notes: DiscoveryNote[] = prep?.items.length ? [{ key: "call.summary", text: clip(prep.summary, 400), at }, ...prep.items.slice(0, 6).map((t) => ({ key: "call.agreed", text: clip(t, 400), at }))] : [];
  const proposal = await createProposal(
    token,
    {
      templateId,
      companyId: co ? pub : undefined,
      companyName: co ? undefined : name,
      fields,
      blocks,
      notes,
      ...(proof?.ids.length ? { proofCases: proof.ids } : {}),
      ...(fields["client.signerName"] && fields["client.signerEmail"] ? { signer: { name: fields["client.signerName"], email: fields["client.signerEmail"], ...(fields["client.signerTitle"] ? { title: fields["client.signerTitle"] } : {}) } } : {}),
      signerOnCall: prep?.signerOnCall ?? null,
      source: "quick",
      ...(fromCall ? { fromCall } : {}),
    },
    origin,
    nowMs,
  );
  if (pasted && prep) pastePrep.set(me.id, proposal.id, prep);
  // The pasted call, kept in memory until Merlin's brief reads it (then dropped). Never the state.
  if (pasted.length >= 40) pasteKept.set(me.id, proposal.id, pasted, nowMs);
  const s2 = await loadState();
  const written = isOperatorTemplate(templateId) ? BRIEF_BLOCKS : AI_BLOCKS;
  const ids = proposal.blocks.filter((b) => (written as readonly string[]).includes(b.blockId)).map((b) => b.id);
  return { proposal, opened: false, ai: { blocks: ids, state: aiState(s2, me.id, nowMs, talk) }, prepared: !!prep };
}

/* ---------- the AI pass: the call brief, then the sections it writes ---------- */

/** Members with a pass on its way (one at a time). */
const writing = new Set<string>();
/** How long the server waits for the app to put the sections in before it does. */
export const APPLY_GRACE_MS = 6000;

export interface SectionsResult {
  sections: WrittenSection[];
  /** The text each existing section had before (the app puts a section in only where it still reads this). */
  before: Record<string, string>;
  /** Fields the brief settles, put in only where the member hasn't set them: who signs, the days a week and their hours. */
  fields: Record<string, string>;
  /** The private notes From the call, from the brief (never the noise the rules once kept). */
  notes: DiscoveryNote[];
  brief: CallBrief;
  /** Did Merlin's AI read the call? When not, why, in the member's words (and whether trying again can help). */
  ai: { ran: boolean; miss: BriefMiss | null; retry: boolean };
  ms: number;
}

/** The context the operator family writes with: the member, the company, their Evidence Bank, the days a week. Pure. */
export function ctxFor(p: Pick<StoredProposal, "companyName" | "fields">, me: { name: string; title: string; firm: string }, workedWith: string[], allocation: string | null): OperatorCtx {
  return { me, company: p.companyName, callDate: p.fields["discovery.callDate"] ?? null, proofText: p.fields.caseStudies || null, workedWith, allocation, math: null };
}

/** The companies a member named in their ready Evidence Bank cases: real data only, for Why us. */
export function workedWithOf(s: State, memberId: string): string[] {
  const names = (s.evidence?.[memberId] ?? []).filter((c) => c.status === "ready" && c.clientNamed && c.clientName).map((c) => String(c.clientName).trim());
  return [...new Set(names)].slice(0, 12);
}

/** The member's firm when they place operators (a profile title "Founder, Acme Partners" or their company field), else "". */
const firmOf = (s: State, me: Member): string => {
  const prof = s.profiles[me.id] as { firm?: string; company?: string } | undefined;
  return String(prof?.firm ?? prof?.company ?? "").trim().slice(0, 80);
};

/**
 * Where each written section goes. Existing blocks by block id; a missing one (the operator family's
 * sections Merlin writes from the brief) goes in after the nearest earlier block of the template's order. Pure.
 */
export function placeSections(blocks: ProposalBlock[], order: string[], written: Record<string, { title: string; body: string }>, newId: () => string = newBlockId): WrittenSection[] {
  const out: WrittenSection[] = [];
  const present = new Map(blocks.map((b) => [b.blockId, b]));
  let last: string | null = null;
  const seq = order.length ? order : Object.keys(written);
  for (const blockId of seq) {
    const have = present.get(blockId);
    const w = written[blockId];
    if (have) {
      if (w) out.push({ id: have.id, blockId, title: w.title || have.title, body: w.body });
      last = have.id;
    } else if (w) {
      const id = newId();
      out.push({ id, blockId, title: w.title, body: w.body, add: { after: last } });
      last = id;
    }
  }
  return out;
}

/**
 * Read the call into its brief (brief.ts: Merlin's AI, else its rules with the reason) and write the
 * proposal's sections from it: the Senior operator family's sections, or What we heard and What I
 * recommend in any other template. The transcript is read here (the recorder again, or the pasted
 * text kept in memory until now) and dropped. Nothing is saved at once except the brief: the app
 * puts the sections in as an edit; APPLY_GRACE_MS later the server puts in any still untouched.
 */
export async function writeSections(token: string | null, id: string, a: { agree?: unknown }, origin?: string, nowMs = Date.now(), progress?: Progress): Promise<SectionsResult> {
  const t0 = Date.now();
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) throw new ProposalProblem("You're signed out. Sign in again.", 401);
  // Building proposals, and Merlin reading a call for one, is Close (the trial counts).
  if (!T.closeNow(s, me.id, nowMs)) throw new ProposalProblem(AI_PLAN, 403);
  if (aiConfigured() && !agreedAt(s, me.id)) {
    if (a.agree !== true) throw new ProposalProblem("Merlin reads the call to write the proposal. It keeps the brief, not the transcript. Agree first.", 428);
    await agreeToAi(token, nowMs);
  }
  const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (!p) throw new ProposalProblem("That proposal isn't there anymore. Open Proposals again.", 404);
  if (writing.has(me.id)) throw new ProposalProblem("Merlin is reading a call already. Wait for it, then try again.", 409);
  writing.add(me.id);
  try {
    progress?.step("read", "Reading the call", "active");
    // The call: the recorder's transcript read again now, or what was pasted (kept in memory until this pass).
    let text: string | null = null;
    if (p.fromCall) {
      const r = recorderOf(p.fromCall.recorder);
      text = r ? await readTranscript(r, me, p.fromCall.id).catch(() => null) : null;
    } else text = pasteKept.peek(me.id, p.id, nowMs);
    if (!text || !text.trim()) {
      const miss: BriefMiss = { code: "short", message: p.fromCall ? "Merlin couldn't get the call from your recorder just now." : "Merlin doesn't keep pasted calls, and this one is gone. Paste it again to have Merlin read it." };
      return finish(p, me, s, null, miss, t0, progress);
    }
    const kept = p.fromCall ? keptCall(me.id, p.fromCall.recorder, p.fromCall.id) : null;
    const c = cleanCall(text);
    progress?.step("read", `Read the call · ${c.words.toLocaleString("en-US")} words${c.dropped ? `, ${c.dropped} lines of small talk and audio trouble left out` : ""}`, "done");
    progress?.step("brief", "Working out who's who and what they said", "active");
    const v = s.voice?.[me.id];
    const r = await readBrief(me.id, text, { me: { name: me.name, email: me.email }, company: p.companyName, people: kept?.people, voice: v ? voiceSummary(styleOf(v), me.name) : null, signal: progress?.signal }, nowMs);
    // Read: the pasted text is dropped now (a recorder's call can be read again).
    if (r.ai && !p.fromCall) pasteKept.drop(me.id, p.id);
    return finish(p, me, s, r.brief, r.miss, t0, progress);
  } finally {
    writing.delete(me.id);
  }
}

/** The sections, fields and notes from a brief (or only what is certain), and the brief kept on the proposal. */
async function finish(p: StoredProposal, me: Member, s: State, brief0: CallBrief | null, miss: BriefMiss | null, t0: number, progress?: Progress): Promise<SectionsResult> {
  const { briefByRules } = await import("./brief");
  const brief = brief0 ?? briefByRules("", me, { company: p.companyName });
  const ai = brief.by === "ai";
  const top = deciderOf(brief);
  if (progress && ai) {
    const who = brief.people.filter((x) => x.side !== "member").slice(0, 4).map((x) => `${x.name}${x.role ? ` (${shortRole(x.role)})` : ""}`);
    progress.step("brief", who.length ? `Who's who: ${who.join(", ")}` : "Read who was on the call", "done");
    progress.step("heard", `${brief.insights.length} things you heard${brief.alternatives.length ? `, ${brief.alternatives.length} alternatives they're weighing` : ""}`, "done");
  }
  // The days a week: what the member set, else what the call said. Never assumed.
  const allocation = p.fields["pricing.allocation"] || (brief.shape.daysPerWeek ? daysWords(brief.shape.daysPerWeek) : null);
  const ctx = ctxFor(p, { name: me.name, title: s.profiles[me.id]?.title || (me.title === "Member" ? "" : me.title) || "", firm: firmOf(s, me) }, workedWithOf(s, me.id), allocation);
  let written: Record<string, { title: string; body: string }> = {};
  const op = isOperatorTemplate(p.templateId);
  if (ai) {
    written = operatorSections(brief, ctx);
    if (!op) {
      // Another template (the library's, or one of the member's own): the sections it has, under its own headings, and What I recommend.
      const rec = [brief.write.thesis.line, `We recommend one option: ${role(s, me)}, for {{pricing.allocation}}.`, brief.write.plan.decision ? `At day 30: ${brief.write.plan.decision}` : ""].filter(Boolean).join("\n\n");
      const present = new Set(p.blocks.map((b) => b.blockId));
      written = Object.fromEntries(
        Object.entries({ ...written, recommendation: { title: "", body: rec } })
          .filter(([k]) => present.has(k) && !["cover", "investment", "proof"].includes(k))
          .map(([k, v]) => [k, { title: "", body: v.body }]),
      );
    } else delete written.investment;
  } else {
    // Merlin's AI didn't read it: only what is certain, and What I heard says so in plain words.
    written = { what_we_heard: { title: op ? "What I heard" : "What we heard", body: HEARD_MISS } };
  }
  const order = op ? (templateDef(p.templateId)?.blocks.map((b) => b.blockId) ?? []) : [];
  const keep = (blockId: string) => !op || (BRIEF_BLOCKS as readonly string[]).includes(blockId);
  // Without the AI, What I heard says so only where it still reads "Merlin is reading the call".
  const sections = placeSections(p.blocks, order, Object.fromEntries(Object.entries(written).filter(([k]) => keep(k)))).filter((x) => ai || p.blocks.find((b) => b.id === x.id)?.body === HEARD_WAIT);
  for (const x of sections) progress?.section(x.id, x.title, "done");
  const fields: Record<string, string> = {};
  const put = (k: string, v: string | null | undefined) => v && v.trim() && !p.fields[k] && (fields[k] = v.trim().slice(0, 200));
  if (top) (put("client.signerName", top.name), put("client.signerTitle", shortRole(top.role)));
  if (allocation) {
    put("pricing.allocation", allocation);
    const hm = rateMath(moneyOf(p.fields["pricing.monthlyFee"]), allocation).hoursMonth;
    if (hm) put("pricing.hoursMonth", String(hm));
  }
  const at = new Date().toISOString();
  const notes: DiscoveryNote[] = ai ? [...p.notes.filter((n) => !n.key.startsWith("call.") && !["objectionsRaised", "nextStep"].includes(n.key)), ...briefNotes(brief, at)].slice(0, 60) : p.notes;
  // The brief is kept with the proposal, for the member alone (the rail's From the call, the agreement). Never the transcript.
  await T.mutate((d) => {
    const x = (d.proposals ?? []).find((y) => y.id === p.id && y.memberId === me.id);
    if (x && (ai || !x.brief)) x.brief = brief;
  });
  const before = Object.fromEntries(p.blocks.map((b) => [b.id, b.body]));
  setTimeout(() => void applyWritten(me.id, p.id, sections, before, fields).catch(() => {}), APPLY_GRACE_MS).unref?.();
  progress?.step("ready", ai ? `Ready · ${sections.length} sections written from the call` : (miss?.message ?? "Merlin couldn't read the call."), "done");
  return { sections, before, fields, notes, brief, ai: { ran: ai, miss: ai ? null : miss, retry: !ai && !!miss && ["busy", "failed", "shape", "short"].includes(miss.code) }, ms: Date.now() - t0 };
}

/**
 * Put the written sections in where each still reads as it did before the pass (and the new ones
 * where they aren't yet), and the fields where the member left them empty. Returns how many went in.
 */
export async function applyWritten(memberId: string, id: string, sections: WrittenSection[], before: Record<string, string>, fields: Record<string, string> = {}, nowMs = Date.now()): Promise<number> {
  return T.mutate((s) => {
    const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === memberId);
    if (!p || p.sends.length) return 0;
    let n = 0;
    for (const x of sections) {
      const b = p.blocks.find((y) => y.id === x.id);
      if (b) {
        if (b.body === before[x.id] && b.body !== x.body) (b.body = x.body), (b.title = x.title || b.title), n++;
      } else if (x.add) {
        const at = x.add.after ? p.blocks.findIndex((y) => y.id === x.add!.after) : -1;
        p.blocks.splice(at + 1, 0, { id: x.id, blockId: x.blockId, title: x.title, body: x.body });
        n++;
      }
    }
    for (const [k, v] of Object.entries(fields)) if (!p.fields[k]) ((p.fields[k] = v), (p.sources[k] = "call"), n++);
    if (n) touch(p, new Date(nowMs).toISOString());
    return n;
  });
}

/** The old name: put sections in for the member who owns the token. */
export async function applyIfUntouched(token: string | null, id: string, sections: WrittenSection[] | { id: string; body: string }[], before: Record<string, string>, nowMs = Date.now()): Promise<number> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return 0;
  return applyWritten(me.id, id, sections.map((x) => ({ blockId: "", title: "", ...x })) as WrittenSection[], before, {}, nowMs);
}

/**
 * Switch a draft's template (the rail's Template): its sections from the new one, cut and filled as a
 * quick start is, keeping the member's words in "What we heard" and "What I recommend" and every
 * field they filled. A draft only; with `rev`, refused when it changed elsewhere since.
 */
export async function retemplate(token: string | null, id: string, a: { templateId?: unknown; rev?: unknown }, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const seed = await loadSeed();
  const { checkRev } = await import("./store");
  return T.mutate((s) => {
    const me = memberByToken(seed, token, s);
    if (!me) throw new ProposalProblem("You're signed out. Sign in again.", 401);
    buildGate(s, me.id, nowMs, origin);
    const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
    if (!p) throw new ProposalProblem("That proposal isn't there anymore. Open Proposals again.", 404);
    if (p.sends.length) throw new ProposalProblem("It went out already, so it keeps its template. Duplicate it to start from another.");
    checkRev(p, a.rev);
    const tid = a.templateId === "blank" || a.templateId === null || a.templateId === "" ? null : String(a.templateId ?? "");
    const mineT = isMineId(tid) ? templatesOf(s, me.id).find((t) => t.id === tid) : undefined;
    if (tid && !mineT && !templateDef(tid)) throw new ProposalProblem("That template isn't there anymore. Pick another.");
    const src = mineT ? blocksOfMine(mineT) : templateBlocks(tid);
    const defaults = fieldDefaults(src);
    for (const [k, v] of Object.entries(defaults)) if (!p.fields[k]) (p.fields[k] = v), (p.sources[k] = "manual");
    const body = (id: string) => p.blocks.find((b) => b.blockId === id)?.body ?? "";
    const known = (k: string) => !!p.fields[k] || ["provider.name", "provider.signerName", "provider.title", "proposal.date"].includes(k) || (k === "caseStudies" && !!p.fields.caseStudies);
    p.blocks = quickBlocks(src, known, { mine: !!mineT, heard: body("what_we_heard") || "{{pains}}", recommend: body("recommendation") || "{{seats}}" });
    p.templateId = tid;
    touch(p, new Date(nowMs).toISOString());
    return recOf(p, nowMs, origin);
  });
}

/* ---------- the companion agreement ---------- */

/** Fields an agreement carries over from its proposal: the price, the term, who signs, the profile. */
const AGREEMENT_FIELDS = /^(pricing\.|term\.|billing\.|terms\.|client\.|provider\.|company\.|discovery\.callDate$|start\.date$|proposal\.date$)/;

/**
 * The agreement that goes with a Senior operator proposal (or any proposal drafted from a call):
 * drafted from the same call brief and the proposal's price, as a new draft of the member's, sent
 * through the Contracts flow like any proposal. Sections the brief can't fill keep the library's
 * standing words with only the lines Merlin knows.
 */
export async function draftAgreement(token: string | null, id: string, origin?: string, nowMs = Date.now()): Promise<ProposalRec> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) throw new ProposalProblem("You're signed out. Sign in again.", 401);
  buildGate(s, me.id, nowMs, origin);
  const p = (s.proposals ?? []).find((x) => x.id === id && x.memberId === me.id);
  if (!p) throw new ProposalProblem("That proposal isn't there anymore. Open Proposals again.", 404);
  const { briefByRules } = await import("./brief");
  const { agreementSections } = await import("./operator");
  const { OPERATOR_AGREEMENT } = await import("./operatorLib");
  const brief = p.brief ?? briefByRules("", me, { company: p.companyName });
  const ctx = ctxFor(p, { name: me.name, title: s.profiles[me.id]?.title || (me.title === "Member" ? "" : me.title) || "", firm: firmOf(s, me) }, workedWithOf(s, me.id), p.fields["pricing.allocation"] || null);
  const secs = agreementSections(brief, ctx, nowMs);
  const fields: Record<string, string> = Object.fromEntries(Object.entries(p.fields).filter(([k]) => AGREEMENT_FIELDS.test(k)));
  // A firm placing an operator signs as the firm.
  if (brief.memberRole === "firm" && ctx.me.firm) fields["provider.name"] = ctx.me.firm;
  const src = templateBlocks(OPERATOR_AGREEMENT);
  const defaults = fieldDefaults(src);
  const known = (k: string) => !!fields[k] || k in defaults || ["provider.name", "provider.signerName", "provider.title", "proposal.date", "client.companyName"].includes(k);
  const blocks = src.flatMap((b) => {
    const w = secs[b.blockId];
    if (w) return [{ ...b, title: w.title, body: w.body }];
    if (!["agreement", "signature", "assumptions", "operating_cadence"].includes(b.blockId)) return [];
    const body = trimUnknown(b.body, known);
    return body.replace(/[^A-Za-z]/g, "").length > 20 ? [{ ...b, body }] : [];
  });
  const rec = await createProposal(
    token,
    {
      templateId: OPERATOR_AGREEMENT,
      ...(p.companyPub ? { companyId: p.companyPub } : { companyName: p.companyName }),
      title: `Agreement${p.companyName ? ` for ${p.companyName}` : ""}`,
      fields,
      blocks,
      ...(p.signer ? { signer: p.signer } : {}),
      source: "quick",
    },
    origin,
    nowMs,
  );
  if (p.brief)
    await T.mutate((d) => {
      const x = (d.proposals ?? []).find((y) => y.id === rec.id && y.memberId === me.id);
      if (x) x.brief = structuredClone(p.brief);
    });
  return { ...rec, ...(p.brief ? { brief: structuredClone(p.brief) } : {}) };
}
