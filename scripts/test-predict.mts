/**
 * Checks of Crystal Ball's likelihood and timing (lib/radar/predict.ts, lib/radar/match.ts
 * scoreFor), the new facts it reads (a company's ownership, a seat's why now, why it ended, revenue
 * and employees then, and the seat holder's private "who introduced you"), and the two signals
 * Merlin's own data makes (first sales hires posted, a leader gone from a company's website).
 *
 *   npx tsx scripts/test-predict.mts
 *
 * Runs on a made-up seed in a temporary data dir, in process. fetch is replaced: nothing leaves the
 * machine and no email is sent.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-predict-"));
const DAY = 86_400_000;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const PRIVATE_NOTE = "Quentin Quill from Zephyr Ventures";

const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Seller", email: "sal.seller@example.com", title: "Fractional VP Sales", token: "tok-sal-0001" },
    { id: "mem_pia", name: "Pia Profit", email: "pia.profit@example.com", title: "Fractional CFO", token: "tok-pia-0001" },
    { id: "mem_ada", name: "Ada Admin", email: "ada.admin@example.com", title: "Founder", token: "tok-ada-0001" },
  ],
  companies: [
    { id: "c_one", fields: { name: "Orchid Analytics", website: "orchid.example", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Austin, TX" } },
    { id: "c_two", fields: { name: "Tamarind Tools", website: "tamarind.example", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Denver, CO" } },
    { id: "c_three", fields: { name: "Juniper Health", website: "juniper.example", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Boston, MA" } },
  ],
  engagements: [
    { id: "e_sal_now", companyId: "c_one", verified: false, fields: { source: "Member success story", operator: "Sal Seller", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" } },
    { id: "e_sal_old", companyId: "c_two", verified: false, fields: { source: "Member success story", operator: "Sal Seller", role: "Fractional CRO", function: "Sales", type: "Fractional", start: "2024-02", status: "Ended", end: "2024-12" } },
    { id: "e_two_mkt", companyId: "c_two", verified: false, fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2023-05", status: "Ended", end: "2024-01" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(DAY)])),
    profiles: {
      mem_sal: { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } },
      mem_pia: { function: "Finance", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ID_SECRET: "predict-test",
});
for (const k of ["RN_BILLING", "RESEND_API_KEY", "RN_RADAR", "RN_EMAIL_API_URL"]) delete process.env[k];
// Nothing leaves the machine.
globalThis.fetch = (async () => new Response("no network in tests", { status: 599 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const near = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps;

async function main() {
  const P = await import("../lib/radar/predict");
  const M = await import("../lib/radar/match");
  const F = await import("../lib/radar/format");
  const S = await import("../lib/radar/signals");
  const t = await import("../lib/table");
  const MCP = await import("../lib/mcp/tools");
  const ATS = await import("../lib/scan/sources/ats");
  const W = await import("../lib/viewWire");
  const T = t.tableInternals;
  const pub = T.pubId;

  /* ---------- the rules ---------- */
  console.log("\nRule lookup by stage and ownership");
  const ns = (rs: { n: number }[]) => rs.map((r) => r.n).sort((a, b) => a - b);
  check("a bootstrapped $1M–$5M company after a fractional CFO: rule 4 (sales leader or CMO) holds", ns(P.rulesFor("$1M–$5M", "boot", "Finance")).includes(4), ns(P.rulesFor("$1M–$5M", "boot", "Finance")));
  check("a VC-backed one at the same stage: rule 4 doesn't", !ns(P.rulesFor("$1M–$5M", "vc", "Finance")).includes(4));
  check("family-owned reads as bootstrapped (judgment call)", ns(P.rulesFor("$1M–$5M", "family", "Finance")).includes(4));
  check("a CRO at $5M–$20M: RevOps (6) and recruiting/enablement (7)", [6, 7].every((n) => ns(P.rulesFor("$5M–$20M", "vc", "Sales")).includes(n)));
  check("rule 9 (any GTM seat to HR) needs 25 to 50 people", ns(P.rulesFor("$5M–$20M", "vc", "Marketing", { employees: "51–200" })).includes(9) && !ns(P.rulesFor("$5M–$20M", "vc", "Marketing", { employees: "1,001+" })).includes(9));
  check("rule 16 (exit CFO) is never used: Merlin can't read the hold years", !P.RULES.filter((r) => r.n === 16).some((r) => P.rulesFor("$20M–$50M", "pe", "Sales").includes(r)));
  const cto = P.prior("Technology", "Marketing", "Under $1M", "vc");
  check("a CTO then marketing at an early VC company: rule 1's midpoint times Marketing's share", cto.rule?.n === 1 && near(cto.p, 0.4 * 0.7) && cto.gap[0] === 3 && cto.gap[1] === 9, cto);
  const cfoCfo = P.prior("Finance", "Finance", "$1M–$5M", "vc");
  check("a same-function rule (CFO to controller) never predicts a different seat", cfoCfo.rule === null, cfoCfo);
  const none = P.prior("Legal", "Customer Success", "$1M–$5M", "vc");
  check("a pair no rule names falls back to the propensity matrix, small", none.rule === null && none.p > 0 && none.p < 0.02 && none.gap[0] === 3, none);
  check("the matrix maps families onto functions: Marketing's share at $1M–$5M is 75% of the family's 20%", near(P.propensity("Marketing", "$1M–$5M"), 0.15));

  console.log("\nUnknown ownership and stage");
  const mix = Object.values(P.BUYER_MIX).reduce((a, b) => a + b, 0);
  check("the buyer mix is normalized, VC-backed the largest", near(mix, 1) && P.BUYER_MIX.vc > 0.6 && P.BUYER_MIX.vc < 0.7 && P.BUYER_MIX.boot > P.BUYER_MIX.pe, P.BUYER_MIX);
  const blend = P.prior("Finance", "Sales", "$1M–$5M", null).p;
  const want = P.OWNERS.reduce((sum, o) => sum + P.BUYER_MIX[o] * P.prior("Finance", "Sales", "$1M–$5M", o).p, 0);
  check("unknown ownership is the types blended by the buyer mix", near(blend, want), { blend, want });
  check("the blend sits between bootstrapped (a rule) and VC-backed (no rule)", blend < P.prior("Finance", "Sales", "$1M–$5M", "boot").p && blend > P.prior("Finance", "Sales", "$1M–$5M", "vc").p);
  const anyStage = P.prior("Sales", "RevOps", null, "vc").p;
  check("unknown stage blends the six stages", anyStage > 0 && anyStage < P.prior("Sales", "RevOps", "$1M–$5M", "vc").p, anyStage);
  check("ownership values read as types, Unknown as null", P.ownerOf("PE-backed") === "pe" && P.ownerOf("Non-profit") === "nonprofit" && P.ownerOf(null) === null && P.ownerOf("Unknown") === null);

  console.log("\nBeta update with Merlin's counts");
  const p0 = 0.1;
  const counts = (stage: string, k: number, n: number) => ({ byStage: { all: { Sales: { RevOps: k, Finance: n - k } }, [stage]: { Sales: { RevOps: k, Finance: n - k } } }, total: n, companies: n });
  check("no counts: the prior", P.posterior(p0, null, "Sales", "RevOps", "$1M–$5M") === p0);
  const up = P.posterior(p0, counts("$1M–$5M", 15, 20), "Sales", "RevOps", "$1M–$5M");
  check("15 of 20 transitions to RevOps move it toward 75%", near(up, (0.1 * 20 + 15) / 40) && up > 0.4, up);
  const down = P.posterior(0.5, counts("$1M–$5M", 0, 30), "Sales", "RevOps", "$1M–$5M");
  check("0 of 30 move it down", near(down, (0.5 * 20) / 50), down);
  const other = P.posterior(p0, counts("$5M–$20M", 10, 10), "Sales", "RevOps", "$1M–$5M");
  check("another stage's counts count half", near(other, (0.1 * 20 + 0.5 * 10) / (20 + 0.5 * 10)), other);
  check("the prior is worth about 20 observations", P.PRIOR_WEIGHT === 20);
  const seats = [
    { companyId: "a", fn: "Sales", ym: "2024-01", stage: "$1M–$5M" as const },
    { companyId: "a", fn: "Sales", ym: "2024-03", stage: "$1M–$5M" as const },
    { companyId: "a", fn: "RevOps", ym: "2024-05", stage: "$1M–$5M" as const },
    { companyId: "a", fn: "Finance", ym: "2024-05", stage: "$1M–$5M" as const },
    { companyId: "b", fn: "Marketing", ym: "2024-02", stage: null },
    { companyId: "b", fn: "Sales", ym: "2024-02", stage: null },
  ];
  const c1 = P.countTransitions(seats);
  check(
    "transitions: each seat to the next one in another function that starts after it (a co-hire: both), by the next seat's stage",
    c1.total === 4 && c1.byStage.all.Sales.Finance === 2 && c1.byStage.all.Sales.RevOps === 2 && c1.byStage["$1M–$5M"].Sales.Finance === 2 && !c1.byStage.all.RevOps && !c1.byStage.all.Finance && !c1.byStage.all.Marketing && c1.companies === 1,
    c1,
  );
  check("counted only before a date", P.countTransitions(seats, P.monthIndex("2024-04")!).total === 0);

  console.log("\nTiming");
  const g = [4, 9] as const;
  check("before the window: low, and rising", near(P.timing(0, g), 0.4) && P.timing(2, g) > 0.4 && P.timing(2, g) < 1);
  check("inside the window: the peak", P.timing(4, g) === 1 && P.timing(6, g) === 1 && P.timing(9, g) === 1);
  check("after it: falls, then a low tail, then nothing", P.timing(10.5, g) < 1 && P.timing(10.5, g) > P.TIMING_TAIL && near(P.timing(13, g), P.TIMING_TAIL) && P.timing(16, g) === 0, [P.timing(10.5, g), P.timing(13, g), P.timing(16, g)]);
  check("a window from 0 is at its peak at once", P.timing(0, [0, 2]) === 1);
  check("bands are words: High, Medium, Low", P.bandOf(0.3) === "High" && P.bandOf(0.12) === "Medium" && P.bandOf(0.05) === "Low");
  check("the why-now line", P.hireWhyNow("Marketing", "Sales", 5, { gap: [4, 9], rule: P.RULES[4] }) === "Fractional CMO hired 5 months ago · Sales usually follows in 4–9 months" && P.gapWords([0, 2]) === "within 2 months");

  /* ---------- scoring ---------- */
  console.log("\nScoring and ranking");
  const icp = { industries: ["SaaS"], employees: [], revenue: [], countries: [] };
  const co = (o: Record<string, unknown> = {}) => ({ name: "X Co", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", country: "United States", region: null, model: "B2B", ...o });
  const raw = (o: Record<string, unknown>) =>
    ({ key: String(o.key), kind: "adjacent", at: new Date().toISOString(), atMs: Date.now(), companyId: "c_x", engagementId: null, fn: "Sales", title: null, co: co(), hiredFns: [], stage: "$5M–$20M", owner: null, ym: monthAgo(2), recent: [], ...o }) as import("../lib/radar/signals").RawSignal;
  const revops = { memberId: "m", fn: "RevOps", icp, before: [], beforeFromMember: false };
  const croRevops = raw({ key: "hire:cro", fn: "Sales", ym: monthAgo(2) });
  const weak = raw({ key: "hire:weak", fn: "Legal", ym: monthAgo(2), atMs: Date.now() + 1 });
  const ranked = M.signalsFor([weak, croRevops], revops);
  check("a CRO hired 2 months ago outranks a weak pair for RevOps", ranked[0]?.key === "hire:cro" && ranked[0].score > (ranked[1]?.score ?? 0) * 3, ranked.map((x) => [x.key, x.score.toFixed(3), x.band]));
  check("and reads High, with its window", ranked[0]?.band === "High" && ranked[0].whyNow === "Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months", ranked[0]?.whyNow);
  const role = raw({ key: "role:r", kind: "role", fn: "RevOps", title: "Fractional RevOps lead" });
  const ended = raw({ key: "end:s", kind: "seat", fn: "RevOps" });
  const all3 = M.signalsFor([croRevops, ended, role, weak], revops);
  check("open roles and ended seats stay near the top, in one ranked list", all3[0].key === "role:r" && all3[1].key === "end:s" && all3[2].key === "hire:cro", all3.map((x) => x.key));
  const ft = M.scoreFor(raw({ key: "hire:ft", ledFullTime: { RevOps: "2023" } }), revops)!;
  const noFt = M.scoreFor(raw({ key: "hire:noft" }), revops)!;
  check("a full-time leader of the member's function on file cuts the score hard", near(ft.score, noFt.score * M.FT_PENALTY) && /FT RevOps Leader since 2023/.test(ft.why), [ft.score, noFt.score, ft.why]);
  check("a fractional already in the member's function: no signal", M.scoreFor(raw({ key: "hire:x", hiredFns: ["RevOps"] }), revops) === null);
  const fullTimeEnd = M.scoreFor(raw({ key: "end:ft", kind: "seat", fn: "RevOps", endReason: "Replaced by full-time hire" }), revops)!;
  check("an ended seat that went to a full-time hire is weaker", fullTimeEnd.score < M.scoreFor(ended, revops)!.score / 2 && /full-time/.test(fullTimeEnd.whyNow));
  const fin = { memberId: "m", fn: "Finance", icp, before: [], beforeFromMember: false };
  const named = { ...fin, before: ["Legal"], beforeFromMember: true };
  const legal = raw({ key: "hire:legal", fn: "Legal", ym: monthAgo(5) });
  const plain = M.scoreFor(legal, fin)!;
  const boosted = M.scoreFor(legal, named)!;
  check("the member's own before-answer boosts the pair they named", boosted.score > plain.score * 2 && boosted.band !== "Low" && plain.band === "Low", [plain.score, boosted.score]);
  check("a suggested before-list (not their own answer) boosts nothing", near(M.scoreFor(legal, { ...fin, before: ["Legal"], beforeFromMember: false })!.score, plain.score));
  check("it no longer gates: a pair they didn't name still scores (Low)", !!M.scoreFor(raw({ key: "hire:ops", fn: "Operations" }), named));
  check("a company outside the profile is still out", M.scoreFor(raw({ key: "hire:out", co: co({ industry: "Retail" }) }), revops) === null);
  check("fit: every asked part on file and matching is 1, unknown parts count less", M.fitOf({ ...icp, countries: ["United States"] }, co()) === 1 && M.fitOf({ ...icp, countries: ["United States"] }, co({ country: null })) < 1);
  const dep = raw({ key: "gone:x", kind: "departure", fn: "Finance", gone: { kind: "full-time", level: "C-level" } });
  const depFin = M.scoreFor(dep, fin);
  check("a leader departure in the member's function: High, cover within 2 months", depFin?.band === "High" && /within 2 months/.test(depFin.whyNow) && /^CFO gone from its website · interim or fractional cover usually follows within 2 months$/.test(depFin.whyNow), depFin);
  check("and nothing for another function", M.scoreFor(dep, revops) === null);
  const sales = { memberId: "m", fn: "Sales", icp, before: [], beforeFromMember: false };
  const build = raw({ key: "build:x", kind: "sales-build", fn: null, build: { from: 0, to: 2 } });
  const bs = M.scoreFor(build, sales);
  check("first sales hires posted: Medium for a Sales member, a sales leader in 3–9 months", bs?.band === "Medium" && /First full-time sales roles posted · a fractional Sales leader usually follows in 3–9 months/.test(bs.whyNow), bs);
  check("RevOps next, weaker", (M.scoreFor(build, revops)?.score ?? 0) < bs!.score);
  check("a company with a fractional Sales already: nothing", M.scoreFor({ ...build, hiredFns: ["Sales"] }, sales) === null);
  check("never a percentage on a line", ![...all3, bs!, depFin!].some((x) => /\d+\s*%/.test(`${x.whyNow} ${x.why}`)));

  console.log("\nLow stays off the email and Slack");
  const card = (id: string, band: "High" | "Medium" | "Low") => ({ id, co: id, kind: "adjacent" as const, headline: `Headline ${id}`, facts: ["SaaS"], why: "why", band, whyNow: `why now ${id}`, company: null, locked: true, url: "/x", at: new Date().toISOString() });
  const day = { cards: [card("hi", "High"), card("lo", "Low"), card("me", "Medium")], total: 3, companies: 3, day: "2026-11-19", url: "/x", mode: "daily" as const };
  const mail = F.renderRadarEmail({ name: "Sal", day, unsubscribeUrl: "/u", appUrl: "" });
  check("the email leaves Low out and counts only what it lists", !/Headline lo/.test(mail.text + mail.html) && /Headline hi/.test(mail.text) && /Headline me/.test(mail.text) && /2 companies/.test(mail.subject), mail.subject);
  check("its cards say the band and why now", /High likelihood · why now hi/.test(mail.text) && /Medium likelihood · why now me/.test(mail.text));
  const alert = F.radarAlert([{ kind: "radar", at: new Date().toISOString(), day }], "");
  check("Slack too", !!alert && alert.count === 2 && !alert.lines.some((l) => /Headline lo/.test(l)), alert?.lines);
  check("deliverable keeps High and Medium", M.deliverable([{ band: "High" }, { band: "Low" }, { band: "Medium" }] as { band: "High" | "Medium" | "Low" }[]).length === 2);

  /* ---------- the new fields ---------- */
  console.log("\nThe new fields");
  const view = (tok: string) => t.buildView(tok);
  const coPub = pub("c_one");
  const salSeat = pub("e_sal_now");
  const oldSeat = pub("e_sal_old");
  const before = (await view("tok-sal-0001")).me!.credits;
  const own = await t.perform("tok-sal-0001", { type: "fill", entity: "company", id: coPub, field: "ownership", value: "Bootstrapped" }, "https://post.example.com");
  const after = (await view("tok-sal-0001")).me!.credits;
  check("ownership is a company fact a member adds, for a credit", /Added the ownership type/.test(own.message) && after - before === 1, { msg: own.message, before, after });
  const bad = await t.perform("tok-sal-0001", { type: "fill", entity: "company", id: pub("c_two"), field: "ownership", value: "Owned by aliens" }, "https://post.example.com").catch((e: Error) => e.message);
  check("only the list's values", typeof bad === "string" && /Pick one from the list/.test(bad), bad);
  const unknown = await t.perform("tok-sal-0001", { type: "fill", entity: "company", id: pub("c_two"), field: "ownership", value: "Unknown" }, "https://post.example.com").catch((e: Error) => e.message);
  check("Unknown is no value to add (nothing on file reads as Unknown)", typeof unknown === "string", unknown);
  const piaCo = (await view("tok-pia-0001")).companies.find((c) => c.id === coPub);
  check("another member sees it free, even on a company locked to them", piaCo?.hidden === true && piaCo.cells.ownership?.s === "value" && (piaCo.cells.ownership as { v: string }).v === "Bootstrapped", piaCo?.cells.ownership);
  const why = await t.perform("tok-sal-0001", { type: "fill", entity: "engagement", id: salSeat, field: "whyNow", value: "PE deal, Fundraise" }, "https://post.example.com");
  const salView = await view("tok-sal-0001");
  const mine = salView.companies.find((c) => c.id === coPub)!.engagements.find((e) => e.id === salSeat)!;
  check("why now takes several, kept in the list's order", /Added why now/.test(why.message) && (mine.cells.whyNow as { v: string }).v === "Fundraise, PE deal", [why.message, mine.cells.whyNow]);
  const whyBad = await t.perform("tok-sal-0001", { type: "fill", entity: "engagement", id: salSeat, field: "whyNow", value: "Fundraise, Vibes" }, "https://post.example.com").catch((e: Error) => e.message);
  check("each pick must be on the list", typeof whyBad === "string" && /Pick from the list/.test(whyBad), whyBad);
  const notHolder = await t.perform("tok-pia-0001", { type: "fill", entity: "engagement", id: pub("e_two_mkt"), field: "whyNow", value: "Fundraise" }, "https://post.example.com").catch((e: Error) => e.message);
  check("only the seat holder adds them", typeof notHolder === "string" && /Only the person who held this seat|locked/i.test(notHolder), notHolder);
  const endActive = await t.perform("tok-sal-0001", { type: "fill", entity: "engagement", id: salSeat, field: "endReason", value: "Project done" }, "https://post.example.com").catch((e: Error) => e.message);
  check("why it ended waits until the seat has", typeof endActive === "string" && /hasn't ended yet/.test(endActive), endActive);
  const endOk = await t.perform("tok-sal-0001", { type: "fill", entity: "engagement", id: oldSeat, field: "endReason", value: "Replaced by full-time hire" }, "https://post.example.com");
  check("on an ended seat it saves", /Added why it ended/.test(endOk.message), endOk.message);
  const rev = await t.perform("tok-sal-0001", { type: "fill", entity: "engagement", id: salSeat, field: "revenue", value: "Under $1M" }, "https://post.example.com");
  check("revenue then saves on the seat (the stage Crystal Ball reads)", /Added/.test(rev.message));

  console.log("\nWho introduced you: the seat holder's alone");
  const c0 = (await view("tok-sal-0001")).me!.credits;
  const intro = await t.perform("tok-sal-0001", { type: "fill", entity: "engagement", id: salSeat, field: "introducedBy", value: PRIVATE_NOTE }, "https://post.example.com");
  const c1v = await view("tok-sal-0001");
  check("the seat holder saves it, for no credit", /Only you see who introduced you/.test(intro.message) && c1v.me!.credits === c0, [intro.message, c0, c1v.me!.credits]);
  const salCell = c1v.companies.find((c) => c.id === coPub)!.engagements.find((e) => e.id === salSeat)!.cells.introducedBy;
  check("their own view has it", salCell?.s === "value" && (salCell as { v: string }).v === PRIVATE_NOTE);
  const packed = W.unpackView(JSON.parse(JSON.stringify(W.packView(c1v))));
  check("and keeps it across the wire, an empty one too", (packed.companies.find((c) => c.id === coPub)!.engagements.find((e) => e.id === salSeat)!.cells.introducedBy as { v: string }).v === PRIVATE_NOTE && packed.companies.find((c) => c.id === pub("c_two"))!.engagements.find((e) => e.id === oldSeat)!.cells.introducedBy?.s === "empty");
  const pia = JSON.stringify(await view("tok-pia-0001"));
  const ada = JSON.stringify(await view("tok-ada-0001"));
  const anon = JSON.stringify(await view(null));
  check("no other member's view carries it, nor an admin's, nor a signed-out one", ![pia, ada, anon].some((x) => x.includes("Quentin") || x.includes("\"introducedBy\":{")), [pia, ada, anon].map((x) => [x.includes("Quentin"), x.includes("\"introducedBy\":{")]));
  const salMember = seed.members[0];
  const piaMember = seed.members[1];
  const ctxSal = { member: { ...salMember }, origin: "https://post.example.com" } as Parameters<typeof MCP.getCompany>[0];
  const ctxPia = { member: { ...piaMember }, origin: "https://post.example.com" } as Parameters<typeof MCP.getCompany>[0];
  const mcpOut = JSON.stringify([await MCP.getCompany(ctxSal, { company: coPub }), await MCP.myAccount(ctxSal), await MCP.getCompany(ctxPia, { company: coPub }).catch((e: Error) => e.message)]);
  check("the connector never returns it, not even to the seat holder", !mcpOut.includes("Quentin") && !mcpOut.includes("introduced"), mcpOut.slice(0, 300));
  check("its other new facts are in the connector's seat (free facts)", /why_now/.test(mcpOut) && /Fundraise, PE deal/.test(mcpOut));
  const otherSet = await t.perform("tok-pia-0001", { type: "fill", entity: "engagement", id: salSeat, field: "introducedBy", value: "Me" }, "https://post.example.com").catch((e: Error) => e.message);
  check("nobody else can set it", typeof otherSet === "string", otherSet);
  const st = await t.loadState();
  check("it is kept apart from the table's values", !Object.keys(st.values).some((k) => k.endsWith(".introducedBy")) && st.seatPrivate?.e_sal_now?.introducedBy === PRIVATE_NOTE);
  const adminStats = (await view("tok-ada-0001")).admin?.radarModel;
  check("Pilot metrics count it, never show it", adminStats?.facts.introducedBy === 1 && adminStats.facts.ownership === 1 && adminStats.facts.whyNow === 1 && adminStats.facts.endReason === 1 && !JSON.stringify(adminStats).includes("Quentin"), adminStats?.facts);
  check("and the observed transitions, counts only", adminStats!.transitions >= 1 && adminStats!.top.some((x) => x.from === "Marketing" && x.to === "Sales") && !/Orchid|Tamarind|Sal Seller/.test(JSON.stringify(adminStats)), adminStats);
  const viaTool = await MCP.addMySeat(ctxSal, { company: "Juniper Health", website: "juniper.example", function: "Sales", role: "Fractional VP Sales", status: "Ended", start: "2023-01", end: "2023-09", why_now: ["Leader departed", "Fundraise"], end_reason: "Project done", introduced_by: "A former colleague", revenue_then: "$5M–$20M" });
  const st2 = await t.loadState();
  const jSeat = Object.entries(st2.seatPrivate ?? {}).find(([, v]) => v.introducedBy === "A former colleague");
  check("add_my_seat takes why now, why it ended and who introduced you", !!jSeat && st2.values[`${jSeat[0]}.whyNow`]?.value === "Fundraise, Leader departed" && st2.values[`${jSeat[0]}.endReason`]?.value === "Project done", viaTool);
  check("and its answer never repeats the note", !JSON.stringify(viaTool).includes("A former colleague"));

  /* ---------- the two new triggers ---------- */
  console.log("\nFirst sales hires posted");
  check("a full-time AE, SDR or BDR counts; a fractional or a leader doesn't", ATS.salesHireCount([{ title: "Account Executive" }, { title: "SDR, East" }, { title: "Business Development Representative" }, { title: "Fractional VP Sales" }, { title: "Sales Development Manager" }, { title: "Contract AE" }, { title: "Senior Engineer" }]) === 3);
  const feed = (url: string) =>
    url.includes("/goodco/") ? { status: 200, text: JSON.stringify({ jobs: [{ title: "Account Executive", absolute_url: "https://boards.greenhouse.io/goodco/1" }, { title: "SDR", absolute_url: "https://boards.greenhouse.io/goodco/2" }] }) } : { status: 500, text: "" };
  const seen: [string, number][] = [];
  const srcs = ATS.atsSources(
    [
      { board: { ats: "greenhouse", slug: "goodco" }, company: { name: "Orchid Analytics", domain: "orchid.example" } },
      { board: { ats: "greenhouse", slug: "downco" }, company: { name: "Tamarind Tools", domain: "tamarind.example" } },
    ],
    { fetch: async (u) => feed(u), salesCount: (d, n) => seen.push([d, n]) },
  );
  const jobs = await srcs[0].fetchJobs();
  check("the feeds report a count for a feed that answered, and none for one that failed", seen.length === 1 && seen[0][0] === "orchid.example" && seen[0][1] === 2 && jobs.length === 2, seen);
  const nowA = new Date().toISOString();
  const r1 = await T.mutate((d, sd) => t.noteSalesHires(d, sd, new Map([["orchid.example", 0], ["tamarind.example", 1]]), ago(14 * DAY)));
  check("the first read is a baseline, never a rise", r1 === 0);
  const r2 = await T.mutate((d, sd) => t.noteSalesHires(d, sd, new Map([["orchid.example", 2]]), nowA));
  check("none to two: one rise", r2 === 1);
  const r3 = await T.mutate((d, sd) => t.noteSalesHires(d, sd, new Map([["orchid.example", 2]]), new Date(Date.now() + 1000).toISOString()));
  const r4 = await T.mutate((d, sd) => t.noteSalesHires(d, sd, new Map([["orchid.example", 4]]), new Date(Date.now() + 2000).toISOString()));
  check("the same count, or another rise inside 30 days: no new one", r3 === 0 && r4 === 0, [r3, r4]);
  const s3 = await t.loadState();
  const seed3 = await t.loadSeed();
  check("counts and dates only are kept", JSON.stringify(s3.salesBuild?.c_one).match(/"n":\d|"at":"|"firstAt"|"rises"/g)!.length >= 4 && !/Account Executive|greenhouse/.test(JSON.stringify(s3.salesBuild)));
  const builds = S.detectSignals(seed3, s3, Date.now() - DAY, Date.now() + 5000).filter((x) => x.kind === "sales-build");
  check("a sales-build signal, once", builds.length === 1 && builds[0].companyId === "c_one" && builds[0].build?.to === 2, builds.map((x) => x.key));
  check("and none for the next day's window", !S.detectSignals(seed3, s3, Date.now() + 5000, Date.now() + DAY).some((x) => x.kind === "sales-build"));

  console.log("\nA leader gone from the website");
  const lead = (fn: string, kind = "full-time") => ({ [fn]: { level: "VP" as const, kind: kind as "full-time", how: "team page" as const, url: "https://tamarind.example/team", seenAt: ago(DAY) } });
  const out = (status: "found" | "none" | "failed", functions: Record<string, unknown>, team = true) => ({ companyId: "c_two", status, functions, pages: 2, team, press: false, robots: 0, ...(status === "failed" ? { why: "network" } : {}) }) as import("../lib/leaders/types").LeadersOutcome;
  await t.saveLeaders([out("found", { ...lead("Finance"), ...lead("Marketing") })], null, ago(40 * DAY));
  await t.saveLeaders([out("failed", {})], null, ago(30 * DAY));
  check("a read that failed is no departure (what was on file stays)", !(await t.loadState()).leaderDepartures?.length && Object.keys((await t.loadState()).leaders!.c_two.functions).length === 2);
  await t.saveLeaders([out("found", lead("Marketing"))], null, ago(20 * DAY));
  check("after a failed read, the next good read is no departure either", !(await t.loadState()).leaderDepartures?.length);
  await t.saveLeaders([out("found", lead("Marketing"), false)], null, ago(10 * DAY));
  const depAt = new Date().toISOString();
  await t.saveLeaders([out("found", {})], null, depAt);
  const s4 = await t.loadState();
  check("read OK both times and the leader is missing: one departure, no name", s4.leaderDepartures?.length === 1 && s4.leaderDepartures[0].fn === "Marketing" && s4.leaderDepartures[0].kind === "full-time" && !/https?:/.test(JSON.stringify(s4.leaderDepartures)), s4.leaderDepartures);
  await t.saveLeaders([out("none", {})], null, new Date(Date.now() + 1000).toISOString());
  check("and not again on the next read", (await t.loadState()).leaderDepartures?.length === 1);
  const deps = S.detectSignals(seed3, await t.loadState(), Date.now() - DAY, Date.now() + 5000).filter((x) => x.kind === "departure");
  check("a departure signal for that function, once", deps.length === 1 && deps[0].fn === "Marketing", deps.map((x) => x.key));
  const mkt = { memberId: "m", fn: "Marketing", icp, before: [], beforeFromMember: false };
  const depCard = (await import("../lib/radar/present")).cardOf({ ...M.scoreFor(deps[0], mkt)!, why: M.scoreFor(deps[0], mkt)!.why }, { visible: () => false, cardId: (x: string) => x, coId: (x: string) => x, url: "/x" });
  check("its card names no company and no person", depCard.headline === "A SaaS company no longer lists a Marketing leader" && !/Tamarind/.test(JSON.stringify(depCard)) && depCard.band === "High", depCard);

  console.log("\nHeadcount history");
  await t.perform("tok-sal-0001", { type: "fill", entity: "company", id: pub("c_three"), field: "employees", value: "201–500" }, "https://post.example.com").catch((e: Error) => e.message);
  await T.mutate((d) => {
    d.values["c_three.employees"] = { value: "201–500", by: "mem_sal", at: new Date().toISOString(), status: "live" };
  });
  const n1 = await T.mutate((d, sd) => S.recordHeadcount(d, sd, new Date().toISOString()));
  const h = (await t.loadState()).headcount?.c_three;
  check("a band that changed is noted, the records' band first", n1 === 1 && h?.length === 2 && h[0].band === "51–200" && h[1].band === "201–500", h);
  const n2 = await T.mutate((d, sd) => S.recordHeadcount(d, sd, new Date().toISOString()));
  check("nothing new when nothing changed; companies that never changed aren't stored", n2 === 0 && !(await t.loadState()).headcount?.c_one, n2);

  console.log("\nStage and ownership on a signal");
  await T.mutate((d) => {
    d.engagements.push({ id: "e_one_ops", companyId: "c_one", by: "mem_sal", at: new Date().toISOString() });
    for (const [f, v] of Object.entries({ role: "Fractional CFO", function: "Finance", type: "Fractional", start: monthAgo(5), status: "Active", end: "Ongoing", revenue: "$1M–$5M" }))
      d.values[`e_one_ops.${f}`] = { value: v, by: "mem_sal", at: new Date().toISOString(), status: "live" };
  });
  const s5 = await t.loadState();
  const hire = S.detectSignals(seed3, s5, Date.now() - DAY, Date.now() + 5000).find((x) => x.key === `hire:${pub("e_one_ops")}`);
  check("an adjacent hire carries its stage (revenue when it started) and the company's ownership", hire?.stage === "$1M–$5M" && hire.owner === "Bootstrapped" && (hire.recent ?? []).some((x) => x.fn === "Finance"), hire && { stage: hire.stage, owner: hire.owner, recent: hire.recent });
  const forSales = M.scoreFor(hire!, { memberId: "m", fn: "Marketing", icp, before: [], beforeFromMember: false }, { counts: S.observedTransitions(seed3, s5) });
  check("a bootstrapped $1M–$5M company's CFO, 5 months in: Marketing follows (rule 4), Medium or better", !!forSales && forSales.band !== "Low" && /Fractional CFO hired 5 months ago · Marketing usually follows in 3–9 months/.test(forSales.whyNow), forSales && [forSales.band, forSales.whyNow]);
  check("a seat's 'PE deal' reads the company as PE-backed when nothing else is on file", S.ownershipOf({ values: {} } as never, "c_x", []) === null);
}

main()
  .catch((e) => {
    failures++;
    console.error("FAIL the test run threw", e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${failures ? "FAIL" : "PASS"} ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
