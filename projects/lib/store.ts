// One store for the whole prototype. Every screen reads through the selectors and writes
// through the repository functions below, so a real API can replace localStorage later
// without touching screens (BUILD_BRIEF.md section 3).
//
// Writes always re-read localStorage first and listen for `storage` events, so two tabs
// never fork the data (QA O-14).

import { useEffect, useSyncExternalStore } from "react";
import type {
  AppEvent,
  Invite,
  InviteSource,
  Operator,
  OperatorState,
  OutboxEntry,
  OutboxLink,
  PipelineEntry,
  Project,
  Response,
  RnStage,
  Role,
  Session,
  State,
  WorkMark,
  WorkStatus,
} from "./types";
import {
  ADMIN,
  BUYERS,
  OPERATORS,
  SEED_PROJECTS,
  buyerById,
  completeness,
  defaultOperatorId,
  defaultOperatorState,
  displayName,
  normalizeCategory,
  operatorById,
  operatorEmail,
} from "./data";
import { briefFromProject, fitScore, seatOf, tierOf, type FitResult } from "./fit";
import { defaultBuyerProfile, type BuyerProfile } from "./company";
import { dayLabel, hoursRange, isoDay, shortDate } from "./format";

const VERSION = 3;
const KEY = "rnp:state:v1";
const SESSION_KEY = "rnp:session:v1";

/** Simulated clock starts Thursday Sep 24 2026, 2pm UTC. Every write moves it one minute. */
export const CLOCK_BASE = Date.UTC(2026, 8, 24, 14, 0, 0);
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
export const MAX_SUGGESTIONS = 3;
export const MAX_SCREENING = 5;

// ---------------------------------------------------------------- persistence

let memoryState: string | null = null;
let memorySession: string | null = null;
let cache: State | null = null;
let sessionCache: Session | null = null;
const listeners = new Set<() => void>();

function ls(): Storage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}
function readKey(key: string): string | null {
  try {
    const st = ls();
    if (st) return st.getItem(key);
  } catch {
    /* blocked storage falls back to memory */
  }
  return key === KEY ? memoryState : memorySession;
}
function writeKey(key: string, raw: string) {
  if (key === KEY) memoryState = raw;
  else memorySession = raw;
  try {
    ls()?.setItem(key, raw);
  } catch {
    /* memory only */
  }
}
function emit() {
  listeners.forEach((l) => l());
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY || e.key === null) cache = null;
    if (e.key === SESSION_KEY || e.key === null) sessionCache = null;
    emit();
  });
}

function parse(raw: string | null): State | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as State;
    return s && s.version === VERSION ? s : null;
  } catch {
    return null;
  }
}

function fresh(): State {
  return parse(readKey(KEY)) || seedState();
}

export function getState(): State {
  if (!cache) {
    const s = parse(readKey(KEY));
    if (s) cache = s;
    else {
      cache = seedState();
      writeKey(KEY, JSON.stringify(cache));
    }
  }
  return cache;
}

function save(s: State) {
  writeKey(KEY, JSON.stringify(s));
  cache = s;
  emit();
}

