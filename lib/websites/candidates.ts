/**
 * Likely website domains for a company, from its name alone (lib/websites): Merlin has no search
 * engine, so it guesses the domains a company of that name would use, most likely first, and
 * checks them itself (lib/websites/find.ts). Pure: no network, no state.
 *
 * The name is normalised first (nameParts): accents and marks off, "&" and "+" as "and", legal
 * suffixes (Inc, LLC, Ltd, GmbH, BV, SAS, SL, Srl, AG, plc, Corp, Co, Group, Holdings, ...) off,
 * a tagline after " - ", ":" or "|" set aside as a second name, and CamelCase read as words.
 *
 * Then labels (joined, hyphenated, the name as a domain when it is one, a name that ends in a
 * TLD written as one, the first word, the words after the first, initials of a long name, "get",
 * "try", "hq", "app" and "labs") meet TLDs (.com first, then the country's own, then .io, .co, .ai,
 * .net, .org, .tech, .health, .app), in tiers, so the most likely pairs come first. At most
 * MAX_CANDIDATES.
 */

/** Candidates per company, at most. */
export const MAX_CANDIDATES = 40;

/** After .com and the country's own. */
export const GENERIC_TLDS = ["io", "co", "ai", "net", "org", "tech", "health", "app"] as const;

/** A country's own TLDs, by the country names lib/geo.ts reads HQs as. */
export const COUNTRY_TLDS: Record<string, string[]> = {
  "United Kingdom": ["co.uk", "uk"],
  Germany: ["de"],
  France: ["fr"],
  Netherlands: ["nl"],
  Spain: ["es"],
  Italy: ["it"],
  Ireland: ["ie"],
  Belgium: ["be"],
  Switzerland: ["ch"],
  Sweden: ["se"],
  Denmark: ["dk"],
  Norway: ["no"],
  Finland: ["fi"],
  Austria: ["at"],
  Portugal: ["pt"],
  Luxembourg: ["lu"],
  Canada: ["ca"],
  Australia: ["com.au"],
};
/** Tried when no country is on file, after the generic TLDs most names use. */
export const FALLBACK_TLDS = ["co.uk"] as const;
/** Every country TLD above, to tell a country's domain from a generic one. */
export const COUNTRY_OF_TLD: Record<string, string> = Object.fromEntries(Object.entries(COUNTRY_TLDS).flatMap(([c, ts]) => ts.map((t) => [t, c])));

/**
 * Legal suffixes, as words after normalising (lowercase, no accents, no dots). Dropped from the
 * name. Some say where the company is registered, which stands in for a country we don't have.
 */
const SUFFIX_COUNTRY: Record<string, string[]> = {
  gmbh: ["Germany", "Austria", "Switzerland"],
  ug: ["Germany"],
  kg: ["Germany"],
  ag: ["Germany", "Switzerland"],
  bv: ["Netherlands"],
  nv: ["Netherlands", "Belgium"],
  sas: ["France"],
  sarl: ["France"],
  sa: [],
  sl: ["Spain"],
  slu: ["Spain"],
  srl: ["Italy"],
  spa: ["Italy"],
  ltd: ["United Kingdom"],
  limited: ["United Kingdom"],
  plc: ["United Kingdom"],
  llp: ["United Kingdom"],
  pty: ["Australia"],
  oy: ["Finland"],
  oyj: ["Finland"],
  ab: ["Sweden"],
  aps: ["Denmark"],
  as: ["Norway", "Denmark"],
  asa: ["Norway"],
  inc: [],
  incorporated: [],
  llc: [],
  lllp: [],
  lp: [],
  corp: [],
  corporation: [],
  co: [],
  company: [],
  pc: [],
  pllc: [],
  group: [],
  holdings: [],
  holding: [],
  se: [],
  ltda: [],
  sro: [],
  doo: [],
  kft: [],
  bvba: ["Belgium"],
  cvba: ["Belgium"],
  sprl: ["Belgium"],
  ehf: [],
  ssa: [],
};
/** Two-word suffixes written with spaces or dots ("s.a.s", "s.r.l", "l.l.c", "p.c"), read once squeezed. */
const DOTTED = /\b((?:[a-z]\.){1,3}[a-z]\.?)(?=\s|$)/g;
const LEGAL = new Set(Object.keys(SUFFIX_COUNTRY));
/** Words that only say what kind of entity it is, dropped when they open a long name ("The", "Maison", "Groupe"). */
const OPENERS = new Set(["the", "maison", "groupe", "gruppo", "grupo", "studio", "atelier", "fattoria", "cantina", "bodega", "domaine", "chateau"]);
const TLD_WORDS = new Set(["io", "ai", "co", "app", "tech", "health", "pro", "energy", "studio", "agency", "dev", "so", "me", "xyz", "digital", "cloud", "systems", "solutions", "network", "group", "global"]);

