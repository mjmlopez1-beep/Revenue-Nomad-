/**
 * Evidence Bank's shapes as the page reads them (BUILD_PLAN F8). Builder A's server
 * (lib/evidence/types.ts, app/api/evidence/route.ts) owns the store; these mirror its EvidenceCase
 * field for field so the merge only has to point the imports at lib/evidence/types.ts.
 *
 * What the page keeps to:
 *   - a case is the member's own and private: it leaves the page only through a proposal's Proof
 *     part or, when they turn it on, their card in Fractionals;
 *   - clientNamed is false by default: a reader sees clientLabel ("A health care company, $20M to
 *     $50M"), never the client's name, until the member names it;
 *   - numbers are only the ones the member typed; an empty answer stays empty.
 *
 * The three questions map onto the case: "What was the problem?" fills problems (each line one
 * problem), "What did you do?" fills text (the member's own words) and workType (fit tags from the
 * pick list), "What changed, in numbers?" fills outcomes.
 */

export type EvidenceStatus = "draft" | "ready";

/** One before and after number, as the member typed it. */
export interface EvidenceOutcome {
  /** What was measured: "Win rate", "Sales cycle". */
  k: string;
  before: string;
  after: string;
  /** Optional unit when the numbers carry none ("days", "%"). */
  unit?: string;
}

export interface EvidenceCase {
  id: string;
  status: EvidenceStatus;
  /** The seat it was drafted from (the member's own EngagementRec id). */
  seatId?: string;
  /** Internal: the client's company. Only the owner ever receives it, never another reader. */
  companyId?: string;
  /** The client is named in proposals and on the card. False by default; the member turns it on once the client said yes. */
  clientNamed: boolean;
  /** What a reader sees in place of the name: "A health care company, $20M to $50M". */
  clientLabel: string;
  title: string;
  size: string;
  revenue: string;
  motion: string;
  industry: string;
  soldTo: string;
  /** The problems solved, from the pick list or in the member's words. */
  problems: string[];
  /** Type of work: fit tags from the pick list (WORK_TAGS). */
  workType: string[];
  outcomes: EvidenceOutcome[];
  /** Who they worked with, by title only. */
  workedWith: { title: string }[];
  /** What they did, in their words. */
  text: string;
  /** Shown on the member's card in Fractionals. False until they turn it on. */
  showOnCard: boolean;
  /** Proposals whose Proof part carries it. */
  usedIn: string[];
  createdAt: string;
  updatedAt: string;
  /*
   * What Builder A's route sends besides F8 (lib/evidence/types.ts CaseView), read by api.ts:
   * the client's name for the member's own eye (only when named, or asked for), the seat's role,
   * dates and hours, and the case as Merlin's template reads it (the Proof part's words).
   */
  clientName?: string;
  role?: string;
  dates?: string;
  hours?: string;
  reads?: string;
  /** The route's answer to "What was the problem?" in the member's words. */
  problemText?: string;
}

/** What the member sends to save a case (the server fills id, dates, usedIn and the label it can work out). */
export type EvidenceInput = Partial<Omit<EvidenceCase, "createdAt" | "updatedAt" | "usedIn">> & { id?: string };

/** How close one case is to one company (lib/evidence/match.ts): words only, never a percentage. */
export interface EvidenceMatch {
  caseId: string;
  label: "Same" | "Close" | "Different";
  same: string[];
  diff: string[];
}

/** The most cases a member keeps (F8). */
export const MAX_CASES = 50;

/**
 * Type of work, the fit tags: categories, each with its tags. A case carries tags; the category
 * filters the library and says what the member's cases cover. The server's list (Builder A,
 * lib/evidence/tags.ts, the owner's taxonomy) replaces these when it loads (setPicks); these
 * stand in until then, and in tests.
 */
export const WORK_TAGS_DEFAULT: { cat: string; tags: string[] }[] = [
  { cat: "Sales Leadership", tags: ["Sales process design", "Forecast methodology", "Founder-led sales exit", "Sales team hiring and ramp", "Pipeline inspection", "Quota and territory planning", "Product-led to sales bridge", "Pricing and packaging"] },
  { cat: "Marketing", tags: ["Positioning and messaging", "Demand generation", "Account-based marketing", "Content program", "Marketing team build"] },
  { cat: "Revenue Operations", tags: ["CRM sales configuration", "Revenue reporting and dashboards", "Lead routing and assignment", "Tech stack cleanup", "Comp plan design"] },
  { cat: "Sales Enablement", tags: ["Sales playbook", "Call coaching and feedback", "Onboarding program", "Sales training"] },
  { cat: "Customer Success and Growth", tags: ["Renewal management", "Expansion motion", "Churn reduction", "Customer onboarding"] },
  { cat: "AI go-to-market", tags: ["AI lead scoring", "AI outbound workflows", "AI research for sellers"] },
  { cat: "Partnerships", tags: ["Reseller channel build", "Partner enablement", "Alliances and co-selling"] },
  { cat: "Sellers", tags: ["Discovery call execution", "Deal closing", "Outbound prospecting"] },
];
let tagsNow = WORK_TAGS_DEFAULT;
let problemsNow: readonly string[] | null = null;
/** The fit tags in use: the server's once loaded, else the defaults. */
export const tagGroups = () => tagsNow;
export const workCats = () => tagsNow.map((g) => g.cat);
/** The category a tag is filed under, or null for a tag the member typed. */
export const catOf = (tag: string): string | null => tagsNow.find((g) => g.tags.includes(tag))?.cat ?? null;
/** The problems pick list in use. */
export const problemPicks = (): readonly string[] => problemsNow ?? PROBLEMS;
/** The server's pick lists, from its list answer (api.ts). Empty or missing keeps what is there. */
export function setPicks(p: { tags?: { cat: string; tags: string[] }[]; problems?: readonly string[] }) {
  if (p.tags && p.tags.some((g) => g.tags.length)) tagsNow = p.tags.filter((g) => g.cat);
  if (p.problems && p.problems.length) problemsNow = p.problems;
}

/** Problems members solve most, to pick from (the member can type their own). */
export const PROBLEMS = [
  "The founder closed every deal",
  "No shared sales process",
  "The forecast kept missing",
  "Pipeline too thin to hit the number",
  "Inbound leads sat for days",
  "Renewals had no owner",
  "Nothing written down for a new hire",
  "Revenue flat for a year or more",
  "Sign-ups grew but nobody followed up",
  "Sales and marketing pulled in different directions",
];
