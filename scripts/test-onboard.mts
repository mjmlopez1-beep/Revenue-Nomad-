/**
 * Checks for onboarding (app/onboard): the Follow companies suggestions and the heading that
 * says how they were picked, what a client card on Find your seats says about the seats on file,
 * the title a new member starts with, and the saved view behind the weekly email offered at the
 * end. The pure parts run with no server. With BASE set (scripts/test-all.sh does), it also joins
 * a fresh account and checks the server side: no "Member" title, and the offered saved view saves.
 *
 *   npx tsx scripts/test-onboard.mts                       pure checks only
 *   BASE=http://localhost:4600 npx tsx scripts/test-onboard.mts
 */
import type { Cell, CompanyRec, EngagementRec, Icp } from "../lib/tableTypes";
import { alertView, metaOf, pillPlace, realTitle, seatFns, seatState, seatsAt, suggest, titlesFor } from "../app/onboard/suggest";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${JSON.stringify(detail)}`}`);
}

const v = (x: string): Cell => ({ s: "value", v: x, ver: 0 });
const EMPTY: Cell = { s: "empty" };
const LOCKED: Cell = { s: "locked", ver: 0 };

let n = 0;
function seat(cells: Record<string, Cell>, extra: Partial<EngagementRec> = {}): EngagementRec {
  return { id: `e${++n}`, verified: false, cells: { operator: EMPTY, ...cells }, people: [], updatedAt: null, yours: false, ...extra } as EngagementRec;
}
function co(name: string, o: { industry?: string; employees?: string; functions?: string[]; hiring?: string[]; fractional?: number; operators?: number; score?: number; seats?: EngagementRec[] } = {}): CompanyRec {
  const seats = o.seats ?? [];
  return {
    id: `c_${name.toLowerCase().replace(/\W+/g, "")}`,
    name,
    iconDomain: null,
    cells: { industry: o.industry ? v(o.industry) : EMPTY, employees: o.employees ? v(o.employees) : EMPTY },
    engagements: seats,
    people: [],
    following: false,
    facts: { known: 0, locked: 0, missing: 0 },
    updatedAt: null,
    mine: false,
    friendly: {
      score: o.score ?? 50,
      tier: null,
      fractional: o.fractional ?? (o.functions?.length ?? 0),
      open: 0,
      functions: o.functions ?? [],
      operators: o.operators ?? 0,
      recent: 0,
      hiring: o.hiring ?? [],
    },
  } as unknown as CompanyRec;
}

/* ---------- title ---------- */

check("a stored 'Member' is no title, so the field starts empty", realTitle("Member") === "" && realTitle(" Member ") === "" && realTitle(undefined) === "");
check("a real title is kept", realTitle("Fractional CRO") === "Fractional CRO");
check("Sales gets title suggestions, the first one is the placeholder", titlesFor("Sales")[0] === "Fractional VP Sales" && titlesFor("Sales").length >= 2);
check("no function, no suggestions", titlesFor(null).length === 0);

/* ---------- Follow companies: suggestions and heading ---------- */

const sales = (holder = false) => seat({ function: v("Sales"), operator: holder ? LOCKED : EMPTY });
const mk = (fn: string) => seat({ function: v(fn) });
const pool: CompanyRec[] = [
  // Hired Sales and Marketing; a Sales seat holder is on file.
  ...Array.from({ length: 7 }, (_, i) => co(`HasSales${i}`, { industry: "SaaS", functions: ["Sales", "Marketing"], seats: [sales(true), mk("Marketing")], score: 60 + i })),
  // Hired Marketing only: no fractional Sales yet.
  ...Array.from({ length: 7 }, (_, i) => co(`NoSales${i}`, { industry: i < 3 ? "Pharma & Biotech" : "SaaS", functions: ["Marketing"], seats: [mk("Marketing")], score: 40 + i })),
  // A full-time Growth seat only: no fractional functions, but a seat with a function on file.
  co("Blueshift", { industry: "SaaS", seats: [seat({ function: v("Growth"), type: v("Full-time") })], score: 99 }),
  // Nothing on file at all.
  co("Bare", { industry: "SaaS", score: 100 }),
];