export function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function useStore(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

// ---------------------------------------------------------------- session

export function defaultSession(): Session {
  return { role: "buyer", buyerId: BUYERS[0].id, operatorId: defaultOperatorId(), adminId: ADMIN.id };
}
export function getSession(): Session {
  if (!sessionCache) {
    try {
      const raw = readKey(SESSION_KEY);
      sessionCache = raw ? { ...defaultSession(), ...JSON.parse(raw) } : defaultSession();
    } catch {
      sessionCache = defaultSession();
    }
  }
  return sessionCache!;
}
export function setSession(patch: Partial<Session>) {
  sessionCache = { ...getSession(), ...patch };
  writeKey(SESSION_KEY, JSON.stringify(sessionCache));
  emit();
}
export function useSession(): Session {
  return useSyncExternalStore(subscribe, getSession, getSession);
}
/** Magic-link sign in (gap G12): "operator:<id>", "buyer:<id>", "admin:<id>". */
export function signInAs(as: string) {
  const [role, id] = as.split(":");
  if (role === "operator" && id && operatorById(id)) setSession({ role: "operator", operatorId: id });
  else if (role === "buyer" && id && buyerById(id)) setSession({ role: "buyer", buyerId: id });
  else if (role === "admin") setSession({ role: "admin" });
}

// ---------------------------------------------------------------- seed

/** GTM problem / scope for the seeded projects (the handoff seed predates this field). */
const SEED_SCOPE: Record<string, string> = {
  "proj-northwind-vps":
    "Sales has been founder-led to $12M ARR. The next stage needs a repeatable process, the first two AEs hired and ramping, and a weekly forecast the CEO trusts.",
  "proj-harbor-revops":
    "Forecasting lives in a spreadsheet and territories have not been redrawn in three years. Salesforce needs cleaning up before the team grows, then a plan for a full-time RevOps hire.",
};

/** Default respond-by window after posting. It is a soft deadline shown to operators, not enforced. */
export const RESPOND_WINDOW_DAYS = 10;
/** Standard Revenue Nomad margin (admin A3). Used to show operators a take-home range on buyer projects. */
export const STANDARD_MARGIN = 25;

export function seedState(): State {
  const opState: Record<string, OperatorState> = {};
  for (const o of OPERATORS) opState[o.id] = defaultOperatorState(o);
  const projects: Project[] = SEED_PROJECTS.map((raw) => ({
    ...(raw as unknown as Project),
    postedAt: null,
    staffedAt: null,
    closedAt: null,
    pausedAt: null,
    createdAt: CLOCK_BASE - 2 * DAY,
    updatedAt: CLOCK_BASE - DAY,
    selectedOperatorId: null,
    adminNote: "",
    draftInvites: [],
    revealClientOnShortlist: (raw as { origin?: string }).origin === "revenue_nomad" ? false : undefined,
    scope: (raw as { scope?: string }).scope ?? SEED_SCOPE[(raw as { id: string }).id] ?? "",
    respondBy: null,
  }));
  return {
    version: VERSION,
    clockOffsetMs: 0,
    opState,
    projects,
    invites: [],
    alerts: [],
    responses: [],
    pipeline: [],
    questions: [],
    intros: [],
    shortlists: [],
    outbox: [],
    events: [],
    seq: 1,
  };
}

export function resetDemo() {
  cache = null;
  save(seedState());
  const s = getSession();
  sessionCache = { ...defaultSession(), role: s.role };
  writeKey(SESSION_KEY, JSON.stringify(sessionCache));
  emit();
}

// ---------------------------------------------------------------- mutation plumbing

export class ActionError extends Error {
  field?: string;
  constructor(message: string, field?: string) {
    super(message);
    this.field = field;
  }
}

interface Ctx {
  now: number;
  actorRole: Role | "system" | "client";
  actorId: string;
  actorName: string;
  id(prefix: string): string;
  event(type: string, e?: Partial<AppEvent>): void;
  email(e: Omit<OutboxEntry, "id" | "at">): OutboxEntry;
}

function actorFor(role: Role | "system" | "client", id?: string): { actorRole: Role | "system" | "client"; actorId: string; actorName: string } {
  const sess = getSession();
  const r = role;
  if (r === "buyer") {
    const b = buyerById(id || sess.buyerId);
    return { actorRole: "buyer", actorId: b?.id || "", actorName: b ? `${b.contactName}, ${b.company}` : "Buyer" };
  }
  if (r === "operator") {
    const o = operatorById(id || sess.operatorId);
    return { actorRole: "operator", actorId: o?.id || "", actorName: o ? displayName(o) : "Operator" };
  }
  if (r === "admin") return { actorRole: "admin", actorId: ADMIN.id, actorName: ADMIN.name };
  if (r === "client") return { actorRole: "client", actorId: "client", actorName: "Client" };
  return { actorRole: "system", actorId: "system", actorName: "Revenue Nomad" };
}

function mutate<T>(role: Role | "system" | "client", fn: (s: State, c: Ctx) => T, actorId?: string): T {
  const s = fresh();
  s.clockOffsetMs += MINUTE;
  const now = CLOCK_BASE + s.clockOffsetMs;
  const actor = actorFor(role, actorId);
  const c: Ctx = {
    now,
    ...actor,
    id: (prefix) => `${prefix}-${s.seq++}`,
    event: (type, e = {}) => {
      s.events.push({ id: `ev-${s.seq++}`, at: now, type, ...actor, ...e });
    },
    email: (e) => {
      const entry: OutboxEntry = { id: `mail-${s.seq++}`, at: now, ...e };
      s.outbox.push(entry);
      return entry;
    },
  };
  const out = fn(s, c);
  save(s);
  return out;
}

// ---------------------------------------------------------------- visibility signals

export type SignalType = "profile_viewed" | "search_impression" | "compared";
export interface SignalHit {
  type: SignalType;
  operatorId: string;
  term?: string;
  source?: string;
  projectId?: string;
}

/**
 * Profile views, search appearances and compares. Recorded as events like everything
 * else, but without moving the simulated clock, and at most once per operator, term
 * and viewer a day so a re-render or a retyped search doesn't inflate them.
 */
export function trackSignals(hits: SignalHit[], role: Role | "client", actorId?: string) {
  if (!hits.length) return;
  const s = fresh();
  const now = CLOCK_BASE + s.clockOffsetMs;
  const actor = actorFor(role, actorId);
  const day = Math.floor(now / DAY);
  const seen = new Set(
    s.events
      .filter((e) => (e.type === "profile_viewed" || e.type === "search_impression" || e.type === "compared") && Math.floor(e.at / DAY) === day && e.actorId === actor.actorId)
      .map((e) => `${e.type}|${e.operatorId}|${String(e.meta?.term || "")}|${e.projectId || ""}`),
  );
  let added = 0;
  for (const h of hits) {
    const term = (h.term || "").trim().toLowerCase().slice(0, 60);
    const k = `${h.type}|${h.operatorId}|${term}|${h.projectId || ""}`;
    if (seen.has(k)) continue;
    seen.add(k);
    s.events.push({ id: `ev-${s.seq++}`, at: now, type: h.type, ...actor, operatorId: h.operatorId, projectId: h.projectId, meta: { ...(term ? { term } : {}), ...(h.source ? { source: h.source } : {}) } });
    added++;
  }
  if (added) save(s);
}

/** Records who showed up for a search once the buyer stops typing. Operators searching don't count. */
export function useSearchImpressions(q: string, operatorIds: string[], source: string) {
  const sess = useSession();
  const key = operatorIds.join(",");
  useEffect(() => {
    const term = q.trim().toLowerCase();
    if (term.length < 2 || sess.role === "operator" || !operatorIds.length) return;
    const t = setTimeout(() => trackSignals(operatorIds.map((id) => ({ type: "search_impression" as const, operatorId: id, term, source })), sess.role, sess.role === "buyer" ? sess.buyerId : undefined), 700);
    return () => clearTimeout(t);
  }, [q, key, sess.role]); // eslint-disable-line react-hooks/exhaustive-deps
}

/** The buyer's company profile: what they saved, else a starting point from their account. */
export function buyerProfileOf(s: State, buyerId: string | undefined): BuyerProfile | null {
  if (!buyerId) return null;
  return s.buyerProfiles?.[buyerId] || defaultBuyerProfile(buyerId);
}

export function saveBuyerProfile(buyerId: string, patch: Partial<BuyerProfile>) {
  mutate(
    "buyer",
    (s, c) => {
      const cur = s.buyerProfiles?.[buyerId] || defaultBuyerProfile(buyerId);
      s.buyerProfiles = { ...(s.buyerProfiles || {}), [buyerId]: { ...cur, ...patch } };
      c.event("buyer_profile_updated", { meta: { fields: Object.keys(patch) } });
    },
    buyerId,
  );
}

export function nowOf(s: State): number {
  return CLOCK_BASE + s.clockOffsetMs;
}

// ---------------------------------------------------------------- selectors

export function projectById(s: State, id: string): Project | undefined {
  return s.projects.find((p) => p.id === id);
}
export function inviteOf(s: State, pid: string, opId: string) {
  return s.invites.find((i) => i.projectId === pid && i.operatorId === opId);
}
export function alertOf(s: State, pid: string, opId: string) {
  return s.alerts.find((a) => a.projectId === pid && a.operatorId === opId);
}
export function responseOf(s: State, pid: string, opId: string) {
  return s.responses.find((r) => r.projectId === pid && r.operatorId === opId);
}
export function pipelineOf(s: State, pid: string, opId: string) {
  return s.pipeline.find((e) => e.projectId === pid && e.operatorId === opId);
}
export function invitesFor(s: State, pid: string) {
  return s.invites.filter((i) => i.projectId === pid);
}
export function alertsFor(s: State, pid: string) {
  return s.alerts.filter((a) => a.projectId === pid);
}
/** Submitted responses with interest. Drafts and passes are never shown to the buyer. */
export function responsesFor(s: State, pid: string): Response[] {
  return s.responses.filter((r) => r.projectId === pid && !r.draft && r.submittedAt && r.interest === "interested" && !r.withdrawn);
}
export function declinesFor(s: State, pid: string): Response[] {
  return s.responses.filter((r) => r.projectId === pid && !r.draft && r.submittedAt && (r.interest === "declined" || r.withdrawn));
}
export function questionsFor(s: State, pid: string) {
  return s.questions.filter((q) => q.projectId === pid);
}
export function opState(s: State, opId: string): OperatorState {
  return s.opState[opId] || defaultOperatorState(operatorById(opId)!);
}

export function briefOf(p: Project) {
  return briefFromProject(p);
}
export function projectFit(p: Project, op: Operator, overrides: { rate?: number | null; hoursPerMonth?: number | null } = {}): FitResult {
  return fitScore(op, briefFromProject(p), overrides);
}
export function responseFit(p: Project, r: Response): FitResult {
  const op = operatorById(r.operatorId)!;
  return projectFit(p, op, { rate: r.rate, hoursPerMonth: r.hoursPerMonth });
}
export function suggestionsUsed(s: State, pid: string) {
  return s.invites.filter((i) => i.projectId === pid && i.source === "rn_suggested").length;
}
export function isEnded(p: Project) {
  return p.status === "staffed" || p.status === "closed_unfilled";
}
export function acceptsResponses(p: Project) {
  return p.status === "live";
}
export function respondBlockedMessage(p: Project): string | null {
  switch (p.status) {
    case "live":
      return null;
    case "draft":
      return "This project has not been posted yet.";
    case "paused":
      return "This project is paused, so it is not taking responses right now. Check back later.";
    case "closed_to_responses":
      return "The buyer closed this project to new responses.";
    case "staffed":
      return "This project has been staffed, so it is no longer taking responses.";
    case "closed_unfilled":
      return "This project was closed, so it is no longer taking responses.";
  }
}
export function ownerName(p: Project): string {
  if (p.origin === "revenue_nomad") return p.clientName || "Revenue Nomad client";
  return buyerById(p.ownerBuyerId)?.company || "Buyer";
}
/** Company name is shown to an operator only after intro request, selection, or (RN) shortlist reveal. */
export function companyRevealed(s: State, p: Project, opId: string): boolean {
  if (!p.hideCompanyUntilIntro) return true;
  const r = responseOf(s, p.id, opId);
  if (r && (r.decision === "intro_requested" || r.decision === "selected")) return true;
  if (p.origin === "revenue_nomad" && p.revealClientOnShortlist) {
    const e = pipelineOf(s, p.id, opId);
    if (e && ["shortlisted", "with_client", "selected"].includes(e.stage)) return true;
  }
  return false;
}
export function projectCompanyLine(s: State, p: Project, opId: string): string {
  return companyRevealed(s, p, opId) ? ownerName(p) : p.companyDescriptor;
}
/** What an operator is paid on this project. Budget is never shown to operators (gap G17). */
/** What an operator takes home per hour. RN projects pay the fixed operator rate; buyer projects
 *  show the budget less the standard margin, so the budget itself is never shown (gap G17). */
export function takeHome(p: Project): [number, number] | null {
  if (p.origin === "revenue_nomad") return p.operatorRate != null ? [p.operatorRate, p.operatorRate] : null;
  if (p.budgetMin == null || p.budgetMax == null) return null;
  const k = 1 - STANDARD_MARGIN / 100;
  return [Math.round((p.budgetMin * k) / 5) * 5, Math.round((p.budgetMax * k) / 5) * 5];
}
export function takeHomeLine(p: Project): string | null {
  const t = takeHome(p);
  if (!t) return null;
  return t[0] === t[1] ? `$${t[0]}/hr` : `$${t[0]} to $${t[1]}/hr`;
}

export function operatorRateLine(p: Project): string | null {
  return p.origin === "revenue_nomad" && p.operatorRate != null ? `$${p.operatorRate}/hr` : null;
}

export type OpStatus = "Invited" | "Draft saved" | "Responded" | "Buyer viewed" | "Intro requested" | "Under review" | "Selected" | "Closed" | "Passed";

export function operatorStatus(s: State, p: Project, opId: string): OpStatus | null {
  const r = responseOf(s, p.id, opId);
  const inv = inviteOf(s, p.id, opId);
  if (r && r.submittedAt && !r.draft) {
    if (r.interest === "declined" || r.withdrawn) return "Passed";
    if (r.decision === "selected") return "Selected";
    if (isEnded(p)) return "Closed";
    if (p.origin === "revenue_nomad") {
      const e = pipelineOf(s, p.id, opId);
      if (e && ["shortlisted", "with_client"].includes(e.stage)) return "Under review";
      return "Responded";
    }
    if (r.decision === "intro_requested") return "Intro requested";
    if (r.viewedAt) return "Buyer viewed";
    return "Responded";
  }
  if (inv) {
    if (isEnded(p)) return "Closed";
    return r && r.draft ? "Draft saved" : "Invited";
  }
  if (r && r.draft) return "Draft saved";
  return null;
}

export function inPortal(s: State, pid: string, opId: string): boolean {
  if (inviteOf(s, pid, opId)) return true;
  const r = responseOf(s, pid, opId);
  return !!(r && !r.draft && r.submittedAt);
}

export function alertMatches(s: State, p: Project, opId: string): boolean {
  const st = opState(s, opId);
  const cat = seatOf(p);
  return st.alertPrefs.map(normalizeCategory).includes(cat) && st.availability !== "unavailable";
}

export interface PortalItem {
  project: Project;
  status: OpStatus | null;
  source: "invite" | "rn_suggested" | "admin" | "alert" | "browse";
  fit: FitResult;
  sub: string;
  when: number;
}

export function operatorPortal(s: State, opId: string) {
  const op = operatorById(opId)!;
  const invited: PortalItem[] = [];
  const responded: PortalItem[] = [];
  const closed: PortalItem[] = [];
  const openRoles: PortalItem[] = [];
  for (const p of s.projects) {
    if (p.status === "draft") continue;
    const inv = inviteOf(s, p.id, opId);
    const al = alertOf(s, p.id, opId);
    const r = responseOf(s, p.id, opId);
    const fit = r && r.submittedAt && !r.draft ? responseFit(p, r) : projectFit(p, op);
    const status = operatorStatus(s, p, opId);
    const source: PortalItem["source"] = inv ? (inv.source === "buyer" ? "invite" : inv.source) : al ? "alert" : "browse";
    const item: PortalItem = { project: p, status, source, fit, sub: "", when: r?.submittedAt || inv?.sentAt || al?.sentAt || p.postedAt || 0 };
    if (!inPortal(s, p.id, opId)) {
      const openToAll = p.visibility === "invites_plus_open" && p.status === "live";
      if (openToAll && (al || alertMatches(s, p, opId))) openRoles.push({ ...item, status: r?.draft ? "Draft saved" : null });
      continue;
    }
    if (status === "Passed") closed.push({ ...item, sub: r?.withdrawn ? "You withdrew" : `You passed${r?.declineReason ? `: ${r.declineReason}` : ""}` });
    else if (status === "Closed")
      closed.push({ ...item, sub: p.status === "staffed" ? "Staffed, went another direction" : "Closed without a hire" });
    else if (status === "Invited" || status === "Draft saved") invited.push(item);
    else responded.push(item);
  }
  const byWhen = (a: PortalItem, b: PortalItem) => b.when - a.when || (a.project.id < b.project.id ? -1 : 1);
  return { invited: invited.sort(byWhen), responded: responded.sort(byWhen), closed: closed.sort(byWhen), openRoles: openRoles.sort(byWhen) };
}

export function allOpenRoles(s: State): Project[] {
  return s.projects.filter((p) => p.status === "live" && p.visibility === "invites_plus_open");
}

export function responseSourceLabel(s: State, r: Response): string {
  const inv = inviteOf(s, r.projectId, r.operatorId);
  if (inv) return inv.source === "rn_suggested" ? "Suggested by Revenue Nomad" : inv.source === "admin" ? "Invited by Revenue Nomad" : "Invited";
  if (r.viaSource === "alert") return "Open role alert";
  return "Found it browsing";
}

// ---- admin flags and KPIs, computed from the store (gap C3)

export function projectFlags(s: State, p: Project): string[] {
  const flags: string[] = [];
  const now = nowOf(s);
  if (p.origin === "buyer" && p.wantsRnSuggestions && p.status !== "draft" && !isEnded(p)) {
    const used = suggestionsUsed(s, p.id);
    if (used < MAX_SUGGESTIONS) flags.push(used === 0 ? "Wants 3 RN suggestions" : `Wants RN suggestions, ${used} of 3 sent`);
  }
  if (noResponses72(s, p, now)) flags.push("No responses in 72 hrs");
  if (p.status === "paused") flags.push("Paused");
  const open = questionsFor(s, p.id).filter((q) => !q.answer).length;
  if (open) flags.push(`${open} unanswered question${open === 1 ? "" : "s"}`);
  return flags;
}
export function noResponses72(s: State, p: Project, now = nowOf(s)): boolean {
  return p.status === "live" && !!p.postedAt && now - p.postedAt >= 72 * HOUR && responsesFor(s, p.id).length === 0;
}

export function projectCounts(s: State, p: Project) {
  const resp = responsesFor(s, p.id);
  const fits = resp.map((r) => responseFit(p, r).fit);
  return {
    invited: invitesFor(s, p.id).length,
    alerted: alertsFor(s, p.id).length,
    responses: resp.length,
    strong: fits.filter((f) => f >= 85).length,
    possible: fits.filter((f) => f >= 70 && f < 85).length,
    weak: fits.filter((f) => f < 70).length,
    intros: resp.filter((r) => r.decision === "intro_requested" || r.decision === "selected").length,
    declined: declinesFor(s, p.id).length,
    viewed: new Set(s.events.filter((e) => e.projectId === p.id && e.type === "project_viewed").map((e) => e.operatorId)).size,
  };
}

// ---------------------------------------------------------------- validation

export interface BriefErrors {
  [field: string]: string;
}
export function validateBrief(p: Partial<Project>): BriefErrors {
  const e: BriefErrors = {};
  if (!p.title || !p.title.trim()) e.title = "Add a role title so operators know what the seat is.";
  if (!p.successIn90Days || !p.successIn90Days.trim()) e.successIn90Days = "Say what success looks like in 90 days.";
  const hmin = Number(p.hoursPerMonthMin);
  const hmax = Number(p.hoursPerMonthMax);
  if (!hmin || !hmax || hmin <= 0 || hmax <= 0) e.hours = "Enter hours a month as a range, for example 20 to 30.";
  else if (hmin > hmax) e.hours = "Minimum hours can't be more than maximum hours.";
  if (p.origin !== "revenue_nomad") {
    const bmin = p.budgetMin;
    const bmax = p.budgetMax;
    if (bmin == null || bmax == null || isNaN(bmin) || isNaN(bmax) || bmin <= 0 || bmax <= 0) e.budget = "Enter a budget range in dollars per hour.";
    else if (bmin > bmax) e.budget = "Budget minimum can't be more than the maximum.";
  } else {
    if (!p.clientName || !p.clientName.trim()) e.clientName = "Add the client name. Only admins see it.";
    if (p.billRate == null || !(p.billRate > 0)) e.billRate = "Enter the bill rate to the client.";
    if (p.operatorRate == null || !(p.operatorRate > 0)) e.operatorRate = "Enter the rate to the operator.";
    else if (p.billRate != null && p.operatorRate > p.billRate) e.operatorRate = "Rate to operator can't be more than the bill rate.";
  }
  const qs = p.screeningQuestions || [];
  if (qs.length > MAX_SCREENING) e.screeningQuestions = `Up to ${MAX_SCREENING} screening questions. Remove ${qs.length - MAX_SCREENING} to continue.`;
  else if (qs.some((q) => !q.trim())) e.screeningQuestions = "Fill in or remove the empty screening question.";
  if (!p.companyDescriptor || !p.companyDescriptor.trim()) e.companyDescriptor = "Describe your company for operators, for example Series B healthcare SaaS.";
  return e;
}

// ---------------------------------------------------------------- email builders

function opLink(opId: string, path: string, label: string): OutboxLink {
  return { label, path, as: `operator:${opId}` };
}

function sendInviteEmail(s: State, c: Ctx, p: Project, op: Operator, source: InviteSource, reminder = false) {
  const fit = projectFit(p, op);
  const who =
    source === "rn_suggested"
      ? `Revenue Nomad suggested you to a ${p.companyDescriptor}`
      : source === "admin"
        ? `Revenue Nomad invited you to a ${p.companyDescriptor} seat`
        : `a ${p.companyDescriptor} invited you to apply`;
  const rate = operatorRateLine(p);
  c.email({
    kind: "invite",
    to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
    subject: `${reminder ? "Reminder: " : ""}You're invited to apply, ${p.title}`,
    body: [
      `${op.first}, ${who}${source === "buyer" ? ` for their ${p.title} engagement.` : ` for a ${p.title} engagement.`}`,
      `Hours ${hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} a month · Term ${p.term} · Location ${p.location} · Start ${shortDate(p.startTarget)}`,
      rate ? `Rate to you ${rate}` : "",
      `Your fit ${fit.fit}, ${fit.tier} fit`,
      "It is already saved in your Projects. Responding takes about two minutes.",
    ]
      .filter(Boolean)
      .join("\n"),
    links: [opLink(op.id, `/dashboard/projects/${p.id}`, "View and respond")],
    projectId: p.id,
    operatorId: op.id,
  });
}

function createInvite(s: State, c: Ctx, p: Project, opId: string, source: InviteSource): Invite {
  const op = operatorById(opId)!;
  const existing = inviteOf(s, p.id, opId);
  if (existing) {
    // One row per (project, operator) (QA X-02). A repeat invite refreshes sentAt and resends.
    existing.sentAt = c.now;
    sendInviteEmail(s, c, p, op, existing.source, true);
    c.event("invite_resent", { projectId: p.id, operatorId: opId, meta: { source: existing.source } });
    return existing;
  }
  const r = responseOf(s, p.id, opId);
  const already = !!(r && r.submittedAt && !r.draft);
  const inv: Invite = { id: c.id("inv"), projectId: p.id, operatorId: opId, source, createdAt: c.now, sentAt: c.now, silent: already };
  s.invites.push(inv);
  if (!already) sendInviteEmail(s, c, p, op, source);
  c.event("invite_sent", { projectId: p.id, operatorId: opId, meta: { source, emailed: !already } });
  if (p.origin === "revenue_nomad" && !pipelineOf(s, p.id, opId)) {
    s.pipeline.push({ projectId: p.id, operatorId: opId, stage: already ? "responded" : "invited", note: "", updatedAt: c.now });
  }
  return inv;
}

function sendAlerts(s: State, c: Ctx, p: Project) {
  const cat = seatOf(p);
  const day = isoDay(c.now);
  for (const op of OPERATORS) {
    if (inviteOf(s, p.id, op.id) || alertOf(s, p.id, op.id)) continue;
    if (!alertMatches(s, p, op.id)) continue;
    // Cap at one alert email per operator per day; extras roll into a digest (gap G15).
    const alreadyToday = s.outbox.some((m) => m.kind === "alert" && m.operatorId === op.id && isoDay(m.at) === day);
    s.alerts.push({ id: c.id("al"), projectId: p.id, operatorId: op.id, sentAt: c.now, digest: alreadyToday });
    const to = { role: "operator" as const, id: op.id, name: displayName(op), email: operatorEmail(op) };
    if (!alreadyToday) {
      c.email({
        kind: "alert",
        to,
        subject: `New fractional role posted, ${p.title}`,
        body: [
          `${op.first}, a new role was posted that may fit your profile.`,
          `Role ${p.title} · Company ${p.companyDescriptor} · Hours ${hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} a month · Start ${shortDate(p.startTarget)}`,
          "Respond and it moves into your Projects. Change which roles you hear about in Alert settings.",
        ].join("\n"),
        links: [opLink(op.id, `/dashboard/projects/${p.id}`, "See the role"), opLink(op.id, `/dashboard/availability`, "Alert settings")],
        projectId: p.id,
        operatorId: op.id,
      });
    } else {
      let digest = s.outbox.find((m) => m.kind === "digest" && m.operatorId === op.id && isoDay(m.at) === day);
      if (!digest) {
        digest = c.email({ kind: "digest", to, subject: "", body: "", links: [], operatorId: op.id });
      }
      digest.links.push(opLink(op.id, `/dashboard/projects/${p.id}`, p.title));
      digest.subject = `Today's digest, ${digest.links.length} more new role${digest.links.length === 1 ? "" : "s"} for you`;
      digest.body = `${op.first}, you already had one role alert today, so the rest are rolled into this digest.\n` + digest.links.map((l) => `· ${l.label}`).join("\n");
    }
    c.event("alert_sent", { projectId: p.id, operatorId: op.id, meta: { category: cat, digest: alreadyToday } });
  }
}

function closeProject(s: State, c: Ctx, p: Project, status: "staffed" | "closed_unfilled", selectedId: string | null) {
  p.status = status;
  p.updatedAt = c.now;
  if (status === "staffed") {
    p.staffedAt = c.now;
    p.selectedOperatorId = selectedId;
  } else p.closedAt = c.now;
  const company = ownerName(p);
  for (const r of responsesFor(s, p.id)) {
    const op = operatorById(r.operatorId)!;
    const to = { role: "operator" as const, id: op.id, name: displayName(op), email: operatorEmail(op) };
    if (r.operatorId === selectedId) {
      r.decision = "selected";
      r.decisionAt = c.now;
      c.email({
        kind: "selected",
        to,
        subject: `You were selected, ${p.title}`,
        body: `${op.first}, ${company} selected you for their ${p.title} engagement. Revenue Nomad will send the agreement next. Congratulations.`,
        links: [opLink(op.id, `/dashboard/projects/${p.id}`, "See next steps")],
        projectId: p.id,
        operatorId: op.id,
      });
      c.event("selected", { projectId: p.id, operatorId: op.id });
    } else if (!r.closeEmailSentAt) {
      // Rule 4: one polite close to every non-selected responder. Non-responders get nothing.
      r.closeEmailSentAt = c.now;
      c.email({
        kind: "close",
        to,
        subject: `Update on ${p.title}`,
        body:
          status === "staffed"
            ? `${op.first}, thank you for responding to the ${p.title} engagement. The seat has been filled by another operator. We will keep matching you with new roles.`
            : `${op.first}, thank you for responding to the ${p.title} engagement. The company closed the project without filling it. We will keep matching you with new roles.`,
        links: [opLink(op.id, `/dashboard/projects`, "See your projects")],
        projectId: p.id,
        operatorId: op.id,
      });
      c.event("close_email_sent", { projectId: p.id, operatorId: op.id, meta: { decision: r.decision } });
    }
  }
  if (p.origin === "revenue_nomad") {
    for (const e of s.pipeline.filter((x) => x.projectId === p.id)) {
      if (e.operatorId === selectedId) e.stage = "selected";
      else if (e.stage !== "invited") e.stage = "not_selected";
      e.updatedAt = c.now;
    }
  }
  c.event(status === "staffed" ? "project_staffed" : "project_closed_unfilled", { projectId: p.id, operatorId: selectedId || undefined });
}

// ---------------------------------------------------------------- buyer actions

function mustProject(s: State, pid: string): Project {
  const p = projectById(s, pid);
  if (!p) throw new ActionError("That project does not exist.");
  return p;
}

export function createBuyerDraft(buyerId: string): string {
  return mutate("buyer", (s, c) => {
    const b = buyerById(buyerId)!;
    const id = c.id("proj");
    s.projects.push({
      id,
      origin: "buyer",
      ownerBuyerId: buyerId,
      status: "draft",
      title: "",
      successIn90Days: "",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "6 months",
      startTarget: isoDay(c.now + 21 * DAY),
      location: "Remote",
      budgetMin: null,
      budgetMax: null,
      mustHaves: [],
      screeningQuestions: [],
      companyDescriptor: b.companyDescriptor,
      hideCompanyUntilIntro: true,
      visibility: "invites_plus_open",
      wantsRnSuggestions: true,
      postedAt: null,
      staffedAt: null,
      closedAt: null,
      createdAt: c.now,
      updatedAt: c.now,
      draftInvites: [],
    });
    c.event("project_created", { projectId: id });
    return id;
  });
}

export function createRnDraft(): string {
  return mutate("admin", (s, c) => {
    const id = c.id("proj");
    s.projects.push({
      id,
      origin: "revenue_nomad",
      ownerAdminId: ADMIN.id,
      status: "draft",
      title: "",
      clientName: "",
      companyDescriptor: "Revenue Nomad client",
      successIn90Days: "",
      hoursPerMonthMin: 20,
      hoursPerMonthMax: 30,
      term: "6 months",
      startTarget: isoDay(c.now + 21 * DAY),
      location: "Remote",
      billRate: null,
      operatorRate: null,
      mustHaves: [],
      screeningQuestions: [],
      hideCompanyUntilIntro: true,
      revealClientOnShortlist: false,
      visibility: "invite_only",
      wantsRnSuggestions: false,
      postedAt: null,
      staffedAt: null,
      closedAt: null,
      createdAt: c.now,
      updatedAt: c.now,
      draftInvites: [],
    });
    c.event("project_created", { projectId: id });
    return id;
  });
}

export function updateDraft(pid: string, patch: Partial<Project>, role: Role = "buyer") {
  mutate(role, (s, c) => {
    const p = mustProject(s, pid);
    Object.assign(p, patch, { updatedAt: c.now });
  });
}

export function deleteDraft(pid: string) {
  mutate("buyer", (s) => {
    const p = mustProject(s, pid);
    if (p.status !== "draft") throw new ActionError("Only drafts can be deleted.");
    s.projects = s.projects.filter((x) => x.id !== pid);
  });
}

/** Toggle an invite. On a draft it only changes the invite list; on a posted project it sends at once. */
export function inviteOperator(pid: string, opId: string, role: Role = "buyer") {
  mutate(role, (s, c) => {
    const p = mustProject(s, pid);
    if (p.status === "draft") {
      const list = new Set(p.draftInvites || []);
      list.add(opId);
      p.draftInvites = [...list];
      return;
    }
    if (isEnded(p)) throw new ActionError("This project is closed, so you can't invite anyone new.");
    createInvite(s, c, p, opId, role === "admin" ? "admin" : "buyer");
  });
}
export function uninviteOperator(pid: string, opId: string, role: Role = "buyer") {
  mutate(role, (s) => {
    const p = mustProject(s, pid);
    if (p.status !== "draft") throw new ActionError("Invites already sent can't be taken back. You can pass on a response instead.");
    p.draftInvites = (p.draftInvites || []).filter((x) => x !== opId);
  });
}

export function postProject(pid: string) {
  mutate("buyer", (s, c) => {
    const p = mustProject(s, pid);
    if (p.status !== "draft") throw new ActionError("This project is already posted.");
    const errs = validateBrief(p);
    const first = Object.keys(errs)[0];
    if (first) throw new ActionError(errs[first], first);
    // Self-serve: posting sets live immediately. No Revenue Nomad review (section 1).
    p.status = "live";
    p.postedAt = c.now;
    p.respondBy = c.now + RESPOND_WINDOW_DAYS * DAY;
    p.updatedAt = c.now;
    c.event("project_posted", { projectId: p.id, meta: { visibility: p.visibility, wantsRnSuggestions: p.wantsRnSuggestions, origin: p.origin } });
    for (const opId of p.draftInvites || []) createInvite(s, c, p, opId, "buyer");
    p.draftInvites = [];
    if (p.visibility === "invites_plus_open") sendAlerts(s, c, p);
  });
}

export function markViewed(pid: string, opId: string) {
  const s0 = getState();
  const r0 = responseOf(s0, pid, opId);
  if (!r0 || r0.viewedAt || !r0.submittedAt || r0.draft) return;
  mutate("buyer", (s, c) => {
    const r = responseOf(s, pid, opId);
    if (!r || r.viewedAt) return;
    r.viewedAt = c.now;
    c.event("response_viewed", { projectId: pid, operatorId: opId });
  });
}

function assertDecisionsOpen(p: Project) {
  if (isEnded(p))
    throw new ActionError(
      p.status === "staffed"
        ? "This project is staffed. Decisions are final once you select someone, so they can't be undone."
        : "This project is closed. Decisions are final once a project closes.",
    );
}

const SLOT_TIMES = ["10:00 am ET", "1:00 pm ET", "4:00 pm ET"];

/** Three call slots on the next three weekdays, one per day, so the operator can book with one tap. */
export function offerSlots(now: number): string[] {
  const out: string[] = [];
  let d = new Date(now);
  while (out.length < 3) {
    d = new Date(d.getTime() + DAY);
    const wd = d.getUTCDay();
    if (wd === 0 || wd === 6) continue;
    out.push(`${dayLabel(d.getTime())}, ${SLOT_TIMES[out.length]}`);
  }
  return out;
}

/** Request intros with one or many responders. Each gets the buyer's three offered times as one-tap booking links. */
export function requestIntro(pid: string, opIds: string | string[]) {
  const ids = Array.isArray(opIds) ? opIds : [opIds];
  mutate("buyer", (s, c) => {
    const p = mustProject(s, pid);
    assertDecisionsOpen(p);
    const b = buyerById(p.ownerBuyerId);
    const slots = offerSlots(c.now);
    for (const opId of ids) {
      const r = responseOf(s, pid, opId);
      if (!r || !r.submittedAt) throw new ActionError("There is no response from this operator yet.");
      if (r.decision === "intro_requested") continue;
      r.decision = "intro_requested";
      r.decisionAt = c.now;
      r.viewedAt = r.viewedAt || c.now;
      const existing = s.intros.find((i) => i.projectId === pid && i.operatorId === opId);
      if (existing) Object.assign(existing, { status: "approved", createdAt: c.now, withdrawnAt: null, slots, bookedSlot: null, bookedAt: null });
      else s.intros.push({ id: c.id("intro"), projectId: pid, operatorId: opId, buyerId: b?.id || null, createdAt: c.now, status: "approved", slots, bookedSlot: null });
      const op = operatorById(opId)!;
      c.email({
        kind: "intro",
        to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
        subject: `${b?.company || "The buyer"} wants to talk, ${p.title}`,
        body: `${op.first}, ${b?.contactName}, ${b?.contactTitle} at ${b?.company}, requested an intro after reading your response. Tap a time to book a 30 minute call.`,
        links: [
          ...slots.map((sl, i) => opLink(op.id, `/dashboard/projects/${p.id}?book=${i}`, `Book ${sl}`)),
          opLink(op.id, `/dashboard/projects/${p.id}`, "None work, reply instead"),
        ],
        projectId: p.id,
        operatorId: op.id,
      });
      c.event("intro_requested", { projectId: pid, operatorId: opId, meta: { autoApproved: true, slots } });
    }
  });
}

export function setNotAFitReason(pid: string, opId: string, reason: string) {
  mutate("buyer", (s, c) => {
    const r = responseOf(s, pid, opId);
    if (!r || r.decision !== "not_a_fit") return;
    r.notAFitReason = reason;
    c.event("not_a_fit_reason", { projectId: pid, operatorId: opId, meta: { reason } });
  });
}

export function introOf(s: State, pid: string, opId: string) {
  return s.intros.find((i) => i.projectId === pid && i.operatorId === opId && i.status === "approved");
}

export function markNotAFit(pid: string, opIds: string[], reason: string) {
  mutate("buyer", (s, c) => {
    const p = mustProject(s, pid);
    assertDecisionsOpen(p);
    for (const opId of opIds) {
      const r = responseOf(s, pid, opId);
      if (!r || r.decision !== "none") continue;
      r.decision = "not_a_fit";
      r.notAFitReason = reason;
      r.decisionAt = c.now;
      // Private until staffed or closed (rule 4, gap G16): no email here.
      c.event("not_a_fit", { projectId: pid, operatorId: opId, meta: { reason } });
    }
  });
}

export function passAllWeak(pid: string): number {
  const s = getState();
  const p = projectById(s, pid)!;
  const ids = responsesFor(s, pid)
    .filter((r) => r.decision === "none" && responseFit(p, r).fit < 70)
    .map((r) => r.operatorId);
  if (ids.length) markNotAFit(pid, ids, "Weak fit");
  return ids.length;
}

export function undoDecision(pid: string, opId: string) {
  mutate("buyer", (s, c) => {
    const p = mustProject(s, pid);
    assertDecisionsOpen(p);
    const r = responseOf(s, pid, opId);
    if (!r) return;
    const was = r.decision;
    r.decision = "none";
    r.notAFitReason = null;
    r.decisionAt = c.now;
    if (was === "intro_requested") {
      const i = s.intros.find((x) => x.projectId === pid && x.operatorId === opId);
      if (i) {
        i.status = "withdrawn";
        i.withdrawnAt = c.now;
      }
    }
    c.event("decision_undone", { projectId: pid, operatorId: opId, meta: { was } });
  });
}

export function selectOperator(pid: string, opId: string, role: Role = "buyer") {
  mutate(role, (s, c) => {
    const p = mustProject(s, pid);
    assertDecisionsOpen(p);
    const r = responseOf(s, pid, opId);
    if (!r || !r.submittedAt || r.interest !== "interested") throw new ActionError("You can only select an operator who responded.");
    closeProject(s, c, p, "staffed", opId);
  });
}

export function closeUnfilled(pid: string, role: Role = "buyer") {
  mutate(role, (s, c) => {
    const p = mustProject(s, pid);
    if (isEnded(p)) throw new ActionError("This project is already closed.");
    closeProject(s, c, p, "closed_unfilled", null);
  });
}

export function setProjectStatus(pid: string, status: "paused" | "live" | "closed_to_responses", role: Role) {
  mutate(role, (s, c) => {
    const p = mustProject(s, pid);
    if (isEnded(p) || p.status === "draft") throw new ActionError("Only a posted, open project can change status.");
    const was = p.status;
    p.status = status;
    p.updatedAt = c.now;
    if (status === "paused") p.pausedAt = c.now;
    const type = status === "paused" ? "paused" : status === "closed_to_responses" ? "closed_to_responses" : was === "paused" ? "resumed" : "reopened";
    c.event(type, { projectId: pid, meta: { was } });
  });
}

/** Open a posted invite-only project to all operators (the G20 nudge). Sends alerts now. */
export function widenVisibility(pid: string, role: Role = "buyer") {
  mutate(role, (s, c) => {
    const p = mustProject(s, pid);
    if (p.visibility === "invites_plus_open") return;
    p.visibility = "invites_plus_open";
    c.event("visibility_widened", { projectId: pid });
    if (p.status === "live") sendAlerts(s, c, p);
  });
}

export function setWantsSuggestions(pid: string, on: boolean) {
  mutate("buyer", (s, c) => {
    const p = mustProject(s, pid);
    p.wantsRnSuggestions = on;
    c.event("suggestions_toggled", { projectId: pid, meta: { on } });
  });
}

export function answerQuestion(qid: string, text: string, role: Role) {
  mutate(role, (s, c) => {
    const q = s.questions.find((x) => x.id === qid);
    if (!q) throw new ActionError("That question no longer exists.");
    if (!text.trim()) throw new ActionError("Write an answer first.", "answer");
    q.answer = text.trim();
    q.answeredAt = c.now;
    q.answeredBy = role;
    const p = mustProject(s, q.projectId);
    const op = operatorById(q.operatorId)!;
    c.email({
      kind: "answer",
      to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
      subject: `Your question was answered, ${p.title}`,
      body: `You asked: "${q.text}"\nAnswer: ${q.answer}`,
      links: [opLink(op.id, `/dashboard/projects/${p.id}`, "Open the project")],
      projectId: p.id,
      operatorId: op.id,
    });
    c.event("question_answered", { projectId: p.id, operatorId: op.id, meta: { questionId: q.id } });
  });
}

// ---------------------------------------------------------------- operator actions

export interface ResponseInput {
  rate: number | null;
  hoursPerMonth: number | null;
  canStart: string | null;
  answers: string[];
  note: string;
  proof?: string[];
}

function validateInput(p: Project, input: ResponseInput) {
  if (input.rate == null || !(input.rate > 0)) throw new ActionError("Add your hourly rate for this project.", "rate");
  if (input.hoursPerMonth == null || !(input.hoursPerMonth > 0)) throw new ActionError("Add the hours a month you can give this project.", "hours");
  if (!input.canStart) throw new ActionError("Add the date you can start.", "canStart");
  const missing = p.screeningQuestions.findIndex((_q, i) => !(input.answers[i] || "").trim());
  if (missing >= 0) throw new ActionError(`Answer question ${missing + 1} before you submit.`, `answer-${missing}`);
}

/** Operators can edit a submitted response until the client opens it (live layout L4). */
export function canEditResponse(s: State, pid: string, opId: string): boolean {
  const p = projectById(s, pid);
  const r = responseOf(s, pid, opId);
  return !!(p && r && r.submittedAt && !r.draft && r.interest === "interested" && !r.withdrawn && !r.viewedAt && r.decision === "none" && p.status === "live");
}

export function updateResponse(pid: string, opId: string, input: ResponseInput) {
  mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      if (!canEditResponse(s, pid, opId)) throw new ActionError("The client has already opened your response, so it can't be edited now. Send a note with Ask a question instead.");
      validateInput(p, input);
      const r = responseOf(s, pid, opId)!;
      Object.assign(r, input, { updatedAt: c.now });
      c.event("response_edited", { projectId: pid, operatorId: opId, meta: { fit: responseFit(p, r).fit } });
    },
    opId,
  );
}

