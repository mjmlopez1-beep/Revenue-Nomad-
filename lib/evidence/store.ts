/**
 * Evidence Bank on the server (F8): a member's own cases in State.evidence[memberId], changed only
 * through lib/table.ts mutate (one writer, in order). Close only (lib/billing/rules.ts canClose,
 * the trial counts): without it every write, match and proof is refused with the upgrade link
 * (403), and the list says only how many cases are kept. What a member made stays stored and comes
 * back on Close.
 *
 * The privacy rules are in lib/evidence/types.ts. In short: a case is its member's alone, the
 * client is hidden unless they name it (its name never leaves the server then, and the words are
 * scrubbed of it on the way out), internal ids never leave the server, numbers only as typed.
 *
 * Helpers for the other parts of Merlin (the proposal's Proof part, the Companies column, the
 * company page, Hiring now, the Fractionals card): listCases, matchCompany, proofFor and cardFor
 * (async, by member id), and casesIn, proofIn, matchIn, markUsedIn, cardIn on a state already in
 * hand (inside mutate, say). All of them answer hidden-client-safe.
 */
import { randomBytes } from "crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, viewPatch, type Member, type Seed, type State } from "../table";
import { FUNCTIONS, currentValue } from "../tableFields";
import { toStandard } from "../industryMap";
import { PRICES } from "../billing/rules";
import { upgradeUrl } from "../plan";
import { publicBase } from "../links";
import { aiConfigured } from "../proposals/aiConfig";
import { AI_PACK_LINK, budgetOf, chargeIn, usedUpWords } from "../proposals/aiUsage";
import type { Cell } from "../tableTypes";
import { AI_CONSENT_CASE, AiCaseProblem, caseText, clientLabelOf, clientSpellings, cleanAnswer, draftTitle, numbersOk, parseOutcomes, scrubClient, whoOf, writeWithAi } from "./draft";
import { caseMotionOf, rankCases, scoreCase, type CompanyFacts } from "./match";
import { allTags, cleanTags, fitTags, suggestTags } from "./tags";
import {
  CASE_MOTIONS,
  EVIDENCE_LIMITS as L,
  EvidenceProblem,
  FULL,
  NOT_READY,
  NOT_YOURS,
  ONLY_READY,
  PROBLEMS,
  SEAT_NOT_YOURS,
  datesOf,
  type CaseAnswers,
  type CaseMatch,
  type CaseView,
  type EvidenceCase,
  type EvidenceList,
  type EvidenceState,
  type MatchRows,
  type MatchView,
  type Outcome,
  type ProofItem,
} from "./types";

export { EvidenceProblem };

export const CLOSE_EVIDENCE = `Evidence Bank is on Close: $${PRICES.closeMonth} a month, or $${PRICES.closeYear} a year. Your cases are kept, and come back when you upgrade.`;
export const AI_OFF_CASE = "Writing with Merlin isn't switched on. Merlin joins your answers into the case instead.";
export const AI_BUSY_CASE = "Merlin is writing a case for you already. Wait for it, then try the next one.";
export const LABEL_NAMES = "Keep the client's name out of how it reads while hidden.";

const now = (ms: number) => new Date(ms).toISOString();
const newId = () => `ev_${randomBytes(9).toString("base64url")}`;
const base = (origin?: string) => (publicBase() ?? origin ?? "").replace(/\/$/, "");

/* ---------- state and gates ---------- */

const allOf = (s: State): EvidenceState => (s.evidence ??= {});
/** A member's cases as stored (the array itself: change it only inside mutate). */
const mineIn = (s: State, memberId: string): EvidenceCase[] => s.evidence?.[memberId] ?? [];

/** Close features are open to this member now (the trial counts). */
export const evidenceOpen = (s: State, memberId: string, nowMs = Date.now()) => T.closeNow(s, memberId, nowMs);
function gate(s: State, memberId: string, nowMs: number, origin?: string): void {
  if (!T.closeNow(s, memberId, nowMs)) throw new EvidenceProblem(CLOSE_EVIDENCE, 403, upgradeUrl(base(origin), "evidence"));
}
function meOf(seed: Seed, s: State, token: string | null): Member {
  const me = memberByToken(seed, token, s);
  if (!me) throw new EvidenceProblem("You're signed out. Sign in again to see your Evidence Bank.", 401);
  return me;
}

/* ---------- public ids and a company's free facts ---------- */

type Graph = ReturnType<typeof T.graph>;
type Eng = Graph["engagements"] extends Map<string, infer E> ? E : never;
const pubMaps = new WeakMap<Graph, { companies: Map<string, string>; seats: Map<string, string>; engsByCompany: Map<string, Eng[]> }>();
function mapsOf(g: Graph) {
  let m = pubMaps.get(g);
  if (!m) {
    const companies = new Map<string, string>();
    for (const id of g.companies.keys()) companies.set(T.pubId(id), id);
    const seats = new Map<string, string>();
    const engsByCompany = new Map<string, Eng[]>();
    for (const e of g.engagements.values()) {
      seats.set(T.pubId(e.id), e.id);
      const l = engsByCompany.get(e.companyId);
      if (l) l.push(e);
      else engsByCompany.set(e.companyId, [e]);
    }
    m = { companies, seats, engsByCompany };
    pubMaps.set(g, m);
  }
  return m;
}
/** A company's internal id from its public id (what the app and the connector send), or null. */
export function companyIdOf(seed: Seed, s: State, pub: unknown): string | null {
  return typeof pub === "string" && pub ? mapsOf(T.graph(seed, s)).companies.get(pub) ?? null : null;
}

