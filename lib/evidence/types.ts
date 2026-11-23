/**
 * Evidence Bank (F8): a member's own case studies, drafted from a seat they held, matched to
 * companies, used in the Proof part of their proposals and, if they choose, on their Fractionals
 * card. State.evidence[memberId] holds up to EVIDENCE_LIMITS.cases of them.
 *
 * Privacy, the rules every reader of this part keeps:
 *  - A case is its member's alone: never in another member's view, the shared table, an admin's
 *    panel or the admin export (lib/table.ts exportState leaves the whole part out). Closing an
 *    account deletes it with the rest of their personal data (lib/table.ts purgeMember).
 *  - The client is hidden by default (clientNamed false). Then the client's name never leaves the
 *    server: what goes out reads as `clientLabel` ("A health care company, $20M to $50M"), and the
 *    case's words are scrubbed of the name and the website on the way out (safeText), in case the
 *    member typed them into an answer. Only the member's own Evidence page may ask for the name
 *    (`reveal`), to show it back to them.
 *  - companyId and seatId are internal ids: they leave the server only as public ids, and only to
 *    the member, never through the connector.
 *  - Numbers are only ever the ones the member typed. Merlin's AI, when it writes, may not add one
 *    (lib/evidence/draft.ts numbersOk).
 *
 * Pure: no imports from lib/table.ts, so lib/table.ts can import the purge and merge helpers.
 */

export type CaseStatus = "draft" | "ready";
/** How a case's text was written: joined from the answers by Merlin's template, by Merlin's AI, or typed by the member. */
export type TextBy = "template" | "merlin" | "member";

/** The go-to-market motion a case sold through (the mockup's four). */
export const CASE_MOTIONS = ["Founder-led", "Sales-led", "Product-led", "Channel"] as const;
export type CaseMotion = (typeof CASE_MOTIONS)[number];

export interface Outcome {
  /** What was measured ("Win rate"). */
  k: string;
  /** As the member typed it ("22%"). */
  before: string;
  after: string;
  unit?: string;
}

/** The three questions of "Build from a seat", as the member answered them. */
export interface CaseAnswers {
  /** What was broken or stuck when they arrived. */
  problem: string;
  /** What they did. */
  did: string;
  /** What changed, in numbers, as they typed it. */
  numbers: string;
}

export interface EvidenceCase {
  id: string;
  status: CaseStatus;
  /** Internal engagement id of the seat it was drafted from. Never leaves the server as is. */
  seatId?: string;
  /** Internal company id. Never leaves the server for anyone else, and only as a public id for the member. */
  companyId?: string;
  /** The member chose to name the client. False by default. */
  clientNamed: boolean;
  /** The client's name: from the seat's company, or typed. Leaves the server only when clientNamed (or to its member, asked). */
  clientName?: string;
  /** The client's website host, kept only to scrub it from the text when the client is hidden. */
  clientSite?: string;
  /** How the client reads while hidden: "A health care company, $20M to $50M". */
  clientLabel: string;
  title: string;
  /** The seat's role ("Fractional VP Sales") and function ("Sales"). */
  role: string;
  fn: string;
  /** Start and end months (YYYY-MM, or YYYY), end "Ongoing" while it runs. */
  start: string;
  end: string;
  /** Hours a week, as on the seat. */
  hours: string;
  /** Employee band (RN_EMPLOYEES), revenue band (RN_REVENUE), motion (CASE_MOTIONS), industry (RN_INDUSTRIES). */
  size: string;
  revenue: string;
  motion: string;
  industry: string;
  /** Who the client sells to, in the member's words ("Clinic groups"). */
  soldTo: string;
  /** What the client needed (pick list PROBLEMS, or the member's own words). */
  problems: string[];
  /** Type of work: fit tags (lib/evidence/tags.ts). */
  workType: string[];
  outcomes: Outcome[];
  /** Titles only, never names ("CEO", "4 account executives"). */
  workedWith: { title: string }[];
  answers: CaseAnswers;
  /** The case as it reads. */
  text: string;
  textBy: TextBy;
  /** On the member's Fractionals card (Close). Off by default. */
  showOnCard: boolean;
  /** Proposal ids it went into (the member's own). */
  usedIn: string[];
  createdAt: string;
  updatedAt: string;
}

/** State.evidence: by member id. */
export type EvidenceState = Record<string, EvidenceCase[]>;

