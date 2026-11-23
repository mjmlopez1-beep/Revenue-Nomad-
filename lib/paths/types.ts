/**
 * Smart ways in (lib/paths): the member's best ways into a company through people they already know,
 * found across their own LinkedIn connections (the Connections.csv they upload), their own Google
 * network (lib/google) and the Revenue Nomad members they have messaged, paired with what Merlin
 * knows about seats, leaders and members.
 *
 * Pure: no I/O, relative imports only, so the server, the app and the checks all read it.
 *
 * What is kept (State.paths[memberId]), and nothing else:
 *  - the member's LinkedIn connections as they uploaded them: name, company, position, the day
 *    they connected, the profile's address and the email when LinkedIn gave one;
 *  - the member's own contacts CSV, only the columns they picked: name, company, title, email
 *    (lib/paths/csv.ts parseContacts; the browser sends only those columns);
 *  - the people they marked "Not a relationship" (their own keys, nothing else);
 *  - when they uploaded a file (the last few times, for the daily limit).
 *
 * Each source works on its own (the owner's decision): the LinkedIn file and the CSV need no Google,
 * and Google needs neither. Together they merge into one list of people the member knows.
 * Everything else (the matches, the paths, the counts) is worked out when it is asked for and never
 * stored, so deleting the import deletes all of it. It is the member's alone, at the same level as
 * their Google network: never shown to another member or an admin, never in the export, never used
 * for anyone else's results, and never sent through the connector by name.
 */
import type { Warmth } from "../google/types";
import type { IntroPlanView } from "./intro";
import type { OddsBand, PathBand, Zone } from "./rank";

/* ---------- what is kept ---------- */

/**
 * One LinkedIn connection as kept: f first name, l last name, c company, p position, d the day
 * connected (YYYY-MM-DD), u the profile's slug (linkedin.com/in/<u>), e an email. Short keys: a
 * member can have 30,000 of these.
 */
export interface LinkedInRow {
  f: string;
  l: string;
  c?: string;
  p?: string;
  d?: string;
  u?: string;
  e?: string;
}

export interface LinkedInStore {
  /** When the file was read (ISO). */
  at: string;
  rows: LinkedInRow[];
  /** Rows the file had that were not kept (no name, a duplicate, over the limit). A count only. */
  skipped: number;
  /** The file has names and profile links only (LinkedIn's files from December 2026: no company, title or email). */
  namesOnly?: true;
}

/**
 * One row of the member's own contacts CSV as kept: n name, c company, t title, e email. Only the
 * columns the member picked; every other column of their file never reaches Merlin.
 */
export interface ContactRow {
  n: string;
  c?: string;
  t?: string;
  e?: string;
}

export interface ContactsStore {
  /** When the file was read (ISO). */
  at: string;
  rows: ContactRow[];
  /** Rows not kept (no name, a duplicate, over the limit). A count only. */
  skipped: number;
}

export interface MemberPaths {
  linkedin?: LinkedInStore;
  /** The member's own contacts CSV (any list with a name and a company). */
  csv?: ContactsStore;
  /** People the member said are "Not a relationship": their own keys (KnownPersonView.key), at most AWAY_MAX. */
  away?: string[];
  /** When the member uploaded a file (ISO), the last IMPORTS_DAILY: the daily limit. Not derived from any file. */
  imports?: string[];
  /** Suggested additions (lib/paths/suggest.ts, RN_SUGGEST): the member's "no" and "added" keys, one-way hashes, never a name. */
  suggest?: { skip: string[]; added: string[] };
}

/** State.paths: member id -> what they uploaded. Nobody else's answer ever reads another member's entry. */
export type PathsState = Record<string, MemberPaths>;

/* ---------- limits ---------- */

/** LinkedIn's own cap on connections. */
export const ROWS_MAX = 30_000;
/** The file, as uploaded. A full 30,000-row export is about 4 MB. */
export const FILE_MAX_BYTES = 8 * 1024 * 1024;
/** Uploads a member can make in any rolling 24 hours (the LinkedIn file and a CSV together). */
export const IMPORTS_DAILY = 3;
/** People a member can set aside as "Not a relationship". */
export const AWAY_MAX = 2000;
/** Targets "Your hidden paths" lists. */
export const TARGETS_MAX = 20;
/** Paths a company's record shows. */
export const COMPANY_PATHS_MAX = 8;

