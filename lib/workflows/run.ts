/**
 * Running a workflow (Stage 7b, Beta): an event the watch already found (lib/workflows/index.ts
 * builds them from lib/notify/events.ts afterWatch and lib/close/server.ts dispatch) runs each
 * matching workflow of that member once, its steps in order (lib/workflows/types.ts STEP_ORDER).
 *
 * Credits, as the owner set them (BUILD_PLAN part 8):
 *   - The paid steps are quoted first with the app's own dry run; the run spends exactly that quote
 *     (WfRun.estimate === WfRun.spent), or nothing.
 *   - By default it spends automatically. With a monthly cap: a run that would take the month past
 *     it spends nothing and asks, a bell line "Say yes · N credits"; the waiting steps run only on
 *     yes (approveRun). With a warning: the first run this month that takes it past the warning
 *     tells the member once, in the bell.
 *   - Merlin's daily caps and plan rules still apply: every spend goes through perform, which refuses
 *     past today's unlock limit or the balance, and the plan's gates (lib/billing/rules.ts
 *     WORKFLOW_PLAN) skip what the plan holds back. Each workflow runs at most WF_LIMITS.runsPerDay a day.
 *   - Every ledger line it writes carries the workflow's name (LedgerEntry.wf), so the credit history says so.
 *
 * Nothing is ever sent to a client or a contact: a note is a draft in Messages. Lines name a company
 * only where the member can see it (a locked one is described by its industry and size,
 * lib/notify/knownView.ts lockedWords), never a Californian, and a name from the member's Google
 * account stays on their own screens: email and Slack get the line without it.
 */
import { loadSeed, loadState, tableInternals as T, type Member, type State } from "../table";
import { emailEnabled, sendEmail } from "../email";
import { pushInbox, settleAsk } from "../inbox";
import {
  STEPS, WF_LIMITS, doneWords, emptyWorkflows, monthOf, oneLineWf, planHolds, sortSteps, creditWords,
  type MemberWorkflows, type RunStep, type WfRun, type WfStepKey, type WfTrigger, type Workflow, type WfScope,
} from "./types";
import { companyOpen, newWfId, paidPlan, quotePaid, spendPaid, stepDraft, stepEvidence, stepPipe, stepWay } from "./steps";
import { workflowPlan } from "../billing/rules";
import { v2Switch } from "./graph";

const DAY = 86_400_000;

export const workflowsOn = () => /^(1|on|true|yes)$/i.test(process.env.RN_WORKFLOWS ?? "");

/** One thing that happened, for one member, as the watch found it. */
export interface WfEvent {
  memberId: string;
  /** Unique for the event ("seat:<id>", "fund:<accession>"): a workflow runs once per event. */
  key: string;
  trigger: WfTrigger;
  at: string;
  /** The company (internal id), for the company steps. */
  companyId: string | null;
  /** As the member sees Merlin: a locked company described, never named. */
  line: string;
  /** The same for email and Slack, when `line` names someone from the member's Google account. */
  lineOut?: string;
  href: string;
  /** The seat's or role's function, for a note's words. */
  fn?: string | null;
  /** What it is in: the member's saved lists (ids), their Crystal Ball, the companies they follow. */
  lists?: string[];
  radar?: boolean;
  follows?: boolean;
  /** A proposal's own words (its title), for an Evidence Bank draft. */
  title?: string;
  /** A call that ended (lib/calls): the call, its company and its transcript, in memory for the run only. Never stored. */
  call?: import("../calls").CallCtx;
}

/** The plan's workflow gates for the member now. Everything is open while billing isn't live. */
export function planFor(s: State, memberId: string, nowMs = Date.now()) {
  const tier = T.closeNow(s, memberId, nowMs) ? "close" : T.freeNow(s, memberId, nowMs) ? "free" : "pro";
  return { tier, ...workflowPlan(tier) } as const;
}

/** The event is what this workflow watches. */
export function matches(f: Pick<Workflow, "trigger" | "scope">, ev: WfEvent): boolean {
  if (f.trigger !== ev.trigger) return false;
  const sc: WfScope = f.scope;
  if (sc.kind === "list") return !!sc.list && !!ev.lists?.includes(sc.list);
  if (sc.kind === "radar") return !!ev.radar;
  if (sc.kind === "follows") return !!ev.follows;
  if (sc.kind === "calls") return !!ev.call;
  return true;
}

