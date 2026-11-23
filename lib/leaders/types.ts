/**
 * Who leads each function at a company, read from the company's own website (lib/leaders): what
 * the state keeps (State.leaders), what the view sends (CompanyRec.leads), the live progress of a
 * run, and the words the app, the record and the Claude connector use. No imports, so lib/table.ts,
 * the app (app/post) and lib/mcp can all use it.
 *
 * For each function's leader (C-level, VP, Head or Director) and for the company's top leader (its
 * CEO, else its president, else a founder) it keeps the person's name and title as the page prints
 * them, the page and when it was read. Nobody below a function's leader is kept. Names are kept
 * only at a company with a United States HQ (lib/table.ts saveLeaders), never for someone who asked
 * to be removed (Remove my name), and never for a member whose profile keeps them out of view.
 */

/** How the record names the source. */
export const LEADERS_SOURCE = "Company website";
/** A person read from the company's website, as the app labels their source (PersonRec.source is LEADERS_SOURCE). */
export const LEADERS_SOURCE_SAY = "From the company's website";
/** The relationship a leader read from the website has on the record: the same people model as members' decision makers. */
export const LEADER_RELATIONSHIP = "Decision maker";

/** A company is tried again this long after a skip or a failure (or a read that found nobody). */
export const RETRY_DAYS = 30;
/** A company read OK is read again after this long (before what we read goes stale at KNOWN_DAYS). */
export const REFRESH_DAYS = 75;
/**
 * The reader's version, kept on each record (LeadersRecord.v). A record read by an older reader
 * is due again at once, whatever its age, so a better reader's first daily batches re-read what
 * the old one read instead of waiting REFRESH_DAYS. Bump it when extract.ts or run.ts read better.
 * 2: an About page holding the team grid counts as a team page; CPTO, CBO and a bare CCO; photo alt text; script data.
 * 3: keeps the name and title of each function's leader and of the top leader (CEO, president or founder).
 */
export const READER_VERSION = 3;
/** A read is what we know about a company's leadership for this long. After that, or with no read, its leadership is unknown. */
export const KNOWN_DAYS = 90;

/** Levels kept, most senior first. Below Director is not a function's leader. */
export const LEADER_LEVELS = ["C-level", "VP", "Head", "Director"] as const;
export type LeaderLevel = (typeof LEADER_LEVELS)[number];
export type LeaderKind = "full-time" | "fractional" | "interim" | "advisor" | "part-time";
/** Where a leader on file came from: the company's own team page or a press release, or members ("Members say: full-time CRO"). */
export type LeaderHow = "team page" | "press release" | "members";

/**
 * One function's leader on file. `since`: "2024" or "2024-11". `url`: the page on the company's
 * own site, never an address that spells a name (the page that linked to it instead). `seenAt`:
 * when it was read there. `name` and `title`: the person as the page prints them, kept only where
 * names may be (lib/table.ts saveLeaders), and `page` the very page they were read on when it is
 * not `url` (it may spell their name, so it goes out only with the name).
 */
export interface LeaderFn {
  level: LeaderLevel;
  kind: LeaderKind;
  since?: string;
  how: LeaderHow;
  url: string;
  seenAt: string;
  name?: string;
  title?: string;
  page?: string;
  /**
   * The person is in California by their own location, when a page says where they are (a yes,
   * never the place). Their name never shows (lib/california.ts). No reader sets it yet: a leader's
   * page rarely gives one, and the company's state is not the person's.
   */
  california?: true;
}
/** The company's top leader: its CEO, else its president, else a founder (`rank` 0, 1, 2). Kept only with a name. */
export interface LeaderTop extends LeaderFn {
  name: string;
  title: string;
  rank: number;
}

/**
 * State.leaders[companyId]. `status`: found (one or more functions), none (pages read, nobody
 * found), skipped (robots.txt, a safety refusal, not a company site) or failed (network, server).
 * `hash`: of the functions found (to tell a change). `pages`: pages read besides the homepage.
 * `team` / `press`: a team or leadership page / a press page was read. `robots`: pages robots.txt kept us from.
 */
export interface LeadersRecord {
  status: "found" | "none" | "skipped" | "failed";
  checkedAt: string;
  /** The last read reached the site (found or none). False after a skip or a failure, which keep what was on file. */
  ok?: boolean;
  hash?: string;
  functions: Record<string, LeaderFn>;
  why?: string;
  pages?: number;
  team?: boolean;
  press?: boolean;
  robots?: number;
  /** The reader version that made this record (READER_VERSION). Missing: the first reader (1). */
  v?: number;
  /** The last read that reached the site (found or none), kept through a later failure. */
  readAt?: string;
  /** The last read that reached a team or leadership page, kept through a later failure. "Nobody leads X" is said only from one in the last KNOWN_DAYS. */
  teamAt?: string;
  /** The top leader (CEO, president or founder), with their name. */
  top?: LeaderTop;
}

