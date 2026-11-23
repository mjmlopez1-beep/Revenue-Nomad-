/**
 * The Tools panel's items (For you, Sources, Enrich, Signals, Actions), each with what it costs a
 * row. Pure: the panel draws them, RunConfig runs the Enrich ones (an ordinary unlock, quoted by
 * the server first), and scripts/test-workbench.mts checks the words and the mapping.
 *
 * The mapping (BUILD_PLAN F3): Company name and website is the company's own unlock (2 credits,
 * free on the trial and Pro up to 15 a day); Who held the seat is free once the company is open;
 * Decision maker is the person's name and title (one purchase); Work email opens after the name;
 * Rate paid is the seat's rate. Signals are list alerts (F5). Actions are Add to pipeline, Draft
 * notes, Start a proposal (Close), Pass as a lead.
 *
 * Left out, with nothing behind them yet (BUILD_PLAN part 6): "Ask Merlin, a column Merlin
 * researches" (no research agent on the server), Import a
 * CSV (only the LinkedIn connections file reads today) and Send to Slack (no list post exists).
 * There is no Export, CSV or download anywhere: members cannot export data from Merlin (the owner's decision).
 *
 * Closest evidence and Match my evidence are Evidence Bank's, a Close feature (the owner's
 * decision): on Close and the Close trial they say Evidence Bank is coming (its store is Stage 5,
 * so the column has nothing to fill yet); on Free and Pro they show with the Close pill and open the
 * upgrade, never hidden.
 */
import { COMPANY_PRICE, PRO_OPENS_DAILY } from "@/lib/tableFields";
import type { Me } from "@/lib/tableTypes";
import type { RecordType } from "../model";

export type ToolTab = "you" | "sources" | "enrich" | "signals" | "actions";
export const TOOL_TABS: { key: ToolTab; label: string }[] = [
  { key: "you", label: "For you" },
  { key: "sources", label: "Sources" },
  { key: "enrich", label: "Enrich" },
  { key: "signals", label: "Signals" },
  { key: "actions", label: "Actions" },
];

/** How an item's cost reads: a pale green pill for free and earning, grey for credits, an outline for a plan gate. */
export type CostTone = "free" | "paid" | "gate";

/**
 * What the item does when picked.
 *   run      Enrich: open the drill-in to run a column on rows (`col` in columns.ts)
 *   column   show a free column at once
 *   type     switch the table to another record type, keeping the filters
 *   page     open another page
 *   alert    save the list with an alert on (`trigger` says which)
 *   action   one of the selection's actions
 *   recipe   For you: opens the first step of a short recipe
 */
export type ToolDo =
  | { kind: "run"; col: string }
  | { kind: "column"; col: string }
  | { kind: "type"; type: RecordType }
  | { kind: "page"; page: "network" | "proposals" | "pipeline" }
  | { kind: "alert"; trigger: "role" | "seat" | "leader" | "funding" }
  | { kind: "action"; action: "pipeline" | "notes" | "pass" | "proposal" }
  | { kind: "evidence" }
  /** People: bring in who you know from one source (network/ConnectPanel.tsx), the people on a list, Gmail through the member's own agent. */
  | { kind: "connect"; source: "google" | "linkedin" | "csv" }
  | { kind: "scope"; scope: "ideal" | "pipe" | "all" }
  | { kind: "agent" };

export interface ToolItem {
  id: string;
  tab: ToolTab;
  label: string;
  sub: string;
  cost: string;
  tone: CostTone;
  do: ToolDo;
}

/** What the panel needs to know about the member and the server's switches. */
export interface ToolCtx {
  me: Pick<Me, "proOpens" | "plan" | "credits">;
  /** Your network (RN_GOOGLE) is on: Google contacts are a source. */
  network: boolean;
  /** Close features are open (the trial, Close, grandfathered Pro): Start a proposal. */
  close: boolean;
  /** People: what the member has brought in, each source on its own (lib/paths): Google connected, the LinkedIn file's and the CSV's rows. */
  sources?: { google: boolean; googleOn: boolean; linkedin: number | null; csv: number | null };
  /** People: the member has an ideal client on file (the "People at your ideal client" source). */
  icp?: boolean;
}

const fmt = (n: number) => n.toLocaleString("en-US");

/**
 * People's tools (People.dc.html): Enrich runs the person's own locks (the name and title as one,
 * then email, phone and public profile, 1 credit a row each, quoted first) and "Match to my
 * contacts"; Sources are the member's own (Google, their LinkedIn connections file, a CSV, Gmail
 * through their own agent), each independent; Actions add to the pipeline, draft notes, watch for a
 * new decider. Left out: "Ask Merlin, a column Merlin researches" (nothing on the server backs it)
 * and Export (members cannot export data from Merlin).
 */
