/**
 * Workflows v2, the server's half for /api/workflows2 (RN_WORKFLOWS_V2; with it off the route
 * answers 404 to everything and nothing here is called).
 *
 *   list, get            the member's workflows (saved graphs, and today's converted to a line), with the catalog, the checks and the credit ceilings
 *   save                 save a draft: shapes and settings checked, then the rules (graph.ts checkGraph); refused in plain words
 *   live                 Make live: the draft becomes the live version (the old one is kept for runs in flight)
 *   on, node             the workflow's switch, a node's switch
 *   test                 a test run on sample data: never spends, never sends
 *   runs, run            runs of a workflow (newest first), one run's nodes
 *   retry, answer        Retry from the failed node; a tap on a waiting run
 *   run now, remove, describe (a sentence to a draft, never live)
 *   hook                 an incoming webhook: the workflow's own secret is its only key
 *
 * Everything is the member's own: a workflow or a run is found in their own state or refused.
 */
import { timingSafeEqual, randomBytes } from "node:crypto";
import { loadSeed, loadState, memberByToken, tableInternals as T, type Member } from "../table";
import * as G from "./graph";
import { RunAnswer, answerRun, fireOne, graphsOf, monthSpentV2, retryRun, testRun, v2On } from "./graphRun";
import { planFor, wfIn, workflowsOn } from "./run";
import { newWfId } from "./steps";
import { describe } from "./describe";
import { emailsFrom, v2Of } from "./v2mode";
import { TRIAL_OPENS_DAILY } from "../tableFields";

export { v2On };
export class V2Problem extends Error {
  constructor(message: string, readonly status = 400) {
    super(message);
  }
}
const SIGNED_OUT = "You're signed out. Sign in again to change your workflows.";
const GONE = "That workflow is gone.";
/** Simple mode saves only with a monthly credit limit: the runner stops spending at it and asks first (graphRun.ts, the cap). */
export const SIMPLE_NEEDS_CAP = "Set a monthly credit limit. A Simple workflow stops spending at it and asks you before going past it.";

async function who(token: string | null): Promise<Member> {
  if (!token) throw new V2Problem(SIGNED_OUT, 401);
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = memberByToken(seed, token, s);
  if (!m) throw new V2Problem(SIGNED_OUT, 401);
  // RN_WORKFLOWS_V2=optin: v2 is only for members with the new design on. Everyone else: as if it were off.
  if (!v2Of(s, emailsFrom(seed, s))(m.id)) throw new V2Problem("Not found.", 404);
  return m;
}
const gatesOf = (s: Awaited<ReturnType<typeof loadState>>, memberId: string, nowMs: number) => {
  const p = planFor(s, memberId, nowMs);
  return { gates: { tier: p.tier, paid: p.paid, proposals: p.proposals, evidence: p.evidence } as G.PlanGates, flows: p.flows };
};
const switches = async (): Promise<G.SwitchesOn> => ({ funding: process.env.RN_FUNDING === "1", calls: (await import("../calls")).callTriggersOn(), send: (await import("../send")).sendOn() });
const listsOf = (s: Awaited<ReturnType<typeof loadState>>, memberId: string) => (s.connector?.alerts?.[memberId] ?? []).map((v) => v.id);

/** The catalog as the builder shows it: each node's words, group, outputs, plan hold and whether it is connected yet. */
export function catalogFor(gates: G.PlanGates) {
  return G.NODE_TYPES.map((t) => {
    const i = G.info(t);
    return { type: t, group: i.group, name: i.name, sub: i.sub, paid: !!i.paid, sends: !!i.sends, pauses: !!i.pauses, hold: G.holdOf(t, gates), stub: i.stub ?? null, outs: G.outsOf({ type: t, settings: {} }) };
  });
}

/* ---------- reading ---------- */

