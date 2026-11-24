/**
 * Call recorders, as one kind of connection (Granola now, Fathom next; Fireflies, Zoom and Gong
 * later): the shapes every recorder answers in, and the pure rules the "A call ends" trigger reads
 * a call with (lib/calls/index.ts runs them). No I/O, relative imports only, so the server, the app
 * and scripts/test-call-triggers.mts share it.
 *
 * Adding a recorder (the extension point): write a CallRecorder for it in lib/calls/providers.ts
 * (its connection, kept sealed like Granola's key and Fathom's; listEndedSince and transcript in
 * its own API's terms), add its key to RecorderKey and RECORDER_NAMES, and give it a connect row in
 * Settings, Connections. The trigger, the steps, the delivery and the connector's get_call_pack
 * read only this interface, so nothing else changes.
 *
 * What is kept: nothing a recorder returns. A call's list is read on the scheduler's tick and
 * dropped; its transcript is read for that run and dropped. Only the drafts it produced are kept,
 * and the per-member cursor (when Merlin last looked, the ids it has handled).
 */
import { readTerms } from "../proposals/startCall";
import type { Deliverable } from "../workflows/types";

/** Every recorder Merlin can read. Later: "fireflies" | "zoom" | "gong" (no code for them yet). */
export type RecorderKey = "granola" | "fathom";
export const RECORDER_NAMES: Record<RecorderKey, string> = { granola: "Granola", fathom: "Fathom" };

/** One call that ended, as a recorder lists it. Its title only for Merlin's rules (never stored or shown). */
export interface EndedCall {
  id: string;
  recorder: RecorderKey;
  title?: string;
  startedAt: string;
  endedAt: string;
  /** Who else was on it: their emails and the work domains of those emails (the member's own left out). */
  participants: { emails: string[]; domains: string[]; names: string[] };
}
/** One page of a transcript: "Name: what they said" lines, and the cursor to the next page (null at the end). */
export interface TranscriptPage {
  text: string;
  next: string | null;
}
/** A recorder, for one member's connection. */
export interface CallRecorder {
  key: RecorderKey;
  name: string;
  /** Switched on for Merlin (its RN_ flag). */
  on(): boolean;
  /** The member connected it. */
  connected(s: unknown, memberId: string): boolean;
  /** Calls that ended in [sinceMs, nowMs], newest first, at most `max`. */
  listEndedSince(member: { id: string; email: string; name: string }, sinceMs: number, nowMs: number, max: number): Promise<EndedCall[]>;
  /** One page of one call's transcript (cursor null for the first). Read for the run, never kept. */
  transcript(member: { id: string; email: string; name: string }, id: string, cursor: string | null): Promise<TranscriptPage>;
}

/** The most one call's transcript is read to (about three hours of talk), across its pages. */
export const TRANSCRIPT_MAX = 400_000;
/** How the watch looks: back to the last look, less an overlap for notes written late, never more than LOOK_BACK_MS. */
export const CALL_WATCH = { overlapMs: 20 * 60_000, lookBackMs: 12 * 3_600_000, firstLookMs: 60 * 60_000, perTick: 5, settleMs: 2 * 60_000, pendingMs: 3 * 3_600_000 } as const;

/* ---------- what kind of call it was (rules first) ---------- */

export type CallKind = "sales" | "client" | "internal" | "other" | "unknown";
const NOT_SALES = /\b(stand-?up|1:1|one[- ]on[- ]one|internal|team (sync|meeting)|retro(spective)?|all[- ]hands|interview|podcast|board meeting|offsite|lunch|coffee chat|happy hour|payroll|onboarding session)\b/i;
const SALES = /\b(discovery|intro(duction)?|sales|demo|proposal|scoping|pricing|exploratory|fit call|follow[- ]?up|next steps|engagement|retainer|fractional)\b|<>|\s(x|\/)\s/i;
/** Pipeline stages before a client says yes: a call there is a sales call. Won: a client's call. */
const OPEN_STAGES = new Set(["reach", "sent", "replied", "meeting", "proposal", "quiet", "notnow"]);

