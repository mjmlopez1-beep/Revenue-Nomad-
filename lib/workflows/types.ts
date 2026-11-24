/**
 * Workflows (Stage 7b, Beta, behind RN_WORKFLOWS): "When this happens" (one trigger) then "Then do
 * this" (steps, run in the order the builder lists them). The shapes, the words and the pure rules.
 * No I/O and relative imports only: the server (lib/workflows/run.ts, index.ts), the Alerts page's
 * Workflows tab and scripts/test-workflows.mts all read it.
 *
 * Triggers are what Alerts already detects (lib/notify/events.ts, the watch pass): a new open role,
 * a recent hire, a seat ended, a new leader, a fact changed, a company raised funding (RN_FUNDING),
 * someone you know changed jobs; and the proposal events Close already tells (lib/close/server.ts
 * dispatch): a client opens a proposal, a client signs. A company trigger watches a saved list, the
 * member's Crystal Ball, or the companies they follow.
 *
 * Steps. Free: tell me, add to my pipeline, find my way in, remind me in N days, start an Evidence
 * Bank draft (Close). Paid, each at what the same action costs in the app (lib/table.ts perform,
 * the unlock prices): open the company, open who decides (their name and title; at a locked
 * company the company opens first, as in the app), draft a note (a draft only, in Messages: a
 * company is opened first when it is locked, since a note names the company). A workflow never
 * sends anything to a client or a contact.
 *
 * A call ends (RN_CALL_TRIGGERS, lib/calls): a sales call ends in the member's call recorder
 * (Granola, Fathom), and Merlin builds what was agreed on it, as drafts for the member alone: the
 * proposal (Close), a statement of work (Close), the follow-up email (Pro and Close), a deck's
 * outline (Close), or the context and a prompt for their own Claude (Close). The transcript is read
 * for the run and never kept: only the drafts are. Each is ready in their inbox and their bell.
 *
 * Credits: a workflow spends automatically. Optional: a monthly cap (it stops and asks: a bell line
 * "Say yes · N credits") and a warning (told once a month in the bell). A run's estimate is quoted
 * just before it spends, and the run spends exactly that or nothing.
 */

export type WfTrigger = "role" | "hire" | "seat" | "leader" | "fact" | "funding" | "known" | "opened" | "signed" | "call";
export const WF_TRIGGERS: WfTrigger[] = ["role", "hire", "seat", "leader", "fact", "funding", "known", "opened", "signed", "call"];
/** What a trigger watches: a saved list, the member's Crystal Ball, the companies they follow, their own contacts, their proposals, the calls in their call recorder. */
export type WfScopeKind = "list" | "radar" | "follows" | "contacts" | "proposals" | "calls";
export interface WfScope {
  kind: WfScopeKind;
  /** A saved list's id (State.connector.alerts[member][].id), for kind "list". */
  list?: string;
}

export type WfStepKey = "open" | "dm" | "draft" | "pipe" | "way" | "evidence" | "proposal" | "sow" | "followup" | "deck" | "claude" | "remind" | "tell";
/** The order steps run in, and the builder lists them in. Opening comes first: the steps after it need the company. A note's credits (opening a locked company) are quoted with the other paid steps, before any step runs. */
export const STEP_ORDER: WfStepKey[] = ["open", "dm", "pipe", "way", "draft", "evidence", "proposal", "sow", "followup", "deck", "claude", "remind", "tell"];
export interface WfStep {
  key: WfStepKey;
  /** Remind me in N days. */
  days?: number;
}

/** What a call can agree to send, and what the call steps build. */
export type Deliverable = "proposal" | "sow" | "followup" | "deck";
export const DELIVERABLES: Deliverable[] = ["proposal", "sow", "followup", "deck"];
export const DELIVERABLE_WORDS: Record<Deliverable, { a: string; the: string; short: string }> = {
  proposal: { a: "a proposal", the: "proposal draft", short: "A proposal" },
  sow: { a: "an SOW", the: "statement of work draft", short: "An SOW" },
  followup: { a: "a follow-up email", the: "follow-up email", short: "A follow-up email" },
  deck: { a: "a deck", the: "deck outline", short: "A deck" },
};
/** The call step that builds each deliverable. */
export const STEP_OF: Record<Deliverable, WfStepKey> = { proposal: "proposal", sow: "sow", followup: "followup", deck: "deck" };
/**
 * A call workflow's conditions and choices. sales: only sales and discovery calls (else any call
 * with someone outside the member's own company). agreed: build only when the call agreed to send
 * one of these (none ticked: every matching call). template: the member's template for the
 * proposal (theirs, mt_..., or the library's; null: Merlin picks the closest). transcript: the
 * Claude route's pack carries the transcript, read from the recorder when Claude asks (never kept).
 */
