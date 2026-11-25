/**
 * Checks of the radar (lib/radar; members read it as FEATURE_NAME), without a server, Slack, email or a network.
 *
 *   npx tsx scripts/test-radar.mts
 *
 * Runs on a made-up seed in a temporary data dir. fetch is replaced, so every email (Resend's API)
 * and every Slack post is caught here, and nothing leaves the machine. The clock moves forward
 * where a rule is about days. Covers: each signal type, Ideal Fractional Profile matching, the
 * functions that come before the member's, never the same signal twice, every signal listed for
 * every member with a company named only when the member already knows it (every output is
 * scanned for the names on the seed) and no Pro-only teaser, every link opening the day's
 * companies (/?p=table&sig=<day>), the day's view listing only the member's own companies and
 * unlocking one for 2 credits, instant delivery for Pro, days with nothing skipped, the switch
 * and the email's unsubscribe link, the Slack and email formats, the funding plumbing, the
 * tracked links and the sign-in link that comes back to the day. And coming back: each card opening
 * its own company's record from the day (free on Trial and Pro, "Open free (today's)" on Free's first
 * card only), every email link signing the member in once (lib/emailIn.ts: spent, expired, forged,
 * moved or rotated links refused), how often the email comes (daily, twice a week, weekly roll-ups),
 * no email or post on a day with nothing new, Slack apart from the email, and the unsubscribe
 * link's Send it weekly instead and Turn it off (the email only). And follow-ups due in Your pipeline
 * (lib/pipelineActions.ts followUpsOf): above the companies, at most 3 and "And N more", each linking
 * to the company's record signed in, a locked company and a person from the member's Google account
 * never named, never a note; a day with follow-ups due and no new company (or no profile) still sends
 * the email, about them alone, once: the same follow-ups don't send another, a newly due one does;
 * never in Slack.
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
    // $1M–$5M: a fractional Marketing hire then Sales is one of the research's rules there (Crystal Ball, lib/radar/predict.ts rule 5).
    { id: "c_acme", fields: { name: "Acme Robotics", website: "acme.example", industry: "SaaS", employees: "51–200", revenue: "$1M–$5M", hq: "Austin, TX" } },
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
      // Pia's own answer: Sales comes before Finance. It boosts that pair (it no longer decides who gets a hire).
      mem_pro: { function: "Finance", onboarded: true, icp: US_MID, before: ["Sales"] },
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
  /**
   * An email's words with each tracked link's destination taken out. Since each card opens its own
   * company's record (radarOpenPath), the company's public id is inside that link's to=, and only there.
   */
  const outsideLinks = (x: unknown) => (typeof x === "string" ? x : JSON.stringify(x)).replace(/(\/api\/radar\/go\?[^"\s\\]*?)to=[^"&\s\\]*/g, "$1to=");
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
  /** A member's radar record in a draft state, made when missing. */
  const radarMember = (d: Awaited<ReturnType<typeof state>>, id: string) => {
    d.radar ??= types.emptyRadar();
    return (d.radar.members[id] ??= { sent: {} });
  };

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
  const proSigs = match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_pro", "Finance"));
  const forPro = proSigs.map((x) => x.key);
  check(
    "Finance gets the Finance role first, then the Sales hire her own answer boosts, then the weaker hires",
    forPro[0] === all.find((x) => x.kind === "role" && x.fn === "Finance")!.key && forPro[1] === k("hire", "e_fox_sales") && proSigs[1].band === "Medium" && proSigs.slice(2).every((x) => x.band === "Low"),
    proSigs.map((x) => [x.key, x.band, x.score.toFixed(3)]),
  );
  const moSigs = match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_mo", "Marketing"));
  const forMo = moSigs.map((x) => x.key);
  check("Marketing in a SaaS profile gets the Marketing role and the Sales hire, the hire as Low", forMo.length === 2 && forMo.includes(k("hire", "e_fox_sales")) && moSigs[1].band === "Low", moSigs.map((x) => [x.key, x.band]));
  const salSigs = match.signalsFor(all, pSal);
  check("each signal has a band and a why-now line", salSigs.every((x) => ["High", "Medium", "Low"].includes(x.band) && x.whyNow.length > 10 && !/%/.test(x.whyNow)), salSigs.map((x) => [x.band, x.whyNow]));
  check(
    "the Marketing hire's why-now names the hire and when, never a predicted window",
    /^Fractional CMO hired (this month|1 month ago) · Sales usually follows$/.test(salSigs.find((x) => x.key === k("hire", "e_acme_mkt"))?.whyNow ?? ""),
    salSigs.map((x) => x.whyNow),
  );
  check("a member with no function gets nothing", !match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_nofn", null)).length);
  check("a member with no profile gets nothing", !match.signalsFor(all, match.profileOf(seedLoaded, s1, "mem_noicp", "Sales")).length);
  // [ux ws3] The page asks for any company (RadarProfile.any): every company counts, at the profile's lowest fit, and the reason never says "in your profile".
  const anyP = { ...match.profileOf(seedLoaded, s1, "mem_noicp", "Sales"), any: true };
  const anySigs = match.signalsFor(all, anyP);
  check("read as any company, a member with no profile gets signals", anySigs.length > 0, anySigs.length);
  check("their reasons never say 'in your profile'", anySigs.every((x) => !/in your profile/i.test(x.why)), anySigs.map((x) => x.why));
  check("any company never reaches past a profile that matches", anySigs.every((x) => x.score <= match.ROLE_P * match.FIT_BASE + 1e-9 || x.kind !== "role"), anySigs.map((x) => [x.kind, x.score]));
  check("any is ignored once a profile is set", match.anyCompany({ any: true, icp: { industries: ["Software"], employees: [], revenue: [], countries: [] } }) === false && match.anyCompany({ any: true, icp: null }) === true && match.anyCompany({ icp: null }) === false);

  /* ---------- the morning run: every member gets every signal ---------- */
  console.log("\nThe morning run (billing off: nobody is on Pro, and nothing is held back)");
  check("billing is off", !plan.billingOn());
  const day0 = nowIso().slice(0, 10);
  const dayPath = types.radarPath(day0);
  check("the day's link is the Companies list with the day", dayPath === `/?p=table&sig=${day0}`, dayPath);
  check("the click link's rule lets it through", radar.safePath(dayPath) === dayPath);
  const run1 = await radar.runRadar({ now: nowIso() });
  await settle();
  check("the run went out", run1.ran && run1.signals >= 7, run1);
  const salMail = mails("sal.starter@example.com");
  check("Sal gets one email", salMail.length === 1, mails().map((x) => x.body.to));
  const sm = salMail[0]?.body as { subject: string; text: string; html: string; headers?: Record<string, string> };
  check("its subject names the feature and counts the companies", sm?.subject === `${types.YOUR_FEATURE}: 2 companies leaning your way`, sm?.subject);
  check("the email's headline counts them, with the date and the count by kind", (sm?.html ?? "").includes(">2 companies are leaning your way today</h1>") && /2 new since yesterday/.test(sm?.html ?? "") && (sm?.text ?? "").includes(`${fmt.dayWords(day0)} · 2 new since yesterday`), sm?.text.slice(0, 200));
  check(
    "every signal of the day is listed, each anonymous, by its label and what happened",
    /Open role · High likelihood\nA SaaS company in Colorado\nNew open role: Fractional VP Sales\n/.test(sm?.text ?? "") && /Fractional seat ended · \w+ likelihood\nA SaaS company in Colorado\nA fractional Sales seat just ended\n/.test(sm.text) && /Hired a fractional · \w+ likelihood\nA SaaS company in \w+\nJust hired a fractional Marketing leader\n/.test(sm.text),
    sm?.text,
  );
  check("a card has the facts the company line doesn't say (size band, revenue band)", /A SaaS company in Colorado\n[^\n]+\n[^\n]+\n11–50 people · \$1M–\$5M revenue\n/.test(sm?.text ?? ""), sm?.text);
  check("how a locked company unlocks is said once, at the top (2 credits)", (sm?.text.match(/unlocks in Merlin for 2 credits/g) ?? []).length === 1 && (sm?.html.match(/unlocks in Merlin for 2 credits/g) ?? []).length === 1, sm?.text);
  check("each card has its icon: an absolute PNG on the site's public path, its size and alt text", (() => {
    const imgs = sm?.html.match(/<img [^>]*>/g) ?? [];
    const icons = imgs.filter((x) => x.includes("/email/crystal-ball/icon-"));
    return icons.length === 4 && icons.every((x) => /src="https:\/\/post\.example\.com\/email\/crystal-ball\/icon-[a-z]+@2x\.png\?v=\d+"/.test(x) && /width="\d+" height="\d+"/.test(x) && /alt=""/.test(x));
  })(), sm?.html.match(/<img [^>]*>/g));
  const salLinks = (sm?.html.match(/<a href="[^"]*"/g) ?? []).filter((x) => x.includes("/api/radar/go"));
  // Changed: each card used to open the day's list. Now each card opens its own company's record from that day
  // (where the plan's free open is ready), and only the button under the cards opens the day's list.
  const cardPath = (co: string) => encodeURIComponent(types.radarOpenPath(day0, pub(co)));
  check(
    "each card opens its own company from the day, the button the day's companies (tracked)",
    salLinks.length === 4 &&
      salLinks.filter((x) => x.includes(cardPath("c_beta"))).length === 2 &&
      salLinks.filter((x) => x.includes(cardPath("c_acme"))).length === 1 &&
      salLinks.filter((x) => x.includes(`to=${encodeURIComponent(dayPath)}"`)).length === 1,
    salLinks,
  );
  check("every link in it signs Sal in once (an expiry and a grant)", salLinks.every((x) => /&amp;x=[0-9a-z]+&amp;t=[A-Za-z0-9_-]{27}&amp;to=/.test(x)), salLinks);
  check("the button under the cards names them all", /See both companies/.test(sm?.html ?? "") && /See both companies/.test(sm.text));
  check("billing off: each card says Open in Merlin, never Open free", (sm?.text.match(/^Open in Merlin: /gm) ?? []).length === 3 && !/Open free/.test(sm?.text ?? ""), sm?.text);
  check("the footer links to Notifications, signed in", /\nNotifications\nhttps:\/\/post\.example\.com\/api\/go\?m=[^\n]+&to=%2F%3Fp%3Dnotifications\n/.test(sm?.text ?? "") && />Notifications<\/a>/.test(sm?.html ?? "") && /Choose how often in Notifications/.test(sm?.text ?? ""), sm?.text.slice(-700));
  check("no Pro-only teaser: no See who, no count of the rest, no Pro", !/See who|more today|comes with Pro|isn.t open yet|upgrade=radar/i.test(JSON.stringify(sm)), sm?.text);
  check("the email names no company and no person", !named(sm).length, named(sm));
  check("the email carries a record id only inside a card's link", !pubLeaks(outsideLinks(sm)).length && pubLeaks(sm).every((p) => p === pub("c_beta") || p === pub("c_acme")), { out: pubLeaks(outsideLinks(sm)), all: pubLeaks(sm) });
  check("the unsubscribe link is the radar's own, as a header too", /r=radar/.test(sm?.text ?? "") && /r=radar/.test(String(sm?.headers?.["List-Unsubscribe"] ?? "")), sm?.headers);
  check("its words are the feature's", sm?.html.includes(`Unsubscribe from ${types.FEATURE_NAME} emails`) && sm.text.includes(`To stop the ${types.FEATURE_NAME} emails`));
  check("the email counts opens with a pixel", /\/api\/radar\/open\?m=/.test(sm?.html ?? ""));
  const salPost = radarPosts(SLACK_SAL);
  check("Sal gets one post in Slack", salPost.length === 1, outbox.filter((x) => x.url === SLACK_SAL).map((x) => x.raw));
  const sp = salPost[0]?.body as { blocks: { type: string; elements?: { text: { text: string }; url: string; action_id?: string }[] }[] };
  const button = sp?.blocks?.flatMap((b) => (b.type === "actions" ? b.elements ?? [] : [])).find((e) => e.action_id === "open");
  check("the Slack post's button opens the day's companies", button?.text.text === "See the 2 companies" && button.url.includes(encodeURIComponent(dayPath)), button);
  check("the Slack post names the feature and lists all three", (salPost[0]?.raw ?? "").includes(`${types.YOUR_FEATURE} · 2 companies moved`) && /Fractional VP Sales/.test(salPost[0].raw) && /seat just ended/.test(salPost[0].raw) && /Marketing leader/.test(salPost[0].raw), salPost[0]?.raw);
  check("the Slack post names no company, no person, no record", !named(salPost[0]?.raw ?? "").length && !pubLeaks(salPost[0]?.raw ?? "").length, salPost[0]?.raw);
  check("and no teaser", !/See who|more today/.test(salPost[0]?.raw ?? ""));
  const moMail = mails("mo.marketer@example.com")[0]?.body as { subject: string; html: string; text: string } | undefined;
  check(
    "Mo's email has his Marketing role, and not the Low Sales hire (it stays on the page)",
    !!moMail && moMail.subject === `${types.YOUR_FEATURE}: 1 company leaning your way` && /Fractional Head of Marketing/.test(moMail.text) && !/fractional Sales leader/.test(moMail.text),
    moMail?.subject,
  );
  check("a Low signal is never marked sent", !Object.keys((await state()).radar?.members.mem_mo?.sent ?? {}).includes(k("hire", "e_fox_sales")));
  check("but the day's companies keep it", ((await state()).radar?.members.mem_mo?.days?.[day0] ?? []).some((x) => x.k === k("hire", "e_fox_sales") && x.b === "Low"));
  check(
    "the email shows each card's band as a chip and its reason, split from the why-now",
    /Open role · High likelihood\n[^\n]+\n[^\n]+\nA direct opening in Sales\.\n/.test(sm?.text ?? "") && /Marketing leader\n(Sales|RevOps|\w+)[^\n]* usually follows\.\n/.test(sm?.text ?? "") && !/usually follows (in|within) \d/.test(sm?.text ?? "") && />High<span class="cb-wide"> likelihood<\/span><\/td>/.test(sm?.html ?? "") && !/Open now/.test(sm?.text ?? ""),
    sm?.text,
  );
  check("Mo's email names nothing", !named(moMail).length && !pubLeaks(outsideLinks(moMail)).length, { named: named(moMail), ids: pubLeaks(outsideLinks(moMail)) });
  const piaMail = mails("pia.profit@example.com")[0]?.body as { subject: string; html: string; text: string } | undefined;
  check("a company the member already unlocked is named, with nothing to unlock", !!piaMail && /Hired a fractional · \w+ likelihood\nFox Freight\nJust hired a fractional Sales leader\n/.test(piaMail.text) && (piaMail.text.match(/unlocks in Merlin/g) ?? []).length === 1, piaMail?.text);
  check("Pia's email names no company she can't see", !named(piaMail, NAMES.filter((x) => x !== "Fox Freight")).length, named(piaMail));
  check("a member who turned it off gets nothing", !mails("otto.off@example.com").length);
  check("no function or no profile: nothing", !mails("nora.none@example.com").length && !mails("ned.noprofile@example.com").length);
  check("the admin, with nothing matching, gets nothing", !mails("ada.admin@example.com").length);
  const sA = await state();
  check("radar_sent is counted once per member delivered", sA.signals.filter((x) => x.name === "radar_sent").length === run1.members && run1.members === 3, run1);
  check("every signal in the email is marked sent", Object.keys(sA.radar?.members.mem_sal?.sent ?? {}).length === 3, sA.radar?.members.mem_sal);
  check("the day's companies are kept with the delivery", sA.radar?.members.mem_sal?.days?.[day0]?.length === 3 && new Set(sA.radar.members.mem_sal.days[day0].map((x) => x.c)).size === 2, sA.radar?.members.mem_sal?.days);
  check("Sal's delivery went by email and Slack", sA.signals.some((x) => x.memberId === "mem_sal" && x.name === "radar_sent" && x.where === "email+slack"));

  console.log("\nOnce a day, never twice");
  clear();
  const again = await radar.runRadar({ now: nowIso() });
  check("a second run the same day doesn't run", !again.ran, again);
  const forced = await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  check("Send now runs, but a member not on Pro still gets one a day", forced.ran && !mails().length && !radarPosts(SLACK_SAL).length, { forced, n: mails().length });
  skew += DAY;
  clear();
  const quiet = await radar.runRadar({ now: nowIso() });
  await settle();
  // Nothing new happened. Changed: a day with only what is still true (Echo's fractional Sales seat, 12 to 24 months in) used to
  // go out as "1 company still worth a look". Now an email (or a post) with no new company is skipped, and the page still lists it.
  const quietDayIso = nowIso().slice(0, 10);
  check("the next morning with nothing new: no email and no Slack post", quiet.ran && quiet.signals === 0 && !mails().length && !radarPosts(SLACK_SAL).length, { quiet, n: mails().length });
  check(
    "the standing state is not marked sent, but the day's view keeps it",
    !(await state()).radar?.members.mem_sal?.sent[`still:tenure:${pub("e_echo_sales")}`] && !(await state()).radar?.members.mem_sal?.shown?.c_echo && ((await state()).radar?.members.mem_sal?.days?.[quietDayIso] ?? []).some((x) => x.c === "c_echo"),
    (await state()).radar?.members.mem_sal,
  );
  check("and the page lists it that day", ((await radar.radarView("tok-sal-0001", quietDayIso, nowIso()))?.rows ?? []).some((x) => x.id === pub("c_echo")));
  // A new RevOps hire at Acme comes in (RevOps comes before Sales): only it goes out the morning after.
  await T.mutate((d) => {
    d.engagements.push({ id: "e_acme_ops_new", companyId: "c_acme", by: "mem_mo", at: nowIso() });
    for (const [f, v] of Object.entries({ role: "Fractional Head of Growth", function: "Growth", type: "Fractional", start: monthAgo(4), status: "Active", end: "Ongoing" }))
      d.values[`e_acme_ops_new.${f}`] = { value: v, by: "mem_mo", at: nowIso(), status: "live" };
  });
  skew += DAY;
  clear();
  const day2 = nowIso().slice(0, 10);
  const run3 = await radar.runRadar({ now: nowIso() });
  await settle();
  const sm3 = mails("sal.starter@example.com")[0]?.body as { subject: string; text: string } | undefined;
  // Changed: the standing state the quiet day kept (not sent) now fills this day beside the new hire, so it reads 2 companies.
  check(
    "only the new signal and the standing state go out, nothing sent before",
    !!sm3 && sm3.subject === `${types.YOUR_FEATURE}: 2 companies leaning your way` && /Hired a fractional Growth leader in \w{3} \d{4} · newly added to Merlin/.test(sm3.text) && /\nSTILL A GOOD TIME\n/.test(sm3.text) && !/Fractional VP Sales/.test(sm3.text) && /See both companies/.test(sm3.text),
    { run3, subject: sm3?.subject, text: sm3?.text.slice(0, 900) },
  );
  check("its link opens that day", !!sm3 && sm3.text.includes(encodeURIComponent(types.radarPath(day2))));
  const sentSal = Object.keys((await state()).radar?.members.mem_sal?.sent ?? {});
  check("no signal was sent to a member twice", sentSal.length === 5 && new Set(sentSal).size === 5, sentSal);

  console.log("\nThe switch and the unsubscribe link");
  const off = await t.perform("tok-sal-0001", { type: "settings", radar: false }, "https://post.example.com");
  check("Your profile turns it off", off.message.startsWith(`${types.YOUR_FEATURE} is off`) && (await state()).profiles.mem_sal.radarOff === true, off);
  check("radar_off is recorded", (await state()).signals.some((x) => x.memberId === "mem_sal" && x.name === "radar_off" && x.where === "profile"));
  const vOff = await t.buildView("tok-sal-0001");
  check("the view says it's off", vOff.me?.radar === false);
  const on = await t.perform("tok-sal-0001", { type: "settings", radar: true }, "https://post.example.com");
  check("and on again", !(await state()).profiles.mem_sal.radarOff && on.message.startsWith(`${types.YOUR_FEATURE} is on`), on);
  const msig = radar.radarSig("mem_mo");
  check("a link with a wrong signature does nothing", !(await radar.unsubscribeRadar(pub("mem_mo"), "nope")) && !(await radar.unsubscribeRadar("nobody", msig)) && !(await state()).profiles.mem_mo.radarOff);
  check("the radar's link isn't the weekly email's (a different signature)", !(await radar.unsubscribeRadar(pub("mem_mo"), "x".repeat(msig.length))));
  // Changed: the email's link used to turn Crystal Ball off by email and Slack, for good. Now it turns the email off and leaves Slack on.
  check(
    "the email's link turns the email off, not Slack",
    (await radar.unsubscribeRadar(pub("mem_mo"), msig)) && (await state()).profiles.mem_mo.radarEmail === "off" && !(await state()).profiles.mem_mo.radarSlackOff && !(await state()).profiles.mem_mo.radarOff && !(await state()).profiles.mem_mo.digestOff,
    (await state()).profiles.mem_mo,
  );
  check("the view says the email is off and Slack on", ((v) => v.me?.radarEmail === "off" && v.me.radarSlack === true && v.me.radar === true)(await t.buildView("tok-mo-0001")));
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
  const go = await radar.radarClicked(pub("mem_sal"), radar.radarSig("mem_sal"), "email", dayPath);
  check("a click goes to the day's companies", go === dayPath, go);
  check("an older email's link still goes where it went", (await radar.radarClicked(pub("mem_sal"), radar.radarSig("mem_sal"), "email", "/?upgrade=radar")) === "/?upgrade=radar");
  check("radar_clicked is recorded", (await state()).signals.some((x) => x.memberId === "mem_sal" && x.name === "radar_clicked" && x.where === "email"));
  check("a link never sends anywhere else", (await radar.radarClicked(pub("mem_sal"), radar.radarSig("mem_sal"), "email", "https://evil.example/")) === null && radar.safePath("//evil.example") === null && radar.safePath("/api/table?export=1") === null);
  await radar.radarOpened(pub("mem_sal"), radar.radarSig("mem_sal"));
  await radar.radarOpened(pub("mem_sal"), radar.radarSig("mem_sal"));
  check("an open is counted once a day", (await state()).signals.filter((x) => x.memberId === "mem_sal" && x.name === "radar_opened").length === 1);
  check("a sign-in link comes back to the day", radar.returnQuery(dayPath) === `&p=table&sig=${day0}` && radar.returnQuery("/?k=abc&sig=2026-01-02&ref=x") === "&sig=2026-01-02");
  check("and nowhere else", radar.returnQuery("https://evil.example/?sig=1") === "" && radar.returnQuery("//evil.example") === "" && radar.returnQuery("/") === "" && radar.returnQuery(undefined) === "");

  /* ---------- the day's companies in the app ---------- */
  console.log("\nThe day's companies (the page the links open)");
  const page = await radar.radarView("tok-sal-0001", day0, nowIso());
  const ids = (page?.rows ?? []).map((x) => x.id);
  check("the email's day lists exactly the companies the email named, open role first", ids.join() === [pub("c_beta"), pub("c_acme")].join(), { ids, want: [pub("c_beta"), pub("c_acme")] });
  check("every one of its signals is a line", (page?.rows[0]?.lines.length ?? 0) === 2 && page?.rows[1]?.lines.length === 1, page?.rows);
  check("a line says what happened and why", page?.rows[1]?.lines[0] === "Just hired a fractional Marketing leader · Marketing usually comes before Sales. No fractional Sales leader on Merlin. We haven't checked their team page yet", page?.rows[1]?.lines);
  check("the view names no company and no person", !named(page).length, named(page));
  check("and carries only the public ids of the member's own signal companies", pubLeaks(page).every((x) => x === pub("c_beta") || x === pub("c_acme")), pubLeaks(page));
  check("the days: the last 7, today first, each with its companies", page?.days.length === 7 && page.days[0].day === page.today && page.days.find((d) => d.day === day0)?.companies === 2 && page.days.find((d) => d.day === day2)?.companies === 2, page?.days);
  check("the page says what it watches", page?.function === "Sales" && page.before.join() === "Marketing,RevOps,Finance" && page.ready && page.on && page.email && page.slack, page);
  const latest = await radar.radarView("tok-sal-0001", null, nowIso());
  check("no day asked: the latest day with something in it", latest?.day === day2 && latest.rows.map((x) => x.id).sort().join() === [pub("c_acme"), pub("c_echo")].sort().join(), { day: latest?.day, rows: latest?.rows.map((x) => x.id) });
  const old = await radar.radarView("tok-sal-0001", "2020-01-01", nowIso());
  check("a day older than what is kept: the latest, and it says so", !!old?.expired && old.day === day2, old);
  check("a day that isn't one: the same", !!(await radar.radarView("tok-sal-0001", "../../x", nowIso()))?.expired);
  const moPage = await radar.radarView("tok-mo-0001", day0, nowIso());
  check("another member's link with the same day lists only their own companies", (moPage?.rows ?? []).every((x) => x.id !== pub("c_beta")) && (moPage?.rows.length ?? 0) === 2, moPage?.rows);
  const ottoPage = await radar.radarView("tok-off-0001", day0, nowIso());
  check("a member nothing went out to still sees the signals of each day", (ottoPage?.days ?? []).some((d) => d.companies > 0) && named(ottoPage).length === 0, ottoPage?.days);
  const noProfile = await radar.radarView("tok-noicp-0001", day0, nowIso());
  // [ux ws3] Skipping the profile never switches Crystal Ball off: a function and no profile lists any company.
  check("a member with a function and no profile sees Crystal Ball, at any company", noProfile?.ready === true && !!noProfile.anyCompany && noProfile.function === "Sales" && (noProfile.days ?? []).some((d) => d.companies > 0), noProfile);
  check("any company lists at most the day's 20 most likely companies", (noProfile?.days ?? []).every((d) => d.companies <= radar.ANY_COMPANY_MAX) && (noProfile?.rows.length ?? 0) <= radar.ANY_COMPANY_MAX, noProfile?.days);
  check("and no line of theirs says 'in your profile'", (noProfile?.rows ?? []).every((x) => x.lines.every((l) => !/in your profile/i.test(l))), noProfile?.rows);
  check("and the view names no company and no person", !named(noProfile).length, named(noProfile));
  check("a member with a profile is not 'any company'", page?.anyCompany === undefined);
  const noFn = await radar.radarView("tok-nofn-0001", day0, nowIso());
  check("a member with no function is told what it needs", noFn?.ready === false && noFn.rows.length === 0 && !noFn.anyCompany, noFn);
  check("signed out: nothing", (await radar.radarView(null)) === null);
  // Unlock from the view: the same unlock as anywhere, 2 credits, and the company is named for them from then on.
  const before = (await t.buildView("tok-sal-0001")).me!.credits;
  const un = await t.perform("tok-sal-0001", { type: "unlock", entity: "company", id: page!.rows[0].id, field: "identity" }, "https://post.example.com");
  const after = (await t.buildView("tok-sal-0001")).me!.credits;
  // (The first company of a member's day is free, so this one is: the next would be 2 credits.)
  check("unlocking a company from the view is the same unlock: today's free company, then 2 credits", before - after === 0 && /free company today/.test(un.message), { before, after, message: un.message });
  const betaNow = (await t.buildView("tok-sal-0001")).companies.find((x) => x.id === page!.rows[0].id);
  check("and the table names it now", !!betaNow && !betaNow.hidden && betaNow.name === "Beta Labs", betaNow?.name);
  check("the day still lists it, unnamed in its lines", (await radar.radarView("tok-sal-0001", day0, nowIso()))?.rows[0]?.id === pub("c_beta") && !named((await radar.radarView("tok-sal-0001", day0, nowIso()))?.rows).length);

  /* ---------- Pro ---------- */
  console.log("\nPro (billing on): the same signals, at once");
  // Billing is live only with the Stripe settings too (lib/plan.ts billingLive). Made-up values: nothing here calls Stripe.
  process.env.RN_BILLING = "1";
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"]) process.env[k] = `test_${k.toLowerCase()}`;
  await T.mutate((d) => {
    (d as unknown as { billing: unknown }).billing = { members: { mem_pro: { proUntil: new Date(t0 + 60 * DAY).toISOString(), interval: "month" } } };
  });
  check("Pia is on Pro, Sal isn't", radar.isPro(await state(), "mem_pro", Date.now()) && !radar.isPro(await state(), "mem_sal", Date.now()));
  const piaFree = await radar.radarView("tok-pro-0001", day0, nowIso());
  const salPro = await radar.radarView("tok-sal-0001", day0, nowIso());
  check("Pro and Free see the same day the same way", piaFree?.rows.length === 4 && piaFree.rows.slice(2).every((x) => x.band === "Low") && salPro?.rows.length === 2 && !("pro" in (piaFree as object)), { pia: piaFree?.rows, sal: salPro?.rows });
  const piaTable = await t.buildView("tok-pro-0001");
  check(
    "on Pro every company on the day is open in the table, named there (open data on paid plans); Free sees no name",
    !!piaFree?.rows.length && piaFree.rows.every((x) => piaTable.companies.find((c) => c.id === x.id)?.hidden !== true) && !salPro?.rows.some((x) => x.name),
    piaFree?.rows,
  );

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
  check("its button opens that day's companies", (proPosts[0]?.raw ?? "").includes(encodeURIComponent(types.radarPath(instantAt.slice(0, 10)))), proPosts[0]?.raw);
  // In Slack: a known company is its own block, named in bold and linked to its record (tracked), its logo on the right, Open.
  type Blk = { type: string; text?: { text: string }; fields?: { text: string }[]; accessory?: { type: string; image_url: string }; elements?: { text: { text: string }; url: string; action_id?: string }[] };
  const proBlocks = ((proPosts[0]?.body as { blocks?: Blk[] })?.blocks ?? []) as Blk[];
  const foxAt = proBlocks.findIndex((b) => b.type === "section" && /Fox Freight/.test(b.text?.text ?? ""));
  const fox = proBlocks[foxAt];
  const foxButton = proBlocks.slice(foxAt + 1).find((b) => b.type === "actions")?.elements?.[0];
  check(
    "a known company in Slack: bold name linked to its record, the signal under it, its band as a field",
    !!fox && (fox.text?.text ?? "").startsWith("*<https://post.example.com/api/radar/go?") && (fox.text?.text ?? "").includes(encodeURIComponent(`/?c=${pub("c_fox")}`)) && (fox.text?.text ?? "").includes("|Fox Freight>*\nNew open role: Fractional Finance Director") && (fox.fields ?? []).some((f) => /^\*Likelihood\*\n(High|Medium)$/.test(f.text)),
    fox,
  );
  check("its logo is our own /api/logo/<its public id>, never an icon service and never its domain", fox?.accessory?.type === "image" && fox.accessory.image_url === `https://post.example.com/api/logo/${pub("c_fox")}` && !/google|duckduckgo|fox\.example/.test(fox.accessory.image_url), fox?.accessory);
  check("its own button says Open and opens its record", foxButton?.text.text === "Open" && foxButton.url.includes(encodeURIComponent(`/?c=${pub("c_fox")}`)), foxButton);
  const otherSections = proBlocks.filter((b, i) => b.type === "section" && i !== foxAt);
  check("a company Pia's table keeps locked gets no logo in Slack", otherSections.every((b) => !b.accessory), otherSections);
  check("a member not on Pro gets nothing at once", radarPosts(SLACK_SAL).length === sal0);
  check("radar_sent where instant", (await state()).signals.some((x) => x.memberId === "mem_pro" && x.name === "radar_sent" && x.where === "instant"));
  check("the instant signal is in that day's companies", (await radar.radarView("tok-pro-0001", instantAt.slice(0, 10), nowIso()))?.rows.some((x) => x.id === pub("c_fox")));
  skew += DAY;
  clear();
  await radar.runRadar({ now: nowIso() });
  await settle();
  const piaNext = mails("pia.profit@example.com")[0]?.body as { text: string } | undefined;
  check("the next morning doesn't send Pro the instant signal again", !piaNext || !/Finance Director/.test(piaNext.text), piaNext?.text);
  delete process.env.RN_BILLING;
  for (const k of ["STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"]) delete process.env[k];
  check("billing off again: Pro reads as free", !radar.isPro(await state(), "mem_pro", Date.now()));
  check("billing off: nothing goes out at once", (await radar.radarInstant()) === 0);

  /* ---------- formats ---------- */
  console.log("\nSlack and email formats");
  const VIEW = "https://post.example.com/day";
  const card = (i: number, o: Partial<import("../lib/radar/types").RadarCard> = {}) => ({
    id: `id${i}`, co: `co${i}`, kind: "adjacent" as const, headline: `A SaaS company just hired a fractional Marketing leader ${i}`, facts: ["51–200 people", "SaaS", "Texas, US"], why: "Marketing usually comes before Sales", company: null, locked: true, url: VIEW, at: nowIso(), ...o,
  });
  const dayOf = (cards: ReturnType<typeof card>[], mode: "daily" | "instant" = "daily") => ({ cards, total: cards.length, companies: new Set(cards.map((c) => c.co)).size, day: day0, url: VIEW, mode });
  const a7 = fmt.radarAlert([{ kind: "radar", at: nowIso(), day: dayOf(Array.from({ length: 7 }, (_, i) => card(i))) }], "https://post.example.com")!;
  check("Slack: five cards and 'And 2 more', a button to the day's companies", a7.lines.length === 6 && /And 2 more signals/.test(a7.lines[5]) && a7.button === "See the 7 companies" && a7.url === VIEW, a7);
  check("Slack's headline names the feature", a7.headline === `${types.YOUR_FEATURE} · 7 companies moved`, a7.headline);
  const one = fmt.radarAlert([{ kind: "radar", at: nowIso(), day: dayOf([card(1)]) }], "")!;
  check("one card: See the company, to the day", one.button === "See the company" && one.url === VIEW && one.headline === `${types.YOUR_FEATURE} · 1 company moved`, one);
  const merged = fmt.mergeDays([
    { kind: "radar", at: nowIso(), day: dayOf([card(1)], "instant") },
    { kind: "radar", at: nowIso(), day: dayOf([card(1), card(2, { co: "co1" })], "instant") },
  ]);
  check("two posts in one batch become one, each card once, companies counted once", merged?.cards.length === 2 && merged.companies === 1 && merged.mode === "instant", merged);
  const fa = nfmt.alertFor([{ kind: "radar", at: nowIso(), day: dayOf([card(1), card(2)]) }], "https://post.example.com")!;
  const body = nfmt.slackBody(fa) as { text: string; blocks: unknown[] };
  check("in Slack: every card, the button and the feature's footer", /See the 2 companies/.test(JSON.stringify(body)) && JSON.stringify(body).includes(fmt.RADAR_FOOTER) && !/See who|more today/.test(JSON.stringify(body)), body);
  check("Slack mrkdwn is escaped", !/<script>/.test(JSON.stringify((nfmt.slackBody({ ...fa, headline: "<script>" }) as { blocks: unknown }).blocks)));
  check("other webhooks get the same words", (nfmt.webhookBody(fa, nowIso()) as { event: string; lines: string[] }).event === "radar");

  /* ---------- Slack's Block Kit: one company a block, inside the limits ---------- */
  console.log("\nSlack Block Kit");
  type B = import("./blockkit.mts").Block;
  const { blockKitProblems, sectionsOf } = await import("./blockkit.mts");
  check(
    "the Block Kit check itself catches a bad post",
    blockKitProblems({ text: "", blocks: [{ type: "image" }, { type: "header", text: { type: "plain_text", text: "x".repeat(151) } }, { type: "section", fields: Array.from({ length: 11 }, () => ({ type: "mrkdwn", text: "x" })) }] }).length === 4,
  );
  const BASE_URL = "https://post.example.com";
  const namedCard = (i: number, o: Partial<import("../lib/radar/types").RadarCard> = {}) =>
    card(i, {
      company: `Named Co ${i}`, locked: undefined, known: true, subject: `Named Co ${i}`, signal: "No longer lists a Sales leader", headline: `Named Co ${i} no longer lists a Sales leader`,
      band: "High", whyNow: "CRO gone from its website · interim or fractional cover usually follows within 2 months", why: "Their Sales seat may need cover, at a company in your profile",
      about: { industry: "SaaS", size: "51–200 people", hq: "Texas, US" }, place: `/?c=c_named${i}`, logo: `https://post.example.com/api/logo/c_named${i}`, ...o,
    });
  // A locked card that somehow carries a name, a record and a logo: none of them may reach Slack.
  const lockedLeaky = card(9, { subject: "A SaaS company", signal: "No longer lists a Sales leader", band: "Medium", whyNow: "CRO gone from its website · cover usually follows within 2 months", about: { industry: "SaaS", size: "11–50 people" }, company: "Secret Sauce Inc", place: "/?c=c_secret", logo: "https://post.example.com/api/logo/c_secret" });
  const mixed = nfmt.alertFor([{ kind: "radar", at: nowIso(), day: dayOf([namedCard(1), lockedLeaky, namedCard(2, { known: undefined, logo: undefined }), ...Array.from({ length: 5 }, (_, i) => card(20 + i))]) }], BASE_URL)!;
  const mb = nfmt.slackBody(mixed) as unknown as { text: string; blocks: B[] };
  check("the Crystal Ball post is valid Block Kit, inside every limit", blockKitProblems(mb).length === 0, blockKitProblems(mb));
  check("it opens with a header: the feature and how many companies moved", mb.blocks[0]?.type === "header" && mb.blocks[0].text?.text === `${types.YOUR_FEATURE} · 8 companies moved`, mb.blocks[0]);
  check("its fallback text is the headline and the first card", mb.text.startsWith(`${types.YOUR_FEATURE} · 8 companies moved. Named Co 1`), mb.text);
  const secs = sectionsOf(mb);
  check("five companies, each its own section after a divider", secs.length === 5 && mb.blocks.filter((b) => b.type === "divider").length === 6, mb.blocks.map((b) => b.type));
  const n1 = secs[0];
  check("a known company: its name in bold, linked to its record, the signal under it", n1?.text?.text === `*<${BASE_URL}/?c=c_named1|Named Co 1>*\nNo longer lists a Sales leader`, n1?.text);
  check(
    "its fields: Likelihood, Why now, Timing and the free facts",
    JSON.stringify(n1?.fields?.map((f) => f.text)) === JSON.stringify(["*Likelihood*\nHigh", "*Why now*\nCRO gone from its website", "*Timing*\nInterim or fractional cover usually follows within 2 months", "*Industry*\nSaaS", "*Size*\n51–200 people", "*HQ*\nTexas, US"]),
    n1?.fields,
  );
  check("its logo on the right", n1?.accessory?.type === "image" && n1.accessory.image_url === "https://post.example.com/api/logo/c_named1" && n1.accessory.alt_text === "Named Co 1 logo", n1?.accessory);
  const btnAfter = (sec: B | undefined) => mb.blocks.slice(mb.blocks.indexOf(sec!) + 1).find((b) => b.type === "actions")?.elements?.[0] as { text: { text: string }; url: string } | undefined;
  check("its own button: Open, to its record", btnAfter(n1)?.text.text === "Open" && btnAfter(n1)?.url === `${BASE_URL}/?c=c_named1`, btnAfter(n1));
  const lk = secs[1];
  const lkAll = JSON.stringify(mb.blocks.slice(mb.blocks.indexOf(lk!), mb.blocks.indexOf(secs[2]!)));
  check("a locked company reads by its free facts, never a name", lk?.text?.text === "*A SaaS company*\nNo longer lists a Sales leader" && !/Secret Sauce/.test(JSON.stringify(mb)), lk?.text);
  check("a locked company has no logo, no link to a record, no website", !lk?.accessory && !/c_secret|secret\.example/.test(JSON.stringify(mb)) && !/<https?:/.test(lk?.text?.text ?? ""), lkAll);
  check("its note says why, and that it unlocks in Merlin", /Locked for you: unlock it in Merlin for 2 credits/.test(lkAll), lkAll);
  check("its button opens the day's companies, never its record", btnAfter(lk)?.text.text === "Open in Merlin" && btnAfter(lk)?.url === VIEW, btnAfter(lk));
  const n2 = secs[2];
  check("a company named only on the card (Trial, Pro): linked, but no logo, and Open in Merlin", !!n2 && /^\*<https:\/\/post\.example\.com\/\?c=c_named2\|Named Co 2>\*/.test(n2.text?.text ?? "") && !n2.accessory && btnAfter(n2)?.text.text === "Open in Merlin", n2);
  const ctxTexts = mb.blocks.filter((b) => b.type === "context").map((b) => String((b.elements?.[0] as { text: string }).text));
  check("then And N more, the main button and the footer, small", ctxTexts.includes("And 3 more signals.") && ctxTexts[ctxTexts.length - 1] === fmt.RADAR_FOOTER && mb.blocks[mb.blocks.length - 2]?.type === "actions", ctxTexts);
  const mainBtn = mb.blocks[mb.blocks.length - 2]?.elements?.[0] as { text: { text: string }; url: string; style?: string };
  check("the main button: See the 8 companies, to the day", mainBtn?.text.text === "See the 8 companies" && mainBtn.url === VIEW && mainBtn.style === "primary", mainBtn);
  check("the webhook still gets the lines, untouched", (nfmt.webhookBody(mixed, nowIso()) as { lines: string[] }).lines.length === 6 && !("entries" in (nfmt.webhookBody(mixed, nowIso()) as object)));
  // A card from before the new fields (kept in a batch over a deploy): its headline, its facts in one field.
  const oldBody = nfmt.slackBody(fmt.radarAlert([{ kind: "radar", at: nowIso(), day: dayOf([card(1)]) }], BASE_URL)!) as unknown as { text: string; blocks: B[] };
  check("an older card still posts, valid, by its headline", blockKitProblems(oldBody).length === 0 && sectionsOf(oldBody)[0]?.text?.text === "*A company that fits your ideal client*\nA SaaS company just hired a fractional Marketing leader 1", sectionsOf(oldBody)[0]);
  // Escaping: nothing from a card can @channel or hide a link, and an image is https only.
  const evil = nfmt.slackBody(fmt.radarAlert([{ kind: "radar", at: nowIso(), day: dayOf([namedCard(1, { subject: "<!channel> Co", signal: "<https://evil.example|click>", logo: "javascript:alert(1)", place: "javascript:alert(1)" })]) }], BASE_URL)!) as unknown as { blocks: B[] };
  check("names and lines are escaped, a bad logo or link is dropped", !/<!channel>|<https:\/\/evil|javascript:/.test(JSON.stringify(evil.blocks)) && !sectionsOf(evil)[0]?.accessory, sectionsOf(evil)[0]);
  // The limits, pushed: many entries, long words, many fields.
  const long = "x".repeat(5000);
  const huge: import("../lib/notify/format").Alert = {
    kind: "roles", count: 40, headline: `A headline ${long}`, lines: [long], url: `${BASE_URL}/`, after: [long, long],
    entries: Array.from({ length: 40 }, (_, i) => ({ title: `T${i} ${long}`, link: `${BASE_URL}/?c=${i}`, text: long, quote: long, note: long, fields: Array.from({ length: 15 }, (_, k) => ({ label: `L${k}`, value: long })), image: { url: "https://img.example/x.png", alt: long }, button: { text: long, url: `${BASE_URL}/x` } })),
  };
  const hb = nfmt.slackBody(huge) as unknown as { text: string; blocks: B[] };
  check("pushed past every limit, the post still fits Block Kit", blockKitProblems(hb).length === 0 && hb.blocks.length <= 50 && hb.text.length <= 300, blockKitProblems(hb));
  check("and keeps its main button and footer", hb.blocks[hb.blocks.length - 1]?.type === "context" && hb.blocks[hb.blocks.length - 2]?.type === "actions", hb.blocks.slice(-2).map((b) => b.type));
  const twelve = fmt.renderRadarEmail({ name: "Sal Starter", day: dayOf(Array.from({ length: 12 }, (_, i) => card(i))), unsubscribeUrl: "https://post.example.com/u", appUrl: "https://post.example.com" });
  check("the email lists 10, then 'And 2 more' to the day's companies", (twelve.html.match(/class="cb-btn"/g) ?? []).length === 10 && (twelve.text.match(/fractional Marketing leader \d+\n/g) ?? []).length === 10 && twelve.html.includes(`<a class="cb-ink" href="${VIEW}" style="color:#`) && /And 2 more signals\./.test(twelve.text), twelve.text);
  const hrefs = [...new Set((twelve.html.match(/<a href="[^"]*"/g) ?? []).map((x) => x.slice(9, -1)))];
  check("every link in the email is the day's companies, the unsubscribe link or the app", hrefs.every((h) => h === VIEW || h === "https://post.example.com/u" || h === "https://post.example.com"), hrefs);
  check("the email is escaped", !/<b>x<\/b>/.test(fmt.renderRadarEmail({ name: "<b>x</b>", day: dayOf([card(1)]), unsubscribeUrl: "u", appUrl: "" }).html));

  /* ---------- the email's build: pictures, links, width, dark mode ---------- */
  console.log("\nThe email's build");
  const STILL = `${types.RADAR_STILL} Fractional Marketing seat started Aug 2025, 15 months ago · based on typical tenure: ended fractional seats last a median 12 months`;
  const kinds: import("../lib/radar/types").RadarKind[] = ["adjacent", "role", "seat", "funding", "sales-build", "departure", "tenure", "rehire", "arrival", "team-build", "headcount", "gap"];
  const every = kinds.map((k, i) => card(40 + i, { kind: k, co: `co${40 + i}`, band: i % 2 ? "Medium" : "High", whyNow: k === "tenure" || k === "gap" ? STILL : `Something happened · the reason ${i}`, signal: `Signal ${i}`, about: { industry: "SaaS", size: "11–50 people", hq: "Texas, US", revenue: "$1M–$5M" } }));
  const full = fmt.renderRadarEmail({ name: "Sal Starter", day: dayOf(every.slice(0, 10)), unsubscribeUrl: "https://post.example.com/api/table/unsubscribe?m=x&s=y&r=radar", openPixel: "https://post.example.com/api/radar/open?m=x&s=y", appUrl: "https://post.example.com" });
  const imgs = full.html.match(/<img [^>]*>/g) ?? [];
  const attr = (tag: string, k: string) => new RegExp(`\\s${k}="([^"]*)"`).exec(tag)?.[1];
  check("the unsubscribe link and the open pixel are there, as they were", full.html.includes('href="https://post.example.com/api/table/unsubscribe?m=x&amp;s=y&amp;r=radar"') && full.html.includes('<img src="https://post.example.com/api/radar/open?m=x&amp;s=y" width="1" height="1" alt=""'), imgs.slice(-1));
  check("every picture has alt text (empty only for the pixel and the icons beside their labels)", imgs.length > 3 && imgs.every((x) => attr(x, "alt") !== undefined) && imgs.filter((x) => /hero-|merlin@2x/.test(x)).every((x) => (attr(x, "alt") ?? "").length > 3), imgs.map((x) => attr(x, "alt")));
  check("every picture has an absolute https address, a width and a height", imgs.every((x) => /^https:\/\//.test(attr(x, "src") ?? "") && /^\d+$/.test(attr(x, "width") ?? "") && /^\d+$/.test(attr(x, "height") ?? "")), imgs);
  check("the pictures are PNGs on the site's own /email/ path", imgs.filter((x) => !x.includes("/api/radar/open")).every((x) => /^https:\/\/post\.example\.com\/email\/crystal-ball\/[a-z-]+@2x\.png\?v=\d+$/.test(attr(x, "src")!.replace(/&amp;/g, "&"))), imgs.map((x) => attr(x, "src")));
  check("600 wide, fluid down to a phone", /<table role="presentation" width="600"[^>]*style="width:100%;max-width:600px/.test(full.html) && /<meta name="viewport" content="width=device-width,initial-scale=1">/.test(full.html));
  check("no SVG, no script, layout in tables and inline styles (the <style> only adds dark mode and phone gutters)", !/<svg|<script|<div class="cb-(card|quiet)/i.test(full.html) && (full.html.match(/<style>[\s\S]*?<\/style>/)?.[0] ?? "").split("\n").filter((l) => /\{[^}]*:[^}]*\}/.test(l)).every((l) => l.includes("!important") || l.startsWith(":root")) && /prefers-color-scheme:dark/.test(full.html), full.html.match(/<style>[\s\S]*?<\/style>/)?.[0]);
  check("dark-mode safe: it says it supports both schemes, and every icon has its own solid tile behind it", /<meta name="color-scheme" content="light dark">/.test(full.html) && imgs.filter((x) => x.includes("/icon-")).every((x) => /background-color:#[0-9A-Fa-f]{6}/.test(x)));
  check("every kind has its label and icon", kinds.every((k) => fmt.kindLabel({ kind: k, headline: "", signal: "Its fractional Sales seat is 15 months in" }).length > 3) && fmt.kindLabel({ kind: "tenure", headline: "", signal: "Its fractional Sales seat is 15 months in" }) === "Seat at 15 months" && new Set(kinds.map(fmt.kindIcon)).size === 11, kinds.map(fmt.kindIcon));
  check("new events first, then Still a good time, quieter", full.text.indexOf("NEW SINCE YESTERDAY") < full.text.indexOf("STILL A GOOD TIME") && full.text.indexOf("STILL A GOOD TIME") < full.text.indexOf("Seat at 12 months") && /class="cb-quiet"/.test(full.html), full.text.slice(0, 300));
  check("each card: a label, a likelihood chip (never a percentage), the company, one short why-now and one button", (full.html.match(/class="cb-btn"/g) ?? []).length === 10 && (full.html.match(/<span class="cb-wide"> likelihood<\/span>/g) ?? []).length === 10 && !/\d+\s*%/.test(full.text) && /A SaaS company in Texas/.test(full.text) && /\nSignal 1\nThe reason 1\.\n/.test(full.text), full.text.slice(0, 600));
  check("no exclamation marks, and never LinkedIn or Sales Navigator", !/!(?!important)/.test(full.html.replace(/<!doctype html>|<!--[\s\S]*?-->/gi, "")) && !/!/.test(full.text + full.subject) && !/linkedin|sales navigator/i.test(full.text + full.html));
  const { statSync } = await import("node:fs");
  const used = [...new Set(imgs.map((x) => attr(x, "src")!).filter((s) => s.includes("/email/")).map((s) => new URL(s.replace(/&amp;/g, "&")).pathname))];
  const kb = (f: string) => statSync(path.join(process.cwd(), "public", f)).size / 1024;
  const weight = used.reduce((n, f) => n + kb(f), 0);
  const heroes = ["/email/crystal-ball/hero-morning@2x.png", "/email/crystal-ball/hero-quiet@2x.png"];
  check("the pictures weigh under 200 KB an email, a hero under 80 KB", weight < 200 && heroes.every((h) => kb(h) < 80), { weight: weight.toFixed(1), used });
  const pubUrl = process.env.RN_PUBLIC_URL;
  delete process.env.RN_PUBLIC_URL;
  const bare = fmt.renderRadarEmail({ name: "Sal", day: dayOf([card(1)]), unsubscribeUrl: "u", appUrl: "" });
  if (pubUrl !== undefined) process.env.RN_PUBLIC_URL = pubUrl;
  check("with no site to load them from, the email leaves the pictures out (no broken images) and names Merlin in text", !/<img /.test(bare.html) && bare.html.includes(">Merlin</td>"), bare.html.match(/<img [^>]*>/g));
  const quietDay = fmt.renderRadarEmail({ name: "Sal", day: dayOf([card(70, { kind: "tenure", whyNow: STILL, band: "Medium" })]), unsubscribeUrl: "u", appUrl: "https://post.example.com" });
  check("a day with only Still a good time: its own subject, headline and the night hero", quietDay.subject === `${types.YOUR_FEATURE}: 1 company still worth a look` && quietDay.html.includes(">1 company is still worth a look</h1>") && quietDay.html.includes("hero-quiet@2x.png") && !quietDay.html.includes("hero-morning"), quietDay.subject);

  console.log("\nFunding: the source and its plumbing");
  check("no provider: no events", (await funding.fundingSource().events({ sinceMs: 0, nowMs: Date.now(), companies: [] })).length === 0 && funding.fundingSource().name === "none");
  const stub = { name: "test", events: async () => [{ companyId: "c_acme", at: new Date(Date.now() - HOUR).toISOString(), round: "Series A", amount: "$12M", source: "test" }] };
  const withFunding = sig.detectSignals(seedLoaded, await state(), Date.now() - DAY, Date.now(), await stub.events());
  const f = withFunding.find((x) => x.kind === "funding");
  check("an event from a source becomes a funding signal", !!f && f.round === "Series A");
  const fSal = match.signalsFor(withFunding, match.profileOf(seedLoaded, await state(), "mem_sal", "Sales")).find((x) => x.kind === "funding");
  check("a funding signal reaches every function in the profile", !!fSal);
  const fctx = { cardId: (x: string) => x, coId: (x: string) => x, url: "/x" };
  const fCard = present.cardOf(fSal!, { ...fctx, visible: () => false });
  check("a funding card at a locked company names no company", fCard.headline === "A SaaS company raised a Series A ($12M)" && !named(fCard).length && fCard.locked === true && fCard.url === "/x", fCard);
  check("one the member knows is named", present.cardOf(fSal!, { ...fctx, visible: () => true }).headline === "Acme Robotics raised a Series A ($12M)");
  check("its line in the day's view names nothing", present.viewLine(fSal!) === "Raised a Series A ($12M) · Money in usually means hiring");
  const failing = { name: "down", events: async () => Promise.reject(new Error("down")) };
  skew += DAY;
  const r5 = await radar.runRadar({ now: nowIso(), funding: failing as unknown as typeof stub });
  check("a source that fails never stops the radar", r5.ran, r5);

  console.log("\nPilot metrics");
  const admin = await t.buildView("tok-ada-0001");
  const rs = admin.admin?.radar;
  check("the radar panel counts members with it on", rs?.on === 2 && rs.off === 2, rs);
  check("and what went out, opens and clicks (the two tracked clicks above)", (rs?.sent7 ?? 0) >= 4 && rs!.clicks === 2 && rs!.opens7 === 1, rs);
  const st = types.radarStats(undefined, [{ name: "radar_sent", at: nowIso() }, { name: "radar_clicked", at: nowIso() }, { name: "wall", at: nowIso() }], { a: { radarOff: true } }, 3, Date.now());
  check("radarStats counts only radar signals", st.sentToday === 1 && st.clicks === 1 && st.off === 1 && st.on === 3, st);
  check("radarStats counts an email turned off on Notifications as off", types.radarStats(undefined, [], { a: { radarEmail: "off" }, b: { radarSlackOff: true }, c: { radarEmail: "weekly" } }, 3, Date.now()).off === 1);

  /* ---------- coming back: the email's links sign in, each company opens its own record ---------- */
  console.log("\nThe email's links sign the member in, once");
  const ein = await import("../lib/emailIn");
  const signin = await import("../lib/signin");
  const qOf = (href: string) => Object.fromEntries(new URL(href.replace(/&amp;/g, "&")).searchParams);
  const BASE = "https://post.example.com";
  const sd = await t.loadSeed();
  const linkA = ein.emailLinker(sd, await state(), "mem_sal", BASE)(ein.NOTIFICATIONS_PATH);
  check("a footer link goes through /api/go with an expiry and a grant, to Notifications", /^https:\/\/post\.example\.com\/api\/go\?m=m_[\w-]+&x=[0-9a-z]+&t=[\w-]{27}&to=%2F%3Fp%3Dnotifications$/.test(linkA), linkA);
  const qa = qOf(linkA);
  const land1 = await ein.emailLanding(qa, null);
  const land2 = await ein.emailLanding(qa, null);
  check("opening it makes a one-time sign-in link to the same place", /^\/\?k=o[\w-]{32}&p=notifications$/.test(land1 ?? "") && /^\/\?k=o[\w-]{32}&p=notifications$/.test(land2 ?? "") && land1 !== land2, { land1, land2 });
  const k1 = decodeURIComponent(/k=([^&]+)/.exec(land1 ?? "")![1]);
  const k2 = decodeURIComponent(/k=([^&]+)/.exec(land2 ?? "")![1]);
  const rec = (await state()).signins?.find((x) => x.purpose === "email");
  check("the one-time link lasts 20 minutes, carries no code anyone can type, and remembers its email link", !!rec && Date.parse(rec.exp) - Date.now() <= signin.SIGNIN_TTL_MS && !!rec.grant && !!rec.grantExp, rec);
  const who = await signin.redeemLink(k2);
  check("redeeming it signs in that member, and only them", who?.id === "mem_sal", who?.id);
  check("then the email link is spent: the other one-time link made from it (a scanner's visit) stops working", (await signin.redeemLink(k1)) === null);
  check("and opening it again says it was used", (await ein.emailLanding(qa, null)) === "/?in=used&p=notifications");
  const linkB = ein.emailLinker(sd, await state(), "mem_sal", BASE)("/?p=seats");
  check("a browser already signed in as that member goes straight there, and the link stays good", (await ein.emailLanding(qOf(linkB), "tok-sal-0001")) === "/?p=seats" && /^\/\?k=/.test((await ein.emailLanding(qOf(linkB), null)) ?? ""));
  check("someone else signed in here gets a sign-in link for the email's member", /^\/\?k=/.test((await ein.emailLanding(qOf(ein.emailLinker(sd, await state(), "mem_sal", BASE)("/?p=seats")), "tok-mo-0001")) ?? ""));
  const qb = qOf(linkB);
  check("a link with its place changed is refused", (await ein.emailLanding({ ...qb, to: "/?p=credits" }, null)) === "/?in=used&p=credits");
  check("a link moved to another member is refused", (await ein.emailLanding({ ...qb, m: pub("mem_mo") }, null)) === "/?in=used&p=seats");
  check("a link with a forged grant is refused", (await ein.emailLanding({ ...qb, t: "x".repeat(27) }, null)) === "/?in=used&p=seats");
  check("a link never sends anywhere else", (await ein.emailLanding({ ...qb, to: "https://evil.example/" }, null)) === null && (await ein.emailLanding({ ...qb, to: "//evil.example" }, null)) === null);
  check("an older email's link without a grant goes where it went, with no sign-in", (await ein.emailLanding({ m: qb.m, to: "/?p=seats" }, null)) === "/?p=seats");
  skew += 8 * DAY;
  check("after 7 days it no longer signs in", (await ein.emailLanding(qOf(ein.emailLinker(sd, await state(), "mem_sal", BASE, Date.now() - 8 * DAY)("/?p=seats")), null)) === "/?in=used&p=seats");
  skew -= 8 * DAY;
  // The radar email's own links: a card's link through the click route, then the sign-in.
  const cardHref = salLinks.find((x) => x.includes(cardPath("c_acme")))!.slice('<a href="'.length, -1);
  const cq = qOf(cardHref);
  const clickTo = await radar.radarClicked(cq.m, cq.s, cq.w, cq.to);
  check("a card's link counts the click and opens Acme's record from that day's Crystal Ball", clickTo === types.radarOpenPath(day0, pub("c_acme")), clickTo);
  const cardLand = await ein.emailLanding({ ...cq, to: clickTo }, null);
  check("and signs Sal in on the way", new RegExp(`^/\\?k=o[\\w-]{32}&sig=${day0}&c=${pub("c_acme")}$`).test(cardLand ?? ""), cardLand);
  check("Slack's links never sign in (a channel is shared)", radarPosts(SLACK_SAL).every((x) => !/&x=[0-9a-z]+&t=/.test(x.raw)));
  const rotated = await signin.rotateToken("tok-pro-0001");
  check("Sign out on other devices stops every older email's links too", !!rotated && (await ein.emailLanding(qOf(ein.emailLinker(sd, { ...(await state()), tokens: {} }, "mem_pro", BASE)("/?p=seats")), null)) === "/?in=used&p=seats");

  console.log("\nEach card's button, by plan");
  const plans = (opens: "free" | "one" | undefined) =>
    fmt.renderRadarEmail({ name: "Sal", day: dayOf([1, 2, 3].map((i) => card(i, { opens, open: `https://post.example.com/api/radar/go?c${i}` }))), unsubscribeUrl: "https://post.example.com/u", appUrl: "https://post.example.com" });
  const trial = plans("free");
  check("Trial and Pro: every card says Open free", (trial.text.match(/^Open free: /gm) ?? []).length === 3 && (trial.html.match(/>Open free<\/a>/g) ?? []).length === 3, trial.text);
  const freePlan = plans("one");
  check(
    "Free: only the first card says Open free (today's), the rest Open in Merlin",
    (freePlan.text.match(/^Open free \(today's\): /gm) ?? []).length === 1 && (freePlan.text.match(/^Open in Merlin: /gm) ?? []).length === 2 && freePlan.text.indexOf("Open free (today's)") < freePlan.text.indexOf("Open in Merlin") && (freePlan.html.match(/>Open free \(today&#39;s\)<\/a>|>Open free \(today's\)<\/a>/g) ?? []).length === 1,
    freePlan.text,
  );
  check("each card's button opens its own company, the button under them the day", [1, 2, 3].every((i) => trial.html.includes(`href="https://post.example.com/api/radar/go?c${i}"`)) && trial.html.includes(`href="${VIEW}"`) && /See all 3 companies/.test(trial.text), trial.html.match(/href="[^"]+"/g));
  check("the email's own button: Open Crystal Ball for one company, See both for two", fmt.seeAllWords(1) === `Open ${types.FEATURE_NAME}` && fmt.seeAllWords(2) === "See both companies" && fmt.seeAllWords(5) === "See all 5 companies");
  const { parsePlace } = await import("../app/post/place");
  const deep = parsePlace({} as never, types.radarOpenPath(day0, pub("c_acme")).slice(1), new Set());
  check("the card's link opens that company over that day's Crystal Ball", deep.p === "radar" && deep.sig === day0 && deep.c === pub("c_acme"), deep);

  console.log("\nHow often: daily, twice a week, weekly, and Slack apart");
  const MON = Date.parse("2026-11-23T13:00:00Z");
  const at = (d: number, h = 13) => new Date(MON + d * DAY + (h - 13) * HOUR).toISOString();
  check("daily is always due", types.radarEmailDue("daily", at(0), MON + HOUR));
  check("weekly: due on Monday after last week's", types.radarEmailDue("weekly", at(-7), MON) && !types.radarEmailDue("weekly", at(0), MON + 2 * DAY) && types.radarEmailDue("weekly", at(0), MON + 7 * DAY));
  check("weekly: a Monday missed goes on Tuesday", types.radarEmailDue("weekly", at(-7), MON + DAY));
  check("twice a week: Monday and Thursday", !types.radarEmailDue("twice", at(0), MON + 2 * DAY) && types.radarEmailDue("twice", at(0), MON + 3 * DAY) && !types.radarEmailDue("twice", at(3), MON + 5 * DAY) && types.radarEmailDue("twice", at(3), MON + 7 * DAY));
  check("never sent: due", types.radarEmailDue("weekly", null, MON + 2 * DAY));
  check("the choices' words", types.RADAR_EVERY_WORDS.weekly === "Once a week" && types.RADAR_ROLLUP_MAX.weekly > types.RADAR_ROLLUP_MAX.daily);
  const wk = await t.perform("tok-sal-0001", { type: "settings", radarEmail: "weekly" }, BASE);
  const vWk = await t.buildView("tok-sal-0001");
  check("Notifications sets the email weekly, and Slack stays on", (await state()).profiles.mem_sal.radarEmail === "weekly" && vWk.me?.radarEmail === "weekly" && vWk.me.radarSlack === true && /once a week/.test(wk.message), { msg: wk.message, me: vWk.me?.radarEmail });
  const sOff = await t.perform("tok-sal-0001", { type: "settings", radarSlack: false }, BASE);
  const vS = await t.buildView("tok-sal-0001");
  check("and Slack off, with the email left weekly", vS.me?.radarSlack === false && vS.me.radarEmail === "weekly" && vS.me.radar === true && /won't post to Slack/.test(sOff.message), vS.me?.radarSlack);
  const bad = await t.perform("tok-sal-0001", { type: "settings", radarEmail: "hourly" as never }, BASE).catch((e) => ({ message: String(e) }));
  check("a choice that isn't one changes nothing", (await state()).profiles.mem_sal.radarEmail === "weekly", bad);
  await t.perform("tok-off-0001", { type: "settings", radarEmail: "daily" }, BASE);
  const vOtto = await t.buildView("tok-off-0001");
  check("a member who turned both off before: turning the email on leaves Slack off", vOtto.me?.radarEmail === "daily" && vOtto.me.radarSlack === false && !(await state()).profiles.mem_off.radarOff, (await state()).profiles.mem_off);
  // Sal (weekly, Slack off) just had an email: a new open Sales role at Acme waits for the weekly one.
  await T.mutate((d) => void Object.assign(radarMember(d, "mem_sal"), { lastMailAt: nowIso(), lastAt: new Date(Date.now() - 2 * DAY).toISOString() }));
  await t.applyScan(
    {
      roles: [...found, role("Echo Energy", "Fractional Head of Marketing", "Marketing", "echo.example"), role("Fox Freight", "Fractional Finance Director", "Finance", "fox.example"), role("Acme Robotics", "Fractional Head of Sales", "Sales", "acme.example")],
      sources: [{ source: "board", fetched: 6, matched: 6 }],
    },
    nowIso(),
  );
  await settle();
  // The Acme Sales role went to Sal: its key is marked sent, and the day kept it at Acme.
  const finKey = (s: Awaited<ReturnType<typeof state>>) => {
    const m = s.radar?.members.mem_sal;
    return Object.values(m?.days ?? {}).flat().some((r) => r.c === "c_acme" && r.k.startsWith("role:") && !!m?.sent[r.k]);
  };
  skew += HOUR;
  clear();
  await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  check("weekly, not due yet: no email and nothing marked sent", !mails("sal.starter@example.com").length && !finKey(await state()), mails().map((x) => x.body.to));
  // (lastAt too: a member not on Pro gets one Crystal Ball a UTC day, and the funding run above may have sent today's.)
  await T.mutate((d) => void Object.assign(radarMember(d, "mem_sal"), { lastMailAt: new Date(Date.now() - 8 * DAY).toISOString(), lastAt: new Date(Date.now() - 2 * DAY).toISOString() }));
  clear();
  await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  const wkMail = mails("sal.starter@example.com")[0]?.body as { subject: string; text: string; html: string } | undefined;
  check("its day comes: one roll-up with what is new this week", !!wkMail && /\nNEW THIS WEEK\n/.test(wkMail.text) && /new this week/.test(wkMail.text) && /leaning your way this week/.test(wkMail.text) && /Fractional Head of Sales/.test(wkMail.text), wkMail?.text.slice(0, 700));
  check("Slack off: no post for Sal, while the email went", !radarPosts(SLACK_SAL).length && finKey(await state()) && !!(await state()).radar?.members.mem_sal?.lastMailAt);
  check("radar_sent says email only", (await state()).signals.filter((x) => x.memberId === "mem_sal" && x.name === "radar_sent").slice(-1)[0]?.where === "email");

  console.log("\nThe unsubscribe link: weekly instead, or off, and never Slack");
  const psig = radar.radarSig("mem_sal");
  check("the link says what the email is set to now", (await radar.radarLinkMember(pub("mem_sal"), psig))?.email === "weekly" && (await radar.radarLinkMember(pub("mem_sal"), "nope")) === null);
  await t.perform("tok-sal-0001", { type: "settings", radarEmail: "daily" }, BASE);
  await t.perform("tok-sal-0001", { type: "settings", radarSlack: true }, BASE);
  check("Send it weekly instead", (await radar.setRadarEmail(pub("mem_sal"), psig, "weekly")) && (await state()).profiles.mem_sal.radarEmail === "weekly" && !(await state()).profiles.mem_sal.radarSlackOff);
  check("Turn it off: the email only, Slack stays on", (await radar.setRadarEmail(pub("mem_sal"), psig, "off")) && ((v) => v.me?.radarEmail === "off" && v.me.radarSlack === true)(await t.buildView("tok-sal-0001")));
  check("a wrong signature changes nothing", !(await radar.setRadarEmail(pub("mem_sal"), "nope", "weekly")) && (await state()).profiles.mem_sal.radarEmail === "off");
  // The email off, Slack on: the next new company still posts to Slack, and no email goes.
  await t.applyScan(
    {
      roles: [...found, role("Echo Energy", "Fractional Head of Marketing", "Marketing", "echo.example"), role("Fox Freight", "Fractional Finance Director", "Finance", "fox.example"), role("Acme Robotics", "Fractional Head of Sales", "Sales", "acme.example"), role("Beta Labs", "Fractional CRO", "Sales", "beta.example")],
      sources: [{ source: "board", fetched: 7, matched: 7 }],
    },
    nowIso(),
  );
  await settle();
  skew += DAY;
  clear();
  await radar.runRadar({ now: nowIso() });
  await settle();
  check("with the email off, Crystal Ball still posts to Slack, and sends no email", radarPosts(SLACK_SAL).length === 1 && /Fractional CRO/.test(radarPosts(SLACK_SAL)[0].raw) && !mails("sal.starter@example.com").length, { posts: radarPosts(SLACK_SAL).length, mails: mails().map((x) => x.body.to) });

  /* ---------- follow-ups due in Your pipeline ---------- */
  console.log("\nFollow-ups due, in the morning email");
  // The words, pure: above the companies, at most 3 and "And N more", each its own link.
  const up = (i: number) => ({ title: `Follow up with the CEO at Co ${i}`, line: `Sent ${i} days ago by email.`, url: `https://post.example.com/api/radar/go?f${i}` });
  const withUps = fmt.renderRadarEmail({ name: "Sal", day: dayOf([card(1), card(2)]), followUps: [1, 2, 3, 4].map(up), unsubscribeUrl: "u", appUrl: "https://post.example.com" });
  check(
    "Follow-ups due comes above the companies, 3 of them, then And 1 more",
    withUps.text.indexOf("FOLLOW-UPS DUE") >= 0 && withUps.text.indexOf("FOLLOW-UPS DUE") < withUps.text.indexOf("NEW SINCE YESTERDAY") && (withUps.text.match(/\nOpen it: /g) ?? []).length === 3 && !withUps.text.includes("Co 4") && withUps.text.includes("And 1 follow-up more in Your pipeline.") && withUps.html.indexOf("Follow-ups due") < withUps.html.indexOf('class="cb-btn"'),
    withUps.text.slice(0, 700),
  );
  check("each links where it says, in the HTML too", [1, 2, 3].every((i) => withUps.html.includes(`href="https://post.example.com/api/radar/go?f${i}"`)) && !withUps.html.includes("?f4"));
  check("with companies, the subject and headline are the companies' as before", withUps.subject === `${types.YOUR_FEATURE}: 2 companies leaning your way`, withUps.subject);
  const upsAlone = fmt.renderRadarEmail({ name: "Sal", day: { cards: [], total: 0, companies: 0, day: day0, url: VIEW, mode: "daily" }, followUps: [1, 2].map(up), pipelineUrl: "https://post.example.com/api/radar/go?pipe", unsubscribeUrl: "u", appUrl: "https://post.example.com" });
  check(
    "a day with follow-ups and no companies: its own subject and headline, and the button opens Your pipeline",
    upsAlone.subject === `${types.YOUR_FEATURE}: 2 follow-ups due` && upsAlone.html.includes(">You have 2 follow-ups due</h1>") && upsAlone.html.includes('href="https://post.example.com/api/radar/go?pipe"') && upsAlone.text.includes("Open your pipeline\nhttps://post.example.com/api/radar/go?pipe") && !/0 compan/.test(upsAlone.text + upsAlone.html),
    upsAlone.text.slice(0, 500),
  );

  // The run. Ned has no Ideal Fractional Profile, so Crystal Ball has nothing for him: four follow-ups due are his reason to come back.
  // He knows Fox Freight (unlocked); Acme, Beta and Echo are locked for him. The Fox deal went to someone from his Google account.
  skew += DAY;
  const todayF = nowIso().slice(0, 10);
  const dayAgo = (n: number) => new Date(Date.now() - n * DAY).toISOString().slice(0, 10);
  const deal = (i: number, companyId: string, stage: string, due: string, to: Record<string, unknown>) => ({
    id: `pl_t${i}`, companyId, stage, channel: "email", to, source: "move", dates: { sent: new Date(Date.now() - 5 * DAY).toISOString(), ...(stage !== "sent" ? { [stage]: new Date(Date.now() - 3 * DAY).toISOString() } : {}) },
    via: { sent: "note" }, due, follow: 0, lastOut: new Date(Date.now() - 5 * DAY).toISOString(), seen: {}, notes: [{ at: nowIso(), text: "Private note about the deal" }], log: [],
    createdAt: new Date(Date.now() - 5 * DAY).toISOString(), updatedAt: new Date(Date.now() - 3 * DAY).toISOString(),
  });
  await T.mutate((d) => {
    (d.unlocks["c_fox.identity"] ??= []).push("mem_noicp");
    (d as unknown as { pipeline: Record<string, unknown> }).pipeline = {
      ...(d.pipeline ?? {}),
      mem_noicp: {
        entries: [
          deal(1, "c_fox", "sent", dayAgo(2), { role: "VP Finance", name: "Gail Googleperson", google: true }),
          deal(2, "c_acme", "replied", dayAgo(1), { role: "CFO" }),
          deal(3, "c_beta", "proposal", dayAgo(1), { role: "CEO" }),
          deal(4, "c_echo", "sent", todayF, { role: "COO" }),
        ],
        intros: [],
      },
    };
  });
  const pa = await import("../lib/pipelineActions");
  const due4 = await pa.dueFollowUpsFor("mem_noicp", Date.now(), "merlin");
  check("four follow-ups are due for Ned (the most overdue first)", due4.length === 4 && due4[0].companyId === "c_fox", due4.map((f) => [f.companyId, f.due, f.title]));
  clear();
  await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  const ned = mails("ned.noprofile@example.com");
  const nm = ned[0]?.body as { subject: string; text: string; html: string } | undefined;
  check("no new company and no profile, but follow-ups came due: the email still goes, once", ned.length === 1 && nm?.subject === `${types.YOUR_FEATURE}: 4 follow-ups due`, { n: ned.length, subject: nm?.subject });
  check("it lists 3, the most overdue first, then And 1 more", !!nm && (nm.text.match(/\nOpen it: /g) ?? []).length === 3 && nm.text.includes("And 1 follow-up more in Your pipeline.") && nm.text.indexOf("Fox Freight") < nm.text.indexOf("Book a meeting"), nm?.text.slice(0, 900));
  check("a company the member knows is named; the person from his Google account never is", !!nm && nm.text.includes("Follow up with the person you know there at Fox Freight") && !/Gail|Googleperson|VP Finance/.test(nm.text + nm.html), nm?.text.slice(0, 600));
  check("a company locked for him is never named (nor any other name on the seed)", !!nm && nm.text.includes("Book a meeting with the CFO at a company in your pipeline") && named(outsideLinks(nm.text + nm.html + nm.subject)).every((x) => x === "Fox Freight"), named(outsideLinks(nm?.text ?? "")));
  check("never a note's text", !!nm && !/Private note/.test(nm.text + nm.html));
  check(
    "each links to the company's record through the tracked link, signed in once (lib/emailIn.ts)",
    !!nm && ["c_fox", "c_acme", "c_beta"].every((id) => new RegExp(`/api/radar/go\\?m=[^&\\s]+&s=[^&\\s]+&w=email&x=[0-9a-z]+&t=[^&\\s]+&to=${encodeURIComponent(`/?c=${pub(id)}`).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(nm.text)) && !nm.text.includes(encodeURIComponent(`/?c=${pub("c_echo")}`)),
    nm?.text.slice(0, 900),
  );
  check("its button opens Your pipeline, signed in", !!nm && new RegExp(`Open your pipeline\\nhttps://post\\.example\\.com/api/radar/go\\?[^\\s]*&x=[0-9a-z]+&t=[^&\\s]+&to=${encodeURIComponent("/?p=pipeline").replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(nm.text), nm?.text.slice(-700));
  const nedLink = /https:\/\/post\.example\.com\/api\/radar\/go\?[^\s]*to=%2F%3Fc%3D[^\s]+/.exec(nm?.text ?? "")?.[0];
  const ein2 = await import("../lib/emailIn");
  const landing = nedLink ? await ein2.emailLanding(Object.fromEntries(new URL(nedLink).searchParams) as { m: string; x: string; t: string; to: string }, null) : null;
  check("and opening one signs him in to that record", !!landing && /^\/\?k=[^&]+&c=/.test(landing), landing);
  const nedR = (await state()).radar?.members.mem_noicp;
  check("it marks no company sent, and keeps when the email went", !Object.keys(nedR?.sent ?? {}).length && !!nedR?.lastMailAt && !nedR.lastAt, nedR);
  check("radar_sent says email", (await state()).signals.filter((x) => x.memberId === "mem_noicp" && x.name === "radar_sent").slice(-1)[0]?.where === "email");
  // The next morning nothing new came due: the same follow-ups don't send another email.
  skew += DAY;
  clear();
  await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  check("the next morning, with only the same follow-ups due: no email", !mails("ned.noprofile@example.com").length, mails().map((x) => x.body.to));
  // A follow-up comes due today (Merlin moved its day after a follow-up went out): that is a reason again.
  await T.mutate((d) => void ((d.pipeline!.mem_noicp.entries.find((e) => e.id === "pl_t4")!.due = nowIso().slice(0, 10)), undefined));
  skew += HOUR;
  clear();
  await radar.runRadar({ now: nowIso(), force: true });
  await settle();
  check("a follow-up that came due since the last email sends one again", mails("ned.noprofile@example.com").length === 1, mails().map((x) => x.body.to));
  // A member with Slack gets no follow-ups there: Slack is a shared channel.
  check("never in Slack", !outbox.some((x) => x.url.startsWith("https://hooks.slack.com") && /follow-up|Follow up with/i.test(x.raw)));
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
