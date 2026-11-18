/**
 * The Merlin MCP server: one per request (stateless Streamable HTTP), acting as one member.
 * Tool descriptions are written for the model: they say what the table holds and how to use it
 * well (warm paths, what "fractional friendly" means, and that every unlock asks first).
 *
 * Limits: 60 tool calls a minute and 2,000 a day per member (in memory, one server process).
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BUSY_MESSAGE, DOWN_MESSAGE, isBusy, isDown } from "../apiGuard";
import { limited } from "../rateLimit";
import { touch } from "../table";
import { BUSINESS_MODELS, ENGAGEMENT_TYPES, FUNCTIONS, HIRE_REASONS, PRICING_MODELS, RELATIONSHIPS, RN_DEAL_SIZES, RN_EMPLOYEES, RN_INDUSTRIES, RN_MOTIONS, RN_REVENUE, RN_SALES_CYCLES, SOURCED_VIA, STATUSES } from "../tableFields";
import { COUNTRIES_FIRST } from "../geo";
import * as T from "./tools";

export const PER_MINUTE = 60;
export const PER_DAY = 2000;

const list = (xs: readonly string[]) => xs.join(", ");
const fn = z.string().describe(`A function: ${list(FUNCTIONS)}`);
const many = (what: string, xs: readonly string[]) => z.array(z.string()).describe(`${what}, any of: ${list(xs)}`);
const company = z.string().describe("The company's id (from search_companies or list_open_roles). A visible company's exact name or domain also works.");

export const INSTRUCTIONS = `Merlin is a give-to-get table of companies that hire fractional leaders (sales, marketing, RevOps, customer success, finance, technology and more), run by Revenue Nomad for its members. It records which companies hired fractionals, for which seat, who held each seat, what it paid, who the decision makers are, and which fractional roles are open now. You act as the signed-in member.

How the table works
- Facts other members added are locked. Seeing one costs the member 1 credit ("locked, 1 credit to unlock"). Adding a missing fact earns 1 credit (up to 25 a day). Free facts are always visible: company basics, and a seat's function, type, status, start, why they hired, hours a week, and its end month while the seat is still going. Only a dated end on a seat that ended costs 1 credit.
- A company with an open role is a "Locked company" until the member unlocks it for 1 credit, which also opens the job posting of its open roles, with the posted rate and hours when the posting gave them. Before that only the role's title, function and listed date show, with the company's industry, size and HQ region. Each open role says whether a rate was posted ("No rate posted", or "on file"): never promise a rate that isn't there. At a company the member can see, an open role's posting, posted rate and hours are one purchase.
- At a locked company, its people and the fractionals who held its seats open only after the company. Unlock the company first, then them.
- Who held a seat and the role they held are one purchase: 1 credit opens both, whichever one you unlock. A seat with nobody named yet (seat_holder "Not on Merlin yet") has no one to unlock, and its role shows free or locked like any other fact.
- A person's name and title are one purchase: 1 credit opens both, whichever one you unlock. Their LinkedIn, email and phone open only after that, 1 credit each. A relationship (like Decision maker) is free.
- Each locked value says what its credit opens, and what has to come first. Pass that on as it is.
- Never spend a credit without asking. Call unlock without confirm first, tell the member what it costs and what it opens, and call it again with confirm true only after they say yes.

Using it well
- Fractional friendly means the company hired fractionals before (past seats on file). A repeat hirer has 2 or more fractional hires on file, or hires in 2 or more functions. Hiring now means it has an open fractional role.
- The warmest way into a company is the fractional who held a seat there (the seat holder) and the exec who hired or managed them (people marked Hiring for the seat, Reported to or Decision maker). get_company lists these as warm_paths.
- Fractionals in other functions who serve the same kind of clients are referral partners. Once the member has unlocked who held a seat, its warm path says the next step: Message them on Merlin (a member who is on Merlin), or Invite to connect with the invite_link and a suggested_note to send (someone who isn't on Merlin yet). When they claim their seat through that link, a conversation opens between them on Merlin, and a new member and the member who invited them both get invite credits.
- To find prospects for a member's function, look for companies that hired fractionals in other functions but not theirs yet (search_companies with no_function_yet), ranked by fit. A company that just hired a fractional VP Sales often needs marketing or RevOps next.
- A member's Ideal Fractional Profile (IFP) is the companies they want as clients: industries, company size, revenue and countries. my_account returns it. Use it to fill search_companies filters when they ask what fits them.
- To see what's new, use list_open_roles with since_days 7. Saved searches (alerts) put new matches in the weekly email.
- Each company and open role carries fit (Hiring now, Repeat hirer, Recent seat, Past seat, Posting closed, Full-time only, No seats) and fit_reason, one line saying why. Pass the reason on with the tier.
- Always pass ids from earlier results back in follow-up calls. Say "a locked company" rather than guessing a name, and never guess one from its industry, size or place.`;

function text(out: unknown, isError = false): CallToolResult {
  return { content: [{ type: "text", text: JSON.stringify(out) }], ...(isError ? { isError: true } : {}) };
}

/** Run one tool call: the member's limits first, then the tool, with problems told to the model in words. */
async function run(ctx: T.Ctx, work: () => Promise<T.ToolOut>): Promise<CallToolResult> {
  const id = ctx.member.id;
  if (limited(`mcp-day:${id}`, PER_DAY, 24 * 60 * 60 * 1000)) return text({ error: `That's ${PER_DAY} requests today, which is the daily limit. It resets within 24 hours.` }, true);
  if (limited(`mcp-min:${id}`, PER_MINUTE, 60_000)) return text({ error: `That's ${PER_MINUTE} requests in a minute, which is the limit. Wait a minute, then try again.` }, true);
  // A visit, as in the app (written at most once per 6 hours).
  void touch(ctx.member.token).catch(() => {});
  try {
    return text(await work());
  } catch (e) {
    if (e instanceof T.ToolProblem) return text({ error: e.message }, true);
    if (isBusy(e)) return text({ error: BUSY_MESSAGE }, true);
    if (isDown(e)) return text({ error: DOWN_MESSAGE }, true);
    console.error("connector tool failed", e);
    return text({ error: "Something went wrong on our side. Try again in a moment." }, true);
  }
}

