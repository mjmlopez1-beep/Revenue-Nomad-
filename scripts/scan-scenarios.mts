/**
 * Scans stored on a scratch table (applyScan and runScan in lib/table.ts), one scenario a run.
 * scripts/test-scan.mts starts each scenario in its own process, because the server module
 * keeps its state in memory and every scenario needs a fresh table. To run one by hand:
 *
 *   npx tsx scripts/scan-scenarios.mts <cap|health|baseline|dates|refunds|names|small|claimgone|notfractional|seniority|functions|postingcheck|intake|dupes|careers>
 *
 * It runs on a made-up seed in a temporary data folder. No network, and nothing from the real
 * seed. Prints PASS and FAIL lines, then "##RESULT <passed> <failed>".
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { collectOpenRoles, type ScanRawJob } from "../lib/scan/collect";
import { roleKey } from "../lib/scan/clean";
import type { ScanRole, ScanSourceResult } from "../lib/scanTypes";
import type { CompanyRec, EngagementRec, View } from "../lib/tableTypes";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

const DAY = 86_400_000;
const HOUR = 3_600_000;
const REAL_NOW = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const dayOf = (ms: number) => iso(ms).slice(0, 10);

/* ---------- a scratch table ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "rn-scan-"));
const seed = {
  // Built 20 days ago, so the open role it carries is not "new this week".
  builtAt: iso(REAL_NOW - 20 * DAY),
  members: [
    { id: "m1", name: "Sal Sales", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal" },
    { id: "m2", name: "Mo Marketing", email: "mo@example.com", title: "Fractional CMO", token: "tok-mo" },
    { id: "m3", name: "Cy Success", email: "cy@example.com", title: "Fractional Head of Customer Success", token: "tok-cy" },
    { id: "m9", name: "Ada Admin", email: "ada@example.com", title: "Founder", token: "tok-ada" },
  ],
  companies: [
    { id: "c_oldco", fields: { name: "Oldco Freight", website: "casehost.example.com" } },
    { id: "c_seedrole", fields: { name: "Seedrole Systems" } },
  ],
  engagements: [
    { id: "e_oldco_sal", companyId: "c_oldco", fields: { source: "Published engagement", operator: "Sal Sales", function: "Sales" } },
    { id: "e_seedrole_open", companyId: "c_seedrole", fields: { source: "Demand scan", role: "Fractional CRO", function: "Sales" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "seed.json"), JSON.stringify(seed));
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada@example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1", // runScan never reaches a real job board from here
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_DIGEST_ALL"]) delete process.env[k];
// The server module logs what it does to the state. Keep the test output to PASS and FAIL lines.
console.error = process.env.SCEN_DEBUG ? console.error : () => {};
console.warn = () => {};
console.log = ((log) => (...a: unknown[]) => (/^(PASS|FAIL|##)/.test(String(a[0])) ? log(...a) : undefined))(console.log);

const t = await import("../lib/table");

/** One role as a job board would hand it over. */
const sr = (company: string, title: string, over: Partial<ScanRole> = {}): ScanRole => ({
  key: roleKey(company, title),
  company,
  domain: null,
  title,
  function: null,
  type: "Fractional",
  url: `https://jobs.example.com/${encodeURIComponent(company)}/${encodeURIComponent(title)}`,
  source: "board",
  postedAt: null,
  rate: null,
  hoursPerWeek: null,
  ...over,
});
const scan = (roles: ScanRole[], sources: ScanSourceResult[], atMs?: number) => t.applyScan({ roles, sources }, atMs === undefined ? undefined : iso(atMs));
const admin = () => t.buildView("tok-ada") as Promise<View>;
const companyOf = (v: View, name: string): CompanyRec | undefined => v.companies.find((c) => c.name === name);
const roleOf = (v: View, name: string, n = 0): EngagementRec | undefined => companyOf(v, name)?.engagements.filter((e) => e.source === "Demand scan")[n];
/** Every unlock a member tries, whether or not one unlock already bought the others. */
async function unlockAll(token: string, items: { entity: "company" | "engagement"; id: string; field: string }[]) {
  // These scenarios check what paid unlocks give back: the member's free company of the day (a 0-credit unlock) is spent first, on a company gone since.
  await t.tableInternals.mutate((d, seed) => {
    const m = t.memberByToken(seed, token, d);
    const today = new Date().toISOString().slice(0, 10);
    if (m && !d.ledger.some((l) => l.memberId === m.id && l.why === "free" && l.at.slice(0, 10) === today))
      d.ledger.push({ memberId: m.id, delta: 0, reason: "unlock", ref: "c_gone_free.identity", at: new Date().toISOString(), why: "free" });
  });
  for (const it of items) await t.perform(token, { type: "unlock", ...it }).catch(() => null);
}
const credits = async (token: string) => (await t.buildView(token)).me!.credits;

/* ---------- scenarios ---------- */

/** ROB-5: the collector's cap of 60 must not close roles that are still posted. */
async function cap() {
  const T0 = Date.parse("2026-09-01T06:00:00Z");
  const posting = (i: number, postedMs: number): ScanRawJob => ({
    kind: "listing",
    title: "Fractional VP of Sales",
    company: `Capco${i} Robotics`,
    url: `https://jobs.fakeboard.example.com/capco${i}/fractional-vp-sales`,
    source: "fakeboard",
    postedAt: iso(postedMs),
    fractionalBoard: true,
    description: "We are hiring a fractional VP of Sales, 15 hours per week, to build our outbound sales pipeline and lead the SDR team. $150/hr.",
  });
  const board = (jobs: ScanRawJob[]) => [{ name: "fakeboard", fetchJobs: async () => jobs }];
  /** What runScan hands to applyScan: every screened role when the collector gives them, else its capped list. */
  const store = async (jobs: ScanRawJob[], now: number) => {
    const found = await collectOpenRoles({ sources: board(jobs), now });
    const all = (found as { all?: ScanRole[] }).all;
    return { found, all, r: await t.applyScan({ roles: all ?? found.roles, sources: found.sources }, iso(now)) };
  };

  const old = Array.from({ length: 60 }, (_, i) => posting(i, T0 - (i + 1) * HOUR));
  const w0 = await store(old, T0);
  eq("week 0: a board lists 60 roles and all 60 open", [w0.r.opened, w0.r.closed], [60, 0]);

  // 40 newer roles go up. The 60 older ones are still posted.
  const newer = Array.from({ length: 40 }, (_, i) => posting(100 + i, T0 + 6 * DAY - i * HOUR));
  const w1 = await store([...old, ...newer], T0 + 7 * DAY);
  eq("week 1: the collector still caps `roles` at 60 and gives every screened role in `all`", [w1.found.roles.length, w1.all?.length, w1.found.seenKeys.length], [60, 100, 100]);
  eq("week 1: the 40 newer roles open and the 60 older ones are seen again", [w1.r.opened, w1.r.stillOpen, w1.r.closed], [40, 60, 0]);
  const w2 = await store([...old, ...newer], T0 + 14 * DAY);
  eq("week 2: all 100 are still posted, so none closes", [w2.r.opened, w2.r.stillOpen, w2.r.closed], [0, 100, 0]);
  const w3 = await store([...old, ...newer], T0 + 21 * DAY);
  eq("week 3: still none", [w3.r.stillOpen, w3.r.closed], [100, 0]);

  // The cap is on roles opened for the first time in one run.
  const fresh = Array.from({ length: 100 }, (_, i) => sr(`Freshco${i} Labs`, "Fractional CMO", { source: "bigboard" }));
  const big = [{ source: "bigboard", fetched: 400, matched: 100 }];
  const f1 = await scan(fresh, big, T0 + 22 * DAY);
  eq("100 roles nobody has seen before: 60 open in this run and 40 wait", [f1.opened, f1.overCap], [60, 40]);
  const f2 = await scan(fresh, big, T0 + 23 * DAY);
  eq("the next run sees the 60 again and opens the other 40", [f2.stillOpen, f2.opened, f2.overCap, f2.closed], [60, 40, 0, 0]);

  // runScan hands applyScan every screened role, not the collector's capped list.
  const all100 = [...old, ...newer];
  const run = await t
    .runScan(undefined, { collect: () => collectOpenRoles({ sources: board(all100), now: T0 + 24 * DAY }), now: iso(T0 + 24 * DAY) } as never)
    .catch(() => null);
  eq("runScan passes all 100 screened roles on", [run?.result.stillOpen, run?.result.closed], [100, 0]);
}