/* ---------- what the app gets ---------- */

/** Where Merlin knows the person from: the member's own LinkedIn file, their own Google network, a member they messaged, their own contacts CSV. */
export type PathSource = "linkedin" | "google" | "messages" | "csv";

/**
 * The owner's default (2026-11, changeable): what comes from the member's own files (their LinkedIn
 * connections file or a contacts CSV) never says WHICH locked company it matched. At a company still
 * locked for them, a match from a file shows as a count only ("You know someone at 4 locked
 * companies. Open them to see who."); the company and the person are named once they open it.
 * Google's network names the companies it reads from the member's own mail and calendar, as before.
 */
export const fromFile = (src: readonly PathSource[]) => src.includes("linkedin") || src.includes("csv");
/**
 * The switch for that default: RN_LOCKED_MATCHES=show brings back the earlier behaviour (a locked
 * company's ways in from the files shown by its facts and id). Anything else, or unset, is counts only.
 */
export const lockedMatchesHidden = () => (typeof process !== "undefined" ? process.env.RN_LOCKED_MATCHES ?? "" : "").trim().toLowerCase() !== "show";
/** The count line for matches held back at locked companies, or null for none. */
export const lockedKnowWords = (n: number) => (n > 0 ? `You know someone at ${n} locked ${n === 1 ? "company" : "companies"}. Open ${n === 1 ? "it" : "them"} to see who.` : null);
/** The same for ways in held back at locked companies. */
export const lockedWaysWords = (n: number) => (n > 0 ? `You have a way in at ${n} locked ${n === 1 ? "company" : "companies"} through people you know. Open ${n === 1 ? "it" : "them"} to see who.` : null);

/**
 * The kinds of way in, strongest first.
 *  1st degree, someone you know:
 *   leads    is a leader at the company now (their title reads like one who hires or signs);
 *   hired    hired (or managed) a fractional there, as Merlin has them on a seat;
 *   seat     holds, or held, a fractional seat there;
 *   works    works there now.
 *  2nd degree, someone you know who knows someone there:
 *   overlap  held a seat at another company at the same time as someone who holds or held one here;
 *   colleague works now where someone who holds or held a seat here also holds one now;
 *   prevco   works now where someone who holds or held a seat here (or one of its leaders) worked before;
 *   client   a member in the Fractionals directory who serves the company, and you both worked with one client.
 */
export type PathKind = "leads" | "hired" | "seat" | "works" | "overlap" | "colleague" | "prevco" | "client";
export const FIRST_DEGREE: readonly PathKind[] = ["leads", "hired", "seat", "works"];

/** The person the path goes through, as the member's own list has them. */
export interface PathVia {
  /** The member's own key for this person (their contact's), for "Why Jake" (PathsView.people); null through the Fractionals directory. */
  key: string | null;
  name: string;
  first: string;
  title: string | null;
  src: PathSource[];
  /** Their warmth from the member's own Google network or messages; null for a LinkedIn connection alone. */
  warmth: Warmth | null;
  /** Why, in words: "4 meetings, last in March", "LinkedIn connection since 2021". */
  why: string;
  email: string | null;
  /** Their LinkedIn profile (the address the member's own file gave). */
  linkedin: string | null;
  /** A Revenue Nomad member: the note can go on Merlin. */
  member: boolean;
}

export interface PathView {
  /** Stable within one answer, for the page's keys. */
  key: string;
  kind: PathKind;
  degree: 1 | 2;
  /** 1 to 100: every 1st degree path scores above every 2nd degree one. */
  score: number;
  strength: "Strong" | "Good" | "Worth a try";
  /** The one plain sentence: "Dana Reyes (your LinkedIn connection) worked with Acme's fractional RevOps lead at Brightloop in 2023." */
  line: string;
  /** The next action: "Ask Dana for an intro." */
  action: string;
  via: PathVia;
  /** A note in the member's own voice, to send themselves. */
  note: { subject: string; body: string };
}

/** One company the member has a way into, for "Your hidden paths". */
export interface TargetView {
  /** The company's public id. */
  id: string;
  /** Its name, when the member can see it; null for a company still locked for them. */
  name: string | null;
  /** Its free facts: "SaaS · 51–200". */
  facts: string;
  /** In their Crystal Ball, and the saved view it matches (its name), when it does. */
  ball: boolean;
  view: string | null;
  best: PathView;
  /** Ways in there, the best included. */
  count: number;
  /** How many of them go through someone the member knows directly. */
  first: number;
}

