/**
 * Everything a drafter needs to write one proposal, in one answer: the chosen template's sections
 * with their guidance (the library's, or the member's own template with its text), the patterns
 * that won, the rate band for this company's size from Merlin's own rate logic (lib/proposals/
 * rates.ts, the Rate benchmarks' figures and floors, never the private rate file), the company's
 * facts as the member's table shows them (a locked company keeps its name hidden), the member's
 * profile and writing voice (lib/voice.ts), and the shape to send it back in.
 *
 * The member's own Claude reads it through the connector (get_proposal_kit) and Merlin's server
 * drafter (lib/proposals/draft.ts) reads the same thing, so both draft from the same inputs.
 */
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member } from "../table";
import { functionOf } from "../tableFields";
import { styleOf, voiceSummary } from "../voice";
import { memberView } from "../mcp/view";
import { DISCOVERY_FIELDS, DISCOVERY_LABELS, STARTER, TEMPLATES, WINNING_PATTERNS, blockDef, guidanceFor, templateDef } from "./library";
import { adviceFromView } from "./rates";
import { isMineId, templatesOf } from "./mine";
import { ProposalProblem, buildGate, companyFor } from "./store";

export interface KitSection {
  block_id: string;
  title: string;
  required: boolean;
  purpose?: string;
  guidance?: string;
  good_looks_like?: string[];
  common_mistakes?: string[];
  example?: string[];
  /** The library's starting text, with its {{keys}}. */
  starter?: string;
  /** The member's own words for this section, from their template. */
  their_text?: string;
}

export interface ProposalKit {
  template: { id: string | null; title: string; mine: boolean; best_for?: string; stage?: string; pricing_guidance?: string; length_target?: string; sections: KitSection[] };
  winning_patterns: string[];
  rate_band: { function: string; revenue_band: string; market: string; your_price?: string; your_rate?: string; shape: string[]; template_guidance?: string } | { note: string; shape: string[] };
  company: { id: string | null; name: string; locked: boolean; facts: Record<string, string> };
  me: { name: string; title: string; function: string | null };
  voice: { summary: string; formality: string; length: string; contractions: boolean; exclamations: string; phrases: string[] } | null;
  /** The {{keys}} the checklist and the pipeline read, to set alongside the text. */
  key_fields: Record<string, string>;
  from_a_call: { key: string; label: string; extract: string }[];
}

export const KEY_FIELDS: Record<string, string> = {
  "pricing.monthlyFee": 'The monthly fee for the recommended option, like "$12,000".',
  "pricing.stepDownFee": "The lower monthly fee from month 4, when there is one.",
  "pricing.allocation": 'What the fee covers, like "15 hours a week" or "two days a week".',
  "term.initialMonths": "The first term in months, like 3.",
  "term.noticeDays": "Days of notice after the first term, like 30.",
  "goals.target": "The client's own target, in their words.",
  "client.signerName": "The person who signs.",
  "client.signerTitle": "Their title.",
  "discovery.callDate": 'The call\'s date, like "November 18, 2026".',
  nextStep: "The dated next step.",
};

const titleOf = (s: Awaited<ReturnType<typeof loadState>>, me: Member) => s.profiles[me.id]?.title || (me.title === "Member" ? "" : me.title) || "";