function peopleItems(ctx: ToolCtx): ToolItem[] {
  const co = companyCost(ctx.me);
  const src = ctx.sources ?? { google: false, googleOn: ctx.network, linkedin: null, csv: null };
  const any = src.google || src.linkedin !== null || src.csv !== null;
  const pro = proNow(ctx.me);
  return [
    { id: "pp-dm", tab: "enrich", label: "Who decides", sub: "Name and title of who hires, where members added them. One unlock for both", cost: "1 / row", tone: "paid", do: { kind: "run", col: "name" } },
    { id: "pp-email", tab: "enrich", label: "Work email", sub: "Where a member added one. Needs the name first. Know it? Add it and earn a credit", cost: "1 / row", tone: "paid", do: { kind: "run", col: "email" } },
    { id: "pp-phone", tab: "enrich", label: "Phone number", sub: "A direct line, where a member shared one", cost: "1 / row", tone: "paid", do: { kind: "run", col: "phone" } },
    { id: "pp-profile", tab: "enrich", label: "Public profile", sub: "A link to their public profile, where one is on file", cost: "1 / row", tone: "paid", do: { kind: "run", col: "linkedin" } },
    { id: "pp-open", tab: "enrich", label: "Open these companies", sub: "Their people open after the company", cost: co.cost, tone: co.tone, do: { kind: "run", col: "company" } },
    { id: "pp-match", tab: "enrich", label: "Match to my contacts", sub: "Fills How you know them and Last touch", cost: any ? "Free" : "Step 3", tone: any ? "free" : "gate", do: { kind: "connect", source: src.googleOn && !src.google ? "google" : "linkedin" } },
    {
      id: "src-google",
      tab: "sources",
      label: "Google contacts and calendar",
      sub: !src.googleOn ? "Not on for Merlin yet. The files below work without it" : src.google ? "Connected. Read once a day" : "Not connected",
      cost: src.google ? "On" : src.googleOn ? "Connect" : "Off",
      tone: src.google ? "free" : "gate",
      do: { kind: "connect", source: "google" },
    },
    { id: "src-linkedin", tab: "sources", label: "Your LinkedIn connections file", sub: src.linkedin !== null ? `${fmt(src.linkedin)} connections` : "Not added", cost: src.linkedin !== null ? "On" : "Add", tone: src.linkedin !== null ? "free" : "gate", do: { kind: "connect", source: "linkedin" } },
    { id: "src-csv", tab: "sources", label: "Import a CSV", sub: src.csv !== null ? `${fmt(src.csv)} contacts` : "Any list with a name and a company", cost: src.csv !== null ? "On" : "Add", tone: src.csv !== null ? "free" : "gate", do: { kind: "connect", source: "csv" } },
    { id: "src-agent", tab: "sources", label: "Gmail, through your own agent", sub: "Your agent reads your inbox on your side and saves only who and when", cost: "Agent", tone: "gate", do: { kind: "agent" } },
    ...(ctx.icp ? [{ id: "src-icp", tab: "sources" as const, label: "People at your ideal client", sub: "The companies you said you sell to", cost: "Free", tone: "free" as const, do: { kind: "scope" as const, scope: "ideal" as const } }] : []),
    { id: "src-co", tab: "sources", label: "These companies", sub: "One row a company", cost: "Free", tone: "free", do: { kind: "type", type: "companies" } },
    { id: "act-pipe", tab: "actions", label: "Add to pipeline", sub: "Ticked rows' companies become targets", cost: "Free", tone: "free", do: { kind: "action", action: "pipeline" } },
    { id: "act-notes", tab: "actions", label: "Draft notes", sub: "One note per person, from a template in your voice", cost: "Free", tone: "free", do: { kind: "action", action: "notes" } },
    { id: "act-watch", tab: "actions", label: "Watch for a new decider", sub: "Tell me when one joins a company in this view", cost: pro ? "Free" : "Pro", tone: pro ? "free" : "gate", do: { kind: "alert", trigger: "leader" } },
    { id: "act-pass", tab: "actions", label: "Pass as a lead", sub: "To a fractional who fits. Earn 5 credits when they pick it up", cost: "Earn", tone: "free", do: { kind: "action", action: "pass" } },
  ];
}