export interface CallOptions {
  sales: boolean;
  agreed: Deliverable[];
  template: string | null;
  transcript: boolean;
}
export const CALL_DEFAULT: CallOptions = { sales: true, agreed: [], template: null, transcript: false };

export interface Workflow {
  id: string;
  /** The workflow in plain words, as the builder said it (or the member's own words). It names the workflow on every ledger line. */
  name: string;
  on: boolean;
  trigger: WfTrigger;
  scope: WfScope;
  steps: WfStep[];
  /** Up to this many credits a month, then it stops and asks. Null: no cap. */
  cap: number | null;
  /** Tell me (once a month, in the bell) before it passes this many credits. Null: no warning. */
  warn: number | null;
  /** The month ("2026-11") the warning was told, so it is told once. */
  warned?: string;
  /** A call ends: its conditions and choices. */
  call?: CallOptions;
  createdAt: string;
  updatedAt: string;
}

export type StepStatus = "done" | "waiting" | "skipped";
export interface RunStep {
  key: WfStepKey;
  status: StepStatus;
  /** What it did or why not, in plain words. Never a locked company's name, never a Californian. */
  note: string;
  credits: number;
}
export interface WfRun {
  id: string;
  wf: string;
  at: string;
  /** The trigger, as the member sees Merlin: a locked company described, never named. */
  line: string;
  href: string;
  /** The company (its public id), for the steps that wait for a yes. */
  company?: string;
  steps: RunStep[];
  /** Quoted just before the paid steps; spent equals it, or nothing was spent. */
  estimate: number;
  spent: number;
  /** Paid steps wait for the member's yes (the monthly cap): what the yes spends. */
  ask?: { credits: number; answer?: "yes" | "no"; at?: string };
  /** A call run: what it built, where each is (a proposal's id, the Claude link, the pack's id). Never the transcript. */
  built?: { proposal?: string; sow?: string; followup?: string; deck?: string; claude?: string; pack?: string };
}
export interface WfReminder {
  id: string;
  wf: string;
  /** When it goes to the bell (ISO). */
  due: string;
  line: string;
  href: string;
}
/** A note a workflow drafted: shown in Messages as a draft, never sent. */
export interface WfDraft {
  id: string;
  wf: string;
  at: string;
  /** The company's public id and its name (a note is only drafted for a company the member can see). A call's draft: "" when the call matched no company the member can see. */
  company: string;
  companyName: string;
  subject: string;
  body: string;
  /** What it is: a note (the default), a call's follow-up email, a call's deck outline. */
  kind?: "note" | "followup" | "deck";
}
/**
 * What a call run prepared for the member's own Claude (get_call_pack): the call's derived summary
 * and agreed items, never its transcript. With `transcript` ticked, the pack points at the call
 * (recorder and id) and the transcript is read from the recorder when Claude asks, for that answer alone.
 */
export interface WfPack {
  id: string;
  wf: string;
  run: string;
  at: string;
  recorder: string;
  call: string;
  deliverable: Deliverable;
  /** The company's public id, and its name only when the member can see it. */
  company: string | null;
  companyName: string | null;
  summary: string;
  agreed: string[];
  next: string[];
  template: string | null;
  transcript: boolean;
}
/** The call watch's cursor for one recorder: when Merlin last looked, and the calls it has handled (newest last). */
export interface CallCursor {
  at: string;
  seen: string[];
}
export interface MemberWorkflows {
  flows: Workflow[];
  runs: WfRun[];
  reminders: WfReminder[];
  drafts: WfDraft[];
  /** "<workflow id>|<event key>" already run, newest last: an event runs a workflow once. */
  keys: string[];
  /** Call runs' packs for Claude (30 days at most). */
  packs?: WfPack[];
  /** The call watch's cursor, by recorder ("granola", "fathom"). */
  calls?: Record<string, CallCursor>;
}
export type WorkflowsState = Record<string, MemberWorkflows>;