export interface NameParts {
  /** The name's words, lowercased, ASCII, legal suffixes off. "and" stands for "&". */
  words: string[];
  /** The words as written, with "&" left out: "a&b" can be "aandb" or "ab". */
  wordsNoAnd: string[];
  /** The original spelling's own hyphenated runs ("vex-9"), when it has any. */
  hyphenRuns: string[];
  /** A tagline or second name ("Corvane Farms - Lupin Wines" gives "lupin wines"), normalised the same way. */
  alt: string[] | null;
  /** The name written as a domain ("vexmont.energy", "Corvane-Ops.com"), when it is one. */
  asDomain: string | null;
  /** Countries a legal suffix in the name points to ("Pty" Australia, "GmbH" Germany), most likely first. */
  suffixCountries: string[];
}

/** Lowercase ASCII: accents and marks off, ß as ss, æ ae, ø o. */
export function ascii(s: string): string {
  return String(s ?? "")
    .replace(/ß/g, "ss")
    .replace(/[æÆ]/g, "ae")
    .replace(/[øØ]/g, "o")
    .replace(/[œŒ]/g, "oe")
    .replace(/[łŁ]/g, "l")
    .replace(/[đĐ]/g, "d")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** "SupportQuokka" -> "Support Quokka", "RevQuillPro" -> "Rev Quill Pro", "x9CLOUD" stays. Only on a word that mixes cases. */
const splitCamel = (w: string) => (/[a-z]/.test(w) && /[A-Z]/.test(w.slice(1)) ? w.replace(/([a-z0-9])([A-Z])/g, "$1 $2") : w);

/** Words of one name part: lowercased, no marks, "&" as "and", legal suffixes off (anywhere after the first word). */
function wordsOf(raw: string, opts: { camel?: boolean; keepAnd?: boolean } = {}): { words: string[]; suffixes: string[] } {
  let s = raw.replace(/[®™©℠]/g, " ");
  if (opts.camel) s = s.split(/\s+/).map(splitCamel).join(" ");
  s = ascii(s).replace(/[’'`]/g, "");
  s = s.replace(DOTTED, (m) => m.replace(/\./g, ""));
  s = opts.keepAnd === false ? s.replace(/\s*[&+]\s*/g, "") : s.replace(/\s*[&+]\s*/g, " and ");
  const all = s.split(/[^a-z0-9]+/).filter(Boolean);
  const suffixes: string[] = [];
  const words = all.filter((w, i) => {
    if (i > 0 && LEGAL.has(w)) {
      suffixes.push(w);
      return false;
    }
    return true;
  });
  return { words, suffixes };
}

/** Whether `s` reads as a domain name ("vexmont.energy", "corvane-ops.com", "quillvane.ai"). */
function domainLike(s: string): string | null {
  const t = ascii(s).trim().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
  return /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.[a-z]{2,12}$/.test(t) ? t : null;
}

/** The name, read for domains (see NameParts). */
export function nameParts(name: string): NameParts {
  const raw = String(name ?? "").replace(/\s+/g, " ").trim();
  // A tagline after " - ", " – ", ":", "|" or " / " is a second name; a parenthesis is a note.
  const [head, ...tails] = raw.split(/\s+[-–—|/]\s+|:\s+|\s*\|\s*/);
  const main = head.replace(/\s*\([^)]*\)\s*/g, " ").trim() || head;
  const asDomain = domainLike(main);
  const mainForWords = asDomain ? main.replace(/\.[a-z]{2,12}$/i, "") : main;
  const w = wordsOf(mainForWords, { camel: true });
  const plain = wordsOf(mainForWords, { camel: false });
  const noAnd = wordsOf(mainForWords, { camel: false, keepAnd: false });
  const tail = tails.join(" ").replace(/\s*\([^)]*\)\s*/g, " ").trim();
  const altWords = tail ? wordsOf(tail).words : [];
  const hyphenRuns = (ascii(mainForWords).match(/[a-z0-9]+(?:-[a-z0-9]+)+/g) ?? []).filter((r) => r.length >= 3);
  const suffixCountries = [...new Set([...w.suffixes, ...plain.suffixes].flatMap((x) => SUFFIX_COUNTRY[x] ?? []))];
  return {
    // CamelCase split only shapes the hyphenated label; the joined label is the same either way.
    words: plain.words.length ? plain.words : w.words,
    wordsNoAnd: noAnd.words,
    hyphenRuns,
    alt: altWords.length && altWords.join("").length >= 3 ? altWords : null,
    asDomain,
    suffixCountries,
  };
}

/** The camel-split words of a name, for a hyphenated label and a TLD written as the last word ("RevQuillPro" -> revquill.pro). */
function camelWords(name: string): string[] {
  const [head] = String(name ?? "").split(/\s+[-–—|/]\s+|:\s+|\s*\|\s*/);
  return wordsOf(head.replace(/\s*\([^)]*\)\s*/g, " "), { camel: true }).words;
}