/**
 * The call's kind from its title, who was on it and where the company sits in the member's
 * pipeline. "unknown" when the rules can't tell: then the transcript decides (Merlin's AI where it
 * is on and within the AI usage, else the words in it).
 */
export function kindByRules(c: { title?: string; external: number; stage?: string | null }): CallKind {
  if (!c.external) return "internal";
  const t = String(c.title ?? "");
  if (NOT_SALES.test(t)) return "other";
  if (c.stage === "won" && !/\b(proposal|renewal|expansion|scope|sow)\b/i.test(t)) return "client";
  if (SALES.test(t)) return "sales";
  if (c.stage && OPEN_STAGES.has(c.stage)) return "sales";
  return "unknown";
}
const SALES_WORDS = /\b(budget|pricing|price|proposal|retainer|scope|contract|engagement|fee|per month|a month|hire|fractional|statement of work|sow|start date|timeline|decision)\b/gi;
/** The words in the transcript: a call that talks money, scope and a start is a sales call. */
export function kindByWords(text: string): CallKind {
  const n = new Set((String(text).match(SALES_WORDS) ?? []).map((w) => w.toLowerCase())).size;
  return n >= 3 ? "sales" : "other";
}
export const isSalesKind = (k: CallKind) => k === "sales";

/* ---------- what was agreed (rules) ---------- */

const COMMIT = /\b(send|share|put together|write up|draft|get you|pull together|prepare|email|shoot over|follow up with)\b/i;
const WHAT: [Deliverable, RegExp][] = [
  ["sow", /\b(sow|statement of work|scope of work)\b/i],
  ["proposal", /\b(proposal|quote|pricing options)\b/i],
  ["deck", /\b(deck|slides|slide deck|presentation)\b/i],
  ["followup", /\b(recap|follow[- ]?up( email)?|summary|notes|next steps)\b/i],
];
const DAYS = /\b(monday|tuesday|wednesday|thursday|friday|next week|tomorrow|end of (the )?week|end of (the )?month)\b/i;

/** The sentences of a transcript ("Name: text" lines), each with who said it. */
function turns(text: string): { who: string; s: string }[] {
  const out: { who: string; s: string }[] = [];
  for (const line of String(text ?? "").replace(/\r\n?/g, "\n").split("\n")) {
    const m = /^\s*(?:\[[^\]]{1,40}\]\s*)?([^:\n]{1,60}):\s+(.*)$/.exec(line);
    const who = m ? m[1].trim() : "";
    const body = (m ? m[2] : line).trim();
    for (const s of body.split(/(?<=[.!?])\s+/)) if (s.trim()) out.push({ who, s: s.trim() });
  }
  return out;
}

export interface RulesReading {
  agreed: Deliverable[];
  /** When they said they'd talk next ("Thursday"), as a word, never a quote. */
  nextDay: string | null;
  /** The terms the call settled (lib/proposals/startCall.ts readTerms): the fee, the term, the days a week. */
  terms: Record<string, string>;
}
/** What the call agreed to send, by Merlin's own rules: a sentence that commits to send one of them. Never a quote kept. */
export function readByRules(text: string): RulesReading {
  const agreed = new Set<Deliverable>();
  let nextDay: string | null = null;
  for (const { s } of turns(text)) {
    if (COMMIT.test(s)) for (const [d, re] of WHAT) if (re.test(s)) agreed.add(d);
    if (!nextDay && /\b(meet|talk|call|catch up|review|walk through|regroup|reconnect)\b/i.test(s)) {
      const d = DAYS.exec(s);
      if (d) nextDay = d[1].toLowerCase();
    }
  }
  const terms = readTerms(text).fields;
  return { agreed: (["proposal", "sow", "followup", "deck"] as Deliverable[]).filter((d) => agreed.has(d)), nextDay, terms };
}

/* ---------- the words ---------- */

const listWords = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const dayName = (d: string) => (/^(monday|tuesday|wednesday|thursday|friday)$/.test(d) ? capFirst(d) : d);

