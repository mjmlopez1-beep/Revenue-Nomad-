/**
 * The seniority bar for open roles outside GTM. The owner's rule: GTM roles (GTM_FUNCTIONS in
 * lib/tableFields.ts) come in at any seniority. Outside GTM (Technology, Finance, Operations,
 * People, Product, Legal, Executive, Other, or a role whose function is not GTM at all) an open
 * role is kept only when its title shows Director or higher: Director, Senior Director, Head of,
 * VP and its kin, Chief and the C-level abbreviations, Chief of Staff, General Counsel,
 * Controller, President, Managing Director, or a fractional or interim Executive. A coordinator,
 * specialist, analyst, manager, engineer, designer, recruiter or accountant outside GTM is not.
 *
 * Used by the scan (lib/scan/collect.ts and applyScan in lib/table.ts, which leave such a role
 * out), by the pass that takes such roles back off the table (lib/scan/remove.ts), by the
 * landing preview (lib/preview.ts) and by the seed import. Pure string work, no Node imports.
 */
import { GTM_FUNCTIONS, functionOf } from "./tableFields";

export type Seniority = "C-level" | "VP" | "Head" | "Director" | "Lead" | "Manager" | "Staff";

/** Seniorities at Director or above. */
export const DIRECTOR_PLUS: readonly Seniority[] = ["C-level", "VP", "Head", "Director"];

export const isGtmFunction = (fn: string | null | undefined): boolean => !!fn && GTM_FUNCTIONS.includes(fn);

/** Words that put a title in GTM whatever else it says ("Sales Engineer", "Revenue Operations Analyst"). */
const GTM_WORDS =
  /\b(?:sales|salesforce|marketing|marketer|revenue|rev\s?ops|gtm|go[\s-]to[\s-]market|growth|demand gen\w*|lead gen\w*|account executive|ae|sdrs?|bdrs?|business development|biz\s?dev|partnerships?|alliances|customer success|product marketing|pmm|enablement|cro|cmo|cgo|commercial|pipeline|outbound|prospecting|brand|seo|sem|paid (?:media|social|search)|performance marketing|lifecycle|abm|account manage(?:r|ment)|copywrit\w*|social media|public relations|ecommerce|e-commerce)\b/i;

/**
 * Words that say a title is outside GTM. They overrule functionOf's looser matches: "Talent
 * Acquisition" is not Growth, "IT Support" not Customer Success, "Teacher Training" not
 * Enablement, an "Operations Analyst" at a hospital not RevOps.
 */
const NON_GTM_WORDS =
  /\b(?:talent|recruit\w*|staffing|hr|human resources|people|payroll|benefits|it|information technology|tech(?:nical)? support|help\s?desk|engineer\w*|engineering|developer|software|devops|data|school|teacher|teaching|tutor|instructor|education|clinical|medical|nurse|patient|health\s?care|finance|financial|accounting|accountant|bookkeep\w*|tax|audit\w*|legal|counsel|attorney|paralegal|compliance|security|operations|operating|supply chain|logistics|procurement|warehouse|facilities|product (?:manager|management|owner|designer|design|lead)|design|designer|ux|ui|research\w*|scientist|lab)\b/i;

/** The title names a GTM function: a GTM word, or functionOf's GTM mapping when no word outside GTM overrules it. */
export function isGtmTitle(title: string | null | undefined): boolean {
  const t = String(title ?? "");
  if (!t.trim()) return false;
  if (GTM_WORDS.test(t)) return true;
  if (NON_GTM_WORDS.test(t)) return false;
  return isGtmFunction(functionOf(t));
}

/** The title names some function (GTM or not), so a stored function does not get the last word. */
const namesAFunction = (t: string) => GTM_WORDS.test(t) || NON_GTM_WORDS.test(t) || !!functionOf(t);

/** "Executive Assistant to the CEO" is an assistant: what follows "to the" or "for the" is someone else's seat. */
const OTHER_SEAT = /\s+(?:to|for|supporting|reporting to|working with)\s+(?:(?:the|our|a|an)\s+)?\S.*$/i;
/** Creative and production directors lead a craft, not a function: not Director+ outside GTM. */
const CREATIVE_DIRECTOR =
  /\b(?:art|creative|design|music(?:al)?|film|casting|video|animation|stage|game|photo(?:graphy)?|choir|technical theatre)\s+director\b|\bdirector of photography\b/gi;
