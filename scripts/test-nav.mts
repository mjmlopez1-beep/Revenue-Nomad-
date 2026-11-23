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
 *
 * And the new look (RN_UI2, navModel.ts navItems2, place.ts with { ui2: true }), the same way:
 *   - the rail's groups and order (Home, Find; Data; Signals; Close; Community; Automate;
 *     Workspace), every page in it, each link's address opening its page in the new look;
 *   - exactly one item on for every place, both looks: every page, the table's lists, Hiring now,
 *     Following and a saved view (Companies), Your seats (Seats), Proposals at Contracts;
 *   - every old address members hold (BUILD_PLAN constraint 2: ?c=, ?p=radar, ?sig=, ?p=getin,
 *     ?p=network, ?p=peers, ?p=fractionals, ?p=partners, ?p=integrations, ?p=claude,
 *     ?p=notifications, ?p=billing, ?p=credits, ?p=proposals&pr=, /table?k=) opens the right page
 *     in both looks, and the new look's addresses are unknown pages with it off, as before;
 *   - Evidence Bank is Close's (the plan pill without it), Hiring now's ember only when allowed,
 *     the member's own things show no count while they have none;
 *   - every page key has an entry in the registry (shell/pages.tsx), home2, companies2 and find2 too;
 *   - the flag: off sends nothing, optin offers the switch and keeps the choice, on is everyone's;
 *     the strips a member dismisses are kept (lib/ui2.ts through the settings action).
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
  // Referral partners' old page ("partners") and the Fractionals directory ("fractionals") are in Peers now: their addresses open Peers' Every fractional, and no item of their own.
  const missing = nm.APP_PAGES.filter((p) => p !== "partners" && p !== "fractionals" && !pagesOf.has(p));
  check("every page the app draws is in the sidebar (an admin, billing and Your network on)", missing.length === 0, missing);
  check("Referral partners and Fractionals have no item: Peers replaces them", !all.some((it) => it.key === "partners" || it.page === "partners" || it.key === "fractionals") && all.find((it) => it.key === "peers")?.group === "community");
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
  // Your pipeline sits under Yours, first after the saved views: Your pipeline, Proposals (next to the pipeline), Following, Your seats.
  // Notifications (every email and Slack post, and how often) sits in the foot after Integrations: one place for the
  // switches that were on Your credits, Your profile and Integrations.
  check("in the order Home, Find, Community, Yours, Earn, then the foot", keys.join(",") === "today,companies,engagements,people,radar,getin,hiring,peers,messages,view:v1,view:v2,pipeline,proposals,following,seats,network,add,rates,invite,integrations,notifications,billing,credits,metrics", keys);
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
  check("the plan's line: the trial's days left", nm.planLine(trial) === "Close trial · 9 days left" && nm.planLine({ ...trial, trialDaysLeft: 1 }) === "Close trial · last day" && nm.planLine({ ...trial, name: "pro" }) === "Pro" && nm.planLine(undefined) === null);

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
    ...nm.APP_PAGES.filter((p) => p !== "today" && p !== "table").map((p) => [p, { page: p, currentView: "v1" }, p === "partners" || p === "fractionals" ? "peers" : p] as [string, Partial<NavInput>, string]),
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

  await ui2Checks(nm, me);

  // Copy: LinkedIn and Sales Navigator are never named as a source.
  const files = ["Sidebar.tsx", "Home.tsx", "navModel.ts", "TopBar.tsx"].map((f) => readFileSync(path.join(process.cwd(), "app/post", f), "utf8")).join("\n");
  check("no LinkedIn or Sales Navigator in the way around or Home", !/linkedin|sales navigator/i.test(files));
  // The new look's words (the strips, the six steps, the examples): LinkedIn only as the member's own connections file, Merlin's AI only as Merlin.
  const fv = await import("../app/post/firstVisit");
  const gs = await import("../app/post/getStarted");
  const ex = await import("../app/post/examples");
  const words = [
    ...Object.values(fv.STRIPS).map((x) => x.text),
    ...gs.sixSteps({ me: { icp: null, holdersUnlocked: 0, companiesUnlocked: 0, savedViews: [], started: { note: false, network: false } } as never, seatsHeld: 0, close: true, evidence: true }).steps.flatMap((x) => [x.label, x.takes, x.gives, x.go, x.pill ?? ""]),
    JSON.stringify([ex.EXAMPLE_DEALS, ex.EXAMPLE_CONVERSATIONS, ex.EXAMPLE_PROPOSALS, ex.EXAMPLE_CONTRACTS]),
  ].join("\n");
  check("the new look names LinkedIn only as the member's own connections file, never Sales Navigator", !/linkedin|sales navigator/i.test(words.replace(/LinkedIn connections file/g, "")));
  check("the new look's words: Claude only as an agent the member connects, never Anthropic", !/anthropic/i.test(words) && !/claude/i.test(words.replace(/such as Claude/g, "")));
  check("plain words: no exclamation marks, no dashes as punctuation", !/!/.test(words) && !/ [-–—] /.test(words));
}