export function viewProjectAsOperator(pid: string, opId: string) {
  const s0 = getState();
  if (s0.events.some((e) => e.type === "project_viewed" && e.projectId === pid && e.operatorId === opId)) return;
  mutate(
    "operator",
    (s, c) => {
      c.event("project_viewed", { projectId: pid, operatorId: opId });
    },
    opId,
  );
}

function viaSourceFor(s: State, pid: string, opId: string): Response["viaSource"] {
  const inv = inviteOf(s, pid, opId);
  if (inv) return inv.source === "buyer" ? "invite" : inv.source;
  return alertOf(s, pid, opId) ? "alert" : "browse";
}

function upsertResponse(s: State, c: Ctx, pid: string, opId: string): Response {
  let r = responseOf(s, pid, opId);
  if (!r) {
    r = {
      id: c.id("resp"),
      projectId: pid,
      operatorId: opId,
      interest: "interested",
      rate: null,
      hoursPerMonth: null,
      canStart: null,
      answers: [],
      note: "",
      submittedAt: null,
      draft: true,
      createdAt: c.now,
      updatedAt: c.now,
      viaSource: viaSourceFor(s, pid, opId),
      decision: "none",
    };
    s.responses.push(r);
  }
  return r;
}

export function saveDraftResponse(pid: string, opId: string, input: ResponseInput) {
  mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      const existing = responseOf(s, pid, opId);
      if (existing && existing.submittedAt && !existing.draft) throw new ActionError("You already responded to this project.");
      const msg = respondBlockedMessage(p);
      if (msg) throw new ActionError(msg);
      const r = upsertResponse(s, c, pid, opId);
      Object.assign(r, input, { draft: true, updatedAt: c.now });
      c.event("response_draft_saved", { projectId: pid, operatorId: opId });
    },
    opId,
  );
}