export async function list(token: string | null, nowMs = Date.now()) {
  const m = await who(token);
  const s = await loadState();
  const w = s.workflows?.[m.id];
  const { gates } = gatesOf(s, m.id, nowMs);
  const prices = (await import("./index")).pricesFor(s, m.id, nowMs);
  const runs = w?.graphRuns ?? [];
  const month = new Date(nowMs - 30 * 86_400_000).toISOString();
  return {
    on: true as const,
    // Merlin's runner (RN_WORKFLOWS): off, nothing runs or spends, so the page never says Live.
    running: workflowsOn(),
    plan: gates,
    // What each paid step costs this member now (the new design's Simple mode says it on each step).
    prices,
    // How companies open for this member: Pro and Close open every one; the trial, up to its daily count, then the usual price (which counts toward a workflow's limit).
    opens: { access: T.accessFor(s, m.id, nowMs), trialDaily: TRIAL_OPENS_DAILY, left: T.trialOpensLeft(s, m.id, nowMs) },
    catalog: catalogFor(gates),
    workflows: graphsOf(w).map(({ g, stored }) => {
      const mine = runs.filter((r) => r.wf === g.id && !r.test);
      return {
        id: g.id,
        name: g.name,
        on: g.on,
        stored,
        from: g.from ?? null,
        mode: g.mode ?? null,
        live: g.live?.v ?? null,
        draft: g.draft?.v ?? null,
        notLive: !!g.draft,
        trigger: g.live ? G.triggerOf(g.live)?.type ?? null : g.draft ? G.triggerOf(g.draft)?.type ?? null : null,
        steps: (g.live ?? g.draft)?.nodes.length ?? 0,
        ceiling: g.live ? G.graphCeiling(g.live, prices, gates) : 0,
        cap: g.cap,
        warn: g.warn,
        spentMonth: monthSpentV2(w, g.id, nowMs),
        runs30: mine.filter((r) => r.at >= month).length,
        waiting: mine.filter((r) => r.status === "waiting").length,
        failed: mine.filter((r) => r.status === "failed").length,
      };
    }),
  };
}

function ownGraph(w: ReturnType<typeof wfIn> | undefined, id: unknown) {
  const e = graphsOf(w).find((x) => x.g.id === String(id ?? ""));
  if (!e) throw new V2Problem(GONE, 404);
  return e;
}

export async function getOne(token: string | null, id: unknown, origin = "", nowMs = Date.now()) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  const { gates } = gatesOf(s, m.id, nowMs);
  const prices = (await import("./index")).pricesFor(s, m.id, nowMs);
  const sw = await switches();
  const lists = listsOf(s, m.id);
  const chk = (v: G.GraphVersion | null) => (v ? G.checkGraph(v, gates, prices, sw, lists) : null);
  const { hook: secret, ...rest } = g;
  const hookOn = [g.live, g.draft].some((v) => v && G.triggerOf(v)?.type === "trig.webhook");
  return { workflow: rest, liveCheck: chk(g.live), draftCheck: chk(g.draft), ...(hookOn && secret ? { hook: `${origin.replace(/\/$/, "")}/api/workflows2?hook=${encodeURIComponent(`${g.id}.${secret}`)}` } : {}) };
}

/* ---------- saving ---------- */