/** The member's workflows in the draft, made when missing. */
export const wfIn = (d: State, memberId: string): MemberWorkflows => ((d.workflows ??= {})[memberId] ??= emptyWorkflows());

/** Credits this workflow spent this UTC month (its runs, approved yeses included). */
export const monthSpent = (w: MemberWorkflows | undefined, wfId: string, nowMs: number) => {
  const mo = monthOf(new Date(nowMs).toISOString());
  return (w?.runs ?? []).filter((r) => r.wf === wfId && monthOf(r.at) === mo).reduce((n, r) => n + r.spent, 0);
};

/** Keep a member's workflow state inside its limits: runs 90 days and 200 at most, the rest capped. */
export function capWorkflows(w: MemberWorkflows, nowMs: number): void {
  const cut = new Date(nowMs - WF_LIMITS.runDays * DAY).toISOString();
  w.runs = w.runs.filter((r) => r.at >= cut || (r.ask && !r.ask.answer)).sort((a, b) => b.at.localeCompare(a.at)).slice(0, WF_LIMITS.runs);
  w.reminders = w.reminders.slice(-WF_LIMITS.reminders);
  w.drafts = w.drafts.sort((a, b) => b.at.localeCompare(a.at)).slice(0, WF_LIMITS.drafts);
  w.keys = w.keys.slice(-WF_LIMITS.keys);
  w.flows = w.flows.slice(0, WF_LIMITS.flows);
}

/* ---------- running ---------- */

let chain: Promise<unknown> = Promise.resolve();

/** Run the workflows these events set off, one after another (so two never spend at once). Resolves with the runs made. */
export function runEvents(evs: WfEvent[], origin?: string, nowMs = Date.now()): Promise<number> {
  if (!evs.length || !workflowsOn()) return Promise.resolve(0);
  const p = chain.then(() => runAll(evs, origin, nowMs)).catch((e) => {
    console.error("workflows: a run failed", e instanceof Error ? e.message : "error");
    return 0;
  });
  chain = p;
  return import("../notify/index").then((n) => n.track(p));
}

async function runAll(evs: WfEvent[], origin: string | undefined, nowMs: number): Promise<number> {
  // Workflows v2 (RN_WORKFLOWS_V2): the graph runner takes every event (today's workflows run there as straight lines). Off: below, as before.
  if (v2Switch()) return (await import("./graphRun")).runAllV2(evs as unknown as import("./graphRun").V2Event[], origin, nowMs);
  let n = 0;
  for (const ev of evs) {
    const s0 = await loadState();
    const mine = s0.workflows?.[ev.memberId];
    if (!mine || s0.closures?.[ev.memberId]) continue;
    for (const f of mine.flows) {
      if (!f.on || !matches(f, ev)) continue;
      const key = `${f.id}|${ev.key}`;
      const today = new Date(nowMs).toISOString().slice(0, 10);
      const claimed = await T.mutate((d) => {
        const w = wfIn(d, ev.memberId);
        if (w.keys.includes(key)) return false;
        if (w.runs.filter((r) => r.wf === f.id && r.at.slice(0, 10) === today).length >= WF_LIMITS.runsPerDay) return false;
        w.keys.push(key);
        w.keys = w.keys.slice(-WF_LIMITS.keys);
        return true;
      });
      if (!claimed) continue;
      if (await runOne(ev, f.id, origin, nowMs)) n++;
    }
  }
  return n;
}

interface Ctx {
  m: Member;
  f: Workflow;
  ev: WfEvent;
  pub: string | null;
  origin?: string;
  nowMs: number;
}

