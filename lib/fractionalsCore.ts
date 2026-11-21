/**
 * Fractionals: one record per fractional, the rules that need no state. Pure, relative imports
 * only, so the server (lib/table.ts, lib/fractionals.ts), the app and the tests share them.
 *
 *  - groupSeats: which seats are one person. A member's seats go together first (the seat holder
 *    resolves to them), then seats that carry the same one-way person key (`holderKey`, an HMAC
 *    the seat files' importer writes; it never leaves the server). A named seat with neither is a
 *    record of its own. Two seats are never put together by their name alone, a key never joins two
 *    different members, and a seat a member said isn't theirs never joins them through a key.
 *  - levelOf: the level a title reads as (C-level, VP, Head, Lead), by lib/seniority.ts.
 *  - clients: the kind of clients a fractional serves, from what a member states (their Ideal
 *    Fractional Profile) or read from their seats' companies (industry, size, revenue, place).
 *  - fitsIcp: whether those clients look like the viewer's Ideal Fractional Profile.
 */
import { seniorityOf } from "./seniority";
import type { Icp } from "./tableTypes";

/* ---------- levels ---------- */

export const LEVELS = ["C-level", "VP", "Head", "Lead"] as const;
export type Level = (typeof LEVELS)[number];

/** The level a title reads as: C-level, VP, Head (a Director reads as Head), Lead. Null when it shows none, or reads below Lead. */
export function levelOf(title: string | null | undefined): Level | null {
  const s = seniorityOf(title);
  if (s === "C-level" || s === "VP" || s === "Lead") return s;
  if (s === "Head" || s === "Director") return "Head";
  return null;
}
/** Higher first: C-level 0, VP 1, Head 2, Lead 3, none 4. */
export const levelRank = (l: Level | null | undefined) => (l ? LEVELS.indexOf(l) : LEVELS.length);

/* ---------- one record per fractional ---------- */

/** A named seat, as grouping reads it: the member its holder resolves to, and its person key. */
export interface SeatLink {
  id: string;
  member: string | null;
  key: string | null;
}

/**
 * The seats of each fractional. `refused(member, seat)`: the member said this seat isn't theirs, so
 * a key never brings it into their record. Seats come back in the order given; groups in the order
 * of their first seat. Union-find over seats, member nodes ("m:") and key nodes ("k:").
 */
export function groupSeats(seats: SeatLink[], refused: (member: string, seatId: string) => boolean = () => false): { groups: string[][]; groupOf: Map<string, number> } {
  const parent = new Map<string, string>();
  const members = new Map<string, Set<string>>();
  const find = (x: string): string => {
    let r = x;
    while (parent.has(r) && parent.get(r) !== r) r = parent.get(r)!;
    // Path compression.
    let y = x;
    while (parent.has(y) && parent.get(y) !== r) {
      const next = parent.get(y)!;
      parent.set(y, r);
      y = next;
    }
    return r;
  };
  const node = (x: string) => {
    if (!parent.has(x)) parent.set(x, x);
  };
  const membersOf = (root: string) => members.get(root) ?? new Set<string>();
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra === rb) return;
    parent.set(rb, ra);
    const m = new Set([...membersOf(ra), ...membersOf(rb)]);
    members.delete(rb);
    if (m.size) members.set(ra, m);
  };
  for (const s of seats) {
    node(`s:${s.id}`);
    if (s.member) {
      node(`m:${s.member}`);
      if (!members.has(find(`m:${s.member}`))) members.set(find(`m:${s.member}`), new Set([s.member]));
      union(`m:${s.member}`, `s:${s.id}`);
    }
  }
  // Keys: a member's own seats first, so a seat they refused can't come in ahead of them.
  const keyed = [...seats.filter((s) => s.key && s.member), ...seats.filter((s) => s.key && !s.member)];
  for (const s of keyed) {
    const k = `k:${s.key}`;
    node(k);
    const here = membersOf(find(`s:${s.id}`));
    const there = membersOf(find(k));
    const both = new Set([...here, ...there]);
    // Never two members in one record, and never a seat into the record of a member who said it isn't theirs.
    if (both.size > 1) continue;
    if (!s.member && [...there].some((m) => refused(m, s.id))) continue;
    union(k, `s:${s.id}`);
  }
  const byRoot = new Map<string, number>();
  const groups: string[][] = [];
  const groupOf = new Map<string, number>();
  for (const s of seats) {
    const r = find(`s:${s.id}`);
    let gi = byRoot.get(r);
    if (gi === undefined) {
      gi = groups.length;
      byRoot.set(r, gi);
      groups.push([]);
    }
    groups[gi].push(s.id);
    groupOf.set(s.id, gi);
  }
  return { groups, groupOf };
}

/* ---------- the clients they serve ---------- */

/** A seat's company, by its free facts only. */
export interface ClientCo {
  industry: string | null;
  employees: string | null;
  revenue: string | null;
  /** The country the HQ names, spelled as the records spell it ("United States"). */
  country: string | null;
}