/** The tabs a list's Tools panel shows: People has no For you or Signals (its alert is in Actions). */
export const toolTabsFor = (type: RecordType) => (type === "people" ? TOOL_TABS.filter((t) => t.key === "enrich" || t.key === "sources" || t.key === "actions") : TOOL_TABS);

/** Trial and Pro: companies open free up to PRO_OPENS_DAILY a day (Me.proOpens). */
export const opensFree = (me: Pick<Me, "proOpens">) => !!me.proOpens && me.proOpens.left > 0;
/** The member's plan has Pro's features (the trial does). Billing off: nothing is gated. */
export const proNow = (me: Pick<Me, "plan">) => !me.plan || me.plan.tier !== "free";

/** "Free on trial", "Free today" (Pro), or "2 / row". */
export function companyCost(me: Pick<Me, "proOpens" | "plan">): { cost: string; tone: CostTone } {
  if (!opensFree(me)) return { cost: `${COMPANY_PRICE} / row`, tone: "paid" };
  return { cost: me.plan?.name === "trial" ? "Free on trial" : "Free today", tone: "free" };
}

export function toolItems(type: RecordType, ctx: ToolCtx): ToolItem[] {
  if (type === "people" && ctx.sources) return peopleItems(ctx);
  const co = companyCost(ctx.me);
  const pro = proNow(ctx.me);
  const gate = (ok: boolean, name: string): { cost: string; tone: CostTone } => (ok ? { cost: "On", tone: "free" } : { cost: name, tone: "gate" });
  const items: ToolItem[] = [
    // For you: short recipes that start the right drill-in.
    { id: "you-dm", tab: "you", label: "Who decides", sub: "The decision maker, where members added one", cost: "1 / row", tone: "paid", do: { kind: "run", col: "decider" } },
    { id: "you-open", tab: "you", label: "Open these companies", sub: `See each name, website and job posting${opensFree(ctx.me) ? `, free up to ${PRO_OPENS_DAILY} a day` : ""}`, cost: co.cost, tone: co.tone, do: { kind: "run", col: "company" } },
    { id: "you-watch", tab: "you", label: "Watch this list", sub: "Tell me when a company on it posts a fractional role", cost: "Free", tone: "free", do: { kind: "alert", trigger: "role" } },
    // Sources: other record types over the same filters, and the member's own contacts.
    ...(type !== "people" ? [{ id: "src-people", tab: "sources" as const, label: "People at these companies", sub: "Leaders and who decides, with the same filters", cost: "Free", tone: "free" as const, do: { kind: "type" as const, type: "people" as const } }] : []),
    ...(type !== "engagements" ? [{ id: "src-seats", tab: "sources" as const, label: "Seats at these companies", sub: "Every fractional seat on file", cost: "Free", tone: "free" as const, do: { kind: "type" as const, type: "engagements" as const } }] : []),
    ...(type !== "companies" ? [{ id: "src-co", tab: "sources" as const, label: "These companies", sub: "One row a company", cost: "Free", tone: "free" as const, do: { kind: "type" as const, type: "companies" as const } }] : []),
    ...(ctx.network
      ? [{ id: "src-network", tab: "sources" as const, label: "Your contacts", sub: "Google contacts or your LinkedIn connections file, matched to these companies", cost: "Free", tone: "free" as const, do: { kind: "page" as const, page: "network" as const } }]
      : []),
    // Enrich: columns, each with its price a row. Runs are ordinary unlocks, quoted first.
    ...(type === "companies"
      ? [
          { id: "en-company", tab: "enrich" as const, label: "Company name and website", sub: "Opens the company and its job postings", cost: co.cost, tone: co.tone, do: { kind: "run" as const, col: "company" } },
          { id: "en-held", tab: "enrich" as const, label: "Who held the seat", sub: "Free once the company is open", cost: "Free", tone: "free" as const, do: { kind: "column" as const, col: "heldBy" } },
          { id: "en-dm", tab: "enrich" as const, label: "Decision maker", sub: "Name and title of who hires, where on file. One purchase", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "decider" } },
          { id: "en-email", tab: "enrich" as const, label: "Work email", sub: "Where a member added one. Needs the decision maker's name first", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "email" } },
          { id: "en-rate", tab: "enrich" as const, label: "Rate paid", sub: "What the latest seat paid, where a member shared it", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "rate" } },
          {
            id: "en-evidence",
            tab: "enrich" as const,
            label: "Closest evidence",
            sub: ctx.close ? "Your Evidence Bank case most like each company. Coming with Evidence Bank" : "Your case most like each company, from Evidence Bank",
            cost: "Close",
            tone: (ctx.close ? "free" : "gate") as CostTone,
            do: { kind: "evidence" as const },
          },
          { id: "en-motion", tab: "enrich" as const, label: "Sales motion", sub: "How the company sells, where members added it", cost: "Free", tone: "free" as const, do: { kind: "column" as const, col: "motion" } },
        ]
      : []),
    // Seats (seatsPage): each row is one seat, so a run buys that seat's own fact.
    ...(type === "engagements"
      ? [
          { id: "seat-company", tab: "enrich" as const, label: "Company name and website", sub: "Opens the company and who held its seats", cost: co.cost, tone: co.tone, do: { kind: "run" as const, col: "company" } },
          { id: "seat-held", tab: "enrich" as const, label: "Who held the seat", sub: "Free once the company is open", cost: "Free", tone: "free" as const, do: { kind: "column" as const, col: "operator" } },
          { id: "seat-hidden", tab: "enrich" as const, label: "A holder out of the directory", sub: "Their name and role, one unlock", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "operator" } },
          { id: "seat-rate", tab: "enrich" as const, label: "Rate paid", sub: "Where a member shared it", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "rate" } },
          { id: "seat-end", tab: "enrich" as const, label: "Month it ended", sub: "The dated end of a seat that ended", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "end" } },
          { id: "seat-hours", tab: "enrich" as const, label: "Hours a week", sub: "Free where a member added it", cost: "Free", tone: "free" as const, do: { kind: "column" as const, col: "hours" } },
          { id: "seat-reason", tab: "enrich" as const, label: "Why they hired", sub: "Free where a member added it", cost: "Free", tone: "free" as const, do: { kind: "column" as const, col: "reason" } },
          { id: "seat-you-rate", tab: "you" as const, label: "What these seats paid", sub: "Rate paid on the rows in view", cost: "1 / row", tone: "paid" as const, do: { kind: "run" as const, col: "rate" } },
          { id: "seat-you-end", tab: "you" as const, label: "Watch for seats that end", sub: "An email the week one on this list ends", cost: "Free", tone: "free" as const, do: { kind: "alert" as const, trigger: "seat" as const } },
        ]
      : []),
    // Signals: what a saved list's alert watches for (F5). New executive and funding say where they come from.
    { id: "sig-role", tab: "signals", label: "Open role posted", sub: "A company on this list posts a fractional role", cost: "Free", tone: "free", do: { kind: "alert", trigger: "role" } },
    { id: "sig-seat", tab: "signals", label: "Seat ended", sub: "A fractional's seat there ended", cost: "Free", tone: "free", do: { kind: "alert", trigger: "seat" } },
    { id: "sig-leader", tab: "signals", label: "New executive", sub: "A new CEO, COO or CRO, from company websites Merlin reads", cost: gate(pro, "Pro").cost, tone: gate(pro, "Pro").tone, do: { kind: "alert", trigger: "leader" } },
    { id: "sig-funding", tab: "signals", label: "Raised money (SEC filing)", sub: "A Form D filing, US companies only", cost: gate(pro, "Pro").cost, tone: gate(pro, "Pro").tone, do: { kind: "alert", trigger: "funding" } },
    // Actions on the rows picked.
    { id: "act-pipe", tab: "actions", label: "Add to pipeline", sub: "Picked rows wait at To reach out", cost: "Free", tone: "free", do: { kind: "action", action: "pipeline" } },
    { id: "act-notes", tab: "actions", label: "Draft notes", sub: "One note a row, from a template in your voice", cost: "Free", tone: "free", do: { kind: "action", action: "notes" } },
    { id: "act-pass", tab: "actions", label: "Pass as a lead", sub: "To a fractional who fits. Earn 5 credits when they pick it up", cost: "Earn", tone: "free", do: { kind: "action", action: "pass" } },
    { id: "act-proposal", tab: "actions", label: "Start a proposal", sub: "From a call or a template", cost: "Close", tone: ctx.close ? "free" : "gate", do: { kind: "page", page: "proposals" } },
  ];
  return items;
}

/** Items on one tab whose words match the search box (every word, any order). */
export function itemsFor(type: RecordType, ctx: ToolCtx, tab: ToolTab, q = ""): ToolItem[] {
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const all = toolItems(type, ctx);
  if (!words.length) return all.filter((x) => x.tab === tab);
  return all.filter((x) => words.every((w) => `${x.label} ${x.sub}`.toLowerCase().includes(w)));
}
