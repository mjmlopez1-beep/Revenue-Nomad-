/**
 * Checks of GET /api/table?first=1 (lib/firstPage.ts, app/post/place.ts): the first screen a
 * phone draws before the full view. No server: lib/table.ts runs in process on a made-up seed in a
 * temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-first.mts      exits 1 on any failure
 *
 * Covered, for several members (one who unlocked a company, a seat holder and a person, one who
 * unlocked nothing, one with no profile, an admin) and several places (the table at its defaults,
 * Hiring now on seats, people, Repeat hirers, a search, a link to one company):
 *   - privacy: every company the first page carries is exactly the full view's record of it (the
 *     same JSON, its locks with it), and nothing else of the full view differs but the companies
 *     left out (and the rates, which wait for the full view);
 *   - it carries only the companies of the list's first 50 rows (and the one ?c= opens);
 *   - the page, running the table's own list on just those companies, draws the same first rows
 *     in the same order as the full table does, and the counts are the whole table's;
 *   - Today's address gets Today's answer and no table; signed out gets nothing.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-first-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};

// 80 companies, so a list's first page (50 rows) leaves some out.
const INDUSTRIES = ["SaaS", "Fintech", "Healthcare", "Manufacturing"];
const SIZES = ["11–50", "51–200", "201–500"];
const FNS = ["Marketing", "Sales", "Finance", "RevOps"];
const companies = Array.from({ length: 80 }, (_, k) => ({
  id: `c_first${String(k).padStart(2, "0")}`,
  fields: { name: `Firstpage Co ${k}`, website: `firstpage${k}.example`, industry: INDUSTRIES[k % 4], employees: SIZES[k % 3], revenue: "$1M–$5M", hq: k % 5 ? "Austin, TX" : "London, UK" },
}));
const engagements: unknown[] = [];
const contacts: unknown[] = [];
companies.forEach((c, k) => {
  const fn = FNS[k % 4];
  engagements.push({
    id: `e_first${k}_a`,
    companyId: c.id,
    verified: false,
    fields: { source: "Seat scan", ...(k % 3 === 0 ? { operator: `Holder Person${k}` } : {}), role: `Fractional ${fn} Lead`, function: fn, type: "Fractional", start: monthAgo(1 + (k % 9)), status: "Active", end: "Ongoing" },
  });
  // Repeat hirers: a second seat in another function.
  if (k % 4 === 1) engagements.push({ id: `e_first${k}_b`, companyId: c.id, verified: false, fields: { source: "Seat scan", role: "Fractional CFO", function: "Finance", type: "Fractional", start: monthAgo(12), status: "Ended", end: monthAgo(3) } });
  // Open roles in Sales.
  if (k % 5 === 2) engagements.push({ id: `e_first${k}_open`, companyId: c.id, verified: false, fields: { source: "Demand scan", role: "Fractional VP Sales", function: "Sales", status: "Open role", posting: `https://firstpage${k}.example/jobs`, rate: "$8k/mo" } });
  if (k % 6 === 0) contacts.push({ id: `p_first${k}`, engagementId: `e_first${k}_a`, fields: { name: `Exec Person${k}`, title: "CEO", relationship: "Hiring for the seat", email: `exec${k}@firstpage${k}.example` } });
});
const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Starter", email: "sal.first@example.com", title: "Fractional VP Sales", token: "tok-sal-first" },
    { id: "mem_mo", name: "Mo Marketer", email: "mo.first@example.com", title: "Fractional CMO", token: "tok-mo-first" },
    { id: "mem_ned", name: "Ned Noprofile", email: "ned.first@example.com", title: "Fractional VP Sales", token: "tok-ned-first" },
    { id: "mem_ada", name: "Ada Admin", email: "admin-first@example.com", title: "Admin", token: "tok-ada-first" },
  ],
  companies,
  engagements,
  contacts,
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const US = { industries: ["SaaS", "Fintech"], employees: [], revenue: [], countries: ["United States"] };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(HOUR)])),
    profiles: {
      mem_sal: { function: "Sales", onboarded: true, icp: US },
      mem_mo: { function: "Marketing", onboarded: true, icp: US, goal: "adjacent" },
      mem_ned: { function: "Sales", onboarded: true },
      mem_ada: { function: "Sales", onboarded: true },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-first@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
/** The same JSON, key order aside. */
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;