export function submitResponse(pid: string, opId: string, input: ResponseInput): { warning: string | null } {
  return mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      const existing = responseOf(s, pid, opId);
      if (existing && existing.submittedAt && !existing.draft) throw new ActionError("You already responded to this project. Your response is saved.");
      const msg = respondBlockedMessage(p);
      if (msg) throw new ActionError(msg);
      const op = operatorById(opId)!;
      validateInput(p, input);
      const r = upsertResponse(s, c, pid, opId);
      Object.assign(r, input, { interest: "interested", draft: false, submittedAt: c.now, updatedAt: c.now, viaSource: viaSourceFor(s, pid, opId) });
      const fit = responseFit(p, r);
      if (p.origin === "revenue_nomad") {
        const e = pipelineOf(s, pid, opId);
        if (e) {
          if (e.stage === "invited") e.stage = "responded";
          e.updatedAt = c.now;
        } else s.pipeline.push({ projectId: pid, operatorId: opId, stage: "responded", note: "", updatedAt: c.now });
      }
      c.event("response_submitted", { projectId: pid, operatorId: opId, meta: { fit: fit.fit, source: r.viaSource } });
      const warning = (input.hoursPerMonth ?? 0) > (op.hrs || 0) ? `You offered ${input.hoursPerMonth} hrs a month, more than the ${op.hrs} on your profile. The fit score uses ${input.hoursPerMonth}.` : null;
      return { warning };
    },
    opId,
  );
}

