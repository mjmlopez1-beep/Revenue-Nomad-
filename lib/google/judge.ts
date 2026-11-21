/**
 * Which of the member's companies and people are relationships, and which aren't: someone selling
 * to them, a recruiter, an investor, another fractional, a client. Pure: no I/O, so the tests run
 * it on fixtures, and lib/google/index.ts runs it on each read.
 *
 * Merlin never reads a meeting's title, notes or an email's text, so none of this does. It reads
 * what Merlin already has:
 *   - the company's free facts on Merlin: its size and industry (a large software company is rarely
 *     a fractional's client, and often sells to them; a staffing firm recruits; a VC or PE firm invests);
 *   - the titles on the member's own saved contacts ("Account Executive", "Senior Recruiter", "Partner");
 *   - the shape of the meetings: who sent the invites, how many of their people came, how many
 *     meetings over how long (counts and dates only, the calendar's organizer flag included).
 * Every judgement comes with the reason in words, is shown, and can be undone by the member.
 */
import { firmReason, firmSite } from "../firms";
import {
  CLIENT_RECENT_DAYS, SEAT_MEETINGS, SEAT_MONTHS, SEAT_RATE,
  type NetCompany, type NetPerson, type PersonKind, type SetKind,
} from "./types";

const DAY_MS = 86_400_000;
const dayMs = (d: string | undefined) => (d ? Date.parse(`${d.slice(0, 10)}T12:00:00Z`) : NaN);
const firstName = (n: string | undefined) => (n ? n.trim().split(/\s+/)[0] : "Their contact");

/* ---------- titles ---------- */

/** A title that reads like someone selling: account executive, SDR, sales engineer, customer success manager. */
export const SELLER_TITLE =
  /\b(account (executive|manager|director|lead)|(enterprise|strategic|mid-?market|commercial|regional) (account|sales)|sales (development|representative|rep|engineer|executive|consultant|specialist)|business development (rep|representative|manager|executive)|solutions? (engineer|consultant|architect)|customer success (manager|lead)|partner(ship)? manager|\b(ae|sdr|bdr|csm)\b)/i;
/** A title that reads like a recruiter or a search consultant. */
export const RECRUITER_TITLE = /\b(recruit\w*|talent (acquisition|partner|advisor|sourcer|scout)|sourcer|headhunter|executive search|search (consultant|partner))\b/i;
/** A title that reads like an investor's. */
export const INVESTOR_TITLE = /\b(general partner|managing partner|venture partner|operating partner|partner|principal|investor|investment (associate|director|manager)|managing director|associate|limited partner|gp|lp)\b/i;
/** A firm's name or domain that reads like an investor's. */
export const INVESTOR_ORG = /(capital|ventures?|\bvc\b|equity|\bfund\b|funds|investments?|invest\b|holdings|angels?\b|\bpartners\b)/i;
/** A title that says they work as a fractional, interim or part-time leader. */
export const FRACTIONAL_TITLE = /\b(fractional|interim|part[- ]time (cfo|cmo|cro|coo|cto|ciso|cpo|chro|exec\w*|leader|vp|head))\b/i;
/** Industries that read as a software or technology vendor's. */
export const SOFTWARE = new Set([
  "SaaS", "Enterprise Software", "SMB Software", "Fintech", "Payments & Fintech Infrastructure", "Developer Tools", "Cybersecurity", "Data & Analytics", "IT Services",
  "Deep Tech / AI", "Marketplace", "Telecommunications & Connectivity", "Data Centers & Colocation", "Research, Data & Information Services",
]);
const BIG = new Set(["1,001+"]);
const MID_UP = new Set(["201–500", "501–1,000", "1,001+"]);

/**
 * What a person's own title, organisation or email domain says they are: another fractional, an
 * investor, a recruiter, someone selling. Null: it says none of these.
 */
export function personKind(p: { title?: string | null; org?: string | null; email?: string | null }, domain?: string | null): PersonKind | null {
  const title = p.title ?? "";
  const org = p.org ?? "";
  const dom = domain ?? (p.email ? p.email.split("@")[1] ?? "" : "");
  if (FRACTIONAL_TITLE.test(title)) return "fractional";
  if (dom && firmReason({ name: dom.split(".")[0], website: dom }) === "known firm") return "fractional";
  if (org && firmReason({ name: org }) === "known firm") return "fractional";
  if (RECRUITER_TITLE.test(title)) return "recruiter";
  if (INVESTOR_TITLE.test(title) && (INVESTOR_ORG.test(org) || INVESTOR_ORG.test(dom.split(".")[0] ?? ""))) return "investor";
  if (/\b(investor|venture capitalist)\b/i.test(title)) return "investor";
  if (SELLER_TITLE.test(title)) return "seller";
  return null;
}

