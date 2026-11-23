/**
 * STUB for Stage 5 Builder C, to be REPLACED at the merge by Builder A's lib/evidence (types,
 * store, match, draft). Only the shapes and the three helpers Builder C wires against, with
 * exactly the agreed names and parameters; every one returns an empty result here.
 *
 *   listCases(memberId)              the member's own cases (drafts and ready), newest first
 *   matchCompany(memberId, companyId) the closest case for one company: Same, Close or Different,
 *                                    with the words for what is the same and what differs
 *   proofFor(memberId, companyId)    the Proof text for one company from the closest one or two
 *                                    ready cases, the client's name hidden unless the member named it
 *
 * The case shape is BUILD_PLAN F8's. Two optional fields on the match are what Builder C reads when
 * they are there (lib/evidenceWire.ts falls back without them): `caseId` (the closest case) and
 * `ranked` (every ready case for that company, closest first, each with its own label and words).
 * The merge: Builder A's matchCompany should return them, so Proof's "others closest first" and the
 * Closest evidence column name the case the label is for.
 */

export type MatchLabel = "Same" | "Close" | "Different";

export interface EvidenceOutcome {
  k: string;
  before: string;
  after: string;
  unit?: string;
}

export interface EvidenceCase {
  id: string;
  status: "draft" | "ready";
  seatId?: string;
  /** Internal, never leaves the server for anyone else. */
  companyId?: string;
  /** False by default: the client is described by clientLabel, never named. */
  clientNamed: boolean;
  /** "A health care company, $20M to $50M". */
  clientLabel: string;
  title: string;
  size?: string;
  revenue?: string;
  motion?: string;
  industry?: string;
  soldTo?: string;
  problems: string[];
  workType: string[];
  outcomes: EvidenceOutcome[];
  workedWith: { title: string }[];
  text: string;
  showOnCard: boolean;
  usedIn: string[];
  createdAt: string;
  updatedAt: string;
}

export interface EvidenceMatch {
  label: MatchLabel;
  same: string[];
  diff: string[];
  /** The closest case (optional; see above). */
  caseId?: string;
  /** Every ready case, closest first (optional; see above). */
  ranked?: { caseId: string; label: MatchLabel; same: string[]; diff: string[] }[];
}

/** STUB: no cases until Builder A's store is merged. */
export async function listCases(memberId: string): Promise<EvidenceCase[]> {
  void memberId;
  return [];
}

/** STUB: no case, so nothing is close. */
export async function matchCompany(memberId: string, companyId: string): Promise<EvidenceMatch> {
  void memberId, companyId;
  return { label: "Different", same: [], diff: [] };
}

/** STUB: no Proof text. */
export async function proofFor(memberId: string, companyId: string): Promise<string> {
  void memberId, companyId;
  return "";
}
