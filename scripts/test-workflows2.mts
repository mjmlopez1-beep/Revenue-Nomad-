/**
 * Checks of Workflows v2 (RN_WORKFLOWS_V2, lib/workflows/graph.ts, graphRun.ts, v2.ts, describe.ts):
 * the switch off answers 404 and today's engine runs as before; today's workflows convert losslessly
 * and, with the switch on, every recipe runs through the graph runner with the same results as
 * today's engine; a save refuses a send without the member's tap and a second trigger; the credit
 * quote, the monthly cap and the member's daily limit; branches; a wait that survives a restart (a
 * second process carries it on); Ask me and Approve, then send pause and carry on on the tap; Retry
 * from the failed node; test mode spends nothing and sends nothing; describe-to-build's rules make a
 * valid draft. In process, on a made-up seed in a temporary data dir, with fetch replaced.
 *
 *   npx tsx scripts/test-workflows2.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const dir = mkdtempSync(path.join(tmpdir(), "rn-workflows2-"));
const MIN = 60_000;
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const ORIGIN = "https://post.example.com";
const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [
    // Two twins: the same name, plan and starting point. One runs on today's engine, the other on v2.
    { id: "mem_a", name: "Jordan Avery", email: "jordan.a@avery.example", title: "Fractional VP Sales", token: "tok-a-000000001" },
    { id: "mem_b", name: "Jordan Avery", email: "jordan.b@avery.example", title: "Fractional VP Sales", token: "tok-b-000000001" },
    { id: "mem_c", name: "Casey Close", email: "casey@close.example", title: "Fractional COO", token: "tok-c-000000001" },
  ],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
    { id: "c_lark", fields: { name: "Larkspur Learning", website: "larkspur.example", industry: "E-Learning Providers", employees: "51-200", hq: "Boston, MA" } },
  ],
  engagements: [{ id: "e_north_sales", companyId: "c_north", fields: { source: "Published engagement", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active" } }],
  contacts: [
    { id: "p_cedar_ceo", companyId: "c_cedar", fields: { name: "Morgan Hale", title: "CEO", relationship: "Decision maker" } },
    { id: "p_halcyon_coo", companyId: "c_halcyon", fields: { name: "Quinn Rivers", title: "COO", relationship: "Decision maker" } },
    { id: "p_lark_cfo", companyId: "c_lark", fields: { name: "Avery Stone", title: "CFO", relationship: "Decision maker" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const seen = iso(t0 - 2 * DAY);
const view = (id: string) => ({ id, name: "Every company", createdAt: seen, place: "v=all&t=companies", alert: { on: false, triggers: ["role"], every: "instant", email: false, slack: false, bell: false } });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Everyone has opened Northwind. Cedar and Pine, Halcyon and Larkspur stay locked.
    unlocks: { "c_north.identity": ["mem_a", "mem_b", "mem_c"] },
    seen: { mem_a: seen, mem_b: seen, mem_c: seen },
    profiles: { mem_a: { function: "Sales", onboarded: true }, mem_b: { function: "Sales", onboarded: true }, mem_c: { function: "Operations", onboarded: true } },
    follows: {},
    connector: { clients: [], grants: [], alerts: { mem_a: [view("al_twin0001")], mem_b: [view("al_twin0001")], mem_c: [view("al_casey001")] } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "40",
  RN_PUBLIC_URL: ORIGIN,
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FUNDING: "1",
  RN_WORKFLOWS: "1",
  RN_CALL_TRIGGERS: "1",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <alerts@merlin.example>",
});
// Billing off: every member is on credits and every plan feature is on (the spend, the cap and the yes are checked there).
for (const k of ["RN_WORKFLOWS_V2", "RN_BILLING", "RN_FREE_COMPANY", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RN_AI_DRAFTS", "RN_SEND", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE"]) delete process.env[k];

type Sent = { url: string; body: Record<string, unknown> };
const outbox: Sent[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(String(init?.body ?? "{}"));
  } catch {
    body = {};
  }
  outbox.push({ url: String(input instanceof Request ? input.url : input), body });
  return new Response(JSON.stringify({ id: "x", ok: true }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 1200)}`}`);
};
const v2 = (on: boolean) => (on ? (process.env.RN_WORKFLOWS_V2 = "1") : delete process.env.RN_WORKFLOWS_V2);

async function main() {
  const t = await import("../lib/table");
  const W = await import("../lib/workflows");
  const WT = await import("../lib/workflows/types");
  const G = await import("../lib/workflows/graph");
  const GR = await import("../lib/workflows/graphRun");
  const D = await import("../lib/workflows/describe");
  const n = await import("../lib/notify");
  const R = await import("../app/api/workflows2/route.ts");
  const { NextRequest } = await import("next/server");
  const T = t.tableInternals;
  const pub = T.pubId;
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await n.settled();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const C = "tok-c-000000001";
  const route = async (method: "GET" | "POST", body?: unknown, q = "", o: { token?: string | null; origin?: string | null } = {}) => {
    const token = o.token === undefined ? C : o.token;
    const origin = o.origin === undefined ? ORIGIN : o.origin;
    const req = new NextRequest(`${ORIGIN}/api/workflows2${q}`, {
      method,
      headers: { ...(token ? { cookie: `rn_table=${token}` } : {}), ...(method === "POST" ? { "content-type": "application/json", ...(origin ? { origin } : {}) } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const res = await (method === "POST" ? R.POST : R.GET)(req as never, undefined as never);
    return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; message?: string; id?: string } };
  };
  const st = () => t.loadState();
  const wfOf = async (m: string) => (await st()).workflows?.[m];
  const runOfId = async (m: string, id: string) => (await wfOf(m))?.graphRuns?.find((r) => r.id === id);
  const lastRun = async (m: string, wf: string) => (await wfOf(m))?.graphRuns?.filter((r) => r.wf === wf).sort((a, b) => b.at.localeCompare(a.at))[0];
  const bal = async (m: string) => T.balance(await st(), m);

  /* ---------- the model, pure ---------- */
  console.log("\nThe model and the converter");
  for (const r of WT.RECIPES) {
    const f: import("../lib/workflows/types").Workflow = { id: `wf_${r.key}`, name: r.title ?? r.key, on: true, trigger: r.trigger, scope: { kind: r.scope, ...(r.scope === "list" ? { list: "al_x" } : {}) }, steps: r.steps, cap: 5, warn: null, ...(r.call ? { call: r.call } : {}), createdAt: seen, updatedAt: seen };
    const g = G.fromLinear(f);
    const back = G.toLinear(g.live!);
    const same = JSON.stringify(back) === JSON.stringify({ trigger: f.trigger, scope: f.scope, steps: WT.sortSteps(f.steps), ...(f.call ? { call: f.call } : {}) });
    check(`recipe ${r.key}: converts to a straight line and back, losslessly`, same && g.id === f.id && g.on && g.cap === 5 && !!G.straightLine(g.live!) && g.live!.nodes.length === f.steps.length + 1, { back, f });
  }
  const close: import("../lib/workflows/graph").PlanGates = { tier: "close", paid: true, proposals: true, evidence: true };
  const free: import("../lib/workflows/graph").PlanGates = { tier: "free", paid: false, proposals: false, evidence: false };
  const prices = { company: 0, companyFull: 2, ballFree: true, opensLeft: 15, person: 1 };
  const on = { funding: true, calls: true, send: true };
  const N = (id: string, type: string, settings: Record<string, unknown> = {}, x = 0) => ({ id, type, name: id, on: true, settings, pos: { x, y: 0 } });
  const E = (from: string, to: string, out = "main") => ({ id: `e_${from}_${to}_${out}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 40), from, out, to });
  const ver = (nodes: ReturnType<typeof N>[], edges: ReturnType<typeof E>[]) => G.cleanVersion({ nodes, edges }, 1, iso(t0));
  const chk = (v: import("../lib/workflows/graph").GraphVersion, p = close) => G.checkGraph(v, p, prices, on, ["al_casey001"]);
  const bare = chk(ver([N("t", "trig.manual"), N("inv", "act.invite", { to: "x" })], [E("t", "inv")]));
  check("a save refuses a send with no tap before it, in plain words", !bare.ok && /needs your tap first/.test(bare.problems[0]), bare.problems);
  const asked = chk(ver([N("t", "trig.manual"), N("ask", "logic.ask"), N("inv", "act.invite", { to: "x" })], [E("t", "ask"), E("ask", "inv", "yes")]));
  check("…Ask me answered Yes before it passes", asked.ok, asked.problems);
  const noPath = chk(ver([N("t", "trig.manual"), N("ask", "logic.ask"), N("inv", "act.invite", { to: "x" })], [E("t", "ask"), E("ask", "inv", "no")]));
  check("…but not on the No path", !noPath.ok && /tap first/.test(noPath.problems.join(" ")), noPath.problems);
  const twoWays = chk(ver([N("t", "trig.manual"), N("if", "logic.if"), N("ask", "logic.ask"), N("inv", "act.invite", { to: "x" })], [E("t", "if"), E("if", "ask", "yes"), E("ask", "inv", "yes"), E("if", "inv", "no")]));
  check("…and every path counts: a second path round the tap is refused", !twoWays.ok, twoWays.problems);
  const sendSelf = chk(ver([N("t", "trig.manual"), N("w", "ai.write"), N("s", "act.send")], [E("t", "w"), E("w", "s")]));
  check("Approve, then send is its own tap", sendSelf.ok, sendSelf.problems);
  const two = chk(ver([N("t", "trig.manual"), N("t2", "trig.schedule"), N("b", "notify.bell")], [E("t", "b"), E("t2", "b")]));
  check("a save refuses a second trigger", !two.ok && /one trigger/.test(two.problems.join(" ")), two.problems);
  const none = chk(ver([N("b", "notify.bell")], []));
  check("…and a workflow with none", !none.ok && /one trigger/.test(none.problems[0]));
  const loop = chk(ver([N("t", "trig.manual"), N("a", "notify.bell"), N("b", "notify.email")], [E("t", "a"), E("a", "b"), E("b", "a")]));
  check("a loop that isn't through Wait for reply is refused", !loop.ok && /loop back/.test(loop.problems.join(" ")), loop.problems);
  const replyLoop = chk(ver([N("t", "trig.manual"), N("w", "ai.write"), N("s", "act.send"), N("r", "logic.waitreply", { days: 3, loops: 2 })], [E("t", "w"), E("w", "s"), E("s", "r", "sent"), E("r", "w", "none")]));
  check("a Wait for reply loop, bounded, is allowed", replyLoop.ok && replyLoop.problems.length === 0, replyLoop.problems);
  const gated = chk(ver([N("t", "trig.manual"), N("w", "ai.write")], [E("t", "w")]), free);
  check("plan gates: a Close step on Free says Part of Close", !gated.ok && /part of close/.test(gated.problems.join(" ")) && gated.holds.w === "Part of Close", gated);
  const paidFree = chk(ver([N("t", "trig.seat", { scope: { kind: "radar" } }), N("o", "find.open")], [E("t", "o")]), free);
  check("…and a paid step on Free says Part of Pro", !paidFree.ok && /part of pro/.test(paidFree.problems.join(" ")));
  const branchy = ver(
    [N("t", "trig.seat", { scope: { kind: "list", list: "al_casey001" } }), N("if", "logic.if"), N("dm", "find.dm"), N("o", "find.open"), N("b", "notify.bell")],
    [E("t", "if"), E("if", "dm", "yes"), E("if", "o", "no"), E("dm", "b"), E("o", "b")],
  );
  check("the credits estimate is the highest path: who decides (company and person) over open the company", G.graphCeiling(branchy, prices) === 3 && G.graphCeiling(ver([N("t", "trig.seat", { scope: { kind: "radar" } }), N("dm", "find.dm")], [E("t", "dm")]), prices) === 1);
  check("a line to an output a node hasn't is refused", (() => {
    try {
      ver([N("t", "trig.manual"), N("b", "notify.bell")], [E("t", "b", "yes")]);
      return false;
    } catch (e) {
      return /no output/.test(String(e));
    }
  })());

  /* ---------- the switch off ---------- */
  console.log("\nRN_WORKFLOWS_V2 off");
  v2(false);
  const g404 = await route("GET");
  const p404 = await route("POST", { op: "save", version: { nodes: [], edges: [] } });
  const h404 = await route("POST", {}, "?hook=wf_x.secret", { token: null, origin: null });
  check("off: every request is a 404", g404.status === 404 && p404.status === 404 && h404.status === 404, [g404.status, p404.status, h404.status]);
  const act = (tok: string, a: Record<string, unknown>) => t.perform(tok, a as never);
  await act("tok-a-000000001", { type: "workflow.save", trigger: "seat", scope: { kind: "list", list: "al_twin0001" }, steps: [{ key: "tell" }] });
  const offId = (await wfOf("mem_a"))!.flows[0].id;
  await W.runEvents([{ memberId: "mem_a", key: "off:1", trigger: "seat", at: iso(Date.now()), companyId: "c_north", line: "A fractional seat ended at Northwind Clinics", href: "/", lists: ["al_twin0001"] }]);
  await settle();
  let wa = await wfOf("mem_a");
  check("off: today's engine runs as before, and nothing of v2 is written", wa!.runs.length === 1 && wa!.runs[0].steps[0].status === "done" && !wa!.graphRuns && !wa!.graphs, wa);
  check("off: the watch reads today's workflows exactly", JSON.stringify(G.watchingOf(wa)) === JSON.stringify(wa!.flows.filter((f) => f.on)));
  await T.mutate((d) => {
    d.workflows!.mem_a.flows = d.workflows!.mem_a.flows.filter((f) => f.id !== offId);
    d.workflows!.mem_a.runs = [];
    delete d.inbox?.mem_a;
  });
  outbox.length = 0;

  /* ---------- equivalence: every recipe, today's engine and v2, side by side ---------- */
  console.log("\nToday's workflows through the v2 runner: the same results");
  const UNIQUE = "zephyr-fourteen-orchard";
  const transcript = `Jordan: Thanks for the time.\nAvery: We need a fractional VP Sales, ${UNIQUE}.\nJordan: I'll send you a proposal by Friday, and a recap email tomorrow.`;
  const CT = await import("../lib/calls/types");
  const callCtx = () => {
    const rules = CT.readByRules(transcript);
    const sum = CT.summaryByRules(rules, { company: "Northwind Clinics", minutes: 30 });
    return {
      recorder: "granola" as const, id: `call_${Math.random().toString(36).slice(2)}`, startedAt: iso(t0 - 40 * MIN), endedAt: iso(t0 - 10 * MIN), minutes: 30, names: ["Avery"],
      company: { id: "c_north", pub: pub("c_north"), name: "Northwind Clinics", label: "Northwind Clinics", domain: "northwind.example", stage: null }, ruled: "sales" as const, transcript,
      reading: async () => ({ kind: "sales" as const, via: "rules" as const, agreed: ["proposal" as const, "followup" as const], summary: sum.summary, items: sum.items, next: sum.next, followup: null, deck: null, rules }),
    };
  };
  const evFor = (r: (typeof WT.RECIPES)[number], memberId: string, i: number) => {
    const base = { memberId, key: `eq:${r.key}:${i}`, trigger: r.trigger, at: iso(Date.now()), lists: ["al_twin0001"], radar: r.scope === "radar", follows: r.scope === "follows" } as import("../lib/workflows").WfEvent;
    const co = { "funding-open-pipe": "c_cedar", "known-way-draft": "c_north", "radar-role-dm": "c_halcyon", "seat-pipe-way": "c_lark", "follows-leader-remind": "c_north", "hire-way": "c_halcyon" }[r.key as string] ?? null;
    if (r.trigger === "call") return { ...base, companyId: "c_north", line: "Your call with Northwind Clinics ended", href: `/?c=${pub("c_north")}`, call: callCtx() as never };
    if (!co) return { ...base, companyId: null, line: r.trigger === "signed" ? "Your proposal Sales plan is signed" : "A client opened your proposal Sales plan", href: "/?p=proposals", title: "Sales plan" };
    const named = co === "c_north" ? "Northwind Clinics" : `A locked company (${co.slice(2)})`;
    return { ...base, companyId: co, line: `${named}: ${r.trigger}`, href: `/?c=${pub(co)}`, fn: "Sales" };
  };
  const sideEffects = async (m: string) => {
    const s = await st();
    const w = s.workflows?.[m];
    return {
      ledger: s.ledger.filter((l) => l.memberId === m).map((l) => [l.delta, l.reason, l.wf ?? null]),
      drafts: (w?.drafts ?? []).map((d) => [d.subject, d.body, d.companyName, d.kind ?? null]),
      reminders: (w?.reminders ?? []).map((r) => r.line),
      pipeline: (s.pipeline?.[m]?.entries ?? []).map((e) => [e.companyId, e.stage]),
      inbox: (s.inbox?.[m] ?? []).filter((x) => x.kind === "workflow").map((x) => [x.line, x.sub ?? null, !!x.ask]).sort(),
      proposals: Object.values((s as { proposals?: Record<string, { memberId?: string; owner?: string }> }).proposals ?? {}).filter((p) => JSON.stringify(p).includes(m)).length,
      evidence: (s.evidence?.[m] ?? []).length,
      packs: (w?.packs ?? []).length,
      mail: outbox.filter((x) => /resend/.test(x.url) && JSON.stringify(x.body.to ?? "").includes(m === "mem_a" ? "jordan.a@" : "jordan.b@")).length,
    };
  };
  const normRun = (r: import("../lib/workflows/types").WfRun | undefined) =>
    r && { line: r.line, href: r.href, company: r.company ?? null, steps: r.steps, estimate: r.estimate, spent: r.spent, ask: r.ask ? { credits: r.ask.credits, answer: r.ask.answer ?? null } : null, built: r.built ? Object.keys(r.built).sort() : null };
  let i = 0;
  for (const r of WT.RECIPES) {
    i++;
    const flow = (id: string) => ({ id, name: r.title ?? `Recipe ${r.key}`, on: true, trigger: r.trigger, scope: { kind: r.scope, ...(r.scope === "list" ? { list: "al_twin0001" } : {}) }, steps: WT.sortSteps(r.steps), cap: null, warn: null, ...(r.call ? { call: r.call } : {}), createdAt: seen, updatedAt: seen });
    await T.mutate((d) => {
      for (const m of ["mem_a", "mem_b"]) {
        const w = ((d.workflows ??= {})[m] ??= WT.emptyWorkflows());
        w.flows = [flow(`wf_eq${String(i).padStart(2, "0")}_${m.slice(-1)}`) as import("../lib/workflows/types").Workflow];
      }
    });
    v2(false);
    await W.runEvents([evFor(r, "mem_a", i)]);
    await settle();
    v2(true);
    await W.runEvents([evFor(r, "mem_b", i)]);
    await settle();
    const [a, b] = [await wfOf("mem_a"), await wfOf("mem_b")];
    const ra = a!.runs.find((x) => x.wf.startsWith(`wf_eq${String(i).padStart(2, "0")}`));
    const rb = b!.runs.find((x) => x.wf.startsWith(`wf_eq${String(i).padStart(2, "0")}`));
    const gb = b!.graphRuns?.find((x) => x.id === rb?.id);
    const [ea, eb] = [await sideEffects("mem_a"), await sideEffects("mem_b")];
    check(`recipe ${r.key}: the same run record (steps, notes, credits, estimate, spent)`, !!ra && !!rb && JSON.stringify(normRun(ra)) === JSON.stringify(normRun(rb)), { a: normRun(ra), b: normRun(rb) });
    const diff = Object.keys(ea).filter((k) => JSON.stringify(ea[k as keyof typeof ea]) !== JSON.stringify(eb[k as keyof typeof eb]));
    check(`recipe ${r.key}: the same effects (credits, drafts, reminders, pipeline, bell, proposals, email)`, !diff.length, Object.fromEntries(diff.map((k) => [k, { a: ea[k as keyof typeof ea], b: eb[k as keyof typeof eb] }])));
    check(`recipe ${r.key}: v2 kept a run of its own, per node`, !!gb && gb.mirror === true && gb.nodes.length >= r.steps.length + 1 && gb.estimate === rb!.estimate && gb.spent === rb!.spent, gb);
  }
  const allRuns = JSON.stringify((await wfOf("mem_b"))!.graphRuns);
  check("no run record holds the transcript", !allRuns.includes(UNIQUE) && !allRuns.includes("I'll send you a proposal"));
  check("a locked company is never named in a run record", !/Larkspur Learning/.test(allRuns));

  // At the cap: today's engine and v2 both wait for the yes, and the yes does the same.
  const capFlow = (id: string) => ({ id, name: "Who decides when a seat ends", on: true, trigger: "seat", scope: { kind: "list", list: "al_twin0001" }, steps: [{ key: "dm" }, { key: "pipe" }, { key: "tell" }], cap: 1, warn: null, createdAt: seen, updatedAt: seen });
  await T.mutate((d) => {
    d.workflows!.mem_a.flows = [capFlow("wf_capeq_a") as never];
    d.workflows!.mem_b.flows = [capFlow("wf_capeq_b") as never];
  });
  const capEv = (m: string) => ({ memberId: m, key: "eq:cap", trigger: "seat" as const, at: iso(Date.now()), companyId: "c_lark", line: "A fractional seat ended at a locked company", href: `/?c=${pub("c_lark")}`, lists: ["al_twin0001"] });
  v2(false);
  await W.runEvents([capEv("mem_a")]);
  v2(true);
  await W.runEvents([capEv("mem_b")]);
  await settle();
  let ca = (await wfOf("mem_a"))!.runs.find((x) => x.wf === "wf_capeq_a")!;
  let cb = (await wfOf("mem_b"))!.runs.find((x) => x.wf === "wf_capeq_b")!;
  check("at the cap: both wait for the yes, the same way", !!ca?.ask && JSON.stringify(normRun(ca)) === JSON.stringify(normRun(cb)), { a: normRun(ca), b: normRun(cb) });
  v2(false);
  const ya = (await act("tok-a-000000001", { type: "workflow.approve", run: ca.id, yes: true })) as { message: string };
  v2(true);
  const yb = (await act("tok-b-000000001", { type: "workflow.approve", run: cb.id, yes: true })) as { message: string };
  await settle();
  ca = (await wfOf("mem_a"))!.runs.find((x) => x.wf === "wf_capeq_a")!;
  cb = (await wfOf("mem_b"))!.runs.find((x) => x.wf === "wf_capeq_b")!;
  check("…the yes (from the bell, today's action) spends and carries on the same way", ya.message === yb.message && JSON.stringify(normRun(ca)) === JSON.stringify(normRun(cb)) && ca.ask?.answer === "yes", { ya, yb, a: normRun(ca), b: normRun(cb) });
  check("…and the same effects", JSON.stringify(await sideEffects("mem_a")) === JSON.stringify(await sideEffects("mem_b")));

  /* ---------- the API: save, Make live, the checks ---------- */
  console.log("\nThe API");
  v2(true);
  const noOrigin = await route("POST", { op: "save", version: {} }, "", { origin: "https://evil.example" });
  const noCookie = await route("GET", undefined, "", { token: null });
  check("a POST from another site is refused; signed out is refused", noOrigin.status === 403 && noCookie.status === 401, [noOrigin.status, noCookie.status]);
  const badSend = await route("POST", { op: "save", name: "Invite", version: { nodes: [N("t", "trig.manual"), N("inv", "act.invite", { to: "e1" })], edges: [E("t", "inv")] } });
  check("save refuses a send without approval, with a plain message", badSend.status === 400 && /needs your tap first/.test(badSend.j.error ?? ""), badSend);
  const badTwo = await route("POST", { op: "save", name: "Two", version: { nodes: [N("t", "trig.manual"), N("t2", "trig.webhook"), N("b", "notify.bell")], edges: [E("t", "b"), E("t2", "b")] } });
  check("save refuses a second trigger", badTwo.status === 400 && /one trigger/.test(badTwo.j.error ?? ""), badTwo);
  const lst0 = await route("GET");
  check("the list has the catalog and the member's workflows", lst0.status === 200 && Array.isArray(lst0.j.catalog) && (lst0.j.catalog as { type: string; stub: string | null }[]).some((c) => c.type === "act.docs" && !!c.stub), lst0.j.error);
  const mk = async (name: string, nodes: ReturnType<typeof N>[], edges: ReturnType<typeof E>[], more: Record<string, unknown> = {}) => {
    const s1 = await route("POST", { op: "save", name, version: { nodes, edges }, ...more });
    if (s1.status !== 200) throw new Error(`save ${name}: ${s1.j.error}`);
    const id = String(s1.j.id);
    const l = await route("POST", { op: "live", id });
    if (l.status !== 200) throw new Error(`live ${name}: ${l.j.error}`);
    const o = await route("POST", { op: "on", id, on: true });
    if (o.status !== 200) throw new Error(`on ${name}: ${o.j.error}`);
    return id;
  };

  /* ---------- credits: the quote, the cap, the daily limit ---------- */
  console.log("\nCredits");
  const capId = await mk("Who decides, capped", [N("t", "trig.seat", { scope: { kind: "list", list: "al_casey001" } }), N("dm", "find.dm"), N("b", "notify.bell", { text: "Seat at {Company line}" })], [E("t", "dm"), E("dm", "b")], { cap: 2 });
  const one = (await route("GET", undefined, `?id=${capId}`)).j as { liveCheck?: { ceiling: number } };
  check("the builder's ceiling before it runs: the company and who decides", one.liveCheck?.ceiling === 3, one);
  const cb0 = await bal("mem_c");
  const seatEv = (key: string, co: string) => ({ memberId: "mem_c", key, trigger: "seat" as const, at: iso(Date.now()), companyId: co, line: `A fractional seat ended at a locked company`, href: `/?c=${pub(co)}`, lists: ["al_casey001"] });
  await W.runEvents([seatEv("seat:c1", "c_cedar")]);
  await settle();
  let r1 = (await lastRun("mem_c", capId))!;
  check("the run quotes the path first, then spends what the stretch's quote says", r1.quote === 3 && r1.status === "done" && r1.spent === r1.estimate && r1.spent > 0 && cb0 - (await bal("mem_c")) === r1.spent, r1);
  const ledC = (await st()).ledger.filter((l) => l.memberId === "mem_c" && l.reason === "unlock");
  check("every ledger line carries the workflow's name", ledC.length > 0 && ledC.every((l) => l.wf === "Who decides, capped"), ledC);
  const dmNode = r1.nodes.find((x) => x.node === "dm")!;
  check("each node keeps its input, output, status, credits and time", dmNode.status === "done" && dmNode.credits === r1.spent && typeof dmNode.ms === "number" && !!dmNode.input && r1.nodes.find((x) => x.node === "b")?.status === "done");
  const spentFirst = r1.spent;
  await W.runEvents([seatEv("seat:c2", "c_halcyon")]);
  await settle();
  let r2 = (await lastRun("mem_c", capId))!;
  check("past the monthly cap nothing is spent: the paid step waits for a yes", r2.status === "waiting" && r2.wait?.kind === "cap" && r2.spent === 0 && r2.nodes.find((x) => x.node === "dm")?.status === "waiting" && cb0 - (await bal("mem_c")) === spentFirst, r2);
  check("…the bell asks, with the credits", ((await st()).inbox?.mem_c ?? []).some((x) => x.ask?.run === r2.id && x.ask.credits === 3));
  check("…steps in the same stretch that don't need the company carry on, as today", r2.nodes.find((x) => x.node === "b")?.status === "done", r2.nodes);
  const yes = await route("POST", { op: "answer", run: r2.id, yes: true });
  await settle();
  r2 = (await runOfId("mem_c", r2.id))!;
  check("yes spends what it asked and carries on", yes.status === 200 && r2.status === "done" && r2.spent === 3 && r2.nodes.find((x) => x.node === "dm")?.status === "done" && cb0 - (await bal("mem_c")) === spentFirst + 3, { yes: yes.j, r2 });
  // The member's daily spend limit (Agent access): the same yes.
  await T.mutate((d) => {
    ((d.connector ??= { clients: [], grants: [] } as never).agent ??= {})["mem_c"] = { off: [], limit: 1 };
    d.workflows!.mem_c.graphs!.find((g) => g.id === capId)!.cap = null;
  });
  await W.runEvents([seatEv("seat:c3", "c_lark")]);
  await settle();
  const r3 = (await lastRun("mem_c", capId))!;
  check("past the member's daily spend limit nothing is spent either: it waits for a yes", r3.status === "waiting" && r3.wait?.kind === "limit" && r3.spent === 0 && cb0 - (await bal("mem_c")) === spentFirst + 3, r3);
  await route("POST", { op: "answer", run: r3.id, yes: false });
  check("…no spends nothing and says so", (await runOfId("mem_c", r3.id))?.nodes.find((x) => x.node === "dm")?.note === "You said no. Nothing was spent." && cb0 - (await bal("mem_c")) === spentFirst + 3);
  await T.mutate((d) => {
    d.connector!.agent!["mem_c"] = { off: [], limit: null };
  });

  /* ---------- branches (and the incoming webhook) ---------- */
  console.log("\nBranches");
  const brId = await mk(
    "Route by tier",
    [N("t", "trig.webhook"), N("sw", "logic.switch", { field: "Tier", cases: [{ value: "A" }, { value: "B" }] }), N("a", "notify.bell", { text: "Tier A: {Name}" }), N("b", "notify.bell", { text: "Tier B: {Name}" }), N("if", "logic.if", { conditions: [{ field: "Score", op: "over", value: "50" }] }), N("hi", "notify.bell", { text: "High score" }), N("lo", "notify.bell", { text: "Low score" }), N("stop", "logic.stop")],
    [E("t", "sw"), E("sw", "a", "case:1"), E("sw", "b", "case:2"), E("sw", "stop", "other"), E("b", "if"), E("if", "hi", "yes"), E("if", "lo", "no")],
  );
  const hookUrl = String(((await route("GET", undefined, `?id=${brId}`)).j as { hook?: string }).hook ?? "");
  const hookKey = decodeURIComponent(hookUrl.split("hook=")[1] ?? "");
  check("Make live gives a webhook trigger its own secret link", /^wf_[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{20,}$/.test(hookKey), hookUrl);
  const wrong = await route("POST", { Tier: "A" }, `?hook=${encodeURIComponent(hookKey.split(".")[0] + ".wrongsecret000000000000")}`, { token: null, origin: null });
  check("a webhook with the wrong secret is a 404", wrong.status === 404);
  const hit = await route("POST", { Tier: "B", Name: "Example lead", Score: 72 }, `?hook=${encodeURIComponent(hookKey)}`, { token: null, origin: null });
  await settle();
  const br = (await lastRun("mem_c", brId))!;
  const took = (id: string) => br.nodes.find((x) => x.node === id);
  check("Switch takes the case that matches, If the true path", hit.status === 200 && took("sw")?.out === "case:2" && took("b")?.status === "done" && !took("a") && took("if")?.out === "yes" && took("hi")?.status === "done" && !took("lo") && !took("stop"), br.nodes.map((x) => [x.node, x.status, x.out]));
  check("…and the bell line has the webhook's fields", ((await st()).inbox?.mem_c ?? []).some((x) => x.line === "Tier B: Example lead"));
  await route("POST", { Tier: "Z" }, `?hook=${encodeURIComponent(hookKey)}`, { token: null, origin: null });
  const br2 = (await lastRun("mem_c", brId))!;
  check("no case matches: Other, and Stop ends the run", br2.nodes.find((x) => x.node === "sw")?.out === "other" && br2.nodes.find((x) => x.node === "stop")?.status === "stopped" && br2.status === "done");

  // The prototype's newer steps: match by website, the company's profile and open roles, keep watching, notify me.
  const mId = await mk(
    "Match a visitor",
    [N("t", "trig.webhook"), N("mt", "find.match", { from: "Website" }), N("pf", "find.profile"), N("rl", "find.roles"), N("fo", "act.follow"), N("me", "notify.me", { text: "A visit from {Company line}" })],
    [E("t", "mt"), E("mt", "pf"), E("pf", "rl"), E("rl", "fo"), E("fo", "me")],
  );
  const mKey = decodeURIComponent(String(((await route("GET", undefined, `?id=${mId}`)).j as { hook?: string }).hook ?? "").split("hook=")[1] ?? "");
  await route("POST", { Website: "https://www.larkspur.example/pricing" }, `?hook=${encodeURIComponent(mKey)}`, { token: null, origin: null });
  await settle();
  const mr = (await lastRun("mem_c", mId))!;
  const mn = (id: string) => mr.nodes.find((x) => x.node === id);
  check("match by website finds the company, still locked: described, never named", mn("mt")?.status === "done" && mr.item.Matched === true && mr.item.Company === null && /locked/i.test(String(mr.item["Company line"])) && !/Larkspur Learning/.test(JSON.stringify(mr)), mr.nodes.map((x) => [x.node, x.status, x.note]));
  check("…its free facts, its open roles, keep watching and notify me run", mn("pf")?.status === "done" && mr.item.Industry === "EdTech" && mr.item.About === null && mn("rl")?.status === "done" && mn("fo")?.status === "done" && ((await st()).follows.mem_c ?? []).includes("c_lark") && mn("me")?.status === "done" && ((await st()).inbox?.mem_c ?? []).some((x) => /^A visit from a locked/i.test(x.line)), { item: mr.item, follows: (await st()).follows.mem_c, bell: ((await st()).inbox?.mem_c ?? []).map((x) => x.line).slice(0, 4) });

  /* ---------- Ask me: a pause, a tap, the run carries on ---------- */
  console.log("\nAsk me and Approve, then send");
  const askId = await mk("Ask first", [N("t", "trig.manual"), N("ask", "logic.ask", { question: "Go ahead?" }), N("y", "notify.bell", { text: "Yes path" }), N("no", "notify.bell", { text: "No path" })], [E("t", "ask"), E("ask", "y", "yes"), E("ask", "no", "no")]);
  await route("POST", { op: "run", id: askId });
  await settle();
  let ar = (await lastRun("mem_c", askId))!;
  const askBell = ((await st()).inbox?.mem_c ?? []).find((x) => x.ask?.run === ar.id);
  check("Ask me pauses the run and asks in the bell", ar.status === "waiting" && ar.wait?.kind === "ask" && !!askBell && /Go ahead\?/.test(askBell.line), { ar, askBell });
  const ans = await route("POST", { op: "answer", run: ar.id, yes: true });
  ar = (await runOfId("mem_c", ar.id))!;
  check("yes carries on by Yes", ans.status === 200 && ar.status === "done" && ar.nodes.find((x) => x.node === "y")?.status === "done" && !ar.nodes.find((x) => x.node === "no"), ar.nodes);
  await route("POST", { op: "run", id: askId });
  const ar2 = (await lastRun("mem_c", askId))!;
  // The bell's own Say yes / no (today's action) answers a v2 run too.
  await act(C, { type: "workflow.approve", run: ar2.id, yes: false });
  check("no from the bell (today's action) carries on by No", (await runOfId("mem_c", ar2.id))?.nodes.find((x) => x.node === "no")?.status === "done");
  const again = await route("POST", { op: "answer", run: ar.id, yes: true });
  check("a second answer changes nothing", again.status === 400 || /already/.test(String(again.j.message)), again);

  // Approve, then send (lib/send on): the note waits in the outbox as a draft; only the tap sends it.
  Object.assign(process.env, { RN_SEND: "1", GOOGLE_CLIENT_ID: "client-test.apps.example", GOOGLE_CLIENT_SECRET: "secret-test" });
  const sendId = await mk(
    "Write and send",
    [N("t", "trig.manual"), N("w", "ai.write", { prompt: "A short hello" }), N("s", "act.send", { to: "dana@client.example", subject: "Hello", body: "Hi Dana, a short hello." }), N("ok", "notify.bell", { text: "Sent path" }), N("sk", "notify.bell", { text: "Skipped path" })],
    [E("t", "w"), E("w", "s"), E("s", "ok", "sent"), E("s", "sk", "skipped")],
  );
  const mails0 = outbox.length;
  await route("POST", { op: "run", id: sendId });
  await settle();
  let sr = (await lastRun("mem_c", sendId))!;
  const ob = () => ((JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8")) as { outbox?: Record<string, { items: { id: string; status: string; kind: string; to: string }[] }> }).outbox?.mem_c?.items ?? []);
  const item = (await st() as unknown as { outbox?: Record<string, { items: { id: string; status: string; kind: string; to: string }[] }> }).outbox?.mem_c?.items.find((x) => x.id === sr.wait?.outbox);
  check("Approve, then send pauses with the note in the outbox, a draft: nothing sent", sr.status === "waiting" && sr.wait?.kind === "send" && item?.status === "draft" && item.kind === "workflow" && !outbox.slice(mails0).some((x) => /gmail/.test(x.url)), { sr, item });
  check("…its preview is the member's own draft (kept in the run), with To and Subject", sr.nodes.find((x) => x.node === "s")?.output?.To === "dana@client.example" && sr.nodes.find((x) => x.node === "s")?.output?.Subject === "Hello");
  await new Promise((r) => setTimeout(r, 10));
  await GR.graphTick(Date.now());
  check("the tick doesn't carry it on without the tap", (await runOfId("mem_c", sr.id))?.status === "waiting");
  const tap = await route("POST", { op: "answer", run: sr.id, yes: true });
  await GR.graphTick(Date.now());
  sr = (await runOfId("mem_c", sr.id))!;
  const it2 = (await st() as unknown as { outbox?: Record<string, { items: { id: string; status: string }[] }> }).outbox?.mem_c?.items.find((x) => x.id === sr.wait?.outbox || x.id === item?.id);
  check("the tap approves it through lib/send (Google's permission first), and the run carries on by Sent", tap.status === 200 && it2?.status !== "draft" && sr.status === "done" && sr.nodes.find((x) => x.node === "ok")?.status === "done", { tap: tap.j, it2, nodes: sr.nodes.map((x) => [x.node, x.status, x.out]) });
  await route("POST", { op: "run", id: sendId });
  const sr2 = (await lastRun("mem_c", sendId))!;
  await route("POST", { op: "answer", run: sr2.id, yes: false });
  const sr2b = (await runOfId("mem_c", sr2.id))!;
  check("skip: the note goes unsent, and the run carries on by Skipped", sr2b.nodes.find((x) => x.node === "sk")?.status === "done" && ob().find((x) => x.id === sr2.wait?.outbox)?.status === "cancelled", { nodes: sr2b.nodes.map((x) => [x.node, x.status]), ob: ob() });

  /* ---------- test mode: nothing spent, nothing sent, nothing written ---------- */
  console.log("\nTest mode");
  const tId = (
    await route("POST", {
      op: "save",
      name: "Everything, tested",
      version: {
        nodes: [N("t", "trig.seat", { scope: { kind: "list", list: "al_casey001" } }), N("o", "find.open"), N("dm", "find.dm"), N("p", "act.pipe"), N("d", "ai.draft"), N("rm", "act.remind", { days: 2 }), N("tell", "notify.tell"), N("s", "act.send", { to: "morgan@cedarpine.example" }), N("wh", "notify.webhook")],
        edges: [E("t", "o"), E("o", "dm"), E("dm", "p"), E("p", "d"), E("d", "rm"), E("rm", "tell"), E("tell", "s"), E("s", "wh", "sent")],
      },
    })
  ).j.id as string;
  const s0 = await st();
  const before = { bal: T.balance(s0, "mem_c"), ledger: s0.ledger.length, pipe: (s0.pipeline?.mem_c?.entries ?? []).length, drafts: s0.workflows!.mem_c.drafts.length, rem: s0.workflows!.mem_c.reminders.length, ob: ob().length, mail: outbox.length, inbox: (s0.inbox?.mem_c ?? []).length };
  const tr = await route("POST", { op: "test", id: tId, sample: { company: pub("c_lark"), fields: { Email: "x@y.example" } } });
  await settle();
  const trun = tr.j.run as import("../lib/workflows/graph").GraphRun;
  const s1 = await st();
  const after = { bal: T.balance(s1, "mem_c"), ledger: s1.ledger.length, pipe: (s1.pipeline?.mem_c?.entries ?? []).length, drafts: s1.workflows!.mem_c.drafts.length, rem: s1.workflows!.mem_c.reminders.length, ob: ob().length, mail: outbox.length, inbox: (s1.inbox?.mem_c ?? []).length };
  check("a test run runs the draft on the sample, marked Test", tr.status === 200 && trun.test === true && trun.nodes.length >= 6, tr.j.error ?? trun);
  check("…it spends nothing and sends nothing, and writes nothing but the run", JSON.stringify(before) === JSON.stringify(after), { before, after });
  check("…paid steps say what they would spend", /^Test: would spend [1-9]/.test(trun.nodes.find((x) => x.node === "o")?.note ?? ""), trun.nodes.find((x) => x.node === "o"));
  check("…the locked company stays locked: never named in the test", !/Larkspur Learning/.test(JSON.stringify(trun)));
  check("…and the send waits for a tap that sends nothing", trun.status === "waiting" && trun.wait?.kind === "send" && !trun.wait.outbox);
  const ta = await route("POST", { op: "answer", run: trun.id, yes: true });
  check("approving a test sends nothing", ta.status === 200 && /Nothing was sent/.test(String(ta.j.message)) && ob().length === before.ob && outbox.length === before.mail, ta.j);

  /* ---------- steps run in drawn order (acceptance F3) ---------- */
  console.log("\nDrawn order");
  // Webhook > Match to a company > Open the company: the match runs first, so there is a company to open.
  const oId = await mk(
    "Match, then open",
    [N("t", "trig.webhook"), N("mt", "find.match", { from: "Website" }), N("op", "find.open"), N("me", "notify.me", { text: "Opened {Company line}" })],
    [E("t", "mt"), E("mt", "op"), E("op", "me")],
  );
  const oKey = decodeURIComponent(String(((await route("GET", undefined, `?id=${oId}`)).j as { hook?: string }).hook ?? "").split("hook=")[1] ?? "");
  await route("POST", { Website: "https://larkspur.example" }, `?hook=${encodeURIComponent(oKey)}`, { token: null, origin: null });
  await settle();
  const orun = (await lastRun("mem_c", oId))!;
  const oAt = (id: string) => orun.nodes.findIndex((x) => x.node === id);
  check("a paid step after Match to a company runs after it: the match first, then the open", oAt("mt") >= 0 && oAt("mt") < oAt("op") && orun.nodes[oAt("mt")].status === "done", orun.nodes.map((x) => [x.node, x.status, x.note]));
  check("…so the open finds the company and opens it (never \"Nothing to open\")", orun.nodes[oAt("op")]?.status === "done" && !/Nothing to open/.test(orun.nodes[oAt("op")]?.note ?? "") && orun.item.Company === "Larkspur Learning" && orun.spent > 0, orun.nodes.map((x) => [x.node, x.status, x.note]));
  check("…and the step after it sees the opened company", orun.nodes[oAt("me")]?.status === "done" && ((await st()).inbox?.mem_c ?? []).some((x) => x.line === "Opened Larkspur Learning"), ((await st()).inbox?.mem_c ?? []).map((x) => x.line).slice(0, 3));

  /* ---------- Retry from the failed node; three failures turn it off ---------- */
  console.log("\nRetry");
  const fId = await mk("Hook then bell", [N("t", "trig.manual"), N("b1", "notify.bell", { text: "Before the hook" }), N("wh", "notify.webhook", { text: "Hello hook" }), N("b2", "notify.bell", { text: "After the hook" })], [E("t", "b1"), E("b1", "wh"), E("wh", "b2")]);
  await route("POST", { op: "run", id: fId });
  await settle();
  let fr = (await lastRun("mem_c", fId))!;
  check("a step that fails stops the run there, in plain words, and tells the member", fr.status === "failed" && fr.failedAt === "wh" && /webhook is connected/.test(fr.nodes.find((x) => x.node === "wh")?.note ?? "") && !fr.nodes.find((x) => x.node === "b2") && ((await st()).inbox?.mem_c ?? []).some((x) => x.id.startsWith(`wf2-fail:${fr.id}`)), fr.nodes);
  await T.mutate((d) => {
    ((d.integrations ??= { members: {}, stats: { sent: {}, failed: 0 } } as never).members as Record<string, unknown>)["mem_c"] = { webhook: { kind: "webhook", url: "https://93.184.216.34/hook-abc", addedAt: iso(Date.now()) } };
  });
  const posts0 = outbox.filter((x) => x.url.startsWith("https://93.184.216.34/")).length;
  const rt = await route("POST", { op: "retry", id: fId, run: fr.id });
  await settle();
  fr = (await runOfId("mem_c", fr.id))!;
  check("Retry carries on from the failed step: the steps before it don't run again", rt.status === 200 && fr.status === "done" && fr.nodes.filter((x) => x.node === "b1").length === 1 && fr.nodes.some((x) => x.node === "wh" && x.status === "done") && fr.nodes.find((x) => x.node === "b2")?.status === "done" && outbox.filter((x) => x.url.startsWith("https://93.184.216.34/")).length === posts0 + 1, fr.nodes.map((x) => [x.node, x.status, x.note]));
  const rt2 = await route("POST", { op: "retry", id: fId, run: fr.id });
  check("only a failed run can be retried", rt2.status === 400);
  await T.mutate((d) => {
    delete (d.integrations!.members as Record<string, unknown>)["mem_c"];
  });
  for (let k = 0; k < 3; k++) await route("POST", { op: "run", id: fId });
  await settle();
  const fg = (await wfOf("mem_c"))!.graphs!.find((g) => g.id === fId)!;
  check("three failures in a row turn the workflow off, and say so", fg.on === false && ((await st()).inbox?.mem_c ?? []).some((x) => x.id.startsWith(`wf2-off:${fId}`)), fg);

  /* ---------- describe to build ---------- */
  console.log("\nDescribe to build");
  const dsc = D.describeByRules("When a seat ends at a company in my Crystal Ball, open who decides, draft a note and send it, then wait 4 days for a reply and remind me in 3 days", ["al_casey001"]);
  const dv = G.cleanVersion(dsc.version, 1, iso(t0));
  const dchk = G.checkGraph(dv, close, prices, on, ["al_casey001"]);
  check("the rules make a valid draft from a common sentence", dchk.ok && dsc.via === "rules" && dv.nodes.map((x) => x.type).join() === "trig.seat,find.dm,ai.draft,act.send,logic.waitreply,act.remind" && (G.triggerOf(dv)!.settings.scope as { kind: string }).kind === "radar", { types: dv.nodes.map((x) => x.type), problems: dchk.problems });
  const dsc2 = D.describeByRules("Every Monday at 9am tell me in Slack");
  check("…a schedule and a notify step", dsc2.version.nodes[0].type === "trig.schedule" && dsc2.version.nodes[0].settings.weekday === 1 && dsc2.version.nodes[0].settings.hourUtc === 9 && dsc2.version.nodes.some((x) => x.type === "notify.slack"));
  const before2 = (await wfOf("mem_c"))!.graphs!.length;
  const apiD = await route("POST", { op: "describe", text: "After a sales call, draft the proposal and the follow-up email" });
  check("the API answers a draft by Merlin's rules (AI off), and saves nothing live", apiD.status === 200 && apiD.j.via === "rules" && (apiD.j.check as { ok: boolean }).ok && (await wfOf("mem_c"))!.graphs!.length === before2, apiD.j);

  /* ---------- versions ---------- */
  console.log("\nDraft and live");
  const vId = await mk("Versions", [N("t", "trig.manual"), N("b", "notify.bell", { text: "One" })], [E("t", "b")]);
  await route("POST", { op: "save", id: vId, version: { nodes: [N("t", "trig.manual"), N("b", "notify.bell", { text: "Two" })], edges: [E("t", "b")] } });
  await route("POST", { op: "run", id: vId });
  check("a saved draft isn't live until Make live: runs use the live version", ((await st()).inbox?.mem_c ?? []).some((x) => x.line === "One") && !((await st()).inbox?.mem_c ?? []).some((x) => x.line === "Two"));
  await route("POST", { op: "live", id: vId });
  await route("POST", { op: "run", id: vId });
  const vg = (await wfOf("mem_c"))!.graphs!.find((g) => g.id === vId)!;
  check("Make live: the draft runs, the old version is kept", ((await st()).inbox?.mem_c ?? []).some((x) => x.line === "Two") && vg.live!.v === 2 && vg.versions[0].v === 1 && !vg.draft);
  await route("POST", { op: "node", id: vId, node: "b", on: false });
  await route("POST", { op: "run", id: vId });
  const vr = (await lastRun("mem_c", vId))!;
  check("a node switched off is skipped", vr.nodes.find((x) => x.node === "b")?.status === "skipped");
  const ex = (await t.exportState()) as { workflows?: Record<string, { graphs?: { hook?: string }[]; graphRuns?: unknown[] }> };
  check("the export keeps the graphs (no webhook secret), not their runs", !!ex.workflows?.mem_c?.graphs?.length && ex.workflows.mem_c.graphs.every((g) => !g.hook) && !ex.workflows.mem_c.graphRuns);

  /* ---------- a wait survives a restart ---------- */
  console.log("\nA wait survives a restart");
  const wId = await mk("Wait then tell", [N("t", "trig.manual"), N("w", "logic.wait", { days: 2 }), N("b", "notify.bell", { text: "After the wait" })], [E("t", "w"), E("w", "b")]);
  await route("POST", { op: "run", id: wId });
  await settle();
  const wr = (await lastRun("mem_c", wId))!;
  check("Wait writes the run and stops", wr.status === "waiting" && wr.wait?.kind === "wait" && !!wr.wait.due);
  await GR.graphTick(Date.now() + DAY);
  check("…it doesn't carry on before its time", (await runOfId("mem_c", wr.id))?.status === "waiting");
  // A second process (Merlin restarted) reads the state from disk and carries it on at its time.
  const script = `const g = await import(${JSON.stringify(path.resolve("lib/workflows/graphRun.ts"))}); const n = await g.graphTick(Date.now() + 3 * 86400000); console.log("ticked", n);`;
  const child = spawnSync(process.execPath, ["--import", "tsx", "--input-type=module", "-e", script], { env: process.env, encoding: "utf8", timeout: 120_000 });
  const disk = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8")) as { workflows: Record<string, { graphRuns: import("../lib/workflows/graph").GraphRun[] }>; inbox: Record<string, { line: string }[]> };
  const wr2 = disk.workflows.mem_c.graphRuns.find((r) => r.id === wr.id);
  check("after a restart, the tick carries it on: the step after the wait ran", child.status === 0 && /ticked [1-9]/.test(child.stdout) && wr2?.status === "done" && wr2.nodes.find((x) => x.node === "b")?.status === "done" && disk.inbox.mem_c.some((x) => x.line === "After the wait"), { code: child.status, out: child.stdout.slice(-300), err: child.stderr.slice(-600), wr2 });
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
