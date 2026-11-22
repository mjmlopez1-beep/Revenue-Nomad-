/**
 * The proposal builder in Claude (lib/proposals): the member's own Claude does the smart part
 * (reading their call, writing the blocks in their words); Merlin stores, checks and sends.
 *
 *   get_proposal_kit             one call with everything to draft one proposal: the template (theirs or ours) and its
 *                                guidance, the patterns that won, the rate band, the company's facts, their profile and voice
 *   list_proposal_templates      the library and the member's own templates: blocks with their guidance and fields
 *   get_proposal                 the member's own proposals, or one with its filled text, blanks, checklist, risk flags and rates
 *   create_or_update_proposal    blocks and fields, and the lines from a call the member agreed to keep
 *   send_proposal_for_signature  asks first, like unlock: without confirm it sends nothing and says what would go out
 *   draft_proposal_from_call     a draft from a call's transcript the client already has (from Granola or anywhere),
 *                                or a Granola note id Merlin reads itself: read by Merlin's rules, never kept, with
 *                                the blanks to settle and where each part came from
 *   change_proposal              a change in plain words: the sections that change, a line each and the numbers
 *                                checked; saved as a new version only with apply: true (the one before is kept)
 *   send_document_for_signature  a contract uploaded in Merlin, its fields placed: asks first, like the proposal's
 *
 * The flow it is built for: the member says "use my XYZ template in Merlin and draft a proposal for
 * Acme from my call with Dana" to their Claude, with their meeting notes (Granola, Drive) connected.
 * Claude reads the call there, calls get_proposal_kit once, writes the whole proposal, saves it
 * with create_or_update_proposal and, after the member says yes, sends it. Only ever the member's
 * own proposals. Here Merlin calls no model: what comes in is what Claude wrote.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BLOCKS, DISCOVERY_FIELDS, DISCOVERY_LABELS, OBJECTIONS, STARTER, TEMPLATES, blanksInWords, blanksOf, blockDef, checklist, makeBlock, rendered, riskFlags } from "../proposals/library";
import { adviceFromView } from "../proposals/rates";
import { KEY_FIELDS, proposalKit } from "../proposals/kit";
import { templatesOf } from "../proposals/mine";
import { loadState } from "../table";
import { CLOSE_BUILD, ProposalProblem, STALE, createProposal, docFields, getProposal, linkDaysOf, listProposals, sendProposal, updateProposal } from "../proposals/store";
import { PricingProblem, cleanPricing, priced } from "../proposals/pricing";
import { upgradeUrl } from "../plan";
import { publicBase } from "../links";
import type { Pricing, ProposalBlock, ProposalRec } from "../proposals/types";
import { SENDER_DUTY } from "../proposals/types";
import { memberView } from "./view";
import { DISCOVERY_TARGET as TARGET, acceptInto, fieldLabel } from "../proposals/library";
import { extract, MAX_TRANSCRIPT } from "../proposals/extract";
import { readTerms, siteFromCall } from "../proposals/startCall";
import { CHANGE_CONSENT, CHANGE_OFF, acceptChange, checkChange, proposeChange, type ChangeProposal } from "../proposals/change";
import { aiConfigured } from "../proposals/aiConfig";
import { getDocument, sendDocument, notReadyOf } from "../documents/store";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

const wrap = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (e) {
    if (e instanceof ProposalProblem && e.message === STALE) throw new ToolProblem("The member changed this proposal on Merlin since you read it. Read it again with get_proposal, then apply your change to what's there.");
    if (e instanceof ProposalProblem) throw new ToolProblem(e.upgrade ? `${e.message} ${e.upgrade}` : e.message);
    throw e;
  }
};

export async function listProposalTemplates(ctx: Ctx): Promise<ToolOut> {
  const v = await wrap(() => listProposals(ctx.member.token, ctx.origin));
  const mine = templatesOf(await loadState(), ctx.member.id);
  // Without Close (after the trial): no template opens, Merlin's or theirs. Theirs stay stored and come back on upgrade.
  if (!v.canBuild)
    return {
      can_build: false,
      plan: `${CLOSE_BUILD} ${upgradeUrl((publicBase() ?? ctx.origin ?? "").replace(/\/$/, ""), "proposals")}`,
      your_templates_kept: mine.length,
      next: "Tell the member building proposals needs Close, and give them the link. Don't draft one for Merlin: it can't be saved on their plan.",
    };
  return {
    can_build: true,
    your_templates: mine.length
      ? mine.map((t) => ({ id: t.id, title: t.title, from_file: t.fileName, sections: t.blocks.map((b) => b.title) }))
      : "None yet. The member can upload a past proposal or SOW in Proposals on Merlin (My templates), then draft from its structure and voice.",
    about:
      "Templates and blocks distilled from proposals that won. Patterns that won: send it to the person who signs; The math works back from the client's own revenue target; one recommended option with the price stated; a heavier first 90 days, then a lower monthly fee; 3 to 7 workstreams with week ranges, a deliverable and the expected impact; day 30/60/90 milestones that each end in a decision; what the client must give, as conditions for success; what the role is not; a short first term with notice and an out; send within 24 to 48 hours of the call.",
    templates: TEMPLATES.map((t) => ({
      id: t.id,
      title: t.title,
      best_for: t.bestFor,
      stage: t.stageBand,
      pricing: t.pricingGuidance,
      blocks: t.blocks.map((b) => ({ block_id: b.blockId, required: b.required })),
      open: v.templatesOpen.includes(t.id),
    })),
    blocks: BLOCKS.map((b) => ({
      block_id: b.id,
      title: b.title,
      purpose: b.purpose,
      guidance: b.guidance,
      good_looks_like: b.goodLooksLike,
      common_mistakes: b.commonMistakes,
      fields: b.fields.map((f) => ({ key: f.key, label: f.label, from: f.source })),
      starter: STARTER[b.id] ?? "",
    })),
    from_a_call: DISCOVERY_FIELDS.map((f) => ({ key: f.key, label: DISCOVERY_LABELS[f.key] ?? f.key, extract: f.extract, cues: f.cues })),
    objections: OBJECTIONS,
    plan: "Every template is open, and sending for signature is on.",
  };
}

/** Everything to draft one proposal, in one call (lib/proposals/kit.ts). */
export async function getProposalKit(ctx: Ctx, a: { template?: string; company_id?: string; company_name?: string }): Promise<ToolOut> {
  const token = ctx.member.token;
  // A template by id, or by the name the member said ("my Acme SOW", "sprint 90").
  let templateId: string | null = a.template?.trim() || null;
  if (templateId && !/^mt_/.test(templateId) && !TEMPLATES.some((t) => t.id === templateId)) {
    const q = templateId.toLowerCase().replace(/\btemplate\b/g, "").trim();
    const mine = templatesOf(await loadState(), ctx.member.id);
    const hit = mine.find((t) => t.title.toLowerCase().includes(q) || t.fileName.toLowerCase().includes(q)) ?? TEMPLATES.find((t) => t.title.toLowerCase().includes(q) || t.id.includes(q.replace(/\s+/g, "-")));
    if (!hit) {
      const v = await wrap(() => listProposals(token, ctx.origin));
      throw new ToolProblem(`No template called "${a.template}". Theirs and ours: ${v.templates.map((t) => `${t.title} (${t.id})`).join("; ")}.`);
    }
    templateId = hit.id;
  }
  const kit = await wrap(() => proposalKit(token, { templateId, companyId: a.company_id ?? null, companyName: a.company_name ?? null }));
  return {
    ...kit,
    how_to_write_it: [
      "Read the member's call where it is (their meeting notes or transcript tool, or what they paste). Use the buyer's own words: their goal, pains, what they tried, why now. Quote at most a short phrase; never paste the transcript into Merlin.",
      "Write every section of the template, in its order, in the member's voice. Their own template: keep its headings and standing language, and replace everything about the old client.",
      "State one price, inside the rate band unless the call gives a reason: a monthly fee and what it covers, a heavier months 1 to 3, then lower. Day 30, 60 and 90 milestones, each ending in a decision for the client.",
      "Never invent a fact, number or name the call didn't give: leave a {{blank}} like {{start.date}} for the member to fill.",
      "Budget signals, who decides and sensitivities go in notes, never the document.",
    ],
    save_it_with: {
      tool: "create_or_update_proposal",
      args: {
        template_id: kit.template.id,
        ...(kit.company.id ? { company_id: kit.company.id } : { company_name: kit.company.name || "the client's name" }),
        title: "Short: what it is, for whom",
        blocks: kit.template.sections.map((x) => ({ block_id: x.block_id, title: x.title, body: "the section's full text" })),
        fields: Object.fromEntries(Object.keys(KEY_FIELDS).map((k) => [k, KEY_FIELDS[k]])),
        notes: [{ key: "budget.signals", text: "a private line for the member" }],
        signer: { name: "who signs", email: "their email, if the member gives it", title: "their title" },
        signer_on_call: "true or false",
      },
    },
    then: "Show the member the draft and the checklist get_proposal returns, fix what they ask, then send_proposal_for_signature (it asks first).",
  };
}