/** A domain label is 1 to 63 letters, digits and inner hyphens; we want at least 2 characters. */
const labelOk = (l: string) => l.length >= 2 && l.length <= 63 && /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(l) && !/--/.test(l.slice(2, 4));

/** The labels a domain built on the name's whole name would carry: joined, hyphenated, with and without "and". */
export function fullLabels(name: string): Set<string> {
  const p = nameParts(name);
  const out = new Set<string>();
  const add = (ws: string[]) => {
    if (!ws.length) return;
    out.add(ws.join(""));
    out.add(ws.join("-"));
    const noThe = ws[0] === "the" && ws.length > 1 ? ws.slice(1) : null;
    if (noThe) {
      out.add(noThe.join(""));
      out.add(noThe.join("-"));
    }
  };
  add(p.words);
  add(p.wordsNoAnd);
  add(camelWords(name));
  for (const r of p.hyphenRuns) out.add(r);
  if (p.asDomain) out.add(p.asDomain.split(".")[0]);
  return new Set([...out].filter(labelOk));
}

export interface CandidateOpts {
  /** The company's country, as lib/geo.ts reads its HQ ("United Kingdom"), when known. Only its own TLDs are then tried. */
  country?: string | null;
  /** Other countries that hint where it is (a seat's country), used only when no HQ is on file. */
  hints?: string[];
  max?: number;
}

/** One guess: the domain, and how it was built (for the domain match and the tuning). */
export interface Candidate {
  domain: string;
  /** "full": the whole name (joined, hyphenated, as written as a domain); "affix": the whole name with get/try/hq/app/labs; "part": a part of the name (first word, the rest, initials). */
  kind: "full" | "affix" | "part";
}

/**
 * Likely domains for `name`, most likely first, at most `max` (MAX_CANDIDATES). Empty when the
 * name has nothing a domain could be made of (no Latin letters or digits).
 */
