/**
 * Evidence Bank (lib/evidence, a Close feature) as the rest of Merlin uses it: the Proof part of a
 * proposal (lib/proposals/proof.ts), the Closest evidence column and cards (GET
 * /api/evidence/closest), Getting started's step 6 and the opt-in cases on a member's Fractionals
 * card (lib/fractionals.ts). Built only on lib/evidence's listCases, matchCompany and proofFor.
 *
 * The rules:
 *   - Close only: a member without Close (or the Close trial) gets nothing from here, and their
 *     pages show the Close pill as before. A card's cases show only while their owner has Close.
 *   - Never invent a case: only the member's own ready cases are used, as the member wrote them.
 *     Proof fills by itself only from a case whose match is Same or Close, one or two of them.
 *   - The client's name stays hidden unless the member named it: a case reads by its client label
 *     ("A health care company, $20M to $50M"), and the company's name, when Merlin knows it, is
 *     taken out of the member's own words too ("the client"). Its internal company id never leaves.
 *
 * `evidenceWireInternals.use` swaps the three helpers for tests (scripts/test-evidence-wire.mts).
 */
import * as E from "./evidence";
import type { EvidenceCase, EvidenceMatch, MatchLabel } from "./evidence";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Seed, type State } from "./table";

type Src = { listCases: typeof E.listCases; matchCompany: typeof E.matchCompany; proofFor: typeof E.proofFor };
const REAL: Src = { listCases: E.listCases, matchCompany: E.matchCompany, proofFor: E.proofFor };
let src: Src = REAL;

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

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** The member's own words with the client's name taken out, while it is hidden. */
export function scrub(text: string, name: string | null | undefined, named: boolean): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  const n = (name ?? "").trim();
  if (named || n.length < 3) return t;
  const lead = new RegExp(`^${esc(n)}\\s*[:,]\\s*`, "i");
  // "Northwind Clinics: sales off the founder's desk" reads "Sales off the founder's desk".
  const cut = lead.test(t) ? t.replace(lead, "").replace(/^[a-z]/, (c) => c.toUpperCase()) : t;
  return cut
    .replace(new RegExp(`\\b${esc(n)}('s)?\\b`, "gi"), (_m, pos: string | undefined) => (pos ? "the client's" : "the client"))
    // A sentence that now starts with "the client" starts with a capital.
    .replace(/(^|[.!?]\s+)the client/g, (_m, a: string) => `${a}The client`);
}

/** The company a case is from, by name, for the member's own case only (never sent while hidden). */
function nameOf(seed: Seed, s: State, c: EvidenceCase): string {
  if (!c.companyId) return "";
  return T.graph(seed, s).companies.get(c.companyId)?.name ?? "";
}

const outLine = (o: { k: string; was: string; now: string }) => `${o.k}: ${o.was} to ${o.now}`;

/** A case as a page shows it. */
export function caseLine(c: EvidenceCase, name: string, m?: { label: MatchLabel | null; same: string[]; diff: string[] }): CaseLine {
  const named = !!c.clientNamed && !!name;
  const client = named ? name : scrub(c.clientLabel || "A past client", name, false);
  const unit = (v: string, u?: string) => `${v}${u && !v.endsWith(u) ? (/^[%x]$/.test(u) ? u : ` ${u}`) : ""}`.trim();
  return {
    id: c.id,
    title: scrub(c.title || client, name, named),
    client,
    named,
    story: scrub(c.text, name, named),
    outs: (c.outcomes ?? [])
      .filter((o) => o && String(o.k ?? "").trim() && (String(o.before ?? "").trim() || String(o.after ?? "").trim()))
      .map((o) => ({ k: scrub(o.k, name, named), was: unit(scrub(o.before, name, named), o.unit), now: unit(scrub(o.after, name, named), o.unit) })),
    label: m?.label ?? null,
    same: m?.same ?? [],
    diff: m?.diff ?? [],
    src: `${c.seatId ? "From your seat" : "Your case"} · ${named ? "client named" : "client name hidden"}`,
  };
}

/**
 * One line of Proof a case: who the client was, what was done, and the numbers. One line a case,
 * so the proof block reads each as a bullet (library.ts fill).
 */
