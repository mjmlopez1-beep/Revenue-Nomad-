/**
 * Checks of "Recently hired" (lib/hired.ts, the Filters keys hiredFn and hiredWithin in
 * app/post/model.ts): the rules, the filter on every list with its counts and sort, the address
 * and saved views, the weekly email's line, the weekly post in Slack and the connector's
 * search_companies params. No server: the server parts run in process on a made-up seed in a
 * temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-hired.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-hired-"));
const BASE = "https://post.example.com";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const now = new Date(NOW);
/** The month `k` months before this one, as a start ("2026-09"). */
const ym = (k: number) => {
  const d = new Date(now.getFullYear(), now.getMonth() - k, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/* ---------- the made-up seed (server parts) ---------- */

const HOLDER = "Nina Namedholder";
const HIDDEN_NAME = "Hidden Freight Co";
/** A seat below Lead whose holder is on file, so its role is locked with them (SEAT_BUNDLE): the member never sees this title. */
const JUNIOR_TITLE = "Fractional Finance Systems Manager";
const JUNIOR_HOLDER = "Hal Heldjunior";
const seat = (id: string, companyId: string, fields: Record<string, string>, addedAt?: string) => ({ id, companyId, fields, verified: false, ...(addedAt ? { addedAt } : {}) });
const fin = (start: string, extra: Record<string, string> = {}) => ({ source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", end: "Ongoing", start, ...extra });
const seed = {
  // Ten days ago: the seed's own open role is not new this week, so a week of hires alone is tested.
  builtAt: ago(10),
  members: [
    { id: "m_sal", name: "Sal Seller", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal-hired" },
    { id: "m_mo", name: "Mo Marketer", email: "mo@example.com", title: "Fractional CMO", token: "tok-mo-hired" },
    { id: "m_ola", name: "Ola Other", email: "ola@example.com", title: "Fractional COO", token: "tok-ola-hired" },
  ],
  companies: [
    { id: "c_alpha", fields: { name: "Alpha Robotics", website: "alpha.example", hq: "Austin, TX", industry: "SaaS" } },
    { id: "c_beta", fields: { name: "Beta Labs", website: "beta.example", hq: "Denver, CO" } },
    { id: "c_gamma", fields: { name: "Gamma Health", website: "gamma.example", hq: "Boston, MA" } },
    { id: "c_hidden", fields: { name: HIDDEN_NAME, website: "hiddenfreight.example", hq: "Chicago, IL" } },
    { id: "c_delta", fields: { name: "Delta Data", website: "delta.example", hq: "Seattle, WA" } },
    { id: "c_eps", fields: { name: "Epsilon Works", website: "epsilon.example", hq: "London, UK" } },
    { id: "c_zeta", fields: { name: "Zeta Foods", website: "zeta.example", hq: "Miami, FL" } },
    { id: "c_five", fields: { name: "Five Pine", website: "fivepine.example", hq: "Portland, OR" } },
    // Seats below Lead, all new this week and in the profile: never "a fractional leader" (see the counts below, which they'd raise).
    { id: "c_juniper", fields: { name: "Juniper Content", website: "juniper.example", hq: "Austin, TX" } },
    { id: "c_kestrel", fields: { name: "Kestrel Ledger", website: "kestrel.example", hq: "Austin, TX" } },
    { id: "c_larch", fields: { name: "Larch Books", website: "larch.example", hq: "Denver, CO" } },
  ],
  engagements: [
    // Hired a while ago: on the table before this week (no addedAt), so never new.
    seat("e_old", "c_alpha", fin(ym(2))),
    // Full-time: never a hire, however new.
    seat("e_ft", "c_alpha", fin(ym(1), { type: "Full-time", role: "CFO" }), ago(1)),
    // New this week (seat-scan seats came in two days ago).
    seat("e_beta", "c_beta", fin(ym(1)), ago(2)),
    // New, with a seat holder on file: the role is locked with them, and the holder is never named in an email or a post.
    seat("e_gamma", "c_gamma", { source: "Member success story", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: ym(3), operator: HOLDER }, ago(1)),
    // A company with an open role is locked: it is never named.
    seat("e_open", "c_hidden", { source: "Demand scan", function: "Marketing", role: "Fractional CMO", status: "Open role" }),
    seat("e_hidden", "c_hidden", fin(ym(2)), ago(3)),
    // New, but the company has a fractional in Sales already ("No fractional Sales yet" leaves it out).
    seat("e_delta", "c_delta", fin(ym(1)), ago(2)),
    seat("e_delta_sales", "c_delta", { source: "Seat scan", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Active", start: ym(8) }),
    // New, outside the profile (UK).
    seat("e_eps", "c_eps", fin(ym(1)), ago(2)),
    // New, but it started nine months ago: outside a 6-month window.
    seat("e_zeta", "c_zeta", fin(ym(9)), ago(2)),
    // Below Lead (Recently hired counts leadership seats only): a Content Engineer in Marketing, nobody named, its title free to see.
    seat("e_juniper", "c_juniper", { source: "Seat scan", function: "Marketing", role: "Fractional Content Engineer", type: "Fractional", status: "Active", end: "Ongoing", start: ym(1) }, ago(1)),
    // A Finance Manager whose holder is on file: its role is locked with them, so only the server knows the title.
    seat("e_kestrel", "c_kestrel", { source: "Member success story", function: "Finance", role: JUNIOR_TITLE, type: "Fractional", status: "Active", start: ym(1), operator: JUNIOR_HOLDER }, ago(1)),
    // A Finance Manager with a start that is only this year (its December): a year alone reads as usual, and the seat still doesn't count.
    seat("e_larch", "c_larch", { source: "Seat scan", function: "Finance", role: "Finance Manager", type: "Fractional", status: "Active", end: "Ongoing", start: String(now.getFullYear()) }, ago(2)),
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const PROFILE_US = { industries: [], employees: [], revenue: [], countries: ["United States"] };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    // Sal unlocked every company here but the one with an open role, under the old rules (every company is
    // locked for a member until they unlock it or know it). That one stays locked for everyone, and is never named.
    unlocks: Object.fromEntries(
      ["c_alpha", "c_beta", "c_gamma", "c_delta", "c_eps", "c_zeta", "c_five", "c_juniper", "c_kestrel", "c_larch"].flatMap((id) => [[`${id}.identity`, ["m_sal"]]]),
    ),
    // A seat a member added yesterday: new this week too.
    engagements: [{ id: "e_mem", companyId: "c_five", by: "m_ola", at: ago(1) }],
    values: {
      "e_mem.function": { value: "Finance", by: "m_ola", at: ago(1), status: "live" },
      "e_mem.start": { value: ym(1), by: "m_ola", at: ago(1), status: "live" },
      "e_mem.type": { value: "Fractional", by: "m_ola", at: ago(1), status: "live" },
    },
    seen: { m_sal: ago(1), m_mo: ago(1), m_ola: ago(1) },
    profiles: {
      m_sal: { function: "Sales", title: "Fractional VP Sales", onboarded: true, icp: PROFILE_US },
      m_mo: { function: "Marketing", title: "Fractional CMO", onboarded: true },
      m_ola: { function: "Operations", title: "Fractional COO", onboarded: true },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-hired@example.com",
  RN_PUBLIC_URL: BASE,
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT"]) delete process.env[k];

/* ---------- the network, replaced ---------- */

const outbox: { url: string; body: Record<string, unknown> }[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(String(init?.body ?? "{}"));
  } catch {}
  outbox.push({ url: String(input), body });
  return new Response("ok", { status: 200 });
}) as typeof fetch;
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

async function main() {
  const H = await import("../lib/hired");
  const M = await import("../app/post/model");
  const F = await import("../lib/tableFields");
  const A = await import("../lib/mcp/alerts");
  const hunt = await import("../lib/hunt");
  type Cell = import("../lib/tableTypes").Cell;
  type EngagementRec = import("../lib/tableTypes").EngagementRec;
  type CompanyRec = import("../lib/tableTypes").CompanyRec;
  type Me = import("../lib/tableTypes").Me;

  /* ---------- the rules (lib/hired.ts) ---------- */
  console.log("The rules");
  check("a month start stays", H.hireMonth("2025-03") === "2025-03" && H.hireMonth("2025-3") === "2025-03");
  check("a year alone counts as its December", H.hireMonth("2025") === "2025-12");
  check("anything else is no start", [null, undefined, "", "soon", "2025-13", "25-03"].every((x) => H.hireMonth(x as string) === null));
  const nov = new Date(2026, 10, 18);
  check("months ago: this month 0, May is 6 in November, a later month below 0", H.monthsAgo("2026-11", nov) === 0 && H.monthsAgo("2026-05", nov) === 6 && H.monthsAgo("2026-12", nov) === -1);
  check("in the last 6 months in November: May counts, April doesn't", H.inWindow("2026-05", 6, nov) && !H.inWindow("2026-04", 6, nov));
  check("a later month counts", H.inWindow("2026-12", 3, nov));
  check("a year alone: 2025 is Dec 2025, in the last 12 months and not the last 6", H.inWindow("2025", 12, nov) && !H.inWindow("2025", 6, nov));
  check("this year alone counts in the last 3 months (December)", H.inWindow("2026", 3, nov));
  check("any time counts a hire with no start; a window doesn't", H.inWindow(null, 0, nov) && !H.inWindow(null, 6, nov) && !H.inWindow("", 24, nov));
  check("a window from a link: whole months from 0 to 240", H.cleanWindow("6") === 6 && H.cleanWindow(6.4) === 6 && H.cleanWindow(-2) === 0 && H.cleanWindow(9999) === 240 && H.cleanWindow("x") === 0 && H.cleanWindow(undefined) === 0);
  check("the windows offered", JSON.stringify(H.HIRED_WINDOWS) === "[3,6,12,24,0]");
  check("who was hired, from a role the member can see", H.hireWhat("Fractional CFO", "Finance") === "a fractional CFO" && H.hireWhat("CFO", "Finance") === "a fractional CFO");
  check("a role that names its own kind of work keeps it", H.hireWhat("Interim CFO", "Finance") === "an interim CFO" && H.hireWhat("Part-time Controller", null) === "a part-time Controller");
  check("no role: the function", H.hireWhat(null, "Finance") === "a fractional Finance leader" && H.hireWhat("Fractional", "Finance") === "a fractional Finance leader");
  check("a catch-all function reads as a fractional leader", H.hireWhat(null, "Other") === "a fractional leader" && H.hireWhat(null, "Executive") === "a fractional leader" && H.hireWhat(null, null) === "a fractional leader");
  check(
    "the email's line, as the owner wrote it",
    H.hiresLine(2, ["Finance"], true) === "2 companies in your profile hired a fractional Finance leader this week" &&
      H.hiresLine(1, [], false) === "1 company hired a fractional leader this week" &&
      H.hiresLine(3, ["Finance", "Operations"], false) === "3 companies hired a fractional Finance or Operations leader this week",
  );
  check("a start in words", H.startWords("2026-03") === "Mar 2026" && H.startWords("2025") === "2025" && H.startWords("x") === "");
  check("a view follows hires with a function or a window", H.followsHires({ hiredFn: ["Finance"] }) && H.followsHires({ hiredWithin: 6 }) && !H.followsHires({ hiredFn: [], hiredWithin: 0 }) && !H.followsHires({}));
  // Leadership seats only (lib/seniority.ts): the title the server reads.
  const S = await import("../lib/seniority");
  check("below Lead: a Manager or Staff title", S.isBelowLead("Fractional Finance Manager") && S.isBelowLead("Fractional Content Engineer") && S.isBelowLead("Marketing Coordinator") && S.isBelowLead("Assistant Director of Finance"));
  check("a leadership title isn't: C-level, VP, Head, Director, Lead", ["Fractional CFO", "Interim Chief Revenue Officer", "Fractional VP Finance", "Head of Finance", "Fractional Finance Director", "Fractional Marketing Lead", "Senior Finance Manager"].every((x) => !S.isBelowLead(x)));
  check("nor a title that shows no level, or none at all", !S.isBelowLead("Fractional Consultant") && !S.isBelowLead("Independent Consultant") && !S.isBelowLead("") && !S.isBelowLead(null) && !S.isBelowLead(undefined));

  /* ---------- the filter on the client model ---------- */
  console.log("\nThe filter");
  const val = (v: string, extra: Partial<Extract<Cell, { s: "value" }>> = {}): Cell => ({ s: "value", v, ver: 0, ...extra });
  const EMPTY: Cell = { s: "empty" };
  const LOCKED: Cell = { s: "locked", ver: 0 };
  let n = 0;
  const eng = (cells: Record<string, Cell>, extra: Partial<EngagementRec> = {}): EngagementRec => {
    const all: Record<string, Cell> = {};
    for (const f of F.GROUPS.find((g) => g.entity === "engagement")!.fields) if (!f.system) all[f.key] = EMPTY;
    return { id: `e${++n}`, source: "Seat scan", verified: false, cells: { ...all, ...cells }, people: [], updatedAt: null, yours: false, ...extra };
  };
  const hire = (fn: string, start: string | null, extra: Record<string, Cell> = {}) =>
    eng({ function: val(fn), type: val("Fractional"), status: val("Active"), role: val(`Fractional ${fn} lead`), ...(start ? { start: val(start) } : {}), ...extra });
  const co = (name: string, engagements: EngagementRec[], extra: Partial<CompanyRec> = {}): CompanyRec => ({
    id: `c${++n}`,
    name,
    iconDomain: null,
    cells: { website: EMPTY, industry: EMPTY, employees: EMPTY, revenue: EMPTY, hq: EMPTY, linkedin: EMPTY, about: EMPTY },
    friendly: { score: 30, tier: "Medium", fractional: engagements.length, open: 0, functions: [...new Set(engagements.map((e) => (e.cells.function?.s === "value" ? e.cells.function.v : "")).filter(Boolean))], operators: 0, recent: 0 },
    engagements,
    people: [],
    following: false,
    facts: { known: 0, locked: 0, missing: 0 },
    updatedAt: null,
    mine: false,
    ...extra,
  });
  const yearOnly = String(now.getFullYear()); // this year's December: inside any window
  const twoYearsBack = String(now.getFullYear() - 2); // December two years back: 13 to 24 months ago
  const A1 = co("A Two Months", [hire("Finance", ym(2))]);
  const B1 = co("B Full-time", [hire("Finance", ym(1), { type: val("Full-time") })]);
  const C1 = co("C Open Role", [eng({ function: val("Finance"), status: val("Open role", { system: true }), role: val("Fractional CFO") }, { source: "Demand scan", opened: ym(0) + "-02", closed: null })]);
  const D1 = co("D This Year", [hire("Finance", yearOnly)]);
  const E1 = co("E Two Years Back", [hire("Finance", twoYearsBack)]);
  const F1 = co("F Sales Shop", [hire("Marketing", ym(1)), hire("Sales", ym(4))]);
  const G1 = co("G Blank Type", [hire("Finance", ym(5), { type: EMPTY })]);
  const H1 = co("H Interim", [hire("Finance", ym(10), { type: val("Interim") })]);
  const I1 = co("I Posting Closed", [eng({ function: val("Finance"), status: val("Closed", { system: true }) }, { source: "Demand scan", opened: "2026-01-02", closed: "2026-02-03" })]);
  const J1 = co("J No Start", [hire("Finance", null)]);
  const K1 = co("K Locked", [eng({ function: val("Sales"), status: val("Open role", { system: true }), role: val("Fractional VP Sales") }, { source: "Demand scan", opened: ym(0) + "-02", closed: null }), hire("Finance", ym(2), { role: LOCKED, operator: LOCKED })], { hidden: true, name: F.HIDDEN_COMPANY });
  const L1 = co("L Marketing Later", [hire("Finance", ym(1)), hire("Marketing", ym(0))]);
  const all = [A1, B1, C1, D1, E1, F1, G1, H1, I1, J1, K1, L1];
  const infos = M.deriveAll(all);
  const me = { function: "Sales", goal: null, icp: null } as unknown as Me;
  const f = (x: Partial<import("../app/post/model").Filters>) => ({ ...M.EMPTY_FILTERS, ...x });
  // Each fixture by its letter (a locked company's name is "Locked company" on the wire).
  const letter = new Map(all.map((c, k) => [c.id, "ABCDEFGHIJKL"[k]]));
  const names = (type: "companies" | "engagements" | "people", x: Partial<import("../app/post/model").Filters>, who: Me = me) =>
    M.applyFilters(M.rowsFor(type, infos), f(x), "all", "", who, true)
      .rows.map((r) => letter.get(r.i.c.id))
      .sort()
      .join(",");
  check("in the last 3 months: two months back, this year alone (December), a later month", names("companies", { hiredFn: ["Finance"], hiredWithin: 3 }) === "A,D,K,L", names("companies", { hiredFn: ["Finance"], hiredWithin: 3 }));
  check("in the last 6 months: and a blank type five months back", names("companies", { hiredFn: ["Finance"], hiredWithin: 6 }) === "A,D,G,K,L", names("companies", { hiredFn: ["Finance"], hiredWithin: 6 }));
  check("in the last 12 months: and an interim seat ten months back", names("companies", { hiredFn: ["Finance"], hiredWithin: 12 }) === "A,D,G,H,K,L");
  check("in the last 24 months: and a year alone two years back (its December)", names("companies", { hiredFn: ["Finance"], hiredWithin: 24 }) === "A,D,E,G,H,K,L");
  check(
    "any time: every hire, one with no start too. Never a full-time seat, an open role or a posting that came down",
    names("companies", { hiredFn: ["Finance"], hiredWithin: 0 }) === "A,D,E,G,H,J,K,L",
    names("companies", { hiredFn: ["Finance"], hiredWithin: 0 }),
  );
  check("a window alone: a hire in any function", names("companies", { hiredWithin: 3 }) === "A,D,F,K,L", names("companies", { hiredWithin: 3 }));
  check("several functions: any of them", names("companies", { hiredFn: ["Finance", "Marketing"], hiredWithin: 3 }) === "A,D,F,K,L");
  check("a company that is locked can match (its hires are free facts)", names("companies", { hiredFn: ["Finance"], hiredWithin: 3 }).includes("K"));
  check("with No fractional Sales yet: a company with a Sales hire or a Sales open role is left out", names("companies", { hiredFn: ["Finance", "Marketing"], hiredWithin: 3, notMine: true }) === "A,D,L", names("companies", { hiredFn: ["Finance", "Marketing"], hiredWithin: 3, notMine: true }));
  const seatRows = M.applyFilters(M.rowsFor("engagements", infos), f({ hiredFn: ["Finance"], hiredWithin: 6 }), "all", "", me, true).rows;
  check(
    "the seats list: the hire seats themselves, not the other seats at those companies",
    seatRows.length === 5 && seatRows.every((r) => r.e && M.isHire(r.e) && r.e.cells.function?.s === "value" && r.e.cells.function.v === "Finance"),
    seatRows.map((r) => r.e?.id),
  );
  const facets = M.applyFilters(M.rowsFor("companies", infos), f({ hiredFn: ["Finance"], hiredWithin: 6 }), "all", "", me).facets;
  check("counts per function, in the window picked (the functions lifted)", facets.hiredFn.Finance === 5 && facets.hiredFn.Marketing === 2 && facets.hiredFn.Sales === 1 && facets.hiredFn.Legal === 0, facets.hiredFn);
  check("counts per window, for the functions picked (the window lifted)", JSON.stringify(facets.hiredWithin) === JSON.stringify({ 0: 8, 3: 4, 6: 5, 12: 6, 24: 7 }), facets.hiredWithin);
  check("any function in the window picked", facets.hiredAny === 6, facets.hiredAny);
  const sorted = M.sortRows(M.applyFilters(M.rowsFor("companies", infos), f({ hiredFn: ["Finance"], hiredWithin: 0 }), "all", "", me, true).rows, "hired", false, "", { me, hire: { fns: ["Finance"], within: 0 } });
  const order = sorted.map((r) => letter.get(r.i.c.id)).join("");
  check("sorted by the most recent hire, a hire with no start last", order.startsWith("D") && order.endsWith("J") && order.indexOf("L") < order.indexOf("A") && order.indexOf("A") < order.indexOf("G") && order.indexOf("G") < order.indexOf("H") && order.indexOf("H") < order.indexOf("E"), order);
  check("Most recent hire is a sort on every list", ["companies", "engagements", "people"].every((t) => M.sortsFor(t as "companies").some((s) => s.key === "hired")));
  check("the filter is one active filter and one chip", M.activeCount(f({ hiredFn: ["Finance", "Sales"], hiredWithin: 6 })) === 1 && M.activeCount(f({ hiredWithin: 6 })) === 1 && M.activeCount(f({})) === 0);
  const chip = M.activeChips(f({ hiredFn: ["Finance"], hiredWithin: 6, notMine: true }));
  check("its chip reads as words and clears both keys", chip[0].label === "Hired a fractional Finance leader, last 6 months" && M.hiredOn(chip[0].clear(f({ hiredFn: ["Finance"], hiredWithin: 6 }))) === false, chip.map((c) => c.label));
  check("Clear all takes it off (the profile pill stays)", !M.hiredOn(M.clearedFilters(f({ hiredFn: ["Finance"], hiredWithin: 6, icp: true }))) && M.clearedFilters(f({ hiredFn: ["Finance"], icp: true })).icp === true);

  // The hire line: the role only when the member can see it.
  const seen = M.hireLine(hire("Finance", "2026-03", { role: val("Fractional CFO") }));
  const locked = M.hireLine(hire("Finance", "2026-03", { role: LOCKED, operator: LOCKED }));
  const reported = M.hireLine(hire("Finance", "2025", { role: { s: "reported", mine: false } }));
  check("the hire line names a role the member can see", seen.what === "Hired a fractional CFO" && seen.when === "Mar 2026", seen);
  check("a locked role never shows in the hire line: it names the function", locked.what === "Hired a fractional Finance leader" && !JSON.stringify(locked).includes("CFO"), locked);
  check("a role under review doesn't either, and a year alone stays a year", reported.what === "Hired a fractional Finance leader" && reported.when === "2025", reported);
  check("the row's hire is the most recent one that fits", M.hireOfRow({ key: L1.id, i: infos[11] }, ["Finance", "Marketing"], 3)?.cells.function?.s === "value" && (M.hireOfRow({ key: L1.id, i: infos[11] }, ["Finance", "Marketing"], 3)!.cells.function as { v: string }).v === "Marketing");

  // The function Recently hired opens on.
  check("the member's own answer comes first (onboarding's before), never their function", M.suggestHiredFn(infos, "Sales", () => true, ["Sales", "Finance"]) === "Finance");
  check("else the function most companies hired lately (not theirs)", M.suggestHiredFn(infos, "Sales", () => true) === "Finance" && M.suggestHiredFn(infos, "Finance", () => true) === "Marketing");
  check("with nothing on file, a sensible default", M.suggestHiredFn([], "Sales") === "Marketing" && M.suggestHiredFn([], "Marketing") === "Sales");

  /* ---------- leadership seats only (EngagementRec.belowLead) ---------- */
  console.log("\nLeadership seats only");
  // A seat whose title reads below Lead, as the server marks it. The flag decides, whether or not the member sees the title.
  const junior = (fn: string, start: string | null, role: Cell, extra: Record<string, Cell> = {}) =>
    eng({ function: val(fn), type: val("Fractional"), status: val("Active"), role, ...(start ? { start: val(start) } : {}), ...extra }, { belowLead: true });
  const LA = co("LA CFO", [hire("Finance", ym(1), { role: val("Fractional CFO") })]);
  const LB = co("LB Finance Manager", [junior("Finance", ym(1), val("Fractional Finance Manager"))]);
  const LC = co("LC Content Engineer", [junior("Marketing", ym(1), val("Fractional Content Engineer"))]);
  const LD = co("LD Locked Junior", [junior("Finance", ym(1), LOCKED, { operator: LOCKED })]);
  const LE = co("LE Junior This Year", [junior("Finance", yearOnly, val("Finance Manager"))]);
  const LF = co("LF Leader This Year", [hire("Finance", yearOnly, { role: val("Fractional CFO") })]);
  const LG = co("LG Both", [junior("Finance", ym(0), val("Fractional Finance Manager")), hire("Finance", ym(2), { role: val("Fractional VP Finance") })]);
  const lead = [LA, LB, LC, LD, LE, LF, LG];
  const leadInfos = M.deriveAll(lead);
  const tag = new Map(lead.map((c) => [c.id, c.name.split(" ")[0]]));
  const leaders = (type: "companies" | "engagements", x: Partial<import("../app/post/model").Filters>) =>
    M.applyFilters(M.rowsFor(type, leadInfos), f(x), "all", "", me, true).rows;
  const tags = (rows: import("../app/post/model").Row[]) => rows.map((r) => tag.get(r.i.c.id)).sort().join(",");
  check("a Finance Manager seat and a Content Engineer seat don't match, a CFO does", tags(leaders("companies", { hiredFn: ["Finance"], hiredWithin: 3 })) === "LA,LF,LG" && tags(leaders("companies", { hiredFn: ["Marketing"], hiredWithin: 3 })) === "", tags(leaders("companies", { hiredFn: ["Finance"], hiredWithin: 3 })));
  check("a junior seat whose role is locked doesn't match either: the server's flag decides, not what the member can see", !tags(leaders("companies", { hiredFn: ["Finance"], hiredWithin: 0 })).includes("LD"));
  check("year-only starts still work: this year's CFO counts as December, this year's Finance Manager doesn't count", tags(leaders("companies", { hiredFn: ["Finance"], hiredWithin: 3 })).includes("LF") && !tags(leaders("companies", { hiredFn: ["Finance"], hiredWithin: 24 })).includes("LE"));
  check("a window alone (any function) counts leadership seats only", tags(leaders("companies", { hiredWithin: 3 })) === "LA,LF,LG", tags(leaders("companies", { hiredWithin: 3 })));
  const leadSeats = leaders("engagements", { hiredFn: ["Finance"], hiredWithin: 0 });
  check("the seats list shows leadership seats only", leadSeats.length === 3 && leadSeats.every((r) => !!r.e && !r.e.belowLead), leadSeats.map((r) => r.e?.id));
  const lfac = M.applyFilters(M.rowsFor("companies", leadInfos), f({ hiredFn: ["Finance"], hiredWithin: 3 }), "all", "", me).facets;
  check("the counts leave junior seats out", lfac.hiredFn.Finance === 3 && lfac.hiredFn.Marketing === 0 && lfac.hiredAny === 3 && lfac.hiredWithin[0] === 3 && lfac.hiredWithin[3] === 3, { fn: lfac.hiredFn, any: lfac.hiredAny, within: lfac.hiredWithin });
  const lgHire = M.hireOfRow({ key: LG.id, i: leadInfos[6] }, ["Finance"], 3);
  check(
    "at a company with both, the hire is the leader's: the VP Finance two months back, not last month's Finance Manager",
    !!lgHire && !lgHire.belowLead && M.hireLine(lgHire).what === "Hired a fractional VP Finance" && M.hireLine(lgHire).when === H.startWords(ym(2)),
    lgHire && M.hireLine(lgHire),
  );
  const leadOrder = M.sortRows(leaders("companies", { hiredFn: ["Finance"], hiredWithin: 0 }), "hired", false, "", { me, hire: { fns: ["Finance"], within: 0 } }).map((r) => tag.get(r.i.c.id)).join(",");
  check("sorted by the most recent leadership hire: a junior seat never moves a company up", leadOrder === "LF,LA,LG", leadOrder);
  const mkJuniors = [LC, co("LH Coordinator", [junior("Marketing", ym(1), val("Marketing Coordinator"))]), co("LI Manager", [junior("Marketing", ym(2), val("Fractional Marketing Manager"))])];
  check("the function Recently hired opens on counts leadership hires only", M.suggestHiredFn(M.deriveAll([LA, ...mkJuniors]), "Sales") === "Finance", M.suggestHiredFn(M.deriveAll([LA, ...mkJuniors]), "Sales"));
  check(
    "isHire stays as it is: a junior seat is still a hire for Functions hired",
    M.isHire(LB.engagements[0]) && !M.isLeaderHire(LB.engagements[0]) && leadInfos[1].fnState.hired.includes("Finance") && M.isLeaderHire(LA.engagements[0]),
  );

  /* ---------- the address and saved views ---------- */
  console.log("\nThe address and saved views");
  const owner = f({ hiredFn: ["Finance"], hiredWithin: 6, notMine: true, icp: true });
  check("the filters in the address, the spec's own form", M.encodeFilters(owner) === "hiredFn:Finance~hiredWithin:6~notMine~icp", M.encodeFilters(owner));
  const back = M.decodeFilters("hiredFn:Finance~hiredWithin:6~notMine~icp");
  check("and back, the same filters", JSON.stringify(back) === JSON.stringify(owner), back);
  check("several functions round-trip", JSON.stringify(M.decodeFilters(M.encodeFilters(f({ hiredFn: ["Finance", "People"], hiredWithin: 12 })))) === JSON.stringify(f({ hiredFn: ["Finance", "People"], hiredWithin: 12 })));
  check("a link with a function not on the list, or an odd window, reads safely", JSON.stringify(M.decodeFilters("hiredFn:Finance|Nope~hiredWithin:999").hiredFn) === '["Finance"]' && M.decodeFilters("hiredWithin:999").hiredWithin === 240 && M.decodeFilters("hiredWithin:-4").hiredWithin === 0 && M.decodeFilters("hiredWithin:abc").hiredWithin === 0);
  const deep = M.placeFilters("v=all&t=companies&f=hiredFn:Finance~hiredWithin:6~notMine~icp");
  check("the deep link for the owner's case opens Recently hired on companies", deep.v === "all" && deep.t === "companies" && JSON.stringify(deep.f) === JSON.stringify(owner), deep);
  const place = M.absolutePlace({ t: "companies", v: "all", s: null, f: owner, q: "" });
  check("a saved view's place keeps it all", JSON.stringify(M.placeFilters(place).f) === JSON.stringify(owner) && M.placeFilters(place).v === "all" && M.placeFilters(place).t === "companies", place);
  const crit = M.criteriaOf(M.withIcpSpelled(owner, null), null);
  check("the criteria follow hires", JSON.stringify(crit.hiredFn) === '["Finance"]' && crit.hiredWithin === 6, crit);
  check("a view that doesn't follow hires has no hire criteria", !("hiredFn" in M.criteriaOf(f({ industry: ["SaaS"] }), null)));
  const saved = hunt.savedViewAction([], { op: "save", name: "", place, criteria: crit, email: true }, () => "al_test", ago(0));
  const out = hunt.savedViewsOut(saved.list)[0];
  check("saving keeps the place and the hire criteria, and names it from them", out.place === place && JSON.stringify(out.criteria.hiredFn) === '["Finance"]' && out.criteria.hiredWithin === 6 && /^Companies that hired a fractional Finance leader in the last 6 months/.test(out.name), out);
  const reopened = M.placeFilters(out.place!);
  const rowsNow = M.applyFilters(M.rowsFor("companies", infos), owner, "all", "", me, true).rows.map((r) => r.key).join();
  const rowsAgain = M.applyFilters(M.rowsFor("companies", infos), reopened.f, reopened.v ?? "all", reopened.q, me, true).rows.map((r) => r.key).join();
  check("a saved view reopens with the same rows", rowsNow === rowsAgain && rowsNow.length > 0, { rowsNow, rowsAgain });
  check("unknown hire functions are refused when saving", (() => {
    try {
      hunt.savedViewAction([], { op: "save", name: "x", place, criteria: { hiredFn: ["Nope"] } }, () => "al_x", ago(0));
      return false;
    } catch (e) {
      return e instanceof hunt.HuntError;
    }
  })());
  const vn = M.viewName(owner, "all", "companies", null, "Sales");
  check("a view that follows hires is named by its sentence, the hire first", vn === "Hired a fractional Finance leader in the last 6 months, in my profile, no fractional Sales yet", vn);
  const long = M.viewName(f({ hiredFn: ["Customer Success", "Product Marketing", "Partnerships"], hiredWithin: 24, notMine: true, icp: true, industry: ["SaaS", "Fintech"], revenue: ["$5M–$20M"] }), "all", "companies", null, "Customer Success");
  check("a long name stops at a whole part, under 100 characters", long.length <= 100 && !/,\s*$/.test(long) && long.startsWith("Hired a fractional Customer Success, Product Marketing or Partnerships leader"), long);
  check("a view of open roles is named as before", M.viewName(f({ notMine: true }), "all", "companies", null, "Marketing") === "Companies, no fractional Marketing yet");
  check("a view that follows hires never matches an open role", !A.alertMatches({ id: "x", name: "x", createdAt: "", hiredFn: ["Finance"], hiredWithin: 6 }, { function: "Finance", industry: null, employees: null, revenue: null, hq: null, pastHires: 1 }));
  check("the connector's criteria take hire keys too", JSON.stringify(A.cleanCriteria({ hiredFn: ["finance"], hiredWithin: 6 }).criteria) === JSON.stringify({ hiredFn: ["Finance"], hiredWithin: 6 }) && A.cleanCriteria({ hiredFn: ["Nope"] }).problems.length === 1);

  /* ---------- the server: the weekly email ---------- */
  console.log("\nThe weekly email");
  const t = await import("../lib/table");
  const digest = await import("../lib/digest");
  const SAL = "tok-sal-hired";
  const MO = "tok-mo-hired";
  // Sal saves the owner's view the way the app does: its place and its criteria.
  const salPlace = M.absolutePlace({ t: "companies", v: "all", s: null, f: owner, q: "" });
  const r1 = await t.perform(SAL, { type: "savedView", op: "save", name: M.viewName(owner, "all", "companies", null, "Sales"), place: salPlace, criteria: M.criteriaOf(M.withIcpSpelled(owner, PROFILE_US), null), email: true }, BASE);
  check("the app saves a view that follows hires", /^Saved/.test(r1.message), r1.message);
  // Mo follows Finance hires too, with the weekly email off for it.
  const moPlace = M.absolutePlace({ t: "companies", v: "all", s: null, f: f({ hiredFn: ["Finance"], hiredWithin: 6 }), q: "" });
  await t.perform(MO, { type: "savedView", op: "save", name: "Finance hires", place: moPlace, criteria: { hiredFn: ["Finance"], hiredWithin: 6 }, email: false }, BASE);
  // The view as the table lists it, for comparing with the email.
  const salView = await t.buildView(SAL);
  const salRows = M.applyFilters(M.rowsFor("companies", M.deriveAll(salView.companies)), owner, "all", "", salView.me!, true).rows;
  check("the table lists the view's companies (old hires included)", salRows.length === 5, salRows.map((r) => r.i.c.hidden ? "(locked)" : r.i.c.name));
  // Leadership seats only, decided on the server from the stored title (seen or not).
  const seatAt = (name: string) => salView.companies.find((c) => c.name === name)?.engagements[0];
  const kes = seatAt("Kestrel Ledger");
  check("the server marks a seat whose stored title reads below Lead, with a flag and nothing more", kes?.belowLead === true && kes.cells.role?.s === "locked" && !("v" in (kes.cells.role ?? {})), kes && { belowLead: kes.belowLead, role: kes.cells.role });
  check("a Content Engineer and a year-only Finance Manager are marked too, a CFO isn't", seatAt("Juniper Content")?.belowLead === true && seatAt("Larch Books")?.belowLead === true && seatAt("Beta Labs")?.belowLead === undefined && seatAt("Gamma Health")?.belowLead === undefined);
  const wire = JSON.stringify(salView);
  check("nothing the member receives carries the locked title, or who held that seat", !wire.includes(JUNIOR_TITLE) && !wire.includes("Systems Manager") && !wire.includes(JUNIOR_HOLDER));
  const onTable = (x: Partial<import("../app/post/model").Filters>) =>
    M.applyFilters(M.rowsFor("companies", M.deriveAll(salView.companies)), f(x), "all", "", salView.me!, true).rows.map((r) => r.i.c.name);
  check(
    "on the table, Finance Manager seats don't match a fractional Finance leader, CFOs do (a year-only start too)",
    onTable({ hiredFn: ["Finance"], hiredWithin: 6 }).includes("Beta Labs") && onTable({ hiredFn: ["Finance"], hiredWithin: 6 }).includes("Gamma Health") && !onTable({ hiredFn: ["Finance"], hiredWithin: 0 }).some((n) => n === "Kestrel Ledger" || n === "Larch Books"),
    onTable({ hiredFn: ["Finance"], hiredWithin: 0 }),
  );
  check("a Content Engineer seat is no fractional Marketing leader", !onTable({ hiredFn: ["Marketing"], hiredWithin: 0 }).includes("Juniper Content") && !onTable({ hiredWithin: 6 }).includes("Juniper Content"));
  const kesInfo = M.deriveAll(salView.companies).find((x) => x.c.name === "Kestrel Ledger");
  check("they are still hires everywhere else: Functions hired and the fractional hires on file", !!kesInfo && kesInfo.fnState.hired.includes("Finance") && kesInfo.c.friendly.fractional >= 1, kesInfo && { hired: kesInfo.fnState.hired, fractional: kesInfo.c.friendly.fractional });
  process.env.RN_DIGEST_ALL = "1";
  const list = await t.digestList(new Date(NOW).toISOString(), BASE);
  delete process.env.RN_DIGEST_ALL;
  const sal = list.find((x) => x.memberId === "m_sal")?.data;
  check("a week with no new roles: only the member with new hires for a saved view gets an email", list.length === 1 && !!sal, list.map((x) => x.memberId));
  check("a view with its weekly email off is left out", !list.some((x) => x.memberId === "m_mo"));
  const h = sal?.hires?.[0];
  check("new means a matching seat added this week: four companies (not an old hire, a full-time seat, a company with Sales, one outside the profile or the window)", h?.n === 4, h);
  check("the line's facts: the view's functions and its profile", JSON.stringify(h?.functions) === '["Finance"]' && h?.inProfile === true);
  check("the button opens the saved view", h?.url === `${BASE}/?${salPlace}`, h?.url);
  check("each row links to its record over the view", !!h?.rows.length && h.rows.every((r) => r.url.startsWith(`${BASE}/?${salPlace}&c=`)), h?.rows.map((r) => r.url));
  check("the most recent hire first", JSON.stringify(h?.rows.map((r) => r.start)) === JSON.stringify([ym(1), ym(1), ym(2), ym(3)]), h?.rows.map((r) => r.start));
  check("a locked company is never named", !!h?.rows.some((r) => r.company === null) && !JSON.stringify(sal).includes(HIDDEN_NAME), h?.rows.map((r) => r.company));
  check("a member-added seat counts from when it was added", !!h?.rows.some((r) => r.company === "Five Pine"));
  check("the email data never names who held a seat", !JSON.stringify(sal).includes(HOLDER) && !JSON.stringify(sal).includes("Namedholder"));
  check(
    "new seats below Lead are never a fractional leader in the email, and a locked title never shows",
    !!h && !h.rows.some((r) => ["Kestrel Ledger", "Larch Books", "Juniper Content"].includes(r.company ?? "")) && !JSON.stringify(sal).includes(JUNIOR_TITLE) && !JSON.stringify(sal).includes(JUNIOR_HOLDER),
    h?.rows.map((r) => r.company),
  );
  const mail = digest.renderDigest(sal!);
  check("the subject is the owner's line", mail.subject === "4 companies in your profile hired a fractional Finance leader this week", mail.subject);
  check("the email lists the companies in free facts: the company, the function, the start month", mail.text.includes(`Beta Labs · Finance · ${H.startWords(ym(1))}`) && mail.text.includes(`${digest.LOCKED_HIRER} · Finance · ${H.startWords(ym(2))}`), mail.text);
  check("its one button opens the saved view", mail.html.includes("Open the saved view") && (mail.html.match(/bgcolor="#2EE59D"/g) ?? []).length === 1 && mail.html.includes(h!.url.replace(/&/g, "&amp;")));
  check("the rendered email never names a seat holder or a locked company", !(mail.text + mail.html).includes(HOLDER) && !(mail.text + mail.html).includes(HIDDEN_NAME));
  check("no ember dot: a hire is no live opening", !mail.html.includes("background:#FF5A1F"));
  // A week with new roles too: the hire line sits under the roles, with an outlined button to the view (the email keeps one filled button).
  const mixed = digest.renderDigest({ ...sal!, newRoles: 2, newRolesMine: 1, newRolesMineHidden: 1, byFunction: [{ function: "Sales", n: 1 }, { function: "Marketing", n: 1 }], rolesUrl: `${BASE}/?v=hiring`, roles: [] });
  check("with new roles, the roles lead and the hire line follows", mixed.subject === "1 new Sales role this week" && mixed.text.includes("4 companies in your profile hired a fractional Finance leader this week.") && (mixed.html.match(/bgcolor="#2EE59D"/g) ?? []).length === 1, mixed.text);
  check(
    "with new roles, the saved view still gets a button (outlined, after the roles' filled one)",
    /border:2px solid [^"]*"><a href="[^"]*"[^>]*>Open the saved view<\/a>/.test(mixed.html) && mixed.html.indexOf("Open the saved view") > mixed.html.indexOf('bgcolor="#2EE59D"') && mixed.html.includes(h!.url.replace(/&/g, "&amp;")),
  );

  /* ---------- the server: the weekly post in Slack ---------- */
  console.log("\nThe weekly post in Slack");
  const nmod = await import("../lib/notify");
  const url = await import("../lib/notify/url");
  url.setResolver(async () => ["93.184.216.34"]);
  const SLACK = "https://hooks.slack.com/services/" + "T0009TEST/B0009TEST/hiredhiredhiredhiredQRST";
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 15));
      await nmod.settled();
    }
  };
  await nmod.connect(SAL, "slack", SLACK);
  await settle();
  outbox.length = 0;
  await t.applyScan({ roles: [], sources: [{ source: "board", fetched: 3, matched: 0 }] });
  await settle();
  const posts = outbox.filter((o) => o.url === SLACK);
  const text = JSON.stringify(posts[0]?.body ?? {});
  check("a scan with no new roles still posts the week's new hires", posts.length === 1, posts.length);
  check("the post's headline is the owner's line", text.includes("4 companies in your profile hired a fractional Finance leader this week"), text.slice(0, 400));
  check("the post lists companies in free facts, a locked one unnamed", text.includes("Beta Labs") && text.includes("A locked company") && text.includes("Hired a fractional Finance leader"), text);
  // In Slack, a company a block: the name in bold (linked only when the member can see it), the hire, when it started.
  const hireBlocks = (posts[0]?.body.blocks ?? []) as { type: string; text?: { text: string }; fields?: { text: string }[] }[];
  const hireProblems = posts[0] ? (await import("./blockkit.mts")).blockKitProblems(posts[0].body as never) : ["no post"];
  check("the hires post is valid Block Kit", hireProblems.length === 0, hireProblems);
  const sections = hireBlocks.filter((b) => b.type === "section");
  const beta = sections.find((b) => /Beta Labs/.test(b.text?.text ?? ""));
  const lockedBlock = sections.find((b) => /A locked company/.test(b.text?.text ?? ""));
  check(
    "in Slack each company is its own block, the hire and its start as a field",
    hireBlocks[0]?.type === "header" && !!beta && /\*<https:[^|]+\|Beta Labs>\*/.test(beta.text!.text) && /Hired a fractional Finance leader/.test(beta.text!.text) && (beta.fields ?? []).some((f) => f.text.includes(H.startWords(ym(1)))),
    sections,
  );
  check("a locked company in Slack has no link and no picture", !!lockedBlock && !/<https?:/.test(lockedBlock.text!.text) && !("accessory" in lockedBlock), lockedBlock);
  check("the post opens the saved view", text.includes(`${BASE}/?${salPlace}`), text);
  check("the post never names a seat holder or a locked company", !text.includes(HOLDER) && !text.includes(HIDDEN_NAME));
  check("the post leaves seats below Lead out, and never carries a locked title", !text.includes("Kestrel Ledger") && !text.includes("Larch Books") && !text.includes("Juniper Content") && !text.includes(JUNIOR_TITLE) && !text.includes(JUNIOR_HOLDER));
  outbox.length = 0;
  skew += 16 * 60 * 1000;
  await t.applyScan({ roles: [], sources: [{ source: "board", fetched: 3, matched: 0 }] });
  await settle();
  check("a second scan in the week doesn't repeat them", !outbox.some((o) => o.url === SLACK), outbox.map((o) => o.url));
  skew = 0;

  /* ---------- the connector ---------- */
  console.log("\nThe connector");
  const tools = await import("../lib/mcp/tools");
  const ctx = { member: (await t.memberForToken(SAL))!, origin: BASE };
  const res = await tools.searchCompanies(ctx, { hired_function: "Finance", hired_within_months: 6 });
  const cos = res.companies as { name: string; recent_hire?: Record<string, string> }[];
  check("hired_function and hired_within_months: the table's rule (no profile here)", res.total === 7, { total: res.total, names: cos.map((c) => c.name) });
  check("the most recent hire first, each with its recent_hire", cos.every((c) => !!c.recent_hire?.start && c.recent_hire.function === "Finance") && cos[0].recent_hire!.start >= cos[cos.length - 1].recent_hire!.start, cos.map((c) => c.recent_hire));
  const gamma = cos.find((c) => c.name === "Gamma Health");
  check("a role locked with its seat holder says so, and never the holder", !!gamma && /locked/.test(gamma.recent_hire?.role ?? "") && !JSON.stringify(res).includes(HOLDER), gamma?.recent_hire);
  check("a locked company stays locked", !JSON.stringify(res).includes(HIDDEN_NAME));
  const res2 = await tools.searchCompanies(ctx, { hired_function: ["Finance", "Marketing"], hired_within_months: 6, no_function_yet: "Sales" });
  check("a list of functions, with no_function_yet", res2.total === 6, res2.total);
  const res3 = await tools.searchCompanies(ctx, { hired_within_months: 6 });
  check("a window alone: any function", res3.total === 7, res3.total);
  const juniors = ["Kestrel Ledger", "Larch Books", "Juniper Content"];
  check(
    "hired_function and hired_within_months count leadership seats only: no Finance Manager, no Content Engineer",
    !cos.some((c) => juniors.includes(c.name)) && !(res3.companies as { name: string }[]).some((c) => juniors.includes(c.name)),
    [cos.map((c) => c.name), (res3.companies as { name: string }[]).map((c) => c.name)],
  );
  const kesOut = await tools.getCompany(ctx, { company: "Kestrel Ledger" });
  check("nothing the connector sends carries the locked junior title or its holder", !JSON.stringify([res, res2, res3, kesOut]).includes(JUNIOR_TITLE) && !JSON.stringify(kesOut).includes(JUNIOR_HOLDER) && JSON.stringify(kesOut).includes("Kestrel Ledger"));
  const bad = await tools.searchCompanies(ctx, { hired_function: "Nope" }).then(() => null, (e) => e);
  const badN = await tools.searchCompanies(ctx, { hired_function: "Finance", hired_within_months: -3 }).then(() => null, (e) => e);
  check("an unknown function or a negative window is a clear problem", bad instanceof tools.ToolProblem && badN instanceof tools.ToolProblem && /hired_within_months/.test(badN.message));
  const desc = readFileSync(path.join(ROOT, "lib", "mcp", "server.ts"), "utf8");
  const sc = desc.slice(desc.indexOf('"search_companies"'), desc.indexOf('"get_company"'));
  check("search_companies says what the two params do", sc.includes("hired_function") && sc.includes("hired_within_months") && /December/.test(sc) && /recent_hire/.test(sc));
}

main()
  .catch((e) => {
    failures++;
    console.log(`FAIL threw: ${String(e?.stack ?? e)}`);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
