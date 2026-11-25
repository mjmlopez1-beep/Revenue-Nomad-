/**
 * Crystal Ball in the new look (CrystalBall.tsx), as pure data so scripts/test-crystal-ball.mts
 * checks it with no browser: each signal's short name and where its fact comes from, the company's
 * suggested move and way in, when a hire is likely, the fit against the ideal client in words, and
 * the timeline's positions. Never a number for how likely: the band (High, Medium, Low) and a word
 * for each signal's weight (BUILD_PLAN part 8: no numeric score).
 */
import type { Icp } from "@/lib/tableTypes";
import type { RadarKind, RadarRow, RadarSigView } from "@/lib/radar/types";
import { TUNE_GROUPS, tuneGroupOf, type RadarTune, type TuneGroup } from "@/lib/radar/tune";

/** A signal's short name on a row's chip: the real kind, in the member's words. */
export function kindLabel(kind: RadarKind, fn: string | null): string {
  const f = fn && fn !== "Other" ? fn.toLowerCase() : "";
  switch (kind) {
    case "role":
      return "Role posted";
    case "seat":
      return "Seat ended";
    case "tenure":
      return "Seat a year in";
    case "departure":
      return "Leader left";
    case "arrival":
      return "New leader";
    case "adjacent":
      return "Fractional hire";
    case "rehire":
      return "Repeat hirer";
    case "funding":
      return "Raised money";
    case "sales-build":
      return "Sales hires";
    case "team-build":
      return "Team growing";
    case "headcount":
      return "More people";
    case "gap":
      return f ? `No ${f} leader` : "No leader on file";
  }
}

/** Where a signal's fact comes from: never LinkedIn, never a person's name. */
export const SOURCE_OF: Record<RadarKind, string> = {
  role: "the job posting",
  seat: "seats on file",
  tenure: "seats on file",
  adjacent: "seats on file",
  rehire: "seats on file",
  departure: "their team page",
  arrival: "their team page",
  gap: "their team page",
  funding: "a public filing (SEC Form D)",
  "sales-build": "their careers page",
  "team-build": "their careers page",
  headcount: "company facts on file",
};

/** "From seats on file and the job posting." */
export function sourcesLine(sigs: readonly Pick<RadarSigView, "kind">[]): string {
  const xs = [...new Set(sigs.map((s) => SOURCE_OF[s.kind]))];
  if (!xs.length) return "";
  return `From ${xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`}.`;
}

/**
 * The When column: real, dated facts only, never a predicted window (owner, 2026-11-25: Merlin has
 * no validated outcome data, so "within 3 months" would be false precision). "Open now" for an open
 * role, else the newest signal's day ("Nov 20"), else null.
 */
export function whenWords(h: readonly [number, number] | null | undefined, sigs: readonly Pick<RadarSigView, "at">[] = [], today = ""): string | null {
  if (h && h[1] <= 1) return "Open now";
  const at = latestAt(sigs);
  return at && today ? `Signal ${dateWords(at, today)}` : null;
}
/** The side panel's line: "Hiring now" for an open role, else nothing (Merlin doesn't guess when). */
export const whenLong = (h: readonly [number, number] | null | undefined) => (h && h[1] <= 1 ? "Hiring now" : null);
/** The newest dated signal's day (YYYY-MM-DD), or null. */
export const latestAt = (sigs: readonly Pick<RadarSigView, "at">[]) => sigs.map((x) => x.at).filter((x): x is string => !!x && /^\d{4}-\d{2}-\d{2}$/.test(x)).sort().pop() ?? null;

/** "Nov 19", "Oct 2026" when older than this year. */
export function dateWords(day: string | null | undefined, today: string): string {
  if (!day || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return "";
  const d = new Date(`${day}T12:00:00Z`);
  if (day === today) return "Today";
  if (Date.parse(`${today}T12:00:00Z`) - d.getTime() === 86_400_000) return "Yesterday";
  const sameYear = day.slice(0, 4) === today.slice(0, 4);
  return d.toLocaleDateString("en-US", sameYear ? { month: "short", day: "numeric", timeZone: "UTC" } : { month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Why two ranges count the same, when they do: Crystal Ball's picks only go back to `since`, so a
 * wider range can hold no more ("Picks go back to Nov 18, so the last 30 days hold the same
 * companies as the last 7"), or every company in the wider range had news in the narrower one too
 * (a company counts once, at its latest day). Null when the counts differ or there is nothing to explain.
 */
export function rangesNote(ranges: { range: string; companies: number }[] | undefined, since: string | null | undefined, today: string): string | null {
  const n = (r: string) => ranges?.find((x) => x.range === r)?.companies;
  const w = n("7d");
  const m = n("30d");
  if (!since || w === undefined || m === undefined || w !== m || m === 0) return null;
  const days = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${since}T12:00:00Z`)) / 86_400_000);
  if (!(days >= 0)) return null;
  if (days < 7) return `Picks go back to ${dateWords(since, today)}, so the last 30 days hold the same companies as the last 7.`;
  // Older days had news too, at the same companies: each company counts once, at its latest day.
  return `Each company counts once, at its latest news. All ${m.toLocaleString("en-US")} had something in the last 7 days.`;
}

