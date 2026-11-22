/**
 * Own sites (lib/ownsites): the emails on a firm's pages, and which one is the person's. Pure: the
 * pages come in as text, so the checks run it as it is.
 *
 * Emails come from mailto: links and from the visible text, simple obfuscations included
 * ("jane [at] firm [dot] com", "jane(at)firm(dot)com", "jane {at} firm {dot} com"), HTML entities
 * decoded. Scripts, styles and comments are not read.
 *
 * An email is accepted only when its domain is the site's (or a clear alias: the same name on
 * another ending, linked from the site) and:
 *  - "name match": its part before the @ is the person's (first, last, first.last, first-last,
 *    firstlast, flast, firstl, first_last, initials; case and accents folded), or
 *  - "only address on a one-person site": the site names the person, looks like one person's, and
 *    this is its only personal-looking address, or
 *  - "generic on a one-person site": a role address (info@, hello@, contact@ ...) on a site that
 *    names the person, looks like one person's and has no better address.
 * Otherwise it is "email not theirs" (emails there, none theirs) or "no email".
 */
import { cleanText, decodeEntities } from "../about/extract";
import { registrable } from "../about/fetch";

/** Role and generic local parts. */
export const ROLE_LOCALS = new Set([
  "info", "hello", "hi", "hey", "sales", "support", "contact", "contactus", "admin", "administrator", "team", "careers", "career", "jobs", "job", "hr", "privacy",
  "press", "media", "pr", "office", "mail", "email", "enquiries", "enquiry", "inquiries", "inquiry", "help", "billing", "accounts", "accounting", "finance", "legal",
  "marketing", "webmaster", "web", "noreply", "no-reply", "donotreply", "do-not-reply", "postmaster", "hostmaster", "abuse", "security", "service", "services",
  "customerservice", "customer", "general", "booking", "bookings", "book", "partners", "partnerships", "invoices", "orders", "newsletter", "news", "events", "feedback",
  "ops", "operations", "start", "talk", "connect", "letstalk", "workwithus", "studio", "agency", "group", "hola", "bonjour", "welcome", "reception", "frontdesk",
]);
/** Never an address at all: placeholders and image names a site's text carries. */
const JUNK_LOCAL = /^(you|your|yourname|your\.name|name|firstname|first\.last|john\.?doe|jane\.?doe|example|user|username|someone|email|test)$/i;
const JUNK_DOMAIN = /(^|\.)(example\.(com|org|net)|domain\.com|email\.com|yourdomain\.com|yoursite\.com|sentry\.io|wixpress\.com|sentry-next\.wixpress\.com)$/i;
const FILE_TLD = /\.(png|jpe?g|gif|svg|webp|css|js|ico|bmp|tiff?|mp4|pdf)$/i;

const EMAIL_RE = /[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}/gi;