/** The terms in plain words: "$12,000 a month, two days a week, a first term of 3 months". */
export function termsWords(t: Record<string, string>): string[] {
  const out: string[] = [];
  if (t["pricing.monthlyFee"]) out.push(`${t["pricing.monthlyFee"]} a month`);
  if (t["pricing.fixedFee"]) out.push(`a fixed fee of ${t["pricing.fixedFee"]}`);
  if (t["pricing.allocation"]) out.push(t["pricing.allocation"]);
  if (t["term.initialMonths"]) out.push(`a first term of ${t["term.initialMonths"]} months`);
  if (t["term.noticeDays"]) out.push(`${t["term.noticeDays"]} days' notice`);
  if (t["start.date"]) out.push(`a start on ${t["start.date"]}`);
  return out;
}

/** The call's summary by rules, for the pack and the email: what kind of call, what was agreed, the terms. No quotes. */
export function summaryByRules(r: RulesReading, o: { company: string; minutes: number | null }): { summary: string; items: string[]; next: string[] } {
  const items = [...r.agreed.map((d) => `Send ${DELIVERABLE_A[d]}`), ...termsWords(r.terms).map((x) => `Terms talked about: ${x}`)];
  const next = [...r.agreed.map((d) => `${capFirst(DELIVERABLE_A[d])} to ${o.company}`), ...(r.nextDay ? [`Talk again ${r.nextDay.startsWith("next") || r.nextDay.startsWith("end") || r.nextDay === "tomorrow" ? r.nextDay : `on ${dayName(r.nextDay)}`}`] : [])];
  const len = o.minutes ? `A ${o.minutes}-minute call` : "A call";
  const summary = `${len} with ${o.company}. ${r.agreed.length ? `You agreed to send ${listWords(r.agreed.map((d) => DELIVERABLE_A[d]))}.` : "Nothing to send was agreed."}${termsWords(r.terms).length ? ` Terms talked about: ${listWords(termsWords(r.terms))}.` : ""}`;
  return { summary, items, next };
}
const DELIVERABLE_A: Record<Deliverable, string> = { proposal: "a proposal", sow: "a statement of work", followup: "a follow-up email", deck: "a deck" };

/* ---------- Claude: the prompt and the link ---------- */

/** claude.ai/new?q= stays well under the address limits browsers and Claude keep. */
export const CLAUDE_URL_MAX = 1800;
export const CLAUDE_NEW = "https://claude.ai/new";

/**
 * The prompt that opens in the member's Claude: get the pack from the Merlin connector, build the
 * deliverable from it. The long context goes through the connector (get_call_pack), never the link.
 * A locked company is never named: "the company on the call".
 */
export function claudePrompt(p: { pack: string; deliverable: Deliverable; company: string | null; transcript: boolean }): string {
  const what = { proposal: "the proposal", sow: "the statement of work", followup: "the follow-up email", deck: "the deck, slide by slide" }[p.deliverable];
  const who = p.company ? `for ${p.company}` : "for the company on the call";
  return [
    `Use my Merlin connector: call get_call_pack with pack_id ${p.pack}.`,
    `Then write ${what} ${who} from it: follow my template's sections, use my closest case studies where they fit, and write in my voice.`,
    `Use only what the pack says was agreed${p.transcript ? " and what the transcript says" : ""}. Leave a blank for anything not settled.`,
    p.deliverable === "proposal" || p.deliverable === "sow" ? "Save it as a draft with create_or_update_proposal. Don't send anything to the client." : "Show it to me. Don't send anything to the client.",
  ].join(" ");
}
/** The Open in Claude link, kept under CLAUDE_URL_MAX: the prompt cut at a sentence when it must be. */
export function claudeLink(prompt: string): string {
  let q = prompt;
  for (;;) {
    const url = `${CLAUDE_NEW}?q=${encodeURIComponent(q)}`;
    if (url.length <= CLAUDE_URL_MAX) return url;
    const cut = q.lastIndexOf(". ", q.length - 2);
    q = cut > 40 ? q.slice(0, cut + 1) : q.slice(0, Math.max(40, q.length - 200));
  }
}

/* ---------- the follow-up email and the deck by rules ---------- */

export interface VoiceLike {
  greeting: string;
  signoff: string;
  name: "first" | "full" | "none";
  contractions: boolean;
  formality: "casual" | "neutral" | "formal";
}
const NEUTRAL: VoiceLike = { greeting: "Hi {first},", signoff: "Best,", name: "first", contractions: true, formality: "neutral" };
const firstOf = (n: string) => String(n ?? "").trim().split(/\s+/)[0] ?? "";