/** One proposal as Claude reads it: each block with its text filled, what's blank, the checklist, the risk flags and the rates. */
async function proposalOut(ctx: Ctx, p: ProposalRec): Promise<ToolOut> {
  const f = docFields(p);
  const mv = await memberView(ctx.member);
  const advice = adviceFromView(mv.view, p);
  const s = advice.suggestion;
  const checks = checklist({ ...p, fields: f });
  return {
    proposal_id: p.id,
    title: p.title,
    company: p.company.name || "Not named yet",
    ...(p.company.id
      ? { company_id: p.company.id }
      : { pipeline: "Not linked to a company on Merlin yet, so the member's pipeline won't move when they sign. Pass company_id (from find_company or search_companies), or the company's exact full name or website as company_name." }),
    template_id: p.templateId,
    status: p.status,
    version: p.version,
    revision: p.rev,
    signer: p.signer,
    signer_on_call: p.signerOnCall,
    blocks: p.blocks.map((b) => ({ block_id: b.blockId, title: b.title, body: b.body, reads: rendered([b], f)[0].text })),
    fields: p.fields,
    blanks: blanksOf(p.blocks, f),
    notes_from_calls: p.notes,
    ...(p.pricing ? { pricing: pricingOut(p.pricing) } : {}),
    link_days: p.linkDays === 0 ? "No end date" : p.linkDays,
    checklist: checks.map((c) => ({ pattern: c.label, done: c.ok, ...(c.missing ? { missing: c.missing } : {}) })),
    risk_flags: riskFlags(p, s?.high ?? null).map((r) => r.message),
    rates: s
      ? { function: s.fn, revenue_band: s.band ?? "every size", market: s.says, ...(s.sits ? { your_price: s.sits } : {}), shape: advice.shape, ...(advice.template ? { template_guidance: advice.template } : {}) }
      : { note: "No rate figure for this function yet.", shape: advice.shape },
    ...(p.send
      ? {
          sent: {
            to: p.send.signer,
            status: p.send.status,
            sent_at: p.send.sentAt,
            expires_at: p.send.expiresAt ?? "No end date",
            ...(p.send.choice ? { chose: p.send.choice.summary, total: p.send.choice.total } : {}),
            ...(p.send.waiting === "member" ? { waiting: "The client signed. It is finished, and the pipeline moves to Won, once the member countersigns on Merlin." } : {}),
            ...(p.send.viewedAt ? { opened_at: p.send.viewedAt } : {}),
            ...(p.send.signedAt ? { signed_at: p.send.signedAt, signed_copy: p.send.copyUrl } : {}),
            ...(p.send.declinedAt ? { declined_at: p.send.declinedAt, reason: p.send.declineReason } : {}),
            document_sha256: p.send.hash,
          },
        }
      : {}),
    edit_on_merlin: `${ctx.origin.replace(/\/$/, "")}/?p=proposals&pr=${encodeURIComponent(p.id)}`,
  };
}

