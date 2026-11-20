/**
 * What each connector tool does, as the member. Every read comes from the member's own view of
 * the table (lib/mcp/view.ts) and every change goes through perform() in lib/table.ts, the path
 * the app uses, so credits, limits, hidden companies and the seat-holder rules are the app's.
 *
 * A locked fact never carries its value here either: it reads "locked, 1 credit to unlock", or
 * says what the one credit opens with it and what has to come first. The prices are the
 * server's, and these words follow them:
 * - who held a seat and the role they held are one purchase on a seat whose holder is on file
 *   (SEAT_BUNDLE). A seat with nobody named keeps its role as a fact of its own, free or locked
 *   as its cell says.
 * - a person's name and title are one purchase (PERSON_BUNDLE), and their LinkedIn, email and
 *   phone open only after it (PERSON_DETAILS). unlock refuses them before.
 * - every company is locked until the member unlocks it (2 credits, COMPANY_PRICE) or already knows
 *   it (they added to it, held a seat there, or paid for anything there). A locked company reads
 *   as "Locked company" with its free facts (industry, size, revenue, HQ region, its seats'
 *   functions and dates, its open roles) and an opaque id: never its name, website, LinkedIn or About.
 * - at a locked company, its people and the fractionals who held its seats open only after the
 *   company. unlock refuses them before.
 * - an end month that only says the seat is still going is free (the server shows it).
 * Results are small JSON objects with each record's public id for follow-up calls.
 */
import { randomBytes } from "crypto";
import { ActionError, aboutCells, connectorState, digestEnabled, inviteCode, perform, savedViewsFull, updateConnector, viewPatch, type Member } from "../table";
import { upgradeUrl } from "../plan";
import type { Action, Cell, EngagementRec, PersonRec, RateStat } from "../tableTypes";
import { PERSON_BUNDLE, FUNCTIONS, PRICING_MODELS, RN_DEAL_SIZES, RN_EMPLOYEES, RN_INDUSTRIES, RN_MOTIONS, RN_REVENUE, RN_SALES_CYCLES, BUSINESS_MODELS, OWNERSHIP_TYPES, WHY_NOW, END_REASONS, ENGAGEMENT_TYPES, HIRE_REASONS, SOURCED_VIA, STATUSES, RELATIONSHIPS, type Entity } from "../tableFields";
import {
  EMPTY_FILTERS, applyFilters, countryOf, deriveAll, fitReason, fitTier, friendlyCo, hireOfRow, hiredOn, icpEmpty, icpLabel, isOpenRole, repeatHirer, lastClosedPosting, lockedInEngagement, lockedOf, mySeats, rowsFor, shown, sortRows,
  fractionalLeadFns, fullTimeLead,
  type CoInfo, type FactRef, type Filters, type SortKey,
} from "@/app/post/model";
import { LEADERS_SOURCE, checkedWords, leadItems, ledFullTimeWords } from "../leaders/types";
import { cleanWindow } from "../hired";
import { ALERT_MAX, alertMatches, cleanCriteria, describeAlert, pickFrom, type RoleFacts, type SavedSearch } from "./alerts";
import { sameView } from "../hunt";
import { COUNTRIES_FIRST, inPlace, placeFilter } from "../geo";
import { forgetView, memberView, type MemberView } from "./view";
import { publicBase, webLink } from "../links";
import { firstOf, inviteNote, seatOpener } from "../partners";
import { COMPANY_PRICE, COMPANY_PRICE_SAY, REFERRAL_BONUS } from "../tableFields";
import { NetworkProblem, accountLine, myNetworkForClaude, saveFromClaude } from "../google"; // [google network]

export interface Ctx {
  member: Member;
  /** The public address, for links. */
  origin: string;
}
export type ToolOut = Record<string, unknown>;

/** A tool's answer that explains a problem to the model (sent with isError). */
export class ToolProblem extends Error {}

/* ---------- how cells read ---------- */

export const LOCKED = "locked, 1 credit to unlock";
/** An open role's posting, posted rate or posted hours: on file, and bought together (or with the company). */
const LOCKED_ROLE = "on file, 1 credit opens it with the rest of this open role's job posting";
const LOCKED_WITH_COMPANY = `on file, unlocks with the company (${COMPANY_PRICE_SAY})`;
const NO_RATE = "No rate posted";
const NO_POSTING = "No posting link on file";
/** A person's name and title are one purchase (PERSON_BUNDLE). */
export const LOCKED_PERSON = "locked, 1 credit opens this person's name and title together";
/** Who held a seat and the role they held are one purchase on a seat whose holder is on file (SEAT_BUNDLE). */
export const LOCKED_SEAT = "locked, 1 credit opens who held this seat and the role they held together";
/** A person's LinkedIn, email and phone wait for their name and title (PERSON_DETAILS). */
export const AFTER_NAME = "opens after the name. Unlock their name and title first (1 credit for both), then this is 1 credit";
/** A person, or who held a seat, at a company that is still locked. */
export const AFTER_COMPANY = `opens after the company. Unlock the company first (${COMPANY_PRICE_SAY})`;
/** What unlock says when asked for one of those too early: the server's words, then the way through. */
export const NAME_FIRST = "Unlock their name and title first. One credit opens both (unlock this person with field name). Then their LinkedIn, email and phone are 1 credit each.";
export const COMPANY_FIRST = `Unlock the company first. ${COMPANY_PRICE_SAY} open it (unlock the company with field identity). Then its people and who held its seats can be unlocked.`;
const REVIEW = "under review";
/** A person's contact details: they open only once the member can see who the person is (PERSON_DETAILS in lib/tableFields.ts). */
const CONTACT_DETAILS = ["linkedin", "email", "phone"];
/** Who held a seat and the role they held (SEAT_BUNDLE in lib/tableFields.ts). */
const SEAT_PAIR = ["operator", "role"];
/** The member can't see who this person is yet: their name or title is locked. */
const personUnseen = (p: PersonRec) => PERSON_BUNDLE.some((f) => p.cells[f]?.s === "locked");
/** A seat whose holder is on file (behind a lock or not) and that is not an open role: its holder and role are one purchase. */
const seatBundled = (e: EngagementRec) => !isOpenRole(e) && (e.cells.operator?.s === "locked" || e.cells.operator?.s === "value");
/** What one credit opens on an open role (the app's OPEN_ROLE_BUNDLE): its posting, posted rate and posted hours. */
const ROLE_BUNDLE = ["posting", "rate", "hours"];
/** Fields whose values are web addresses: sent as full https:// links (the table stores them without a scheme). */
const URL_FIELDS = new Set(["website", "linkedin", "posting"]);

/** Output keys (what a model reads and sends back) and the field each one is. */
const COMPANY_KEYS: Record<string, string> = {
  website: "website", industry: "industry", employees: "employees", revenue: "revenue", hq: "hq", linkedin: "linkedin", about: "about",
  business_model: "businessModel", sales_motion: "motion", deal_size: "dealSize", sales_cycle: "salesCycle", ownership: "ownership",
};
const SEAT_KEYS: Record<string, string> = {
  function: "function", role: "role", type: "type", status: "status", seat_holder: "operator", start: "start", end: "end", why_hired: "reason",
  sourced: "sourced", pricing: "pricing", rate: "rate", hours: "hours", posting: "posting", revenue_then: "revenue", employees_then: "employees",
  why_now: "whyNow", end_reason: "endReason",
};
const PERSON_KEYS: Record<string, string> = { name: "name", title: "title", relationship: "relationship", email: "email", phone: "phone", linkedin: "linkedin" };
const outKey = (keys: Record<string, string>, field: string) => Object.keys(keys).find((k) => keys[k] === field) ?? field;
/** A field from what a model sent: the output key ("seat_holder") or the field itself ("operator"). */
const fieldFrom = (keys: Record<string, string>, raw: string) => keys[raw] ?? (Object.values(keys).includes(raw) ? raw : null);

function read(c: Cell | undefined, locked = LOCKED, field?: string): string | undefined {
  if (!c || c.s === "empty") return undefined;
  if (c.s === "locked") return locked;
  if (c.s === "reported") return REVIEW;
  // A link goes out whole ("https://acme.com/jobs/1"). A stored value that is no web address (javascript:) is not sent.
  if (field && URL_FIELDS.has(field)) return webLink(c.v) ?? undefined;
  return c.v;
}

/** Cells as {key: value}, empty ones left out. */
function readAll(cells: Record<string, Cell>, keys: Record<string, string>, lockedFor: (field: string) => string = () => LOCKED): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, field] of Object.entries(keys)) {
    const v = read(cells[field], lockedFor(field), field);
    if (v !== undefined) out[k] = v;
  }
  return out;
}
const missingOf = (cells: Record<string, Cell>, keys: Record<string, string>, skip: string[] = []) =>
  Object.entries(keys).filter(([, f]) => cells[f]?.s === "empty" && !skip.includes(f)).map(([k]) => k);