const FOUNDER_REASON = "Move off founder-led sales";
const FOUNDER_WHY = "Founder-led sales ceiling";
/**
 * A company's free facts and signals, read from the table as every member sees them free
 * (industry, size, revenue, motion; each seat's function, status, why they hired and why now; open
 * roles). Never a name, a rate, a role title or who held a seat. Null for a company not on file.
 */
export function companyFactsIn(seed: Seed, s: State, companyId: string): CompanyFacts | null {
  const g = T.graph(seed, s);
  const c = g.companies.get(companyId);
  if (!c) return null;
  const v = (f: string) => {
    const x = T.live(c, s, f);
    return x ? currentValue(f, x) : "";
  };
  const tracks = T.tracksOf(seed, s);
  const reasons = new Set<string>();
  const openFns = new Set<string>();
  const endedFns = new Set<string>();
  let founderLed = false;
  for (const e of mapsOf(g).engsByCompany.get(companyId) ?? []) {
    const fn = T.live(e, s, "function") ?? "";
    const reason = T.live(e, s, "reason");
    const why = T.live(e, s, "whyNow") ?? "";
    if (reason) reasons.add(reason);
    if (reason === FOUNDER_REASON || why.split(/,\s*/).includes(FOUNDER_WHY)) founderLed = true;
    if (T.isOpenRole(e, s, tracks)) {
      if (fn) openFns.add(fn);
    } else if (fn && T.live(e, s, "status") === "Ended") endedFns.add(fn);
  }
  return { industry: v("industry"), size: v("employees"), revenue: v("revenue"), motion: v("motion"), founderLed, reasons: [...reasons].sort(), openFns: [...openFns].sort(), endedFns: [...endedFns].sort() };
}

/* ---------- what leaves the server ---------- */

const spellingsOf = (c: EvidenceCase) => clientSpellings(c.clientName, c.clientSite);
/** A case's words as they may go out: as they are when the client is named, else scrubbed of its name and website. */
export const safeText = (c: EvidenceCase, t: string) => (c.clientNamed ? t : scrubClient(t, spellingsOf(c)));