/** An address as stored: lower case, trimmed of the punctuation text puts around it. Null when it isn't one worth reading. */
export function cleanEmail(raw: string): string | null {
  const e = String(raw ?? "")
    .trim()
    .replace(/^mailto:/i, "")
    .split(/[?#]/)[0]
    .replace(/^[<("'\s]+|[>)"'.,;:\s]+$/g, "")
    .toLowerCase();
  const m = /^([^@\s]+)@([a-z0-9.-]+\.[a-z]{2,24})$/.exec(e);
  if (!m) return null;
  if (JUNK_LOCAL.test(m[1]) || JUNK_DOMAIN.test(m[2]) || FILE_TLD.test(m[2]) || m[1].length > 64) return null;
  return `${m[1]}@${m[2]}`;
}

/** The page's visible text: no scripts, styles, templates or comments. */
export function visibleText(html: string): string {
  return cleanText(
    html
      .slice(0, 600_000)
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<(br|p|div|li|tr|h[1-6])\b[^>]*>/gi, " \n"),
  );
}

/** "jane [at] firm [dot] com" and its kin, as a plain address. Only bracketed forms: a bare " at " is too common in prose. */
export function unobfuscate(text: string): string {
  const AT = /\s*(?:\[\s*at\s*\]|\(\s*at\s*\)|\{\s*at\s*\}|<\s*at\s*>|\s+\[at\]\s+|\s@\s)\s*/gi;
  const DOT = /\s*(?:\[\s*dot\s*\]|\(\s*dot\s*\)|\{\s*dot\s*\}|<\s*dot\s*>)\s*/gi;
  return text.replace(AT, "@").replace(DOT, ".");
}

/** The addresses a page gives: its mailto: links, then the visible text (obfuscations read). In page order, each once. */
export function emailsOf(html: string): string[] {
  const out: string[] = [];
  const add = (raw: string) => {
    const e = cleanEmail(raw);
    if (e && !out.includes(e)) out.push(e);
  };
  const re = /\bhref\s*=\s*(?:"\s*mailto:([^"]*)"|'\s*mailto:([^']*)'|mailto:([^\s"'>]+))/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    let v = m[1] ?? m[2] ?? m[3] ?? "";
    v = decodeEntities(v);
    try {
      v = decodeURIComponent(v);
    } catch {
      /* as written */
    }
    for (const part of v.split(/[,;]/)) add(part);
  }
  const text = unobfuscate(visibleText(html));
  for (const m of text.matchAll(EMAIL_RE)) add(m[0]);
  return out;
}

/** Words of a name, folded: lower case, accents off, letters only. Credentials after a comma go. */
export function nameWords(name: string): string[] {
  return String(name ?? "")
    .split(/[,(|]/)[0]
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[\s.]+/)
    .map((w) => w.replace(/[^a-z'-]/g, "").replace(/['-]/g, ""))
    .filter((w) => w.length >= 1 && !/^(mr|mrs|ms|dr|jr|sr|ii|iii|iv|mba|cpa|phd)$/.test(w));
}

/** The local parts that are this person's: first, last, first.last, first-last, firstlast, flast, firstl, first_last, initials. */
export function personLocals(name: string): Set<string> {
  const w = nameWords(name).filter((x) => x.length >= 1);
  const out = new Set<string>();
  if (w.length < 2) return out;
  const f = w[0];
  const l = w[w.length - 1];
  const mids = w.slice(1, -1);
  if (f.length >= 2) out.add(f);
  if (l.length >= 3) out.add(l);
  for (const x of [`${f}.${l}`, `${f}-${l}`, `${f}_${l}`, `${f}${l}`, `${f[0]}${l}`, `${f[0]}.${l}`, `${f}${l[0]}`, `${f}.${l[0]}`, `${l}.${f}`, `${l}${f}`, `${l}${f[0]}`]) out.add(x);
  // Initials: "jd", and with a middle initial "jmd".
  out.add(`${f[0]}${l[0]}`);
  if (mids.length) out.add(`${f[0]}${mids.map((m) => m[0]).join("")}${l[0]}`);
  // A double surname written as one ("garcia-lopez" read as garcialopez) or the last part of it.
  if (mids.length) out.add(`${f}${mids.join("")}${l}`);
  return out;
}

/** Whether a local part is this person's. Digits after it ("jane2") are allowed; nothing else. */
export function localMatches(local: string, name: string): boolean {
  const lp = local.toLowerCase().replace(/\+.*$/, "").replace(/\d+$/, "");
  return lp.length >= 2 && personLocals(name).has(lp);
}

export const isRole = (local: string) => ROLE_LOCALS.has(local.toLowerCase().replace(/\+.*$/, "").replace(/\d+$/, ""));

/** Whether the text names the person: their first and last name, in that order (accents and case folded). */
export function namesPerson(text: string, name: string): boolean {
  const w = nameWords(name);
  if (w.length < 2) return false;
  const t = ` ${String(text ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ")} `;
  const f = w[0];
  const l = w[w.length - 1];
  return new RegExp(`\\b${f}\\b(?: [a-z]\\b| [a-z]+){0,2} ${l}\\b`).test(t);
}

/** A site that reads as many people's: a team, staff or our people section. */
const TEAM_WORDS = /\b(our team|meet the team|meet our team|our people|our staff|our consultants|our advisors|our partners|our leadership|leadership team|team members|join our team|we are hiring|we're hiring|careers at)\b/i;

/** The domains an email may be at for this site: its own, and an alias it links with the same name on another ending. */
export function siteDomains(site: string, linkedHosts: Iterable<string>): Set<string> {
  const own = registrable(site.toLowerCase().replace(/^www\./, ""));
  const out = new Set([own]);
  const stem = own.split(".")[0];
  for (const h of linkedHosts) {
    const r = registrable(h.toLowerCase().replace(/^www\./, ""));
    if (r !== own && r.split(".")[0] === stem && stem.length >= 4) out.add(r);
  }
  return out;
}

/** The hosts a page links to (absolute http and https links). */
export function linkedHosts(html: string): string[] {
  const out = new Set<string>();
  const re = /\bhref\s*=\s*(?:"(https?:\/\/[^"]+)"|'(https?:\/\/[^']+)')/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)) && out.size < 300; ) {
    try {
      out.add(new URL(decodeEntities(m[1] ?? m[2])).hostname);
    } catch {
      /* not a link */
    }
  }
  return [...out];
}

export interface SitePage {
  url: string;
  html: string;
}

export type Decision =
  | { ok: true; email: string; page: string; how: "name match" | "only address on a one-person site" | "generic on a one-person site" }
  | { ok: false; s: "no email" | "email not theirs"; found: number };

/** The order a person's own addresses are preferred in: the fullest form of the name first. */
function nameRank(local: string, name: string): number {
  const w = nameWords(name);
  const f = w[0] ?? "";
  const l = w[w.length - 1] ?? "";
  const lp = local.replace(/\d+$/, "");
  const order = [`${f}.${l}`, `${f}${l}`, `${f}_${l}`, `${f}-${l}`, `${f[0]}${l}`, `${f}`, `${f}${l[0]}`, `${l}`];
  const i = order.indexOf(lp);
  return i < 0 ? order.length : i;
}
const ROLE_ORDER = ["hello", "contact", "info", "hi", "connect", "talk", "letstalk", "start", "office", "mail"];

/** Which address on the pages is the person's, if any. `site` is the host read. */
export function decide(pages: SitePage[], site: string, name: string): Decision {
  const hosts = pages.flatMap((p) => linkedHosts(p.html));
  const domains = siteDomains(site, hosts);
  const texts = pages.map((p) => visibleText(p.html));
  const all: { email: string; page: string }[] = [];
  for (const p of pages) for (const e of emailsOf(p.html)) if (!all.some((x) => x.email === e)) all.push({ email: e, page: p.url });
  if (!all.length) return { ok: false, s: "no email", found: 0 };
  const here = all.filter((x) => domains.has(registrable(x.email.split("@")[1])));
  const local = (e: string) => e.split("@")[0];
  const mine = here.filter((x) => localMatches(local(x.email), name)).sort((a, b) => nameRank(local(a.email), name) - nameRank(local(b.email), name));
  if (mine.length) return { ok: true, email: mine[0].email, page: mine[0].page, how: "name match" };
  const text = texts.join(" \n ");
  const named = namesPerson(text, name);
  const personal = here.filter((x) => !isRole(local(x.email)));
  const onePerson = named && personal.length <= 1 && !TEAM_WORDS.test(text);
  if (onePerson && personal.length === 1) return { ok: true, email: personal[0].email, page: personal[0].page, how: "only address on a one-person site" };
  if (onePerson && !personal.length) {
    const roles = here.filter((x) => isRole(local(x.email)) && !/^(no-?reply|donotreply|do-not-reply|postmaster|hostmaster|abuse|webmaster|privacy|careers|jobs|press|security|billing|invoices)$/.test(local(x.email)));
    roles.sort((a, b) => (ROLE_ORDER.indexOf(local(a.email)) + 1 || 99) - (ROLE_ORDER.indexOf(local(b.email)) + 1 || 99));
    if (roles.length) return { ok: true, email: roles[0].email, page: roles[0].page, how: "generic on a one-person site" };
  }
  return { ok: false, s: "email not theirs", found: all.length };
}

/* ---------- which pages to read ---------- */

export type PageKind = "contact" | "about" | "team";
const KIND_RE: [PageKind, RegExp][] = [
  ["contact", /(^|[/_-])(contact|contact-us|contactus|get-in-touch|reach-out|connect|lets-talk|work-with-me|hire-me|book|schedule)([/_.-]|$)/i],
  ["about", /(^|[/_-])(about|about-us|about-me|aboutus|bio|founder|who-we-are|who-i-am|story|my-story|our-story|meet)([/_.-]|$)/i],
  ["team", /(^|[/_-])(team|our-team|people|leadership|partners|staff)([/_.-]|$)/i],
];
/** What a page's address says it is, or null. */
export function kindOf(path: string): PageKind | null {
  for (const [k, re] of KIND_RE) if (re.test(path)) return k;
  return null;
}

/** The same-site links a page holds, with their kind (contact, about or team), in page order. */
export function pageLinks(html: string, base: string, sameSite: (u: URL) => boolean): { url: string; kind: PageKind }[] {
  const out: { url: string; kind: PageKind }[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)) && out.length < 60; ) {
    const raw = decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw || /^(mailto|tel|javascript|data):/i.test(raw) || raw.startsWith("#")) continue;
    let u: URL;
    try {
      u = new URL(raw, base);
    } catch {
      continue;
    }
    u.hash = "";
    if (!sameSite(u)) continue;
    const words = cleanText(m[4] ?? "").toLowerCase();
    const kind = kindOf(u.pathname) ?? (/\bcontact\b/.test(words) ? "contact" : /\babout\b/.test(words) ? "about" : /\bteam\b/.test(words) ? "team" : null);
    if (!kind) continue;
    const key = `${u.host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ url: u.href, kind });
  }
  return out;
}
