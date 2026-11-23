/**
 * Workflows, the server's half (Stage 7b, Beta, behind RN_WORKFLOWS; off by default, and then the
 * Workflows tab says "Coming soon · Beta" and nothing here runs or saves):
 *
 *   GET  /api/table?workflows=1         workflowsFor: the member's workflows, runs, prices and plan (WorkflowsAnswer)
 *   GET  /api/table?workflows=drafts    draftsFor: the notes workflows drafted (Messages shows them, drafts only)
 *   POST { action: { type: "workflow.save" | "workflow.on" | "workflow.remove" | "workflow.approve" | "workflow.draftRemove" } }
 *
 * Where runs come from: the watch pass (lib/notify/events.ts afterWatch, every 15 minutes at most)
 * hands this file what it found (watchEvents: the same signals, facts and new leaders its alerts
 * use: no second watcher), and Close's alert dispatch (lib/close/server.ts) hands it a proposal
 * opened or signed (afterProposal). The scheduler's tick sends due reminders (workflowTick).
 */
import { loadSeed, loadState, ActionError, tableInternals as T, memberByToken, type Member, type Seed, type State } from "../table";
import { COMPANY_PRICE } from "../tableFields";
import {
  RECIPES, STEPS, TRIGGERS, WF_LIMITS, WfProblem, cleanFlow, planHolds, runCeiling, sayFlow, triggerWords,
  type FlowRow, type StepPrices, type WfDraft, type WfTrigger, type Workflow, type WorkflowsAnswer,
} from "./types";
import { WfAnswer, approveRun, capWorkflows, monthSpent, planFor, remindersDue, runEvents, wfIn, workflowsOn, type WfEvent } from "./run";
import { newWfId } from "./steps";
import { hasKnownSources } from "../notify/knownView";

export { workflowsOn, runEvents, approveRun, remindersDue, type WfEvent };

const DAY = 86_400_000;
const SIGNED_OUT = "You're signed out. Sign in again to change your workflows.";
const OFF = "Workflows aren't switched on yet. They are in Beta and come soon.";

/** A person's name and title: one purchase, as every gated fact, 1 credit. */
const PERSON_PRICE = 1;

/** What a paid step costs this member now, from the app's own rules. */
export function pricesFor(s: State, memberId: string, nowMs = Date.now()): StepPrices {
  const opensLeft = T.freeCompaniesLeft(s, memberId, nowMs);
  return { company: opensLeft > 0 ? 0 : COMPANY_PRICE, companyFull: COMPANY_PRICE, ballFree: T.crystalOf(s, memberId, nowMs) === "all", opensLeft, person: PERSON_PRICE };
}

const listsOf = (s: State, memberId: string) => (s.connector?.alerts?.[memberId] ?? []).map((v) => ({ id: v.id, name: v.name }));

/** The Alerts page's Workflows tab. */
export function viewOf(seed: Seed, s: State, m: Member, nowMs = Date.now()): WorkflowsAnswer {
  if (!workflowsOn()) return { on: false };
  const w = s.workflows?.[m.id];
  const plan = planFor(s, m.id, nowMs);
  const prices = pricesFor(s, m.id, nowMs);
  const lists = listsOf(s, m.id);
  const month = new Date(nowMs - 30 * DAY).toISOString();
  const runs = w?.runs ?? [];
  const names = new Map((w?.flows ?? []).map((f) => [f.id, f.name]));
  const flows: FlowRow[] = (w?.flows ?? []).map((f) => {
    const mine = runs.filter((r) => r.wf === f.id);
    const recent = mine.filter((r) => r.at >= month);
    return {
      id: f.id,
      name: f.name,
      say: sayFlow(f, f.scope.kind === "list" ? lists.find((l) => l.id === f.scope.list)?.name ?? null : null),
      on: f.on,
      trigger: f.trigger,
      scope: f.scope,
      steps: f.steps,
      cap: f.cap,
      warn: f.warn,
      runs30: recent.length,
      spent30: recent.reduce((n, r) => n + r.spent, 0),
      spentMonth: monthSpent(w, f.id, nowMs),
      last: mine[0]?.at ?? null,
      waiting: mine.filter((r) => r.ask && !r.ask.answer).length,
      ceiling: runCeiling(f.steps, f.scope, prices).total,
      holds: planHolds(f, plan),
    };
  });
  // From the credit history itself: every line a workflow spent carries its name.
  const spent30 = s.ledger.filter((l) => l.memberId === m.id && l.wf && l.at >= month).reduce((n, l) => n + Math.max(0, -l.delta), 0);
  return {
    on: true,
    plan: { tier: plan.tier, flows: plan.flows, paid: plan.paid, proposals: plan.proposals, evidence: plan.evidence },
    flows,
    runs: runs.slice(0, 60).map((r) => ({ ...r, name: names.get(r.wf) ?? "A workflow you removed" })),
    prices,
    lists,
    funding: fundingOn(),
    sources: hasKnownSources(s, m.id),
    spent30,
    waiting: runs.filter((r) => r.ask && !r.ask.answer).length,
    drafts: w?.drafts.length ?? 0,
    credits: T.balance(s, m.id),
  };
}
const fundingOn = () => process.env.RN_FUNDING === "1";

