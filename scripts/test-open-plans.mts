/**
 * Open data on paid plans ("Pro opens everything", the owner's decision of 2026-11-24), with billing
 * live. No server: lib/table.ts runs in process on a made-up seed in a temporary data dir, fetch
 * replaced (nothing reaches Stripe), the clock moved where a rule is about days.
 *
 *   npx tsx scripts/test-open-plans.mts      exits 1 on any failure
 *
 * Covered:
 *   1. Pro and Close see everything with 0 credits: company names, websites and LinkedIn, who held
 *      each seat and the role, rates, end months, postings, people's names, titles and LinkedIn
 *      profiles. Unlock a company says nothing is locked. Me.openAll, no trial count.
 *   2. Email and phone: 1 credit each on Pro, only where a fellow fractional added them (nothing to
 *      buy where none was added), after the name (which shows free).
 *   3. The email finder is private: an email Merlin found shows to nobody (never sold), "findEmail"
 *      opens it for the member who runs it, free, and nobody else sees it, a Pro member included.
 *   4. The trial: lists keep companies locked until opened; one open opens everything there but
 *      email and phone, for 0 credits; 40 a UTC day; the 41st is refused clearly with nothing
 *      spent; Open all opens what today allows and says how many wait; the next day has 40 again.
 *   5. Trial end without an upgrade: trial-opened companies lock again, except one the member paid
 *      credits for, one they contributed to, one where they hold a seat. Cancel from Pro: the same.
 *      The old rules' free opens (ledger why "free" on a plan) move apart from paid unlocks once.
 *   6. Free is unchanged: a company is 2 credits, a person 1, the API never sends a locked value.
 *   7. California rule on Pro: a leader in California is never on the record, on any plan.
 *      A fractional who keeps out of the directory stays hidden on Pro.
 *   8. Rate limits (lib/usageGuard.ts): normal use passes, a scripted burst trips, Health counts it.
 *   9. The words: OPEN_LINE everywhere the plans are described, and no "15 a day" left.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-open-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

/* ---------- the made-up seed ---------- */