/** A case for its own member's page. `reveal`: the client's name too, for the member's own eye (never through the connector). */
export function caseView(c: EvidenceCase, reveal = false): CaseView {
  const safe = (t: string) => safeText(c, t);
  const showName = !!c.clientName && (c.clientNamed || reveal);
  const out = (t: string) => (reveal ? t : safe(t));
  return {
    id: c.id,
    status: c.status,
    seatId: c.seatId ? T.pubId(c.seatId) : null,
    companyId: c.companyId ? T.pubId(c.companyId) : null,
    client: { named: c.clientNamed, label: c.clientLabel, ...(showName ? { name: c.clientName } : {}) },
    title: out(c.title),
    role: c.role,
    fn: c.fn,
    start: c.start,
    end: c.end,
    dates: datesOf(c.start, c.end),
    hours: c.hours,
    size: c.size,
    revenue: c.revenue,
    motion: c.motion,
    industry: c.industry,
    soldTo: out(c.soldTo),
    problems: c.problems.map(out),
    workType: [...c.workType],
    outcomes: c.outcomes.map((o) => ({ ...o, k: out(o.k) })),
    workedWith: c.workedWith.map((w) => ({ title: out(w.title) })),
    answers: { problem: out(c.answers.problem), did: out(c.answers.did), numbers: out(c.answers.numbers) },
    answered: { problem: !!c.answers.problem, did: !!c.answers.did, numbers: !!c.answers.numbers },
    text: out(c.text),
    textBy: c.textBy,
    showOnCard: c.showOnCard,
    usedIn: [...c.usedIn],
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** A ready case as it goes into a proposal or onto a card: the client's name only when named. */
export function proofItem(c: EvidenceCase, match?: CaseMatch): ProofItem {
  return {
    caseId: c.id,
    title: safeText(c, c.title),
    client: whoOf(c),
    named: c.clientNamed && !!c.clientName,
    text: safeText(c, c.text),
    outcomes: c.outcomes.map((o) => ({ ...o, k: safeText(c, o.k) })),
    workType: [...c.workType],
    ...(match ? { match } : {}),
  };
}

/* ---------- cleaning what comes in ---------- */

const line = (raw: unknown, max: number) => cleanAnswer(raw, max).replace(/\s*\n\s*/g, " ");
const list = (raw: unknown, max: number = L.list, each: number = L.item): string[] => {
  const out: string[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const t = line(x, each);
    if (t && !out.some((y) => y.toLowerCase() === t.toLowerCase())) out.push(t);
    if (out.length >= max) break;
  }
  return out;
};
const month = (raw: unknown): string => {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  if (/^ongoing$/i.test(t)) return "Ongoing";
  if (/^\d{4}(-(0[1-9]|1[0-2]))?$/.test(t)) return t;
  throw new EvidenceProblem("Give the month like 2024-02, or Ongoing.");
};
const band = (field: "industry" | "employees" | "revenue", raw: unknown): string => {
  const t = String(raw ?? "").trim();
  if (!t) return "";
  const v = toStandard(field, t);
  if (!v) throw new EvidenceProblem(field === "industry" ? "Pick the industry from the list." : field === "employees" ? "Pick the company size from the list." : "Pick the revenue range from the list.");
  return v;
};
function outcomesOf(raw: unknown): Outcome[] {
  const out: Outcome[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const o = (x && typeof x === "object" ? x : {}) as Record<string, unknown>;
    const k = line(o.k, L.outcomeKey);
    const before = line(o.before, L.outcomeValue);
    const after = line(o.after, L.outcomeValue);
    const unit = line(o.unit, 20);
    if (!k && !before && !after) continue;
    if (!k || (!before && !after)) throw new EvidenceProblem("Each number needs what it measured and the before or the after.");
    out.push({ k, before, after, ...(unit ? { unit } : {}) });
    if (out.length >= L.outcomes) break;
  }
  return out;
}
function workedWithOf(raw: unknown): { title: string }[] {
  const out: { title: string }[] = [];
  for (const x of Array.isArray(raw) ? raw : []) {
    const t = line(typeof x === "string" ? x : (x as { title?: unknown })?.title, L.short);
    if (!t) continue;
    if (/@|https?:\/\//i.test(t)) throw new EvidenceProblem("Who you worked with is titles only, like CEO or 4 account executives.");
    out.push({ title: t });
    if (out.length >= L.workedWith) break;
  }
  return out;
}

/** What a save may change. Everything else on a case is Merlin's. */
const PATCH_KEYS = ["title", "clientNamed", "clientName", "clientLabel", "role", "fn", "start", "end", "hours", "size", "revenue", "motion", "industry", "soldTo", "problems", "workType", "outcomes", "workedWith", "answers", "text", "showOnCard", "status"] as const;

/** Apply a save's fields to a case (in place), keeping the rules. Throws EvidenceProblem. */
function applyPatch(c: EvidenceCase, p: Record<string, unknown>, nowIso: string): void {
  const has = (k: string) => Object.prototype.hasOwnProperty.call(p, k) && p[k] !== undefined;
  const autoLabel = c.clientLabel === clientLabelOf(c);
  const before = { named: c.clientNamed, name: c.clientName, label: c.clientLabel, answers: { ...c.answers }, outcomes: JSON.stringify(c.outcomes) };
  if (has("title")) c.title = line(p.title, L.title);
  if (has("clientNamed")) c.clientNamed = p.clientNamed === true;
  if (has("clientName")) {
    const n = line(p.clientName, L.clientName);
    if (n) c.clientName = n;
    else delete c.clientName;
  }
  if (has("role")) c.role = line(p.role, L.short);
  if (has("fn")) {
    const f = String(p.fn ?? "").trim();
    if (f && !FUNCTIONS.includes(f)) throw new EvidenceProblem("Pick the function from the list.");
    c.fn = f;
  }
  if (has("start")) c.start = month(p.start);
  if (has("end")) c.end = month(p.end);
  if (has("hours")) {
    const h = String(p.hours ?? "").trim();
    if (h && !/^\d{1,2}(\.\d)?$/.test(h)) throw new EvidenceProblem("Give the hours a week as a number, like 12.");
    c.hours = h;
  }
  if (has("industry")) c.industry = band("industry", p.industry);
  if (has("size")) c.size = band("employees", p.size);
  if (has("revenue")) c.revenue = band("revenue", p.revenue);
  if (has("motion")) {
    const m = String(p.motion ?? "").trim();
    if (m && !(CASE_MOTIONS as readonly string[]).includes(m)) throw new EvidenceProblem(`Pick how they sold: ${CASE_MOTIONS.join(", ")}.`);
    c.motion = m;
  }
  if (has("soldTo")) c.soldTo = line(p.soldTo, L.short);
  if (has("problems")) c.problems = list(p.problems);
  if (has("workType")) c.workType = cleanTags(p.workType);
  if (has("workedWith")) c.workedWith = workedWithOf(p.workedWith);
  if (has("answers")) {
    const a = (p.answers && typeof p.answers === "object" ? p.answers : {}) as Record<string, unknown>;
    for (const k of ["problem", "did", "numbers"] as const) if (a[k] !== undefined) c.answers[k] = cleanAnswer(a[k]);
  }
  if (has("outcomes")) c.outcomes = outcomesOf(p.outcomes);
  else if (c.answers.numbers !== before.answers.numbers) c.outcomes = parseOutcomes(c.answers.numbers).outcomes;
  // How it reads while hidden: Merlin's from the facts until the member writes their own, and never with the name in it.
  if (has("clientLabel")) {
    const l = line(p.clientLabel, L.label);
    c.clientLabel = l || clientLabelOf(c);
  } else if (autoLabel) c.clientLabel = clientLabelOf(c);
  if (scrubClient(c.clientLabel, spellingsOf(c)) !== c.clientLabel) throw new EvidenceProblem(LABEL_NAMES);
  // The text: the member's own words stay; otherwise it follows the answers.
  if (has("text")) {
    const t = cleanAnswer(p.text, L.text);
    c.text = t || caseText(c);
    c.textBy = t ? "member" : "template";
  } else if (
    c.textBy !== "member" &&
    (c.clientNamed !== before.named || c.clientName !== before.name || c.clientLabel !== before.label || JSON.stringify(c.answers) !== JSON.stringify(before.answers) || JSON.stringify(c.outcomes) !== before.outcomes || !c.text)
  ) {
    c.text = caseText(c);
    c.textBy = "template";
  }
  if (!c.title) c.title = draftTitle(c.role, datesOf(c.start, c.end));
  if (has("status")) {
    if (p.status !== "ready" && p.status !== "draft") throw new EvidenceProblem("A case is a draft or ready.");
    c.status = p.status;
  }
  if (c.status === "ready" && (!c.answers.problem || !c.answers.did)) throw new EvidenceProblem(NOT_READY);
  if (has("showOnCard")) c.showOnCard = p.showOnCard === true;
  if (c.showOnCard && c.status !== "ready") throw new EvidenceProblem(ONLY_READY);
  c.updatedAt = nowIso;
}

const blank = (id: string, nowIso: string): EvidenceCase => ({
  id,
  status: "draft",
  clientNamed: false,
  clientLabel: "A client company",
  title: "",
  role: "",
  fn: "",
  start: "",
  end: "",
  hours: "",
  size: "",
  revenue: "",
  motion: "",
  industry: "",
  soldTo: "",
  problems: [],
  workType: [],
  outcomes: [],
  workedWith: [],
  answers: { problem: "", did: "", numbers: "" },
  text: "",
  textBy: "template",
  showOnCard: false,
  usedIn: [],
  createdAt: nowIso,
  updatedAt: nowIso,
});

/* ---------- the member's own: list, save, remove ---------- */

const aiState = (s: State, memberId: string) => ({ on: aiConfigured() && T.closeNow(s, memberId), agreed: !!s.evidenceAi?.[memberId] });

/** GET /api/evidence: the member's cases, newest first. Without Close: the words, the link and how many are kept. */
export async function listEvidence(token: string | null, o: { reveal?: boolean; origin?: string } = {}, nowMs = Date.now()): Promise<EvidenceList> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = meOf(seed, s, token);
  const mine = mineIn(s, me.id);
  const tags = { categories: fitTags().categories.map((c) => c.name), tags: allTags() };
  const common = { limit: L.cases, tags, problems: [...PROBLEMS], motions: [...CASE_MOTIONS], ai: aiState(s, me.id) };
  if (!T.closeNow(s, me.id, nowMs)) return { canUse: false, plan: CLOSE_EVIDENCE, upgrade: upgradeUrl(base(o.origin), "evidence"), kept: mine.length, cases: [], ...common, tags: { categories: tags.categories, tags: [] }, ai: { on: false, agreed: common.ai.agreed } };
  const cases = [...mine].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : 0)).map((c) => caseView(c, !!o.reveal));
  return { canUse: true, kept: mine.length, cases, ...common };
}

