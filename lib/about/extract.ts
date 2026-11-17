/**
 * About texts from a company's own homepage: pick a description out of the HTML, clean it, and
 * turn away what is not one (a parked domain, a bot challenge, a login wall, a cookie notice,
 * placeholder text, the company's name alone, a menu). No network here; see lib/about/fetch.ts.
 *
 * Order: <meta name="description">, og:description, twitter:description, a JSON-LD Organization's
 * description, else the first <p> in <main> (or <body>) of at least 80 characters. The first one
 * that passes wins. Every skip has a reason, kept on the company's status (State.about).
 */

/** Longest About text kept. Longer text is cut at the last sentence that fits. */
export const ABOUT_MAX = 500;
/** Shortest About text kept. */
export const ABOUT_MIN = 40;
/** The first-paragraph fallback needs at least this much. */
const PARA_MIN = 80;

export type Extracted =
  | { ok: true; text: string; from: "meta" | "og" | "twitter" | "jsonld" | "paragraph" }
  | { ok: false; reason: string };

/* ---------- text cleaning ---------- */

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ensp: " ", emsp: " ", thinsp: " ", ndash: "–", mdash: "—",
  hellip: "…", lsquo: "‘", rsquo: "’", sbquo: "‚", ldquo: "“", rdquo: "”", bdquo: "„", laquo: "«", raquo: "»", middot: "·",
  bull: "•", copy: "©", reg: "®", trade: "™", deg: "°", times: "×", divide: "÷", euro: "€", pound: "£", yen: "¥", cent: "¢",
  sect: "§", para: "¶", iexcl: "¡", iquest: "¿", shy: "", zwj: "", zwnj: "", lrm: "", rlm: "",
  aacute: "á", eacute: "é", iacute: "í", oacute: "ó", uacute: "ú", yacute: "ý", Aacute: "Á", Eacute: "É", Iacute: "Í", Oacute: "Ó", Uacute: "Ú",
  agrave: "à", egrave: "è", igrave: "ì", ograve: "ò", ugrave: "ù", Agrave: "À", Egrave: "È",
  acirc: "â", ecirc: "ê", icirc: "î", ocirc: "ô", ucirc: "û", auml: "ä", euml: "ë", iuml: "ï", ouml: "ö", uuml: "ü", yuml: "ÿ",
  Auml: "Ä", Ouml: "Ö", Uuml: "Ü", szlig: "ß", ntilde: "ñ", Ntilde: "Ñ", ccedil: "ç", Ccedil: "Ç", atilde: "ã", otilde: "õ",
  aring: "å", Aring: "Å", aelig: "æ", AElig: "Æ", oslash: "ø", Oslash: "Ø",
};