/** ROB-6: a board that reads but matches nothing (or far less than usual) is not a clean scan, and one clean miss closes nothing. */
async function health() {
  const T0 = Date.parse("2026-09-01T06:00:00Z");
  const at = (d: number) => T0 + d * DAY;
  const A = [1, 2, 3, 4, 5].map((i) => sr(`Scanco${i} Systems`, "Fractional VP Sales", { source: "boardA", function: "Sales" }));
  const boardA = (matched: number, over: Partial<ScanSourceResult> = {}) => [{ source: "boardA", fetched: 300, matched, ...over }];
  const hiddenFor = async (token: string) => (await t.buildView(token)).companies.filter((c) => c.hidden).length;
  const boardRow = async () => (await admin()).admin?.boards?.find((b) => b.source === "boardA");

  eq("day 0: boardA lists 5 roles", (await scan(A, boardA(5), at(0))).opened, 5);
  const hidden0 = await hiddenFor("tok-mo");
  eq("day 7: boardA answers 300 listings and matches none. Nothing closes", (await scan([], boardA(0), at(7))).closed, 0);
  eq("day 14: the same again, a second run in a row. Still nothing closes", (await scan([], boardA(0), at(14))).closed, 0);
  eq("a member still sees those companies hidden", await hiddenFor("tok-mo"), hidden0);
  eq("pilot metrics flag the board, with its last healthy count and day", await boardRow(), { source: "boardA", healthy: false, lastOkAt: iso(at(0)), baseline: 5 });
  const s14 = (await t.buildView("tok-mo")).scan;
  eq("the last scan members see is the last clean one, not the last run", [s14?.lastOkAt, s14?.lastRunAt], [iso(at(0)), iso(at(14))]);
  eq("a board that errors is not clean either", [(await scan([], boardA(0, { fetched: 0, error: "Timed out" }), at(15))).closed, (await boardRow())?.healthy], [0, false]);

  eq("day 21: a good run sees all 5 again", [(await scan(A, boardA(5), at(21))).stillOpen, (await boardRow())?.healthy], [5, true]);
  const open21 = (await t.buildView("tok-mo")).scan!.openNow;

  // Under half the last healthy count is not clean, and does not become the new normal on the next run.
  const r28 = await scan(A.slice(0, 2), boardA(2), at(28));
  eq("day 28: boardA matches 2 where it matched 5. Not a clean scan", [r28.closed, (await boardRow())?.healthy, (await boardRow())?.baseline], [0, false, 5]);
  // The board answered and did not list them: whatever the run's health, they are not counted as open (LOGIC-10).
  eq("  the 3 it did not list are marked unseen and left out of open now, and stay open", [roleOf(await admin(), "Scanco5 Systems")?.unseen, roleOf(await admin(), "Scanco5 Systems")?.closed, (await t.buildView("tok-mo")).scan!.openNow], [true, null, open21 - 3]);
  eq("day 35: the same low count again. The baseline did not move, so nothing closes", [(await scan(A.slice(0, 2), boardA(2), at(35))).closed, (await boardRow())?.baseline], [0, 5]);

  // A clean scan that misses a role: one is not enough, and two on one day count once.
  const r42 = await scan(A.slice(0, 3), boardA(3), at(42));
  eq("day 42: boardA matches 3 of 5, a clean scan. It missed 2 roles, and one miss closes nothing", [r42.closed, (await boardRow())?.healthy, (await boardRow())?.baseline], [0, true, 3]);
  const v42 = await admin();
  eq("  a missed role is still open, marked unseen, with the time it was last seen", [roleOf(v42, "Scanco5 Systems")?.unseen, roleOf(v42, "Scanco5 Systems")?.closed, roleOf(v42, "Scanco5 Systems")?.lastSeen], [true, null, iso(at(21))]);
  eq("  a role the scan did see is not", roleOf(v42, "Scanco1 Systems")?.unseen, false);
  eq("  unseen roles are left out of open now", (await t.buildView("tok-mo")).scan!.openNow, open21 - 2);
  eq("  the same scan an hour later is not a second miss", (await scan(A.slice(0, 3), boardA(3), at(42) + HOUR)).closed, 0);
  eq("day 49: a second clean scan misses them. Unseen for 28 days, they close", (await scan(A.slice(0, 3), boardA(3), at(49))).closed, 2);
  eq("  closed roles are not unseen", roleOf(await admin(), "Scanco5 Systems")?.unseen, false);

  // A scan that runs late: one clean miss after a long gap still closes nothing.
  const X = sr("Lateco Health", "Fractional CMO", { source: "boardC" });
  const K = sr("Keeperco Health", "Fractional CMO", { source: "boardC" });
  const boardC = (matched: number) => [{ source: "boardC", fetched: 40, matched }];
  await scan([X, K], boardC(2), at(50));
  eq("after a 20 day gap, one clean scan that misses a role closes nothing", (await scan([K], boardC(1), at(70))).closed, 0);
  eq("  nor does a second scan the same day", (await scan([K], boardC(1), at(70) + 2 * HOUR)).closed, 0);
  eq("  the next day's clean scan closes it", (await scan([K], boardC(1), at(71))).closed, 1);
  const reopened = await scan([X, K], boardC(2), at(72));
  eq("a closed role listed again reopens", [reopened.reopened, roleOf(await admin(), "Lateco Health")?.closed], [1, null]);
}

/** ROB-6: a board that really got smaller is trusted again after three weeks of the smaller count. */
async function baseline() {
  const T0 = Date.parse("2026-09-01T06:00:00Z");
  const at = (d: number) => T0 + d * DAY;
  const B = Array.from({ length: 10 }, (_, i) => sr(`Shrinkco${i} Media`, "Fractional Head of Growth", { source: "boardB" }));
  const boardB = (matched: number) => [{ source: "boardB", fetched: 80, matched }];
  const row = async () => (await admin()).admin?.boards?.find((b) => b.source === "boardB");

  await scan(B, boardB(10), at(0));
  eq("day 7: 4 of 10 is under half. Not clean", [(await scan(B.slice(0, 4), boardB(4), at(7))).closed, (await row())?.healthy, (await row())?.baseline], [0, false, 10]);
  eq("day 14: still 4. Still not clean, and the baseline stays 10", [(await scan(B.slice(0, 4), boardB(4), at(14))).closed, (await row())?.baseline], [0, 10]);
  eq("day 28: three weeks of 4. That is the board's size now", [(await scan(B.slice(0, 4), boardB(4), at(28))).closed, (await row())?.baseline], [0, 4]);
  eq("day 35: 4 of 4 is a clean scan. The 6 it has not listed since day 0 get their first miss", [(await scan(B.slice(0, 4), boardB(4), at(35))).closed, (await row())?.healthy], [0, true]);
  eq("day 42: the second clean miss closes them", (await scan(B.slice(0, 4), boardB(4), at(42))).closed, 6);

  // Matching nothing at all never becomes the new normal.
  const Z = Array.from({ length: 4 }, (_, i) => sr(`Zeroco${i} Media`, "Fractional Head of Growth", { source: "boardZ" }));
  const boardZ = (matched: number) => [{ source: "boardZ", fetched: 80, matched }];
  await scan(Z, boardZ(4), at(43));
  let closed = 0;
  for (const d of [50, 57, 64, 71, 78, 85, 92]) closed += (await scan([], boardZ(0), at(d))).closed;
  const zeroRow = (await admin()).admin?.boards?.find((b) => b.source === "boardZ");
  eq("a board that matches nothing for seven weeks closes nothing and keeps its baseline", [closed, zeroRow?.healthy, zeroRow?.baseline], [0, false, 4]);
}