/** The follow-up email by Merlin's rules, in the member's voice: thanks, what was agreed, the terms, the next step. A draft for the member. */
export function followupByRules(r: RulesReading, o: { me: string; to: string | null; company: string; voice?: VoiceLike | null }): { subject: string; body: string } {
  const v = o.voice ?? NEUTRAL;
  const c = (x: string) => (v.contractions ? x : x.replace(/\bI'll\b/g, "I will").replace(/\bwe'll\b/gi, "we will").replace(/\bit's\b/gi, "it is").replace(/\blet's\b/gi, "let us"));
  const first = o.to ? firstOf(o.to) : "";
  const lines: string[] = [];
  if (v.greeting !== "none") lines.push(first ? v.greeting.replace("{first}", first) : v.greeting.replace(/\s*\{first\}/, " there").replace(" there,", v.greeting.startsWith("Dear") ? " all," : " there,"));
  lines.push(c(v.formality === "formal" ? "Thank you for your time today." : "Thanks for the time today."));
  const sends = r.agreed.filter((d) => d !== "followup").map((d) => DELIVERABLE_A[d]);
  const t = termsWords(r.terms);
  const recap: string[] = [];
  if (sends.length) recap.push(c(`As we agreed, I'll send ${listWords(sends)}.`));
  if (t.length) recap.push(`We talked about ${listWords(t)}.`);
  if (recap.length) lines.push(recap.join(" "));
  lines.push(r.nextDay ? c(`Let's pick it up ${r.nextDay.startsWith("next") || r.nextDay.startsWith("end") || r.nextDay === "tomorrow" ? r.nextDay : `on ${dayName(r.nextDay)}`}.`) : c("Let me know a good time for the next step."));
  const sign = [v.signoff === "none" ? "" : v.signoff, v.name === "none" ? "" : v.name === "full" ? o.me : firstOf(o.me)].filter(Boolean).join("\n");
  if (sign) lines.push(sign);
  return { subject: `Following up: ${o.company}`.slice(0, 160), body: lines.join("\n\n") };
}

export interface Slide {
  title: string;
  points: string[];
}
/** A deck's outline by rules: the slides a fractional's pitch deck has, filled from what the call settled and the case studies. */
export function deckByRules(r: RulesReading, o: { company: string; cases: string[] }): Slide[] {
  const t = termsWords(r.terms);
  return [
    { title: `${o.company}: the plan`, points: ["Who it is for, and the date"] },
    { title: "What we heard", points: ["Their goal, in their words", "What is in the way today"] },
    { title: "What we recommend", points: ["The role and the shape of the work", "Why fractional, and why now"] },
    { title: "The first 90 days", points: ["Day 30: a readout, and a decision", "Day 60: what is live, and a decision", "Day 90: results, and the call to continue"] },
    ...(o.cases.length ? [{ title: "Where this worked before", points: o.cases.slice(0, 2) }] : []),
    { title: "Investment", points: t.length ? t : ["The fee and what it covers"] },
    { title: "Next steps", points: r.nextDay ? [`Talk again ${r.nextDay.startsWith("next") || r.nextDay.startsWith("end") || r.nextDay === "tomorrow" ? r.nextDay : `on ${dayName(r.nextDay)}`}`] : ["The date we decide"] },
  ];
}
export const slidesText = (slides: Slide[]) => slides.map((s, i) => `Slide ${i + 1}. ${s.title}\n${s.points.map((p) => `- ${p}`).join("\n")}`).join("\n\n");

/* ---------- the ready line ---------- */

/** "Your proposal draft for Cedar and Pine is ready", by the first thing built. */
export function readyLine(built: Deliverable[] | ("claude" | Deliverable)[], company: string): string {
  const first = built[0];
  if (!first) return `Your call with ${company} is in`;
  if (first === "claude") return `Your call with ${company} is ready for Claude`;
  const the = { proposal: "proposal draft", sow: "statement of work draft", followup: "follow-up email", deck: "deck outline" }[first];
  return `Your ${the} for ${company} is ready`;
}
