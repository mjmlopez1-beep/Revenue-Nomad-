/**
 * A signal as a member is shown it: the one place that decides what a card reveals. Pure.
 *
 * Every member gets every signal. A company's name is locked for everyone until they unlock it,
 * so a card names the company only when the member's own table shows it (`visible`, the table's
 * identityHidden rule). A company locked for them reads by its free facts: the size band,
 * industry, state or region and country, the function hired or the role's title (with the
 * company's name and site cut out of it, and dropped for "Fractional <function> role" when a word
 * of the company's name is still in it), and the revenue band. No person is ever named: not the
 * seat holder, not anyone at the company. Every card links to the day's companies in the app
 * (radarPath), where each locked one unlocks right on its row. Only a card that names its company
 * also carries its record (`place`, for Slack), and only one the member's table shows its logo: a
 * locked company's card never has a record id, a link to it or a logo.
 */
import type { RadarBand, RadarCard, RadarDay, RadarKind, RadarSigView } from "./types";
import type { RawSignal } from "./signals";
import { monthWords } from "./predict";

/** A signal as a member gets it: why it is theirs, and (scored) its band and why-now. */
export type MemberSignal = RawSignal & { why: string; band?: RadarBand; whyNow?: string };

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

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
/** A hire this many months old or more is no "just hired". */
export const JUST_MONTHS = 2;
/** Months from a start month ("2025-11") to a time, in UTC. */
const monthsSince = (ym: string, ms: number) => {
  const d = new Date(ms);
  return d.getUTCFullYear() * 12 + d.getUTCMonth() - (Number(ym.slice(0, 4)) * 12 + Number(ym.slice(5, 7)) - 1);
};

/**
 * An adjacent hire's own date, honestly: "just hired a fractional Marketing leader" only when it
 * started in the last JUST_MONTHS; else "hired a fractional Marketing leader in Dec 2025", with
 * "· newly added to Merlin" when the seat is old but came into Merlin in the last 30 days.
 */
export function hiredWords(sig: Pick<MemberSignal, "fn" | "ym" | "addedMs" | "atMs" | "reopen" | "standing">, nowMs = Date.now()): string {
  const fn = sig.fn ?? "";
  const ym = sig.ym && /^\d{4}-\d{2}$/.test(sig.ym) ? sig.ym : null;
  if (!ym) return `hired a fractional ${fn} leader`;
  const ago = monthsSince(ym, nowMs);
  const later = !!sig.reopen || !!sig.standing;
  if (ago < JUST_MONTHS && !later) return `just hired a fractional ${fn} leader`;
  const when = `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  const added = sig.standing ? undefined : sig.addedMs ?? (sig.reopen ? undefined : sig.atMs);
  const fresh = added !== undefined && nowMs - added <= 30 * 24 * 60 * 60 * 1000;
  return `hired a fractional ${fn} leader in ${when}${fresh && ago >= JUST_MONTHS ? " · newly added to Merlin" : ""}`;
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
  /**
   * The member's own table shows this company (not only a Trial or Pro name on the card). Left
   * out: the same as `visible`.
   */
  known?: (companyId: string) => boolean;
  /** A named company's record in the app ("/?c=<public id>"), or null. Only asked for a company the card names. */
  place?: (companyId: string) => string | null;
  /** A public https logo for a known company, or null. Only asked for a company the member's table shows. */
  logo?: (companyId: string) => string | null;
  /**
   * How a company the member doesn't know yet opens from Crystal Ball: "free" (Trial and Pro, any
   * Crystal Ball company), "one" (Free: one a day, in full), null (2 credits, as anywhere). Left out: null.
   */
  opens?: (companyId: string) => "free" | "one" | null;
  /** The company's record opened from this day's Crystal Ball (radarOpenPath): the email's card links. Left out: none. */
  open?: (companyId: string) => string | null;
}

/** "a Software company", "an E-commerce company", or "a company that fits your ideal client". */
const someCompany = (industry: string | null) => (industry ? `${an(industry)} ${industry} company` : "a company that fits your ideal client");

/** "raised a Series A ($12M)", or from a filing "raised about $5M (SAFE, SEC filing, Oct 2026)". */
const raised = (sig: MemberSignal) =>
  sig.fundNote
    ? `raised ${sig.amount ?? "money"} (${[sig.round, sig.fundNote].filter(Boolean).join(", ")})`
    : `raised ${sig.round ? `a ${sig.round}` : "money"}${sig.amount ? ` (${sig.amount})` : ""}`;

export function cardOf(sig: MemberSignal, ctx: CardContext): RadarCard {
  const seen = ctx.visible(sig.companyId);
  const who = seen ? sig.co.name : sig.kind === "role" ? "a company that's hiring now" : someCompany(sig.co.industry);
  const fn = sig.fn ?? "";
  const title = seen ? sig.title || `Fractional ${fn} role` : safeTitle(sig.title, sig.co.name, sig.fn);
  let headline: string;
  switch (sig.kind) {
    case "adjacent":
      headline = `${cap(who)} ${hiredWords(sig)}`;
      break;
    case "role":
      headline = `New open role: ${title}, at ${who}`;
      break;
    case "seat":
      headline = `A fractional ${fn} seat just ended at ${who}`;
      break;
    case "funding":
      headline = `${cap(who)} ${raised(sig)}`;
      break;
    case "sales-build":
      headline = sig.build && sig.build.from > 0 ? `${cap(who)} posted ${sig.build.to} full-time sales roles` : `${cap(who)} posted its first full-time sales roles`;
      break;
    case "departure":
      headline = `${cap(who)} no longer lists a ${fn} leader`;
      break;
    case "tenure":
      headline = `${cap(who)}'s fractional ${fn} seat is ${sig.tenure?.months ?? 12} months in`;
      break;
    case "rehire":
      headline = `${cap(who)} ended a fractional ${fn} seat${sig.ended ? ` in ${monthWords(sig.ended.end)}` : ""}`;
      break;
    case "arrival":
    case "team-build":
    case "headcount":
    case "gap":
      headline = `${cap(who)} ${lowerFirst(signalWords(sig, title))}`;
      break;
  }
  // A locked company is never linked, never pictured: only a company the card names has a place, only one the member knows a logo.
  const known = seen && (ctx.known ? ctx.known(sig.companyId) : true);
  const place = seen ? ctx.place?.(sig.companyId) ?? null : null;
  const logo = known ? ctx.logo?.(sig.companyId) ?? null : null;
  const opens = known ? null : ctx.opens?.(sig.companyId) ?? null;
  const open = ctx.open?.(sig.companyId) ?? null;
  return {
    id: ctx.cardId(sig.key),
    co: ctx.coId(sig.companyId),
    kind: sig.kind,
    headline,
    facts: factsOf(sig.co),
    why: sig.why,
    ...(sig.band ? { band: sig.band } : {}),
    ...(sig.whyNow ? { whyNow: sig.whyNow } : {}),
    company: seen ? sig.co.name : null,
    ...(seen ? {} : { locked: true }),
    url: ctx.url,
    at: sig.at,
    subject: cap(who),
    signal: signalWords(sig, title),
    about: aboutOf(sig.co),
    ...(place ? { place } : {}),
    ...(open ? { open } : {}),
    ...(known ? { known: true } : {}),
    ...(opens ? { opens } : {}),
    ...(logo && /^https:\/\/[^\s<>|]+$/.test(logo) ? { logo } : {}),
  };
}

