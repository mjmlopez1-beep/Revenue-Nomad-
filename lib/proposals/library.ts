/**
 * The proposal library (templates.json: blocks, templates, what to pull from a call, objections)
 * and the pure rules on top of it: a template's starting blocks, filling {{fields}}, the live
 * checklist of what winning proposals do, and the risk flags. No Node or React imports: the app,
 * the server, the connector and the tests all read it.
 *
 * templates.json is generic: no client names, people or figures. Its example sentences are newly
 * written. It is safe in a public repo.
 */
import raw from "./templates.json";
import type { DiscoveryNote, ProposalBlock, SignerInfo } from "./types";

export interface LibField {
  key: string;
  label: string;
  type: string;
  required: boolean;
  source: string;
  options?: string[];
  default?: string | number | boolean;
}
export interface LibBlock {
  id: string;
  title: string;
  purpose: string;
  guidance: string;
  goodLooksLike: string[];
  commonMistakes: string[];
  exampleText: string[];
  fields: LibField[];
}
export interface LibTemplate {
  id: string;
  title: string;
  bestFor: string;
  stageBand: string;
  pricingModel: string;
  pricingGuidance: string;
  lengthTarget: string;
  blocks: { blockId: string; required: boolean; overrides?: Partial<Pick<LibBlock, "guidance" | "exampleText">> }[];
}
export interface DiscoveryField {
  key: string;
  feeds: string[];
  extract: string;
  cues: string[];
}
export interface RiskFlagDef {
  id: string;
  when: string;
  message: string;
}

const lib = raw as unknown as {
  blocks: LibBlock[];
  templates: LibTemplate[];
  discoveryExtraction: { description: string; fields: DiscoveryField[]; riskFlags: RiskFlagDef[] };
  objectionLibrary: { objection: string; response: string }[];
  fieldSources: Record<string, string>;
};

export const BLOCKS: LibBlock[] = lib.blocks;
export const TEMPLATES: LibTemplate[] = lib.templates;
export const DISCOVERY_FIELDS: DiscoveryField[] = lib.discoveryExtraction.fields;
export const RISK_DEFS: RiskFlagDef[] = lib.discoveryExtraction.riskFlags;
export const OBJECTIONS = lib.objectionLibrary;
export const blockDef = (id: string): LibBlock | undefined => BLOCKS.find((b) => b.id === id);
export const templateDef = (id: string | null | undefined): LibTemplate | undefined => TEMPLATES.find((t) => t.id === id);

/** The one template Free can start from. The rest are Trial and Pro. */
export const FREE_TEMPLATE = "fractional-sales-leader";

/** A block's guidance in a template: the template's own words where it has them. */
export function guidanceFor(blockId: string, templateId: string | null): { guidance: string; exampleText: string[] } | null {
  const b = blockDef(blockId);
  if (!b) return null;
  const o = templateDef(templateId)?.blocks.find((x) => x.blockId === blockId)?.overrides;
  return { guidance: o?.guidance ?? b.guidance, exampleText: o?.exampleText ?? b.exampleText };
}

/**
 * Each block's starting text. {{key}} is a field the record, the member's profile, the rate
 * benchmarks or the call fills; the rest is a scaffold in plain words that the member rewrites.
 */
