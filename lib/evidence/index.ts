/**
 * Evidence Bank (lib/evidence, a Close feature) for the rest of Merlin: the shapes and the helpers
 * by member id, and the same helpers on a state in hand. The store is lib/evidence/store.ts; the
 * route app/api/evidence/route.ts, the connector lib/mcp/evidence.ts.
 *
 *   listCases(memberId)               the member's own cases (drafts and ready), client hidden unless named
 *   matchCompany(memberId, companyId) every ready case ranked for one company, the closest one's label,
 *                                     words and caseId on top, and `ranked` closest first
 *   proofFor(memberId, companyId)     the closest one or two ready cases as Proof takes them (never Different)
 *   cardFor(memberId)                 the cases the member shows on their Fractionals card
 *
 * Every case that leaves through here is hidden-client-safe: a hidden client reads by its label,
 * and its name and website are out of the case's words. A case's internal company id never leaves.
 */
export * from "./types";
export {
  CLOSE_EVIDENCE,
  caseView,
  cardFor,
  cardIn,
  casesIn,
  companyIdOf,
  evidenceOpen,
  forgetProposalIn,
  listCases,
  markUsedIn,
  matchCompany,
  matchCompanyIn,
  matchIn,
  matchRowsIn,
  proofFor,
  proofIn,
  proofItem,
  readyAllIn,
  readyItemsIn,
  safeText,
} from "./store";
