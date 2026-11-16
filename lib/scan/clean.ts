/**
 * Cleaning for the weekly scan: company names, role titles, the dedupe key, and the company's
 * own website. Pure string work with no Node imports, so it runs anywhere and tests fast.
 */
import { cut } from "../tableFields";

/** Text with tags stripped, entities decoded and whitespace collapsed. */
export function plain(raw: unknown): string {
  return String(raw ?? "")
    .replace(/<(style|script)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&apos;|&#x27;|&#39;/gi, "'")
    .replace(/&ndash;/gi, "–")
    .replace(/&mdash;/gi, "—")
    .replace(/&#(\d+);/g, (_, n) => codePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => codePoint(parseInt(h, 16)))
    .replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function codePoint(n: number): string {
  try {
    return n > 31 ? String.fromCodePoint(n) : " ";
  } catch {
    return " ";
  }
}

/** Lowercase letters and digits only. "Acme Robotics, Inc." and "ACME robotics" squeeze to the same thing. */
export const squeeze = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

/**
 * A name as it is compared, never as it is shown or stored: Latin accents dropped, lowercase,
 * letters and digits of any script kept. "Société Générale" and "Societe Generale" match, and a
 * name in Cyrillic or Japanese keeps a key of its own. Only the Latin accents go (U+0300 to
 * U+036F): in Hindi, Thai, Bengali or Tamil a vowel is written as a mark, and काम and कम are two
 * words. Empty for a name with no letter or digit.
 */
export const textKey = (s: string) =>
  String(s ?? "").normalize("NFKD").replace(/[̀-ͯ]+/g, "").toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, "").replace(/^\p{M}+/u, "");

/** The posting's stable key: company and title, squeezed and joined by "::". The same role on two boards shares it. */
export function roleKey(company: string, title: string): string {
  return `${squeeze(company)}::${squeeze(title)}`;
}

/* ---------- company names ---------- */

/** Legal suffixes in any case ("Inc.", "llc"), then short ones that only count in capitals ("AG", "SA"). */
const LEGAL_SUFFIX = /(?:,\s*|\s+)(?:inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|gmbh|plc|llp|l\.p|pty|pbc|b\.v|s\.a|s\.r\.l|s\.a\.s)\.?$/i;
const LEGAL_SUFFIX_CAPS = /(?:,\s*|\s+)(?:AG|AB|BV|SA|LP|NV|SE|SRL|SAS|OY)\.?$/;
const TRAILING_PUNCT = /[\s,.;:|\-–—·•/\\]+$/;
const LEADING_PUNCT = /^[\s,.;:|\-–—·•/\\@]+/;

/** "Acme Robotics, Inc. (YC W24)" -> "Acme Robotics". */
export function cleanCompany(raw: unknown): string {
  let s = plain(raw).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  s = s.replace(/^(?:at|@)\s+/i, "");
  for (let i = 0; i < 4; i++) {
    const before = s;
    s = s.replace(/\s*[([][^()[\]]*[)\]]\s*$/, ""); // a trailing note in brackets
    s = s.replace(TRAILING_PUNCT, "").replace(LEADING_PUNCT, "");
    s = s.replace(LEGAL_SUFFIX, "").replace(LEGAL_SUFFIX_CAPS, "");
    s = s.replace(TRAILING_PUNCT, "");
    if (s === before) break;
  }
  // A bare slug from an applicant tracking system ("acme-robotics") reads better capitalized.
  if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s)) s = s.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
  return cut(s, 80).trim();
}

/**
 * The key two spellings of one company share, used only to match them: legal suffixes and
 * bracketed notes go first (cleanCompany), then a leading "The", then textKey. "Acme Robotics,
 * Inc.", "ACME robotics (YC W24)" and "The Acme Robotics" are one company. Never match on an
 * empty key: that is a name with no letter or digit in it.
 */
export const companyKey = (name: unknown) => textKey(cleanCompany(name).replace(/^the\s+/i, ""));