/** What the state keeps per member (capped on every write). */
export const WF_LIMITS = { flows: 25, runs: 200, reminders: 100, drafts: 50, keys: 2000, name: 140, line: 240, note: 200, body: 2000, runDays: 90, runsPerDay: 25, packs: 50, packDays: 30, seen: 500, pack: 600 } as const;
/** The most a cap or a warning can be: a month's Pro credits and then some. */
export const WF_CAP_MAX = 500;
export const REMIND_DAYS = { min: 1, max: 30, default: 2 } as const;
export const emptyWorkflows = (): MemberWorkflows => ({ flows: [], runs: [], reminders: [], drafts: [], keys: [] });

/* ---------- words ---------- */

export interface TriggerInfo {
  name: string;
  detail: string;
  /** What it can watch. */
  scopes: WfScopeKind[];
  /** Only with the funding filings on (RN_FUNDING). */
  funding?: true;
  /** The plan it needs beyond Free's ("Close" for the proposal triggers). */
  plan?: "Close";
  /** It is about a company (the company steps fit). */
  company: boolean;
  /** Only with the call triggers on (RN_CALL_TRIGGERS). */
  calls?: true;
}
export const TRIGGERS: Record<WfTrigger, TriggerInfo> = {
  role: { name: "A new open role", detail: "A company posts a fractional role in your function.", scopes: ["list", "radar", "follows"], company: true },
  hire: { name: "A recent hire", detail: "A fractional seat is added at a company: it just hired one.", scopes: ["list", "radar", "follows"], company: true },
  seat: { name: "A seat ended", detail: "A fractional seat at the company ended.", scopes: ["list", "radar", "follows"], company: true },
  leader: { name: "A new leader", detail: "A new leader shows on the company's own website.", scopes: ["list", "radar", "follows"], company: true },
  fact: { name: "A fact changed", detail: "Another member added or changed a fact there: a seat, a role, a person, its size.", scopes: ["list", "radar", "follows"], company: true },
  funding: { name: "A company raised funding", detail: "From its SEC filing (Form D): the round and date as the filing gives them.", scopes: ["list", "radar", "follows"], funding: true, company: true },
  known: { name: "Someone you know changed jobs", detail: "A person in your own contacts shows as a new leader at another company. Matched by full name and the new company, never guessed.", scopes: ["contacts"], company: true },
  opened: { name: "Proposal opened", detail: "The first time they open it.", scopes: ["proposals"], plan: "Close", company: false },
  signed: { name: "Proposal signed", detail: "A proposal or a contract is fully signed.", scopes: ["proposals"], plan: "Close", company: false },
  call: { name: "A call ends", detail: "A call in your call recorder ends: Granola or Fathom. Merlin sees what was agreed and builds it, about 10 minutes after the call.", scopes: ["calls"], company: false, calls: true },
};

