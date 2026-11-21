/**
 * Checks of what a member sees once Google is connected (lib/google, app/post/network, Charge.tsx):
 * the record's one "Your way in", Crystal Ball's chip with its warmth printed, the connect moment's
 * numbers, "What to charge them", and Confirm / Not a seat on the seats their calendar suggests.
 *
 *   npx tsx scripts/test-google-pages.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end, and a fake Google API server on 127.0.0.1 (RN_GOOGLE_API_TEST, honoured only with
 * RN_SCAN_TEST=1). Every person, company and rate in them is made up. The pages are rendered to
 * HTML in process (react-dom/server) from the same answers the app gets.
 *
 *  1. The first read: the stage it is on, the measured time, shown once.
 *  2. The connect moment: N and M are Your network's and Crystal Ball's own, at 7, 2 and 0 companies.
 *  3. A record: "Your way in" once, the people the member knows before the seats.
 *  4. Crystal Ball's chip prints Hot, Warm, Fading and Cold.
 *  5. What to charge them: a figure only at its floor, a range only at 10, Free and Pro, the
 *     member's own rate for them alone.
 *  6. Seats the calendar suggests: nothing added without the click, Confirm adds or claims by the
 *     existing rules and credits (and "when confirmed" where a seat waits), Not a seat stays gone.
 *  7. Privacy: another member's table, network and Crystal Ball are the same bytes after each action.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import Module, { register } from "node:module";
import type { AddressInfo } from "node:net";
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
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 700)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const today = new Date(NOW).toISOString().slice(0, 10);
const dir = mkdtempSync(path.join(tmpdir(), "rn-google-pages-"));

/* ---------- the made-up seed ---------- */
const co = (id: string, name: string, site: string, revenue = "$5M–$20M") => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue, hq: "Austin, TX" } });
const fillers = Array.from({ length: 12 }, (_, i) => co(`c_fill${i}`, `Filler Works ${i}`, `fill${i}.example`));
const companies = [
  co("c_lark", "Larkfield Robotics", "larkfield.example"),
  co("c_corv", "Corvid Health", "corvid.example"),
  co("c_fade", "Fadeaway Freight", "fadeaway.example"),
  co("c_pine", "Pinecrest Logistics", "pinecrest.example"),
  co("c_tall", "Tallgrass Analytics", "tallgrass.example"),
  co("c_north", "Northwind Supply", "northwind.example", "$20M–$50M"),
  co("c_bram", "Bramblewood Labs", "bramblewood.example"),
  ...fillers,
  // Cy's network (section 8): a big software vendor, a staffing firm, a client met every week, a prospect with a fresh hire.
  { id: "c_vend", fields: { name: "Vendorly", website: "vendorly.example", industry: "SaaS", employees: "1,001+", revenue: "$50M+", hq: "Austin, TX" } },
  { id: "c_staff", fields: { name: "Hirewell Staffing", website: "hirewell.example", industry: "Staffing & Recruiting", employees: "11–50", revenue: "$1M–$5M", hq: "Austin, TX" } },
  co("c_quarry", "Quarry Labs", "quarrylabs.example"),
  co("c_birch", "Birchway Apps", "birchway.example"),
];
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, verified: false, fields });
const engagements = [
  // Larkfield: a seat somebody held (locked for everyone else), and one nobody is named on.
  seat("e_lark_cfo", "c_lark", { source: "Published engagement", function: "Finance", role: "Fractional CFO", operator: "Pat Sample", type: "Fractional", start: "2025-03", status: "Active", end: "Ongoing" }),
  seat("e_lark_sales", "c_lark", { source: "Seat scan", function: "Sales", role: "Fractional CRO", type: "Fractional", start: "2026-02" }),
  // Northwind: Revenue Nomad already found a RevOps seat there that nobody holds. Confirm claims it.
  seat("e_north_rev", "c_north", { source: "Seat scan", function: "RevOps", role: "Fractional Head of RevOps", type: "Fractional" }),
  ...fillers.map((f, i) => seat(`e_fill${i}`, f.id, { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", start: "2025-01" })),
  // Birchway hired a fractional Sales leader two months ago: RevOps usually follows (Crystal Ball's likelihood).
  seat("e_birch_sales", "c_birch", { source: "Seat scan", function: "Sales", role: "Fractional CRO", type: "Fractional", start: new Date(Date.UTC(new Date(NOW).getUTCFullYear(), new Date(NOW).getUTCMonth() - 2, 15)).toISOString().slice(0, 7), status: "Active", end: "Ongoing" }),
];
const mem = (id: string, name: string, title = "Fractional Head of RevOps") => ({ id, name, email: `${id.slice(4)}@${id.slice(4)}co.example`, title, token: `tok-${id.slice(4)}-pages` });
const RATERS = Array.from({ length: 16 }, (_, k) => mem(`mem_r${k}`, `Rater ${k}`, "Fractional Leader"));
const seed = {
  builtAt: ago(60),
  members: [mem("mem_ana", "Ana Member"), mem("mem_bo", "Bo Other"), mem("mem_sam", "Sam Small"), mem("mem_zed", "Zed Zero"), mem("mem_nia", "Nia None"), mem("mem_cy", "Cy Client"), mem("mem_fre", "Fen Free"), mem("mem_fin", "Fin Finance", "Fractional CFO"), ...RATERS],
  companies,
  engagements,
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

/** One kept Crystal Ball row for today (lib/radar/types.ts RadarSentRow). */
const row = (m: string, c: string, band = "Medium") => ({ k: `test:${m}:${c}`, c, kind: "hire", l: "Hired a fractional Sales leader", b: band, w: "Sales usually comes before RevOps" });
const ballOf = (m: string, cs: string[]) => ({ sent: {}, days: { [today]: cs.map((c, i) => row(m, c, i % 2 ? "Low" : "Medium")) } });
const pro = { trialStartedAt: ago(40), trialEndsAt: ago(19), proUntil: new Date(NOW + 20 * DAY).toISOString(), interval: "month", paidSince: ago(19) };
/** A rate shared privately by rater k (made up). */
const br = (k: number, fn: string, kind: "monthly" | "hourly", amount: number, revenue: string) => ({ id: `b_${fn}_${kind}_${k}`, by: `mem_r${k}`, engagementId: null, fn, kind, amount, revenue, at: ago(30 + k) });
const AMOUNTS = [6100, 6600, 7100, 7300, 7600, 8100, 8600, 9100, 9600, 10600, 11100, 12100];
const benchRates = [
  // RevOps at $5M–$20M: 12 people a month (a range), 6 by the hour (a median, no range). At $20M–$50M: 3 (no figure).
  ...AMOUNTS.map((a, k) => br(k, "RevOps", "monthly", a, "$5M–$20M")),
  ...[141, 151, 166, 176, 191, 211].map((a, k) => br(k, "RevOps", "hourly", a, "$5M–$20M")),
  ...[13_300, 14_400, 15_500].map((a, k) => br(12 + k, "RevOps", "monthly", a, "$20M–$50M")),
  // The floors, one function each: 4 people (nothing), 5 (a median), 9 (still no range), 10 (a range).
  ...[31_100, 32_200, 33_300, 34_400].map((a, k) => br(k, "Sales", "monthly", a, "$5M–$20M")),
  ...[41_100, 42_200, 43_300, 44_400, 45_500].map((a, k) => br(k, "Marketing", "monthly", a, "$5M–$20M")),
  ...[51_100, 52_200, 53_300, 54_400, 55_500, 56_600, 57_700, 58_800, 59_900].map((a, k) => br(k, "Growth", "monthly", a, "$5M–$20M")),
  ...[61_100, 62_200, 63_300, 64_400, 65_500, 66_600, 67_700, 68_800, 69_900, 70_100].map((a, k) => br(k, "Operations", "monthly", a, "$5M–$20M")),
  // Finance: 2 people in all.
  ...[9100, 12_100].map((a, k) => br(k, "Finance", "monthly", a, "$5M–$20M")),
];
const ICP = { industries: ["SaaS"], employees: [], revenue: [], countries: [] };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    // Wrenfield was added by Bo, with his own seat still waiting to be confirmed: a new seat there waits too.
    companies: [{ id: "c_wren", name: "Wrenfield Dental Group", by: "mem_bo", at: ago(3) }],
    engagements: [{ id: "e_wren_bo", companyId: "c_wren", by: "mem_bo", at: ago(3) }],
    pendingSeats: [{ memberId: "mem_bo", engagementId: "e_wren_bo", companyId: "c_wren", at: ago(3) }],
    values: {
      "c_wren.website": { value: "wrenfield.example", by: "mem_bo", at: ago(3), status: "live" },
      "c_wren.revenue": { value: "$5M–$20M", by: "mem_bo", at: ago(3), status: "live" },
      "e_wren_bo.operator": { value: "Bo Other", by: "mem_bo", at: ago(3), status: "live", memberId: "mem_bo" },
      "e_wren_bo.function": { value: "RevOps", by: "mem_bo", at: ago(3), status: "live" },
      "e_wren_bo.status": { value: "Active", by: "mem_bo", at: ago(3), status: "live" },
    },
    unlocks: {},
    benchRates,
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, { function: m.id === "mem_fin" ? "Finance" : "RevOps", onboarded: true, icp: ICP }])),
    billing: { members: { ...Object.fromEntries(seed.members.filter((m) => m.id !== "mem_fre").map((m) => [m.id, pro])), mem_fre: { trialStartedAt: ago(40), trialEndsAt: ago(19) } }, events: [], payments: [], ended: [] },
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: {
        // Ana: two companies she knows someone at, and one she doesn't.
        mem_ana: ballOf("mem_ana", ["c_lark", "c_fill1", "c_corv"]),
        mem_bo: ballOf("mem_bo", ["c_lark"]),
        mem_sam: ballOf("mem_sam", ["c_lark", "c_fill1"]),
        mem_zed: ballOf("mem_zed", ["c_lark"]),
        // Nia knows people, none of them at a company in her Crystal Ball.
        mem_nia: ballOf("mem_nia", ["c_fill1", "c_fill2"]),
        mem_cy: ballOf("mem_cy", ["c_birch"]),
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);

/* ---------- the fake Google: each account holds its own calendar and contacts ---------- */
const SECRET_TITLE = "Secret board meeting about the merger";
const evAt = (d: number) => ({ dateTime: new Date(NOW + d * DAY).toISOString() });
const span = (from: number, to: number, n: number) => Array.from({ length: n }, (_, i) => -Math.round(from + ((to - from) * i) / Math.max(1, n - 1)));
const P = (name: string, email: string) => ({ email, displayName: name });
const contact = (name: string, email: string, org: string, title: string) => ({ names: [{ displayName: name }], emailAddresses: [{ value: email }], organizations: [{ name: org, title }] });
function account(email: string) {
  const me = { email, self: true, responseStatus: "accepted" };
  const events: unknown[] = [];
  const connections: unknown[] = [];
  return { email, events, connections, meet: (days: number[], ...who: { email: string; displayName: string }[]) => days.forEach((d) => events.push({ status: "confirmed", summary: SECRET_TITLE, start: evAt(d), attendees: [me, ...who] })) };
}
const dana = P("Dana Whitfield", "dana@larkfield.example");
const A = account("ana@anaco.example");
A.meet([-100, -130, -160], dana); // Warm
A.meet([-5, -20, -40, -70, -100], P("Priya Raman", "priya@corvid.example")); // Hot (five meetings: under the six a seat guess needs)
A.meet([-300, -310], P("Lena Voss", "lena@fadeaway.example")); // Fading
A.meet(span(70, 330, 30), P("Marcus Bell", "marcus@tallgrass.example")); // a seat: 30 meetings over about 9 months
A.meet(span(80, 300, 6), P("Marcus Bell", "marcus@tallgrass.example"), P("Ines Duarte", "ines@tallgrass.example"));
A.meet(span(460, 700, 20), P("Sam Okafor", "sam@northwind.example")); // a seat Revenue Nomad already found
A.meet(span(100, 200, 8), P("Wren Abara", "wren@wrenfield.example")); // a shorter one, at a company whose first seat waits
A.meet(span(130, 260, 12), P("Bram Stone", "bram@bramblewood.example")); // not a seat
A.meet([-30, -45], P("A Friend", "friend@notonmerlin.example"));
A.connections.push(contact("Dana Whitfield", dana.email, "Larkfield Robotics", "CEO"), contact("Omar Haddad", "omar@pinecrest.example", "Pinecrest Logistics", "Director of Sales")); // Pinecrest: Cold
const S = account("sam@samco.example");
S.meet([-30, -75, -160], dana);
S.connections.push(contact("Omar Haddad", "omar@pinecrest.example", "Pinecrest Logistics", "Director of Sales"));
const Z = account("zed@zedco.example");
Z.meet([-30, -45, -90], P("A Friend", "friend@notonmerlin.example"));
const N = account("nia@niaco.example");
N.meet([-300, -310], P("Lena Voss", "lena@fadeaway.example"));
N.connections.push(contact("Omar Haddad", "omar@pinecrest.example", "Pinecrest Logistics", "Director of Sales"));
const B = account("bo@boco.example");
// Cy: a fractional's calendar as it really is. A vendor's sales calls, a recruiter, an investor and another fractional (at no company on Merlin), a client every week, a prospect, a friend on personal email.
const C = account("cy@cyco.example");
C.meet([-24, -17, -10], P("Kyle Seller", "kyle@vendorly.example"), P("Mia Engineer", "mia@vendorly.example"));
C.meet([-70, -30], P("Tess Morgan", "tess@hirewell.example"));
C.connections.push(contact("Tess Morgan", "tess@hirewell.example", "Hirewell Staffing", "Senior Recruiter"));
C.meet([...Array.from({ length: 28 }, (_, i) => -(3 + i * 7)), 4], P("Nora Vance", "nora@quarrylabs.example"));
C.connections.push(contact("Nora Vance", "nora@quarrylabs.example", "Quarry Labs", "CEO"));
C.meet([-40, -95, -130], P("Rosa Lin", "rosa@birchway.example"));
C.connections.push(contact("Rosa Lin", "rosa@birchway.example", "Birchway Apps", "Founder and CEO"));
C.meet([-60, -150], P("Ben Cole", "ben@ridgelinecapital.example"));
C.connections.push(contact("Ben Cole", "ben@ridgelinecapital.example", "Ridgeline Capital", "Managing Partner"));
C.meet([-14, -45, -100], P("Idris Vane", "idris@vanefinance.example"));
C.connections.push(contact("Idris Vane", "idris@vanefinance.example", "Vane Finance", "Fractional CFO"));
C.meet([-8, -15], P("Chris Friend", "chris.friend@gmail.com"));
C.meet([-30, -60, -90], P("Pat Colleague", "pat@cyco.example"));
const ACCOUNTS: Record<string, ReturnType<typeof account>> = { ana: A, sam: S, zed: Z, nia: N, bo: B, cy: C };

const GRANT = "openid email https://www.googleapis.com/auth/calendar.events.readonly https://www.googleapis.com/auth/calendar.calendarlist.readonly https://www.googleapis.com/auth/contacts.readonly https://www.googleapis.com/auth/contacts.other.readonly";
const send = (res: ServerResponse, status: number, body: unknown) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(body));
};
const google = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  const u = new URL(req.url ?? "/", "http://x");
  let raw = "";
  for await (const ch of req) raw += ch;
  const body = new URLSearchParams(raw);
  const p = u.pathname;
  if (p === "/oauth2/token") {
    const who = (body.get("code") ?? body.get("refresh_token") ?? "").replace(/^(code|REFRESH)-/, "");
    const acc = ACCOUNTS[who];
    if (!acc) return send(res, 400, { error: "invalid_grant" });
    if (body.get("grant_type") === "authorization_code")
      return send(res, 200, { access_token: `ACCESS-${who}`, expires_in: 3600, refresh_token: `REFRESH-${who}`, scope: GRANT, id_token: `x.${Buffer.from(JSON.stringify({ email: acc.email, email_verified: true })).toString("base64url")}.y` });
    return send(res, 200, { access_token: `ACCESS-${who}`, expires_in: 3600 });
  }
  if (p === "/oauth2/revoke") return send(res, 200, {});
  const acc = ACCOUNTS[(req.headers.authorization ?? "").replace(/^Bearer ACCESS-/, "")];
  if (!acc) return send(res, 401, { error: { status: "UNAUTHENTICATED" } });
  if (p === "/calendar/calendar/v3/users/me/calendarList") return send(res, 200, { items: [{ id: acc.email, primary: true, accessRole: "owner" }] });
  if (p.startsWith("/calendar/calendar/v3/calendars/")) return send(res, 200, { items: decodeURIComponent(p.split("/")[5]) === "primary" ? acc.events : [] });
  if (p === "/people/v1/people/me/connections") return send(res, 200, { connections: acc.connections });
  if (p === "/people/v1/otherContacts") return send(res, 200, { otherContacts: [] });
  return send(res, 404, { error: "not_found" });
});
await new Promise<void>((r) => google.listen(0, "127.0.0.1", () => r()));
const GBASE = `http://127.0.0.1:${(google.address() as AddressInfo).port}`;

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
  RN_GOOGLE: "1",
  GOOGLE_CLIENT_ID: "client-test.apps.example",
  GOOGLE_CLIENT_SECRET: "secret-test",
  RN_GOOGLE_API_TEST: GBASE,
  // Each part of a read is held a moment, so the stage it reports can be seen.
  RN_GOOGLE_SYNC_SLOW_MS: "60",
  RN_ID_SECRET: "test-id-secret-not-real",
  // Billing live (made-up Stripe settings; nothing reaches Stripe): Free and Pro see different benchmarks.
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_pages",
  STRIPE_WEBHOOK_SECRET: "whsec_test_pages",
  STRIPE_PRICE_MONTH: "price_month_pages",
  STRIPE_PRICE_YEAR: "price_year_pages",
});
for (const k of ["RN_ADMIN_EMAILS", "RN_GOOGLE_GMAIL", "RN_GOOGLE_GMAIL_TESTERS", "GOOGLE_GMAIL_CLIENT_ID", "GOOGLE_GMAIL_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_RADAR", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_INTEL_SEED_KEY"]) delete process.env[k];

const TOK = (id: string) => `tok-${id}-pages`;
const ANA = TOK("ana");
const BO = TOK("bo");
const ORIGIN = "https://post.example.com";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");
const text = (html: string) =>
  html
    .replace(/<svg[\s\S]*?<\/svg>/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
const count = (hay: string, needle: string) => hay.split(needle).length - 1;
/** A panel's text without the revenue bands' own labels ("$5M–$20M"), so what is left of "$" is an amount. */
const noBands = (s: string) => s.replace(/\$\d+M–\$\d+M|under \$1M|\$50M\+/gi, "");

async function main() {
  const types = await import("../lib/google/types.ts");
  const t = await import("../lib/table.ts");
  const G = await import("../lib/google/index.ts");
  const radar = await import("../lib/radar/index.ts");
  const tools = await import("../lib/mcp/tools.ts");
  type NetworkView = import("../lib/google/types.ts").NetworkView;
  const net = async (token: string) => (await G.networkView(token)) as NetworkView;
  const connect = async (who: string) => {
    const st = await G.startConnect(TOK(who), ORIGIN);
    if (!st.ok) throw new Error(`no start for ${who}`);
    const done = await G.finishConnect(TOK(who), { state: st.state, code: `code-${who}`, error: null }, st.state, ORIGIN);
    if (done.outcome !== "connected") throw new Error(`not connected: ${who}`);
  };
  const idle = async (who: string) => {
    for (let i = 0; i < 400 && G.isSyncing(`mem_${who}`); i++) await new Promise((r) => setTimeout(r, 15));
  };
  /**
   * Everything another member is sent: their table, their network and their Crystal Ball. The
   * table's version stamp is left out: it counts every write to the state, whoever made it.
   */
  const others = async (token: string) => JSON.stringify([{ ...(await t.buildView(token, { fresh: true })), version: null }, await G.networkView(token), await radar.radarView(token)]);

  /* ---------- 1. the first read ---------- */
  console.log("\nThe first read: its stage, its time, shown once");
  const boBefore = await others(BO);
  const zedBefore = await others(TOK("zed"));
  check("before connecting: no first read, no seats, nothing syncing", (await net(ANA)).first === null && (await net(ANA)).seats.length === 0 && (await net(ANA)).stage === null);
  await connect("ana");
  const stages = new Set<string>();
  let midFirst: NetworkView["first"] = null;
  for (let i = 0; i < 400 && G.isSyncing("mem_ana"); i++) {
    const v = await net(ANA);
    if (v.syncing && v.stage) stages.add(v.stage);
    if (v.syncing) midFirst = v.first;
    await new Promise((r) => setTimeout(r, 10));
  }
  check("while it reads, the view says which part it is on: calendar, contacts, matching", ["calendar", "contacts", "matching"].every((s) => stages.has(s)), [...stages]);
  check("no time is given while it runs, and the result isn't marked seen", !!midFirst && midFirst.ms === null && midFirst.seen === false, midFirst);
  const v1 = await net(ANA);
  check("done: idle, no stage, and the time the read took was measured (three held parts)", !v1.syncing && v1.stage === null && typeof v1.first?.ms === "number" && v1.first.ms >= 150 && v1.first.ms < 60_000, v1.first);
  check("the words for it are the measured seconds", types.tookWords(58_200) === "58 seconds" && types.tookWords(900) === "1 second" && types.tookWords(125_000) === "about 2 minutes");
  const ms1 = v1.first!.ms;
  check("the result opens by itself until the member has seen it, then not again", v1.first!.seen === false && ((await G.sawFound(ANA)) as NetworkView).first!.seen === true && (await net(ANA)).first!.seen === true);
  await G.syncMember("mem_ana");
  check("a later read doesn't change the first read's time or bring the moment back", (await net(ANA)).first!.ms === ms1 && (await net(ANA)).first!.seen === true);
  check("nothing of a meeting's title is kept", !stateFile().includes(SECRET_TITLE));
  check("another member's table, network and Crystal Ball: the same bytes after Ana connected and saw her result", (await others(BO)) === boBefore && (await others(TOK("zed"))) === zedBefore);

  /* ---------- 2. the connect moment's numbers ---------- */
  console.log("\nThe connect moment: N and M");
  for (const who of ["sam", "zed", "nia"]) {
    await connect(who);
    await idle(who);
  }
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { Found } = await import("../app/post/network/Found.tsx");
  const { deriveAll, mySeats } = await import("../app/post/model.ts");
  const noop = () => {};
  const found = async (who: string) => {
    const view = await net(TOK(who));
    const ball = (await radar.radarView(TOK(who)))!;
    const table = await t.buildView(TOK(who));
    const html = renderToStaticMarkup(
      React.createElement(Found, { view, infos: deriveAll(table.companies), fn: table.me!.function, people: PM.peopleCount(view), again: false, onWarm: noop, onStay: noop, onClients: noop, onProfile: noop, onAdd: noop }),
    );
    return { view, ball, table, html, text: text(html) };
  };
  const PM = await import("../app/post/network/model.ts");
  const fa = await found("ana");
  const anaIds = new Set(fa.view.companies.map((c) => c.id));
  const byName = (v: NetworkView, n: string) => v.companies.find((c) => c.name === n);
  check("Ana: N is Your network's count (8 companies), the same count my_account gives", fa.view.companies.length === 8 && (await tools.myAccount({ member: (await t.memberById("mem_ana"))!, origin: ORIGIN })).your_network === "Google connected: 8 companies you know people at", fa.view.companies.map((c) => c.name));
  const W = fa.view.warm.length;
  check("Ana's warm paths: the two in her Crystal Ball lead, scored live for every company she knows; a saved contact alone (Pinecrest, Cold) isn't one", W >= 2 && fa.view.warm.slice(0, 2).every((id) => byName(fa.view, "Larkfield Robotics")!.id === id || byName(fa.view, "Corvid Health")!.id === id) && !fa.view.warm.includes(byName(fa.view, "Pinecrest Logistics")!.id) && fa.view.companies.filter((c) => c.ball).every((c) => fa.view.warm.includes(c.id)), fa.view.warm.map((id) => fa.view.companies.find((c) => c.id === id)!.name));
  check("each warm path has Crystal Ball's own likelihood for her function, in words, never a percentage", fa.view.warm.every((id) => { const c = fa.view.companies.find((x) => x.id === id)!; return !!c.odds && ["High", "Medium", "Low"].includes(c.odds.band) && !/%/.test(c.odds.why); }) && /RevOps usually follows|No hiring sign|RevOps can follow|window/.test(byName(fa.view, "Larkfield Robotics")!.odds!.why), byName(fa.view, "Larkfield Robotics")!.odds);
  check("Ana's page says both numbers, and one next button to exactly that many warm paths", fa.text.includes("We found 8 companies where you know someone.") && fa.text.includes(`${W} are warm paths into companies likely to hire a fractional RevOps leader.`) && fa.text.includes(`See your ${W} warm paths`), fa.text.slice(0, 400));
  check("the time on it is the measured one, in whole seconds", new RegExp(`mapped in ${types.tookWords(fa.view.first!.ms!)}`).test(fa.text), fa.text.slice(0, 120));
  check("the companies on it are hers, the warm paths first", fa.html.indexOf("Larkfield Robotics") > 0 && fa.html.indexOf("Corvid Health") > 0 && (fa.html.indexOf("Pinecrest Logistics") === -1 || fa.html.indexOf("Larkfield Robotics") < fa.html.indexOf("Pinecrest Logistics")) && fa.view.companies.every((c) => anaIds.has(c.id)));
  const fs = await found("sam");
  check("a small network says so plainly: 2 companies, 1 warm path, and the button says it", fs.view.companies.length === 2 && fs.view.warm.length === 1 && fs.text.includes("We found 2 companies where you know someone.") && fs.text.includes("1 is a warm path into a company likely to hire a fractional RevOps leader.") && /See your warm path/.test(fs.text), fs.text.slice(0, 300));
  const fz = await found("zed");
  check("nobody at a company on Merlin: said plainly, with what to do next, and no number invented", fz.view.companies.length === 0 && fz.text.includes("We didn't find anyone at a company on Merlin yet.") && /Add a company you know/.test(fz.text) && !/We found/.test(fz.text) && !/likely to hire/.test(fz.text), fz.text.slice(0, 300));
  const none = text(renderToStaticMarkup(React.createElement(Found, { view: { ...fa.view, warm: [] }, infos: [], fn: "RevOps", people: 0, again: false, onWarm: noop, onStay: noop, onClients: noop, onProfile: noop, onAdd: noop })));
  check("companies known, no warm path: it says so, with no button promising any, and the next step is Your network", /None of them fits your profile or shows a sign of hiring a fractional RevOps leader yet/.test(none) && !/See your/.test(none) && /Open Your network/.test(none), none.slice(0, 300));
  check("no duration is printed without a measured one", !/mapped in/.test(text(renderToStaticMarkup(React.createElement(Found, { view: { ...fa.view, first: { ms: null, seen: true } }, infos: [], fn: "RevOps", people: 0, again: false, onWarm: noop, onStay: noop, onClients: noop, onProfile: noop, onAdd: noop })))));

  /* ---------- the app's own store, primed with what the server sends Ana ---------- */
  const realFetch = globalThis.fetch;
  let served: unknown = fa.view;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("/api/integrations/google")) return new Response(JSON.stringify({ view: served }), { status: 200, headers: { "content-type": "application/json" } });
    return realFetch(input as RequestInfo, init);
  }) as typeof fetch;
  const store = await import("../app/post/network/useNetwork.ts");
  await store.load(true);
  const { UiCtx } = await import("../app/post/ui.tsx");
  const uiFor = (me: unknown) => ({ me, act: async () => ({ ok: true, message: "" }), layout: "wide", busy: new Set(), flash: new Set(), pulse: null, unlock: noop, unlockMany: async () => true, edit: noop, fill: async () => true, openCompany: noop, openAdd: noop, isHidden: () => false, holdsSeat: () => false, addable: () => [], seats: { n: 0, missing: 0 }, openSeats: noop, openPage: noop, contact: null });
  const render = (me: unknown, el: unknown) => renderToStaticMarkup(React.createElement(UiCtx.Provider, { value: uiFor(me) as never }, el as never));

  /* ---------- 3. the record ---------- */
  console.log("\nA record: Your way in, once");
  const D = await import("../app/post/Drawer.tsx");
  const anaInfos = deriveAll(fa.table.companies);
  const lark = anaInfos.find((i) => i.c.name === "Larkfield Robotics")!;
  const larkSeats = D.wayInSeatsOf(lark, fa.table.me!.function);
  const way = render(fa.table.me, React.createElement(D.YourWayIn, { i: lark, seats: larkSeats }));
  check("with Google connected and seats on file, the heading is printed once, in one section", larkSeats.length === 2 && count(text(way), "Your way in") === 1 && count(way, "<h3") === 1 && count(way, "<section") === 1, text(way).slice(0, 300));
  check("the people the member knows come first, then the seats someone held", way.indexOf("Dana Whitfield") > 0 && way.indexOf("Dana Whitfield") < way.indexOf("tp-wayin-row") && count(way, 'class="tp-wayin-row"') === 2 && /from your calendar, contacts/.test(text(way)));
  const tall0 = anaInfos.find((i) => i.c.name === "Tallgrass Analytics")!;
  const wayNoSeats = render(fa.table.me, React.createElement(D.YourWayIn, { i: tall0, seats: D.wayInSeatsOf(tall0, "RevOps") }));
  check("people known and no seat on file: still one heading", count(text(wayNoSeats), "Your way in") === 1 && /Marcus Bell/.test(wayNoSeats));
  // The buyer on the record: a seat's hirer is a decision maker (counted at the company too), its unlock priced before the click.
  const hirer = (cells: Record<string, unknown>) => ({ id: "p_made_hirer", engagementId: lark.c.engagements[0].id, source: "Member added", cells: { relationship: { s: "value", v: "Hiring for the seat", ver: 0 }, ...cells } });
  const withSeatHirer = (cells: Record<string, unknown>) => {
    const engs = lark.c.engagements.map((e, k) => (k === 0 ? { ...e, people: [...e.people, hirer(cells)] } : e));
    return deriveAll([{ ...lark.c, people: [], engagements: engs } as never])[0];
  };
  const lockedHirer = withSeatHirer({ name: { s: "locked", ver: 0 }, title: { s: "locked", ver: 0 }, email: { s: "locked", ver: 0 } });
  const wayLocked = text(render(fa.table.me, React.createElement(D.YourWayIn, { i: lockedHirer, seats: D.wayInSeatsOf(lockedHirer, "RevOps") })));
  check("the record's way in lists who hired the seat, its name and title one purchase at 1 credit", /Hired their fractional/.test(wayLocked) && /1 credit/.test(wayLocked) && !/Find who runs/.test(wayLocked), wayLocked.slice(0, 500));
  const namedHirer = withSeatHirer({ name: { s: "value", v: "Gale Hirer", ver: 0 }, title: { s: "value", v: "CEO", ver: 0 }, email: { s: "locked", ver: 0 } });
  const wayNamed = text(render(fa.table.me, React.createElement(D.YourWayIn, { i: namedHirer, seats: D.wayInSeatsOf(namedHirer, "RevOps") })));
  check("named: a drafted note to them, and their email at 1 credit", /Gale Hirer · CEO/.test(wayNamed) && /Draft a note to Gale/.test(wayNamed) && /Their email · 1 credit/.test(wayNamed), wayNamed.slice(0, 500));
  const { CellUiCtx } = await import("../app/post/ui.tsx");
  const drawerText = (i: unknown) =>
    text(renderToStaticMarkup(React.createElement(UiCtx.Provider, { value: uiFor(fa.table.me) as never }, React.createElement(CellUiCtx.Provider, { value: uiFor(fa.table.me) as never }, React.createElement(D.Drawer, { i, focus: null, onClose: noop, onStep: noop, pos: null, phone: false } as never)))));
  const dr = drawerText(lockedHirer);
  check("and the record's decision makers count them: no more 0 · Nobody is on file here yet", /Decision makers at Larkfield Robotics\s*1/.test(dr) && !/Nobody is on file here yet/.test(dr), dr.match(/Decision makers at[^.]{0,80}/)?.[0]);
  // Nobody who decides on file: where to look, as links out.
  const noBuyer = deriveAll([{ ...lark.c, people: [], engagements: lark.c.engagements.map((e) => ({ ...e, people: [] })) } as never])[0];
  const findHtml = render(fa.table.me, React.createElement(D.YourWayIn, { i: noBuyer, seats: D.wayInSeatsOf(noBuyer, "RevOps") }));
  check("nobody who decides on file: Find who runs RevOps, a LinkedIn search and their site, and Add them +1 credit", /Find who runs RevOps at Larkfield Robotics/.test(text(findHtml)) && findHtml.includes("https://www.linkedin.com/search/results/people/?keywords=") && /Their (website|team page)/.test(text(findHtml)) && /Add them\s*\+1 credit/.test(text(findHtml)) && !/LinkedIn data|from LinkedIn/i.test(text(findHtml)), text(findHtml).slice(0, 500));
  // A seat holder in the member's own contacts: the record says so, and the invite uses the address they have.
  const larkHeld = deriveAll([{ ...lark.c, engagements: lark.c.engagements.map((e) => (e.id === larkSeats[0].id ? { ...e, cells: { ...e.cells, operator: { s: "value", v: "Dana Whitfield", ver: 0 } }, invite: undefined } : e)) } as never])[0];
  served = { ...fa.view, companies: fa.view.companies.map((c) => (c.id === lark.c.id ? { ...c, people: c.people.map((p) => (p.name === "Dana Whitfield" ? { ...p, seat: { id: larkSeats[0].id, fn: "Marketing", now: true } } : p)) } : c)) };
  await store.load(true);
  const knownWay = text(render(fa.table.me, React.createElement(D.YourWayIn, { i: larkHeld, seats: D.wayInSeatsOf(larkHeld, "RevOps") })));
  const danaW = fa.view.companies.find((c) => c.id === lark.c.id)!.people.find((p) => p.name === "Dana Whitfield")!.warmth;
  check("a seat holder she knows: You know Dana (Warm), who holds their Marketing seat, and Email Dana, not Find them on LinkedIn", knownWay.includes(`You know Dana (${danaW}), who holds their Marketing seat. Only you see this.`) && /Email Dana/.test(knownWay) && /The address is from your own contacts/.test(knownWay) && !/Find them on LinkedIn/.test(knownWay), knownWay.slice(0, 700));
  served = fa.view;
  await store.load(true);

  const boTable0 = await t.buildView(BO);
  const boLark = deriveAll(boTable0.companies).find((i) => i.c.id === lark.c.id)!;
  check("a member who knows nobody there sees no people, whatever the store holds for someone else", !boTable0.companies.find((c) => c.id === lark.c.id)!.name.includes("Larkfield") && !JSON.stringify(boTable0).includes("Dana Whitfield") && !!boLark);

  /* ---------- 4. the chip ---------- */
  console.log("\nCrystal Ball's chip prints its warmth");
  const N2 = await import("../app/post/network/Network.tsx");
  const chips = fa.view.companies.map((c) => ({ c, html: renderToStaticMarkup(React.createElement(N2.KnowChip, { companyId: c.id })) }));
  const grades = new Set(fa.view.companies.map((c) => c.warmth));
  check("Ana's network has every grade", ["Hot", "Warm", "Fading", "Cold"].every((g) => grades.has(g as never)), fa.view.companies.map((c) => [c.name, c.warmth]));
  check("each chip prints the grade Your network gives the company: \"You know someone · Warm\"", chips.every(({ c, html }) => text(html) === `You know someone · ${c.warmth}` && text(html) === types.knowWords(c.warmth)), chips.map((x) => text(x.html)));
  check("the colour is a second cue, and the chip has a name a screen reader says", chips.every(({ c, html }) => html.includes(`nw-l-${c.warmth.toLowerCase()}`) && html.includes(`aria-label="You know someone here: ${c.warmth}"`)));
  check("a company the member knows nobody at has no chip", renderToStaticMarkup(React.createElement(N2.KnowChip, { companyId: fa.table.companies.find((c) => !anaIds.has(c.id))!.id })) === "");
  // "Where you know someone" cuts the range the member picked (Crystal Ball's page, app/post/Radar.tsx), not a day.
  const RP = await import("../app/post/Radar.tsx");
  const { rowsFor } = await import("../app/post/model.ts");
  const month = (await radar.radarView(ANA, null, undefined, "30d"))!;
  const page = (know: boolean) => {
    const rowsAll = RP.radarRows(month, rowsFor("companies", deriveAll(fa.table.companies)));
    return text(render(fa.table.me, React.createElement(RP.RadarPage, { view: month, failed: null, reload: noop, rows: rowsAll, me: fa.table.me!, phone: true, onBack: noop, onProfile: noop, onRange: noop, openCompany: noop, know, onKnow: noop })));
  };
  const inMonth = month.rows.filter((r) => anaIds.has(r.id)).length;
  const knowOn = page(true);
  const knowOff = page(false);
  check("Crystal Ball's Last 30 days: the pill says the range", month.range === "30d" && knowOff.includes(`From your Crystal Ball · Last 30 days · ${month.rows.length} companies`), knowOff.slice(0, 400));
  check("Where you know someone cuts that range to the companies she knows someone at", inMonth === 2 && knowOn.includes("From your Crystal Ball · Last 30 days · 2 companies") && /Where you know someone\s*2/.test(knowOn), knowOn.slice(0, 400));
  // The tabs show only when the ranges differ (todayModel.rangesWorthShowing): three equal counts say nothing new.
  const { rangesWorthShowing } = await import("../app/post/todayModel.ts");
  const tabsShown = rangesWorthShowing(month.ranges);
  check(
    "the three ranges are counted, and their tabs show only when the counts differ",
    (month.ranges ?? []).length === 3 && (tabsShown ? ["Today", "Last 7 days", "Last 30 days"].every((l) => knowOn.includes(l)) : !knowOn.includes("Last 7 days")),
    [tabsShown, (month.ranges ?? []).map((r) => r.companies)],
  );

  /* ---------- 5. what to charge them ---------- */
  console.log("\nWhat to charge them");
  const CM = await import("../app/post/chargeModel.ts");
  const { Charge } = await import("../app/post/Charge.tsx");
  const b = fa.table.benchmarks!;
  const at = (fnName: string, revenue: string | null = "$5M–$20M") => CM.chargeView(b, fnName, revenue)!;
  const rowOf = (fnName: string, revenue: string) => b.rows.find((r) => r.function === fnName && r.revenue === revenue)!;
  check("the floors are the Rate benchmarks page's own: a figure at 5 people, the range at 10", b.minN === t.BENCHMARK_MIN_N && b.rangeN === t.BENCHMARK_RANGE_N && b.minN === 5 && b.rangeN === 10 && !b.limited);
  check("4 people: no figure, and no amount is sent at all", at("Sales").sized!.monthly.state === "few" && at("Sales").all.monthly.state === "few" && rowOf("Sales", "$5M–$20M").monthly.median === undefined && rowOf("Sales", "$5M–$20M").monthly.p25 === undefined && rowOf("Sales", "All").monthly.median === undefined);
  check("5 people: a median, no range", at("Marketing").sized!.monthly.state === "median" && rowOf("Marketing", "$5M–$20M").monthly.p25 === undefined && rowOf("Marketing", "$5M–$20M").monthly.n === 5);
  check("9 people: still no range", at("Growth").sized!.monthly.state === "median" && rowOf("Growth", "$5M–$20M").monthly.p75 === undefined);
  check("10 people: the range", at("Operations").sized!.monthly.state === "range" && rowOf("Operations", "$5M–$20M").monthly.n === 10);
  const panel = (me: unknown, table: Awaited<ReturnType<typeof t.buildView>>, company: string) => {
    const infos = deriveAll(table.companies);
    const i = infos.find((x) => x.c.name === company) ?? infos.find((x) => x.c.cells.revenue?.s === "value" && x.c.cells.revenue.v === (company === "Northwind Supply" ? "$20M–$50M" : "$5M–$20M"))!;
    return render(me, React.createElement(Charge, { i, benchmarks: table.benchmarks, seats: mySeats(infos, table.me!) }));
  };
  const as = (fnName: string) => ({ ...fa.table.me!, function: fnName });
  const pSales = text(panel(as("Sales"), fa.table, "Larkfield Robotics"));
  check("below the floor the panel says so, with the count it needs, and offers Share yours privately", /Not enough people have reported/.test(pSales) && /4 of the 5 people it needs/.test(pSales) && /Share yours privately · \+1 credit/.test(pSales), pSales);
  check("and it prints no amount at all (none of the four rates, no median, no dollar sign)", !/\$\d/.test(noBands(pSales)) && ![31_100, 32_200, 33_300, 34_400].some((a) => pSales.includes(a.toLocaleString("en-US"))), pSales);
  const pMkt = text(panel(as("Marketing"), fa.table, "Larkfield Robotics"));
  check("at the floor: the median alone, and when the range will show", /were paid a median of \$\d/.test(pMkt) && /From 5 people/.test(pMkt) && /The range shows once 10 people have reported/.test(pMkt) && !/\$[\d,]+ – \$/.test(pMkt) && !/Middle half/.test(pMkt), pMkt);
  const pRev = text(panel(fa.table.me, fa.table, "Larkfield Robotics"));
  check("enough reports: the range for the function and the company's revenue band, said as what others were paid", /Fractional RevOps leaders at companies with \$5M–\$20M revenue were paid \$[\d,]+ – \$[\d,]+ a month/.test(pRev) && /The middle half of 12 people\. The median is \$[\d,]+/.test(pRev), pRev);
  check("the words never tell the member what to charge (the heading names the panel; no 'quote', no 'you should', no 'charge $')", count(pRev, "charge") === 1 && /^What to charge them/.test(pRev) && !/quote|you should|we recommend|charge \$/i.test(pRev), pRev);
  check("by the hour, 6 people: a median and no range", /By the hour Median \$\d+/.test(pRev) && /the range shows at 10 people/.test(pRev));
  check("no single rate is printed: every amount on the panel is a rounded figure, none of the 12 rates", !AMOUNTS.some((a) => pRev.includes(`$${a.toLocaleString("en-US")}`)), pRev);
  const pNorth = text(panel(fa.table.me, fa.table, "Northwind Supply"));
  check("not enough for this company's size: it says so (3 of the 5), shows no figure for that size, and falls back to every size", /Not enough reports yet for RevOps at companies with \$20M–\$50M revenue: 3 of the 5 people it needs/.test(pNorth) && /at companies of every size were paid/.test(pNorth) && ![13_300, 14_400, 15_500].some((a) => pNorth.includes(a.toLocaleString("en-US"))) && /Share yours privately/.test(pNorth), pNorth);
  // Free: the median by function only.
  const freTable = await t.buildView(TOK("fre"));
  const fb = freTable.benchmarks!;
  check("Free is sent what the Rate benchmarks page sends it: medians by function, no range, no client-size rows", fb.limited === true && fb.rows.every((r) => r.revenue === "All" && r.monthly.p25 === undefined && r.hourly.p75 === undefined) && freTable.me!.plan?.name === "free");
  const pFree = text(panel(freTable.me, freTable, "Larkfield Robotics"));
  check("so Free's panel has the median for the function across every size, no range, and the Pro line", /at companies of every size were paid a median of \$[\d,]+ a month/.test(pFree) && !/\$[\d,]+ – \$/.test(pFree) && !/with \$5M–\$20M revenue were paid/.test(pFree) && /Free shows the median for each function\. Pro adds the range, by function and by client size\./.test(pFree), pFree);
  const pFreeOps = CM.chargeView(fb, "Operations", "$5M–$20M")!;
  check("with 10 people Free still gets no range (it is Pro's), and no figure for the size", pFreeOps.sized === null && pFreeOps.all.monthly.state === "median" && pFreeOps.all.monthly.rangeLocked === true);
  check("a member with no function, or before the benchmarks arrive: no panel", CM.chargeView(b, null, "$5M–$20M") === null && CM.chargeView(undefined, "RevOps", "$5M–$20M") === null && panel({ ...fa.table.me!, function: null }, fa.table, "Larkfield Robotics") === "");
  // The member's own rate.
  const boBench = JSON.stringify((await t.buildView(BO)).benchmarks);
  const boRest = async () => {
    const { benchmarks: _b, version: _v, ...rest } = await t.buildView(BO, { fresh: true }); // eslint-disable-line @typescript-eslint/no-unused-vars
    return JSON.stringify([rest, await G.networkView(BO), await radar.radarView(BO)]);
  };
  const boRest0 = await boRest();
  const shared = await t.perform(ANA, { type: "benchRate", function: "RevOps", pricing: "Monthly retainer", rate: "$7,777/mo", revenue: "$5M–$20M" });
  check("Share yours privately is the existing action, and earns its credit", /Added to the benchmarks/.test(shared.message) && /You earned 1 credit/.test(shared.message), shared.message);
  const anaT = await t.buildView(ANA);
  const pOwn = text(panel(anaT.me, anaT, "Larkfield Robotics"));
  const ownFig = CM.chargeView(anaT.benchmarks, "RevOps", "$5M–$20M")!.sized!.monthly;
  check("her own rate is placed in the range, for her alone", /Your rate, \$7,777/.test(pOwn) && /Only you see it/.test(pOwn) && ownFig.state === "range" && pOwn.includes(CM.sitsWords(7777, ownFig)!), pOwn);
  check("the figure she sees leaves her own rate out (still 12 people), and says so", ownFig.n === 12 && ownFig.stat.withoutYours === true && /Your own rate is left out of what you see here/.test(pOwn));
  check("where it sits is a description, never a figure to quote", ["Your rate is below the middle half of what they were paid.", "Your rate is in the middle half, under the median.", "Your rate is at the median of what they were paid.", "Your rate is in the middle half, over the median.", "Your rate is above the middle half of what they were paid."].join("|") === [1, 6, 8, 9, 20].map((x) => CM.sitsWords(x, { state: "range", p25: 5, median: 8, p75: 10, n: 12, stat: { n: 12, min: 5 } })).join("|") && CM.sitsWords(5, { state: "few", n: 2, min: 5, stat: { n: 2, min: 5 } }) === null);
  const boT = await t.buildView(BO);
  const pBo = text(panel(boT.me, boT, "Larkfield Robotics"));
  check("nobody else is sent it: Bo's table has no trace of 7,777, his panel shows no rate of his own", !JSON.stringify(boT).includes("7777") && !/Your rate/.test(pBo) && !pBo.includes("7,777") && boT.me!.benchRates.length === 0, pBo);
  check("Bo's benchmarks moved only by one more person in the figure (13), and nothing else in his view changed", JSON.stringify(boT.benchmarks) !== boBench && boT.benchmarks!.rows.find((r) => r.function === "RevOps" && r.revenue === "$5M–$20M")!.monthly.n === 13 && (await boRest()) === boRest0);
  const finT = await t.buildView(TOK("fin"));
  const pFin = text(panel(finT.me, finT, "Larkfield Robotics"));
  check("a function with 2 reports in all: no figure anywhere, the counts, and the share offer", /Not enough people have reported what they were paid as fractional Finance leaders to show a figure: 2 of the 5 people it needs/.test(pFin) && !/\$\d/.test(noBands(pFin)) && /Share yours privately/.test(pFin), pFin);

  /* ---------- 6. seats the calendar suggests ---------- */
  console.log("\nConfirm, don't type");
  const s0 = await t.loadState();
  const seatsBefore = s0.engagements.length;
  const v6 = await net(ANA);
  const guess = (name: string) => v6.seats.find((g) => g.name === name);
  check("four guesses, each a company met with over months; nothing has been added", v6.seats.length === 4 && ["Tallgrass Analytics", "Northwind Supply", "Wrenfield Dental Group", "Bramblewood Labs"].every((n) => !!guess(n)) && seatsBefore === 1, v6.seats.map((g) => [g.name, g.meetings, g.from, g.to, g.sure, g.waits]));
  const tall = guess("Tallgrass Analytics")!;
  check("a guess is the months and the count Your network shows, who they met most, and the function and title from their profile", tall.meetings === 36 && /^\d{4}-\d{2}$/.test(tall.from) && tall.from < tall.to && tall.months >= 9 && tall.function === "RevOps" && tall.role === "Fractional Head of RevOps" && tall.with[0].name === "Marcus Bell" && tall.with.length === 2 && tall.sure && !tall.waits && !tall.active, tall);
  check("and nothing else: no meeting title, no date of a meeting, no email address", Object.keys(tall).sort().join() === "active,from,function,id,meetings,months,name,role,site,sure,to,waits,with" && !JSON.stringify(v6.seats).includes("@") && !/\d{4}-\d{2}-\d{2}/.test(JSON.stringify(v6.seats)));
  check("the shorter one is marked Less sure, and the one at a company whose first seat waits says so", guess("Wrenfield Dental Group")!.sure === false && guess("Wrenfield Dental Group")!.waits === true && guess("Northwind Supply")!.waits === false);
  check("what Confirm sends: the member as holder, function, title, first month, and the last month of a seat that ended", JSON.stringify(types.seatConfirmFields(tall, "Ana Member")) === JSON.stringify({ operator: "Ana Member", function: "RevOps", role: "Fractional Head of RevOps", start: tall.from, end: tall.to }) && JSON.stringify(types.seatConfirmFields({ ...tall, active: true }, "Ana Member", "Fractional COO")) === JSON.stringify({ operator: "Ana Member", function: "RevOps", role: "Fractional COO", start: tall.from, status: "Active" }));
  const mine = await tools.myNetwork({ member: (await t.memberById("mem_ana"))!, origin: ORIGIN });
  const mineSeats = mine.seats_you_might_have_held as { company_id: string; company: string; less_sure?: boolean; credits?: string }[];
  check("the Claude connector lists the same guesses, as guesses, without who they met", mineSeats.length === 4 && mineSeats.every((x) => v6.seats.some((g) => g.id === x.company_id)) && mineSeats.find((x) => x.company === "Wrenfield Dental Group")!.credits === "when confirmed" && !JSON.stringify(mine).includes("Marcus") && /Nothing is added unless the member says/.test(String(mine.seats_note)), mine.seats_note);
  // The cards.
  const SG = await import("../app/post/network/SeatGuesses.tsx");
  served = v6;
  await store.load(true);
  const cards = render(anaT.me, React.createElement(SG.SeatGuesses, { infos: deriveAll(anaT.companies), seats: [] }));
  const cardsText = text(cards);
  check("the page says it in the member's words, and that nothing is added until they confirm", cardsText.includes("We think you held these 4 seats") && /Nothing is added until you do/.test(cardsText) && count(cards, "Confirm this seat") === 4 && count(cards, "Not a seat") === 4);
  check("each card has the meeting pattern that suggested it", cardsText.includes(SG.guessLine(tall)) && /\d+ meetings over \d+ months/.test(SG.guessLine(tall)) && cardsText.includes("Less sure"));
  check("the credits each card promises: 5 now, up to 5 where a found seat is claimed, 5 when confirmed where the seat waits", /\+5 credits now, up to ~12 with the rest/.test(cardsText) && /up to \+5 We have a seat on file there that may be yours/.test(cardsText) && /\+5 when confirmed/.test(cardsText), cardsText);
  check("without the connector's answer the page shows no guesses at all", (() => {
    served = { on: false };
    return true;
  })() && (await store.load(true), render(anaT.me, React.createElement(SG.SeatGuesses, { infos: [], seats: [] })) === ""));

  // Not a seat.
  const boSnap = await others(BO);
  const zedSnap = await others(TOK("zed"));
  const bram = guess("Bramblewood Labs")!;
  const afterNo = (await G.notASeat(ANA, bram.id)) as NetworkView;
  check("Not a seat: the guess goes, nothing is added, no credit moves", afterNo.seats.length === 3 && !afterNo.seats.some((g) => g.id === bram.id) && (await t.loadState()).engagements.length === seatsBefore && (await t.buildView(ANA)).me!.credits === anaT.me!.credits);
  await G.syncMember("mem_ana");
  check("it stays dismissed after the next read, and the company is still in her network", !(await net(ANA)).seats.some((g) => g.id === bram.id) && (await net(ANA)).companies.some((c) => c.id === bram.id));
  check("only a company in her own network can be dismissed", await G.notASeat(ANA, "not-a-company").then(() => false, (e) => e instanceof t.ActionError) && await G.notASeat(BO, bram.id).then(() => false, (e) => e instanceof t.ActionError));
  check("other members: the same bytes after Not a seat and the read", (await others(BO)) === boSnap && (await others(TOK("zed"))) === zedSnap);

  // Confirm: a new seat.
  const credits0 = (await t.buildView(ANA)).me!.credits;
  const add = (g: (typeof v6.seats)[number]) => t.perform(ANA, { type: "add", company: g.name, newEngagement: true, engagementFields: types.seatConfirmFields(g, "Ana Member"), operatorMemberId: "me" });
  const r1 = await add(tall);
  const a1 = await t.buildView(ANA);
  const tallCo = a1.companies.find((c) => c.name === "Tallgrass Analytics")!;
  const mySeat = tallCo.engagements.find((e) => e.yours);
  const val = (cell: { s: string; v?: string } | undefined) => (cell?.s === "value" ? cell.v : null);
  check("Confirm adds the seat through the existing Add, and pays what the card said: 5 credits", /Added a seat at Tallgrass Analytics/.test(r1.message) && /You earned 5 credits/.test(r1.message) && a1.me!.credits === credits0 + 5, r1.message);
  check("the seat is hers, with the function, title and months filled in", !!mySeat && val(mySeat.cells.function) === "RevOps" && val(mySeat.cells.role) === "Fractional Head of RevOps" && val(mySeat.cells.start) === tall.from && val(mySeat.cells.end) === tall.to && val(mySeat.cells.status) === "Ended", mySeat?.cells);
  check("one seat was added, by her own action, and the guess is gone", (await t.loadState()).engagements.length === seatsBefore + 1 && !(await net(ANA)).seats.some((g) => g.id === tall.id));
  const boAfter1 = await t.buildView(BO, { fresh: true });
  check("other members see the seat by the usual rules: its function free, her name behind its lock; who she met is nowhere", (() => {
    const c = boAfter1.companies.find((x) => x.id === tallCo.id)!;
    const e = c.engagements.find((x) => x.cells.operator?.s === "locked");
    return !!e && val(e.cells.function) === "RevOps" && !JSON.stringify(boAfter1).includes("Ana Member") && !JSON.stringify(boAfter1).includes("Marcus Bell");
  })());
  const strip = async (token: string, companyId: string) => {
    const v = await t.buildView(token, { fresh: true });
    return JSON.stringify([{ ...v, companies: v.companies.filter((c) => c.id !== companyId), stats: null, version: null }, await G.networkView(token), await radar.radarView(token)]);
  };

  // Confirm: a seat Revenue Nomad already found is claimed, not added twice.
  const north = guess("Northwind Supply")!;
  const northId = north.id;
  check("the found seat there is one she could claim", (await t.buildView(ANA)).companies.find((c) => c.id === northId)!.engagements.some((e) => e.claimable && val(e.cells.function) === "RevOps"));
  const boStrip0 = await strip(BO, northId);
  const r2 = await add(north);
  const a2 = await t.buildView(ANA);
  const northSeats = a2.companies.find((c) => c.id === northId)!.engagements;
  check("Confirm claims it: her name on the seat on file, credits only for what it was missing (its start, its end, that it ended)", /already on file, so we put your name on it/.test(r2.message) && /You earned 3 credits/.test(r2.message) && /2 facts were already there/.test(r2.message) && a2.me!.credits === credits0 + 5 + 3, r2.message);
  check("no second seat was made there", northSeats.length === 1 && northSeats[0].yours === true && (await t.loadState()).engagements.length === seatsBefore + 1);
  check("for other members only that company's record changed", (await strip(BO, northId)) === boStrip0);

  // Confirm where the company's first seat still waits: "+N when confirmed".
  const wren = guess("Wrenfield Dental Group")!;
  const r3 = await add(wren);
  const a3 = await t.buildView(ANA);
  const s3 = await t.loadState();
  check("where a seat waits, Confirm earns nothing now and says +5 when confirmed, as the card did", /\+5 when confirmed/.test(r3.message) && r3.message.includes(t.PENDING_WHY) && a3.me!.credits === credits0 + 8 && a3.me!.pending === 5, { message: r3.message, pending: a3.me!.pending });
  check("her seat there waits with the others (the existing pending rule)", (s3.pendingSeats ?? []).some((p) => p.memberId === "mem_ana" && p.companyId === "c_wren"));
  check("every guess is answered: none left, and the dismissed one never came back", (await net(ANA)).seats.length === 0);
  const s4 = await t.loadState();
  check("only the three she confirmed were added or claimed: nothing at the company she dismissed", s4.engagements.filter((e) => e.by === "mem_ana").length === 2 && !s4.engagements.some((e) => e.companyId === "c_bram") && !Object.keys(s4.values).some((k) => k.startsWith("c_bram.")));
  check("her network is hers alone in the state: Bo's and Zed's entries hold nothing of it", !JSON.stringify(s4.network?.mem_bo ?? {}).includes("c_tall") && !JSON.stringify(s4.network?.mem_zed ?? {}).includes("larkfield") && (s4.network?.mem_ana?.notSeats ?? []).join() === "c_bram");

  // Disconnect and delete everything: what this page kept goes too. The seats she confirmed are hers and stay.
  const gone = (await G.disconnectAll(TOK("sam"))) as NetworkView;
  check("Disconnect and delete everything erases the first read and the dismissals with the rest", gone.first === null && gone.seats.length === 0 && !(await t.loadState()).network?.mem_sam && !!(await t.loadState()).network?.mem_ana?.notSeats);

  /* ---------- 8. accuracy and the four parts, on Cy's network ---------- */
  console.log("\nVendors, recruiters and investors set aside with why; Not a relationship kept; warm paths, clients, introducers, everyone");
  const CY = TOK("cy");
  await connect("cy");
  await idle("cy");
  const boCy0 = await others(BO);
  let cv = await net(CY);
  const cy = (n: string) => cv.companies.find((c) => c.name === n)!;
  check("Cy's own firm (her email's domain) and personal email are never a company", !cv.companies.some((c) => /cyco|gmail/.test(c.site ?? "")) && cv.companies.length === 4, cv.companies.map((c) => c.name));
  check("the big software company's sales calls are set aside as someone selling to her, with Merlin's reason", cy("Vendorly").set?.kind === "vendor" && cy("Vendorly").set?.by === "merlin" && /1,001\+ people/.test(cy("Vendorly").set!.why), cy("Vendorly").set);
  check("three calls in two weeks never read Hot", cy("Vendorly").warmth !== "Hot");
  check("the staffing firm is set aside as a recruiter", cy("Hirewell Staffing").set?.kind === "recruiter");
  check("neither is a warm path, a chip on Crystal Ball, or a way in on Home's moves", !cv.warm.includes(cy("Vendorly").id) && !cv.warm.includes(cy("Hirewell Staffing").id) && types.networkWarmth(await t.loadState(), "mem_cy")("c_vend") === null && types.networkWarmth(await t.loadState(), "mem_cy")("c_birch") !== null);
  check("the prospect with a fresh Sales hire is a warm path, with Crystal Ball's reason and the person to write to", cv.warm[0] === cy("Birchway Apps").id && /RevOps (usually|can) follow/.test(cy("Birchway Apps").odds!.why) && PM.bestPerson(cy("Birchway Apps"))!.name === "Rosa Lin", cy("Birchway Apps").odds);
  // Undo what Merlin set aside, and back.
  await G.markNetwork(CY, { company: cy("Vendorly").id, as: "rel" });
  cv = await net(CY);
  check("Undo on Merlin's judgement: it is a relationship again, and stays so on the next read", cy("Vendorly").set === null && (await G.syncMember("mem_cy"), (await net(CY)).companies.find((c) => c.name === "Vendorly")!.set === null));
  await G.markNetwork(CY, { company: cy("Vendorly").id, as: "undo" });
  cv = await net(CY);
  check("and Undo of that puts Merlin's judgement back", cy("Vendorly").set?.by === "merlin");
  // Not a relationship, remembered across reads.
  await G.markNetwork(CY, { company: cy("Birchway Apps").id, as: "oneoff" });
  await G.markNetwork(CY, { person: "chris.friend@gmail.com", as: "other" });
  await G.syncMember("mem_cy");
  cv = await net(CY);
  check("Not a relationship on a company and on a person survive the next read", cy("Birchway Apps").set?.by === "you" && cy("Birchway Apps").set?.kind === "oneoff" && cv.loose.find((p) => p.key === "chris.friend@gmail.com")!.hidden === true && !cv.warm.includes(cy("Birchway Apps").id));
  check("what she set aside is under Everyone's Set aside, and out of the default list", PM.everyone(cv).companies.every((x) => x.c.name !== "Birchway Apps") && PM.everyone(cv, { ...PM.NO_FILTER, hidden: true }).companies.some((x) => x.c.name === "Birchway Apps") && PM.everyone(cv, { ...PM.NO_FILTER, hidden: true }).loose.some((p) => p.key === "chris.friend@gmail.com"));
  check("only a company or person in her own network can be marked", (await G.markNetwork(CY, { company: "not-a-company", as: "vendor" }).then(() => false, (e) => e instanceof t.ActionError)) && (await G.markNetwork(BO, { company: cy("Vendorly").id, as: "vendor" }).then(() => false, (e) => e instanceof t.ActionError)) && (await G.markNetwork(CY, { company: cy("Vendorly").id, as: "nonsense" }).then(() => false, (e) => e instanceof t.ActionError)));
  await G.markNetwork(CY, { company: cy("Birchway Apps").id, as: "undo" });
  cv = await net(CY);
  // The warm-path list is never empty when its count says otherwise, and the button leads to that many rows.
  const me8 = (await t.buildView(CY)).me!;
  const infos8 = deriveAll((await t.buildView(CY)).companies);
  const PT = await import("../app/post/network/Paths.tsx");
  served = cv;
  await store.load(true);
  const warmHtml = render(me8, React.createElement(PT.WarmPaths, { view: cv, infos: infos8, me: me8, openCompany: noop, onProfile: noop, onClaude: noop, onEveryone: noop }));
  check("Warm paths draws as many rows as its count says (count above zero, never an empty list)", cv.warm.length > 0 && count(warmHtml, "data-warm=") === Math.min(10, cv.warm.length) && text(warmHtml).includes(`Warm paths into companies likely to hire you ${cv.warm.length}`), text(warmHtml).slice(0, 300));
  const f8 = text(renderToStaticMarkup(React.createElement(Found, { view: cv, infos: infos8, fn: "RevOps", people: PM.peopleCount(cv), again: false, onWarm: noop, onStay: noop, onClients: noop, onProfile: noop, onAdd: noop })));
  check("the result's button names the same number of warm paths the list draws", f8.includes(cv.warm.length === 1 ? "See your warm path" : `See your ${cv.warm.length} warm paths`), f8.slice(0, 300));
  const empty = render(me8, React.createElement(PT.WarmPaths, { view: { ...cv, warm: [] }, infos: infos8, me: me8, openCompany: noop, onProfile: noop, onClaude: noop, onEveryone: noop }));
  check("with none it says so plainly, and offers the next step", /None of the companies you know/.test(text(empty)) && /See everyone you know/.test(text(empty)) && !empty.includes("data-warm="));
  // Crystal Ball's Where you know someone with nobody known leads to the warm paths, never a blank page.
  const niaBall = (await radar.radarView(TOK("nia"), null, undefined, "today"))!;
  const niaT = await t.buildView(TOK("nia"));
  served = await net(TOK("nia"));
  await store.load(true);
  const niaPage = text(render(niaT.me, React.createElement(RP.RadarPage, { view: niaBall, failed: null, reload: noop, rows: RP.radarRows(niaBall, rowsFor("companies", deriveAll(niaT.companies))), me: niaT.me!, phone: true, onBack: noop, onProfile: noop, onRange: noop, openCompany: noop, know: true, onKnow: noop, onWarm: noop })));
  check("Crystal Ball cut to where she knows someone, with nobody there: it says so and leads to her warm paths", /Nobody you know is at a company in your Crystal Ball today/.test(niaPage) && /See your warm paths/.test(niaPage) && /Show all 2 here/.test(niaPage), niaPage.slice(0, 500));
  served = cv;
  await store.load(true);
  // The people number leads to the people.
  const nums8 = PM.topNumbers(cv);
  const top = text(render(me8, React.createElement(PT.TopNumbers, { n: nums8, go: noop })));
  const every = render(me8, React.createElement(PT.Everyone, { view: cv, openCompany: noop, filter: PM.NO_FILTER, setFilter: noop }));
  const rowsDrawn = count(every, "np-p-name");
  check("the people number at the top is the Everyone list's own count, and every one of them is drawn", nums8.people === PM.peopleCount(cv) && top.includes(`${nums8.people} people you know, searchable`) && text(every).includes(`Everyone you know ${nums8.people}`) && rowsDrawn === nums8.people, { people: nums8.people, rowsDrawn });
  check("people at no company on Merlin are listed (a friend on personal email, the investor, the fractional), her colleague is not", cv.loose.some((p) => p.name === "Chris Friend" && !p.domain) && cv.loose.some((p) => p.name === "Ben Cole") && !cv.loose.some((p) => /cyco/.test(p.email ?? "")));
  // People who can introduce you.
  const ben = cv.intros.find((p) => p.name === "Ben Cole");
  const idris = cv.intros.find((p) => p.name === "Idris Vane");
  check("introducers: the investor and the other fractional, each with what they can open said honestly; nobody else", !!ben && ben.kind === "investor" && !!idris && idris.kind === "fractional" && cv.intros.length === 2 && /Merlin doesn't know/.test(ben.opens) && /Merlin doesn't know/.test(idris.opens), cv.intros.map((p) => [p.name, p.kind]));
  const ask = PT.askNote(ben!, me8);
  const MN = await import("../lib/moveNote.ts");
  const askText = MN.draftNote(ask.facts).body;
  check("Ask for an intro drafts a note in her voice that asks, and claims nothing Merlin doesn't know", /introduction/.test(askText) && /^Hi Ben,/.test(askText) && !/Ridgeline Capital backs|portfolio company [A-Z]/.test(askText) && !askText.includes("Birchway"), askText);
  // Your clients: confirm with her click only, then what her meetings can add, each with her click only.
  const quarry = cy("Quarry Labs");
  const s8 = await t.loadState();
  check("the client every week is under Your clients, not confirmed, and nothing is on Merlin for it yet", !!quarry.client && quarry.client.seat === null && quarry.client.active && !s8.engagements.some((e) => e.companyId === "c_quarry") && !cv.warm.includes(quarry.id));
  const cardsHtml = render(me8, React.createElement(PT.Clients, { view: cv, infos: infos8, me: me8, refresh: noop }));
  check("its card offers Confirm this seat and Not a seat, and nothing else is added by showing it", /Confirm this seat/.test(text(cardsHtml)) && /Not a seat/.test(text(cardsHtml)) && (await t.loadState()).engagements.length === s8.engagements.length);
  const guessQ = cv.seats.find((g) => g.id === quarry.id)!;
  const boAfterMarks = await others(BO);
  const conf = await t.perform(CY, { type: "add", company: "Quarry Labs", newEngagement: true, engagementFields: types.seatConfirmFields({ ...guessQ, active: true }, "Cy Client", guessQ.role), operatorMemberId: "me" });
  cv = await net(CY);
  const seatId = cy("Quarry Labs").client!.seat;
  check("Confirm adds her seat by the existing Add, as active from the first month", /Added a seat at Quarry Labs/.test(conf.message) && !!seatId && (await t.loadState()).engagements.filter((e) => e.companyId === "c_quarry").length === 1, conf.message);
  const t8 = await t.buildView(CY);
  const quarryInfo = deriveAll(t8.companies).find((i) => i.c.id === quarry.id)!;
  const offerHtml = text(render(t8.me, React.createElement(PT.Clients, { view: cv, infos: deriveAll(t8.companies), me: t8.me!, refresh: noop })));
  check("her confirmed seat offers who she works with there, as contributions she chooses, and Nora is not on the record before the click", /Add Nora Vance \(CEO\) as/.test(offerHtml) && /credits/.test(offerHtml) && !quarryInfo.people.some(({ p }) => p.cells.name?.s === "value" && p.cells.name.v === "Nora Vance") && !JSON.stringify((await t.loadState()).values).includes("Nora Vance"), offerHtml.slice(0, 400));
  const added = await t.perform(CY, { type: "addPerson", companyId: quarry.id, engagementId: seatId, person: { name: "Nora Vance", title: "CEO", relationship: "Reported to" } });
  check("her click adds Nora as who she reports to, with the usual credits", /Added Nora Vance at Quarry Labs/.test(added.message) && /You earned/.test(added.message), added.message);
  check("other members see only what she added, by the usual locks; Bo's network is untouched", !JSON.stringify(await G.networkView(BO)).includes("Nora") && !JSON.stringify((await t.buildView(BO, { fresh: true })).companies.find((c) => c.id === quarry.id)).includes("Nora Vance"));
  // Privacy: nothing of Cy's network in another member's view, the export or the connector beyond what it allows.
  check("another member's table, network and Crystal Ball: the same bytes after all of Cy's marks and reads (before her own Add)", boCy0 === boAfterMarks);
  const exp8 = JSON.stringify(await t.exportState());
  check("the export leaves her network out: no person, no judgement", !exp8.includes("ben@ridgelinecapital") && !exp8.includes("Chris Friend") && !exp8.includes('"notRel"') && !exp8.includes('"loose"'));
  const mine8 = JSON.stringify(await tools.myNetwork({ member: (await t.memberById("mem_cy"))!, origin: ORIGIN }));
  check("the connector lists her warm paths and what is set aside, never a person from her Google account", /warm_paths/.test(mine8) && /looks like someone selling to the member/.test(mine8) && !/Kyle|Rosa|Ben Cole|Idris|Chris|Nora|Tess|@/.test(mine8), mine8.slice(0, 600));

  /* ---------- off ---------- */
  console.log("\nRN_GOOGLE off");
  delete process.env.RN_GOOGLE;
  check("off: no view, so no chip, no people on a record, no guesses, no moment", JSON.stringify(await G.networkView(ANA)) === JSON.stringify({ on: false }) && (await G.notASeat(ANA, bram.id).then(() => false, () => true)));
  served = { on: false };
  await store.load(true);
  const offWay = render(a3.me, React.createElement(D.YourWayIn, { i: deriveAll(a3.companies).find((i) => i.c.id === lark.c.id) ?? lark, seats: [] }));
  check("and the pages draw nothing of it", !/Dana Whitfield|from your|You know/.test(offWay) && !offWay.includes("nw-wayin") && renderToStaticMarkup(React.createElement(N2.KnowChip, { companyId: lark.c.id })) === "");
  globalThis.fetch = realFetch;
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  google.close();
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
