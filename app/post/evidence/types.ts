/**
 * Evidence Bank's shapes as the page reads them: the route's own (lib/evidence/types.ts CaseView,
 * EvidenceList), so the page and the server can't drift. A case study is the member's own and
 * private: on this page the client's name shows (the page asks the route with reveal), and it
 * leaves Merlin only through a proposal's Proof part or, when they turn it on, their card in
 * Fractionals, where the client stays hidden unless the member names it.
 */
import { EVIDENCE_LIMITS, PROBLEMS as SERVER_PROBLEMS, type CaseQuote, type CaseStatus, type CaseView, type MatchLabel } from "@/lib/evidence/types";

export type EvidenceStatus = CaseStatus;
/** One case study as the route sends it to its own member (CaseView). */
export type Study = CaseView;
export type Quote = CaseQuote;

/** How close one case is to one company (lib/evidence/match.ts): words only, never a percentage. */
export interface EvidenceMatch {
  caseId: string;
  label: MatchLabel;
  same: string[];
  diff: string[];
}

/** A known tag and the category it is filed under (the taxonomy, lib/evidence/tags.ts). */
export interface TagRef {
  name: string;
  category: string;
}
/** The tag catalogue the page searches: every known tag, and the categories. */
export interface TagCatalogue {
  categories: string[];
  tags: TagRef[];
}

/** What a save sends: the route's fields (app/api/evidence/route.ts, op "save"). */
export interface StudyInput {
  id?: string;
  title?: string;
  clientName?: string;
  clientNamed?: boolean;
  role?: string;
  fn?: string;
  start?: string;
  end?: string;
  industry?: string;
  size?: string;
  revenue?: string;
  answers?: { problem?: string; did?: string; numbers?: string };
  took?: string;
  quote?: Quote | null;
  workType?: string[];
  showOnCard?: boolean;
  status?: EvidenceStatus;
}

/** The most case studies a member keeps. */
export const MAX_CASES = EVIDENCE_LIMITS.cases;
/** Problems members solve most (the server's list). */
export const PROBLEMS: readonly string[] = SERVER_PROBLEMS;