const READ = { readOnlyHint: true, openWorldHint: false } as const;
const WRITE = { readOnlyHint: false, destructiveHint: false, openWorldHint: false } as const;

export function makeServer(ctx: T.Ctx): McpServer {
  const server = new McpServer({ name: "merlin", title: "Merlin", version: "1.0.0", websiteUrl: ctx.origin }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "search_companies",
    {
      title: "Search companies",
      description:
        "Find companies on Merlin, ranked like the table (best fit first: past fractional hires, functions hired, recent seats, open roles). Returns each company's id, free facts, fit, functions hired and how many facts are locked. Use it for prospecting: no_function_yet finds companies that hired fractionals in other functions but not this one yet, a common next hire. fractional_friendly keeps companies with past fractional hires or an open role. repeat_hirer keeps companies with 2 or more fractional hires, or hires in 2 or more functions. hiring_now keeps companies with an open fractional role (often locked). Recently hired, the table's sentence \"companies that hired a fractional Finance leader in the last 6 months\": hired_function (one function or a list) with hired_within_months (3, 6, 12 or 24; 0 or left out is any time). A hire is any seat on file that isn't full-time or an open role, and it counts when its start month is at most that many months before this month (a start with only a year counts as December of that year). With them the results come most recent hire first and each company carries recent_hire (function, start, and the role only when the member can see it; never who held the seat). For a VP Sales looking for companies that just hired a fractional Finance leader and have no Sales yet: hired_function Finance, hired_within_months 6, no_function_yet Sales. Follow up with get_company.",
      inputSchema: {
        query: z.string().optional().describe("Words to match in company names, domains, functions, industries and facts the member can see. Locked facts are not searchable."),
        function: fn.optional().describe(`Any seat in this function on file (hired, open or mentioned): ${list(FUNCTIONS)}`),
        function_hired: fn.optional().describe(`Companies that hired a fractional in this function: ${list(FUNCTIONS)}`),
        no_function_yet: fn.optional().describe(`Companies that hired fractionals in other functions and none in this one yet: ${list(FUNCTIONS)}`),
        hired_function: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(`Recently hired: companies with a fractional hire in this function, or in any of a list (with hired_within_months for how recent): ${list(FUNCTIONS)}`),
        hired_within_months: z
          .number()
          .optional()
          .describe("Recently hired: the hire's start month is at most this many months before this month (3, 6, 12 or 24). 0 or left out is any time. A start with only a year counts as December. Without hired_function, a hire in any function."),
        fractional_friendly: z.boolean().optional().describe("Only companies with past fractional hires or an open fractional role."),
        repeat_hirer: z.boolean().optional().describe("Only repeat hirers: 2 or more fractional hires on file, or hires in 2 or more functions. Open roles don't count as hires."),
        hiring_now: z.boolean().optional().describe("Only companies with an open fractional role now."),
        industry: many("Industries", RN_INDUSTRIES).optional(),
        employees: many("Employee counts", RN_EMPLOYEES).optional(),
        revenue: many("Yearly revenue bands", RN_REVENUE).optional(),
        hq: z.string().optional().describe('A place: "Texas", "Austin, TX", "United Kingdom". A country or a state alone matches every HQ in it, however it was typed.'),
        country: z.string().optional().describe(`A country: ${list(COUNTRIES_FIRST.slice(0, 12))} and more. "US", "USA" and "UK" work too.`),
        region: z.string().optional().describe('A US state or a region or province: "California", "TX", "Ontario", "England".'),
        business_model: z.string().optional().describe(list(BUSINESS_MODELS)),
        sales_motion: z.string().optional().describe(list(RN_MOTIONS)),
        deal_size: z.string().optional().describe(list(RN_DEAL_SIZES)),
        sales_cycle: z.string().optional().describe(list(RN_SALES_CYCLES)),
        following: z.boolean().optional().describe("Only companies the member follows."),
        unlocked: z.boolean().optional().describe("Only companies where the member unlocked something."),
        sort: z
          .enum(["fit", "newest", "name", "employees", "revenue", "recent_hire"])
          .optional()
          .describe("fit (default), newest, name, employees, revenue or recent_hire (the most recent fractional hire first; the default with hired_function or hired_within_months)."),
        limit: z.number().int().optional().describe("How many to return, 1 to 25 (default 10)."),
        offset: z.number().int().optional().describe("Skip this many, to page through (use next_offset)."),
      },
      annotations: { title: "Search companies", ...READ },
    },
    (a) => run(ctx, () => T.searchCompanies(ctx, a)),
  );

  server.registerTool(
    "get_company",
    {
      title: "Get a company",
      description:
        "Everything the member can see about one company: its facts, each seat (function, type, status, dates, who held it, rate, why they hired, open or closed), the people there with their relationship, warm_paths (the best ways in: the fractional who held a seat and the exec who hired them, and once a seat holder is unlocked, the next step with them: Message, or Invite to connect with the link), what is still locked and what each unlock costs, and what the member could add to earn credits. Locked values read \"locked, 1 credit to unlock\" or say what the credit opens with them (who held a seat comes with the role they held, a person's name with their title) and what comes first (a person's contact details open after their name, and at a locked company its people and seat holders open after the company). Use the ids here with unlock, add_person and follow_company.",
      inputSchema: { company },
      annotations: { title: "Get a company", ...READ },
    },
    (a) => run(ctx, () => T.getCompany(ctx, a)),
  );

  server.registerTool(
    "list_open_roles",
    {
      title: "List open roles",
      description:
        "Open fractional GTM roles from the weekly scan of job boards, newest first, with when each was first listed. Each shows its title, function and whether a rate was posted. Most sit at a locked company: the company's industry, size and region show (or say they are not on file yet), and 1 credit opens the company with the job posting of its open roles, and the posted rate and hours when the posting gave them. since_days 7 answers \"what's new this week\". Filter by function and by the company's industry, size, revenue, HQ, or past fractional hires.",
      inputSchema: {
        function: fn.optional(),
        since_days: z.number().int().optional().describe("Only roles first listed in the last N days (7 for this week)."),
        industry: many("Industries", RN_INDUSTRIES).optional(),
        employees: many("Employee counts", RN_EMPLOYEES).optional(),
        revenue: many("Yearly revenue bands", RN_REVENUE).optional(),
        hq: z.string().optional().describe("A place the company is based."),
        fractional_friendly: z.boolean().optional().describe("Only companies that hired fractionals before."),
        limit: z.number().int().optional().describe("How many to return, 1 to 40 (default 15)."),
      },
      annotations: { title: "List open roles", ...READ },
    },
    (a) => run(ctx, () => T.listOpenRoles(ctx, a)),
  );

  server.registerTool(
    "rate_benchmarks",
    {
      title: "Rate benchmarks",
      description:
        "What fractionals charge, by function and the client's revenue band at the time: the median and the middle half for monthly retainers (dollars a month) and hourly rates (dollars an hour), with how many people each figure counts. A group shows numbers only once enough people are in it. Free.",
      inputSchema: {
        function: fn.optional(),
        revenue: z.string().optional().describe(`Client revenue band: All, ${list(RN_REVENUE)}`),
      },
      annotations: { title: "Rate benchmarks", ...READ },
    },
    (a) => run(ctx, () => T.rateBenchmarks(ctx, a)),
  );

  server.registerTool(
    "my_account",
    {
      title: "My account",
      description:
        "The member's credits, their Ideal Fractional Profile (the industries, company sizes, revenue and countries of the companies they want as clients), what they earned today and the daily cap, unlocks left today, the seats they hold on file with what is still missing on each (adding those earns credits), the companies they follow, their saved searches and their invite link (+10 credits each when a fractional they invite adds a first fact). Check it before suggesting an unlock.",
      inputSchema: {},
      annotations: { title: "My account", ...READ },
    },
    () => run(ctx, () => T.myAccount(ctx)),
  );

  server.registerTool(
    "unlock",
    {
      title: "Unlock",
      description:
        'Spend credits to see locked facts. ALWAYS ASK THE MEMBER FIRST. Call it without confirm: it spends nothing and says what it would cost and open. Tell the member, and only if they say yes, call it again with the same arguments and confirm: true, which spends through the normal unlock and returns what is now visible. entity is "company", "seat" or "person". field is one field (for a seat: seat_holder, role, end, sourced, rate, posting, hours. For a person: name, title, email, phone, linkedin. For a locked company: identity, which opens its name and the job posting of its open roles, with the posted rate only when one was posted) or "everything" on a company, seat or person. Who held a seat and the role they held are one purchase, and so are a person\'s name and title: 1 credit opens both, whichever you ask for. A person\'s email, phone and LinkedIn open only after their name and title, and at a locked company its people and seat holders open only after the company: asked for too early, unlock says what to unlock first. Say what it opens from would_open, and mention a rate only when the role says one is on file.',
      inputSchema: {
        entity: z.enum(["company", "seat", "person"]),
        id: z.string().describe("The company, seat or person id."),
        field: z.string().describe('The field to unlock, or "everything".'),
        confirm: z.boolean().optional().describe("true only after the member said yes to the cost."),
      },
      annotations: { title: "Unlock", ...WRITE },
    },
    (a) => run(ctx, () => T.unlock(ctx, a)),
  );

  server.registerTool(
    "add_company_fact",
    {
      title: "Add a company fact",
      description:
        "Add a missing fact about a company that the member knows (earns 1 credit when the field was empty). Only add what the member told you or confirmed. get_company lists what is missing under you_can_add.",
      inputSchema: {
        company,
        field: z.string().describe("website, industry, employees, revenue, hq, linkedin, business_model, sales_motion, deal_size or sales_cycle"),
        value: z.string().describe(
          `The value. Pick lists: industry (${list(RN_INDUSTRIES)}), employees (${list(RN_EMPLOYEES)}), revenue (${list(RN_REVENUE)}), business_model (${list(BUSINESS_MODELS)}), sales_motion (${list(RN_MOTIONS)}), deal_size (${list(RN_DEAL_SIZES)}), sales_cycle (${list(RN_SALES_CYCLES)}).`,
        ),
      },
      annotations: { title: "Add a company fact", ...WRITE },
    },
    (a) => run(ctx, () => T.addCompanyFact(ctx, a)),
  );

  server.registerTool(
    "add_person",
    {
      title: "Add a person",
      description:
        "Add a person the member knows at a company, such as the exec who hired a fractional (earns credits for each new fact). A name is required. Tie them to a seat with seat_id when they hired for it or the fractional reported to them. Only add what the member told you.",
      inputSchema: {
        company,
        seat_id: z.string().optional(),
        name: z.string().describe("First and last name."),
        title: z.string().optional(),
        relationship: z.string().optional().describe(list(RELATIONSHIPS)),
        email: z.string().optional(),
        phone: z.string().optional(),
        linkedin: z.string().optional(),
      },
      annotations: { title: "Add a person", ...WRITE },
    },
    (a) => run(ctx, () => T.addPerson(ctx, a)),
  );

  server.registerTool(
    "add_my_seat",
    {
      title: "Add my seat",
      description:
        "Add a seat the member held themselves (a fractional engagement), or facts on one of their own seats already on file (seat_id from my_account). Members can only add their own seats: the seat holder is always the member. Each new fact earns 1 credit. Needs a function or a role. Use the client's real name as the member gives it, never an example or a placeholder, and for a company not on Merlin yet confirm its exact name and website with the member first. If they give a rate, ask who may see it and send rate_visibility. A seat Revenue Nomad found that nobody holds yet (claimable in get_company) becomes theirs with seat_id and claim: true, after they say it is theirs.",
      inputSchema: {
        company: z.string().optional().describe("The company's name (or id). Not needed with seat_id."),
        website: z.string().optional(),
        seat_id: z.string().optional().describe("One of the member's own seats, to add what is missing. Or, with claim, a seat nobody holds yet (marked claimable)."),
        claim: z.boolean().optional().describe("With seat_id: claim a seat Revenue Nomad found as the member's own. Their name goes on it, behind a 1 credit lock for others. Ask them first. Earns nothing by itself, 3 a day."),
        function: fn.optional(),
        role: z.string().optional().describe("The exact title, like Fractional VP Marketing."),
        type: z.string().optional().describe(list(ENGAGEMENT_TYPES)),
        status: z.string().optional().describe(list(STATUSES)),
        start: z.string().optional().describe("Year and month, like 2025-03."),
        end: z.string().optional().describe("Year and month, or Ongoing."),
        why_hired: z.string().optional().describe(list(HIRE_REASONS)),
        sourced: z.string().optional().describe(list(SOURCED_VIA)),
        pricing: z.string().optional().describe(list(PRICING_MODELS)),
        rate: z.string().optional().describe("Like $8k/mo or $150/hr."),
        rate_visibility: z.enum(["members", "benchmarks_only"]).optional().describe("members: members who unlock it see it. benchmarks_only: it only counts in the benchmarks, never shown with their name or the seat."),
        hours: z.union([z.string(), z.number()]).optional().describe("Hours a week."),
        revenue_then: z.string().optional().describe(`The client's revenue at the time: ${list(RN_REVENUE)}`),
        employees_then: z.string().optional().describe(`The client's employees at the time: ${list(RN_EMPLOYEES)}`),
      },
      annotations: { title: "Add my seat", ...WRITE },
    },
    (a) => run(ctx, () => T.addMySeat(ctx, a)),
  );

  server.registerTool(
    "follow_company",
    {
      title: "Follow a company",
      description: "Follow a company (or stop, with on: false) so it shows under Following in the app. Free.",
      inputSchema: { company, on: z.boolean().optional().describe("false to stop following.") },
      annotations: { title: "Follow a company", ...WRITE, idempotentHint: true },
    },
    (a) => run(ctx, () => T.followCompany(ctx, a)),
  );

  server.registerTool(
    "alerts",
    {
      title: "Saved searches",
      description:
        'Save, list or delete saved searches for new open roles, like "fractional Marketing roles at SaaS companies $5M to $20M". New matches go in the member\'s weekly email after each scan (once email is set up). action save takes the criteria and an optional name, list shows each with how many roles match now and this week, delete takes the id.',
      inputSchema: {
        action: z.enum(["save", "list", "delete"]),
        id: z.string().optional().describe("For delete."),
        name: z.string().optional(),
        function: fn.optional(),
        industry: many("Industries", RN_INDUSTRIES).optional(),
        employees: many("Employee counts", RN_EMPLOYEES).optional(),
        revenue: many("Yearly revenue bands", RN_REVENUE).optional(),
        hq: z.string().optional(),
        fractional_friendly: z.boolean().optional().describe("Only companies that hired fractionals before."),
      },
      annotations: { title: "Saved searches", ...WRITE },
    },
    (a) => run(ctx, () => T.alerts(ctx, a)),
  );

  return server;
}