/* ---------- records ---------- */

const fitOf = (i: CoInfo) => fitTier(i.c.friendly, i.engs.length, !!lastClosedPosting(i)).label;

/** One line on why a company sits in its tier (the app's fitTier labels), so a model can say it plainly. */
export function fitWhy(i: CoInfo): string {
  const f = i.c.friendly;
  const fns = f.functions.length;
  switch (fitOf(i)) {
    case "Hiring now":
      return f.fractional
        ? `Hiring now, with ${f.fractional} past fractional hire${f.fractional > 1 ? "s" : ""} on file, so it has worked with fractionals before.`
        : "Hiring now, but an open role alone ranks low until a past fractional hire is on file.";
    case "Repeat hirer":
      return `Repeat hirer: ${f.fractional} fractional hire${f.fractional === 1 ? "" : "s"} on file${fns > 1 ? ` across ${fns} functions` : ""}.`;
    case "Recent seat":
      return "A fractional seat here started in the last two years.";
    case "Past seat":
      return "A past fractional seat is on file, none in the last two years.";
    case "Posting closed":
      return "A job posting here came down with nobody named in the seat. They went looking, but no hire is on file.";
    case "Full-time only":
      return "Only full-time or unconfirmed seats are on file, no fractional hire yet.";
    default:
      return "No seats on file yet.";
  }
}

/** The free facts a locked company shows (industry, size, revenue, HQ region) that aren't on file, said plainly. */
function notOnFile(i: CoInfo): string | undefined {
  const c = i.c.cells;
  const gone = (["industry", "employees", "revenue", "hq"] as const).filter((k) => !c[k] || c[k].s === "empty");
  if (!gone.length) return undefined;
  const words: Record<string, string> = { industry: "industry", employees: "size", revenue: "revenue", hq: "HQ" };
  const parts = gone.map((k, n) => (n === 0 && k !== "hq" ? words[k].charAt(0).toUpperCase() + words[k].slice(1) : words[k]));
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  return `${list} not on file yet`;
}

/** What Unlock company (COMPANY_PRICE) opens at a locked company, from what its open roles have on file. Never promises a rate that isn't there. */
function companyBundle(i: CoInfo): { what: string; rate: boolean } {
  const open = i.engs.filter(isOpenRole);
  const has = (f: string) => open.some((e) => !!e.cells[f] && e.cells[f].s !== "empty");
  const parts = [has("posting") ? "the job posting" : null, has("rate") ? "the posted rate" : null, has("hours") ? "the posted hours" : null].filter((x): x is string => !!x);
  const list = parts.length > 1 ? `${parts.slice(0, -1).join(", ")} and ${parts[parts.length - 1]}` : parts[0];
  const roles = open.length ? `${list ? `, and ${list} of its open role${open.length > 1 ? "s" : ""}` : ""}${has("rate") ? "" : ". No rate was posted"}` : "";
  return { what: `its name, website, logo and LinkedIn${roles}`, rate: has("rate") };
}

function companySummary(i: CoInfo): ToolOut {
  const c = i.c;
  const missing = c.hidden ? notOnFile(i) : undefined;
  return {
    id: c.id,
    name: c.name,
    ...(c.hidden ? { hidden: true, hidden_note: `Locked. Unlock the company for ${COMPANY_PRICE_SAY} to see ${companyBundle(i).what}. Until then it is known by its id and the free facts here.` } : {}),
    ...readAll(c.cells, { industry: "industry", employees: "employees", revenue: "revenue", hq: "hq" }),
    ...(missing ? { not_on_file: missing } : {}),
    ...(c.country ? { country: c.country } : {}),
    ...(c.region ? { region: c.region } : {}),
    fit: fitOf(i),
    fit_reason: fitWhy(i),
    fit_score: c.friendly.score,
    why: fitReason(i),
    functions_hired: i.fnState.hired,
    fractional_hires: c.friendly.fractional,
    ...(repeatHirer(i) ? { repeat_hirer: true } : {}),
    ...(i.fnState.hiring.length ? { hiring_now: i.fnState.hiring } : {}),
    // Who leads each function, from the company's own website: roles only, never a person.
    ...(c.leads?.fns.length ? { who_leads: leadItems(c.leads), who_leads_source: `${LEADERS_SOURCE}, checked ${checkedWords(c.leads.checkedAt)}` } : {}),
    seats: i.engs.length,
    ...(c.friendly.open ? { open_roles: c.friendly.open } : {}),
    ...(c.friendly.operators ? { fellow_fractionals: c.friendly.operators } : {}),
    ...(c.following ? { following: true } : {}),
    locked_facts: i.locked.length,
  };
}

const dayOfIso = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : undefined);

/** How a person's locked fact reads: after the company at a locked one, the contact details after the name, the name and title as one. */
export function personLocked(p: PersonRec, hidden: boolean, field: string): string {
  if (hidden) return AFTER_COMPANY;
  if (CONTACT_DETAILS.includes(field) && personUnseen(p)) return AFTER_NAME;
  return PERSON_BUNDLE.includes(field) ? LOCKED_PERSON : LOCKED;
}

export function personOut(p: PersonRec, seatId?: string | null, hidden = false): ToolOut {
  return { id: p.id, ...(seatId ? { seat_id: seatId } : {}), ...readAll(p.cells, PERSON_KEYS, (f) => personLocked(p, hidden, f)) };
}

/** How a seat's locked fact reads: an open role's posting with the role or the company, who held it with their role, after the company at a locked one. */
export function seatLocked(e: EngagementRec, hidden: boolean, field: string): string {
  const open = isOpenRole(e);
  if (open && ROLE_BUNDLE.includes(field)) return hidden ? LOCKED_WITH_COMPANY : LOCKED_ROLE;
  // At a locked company everything else paid opens after the company: any purchase there owns it.
  if (hidden) return AFTER_COMPANY;
  if (seatBundled(e) && SEAT_PAIR.includes(field)) return LOCKED_SEAT;
  return LOCKED;
}

/**
 * The next step with a seat holder the member can see (after the unlock), the app's own: Message
 * them on Merlin when they are a member who has signed in; else Invite to connect, with the seat's
 * claim link (EngagementRec.invite, with the member's invite code) and the note the app writes;
 * else their LinkedIn search. No step goes through Revenue Nomad's staff.
 */