const N = 46;
const pad = (k: number) => String(k).padStart(2, "0");
const companies = [
  ...Array.from({ length: N }, (_, k) => ({ id: `c_o${pad(k)}`, fields: { name: `Openco ${pad(k)} Works`, website: `openco${pad(k)}.example`, linkedin: `https://www.linkedin.com/company/openco${pad(k)}`, industry: "SaaS", employees: "51–200", hq: "Austin, TX" } })),
  { id: "c_find", fields: { name: "Larkspur Learning", website: "larkspur.example", industry: "Education", employees: "51–200", hq: "Denver, CO" } },
  { id: "c_priv", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Logistics", employees: "51–200", hq: "Dallas, TX" } },
];
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, verified: false, fields: { source: "Published engagement", type: "Fractional", ...fields } });
const engagements = [
  ...Array.from({ length: N }, (_, k) => seat(`e_o${pad(k)}`, `c_o${pad(k)}`, { operator: `Hollis Holder${pad(k)}`, role: "Fractional VP Sales", function: "Sales", start: "2023-02", status: "Ended", end: "2024-05", rate: "$9k/mo", sourced: "Referral" })),
  seat("e_priv", "c_priv", { operator: "Ines Private", role: "Fractional COO", function: "Operations", start: "2022-02", status: "Ended", end: "2022-12" }),
];
const contacts = [
  ...Array.from({ length: N }, (_, k) => ({ id: `p_o${pad(k)}`, companyId: `c_o${pad(k)}`, fields: { name: `Dana Decider${pad(k)}`, title: "CEO", relationship: "Decision maker", linkedin: `https://www.linkedin.com/in/dana-decider-${pad(k)}` } })),
  { id: "p_find_a", companyId: "c_find", fields: { name: "Avery Stone", title: "COO", relationship: "Decision maker" } },
  { id: "p_find_b", companyId: "c_find", fields: { name: "Blair Fields", title: "CFO", relationship: "Decision maker" } },
];
const member = (id: string, name: string) => ({ id, name, email: `${id.slice(4)}.open@example.com`, title: "Fractional VP Sales", token: `tok-${id.slice(4)}-open` });
const seed = {
  builtAt: iso(-90 * DAY),
  members: [
    member("mem_pro", "Pat Pro"),
    member("mem_clo", "Cleo Close"),
    member("mem_tri", "Tia Trial"),
    member("mem_tend", "Ty Trialend"),
    member("mem_can", "Cam Cancel"),
    member("mem_free", "Fen Free"),
    member("mem_peer", "Pia Peer"),
    member("mem_ines", "Ines Private"),
    { id: "mem_ada", name: "Ada Admin", email: "admin-open@example.com", title: "Admin", token: "tok-ada-open" },
  ],
  companies,
  engagements,
  contacts,
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const v = (value: string, by: string) => ({ value, by, at: iso(-10 * DAY), status: "live" });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [
      // Ty paid 2 credits for Openco 03 before his trial ended, and opened Openco 04 free in it under the old rules.
      { memberId: "mem_tend", delta: -2, reason: "unlock", ref: "c_o03.identity", at: iso(-5 * DAY) },
      { memberId: "mem_tend", delta: 0, reason: "unlock", ref: "c_o04.identity", at: iso(-4 * DAY), why: "free" },
    ],
    // Pia added the only email and phone on file at Openco 00, and two emails at Larkspur (its pattern, first.last).
    values: {
      "p_o00.email": v("dana.decider00@openco00.example", "mem_peer"),
      "p_o00.phone": v("512.555.0100", "mem_peer"),
      "p_find_a.email": v("avery.stone@larkspur.example", "mem_peer"),
      "p_find_b.email": v("blair.fields@larkspur.example", "mem_peer"),
    },
    unlocks: { "c_o03.identity": ["mem_tend"], "c_o04.identity": ["mem_tend"] },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, iso(-HOUR)])),
    profiles: {
      ...Object.fromEntries(seed.members.map((m) => [m.id, { function: "Sales", onboarded: true }])),
      mem_ines: { function: "Operations", onboarded: true, fractionals: false },
    },
    // A leader read from Larkspur's own team page: a likely email from its pattern (the email finder's kind), and one in California.
    leaders: {
      c_find: {
        status: "found",
        checkedAt: iso(-2 * DAY),
        ok: true,
        v: 99,
        functions: {
          Sales: { level: "VP", kind: "full-time", how: "team page", url: "https://larkspur.example/team", seenAt: iso(-2 * DAY), name: "Casey Golden", title: "VP Sales", california: true },
        },
        top: { level: "C-level", kind: "full-time", how: "team page", url: "https://larkspur.example/team", seenAt: iso(-2 * DAY), name: "Lena Leader", title: "CEO", rank: 1 },
      },
    },
    billing: {
      members: {
        mem_pro: { trialStartedAt: iso(-60 * DAY), trialEndsAt: iso(-39 * DAY), proUntil: iso(20 * DAY), interval: "month", paidSince: iso(-39 * DAY) },
        mem_clo: { trialStartedAt: iso(-60 * DAY), trialEndsAt: iso(-39 * DAY), proUntil: iso(20 * DAY), interval: "month", paidSince: iso(-39 * DAY), tier: "close" },
        mem_tri: { trialStartedAt: iso(-2 * DAY), trialEndsAt: iso(19 * DAY) },
        // Ty's trial ends in 2 days.
        mem_tend: { trialStartedAt: iso(-19 * DAY), trialEndsAt: iso(2 * DAY) },
        // Cam is on Pro, cancelled: it runs to 3 days from now, then Free.
        mem_can: { trialStartedAt: iso(-60 * DAY), trialEndsAt: iso(-39 * DAY), proUntil: iso(3 * DAY), interval: "month", paidSince: iso(-39 * DAY), cancelAt: iso(-DAY) },
        mem_free: { trialStartedAt: iso(-40 * DAY), trialEndsAt: iso(-19 * DAY) },
        mem_peer: { trialStartedAt: iso(-40 * DAY), trialEndsAt: iso(-19 * DAY) },
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
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-open@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_open",
  STRIPE_WEBHOOK_SECRET: "whsec_test_open",
  STRIPE_PRICE_MONTH: "price_month_open",
  STRIPE_PRICE_YEAR: "price_year_open",
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_INTEL_SEED_KEY", "RN_GOOGLE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

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

async function main() {
  const t = await import("../lib/table");
  const F = await import("../lib/tableFields");
  const U = await import("../lib/usageGuard");
  const tools = await import("../lib/mcp/tools");
  type View = Awaited<ReturnType<typeof t.buildView>>;
  const BASE = "https://post.example.com";
  const PRO = "tok-pro-open";
  const CLO = "tok-clo-open";
  const TRI = "tok-tri-open";
  const TEND = "tok-tend-open";
  const CAN = "tok-can-open";
  const FREE = "tok-free-open";
  const PEER = "tok-peer-open";

  const ada = await t.buildView("tok-ada-open");
  const idOf = (name: string) => ada.companies.find((c) => c.name === name)!.id;
  const O = (k: number) => idOf(`Openco ${pad(k)} Works`);
  const FIND = idOf("Larkspur Learning");
  const PRIV = idOf("Halcyon Freight");
  const pub = (id: string) => t.tableInternals.pubId(id);
  const view = (tok: string) => t.buildView(tok);
  const company = (vw: View, id: string) => vw.companies.find((c) => c.id === id)!;
  const credits = async (tok: string) => (await view(tok)).me!.credits;
  const unlock = (tok: string, entity: "company" | "engagement" | "contact", id: string, field: string) => t.perform(tok, { type: "unlock", entity, id, field }, BASE);
  const refused = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };
  /** Every gated cell of a company as the viewer sees it, by "seat.field" / "person.field". */
  const cellsOf = (c: View["companies"][number]) => {
    const out: Record<string, string> = {};
    for (const e of c.engagements) for (const [k, x] of Object.entries(e.cells)) out[`seat.${k}`] = x.s;
    for (const p of c.people) for (const [k, x] of Object.entries(p.cells)) out[`person.${k}`] = x.s;
    return out;
  };
  const anyLockedValue = (vw: View) => JSON.stringify(vw).match(/"s":"locked","v":/);

  /* ---------- 1. Pro and Close: everything with 0 credits ---------- */
  console.log("\n1. Pro and Close see everything with 0 credits");
  for (const [tok, plan] of [
    [PRO, "Pro"],
    [CLO, "Close"],
  ] as const) {
    const vw = await view(tok);
    const c0 = vw.me!.credits;
    check(`${plan}: Me.openAll, no trial count`, vw.me!.openAll === true && !vw.me!.proOpens, { openAll: vw.me!.openAll, proOpens: vw.me!.proOpens });
    const all = vw.companies.filter((c) => c.id.startsWith("c_") || true);
    check(`${plan}: no company is locked (${all.length})`, all.every((c) => !c.hidden && c.name !== F.HIDDEN_COMPANY), all.filter((c) => c.hidden).length);
    const c = company(vw, O(7));
    const cells = cellsOf(c);
    check(`${plan}: name, website and LinkedIn page show`, c.name === "Openco 07 Works" && c.cells.website?.s === "value" && c.cells.linkedin?.s === "value", { name: c.name, website: c.cells.website, linkedin: c.cells.linkedin });
    check(
      `${plan}: who held the seat, role, rate, end month and sourced show`,
      ["seat.operator", "seat.role", "seat.rate", "seat.end", "seat.sourced"].every((k) => cells[k] === "value"),
      cells,
    );
    check(`${plan}: the decider's name, title and LinkedIn profile show`, ["person.name", "person.title", "person.linkedin"].every((k) => cells[k] === "value"), cells);
    check(`${plan}: nothing locked anywhere but email and phone`, !Object.entries(cellsOf(company(vw, O(0)))).some(([k, x]) => x === "locked" && !/person\.(email|phone)/.test(k)), cellsOf(company(vw, O(0))));
    check(`${plan}: unlock a company says nothing is locked, 0 spent`, /Nothing here is locked on your plan/.test((await refused(unlock(tok, "company", O(9), "identity"))) ?? "") && (await credits(tok)) === c0);
    check(`${plan}: credits unchanged by looking`, (await credits(tok)) === c0);
  }
  const acctPro = (await tools.myAccount({ member: (await t.memberForToken(PRO))!, origin: BASE })) as { free_company_today?: string; how_credits_work?: string };
  check("my_account on Pro says everything is open, in the one line", (acctPro.how_credits_work ?? "").startsWith(F.OPEN_LINE) && /every company is open/.test(acctPro.free_company_today ?? ""), acctPro);

  /* ---------- 2. Email and phone: 1 credit each, peer-added only ---------- */
  console.log("\n2. Email and phone: 1 credit each on Pro, where a fellow fractional added them");
  let pro = await view(PRO);
  const dana = company(pro, O(0)).people[0];
  check("Pro: the email and phone a peer added are locked", dana.cells.email?.s === "locked" && dana.cells.phone?.s === "locked", dana.cells);
  check("and the locked value is never sent", !anyLockedValue(pro) && !JSON.stringify(pro).includes("dana.decider00@openco00.example"));
  const other = company(pro, O(1)).people[0];
  check("Pro: where no peer added an email or phone, there is nothing to buy", other.cells.email?.s !== "locked" && other.cells.phone?.s !== "locked", other.cells);
  const p0 = pro.me!.credits;
  const em = await unlock(PRO, "contact", dana.id, "email");
  pro = await view(PRO);
  check("the email costs 1 credit (the name before it was free)", (await credits(PRO)) === p0 - 1 && company(pro, O(0)).people[0].cells.email?.s === "value", em.message);
  await unlock(PRO, "contact", dana.id, "phone");
  check("the phone costs 1 more", (await credits(PRO)) === p0 - 2);
  check("nothing to unlock on a person with no email on file", /Nothing here is locked/.test((await refused(unlock(PRO, "contact", other.id, "email"))) ?? ""));

  /* ---------- 3. The email finder is private ---------- */
  console.log("\n3. The email finder: private to the member who runs it, never sold");
  pro = await view(PRO);
  const lena = company(pro, FIND).people.find((p) => p.cells.name?.s === "value" && (p.cells.name as { v: string }).v === "Lena Leader");
  check("the website leader shows on Pro, with a findable email (not for sale)", !!lena && lena.cells.email?.s === "empty" && (lena.cells.email as { find?: true }).find === true, lena?.cells);
  check("its likely email is in nobody's view", !JSON.stringify(pro).includes("lena.leader@larkspur.example"));
  const peerView = await view(PEER);
  check("not in another member's view either (Free)", !JSON.stringify(peerView).includes("lena.leader@larkspur.example"));
  const cBefore = await credits(PRO);
  const found = await t.perform(PRO, { type: "findEmail", id: lena!.id }, BASE);
  pro = await view(PRO);
  const lena2 = company(pro, FIND).people.find((p) => p.id === lena!.id)!;
  check("findEmail shows it to the runner, free, marked as theirs alone", lena2.cells.email?.s === "value" && (lena2.cells.email as { v: string; found?: true }).v === "lena.leader@larkspur.example" && (lena2.cells.email as { found?: true }).found === true && (await credits(PRO)) === cBefore, { cell: lena2.cells.email, msg: found.message });
  check("its words say only they see it", found.message === t.FOUND_EMAIL);
  const clo = await view(CLO);
  check("another Pro or Close member still doesn't see it", !JSON.stringify(clo).includes("lena.leader@larkspur.example"));
  check("and can't buy it", /Nothing here is locked/.test((await refused(unlock(CLO, "contact", lena!.id, "email"))) ?? ""));
  const asked = (await tools.getCompany({ member: (await t.memberForToken(CLO))!, origin: BASE }, { id: FIND }).catch((e: Error) => ({ error: e.message }))) as unknown;
  check("the connector for another member never carries it", !JSON.stringify(asked).includes("lena.leader@larkspur.example"));

  /* ---------- 7. California and the directory (on Pro) ---------- */
  console.log("\n7. California rule and directory privacy on Pro");
  check("a leader in California is never named on Pro", !JSON.stringify(pro).includes("Casey Golden") && !JSON.stringify(clo).includes("Casey Golden"));
  const ines = company(pro, PRIV).engagements[0];
  check("a fractional who keeps out of the directory stays hidden on Pro", ines.cells.operator?.s === "locked" && !JSON.stringify(pro).includes("Ines Private"), ines.cells.operator);

  /* ---------- 4. The trial: 40 companies a day, in full ---------- */
  console.log("\n4. The trial: up to 40 companies a UTC day, each opened in full");
  let tri = await view(TRI);
  const tc0 = tri.me!.credits;
  check("Me.proOpens: 40 of 40 left today, not openAll", tri.me!.proOpens?.left === 40 && tri.me!.proOpens.of === F.TRIAL_OPENS_DAILY && F.TRIAL_OPENS_DAILY === 40 && !tri.me!.openAll, tri.me!.proOpens);
  check("lists show companies locked until opened", company(tri, O(0)).hidden === true && company(tri, O(0)).name === F.HIDDEN_COMPANY);
  check("and their people locked", cellsOf(company(tri, O(0)))["person.name"] === "locked");
  const first = await unlock(TRI, "company", O(0), "identity");
  tri = await view(TRI);
  const opened = company(tri, O(0));
  const oc = cellsOf(opened);
  check("one open opens the company with everything on it, 0 credits", !opened.hidden && opened.name === "Openco 00 Works" && ["seat.operator", "seat.role", "seat.rate", "seat.end", "person.name", "person.title", "person.linkedin"].every((k) => oc[k] === "value") && tri.me!.credits === tc0, { oc, msg: first.message });
  check("but email and phone stay 1 credit each", oc["person.email"] === "locked" && oc["person.phone"] === "locked");
  check("its words say what opened and how many are left", /^Opened Openco 00 Works with everything on it\./.test(first.message) && first.message.includes("39 of today's 40"), first.message);
  check("the credit history reads it as opened free in the trial", tri.ledger.some((l) => /Opened free in your/.test(l.reason)), tri.ledger.map((l) => l.reason));
  // Open all: 39 left. Asking for 44 more is refused whole with how many still open; the bulk quote offers the 39 that fit.
  const items = Array.from({ length: 44 }, (_, k) => ({ entity: "company" as const, id: O(k + 1), field: "identity" }));
  const over = await refused(t.perform(TRI, { type: "unlockMany", items }, BASE));
  check("asking for more companies than today allows is refused whole, saying how many still open", over === t.trialOpensOver(39) && /39 more companies today/.test(over ?? ""), over);
  const Q = await import("../lib/unlockQuote");
  const quote = await Q.quoteUnlock(TRI, items);
  check("the bulk quote offers the 39 that fit, free, with the server's words", quote?.fits === 39 && quote.cost === 0 && quote.stop === t.trialOpensOver(39), quote);
  const many = await t.perform(TRI, { type: "unlockMany", items: items.slice(0, 39) }, BASE);
  tri = await view(TRI);
  const openNow = Array.from({ length: N }, (_, k) => company(tri, O(k))).filter((c) => !c.hidden).length;
  check("Open all within the cap opens them (40 in all), 0 credits", openNow === 40 && tri.me!.credits === tc0 && /That was the last of today's 40/.test(many.message), { openNow, msg: many.message });
  check("Me.proOpens: none left", tri.me!.proOpens?.left === 0);
  const r41 = await refused(unlock(TRI, "company", O(41), "identity"));
  check("the 41st is refused clearly, nothing spent", r41 === F.TRIAL_OPENS_USED && (await credits(TRI)) === tc0, r41);
  const q41 = (await tools.unlock({ member: (await t.memberForToken(TRI))!, origin: BASE }, { entity: "company", id: O(41), field: "identity" }).catch((e: Error) => ({ error: e.message }))) as { error?: string };
  check("the connector refuses it in the same words", q41.error === F.TRIAL_OPENS_USED, q41);
  skew += DAY;
  tri = await view(TRI);
  check("the next UTC day: 40 again, and yesterday's stay open", tri.me!.proOpens?.left === 40 && !company(tri, O(5)).hidden);
  await unlock(TRI, "company", O(41), "identity");
  tri = await view(TRI);
  check("the 41st opens the next day", !company(tri, O(41)).hidden && tri.me!.proOpens?.left === 39);
  skew -= DAY;

  /* ---------- 5. Trial end and cancel ---------- */
  console.log("\n5. When the trial ends without an upgrade, or Pro is cancelled");
  // Ty, in his last 2 days: the old rules' free open (Openco 04) moved apart; he opens 05, 06 and 07 now,
  // pays for nothing at 05, adds a fact at 06 (contributed), and holds the seat at 07 (his name on it).
  let ty = await view(TEND);
  check("an old free open on a plan was moved apart from paid unlocks", !(await t.loadState()).unlocks["c_o04.identity"]?.includes("mem_tend") && !!(await t.loadState()).planOpens?.mem_tend?.c_o04, (await t.loadState()).planOpens?.mem_tend);
  check("and it still shows during the trial", !company(ty, O(4)).hidden);
  for (const k of [5, 6, 7]) await unlock(TEND, "company", O(k), "identity");
  ty = await view(TEND);
  const filled = await t.perform(TEND, { type: "fill", entity: "company", id: O(6), field: "revenue", value: "$5M–$20M" }, BASE);
  check("he can add a fact at a company the trial opened", /Added/.test(filled.message), filled.message);
  await t.tableInternals.mutate((s: { values: Record<string, unknown> }) => {
    s.values["e_o07.operator"] = { value: "Ty Trialend", by: "mem_tend", at: new Date().toISOString(), status: "live", memberId: "mem_tend" };
  });
  skew += 3 * DAY;
  ty = await view(TEND);
  check("after the trial: a company opened in it locks again", company(ty, O(5)).hidden === true && company(ty, O(4)).hidden === true);
  check("one paid for with credits stays open", !company(ty, O(3)).hidden);
  check("one contributed to stays open", !company(ty, O(6)).hidden);
  check("one where they hold a seat stays open", !company(ty, O(7)).hidden);
  check("and Free's rules are back: no trial count, no openAll", !ty.me!.proOpens && !ty.me!.openAll);
  check("the people at a relocked company are locked again", cellsOf(company(ty, O(5)))["person.name"] === "locked");
  const cam = await view(CAN);
  check("Pro cancelled, past its paid period: back to Free, companies locked", !cam.me!.openAll && company(cam, O(9)).hidden === true);
  skew -= 3 * DAY;
  const camNow = await view(CAN);
  check("while its paid period runs, a cancelled Pro still opens everything", camNow.me!.openAll === true && !company(camNow, O(9)).hidden);

  /* ---------- 6. Free unchanged ---------- */
  console.log("\n6. Free is unchanged");
  let fen = await view(FREE);
  check("Free: companies locked, no openAll, no trial count", company(fen, O(20)).hidden === true && !fen.me!.openAll && !fen.me!.proOpens);
  check("the API never sends a locked value to Free", !anyLockedValue(fen) && !JSON.stringify(fen).includes("Openco 20 Works") && !JSON.stringify(fen).includes("Dana Decider20"));
  const f0 = fen.me!.credits;
  await unlock(FREE, "company", O(20), "identity");
  check("a company is 2 credits on Free", (await credits(FREE)) === f0 - 2);
  fen = await view(FREE);
  await unlock(FREE, "contact", company(fen, O(20)).people[0].id, "name");
  fen = await view(FREE);
  check("a person's name and title are 1 credit on Free", (await credits(FREE)) === f0 - 3 && company(fen, O(20)).people[0].cells.title?.s === "value");

  /* ---------- 8. Rate limits ---------- */
  console.log("\n8. Per-member rate limits: normal use passes, a burst trips");
  U.usageReset();
  let stop: string | null = null;
  for (let k = 0; k < 40; k++) stop = U.memberRead("mem_human", "table") ?? stop;
  check("40 reads in a minute (a busy person) pass", stop === null);
  let tripAt = 0;
  for (let k = 0; k < 200 && !tripAt; k++) if (U.memberRead("mem_script", "company")) tripAt = k + 1;
  check(`a scripted burst trips at the per-minute limit (${U.READS_PER_MINUTE})`, tripAt === U.READS_PER_MINUTE + 1, tripAt);
  const st = U.usageStats();
  check("Health counts it: who tripped and where, counts only", st.trippedMembers === 1 && st.trips.company >= 1 && st.readers === 2 && !JSON.stringify(st).includes("mem_"), st);
  const adm = await t.buildView("tok-ada-open");
  const usage = adm.admin?.health?.usage;
  check("Health carries the counts with the trial's opens today", !!usage && typeof usage.trialOpens === "number" && usage.trialOpens >= 1 && typeof usage.heavy === "number", usage);

  /* ---------- 9. The words ---------- */
  console.log("\n9. One line everywhere the plans are described");
  check("the one line", F.OPEN_LINE === "Pro opens everything. Credits are only for email and phone numbers, which come from fellow fractionals.");
  const files = ["lib/billing/compare.ts", "app/post/Billing.tsx", "app/post/Credits.tsx", "app/landing/faq.ts", "lib/mcp/server.ts", "lib/mcp/tools.ts"];
  for (const f of files) check(`${f} says it (OPEN_LINE)`, /OPEN_LINE|OPENS_RULE/.test(readFileSync(f, "utf8")), f);
  for (const f of [...files, "lib/tableFields.ts", "app/landing/Pricing.tsx", "app/onboard/Setup.tsx", "app/onboard/Classic.tsx"])
    check(`${f} no longer says "15 a day"`, !/15 a (UTC )?day|up to 15\b/.test(readFileSync(f, "utf8")), f);
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
