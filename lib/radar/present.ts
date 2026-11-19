/**
 * A signal as a member is shown it: the one place that decides what a card reveals. Pure.
 *
 * Every member gets every signal. A company's name is locked for everyone until they unlock it,
 * so a card names the company only when the member's own table shows it (`visible`, the table's
 * identityHidden rule). A company locked for them reads by its free facts: the size band,
 * industry, state or region and country, the function hired or the role's title (with the
 * company's name and site cut out of it, and dropped for "Fractional <function> role" when a word
 * of the company's name is still in it), and the revenue band. No person is ever named: not the
 * seat holder, not anyone at the company. No record id either: every card links to the day's
 * companies in the app (radarPath), where each locked one unlocks right on its row.
 */
import type { RadarCard, RadarDay, RadarKind } from "./types";
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

/** A role title safe for a company the member can't see: no word of the company's name left in it. */
export function safeTitle(title: string | null, companyName: string, fn: string | null): string {
  const fallback = fn ? `Fractional ${fn} role` : "Fractional role";
  if (!title) return fallback;
  const t = title.toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "");
  return nameWords(companyName).some((w) => new RegExp(`(^|[^a-z0-9])${w}($|[^a-z0-9])`).test(t)) ? fallback : title;
}

export interface CardContext {
  /** The member's table shows this company (identityHidden is false for them). */
  visible: (companyId: string) => boolean;
  /** An opaque id for a signal key, per member. */
  cardId: (key: string) => string;
  /** An opaque id for a company, per member (never its public id). */
  coId: (companyId: string) => string;
  /** The day's companies in the app (radarPath). */
  url: string;
}

/** "a Software company", "an E-commerce company", or "a company in your profile". */
const someCompany = (industry: string | null) => (industry ? `${an(industry)} ${industry} company` : "a company in your profile");

export function cardOf(sig: RawSignal & { why: string }, ctx: CardContext): RadarCard {
  const seen = ctx.visible(sig.companyId);
  const who = seen ? sig.co.name : sig.kind === "role" ? "a company that's hiring now" : someCompany(sig.co.industry);
  const fn = sig.fn ?? "";
  const title = seen ? sig.title || `Fractional ${fn} role` : safeTitle(sig.title, sig.co.name, sig.fn);
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
    co: ctx.coId(sig.companyId),
    kind: sig.kind,
    headline,
    facts: factsOf(sig.co),
    why: sig.why,
    company: seen ? sig.co.name : null,
    ...(seen ? {} : { locked: true }),
    url: ctx.url,
    at: sig.at,
  };
}

/**
 * The line a company's row in the day's view carries for one signal. It never names the company
 * (the row does, when the member can see it) nor a person: "Hired a fractional Finance leader ·
 * Finance usually comes before Sales, and they have no fractional Sales yet".
 */
export function viewLine(sig: RawSignal & { why: string }): string {
  const fn = sig.fn ?? "";
  switch (sig.kind) {
    case "adjacent":
      return `Hired a fractional ${fn} leader · ${sig.why}`;
    case "role":
      return `New open role: ${safeTitle(sig.title, sig.co.name, sig.fn)} · In your function`;
    case "seat":
      return `A fractional ${fn} seat just ended · A seat like yours`;
    case "funding":
      return `Raised ${sig.round ? `a ${sig.round}` : "money"}${sig.amount ? ` (${sig.amount})` : ""} · Money in usually means hiring`;
  }
}

/** One delivery: every card, and the day's companies. Null with no signals (a nothing-day is never sent). */
export function dayOf(sigs: (RawSignal & { why: string })[], ctx: CardContext, mode: RadarDay["mode"], day: string): RadarDay | null {
  if (!sigs.length) return null;
  return { cards: sigs.map((x) => cardOf(x, ctx)), total: sigs.length, companies: new Set(sigs.map((x) => x.companyId)).size, day, url: ctx.url, mode };
}

/** What a day's view lists, from the kept rows: one entry a company, in the order they came, its lines in order. */
export function rowsOf(sent: { c: string; kind: RadarKind; l: string }[], pub: (companyId: string) => string): { id: string; c: string; kinds: RadarKind[]; lines: string[] }[] {
  const by = new Map<string, { id: string; c: string; kinds: RadarKind[]; lines: string[] }>();
  for (const x of sent) {
    let r = by.get(x.c);
    if (!r) by.set(x.c, (r = { id: pub(x.c), c: x.c, kinds: [], lines: [] }));
    if (!r.kinds.includes(x.kind)) r.kinds.push(x.kind);
    if (!r.lines.includes(x.l)) r.lines.push(x.l);
  }
  return [...by.values()];
}