/** Save a draft. New: a workflow off, nothing live yet. Today's workflow: saved as a graph (same id) that takes its place. */
export async function save(token: string | null, raw: Record<string, unknown>, nowMs = Date.now()) {
  const m = await who(token);
  const s = await loadState();
  const { gates, flows } = gatesOf(s, m.id, nowMs);
  const at = new Date(nowMs).toISOString();
  const w0 = s.workflows?.[m.id];
  const id = typeof raw.id === "string" && raw.id ? raw.id : null;
  const cur = id ? ownGraph(w0, id) : null;
  const nextV = cur ? Math.max(cur.g.live?.v ?? 0, cur.g.draft?.v ?? 0, ...cur.g.versions.map((x) => x.v)) + (cur.g.draft ? 0 : 1) : 1;
  let version: G.GraphVersion;
  let cw: { cap: number | null; warn: number | null };
  try {
    version = G.cleanVersion(raw.version, nextV, at);
    cw = G.cleanCapWarn(raw.cap === undefined ? cur?.g.cap : raw.cap, raw.warn === undefined ? cur?.g.warn : raw.warn);
  } catch (e) {
    throw new V2Problem(e instanceof Error ? e.message : "That didn't save.");
  }
  // Simple mode (lib/workflows/simple.ts): the monthly credit limit is not optional. It is the cap the runner enforces.
  const mode: "simple" | undefined = raw.mode === "simple" ? "simple" : raw.mode === "advanced" ? undefined : cur?.g.mode;
  if (mode === "simple" && (cw.cap === null || cw.cap < 1)) throw new V2Problem(SIMPLE_NEEDS_CAP);
  const prices = (await import("./index")).pricesFor(s, m.id, nowMs);
  const check = G.checkGraph(version, gates, prices, await switches(), listsOf(s, m.id));
  if (!check.ok) throw new V2Problem(check.problems[0]);
  const name = String(raw.name ?? cur?.g.name ?? "").replace(/\s+/g, " ").trim().slice(0, G.V2_LIMITS.name);
  return T.mutate((d) => {
    const w = wfIn(d, m.id);
    w.graphs ??= [];
    const had = cur ? w.graphs.find((x) => x.id === cur.g.id) : undefined;
    if (!cur && graphsOf(w).length >= flows) throw new V2Problem(flows === 1 ? "Free keeps one workflow. Change the one you have, or see what Pro includes." : `Your plan keeps ${flows} workflows. Remove one first.`);
    if (had) {
      Object.assign(had, { draft: version, name: name || had.name, ...cw, updatedAt: at, ...(raw.notifyOnFail === undefined ? {} : { notifyOnFail: raw.notifyOnFail !== false }) });
      if (mode) had.mode = mode;
      else delete had.mode;
      return { id: had.id, message: had.live ? "Saved. Changes not live yet: Make live when you're ready." : "Saved as a draft. Make it live to turn it on." };
    }
    if (cur) {
      // Today's workflow, saved as a graph for the first time: it keeps its id, switch and live version.
      const g = { ...cur.g, draft: version, name: name || cur.g.name, ...cw, ...(mode ? { mode } : {}), updatedAt: at };
      w.graphs.push(g);
      return { id: g.id, message: "Saved. Changes not live yet: Make live when you're ready." };
    }
    const g: G.GraphWorkflow = { id: newWfId("wf"), name: name || "A new workflow", on: false, live: null, draft: version, versions: [], ...cw, ...(mode ? { mode } : {}), notifyOnFail: raw.notifyOnFail !== false, createdAt: at, updatedAt: at };
    w.graphs.push(g);
    return { id: g.id, message: "Saved as a draft, and off. Make it live, then turn it on." };
  });
}

/** Make live: the draft runs from now on. Runs in flight finish on the version they started with. */
export async function makeLive(token: string | null, id: unknown, nowMs = Date.now()) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  if (!g.draft) throw new V2Problem("Nothing new to make live.");
  const { gates } = gatesOf(s, m.id, nowMs);
  const check = G.checkGraph(g.draft, gates, (await import("./index")).pricesFor(s, m.id, nowMs), await switches(), listsOf(s, m.id));
  if (!check.ok) throw new V2Problem(check.problems[0]);
  const at = new Date(nowMs).toISOString();
  return T.mutate((d) => {
    const w = wfIn(d, m.id);
    const x = (w.graphs ??= []).find((y) => y.id === g.id);
    if (!x || !x.draft) throw new V2Problem(GONE, 404);
    if (x.live) x.versions = [x.live, ...x.versions].slice(0, G.V2_LIMITS.versions);
    x.live = { ...x.draft, savedAt: at };
    x.draft = null;
    x.updatedAt = at;
    if (G.triggerOf(x.live)?.type === "trig.webhook" && !x.hook) x.hook = randomBytes(18).toString("base64url");
    return { id: x.id, message: x.on ? "Live. New runs use it now." : "Live. Turn it on to start." };
  });
}

