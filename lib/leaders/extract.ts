/**
 * Leaders out of a company's own pages, by rules (no AI, no paid data): JSON-LD Person (a name and
 * a jobTitle), team cards (a name next to a title), and press lines ("appoints … as Chief Revenue
 * Officer", "joins … as VP Sales", "joined in 2024") with the press release's date. No network
 * here; see lib/leaders/run.ts.
 *
 * A name is only ever used to tell a leader's title from other text on the page. It is never
 * returned: a Candidate holds the function, level, kind, since and source alone.
 */
import { cleanText } from "../about/extract";
import { DIRECTOR_PLUS, seniorityOf, type Seniority } from "../seniority";
import { functionOf } from "../tableFields";
import { LEADER_LEVELS, type LeaderHow, type LeaderKind, type LeaderLevel } from "./types";

/** One function's leader read on a page. `date`: the press release's day ("2024-11-05") or month, to tell newer from older. */
export interface Candidate {
  fn: string;
  level: LeaderLevel;
  kind: LeaderKind;
  since?: string;
  how: LeaderHow;
  url: string;
  date?: string;
}

/* ---------- titles ---------- */

/** Functions a leader is kept for: every function but the catch-alls (a CEO or founder is not a function's leader here). */
const SKIP_FNS = new Set(["Executive", "Other"]);
/** A title that is not the person's current role. */
const NOT_NOW = /\b(?:former(?:ly)?|ex-|previously|retired|emerit(?:us|a)|alumn[ia]|past)\b/i;

/** Fractional, interim, advisory or part-time, from the title's own words; else full-time. */
export function kindOf(title: string): LeaderKind {
  if (/\bfractional\b/i.test(title)) return "fractional";
  if (/\b(?:interim|acting)\b/i.test(title)) return "interim";
  if (/\badvis(?:or|er|ory)\b/i.test(title)) return "advisor";
  if (/\bpart[\s-]?time\b/i.test(title)) return "part-time";
  return "full-time";
}

/** Titles the function rules (functionOf) read better spelled out. */
function spellOut(t: string): string {
  return (
    t
      // "Chief Marketing and Revenue Officer" is a CMO and a CRO.
      .replace(/\bchief\s+([a-z][a-z ]*?)\s*(?:&|\+|\/|\band\b)\s*([a-z][a-z ]*?)\s+officer\b/gi, "Chief $1 Officer & Chief $2 Officer")
      .replace(/\bcgo\b/gi, "Chief Growth Officer")
      .replace(/\bchief customer officer\b/gi, "Chief Customer Success Officer")
      // A CPTO leads Product and Technology; a CPO-and-CTO in one, as a team page spells it.
      .replace(/\bcpto\b/gi, "Chief Product Officer & Chief Technology Officer")
      // A Chief Business Officer (CBO) and a bare CCO run the commercial side: Sales, as a Chief Commercial Officer does.
      .replace(/\b(?:chief business officer|cbo|cco)\b/gi, "Chief Commercial Officer")
  );
}

const levelOf = (s: Seniority | null): LeaderLevel | null => (s && DIRECTOR_PLUS.includes(s) ? (s as LeaderLevel) : null);

/**
 * The functions a title leads, each with its level and the kind of seat: "Chief Revenue Officer"
 * is Sales at C-level, "CMO & CRO" and "Chief Marketing and Revenue Officer" are both Marketing
 * and Sales, "VP Sales and Marketing" is VP of both. Titles below Director, a CEO or founder, and
 * a former role give nothing.
 */
export function classifyTitle(raw: string): { fn: string; level: LeaderLevel; kind: LeaderKind }[] {
  const title = cleanText(raw).slice(0, 160);
  if (!title || NOT_NOW.test(title)) return [];
  const kind = kindOf(title);
  const t = spellOut(title);
  const whole = seniorityOf(t);
  const out: { fn: string; level: LeaderLevel; kind: LeaderKind }[] = [];
  const add = (fn: string | null, level: LeaderLevel | null) => {
    if (!fn || !level || SKIP_FNS.has(fn) || out.some((x) => x.fn === fn)) return;
    out.push({ fn, level, kind });
  };
  const parts = t.split(/\s*(?:&|\+|\/|\band\b)\s*/i).filter((p) => p.trim());
  for (const p of parts) {
    const own = seniorityOf(p);
    // A part with a level of its own keeps it ("Sales Manager" stays a manager); one without takes the title's ("VP Sales and Marketing").
    add(functionOf(p), own ? levelOf(own) : levelOf(whole));
  }
  if (!out.length && parts.length > 1) add(functionOf(t), levelOf(whole));
  return out;
}