/** One run of one workflow for one event. True when it ran. */
async function runOne(ev: WfEvent, wfId: string, origin: string | undefined, nowMs: number): Promise<boolean> {
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = T.memberIndex(seed, s).byId.get(ev.memberId);
  const f = s.workflows?.[ev.memberId]?.flows.find((x) => x.id === wfId);
  if (!m || !f || !f.on) return false;
  const plan = planFor(s, m.id, nowMs);
  const holds = planHolds(f, plan);
  // A proposal trigger the plan holds back doesn't run at all.
  if (holds.trigger) return false;
  const cx: Ctx = { m, f, ev, pub: ev.companyId ? T.pubId(ev.companyId) : null, origin, nowMs };
  const at = new Date(nowMs).toISOString();
  const run: WfRun = { id: newWfId("run"), wf: f.id, at, line: oneLineWf(ev.line, WF_LIMITS.line), href: ev.href, ...(cx.pub ? { company: cx.pub } : {}), steps: [], estimate: 0, spent: 0 };
  const keys = sortSteps(f.steps).map((x) => x.key);
  const status = new Map<WfStepKey, RunStep>();
  const put = (key: WfStepKey, st: RunStep["status"], note: string, credits = 0) => status.set(key, { key, status: st, note: oneLineWf(note, WF_LIMITS.note), credits });
  for (const k of keys) if (holds.steps[k]) put(k, "skipped", `${holds.steps[k]}. Kept as you set it: it runs again on that plan.`);

  /* ---- the paid steps: quoted, then spent, or waiting for a yes ---- */
  const paidKeys = keys.filter((k) => STEPS[k].paid && !holds.steps[k]);
  const bells: Parameters<typeof pushInbox>[2] = [];
  let warned: string | null = null;
  if (paidKeys.length) {
    const pp = await paidPlan(m, cx.pub, paidKeys);
    const q = await quotePaid(m, pp, origin);
    for (const st of pp.per) if (st.note && !st.items.length && !q.refused[st.key]) put(st.key, /already/.test(st.note) ? "done" : "skipped", st.note);
    for (const [k, why] of Object.entries(q.refused) as [WfStepKey, string][]) put(k, "skipped", `Merlin's limits: ${why}`);
    run.estimate = q.total;
    const toBuy = pp.per.filter((x) => x.items.length && !q.refused[x.key]);
    if (toBuy.length) {
      const w = s.workflows?.[m.id];
      const spentMo = monthSpent(w, f.id, nowMs);
      if (q.total > 0 && f.cap !== null && spentMo + q.total > f.cap) {
        // At the cap: nothing is spent; the paid steps wait for the member's yes.
        run.ask = { credits: q.total };
        for (const x of toBuy) put(x.key, "waiting", `Waits for your yes: ${creditWords(q.per[x.key] ?? 0)}. This workflow's limit is ${creditWords(f.cap)} a month.`, q.per[x.key] ?? 0);
        bells.push({ id: `wf-ask:${run.id}`, at, kind: "workflow", line: `A workflow waits for your yes · ${creditWords(q.total)}`, sub: `${oneLineWf(ev.lineOut ?? ev.line, 100)} · It reached its limit of ${creditWords(f.cap)} this month`, href: "/?p=alerts", alert: `wf:${f.id}`, ask: { run: run.id, credits: q.total } });
      } else {
        if (q.total > 0 && f.warn !== null && spentMo + q.total > f.warn && f.warned !== monthOf(at)) {
          warned = monthOf(at);
          bells.push({ id: `wf-warn:${f.id}:${monthOf(at)}`, at, kind: "workflow", line: `${f.name.replace(/[.\s]+$/, "")}: it passed ${creditWords(f.warn)} this month`, sub: f.cap !== null ? `It stops and asks at ${creditWords(f.cap)}` : "It keeps going: there is no monthly limit", href: "/?p=alerts", alert: `wf:${f.id}` });
        }
        try {
          run.spent = await spendPaid(m, q.items, pp.ball, f.name, origin);
          for (const x of toBuy) put(x.key, "done", x.key === "open" ? "Opened the company. It is yours to see now." : x.key === "dm" ? "Opened who decides: their name and title are on the company's page." : "Opened the company for the note.", q.per[x.key] ?? 0);
        } catch (e) {
          run.spent = 0;
          for (const x of toBuy) put(x.key, "skipped", `Merlin's limits: ${e instanceof Error ? e.message : "it didn't go through"}`);
        }
      }
    }
  }

  // A call ends (lib/calls): its conditions and its call steps, then the ready email and bell line. A call this workflow doesn't build for: no run.
  if (f.trigger === "call") {
    if (!ev.call) return false;
    const { runCallFlow } = await import("../calls");
    const r = await runCallFlow({ m, f, call: ev.call, run, keys, status, put, bells: bells as Parameters<typeof runCallFlow>[0]["bells"], origin, nowMs });
    if (r.skip) return false;
  }
  await freeSteps(cx, keys, status, put, run);
  run.steps = keys.map((k) => status.get(k) ?? { key: k, status: "skipped" as const, note: "Nothing to do.", credits: 0 });
  if (keys.includes("tell")) await tell(cx, run, bells);
  await T.mutate((d) => {
    const w = wfIn(d, m.id);
    w.runs.unshift(run);
    const fl = w.flows.find((x) => x.id === f.id);
    if (fl && warned) fl.warned = warned;
    if (bells.length) pushInbox(d, m.id, bells);
    capWorkflows(w, nowMs);
  });
  return true;
}

