/**
 * Seat-holder names from public profiles (scripts/add-seat-names.mjs): how a display name becomes
 * the name a seat stores, and when two names are the same person (the claim rule in lib/table.ts).
 * Pure, no Node imports.
 *
 * Cleaning keeps the person's name and drops what people put around it:
 *  - pronouns and other bracketed notes: "(she/her)", "[He/Him]", "(Bob)";
 *  - nicknames in quotes: "Robert “Bob” Smith";
 *  - everything after a comma ("Jane Doe, MBA, CPA") or a separator (" - Fractional CMO", " | ");
 *  - credentials and suffixes after the name without a comma ("Jane Doe MBA", "Jane Doe Jr.");
 *  - a title or a tagline word after the name ("Jane Doe Fractional CMO");
 *  - honorifics before it ("Dr. Jane Doe");
 *  - emoji, symbols, decoration (fancy letters become plain ones) and extra spaces.
 * An all-caps or all-lowercase name is written the usual way ("JANE DOE" is Jane Doe).
 *
 * What is left must read as a person's name: two or more words of letters, the first and the last
 * written out. A last name given only as an initial ("Jane D.") is the person's own choice on their
 * profile, so it is skipped, and so is a first name given only as an initial with nothing else
 * ("J. Smith"). The result always passes PERSON_NAME_RE (lib/tableFields.ts), the seat holder rule.
 */
import { PERSON_NAME_RE } from "./tableFields";

/** Credentials and degrees people write after their name, compared lower case without dots, ® or ™. */
const CREDENTIALS = new Set(
  (
    "mba emba cpa cma cfa caia cfp chfc clu cima crpc ricp cdfa aif ea cgfm cgap cgma fcca aca acca cia cfe crisc cisa cism cgeit cissp ccsp csslp cciso c-ciso " +
    "hcispp cdpse cipp cipt cipm fip ceh oscp itil pmp pgmp pmi-acp pmi-rmp csm cspo a-cspo psm pspo spc rte safe cbap ccba lssbb lssgb cssgb cssbb " +
    "sphr phr gphr sphri shrm shrm-cp shrm-scp scp cp phrca cpp cpt cpc cpcc pcc acc mcc acpec ctp cpm cpim cscp cpsm cpcm cppm ccmp cams cams-rm " +
    "phd dba edd psyd dsc drph md do dnp np rn bsn msn aprn fnp pa-c crna rd ldn rph lcsw lmsw lpc lmft msw jd llm esq " +
    "ms msc ma mfa mpa mph mha msf msml msba mst mstm mstod msph mse mis mist mps mot mol mim mm msm mda mboe med hrd bfa ba bs bsc bba " +
    "fache facp facr chcio cphims chc ccep chcqm chqp ccsfp ccm cnp cnap cedc ceds cepa ceas cecp cfre fsmps aicp leed ap pe frm prm fsa cera maaa " +
    "aigp caio c.aio caip cude ccufc ccta clfp cva cal crc sde cms cfm ncce pahm ccc oly ams pcam cic cmmc rp lcam qte bcps rodc actc cpw cpe " +
    "hhe splp atc itat aair sm cxo cmo cfo coo cto cio ceo cro cco cpo chro csco c-cco c-cmo eli-mp aip-hc gdpr ccpa ii iii iv"
  ).split(/\s+/),
);
/** Said before a name. */
const HONORIFICS = new Set(["dr", "mr", "mrs", "ms", "mx", "miss", "prof", "rev", "sir", "dame"]);
/** Said after a name, in any case ("Jr.", "Sr", "Esq."). */
const SUFFIXES = new Set(["jr", "sr", "esq", "ii", "iii", "iv"]);
/** Words of a title or a tagline that are never a surname: a name ends before the first of these after its first word. */
const TITLE_WORDS = new Set(
  (
    "fractional interim advisor adviser consultant consulting founder cofounder co-founder strategist executive exec expert helping gtm revops " +
    "cmo cfo cro coo cto ceo cxo vp svp evp"
  ).split(/\s+/),
);
/** Title words that are also surnames (Head, Coach): a name ends before one only when more follows it ("Jane Doe Head of Growth"). */
const TITLE_WORDS_THEN = new Set("head chief director board leader coach author speaker mentor investor the sales marketing growth revenue".split(/\s+/));
/** Lower-case name particles that stay lower case ("Jan van der Berg"). */
const PARTICLES = new Set(["van", "von", "der", "den", "de", "da", "di", "del", "della", "du", "la", "le", "bin", "al", "dos", "das", "ter", "ten"]);

/** Why a name was not kept, as the script counts it. */
export type NameSkip = "no name" | "one word" | "last name is only an initial" | "first name is only an initial" | "not a person's name";

