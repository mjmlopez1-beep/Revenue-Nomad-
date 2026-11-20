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
    "unknown", "confidential", "stealth", "na", "none", "tbd", "tba", "anonymous", "undisclosed", "private", "hidden", "hiddencompany", "lockedcompany",
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
    "hacker news", "reddit", "y combinator", "freehire", "freehire.me", "find fractional jobs", "findfractionaljobs",
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

/** Words that alone (all of a name's words) name no company: "Private Company", "Stealth Mode", "N/A", "Self-employed", "Your client". */
const PLACEHOLDER_WORDS = new Set(
  (
    "stealth mode confidential undisclosed private hidden anonymous unnamed unknown locked company companies startup startups client clients hiring employer " +
    "the a an our my your co inc llc ltd firm business organization organisation n na various multiple self employed freelance freelancer independent " +
    "contractor consultant tbd tba none not disclosed specified provided name here x withheld"
  ).split(" ")
);
/**
 * Names people type to try a form, or copy from an example: "Acme", "Test", "Example Inc",
 * "Demo Co", "Lorem Ipsum", "Test Company 2". Squeezed, so case, spaces and punctuation don't
 * matter. A longer real name that starts the same way ("Acme Robotics", "Demo Converts") is not one.
 */
const TEST_NAME =
  /^(?:acme|test|testing|example|sample|demo|dummy|fake|placeholder|foo|foobar|asdf\w*|qwerty|lorem|loremipsum|xyz|xxx+)(?:co|com|company|corp|corporation|inc|incorporated|llc|ltd|limited|client|business|group)?\d{0,3}$/;
/** "A fintech company", "A Series B SaaS startup": a description that ends in what it is. */
const GENERIC_END =
  /\b(?:startup|start-up|scaleup|scale-up|company|firm|agency|brand|platform|business|client|organi[sz]ation|nonprofit|non-profit|provider|manufacturer|retailer|consultancy|venture|employer)\.?$/i;
/**
 * A sector label: 1 to 3 words ending in the singular "Industry" or "Sector" ("Public Sector",
 * "Beauty Industry", "Non-Profit Sector", "The Tech Industry"). A name in "Industries", or one that
 * goes on past the word, is a company: "Cambridge Heavy Industries", "REACH INDUSTRIES", "Third
 * Sector Intelligence", "The Swedish Association of the Pharmaceutical Industry, LIF".
 */
const SECTOR_LABEL = /^(?:\S+\s+){0,2}(?:industry|sector)$/i;

/**
 * A stand-in for a company that isn't named: "Private Company", "Confidential", "Stealth Startup",
 * "Undisclosed", "Company", "N/A", "Self-employed", "Various", "Multiple", "Freelance",
 * "Independent", "Hiring Company", "A B2B SaaS company", a sector label ("Public Sector", "Beauty
 * Industry"), and the names people try a form with ("Acme", "Test", "Example", "Your client").
 * Such a record is not a real company: the table, search, the connector and the preview leave it
 * out (see placeholderName in lib/table.ts), and a member can't add one.
 */
export function isPlaceholderCompany(name: unknown): boolean {
  const n = plain(name);
  const sq = squeeze(n);
  if (sq.length < 2) return true;
  if (NO_NAME.has(sq) || TEST_NAME.test(sq)) return true;
  const words = n.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (words.length && words.length <= 6 && words.every((w) => PLACEHOLDER_WORDS.has(w))) return true;
  if (/^an?\s+\S/i.test(n) && GENERIC_END.test(n)) return true;
  if (SECTOR_LABEL.test(n.replace(/[\s.,;:!?]+$/, ""))) return true;
  return false;
}

/**
 * Whether a cleaned name is a real company the role can be filed under. Nameless stand-ins,
 * descriptions ("A B2B SaaS startup"), job boards, recruiters and thread handles are not.
 * `context` is the posting's text and source, used to spot a recruiter posting for an unnamed client.
 */