export const STARTER: Record<string, string> = {
  cover: "{{headline}}\n\nPrepared for {{client.signerName}}, {{client.signerTitle}}, {{client.companyName}}\nPrepared by {{provider.name}}, {{provider.title}}\n{{proposal.date}} · Version {{proposal.version}}",
  what_we_heard: "What we heard on {{discovery.callDate}}:\n{{pains}}",
  why_now: "{{whyNow.trigger}}\n\nWaiting has a cost: {{whyNow.costOfWaiting}}",
  diagnosis: "{{diagnosis.reframe}}\n\n{{diagnosis.patterns}}",
  the_math:
    "Your goal: {{goals.target}}\nWhere you are today: {{metrics.runRate}}\nAverage deal: {{metrics.avgDealValue}}\nSales cycle: {{metrics.cycleLength}}\n{{metrics.conversionRates}}\n\nWorking back from the goal, these are the assumptions we will check in the first 30 days:\n{{math.assumptions}}\n\nAn honest goal for the first quarter: {{math.nearTermGoal}}",
  recommendation: "We recommend one option:\n{{seats}}\n\nWhat this role is not: {{notThisRole}}",
  role_profile: "Must have:\n{{candidate.mustHave}}\n\nNice to have:\n{{candidate.niceToHave}}\n\nNot a fit:\n{{candidate.notAFit}}",
  phases_workstreams:
    "Phase 1, days 1 to 90: build\n- Weeks 1 to 2, diagnose: interviews, data and a ranked list of what to fix. Deliverable: a written readout. Expected impact: you know where deals leak.\n- Weeks 3 to 6, process: stages, exit rules and the weekly rhythm. Deliverable: a one-page sales process. Expected impact: the team runs one way.\n- Weeks 6 to 12, team and coaching: call reviews, 1:1s and the forecast. Deliverable: a forecast you can read in five minutes. Expected impact: fewer surprises at month end.\n\nPhase 2, from day 91: run and hand over\n{{workstreams}}",
  milestones:
    "- Day 30: a readout of what we found, with a ranked list of changes. You decide what we fix first.\n- Day 60: the new process is live with the team. You decide what to scale.\n- Day 90: results against the plan. You decide to continue, scale up or wrap up.",
  success_measures: "What good looks like: {{goals.successDefinition}}\n\nWe will measure:\n{{successMeasures}}",
  operating_cadence: "- Weekly: a 30-minute session with you, and a short written update.\n- Monthly: a review of the numbers and the plan.\n{{cadence}}",
  reporting_structure: "Reports to: {{reportsTo}}\nWorks with: {{directReports}}\n\nDecisions on hiring, exits and pricing stay with you. We bring the analysis and a written recommendation.\n{{decisionRights}}",
  assumptions:
    "This works when:\n{{dependencies}}\n- Access to the CRM and the sales data in week one.\n- A standing 30-minute weekly session with you. It is the biggest factor in how fast this moves.\n- This scope is priced for a team of up to {{teamSizeCap}}. A larger team is a written change.",
  out_of_scope: "Not included, and available by written change:\n{{outOfScope}}",
  why_fractional: "Compared with a full-time hire:\n- Time to start: weeks, not a quarter of searching.\n- Cost if the call is wrong: 30 days' notice, not a severance.\n{{comparison.rows}}",
  proof: "{{provider.about}}\n\nWork like this before:\n{{caseStudies}}",
  team_rates: "{{team}}",
  investment:
    "Term: {{term.initialMonths}} months, then month to month with {{term.noticeDays}} days' notice. You can stop at day {{term.optOutDay}}.\nMonths 1 to 3, the build: {{pricing.monthlyFee}} a month for {{pricing.allocation}}.\nFrom month 4: {{pricing.stepDownFee}} a month.\nHours past the allocation: {{pricing.overageRate}} an hour, only with your written OK.\nBilled monthly in advance, due within {{billing.dueDays}} days.",
  payment_schedule: "{{schedule}}",
  future_phases: "Once this is working, the next phases could be:\n{{futurePhases}}",
  next_steps: "{{nextStep}}\n- Today: you read this proposal and sign it online.\n- Within 2 days of signing: a kickoff call to plan week one.\n- Week 1: access to the CRM and data, and the first weekly session.\n{{commitment}}",
  terms:
    "This proposal is the statement of work under our consulting agreement. Governing law: {{terms.governingLaw}}. What you share with us stays confidential. Neither side hires the other's people for 12 months after the work ends. A signature made electronically, and an electronic copy of this document, count the same as a signed original.",
  signature: "Signed for {{client.companyName}} by {{client.signerName}}, {{client.signerTitle}}.\nSigned for the provider by {{provider.signerName}}.",
  addendum_header: "This addendum follows the terms of our agreement of {{addendum.originalAgreementDate}} and changes only what is below, from {{addendum.effectiveDate}}.\n{{addendum.changes}}\n\nWe review it together on {{addendum.reviewDate}}.",
};
export const CUSTOM_STARTER = "Write this section in your own words.";

