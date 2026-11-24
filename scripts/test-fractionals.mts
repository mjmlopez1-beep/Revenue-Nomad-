/**
 * Checks of Fractionals: one record per fractional (lib/fractionalsCore.ts, lib/fractionals.ts,
 * lib/table.ts personIndex and the actions unlockFractional and activate), the directory's filters
 * (app/post/fractionalsModel.ts), and the nav after the move (app/post/navModel.ts). No server:
 * lib/table.ts runs in process on a made-up seed and seed key in a temporary data dir, billing live
 * with made-up Stripe settings, fetch replaced, so nothing leaves the machine. Every person is made up.
 *
 *   npx tsx scripts/test-fractionals.mts      exits 1 on any failure
 *
 * Covered:
 *  - grouping: a member's seats together, seats with one person key together, a named seat with
 *    neither on its own, never two seats by name alone, never two members, never a seat a member
 *    refused; levels, the clients line and the profile fit;
 *  - who shows and how: a member shown in the directory (full name, seats free), one who hasn't
 *    chosen (first name and last initial), one who said no (left out), someone not on Merlin yet
 *    (locked: no name, first name or initials in the answer), the switch and Me.fractionals;
 *  - fellow fractionals are free (PEERS_FREE): Unlock on Fractionals spends nothing on any plan (out
 *    of credits and at the limits too), who held a seat shows free at a company the member sees and
 *    waits for a locked one, a role bought before still marks the record, no holderKey, no spread,
 *    and a name taken off gives back what was paid under the old rules;
 *  - invites and activation: the activation page (who's waiting, the seats, one company named),
 *    claiming every ticked seat past the daily claim limit, a conversation with each inviter, the
 *    new member's bonus once, each inviter's, and the cap on inviters paid for one activation;
 *  - Not mine, This isn't me, Remove my name on a fractional's link;
 *  - an old one-seat claim link reads and claims as before;
 *  - Referral partners' links open Fractionals with Different from yours; the rename to Decision makers;
 *  - no person key in any answer: the table, the directory, Home's line, the claim page, the
 *    connector, the export.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-fractionals-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const ahead = (ms: number) => new Date(t0 + ms).toISOString();
const TEST_KEY = Buffer.alloc(32, 9).toString("base64");

// Person keys: made up, but shaped as the importer writes them ("p_" + 20 hex).
const K = { gus: "p_9a59a59a59a59a59a07", sam: "p_5a5a5a5a5a5a5a5a5a01", lee: "p_1e1e1e1e1e1e1e1e1e02", cara: "p_ca2aca2aca2aca2aca03", rae: "p_2ae02ae02ae02ae02a04", nia: "p_0a1a0a1a0a1a0a1a0a05", theo: "p_7e07e07e07e07e07e06" };

const co = (id: string, name: string, industry: string, employees: string, revenue: string, hq: string) => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry, employees, revenue, hq } });
const companies = [
  co("c_kite", "Kitebright", "SaaS", "51–200", "$5M–$20M", "Denver, CO"),
  co("c_pollen", "Pollen Ledger", "Fintech", "51–200", "$5M–$20M", "Boston, MA"),
  co("c_bright", "Brightloom Learning", "SaaS", "51–200", "$1M–$5M", "Raleigh, NC"),
  co("c_vellum", "Vellum Insurance", "Insurance", "51–200", "$5M–$20M", "Hartford, CT"),
  co("c_orchard", "Orchard Lane Software", "SaaS", "201–500", "$20M–$50M", "Chicago, IL"),
  co("c_moon", "Moonridge Analytics", "SaaS", "51–200", "$5M–$20M", "Seattle, WA"),
  co("c_tide", "Tidemark Pay", "Fintech", "51–200", "$5M–$20M", "Charlotte, NC"),
  co("c_lantern", "Lanternfield Data", "SaaS", "51–200", "$5M–$20M", "Pittsburgh, PA"),
  co("c_cara", "Copperline Pay", "Fintech", "11–50", "$1M–$5M", "Austin, TX"),
  co("c_rae", "Sundial Metrics", "SaaS", "51–200", "$5M–$20M", "Minneapolis, MN"),
  co("c_nia", "Quarry Bay Software", "SaaS", "11–50", "$1M–$5M", "Portland, OR"),
  co("c_north", "Northwind Health", "Health Care", "201–500", "$20M–$50M", "Toronto, ON"),
  co("c_gus1", "Glenrock Data", "SaaS", "51–200", "$5M–$20M", "Omaha, NE"),
  co("c_gus2", "Gullwing Pay", "Fintech", "51–200", "$5M–$20M", "Tampa, FL"),
];
const seat = (id: string, companyId: string, operator: string | null, role: string, fn: string, start: string, status: "Active" | "Ended", extra: Record<string, unknown> = {}) => ({
  id,
  companyId,
  verified: false,
  fields: { source: extra.source ?? "Seat scan", ...(operator ? { operator } : {}), role, function: fn, type: "Fractional", start, status, end: status === "Active" ? "Ongoing" : "2025" },
  ...(extra.pub === false ? {} : operator && (extra.source ?? "Seat scan") === "Seat scan" ? { holderFrom: "public profile" } : {}),
  ...(extra.key ? { holderKey: extra.key } : {}),
});
const engagements = [
  // Sam Brennick: three seats, one person key, not on Merlin.
  seat("e_sam_pollen", "c_pollen", "Sam Brennick", "Fractional Head of RevOps", "RevOps", "2026-02", "Active", { key: K.sam }),
  seat("e_sam_bright", "c_bright", "Sam Brennick", "Fractional Head of RevOps", "RevOps", "2024-03", "Ended", { key: K.sam }),
  seat("e_sam_vellum", "c_vellum", "Sam Brennick", "Fractional RevOps Lead", "RevOps", "2023-04", "Ended", { key: K.sam }),
  // Pat Quill: the same name on two seats and no key: two records, never merged by name.
  seat("e_pat_a", "c_orchard", "Pat Quill", "Fractional VP Sales", "Sales", "2025-01", "Active"),
  seat("e_pat_b", "c_kite", "Pat Quill", "Fractional VP Sales", "Sales", "2022-01", "Ended"),
  // Lee Single: one seat with a key.
  seat("e_lee_one", "c_lantern", "Lee Single", "Fractional CFO", "Finance", "2025-06", "Active", { key: K.lee }),
  // Members: Dana (shown in the directory), Theo (hasn't chosen), Ines (said no), Nell (never signed in).
  seat("e_dana_kite", "c_kite", "Dana Whitfield", "Fractional CFO", "Finance", "2025-03", "Active", { source: "Member success story" }),
  seat("e_dana_moon", "c_moon", "Dana Whitfield", "Fractional CFO", "Finance", "2023-02", "Ended", { source: "Member success story" }),
  seat("e_theo_moon", "c_moon", "Theo Wrenshaw", "Fractional CRO", "Sales", "2025-09", "Active", { source: "Member success story", key: K.theo }),
  // A seat of Theo's from the seat files, his key on it: it joins his record.
  seat("e_theo_tide", "c_tide", "Theo Wrenshaw", "Fractional VP Sales", "Sales", "2022-05", "Ended", { key: K.theo }),
  seat("e_ines_tide", "c_tide", "Ines Calderwood", "Fractional COO", "Operations", "2025-01", "Active", { source: "Member success story" }),
  seat("e_nell_north", "c_north", "Nell Neversigned", "Fractional CMO", "Marketing", "2024-01", "Active", { source: "Member success story" }),
  // Cara: two seats, seven members invited her (the cap on inviters paid).
  seat("e_cara_1", "c_cara", "Cara Manyinvites", "Fractional CMO", "Marketing", "2025-02", "Active", { key: K.cara }),
  seat("e_cara_2", "c_kite", "Cara Manyinvites", "Fractional CMO", "Marketing", "2021-02", "Ended", { key: K.cara }),
  // Rae: two seats, for Remove my name and its refunds.
  seat("e_rae_1", "c_rae", "Rae Removable", "Fractional VP Marketing", "Marketing", "2025-02", "Active", { key: K.rae }),
  seat("e_rae_2", "c_orchard", "Rae Removable", "Fractional VP Marketing", "Marketing", "2023-02", "Ended", { key: K.rae }),
  // Nia: three seats, for Not mine and an unticked seat.
  seat("e_nia_1", "c_nia", "Nia Notmine", "Fractional Head of Growth", "Growth", "2025-02", "Active", { key: K.nia }),
  seat("e_nia_2", "c_lantern", "Nia Notmine", "Fractional Head of Growth", "Growth", "2023-02", "Ended", { key: K.nia }),
  seat("e_nia_3", "c_north", "Nia Notmine", "Fractional Growth Lead", "Growth", "2021-02", "Ended", { key: K.nia }),
  // Gus: two seats with one key, both at companies Robin knows (two seats of one fractional in one request).
  seat("e_gus_1", "c_gus1", "Gus Twoseat", "Fractional VP Sales", "Sales", "2025-04", "Active", { key: K.gus }),
  seat("e_gus_2", "c_gus2", "Gus Twoseat", "Fractional VP Sales", "Sales", "2023-04", "Ended", { key: K.gus }),
  // A seat with nobody named: no record.
  seat("e_nobody", "c_bright", null, "Fractional CMO", "Marketing", "2024-02", "Ended"),
];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}@example.com`, title, token: `tok-${id}` });
const members = [
  M("mem_robin", "Robin Kearney", "Fractional CMO"),
  M("mem_mo", "Mo Lindqvist", "Fractional VP Sales"),
  M("mem_zoe", "Zoe Okafor", "Fractional CRO"),
  M("mem_dana", "Dana Whitfield", "Fractional CFO"),
  M("mem_theo", "Theo Wrenshaw", "Fractional CRO"),
  M("mem_ines", "Ines Calderwood", "Fractional COO"),
  M("mem_nell", "Nell Neversigned", "Fractional CMO"),
  M("mem_pip", "Pip Poorly", "Fractional CMO"),
  M("mem_bo", "Bo Busy", "Fractional CMO"),
  M("mem_fay", "Fay Free", "Fractional CMO"),
  M("mem_tia", "Tia Trial", "Fractional CMO"),
  M("mem_pru", "Pru Pro", "Fractional CMO"),
  // Cass's Crystal Ball has three of Sam's companies (she opened one of them) and one of Dana's.
  M("mem_cass", "Cass Crystal", "Fractional CMO"),
  ...[1, 2, 3, 4, 5, 6, 7].map((n) => M(`mem_inv${n}`, `Ivo Inviter${["", "one", "two", "three", "four", "five", "six", "seven"][n]}`, "Fractional COO")),
];
const seed = { builtAt: ago(30 * DAY), members, companies, engagements, contacts: [] };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const signedInIds = members.map((m) => m.id).filter((id) => id !== "mem_nell");
const unlock = (memberId: string, ref: string, delta: number, at = ago(10 * DAY)) => ({ memberId, delta, reason: "unlock", ref, at });
const ledger = [
  unlock("mem_robin", "c_bright.identity", -2),
  unlock("mem_robin", "c_kite.identity", -2),
  unlock("mem_robin", "c_orchard.identity", -2),
  unlock("mem_robin", "c_lantern.identity", -2),
  unlock("mem_robin", "c_gus1.identity", -2),
  unlock("mem_robin", "c_gus2.identity", -2),
  unlock("mem_mo", "c_bright.identity", -2),
  unlock("mem_cass", "c_bright.identity", -2),
  unlock("mem_mo", "c_moon.identity", -2),
  // Mo bought the role half of Pat's Kitebright seat long ago (the bundle's other half).
  unlock("mem_mo", "c_kite.identity", -2),
  unlock("mem_mo", "e_pat_b.role", -1),
  // Robin paid to see who held Rae's Orchard seat and Lee's Lanternfield seat under the old rules (before fellow fractionals were free).
  unlock("mem_robin", "e_rae_2.operator", -1),
  unlock("mem_robin", "e_lee_one.operator", -1),
  // Pip is out of credits; Bo used today's 100 unlocks.
  { memberId: "mem_pip", delta: -25, reason: "adjust", ref: "starter.floor", at: ago(20 * DAY) },
  { memberId: "mem_bo", delta: 200, reason: "topup", ref: "topup.bo", at: ago(5 * DAY) },
  ...Array.from({ length: 100 }, (_, n) => unlock("mem_bo", `c_x${n}.identity`, -1, ago(HOUR))),
  // The inviters each unlocked Cara's first seat's company and who held it.
  ...[1, 2, 3, 4, 5, 6, 7].flatMap((n) => [unlock(`mem_inv${n}`, "c_cara.identity", -2), unlock(`mem_inv${n}`, "e_cara_1.operator", -1)]),
];
const unlocks: Record<string, string[]> = {};
for (const l of ledger) if (l.reason === "unlock" && !l.ref.startsWith("c_x")) (unlocks[l.ref] ??= []).push(l.memberId);
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger,
    values: {},
    unlocks,
    seen: Object.fromEntries(signedInIds.map((id) => [id, ago(HOUR)])),
    profiles: {
      ...Object.fromEntries(signedInIds.map((id) => [id, { onboarded: true }])),
      mem_robin: { onboarded: true, function: "Marketing", title: "Fractional CMO", icp: { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: ["United States"] } },
      mem_mo: { onboarded: true, function: "Sales", title: "Fractional VP Sales" },
      mem_dana: { onboarded: true, function: "Finance", title: "Fractional CFO", fractionals: true, icp: { industries: ["SaaS", "Fintech"], employees: ["51–200"], revenue: [], countries: ["United States"] } },
      mem_theo: { onboarded: true, function: "Sales", title: "Fractional CRO" },
      mem_ines: { onboarded: true, function: "Operations", fractionals: false },
    },
    // A member who joined today, with credits to spare: the first day's unlock limit.
    members: [{ id: "j_jo", name: "Jo Newcomer", email: "jo.new@example.com", title: "", token: "tok-jo", at: ago(HOUR), ipHash: "jojojojojojojojo" }],
    // Cass's Crystal Ball today (lib/radar's kept rows): companies only, nothing about anyone in them.
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: { mem_cass: { sent: {}, days: { [ahead(0).slice(0, 10)]: ["c_pollen", "c_bright", "c_vellum", "c_kite"].map((c) => ({ k: `t:mem_cass:${c}`, c, kind: "adjacent", l: "Hired a fractional CRO 2 months ago", b: "High", w: "Fractional CRO hired 2 months ago" })) } } },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
    seatInvites: [1, 2, 3, 4, 5, 6, 7].map((n) => ({ by: `mem_inv${n}`, engagementId: "e_cara_1", at: ago((10 - n) * DAY), note: `Hi Cara, it's Ivo ${n}. https://post.example.com/claim/x` })),
    billing: {
      members: {
        mem_tia: { trialStartedAt: ago(2 * DAY), trialEndsAt: ahead(12 * DAY) },
        mem_pru: { proUntil: ahead(20 * DAY), paidSince: ago(10 * DAY), interval: "month" },
      },
      events: [],
      payments: [],
      ended: [],
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-fr@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_fractionals",
  STRIPE_WEBHOOK_SECRET: "whsec_test_fractionals",
  STRIPE_PRICE_MONTH: "price_month_fractionals",
  STRIPE_PRICE_YEAR: "price_year_fractionals",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_FREE_COMPANY", "RN_GOOGLE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const keysIn = (text: string) => Object.values(K).filter((k) => text.includes(k));
const same3 = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const core = await import("../lib/fractionalsCore");
  const t = await import("../lib/table");
  const fr = await import("../lib/fractionals");
  const tools = await import("../lib/mcp/tools");
  const { claimToken } = await import("../lib/claimToken");
  const fm = await import("../app/post/fractionalsModel");
  const nav = await import("../app/post/navModel");
  const model = await import("../app/post/model");
  const { PLACE_PAGES } = await import("../app/post/place");
  const pub = t.tableInternals.pubId;
  const BASE = "https://post.example.com";
  const tok = (id: string) => (id === "j_jo" ? "tok-jo" : `tok-${id}`);

  /* ---------- 1. pure: grouping, levels, clients ---------- */
  console.log("\nGrouping");
  {
    const g = core.groupSeats([
      { id: "a", member: "m1", key: null },
      { id: "b", member: "m1", key: null },
      { id: "c", member: null, key: "k1" },
      { id: "d", member: null, key: "k1" },
      { id: "e", member: null, key: null },
      { id: "f", member: null, key: null },
    ]);
    const same = (x: string, y: string) => g.groupOf.get(x) === g.groupOf.get(y);
    check("a member's seats are one record", same("a", "b"));
    check("seats with one person key are one record", same("c", "d") && !same("a", "c"));
    check("a named seat with neither is a record of its own", !same("e", "f") && !same("e", "a") && g.groups.length === 4, g.groups);
    const h = core.groupSeats([
      { id: "x", member: "m1", key: "k" },
      { id: "y", member: null, key: "k" },
      { id: "z", member: "m2", key: "k" },
    ]);
    check("a key joins a member's claimed seat and the rest of that person's seats", h.groupOf.get("x") === h.groupOf.get("y"));
    check("a key never puts two members in one record", h.groupOf.get("x") !== h.groupOf.get("z"));
    const r = core.groupSeats(
      [
        { id: "y", member: null, key: "k" },
        { id: "x", member: "m1", key: "k" },
      ],
      (m, id) => m === "m1" && id === "y",
    );
    check("a seat the member said isn't theirs never joins them through a key", r.groupOf.get("x") !== r.groupOf.get("y"));
    check("levels read from titles", core.levelOf("Fractional CFO") === "C-level" && core.levelOf("Fractional VP Sales") === "VP" && core.levelOf("Head of RevOps") === "Head" && core.levelOf("Fractional Marketing Director") === "Head" && core.levelOf("Fractional Growth Lead") === "Lead" && core.levelOf("Fractional Finance Manager") === null);
    const c = core.clientsFromSeats([
      { industry: "SaaS", employees: "51–200", revenue: null, country: "United States" },
      { industry: "Fintech", employees: "51–200", revenue: null, country: "United States" },
      { industry: "SaaS", employees: "11–50", revenue: null, country: "Canada" },
      { industry: "Insurance", employees: null, revenue: null, country: null },
    ]);
    check("the clients line is one line: two industries and a count, the most common size, the places", core.clientsLine(c) === "SaaS, Fintech +1 · 51–200 · US, Canada", core.clientsLine(c));
    const icp = { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: ["United States"] };
    check("fits: a seat's company that matches and conflicts with nothing", core.fitsIcp(icp, null, [{ industry: "SaaS", employees: "201–500", revenue: null, country: null }]) === false && core.fitsIcp(icp, null, [{ industry: "SaaS", employees: "51–200", revenue: null, country: "United States" }]));
    check("fits: what a member states overlaps on every part both name", core.fitsIcp(icp, core.clientsFromIcp({ industries: ["SaaS", "Fintech"], employees: [], revenue: [], countries: ["United States"] }), []) && !core.fitsIcp(icp, core.clientsFromIcp({ industries: ["Retail"], employees: [], revenue: [], countries: [] }), []));
    check("a member who hasn't chosen shows as first name and last initial", core.shortName("Theo van Wrenshaw") === "Theo W.");
  }

  /* ---------- 2. the directory ---------- */
  console.log("\nThe directory");
  const ROBIN = tok("mem_robin");
  const dirOf = async (who: string) => (await fr.fractionalsView(tok(who)))!;
  const recOf = (d: Awaited<ReturnType<typeof dirOf>>, seatId: string) => d.records.find((r) => r.seats.some((s) => s.id === pub(seatId)));
  let d = await dirOf("mem_robin");
  const sam = recOf(d, "e_sam_pollen")!;
  check("Sam's three seats, one person key, are one record", !!sam && sam.seats.length === 3 && sam.now === 1 && sam.past === 2, sam);
  // Decision 2 (PEERS_FREE): someone not on Merlin yet shows by full name in the directory, free.
  check("someone not on Merlin yet shows by full name, free", !!sam && !sam.locked && sam.name === "Sam Brennick" && sam.initials === "SB" && !sam.onMerlin && !sam.unlocked, sam);
  check("a member who hasn't chosen still shows short (their privacy default)", !/Wrenshaw/.test(JSON.stringify(d)));
  check("function and level are free, read from the titles", sam.fn === "RevOps" && sam.level === "Head", [sam.fn, sam.level]);
  check("the clients they serve, read from their seats, as one line", sam.clients?.from === "seats" && sam.clients.line.startsWith("Fintech") && sam.fits === true, sam.clients);
  check("Pat's two seats with one name and no key stay two records", recOf(d, "e_pat_a")!.id !== recOf(d, "e_pat_b")!.id);
  const dana = recOf(d, "e_dana_kite")!;
  check("a member shown in the directory: full name, on Merlin, one record for both seats, what she states", dana?.name === "Dana Whitfield" && dana.onMerlin && !dana.locked && dana.seats.length === 2 && dana.clients?.from === "stated" && !!dana.memberId, dana);
  const theo = recOf(d, "e_theo_moon")!;
  check("a member who hasn't chosen: first name and last initial", theo?.name === "Theo W." && theo.onMerlin && !JSON.stringify(theo).includes("Wrenshaw"), theo);
  check("a member's seat and a seat file's seat with his key are one record", theo.seats.length === 2 && recOf(d, "e_theo_tide")?.id === theo.id);
  check("a member who said no is left out entirely", !recOf(d, "e_ines_tide"));
  // Owner default (Stage 6): out of the directory is out of the list entirely. No row, no count, no function, level or seat numbers.
  check("a member who said no has no row at all: nothing counts or names her", d.records.every((r) => r.memberId !== pub("mem_ines") && !r.id.startsWith("h_")) && !/Calderwood|Ines/.test(JSON.stringify(d)) && !d.records.some((r) => !r.you && !r.name && r.fn === "Operations" && r.level === "C-level" && r.onMerlin));
  const nell = recOf(d, "e_nell_north")!;
  check("a member who never signed in reads as Not on Merlin yet, named", !!nell && !nell.onMerlin && !nell.locked && nell.name === "Nell Neversigned");
  check("a seat with nobody named makes no record", !recOf(d, "e_nobody"));
  check("no person key in the directory", keysIn(JSON.stringify(d)).length === 0);
  check("the viewer's function comes with it (Different from yours)", d.fn === "Marketing");
  // The table: Dana's name is free on her seats for every member; Theo's stays behind its lock.
  let rv = await t.buildView(ROBIN);
  const engCell = (v: Awaited<ReturnType<typeof t.buildView>>, seatId: string, f: string) => v.companies.flatMap((c) => c.engagements).find((e) => e.id === pub(seatId))!.cells[f];
  const coRec = (v: Awaited<ReturnType<typeof t.buildView>>, coId: string) => v.companies.find((c) => c.id === pub(coId))!;
  check("a member shown in the directory: who held her seats and the role are free", engCell(rv, "e_dana_kite", "operator").s === "value" && engCell(rv, "e_dana_moon", "role").s === "value" && !(engCell(rv, "e_dana_kite", "operator") as { paid?: boolean }).paid);
  check("a member who hasn't chosen: who held his seat stays behind the lock", engCell(rv, "e_theo_moon", "operator").s === "locked");
  check("a member out of the directory: who held her seat still shows on the company, locked", engCell(rv, "e_ines_tide", "operator").s === "locked");
  check("no person key in the table", keysIn(JSON.stringify(rv)).length === 0);

  /* ---------- 3. credits ---------- */
  console.log("\nCredits");
  const balance = async (who: string) => (await t.buildView(tok(who))).me!.credits;
  const refusal = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const ledgerOf = async (who: string) => (await t.exportState()).ledger.filter((l) => l.memberId === who);
  // Decision 2 (PEERS_FREE): fellow fractionals never cost a credit. Unlock on Fractionals spends nothing, and who held a
  // seat shows free once the member sees the company; at a company still locked for them it waits for the company.
  const b0 = await balance("mem_robin");
  const u1 = await t.perform(ROBIN, { type: "unlockFractional", id: sam.id }, BASE);
  check("Fractionals never costs a credit: nothing spent, and it says so", (await balance("mem_robin")) === b0 && u1.message === t.FRACTIONALS_FREE, { b0, now: await balance("mem_robin"), m: u1.message });
  check("no ledger row for it", !(await ledgerOf("mem_robin")).some((l) => l.ref.startsWith("e_sam_")));
  rv = await t.buildView(ROBIN);
  check(
    "who held Sam's seat at a company Robin sees shows free, with the role",
    engCell(rv, "e_sam_bright", "operator").s === "value" && engCell(rv, "e_sam_bright", "role").s === "value" && !(engCell(rv, "e_sam_bright", "operator") as { paid?: boolean }).paid,
  );
  check("at the companies still locked for Robin it waits for the company", ["e_sam_pollen", "e_sam_vellum"].every((id) => engCell(rv, id, "operator").s === "locked"));
  check("a locked company stays locked (its name, and its record)", coRec(rv, "c_pollen").hidden === true && coRec(rv, "c_vellum").hidden === true && !JSON.stringify(coRec(rv, "c_pollen")).includes("Pollen"));
  d = await dirOf("mem_robin");
  const samR = recOf(d, "e_sam_pollen")!;
  check("the record shows: name, initials, title, and Invite to connect by the known company's seat, nothing bought", samR.name === "Sam Brennick" && samR.initials === "SB" && !samR.unlocked && !samR.locked && samR.title === "Fractional Head of RevOps" && samR.invite?.seat === pub("e_sam_bright"), samR);
  const b1 = await balance("mem_robin");
  const r1 = await refusal(t.perform(ROBIN, { type: "unlock", entity: "engagement", id: pub("e_sam_bright"), field: "operator" }, BASE));
  check("unlocking who held the seat Robin sees charges nothing: nothing locked", !!r1 && /Nothing here is locked/.test(r1) && (await balance("mem_robin")) === b1, r1);
  const r2 = await refusal(t.perform(ROBIN, { type: "unlock", entity: "engagement", id: pub("e_sam_vellum"), field: "operator" }, BASE));
  const r3 = await refusal(t.perform(ROBIN, { type: "unlock", entity: "engagement", id: pub("e_sam_pollen"), field: "role" }, BASE));
  check("who held a seat at a locked company, or its role: the company first, nothing spent", r2 === t.COMPANY_FIRST && r3 === t.COMPANY_FIRST && (await balance("mem_robin")) === b1, [r2, r3]);
  const dry = await t.perform(ROBIN, { type: "unlockMany", items: ["e_sam_pollen", "e_sam_vellum"].flatMap((id) => [{ entity: "engagement" as const, id: pub(id), field: "operator" }, { entity: "company" as const, id: pub(id === "e_sam_pollen" ? "c_pollen" : "c_vellum"), field: "identity" }]) }, BASE, { dryRun: true });
  check("Unlock all with their companies quotes only the companies (2 each), the seat holders free", (dry.spent ?? 0) === 4, dry);

  // Mo sees Sam's Brightloom seat free on the company record, and the directory charges nothing either.
  const MO = tok("mem_mo");
  const moBal = await balance("mem_mo");
  const dMo = await dirOf("mem_mo");
  check("Mo's directory names Sam too, free", recOf(dMo, "e_sam_pollen")?.name === "Sam Brennick" && (await balance("mem_mo")) === moBal);
  const r4 = await t.perform(MO, { type: "unlockFractional", id: sam.id }, BASE);
  check("and Unlock there charges nothing", r4.message === t.FRACTIONALS_FREE && (await balance("mem_mo")) === moBal, r4);
  check("a role bought before (the other half of the seat's bundle) still marks the record unlocked", recOf(dMo, "e_pat_b")?.name === "Pat Quill" && recOf(dMo, "e_pat_b")?.unlocked === true);
  check("without a person key, it doesn't spread to a seat with the same name: that one isn't his purchase, and waits for its locked company", recOf(dMo, "e_pat_a")?.unlocked !== true && engCell(await t.buildView(MO), "e_pat_a", "operator").s === "locked");

  // Zoe knows no company: Sam's name shows in the directory, nothing is spent, and every company of his stays locked.
  const ZOE = tok("mem_zoe");
  const z0 = await balance("mem_zoe");
  await t.perform(ZOE, { type: "unlockFractional", id: sam.id }, BASE);
  const zv = await t.buildView(ZOE);
  check("knowing none of their companies: nothing spent, no ledger row", (await balance("mem_zoe")) === z0 && !(await ledgerOf("mem_zoe")).some((l) => l.ref.endsWith(".person")));
  check("and every company of theirs stays locked, with who held its seats", ["c_pollen", "c_bright", "c_vellum"].every((c) => coRec(zv, c).hidden === true) && ["e_sam_pollen", "e_sam_bright", "e_sam_vellum"].every((id) => engCell(zv, id, "operator").s === "locked"));
  check("the directory names them for her all the same", recOf(await dirOf("mem_zoe"), "e_sam_pollen")?.name === "Sam Brennick");

  // Two seats of one fractional at companies Robin knows: nothing to buy.
  const g0 = await balance("mem_robin");
  const both = await t.perform(ROBIN, { type: "unlockMany", items: ["e_gus_1", "e_gus_2"].map((id) => ({ entity: "engagement" as const, id: pub(id), field: "operator" })) }, BASE);
  rv = await t.buildView(ROBIN);
  check("two seats of one fractional Robin can see: free, nothing spent", (await balance("mem_robin")) === g0 && ["e_gus_1", "e_gus_2"].every((id) => engCell(rv, id, "operator").s === "value" && engCell(rv, id, "role").s === "value"), { g0, now: await balance("mem_robin"), m: both.message });

  // Out of credits, the daily limit, the first day's: the directory needs none of them.
  const pipBefore = (await ledgerOf("mem_pip")).length;
  const rp = await t.perform(tok("mem_pip"), { type: "unlockFractional", id: recOf(d, "e_lee_one")!.id }, BASE);
  check("out of credits: the directory still shows them, nothing written", rp.message === t.FRACTIONALS_FREE && (await ledgerOf("mem_pip")).length === pipBefore, rp);
  check("at the daily unlock limit too", (await t.perform(tok("mem_bo"), { type: "unlockFractional", id: recOf(d, "e_lee_one")!.id }, BASE)).message === t.FRACTIONALS_FREE);
  // Jo joined an hour ago: the first day's 25 unlocks used.
  await t.tableInternals.mutate((st) => {
    st.ledger.push(
      { memberId: "j_jo", delta: 40, reason: "topup", ref: "topup.jo", at: ago(30 * 60 * 1000) },
      ...Array.from({ length: 25 }, (_, n) => ({ memberId: "j_jo", delta: -1, reason: "unlock" as const, ref: `c_jo${n}.identity`, at: ago(30 * 60 * 1000) })),
    );
    return null;
  });
  check("and on the first day's limit", (await t.perform("tok-jo", { type: "unlockFractional", id: recOf(d, "e_lee_one")!.id }, BASE)).message === t.FRACTIONALS_FREE);

  // Plans: Free, Trial and Pro alike, and the free company of the day stays.
  const lee = recOf(d, "e_lee_one")!;
  for (const who of ["mem_fay", "mem_tia", "mem_pru"]) {
    const before = await t.buildView(tok(who));
    await t.perform(tok(who), { type: "unlockFractional", id: lee.id }, BASE);
    const after = await t.buildView(tok(who));
    const l = (await ledgerOf(who)).filter((x) => x.ref.startsWith("e_lee_one"));
    check(`${who === "mem_fay" ? "Free" : who === "mem_tia" ? "Trial" : "Pro"}: free, no ledger row`, after.me!.credits === before.me!.credits && l.length === 0, l);
    // The trial's companies a day stay as they were; Pro opens everything (open data on paid plans), so it has no free company to keep.
    if (who === "mem_tia") check("Trial: today's companies are still all left", after.me!.freeCompany === true && before.me!.freeCompany === true && after.me!.proOpens?.left === before.me!.proOpens?.left);
    if (who === "mem_pru") check("Pro: everything opens, nothing counted", after.me!.openAll === true && !after.me!.proOpens);
  }

  /* ---------- 4. visibility and the switch ---------- */
  console.log("\nWho shows");
  const THEO = tok("mem_theo");
  check("Me.fractionals: chosen yes, chosen no, not chosen", (await t.buildView(tok("mem_dana"))).me!.fractionals === true && (await t.buildView(tok("mem_ines"))).me!.fractionals === false && (await t.buildView(THEO)).me!.fractionals === null);
  await t.perform(THEO, { type: "settings", fractionals: true }, BASE);
  d = await dirOf("mem_robin");
  rv = await t.buildView(ROBIN);
  check("shown: his full name in the directory and on his seats, free", recOf(d, "e_theo_moon")?.name === "Theo Wrenshaw" && engCell(rv, "e_theo_moon", "operator").s === "value" && engCell(rv, "e_theo_tide", "operator").s === "value", [recOf(d, "e_theo_moon")?.name, engCell(rv, "e_theo_moon", "operator"), engCell(rv, "e_theo_tide", "operator")]);
  check("signed out, nothing changes: no name", !JSON.stringify(await t.buildView(null)).includes("Wrenshaw"));
  await t.perform(THEO, { type: "settings", fractionals: false }, BASE);
  d = await dirOf("mem_robin");
  rv = await t.buildView(ROBIN);
  check("out: gone from the directory, and his seats back behind their lock", !recOf(d, "e_theo_moon") && engCell(rv, "e_theo_moon", "operator").s === "locked");
  check("his own record still shows to him, marked hidden", (await dirOf("mem_theo")).records.find((r) => r.you)?.hidden === true);
  const ri = await refusal(t.perform(ROBIN, { type: "message.connect", memberId: pub("mem_ines"), text: "Hello" } as never, BASE));
  check("a member out of the directory can't be messaged from it", !!ri && /isn't in the Fractionals directory/.test(ri), ri);
  await t.perform(THEO, { type: "settings", partners: true }, BASE);
  check("Referral partners' old switch is the same one", (await t.buildView(THEO)).me!.fractionals === true);
  const dm = (await t.perform(ROBIN, { type: "unlockFractional", id: dana.id }, BASE)).message;
  check("a member shown in the directory has nothing to unlock, and nothing is spent", dm === t.FRACTIONALS_FREE, dm);

  /* ---------- 5. invites and activation ---------- */
  console.log("\nInvites and activation");
  const robinCode = t.inviteCode("mem_robin");
  await t.perform(ROBIN, { type: "invite", engagementId: pub("e_sam_bright"), note: `Hi Sam, I'm a fractional CMO. Connect with me: ${BASE}/claim/${claimToken("e_sam_bright")}?ref=${robinCode}` }, BASE);
  await t.perform(MO, { type: "invite", engagementId: pub("e_sam_bright"), note: "Hi Sam, Mo here." }, BASE);
  const samTok = claimToken("e_sam_bright");
  const page = await t.claimPage(samTok, null, robinCode);
  check("a fractional with several seats: the activation page lists every seat that looks like theirs", page.status === "open" && page.person?.seats.length === 3, page);
  check("only the link's own seat names its company", page.person!.seats.filter((x) => x.company).length === 1 && page.person!.seats.find((x) => x.link)?.company === "Brightloom Learning" && !JSON.stringify(page).includes("Pollen") && !JSON.stringify(page).includes("Vellum"));
  check("who's waiting: the member whose link it is, and how many more", page.person!.inviter?.name === "Robin Kearney" && page.person!.others === 1 && /fractional CMO/.test(page.person!.inviter?.note ?? "") && !/claim\//.test(page.person!.inviter?.note ?? ""), page.person!.inviter);
  check("never the fractional's name, and no person key", !JSON.stringify(page).includes("Brennick") && keysIn(JSON.stringify(page)).length === 0);
  const samJoin = await t.joinMember("Sam Brennick", "sam.brennick@example.net", robinCode, "10.9.9.9");
  const robin0 = await balance("mem_robin");
  const mo0 = await balance("mem_mo");
  const act = await t.activateByToken(samJoin.token, samTok, { origin: BASE, ref: robinCode, skip: [], show: true });
  const samView = await t.buildView(samJoin.token);
  check("activating claims every seat of theirs at once (past the 3 a day)", ["e_sam_pollen", "e_sam_bright", "e_sam_vellum"].every((id) => samView.companies.flatMap((c) => c.engagements).find((e) => e.id === pub(id))?.yours), act.message);
  check("the first inviter's conversation comes back, and their record", !!act.conversationId && act.id === (await dirOf("mem_robin")).records.find((r) => r.name === "Sam Brennick")?.id, act);
  const convs = (await t.exportState()).conversations ?? [];
  check("a conversation with each member who invited them", convs.some((c) => c.a === "mem_robin" && c.b === samJoin.id) && convs.some((c) => c.a === "mem_mo" && c.b === samJoin.id));
  const samLedger = await ledgerOf(samJoin.id);
  check("the new member's bonus, once", samLedger.filter((l) => l.reason === "referral").reduce((n, l) => n + l.delta, 0) === 10, samLedger);
  check("each inviter's bonus", (await balance("mem_robin")) === robin0 + 10 && (await balance("mem_mo")) === mo0 + 10, { robin: [robin0, await balance("mem_robin")], mo: [mo0, await balance("mem_mo")] });
  check("they're in the directory, shown (the box was ticked)", samView.me!.fractionals === true && (await dirOf("mem_robin")).records.some((r) => r.name === "Sam Brennick" && r.onMerlin));
  const again = await refusal(t.activateByToken(samJoin.token, samTok, { origin: BASE, ref: robinCode }));
  check("activating again pays nobody twice", (await ledgerOf(samJoin.id)).filter((l) => l.reason === "referral").reduce((n, l) => n + l.delta, 0) === 10 && (await balance("mem_robin")) === robin0 + 10, again);

  // Cara: seven members invited her. The bonus goes to at most ACTIVATE_INVITERS_PAID of them.
  const caraTok = claimToken("e_cara_1");
  const caraJoin = await t.joinMember("Cara Manyinvites", "cara.many@example.net", t.inviteCode("mem_inv1"), "10.8.8.8");
  const invBefore = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => balance(`mem_inv${n}`)));
  await t.activateByToken(caraJoin.token, caraTok, { origin: BASE, ref: t.inviteCode("mem_inv1"), skip: [], show: true });
  const invAfter = await Promise.all([1, 2, 3, 4, 5, 6, 7].map((n) => balance(`mem_inv${n}`)));
  const paid = invAfter.filter((x, i) => x === invBefore[i] + 10).length;
  check(`the invite bonus goes to at most ${core.ACTIVATE_INVITERS_PAID} inviters for one activation`, paid === core.ACTIVATE_INVITERS_PAID && invAfter[0] === invBefore[0] + 10, { invBefore, invAfter });
  check("the new member's own bonus is still once", (await ledgerOf(caraJoin.id)).filter((l) => l.reason === "referral").reduce((n, l) => n + l.delta, 0) === 10);
  check("all seven are connected with her", ((await t.exportState()).conversations ?? []).filter((c) => c.b === caraJoin.id).length === 7);

  /* ---------- 6. Not mine, This isn't me, Remove my name ---------- */
  console.log("\nNot mine, This isn't me, Remove my name");
  const niaTok = claimToken("e_nia_1");
  const nm = await t.nameOffSeat(niaTok, pub("e_nia_3"));
  const niaPage = await t.claimPage(niaTok, null, null);
  check("Not mine: that seat's name comes off and it leaves the page", nm.done && niaPage.person?.seats.length === 2 && !niaPage.person.seats.some((x) => x.id === pub("e_nia_3")), niaPage.person);
  const nmBad = await t.nameOffSeat(niaTok, pub("e_sam_pollen"));
  check("Not mine only reaches a seat of the link's fractional", !nmBad.done);
  const niaJoin = await t.joinMember("Nia Notmine", "nia.not@example.net", null, "10.7.7.7");
  await t.activateByToken(niaJoin.token, niaTok, { origin: BASE, skip: [pub("e_nia_2")], show: false });
  const niaView = await t.buildView(niaJoin.token);
  const niaSeat = (id: string) => niaView.companies.flatMap((c) => c.engagements).find((e) => e.id === pub(id));
  check("an unticked seat isn't claimed; the ticked one is", niaSeat("e_nia_1")?.yours === true && !niaSeat("e_nia_2")?.yours);
  check("untick the directory box and they're out of it", niaView.me!.fractionals === false && !(await dirOf("mem_robin")).records.some((r) => r.seats.some((s) => s.id === pub("e_nia_1"))));

  // Rae: Robin paid to see who held her Orchard seat under the old rules (seeded), then Remove my name on her link takes every name of hers off, with that credit back.
  d = await dirOf("mem_robin");
  const rae = recOf(d, "e_rae_1")!;
  await t.perform(ZOE, { type: "unlockFractional", id: rae.id }, BASE);
  const rb0 = await balance("mem_robin");
  const zb0 = await balance("mem_zoe");
  const off = await t.nameOffByToken(claimToken("e_rae_1"), "remove");
  rv = await t.buildView(ROBIN);
  check("Remove my name: every seat of theirs is unnamed now", off.done && ["e_rae_1", "e_rae_2"].every((id) => engCell(rv, id, "operator").s === "empty"));
  check("and whoever paid to see it gets the credit back; a free look gets nothing back", (await balance("mem_robin")) === rb0 + 1 && (await balance("mem_zoe")) === zb0, { robin: [rb0, await balance("mem_robin")], zoe: [zb0, await balance("mem_zoe")] });
  check("their record is gone", !recOf(await dirOf("mem_robin"), "e_rae_1"));
  const pat = await t.nameOffByToken(claimToken("e_pat_a"), "notme");
  check("This isn't me on a one-seat link takes that name off, and only that seat's", pat.done && engCell(await t.buildView(MO), "e_pat_b", "operator").s === "value");

  /* ---------- 7. an old claim link ---------- */
  console.log("\nOld claim links");
  const leePage = await t.claimPage(claimToken("e_lee_one"), null, null);
  check("a one-seat link reads as before: no activation page", leePage.status === "open" && !leePage.person && leePage.seat?.named === true);
  const leeJoin = await t.joinMember("Lee Single", "lee.single@example.net", null, "10.6.6.6");
  const leeClaim = await t.claimByToken(leeJoin.token, claimToken("e_lee_one"), BASE);
  check("and claims as before", /It's yours/.test(leeClaim.message) && !leeClaim.waiting, leeClaim);

  /* ---------- 8. Referral partners' links, the nav, the rename ---------- */
  console.log("\nLinks, nav and names");
  const hrefs = { today: "/", companies: "/?t=c", engagements: "/?t=e", people: "/?t=p", hiring: "/?v=hiring", following: "/?v=following", page: (p: string) => `/?p=${p}` };
  const navIn = (page: string) => ({ page, recordType: "companies", tab: "all", currentView: null, hrefs, admin: false, network: false, unread: 2, radarNew: 0, totals: null, hiringN: null, followingN: null, seatsMissing: null, credits: 10, views: [], inviteBonus: 10 }) as never;
  const items = nav.navItems(navIn("partners"));
  check("Referral partners' old address puts Peers on (the directory is its Every fractional view)", items.find((x) => x.current)?.key === "peers" && nav.currentKey({ page: "partners", recordType: "companies", tab: "all", currentView: null } as never) === "peers");
  check("?p=partners still reads as a place, so old links open (with Different from yours)", (PLACE_PAGES as readonly string[]).includes("partners") && fm.frDefaults(true, true).fn === "diff" && fm.frDefaults(true).fn === "any" && fm.frDefaults(true).fits === true);
  check("no Referral partners item; Community holds Peers and Messages", !items.some((x) => x.key === "partners") && items.filter((x) => x.group === "community").map((x) => x.key).join() === "peers,messages");
  check("People reads Decision makers in the sidebar and the list's name", items.find((x) => x.key === "people")?.label === "Decision makers" && model.RECORD_TYPES.find((x) => x.key === "people")?.label === "Decision makers");
  check("Messages stays a tab on phones; Fractionals is under More", (nav.TAB_KEYS as readonly string[]).includes("messages") && !(nav.TAB_KEYS as readonly string[]).includes("fractionals"));
  // The directory's own filters.
  d = await dirOf("mem_robin");
  const hasIcp = true;
  const all = fm.frRows(d.records, "all", fm.frDefaults(false), d.fn, hasIcp);
  const diff = fm.frRows(d.records, "all", { ...fm.frDefaults(false), fn: "diff" }, d.fn, hasIcp);
  const onM = fm.frRows(d.records, "on", fm.frDefaults(false), d.fn, hasIcp);
  const unl = fm.frRows(d.records, "unlocked", fm.frDefaults(false), d.fn, hasIcp);
  check("Different from yours leaves out the viewer's function", diff.length > 0 && diff.every((r) => !r.fns.includes("Marketing")) && all.some((r) => r.fns.includes("Marketing")));
  check("On Merlin and Unlocked tabs", onM.length > 0 && onM.every((r) => r.onMerlin) && unl.length > 0 && unl.every((r) => r.unlocked) && unl.every((r) => !!r.name), { on: onM.length, unl: unl.map((r) => r.name) });
  check("the line at the top", /^\d+ fractionals? serves? companies like yours\. \d+ (is|are) on Merlin\.$/.test(fm.headline(d.records, true)), fm.headline(d.records, true));

  /* ---------- 8b. Serves your Crystal Ball companies ---------- */
  console.log("\nServes your Crystal Ball companies");
  {
    const dc = await dirOf("mem_cass");
    const samC = recOf(dc, "e_sam_pollen")!;
    const danaC = recOf(dc, "e_dana_kite")!;
    check("a fractional at three of her Crystal Ball companies: the count, with a current seat there", same3(samC.ball, { n: 3, now: true, names: ["Brightloom Learning"] }) && fm.ballChip(samC) === "Serves 3 companies in your Crystal Ball", samC.ball);
    check("the companies are named only where she has them unlocked", !/Pollen Ledger|Vellum Insurance/.test(JSON.stringify(dc)) && samC.ball?.names.length === 1);
    check("one company, and one past seat only: Served 1", fm.ballChip({ ball: { n: 1, now: false, names: [] } }) === "Served 1 company in your Crystal Ball" && fm.ballChip({}) === null);
    check("Dana serves one of them (Kitebright, a locked company for Cass), counted and never named", !!danaC.ball && danaC.ball.n === 1 && danaC.ball.names.length === 0 && !/Kitebright/.test(JSON.stringify(dc)), danaC.ball);
    check("records with none of her companies carry nothing (Sam, and three at Kitebright: Dana, Pat and Cara)", dc.records.filter((r) => r.ball).length === 4 && !recOf(dc, "e_lee_one")!.ball, dc.records.filter((r) => r.ball).length);
    check("it is hers alone: Robin's directory has none of it", (await dirOf("mem_robin")).records.every((r) => !r.ball));
    const P2 = await import("../lib/partners");
    const named = P2.partnerOpener({ first: "Dana", myTitle: "Fractional CMO", shared: { names: ["Brightloom Learning"] } });
    const generic = P2.partnerOpener({ first: "Dana", myTitle: "Fractional CMO", shared: { names: [] } });
    check("the first message names those companies when she has them unlocked", /I see you've worked with Brightloom Learning, which is on my list too\./.test(named), named);
    check("otherwise a line that names none", /It looks like we work around some of the same companies\./.test(generic) && !/Kitebright|Pollen/.test(generic), generic);
    const NN = await import("../lib/moveNote");
    const inv = (shared: { names: string[] } | null) =>
      NN.draftNote({ kind: "peerInvite", company: "", to: { name: "Sam Brennick", email: null, from: "unlocked on Merlin" }, since: null, saw: null, me: { first: "Cass", name: "Cass Crystal", as: "a fractional CMO", fn: "Marketing", clients: null }, seat: null, role: null, link: "https://post.example.com/claim/x", shared }).body;
    check("Invite to connect says the same: named, or generic, or the clients line without any", /worked with Brightloom Learning and Kitebright, which are on my list too/.test(inv({ names: ["Brightloom Learning", "Kitebright"] })) && /some of the same companies/.test(inv({ names: [] })) && /serve the same kind of clients/.test(inv(null)));
  }

  /* ---------- 9. no person key anywhere ---------- */
  console.log("\nNo person key in any answer");
  const ctx = { member: (await t.memberForToken(ROBIN))!, origin: BASE };
  const got = JSON.stringify([await tools.getCompany(ctx, { company: pub("c_bright") }), await tools.getCompany(ctx, { company: pub("c_pollen") })]);
  check("the connector names Sam on his seats once he's bought, and carries no key", got.includes("Sam Brennick") && keysIn(got).length === 0);
  const home = await fr.fractionalsHome(ROBIN);
  check("Home's line: members who joined this week and serve the same kind of client", !!home && home.n >= 1 && keysIn(JSON.stringify(home)).length === 0, home);
  const exp = JSON.stringify(await t.exportState());
  check("the export carries no key", keysIn(exp).length === 0);
  check("no answer above carried a key (the views of every member)", (await Promise.all(["mem_robin", "mem_mo", "mem_zoe", "mem_theo"].map(async (w) => JSON.stringify(await t.buildView(tok(w))) + JSON.stringify(await dirOf(w))))).every((x) => keysIn(x).length === 0));

  /* ---------- Evidence Bank on a card (Close, opt-in) ---------- */
  console.log("\nEvidence Bank cases on a card");
  {
    // Her cases as lib/evidence keeps them (State.evidence), the client's name kept only to be scrubbed while hidden.
    const mk = (id: string, status: "draft" | "ready", showOnCard: boolean, more: Record<string, unknown> = {}) => ({
      id, status, showOnCard, companyId: "c_kite", clientNamed: false, clientName: "Kitebright", clientLabel: "A SaaS company, $5M to $20M", title: "Kitebright: a forecast the board trusts",
      role: "Fractional VP Sales", fn: "Sales", start: "2024-01", end: "2024-09", hours: "", size: "", revenue: "", motion: "", industry: "", soldTo: "", answers: { problem: "", did: "", numbers: "" }, textBy: "member",
      problems: [], workType: [], outcomes: [{ k: "Forecast miss", before: "30%", after: "8%" }], workedWith: [], text: "At Kitebright the close took 20 days.", usedIn: [], createdAt: ago(9 * DAY), updatedAt: ago(DAY), ...more,
    });
    const setCases = (xs: ReturnType<typeof mk>[]) =>
      t.tableInternals.mutate((s) => {
        (s.evidence ??= {}).mem_dana = xs as never;
      });
    await setCases([mk("ev_a", "ready", true), mk("ev_b", "ready", false, { title: "Not for the card" }), mk("ev_c", "draft", true, { title: "A draft" })]);
    const danaRec = async (who: string) => (await dirOf(who)).records.find((r) => r.seats.some((x) => x.id === pub("e_dana_kite")));
    check("no Close for her: no cases on her card (Evidence Bank is Close's)", !(await danaRec("mem_robin"))?.cases);
    await t.tableInternals.mutate((s) => {
      s.billing!.members.mem_dana = { trialStartedAt: ago(DAY), trialEndsAt: ahead(13 * DAY) } as never;
    });
    const got = (await danaRec("mem_robin"))?.cases;
    check("with Close: the ready cases she chose to show, and only those", got?.length === 1 && got[0].title.includes("orecast the board trusts") && !JSON.stringify(got).includes("Not for the card") && !JSON.stringify(got).includes("A draft"), got);
    check("the client's name stays hidden on her card (taken out of her own words)", !!got && !/Kitebright/i.test(JSON.stringify(got)) && got[0].title === "A forecast the board trusts", got);
    check("each with one outcome", got?.[0].outcome === "Forecast miss: 30% to 8%", got);
    check("no internal company id on the card", !JSON.stringify(await dirOf("mem_robin")).includes("c_kite"));
    await setCases([mk("ev_a", "ready", true, { clientNamed: true })]);
    check("a client she named shows by name", /Kitebright/.test(JSON.stringify((await danaRec("mem_robin"))?.cases)));
    await t.perform(tok("mem_dana"), { type: "settings", fractionals: false }, BASE);
    check("out of the directory: her cases go with her record", !(await danaRec("mem_robin")));
    await t.perform(tok("mem_dana"), { type: "settings", fractionals: true }, BASE);
  }

  /* ---------- Stage 6: the card, Hide my name, Open to leads, companies in common ---------- */
  console.log("\nYour card, Hide my name and Open to leads");
  {
    const DANA = tok("mem_dana");
    const danaOf = async (who: string) => (await dirOf(who)).records.find((r) => r.memberId === pub("mem_dana"));
    check("a member in the directory is open to leads until they say no", (await danaOf("mem_robin"))?.leads === "open" && (await t.buildView(DANA)).me!.leads === true);
    const saved = await t.perform(DANA, { type: "settings", headline: "  I rebuild   finance\nat SaaS companies  ", city: " Denver, CO " }, BASE);
    const dr = await danaOf("mem_robin");
    check("one line about her and where she is based: saved tidy, on her card for others", /Members see it on your card/.test(saved.message) && dr?.headline === "I rebuild finance at SaaS companies" && dr?.city === "Denver, CO", { m: saved.message, h: dr?.headline, c: dr?.city });
    const dm = (await t.buildView(DANA)).me!;
    check("and in her own Me, and on her own record", dm.headline === "I rebuild finance at SaaS companies" && dm.city === "Denver, CO" && (await dirOf("mem_dana")).records.find((r) => r.you)?.headline === "I rebuild finance at SaaS companies");
    const long = await t.perform(DANA, { type: "settings", headline: "x".repeat(300) }, BASE);
    check("the line is cut at CARD_LINE_MAX, and the page says the same number", long.message.startsWith("Saved") && (await t.buildView(DANA)).me!.headline!.length === t.CARD_LINE_MAX && fm.CARD_LINE_MAX === t.CARD_LINE_MAX && fm.CARD_CITY_MAX === t.CARD_CITY_MAX);
    for (const bad of ["Write to dana@kite.example", "See https://kite.example", "Call +1 303 555 0100"])
      check(`refused on the card: ${bad.split(" ")[0].toLowerCase()} ${bad.includes("@") ? "an email" : bad.includes("http") ? "a link" : "a phone number"}`, /Leave out emails, links and phone numbers/.test((await refusal(t.perform(DANA, { type: "settings", headline: bad }, BASE))) ?? ""));
    await t.perform(DANA, { type: "settings", headline: "I rebuild finance at SaaS companies" }, BASE);
    // Theo hasn't chosen (as he was before the switch above): his line is his own until he is in the directory.
    await t.tableInternals.mutate((s) => {
      delete s.profiles.mem_theo.fractionals;
      delete s.profiles.mem_theo.partnersOff;
    });
    await t.perform(tok("mem_theo"), { type: "settings", headline: "Sales leader for fintech", city: "Austin, TX" }, BASE);
    const th = (await dirOf("mem_robin")).records.find((r) => r.memberId === pub("mem_theo"));
    check("a member who hasn't chosen: his line and city stay off his card for others", !!th && !th.headline && !th.city && !/Sales leader for fintech|Austin, TX/.test(JSON.stringify(await dirOf("mem_robin"))), th);
    check("but he sees them on his own card", (await dirOf("mem_theo")).records.find((r) => r.you)?.headline === "Sales leader for fintech");
    await t.perform(tok("mem_theo"), { type: "settings", headline: "", city: "" }, BASE);
    await t.perform(tok("mem_theo"), { type: "settings", fractionals: true }, BASE);
    check("empty takes it off", !(await t.buildView(tok("mem_theo"))).me!.headline && !(await t.buildView(tok("mem_theo"))).me!.city);
    // Open to leads off.
    const off = await t.perform(DANA, { type: "settings", leads: false }, BASE);
    check("Open to leads off: others see Not now, her Me says so", /Leads are off/.test(off.message) && (await danaOf("mem_robin"))?.leads === "off" && (await t.buildView(DANA)).me!.leads === false);
    const pe = await import("../lib/peers");
    const passOff = await refusal(pe.performPeer(ROBIN, { type: "peer.pass", memberId: pub("mem_dana"), companyId: pub("c_kite"), note: "" } as never));
    check("and a lead passed to her is refused", !!passOff && /not taking leads/.test(passOff), passOff);
    const picks = await pe.peerPicks(ROBIN, pub("c_kite"), null, false);
    const teamPicks = await pe.peerPicks(ROBIN, pub("c_kite"), null, true);
    check("Refer it to a peer never offers her; Team up still may", !!picks && !picks.picks.some((x) => x.id === pub("mem_dana")) && !!teamPicks, picks?.picks.map((x) => x.name));
    await t.perform(DANA, { type: "settings", leads: true }, BASE);
    check("on again: open", (await danaOf("mem_robin"))?.leads === "open");

    // Hide my name on my seats: out of the directory everywhere, as the directory's own rule says.
    const nBefore = (await dirOf("mem_robin")).records.length;
    await t.perform(DANA, { type: "settings", nameHidden: true }, BASE);
    const rd = await dirOf("mem_robin");
    check("Hide my name: she is left out of the directory entirely, no row and no count", !rd.records.some((r) => r.memberId === pub("mem_dana")) && rd.records.length === nBefore - 1 && !rd.records.some((r) => r.id.startsWith("h_") || (!r.you && !r.name && r.fn === "Finance" && r.onMerlin)) && !/Dana|Whitfield|I rebuild finance|Denver/.test(JSON.stringify(rd)));
    const pv = (await pe.peersView(ROBIN))!;
    check("and in Peers: not suggested, not offered for a lead", !JSON.stringify(pv.serve).includes(pub("mem_dana")) && !JSON.stringify(pv.know).includes(pub("mem_dana")) && !((await pe.peerPicks(ROBIN, pub("c_kite"), null, false))?.picks ?? []).some((x) => x.id === pub("mem_dana")));
    const passHid = await refusal(pe.performPeer(ROBIN, { type: "peer.pass", memberId: pub("mem_dana"), companyId: pub("c_kite"), note: "" } as never));
    check("a lead passed to her is refused", !!passHid && /isn't in Peers right now/.test(passHid), passHid);
    check("her own record still shows to her, marked hidden, her name on it", (await dirOf("mem_dana")).records.find((r) => r.you)?.hidden === true && (await dirOf("mem_dana")).records.find((r) => r.you)?.name === "Dana Whitfield");
    check("Home's line never counts her", ((await fr.fractionalsHome(ROBIN))?.initials ?? []).every((x) => x !== "DW"));
    await t.perform(DANA, { type: "settings", nameHidden: false }, BASE);
    check("off again: back by name", (await danaOf("mem_robin"))?.name === "Dana Whitfield");
  }
  console.log("\nCompanies in common");
  {
    const dc = await dirOf("mem_cass");
    const samC = recOf(dc, "e_sam_pollen")!;
    const danaC = recOf(dc, "e_dana_kite")!;
    check("in her Crystal Ball: the one she opened named, the rest counted as locked", samC.common?.why === "ball" && JSON.stringify(samC.common.names) === JSON.stringify(["Brightloom Learning"]) && samC.common.locked === 2, samC.common);
    check("a locked company is never named in common", danaC.common?.why === "ball" && danaC.common.names.length === 0 && danaC.common.locked === 1 && !/Pollen Ledger|Vellum/.test(JSON.stringify(dc)), danaC.common);
    check("the words: Brightloom Learning, 2 locked companies, In your Crystal Ball", JSON.stringify(fm.commonWords(samC)) === JSON.stringify({ a: "Brightloom Learning, 2 locked companies", b: "In your Crystal Ball" }), fm.commonWords(samC));
    // Robin's pipeline at Kitebright: Pat, Cara and Dana held seats there.
    await t.tableInternals.mutate((s) => {
      ((s.pipeline ??= {}).mem_robin ??= { entries: [], intros: [] }).entries.push({ id: "pl_test_kite", companyId: "c_kite", stage: "reach", channel: "email", to: {}, source: "record", dates: {}, via: {}, due: null, notes: [], log: [] } as never);
    });
    const rr = await dirOf("mem_robin");
    const pat = recOf(rr, "e_pat_b")!;
    check("in her pipeline: In your pipeline, named where she sees it", pat.common?.why === "pipeline" && pat.common.names.includes("Kitebright"), pat.common);
    const moPat = recOf(await dirOf("mem_mo"), "e_pat_b");
    check("nobody else's directory has it", moPat?.common?.why !== "pipeline", moPat?.common);
  }
  console.log("\nThe page's views, chips and Ask Merlin (pure)");
  {
    const d2 = await dirOf("mem_robin");
    const x = { myFn: d2.fn, hasIcp: true, know: new Map([[pub("mem_dana"), { from: "Your LinkedIn", why: "Kitebright" }]]), passed: new Set<string>() };
    const counts = fm.fxViewCounts(d2.records, x);
    check("views: All counts every other record, You know only the viewer's own", counts.all === d2.records.filter((r) => !r.you).length && counts.know === 1 && counts.passed === 0, counts);
    const rows = fm.fxRows(d2.records, "all", fm.fxNone(), x);
    check("rows: every other record, best for you first, none out of the directory", rows.length === counts.all && !rows.some((r) => r.memberId === pub("mem_ines")));
    const on = fm.fxRows(d2.records, "all", fm.fxFlip(fm.fxNone(), "on"), x);
    check("On Merlin: members you can write to", on.length > 0 && on.every((r) => r.onMerlin && !!r.memberId));
    check("a chip turns its opposite off", JSON.stringify(fm.fxFlip(fm.fxFlip(fm.fxNone(), "on"), "off").chips) === JSON.stringify(["off"]));
    const openN = fm.fxChipCounts(d2.records, "all", fm.fxNone(), x).open;
    check("the Open to leads chip counts members who take leads", openN === d2.records.filter((r) => !r.you && r.leads === "open").length && openN > 0, openN);
    const a = fm.askFx("A fractional CFO who serves fintech and takes leads", ["Fintech", "SaaS"], ["Finance", "Sales"]);
    check("Ask Merlin: function, industry and leads from plain words", a.f.fn === "Finance" && a.f.industry === "Fintech" && a.f.chips.includes("open") && a.unknown.length === 0, a);
    const b = fm.askFx("revops leaders for my clients and zebras", [], ["RevOps"]);
    check("Ask Merlin: a view, and the words it didn't know said back, never guessed", b.f.fn === "RevOps" && b.view === "same" && b.unknown.includes("zebras"), b);
    check("Ask Merlin never names a company it wasn't given", !fm.askFx("CFO at Kitebright", [], ["Finance"]).said.includes("Kitebright"));
    const three = fm.startThree(d2.records, [], x);
    check("three to start with: members on Merlin who serve your kind of client, never you", three.length <= 3 && three.every((r) => r.onMerlin && !r.you && !!r.memberId && r.fits));
    check("your card's name: in full when shown, short until you choose, hidden when hidden", fm.cardName({ name: "Robin Kearney", fractionals: true }).name === "Robin Kearney" && fm.cardName({ name: "Robin Kearney", fractionals: null }).name === "Robin K." && fm.cardName({ name: "Robin Kearney", fractionals: true, nameHidden: true }).name === "A fractional (name hidden)");
    const merged = fm.withPeers(d2.records, [
      { memberId: "m_noseat", name: "Ola Noseat", fn: "Finance", fits: true },
      { memberId: d2.records.find((r) => r.memberId)!.memberId!, name: "Someone Else", fn: null },
      { memberId: "", name: "Not a member", fn: null },
    ]);
    const ola = merged.find((r) => r.memberId === "m_noseat");
    check("a member Peers shows with no seat on file joins the list, seatless, named as Peers names them; nobody twice", merged.length === d2.records.length + 1 && !!ola && ola.seats.length === 0 && ola.now === 0 && ola.onMerlin && ola.name === "Ola Noseat" && !merged.some((r) => r.name === "Someone Else"), ola);
    {
      // Messages' Profile opens that member's card: read without using it up (the shell may mount the page twice), for 15 seconds at most.
      fm.openFractionalFor("m_x", 1_000);
      const seen = [fm.peekWantMember(2_000), fm.peekWantMember(3_000), fm.peekWantMember(17_000)];
      fm.doneWantMember();
      check("a thread's Profile: the card to open, read twice, gone after 15 seconds or once used", seen[0] === "m_x" && seen[1] === "m_x" && seen[2] === null && fm.peekWantMember(2_000) === null, seen);
    }
    check("the Open to leads cell", fm.leadsWord({ onMerlin: true, leads: "open" }) === "Open" && fm.leadsWord({ onMerlin: true, leads: "off" }) === "Not now" && fm.leadsWord({ onMerlin: false }) === "Not yet");
  }

  console.log(`\n${passes} passed, ${failures} failed`);
}

main()
  .catch((e) => {
    failures++;
    console.error("FAIL the suite threw", e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(failures ? 1 : 0);
  });