/** The steps after the paid ones. A step that needs the company waits with the paid steps, or is skipped while it stays locked. */
async function freeSteps(cx: Ctx, keys: WfStepKey[], status: Map<WfStepKey, RunStep>, put: (k: WfStepKey, st: RunStep["status"], note: string, credits?: number) => void, run: WfRun): Promise<void> {
  const { m, f, ev, nowMs } = cx;
  const waiting = [...status.values()].some((x) => x.status === "waiting");
  const co = ev.companyId ? await companyOpen(m, ev.companyId) : null;
  const locked = (k: WfStepKey) => put(k, waiting ? "waiting" : "skipped", waiting ? "Runs once you say yes and the company opens." : "The company is still locked for you. Add Open the company to do this too.");
  for (const k of keys) {
    if (status.has(k) && k !== "draft") continue;
    if (k === "draft") {
      const cur = status.get(k);
      if (cur && cur.status !== "done") continue;
      if (!co || !ev.companyId) {
        put(k, "skipped", "Nothing to draft: this isn't about a company.");
        continue;
      }
      const now = await companyOpen(m, ev.companyId);
      if (!now.open || !now.name) {
        locked(k);
        continue;
      }
      const d = await stepDraft(now.s, m, ev.trigger, now.name, ev.fn ?? null);
      const id = newWfId("drf");
      await T.mutate((dd) => {
        const w = wfIn(dd, m.id);
        w.drafts.unshift({ id, wf: f.id, at: new Date(nowMs).toISOString(), company: cx.pub!, companyName: now.name!, subject: oneLineWf(d.subject, 160), body: String(d.body).slice(0, WF_LIMITS.body) });
        capWorkflows(w, nowMs);
      });
      put(k, "done", "A note is drafted in Messages, in your voice. It is a draft: nothing is sent.", cur?.credits ?? 0);
      continue;
    }
    if (k === "pipe" || k === "way") {
      if (!ev.companyId || !co) {
        put(k, "skipped", "Nothing to add: this isn't about a company.");
        continue;
      }
      const now = await companyOpen(m, ev.companyId);
      if (!now.open) {
        locked(k);
        continue;
      }
      const r = k === "pipe" ? await stepPipe(m, cx.pub!) : await stepWay(now.seed, now.s, m, ev.companyId, nowMs);
      put(k, r.ok ? "done" : "skipped", r.note);
      continue;
    }
    if (k === "evidence") {
      const r = await stepEvidence(m, ev.title ? `From a signed proposal: ${ev.title}` : "From signed work", cx.origin);
      put(k, r.ok ? "done" : "skipped", r.note);
      continue;
    }
    if (k === "remind") {
      const days = f.steps.find((x) => x.key === "remind")?.days ?? 2;
      const due = new Date(nowMs + days * DAY).toISOString();
      await T.mutate((d) => {
        const w = wfIn(d, m.id);
        w.reminders.push({ id: newWfId("rem"), wf: f.id, due, line: oneLineWf(`Follow up: ${ev.line}`, WF_LIMITS.line), href: ev.href });
        capWorkflows(w, nowMs);
      });
      put(k, "done", `A reminder comes to your bell in ${days === 1 ? "1 day" : `${days} days`}.`);
      continue;
    }
    if (k === "tell") put(k, "done", "Told you in the bell, and where your alerts go.");
  }
  void run;
}