/** LOGIC-10, ROB-14: the dates a role carries say what the scan knows, and old postings are not new this week. */
async function dates() {
  const before = (await t.buildView("tok-sal")).scan!;
  const posted = REAL_NOW - 45 * DAY;
  const roles = [
    sr("Datesold Cloud", "Fractional VP Sales", { postedAt: iso(posted), function: "Sales" }),
    sr("Datesnew Cloud", "Fractional VP Sales", { postedAt: iso(REAL_NOW - 3 * DAY), function: "Sales" }),
    sr("Datesnone Cloud", "Fractional VP Sales", { function: "Sales" }),
  ];
  const board = (matched: number) => [{ source: "board", fetched: 50, matched }];
  const r = await scan(roles, board(3));
  const v = await admin();
  const old = roleOf(v, "Datesold Cloud");
  eq("a role carries the day the board says it was posted", old?.posted, dayOf(posted));
  eq("  and the full time the scan first saw it, next to the day form", [old?.openedAt, old?.opened, old?.closedAt, old?.closed], [r.at, r.at.slice(0, 10), null, null]);
  eq("  and when a scan last saw it", [old?.lastSeen, old?.unseen], [r.at, false]);
  eq("a role with no posted date says so", roleOf(v, "Datesnone Cloud")?.posted, null);
  const after = (await t.buildView("tok-sal")).scan!;
  eq("a posting 45 days old is open, but not new this week", [after.openNow - before.openNow, after.opened7 - before.opened7, after.mine7 - before.mine7], [3, 2, 2]);
  await t.touch("tok-sal"); // the weekly email only goes to members who have signed in
  const list = await t.digestList(undefined, "https://post.example.com");
  eq("the weekly email counts the same 2 new roles", list.find((x) => x.memberId === "m1")?.data.newRoles, 2);

  const seedRole = roleOf(v, "Seedrole Systems");
  eq("a role from the seed is dated from the day the seed was built, and is never unseen", [seedRole?.opened, seedRole?.openedAt, seedRole?.unseen], [seed.builtAt.slice(0, 10), seed.builtAt, false]);

  // Two clean scans miss the undated role. It closes with a full time, and the times do not move after that.
  const m1 = await scan(roles.slice(0, 2), board(2), REAL_NOW + 11 * DAY);
  const v1 = await admin();
  eq("a clean scan that misses a role marks it unseen and closes nothing", [m1.closed, roleOf(v1, "Datesnone Cloud")?.unseen, roleOf(v1, "Seedrole Systems")?.unseen], [0, true, false]);
  const closeAt = REAL_NOW + 12 * DAY;
  const m2 = await scan(roles.slice(0, 2), board(2), closeAt);
  const gone = roleOf(await admin(), "Datesnone Cloud");
  eq("the second one closes it, with the full time and the day", [m2.closed, gone?.closedAt, gone?.closed, gone?.unseen, gone?.cells.status?.s === "value" && gone.cells.status.v], [1, iso(closeAt), dayOf(closeAt), false, "Closed"]);
}

/** LOGIC-10: when a scan closes a role, unlocks made after its posting was last seen are paid back. */
async function refunds() {
  const now = REAL_NOW;
  const board = (matched: number) => [{ source: "board", fetched: 60, matched }];
  const A = sr("Refundco Alpha", "Fractional VP Sales");
  const B = sr("Refundco Beta", "Fractional VP Sales");
  const C1 = sr("Refundco Gamma", "Fractional VP Sales");
  const C2 = sr("Refundco Gamma", "Fractional CMO");
  const K = sr("Refundco Keeper", "Fractional VP Sales");
  await scan([A, B, C1, C2, K], board(5), now - 20 * DAY);
  const v = await admin();
  const ids = (name: string, n = 0) => ({ co: companyOf(v, name)!.id, eng: roleOf(v, name, n)!.id });
  const itemsFor = (x: { co: string; eng: string }) => [
    { entity: "company" as const, id: x.co, field: "identity" },
    { entity: "engagement" as const, id: x.eng, field: "role" },
    { entity: "engagement" as const, id: x.eng, field: "posting" },
  ];

  // Sal pays for Alpha's company, role and posting. Mo pays for Beta's. Cy pays for Gamma's company only.
  await unlockAll("tok-sal", itemsFor(ids("Refundco Alpha")));
  await unlockAll("tok-mo", itemsFor(ids("Refundco Beta")));
  await unlockAll("tok-cy", [{ entity: "company", id: ids("Refundco Gamma").co, field: "identity" }]);
  const spent = { sal: 25 - (await credits("tok-sal")), mo: 25 - (await credits("tok-mo")), cy: 25 - (await credits("tok-cy")) };
  // Unlock company is 2 credits (COMPANY_PRICE), with the posting of its open role in it: one ledger row each.
  check("each of them paid for the company", spent.sal === 2 && spent.mo === 2 && spent.cy === 2, spent);

  // Alpha and Gamma's VP Sales role are gone from the board. Beta, Gamma's CMO role and the keeper stay up.
  const still = [B, C2, K];
  const s2 = await scan(still, board(3), now - 9 * DAY);
  eq("one clean miss closes nothing and pays nothing back", [s2.closed, s2.refunded], [0, 0]);
  const s3 = await scan(still, board(3), now - 8 * DAY);
  eq("the second closes both roles and pays back the unlock made after they were last seen (one row, in full)", [s3.closed, s3.refunded], [2, 1]);
  eq("Sal has every credit back", await credits("tok-sal"), 25);
  const rows = (await t.buildView("tok-sal")).ledger.filter((l) => /closed/.test(l.reason));
  check(
    "each one is a line in his ledger that says why, with the company",
    rows.length === 1 && rows.every((l) => l.delta === spent.sal && l.reason === "Refund for a role that had closed" && l.company === "Refundco Alpha" && l.field === ""),
    rows,
  );
  eq("Gamma still has an open role, so Cy's company unlock stands", await credits("tok-cy"), 23);
  eq("the same scan again pays nothing twice", [(await scan(still, board(3), now - 8 * DAY)).refunded, await credits("tok-sal")], [0, 25]);

  // Beta is seen again after Mo's unlock, then goes. Mo bought it while it was up: no refund.
  await scan(still, board(3), now + DAY);
  await scan([C2, K], board(2), now + 12 * DAY);
  const s6 = await scan([C2, K], board(2), now + 13 * DAY);
  eq("an unlock made before the posting was last seen is not paid back", [s6.closed, s6.refunded, await credits("tok-mo")], [1, 0, 25 - spent.mo]);
}

/** ROB-9, ROB-11: one company, one record, whatever the suffix or the script. */
async function names() {
  const T0 = Date.parse("2026-09-01T06:00:00Z");
  const board = (matched: number) => [{ source: "board", fetched: 60, matched }];
  const first = await scan([sr("Casingco Labs", "Fractional VP Sales")], board(1), T0);
  eq("a new company is added once", [first.opened, first.companiesAdded], [1, 1]);
  const second = await scan([sr("Casingco Labs", "Fractional VP Sales"), sr("Casingco Labs, Inc.", "Fractional CMO"), sr("CASINGCO LABS (YC W24)", "Fractional Head of Growth")], board(3), T0 + DAY);
  eq("the same company with a legal suffix or a bracketed note is the same record", [second.opened, second.companiesAdded], [2, 0]);
  eq("  with all three roles on it", companyOf(await admin(), "Casingco Labs")?.engagements.length, 3);

  // No key from the board: the fallback key must not collapse names in other scripts into one.
  const noKey = (company: string, title: string) => sr(company, title, { key: "" });
  const third = await scan([noKey("Кириллица Компания", "Fractional VP Sales"), noKey("日本語の会社", "Fractional VP Sales"), noKey("شركة عربية", "Fractional VP Sales")], board(3), T0 + 2 * DAY);
  eq("companies named in Cyrillic, Japanese and Arabic with the same title are three companies and three roles", [third.opened, third.companiesAdded], [3, 3]);
  const accents = await scan([noKey("Société Générale Conseil", "Fractional CMO"), noKey("Societe Generale Conseil", "Fractional CMO")], board(2), T0 + 3 * DAY);
  eq("an accented and an unaccented spelling are one company and one role", [accents.opened, accents.companiesAdded], [1, 1]);
  const junk = await scan([noKey("!!!", "Fractional CMO"), noKey("🚀🚀", "Fractional CMO"), noKey("Realco Works", "???")], board(3), T0 + 4 * DAY);
  eq("a company or a title with no letter or digit is skipped", [junk.opened, junk.companiesAdded], [0, 0]);
  const host = await scan([sr("Some Other Name", "Fractional CMO", { domain: "https://WWW.CaseHost.Example.com/careers" })], board(1), T0 + 5 * DAY);
  eq("a website in another case, with a path, matches the company that has that host", [host.opened, host.companiesAdded, companyOf(await admin(), "Oldco Freight")?.engagements.length], [1, 0, 2]);
  const emoji = await scan([sr(`${"A".repeat(79)}🚀 Robotics`, `${"Fractional CMO ".repeat(8)}🚀`)], board(1), T0 + 6 * DAY);
  const stored = (await admin()).companies.find((c) => c.name.startsWith("AAAA"));
  eq("a name cut at its limit never ends in half a character", [emoji.opened, stored?.name.isWellFormed(), stored?.name.length], [1, true, 79]);
}

