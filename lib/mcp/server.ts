/**
 * The Merlin MCP server: one per request (stateless Streamable HTTP), acting as one member.
 * Tool descriptions are written for the model: they say what the table holds and how to use it
 * well (warm paths, what "fractional friendly" means, and that every unlock asks first).
 *
 * Limits: 60 tool calls a minute and 2,000 a day per member (in memory, one server process). On
 * Free while billing is live, 20 a day (lib/billing/rules.ts FREE_MCP_PER_DAY), counted the same way.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { BUSY_MESSAGE, DOWN_MESSAGE, isBusy, isDown } from "../apiGuard";
import { limited } from "../rateLimit";
import { billingVisit, claudePerDay, touch } from "../table";
import { upgradeUrl } from "../plan";
import { BUSINESS_MODELS, OWNERSHIP_TYPES, WHY_NOW, END_REASONS, ENGAGEMENT_TYPES, FUNCTIONS, HIRE_REASONS, PRICING_MODELS, RELATIONSHIPS, RN_DEAL_SIZES, RN_EMPLOYEES, RN_INDUSTRIES, RN_MOTIONS, RN_REVENUE, RN_SALES_CYCLES, SOURCED_VIA, STATUSES } from "../tableFields";
import { COUNTRIES_FIRST } from "../geo";
import * as T from "./tools";
import { networkOn } from "../google/types"; // [google network]
import { VOICE_EXCLAMATIONS, VOICE_FORMALITY, VOICE_GREETINGS, VOICE_LENGTHS, VOICE_NAMES, VOICE_OPENERS, VOICE_PHRASES_MAX, VOICE_PHRASE_CHARS, VOICE_SIGNOFFS } from "../voice";

export const PER_MINUTE = 60;
export const PER_DAY = 2000;

const list = (xs: readonly string[]) => xs.join(", ");
const fn = z.string().describe(`A function: ${list(FUNCTIONS)}`);
const many = (what: string, xs: readonly string[]) => z.array(z.string()).describe(`${what}, any of: ${list(xs)}`);
const company = z.string().describe("The company's id (from search_companies or list_open_roles). The exact name or domain works too for a company the member has unlocked.");

export const INSTRUCTIONS = `Merlin is a data exchange for fractional operators, run by Revenue Nomad for its members. Members share what they know about fractional work to earn credits, and spend credits to see which companies hire fractionals (sales, marketing, RevOps, customer success, finance, technology and more), for which seat, who held each seat, what it paid, who the decision makers are, and which fractional roles are open now. You act as the signed-in member.

How the exchange works
- Facts other members added are locked. Seeing one costs the member 1 credit ("locked, 1 credit to unlock"). Adding a missing fact earns 1 credit (up to 25 a day). Free facts are always visible: a company's industry, size, revenue and HQ region, and a seat's function, type, status, start, why they hired, hours a week, and its end month while the seat is still going. Only a dated end on a seat that ended costs 1 credit.
- Every company is a "Locked company" (known by its id) until the member unlocks it for 2 credits (on Trial and Pro the first company each UTC day is free, and any company in the member's Crystal Ball opens free: unlock quotes 0 for it. On the Free plan neither: Free opens one Crystal Ball company a day in full, in the Merlin app only. my_account says which applies), which opens its name, website, logo and LinkedIn and the job posting of its open roles, with the posted rate and hours when the posting gave them. A company the member added to, held a seat at, or paid for anything at is already theirs. Before that its industry, size, revenue, HQ region, which functions it hired fractionals for and when, and its open roles' titles, functions and listed dates show. Describe a locked company by those facts and its id, never guess its name. Each open role says whether a rate was posted ("No rate posted", or "on file"): never promise a rate that isn't there. At a company the member can see, an open role's posting, posted rate and hours are one purchase.
- At a locked company, its people and the fractionals who held its seats open only after the company. Unlock the company first, then them.
- When the member names a company in full or gives its website, find_company finds it even while it is locked, named for that answer only (free, up to 25 new companies a day). It stays locked in the lists: unlocking it keeps it named. Never use find_company to guess at names: a part of a name finds nothing.
- Who held a seat and the role they held are one purchase: 1 credit opens both, whichever one you unlock. A seat with nobody named yet (seat_holder "Nobody named yet") has no one to unlock, and its role shows free or locked like any other fact.
- A person's name and title are one purchase: 1 credit opens both, whichever one you unlock. Their LinkedIn, email and phone open only after that, 1 credit each. A relationship (like Decision maker) is free.
- Each locked value says what its credit opens, and what has to come first. Pass that on as it is.
- Never spend a credit without asking. Call unlock without confirm first, tell the member what it costs and what it opens, and call it again with confirm true only after they say yes.

Using it well
- Fractional friendly means the company hired fractionals before (past seats on file). A repeat hirer has 2 or more fractional hires on file, or hires in 2 or more functions. Hiring now means it has an open fractional role.
- The warmest way into a company is the fractional who held a seat there (the seat holder) and the exec who hired or managed them (people marked Hiring for the seat, Reported to or Decision maker). get_company lists these as warm_paths.
- Fractionals in other functions who serve the same kind of clients are referral partners. Once the member has unlocked who held a seat, its warm path says the next step: Message them on Merlin (a member who is on Merlin), or Invite to connect with the invite_link and a suggested_note to send (someone who isn't on Merlin yet). When they claim their seat through that link, a conversation opens between them on Merlin, and a new member and the member who invited them both get invite credits.
- To find prospects for a member's function, look for companies that hired fractionals in other functions but not theirs yet (search_companies with no_function_yet), ranked by fit. A company that just hired a fractional VP Sales often needs marketing or RevOps next.
- A company may carry who_leads: who leads each function there, read from the company's own website ("Sales: full-time CRO since Nov 2024"), roles only, never names. A full-time leader in the member's function means no opening there for now (no_function_yet lists those last, with a note); a fractional or interim leader means the company hires fractionals in that function. "Members say: full-time CRO" is members' word. No fractional seat on Merlin is not the same as nobody leading the function: never tell the member a company has no Sales leader unless no_function_yet_note says their team page was checked ("No Sales leader on their team page (checked Nov 2026)").
- A member's Ideal Fractional Profile (IFP) is the companies they want as clients: industries, company size, revenue and countries. my_account returns it. Use it to fill search_companies filters when they ask what fits them.
- To see what's new, use list_open_roles with since_days 7. Saved searches (alerts) put new matches in the weekly email.
- todays_moves gives the member's moves for today, as Merlin's Home shows them: for each company why now, the best way in, the one move, and the facts a note may use. Draft a note from those facts only, in the member's voice when my_voice has one, and hand it to the member to send themselves. Merlin never sends a note for a member, and never reads their email.
- A member's writing voice is style conclusions only (greeting, sign-off, length, tone, a few stock phrases), never message text. To learn it, read the member's own sent mail on your side only when they ask, summarise it into save_my_voice's fields, show them the summary, and save it once they agree. Never send Merlin message text, subjects, names or addresses from their mail.
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
  // Free, while billing is live: FREE_MCP_PER_DAY requests a day (lib/billing). Pro keeps the limits above.
  const cap = await claudePerDay(id).catch(() => null);
  if (cap !== null && limited(`mcp-free:${id}`, cap, 24 * 60 * 60 * 1000))
    return text({ error: `That's ${cap} requests today, the most on Merlin's Free plan. It resets within 24 hours. Pro has no daily cap: ${upgradeUrl(ctx.origin, "claude")}` }, true);
  // A visit, as in the app (written at most once per 6 hours).
  void touch(ctx.member.token).catch(() => {});
  void billingVisit(ctx.member.token, ctx.origin).catch(() => {});
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
        "Find companies on Merlin, ranked like the table (best fit first: past fractional hires, functions hired, recent seats, open roles). Returns each company's id, free facts, fit, functions hired and how many facts are locked. Use it for prospecting: no_function_yet finds companies that hired fractionals in other functions but not this one yet, a common next hire. fractional_friendly keeps companies with past fractional hires or an open role. repeat_hirer keeps companies with 2 or more fractional hires, or hires in 2 or more functions. hiring_now keeps companies with an open fractional role (often locked). Recently hired, the table's sentence \"companies that hired a fractional Finance leader in the last 6 months\": hired_function (one function or a list) with hired_within_months (3, 6, 12 or 24; 0 or left out is any time). A hire is a fractional leader's seat on file: C-level, VP, Head, Director, Lead, or a title that shows no level. A seat whose title reads below Lead (a Finance Manager, a Content Engineer) doesn't count, and neither does a full-time seat or an open role. A hire counts when its start month is at most that many months before this month (a start with only a year counts as December of that year). With them the results come most recent hire first and each company carries recent_hire (function, start, and the role only when the member can see it; never who held the seat). For a VP Sales looking for companies that just hired a fractional Finance leader and have no Sales yet: hired_function Finance, hired_within_months 6, no_function_yet Sales. Follow up with get_company.",
      inputSchema: {
        query: z.string().optional().describe("Words to match in company names, domains, functions, industries and facts the member can see. Locked facts are not searchable."),
        function: fn.optional().describe(`Any seat in this function on file (hired, open or mentioned): ${list(FUNCTIONS)}`),
        function_hired: fn.optional().describe(`Companies that hired a fractional in this function: ${list(FUNCTIONS)}`),
        no_function_yet: fn.optional().describe(`Companies that hired fractionals in other functions and none in this one yet: ${list(FUNCTIONS)}`),
        hired_function: z
          .union([z.string(), z.array(z.string())])
          .optional()
          .describe(`Recently hired: companies with a fractional leader's hire in this function (a title below Lead, like a Finance Manager, doesn't count), or in any of a list (with hired_within_months for how recent): ${list(FUNCTIONS)}`),
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
    "find_company",
    {
      title: "Find a company by its exact name",
      description:
        "A company by its exact full name or its website (acme.com), even one that is locked for the member: it comes back named, with its website, LinkedIn, About and free facts, for this answer only. Its lists and get_company keep it locked. Unlocking the company (2 credits) keeps it named; adding a fact or a seat there makes it the member's. Job postings, who held each seat and contact details cost what they cost at any company the member can see. A part of a name finds nothing. Up to 25 new companies a day (100 on Pro), and 50 lookups that match nothing.",
      inputSchema: { name: z.string().describe("The company's exact full name (legal suffixes like Inc. and a leading The don't matter) or its website.") },
      annotations: { title: "Find a company by its exact name", readOnlyHint: false, destructiveHint: false, openWorldHint: false },
    },
    (a) => run(ctx, () => T.findCompanyByName(ctx, a)),
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
        "Open fractional GTM roles from the weekly scan of job boards, newest first, with when each was first listed. Each shows its title, function and whether a rate was posted. Most sit at a locked company: the company's industry, size and region show (or say they are not on file yet), and 2 credits open the company with the job posting of its open roles, and the posted rate and hours when the posting gave them. since_days 7 answers \"what's new this week\". Filter by function and by the company's industry, size, revenue, HQ, or past fractional hires.",
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
        'Spend credits to see locked facts. ALWAYS ASK THE MEMBER FIRST. Call it without confirm: it spends nothing and says what it would cost and open. Tell the member, and only if they say yes, call it again with the same arguments and confirm: true, which spends through the normal unlock and returns what is now visible. entity is "company", "seat" or "person". field is one field (for a seat: seat_holder, role, end, sourced, rate, posting, hours. For a person: name, title, email, phone, linkedin. For a locked company: identity, 2 credits, which opens its name, website and logo and the job posting of its open roles, with the posted rate only when one was posted) or "everything" on a company, seat or person. Who held a seat and the role they held are one purchase, and so are a person\'s name and title: 1 credit opens both, whichever you ask for. A person\'s email, phone and LinkedIn open only after their name and title, and at a locked company its people and seat holders open only after the company: asked for too early, unlock says what to unlock first. Say what it opens from would_open, and mention a rate only when the role says one is on file.',
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
        field: z.string().describe("website, industry, employees, revenue, hq, linkedin, business_model, sales_motion, deal_size, sales_cycle or ownership"),
        value: z.string().describe(
          `The value. Pick lists: industry (${list(RN_INDUSTRIES)}), employees (${list(RN_EMPLOYEES)}), revenue (${list(RN_REVENUE)}), business_model (${list(BUSINESS_MODELS)}), sales_motion (${list(RN_MOTIONS)}), deal_size (${list(RN_DEAL_SIZES)}), sales_cycle (${list(RN_SALES_CYCLES)}), ownership (${list(OWNERSHIP_TYPES)}).`,
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
        "Add a seat the member held themselves (a fractional engagement), or facts on one of their own seats already on file (seat_id from my_account). Members can only add their own seats: the seat holder is always the member. Each new fact earns 1 credit. At a company new to Merlin those credits wait until another member confirms a fact on the seat or an admin does (the answer says +N when confirmed). Needs a function or a role. Use the client's real name as the member gives it, never an example or a placeholder, and for a company not on Merlin yet confirm its exact name and website with the member first. If they give a rate, ask who may see it and send rate_visibility. A seat Revenue Nomad found that nobody holds yet (claimable in get_company) becomes theirs with seat_id and claim: true, after they say it is theirs.",
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
        why_now: z.union([z.string(), z.array(z.string())]).optional().describe(`What made the client move when it did, one or more: ${list(WHY_NOW)}`),
        end_reason: z.string().optional().describe(`Once the seat ended, why: ${list(END_REASONS)}`),
        introduced_by: z.string().optional().describe("Who introduced the member to this client. Private: only the member sees it, Merlin only counts it, and no tool returns it."),
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

  // [google network] Only with RN_GOOGLE=1 (lib/google). The member's own network, never anyone else's.
  if (networkOn()) {
    server.registerTool(
      "save_my_network",
      {
        title: "Save my network",
        description:
          "Save who the member already knows at companies, from what you found in their own Gmail (or another inbox you can read for them), so Merlin can show them where they have a way in. Only when the member asks you to. Send conclusions only, never email text: for each company the website domain (best) or its exact name, and for a person their name and title, about how many emails went back and forth, the last (and first) contact date, whether replies go both ways, and the relationship. NEVER send subjects, bodies, snippets, quotes or any other field: an entry with anything else is refused and nothing is saved. Skip newsletters, notifications, automated senders and personal addresses (gmail.com and the like). Up to 200 entries a call, 5 calls a day. It is private to the member: other members and admins never see it, it earns and costs no credits, and the member can delete it on Merlin. A company they know someone at is named for them free. Returns counts (matched, not_on_merlin, skipped) and the top warm matches to tell the member.",
        inputSchema: {
          entries: z
            .array(
              z.looseObject({
                company: z.string().describe("The company's website domain (acme.com), or its exact name."),
                person_name: z.string().optional().describe("Their name, as in the From line."),
                person_title: z.string().optional().describe("Their job title, from a signature, if one is clear."),
                emails: z.number().optional().describe("About how many emails were exchanged with them."),
                last_contact: z.string().optional().describe("YYYY-MM-DD (or YYYY-MM) of the last email."),
                first_contact: z.string().optional().describe("YYYY-MM-DD (or YYYY-MM) of the first email."),
                both_ways: z.boolean().optional().describe("true when both sides wrote, not only one."),
                relationship: z.enum(["client", "former client", "referral partner", "prospect", "peer", "other"]).optional(),
              }),
            )
            .describe("Up to 200 entries, warmest first. Only the fields listed: anything else refuses the call."),
        },
        annotations: { title: "Save my network", ...WRITE },
      },
      (a) => run(ctx, () => T.saveMyNetwork(ctx, a)),
    );

    server.registerTool(
      "my_network",
      {
        title: "My network",
        description:
          "The member's own network on Merlin: the companies they know someone at (from their Google Calendar and Contacts, Gmail for test members, and what they saved through save_my_network), warmest first, with warmth (Hot, Warm, Fading, Cold), the last contact, how many people and where it came from. Only ever the member's own. It doesn't list the people's names or emails: those stay on Merlin's Your network page.",
        inputSchema: {},
        annotations: { title: "My network", ...READ },
      },
      () => run(ctx, () => T.myNetwork(ctx)),
    );
  }

  // Today's moves, and the voice their notes are written in (lib/moves.ts, lib/voice.ts). Each member's own.
  server.registerTool(
    "todays_moves",
    {
      title: "Today's moves",
      description:
        "The member's moves for today, exactly as Merlin's Home shows them: up to three companies from their Crystal Ball, best first, each with why now, how likely (or Hiring now), the best way in on file (someone the member already knows there from their own network, the fractional who held a seat, an open role, or nothing yet), the one move to make, and for a move with a note the facts that note may use plus Merlin's own draft. You can draft each note in the member's voice (my_voice) from those facts only: never add a fact that isn't there, never a rate, and never guess a locked company's or a locked seat holder's name. The member sends every note themselves; Merlin never sends for them. The address of someone they know stays on Merlin. Done and Snooze are the member's to press on Merlin.",
      inputSchema: {},
      annotations: { title: "Today's moves", ...READ },
    },
    () => run(ctx, () => T.todaysMoves(ctx)),
  );

  server.registerTool(
    "save_my_voice",
    {
      title: "Save my writing voice",
      description:
        "Save how the member writes short notes, so Merlin drafts their moves' notes in their voice. Only when the member asks. You read a sample of the member's OWN SENT mail on your side (a few dozen short messages they wrote), work out the style, and send CONCLUSIONS ONLY: one value for each field below and up to 5 short stock phrases of their own. NEVER paste message text, subjects, quotes, names, email addresses, links or numbers: a call with any other field, or a phrase that reads like mail, is refused and nothing is saved. Call it first without member_agreed: it saves nothing and returns the summary. Show the member that summary and ask if it's right, then call again with the same values and member_agreed: true. It is private to the member (other members and admins never see it), costs and earns no credits, and they can edit or remove it in Your profile on Merlin. Merlin itself never reads their email.",
      inputSchema: {
        greeting: z.string().describe(`How they open a note, one of: ${VOICE_GREETINGS.join(" | ")}. \"{first}\" stands for the reader's first name; send it literally.`),
        signoff: z.string().describe(`How they close before their name, one of: ${VOICE_SIGNOFFS.join(" | ")}`),
        name: z.string().describe(`The name under the sign-off, one of: ${VOICE_NAMES.join(" | ")} (their first name, their full name, or none).`),
        length: z.string().describe(`One of: ${VOICE_LENGTHS.join(" | ")}. short is about three sentences, medium about five.`),
        formality: z.string().describe(`One of: ${VOICE_FORMALITY.join(" | ")}`),
        contractions: z.boolean().describe("true when they write I'd and it's, false when they write I would and it is."),
        exclamations: z.string().describe(`One of: ${VOICE_EXCLAMATIONS.join(" | ")}`),
        emoji: z.boolean().describe("true when they use emoji in work notes."),
        opener: z.string().describe(`One of: ${VOICE_OPENERS.join(" | ")}. direct is straight to the point, smalltalk is a line of small talk first.`),
        phrases: z.array(z.string()).optional().describe(`Up to ${VOICE_PHRASES_MAX} short stock phrases they use again and again, each at most ${VOICE_PHRASE_CHARS} characters (\"Hope you're well\", \"No rush at all\"). Their own turns of phrase only: no names, addresses, links, numbers or anything quoted from a message.`),
        member_agreed: z.boolean().optional().describe("true only after the member saw the summary and said yes. Without it nothing is saved."),
      },
      annotations: { title: "Save my writing voice", ...WRITE },
    },
    (a) => run(ctx, () => T.saveMyVoice(ctx, a)),
  );

  server.registerTool(
    "my_voice",
    {
      title: "My writing voice",
      description:
        "The member's saved writing voice on Merlin: the style conclusions (greeting, sign-off, length, tone, contractions, exclamation marks, emoji, how they open, their stock phrases), or that none is saved yet. Use it to write a move's note the way they write. Only ever the member's own, and never message text.",
      inputSchema: {},
      annotations: { title: "My writing voice", ...READ },
    },
    () => run(ctx, () => T.myVoice(ctx)),
  );

  return server;
}