/** A run's counts (State.leadersRun, and the run under way). */
export interface LeadersRunSummary {
  startedAt: string;
  endedAt: string | null;
  /** "next": the next 200 companies, "all": every company due. */
  scope: "next" | "all";
  total: number;
  done: number;
  /** Companies whose pages were read (found or none). */
  read: number;
  found: number;
  none: number;
  skipped: number;
  failed: number;
  /** Companies left alone because robots.txt said no to their homepage. */
  robots: number;
  /** Pages read besides homepages. */
  pages: number;
  /** Companies with a team or leadership page read, and with a press page read. */
  team: number;
  press: number;
  /** Functions with a leader found, and of those fractional or interim, and full-time. */
  functions: number;
  fractional: number;
  fullTime: number;
  /** Named leaders kept (a function's leader or the top leader, at a company where names may be kept). */
  named?: number;
}

/** A company to read: internal id, name, website host, and its last record if any. */
export interface LeadersTarget {
  companyId: string;
  name: string;
  domain: string;
  prev: LeadersRecord | null;
}

/** What one company's read came to. */
export interface LeadersOutcome {
  companyId: string;
  status: LeadersRecord["status"];
  why?: string;
  functions: Record<string, LeaderFn>;
  pages: number;
  team: boolean;
  press: boolean;
  robots: number;
  /** The top leader read (CEO, president or founder), with their name. */
  top?: LeaderTop;
  /** Named leaders kept when it was saved (lib/table.ts saveLeaders sets it): names stay only where they may. */
  named?: number;
}

/** One function's leader as the view sends it (CompanyRec.leads). `url` is left out at a hidden company. */
export interface LeadLine {
  fn: string;
  level: LeaderLevel;
  kind: LeaderKind;
  since?: string;
  how: LeaderHow;
  url?: string;
  /** how "members": the title they picked ("CRO", "VP Sales"), and whether two members or the website agree. */
  role?: string;
  confirmed?: boolean;
  /** how "members": the viewer is one of the members who said it. */
  mine?: boolean;
}

/** CompanyRec.leads: the functions with a leader on file, and when the site was read. */
export interface CompanyLeads {
  checkedAt: string;
  fns: LeadLine[];
  /** The last read of a team or leadership page there, in the last KNOWN_DAYS. Absent: we haven't checked their team page. */
  teamAt?: string;
}

/** The run under way in this process (one at a time), for Pilot metrics. */
export const leadersProgress: { running: boolean; run: LeadersRunSummary | null } = ((globalThis as { __merlinLeaders?: { running: boolean; run: LeadersRunSummary | null } }).__merlinLeaders ??= {
  running: false,
  run: null,
});

/** On when RN_LEADERS=1: the admin button works, and the daily background read runs. Nothing reads leadership pages otherwise. */
export const leadersEnabled = () => process.env.RN_LEADERS === "1";

/** How many companies "the next 200" is. */
export const NEXT_BATCH = 200;
/**
 * Companies the daily background read takes (lib/leaders/run.ts maybeLeaders): Crystal Ball's and
 * members' companies first, then the rest. At 4 at a time with the 300 ms pauses and up to 6 pages
 * each, 400 companies is about an hour of polite reading a day.
 */
export const DAILY_BATCH = 400;

/* ---------- words ---------- */

const C_LEVEL: Record<string, string> = {
  Sales: "CRO",
  Marketing: "CMO",
  Growth: "CGO",
  "Customer Success": "CCO",
  Finance: "CFO",
  Technology: "CTO",
  Operations: "COO",
  People: "CHRO",
  Product: "CPO",
  Legal: "CLO",
};