/** GET ?workflows=1. Null when signed out. */
export async function workflowsFor(token: string | null, nowMs = Date.now()): Promise<WorkflowsAnswer | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  return m ? viewOf(seed, s, m, nowMs) : null;
}

/** GET ?workflows=drafts: the notes workflows drafted, newest first. Drafts only: nothing here was sent. */
export async function draftsFor(token: string | null): Promise<{ drafts: (WfDraft & { name: string })[] } | { on: false } | null> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) return null;
  if (!workflowsOn()) return { on: false };
  const w = s.workflows?.[m.id];
  const names = new Map((w?.flows ?? []).map((f) => [f.id, f.name]));
  return { drafts: (w?.drafts ?? []).map((d) => ({ ...d, name: names.get(d.wf) ?? "A workflow" })) };
}

/* ---------- the actions ---------- */

export async function performWorkflow(token: string | null, a: { type: string } & Record<string, unknown>, origin?: string): Promise<{ message: string; workflows?: WorkflowsAnswer }> {
  const [seed0, s0] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed0, token, s0);
  if (!m) throw new ActionError(SIGNED_OUT);
  if (!workflowsOn()) throw new ActionError(OFF);
  const nowMs = Date.now();
  const at = new Date(nowMs).toISOString();
  const answer = async (message: string) => {
    const [seed, s] = await Promise.all([loadSeed(), loadState()]);
    return { message, workflows: viewOf(seed, s, m, nowMs) };
  };
  try {
    switch (a.type) {
      case "workflow.save": {
        const c = cleanFlow(a);
        const plan = planFor(s0, m.id, nowMs);
        const holds = planHolds(c, plan);
        if (holds.trigger) throw new ActionError(`${TRIGGERS[c.trigger].name} is part of Close, as proposals are.`);
        const held = Object.entries(holds.steps)[0] as [keyof typeof STEPS, string] | undefined;
        if (held) throw new ActionError(`${STEPS[held[0]].name} is ${held[1].toLowerCase()}. On your plan a workflow runs the free steps.`);
        if (TRIGGERS[c.trigger].funding && !fundingOn()) throw new ActionError("Funding filings aren't switched on yet, so nothing would set this off.");
        const lists = listsOf(s0, m.id);
        if (c.scope.kind === "list" && !lists.some((l) => l.id === c.scope.list)) throw new ActionError("That list isn't one of yours anymore. Pick another.");
        const listName = c.scope.kind === "list" ? lists.find((l) => l.id === c.scope.list)?.name ?? null : null;
        const id = typeof a.id === "string" ? a.id : "";
        const name = c.name || sayFlow(c, listName);
        const on = a.on !== false;
        const msg = await T.mutate((d) => {
          const w = wfIn(d, m.id);
          const cur = id ? w.flows.find((f) => f.id === id) : undefined;
          if (id && !cur) throw new ActionError("That workflow is gone. Make it again from a recipe.");
          if (!cur && w.flows.length >= plan.flows)
            throw new ActionError(plan.flows === 1 ? "Free keeps one workflow. Change the one you have, or see what Pro includes." : `Your plan keeps ${plan.flows} workflows. Remove one first.`);
          if (cur) {
            Object.assign(cur, { ...c, name, on, updatedAt: at });
            if (cur.warn !== c.warn) delete cur.warned;
            return `Saved. ${on ? "It is on." : "It is off."}`;
          }
          w.flows.push({ id: newWfId("wf"), ...c, name, on, createdAt: at, updatedAt: at } as Workflow);
          capWorkflows(w, nowMs);
          return on ? "It is on. Each run shows in Runs with what it did and what it cost." : "Saved, and off until you turn it on.";
        });
        return answer(msg);
      }
      case "workflow.on": {
        const on = a.on === true;
        const msg = await T.mutate((d) => {
          const f = wfIn(d, m.id).flows.find((x) => x.id === a.id);
          if (!f) throw new ActionError("That workflow is gone.");
          f.on = on;
          f.updatedAt = at;
          return on ? `${f.name} is on.` : `${f.name} is off. Nothing runs or spends until you turn it on.`;
        });
        return answer(msg);
      }
      case "workflow.remove": {
        const msg = await T.mutate((d) => {
          const w = wfIn(d, m.id);
          const k = w.flows.findIndex((x) => x.id === a.id);
          if (k < 0) throw new ActionError("That workflow is gone already.");
          const [f] = w.flows.splice(k, 1);
          w.reminders = w.reminders.filter((r) => r.wf !== f.id);
          return "Removed. Its runs stay in the log for 90 days, and what it spent stays in your credit history.";
        });
        return answer(msg);
      }
      case "workflow.approve": {
        const run = typeof a.run === "string" ? a.run : "";
        const msg = await approveRun(m.id, run, a.yes === true, origin, nowMs);
        return answer(msg);
      }
      case "workflow.draftRemove": {
        await T.mutate((d) => {
          const w = wfIn(d, m.id);
          w.drafts = w.drafts.filter((x) => x.id !== a.id);
        });
        return answer("Draft removed.");
      }
    }
  } catch (e) {
    if (e instanceof WfProblem || e instanceof WfAnswer) throw new ActionError(e.message);
    throw e;
  }
  throw new ActionError("That didn't go through. Refresh the page and try again.");
}