/** The free facts on file, each by name: the card's `about`. */
export function aboutOf(co: RawSignal["co"]): NonNullable<RadarCard["about"]> {
  const place = placeWords(co);
  return {
    ...(co.industry ? { industry: co.industry } : {}),
    ...(co.employees ? { size: `${co.employees} people` } : {}),
    ...(place ? { hq: place } : {}),
    ...(co.revenue ? { revenue: co.revenue } : {}),
  };
}

/**
 * What happened, as a sentence without the company (the post sets the company above it): "No
 * longer lists a Sales leader", "New open role: Fractional VP Sales". `title` is the role's title
 * as the card may show it (safeTitle for a company locked for the member).
 */
export function signalWords(sig: MemberSignal, title: string): string {
  const fn = sig.fn ?? "";
  switch (sig.kind) {
    case "adjacent":
      return cap(hiredWords(sig));
    case "role":
      return `New open role: ${title}`;
    case "seat":
      return `A fractional ${fn} seat just ended`;
    case "funding":
      return cap(raised(sig));
    case "sales-build":
      return sig.build && sig.build.from > 0 ? `Posted ${sig.build.to} full-time sales roles` : "Posted its first full-time sales roles";
    case "departure":
      return `No longer lists a ${fn} leader`;
    case "tenure":
      return `Its fractional ${fn} seat is ${sig.tenure?.months ?? 12} months in`;
    case "rehire":
      return `Ended a fractional ${fn} seat${sig.ended ? ` in ${monthWords(sig.ended.end)}` : ""}`;
    case "arrival":
      return `Lists a new ${sig.arrived?.kind === "full-time" ? "full-time " : ""}${fn} leader on its website`;
    case "team-build":
      return `Posted ${sig.team?.to ?? "several"} full-time ${TEAM_WORDS[fn] ?? fn.toLowerCase()} roles`;
    case "headcount":
      return sig.size ? `Grew from ${sig.size.from} to ${sig.size.to} people` : "Grew";
    case "gap":
      return `Lists no ${fn} leader on its team page`;
  }
}