export const DECLINE_REASONS = ["Rate", "Hours", "Timing", "Not my expertise", "Industry", "Other"];

export function declineProject(pid: string, opId: string, reason: string, note = "") {
  mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      if (!reason) throw new ActionError("Pick a reason so we can send better matches.", "reason");
      const existing = responseOf(s, pid, opId);
      if (existing && existing.submittedAt && !existing.draft) throw new ActionError("You already responded to this project.");
      const r = upsertResponse(s, c, pid, opId);
      Object.assign(r, { interest: "declined", declineReason: reason, declineNote: note.trim() || null, draft: false, submittedAt: c.now, updatedAt: c.now });
      const pe = pipelineOf(s, pid, opId);
      if (pe) {
        pe.stage = "not_selected";
        pe.updatedAt = c.now;
      }
      c.event("response_declined", { projectId: p.id, operatorId: opId, meta: { reason, note: note.trim() || null } });
    },
    opId,
  );
}

export function withdrawResponse(pid: string, opId: string) {
  mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      if (isEnded(p)) throw new ActionError("This project is closed.");
      const r = responseOf(s, pid, opId);
      if (!r) return;
      r.withdrawn = true;
      r.declineReason = "Withdrew";
      r.updatedAt = c.now;
      c.event("response_withdrawn", { projectId: pid, operatorId: opId, meta: { reason: "Withdrew" } });
    },
    opId,
  );
}

