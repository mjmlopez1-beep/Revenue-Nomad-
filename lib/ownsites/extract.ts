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
 *    firstlast, first initial and last name: flast, f.last, f_last, lastf, last.f; firstl,
 *    first_last, initials; case and accents folded), or
 *  - "nickname match": a common nickname of their first name (NICKNAMES: Mike for Michael, Bill for
 *    William, Liz for Elizabeth ...) with their last name, in the same forms (mike.smith,
 *    mikesmith, msmith for Mike, smith.mike). A nickname alone, or a nickname's initials, is not
 *    enough: the last name must be there, as the full-name rules have it, or
 *  - "bio page": the only personal-looking address at the site's domain on the person's own about,
 *    bio or team-member page (bioPage: an about, bio or team page whose title or main heading names
 *    them, or whose address carries their name), which counts as the site naming them, or
 *  - "only address on a one-person site": the site names the person, looks like one person's, and
 *    this is its only personal-looking address, or
 *  - "generic inbox, one-person site": a role address (info@, hello@, contact@ ...) on a site that
 *    names the person, looks like one person's (onePerson: no team words, no team page read, at
 *    most one personal-looking address) and has no better address. INVITES ONLY: kept flagged
 *    (OwnEmail.invitesOnly) to send them an invite to Merlin, never shown to a member as theirs.
 * Or, on their own site, a personal mail provider's address (gmail.com, outlook.com ...) that is
 * plainly theirs: "name match, personal address", its part before the @ holding both their first
 * and last name (first.last, firstlast, flast, first_last ...). A first name alone or initials there
 * are not enough: a provider's address is anyone's.
 * Otherwise it is "email not theirs" (emails there, none theirs, with why: counts for the log) or "no email".
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
/** Personal mail providers: an address there is the person's only when it spells their whole name. */
export const PERSONAL_DOMAINS = new Set([
  "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "ymail.com", "icloud.com", "me.com", "mac.com",
  "aol.com", "proton.me", "protonmail.com", "pm.me", "fastmail.com", "zoho.com", "gmx.com", "hey.com", "comcast.net", "att.net", "verizon.net", "sbcglobal.net",
]);
export const isPersonalDomain = (domain: string) => PERSONAL_DOMAINS.has(domain.toLowerCase());

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

/**
 * Common nicknames, each group one name's forms (the formal name first). A nickname counts like
 * the first name only with the last name beside it. Compact on purpose: the usual American forms.
 */
export const NICKNAMES: readonly (readonly string[])[] = [
  ["michael", "mike", "mick", "mikey"], ["william", "bill", "will", "billy", "liam"], ["elizabeth", "liz", "beth", "betsy", "lizzie", "eliza"],
  ["robert", "rob", "bob", "bobby", "robbie"], ["richard", "rick", "rich", "dick", "ricky"], ["james", "jim", "jimmy", "jamie"], ["john", "jack", "johnny"],
  ["joseph", "joe", "joey"], ["thomas", "tom", "tommy"], ["christopher", "chris", "topher"], ["daniel", "dan", "danny"], ["matthew", "matt"],
  ["anthony", "tony"], ["andrew", "andy", "drew"], ["edward", "ed", "eddie", "ted", "ned"], ["benjamin", "ben", "benji"], ["samuel", "sam", "sammy"],
  ["samantha", "sam", "sammy"], ["alexander", "alex", "xander"], ["alexandra", "alex", "lexi"], ["nicholas", "nick", "nico"], ["jonathan", "jon"],
  ["nathaniel", "nate", "nathan"], ["nathan", "nate"], ["stephen", "steve"], ["steven", "steve"], ["gregory", "greg"], ["jeffrey", "jeff"],
  ["kenneth", "ken", "kenny"], ["timothy", "tim", "timmy"], ["patrick", "pat"], ["patricia", "pat", "patty", "trish"], ["katherine", "kate", "katie", "kathy", "kat"],
  ["catherine", "cathy", "kate", "cat"], ["kathleen", "kathy", "kate"], ["margaret", "maggie", "meg", "peggy"], ["jennifer", "jen", "jenny"], ["jessica", "jess", "jessie"],
  ["rebecca", "becky", "becca"], ["susan", "sue", "susie"], ["deborah", "deb", "debbie"], ["christine", "chris", "tina"], ["christina", "chris", "tina"],
  ["victoria", "vicky", "tori"], ["abigail", "abby"], ["kimberly", "kim"], ["pamela", "pam"], ["cynthia", "cindy"], ["frederick", "fred", "freddie"],
  ["charles", "charlie", "chuck"], ["david", "dave"], ["donald", "don", "donnie"], ["ronald", "ron", "ronnie"], ["lawrence", "larry"], ["raymond", "ray"],
  ["gerald", "jerry"], ["douglas", "doug"], ["philip", "phil"], ["phillip", "phil"], ["peter", "pete"], ["zachary", "zach", "zack"], ["joshua", "josh"],
  ["jacob", "jake"], ["michelle", "shelly"], ["theodore", "ted", "theo"], ["leonard", "leo", "len"], ["allison", "ally", "allie"], ["madeline", "maddie"],
  ["melissa", "mel", "missy"], ["amanda", "mandy"], ["barbara", "barb"], ["valerie", "val"], ["vincent", "vince"], ["walter", "walt"], ["harold", "hal"],
];
/** The other forms of a first name (its nicknames, or a nickname's formal name and siblings), without the name itself. */
export function nicknamesOf(first: string): string[] {
  const f = first.toLowerCase();
  const out = new Set<string>();
  for (const g of NICKNAMES) if (g.includes(f)) for (const n of g) if (n !== f && n.length >= 2) out.add(n);
  return [...out];
}
/** A first name with the last name in the forms a local part takes: first.last, firstlast, first-last, first_last, flast, f.last, last.first, lastfirst. */
const withLast = (f: string, l: string) => [`${f}.${l}`, `${f}-${l}`, `${f}_${l}`, `${f}${l}`, `${f[0]}${l}`, `${f[0]}.${l}`, `${l}.${f}`, `${l}${f}`, `${l}_${f}`];

