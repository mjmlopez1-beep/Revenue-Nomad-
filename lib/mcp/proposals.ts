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
import { BLOCKS, DISCOVERY_FIELDS, DISCOVERY_LABELS, FREE_TEMPLATE, OBJECTIONS, STARTER, TEMPLATES, blanksInWords, blanksOf, blockDef, checklist, makeBlock, rendered, riskFlags } from "../proposals/library";
import { adviceFromView } from "../proposals/rates";
import { KEY_FIELDS, proposalKit } from "../proposals/kit";
import { templatesOf } from "../proposals/mine";
import { loadState } from "../table";
import { ProposalProblem, createProposal, docFields, getProposal, listProposals, sendProposal, updateProposal } from "../proposals/store";
import type { ProposalBlock, ProposalRec } from "../proposals/types";
import { SENDER_DUTY } from "../proposals/types";
import { memberView } from "./view";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

const wrap = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (e) {
    if (e instanceof ProposalProblem) throw new ToolProblem(e.upgrade ? `${e.message} ${e.upgrade}` : e.message);
    throw e;
  }
};

export async function listProposalTemplates(ctx: Ctx): Promise<ToolOut> {
  const v = await wrap(() => listProposals(ctx.member.token, ctx.origin));
  const mine = templatesOf(await loadState(), ctx.member.id);
  return {
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
    plan: v.canSend ? "Every template is open, and sending for signature is on." : `On Free and Pro: the template ${FREE_TEMPLATE} or a blank page, built and previewed only. Every template and sending for signature are on Pro + Close.`,
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
    ...(p.company.id ? { company_id: p.company.id } : {}),
    template_id: p.templateId,
    status: p.status,
    version: p.version,
    signer: p.signer,
    signer_on_call: p.signerOnCall,
    blocks: p.blocks.map((b) => ({ block_id: b.blockId, title: b.title, body: b.body, reads: rendered([b], f)[0].text })),
    fields: p.fields,
    blanks: blanksOf(p.blocks, f),
    notes_from_calls: p.notes,
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
            expires_at: p.send.expiresAt,
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

export interface UpsertArgs {
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
  if (!a.proposal_id) {
    p = await wrap(() =>
      createProposal(token, { templateId: a.template_id ?? null, companyId: a.company_id, companyName: a.company_name, title: a.title, signer: a.signer, fields: a.fields, blocks: blocksFrom(a.blocks), notes, signerOnCall: a.signer_on_call, source: "claude" }, ctx.origin),
    );
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

export async function sendForSignature(ctx: Ctx, a: { proposal_id: string; signer_name?: string; signer_email?: string; signer_title?: string; message?: string; confirm?: boolean }): Promise<ToolOut> {
  const token = ctx.member.token;
  const p = await wrap(() => getProposal(token, String(a.proposal_id ?? ""), ctx.origin));
  const signer = a.signer_email || a.signer_name ? { name: a.signer_name ?? p.signer?.name ?? "", email: a.signer_email ?? p.signer?.email ?? "", ...(a.signer_title ? { title: a.signer_title } : p.signer?.title ? { title: p.signer.title } : {}) } : p.signer;
  const v = await wrap(() => listProposals(token, ctx.origin));
  if (!a.confirm) {
    const f = docFields({ ...p, signer });
    const blanks = blanksOf(p.blocks, f);
    const checks = checklist({ ...p, signer, fields: f });
    return {
      confirmed: false,
      would_send: { to: signer ?? "Nobody yet: send signer_name and signer_email", title: p.title, version: p.status === "draft" ? p.version : p.version + 1 },
      can_send: v.canSend,
      ...(blanks.length ? { blanks, blanks_in_words: blanksInWords(blanks, 8) } : {}),
      missing_from_checklist: checks.filter((c) => !c.ok).map((c) => c.missing),
      risk_flags: riskFlags(p).map((r) => r.message),
      message: v.canSend
        ? blanks.length
          ? "It can't go out yet: fill the blanks first. Nothing was sent."
          : "Nothing was sent. The client gets an email with a signed link (30 days), confirms their email with a code, and signs on Merlin. No account needed." + ` ${SENDER_DUTY}`
        : "Nothing was sent. Sending for signature is on Pro.",
      next: "Show the member who it goes to and what's missing. Only if they say send, call again with the same arguments and confirm: true.",
    };
  }
  const r = await wrap(() => sendProposal(token, p.id, { signer: signer ?? undefined, message: a.message }, ctx.origin));
  return { confirmed: true, message: r.message, proposal_id: p.id, version: r.proposal.version, status: r.proposal.status, document_sha256: r.proposal.send?.hash };
}

const fieldMap = z.record(z.string(), z.string());

/** The five tools, on the connector's server (lib/mcp/server.ts). */
export function registerProposalTools(server: McpServer, ctx: Ctx, run: Run): void {
  const READ = { readOnlyHint: true, openWorldHint: false } as const;
  const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;
  server.registerTool(
    "get_proposal_kit",
    {
      title: "Get everything to draft a proposal",
      description:
        "START HERE when the member asks you to draft or write a proposal or SOW from a call (\"use my XYZ template in Merlin and draft a proposal for Acme from my call with Dana\"). One call returns everything to write it: the template's sections in order with guidance and examples (the member's own uploaded template with its text, or one of Merlin's that won), the patterns that win, the rate band for the company's size from Merlin's rate benchmarks, the company's facts the member can see, the member's name, title and writing voice, and the exact shape to save it in. Read the call itself from the member's meeting notes or transcript tool (Granola, Google Drive) or what they paste, write the whole proposal, then save it with create_or_update_proposal. template: an id or the name the member used. company_id from search_companies or find_company, or company_name.",
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
        "Merlin's proposal builder: the member's own templates (past proposals they uploaded), Merlin's templates from proposals that won, every block with what good looks like, common mistakes, its {{field}} keys and starter text, the fields to pull from a discovery call with their cue phrases, and answers to common objections. To draft one proposal, get_proposal_kit gives all of it for the chosen template in one call. Use the member's own call to write it in their client's language, paraphrased, never pasted.",
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
        "Save the proposal you drafted (usually from get_proposal_kit and the member's call) on Merlin, where the member edits it, and it is sent and signed. Without proposal_id it starts one: template_id from list_proposal_templates (or none for a blank page) and the company (company_id from search_companies, or company_name). fields fills the {{keys}} (\"goals.target\", \"pains\" with one item a line, \"pricing.monthlyFee\" like \"$12,000\"). blocks replaces the block list in order (block_id, and title and body when you write them; body may use {{keys}}). notes are lines from the call the member agreed to keep (key from the template's from_a_call list): paraphrase them, never paste the transcript, and never send the whole transcript. signer is the person who signs for the client: send it to them, not a go-between. Saving after it was sent makes a new version and the old link stops working. Returns the proposal with its blanks, checklist and risk flags.",
      inputSchema: {
        proposal_id: z.string().optional(),
        template_id: z.string().optional().describe("A template id, for a new proposal: Merlin's, or one of the member's own (mt_...)."),
        company_id: z.string().optional().describe("The company's id on Merlin, for a new proposal."),
        company_name: z.string().optional().describe("The client's name when it isn't on Merlin."),
        title: z.string().optional(),
        fields: fieldMap.optional().describe("{{key}} values to set. An empty string clears one."),
        blocks: z.array(z.object({ block_id: z.string(), title: z.string().optional(), body: z.string().optional() })).optional(),
        notes: z.array(z.object({ key: z.string(), text: z.string() })).optional().describe("Lines from the call the member agreed to keep, paraphrased. Added to what's there."),
        signer: z.object({ name: z.string(), email: z.string(), title: z.string().optional() }).optional(),
        signer_on_call: z.boolean().optional().describe("Was the person who signs on the call."),
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
        "Send a proposal to the client who signs, through Merlin's own e-signature: they get an email with a signed link (30 days, no account), confirm their email with a 6-digit code, agree to sign electronically, type their name and sign. Both sides get the signed copy with its audit trail, and the company's pipeline moves. ALWAYS ASK THE MEMBER FIRST. Call it without confirm: it sends nothing and says who it would go to and what's missing. Only if the member says send, call again with the same arguments and confirm: true. Trial and Pro.",
      inputSchema: {
        proposal_id: z.string(),
        signer_name: z.string().optional(),
        signer_email: z.string().optional(),
        signer_title: z.string().optional(),
        message: z.string().optional().describe("A short note above the link in the email, in the member's words."),
        confirm: z.boolean().optional(),
      },
      annotations: { title: "Send a proposal for signature", readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    },
    (a) => run(ctx, () => sendForSignature(ctx, a)),
  );
}