/** The fit tag picker: the categories with their groups and tags (never the taxonomy's sources or role documents). Close, like the page. */
export async function tagPicker(token: string | null, o: { origin?: string } = {}, nowMs = Date.now()) {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  gate(s, meOf(seed, s, token).id, nowMs, o.origin);
  return fitTags();
}
/** The fit tags a "What did you do?" answer names (Merlin's rules, no AI). Close. */
export async function suggestFor(token: string | null, text: unknown, o: { origin?: string } = {}, nowMs = Date.now()) {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  gate(s, meOf(seed, s, token).id, nowMs, o.origin);
  return { tags: suggestTags(typeof text === "string" ? text.slice(0, 4000) : "") };
}

/** Save a case: a new one (no id), or changes to one of theirs. Close. */
export async function saveCase(token: string | null, input: Record<string, unknown>, o: { origin?: string } = {}, nowMs = Date.now()): Promise<CaseView> {
  const id = typeof input.id === "string" ? input.id : "";
  const patch = Object.fromEntries(PATCH_KEYS.filter((k) => k in input).map((k) => [k, input[k]]));
  return T.mutate((s, seed) => {
    const me = meOf(seed, s, token);
    gate(s, me.id, nowMs, o.origin);
    const all = allOf(s);
    const mine = (all[me.id] ??= []);
    let c = id ? mine.find((x) => x.id === id) : undefined;
    if (id && !c) throw new EvidenceProblem(NOT_YOURS, 404);
    if (!c) {
      if (mine.length >= L.cases) throw new EvidenceProblem(FULL, 409);
      c = blank(newId(), now(nowMs));
      const work = structuredClone(c);
      applyPatch(work, patch, now(nowMs));
      mine.push(work);
      return caseView(work);
    }
    // Changed on a copy: a refusal leaves the stored case as it was.
    const work = structuredClone(c);
    applyPatch(work, patch, now(nowMs));
    Object.assign(c, work);
    return caseView(c);
  });
}