let seq = 0;
/** A block id that is new within a proposal. */
export const newBlockId = () => `b${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** A library block as a proposal block. */
export function makeBlock(blockId: string): ProposalBlock {
  const b = blockDef(blockId);
  return { id: newBlockId(), blockId: b ? b.id : "custom", title: b ? b.title : "New section", body: b ? STARTER[b.id] ?? b.exampleText.join("\n\n") : CUSTOM_STARTER };
}

/** A template's blocks, in its order. Blank: a cover, the investment and the signature. */
export function templateBlocks(templateId: string | null): ProposalBlock[] {
  const t = templateDef(templateId);
  const ids = t ? t.blocks.map((b) => b.blockId) : ["cover", "what_we_heard", "recommendation", "investment", "next_steps", "signature"];
  return ids.map(makeBlock);
}

/** The defaults the library gives a template's fields (an initial term of 3 months, 30 days' notice). */
export function fieldDefaults(blocks: ProposalBlock[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const b of blocks)
    for (const f of blockDef(b.blockId)?.fields ?? []) if (f.default !== undefined && f.default !== false && f.default !== 0 && out[f.key] === undefined) out[f.key] = String(f.default);
  return out;
}

/** Every field a block uses: its {{keys}} in order, with the library's label where it has one. */
export function blockFields(b: ProposalBlock): { key: string; label: string; source: string; type: string }[] {
  const def = blockDef(b.blockId);
  const seen = new Set<string>();
  const out: { key: string; label: string; source: string; type: string }[] = [];
  for (const key of placeholders(b.body)) {
    if (seen.has(key)) continue;
    seen.add(key);
    const f = def?.fields.find((x) => x.key === key) ?? BLOCKS.flatMap((x) => x.fields).find((x) => x.key === key);
    out.push({ key, label: f?.label ?? EXTRA_LABELS[key] ?? key, source: f?.source ?? "manual", type: f?.type ?? "text" });
  }
  return out;
}
const EXTRA_LABELS: Record<string, string> = { "provider.title": "Your title", "company.industry": "Industry", "company.revenue": "Revenue", "company.employees": "Employees", "company.hq": "HQ" };

/**
 * A {{key}} in words, for a person: the library's label ("Signer name"), else the key made
 * readable ("start.date" reads "Start date"). Never the key itself in a sentence to the member.
 */
export function fieldLabel(key: string): string {
  const f = BLOCKS.flatMap((x) => x.fields).find((x) => x.key === key);
  if (f?.label) return f.label;
  if (EXTRA_LABELS[key]) return EXTRA_LABELS[key];
  const words = (key.split(".").pop() ?? key)
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .toLowerCase()
    .trim();
  return words ? words[0].toUpperCase() + words.slice(1) : key;
}
/** Blanks in words, first few by name: "Headline, Signer name and 3 more". */
export function blanksInWords(keys: string[], n = 4): string {
  const l = keys.slice(0, n).map((k) => fieldLabel(k).replace(/\s*\([^)]*\)$/, ""));
  const more = keys.length - l.length;
  if (more > 0) return `${l.join(", ")} and ${more} more`;
  return l.length > 1 ? `${l.slice(0, -1).join(", ")} and ${l[l.length - 1]}` : l[0] ?? "";
}

const PH = /\{\{\s*([A-Za-z0-9_.]+)\s*\}\}/g;
/** The {{keys}} in a text, in order. */
export const placeholders = (text: string): string[] => [...text.matchAll(PH)].map((m) => m[1]);

/**
 * A block's text with its fields filled. A {{key}} alone on a line with a value of several lines
 * becomes one bullet each. An empty value stays as {{key}}: the checklist counts it as a blank,
 * and a proposal with blanks can't be sent. `blank` instead replaces it (for a preview).
 */
export function fill(body: string, fields: Record<string, string>, blank?: (key: string) => string): string {
  const val = (k: string) => (fields[k] ?? "").trim();
  const lines = body.split("\n").flatMap((line) => {
    const only = line.trim().match(/^(- )?\{\{\s*([A-Za-z0-9_.]+)\s*\}\}$/);
    if (only) {
      const v = val(only[2]);
      if (!v) return blank ? [] : [line];
      const parts = v.split("\n").map((x) => x.trim()).filter(Boolean);
      return parts.length > 1 || only[1] ? parts.map((p) => (p.startsWith("- ") ? p : `- ${p}`)) : parts;
    }
    return [oneUnit(line.replace(PH, (m, k: string) => val(k) || (blank ? blank(k) : m)))];
  });
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

const UNIT = "(?:hour|hr|day|week|wk|month|mo|year|yr)";
/**
 * One unit after a price: a value that carries its own ("$1,200 a day", "$250/hr") in a starter
 * that adds one ("{{pricing.overageRate}} an hour") reads "$1,200 a day", never "a day an hour".
 */
export const oneUnit = (s: string) =>
  s.replace(new RegExp(`((?:\\b(?:a|an|per)\\s+|\\/\\s*)${UNIT}s?\\b)(?:\\s*,)?\\s+(?:a|an|per)\\s+${UNIT}s?\\b`, "gi"), "$1");

/** The blanks left in a filled proposal: the {{keys}} nothing filled, once each. */
export function blanksOf(blocks: ProposalBlock[], fields: Record<string, string>): string[] {
  return [...new Set(blocks.flatMap((b) => placeholders(fill(b.body, fields))))];
}

/** The fields as the document reads them: the version, and the signer where the cover has none. */
export function docFields(p: { fields: Record<string, string>; version: number; signer: SignerInfo | null }): Record<string, string> {
  const f: Record<string, string> = { ...p.fields, "proposal.version": String(p.version) };
  if (p.signer) {
    if (!f["client.signerName"]?.trim()) f["client.signerName"] = p.signer.name;
    if (!f["client.signerTitle"]?.trim() && p.signer.title) f["client.signerTitle"] = p.signer.title;
    if (!f["client.signerEmail"]?.trim()) f["client.signerEmail"] = p.signer.email;
  }
  return f;
}

/** The proposal as the client reads it: each block's title and filled text. */
export const rendered = (blocks: ProposalBlock[], fields: Record<string, string>) => blocks.map((b) => ({ title: b.title, text: fill(b.body, fields) }));

/* ---------- where an accepted line from a call goes ---------- */

/**
 * The field a discovery line fills when the member accepts it, or null: kept as a private note
 * only (who decides, budget, sensitivities, objections: for the member, never the document).
 */
export const DISCOVERY_TARGET: Record<string, string | null> = {
  "company.profile": null,
  "goals.target": "goals.target",
  "goals.successDefinition": "goals.successDefinition",
  "currentState.team": "pains",
  "currentState.process": "pains",
  "currentState.systems": "pains",
  pains: "pains",
  metrics: "metrics.conversionRates",
  priorAttempts: "diagnosis.patterns",
  whyNow: "whyNow.trigger",
  timeline: null,
  "decision.process": null,
  "decision.signerOnCall": null,
  "budget.signals": "budget.signals",
  roleShape: "seats",
  candidate: "candidate.mustHave",
  stakeholders: null,
  dependencies: "dependencies",
  sensitivities: null,
  outOfScopeHints: "outOfScope",
  objectionsRaised: null,
  nextStep: "nextStep",
  buyerPhrases: null,
  check: null,
};
/** Fields that are the member's own notes: never put in a document's text by the starter blocks. */
export const PRIVATE_FIELDS = new Set(["budget.signals"]);
export const DISCOVERY_LABELS: Record<string, string> = {
  "company.profile": "About the company",
  "goals.target": "Their goal",
  "goals.successDefinition": "What success looks like",
  "currentState.team": "The team today",
  "currentState.process": "How deals run today",
  "currentState.systems": "Systems and data",
  pains: "Pains",
  metrics: "Numbers",
  priorAttempts: "What they tried",
  whyNow: "Why now",
  timeline: "Timeline",
  "decision.process": "Who decides",
  "decision.signerOnCall": "The person who signs",
  "budget.signals": "Budget signals",
  roleShape: "The role they picture",
  candidate: "Who they want",
  stakeholders: "People involved",
  dependencies: "What they can give",
  sensitivities: "Handle with care",
  outOfScopeHints: "Not for you to do",
  objectionsRaised: "Their worries",
  nextStep: "Next step",
  buyerPhrases: "Their own words",
  check: "Check before you send",
};

/** Accept a line into a proposal: into its field (one line more), and always as a note. */
export function acceptInto(fields: Record<string, string>, notes: DiscoveryNote[], key: string, text: string, at: string): { fields: Record<string, string>; notes: DiscoveryNote[] } {
  const t = text.trim();
  const target = DISCOVERY_TARGET[key];
  const f = { ...fields };
  if (target) f[target] = f[target]?.trim() ? `${f[target].trim()}\n${t}` : t;
  return { fields: f, notes: [...notes, { key, text: t, at }] };
}

/* ---------- the checklist: what winning proposals do ---------- */

/** The patterns the checklist checks, in words a drafter (the member's Claude, or Merlin's) can follow. */
export const WINNING_PATTERNS: string[] = [
  "Address it to the person who signs, by name and title, not a go-between.",
  "Open with what you heard, in the buyer's own words: their goal, their pains, why now.",
  "The math works back from their own target (revenue goal, run rate, deal size, cycle) to what has to be true.",
  "Recommend one option, and say what the role is not.",
  "State one price for it: a monthly fee with the hours or days it covers. Never leave the price for a later email.",
  "A heavier build in months 1 to 3, then a lower steady fee from month 4.",
  "3 to 7 workstreams, each with week ranges, a deliverable and the expected impact.",
  "Milestones at day 30, 60 and 90, each ending in a decision the client makes (continue, scale, change, stop).",
  "What the client must give (data access in week one, a weekly session) as conditions for success.",
  "A short first term (6 months or less), then month to month with notice, and an out at day 90.",
  "Dated next steps, with who does each.",
  "Say that an electronic signature counts as the original.",
  "Send it within 48 hours of the call.",
];

export interface CheckItem {
  id: string;
  label: string;
  ok: boolean;
  /** What is missing, in a sentence (only when not ok). */
  missing?: string;
  /** Not a must: a nudge (send within 48 hours). */
  soft?: boolean;
}

const textOf = (blocks: ProposalBlock[], fields: Record<string, string>, ids: string[]) =>
  blocks
    .filter((b) => ids.includes(b.blockId))
    .map((b) => fill(b.body, fields))
    .join("\n");
const has = (blocks: ProposalBlock[], id: string) => blocks.some((b) => b.blockId === id);
const filled = (fields: Record<string, string>, k: string) => !!fields[k]?.trim();
const MONEY = /\$\s?\d/;

/** A dollar amount as a number ("$12,500", "12.5k", "$12k a month"), or null. */
export function moneyOf(raw: string | undefined | null): number | null {
  const t = String(raw ?? "").toLowerCase().replace(/,/g, "");
  const m = t.match(/(\d+(?:\.\d+)?)\s*(k|m)?(?![a-z])/);
  if (!m) return null;
  const n = Number(m[1]) * (m[2] === "k" ? 1000 : m[2] === "m" ? 1_000_000 : 1);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

/**
 * The live checklist. Each item is one of the patterns that separated the proposals that were
 * signed from the ones that weren't, checked on what the proposal says now.
 */
export function checklist(p: { blocks: ProposalBlock[]; fields: Record<string, string>; signer: { name: string; email: string } | null; signerOnCall: boolean | null }, nowMs = Date.now()): CheckItem[] {
  const { blocks, fields } = p;
  const all = textOf(blocks, fields, blocks.map((b) => b.blockId));
  const items: CheckItem[] = [];
  const push = (id: string, label: string, ok: boolean, missing: string, soft = false) => items.push({ id, label, ok, ...(ok ? {} : { missing }), ...(soft ? { soft } : {}) });

  const signerName = p.signer?.name?.trim() || fields["client.signerName"]?.trim() || "";
  push(
    "signer",
    "Addressed to the person who signs",
    !!signerName && p.signerOnCall !== false && (!p.signer || !fields["client.signerName"] || fields["client.signerName"].trim() === p.signer.name.trim()),
    !signerName
      ? "Name the person who signs it, on the cover and in Send."
      : p.signerOnCall === false
        ? "The person who signs wasn't on the call. Ask to walk them through it before you send."
        : "The cover names someone other than the person you send it to.",
  );
  const math = textOf(blocks, fields, ["the_math"]);
  push("math", "The math works back from their own target", has(blocks, "the_math") && filled(fields, "goals.target") && !/\{\{/.test(math), has(blocks, "the_math") ? "Fill in their goal and the numbers that get there." : "Add The math: start from their revenue goal and work back.");
  const invest = textOf(blocks, fields, ["investment", "payment_schedule", "team_rates"]);
  push("price", "One price, stated", (filled(fields, "pricing.monthlyFee") || MONEY.test(invest)) && !/\{\{\s*pricing\.monthlyFee/.test(invest), has(blocks, "investment") ? "State the monthly fee. A price left for a later email stalls deals." : "Add Timeline and investment, with one price.");
  const fee = moneyOf(fields["pricing.monthlyFee"]);
  const step = moneyOf(fields["pricing.stepDownFee"]);
  push("stepdown", "A heavier build, then a lower monthly fee", (fee !== null && step !== null && step < fee) || /from month \d/i.test(invest), "Make months 1 to 3 the build, then a lower steady fee from month 4.", true);
  const plan = textOf(blocks, fields, ["phases_workstreams"]);
  const streams = plan.split("\n").filter((l) => /^- /.test(l.trim()) && /deliverable/i.test(l)).length;
  push(
    "workstreams",
    "3 to 7 workstreams, each with weeks, a deliverable and the impact",
    streams >= 3 && streams <= 7 && plan.split("\n").filter((l) => /^- /.test(l.trim()) && /deliverable/i.test(l)).every((l) => /week/i.test(l) && /impact/i.test(l)),
    has(blocks, "phases_workstreams") ? `Give each workstream weeks, a Deliverable and an Expected impact (${streams} now).` : "Add the plan: 3 to 7 workstreams with weeks, a deliverable and the impact.",
  );
  const ms = textOf(blocks, fields, ["milestones"]);
  push("milestones", "30/60/90 milestones that each end in a decision", /day 30/i.test(ms) && /day 60/i.test(ms) && /day 90/i.test(ms) && (ms.match(/decid|decision/gi) ?? []).length >= 3, has(blocks, "milestones") ? "Give day 30, 60 and 90 each a decision for them to make." : "Add Milestones: day 30, 60 and 90, each ending in a decision.");
  const deps = textOf(blocks, fields, ["assumptions"]);
  push("dependencies", "What they need to give, as conditions for success", has(blocks, "assumptions") && deps.split("\n").filter((l) => /^- /.test(l.trim())).length >= 2, "Add Assumptions: data access in week one and a weekly session with them.");
  const rec = textOf(blocks, fields, ["recommendation", "reporting_structure"]);
  push("boundaries", "Says what the role is not", /\bnot\b/i.test(rec) && !/\{\{\s*notThisRole/.test(rec), "Say what this role is not, and who keeps their job.");
  const months = Number(fields["term.initialMonths"]);
  push(
    "terms",
    "A short first term, notice and a way out",
    (Number.isFinite(months) && months > 0 && months <= 6 && filled(fields, "term.noticeDays")) || /month to month/i.test(invest),
    "Keep the first term to 6 months or less, then month to month with notice. An out at day 90 lowers the risk of yes.",
  );
  const next = textOf(blocks, fields, ["next_steps"]);
  push("next", "A dated next step", has(blocks, "next_steps") && (/\b(today|tomorrow|monday|tuesday|wednesday|thursday|friday|week \d|within \d|\d{1,2}\/\d{1,2}|jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)/i.test(next) || filled(fields, "nextStep")), "Add Next steps with dates and who does each.");
  push("esign", "Electronic signatures count", /electronic/i.test(textOf(blocks, fields, ["terms", "signature"])), "Add Terms: it says an electronic signature counts as the original.", true);
  const blanks = blanksOf(blocks, fields);
  push("blanks", "Every blank filled", blanks.length === 0, `${blanks.length} ${blanks.length === 1 ? "blank" : "blanks"} left to fill.`);
  const call = Date.parse(fields["discovery.callDate"] ?? "");
  if (Number.isFinite(call)) push("speed", "Sent within 48 hours of the call", nowMs - call <= 2 * 86_400_000, "The call was more than 2 days ago. Send it today: proposals that wait go quiet.", true);
  void all;
  return items;
}

/* ---------- risk flags ---------- */

export interface RiskFlag {
  id: string;
  message: string;
}

/** The risk flags the research names, from what the member accepted and the proposal's fields. `bandHigh`: the top of the market's middle half. */
export function riskFlags(p: { fields: Record<string, string>; notes: DiscoveryNote[]; signerOnCall: boolean | null; templateId: string | null }, bandHigh: number | null = null): RiskFlag[] {
  const out: RiskFlag[] = [];
  const said = (k: string) => p.notes.some((n) => n.key === k) || !!p.fields[DISCOVERY_TARGET[k] ?? ""]?.trim();
  if (p.signerOnCall === false) out.push({ id: "signer_absent", message: "The person who signs wasn't on the call. Proposals that went through a go-between lost more often. Ask to present it to them." });
  if (!said("budget.signals")) out.push({ id: "no_budget_signal", message: "No budget signal yet. Ask for a range, or what others quoted, before you send." });
  if (!said("nextStep")) out.push({ id: "no_next_step", message: "No dated next step. Book the review meeting before you send." });
  const fee = moneyOf(p.fields["pricing.monthlyFee"]);
  if (fee === null && templateDef(p.templateId)?.pricingModel !== "fixed_fee_phased") out.push({ id: "price_deferred", message: "No price yet. State one: deferring it to a later email stalled deals." });
  if (fee !== null && bandHigh !== null && fee > bandHigh) out.push({ id: "over_band", message: "Above the middle half of what fractionals were paid at this size. Offer a lighter option too: fewer days, same rate." });
  return out;
}