/** LOGIC-10 (repair round): a board that only ever lists one role. Its posting comes down, and the board answers with its usual listings and matches none. */
async function small() {
  const now = REAL_NOW;
  const one = sr("Smallco Labs", "Fractional VP Sales", { source: "tinyboard" });
  const tiny = (matched: number, fetched = 12) => [{ source: "tinyboard", fetched, matched }];
  const open0 = (await t.buildView("tok-mo")).scan!.openNow;
  eq("a board lists one role", (await scan([one], tiny(1), now - 20 * DAY)).opened, 1);
  const e = roleOf(await admin(), "Smallco Labs")!;
  const gone = await scan([], tiny(0), now - 10 * DAY);
  const v = await admin();
  eq(
    "the next week it answers 12 listings and none is that role: unseen, out of open now, nothing closes",
    [gone.closed, roleOf(v, "Smallco Labs")?.unseen, roleOf(v, "Smallco Labs")?.closed, (await t.buildView("tok-mo")).scan!.openNow - open0],
    [0, true, null, 0],
  );
  // A member buys it after the posting was gone.
  await unlockAll("tok-cy", [{ entity: "engagement", id: e.id, field: "posting" }]);
  eq("a member pays for it: the company, with its posting (2 credits)", await credits("tok-cy"), 23);
  const closed = await scan([], tiny(0), now + DAY);
  eq("the second answer without it closes it, and pays the member back (before, it stayed open for good)", [closed.closed, closed.refunded, roleOf(await admin(), "Smallco Labs")?.cells.status?.s === "value" && roleOf(await admin(), "Smallco Labs")?.cells.status.v, await credits("tok-cy")], [1, 1, "Closed", 25]);
  // A board with one listing that answers with far fewer listings than usual is not trusted to close anything.
  const other = sr("Othersmall Labs", "Fractional CMO", { source: "tinyboard2" });
  await scan([other], [{ source: "tinyboard2", fetched: 40, matched: 1 }], now + 2 * DAY);
  await scan([], [{ source: "tinyboard2", fetched: 5, matched: 0 }], now + 13 * DAY);
  const half = await scan([], [{ source: "tinyboard2", fetched: 5, matched: 0 }], now + 20 * DAY);
  eq("a small board that answers with a fraction of its usual listings closes nothing", [half.closed, roleOf(await admin(), "Othersmall Labs")?.closed, roleOf(await admin(), "Othersmall Labs")?.unseen], [0, null, true]);
}

/** N12 (repair round): This isn't me on a role whose posting has been gone a long while closes it, rather than bringing it back as open. */
async function claimgone() {
  const now = REAL_NOW;
  const role = sr("Claimgone Health", "Fractional CMO", { source: "boardG" });
  const keep = [1, 2, 3].map((i) => sr(`Claimkeep${i} Health`, "Fractional CMO", { source: "boardG" }));
  const board = (matched: number) => [{ source: "boardG", fetched: 40, matched }];
  await scan([role, ...keep], board(4), now - 30 * DAY);
  const v0 = await admin();
  const e = roleOf(v0, "Claimgone Health")!;
  const claim = await t.perform("tok-sal", { type: "add", company: "Claimgone Health", engagementId: e.id, operatorMemberId: "me", engagementFields: { operator: "Sal Sales" } } as never);
  eq("a member takes the open role and it closes", [!!claim.message, roleOf(await admin(), "Claimgone Health")?.cells.status?.s === "value" && roleOf(await admin(), "Claimgone Health")?.cells.status.v], [true, "Active"]);
  // Its posting comes down and stays down through two clean scans, two weeks apart.
  await scan(keep, board(3), now - 20 * DAY);
  await scan(keep, board(3), now - 6 * DAY);
  const not = await t.perform("tok-sal", { type: "notMine", engagementId: e.id });
  const after = roleOf(await admin(), "Claimgone Health");
  const forMo = (await t.buildView("tok-mo")).companies.find((c) => c.engagements.some((x) => x.id === e.id));
  eq(
    "then This isn't me closes it as the scan would have, instead of reopening it",
    [/open again/.test(not.message), after?.closed !== null, after?.cells.status?.s === "value" && after.cells.status.v, forMo?.hidden],
    // (Mo never unlocked the company: it stays locked for him, as every company is.)
    [false, true, "Closed", true],
  );
}

/**
 * A full-time job an older, looser screen let in (the Gong AE posting from We Work Remotely). When
 * a board lists it again and the screen now leaves it out, the scan's role is removed, not
 * closed, and every unlock of it is paid back. Roles from our records are not touched.
 */
async function notfractional() {
  const now = REAL_NOW;
  const wwr = "weworkremotely";
  // What the old screen let through: a full-time AE job, alone at its company, and one at a company with a real fractional role too.
  const G = sr("Gongish Revenue", "Commercial Account Executive", { source: wwr, url: "https://weworkremotely.com/remote-jobs/gongish-commercial-account-executive" });
  const H1 = sr("Halfway Health", "Commercial Account Executive", { source: wwr, url: "https://weworkremotely.com/remote-jobs/halfway-commercial-account-executive" });
  const H2 = sr("Halfway Health", "Fractional CMO", { source: wwr });
  const K = sr("Keepwell Labs", "Fractional VP Sales", { source: wwr });
  const old = await scan([G, H1, H2, K], [{ source: wwr, fetched: 40, matched: 4 }], now - 2 * DAY);
  eq("an old-style scan opened the full-time jobs with the rest", [old.opened, old.companiesAdded], [4, 3]);
  const v0 = await admin();
  const gco = companyOf(v0, "Gongish Revenue")!.id;
  const geng = roleOf(v0, "Gongish Revenue")!.id;
  const hco = companyOf(v0, "Halfway Health")!.id;
  const heng = roleOf(v0, "Halfway Health", 0)!.id; // opened first, before the CMO role
  // Sal buys the Gongish company, the AE job its only open role. Mo asks for Halfway's AE role and
  // posting, which is one purchase of the Halfway company. Cy buys the Keepwell company.
  await unlockAll("tok-sal", [{ entity: "company", id: gco, field: "identity" }, { entity: "engagement", id: geng, field: "role" }]);
  await unlockAll("tok-mo", [{ entity: "engagement", id: heng, field: "role" }, { entity: "engagement", id: heng, field: "posting" }]);
  await unlockAll("tok-cy", [{ entity: "company", id: companyOf(v0, "Keepwell Labs")!.id, field: "identity" }]);
  const spent = { sal: 25 - (await credits("tok-sal")), mo: 25 - (await credits("tok-mo")), cy: 25 - (await credits("tok-cy")) };
  eq("each of them paid for one company (2 credits)", spent, { sal: 2, mo: 2, cy: 2 });
  check("Mo's purchase was the Halfway company", (await t.buildView("tok-mo")).companies.find((c) => c.id === hco)?.unlocked === true);

  // The board lists all four again. The two AE postings fail the screen now.
  const ae = (company: string, url: string): ScanRawJob => ({
    kind: "listing",
    title: "Commercial Account Executive",
    company,
    url,
    source: wwr,
    postedAt: iso(now - 3 * DAY),
    description: "Own the full sales cycle and build pipeline. Be a trusted advisor to customers, run a consultative process and manage customer contracts. Remote, 3 days a week in our office.",
  });
  const fractional = (company: string, title: string): ScanRawJob => ({ kind: "listing", title, company, url: `https://jobs.example.com/${encodeURIComponent(company)}/${encodeURIComponent(title)}`, source: wwr, description: `${title} to lead marketing and sales.` });
  const listing = [ae("Gongish Revenue", G.url), ae("Halfway Health, Inc.", H1.url), fractional("Halfway Health", "Fractional CMO"), fractional("Keepwell Labs", "Fractional VP Sales")];
  const run = await t.runScan(undefined, { collect: () => collectOpenRoles({ sources: [{ name: wwr, fetchJobs: async () => listing }], now }), now: iso(now) });
  eq("the re-scan removes both, closes nothing and keeps the fractional roles open", [run.result.removed, run.result.closed, run.result.stillOpen, run.result.opened], [2, 0, 2, 0]);

  const v1 = await admin();
  eq("the company the scan added for the AE job is gone with it", companyOf(v1, "Gongish Revenue"), undefined);
  const halfway = companyOf(v1, "Halfway Health")?.engagements ?? [];
  eq("Halfway Health keeps only its fractional role, still open, and nothing of the AE job", [halfway.length, halfway[0]?.id === heng, halfway[0]?.closed ?? null], [1, false, null]);
  check("no role anywhere turned into Closed history", !v1.companies.some((c) => c.engagements.some((e) => e.closed || (e.cells.status?.s === "value" && e.cells.status.v === "Closed"))));
  const seedRole = roleOf(v1, "Seedrole Systems");
  eq("the role from our records is still there, still open", [!!seedRole, seedRole?.closed ?? null], [true, null]);
  eq("Sal has his credit back: the AE job was the Gongish company's only open role", await credits("tok-sal"), 25);
  eq("Halfway still has an open role, so Mo's company unlock stands, and Cy's Keepwell one too", [await credits("tok-mo"), await credits("tok-cy")], [23, 23]);
  const rows = (await t.buildView("tok-sal")).ledger.filter((l) => l.reason === "refund");
  check("the refund is a line in his ledger that says why", rows.length === 0 && (await t.buildView("tok-sal")).ledger.filter((l) => l.reason === "Refund for a full-time job we took off the list" && l.delta === 2).length === 1, (await t.buildView("tok-sal")).ledger);

  const again = await t.runScan(undefined, { collect: () => collectOpenRoles({ sources: [{ name: wwr, fetchJobs: async () => listing }], now: now + HOUR }), now: iso(now + HOUR) });
  eq("the same scan again removes nothing and pays nothing twice", [again.result.removed, again.result.refunded, await credits("tok-sal")], [0, 0, 25]);

  // A posting matched by its link alone, a seed role and a role a member took as their own are never removed.
  const L = sr("Linkonly Co", "Account Executive", { source: wwr, url: "https://weworkremotely.com/remote-jobs/linkonly-ae" });
  const M = sr("Mineco", "Commercial Account Executive", { source: wwr });
  await scan([L, M, H2, K], [{ source: wwr, fetched: 40, matched: 4 }], now + 2 * HOUR);
  const meng = roleOf(await admin(), "Mineco")!.id;
  await t.perform("tok-mo", { type: "add", company: "Mineco", engagementId: meng, operatorMemberId: "me", engagementFields: { operator: "Mo Marketing" } } as never);
  const r = await t.applyScan(
    {
      roles: [H2, K],
      sources: [{ source: wwr, fetched: 40, matched: 2 }],
      screenedOut: [
        { key: "linkonlyco::accountexecutiveremote", url: "https://www.weworkremotely.com/remote-jobs/linkonly-ae/", source: wwr },
        { key: "seed:e_seedrole_open", url: "", source: wwr },
        { key: roleKey("Seedrole Systems", "Fractional CRO"), url: "", source: wwr },
        { key: M.key, url: M.url, source: wwr },
      ],
    },
    iso(now + 3 * HOUR),
  );
  const v2 = await admin();
  eq("by its link alone it goes, the seed role and the taken seat stay", [r.removed, !!companyOf(v2, "Linkonly Co"), !!roleOf(v2, "Seedrole Systems"), !!roleOf(v2, "Mineco")], [1, false, true, true]);
  // Without a screenedOut list (an older caller), nothing is removed.
  const none = await t.applyScan({ roles: [H2, K], sources: [{ source: wwr, fetched: 40, matched: 2 }] }, iso(now + 4 * HOUR));
  eq("a scan result with no screened-out list removes nothing", none.removed, 0);
}