/** HTML entities to characters: named ones above, and every numeric one. Unknown names stay as written. */
export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z][a-z0-9]*);?/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) return " ";
      return String.fromCodePoint(n);
    }
    const v = NAMED[e] ?? NAMED[e.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Tags out, entities decoded, control and invisible characters out, whitespace to single spaces. */
export function cleanText(raw: string): string {
  let s = raw.replace(/<!--[\s\S]*?-->/g, " ").replace(/<[^>]*>/g, " ");
  // Twice: "&amp;amp;" and markup written as entities ("&lt;b&gt;") are common in meta tags.
  s = decodeEntities(s);
  if (/[<&]/.test(s)) s = decodeEntities(s.replace(/<[^>]*>/g, " "));
  return s
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f​-‏‪-‮⁠-⁤﻿]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** At most `max` characters, cut after the last whole sentence that fits; else at a word, with an ellipsis. */
export function capText(s: string, max = ABOUT_MAX): string {
  if (s.length <= max) return s;
  const head = s.slice(0, max + 1);
  let cut = -1;
  const re = /[.!?。！？](?=["'”’)\]]?(\s|$))/g;
  for (let m: RegExpExecArray | null; (m = re.exec(head)); ) if (m.index + 1 <= max) cut = m.index + 1;
  if (cut >= Math.min(120, max / 3)) {
    // Keep a closing quote or bracket that belongs to the sentence.
    const tail = /^["'”’)\]]/.exec(s.slice(cut));
    return s.slice(0, cut + (tail ? 1 : 0)).trim();
  }
  const space = head.lastIndexOf(" ", max - 1);
  return `${s.slice(0, space > max / 2 ? space : max - 1).replace(/[\s,;:–—-]+$/, "")}…`;
}

/* ---------- reading the HTML ---------- */

/** Attributes of one tag, names lowercased. */
function attrsOf(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  const re = /([^\s"'<>/=]+)\s*(?:=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g;
  // Skip the tag name.
  const body = tag.replace(/^<\s*[a-z0-9]+/i, "");
  for (let m: RegExpExecArray | null; (m = re.exec(body)); ) {
    const k = m[1].toLowerCase();
    if (!(k in out)) out[k] = m[2] ?? m[3] ?? m[4] ?? "";
  }
  return out;
}

/** The content of the first <meta> whose name or property is one of `keys`. */
function metaContent(html: string, keys: string[]): string | null {
  const re = /<meta\b(?:[^>"']|"[^"]*"|'[^']*')*>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    const a = attrsOf(m[0]);
    const k = (a.name ?? a.property ?? a.itemprop ?? "").toLowerCase().trim();
    if (keys.includes(k) && a.content !== undefined) return a.content;
  }
  return null;
}

const ORG_TYPE = /(Organization|Corporation|Company|LocalBusiness|Business|NGO|Institution|Store|Agency|Brand)$/i;

/** The description of the first Organization (or a kind of one) in the page's JSON-LD blocks. */
function jsonLdDescription(html: string): string | null {
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    let data: unknown;
    try {
      data = JSON.parse(m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, ""));
    } catch {
      continue;
    }
    const found = findOrg(data, 0);
    if (found) return found;
  }
  return null;
}
function findOrg(x: unknown, depth: number): string | null {
  if (!x || typeof x !== "object" || depth > 6) return null;
  if (Array.isArray(x)) {
    for (const y of x) {
      const f = findOrg(y, depth + 1);
      if (f) return f;
    }
    return null;
  }
  const o = x as Record<string, unknown>;
  const types = ([] as unknown[]).concat(o["@type"] ?? []).map(String);
  if (types.some((t) => ORG_TYPE.test(t)) && typeof o.description === "string" && o.description.trim()) return o.description;
  for (const k of ["@graph", "publisher", "provider", "brand", "author", "mainEntity", "about"]) {
    const f = findOrg(o[k], depth + 1);
    if (f) return f;
  }
  return null;
}

/** The page without the parts that are never prose: scripts, styles, templates, forms, nav, header, footer, asides. */
function proseOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|object|select|textarea|button|form|nav|header|footer|aside)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

/** The first <p> in <main> (else in <body>) with at least PARA_MIN characters that passes the junk checks. */
function firstParagraph(html: string, name: string): string | null {
  const prose = proseOf(html);
  const main = /<main\b[^>]*>([\s\S]*?)<\/main\s*>/i.exec(prose)?.[1] ?? /<body\b[^>]*>([\s\S]*)/i.exec(prose)?.[1] ?? prose;
  const re = /<p\b[^>]*>([\s\S]*?)(?=<\/p\s*>|<p\b|<\/div|<\/section|<\/article|<\/main|$)/gi;
  let n = 0;
  for (let m: RegExpExecArray | null; (m = re.exec(main)) && n < 40; n++) {
    const t = cleanText(m[1]);
    if (t.length >= PARA_MIN && !junkReason(t, name)) return t;
  }
  return null;
}

/** The page title, cleaned. */
export function titleOf(html: string): string {
  return cleanText(/<title\b[^>]*>([\s\S]*?)<\/title\s*>/i.exec(html)?.[1] ?? "");
}

/* ---------- what is not an About text ---------- */

/** Hosts that sell or park domains. A homepage that ends up on one is a parked domain. */
export const PARKING_HOSTS = [
  "sedo.com", "sedoparking.com", "afternic.com", "dan.com", "hugedomains.com", "godaddy.com", "parkingcrew.net", "bodis.com",
  "undeveloped.com", "above.com", "domainmarket.com", "buydomains.com", "uniregistry.com", "squadhelp.com", "atom.com", "brandbucket.com",
  "parklogic.com", "domainlore.com", "efty.com", "epik.com", "porkbun.com", "namecheap.com", "sav.com", "perfectdomain.com",
];

const PARKED =
  /\b(this )?domain( name)? (is |may be )?(for sale|available for purchase|is parked)|\bbuy this domain\b|\bmake an offer on this domain\b|\bthis domain (has been|is) parked\b|\bparked (free|domain|by|courtesy of)\b|\bdomain parking\b|\bsedoparking\b|\bsedo\.com\b|\bafternic\b|\bdan\.com\b|\bhugedomains\b|\bparkingcrew\b|\bbodis\.com\b|\bgodaddy\b[^.]{0,60}\b(parked|for sale|domain)\b|\b(parked|for sale)\b[^.]{0,60}\bgodaddy\b|\bthe domain [a-z0-9.-]+ (is|may be) for sale\b|\binquire (about|on) this domain\b/i;
const CHALLENGE =
  /\bjust a moment\b|\bchecking (if the site connection is secure|your browser)\b|\bcf-browser-verification\b|\bcf_chl_|\/cdn-cgi\/challenge-platform\b|\battention required!? \| cloudflare\b|\benable javascript and cookies to continue\b|\bddos protection by\b|\bverify (that )?you are (a )?human\b|\bare you a robot\b|\bpress (&|and) hold\b|\bpx-captcha\b|\bhcaptcha-challenge\b|\bsecurity check to access\b|\bincapsula incident\b|\b_incapsula_resource\b/i;
const DENIED_TITLE =
  /^(access denied|403\b|forbidden|401\b|unauthorized|not acceptable|404\b|page not found|not found|site not found|error\b|website (is )?(coming soon|under construction|unavailable)|coming soon|under construction|account suspended|this account has been suspended|suspended domain|default web site page|welcome to nginx|apache2? .*default page|it works!?$|test page for|iis windows server|index of \/|domain (default|not configured)|web server'?s? default page|bad request|service unavailable|502\b|503\b)/i;
const LOGIN_TITLE = /^(log ?in|sign ?in|login required|sign in to continue|log in to continue|please (log|sign) in)\b|\b(log|sign) in to (your|continue|access)\b/i;
const COOKIE =
  /\b(we use cookies|this (web)?site uses cookies|uses cookies to|cookie (policy|settings|preferences|consent|notice)|accept (all )?cookies|by (continuing|using) (to (browse|use) )?(this|our) (site|website)[^.]{0,40}cookies|manage (your )?cookie)\b/i;
const PLACEHOLDER =
  /\blorem ipsum\b|\bdolor sit amet\b|\bjust another wordpress site\b|\bmy wordpress blog\b|\bthis is (a|my|the) (placeholder|sample|example|default)\b|\b(site|website|page) (is )?(coming soon|under construction)\b|^coming soon\b|\bcreate your (own )?(free )?website\b|\bbuilt with (wix|squarespace)\b|\bpowered by (wix|squarespace|shopify|wordpress|godaddy)\b|^(home|welcome|homepage)$|\bedit this (text|paragraph)\b|\bclick (here )?to edit\b|\byour (site|website) description\b|\badd a description\b|\bmeta description\b/i;
const NAV_WORDS =
  /\b(home|about( us)?|contact( us)?|services|products|solutions|blog|news|careers|jobs|pricing|login|log in|sign in|sign up|team|faq|support|resources|partners|customers|press|events|shop|cart|search|menu|privacy|terms)\b/gi;

/** Plain words of a name, for "is this just the company's name". */
const nameWords = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter(Boolean);
const FILLER = new Set([
  "welcome", "to", "the", "official", "website", "web", "site", "home", "homepage", "page", "of", "inc", "llc", "ltd", "co", "corp",
  "corporation", "company", "gmbh", "ag", "sa", "plc", "group", "and", "a", "an", "at", "on", "for", "www", "com", "io", "net", "org",
]);

/**
 * Why a page as a whole is not a company's homepage (parked, a challenge, an error or a login
 * page), or null. Reads the title and the visible text, not the markup, except for the
 * challenge markers bot walls leave in it.
 */
export function pageJunk(html: string): string | null {
  const title = titleOf(html);
  const head = html.slice(0, 200_000);
  const text = cleanText(proseOf(head)).slice(0, 20_000);
  if (PARKED.test(title) || PARKED.test(text)) return "parked domain";
  if (CHALLENGE.test(title) || /\bcf_chl_|\/cdn-cgi\/challenge-platform\/|cf-browser-verification|_incapsula_resource|px-captcha/i.test(head)) return "bot challenge";
  if (/\bcaptcha\b/i.test(title)) return "bot challenge";
  if (DENIED_TITLE.test(title)) return /suspend/i.test(title) ? "account suspended" : /coming soon|under construction/i.test(title) ? "placeholder page" : /not found|404/i.test(title) ? "not found" : /default|nginx|apache|it works|iis|index of|test page/i.test(title) ? "server default page" : "access denied";
  if (/^\s*access denied\b|\byou don'?t have permission to access\b|\brequest (was )?blocked\b|\berror 1020\b/i.test(text.slice(0, 600))) return "access denied";
  if (LOGIN_TITLE.test(title)) return "login wall";
  return null;
}

/** Why `t` is not an About text for the company called `name`, or null when it is one. */
export function junkReason(t: string, name: string): string | null {
  if (!t) return "empty";
  if (PLACEHOLDER.test(t)) return "placeholder text";
  if (PARKED.test(t)) return "parked domain";
  if (CHALLENGE.test(t)) return "bot challenge";
  if (COOKIE.test(t)) return "cookie notice";
  if (/^(access denied|forbidden|page not found|404|sign in|log in|login)\b/i.test(t)) return "error or login text";
  if (t.length < ABOUT_MIN) return "too short";
  // Just the name, maybe with "Welcome to", "Home" or "Official website".
  const nw = new Set(nameWords(name));
  const words = nameWords(t);
  const rest = words.filter((w) => !nw.has(w) && !FILLER.has(w));
  if (rest.length < 3) return "just the company name";
  // A menu: several short items between separators, or mostly menu words with no sentence in sight.
  const parts = t.split(/\s*(?:[|•·»›]|\s\/\s|\s-\s)\s*/).filter(Boolean);
  if (parts.length >= 4 && parts.reduce((n, p) => n + p.split(" ").length, 0) / parts.length <= 3) return "navigation list";
  const navHits = t.match(NAV_WORDS)?.length ?? 0;
  if (navHits >= 4 && !/[.!?,;:]/.test(t) && navHits * 2 >= t.split(" ").length / 2) return "navigation list";
  // Mostly not letters: codes, numbers, symbols.
  const letters = (t.match(/\p{L}/gu) ?? []).length;
  if (letters < t.length * 0.5) return "not prose";
  return null;
}

/**
 * The About text for a company called `name` from its homepage HTML, or why there is none.
 * Page-wide problems (parked, a challenge, an error or login page) come first; then each
 * candidate in order, the first that passes winning. A skip names the first candidate's reason.
 */
export function extractAbout(html: string, name: string): Extracted {
  const page = pageJunk(html);
  if (page) return { ok: false, reason: page };
  const candidates: [Extract<Extracted, { ok: true }>["from"], string | null][] = [
    ["meta", metaContent(html, ["description"])],
    ["og", metaContent(html, ["og:description"])],
    ["twitter", metaContent(html, ["twitter:description"])],
    ["jsonld", jsonLdDescription(html)],
  ];
  let first: string | null = null;
  for (const [from, raw] of candidates) {
    if (raw === null) continue;
    const t = cleanText(raw);
    const why = junkReason(t, name);
    if (!why) return { ok: true, text: capText(t), from };
    first ??= why;
  }
  const p = firstParagraph(html, name);
  if (p) return { ok: true, text: capText(p), from: "paragraph" };
  return { ok: false, reason: first ?? "no description" };
}