export async function getProposalTool(ctx: Ctx, a: { proposal_id?: string }): Promise<ToolOut> {
  if (!a.proposal_id) {
    const v = await wrap(() => listProposals(ctx.member.token, ctx.origin));
    return {
      proposals: v.proposals.map((p) => ({ proposal_id: p.id, title: p.title, company: p.company.name || "Not named yet", status: p.status, version: p.version, updated: p.updatedAt.slice(0, 10) })),
      can_send: v.canSend,
      ...(v.proposals.length ? {} : { note: "No proposals yet. Start one with create_or_update_proposal." }),
    };
  }
  return proposalOut(ctx, await wrap(() => getProposal(ctx.member.token, a.proposal_id!, ctx.origin)));
}

/** The options and add-ons as Claude reads them back: each with its id, name and price in words. */
const pricingOut = (pr: Pricing) => ({
  options: pr.options.map((o) => ({ id: o.id, name: o.name, price: priced(o.price, o.billing), ...(o.note ? { note: o.note } : {}), ...(o.about ? { about: o.about } : {}), included: o.included, ...(o.recommended ? { recommended: true } : {}) })),
  add_ons: pr.addOns.map((a) => ({ id: a.id, name: a.name, price: priced(a.price, a.billing), ...(a.about ? { about: a.about } : {}) })),
  how_it_works: pr.options.length > 1 ? "The client picks one option and any add-ons on the proposal's page, sees the total and signs that choice." : "One price. The client can add any add-on before signing.",
});

export interface PricingArgs {
  options?: { id?: string; name: string; price: number; billing?: "month" | "once"; note?: string; about?: string; included?: string[]; recommended?: boolean }[];
  add_ons?: { id?: string; name: string; price: number; billing?: "month" | "once"; about?: string }[];
}
/** Claude's pricing as the proposal's (lib/proposals/pricing.ts cleans it): an option named as before keeps its id. */
function pricingFrom(raw: PricingArgs | null, cur: Pricing | null): { options: unknown[]; addOns: unknown[] } | null {
  if (raw === null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) throw new ToolProblem("pricing is { options: [{ name, price, billing?, included? }], add_ons?: [{ name, price, billing? }] }, or null for one price in the proposal's own words.");
  const idOf = (list: { id: string; name: string }[] | undefined, x: { id?: string; name?: string }) => x.id ?? list?.find((y) => y.name.toLowerCase() === String(x.name ?? "").trim().toLowerCase())?.id;
  return {
    options: (Array.isArray(raw.options) ? raw.options : []).map((o) => ({ ...o, id: idOf(cur?.options, o) })),
    addOns: (Array.isArray(raw.add_ons) ? raw.add_ons : []).map((a) => ({ ...a, id: idOf(cur?.addOns, a) })),
  };
}

export interface UpsertArgs {
  /** Up to 3 options and 6 add-ons for the client to pick from (Close), or null to go back to one price. */
  pricing?: PricingArgs | null;
  /** How long the signing link works once sent: 14, 30, 60 or 90 days, or 0 for no end date. */
  link_days?: number;
  /** The revision get_proposal returned: given and not the latest (the member edited it since), the change is refused, so nothing they wrote is undone. */
  revision?: number;
  proposal_id?: string;
  template_id?: string;
  company_id?: string;
  company_name?: string;
  title?: string;
  fields?: Record<string, string>;
  blocks?: { block_id: string; title?: string; body?: string }[];
  notes?: { key: string; text: string }[];
  signer?: { name: string; email: string; title?: string };
  signer_on_call?: boolean;
}

/** Claude's blocks as the proposal's: a library block's starter text where Claude sent no body. */
function blocksFrom(raw: UpsertArgs["blocks"], keep: ProposalBlock[] = []): ProposalBlock[] | undefined {
  if (!raw) return undefined;
  if (!Array.isArray(raw)) throw new ToolProblem("blocks is a list of { block_id, title?, body? } in the order they read.");
  return raw.map((b) => {
    const id = String(b?.block_id ?? "");
    const had = keep.find((k) => k.blockId === id);
    const base = had ?? makeBlock(blockDef(id) ? id : "custom");
    return { ...base, title: b.title?.trim() || base.title, body: typeof b.body === "string" && b.body.trim() ? b.body : base.body };
  });
}

export async function createOrUpdateProposal(ctx: Ctx, a: UpsertArgs): Promise<ToolOut> {
  const token = ctx.member.token;
  const notes = a.notes ? (Array.isArray(a.notes) ? a.notes : []).map((n) => ({ key: String(n?.key ?? "pains"), text: String(n?.text ?? ""), at: new Date().toISOString() })) : undefined;
  let p: ProposalRec;
  // The options to pick from and the link's length (Close): checked before anything is saved, so a bad one starts nothing.
  const extras = (cur: ProposalRec | null) => ({ ...(a.pricing !== undefined ? { pricing: pricingFrom(a.pricing, cur?.pricing ?? null) } : {}), ...(a.link_days !== undefined ? { linkDays: a.link_days } : {}) });
  if (a.link_days !== undefined) await wrap(async () => linkDaysOf(a.link_days));
  if (a.pricing) {
    try {
      cleanPricing(pricingFrom(a.pricing, null));
    } catch (e) {
      if (e instanceof PricingProblem) throw new ToolProblem(e.message);
      throw e;
    }
  }
  if (!a.proposal_id) {
    p = await wrap(() =>
      createProposal(token, { templateId: a.template_id ?? null, companyId: a.company_id, companyName: a.company_name, title: a.title, signer: a.signer, fields: a.fields, blocks: blocksFrom(a.blocks), notes, signerOnCall: a.signer_on_call, source: "claude" }, ctx.origin),
    );
    if (a.pricing !== undefined || a.link_days !== undefined) p = await wrap(() => updateProposal(token, p.id, extras(p), ctx.origin));
  } else {
    const cur = await wrap(() => getProposal(token, a.proposal_id!, ctx.origin));
    p = await wrap(() =>
      updateProposal(
        token,
        cur.id,
        {
          ...(a.title !== undefined ? { title: a.title } : {}),
          ...(a.blocks ? { blocks: blocksFrom(a.blocks, cur.blocks) } : {}),
          ...(a.fields ? { setFields: a.fields } : {}),
          ...(notes ? { notes: [...cur.notes, ...notes] } : {}),
          ...(a.signer ? { signer: a.signer } : {}),
          ...(a.signer_on_call !== undefined ? { signerOnCall: a.signer_on_call } : {}),
          ...(a.company_name !== undefined ? { companyName: a.company_name } : {}),
          ...(a.company_id ? { companyId: a.company_id } : {}),
          ...extras(cur),
          // The revision Claude read (else the one just read here): a change the member made since is never written over.
          rev: a.revision ?? cur.rev,
          source: "claude",
        },
        ctx.origin,
      ),
    );
  }
  const out = await proposalOut(ctx, p);
  return {
    saved: true,
    ...out,
    next: (out.blanks as string[]).length
      ? "Ask the member for what's still blank, or fill it from their call, then call this again with fields. When it's ready, send_proposal_for_signature (it asks first)."
      : "It's ready to send. Show the member the checklist and risk flags, then send_proposal_for_signature (it asks first).",
  };
}