export interface Clients {
  /** "stated": the member said who they serve (their Ideal Fractional Profile). "seats": read from their seats' companies. */
  from: "stated" | "seats";
  /** Most common first. */
  industries: string[];
  employees: string[];
  revenue: string[];
  countries: string[];
}

const countryKey = (v: string) => {
  const k = v.trim().toLowerCase().replace(/\./g, "");
  return k === "us" || k === "usa" || k === "united states of america" ? "united states" : k === "uk" ? "united kingdom" : k;
};
/** "US", "UK", else the country as spelled. */
export const shortCountry = (v: string) => (countryKey(v) === "united states" ? "US" : countryKey(v) === "united kingdom" ? "UK" : v.trim());

/** The values most common first (ties in the order first seen). */
function byCount(xs: (string | null | undefined)[]): string[] {
  const n = new Map<string, number>();
  for (const x of xs) if (x && x.trim()) n.set(x, (n.get(x) ?? 0) + 1);
  return [...n.entries()].sort((a, b) => b[1] - a[1]).map(([v]) => v);
}

/** Read from the companies they held seats at: each fact as often as it appears there. */
export function clientsFromSeats(cos: ClientCo[]): Clients {
  return {
    from: "seats",
    industries: byCount(cos.map((c) => c.industry)),
    employees: byCount(cos.map((c) => c.employees)),
    revenue: byCount(cos.map((c) => c.revenue)),
    countries: byCount(cos.map((c) => c.country)),
  };
}

/** What the member says: their Ideal Fractional Profile. Null when it names nothing. */
export function clientsFromIcp(icp: Icp | null | undefined): Clients | null {
  if (!icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length)) return null;
  return { from: "stated", industries: [...icp.industries], employees: [...icp.employees], revenue: [...icp.revenue], countries: [...icp.countries] };
}

/**
 * One line, never a crowd: two industries (and "+2"), the most common size, the place.
 * "SaaS, Fintech +1 · 51–200 · US". Empty when nothing is known.
 */
export function clientsLine(c: Clients | null | undefined): string {
  if (!c) return "";
  const ind = c.industries.slice(0, 2).join(", ") + (c.industries.length > 2 ? ` +${c.industries.length - 2}` : "");
  const size = c.employees[0] ?? c.revenue[0] ?? "";
  const place = c.countries.slice(0, 2).map(shortCountry).join(", ");
  return [ind, size, place].filter(Boolean).join(" · ");
}

/**
 * The clients look like the viewer's Ideal Fractional Profile.
 *  - stated: every part both of them name overlaps, and they name at least one part in common.
 *  - seats: at least one of their seats' companies fits as the table's own test reads a company
 *    (icpTest in app/post/model.ts): no part it is known to break, and at least one part that matches.
 * Null profile: nothing to fit (the filter is off).
 */
export function fitsIcp(icp: Icp | null | undefined, clients: Clients | null, cos: ClientCo[]): boolean {
  if (!icp || !(icp.industries.length || icp.employees.length || icp.revenue.length || icp.countries.length)) return true;
  const lower = (v: string) => v.trim().toLowerCase();
  if (clients?.from === "stated") {
    const dims: [string[], string[], (v: string) => string][] = [
      [icp.industries, clients.industries, lower],
      [icp.employees, clients.employees, (v) => v],
      [icp.revenue, clients.revenue, (v) => v],
      [icp.countries, clients.countries, countryKey],
    ];
    let common = 0;
    for (const [want, have, key] of dims) {
      if (!want.length || !have.length) continue;
      common++;
      const h = new Set(have.map(key));
      if (!want.some((w) => h.has(key(w)))) return false;
    }
    return common > 0;
  }
  const inds = new Set(icp.industries.map(lower));
  const ctys = new Set(icp.countries.map(countryKey));
  return cos.some((c) => {
    const parts = [
      icp.industries.length && c.industry ? inds.has(lower(c.industry)) : null,
      icp.employees.length && c.employees ? icp.employees.includes(c.employees) : null,
      icp.revenue.length && c.revenue ? icp.revenue.includes(c.revenue) : null,
      icp.countries.length && c.country ? ctys.has(countryKey(c.country)) : null,
    ];
    return !parts.includes(false) && parts.includes(true);
  });
}

/* ---------- words ---------- */

/** "Dana W.": a member who hasn't chosen yet shows this way, as Referral partners did. */
export function shortName(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return parts[0] ?? "";
  const last = parts[parts.length - 1];
  return `${parts[0]} ${last.charAt(0).toUpperCase()}.`;
}

/** "Fractional Sales leader": what a record leads with while its titles aren't visible. */
export const fnLead = (fn: string | null | undefined) => (fn && fn !== "Other" ? `Fractional ${fn} leader` : "Fractional leader");

/** "2 now · 5 past". */
export const seatsLine = (now: number, past: number) => `${now} now · ${past} past`;

/** The invite bonus a member who invited someone gets when they activate: at most this many inviters are paid for one activation. */
export const ACTIVATE_INVITERS_PAID = 5;