/** The role for a function and a level: "CRO", "VP Sales", "Head of Marketing", "Director of RevOps". */
export function roleLabel(fn: string, level: LeaderLevel): string {
  if (level === "C-level") return C_LEVEL[fn] ?? `C-level ${fn}`;
  if (level === "VP") return `VP ${fn}`;
  if (level === "Head") return `Head of ${fn}`;
  return `Director of ${fn}`;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** "2024" or "Nov 2024". */
export function sinceWords(since: string | undefined): string | null {
  if (!since) return null;
  const m = /^(\d{4})(?:-(\d{2}))?$/.exec(since);
  if (!m) return null;
  const mo = m[2] ? Number(m[2]) : 0;
  return mo >= 1 && mo <= 12 ? `${MONTHS[mo - 1]} ${m[1]}` : m[1];
}
export const sinceYear = (since: string | undefined) => (since && /^\d{4}/.test(since) ? since.slice(0, 4) : null);

const KIND_WORD: Record<LeaderKind, string> = { "full-time": "full-time", fractional: "fractional", interim: "interim", advisor: "advisory", "part-time": "part-time" };

/** "full-time CRO since Nov 2024", "fractional CMO". */
export function leadPhrase(l: Pick<LeadLine, "fn" | "level" | "kind" | "since">): string {
  const since = sinceWords(l.since);
  return `${KIND_WORD[l.kind]} ${roleLabel(l.fn, l.level)}${since ? ` since ${since}` : ""}`;
}

/** A fractional or interim leader: the company hires fractionals in that function. */
export const isFractionalLead = (l: Pick<LeadLine, "kind">) => l.kind === "fractional" || l.kind === "interim";
/** A full-time leader at Director or above (every leader kept is Director+). */
export const isFullTimeLead = (l: Pick<LeadLine, "kind">) => l.kind === "full-time";

/** "Nov 18" (with the year when it isn't this year), in UTC so the server and the page agree. */
export function checkedWords(iso: string, now = new Date()): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const day = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}`;
  return d.getUTCFullYear() === now.getUTCFullYear() ? day : `${day}, ${d.getUTCFullYear()}`;
}

/** "Sales: full-time CRO since 2024", "Sales: full-time CRO (members say)": one line per function, in the order given. */
export const leadItems = (leads: CompanyLeads) => leads.fns.map((l) => `${l.fn}: ${l.how === "members" ? membersSay(l) : leadPhrase(l)}`);

/** The whole line: "Sales: full-time CRO since 2024 · Marketing: fractional CMO · from the company's website, checked Nov 18". */
export function leadsLine(leads: CompanyLeads, now = new Date()): string {
  const site = leads.fns.some((l) => l.how !== "members");
  return [...leadItems(leads), ...(site ? [`from the company's website, checked ${checkedWords(leads.checkedAt, now)}`] : [])].join(" · ");
}

/** In place of "No fractional Sales yet" when a full-time leader is on file: "FT Sales Leader since 2024", or "Members say: full-time CRO". */
export function ledFullTimeWords(fn: string, l: Pick<LeadLine, "since"> & Partial<Pick<LeadLine, "how" | "role" | "confirmed" | "level">>): string {
  if (l.how === "members") return membersSayWords(fn, l);
  const y = sinceYear(l.since);
  return `FT ${fn} Leader${y ? ` since ${y}` : ""}`;
}
/** A fractional or interim leader on file: "Fractional CMO on the team". */
export function onTheTeamWords(l: Pick<LeadLine, "fn" | "level" | "kind">): string {
  const w = KIND_WORD[l.kind];
  return `${w[0].toUpperCase()}${w.slice(1)} ${roleLabel(l.fn, l.level)} on the team`;
}

/* ---------- what we know about who leads a function ---------- */

/** A member's word that a company has a full-time leader in a function (State.leaderReports[companyId][fn]). No name, only the title picked. */
export interface LeaderReport {
  by: string;
  /** One of memberRoles(fn). */
  role: string;
  at: string;
  /** The member unlocked this company in the LEADER_BACK_DAYS before saying it: 2 credits back once the website agrees (lib/table.ts). */
  backDue?: true;
  /** When those credits were given back. */
  paidBack?: string;
}

/** The titles a member picks from for a function's full-time leader. */
export function memberRoles(fn: string): string[] {
  if (fn === "Sales") return ["CRO", "CCO", "VP Sales", "Head of Sales", "Other"];
  return [roleLabel(fn, "C-level"), `VP ${fn}`, `Head of ${fn}`, "Other"];
}
/** The level a picked title reads as ("Other" is Head: a leader, level unknown). */
export function roleLevel(role: string): LeaderLevel {
  if (/^VP /.test(role)) return "VP";
  if (/^Head /.test(role) || role === "Other") return "Head";
  return "C-level";
}

/** Two members saying the same, or the company's website agreeing, confirms a members' report. */
export const CONFIRM_MEMBERS = 2;

/**
 * What Merlin knows about who leads one function at a company:
 *   full-time   a full-time leader: on the company's website, or members say so (`how` "members",
 *               `confirmed` once two members or the website agree)
 *   fractional  a fractional or interim leader on the company's website
 *   none        a team or leadership page there was read in the last KNOWN_DAYS and names nobody in the function
 *   unknown     no such read: we haven't checked their team page, so nothing is said about who leads it
 */
