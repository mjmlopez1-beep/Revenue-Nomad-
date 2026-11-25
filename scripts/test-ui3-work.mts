/**
 * Checks of the new design's Work and Community pages (RN_UI3, wave 2: app/post/ui3/work):
 *
 *   - the flag off changes nothing: no member gets the new design, no work page is registered for
 *     them, and today's pages keep their homes (Proposals' slot is optional, Home2 stays the default)
 *   - every page is registered and has its component (each renders under RN_UI3=on; the browser
 *     checks are in the report, the registry and the wiring are checked here)
 *   - Close-only gates hold: Evidence Bank is Close (and the trial), Proposals' start says the plan
 *   - Workflows Simple mode compiles to a real graph that passes the engine's checks; the approval
 *     stage blocks sending (no path to a send without the member's tap; switching it off stops the
 *     path); a Simple workflow can't be saved without a monthly limit; at the limit a run spends
 *     nothing and waits for the member's yes, asked in the bell; a test spends and sends nothing
 *   - the pipeline's money summary: open pipeline, proposals out (a part of it), won
 *   - copy: no em dashes, no AI words, no percentages in the pages' words
 *
 * In process, on a made-up seed in a temporary data dir, with fetch replaced (as test-workflows2.mts).
 *   npx tsx scripts/test-ui3-work.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-ui3work-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const ORIGIN = "https://post.example.com";
const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [
    { id: "mem_c", name: "Casey Close", email: "casey@close.example", title: "Fractional COO", token: "tok-c-000000001" },
    // Twins with the new design off: one runs under RN_WORKFLOWS_V2=optin, the other with it off. Their runs must match.
    { id: "mem_d", name: "Drew Doe", email: "drew@twins.example", title: "Fractional COO", token: "tok-d-000000001" },
    { id: "mem_e", name: "Drew Doe", email: "drew.e@twins.example", title: "Fractional COO", token: "tok-e-000000001" },
    { id: "mem_t", name: "Tess Trial", email: "tess@trial.example", title: "Fractional COO", token: "tok-t-000000001" },
    // Pro: every company and who decides open free, so Find their email (1 credit) is the step that spends (acceptance F21).
    { id: "mem_p", name: "Pat Pro", email: "pat@pro.example", title: "Fractional COO", token: "tok-p-000000001" },
  ],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
    { id: "c_ember", fields: { name: "Ember Analytics", website: "ember.example", industry: "Software Development", employees: "51-200", hq: "Chicago, IL" } },
    { id: "c_fjord", fields: { name: "Fjord Health", website: "fjord.example", industry: "Hospitals and Health Care", employees: "201-500", hq: "Seattle, WA" } },
  ],
  engagements: [{ id: "e_north_ops", companyId: "c_north", fields: { source: "Published engagement", role: "Fractional COO", function: "Operations", type: "Fractional", start: "2025-01", status: "Active" } }],
  contacts: [
    { id: "p_cedar_ceo", companyId: "c_cedar", fields: { name: "Morgan Hale", title: "CEO", relationship: "Decision maker" } },
    { id: "p_halcyon_coo", companyId: "c_halcyon", fields: { name: "Quinn Rivers", title: "COO", relationship: "Decision maker" } },
    { id: "p_ember_ceo", companyId: "c_ember", fields: { name: "Rowan Vale", title: "CEO", relationship: "Decision maker", email: "rowan@ember.example" } },
    { id: "p_fjord_coo", companyId: "c_fjord", fields: { name: "Sage Lind", title: "COO", relationship: "Decision maker", email: "sage@fjord.example" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const seen = iso(t0 - 2 * DAY);
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: { "c_north.identity": ["mem_c"] },
    seen: { mem_c: seen, mem_d: seen, mem_e: seen, mem_t: seen, mem_p: seen },
    profiles: { mem_c: { function: "Operations", onboarded: true, ui3: true }, mem_d: { function: "Operations", onboarded: true }, mem_e: { function: "Operations", onboarded: true }, mem_t: { function: "Operations", onboarded: true }, mem_p: { function: "Operations", onboarded: true, ui3: true } },
    follows: {},
    connector: { clients: [], grants: [], alerts: Object.fromEntries(["mem_c", "mem_d", "mem_e", "mem_t", "mem_p"].map((m) => [m, [{ id: m === "mem_c" ? "al_casey001" : `al_${m}0001`, name: "Every company", createdAt: seen, place: "v=all&t=companies", alert: { on: false, triggers: ["role"], every: "instant", email: false, slack: false, bell: false } }]])) },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "40",
  RN_PUBLIC_URL: ORIGIN,
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_WORKFLOWS: "1",
  RN_WORKFLOWS_V2: "1",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <alerts@merlin.example>",
});
for (const k of ["RN_BILLING", "RN_FREE_COMPANY", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RN_AI_DRAFTS", "RN_SEND", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE", "RN_UI3", "RN_FUNDING"]) delete process.env[k];

const outbox: { url: string; body: Record<string, unknown> }[] = [];
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
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 900)}`}`);
};

/** Every file under a folder. */
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(path.join(d, f)).isDirectory() ? walk(path.join(d, f)) : [path.join(d, f)]));
/** The words a page says: string literals and JSX text in the work pages' TSX (code comments left out). */
function wordsOf(src: string): string[] {
  const noComments = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1");
  const out: string[] = [];
  for (const m of noComments.matchAll(/"([^"\\\n]{3,})"|`([^`\\]{3,})`|>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)) out.push(m[1] ?? m[2] ?? m[3] ?? "");
  return out;
}

