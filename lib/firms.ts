/**
 * Fractional firms: companies that are themselves a fractional firm, an agency of fractional
 * or interim executives, or a freelance or fractional talent marketplace or network,
 * and placeholders that name no client at all ("Contractor", "Independent", "Freelance").
 * A fractional lists one as where they work, but it did not hire them: it is not a client, so it
 * is not on Merlin. The seed cleanup drops them, the weekly scan never adds one, Add refuses
 * one, and a running table removes any it holds (lib/firmRemoval.ts).
 *
 * Shared by server and client (no Node imports). Admins extend it here:
 *  - FIRM_NAMES: always a firm (a known name the rules miss). A name added here is removed on the
 *    next start (a firm where a member holds a seat is listed for admin review instead).
 *  - NOT_FIRMS: never a firm (a client the rules flag by mistake). Rebuild the seed (scripts/build-intel-seed.py) to
 *    bring back one the seed already dropped.
 * Names compare without case, accents, punctuation or a legal suffix ("FocusCFO®" is focuscfo).
 */

/*
 * Staffing and recruiting firms, and consulting firms, are clients (Revenue Nomad's industry list
 * has Staffing & Recruiting and Consulting & Advisory): only firms whose business is placing
 * fractional, interim or freelance talent are firms here.
 */

/** Known fractional firms, marketplaces and talent networks. */
export const FIRM_NAMES: string[] = [
  "Toptal", "Catalant", "Chief Outsiders", "FocusCFO", "Freeman Clarke", "yorCMO", "salesQB", "Connectd", "GoFractional", "Go Fractional",
  "Agile Executives", "ScaleWise", "MarketerHire", "Revenue Nomad", "Topcoder", "Upwork", "Fiverr", "Paro", "Bolster", "Business Talent Group",
  "Expert360", "A.Team", "Braintrust", "Gun.io", "Turing", "10x Management", "Sales Xceleration", "Skaled", "Skaled Consulting", "Field Nation",
  "WorkGenius", "WorkGenius Group", "Remotebase", "The CFO Centre", "CFO Centre", "Fractional Jobs", "The Fractional CMO", "CMOx",
  "Interim Executive", "Officer as a Service", "Graphite Financial", "Pocketbook Agency", "Growth Collective", "Contra", "Malt", "Comatch",
  "Hatchworks", "Kalungi", "Ampleo",
  "We Are The Board", "Glencoco", "Head of AI", "Paro.ai",
];

/** Never a firm, whatever the rules say. Add a client here when the rules flag it by mistake. */
export const NOT_FIRMS: string[] = ["RecruitBot", "TalentNeuron", "KarmaCheck", "Safehire.ai", "CloudCall", "Trialbee", "Medely", "Globalization Partners"];

/** Names that stand for no client: the fractional's own practice, or a client they won't name. */
const PLACEHOLDERS = [
  "contractor", "independent contractor", "independent", "independent consultant", "independent professional", "independent advisor",
  "freelance", "freelancer", "freelancing", "freelance consultant", "self", "self employed", "selfemployed", "self employed consultant",
  "consultant", "consulting", "my own company", "own company", "my company", "own business", "private practice", "sole proprietor",
  "profesional independiente", "consultor independiente", "trabajador independiente", "autonomo", "autonoma", "independiente",
  "freiberufler", "freiberuflich", "selbststandig", "selbstandig", "freelance consultant", "zzp", "zelfstandige", "auto entrepreneur",
  "various", "various clients", "multiple clients", "multiple", "portfolio", "portfolio career", "n a", "na", "none", "tbd",
  "fractional", "fractional executive", "fractional leader", "fractional cmo", "fractional cfo", "fractional cro", "fractional coo",
];