/**
 * What a save would make, without saving: the case as it would read (the connector's
 * save_evidence_case shows it to the member first). The same checks as saveCase. Close.
 */
export async function previewCase(token: string | null, input: Record<string, unknown>, o: { origin?: string } = {}, nowMs = Date.now()): Promise<{ case: EvidenceCase; isNew: boolean }> {
  const id = typeof input.id === "string" ? input.id : "";
  const patch = Object.fromEntries(PATCH_KEYS.filter((k) => k in input).map((k) => [k, input[k]]));
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = meOf(seed, s, token);
  gate(s, me.id, nowMs, o.origin);
  const mine = mineIn(s, me.id);
  const c = id ? mine.find((x) => x.id === id) : undefined;
  if (id && !c) throw new EvidenceProblem(NOT_YOURS, 404);
  if (!c && mine.length >= L.cases) throw new EvidenceProblem(FULL, 409);
  const work = structuredClone(c ?? blank("ev_new", now(nowMs)));
  applyPatch(work, patch, now(nowMs));
  return { case: work, isNew: !c };
}

/** A member's case by id, as stored, on a state in hand (the connector's projection reads it). */
export const caseIn = (s: State, memberId: string, id: string): EvidenceCase | null => mineIn(s, memberId).find((c) => c.id === id) ?? null;

/** Remove one of their cases. */
export async function removeCase(token: string | null, id: unknown, o: { origin?: string } = {}, nowMs = Date.now()): Promise<{ ok: true }> {
  return T.mutate((s, seed) => {
    const me = meOf(seed, s, token);
    gate(s, me.id, nowMs, o.origin);
    const mine = mineIn(s, me.id);
    const k = mine.findIndex((x) => x.id === id);
    if (k < 0) throw new EvidenceProblem(NOT_YOURS, 404);
    mine.splice(k, 1);
    if (!mine.length) delete s.evidence![me.id];
    return { ok: true as const };
  });
}

/* ---------- a draft from a seat they held ---------- */

const cellText = (c: Cell | undefined) => (c?.s === "value" ? String((c as { v: unknown }).v ?? "").trim() : "");

/**
 * A draft case from a seat the member held ("yours" on their table): the company's size, revenue,
 * industry and motion, the role, function, dates, hours and why they hired, filled from the seat.
 * The same seat twice gives the draft already made. Close.
 */
export async function draftFromSeat(token: string | null, seatId: unknown, o: { origin?: string } = {}, nowMs = Date.now()): Promise<CaseView> {
  const pub = typeof seatId === "string" ? seatId : "";
  const [seed, s0] = await Promise.all([loadSeed(), loadState()]);
  const me0 = meOf(seed, s0, token);
  gate(s0, me0.id, nowMs, o.origin);
  const engId = pub ? mapsOf(T.graph(seed, s0)).seats.get(pub) : undefined;
  if (!engId) throw new EvidenceProblem(SEAT_NOT_YOURS, 404);
  const had = mineIn(s0, me0.id).find((x) => x.seatId === engId);
  if (had) return caseView(had);
  // The seat as the member's own table shows it: only a seat that is theirs.
  const patch = await viewPatch(token, [pub], { asMember: true });
  const co = patch?.companies?.find((x) => x.engagements.some((e) => e.id === pub));
  const e = co?.engagements.find((x) => x.id === pub);
  if (!co || !e?.yours) throw new EvidenceProblem(SEAT_NOT_YOURS, 404);
  const companyId = T.graph(seed, s0).engagements.get(engId)?.companyId;
  const facts = companyId ? companyFactsIn(seed, s0, companyId) : null;
  const pick = (k: string) => cellText(e.cells[k]);
  const ind = cellText(co.cells.industry) || facts?.industry || "";
  const size = cellText(co.cells.employees) || pick("employees") || facts?.size || "";
  const rev = cellText(co.cells.revenue) || pick("revenue") || facts?.revenue || "";
  const motion = cellText(co.cells.motion) || facts?.motion || "";
  const reason = pick("reason");
  const why = pick("whyNow");
  const founder = reason === FOUNDER_REASON || why.split(/,\s*/).includes(FOUNDER_WHY);
  const caseMotion = founder ? "Founder-led" : caseMotionOf(motion);
  const role = pick("role");
  const fn = pick("function");
  const start = /^\d{4}(-\d{2})?$/.test(pick("start")) ? pick("start") : "";
  const endRaw = pick("end");
  const end = /^ongoing$/i.test(endRaw) ? "Ongoing" : /^\d{4}(-\d{2})?$/.test(endRaw) ? endRaw : pick("status") === "Active" ? "Ongoing" : "";
  const hours = /^\d{1,2}(\.\d)?$/.test(pick("hours")) ? pick("hours") : "";
  const name = co.hidden ? "" : co.name;
  const site = cellText(co.cells.website);
  return T.mutate((s, seedNow) => {
    const me = meOf(seedNow, s, token);
    gate(s, me.id, nowMs, o.origin);
    const mine = (allOf(s)[me.id] ??= []);
    const again = mine.find((x) => x.seatId === engId);
    if (again) return caseView(again);
    if (mine.length >= L.cases) throw new EvidenceProblem(FULL, 409);
    const c = blank(newId(), now(nowMs));
    Object.assign(c, {
      seatId: engId,
      ...(companyId ? { companyId } : {}),
      ...(name ? { clientName: name } : {}),
      ...(site ? { clientSite: site } : {}),
      role,
      fn: FUNCTIONS.includes(fn) ? fn : "",
      start,
      end,
      hours,
      industry: toStandard("industry", ind) ?? "",
      size: toStandard("employees", size) ?? "",
      revenue: toStandard("revenue", rev) ?? "",
      motion: caseMotion,
      problems: reason ? [reason] : [],
    });
    c.clientLabel = clientLabelOf(c);
    c.title = draftTitle(role, datesOf(start, end));
    // The first answer, seeded from why they hired, as the mockup's builder does; the member changes it.
    if (reason) c.answers.problem = `They brought me in to ${reason.charAt(0).toLowerCase()}${reason.slice(1)}.`;
    c.text = caseText(c);
    mine.push(c);
    return caseView(c);
  });
}