function projectContact(p: Project) {
  if (p.origin === "revenue_nomad") return { role: "admin" as const, id: ADMIN.id, name: ADMIN.name, email: ADMIN.email };
  const b = buyerById(p.ownerBuyerId)!;
  return { role: "buyer" as const, id: b.id, name: b.contactName, email: b.email };
}

export function askQuestion(pid: string, opId: string, text: string) {
  mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      if (!text.trim()) throw new ActionError("Write your question first.", "question");
      const op = operatorById(opId)!;
      const q = { id: c.id("q"), projectId: pid, operatorId: opId, text: text.trim(), askedAt: c.now };
      s.questions.push(q);
      const to = projectContact(p);
      c.email({
        kind: "question",
        to,
        subject: `Question from ${displayName(op)}, ${p.title}`,
        body: `${displayName(op)} asked: "${q.text}"\nAnswer it from the project's Questions tab. The answer goes to ${op.first} only.`,
        links: [
          to.role === "admin"
            ? { label: "Answer the question", path: `/admin/projects/${pid}?tab=questions`, as: `admin:${ADMIN.id}` }
            : { label: "Answer the question", path: `/buyer/projects/${pid}?tab=questions`, as: `buyer:${to.id}` },
        ],
        projectId: pid,
        operatorId: opId,
      });
      c.event("question_asked", { projectId: pid, operatorId: opId, meta: { questionId: q.id } });
    },
    opId,
  );
}

export function bookTime(pid: string, opId: string, slot: string) {
  mutate(
    "operator",
    (s, c) => {
      const p = mustProject(s, pid);
      const op = operatorById(opId)!;
      const intro = introOf(s, pid, opId);
      if (intro?.bookedSlot) throw new ActionError(`You already booked ${intro.bookedSlot}.`);
      if (intro) {
        intro.bookedSlot = slot;
        intro.bookedAt = c.now;
      }
      const to = projectContact(p);
      c.email({
        kind: "booking",
        to,
        subject: `Call booked with ${displayName(op)}, ${slot}`,
        body: `${displayName(op)} booked ${slot} for a 30 minute intro call about ${p.title}. It is on your project page.`,
        links: [{ label: "Open the project", path: to.role === "admin" ? `/admin/projects/${pid}` : `/buyer/projects/${pid}?view=intro`, as: `${to.role}:${to.id}` }],
        projectId: pid,
        operatorId: opId,
      });
      c.event("intro_call_booked", { projectId: pid, operatorId: opId, meta: { slot } });
    },
    opId,
  );
}

export function replyToBuyer(pid: string, opId: string, text: string) {
  mutate(
    "operator",
    (s, c) => {
      if (!text.trim()) throw new ActionError("Write a reply first.", "reply");
      const p = mustProject(s, pid);
      const op = operatorById(opId)!;
      const to = projectContact(p);
      c.email({
        kind: "reply",
        to,
        subject: `Reply from ${displayName(op)}, ${p.title}`,
        body: text.trim(),
        links: [{ label: "Open the project", path: to.role === "admin" ? `/admin/projects/${pid}` : `/buyer/projects/${pid}`, as: `${to.role}:${to.id}` }],
        projectId: pid,
        operatorId: opId,
      });
      c.event("operator_replied", { projectId: pid, operatorId: opId });
    },
    opId,
  );
}

export function confirmAvailability(opId: string, availability: "open" | "from" | "unavailable", extra: { from?: string | null; hours?: number | null } = {}) {
  mutate(
    "operator",
    (s, c) => {
      const st = { ...opState(s, opId) };
      st.availability = availability;
      st.lastConfirmedAt = isoDay(c.now);
      if (availability === "from") st.availableFrom = extra.from || st.availableFrom;
      if (extra.hours) st.hoursPerMonth = extra.hours;
      s.opState[opId] = st;
      c.event("availability_confirmed", { operatorId: opId, meta: { availability, from: extra.from || null } });
    },
    opId,
  );
}

// ---------------------------------------------------------------- jobs and prospects (per operator)

export const FOLLOW_UP_DAYS = 5;

function markWork(kind: "jobs" | "prospects", opId: string, id: string, status: WorkStatus | null, extra: Partial<WorkMark> = {}) {
  mutate(
    "operator",
    (s, c) => {
      const st = { ...opState(s, opId) };
      const marks = { ...(st[kind] || {}) };
      if (status === null) delete marks[id];
      else {
        const prev = marks[id];
        const followUp = status === "applied" || status === "sent" ? c.now + FOLLOW_UP_DAYS * DAY : status === "replied" ? c.now + 2 * DAY : null;
        marks[id] = { ...prev, ...extra, status, at: c.now, followUpAt: followUp };
      }
      st[kind] = marks;
      s.opState[opId] = st;
      c.event(status ? `${kind === "jobs" ? "job" : "prospect"}_${status}` : `${kind === "jobs" ? "job" : "prospect"}_cleared`, { operatorId: opId, meta: { id, ...(extra.signal ? { signal: extra.signal } : {}) } });
    },
    opId,
  );
}

export function markJob(opId: string, jobId: string, status: Extract<WorkStatus, "saved" | "applied" | "dismissed"> | null, title?: string) {
  markWork("jobs", opId, jobId, status, title ? { title } : {});
}

export function markProspect(opId: string, prospectId: string, status: Extract<WorkStatus, "sent" | "replied" | "meeting" | "dismissed"> | null, extra: { signal?: string; title?: string } = {}) {
  markWork("prospects", opId, prospectId, status, extra);
}

/** "I followed up": push the reminder out a week without changing the status. */
export function followedUp(opId: string, kind: "jobs" | "prospects", id: string) {
  mutate(
    "operator",
    (s, c) => {
      const st = { ...opState(s, opId) };
      const m = st[kind]?.[id];
      if (!m) return;
      st[kind] = { ...st[kind], [id]: { ...m, followUpAt: c.now + 7 * DAY } };
      s.opState[opId] = st;
      c.event("followed_up", { operatorId: opId, meta: { id, kind } });
    },
    opId,
  );
}

