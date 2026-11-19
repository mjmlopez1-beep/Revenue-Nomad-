/**
 * Who leads each function at a company, read from the company's own website (lib/leaders): what
 * the state keeps (State.leaders), what the view sends (CompanyRec.leads), the live progress of a
 * run, and the words the app, the record and the Claude connector use. No imports, so lib/table.ts,
 * the app (app/post) and lib/mcp can all use it.
 *
 * No names are ever kept: only the function, the level, full-time or fractional, since when, and
 * the page on the company's own site it was read from.
 */

/** How the record names the source. */
export const LEADERS_SOURCE = "Company website";

/** A company is tried again this long after a skip or a failure (or a read that found nobody). */
export const RETRY_DAYS = 30;
/** A company with leaders on file is read again after this long. */
export const REFRESH_DAYS = 90;

/** Levels kept, most senior first. Below Director is not a function's leader. */
export const LEADER_LEVELS = ["C-level", "VP", "Head", "Director"] as const;
export type LeaderLevel = (typeof LEADER_LEVELS)[number];
export type LeaderKind = "full-time" | "fractional" | "interim" | "advisor" | "part-time";
export type LeaderHow = "team page" | "press release";

/** One function's leader on file. `since`: "2024" or "2024-11". `url`: the page on the company's own site. `seenAt`: when it was read there. */
export interface LeaderFn {
  level: LeaderLevel;
  kind: LeaderKind;
  since?: string;
  how: LeaderHow;
  url: string;
  seenAt: string;
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
  hash?: string;
  functions: Record<string, LeaderFn>;
  why?: string;
  pages?: number;
  team?: boolean;
  press?: boolean;
  robots?: number;
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
}

/** One function's leader as the view sends it (CompanyRec.leads). `url` is left out at a hidden company. */
export interface LeadLine {
  fn: string;
  level: LeaderLevel;
  kind: LeaderKind;
  since?: string;
  how: LeaderHow;
  url?: string;
}

/** CompanyRec.leads: the functions with a leader on file, and when the site was read. */
export interface CompanyLeads {
  checkedAt: string;
  fns: LeadLine[];
}

/** The run under way in this process (one at a time), for Pilot metrics. */
export const leadersProgress: { running: boolean; run: LeadersRunSummary | null } = ((globalThis as { __merlinLeaders?: { running: boolean; run: LeadersRunSummary | null } }).__merlinLeaders ??= {
  running: false,
  run: null,
});

/** On when RN_LEADERS=1: the admin button works. Nothing reads leadership pages otherwise. */
export const leadersEnabled = () => process.env.RN_LEADERS === "1";

/** How many companies "the next 200" is. */
export const NEXT_BATCH = 200;

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

/** "Sales: full-time CRO since 2024": one line per function, in the order given. */
export const leadItems = (leads: CompanyLeads) => leads.fns.map((l) => `${l.fn}: ${leadPhrase(l)}`);

/** The whole line: "Sales: full-time CRO since 2024 · Marketing: fractional CMO · from the company's website, checked Nov 18". */
export function leadsLine(leads: CompanyLeads, now = new Date()): string {
  return [...leadItems(leads), `from the company's website, checked ${checkedWords(leads.checkedAt, now)}`].join(" · ");
}

/** In place of "No fractional Sales yet" when a full-time leader is on file: "FT Sales Leader since 2024". */
export function ledFullTimeWords(fn: string, l: Pick<LeadLine, "since">): string {
  const y = sinceYear(l.since);
  return `FT ${fn} Leader${y ? ` since ${y}` : ""}`;
}
/** A fractional or interim leader on file: "Fractional CMO on the team". */
export function onTheTeamWords(l: Pick<LeadLine, "fn" | "level" | "kind">): string {
  const w = KIND_WORD[l.kind];
  return `${w[0].toUpperCase()}${w.slice(1)} ${roleLabel(l.fn, l.level)} on the team`;
}