export function reachOf(e: EngagementRec, i: CoInfo, mv: MemberView, base = publicBase() ?? ""): ToolOut {
  const h = e.cells.operator;
  if (h?.s !== "value" || e.yours) return {};
  const first = firstOf(h.v);
  const me = mv.view.me;
  const linkedin_search = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(h.v)}`;
  const words = { first, role: shown(e.cells.role), fn: shown(e.cells.function), company: i.c.name, myTitle: me?.title ?? null, myFn: me?.function ?? null };
  if (h.member)
    return {
      next_step: `Message ${first}`,
      how: `${first} is on Merlin. Open this company in the app and press Message ${first}. The app writes a first message the member can change.`,
      open_in_merlin: `${base}/?c=${encodeURIComponent(i.c.id)}`,
      suggested_message: seatOpener(words),
    };
  if (e.invite) {
    const link = `${base}${e.invite.path}`;
    return {
      next_step: "Invite to connect",
      how: `${first} isn't on Merlin yet. Send them this note with the link. When they claim their seat through it, a conversation opens between you on Merlin, and if they're new to Merlin you both get ${REFERRAL_BONUS} credits.`,
      invite_link: link,
      suggested_note: inviteNote({ ...words, icp: me?.icp ?? null, link }),
      ...(e.invite.at ? { invited: dayOfIso(e.invite.at) } : {}),
      linkedin_search,
    };
  }
  return { next_step: "Find them on LinkedIn", linkedin_search };
}

export function seatOut(e: EngagementRec, i: CoInfo, mv: MemberView, base = publicBase() ?? ""): ToolOut {
  const open = isOpenRole(e);
  const facts = readAll(e.cells, SEAT_KEYS, (field) => seatLocked(e, !!i.c.hidden, field));
  // Before anyone pays: say whether the posting gave a rate at all (never promise one that isn't there).
  if (open && !e.yours && !facts.rate) facts.rate = NO_RATE;
  const holder = e.cells.operator;
  if (holder?.s === "value" && holder.member) facts.seat_holder += holder.member.you ? " (you)" : ` (on Merlin${holder.member.title ? `, ${holder.member.title}` : ""})`;
  // A seat Revenue Nomad found with no name on file: its fractional can claim it.
  if (e.claimable && (!holder || holder.s === "empty")) facts.seat_holder = "Not on Merlin yet";
  if (open && facts.rate) (facts.posted_rate = facts.rate), delete facts.rate;
  if (open && facts.hours) (facts.posted_hours = facts.hours), delete facts.hours;
  return {
    id: e.id,
    ...(open ? { open_role: true } : {}),
    ...(e.yours ? { yours: true } : {}),
    ...facts,
    // A seat holder's name nobody has verified yet (the person hasn't claimed the seat, and two members or an admin haven't confirmed it).
    ...(holder?.s === "value" && holder.unverified ? { holder_verified: false } : {}),
    ...(e.opened ? { listed_since: dayOfIso(e.openedAt ?? e.opened) } : {}),
    ...(e.posted ? { posted: e.posted } : {}),
    ...(e.closed ? { closed: dayOfIso(e.closedAt ?? e.closed) } : {}),
    ...(e.unseen ? { note: "Not seen in the last scan of its job board, so it may have closed." } : {}),
    ...(holder?.s === "value" && !e.yours && !holder.member?.you ? { reach_them: reachOf(e, i, mv, base) } : {}),
    ...(e.people.length ? { people: e.people.map((p) => personOut(p, null, !!i.c.hidden)) } : {}),
    ...(e.yours ? { you_can_add: missingOf(e.cells, SEAT_KEYS, open ? ["start", "end", "reason", "sourced"] : []) } : {}),
    ...(e.claimable && !e.yours ? { claimable: "If this is the member's own seat, add_my_seat with this seat_id and claim: true makes it theirs (ask them first)." } : {}),
  };
}

/**
 * The ways in: fellow fractionals who held a seat there, and the people who hired or managed them.
 * At a locked company they open only after the company, so each says to unlock the company first.
 * Once the member can see who held a seat, its entry says the next step (reachOf): Message them,
 * or Invite to connect with the link. Before that it says what the unlock opens, and nothing more.
 */
export function warmPaths(i: CoInfo, mv?: MemberView, base = publicBase() ?? ""): ToolOut[] {
  const out: ToolOut[] = [];
  const hidden = !!i.c.hidden;
  const company = { entity: "company", id: i.c.id, field: "identity" };
  for (const e of i.engs) {
    const h = e.cells.operator;
    if (!h || h.s === "empty" || e.yours) continue;
    const when = [shown(e.cells.start), shown(e.cells.end)].filter(Boolean).join(" to ");
    const withRole = seatBundled(e) && e.cells.role?.s === "locked";
    out.push({
      who: `Fractional who held the ${shown(e.cells.function) ?? ""} seat${when ? ` (${when})` : ""}`.replace("the  seat", "a seat"),
      name: read(h, seatLocked(e, hidden, "operator")),
      ...(h.s === "value" && h.unverified ? { holder_verified: false } : {}),
      seat_id: e.id,
      ...(h.s === "locked"
        ? hidden
          ? { unlock_first: company }
          : { unlock: { entity: "seat", id: e.id, field: "seat_holder" }, opens: withRole ? "who held it and the role they held, 1 credit" : "who held it, 1 credit" }
        : {}),
      ...(h.s === "value" && mv && !h.member?.you ? reachOf(e, i, mv, base) : {}),
    });
  }
  const ranked = ["Hiring for the seat", "Reported to", "Decision maker", "Worked with", "Reported to me"];
  const people = i.people
    .filter(({ p }) => p.cells.name && p.cells.name.s !== "empty")
    .sort((a, b) => ranked.indexOf(shown(a.p.cells.relationship) ?? "") - ranked.indexOf(shown(b.p.cells.relationship) ?? ""));
  for (const { p, e } of people) {
    const rel = shown(p.cells.relationship);
    out.push({
      who: [shown(p.cells.title), rel ? rel.toLowerCase() : null, e && shown(e.cells.function) ? `on the ${shown(e.cells.function)} seat` : null].filter(Boolean).join(", ") || "A person at the company",
      name: read(p.cells.name, personLocked(p, hidden, "name")),
      person_id: p.id,
      ...(p.cells.name.s === "locked" ? (hidden ? { unlock_first: company } : { unlock: { entity: "person", id: p.id, field: "name" }, opens: "their name and title, 1 credit" }) : {}),
    });
  }
  return out.slice(0, 10);
}

/**
 * What unlocking everything here would buy: one entry per purchase. An open role's posting, rate
 * and hours are one (the table's list already counts them once), so are a person's name and title,
 * and so are who held a seat and the role they held.
 */
export const purchases = (i: CoInfo) => purchaseSet(i).size;
/** What those purchases cost: 1 credit each, and COMPANY_PRICE for the company. */
export const purchaseCredits = (i: CoInfo) => [...purchaseSet(i)].reduce((n, k) => n + (k.endsWith(" identity") ? COMPANY_PRICE : 1), 0);
const purchaseSet = (i: CoInfo) => {
  const bought = new Set<string>();
  for (const t of i.locked) {
    const e = t.entity === "engagement" ? i.engs.find((x) => x.id === t.id) : undefined;
    const pair = (t.entity === "contact" && PERSON_BUNDLE.includes(t.field)) || (!!e && seatBundled(e) && SEAT_PAIR.includes(t.field));
    bought.add(`${t.entity} ${t.id} ${pair ? "pair" : t.field}`);
  }
  return bought;
};

/** The company's About cell with its text (the table carries a visible About without it, Cell.lazy), read from the state. */
async function aboutOf(ctx: Ctx, i: CoInfo | undefined): Promise<Cell | undefined> {
  if (!i || i.c.cells.about?.s !== "value" || !i.c.cells.about.lazy) return undefined;
  // A company named for this answer only (find_company) has its whole About; one locked for the member, without its name and links.
  return (await aboutCells(ctx.member.token, [i.c.id], { asMember: true, found: !!i.c.found }))?.about[i.c.id];
}

/** One company for get_company. `about`: its About cell with the text (aboutOf). */
function companyOut(i: CoInfo, mv: MemberView, base = publicBase() ?? "", about?: Cell): ToolOut {
  const c = i.c;
  const facts = readAll(about ? { ...c.cells, about } : c.cells, COMPANY_KEYS, (f) => (c.hidden && ["website", "linkedin"].includes(f) ? `locked until you unlock the company (${COMPANY_PRICE_SAY})` : LOCKED));
  return {
    ...companySummary(i),
    ...facts,
    // A locked company's About reads without its name, web address, links and emails (lib/scan/clean.ts aboutWithout).
    ...(c.hidden && facts.about ? { about_note: `The company's name, web address, links and emails are left out of this About until the member unlocks the company (${COMPANY_PRICE_SAY}).` } : {}),
    ...(c.hidden ? {} : { you_can_add: missingOf(c.cells, COMPANY_KEYS, ["about"]) }),
    seats: i.engs.map((e) => seatOut(e, i, mv, base)),
    ...(c.people.length ? { people: c.people.map((p) => personOut(p, null, !!c.hidden)) } : {}),
    warm_paths: warmPaths(i, mv, base),
    locked: purchases(i)
      ? { purchases: purchases(i), note: `Up to ${purchaseCredits(i)} credit${purchaseCredits(i) > 1 ? "s" : ""} to unlock everything here. Call unlock with field "everything" (without confirm) for the exact cost.` }
      : "Nothing here is locked for you.",
  };
}

/* ---------- finding things ---------- */