/** Tell me: the bell always; Slack and email where the member's alerts go (Slack on Pro and Close). */
async function tell(cx: Ctx, run: WfRun, bells: Parameters<typeof pushInbox>[2]): Promise<void> {
  const { m, f, ev } = cx;
  const did = doneWords(run.steps);
  bells.push({ id: `wf:${run.id}`, at: run.at, kind: "workflow", line: run.line, sub: `${did} · ${f.name}`, href: ev.href, alert: `wf:${f.id}` });
  const out = oneLineWf(ev.lineOut ?? ev.line, WF_LIMITS.line);
  const s = await loadState();
  const n = await import("../notify/index");
  const base = n.baseOf(s) || (cx.origin ?? "").replace(/\/+$/, "");
  if (!T.freeNow(s, m.id, cx.nowMs) && n.connectedFor(s, m.id)) {
    const esc = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    await n.postWatch(m.id, { kind: "watch", count: 1, headline: esc(out), lines: [esc(`${did} · ${f.name}`)], url: base ? `${base}${ev.href}` : "", footer: "Merlin workflows. Change them in Alerts and workflows." }, [{ alert: `wf:${f.id}`, count: 1 }]);
  }
  if (base && emailEnabled() && /@/.test(m.email ?? "")) {
    try {
      const [{ renderAlertEmail }, { emailLinker }, { alertOffUrl }, seed] = await Promise.all([import("../digest"), import("../emailIn"), import("../notify/events"), loadSeed()]);
      const linker = emailLinker(seed, s, m.id, base, cx.nowMs);
      const off = alertOffUrl(base, m.id, [`wf:${f.id}`]);
      const mail = renderAlertEmail({ name: m.name, every: "instant", groups: [{ name: f.name, lines: [{ text: out, url: linker(ev.href) }, { text: did, url: linker("/?p=alerts") }], offUrl: off }], alertsUrl: linker("/?p=alerts"), appUrl: base, unsubscribeUrl: off, oneRun: true });
      await sendEmail(m.email, mail.subject, mail.text, mail.html, { unsubscribeUrl: off });
    } catch (e) {
      console.error("workflows: the email failed", e instanceof Error ? e.message : "error");
    }
  }
}

/* ---------- the yes (or no) ---------- */

/**
 * The member's answer to a run waiting at its cap. Yes: the waiting paid steps are quoted again and
 * spent, if the price is still what they said yes to (more, and it asks again with the new price),
 * then the steps that waited for the company run. No: they are skipped. Either way, once.
 */