async function main() {
  const t = await import("../lib/table");
  const { firstPage } = await import("../lib/firstPage");
  const { packCompany, unpackView } = await import("../lib/viewWire");
  const { deriveAll } = await import("../app/post/model");
  const { FIRST_ROWS, listAt, parsePlace } = await import("../app/post/place");
  const BASE = "https://post.example.com";
  type View = Awaited<ReturnType<typeof t.buildView>>;
  const SAL = "tok-sal-first";

  check("signed out: nothing", (await firstPage(null, "?p=table")) === null && (await firstPage("not-a-token", "?p=table")) === null && (await firstPage(null, "")) === null);

  // The public ids, from the admin's table (admins see every name).
  const ada = await t.buildView("tok-ada-first");
  const coId = (k: number) => ada.companies.find((c) => c.name === `Firstpage Co ${k}`)!.id;
  const co0 = ada.companies.find((c) => c.id === coId(0))!;
  const holderSeat = co0.engagements.find((e) => e.cells.operator && e.cells.operator.s !== "empty")!.id;
  const person0 = co0.engagements.flatMap((e) => e.people).concat(co0.people).find((p) => p.cells.name && p.cells.name.s !== "empty")!.id;
  // Sal unlocks a company, who held a seat there, and a person's name: his records of them differ from everyone else's.
  const target = coId(71);
  const ok1 = await t.perform(SAL, { type: "unlock", entity: "company", id: target, field: "identity" }, BASE);
  await t.perform(SAL, { type: "unlock", entity: "company", id: coId(0), field: "identity" }, BASE);
  // Who held a seat there is free once Sal opened the company (PEERS_FREE): nothing to buy, so this asks and is told so.
  const ok2 = await t.perform(SAL, { type: "unlock", entity: "engagement", id: holderSeat, field: "operator" }, BASE).catch((e: Error) => (/Nothing here is locked/.test(e.message) ? { message: "free" } : null));
  const ok3 = await t.perform(SAL, { type: "unlock", entity: "contact", id: person0, field: "name" }, BASE);
  check("Sal's unlocks went through", !!ok1 && !!ok2 && !!ok3);

  const MEMBERS: [string, string][] = [
    ["Sal (unlocks)", SAL],
    ["Mo (no unlocks, an onboarding preset)", "tok-mo-first"],
    ["Ned (no profile)", "tok-ned-first"],
    ["Ada (admin)", "tok-ada-first"],
  ];
  const PLACES = ["?p=table", "?v=hiring&t=seats", "?t=people", "?v=repeat", "?q=Firstpage%20Co%201", `?c=${target}`, "?f=-&s=name"];
  for (const [who, tok] of MEMBERS) {
    const full = await t.buildView(tok);
    const byId = new Map(full.companies.map((c) => [c.id, c]));
    const me = full.me!;
    let carried = 0;
    for (const place of PLACES) {
      const ans = await firstPage(tok, place);
      if (!ans || !("view" in ans)) {
        check(`${who} ${place}: a first page`, false, ans);
        continue;
      }
      const wire = JSON.parse(JSON.stringify(ans.view)) as View;
      const fp = unpackView(wire);
      // Privacy: each record exactly the full view's, packed exactly as the full view packs it.
      const bad = fp.companies.filter((c) => !same(c, byId.get(c.id)));
      // (A list can be empty: a search for a name still locked finds nothing, and the page says so.)
      check(`${who} ${place}: every company is the full view's own record`, !bad.length, bad.map((c) => c.id));
      carried += fp.companies.length;
      const packedSame = (ans.view.companies as View["companies"]).every((c) => JSON.stringify(c) === JSON.stringify(packCompany(byId.get(c.id)!)));
      check(`${who} ${place}: and on the wire exactly as the full view sends it`, packedSame);
      const { companies: _a, benchmarks: _b, ...restFull } = full;
      const { companies: _c, packed: _p, ...restFirst } = ans.view as View & { packed?: boolean };
      void _a, _b, _c, _p;
      check(`${who} ${place}: the rest is the full view's (the rates aside)`, same(restFirst, restFull) && !("benchmarks" in ans.view), Object.keys(restFirst));
      // Only the list's first rows' companies.
      const p = parsePlace(me, place, new Set());
      const whole = listAt(deriveAll(full.companies), me, p, new Set());
      const want = new Set(whole.rows.slice(0, FIRST_ROWS).map((r) => r.i.c.id));
      if (p.c && byId.has(p.c)) want.add(p.c);
      check(`${who} ${place}: only the companies of the first ${FIRST_ROWS} rows`, fp.companies.length === want.size && fp.companies.every((c) => want.has(c.id)), { got: fp.companies.length, want: want.size });
      // The page's own list on just these companies draws the same first rows, in the same order.
      const part = listAt(deriveAll(fp.companies), me, p, new Set());
      const keys = (rows: { key: string }[]) => rows.slice(0, FIRST_ROWS).map((r) => r.key).join(",");
      check(`${who} ${place}: the same first rows in the same order`, keys(part.rows) === keys(whole.rows), { part: keys(part.rows).slice(0, 200), whole: keys(whole.rows).slice(0, 200) });
      check(`${who} ${place}: the counts are the whole table's`, same(ans.first, whole.first) && ans.first.n === whole.rows.length && ans.first.totals.companies === full.companies.length, { n: ans.first.n, rows: whole.rows.length });
    }
    check(`${who}: the first pages carried companies, and the table's default list a full page of them`, carried > FIRST_ROWS);
  }

  // What Sal unlocked is his alone: named in his first page, locked in Mo's.
  const salC = (await firstPage(SAL, `?c=${target}`)) as { view: View };
  const moC = (await firstPage("tok-mo-first", `?c=${target}`)) as { view: View };
  const salRec = unpackView(JSON.parse(JSON.stringify(salC.view))).companies.find((c) => c.id === target);
  const moRec = unpackView(JSON.parse(JSON.stringify(moC.view))).companies.find((c) => c.id === target);
  check("a company Sal unlocked is named in his first page", !!salRec && !salRec.hidden && salRec.name === "Firstpage Co 71", salRec?.name);
  check("and locked in Mo's, with no name, website or link", !!moRec && moRec.hidden && moRec.name === "Locked company" && moRec.cells.website?.s === "locked" && !JSON.stringify(moC.view).includes("Firstpage Co 71") && !JSON.stringify(moC.view).includes("firstpage71.example"), moRec?.name);
  const salT = (await firstPage(SAL, `?c=${coId(0)}`)) as { view: View };
  const moT = (await firstPage("tok-mo-first", `?c=${coId(0)}`)) as { view: View };
  const holder = (v: View) => unpackView(JSON.parse(JSON.stringify(v))).companies.find((c) => c.id === coId(0))?.engagements.find((e) => e.id === holderSeat)?.cells.operator;
  check("who held a seat at the company Sal opened: his to see free, locked for Mo (the company is locked for him)", holder(salT.view)?.s === "value" && holder(moT.view)?.s === "locked", [holder(salT.view), holder(moT.view)]);
  check("no one's first page names a seat holder or a person they haven't unlocked", !JSON.stringify(moT.view).includes("Holder Person0") && !JSON.stringify(moT.view).includes("Exec Person0"));

  // Today's address: Today's answer, no table.
  const home = await firstPage(SAL, "");
  check("Today's address gets Today's answer and no table", !!home && "today" in home && !("view" in home) && home.today.me.id === "mem_sal");
  check("so does a query that names no place", !!(await firstPage(SAL, "?ref=abc")) && "today" in (await firstPage(SAL, "?ref=abc"))!);
  // Home's first screen carries today's moves (lib/moves.ts): each one's record is the full view's own, so what Sal unlocked is his alone.
  for (const [who, tok] of [["Sal", SAL], ["Mo", "tok-mo-first"]] as const) {
    const fp = await firstPage(tok, "");
    const full = await t.buildView(tok);
    const td = fp && "today" in fp ? fp.today : null;
    const recs = (td?.companies ?? []).map((c) => unpackView({ companies: [JSON.parse(JSON.stringify(c))], packed: true } as never).companies[0]);
    check(`${who}: Home's moves are at most three companies, each with its record`, !!td?.moves && td.moves.list.length <= 3 && recs.length === td.moves.list.length && recs.every((c, k) => c.id === td.moves!.list[k].id), td?.moves?.list.map((w) => w.id));
    check(`${who}: each move's record is the full view's own record, locks and all`, recs.every((c) => same(c, full.companies.find((x) => x.id === c.id))), recs.find((c) => !same(c, full.companies.find((x) => x.id === c.id)))?.id);
    check(`${who}: no move carries a person (nobody here has a network), and nothing is named that the table keeps locked`, !!td && td.moves!.list.every((w) => !w.know) && recs.every((c) => !c.hidden || c.name === "Locked company"));
  }
}

try {
  await main();
} catch (e) {
  failures++;
  console.log("FAIL threw:", e);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
