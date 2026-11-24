/**
 * Agent access (BUILD_PLAN part 4, Stage 7a): the connector's tools as a member sees them, in four
 * groups (read, add, spend, send), with what each costs and what it did, in plain words. Pure data,
 * safe in the browser and on the server: lib/mcp/log.ts keeps the switches, the daily spend limit
 * and the log; app/post/agent/AgentAccess.tsx draws them.
 *
 * A switch key is a tool's name, or for unlock its kind: "unlock:company", "unlock:person",
 * "unlock:contact", "unlock:fact" (the kind is worked out from what is unlocked, never which one).
 * A group's own switch is "g:<group>". Spending credits and sending for signature always ask the
 * member first, whatever the switches say: a switch can only take a tool away.
 */

export type AgentGroup = "read" | "add" | "spend" | "send";
export type AgentCost = "free" | "earn" | "earn5" | "close" | "c1" | "c2";
/** Where a row of the log points, as a page key of the app (the page draws the address). */
export type AgentLand = "proposals" | "contracts" | "seats" | "alerts" | "pipeline" | "warm" | "settings" | "evidence" | "fractionals" | "find" | "companies" | "hiring" | "rates" | "today" | "credits";

export interface AgentTool {
  /** The switch key: the tool's name, or unlock's kind. */
  key: string;
  /** The tool as the connector names it. */
  tool: string;
  group: AgentGroup;
  name: string;
  /** What it does, one line. */
  d: string;
  cost: AgentCost;
  /** The log's words for a call that went through ("Searched companies"). */
  did: string;
  /** The log's words for a call that only asked (a quote, a preview), for tools that ask first. */
  asked?: string;
  /** A draft: the log's "Drafted and sent" tab. */
  draft?: boolean;
  /** Where its result lands in the app. */
  land?: AgentLand;
  /** Only where the server offers it: Google network (RN_GOOGLE), ways in (RN_PATHS), Granola (RN_GRANOLA). */
  needs?: "network" | "paths" | "granola";
}

export const AGENT_GROUPS: { id: AgentGroup; name: string; d: string }[] = [
  { id: "read", name: "Read", d: "Look things up. Changes nothing." },
  { id: "add", name: "Add", d: "Save what you know and your work. Never spends." },
  { id: "spend", name: "Spend", d: "Open companies and facts with your credits." },
  { id: "send", name: "Send", d: "Send for signature, or refer a company to a peer." },
];

const T = (group: AgentGroup, key: string, name: string, d: string, did: string, more: Partial<AgentTool> = {}): AgentTool => ({
  key,
  tool: key.split(":")[0],
  group,
  name,
  d,
  cost: "free",
  did,
  ...more,
});