/**
 * The seniority bar (lib/seniority.ts): outside GTM, only Director and above. A table an earlier
 * screen filled: a scan-added staffing coordinator (its company unlocked by Sal), a bookkeeper
 * seat Mo took as her own, a fractional CFO, a GTM role, and an office coordinator a member added
 * by hand. The next scan takes off the coordinator alone, and new roles below the bar never open.
 */
async function seniority() {
  const now = REAL_NOW;
  const at = iso(now - 5 * DAY);
  const v = (value: string, by = "scan", extra: object = {}) => ({ value, by, at, status: "live", ...extra });
  const track = (engagementId: string, companyId: string) => ({ engagementId, companyId, firstSeen: at, lastSeen: at, closedAt: null, url: `https://jobs.example.com/${engagementId}`, source: "board", postedAt: null });
  const rows: [string, string, string, string, string][] = [
    // company id, company name, engagement id, title, function
    ["c_staff", "Brightpath Schools", "e_staff", "School Staffing Coordinator (Contract)", "Customer Success"],
    ["c_books", "Ledgerly", "e_books", "Contract Bookkeeper", "Other"],
    ["c_cfo", "Numbro", "e_cfo", "Fractional CFO", "Executive"],
    ["c_sales", "Keepco", "e_sales", "Fractional Account Executive", "Sales"],
  ];
  const state = {
    companies: [...rows.map(([id, name]) => ({ id, name, by: "scan", at })), { id: "c_office", name: "Officeworks Ltd", by: "m1", at }],
    engagements: [...rows.map(([, , id, , ]) => ({ id, companyId: rows.find((r) => r[2] === id)![0], by: "scan", at, source: "Demand scan" })), { id: "e_office", companyId: "c_office", by: "m1", at, source: "Member added" }],
    contacts: [],
    values: {
      ...Object.fromEntries(rows.flatMap(([, , id, title, fn]) => [[`${id}.role`, v(title)], [`${id}.function`, v(fn)], [`${id}.status`, v("Open role")], [`${id}.type`, v("Project")]])),
      "e_books.operator": v("Mo Marketing", "m2", { memberId: "m2" }),
      "e_office.role": v("Office Coordinator", "m1"),
      // The homepage lists a company only with its industry and revenue on file.
      "c_cfo.industry": v("SaaS", "m1"),
      "c_cfo.revenue": v("$5M–$20M", "m1"),
      "e_office.function": v("Operations", "m1"),
      "e_office.status": v("Open role", "m1"),
    },
    unlocks: { "c_staff.identity": ["m1"] },
    ledger: [{ memberId: "m1", delta: -1, reason: "unlock", ref: "c_staff.identity", at }],
    scan: { lastRunAt: at, sources: [], roles: Object.fromEntries(rows.map(([co, , id]) => [`key:${id}`, track(id, co)])) },
  };
  writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

  const v0 = await admin();
  eq("before any scan the view already leaves out the coordinator, and keeps the rest", [!!roleOf(v0, "Brightpath Schools"), !!roleOf(v0, "Ledgerly"), !!roleOf(v0, "Numbro"), !!roleOf(v0, "Keepco")], [false, true, true, true]);
  eq("Sal paid one credit for the Brightpath company", await credits("tok-sal"), 24);
  const { preview } = await import("../lib/preview");
  const ops = await preview({ fn: "Operations", view: "all" });
  // A member's own open role stays, whatever its level (the owner's rule); only the scan's are held to the bar.
  // (Officeworks has no industry or revenue on file, so the homepage doesn't list it either way.)
  void ops;
  const cs = await preview({ fn: "Customer Success", view: "all" });
  check("  nor the scan's coordinator", !cs.rows.some((r) => /coordinator/i.test(r.title)), cs.rows);
  // The CFO was filed under Executive by an older scan. Its title names Finance, so it is Finance now (remapScanFunctions, on load).
  const cfoFn = roleOf(v0, "Numbro")?.cells.function;
  eq("an open role an older scan filed under Executive takes the function its title names", cfoFn?.s === "value" ? cfoFn.v : cfoFn, "Finance");
  const fin = await preview({ fn: "Finance", view: "all" });
  check("  and the homepage keeps the fractional CFO, under Finance", fin.rows.some((r) => r.kind === "open"), fin.rows);
  const ex = await preview({ fn: "Executive", view: "all" });
  check("  and no longer under Executive", !ex.rows.some((r) => r.kind === "open"), ex.rows);

  // Run scan now: no board is read (RN_SCAN_TEST), and the removal pass still runs over what is on file.
  const run = await t.runScan(undefined, { now: iso(now) });
  eq("the scan removes the coordinator alone, for the seniority bar", [run.result.removed, run.result.removedBelowBar, run.result.closed], [1, 1, 0]);
  const v1 = await admin();
  eq("the company the scan added for it is gone", companyOf(v1, "Brightpath Schools"), undefined);
  eq("the seat Mo took, the CFO and the GTM role stay", [!!roleOf(v1, "Ledgerly"), !!roleOf(v1, "Numbro"), !!roleOf(v1, "Keepco")], [true, true, true]);
  check("the open role a member added stays on the table", !!companyOf(v1, "Officeworks Ltd")?.engagements.length);
  const seedRole = roleOf(v1, "Seedrole Systems");
  eq("the role from our records is still there", !!seedRole, true);
  eq("Sal has his credit back", await credits("tok-sal"), 25);
  check("his ledger says why", (await t.buildView("tok-sal")).ledger.some((l) => l.reason === "Refund for a role we took off the list" && l.delta === 1), (await t.buildView("tok-sal")).ledger);
  const again = await t.runScan(undefined, { now: iso(now + HOUR) });
  eq("the next scan removes nothing and pays nothing twice", [again.result.removed, again.result.refunded, await credits("tok-sal")], [0, 0, 25]);

  // New roles below the bar never open. Every other one does.
  const fresh = [
    sr("Newschool District", "School Staffing Coordinator (Contract)", { function: "Customer Success" }),
    sr("Codeworks", "Contract Software Engineer"),
    sr("Pixel Studio", "Art Director (freelance)"),
    sr("Cfoco", "Fractional CFO"),
    sr("Peoplefirst", "Interim Head of People"),
    sr("Countwell", "Fractional Controller"),
    sr("Aeco", "Fractional Account Executive", { function: "Sales" }),
    sr("Staffco", "Chief of Staff (fractional)"),
  ];
  const r = await scan(fresh, [{ source: "board", fetched: 20, matched: 8 }], now + 2 * HOUR);
  eq("of eight new roles, the three below the bar are left out", [r.opened, r.belowBar], [5, 3]);
  const v2 = await admin();
  eq("  and the five above it open", ["Cfoco", "Peoplefirst", "Countwell", "Aeco", "Staffco"].map((n) => !!roleOf(v2, n)), [true, true, true, true, true]);
  eq("  with no company added for the three", ["Newschool District", "Codeworks", "Pixel Studio"].map((n) => !!companyOf(v2, n)), [false, false, false]);
}