/** "Assistant Director", "Associate Director", "Assistant Controller", "Assistant VP": a level below. */
const UNDER = /\b(?:assistant|associate|asst\.?|assoc\.?)\s+(?:to\s+)?(?:director|controller|comptroller|vp|vice[\s-]president|head|general counsel)\b/i;

const LADDER: [Seniority, RegExp][] = [
  [
    "C-level",
    /\bchief\b|\bc(?:eo|fo|oo|to|io|iso|po|hro|lo|co|do|so|mo|ro|go|aio|ao|xo|bo|no|tio|ito|ro)\b|\bgeneral counsel\b|(?<!vice[\s-])\bpresident\b|\b(?:fractional|interim|part[\s-]time)\s+executive\b(?!\s+(?:assistant|admin\w*|coordinator|support|search|recruit\w*|chef|producer|editor|housekeeper))/i,
  ],
  ["VP", /\b[se]?vp\b|\bvice[\s-]+president\b/i],
  ["Head", /\bhead\s+of\b|\bhead\s*[,:–—]|\b(?:department|division|practice|global|regional|group|team)\s+head\b/i],
  ["Director", /\bdirector\b|\bcontroller\b|\bcomptroller\b/i],
  ["Lead", /\blead\b|\bprincipal\b|\bstaff\b|\bsenior\b|\bsr\.?\b/i],
  ["Manager", /\bmanager\b|\bsupervisor\b|\bforeman\b/i],
  [
    "Staff",
    /\b(?:coordinator|specialist|analyst|associate|assistant|engineer|developer|programmer|designer|recruiter|sourcer|accountant|bookkeeper|administrator|admin|clerk|technician|intern|representative|rep|agent|writer|editor|teacher|tutor|instructor|nurse|paralegal|generalist|officer|scientist|researcher|architect|tester|qa)\b/i,
  ],
];

/** The seniority a title shows, or null when it shows none ("Fractional Consultant"). */
export function seniorityOf(title: string | null | undefined): Seniority | null {
  let t = String(title ?? "").replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  if (!t) return null;
  t = t.replace(OTHER_SEAT, "");
  if (UNDER.test(t)) return "Manager";
  t = t.replace(CREATIVE_DIRECTOR, " craft lead ");
  for (const [level, re] of LADDER) if (re.test(t)) return level;
  return null;
}

export const isDirectorPlus = (title: string | null | undefined): boolean => {
  const s = seniorityOf(title);
  return !!s && DIRECTOR_PLUS.includes(s);
};

/** Seniorities below Lead. A seat with such a title is no leadership seat. */
export const BELOW_LEAD: readonly Seniority[] = ["Manager", "Staff"];

/**
 * The title reads below Lead: "Fractional Finance Manager", "Fractional Content Engineer". C-level,
 * VP, Head, Director, Lead, and a title that shows no level ("Fractional Consultant") do not.
 * "Recently hired" counts leadership seats only, so the server marks a seat whose stored title
 * reads below Lead (EngagementRec.belowLead in lib/table.ts), whether or not the viewer can see it.
 */
export const isBelowLead = (title: string | null | undefined): boolean => {
  const s = seniorityOf(title);
  return !!s && BELOW_LEAD.includes(s);
};

/**
 * The role is in GTM. The title decides when it names a function. When it names none
 * ("Fractional Consultant (Contract)"), a GTM function on file (a board's label, or one a member
 * set) counts, unless the title shows a level below Director: a bare "Coordinator" with a Sales
 * label from the posting's body is not a GTM seat.
 */
export function isGtmRole(title: string | null | undefined, fn?: string | null): boolean {
  const t = String(title ?? "");
  if (isGtmTitle(t)) return true;
  if (namesAFunction(t)) return false;
  return isGtmFunction(fn) && seniorityOf(t) === null;
}

/**
 * The bar itself: true when an open role may stay. A GTM role always may. A role outside GTM
 * may only when its title shows Director or higher.
 */
export function keepsNonGtm(title: string | null | undefined, fn?: string | null): boolean {
  return isGtmRole(title, fn) || isDirectorPlus(title);
}

/** Why a role fails the bar, for drop counts and logs. Null when it is kept. */
export const seniorityDrop = (title: string | null | undefined, fn?: string | null): "below-director" | null =>
  keepsNonGtm(title, fn) ? null : "below-director";
