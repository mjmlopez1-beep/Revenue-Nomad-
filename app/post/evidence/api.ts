/**
 * The thin client for Evidence Bank's route (app/api/evidence/route.ts, Builder A). Every call is a
 * POST { op, ... } to /api/evidence, as the proposals route works. Answers are read loosely: the
 * route's CaseView (client: { named, label, name? }, answers { problem, did, numbers }, the case's
 * words in text) or the F8 shape (clientNamed, clientLabel), so the merge only has to align names.
 *
 *   list()                          the member's cases, newest first (and the route's pick lists)
 *   save(input)                     a new case (no id) or a change to one; returns it
 *   remove(id)                      deletes one of theirs
 *   draftFromSeat(seatId)           the draft for a seat of theirs: the one there is, or a new one with
 *                                   the size, industry, revenue and dates filled in from the seat
 *   match(companyId)                how close each ready case is to one company (words only, free)
 *   toProof(caseId, proposalId)     puts the case in that proposal's Proof part
 *   card(id, on)                    shows it on the member's card in Fractionals, or not
 *
 * Nothing here spends a credit: Evidence Bank is part of Close, and none of its actions cost.
 * Errors come back as { error } in plain words, never thrown.
 */
import { errorText } from "../../ui/shared";
import { setPicks, type EvidenceCase, type EvidenceInput, type EvidenceMatch, type EvidenceOutcome } from "./types";

const URL = "/api/evidence";
const NETWORK = "We couldn't reach Merlin. Check your connection and try again.";

export type Fail = { error: string; upgrade?: string };
export const failed = (x: unknown): x is Fail => !!x && typeof x === "object" && typeof (x as Fail).error === "string";

type J = Record<string, unknown>;
async function post(op: string, body: J = {}): Promise<J | Fail> {
  try {
    const r = await fetch(URL, { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ op, ...body }) });
    const j = (await r.json().catch(() => ({}))) as J;
    if (!r.ok) return { error: errorText(r.status, j.error, "That didn't go through. Try again."), ...(typeof j.upgrade === "string" ? { upgrade: j.upgrade } : {}) };
    return Array.isArray(j) ? { list: j } : j;
  } catch {
    return { error: NETWORK };
  }
}

const str = (x: unknown) => (typeof x === "string" ? x : "");
const strs = (x: unknown) => (Array.isArray(x) ? x.filter((v): v is string => typeof v === "string") : []);

/** A case off the wire, as the page reads it: the route's CaseView or the F8 shape. */
export function fromWire(x: unknown): EvidenceCase | null {
  if (!x || typeof x !== "object") return null;
  const o = x as J;
  if (typeof o.id !== "string") return null;
  const cl = o.client && typeof o.client === "object" ? (o.client as J) : null;
  const ans = o.answers && typeof o.answers === "object" ? (o.answers as J) : null;
  return {
    id: o.id,
    status: o.status === "ready" ? "ready" : "draft",
    ...(str(o.seatId) ? { seatId: str(o.seatId) } : {}),
    ...(str(o.companyId) ? { companyId: str(o.companyId) } : {}),
    clientNamed: cl ? cl.named === true : o.clientNamed === true,
    clientLabel: cl ? str(cl.label) : str(o.clientLabel),
    ...(str(cl?.name ?? o.clientName) ? { clientName: str(cl?.name ?? o.clientName) } : {}),
    title: str(o.title),
    size: str(o.size),
    revenue: str(o.revenue),
    motion: str(o.motion),
    industry: str(o.industry),
    soldTo: str(o.soldTo),
    problems: strs(o.problems),
    workType: strs(o.workType),
    outcomes: (Array.isArray(o.outcomes) ? o.outcomes : []).filter((v): v is EvidenceOutcome => !!v && typeof (v as J).k === "string").map((v) => ({ k: v.k, before: str(v.before), after: str(v.after), ...(str(v.unit) ? { unit: str(v.unit) } : {}) })),
    workedWith: (Array.isArray(o.workedWith) ? o.workedWith : []).filter((v): v is { title: string } => !!v && typeof (v as J).title === "string"),
    // The route keeps the three answers apart and its own words for the case in text; F8 has text only.
    text: ans ? str(ans.did) : str(o.text),
    ...(ans && str(ans.problem) ? { problemText: str(ans.problem) } : {}),
    ...(ans && str(o.text) ? { reads: str(o.text) } : {}),
    showOnCard: o.showOnCard === true,
    usedIn: strs(o.usedIn),
    createdAt: str(o.createdAt),
    updatedAt: str(o.updatedAt),
    ...(str(o.role) ? { role: str(o.role) } : {}),
    ...(str(o.dates) ? { dates: str(o.dates) } : {}),
    ...(str(o.hours) ? { hours: str(o.hours) } : {}),
  };
}
const caseOf = (j: J): EvidenceCase | null => fromWire(j.case ?? j.evidence ?? j);

/** The numbers as words, for the route's third answer: "Win rate went from 22% to 31%." */
const numberWords = (xs: readonly EvidenceOutcome[]) => xs.map((o) => `${o.k} went from ${o.before || "not measured"} to ${o.after || "not measured"}${o.unit ? ` ${o.unit}` : ""}.`).join(" ");

