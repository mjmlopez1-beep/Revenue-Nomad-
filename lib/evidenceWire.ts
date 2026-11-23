/**
 * Evidence Bank (lib/evidence, a Close feature) as the rest of Merlin uses it: the Proof part of a
 * proposal (lib/proposals/proof.ts and store.ts), the Closest evidence column and cards (POST
 * /api/evidence { op: "match", companyIds } and GET /api/evidence/closest), Getting started's step 6
 * and the opt-in cases on a member's Fractionals card (lib/fractionals.ts). Built only on
 * lib/evidence's own helpers, so there is one ranking, one card and one Proof line:
 *   - the ranking for a company is lib/evidence matchIn (rankCases), the Proof pick its proofIn,
 *     a list's closest case its matchRowsIn, the card its cardIn;
 *   - a case's words are lib/evidence proofItem's (hidden client scrubbed of its name and website),
 *     and its line in Proof is lib/evidence proofLine.
 *
 * The rules:
 *   - Close only: a member without Close (or the Close trial) gets nothing from here, and their
 *     pages show the Close pill as before. A card's cases show only while their owner has Close.
 *   - Never invent a case: only the member's own ready cases are used, as the member wrote them.
 *     Proof fills by itself only from a case whose match is Same or Close, one or two of them.
 *   - The client's name stays hidden unless the member named it. Its internal company id never leaves.
 */
import { cardIn, casesIn, matchIn, matchRowsIn, outcomeLine, proofIn, proofLine as lineOf, readyAllIn, readyItemsIn, withUnit, EvidenceProblem, type MatchLabel, type ProofItem } from "./evidence";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Seed, type State } from "./table";

/** Proof holds one or two cases. */
export const PROOF_MAX = 2;
/** A Fractionals card shows at most this many. */
export const CARD_MAX = 3;
/** Companies one closest request may ask about (a workbench page). */
export const CLOSEST_MAX = 200;

/** A case as a page shows it: the client hidden unless named, with its match for one company. */
export interface CaseLine {
  id: string;
  title: string;
  /** Who the client was, as the case says it: their label, or their name when the member named them. */
  client: string;
  named: boolean;
  story: string;
  outs: { k: string; was: string; now: string }[];
  /** For one company: Same, Close or Different, and the words. Null when it wasn't matched. */
  label: MatchLabel | null;
  same: string[];
  diff: string[];
  /** Where it comes from: "From your seat · client name hidden". */
  src: string;
  /** Its one line in Proof, as the client will read it (lib/evidence proofLine). */
  line: string;
}

/** One company's closest case, for the column and the cards. */
export interface ClosestRow {
  label: MatchLabel;
  same: string[];
  diff: string[];
  /** The case it is about, when a ready case is there. */
  caseId?: string;
  title?: string;
  outcome?: string;
}

/** GET /api/evidence/closest. `on`: the member has Close. `ready`/`drafts`: their cases. */
export interface ClosestView {
  on: boolean;
  ready: number;
  drafts: number;
  rows: Record<string, ClosestRow>;
}

type Matched = { label: MatchLabel | null; same: string[]; diff: string[] };
const NONE: Matched = { label: null, same: [], diff: [] };

/** A case as a page shows it, from lib/evidence's ProofItem (already hidden-client-safe). */
export function caseLine(i: ProofItem, fromSeat: boolean, m: Matched = i.match ?? NONE): CaseLine {
  return {
    id: i.caseId,
    title: i.title || i.client,
    client: i.client,
    named: i.named,
    story: i.text,
    outs: i.outcomes.filter((o) => o && String(o.k ?? "").trim() && (String(o.before ?? "").trim() || String(o.after ?? "").trim())).map((o) => ({ k: o.k, was: withUnit(o.before, o.unit), now: withUnit(o.after, o.unit) })),
    label: m.label,
    same: [...m.same],
    diff: [...m.diff],
    src: `${fromSeat ? "From your seat" : "Your case"} · ${i.named ? "client named" : "client name hidden"}`,
    line: lineOf(i),
  };
}

/** Proof's text from its cases: one line a case, so the proof block reads each as a bullet (library.ts fill). */
export const proofText = (items: ProofItem[]) => items.map(lineOf).join("\n");

/** The member's plan has Close now (the trial included; billing off: everything is open). */
export const closeOn = (s: State, memberId: string, nowMs = Date.now()) => T.closeNow(s, memberId, nowMs);