/** The more senior of two levels comes first (a negative number when `a` is more senior). */
export const levelRank = (l: LeaderLevel) => LEADER_LEVELS.indexOf(l);

/* ---------- names (to recognise a card, never kept) ---------- */

const NAME_STOP =
  /\b(?:chief|officer|president|vp|vice|head|director|manager|lead|leader|team|leadership|management|board|our|the|meet|about|company|sales|marketing|revenue|growth|operations|finance|people|product|customer|success|partner|partners|founder|co-founder|advisor|advisors|contact|news|press|read|more|view|bio|email|careers|executive|executives|services|solutions|home|blog|global|inc|llc|ltd)\b/i;
const PARTICLE = /^(?:de|da|del|della|di|du|van|von|der|den|la|le|al|el|bin|ibn|st\.?|mc|mac)$/i;
/** A person's name: 2 to 4 words, each capitalised (or a particle), letters only. */
export function looksLikeName(s: string): boolean {
  const t = s.trim().replace(/\s+/g, " ");
  if (t.length < 4 || t.length > 40 || NAME_STOP.test(t)) return false;
  const words = t.split(" ");
  if (words.length < 2 || words.length > 4) return false;
  return words.every((w) => PARTICLE.test(w) || /^\p{Lu}[\p{L}'’.-]*$/u.test(w) || /^\p{Lu}\.$/u.test(w)) && /^\p{Lu}/u.test(words[words.length - 1]);
}

/** A line that reads as a title: short, no sentence, and it classifies. */
function titleLine(s: string): ReturnType<typeof classifyTitle> {
  const t = s.trim();
  if (!t || t.length > 90 || t.split(/\s+/).length > 10) return [];
  if (/[.!?]\s*\S/.test(t) || /\b(?:is|was|has|have|leads|led|joined|joins|brings|oversees|serves|spent|worked|appoints?|appointed|names|named|promotes|promoted|hires|hired|welcomes|welcomed|announces)\b/i.test(t)) return [];
  return classifyTitle(t);
}

/* ---------- reading the HTML ---------- */

/** The page without the parts that hold no leaders: scripts, styles, forms, nav, header and footer. */
function bodyOf(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|template|svg|iframe|object|select|textarea|button|form|nav|header|footer|head)\b[\s\S]*?<\/\1\s*>/gi, " ");
}

const BLOCK = /<\/?(?:div|p|h[1-6]|li|ul|ol|section|article|figure|figcaption|td|th|tr|table|dt|dd|dl|br|hr|main|aside|blockquote|address|picture|img)\b[^>]*>/gi;
/** The page as lines of text: one per block, and (for cards) inline tags split too. */
function linesOf(html: string, splitInline: boolean): string[] {
  let s = bodyOf(html).replace(BLOCK, "\n");
  if (splitInline) s = s.replace(/<\/?(?:span|a|strong|b|em|i|small|label)\b[^>]*>/gi, "\n");
  return s
    .split(/\n+/)
    .map((x) => cleanText(x))
    .filter(Boolean);
}

/** Photo cards' alt text that names a person and a title: "Jane Doe, Chief Revenue Officer at Acme", "Jane Doe | CRO". [name, title] pairs, never kept. */
function altCards(html: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /<img\b[^>]*?\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/gi;
  const body = bodyOf(html);
  for (let m: RegExpExecArray | null; (m = re.exec(body)) && out.length < 200; ) {
    const alt = cleanText(m[1] ?? m[2] ?? "");
    const split = /^(.{4,40}?)\s*(?:,|\s[–—|·-]\s|:)\s*(.{2,90}?)(?:\s+(?:at|@)\s+[^,]{1,60})?$/.exec(alt);
    if (split) out.push([split[1], split[2]]);
  }
  return out;
}