export const EVIDENCE_LIMITS = {
  cases: 50,
  title: 120,
  label: 120,
  clientName: 120,
  short: 80,
  answer: 1500,
  text: 4000,
  list: 8,
  item: 120,
  tags: 20,
  tag: 60,
  outcomes: 6,
  outcomeKey: 60,
  outcomeValue: 40,
  workedWith: 6,
  usedIn: 200,
  matchRows: 200,
} as const;

/** What a client needed: the hire reasons members already pick on seats, and any words of their own. */
export const PROBLEMS = [
  "Move off founder-led sales",
  "Build the first sales motion",
  "Build the function from scratch",
  "Scale an existing team",
  "Replace a departed leader",
  "Cover while hiring full-time",
  "Fix RevOps or the GTM stack",
  "Launch a new market or product",
  "Turn around missed targets",
  "Prepare for a raise",
] as const;

/* ---------- the words ---------- */

export const EVIDENCE_NAME = "Evidence Bank";
export const NOT_YOURS = "That case isn't in your Evidence Bank.";
export const FULL = `You have ${EVIDENCE_LIMITS.cases} cases, which is the most. Remove one to add another.`;
export const NOT_READY = "Answer what the problem was and what you did first. Then the case is ready.";
export const SEAT_NOT_YOURS = "Build a case from a seat you held. That seat isn't one of yours.";
export const ONLY_READY = "Only a ready case goes into a proposal or on your card. Finish its questions first.";
export const HIDDEN_CLIENT = "Client hidden";

/** A problem to say in a sentence, with the status for the route and the upgrade link on a plan refusal. */
export class EvidenceProblem extends Error {
  constructor(
    message: string,
    public status = 400,
    public upgrade?: string,
  ) {
    super(message);
  }
}

/* ---------- what leaves the server ---------- */

/** A case as its member's own Evidence page reads it. No internal id; the client's name only when named, or when asked for. */
export interface CaseView {
  id: string;
  status: CaseStatus;
  /** The seat it came from and its company, as public ids (the member's own page only). */
  seatId: string | null;
  companyId: string | null;
  client: { named: boolean; label: string; name?: string };
  title: string;
  role: string;
  fn: string;
  start: string;
  end: string;
  /** "Feb 2024 to Dec 2024", "Jun 2026 to now". */
  dates: string;
  hours: string;
  size: string;
  revenue: string;
  motion: string;
  industry: string;
  soldTo: string;
  problems: string[];
  workType: string[];
  outcomes: Outcome[];
  workedWith: { title: string }[];
  answers: CaseAnswers;
  /** Which of the three questions have an answer. */
  answered: { problem: boolean; did: boolean; numbers: boolean };
  text: string;
  textBy: TextBy;
  showOnCard: boolean;
  usedIn: string[];
  createdAt: string;
  updatedAt: string;
}

/** GET /api/evidence. Without Close only `canUse: false`, the words, the link and how many cases are kept. */
export interface EvidenceList {
  canUse: boolean;
  /** Close's words and the upgrade link, when canUse is false. */
  plan?: string;
  upgrade?: string;
  /** Cases kept while the plan is off (they come back on Close). */
  kept: number;
  cases: CaseView[];
  limit: number;
  /** The fit tag categories and every known tag (the private list when one is loaded). */
  tags: { categories: string[]; tags: { name: string; category: string }[] };
  problems: string[];
  motions: string[];
  /** Merlin's AI can write a case from the answers (switched on, and this member's plan has it). */
  ai: { on: boolean; agreed: boolean };
}

export type MatchLabel = "Same" | "Close" | "Different";
export interface CaseMatch {
  label: MatchLabel;
  same: string[];
  diff: string[];
}
/** One case against one company, for the member's own page. */
export interface RankedCase extends CaseMatch {
  caseId: string;
  title: string;
  /** The closest case of all (one, or none when every case is Different). */
  closest: boolean;
}
export interface MatchView {
  companyId: string;
  cases: RankedCase[];
  /** Drafts are skipped until their questions are answered. */
  skipped: number;
}
/**
 * matchCompany (by member id, for the rest of Merlin): the MatchView, with the closest case's own
 * label and words on top (`caseId` absent when every case reads Different), and `ranked`, every
 * ready case closest first, each with its label and words (the same list as `cases`).
 */
