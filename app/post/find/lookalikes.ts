/**
 * Lookalikes (owner decision, Stage 1): reverse engineer what worked into a target list. Honest
 * rules, no AI. Pure, so scripts/test-lookalikes.mts checks it.
 *
 *   seeds      by default the companies where the member held a seat (Your seats); the member adds
 *              or removes any company they can see (a current client, a won deal).
 *   profile    read from the seeds: their industries, employee bands, revenue bands, HQ regions,
 *              the functions they hired fractionally, and repeat hirer when most of them are one.
 *              Written as trait tokens in Filters.like (app/post/model.ts), so the table and a saved
 *              list read it the same way, and shown as chips the member can take off.
 *   matches    companies sharing at least 3 of the traits (all of them when fewer are known),
 *              never a seed, never one already in the member's pipeline, ranked by how many they
 *              share, with "why it matched" per row.
 *
 * Onboarding (Stage 9) shows lookalikes right after the member adds their seats with
 * lookalikesFor(infos, me) (or with the seed ids it just added), which returns the profile's
 * words and the ranked rows, and likeFilters() for the Find address to open.
 */
import type { IcpDropped, Me } from "@/lib/tableTypes";
import {
  EMPTY_FILTERS, LIKE_TRAITS, applyFilters, likeParts, likeShared, mySeats, regionOf, repeatHirer, rowsFor, shown,
  type CoInfo, type Filters, type LikeTrait, type Row,
} from "../model";
import { RN_EMPLOYEES, RN_REVENUE, industryWords } from "@/lib/tableFields";

/** The member's default seeds: the companies of their own seats, in order, each once. */
export function defaultSeeds(infos: CoInfo[], me: Me): string[] {
  return [...new Set(mySeats(infos, me).map((s) => s.i.c.id))];
}

/**
 * A past client's revenue or size as of when the member worked there: their own seat's "revenue
 * then" or "employees then", else what is on file today (the learned ideal client reads a client
 * the same way, lib/idealClient.ts).
 */
export function thenFact(i: CoInfo, k: "revenue" | "employees"): string | null {
  for (const e of i.engs) if (e.yours && shown(e.cells[k])) return shown(e.cells[k]);
  return shown(i.c.cells[k]);
}

/**
 * The profile's tokens from seed companies. A trait no seed has on file is left out. `dropped`:
 * the values the member dropped from their learned ideal client (Me.ideal.dropped), left out here
 * too, so Lookalikes searches by the same learned profile.
 */
export function profileOf(seeds: CoInfo[], dropped?: IcpDropped | null): string[] {
  if (!seeds.length) return [];
  const off = (k: "industries" | "employees" | "revenue", v: string) => (dropped?.[k] ?? []).some((x) => x.trim().toLowerCase() === v.trim().toLowerCase());
  const add = (set: Set<string>, v: string | null | undefined, k?: "industries" | "employees" | "revenue") => v && !(k && off(k, v)) && set.add(v);
  const ind = new Set<string>();
  const emp = new Set<string>();
  const rev = new Set<string>();
  const reg = new Set<string>();
  const fns = new Set<string>();
  let rep = 0;
  for (const i of seeds) {
    add(ind, shown(i.c.cells.industry), "industries");
    add(emp, thenFact(i, "employees"), "employees");
    add(rev, thenFact(i, "revenue"), "revenue");
    add(reg, regionOf(i.c));
    for (const f of i.fnState.hired) if (f !== "Other") fns.add(f);
    if (repeatHirer(i)) rep++;
  }
  return [
    ...[...ind].map((v) => `i:${v}`),
    ...RN_EMPLOYEES.filter((v) => emp.has(v)).map((v) => `e:${v}`),
    ...RN_REVENUE.filter((v) => rev.has(v)).map((v) => `r:${v}`),
    ...[...reg].map((v) => `g:${v}`),
    ...[...fns].map((v) => `f:${v}`),
    ...(rep * 2 > seeds.length ? ["rep"] : []),
    ...seeds.map((i) => `x:${i.c.id}`),
  ];
}

/** The profile without one trait (its chip taken off). */
export const withoutTrait = (tokens: string[], k: LikeTrait) => {
  const pre = { industry: "i:", employees: "e:", revenue: "r:", region: "g:", fns: "f:", repeat: "rep" }[k];
  return tokens.filter((t) => !t.startsWith(pre));
};

/** A band list in words: "51–200" and "201–500" read "51 to 500". */
function bandWords(list: string[], picked: Set<string>, unit = ""): string {
  const idx = list.map((v, k) => (picked.has(v) ? k : -1)).filter((k) => k >= 0);
  if (!idx.length) return "";
  const lo = list[idx[0]].split(/–|\+/)[0].replace(/^Under /, "under ");
  const last = list[idx[idx.length - 1]];
  const hi = last.includes("–") ? last.split("–")[1] : last.endsWith("+") || last.endsWith("M+") ? "" : last;
  if (idx.length === 1) return `${list[idx[0]].replace("–", " to ")}${unit}`;
  return hi ? `${lo} to ${hi}${unit}` : `${lo} or more${unit}`;
}

