/**
 * Evidence Bank in the member's own assistant (lib/evidence): their case studies, how close each
 * is to a company, and saving one, which asks first like the proposal tools.
 *
 *   list_evidence        the member's cases: the client as its label unless they named it, the problem, what they
 *                        did, the numbers as they typed them, the type of work
 *   match_evidence       their ready cases ranked for one company (its id): Same, Close or Different, with what is
 *                        the same and what differs, in words. Never a percentage, never a credit
 *   save_evidence_case   a new case or a change: without confirm it saves nothing and shows how it would read
 *
 * Close only (the trial counts): on Free and Pro each says so with the upgrade link. Never a
 * client's name unless the member named it, never an internal id or the seat's company id, and
 * nothing of another member's.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadState } from "../table";
import { publicBase } from "../links";
import { upgradeUrl } from "../plan";
import { CLOSE_EVIDENCE, EvidenceProblem, caseIn, evidenceOpen, listEvidence, matchEvidence, previewCase, safeText, saveCase } from "../evidence/store";
import { whoOf } from "../evidence/draft";
import { CASE_MOTIONS, PROBLEMS, datesOf, type EvidenceCase } from "../evidence/types";
import { FIT_CATEGORIES } from "../evidence/tags";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

const wrap = async <T>(work: () => Promise<T>): Promise<T> => {
  try {
    return await work();
  } catch (e) {
    if (e instanceof EvidenceProblem) throw new ToolProblem(e.upgrade ? `${e.message} ${e.upgrade}` : e.message);
    throw e;
  }
};
const base = (ctx: Ctx) => (publicBase() ?? ctx.origin ?? "").replace(/\/$/, "");
const planOff = (ctx: Ctx): ToolOut => ({
  can_use: false,
  plan: `${CLOSE_EVIDENCE} ${upgradeUrl(base(ctx), "evidence")}`,
  next: "Tell the member Evidence Bank is on Close, and give them the link. Don't write a case for Merlin: it can't be saved on their plan.",
});

/** A case as the connector gives it: hidden-client-safe, no internal or company id. */
export function caseOut(c: EvidenceCase): ToolOut {
  const t = (x: string) => safeText(c, x);
  return {
    case_id: c.id,
    status: c.status === "ready" ? "Ready" : "Draft",
    title: t(c.title),
    client: whoOf(c),
    client_named: c.clientNamed && !!c.clientName,
    role: c.role || null,
    function: c.fn || null,
    dates: datesOf(c.start, c.end) || null,
    hours_a_week: c.hours || null,
    industry: c.industry || null,
    size: c.size || null,
    revenue: c.revenue || null,
    motion: c.motion || null,
    sold_to: t(c.soldTo) || null,
    problems: c.problems.map(t),
    type_of_work: [...c.workType],
    numbers: c.outcomes.map((o) => ({ what: t(o.k), before: o.before, after: o.after, ...(o.unit ? { unit: o.unit } : {}) })),
    worked_with: c.workedWith.map((w) => t(w.title)),
    answers: { problem: t(c.answers.problem), what_i_did: t(c.answers.did), numbers: t(c.answers.numbers) },
    text: t(c.text),
    on_my_card: c.showOnCard,
    used_in_proposals: c.usedIn.length,
  };
}

export async function listEvidenceTool(ctx: Ctx, a: { status?: "ready" | "draft" | "all" }): Promise<ToolOut> {
  const v = await wrap(() => listEvidence(ctx.member.token, { origin: ctx.origin }));
  if (!v.canUse) return { ...planOff(ctx), cases_kept: v.kept };
  const s = await loadState();
  const want = a.status ?? "all";
  const cases = v.cases
    .filter((c) => want === "all" || c.status === want)
    .map((c) => caseIn(s, ctx.member.id, c.id))
    .filter((c): c is EvidenceCase => !!c)
    .map(caseOut);
  return {
    can_use: true,
    cases,
    total: v.cases.length,
    limit: v.limit,
    about:
      "The member's own case studies, private to them. A client reads as its label (\"A health care company, $20M to $50M\") unless the member named it: never guess or add a client's name. Numbers are only the ones the member typed. Use a ready case as proof in a proposal; match_evidence says which fits a company.",
  };
}