/* ---------- matching ---------- */

const readyOf = (s: State, memberId: string) => mineIn(s, memberId).filter((c) => c.status === "ready");

/** Ranked cases for one company (internal id), on a state in hand. Null when the company isn't on file. */
export function matchIn(seed: Seed, s: State, memberId: string, companyId: string): MatchView | null {
  const facts = companyFactsIn(seed, s, companyId);
  if (!facts) return null;
  const all = mineIn(s, memberId);
  const ready = all.filter((c) => c.status === "ready");
  return { companyId: T.pubId(companyId), cases: rankCases(ready, facts).map((r) => ({ ...r, title: safeText(ready.find((c) => c.id === r.caseId)!, r.title) })), skipped: all.length - ready.length };
}

/** The closest ready case for each company (public ids), for a list's column. A company not on file is null. */
export function matchRowsIn(seed: Seed, s: State, memberId: string, pubs: string[]): MatchRows {
  const ready = readyOf(s, memberId);
  const out: MatchRows = {};
  for (const pub of pubs.slice(0, L.matchRows)) {
    const id = companyIdOf(seed, s, pub);
    const facts = id ? companyFactsIn(seed, s, id) : null;
    const top = facts && ready.length ? rankCases(ready, facts)[0] : null;
    const c = top ? ready.find((x) => x.id === top.caseId)! : null;
    out[pub] = top && c ? { caseId: top.caseId, title: safeText(c, top.title), label: top.label, same: top.same, diff: top.diff } : null;
  }
  return out;
}

/** match: one company ({ companyId }) or a list's rows ({ companyIds }), by public id. Close; never costs a credit. */
export async function matchEvidence(token: string | null, a: { companyId?: unknown; companyIds?: unknown }, o: { origin?: string } = {}, nowMs = Date.now()): Promise<MatchView | { rows: MatchRows }> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = meOf(seed, s, token);
  gate(s, me.id, nowMs, o.origin);
  if (Array.isArray(a.companyIds)) return { rows: matchRowsIn(seed, s, me.id, a.companyIds.filter((x): x is string => typeof x === "string")) };
  const id = companyIdOf(seed, s, a.companyId);
  const m = id ? matchIn(seed, s, me.id, id) : null;
  if (!m) throw new EvidenceProblem("That company isn't on Merlin.", 404);
  return m;
}

/* ---------- the Proof part, and the card ---------- */

/**
 * The closest one or two ready cases for a company (internal id), as they go into a proposal's
 * Proof part: hidden-client-safe. Without a company, the newest ready ones. A Different case is
 * never offered for a company. Empty without Close. Call it on the committed state (loadState()),
 * not a draft inside mutate: it reads the table's graph, which is built once for the committed state.
 */
export function proofIn(seed: Seed, s: State, memberId: string, companyId: string | null | undefined, n = 2, nowMs = Date.now()): ProofItem[] {
  if (!T.closeNow(s, memberId, nowMs)) return [];
  const ready = readyOf(s, memberId);
  if (!ready.length) return [];
  const facts = companyId ? companyFactsIn(seed, s, companyId) : null;
  if (!facts) return [...ready].sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1)).slice(0, n).map((c) => proofItem(c));
  return rankCases(ready, facts)
    .filter((r) => r.label !== "Different")
    .slice(0, n)
    .map((r) => proofItem(ready.find((c) => c.id === r.caseId)!, { label: r.label, same: r.same, diff: r.diff }));
}