/** What the page knows about a way in at one company, from the member's own sources and the seats on file. */
export interface WayFacts {
  /** Ways in through people the member knows (their own files, Google, messages): a count, never names here. */
  paths: number;
  /** [google network] They know someone there. */
  knows: boolean;
  /** A fractional who held a seat there: their name once the company is open, else null with `held` true. */
  holder: string | null;
  held: boolean;
  /** The company is open to the member. */
  open: boolean;
}

export type MoveGo = "posting" | "record" | "warm" | "open" | "follow";

/** The suggested move and the way in, in words, and where the move's button goes. */
export function moveOf(row: Pick<RadarRow, "kinds" | "band">, w: WayFacts): { move: string; way: string; go: MoveGo; goText: string; long: string; wayLong: string; hasWay: boolean } {
  const role = row.kinds[0] === "role" || row.kinds.includes("role");
  const known = w.paths > 0 || w.knows;
  if (known)
    return {
      move: "Ask for an introduction",
      way: w.paths > 1 ? `${w.paths} people you know` : "You know someone",
      go: w.open ? "record" : "open",
      goText: w.open ? "See who and draft a note" : "Open it to see who",
      long: "Ask the person you know there who owns this now, and for an introduction.",
      wayLong: w.paths > 1 ? `${w.paths} ways in through people you know. Open the company to see who and how.` : "Through someone you know. Open the company to see who and how.",
      hasWay: true,
    };
  if (w.held && w.open && w.holder)
    return {
      move: `Ask ${w.holder}`,
      way: "Held a seat there",
      go: "record",
      goText: "Draft a note",
      long: `Message ${w.holder} and ask how the seat went.`,
      wayLong: `${w.holder} held a fractional seat there. Fellow fractionals are free to see and to message.`,
      hasWay: true,
    };
  if (w.held)
    return {
      move: w.open ? "See who held a seat" : "Open to see who",
      way: "Through a fractional",
      go: w.open ? "record" : "open",
      goText: w.open ? "See the company" : "Open it",
      long: "Open it to see who held the seat, then message them.",
      wayLong: "A fractional held a seat here. The name shows once it is open.",
      hasWay: true,
    };
  if (role)
    return { move: "Reply to the posting", way: "No path yet", go: w.open ? "posting" : "open", goText: w.open ? "See the posting" : "Open it to see the posting", long: "Reply to the posting this week. An open role is the most direct signal.", wayLong: "None yet. Nobody you know is on file here.", hasWay: false };
  if (row.band === "Low")
    return { move: "Follow it for now", way: "No path yet", go: "follow", goText: "Follow it", long: "Follow it for now. Merlin tells you when something new happens there.", wayLong: "None yet. Nobody you know is on file here.", hasWay: false };
  return { move: "Find a way in", way: "No path yet", go: "warm", goText: "Find a way in", long: "Find someone who knows them before writing cold.", wayLong: "None yet. Nobody you know is on file here.", hasWay: false };
}