/** The person a company is judged by: the one the member met most, else the first with a title. */
const lead = (c: NetCompany): NetPerson | undefined =>
  [...c.people].sort((a, b) => (b.meetings ?? 0) - (a.meetings ?? 0) || (b.emails ?? 0) - (a.emails ?? 0) || Number(!!b.title) - Number(!!a.title))[0];

/* ---------- clients ---------- */

const monthsBetween = (from: string, to: string) => {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
};

/**
 * Regular meetings over months: SEAT_MEETINGS or more, in SEAT_MONTHS or more distinct months, at
 * SEAT_RATE meetings a month or more from the first month to the last. The shape of a seat, past
 * or present. Null: a prospect's few calls, a burst, a yearly check-in.
 */
export function seatPattern(c: Pick<NetCompany, "months" | "meetings" | "upcoming" | "last">, nowMs: number): { from: string; to: string; meetings: number; months: number; active: boolean } | null {
  const months = c.months ?? [];
  const meetings = c.meetings ?? 0;
  if (months.length < SEAT_MONTHS || meetings < SEAT_MEETINGS) return null;
  const from = months[0];
  const to = months[months.length - 1];
  const span = monthsBetween(from, to);
  if (meetings / span < SEAT_RATE) return null;
  const last = dayMs(c.last);
  const active = (c.upcoming ?? 0) > 0 || (Number.isFinite(last) && nowMs - last <= CLIENT_RECENT_DAYS * DAY_MS);
  return { from, to, meetings, months: span, active };
}

/* ---------- companies ---------- */

export interface CoFacts {
  industry: string | null;
  employees: string | null;
}

/** Merlin's own judgement of a company in the member's network: set aside, with why, or null (a relationship). */
export interface Judged {
  kind: SetKind;
  why: string;
}

/**
 * Is this company someone selling to the member, a recruiter, or an investor? In that order of
 * evidence, each with the reason said as it is. `mine`: the member holds a seat there (then it is
 * never set aside: they work there). A client pattern (seatPattern, still going) is never a vendor
 * by its size alone.
 */
export function judgeCompany(c: NetCompany, f: CoFacts, opts: { mine: boolean; nowMs: number }): Judged | null {
  if (opts.mine) return null;
  const p = lead(c);
  const who = firstName(p?.name);
  const meetings = c.meetings ?? 0;
  // Investors: a VC or PE firm on Merlin, or the person met most is one by their own title.
  if (f.industry === "Private Equity & Venture Capital") return { kind: "investor", why: "A venture or private equity firm on Merlin" };
  const pk = p ? personKind(p, c.domain) : null;
  if (pk === "investor") return { kind: "investor", why: `${who}'s title reads like an investor's (${p!.title})` };
  // Recruiters: a staffing firm, or a recruiter's title.
  if (f.industry === "Staffing & Recruiting") return { kind: "recruiter", why: "A staffing and recruiting firm on Merlin" };
  if (pk === "recruiter") return { kind: "recruiter", why: `${who}'s title reads like a recruiter's (${p!.title})` };
  const client = seatPattern(c, opts.nowMs);
  if (client?.active) return null;
  // Someone selling: their title, a large software company, or the shape of a sales process.
  if (pk === "seller") return { kind: "vendor", why: `${who}'s title reads like sales (${p!.title})` };
  const sellers = c.people.filter((x) => x.title && SELLER_TITLE.test(x.title));
  if (sellers.length && sellers.length >= c.people.filter((x) => x.title).length / 2)
    return { kind: "vendor", why: `${firstName(sellers[0].name)}'s title reads like sales (${sellers[0].title})` };
  if (f.employees && BIG.has(f.employees) && f.industry && SOFTWARE.has(f.industry))
    return { kind: "vendor", why: `A ${f.industry} company of ${f.employees} people: more often selling to you than hiring you` };
  const span = (dayMs(c.last) - dayMs(c.first)) / DAY_MS;
  const theirs = c.invitedBy ?? 0;
  if (meetings >= 1 && meetings <= 4 && theirs >= meetings && Number.isFinite(span) && span <= 45 && (c.side ?? 0) >= 2 && f.employees && MID_UP.has(f.employees))
    return {
      kind: "vendor",
      why: `They sent every invite: ${meetings} ${meetings === 1 ? "meeting" : "meetings"} ${span < 8 ? "in one week" : `in ${Math.max(2, Math.round(span / 7))} weeks`}, ${c.side} of their people at most. The shape of a sales process`,
    };
  return null;
}

/** "ridgelinecapital.example" -> "Ridgelinecapital": a domain as a name, when nothing better is on file. */
export const domainName = (d: string | null | undefined) => {
  const k = firmSite(d ?? "").split(".")[0] ?? "";
  return k ? k.charAt(0).toUpperCase() + k.slice(1) : null;
};