/**
 * Functions outside GTM (functionOf, storeScan and remapScanFunctions in lib/table.ts). An older
 * scan filed a Fractional CFO under Executive and stored a CTO and a Controller with no function.
 * On load, open roles the scan follows whose function is empty or Executive take the one their
 * title names. A function a member set, a role that closed and a Chief of Staff stay as they are,
 * and the second pass finds nothing. New roles keep the board's function when the table has it.
 */
async function functions() {
  const now = REAL_NOW;
  const at = iso(now - 3 * DAY);
  const v = (value: string, by = "scan") => ({ value, by, at, status: "live" });
  const track = (engagementId: string, companyId: string, closedAt: string | null = null) => ({ engagementId, companyId, firstSeen: at, lastSeen: at, closedAt, url: `https://jobs.example.com/${engagementId}`, source: "board", postedAt: null });
  // company id, company name, engagement id, title, function on file (null: none), who set it, closed
  const rows: [string, string, string, string, string | null, string, boolean][] = [
    ["c_fcfo", "Numberwise", "e_fcfo", "Fractional CFO", "Executive", "scan", false],
    ["c_fcto", "Stackwell", "e_fcto", "Fractional CTO", null, "scan", false],
    ["c_fctl", "Tallyford", "e_fctl", "Fractional Controller", "Executive", "m1", false],
    ["c_fcos", "Chiefly", "e_fcos", "Fractional Chief of Staff", "Executive", "scan", false],
    ["c_fcoo", "Opsgone", "e_fcoo", "Interim COO", "Executive", "scan", true],
    ["c_fgc", "Counselry", "e_fgc", "Fractional General Counsel", "Legal", "scan", false],
    ["c_fhop", "Peoplefirst", "e_fhop", "Fractional Head of People", "Other", "scan", false],
    ["c_fvps", "Salesfirst", "e_fvps", "Fractional VP Sales", null, "scan", false],
  ];
  const state = {
    companies: rows.map(([id, name]) => ({ id, name, by: "scan", at })),
    engagements: rows.map(([co, , id]) => ({ id, companyId: co, by: "scan", at, source: "Demand scan" })),
    contacts: [],
    verifications: {},
    values: Object.fromEntries(
      rows.flatMap(([, , id, title, fn, by, closed]) => [
        [`${id}.role`, v(title)],
        [`${id}.status`, v(closed ? "Closed" : "Open role")],
        ...(fn ? [[`${id}.function`, v(fn, by)]] : []),
      ]),
    ),
    unlocks: {},
    ledger: [],
    scan: { lastRunAt: at, sources: [], roles: Object.fromEntries(rows.map(([co, , id, , , , closed]) => [`key:${id}`, track(id, co, closed ? at : null)])) },
  };
  const before = JSON.parse(JSON.stringify(state));
  writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

  const fnOf = (view: View, name: string) => {
    const c = roleOf(view, name)?.cells.function;
    return c?.s === "value" ? c.v : c?.s ?? null;
  };
  const v0 = await admin();
  eq(
    "on load, open roles filed under Executive or with no function take the one their title names",
    ["Numberwise", "Stackwell"].map((n) => fnOf(v0, n)),
    ["Finance", "Technology"],
  );
  eq(
    "a function a member set, a Chief of Staff, a closed role and a function that isn't Executive stay as they were",
    ["Tallyford", "Chiefly", "Opsgone", "Counselry", "Peoplefirst"].map((n) => fnOf(v0, n)),
    ["Executive", "Executive", "Executive", "Legal", "Other"],
  );
  // A change writes the state, remapped functions included. A second pass over what was written changes nothing.
  await t.perform("tok-sal", { type: "follow", companyId: companyOf(v0, "Counselry")!.id, on: true });
  const written = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
  eq("the remapped functions are written with the next change, as the scan's", [written.values["e_fcfo.function"]?.value, written.values["e_fcfo.function"]?.by, written.values["e_fcto.function"]?.value], ["Finance", "scan", "Technology"]);
  eq("dated with the role, so the record doesn't read as just updated", written.values["e_fcfo.function"]?.at, at);
  eq("a GTM title with no function is left to the view, which reads it from the title", [written.values["e_fvps.function"], fnOf(v0, "Salesfirst")], [undefined, "Sales"]);
  const remap = t.remapScanFunctions as (s: unknown, seed: unknown) => number;
  eq("the first pass over the old state changes 2 roles", remap(before, seed), 2);
  eq("a second pass changes nothing", [remap(written, seed), written.values["e_fctl.function"]?.by], [0, "m1"]);

  // New roles: the board's function when it is one of the table's, else the title's. A board's Executive gives way to a title that names one.
  const res = await scan(
    [
      sr("Ledgerline", "Fractional CFO", { function: "Finance" }),
      sr("Kernelworks", "Fractional VP Engineering", { function: null }),
      sr("Rulebook Co", "Fractional General Counsel", { function: "Executive" }),
      sr("Opsway", "Interim COO", { function: "Operations" }),
      sr("Humanly", "Fractional Head of People", { function: "People" }),
      sr("Staffwise", "Fractional Chief of Staff", { function: "Executive" }),
      sr("Pipeline Partners Inc", "Fractional VP of Sales", { function: "Sales" }),
    ],
    [{ source: "board", fetched: 7, matched: 7 }],
    now,
  );
  eq("the scan opens all seven", res.opened, 7);
  const v1 = await admin();
  eq(
    "each keeps its function: Finance, Technology, Legal, Operations, People, Executive and Sales",
    ["Ledgerline", "Kernelworks", "Rulebook Co", "Opsway", "Humanly", "Staffwise", "Pipeline Partners Inc"].map((n) => fnOf(v1, n)),
    ["Finance", "Technology", "Legal", "Operations", "People", "Executive", "Sales"],
  );
  const { preview } = await import("../lib/preview");
  const fin = await preview({ fn: "Finance", view: "hiring" });
  check("the homepage counts the CFO as a Finance company hiring now", (fin.counts?.hiring ?? fin.rows?.filter((r) => r.kind === "open").length ?? 0) >= 1, { counts: fin.counts, rows: fin.rows?.length });
}