export interface LinkedInInfo {
  at: string;
  /** Connections kept, and how many work at a company on Merlin. */
  rows: number;
  matched: number;
  skipped: number;
  /** The file has names and profile links only (LinkedIn's files from December 2026). The LinkedIn file only. */
  namesOnly?: boolean;
  /** Connections placed by their profile link alone (the same profile as a person on file or a member). A count only. The LinkedIn file only. */
  byLink?: number;
}

export interface PathsView {
  on: true;
  linkedin: LinkedInInfo | null;
  /** The member's own contacts CSV, when they added one: the same counts as the LinkedIn file. */
  csv: LinkedInInfo | null;
  /** Google is a source on this Merlin (RN_GOOGLE): it can be connected. The LinkedIn file and a CSV work either way. */
  googleOn: boolean;
  /** Uploads left in the rolling day. */
  importsLeft: number;
  /** The best targets first (Crystal Ball and saved views), at most TARGETS_MAX. */
  targets: TargetView[];
  /** Public company id -> ways in there, every company with one, and how many are 1st degree. */
  counts: Record<string, { n: number; first: number }>;
  /**
   * The people the member knows who can introduce them to companies in their own list (Crystal
   * Ball, saved views, their profile), strongest first, with the specific ask (lib/paths/intro.ts).
   */
  people: IntroPlanView[];
  /** Locked companies where ways in from the member's own files are held back until they open them (fromFile): a count only, never which. */
  lockedWays: number;
}
export type PathsAnswer = PathsView | { on: false };

/**
 * GET /api/paths?known=1: everyone the member knows at a company on Merlin, from each of their own
 * sources, merged into one entry a person (the People page's "People I know" and the person bubble's
 * "How you know them"). The member's own words only: the name, title and email are what their own
 * file, contacts or messages say. Merlin's own records keep their locks: `record` only says which
 * record on file is this person (matched precisely, lib/paths/find.ts leadersOfContact), never what
 * that record holds.
 */
export interface KnownPersonView {
  /** The member's own key for this person (stable across reads). */
  key: string;
  name: string;
  title: string | null;
  /** The company on Merlin they are at (its public id), or null for a member at no company on file. */
  company: string | null;
  src: PathSource[];
  /** How warm, from Google or messages on Merlin; null for a file alone. */
  warmth: Warmth | null;
  /** Why, in words: "4 meetings, last in March", "LinkedIn connection since 2021", "In your contacts file". */
  why: string;
  /** The last meeting, email or message (YYYY-MM-DD), when Merlin saw one. Never what was said. */
  last: string | null;
  /** "Meeting", "Email", "Message" for the last touch, or null. */
  lastKind: "Meeting" | "Email" | "Message" | null;
  /** Their email and public profile as the member's own file gave them, or null. */
  email: string | null;
  profile: string | null;
  /** The person record on Merlin this is (PersonRec.id), when one matches precisely. */
  record: string | null;
  /** A Revenue Nomad member (their public member id), for their Fractionals card. */
  member: string | null;
  /** The member said "Not a relationship": kept out of ways in, listed under Set aside. */
  away: boolean;
}

export interface KnownView {
  people: KnownPersonView[];
  /** Locked companies where someone from the member's own files works (fromFile): a count only, never which. They show once opened. */
  locked: number;
  /** What each source brought, as counts. */
  sources: { google: boolean; linkedin: number | null; csv: number | null; messages: number };
}

/** GET /api/paths?company=: one company's ways in, best first. */
export interface CompanyPathsView {
  id: string;
  paths: PathView[];
}

/* ---------- words the app shares ---------- */

/** "2 ways in through people you know": Crystal Ball's chip. */
export const waysWords = (n: number) => `${n} ${n === 1 ? "way" : "ways"} in through people you know`;

/**
 * What Merlin says after a names-only Connections.csv goes in (signed-in pages only; the public
 * data page never names LinkedIn). `n`: how many Merlin placed by profile link, the member's own
 * count. `google`: Google can be connected on this Merlin.
 */