export function proofLine(l: CaseLine): string {
  const head = l.title && l.title !== l.client ? `${l.client}: ${l.title}` : l.client;
  const story = l.story ? ` ${/[.!?]$/.test(l.story) ? l.story : `${l.story}.`}` : "";
  const outs = l.outs.length ? ` ${l.outs.map(outLine).join("; ")}.` : "";
  return `${/[.!?]$/.test(head) ? head : `${head}.`}${story}${outs}`.replace(/\s+/g, " ").trim();
}
export const proofText = (lines: CaseLine[]) => lines.map(proofLine).join("\n");

const newest = (a: EvidenceCase, b: EvidenceCase) => String(b.updatedAt ?? "").localeCompare(String(a.updatedAt ?? ""));

/**
 * The member's ready cases for one company, closest first, each with its match: matchCompany's
 * ranking where it gives one, else its closest case first, then the rest newest first (unmatched).
 * Without a company: newest first, unmatched.
 */
export async function rankedCases(memberId: string, companyId: string | null, listed?: EvidenceCase[]): Promise<{ c: EvidenceCase; m: { label: MatchLabel | null; same: string[]; diff: string[] } }[]> {
  const ready = (listed ?? (await src.listCases(memberId))).filter((c) => c && c.status === "ready").sort(newest);
  const none = { label: null, same: [], diff: [] };
  if (!ready.length || !companyId) return ready.map((c) => ({ c, m: none }));
  const m: EvidenceMatch = await src.matchCompany(memberId, companyId);
  const byId = new Map(ready.map((c) => [c.id, c]));
  const out: { c: EvidenceCase; m: { label: MatchLabel | null; same: string[]; diff: string[] } }[] = [];
  const seen = new Set<string>();
  const put = (id: string, x: { label: MatchLabel | null; same: string[]; diff: string[] }) => {
    const c = byId.get(id);
    if (!c || seen.has(id)) return;
    seen.add(id);
    out.push({ c, m: { label: x.label, same: [...(x.same ?? [])], diff: [...(x.diff ?? [])] } });
  };
  if (m.ranked?.length) for (const r of m.ranked) put(r.caseId, r);
  else if (m.caseId) put(m.caseId, m);
  else if (ready.length === 1) put(ready[0].id, m);
  for (const c of ready) if (!seen.has(c.id)) out.push({ c, m: none });
  return out;
}

/** The cases Proof takes by itself: one or two whose match is Same or Close. Never a Different one, never one unmatched. */
export const autoPick = <X extends { m: { label: MatchLabel | null } }>(ranked: X[]) => ranked.filter((x) => x.m.label === "Same" || x.m.label === "Close").slice(0, PROOF_MAX);

/** The member's own cases, drafts and ready (lib/evidence listCases). */
export const casesOf = async (memberId: string): Promise<EvidenceCase[]> => (await src.listCases(memberId)).filter(Boolean);

/** The member's plan has Close now (the trial included; billing off: everything is open). */
export const closeOn = (s: State, memberId: string, nowMs = Date.now()) => T.closeNow(s, memberId, nowMs);

/** Lines for a member's cases, names looked up once. */
export async function linesFor(memberId: string, ranked: Awaited<ReturnType<typeof rankedCases>>): Promise<CaseLine[]> {
  if (!ranked.length) return [];
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  void memberId;
  return ranked.map(({ c, m }) => caseLine(c, nameOf(seed, s, c), m));
}

/**
 * Proof for one company, as a proposal starts: the closest one or two ready cases (Same or Close),
 * their ids, and the text. proofFor's words where it gives them; else the same cases, one line each.
 * Null when no case fits: Proof stays empty, and Merlin never writes one.
 */
export async function autoProof(memberId: string, companyId: string): Promise<{ ids: string[]; text: string } | null> {
  const picked = autoPick(await rankedCases(memberId, companyId));
  if (!picked.length) return null;
  const given = String((await src.proofFor(memberId, companyId)) ?? "").trim();
  const text = given || proofText(await linesFor(memberId, picked));
  return text ? { ids: picked.map((x) => x.c.id), text } : null;
}