/** The kit for one proposal. `templateId`: a library template, one of theirs (mt_...), or none for the blank page. */
export async function proposalKit(token: string | null, a: { templateId?: string | null; companyId?: string | null; companyName?: string | null }): Promise<ProposalKit> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) throw new ProposalProblem("You're signed out. Sign in again.", 401);
  // The kit is for building a proposal: Close and the trial (lib/billing/rules.ts canClose), else the upgrade prompt.
  buildGate(s, me.id, Date.now());
  const tid = a.templateId || null;
  let template: ProposalKit["template"];
  if (isMineId(tid)) {
    const t = templatesOf(s, me.id).find((x) => x.id === tid);
    if (!t) throw new ProposalProblem("That template of yours isn't there anymore.", 404);
    template = {
      id: t.id,
      title: t.title,
      mine: true,
      sections: t.blocks.map((b) => {
        const def = blockDef(b.blockId);
        return { block_id: def ? b.blockId : "custom", title: b.title, required: true, ...(def ? { purpose: def.purpose, guidance: def.guidance } : {}), their_text: b.body };
      }),
    };
  } else {
    const t = templateDef(tid);
    if (tid && !t) throw new ProposalProblem("That template isn't in the library.");
    const ids = t ? t.blocks.map((b) => ({ id: b.blockId, required: b.required })) : ["cover", "what_we_heard", "recommendation", "milestones", "investment", "next_steps", "signature"].map((id) => ({ id, required: true }));
    template = {
      id: t?.id ?? null,
      title: t?.title ?? "A blank page",
      mine: false,
      ...(t ? { best_for: t.bestFor, stage: t.stageBand, pricing_guidance: t.pricingGuidance, length_target: t.lengthTarget } : {}),
      sections: ids.map(({ id, required }) => {
        const b = blockDef(id)!;
        const g = guidanceFor(id, t?.id ?? null);
        return { block_id: id, title: b.title, required, purpose: b.purpose, guidance: g?.guidance ?? b.guidance, good_looks_like: b.goodLooksLike, common_mistakes: b.commonMistakes, example: g?.exampleText ?? b.exampleText, starter: STARTER[id] ?? "" };
      }),
    };
  }
  const pub = a.companyId || null;
  const co = pub ? await companyFor(token!, pub) : null;
  if (pub && !co) throw new ProposalProblem("That company isn't on Merlin. Give its name instead.");
  const name = co ? co.name || String(a.companyName ?? "").trim() : String(a.companyName ?? "").trim().slice(0, 120);
  const fn = s.profiles[me.id]?.function ?? functionOf(me.title) ?? null;
  const mv = await memberView(me);
  const advice = adviceFromView(mv.view, { company: { id: co ? pub : null }, fields: co?.facts ?? {}, templateId: isMineId(tid) ? null : tid });
  const sug = advice.suggestion;
  const v = s.voice?.[me.id];
  const style = v ? styleOf(v) : null;
  return {
    template,
    winning_patterns: WINNING_PATTERNS,
    rate_band: sug
      ? {
          function: sug.fn,
          revenue_band: sug.band ?? "every size",
          market: sug.says,
          ...(sug.sits ? { your_price: sug.sits } : {}),
          ...(sug.own ? { your_rate: `$${sug.own.amount.toLocaleString("en-US")} ${sug.own.kind === "hourly" ? "an hour" : "a month"} (the member's own, for them alone)` } : {}),
          shape: advice.shape,
          ...(advice.template ? { template_guidance: advice.template } : {}),
        }
      : { note: fn ? `No rate figure for ${fn} at this size yet.` : "The member hasn't set their function, so there is no rate figure.", shape: advice.shape },
    company: { id: co ? pub : null, name: name || (co?.hidden ? "A locked company on Merlin (its name is hidden)" : ""), locked: !!co?.hidden, facts: Object.fromEntries(Object.entries(co?.facts ?? {}).map(([k, x]) => [k.replace("company.", ""), x])) },
    me: { name: me.name, title: titleOf(s, me), function: fn },
    voice: style ? { summary: voiceSummary(style, me.name), formality: style.formality, length: style.length, contractions: style.contractions, exclamations: style.exclamations, phrases: style.phrases } : null,
    key_fields: KEY_FIELDS,
    from_a_call: DISCOVERY_FIELDS.map((f) => ({ key: f.key, label: DISCOVERY_LABELS[f.key] ?? f.key, extract: f.extract })),
  };
}

/** Every template a member can start from: theirs, then the library's. Without Close none is open (theirs stay stored). */
export function templateChoices(s: Awaited<ReturnType<typeof loadState>>, memberId: string, free: boolean) {
  return [
    ...templatesOf(s, memberId).map((t) => ({ id: t.id, title: t.title, about: t.fileName, mine: true, open: !free, sections: t.blocks.length })),
    ...TEMPLATES.map((t) => ({ id: t.id, title: t.title, about: t.bestFor, mine: false, open: !free, sections: t.blocks.length })),
  ];
}