export const namesOnlyWords = (n: number, google: boolean) =>
  `This file has names and profile links only: LinkedIn stopped including companies, titles and emails in December 2026. Merlin matched ${n ? n.toLocaleString("en-US") : "none"} by profile link. For more ways in, add a contacts file (from Google Contacts, Outlook, your phone or a CRM)${google ? " or connect Google" : ""}.`;
/** The short version, where members bring the file in. */
export const namesOnlyShort = (google: boolean) =>
  `LinkedIn's files from December 2026 have names and profile links only, so Merlin matches them by profile link. A contacts file${google ? " or Google" : ""} finds more ways in.`;

/** The three steps to LinkedIn's own export. */
export const EXPORT_STEPS = [
  "On LinkedIn, open Settings, then Data privacy.",
  "Pick Get a copy of your data, tick Connections, and request the archive.",
  "LinkedIn emails you a link, usually within minutes. Download it and pick Connections.csv here.",
] as const;

/* ---------- Your way into a company (lib/paths/ways.ts, estimated by lib/paths/rank.ts, planned by lib/paths/plan.ts) ---------- */

/** One person on a route (or the member), as the member may see them. */
export interface RouteNode {
  role: "you" | "person" | "target";
  /** A name only where the member can see it, else what they are ("Their fractional Sales lead", "Their CFO", "This company"). */
  label: string;
  /** What they are to the route: "Peer on Merlin", "CFO · decides". */
  sub: string | null;
  initials: string;
  /** The name is behind a lock (the label says what they are instead). */
  locked?: boolean;
  /** The last node is the company itself (nobody who decides is on file). */
  company?: boolean;
}

/** One link between two nodes: its strength (0 to 1), its word and what it rests on ("6 messages on Merlin"). */
export interface RouteLink {
  band: PathBand;
  strength: number;
  words: string;
  /** Where Merlin knows it from, in a few words: "Your Google contacts and calendar", "Seats on Merlin". */
  from?: string;
}

/** Where a way in comes from (its first link): the member's own sources, or what Merlin already holds. */
export type WaySource = "google" | "linkedin" | "csv" | "messages" | "fellow" | "seat" | "direct";
/** The words for each, as the Sources panel and a link's tag say them. */
export const WAY_SOURCE_WORDS: Record<WaySource, string> = {
  google: "Your Google contacts and calendar",
  linkedin: "Your LinkedIn connections file",
  csv: "Your CSV",
  messages: "Merlin messages",
  fellow: "Fellow fractionals on Merlin",
  seat: "Seats on Merlin",
  direct: "People on Merlin",
};

/** How fresh a way in is: the newest dated thing it rests on. */
export interface Freshness {
  /** Fresh (30 days or less), Ageing (90 or less), Stale (older); null with nothing dated on file. */
  word: "Fresh" | "Ageing" | "Stale" | null;
  /** Days since the newest dated signal, or null. */
  days: number | null;
  /** "Newest signal: a meeting 12 days ago." */
  line: string;
}

/** A step's primary action, by what Merlin already has. Nothing is sent without the member's click. */
export type RouteAct =
  /** A member on Merlin: Message (the conversation when there is one). `member` is their public id. */
  | { kind: "message"; member: string; first: string; conversation: string | null }
  /** They hold or held a seat at the company and aren't on Merlin: Invite to connect (the seat's public id). */
  | { kind: "invite"; seat: string; first: string }
  /** Anyone else: the drafted note, opened in Gmail (or copied) by the member. */
  | { kind: "note"; first: string };

/** The drafted note for a step, in the member's voice. `email` only when the member already has it. */
export interface RouteNote {
  to: string;
  subject: string;
  body: string;
  email: string | null;
}

/** One step of a route, as the plan shows it. */
export interface RouteStepView {
  n: number;
  kind: "ask" | "wait" | "meet";
  /** "Your move" or "Waiting on Casey". */
  who: string;
  title: string;
  detail: string;
  /** The ask's drafted note (the ask step and a note straight to who decides). */
  note: RouteNote | null;
  /** The nudge, drafted for after No reply yet (a waiting step). */
  nudge: RouteNote | null;
  act: RouteAct | null;
  /** The buttons' words: the primary, the second ("No reply yet", "Edit the note") and the can't-help line. */
  primary: string;
  alt: string | null;
  cant: string | null;
}