/** The member's cases. The route's tags and problems, when it sends them, become the page's pick lists. */
export async function list(): Promise<EvidenceCase[] | Fail> {
  const j = await post("list");
  if (failed(j)) return j;
  const tags = j.tags && typeof j.tags === "object" ? (j.tags as { categories?: unknown; tags?: unknown }) : null;
  if (tags && Array.isArray(tags.tags)) {
    const cats = strs(tags.categories);
    const by = new Map<string, string[]>(cats.map((k) => [k, []]));
    for (const t of tags.tags as { name?: unknown; category?: unknown }[]) {
      const k = str(t?.category);
      const n = str(t?.name);
      if (!k || !n) continue;
      if (!by.has(k)) by.set(k, []);
      by.get(k)!.push(n);
    }
    setPicks({ tags: [...by].map(([cat, ts]) => ({ cat, tags: ts })), problems: strs(j.problems) });
  } else if (Array.isArray(j.problems)) setPicks({ problems: strs(j.problems) });
  const xs = (j.cases ?? j.list ?? j.evidence ?? []) as unknown;
  return Array.isArray(xs) ? xs.map(fromWire).filter((c): c is EvidenceCase => !!c) : [];
}

/**
 * Save: the fields go as the route takes them. The page's text (what you did) is the route's
 * answers.did, the problems its answers.problem, the numbers its answers.numbers in words; the
 * case's own words are left to Merlin's template.
 */
export async function save(input: EvidenceInput & { problemText?: string }): Promise<EvidenceCase | Fail> {
  const { text, problemText, outcomes, seatId: _s, companyId: _c, ...rest } = input;
  const answers: J = {};
  if (text !== undefined) answers.did = text;
  if (problemText !== undefined || input.problems) answers.problem = problemText ?? (input.problems ?? []).map((x) => x.replace(/[.\s]+$/, "")).join(". ");
  if (outcomes) answers.numbers = numberWords(outcomes);
  const j = await post("save", { ...rest, ...(outcomes ? { outcomes } : {}), ...(Object.keys(answers).length ? { answers } : {}) });
  if (failed(j)) return j;
  return caseOf(j) ?? { error: "That didn't save. Try again." };
}

export async function remove(id: string): Promise<{ ok: true } | Fail> {
  const j = await post("remove", { id });
  return failed(j) ? j : { ok: true };
}

export async function draftFromSeat(seatId: string): Promise<EvidenceCase | Fail> {
  const j = await post("draftFromSeat", { seatId });
  if (failed(j)) return j;
  return caseOf(j) ?? { error: "Merlin couldn't start a case from that seat. Try again." };
}

/** How close each ready case is to one company: the route's MatchView ({ cases }) or a plain list. */
export async function match(companyId: string, caseIds?: string[]): Promise<EvidenceMatch[] | Fail> {
  const j = await post("match", { companyId, ...(caseIds ? { caseIds } : {}) });
  if (failed(j)) return j;
  const xs = (j.cases ?? j.matches ?? j.results ?? j.list ?? []) as unknown;
  if (!Array.isArray(xs)) return [];
  return xs
    .filter((m): m is J => !!m && typeof (m as J).caseId === "string" && ["Same", "Close", "Different"].includes(str((m as J).label)))
    .map((m) => ({ caseId: str(m.caseId), label: str(m.label) as EvidenceMatch["label"], same: strs(m.same), diff: strs(m.diff) }));
}

/** Put a ready case in one proposal's Proof part. */
export async function toProof(caseId: string, proposalId: string): Promise<{ ok: true } | Fail> {
  const j = await post("toProof", { caseIds: [caseId], proposalId });
  return failed(j) ? j : { ok: true };
}

/** Show a ready case on the member's card, or take it off. */
export async function card(id: string, on: boolean): Promise<{ ok: true } | Fail> {
  const j = await post("card", { id, on });
  return failed(j) ? j : { ok: true };
}

/** A proposal as Where it is used reads it: from GET /api/proposals (lib/proposals/store.ts), the member's own. */
export interface ProposalLine {
  id: string;
  title: string;
  company: string;
  status: string;
}
export async function proposals(): Promise<ProposalLine[] | Fail> {
  try {
    const r = await fetch("/api/proposals", { headers: { accept: "application/json" } });
    const j = (await r.json().catch(() => ({}))) as { proposals?: { id: string; title: string; status: string; company?: { name?: string } }[]; error?: unknown };
    if (!r.ok) return { error: errorText(r.status, j.error, "Proposals didn't load.") };
    return (j.proposals ?? []).map((p) => ({ id: p.id, title: p.title, company: p.company?.name ?? "", status: p.status }));
  } catch {
    return { error: NETWORK };
  }
}

/**
 * Draft on seat add: a seat that arrives while the member is on Your seats (a confirmed guess, an
 * Add) starts its draft case, for Close members only. Quiet: a failure here costs nothing, and the
 * seat's "Finish its evidence case" starts the same draft again when pressed. Resolves with the
 * seats it asked for, once their drafts are in.
 */
const asked = new Set<string>();
export async function draftNewSeats(before: ReadonlySet<string>, now: readonly string[], close: boolean): Promise<string[]> {
  if (!close) return [];
  const fresh = now.filter((id) => !before.has(id) && !asked.has(id));
  for (const id of fresh) asked.add(id);
  await Promise.all(fresh.map((id) => draftFromSeat(id)));
  return fresh;
}
