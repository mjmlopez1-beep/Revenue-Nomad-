/**
 * Granola in Claude (lib/granola): list_granola_calls(company or email) gives the member's recent
 * calls from their own Granola, read with the key they connected on Merlin: when, how long, who was
 * on it and Granola's note id. Read only. Never a note's title, summary or transcript: drafting from
 * a call takes the note id (lib/granola granolaTranscript reads the transcript then, for that draft
 * alone). Only with RN_GRANOLA=1.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { GranolaProblem, callsFor, granolaOn, linkOf } from "../granola";
import { loadState } from "../table";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;

export async function listGranolaCalls(ctx: Ctx, a: { company_id?: string; email?: string }): Promise<ToolOut> {
  if (!granolaOn()) throw new ToolProblem("Granola isn't switched on for Merlin.");
  if (!linkOf(await loadState(), ctx.member.id))
    return { connected: false, calls: [], next: "The member hasn't connected Granola on Merlin. They can, in Integrations (a personal API key from Granola; it needs Granola's Business or Enterprise plan). Or they can paste the transcript." };
  if (!a.company_id && !a.email) throw new ToolProblem("Pass company_id (from search_companies or get_company) or the person's email.");
  try {
    const r = await callsFor(ctx.member, { companyId: a.company_id, email: a.email });
    return {
      connected: true,
      matched: r.by.kind === "company" ? `anyone at ${r.by.domain}` : r.by.kind === "email" ? r.by.email : "any recent call",
      days: r.days,
      calls: r.calls.map((c) => ({
        granola_note_id: c.noteId,
        when: c.when,
        minutes: c.minutes,
        with: c.with.map((p) => (p.name ? `${p.name} <${p.email}>` : p.email)),
        ...(c.more ? { and_others: c.more } : {}),
      })),
      next: r.calls.length
        ? "Ask the member which call to draft from. Drafting from a call is on Close; pass the granola_note_id to the drafting step on Merlin."
        : `No calls in the last ${r.days} days. Try the person's email, or ask the member to paste the transcript.`,
    };
  } catch (e) {
    if (e instanceof GranolaProblem) throw new ToolProblem(e.message);
    throw e;
  }
}

export function registerGranolaTools(server: McpServer, ctx: Ctx, run: Run): void {
  server.registerTool(
    "list_granola_calls",
    {
      title: "My recent Granola calls",
      description:
        "The member's calls from their own Granola in the last 30 days with anyone at a company (company_id, matched by the company's website domain) or with one person (email), newest first: when, length in minutes, who was on it and Granola's note id. Needs Granola connected on Merlin. Read only; costs nothing. It never returns a note's title, summary or transcript.",
      inputSchema: {
        company_id: z.string().optional().describe("The company's id, from search_companies or get_company. The company must be open for the member."),
        email: z.string().optional().describe("Or one person's email address."),
      },
      annotations: { title: "My recent Granola calls", readOnlyHint: true, openWorldHint: true },
    },
    (a) => run(ctx, () => listGranolaCalls(ctx, a)),
  );
}