export async function setOn(token: string | null, id: unknown, on: boolean) {
  const m = await who(token);
  const s = await loadState();
  const { g, stored } = ownGraph(s.workflows?.[m.id], id);
  if (on && !g.live) throw new V2Problem("Make it live first.");
  const at = new Date().toISOString();
  return T.mutate((d) => {
    const w = wfIn(d, m.id);
    // Today's workflow not saved as a graph: its own switch, exactly as Alerts turns it.
    const x = stored ? w.graphs?.find((y) => y.id === g.id) : w.flows.find((y) => y.id === g.id);
    if (!x) throw new V2Problem(GONE, 404);
    x.on = on;
    x.updatedAt = at;
    if (stored && on) (x as G.GraphWorkflow).fails = 0;
    return { id: g.id, message: on ? `${g.name} is on.` : `${g.name} is off. Nothing runs or spends until you turn it on.` };
  });
}

/** A node's switch, in the live version and the draft. Off: skipped, and what came in carries on (an off approval stops its path). */
export async function setNodeOn(token: string | null, id: unknown, node: unknown, on: boolean) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  const nid = String(node ?? "");
  if (![g.live, g.draft].some((v) => v?.nodes.some((n) => n.id === nid))) throw new V2Problem("That step isn't in this workflow anymore.");
  if ([g.live, g.draft].some((v) => v && G.triggerOf(v)?.id === nid)) throw new V2Problem("The trigger stays on. Turn the workflow off instead.");
  return T.mutate((d) => {
    const w = wfIn(d, m.id);
    w.graphs ??= [];
    let x = w.graphs.find((y) => y.id === g.id);
    if (!x) {
      x = structuredClone(g);
      w.graphs.push(x);
    }
    for (const v of [x.live, x.draft]) for (const n of v?.nodes ?? []) if (n.id === nid) n.on = on;
    x.updatedAt = new Date().toISOString();
    return { id: x.id, message: on ? "Step on." : "Step off: skipped, and what came in carries on." };
  });
}

export async function remove(token: string | null, id: unknown) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  return T.mutate((d) => {
    const w = wfIn(d, m.id);
    w.graphs = (w.graphs ?? []).filter((x) => x.id !== g.id);
    w.flows = w.flows.filter((x) => x.id !== g.id);
    w.reminders = w.reminders.filter((r) => r.wf !== g.id);
    return { message: "Removed. Its runs stay in the log for 90 days, and what it spent stays in your credit history." };
  });
}

/* ---------- runs ---------- */

export async function test(token: string | null, id: unknown, sample: unknown, origin?: string) {
  const m = await who(token);
  const r = (sample && typeof sample === "object" ? sample : {}) as { fields?: unknown; company?: unknown };
  const fields: G.Fields = {};
  if (r.fields && typeof r.fields === "object")
    for (const [k, v] of Object.entries(r.fields as Record<string, unknown>).slice(0, 20)) {
      const key = G.fieldName(k);
      if (key) fields[key] = typeof v === "number" || typeof v === "boolean" ? v : String(v ?? "").slice(0, G.V2_LIMITS.field);
    }
  const run = await wrap(() => testRun(m.id, String(id ?? ""), { fields, company: typeof r.company === "string" ? r.company : null }, origin));
  return { run, message: "Tested. Nothing was spent or sent." };
}