/** The Job posting link on file for a role, read from the saved state, without its scheme. */
function savedPosting(company: string, title: string): string | null {
  const st = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
  const co = st.companies.find((c: { name: string }) => c.name === company)?.id;
  const eng = st.engagements.find((e: { id: string; companyId: string }) => e.companyId === co && st.values[`${e.id}.role`]?.value === title)?.id;
  return eng ? String(st.values[`${eng}.posting`]?.value ?? "").replace(/^https?:\/\//, "") || null : null;
}

/** The posting check: a role whose every posting is clearly closed closes at once, with the usual refunds. */
async function postingcheck() {
  const T0 = REAL_NOW - 20 * DAY;
  const board = (matched: number) => [{ source: "board", fetched: 40, matched }];
  const gone = sr("Postco Gone", "Fractional VP Sales", { url: "https://gone.example.org/jobs/1" });
  const up = sr("Postco Up", "Fractional VP Sales", { url: "https://boards.greenhouse.io/postcoup/jobs/77" });
  const flaky = sr("Postco Flaky", "Fractional VP Sales", { url: "https://flaky.example.org/jobs/1" });
  const listed = sr("Postco Listed", "Fractional VP Sales", { url: "https://listed.example.org/jobs/1" });
  const filled = sr("Postco Filled", "Fractional CMO", { url: "https://filled.example.org/jobs/9" });
  await scan([gone, up, flaky, listed, filled], board(5), T0);
  const v = await admin();
  const idsOf = (name: string) => ({ co: companyOf(v, name)!.id, eng: roleOf(v, name)!.id });
  await unlockAll("tok-sal", [
    { entity: "company", id: idsOf("Postco Gone").co, field: "identity" },
    { entity: "engagement", id: idsOf("Postco Gone").eng, field: "posting" },
  ]);
  const spent = 25 - (await credits("tok-sal"));
  check("Sal paid for the gone role's company", spent >= 1, spent);

  const calls: string[] = [];
  const web: Record<string, { status: number; text?: string }> = {
    "https://gone.example.org/jobs/1": { status: 404 },
    "https://boards-api.greenhouse.io/v1/boards/postcoup/jobs/77": { status: 200, text: "{}" },
    "https://listed.example.org/jobs/1": { status: 404 },
    "https://filled.example.org/jobs/9": { status: 200, text: "<main><p>This position has been filled.</p></main>" },
    // flaky.example.org answers nothing: a network error.
  };
  const fetchPosting = async (url: string) => {
    calls.push(url);
    const p = web[url];
    return p ? { status: p.status, url, text: p.text ?? "" } : { status: 0, url, text: "" };
  };
  // A week later the board lists only one of them again.
  const at = REAL_NOW - 13 * DAY;
  const run = await t.runScan(undefined, { collect: async () => ({ roles: [listed], all: [listed], sources: board(1), seenKeys: [listed.key] }), now: iso(at), fetchPosting });
  eq("the scan alone closes nothing on one quiet run", run.result.closed, 0);
  eq("the posting check closes the 404 and the page that says filled", run.result.postingClosed, 2);
  check("  it never fetched the role the board listed on this run, or the seed's role", !calls.includes("https://listed.example.org/jobs/1") && calls.length === 4, calls);
  const v2 = await admin();
  const st = (name: string) => [roleOf(v2, name)?.closedAt ? "closed" : "open", roleOf(v2, name)?.cells.status?.s === "value" ? roleOf(v2, name)?.cells.status : null];
  eq(
    "closed at once with status Closed; the one still up and the one that did not answer stay open",
    ["Postco Gone", "Postco Filled", "Postco Up", "Postco Flaky", "Postco Listed", "Seedrole Systems"].map((n) => (roleOf(v2, n)?.closedAt ? "closed" : "open")),
    ["closed", "closed", "open", "open", "open", "open"],
  );
  eq("  with the close time of the check", roleOf(v2, "Postco Gone")?.closedAt, iso(at));
  void st;
  eq("unlocks made after the posting was last seen are paid back, as on any close (the company in full, one row)", [await credits("tok-sal"), run.result.refunded], [25, 1]);
  const rows = (await t.buildView("tok-sal")).ledger.filter((l) => l.reason === "Refund for a role that had closed");
  eq("  each one a ledger line", rows.map((l) => l.delta), [spent]);

  // The next run checks the ones left, the longest unchecked first, and never the closed ones again.
  calls.length = 0;
  const r2 = await t.checkOpenPostings({ fetch: fetchPosting, now: iso(at + DAY), max: 1 });
  eq("a budget of 1 checks one role: the one never checked comes first (the one listed last run, gone now)", [r2.roles, r2.fetches, r2.closed, calls], [1, 1, 1, ["https://listed.example.org/jobs/1"]]);
  check("  never a closed one", !calls.some((u) => u.includes("gone.example.org") || u.includes("filled.example.org")), calls);
  // Listed again on a board after the check closed it: it reopens, as a role whose posting came down does.
  const back = await scan([gone], board(1), at + 2 * DAY);
  eq("a role the check closed reopens when a board lists it again", [back.reopened, roleOf(await admin(), "Postco Gone")?.closedAt ?? null], [1, null]);
}

/** The same role from two boards, in one scan or across scans: one role with both links. */
async function intake() {
  const board = [{ source: "fractionaljobs", fetched: 10, matched: 1 }];
  const other = [{ source: "freehire", fetched: 10, matched: 1 }];
  const fj = sr("OpsBox", "Founding Commercial Lead", { url: "https://www.fractionaljobs.io/jobs/founding-commercial-lead-at-opsbox", source: "fractionaljobs", domain: "opsbox.example", function: "Sales" });
  const fh = sr("OpsBox", "Founding Commercial Lead (Fractional to Full Time), WMS / Supply Chain Software", { url: "https://jobs.ashbyhq.com/opsbox/6d3e1c1a-0000-4000-8000-0000000000aa", source: "freehire", function: "Sales" });
  const r1 = await scan([fj], board, REAL_NOW - 3 * DAY);
  const r2 = await scan([fh], other, REAL_NOW - 2 * DAY);
  eq("the second board's listing is the role already open, not a new one", [r1.opened, r2.opened, r2.stillOpen], [1, 0, 1]);
  const v = await admin();
  eq("one open role at OpsBox", companyOf(v, "OpsBox")?.engagements.filter((e) => e.source === "Demand scan").length, 1);
  const role = roleOf(v, "OpsBox");
  eq("  its Job posting link is the company's ATS, not the board", savedPosting("OpsBox", "Founding Commercial Lead"), "jobs.ashbyhq.com/opsbox/6d3e1c1a-0000-4000-8000-0000000000aa");
  eq("  and its title stays the first one", role?.cells.role?.s === "value" ? role.cells.role.v : null, "Founding Commercial Lead");
  const r3 = await scan([fj, fh], [...board, ...other], REAL_NOW - DAY);
  eq("both listed at once: still one role", [r3.opened, r3.stillOpen], [0, 1]);
  const vp = sr("OpsBox", "VP of Marketing", { function: "Marketing" });
  eq("another role at the same company opens on its own", (await scan([vp], board, REAL_NOW)).opened, 1);
}

/** Duplicates already in the state from before the scan matched them: merged once on load, credits paid back once. */
async function dupes() {
  const T = (d: number) => iso(REAL_NOW - d * DAY);
  const v = (value: string, at: string) => ({ value, by: "scan", at, status: "live" });
  const state = {
    // A second record of the company, from a board that gave no website: its copy of the role is merged too, and the record goes.
    companies: [{ id: "c_ops", name: "OpsBox", by: "scan", at: T(20) }, { id: "c_ops2", name: "OpsBox, Inc.", by: "scan", at: T(5) }],
    engagements: [
      { id: "e_fj", companyId: "c_ops", by: "scan", at: T(20), source: "Demand scan" },
      { id: "e_fh", companyId: "c_ops", by: "scan", at: T(10), source: "Demand scan" },
      { id: "e_other", companyId: "c_ops", by: "scan", at: T(10), source: "Demand scan" },
      { id: "e_dup2", companyId: "c_ops2", by: "scan", at: T(5), source: "Demand scan" },
    ],
    contacts: [],
    values: {
      "c_ops.website": v("opsbox.example", T(20)),
      "e_fj.role": v("Founding Commercial Lead", T(20)),
      "e_fj.function": v("Sales", T(20)),
      "e_fj.status": v("Open role", T(20)),
      "e_fj.posting": v("https://www.fractionaljobs.io/jobs/founding-commercial-lead-at-opsbox", T(20)),
      "e_fj.rate": v("$120/hr", T(20)),
      "e_fh.role": v("Founding Commercial Lead (Fractional to Full Time), WMS / Supply Chain Software", T(10)),
      "e_fh.function": v("Sales", T(10)),
      "e_fh.status": v("Open role", T(10)),
      "e_fh.posting": v("https://jobs.ashbyhq.com/opsbox/6d3e1c1a-0000-4000-8000-0000000000bb", T(10)),
      "e_other.role": v("Fractional CMO", T(10)),
      "e_other.function": v("Marketing", T(10)),
      "e_other.status": v("Open role", T(10)),
      "e_dup2.role": v("Fractional Founding Commercial Lead", T(5)),
      "e_dup2.function": v("Sales", T(5)),
      "e_dup2.status": v("Open role", T(5)),
      "e_dup2.posting": v("https://remotive.com/remote-jobs/sales/founding-commercial-lead-1", T(5)),
    },
    unlocks: { "c_ops.identity": ["m1", "m2"], "c_ops2.identity": ["m2", "m3"], "e_fj.posting": ["m1"], "e_fh.posting": ["m1", "m2"] },
    verifications: {},
    members: [],
    ledger: [
      { memberId: "m1", delta: -1, reason: "unlock", ref: "c_ops.identity", at: T(9) },
      { memberId: "m1", delta: -1, reason: "unlock", ref: "e_fj.posting", at: T(9) },
      { memberId: "m1", delta: -1, reason: "unlock", ref: "e_fh.posting", at: T(8) },
      { memberId: "m2", delta: -1, reason: "unlock", ref: "c_ops.identity", at: T(8) },
      { memberId: "m2", delta: -1, reason: "unlock", ref: "e_fh.posting", at: T(8) },
      { memberId: "m2", delta: -1, reason: "unlock", ref: "c_ops2.identity", at: T(4) },
      { memberId: "m3", delta: -1, reason: "unlock", ref: "c_ops2.identity", at: T(4) },
    ],
    profiles: {}, follows: {}, referralPaid: [], reportLog: [], held: [], benchRates: [], signals: [], notMine: {}, seen: {},
    scan: {
      lastRunAt: T(1),
      sources: [],
      roles: {
        "opsbox::foundingcommerciallead": { engagementId: "e_fj", companyId: "c_ops", firstSeen: T(20), lastSeen: T(15), closedAt: null, url: "https://www.fractionaljobs.io/jobs/founding-commercial-lead-at-opsbox", source: "fractionaljobs" },
        "opsbox::foundingcommercialleadfractionaltofulltimewmssupplychainsoftware": { engagementId: "e_fh", companyId: "c_ops", firstSeen: T(10), lastSeen: T(12), closedAt: null, url: "https://jobs.ashbyhq.com/opsbox/6d3e1c1a-0000-4000-8000-0000000000bb", source: "freehire" },
        "opsboxinc::fractionalfoundingcommerciallead": { engagementId: "e_dup2", companyId: "c_ops2", firstSeen: T(5), lastSeen: T(13), closedAt: null, url: "https://remotive.com/remote-jobs/sales/founding-commercial-lead-1", source: "remotive" },
        "opsbox::fractionalcmo": { engagementId: "e_other", companyId: "c_ops", firstSeen: T(10), lastSeen: T(12), closedAt: null, url: "https://x.example.org/cmo", source: "freehire" },
      },
    },
    digest: { lastSentAt: null, sent: 0, members: {} },
    flags: { starterFloor: 25 },
  };
  writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));
  const view = await admin();
  const roles = companyOf(view, "OpsBox")?.engagements.filter((e) => e.source === "Demand scan") ?? [];
  const titleOf = (e: EngagementRec) => (e.cells.role?.s === "value" ? e.cells.role.v : "");
  eq("on load the two copies are one role, and the other role at the company stays", roles.map(titleOf).sort(), ["Founding Commercial Lead", "Fractional CMO"]);
  const kept = roles.find((e) => titleOf(e) === "Founding Commercial Lead");
  eq("  the survivor keeps the earliest first-seen date", kept?.openedAt, T(20));
  eq("  and the latest sighting", kept?.lastSeen, T(12));
  const posting = (tok: string) => t.buildView(tok).then((x) => {
    const e = x.companies.find((c) => c.name === "OpsBox")?.engagements.find((y) => y.cells.role?.s === "value" && y.cells.role.v === "Founding Commercial Lead");
    return e?.cells.posting?.s;
  });
  eq("members who unlocked either copy see the survivor's posting", [await posting("tok-sal"), await posting("tok-mo")], ["value", "value"]);
  eq("Sal, who paid for both, gets one credit back; Mo, who paid for one copy and both company records, gets the second record's back", [await credits("tok-sal"), await credits("tok-mo")], [25 - 2, 25 - 2]);
  eq("Cy, who unlocked only the second record, keeps the company and pays nothing more", [await credits("tok-cy"), companyOf(await t.buildView("tok-cy"), "OpsBox")?.engagements.length ? "sees it" : "hidden"], [24, "sees it"]);
  eq("the second record is gone", [companyOf(view, "OpsBox, Inc."), (await t.buildView("tok-mo")).ledger.filter((l) => l.reason === "Refund for the same role listed twice").length], [undefined, 1]);
  const rows = (await t.buildView("tok-sal")).ledger.filter((l) => l.reason === "Refund for the same role listed twice");
  eq("  with a clear ledger line naming the company", rows.map((l) => [l.delta, l.company]), [[1, "OpsBox"]]);
  const again = await scan([], [{ source: "freehire", fetched: 0, matched: 0, error: "down" }], REAL_NOW);
  eq("a scan after it merges nothing more and pays nothing twice", [again.merged ?? 0, await credits("tok-sal")], [0, 23]);
  const saved = JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
  const track = Object.values(saved.scan.roles as Record<string, { engagementId: string; urls?: string[] }>).find((r) => r.engagementId === "e_fj");
  eq("the survivor keeps all three posting links", track?.urls?.length, 3);
  eq("  its Job posting link is the company's own ATS", savedPosting("OpsBox", "Founding Commercial Lead"), "jobs.ashbyhq.com/opsbox/6d3e1c1a-0000-4000-8000-0000000000bb");
  eq("the copy's record and facts are gone", [saved.engagements.some((e: { id: string }) => e.id === "e_fh"), Object.keys(saved.values).some((k) => k.startsWith("e_fh."))], [false, false]);
  // The role closes later: the purchases that stand are paid back once each, the one settled on merge is not.
  const close = await t.checkOpenPostings({
    fetch: async (url) => ({ status: url.includes("ashbyhq") ? 200 : 404, url, text: url.includes("ashbyhq") ? JSON.stringify({ jobs: [] }) : "" }),
    now: iso(REAL_NOW + HOUR),
  });
  eq("when the merged role closes, its standing unlocks made after it was last seen are paid back", close.closed, 2);
  eq("  Sal and Mo end with every credit back, never more", [await credits("tok-sal"), await credits("tok-mo")], [25, 25]);
}