const LINK_WORDS = (days: number) => (days === 0 ? "no end date" : `${days} days`);
const MY_SIGNATURE: Record<string, string> = {
  now: "The member's saved signature goes on it as it is sent. When the client signs, it is done.",
  after: "The client signs first. Then the member countersigns on Merlin, and only then is it finished and the pipeline moves to Won.",
  none: "No signature from the member: it says prepared and sent by them.",
};

export async function sendForSignature(
  ctx: Ctx,
  a: { proposal_id: string; signer_name?: string; signer_email?: string; signer_title?: string; message?: string; link_days?: number; my_signature?: "now" | "after" | "none"; confirm?: boolean },
): Promise<ToolOut> {
  const token = ctx.member.token;
  const p = await wrap(() => getProposal(token, String(a.proposal_id ?? ""), ctx.origin));
  const signer = a.signer_email || a.signer_name ? { name: a.signer_name ?? p.signer?.name ?? "", email: a.signer_email ?? p.signer?.email ?? "", ...(a.signer_title ? { title: a.signer_title } : p.signer?.title ? { title: p.signer.title } : {}) } : p.signer;
  const v = await wrap(() => listProposals(token, ctx.origin));
  const days = a.link_days === undefined ? p.linkDays : await wrap(async () => linkDaysOf(a.link_days));
  if (a.my_signature !== undefined && !["now", "after", "none"].includes(a.my_signature)) throw new ToolProblem('my_signature is "now", "after" or "none".');
  // Their own signature: as asked here, else as kept on the proposal; "now" needs a saved signature, so without one it is none.
  const mode = a.my_signature ?? (p.memberSign === "now" && !v.mySignature ? "none" : p.memberSign);
  if (!a.confirm) {
    const f = docFields({ ...p, signer });
    const blanks = blanksOf(p.blocks, f);
    const checks = checklist({ ...p, signer, fields: f });
    return {
      confirmed: false,
      would_send: {
        to: signer ?? "Nobody yet: send signer_name and signer_email",
        title: p.title,
        version: p.status === "draft" ? p.version : p.version + 1,
        link: days === 0 ? "No end date" : `Works for ${days} days`,
        ...(v.canSend ? { members_signature: MY_SIGNATURE[mode] } : {}),
        ...(p.pricing ? { the_client_picks_from: p.pricing.options.map((o) => `${o.name}, ${priced(o.price, o.billing)}`) } : {}),
      },
      can_send: v.canSend,
      ...(blanks.length ? { blanks, blanks_in_words: blanksInWords(blanks, 8) } : {}),
      missing_from_checklist: checks.filter((c) => !c.ok).map((c) => c.missing),
      risk_flags: riskFlags(p).map((r) => r.message),
      message: v.canSend
        ? blanks.length
          ? "It can't go out yet: fill the blanks first. Nothing was sent."
          : `Nothing was sent. The client gets an email with a signed link (${LINK_WORDS(days)}), confirms their email with a code, and signs on Merlin. No account needed.` + ` ${SENDER_DUTY}`
        : "Nothing was sent. Sending for signature is on Close.",
      next: "Show the member who it goes to and what's missing. Only if they say send, call again with the same arguments and confirm: true.",
    };
  }
  if (mode === "now" && !v.mySignature) throw new ToolProblem('The member has no saved signature on Merlin yet. They can save one on Merlin (Proposals, Send for signature), or pass my_signature "after" (they countersign once the client signed) or "none".');
  const r = await wrap(() => sendProposal(token, p.id, { signer: signer ?? undefined, message: a.message, linkDays: days, ...(v.canSend ? { memberSign: mode } : {}) }, ctx.origin));
  return { confirmed: true, message: r.message, proposal_id: p.id, version: r.proposal.version, status: r.proposal.status, document_sha256: r.proposal.send?.hash, link: days === 0 ? "No end date" : `Works for ${days} days` };
}

/* ---------- from a call, changes by talking, contracts ---------- */

/**
 * Reading a Granola note's transcript on Merlin's side (lib/granola, when the member connected
 * Granola in Integrations). Set where that connection lives; until then a note id is refused in
 * words and the transcript text is asked for instead.
 */
export type GranolaTranscript = (memberId: string, noteId: string) => Promise<{ transcript: string; attendees?: { name?: string; email?: string }[]; when?: string } | null>;
let granola: GranolaTranscript | null = null;
export const setGranolaTranscript = (fn: GranolaTranscript | null) => void (granola = fn);

