/**
 * Checks of the table workbench (app/post/workbench, lib/unlockQuote.ts, the quote on POST
 * /api/table, pipeline.add): one quote, one confirm, one button, so credits are never spent by a
 * stray click.
 *
 *   npx tsx scripts/test-workbench.mts      exits 1 on any failure
 *
 * No server and no network: lib/table.ts runs in process on a made-up seed in a temporary data
 * folder, removed at the end. Every person and company is made up (member Jordan Avery; companies
 * Northwind Clinics, Cedar and Pine, Halcyon Freight, Larkspur Learning and numbered example ones).
 *
 * Covered:
 *   - fill-rate maths: a lock counts as on file, the Company column counts what is open, the
 *     percent is rounded, no rows is 0 percent; the registry's defaults and its count words;
 *   - the quote equals the server's own dry run (perform with dryRun), and what the run then spends;
 *   - no spend without a confirm: a quote (in process and through the route) writes nothing and
 *     leaves the balance, runUnlock without its yes calls nothing, and a quote flag of any truthy
 *     kind is a quote;
 *   - batches of 60: a run of 130 facts goes as 60, 60 and 10, each batch no bigger, and spends
 *     what was quoted;
 *   - caps named: the day's unlock limit and the balance each stop part of a run, the quote says how
 *     many fit and gives the server's words, and a run whose later batch would pass a limit reached
 *     on the way stops before it, spending nothing more;
 *   - Tools: the cost words, the left-out items, and each Enrich run's row needs (company first,
 *     name before email, nothing to buy is skipped);
 *   - pipeline.add: open companies wait at To reach out, a locked one is skipped and said, adding
 *     twice keeps one deal, another member sees nothing of it.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 700)}`);
};

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-workbench-"));

/* ---------- the made-up seed ---------- */
const NAMED = ["Northwind Clinics", "Cedar and Pine", "Halcyon Freight", "Larkspur Learning"];
const N = 140;
const cid = (k: number) => `c_wb${String(k).padStart(3, "0")}`;
const nameOf = (k: number) => NAMED[k] ?? `Example Works ${k}`;
const companies = Array.from({ length: N }, (_, k) => ({
  id: cid(k),
  fields: {
    name: nameOf(k),
    website: `${nameOf(k).toLowerCase().replace(/[^a-z]+/g, "")}.example`,
    industry: k % 3 ? "SaaS" : "Health Care",
    employees: "51–200",
    revenue: "$5M–$20M",
    hq: "Austin, TX",
    ...(k % 2 ? {} : { motion: "Inside sales" }),
  },
}));
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, verified: false, fields: { type: "Fractional", status: "Ended", start: "2025-01", end: "2025-09", ...fields } });
const engagements = [
  // Northwind: a seat with its holder on file, and its rate.
  seat("e_wb_north", cid(0), { source: "Member success story", function: "Sales", role: "Fractional VP Sales", operator: "Rita Okafor", rate: "$9k/mo" }),
  // Cedar and Pine: a seat with nobody named.
  seat("e_wb_cedar", cid(1), { source: "Seat scan", function: "Finance", role: "Fractional CFO", status: "Active", end: "Ongoing" }),
  // Halcyon: a seat with a holder, no rate.
  seat("e_wb_halc", cid(2), { source: "Member success story", function: "RevOps", role: "Fractional RevOps lead", operator: "Priya Natarajan" }),
];
const contacts = [
  { id: "p_wb_north", companyId: cid(0), fields: { name: "Sam Iverson", title: "CEO", relationship: "Decision maker", email: "sam@northwindclinics.example" } },
  { id: "p_wb_halc", companyId: cid(2), fields: { name: "Dana Whitfield", title: "COO", relationship: "Decision maker", email: "dana@halcyonfreight.example" } },
];
const member = (id: string, name: string) => ({ id, name, email: `${id.slice(2)}@jordanavery.example`, title: "Fractional VP Sales", token: `tok-${id.slice(2)}-wb` });
const members = [member("m_jordan", "Jordan Avery"), member("m_casey", "Casey Capped"), member("m_wynn", "Wynn Wallet"), member("m_lane", "Lane Later"), member("m_otto", "Otto Other"), member("m_pia", "Pia Pipeline")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: ago(30), members, companies, engagements, contacts }));
const grant = (memberId: string, delta: number) => ({ memberId, delta, reason: "adjust", ref: "test", at: ago(2) });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    // Jordan, Casey and Lane have credits to spare; Wynn keeps the 25 starter credits.
    ledger: [grant("m_jordan", 400), grant("m_casey", 400), grant("m_lane", 400), grant("m_pia", 50)],
    values: {},
    unlocks: {},
    profiles: Object.fromEntries(members.map((m) => [m.id, { function: "Sales", onboarded: true, icp: { industries: [], employees: [], revenue: [], countries: [] } }])),
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  // Exact prices: no free company of the day (a test server only).
  RN_FREE_COMPANY: "off",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_BILLING", "RN_DIGEST", "RN_GOOGLE", "RN_ADMIN_EMAILS"]) delete process.env[k];

