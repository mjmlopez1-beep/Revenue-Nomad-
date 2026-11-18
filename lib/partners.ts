/**
 * Referral partners: the words Merlin writes when a member reaches a fellow fractional. Shared by
 * the app (the record's seat holder, the Referral partners page), the server (the conversation an
 * invite opens) and the connector. Pure, no Node imports.
 *
 *   seatOpener   "Message Ana": the first message, which the member can change before it goes.
 *   inviteNote   "Invite to connect": the note for a fractional who isn't on Merlin yet, ending in
 *                their seat's claim link with the member's invite code (/claim/<token>?ref=<code>).
 *   connectText  the first message of the conversation an invite opens once they claim the seat.
 *   clientKinds  "SaaS companies of 51–200 people in the US", from an Ideal Fractional Profile.
 *
 * None of them says where a seat holder's name came from. lib/table.ts loads this file, so it
 * imports only from lib/ (relative paths): the server's modules load without the app's "@/" paths.
 */
import type { Icp } from "./tableTypes";
import { RN_EMPLOYEES, RN_REVENUE, industryWords } from "./tableFields";

/**
 * Picked bands as ranges, as the table's pill says them (app/post/model.ts bandRange): neighbours
 * join ("11–50" and "51–200" read "11–200"), an open end stays open ("Under $1M", "$50M+").
 */
function bandRange(list: string[], picked: string[]): string {
  const at = picked.map((v) => list.indexOf(v)).filter((n) => n >= 0).sort((a, b) => a - b);
  const ends = (v: string): [string | null, string | null] | null => {
    const u = v.match(/^Under (.+)$/);
    if (u) return [null, u[1]];
    const plus = v.match(/^(.+)\+$/);
    if (plus) return [plus[1], null];
    const two = v.split("–");
    return two.length === 2 ? [two[0], two[1]] : null;
  };
  const runs: number[][] = [];
  for (const n of at) {
    const run = runs[runs.length - 1];
    if (run && run[run.length - 1] === n - 1 && ends(list[n]) && ends(list[run[0]])) run.push(n);
    else runs.push([n]);
  }
  return runs
    .map((run) => {
      if (run.length === 1) return list[run[0]];
      const lo = ends(list[run[0]])![0];
      const hi = ends(list[run[run.length - 1]])![1];
      return lo === null ? `Under ${hi}` : hi === null ? `${lo}+` : `${lo}–${hi}`;
    })
    .join(", ");
}

/** A country, short: "US" and "UK" for every spelling of them, else the name (app/post/model.ts countryShort). */
function countryShort(v: string): string {
  const k = v.trim().toLowerCase().replace(/\./g, "");
  if (k === "us" || k === "usa" || k === "united states" || k === "united states of america") return "US";
  if (k === "uk" || k === "united kingdom") return "UK";
  return v.trim();
}

/** The most characters a note keeps (a message's limit). */
export const NOTE_MAX = 2000;