export async function runs(token: string | null, id: unknown) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  return {
    runs: (s.workflows?.[m.id]?.graphRuns ?? [])
      .filter((r) => r.wf === g.id)
      .map((r) => ({ id: r.id, at: r.at, test: r.test, status: r.status, line: r.line, quote: r.quote, estimate: r.estimate, spent: r.spent, waiting: r.wait?.kind ?? null, failedAt: r.failedAt ?? null, v: r.v })),
  };
}
export async function runOf(token: string | null, id: unknown, runId: unknown) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  const run = s.workflows?.[m.id]?.graphRuns?.find((r) => r.id === String(runId ?? "") && r.wf === g.id);
  if (!run) throw new V2Problem("That run is gone.", 404);
  // What the member reads: never the steps still to run as ids alone, never a webhook's secret.
  const { frontier: _f, visits: _v, ...view } = run; // eslint-disable-line @typescript-eslint/no-unused-vars
  return { run: view };
}
const wrap = async <R>(work: () => Promise<R>): Promise<R> => {
  try {
    return await work();
  } catch (e) {
    if (e instanceof RunAnswer) throw new V2Problem(e.message);
    throw e;
  }
};
export async function retry(token: string | null, id: unknown, runId: unknown, origin?: string) {
  const m = await who(token);
  const s = await loadState();
  ownGraph(s.workflows?.[m.id], id);
  return { message: await wrap(() => retryRun(m.id, String(runId ?? ""), origin)) };
}
export async function answer(token: string | null, runId: unknown, yes: boolean, origin?: string) {
  const m = await who(token);
  return { message: await wrap(() => answerRun(m.id, String(runId ?? ""), yes, origin)) };
}
export async function runNow(token: string | null, id: unknown, origin?: string) {
  const m = await who(token);
  const s = await loadState();
  const { g } = ownGraph(s.workflows?.[m.id], id);
  if (g.live && G.triggerOf(g.live)?.type !== "trig.manual") throw new V2Problem("Run now is for a workflow that starts with Run now. Use Test to try this one.");
  const n = await wrap(() => fireOne(m.id, g.id, "manual", {}, origin));
  return { message: n ? "It ran. See it in Runs." : "It didn't run: it already ran 25 times today, or it is off." };
}

/** A sentence to a draft workflow (saved as a draft, off, nothing live). */
export async function describeFor(token: string | null, text: unknown, nowMs = Date.now()) {
  const m = await who(token);
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 4) throw new V2Problem("Say what should happen, in a sentence.");
  const s = await loadState();
  const d = await describe(m.id, t, listsOf(s, m.id), nowMs);
  const { gates } = gatesOf(s, m.id, nowMs);
  const check = G.checkGraph({ ...d.version, v: 1 }, gates, (await import("./index")).pricesFor(s, m.id, nowMs), await switches(), listsOf(s, m.id));
  return { name: d.name, version: d.version, via: d.via, notes: d.notes, check };
}

/* ---------- an incoming webhook ---------- */

const same = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
/** POST ?hook=<workflow id>.<secret>: the workflow's own secret is the only key. Fields: up to 20 flat values. */
export async function hookCall(key: string, body: unknown): Promise<{ ok: boolean; message: string }> {
  const [id, secret] = String(key ?? "").split(".");
  if (!id || !secret) throw new V2Problem("Not found.", 404);
  const s = await loadState();
  for (const [memberId, w] of Object.entries(s.workflows ?? {})) {
    const g = w.graphs?.find((x) => x.id === id);
    if (!g) continue;
    if (!g.hook || !same(g.hook, secret) || s.closures?.[memberId]) break;
    if (!g.on || !g.live || G.triggerOf(g.live)?.type !== "trig.webhook") return { ok: false, message: "That workflow is off." };
    if (!v2Of(s, emailsFrom(await loadSeed(), s))(memberId)) return { ok: false, message: "That workflow is paused." };
    const fields: G.Fields = {};
    if (body && typeof body === "object" && !Array.isArray(body))
      for (const [k, v] of Object.entries(body as Record<string, unknown>).slice(0, 20)) {
        const kk = G.fieldName(k);
        if (kk && (typeof v === "string" || typeof v === "number" || typeof v === "boolean")) fields[kk] = typeof v === "string" ? v.replace(/\s+/g, " ").slice(0, G.V2_LIMITS.field) : v;
      }
    const n = await fireOne(memberId, id, "webhook", fields).catch(() => 0);
    return { ok: n > 0, message: n ? "Received." : "Not run: it ran 25 times today, or it is off." };
  }
  throw new V2Problem("Not found.", 404);
}