/* ---------- the new look (RN_UI2) ---------- */
async function ui2Checks(nm: typeof import("../app/post/navModel"), me: import("../lib/tableTypes").Me) {
  const t = await import("../lib/table");
  const { parsePlace, isHome, UI2_PAGES } = await import("../app/post/place");
  type In2 = Parameters<typeof nm.navItems2>[0];
  const in2 = (x: Partial<In2> = {}): In2 => ({
    page: "today",
    recordType: "companies",
    tab: "all",
    hrefs: {
      today: "/",
      companies: "/?p=table",
      engagements: "/?t=seats",
      people: "/?t=people",
      hiring: "/?v=hiring&t=seats",
      find: "/?p=find",
      contracts: "/?p=contracts",
      page: (p) => (p === "today" ? "/" : `/?p=${p}`),
    },
    admin: false,
    close: true,
    network: true,
    networkN: 4,
    totals: { companies: 40, engagements: 60, people: 12 },
    hiringN: 14,
    hiringHot: true,
    radarN: 9,
    pipelineN: 3,
    unread: 2,
    credits: 25,
    ...x,
  });
  const all = nm.navItems2(in2({ admin: true }));
  const keys = all.map((it) => it.key);
  check("new look: the rail in its order", keys.join(",") === "today,find,companies,people,engagements,radar,hiring,warm,pipeline,proposals,contracts,evidence,fractionals,messages,alerts,agent,rates,credits,settings,metrics", keys);
  check("new look: the groups in order", [...new Set(all.map((it) => it.group))].join(",") === "top,data,signals,close,community,automate,workspace");
  check("new look: nothing listed twice", new Set(keys).size === keys.length);
  check("new look: the labels are the mockup's", ["Home", "Find", "Companies", "People", "Seats", "Crystal Ball", "Hiring now", "Warm paths", "Pipeline", "Proposals", "Contracts", "Evidence Bank", "Fractionals", "Messages", "Alerts and workflows", "Agent access", "Rate benchmarks", "Credits and usage", "Settings"].every((l) => all.some((it) => it.label === l)));
  const pagesOf = new Set(all.map((it) => it.page));
  const notListed = nm.APP_PAGES2.filter((p) => !pagesOf.has(p) && !["partners", "fractionals", "network", "getin", "integrations", "notifications", "billing", "seats"].includes(p));
  check("new look: every page has its item (old pages under their new home)", notListed.length === 0, notListed);
  // Each link opens its page in the new look.
  const wrong = all.filter((it) => {
    const search = it.href.split("?")[1] ?? "";
    if (it.page === "today") return !isHome(search);
    const p = parsePlace(me, search, new Set(), undefined, { ui2: true });
    if (it.page === "table") return p.p !== null || p.home;
    return p.p !== it.page;
  });
  check("new look: each link's address opens its page", wrong.length === 0, wrong.map((it) => it.key));
  check("new look: every item is a link", all.every((it) => !!it.href));

  // Exactly one item on, for every place, in the new look.
  const on2 = (x: Partial<In2>) => nm.navItems2(in2({ admin: true, ...x })).filter((it) => it.current).map((it) => it.key);
  const cases: [string, Partial<In2>, string][] = [
    ["Home", { page: "today" }, "today"],
    ["Companies", { page: "table" }, "companies"],
    ["People", { page: "table", recordType: "people" }, "people"],
    ["Seats", { page: "table", recordType: "engagements" }, "engagements"],
    ["Hiring now", { page: "table", recordType: "engagements", tab: "hiring" }, "hiring"],
    ["Following (Companies)", { page: "table", tab: "following" }, "companies"],
    ["Repeat hirers (Companies)", { page: "table", tab: "repeat" }, "companies"],
    ["Proposals at Contracts", { page: "proposals", contracts: true }, "contracts"],
    ["Proposals", { page: "proposals" }, "proposals"],
    ["Your seats (Seats)", { page: "seats" }, "engagements"],
    ...nm.APP_PAGES2.filter((p) => !["today", "table", "seats", "proposals"].includes(p)).map(
      (p) =>
        [
          p,
          { page: p },
          ({ getin: "warm", network: "warm", partners: "fractionals", fractionals: "fractionals", peers: "fractionals", notifications: "alerts", integrations: "settings", billing: "credits" } as Record<string, string>)[p] ?? p,
        ] as [string, Partial<In2>, string],
    ),
  ];
  for (const [name, x, want] of cases) {
    const got = on2(x);
    check(`new look: one item on for ${name}: ${want}`, got.length === 1 && got[0] === want, got);
  }

  // Every old address opens the right page, in both looks.
  const P = (q: string, ui2: boolean) => parsePlace(me, q, new Set(), undefined, { ui2 });
  const old: [string, string | null, string | null, (p: ReturnType<typeof P>) => boolean][] = [
    // address, page with the look off, page with it on, anything else that must hold
    ["?c=c_navt03", null, null, (p) => p.c === "c_navt03" && !p.home],
    ["?p=radar", "radar", "radar", () => true],
    ["?sig=" + new Date().toISOString().slice(0, 10), "radar", "radar", (p) => !!p.sig],
    ["?p=getin", "getin", "warm", () => true],
    ["?p=getin&w=c_navt03", "getin", "warm", () => true],
    // Your network's parts moved (BUILD_PLAN part 2): its paths to Warm paths, Google's connect and delete to Settings / Connections.
    ["?p=network", "network", "warm", () => true],
    ["?p=network&google=connected", "network", "settings", () => true],
    ["?p=settings", null, "settings", () => true],
    ["?p=integrations&slack=connected", "integrations", "settings", () => true],
    ["?p=voice", null, "settings", () => true],
    ["?p=profile", null, "settings", () => true],
    ["?p=peers", "peers", "peers", (p) => !p.pt],
    ["?p=fractionals", "peers", "peers", (p) => !!p.pt],
    ["?p=partners", "peers", "peers", (p) => !!p.pt],
    ["?p=integrations", "integrations", "settings", () => true],
    ["?p=claude", "integrations", "agent", () => true],
    ["?p=notifications", "notifications", "alerts", () => true],
    ["?p=billing", "billing", "billing", () => true],
    ["?p=credits", "credits", "credits", () => true],
    ["?p=proposals&pr=pr_abc", "proposals", "proposals", () => true],
    ["?p=seats", "seats", "seats", () => true],
    ["?p=messages", "messages", "messages", () => true],
    ["?p=rates", "rates", "rates", () => true],
    ["?p=pipeline", "pipeline", "pipeline", () => true],
    ["?v=hiring&t=seats", null, null, (p) => p.v === "hiring" && p.t === "engagements"],
    ["?upgrade=radar", "radar", "radar", () => true],
  ];
  for (const [q, off, on, more] of old) {
    const a = P(q, false);
    const b = P(q, true);
    check(`old address ${q}: the old look opens ${off ?? "the table"}, the new ${on ?? "the table"}`, a.p === off && b.p === on && more(a) && more(b), { off: a.p, on: b.p });
  }
  // Stage 8: in the new look Plan and billing and Your credits are one page, Credits and usage, and the old addresses land on its tab (credits/creditsModel.ts creditTabOf); Rate benchmarks on its table's tab (rates/ratesModel.ts rateTabOf).
  {
    const { creditTabOf } = await import("../app/post/credits/creditsModel");
    const { rateTabOf } = await import("../app/post/rates/ratesModel");
    const tabs: [string, string, boolean, string][] = [
      ["?p=credits", "credits", true, "overview"],
      ["?p=billing", "billing", true, "plans"],
      ["?p=billing&plans=1", "billing", true, "plans"],
      ["?p=billing&plans=1&from=ai-pack", "billing", true, "plans"],
      ["?p=billing&topup=1", "billing", true, "plans"],
      ["?p=billing&aipack=1", "billing", true, "plans"],
      ["?p=billing&paid=1&plan=pro", "billing", true, "plans"],
      ["?p=credits&tab=ledger", "credits", true, "ledger"],
      ["?p=credits&tab=earn", "credits", true, "earn"],
      ["?p=credits&tab=history", "credits", true, "ledger"],
      ["?p=billing", "billing", false, "overview"],
    ];
    for (const [q, page, billing, want] of tabs) {
      const p = P(q, true);
      check(`new look: ${q}${billing ? "" : " (billing off)"} opens Credits and usage at ${want}`, p.p === page && creditTabOf(page, q, billing) === want, { p: p.p, tab: creditTabOf(page, q, billing) });
    }
    check("new look: ?p=rates opens Rate benchmarks By function; tab=size and tab=seats their tabs", P("?p=rates", true).p === "rates" && rateTabOf("?p=rates") === "fn" && rateTabOf("?p=rates&tab=size") === "size" && rateTabOf("?p=rates&tab=seats") === "seats" && rateTabOf("?p=rates&tab=bogus") === "fn");
    const reg = readFileSync(path.join(process.cwd(), "app/post/shell/pages.tsx"), "utf8");
    check(
      "registry: credits and billing draw Credits and usage in the new look, rates the new Rate benchmarks; the old look keeps Your credits, Plan and billing and Benchmarks",
      /function CreditsP\(\) \{\s*const c = useApp\(\);\s*if \(c\.ui2\) return <CreditsUsageL page="credits" \/>;\s*return <MyCredits/.test(reg) &&
        /function BillingP\(\) \{[\s\S]{0,200}if \(c\.ui2\) return <CreditsUsageL page="billing" \/>;\s*return <BillingPage/.test(reg) &&
        /function RatesP\(\) \{\s*const c = useApp\(\);\s*if \(c\.ui2\) return <RatesPageL \/>;\s*return <Benchmarks/.test(reg),
    );
  }
  // An old /table?k= link is redirected to /?k= (app/table/page.tsx): Home, signed in, in both looks.
  check("old address /table?k=: Home in both looks", isHome("?k=tok-abc") && !P("?k=tok-abc", false).p && !P("?k=tok-abc", true).p && P("?k=tok-abc", true).home);
  check("old address ?p=proposals&ct=1 (Contracts): the Contracts page in the new look, Proposals (at its Contracts screen) in the old", P("?p=proposals&ct=1", true).p === "contracts" && P("?p=proposals&ct=1", false).p === "proposals");
  check("old address ?p=proposals&dc=<id> (a contract, from an alert or an email): the Contracts page in the new look, Proposals in the old", P("?p=proposals&dc=dc_x1", true).p === "contracts" && P("?p=proposals&dc=dc_x1", false).p === "proposals" && P("?p=proposals&pr=pr_x1", true).p === "proposals");
  check("?p=contracts in the new look: the Contracts page", P("?p=contracts", true).p === "contracts");
  for (const k of UI2_PAGES) {
    const a = P(`?p=${k}`, false);
    check(`?p=${k} with the new look off: an unknown page, as before (the table)`, a.p === null && !a.home, a.p);
  }
  for (const k of UI2_PAGES) check(`?p=${k} in the new look opens it`, P(`?p=${k}`, true).p === k);

  // Pills, counts and the ember.
  const noClose = nm.navItems2(in2({ close: false })).find((it) => it.key === "evidence");
  const withClose = nm.navItems2(in2({ close: true })).find((it) => it.key === "evidence");
  check("Evidence Bank without Close: the plan's pill, and it opens the upgrade", noClose?.pill?.kind === "plan" && noClose.pill.text === "Close" && !!noClose.gated, noClose);
  check("Evidence Bank with Close: New", withClose?.pill?.kind === "new" && !withClose.gated);
  check("Contracts says New, Alerts and workflows Beta", all.find((it) => it.key === "contracts")?.pill?.kind === "new" && all.find((it) => it.key === "alerts")?.pill?.text === "Beta");
  const hot = nm.navItems2(in2({ hiringHot: true })).find((it) => it.key === "hiring");
  const quiet = nm.navItems2(in2({ hiringHot: false })).find((it) => it.key === "hiring");
  check("Hiring now: ember only when the screen's ember allows it", hot?.pill?.kind === "hot" && hot.pill.text === "14" && !quiet?.pill && quiet?.count === 14);
  const fresh = nm.navItems2(in2({ pipelineN: 0, networkN: 0, unread: 0, proposalsN: 0 }));
  check("the member's own things show no count while they have none", ["pipeline", "warm", "messages", "proposals"].every((k) => fresh.find((it) => it.key === k)?.count == null));
  check("Merlin's own data keeps its count", fresh.find((it) => it.key === "companies")?.count === 40);
  check("no Warm paths while Your network is off", !nm.navItems2(in2({ network: false })).some((it) => it.key === "warm"));
  check("Pilot metrics for an admin only", !nm.navItems2(in2()).some((it) => it.key === "metrics") && all.find((it) => it.key === "metrics")?.group === "workspace");
  check("no export anywhere in the rail", !all.some((it) => /export|csv|download/i.test(it.label)));
  check("the tab bar: Home, Companies, Crystal Ball, Messages; More is on elsewhere", nm.TAB_KEYS2.every((k) => all.some((it) => it.key === k)) && nm.moreOn2(nm.navItems2(in2({ page: "rates" }))) && !nm.moreOn2(nm.navItems2(in2({ page: "radar" }))));

  // The registry: every page key has an entry (read as text: the registry draws React pages).
  const reg = readFileSync(path.join(process.cwd(), "app/post/shell/pages.tsx"), "utf8");
  const body = reg.slice(reg.indexOf("export const PAGES"));
  const missing = [...nm.APP_PAGES2.filter((p) => p !== "today" && p !== "table" && p !== "find"), "home2", "companies2", "find2"].filter((k) => !new RegExp(`\\n  ${k}: \\{`).test(body));
  check("every page has its registry entry, and the three mount points", missing.length === 0, missing);
  check("the mount points draw the new look's pages: Home2, the workbench and Find, each with its own strip", /home2: \{[^}]*component: Home2P[^}]*ownHeader: true[^}]*ownStrip: true/.test(body) && /companies2: \{[^}]*component: Companies2P[^}]*ownStrip: true/.test(body) && /find2: \{[^}]*component: FindP[^}]*ownStrip: true/.test(body) && !/placeholder: "/.test(body));
  // The workbench's columns ride in the address as cols= (never k=, the sign-in code), and alone they name no place.
  const { colsOf, withCols, isHome: homeQ } = await import("../app/post/place");
  check("the workbench's columns: cols= in the address, cleaned, and no place on their own", JSON.stringify(colsOf("?p=table&cols=heldBy,seat,bad%20id,seat")) === JSON.stringify(["heldBy", "seat"]) && colsOf("?k=tok-abc") === null && homeQ("?cols=heldBy") && withCols("?v=all&cols=a", null) === "?v=all" && withCols("", ["heldBy", "seat"]) === "?cols=heldBy,seat");

  // The flag, through the settings action (lib/table.ts, lib/ui2.ts).
  const was = process.env.RN_UI2;
  try {
    delete process.env.RN_UI2;
    const dflt = await t.buildView("tok-ned-nav");
    check("RN_UI2 unset (Stage 9): the new look is the default, for everyone, with no switch", dflt.me!.ui2 === true && dflt.ui2 === true && dflt.me!.ui2Optin === undefined);
    process.env.RN_UI2 = "off";
    const off = await t.buildView("tok-ned-nav");
    check("RN_UI2 off: nothing of the new look is sent", off.me!.ui2 === undefined && off.me!.ui2Optin === undefined && off.me!.stripsOff === undefined && off.ui2 === undefined);
    const refused = await t.perform("tok-ned-nav", { type: "settings", ui2: true } as never).then(() => null, (e: Error) => e.message);
    check("RN_UI2 off: turning it on is refused in plain words", refused === "The new look isn't open yet.", refused);
    process.env.RN_UI2 = "optin";
    const o1 = await t.buildView("tok-ned-nav");
    check("RN_UI2 optin: the menu offers it, and it is off until the member says", o1.me!.ui2 === false && o1.me!.ui2Optin === true && !o1.ui2);
    await t.perform("tok-ned-nav", { type: "settings", ui2: true } as never);
    const o2 = await t.buildView("tok-ned-nav");
    check("RN_UI2 optin: Try the new Merlin turns it on, kept on the profile", o2.me!.ui2 === true && o2.ui2 === true && Array.isArray(o2.me!.stripsOff));
    const other = await t.buildView("tok-sal-nav");
    check("RN_UI2 optin: only for the member who chose it", other.me!.ui2 === false);
    await t.perform("tok-ned-nav", { type: "settings", stripOff: "companies" } as never);
    await t.perform("tok-ned-nav", { type: "settings", stripOff: "home" } as never);
    await t.perform("tok-ned-nav", { type: "settings", stripOn: "home" } as never);
    const o3 = await t.buildView("tok-ned-nav");
    check("a dismissed strip is kept (and Undo brings it back)", o3.me!.stripsOff!.join() === "companies", o3.me!.stripsOff);
    const bad = await t.perform("tok-ned-nav", { type: "settings", stripOff: "<script>" } as never).then(() => null, (e: Error) => e.message);
    check("a strip key that is no page key is refused", !!bad);
    await t.perform("tok-ned-nav", { type: "settings", ui2: false } as never);
    check("Back to the old look", (await t.buildView("tok-ned-nav")).me!.ui2 === false);
    process.env.RN_UI2 = "on";
    const on = await t.buildView("tok-sal-nav");
    check("RN_UI2 on: everyone, and no switch in the menu", on.me!.ui2 === true && on.me!.ui2Optin === undefined && on.ui2 === true);
  } finally {
    if (was === undefined) delete process.env.RN_UI2;
    else process.env.RN_UI2 = was;
  }
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