export function isRealCompany(name: string, context: { text?: string; source?: string; title?: string } = {}): boolean {
  const sq = squeeze(name);
  if (sq.length < 2 || name.length > 60) return false;
  if (!/\p{L}/u.test(name)) return false;
  if (NO_NAME.has(sq) || NO_NAME_WORD.test(name) || isPlaceholderCompany(name)) return false;
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

const escRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * An open role's title as a member may see it while its company is locked: cleanTitle first,
 * then any name of the company or its domain still in it is cut out ("Fractional CMO, Acme
 * Health" -> "Fractional CMO"). When nothing is left, `fallback` ("Fractional Marketing role").
 */
export function titleWithout(raw: string, company: string, domain: string | null, fallback = "Fractional role"): string {
  let s = cleanTitle(raw, company);
  const names = new Set<string>();
  const full = plain(company).trim();
  if (full.length >= 3) names.add(full);
  const core = full.replace(/^the\s+/i, "").replace(NAME_TAIL, "").trim();
  if (core.length >= 4) names.add(core);
  if (domain) {
    const host = domain.toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").split("/")[0];
    if (host.includes(".")) names.add(host);
    const label = host.split(".")[0];
    if (label.length >= 4) names.add(label);
  }
  // Longest first, so "Acme Health" goes before "Acme".
  for (const n of [...names].sort((a, b) => b.length - a.length)) {
    s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(n)}(?=$|[^\\p{L}\\p{N}])`, "giu"), "$1");
  }
  // What a cut name leaves behind: "Fractional CMO,  " or "( ) Fractional CMO" or "CMO at".
  s = s
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/\s+(?:at|@|for|with)\s*$/i, "")
    .replace(/\s+([,:;|])/g, "$1")
    .replace(/([,:;|\-–—·])(\s*[,:;|\-–—·])+/g, "$1")
    .replace(/\s+/g, " ");
  for (let i = 0; i < 3; i++) s = s.replace(TRAILING_PUNCT, "").replace(LEADING_PUNCT, "").replace(/\s+(?:at|@|for|with)$/i, "").replace(/^(?:at|@)\s+/i, "");
  s = s.trim();
  return /\p{L}/u.test(s) && squeeze(s).length >= 2 ? s : fallback;
}

/** A legal suffix as it follows a name in running text ("Acme, Inc. builds"), cut with the name in aboutWithout. */
const LEGAL_AFTER = String.raw`(?:,?\s+(?:inc|incorporated|llc|l\.l\.c|ltd|limited|corp|corporation|co|gmbh|plc|llp|pbc|p\.c|sdn\s+bhd)\b(?!-)\.?)?`;
/** A legal suffix's period that also ended the sentence stays: "made by Acme Inc. Its" reads "made by the company. Its". */
const keepStop = (m: string, at: number, all: string) => (m.endsWith(".") && /^(?:\s*$|[ \t]*\n|\s+[\p{Lu}"“])/u.test(all.slice(at + m.length)) ? "." : "");
/** Words that say what a company does right after its name ("Acme helps"): where a short form of the name stands for the company. */
const NAME_VERB = String.raw`(?:is|was|has|helps|makes|provides|offers|builds|delivers|creates|develops|designs|runs|serves|sells|rents|operates|manufactures|produces|supports|partners|works|enables|empowers|connects|gives|lets|uses|combines|specializes|specialises|focuses|brings|invests|owns|manages|publishes|transforms|began|started|became|launched)\b`;
/** Words that start many names and many sentences: never cut on their own as the company. */
const COMMON_FIRST = new Set(
  "global national american united first new digital smart data blue green red black white north south east west northern southern eastern western capital advanced general applied international modern open bright true pure prime total super great good big little royal pacific atlantic central metro city next future human health care home office business market media social local world premier pro elite summit peak core key one best direct simple clear rapid swift better".split(" "),
);
/** Words that end a run of capitalized words after the name ("Acme Health Helps"): never part of the name. */
const RUN_STOP = /^(?:is|are|was|were|has|have|had|and|or|but|of|for|in|on|at|to|with|by|from|the|a|an|its|our|we|it|as|that|which|who|this|welcome|you|your|inc|incorporated|llc|ltd|limited|corp|corporation|co|gmbh|plc|llp|pbc|sdn|helps|makes|provides|offers|builds|delivers|creates|develops|enables|empowers|connects)$/i;
/** Where a cut name goes while aboutWithout works: never in an About, and no name pattern matches it. */
const CO_MARK = "\u0000co\u0000";
/** Where a sentence ends in an About, but not after "Dr." or "Mr." before a name. */
const SENTENCE_GAP = /(?<=(?<!\b(?:Dr|Mr|Mrs|Ms|Prof|St))[.!?…]["')\]]*)[ \t]+/;
/** Where a removed link or email was, until aboutWithout tidies the sentence it was in. */
const LINK_MARK = "\u0001";
/** The characters a web path in running text may hold, and the last one (never the sentence's own period or comma). */
const PATH_MID = String.raw`[^\s<>"'()\[\]{}]`;
const PATH_END = String.raw`[^\s<>"'()\[\]{}.,;:!?]`;
/** Words with a letter or a digit in a sentence, a cut name counting as one. */
const wordCount = (x: string) =>
  x
    .replace(new RegExp(LINK_MARK, "g"), " ")
    .replace(new RegExp(CO_MARK, "g"), " co ")
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;

/**
 * A locked company's About as a member may read it before they unlock the company: the text
 * with the obvious giveaways taken out. Every way of writing its name (whole words, any case,
 * with or without "The" and a legal suffix, the name without a trailing "Labs" or "Software",
 * the web address's own name, and the first word of a longer name, as written, when the web
 * address is made of it) reads "the company" ("The company" where a sentence starts). Its web
 * address reads "the company" too, and any link or email at it is removed (a short sentence that
 * was only there for it goes with it). `sites`: the company's website and its logo's domain.
 * The name's first part before a separator ("Terra Reporting | ESG Platform") counts as a way of
 * writing it, and so does the run of the name's words the About opens with ("Cygnet is a gin brand"
 * for "Cygnet Gin"), as written. So do its short forms where they stand as the company: the first
 * word in capitals or before "is", "helps" and the like ("Founded in 1914, Acme is"), and its
 * initials ("CET") once given after the name or in that place. A longer name than the one on file
 * goes whole ("Acme Technologies provides" reads "The company provides"), and the words around it
 * read naturally: "At the company, we", "the company's", "Every bottle" for "Every Cygnet bottle".
 * `people`: names of the company's people and seat holders, which are paid facts: a sentence with
 * one in it goes. The rest is the company's own words, unchanged.
 */
export function aboutWithout(text: string, company: string, sites: (string | null | undefined)[], people: (string | null | undefined)[] = []): string {
  let s = String(text ?? "");
  if (!s.trim()) return s;
  const domains = new Set<string>();
  const labels = new Set<string>();
  for (const raw of sites) {
    const host = raw ? hostOf(raw) : null;
    // A website on a shared host (a LinkedIn page, a job board) is not the company's own address.
    if (!host || blockedHost(host)) continue;
    const d = registrable(host.replace(/^www\./, ""));
    domains.add(d);
    const label = d.split(".")[0];
    if (label.length >= 4) labels.add(label);
  }
  // Links and emails at the company's domain go (LINK_MARK), then the bare domain reads as the company.
  for (const d of [...domains].sort((a, b) => b.length - a.length)) {
    const at = String.raw`(?:[a-z0-9-]+\.)*${escRe(d)}(?![\w-]|\.[a-z0-9])`;
    s = s
      // "Acme (acme.com) builds": the address in brackets says nothing more than the name before it.
      .replace(new RegExp(String.raw`\(\s*(?:https?:\/\/)?(?:www\.)?${at}\/?\s*\)`, "gi"), " ")
      .replace(new RegExp(String.raw`(?<![\w.+-])[\w.+-]+@${at}`, "gi"), LINK_MARK)
      .replace(new RegExp(String.raw`\b(?:https?:\/\/|www\.)${at}(?::\d+)?(?:[/?#](?:${PATH_MID}*${PATH_END})?)?`, "gi"), LINK_MARK)
      .replace(new RegExp(String.raw`(?<![\w@./-])${at}(?::\d+)?[/?#](?:${PATH_MID}*${PATH_END})?`, "gi"), LINK_MARK)
      .replace(new RegExp(String.raw`(?<![\w@./-])${at}`, "gi"), CO_MARK);
  }
  // The ways of writing the name, in any case, longest first ("Acme Health" before "Acme").
  const names = new Set<string>();
  const full = plain(company).trim();
  const bare = cleanCompany(full);
  const core = bare.replace(/^the\s+/i, "").trim();
  // "Terra Reporting │ ESG Platform", "Align - Football's AI", "Folia Health: The Home-Reported Outcomes Company".
  const head = cleanCompany(full.split(/\s+[|│–—-]\s+|\s*[|│:]\s*|\s+\(/)[0]).replace(/^the\s+/i, "").trim();
  for (const n of [full, bare, core, core.replace(NAME_TAIL, "").trim(), head, head.replace(NAME_TAIL, "").trim()]) if (n.length >= 3) names.add(n);
  // A one-word short form ("Global" for "Global Labs") is cut where it is written as a name, never as a plain word ("a global leader").
  const capOnly = new Set([...names].filter((n) => !/\s/.test(n) && ![full, bare, core].includes(n)));
  for (const l of labels) {
    names.add(l);
    capOnly.delete(l);
    if (l.includes("-")) names.add(l.replace(/-/g, " "));
  }
  // The words of a name may run together or keep their hyphens in the text ("Acme Health" as "AcmeHealth", "Bo & Me" as
  // "Bo&Me"), and "&" may be written "and".
  const cutName = (n: string, flags: string, cap = false) => {
    const words = n
      .split(/\s+/)
      .filter(Boolean)
      .map((w) => (/^(?:&|and|\+)$/i.test(w) ? String.raw`(?:&|and|\+)` : escRe(w)))
      .join(String.raw`[\s-]*`);
    s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}\\u0000])(?:[Tt]he\\s+)?(${words})${LEGAL_AFTER}(?=$|[^\\p{L}\\p{N}])`, flags), (m, pre: string, w: string, at: number, all: string) =>
      cap && !/\p{Lu}/u.test(w) ? m : `${pre}${CO_MARK}${keepStop(m, at, all)}`,
    );
  };
  for (const n of [...names].sort((a, b) => b.length - a.length)) cutName(n, "giu", capOnly.has(n));
  // "Acmeworks" alone for "Acmeworks Robotics" at acmeworks-robotics.com, as written (so "global" stays for "Global Payments").
  const first = core.split(/\s+/)[0] ?? "";
  const firstToo =
    core.includes(" ") &&
    first.length >= 4 &&
    [...labels].some((l) => squeeze(l) === squeeze(first) || squeeze(l.split("-")[0]) === squeeze(first) || (first.length >= 6 && squeeze(l).startsWith(squeeze(first))));
  if (firstToo) cutName(first, "gu");
  // The words of the name the About opens with ("Cygnet is", "Elk Ridge Investments buys"), as written there.
  const nameWords = new Set(full.split(/[^\p{L}\p{N}&'’]+/u).map((w) => squeeze(w.replace(/['’]s$/i, ""))).filter((w) => w.length >= 2));
  const lead = s.match(/^\s*(?:the\s+)?((?:[\p{L}\p{N}][\p{L}\p{N}&'’.-]*)(?:\s+[\p{L}\p{N}][\p{L}\p{N}&'’.-]*){0,5})/iu)?.[1] ?? "";
  const run: string[] = [];
  for (const w of lead.split(/\s+/)) {
    // An initial counts as it is written in the name ("Barry E. Janay"), never a lone letter ("B Corp").
    if (!w || !(nameWords.has(squeeze(w.replace(/['’]s$/i, ""))) || (/^\p{Lu}\.$/u.test(w) && full.includes(` ${w} `)))) break;
    run.push(w.replace(/['’]s$/i, "").replace(/(?<!^\p{L})[.]+$/u, ""));
  }
  const opening = run.join(" ");
  if (opening.length >= 4 && /\p{Lu}|\p{N}/u.test(opening) && !opening.includes("\u0000") && !(run.length === 1 && COMMON_FIRST.has(opening.toLowerCase()))) cutName(opening, "gu");
  // Short forms, as written: the name's first word in capitals ("ACME" for "Acme Robotics"), and where it stands as
  // the company, with the capitalized words after it ("Founded in 1914, Acme is", "Acme Environmental rents"), unless
  // it is a common word or the About also uses it as a plain word.
  const firstWord = first.replace(/['’]s$/i, "");
  const plainToo = new RegExp(`(^|[^\\p{L}\\p{N}])${escRe(firstWord.toLowerCase())}(?=$|[^\\p{L}\\p{N}])`, "u").test(s);
  if (core.includes(" ") && /^\p{Lu}[\p{L}\p{N}]{2,}$/u.test(firstWord) && !COMMON_FIRST.has(firstWord.toLowerCase()) && !plainToo) {
    if (firstWord !== firstWord.toUpperCase()) cutName(firstWord.toUpperCase(), "gu");
    if (firstWord.length >= 4)
      s = s.replace(new RegExp(`(^|[^\\p{L}\\p{N}\\u0000-])${escRe(firstWord)}(?:[ \\t]+\\p{Lu}[\\p{L}\\p{N}&'’-]*){0,2}(?=[ \\t]+${NAME_VERB})`, "gu"), `$1${CO_MARK}`);
  }
  // The rest of a longer name the About uses goes with the name: "Acme" written "Acme Technologies", "Acme Bikes Co.",
  // "Acme company", "Carroll Acme International, Inc.". It ends at a common word ("Acme Health helps") or punctuation.
  s = s
    .replace(new RegExp(`${CO_MARK}((?:[ \\t]+[^\\s\\u0000]+){1,4})`, "gu"), (_m, tail: string) => {
      const parts = tail.match(/[ \t]+[^\s\u0000]+/g) ?? [];
      const ok = (x: string | undefined) => !!x && /^\p{Lu}[\p{L}\p{N}'’-]*$/u.test(x) && !RUN_STOP.test(x) && !/['’]s$/i.test(x);
      const split = (p: string) => p.trim().match(/^(.*?)((?:['’]s)?[,;:.!?)"”]*)$/u)!.slice(1) as [string, string];
      let n = 0;
      let after = "";
      while (n < parts.length && !after) {
        const [w, punct] = split(parts[n]);
        const next = parts[n + 1] && split(parts[n + 1])[0];
        // An initial inside the name: "Barry E. Janay".
        if (/^\p{Lu}$/u.test(w) && punct === "." && ok(next)) {
          n++;
          continue;
        }
        if (ok(w) || (n === 0 && /^company$/i.test(w))) n++;
        else if (/^[&+]$/.test(w) && !punct && ok(next)) n += 2;
        else break;
        after = split(parts[n - 1])[1];
      }
      return CO_MARK + after + parts.slice(n).join("");
    })
    .replace(new RegExp(`${CO_MARK}${LEGAL_AFTER}`, "giu"), (m, at: number, all: string) => CO_MARK + keepStop(m, at, all))
    .replace(new RegExp(`(?<=\\p{Ll}[ \\t]+)\\p{Lu}[\\p{Ll}'’-]+[ \\t]+${CO_MARK}`, "gu"), (m) => (RUN_STOP.test(m.split(/[ \t]/)[0]) ? m : CO_MARK));
  // Its initials in capitals ("Cobalt Energy Technologies" as "CET"): everywhere once the About gives them after the
  // name ("Acme (CET)"), otherwise only where they stand as the company ("CET is"), so "CRM software" stays.
  const sig = core.split(/\s+/).filter((w) => /^\p{L}/u.test(w) && !/^(?:and|of|the|for|a|an|in|on|at|to)$/i.test(w));
  const initials = sig.length >= 3 ? sig.map((w) => w[0]).join("").toUpperCase() : "";
  if (/^\p{Lu}{3,}$/u.test(initials)) {
    const given = new RegExp(`${CO_MARK}\\s*\\(\\s*${initials}\\s*\\)`, "gu");
    const everywhere = new RegExp(given.source, "u").test(s);
    s = s
      .replace(given, CO_MARK)
      .replace(new RegExp(`(^|[^\\p{L}\\p{N}\\u0000-])${initials}(?=$|[^\\p{L}\\p{N}-])${everywhere ? "" : `(?:[ \\t]+\\p{Lu}[\\p{L}\\p{N}&'’-]*){0,2}(?=[ \\t]+${NAME_VERB}|['’]s\\b)`}`, "gu"), `$1${CO_MARK}`);
  }
  s = s
    // "Acme (acme.com)" and "Acme, Acme Inc." read once.
    .replace(new RegExp(`${CO_MARK}\\s*\\(\\s*${CO_MARK}\\s*\\)`, "g"), CO_MARK)
    .replace(new RegExp(`${CO_MARK}(?:\\s*[,/]\\s*${CO_MARK})+`, "g"), CO_MARK);
  // A sentence naming one of the company's people (who they are is a paid fact) goes.
  const who = [...new Set(people.map((x) => plain(x ?? "").trim()).filter((x) => x.length >= 5 && /\s/.test(x)))];
  if (who.length) {
    const named = new RegExp(`(^|[^\\p{L}\\p{N}])(?:${who.map((x) => x.split(/\s+/).map(escRe).join(String.raw`\s+`)).join("|")})(?=$|[^\\p{L}\\p{N}])`, "iu");
    s = s
      .split("\n")
      .map((line) => line.split(SENTENCE_GAP).filter((x) => !named.test(x)).join(" "))
      .join("\n");
  }
  // A short sentence with a link or an email in it ("Visit acme.com/about.", "Email hello@acme.com.") was there
  // for the link: it goes. A longer one keeps its words.
  if (s.includes(LINK_MARK))
    s = s
      .split("\n")
      .map((line) =>
        line
          .split(SENTENCE_GAP)
          .filter((x) => !x.includes(LINK_MARK) || wordCount(x) > 8)
          .join(" "),
      )
      .join("\n")
      .replace(new RegExp(LINK_MARK, "g"), " ");
  s = s
    // What a removed link leaves: "( )", "more at .", "robots ..".
    .replace(/\(\s*\)|\[\s*\]/g, " ")
    .replace(/[ \t]+(?:at|via|on|visit|see)[ \t]*(?=[.,;:!?)]|$)/gim, "")
    .replace(/[ \t]+([.,;:!?)])/g, "$1")
    // (Not "the U.S., and", "e.g., a", or an ellipsis.)
    .replace(/(?<!\.)([.!?])(?:[ \t]+[.,;:]+|\.(?!\.))/g, "$1")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/^[ \t]+|[ \t]+$/gm, "");
  // "the company" in running text, "The company" where a sentence starts (not after "U.S."). The name used as a
  // word before a noun goes after "every" or "a": "Every Cygnet bottle" reads "Every bottle".
  s = s
    .replace(new RegExp(`\\bthe[ \\t]+${CO_MARK}`, "giu"), CO_MARK)
    .replace(new RegExp(`\\b([Ee]very|[Ee]ach|[Aa]n?|[Oo]ur|[Ii]ts|[Tt]heir|[Aa]ll|[Aa]ny|[Nn]o)[ \\t]+${CO_MARK}(?=[ \\t]+(?!(?:and|or|but|of|in|to|for|with|at|by|on|is|was|has)\\b)\\p{Ll})`, "gu"), "$1")
    .replace(new RegExp(`(^|(?<!(?:^|[^\\p{L}])\\p{L})[.!?…]["')\\]]*\\s+|\\n\\s*|^["'(\\[]+)${CO_MARK}`, "gu"), "$1The company")
    .replace(new RegExp(CO_MARK, "g"), "the company");
  return s.replace(/\n{3,}/g, "\n\n").trim();
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
  "reddit.com", "freehire.me", "findfractionaljobs.com", "upwork.com", "toptal.com", "fiverr.com", "w3.org", "schema.org", "example.com",
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

/* ---------- the same role, listed twice ---------- */

/** Words that say how the work is arranged, not what the job is. They never make two titles different. */
const ARRANGEMENT_WORDS = new Set("fractional interim parttime contract contractor freelance freelancer remote".split(" "));

/**
 * A title as two listings of one role are compared: anything in brackets goes, then everything
 * after the first " - ", " – ", " — ", ",", "|" or ":", then the words that only say how the work
 * is arranged (fractional, interim, part-time, contract, freelance, remote), then case and
 * punctuation. "Founding Commercial Lead (Fractional to Full Time), WMS / Supply Chain Software"
 * and "Fractional Founding Commercial Lead" both read "founding commercial lead".
 */
export function normTitle(raw: unknown): string {
  let s = plain(raw);
  for (let i = 0; i < 3; i++) s = s.replace(/\s*[([{][^()[\]{}]*[)\]}]/g, " ");
  s = s.split(/\s+[-–—]\s+|\s[–—]|[–—]\s|[,|:]/)[0] ?? "";
  return s
    .toLowerCase()
    .replace(/part[\s-]*time/g, "parttime")
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w && !ARRANGEMENT_WORDS.has(w))
    .join(" ");
}

/**
 * Two titles name the same role: their normalized forms (normTitle) are equal, or one is the
 * start of the other, word for word, and at least 2 words long ("founding commercial lead" and
 * "founding commercial lead wms"). Never for an empty title.
 */
export function sameRoleTitle(a: unknown, b: unknown): boolean {
  const x = normTitle(a);
  const y = normTitle(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.split(" ").length >= 2 && long.startsWith(short + " ");
}

/** Applicant tracking systems: a posting there is the company's own, published through its ATS. */
const ATS_HOSTS = [
  "greenhouse.io", "lever.co", "ashbyhq.com", "workable.com", "smartrecruiters.com", "homerun.co", "recruitee.com", "teamtailor.com",
  "bamboohr.com", "breezy.hr", "jobvite.com", "icims.com", "myworkdayjobs.com", "applytojob.com", "jazzhr.com", "rippling.com",
  "pinpointhq.com", "personio.de", "personio.com", "workatastartup.com", "join.com", "dover.com",
];

/**
 * How much a posting link is the company's own: 0 on its own website, 1 on its applicant tracking
 * system, 2 anywhere else (a job board that copied it), 3 for no link. The Job posting link prefers the lowest.
 */
export function postingRank(url: unknown, domain?: string | null): number {
  const host = hostOf(String(url ?? ""));
  if (!host) return 3;
  const own = domain ? hostOf(String(domain)) : null;
  if (own && registrable(host) === registrable(own)) return 0;
  if (ATS_HOSTS.some((b) => host === b || host.endsWith("." + b))) return 1;
  return 2;
}

/** The link to show of several for one role: the company's own first (postingRank), then the first given. */
export function bestPosting(urls: (string | null | undefined)[], domain?: string | null): string | null {
  let best: string | null = null;
  let rank = 99;
  for (const u of urls) {
    if (!u) continue;
    const r = postingRank(u, domain);
    if (r < rank) [best, rank] = [u, r];
  }
  return best;
}