function companyInfo(mv: MemberView, raw: unknown): CoInfo {
  const id = String(raw ?? "").trim();
  const byId = mv.byId.get(id);
  if (byId) return byId;
  // A name works too, for companies the member can see (a hidden company has no name to match).
  const lc = id.toLowerCase();
  const named = lc ? mv.infos.filter((i) => !i.c.hidden && (i.c.name.toLowerCase() === lc || i.domain === lc.replace(/^https?:\/\//, "").replace(/^www\./, ""))) : [];
  if (named.length === 1) return named[0];
  if (named.length > 1) throw new ToolProblem(`More than one company is called that. Use one of these ids: ${named.map((i) => i.c.id).join(", ")}`);
  throw new ToolProblem("No company with that id or name. Use search_companies to find it, then pass its id.");
}
function seatInfo(mv: MemberView, raw: unknown): { i: CoInfo; e: EngagementRec } {
  const id = String(raw ?? "");
  const i = mv.bySeat.get(id);
  const e = i?.engs.find((x) => x.id === id);
  if (!i || !e) throw new ToolProblem("No seat with that id. Use get_company to see a company's seats and their ids.");
  return { i, e };
}
function personInfo(mv: MemberView, raw: unknown): { i: CoInfo; p: PersonRec } {
  const id = String(raw ?? "");
  const i = mv.byPerson.get(id);
  const p = i?.people.find((x) => x.p.id === id)?.p;
  if (!i || !p) throw new ToolProblem("No person with that id. Use get_company to see the people at a company.");
  return { i, p };
}

/** A pick-list value in the list's own spelling, or a clear problem. */
function listValue(name: string, list: readonly string[], raw: unknown): string {
  const v = pickFrom(list, raw);
  if (!v) throw new ToolProblem(`${name} "${String(raw).slice(0, 40)}" isn't one of: ${list.join(", ")}`);
  return v;
}
const listValues = (name: string, list: readonly string[], raw: unknown) =>
  raw === undefined || raw === null ? [] : (Array.isArray(raw) ? raw : [raw]).filter((x) => x !== "").map((x) => listValue(name, list, x));

const roleFacts = (i: CoInfo, e: EngagementRec): RoleFacts => ({
  function: shown(e.cells.function),
  industry: shown(i.c.cells.industry),
  employees: shown(i.c.cells.employees),
  revenue: shown(i.c.cells.revenue),
  hq: shown(i.c.cells.hq),
  pastHires: i.c.friendly.fractional,
  country: i.c.country ?? null,
  region: i.c.region ?? null,
});

const clampLimit = (raw: unknown, def: number, max: number) => Math.max(1, Math.min(max, Math.floor(Number(raw) || def)));

export interface SearchArgs {
  query?: string;
  function?: string;
  function_hired?: string;
  no_function_yet?: string;
  fractional_friendly?: boolean;
  /** 2 or more fractional hires on file, or hires in 2 or more functions (the app's Repeat hirers). */
  repeat_hirer?: boolean;
  hiring_now?: boolean;
  industry?: string[];
  employees?: string[];
  revenue?: string[];
  hq?: string;
  /** A country ("United States", "UK", "Canada"): every company whose HQ is there, however the HQ was typed. */
  country?: string;
  /** A US state or a region or province ("California", "TX", "Ontario"). */
  region?: string;
  business_model?: string;
  sales_motion?: string;
  deal_size?: string;
  sales_cycle?: string;
  following?: boolean;
  unlocked?: boolean;
  /**
   * Recently hired (the table's Filters.hiredFn and .hiredWithin, lib/hired.ts): companies with a
   * fractional leader's hire in this function, or any of a list, whose start is within
   * hired_within_months. Leadership seats only, as the table counts them (isLeaderHire): a seat
   * whose title reads below Lead, like a Finance Manager, doesn't count, whether or not the member
   * can see its title.
   */
  hired_function?: string | string[];
  /** The window in months (0 or left out: any time). Alone, a hire in any function. */
  hired_within_months?: number;
  sort?: "fit" | "newest" | "name" | "employees" | "revenue" | "recent_hire";
  limit?: number;
  offset?: number;
}

/** The hire a company matched Recently hired with: its function, start and role, the role only when the member can see it. Never who held the seat. */
function recentHireOut(i: CoInfo, e: EngagementRec): ToolOut {
  return {
    seat_id: e.id,
    ...readAll(e.cells, { function: "function", start: "start", role: "role" }, (field) => seatLocked(e, !!i.c.hidden, field)),
  };
}

export async function searchCompanies(ctx: Ctx, a: SearchArgs): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const me = mv.view.me!;
  const f: Filters = structuredClone(EMPTY_FILTERS);
  f.industry = listValues("industry", RN_INDUSTRIES, a.industry);
  f.employees = listValues("employees", RN_EMPLOYEES, a.employees);
  f.revenue = listValues("revenue", RN_REVENUE, a.revenue);
  if (a.business_model) f.businessModel = [listValue("business_model", BUSINESS_MODELS, a.business_model)];
  if (a.sales_motion) f.motion = [listValue("sales_motion", RN_MOTIONS, a.sales_motion)];
  if (a.deal_size) f.dealSize = [listValue("deal_size", RN_DEAL_SIZES, a.deal_size)];
  if (a.sales_cycle) f.salesCycle = [listValue("sales_cycle", RN_SALES_CYCLES, a.sales_cycle)];
  // A place: a country or a region given as hq ("United States", "Texas") matches by the HQ's country and region, however it was typed.
  let place: { country: string | null; region: string | null } | null = null;
  if (a.hq?.trim()) {
    place = placeFilter(a.hq.trim().slice(0, 60));
    if (!place) f.hq = [a.hq.trim().slice(0, 60)];
  }
  if (a.country !== undefined && a.country !== null && String(a.country).trim()) {
    const c = placeFilter(String(a.country).slice(0, 60));
    if (!c?.country || c.region) throw new ToolProblem(`country "${String(a.country).slice(0, 40)}" isn't a country we know. Try one of: ${COUNTRIES_FIRST.slice(0, 12).join(", ")}`);
    if (place?.country && place.country !== c.country) throw new ToolProblem("hq and country name two different countries. Use one.");
    place = { country: c.country, region: place?.region ?? null };
  }
  if (a.region !== undefined && a.region !== null && String(a.region).trim()) {
    const r = placeFilter(String(a.region).slice(0, 60));
    const inCountry = r?.region && (!place?.country || r.country === place.country) ? r : place?.country ? placeFilter(`${String(a.region).slice(0, 60)}, ${place.country}`) : null;
    if (!inCountry?.region) throw new ToolProblem(`region "${String(a.region).slice(0, 40)}" isn't a state, region or province we know${place?.country ? ` in ${place.country}` : ""}.`);
    place = { country: inCountry.country, region: inCountry.region };
  }
  if (a.function) f.fn = [listValue("function", FUNCTIONS, a.function)];
  // Recently hired, with the table's own rule (a leadership hire in these functions whose start is in the window).
  f.hiredFn = [...new Set(listValues("hired_function", FUNCTIONS, a.hired_function))];
  if (a.hired_within_months !== undefined && a.hired_within_months !== null) {
    const n = Number(a.hired_within_months);
    if (!Number.isFinite(n) || n < 0) throw new ToolProblem("hired_within_months is a number of months, like 3, 6, 12 or 24. 0 means any time.");
    f.hiredWithin = cleanWindow(n);
  }
  const hire = hiredOn(f) ? { fns: f.hiredFn, within: f.hiredWithin } : null;
  const hired = a.function_hired ? listValue("function_hired", FUNCTIONS, a.function_hired) : null;
  const notYet = a.no_function_yet ? listValue("no_function_yet", FUNCTIONS, a.no_function_yet) : null;
  const tab = a.hiring_now ? "hiring" : a.following ? "following" : a.unlocked ? "unlocked" : a.repeat_hirer ? "repeat" : "all";
  const q = String(a.query ?? "").slice(0, 200);
  let rows = applyFilters(rowsFor("companies", mv.infos), f, tab, q, me).rows;
  if (place) rows = rows.filter((r) => inPlace({ country: r.i.c.country ?? null, region: r.i.c.region ?? null }, place!));
  // The tab covers one of these; the others are checked here. fractional_friendly keeps its old meaning (the app no longer has that tab).
  if (a.fractional_friendly) rows = a.hiring_now ? rows.filter((r) => r.i.c.friendly.fractional > 0) : rows.filter((r) => friendlyCo(r.i));
  if (a.repeat_hirer && tab !== "repeat") rows = rows.filter((r) => repeatHirer(r.i));
  if (a.following && tab !== "following") rows = rows.filter((r) => r.i.c.following);
  if (a.unlocked && tab !== "unlocked") rows = rows.filter((r) => r.i.unlockedByMe);
  if (hired) rows = rows.filter((r) => r.i.fnState.hired.includes(hired));
  // "No Marketing yet": they hired fractionals in other functions and none in this one (the app's "No Marketing seat yet").
  // A fractional or interim leader on the company's website counts as a fractional hire in that function.
  if (notYet)
    rows = rows.filter((r) => {
      const frac = fractionalLeadFns(r.i);
      return (r.i.fnState.hired.length > 0 || frac.length > 0) && !r.i.fnState.hired.includes(notYet) && !r.i.fnState.hiring.includes(notYet) && !frac.includes(notYet);
    });
  // Recently hired lists the most recent hire first, unless another order was asked for.
  const sort: SortKey =
    a.sort === "recent_hire" ? "hired" : a.sort && ["fit", "newest", "name", "employees", "revenue"].includes(a.sort) ? (a.sort as SortKey) : hire ? "hired" : "fit";
  rows = sortRows(rows, sort, false, q, { hire });
  // "No Sales yet": a company whose website shows a full-time leader of that function has no opening there, so it comes after the ones with nobody on file.
  if (notYet) rows = [...rows.filter((r) => !fullTimeLead(r.i, notYet)), ...rows.filter((r) => !!fullTimeLead(r.i, notYet))];
  const limit = clampLimit(a.limit, 10, 25);
  const offset = Math.max(0, Math.floor(Number(a.offset) || 0));
  const page = rows.slice(offset, offset + limit);
  return {
    total: rows.length,
    showing: page.length,
    ...(offset + page.length < rows.length ? { next_offset: offset + page.length } : {}),
    companies: page.map((r) => {
      const e = hire ? hireOfRow(r, hire.fns, hire.within) : null;
      const led = notYet ? fullTimeLead(r.i, notYet) : null;
      return { ...companySummary(r.i), ...(e ? { recent_hire: recentHireOut(r.i, e) } : {}), ...(led ? { no_function_yet_note: `${ledFullTimeWords(notYet!, led)} (company website)` } : {}) };
    }),
    ...(rows.length === 0
      ? {
          note: q
            ? "Nothing matched. Search reads company names, functions and industries, and the facts you can see. Names, roles and rates stay locked until unlocked, so search can't read them."
            : hire && hire.within > 0
              ? "Nothing matched these filters. Try a longer hired_within_months (12 or 24), another hired_function, or fewer filters."
              : "Nothing matched these filters. Try fewer.",
        }
      : {}),
  };
}

/**
 * find_company: a company by its exact full name or website, as the app's search finds one (the
 * action "find", with its daily limits). A company still locked for the member is named in this
 * answer only: the lists and get_company keep it locked, Unlock company keeps it named, and adding
 * a fact or a seat there makes it theirs. A part of a name finds nothing and says nothing more.
 */
export async function findCompanyByName(ctx: Ctx, a: { name: string }): Promise<ToolOut> {
  const text = String(a.name ?? "").trim();
  let r: Awaited<ReturnType<typeof perform>>;
  try {
    r = await perform(ctx.member.token, { type: "find", text }, ctx.origin, { asMember: true });
  } catch (e) {
    if (e instanceof ActionError) throw new ToolProblem(e.message);
    throw e;
  }
  forgetView(ctx.member.id);
  if (r.found === "none" || !r.ids?.length) {
    return { found: false, message: r.message, next: "Only a company's exact full name or its website finds it. Ask the member for the full name or the website, or add it with add_my_seat or add_company_fact." };
  }
  const patch = await viewPatch(ctx.member.token, r.ids, { asMember: true, found: true });
  const mv = await memberView(ctx.member);
  const base = publicBase() ?? ctx.origin;
  const companies: ToolOut[] = [];
  for (const i of deriveAll(patch?.companies ?? [])) {
    companies.push({
      ...companyOut(i, mv, base, await aboutOf(ctx, i)),
      ...(i.c.found
        ? {
            named_for_this_answer: true,
            note: `Named for this answer only, because the member typed its exact name. It stays locked in their lists and in get_company until they add what they know there, claim a seat there, or pay for something there (a job posting, who held a seat): then it stays named for them. Job postings, who held each seat and contact details cost what they cost at any company the member can see.`,
          }
        : {}),
    });
  }
  return { found: true, message: r.message, ...(r.findsLeft != null ? { lookups_left_today: r.findsLeft } : {}), companies };
}

export async function getCompany(ctx: Ctx, a: { company: string }): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const i = companyInfo(mv, a.company);
  return companyOut(i, mv, publicBase() ?? ctx.origin, await aboutOf(ctx, i));
}

export interface RoleArgs {
  function?: string;
  since_days?: number;
  industry?: string[];
  employees?: string[];
  revenue?: string[];
  hq?: string;
  fractional_friendly?: boolean;
  limit?: number;
}

function openRoles(mv: MemberView, a: RoleArgs) {
  const fn = a.function ? listValue("function", FUNCTIONS, a.function) : undefined;
  const { criteria, problems } = cleanCriteria({ function: fn, industry: a.industry, employees: a.employees, revenue: a.revenue, hq: a.hq, fractional_friendly: a.fractional_friendly });
  if (problems.length) throw new ToolProblem(problems.join(". "));
  const days = a.since_days === undefined || a.since_days === null ? null : Math.max(1, Math.min(365, Math.floor(Number(a.since_days) || 7)));
  const since = days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
  const alert: SavedSearch = { id: "", name: "", createdAt: "", ...criteria };
  const out: { i: CoInfo; e: EngagementRec; at: string }[] = [];
  for (const i of mv.infos)
    for (const e of i.engs) {
      if (!isOpenRole(e)) continue;
      const at = e.openedAt ?? e.opened ?? "";
      if (since && (!at || at < since)) continue;
      if (!alertMatches(alert, roleFacts(i, e))) continue;
      out.push({ i, e, at });
    }
  out.sort((x, y) => y.at.localeCompare(x.at));
  return { roles: out, criteria, days };
}

function roleOut(i: CoInfo, e: EngagementRec): ToolOut {
  const lockedRole = i.c.hidden ? LOCKED_WITH_COMPANY : LOCKED_ROLE;
  const facts = readAll(e.cells, { function: "function", role: "role", type: "type", status: "status", posted_rate: "rate", posted_hours: "hours", posting: "posting" }, (f) =>
    ROLE_BUNDLE.includes(f) ? lockedRole : LOCKED,
  );
  if (!facts.posted_rate) facts.posted_rate = NO_RATE;
  if (!facts.posting) facts.posting = NO_POSTING;
  const rate = e.cells.rate?.s === "locked" || e.cells.rate?.s === "value";
  const missing = i.c.hidden ? notOnFile(i) : undefined;
  const lead = ROLE_BUNDLE.find((f) => e.cells[f]?.s === "locked");
  return {
    seat_id: e.id,
    company_id: i.c.id,
    company: i.c.name,
    ...(i.c.hidden ? { company_hidden: true, about_the_company: i.teaser || undefined, ...(missing ? { not_on_file: missing } : {}) } : {}),
    ...facts,
    ...(e.opened ? { listed_since: dayOfIso(e.openedAt ?? e.opened) } : {}),
    ...(e.posted ? { posted: e.posted } : {}),
    ...(e.unseen ? { note: "Not seen in the last scan of its job board, so it may have closed." } : {}),
    ...(i.c.friendly.fractional ? { past_fractional_hires: i.c.friendly.fractional } : {}),
    company_fit: fitOf(i),
    fit_reason: fitWhy(i),
    unlock: i.c.hidden
      ? { cost: `${COMPANY_PRICE_SAY} open the company: ${companyBundle(i).what}`, call: { entity: "company", id: i.c.id, field: "identity" } }
      : lead
        ? {
            cost: `1 credit opens ${e.cells.posting?.s === "locked" ? "the job posting" : "what the posting gave"}${rate ? " and the posted rate" : ". No rate was posted"}`,
            call: { entity: "seat", id: e.id, field: lead },
          }
        : "nothing locked",
  };
}

export async function listOpenRoles(ctx: Ctx, a: RoleArgs): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const { roles, days } = openRoles(mv, a);
  const limit = clampLimit(a.limit, 15, 40);
  return {
    total: roles.length,
    showing: Math.min(limit, roles.length),
    ...(days ? { opened_in_the_last_days: days } : {}),
    roles: roles.slice(0, limit).map(({ i, e }) => roleOut(i, e)),
    ...(mv.view.scan?.lastOkAt ? { last_scan: dayOfIso(mv.view.scan.lastOkAt) } : {}),
  };
}

