/**
 * Your way into a company in Claude (lib/paths/ways.ts): ways_in(company) gives the member's routes
 * there, best first, each with how warm it is in words (Warm intro, Good path or Long shot, never a
 * percentage or a time to a meeting: Merlin has no outcome data yet), the people in between and
 * its steps. Read only: it chooses nothing and sends nothing (the member goes with a route on Merlin).
 *
 * Naming, stricter than the app:
 *   - a locked company is never named, and its routes stay behind "open it first";
 *   - a person from the member's own Google network, LinkedIn import or contacts CSV is never named here: they
 *     are "someone you know" (the member sees who on Merlin);
 *   - everyone else is named only as the app names them (a member on Merlin, a seat holder or a
 *     person the member can see), which already keeps public-profile names to United States seats
 *     outside California.
 * With ways in on (RN_PATHS, on unless "off"), with or without Google: the sources are independent.
 */
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { loadSeed, loadState } from "../table";
import { companyInternalOf, routesOf, wayInOf } from "../paths/ways";
import { HOW_ESTIMATED, WAY_BANDS, betweenWords } from "../paths/rank";
import { ToolProblem, type Ctx, type ToolOut } from "./tools";

type Run = (ctx: Ctx, work: () => Promise<ToolOut>) => Promise<CallToolResult>;
const SOMEONE = "someone you know";

export async function waysIn(ctx: Ctx, a: { company_id?: string }): Promise<ToolOut> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const id = companyInternalOf(seed, s, String(a.company_id ?? ""));
  if (!id) throw new ToolProblem("That company isn't on Merlin. Pass company_id from search_companies or get_company.");
  const v = wayInOf(seed, s, ctx.member, id);
  if (v.locked)
    return {
      company: v.facts ? `a locked ${v.facts} company` : "a locked company",
      company_id: v.id,
      routes: [],
      next: "The member hasn't opened this company, so its routes stay closed. Opening it is the usual unlock (unlock, field identity): it asks first. Never guess its name.",
    };
  const built = routesOf(seed, s, ctx.member, id);
  const srcOf = new Map(built.map((b) => [b.view.id, b.srcs]));
  const out = v.routes.map((r, k) => {
    const srcs = srcOf.get(r.id) ?? [];
    // People from the member's own Google or LinkedIn are never named here.
    const named = r.nodes.slice(1).map((n, i) => {
      const src = srcs[i] ?? [];
      const own = (src.includes("google") || src.includes("linkedin") || src.includes("csv")) && !src.includes("merlin");
      return own ? SOMEONE : n.label;
    });
    const say = (text: string) => r.nodes.slice(1).reduce((t, n, i) => (named[i] === n.label ? t : t.split(n.label).join(SOMEONE).split(n.label.split(" ")[0]).join(SOMEONE)), text);
    return {
      route_id: r.id,
      ...(k === 0 ? { recommended: true } : {}),
      way_in: r.type,
      people_in_between: betweenWords(r.between),
      through: ["You", ...named].join(" → "),
      // Each link as Merlin may say it: a relationship band only where it derives one (mail and calendar, messages on
      // Merlin), else how the two are connected, in words. Never a band from a fixed weight (acceptance F1).
      links: r.links.map((l) => say(l.rel ? `${l.rel} relationship: ${l.words}` : l.words)),
      steps: r.steps.map((st) => say(st.title)),
    };
  });
  return {
    company: v.name,
    company_id: v.id,
    routes: out,
    ...(v.plan?.current ? { your_plan: { route_id: v.plan.route, step: `${Math.min(v.plan.step, v.plan.steps)} of ${v.plan.steps}`, done: v.plan.done } } : {}),
    how_merlin_estimates: HOW_ESTIMATED,
    how_to_use: `way_in is the route's type in words (Direct connection or Direct outreach when nobody is in between; else ${[...WAY_BANDS].reverse().join(", ")}: a Warm intro always has someone to introduce the member), Merlin's read, not a prediction: never turn it into a percentage or a time to a meeting. The member goes with a route on Merlin, in Your way into ${v.name}, where the people they know are named and the notes are drafted. Nothing is sent without them.`,
  };
}

export function registerWayTools(server: McpServer, ctx: Ctx, run: Run): void {
  server.registerTool(
    "ways_in",
    {
      title: "My ways into a company",
      description:
        "The member's routes into one company, best first: each with way_in, the route's type in words (Direct connection or Direct outreach with nobody in between; with someone in between Warm intro, Good path or Long shot, from how well each person knows the next, how many hand-offs it takes and whether the last person decides; a guide, never a percentage or a promise), the people in between, each link (a relationship band only where Merlin derives one from mail, calendar or messages on Merlin, else how the two are connected) and its steps. Merlin gives no time to a meeting. People the member knows from their own Google or LinkedIn are never named here. A locked company stays locked. Read only; costs nothing.",
      inputSchema: { company_id: z.string().describe("The company's id, from search_companies or get_company.") },
      annotations: { title: "My ways into a company", readOnlyHint: true, openWorldHint: false },
    },
    (a) => run(ctx, () => waysIn(ctx, a)),
  );
}