/** The local parts a nickname of their first name gives, always with the last name. */
export function nicknameLocals(name: string): Set<string> {
  const w = nameWords(name);
  const out = new Set<string>();
  if (w.length < 2) return out;
  const l = w[w.length - 1];
  if (l.length < 2) return out;
  for (const n of nicknamesOf(w[0])) for (const x of withLast(n, l)) out.add(x);
  // A form the first name itself gives is a plain name match, not a nickname one.
  for (const x of personLocals(name)) out.delete(x);
  return out;
}
/** Whether a local part is a nickname of their first name with their last name. Digits after it are allowed. */
export function nicknameMatches(local: string, name: string): boolean {
  const lp = local.toLowerCase().replace(/\+.*$/, "").replace(/\d+$/, "");
  return lp.length >= 4 && nicknameLocals(name).has(lp);
}

/** The local parts that are this person's: first, last, first.last, first-last, firstlast, first initial and last name (flast, f.last, f_last, lastf, last.f), firstl, first_last, initials. */
export function personLocals(name: string): Set<string> {
  const w = nameWords(name).filter((x) => x.length >= 1);
  const out = new Set<string>();
  if (w.length < 2) return out;
  const f = w[0];
  const l = w[w.length - 1];
  const mids = w.slice(1, -1);
  if (f.length >= 2) out.add(f);
  if (l.length >= 3) out.add(l);
  for (const x of [`${f}.${l}`, `${f}-${l}`, `${f}_${l}`, `${f}${l}`, `${f}${l[0]}`, `${f}.${l[0]}`, `${l}.${f}`, `${l}${f}`]) out.add(x);
  // First initial and last name, at the site's own domain: jsmith, j.smith, j_smith, j-smith, smithj, smith.j.
  if (l.length >= 2) for (const x of [`${f[0]}${l}`, `${f[0]}.${l}`, `${f[0]}_${l}`, `${f[0]}-${l}`, `${l}${f[0]}`, `${l}.${f[0]}`]) out.add(x);
  // Initials: "jd", and with a middle initial "jmd".
  out.add(`${f[0]}${l[0]}`);
  if (mids.length) out.add(`${f[0]}${mids.map((m) => m[0]).join("")}${l[0]}`);
  // A double surname written as one ("garcia-lopez" read as garcialopez) or the last part of it.
  if (mids.length) out.add(`${f}${mids.join("")}${l}`);
  return out;
}

/** The local parts that spell the whole name (first and last both in it): what a personal provider's address must be. */
export function fullNameLocals(name: string): Set<string> {
  const w = nameWords(name);
  const out = new Set<string>();
  if (w.length < 2) return out;
  const f = w[0];
  const l = w[w.length - 1];
  if (f.length < 2 || l.length < 2) return out;
  for (const x of withLast(f, l)) out.add(x);
  // A nickname of the first name with the whole last name is their whole name too (mike.smith for Michael Smith).
  for (const n of nicknamesOf(f)) for (const x of withLast(n, l)) out.add(x);
  const mids = w.slice(1, -1);
  if (mids.length) {
    out.add(`${f}${mids.join("")}${l}`);
    out.add(`${f}.${mids.map((m) => m[0]).join("")}.${l}`);
    out.add(`${f}${mids.map((m) => m[0]).join("")}${l}`);
  }
  return out;
}