/* ---------- rates ---------- */

const statOut = (s: RateStat, unit: string): ToolOut =>
  s.median !== undefined
    ? { median: s.median, ...(s.p25 !== undefined ? { middle_half: [s.p25, s.p75] } : {}), people: s.n, unit, ...(s.withoutYours ? { note: "Your own rates are left out of what you see." } : {}) }
    : { shows_at: s.min, people_so_far: s.n, note: `Needs ${Math.max(0, s.min - s.n)} more before it shows a number.` };

export async function rateBenchmarks(ctx: Ctx, a: { function?: string; revenue?: string }): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const b = mv.view.benchmarks;
  if (!b) return { note: "Rate benchmarks aren't available right now." };
  const fn = a.function ? listValue("function", FUNCTIONS, a.function) : null;
  const rev = a.revenue ? (pickFrom(["All", ...RN_REVENUE], a.revenue) ?? listValue("revenue", RN_REVENUE, a.revenue)) : null;
  const asked = b.rows.filter((r) => (!fn || r.function === fn) && (!rev || r.revenue === rev));
  // Groups nobody is in yet say nothing, unless they are all there is.
  const live = asked.filter((r) => r.monthly.n > 0 || r.hourly.n > 0);
  const rows = live.length ? live : asked;
  // A revenue band with too few rates for a number still gets one: the same function across every client size, said so.
  const shows = (r: (typeof b.rows)[number]) => r.monthly.median !== undefined || r.hourly.median !== undefined;
  const wider = rev && rev !== "All" && !rows.some(shows) ? b.rows.filter((r) => (!fn || r.function === fn) && r.revenue === "All" && shows(r)) : [];
  return {
    about: "What fractionals charge, by function and the client's revenue at the time. Monthly retainers in dollars a month, hourly rates in dollars an hour. Each person counts once.",
    rows: [...rows, ...wider].map((r) => ({ function: r.function, client_revenue: r.revenue, monthly: statOut(r.monthly, "dollars a month"), hourly: statOut(r.hourly, "dollars an hour") })),
    ...(wider.length
      ? { note: `Not enough rates at ${rev} yet to show a number. The rows with client_revenue All are the same function across every client size.` }
      : rows.length
        ? {}
        : { note: "No group matches. Leave revenue out to see every band, or use revenue All." }),
  };
}