export interface StepInfo {
  name: string;
  sub: string;
  /** Costs credits where the same action does in the app (Pro and Close). */
  paid: boolean;
  /** Close only (Evidence Bank). */
  close?: true;
  /** Close only (the proposal builder). */
  proposals?: true;
  /** Pro and Close, and free of credits. */
  pro?: true;
  /** The triggers it fits. */
  fits: WfTrigger[];
  words: string;
}
const COMPANY_T: WfTrigger[] = ["role", "hire", "seat", "leader", "fact", "funding", "known"];
export const STEPS: Record<WfStepKey, StepInfo> = {
  open: { name: "Open the company", sub: "Its name, website and open roles, at the price in the app", paid: true, fits: COMPANY_T, words: "open the company" },
  dm: { name: "Open who decides", sub: "The name and title of who decides there. The company opens first if it is locked", paid: true, fits: COMPANY_T, words: "open who decides" },
  draft: { name: "Draft a note", sub: "A draft in Messages, in your voice. Never sent", paid: true, fits: COMPANY_T, words: "draft a note" },
  pipe: { name: "Add it to my pipeline", sub: "At To reach out. A company still locked waits until it is open", paid: false, fits: COMPANY_T, words: "add it to my pipeline" },
  way: { name: "Find my way in", sub: "Your ways in there, strongest first", paid: false, fits: COMPANY_T, words: "find my way in" },
  evidence: { name: "Start an Evidence Bank draft", sub: "A draft case from the signed work. Client name hidden", paid: false, close: true, fits: ["signed"], words: "start an Evidence Bank draft" },
  proposal: { name: "Draft the proposal in Merlin", sub: "Your template for it, your closest case studies from Evidence Bank, your profile and voice. A draft, never sent", paid: false, proposals: true, fits: ["call"], words: "draft the proposal" },
  sow: { name: "Draft an SOW", sub: "Your SOW template if you have one, else a project build's structure. A draft, never sent", paid: false, proposals: true, fits: ["call"], words: "draft an SOW" },
  followup: { name: "Draft the follow-up email", sub: "What was agreed and the next steps, in your voice. A draft for you, never sent", paid: false, pro: true, fits: ["call"], words: "draft the follow-up email" },
  deck: { name: "Outline a deck", sub: "Slide by slide, from the call and your case studies. Text for you to build from", paid: false, proposals: true, fits: ["call"], words: "outline a deck" },
  claude: { name: "Prepare it for Claude", sub: "Your template, closest case studies, profile and voice and the call's summary, with a prompt. Opens in Claude", paid: false, proposals: true, fits: ["call"], words: "prepare it for Claude" },
  remind: { name: "Remind me", sub: "A line in the bell on the day", paid: false, fits: WF_TRIGGERS, words: "remind me" },
  tell: { name: "Tell me", sub: "In the bell, and by email and in Slack where your alerts go", paid: false, fits: WF_TRIGGERS.filter((t) => t !== "call"), words: "tell me" },
};
/** The call steps, in run order. */
export const CALL_STEPS: WfStepKey[] = ["proposal", "sow", "followup", "deck", "claude"];

