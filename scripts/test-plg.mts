/**
 * Plans, credits and upgrade moments (the owner's PLG decisions), with billing live. No server:
 * lib/table.ts runs in process on a made-up seed in a temporary data dir, with fetch replaced
 * (nothing reaches Stripe or leaves the machine) and the clock moved forward where a rule is about
 * days. The pages are rendered in process (stylesheets are nothing here).
 *
 *   npx tsx scripts/test-plg.mts      exits 1 on any failure
 *
 * Covered:
 *   1. Pro opens companies free, up to PRO_OPENS_DAILY (15) a UTC day beyond Crystal Ball: each one
 *      says how many are left, the 16th costs 2 with "You've opened 15 companies today. More open
 *      tomorrow, or use 2 credits.", Crystal Ball's stay free and don't count, the free opens don't
 *      use the day's unlock limit, the connector quotes it, and the next UTC day has 15 again. Free
 *      is unchanged: other companies are 2 credits.
 *   2. Fellow fractionals are free: who held a seat and the role they held open free once the
 *      company is visible (before that: the company first), a member who keeps out of the
 *      directory keeps their price, Fractionals names a fellow fractional free, and contact details
 *      and the company's own people keep their price (1 credit each).
 *   3. No price tied to outcomes in any of the plans' words.
 *   4. PlanPill in the top bar: "Close trial · N days left · Upgrade", "Upgrade to Pro", nothing on Pro.
 *   5. The plan comparison's rows (Proposals and e-signature, Opening companies, Fellow fractionals,
 *      Open roles as alerts) and VALUE_LINE, the Pro welcome's and the trial-ended card's story.
 *   6. The landing page's pricing: $59 a month or $590 a year, the 21-day trial, no card, the same
 *      rows, framed by return, and no rate cited.
 *   7. Out of credits: three choices in one line ("Earn one: add a fact", "50 for $19", "Pro:
 *      companies free") on the 0-credit nudge and in the record's Get 2 credits.
 *   8. The trial's end as a loss: PlanView.summary in its last 4 days ("You opened 3 companies free
 *      and sent 3 notes; 1 proposal is out." / "In 3 days companies cost 2 credits again and your
 *      second saved view stops emailing."), Home's card with "So far", and the day-18 email.
 *  10. No Free earning taper, with the clock moved: past the first 30 days, facts about other
 *      people's companies still earn up to the daily 25 (the 11th earns), before day 30 the same,
 *      Me carries no taper, and the Credits rule says Free keeps earning.
 *  11. The trial nudges toward Pro, or Close for an active Close user (anything sent for
 *      signature, or 2+ proposals, documents or Claude drafts): the plans sheet's lead plan, its
 *      Most chosen tag and primary button, Home's trial card, the nudge, the banner and the emails.
 * (9, activation, is in scripts/test-model.mts: startSteps.)
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import Module, { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(tmpdir(), "rn-plg-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const today = iso(0).slice(0, 10);

/* ---------- the made-up seed ---------- */

