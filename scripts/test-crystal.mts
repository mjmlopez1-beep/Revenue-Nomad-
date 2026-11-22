/**
 * Checks of opening companies from Crystal Ball (lib/table.ts crystalOf and the unlock with from
 * "crystal", lib/radar crystalCompanyIds), with billing live. No server: lib/table.ts runs in
 * process on a made-up seed in a temporary data dir, with fetch replaced (nothing reaches Stripe
 * or leaves the machine) and the clock moved forward a day where the rule is about UTC days.
 *
 *   npx tsx scripts/test-crystal.mts      exits 1 on any failure
 *
 * Covered:
 *   - Trial and Pro: a company in their Crystal Ball opens for 0 credits and is theirs (the same
 *     record a 2-credit unlock gives), recorded as a 0-credit company unlock with why "crystal",
 *     without using the free company of the day; its people still cost 1, who held its seats shows
 *     free (PEERS_FREE);
 *   - outside Crystal Ball, Trial and Pro open companies free too, up to PRO_OPENS_DAILY a day,
 *     with how many are left said each time;
 *   - the server decides: a company not in the member's Crystal Ball can't be opened free (a
 *     forged request), and only a company opens that way;
 *   - Free (trial over): Crystal Ball names nothing; the first full open of the day is free and
 *     shows every fact there (seat holders and their roles, people, their contact details, rates,
 *     postings), exactly the record of a member who paid for all of it; the second is refused
 *     with the upgrade line; the next UTC day opens one again without refunding what was paid;
 *     a company already fully known doesn't use it; outside Crystal Ball Free has no free company;
 *   - another member's table is untouched;
 *   - the connector quotes 0 for these companies and says why, and the Free plan's words;
 *   - ?first=1 and ?today=1 carry the same records as the full view;
 *   - the Slack and email words for a Trial or Pro card and a Free one.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-crystal-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const today = iso(0).slice(0, 10);

/* ---------- the made-up seed ---------- */

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX", linkedin: `https://www.linkedin.com/company/${site.split(".")[0]}` } });
const companies = [
  co("c_ball1", "Orbweaver Analytics", "orbweaver.example"),
  co("c_ball2", "Quillmark Studios", "quillmark.example"),
  co("c_ball3", "Ravenmoor Supply", "ravenmoor.example"),
  // In Fen's Crystal Ball only, and locked for her: what Free unlocks for 2 credits once today's free one is used.
  co("c_ball4", "Tidewater Goods", "tidewater.example"),
  co("c_out", "Sablecrest Partners", "sablecrest.example"),
];
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, verified: false, fields });
const engagements = [
  // Ball 1: an ended seat with its holder, rate and end; a seat going on; an open role with its posting and rate.
  seat("e_b1_mkt", "c_ball1", { source: "Member success story", operator: "Wren Holloway", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2023-02", status: "Ended", end: "2023-11", rate: "$9k/mo", sourced: "Referral" }),
  seat("e_b1_fin", "c_ball1", { source: "Member success story", operator: "Ivo Castellan", role: "Fractional CFO", function: "Finance", type: "Fractional", start: "2023-06", status: "Active", end: "Ongoing" }),
  seat("e_b1_open", "c_ball1", { source: "Demand scan", role: "Fractional VP Sales", function: "Sales", status: "Open role", posting: "https://orbweaver.example/jobs/vp-sales", rate: "$12k/mo" }),
  // Ball 2: a seat with its holder, and an open role.
  seat("e_b2_ops", "c_ball2", { source: "Member success story", operator: "Tamsin Okafor", role: "Fractional COO", function: "Operations", type: "Fractional", start: "2023-03", status: "Ended", end: "2023-12", rate: "$8k/mo" }),
  seat("e_b2_open", "c_ball2", { source: "Demand scan", role: "Fractional Head of Sales", function: "Sales", status: "Open role", posting: "https://quillmark.example/careers/sales" }),
  // Ball 3: one seat with nothing on it that costs (no holder, no role, an ongoing end): only the company is paid there.
  seat("e_b3_mkt", "c_ball3", { source: "Member success story", function: "Marketing", type: "Fractional", start: "2023-01", status: "Active", end: "Ongoing" }),
  seat("e_b4_mkt", "c_ball4", { source: "Member success story", function: "Marketing", type: "Fractional", start: "2023-05", status: "Active", end: "Ongoing" }),
  // Out: in nobody's Crystal Ball.
  seat("e_out_ops", "c_out", { source: "Member success story", operator: "Odile Varga", role: "Fractional COO", function: "Operations", type: "Fractional", start: "2023-04", status: "Ended", end: "2023-10" }),
];
const contacts = [
  { id: "p_b1_ceo", companyId: "c_ball1", fields: { name: "Marisol Achterberg", title: "Chief Executive Wombat", relationship: "Decision maker", email: "marisol@orbweaver.example", phone: "512.555.0141", linkedin: "https://www.linkedin.com/in/marisol-achterberg-zz" } },
  { id: "p_b1_hire", engagementId: "e_b1_mkt", fields: { name: "Bastian Quell", title: "President Lynx", relationship: "Hiring for the seat", email: "bastian@orbweaver.example" } },
  { id: "p_b2_ceo", companyId: "c_ball2", fields: { name: "Philippa Strand", title: "Founder Heron", relationship: "Decision maker", email: "philippa@quillmark.example", phone: "512.555.0177" } },
  { id: "p_out_ceo", companyId: "c_out", fields: { name: "Casimir Dunmore", title: "Owner Ibis", relationship: "Decision maker", email: "casimir@sablecrest.example" } },
];
const NAMES = ["Orbweaver", "Quillmark", "Ravenmoor", "Tidewater", "Sablecrest", "orbweaver.example", "quillmark.example", "Wren Holloway", "Ivo Castellan", "Tamsin Okafor", "Marisol", "Achterberg", "Bastian Quell", "Philippa", "Casimir"];

const member = (id: string, name: string) => ({ id, name, email: `${id.slice(4)}.crystal@example.com`, title: "Fractional VP Sales", token: `tok-${id.slice(4)}-crystal` });
const seed = {
  builtAt: iso(-60 * DAY),
  members: [member("mem_tri", "Tia Trial"), member("mem_pro", "Pat Pro"), member("mem_free", "Fen Free"), member("mem_oth", "Oto Other"), member("mem_pay", "Pam Payer"), { id: "mem_ada", name: "Ada Admin", email: "admin-crystal@example.com", title: "Admin", token: "tok-ada-crystal" }],
  companies,
  engagements,
  contacts,
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

/** One kept Crystal Ball row: what the day's view lists (lib/radar/types.ts RadarSentRow). */
const row = (memberId: string, c: string) => ({ k: `test:${memberId}:${c}`, c, kind: "role", l: "New open role: Fractional VP Sales · In your function", b: "High", w: "Hiring now" });
const ballOf = (memberId: string, cs: string[]) => ({ sent: {}, days: { [today]: cs.map((c) => row(memberId, c)) } });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [
      // Fen paid for Quillmark Studios before her trial ended (2 credits), and for Ravenmoor Supply, where nothing else is on file to buy.
      { memberId: "mem_free", delta: -2, reason: "unlock", ref: "c_ball2.identity", at: iso(-20 * DAY) },
      { memberId: "mem_free", delta: -2, reason: "unlock", ref: "c_ball3.identity", at: iso(-20 * DAY) },
    ],
    values: {},
    unlocks: { "c_ball2.identity": ["mem_free"], "c_ball3.identity": ["mem_free"] },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, iso(-HOUR)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } }])),
    billing: {
      members: {
        mem_tri: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) },
        mem_oth: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) },
        mem_pay: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) },
        mem_pro: { trialStartedAt: iso(-40 * DAY), trialEndsAt: iso(-19 * DAY), proUntil: iso(20 * DAY), interval: "month", paidSince: iso(-19 * DAY) },
        mem_free: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) },
      },
      events: [],
      payments: [],
      ended: [],
    },
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: {
        mem_tri: ballOf("mem_tri", ["c_ball1", "c_ball2"]),
        mem_pro: ballOf("mem_pro", ["c_ball1", "c_ball2"]),
        mem_free: ballOf("mem_free", ["c_ball1", "c_ball2", "c_ball3", "c_ball4"]),
        // Oto's Crystal Ball has Quillmark only: Orbweaver is outside it for him.
        mem_oth: ballOf("mem_oth", ["c_ball2"]),
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-crystal@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  // Billing live: made-up Stripe settings (fetch is replaced, nothing reaches Stripe).
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_crystal",
  STRIPE_WEBHOOK_SECRET: "whsec_test_crystal",
  STRIPE_PRICE_MONTH: "price_month_crystal",
  STRIPE_PRICE_YEAR: "price_year_crystal",
});
// The free company of the day stays on here: Trial keeps it, Free loses it.
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_INTEL_SEED_KEY", "RN_GOOGLE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