export function candidates(name: string, o: CandidateOpts = {}): Candidate[] {
  const max = o.max ?? MAX_CANDIDATES;
  const p = nameParts(name);
  if (!p.words.length) return [];
  // The HQ on file decides; without one, a seat's country and what a legal suffix says stand in.
  const countries = o.country ? [o.country] : [...new Set([...(o.hints ?? []), ...p.suffixCountries])];
  const cc = countries.flatMap((c) => COUNTRY_TLDS[c] ?? []).filter((t) => t !== "uk");
  const out: Candidate[] = [];
  const seen = new Set<string>();
  const push = (label: string, tlds: readonly string[], kind: Candidate["kind"]) => {
    if (!labelOk(label)) return;
    for (const t of tlds) {
      const d = `${label}.${t}`;
      if (seen.has(d) || out.length >= max) continue;
      seen.add(d);
      out.push({ domain: d, kind });
    }
  };
  const pushDomain = (d: string, kind: Candidate["kind"]) => {
    if (seen.has(d) || out.length >= max) return;
    seen.add(d);
    out.push({ domain: d, kind });
  };

  const ws = p.words[0] === "the" && p.words.length > 1 ? p.words.slice(1) : p.words;
  const joined = ws.join("");
  const cw = camelWords(name);
  const hyph = [...new Set([ws.join("-"), cw.join("-"), ...p.hyphenRuns])].filter((h) => h !== joined && h.includes("-"));
  const noAnd = p.wordsNoAnd.join("") !== joined ? p.wordsNoAnd.join("") : null;
  const withThe = p.words[0] === "the" && p.words.length > 1 ? p.words.join("") : null;
  // "RevQuillPro", "Ottervane Reality AI": the last word is a TLD ("revquill.pro").
  const hack =
    cw.length >= 2 && TLD_WORDS.has(cw[cw.length - 1]) ? `${cw.slice(0, -1).join("")}.${cw[cw.length - 1]}` : ws.length >= 2 && TLD_WORDS.has(ws[ws.length - 1]) ? `${ws.slice(0, -1).join("")}.${ws[ws.length - 1]}` : null;
  const long = ws.length >= 2;
  const first = long ? ws[0] : null;
  const rest = ws.length >= 3 || (ws.length === 2 && OPENERS.has(ws[0])) ? ws.slice(1).join("") : null;
  const initials = ws.length >= 3 ? ws.map((w) => w[0]).join("") : null;
  // Spoken digits in brand names ("A to B" as "a2b", "Eats for You" as "eats4you").
  const digits = ws.some((w) => w === "to" || w === "for") ? ws.map((w) => (w === "to" ? "2" : w === "for" ? "4" : w)).join("") : null;
  const alt = p.alt;
  const altJoined = alt ? alt.join("") : null;
  const altRest = alt && alt.length >= 2 && OPENERS.has(alt[0]) ? alt.slice(1).join("") : null;

  // Tier 1: the name as written as a domain, then the joined name on .com and the country's own.
  if (p.asDomain) pushDomain(p.asDomain, "full");
  push(joined, ["com", ...cc], "full");
  for (const h of hyph) push(h, ["com", ...cc], "full");
  if (hack) pushDomain(hack, "full");
  // Tier 2: the joined name on the common generic TLDs.
  push(joined, ["io", "co", "ai"], "full");
  if (noAnd) push(noAnd, ["com", ...cc], "full");
  if (withThe) push(withThe, ["com"], "full");
  if (digits) push(digits, ["com", ...cc], "full");
  // With no country on file, the commonest one after the United States (most of Merlin's companies abroad are British).
  if (!cc.length) {
    push(joined, FALLBACK_TLDS, "full");
    for (const h of hyph) push(h, FALLBACK_TLDS, "full");
  }
  // Tier 3: the rest of the generic TLDs, and hyphenated on the common ones.
  push(joined, ["net", "org", "tech", "health", "app"], "full");
  for (const h of hyph) push(h, ["io", "co", "ai"], "full");
  if (altJoined) push(altJoined, ["com", ...cc], "part");
  if (altRest) push(altRest, ["com", ...cc], "part");
  // Tier 4: the whole name with a word apps and start-ups add.
  push(`get${joined}`, ["com"], "affix");
  push(`try${joined}`, ["com"], "affix");
  push(`${joined}hq`, ["com"], "affix");
  push(`${joined}app`, ["com"], "affix");
  push(`${joined}labs`, ["com"], "affix");
  // Tier 5: a part of a long name.
  if (first && first.length >= 3) push(first, ["com", ...(cc.length ? cc : FALLBACK_TLDS)], "part");
  if (rest) push(rest, ["com", ...cc], "part");
  if (initials && initials.length >= 3) push(initials, ["com", ...cc], "part");
  if (first && first.length >= 3) push(first, ["io", "co", "ai"], "part");
  // Tier 6: what is left, while there is room.
  push(`get${joined}`, ["io", "co", "app"], "affix");
  push(`${joined}hq`, ["io", "co"], "affix");
  push(`${joined}app`, ["io", "co"], "affix");
  if (altJoined) push(altJoined, ["io", "co", "ai", "net", "org"], "part");
  if (rest) push(rest, ["io", "co", "ai"], "part");
  if (initials && initials.length >= 3) push(initials, ["io", "co", "org"], "part");
  for (const h of hyph) push(h, ["net", "org"], "full");
  if (first && first.length >= 3) push(first, ["net", "org"], "part");
  return out;
}