/** Career pages of companies on Merlin: discovery, the cache, the feeds and the screen, with fetches of our own. */
async function careers() {
  const at = REAL_NOW;
  // A company on Merlin with a website, through a scan of a board.
  await scan([sr("Kestrel Freight", "Fractional VP Sales", { domain: "kestrelfreight.example" })], [{ source: "board", fetched: 5, matched: 1 }], at - DAY);
  const feeds: Record<string, { status: number; body: unknown }> = {
    "https://boards-api.greenhouse.io/v1/boards/kestrelfreight": { status: 200, body: { name: "Kestrel Freight" } },
    "https://boards-api.greenhouse.io/v1/boards/kestrelfreight/jobs?content=true": {
      status: 200,
      body: { jobs: [{ title: "Fractional Head of Marketing", absolute_url: "https://boards.greenhouse.io/kestrelfreight/jobs/9", first_published: iso(at - 2 * DAY), content: "&lt;p&gt;A fractional head of marketing, 15 hours a week.&lt;/p&gt;" }, { title: "Warehouse Associate", absolute_url: "https://boards.greenhouse.io/kestrelfreight/jobs/10", first_published: iso(at - 2 * DAY), content: "Full-time with benefits." }] },
    },
  };
  const calls: string[] = [];
  const feed = async (url: string) => {
    calls.push(url);
    const f = feeds[url];
    return f ? { status: f.status, text: JSON.stringify(f.body) } : { status: 404, text: "" };
  };
  const site = async () => ({ status: 0, text: "" });
  const c1 = await t.careerSources({ feed, site, now: at });
  eq("discovery finds the company's Greenhouse board and makes it a source", c1.sources.map((x) => x.name), ["careers:greenhouse"]);
  const saved = await c1.save();
  eq("  and keeps what it learned", [saved.tried, saved.found], [2, 1]);
  const found = await collectOpenRoles({ sources: c1.sources, now: at });
  const r = await t.applyScan({ roles: found.all, sources: found.sources }, iso(at));
  eq("the feed's fractional role opens at the company already on Merlin; the full-time one is left out", [r.opened, r.companiesAdded], [1, 0]);
  const v = await admin();
  eq("  filed under it", companyOf(v, "Kestrel Freight")?.engagements.filter((e) => e.source === "Demand scan").length, 2);
  calls.length = 0;
  const c2 = await t.careerSources({ feed, site, now: at + DAY });
  await c2.save();
  check("the next run looks nobody up again: the board and the miss are cached", !calls.length && c2.sources.length === 1, calls);
  const c3 = await t.careerSources({ feed, site, now: at + 31 * DAY });
  check("  a miss is looked up again after a month", calls.length > 0 && c3.sources.length === 1, calls);
}

const SCENARIOS: Record<string, () => Promise<void>> = { cap, health, baseline, dates, refunds, names, small, claimgone, notfractional, seniority, functions, postingcheck, intake, dupes, careers };
const name = process.argv[2] ?? "";
try {
  if (!SCENARIOS[name]) throw new Error(`unknown scenario "${name}". One of: ${Object.keys(SCENARIOS).join(", ")}`);
  await SCENARIOS[name]();
} catch (e) {
  check(`scenario ${name} ran to the end`, false, String((e as Error)?.stack ?? e).slice(0, 800));
}
rmSync(dir, { recursive: true, force: true });
console.log(`##RESULT ${passed} ${failed}`);
process.exit(0);
