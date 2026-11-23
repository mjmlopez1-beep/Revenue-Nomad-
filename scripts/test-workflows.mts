/**
 * Checks of Workflows (Stage 7b, Beta, RN_WORKFLOWS): a run's estimate equals what it spends; a
 * workflow spends on its own by default; the warning is told once; at the cap it stops and asks,
 * yes runs the waiting steps and no doesn't; Merlin's daily caps hold; every ledger line carries the
 * workflow's name; a note is a draft only (nothing sent to anyone but the member); a run never names
 * a locked company or a Californian; the flag off runs nothing; the plan gates; purge and the export.
 * In process, on a made-up seed in a temporary data dir, with fetch replaced: nothing leaves the machine.
 *
 *   npx tsx scripts/test-workflows.mts      exits 1 on any failure
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-workflows-"));
const MIN = 60_000;
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@avery.example", title: "Fractional VP Sales", token: "tok-jordan-0001" },
    { id: "mem_riley", name: "Riley Moss", email: "riley@moss.example", title: "Fractional CMO", token: "tok-riley-0001" },
    { id: "mem_free", name: "Frankie Free", email: "frankie@free.example", title: "Fractional CFO", token: "tok-free-0001" },
    { id: "mem_casey", name: "Casey Close", email: "casey@close.example", title: "Fractional COO", token: "tok-casey-0001" },
    { id: "mem_busy", name: "Bailey Busy", email: "bailey@busy.example", title: "Fractional VP Sales", token: "tok-busy-0001" },
  ],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
    { id: "c_lark", fields: { name: "Larkspur Learning", website: "larkspur.example", industry: "E-Learning Providers", employees: "51-200", hq: "Boston, MA" } },
  ],
  engagements: [
    { id: "e_north_sales", companyId: "c_north", fields: { source: "Published engagement", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active" } },
  ],
  // Who decides at each company (made up). At Cedar and Pine, Halcyon and Larkspur their names are locked for the members.
  contacts: [
    { id: "p_cedar_ceo", companyId: "c_cedar", fields: { name: "Morgan Hale", title: "CEO", relationship: "Decision maker" } },
    { id: "p_halcyon_coo", companyId: "c_halcyon", fields: { name: "Quinn Rivers", title: "COO", relationship: "Decision maker" } },
    { id: "p_lark_cfo", companyId: "c_lark", fields: { name: "Avery Stone", title: "CFO", relationship: "Decision maker" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const T1 = iso(t0 - 10 * MIN);
const seen = iso(t0 - 2 * DAY);
const future = iso(t0 + 20 * DAY);
const view = (id: string) => ({ id, name: "Every company", createdAt: seen, place: "v=all&t=companies", alert: { on: false, triggers: ["role"], every: "instant", email: false, slack: false, bell: false } });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Jordan has opened Northwind. Cedar and Pine, Halcyon and Larkspur stay locked for everyone.
    unlocks: { "c_north.identity": ["mem_jordan"] },
    seen: { mem_jordan: seen, mem_riley: seen, mem_free: seen, mem_casey: seen, mem_busy: seen },
    profiles: { mem_jordan: { function: "Sales", onboarded: true }, mem_riley: { function: "Marketing", onboarded: true }, mem_free: { function: "Finance", onboarded: true }, mem_casey: { function: "Operations", onboarded: true }, mem_busy: { function: "Sales", onboarded: true } },
    follows: {},
    connector: { clients: [], grants: [], alerts: { mem_jordan: [view("al_jordan01")], mem_free: [view("al_free0001")], mem_casey: [view("al_casey001")], mem_busy: [view("al_busy0001")] } },
    // Plans: Jordan and Bailey on Pro, Casey on Close, Frankie on Free (no record).
    billing: {
      members: { mem_jordan: { tier: "pro", proUntil: future }, mem_busy: { tier: "pro", proUntil: future }, mem_casey: { tier: "close", proUntil: future } },
      events: [], payments: [], ended: [],
    },
    // New leaders on two websites: Dana Reyes at Cedar and Pine (locked), Sam Ortiz at Northwind (open), and Sam is in California.
    leaders: {
      c_cedar: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Sales: { level: "VP", kind: "full-time", how: "team page", url: "https://cedarpine.example/team", seenAt: T1, name: "Dana Reyes", title: "VP Sales" } } },
      c_north: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Marketing: { level: "VP", kind: "full-time", how: "team page", url: "https://northwind.example/team", seenAt: T1, name: "Sam Ortiz", title: "VP Marketing", california: true } } },
    },
    leaderArrivals: [
      { companyId: "c_cedar", fn: "Sales", kind: "full-time", level: "VP", at: T1 },
      { companyId: "c_north", fn: "Marketing", kind: "full-time", level: "VP", at: T1 },
    ],
    // Funding filings, as lib/funding keeps them: Northwind (open for Jordan), Cedar and Pine (locked).
    funding: {
      lastRunAt: T1, lastRunDay: T1.slice(0, 10), days: {}, last: null, totals: { filings: 2, read: 2, matched: 2, unmatched: {} },
      events: [
        { companyId: "c_north", at: T1, filed: T1.slice(0, 10), firstSale: null, band: "$1M–$5M", about: "about $2.5M", round: "equity", source: "SEC filing", accession: "0000000000-26-000101" },
        { companyId: "c_cedar", at: T1, filed: T1.slice(0, 10), firstSale: null, band: "$5M–$20M", about: "about $6M", round: "SAFE", source: "SEC filing", accession: "0000000000-26-000102" },
      ],
    },
    // Jordan's own sources: Dana was at Halcyon Freight (LinkedIn file), Sam at Larkspur Learning (contacts CSV).
    paths: {
      mem_jordan: {
        linkedin: { at: seen, skipped: 0, rows: [{ f: "Dana", l: "Reyes", c: "Halcyon Freight" }] },
        csv: { at: seen, skipped: 0, rows: [{ n: "Sam Ortiz", c: "Larkspur Learning" }] },
      },
    },
    alertWatch: { at: iso(t0 - 20 * MIN), members: {} },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FUNDING: "1",
  RN_WORKFLOWS: "1",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_madeup_not_a_key",
  STRIPE_WEBHOOK_SECRET: "whsec_madeup",
  STRIPE_PRICE_MONTH: "price_month_madeup",
  STRIPE_PRICE_YEAR: "price_year_madeup",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <alerts@merlin.example>",
});
for (const k of ["RN_FREE_COMPANY", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RN_AI_DRAFTS"]) delete process.env[k];

type Sent = { url: string; body: Record<string, unknown> };
const outbox: Sent[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(String(init?.body ?? "{}"));
  } catch {
    body = {};
  }
  outbox.push({ url: String(input), body });
  return new Response(JSON.stringify({ id: "x" }), { status: 200, headers: { "content-type": "application/json" } });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 900)}`}`);
};

async function main() {
  const t = await import("../lib/table");
  const W = await import("../lib/workflows");
  const WT = await import("../lib/workflows/types");
  const R = await import("../lib/billing/rules");
  const ev = await import("../lib/notify/events");
  const n = await import("../lib/notify");
  const T = t.tableInternals;
  const pub = T.pubId;
  const settle = async () => {
    for (let i = 0; i < 6; i++) {
      await n.settled();
      await new Promise((r) => setTimeout(r, 5));
    }
  };
  const act = (tok: string, a: Record<string, unknown>) => t.perform(tok, a as never);
  const refused = async (p: Promise<unknown>) => {
    try {
      await p;
      return "";
    } catch (e) {
      return e instanceof Error ? e.message : String(e);
    }
  };
  const J = "tok-jordan-0001";
  const C = "tok-casey-0001";
  const F = "tok-free-0001";
  const B = "tok-busy-0001";

  /* ---------- the pure parts ---------- */
  console.log("\nThe words and the rules");
  const say = WT.sayFlow({ trigger: "funding", scope: { kind: "list", list: "x" }, steps: [{ key: "pipe" }, { key: "open" }] });
  check("a workflow reads as one sentence, its steps in run order", say === "When a company on my list raises funding, open the company and add it to my pipeline.", say);
  check("the recipes include the owner's three", ["funding-open-pipe", "known-way-draft", "radar-role-dm"].every((k) => WT.RECIPES.some((r) => r.key === k)));
  check("a recipe's steps all fit its trigger", WT.RECIPES.every((r) => r.steps.every((s) => WT.STEPS[s.key].fits.includes(r.trigger))));
  const prices = { company: 0, companyFull: 2, ballFree: true, opensLeft: 15, person: 1 };
  check("the builder's ceiling: who decides at a locked company is the company and the person", WT.runCeiling([{ key: "dm" }], { kind: "list", list: "x" }, prices).total === 3);
  check("in Crystal Ball the company opens free on the plan, so who decides is 1 credit", WT.runCeiling([{ key: "dm" }, { key: "remind", days: 2 }], { kind: "radar" }, prices).total === 1);
  check("free steps cost nothing", WT.runCeiling([{ key: "pipe" }, { key: "way" }, { key: "tell" }], { kind: "list", list: "x" }, prices).total === 0);
  check("the warning must sit under the cap", /below/.test(await refused(Promise.resolve().then(() => WT.cleanFlow({ trigger: "seat", scope: { kind: "list", list: "x" }, steps: [{ key: "dm" }], cap: 5, warn: 5 })))));
  check("a step that doesn't fit the trigger is dropped", WT.cleanFlow({ trigger: "seat", scope: { kind: "list", list: "x" }, steps: [{ key: "evidence" }, { key: "tell" }] }).steps.length === 1);
  check("the plan gates are one set: Free 1 and free steps, Pro paid steps, Close proposals and Evidence Bank", R.WORKFLOW_PLAN.free.flows === 1 && !R.WORKFLOW_PLAN.free.paid && R.WORKFLOW_PLAN.pro.paid && !R.WORKFLOW_PLAN.pro.evidence && R.WORKFLOW_PLAN.close.evidence && R.WORKFLOW_PLAN.close.proposals);

  /* ---------- the flag off ---------- */
  console.log("\nRN_WORKFLOWS off");
  delete process.env.RN_WORKFLOWS;
  check("off: the tab reads Coming soon", JSON.stringify(await W.workflowsFor(J)) === JSON.stringify({ on: false }));
  check("off: nothing saves", /switched on/.test(await refused(act(J, { type: "workflow.save", trigger: "seat", scope: { kind: "list", list: "al_jordan01" }, steps: [{ key: "tell" }] }))));
  check("off: nothing runs", (await W.runEvents([{ memberId: "mem_jordan", key: "x", trigger: "seat", at: iso(t0), companyId: "c_north", line: "x", href: "/", lists: ["al_jordan01"] }])) === 0);
  process.env.RN_WORKFLOWS = "1";

  /* ---------- plan gates ---------- */
  console.log("\nPlan gates");
  check("Free: a paid step is part of Pro", /part of pro/i.test(await refused(act(F, { type: "workflow.save", trigger: "funding", scope: { kind: "list", list: "al_free0001" }, steps: [{ key: "open" }] }))));
  const f1 = (await act(F, { type: "workflow.save", trigger: "seat", scope: { kind: "list", list: "al_free0001" }, steps: [{ key: "tell" }, { key: "remind", days: 3 }] })) as { workflows?: { on: boolean; flows: unknown[] } };
  check("Free: one workflow of free steps saves, on", f1.workflows?.on === true && f1.workflows.flows.length === 1);
  check("Free: a second workflow is refused", /one workflow/.test(await refused(act(F, { type: "workflow.save", trigger: "leader", scope: { kind: "list", list: "al_free0001" }, steps: [{ key: "tell" }] }))));
  check("Pro: a proposal trigger is part of Close", /part of Close/.test(await refused(act(J, { type: "workflow.save", trigger: "signed", scope: { kind: "proposals" }, steps: [{ key: "remind", days: 7 }] }))));
  check("a list that isn't theirs is refused", /isn't one of yours/.test(await refused(act(J, { type: "workflow.save", trigger: "seat", scope: { kind: "list", list: "al_free0001" }, steps: [{ key: "tell" }] }))));
  const cv = (await act(C, { type: "workflow.save", trigger: "signed", scope: { kind: "proposals" }, steps: [{ key: "evidence" }, { key: "remind", days: 7 }] })) as { workflows?: { flows: { id: string }[] } };
  check("Close: a client signs, with an Evidence Bank draft, saves", (cv.workflows?.flows.length ?? 0) === 1);

  /* ---------- the watch pass sets off Jordan's workflows ---------- */
  console.log("\nFrom the watch pass");
  const w1 = (await act(J, { type: "workflow.save", trigger: "funding", scope: { kind: "list", list: "al_jordan01" }, steps: [{ key: "dm" }, { key: "pipe" }, { key: "tell" }] })) as { workflows?: { flows: { id: string; name: string; ceiling: number }[]; prices: { person: number } } };
  const wf1 = w1.workflows!.flows[0];
  check("the builder's estimate before it is on: up to the company and who decides", wf1.ceiling === 3, wf1);
  await act(J, { type: "workflow.save", trigger: "known", scope: { kind: "contacts" }, steps: [{ key: "way" }, { key: "draft" }, { key: "tell" }] });
  const bal0 = T.balance(await t.loadState(), "mem_jordan");
  const convs0 = ((await t.loadState()).conversations ?? []).length;
  outbox.length = 0;
  await ev.afterWatch(t0);
  await settle();
  const s1 = await t.loadState();
  const jw = s1.workflows!.mem_jordan;
  const runsOf = (id: string) => jw.runs.filter((r) => r.wf === id);
  const fund = runsOf(wf1.id);
  check("a run for each funding filing on the list", fund.length === 2, fund.map((r) => r.line));
  const cedarRun = fund.find((r) => r.company === pub("c_cedar"));
  const northRun = fund.find((r) => r.company === pub("c_north"));
  check("default: it spent on its own, no yes asked", !!cedarRun && !cedarRun.ask && cedarRun.spent > 0, cedarRun);
  check("the run's estimate equals what it spent", !!cedarRun && cedarRun.estimate === cedarRun.spent && fund.every((r) => r.estimate === r.spent), fund.map((r) => [r.estimate, r.spent]));
  const bal1 = T.balance(s1, "mem_jordan");
  const wfLines = s1.ledger.filter((l) => l.memberId === "mem_jordan" && l.reason === "unlock");
  check("the balance moved by exactly what the runs say they spent", bal0 - bal1 === jw.runs.reduce((a, r) => a + r.spent, 0), [bal0, bal1]);
  check("every ledger line it wrote carries the workflow's name", wfLines.length > 0 && wfLines.every((l) => l.wf === wf1.name), wfLines);
  const mv = t.buildView ? await t.buildView(J, { asMember: true }) : null;
  check("the credit history says which workflow spent it", !!mv?.ledger.some((l) => l.wf === wf1.name));
  const { ledgerLine } = await import("../app/post/ledger");
  const rowWf = mv?.ledger.find((l) => l.wf);
  check("its line reads 'by your workflow'", !!rowWf && ledgerLine(rowWf, 25).text.includes(`by your workflow ${wf1.name}`), rowWf);
  check("the run at the open company was free: who decides there isn't on file", !!northRun && northRun.spent === 0 && northRun.steps.find((x) => x.key === "dm")?.status === "skipped");
  check("add to my pipeline ran once the company was open", cedarRun?.steps.find((x) => x.key === "pipe")?.status === "done" && !!s1.pipeline?.mem_jordan?.entries.some((e) => e.companyId === "c_cedar"), cedarRun?.steps);
  const all = JSON.stringify({ runs: jw.runs, inbox: s1.inbox?.mem_jordan, mail: outbox });
  check("a run never names a locked company: the line describes it", !!cedarRun && !/Cedar and Pine/.test(cedarRun.line) && /^A locked [A-Za-z ]+ company with 11.50 employees raised/.test(cedarRun.line), cedarRun?.line);
  check("…and neither does the bell, the email or Slack", !/Cedar and Pine|Halcyon Freight|Larkspur Learning/.test(JSON.stringify({ inbox: s1.inbox?.mem_jordan, mail: outbox })));
  check("no person's name in any line: who decides is never named", !/Morgan Hale|Quinn Rivers|Avery Stone/.test(all));
  const known = jw.runs.filter((r) => r.line.startsWith("Someone you know") || /someone you know/.test(r.line));
  check("someone you know: a run for each move", known.length === 2, jw.runs.map((r) => r.line));
  check("a Californian is never named", !/Sam Ortiz/.test(all) && known.some((r) => /^Someone you know is a new Marketing leader at Northwind Clinics/.test(r.line)), known.map((r) => r.line));
  check("at a locked company nobody is named", !/Dana Reyes/.test(all) && known.some((r) => /^Someone you know started at a locked/.test(r.line)), known.map((r) => r.line));
  const drafts = jw.drafts;
  check("a note is drafted, a draft in Messages", drafts.length >= 1 && drafts.every((d) => !!d.subject && !!d.body), drafts);
  check("the note greets nobody by name and names only a company the member can see", drafts.every((d) => !/Sam|Dana|Morgan/.test(d.body) && !!d.companyName));
  check("nothing was sent to a client or a contact: no conversation, and email only to the member", ((s1.conversations ?? []).length === convs0) && outbox.filter((x) => /resend/.test(x.url)).every((x) => JSON.stringify(x.body.to) === JSON.stringify(["jordan@avery.example"])), outbox.map((x) => x.body.to));
  check("tell me: a line in the bell for each run", (s1.inbox?.mem_jordan ?? []).filter((x) => x.kind === "workflow").length >= 4);
  // The same pass again later finds nothing new: each event runs a workflow once.
  await ev.afterWatch(t0 + 16 * MIN);
  await settle();
  check("an event runs a workflow once", (await t.loadState()).workflows!.mem_jordan.runs.length === jw.runs.length);

  /* ---------- the cap, the warning and the yes ---------- */
  console.log("\nCap and warning");
  const sv = (await act(C, { type: "workflow.save", trigger: "seat", scope: { kind: "list", list: "al_casey001" }, steps: [{ key: "dm" }, { key: "tell" }], cap: 1, warn: 0 })) as { workflows?: { flows: { id: string; name: string; trigger: string }[] } };
  const capWf = sv.workflows!.flows.find((f) => f.trigger === "seat")!;
  const evOf = (key: string, companyId: string) => ({ memberId: "mem_casey", key, trigger: "seat" as const, at: iso(Date.now()), companyId, line: `A fractional seat ended at ${companyId}`, href: `/?c=${pub(companyId)}`, lists: ["al_casey001"] });
  const cbal0 = T.balance(await t.loadState(), "mem_casey");
  await W.runEvents([evOf("seat:a", "c_cedar")]);
  await settle();
  let cs = await t.loadState();
  let cr = cs.workflows!.mem_casey.runs.filter((r) => r.wf === capWf.id);
  check("under the cap it spends: who decides at Cedar and Pine, 1 credit (the company opens free on Close)", cr.length === 1 && cr[0].spent === 1 && cr[0].estimate === 1 && !cr[0].ask, cr);
  const warns = () => (cs.inbox?.mem_casey ?? []).filter((x) => x.id.startsWith("wf-warn:"));
  check("passing the warning tells the member, in the bell", warns().length === 1, cs.inbox?.mem_casey);
  await W.runEvents([evOf("seat:b", "c_halcyon"), evOf("seat:c", "c_lark")]);
  await settle();
  cs = await t.loadState();
  cr = cs.workflows!.mem_casey.runs.filter((r) => r.wf === capWf.id);
  const waiting = cr.filter((r) => r.ask && !r.ask.answer);
  check("at the cap it stops spending and asks", waiting.length === 2 && waiting.every((r) => r.spent === 0 && r.steps.find((x) => x.key === "dm")?.status === "waiting"), cr.map((r) => [r.spent, r.ask, r.steps]));
  check("nothing more was spent", cbal0 - T.balance(cs, "mem_casey") === 1);
  check("the warning is told once", warns().length === 1);
  const asks = (cs.inbox?.mem_casey ?? []).filter((x) => x.ask && !x.ask.answer);
  check("the bell asks: say yes, with the credits", asks.length === 2 && asks.every((x) => x.ask!.credits === 1 && /waits for your yes · 1 credit$/.test(x.line)), asks);
  check("the ask names no locked company", asks.every((x) => !/Halcyon Freight|Larkspur Learning/.test(`${x.line} ${x.sub}`)));
  const [yesRun, noRun] = waiting;
  const yes = (await act(C, { type: "workflow.approve", run: yesRun.id, yes: true })) as { message: string };
  await settle();
  cs = await t.loadState();
  const y = cs.workflows!.mem_casey.runs.find((r) => r.id === yesRun.id)!;
  check("yes runs the waiting steps, and spends what it asked", y.ask?.answer === "yes" && y.spent === 1 && y.steps.find((x) => x.key === "dm")?.status === "done" && cbal0 - T.balance(cs, "mem_casey") === 2, [yes.message, y]);
  check("the yes line in the bell is settled", (cs.inbox?.mem_casey ?? []).find((x) => x.ask?.run === yesRun.id)?.ask?.answer === "yes");
  await act(C, { type: "workflow.approve", run: noRun.id, yes: false });
  cs = await t.loadState();
  const no = cs.workflows!.mem_casey.runs.find((r) => r.id === noRun.id)!;
  check("no doesn't run them, and spends nothing", no.ask?.answer === "no" && no.spent === 0 && no.steps.find((x) => x.key === "dm")?.status === "skipped" && cbal0 - T.balance(cs, "mem_casey") === 2, no);
  check("a second answer changes nothing", /said no/.test(((await act(C, { type: "workflow.approve", run: noRun.id, yes: true })) as { message: string }).message) && cbal0 - T.balance(await t.loadState(), "mem_casey") === 2);
  const lines = cs.ledger.filter((l) => l.memberId === "mem_casey" && l.reason === "unlock");
  check("the yes's spend carries the workflow's name too", lines.length >= 2 && lines.every((l) => l.wf === capWf.name), lines);
  const v = (await W.workflowsFor(C)) as import("../lib/workflows/types").WorkflowsView;
  check("credits spent by workflows in 30 days, from the credit history", v.on && v.spent30 === 2, v.spent30);

  /* ---------- Merlin's daily caps ---------- */
  console.log("\nDaily caps");
  await T.mutate((d) => {
    for (let i = 0; i < 100; i++) d.ledger.push({ memberId: "mem_busy", delta: -1, reason: "unlock", ref: `x${i}.email`, at: iso(Date.now() - 60 * MIN) });
  });
  await act(B, { type: "workflow.save", trigger: "seat", scope: { kind: "list", list: "al_busy0001" }, steps: [{ key: "dm" }, { key: "tell" }] });
  const bb0 = T.balance(await t.loadState(), "mem_busy");
  await W.runEvents([{ ...evOf("seat:busy", "c_halcyon"), memberId: "mem_busy", lists: ["al_busy0001"] }]);
  await settle();
  const bs = await t.loadState();
  const br = bs.workflows!.mem_busy.runs[0];
  check("past today's unlock limit the paid step is skipped with Merlin's reason", !!br && br.spent === 0 && br.estimate === 0 && br.steps.find((x) => x.key === "dm")?.status === "skipped" && /limit/.test(br.steps.find((x) => x.key === "dm")!.note), br);
  check("…and nothing is spent", T.balance(bs, "mem_busy") === bb0);

  /* ---------- reminders ---------- */
  console.log("\nReminders");
  await W.runEvents([{ memberId: "mem_free", key: "seat:free1", trigger: "seat", at: iso(Date.now()), companyId: "c_halcyon", line: "A fractional seat ended at a locked Truck Transportation company with 201-500 employees", href: `/?c=${pub("c_halcyon")}`, lists: ["al_free0001"] }]);
  await settle();
  let fs = await t.loadState();
  check("remind me: a reminder waits", fs.workflows!.mem_free.reminders.length === 1);
  await W.workflowTick(Date.now() + 4 * DAY);
  fs = await t.loadState();
  check("on the day it comes to the bell", fs.workflows!.mem_free.reminders.length === 0 && (fs.inbox?.mem_free ?? []).some((x) => x.id.startsWith("wf-rem:") && /^Follow up:/.test(x.line)));

  /* ---------- a proposal signed (Close) ---------- */
  console.log("\nProposals");
  await W.afterProposal("mem_casey", { kind: "signed", item: "pr_madeup01", title: "Operations for Q1", what: "proposal", signed: { option: null, fee: null, won: false, copyUrl: null } });
  await settle();
  cs = await t.loadState();
  const sr = cs.workflows!.mem_casey.runs.find((r) => r.line.includes("is signed"));
  check("a client signs: an Evidence Bank draft is started", !!sr && sr.steps.find((x) => x.key === "evidence")?.status === "done" && (cs.evidence?.mem_casey ?? []).length === 1, sr);
  await W.afterProposal("mem_jordan", { kind: "signed", item: "pr_madeup02", title: "Sales plan", what: "proposal", signed: { option: null, fee: null, won: false, copyUrl: null } });
  await settle();
  check("a declined or held-back trigger runs nothing (Pro has no proposal workflow)", !(await t.loadState()).workflows!.mem_jordan.runs.some((r) => r.line.includes("Sales plan")));

  /* ---------- on and off, the email's link ---------- */
  console.log("\nOn and off");
  await act(J, { type: "workflow.on", id: wf1.id, on: false });
  check("a workflow turned off runs nothing", (await W.runEvents([{ memberId: "mem_jordan", key: "fund:new", trigger: "funding", at: iso(Date.now()), companyId: "c_halcyon", line: "x", href: "/", lists: ["al_jordan01"] }])) === 0);
  await act(J, { type: "workflow.on", id: wf1.id, on: true });
  const off = await ev.alertOffByLink(pub("mem_jordan"), `wf:${wf1.id}`, ev.alertOffSig("mem_jordan", `wf:${wf1.id}`));
  check("the email's link turns that workflow off, and names it", JSON.stringify(off) === JSON.stringify([wf1.name]) && (await t.loadState()).workflows!.mem_jordan.flows.find((f) => f.id === wf1.id)?.on === false);

  /* ---------- export and purge ---------- */
  console.log("\nExport and purge");
  const ex = (await t.exportState()) as { workflows?: Record<string, { flows: unknown[]; runs: unknown[]; drafts: unknown[]; reminders: unknown[] }> };
  check("the export keeps the workflows, leaves their runs, drafts and reminders out", !!ex.workflows?.mem_jordan && ex.workflows.mem_jordan.flows.length === 2 && Object.values(ex.workflows).every((w) => !w.runs.length && !w.drafts.length && !w.reminders.length));
  const dv = (await W.draftsFor(J)) as { drafts: unknown[] };
  check("Messages reads the drafts, the member's alone", dv.drafts.length >= 1 && ((await W.draftsFor(C)) as { drafts: unknown[] }).drafts.length === 0);
  await T.mutate((d, sd) => {
    T.purgeMember(d, sd, "mem_jordan", iso(Date.now()));
  });
  check("purge deletes every workflow, run, reminder and draft of theirs", !(await t.loadState()).workflows?.mem_jordan);
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