const adj = suggest(pool, "adjacent", "Sales");
check("adjacent: heading says no fractional Sales yet", adj.title === "With no fractional Sales yet", adj.title);
check("adjacent: every suggestion really has no fractional Sales", adj.list.length === 6 && adj.list.every((c) => !c.friendly.functions.includes("Sales")), adj.list.map((c) => c.name));

const intro = suggest(pool, "intro", "Sales");
check("intro: heading names a Sales seat holder on file", intro.title === "With a Sales seat holder on file", intro.title);
check("intro: every suggestion has a Sales seat with its holder on file", intro.list.length === 6 && intro.list.every((c) => c.name.startsWith("HasSales")), intro.list.map((c) => c.name));

const icp: Icp = { industries: ["Pharma & Biotech", "SaaS"], employees: [], revenue: [], countries: [] };
const introIcp = suggest(pool, "intro", "Sales", icp);
check("intro with a profile: heading keeps both the profile and the goal", introIcp.title.startsWith("Fit your Ideal Fractional Profile, with a Sales seat holder on file"), introIcp.title);
check("intro with a profile: the companies that fit both come first", introIcp.list.slice(0, 6).every((c) => c.name.startsWith("HasSales")), introIcp.list.map((c) => c.name));

const adjIcp = suggest(pool, "adjacent", "Sales", icp);
check("adjacent with a profile: each picked industry gets a turn", adjIcp.list.some((c) => c.cells.industry && (c.cells.industry as { v?: string }).v === "Pharma & Biotech") && adjIcp.list.some((c) => (c.cells.industry as { v?: string }).v === "SaaS"), adjIcp.list.map((c) => c.name));
check("adjacent with a profile: no Sales hire in the list", adjIcp.list.every((c) => !c.friendly.functions.includes("Sales")), adjIcp.list.map((c) => c.name));

const short = suggest([...pool.slice(0, 2), pool[14], pool[15]], "intro", "Sales");
check("a short list is topped up and the heading says so", short.title === "With a Sales seat holder on file, then more" && short.list.length === 4, { t: short.title, n: short.list.length });
check("companies with nothing on file only fill the end", short.list[short.list.length - 1].name === "Bare", short.list.map((c) => c.name));

const roles = suggest(pool, "roles", "Sales");
check("roles: heading matches a list built from Sales hires", roles.title === "That hired or are hiring a fractional in Sales" && roles.list.every((c) => c.friendly.functions.includes("Sales")), roles.title);

check("a card shows the functions the table shows (a full-time Growth seat)", seatFns(pool[14]).join() === "Growth", seatFns(pool[14]));
check("a company card's meta still counts its seats", metaOf(pool[14]).includes("1 seat"), metaOf(pool[14]));

/* ---------- Find your seats: the client card ---------- */