/** Each trait as a chip ("Software", "$5M to $20M", "51 to 200 people", "Texas", "hired Sales", "repeat hirers"). */
export function traitChips(tokens: string[]): { k: LikeTrait; label: string }[] {
  const p = likeParts(tokens);
  const out: { k: LikeTrait; label: string }[] = [];
  for (const k of LIKE_TRAITS) {
    const v = p.vals[k];
    if (!v.size) continue;
    const label =
      k === "industry" ? industryWords([...v]).map((x) => x.replace(" (all)", "")).join(", ") :
      k === "employees" ? bandWords(RN_EMPLOYEES, v, " people") :
      k === "revenue" ? bandWords(RN_REVENUE, v) :
      k === "region" ? [...v].join(", ") :
      k === "fns" ? `hired ${[...v].join(" or ")}` :
      "repeat hirers";
    out.push({ k, label });
  }
  return out;
}

/** "Built from 3 past clients: Software, $5M to $20M, 51 to 200 people, hired Sales." */
export function profileWords(tokens: string[]): string {
  const p = likeParts(tokens);
  const chips = traitChips(tokens).map((c) => c.label);
  const n = p.seeds.size;
  if (!n) return "No past clients picked yet.";
  return `Built from ${n === 1 ? "1 past client" : `${n} past clients`}${chips.length ? `: ${chips.join(", ")}` : ", with nothing on file to match yet"}.`;
}

const WHY: Record<LikeTrait, string> = { industry: "industry", employees: "size", revenue: "revenue", region: "region", fns: "functions hired", repeat: "a repeat hirer" };

export interface LikeRow {
  row: Row;
  shared: LikeTrait[];
  /** "Same industry, same size and hired the same functions". */
  why: string;
  /** The seed it is most like (named: the member's own past client), or null. */
  like: string | null;
}

/** Rows ranked by how many traits they share (most first), then by how often they hire fractionals. */
export function rankLike(rows: Row[], tokens: string[], seeds: CoInfo[] = []): LikeRow[] {
  const p = likeParts(tokens);
  const seen = new Set<string>();
  const out: LikeRow[] = [];
  for (const r of rows) {
    if (seen.has(r.i.c.id)) continue;
    seen.add(r.i.c.id);
    const shared = likeShared(p, r);
    // "Same industry, revenue, size and region", then "hired Sales" style parts as their own words.
    const sameOf = shared.filter((k) => k !== "repeat").map((k) => WHY[k]);
    const join = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}` : xs[0] ?? "");
    const why = [sameOf.length ? `Same ${join(sameOf)}` : "", shared.includes("repeat") ? "a repeat hirer" : ""].filter(Boolean).join(", ");
    const like = seeds.find((s) => shown(s.c.cells.industry) === shown(r.i.c.cells.industry) && !s.c.hidden) ?? seeds.find((s) => !s.c.hidden) ?? null;
    out.push({ row: r, shared, why, like: like ? like.c.name : null });
  }
  return out.sort((a, b) => b.shared.length - a.shared.length || b.row.i.c.friendly.score - a.row.i.c.friendly.score);
}

/** Find's filters for a profile (the Lookalikes kind opens on these). */
export const likeFilters = (tokens: string[], base: Filters = EMPTY_FILTERS): Filters => ({ ...base, like: tokens, icp: false });

/** Everything Onboarding or Home needs at once: the profile, its words, and the ranked matches. Seeds default to the member's seats. */
export function lookalikesFor(infos: CoInfo[], me: Me, seedIds?: string[]) {
  const ids = seedIds ?? defaultSeeds(infos, me);
  const byId = new Map(infos.map((i) => [i.c.id, i]));
  const seeds = ids.map((id) => byId.get(id)).filter((i): i is CoInfo => !!i);
  const tokens = profileOf(seeds, me.ideal?.dropped);
  const rows = tokens.length ? applyFilters(rowsFor("companies", infos), likeFilters(tokens), "all", "", me, true).rows : [];
  return { seeds, tokens, words: profileWords(tokens), ranked: rankLike(rows, tokens, seeds) };
}

/** Companies the member can see by name (a seed to add): names matching the words typed, never a locked one. */
export function seedMatches(infos: CoInfo[], text: string, skip: Set<string>, max = 6): CoInfo[] {
  const q = text.trim().toLowerCase();
  if (q.length < 2) return [];
  return infos.filter((i) => !i.c.hidden && !skip.has(i.c.id) && i.nameHay.includes(q)).slice(0, max);
}

/**
 * What a lookalike list's weekly email and Slack alert follow (open roles by free facts, lib/mcp/alerts.ts):
 * the profile's industries, sizes and functions. Without them it would follow every open role.
 */
export function likeCriteria(tokens: string[]): { industry?: string[]; employees?: string[]; functions?: string[] } {
  const p = likeParts(tokens);
  const list = (k: LikeTrait) => [...p.vals[k]];
  return {
    ...(p.vals.industry.size ? { industry: list("industry") } : {}),
    ...(p.vals.employees.size ? { employees: RN_EMPLOYEES.filter((v) => p.vals.employees.has(v)) } : {}),
    ...(p.vals.fns.size ? { functions: list("fns") } : {}),
  };
}