/** A company name as compared here: no accents, case, punctuation, or a legal suffix. */
export const firmKey = (raw: unknown) =>
  String(raw ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[®™©]/g, "")
    .replace(/\b(inc|llc|ltd|limited|gmbh|corp|corporation|co|plc|bv|ag|sa|sl|pty|pte)\b\.?/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

const FIRM_SET = new Set(FIRM_NAMES.map(firmKey));
const NOT_SET = new Set(NOT_FIRMS.map(firmKey));
const PLACEHOLDER_SET = new Set(PLACEHOLDERS.map(firmKey));

/** Names that say what the firm sells. */
const NAME_RULES: [RegExp, string][] = [
  [/fractional/, "fractional in the name"],
  // "yorCMO", "HireCMO.com", "The FCFO", "netgainCFO": a word ending in CMO or CFO. CRO only as its own word ("Micro" is not one).
  [/[a-z]*(cmo|cfo)s?\b|\bcros?\b/, "CMO, CFO or CRO firm"],
  [/\b(cmo|cfo|cro|coo|cto|ceo|executive|officer|sales|marketing) as a service\b|\bas a service\b.*\b(executive|officer|cfo|cmo)\b/, "as a service"],
  [/\binterim (executive|executives|management|leadership|leaders)\b/, "interim executives"],
  [/\b(outsourced|part time) (cfo|cmo|cro|sales|marketing|executive|executives)\b/, "outsourced or part-time executives"],
];

/** About texts that say the company provides fractional, interim or freelance talent. */
const ABOUT_RULES: [RegExp, string][] = [
  [/\bfractional (cmo|cfo|cro|coo|cto|executive|executives|leader|leaders|leadership|sales|marketing|revenue|c suite|team|talent|experts?)/, "provides fractional leaders"],
  [/\b(cmo|cfo|cro|coo|sales|marketing) as a service\b/, "provides executives as a service"],
  [/\bpart time (cmo|cfo|cro|coo|executive|executives|c suite|leaders?)\b/, "provides part-time executives"],
  [/\binterim (executive|executives|management|leaders|leadership|cfo|cmo|cro)\b/, "provides interim executives"],
  [/\b(network|marketplace|platform|community) of (pre vetted |vetted |top |elite |independent |senior )*(freelance|fractional|independent|interim|on demand|part time)/, "talent network or marketplace"],
  [/\b(talent|freelance|freelancer|expert|consultant) (marketplace|network|platform)\b/, "talent network or marketplace"],
  [/\bprovide (freelance|interim|fractional) (executives?|leaders?|cmos?|cfos?|marketers|talent)/, "places fractional or freelance talent"],
];

/** Words that make a small company named after its seat holder read as their own practice. */
const PRACTICE_WORDS = /\b(consulting|consultants?|consultancy|advisory|advisors?|partners|group|strategies|strategy|solutions|ventures|associates|collective|studio|labs?|co|company|enterprises|management|services|growth|marketing)\b/;

export interface FirmInput {
  name: string;
  about?: string | null;
  /** Employee bucket (RN_EMPLOYEES), when known. */
  employees?: string | null;
  /** Names of people who held a seat there: a company named after one of them is their own practice. */
  holders?: string[];
  /**
   * Fractionals Revenue Nomad found who list it as their current fractional seat (seat scan).
   * Three or more at one company that is not a large one: it is where they work, a firm.
   */
  listedBy?: number;
}
/** Seat-scan seats at one company that make it a firm (unless it has over 1,000 people). */
export const FIRM_SEAT_SCAN_MIN = 3;

/**
 * Why a company is a fractional firm, agency, marketplace or placeholder, or null when it reads
 * as a client. NOT_FIRMS wins over everything, FIRM_NAMES over the rules.
 */
export function firmReason(c: FirmInput): string | null {
  const key = firmKey(c.name);
  if (!key) return null;
  if (NOT_SET.has(key)) return null;
  if (FIRM_SET.has(key)) return "known firm";
  if (PLACEHOLDER_SET.has(key)) return "placeholder name";
  // ("Stealth" and "Confidential" are clients who keep their name back, so they stay.)
  if (/^(self employed|freelance|independent (consultant|contractor|advisor))\b/.test(key)) return "placeholder name";
  for (const [re, why] of NAME_RULES) if (re.test(key)) return why;
  const about = firmKey(c.about ?? "");
  if (about) for (const [re, why] of ABOUT_RULES) if (re.test(about)) return why;
  if ((c.listedBy ?? 0) >= FIRM_SEAT_SCAN_MIN && c.employees !== "1,001+") return "several fractionals work there";
  // "Jane Doe Consulting": a seat holder's own practice. Small or unknown size only (a large company named after a founder is a client).
  const small = !c.employees || c.employees === "1–10" || c.employees === "11–50";
  if (small) {
    const words = key.split(" ");
    for (const h of c.holders ?? []) {
      const person = firmKey(h).split(" ").filter(Boolean);
      if (person.length < 2) continue;
      const full = person.join("");
      const last = person[person.length - 1];
      if ((full.length >= 6 && key.replace(/ /g, "").includes(full)) || (last.length >= 4 && words.includes(last) && PRACTICE_WORDS.test(key))) return "named after its seat holder";
    }
  }
  return null;
}

/** On NOT_FIRMS: never a firm, even when an older seed says it is one. */
export const isNotFirm = (name: unknown) => NOT_SET.has(firmKey(name));

/** True when the company is a fractional firm, agency, marketplace or placeholder (see firmReason). */
export const isFirm = (c: FirmInput) => firmReason(c) !== null;