export async function approveRun(memberId: string, runId: string, yes: boolean, origin?: string, nowMs = Date.now()): Promise<string> {
  // A run of Workflows v2 (RN_WORKFLOWS_V2): its own answer, the same words.
  if (v2Switch()) {
    const g = await import("./graphRun");
    if (await g.isGraphRun(memberId, runId))
      return g.answerRun(memberId, runId, yes, origin, nowMs).catch((e) => {
        throw e instanceof g.RunAnswer ? new WfAnswer(e.message) : e;
      });
  }
  const [seed, s] = await Promise.all([loadSeed(), loadState()]);
  const m = T.memberIndex(seed, s).byId.get(memberId);
  const w = s.workflows?.[memberId];
  const run = w?.runs.find((r) => r.id === runId);
  const f = w?.flows.find((x) => x.id === run?.wf);
  if (!m || !run || !run.ask) throw new WfAnswer("That run isn't waiting anymore.");
  if (run.ask.answer) return run.ask.answer === "yes" ? "Done already." : "You said no to this one.";
  const at = new Date(nowMs).toISOString();
  const waitingKeys = run.steps.filter((x) => x.status === "waiting").map((x) => x.key);
  if (!yes || !f) {
    await T.mutate((d) => {
      const r = wfIn(d, memberId).runs.find((x) => x.id === runId);
      if (!r?.ask || r.ask.answer) return;
      r.ask = { ...r.ask, answer: "no", at };
      r.steps = r.steps.map((x) => (x.status === "waiting" ? { ...x, status: "skipped", note: "You said no. Nothing was spent.", credits: 0 } : x));
      settleAsk(d, memberId, runId, "no");
    });
    return "Nothing was spent.";
  }
  const paidKeys = waitingKeys.filter((k) => STEPS[k].paid);
  const pp = await paidPlan(m, run.company ?? null, paidKeys);
  const q = await quotePaid(m, pp, origin);
  if (q.total > run.ask.credits) {
    await T.mutate((d) => {
      const r = wfIn(d, memberId).runs.find((x) => x.id === runId);
      if (r?.ask && !r.ask.answer) r.ask.credits = q.total;
      settleAsk(d, memberId, runId, null, q.total);
    });
    throw new WfAnswer(`It costs ${creditWords(q.total)} now. Say yes again to go ahead.`);
  }
  const refused = Object.values(q.refused)[0];
  let spent = 0;
  try {
    spent = await spendPaid(m, q.items, pp.ball, f.name, origin);
  } catch (e) {
    throw new WfAnswer(e instanceof Error ? e.message : "That didn't go through.");
  }
  const status = new Map<WfStepKey, RunStep>();
  for (const x of run.steps) if (x.status !== "waiting") status.set(x.key, x);
  const put = (key: WfStepKey, st: RunStep["status"], note: string, credits = 0) => status.set(key, { key, status: st, note: oneLineWf(note, WF_LIMITS.note), credits });
  for (const k of paidKeys) {
    if (q.refused[k]) put(k, "skipped", `Merlin's limits: ${q.refused[k]}`);
    else if (k !== "draft") put(k, "done", k === "open" ? "Opened the company, on your yes." : "Opened who decides, on your yes. Their name and title are on the company's page.", q.per[k] ?? 0);
    else status.set(k, { key: k, status: "done", note: "", credits: q.per[k] ?? 0 });
  }
  const ev: WfEvent = { memberId, key: run.id, trigger: f.trigger, at: run.at, companyId: null, line: run.line, href: run.href };
  if (run.company) {
    const g = T.graph(seed, s);
    ev.companyId = [...g.companies.keys()].find((id) => T.pubId(id) === run.company) ?? null;
  }
  const keys = run.steps.map((x) => x.key);
  const cx: Ctx = { m, f, ev, pub: run.company ?? null, origin, nowMs };
  // Only the steps that waited run now.
  for (const k of keys) if (!waitingKeys.includes(k)) status.set(k, run.steps.find((x) => x.key === k)!);
  const pending = keys.filter((k) => waitingKeys.includes(k) && !STEPS[k].paid);
  const draftWaiting = waitingKeys.includes("draft");
  const runKeys = [...(draftWaiting ? (["draft"] as WfStepKey[]) : []), ...pending];
  const mirror: WfRun = { ...run };
  await freeSteps(cx, runKeys, status, put, mirror);
  await T.mutate((d) => {
    const r = wfIn(d, memberId).runs.find((x) => x.id === runId);
    if (!r?.ask || r.ask.answer) return;
    r.ask = { ...r.ask, answer: "yes", at };
    r.estimate = q.total;
    r.spent += spent;
    r.steps = keys.map((k) => status.get(k) ?? r.steps.find((x) => x.key === k)!);
    settleAsk(d, memberId, runId, "yes");
  });
  return `${spent ? `Spent ${creditWords(spent)}.` : "Nothing to spend."}${refused ? ` ${refused}` : ""} ${f.name} carried on.`.trim();
}

export class WfAnswer extends Error {}

/* ---------- reminders (the scheduler's tick) ---------- */

/** Reminders due now go to the bell. Cheap when none are. */
export async function remindersDue(nowMs = Date.now()): Promise<number> {
  const s = await loadState();
  const nowIso = new Date(nowMs).toISOString();
  const due = Object.entries(s.workflows ?? {}).some(([, w]) => w.reminders.some((r) => r.due <= nowIso));
  if (!due) return 0;
  return T.mutate((d) => {
    let n = 0;
    for (const [memberId, w] of Object.entries(d.workflows ?? {})) {
      const now = w.reminders.filter((r) => r.due <= nowIso);
      if (!now.length) continue;
      w.reminders = w.reminders.filter((r) => r.due > nowIso);
      if (d.closures?.[memberId]) continue;
      const names = new Map(w.flows.map((f) => [f.id, f.name]));
      n += pushInbox(d, memberId, now.map((r) => ({ id: `wf-rem:${r.id}`, at: nowIso, kind: "workflow" as const, line: r.line, sub: `Reminder from ${names.get(r.wf) ?? "a workflow"}`, href: r.href, alert: `wf:${r.wf}` })));
    }
    return n;
  });
}