/** Note that these cases went into one of the member's proposals (call it inside mutate, with the proposal checked as theirs). */
export function markUsedIn(s: State, memberId: string, caseIds: string[], proposalId: string): void {
  for (const c of mineIn(s, memberId))
    if (caseIds.includes(c.id) && !c.usedIn.includes(proposalId)) {
      c.usedIn.push(proposalId);
      if (c.usedIn.length > L.usedIn) c.usedIn.splice(0, c.usedIn.length - L.usedIn);
    }
}
/** A proposal deleted: it leaves the cases' Used in. */
export function forgetProposalIn(s: State, memberId: string, proposalId: string): void {
  for (const c of mineIn(s, memberId)) c.usedIn = c.usedIn.filter((x) => x !== proposalId);
}

/**
 * toProof: the cases for a proposal's Proof part. caseIds: these (ready ones only); else the
 * closest one or two for companyId (public id). proposalId: one of theirs, and the cases are noted
 * as used in it. Close.
 */
export async function toProof(token: string | null, a: { companyId?: unknown; caseIds?: unknown; proposalId?: unknown }, o: { origin?: string } = {}, nowMs = Date.now()): Promise<{ items: ProofItem[] }> {
  // Read on the committed state (the table's graph is built once there), then only the note of use is written.
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = meOf(seed, s, token);
  gate(s, me.id, nowMs, o.origin);
  let items: ProofItem[];
  if (Array.isArray(a.caseIds)) {
    const want = a.caseIds.filter((x): x is string => typeof x === "string").slice(0, 6);
    const cases = want.map((id) => mineIn(s, me.id).find((c) => c.id === id));
    if (cases.some((c) => !c)) throw new EvidenceProblem(NOT_YOURS, 404);
    if (cases.some((c) => c!.status !== "ready")) throw new EvidenceProblem(ONLY_READY);
    items = cases.map((c) => proofItem(c!));
  } else {
    const id = a.companyId == null || a.companyId === "" ? null : companyIdOf(seed, s, a.companyId);
    if (a.companyId && !id) throw new EvidenceProblem("That company isn't on Merlin.", 404);
    items = proofIn(seed, s, me.id, id, 2, nowMs);
  }
  const proposalId = typeof a.proposalId === "string" ? a.proposalId : "";
  if (proposalId)
    await T.mutate((st, sd) => {
      const meNow = meOf(sd, st, token);
      if (!(st.proposals ?? []).some((p) => p.id === proposalId && p.memberId === meNow.id)) throw new EvidenceProblem("That proposal isn't one of yours.", 404);
      markUsedIn(st, meNow.id, items.map((x) => x.caseId), proposalId);
    });
  return { items };
}

/** The cases a member shows on their Fractionals card: ready, switched on, Close. Hidden-client-safe. Anyone may read these. */
export function cardIn(s: State, memberId: string, nowMs = Date.now()): ProofItem[] {
  if (!T.closeNow(s, memberId, nowMs)) return [];
  return readyOf(s, memberId)
    .filter((c) => c.showOnCard)
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1))
    .slice(0, 6)
    .map((c) => proofItem(c));
}

/** card: show one case on the member's card or take it off; the card as others will read it. Close. */
export async function setCard(token: string | null, id: unknown, on: unknown, o: { origin?: string } = {}, nowMs = Date.now()): Promise<{ card: ProofItem[] }> {
  return T.mutate((s, seed) => {
    const me = meOf(seed, s, token);
    gate(s, me.id, nowMs, o.origin);
    if (id !== undefined) {
      const c = mineIn(s, me.id).find((x) => x.id === id);
      if (!c) throw new EvidenceProblem(NOT_YOURS, 404);
      if (on === true && c.status !== "ready") throw new EvidenceProblem(ONLY_READY);
      c.showOnCard = on === true;
      c.updatedAt = now(nowMs);
    }
    return { card: cardIn(s, me.id, nowMs) };
  });
}

/* ---------- writing with Merlin's AI ---------- */

const writing = new Set<string>();

/** They agree that their answers (and anything they paste) go to Merlin's AI to write a case. */
export async function agreeToCaseAi(token: string | null, nowMs = Date.now()): Promise<{ ok: true }> {
  await T.mutate((s, seed) => {
    const me = meOf(seed, s, token);
    (s.evidenceAi ??= {})[me.id] ??= now(nowMs);
  });
  return { ok: true };
}

/**
 * write: Merlin's AI writes the case from its answers, and from a results email or notes the
 * member pastes (used for this request only, never kept). Only with the switch on, on Close,
 * after they agreed, and while their AI usage lasts. Every number it writes must be one they
 * typed or pasted: an answer or a text with any other number keeps the template's words.
 */