/* ---------- from the watch pass ---------- */

/** Members with a workflow on, and the triggers they watch. Empty while RN_WORKFLOWS is off. */
export function workflowWatchers(s: State): Map<string, Set<WfTrigger>> {
  const out = new Map<string, Set<WfTrigger>>();
  if (!workflowsOn()) return out;
  for (const [id, w] of Object.entries(s.workflows ?? {})) {
    if (s.closures?.[id]) continue;
    const t = new Set(w.flows.filter((f) => f.on).map((f) => f.trigger));
    if (t.size) out.set(id, t);
  }
  return out;
}

/** What the watch pass found in its window, as it found it (lib/notify/events.ts). */
export interface WatchFound {
  /** detectSignals' rows (the radar's): role, adjacent (a recent hire), seat, arrival (a new leader), funding. */
  signals: { key: string; kind: string; at: string; companyId: string; fn: string | null; amount?: string | null; round?: string | null; fundNote?: string | null; arrived?: { level?: string | null } | null }[];
  /** Facts that changed, by company: what, and who wrote them. */
  facts: Map<string, { says: Set<string>; by: Set<string> }>;
  /** New leaders (lib/notify/knownView.ts newLeadersIn), for Someone you know changed jobs. */
  leaders: import("../notify/known").NewLeader[];
}