/* ---------- account ---------- */

function emailNote(mv: MemberView): string {
  if (!digestEnabled()) return "Email isn't set up on Merlin yet, so alerts don't arrive by email. Ask what's new any time: list_open_roles with since_days 7 shows this week's open roles.";
  if (!mv.view.me!.digest) return "Your weekly email is off, so new matches won't be emailed. Turn it on in Your credits on Merlin.";
  return "New matches come in your weekly email after each scan.";
}

export async function myAccount(ctx: Ctx): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const me = mv.view.me!;
  const seats = mySeats(mv.infos, me);
  const alerts = (await connectorState()).alerts[ctx.member.id] ?? [];
  return {
    name: me.name,
    ...(me.function ? { function: me.function } : {}),
    // The companies they want as clients. Empty parts mean any.
    ideal_fractional_profile: icpEmpty(me.icp)
      ? "Not set. The member sets it in Your profile on Merlin."
      : { industries: me.icp!.industries, employees: me.icp!.employees, revenue: me.icp!.revenue, countries: me.icp!.countries, summary: icpLabel(me.icp) },
    credits: me.credits,
    ...(me.owed ? { owed: me.owed } : {}),
    earned_today: `${me.earned24h} of ${me.earnCap}`,
    ...(me.earnResetsAt ? { earning_opens_again_at: me.earnResetsAt } : {}),
    ...(me.unlocksLeft !== null && me.unlocksLeft !== undefined ? { unlocks_left_today: me.unlocksLeft } : {}),
    ...(me.sellEarnLeft !== undefined ? { pick_list_answers_that_still_earn_today: me.sellEarnLeft } : {}),
    facts_added: me.added,
    facts_unlocked: me.unlocked,
    how_credits_work:
      "Adding a missing fact earns 1 credit (up to 25 a day). Seeing a fact someone else added costs 1: who held a seat comes with the role they held, and a person's name with their title, for that one credit. A fractional you invite earns you both 10 credits when they add their first fact. Your own seats are free to you.",
    seats_on_file: seats.map((s) => ({ seat_id: s.e.id, company_id: s.i.c.id, company: s.i.c.name, function: shown(s.e.cells.function), missing: s.missing.filter((f) => f !== "introducedBy").map((f) => outKey(SEAT_KEYS, f)) })),
    following: mv.infos.filter((i) => i.c.following).map((i) => ({ id: i.c.id, name: i.c.name })),
    saved_searches: alerts.length,
    // Their plan, only while billing is live. No price: the member sees prices on Merlin.
    ...(me.plan
      ? {
          plan:
            me.plan.name === "trial"
              ? `Pro trial, ${me.plan.trialDaysLeft} ${me.plan.trialDaysLeft === 1 ? "day" : "days"} left. It ends on Free with no charge. To keep Pro: ${upgradeUrl(publicBase() ?? ctx.origin, "claude_account")}`
              : me.plan.name === "pro"
                ? me.plan.proStartsAt
                  ? `Pro, ${me.plan.interval === "year" ? "yearly" : "monthly"}. It starts with its first charge on ${me.plan.proStartsAt.slice(0, 10)}, when the trial ends.`
                  : "Pro"
                : `Free: ${me.plan.limits.savedViews} saved search and ${me.plan.limits.claudePerDay} requests a day here. Plans: ${upgradeUrl(publicBase() ?? ctx.origin, "claude_account")}`,
        }
      : {}),
    weekly_email: emailNote(mv),
    // [google network] one line, counts only: "Google connected: 12 companies you know people at". Never the people.
    ...(await accountLine(ctx.member.id).catch(() => ({}))),
    // The app's public address (RN_PUBLIC_URL, once a custom domain is set), else the address the connector was reached on.
    invite_link: `${publicBase() ?? ctx.origin}/?ref=${inviteCode(ctx.member.id)}`,
  };
}

/* ---------- unlocking ---------- */

const ENTITY: Record<string, Entity> = { company: "company", seat: "engagement", engagement: "engagement", person: "contact", contact: "contact" };

export function unlockItems(mv: MemberView, entityRaw: string, id: string, fieldRaw: string): { items: FactRef[]; what: string; target: { entity: Entity; id: string } } {
  const found = unlockFind(mv, entityRaw, id, fieldRaw);
  return { ...found, target: { entity: found.entity ?? ENTITY[entityRaw], id: found.id } };
}
function unlockFind(mv: MemberView, entityRaw: string, id: string, fieldRaw: string): { items: FactRef[]; what: string; id: string; entity?: Entity } {
  const entity = ENTITY[entityRaw];
  if (!entity) throw new ToolProblem('entity must be "company", "seat" or "person".');
  const all = fieldRaw === "everything" || fieldRaw === "all";
  if (entity === "company") {
    const i = companyInfo(mv, id);
    if (all) return { items: i.locked, what: `everything locked at ${i.c.hidden ? "this company" : i.c.name}`, id: i.c.id };
    const field = ["identity", "name"].includes(fieldRaw) ? "identity" : fieldFrom(COMPANY_KEYS, fieldRaw);
    if (!field) throw new ToolProblem(`On a company, field is "everything", "identity" (a locked company's name) or one of: ${Object.keys(COMPANY_KEYS).join(", ")}`);
    if (field === "identity" || (i.c.hidden && ["website", "linkedin", "about"].includes(field)))
      return { items: i.c.hidden ? [{ entity: "company", id: i.c.id, field: "identity" }] : [], what: i.c.hidden ? `the company and its open roles: ${companyBundle(i).what}` : "the company and its open roles", id: i.c.id };
    return { items: i.c.cells[field]?.s === "locked" ? [{ entity: "company", id: i.c.id, field }] : [], what: `the ${outKey(COMPANY_KEYS, field)}`, id: i.c.id };
  }
  if (entity === "engagement") {
    const { e, i } = seatInfo(mv, id);
    const hidden = !!i.c.hidden;
    const company: FactRef = { entity: "company", id: i.c.id, field: "identity" };
    if (all) {
      // Who held the seat and their role are one purchase: the seat holder stands for both.
      const items = lockedInEngagement(e).filter((t) => !(t.entity === "engagement" && t.field === "role" && seatBundled(e) && e.cells.operator?.s === "locked"));
      // At a locked company everything paid on the seat opens after the company: it comes first.
      const waits = hidden && items.length > 0;
      return waits ? { items: [company, ...items], what: "the company first, then everything locked on this seat", id: e.id } : { items, what: "everything locked on this seat", id: e.id };
    }
    // list_open_roles calls them posted_rate and posted_hours.
    const field = fieldFrom(SEAT_KEYS, ({ posted_rate: "rate", posted_hours: "hours" } as Record<string, string>)[fieldRaw] ?? fieldRaw);
    if (!field) throw new ToolProblem(`On a seat, field is "everything" or one of: ${Object.keys(SEAT_KEYS).join(", ")}`);
    // An open role at a locked company: its posting, rate and hours come with the company (one purchase).
    if (hidden && isOpenRole(e) && ROLE_BUNDLE.includes(field))
      return { items: [company], what: `the company and its open roles: ${companyBundle(i).what}`, id: i.c.id, entity: "company" };
    // Who held the seat and the role they held: one purchase, whichever was asked for. After the company at a locked one.
    if (seatBundled(e) && SEAT_PAIR.includes(field)) {
      const lead = SEAT_PAIR.find((f) => e.cells[f]?.s === "locked");
      if (lead && hidden) throw new ToolProblem(COMPANY_FIRST);
      return { items: lead ? [{ entity: "engagement", id: e.id, field: lead }] : [], what: "who held this seat and the role they held", id: e.id };
    }
    // Anything else paid on a seat at a locked company opens after the company too.
    if (hidden && e.cells[field]?.s === "locked") throw new ToolProblem(COMPANY_FIRST);
    return { items: e.cells[field]?.s === "locked" ? [{ entity: "engagement", id: e.id, field }] : [], what: `the ${outKey(SEAT_KEYS, field)}`, id: e.id };
  }
  const { i, p } = personInfo(mv, id);
  const hidden = !!i.c.hidden;
  if (all) {
    const items = lockedOf("contact", p.id, p.cells);
    // At a locked company a person opens after the company, and their contact details after their name and title.
    if (hidden && items.length) return { items: [{ entity: "company", id: i.c.id, field: "identity" }, ...items], what: "the company first, then everything locked about this person", id: p.id };
    return { items, what: personUnseen(p) && items.length > 1 ? "this person's name and title, then the rest locked about them" : "everything locked about this person", id: p.id };
  }
  const field = fieldFrom(PERSON_KEYS, fieldRaw);
  if (!field) throw new ToolProblem(`On a person, field is "everything" or one of: ${Object.keys(PERSON_KEYS).join(", ")}`);
  if (p.cells[field]?.s === "locked") {
    if (hidden) throw new ToolProblem(COMPANY_FIRST);
    if (CONTACT_DETAILS.includes(field) && personUnseen(p)) throw new ToolProblem(NAME_FIRST);
  }
  // The name and the title are one purchase: either one asks for both.
  const bundle = PERSON_BUNDLE.includes(field);
  return { items: p.cells[field]?.s === "locked" ? [{ entity: "contact", id: p.id, field }] : [], what: bundle ? "the person's name and title" : `the person's ${field}`, id: p.id };
}