/** The ideal client against a company's free facts, in words: which parts match, which are not on file. Never a number. */
export function fitWords(icp: Icp | null | undefined, facts: { industry?: string | null; employees?: string | null; revenue?: string | null; country?: string | null }): string {
  if (!icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length)) return "No ideal client yet. Set it and Merlin narrows the ball to your kind of client.";
  type Part = { name: string; asked: boolean; on: string | null | undefined; ok: (v: string) => boolean };
  const parts: Part[] = ([
    { name: "industry", asked: icp.industries.length > 0, on: facts.industry, ok: (v) => icp.industries.some((x) => x.toLowerCase() === v.toLowerCase()) },
    { name: "size", asked: icp.employees.length > 0, on: facts.employees, ok: (v) => icp.employees.includes(v) },
    { name: "revenue", asked: icp.revenue.length > 0, on: facts.revenue, ok: (v) => icp.revenue.includes(v) },
    { name: "country", asked: icp.countries.length > 0, on: facts.country, ok: (v) => icp.countries.some((x) => x.toLowerCase() === v.toLowerCase() || (x === "United States" && /^(US|USA)$/i.test(v))) },
  ] as Part[]).filter((p) => p.asked);
  const yes = parts.filter((p) => p.on && p.ok(p.on)).map((p) => p.name);
  const unknown = parts.filter((p) => !p.on).map((p) => p.name);
  const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);
  if (yes.length === parts.length) return parts.length === 1 ? `Its ${parts[0].name} matches your ideal client.` : `All ${parts.length} parts of your ideal client match.`;
  const said = yes.length ? `Its ${list(yes)} ${yes.length === 1 ? "matches" : "match"} your ideal client.` : "In your ideal client.";
  return unknown.length ? `${said} ${list(unknown).replace(/^./, (c) => c.toUpperCase())} ${unknown.length === 1 ? "is" : "are"} not on file.` : said;
}

/** Room kept at each end of the timeline, as a share of its width, so a dot today stays inside. */
export const TL_EDGE = 0.03;
/** The timeline: the last 12 months up to today, each signal's dot as a share of the width (today at 1 - TL_EDGE). Dated facts only: no window ahead. */
export function timeline(sigs: readonly Pick<RadarSigView, "at">[], today: string): { dots: (number | null)[] } {
  const now = Date.parse(`${today}T12:00:00Z`);
  const MONTH = 30.44 * 86_400_000;
  const dots = sigs.map((s) => {
    if (!s.at) return null;
    const back = Math.min(12, Math.max(0, (now - Date.parse(`${s.at}T12:00:00Z`)) / MONTH));
    return TL_EDGE + (1 - 2 * TL_EDGE) * ((12 - back) / 12);
  });
  return { dots };
}

/** How many rows each tuning group is behind ("Behind 4 of 16 companies"). */
export function groupCounts(rows: readonly Pick<RadarRow, "kinds">[]): Record<TuneGroup, number> {
  const out = Object.fromEntries(TUNE_GROUPS.map((g) => [g.key, 0])) as Record<TuneGroup, number>;
  for (const r of rows) for (const g of new Set(r.kinds.map(tuneGroupOf))) out[g]++;
  return out;
}

/** How many companies changed place between two orders of the same list (by id). */
export function movedCount(before: readonly string[], after: readonly string[]): number {
  const at = new Map(after.map((id, i) => [id, i]));
  return before.filter((id, i) => at.has(id) && at.get(id) !== i).length;
}

/** The tuning with one group set: Normal leaves it out. */
export function withStep(t: RadarTune, g: TuneGroup, step: 0 | 1 | 2): RadarTune {
  const next: RadarTune = { ...t };
  if (step === 1) delete next[g];
  else next[g] = step;
  return next;
}

/** "Since Thursday": the rows whose latest day is after the member's last visit. */
export function newSince(rows: readonly Pick<RadarRow, "day">[], since: string | null): number {
  if (!since) return 0;
  const d = since.slice(0, 10);
  return rows.filter((r) => !!r.day && r.day > d).length;
}

/** "Thursday", or "Nov 12" when it was more than 6 days ago. */
export function sinceWords(since: string, today: string): string {
  const d = new Date(since);
  const days = (Date.parse(`${today}T12:00:00Z`) - d.getTime()) / 86_400_000;
  if (days < 1 && since.slice(0, 10) === today) return "earlier today";
  return days <= 6 ? d.toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" }) : d.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