const revops = seat({ function: v("RevOps"), operator: LOCKED });
const belFuse = co("Bel Fuse Inc.", { seats: [revops] });
const a = seatsAt(belFuse, "Sales");
check("a seat in another function is listed, never 'no seat on file'", a.others.length === 1 && !/don't have a seat/.test(a.note ?? "") && /No Sales seat on file here yet/.test(a.note ?? "") && /RevOps/.test(a.note ?? ""), a);

const hone = co("Hone", { seats: [seat({ function: v("Sales"), operator: LOCKED })] });
const h = seatsAt(hone, "Sales");
check("a Sales seat under someone else says so", /1 Sales seat on file here is under someone else/.test(h.note ?? "") && h.others.length === 1, h.note);
check("its state reads as held", seatState(h.others[0]) === "A seat holder is on file", seatState(h.others[0]));

const scan = co("Scanned", { seats: [seat({ function: v("Sales") }, { claimable: true }), seat({ function: v("RevOps") }, { claimable: true })] });
const sc = seatsAt(scan, "Sales");
check("claimable seats in their function come to claim, with no note", sc.claim.length === 1 && val(sc.claim[0].cells.function) === "Sales" && sc.note === null, sc);

check("nothing on file: the plain line", seatsAt(co("Empty"), "Sales").note === "We don't have a seat on file there yet." && seatsAt(null, "Sales").note === "We don't have a seat on file there yet.");

function val(c: Cell | undefined) {
  return c && c.s === "value" ? c.v : null;
}

/* ---------- the weekly email at the end ---------- */

const avIcp: Icp = { industries: ["SaaS"], employees: ["11–50"], revenue: [], countries: ["United States"] };
const av = alertView("Sales", avIcp);
const place = new URLSearchParams(av.place);
check("the alert opens Hiring now on seats", place.get("v") === "hiring" && place.get("t") === "seats", av.place);
check(
  "the alert opens with the profile pill on and only the function as a hard filter, so a company with a part not on file stays in",
  place.get("f") === "fn:Sales~icp",
  place.get("f"),
);
check("the alert's criteria (the weekly email) spell the profile out", av.criteria.function === "Sales" && av.criteria.industry?.[0] === "SaaS" && av.criteria.employees?.[0] === "11–50" && av.criteria.country?.[0] === "United States", av.criteria);
check("the alert's name names the function and the profile", /^Sales roles at SaaS companies/.test(av.name), av.name);
check("no function: no function in the criteria", !alertView(null, null).criteria.function && new URLSearchParams(alertView(null, null).place).get("f") === "-");
check("no profile: the function alone, no pill", new URLSearchParams(alertView("Marketing", null).place).get("f") === "fn:Marketing");
// The view onboarding saved before, with the profile spelled out as hard filters, takes the pill form.
const oldPlace = new URLSearchParams({ v: "hiring", t: "seats", f: "industry:SaaS~employees:11–50~fn:Sales~country:United States" }).toString();
check("an old onboarding view (the profile spelled out) moves to the pill form", pillPlace(oldPlace, "Sales", avIcp) === av.place, pillPlace(oldPlace, "Sales", avIcp));
check("the pill form, another profile, or a view the member saved themselves stays as it is", pillPlace(av.place, "Sales", avIcp) === null && pillPlace(oldPlace, "Sales", { ...avIcp, employees: ["51–200"] }) === null && pillPlace(oldPlace, "Marketing", avIcp) === null && pillPlace("v=all&t=companies&f=industry:SaaS", "Sales", avIcp) === null && pillPlace(oldPlace, "Sales", null) === null);

/* ---------- the server: a new member's title, and the saved view ---------- */

const BASE = (process.env.BASE || "").replace(/\/$/, "");
if (BASE) {
  const ip = `10.77.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
  const call = async (body?: unknown, token?: string) => {
    const r = await fetch(`${BASE}/api/table`, {
      method: body === undefined ? "GET" : "POST",
      headers: { "x-forwarded-for": ip, ...(body === undefined ? {} : { "content-type": "application/json" }), ...(token ? { cookie: `rn_table=${token}` } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await r.text();
    let json: any = null;
    try {
      json = JSON.parse(text);
    } catch {}
    return { r, json };
  };
  const email = `qa+onboard-${Date.now().toString(36)}@example.com`;
  const j = await call({ join: { name: "Olive Onboard", email } });
  const token = (j.r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean);
  check("joins", !!token, j.r.status);
  if (token) {
    const view = (await call(undefined, token)).json;
    check("a new member has no title, never 'Member'", view?.me?.title === "", view?.me?.title);
    const prof = await call({ action: { type: "profile", function: "Sales", goal: "intro", icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } } }, token);
    check("the onboarding answers save", prof.r.status === 200 && !prof.json?.error, prof.json?.error);
    const after = (await call(undefined, token)).json;
    check("the goal is stored as its key", after?.me?.goal === "intro" && after?.me?.function === "Sales", { goal: after?.me?.goal, fn: after?.me?.function });
    check("leaving the title empty keeps it empty", after?.me?.title === "", after?.me?.title);
    const alert = alertView("Sales", after?.me?.icp ?? null);
    const sv = await call({ action: { type: "savedView", op: "save", name: alert.name, place: alert.place, criteria: alert.criteria, email: true } }, token);
    check("the weekly email offer saves as a saved view", sv.r.status === 200 && !sv.json?.error, sv.json?.error);
    const last = (await call(undefined, token)).json;
    const saved = last?.me?.savedViews?.[0];
    check("the saved view keeps its place, function and email", saved?.place === alert.place && saved?.criteria?.function === "Sales" && saved?.email === true, saved);
  }
}

console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
