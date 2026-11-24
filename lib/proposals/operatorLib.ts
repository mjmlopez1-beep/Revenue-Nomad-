/**
 * The "Senior operator inside the business" family (RN_PROPOSALS2): a proposal built the way a deck
 * that closes reads (what I heard, a thesis, pitfalls, the engagement at a glance, why us, the first
 * 90 days on a clock, what you'll have by day 30, the math, where the operator sits, the investment,
 * questions for the next meeting, next steps), and its companion agreement (scope, staffing,
 * governance, reporting, cadence, phases with dated deliverables, focus areas, commitments, out of
 * scope, success measures, fees and terms). Generic: no client, member or owner names, no numbers.
 * Merged into the library (library.ts) so templateDef and blockDef know them. Pure data.
 */
import type { LibBlock, LibTemplate } from "./library";

const block = (id: string, title: string, purpose: string, guidance: string, fields: LibBlock["fields"] = []): LibBlock => ({ id, title, purpose, guidance, goodLooksLike: [], commonMistakes: [], exampleText: [], fields });

export const OPERATOR_BLOCKS: LibBlock[] = [
  block("thesis", "Thesis", "Say in one sentence why the current course won't change the result, and what will.", "One sentence, then three short supporting lines, each a title and a line."),
  block("pitfalls", "Typical pitfalls", "Name the root causes common at companies like this, so the client sees the pattern before the fix.", "Three pitfalls, each with a title, a line on the cause, and what it shows up as."),
  block("engagement_glance", "The engagement at a glance", "The shape of the work in four cards.", "The operator, the days a week, the assessment, the arc. Only what was said or what the member sets."),
  block("day30", "What you'll have by day 30", "The concrete things the client holds at the first decision.", "Four cards, each a title and a line."),
  block("org_chart", "Where the operator sits", "Show who the operator reports to and works beside.", "The decision maker at the top, the leaders beside, the operator's seat, and why it sits there."),
  block("questions", "Questions for our next meeting", "The open points to settle together.", "Short questions, one a line."),
  block("scope", "Scope", "What the program is for and how it is delivered.", "The purpose in a paragraph, then how it is staffed and led."),
  block("governance", "Governance", "Who steers the program and how decisions are made.", "A committee chaired by the decision maker, its members, and how often it meets."),
  block("commitments", "What we commit to deliver", "The deliverables the client can hold us to.", "One a line, each something the client can see."),
  block("focus_areas", "Expected areas of focus", "Where the work is expected to go after the first decision.", "One a line; the day 30 readout sets the order."),
];

const t = (id: string, title: string, bestFor: string, blocks: string[]): LibTemplate => ({
  id,
  title,
  bestFor,
  stageBand: "$20M+ or PE-backed",
  pricingModel: "monthly_retainer",
  pricingGuidance: "A monthly fee for the days a week agreed, with the hours it covers shown. Never assume full time.",
  lengthTarget: "12 to 16 slides",
  blocks: blocks.map((blockId) => ({ blockId, required: true })),
});

/** The proposal: a deck that reads like the one that closes. */
export const SENIOR_OPERATOR = "senior-operator";
/** Its companion agreement, drafted from the same call brief. */
export const OPERATOR_AGREEMENT = "operator-agreement";

export const OPERATOR_TEMPLATES: LibTemplate[] = [
  t(SENIOR_OPERATOR, "Senior operator inside the business", "A senior operator embedded a few days a week to diagnose, redesign and own the change, from a 30-day assessment to a day-30 decision, then sprints.", [
    "cover",
    "what_we_heard",
    "thesis",
    "pitfalls",
    "why_fractional",
    "engagement_glance",
    "proof",
    "phases_workstreams",
    "day30",
    "the_math",
    "org_chart",
    "investment",
    "questions",
    "next_steps",
  ]),
  t(OPERATOR_AGREEMENT, "Agreement for a senior operator", "The partnership agreement that goes with the Senior operator proposal: scope, staffing, governance, phases with dated deliverables, commitments, success measures, fees and terms.", [
    "cover",
    "scope",
    "team_rates",
    "governance",
    "reporting_structure",
    "operating_cadence",
    "phases_workstreams",
    "focus_areas",
    "commitments",
    "out_of_scope",
    "success_measures",
    "assumptions",
    "investment",
    "agreement",
    "signature",
  ]),
];

/** Starter text for the new blocks (a section added by hand). */
export const OPERATOR_STARTER: Record<string, string> = {
  thesis: "{{thesis.line}}\n\n- Walks in as a peer: presented as leadership.\n- Owns the change: accountable for the work and the number.\n- Independent of the team being redesigned: the opinion can't be grounded by it.",
  pitfalls: "- The buyer changed how they buy; the motion didn't: the same plays keep running. Shows up as: the same effort while results keep falling.",
  engagement_glance: "- One senior operator: experienced at your stage.\n- {{pricing.allocation}}, embedded: in the meetings that matter.\n- A 30-day assessment: deep on the acute symptom first.\n- A few months to a new motion: a structured first 90 days, then sprints.",
  day30: "- The bridge, rebuilt: from the goal back to the top of the funnel.\n- The leaks found: where conversion actually breaks.\n- Findings ranked: each with evidence and a first move.\n- A roadmap: initiatives sized and sequenced for the day 30 decision.",
  org_chart: "Top: {{client.signerName}}, {{client.signerTitle}}\nOperator: Senior operator, reports to {{reportsTo}}",
  questions: "- Does this plan fit your planning calendar?\n- What would an ideal outcome at the end of the year be?",
  scope: "{{scope.purpose}}",
  governance: "A steering committee, chaired by {{client.signerName}}, meets every two weeks to confirm priorities and review progress.",
  commitments: "- A readout and a ranked backlog at day 30.\n- A short written summary every month.",
  focus_areas: "- Pipeline and measurement.\n- Coverage and territories.",
};