const UI3ID = (id: string) => /^[a-z]_[A-Za-z0-9_-]{4,40}$/.test(id);
async function main() {
  const t = await import("../lib/table");
  const ui3 = await import("../lib/ui3");
  const pages = await import("../app/post/ui3/work/pages");
  const G = await import("../lib/workflows/graph");
  const SM = await import("../lib/workflows/simple");
  const W = await import("../lib/workflows");
  const n = await import("../lib/notify");
  const money = await import("../app/post/ui3/work/pipeline/money");
  const ev = await import("../app/post/evidence/evidenceModel");
  const R = await import("../app/api/workflows2/route.ts");
  const { NextRequest } = await import("next/server");
  const T = t.tableInternals;

  /* ---------- the flag ---------- */
  console.log("The flag");
  check("RN_UI3 unset is off", ui3.ui3Mode() === "off");
  check("off: nobody gets the new design, admins neither", JSON.stringify(ui3.ui3Me({ ui3: true }, { admin: true, ui2: true }, "off")) === "{}" && JSON.stringify(ui3.ui3Me({}, { admin: false, ui2: true }, "off")) === "{}");
  check("on: everyone with the new look gets it", ui3.ui3Me({}, { admin: false, ui2: true }, "on").ui3 === true);
  const tp = readFileSync(path.join(ROOT, "app/post/TradingPost.tsx"), "utf8");
  check("the shell asks for a work page only while the new design is on", /const ui3Key: Ui3PageKey \| null = !ui3\s*\n\s*\? null/.test(tp) && /: ui3WorkKey\(onScreen\)/.test(tp));
  const prop = readFileSync(path.join(ROOT, "app/post/Proposals.tsx"), "utf8");
  check("Proposals keeps Home2 unless the new design hands its own home", /const HomeNow = home2 \?\? Home2;/.test(prop) && /\.\.\.\(home2 \? \{ onOpenTab/.test(prop));

  /* ---------- the registry: each page is built and drawn ---------- */
  console.log("\nThe pages");
  const wp = readFileSync(path.join(ROOT, "app/post/ui3/work/WorkPage.tsx"), "utf8");
  const want: Record<string, string> = { proposals: "w:proposals", contracts: "w:contracts", evidence: "w:evidence", fractionals: "w:fractionals", peers: "w:fractionals", partners: "w:fractionals", messages: "w:messages", pipeline: "w:pipeline", alerts: "w:workflows" };
  for (const [page, key] of Object.entries(want)) check(`today's "${page}" opens ${key} under RN_UI3=on`, pages.ui3WorkKey(page) === key);
  check("no other page is taken over", pages.ui3WorkKey("today") === null && pages.ui3WorkKey("table") === null && pages.ui3WorkKey("credits") === null);
  for (const key of pages.UI3_WORK_BUILT) check(`${key} has its component`, key === "w:fractionals" || key === "w:messages" ? /k === "w:fractionals" \|\| k === "w:messages"/.test(wp) : wp.includes(`"${key}": dynamic(`));
  const head = readFileSync(path.join(ROOT, "app/post/ui3/head.ts"), "utf8");
  check("the shell's built list carries the work pages", /UI3_BUILT: readonly Ui3PageKey\[\] = \[[^\]]*\.\.\.UI3_WORK_BUILT/.test(head));

  /* ---------- plan gates ---------- */
  console.log("\nPlan gates");
  check("Evidence Bank is Close: Free and Pro get the upgrade screen", !ev.evidenceOpen({ canClose: false }) && ev.evidenceOpen({ canClose: true }));
  const evPage = readFileSync(path.join(ROOT, "app/post/ui3/work/evidence/EvidencePage.tsx"), "utf8");
  check("the new Evidence Bank page checks the plan before it loads anything", /const open = evidenceOpen\(c\.me\.plan\);\s*\n\s*if \(!open\)/.test(evPage));
  const prHome = readFileSync(path.join(ROOT, "app/post/ui3/work/proposals/ProposalsHome.tsx"), "utf8");
  check("Proposals: writing one is Close, said with the plan, never hidden", /data\.canBuild \?/.test(prHome) && /Writing proposals is on Close/.test(prHome) && /data\.canSend &&/.test(prHome));
  const ctPage = readFileSync(path.join(ROOT, "app/post/ui3/work/contracts/ContractsPage.tsx"), "utf8");
  check("Contracts: sending is Close, said above the list", /!v\.canSend &&/.test(ctPage));

  /* ---------- Workflows: Simple mode on the real engine ---------- */
  console.log("\nWorkflows, Simple mode");
  const close: import("../lib/workflows/graph").PlanGates = { tier: "close", paid: true, proposals: true, evidence: true };
  const prices = { company: 2, companyFull: 2, ballFree: false, opensLeft: 0, person: 1 };
  const sw = { funding: false, calls: false, send: false };
  const ver = (cfg: import("../lib/workflows/simple").SimpleCfg) => ({ ...SM.compileSimple(cfg), v: 1, savedAt: iso(t0) });
  const base = { ...SM.SIMPLE_DEFAULT, scope: { kind: "list" as const, list: "al_casey001" } };
  const v1 = ver(base);
  const chk = G.checkGraph(v1, close, prices, sw, ["al_casey001"]);
  check("the four stages compile to a graph the engine accepts", chk.ok, chk.problems);
  check("…with the credits said before it goes live: the company and who decides", chk.ceiling === 3, chk.ceiling);
  check("…and read back as the same four stages", JSON.stringify(SM.parseSimple(v1)) === JSON.stringify(base), SM.parseSimple(v1));
  check("every send in it waits for the member's tap", G.unapprovedSend(v1) === null);
  const bypass = { ...v1, nodes: [...v1.nodes, { id: "x_inv", type: "act.invite" as const, name: "Invite", on: true, settings: {}, pos: { x: 400, y: 600 } }], edges: [...v1.edges, { id: "e_bypass", from: "s_draft", out: "main", to: "x_inv" }] };
  const bad = G.checkGraph(bypass, close, prices, sw, ["al_casey001"]);
  check("a path around the approval to a send is refused, in plain words", !bad.ok && /needs your tap first/.test(bad.problems.join(" ")), bad.problems);
  const offAp = { ...v1, nodes: v1.nodes.map((x) => (x.id === "s_send" ? { ...x, on: false } : x)) };
  check("an approval switched off stops its path: the steps after it never run (they read as unapproved)", G.unapprovedSend(offAp) === null && SM.parseSimple(offAp) !== null);
  check("a graph changed past what Simple says opens in Advanced", SM.parseSimple(bypass) === null);
  check("Simple mode asks by email when chosen", v1.nodes.find((x) => x.id === "s_send")?.settings.email === true && G.cleanSettings("act.send", { email: true, days: 7 }).email === true && !("email" in G.cleanSettings("act.send", { days: 7 })));

  const C = "tok-c-000000001";
  const route = async (method: "GET" | "POST", body?: unknown, q = "") => {
    const req = new NextRequest(`${ORIGIN}/api/workflows2${q}`, { method, headers: { cookie: `rn_table=${C}`, ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const res = await (method === "POST" ? R.POST : R.GET)(req as never, undefined as never);
    return { status: res.status, j: (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: string; id?: string; run?: import("../lib/workflows/graph").GraphRun } };
  };
  const noCap = await route("POST", { op: "save", name: "No limit", mode: "simple", cap: null, version: SM.compileSimple(base) });
  check("a Simple workflow can't be saved without a monthly credit limit", noCap.status === 400 && noCap.j.error === (await import("../lib/workflows/v2")).SIMPLE_NEEDS_CAP, noCap);
  const saved = await route("POST", { op: "save", name: "Be first in the door", mode: "simple", cap: 2, version: SM.compileSimple({ ...base, follow: { ...base.follow, reply: false, followup: false } }) });
  check("with a limit it saves, as a draft and off", saved.status === 200 && !!saved.j.id, saved);
  const id = String(saved.j.id);
  const lst = await route("GET");
  const mine = (lst.j.workflows as { id: string; mode: string | null; cap: number | null; on: boolean }[]).find((x) => x.id === id);
  check("the list says it is Simple, with its limit and the member's prices", mine?.mode === "simple" && mine.cap === 2 && !mine.on && !!lst.j.prices, lst.j);
  const before = T.balance(await t.loadState(), "mem_c");
  const test = await route("POST", { op: "test", id, sample: { company: T.pubId("c_cedar") } });
  const tr = test.j.run!;
  check("Test workflow: a sample through the stages, stopping at the tap, nothing spent", test.status === 200 && tr.test && tr.spent === 0 && tr.nodes.find((x) => x.node === "s_send")?.status === "waiting" && T.balance(await t.loadState(), "mem_c") === before, tr?.nodes);
  // Owner review L2: one test and no live run. The list counts live runs only, says the test beside it, and Runs lists it, marked.
  {
    const l2 = await route("GET");
    const item = (l2.j.workflows as { id: string; runs30: number; tests30: number }[]).find((x) => x.id === id);
    const runsAll = await route("GET", undefined, `?id=${encodeURIComponent(id!)}&runs=1`);
    const rr = (runsAll.j.runs as { test: boolean }[]) ?? [];
    check("L2: with one test and no live run, the list counts 0 live runs and 1 test, apart", item?.runs30 === 0 && item?.tests30 === 1, item);
    check("L2: and the workflow's Runs lists that test, marked a test (no run is lost)", rr.length === 1 && rr[0].test === true, rr);
    const P = await import("../app/post/ui3/work/workflows/plan");
    check("L2: the cell reads '0 live · 1 test', and a list without tests just the count", P.runsCell(0, 1) === "0 live · 1 test" && P.runsCell(3, 0) === "3" && P.runsCell(2, 2) === "2 live · 2 tests");
    check("L2: the counting rule is said in words: live runs only, tests never counted, every run under Runs", /^Live runs counts what ran for real in the last 30 days\. Tests show beside it and are never counted/.test(P.RUNS_RULE) && /tests included/.test(P.RUNS_LIST_LINE));
    const wfp = readFileSync(path.join(ROOT, "app/post/ui3/work/workflows/WorkflowsPage.tsx"), "utf8");
    check("L2: Your workflows says Live runs, 30 days, the cell with its tests, and the rule under the list", /<span>Live runs, 30 days<\/span>/.test(wfp) && /\{runsCell\(x\.runs30, x\.tests30 \?\? 0\)\}/.test(wfp) && /id="wf3-runs-rule">\s*\{RUNS_RULE\}/.test(wfp) && /\{RUNS_LIST_LINE\}/.test(wfp));
    check("L2: the server counts tests apart from live runs", /const mine = runs\.filter\(\(r\) => r\.wf === g\.id && !r\.test\);/.test(readFileSync(path.join(ROOT, "lib/workflows/v2.ts"), "utf8")) && /tests30: tests\.filter\(\(r\) => r\.at >= month\)\.length/.test(readFileSync(path.join(ROOT, "lib/workflows/v2.ts"), "utf8")));
  }
  check("…with the draft the member would approve, and what it would cost", typeof tr.nodes.find((x) => x.node === "s_draft")?.output?.["Draft body"] === "string" && tr.nodes.some((x) => typeof x.output?.["Would spend"] === "number"), tr.nodes.map((x) => [x.node, x.output]));
  await route("POST", { op: "live", id });
  await route("POST", { op: "on", id, on: true });
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await n.settled();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const evOf = (key: string, co: string) => ({ memberId: "mem_c", key, trigger: "seat" as const, at: iso(Date.now()), companyId: co, line: "A fractional seat ended at a locked company", href: `/?c=${T.pubId(co)}`, lists: ["al_casey001"] });
  await W.runEvents([evOf("seat:u1", "c_cedar")]);
  await settle();
  const runs = () => t.loadState().then((s) => (s.workflows?.mem_c?.graphRuns ?? []).filter((r) => r.wf === id && !r.test).sort((a, b) => b.at.localeCompare(a.at)));
  const r1 = (await runs())[0];
  check("a live run spends at most its quote, under the limit", !!r1 && r1.spent <= 2 && r1.spent <= r1.quote, r1);
  const sendStep = r1?.nodes.find((x) => x.node === "s_send");
  check("the approval never sends: with sending off, the note is a draft in Messages and nothing went out", sendStep?.status === "skipped" && /nothing was sent/i.test(sendStep.note), sendStep);
  check("…and the member is told where the draft is: the bell, and email as chosen", ((await t.loadState()).inbox?.mem_c ?? []).some((b) => /drafted waits in Messages/.test(b.line)) && outbox.some((o) => JSON.stringify(o.body).includes("casey@close.example") && /drafted waits in Messages/.test(JSON.stringify(o.body))));
  const spentSoFar = (await runs()).reduce((s, r) => s + r.spent, 0);
  await W.runEvents([evOf("seat:u2", "c_halcyon")]);
  await settle();
  const r2 = (await runs())[0];
  // The first run took the day's free company and 1 credit; the next company and who decides would pass the limit of 2.
  check("at the monthly limit a run spends nothing and waits for the member's yes", r2.id !== r1.id && spentSoFar + (r2.ask?.credits ?? 0) > 2 && r2.status === "waiting" && r2.wait?.kind === "cap" && r2.spent === 0, { spentSoFar, r2 });
  check("…asked in the bell, with the credits a yes would spend", ((await t.loadState()).inbox?.mem_c ?? []).some((b) => b.ask?.run === r2.id && (b.ask.credits ?? 0) > 0));
  const no = await route("POST", { op: "answer", run: r2.id, yes: false });
  check("…no spends nothing", no.status === 200 && (await runs()).reduce((s, r) => s + r.spent, 0) === spentSoFar, no);


  /* ---------- RN_WORKFLOWS_V2=optin: v2 only for members with the new design on ---------- */
  console.log("\nOptin");
  const VM = await import("../lib/workflows/v2mode");
  const RUN = await import("../lib/workflows/run");
  process.env.RN_WORKFLOWS_V2 = "optin";
  process.env.RN_UI3 = "optin";
  process.env.RN_ADMIN_EMAILS = "casey@close.example";
  const s0 = await t.loadState();
  const isV2 = VM.v2Of(s0, VM.emailsFrom(seed, s0));
  check("optin: v2 for a member with the new design on, nobody else", VM.v2Mode() === "optin" && isV2("mem_c") && !isV2("mem_d") && !isV2("mem_e") && !isV2("mem_t"));
  const routeAs = async (tok: string, method: "GET" | "POST", body?: unknown, q = "") => {
    const req = new NextRequest(`${ORIGIN}/api/workflows2${q}`, { method, headers: { cookie: `rn_table=${tok}`, ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const res = await (method === "POST" ? R.POST : R.GET)(req as never, undefined as never);
    return res.status;
  };
  check("optin with the new design on: the v2 API answers", (await routeAs(C, "GET")) === 200);
  check("optin with the new design off: the v2 API is a 404, as if it were off", (await routeAs("tok-d-000000001", "GET")) === 404);
  const gr0 = (await runs()).length;
  await W.runEvents([evOf("seat:o1", "c_north")]);
  await settle();
  check("optin with the new design on: an event runs on the graph runner", (await runs()).length === gr0 + 1);

  // Today's runner, byte for byte: the twins' identical workflow, one under optin, one with v2 off.
  const flow = (m: string) => ({ id: `wf_twin_${m}`, name: "Seat ended: pipeline and tell me", on: true, trigger: "seat" as const, scope: { kind: "list" as const, list: `al_${m}0001` }, steps: [{ key: "dm" as const }, { key: "pipe" as const }, { key: "tell" as const }], cap: null, warn: null, createdAt: seen, updatedAt: seen });
  await T.mutate((d) => {
    d.workflows ??= {};
    for (const m of ["mem_d", "mem_e"]) d.workflows[m] = { flows: [flow(m)], runs: [], reminders: [], drafts: [], keys: [] };
  });
  const twinEv = (m: string) => ({ memberId: m, key: `seat:twin`, trigger: "seat" as const, at: iso(Date.now()), companyId: "c_cedar", line: "A fractional seat ended at a locked company", href: `/?c=${T.pubId("c_cedar")}`, lists: [`al_${m}0001`] });
  await W.runEvents([twinEv("mem_d")]);
  await settle();
  delete process.env.RN_WORKFLOWS_V2;
  await W.runEvents([twinEv("mem_e")]);
  await settle();
  process.env.RN_WORKFLOWS_V2 = "optin";
  const sT = await t.loadState();
  const norm = (m: string) => {
    const w = sT.workflows![m];
    return { runs: w.runs.map(({ id: _i, wf: _w, at: _a, ...r }) => r), graphRuns: (w.graphRuns ?? []).length, drafts: w.drafts.length, keys: w.keys.map((k) => k.split("|")[1]), spent: sT.ledger.filter((l) => l.memberId === m).map((l) => [l.reason, l.delta]) };
  };
  check("optin with the new design off: today's runner, the same run as with v2 off", norm("mem_d").runs.length === 1 && JSON.stringify(norm("mem_d")) === JSON.stringify(norm("mem_e")), { d: norm("mem_d"), e: norm("mem_e") });

  // The new design switched off: the member's v2 workflows are kept, paused.
  const graphsBefore = (await t.loadState()).workflows!.mem_c.graphs!.map((g) => ({ id: g.id, on: g.on, live: !!g.live }));
  await T.mutate((d) => {
    (d.profiles.mem_c as { ui3?: boolean }).ui3 = false;
  });
  const gr1 = (await runs()).length;
  await W.runEvents([evOf("seat:o2", "c_north")]);
  await settle();
  const s2 = await t.loadState();
  check("new design off: the v2 workflows are all still there, unchanged (not deleted)", JSON.stringify(s2.workflows!.mem_c.graphs!.map((g) => ({ id: g.id, on: g.on, live: !!g.live }))) === JSON.stringify(graphsBefore) && graphsBefore.length > 0);
  check("…and paused: an event runs none of them, on either runner", (await runs()).length === gr1 && !s2.workflows!.mem_c.runs.some((r) => r.at > iso(Date.now() - 5000) && r.wf === id));
  check("…the v2 API is a 404 while it is off", (await routeAs(C, "GET")) === 404);
  const oldTab = await W.workflowsFor(C);
  check("…and the current design's Workflows tab says which are paused, and that they carry on when switched back (acceptance F11)", !!oldTab && oldTab.on === true && (oldTab.paused ?? []).length === graphsBefore.length, oldTab && "paused" in oldTab ? oldTab.paused : oldTab);
  check("…a member with nothing saved in the new design sees no paused line", !("paused" in ((await W.workflowsFor("tok-d-000000001")) ?? {})));
  check("switching back to the current design warns first when workflows would pause", /backToCurrent = async/.test(tp) && /window\.confirm\(`\$\{n === 1 \? "Your workflow"/.test(readFileSync(path.join(ROOT, "app/post/TradingPost.tsx"), "utf8")));
  const answered = await RUN.approveRun("mem_c", r2.id, true).then((x) => x, (e) => (e as Error).message);
  check("…a run waiting on one holds: answering it is refused, nothing spent", /paused while the new design is off/.test(String(answered)) && (await runs()).reduce((n2, r) => n2 + r.spent, 0) === spentSoFar, answered);
  await T.mutate((d) => {
    (d.profiles.mem_c as { ui3?: boolean }).ui3 = true;
  });
  await W.runEvents([evOf("seat:o3", "c_north")]);
  await settle();
  check("new design back on: they carry on where they were", (await routeAs(C, "GET")) === 200 && (await runs()).length === gr1 + 1);

  /* ---------- the trial: its company opens a day; past them nothing is spent ---------- */
  console.log("\nThe trial's opens and the limit");
  process.env.RN_WORKFLOWS_V2 = "1";
  Object.assign(process.env, { RN_BILLING: "1", STRIPE_SECRET_KEY: "sk_test_made_up", STRIPE_WEBHOOK_SECRET: "whsec_made_up", STRIPE_PRICE_MONTH: "price_m", STRIPE_PRICE_YEAR: "price_y" });
  const today = iso(Date.now());
  await T.mutate((d) => {
    ((d as { billing?: { members: Record<string, unknown> } }).billing ??= { members: {} } as never).members.mem_t = { trialStartedAt: iso(Date.now() - DAY), trialEndsAt: iso(Date.now() + 10 * DAY) };
  });
  const TOK = "tok-t-000000001";
  const routeT = async (body: unknown) => {
    const req = new NextRequest(`${ORIGIN}/api/workflows2`, { method: "POST", headers: { cookie: `rn_table=${TOK}`, "content-type": "application/json", origin: ORIGIN }, body: JSON.stringify(body) });
    const res = await R.POST(req as never, undefined as never);
    return (await res.json()) as { id?: string; error?: string };
  };
  const tw = await routeT({ op: "save", name: "Trial seat", mode: "simple", cap: 1, version: SM.compileSimple({ ...SM.SIMPLE_DEFAULT, scope: { kind: "list", list: "al_mem_t0001" }, dm: false, follow: { ...SM.SIMPLE_DEFAULT.follow, reply: false, followup: false } }) });
  check("the trial saves a Simple workflow with a limit of 1", !!tw.id, tw);
  await routeT({ op: "live", id: tw.id });
  await routeT({ op: "on", id: tw.id, on: true });
  const tEv = (k: string, co: string) => ({ memberId: "mem_t", key: k, trigger: "seat" as const, at: iso(Date.now()), companyId: co, line: "A fractional seat ended at a locked company", href: "/", lists: ["al_mem_t0001"] });
  const tRuns = async () => ((await t.loadState()).workflows?.mem_t?.graphRuns ?? []).filter((r) => r.wf === tw.id && !r.test).sort((a, b) => b.at.localeCompare(a.at));
  await W.runEvents([tEv("seat:t1", "c_cedar")]);
  await settle();
  const t1 = (await tRuns())[0];
  check("within the day's free opens a company costs nothing and the run goes on", !!t1 && t1.spent === 0 && t1.nodes.find((x) => x.node === "s_open")?.status === "done", t1?.nodes);
  // The day's opens used up: the usual price applies, and it counts toward the limit.
  await T.mutate((d) => {
    const opens: Record<string, string> = {};
    for (let i = 0; i < 60; i++) opens[`c_used${i}`] = today;
    ((d as { planOpens?: Record<string, Record<string, string>> }).planOpens ??= {}).mem_t = { ...((d as { planOpens?: Record<string, Record<string, string>> }).planOpens?.mem_t ?? {}), ...opens };
  });
  await W.runEvents([tEv("seat:t2", "c_halcyon")]);
  await settle();
  const t2 = (await tRuns())[0];
  // In this code the trial doesn't charge past its daily opens: it stops opening until tomorrow. A run then spends nothing, says why, and doesn't fail.
  check("past the trial's daily opens nothing is spent: the company steps say the limit, and the run doesn't fail", !!t2 && t2.id !== t1?.id && t2.spent === 0 && /opened 40 companies today/.test(t2.nodes.find((x) => x.node === "s_open")?.note ?? "") && t2.status !== "failed" && t2.nodes.find((x) => x.node === "s_send")?.status === "skipped", t2?.nodes.map((x) => [x.node, x.status, x.note]));
  check("…and nothing counts toward the limit", (await tRuns()).reduce((n2, r) => n2 + r.spent, 0) === 0);
  /* ---------- Pro: the step that spends, and the monthly limit end to end (acceptance F21) ---------- */
  console.log("\nPro: Find their email and the monthly limit");
  await T.mutate((d) => {
    (d as { billing?: { members: Record<string, unknown> } }).billing!.members.mem_p = { proUntil: iso(Date.now() + 20 * DAY), interval: "month", tier: "pro" };
  });
  const PTOK = "tok-p-000000001";
  const routeP = async (method: "GET" | "POST", body?: unknown, q = "") => {
    const req = new NextRequest(`${ORIGIN}/api/workflows2${q}`, { method, headers: { cookie: `rn_table=${PTOK}`, ...(method === "POST" ? { "content-type": "application/json", origin: ORIGIN } : {}) }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
    const res = await (method === "POST" ? R.POST : R.GET)(req as never, undefined as never);
    return (await res.json().catch(() => ({}))) as Record<string, unknown> & { id?: string; error?: string; run?: import("../lib/workflows/graph").GraphRun };
  };
  const proCfg = { ...SM.SIMPLE_DEFAULT, scope: { kind: "list" as const, list: "al_mem_p0001" }, email: true, follow: { ...SM.SIMPLE_DEFAULT.follow, reply: false, followup: false } };
  check("Simple mode has Find their email: off by default, and a saved workflow without it reads back the same", SM.SIMPLE_DEFAULT.email === false && !SM.compileSimple(SM.SIMPLE_DEFAULT).nodes.some((x) => x.id === "s_email") && SM.parseSimple(SM.compileSimple(SM.SIMPLE_DEFAULT))?.email === false);
  check("…on, it is a real step after who decides, and reads back on", SM.compileSimple(proCfg).nodes.some((x) => x.id === "s_email" && x.type === "find.email") && SM.parseSimple(SM.compileSimple(proCfg))?.email === true);
  const pw = await routeP("POST", { op: "save", name: "Email who decides", mode: "simple", cap: 1, version: SM.compileSimple(proCfg) });
  check("Pro saves a Simple workflow with Find their email and a limit of 1", !!pw.id, pw);
  const plist = await routeP("GET");
  const pItem = (plist.workflows as { id: string; ceiling: number }[]).find((x) => x.id === pw.id);
  const pPrices = plist.prices as { company: number; person: number; detail?: number };
  check("on Pro only the email costs: the company and who decides are free, the email 1 credit", pPrices.companyFull === 0 && pPrices.person === 0 && pPrices.detail === 1, pPrices);
  const pOne = (await routeP("GET", undefined, `?id=${pw.id}`)) as { draftCheck?: { ceiling: number } };
  check("…so the workflow's ceiling is 1 credit a run (the spending panel shows the limit)", pOne.draftCheck?.ceiling === 1 && (pItem?.ceiling ?? 0) === 0, { pOne: pOne.draftCheck, pItem });
  check("the runner is on: the page may say Live", plist.running === true);
  await routeP("POST", { op: "live", id: pw.id });
  await routeP("POST", { op: "on", id: pw.id, on: true });
  const pEv = (k: string, co: string) => ({ memberId: "mem_p", key: k, trigger: "seat" as const, at: iso(Date.now()), companyId: co, line: "A fractional seat ended", href: "/", lists: ["al_mem_p0001"] });
  const pRuns = async () => ((await t.loadState()).workflows?.mem_p?.graphRuns ?? []).filter((r) => r.wf === pw.id && !r.test).sort((a, b) => b.at.localeCompare(a.at));
  const pBal0 = T.balance(await t.loadState(), "mem_p");
  await W.runEvents([pEv("seat:p1", "c_ember")]);
  await settle();
  const p1 = (await pRuns())[0];
  check("a run under the limit spends the email's 1 credit, and the email is open", !!p1 && p1.spent === 1 && p1.nodes.find((x) => x.node === "s_email")?.status === "done" && pBal0 - T.balance(await t.loadState(), "mem_p") === 1, p1?.nodes.map((x) => [x.node, x.status, x.note, x.credits]));
  check("…the ledger line carries the workflow's name", (await t.loadState()).ledger.some((l) => l.memberId === "mem_p" && l.wf === "Email who decides" && l.delta === -1));
  await W.runEvents([pEv("seat:p2", "c_fjord")]);
  await settle();
  const p2 = (await pRuns())[0];
  check("at the limit the next run spends nothing and waits for the member's yes", !!p2 && p2.id !== p1?.id && p2.status === "waiting" && p2.wait?.kind === "cap" && p2.spent === 0 && p2.nodes.find((x) => x.node === "s_email")?.status === "waiting" && pBal0 - T.balance(await t.loadState(), "mem_p") === 1, p2?.nodes.map((x) => [x.node, x.status, x.note]));
  check("…asked in-app, with the credit a yes would spend", ((await t.loadState()).inbox?.mem_p ?? []).some((b) => b.ask?.run === p2?.id && b.ask.credits === 1));
  const pYes = await routeP("POST", { op: "answer", run: p2!.id, yes: true });
  await settle();
  const p2b = (await pRuns()).find((r) => r.id === p2!.id);
  check("…yes spends exactly what it asked, and the run carries on", !pYes.error && p2b?.spent === 1 && p2b.nodes.find((x) => x.node === "s_email")?.status === "done" && pBal0 - T.balance(await t.loadState(), "mem_p") === 2, { pYes, nodes: p2b?.nodes.map((x) => [x.node, x.status]) });
  // RN_WORKFLOWS off (acceptance F2): the page is told nothing runs, so it never says Live.
  delete process.env.RN_WORKFLOWS;
  const offList = await routeP("GET");
  process.env.RN_WORKFLOWS = "1";
  check("with Merlin's runner off the list says so (running false): the page shows an honest state, not Live", offList.running === false);
  const wfPage = readFileSync(path.join(ROOT, "app/post/ui3/work/workflows/WorkflowsPage.tsx"), "utf8");
  check("…and the page's status reads running before it says Live", /: running \? \{ words: "Live"/.test(wfPage) && /list\.running === false &&/.test(wfPage));
  check("the spending panel shows the monthly limit only when a step can spend", /\{ceiling \? \(\s*<>\s*<div className="wf3-cap">/.test(wfPage));
  check("workflow copy: in-app notifications, never the bell; never 'up to 0 credits'; the trigger keeps its capital I", !/in the bell|the bell says/.test(wfPage) && /x\.ceiling \? `up to/.test(wfPage) && /TRIG_LABEL\[t\]\.charAt\(0\)\.toLowerCase\(\)/.test(wfPage));

  for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"]) delete process.env[k];

  /* ---------- Saved and Hidden take only real companies (acceptance F36) ---------- */
  console.log("\nSaved and Hidden");
  process.env.RN_UI3 = "on";
  const saveBogus = await t.perform(C, ui3.ui3Action({ ui3Save: { id: "c_nosuchco0001", on: true } })).then(() => "ok", (e) => (e as Error).message);
  check("Saved refuses a well-formed id that is no company on Merlin", /isn't on Merlin/.test(saveBogus), saveBogus);
  const hideBogus = await t.perform(C, ui3.ui3Action({ ui3Hide: { id: "c_nosuchco0001", on: true } })).then(() => "ok", (e) => (e as Error).message);
  check("Hidden refuses it too", /isn't on Merlin/.test(hideBogus), hideBogus);
  const seatId = T.pubId("e_north_ops");
  const saveSeat = await t.perform(C, ui3.ui3Action({ ui3Save: { id: seatId, on: true } })).then(() => "ok", (e) => (e as Error).message);
  check("…and a seat's or a person's id (only a company's own id is kept)", UI3ID(seatId) ? /isn't on Merlin/.test(saveSeat) : true, { seatId, saveSeat });
  const saveReal = await t.perform(C, ui3.ui3Action({ ui3Save: { id: T.pubId("c_cedar"), on: true } }));
  check("a real company saves", /Saved/.test(saveReal.message) && ((await t.loadState()).profiles.mem_c as { ui3Saved?: string[] }).ui3Saved?.includes(T.pubId("c_cedar")) === true, saveReal);
  const takeOut = await t.perform(C, ui3.ui3Action({ ui3Hide: { id: "c_nosuchco0001", on: false } }));
  check("taking an id out always works (a stale one can go)", /back in your lists/.test(takeOut.message));

  /* ---------- the pipeline's money ---------- */
  console.log("\nPipeline money");
  const D = (stage: string, monthly: number, won?: boolean) => ({ stage, monthly, won: won ? ({ pricing: "monthly", rate: monthly } as never) : undefined }) as never;
  const m = money.moneyOf([D("reach", 12000), D("sent", 9500), D("replied", 0), D("proposal", 16000), D("proposal", 10500), D("won", 12000, true), D("won", 9000), D("lost", 20000), D("notnow", 5000)]);
  check("open pipeline: every open stage's typed value, a month", m.open === 48000 && m.openN === 5, m);
  check("proposals out: the Proposal stage only, and a part of the open pipeline", m.props === 26500 && m.propsN === 2 && m.props <= m.open, m);
  check("won: the Won deals' terms, and a Won deal without terms counts the value typed (acceptance F12)", m.won === 21000 && m.wonN === 2, m);
  check("…and the page asks for the missing terms", m.wonNoTerms === 1 && /Add the terms of your win/.test(readFileSync(path.join(ROOT, "app/post/ui3/work/pipeline/PipelinePage.tsx"), "utf8")), m);
  check("…a Won deal with no terms and no value counts nothing, never guessed", money.moneyOf([D("won", 0)]).won === 0);
  check("lost and not now count nowhere", m.open + m.won === 69000);
  check("a deal with no value is counted as such, never guessed", m.openNoValue === 1);
  // Owner review, simulated operators 3: unknown values are unknown, never $0.
  {
    const V = (stage: string, value: number | null) => ({ stage, value, monthly: value ?? 0, won: undefined }) as never;
    const allMissing = money.moneyOf([V("reach", null), V("sent", null)]);
    const hAll = money.moneyHead(allMissing.open, allMissing.openN, allMissing.openNoValue);
    check("sim 3, all missing: 'Value unknown · 2 unpriced deals', never $0", hAll.big === "Value unknown" && hAll.unknown && hAll.left === "2 unpriced deals, not counted" && allMissing.open === 0 && allMissing.openNoValue === 2, [allMissing, hAll]);
    const zero = money.moneyOf([V("reach", 0), V("sent", 0)]);
    const hZero = money.moneyHead(zero.open, zero.openN, zero.openNoValue);
    check("sim 3, explicit zero: a value of $0 is a value: $0, nothing unpriced", hZero.big === "$0" && !hZero.unknown && hZero.left === null && zero.openNoValue === 0, [zero, hZero]);
    const mixed = money.moneyOf([V("reach", 6000), V("sent", null), V("proposal", null), V("proposal", 4000)]);
    const hMix = money.moneyHead(mixed.open, mixed.openN, mixed.openNoValue);
    const pMix = money.moneyHead(mixed.props, mixed.propsN, mixed.propsNoValue);
    check("sim 3, mixed: the total counts only the priced deals and says how many are left out", mixed.open === 10000 && hMix.big === "$10k" && hMix.left === "Not counted: 2 unpriced deals" && pMix.big === "$4k" && pMix.left === "Not counted: 1 unpriced deal", [mixed, hMix, pMix]);
    const plSrc = readFileSync(path.join(ROOT, "app/post/ui3/work/pipeline/PipelinePage.tsx"), "utf8");
    check("sim 3: the money cards lead with moneyHead (Value unknown when nothing is priced)", /const openHead = moneyHead\(m\.open, m\.openN, m\.openNoValue\);/.test(plSrc) && /\{openHead\.big\}/.test(plSrc) && /\{propsHead\.big\}/.test(plSrc) && !/kMoney\(m\.open\)/.test(plSrc));
    check("sim 3: the current look's table head says Value unknown too, never $0 for unpriced deals", /Value unknown · \$\{unpriced\} unpriced/.test(readFileSync(path.join(ROOT, "app/post/pipeline/Board.tsx"), "utf8")));
  }
  check("the money words: $96.5k, $26.5k, $12k, $900", money.kMoney(96500) === "$96.5k" && money.kMoney(26500) === "$26.5k" && money.kMoney(12000) === "$12k" && money.kMoney(900) === "$900" && money.kMoney(120000) === "$120k");

  /* ---------- the shell and the record (acceptance F10, F14, F15, F20, F26, F29, F30, F35) ---------- */
  console.log("\nShell and record");
  const cur = await import("../app/post/ui3/current");
  check("a record opened from Crystal Ball sits under Crystal Ball in the nav, from a list under Target Companies (F15)", cur.ui3Current("table", "companies", "all", true, null, "radar") === "radar" && cur.ui3Current("table", "companies", "all", true, null, null) === "companies" && cur.ui3Current("table", "companies", "all", true, null, "getin") === "warm");
  check("…and the nav reads where it was opened from, over a page included", /drawer \? \(drawer\.over \?\? drawer\.returnTo \?\? null\) : null/.test(tp));
  const cpage = readFileSync(path.join(ROOT, "app/post/company/CompanyPage.tsx"), "utf8");
  check("the full record inside the new design draws no header of its own: one breadcrumb, one credits pill, one Add (F15)", /const ui3Head = useUi3Header\(\);/.test(cpage) && /\{ui3Head \? null : \(\s*\n\s*<header className="ws-head co-topbar">/.test(cpage));
  const H = await import("../app/post/ui3/head");
  check("the new design says Open: \"Open company · 2 credits\", \"Open all 6\", today's look keeps Unlock (F26)", H.openSay("Unlock company · 2 credits", true) === "Open company · 2 credits" && H.openSay("Unlock all", true) === "Open all" && H.openSay("Unlocking", true) === "Opening" && H.openSay("Unlock company · 2 credits", false) === "Unlock company · 2 credits");
  const tgt = readFileSync(path.join(ROOT, "app/post/ui3/Targets.tsx"), "utf8");
  check("a locked row on Target Companies offers Open company through the record's own unlock (it quotes first), never a refused Add to pipeline (F10)", /\) : i\.c\.hidden \? \(/.test(tgt) && /ui\.unlock\(\{ entity: "company", id: i\.c\.id, field: "identity" \}\)/.test(tgt) && /"Open company"/.test(tgt));
  check("…and no second Locked chip squeezing the name (F29)", !/>\s*Locked\s*<\/Chip>/.test(tgt));
  const cmp = readFileSync(path.join(ROOT, "app/post/ui3/Company.tsx"), "utf8");
  check("the record's header says each fact once (F30)", /size && !line\.includes\(size\)/.test(cmp) && /stage && !line\.includes\(stage\)/.test(cmp));
  const shellCss = readFileSync(path.join(ROOT, "app/post/ui3/shell.css"), "utf8");
  check("laptops (800 and 768 high): the nav items fit above the account and the art shrinks behind it (F14)", /@media \(max-height: 900px\)[^\n]*\.m-nav-item \{ height: 38px; \}[^\n]*\.m-nav-art \{ height: 150px; \}/.test(shellCss) && /@media \(max-height: 780px\)[^\n]*\.m-nav-item \{ height: 35px; \}/.test(shellCss));
  const u3css = readFileSync(path.join(ROOT, "app/post/ui3/ui3.css"), "utf8");
  check("phones: a compact title band on every page, the art a small corner beside the title (F20)", /compact title band on every page/.test(u3css) && /width: 88px !important; height: 44px !important;/.test(u3css));
  const shared = readFileSync(path.join(ROOT, "app/ui/shared.tsx"), "utf8");
  check("the design switch says one thing: its toast alone on screen (F35)", /if \(opts\?\.only\) \{/.test(shared) && /toast\(r\.message, false, \{ only: true \}\)/.test(tp));

  /* ---------- copy ---------- */
  console.log("\nA template's full preview (owner review M4)");
  {
    const P = await import("../app/post/ui3/work/workflows/plan");
    const S = await import("../lib/workflows/simple");
    const prices = { company: 2, companyFull: 2, ballFree: false, opensLeft: 0, person: 1, detail: 1 };
    const cfg = { ...S.SIMPLE_DEFAULT, trigger: "leader" as const, scope: { kind: "follows" as const }, dm: false };
    const st = P.planStages(cfg, prices, true);
    const all = st.flatMap((x) => x.steps.map((y) => y.say));
    check("M4: four stages, in order: When this happens, Merlin does this, I approve, Merlin follows through", st.map((x) => x.kicker).join() === "When this happens,Merlin does this,I approve,Merlin follows through");
    check("M4: every research and drafting step is listed with its cost", JSON.stringify(st[1].steps) === JSON.stringify([{ say: "Research the company", cost: "2 credits" }, { say: "Find my warmest way in", cost: "No credits" }, { say: "Draft an introduction in my voice", cost: "No credits" }]), st[1].steps);
    check("M4: every follow-up step is listed, the follow-up waiting for approval too", st[3].steps.map((x) => x.say).join("|") === "Update my pipeline|Watch for a reply for 4 days|Prepare a follow-up, which waits for my approval too", st[3].steps);
    check("M4: the approval point says nothing goes out without me, how I'm asked, and when it is skipped", st[2].head === "Nothing goes out without me." && st[2].steps.map((x) => x.say).join("|") === "Merlin asks me in in-app notifications and email|I review, edit or skip the draft before anything is sent|Skipped if I don't answer in 7 days", st[2].steps);
    check("M4: the expected cost and the monthly limit, before Use template", P.planSpendLine(cfg, prices, true) === "Expected cost: up to 2 credits a run. Monthly credit limit 60: Merlin pauses spending at the limit and asks before continuing. You can change it before it goes live.", P.planSpendLine(cfg, prices, true));
    const dflt = P.planStages(S.SIMPLE_DEFAULT, prices, true)[1].steps;
    check("M4: the default's steps cost what the engine says (decision maker 1, after research)", dflt.find((x) => x.say === "Find the decision maker")?.cost === "1 credit" && P.simpleCeiling(prices, S.SIMPLE_DEFAULT, true) === 3, dflt);
    const ball = P.planStages(S.SIMPLE_DEFAULT, { ...prices, ballFree: true }, true)[1].steps;
    check("M4: a Crystal Ball company that opens free on the plan is said No credits, never a price it won't spend", ball[0].cost === "No credits", ball);
    const free = P.planStages(cfg, prices, false);
    check("M4: on Free the paid steps say On Pro, and the line says so", free[1].steps[0].cost === "On Pro" && /^Research and drafting are on Pro\./.test(P.planSpendLine(cfg, prices, false)));
    check("M4: no step is cut short: no ellipsis in any step", !all.some((x) => /…|\.\.\./.test(x)));
    const page = readFileSync(path.join(ROOT, "app/post/ui3/work/workflows/WorkflowsPage.tsx"), "utf8");
    check("M4: each card offers Preview all steps before Use template (a dialog button, keyboard reachable)", /aria-haspopup="dialog" aria-label=\{`Preview every step of \$\{t\.t\}, with its cost and where you approve`\} onClick=\{\(\) => setPrev\(t\)\}>\s*Preview all steps/.test(page) && page.indexOf("Preview all steps") < page.indexOf("Use template", page.indexOf("Preview all steps")));
    check("M4: the preview draws planStages with each step's cost and the spending line, and its own Use template", /planStages\(t\.cfg, prices, paid\)\.map/.test(page) && /<span className="wf3-prev-cost">\{l\.cost\}<\/span>/.test(page) && /planSpendLine\(t\.cfg, prices, paid\)/.test(page));
    const parts = readFileSync(path.join(ROOT, "app/post/ui3/work/parts.tsx"), "utf8");
    check("M4: the preview is a dialog: Tab stays inside it, Esc closes it and focus goes back to the button that opened it", /e\.key === "Tab" && ref\.current/.test(parts) && /e\.key !== "Escape"/.test(parts) && /was\?\.focus\?\.\(/.test(parts) && /role="dialog" aria-modal="true"/.test(parts));
    const css = readFileSync(path.join(ROOT, "app/post/ui3/work/workflows/workflows.css"), "utf8");
    check("M4: on a phone the preview scrolls inside the screen and Use template stays at its foot; steps wrap", /\.m-sheet:has\(\.wf3-prev\) \{ max-height: calc\(100vh - 32px\); overflow-y: auto; \}/.test(css) && /\.m-sheet:has\(\.wf3-prev\) \.m-acts \{ position: sticky;/.test(css) && /\.wf3-prev-step \{ display: flex; flex-wrap: wrap;/.test(css) && !/wf3-mini[^}]*text-overflow/.test(css));
  }

  console.log("\nFiltered empty states (owner review L1)");
  {
    const E = await import("../app/post/ui3/work/empty");
    const w = E.noMatchWords({ noun: ["run", "runs"], filter: "Failed", total: 3 });
    check("L1: the heading names the filter, the line says the rows are still there, Show all with the count", w.head === "No runs in Failed" && w.line === "All 3 runs are still here. Show all clears the filter." && w.button === "Show all 3", w);
    const w2 = E.noMatchWords({ noun: ["document", "documents"], filter: "Completed", q: "acme", total: 1 });
    check("L1: with a search too, both are named", w2.head === 'No documents in Completed matching "acme"' && w2.line === "Your document is still here. Show all clears the filter and the search.", w2);
    check("L1: the count read out on a change: how many of how many, in which filter", E.matchLine(0, 2, ["deal", "deals"], "Next move due") === "0 of 2 deals in Next move due" && E.matchLine(2, 2, ["deal", "deals"], null) === "2 deals");
    const partsSrc = readFileSync(path.join(ROOT, "app/post/ui3/work/parts.tsx"), "utf8");
    check("L1: Show all clears the filter and puts focus back on the All chip of the same page; the count is aria-live", /onShowAll\(\);\s*setTimeout\(\(\) => root\.querySelector<HTMLElement>\(`\[data-chip="\$\{chipAll\}"\]`\)\?\.focus\(\), 30\);/.test(partsSrc) && /data-chip=\{x\.k\}/.test(partsSrc) && /aria-live="polite" aria-atomic="true">\s*\{matchLine\(/.test(partsSrc));
    const src = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
    const runsSrc = src("app/post/ui3/work/workflows/WorkflowsPage.tsx");
    check("L1 Workflows Runs: Failed (0) says so by name with Show all, never a blank table; no runs at all is its own state", /\{!list\.length && <NoMatch noun=\{RUN_NOUN\} filter=\{RUN_FILTER\[filter\]\} total=\{rows\.length\} onShowAll=\{\(\) => setFilter\("all"\)\} \/>\}/.test(runsSrc) && /hidden=\{!list\.length\}/.test(runsSrc) && /<b className="w-h4">No runs yet<\/b>/.test(runsSrc));
    const ct = src("app/post/ui3/work/contracts/ContractsPage.tsx");
    check("L1 Contracts: Completed (0) names the filter (and the search), never 'No documents here'; nothing sent yet is its own state", /<NoMatch noun=\{DOC_NOUN\}/.test(ct) && !/No documents here/.test(ct) && /title="Nothing sent for signature yet"/.test(ct));
    const pl = src("app/post/ui3/work/pipeline/PipelinePage.tsx");
    check("L1 Pipeline: Next move due (0) names the filter with Show all, in place of the board or table; no deals at all keeps its own words", /const noMatch = mode !== "intros" && !first && filter !== "all" && !shown\.length;/.test(pl) && /\{noMatch \? <NoMatch noun=\{DEAL_NOUN\} filter=\{filterLabel\}/.test(pl) && /!shown\.length && first && <p/.test(pl) && /<b className="w-h4">No deals yet<\/b>/.test(pl));
    const pr = src("app/post/ui3/work/proposals/ProposalsHome.tsx");
    check("L1 Proposals: a filter with none says it by name, never 'Nothing here'", /<NoMatch noun=\{PROPOSAL_NOUN\}/.test(pr) && !/>Nothing here\.</.test(pr));
    check("L1: every page reads out the match count", [runsSrc, ct, pl, pr].every((x) => /<MatchCount /.test(x)));
    check("L1: a hidden table is hidden in the new design's styles", /\.ui3 \.w3 \[hidden\] \{ display: none !important; \}/.test(src("app/post/ui3/work/work.css")));
  }

  console.log("\nKeyboard and contrast (journey K1, K2, X1)");
  {
    const src = (f: string) => readFileSync(path.join(ROOT, f), "utf8");
    const am = src("app/post/AddModal.tsx");
    check("K1: Add what you know moves focus into the sheet when it opens (a field first)", /Opened by keyboard \(journey K1\)/.test(am) && /if \(!box \|\| box\.contains\(document\.activeElement\)\) return;/.test(am));
    const pl = src("app/post/ui3/work/pipeline/PipelinePage.tsx");
    check("K2: the deal panel takes focus, keeps Tab inside, closes on Escape and gives focus back to the deal's card", /function SidePanel\(/.test(pl) && /el\.focus\(\{ preventScroll: true \}\)/.test(pl) && /e\.key === "Escape"/.test(pl) && /\[data-deal="\$\{CSS\.escape\(back\)\}"\]/.test(pl) && /<SidePanel key=/.test(pl));
    const dd = src("app/post/pipeline/DealDrawer.tsx");
    check("K2: Add the value puts focus in the value field; Save and Cancel put it back on the link", /autoFocus value=\{val\}/.test(dd) && /linkRef\.current\?\.focus/.test(dd) && /onClick=\{close\}/.test(dd));
    const L = (h: string) => { const c = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4)); return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]; };
    const ratio = (a: string, b: string) => { const [x, y] = [L(a), L(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
    const wf = src("app/post/ui3/work/workflows/workflows.css");
    const tiles = [...wf.matchAll(/\.wf3-mn \{ background: #([0-9a-f]{6}); \}/g)].map((m) => m[1]);
    check("X1: the four-stage numerals keep white text at 4.5:1 or more (gold and terracotta darkened within the palette)", tiles.length >= 6 && tiles.every((h) => ratio("ffffff", h) >= 4.5), tiles.map((h) => [h, ratio("ffffff", h).toFixed(2)]));
    const ui3css = src("app/post/ui3/ui3.css");
    const faint = Number(/--m-nav-faint: rgba\(246, 242, 232, ([.\d]+)\)/.exec(ui3css)?.[1]);
    const blend = (a: number, bg: string) => [246, 242, 232].map((f, i) => Math.round(f * a + parseInt(bg.slice(i * 2, i * 2 + 2), 16) * (1 - a))).map((v) => v.toString(16).padStart(2, "0")).join("");
    check("X1: the sidebar's section headings and counts reach 4.5:1 on the nav (and its hover)", ratio(blend(faint, "0f3a2f"), "0f3a2f") >= 4.5 && ratio(blend(faint, "164a3c"), "164a3c") >= 4.5, faint);
    check("X1: the logo link has an accessible name, in the sidebar and the phone bar", (src("app/post/ui3/Shell.tsx").match(/className="m-brand"\s+aria-label="Merlin, home"/g) ?? []).length === 2);
    check("X1: the skip link reaches the new design's page (Target Companies included)", /page === "table" && !RecordPage && !ui3Page \? "#tp-results" : "#tp-page"/.test(src("app/post/TradingPost.tsx")));
  }

  console.log("\nCopy");
  const files = [...walk(path.join(ROOT, "app/post/ui3/work")).filter((f) => /\.tsx?$/.test(f)), path.join(ROOT, "lib/workflows/simple.ts")];
  const AI = /\b(insights?|leverag\w*|seamless\w*|empower\w*|actionable|supercharge\w*|synerg\w*|unlock (your|new|more|the power))\b/i;
  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const rel = path.relative(ROOT, f);
    const words = wordsOf(src);
    check(`${rel}: no em or en dashes`, !/[—–]/.test(src));
    check(`${rel}: no AI words`, !words.some((w) => AI.test(w)), words.filter((w) => AI.test(w)));
    check(`${rel}: no percentages in what it says`, !words.some((w) => /\d\s*%|\bpercent\b/i.test(w)), words.filter((w) => /\d\s*%|\bpercent\b/i.test(w)));
    check(`${rel}: never names LinkedIn`, !words.some((w) => /linkedin/i.test(w)));
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