export interface RouteView {
  /** Stable across answers (a hash of who it goes through): what a plan keeps. */
  id: string;
  /** "Casey's route", "Write to Rita". */
  short: string;
  /** "Go through Casey Morgan", "Write to Rita yourself". */
  title: string;
  /** The kind of way in: "A peer on Merlin", "A former client", "From your LinkedIn", "Write to them yourself". */
  kind: string;
  /** You, each person in between, the last person (or the company). */
  nodes: RouteNode[];
  links: RouteLink[];
  /** "You → Casey Morgan → Rita Vance, CFO". */
  chain: string;
  /** People between the member and the last person. */
  between: number;
  /** The last person decides on fractional hires there. */
  decides: boolean;
  /** Est. success, 5 to 85, in steps of 5. */
  est: number;
  /** Time to a meeting: "1–2 weeks". */
  time: string;
  /** The short why line. */
  why: string;
  /** What happens, numbered. */
  how: string[];
  steps: RouteStepView[];
  /** The decision card's line. */
  because: string;
  /** How fresh it is (the newest dated signal it rests on). */
  fresh?: Freshness;
  /** Where its first link comes from. */
  src?: WaySource;
}

/** The member's plan at a company, as the page shows it. */
export interface PlanView {
  route: string;
  /** The route it is on (null when it isn't there any more: the people changed). */
  current: RouteView | null;
  step: number;
  steps: number;
  done: boolean;
  /** "Casey's route · chosen today". */
  decision: string;
  because: string;
  /** "Ana's route: Est. success 55%, one more hand-off." Null without one. */
  planB: string | null;
  planBId: string | null;
  /** The nudge is due on this day (YYYY-MM-DD), after No reply yet. */
  nudge: string | null;
  nudgeDue: boolean;
  /** Plan B was picked after someone couldn't help: the words for the banner. */
  switchedWhy: string | null;
  /** What has happened, oldest first: { when: "Today", what: "Note sent to Casey" }. */
  log: { when: string; what: string }[];
}

/** GET /api/paths?way=<public id>: your way into one company. */
export interface WayInView {
  on: true;
  id: string;
  /** Null while the company is locked for the member: it is described by its facts and id. */
  name: string | null;
  locked: boolean;
  facts: string;
  /** "Rita Vance, CFO, decides", "Hired 2 fractionals before", the open role (ember, once). */
  decider: string | null;
  hired: string | null;
  openRole: string | null;
  /** Best first: the first is Merlin's recommendation. At most ROUTES_MAX. */
  routes: RouteView[];
  /** Weaker routes not shown. */
  hidden: number;
  plan: PlanView | null;
  explain: string;
  following: boolean;
  /** How many peers serve companies like this one (a count only). */
  peers: number;
  fn: string | null;
}

/** One company on the map. */
export interface GetInRow {
  id: string;
  name: string | null;
  facts: string;
  /** "In your Crystal Ball", "Saved view: SaaS 51-200", "Your profile". */
  tags: string[];
  fit: 1 | 2 | 3;
  odds: OddsBand;
  hiringNow: boolean;
  zone: Zone;
  /** The best route's Est. success, null with no route. */
  best: number | null;
  /** The best route in a few words: "Through Casey Morgan, then Rita Vance". Null while the company is locked. */
  via: string | null;
  /** The best route's first link, for the phone's line. */
  band: PathBand | null;
  /** Where its dot goes, 0 to 100. */
  x: number;
  y: number;
  why: string | null;
  /** The member has a plan there. */
  plan: boolean;
  locked: boolean;
}

/** GET /api/paths?map=1: Where you can get in. */
export interface GetInView {
  on: true;
  fn: string | null;
  rows: GetInRow[];
  counts: Record<Zone, number>;
  total: number;
  ball: number;
  views: { name: string; n: number }[];
  profile: number;
  /** Locked companies whose ways in from the member's own files wait until they open them (fromFile): a count only. */
  lockedWays?: number;
  /** The zones over every company that fits (counts above are the dots on the map). */
  countsAll?: Record<Zone, number>;
}

/* ---------- Warm paths (the new look's map) ---------- */

