/**
 * Checks of the way around the app (app/post/navModel.ts, drawn by Sidebar.tsx and the tab bar)
 * and the counts it shows (app/post/place.ts placeRows, savedViewPlace, freshCount). No browser,
 * no server: lib/table.ts runs in process on a made-up seed in a temporary data dir, with fetch
 * replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-nav.mts      exits 1 on any failure
 *
 * Covered:
 *   - every page the app draws is one item, a real link whose address opens that page (the
 *     table's lists, Hiring now and Following open the table there), Home's is the bare path;
 *   - exactly one item is on for each place, and it is the right one (a saved view on screen
 *     wins over the list, Hiring now and Following over the record type);
 *   - Pilot metrics only for an admin, Plan and billing only while billing is live, Your network
 *     only with it on; nothing is listed twice; the tab bar's four are there and More has the rest;
 *   - the counts: Hiring now's and each saved view's matches are the rows the table lists there
 *     (placeRows is listAt's n), a saved search from Claude opens its open roles, "new since your
 *     last visit" counts companies once;
 *   - Home's search offers pages by name, never on two letters;
 *   - no copy names LinkedIn or Sales Navigator as a source.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-nav-"));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const FNS = ["Marketing", "Sales", "Finance", "RevOps"];
const companies = Array.from({ length: 40 }, (_, k) => ({
  id: `c_navt${String(k).padStart(2, "0")}`,
  fields: { name: `Navtest Co ${k}`, website: `navtest${k}.example`, industry: k % 2 ? "SaaS" : "Fintech", employees: k % 3 ? "51–200" : "11–50", revenue: "$1M–$5M", hq: "Austin, TX" },
}));
const engagements: unknown[] = [];
companies.forEach((c, k) => {
  engagements.push({ id: `e_navt${k}_a`, companyId: c.id, verified: false, fields: { source: "Seat scan", role: `Fractional ${FNS[k % 4]} Lead`, function: FNS[k % 4], type: "Fractional", start: monthAgo(2 + (k % 8)), status: "Active", end: "Ongoing" } });
  if (k % 3 === 0) engagements.push({ id: `e_navt${k}_open`, companyId: c.id, verified: false, fields: { source: "Demand scan", role: "Fractional VP Sales", function: "Sales", status: "Open role", posting: `https://navtest${k}.example/jobs` } });
  if (k % 7 === 0) engagements.push({ id: `e_navt${k}_mo`, companyId: c.id, verified: false, fields: { source: "Demand scan", role: "Fractional CMO", function: "Marketing", status: "Open role", posting: `https://navtest${k}.example/cmo` } });
});
const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Navtest", email: "sal.nav@example.com", title: "Fractional VP Sales", token: "tok-sal-nav" },
    { id: "mem_ned", name: "Ned Navtest", email: "ned.nav@example.com", title: "Fractional VP Sales", token: "tok-ned-nav" },
  ],
  companies,
  engagements,
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(HOUR)])),
    profiles: {
      mem_sal: { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: ["United States"] } },
      mem_ned: { function: "Sales", onboarded: true },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_ADMIN_EMAILS"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

async function main() {
  const t = await import("../lib/table");
  const nm = await import("../app/post/navModel");
  const { deriveAll, EMPTY_FILTERS } = await import("../app/post/model");
  const { listAt, parsePlace, placeRows, savedViewPlace, freshCount, isHome } = await import("../app/post/place");
  type NavInput = Parameters<typeof nm.navItems>[0];
  const trial = { name: "trial", trialEndsAt: ago(-9 * DAY), trialDaysLeft: 9, trialExtended: false, hadTrial: true, ending: false, proUntil: null, interval: null, cancelAt: null, pause: null, pausedFrom: null, pausedUntil: null, subscribed: false, portal: false, firstChargeAt: null, proStartsAt: null, topup: false } as unknown as NonNullable<NavInput["plan"]>;

  /** The input TradingPost builds, with the addresses it writes (?p=<page>, the table's lists by their own query). */
  const input = (x: Partial<NavInput> = {}): NavInput => ({
    page: "today",
    recordType: "companies",
    tab: "all",
    currentView: null,
    hrefs: {
      today: "/",
      companies: "/?p=table",
      engagements: "/?t=seats",
      people: "/?t=people",
      hiring: "/?v=hiring&t=seats",
      following: "/?v=following",
      page: (p) => (p === "today" ? "/" : `/?p=${p}`),
    },
    admin: false,
    network: false,
    unread: 2,
    radarNew: 3,
    totals: { companies: 40, engagements: 60, people: 0 },
    hiringN: 14,
    followingN: 0,
    seatsMissing: 0,
    credits: 25,
    views: [
      { id: "v1", name: "Open Sales roles", href: "/?v=hiring&t=seats", fresh: 2 },
      { id: "v2", name: "SaaS", href: "/?f=industry%3ASaaS", fresh: 0 },
    ],
    inviteBonus: 10,
    ...x,
  });

  // Every page is one item, and its link opens it.
  const all = nm.navItems(input({ admin: true, plan: trial, network: true, networkN: 4 }));
  const pagesOf = new Set(all.map((it) => it.page));
  // Referral partners' old page ("partners") is Fractionals now: its address opens Fractionals, and no item of its own.
  const missing = nm.APP_PAGES.filter((p) => p !== "partners" && !pagesOf.has(p));
  check("every page the app draws is in the sidebar (an admin, billing and Your network on)", missing.length === 0, missing);
  check("Referral partners has no item: Fractionals replaces it", !all.some((it) => it.key === "partners" || it.page === "partners") && all.find((it) => it.key === "fractionals")?.group === "community");
  const me = (await t.buildView("tok-sal-nav")).me!;
  const wrong = all
    .filter((it) => it.href)
    .filter((it) => {
      const search = it.href!.split("?")[1] ?? "";
      if (it.page === "today") return !isHome(search);
      const p = parsePlace(me, search, new Set());
      return it.page === "table" ? p.p !== null || p.home : p.p !== it.page;
    })
    .map((it) => it.key);
  check("each link's address opens its page (Home is the bare path, the lists the table)", wrong.length === 0, wrong);
  check("Add what you know and Invite a fractional are buttons (they open a sheet)", ["add", "invite"].every((k) => all.find((it) => it.key === k && !it.href)));
  const keys = all.map((it) => it.key);
  check("nothing is listed twice", new Set(keys).size === keys.length, keys);
  // Your pipeline sits under Yours, first after the saved views: Your pipeline, Following, Your seats.
  // Notifications (every email and Slack post, and how often) sits in the foot after Integrations: one place for the
  // switches that were on Your credits, Your profile and Integrations.
  check("in the order Home, Find, Community, Yours, Earn, then the foot", keys.join(",") === "today,companies,engagements,people,radar,hiring,fractionals,messages,view:v1,view:v2,pipeline,following,seats,network,add,rates,invite,integrations,notifications,billing,credits,metrics", keys);
  const ntItem = all.find((it) => it.key === "notifications");
  check("Notifications is in the foot, and its link opens it", ntItem?.group === "foot" && ntItem.page === "notifications" && parsePlace(me, (ntItem.href ?? "").split("?")[1] ?? "", new Set()).p === "notifications", ntItem);
  check("'notifications' finds it from Home's search", nm.navMatches("notifications", all).some((it) => it.key === "notifications"));
  check("People reads Decision makers", all.find((it) => it.key === "people")?.label === "Decision makers");
  check("each saved view by name, with its new matches", all.find((it) => it.key === "view:v1")?.label === "Open Sales roles" && all.find((it) => it.key === "view:v1")?.badge === 2);
  check("counts: the lists, Hiring now, unread, Crystal Ball's new, credits", all.find((it) => it.key === "companies")?.count === 40 && all.find((it) => it.key === "hiring")?.count === 14 && all.find((it) => it.key === "messages")?.badge === 2 && all.find((it) => it.key === "radar")?.badge === 3 && all.find((it) => it.key === "credits")?.count === 25);
  check("no count drawn before the whole table is here", nm.navItems(input({ totals: null, hiringN: null })).filter((it) => ["companies", "engagements", "people", "hiring"].includes(it.key)).every((it) => it.count === null));

  // Admin-only and live-only items.
  const member = nm.navItems(input());
  check("a member gets no Pilot metrics", !member.some((it) => it.key === "metrics" || it.admin));
  check("no Plan and billing while billing is off", !member.some((it) => it.key === "billing"));
  check("no Your network while it is off", !member.some((it) => it.key === "network"));
  check("an admin gets Pilot metrics, in the foot", all.find((it) => it.key === "metrics")?.group === "foot");
  check("the plan's line: the trial's days left", nm.planLine(trial) === "Pro trial · 9 days left" && nm.planLine({ ...trial, trialDaysLeft: 1 }) === "Pro trial · last day" && nm.planLine({ ...trial, name: "pro" }) === "Pro" && nm.planLine(undefined) === null);

  // Exactly one item on, the right one.
  const on = (x: Partial<NavInput>) => nm.navItems(input({ admin: true, plan: trial, network: true, ...x })).filter((it) => it.current).map((it) => it.key);
  const cases: [string, Partial<NavInput>, string][] = [
    ["Home", { page: "today" }, "today"],
    ["the table, companies", { page: "table" }, "companies"],
    ["the table, seats", { page: "table", recordType: "engagements" }, "engagements"],
    ["the table, people", { page: "table", recordType: "people" }, "people"],
    ["Hiring now", { page: "table", recordType: "engagements", tab: "hiring" }, "hiring"],
    ["Following", { page: "table", tab: "following" }, "following"],
    ["a saved view on screen", { page: "table", tab: "hiring", currentView: "v1" }, "view:v1"],
    ...nm.APP_PAGES.filter((p) => p !== "today" && p !== "table").map((p) => [p, { page: p, currentView: "v1" }, p === "partners" ? "fractionals" : p] as [string, Partial<NavInput>, string]),
  ];
  for (const [name, x, want] of cases) {
    const got = on(x);
    check(`one item on for ${name}: ${want}`, got.length === 1 && got[0] === want, got);
  }

  // The tab bar and More.
  check("the tab bar: Home, Companies, Crystal Ball, Messages", nm.TAB_KEYS.every((k) => member.some((it) => it.key === k)));
  check("More is on where none of the four is", nm.moreOn(nm.navItems(input({ page: "rates" }))) && !nm.moreOn(nm.navItems(input({ page: "radar" }))));

  // Home's search offers pages by name.
  const names = (q: string) => nm.navMatches(q, all).map((it) => it.key);
  check("'rates' finds Rate benchmarks", names("rates")[0] === "rates", names("rates"));
  check("'crystal' finds Crystal Ball", names("crystal").includes("radar"), names("crystal"));
  check("'messages' finds Messages", names("messages").includes("messages"));
  check("two letters find nothing, and nor does a company's name", names("me").length === 0 && names("Navtest Co 3").length === 0, names("Navtest Co 3"));

  // The counts are the table's own.
  for (const tok of ["tok-sal-nav", "tok-ned-nav"]) {
    const v = await t.buildView(tok);
    const m = v.me!;
    const infos = deriveAll(v.companies);
    const places = ["?v=hiring&t=seats&f=icp", "?v=hiring&t=seats", "?p=table", "?t=people", "?v=repeat", "?f=industry%3ASaaS", "?v=hiring&t=seats&af=1"];
    for (const q of places) {
      const p = parsePlace(m, q, new Set());
      const n = listAt(infos, m, p, new Set()).first.n;
      check(`${m.name}: placeRows is the table's count at ${q}`, placeRows(infos, m, p, new Set()).length === n, { rows: placeRows(infos, m, p, new Set()).length, n });
    }
    const hiringPlace = { t: "engagements" as const, v: "hiring" as const, s: null, f: { ...EMPTY_FILTERS, icp: true }, q: "", c: null, p: null, all: false, sig: null, home: false };
    const hn = placeRows(infos, m, hiringPlace, new Set()).length;
    check(`${m.name}: Hiring now's count is what it lists`, hn === listAt(infos, m, hiringPlace, new Set()).first.n && hn > 0, hn);
  }
  const v = await t.buildView("tok-sal-nav");
  const m = v.me!;
  const infos = deriveAll(v.companies);
  const saved = { id: "v9", name: "From Claude", place: null, criteria: { functions: ["Marketing"] }, email: true, createdAt: ago(DAY) };
  const sp = savedViewPlace(m, saved as never, new Set());
  check("a search saved in Claude opens its open roles, in every function it names", sp.t === "engagements" && sp.v === "hiring" && sp.all && sp.f.fn.join() === "Marketing");
  const fromPlace = savedViewPlace(m, { ...saved, place: "v=all&t=companies&f=industry%3ASaaS" } as never, new Set());
  check("a view with a place opens there", fromPlace.t === "companies" && fromPlace.v === "all" && fromPlace.f.industry.join() === "SaaS");
  const rows = placeRows(infos, m, sp, new Set());
  check("its matches are open Marketing roles", rows.length > 0 && rows.every((r) => !!r.e && /Marketing/.test(JSON.stringify(r.e.cells.function))), rows.length);
  check("nothing new on a first visit", freshCount(rows, null) === 0);
  const everyCo = new Set(rows.map((r) => r.i.c.id)).size;
  check("new since a visit long ago: each company once", freshCount(rows, ago(365 * DAY)) === everyCo, { fresh: freshCount(rows, ago(365 * DAY)), everyCo });
  check("new since a visit in the future: none", freshCount(rows, ago(-DAY)) === 0);

  // Copy: LinkedIn and Sales Navigator are never named as a source.
  const files = ["Sidebar.tsx", "Home.tsx", "navModel.ts", "TopBar.tsx"].map((f) => readFileSync(path.join(process.cwd(), "app/post", f), "utf8")).join("\n");
  check("no LinkedIn or Sales Navigator in the way around or Home", !/linkedin|sales navigator/i.test(files));
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
