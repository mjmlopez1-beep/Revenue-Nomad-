/**
 * A signal as a member is shown it: the one place that decides what each plan reveals. Pure.
 *
 * Free (and everyone while billing is off): no company, no person, no record id. The card reads
 * the size band, industry, state or region and country, the function hired or the role's title
 * (with the company's name and site cut out of it, and dropped for "Fractional <function> role"
 * when a word of the company's name is still in it), and the revenue band. Its link is the
 * upgrade link. A member gets one such card a day, with "N more today".
 *
 * Pro: every card, each linking to the company's record in the app, where the warm path is (who
 * held a seat there and who hired them, behind the same unlocks as always). The company is named
 * only when the member's own table shows it (`visible`, the table's identityHidden rule): a company
 * that is locked for them reads "a company that's hiring now" and the record is where they unlock
 * it. No person is ever named: not the seat holder, not anyone at the company.
 */
import type { RadarCard, RadarDay } from "./types";
import type { RawSignal } from "./signals";

const SHORT_COUNTRY: Record<string, string> = { "United States": "US", "United Kingdom": "UK" };
const an = (word: string) => (/^[aeiou]/i.test(word) && !/^(one|uni|use|eu)/i.test(word) ? "an" : "a");
const cap = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);

/** "Texas, US", "Ontario, Canada", "US", or null. Never a city. */
export function placeWords(co: { country: string | null; region: string | null }): string | null {
  if (!co.country) return null;
  const c = SHORT_COUNTRY[co.country] ?? co.country;
  return co.region ? `${co.region}, ${c}` : c;
}

/** The free facts on file, in the card's order: size band, industry, place, revenue band. */
export function factsOf(co: RawSignal["co"]): string[] {
  return [co.employees ? `${co.employees} people` : null, co.industry, placeWords(co), co.revenue ? `${co.revenue} revenue` : null].filter((x): x is string => !!x);
}

/** Words of a company's name long enough to give it away ("Acme Robotics" -> acme, robotics). */
const nameWords = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length >= 4 && !GENERIC.has(w));
/** Words common in company names and in titles alike: their presence in a title gives nothing away. */
const GENERIC = new Set(["group", "company", "holdings", "global", "partners", "solutions", "services", "systems", "technologies", "technology", "labs", "health", "capital", "ventures", "consulting", "marketing", "sales", "growth", "revenue", "finance", "operations", "people", "product", "brands", "digital", "media", "software", "data", "fractional", "head", "lead", "chief", "officer", "director", "president"]);

/** A role title safe for the free view: no word of the company's name left in it. */
export function safeTitle(title: string | null, companyName: string, fn: string | null): string {
  const fallback = fn ? `Fractional ${fn} role` : "Fractional role";
  if (!title) return fallback;
  const t = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return nameWords(companyName).some((w) => new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`).test(t)) ? fallback : title;
}

export interface CardContext {
  pro: boolean;
  /** The member's table shows this company (identityHidden is false for them). Asked only for Pro. */
  visible: (companyId: string) => boolean;
  /** The company's record in the app ("/?c=<public id>"). Asked only for Pro. */
  recordPath: (companyId: string) => string;
  /** The upgrade link (Free's "See who"). */
  seeWho: string;
  /** An opaque id for a signal key, per member. */
  cardId: (key: string) => string;
}

/** "a Software company", "an E-commerce company", or "a company in your profile". */
const someCompany = (industry: string | null) => (industry ? `${an(industry)} ${industry} company` : "a company in your profile");

export function cardOf(sig: RawSignal & { why: string }, ctx: CardContext): RadarCard {
  const pro = ctx.pro;
  const seen = pro && ctx.visible(sig.companyId);
  const locked = pro && !seen;
  const who = seen ? sig.co.name : locked && sig.kind === "role" ? "a company that's hiring now" : someCompany(sig.co.industry);
  const fn = sig.fn ?? "";
  const title = pro ? sig.title || `Fractional ${fn} role` : safeTitle(sig.title, sig.co.name, sig.fn);
  let headline: string;
  switch (sig.kind) {
    case "adjacent":
      headline = `${cap(who)} just hired a fractional ${fn} leader`;
      break;
    case "role":
      headline = `New open role: ${title}, at ${who}`;
      break;
    case "seat":
      headline = `A fractional ${fn} seat just ended at ${who}`;
      break;
    case "funding":
      headline = `${cap(who)} raised ${sig.round ? `a ${sig.round}` : "money"}${sig.amount ? ` (${sig.amount})` : ""}`;
      break;
  }
  return {
    id: ctx.cardId(sig.key),
    kind: sig.kind,
    headline,
    facts: factsOf(sig.co),
    why: sig.why,
    company: seen ? sig.co.name : null,
    ...(locked ? { locked: true } : {}),
    url: pro ? ctx.recordPath(sig.companyId) : ctx.seeWho,
    at: sig.at,
  };
}

/** One delivery: every card for Pro; for Free the first card and "N more". Null with no signals (a nothing-day is never sent). */
export function dayOf(sigs: (RawSignal & { why: string })[], ctx: CardContext & { radarPath: string }, mode: RadarDay["mode"]): RadarDay | null {
  if (!sigs.length) return null;
  if (ctx.pro) return { pro: true, cards: sigs.map((x) => cardOf(x, ctx)), more: 0, total: sigs.length, seeWho: ctx.radarPath, mode };
  return { pro: false, cards: [cardOf(sigs[0], ctx)], more: sigs.length - 1, total: sigs.length, seeWho: ctx.seeWho, mode };
}