/** Stand-ins a board uses when the company is not named. */
const NO_NAME = new Set(
  [
    "unknown", "confidential", "stealth", "na", "none", "tbd", "tba", "anonymous", "undisclosed", "private", "hidden", "hiddencompany",
    "seelisting", "company", "companyname", "client", "ourclient", "various", "multiple", "selfemployed", "freelance", "hiring",
    "notspecified", "notdisclosed", "notprovided", "employer", "startup", "theclient", "thecompany",
  ].map(squeeze)
);
const NO_NAME_WORD = /\b(?:stealth|confidential|undisclosed|anonymous|unnamed|unknown)\b/i;

/** Job boards and talent marketplaces. A posting under their name is for a client they do not name. */
const BOARDS = new Set(
  [
    "remotive", "remoteok", "remote ok", "we work remotely", "weworkremotely", "wwr", "fractional jobs", "fractionaljobs.io", "indeed",
    "linkedin", "glassdoor", "ziprecruiter", "monster", "wellfound", "angellist", "upwork", "fiverr", "toptal", "flexjobs",
    "working nomads", "himalayas", "jobgether", "dice", "built in", "otta", "hired", "jooble", "talent.com", "simplyhired",
    "careerbuilder", "craigslist", "remote.co", "dynamite jobs", "nodesk", "jobspresso", "justremote", "crossover", "braintrust",
    "catalant", "marketerhire", "growtal", "go fractional", "gofractional", "mayple", "robert half", "randstad", "adecco", "kforce",
    "insight global", "aquent", "creative circle", "korn ferry", "michael page", "hays", "manpower", "manpowergroup", "teksystems",
    "hacker news", "reddit", "y combinator",
  ].map(squeeze)
);
const BOARD_WORD = /\bjob ?boards?\b|\bjobs\b|\bcareers\b/i;
const RECRUITER_NAME =
  /\b(?:recruit(?:ing|ment|ers?)|staffing|headhunt\w*|executive search|search (?:partners|group|firm|associates)|talent (?:partners|solutions|acquisition|agency|network|marketplace)|placement(?:s| services)?)\b/i;