const TEAM_WORDS: Record<string, string> = { Marketing: "marketing", Technology: "engineering", Finance: "finance", People: "people", "Customer Success": "customer success" };
/** "Posted 3…" -> "posted 3…"; an acronym ("CRO …") stays. */
const lowerFirst = (v: string) => (/^[A-Z](?![A-Z])/.test(v) ? v.charAt(0).toLowerCase() + v.slice(1) : v);

/**
 * The line a company's row in the day's view carries for one signal. It never names the company
 * (the row does, when the member can see it) nor a person: "Hired a fractional Finance leader ·
 * Finance usually comes before Sales, and they have no fractional Sales yet".
 */
export function viewLine(sig: MemberSignal): string {
  const fn = sig.fn ?? "";
  switch (sig.kind) {
    case "adjacent": {
      const h = hiredWords(sig);
      return `${h.charAt(0).toUpperCase()}${h.slice(1)} · ${sig.why}`;
    }
    case "role":
      return `New open role: ${safeTitle(sig.title, sig.co.name, sig.fn)} · In your function`;
    case "seat":
      return `A fractional ${fn} seat just ended · A seat like yours`;
    case "funding":
      return `${cap(raised(sig))} · Money in usually means hiring`;
    case "sales-build":
      return `${sig.build && sig.build.from > 0 ? `Posted ${sig.build.to} full-time sales roles` : "Posted its first full-time sales roles"} · ${sig.why}`;
    case "departure":
      return `No longer lists a ${fn} leader on its website · A seat like yours may need cover`;
    case "tenure":
    case "rehire":
    case "arrival":
    case "team-build":
    case "headcount":
    case "gap":
      return `${sig.standing ? "Still a good time · " : ""}${signalWords(sig, "")} · ${sig.why}`;
  }
}

/** The note beside a line: "High · Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months". Null when unscored. */
export const noteOf = (sig: Pick<MemberSignal, "band" | "whyNow">): string | null => (sig.band && sig.whyNow ? `${sig.band} · ${sig.whyNow}` : null);

/** One delivery: every card, and the day's companies. Null with no signals (a nothing-day is never sent). */
export function dayOf(sigs: MemberSignal[], ctx: CardContext, mode: RadarDay["mode"], day: string): RadarDay | null {
  if (!sigs.length) return null;
  return { cards: sigs.map((x) => cardOf(x, ctx)), total: sigs.length, companies: new Set(sigs.map((x) => x.companyId)).size, day, url: ctx.url, mode };
}

const BAND_RANK: Record<RadarBand, number> = { High: 0, Medium: 1, Low: 2 };

/**
 * What a day's view lists, from the kept rows: one entry a company, in the order they came (most
 * likely first), its lines in order, each with its note (band and why-now), and the company's best band.
 */
export function rowsOf(
  sent: { c: string; kind: RadarKind; l: string; b?: RadarBand; w?: string; a?: string; h?: [number, number] }[],
  pub: (companyId: string) => string,
): { id: string; c: string; kinds: RadarKind[]; lines: string[]; notes: string[]; band?: RadarBand; sigs: RadarSigView[]; h?: [number, number] }[] {
  const by = new Map<string, { id: string; c: string; kinds: RadarKind[]; lines: string[]; notes: string[]; band?: RadarBand; sigs: RadarSigView[]; h?: [number, number] }>();
  for (const x of sent) {
    let r = by.get(x.c);
    if (!r) by.set(x.c, (r = { id: pub(x.c), c: x.c, kinds: [], lines: [], notes: [], sigs: [] }));
    if (!r.kinds.includes(x.kind)) r.kinds.push(x.kind);
    if (!r.lines.includes(x.l)) {
      r.lines.push(x.l);
      r.notes.push(noteOf({ band: x.b, whyNow: x.w }) ?? "");
      r.sigs.push({ kind: x.kind, line: x.l, ...(x.b ? { band: x.b, weight: WEIGHT_OF[x.b] } : {}), ...(x.w ? { whyNow: x.w } : {}), ...(x.a ? { at: x.a } : {}), ...(x.h ? { h: x.h } : {}) });
      // When a hire is likely: the soonest window of its signals.
      if (x.h && (!r.h || x.h[0] < r.h[0] || (x.h[0] === r.h[0] && x.h[1] < r.h[1]))) r.h = x.h;
    }
    if (x.b && (!r.band || BAND_RANK[x.b] < BAND_RANK[r.band])) r.band = x.b;
  }
  // The side panel reads each company's signals strongest first (the line's order stays as it came).
  for (const r of by.values()) r.sigs.sort((a, b) => BAND_RANK[a.band ?? "Low"] - BAND_RANK[b.band ?? "Low"]);
  return [...by.values()];
}

/** A signal's weight in a word, from its band: never a number. */
export const WEIGHT_OF: Record<RadarBand, "Strong" | "Some" | "Light"> = { High: "Strong", Medium: "Some", Low: "Light" };