const N = 24;
const pad = (k: number) => String(k).padStart(2, "0");
const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M" } });
const companies = [
  ...Array.from({ length: N }, (_, k) => co(`c_p${pad(k)}`, `Plgco ${pad(k)} Works`, `plgco${pad(k)}.example`)),
  { id: "c_peer", fields: { name: "Peerfield Labs", website: "peerfield.example", industry: "SaaS", employees: "51–200", hq: "Austin, TX" } },
  co("c_ball1", "Crystalbrook Goods", "crystalbrook.example"),
  co("c_ball2", "Glassmere Tools", "glassmere.example"),
];
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, verified: false, fields: { source: "Published engagement", type: "Fractional", ...fields } });
const engagements = [
  seat("e_peer_holly", "c_peer", { operator: "Holly Peerless", role: "Fractional CMO", function: "Marketing", start: "2023-02", status: "Ended", end: "2023-11", rate: "$9k/mo" }),
  seat("e_peer_ines", "c_peer", { operator: "Ines Private", role: "Fractional COO", function: "Operations", start: "2022-02", status: "Ended", end: "2022-12" }),
  // Tara's own seat: her name on it from our records.
  seat("e_taper_own", "c_p23", { operator: "Tara Taper", role: "Fractional VP Sales", function: "Sales", start: "2024-01", status: "Ended", end: "2024-12" }),
];
const contacts = [
  { id: "p_peer_ceo", companyId: "c_peer", fields: { name: "Quentin Exec", title: "Chief Executive Heron", relationship: "Decision maker", email: "quentin@peerfield.example", phone: "512.555.0101", linkedin: "https://www.linkedin.com/in/quentin-exec-zz" } },
];
const member = (id: string, name: string) => ({ id, name, email: `${id.slice(4)}.plg@example.com`, title: "Fractional VP Sales", token: `tok-${id.slice(4)}-plg` });
const seed = {
  builtAt: iso(-90 * DAY),
  members: [member("mem_pro", "Pat Pro"), member("mem_tri", "Tia Trial"), member("mem_free", "Fen Free"), member("mem_ines", "Ines Private"), { id: "mem_ada", name: "Ada Admin", email: "admin-plg@example.com", title: "Admin", token: "tok-ada-plg" }],
  companies,
  engagements,
  contacts,
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const row = (memberId: string, c: string) => ({ k: `test:${memberId}:${c}`, c, kind: "role", l: "New open role: Fractional VP Sales · In your function", b: "High", w: "Hiring now" });
// Joined members: Tara 31 days ago, Yan 25 days ago (no taper either way: Free earns 25 a day for good).
const joined = (id: string, name: string, days: number) => ({ ...member(id, name), at: iso(-days * DAY), ipHash: `${id}${id}`.slice(0, 16) });
const fillable = Array.from({ length: N }, (_, k) => `c_p${pad(k)}.identity`);
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Tara and Yan opened every Plgco company before (so they can add what they know there).
    unlocks: Object.fromEntries(fillable.map((k) => [k, ["mem_taper", "mem_young"]])),
    members: [joined("mem_taper", "Tara Taper", 31), joined("mem_young", "Yan Young", 25)],
    seen: Object.fromEntries([...seed.members.map((m) => m.id), "mem_taper", "mem_young"].map((id) => [id, iso(-HOUR)])),
    profiles: {
      ...Object.fromEntries([...seed.members.map((m) => m.id), "mem_taper", "mem_young"].map((id) => [id, { function: "Sales", onboarded: true }])),
      mem_ines: { function: "Operations", onboarded: true, fractionals: false },
    },
    billing: {
      members: {
        mem_pro: { trialStartedAt: iso(-60 * DAY), trialEndsAt: iso(-39 * DAY), proUntil: iso(20 * DAY), interval: "month", paidSince: iso(-39 * DAY) },
        // Tia's trial ends in 3 days (day 18 of 21).
        mem_tri: { trialStartedAt: iso(-18 * DAY), trialEndsAt: iso(3 * DAY - HOUR) },
        mem_free: { trialStartedAt: iso(-40 * DAY), trialEndsAt: iso(-19 * DAY) },
      },
      events: [],
      payments: [],
      ended: [],
    },
    // Tia's two saved views (the second stops emailing on Free) and one proposal out for signature.
    connector: { clients: [], grants: [], alerts: { mem_tri: [{ id: "sv1", name: "Sales at SaaS", function: "Sales", createdAt: iso(-10 * DAY) }, { id: "sv2", name: "RevOps in Texas", function: "RevOps", createdAt: iso(-9 * DAY) }] } },
    proposals: [
      {
        id: "pr_plg1", memberId: "mem_tri", companyId: null, companyPub: null, companyName: "Plgco 17 Works", templateId: null, title: "Fractional VP Sales", blocks: [], fields: {}, sources: {}, notes: [], signerOnCall: null,
        signer: { name: "Sam Signer", email: "sam.signer@example.com", title: "CEO" }, version: 1, createdAt: iso(-3 * DAY), updatedAt: iso(-DAY),
        sends: [{ id: "sd_plg1", version: 1, signer: { name: "Sam Signer", email: "sam.signer@example.com", title: "CEO" }, doc: {}, hash: "0".repeat(64), sentAt: iso(-DAY), expiresAt: iso(13 * DAY), events: [] }],
      },
    ],
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: { mem_pro: { sent: {}, days: { [today]: ["c_ball1", "c_ball2"].map((c) => row("mem_pro", c)) } } },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-plg@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  // Billing live: made-up Stripe settings (fetch is replaced, nothing reaches Stripe).
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_plg",
  STRIPE_WEBHOOK_SECRET: "whsec_test_plg",
  STRIPE_PRICE_MONTH: "price_month_plg",
  STRIPE_PRICE_YEAR: "price_year_plg",
  STRIPE_PRICE_TOPUP: "price_topup_plg",
  STRIPE_PRICE_CLOSE_MONTH: "price_close_month_plg",
  STRIPE_PRICE_CLOSE_YEAR: "price_close_year_plg",
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_INTEL_SEED_KEY", "RN_GOOGLE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

/* ---------- the clock: moved forward for the next UTC day, and past day 30 ---------- */

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
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ").trim();

async function main() {
  const t = await import("../lib/table");
  const F = await import("../lib/tableFields");
  const tools = await import("../lib/mcp/tools");
  const fr = await import("../lib/fractionals");
  const PA = await import("../lib/pipelineActions");
  const emails = await import("../lib/billing/emails");
  const rules = await import("../lib/billing/rules");
  const compare = await import("../lib/billing/compare");
  const nudges = await import("../app/post/nudges");
  const React = (await import("react")).default;
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  type View = Awaited<ReturnType<typeof t.buildView>>;
  const BASE = "https://post.example.com";
  const PRO = "tok-pro-plg";
  const TRI = "tok-tri-plg";
  const FREE = "tok-free-plg";
  const TAPER = "tok-taper-plg";
  const YOUNG = "tok-young-plg";

  const ada = await t.buildView("tok-ada-plg");
  const idOf = (name: string) => ada.companies.find((c) => c.name === name)!.id;
  const P = (k: number) => idOf(`Plgco ${pad(k)} Works`);
  const PEER = idOf("Peerfield Labs");
  const BALL1 = idOf("Crystalbrook Goods");
  const pub = (id: string) => t.tableInternals.pubId(id);
  const view = (tok: string) => t.buildView(tok);
  const company = (v: View, id: string) => v.companies.find((c) => c.id === id)!;
  const credits = async (tok: string) => (await view(tok)).me!.credits;
  const unlock = (tok: string, entity: "company" | "engagement" | "contact", id: string, field: string, from?: "crystal") => t.perform(tok, { type: "unlock", entity, id, field, ...(from ? { from } : {}) }, BASE);
  const refused = async (p: Promise<unknown>) => {
    try {
      await p;
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  /* ---------- 1. Pro: companies free, 15 a day ---------- */
  console.log("\n1. Pro opens companies free, up to 15 a day beyond Crystal Ball");
  let pro = await view(PRO);
  check("Me.proOpens: 15 of 15 left today on Pro", pro.me!.proOpens?.left === 15 && pro.me!.proOpens.of === F.PRO_OPENS_DAILY && F.PRO_OPENS_DAILY === 15, pro.me!.proOpens);
  const c0 = pro.me!.credits;
  let lastMsg = "";
  for (let k = 0; k < 15; k++) lastMsg = (await unlock(PRO, "company", P(k), "identity")).message;
  pro = await view(PRO);
  check("15 companies outside Crystal Ball opened for 0 credits", pro.me!.credits === c0 && Array.from({ length: 15 }, (_, k) => company(pro, P(k))).every((c) => !c.hidden), pro.me!.credits);
  check("each says how many are left; the 15th says it was the last of today's", lastMsg.includes(t.proOpenLine(0)) && /last of today's 15/.test(lastMsg), lastMsg);
  check("none left today, and the free opens don't use the day's unlock limit (100)", pro.me!.proOpens?.left === 0 && pro.me!.unlocksLeft === 100, [pro.me!.proOpens, pro.me!.unlocksLeft]);
  check("the credit history reads each as opened free on Pro", pro.ledger.filter((l) => l.reason === t.PRO_OPEN_LINE).length === 15);
  const q16 = (await tools.unlock({ member: (await t.memberForToken(PRO))!, origin: BASE }, { entity: "company", id: P(15), field: "identity" })) as { would_spend?: number; message: string };
  check("the connector quotes the 16th at 2 credits and says why", q16.would_spend === 2 && q16.message.includes(F.PRO_OPENS_USED), q16);
  const acct = (await tools.myAccount({ member: (await t.memberForToken(PRO))!, origin: BASE })) as { free_company_today?: string; how_credits_work?: string };
  check("my_account says none are left today, in the same words", /^none left today/.test(acct.free_company_today ?? "") && (acct.free_company_today ?? "").includes(F.PRO_OPENS_USED), acct.free_company_today);
  const m16 = await unlock(PRO, "company", P(15), "identity");
  check("the 16th costs 2 credits, with the fair-use line", (await credits(PRO)) === c0 - 2 && m16.message.includes(F.PRO_OPENS_USED), m16.message);
  check("the fair-use line is the owner's words", F.PRO_OPENS_USED === "You've opened 15 companies today. More open tomorrow, or use 2 credits.");
  await unlock(PRO, "company", BALL1, "identity", "crystal");
  pro = await view(PRO);
  check("a Crystal Ball company still opens free past the 15, and doesn't count", pro.me!.credits === c0 - 2 && !company(pro, BALL1).hidden && pro.me!.proOpens?.left === 0);
  skew += DAY;
  pro = await view(PRO);
  check("the next UTC day: 15 again", pro.me!.proOpens?.left === 15, pro.me!.proOpens);
  const m17 = await unlock(PRO, "company", P(16), "identity");
  check("and the next company is free again", (await credits(PRO)) === c0 - 2 && m17.message.includes(t.proOpenLine(14)), m17.message);
  skew -= DAY;

  // Free: unchanged.
  const fen0 = await view(FREE);
  check("Free has no Pro opens, and its free one a day is Crystal Ball's", !fen0.me!.proOpens && fen0.me!.crystal === "one" && fen0.me!.freeCompany === false);
  const f0 = fen0.me!.credits;
  const fenCo = await unlock(FREE, "company", P(20), "identity");
  check("Free: a company outside Crystal Ball is 2 credits, as before", (await credits(FREE)) === f0 - 2 && !fenCo.message.includes(t.PRO_OPEN_FREE), fenCo.message);

  /* ---------- 2. fellow fractionals are free ---------- */
  console.log("\n2. Fellow fractionals are free; contact details keep their price");
  let fen = await view(FREE);
  const seatOf = (v: View, id: string) => company(v, PEER).engagements.find((e) => e.id === pub(id))!;
  check("at a company still locked: who held its seat is locked", seatOf(fen, "e_peer_holly").cells.operator?.s === "locked");
  check("and unlocking it asks for the company first", (await refused(unlock(FREE, "engagement", pub("e_peer_holly"), "operator"))) === t.COMPANY_FIRST);
  const fp0 = await credits(FREE);
  await unlock(FREE, "company", PEER, "identity");
  fen = await view(FREE);
  check("opening the company costs 2 (Free)", fen.me!.credits === fp0 - 2);
  const holly = seatOf(fen, "e_peer_holly");
  check("then who held its seat and the role show free", holly.cells.operator?.s === "value" && holly.cells.operator.v === "Holly Peerless" && holly.cells.role?.s === "value" && !holly.cells.operator.paid && !holly.cells.role.paid, holly.cells);
  check("nothing more to buy there for them", /Nothing here is locked/.test((await refused(unlock(FREE, "engagement", pub("e_peer_holly"), "role"))) ?? "") && (await credits(FREE)) === fp0 - 2);
  check("the rate and the dated end keep their price (1 credit each)", holly.cells.rate?.s === "locked" && holly.cells.end?.s === "locked");
  const ines = seatOf(fen, "e_peer_ines");
  check("a member who keeps out of the directory: who held their seat stays locked", ines.cells.operator?.s === "locked");
  await unlock(FREE, "engagement", pub("e_peer_ines"), "operator");
  check("  and it is 1 credit, as before", (await credits(FREE)) === fp0 - 3);
  const ceo = company(fen, PEER).people.find((p) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker")!;
  check("the company's own people keep their price: a decision maker's name is locked", ceo.cells.name?.s === "locked" && ceo.cells.title?.s === "locked");
  await unlock(FREE, "contact", ceo.id, "name");
  check("  1 credit for the name and title", (await credits(FREE)) === fp0 - 4);
  for (const [k, f] of (["email", "phone", "linkedin"] as const).entries()) {
    await unlock(FREE, "contact", ceo.id, f);
    check(`  their ${f} is 1 credit after it`, (await credits(FREE)) === fp0 - 5 - k);
  }
  const dir = await fr.fractionalsView(FREE);
  const hollyRec = dir!.records.find((r) => r.seats.some((x) => x.id === pub("e_peer_holly")));
  check("Fractionals names a fellow fractional, free", hollyRec?.name === "Holly Peerless" && !hollyRec.locked && (await credits(FREE)) === fp0 - 7, hollyRec);
  check("and leaves out the member who said no", !dir!.records.some((r) => r.seats.some((x) => x.id === pub("e_peer_ines"))));
  const fu = await t.perform(FREE, { type: "unlockFractional", id: hollyRec!.id }, BASE);
  check("Unlock on Fractionals spends nothing", fu.message === t.FRACTIONALS_FREE && (await credits(FREE)) === fp0 - 7, fu.message);

  /* ---------- 3. no outcome pricing ---------- */
  console.log("\n3. No outcome-based price");
  const { faqItems } = await import("../app/landing/faq");
  const words = JSON.stringify([compare.PLAN_ROWS, rules.PRO_STORY, faqItems(25), emails.ONE_CLIENT]);
  check("no percentage or price on outcomes in the plans' words", !/succes{2} fee|% of|percent of|per placement|per client won|commission/i.test(words));

  /* ---------- 4. the top bar's PlanPill ---------- */
  console.log("\n4. PlanPill in the top bar");
  const B = await import("../app/post/Billing");
  const { TopBar } = await import("../app/post/TopBar");
  const tri = await view(TRI);
  const bar = (me: unknown) =>
    renderToStaticMarkup(
      React.createElement(TopBar, { me, query: "", setQuery: () => {}, searchRef: { current: null }, phone: false, brand: false, onCredits: () => {}, creditsRef: { current: null }, onAdd: () => {}, onHome: () => {} } as never),
    );
  const triBar = bar(tri.me);
  check("on the trial: Close trial · 3 days left · Upgrade, next to the credits", /tp-plan/.test(triBar) && /Close trial · 3 days left Upgrade/.test(text(triBar)) && triBar.indexOf("tp-plan") < triBar.indexOf("tp-credits"), text(triBar).slice(0, 300));
  const freeBar = bar((await view(FREE)).me);
  check("on Free: Upgrade to Pro", /Upgrade to Pro/.test(text(freeBar)) && /tp-plan-free/.test(freeBar));
  const proBar = bar((await view(PRO)).me);
  check("on Pro: nothing", !/tp-plan/.test(proBar) && /tp-credits/.test(proBar));
  check("and the phone's chip", /Upgrade/.test(text(renderToStaticMarkup(React.createElement(B.PlanPill, { plan: tri.me!.plan, phone: true })))));

  /* ---------- 5. the comparison and the Pro story ---------- */
  console.log("\n5. The plan comparison and the Pro story");
  const rowOf = (what: string) => compare.PLAN_ROWS.find((r) => r[0] === what);
  // Three plans: Free, Pro, Close. Sending for signature, Claude drafting and your own contracts are Close.
  check("three plans: Free $0, Pro $59 / $590, Close $79 / $790", JSON.stringify(compare.PLANS.map((p) => [p.name, p.month, p.year])) === JSON.stringify([["Free", 0, 0], ["Pro", 59, 590], ["Close", 79, 790]]), compare.PLANS);
  check("Proposals and e-signature: building is Close's after the trial", JSON.stringify(rowOf("Proposals and e-signature")) === JSON.stringify(["Proposals and e-signature", "In your trial only", "In your trial only", "Every template, send and get signed, unlimited"]));
  check("Claude drafting and your own contracts are Close's", JSON.stringify(rowOf("Claude drafting and your own contracts")?.slice(1)) === JSON.stringify(["In your trial only", "In your trial only", "Drafted from your call, your own templates and contracts with signature fields"]));
  check("Opening companies", JSON.stringify(rowOf("Opening companies")) === JSON.stringify(["Opening companies", "1 a day from Crystal Ball, others 2 credits", "Free, up to 15 a day, Crystal Ball not counted", "Free, up to 15 a day, Crystal Ball not counted"]));
  check("Fellow fractionals", JSON.stringify(rowOf("Fellow fractionals")) === JSON.stringify(["Fellow fractionals", "Free", "Free", "Free"]));
  check("Open roles are about alerts", JSON.stringify(rowOf("Open roles")) === JSON.stringify(["Open roles", "Alerts: weekly email", "Alerts as they open", "Alerts as they open"]));
  check("each plan has a short what-you-get line", compare.PLANS.every((p) => p.line.length > 20 && p.line.length < 100));
  const table = text(renderToStaticMarkup(React.createElement(B.CompareTable, { current: "free" })));
  check("the comparison table shows the three plans and the rows", ["Free Pro Close", "Proposals and e-signature", "Every template, send and get signed, unlimited", "Free, up to 15 a day, Crystal Ball not counted", "Fellow fractionals", "Alerts as they open"].every((x) => table.includes(x)), table.slice(0, 400));
  check("VALUE_LINE sells winning the client", B.VALUE_LINE === "Find the company before it posts and get in through the person who held the seat. Close adds the proposal they sign.");
  const welcome = text(renderToStaticMarkup(React.createElement(B.ProWelcome, { plan: (await view(PRO)).me!.plan!, onSeen: () => {} })));
  check("the Pro welcome tells the same story, with the new rows", welcome.includes(rules.PRO_STORY) && /Opening companies\. Free, up to 15 a day/.test(welcome) && !/Proposals and e-signature/.test(welcome), welcome.slice(0, 300));
  const cardsFree = text(renderToStaticMarkup(React.createElement(B.PlanCards, { plan: (await view(FREE)).me!.plan!, from: "billing" })));
  check("the plans: all three, each upgrade button with what you get", /Choose Pro\b/.test(cardsFree) && /Choose Close/.test(cardsFree) && compare.PLANS.every((p) => cardsFree.includes(p.line)) && /\$590 a year/.test(cardsFree) && /\$790 a year/.test(cardsFree), cardsFree);
  check("under Close: what Claude does, then the AI pack, with no draft numbers or limit", cardsFree.includes("Claude drafts your proposals from your calls Need more AI usage? Add a pack anytime for $10.") && !/\d+ Claude drafts|drafts a month|limit/i.test(cardsFree));
  const payingPro = { ...(await view(PRO)).me!.plan!, subscribed: true, tier: "pro" as const, closeOpen: true, interval: "month" as const };
  const cardsPro = text(renderToStaticMarkup(React.createElement(B.PlanCards, { plan: payingPro, from: "proposals" })));
  check("paying for Pro: Pro is your plan, Close an upgrade on the same subscription", /Your plan/.test(cardsPro) && /Upgrade to Close/.test(cardsPro) && /\$79 a month/.test(cardsPro), cardsPro);
  const cardsClose = text(renderToStaticMarkup(React.createElement(B.PlanCards, { plan: { ...payingPro, tier: "close" as const }, from: "billing" })));
  check("paying for Close: a switch back to Pro", /Switch to Pro/.test(cardsClose) && /Your plan/.test(cardsClose), cardsClose);
  const { TrialEnded } = await import("../app/post/Today");
  const ended = text(renderToStaticMarkup(React.createElement(TrialEnded, { onSeePro: () => {}, onSeen: () => {} })));
  check("the trial-ended card tells it too, with Close", ended.includes(rules.PRO_STORY) && /Close adds the proposal they sign/.test(ended) && /up to 15 a day/.test(ended), ended);

  /* ---------- 6. the landing page's pricing ---------- */
  console.log("\n6. Pricing on the landing page");
  const Pricing = (await import("../app/landing/Pricing")).default;
  const lp = text(renderToStaticMarkup(React.createElement(Pricing, { starter: 25, onJoin: () => {} })));
  check("Free, Pro and Close: $59 or $590, $79 or $790, the 21-day Close trial, no card", /\$59 a month/.test(lp) && /\$590 a year/.test(lp) && /\$79 a month/.test(lp) && /\$790 a year/.test(lp) && /21-day Close trial, no card/.test(lp) && /\$0/.test(lp), lp.slice(0, 500));
  check("framed by return: One client pays for years of Pro", lp.includes("One client pays for years of Pro") && lp.includes(rules.PRO_STORY));
  check("the same rows as the app", compare.LANDING_ROWS.every(([w, f, p, c]) => lp.includes(w) && lp.includes(f) && lp.includes(p) && lp.includes(c)) && compare.LANDING_ROWS.some((r) => r[0] === "Proposals and e-signature"));
  check("no rate cited (the landing reads no benchmarks), no percentage", !/\$\d[\d,]*\s*(\/|a |an |per )?(hr|hour|mo\b)/i.test(lp.replace(/\$(59|79|0) a month/g, "")) && !/%/.test(lp), lp);

  /* ---------- 7. out of credits: three choices ---------- */
  console.log("\n7. Out of credits: three choices in one line");
  const freePlan = (await view(FREE)).me!.plan!;
  const zero = nudges.pickNudge({ page: "table", credits: 0, plan: freePlan, profileEmpty: false });
  check("the 0-credit line offers the three choices", JSON.stringify(zero?.choices?.map((c) => c.label)) === JSON.stringify(["Earn one: add a fact", "50 for $19", "Pro: companies free"]) && zero?.text === "You're out of credits.", zero);
  check("their actions: earn, the top-up, the plans", zero?.choices?.map((c) => c.action).join() === "earn,topup,plansCredits");
  const slot = text(renderToStaticMarkup(React.createElement(nudges.NudgeSlot, { nudge: zero, onAction: () => {} })));
  check("drawn in one line", slot === "You're out of credits. Earn one: add a fact 50 for $19 Pro: companies free", slot);
  check("on Pro, no Pro choice; with billing off, only earning", nudges.creditChoices((await view(PRO)).me!.plan).map((c) => c.label).join() === "Earn one: add a fact,50 for $19" && nudges.creditChoices(undefined).map((c) => c.label).join() === "Earn one: add a fact");
  check("at 1 to 3 credits the line is as before", nudges.pickNudge({ page: "table", credits: 2, plan: freePlan, profileEmpty: false })?.cta === "Earn credits");
  const get = text(renderToStaticMarkup(React.createElement(B.GetCredits, { plan: freePlan, onEarn: () => {} })));
  check("the record's Get 2 credits opens the same three", get === "Earn one: add a fact 50 for $19 Pro: companies free", get);
  const ui = await import("../app/post/ui");
  check("its button reads Get 2 credits", ui.GET_COMPANY_CREDITS === "Get 2 credits" && ui.getCreditsWords(1) === "Get 1 credit");

  /* ---------- 8. the trial's end as a loss ---------- */
  console.log("\n8. The trial summary");
  for (const k of [17, 18, 19]) await unlock(TRI, "company", P(k), "identity");
  for (const k of [17, 18, 19]) await PA.performPipeline(TRI, { type: "pipeline.sent", companyId: P(k), channel: "email" } as never);
  const triV = await view(TRI);
  const sum = triV.me!.plan!.summary;
  check("what they used: companies opened free, notes sent, a proposal out", sum?.used === "You opened 3 companies free and sent 3 notes; 1 proposal is out.", sum);
  check("what locks when it ends", sum?.locks === "In 3 days companies cost 2 credits again and your second saved view stops emailing.", sum);
  check("worded for the last day too", emails.trialSummary({ conversations: 0, invites: 0, unlocks: 0, roles: 0, function: null, companiesFree: 16, notes: 3, proposalsOut: 1, savedViews: 2 }, 1).locks === "Tomorrow companies cost 2 credits again and your second saved view stops emailing." && emails.trialSummary({ conversations: 0, invites: 0, unlocks: 0, roles: 0, function: null, companiesFree: 16, notes: 3, proposalsOut: 1, savedViews: 2 }, 1).used === "You opened 16 companies free and sent 3 notes; 1 proposal is out.");
  check("not before the last 4 days, and not on Free or Pro", !(await view(PRO)).me!.plan!.summary && !(await view(FREE)).me!.plan!.summary);
  const card = text(renderToStaticMarkup(React.createElement(B.TrialSummaryCard, { plan: triV.me!.plan })));
  check("Home's card: So far, and what locks, with Keep Close (Tia sent a proposal in her trial)", card.includes(`So far: ${sum!.used}`) && card.includes(sum!.locks) && /Keep Close$/.test(card), card);
  const billingPage = text(renderToStaticMarkup(React.createElement(ui.UiCtx.Provider, { value: { me: triV.me } as never }, React.createElement(B.BillingPage, { view: triV, refresh: async () => {}, onBack: () => {} }))));
  check("Plan and billing says the same", billingPage.includes(sum!.used!) && billingPage.includes(sum!.locks), billingPage.slice(0, 400));
  const st = await t.loadState();
  const counts = emails.valueCounts(st as never, null, null, "mem_tri", iso(-18 * DAY), new Date().toISOString());
  const mail = emails.trialReceiptEmail({ first: "Tia", days: 3, counts, rateLine: null, link: `${BASE}/?p=billing&plans=1` });
  check("the day-18 email lists what they used and what locks", mail.text.includes(sum!.used!) && mail.text.includes(sum!.locks) && mail.html.includes("You opened 3 companies free"), mail.text);
  check("and tells the Pro story, framed by return", mail.text.includes("Pro is how you win the client: find the company before it posts") && mail.text.includes(emails.ONE_CLIENT));
  const endMail = emails.trialEndedEmail({ first: "Tia", counts, notLooking: false, rateLine: null, link: BASE });
  const lastMail = emails.trialEndingEmail({ first: "Tia", days: 1, notLooking: false, rateLine: null, link: BASE });
  check("the trial-ended and last-day emails tell it too", endMail.text.includes("Close adds the proposal they sign") && lastMail.text.includes("Close adds the proposal they sign"));

  /* ---------- 10. no Free earning taper, with the clock moved ---------- */
  console.log("\n10. Free keeps earning up to 25 a day, past the first 30 days too");
  check("the taper's constants are gone, the daily cap is 25", !("FREE_TAPER_DAYS" in F) && !("FREE_TAPER_CAP" in F) && !("TAPER_RULE" in F) && F.EARN_CAP === 25);
  check("the rule as members read it", F.FREE_EARN_RULE === "On Free you keep earning up to 25 credits a day, for as long as you're a member.");
  const fill = (tok: string, k: number, field = "hq", value = "Austin, TX") => t.perform(tok, { type: "fill", entity: "company", id: P(k), field, value }, BASE);
  const ta0 = await credits(TAPER);
  for (let k = 0; k < 11; k++) await fill(TAPER, k);
  check("past day 30: 11 facts about other people's companies earn 11", (await credits(TAPER)) === ta0 + 11, [ta0, await credits(TAPER)]);
  const tv = await view(TAPER);
  check("Me carries no taper", !("taper" in tv.me!), tv.me);
  const own = await t.perform(TAPER, { type: "fill", entity: "engagement", id: pub("e_taper_own"), field: "hours", value: "20" }, BASE);
  check("a fact on her own seat earns too", (await credits(TAPER)) === ta0 + 12, own.message);
  const y0 = await credits(YOUNG);
  for (let k = 11; k < 22; k++) await fill(YOUNG, k);
  check("before day 30: the 11th earns", (await credits(YOUNG)) === y0 + 11, [y0, await credits(YOUNG)]);
  skew += 6 * DAY;
  const y1 = await credits(YOUNG);
  for (let k = 11; k < 22; k++) await fill(YOUNG, k, "linkedin", `https://www.linkedin.com/company/plgco-${pad(k)}`);
  check("six days later (day 31), the same 11 facts earn 11", (await credits(YOUNG)) === y1 + 11 && !("taper" in (await view(YOUNG)).me!), [y1, await credits(YOUNG)]);
  skew -= 6 * DAY;

  /* ---------- 11. the trial nudges toward Pro, or Close for an active Close user ---------- */
  console.log("\n11. Keep Pro, or Keep Close once the trial used Close for real");
  check("the threshold: anything sent for signature, or 2 or more proposals, documents or Claude drafts", rules.CLOSE_ACTIVE_MIN === 2 && !rules.closeActive({ made: 1, drafted: 0, sent: 0 }) && !rules.closeActive({ made: 0, drafted: 1, sent: 0 }) && rules.closeActive({ made: 1, drafted: 1, sent: 0 }) && rules.closeActive({ made: 2, drafted: 0, sent: 0 }) && rules.closeActive({ made: 0, drafted: 0, sent: 1 }));
  check("keepTier and its words", rules.keepTier({ made: 0, drafted: 0, sent: 0 }) === "pro" && rules.keepTier({ made: 0, drafted: 0, sent: 1 }) === "close" && rules.keepWords("close") === "Keep Close" && rules.keepWords("pro") === "Keep Pro");
  const triPlan = (await view(TRI)).me!.plan!;
  check("Tia sent a proposal for signature in her trial: her plan nudges Close", triPlan.keep === "close", triPlan.keep);
  const quiet = structuredClone(await t.loadState());
  quiet.proposals = [];
  check("with nothing of Close used, the same trial nudges Pro", t.tableInternals.keepOf(quiet as never, "mem_tri") === "pro" && JSON.stringify(t.tableInternals.closeUseOf(quiet as never, "mem_tri", iso(-30 * DAY))) === JSON.stringify({ made: 0, drafted: 0, sent: 0 }));
  quiet.proposals = [{ ...(await t.loadState()).proposals![0], id: "pr_x", sends: [] }];
  check("  one proposal made and left alone is not enough", t.tableInternals.keepOf(quiet as never, "mem_tri") === "pro");
  const proPlan = { ...triPlan, keep: "pro" as const, summary: undefined };
  const closePlan = { ...triPlan, keep: "close" as const, summary: undefined };
  const cardsTrialPro = renderToStaticMarkup(React.createElement(B.PlanCards, { plan: proPlan, from: "trial" }));
  const cardsTrialClose = renderToStaticMarkup(React.createElement(B.PlanCards, { plan: closePlan, from: "trial" }));
  const leadOf = (html: string) => (/bl-plan bl-plan-(pro|close) bl-plan-lead/.exec(html) ?? [])[1] ?? null;
  const tagIn = (html: string, key: string) => new RegExp(`bl-plan-${key} bl-plan-lead[^>]*><span class="bl-plan-tag">Most chosen</span>`).test(html);
  const cardOf = (html: string, key: string) => {
    const i = html.indexOf(`data-plan-card="${key}"`);
    const j = html.indexOf("data-plan-card=", i + 20);
    return html.slice(i, j < 0 ? undefined : j);
  };
  const primaryOn = (html: string, key: string) => cardOf(html, key).includes("btn bl-plan-btn btn-pine");
  check("the trial's plans sheet, by default: Pro leads, Most chosen, the primary button", leadOf(cardsTrialPro) === "pro" && tagIn(cardsTrialPro, "pro") && primaryOn(cardsTrialPro, "pro") && !primaryOn(cardsTrialPro, "close"), [leadOf(cardsTrialPro)]);
  check("  an active Close user: Close leads, Most chosen, the primary button", leadOf(cardsTrialClose) === "close" && tagIn(cardsTrialClose, "close") && primaryOn(cardsTrialClose, "close") && !primaryOn(cardsTrialClose, "pro"), [leadOf(cardsTrialClose)]);
  const proOut = text(cardOf(cardsTrialPro, "pro"));
  check(
    "  the trial's Pro card lists what Pro leaves out, and only Pro's card does",
    /Not in Pro, only in Close: Sending for signature Your own templates Claude drafting The pipeline moving to Won when they sign/.test(proOut) &&
      text(cardOf(cardsTrialClose, "pro")).includes("Sending for signature") &&
      !cardOf(cardsTrialPro, "close").includes("data-pro-leaves-out") &&
      !cardsFree.includes("Not in Pro"),
    proOut,
  );
  const cardPro = text(renderToStaticMarkup(React.createElement(B.TrialSummaryCard, { plan: { ...triPlan, keep: "pro" as const } })));
  const cardClose = text(renderToStaticMarkup(React.createElement(B.TrialSummaryCard, { plan: { ...triPlan, keep: "close" as const } })));
  check("Home's trial card: Keep Pro by default, Keep Close for an active Close user", cardPro.endsWith("Keep Pro") && cardClose.endsWith("Keep Close"), [cardPro.slice(-40), cardClose.slice(-40)]);
  const endingPlan = { ...triPlan, ending: true, trialDaysLeft: 3, summary: undefined };
  const nPro = nudges.pickNudge({ page: "today", credits: 20, plan: { ...endingPlan, keep: "pro" }, profileEmpty: false });
  const nClose = nudges.pickNudge({ page: "today", credits: 20, plan: { ...endingPlan, keep: "close" }, profileEmpty: false });
  check("the trial nudge names the same plan", nPro?.cta === "Keep Pro" && /unless you keep Pro\.$/.test(nPro.text) && nClose?.cta === "Keep Close" && /unless you keep Close\.$/.test(nClose.text), [nPro, nClose]);
  const banner = (k: "pro" | "close") => text(renderToStaticMarkup(React.createElement(B.TrialBanner, { plan: { ...endingPlan, keep: k } })));
  check("the trial banner too", /unless you keep Pro\. Keep Pro/.test(banner("pro")) && /unless you keep Close\. Keep Close/.test(banner("close")), [banner("pro"), banner("close")]);
  const mPro = emails.trialEndingEmail({ first: "Tia", days: 1, notLooking: false, rateLine: null, link: BASE });
  const mClose = emails.trialEndingEmail({ first: "Tia", days: 1, notLooking: false, rateLine: null, link: BASE, keep: "close" });
  const rClose = emails.trialReceiptEmail({ first: "Tia", days: 3, counts: emails.valueCounts((await t.loadState()) as never, null, null, "mem_tri", iso(-18 * DAY), new Date().toISOString()), rateLine: null, link: BASE, keep: "close" });
  check("the trial-ending emails name Pro by default", /unless you keep Pro\. Pro is how you win the client/.test(mPro.text) && mPro.html.includes(">Keep Pro<"), mPro.text);
  check("  and Close for an active Close user, with its button", /unless you keep Close/.test(mClose.text) && mClose.html.includes(">Keep Close<") && /unless you keep Close/.test(rClose.text) && rClose.html.includes(">Keep Close<"), [mClose.text, rClose.text]);
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL threw: ${String((e as Error)?.stack ?? e)}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
