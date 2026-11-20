/**
 * Checks of GET /api/table?today=1 (lib/today.ts todayView, TodayView in lib/viewWire.ts): what
 * Today draws before the full view. No server: lib/table.ts runs in process on a made-up seed in a
 * temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-today.mts      exits 1 on any failure
 *
 * Covered: signed out is nothing; the member is the view's own Me, their free company of the day;
 * Crystal Ball's rows are its own (the top 4 of its latest day, ranked as it ranks them) and count
 * the day; each row's record is exactly the record the member's table builds (its locks with it),
 * so a locked company names nothing and an unlocked one is named; under 20 KB; and with &since=
 * the counts for "Since Tuesday": the day's companies, roles opened in the member's function and
 * followed companies with a new fact.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-today-"));
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
const seat = (id: string, companyId: string, fields: Record<string, string>, addedAt?: string) => ({ id, companyId, fields, verified: false, ...(addedAt ? { addedAt } : {}) });

const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Starter", email: "sal.starter@example.com", title: "Fractional VP Sales", token: "tok-sal-today" },
    { id: "mem_mo", name: "Mo Marketer", email: "mo.marketer@example.com", title: "Fractional CMO", token: "tok-mo-today" },
    { id: "mem_noicp", name: "Ned Noprofile", email: "ned.noprofile@example.com", title: "Fractional VP Sales", token: "tok-noicp-today" },
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example", industry: "SaaS", employees: "51–200", revenue: "$1M–$5M", hq: "Austin, TX" } },
    { id: "c_beta", fields: { name: "Beta Labs", website: "beta.example", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Denver, CO" } },
    { id: "c_fox", fields: { name: "Fox Freight", website: "fox.example", industry: "SaaS", employees: "201–500", revenue: "$20M–$50M", hq: "Chicago, IL" } },
    { id: "c_kilo", fields: { name: "Kilo Kitchens", website: "kilo.example", industry: "SaaS", employees: "51–200", hq: "Phoenix, AZ" } },
    { id: "c_lima", fields: { name: "Lima Logistics", website: "lima.example", industry: "SaaS", employees: "51–200", hq: "Tampa, FL" } },
    { id: "c_mike", fields: { name: "Mike Metals", website: "mike.example", industry: "SaaS", employees: "11–50", hq: "Dallas, TX" } },
  ],
  engagements: [
    // Fractional Marketing hires (Marketing comes before Sales): Crystal Ball's companies for Sal, today.
    seat("e_acme_mkt", "c_acme", { source: "Seat scan", operator: "Hana Holder", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_beta_mkt", "c_beta", { source: "Seat scan", role: "Fractional VP Marketing", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_fox_mkt", "c_fox", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_kilo_mkt", "c_kilo", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_lima_mkt", "c_lima", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    seat("e_mike_mkt", "c_mike", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    // An open Sales role whose title names its company, opened an hour ago.
    seat("e_beta_open", "c_beta", { source: "Demand scan", role: "Fractional VP Sales at Beta Labs", function: "Sales", status: "Open role", posting: "https://beta.example/jobs/vp-sales", rate: "$9k/mo" }),
  ],
  contacts: [{ id: "p_acme_ceo", engagementId: "e_acme_mkt", fields: { name: "Carla Chief", title: "CEO", relationship: "Hiring for the seat", email: "carla@acme.example" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const US_MID = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(HOUR)])),
    profiles: {
      mem_sal: { function: "Sales", onboarded: true, icp: US_MID },
      mem_mo: { function: "Marketing", onboarded: true, icp: US_MID },
      mem_noicp: { function: "Sales", onboarded: true },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-today@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_FREE_COMPANY", "RESEND_API_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const NAMES = ["Acme Robotics", "Acme", "Beta Labs", "Fox Freight", "Kilo Kitchens", "Lima Logistics", "Mike Metals", "Hana Holder", "Carla Chief", "acme.example", "beta.example"];
const named = (x: unknown, names = NAMES) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return names.filter((n) => new RegExp(`\\b${n.replace(/\./g, "\\.")}\\b`, "i").test(s));
};
/** The same JSON, key order aside. */
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;