async function main() {
  const T = await import("../lib/table");
  const Q = await import("../lib/unlockQuote");
  const B = await import("../lib/unlockBatch");
  const C = await import("../app/post/workbench/columns");
  // Ask Merlin's column words as the workbench's columns: "Your way in" has none here, so it is left out.
  check("Ask's columns map to the workbench's, and wayIn is left out (no column backs it)", JSON.stringify(C.askColumns(["decisionMaker", "email", "rate", "holder", "wayIn", "email"])) === JSON.stringify(["decider", "email", "rate", "heldBy"]) && C.askColumns(["wayIn"]).length === 0);
  const TL = await import("../app/post/workbench/tools");
  const R = await import("../app/post/workbench/run");
  const M = await import("../app/post/model");
  const PA = await import("../lib/pipelineActions");
  const { NextRequest } = await import("next/server");
  const route = await import("../app/api/table/route");

  const ORIGIN = "https://post.example.com";
  const tok = (id: string) => `tok-${id.slice(2)}-wb`;
  const JOR = tok("m_jordan");
  const pub = (id: string) => T.tableInternals.pubId(id);
  const bal = async (memberId: string) => T.balance(await T.loadState(), memberId);
  /** What a spend would change in the state file: the credit history, who opened what, the values. */
  const stateFile = () => {
    const x = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
    return JSON.stringify({ ledger: x.ledger ?? [], unlocks: x.unlocks ?? {}, values: x.values ?? {} });
  };
  const ident = (k: number) => ({ entity: "company" as const, id: pub(cid(k)), field: "identity" });
  const free = (k: number) => ({ entity: "company" as const, id: pub(cid(k)), field: "industry" });
  const dryCost = async (token: string, items: unknown[]) => (await T.perform(token, { type: "unlockMany", items } as never, ORIGIN, { dryRun: true })).spent ?? 0;
  const routePost = async (token: string, body: unknown) => {
    const r = await route.POST(new NextRequest(`${ORIGIN}/api/table`, { method: "POST", headers: { cookie: `rn_table=${token}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.77" }, body: JSON.stringify(body) }), {} as never);
    return { status: r.status, json: (await r.json()) as Record<string, unknown> };
  };
  const realDeps = (token: string, sizes: number[]): import("../app/post/workbench/run").RunDeps => ({
    quote: async (items) => (await Q.quoteUnlock(token, items)) ?? { error: "signed out" },
    unlock: async (items) => {
      sizes.push(items.length);
      await T.perform(token, { type: "unlockMany", items } as never, ORIGIN);
      return true;
    },
  });

  /* ================= fill rate ================= */
  console.log("\nfill rate");
  const fake = (states: ("value" | "locked" | "empty")[]) => ({ rows: states.map((s, k) => ({ key: `r${k}`, s })) as unknown as import("../app/post/model").Row[], fill: (r: unknown) => (r as { s: "value" | "locked" | "empty" }).s });
  {
    const f = fake(["value", "locked", "empty", "empty"]);
    check("a lock counts as on file: 2 of 4 is 50%", JSON.stringify(C.fillRate({ fill: f.fill }, f.rows)) === JSON.stringify({ filled: 2, of: 4, pct: 50 }), C.fillRate({ fill: f.fill }, f.rows));
    check("…counting what is open only: 1 of 4 is 25%", C.fillRate({ fill: f.fill, counts: "value" }, f.rows).pct === 25);
    const g = fake(["value", "empty", "empty"]);
    check("the percent is rounded: 1 of 3 is 33%", C.fillRate({ fill: g.fill }, g.rows).pct === 33);
    const h = fake(["locked", "empty", "value"]);
    check("…2 of 3 is 67%", C.fillRate({ fill: h.fill }, h.rows).pct === 67);
    check("no rows: 0 of 0, 0%", JSON.stringify(C.fillRate({ fill: g.fill }, [])) === JSON.stringify({ filled: 0, of: 0, pct: 0 }));
    check("the words under a heading: \"50% on file\"", C.fillWords({ fill: f.fill, word: "on file" }, f.rows) === "50% on file");
  }
  // Over Jordan's own view: every company is locked for a new member, so Company reads 0% open, and the rest counts locks as on file.
  const view0 = await T.buildView(JOR);
  const infos0 = M.deriveAll(view0.companies);
  const rows0 = M.rowsFor("companies", infos0).filter((r) => [cid(0), cid(1), cid(2), cid(3)].map(pub).includes(r.i.c.id));
  const col = (id: string) => C.columnOf("companies", id)!;
  check("the view holds the four named companies", rows0.length === 4, rows0.length);
  check("Company: 0% open while every company is locked", C.fillWords(col("company"), rows0) === "0% open", C.fillWords(col("company"), rows0));
  check("Held by: a locked holder counts as named (Northwind and Halcyon: 2 of 4 is 50%)", C.fillWords(col("heldBy"), rows0) === "50% named", C.fillWords(col("heldBy"), rows0));
  check("Latest seat: 3 of 4 on file (75%)", C.fillRate(col("seat"), rows0).pct === 75);
  check("Decision maker: 2 of 4 on file, locked (50%)", C.fillRate(col("decider"), rows0).pct === 50);
  check("Rate paid: only Northwind's is on file (25%)", C.fillRate(col("rate"), rows0).pct === 25);
  check("Sales motion: the even rows have one (50%)", C.fillRate(col("motion"), rows0).pct === 50);
  check("Industry: every row (100%)", C.fillRate(col("industry"), rows0).pct === 100);
  check("the registry: Company is fixed and first, every list's default shows it", ["companies", "engagements", "people"].every((t) => C.visibleColumns(t as never, null)[0].id === "company"));
  check("…an unknown or another list's column id is left out", C.visibleColumns("companies", ["heldBy", "nope", "linkedin"]).map((c) => c.id).join(",") === "company,heldBy");
  check("…\"N of M columns\"", C.columnCount("companies", C.visibleColumns("companies", null).length) === `${C.defaultCols("companies").length} of ${C.COMPANY_COLUMNS.length} columns`, C.columnCount("companies", 8));

  /* ================= Tools ================= */
  console.log("\nTools");
  const ctxTrial = { me: { proOpens: { left: 15, of: 15 }, plan: { name: "trial", tier: "close" } as never, credits: 25 }, network: false, close: true };
  const ctxFree = { me: { plan: { name: "free", tier: "free" } as never, credits: 25 }, network: false, close: false };
  const it = (ctx: typeof ctxTrial | typeof ctxFree, id: string) => TL.toolItems("companies", ctx as never).find((x) => x.id === id);
  check("Company name and website: Free on trial while opens are left", it(ctxTrial, "en-company")?.cost === "Free on trial" && it(ctxTrial, "en-company")?.tone === "free");
  check("…2 / row on Free", it(ctxFree, "en-company")?.cost === "2 / row");
  check("Who held the seat is free, Decision maker, Work email and Rate paid 1 / row", it(ctxFree, "en-held")?.cost === "Free" && ["en-dm", "en-email", "en-rate"].every((id) => it(ctxFree, id)?.cost === "1 / row"));
  check("New executive and funding are Pro on Free and say where they come from", it(ctxFree, "sig-leader")?.cost === "Pro" && /company websites Merlin reads/.test(it(ctxFree, "sig-leader")!.sub) && /SEC/.test(it(ctxFree, "sig-funding")!.label));
  const words = JSON.stringify(TL.toolItems("companies", ctxTrial as never));
  check("left out: the research column, Import a CSV, Export, Send to Slack, any AI allowance", !/researches|Import a CSV|Export|Slack|AI allowance|download/i.test(words));
  const { readdirSync } = await import("node:fs");
  const wbDir = path.join(process.cwd(), "app/post/workbench");
  const shownWords = readdirSync(wbDir)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => readFileSync(path.join(wbDir, f), "utf8").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ""))
    .join("\n");
  check("no Export, CSV or download anywhere in the workbench's screens (the owner's decision)", !/>\s*Export|"Export|Export CSV|\bCSV\b|[Dd]ownload/.test(shownWords));
  const ev = it(ctxFree, "en-evidence");
  check("Closest evidence: shown with the Close pill off Close, never hidden", ev?.cost === "Close" && ev?.tone === "gate" && it(ctxTrial, "en-evidence")?.tone === "free");
  check("Sources: Your contacts only with Your network on", !TL.toolItems("companies", ctxFree as never).some((x) => x.id === "src-network") && TL.toolItems("companies", { ...ctxFree, network: true } as never).some((x) => x.id === "src-network"));
  check("the search box finds across tabs", TL.itemsFor("companies", ctxTrial as never, "you", "email").some((x) => x.id === "en-email"));
  const north = rows0.find((r) => r.i.c.id === pub(cid(0)))!;
  const cedar = rows0.find((r) => r.i.c.id === pub(cid(1)))!;
  check("row needs at a locked company: the company is the one purchase", JSON.stringify(C.rowNeed("company", north)) === JSON.stringify({ entity: "company", id: pub(cid(0)), field: "identity" }));
  check("…the decision maker, email and rate wait for the company", ["decider", "email", "rate"].every((c) => C.rowNeed(c, north) === "wait"));
  check("…nothing on file to buy is skipped, never charged", C.rowNeed("decider", cedar) === "skip" && C.rowNeed("rate", cedar) === "skip");

  /* ================= the quote equals the dry run ================= */
  console.log("\nthe quote");
  const items5 = [0, 1, 2, 3, 4].map(ident);
  // Let the view's own write (the visit) land first, so the file read next is the one the quote must leave alone.
  await T.loadState();
  await new Promise((r) => setTimeout(r, 300));
  const before = stateFile();
  const b0 = await bal("m_jordan");
  const q5 = (await Q.quoteUnlock(JOR, items5))!;
  await new Promise((r) => setTimeout(r, 300));
  check("5 companies: 10 credits, all fit, no stop", q5.cost === 10 && q5.fits === 5 && q5.stop === null && q5.asked === 5, q5);
  check("…the same as the server's own dry run", q5.cost === (await dryCost(JOR, items5)));
  check("…balance and after", q5.credits === b0 && q5.after === b0 - 10, q5);
  check("a quote writes nothing: the state file and the balance are as they were", stateFile() === before && (await bal("m_jordan")) === b0);
  const viaRoute = await routePost(JOR, { action: { type: "unlockMany", items: items5, quote: true } });
  check("through POST /api/table: 200 with the same quote", viaRoute.status === 200 && JSON.stringify(viaRoute.json.quote) === JSON.stringify(q5), viaRoute);
  check("…and it spent nothing", stateFile() === before && (await bal("m_jordan")) === b0);
  const truthy = await routePost(JOR, { action: { type: "unlockMany", items: items5, quote: "yes" } });
  check("a quote flag of any truthy kind is a quote, never a spend", truthy.status === 200 && !!truthy.json.quote && (await bal("m_jordan")) === b0, truthy);
  const signedOut = await routePost("made-up", { action: { type: "unlockMany", items: items5, quote: true } });
  check("signed out: 401", signedOut.status === 401);
  check("rubbish items are left out of the quote", (await Q.quoteUnlock(JOR, [null, 5, "x", { entity: "planet", id: "a", field: "b" }, ident(0)]))!.asked === 1);

  // No spend without a confirm: the run asks nothing of the server without its yes.
  let calls = 0;
  const spy: import("../app/post/workbench/run").RunDeps = { quote: async () => (calls++, q5), unlock: async () => (calls++, true) };
  const no = await R.runUnlock({ items: items5, quote: q5, confirmed: false }, spy);
  check("runUnlock without its yes: no quote, no unlock, nothing spent", calls === 0 && no.done === 0 && no.spent === 0 && !!no.stopped, no);
  const noAny = await R.runUnlock({ items: items5, quote: q5, confirmed: "yes" as never }, spy);
  check("…only true is a yes", calls === 0 && noAny.done === 0);

  // The run then spends exactly what was quoted.
  const sizes5: number[] = [];
  const ran5 = await R.runUnlock({ items: items5, quote: q5, confirmed: true }, realDeps(JOR, sizes5));
  check("the run with its yes: 5 done, 10 spent, as quoted", ran5.done === 5 && ran5.spent === 10 && ran5.stopped === null && (await bal("m_jordan")) === b0 - 10, ran5);
  const again = (await Q.quoteUnlock(JOR, items5))!;
  check("quoted again once open: 0 credits", again.cost === 0 && again.fits === 5, again);

  /* ================= batches of 60 ================= */
  console.log("\nbatches of 60");
  check("batchesOf: 130 goes as 60, 60 and 10", B.batchesOf(Array.from({ length: 130 }, (_, k) => k)).map((b) => b.length).join(",") === "60,60,10");
  check("…60 is one batch, 0 is none", B.batchesOf(Array.from({ length: 60 })).length === 1 && B.batchesOf([]).length === 0);
  // 130 facts: 45 companies to open (90 credits, under the day's 100) spread over the batches, the rest free facts that cost nothing.
  const run130: { entity: "company"; id: string; field: string }[] = [];
  let next = 10;
  const mix = (opens: number, frees: number) => {
    for (let k = 0; k < opens; k++) run130.push(ident(next++));
    for (let k = 0; k < frees; k++) run130.push(free(k));
  };
  mix(20, 40);
  mix(20, 40);
  mix(5, 5);
  const jb = await bal("m_jordan");
  const q130 = (await Q.quoteUnlock(JOR, run130))!;
  check("the quote for 130: three batches, 60, 60 and 10", q130.batches.map((b) => b.n).join(",") === "60,60,10", q130.batches);
  check("…costs 40, 40 and 10 (90 in all), all fit", q130.batches.map((b) => b.cost).join(",") === "40,40,10" && q130.cost === 90 && q130.fits === 130 && !q130.stop, q130);
  check("…each batch's cost is the server's dry run of it", (await Promise.all(B.batchesOf(run130).map((b) => dryCost(JOR, b)))).join(",") === "40,40,10");
  const sizes: number[] = [];
  const ran = await R.runUnlock({ items: run130, quote: q130, confirmed: true }, realDeps(JOR, sizes));
  check("the run: each unlockMany 60 facts at most (60, 60, 10)", sizes.join(",") === "60,60,10", sizes);
  check("…130 done, 90 spent, the balance moved by exactly that", ran.done === 130 && ran.spent === 90 && (await bal("m_jordan")) === jb - 90, { ran, now: await bal("m_jordan"), jb });

  /* ================= caps named ================= */
  console.log("\ncaps");
  const CAS = tok("m_casey");
  const cas60 = Array.from({ length: 60 }, (_, k) => ident(k));
  const qc = (await Q.quoteUnlock(CAS, cas60))!;
  check("the day's unlock limit: 60 companies is 120 unlocks, 50 fit (100 credits)", qc.fits === 50 && qc.cost === 100, qc);
  check("…the quote names the limit in the server's words", !!qc.stop && /100 unlocks in 24 hours/.test(qc.stop), qc.stop);
  check("…the stop is what the server says to the whole batch", (await T.perform(CAS, { type: "unlockMany", items: cas60 } as never, ORIGIN, { dryRun: true }).then(() => "ran", (e: Error) => e.message)) === qc.stop);
  const cb = await bal("m_casey");
  const ranC = await R.runUnlock({ items: cas60, quote: qc, confirmed: true }, realDeps(CAS, []));
  check("…the run opens the 50 that fit and spends 100, never the 10 past the limit", ranC.done === 50 && (await bal("m_casey")) === cb - 100, { ranC, now: await bal("m_casey") });
  const WYN = tok("m_wynn");
  const qw = (await Q.quoteUnlock(WYN, Array.from({ length: 20 }, (_, k) => ident(k))))!;
  check("the balance: 25 credits open 12 companies (24 credits) of 20", qw.fits === 12 && qw.cost === 24 && qw.after === 1, qw);
  check("…and says so in the server's words", !!qw.stop && /needs 40 credits and you have 25/.test(qw.stop), qw.stop);
  // Two batches quoted alone each fit, together they pass the day's limit: the run stops before the second, spending nothing more.
  const LAN = tok("m_lane");
  const lane: { entity: "company"; id: string; field: string }[] = [];
  for (let k = 0; k < 30; k++) lane.push(ident(k));
  for (let k = 0; k < 30; k++) lane.push(free(k));
  for (let k = 30; k < 60; k++) lane.push(ident(k));
  const ql = (await Q.quoteUnlock(LAN, lane))!;
  check("quoted batch by batch: 60 and 60 each fit alone (120 credits quoted)", ql.fits === 90 && ql.cost === 120 && ql.batches.length === 2, ql);
  const lb = await bal("m_lane");
  const lsizes: number[] = [];
  const ranL = await R.runUnlock({ items: lane, quote: ql, confirmed: true }, realDeps(LAN, lsizes));
  check("…the run spends the first batch (60) and stops before the second", lsizes.join(",") === "60" && ranL.done === 60 && (await bal("m_lane")) === lb - 60, { ranL, lsizes });
  check("…and names the limit that stopped it", !!ranL.stopped && /You can unlock 40 more today/.test(ranL.stopped) && /nothing more was spent/.test(ranL.stopped), ranL.stopped);
  // A batch that would cost more than quoted stops too (a fake quote that is cheaper than the server's).
  const cheap = { ...q5, items: 5, batches: [{ n: 5, cost: 4 }], cost: 4 };
  const sizesCheap: number[] = [];
  const ranCheap = await R.runUnlock({ items: [5, 6, 7, 8, 9].map(ident), quote: cheap, confirmed: true }, realDeps(tok("m_otto"), sizesCheap));
  check("a batch that would now cost more than its quote: nothing runs", sizesCheap.length === 0 && ranCheap.done === 0 && /would now cost 10 credits, not 4 credits/.test(ranCheap.stopped ?? ""), ranCheap);

  /* ================= pipeline.add ================= */
  console.log("\npipeline.add");
  const PIA = tok("m_pia");
  await T.perform(PIA, { type: "unlock", entity: "company", id: pub(cid(0)), field: "identity" } as never, ORIGIN);
  const added = await T.perform(PIA, { type: "pipeline.add", companyIds: [pub(cid(0)), pub(cid(1))] } as never, ORIGIN);
  check("an open company is added, a locked one is skipped and said", /Added 1 company to your pipeline at To reach out\./.test(added.message) && /1 is still locked: open it first\./.test(added.message), added.message);
  const pv = (await PA.pipelineViewFor(PIA))!;
  const e = pv.entries.filter((x) => x.company === pub(cid(0)));
  check("…it waits at To reach out, from a list, with no follow-up due", e.length === 1 && e[0].stage === "reach" && !pv.entries.some((x) => x.company === pub(cid(1))), e);
  const twice = await T.perform(PIA, { type: "pipeline.add", companyIds: [pub(cid(0))] } as never, ORIGIN);
  check("adding twice keeps one deal", /1 was in it already/.test(twice.message) && (await PA.pipelineViewFor(PIA))!.entries.filter((x) => x.company === pub(cid(0))).length === 1, twice.message);
  const onlyLocked = await T.perform(PIA, { type: "pipeline.add", companyIds: [pub(cid(1))] } as never, ORIGIN).then(() => null, (x: Error) => x.message);
  check("only locked companies: refused in words, nothing added", onlyLocked === "1 is still locked: open it first.", onlyLocked);
  const none = await T.perform(PIA, { type: "pipeline.add", companyIds: [] } as never, ORIGIN).then(() => null, (x: Error) => x.message);
  check("nothing picked: refused in words", none === "Pick the companies to add first.", none);
  const otto = (await PA.pipelineViewFor(tok("m_otto")))!;
  check("another member's pipeline has none of it", !otto.entries.length);
  check("pipeline.add spends nothing", (await bal("m_pia")) === 50 + 25 - 2, await bal("m_pia"));
}

main()
  .catch((e) => {
    failed++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed ? 1 : 0);
  });