const key = (w: string) => w.toLowerCase().replace(/[.®™]/g, "");
const letters = (w: string) => (w.match(/\p{L}/gu) ?? []).length;
/** "J", "J." or "J.R.": initials, not a name written out. */
const isInitials = (w: string) => /^\p{L}\.?$/u.test(w) || /^(\p{L}\.){2,}$/u.test(w);
/** A credential as people write one: in capitals ("MBA", "PhD", "MSc"), never a surname like "Ma". */
function isCredential(w: string): boolean {
  if ((w.match(/\p{Lu}/gu) ?? []).length < 2) return false;
  const k = key(w);
  if (CREDENTIALS.has(k)) return true;
  // "MBA/PhD", "MBA & CPA".
  const parts = k.split(/[/&+]/).filter(Boolean);
  return parts.length > 1 && parts.every((p) => CREDENTIALS.has(p));
}
/** "JANE" -> "Jane", "o'brien" -> "O'Brien", "smith-jones" -> "Smith-Jones". */
const titleCase = (w: string) => w.toLowerCase().replace(/(^|['’\-.])(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());

/** A display name as the name a seat keeps, with the first name for a greeting, or why it was skipped. */
export function cleanPersonName(raw: unknown): { name: string; first: string } | { skip: NameSkip } {
  let s = String(raw ?? "").normalize("NFKC");
  // Emoji, flags, symbols and invisible characters (fancy letters already became plain ones above).
  s = s.replace(/[\p{Extended_Pictographic}\p{So}\p{Sm}\p{Sk}\p{Cc}\p{Cf}\u{1F1E6}-\u{1F1FF}⃣︎️]/gu, " ");
  // Bracketed notes (pronouns, nicknames, maiden names), an unclosed one to the end.
  s = s.replace(/\([^)]*\)?|\[[^\]]*\]?|\{[^}]*\}?/g, " ");
  // Nicknames in quotes. An apostrophe inside a name (O'Brien, D'Angelo) stays.
  s = s.replace(/["“”„«»][^"“”„«»]*["“”„«»]?/g, " ").replace(/(^|\s)['‘][^'‘’\s][^'‘’]*['’](?=\s|$)/g, "$1 ");
  // Everything after a comma or a separator is a credential, a title or a tagline.
  s = s.split(",")[0].split(/\s[-–—|/·•:]\s|[|•·]/)[0];
  if (!s.trim()) return { skip: "no name" };
  const caps = !/\p{Ll}/u.test(s);
  let ws = s
    .split(/\s+/)
    // Stray punctuation around a word goes (".Jane", "Doe;"). A dot after a word stays for now (an initial, "Jr.").
    .map((w) => w.replace(/^[^\p{L}]+/u, "").replace(/[^\p{L}.]+$/u, ""))
    .filter(Boolean);
  while (ws.length && HONORIFICS.has(key(ws[0]))) ws.shift();
  // A title or a tagline after the name ("Jane Doe Fractional CMO"): the name ends before it. "Jane Fractional CMO" has no surname left.
  const cut = ws.findIndex((w, i) => i >= 1 && (TITLE_WORDS.has(key(w)) || (TITLE_WORDS_THEN.has(key(w)) && i < ws.length - 1)));
  if (cut > 0) ws = ws.slice(0, cut);
  // Credentials and suffixes at the end ("Jane Doe MBA", "Jane Doe Jr."). In an all-caps name they can't be told from a surname, so they stay.
  while (ws.length > 1 && (SUFFIXES.has(key(ws[ws.length - 1])) || (!caps && isCredential(ws[ws.length - 1])))) ws.pop();
  if (!ws.length) return { skip: "no name" };
  // A trailing dot on a last name written out ("Doe.").
  const lastW = ws[ws.length - 1];
  if (!isInitials(lastW) && letters(lastW) >= 2) ws[ws.length - 1] = lastW.replace(/\.+$/, "");
  // Written the usual way: an all-caps or all-lowercase word takes capitals. Name particles in the middle stay lower case ("Jan van der Berg").
  ws = ws.map((w, i) => {
    if (isInitials(w)) return w.toUpperCase();
    if (caps || (/^[\p{Lu}'’.-]+$/u.test(w) && letters(w) >= 3)) return titleCase(w);
    if (/^\p{Ll}[\p{Ll}'’.-]*$/u.test(w) && (i === 0 || i === ws.length - 1 || !PARTICLES.has(w))) return titleCase(w);
    return w;
  });
  if (ws.length < 2) return { skip: "one word" };
  if (!ws.every((w) => /^\p{L}[\p{L}'’.-]*$/u.test(w))) return { skip: "not a person's name" };
  const last = ws[ws.length - 1];
  if (isInitials(last) || letters(last) < 2) return { skip: "last name is only an initial" };
  const first = ws.slice(0, -1).find((w) => !isInitials(w) && letters(w) >= 2);
  if (!first) return { skip: "first name is only an initial" };
  const name = ws.join(" ");
  if (!PERSON_NAME_RE.test(name)) return { skip: "not a person's name" };
  return { name, first };
}

/** Name words as they compare: no accents, case or punctuation, and no initials. */
function nameWords(n: string): string[] {
  return String(n ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z\s'-]/g, " ")
    .split(/\s+/)
    .map((w) => w.replace(/^['-]+|['-]+$/g, ""))
    .filter((w) => w.replace(/[^a-z]/g, "").length >= 2);
}

/**
 * Two names are the same person when their first and last names match, without accents, case,
 * punctuation, middle names or initials: "Jane Q. Doe" and "jane doe" are, "Jane Doe" and "Jane
 * Dole" are not. Each needs a first and a last name.
 */
export function sameName(a: string, b: string): boolean {
  const x = nameWords(a);
  const y = nameWords(b);
  if (x.length < 2 || y.length < 2) return false;
  return x[0] === y[0] && x[x.length - 1] === y[y.length - 1];
}

/** The first name of a stored name, for a greeting ("Hi Jane"). */
export function firstNameOf(name: string): string {
  const ws = String(name ?? "").trim().split(/\s+/);
  return ws.find((w) => !isInitials(w) && letters(w) >= 2) ?? ws[0] ?? "";
}