/** One company on Warm paths: placed by how well it fits the member (up) and how strong their way in is (across). */
export interface WarmRow {
  id: string;
  /** Null while the company is locked for the member: said by its facts. */
  name: string | null;
  facts: string;
  locked: boolean;
  /** How many of the five fit traits it has (function, industry, size, revenue, a hiring signal), and which. */
  fit: number;
  fitWords: string[];
  odds: OddsBand;
  hiringNow: boolean;
  ball: boolean;
  /** The saved list it matches, if any. */
  list: string | null;
  /** The best route's Est. success, null with no route. */
  best: number | null;
  /** The best route's first link and where it comes from. */
  band: PathBand | null;
  src: WaySource | null;
  /** "Through Casey Morgan", "You know Rita Vance", "Through a fellow fractional" (locked). Null with no route. */
  via: string | null;
  /** The person on the best route, for the People tab (null while locked or with no route). */
  person: { key: string; name: string; sub: string | null } | null;
  /** Every person on a route there the member can see, for the People tab. */
  people: { key: string; name: string; sub: string | null; band: PathBand }[];
  /** How fresh the best route is. */
  fresh: Freshness | null;
  zone: Zone;
  /** Where its mark goes, 0 to 100 each way (50 is the line). */
  x: number;
  y: number;
  /** On the map (the map shows a balanced few; the list shows them all). */
  onMap: boolean;
  plan: boolean;
  /** The order of the ranked list (1 is best). */
  rank: number;
}

/** Where a quadrant line sits, from the companies on the page, and the words for it. */
export interface WarmLine {
  /** The value a company needs to be on the high side (fit of 5, or Est. success), or null when it is the better half by rank. */
  at: number | null;
  /** "Fit 3 of 5 or more", "Est. success 20% or more", "The better fitting half". */
  words: string;
}

/** GET /api/paths?warm=1: Warm paths. */
export interface WarmView {
  on: true;
  fn: string | null;
  rows: WarmRow[];
  /** Companies in each quadrant: on the map, and in all. */
  counts: Record<Zone, number>;
  countsAll: Record<Zone, number>;
  total: number;
  lines: { fit: WarmLine; way: WarmLine };
  /** The warmest best route among them (Est. success), or null with no route at all. */
  warmest: number | null;
  /** Ways in by where the best route comes from (a company counts once). */
  bySource: Partial<Record<WaySource, number>>;
  /** The member's own sources that are in: Google, the LinkedIn file, a CSV. */
  own: { google: boolean; linkedin: boolean; csv: boolean };
  /** Conversations on Merlin the member is in, and fellow fractionals in the directory: counts only. */
  conversations: number;
  directory: number;
  /** Locked companies whose ways in from the member's own files wait until opened: a count only. */
  lockedWays: number;
  /** The ideal client in words, for the first visit's line, or null. */
  icp: string | null;
  /** The saved lists and Crystal Ball, for the filters: how many companies each. */
  ball: number;
  lists: { name: string; n: number }[];
}

/* ---------- Suggested additions from your connections (RN_SUGGEST) ---------- */

/** One person from the member's own LinkedIn file or CSV who looks like a leader at a company with nobody like that on file. */
export interface SuggestRow {
  /** A one-way key of the row (never the name): what the member ticks. */
  key: string;
  name: string;
  title: string;
  /** The relationship it would be added with. */
  rel: "Decision maker";
  company: string;
  companyId: string;
  from: "linkedin" | "csv";
}
export interface SuggestView {
  on: boolean;
  rows: SuggestRow[];
  /** More that match at companies still locked for the member: a count only. */
  locked: number;
  /** Credits the member can still earn today (of EARN_CAP). */
  earnLeft: number;
}

/** One plan, for Home's move and the pipeline's route line (GET /api/paths?plans=1). */
export interface PlanLine {
  company: string;
  name: string | null;
  /** "Casey's route". */
  short: string;
  /** "via Casey → Rita". */
  via: string;
  step: number;
  steps: number;
  done: boolean;
  /** Home's move: "Check in with Casey", and its line. */
  move: string;
  line: string;
  nudgeDue: boolean;
  /** "Step 2 of 3 · waiting on Casey since Nov 22". */
  since: string;
  /** "Next: nudge Casey, Nov 26". */
  next: string;
  /** Each node after You: done, on now, or ahead, for the little progress line. */
  marks: ("done" | "now" | "next")[];
  /** The step the member is on, as the plan shows it (its note and buttons), for Home's move. */
  now: RouteStepView | null;
  updatedAt: string;
}

/** Routes a company's page shows, and the map's rows. */
export const ROUTES_MAX = 4;
export const GETIN_MAX = 60;