/**
 * A page drawn by script keeps its team in the data it renders from: {"name":"Jane Doe","title":
 * "Chief Revenue Officer"} (or jobTitle, position, role, designation), in either order, in one
 * object. [name, title] pairs, never kept. JSON-LD is read on its own (jsonLd).
 */
function scriptCards(html: string): [string, string][] {
  const out: [string, string][] = [];
  const re = /<script\b(?![^>]*application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let budget = 600_000;
  const KEY = String.raw`"(?:jobTitle|job_title|title|position|role|designation)"\s*:\s*"([^"\\]{2,90})"`;
  const NAME = String.raw`"(?:name|fullName|full_name)"\s*:\s*"([^"\\]{4,40})"`;
  const pairs = [new RegExp(`${NAME}[^{}]{0,300}?${KEY}`, "g"), new RegExp(`${KEY}[^{}]{0,300}?${NAME}`, "g")];
  for (let m: RegExpExecArray | null; (m = re.exec(html)) && budget > 0 && out.length < 200; ) {
    // A Next.js page escapes its data inside a string: read it unescaped.
    const body = m[1].slice(0, budget).replace(/\\"/g, '"');
    budget -= m[1].length;
    if (!/"(?:jobTitle|job_title|title|position|role|designation)"/.test(body)) continue;
    pairs.forEach((p, n) => {
      p.lastIndex = 0;
      for (let x: RegExpExecArray | null; (x = p.exec(body)) && out.length < 200; ) out.push(n === 0 ? [x[1], x[2]] : [x[2], x[1]]);
    });
  }
  return out;
}

/** JSON-LD blocks, parsed. */
function jsonLd(html: string): unknown[] {
  const out: unknown[] = [];
  const re = /<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)); ) {
    try {
      out.push(JSON.parse(m[1].trim().replace(/^<!\[CDATA\[|\]\]>$/g, "")));
    } catch {
      /* not JSON */
    }
  }
  return out;
}
function walk(x: unknown, visit: (o: Record<string, unknown>) => void, depth = 0) {
  if (!x || typeof x !== "object" || depth > 8) return;
  if (Array.isArray(x)) {
    for (const y of x.slice(0, 200)) walk(y, visit, depth + 1);
    return;
  }
  const o = x as Record<string, unknown>;
  visit(o);
  for (const v of Object.values(o)) if (v && typeof v === "object") walk(v, visit, depth + 1);
}
const types = (o: Record<string, unknown>) => ([] as unknown[]).concat(o["@type"] ?? []).map(String);

/* ---------- dates ---------- */

const MONTH_NAMES = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
const MONTH_RE = String.raw`(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?`;
const pad = (n: number) => String(n).padStart(2, "0");
/** A day ("2024-11-05") or a month ("2024-11") from the start of `s`, if it holds a date. Years outside 1990 to next year are not dates. */
export function dateIn(s: string, nowYear = new Date().getUTCFullYear()): string | null {
  const ok = (y: number) => y >= 1990 && y <= nowYear + 1;
  let m = /\b((?:19|20)\d{2})-(\d{2})(?:-(\d{2}))?(?:[T\s]|\b)/.exec(s);
  if (m && ok(Number(m[1])) && Number(m[2]) >= 1 && Number(m[2]) <= 12) return m[3] ? `${m[1]}-${m[2]}-${m[3]}` : `${m[1]}-${m[2]}`;
  m = new RegExp(String.raw`\b${MONTH_RE}\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+((?:19|20)\d{2})\b`, "i").exec(s);
  if (m && ok(Number(m[3]))) return `${m[3]}-${pad(MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1)}-${pad(Number(m[2]))}`;
  m = new RegExp(String.raw`\b(\d{1,2})\s+${MONTH_RE},?\s+((?:19|20)\d{2})\b`, "i").exec(s);
  if (m && ok(Number(m[3]))) return `${m[3]}-${pad(MONTH_NAMES.indexOf(m[2].slice(0, 3).toLowerCase()) + 1)}-${pad(Number(m[1]))}`;
  m = new RegExp(String.raw`\b${MONTH_RE},?\s+((?:19|20)\d{2})\b`, "i").exec(s);
  if (m && ok(Number(m[2]))) return `${m[2]}-${pad(MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1)}`;
  return null;
}