export interface EvidenceMatch extends MatchView, CaseMatch {
  caseId?: string;
  ranked: RankedCase[];
}
/** A company's row in a list: its closest ready case (with its first outcome, as outcomeLine says it), or null. */
export type MatchRows = Record<string, (CaseMatch & { caseId: string; title: string; outcome?: string }) | null>;

/** A case as it goes into a proposal's Proof part or onto a card: hidden-client-safe. */
export interface ProofItem {
  caseId: string;
  title: string;
  /** The client's name when named, else the label. */
  client: string;
  named: boolean;
  text: string;
  outcomes: Outcome[];
  workType: string[];
  match?: CaseMatch;
}

/* ---------- small helpers ---------- */

/** A value with its unit, as the member typed them: "74" and "days" read "74 days", "30" and "%" read "30%". */
export const withUnit = (v: string, u?: string) => `${v}${u && v && !v.endsWith(u) ? (/^[%x]$/.test(u) ? u : ` ${u}`) : ""}`.trim();
/** One outcome in a line: "Sales cycle: 74 days to 51 days". */
export const outcomeLine = (o: Outcome) => `${o.k}: ${withUnit(o.before, o.unit)} to ${withUnit(o.after, o.unit)}`;
/**
 * A case's one line in a proposal's Proof part, the only place that line is written (the proposal
 * store, the editor's Proof, Evidence Bank's Use in a proposal): who the client was (the label
 * unless named), the title, the case's words and the numbers as typed. Built from a ProofItem, so
 * the hidden client's name is already out of every part of it.
 */
export function proofLine(i: Pick<ProofItem, "client" | "title" | "text" | "outcomes">): string {
  const end = (x: string) => (/[.!?]$/.test(x) ? x : `${x}.`);
  const head = i.title && i.title !== i.client ? `${i.client}: ${i.title}` : i.client;
  // The template's own "The client: ..." opener is said by the head already.
  const story = String(i.text ?? "").replace(/\s+/g, " ").trim().replace(/^The client: .*?\.(\s+|$)/, "");
  // Numbers the case's words already carry aren't said twice.
  const has = (v: string) => !String(v ?? "").trim() || story.includes(String(v).trim());
  const outs = (i.outcomes ?? []).filter((o) => o && String(o.k ?? "").trim() && (String(o.before ?? "").trim() || String(o.after ?? "").trim()) && !(has(o.before) && has(o.after)));
  return `${end(head)}${story ? ` ${end(story)}` : ""}${outs.length ? ` ${outs.map(outcomeLine).join("; ")}.` : ""}`.replace(/\s+/g, " ").trim();
}

/** "2024-02" -> "Feb 2024"; "2024" stays; "Ongoing" -> "now". */
export function monthWords(m: string): string {
  const t = String(m ?? "").trim();
  if (!t) return "";
  if (/^ongoing$/i.test(t)) return "now";
  const x = /^(\d{4})-(\d{2})/.exec(t);
  if (!x) return t;
  const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const k = Number(x[2]) - 1;
  return k >= 0 && k < 12 ? `${names[k]} ${x[1]}` : x[1];
}
/** "Feb 2024 to Dec 2024", "Jun 2026 to now", "2023", or "". */
export function datesOf(start: string, end: string): string {
  const a = monthWords(start);
  const b = monthWords(end);
  if (a && b) return `${a} to ${b}`;
  return a ? (/^ongoing$/i.test(end) || !end ? `${a} to now` : a) : b && b !== "now" ? `Until ${b}` : "";
}

/* ---------- account closure, removed and merged companies (lib/table.ts) ---------- */

/** Every case of a member, gone (account closure's purge). */
export function forgetMemberEvidence(all: EvidenceState | undefined, memberId: string): void {
  if (all) delete all[memberId];
}

/** A company removed from Merlin: cases at it keep their words and label, and lose the link to it. */
export function forgetCompanyEvidence(all: EvidenceState | undefined, companyId: string): void {
  if (!all) return;
  for (const list of Object.values(all))
    for (const c of list)
      if (c.companyId === companyId) {
        delete c.companyId;
        delete c.seatId;
      }
}

/** Two records of one company folded into one: cases at the copy point to the one kept. */
export function mergeCompanyEvidence(all: EvidenceState | undefined, from: string, to: string): void {
  if (!all || from === to) return;
  for (const list of Object.values(all)) for (const c of list) if (c.companyId === from) c.companyId = to;
}