const listWords = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
const capFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** "on my list Sales-led SaaS", "in my Crystal Ball", "I follow". */
export function scopeWords(scope: WfScope, listName?: string | null): string {
  if (scope.kind === "list") return listName ? `on my list ${listName}` : "on my list";
  if (scope.kind === "radar") return "in my Crystal Ball";
  if (scope.kind === "follows") return "I follow";
  return "";
}
/** "a proposal or a deck". */
const orWords = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} or ${xs[xs.length - 1]}`);
/** The trigger in a sentence after "When". */
export function triggerWords(t: WfTrigger, scope: WfScope, listName?: string | null, call?: CallOptions | null): string {
  const sw = scopeWords(scope, listName);
  const co = `a company ${sw}`.trim();
  switch (t) {
    case "role":
      return `${co} posts a role in my function`;
    case "hire":
      return `${co} hires a fractional`;
    case "seat":
      return `a seat ends at ${co}`;
    case "leader":
      return `${co} gets a new leader`;
    case "fact":
      return `a fact changes at ${co}`;
    case "funding":
      return `${co} raises funding`;
    case "known":
      return "someone I know becomes a leader somewhere new";
    case "opened":
      return "a client opens my proposal";
    case "signed":
      return "a client signs my proposal";
    case "call": {
      const c = call ?? CALL_DEFAULT;
      const what = c.sales ? "a sales call ends" : "a call with a company ends";
      return c.agreed.length ? `${what} and we agreed to send ${orWords(c.agreed.map((d) => DELIVERABLE_WORDS[d].a))}` : what;
    }
  }
}
export function stepWords(st: WfStep): string {
  if (st.key === "remind") return `remind me in ${st.days ?? REMIND_DAYS.default} ${(st.days ?? REMIND_DAYS.default) === 1 ? "day" : "days"}`;
  return STEPS[st.key].words;
}
/** "When a company on my list raises funding, open the company and add it to my pipeline." */
export function sayFlow(f: Pick<Workflow, "trigger" | "scope" | "steps"> & { call?: CallOptions | null }, listName?: string | null): string {
  const steps = sortSteps(f.steps).map(stepWords);
  return `When ${triggerWords(f.trigger, f.scope, listName, f.call)}, ${steps.length ? listWords(steps) : "do nothing yet"}.`;
}
export const sortSteps = (steps: WfStep[]) => [...steps].sort((a, b) => STEP_ORDER.indexOf(a.key) - STEP_ORDER.indexOf(b.key));

/* ---------- recipes ---------- */

export interface Recipe {
  key: string;
  trigger: WfTrigger;
  scope: WfScopeKind;
  steps: WfStep[];
  call?: CallOptions;
  /** Its own words on the card, where the sentence would be long. */
  title?: string;
}
/** The gallery of starter workflows. "Use this" opens each in the builder, prefilled. Nothing is on until the member turns it on. */
export const RECIPES: Recipe[] = [
  { key: "funding-open-pipe", trigger: "funding", scope: "list", steps: [{ key: "open" }, { key: "pipe" }] },
  { key: "known-way-draft", trigger: "known", scope: "contacts", steps: [{ key: "way" }, { key: "draft" }] },
  { key: "radar-role-dm", trigger: "role", scope: "radar", steps: [{ key: "dm" }, { key: "remind", days: 2 }] },
  { key: "seat-pipe-way", trigger: "seat", scope: "list", steps: [{ key: "pipe" }, { key: "way" }, { key: "tell" }] },
  { key: "follows-leader-remind", trigger: "leader", scope: "follows", steps: [{ key: "tell" }, { key: "remind", days: 3 }] },
  { key: "signed-evidence", trigger: "signed", scope: "proposals", steps: [{ key: "evidence" }, { key: "remind", days: 7 }] },
  { key: "opened-remind", trigger: "opened", scope: "proposals", steps: [{ key: "remind", days: 2 }, { key: "tell" }] },
  { key: "hire-way", trigger: "hire", scope: "list", steps: [{ key: "way" }, { key: "tell" }] },
  // A call ends (RN_CALL_TRIGGERS): the owner's three.
  { key: "call-proposal", trigger: "call", scope: "calls", steps: [{ key: "proposal" }], call: { sales: true, agreed: ["proposal"], template: null, transcript: false }, title: "After a sales call, draft the proposal" },
  { key: "call-followup", trigger: "call", scope: "calls", steps: [{ key: "followup" }], call: { sales: true, agreed: [], template: null, transcript: false }, title: "After a sales call, draft the follow-up email" },
  { key: "call-claude", trigger: "call", scope: "calls", steps: [{ key: "claude" }], call: { sales: true, agreed: [], template: null, transcript: false }, title: "After a sales call, prepare it for Claude" },
];

/* ---------- prices and estimates ---------- */

/** What a paid step costs this member now, from the app's own prices (lib/workflows/index.ts fills it from lib/table.ts). */
export interface StepPrices {
  /** A locked company: 0 when it opens free on the plan (Pro and Close: everything; the trial: TRIAL_OPENS_DAILY a day), else COMPANY_PRICE. */
  company: number;
  /** The company price once today's free opens are used. */
  companyFull: number;
  /** A Crystal Ball company opens free on this plan. */
  ballFree: boolean;
  /** Free opens left today. */
  opensLeft: number;
  /** A person's name and title: one purchase. */
  person: number;
}

/** The most one run can spend, from the prices: what the builder shows before it is turned on ("Up to 3 credits a run"). */
export function runCeiling(steps: WfStep[], scope: WfScope, p: StepPrices): { total: number; per: Partial<Record<WfStepKey, number>> } {
  const keys = new Set(steps.map((x) => x.key));
  const per: Partial<Record<WfStepKey, number>> = {};
  const company = scope.kind === "radar" && p.ballFree ? 0 : p.companyFull;
  let companyCharged = false;
  for (const k of STEP_ORDER) {
    if (!keys.has(k) || !STEPS[k].paid) continue;
    let n = 0;
    if (!companyCharged) {
      n += company;
      companyCharged = true;
    }
    if (k === "dm") n += p.person;
    per[k] = n;
  }
  return { total: Object.values(per).reduce((a, b) => a + (b ?? 0), 0), per };
}
export const creditWords = (n: number) => (n === 1 ? "1 credit" : `${n} credits`);
/** "Free", or "Up to 3 credits a run". */
export const costWords = (n: number) => (n ? `Up to ${creditWords(n)} a run` : "Free");

/** The UTC month of an ISO time: "2026-11". */
export const monthOf = (iso: string) => iso.slice(0, 7);

/* ---------- checks ---------- */

const flat = (v: unknown, n: number) => [...String(v ?? "").replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim()].slice(0, n).join("");
export const oneLineWf = flat;
const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 ? Math.min(WF_CAP_MAX, n) : null;
};
export class WfProblem extends Error {}

/** A template id as the builder sends it: theirs (mt_...) or a library id, or null. */
const TEMPLATE_ID = /^(?:mt_[A-Za-z0-9_-]{12}|[a-z0-9-]{2,60})$/;
/** A call workflow's options as the builder sent them, checked. */
export function cleanCall(raw: unknown): CallOptions {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const agreed = Array.isArray(r.agreed) ? DELIVERABLES.filter((d) => (r.agreed as unknown[]).includes(d)) : [];
  const t = typeof r.template === "string" && TEMPLATE_ID.test(r.template) ? r.template : null;
  return { sales: r.sales !== false, agreed, template: t, transcript: r.transcript === true };
}

/** A workflow as the builder sent it, checked: one trigger, a scope it can watch, steps that fit. Throws WfProblem in plain words. */
export function cleanFlow(raw: Record<string, unknown>): Pick<Workflow, "name" | "trigger" | "scope" | "steps" | "cap" | "warn"> & { call?: CallOptions } {
  const trigger = raw.trigger as WfTrigger;
  if (!WF_TRIGGERS.includes(trigger)) throw new WfProblem("Pick what sets it off first.");
  const info = TRIGGERS[trigger];
  const sr = (raw.scope ?? {}) as Record<string, unknown>;
  const kind = (info.scopes.includes(sr.kind as WfScopeKind) ? sr.kind : info.scopes[0]) as WfScopeKind;
  const scope: WfScope = { kind, ...(kind === "list" ? { list: flat(sr.list, 40) } : {}) };
  if (kind === "list" && !scope.list) throw new WfProblem("Pick the list it watches.");
  const seen = new Set<WfStepKey>();
  const steps: WfStep[] = [];
  for (const s of Array.isArray(raw.steps) ? raw.steps.slice(0, 12) : []) {
    const key = (s as WfStep)?.key;
    if (!STEP_ORDER.includes(key) || seen.has(key)) continue;
    if (!STEPS[key].fits.includes(trigger)) continue;
    seen.add(key);
    if (key === "remind") {
      const d = Math.floor(Number((s as WfStep).days ?? REMIND_DAYS.default));
      steps.push({ key, days: Number.isFinite(d) ? Math.max(REMIND_DAYS.min, Math.min(REMIND_DAYS.max, d)) : REMIND_DAYS.default });
    } else steps.push({ key });
  }
  if (!steps.length) throw new WfProblem("Pick at least one thing for it to do.");
  const cap = num(raw.cap);
  const warn = num(raw.warn);
  if (cap !== null && warn !== null && warn >= cap) throw new WfProblem("Set the warning below the monthly limit, or leave one of them off.");
  return { name: flat(raw.name, WF_LIMITS.name), trigger, scope, steps: sortSteps(steps), cap, warn, ...(trigger === "call" ? { call: cleanCall(raw.call) } : {}) };
}

/** The steps the plan holds back, by why ("Part of Pro", "Part of Close"). */
export function planHolds(f: Pick<Workflow, "trigger" | "steps">, plan: { paid: boolean; proposals: boolean; evidence: boolean }): { trigger: string | null; steps: Partial<Record<WfStepKey, string>> } {
  const steps: Partial<Record<WfStepKey, string>> = {};
  for (const st of f.steps) {
    if (STEPS[st.key].close && !plan.evidence) steps[st.key] = "Part of Close";
    else if (STEPS[st.key].proposals && !plan.proposals) steps[st.key] = "Part of Close";
    else if ((STEPS[st.key].paid || STEPS[st.key].pro) && !plan.paid) steps[st.key] = "Part of Pro";
  }
  const trigger = TRIGGERS[f.trigger].plan === "Close" && !plan.proposals ? "Part of Close" : null;
  return { trigger, steps };
}

/** "I saw ..." for a drafted note: what happened at the company, naming it (a note is only drafted for a company the member can see). */
export function sawOf(t: WfTrigger, company: string, fn: string | null): string | null {
  const f = fn && fn !== "Other" ? `${fn} ` : "";
  switch (t) {
    case "role":
      return `${company} is looking for a fractional ${f}leader`.replace("  ", " ");
    case "hire":
      return `${company} hired a fractional ${f}leader`.replace("  ", " ");
    case "seat":
      return `the fractional ${f}seat at ${company} came to an end`.replace("  ", " ");
    case "leader":
      return `${company} has a new ${f}leader`.replace("  ", " ");
    case "funding":
      return `${company} raised a new round`;
    case "fact":
      return `there is news at ${company}`;
    case "known":
      return null;
    default:
      return null;
  }
}

/** The run's steps in a line for the bell: "Opened the company, added it to your pipeline". */
export function doneWords(steps: RunStep[]): string {
  const did = steps.filter((x) => x.status === "done" && x.key !== "tell").map((x) => DONE_WORDS[x.key]);
  const wait = steps.some((x) => x.status === "waiting");
  return capFirst([did.length ? listWords(did) : "", wait ? "paid steps wait for your yes" : ""].filter(Boolean).join(". ")) || "Nothing else to do";
}
const DONE_WORDS: Record<WfStepKey, string> = {
  open: "opened the company",
  dm: "opened who decides",
  draft: "drafted a note in Messages",
  pipe: "added it to your pipeline",
  way: "found your ways in",
  evidence: "started an Evidence Bank draft",
  proposal: "drafted the proposal",
  sow: "drafted an SOW",
  followup: "drafted the follow-up email",
  deck: "outlined a deck",
  claude: "prepared it for Claude",
  remind: "set a reminder",
  tell: "told you",
};

/* ---------- closure and the internal export ---------- */

/** Account closure's purge: every workflow, run, reminder and draft of theirs goes. */
export function forgetWorkflows(d: { workflows?: WorkflowsState }, memberId: string): void {
  if (d.workflows) delete d.workflows[memberId];
}
/**
 * The state export (an admin's backup, never a member's): as Alerts' (the inbox and the watch stay
 * out, the switches stay), the workflows' definitions stay; their runs (lines about companies), the
 * reminders, the drafted notes and the keys stay out.
 */
export function exportWorkflows(ws: WorkflowsState | undefined): WorkflowsState | undefined {
  if (!ws) return undefined;
  // A call run's packs for Claude and the call watch's cursor stay out too.
  return Object.fromEntries(Object.entries(ws).map(([id, w]) => [id, { flows: w.flows, runs: [], reminders: [], drafts: [], keys: [] }]));
}

/* ---------- what the Alerts page reads (GET /api/table?workflows=1) ---------- */

export interface FlowRow {
  id: string;
  name: string;
  /** The workflow in plain words, with its list's name. */
  say: string;
  on: boolean;
  trigger: WfTrigger;
  scope: WfScope;
  steps: WfStep[];
  cap: number | null;
  warn: number | null;
  call?: CallOptions;
  /** Runs and credits in the last 30 days, and spent this month (for the cap). */
  runs30: number;
  spent30: number;
  spentMonth: number;
  last: string | null;
  /** Runs waiting for a yes. */
  waiting: number;
  /** The most one run can spend (the builder's estimate before it is on). */
  ceiling: number;
  /** What the plan holds back. */
  holds: { trigger: string | null; steps: Partial<Record<WfStepKey, string>> };
}
export interface RunRow extends WfRun {
  /** The workflow's name. */
  name: string;
}
export interface WorkflowsView {
  on: true;
  plan: { tier: "free" | "pro" | "close"; flows: number; paid: boolean; proposals: boolean; evidence: boolean };
  flows: FlowRow[];
  runs: RunRow[];
  prices: StepPrices;
  /** The member's saved lists, for "Watching". */
  lists: { id: string; name: string }[];
  /** The funding filings are on (RN_FUNDING). */
  funding: boolean;
  /** The member has people of their own (Someone you know changed jobs can watch them). */
  sources: boolean;
  /** Credits workflows spent in the last 30 days, from the credit history. */
  spent30: number;
  /** Runs waiting for a yes. */
  waiting: number;
  drafts: number;
  credits: number;
  /** A call ends (RN_CALL_TRIGGERS): offered, the member's call recorders, the templates to pick from, and whether Merlin's AI reads the call. */
  calls?: CallsInfo;
}
export interface CallsInfo {
  recorders: { key: string; name: string; connected: boolean }[];
  templates: { id: string; title: string; mine: boolean }[];
  /** Merlin's AI reads the call (on, Close, agreed, AI usage left); else Merlin's own rules do. */
  ai: boolean;
}
export type WorkflowsAnswer = WorkflowsView | { on: false };
