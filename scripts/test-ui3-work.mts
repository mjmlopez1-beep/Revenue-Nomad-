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
  members: [{ id: "mem_c", name: "Casey Close", email: "casey@close.example", title: "Fractional COO", token: "tok-c-000000001" }],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
  ],
  engagements: [{ id: "e_north_ops", companyId: "c_north", fields: { source: "Published engagement", role: "Fractional COO", function: "Operations", type: "Fractional", start: "2025-01", status: "Active" } }],
  contacts: [
    { id: "p_cedar_ceo", companyId: "c_cedar", fields: { name: "Morgan Hale", title: "CEO", relationship: "Decision maker" } },
    { id: "p_halcyon_coo", companyId: "c_halcyon", fields: { name: "Quinn Rivers", title: "COO", relationship: "Decision maker" } },
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
    seen: { mem_c: seen },
    profiles: { mem_c: { function: "Operations", onboarded: true } },
    follows: {},
    connector: { clients: [], grants: [], alerts: { mem_c: [{ id: "al_casey001", name: "Every company", createdAt: seen, place: "v=all&t=companies", alert: { on: false, triggers: ["role"], every: "instant", email: false, slack: false, bell: false } }] } },
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
  check("Contracts: sending is Pro and Close, said above the list", /!v\.canSend &&/.test(ctPage));

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

  /* ---------- the pipeline's money ---------- */
  console.log("\nPipeline money");
  const D = (stage: string, monthly: number, won?: boolean) => ({ stage, monthly, won: won ? ({ pricing: "monthly", rate: monthly } as never) : undefined }) as never;
  const m = money.moneyOf([D("reach", 12000), D("sent", 9500), D("replied", 0), D("proposal", 16000), D("proposal", 10500), D("won", 12000, true), D("won", 9000), D("lost", 20000), D("notnow", 5000)]);
  check("open pipeline: every open stage's typed value, a month", m.open === 48000 && m.openN === 5, m);
  check("proposals out: the Proposal stage only, and a part of the open pipeline", m.props === 26500 && m.propsN === 2 && m.props <= m.open, m);
  check("won: the Won deals' terms; a Won deal without terms counts nothing", m.won === 12000 && m.wonN === 2, m);
  check("lost and not now count nowhere", m.open + m.won === 60000);
  check("a deal with no value is counted as such, never guessed", m.openNoValue === 1);
  check("the money words: $96.5k, $26.5k, $12k, $900", money.kMoney(96500) === "$96.5k" && money.kMoney(26500) === "$26.5k" && money.kMoney(12000) === "$12k" && money.kMoney(900) === "$900" && money.kMoney(120000) === "$120k");

  /* ---------- copy ---------- */
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