export function seeJobs(opId: string) {
  mutate(
    "operator",
    (s, c) => {
      s.opState[opId] = { ...opState(s, opId), jobsSeenAt: c.now };
    },
    opId,
  );
}

export function setAlertPrefs(opId: string, prefs: string[]) {
  mutate(
    "operator",
    (s, c) => {
      s.opState[opId] = { ...opState(s, opId), alertPrefs: prefs };
      c.event("alert_prefs_updated", { operatorId: opId, meta: { prefs } });
    },
    opId,
  );
}

// ---------------------------------------------------------------- admin actions

export function addSuggestion(pid: string, opId: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    if (p.origin !== "buyer") throw new ActionError("Suggestions are for buyer projects.");
    if (!p.wantsRnSuggestions) throw new ActionError("The buyer has not asked for Revenue Nomad suggestions.");
    if (p.status === "draft" || isEnded(p)) throw new ActionError("Suggestions can only go to a posted, open project.");
    if (suggestionsUsed(s, pid) >= MAX_SUGGESTIONS) throw new ActionError("All 3 suggestions are used on this project.");
    if (inviteOf(s, pid, opId)) throw new ActionError("That operator is already invited.");
    createInvite(s, c, p, opId, "rn_suggested");
    c.event("suggestion_added", { projectId: pid, operatorId: opId });
    const b = buyerById(p.ownerBuyerId)!;
    const op = operatorById(opId)!;
    c.email({
      kind: "suggestions",
      to: { role: "buyer", id: b.id, name: b.contactName, email: b.email },
      subject: `Revenue Nomad suggested ${displayName(op)}, ${p.title}`,
      body: `We invited ${displayName(op)} (${op.role}) to your ${p.title} project. If they respond, they show in your responses labeled Suggested by Revenue Nomad.`,
      links: [{ label: "Open the project", path: `/buyer/projects/${pid}`, as: `buyer:${b.id}` }],
      projectId: pid,
      operatorId: opId,
    });
  });
}

export function nudgeBuyer(pid: string, message: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    const b = buyerById(p.ownerBuyerId);
    if (!b) throw new ActionError("Only buyer projects have a buyer to nudge.");
    p.lastNudgedAt = c.now;
    c.email({
      kind: "nudge",
      to: { role: "buyer", id: b.id, name: b.contactName, email: b.email },
      subject: `A quick nudge on ${p.title}`,
      body: message.trim() || `${b.contactName.split(" ")[0]}, your ${p.title} project could use attention. You can widen visibility to all operators or turn on Revenue Nomad suggestions.`,
      links: [{ label: "Open the project", path: `/buyer/projects/${pid}`, as: `buyer:${b.id}` }],
      projectId: pid,
    });
    c.event("nudge_sent", { projectId: pid, meta: { to: b.id } });
  });
}

export function setAdminNote(pid: string, note: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    p.adminNote = note;
    p.updatedAt = c.now;
  });
}

/** Clearly labeled test tool (gap C2). Submits a response on the operator's behalf from their profile. */
export function simulateResponse(pid: string, opId: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    const msg = respondBlockedMessage(p);
    if (msg) throw new ActionError(msg);
    const existing = responseOf(s, pid, opId);
    if (existing && existing.submittedAt) throw new ActionError("That operator already responded.");
    const op = operatorById(opId)!;
    const r = upsertResponse(s, c, pid, opId);
    Object.assign(r, {
      interest: "interested",
      rate: op.rate,
      hoursPerMonth: op.hrs,
      canStart: p.startTarget,
      answers: p.screeningQuestions.map(() => "Simulated answer for testing."),
      note: "",
      draft: false,
      submittedAt: c.now,
      updatedAt: c.now,
      simulated: true,
    });
    if (p.origin === "revenue_nomad") {
      const e = pipelineOf(s, pid, opId);
      if (e) e.stage = e.stage === "invited" ? "responded" : e.stage;
      else s.pipeline.push({ projectId: pid, operatorId: opId, stage: "responded", note: "", updatedAt: c.now });
    }
    c.event("response_submitted", { projectId: pid, operatorId: opId, meta: { fit: responseFit(p, r).fit, source: r.viaSource, simulated: true } });
  });
}

export function publishRnProject(pid: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    if (p.status !== "draft") throw new ActionError("This project is already published.");
    const errs = validateBrief(p);
    const first = Object.keys(errs)[0];
    if (first) throw new ActionError(errs[first], first);
    p.status = "live";
    p.postedAt = c.now;
    p.respondBy = c.now + RESPOND_WINDOW_DAYS * DAY;
    p.updatedAt = c.now;
    c.event("project_posted", { projectId: p.id, meta: { visibility: p.visibility, origin: p.origin } });
    for (const opId of p.draftInvites || []) createInvite(s, c, p, opId, "admin");
    p.draftInvites = [];
    if (p.audience?.on) {
      p.visibility = "invites_plus_open";
      sendAudienceAlerts(s, c, p);
    } else if (p.visibility === "invites_plus_open") sendAlerts(s, c, p);
    for (const email of p.offPlatformEmails || []) {
      c.email({
        kind: "signup",
        to: { role: "operator", id: email, name: email, email },
        subject: `New role: ${p.title}`,
        body: `A ${p.companyDescriptor} needs a ${p.title} for ${hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hours a month. Pay is $${p.operatorRate}/hr.\nSign up, build a profile and apply to this role in one flow.`,
        links: [{ label: "Sign up and apply", path: `/operators` }],
        projectId: p.id,
      });
      c.event("signup_invite_sent", { projectId: p.id, meta: { email } });
    }
  });
}

/** Segment for a platform audience post: category, availability and a Reputation Index floor. */
export function audienceSegment(s: State, p: Project): Operator[] {
  const a = p.audience;
  if (!a) return [];
  return OPERATORS.filter((o) => {
    if (inviteOf(s, p.id, o.id) || (p.draftInvites || []).includes(o.id)) return false;
    if (a.category !== "Any" && normalizeCategory(o.cat) !== a.category) return false;
    const st = opState(s, o.id);
    if (st.availability === "unavailable") return false;
    if (a.availability === "soon" && !/now|2 weeks/i.test(o.avail)) return false;
    return (o.reputation || 0) >= a.minReputation;
  });
}

function sendAudienceAlerts(s: State, c: Ctx, p: Project) {
  for (const op of audienceSegment(s, p)) {
    if (alertOf(s, p.id, op.id)) continue;
    s.alerts.push({ id: c.id("al"), projectId: p.id, operatorId: op.id, sentAt: c.now, digest: false });
    c.email({
      kind: "alert",
      to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
      subject: `New role: ${p.title}`,
      body: `${op.first}, a ${p.companyDescriptor} needs a ${p.title} for ${hoursRange(p.hoursPerMonthMin, p.hoursPerMonthMax)} hours a month. Pay is $${p.operatorRate}/hr.`,
      links: [opLink(op.id, `/dashboard/projects/${p.id}`, "I am interested"), opLink(op.id, `/dashboard/projects/${p.id}`, "Not for me")],
      projectId: p.id,
      operatorId: op.id,
    });
    c.event("alert_sent", { projectId: p.id, operatorId: op.id, meta: { category: normalizeCategory(op.cat), audience: true } });
  }
}

/** Remind an invited operator who has not responded (admin A4 Nudge). */
export function nudgeOperator(pid: string, opId: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    const op = operatorById(opId)!;
    c.email({
      kind: "invite",
      to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
      subject: `Reminder: ${p.title}`,
      body: `${op.first}, Revenue Nomad invited you to the ${p.title} seat. Pay is ${takeHomeLine(p) || "set by you"}. Responding takes about two minutes.`,
      links: [opLink(op.id, `/dashboard/projects/${p.id}`, "View and respond")],
      projectId: p.id,
      operatorId: op.id,
    });
    c.event("operator_nudged", { projectId: pid, operatorId: opId });
  });
}

/** A direct message from Revenue Nomad to an operator about a project (admin A4 Message). */
export function messageOperator(pid: string, opId: string, text: string) {
  mutate("admin", (s, c) => {
    if (!text.trim()) throw new ActionError("Write a message first.", "message");
    const p = mustProject(s, pid);
    const op = operatorById(opId)!;
    c.email({
      kind: "message",
      to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
      subject: `Message from Revenue Nomad, ${p.title}`,
      body: text.trim(),
      links: [opLink(op.id, `/dashboard/projects/${p.id}`, "Open the project")],
      projectId: p.id,
      operatorId: op.id,
    });
    c.event("operator_messaged", { projectId: pid, operatorId: opId });
  });
}

/** Check in on a placed operator (admin A2 Recently placed). */
export function checkIn(pid: string) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    const op = p.selectedOperatorId ? operatorById(p.selectedOperatorId) : null;
    if (!op) throw new ActionError("Nobody was selected on this project.");
    c.email({
      kind: "checkin",
      to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
      subject: `How is ${p.title} going?`,
      body: `${op.first}, a quick check in from Revenue Nomad on your ${p.title} engagement. Reply with anything we can help with.`,
      links: [opLink(op.id, `/dashboard/projects/${p.id}`, "Open the project")],
      projectId: p.id,
      operatorId: op.id,
    });
    c.event("checked_in", { projectId: pid, operatorId: op.id });
  });
}