/**
 * Proof from the cases the member picked (Swap case, Add a case): each must be one of their own
 * ready cases, at most two. The text, one line a case; "" for none (Proof left empty).
 */
export async function proofFromCases(memberId: string, raw: unknown): Promise<{ ids: string[]; text: string } | { error: string }> {
  if (!Array.isArray(raw) || raw.length > PROOF_MAX || raw.some((x) => typeof x !== "string")) return { error: `Pick up to ${PROOF_MAX} of your cases.` };
  const ids = [...new Set(raw as string[])];
  if (!ids.length) return { ids: [], text: "" };
  const ready = new Map((await src.listCases(memberId)).filter((c) => c?.status === "ready").map((c) => [c.id, c]));
  if (ids.some((id) => !ready.has(id))) return { error: "That case isn't ready in your Evidence Bank anymore. Open Evidence Bank to finish it." };
  const lines = await linesFor(memberId, ids.map((id) => ({ c: ready.get(id)!, m: { label: null, same: [], diff: [] } })));
  return { ids, text: proofText(lines) };
}

/** One company's closest case, as the column and the cards read it, or null with no ready case. */
async function closestOne(memberId: string, companyId: string, names: (c: EvidenceCase) => string, listed: EvidenceCase[]): Promise<ClosestRow | null> {
  const r = await rankedCases(memberId, companyId, listed);
  const top = r[0];
  // Only a Same or Close case is the closest evidence (as Proof takes it); a Different one reads as no close case.
  if (!top || (top.m.label !== "Same" && top.m.label !== "Close")) return null;
  const l = caseLine(top.c, names(top.c), top.m);
  return { label: top.m.label, same: l.same, diff: l.diff, caseId: l.id, title: l.title, ...(l.outs[0] ? { outcome: outLine(l.outs[0]) } : {}) };
}

/**
 * GET /api/evidence/closest?ids=: for the signed-in member, how many cases are ready and in
 * draft, and for each company asked (public ids, CLOSEST_MAX at most) its closest case. Off Close:
 * `on: false` and nothing else. Null signed out.
 */
export async function closestView(token: string | null, pubs: string[], nowMs = Date.now()): Promise<ClosestView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = memberByToken(seed, token, s);
  if (!me) return null;
  if (!closeOn(s, me.id, nowMs)) return { on: false, ready: 0, drafts: 0, rows: {} };
  const all = await src.listCases(me.id);
  const ready = all.filter((c) => c?.status === "ready").length;
  const drafts = all.filter((c) => c?.status === "draft").length;
  const rows: Record<string, ClosestRow> = {};
  const want = new Set(pubs.slice(0, CLOSEST_MAX));
  if (ready && want.size) {
    const g = T.graph(seed, s);
    const names = (c: EvidenceCase) => nameOf(seed, s, c);
    for (const c of g.companies.values()) {
      const pub = T.pubId(c.id);
      if (!want.has(pub)) continue;
      const row = await closestOne(me.id, c.id, names, all);
      if (row) rows[pub] = row;
    }
  }
  return { on: true, ready, drafts, rows };
}

/**
 * The cases a member chose to show on their Fractionals card (showOnCard, ready), client hidden
 * unless named: title and one outcome each, CARD_MAX at most. Only while they have Close.
 */
export async function cardCases(seed: Seed, s: State, memberId: string, nowMs = Date.now()): Promise<{ title: string; outcome?: string }[]> {
  if (!closeOn(s, memberId, nowMs)) return [];
  const cases = (await src.listCases(memberId)).filter((c) => c?.status === "ready" && c.showOnCard === true).sort(newest).slice(0, CARD_MAX);
  return cases.map((c) => {
    const l = caseLine(c, nameOf(seed, s, c));
    return { title: l.title, ...(l.outs[0] ? { outcome: outLine(l.outs[0]) } : {}) };
  });
}

export const evidenceWireInternals = {
  /** Tests: swap the helpers (null puts lib/evidence's back). */
  use(x: Partial<Src> | null) {
    src = x ? { ...REAL, ...x } : REAL;
  },
};