/* ---------- the clock: moved forward a day for the next UTC day ---------- */

const RealDate = Date;
let skew = 0;
class SkewDate extends RealDate {
  constructor(...a: unknown[]) {
    if (a.length) super(...(a as [string]));
    else super(RealDate.now() + skew);
  }
  static now() {
    return RealDate.now() + skew;
  }
}
globalThis.Date = SkewDate as unknown as DateConstructor;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const named = (x: unknown, names = NAMES) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return names.filter((n) => s.includes(n));
};

async function main() {
  const t = await import("../lib/table");
  const radar = await import("../lib/radar");
  const { firstPage } = await import("../lib/firstPage");
  const { todayView } = await import("../lib/today");
  const { unpackView, unpackCompany } = await import("../lib/viewWire");
  const tools = await import("../lib/mcp/tools");
  const fmt = await import("../lib/radar/format");
  const types = await import("../lib/radar/types");
  type View = Awaited<ReturnType<typeof t.buildView>>;
  type Company = View["companies"][number];
  const BASE = "https://post.example.com";
  const TRI = "tok-tri-crystal";
  const PRO = "tok-pro-crystal";
  const FREE = "tok-free-crystal";
  const OTH = "tok-oth-crystal";
  const PAY = "tok-pay-crystal";

  const ada = await t.buildView("tok-ada-crystal");
  const idOf = (name: string) => ada.companies.find((c) => c.name === name)!.id;
  const B1 = idOf("Orbweaver Analytics");
  const B2 = idOf("Quillmark Studios");
  const B3 = idOf("Ravenmoor Supply");
  const OUT = idOf("Sablecrest Partners");
  check("the made-up seed's companies are all on file", [B1, B2, B3, OUT].every(Boolean));

  const view = (tok: string) => t.buildView(tok);
  const company = (v: View, id: string) => v.companies.find((c) => c.id === id)!;
  const credits = async (tok: string) => (await view(tok)).me!.credits;
  const open = (tok: string, id: string) => t.perform(tok, { type: "unlock", entity: "company", id, field: "identity", from: "crystal" }, BASE);
  const unlock = (tok: string, entity: "company" | "engagement" | "contact", id: string, field: string) => t.perform(tok, { type: "unlock", entity, id, field }, BASE);
  const refused = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  const ledgerOf = async (memberId: string) => (await t.loadState()).ledger.filter((l) => l.memberId === memberId);
  const peopleOf = (c: Company) => [...c.people, ...c.engagements.flatMap((e) => e.people)];
  /** Every locked cell on a company's record, as unlock items. */
  const lockedOn = (c: Company) => [
    ...(c.hidden ? [{ entity: "company" as const, id: c.id, field: "identity" }] : []),
    ...c.engagements.flatMap((e) => Object.entries(e.cells).filter(([, x]) => x?.s === "locked").map(([field]) => ({ entity: "engagement" as const, id: e.id, field }))),
    ...peopleOf(c).flatMap((p) => Object.entries(p.cells).filter(([, x]) => x?.s === "locked").map(([field]) => ({ entity: "contact" as const, id: p.id, field }))),
  ];

  /* ---------- whose Crystal Ball has what ---------- */
  console.log("\nCrystal Ball's companies, by member");
  const ballTri = await radar.crystalPublicIds(TRI);
  const ballOth = await radar.crystalPublicIds(OTH);
  const ballFree = await radar.crystalPublicIds(FREE);
  check("Tia's Crystal Ball lists Orbweaver and Quillmark, not Sablecrest", ballTri.has(B1) && ballTri.has(B2) && !ballTri.has(OUT), [...ballTri]);
  check("Oto's lists Quillmark only", ballOth.has(B2) && !ballOth.has(B1) && !ballOth.has(OUT), [...ballOth]);
  check("Fen's lists all three, not Sablecrest", [B1, B2, B3].every((id) => ballFree.has(id)) && !ballFree.has(OUT), [...ballFree]);
  const me0 = Object.fromEntries(await Promise.all([TRI, PRO, FREE, OTH].map(async (tok) => [tok, (await view(tok)).me!] as const)));
  check("Me.crystal: all on Trial and Pro, one on Free", me0[TRI].crystal === "all" && me0[PRO].crystal === "all" && me0[OTH].crystal === "all" && me0[FREE].crystal === "one", Object.values(me0).map((m) => m.crystal));
  check("the free company of the day: Trial and Pro keep it, Free doesn't", me0[TRI].freeCompany === true && me0[PRO].freeCompany === true && me0[FREE].freeCompany === false);

  /* ---------- Trial ---------- */
  console.log("\nTrial: a Crystal Ball company opens free");
  const triRadar = await radar.radarView(TRI);
  check("Tia's Crystal Ball names Orbweaver while her table keeps it locked", triRadar?.rows.find((r) => r.id === B1)?.name === "Orbweaver Analytics" && company(await view(TRI), B1).hidden === true, triRadar?.rows);
  const c0 = await credits(TRI);
  const r1 = await open(TRI, B1);
  let tri = await view(TRI);
  const triB1 = company(tri, B1);
  check("opening it costs 0 credits", (await credits(TRI)) === c0, { before: c0, after: await credits(TRI) });
  check("and it is hers: named, its website, LinkedIn page and open role's posting", !triB1.hidden && triB1.name === "Orbweaver Analytics" && triB1.cells.website?.s === "value" && triB1.cells.linkedin?.s === "value" && triB1.engagements.find((e) => e.cells.posting?.s === "value") !== undefined, triB1.cells);
  check("the message says it opened free from Crystal Ball", /opened free from your Crystal Ball/.test(r1.message) && !/credit/.test(r1.message.replace(/no credits?/g, "")), r1.message);
  const triLines = await ledgerOf("mem_tri");
  check("the ledger has a 0-credit company unlock, why crystal", triLines.length === 1 && triLines[0].delta === 0 && triLines[0].reason === "unlock" && triLines[0].why === "crystal" && triLines[0].ref === "c_ball1.identity", triLines);
  check("the credit history says so", tri.ledger.some((l) => l.reason === t.CRYSTAL_LINE && l.company === "Orbweaver Analytics"), tri.ledger);
  check("the free company of the day is still hers", tri.me!.freeCompany === true, tri.me);
  // The same record a 2-credit unlock gives: Pam, without it in a Crystal Ball, pays for it.
  await unlock(PAY, "company", OUT, "identity"); // her free company of the day goes first
  const p0 = await credits(PAY);
  const payOut = await unlock(PAY, "company", B1, "identity");
  // Decision 1: on Trial and Pro any company opens free (fair use, PRO_OPENS_DAILY a day), outside Crystal Ball too.
  check("outside Crystal Ball the same company opens free on Trial too (fair use), not from Crystal Ball", (await credits(PAY)) === p0 && payOut.message.includes(t.PRO_OPEN_FREE) && !/Crystal Ball/.test(payOut.message), { before: p0, after: await credits(PAY), message: payOut.message });
  check("and it is the same record as Tia's", same(company(await view(PAY), B1), triB1), [company(await view(PAY), B1).cells, triB1.cells]);
  // People there cost what they cost. Who held its seats is free now that the company is open (PEERS_FREE).
  const ceo = peopleOf(triB1).find((p) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker")!;
  const c1 = await credits(TRI);
  await unlock(TRI, "contact", ceo.id, "name");
  check("a person there still costs 1", (await credits(TRI)) === c1 - 1);
  check("who held each seat there shows free, with the role", triB1.engagements.filter((e) => e.cells.operator?.s !== "empty").every((e) => e.cells.operator?.s === "value" && !e.cells.operator.paid), triB1.engagements.map((e) => e.cells.operator));
  // Opened again: nothing to open.
  check("opening it again opens nothing and spends nothing", /Nothing here is locked/.test((await refused(open(TRI, B1))) ?? "") && (await credits(TRI)) === c1 - 1);
  // The server decides.
  const forged = await refused(open(TRI, OUT));
  tri = await view(TRI);
  check("a company not in her Crystal Ball can't be opened free (a forged request)", forged === t.CRYSTAL_NOT_IN && company(tri, OUT).hidden === true && tri.me!.credits === c1 - 1, forged);
  check("only a company opens that way", /Only a company opens/.test((await refused(t.perform(TRI, { type: "unlock", entity: "contact", id: ceo.id, field: "email", from: "crystal" }, BASE))) ?? ""));
  const othForged = await refused(open(OTH, B1));
  check("Orbweaver is outside Oto's Crystal Ball: refused for him", othForged === t.CRYSTAL_NOT_IN && company(await view(OTH), B1).hidden === true, othForged);
  // Outside Crystal Ball the free company of the day works as before.
  const o0 = await credits(OTH);
  const othFree = await unlock(OTH, "company", OUT, "identity");
  // Trial and Pro: free opens up to PRO_OPENS_DAILY a day, outside Crystal Ball, and it says how many are left.
  check("Oto's company outside Crystal Ball opens free on Trial, with today's count", (await credits(OTH)) === o0 && othFree.message.includes(t.proOpenLine(14)), othFree.message);
  const othPaid = await unlock(OTH, "company", B1, "identity");
  check("then Orbweaver from the table is free too (13 left), not from Crystal Ball", (await credits(OTH)) === o0 && othPaid.message.includes(t.proOpenLine(13)) && !/Crystal Ball/.test(othPaid.message), othPaid.message);

  /* ---------- Pro ---------- */
  console.log("\nPro: the same");
  const q0 = await credits(PRO);
  await open(PRO, B1);
  let pro = await view(PRO);
  check("Pro opens a Crystal Ball company for 0 credits, and it is his", pro.me!.credits === q0 && !company(pro, B1).hidden && (await ledgerOf("mem_pro")).some((l) => l.why === "crystal" && l.delta === 0));
  check("and keeps the free company of the day", pro.me!.freeCompany === true);
  // Several at once (the connector's Unlock everything): the company free, the person 1 credit.
  const b2 = company(pro, B2);
  const b2ceo = peopleOf(b2)[0];
  const many = await t.perform(PRO, { type: "unlockMany", items: [{ entity: "company", id: B2, field: "identity" }, { entity: "contact", id: b2ceo.id, field: "name" }], from: "crystal" }, BASE);
  pro = await view(PRO);
  check("the company and a person in one go: only the person costs (1)", pro.me!.credits === q0 - 1 && !company(pro, B2).hidden && /opened free from your Crystal Ball/.test(many.message), { credits: pro.me!.credits, message: many.message });
  // 100 unlocks a day (lib/table.ts UNLOCK_DAILY_MAX): two companies opened free from Crystal Ball and one person leave 99.
  check("companies opened from Crystal Ball don't count toward the day's unlock limit", pro.me!.unlocksLeft === 99, pro.me!.unlocksLeft);

  /* ---------- Free ---------- */
  console.log("\nFree (trial over): one a day, fully open");
  const freeRadar = await radar.radarView(FREE);
  let free = await view(FREE);
  check("Free's Crystal Ball names no locked company", !(freeRadar?.rows ?? []).some((r) => r.name) && company(free, B1).hidden === true && !named(freeRadar?.rows.filter((r) => r.id === B1)).length, freeRadar?.rows);
  check("and the table keeps Orbweaver locked, people and all", !named(company(free, B1)).length, named(company(free, B1)));
  // A company Fen already sees in full doesn't use it.
  const known = await refused(open(FREE, B3));
  check("a company already fully known doesn't use today's", !!known && /already see everything/.test(known) && (await view(FREE)).me!.crystal === "one", known);
  // Outside Crystal Ball: no free company on Free.
  const f0 = await credits(FREE);
  const outFree = await unlock(FREE, "company", OUT, "identity");
  check("outside Crystal Ball, Free has no free company: 2 credits", (await credits(FREE)) === f0 - 2 && !outFree.message.includes(t.FREE_COMPANY_USED), outFree.message);
  // The full open.
  const othBeforeFull = company(await view(OTH), B1);
  const f1 = await credits(FREE);
  const full = await open(FREE, B1);
  free = await view(FREE);
  const fb1 = company(free, B1);
  check("the first full open of the day costs 0", free.me!.credits === f1, { before: f1, after: free.me!.credits });
  check("its message says what it was, and what Pro does", /Opened Orbweaver Analytics with everything on it, free/.test(full.message) && /Pro opens every company in your Crystal Ball/.test(full.message), full.message);
  check("the company is hers: name, website, LinkedIn page", !fb1.hidden && fb1.name === "Orbweaver Analytics" && fb1.cells.website?.s === "value" && fb1.cells.linkedin?.s === "value", fb1.cells);
  const cellsOf = (c: Company) => [...c.engagements.map((e) => e.cells), ...peopleOf(c).map((p) => p.cells)];
  check("nothing on it is locked any more", lockedOn(fb1).length === 0, lockedOn(fb1));
  const fe = (id: string) => fb1.engagements.find((e) => e.id === t.tableInternals.pubId(id))!;
  check("who held each seat and the role they held", fe("e_b1_mkt").cells.operator?.s === "value" && fe("e_b1_mkt").cells.role?.s === "value" && fe("e_b1_fin").cells.operator?.s === "value", [fe("e_b1_mkt").cells.operator, fe("e_b1_fin").cells.operator]);
  check("the rate, the end month and how it was sourced", fe("e_b1_mkt").cells.rate?.s === "value" && fe("e_b1_mkt").cells.end?.s === "value" && fe("e_b1_mkt").cells.sourced?.s === "value");
  check("the open role's posting and posted rate", fe("e_b1_open").cells.posting?.s === "value" && fe("e_b1_open").cells.rate?.s === "value");
  const fp = (id: string) => peopleOf(fb1).find((p) => p.id === t.tableInternals.pubId(id))!;
  check(
    "people's names, titles and contact details: LinkedIn, email, phone",
    ["name", "title", "email", "phone", "linkedin"].every((f) => fp("p_b1_ceo").cells[f]?.s === "value") && ["name", "title", "email"].every((f) => fp("p_b1_hire").cells[f]?.s === "value"),
    [fp("p_b1_ceo").cells, fp("p_b1_hire").cells],
  );
  check("every fact on file there shows", cellsOf(fb1).every((cells) => Object.values(cells).every((x) => !x || x.s !== "locked")));
  const freeLines = (await ledgerOf("mem_free")).filter((l) => l.why === "crystalFull");
  check("one ledger line: a 0-credit company unlock, why crystalFull", freeLines.length === 1 && freeLines[0].delta === 0 && freeLines[0].ref === "c_ball1.identity", freeLines);
  check("the credit history says so", free.ledger.some((l) => l.reason === t.CRYSTAL_FULL_LINE && l.company === "Orbweaver Analytics"));
  check("Me.crystal is used now", free.me!.crystal === "used");
  // Exactly what a member who paid for everything there sees: Pam pays for the rest.
  let payB1 = company(await view(PAY), B1);
  for (let k = 0; k < 4 && lockedOn(payB1).length; k++) {
    await t.perform(PAY, { type: "unlockMany", items: lockedOn(payB1) }, BASE);
    payB1 = company(await view(PAY), B1);
  }
  check("Pam paid for everything at Orbweaver", lockedOn(payB1).length === 0, lockedOn(payB1));
  check("Fen's free record is exactly Pam's paid one", same(fb1, payB1), JSON.stringify(sortKeys(fb1)).slice(0, 300) + " vs " + JSON.stringify(sortKeys(payB1)).slice(0, 300));
  // The second of the day.
  const second = await refused(open(FREE, B2));
  check("the second of the day is refused with the upgrade line", second === types.CRYSTAL_USED_LINE && (await credits(FREE)) === f1, second);
  // Another member's table is untouched.
  const mo = await view(OTH);
  check("Oto's Orbweaver record is the same before and after Fen's full open", same(company(mo, B1), othBeforeFull));
  const moB1 = company(mo, B1);
  check("Oto still sees Orbweaver's people locked", peopleOf(moB1).every((p) => p.cells.name.s === "locked" && p.cells.email?.s !== "value"), peopleOf(moB1).map((p) => p.cells.name));
  // Oto opened Orbweaver himself, so who held its seats is free to him too (PEERS_FREE); the people Fen opened stay hers.
  check("nothing Fen opened is in Oto's table", !named(company(mo, B1), ["Marisol", "Achterberg", "Bastian Quell", "marisol@", "555.0141"]).length);
  // The next UTC day: one again, and nothing already paid comes back.
  skew += DAY;
  free = await view(FREE);
  check("the next UTC day, Free has one again", free.me!.crystal === "one", free.me!.crystal);
  const f2 = free.me!.credits;
  const b2Before = company(free, B2);
  check("Quillmark: hers already (she paid 2 for it), its people locked", !b2Before.hidden && lockedOn(b2Before).length > 0);
  await open(FREE, B2);
  free = await view(FREE);
  check("its full open costs 0 and opens the rest", free.me!.credits === f2 && lockedOn(company(free, B2)).length === 0, lockedOn(company(free, B2)));
  check("and refunds nothing paid before", !(await ledgerOf("mem_free")).some((l) => l.reason === "refund"));
  check("one more today is refused", (await refused(open(FREE, B3))) === types.CRYSTAL_USED_LINE);
  // With today's used, Free unlocks a Crystal Ball company the ordinary way (the button reads "Unlock · 2 credits"): 2 credits, as anywhere.
  const B4 = idOf("Tidewater Goods");
  const f4 = await credits(FREE);
  check("Tidewater is locked for Fen and in her Crystal Ball", company(await view(FREE), B4).hidden === true && (await radar.crystalPublicIds(FREE)).has(B4));
  check("its free open is refused today", (await refused(open(FREE, B4))) === types.CRYSTAL_USED_LINE && (await credits(FREE)) === f4);
  const paid4 = await unlock(FREE, "company", B4, "identity");
  free = await view(FREE);
  check("its ordinary unlock opens it for 2 credits, named", !company(free, B4).hidden && company(free, B4).name === "Tidewater Goods" && (await credits(FREE)) === f4 - 2 && free.me!.crystal === "used", paid4.message);
  check("and its ledger line is an ordinary 2-credit company unlock", (await ledgerOf("mem_free")).some((l) => l.ref === "c_ball4.identity" && l.delta === -2 && !l.why), (await ledgerOf("mem_free")).filter((l) => l.ref === "c_ball4.identity"));

  /* ---------- the connector ---------- */
  console.log("\nThe connector");
  const ctx = async (tok: string) => ({ member: (await t.memberForToken(tok))!, origin: BASE });
  const triCtx = await ctx(TRI);
  // Tia: Quillmark is still locked for her and in her Crystal Ball.
  const q = (await tools.unlock(triCtx, { entity: "company", id: B2, field: "identity" })) as { would_spend?: number; message: string };
  check("unlock quotes 0 for a Crystal Ball company, and says why", q.would_spend === 0 && /in the member's Crystal Ball, so on their plan it opens free/.test(q.message), q);
  const got = (await tools.getCompany(triCtx, { company: B2 })) as { hidden_note?: string; in_crystal_ball?: boolean };
  check("get_company says it opens free", got.in_crystal_ball === true && /opens free \(0 credits\)/.test(got.hidden_note ?? ""), got.hidden_note);
  const found = (await tools.searchCompanies(triCtx, { limit: 40 } as never)) as { companies: { id: string; in_crystal_ball?: boolean; hidden_note?: string }[] };
  const inList = found.companies.find((c) => c.id === B2);
  check("search_companies says so too", inList?.in_crystal_ball === true && /opens free/.test(inList.hidden_note ?? ""), inList);
  const roles = (await tools.listOpenRoles(triCtx, { limit: 40 })) as { roles: { company_id: string; unlock: { cost?: string } | string }[] };
  const b2Role = roles.roles.find((r) => r.company_id === B2);
  check("list_open_roles quotes 0 credits for its open role's company", !!b2Role && typeof b2Role.unlock === "object" && /^0 credits: it's in the member's Crystal Ball/.test(b2Role.unlock.cost ?? ""), b2Role);
  // Pam: Ravenmoor isn't in her Crystal Ball. On Trial it opens free within the day's fair use.
  await unlock(PAY, "company", B2, "identity");
  const qOut = (await tools.unlock(await ctx(PAY), { entity: "company", id: B3, field: "identity" })) as { would_spend?: number; message: string };
  check("for a member without it in Crystal Ball: 0 on Trial (fair use), said so, no Crystal Ball words", qOut.would_spend === 0 && /opens free on the member's plan \(15 a day\)/.test(qOut.message) && !/Crystal Ball/.test(qOut.message), qOut);
  const done = (await tools.unlock(triCtx, { entity: "company", id: B2, field: "identity", confirm: true })) as { confirmed?: boolean; credits_left?: number };
  check("confirmed, it spends nothing and the company is hers", done.confirmed === true && done.credits_left === (await credits(TRI)) && !company(await view(TRI), B2).hidden, done);
  const acct = (await tools.myAccount(await ctx(FREE))) as { free_company_today?: string; how_credits_work?: string };
  check("my_account on Free: no free company here, one a day from Crystal Ball in the app", /none on the Free plan/.test(acct.free_company_today ?? "") && /Crystal Ball/.test(acct.how_credits_work ?? ""), acct.free_company_today);
  const acctPro = (await tools.myAccount(await ctx(PRO))) as { crystal_ball?: string };
  check("my_account on Pro: every Crystal Ball company opens free", /opens free \(0 credits\)/.test(acctPro.crystal_ball ?? ""), acctPro.crystal_ball);
  const qFree = (await tools.unlock(await ctx(OTH), { entity: "company", id: OUT, field: "identity" })) as { would_spend?: number };
  check("a company Oto already has quotes nothing", (qFree as { spent?: number }).spent === 0 || qFree.would_spend === 0, qFree);

  /* ---------- ?first=1 and ?today=1 ---------- */
  console.log("\n?first=1 and ?today=1");
  for (const [who, tok] of [["Tia", TRI], ["Fen", FREE], ["Oto", OTH]] as const) {
    const full = await view(tok);
    const fpg = await firstPage(tok, `?c=${B1}`);
    const rec = fpg && "view" in fpg ? unpackView(JSON.parse(JSON.stringify(fpg.view))).companies.find((c) => c.id === B1) : undefined;
    check(`${who}: ?first=1 carries Orbweaver exactly as the table does`, !!rec && same(rec, company(full, B1)));
    const td = (await todayView(tok))!;
    check(`${who}: ?today=1's Me says the same plan rule`, td.me.crystal === full.me!.crystal && td.freeCompany === !!full.me!.freeCompany, [td.me.crystal, full.me!.crystal]);
    const recs = td.companies.map((c) => unpackCompany(JSON.parse(JSON.stringify(c))));
    check(`${who}: ?today=1's records are the table's`, recs.length > 0 && recs.every((c) => same(c, company(full, c.id))), recs.map((c) => c.id));
  }

  /* ---------- the words in Slack and email ---------- */
  console.log("\nSlack and email");
  const card = (o: Partial<import("../lib/radar/types").RadarCard>) => ({
    id: "id1", co: "co1", kind: "role" as const, headline: "New open role: Fractional VP Sales, at Named Co", facts: ["51–200 people", "SaaS"], why: "An open Sales role, at a company in your profile", company: "Named Co", url: "https://post.example.com/day", at: iso(0), subject: "Named Co", signal: "New open role: Fractional VP Sales", place: "/?c=named", band: "High" as const, whyNow: "Hiring now", ...o,
  });
  const dayOf = (cards: ReturnType<typeof card>[]) => ({ cards, total: cards.length, companies: cards.length, day: today, url: "https://post.example.com/day", mode: "daily" as const });
  const proAlert = fmt.radarAlert([{ kind: "radar", at: iso(0), day: dayOf([card({ opens: "free" })]) }], BASE)!;
  const proEntry = proAlert.entries![0];
  check("Trial or Pro in Slack: 'Open it in Merlin, free from your Crystal Ball', not the 2-credit line", proEntry.note?.includes(fmt.OPEN_FREE_LINE) === true && !/2 credits/.test(JSON.stringify(proEntry)), proEntry.note);
  check("and its button opens the day's companies, where it opens free", proEntry.button?.url === "https://post.example.com/day" && !proEntry.link, proEntry);
  const mailPro = fmt.renderRadarEmail({ name: "Tia", day: dayOf([card({ opens: "free" })]), unsubscribeUrl: "https://post.example.com/u", appUrl: BASE });
  check("and in the email: its button says Open free, and the email says why once", mailPro.text.includes("Open free: ") && mailPro.html.includes(">Open free</a>") && !/Locked for you|credits/.test(mailPro.text) && mailPro.html.includes("opens free from your Crystal Ball"), mailPro.text);
  const freeCard = card({ company: null, locked: true, opens: "one", subject: "A SaaS company", place: undefined });
  const freeMail = fmt.renderRadarEmail({ name: "Fen", day: dayOf([freeCard]), unsubscribeUrl: "https://post.example.com/u", appUrl: BASE });
  // Changed: on Free only one company a day opens free, so its card says which ("Open free (today's)"), never a bare "Open free".
  check("Free in the email: one a day, from Crystal Ball", freeMail.text.includes("One Crystal Ball company a day opens free, with everything on it.") && freeMail.text.includes("Open free (today's): ") && !freeMail.html.includes(">Open free</a>"), freeMail.text);
  const offCard = card({ company: null, locked: true, subject: "A SaaS company", place: undefined });
  const offMail = fmt.renderRadarEmail({ name: "Bo", day: dayOf([offCard]), unsubscribeUrl: "https://post.example.com/u", appUrl: BASE });
  check("billing off: the 2-credit unlock, and the button says Open in Merlin", offMail.text.includes("A locked company unlocks in Merlin for 2 credits.") && offMail.html.includes(">Open in Merlin</a>") && !offMail.html.includes(">Open free</a>"), offMail.text);
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