export async function writeCase(token: string | null, id: unknown, a: { paste?: unknown; agree?: unknown }, o: { origin?: string } = {}, nowMs = Date.now()): Promise<{ case: CaseView; kept: string[] }> {
  if (!aiConfigured()) throw new EvidenceProblem(AI_OFF_CASE, 409);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const me = meOf(seed, s, token);
  gate(s, me.id, nowMs, o.origin);
  const c0 = mineIn(s, me.id).find((x) => x.id === id);
  if (!c0) throw new EvidenceProblem(NOT_YOURS, 404);
  if (!s.evidenceAi?.[me.id]) {
    if (a.agree !== true) throw new EvidenceProblem(`${AI_CONSENT_CASE} Tick the box to agree, then try again.`, 428);
    await agreeToCaseAi(token, nowMs);
  }
  const budget = budgetOf(s, me.id, nowMs);
  if (!budget.open) throw new EvidenceProblem(usedUpWords(nowMs, budget.trial), 402, AI_PACK_LINK);
  // Read here and dropped when this returns. Never logged or kept.
  const paste = cleanAnswer(a.paste, 20_000);
  if (!paste && !c0.answers.problem && !c0.answers.did && !c0.answers.numbers) throw new EvidenceProblem("Answer a question first, or paste a results email or your notes.");
  if (writing.has(me.id)) throw new EvidenceProblem(AI_BUSY_CASE, 409);
  writing.add(me.id);
  try {
    const dates = datesOf(c0.start, c0.end);
    let r;
    try {
      // A hidden client's name never goes out: the answers go scrubbed of it, as they read anywhere else.
      r = await writeWithAi({ client: whoOf(c0), role: c0.role, dates, answers: { problem: safeText(c0, c0.answers.problem), did: safeText(c0, c0.answers.did), numbers: safeText(c0, c0.answers.numbers) }, paste: paste ? safeText(c0, paste) : undefined });
    } catch (e) {
      if (e instanceof AiCaseProblem) throw new EvidenceProblem(e.message, e.status);
      throw e;
    }
    const sources = [c0.answers.problem, c0.answers.did, c0.answers.numbers, paste, c0.clientLabel, dates, c0.hours, c0.role];
    const kept: string[] = [];
    return await T.mutate((st, sd) => {
      const meNow = meOf(sd, st, token);
      const c = mineIn(st, meNow.id).find((x) => x.id === id);
      if (!c) throw new EvidenceProblem(NOT_YOURS, 404);
      const answers: CaseAnswers = { ...c.answers };
      for (const k of ["problem", "did", "numbers"] as const) {
        const v = cleanAnswer(r.out[k]);
        if (!v) continue;
        if (numbersOk(v, sources)) answers[k] = safeText(c, v);
        else kept.push(k);
      }
      const work = structuredClone(c);
      applyPatch(work, { answers }, now(nowMs));
      const text = cleanAnswer(r.out.text, L.text);
      if (text && numbersOk(text, sources) && work.textBy !== "member") {
        work.text = safeText(work, text);
        work.textBy = "merlin";
      } else if (text) kept.push("text");
      const title = line(r.out.title, L.title);
      if (title && numbersOk(title, sources) && work.title === draftTitle(work.role, datesOf(work.start, work.end))) work.title = safeText(work, title);
      Object.assign(c, work);
      // Saved: now it costs what the API says it used.
      chargeIn(st, meNow.id, nowMs, r.usage);
      return { case: caseView(c), kept };
    });
  } finally {
    writing.delete(me.id);
  }
}

/* ---------- helpers for the rest of Merlin, by member id ---------- */

/** A member's cases (their own page's view, client hidden unless named), on a state in hand. */
export const casesIn = (s: State, memberId: string): CaseView[] => mineIn(s, memberId).map((c) => caseView(c));

/** A member's cases, client hidden unless named. */
export async function listCases(memberId: string): Promise<CaseView[]> {
  return casesIn(await loadState(), memberId);
}
/** A member's ready cases ranked for one company (public or internal id). Null without Close or for a company not on file. */
export async function matchCompany(memberId: string, companyId: string, nowMs = Date.now()): Promise<MatchView | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  if (!T.closeNow(s, memberId, nowMs)) return null;
  const id = T.graph(seed, s).companies.has(companyId) ? companyId : companyIdOf(seed, s, companyId);
  return id ? matchIn(seed, s, memberId, id) : null;
}
/** The closest one or two ready cases for a company (public or internal id), hidden-client-safe. Empty without Close. */
export async function proofFor(memberId: string, companyId: string | null, nowMs = Date.now()): Promise<ProofItem[]> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const id = companyId && T.graph(seed, s).companies.has(companyId) ? companyId : companyIdOf(seed, s, companyId);
  return proofIn(seed, s, memberId, id, 2, nowMs);
}
/** The member's card's cases, as any reader may see them. */
export async function cardFor(memberId: string, nowMs = Date.now()): Promise<ProofItem[]> {
  return cardIn(await loadState(), memberId, nowMs);
}
/** Tags the "What did you do?" answer names (Merlin's rules, no AI). */
export const tagsFor = (text: string) => suggestTags(text);

/** For tests. */
export const evidenceInternals = { companyFactsIn, scoreCase, mapsOf };