/** Whether a personal provider's local part is this person's: the whole name, digits after it allowed. */
export function fullNameMatches(local: string, name: string): boolean {
  const lp = local.toLowerCase().replace(/\+.*$/, "").replace(/\d+$/, "").replace(/[._-]$/, "");
  return lp.length >= 4 && fullNameLocals(name).has(lp);
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
  | { ok: true; email: string; page: string; how: "name match" | "nickname match" | "bio page" | "only address on a one-person site" | "generic inbox, one-person site" | "name match, personal address"; invitesOnly?: true }
  | { ok: false; s: "no email"; found: number }
  | { ok: false; s: "email not theirs"; found: number; why: RejectWhy };

/** Why a site's addresses were none of them the person's. Counts of these go in the log, nothing else. */
export type RejectWhy =
  | "personal address, not their whole name"
  | "only other companies' addresses"
  | "role address, site doesn't name them"
  | "role address on a team site"
  | "someone else's address, site doesn't name them"
  | "someone else's address on a team site";
export const REJECT_WHYS: RejectWhy[] = [
  "personal address, not their whole name",
  "only other companies' addresses",
  "role address, site doesn't name them",
  "role address on a team site",
  "someone else's address, site doesn't name them",
  "someone else's address on a team site",
];

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

/** The page's title and main headings (h1, h2), as text: what a bio page names its person in. */
function headText(html: string): string {
  const out: string[] = [];
  for (const m of html.slice(0, 600_000).matchAll(/<(title|h1|h2)\b[^>]*>([\s\S]*?)<\/\1\s*>/gi)) out.push(cleanText(m[2]));
  return out.join(" \n ");
}

/** The slugs a person's own page address may carry: "jane-smith", "janesmith", "jane_smith", "smith" (folded). A first name alone counts only on an about or team page (bioPage). */
export function nameSlugs(name: string): string[] {
  const w = nameWords(name);
  if (w.length < 2) return [];
  const f = w[0];
  const l = w[w.length - 1];
  const nick = nicknamesOf(f).filter((n) => n.length >= 3);
  return [...new Set([`${f}-${l}`, `${f}_${l}`, `${f}${l}`, `${f}.${l}`, ...nick.map((n) => `${n}-${l}`), ...nick.map((n) => `${n}${l}`), ...(l.length >= 3 ? [l] : [])])];
}
/** Whether a path carries the person's name in a segment ("/team/jane-smith", "/about/jane", "/bio-smith", "/people/smith.html"). */
export function pathNamesPerson(path: string, name: string): boolean {
  let p = path;
  try {
    p = decodeURIComponent(path);
  } catch {
    /* as written */
  }
  const segs = p.toLowerCase().replace(/\.(html?|php|aspx?)$/, "").split("/").filter(Boolean);
  const slugs = nameSlugs(name);
  return segs.some((seg) => {
    const parts = seg.split(/[-_.]/);
    return slugs.some((sl) => seg === sl || (!/[-_.]/.test(sl) && parts.includes(sl)) || (/[-_.]/.test(sl) && seg.includes(sl)));
  });
}

/**
 * The person's own about, bio or team-member page: a same-site page (not the homepage) whose
 * address carries their name, or an about or team page whose title or main heading names them. A
 * team listing with everyone's addresses is never read as one person's: decide wants a single
 * personal-looking address on it.
 */
export function bioPage(p: SitePage, name: string): boolean {
  let path = "/";
  try {
    path = new URL(p.url).pathname;
  } catch {
    return false;
  }
  if (path === "/" || path === "") return false;
  if (pathNamesPerson(path, name)) return true;
  const kind = kindOf(path);
  if (kind !== "about" && kind !== "team") return false;
  const first = nameWords(name)[0] ?? "";
  const firstInPath = first.length >= 3 && path.toLowerCase().split(/[/_.-]/).includes(first);
  return firstInPath || namesPerson(headText(p.html), name);
}

/**
 * A one-person site: the pages name the person, read as one person's (no team words), no team page
 * was read besides the person's own bio page, and at most one personal-looking address is there.
 */
function onePersonSite(pages: SitePage[], text: string, name: string, personalCount: number): boolean {
  if (!namesPerson(text, name) || personalCount > 1 || TEAM_WORDS.test(text)) return false;
  return !pages.some((p) => {
    try {
      return kindOf(new URL(p.url).pathname) === "team" && !bioPage(p, name);
    } catch {
      return false;
    }
  });
}

/** Which address on the pages is the person's, if any. `site` is the host read. */
export function decide(pages: SitePage[], site: string, name: string): Decision {
  const hosts = pages.flatMap((p) => linkedHosts(p.html));
  const domains = siteDomains(site, hosts);
  const texts = pages.map((p) => visibleText(p.html));
  const all: { email: string; page: string }[] = [];
  for (const p of pages) for (const e of emailsOf(p.html)) if (!all.some((x) => x.email === e)) all.push({ email: e, page: p.url });
  if (!all.length) return { ok: false, s: "no email", found: 0 };
  const atSite = (e: string) => domains.has(registrable(e.split("@")[1]));
  const here = all.filter((x) => atSite(x.email));
  const local = (e: string) => e.split("@")[0];
  const mine = here.filter((x) => localMatches(local(x.email), name)).sort((a, b) => nameRank(local(a.email), name) - nameRank(local(b.email), name));
  if (mine.length) return { ok: true, email: mine[0].email, page: mine[0].page, how: "name match" };
  // A common nickname of their first name with their last name (mike.smith for Michael Smith), at the site's own domain.
  const nick = here.find((x) => nicknameMatches(local(x.email), name));
  if (nick) return { ok: true, email: nick.email, page: nick.page, how: "nickname match" };
  // Their own bio page names them: its one personal-looking address at the site's domain is theirs.
  for (const p of pages) {
    if (!bioPage(p, name) || !namesPerson(visibleText(p.html), name)) continue;
    const own = emailsOf(p.html).filter((e) => atSite(e) && !isRole(local(e)));
    if (own.length === 1) return { ok: true, email: own[0], page: p.url, how: "bio page" };
  }
  const personalMine = all.filter((x) => isPersonalDomain(x.email.split("@")[1]) && fullNameMatches(local(x.email), name));
  const text = texts.join(" \n ");
  const named = namesPerson(text, name);
  const personal = here.filter((x) => !isRole(local(x.email)));
  const onePerson = onePersonSite(pages, text, name, personal.length);
  if (onePerson && personal.length === 1) return { ok: true, email: personal[0].email, page: personal[0].page, how: "only address on a one-person site" };
  // Their whole name at a personal provider, on their own site: theirs, after anything personal at the site's own domain.
  if (personalMine.length) return { ok: true, email: personalMine[0].email, page: personalMine[0].page, how: "name match, personal address" };
  if (onePerson && !personal.length) {
    const roles = here.filter((x) => isRole(local(x.email)) && !/^(no-?reply|donotreply|do-not-reply|postmaster|hostmaster|abuse|webmaster|privacy|careers|jobs|press|security|billing|invoices)$/.test(local(x.email)));
    roles.sort((a, b) => (ROLE_ORDER.indexOf(local(a.email)) + 1 || 99) - (ROLE_ORDER.indexOf(local(b.email)) + 1 || 99));
    // Invites only: the address may carry an invite to Merlin, never a member's view of their email.
    if (roles.length) return { ok: true, email: roles[0].email, page: roles[0].page, how: "generic inbox, one-person site", invitesOnly: true };
  }
  let why: RejectWhy;
  if (!here.length) why = all.some((x) => isPersonalDomain(x.email.split("@")[1])) ? "personal address, not their whole name" : "only other companies' addresses";
  else if (!personal.length) why = named ? "role address on a team site" : "role address, site doesn't name them";
  else why = named ? "someone else's address on a team site" : "someone else's address, site doesn't name them";
  return { ok: false, s: "email not theirs", found: all.length, why };
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

/**
 * Links that look like the person's own bio page: same site, and the address carries their name
 * ("/team/jane-smith") or the link's words name them ("Jane Smith" on a team page). At most `max`,
 * in page order. The homepage is never one.
 */
export function bioLinks(html: string, base: string, sameSite: (u: URL) => boolean, name: string, max = 4): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))[^>]*>([\s\S]*?)<\/a\s*>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)) && out.length < max; ) {
    const raw = decodeEntities(m[1] ?? m[2] ?? m[3] ?? "").trim();
    if (!raw || /^(mailto|tel|javascript|data):/i.test(raw) || raw.startsWith("#")) continue;
    let u: URL;
    try {
      u = new URL(raw, base);
    } catch {
      continue;
    }
    u.hash = "";
    if (!sameSite(u) || u.pathname === "/" || u.pathname === "") continue;
    if (!pathNamesPerson(u.pathname, name) && !namesPerson(cleanText(m[4] ?? ""), name)) continue;
    const key = `${u.host}${u.pathname.replace(/\/+$/, "")}${u.search}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(u.href);
  }
  return out;
}