/** One record, read fresh after a change, to show what the member can now see. */
async function afterChange(ctx: Ctx, entity: Entity, id: string): Promise<ToolOut | undefined> {
  forgetView(ctx.member.id);
  const mv = await memberView(ctx.member);
  const base = publicBase() ?? ctx.origin;
  if (entity === "company") {
    const i = mv.byId.get(id);
    return i ? { company: companyOut(i, mv, base, await aboutOf(ctx, i)) } : undefined;
  }
  if (entity === "engagement") {
    const i = mv.bySeat.get(id);
    const e = i?.engs.find((x) => x.id === id);
    return i && e ? { company: { id: i.c.id, name: i.c.name }, seat: seatOut(e, i, mv, base) } : undefined;
  }
  const i = mv.byPerson.get(id);
  const p = i?.people.find((x) => x.p.id === id);
  return i && p ? { company: { id: i.c.id, name: i.c.name }, person: personOut(p.p, p.e?.id, !!i.c.hidden) } : undefined;
}

export async function unlock(ctx: Ctx, a: { entity: string; id: string; field: string; confirm?: boolean }): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const me = mv.view.me!;
  const { items, what, target } = unlockItems(mv, String(a.entity ?? ""), String(a.id ?? ""), String(a.field ?? ""));
  if (!items.length) return { spent: 0, message: `Nothing to unlock: you can already see ${what}, or nobody has added it yet.`, credits: me.credits };
  const capped = items.slice(0, 60);
  const action: Action = capped.length === 1 ? { type: "unlock", ...capped[0] } : { type: "unlockMany", items: capped };
  const more = items.length > capped.length ? ` This covers the first 60 of ${items.length}. Unlock again for the rest.` : "";
  try {
    if (!a.confirm) {
      const r = await perform(ctx.member.token, action, ctx.origin, { dryRun: true, asMember: true });
      const cost = r.spent ?? 0;
      return {
        confirmed: false,
        would_spend: cost,
        credits_now: me.credits,
        would_open: what,
        message: `${cost === 0 ? "This costs nothing." : `This would spend ${cost} credit${cost > 1 ? "s" : ""}.`} Nothing was spent.${more}`,
        next: "Ask the member if they want to spend this. Only if they say yes, call unlock again with the same arguments and confirm: true.",
      };
    }
    const r = await perform(ctx.member.token, action, ctx.origin, { asMember: true });
    const shownNow = await afterChange(ctx, target.entity, target.id);
    return { confirmed: true, message: r.message + more, credits_left: r.me?.credits, ...(r.me?.unlocksLeft != null ? { unlocks_left_today: r.me.unlocksLeft } : {}), ...shownNow };
  } catch (e) {
    if (e instanceof ActionError) throw new ToolProblem(e.message);
    throw e;
  }
}

/* ---------- adding ---------- */

async function act(ctx: Ctx, action: Action) {
  try {
    // As a member sees it (an admin too, the same as the connector's view): a hidden company stays hidden.
    const r = await perform(ctx.member.token, action, ctx.origin, { asMember: true });
    forgetView(ctx.member.id);
    return r;
  } catch (e) {
    if (e instanceof ActionError) throw new ToolProblem(e.message);
    throw e;
  }
}
const creditsLine = (r: Awaited<ReturnType<typeof perform>>) => ({ credits: r.me?.credits, ...(r.me ? { earned_today: r.me.earned24h } : {}) });

const PICKS: Record<string, readonly string[]> = {
  industry: RN_INDUSTRIES, employees: RN_EMPLOYEES, revenue: RN_REVENUE, businessModel: BUSINESS_MODELS, motion: RN_MOTIONS, dealSize: RN_DEAL_SIZES, salesCycle: RN_SALES_CYCLES, ownership: OWNERSHIP_TYPES,
};

export async function addCompanyFact(ctx: Ctx, a: { company: string; field: string; value: string }): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const i = companyInfo(mv, a.company);
  const field = fieldFrom(COMPANY_KEYS, String(a.field ?? ""));
  if (!field || field === "about") throw new ToolProblem(`field is one of: ${Object.keys(COMPANY_KEYS).filter((k) => k !== "about").join(", ")}`);
  const value = PICKS[field] ? listValue(outKey(COMPANY_KEYS, field), PICKS[field], a.value) : String(a.value ?? "");
  const r = await act(ctx, { type: "fill", entity: "company", id: i.c.id, field, value });
  return { message: r.message, ...creditsLine(r) };
}

export async function addPerson(
  ctx: Ctx,
  a: { company: string; seat_id?: string; name: string; title?: string; relationship?: string; email?: string; phone?: string; linkedin?: string },
): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const i = companyInfo(mv, a.company);
  if (a.seat_id && !i.engs.some((e) => e.id === a.seat_id)) throw new ToolProblem("That seat isn't at this company. Use get_company to see its seats.");
  const person: Record<string, string> = { name: String(a.name ?? "") };
  for (const k of ["title", "email", "phone", "linkedin"] as const) if (a[k]) person[k] = String(a[k]);
  if (a.relationship) person.relationship = listValue("relationship", RELATIONSHIPS, a.relationship);
  const r = await act(ctx, { type: "addPerson", companyId: i.c.id, engagementId: a.seat_id ?? null, person });
  return { message: r.message, person_id: r.id, ...creditsLine(r) };
}

export interface SeatArgs {
  company?: string;
  website?: string;
  seat_id?: string;
  /** With seat_id: claim a seat Revenue Nomad found (claimable) as the member's own. */
  claim?: boolean;
  function?: string;
  role?: string;
  type?: string;
  status?: string;
  start?: string;
  end?: string;
  why_hired?: string;
  sourced?: string;
  pricing?: string;
  rate?: string;
  rate_visibility?: "members" | "benchmarks_only";
  hours?: string | number;
  revenue_then?: string;
  employees_then?: string;
  /** Several of WHY_NOW: a list, or one string with commas. */
  why_now?: string | string[];
  end_reason?: string;
  /** The member's own note (INTRO_FIELD): kept to them, never sent back by any tool. */
  introduced_by?: string;
}

const SEAT_PICKS: Record<string, readonly string[]> = {
  function: FUNCTIONS, type: ENGAGEMENT_TYPES, status: STATUSES, reason: HIRE_REASONS, sourced: SOURCED_VIA, pricing: PRICING_MODELS, revenue: RN_REVENUE, employees: RN_EMPLOYEES, endReason: END_REASONS,
};

function seatFields(a: SeatArgs): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, field] of Object.entries(SEAT_KEYS)) {
    if (field === "operator" || field === "posting" || field === "rate") continue;
    const raw = (a as Record<string, unknown>)[k];
    if (raw === undefined || raw === null || raw === "") continue;
    // Why now takes several: each one from the list.
    if (field === "whyNow") {
      const picks = (Array.isArray(raw) ? raw : String(raw).split(/\s*[,;]\s*/)).map((x) => String(x).trim()).filter(Boolean);
      if (picks.length) out[field] = picks.map((x) => listValue(k, WHY_NOW, x)).join(", ");
      continue;
    }
    out[field] = SEAT_PICKS[field] ? listValue(k, SEAT_PICKS[field], raw) : String(raw);
  }
  return out;
}