/** A template by id, or by the name the member said ("my assessment template"). */
async function templateIdOf(ctx: Ctx, raw: string | undefined): Promise<string | null> {
  const t = raw?.trim() || null;
  if (!t || /^mt_/.test(t) || TEMPLATES.some((x) => x.id === t) || t === "blank") return t === "blank" ? null : t;
  const q = t.toLowerCase().replace(/\b(my|the|template)\b/g, "").replace(/\s+/g, " ").trim();
  const mine = templatesOf(await loadState(), ctx.member.id);
  const hit = mine.find((x) => x.title.toLowerCase().includes(q) || x.fileName.toLowerCase().includes(q)) ?? TEMPLATES.find((x) => x.title.toLowerCase().includes(q) || x.id.includes(q.replace(/\s+/g, "-")));
  if (!hit) {
    const v = await wrap(() => listProposals(ctx.member.token, ctx.origin));
    throw new ToolProblem(`No template called "${raw}". Theirs and ours: ${v.templates.map((x) => `${x.title} (${x.id})`).join("; ")}.`);
  }
  return hit.id;
}

export interface FromCallArgs {
  transcript?: string;
  granola_note_id?: string;
  template?: string;
  company_id?: string;
  company_name?: string;
  call_date?: string;
  signer?: { name: string; email?: string; title?: string };
}

/** A draft from a call: Merlin's own rules read it (no model), the lines found and what was agreed fill the template. */
export async function draftFromCall(ctx: Ctx, a: FromCallArgs): Promise<ToolOut> {
  let transcript = typeof a.transcript === "string" ? a.transcript : "";
  let callWith: { name?: string; email?: string } | undefined;
  if (!transcript.trim() && a.granola_note_id) {
    if (!granola) throw new ToolProblem("Merlin can't read Granola notes for this member yet. Read the call in Granola yourself and pass its text as transcript.");
    const got = await granola(ctx.member.id, String(a.granola_note_id));
    if (!got?.transcript?.trim()) throw new ToolProblem("That Granola note has no transcript Merlin can read. Pass the call's text as transcript instead.");
    transcript = got.transcript;
    callWith = got.attendees?.find((x) => x.email?.toLowerCase() !== ctx.member.email.toLowerCase() && x.name);
  }
  // Read here for this call only: never stored, never logged. Only the lines found are kept.
  transcript = transcript.replace(/\r\n?/g, "\n").slice(0, MAX_TRANSCRIPT);
  if (transcript.trim().length < 40) throw new ToolProblem("Pass the call's transcript (or the notes on what was agreed) as transcript, or a granola_note_id. A few words isn't enough to draft from.");
  const templateId = await templateIdOf(ctx, a.template);
  const ex = extract(transcript, ctx.member.name);
  const terms = readTerms(transcript);
  let fields: Record<string, string> = {};
  let notes: { key: string; text: string; at: string }[] = [];
  const per = new Map<string, number>();
  const at = new Date().toISOString();
  for (const s of ex.suggestions) {
    const target = TARGET[s.key];
    const k = target ?? s.key;
    if ((per.get(k) ?? 0) >= (target ? 3 : 2) || !s.buyer) continue;
    per.set(k, (per.get(k) ?? 0) + 1);
    const r = acceptInto(fields, notes, s.key, s.text, at);
    fields = r.fields;
    notes = r.notes;
  }
  fields = { ...fields, ...terms.fields };
  if (a.call_date) fields["discovery.callDate"] = String(a.call_date).slice(0, 40);
  const signer = a.signer?.name ? a.signer : callWith?.name ? { name: callWith.name, ...(callWith.email ? { email: callWith.email } : {}) } : null;
  if (signer?.name) fields["client.signerName"] = signer.name;
  if (signer?.title) fields["client.signerTitle"] = signer.title;
  const p = await wrap(() =>
    createProposal(
      ctx.member.token,
      { templateId, companyId: a.company_id, companyName: a.company_name, companySite: a.company_id ? null : siteFromCall(transcript, ctx.member, signer?.email), fields, notes, signerOnCall: ex.signerOnCall, ...(signer?.email ? { signer: { name: signer.name, email: signer.email, ...(signer.title ? { title: signer.title } : {}) } } : {}), source: "discovery" },
      ctx.origin,
    ),
  );
  const out = await proposalOut(ctx, p);
  const blanks = out.blanks as string[];
  const fromCall = Object.keys(p.fields).filter((k) => p.sources[k] === "discovery" && !k.startsWith("client.signer"));
  const fromMerlin = Object.keys(p.fields).filter((k) => p.sources[k] === "record" || p.sources[k] === "pipeline" || p.sources[k] === "profile");
  return {
    saved: true,
    ...out,
    blanks_to_settle: blanks.map((k) => ({ key: k, label: fieldLabel(k) })),
    things_to_check: [...terms.checks, ...(signer?.email ? [] : ["Who signs, with their email: the call didn't give it."])],
    sources: {
      the_call: fromCall.map((k) => ({ key: k, label: fieldLabel(k), value: p.fields[k] })),
      the_template: p.templateId ? `Section order and starting text from "${p.title.split(" for ")[0]}"` : "A blank page",
      merlin: fromMerlin.map((k) => ({ key: k, label: fieldLabel(k) })),
    },
    transcript_kept: false,
    next: "Show the member the draft and ask them to settle each blank (never guess one). Rewrite the sections in their voice from the call if they want (get_proposal_kit has the guidance), save with create_or_update_proposal or change_proposal, then send_proposal_for_signature (it asks first).",
  };
}

export interface ChangeArgs {
  proposal_id: string;
  instruction?: string;
  sections?: { section_id?: string; title?: string; body: string; summary?: string }[];
  fields?: Record<string, string>;
  apply?: boolean;
  member_agreed?: boolean;
}

const changeOut = (c: ChangeProposal) => ({
  changes: c.changes.map((x) => ({ section_id: x.id, title: x.title, summary: `${x.title} ${x.summary}`, body: x.body })),
  fields: c.fields,
  numbers_checked: c.check.line,
  numbers_ok: c.check.ok,
  ...(c.check.problems.length ? { problems: c.check.problems } : {}),
});