/** A posting made on behalf of one client the poster does not name. Plural "our clients" is ordinary agency talk and does not count. */
const UNNAMED_CLIENT =
  /\bon behalf of (?:our|a|my|the) client\b|\b(?:our|my) client(?:,|'s| is| has| seeks| needs| requires| wants| was)|\bfor (?:a|an|our|my) (?:confidential |stealth |\w+[- ]stage )?client\b|\bclient of ours\b/i;

/** "A Series B fintech startup" describes a company. It does not name one. */
const GENERIC_NOUN =
  /\b(?:startup|start-up|scaleup|scale-up|company|firm|agency|brand|platform|business|app|fund|studio|provider|marketplace|organi[sz]ation|nonprofit|non-profit|retailer|manufacturer|consultancy|practice|saas|client|venture|industry|shop|store)\b/i;
const STAGE_LED =
  /^(?:series [a-f]\b|seed\b|pre-seed|early[- ]stage|growth[- ]stage|late[- ]stage|vc[- ]backed|pe[- ]backed|venture[- ]backed|bootstrapped|fast[- ]growing|high[- ]growth|leading|well[- ]funded|funded|b2b|b2c|saas|ai|fintech|healthtech)\b/i;

/**
 * Whether a cleaned name is a real company the role can be filed under. Nameless stand-ins,
 * descriptions ("A B2B SaaS startup"), job boards, recruiters and thread handles are not.
 * `context` is the posting's text and source, used to spot a recruiter posting for an unnamed client.
 */
export function isRealCompany(name: string, context: { text?: string; source?: string; title?: string } = {}): boolean {
  const sq = squeeze(name);
  if (sq.length < 2 || name.length > 60) return false;
  if (!/\p{L}/u.test(name)) return false;
  if (NO_NAME.has(sq) || NO_NAME_WORD.test(name)) return false;
  if (/^u\/|\br\/\w+|@|https?:/i.test(name)) return false; // a thread handle, an email or a link
  if (BOARDS.has(sq) || BOARD_WORD.test(name)) return false;
  if (context.source && sq === squeeze(context.source)) return false;
  if (context.title && sq === squeeze(context.title)) return false;
  if (RECRUITER_NAME.test(name)) return false;
  if (/^an?\s+\S/i.test(name) && GENERIC_NOUN.test(name)) return false;
  if (STAGE_LED.test(name) && GENERIC_NOUN.test(name)) return false;
  if (context.text && UNNAMED_CLIENT.test(context.text)) return false;
  return true;
}

/* ---------- role titles ---------- */

const PLACE_STRONG = new Set(
  (
    "remote hybrid onsite anywhere worldwide global usa us uk canada australia germany france spain " +
    "netherlands ireland india singapore israel mexico brazil nyc york francisco sf angeles boston austin chicago seattle denver miami " +
    "atlanta dallas houston london berlin paris toronto vancouver sydney melbourne dublin amsterdam aviv dubai bangalore nashville " +
    "phoenix portland philadelphia raleigh durham charlotte minneapolis detroit diego wfh " +
    // US state codes
    "al ak az ar ca ct de fl ga id il ia ks ky md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh pa ri sc sd tn tx ut vt va wa wv wi wy dc"
  ).split(" ")
);
const PLACE_WEAK = new Set(
  (
    "on site in office person united states kingdom america north south new san los la bay area tel salt lake city washington " +
    "est edt cst cdt mst pst pdt et ct pt gmt cet utc eu asia co me hi ok or " +
    // Regions are often the scope of the job ("VP Sales, EMEA"), so alone they stay in the title.
    "europe emea apac latam americas " +
    "only based first friendly preferred eligible timezone timezones time zone zones hours within and the fully 100 work from home " +
    "east west coast central eastern pacific region metro greater"
  ).split(" ")
);
const TERMS_STRONG = new Set("parttime part contract contractor freelance hrs hours hr 1099 w2 c2c temp temporary interim".split(" "));
const TERMS_WEAK = new Set("time week wk weekly per month mo monthly days day a to hire flexible m f d x w up h".split(" "));
/** Words that mean the tail is part of the job, not where it is. "VP, Sales" keeps its tail. */
const JOB_WORD = /\b(?:sales|marketing|revenue|growth|success|operations|ops|partnerships?|gtm|demand|brand|product|enablement|strategy|b2b|b2c|saas)\b/i;

const tokens = (s: string) => s.toLowerCase().replace(/part[\s-]time/g, "parttime").replace(/on[\s-]site/g, "onsite").split(/[^a-z0-9]+/).filter(Boolean);

/** Every word is a place or a filler, and at least one is clearly a place. */
function isPlace(tail: string): boolean {
  if (!tail || tail.length > 60 || JOB_WORD.test(tail)) return false;
  const t = tokens(tail);
  return t.length > 0 && t.every((w) => PLACE_STRONG.has(w) || PLACE_WEAK.has(w)) && t.some((w) => PLACE_STRONG.has(w));
}

/** A note in brackets that only says where, or how many hours: "(Remote)", "(Part-time, US)", "(20 hrs/week)". */
function isLogistics(inner: string): boolean {
  if (/^[mfwdx](?:\s*\/\s*[mfwdx]){1,3}$/i.test(inner.trim())) return true; // "(m/f/d)"
  if (!inner || inner.length > 60 || JOB_WORD.test(inner)) return false;
  const t = tokens(inner);
  const known = (w: string) => PLACE_STRONG.has(w) || PLACE_WEAK.has(w) || TERMS_STRONG.has(w) || TERMS_WEAK.has(w) || /^\d+$/.test(w);
  return t.length > 0 && t.every(known) && t.some((w) => PLACE_STRONG.has(w) || TERMS_STRONG.has(w));
}

/** The last separator of each kind, and what follows it. Dashes need a space on one side so "Go-to-market" stays whole. */
const TAIL_SEPARATORS = [
  /^(.*\S)\s*(?:[–—|·•]|\s-\s?|\s?-\s)\s*([^–—|·•]*)$/,
  /^(.*\S)\s+\/\s+(.*)$/,
  /^(.*\S)\s*,\s*([^,]*)$/,
  /^(.*\S)\s*:\s+([^:]*)$/,
];

/** "Fractional VP of Sales (Remote) - New York, NY" -> "Fractional VP of Sales". */
export function cleanTitle(raw: unknown, company?: string): string {
  let s = plain(raw).replace(/^["'“”‘’]+|["'“”‘’]+$/g, "");
  const co = company ? squeeze(company) : "";

  for (let i = 0; i < 6; i++) {
    const before = s;
    s = s.replace(TRAILING_PUNCT, "").replace(LEADING_PUNCT, "");
    // A leading tag: "[Remote] Fractional CMO", "Hiring: Fractional CMO", "Remote - Fractional CMO".
    const lead = s.match(/^[([]([^()[\]]*)[)\]]\s*(.+)$/);
    if (lead && isLogistics(lead[1])) s = lead[2];
    s = s.replace(/^(?:now hiring|we(?:'| a)re hiring|hiring|job opening|opening|wanted)\s*[:\-–—]\s*/i, "");
    s = s.replace(/^(?:fully |100% )?remote\s*[:\-–—|]\s*/i, "").replace(/^remote\s+(?=(?:fractional|interim|part[\s-]?time)\b)/i, "");
    // A trailing note in brackets.
    const note = s.match(/^(.*\S)\s*[([]([^()[\]]*)[)\]]$/);
    if (note && (isLogistics(note[2]) || (co && squeeze(note[2]) === co))) s = note[1];
    // "… at Acme" and "… @ Acme".
    const at = s.match(/^(.*\S)\s+(?:at|@)\s+(.+)$/i);
    if (at && co && squeeze(at[2]) === co) s = at[1];
    // "Acme: Fractional CMO" and "Acme is hiring a Fractional CMO".
    if (co) {
      for (const m of s.matchAll(/\s*(?:[:–—|]|\s-\s|\s+is (?:hiring|looking for|seeking)(?: an?)?\s)\s*/gi)) {
        if (squeeze(s.slice(0, m.index)) !== co) continue;
        const rest = s.slice(m.index + m[0].length).trim();
        if (rest) s = rest;
        break;
      }
    }
    // A trailing place or company after a dash, a pipe or a comma.
    for (const sep of TAIL_SEPARATORS) {
      const m = s.match(sep);
      if (m && (isPlace(m[2]) || isLogistics(m[2]) || (co && squeeze(m[2]) === co))) {
        s = m[1];
        break;
      }
    }
    if (s === before) break;
  }
  return cut(s.replace(/\s+/g, " "), 120).trim();
}

/* ---------- the company's own website ---------- */

/** Job boards, applicant tracking systems, form tools, social sites and mail hosts. Never a company's own site. */
const NOT_COMPANY_HOSTS = [
  "remotive.com", "remotive.io", "remoteok.com", "remoteok.io", "weworkremotely.com", "fractionaljobs.io", "greenhouse.io", "lever.co",
  "ashbyhq.com", "workable.com", "bamboohr.com", "smartrecruiters.com", "jobvite.com", "icims.com", "myworkdayjobs.com", "workday.com",
  "recruitee.com", "teamtailor.com", "breezy.hr", "applytojob.com", "jazzhr.com", "rippling.com", "gusto.com", "wellfound.com", "angel.co",
  "linkedin.com", "indeed.com", "glassdoor.com", "ziprecruiter.com", "notion.site", "notion.so", "google.com", "forms.gle", "goo.gl",
  "typeform.com", "airtable.com", "tally.so", "jotform.com", "calendly.com", "bit.ly", "t.co", "lnkd.in", "twitter.com", "x.com",
  "facebook.com", "instagram.com", "youtube.com", "youtu.be", "tiktok.com", "medium.com", "substack.com", "github.com", "ycombinator.com",
  "crunchbase.com", "wikipedia.org", "gmail.com", "outlook.com", "yahoo.com", "hotmail.com", "icloud.com", "proton.me", "protonmail.com",
  "reddit.com", "upwork.com", "toptal.com", "fiverr.com", "w3.org", "schema.org", "example.com",
];
const SECOND_LEVEL = new Set(["co", "com", "org", "net", "ac", "gov", "edu"]);

/** "https://www.acme.com/careers" -> "www.acme.com". Null for anything that is not a web host. */
function hostOf(url: string): string | null {
  const m = String(url).trim().toLowerCase().match(/^(?:[a-z][a-z0-9+.-]*:\/\/)?(?:[^@/\s]+@)?([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d+)?(?:[/?#]|$)/);
  return m && /\.[a-z]{2,}$/.test(m[1]) ? m[1] : null;
}

/** "careers.acme.co.uk" -> "acme.co.uk". */
function registrable(host: string): string {
  const p = host.split(".");
  const n = p.length >= 3 && p[p.length - 1].length === 2 && SECOND_LEVEL.has(p[p.length - 2]) ? 3 : 2;
  return p.slice(-n).join(".");
}

const blockedHost = (host: string) => NOT_COMPANY_HOSTS.some((b) => host === b || host.endsWith("." + b));

/** One trailing word a company often leaves out of its web address ("Acme Labs" at acme.com). */
const NAME_TAIL = /\s+(?:labs?|technolog(?:y|ies)|software|hq|app|ai|io|co|company|studios?)$/i;
const HOST_PREFIX = ["get", "try", "use", "join", "go", "hey", "with", "meet", "team", "my", "the", "hello", "we"];
const HOST_SUFFIX = ["hq", "app", "ai", "io", "inc", "co", "team", "labs", "tech", "group", "global", "online", "now", "corp", "usa", "software"];

/** The domain's name is the company's name, give or take "get", "hq" and the like. */
function hostMatchesName(domain: string, company: string): boolean {
  const label = squeeze(domain.split(".")[0]);
  const full = squeeze(company);
  const core = squeeze(company.replace(/^the\s+/i, "").replace(NAME_TAIL, ""));
  for (const name of new Set([full, core])) {
    if (name.length < 3 || (name !== full && name.length < 4)) continue;
    if (label === name) return true;
    if (HOST_PREFIX.some((p) => label === p + name) || HOST_SUFFIX.some((x) => label === name + x)) return true;
  }
  return false;
}

/**
 * The company's own website domain, only when the posting clearly gives it.
 * `companyUrl` is a link the board itself labels as the company's site, so it is trusted unless
 * it points at a job board or applicant tracking system. Links found in the posting text or the
 * posting's own address count only when the domain is the company's name.
 */
export function companyDomain(company: string, opts: { companyUrl?: string | null; url?: string | null; text?: string | null }): string | null {
  if (opts.companyUrl) {
    const host = hostOf(opts.companyUrl);
    if (host && !blockedHost(host)) return host.replace(/^www\./, "");
  }
  const found: string[] = [];
  if (opts.url) found.push(opts.url);
  const text = String(opts.text ?? "");
  for (const m of text.matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) found.push(m[0]);
  for (const m of text.matchAll(/\b[a-z0-9._%+-]+@([a-z0-9-]+(?:\.[a-z0-9-]+)+)\b/gi)) found.push(m[1]);
  for (const m of text.matchAll(/(?<![\w@.-])(?:www\.)?[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|io|co|ai|net|org|app|dev|health|tech|so|xyz|us|uk|ca|de|fr|eu)\b/gi)) found.push(m[0]);
  for (const f of found) {
    const host = hostOf(f);
    if (!host || blockedHost(host)) continue;
    const domain = registrable(host);
    if (hostMatchesName(domain, company)) return domain;
  }
  return null;
}