async function main() {
  const t = await import("../lib/table");
  const radar = await import("../lib/radar");
  const { todayView, TODAY_MAX } = await import("../lib/today");
  const { unpackCompany } = await import("../lib/viewWire");
  const SAL = "tok-sal-today";
  const BASE = "https://post.example.com";

  check("signed out: nothing", (await todayView(null)) === null && (await todayView("not-a-token")) === null);

  const view = await t.buildView(SAL);
  const rv = await radar.radarView(SAL);
  const today = (await todayView(SAL))!;
  const raw = JSON.stringify(today);
  check("Crystal Ball has a day of companies for Sal", (rv?.rows.length ?? 0) >= 5, rv?.rows.length);
  check("the member is the view's own Me", today.me.id === view.me!.id && today.me.credits === view.me!.credits && today.me.function === "Sales" && today.me.token === view.me!.token, today.me);
  check("the free company of the day is said", typeof today.freeCompany === "boolean" && today.freeCompany === !!view.me!.freeCompany);
  check("no plan while billing is off", !("plan" in today));
  check("the rows are Crystal Ball's top 4, in its order", same(today.radar.rows, rv!.rows.slice(0, 4)), { today: today.radar.rows.map((x) => x.id), radar: rv!.rows.map((x) => x.id) });
  check("the day, the function and how many companies that day", today.radar.day === rv!.day && today.radar.fn === "Sales" && today.radar.newCount === rv!.rows.length && today.radar.on && today.radar.ready, today.radar);
  check("under 20 KB", raw.length < TODAY_MAX, raw.length);
  check("no since without &since=", !("since" in today));
  check("names no company and no person while they are locked", !named(today).length, named(today));
  // Each row's record, as the table builds it.
  const recs = today.companies.map((c) => unpackCompany(JSON.parse(JSON.stringify(c))));
  const byId = new Map(view.companies.map((c) => [c.id, c]));
  check("every row comes with its record", recs.length === today.radar.rows.length && recs.every((c, i) => c.id === today.radar.rows[i].id), recs.map((c) => c.id));
  check("each record is the member's table's own record", recs.every((c) => same(c, byId.get(c.id))), recs.find((c) => !same(c, byId.get(c.id)))?.id);
  check("a locked record shows the free facts and no name", recs.every((c) => c.hidden && c.name === "Locked company" && c.cells.industry?.s === "value" && c.cells.website?.s === "locked"), recs[0]?.cells);

  // Unlocked: the record names it, as the table does.
  const first = today.radar.rows[0].id;
  await t.perform(SAL, { type: "unlock", entity: "company", id: first, field: "identity" }, BASE);
  const after = (await todayView(SAL))!;
  const rec = after.companies.find((c) => c.id === first);
  const fromView = (await t.buildView(SAL)).companies.find((c) => c.id === first);
  check("after Unlock company, its record is named, as in the table", !!rec && !rec.hidden && rec.name === fromView?.name && rec.name !== "Locked company", rec?.name);
  check("and only that one", after.companies.filter((c) => !c.hidden).length === 1);

  // Another member sees their own.
  const mo = (await todayView("tok-mo-today"))!;
  check("another member gets their own Me and nothing Sal unlocked", mo.me.id === "mem_mo" && mo.companies.every((c) => c.hidden) && !named(mo).length, named(mo));
  const ned = (await todayView("tok-noicp-today"))!;
  // A function but no Ideal Fractional Profile: Crystal Ball looks at any company (lib/radar anyCompany), still capped at 4 here and still locked.
  check("without a profile: ready, any company, still locked", ned.radar.ready && ned.radar.rows.length <= 4 && ned.companies.every((c) => c.hidden), ned.radar);

  // Since Tuesday: Sal follows a company, Mo adds a fact there.
  const follow = today.radar.rows[1].id;
  await t.perform(SAL, { type: "follow", companyId: follow, on: true }, BASE);
  const since = ago(3 * HOUR);
  await t.perform("tok-mo-today", { type: "unlock", entity: "company", id: follow, field: "identity" }, BASE);
  await t.perform("tok-mo-today", { type: "fill", entity: "company", id: follow, field: "ownership", value: "VC-backed" }, BASE);
  const withSince = (await todayView(SAL, since))!;
  check("&since= gives the counts", !!withSince.since && withSince.since.sinceIso === new Date(since).toISOString(), withSince.since);
  check("Crystal Ball's companies since then", withSince.since?.radar === rv!.days.filter((d) => d.day >= since.slice(0, 10)).reduce((n, d) => n + d.companies, 0) && (withSince.since?.radar ?? 0) > 0, withSince.since);
  check("a followed company with a new fact counts", withSince.since?.follows === 1, withSince.since);
  check("no role opened in Sales since then", withSince.since?.roles === 0, withSince.since);
  // The seed's open role was first seen when the seed was built, 30 days ago.
  const month = (await todayView(SAL, ago(31 * DAY)))!;
  check("the open Sales role counts as opened since a month ago", month.since?.roles === 1, month.since);
  const mark = new Date().toISOString();
  await new Promise((r) => setTimeout(r, 5));
  const later = (await todayView(SAL, mark))!;
  check("nothing since just now", later.since?.follows === 0 && later.since?.roles === 0, later.since);
  check("a since in the future or past the window is left out", !("since" in (await todayView(SAL, new Date(Date.now() + DAY).toISOString()))!) && !("since" in (await todayView(SAL, "2001-01-01"))!) && !("since" in (await todayView(SAL, "nonsense"))!));
  const moSince = (await todayView("tok-mo-today", since))!;
  check("Mo's roles count is in Marketing (none open), and Mo follows nothing", (await todayView("tok-mo-today", ago(31 * DAY)))?.since?.roles === 0 && moSince.since?.follows === 0, moSince.since);
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