/** Every tool the connector has, in the order the page lists them. */
export const AGENT_TOOLS: AgentTool[] = [
  T("read", "search_companies", "Search companies", "Companies that hire fractionals, by function, industry, size and fit", "Searched companies", { land: "find" }),
  T("read", "find_company", "Find a company by name", "Looks up one company you name in full. Up to 25 new companies a day", "Looked up a company by its name", { land: "find" }),
  T("read", "get_company", "Read a company", "Its seats, open roles and people, as far as you can see them", "Read a company", { land: "companies" }),
  T("read", "list_open_roles", "List open roles", "Fractional roles open now, and what is new this week", "Listed open roles", { land: "hiring" }),
  T("read", "rate_benchmarks", "Rate benchmarks", "What a seat pays, by function and company size", "Read rate benchmarks", { land: "rates" }),
  T("read", "ways_in", "Your ways in", "The best path into one company, and why", "Read your ways into a company", { land: "warm", needs: "paths" }),
  T("read", "todays_moves", "Your moves today", "Each move, why now, and the facts a note may use", "Read your moves today", { land: "today" }),
  T("read", "my_pipeline", "Your pipeline", "Your deals, their stage and the follow-ups due", "Read your pipeline", { land: "pipeline" }),
  T("read", "my_account", "Your account", "Your plan, credits, seats and ideal client", "Read your account", { land: "credits" }),
  T("read", "my_voice", "Your writing voice", "Greeting, sign-off, length and tone. Never message text", "Read your writing voice", { land: "settings" }),
  T("read", "my_network", "Your network", "Who you saved, with counts and dates only", "Read your network", { land: "warm", needs: "network" }),
  T("read", "list_peers", "Your peers", "Fellow fractionals you could work with", "Listed your peers", { land: "fractionals" }),
  T("read", "leads_passed_to_me", "Referrals for you", "Companies a peer referred to you", "Read your referrals", { land: "fractionals" }),
  T("read", "get_proposal_kit", "Proposal kit", "The template, rate band and company facts for one proposal", "Read a proposal kit", { land: "proposals" }),
  T("read", "list_proposal_templates", "Proposal templates", "Your templates and the ones Merlin has", "Listed proposal templates", { land: "proposals" }),
  T("read", "get_proposal", "Read a proposal", "One proposal, and what it still needs before it can go", "Read a proposal", { land: "proposals" }),
  T("read", "list_granola_calls", "Your calls", "Recent calls from Granola, to draft from", "Listed your recent calls", { land: "proposals", needs: "granola" }),
  T("read", "list_evidence", "Your Evidence Bank", "Your case studies, the client hidden unless you named it", "Read your Evidence Bank", { cost: "close", land: "evidence" }),
  T("read", "match_evidence", "Match your evidence", "Your closest cases for one company, in words", "Matched your evidence to a company", { cost: "close", land: "evidence" }),

  T("add", "add_my_seat", "Add your seat", "A seat you held. It becomes a way in and a draft evidence case", "Added your seat", { cost: "earn", land: "seats" }),
  T("add", "add_company_fact", "Add a company fact", "A fact Merlin does not have yet", "Added a company fact", { cost: "earn", land: "companies" }),
  T("add", "add_person", "Add a person", "Someone at a company, with their title", "Added a person", { cost: "earn", land: "companies" }),
  T("add", "save_my_network", "Save your network", "Company, name, title, how many emails and when. Never email text", "Saved your network", { land: "warm", needs: "network" }),
  T("add", "save_my_voice", "Save your writing voice", "Style conclusions only, after you agree to the summary", "Saved your writing voice", { asked: "Showed you a writing voice to agree", land: "settings" }),
  T("add", "follow_company", "Follow a company", "Puts it on your watch list", "Followed a company", { land: "companies" }),
  T("add", "alerts", "Saved searches and alerts", "Saves, changes or removes an alert", "Changed your saved searches", { land: "alerts" }),
  T("add", "update_pipeline", "Update your pipeline", "Moves a deal, marks it lost or adds a note", "Updated your pipeline", { land: "pipeline" }),
  T("add", "create_or_update_proposal", "Save a proposal draft", "Writes or updates a draft in Proposals", "Saved a proposal draft", { cost: "close", draft: true, land: "proposals" }),
  T("add", "draft_proposal_from_call", "Draft from a call", "A proposal draft from a Granola call or pasted notes", "Drafted a proposal from a call", { cost: "close", draft: true, land: "proposals" }),
  T("add", "change_proposal", "Change a proposal", "Edits pricing options, add-ons or wording in a draft", "Changed a proposal", { cost: "close", asked: "Showed you a change to a proposal", draft: true, land: "proposals" }),
  T("add", "save_evidence_case", "Save an evidence case", "Writes a case study in your Evidence Bank, after you say yes", "Saved an evidence case", { cost: "close", asked: "Showed you an evidence case to save", draft: true, land: "evidence" }),

  T("spend", "unlock:company", "Open a company", "Its name, website and the posting of its open roles", "Opened a company", { cost: "c2", asked: "Asked the price of a company", land: "companies" }),
  T("spend", "unlock:person", "Open a person", "Their name and title, as one purchase", "Opened a person", { cost: "c1", asked: "Asked the price of a person", land: "companies" }),
  T("spend", "unlock:contact", "Open a contact detail", "An email, a phone number or a profile link, one at a time", "Opened a contact detail", { cost: "c1", asked: "Asked the price of a contact detail", land: "companies" }),
  T("spend", "unlock:fact", "Open a fact", "What a seat paid, when it ended, an open role's posting, or a fact a member added", "Opened a fact", { cost: "c1", asked: "Asked the price of a fact", land: "companies" }),

  T("send", "send_proposal_for_signature", "Send a proposal for signature", "Emails the signing link to the client you name", "Sent a proposal for signature", { cost: "close", asked: "Asked to send a proposal for signature", draft: true, land: "proposals" }),
  T("send", "send_document_for_signature", "Send a contract for signature", "Emails a contract to sign, with its audit trail", "Sent a contract for signature", { cost: "close", asked: "Asked to send a contract for signature", draft: true, land: "contracts" }),
  T("send", "pass_lead", "Refer it to a peer", "Refers a company that is not your fit to a fellow fractional", "Referred a company to a peer", { cost: "earn5", asked: "Asked to refer a company to a peer", draft: true, land: "fractionals" }),
];