/** When a press release was published: its JSON-LD, its meta tags, its first <time>, a date in its text near the top, or its address. */
export function pageDate(html: string, url: string): string | null {
  for (const d of jsonLd(html)) {
    let got: string | null = null;
    walk(d, (o) => {
      if (got) return;
      const v = o.datePublished ?? o.dateCreated;
      if (typeof v === "string") got = dateIn(v);
    });
    if (got) return got;
  }
  const meta = /<meta\b[^>]*(?:property|name|itemprop)\s*=\s*["'](?:article:published_time|og:published_time|datePublished|date|pubdate|publish[-_]?date|dc\.date(?:\.issued)?)["'][^>]*>/gi;
  for (let m: RegExpExecArray | null; (m = meta.exec(html)); ) {
    const c = /content\s*=\s*["']([^"']+)["']/i.exec(m[0])?.[1];
    const d = c ? dateIn(c) : null;
    if (d) return d;
  }
  const time = /<time\b[^>]*datetime\s*=\s*["']([^"']+)["']/i.exec(bodyOf(html))?.[1];
  if (time && dateIn(time)) return dateIn(time);
  for (const line of linesOf(html, false).slice(0, 40)) {
    const d = dateIn(line);
    if (d) return d;
  }
  const u = /\/((?:19|20)\d{2})\/(\d{1,2})\//.exec(url);
  if (u && Number(u[2]) >= 1 && Number(u[2]) <= 12) return `${u[1]}-${pad(Number(u[2]))}`;
  return null;
}

/** "joined in 2024", "joined the company in March 2023", "since 2022": the year (and month) someone started. */
function joinedIn(s: string): string | null {
  const m = new RegExp(String.raw`\b(?:joined|joining|has been with|with (?:us|the company|the team) since|since)\b[^.;]{0,40}?\b(?:${MONTH_RE}\s+)?((?:19|20)\d{2})\b`, "i").exec(s);
  if (!m) return null;
  const y = Number(m[2]);
  if (y < 1990 || y > new Date().getUTCFullYear() + 1) return null;
  return m[1] ? `${m[2]}-${pad(MONTH_NAMES.indexOf(m[1].slice(0, 3).toLowerCase()) + 1)}` : m[2];
}
/** A day as the month it is in ("2024-11-05" is "2024-11"). */
const monthOf = (d: string) => d.slice(0, 7);

/* ---------- press lines ---------- */

const VERB = String.raw`(?:appoints|appointed|has appointed|names|named|has named|promotes|promoted|has promoted|hires|hired|has hired|welcomes|welcomed|adds|added|taps|tapped|elevates|elevated|announce[sd]?\s+the\s+(?:appointment|promotion|hiring|addition)\s+of)`;
/** What follows "as" or "to": the title, up to a stop. */
const TITLE_TAIL = String.raw`(?:its |our |the |a |an |new |company'?s |\w+'s )*([^.,;:()\n"“”]{2,90}?)(?=[.,;:()\n"“”]|\s+(?:effective|where|who|which|to (?:lead|head|oversee|drive|run|help|build|scale|grow|accelerate)|reporting|with|after|from|in|at|for|on|today|this|starting|following)\b|$)`;
const PRESS = [
  // "Acme appoints Jane Doe as Chief Revenue Officer", "promotes Jane Doe to Chief Marketing and Revenue Officer"
  new RegExp(String.raw`\b${VERB}\s+(.{2,80}?)\s+(?:as|to(?: the (?:role|position|post) of)?)\s+${TITLE_TAIL}`, "gi"),
  // "Jane Doe joins Acme as VP Sales"
  new RegExp(String.raw`\b(?:joins|joined|has joined|rejoins)\s+(.{2,60}?)\s+as\s+${TITLE_TAIL}`, "gi"),
  // "Acme names Jane Doe Chief Revenue Officer"
  new RegExp(
    String.raw`\b(?:names|named|appoints|appointed)\s+((?:\p{Lu}[\p{L}'’.-]*\s+){1,4}?)((?:fractional |interim |acting |part-time )?(?:chief|vp|vice president|svp|evp|head of|director|senior vice president|global head|c[rmgf]o)\b[^.,;:()\n]{0,60}?)(?=[.,;:()\n]|\s+(?:effective|where|who|to lead|reporting|with|after|from|in|at|for|on)\b|$)`,
    "giu",
  ),
];

/**
 * The words of a name, lowercased, to keep them out of anything stored: a page's address can
 * carry a name ("/news/acme-appoints-jane-doe-as-cro", "/team/jane-doe"), and such an address is
 * never kept (lib/leaders/run.ts keeps the page that linked to it instead).
 */
export function nameTokens(s: string): string[] {
  return s
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split(/[^\p{L}'’-]+/u)
    .map((w) => w.replace(/['’-]+/g, "").toLowerCase())
    .filter((w) => w.length >= 3);
}
const addNames = (names: Set<string> | undefined, s: string) => {
  if (names) for (const w of nameTokens(s)) names.add(w);
};

/** Appointments in one stretch of text, with a date to read them at (the press release's, else one near the line). */
function pressIn(text: string, url: string, date: string | null, names?: Set<string>): Candidate[] {
  const out: Candidate[] = [];
  for (const [n, re] of PRESS.entries()) {
    re.lastIndex = 0;
    for (let m: RegExpExecArray | null; (m = re.exec(text)); ) {
      const title = m[m.length - 1];
      // The words between the verb and "as" are who it is: a person, not a board or a committee.
      if (/\b(?:board|committee|council|partner(?:ship)?s? with|agency|firm)\b/i.test(m[1] ?? "")) continue;
      // Who it is, only to keep their name out of what is stored: the words before "joins", else between the verb and the title.
      if (n === 1) addNames(names, /((?:\p{Lu}[\p{L}'’.-]*\s+){1,4})$/u.exec(text.slice(Math.max(0, m.index - 60), m.index))?.[1] ?? "");
      else addNames(names, m[1] ?? "");
      const near = text.slice(m.index, m.index + m[0].length + 160);
      // "Pat joined Acme in 2022 as VP Marketing" says when itself; an appointment takes the release's date, else a "joined in" near it.
      const own = joinedIn(m[0]);
      const since = own ?? (date ? monthOf(date) : joinedIn(near) ?? undefined);
      const at = own ?? date ?? undefined;
      for (const c of classifyTitle(title)) out.push({ ...c, ...(since ? { since } : {}), how: "press release", url, ...(at ? { date: at } : {}) });
    }
  }
  return out;
}

/* ---------- a page ---------- */

/** A line that reads as anyone's title on a team card, a CEO's or a founder's too (they lead no function here). */
const ANY_TITLE = /\b(?:chief|officer|c[a-z]{1,3}o|president|chair(?:man|woman|person)?|founder|co-founder|partner|vp|vice president|svp|evp|head|director|lead|manager|general counsel|principal)\b/i;
const anyTitle = (s: string) => s.length <= 90 && s.split(/\s+/).length <= 10 && !/[.!?]\s*\S/.test(s) && ANY_TITLE.test(s);

/** Name-and-title cards on a page (a name line beside a title line, or "Jane Doe, CEO"), counted only. */
export function personCards(html: string): number {
  const lines = linesOf(html, true);
  let n = 0;
  for (let k = 0; k < lines.length; k++) {
    const l = lines[k];
    if (anyTitle(l) && !looksLikeName(l) && ((k > 0 && looksLikeName(lines[k - 1])) || (k + 1 < lines.length && looksLikeName(lines[k + 1])))) n++;
    else {
      const split = /^(.{4,40}?)\s*(?:,|\s[–—|·-]\s|:)\s*(.{2,90})$/.exec(l);
      if (split && looksLikeName(split[1]) && anyTitle(split[2])) n++;
    }
  }
  // A photo grid whose text is drawn by script still has its alt text: the larger count stands (the same card is never two).
  const alts = altCards(html).filter(([name, title]) => looksLikeName(name) && anyTitle(title)).length;
  return Math.max(n, alts);
}

/**
 * Every leader on a page. `release`: the page is one press release, so its own date dates every
 * appointment on it; on any other page (a press index, a team page) a line's date is the one
 * nearest it. Team cards and JSON-LD give "team page"; appointment lines give "press release".
 */
export function extractLeaders(html: string, url: string, release = false, names?: Set<string>, stats?: { cards: number }): Candidate[] {
  const out: Candidate[] = [];
  // Person cards of any title (a CEO and a founder too): two or more make the page a team page, whatever its address says.
  if (stats) stats.cards += personCards(html);
  // JSON-LD Person: a name and a jobTitle.
  for (const d of jsonLd(html)) {
    walk(d, (o) => {
      if (!types(o).some((t) => /^Person$/i.test(t))) return;
      const name = typeof o.name === "string" ? o.name : [o.givenName, o.familyName].filter((x) => typeof x === "string").join(" ");
      const job = typeof o.jobTitle === "string" ? o.jobTitle : Array.isArray(o.jobTitle) && typeof o.jobTitle[0] === "string" ? o.jobTitle[0] : "";
      if (!name.trim() || !job) return;
      addNames(names, name);
      const since = typeof o.startDate === "string" ? dateIn(o.startDate) : null;
      for (const c of classifyTitle(job)) out.push({ ...c, ...(since ? { since: monthOf(since) } : {}), how: "team page", url });
    });
  }
  // Team cards: a title next to a name (the line before or after), or "Jane Doe, Chief Revenue Officer" on one line.
  const lines = linesOf(html, true);
  for (let n = 0; n < lines.length; n++) {
    const line = lines[n];
    let found = titleLine(line);
    let named = found.length > 0 && ((n > 0 && looksLikeName(lines[n - 1])) || (n + 1 < lines.length && looksLikeName(lines[n + 1])));
    if (!named) {
      const split = /^(.{4,40}?)\s*(?:,|\s[–—|·-]\s|:)\s*(.{2,90})$/.exec(line);
      if (split && looksLikeName(split[1])) {
        found = titleLine(split[2]);
        named = found.length > 0;
        if (named) addNames(names, split[1]);
      }
    }
    if (!named) continue;
    for (const k of [n - 1, n + 1]) if (k >= 0 && k < lines.length && looksLikeName(lines[k])) addNames(names, lines[k]);
    // "Joined in 2024" in the card's next few lines, before the next card starts.
    let since: string | null = null;
    for (let k = n + 1; k < Math.min(lines.length, n + 5); k++) {
      if (titleLine(lines[k]).length || (looksLikeName(lines[k]) && k > n + 1)) break;
      since = joinedIn(lines[k]);
      if (since) break;
    }
    for (const c of found) out.push({ ...c, ...(since ? { since } : {}), how: "team page", url });
  }
  // A photo grid's alt text: "Jane Doe, Chief Revenue Officer at Acme", "Jane Doe - CRO" (it often says it where the text is drawn by script).
  // And a JS-light page's data: {"name": "Jane Doe", "title": "Chief Revenue Officer"} in a script the page renders from.
  // Each counts only where the cards' text gave nothing for that function, so one leader is never read twice.
  const fromText = new Set(out.map((c) => c.fn));
  const extra = (title: string, name: string) => {
    if (!looksLikeName(name)) return;
    const found = titleLine(title);
    if (!found.length) return;
    addNames(names, name);
    for (const c of found) if (!fromText.has(c.fn) && !out.some((x) => x.fn === c.fn && x.how === "team page" && x.level === c.level)) out.push({ ...c, how: "team page", url });
  };
  for (const [name, title] of altCards(html)) extra(title, name);
  for (const [name, title] of scriptCards(html)) extra(title, name);
  // Press lines, in running text (inline tags joined back).
  const text = linesOf(html, false);
  if (release) {
    const date = pageDate(html, url);
    out.push(...pressIn(text.join("\n"), url, date, names));
  } else {
    text.forEach((line, n) => {
      // A headline's date on an index: on its own line, else a date alone on the line after it, else
      // one on the line before it that no other headline is nearer to.
      const dateOnly = (k: number) => (k >= 0 && k < text.length && text[k].length <= 40 ? dateIn(text[k]) : null);
      const headline = (k: number) => k >= 0 && k < text.length && PRESS.some((re) => (re.lastIndex = 0, re.test(text[k])));
      const date = dateIn(line) ?? dateOnly(n + 1) ?? (headline(n - 2) ? null : dateOnly(n - 1));
      out.push(...pressIn(line, url, date, names));
    });
  }
  return out;
}

/* ---------- links ---------- */

export type LinkKind = "team" | "about" | "press" | "release";
export interface PageLink {
  url: string;
  text: string;
  kind: LinkKind;
}

const NOT_A_PAGE = /\.(?:pdf|jpe?g|png|gif|webp|svg|zip|docx?|xlsx?|pptx?|mp4|mp3|mov|xml|json|rss|ics|css|js)$/i;
const CAREERS = /\b(?:careers?|jobs?|join[- ](?:us|our[- ]team|the[- ]team)|hiring|vacanc\w*|openings|apply|work[- ]with[- ]us)\b/i;
const TEAM = /\b(?:leadership|leaders|team|management|executives?|people|who[- ]we[- ]are|our[- ]people|meet[- ]the[- ]team|board|founders)\b/i;
const ABOUT = /\b(?:about(?:[- ]us)?|company|our[- ]story|story|mission|who[- ]we[- ]are)\b/i;
const PRESS_WORDS = /\b(?:press|news|newsroom|media|announcements?|press[- ]releases?|in[- ]the[- ]news)\b/i;
const APPOINT = /\b(?:appoint\w*|names?|named|promot\w*|hires?|hired|joins?|joined|welcomes?|welcomed|taps|tapped|adds|added|elevat\w*)\b/i;
const LEAD_WORDS = /\b(?:chief|c[rmgfotp]o|vp|vice[- ]president|svp|evp|head[- ]of|director|officer|president)\b/i;

/** What a link on a company's site may lead to, from its address and its words. Null when it is none of those (or a careers page). */
export function linkKind(url: URL, text: string): LinkKind | null {
  let path = url.pathname;
  try {
    path = decodeURIComponent(path);
  } catch {
    /* a bad escape: read it as it is */
  }
  path = path.replace(/[_/]+/g, " ");
  const words = `${path} ${text}`;
  if (NOT_A_PAGE.test(url.pathname) || CAREERS.test(words)) return null;
  if (APPOINT.test(words) && LEAD_WORDS.test(words)) return "release";
  if (TEAM.test(words)) return "team";
  if (PRESS_WORDS.test(words)) return "press";
  if (ABOUT.test(words)) return "about";
  return null;
}

/** The links on a page that stay on the site (`sameSite` decides) and may lead to its leaders, each once. */
export function linksOf(html: string, base: string, sameSite: (u: URL) => boolean): PageLink[] {
  const out: PageLink[] = [];
  const seen = new Set<string>();
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(html)) && out.length < 400; ) {
    const href = /\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+))/i.exec(m[1]);
    const raw = href?.[1] ?? href?.[2] ?? href?.[3];
    if (!raw || /^(?:mailto|tel|javascript|data):/i.test(raw.trim())) continue;
    let u: URL;
    try {
      u = new URL(cleanText(raw), base);
    } catch {
      continue;
    }
    if ((u.protocol !== "http:" && u.protocol !== "https:") || !sameSite(u)) continue;
    u.hash = "";
    u.search = "";
    const key = normUrl(u);
    if (seen.has(key)) continue;
    const text = cleanText(m[2]).slice(0, 160);
    const kind = linkKind(u, text);
    if (!kind) continue;
    seen.add(key);
    out.push({ url: u.href, text, kind });
  }
  return out;
}

/** An address compared without its scheme, "www.", query, fragment or trailing slash. */
export const normUrl = (u: URL) => `${u.hostname.replace(/^www\./i, "").toLowerCase()}${u.pathname.replace(/\/+$/, "") || "/"}`;

/** The <loc> addresses of a sitemap. */
export function sitemapLocs(xml: string): string[] {
  const out: string[] = [];
  const re = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;
  for (let m: RegExpExecArray | null; (m = re.exec(xml)) && out.length < 5000; ) out.push(cleanText(m[1]));
  return out;
}