/** A change in plain words, or sections the client rewrote: shown, checked, and saved as a new version only with apply. */
export async function changeProposalTool(ctx: Ctx, a: ChangeArgs): Promise<ToolOut> {
  const token = ctx.member.token;
  const v = await wrap(() => listProposals(token, ctx.origin));
  if (!v.canBuild) throw new ToolProblem(`${CLOSE_BUILD} ${upgradeUrl((publicBase() ?? ctx.origin ?? "").replace(/\/$/, ""), "proposals")}`);
  const p = await wrap(() => getProposal(token, String(a.proposal_id ?? ""), ctx.origin));
  let c: ChangeProposal;
  if (a.sections?.length || (a.fields && Object.keys(a.fields).length)) {
    c = await wrap(() => checkChange(token, p.id, { changes: (a.sections ?? []).map((x) => ({ id: x.section_id ?? x.title, title: x.title, body: x.body, summary: x.summary })), fields: a.fields ?? {}, instruction: a.instruction }));
  } else {
    if (!a.instruction?.trim()) throw new ToolProblem("Send instruction (what to change, in plain words), or the rewritten sections.");
    if (!aiConfigured())
      return {
        changed: false,
        applied: false,
        message: `${CHANGE_OFF} So write the changed sections yourself.`,
        sections: p.blocks.map((b) => ({ section_id: b.id, title: b.title, body: b.body })),
        fields: p.fields,
        next: "Rewrite only the sections the instruction needs, in the member's voice, keeping {{keys}} and making totals, terms and dates agree. Call change_proposal again with sections (section_id, title, body, summary) and without apply to show the member the change and the numbers check; with apply: true once they say yes.",
      };
    try {
      c = await proposeChange(token, p.id, { instruction: a.instruction, agree: a.member_agreed === true });
    } catch (e) {
      if (e instanceof ProposalProblem && e.status === 428) return { changed: false, applied: false, message: CHANGE_CONSENT, next: "Ask the member if that's all right. If they say yes, call again with member_agreed: true." };
      throw e instanceof ProposalProblem ? new ToolProblem(e.upgrade ? `${e.message} ${e.upgrade}` : e.message) : e;
    }
    if (!c.changes.length && !Object.keys(c.fields).length) return { changed: false, applied: false, message: c.unclear ?? "Nothing to change for that." };
  }
  if (!c.changes.length && !Object.keys(c.fields).length) return { changed: false, applied: false, message: "The sections read the same as they do now: nothing to change." };
  if (a.apply !== true)
    return {
      changed: true,
      applied: false,
      ...changeOut(c),
      next: "Show the member each section's summary and the numbers check. Nothing is saved yet. Only if they say yes, call again with the same sections (the bodies above) and apply: true: it saves a new version and keeps the one before.",
    };
  const r = await wrap(() => acceptChange(token, p.id, { changes: c.changes, fields: c.fields, instruction: c.instruction }, ctx.origin));
  return {
    changed: true,
    applied: true,
    ...changeOut(c),
    version: r.saved.version,
    previous_version_kept: r.saved.previous,
    message: `Saved as version ${r.saved.version}. Version ${r.saved.previous} is kept: the member can compare or bring it back on Merlin.`,
    edit_on_merlin: `${ctx.origin.replace(/\/$/, "")}/?p=proposals&pr=${encodeURIComponent(p.id)}`,
  };
}

/** A contract uploaded in Merlin, sent to its signers. Asks first. */
export async function sendDocumentTool(ctx: Ctx, a: { document_id?: string; message?: string; confirm?: boolean }): Promise<ToolOut> {
  const token = ctx.member.token;
  const v = await wrap(() => listProposals(token, ctx.origin));
  if (!a.document_id) {
    const drafts = v.documents.filter((d) => d.status === "draft");
    return {
      documents: v.documents.map((d) => ({ document_id: d.id, title: d.title, status: d.status, signers: d.signers.map((x) => `${x.name}${x.sender ? " (the member)" : ""}`), fields: d.fields.length })),
      ...(drafts.length ? {} : { note: "No contract waiting to go out. The member uploads one in Merlin (Proposals, Send a contract to sign), and Merlin places the fields." }),
    };
  }
  const d = await wrap(() => getDocument(token, String(a.document_id), ctx.origin));
  if (!a.confirm) {
    const why = await notReadyOf(token, d.id);
    return {
      confirmed: false,
      would_send: { title: d.title, signers_in_order: d.signers.map((x, i) => ({ order: d.ordered ? i + 1 : "at once", name: x.name, email: x.email, ...(x.sender ? { the_member: true } : {}) })), fields: d.fields.length, ...(a.message ? { message: a.message } : {}) },
      can_send: v.canSend,
      ...(why ? { not_ready: why } : {}),
      message: !v.canSend ? "Nothing was sent. Sending for signature is on Close." : why ? `It can't go out yet: ${why} Nothing was sent.` : `Nothing was sent. Each signer gets an email with their own link in turn, confirms their email with a code and signs on Merlin. ${SENDER_DUTY.replace("this proposal", "this document")}`,
      next: "Show the member who signs, in what order. Only if they say send, call again with the same arguments and confirm: true.",
    };
  }
  const r = await wrap(() => sendDocument(token, d.id, { message: a.message }, ctx.origin));
  return { confirmed: true, message: r.message, document_id: d.id, status: r.document.status };
}

const fieldMap = z.record(z.string(), z.string());