const flat = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
/** The part of a title before " at ", a comma, a bar, a dash or a bracket: "Fractional CMO at Acme" reads "Fractional CMO". */
const titleOnly = (v: unknown) => flat(v).split(/\s+(?:at|@)\s+|,|\s[|–—-]\s|\s\(/i)[0].trim().slice(0, 60);
/** "a, b and c". */
const listOf = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/** The first word of a name, for a greeting. */
export const firstOf = (name: string) => flat(name).split(" ")[0] || flat(name);

/** "the fractional CMO seat", from the role the member can see ("Fractional CMO"), else the seat's function. */
export function seatWords(role: string | null | undefined, fn: string | null | undefined): string {
  const r = titleOnly(role);
  if (/^fractional\s+/i.test(r)) return `the fractional ${r.replace(/^fractional\s+/i, "")} seat`;
  if (/^(interim|acting|advisory|part-time)\b/i.test(r)) return `the ${r.charAt(0).toLowerCase()}${r.slice(1)} seat`;
  if (r) return `the fractional ${r} seat`;
  const f = flat(fn);
  return f && f !== "Other" ? `the fractional ${f} seat` : "a fractional seat";
}

/** "a fractional VP Sales", from the member's title, else "a fractional Sales leader", else "a fractional leader". */
export function myWords(title: string | null | undefined, fn: string | null | undefined): string {
  const t = titleOnly(title);
  if (t && !/^member$/i.test(t)) return `a fractional ${t.replace(/^fractional\s+/i, "")}`;
  const f = flat(fn);
  return f && f !== "Other" && f !== "Executive" ? `a fractional ${f} leader` : "a fractional leader";
}

/** "SaaS and Fintech companies of 51–200 people in the US", from an Ideal Fractional Profile. Null when it names nothing. */
export function clientKinds(icp: Icp | null | undefined): string | null {
  if (!icp) return null;
  const inds = industryWords(icp.industries ?? []).map((x) => x.replace(/\s*\(all\)$/i, ""));
  const ind = inds.length > 3 ? `${inds.slice(0, 3).join(", ")} and other` : listOf(inds);
  const size = icp.employees?.length ? `of ${bandRange(RN_EMPLOYEES, icp.employees)} people` : icp.revenue?.length ? `with ${bandRange(RN_REVENUE, icp.revenue)} in revenue` : "";
  const places = (icp.countries ?? []).map(countryShort).map((c) => (c === "US" || c === "UK" ? `the ${c}` : c));
  const place = places.length ? `in ${listOf(places.slice(0, 3))}${places.length > 3 ? " and more" : ""}` : "";
  if (!ind && !size && !place) return null;
  return [`${ind ? `${ind} ` : ""}companies`, size, place].filter(Boolean).join(" ");
}

export interface SeatWords {
  /** The seat holder's first name. */
  first: string;
  /** The seat's role as the member sees it, else its function. */
  role?: string | null;
  fn?: string | null;
  company: string;
  /** The member writing: their title, function and Ideal Fractional Profile. */
  myTitle?: string | null;
  myFn?: string | null;
}

/** The first message to a seat holder who is on Merlin ("Message Ana"). */
export function seatOpener(o: SeatWords): string {
  return `Hi ${o.first}, I saw you held ${seatWords(o.role, o.fn)} at ${o.company}. I work with similar companies as ${myWords(o.myTitle, o.myFn)}. Open to swapping notes and referrals?`;
}

/** The note's first paragraph: their first name, the seat, the member's function and kind of clients, and the ask. */
export function notePitch(o: SeatWords & { icp?: Icp | null }): string {
  const kinds = clientKinds(o.icp);
  return `Hi ${o.first}, I saw you held ${seatWords(o.role, o.fn)} at ${o.company}. I'm ${myWords(o.myTitle, o.myFn)} and I work with ${kinds ?? `companies like ${o.company}`}. Open to connecting as referral partners and swapping notes?`;
}

/**
 * The note for a seat holder who isn't on Merlin yet ("Invite to connect"): the pitch, then the
 * seat's claim link with the member's invite code. Claiming the seat through it connects them on Merlin.
 */
export function inviteNote(o: SeatWords & { icp?: Icp | null; link: string }): string {
  return [notePitch(o), `Your seat is on Merlin, a data exchange for fractional operators. Claim it with this link and we're connected there.\n${o.link}`].join("\n\n");
}

/** The first message to a member listed in Referral partners ("Connect"), about no seat. */
export function partnerOpener(o: { first: string; myTitle?: string | null; myFn?: string | null; icp?: Icp | null }): string {
  const kinds = clientKinds(o.icp);
  return `Hi ${o.first}, I'm ${myWords(o.myTitle, o.myFn)}${kinds ? ` working with ${kinds}` : ""}. I found you in Merlin's referral partners. Open to swapping notes and referrals?`;
}

/** A note as it is kept: line breaks kept, control characters and runs of blank lines gone, at most NOTE_MAX characters. */
export function cleanNote(raw: unknown): string {
  const text = String(raw ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  return [...text].slice(0, NOTE_MAX).join("");
}

/**
 * The first message of the conversation an invite opens, from the inviter: who invited them, then
 * the note without the paragraph that holds the claim link (they just used it).
 */
export function connectText(inviterFirst: string, note: string | null | undefined): string {
  const head = `${inviterFirst} invited you to connect as referral partners.`;
  const body = cleanNote(note)
    .split(/\n\s*\n/)
    .filter((p) => p.trim() && !/\/claim\/[A-Za-z0-9_-]{10,}/.test(p))
    .join("\n\n");
  return [...(body ? `${head}\n\n${body}` : head)].slice(0, NOTE_MAX).join("");
}