export const TOOL_BY_KEY = new Map(AGENT_TOOLS.map((t) => [t.key, t]));
/** Every key a switch may take: each tool's, and each group's ("g:read"). */
export const SWITCH_KEYS = new Set([...AGENT_TOOLS.map((t) => t.key), ...AGENT_GROUPS.map((g) => `g:${g.id}`)]);

/** The kinds of unlock, from what is unlocked (an entity and a field), never which record. */
export type UnlockKind = "company" | "person" | "contact" | "fact";
export function unlockKinds(entity: unknown, field: unknown): UnlockKind[] {
  const e = String(entity ?? "").toLowerCase();
  const f = String(field ?? "").toLowerCase();
  // A company's name, website, LinkedIn and About open with the company; "everything" at a company can open all four kinds.
  if (e === "company") return ["identity", "name", "website", "linkedin", "about"].includes(f) ? ["company"] : f === "everything" ? ["company", "person", "contact", "fact"] : ["fact"];
  if (e === "person") return f === "name" || f === "title" ? ["person"] : f === "everything" ? ["person", "contact"] : ["contact"];
  return ["fact"];
}

/** The switch keys a call needs on: its tool, or for unlock each kind it would open. */
export function keysOf(tool: string, args: unknown): string[] {
  if (tool !== "unlock") return [tool];
  const a = (args && typeof args === "object" ? args : {}) as { entity?: unknown; field?: unknown };
  return unlockKinds(a.entity, a.field).map((k) => `unlock:${k}`);
}

/** Tools that ask the member first, and the argument that says they said yes. */
export const YES_ARG: Record<string, string> = {
  unlock: "confirm",
  send_proposal_for_signature: "confirm",
  send_document_for_signature: "confirm",
  pass_lead: "confirm",
  save_evidence_case: "confirm",
  save_my_voice: "member_agreed",
  change_proposal: "apply",
};
/** A call that only asked: a tool that asks first, called without the member's yes. */
export function onlyAsked(tool: string, args: unknown): boolean {
  const k = YES_ARG[tool];
  if (!k) return false;
  const a = (args && typeof args === "object" ? args : {}) as Record<string, unknown>;
  return a[k] !== true;
}

/** The daily spend limits a member may pick for all their agents together; null is no limit. */
export const LIMIT_CHOICES = [5, 10, 25, 50] as const;

/** What a switch-off says to the agent, in plain words. */
export function offWords(key: string, page: string): string {
  const g = key.startsWith("g:") ? AGENT_GROUPS.find((x) => `g:${x.id}` === key) : null;
  const what = g ? `${g.name} tools are` : `"${TOOL_BY_KEY.get(key)?.name ?? key}" is`;
  return `${what} switched off for agents. The member switched this off on Merlin's Agent access page, so nothing was done. Tell them, and they can turn it back on there: ${page}`;
}

/** The cost as the page's pill says it. */
export const COST_WORDS: Record<AgentCost, string> = { free: "Free", earn: "Earns 1 credit", earn5: "Earns 5 credits", close: "Close plan", c1: "1 credit", c2: "2 credits" };
/** The second line under the cost. */
export function askWords(t: AgentTool): string {
  if (t.cost === "c2") return "Asks first. Free on the trial and Pro, 15 a day";
  if (t.group === "spend") return "Asks first, every time";
  if (t.group === "send") return t.cost === "earn5" ? "Asks first. Up to 10 a day" : "Asks first, every time";
  if (t.cost === "earn") return "Up to 25 a day";
  if (t.group === "add") return t.asked ? "Shows you first" : "Shows in the log";
  return "Changes nothing";
}

/* ---------- the log as the page reads it ---------- */