export async function matchEvidenceTool(ctx: Ctx, a: { company_id: string }): Promise<ToolOut> {
  if (!a.company_id) throw new ToolProblem("Pass the company's id, from search_companies or get_company.");
  const v = await wrap(async () => {
    const s = await loadState();
    if (!evidenceOpen(s, ctx.member.id)) return null;
    return matchEvidence(ctx.member.token, { companyId: a.company_id }, { origin: ctx.origin });
  });
  if (!v) return planOff(ctx);
  if (!("cases" in v)) throw new ToolProblem("Pass one company's id.");
  return {
    can_use: true,
    company_id: a.company_id,
    ranked: v.cases.map((r) => ({ case_id: r.caseId, title: r.title, match: r.label, same: r.same, different: r.diff, closest: r.closest })),
    drafts_skipped: v.skipped,
    about: "Same, Close or Different, from the company's free facts (industry, size, revenue, how it sells) and its signals on file, in words. Never a percentage, and it costs no credit. A locked company stays locked: describe it by its facts, never guess its name.",
  };
}

interface SaveArgs {
  case_id?: string;
  title?: string;
  problem?: string;
  what_i_did?: string;
  numbers?: string;
  client_named?: boolean;
  client_name?: string;
  client_label?: string;
  role?: string;
  function?: string;
  start?: string;
  end?: string;
  industry?: string;
  size?: string;
  revenue?: string;
  motion?: string;
  sold_to?: string;
  problems?: string[];
  type_of_work?: string[];
  worked_with?: string[];
  ready?: boolean;
  confirm?: boolean;
}