/** The proposal tools, on the connector's server (lib/mcp/server.ts). */
export function registerProposalTools(server: McpServer, ctx: Ctx, run: Run): void {
  const READ = { readOnlyHint: true, openWorldHint: false } as const;
  const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
  server.registerTool(
    "get_proposal_kit",
    {
      title: "Get everything to draft a proposal",
      description:
        "START HERE when the member asks you to draft or write a proposal or SOW from a call (\"use my XYZ template in Merlin and draft a proposal for Acme from my call with Dana\"). One call returns everything to write it: the template's sections in order with guidance and examples (the member's own uploaded template with its text, or one of Merlin's that won), the patterns that win, the rate band for the company's size from Merlin's rate benchmarks, the company's facts the member can see, the member's name, title and writing voice, and the exact shape to save it in. Read the call itself from the member's meeting notes or transcript tool (Granola, Google Drive) or what they paste, write the whole proposal, then save it with create_or_update_proposal. template: an id or the name the member used. company_id from search_companies or find_company, or company_name. Building proposals is Close (the trial included): on another plan it refuses with the upgrade link, and the member's saved templates stay stored for when they upgrade.",
      inputSchema: {
        template: z.string().optional().describe("A template id from list_proposal_templates (theirs start mt_), or the name the member said. None: a blank page."),
        company_id: z.string().optional().describe("The company's id on Merlin."),
        company_name: z.string().optional().describe("The client's name, when it isn't on Merlin."),
      },
      annotations: { title: "Get everything to draft a proposal", ...READ },
    },
    (a) => run(ctx, () => getProposalKit(ctx, a)),
  );
  server.registerTool(
    "list_proposal_templates",
    {
      title: "Proposal templates",
      description:
        "Merlin's proposal builder: the member's own templates (past proposals they uploaded), Merlin's templates from proposals that won, every block with what good looks like, common mistakes, its {{field}} keys and starter text, the fields to pull from a discovery call with their cue phrases, and answers to common objections. To draft one proposal, get_proposal_kit gives all of it for the chosen template in one call. Use the member's own call to write it in their client's language, paraphrased, never pasted. Building proposals is Close (the trial included): on another plan it refuses with the upgrade link, and the member's saved templates stay stored for when they upgrade.",
      inputSchema: {},
      annotations: { title: "Proposal templates", ...READ },
    },
    () => run(ctx, () => listProposalTemplates(ctx)),
  );
  server.registerTool(
    "get_proposal",
    {
      title: "Get a proposal",
      description:
        "The member's own proposals. Without proposal_id: the list (id, title, company, status). With it: each block's text and how it reads with its fields filled, the blanks left, the checklist of what winning proposals do with what's missing, risk flags (the person who signs wasn't on the call, no budget signal, no dated next step, no price, above the band), what fractionals in their function were paid at this company's size and where their price sits, and the send's status. Only ever the member's own.",
      inputSchema: { proposal_id: z.string().optional().describe("From get_proposal's list or create_or_update_proposal.") },
      annotations: { title: "Get a proposal", ...READ },
    },
    (a) => run(ctx, () => getProposalTool(ctx, a)),
  );
  server.registerTool(
    "create_or_update_proposal",
    {
      title: "Create or update a proposal",
      description:
        "Save the proposal you drafted (usually from get_proposal_kit and the member's call) on Merlin, where the member edits it, and it is sent and signed. Without proposal_id it starts one: template_id from list_proposal_templates (or none for a blank page) and the company (company_id from search_companies, or company_name). fields fills the {{keys}} (\"goals.target\", \"pains\" with one item a line, \"pricing.monthlyFee\" like \"$12,000\"). blocks replaces the block list in order (block_id, and title and body when you write them; body may use {{keys}}). notes are lines from the call the member agreed to keep (key from the template's from_a_call list): paraphrase them, never paste the transcript, and never send the whole transcript. signer is the person who signs for the client: send it to them, not a go-between. pricing gives the client options to pick from instead of one price (1 to 3 options and up to 6 add-ons; they pick one on the proposal's page, see the total and sign that choice; send the whole set each time, null for one price again). link_days sets how long the signing link works once it is sent (14, 30, 60 or 90, or 0 for no end date). Saving after it was sent makes a new version and the old link stops working. Returns the proposal with its blanks, checklist and risk flags. Building proposals is Close (the trial included): on another plan it refuses with the upgrade link, and the member's saved templates stay stored for when they upgrade.",
      inputSchema: {
        proposal_id: z.string().optional(),
        revision: z.number().int().optional().describe("The revision get_proposal returned. When the member changed the proposal on Merlin since, the save is refused: read it again with get_proposal and apply your change to what's there."),
        template_id: z.string().optional().describe("A template id, for a new proposal: Merlin's, or one of the member's own (mt_...)."),
        company_id: z.string().optional().describe("The company's id on Merlin, for a new proposal."),
        company_name: z.string().optional().describe("The client's name when it isn't on Merlin."),
        title: z.string().optional(),
        fields: fieldMap.optional().describe("{{key}} values to set. An empty string clears one."),
        blocks: z.array(z.object({ block_id: z.string(), title: z.string().optional(), body: z.string().optional() })).optional(),
        notes: z.array(z.object({ key: z.string(), text: z.string() })).optional().describe("Lines from the call the member agreed to keep, paraphrased. Added to what's there."),
        signer: z.object({ name: z.string(), email: z.string(), title: z.string().optional() }).optional(),
        signer_on_call: z.boolean().optional().describe("Was the person who signs on the call."),
        pricing: z
          .object({
            options: z
              .array(
                z.object({
                  id: z.string().optional().describe("The option's id from get_proposal, to keep it when changing it."),
                  name: z.string(),
                  price: z.number().describe("In dollars, a number: 12000."),
                  billing: z.enum(["month", "once"]).optional().describe("A month (the default) or once."),
                  note: z.string().optional().describe("A short line under the price, like \"2 days a week\"."),
                  about: z.string().optional(),
                  included: z.array(z.string()).optional().describe("What this option includes, a line each."),
                  recommended: z.boolean().optional().describe("At most one option."),
                }),
              )
              .max(3),
            add_ons: z.array(z.object({ id: z.string().optional(), name: z.string(), price: z.number(), billing: z.enum(["month", "once"]).optional(), about: z.string().optional() })).max(6).optional(),
          })
          .nullable()
          .optional()
          .describe("Options for the client to pick from on the proposal's page (Close): 1 to 3 options, each named and priced, and up to 6 add-ons. They pick one, see the total and sign that choice. Send the whole set each time; null goes back to one price in the proposal's own words."),
        link_days: z.number().optional().describe("How long the signing link works once sent: 14, 30 (the default), 60 or 90 days, or 0 for no end date."),
      },
      annotations: { title: "Create or update a proposal", ...WRITE },
    },
    (a) => run(ctx, () => createOrUpdateProposal(ctx, a as UpsertArgs)),
  );
  server.registerTool(
    "send_proposal_for_signature",
    {
      title: "Send a proposal for signature",
      description:
        "Send a proposal to the client who signs, through Merlin's own e-signature: they get an email with a signed link (30 days unless link_days says 14, 60 or 90, or 0 for no end date; no account), confirm their email with a 6-digit code, agree to sign electronically, type their name and sign. Both sides get the signed copy with its audit trail, and the company's pipeline moves to Won once it is fully signed (with my_signature after, when the member has countersigned on Merlin). ALWAYS ASK THE MEMBER FIRST. Call it without confirm: it sends nothing and says who it would go to and what's missing. Only if the member says send, call again with the same arguments and confirm: true. Trial and Pro.",
      inputSchema: {
        proposal_id: z.string(),
        signer_name: z.string().optional(),
        signer_email: z.string().optional(),
        signer_title: z.string().optional(),
        message: z.string().optional().describe("A short note above the link in the email, in the member's words."),
        link_days: z.number().optional().describe("How long the link works: 14, 30, 60 or 90 days, or 0 for no end date. Without it, what the proposal has (30 unless set)."),
        my_signature: z.enum(["now", "after", "none"]).optional().describe("The member's own signature (Close): now (their saved signature goes on as it is sent), after (they countersign on Merlin once the client signed), or none."),
        confirm: z.boolean().optional(),
      },
      annotations: { title: "Send a proposal for signature", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (a) => run(ctx, () => sendForSignature(ctx, a)),
  );
  server.registerTool(
    "draft_proposal_from_call",
    {
      title: "Draft a proposal from a call",
      description:
        "Start a proposal from a call the member had. Pass the call's transcript as transcript (what you read from Granola, Zoom, Gong, their notes, or what they told you was agreed), or granola_note_id when Merlin can read their Granola notes itself. Merlin reads it with its own rules, never keeps it, and saves a draft in the member's template (template: an id or the name they used) for the company (company_id, or company_name): the lines from the call fill the template's fields, the fee, term, notice and days a week they agreed fill those, and anything the call didn't settle is left as a labelled blank, never guessed. Returns the draft with blanks_to_settle, things_to_check and where each part came from. Then rewrite the sections in the member's voice if they want (create_or_update_proposal or change_proposal), ask them to settle each blank, and send only through send_proposal_for_signature. Close (the trial included).",
      inputSchema: {
        transcript: z.string().optional().describe("The call's text, or notes on what was agreed. Used for this call only, never stored."),
        granola_note_id: z.string().optional().describe("A Granola note's id, when the member connected Granola to Merlin. Otherwise pass transcript."),
        template: z.string().optional().describe("A template id (theirs start mt_), or the name the member said. None: a blank page."),
        company_id: z.string().optional(),
        company_name: z.string().optional(),
        call_date: z.string().optional().describe('Like "November 18, 2026".'),
        signer: z.object({ name: z.string(), email: z.string().optional(), title: z.string().optional() }).optional().describe("Who signs for the client, when you know."),
      },
      annotations: { title: "Draft a proposal from a call", ...WRITE },
    },
    (a) => run(ctx, () => draftFromCall(ctx, a as FromCallArgs)),
  );
  server.registerTool(
    "change_proposal",
    {
      title: "Change a proposal",
      description:
        "Change one of the member's proposals the way they say it (\"make it two phases\", \"start date December 1, and add the board readout to Phase 1\"). Either send instruction alone (Merlin rewrites the sections that need it, when that is switched on for Merlin; otherwise it returns the sections for you to rewrite), or send the sections you rewrote yourself (section_id from get_proposal, title, body, summary). Merlin returns each changed section with a one-line summary and checks the numbers: totals, terms and dates agree across sections. Nothing is saved unless apply is true: then it is saved as a new version and the one before is kept, to compare or bring back. Show the member the changes first. Close (the trial included).",
      inputSchema: {
        proposal_id: z.string(),
        instruction: z.string().optional().describe("The change in the member's words."),
        sections: z.array(z.object({ section_id: z.string().optional(), title: z.string().optional(), body: z.string(), summary: z.string().optional() })).optional().describe("Sections you rewrote: only the ones that change. section_id \"new\" adds one."),
        fields: fieldMap.optional().describe("{{key}} values to set with the change."),
        apply: z.boolean().optional().describe("Save it as a new version. Only after the member says yes."),
        member_agreed: z.boolean().optional().describe("The member agreed that Merlin sends the proposal to Anthropic's API to make the change."),
      },
      annotations: { title: "Change a proposal", ...WRITE },
    },
    (a) => run(ctx, () => changeProposalTool(ctx, a as ChangeArgs)),
  );
  server.registerTool(
    "send_document_for_signature",
    {
      title: "Send a contract for signature",
      description:
        "Send a contract the member uploaded in Merlin (Proposals, Send a contract to sign; Merlin places its fields) to its signers, in order: each gets an email with their own link, confirms their email with a code and signs on Merlin. Without document_id: the member's contracts and their status. ALWAYS ASK THE MEMBER FIRST. Call it without confirm: it sends nothing and says who signs, in what order, and what's missing. Only if the member says send, call again with confirm: true. Close (the trial included).",
      inputSchema: {
        document_id: z.string().optional(),
        message: z.string().optional().describe("A short note in the email, in the member's words."),
        confirm: z.boolean().optional(),
      },
      annotations: { title: "Send a contract for signature", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (a) => run(ctx, () => sendDocumentTool(ctx, a)),
  );
}
