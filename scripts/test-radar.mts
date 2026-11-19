/**
 * Checks of the next-client radar (lib/radar), without a server, Slack, email or a network.
 *
 *   npx tsx scripts/test-radar.mts
 *
 * Runs on a made-up seed in a temporary data dir. fetch is replaced, so every email (Resend's API)
 * and every Slack post is caught here, and nothing leaves the machine. The clock moves forward
 * where a rule is about days. Covers: each signal type, Ideal Fractional Profile matching, the
 * functions that come before the member's, never the same signal twice, a free view that never
 * names a company or a person (every output is scanned for the names on the seed), the Pro view,
 * days with nothing skipped, the switch and the email's unsubscribe link, the Slack and email
 * formats, the funding plumbing, the tracked links, and billing off reading as free.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-radar-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
/** "YYYY-MM", `n` months before now. */
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
const seat = (id: string, companyId: string, fields: Record<string, string>, addedAt?: string) => ({ id, companyId, fields, verified: false, ...(addedAt ? { addedAt } : {}) });

const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Starter", email: "sal.starter@example.com", title: "Fractional VP Sales", token: "tok-sal-0001" },
    { id: "mem_mo", name: "Mo Marketer", email: "mo.marketer@example.com", title: "Fractional CMO", token: "tok-mo-0001" },
    { id: "mem_pro", name: "Pia Profit", email: "pia.profit@example.com", title: "Fractional CFO", token: "tok-pro-0001" },
    { id: "mem_off", name: "Otto Off", email: "otto.off@example.com", title: "Fractional VP Sales", token: "tok-off-0001" },
    { id: "mem_nofn", name: "Nora None", email: "nora.none@example.com", title: "Member", token: "tok-nofn-0001" },
    { id: "mem_noicp", name: "Ned Noprofile", email: "ned.noprofile@example.com", title: "Fractional VP Sales", token: "tok-noicp-0001" },
    { id: "mem_ada", name: "Ada Admin", email: "ada.admin@example.com", title: "Founder", token: "tok-ada-0001" },
  ],
  companies: [
    { id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } },
    { id: "c_beta", fields: { name: "Beta Labs", website: "beta.example", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Denver, CO" } },
    { id: "c_gamma", fields: { name: "Gamma Goods", website: "gamma.example", industry: "E-Commerce", employees: "1,001+", hq: "Seattle, WA" } },
    { id: "c_delta", fields: { name: "Delta Data", website: "delta.example", industry: "SaaS", employees: "51–200", hq: "London, UK" } },
    { id: "c_echo", fields: { name: "Echo Energy", website: "echo.example", industry: "SaaS", employees: "51–200", hq: "Boston, MA" } },
    { id: "c_fox", fields: { name: "Fox Freight", website: "fox.example", industry: "SaaS", employees: "201–500", revenue: "$20M–$50M", hq: "Chicago, IL" } },
  ],
  engagements: [
    // Adjacent for Sales (Marketing comes before Sales), in a US 11–500 profile.
    seat("e_acme_mkt", "c_acme", { source: "Seat scan", operator: "Hana Holder", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    // A Manager title is no leadership hire.
    seat("e_acme_mgr", "c_acme", { source: "Seat scan", role: "Fractional Marketing Manager", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(2 * HOUR)),
    // Echo already has a fractional Sales: its new Marketing hire is no news for Sales.
    seat("e_echo_sales", "c_echo", { source: "Published engagement", operator: "Eve Earlier", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" }),
    seat("e_echo_mkt", "c_echo", { source: "Seat scan", role: "Fractional VP Marketing", function: "Marketing", type: "Fractional", start: monthAgo(2), status: "Active", end: "Ongoing" }, ago(3 * HOUR)),
    // Outside the profile: too big, and abroad.
    seat("e_gamma_mkt", "c_gamma", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(HOUR)),
    seat("e_delta_mkt", "c_delta", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(HOUR)),
    // Came in today, but started in 2019: no news.
    seat("e_beta_old", "c_beta", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2019-03", status: "Ended", end: "2020-01" }, ago(HOUR)),
    // A Sales seat whose end a member records today: "their kind of seat opened up".
    seat("e_beta_sales", "c_beta", { source: "Member success story", operator: "Rita Seller", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01" }),
    // Adjacent for Finance and Marketing (Sales comes before both).
    seat("e_fox_sales", "c_fox", { source: "Seat scan", operator: "Fred Fixer", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(HOUR)),
    // Full-time is no fractional hire.
    seat("e_fox_ft", "c_fox", { source: "Seat scan", role: "VP Marketing", function: "Marketing", type: "Full-time", start: monthAgo(1), status: "Active", end: "Ongoing" }, ago(HOUR)),
  ],
  contacts: [{ id: "p_acme_ceo", engagementId: "e_acme_mkt", fields: { name: "Carla Chief", title: "CEO", relationship: "Hiring for the seat", email: "carla@acme.example" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const US_MID = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Pia unlocked Fox Freight before (every company is locked for a member until they unlock it or know it).
    unlocks: { "c_fox.identity": ["mem_pro"] },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(HOUR)])),
    profiles: {
      mem_sal: { function: "Sales", onboarded: true, icp: US_MID },
      mem_mo: { function: "Marketing", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } },
      mem_pro: { function: "Finance", onboarded: true, icp: US_MID },
      mem_off: { function: "Sales", onboarded: true, icp: US_MID, radarOff: true },
      mem_nofn: { onboarded: true, icp: US_MID },
      mem_noicp: { function: "Sales", onboarded: true },
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
  RN_SCAN_TEST: "1",
  RESEND_API_KEY: "re_test_key",
  RN_EMAIL_FROM: "Merlin <post@example.com>",
  RN_EMAIL_API_URL: "https://mail.test/emails",
  RN_DIGEST: "0",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_EMAIL_REPLY_TO"]) delete process.env[k];

/* ---------- the network, replaced ---------- */

type Sent = { url: string; body: Record<string, unknown>; raw: string };
const outbox: Sent[] = [];
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  const raw = String(init?.body ?? "{}");
  let body: Record<string, unknown> = {};
  try {
    body = JSON.parse(raw);
  } catch {
    /* not JSON */
  }
  outbox.push({ url, body, raw });
  return url.startsWith("https://mail.test") ? new Response(JSON.stringify({ id: "m1" }), { status: 200 }) : new Response("ok", { status: 200 });
}) as typeof fetch;

const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;
const nowIso = () => new Date(Date.now()).toISOString();

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

const SLACK_SAL = "https://hooks.slack.com/services/" + "T0001TEST/B0001TEST/salsalsalsalsalsalsalSALS";
const SLACK_PRO = "https://hooks.slack.com/services/" + "T0003TEST/B0003TEST/propropropropropropropROS";
/** Every name on the seed a member could be told without paying: companies, seat holders, people. */
const NAMES = ["Acme Robotics", "Acme", "Robotics", "Beta Labs", "Gamma Goods", "Delta Data", "Echo Energy", "Fox Freight", "Hana Holder", "Hana", "Rita Seller", "Rita", "Carla Chief", "Carla", "Fred Fixer", "Eve Earlier"];
const named = (x: unknown, names = NAMES) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return names.filter((n) => new RegExp(`\\b${n}\\b`, "i").test(s));
};

async function main() {
  const t = await import("../lib/table");
  const n = await import("../lib/notify");
  const radar = await import("../lib/radar");
  const sig = await import("../lib/radar/signals");
  const match = await import("../lib/radar/match");
  const present = await import("../lib/radar/present");
  const fmt = await import("../lib/radar/format");
  const nfmt = await import("../lib/notify/format");
  const funding = await import("../lib/radar/sources/funding");
  const types = await import("../lib/radar/types");
  const plan = await import("../lib/plan");
  const T = t.tableInternals;
  const pub = T.pubId;
  const PUBS = ["c_acme", "c_beta", "c_gamma", "c_delta", "c_echo", "c_fox", ...seed.engagements.map((e) => e.id)].map(pub);
  const pubLeaks = (x: unknown) => {
    const s = typeof x === "string" ? x : JSON.stringify(x);
    return PUBS.filter((p) => s.includes(p) || s.includes(encodeURIComponent(p)));
  };
  const settle = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 15));
      await n.settled();
    }
  };
  const mails = (to?: string) => outbox.filter((x) => x.url === "https://mail.test/emails" && (!to || (x.body.to as string[])?.[0] === to));
  const radarPosts = (u: string) => outbox.filter((x) => x.url === u && x.raw.includes(fmt.RADAR_FOOTER));
  const clear = () => (outbox.length = 0);
  const state = () => t.loadState();

  /* ---------- the pure parts ---------- */
  console.log("\nIdeal Fractional Profile matching");
  const co = (o: Partial<Parameters<typeof match.inIcp>[1]>) => ({ name: "X", industry: null, employees: null, revenue: null, country: null, region: null, ...o });
  check("a US 51–200 company is in a US 11–500 profile", match.inIcp(US_MID, co({ country: "United States", employees: "51–200" })));
  check("a company too big is out", !match.inIcp(US_MID, co({ country: "United States", employees: "1,001+" })));
  check("a company abroad is out", !match.inIcp(US_MID, co({ country: "United Kingdom", employees: "51–200" })));
  check("a company with nothing on file the profile asks about is out", !match.inIcp(US_MID, co({ industry: "SaaS" })));
  check("one part on file and matching is enough (a maybe stays)", match.inIcp(US_MID, co({ country: "US" })));
  check("industries match without case", match.inIcp({ industries: ["SaaS"], employees: [], revenue: [], countries: [] }, co({ industry: "saas" })));
  check("an empty profile matches nothing", !match.inIcp({ industries: [], employees: [], revenue: [], countries: [] }, co({ country: "United States" })) && !match.inIcp(null, co({ country: "United States" })));

  console.log("\nThe functions before yours");
  const s0 = await state();
  const seedLoaded = await t.loadSeed();
  check("Sales watches the usual ones when the data says too little", JSON.stringify(match.beforeSuggested(seedLoaded, s0, "Sales")) === JSON.stringify(["Marketing", "RevOps", "Finance"]), match.beforeSuggested(seedLoaded, s0, "Sales"));
  check("Finance watches Sales first", match.beforeSuggested(seedLoaded, s0, "Finance")[0] === "Sales");
  const own = match.profileOf(seedLoaded, { ...s0, profiles: { ...s0.profiles, mem_x: { function: "Sales", before: ["RevOps"], icp: US_MID } } } as typeof s0, "mem_x", "Sales");
  check("a member's own answer wins over the suggestion", JSON.stringify(own.before) === '["RevOps"]' && own.beforeFromMember, own);
  const notSure = match.profileOf(seedLoaded, { ...s0, profiles: { ...s0.profiles, mem_x: { function: "Sales", before: [], icp: US_MID } } } as typeof s0, "mem_x", "Sales");
  check("'Not sure' falls back to the suggestion", notSure.before.includes("Marketing") && !notSure.beforeFromMember, notSure);

  console.log("\nTitles and places in the free view");
  check("a title with the company's name in it falls back", present.safeTitle("Robotics Fractional VP Sales", "Acme Robotics", "Sales") === "Fractional Sales role");
  check("a clean title stays", present.safeTitle("Fractional VP Sales", "Acme Robotics", "Sales") === "Fractional VP Sales");
  check("a common word in a company name doesn't drop a title", present.safeTitle("Fractional Head of Growth", "Growth Partners", "Growth") === "Fractional Head of Growth");
  check("a place is the region and country, never a city", present.placeWords({ country: "United States", region: "Texas" }) === "Texas, US" && present.placeWords({ country: "United Kingdom", region: null }) === "UK");

  /* ---------- the signals ---------- */
  console.log("\nSignals in the table");
  // Connect Slack for two members (the test message goes to the stand-in).
  const salSlack = await n.connect("tok-sal-0001", "slack", SLACK_SAL).catch((e) => ({ error: String(e) }));
  check("Sal connects Slack", !("error" in salSlack), salSlack);
  const proSlack = await n.connect("tok-pro-0001", "slack", SLACK_PRO).catch((e) => ({ error: String(e) }));
  check("Pia connects Slack", !("error" in proSlack), proSlack);
  // The weekly scan finds open roles: a Sales role at Beta, a Marketing role at Acme, a Finance role at Beta.
  const role = (company: string, title: string, fn: string, domain: string | null = null) => ({
    key: `${company}::${title}`.toLowerCase(), company, domain, title, function: fn, type: "Fractional", url: `https://jobs.example.com/${encodeURIComponent(title)}`,
    source: "board", postedAt: null, rate: null, hoursPerWeek: null,
  });
  const found = [role("Beta Labs", "Beta Labs Fractional VP Sales", "Sales", "beta.example"), role("Acme Robotics", "Fractional Head of Marketing", "Marketing", "acme.example"), role("Beta Labs", "Fractional CFO", "Finance", "beta.example")];
  const scan = await t.applyScan({ roles: found, sources: [{ source: "board", fetched: 3, matched: 3 }] }, nowIso());
  check("the scan opened the roles", scan.opened === 3, scan);
  // A member records that the Beta Sales seat ended last month.
  const endAt = new Date(Date.now() - HOUR).toISOString();
  await T.mutate((d) => {
    d.values["e_beta_sales.status"] = { value: "Ended", by: "mem_mo", at: endAt, status: "live" };
    d.values["e_beta_sales.end"] = { value: monthAgo(1), by: "mem_mo", at: endAt, status: "live" };
  });
  await settle();
  clear();
  const s1 = await state();
  const all = sig.detectSignals(seedLoaded, s1, Date.now() - DAY, Date.now());
  const keys = all.map((x) => x.key);
  const k = (kind: string, id: string) => `${kind}:${pub(id)}`;
  check("an adjacent leadership hire is a signal", keys.includes(k("hire", "e_acme_mkt")) && keys.includes(k("hire", "e_fox_sales")), keys);
  check("a seat whose title reads below Lead is not", !keys.includes(k("hire", "e_acme_mgr")));
  check("a full-time seat is not", !keys.includes(k("hire", "e_fox_ft")));
  check("a seat that started years ago is not, even found today", !keys.includes(k("hire", "e_beta_old")));
  check("a seat already on the table before the window is not", !keys.includes(k("hire", "e_echo_sales")));
  const roleSigs = all.filter((x) => x.kind === "role");
  check("each new open role is a signal", roleSigs.length === 3, roleSigs.map((x) => x.title));
  check("an open role's title loses the company's name", roleSigs.some((x) => x.fn === "Sales" && x.title === "Fractional VP Sales"), roleSigs.map((x) => x.title));
  check("an ended seat is a signal", keys.includes(k("end", "e_beta_sales")), keys);
  check("no funding signal without a provider", !all.some((x) => x.kind === "funding"));
  const earlier = sig.detectSignals(seedLoaded, s1, Date.now() - DAY, Date.now() - 5 * HOUR);
  check("the window bounds the signals", !earlier.length, earlier.map((x) => x.key));

  console.log("\nWho each signal is for");
  const pSal = match.profileOf(seedLoaded, s1, "mem_sal", "Sales");
  const forSal = match.signalsFor(all, pSal).map((x) => x.key);
  check(
    "Sales in a US 11–500 profile gets the Sales role, the Sales seat that ended and the Marketing hire",
    forSal.length === 3 && forSal[0] === all.find((x) => x.kind === "role" && x.fn === "Sales")!.key && forSal.includes(k("end", "e_beta_sales")) && forSal.includes(k("hire", "e_acme_mkt")),
    forSal,
  );
  check("a hire outside the profile is left out (too big, abroad)", !forSal.includes(k("hire", "e_gamma_mkt")) && !forSal.includes(k("hire", "e_delta_mkt")));
  check("a company that already has a fractional in your function is left out", !forSal.includes(k("hire", "e_echo_mkt")));
  check("a hire in your own function is not adjacent", !forSal.includes(k("hire", "e_fox_sales")));
  const forPro = match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_pro", "Finance")).map((x) => x.key);
  check("Finance gets the Sales hire (Sales comes before Finance) and the Finance role", forPro.includes(k("hire", "e_fox_sales")) && forPro.length === 2, forPro);
  const forMo = match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_mo", "Marketing")).map((x) => x.key);
  check("Marketing in a SaaS profile gets the Marketing role and the Sales hire", forMo.length === 2 && forMo.includes(k("hire", "e_fox_sales")), forMo);
  check("a member with no function gets nothing", !match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_nofn", null)).length);
  check("a member with no profile gets nothing", !match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_noicp", "Sales")).length);

  /* ---------- billing off: the free view for everyone ---------- */
  console.log("\nThe morning run, billing off (everyone free)");
  check("billing is off", !plan.billingOn());
  const run1 = await radar.runRadar({ now: nowIso() });
  await settle();
  check("the run went out", run1.ran && run1.signals >= 7, run1);
  const salMail = mails("sal.starter@example.com");
  check("Sal gets one email", salMail.length === 1, mails().map((x) => x.body.to));
  const sm = salMail[0]?.body as { subject: string; text: string; html: string; headers?: Record<string, string> };
  check("its subject leads with the role and says how many more", /^New open role: Fractional VP Sales, at a SaaS company \(\+2 more today\)$/.test(sm?.subject ?? ""), sm?.subject);
  check("the free email shows one greyed card", (sm?.html.match(/#F1F3F2/g) ?? []).length === 2 && /2 more today/.test(sm.html), sm?.html.slice(0, 200));
  check("the card has the size band, industry, region and revenue band", /11–50 people · SaaS · Colorado, US · \$1M–\$5M revenue/.test(sm?.text ?? ""), sm?.text);
  check("the button is See who, to the upgrade link", /See who/.test(sm?.html ?? "") && sm.html.includes(encodeURIComponent("/?upgrade=radar")), sm?.html);
  check("the free email names no company and no person", !named(sm).length, named(sm));
  check("the free email carries no record id", !pubLeaks(sm).length, pubLeaks(sm));
  check("the unsubscribe link is the radar's own, as a header too", /r=radar/.test(sm?.text ?? "") && /r=radar/.test(String(sm?.headers?.["List-Unsubscribe"] ?? "")), sm?.headers);
  check("the email counts opens with a pixel", /\/api\/radar\/open\?m=/.test(sm?.html ?? ""));
  const salPost = radarPosts(SLACK_SAL);
  check("Sal gets one radar post in Slack", salPost.length === 1, outbox.filter((x) => x.url === SLACK_SAL).map((x) => x.raw));
  const sp = salPost[0]?.body as { blocks: { type: string; elements?: { text: { text: string }; url: string }[] }[] };
  const button = sp?.blocks?.find((b) => b.type === "actions")?.elements?.[0];
  check("the Slack post's button is See who", button?.text.text === "See who" && button.url.includes(encodeURIComponent("/?upgrade=radar")), button);
  check("the Slack post names no company, no person, no record", !named(salPost[0]?.raw ?? "").length && !pubLeaks(salPost[0]?.raw ?? "").length, salPost[0]?.raw);
  check("the Slack post says 2 more today", /2 more today/.test(salPost[0]?.raw ?? ""));
  const moMail = mails("mo.marketer@example.com")[0]?.body as { subject: string; html: string; text: string } | undefined;
  check("Mo gets their one card and 1 more", !!moMail && /\(\+1 more today\)/.test(moMail.subject), moMail?.subject);
  check("Mo's email names nothing", !named(moMail).length && !pubLeaks(moMail).length, named(moMail));
  const piaMail = mails("pia.profit@example.com")[0]?.body as { subject: string; html: string } | undefined;
  check("billing off: a member with a Pro record still gets the free view", !!piaMail && /See who/.test(piaMail.html) && !named(piaMail).length, piaMail?.subject);
  check("a member who turned the radar off gets nothing", !mails("otto.off@example.com").length);
  check("no function or no profile: nothing", !mails("nora.none@example.com").length && !mails("ned.noprofile@example.com").length);
  check("the admin, with nothing matching, gets nothing", !mails("ada.admin@example.com").length);
  const sA = await state();
  check("radar_sent is counted once per member delivered", sA.signals.filter((x) => x.name === "radar_sent").length === run1.members && run1.members === 3, run1);
  check("every signal in the ping is marked sent, the counted ones too", Object.keys(sA.radar?.members.mem_sal?.sent ?? {}).length === 3, sA.radar?.members.mem_sal);
  check("Sal's delivery went by email and Slack", sA.signals.some((x) => x.memberId === "mem_sal" && x.name === "radar_sent" && x.where === "email+slack"));

  console.log("\nOnce a day, never twice");
  clear();
  const again = await radar.runRadar({ now: nowIso() });
  check("a second run the same day doesn't run", !again.ran, again);
  const forced = await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  check("Send radar now runs, but a free member still gets one radar a day", forced.ran && !mails().length && !radarPosts(SLACK_SAL).length, { forced, n: mails().length });
  skew += DAY;
  clear();
  const quiet = await radar.runRadar({ now: nowIso() });
  await settle();
  check("the next morning with nothing new sends nothing (no nothing-days)", quiet.ran && quiet.signals === 0 && !mails().length && !radarPosts(SLACK_SAL).length, quiet);
  // A new RevOps hire at Acme comes in (RevOps comes before Sales): only it goes out the morning after.
  await T.mutate((d) => {
    d.engagements.push({ id: "e_acme_ops_new", companyId: "c_acme", by: "mem_mo", at: nowIso() });
    for (const [f, v] of Object.entries({ role: "Fractional Head of RevOps", function: "RevOps", type: "Fractional", start: monthAgo(0), status: "Active", end: "Ongoing" }))
      d.values[`e_acme_ops_new.${f}`] = { value: v, by: "mem_mo", at: nowIso(), status: "live" };
  });
  skew += DAY;
  clear();
  const run3 = await radar.runRadar({ now: nowIso() });
  await settle();
  const sm3 = mails("sal.starter@example.com")[0]?.body as { subject: string; text: string } | undefined;
  check("only the new signal goes out, nothing sent before", !!sm3 && !/more today/.test(sm3.subject) && /just hired a fractional RevOps leader/.test(sm3.subject), { run3, subject: sm3?.subject });
  const sentSal = Object.keys((await state()).radar?.members.mem_sal?.sent ?? {});
  check("no signal was sent to a member twice", sentSal.length === 4 && new Set(sentSal).size === 4, sentSal);

  console.log("\nThe switch and the unsubscribe link");
  const off = await t.perform("tok-sal-0001", { type: "settings", radar: false }, "https://post.example.com");
  check("Your profile turns it off", /radar is off/i.test(off.message) && (await state()).profiles.mem_sal.radarOff === true, off);
  check("radar_off is recorded", (await state()).signals.some((x) => x.memberId === "mem_sal" && x.name === "radar_off" && x.where === "profile"));
  const vOff = await t.buildView("tok-sal-0001");
  check("the view says it's off", vOff.me?.radar === false);
  await t.perform("tok-sal-0001", { type: "settings", radar: true }, "https://post.example.com");
  check("and on again", !(await state()).profiles.mem_sal.radarOff);
  const msig = radar.radarSig("mem_mo");
  check("a link with a wrong signature does nothing", !(await radar.unsubscribeRadar(pub("mem_mo"), "nope")) && !(await radar.unsubscribeRadar("nobody", msig)) && !(await state()).profiles.mem_mo.radarOff);
  check("the radar's link isn't the weekly email's (a different signature)", !(await radar.unsubscribeRadar(pub("mem_mo"), "x".repeat(msig.length))));
  check("the email's link turns the radar off", (await radar.unsubscribeRadar(pub("mem_mo"), msig)) && (await state()).profiles.mem_mo.radarOff === true && !(await state()).profiles.mem_mo.digestOff);
  check("radar_off is recorded from the email", (await state()).signals.some((x) => x.memberId === "mem_mo" && x.name === "radar_off" && x.where === "email"));
  const link = radar.radarUnsubscribeUrl("https://post.example.com", "mem_mo");
  check("the unsubscribe URL is signed and marked", link.startsWith("https://post.example.com/api/table/unsubscribe?m=") && link.endsWith("&r=radar") && link.includes(msig));
  // Mo is off: a new Marketing role tomorrow reaches nobody by email.
  skew += DAY;
  await t.applyScan({ roles: [...found, role("Echo Energy", "Fractional Head of Marketing", "Marketing", "echo.example")], sources: [{ source: "board", fetched: 4, matched: 4 }] }, nowIso());
  await settle();
  skew += 2 * HOUR;
  clear();
  await radar.runRadar({ now: nowIso() });
  await settle();
  check("after unsubscribing, no radar email", !mails("mo.marketer@example.com").length, mails().map((x) => x.body.to));

  console.log("\nTracked links");
  const go = await radar.radarClicked(pub("mem_sal"), radar.radarSig("mem_sal"), "email", "/?upgrade=radar");
  check("a click goes to its path in the app", go === "/?upgrade=radar");
  check("radar_clicked is recorded", (await state()).signals.some((x) => x.memberId === "mem_sal" && x.name === "radar_clicked" && x.where === "email"));
  check("a link never sends anywhere else", (await radar.radarClicked(pub("mem_sal"), radar.radarSig("mem_sal"), "email", "https://evil.example/")) === null && radar.safePath("//evil.example") === null && radar.safePath("/api/table?export=1") === null);
  await radar.radarOpened(pub("mem_sal"), radar.radarSig("mem_sal"));
  await radar.radarOpened(pub("mem_sal"), radar.radarSig("mem_sal"));
  check("an open is counted once a day", (await state()).signals.filter((x) => x.memberId === "mem_sal" && x.name === "radar_opened").length === 1);

  /* ---------- the Radar page ---------- */
  console.log("\nThe Radar page");
  // Back to the first day, so the page's last 24 hours hold the first signals.
  const firstDay = new Date(t0 + 10 * 60_000).toISOString();
  const page = await radar.radarView("tok-sal-0001", firstDay);
  check("the page lists today's signals, free: one card and a count", !!page?.day && !page.day.pro && page.day.cards.length === 1 && page.day.more === 2, page?.day);
  check("the free page names no company or person and carries no record id", !named(page).length && !pubLeaks(page).length, { names: named(page), ids: pubLeaks(page) });
  check("the free card links to the upgrade path", page?.day?.cards[0].url === "/?upgrade=radar" && page.day.seeWho === "/?upgrade=radar");
  check("the page says what it watches", page?.function === "Sales" && page.before.join() === "Marketing,RevOps,Finance" && page.ready && page.on && page.email && page.slack, page);
  const noProfile = await radar.radarView("tok-noicp-0001", firstDay);
  check("a member without a profile is told what it needs", noProfile?.ready === false && noProfile.day === null);
  check("signed out: nothing", (await radar.radarView(null)) === null);

  /* ---------- Pro ---------- */
  console.log("\nPro (billing on)");
  // Billing is live only with the Stripe settings too (lib/plan.ts billingLive). Made-up values: nothing here calls Stripe.
  process.env.RN_BILLING = "1";
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"]) process.env[k] = `test_${k.toLowerCase()}`;
  await T.mutate((d) => {
    (d as unknown as { billing: unknown }).billing = { members: { mem_pro: { proUntil: new Date(t0 + 60 * DAY).toISOString(), interval: "month" } } };
  });
  check("Pia is on Pro, Sal isn't", radar.isPro(await state(), "mem_pro", Date.now()) && !radar.isPro(await state(), "mem_sal", Date.now()));
  const proPage = await radar.radarView("tok-pro-0001", firstDay);
  const proCards = proPage?.day?.cards ?? [];
  check("Pro sees every card", !!proPage?.day?.pro && proCards.length === 2 && proPage.day.more === 0, proPage?.day);
  const fox = proCards.find((c) => c.kind === "adjacent");
  check("a company the member's table shows is named, with its record", fox?.company === "Fox Freight" && fox.headline === "Fox Freight just hired a fractional Sales leader" && fox.url === `/?c=${encodeURIComponent(pub("c_fox"))}`, fox);
  const cfo = proCards.find((c) => c.kind === "role");
  check("a company locked for the member stays unnamed, and the record is where they unlock it", !!cfo?.locked && cfo.company === null && /a company that's hiring now/.test(cfo.headline) && cfo.url === `/?c=${encodeURIComponent(pub("c_beta"))}`, cfo);
  check("Pro never names a hidden company or a person", !named(proPage, NAMES.filter((x) => x !== "Fox Freight")).length, named(proPage));
  const proMail = fmt.renderRadarEmail({ name: "Pia Profit", day: proPage!.day!, unsubscribeUrl: "https://post.example.com/u", appUrl: "https://post.example.com" });
  check("the Pro email lists every card with its record and the lock", (proMail.html.match(/<a href="\/\?c=/g) ?? []).length === 2 && /Locked for you/.test(proMail.html) && /See your radar/.test(proMail.html), proMail.subject);
  check("the Pro email's subject counts them", proMail.subject === "2 new signals on your radar today", proMail.subject);

  console.log("\nPro gets it at once");
  clear();
  const sal0 = radarPosts(SLACK_SAL).length;
  const instantAt = nowIso();
  await t.applyScan({ roles: [...found, role("Echo Energy", "Fractional Head of Marketing", "Marketing", "echo.example"), role("Fox Freight", "Fractional Finance Director", "Finance", "fox.example")], sources: [{ source: "board", fetched: 5, matched: 5 }] }, instantAt);
  await settle();
  await new Promise((r) => setTimeout(r, 100));
  await settle();
  const proPosts = radarPosts(SLACK_PRO);
  check("a scan's new Finance role reaches Pro in Slack in the next batch", proPosts.length === 1 && /New open role: Fractional Finance Director/.test(proPosts[0].raw), outbox.map((x) => `${x.url} ${x.raw.slice(0, 160)}`));
  // Pia unlocked Fox Freight before: a company a member unlocked stays theirs, a new open role there too.
  check("the company of a new open role is named for a member who unlocked it before", /Fox Freight/.test(proPosts[0]?.raw ?? ""), proPosts[0]?.raw);
  check("a free member gets nothing at once", radarPosts(SLACK_SAL).length === sal0);
  check("radar_sent where instant", (await state()).signals.some((x) => x.memberId === "mem_pro" && x.name === "radar_sent" && x.where === "instant"));
  skew += DAY;
  clear();
  await radar.runRadar({ now: nowIso() });
  await settle();
  const piaNext = mails("pia.profit@example.com")[0]?.body as { text: string } | undefined;
  check("the next morning doesn't send Pro the instant signal again", !piaNext || !/Finance Director/.test(piaNext.text), piaNext?.text);
  delete process.env.RN_BILLING;
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"]) delete process.env[k];
  check("billing off again: Pro reads as free", !radar.isPro(await state(), "mem_pro", Date.now()) && !(await radar.radarView("tok-pro-0001", firstDay))?.day?.pro);
  check("billing off: nothing goes out at once", (await radar.radarInstant()) === 0);

  /* ---------- formats ---------- */
  console.log("\nSlack and email formats");
  const card = (i: number, o: Partial<import("../lib/radar/types").RadarCard> = {}) => ({
    id: `id${i}`, kind: "adjacent" as const, headline: `Company ${i} just hired a fractional Marketing leader`, facts: ["51–200 people", "SaaS", "Texas, US"], why: "Marketing usually comes before Sales", company: `Company ${i}`, url: `https://post.example.com/go/${i}`, at: nowIso(), ...o,
  });
  const proDay = { pro: true, cards: Array.from({ length: 7 }, (_, i) => card(i)), more: 0, total: 7, seeWho: "https://post.example.com/r", mode: "daily" as const };
  const a7 = fmt.radarAlert([{ kind: "radar", at: nowIso(), day: proDay }], "https://post.example.com")!;
  check("Pro in Slack: five cards and 'And 2 more', a button to the radar", a7.lines.length === 6 && /And 2 more/.test(a7.lines[5]) && a7.button === "See your radar" && a7.url === "https://post.example.com/r", a7);
  const one = fmt.radarAlert([{ kind: "radar", at: nowIso(), day: { ...proDay, cards: [card(1, { locked: true })], total: 1 } }], "")!;
  check("Pro, one locked card: Unlock in Merlin, to its record", one.button === "Unlock in Merlin" && one.url === "https://post.example.com/go/1", one);
  const merged = fmt.mergeDays([
    { kind: "radar", at: nowIso(), day: { ...proDay, cards: [card(1)], total: 1, mode: "instant" } },
    { kind: "radar", at: nowIso(), day: { ...proDay, cards: [card(1), card(2)], total: 2, mode: "instant" } },
  ]);
  check("two posts in one batch become one, each card once", merged?.cards.length === 2 && merged.mode === "instant", merged);
  const freeDay = { pro: false, cards: [card(1, { company: null, headline: "A SaaS company just hired a fractional Marketing leader" })], more: 4, total: 5, seeWho: "https://post.example.com/up", mode: "daily" as const };
  const fa = nfmt.alertFor([{ kind: "radar", at: nowIso(), day: freeDay }], "https://post.example.com")!;
  const body = nfmt.slackBody(fa) as { text: string; blocks: { type: string; text?: { text: string }; elements?: { text: string | { text: string } }[] }[] };
  check("free in Slack: the card, '4 more today', See who and the radar's footer", /4 more today/.test(JSON.stringify(body)) && /"See who"/.test(JSON.stringify(body)) && /Turn it off in Your profile/.test(JSON.stringify(body)), body);
  check("Slack mrkdwn is escaped", !/<script>/.test(JSON.stringify((nfmt.slackBody({ ...fa, headline: "<script>" }) as { blocks: unknown }).blocks)));
  check("other webhooks get the same words", (nfmt.webhookBody(fa, nowIso()) as { event: string; lines: string[] }).event === "radar");
  const freeMail = fmt.renderRadarEmail({ name: "Sal Starter", day: freeDay, unsubscribeUrl: "https://post.example.com/u", appUrl: "https://post.example.com" });
  check("the free email has no link but See who and unsubscribe", (freeMail.html.match(/<a href=/g) ?? []).length === 2 + 0 && freeMail.html.includes("https://post.example.com/up"), freeMail.html.match(/<a href="[^"]*"/g));
  check("the email is escaped", !/<b>x<\/b>/.test(fmt.renderRadarEmail({ ...{ name: "<b>x</b>", day: freeDay, unsubscribeUrl: "u", appUrl: "" } }).html));

  console.log("\nFunding: the source and its plumbing");
  check("no provider: no events", (await funding.fundingSource().events({ sinceMs: 0, nowMs: Date.now(), companies: [] })).length === 0 && funding.fundingSource().name === "none");
  const stub = { name: "test", events: async () => [{ companyId: "c_acme", at: new Date(Date.now() - HOUR).toISOString(), round: "Series A", amount: "$12M", source: "test" }] };
  const withFunding = sig.detectSignals(seedLoaded, await state(), Date.now() - DAY, Date.now(), await stub.events());
  const f = withFunding.find((x) => x.kind === "funding");
  check("an event from a source becomes a funding signal", !!f && f.round === "Series A");
  const fSal = match.signalsFor(withFunding, match.profileOf(seedLoaded, await state(), "mem_sal", "Sales")).find((x) => x.kind === "funding");
  check("a funding signal reaches every function in the profile", !!fSal);
  const fCard = present.cardOf(fSal!, { pro: false, visible: () => true, recordPath: () => "/x", seeWho: "/?upgrade=radar", cardId: (x) => x });
  check("a free funding card names no company", fCard.headline === "A SaaS company raised a Series A ($12M)" && !named(fCard).length, fCard);
  const failing = { name: "down", events: async () => Promise.reject(new Error("down")) };
  skew += DAY;
  const r5 = await radar.runRadar({ now: nowIso(), funding: failing as unknown as typeof stub });
  check("a source that fails never stops the radar", r5.ran, r5);

  console.log("\nPilot metrics");
  const admin = await t.buildView("tok-ada-0001");
  const rs = admin.admin?.radar;
  check("the radar panel counts members with it on", rs?.on === 2 && rs.off === 2, rs);
  check("and what went out, opens and clicks", (rs?.sent7 ?? 0) >= 4 && rs!.clicks === 1 && rs!.opens7 === 1, rs);
  const st = types.radarStats(undefined, [{ name: "radar_sent", at: nowIso() }, { name: "radar_clicked", at: nowIso() }, { name: "wall", at: nowIso() }], { a: { radarOff: true } }, 3, Date.now());
  check("radarStats counts only radar signals", st.sentToday === 1 && st.clicks === 1 && st.off === 1 && st.on === 3, st);
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