export async function saveEvidenceTool(ctx: Ctx, a: SaveArgs): Promise<ToolOut> {
  const s = await loadState();
  if (!evidenceOpen(s, ctx.member.id)) return planOff(ctx);
  const answers = Object.fromEntries(
    (
      [
        ["problem", a.problem],
        ["did", a.what_i_did],
        ["numbers", a.numbers],
      ] as const
    ).filter(([, v]) => v !== undefined),
  );
  const input: Record<string, unknown> = {
    ...(a.case_id ? { id: a.case_id } : {}),
    ...(a.title !== undefined ? { title: a.title } : {}),
    ...(Object.keys(answers).length ? { answers } : {}),
    ...(a.client_named !== undefined ? { clientNamed: a.client_named } : {}),
    ...(a.client_name !== undefined ? { clientName: a.client_name } : {}),
    ...(a.client_label !== undefined ? { clientLabel: a.client_label } : {}),
    ...(a.role !== undefined ? { role: a.role } : {}),
    ...(a.function !== undefined ? { fn: a.function } : {}),
    ...(a.start !== undefined ? { start: a.start } : {}),
    ...(a.end !== undefined ? { end: a.end } : {}),
    ...(a.industry !== undefined ? { industry: a.industry } : {}),
    ...(a.size !== undefined ? { size: a.size } : {}),
    ...(a.revenue !== undefined ? { revenue: a.revenue } : {}),
    ...(a.motion !== undefined ? { motion: a.motion } : {}),
    ...(a.sold_to !== undefined ? { soldTo: a.sold_to } : {}),
    ...(a.problems !== undefined ? { problems: a.problems } : {}),
    ...(a.type_of_work !== undefined ? { workType: a.type_of_work } : {}),
    ...(a.worked_with !== undefined ? { workedWith: a.worked_with } : {}),
    ...(a.ready !== undefined ? { status: a.ready ? "ready" : "draft" } : {}),
  };
  if (!a.confirm) {
    const p = await wrap(() => previewCase(ctx.member.token, input, { origin: ctx.origin }));
    const out = caseOut(p.case);
    delete out.case_id;
    return {
      confirmed: false,
      message: `Nothing was saved. This is how the ${p.isNew ? "new case" : "case"} would read.`,
      would_save: out,
      next: "Show the member the case as it would read, the client as its label unless they asked to name it. Only if they say save, call again with the same arguments and confirm: true.",
    };
  }
  const v = await wrap(() => saveCase(ctx.member.token, input, { origin: ctx.origin }));
  const c = caseIn(await loadState(), ctx.member.id, v.id);
  return { confirmed: true, message: a.case_id ? "Saved the change." : "Saved the case in the member's Evidence Bank.", case: c ? caseOut(c) : { case_id: v.id } };
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function registerEvidenceTools(server: McpServer, ctx: Ctx, run: Run): void {
  server.registerTool(
    "list_evidence",
    {
      title: "My Evidence Bank",
      description:
        "The member's own case studies in Merlin's Evidence Bank: for each, the client (as its label, like \"A health care company, $20M to $50M\", unless the member named it), the role and dates, the problem, what they did, the before and after numbers exactly as they typed them, and the type of work. Private to the member. Never add or guess a client's name. Close (the trial included).",
      inputSchema: { status: z.enum(["ready", "draft", "all"]).optional().describe("Ready cases, drafts, or all (default).") },
      annotations: { title: "My Evidence Bank", ...READ },
    },
    (a) => run(ctx, () => listEvidenceTool(ctx, a)),
  );
  server.registerTool(
    "match_evidence",
    {
      title: "Match my evidence to a company",
      description:
        "The member's ready cases ranked for one company: Same, Close or Different, with what is the same and what differs, in words, from the company's free facts (industry, size, revenue, how it sells) and its signals on file (founder-led, why it hired before, an open role, a seat that ended). Never a percentage, and it costs no credit. Works on a locked company too, which stays locked. Use the closest case as proof in a proposal. Close (the trial included).",
      inputSchema: { company_id: z.string().describe("The company's id (from search_companies, list_open_roles or get_company).") },
      annotations: { title: "Match my evidence", ...READ },
    },
    (a) => run(ctx, () => matchEvidenceTool(ctx, a)),
  );
  server.registerTool(
    "save_evidence_case",
    {
      title: "Save a case to my Evidence Bank",
      description: `Save a new case study to the member's Evidence Bank, or change one (case_id from list_evidence), from what the member told you: the problem, what they did, and the numbers (before and after, only as they said them: never invent, round or estimate one). The client stays hidden by default and reads as its label; set client_named only when the member asks to name the client. ALWAYS ASK THE MEMBER FIRST. Call it without confirm: it saves nothing and shows how the case would read. Only if the member says save, call again with the same arguments and confirm: true. Close (the trial included).`,
      inputSchema: {
        case_id: z.string().optional().describe("A case to change, from list_evidence. Leave out for a new case."),
        title: z.string().optional().describe("A short plain title, without the client's name."),
        problem: z.string().optional().describe("What was broken or stuck when the member arrived, in their words."),
        what_i_did: z.string().optional().describe("What the member did, in their words."),
        numbers: z.string().optional().describe('Before and after, as the member said them: "Win rate went from 22% to 31%. Sales cycle went from 94 days to 61 days."'),
        client_named: z.boolean().optional().describe("Name the client wherever the case is used. Only when the member asks. False by default."),
        client_name: z.string().optional().describe("The client's name, only when the member gives it."),
        client_label: z.string().optional().describe('How the client reads while hidden, like "A health care company, $20M to $50M". Never the name.'),
        role: z.string().optional(),
        function: z.string().optional(),
        start: z.string().optional().describe("The start month, like 2024-02."),
        end: z.string().optional().describe("The end month, like 2024-12, or Ongoing."),
        industry: z.string().optional(),
        size: z.string().optional().describe("Employees: 1–10, 11–50, 51–200, 201–500, 501–1,000, 1,001+."),
        revenue: z.string().optional().describe("Pre-revenue, Under $1M, $1M–$5M, $5M–$20M, $20M–$50M, $50M+."),
        motion: z.string().optional().describe(`How the client sold: ${CASE_MOTIONS.join(", ")}.`),
        sold_to: z.string().optional().describe("Who the client sells to."),
        problems: z.array(z.string()).optional().describe(`What the client needed, any of: ${PROBLEMS.join(", ")}, or the member's own words.`),
        type_of_work: z.array(z.string()).optional().describe(`Type of work tags, filed under: ${FIT_CATEGORIES.join(", ")}, Finance, Technology. The member's own words work too.`),
        worked_with: z.array(z.string()).optional().describe("Titles only, never names: CEO, 4 account executives."),
        ready: z.boolean().optional().describe("Mark it ready (needs the problem and what the member did)."),
        confirm: z.boolean().optional(),
      },
      annotations: { title: "Save a case", ...WRITE },
    },
    (a) => run(ctx, () => saveEvidenceTool(ctx, a)),
  );
}