export async function addMySeat(ctx: Ctx, a: SeatArgs): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const me = mv.view.me!;
  const fields = seatFields(a);
  const rate = a.rate !== undefined && a.rate !== null && String(a.rate).trim() ? String(a.rate).trim() : null;
  if (rate && !a.rate_visibility)
    throw new ToolProblem(
      'Ask the member who can see this rate, then send rate_visibility. "members": members who unlock it see it on the seat. "benchmarks_only": it only counts in the rate benchmarks and is never shown with their name or the seat.',
    );
  const pricing = fields.pricing ?? null;
  // "Who introduced you": the member's own note, saved apart from the seat's facts and never sent back.
  const introNote = a.introduced_by !== undefined && a.introduced_by !== null && String(a.introduced_by).trim() ? String(a.introduced_by).trim() : null;
  const saveIntro = async (engagementId: string) => {
    if (!introNote) return null;
    const r = await act(ctx, { type: "fill", entity: "engagement", id: engagementId, field: "introducedBy", value: introNote });
    return r.message;
  };
  const shareBench = async (engagementId: string) => {
    if (!rate || a.rate_visibility !== "benchmarks_only") return null;
    const kind = pricing === "Hourly" || /\/\s*h(ou)?r|hourly|an hour|per hour/i.test(rate) ? "Hourly" : "Monthly retainer";
    const r = await act(ctx, { type: "benchRate", engagementId, pricing: kind, rate });
    return r.message;
  };

  if (a.seat_id) {
    // Facts on a seat already on file. Only its seat holder may add them (the app's rule): perform says so otherwise.
    const { e } = seatInfo(mv, a.seat_id);
    const msgs: string[] = [];
    let last: Awaited<ReturnType<typeof perform>> | null = null;
    const todo = Object.entries(fields);
    if (rate && a.rate_visibility === "members") todo.push(["rate", rate]);
    // A seat Revenue Nomad found, with nobody on it: claiming it makes it the member's, and then their facts go in.
    if (a.claim) {
      if (!e.claimable) throw new ToolProblem(e.yours ? "That seat is already the member's." : "Only a seat Revenue Nomad found that nobody has claimed can be claimed.");
      last = await act(ctx, { type: "claimSeat", engagementId: e.id });
      msgs.push(last.message);
    } else if (e.claimable) throw new ToolProblem("Nobody has claimed this seat yet. If it is the member's own, ask them, then send claim: true.");
    if (!todo.length && !rate && !a.claim && !introNote) throw new ToolProblem("Send at least one fact about the seat.");
    for (const [field, value] of todo) {
      last = await act(ctx, { type: "fill", entity: "engagement", id: e.id, field, value });
      msgs.push(last.message);
    }
    const intro = await saveIntro(e.id);
    if (intro) msgs.push(intro);
    const bench = await shareBench(e.id);
    if (bench) msgs.push(bench);
    return { message: msgs.join(" "), seat_id: e.id, ...(last ? creditsLine(last) : {}) };
  }

  if (!a.company) throw new ToolProblem("Send the company (its name, or the id from search_companies), or seat_id to add facts to a seat of yours already on file.");
  let name = String(a.company).trim();
  let website = a.website;
  const known = mv.byId.get(name);
  if (known) {
    if (known.c.hidden) throw new ToolProblem("That company is locked for you, so send its real name in company instead of the id.");
    name = known.c.name;
    website ??= shown(known.c.cells.website) ?? undefined;
  }
  if (!fields.function && !fields.role) throw new ToolProblem("Add the seat's function or its role too, so members can tell what the work was.");
  if (rate && a.rate_visibility === "members") fields.rate = rate;
  // The member names themselves as the seat holder: the only seat a member can add (SEAT_SELF_ONLY).
  const r = await act(ctx, {
    type: "add",
    company: name,
    ...(website ? { website } : {}),
    newEngagement: true,
    engagementFields: { ...fields, operator: me.name },
    operatorMemberId: "me",
  });
  const intro = r.id ? await saveIntro(r.id) : null;
  const bench = r.id ? await shareBench(r.id) : null;
  return { message: [r.message, intro, bench].filter(Boolean).join(" "), seat_id: r.id, ...creditsLine(r) };
}

export async function followCompany(ctx: Ctx, a: { company: string; on?: boolean }): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const i = companyInfo(mv, a.company);
  const r = await act(ctx, { type: "follow", companyId: i.c.id, on: a.on !== false });
  return { message: r.message };
}

/* ---------- alerts ---------- */

export interface AlertArgs {
  action: "save" | "list" | "delete";
  id?: string;
  name?: string;
  function?: string;
  industry?: string[];
  employees?: string[];
  revenue?: string[];
  hq?: string;
  fractional_friendly?: boolean;
}

export async function alerts(ctx: Ctx, a: AlertArgs): Promise<ToolOut> {
  const mv = await memberView(ctx.member);
  const mine = (await connectorState()).alerts[ctx.member.id] ?? [];
  const counts = (x: SavedSearch) => {
    const all = openRoles(mv, { function: x.function, industry: x.industry, employees: x.employees, revenue: x.revenue, hq: x.hq, fractional_friendly: x.fractionalFriendly });
    // A view saved in the app can also name several functions or countries.
    if (x.functions?.length || x.country?.length) all.roles = all.roles.filter(({ i, e }) => alertMatches(x, roleFacts(i, e)));
    const week = all.roles.filter((r) => r.at >= new Date(Date.now() - 7 * 86_400_000).toISOString()).length;
    return { all, week };
  };
  const show = (x: SavedSearch) => {
    const { all, week } = counts(x);
    const { id, name, createdAt, place, email, ...criteria } = x;
    return {
      id,
      name,
      criteria,
      saved: dayOfIso(createdAt),
      ...(place !== undefined ? { saved_in: "the Merlin app" } : {}),
      weekly_email: email !== false,
      open_now: all.roles.length,
      new_this_week: week,
    };
  };
  if (a.action === "list") return { saved_searches: mine.map(show), delivery: emailNote(mv) };
  if (a.action === "delete") {
    const gone = await updateConnector((c) => {
      const list = c.alerts[ctx.member.id] ?? [];
      const next = list.filter((x) => x.id !== a.id);
      c.alerts[ctx.member.id] = next;
      return next.length < list.length;
    });
    if (!gone) throw new ToolProblem("No saved search with that id. Use alerts with action list to see them.");
    return { message: "Deleted that saved search." };
  }
  if (a.action !== "save") throw new ToolProblem('action is "save", "list" or "delete".');
  const { criteria, problems } = cleanCriteria(a);
  if (problems.length) throw new ToolProblem(problems.join(". "));
  if (!Object.keys(criteria).length) throw new ToolProblem("Say what to look for: a function, an industry, a size, a revenue band or a place.");
  // One list with the app's saved views: a search the member has already is not saved twice (lib/hunt.ts sameView).
  const dup = sameView(mine, { place: null, criteria });
  if (dup) return { message: `You saved this search already, as "${dup.name}".`, saved_search: show(dup), delivery: emailNote(mv) };
  if (mine.length >= ALERT_MAX) throw new ToolProblem(`You have ${ALERT_MAX} saved searches, which is the most. Delete one first.`);
  // Free keeps one saved view (lib/billing). Pro watches as many as they want.
  if (await savedViewsFull(ctx.member.id, mine.length))
    throw new ToolProblem(`On Merlin's Free plan you keep 1 saved search, and you have it. Pro watches as many markets as you want: ${upgradeUrl(ctx.origin, "claude_views")}`);
  const saved: SavedSearch = {
    id: `al_${randomBytes(6).toString("base64url")}`,
    name: String(a.name ?? "").replace(/[\u0000-\u001f<>]/g, "").trim().slice(0, 100) || describeAlert(criteria),
    ...criteria,
    createdAt: new Date().toISOString(),
  };
  await updateConnector((c) => {
    c.alerts[ctx.member.id] = [...(c.alerts[ctx.member.id] ?? []), saved].slice(-ALERT_MAX);
  });
  const { all } = counts(saved);
  return {
    message: `Saved "${saved.name}".`,
    saved_search: show(saved),
    open_now: all.roles.slice(0, 5).map(({ i, e }) => roleOut(i, e)),
    delivery: emailNote(mv),
  };
}

/* ---------- [google network] the member's own network, from their own Claude (lib/google) ---------- */

/** save_my_network: conclusions from the member's own inbox, read by their own Claude. Private, no credits. */
export async function saveMyNetwork(ctx: Ctx, a: { entries: unknown }): Promise<ToolOut> {
  try {
    return await saveFromClaude(ctx.member, a.entries);
  } catch (e) {
    if (e instanceof NetworkProblem) throw new ToolProblem(e.message);
    throw e;
  }
}

/** my_network: the member's own network on Merlin, companies with warmth. Never anyone else's, never the people. */
export async function myNetwork(ctx: Ctx): Promise<ToolOut> {
  try {
    return await myNetworkForClaude(ctx.member);
  } catch (e) {
    if (e instanceof NetworkProblem) throw new ToolProblem(e.message);
    throw e;
  }
}