export type AgentOutcome = "ok" | "asked" | "refused" | "off" | "limit";

/** One row of the log: the tool (its switch key), when, the credits spent, what came of it and which agent. Never an argument or a result. */
export interface AgentLogRow {
  at: string;
  /** The switch key: "search_companies", "unlock:person". */
  t: string;
  o: AgentOutcome;
  /** Credits spent by the call. */
  c?: number;
  /** At the daily limit: the credits it asked to spend. */
  q?: number;
  /** The agent, as its app registered (Claude, Claude Code). */
  a?: string;
}

/** The log's tabs: all, read, added, asked to spend, drafted and sent. */
export type LogTab = "all" | "read" | "add" | "spend" | "out";
export function tabOf(row: Pick<AgentLogRow, "t">): Exclude<LogTab, "all"> {
  const t = TOOL_BY_KEY.get(row.t);
  if (!t) return "read";
  if (t.draft) return "out";
  return t.group === "send" ? "out" : t.group;
}

/** What the page shows for a row: a short kind, what it did, a detail line and the credits words. */
export function rowWords(r: AgentLogRow, limit: number | null): { kind: string; tone: "grey" | "earn" | "paid" | "ember" | "free"; t: string; s: string; c: string } {
  const t = TOOL_BY_KEY.get(r.t);
  const name = t?.name ?? r.t;
  if (r.o === "off") return { kind: "Refused", tone: "grey", t: `${t?.did ?? name}: switched off`, s: "You switched this off. Nothing was done", c: "Not spent" };
  if (r.o === "limit")
    return { kind: "Stopped", tone: "ember", t: "Stopped at your daily limit", s: `Asked to spend ${r.q ?? 0} more${limit ? `. Limit is ${limit} credits` : ""}. ${t?.name ?? "Spend"}`, c: "Not spent" };
  if (r.o === "refused") return { kind: "Refused", tone: "grey", t: t?.did ?? name, s: "Merlin said no and told it why. Nothing changed", c: "No cost" };
  if (r.o === "asked") return { kind: "Asked", tone: "grey", t: t?.asked ?? t?.did ?? name, s: t?.group === "spend" ? "It quoted the price first. Nothing spent" : "It showed you first. Nothing changed until your yes", c: t?.group === "spend" ? "Not spent" : "No cost" };
  const c = r.c ?? 0;
  if (t?.group === "spend") return { kind: "Spent", tone: c ? "paid" : "free", t: t.did, s: c ? "You said yes" : "You said yes. It opened free on your plan", c: c ? `${c} credit${c === 1 ? "" : "s"} spent` : "Free on your plan" };
  if (t?.group === "send") return { kind: "Sent", tone: "free", t: t.did, s: "You said yes", c: "No cost" };
  if (t?.draft) return { kind: "Drafted", tone: "free", t: t.did, s: "Lands as a draft. Never sent without your yes", c: "No cost" };
  if (t?.group === "add") return { kind: t.cost === "earn" ? "Added" : "Saved", tone: t.cost === "earn" ? "earn" : "grey", t: t.did, s: t.cost === "earn" ? "Earns what adding it yourself earns" : "Saved as you", c: "No cost" };
  return { kind: "Read", tone: "grey", t: t?.did ?? name, s: "Reading costs nothing and changes nothing", c: "No cost" };
}

/** What GET /api/agent answers (app/api/agent/route.ts). */
export interface AgentView {
  apps: { id: string; name: string; connectedAt: string; lastUsedAt: string; requestsToday: number; creditsToday: number }[];
  /** The tools this Merlin offers, in order: on (its own switch and its group's), its own switch, and how often agents used it in 30 days. */
  tools: (AgentTool & { on: boolean; self: boolean; used30: number })[];
  groups: { id: AgentGroup; name: string; d: string; on: boolean }[];
  limit: number | null;
  spentToday: number;
  requestsToday: number;
  /** Free's 20 a day while billing is live; null without a cap. */
  freeCap: number | null;
  /** Newest first, at most 200 of the last 90 days. */
  log: AgentLogRow[];
  /** The last 7 days, by tab. */
  week: Record<LogTab, number>;
  weekSpent: number;
  /** The oldest row kept (logging began at launch), or null. */
  since: string | null;
}
