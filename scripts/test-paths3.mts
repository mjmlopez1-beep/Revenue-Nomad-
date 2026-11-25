/**
 * Checks of Your way into a company (lib/paths/rank.ts, lib/paths/plan.ts, lib/paths/ways.ts, GET
 * and POST /api/paths, lib/mcp/ways.ts) and the pages that draw it (app/post/network/Ways.tsx).
 *
 *   npx tsx scripts/test-paths3.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and number in them is made up.
 *
 *  1. Est. success, as pure functions: the links, the hand-offs, who decides and the hiring signals;
 *     rounded to 5, kept between 5 and 85; more hand-offs is a lower number; the order.
 *  2. The plan's state machine: go, each step's answers, No reply yet and its nudge, can't help and
 *     plan B, switching routes, the anonymous counts, deleting.
 *  3. Your way into a company: the recommended route first, the others to compare, the steps, the
 *     plan kept (hop ids, never a name), Go with creating the pipeline deal, the log, persistence.
 *  4. The gates: a locked company never named, people named only by today's rules, public-profile
 *     names only on US seats outside California, Google and LinkedIn people never named by the
 *     connector, no Gmail text, LinkedIn never presented as Merlin's source, another member sees
 *     nothing, the export leaves plans out, Google and LinkedIn deletion and account closure.
 *  5. Where you can get in, Home's move and the pipeline's route line.
 *  6. The pages, drawn on the server, and the CSS's animations with their reduced-motion fallback.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 1200)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const ym = (monthsAgo: number) => new Date(NOW - monthsAgo * 30.44 * DAY).toISOString().slice(0, 7);
const recent = (d: number) => ago(d).slice(0, 10);
const today = new Date(NOW).toISOString().slice(0, 10);
const dir = mkdtempSync(path.join(tmpdir(), "rn-paths3-"));

/* ---------- the made-up world ---------- */
const co = (id: string, name: string, website: string, industry = "SaaS", employees = "51–200", hq = "Austin, TX") => ({ id, fields: { name, website, industry, employees, hq } });
const seat = (id: string, companyId: string, fn: string, operator: string, start: string, end: string | null, holderKey?: string, more: Record<string, unknown> = {}) => ({
  id,
  companyId,
  fields: { source: "Published engagement", function: fn, role: `Fractional ${fn} Lead`, operator, start, ...(end ? { end, status: "Ended" } : { status: "Active" }), type: "Fractional" },
  ...(holderKey ? { holderKey } : {}),
  ...more,
});
const role = (id: string, companyId: string, fn: string) => ({ id, companyId, fields: { source: "Demand scan", function: fn, role: `Fractional VP ${fn}`, status: "Open role", type: "Fractional", posting: "https://jobs.example/role", rate: "$9,000/mo" } });
const fillers = Array.from({ length: 12 }, (_, i) => co(`c_fill${i}`, `Filler Works ${i}`, `fill${i}.example`, "Retail", "11–50"));
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_sam", name: "Sam Rivers", email: "sam.rivers@riversco.example", title: "Fractional Sales lead", token: "tok-sam-0001" },
    { id: "mem_bo", name: "Bo Other", email: "bo.other@example.org", title: "Fractional CMO", token: "tok-bo-0001" },
    { id: "mem_casey", name: "Casey Morgan", email: "casey.morgan@example.net", title: "Fractional CFO", token: "tok-casey-0001" },
  ],
  companies: [
    co("c_halcyon", "Halcyon Freight", "halcyon.example", "Logistics", "201–500", "Dallas, TX"),
    co("c_quarry", "Quarry Lane", "quarrylane.example", "Construction", "201–500"),
    co("c_north", "Northpeak Analytics", "northpeak.example"),
    co("c_gale", "Gale Systems", "gale.example", "SaaS", "51–200", "San Jose, CA"),
    co("c_dune", "Dune Analytics", "dune.example"),
    co("c_acorn", "Acorn Ridge Logistics", "acornridge.example", "Logistics", "51–200"),
    co("c_cobalt", "Cobalt Ridge", "cobaltridge.example", "Manufacturing", "51–200"),
    ...fillers,
  ],
  engagements: [
    // Halcyon: Casey held its Finance seat and reported to the CFO; Theo held Sales (a recent hire, ended); Mark holds Operations; an open Sales role now.
    seat("e_hal_fin_casey", "c_halcyon", "Finance", "Casey Morgan", "2023-03", `${new Date(NOW).getUTCFullYear() - 1}-02`),
    seat("e_hal_sales_theo", "c_halcyon", "Sales", "Theo Park", ym(14), ym(2), "p_theofake001"),
    seat("e_hal_ops_mark", "c_halcyon", "Operations", "Mark Ellis", ym(30), null, "p_markfake001"),
    role("e_hal_role", "c_halcyon", "Sales"),
    // Quarry Lane: Sam's own client now, and Mark holds its Operations seat too.
    seat("e_quarry_sales_sam", "c_quarry", "Sales", "Sam Rivers", ym(10), null),
    seat("e_quarry_ops_mark", "c_quarry", "Operations", "Mark Ellis", ym(12), null, "p_markfake001"),
    // Toni: a name from public profiles, on seats at Northpeak (Texas), Dune (Texas) and Gale (California).
    seat("e_north_fin_toni", "c_north", "Finance", "Toni Vega", ym(20), null, "p_tonifake001", { holderFrom: "public profile" }),
    seat("e_dune_fin_toni", "c_dune", "Finance", "Toni Vega", ym(16), null, "p_tonifake001", { holderFrom: "public profile" }),
    seat("e_gale_fin_toni", "c_gale", "Finance", "Toni Vega", ym(18), null, "p_tonifake001", { holderFrom: "public profile" }),
    role("e_gale_role", "c_gale", "Sales"),
    role("e_dune_role", "c_dune", "Sales"),
    seat("e_cobalt_mkt", "c_cobalt", "Marketing", "Lou Grant", "2021-01", "2022-06", "p_loufake0001"),
  ],
  contacts: [
    { id: "p_hal_rita", engagementId: "e_hal_fin_casey", source: "Published engagement", fields: { name: "Rita Vance", title: "CFO", relationship: "Reported to" } },
    { id: "p_hal_rita2", engagementId: "e_hal_sales_theo", source: "Published engagement", fields: { name: "Rita Vance", title: "CFO", relationship: "Reported to" } },
    { id: "p_hal_rita3", engagementId: "e_hal_ops_mark", source: "Published engagement", fields: { name: "Rita Vance", title: "CFO", relationship: "Hiring for the seat" } },
    { id: "p_acorn_ceo", companyId: "c_acorn", source: "Published engagement", fields: { name: "Dana Ruiz", title: "CEO", relationship: "Decision maker" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const months = (n: number) => Array.from({ length: n }, (_, i) => new Date(NOW - (n - 1 - i) * 30.44 * DAY).toISOString().slice(0, 7));
const ballRow = (c: string, b: string) => ({ k: `test:mem_sam:${c}`, c, kind: "role", l: "New open role: Fractional VP Sales · In your function", b, w: "Hiring now" });
const SECRET_TEXT = "PRIVATE-MESSAGE-TEXT-0001";
const SECRET_SUBJECT = "PRIVATE-SUBJECT-0001";
const msgs = Array.from({ length: 6 }, (_, i) => ({ id: `mg_${i}`, by: i % 2 ? "mem_casey" : "mem_sam", at: ago(12 - i), text: `${SECRET_TEXT} ${i}` }));
const state = {
  ledger: [],
  values: {},
  unlocks: {
    // Sam opened Halcyon, Northpeak, Gale, Dune and Cobalt (not Acorn), and paid for Rita's name and title on one record.
    "c_halcyon.identity": ["mem_sam"],
    "c_north.identity": ["mem_sam"],
    "c_gale.identity": ["mem_sam"],
    "c_dune.identity": ["mem_sam"],
    "c_cobalt.identity": ["mem_sam"],
  },
  seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
  profiles: {
    mem_sam: { function: "Sales", title: "Fractional Sales lead", onboarded: true },
    mem_casey: { fractionals: true, onboarded: true },
  },
  names: {},
  radar: {
    lastRunAt: null,
    lastRunDay: null,
    members: { mem_sam: { sent: {}, days: { [today]: [ballRow("c_halcyon", "High"), ballRow("c_gale", "High"), ballRow("c_dune", "Medium"), ballRow("c_acorn", "High"), ballRow("c_cobalt", "Low")] } } },
    stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
  },
  connector: { alerts: { mem_sam: [{ id: "al_test1", name: "Logistics 201-500", industry: ["Logistics"], employees: ["201–500"], createdAt: ago(10) }] } },
  conversations: [{ id: "cv_casey", a: "mem_sam", b: "mem_casey", about: { companyId: "", engagementId: "" }, kind: "partners", readAt: {}, status: "open", createdAt: ago(40), messages: msgs }],
  network: {
    mem_sam: {
      google: { at: ago(2), scopes: ["calendar"], email: "sam.rivers@riversco.example" },
      cal: {
        at: ago(1),
        companies: {
          c_quarry: { domain: "quarrylane.example", meetings: 9, first: recent(300), last: recent(6), months: months(9), people: [{ key: "ana@quarrylane.example", email: "ana@quarrylane.example", name: "Ana Brooks", title: "CFO", meetings: 9, first: recent(300), last: recent(6), src: ["calendar"], subject: SECRET_SUBJECT }] },
          c_north: { domain: "northpeak.example", meetings: 4, first: recent(90), last: recent(9), months: months(3), people: [{ key: "rae@northpeak.example", email: "rae@northpeak.example", name: "Rae Kim", title: "COO", meetings: 4, first: recent(90), last: recent(9), src: ["calendar"], title2: SECRET_SUBJECT }] },
        },
        unmatched: 0,
        real: 2,
      },
    },
  },
};
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

const CSV = ["First Name,Last Name,URL,Email Address,Company,Position,Connected On", "Owen,Park,https://www.linkedin.com/in/owen-park-fake,,Acorn Ridge Logistics,Head of Sales Operations,12 Mar 2021"].join("\r\n");

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_GOOGLE: "1",
});
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL"]) delete process.env[k];

const SAM = "tok-sam-0001";
const BO = "tok-bo-0001";
const ORIGIN = "https://post.example.com";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");
/** "LinkedIn" only ever as the member's own: "your LinkedIn", "From your LinkedIn". Never Sales Navigator. */
const linkedinOk = (text: string) => !/Sales Navigator/i.test(text) && [...text.matchAll(/LinkedIn/g)].every((m) => /your $/i.test(text.slice(Math.max(0, m.index! - 5), m.index)));

async function main() {
  const R = await import("../lib/paths/rank.ts");
  const PL = await import("../lib/paths/plan.ts");

  /* ---------- 1. Est. success ---------- */
  console.log("\nEst. success");
  const est = (x: Partial<import("../lib/paths/rank.ts").EstInput>) => R.estSuccess({ links: [0.85, 0.72], handoffs: 1, decides: true, openRole: true, recentHire: true, fit: 2, ...x });
  const raw = (x: Partial<import("../lib/paths/rank.ts").EstInput>) => R.estRaw({ links: [0.85, 0.72], handoffs: 1, decides: true, openRole: true, recentHire: true, fit: 2, ...x });
  check("a whole percentage in steps of 5", [0.01, 0.33, 0.5, 0.612, 0.99].every((l) => est({ links: [l] }) % 5 === 0), [0.01, 0.33, 0.5, 0.612, 0.99].map((l) => est({ links: [l] })));
  check("rounded to the nearest 5", R.roundEst(0.624) === 60 && R.roundEst(0.626) === 65 && R.roundEst(0.425) === 45 && R.roundEst(0.4249) === 40);
  check("never under 5: a cold note to someone who doesn't decide at a quiet company", est({ links: [0.12, 0.2], handoffs: 1, decides: false, openRole: false, recentHire: false, fit: 0 }) === 5 && R.roundEst(0) === 5 && R.roundEst(-1) === 5 && R.roundEst(NaN) === 5);
  check("never over 85, however warm", est({ links: [1], handoffs: 0, fit: 3 }) === 85 && R.roundEst(4) === 85);
  const byHops = [0, 1, 2, 3, 4].map((h) => raw({ links: Array(h + 1).fill(0.9), handoffs: h }));
  check("more hand-offs is a lower number (the links as warm)", byHops.every((v, i) => i === 0 || v < byHops[i - 1]), byHops);
  check("...and a hand-off lowers it even with the same links", raw({ handoffs: 2 }) < raw({ handoffs: 1 }) && raw({ handoffs: 1 }) < raw({ handoffs: 0 }));
  check("the last person deciding counts", raw({ decides: true }) > raw({ decides: false }) && Math.abs(raw({ decides: false }) / raw({ decides: true }) - R.EST.notDecider) < 1e-9);
  check("hiring signals lift it: an open role, a recent fractional hire, the fit", raw({ openRole: true }) > raw({ openRole: false }) && raw({ recentHire: true }) > raw({ recentHire: false }) && raw({ fit: 3 }) > raw({ fit: 1 }) && raw({ fit: 1 }) > raw({ fit: 0 }));
  check("a weaker link is a lower number", raw({ links: [0.85, 0.5] }) < raw({ links: [0.85, 0.72] }));
  check("the mockup's routes: Casey's 60%, Ana's 45%, writing to Rita 15%", est({}) === 60 && est({ links: [0.9, 0.65, 0.88], handoffs: 2 }) === 45 && est({ links: [0.12], handoffs: 0 }) === 15, [est({}), est({ links: [0.9, 0.65, 0.88], handoffs: 2 }), est({ links: [0.12], handoffs: 0 })]);
  const sorted = [
    { raw: 0.4, handoffs: 2, decides: true, tie: 0.9, n: "b" },
    { raw: 0.6, handoffs: 1, decides: true, tie: 0.1, n: "a" },
    { raw: 0.4, handoffs: 1, decides: false, tie: 0.5, n: "c" },
    { raw: 0.4, handoffs: 1, decides: true, tie: 0.2, n: "d" },
  ].sort(R.compareRoutes).map((x) => x.n).join("");
  check("routes order: Est. success first, then fewer hand-offs, then who decides", sorted === "adcb", sorted);
  const nowMs = NOW;
  const yr = new Date(NOW).getUTCFullYear();
  const s = (e: import("../lib/paths/rank.ts").Evidence) => R.evidenceStrength(e, nowMs);
  check("links: recent meetings and messages are strong, older ones fade", s({ kind: "met", meetings: 6, emails: 0, last: recent(9) }) >= 0.8 && s({ kind: "met", meetings: 6, emails: 0, last: recent(400) }) < 0.6 && s({ kind: "messages", count: 6, last: recent(5) }) >= 0.8 && s({ kind: "messages", count: 6, last: recent(400) }) < 0.4);
  check("a seat held together and a former client count by how long ago", s({ kind: "together", active: true, endYear: null }) > s({ kind: "together", active: false, endYear: yr - 1 }) && s({ kind: "together", active: false, endYear: yr - 1 }) > s({ kind: "together", active: false, endYear: yr - 8 }) && s({ kind: "client", active: false, endYear: yr - 1 }) > s({ kind: "client", active: false, endYear: yr - 9 }));
  check("a LinkedIn connection alone is weak: Fading at best, never Good", R.rateEvidence({ kind: "linkedin", since: recent(30) }, nowMs) === "Fading" && R.rateEvidence({ kind: "linkedin", since: "2014-01-02" }, nowMs) === "Cold" && s({ kind: "linkedin", since: recent(30) }) < s({ kind: "peer" }));
  check("each link keeps its word: Strong, Good, Fading, Cold", R.bandOf(0.9) === "Strong" && R.bandOf(0.7) === "Good" && R.bandOf(0.45) === "Fading" && R.bandOf(0.2) === "Cold");
  check("the explainer, word for word: a guide, not a prediction", R.HOW_ESTIMATED === "Merlin's read of how well each person knows the next, how many hand-offs it takes, and whether the last person decides. A guide, not a prediction: Merlin has no outcome data yet.");
  check("a route's words: its band, never a percentage", R.wayBandOf(60) === "Warm intro" && R.wayBandOf(20) === "Good path" && R.wayBandOf(10) === "Long shot" && !("estWords" in R) && !("timeWords" in R));
  const pts = ([null, 5, 20, 34, 35, 60, 85] as const).flatMap((b) => (["High", "Medium", "Low"] as const).map((o) => ({ b, o, p: R.mapPoint(b, o, 0.5) })));
  check("on the map, a dot's quadrant is its zone", pts.every(({ b, o, p }) => (R.zoneOf(b, o) === "go") === (p.x > 50 && p.y > 50) && (R.zoneOf(b, o) === "watch") === (p.x < 50 && p.y < 50)), pts);

  /* ---------- 2. the plan ---------- */
  console.log("\nThe plan");
  const shape = (id: string, between: number, more: Partial<import("../lib/paths/plan.ts").RouteShape> = {}) => ({ id, hops: Array.from({ length: between + 1 }, (_, i) => `h${id}${i}`), between, links: Array(between + 1).fill("Strong"), decides: true, est: 60, ...more }) as import("../lib/paths/plan.ts").RouteShape;
  const casey = shape("rA", 1);
  const ana = shape("rB", 2, { est: 45, src: ["google"] });
  const direct = shape("rC", 0, { est: 15 });
  const t0 = Date.parse("2026-11-20T15:00:00Z"); // a Friday
  const g = PL.go(undefined, casey, ana.id, t0);
  const p = g.plan;
  check("go: a plan at step 1 of 3, plan B named, chosen now, the log starts", g.changed && !g.switched && p.step === 1 && p.steps === 3 && p.planB === "rB" && p.at === new Date(t0).toISOString() && p.log.length === 1 && p.log[0].k === "chose" && p.est === 60);
  check("the steps: the ask, one intro a person in between, the meeting; a note straight to who decides is three", PL.stepsOf({ between: 1 }) === 3 && PL.stepsOf({ between: 2 }) === 4 && PL.stepsOf({ between: 0 }) === 3);
  check("go with the same route again changes nothing", !PL.go(p, casey, ana.id, t0 + 1000).changed && p.log.length === 1);
  check("an answer for another step is refused (a second tab)", !PL.answer(p, casey, "sent", 2, t0).ok && p.step === 1);
  check("an answer the step doesn't ask for is refused", !PL.answer(p, casey, "booked", 1, t0).ok && !PL.answer(p, casey, "intro", 1, t0).ok);
  const a1 = PL.answer(p, casey, "sent", 1, t0);
  check("advance: the ask went out, on to step 2 (no outcome counted for the member's own click)", a1.ok && p.step === 2 && !a1.outcome && p.log.at(-1)!.k === "sent");
  const t1 = t0 + 4 * DAY;
  const a2 = PL.answer(p, casey, "noreply", 2, t1);
  check("No reply yet: the step stays, a nudge is drafted for 3 business days on, the outcome recorded", a2.ok && p.step === 2 && a2.outcome === "noreply" && p.nudge === PL.businessDaysAfter(t1, 3) && p.outcomes.at(-1)!.o === "noreply", [p.step, p.nudge]);
  check("3 business days skip the weekend", PL.businessDaysAfter(Date.parse("2026-11-20T10:00:00Z"), 3) === "2026-11-25");
  check("the nudge is due on its day, not before", !PL.nudgeDue(p, t1) && PL.nudgeDue(p, Date.parse(`${p.nudge}T09:00:00Z`)));
  PL.answer(p, casey, "nudged", 2, t1 + DAY);
  check("the nudge sent: the reminder is cleared, still waiting", p.nudge === null && p.step === 2 && p.log.at(-1)!.k === "nudged");
  // Plan B: a fresh plan through Casey; Casey can't help.
  const q = PL.go(undefined, casey, ana.id, t0).plan;
  PL.answer(q, casey, "sent", 1, t0);
  const c1 = PL.answer(q, casey, "cant", 2, t1);
  check("can't help: the outcome is recorded and plan B is called for", c1.ok && c1.outcome === "cant" && !!c1.planB);
  check("plan B takes over: Ana's route at step 1 of 4, picked for the member, the log kept", PL.takePlanB(q, ana, direct.id, t1) && q.route === "rB" && q.step === 1 && q.steps === 4 && q.fromCant === "rA" && q.planB === "rC" && q.log.map((l) => l.k).join(",") === "chose,sent,cant,planb" && q.src?.includes("google"));
  check("a step can't be answered until the member goes with plan B", !PL.answer(q, ana, "sent", 1, t1).ok);
  const goB = PL.go(q, ana, null, t1 + 1000);
  check("going with plan B: it's theirs now, still at step 1", goB.changed && !q.fromCant && q.step === 1 && q.log.at(-1)!.k === "chose");
  check("no plan B: nothing to take over", !PL.takePlanB(q, null, null, t1) && q.route === "rB");
  // Switch.
  const sw = PL.go(q, direct, casey.id, t1 + 2000);
  check("switch route: the plan moves to the new route at step 1, its log and outcomes kept", sw.switched && sw.plan.route === "rC" && sw.plan.step === 1 && sw.plan.steps === 3 && sw.plan.log.at(-1)!.k === "switched" && sw.plan.outcomes.length === q.outcomes.length && sw.plan.planB === "rA");
  // The whole way: direct, reply, booked.
  const d = sw.plan;
  PL.answer(d, direct, "sent", 1, t1);
  PL.answer(d, direct, "intro", 2, t1 + DAY);
  const bk = PL.answer(d, direct, "booked", 3, t1 + 2 * DAY);
  check("meeting booked: every step done, the outcome recorded, nothing more to answer", bk.ok && bk.done && PL.isDone(d) && bk.outcome === "booked" && !PL.answer(d, direct, "booked", 3, t1).ok);
  const outs = PL.OUTCOMES.join(",");
  check("the outcomes kept: made the intro, no reply, can't help, meeting booked", outs === "intro,noreply,cant,booked");
  const stats: import("../lib/paths/plan.ts").RouteStats = {};
  PL.countOutcome(stats, PL.statKey({ between: 1, link: "Strong", decides: true, est: 60 }), "intro");
  PL.countOutcome(stats, PL.statKey({ between: 1, link: "Strong", decides: true, est: 60 }), "intro");
  PL.countOutcome(stats, PL.statKey({ between: 2, link: "Good", decides: false, est: 45 }), "cant");
  check("the anonymous counts: by the step's shape, counts only", JSON.stringify(stats) === JSON.stringify({ "h1|Strong|d1|e60": { intro: 2 }, "h2|Good|d0|e45": { cant: 1 } }), stats);
  const rs: import("../lib/paths/plan.ts").RoutesState = { m1: { c1: d, c2: { ...q, src: ["linkedin"] } }, m2: { c1: p } };
  check("deleting LinkedIn takes only the plans through it", PL.forgetSource(rs, "m1", "linkedin") === 1 && !!rs.m1.c1 && !rs.m1.c2);
  check("account closure takes every plan of the member's, nobody else's", PL.forgetMember(rs, "m1") === 1 && !rs.m1 && !!rs.m2.c1);

  /* ---------- 3. Your way into a company ---------- */
  const P = await import("../lib/paths/index.ts");
  const W = await import("../lib/paths/ways.ts");
  const t = await import("../lib/table.ts");
  const pub = (id: string) => t.tableInternals.pubId(id);
  await P.importConnections(SAM, CSV);
  type WayInView = import("../lib/paths/types.ts").WayInView;
  const way = async (id: string, tok = SAM) => (await W.wayIn(tok, pub(id))) as WayInView;
  const act = (id: string, op: import("../lib/paths/ways.ts").WayOp, tok = SAM) => W.wayAct(tok, pub(id), op);

  console.log("\nYour way into Halcyon Freight, before Rita's name is opened");
  const h0 = await way("c_halcyon");
  if (process.env.SHOW) for (const r of h0.routes) console.log(`  ${r.est}% | ${r.short} | ${r.chain} | ${r.links.map((l) => `${l.band}:${l.words}`).join(" / ")}\n    ${r.why}`);
  check("who decides, by role only until her name is opened", !!h0.decider && /^Their (CFO|decision maker), decides$/.test(h0.decider) && h0.routes.every((r) => r.nodes.at(-1)!.locked) && !/Rita/.test(JSON.stringify(h0)), h0.decider);
  await t.tableInternals.mutate((st) => {
    st.unlocks["p_hal_rita.name"] = ["mem_sam"];
    st.unlocks["p_hal_rita.title"] = ["mem_sam"];
  });

  console.log("\nYour way into Halcyon Freight");
  const h = await way("c_halcyon");
  if (process.env.SHOW) for (const r of h.routes) console.log(`  ${r.est}% | ${r.short} | ${r.chain} | ${r.links.map((l) => `${l.band}:${l.words}`).join(" / ")}\n    ${r.why}\n    ${r.how.join(" / ")}`);
  check("the company's chips: who decides, hired before, the open role", h.decider === "Rita Vance, CFO, decides" && /^Hired \d fractionals before$/.test(h.hired ?? "") && h.openRole === "Open Sales role", [h.decider, h.hired, h.openRole]);
  const [r1, r2, r3] = h.routes;
  check("Merlin recommends Casey's route: the highest Est. success", r1?.short === "Casey's route" && r1.chain === "You → Casey Morgan → Rita Vance, CFO" && r1.est === Math.max(...h.routes.map((r) => r.est)), h.routes.map((r) => [r.short, r.est]));
  check("then Ana's route, one more hand-off, then writing to Rita", r2?.short === "Ana's route" && r2.between === 2 && r2.chain === "You → Ana Brooks → Mark Ellis → Rita Vance, CFO" && r3?.short === "Write to Rita" && r3.between === 0, h.routes.map((r) => r.chain));
  check("best first by Est. success, each one 5 to 85 in steps of 5", h.routes.every((r, i) => r.est >= 5 && r.est <= 85 && r.est % 5 === 0 && (i === 0 || h.routes[i - 1].est >= r.est)));
  check("each link keeps its word as context, and what it rests on", r1.links.map((l) => l.band).join(",") === "Strong,Good" && /messages on Merlin/.test(r1.links[0].words) && /^Reported to them until \d{4}$/.test(r1.links[1].words), r1.links);
  check("the cold note says so", r3.links.length === 1 && r3.links[0].band === "Cold" && r3.links[0].words === "You have never met" && r3.est <= 20);
  check("cards: people in between and how warm, never a time to a meeting", r1.between === 1 && h.routes.every((r) => r.way === R.wayBandOf(r.est) && !("time" in r)), h.routes.map((r) => [r.est, r.way]));
  check("the why line: what you share, who decides", /Casey/.test(r1.why) && /Rita decides on fractional hires, and has hired 3 before/.test(r1.why) && /leans on timing/.test(r3.why), [r1.why, r3.why]);
  check("what happens, numbered: ask, the intro, meet", r1.how.join(" / ") === "You ask Casey for an intro / Casey introduces you to Rita / You meet Rita" && r2.how.length === 4 && r3.how[0] === "You send Rita a short note", [r1.how, r2.how]);
  check("the steps: Casey is a peer on Merlin, so the ask is Message on Merlin with the drafted note", r1.steps[0].act?.kind === "message" && r1.steps[0].primary === "Send to Casey on Merlin" && !!r1.steps[0].note?.body && r1.steps[1].alt === "No reply yet" && r1.steps[1].cant === "Casey can't help" && r1.steps[2].primary === "Meeting booked", r1.steps.map((x) => [x.title, x.primary, x.alt, x.cant]));
  check("Ana is the member's own contact: the drafted note, opened in Gmail by the member", r2.steps[0].act?.kind === "note" && r2.steps[0].primary === "Open in Gmail with the note" && r2.steps[0].title === "Ask Ana for an intro to Mark");
  check("the explainer is on the page", h.explain === R.HOW_ESTIMATED);
  check("no plan yet", h.plan === null);

  console.log("\nGo with Casey's route");
  const pipe0 = await import("../lib/pipelineActions.ts");
  const go1 = await act("c_halcyon", { do: "go", route: r1.id });
  const pl = go1.view.plan!;
  check("a plan at step 1 of 3, with plan B and the decision", !!pl && pl.route === r1.id && pl.step === 1 && pl.steps === 3 && pl.decision === "Casey's route · chosen today" && /^Ana's route: (warm intro|good path|long shot), one more hand-off\.$/.test(pl.planB ?? ""), pl);
  check("the log: chose Casey's route", pl.log.length === 1 && pl.log[0].when === "Today" && /^Chose Casey's route \((warm intro|good path|long shot)\)$/.test(pl.log[0].what), pl.log);
  const deal0 = (await pipe0.pipelineViewFor(SAM))!.entries.find((x) => x.company === pub("c_halcyon"));
  check("Go with created the pipeline deal at To reach out, nothing sent yet, the route on it", !!deal0 && deal0.stage === "reach" && !!deal0.dates.reach && !deal0.dates.sent && deal0.route === true && deal0.next === "Take the first step of your route" && deal0.due === null && deal0.follow === 0, deal0);
  check("Go with says where the deal is, and that nothing is sent", /To reach out/.test(go1.message) && /Nothing is sent until you send it/.test(go1.message), go1.message);
  const kept = JSON.parse(stateFile()).routes?.mem_sam?.c_halcyon;
  check("what is kept: the route and its hop ids, when, the step, plan B, the log, never a name", !!kept && kept.route === r1.id && kept.hops.length === 2 && kept.hops.every((x: string) => /^h[0-9a-f]{16}$/.test(x)) && kept.step === 1 && kept.planB === r2.id && !/Casey|Rita|Morgan|Vance|Ana|Brooks|Mark|Ellis|@/.test(JSON.stringify(kept)), kept);
  const s1 = await act("c_halcyon", { do: "step", step: 1, answer: "sent" });
  check("step 1 done: on to step 2, Waiting on Casey, logged", s1.view.plan!.step === 2 && s1.view.plan!.log.at(-1)!.what === "Asked Casey for an intro" && /checks back with you on/.test(s1.message), s1.view.plan);
  const deal1 = (await pipe0.pipelineViewFor(SAM))!.entries.find((x) => x.company === pub("c_halcyon"))!;
  check("the first step's message went out: To reach out moves to Sent, its first send (no follow-up counted), a follow-up due", deal1.stage === "sent" && !!deal1.dates.sent && !!deal1.dates.reach && deal1.follow === 0 && !!deal1.due && deal1.route === true && deal1.next !== "Take the first step of your route", deal1);
  check("still one deal at the company", (await pipe0.pipelineViewFor(SAM))!.entries.filter((x) => x.company === pub("c_halcyon")).length === 1);
  const hl = ((await W.planLines(SAM)) as { plans: import("../lib/paths/types.ts").PlanLine[] }).plans.find((x) => x.company === pub("c_halcyon"));
  check("the route line's next step keeps a name's capital: Next: Casey introduces you to Rita", hl?.next === "Next: Casey introduces you to Rita", hl?.next);
  const stale = await act("c_halcyon", { do: "step", step: 1, answer: "sent" }).catch((e: Error) => e.message);
  check("the same answer again (a second tab) is refused", typeof stale === "string" && /moved on/.test(stale), stale);
  const s2 = await act("c_halcyon", { do: "step", step: 2, answer: "noreply" });
  check("No reply yet: the nudge drafted and dated, still on step 2", s2.view.plan!.step === 2 && !!s2.view.plan!.nudge && /drafted a short nudge for you to send on/.test(s2.message) && !!s2.view.routes[0].steps[1].nudge?.body, s2.message);
  const statsNow = JSON.parse(stateFile()).routeStats;
  check("the outcome counted anonymously, by the step's shape", !!statsNow && Object.keys(statsNow).every((k) => /^h\d\|(Strong|Good|Fading|Cold|none)\|d[01]\|e\d+$/.test(k)) && Object.values(statsNow).some((v) => (v as Record<string, number>).noreply === 1) && !/mem_|c_|Casey|Halcyon|r[0-9a-f]{16}/.test(JSON.stringify(statsNow)), statsNow);
  const s3 = await act("c_halcyon", { do: "step", step: 2, answer: "cant" });
  const pb = s3.view.plan!;
  check("Casey can't help: plan B, Ana's route, is picked for the member and says why", pb.route === r2.id && pb.step === 1 && pb.steps === 4 && pb.switchedWhy === "Casey couldn't help this time. Ana's route is the next best way to Rita, so it's picked for you." && /^Plan B: Ana's route/.test(s3.message), pb);
  check("the log tells it: chose, asked, no reply, couldn't help, plan B", pb.log.map((l) => l.what).join(" / ").replace(/\((warm intro|good path|long shot)\)/, "(x)") === "Chose Casey's route (x) / Asked Casey for an intro / No reply yet from Casey. Nudge drafted / Casey couldn't help / Plan B: Ana's route", pb.log.map((l) => l.what));
  const s4 = await act("c_halcyon", { do: "go", route: r2.id });
  check("Go with Ana's route: the banner goes, still step 1", s4.view.plan!.switchedWhy === null && s4.view.plan!.step === 1);
  const s5 = await act("c_halcyon", { do: "step", step: 1, answer: "sent" });
  const pipeNow = (await pipe0.pipelineViewFor(SAM))!.entries.find((x) => x.company === pub("c_halcyon"))!;
  check("Ana's ask is a drafted note the member opened: the deal is Sent now, the pipeline's own rule", s5.view.plan!.step === 2 && pipeNow.stage === "sent" && !!pipeNow.dates.sent && pipeNow.route === true && !!pipeNow.due, pipeNow);
  const s6 = await act("c_halcyon", { do: "go", route: r3.id });
  check("Switch route: writing to Rita, step 1, the log keeps everything", s6.view.plan!.route === r3.id && s6.view.plan!.step === 1 && s6.view.plan!.log.at(-1)!.what === "Switched to Write to Rita" && s6.view.plan!.log.length === 8, s6.view.plan!.log);
  await act("c_halcyon", { do: "step", step: 1, answer: "sent" });
  await act("c_halcyon", { do: "step", step: 2, answer: "intro" });
  const s7 = await act("c_halcyon", { do: "step", step: 3, answer: "booked" });
  check("Rita replied, the meeting booked: every step done, the pipeline moves on the calendar's word, not ours", s7.view.plan!.done && s7.view.plan!.log.at(-1)!.what === "Meeting with Rita booked" && /moves to Meeting when it's on your calendar/.test(s7.message), s7.message);
  const outsKept = JSON.parse(stateFile()).routes.mem_sam.c_halcyon.outcomes.map((o: { o: string }) => o.o).join(",");
  check("the plan's outcomes, for calibration", outsKept === "noreply,cant,intro,booked", outsKept);
  const reloaded = await way("c_halcyon");
  check("it persists: the page reads the same plan back", reloaded.plan?.route === r3.id && reloaded.plan.done && reloaded.plan.log.length === s7.view.plan!.log.length);

  /* ---------- 4. the gates ---------- */
  console.log("\nThe gates");
  const views0 = (await t.buildView(SAM)).me!.credits;
  const acorn = await way("c_acorn");
  check("a locked company: no name, no routes, its facts and id, and the step to open it", acorn.locked && acorn.name === null && acorn.routes.length === 0 && acorn.plan === null && acorn.id === pub("c_acorn") && /Freight/.test(acorn.facts) && !/Acorn|Owen|Dana Ruiz/.test(JSON.stringify(acorn)), acorn);
  const goLocked = await act("c_acorn", { do: "go", route: "r0000" }).catch((e: Error) => e.message);
  check("Go with at a locked company is refused, and nothing is spent", typeof goLocked === "string" && /Open this company first/.test(goLocked) && (await t.buildView(SAM)).me!.credits === views0 && !JSON.parse(stateFile()).routes?.mem_sam?.c_acorn, goLocked);
  const gale = await way("c_gale");
  const dune = await way("c_dune");
  if (process.env.SHOW) for (const r of [...gale.routes, ...dune.routes]) console.log(`  ${r.est}% | ${r.chain}`);
  check("a name from public profiles at a California company is never named: their seat, said by what it is", gale.routes.some((r) => r.between >= 2) && !JSON.stringify(gale).includes("Toni") && gale.routes.some((r) => r.nodes.some((n) => n.locked && /fractional Finance/.test(n.label))), gale.routes.map((r) => r.chain));
  check("...and at a US company outside California it is, as the table shows it", dune.routes.some((r) => r.chain.includes("Toni Vega")), dune.routes.map((r) => r.chain));
  const boHal = await way("c_halcyon", BO);
  check("another member sees nothing of Sam's: Halcyon is locked for Bo, no plan, no people", boHal.locked && boHal.plan === null && !/Casey|Ana|Rita|Mark/.test(JSON.stringify(boHal)));
  const boPlans = (await W.planLines(BO)) as { plans: unknown[] };
  check("...and no plans", boPlans.plans.length === 0);
  const MCP = await import("../lib/mcp/ways.ts");
  const sam = (await t.memberForToken(SAM))!;
  const mHal = JSON.stringify(await MCP.waysIn({ member: sam, origin: ORIGIN }, { company_id: pub("c_halcyon") }));
  const mDune = JSON.stringify(await MCP.waysIn({ member: sam, origin: ORIGIN }, { company_id: pub("c_dune") }));
  const mAcorn = JSON.stringify(await MCP.waysIn({ member: sam, origin: ORIGIN }, { company_id: pub("c_acorn") }));
  if (process.env.SHOW) console.log(mHal.slice(0, 900));
  check("ways_in: the routes with how warm each is in words, people in between and steps", /"way_in":"(Warm intro|Good path|Long shot)"/.test(mHal) && /"people_in_between"/.test(mHal) && /"steps":\[/.test(mHal) && /"recommended":true/.test(mHal), mHal.slice(0, 400));
  check("ways_in: no percentage, no Est. success and no time to a meeting in what the connector returns", !/\d\s?%/.test(mHal) && !/est_success|Est\. success|time_to_a_meeting|\d+\s?(?:–|-|to)\s?\d+\s?weeks/i.test(mHal), mHal.match(/[^"]*\d\s?%[^"]*/)?.[0]);
  check("ways_in names a member on Merlin (Casey), never someone from her Google (Ana) or LinkedIn", mHal.includes("Casey Morgan") && !/Ana|Brooks/.test(mHal) && /someone you know/.test(mHal), mHal);
  check("ways_in never names Rae (her calendar)", !/Rae|Kim/.test(mDune) && /someone you know/.test(mDune), mDune);
  check("ways_in at a locked company: no name, no routes, unlock first", !/Acorn|Owen/.test(mAcorn) && /"routes":\[\]/.test(mAcorn) && /unlock/.test(mAcorn), mAcorn);
  const all = JSON.stringify([h, gale, dune, acorn, await W.getInView(SAM), await W.planLines(SAM)]);
  check("no Gmail or message text anywhere: counts and dates only", !all.includes(SECRET_TEXT) && !all.includes(SECRET_SUBJECT) && !stateFile().split('"routes"')[1]?.includes(SECRET_TEXT));
  check("LinkedIn is only ever the member's own (\"your LinkedIn\"), and never Sales Navigator", linkedinOk(all) && linkedinOk(mHal + mDune), (all.match(/.{30}LinkedIn.{10}/g) ?? []).slice(0, 4));
  const ex = await t.exportState();
  check("the admin export leaves every plan out (the anonymous counts stay)", !("routes" in ex) && !JSON.stringify(ex).includes(r1.id) && "routeStats" in ex);

  /* ---------- 5. Where you can get in, Home and the pipeline ---------- */
  console.log("\nWhere you can get in");
  type GetInView = import("../lib/paths/types.ts").GetInView;
  const map = (await W.getInView(SAM, Date.now() + 1)) as GetInView;
  const row = (id: string) => map.rows.find((r) => r.id === pub(id));
  if (process.env.SHOW) for (const r of map.rows) console.log(`  ${r.name ?? r.facts} | ${r.zone} | ${r.best} | ${r.odds} | ${r.via} | ${r.x},${r.y}`);
  check("every company that fits: her Crystal Ball and her saved view, not her own client", !!row("c_halcyon") && !!row("c_gale") && !!row("c_dune") && !!row("c_acorn") && !row("c_quarry") && !row("c_fill0"), map.rows.map((r) => r.name ?? r.facts));
  check("Halcyon: its best route's Est. success, through Casey, her plan there, hiring now", row("c_halcyon")!.best === r1.est && row("c_halcyon")!.via === "Through Casey Morgan, then Rita Vance" && row("c_halcyon")!.plan && row("c_halcyon")!.hiringNow, row("c_halcyon"));
  check("Acorn is locked: no name and no route words, its routes open with it", row("c_acorn")!.name === null && row("c_acorn")!.via === null && row("c_acorn")!.locked && !JSON.stringify(map).includes("Acorn"));
  check("each dot sits in its zone's quadrant", map.rows.every((r) => (r.zone === "go") === (r.x > 50 && r.y > 50) && (r.zone === "find") === (r.x < 50 && r.y > 50) && (r.zone === "warm") === (r.x > 50 && r.y < 50)), map.rows.map((r) => [r.zone, r.x, r.y]));
  check("the counts by zone add up", Object.values(map.counts).reduce((a, b) => a + b, 0) === map.total);

  console.log("\nHome's move and the pipeline's route line");
  const dRoute = dune.routes.find((r) => r.chain.includes("Toni Vega"))!;
  await act("c_dune", { do: "go", route: dRoute.id });
  await act("c_dune", { do: "step", step: 1, answer: "sent" });
  await act("c_dune", { do: "step", step: 2, answer: "noreply" });
  const lines = (await W.planLines(SAM)) as { plans: import("../lib/paths/types.ts").PlanLine[] };
  const dl = lines.plans.find((x) => x.company === pub("c_dune"))!;
  if (process.env.SHOW) console.log(dl);
  check("Home's move: the plan still going leads, check in with Rae, the nudge drafted", lines.plans[0]?.company === pub("c_dune") && dl.move === "Check in with Rae" && /No reply yet\. A short nudge is drafted\./.test(dl.line) && !!dl.now?.nudge && dl.step === 2, dl);
  check("the route line: via Rae → Toni → whoever decides, the step, since when, the next", /^via Rae → Toni/.test(dl.via) && /^Step 2 of \d · waiting on Rae since /.test(dl.since) && /^Next: nudge Rae, /.test(dl.next), dl);
  const later = W.planLinesOf(await t.loadSeed(), await t.loadState(), sam, Date.now() + 7 * DAY);
  check("the nudge is due on its day: Home says so", later.find((x) => x.company === pub("c_dune"))!.nudgeDue && !dl.nudgeDue);
  const hal = lines.plans.find((x) => x.company === pub("c_halcyon"))!;
  check("a finished plan comes after the ones still going", hal.done && lines.plans.indexOf(hal) > lines.plans.indexOf(dl));
  const dDeal = (await pipe0.pipelineViewFor(SAM))!.entries.find((x) => x.company === pub("c_dune"));
  check("the pipeline deal carries the route", dDeal?.route === true, dDeal);
  const myPipe = JSON.stringify(await (await import("../lib/mcp/tools.ts")).myPipeline({ member: sam, origin: ORIGIN }));
  check("the connector's my_pipeline doesn't carry the route line (its names are the app's)", !/Rae|Toni|Kim|Vega/.test(myPipe), myPipe.slice(0, 300));

  console.log("\nDeleting");
  // A LinkedIn connection at Cobalt: a route from her import alone.
  await P.importConnections(SAM, `${CSV}\r\nWes,Field,https://www.linkedin.com/in/wes-field-fake,,Cobalt Ridge,COO,01 Aug 2022`);
  const cob = await way("c_cobalt");
  const wes = cob.routes.find((r) => r.chain.includes("Wes Field"));
  check("a route through a LinkedIn connection alone: weak, From your LinkedIn", !!wes && wes.kind === "From your LinkedIn" && wes.links[0].band !== "Strong" && wes.links[0].band !== "Good", wes);
  if (wes) await act("c_cobalt", { do: "go", route: wes.id });
  check("its plan is kept, marked as from LinkedIn", JSON.parse(stateFile()).routes.mem_sam.c_cobalt?.src?.includes("linkedin"));
  await P.deleteConnections(SAM);
  const afterLi = JSON.parse(stateFile()).routes.mem_sam;
  check("deleting the LinkedIn import deletes the plan through it, and only that", !afterLi.c_cobalt && !!afterLi.c_dune && !!afterLi.c_halcyon, Object.keys(afterLi));
  const G = await import("../lib/google/index.ts");
  check("the plan through Rae is marked as from Google", JSON.parse(stateFile()).routes.mem_sam.c_dune.src.includes("google"));
  await G.disconnectAll(SAM);
  const afterG = JSON.parse(stateFile()).routes.mem_sam;
  check("Disconnect and delete everything deletes the plans through Google, and keeps the rest", !afterG.c_dune && !!afterG.c_halcyon, Object.keys(afterG));
  await t.tableInternals.mutate((st) => {
    PL.forgetMember(st.routes, "mem_sam");
  });
  check("account closure deletes every plan of the member's; the anonymous counts stay", !JSON.parse(stateFile()).routes?.mem_sam && !!JSON.parse(stateFile()).routeStats);

  /* ---------- 6. the pages ---------- */
  console.log("\nThe pages");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { UiCtx } = await import("../app/post/ui.tsx");
  const noop = () => {};
  const me = (await t.buildView(SAM)).me!;
  const uiFor = (m: unknown) => ({ me: m, act: async () => ({ ok: true, message: "" }), layout: "wide", busy: new Set(), flash: new Set(), pulse: null, unlock: noop, unlockMany: async () => true, edit: noop, fill: async () => true, openCompany: noop, openAdd: noop, isHidden: () => false, holdsSeat: () => false, addable: () => [], seats: { n: 0, missing: 0 }, openSeats: noop, openPage: noop, contact: null });
  const render = (el: unknown) => renderToStaticMarkup(React.createElement(UiCtx.Provider, { value: uiFor(me) as never }, el as never));
  const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const V = await import("../app/post/network/Ways.tsx");
  const body = (v: WayInView, mode: "choose" | "plan", phone = false) => render(React.createElement(V.WayInBody, { v, phone, i: null, mode, pickedId: null, onPick: noop, onMode: noop, onAct: async () => {}, busy: false, onBack: noop }));
  const choose = body(h, "choose");
  check("the page head, the recommendation, its why line and Go with", /class="page-head/.test(choose) && /Your way into Halcyon Freight/.test(text(choose)) && /Merlin recommends/.test(text(choose)) && text(choose).includes(r1.why) && /Go with Casey's route/.test(text(choose)));
  check("one word, how warm, and none of the old measures or numbers", text(choose).includes(r1.way) && !/Est\. success|\d\s?%|to a meeting|\d+\s?(?:–|-|to)\s?\d+\s?weeks/i.test(text(choose)) && !/Most likely|Warmest|Fewest steps|Chance|Warmth/.test(text(choose)), text(choose).slice(0, 300));
  check("the route drawn link by link: each person pops, each link grows, its word under it, labelled for screen readers", (choose.match(/rn-pop/g) ?? []).length >= 3 && (choose.match(/rn-grow"/g) ?? []).length + (choose.match(/rn-grow /g) ?? []).length >= 2 && /data-band="Strong"[^>]*>|wr-strong/.test(choose) && /role="img" aria-label="You → Casey Morgan → Rita Vance, CFO/.test(choose) && /Strong · /.test(text(choose)));
  check("the line is as thick as the link is warm: Strong, then Good", /wr-line wr-strong/.test(choose) && /wr-line wr-good/.test(choose));
  check("what happens, numbered", /aria-label="What happens"/.test(choose) && text(choose).includes("You ask Casey for an intro"));
  check("How Merlin judges this, behind a button", /aria-expanded="false"[^>]*>How Merlin judges this</.test(choose));
  check("the routes to compare: a card each, the picked one pressed, its band, people in between, who decides", (choose.match(/class="wy-card"/g) ?? []).length === h.routes.length && /aria-pressed="true"[^>]*data-card="/.test(choose) && /class="wy-badge">(Warm intro|Good path|Long shot)</.test(choose) && /In between/.test(text(choose)) && /Reaches who decides/.test(text(choose)) && !/Time to a meeting/.test(text(choose)));
  check("ember at most twice a screen, no violet", (choose.match(/chip-ember/g) ?? []).length <= 2 && !/violet/i.test(choose), (choose.match(/chip-ember/g) ?? []).length);
  check("buttons are big enough to tap (btn-lg on the actions)", /btn btn-pine btn-lg/.test(choose));
  const phoneChoose = body(h, "choose", true);
  check("on a phone: the route top to bottom (rn-growy) and Other routes", /rn-growy/.test(phoneChoose) && /Other routes/.test(text(phoneChoose)) && !/rn-grow"/.test(phoneChoose));
  check("the plan at step 1: the drafted note and the action", /Drafted for you/.test(text(body(go1.view, "plan"))) && /Send to Casey on Merlin/.test(text(body(go1.view, "plan"))));
  const planHtml = body(s2.view, "plan");
  check("the plan at step 2 after No reply yet: the nudge drafted, the link flowing, the person pulsing", /Got it\. Merlin drafted a short nudge/.test(text(planHtml)) && /rn-flow/.test(planHtml) && /rn-pulse/.test(planHtml) && /Send the nudge/.test(text(planHtml)) && /Casey can't help/.test(text(planHtml)), text(planHtml).slice(0, 500));
  check("the decision card (plan B) and what has happened, and Switch route", /Your decision/.test(text(planHtml)) && /If it stalls/.test(text(planHtml)) && /What's happened/.test(text(planHtml)) && /Switch route/.test(text(planHtml)) && /Asked Casey for an intro/.test(text(planHtml)));
  const pbHtml = body(s3.view, "choose");
  check("plan B: the banner says why, and plan B leads", /Casey couldn't help this time/.test(text(pbHtml)) && /Go with Ana's route/.test(text(pbHtml)));
  const lockedHtml = body(acorn, "choose");
  check("a locked company: Open this company to see your routes, with the usual unlock, never its name", /Open this company to see your routes/.test(text(lockedHtml)) && !/Acorn/.test(lockedHtml) && /Unlock/.test(text(lockedHtml)));
  const desk = render(React.createElement(V.GetInBody, { view: map, infos: [], phone: false, openCompany: noop }));
  const dots = desk.match(/<g[^>]*class="gi-dot[^"]*"[^>]*>/g) ?? [];
  check("the map: an SVG, every company a button with a label", /<svg[^>]*role="group"/.test(desk) && dots.length === map.rows.length && dots.every((d) => /role="button"/.test(d) && /tabindex="0"/.test(d) && /aria-label="[^"]+"/.test(d)), dots.slice(0, 2));
  check("a locked company's dot says its facts, never its name", dots.some((d) => /aria-label="A locked company, Freight/.test(d)) && !desk.includes("Acorn"));
  check("the map's page: its head, the zones with their counts, a Map and List view", /class="page-head/.test(desk) && /Where you can get in/.test(text(desk)) && ["Go now", "Find a way in", "Keep warm", "Watch"].every((z) => text(desk).includes(z)) && /aria-pressed="true"[^>]*>Map</.test(desk) && />List</.test(desk));
  check("the map's axis says how warm your way in is, in band names, never a percentage or the old measures", desk.includes("How warm your way in is") && /Long shot/.test(desk) && /Warm intro/.test(desk) && !/est\. success|\d\s?%<|>\d+%/i.test(desk) && !/Most likely|Warmest|Fewest steps/.test(desk));
  check("ember at most twice on the map", (desk.match(/chip-ember/g) ?? []).length <= 2, (desk.match(/chip-ember/g) ?? []).length);
  const ph = render(React.createElement(V.GetInBody, { view: map, infos: [], phone: true, openCompany: noop }));
  check("on a phone it is the list: grouped by zone, a button a company, no map", !/<svg/.test(ph) && /class="gi-group/.test(ph) && map.rows.every((r) => ph.includes(`data-row="${r.id}"`)));
  const move = render(React.createElement(V.RouteMoveCard, { p: dl, onAnswer: noop, busy: false }));
  check("Home's move: the step, the company and route, the title, the track", /Step 2 of/.test(text(move)) && /Dune Analytics · Rae's route/.test(text(move)) && /Check in with Rae/.test(text(move)) && /wm-track/.test(move) && /Rae replied/.test(text(move)));
  const lineHtml = render(React.createElement(V.RouteLineBox, { p: dl }));
  check("the deal card's route line: the route, the step's bars, since when, the next", /Route:/.test(text(lineHtml)) && /via Rae/.test(text(lineHtml)) && (lineHtml.match(/<span class="(done|now|)"/g) ?? []).length === dl.steps && /Next: nudge Rae/.test(text(lineHtml)));
  const rec = render(React.createElement(V.RecordWaysBody, { v: s2.view }));
  check("the record's Your ways in: the plan first, the other routes folded", /Your ways in/.test(text(rec)) && /Your plan · Casey's route/.test(text(rec)) && /\d other routes?/.test(text(rec)) && /Open the plan/.test(text(rec)) && /Switch route/.test(text(rec)));
  const recNo = render(React.createElement(V.RecordWaysBody, { v: h }));
  check("...and without a plan, the route Merlin recommends", /Merlin recommends/.test(text(recNo)) && /See your way in/.test(text(recNo)));

  console.log("\nThe animations");
  const css = readFileSync(new URL("../app/post/network/ways.css", import.meta.url), "utf8");
  const KF = ["rn-grow", "rn-pop", "rn-flow", "rn-pulse", "rn-growy", "rn-flowy"];
  check("every animation of the mockups, as CSS keyframes", KF.every((k) => new RegExp(`@keyframes ${k}\\b`).test(css) && new RegExp(`\\.${k}\\s*[,{]`).test(css)));
  const reduced = /@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/.exec(css)?.[1] ?? "";
  check("with reduced motion every one is still: no animation, drawn in full", KF.every((k) => reduced.includes(`.${k}`)) && /animation:\s*none/.test(reduced) && /opacity:\s*1/.test(reduced) && /transform:\s*none/.test(reduced), reduced);
  const pkg = readFileSync(new URL("../package.json", import.meta.url), "utf8");
  check("no animation library", !/framer-motion|motion"|gsap|react-spring|lottie|animejs/.test(pkg));
  const src = readFileSync(new URL("../app/post/network/Ways.tsx", import.meta.url), "utf8");
  check("the pages' words never present LinkedIn or Sales Navigator as Merlin's source", linkedinOk(src.replace(/^\s*(\*|\/\/).*$/gm, "")));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