const capFirst = (v: string) => v.charAt(0).toUpperCase() + v.slice(1);
const listWords = (xs: string[]) => (xs.length <= 1 ? xs[0] ?? "" : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

/**
 * The events for each member's workflows from what the watch found, each line as that member sees
 * Merlin (lib/notify/events.ts says them the same): a company they haven't opened is described by
 * its industry and size, never named; Someone you know names nobody at a locked company, nor a
 * Californian, and a name from their Google account stays out of email and Slack (lineOut).
 */
export async function watchEvents(seed: Seed, s: State, found: WatchFound, nowMs: number, nowIso: string): Promise<WfEvent[]> {
  const who = workflowWatchers(s);
  if (!who.size) return [];
  const [{ listCompanies }, { crystalCompanyIds }, kv, { knownMoves, knownLine }, { personKey }, { functionFor }] = await Promise.all([
    import("../hireAlerts"),
    import("../radar"),
    import("../notify/knownView"),
    import("../notify/known"),
    import("../paths/match"),
    import("../notify/index"),
  ]);
  const g = T.graph(seed, s);
  const idx = T.memberIndex(seed, s);
  const tracks = T.tracksOf(seed, s);
  const out: WfEvent[] = [];
  for (const [memberId, triggers] of who) {
    const m = idx.byId.get(memberId);
    if (!m) continue;
    const flows = s.workflows![memberId].flows.filter((f) => f.on);
    const named = (companyId: string) => (T.identityHidden(g, s, idx, tracks, m, companyId) ? null : g.companies.get(companyId)?.name || null);
    const coWords = (companyId: string) => named(companyId) ?? kv.lockedWords(g, s, companyId);
    const href = (companyId: string) => `/?c=${encodeURIComponent(T.pubId(companyId))}`;
    const listIds = new Set(flows.filter((f) => f.scope.kind === "list" && f.scope.list).map((f) => f.scope.list!));
    const views = T.alertViewsOf(s, m.id, s.connector?.alerts?.[m.id] ?? [], nowMs).filter((v) => listIds.has(v.id));
    const companyTriggers = [...triggers].some((t) => t !== "known" && TRIGGERS[t].company);
    const listCos = views.length && companyTriggers && (found.signals.length || found.facts.size) ? await listCompanies(m, views).catch(() => new Map<string, Map<string, unknown>>()) : new Map<string, Map<string, unknown>>();
    const ball = flows.some((f) => f.scope.kind === "radar") ? crystalCompanyIds(seed, s, m, nowMs) : new Set<string>();
    const follows = new Set(s.follows[m.id] ?? []);
    const where = (companyId: string) => {
      const pub = T.pubId(companyId);
      return { lists: [...listCos].filter(([, mp]) => mp.has(pub)).map(([id]) => id), radar: ball.has(companyId), follows: follows.has(companyId) };
    };
    const inScope = (w: ReturnType<typeof where>) => w.lists.length > 0 || w.radar || w.follows;
    const myFn = functionFor(s, m);
    for (const x of found.signals) {
      const trig: WfTrigger | null = x.kind === "role" ? "role" : x.kind === "adjacent" ? "hire" : x.kind === "seat" ? "seat" : x.kind === "arrival" ? "leader" : x.kind === "funding" ? "funding" : null;
      if (!trig || !triggers.has(trig)) continue;
      if (trig === "role" && myFn && myFn !== "Other" && x.fn && x.fn !== myFn) continue;
      const w = where(x.companyId);
      if (!inScope(w)) continue;
      const co = coWords(x.companyId);
      const fn = x.fn && x.fn !== "Other" ? `${x.fn} ` : "";
      const line =
        trig === "role"
          ? `${capFirst(co)} posted a fractional ${fn}role`
          : trig === "hire"
            ? `${capFirst(co)} hired a fractional ${fn}leader`
            : trig === "seat"
              ? `A fractional ${fn}seat ended at ${co}`
              : trig === "leader"
                ? `A new ${fn}leader${x.arrived?.level ? ` (${x.arrived.level})` : ""} on the website of ${co}`
                : `${capFirst(co)} raised ${x.amount ?? "money"}${x.round ? ` (${x.round})` : ""} · ${x.fundNote ?? "SEC filing"}`;
      out.push({ memberId, key: x.key, trigger: trig, at: x.at, companyId: x.companyId, line: capFirst(line), href: href(x.companyId), fn: x.fn, ...w });
    }
    if (triggers.has("fact"))
      for (const [companyId, f] of found.facts) {
        if ([...f.by].every((b) => b === m.id)) continue;
        const w = where(companyId);
        if (!inScope(w)) continue;
        out.push({ memberId, key: `fact:${T.pubId(companyId)}:${nowIso.slice(0, 16)}`, trigger: "fact", at: nowIso, companyId, line: `New at ${coWords(companyId)}: ${listWords([...f.says].slice(0, 3))}`, href: href(companyId), fn: null, ...w });
      }
    if (triggers.has("known") && found.leaders.length && kv.hasKnownSources(s, m.id)) {
      for (const mv of knownMoves(kv.knownPeopleOf(s, m, g), found.leaders, personKey(m.name), kv.companyByName(g))) {
        const name = named(mv.leader.companyId);
        const locked = name ? null : kv.lockedWords(g, s, mv.leader.companyId);
        const line = knownLine(mv, name, locked);
        // A name from the member's Google account stays on their own screens: email and Slack read "Someone you know".
        const lineOut = mv.person.src === "google" ? knownLine({ ...mv, leader: { ...mv.leader, californian: true } }, name, locked) : undefined;
        out.push({ memberId, key: `known:${mv.leader.key}`, trigger: "known", at: mv.leader.at, companyId: mv.leader.companyId, line, ...(lineOut ? { lineOut } : {}), href: href(mv.leader.companyId), fn: mv.leader.fn });
      }
    }
  }
  return out;
}

/* ---------- from Close (a client opened or signed) ---------- */

/** Close's dispatch told the member about their proposal: a first open, or fully signed. Their workflows on those run. */
export function afterProposal(memberId: string, f: { kind: string; item: string; title: string; what: string; signed?: unknown; declined?: unknown }, nowMs = Date.now()): Promise<number> {
  if (!workflowsOn()) return Promise.resolve(0);
  const trig: WfTrigger | null = f.kind === "open" ? "opened" : f.kind === "signed" && f.signed && !f.declined ? "signed" : null;
  if (!trig) return Promise.resolve(0);
  const what = f.what === "document" ? "document" : "proposal";
  const title = String(f.title ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
  const line = trig === "opened" ? `A client opened your ${what}${title ? ` ${title}` : ""}` : `Your ${what}${title ? ` ${title}` : ""} is signed`;
  const href = "/?p=proposals";
  return runEvents([{ memberId, key: `${trig}:${f.item}`, trigger: trig, at: new Date(nowMs).toISOString(), companyId: null, line, href, title }], undefined, nowMs);
}

/* ---------- the scheduler's tick ---------- */

/** Reminders that are due go to the bell. Never throws. */
export async function workflowTick(nowMs = Date.now()): Promise<number> {
  if (!workflowsOn()) return 0;
  try {
    return await remindersDue(nowMs);
  } catch (e) {
    console.error("workflows: reminders failed", e instanceof Error ? e.message : "error");
    return 0;
  }
}

export const recipeList = () => RECIPES;
export { triggerWords, WF_LIMITS };