export const STAGES: { key: RnStage; label: string }[] = [
  { key: "invited", label: "Invited" },
  { key: "responded", label: "Responded" },
  { key: "shortlisted", label: "Shortlisted" },
  { key: "with_client", label: "With client" },
  { key: "selected", label: "Selected" },
  { key: "not_selected", label: "Not selected" },
];

export function moveStage(pid: string, opId: string, stage: RnStage) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    if (isEnded(p)) throw new ActionError("This project is closed, so the pipeline is locked.");
    let e = pipelineOf(s, pid, opId);
    if (!e) {
      e = { projectId: pid, operatorId: opId, stage: "invited", note: "", updatedAt: c.now } as PipelineEntry;
      s.pipeline.push(e);
    }
    const r = responseOf(s, pid, opId);
    const responded = !!(r && r.submittedAt && r.interest === "interested" && !r.withdrawn);
    if (stage !== "invited" && stage !== "not_selected" && !responded) throw new ActionError("Only operators who responded can move past Invited.");
    const from = e.stage;
    if (stage === "selected") {
      closeProject(s, c, p, "staffed", opId);
    } else {
      e.stage = stage;
      e.updatedAt = c.now;
    }
    c.event("stage_moved", { projectId: pid, operatorId: opId, meta: { from, to: stage } });
  });
}

export function setPipelineNote(pid: string, opId: string, note: string) {
  mutate("admin", (s, c) => {
    const e = pipelineOf(s, pid, opId);
    if (e) {
      e.note = note;
      e.updatedAt = c.now;
    }
  });
}

export interface ShortlistOptions {
  operatorIds?: string[];
  why?: Record<string, string>;
  note?: string;
  showRate?: boolean;
}

/** Send the client a shortlist. Default: everyone in Shortlisted. Never operator pay, listed rates or admin notes. */
export function sendShortlist(pid: string, opts: ShortlistOptions = {}) {
  mutate("admin", (s, c) => {
    const p = mustProject(s, pid);
    const ids = opts.operatorIds ?? s.pipeline.filter((e) => e.projectId === pid && e.stage === "shortlisted").map((e) => e.operatorId);
    if (!ids.length) throw new ActionError(opts.operatorIds ? "Pick at least one operator to send." : "Move at least one operator to Shortlisted first.");
    const showRate = opts.showRate ?? true;
    const ops = ids.map((id) => {
      const op = operatorById(id)!;
      const r = responseOf(s, pid, id);
      return {
        operatorId: op.id,
        name: displayName(op),
        role: op.role,
        fit: r && r.submittedAt ? responseFit(p, r).fit : projectFit(p, op).fit,
        billRate: showRate ? p.billRate ?? null : null,
        hours: r?.hoursPerMonth ?? op.hrs,
        why: (opts.why?.[id] || "").trim(),
      };
    });
    s.shortlists.push({ id: c.id("sl"), projectId: pid, sentAt: c.now, operators: ops, note: (opts.note || "").trim(), showRate });
    for (const id of ids) {
      let e = pipelineOf(s, pid, id);
      if (!e) {
        e = { projectId: pid, operatorId: id, stage: "with_client", note: "", updatedAt: c.now };
        s.pipeline.push(e);
      }
      e.stage = "with_client";
      e.updatedAt = c.now;
    }
    c.email({
      kind: "shortlist",
      to: { role: "client", id: pid, name: p.clientName || "Client", email: `hiring@${(p.clientName || "client").toLowerCase().replace(/[^a-z]+/g, "")}.example` },
      subject: `Your shortlist, ${p.title}`,
      body:
        (opts.note?.trim() ? opts.note.trim() + "\n\n" : "") +
        `${ops.length} operator${ops.length === 1 ? "" : "s"} for your ${p.title} seat${showRate ? ` at $${p.billRate}/hr` : ""}:\n` +
        ops.map((o) => `· ${o.name}, ${o.role}, fit ${o.fit}${o.why ? `. ${o.why}` : ""}`).join("\n"),
      links: [{ label: "Review the shortlist", path: `/client/projects/${pid}`, as: "client" }],
      projectId: pid,
    });
    c.event("shortlist_sent", { projectId: pid, meta: { operators: ids, showRate } });
  });
}

/** Client actions from the shortlist page go to Revenue Nomad, which runs the intro. */
export function clientRequestCall(pid: string, opId: string) {
  mutate("client", (s, c) => {
    const p = mustProject(s, pid);
    const op = operatorById(opId)!;
    c.email({
      kind: "client",
      to: { role: "admin", id: ADMIN.id, name: ADMIN.name, email: ADMIN.email },
      subject: `${p.clientName} wants a call with ${displayName(op)}`,
      body: `${p.clientName} asked for an intro call with ${displayName(op)} for ${p.title}.`,
      links: [{ label: "Open the pipeline", path: `/admin/projects/${pid}`, as: `admin:${ADMIN.id}` }],
      projectId: pid,
      operatorId: opId,
    });
    c.event("client_requested_call", { projectId: pid, operatorId: opId });
  });
}
export function clientAskQuestion(pid: string, text: string) {
  mutate("client", (s, c) => {
    if (!text.trim()) throw new ActionError("Write your question first.", "question");
    const p = mustProject(s, pid);
    c.email({
      kind: "client",
      to: { role: "admin", id: ADMIN.id, name: ADMIN.name, email: ADMIN.email },
      subject: `Question from ${p.clientName}, ${p.title}`,
      body: text.trim(),
      links: [{ label: "Open the pipeline", path: `/admin/projects/${pid}`, as: `admin:${ADMIN.id}` }],
      projectId: pid,
    });
    c.event("client_question", { projectId: pid });
  });
}

export function sendPulse(opIds: string[]) {
  mutate("admin", (s, c) => {
    for (const opId of opIds) {
      const op = operatorById(opId)!;
      c.email({
        kind: "pulse",
        to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
        subject: "Are you open to new fractional work?",
        body: `${op.first}, one tap keeps your profile current. Buyers see when you last confirmed.`,
        links: [
          opLink(op.id, `/dashboard/availability?pulse=open`, "Yes, I'm open now"),
          opLink(op.id, `/dashboard/availability?pulse=from`, "Open from a later date"),
          opLink(op.id, `/dashboard/availability?pulse=unavailable`, "Not available right now"),
        ],
        operatorId: op.id,
      });
      c.event("pulse_sent", { operatorId: opId });
    }
  });
}

export const PROFILE_NUDGE_COOLDOWN_DAYS = 30;

/** Operators a profile nudge would reach now: incomplete, and not nudged in the last 30 days. */
export function profileNudgeTargets(s: State, below = 60): Operator[] {
  const now = nowOf(s);
  const recent = new Set(s.events.filter((e) => e.type === "profile_nudged" && now - e.at < PROFILE_NUDGE_COOLDOWN_DAYS * DAY).map((e) => e.operatorId));
  return OPERATORS.filter((o) => completeness(o).pct < below && !recent.has(o.id));
}

export function nudgeProfiles(opIds: string[]) {
  mutate("admin", (s, c) => {
    for (const opId of opIds) {
      const op = operatorById(opId)!;
      const missing = completeness(op).missing;
      c.email({
        kind: "profile",
        to: { role: "operator", id: op.id, name: displayName(op), email: operatorEmail(op) },
        subject: "Two minutes to get invited to more projects",
        body: `${op.first}, clients and Revenue Nomad invite operators with complete profiles first. Yours is missing ${missing.slice(0, 3).join(", ").toLowerCase() || "a few details"}.`,
        links: [opLink(op.id, `/operators/${op.slug}`, "Finish my profile")],
        operatorId: op.id,
      });
      c.event("profile_nudged", { operatorId: opId, meta: { missing } });
    }
  });
}

export function advanceClock(days: number) {
  mutate("system", (s, c) => {
    s.clockOffsetMs += days * DAY - MINUTE;
    c.event("clock_advanced", { meta: { days, to: dayLabel(CLOCK_BASE + s.clockOffsetMs) } });
  });
}

// ---------------------------------------------------------------- reports (A5), all from events

export function reports(s: State) {
  const ev = s.events;
  const rows = s.projects
    .filter((p) => p.status !== "draft")
    .map((p) => {
      const pe = ev.filter((e) => e.projectId === p.id);
      const posted = pe.find((e) => e.type === "project_posted")?.at ?? null;
      const reached = new Set(pe.filter((e) => e.type === "invite_sent" || e.type === "alert_sent").map((e) => e.operatorId)).size;
      const submitted = pe.filter((e) => e.type === "response_submitted");
      const responders = new Set(submitted.map((e) => e.operatorId)).size;
      const declines = pe.filter((e) => e.type === "response_declined").length;
      const intros = new Set(pe.filter((e) => e.type === "intro_requested").map((e) => e.operatorId)).size;
      const first = submitted.length ? Math.min(...submitted.map((e) => e.at)) : null;
      return {
        project: p,
        reached,
        responders,
        declines,
        responseRate: reached ? responders / reached : null,
        timeToFirst: posted != null && first != null ? first - posted : null,
        intros,
        introRate: responders ? intros / responders : null,
      };
    });
  const declineReasons: Record<string, number> = {};
  for (const e of ev) if (e.type === "response_declined" || e.type === "response_withdrawn") {
    const k = String(e.meta?.reason || "No reason");
    declineReasons[k] = (declineReasons[k] || 0) + 1;
  }
  const alertsByRole: Record<string, number> = {};
  for (const e of ev) if (e.type === "alert_sent") {
    const k = String(e.meta?.category || "Unknown");
    alertsByRole[k] = (alertsByRole[k] || 0) + 1;
  }
  return { rows, declineReasons, alertsByRole };
}

export function tierFor(fit: number) {
  return tierOf(fit);
}