export type FnKnow =
  | { s: "full-time"; how: LeaderHow; level: LeaderLevel; since?: string; role?: string; confirmed: boolean }
  | { s: "fractional"; level: LeaderLevel; kind: LeaderKind }
  | { s: "none"; teamAt: string }
  | { s: "unknown" };

const DAY_MS = 24 * 60 * 60 * 1000;
/** When a team page there was last read, if in the last KNOWN_DAYS; else null. A record from before teamAt was kept reads its team flag. */
export function teamReadAt(rec: Pick<LeadersRecord, "teamAt" | "team" | "checkedAt" | "status" | "ok"> | null | undefined, nowMs: number): string | null {
  if (!rec) return null;
  const at = rec.teamAt ?? (rec.team && rec.ok !== false && (rec.status === "found" || rec.status === "none") ? rec.checkedAt : undefined);
  if (!at) return null;
  const age = nowMs - Date.parse(at);
  return Number.isFinite(age) && age <= KNOWN_DAYS * DAY_MS ? at : null;
}

/** The reports that stand for a function: one per member (their newest), newest first. */
export function reportsOf(list: LeaderReport[] | undefined): LeaderReport[] {
  const seen = new Set<string>();
  const out: LeaderReport[] = [];
  for (const r of [...(list ?? [])].sort((a, b) => b.at.localeCompare(a.at))) {
    if (seen.has(r.by)) continue;
    seen.add(r.by);
    out.push(r);
  }
  return out;
}

/** What we know about who leads `fn` at a company, from its leadership record and members' reports. */
export function fnKnow(rec: LeadersRecord | null | undefined, reports: LeaderReport[] | undefined, fn: string, nowMs: number): FnKnow {
  const site = rec?.functions?.[fn];
  if (site && site.kind === "full-time") return { s: "full-time", how: site.how, level: site.level, ...(site.since ? { since: site.since } : {}), confirmed: true };
  const said = reportsOf(reports);
  const teamAt = teamReadAt(rec, nowMs);
  // One member's word stands until a team page read after it names nobody in the function; two members' always stands.
  const stands = said.length >= CONFIRM_MEMBERS || (said.length === 1 && !(teamAt && !site && teamAt > said[0].at));
  if (stands) return { s: "full-time", how: "members", level: roleLevel(said[0].role), role: said[0].role, confirmed: said.length >= CONFIRM_MEMBERS };
  if (site && (site.kind === "fractional" || site.kind === "interim")) return { s: "fractional", level: site.level, kind: site.kind };
  return teamAt ? { s: "none", teamAt } : { s: "unknown" };
}

/** "Nov 2026". */
export function monthYear(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? `${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}` : "";
}

const memberRole = (fn: string, l: { role?: string; level?: LeaderLevel }) => (l.role && l.role !== "Other" ? l.role : l.role === "Other" ? `${fn} leader` : roleLabel(fn, l.level ?? "Head"));
/** A members' line on the record: "full-time CRO (members say)", "full-time CRO (confirmed by members)". */
export function membersSay(l: Pick<LeadLine, "fn" | "level"> & { role?: string; confirmed?: boolean }): string {
  return `full-time ${memberRole(l.fn, l)} (${l.confirmed ? "confirmed by members" : "members say"})`;
}
/** "Members say: full-time CRO", "Confirmed by members: full-time CRO". */
export function membersSayWords(fn: string, l: { role?: string; confirmed?: boolean; level?: LeaderLevel }): string {
  return `${l.confirmed ? "Confirmed by members" : "Members say"}: full-time ${memberRole(fn, l)}`;
}

/**
 * What a line may say about nobody leading `fn` there. Never "no Sales leader" unless a team page
 * said so: "No fractional Sales leader on Merlin. We haven't checked their team page yet" or
 * "No Sales leader on their team page (checked Nov 2026)". Null when someone leads it.
 */
export function noLeaderWords(fn: string, k: FnKnow): string | null {
  if (k.s === "unknown") return `No fractional ${fn} leader on Merlin. We haven't checked their team page yet`;
  if (k.s === "none") return `No ${fn} leader on their team page (checked ${monthYear(k.teamAt)})`;
  return null;
}
/** A full-time leader in place, in words: "FT Sales Leader since 2024", "Members say: full-time CRO". Null otherwise. */
export function fullTimeWords(fn: string, k: FnKnow): string | null {
  if (k.s !== "full-time") return null;
  return k.how === "members" ? membersSayWords(fn, k) : ledFullTimeWords(fn, k);
}