/**
 * The member's ready cases for one company (internal id), closest first, each with its match
 * (lib/evidence matchIn), as lines. Without a company, or one not on file: newest first, unmatched.
 */
export function rankedLines(seed: Seed, s: State, memberId: string, companyId: string | null): CaseLine[] {
  const fromSeat = new Set(casesIn(s, memberId).filter((c) => c.seatId).map((c) => c.id));
  const all = readyAllIn(s, memberId);
  const m = companyId ? matchIn(seed, s, memberId, companyId) : null;
  if (!m) return all.map((i) => caseLine(i, fromSeat.has(i.caseId)));
  const byId = new Map(all.map((i) => [i.caseId, i]));
  return m.cases.filter((r) => byId.has(r.caseId)).map((r) => caseLine(byId.get(r.caseId)!, fromSeat.has(r.caseId), r));
}

/**
 * Proof for one company (internal id), as a proposal starts: lib/evidence proofIn's closest one or
 * two ready cases (Same or Close, never Different), their ids and their lines. Read on the
 * committed state. Null when no case fits: Proof stays empty, and Merlin never writes one.
 */
export async function autoProof(memberId: string, companyId: string, nowMs = Date.now()): Promise<{ ids: string[]; text: string } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  // Only matched cases: a company with no facts on file gives none, rather than the newest.
  const items = proofIn(seed, s, memberId, companyId, PROOF_MAX, nowMs).filter((i) => i.match && i.match.label !== "Different");
  return items.length ? { ids: items.map((i) => i.caseId), text: proofText(items) } : null;
}

/**
 * Proof from the cases the member picked (Swap case, Add a case, Use in a proposal): each must be
 * one of their own ready cases, at most two. The text, one line a case; "" for none (Proof left empty).
 */
export async function proofFromCases(memberId: string, raw: unknown): Promise<{ ids: string[]; text: string } | { error: string }> {
  if (!Array.isArray(raw) || raw.length > PROOF_MAX || raw.some((x) => typeof x !== "string")) return { error: `Pick up to ${PROOF_MAX} of your cases.` };
  const ids = [...new Set(raw as string[])];
  if (!ids.length) return { ids: [], text: "" };
  try {
    const items = readyItemsIn(await loadState(), memberId, ids);
    return { ids, text: proofText(items) };
  } catch (e) {
    if (e instanceof EvidenceProblem) return { error: "That case isn't ready in your Evidence Bank anymore. Open Evidence Bank to finish it." };
    throw e;
  }
}

/**
 * GET /api/evidence/closest?ids=: for the signed-in member, how many cases are ready and in
 * draft, and for each company asked (public ids, CLOSEST_MAX at most) its closest case (lib/evidence
 * matchRowsIn, the rows POST /api/evidence { op: "match", companyIds } gives). Only a Same or Close
 * case is the closest evidence, as Proof takes it. Off Close: `on: false` and nothing else. Null
 * signed out.
 */
export async function closestView(token: string | null, pubs: string[], nowMs = Date.now()): Promise<ClosestView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  if (!closeOn(s, me.id, nowMs)) return { on: false, ready: 0, drafts: 0, rows: {} };
  const all = casesIn(s, me.id);
  const ready = all.filter((c) => c.status === "ready").length;
  const rows: Record<string, ClosestRow> = {};
  if (ready && pubs.length)
    for (const [pub, r] of Object.entries(matchRowsIn(seed, s, me.id, [...new Set(pubs)].slice(0, CLOSEST_MAX))))
      if (r && r.label !== "Different") rows[pub] = { label: r.label, same: r.same, diff: r.diff, caseId: r.caseId, title: r.title, ...(r.outcome ? { outcome: r.outcome } : {}) };
  return { on: true, ready, drafts: all.length - ready, rows };
}

/**
 * The cases a member chose to show on their Fractionals card (lib/evidence cardIn: ready, "Show on
 * my card" on, the client hidden unless named, while they have Close): title and one outcome each,
 * CARD_MAX at most.
 */
export function cardCases(s: State, memberId: string, nowMs = Date.now()): { title: string; outcome?: string }[] {
  return cardIn(s, memberId, nowMs)
    .slice(0, CARD_MAX)
    .map((i) => ({ title: i.title || i.client, ...(i.outcomes[0] ? { outcome: outcomeLine(i.outcomes[0]) } : {}) }));
}
