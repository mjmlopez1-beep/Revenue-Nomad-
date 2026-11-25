/**
 * Checks of "Your three moves today" (lib/moves.ts, lib/movesView.ts, the "move" action), the
 * drafted note and its templates (lib/moveNote.ts), the writing voice (lib/voice.ts, the "voice" action, the
 * connector's save_my_voice, my_voice and todays_moves) and Home's one-time Pro welcome. No server:
 * lib/table.ts runs in process on a made-up seed in a temporary data dir, with fetch replaced, so
 * nothing leaves the machine. Billing is live with made-up Stripe settings (nothing reaches Stripe).
 * Each member's network is written as a Google sync leaves it (State.network, lib/google/types.ts):
 * no Google is called, real or fake.
 *
 *   npx tsx scripts/test-moves.mts      exits 1 on any failure
 *
 * Covered:
 *   - which three: different companies, someone the member knows first, then a way in on file (a
 *     seat holder or an open role), then nothing on file; within each the band, then Crystal Ball's
 *     order; fewer than three;
 *   - each plan: Trial (named in Crystal Ball, opens free), Pro, Free (nothing named, one a day);
 *     Google connected, the connector on and not connected ("connect"), and off (no mention, no
 *     network in any move);
 *   - privacy: a move's record is the member's table's own record (buildView), its person is the
 *     network view's own, and nothing of one member's network, unlocks, moves or voice reaches
 *     another member's Home, table or export; the shared table isn't built again for them;
 *   - Done and Snooze: the next best takes the place, 7 days, the month's count, Undo, done twice
 *     counts once, a company outside their Crystal Ball refused, other members untouched, Crystal
 *     Ball itself unchanged;
 *   - the note for each situation, plain and in every voice setting: never a locked name, a rate
 *     or another member's data (every secret word in a note is one the member's own table or
 *     network already shows); three sentences or five; greeting, sign-off, tone, contractions,
 *     exclamation marks, emoji, small talk, at most one stock phrase;
 *   - mail links carry an address only when the member has it (their own network, or a contact
 *     they unlocked), else To is empty;
 *   - the voice: what is refused (unknown fields and values, mail-like phrases, addresses, links,
 *     numbers, long ones), the app's save and remove, the connector's two steps, theirs alone;
 *   - todays_moves is Home's moves, with no address and nothing locked; a person from the member's
 *     Google account never leaves Merlin through it (no name, title, counts, date or draft), and one
 *     only their own Claude saved is given as before;
 *   - ?today=1 under its size, each move with its record, the same as the full view's;
 *   - the Pro welcome: once, right after Pro, never for Trial, Free or a long-standing Pro.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-moves-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const today = iso(0).slice(0, 10);
const monthAgo = (n: number) => {
  const d = new Date(t0);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return d.toISOString().slice(0, 7);
};
/** A day n months back, mid-month: "last met in <that month>". */
const dayMonthsAgo = (n: number) => `${monthAgo(n)}-12`;

/* ---------- the made-up seed ---------- */

const co = (id: string, name: string, site: string, more: Record<string, string> = {}) => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX", ...more } });
const companies = [
  co("c_lark", "Larkfield Robotics", "larkfield.example", { industry: "Manufacturing", hq: "Pittsburgh, PA" }),
  co("c_corv", "Corvid Health", "corvidhealth.example", { industry: "Healthcare", employees: "201–500", hq: "Nashville, TN" }),
  co("c_harb", "Harborline Pay", "harborline.example", { industry: "Fintech", employees: "11–50", hq: "Charlotte, NC" }),
  co("c_salt", "Saltmarsh Energy", "saltmarsh.example"),
  co("c_copp", "Copperleaf Kitchens", "copperleaf.example"),
  co("c_tall", "Tallgrass Analytics", "tallgrass.example"),
  co("c_nort", "Northwind Supply", "northwind.example"),
  co("c_pine", "Pinecrest Logistics", "pinecrest.example"),
  co("c_blue", "Bluefin Freight", "bluefin.example"),
  co("c_out", "Sablecrest Partners", "sablecrest.example"),
  // The buyer on file: the CEO who hired their fractional CMO, on the seat (no decision maker at the company itself).
  co("c_embr", "Emberline Software", "emberline.example", { industry: "Software" }),
  // Nobody who decides on file, and a seat nobody is named on: where to look for them.
  co("c_quay", "Quayside Labs", "quayside.example"),
];
const seat = (id: string, companyId: string, fields: Record<string, string>, extra: Record<string, unknown> = {}) => ({ id, companyId, verified: false, fields, ...extra });
const cro = (id: string, companyId: string, operator?: string, extra: Record<string, unknown> = {}) =>
  seat(id, companyId, { source: "Member success story", role: "Fractional CRO", function: "Sales", type: "Fractional", start: monthAgo(2), status: "Active", end: "Ongoing", rate: "$11k/mo", ...(operator ? { operator } : {}) }, extra);
const engagements = [
  // Someone-you-know companies: a fractional CRO seat with nobody named, so only the network is a way in there.
  cro("e_lark_cro", "c_lark"),
  cro("e_corv_cro", "c_corv"),
  cro("e_harb_cro", "c_harb"),
  seat("e_harb_open", "c_harb", { source: "Demand scan", role: "Fractional Head of RevOps", function: "RevOps", status: "Open role", posting: "https://harborline.example/jobs/revops", rate: "$8k/mo" }),
  // The fractional who held a seat is a member on Merlin (Hana), with a person on file who has her name and an email.
  cro("e_salt_cro", "c_salt", "Hana Holder"),
  // The fractional who held a seat isn't on Merlin yet: a name from public profiles on a found seat (Invite to connect).
  seat("e_copp_cmo", "c_copp", { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(3), status: "Active", end: "Ongoing", operator: "Pella Quist" }, { holderFrom: "public profile" }),
  // Only an open role in the member's function.
  cro("e_tall_cro", "c_tall"),
  seat("e_tall_open", "c_tall", { source: "Demand scan", role: "Fractional VP RevOps ($9k/mo)", function: "RevOps", status: "Open role", posting: "https://tallgrass.example/careers/revops", rate: "$9k/mo" }),
  // Nothing to reach anyone with.
  cro("e_nort_cro", "c_nort"),
  cro("e_pine_cro", "c_pine"),
  cro("e_blue_cro", "c_blue", "Ivo Castellan"),
  // A company with nothing new for years: no signal of any kind, so never in her Crystal Ball.
  seat("e_embr_cmo", "c_embr", { source: "Member success story", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: monthAgo(4), status: "Active", end: "Ongoing" }),
  cro("e_quay_cro", "c_quay"),
  seat("e_out_cro", "c_out", { source: "Member success story", role: "Fractional CRO", function: "Sales", type: "Fractional", start: monthAgo(48), status: "Active", end: "Ongoing", rate: "$11k/mo", operator: "Odile Varga" }),
];
const contacts = [
  { id: "p_lark_cfo", companyId: "c_lark", fields: { name: "Marisol Achterberg", title: "CFO", relationship: "Decision maker", email: "marisol@larkfield.example" } },
  { id: "p_salt_hana", engagementId: "e_salt_cro", fields: { name: "Hana Holder", title: "Fractional CRO", relationship: "Seat holder", email: "hana@holderco.example" } },
  // Someone who worked with the seat, not a buyer: the seat holder stays the way in at Saltmarsh and the open role at Tallgrass.
  { id: "p_salt_ceo", companyId: "c_salt", fields: { name: "Bastian Quell", title: "CEO", relationship: "Worked with", email: "bastian@saltmarsh.example", phone: "512.555.0141" } },
  { id: "p_tall_ceo", companyId: "c_tall", fields: { name: "Philippa Strand", title: "Founder", relationship: "Worked with", email: "philippa@tallgrass.example" } },
  { id: "p_embr_ceo", engagementId: "e_embr_cmo", fields: { name: "Rhea Vance", title: "CEO", relationship: "Hiring for the seat", email: "rhea@emberline.example" } },
];

const member = (id: string, name: string, title = "Fractional Head of RevOps") => ({ id, name, email: `${id.slice(4)}.moves@example.com`, title, token: `tok-${id.slice(4)}-moves` });
const members = [
  member("mem_mor", "Morgan Hale"),
  member("mem_tes", "Tess Trial"),
  member("mem_fre", "Fen Free"),
  member("mem_pro", "Pat Pro"),
  member("mem_old", "Olga Oldpro"),
  member("mem_hld", "Hugo Held"),
  member("mem_oth", "Oto Other"),
  member("mem_few", "Finn Few"),
  member("mem_han", "Hana Holder", "Fractional CRO"),
  // Kit's own contacts hold seats: Pella by name (a fractional title), Hana by email (a member).
  member("mem_kit", "Kit Known"),
  { id: "mem_ada", name: "Ada Admin", email: "admin-moves@example.com", title: "Admin", token: "tok-ada-moves" },
];
const seed = { builtAt: iso(-60 * DAY), members, companies, engagements, contacts };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

/** One kept Crystal Ball row (lib/radar/types.ts RadarSentRow): what the day's view lists. */
const hired = (m: string, c: string, band: string) => ({ k: `t:${m}:${c}`, c, kind: "adjacent", l: "Hired a fractional CRO 2 months ago · Sales usually comes before RevOps", b: band, w: "Fractional CRO hired 2 months ago · RevOps usually follows in 1–4 months" });
const raised = (m: string, c: string, band: string) => ({ k: `t:${m}:${c}:f`, c, kind: "funding", l: "Raised a Series A · Sales usually comes next", b: band, w: "Series A raised 3 weeks ago · RevOps usually follows in 2–6 months" });
const role = (m: string, c: string, title: string) => ({ k: `t:${m}:${c}:r`, c, kind: "role", l: `New open role: ${title} · In your function`, b: "High", w: "Open now · a direct opening in RevOps" });
/** The day's companies, in Crystal Ball's own order: the ones with nothing to reach anyone with come first, so the way in has to do the ranking. */
const ball = (m: string) => [
  hired(m, "c_nort", "High"),
  role(m, "c_tall", "Fractional VP RevOps"),
  hired(m, "c_salt", "High"),
  hired(m, "c_copp", "High"),
  hired(m, "c_lark", "Medium"),
  hired(m, "c_corv", "High"),
  role(m, "c_harb", "Fractional Head of RevOps"),
  hired(m, "c_pine", "Medium"),
  hired(m, "c_blue", "Low"),
  raised(m, "c_embr", "Low"),
  hired(m, "c_quay", "Low"),
];
/** Olga's day: the buyer on file, and nobody who decides on file. */
const ballOld = (m: string) => [raised(m, "c_embr", "High"), hired(m, "c_quay", "High")];
const ballOf = (m: string, rows = ball(m)) => ({ sent: {}, days: { [today]: rows } });

/** A member's network as a sync leaves it: per company, the people, the counts and the dates. */
const person = (email: string, name: string, title: string, meetings: number, last: string) => ({ key: email, email, name, title, meetings, last, first: dayMonthsAgo(14), src: ["calendar"] });
const netCo = (domain: string, p: ReturnType<typeof person>) => ({ domain, people: [p], meetings: p.meetings, last: p.last, first: p.first, months: [p.last.slice(0, 7)] });
const link = (email: string) => ({ token: "sealed-not-a-real-token", email, scopes: ["openid", "email", "https://www.googleapis.com/auth/calendar.events.readonly", "https://www.googleapis.com/auth/contacts.readonly"], connectedAt: iso(-3 * DAY), syncedAt: iso(-HOUR), status: "ok" });
const network = {
  mem_mor: {
    google: link("morgan@halerevops.example"),
    cal: {
      at: iso(-HOUR),
      unmatched: 4,
      real: 3,
      companies: {
        c_lark: netCo("larkfield.example", person("dana@larkfield.example", "Dana Whitfield", "CEO", 4, dayMonthsAgo(8))),
        c_corv: netCo("corvidhealth.example", person("priya@corvidhealth.example", "Priya Raman", "Director of Operations", 5, iso(-16 * DAY).slice(0, 10))),
        c_harb: netCo("harborline.example", person("nia@harborline.example", "Nia Castell", "Head of Growth", 2, dayMonthsAgo(2))),
      },
    },
  },
  // Finn has no Google. His own Claude saved one person from his inbox (save_my_network): the only kind the connector may name back.
  mem_few: {
    claude: {
      at: iso(-2 * DAY),
      unmatched: 0,
      real: 1,
      saves: [iso(-2 * DAY)],
      named: [{ id: "c_salt", at: iso(-2 * DAY) }],
      companies: { c_salt: { domain: "saltmarsh.example", emails: 14, last: dayMonthsAgo(3), people: [{ key: "n:quentin vale", name: "Quentin Vale", title: "Chief Revenue Officer", emails: 14, both: true, last: dayMonthsAgo(3), src: ["claude"] }] } },
    },
  },
  // Oto knows someone at Northwind. Nobody else may ever see her.
  // Kit's contacts at no company on Merlin (their own firms): two hold seats there, one shares a seat holder's name and isn't them.
  mem_kit: {
    google: link("kit@kitknown.example"),
    con: {
      at: iso(-HOUR),
      unmatched: 3,
      real: 3,
      companies: {},
      loose: [
        { key: "pella@quistco.example", email: "pella@quistco.example", name: "Pella Quist", title: "Fractional CMO", meetings: 5, last: iso(-9 * DAY).slice(0, 10), first: dayMonthsAgo(10), src: ["calendar", "contacts"], domain: "quistco.example" },
        { key: "han.moves@example.com", email: "han.moves@example.com", name: "Hana H", saved: true, src: ["contacts"] },
        { key: "ivo@castellan.example", email: "ivo@castellan.example", name: "Ivo Castellan", title: "Office Manager", meetings: 3, last: dayMonthsAgo(2), src: ["calendar"], domain: "castellan.example" },
      ],
    },
  },
  mem_oth: { google: link("oto@otherco.example"), cal: { at: iso(-HOUR), unmatched: 0, real: 1, companies: { c_nort: netCo("northwind.example", person("zelda@northwind.example", "Zelda Quince", "Chief Operating Officer", 6, dayMonthsAgo(1))) } } },
};

const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    // Everyone has signed in but the admin (Hana too: a seat holder who is on Merlin).
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-HOUR)])),
    profiles: Object.fromEntries(members.map((m) => [m.id, { function: m.id === "mem_han" ? "Sales" : "RevOps", onboarded: true, icp: { industries: [], employees: [], revenue: [], countries: [] } }])),
    billing: {
      members: {
        mem_mor: trial,
        mem_tes: trial,
        mem_oth: trial,
        mem_few: trial,
        mem_han: trial,
        mem_kit: trial,
        mem_fre: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) },
        // Paid yesterday: the welcome is due. Paid 100 days ago: it isn't. Bought in the trial, first charge still to come: due.
        mem_pro: { trialStartedAt: iso(-22 * DAY), trialEndsAt: iso(-1 * DAY), proUntil: iso(29 * DAY), interval: "month", paidSince: iso(-1 * DAY), subscriptionId: "sub_pro" },
        mem_old: { trialStartedAt: iso(-130 * DAY), trialEndsAt: iso(-109 * DAY), proUntil: iso(20 * DAY), interval: "month", paidSince: iso(-100 * DAY), subscriptionId: "sub_old" },
        mem_hld: { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY), proUntil: iso(16 * DAY), proStartsAt: iso(16 * DAY), interval: "year", subscriptionId: "sub_hld" },
      },
      events: [],
      payments: [],
      ended: [],
    },
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: {
        mem_mor: ballOf("mem_mor"),
        mem_tes: ballOf("mem_tes"),
        mem_fre: ballOf("mem_fre"),
        mem_pro: ballOf("mem_pro"),
        mem_oth: ballOf("mem_oth"),
        mem_kit: ballOf("mem_kit"),
        mem_old: ballOf("mem_old", ballOld("mem_old")),
        // Finn's Crystal Ball has two companies today.
        mem_few: ballOf("mem_few", [hired("mem_few", "c_nort", "High"), hired("mem_few", "c_salt", "Medium")]),
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
    network,
  }),
);

const TEST_KEY = Buffer.alloc(32, 9).toString("base64");
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  // A made-up seed key, so seats have claim links (Invite to connect).
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-moves@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_moves",
  STRIPE_WEBHOOK_SECRET: "whsec_test_moves",
  STRIPE_PRICE_MONTH: "price_month_moves",
  STRIPE_PRICE_YEAR: "price_year_moves",
  // The Google connector on, with a client set up (so a member without Google is offered Connect).
  RN_GOOGLE: "1",
  GOOGLE_CLIENT_ID: "client-test",
  GOOGLE_CLIENT_SECRET: "secret-test",
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_GOOGLE_GMAIL"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 700)}`}`);
};

/** Every word in the seed and the networks that a member may or may not be allowed to see. */
const SECRETS = [
  ...companies.map((c) => c.fields.name),
  ...companies.map((c) => c.fields.website),
  "Hana Holder", "Pella Quist", "Ivo Castellan", "Odile Varga", "Marisol Achterberg", "Bastian Quell", "Philippa Strand", "Rhea Vance", "rhea@emberline.example",
  "Dana Whitfield", "Priya Raman", "Nia Castell", "Zelda Quince", "Quentin Vale",
  "dana@larkfield.example", "priya@corvidhealth.example", "nia@harborline.example", "zelda@northwind.example",
  "hana@holderco.example", "marisol@larkfield.example", "bastian@saltmarsh.example", "philippa@tallgrass.example", "512.555.0141",
];
const NETWORK_WORDS = ["Dana Whitfield", "Dana", "Priya Raman", "Priya", "Nia Castell", "Zelda Quince", "Zelda", "Quentin", "dana@", "priya@", "nia@", "zelda@", "halerevops", "otherco.example"];
const found = (x: unknown, words: string[] = SECRETS) => {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return words.filter((w) => s.toLowerCase().includes(w.toLowerCase()));
};
/** A rate, however it is written: an amount of money, or a per-month or per-hour figure. */
const RATE = /[$€£]\s?\d|\b\d+\s?k\b|\/\s?(mo|hr|hour|month)\b|\bper (hour|month|day)\b/i;
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).filter(Boolean);

async function main() {
  const T = await import("../lib/table");
  const radar = await import("../lib/radar");
  const G = await import("../lib/google");
  const { todayView, TODAY_MAX } = await import("../lib/today");
  const { firstPage } = await import("../lib/firstPage");
  const { movesFor } = await import("../lib/movesView");
  const { unpackCompany } = await import("../lib/viewWire");
  const M = { ...(await import("../lib/moves")), ...(await import("../lib/moveNote")) };
  const V = await import("../lib/voice");
  const tools = await import("../lib/mcp/tools");
  type Move = import("../lib/moves").Move;
  type CompanyRec = import("../lib/tableTypes").CompanyRec;
  type VoiceStyle = import("../lib/voice").VoiceStyle;

  const BASE = "https://post.example.com";
  const MOR = "tok-mor-moves";
  const TES = "tok-tes-moves";
  const FRE = "tok-fre-moves";
  const OTH = "tok-oth-moves";
  const FEW = "tok-few-moves";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const P = Object.fromEntries(companies.map((c) => [c.id.slice(2), pub(c.id)])) as Record<string, string>;
  const nameOf = (id: string) => companies.find((c) => pub(c.id) === id)?.fields.name ?? id;
  const act = (tok: string, a: Record<string, unknown>) => T.perform(tok, a as never, BASE);
  const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
  const ctxOf = async (tok: string) => ({ member: (await T.memberForToken(tok))!, origin: BASE });
  /** A member's moves as Home builds them: from ?today=1's wire and its own packed records. */
  const homeMoves = async (tok: string): Promise<{ moves: Move[]; recs: CompanyRec[]; today: NonNullable<Awaited<ReturnType<typeof todayView>>> }> => {
    const t = (await todayView(tok))!;
    const recs = t.companies.map((c) => unpackCompany(JSON.parse(JSON.stringify(c))));
    const byId = new Map(recs.map((c) => [c.id, c]));
    return { today: t, recs, moves: t.moves!.list.map((w) => M.buildMove(byId.get(w.id)!, w.row, w.know, t.me)) };
  };

  /* ================= which three, and in what order ================= */
  console.log("\nwhich three");
  check("signed out: no moves", (await movesFor(null)) === null && (await movesFor("not-a-token")) === null);
  const mor = await homeMoves(MOR);
  check("Morgan (Trial, Google connected): the three companies she knows someone at, the High ones first", same(mor.moves.map((m) => m.id), [P.corv, P.harb, P.lark]), mor.moves.map((m) => nameOf(m.id)));
  check("three different companies", new Set(mor.moves.map((m) => m.id)).size === 3);
  check("each is someone she knows", mor.moves.every((m) => m.way.kind === "know"), mor.moves.map((m) => m.way.kind));
  check("and Crystal Ball's own order would have led with none of them", same((await radar.radarView(MOR))!.rows.slice(0, 3).map((r) => r.id), [P.nort, P.tall, P.salt]));
  const [mCorv, mHarb, mLark] = mor.moves;
  check("a decision maker she knows: Message Dana", mLark.do === "message" && mLark.title === "Message Dana" && mLark.way.kind === "know" && mLark.way.person.dm && mLark.way.person.title === "CEO", mLark);
  check("someone who isn't the buyer: Ask Priya for an intro", mCorv.do === "intro" && mCorv.title === "Ask Priya for an intro" && mCorv.way.kind === "know" && !mCorv.way.person.dm, mCorv);
  check("an open role in her function where she knows someone: Reply to the open role, Hiring now", mHarb.do === "reply" && mHarb.title === "Reply to the open role" && mHarb.hiring && /let Nia know/.test(mHarb.line), mHarb);
  check("Likely to hire with its band, never a percentage", !mLark.hiring && mLark.band === "Medium" && mCorv.band === "High" && !/%/.test(JSON.stringify(mor.moves)));
  check("why now is the Crystal Ball's own words", mLark.why === "Fractional CRO hired 2 months ago. RevOps usually follows.", mLark.why);
  check("the person: warmth, last met and meetings", mLark.way.kind === "know" && /^Last met in [A-Z][a-z]+( \d{4})? · 4 meetings$/.test(M.knowLine(mLark.way.person)), mLark.way.kind === "know" ? M.knowLine(mLark.way.person) : null);
  check("named free: a company she knows someone at is hers to see", mor.moves.every((m) => !m.hidden && !!m.name && nameOf(m.id) === m.name), mor.moves.map((m) => m.name));
  check("the connector is on and connected", mor.today.moves!.google === "on" && mor.today.moves!.month === 0);

  const tes0 = await homeMoves(TES);
  check("Tess (Trial, no Google): the High companies with a way in on file, in Crystal Ball's order", same(tes0.moves.map((m) => m.id), [P.tall, P.salt, P.copp]), tes0.moves.map((m) => nameOf(m.id)));
  check("her ways in: an open role, then a seat holder on file twice", same(tes0.moves.map((m) => m.way.kind), ["role", "holder", "holder"]));
  check("a Low company with a seat holder on file doesn't jump the queue, and one with nothing waits", !tes0.moves.some((m) => m.id === P.blue || m.id === P.nort));
  // Open data on paid plans: the trial names only the companies it opened (up to 40 a day, each in full); the rest stay locked and unnamed.
  check("Trial keeps each company locked and unnamed until she opens it", tes0.moves.every((m) => m.hidden && m.name === null && m.do === "open" && m.title === "Open the company"), tes0.moves);
  check("the seat holder isn't named while locked", tes0.moves.every((m) => m.way.kind !== "holder" || m.way.name === null) && M.holderOnFile("Sales") === "The fractional who held their Sales seat is on file");
  check("no person from anyone's network in her moves", !found(tes0.today, NETWORK_WORDS).length && tes0.today.moves!.list.every((w) => !w.know), found(tes0.today, NETWORK_WORDS));
  check("the connector is on and she hasn't connected: one line offers it", tes0.today.moves!.google === "connect");
  check("her plan opens Crystal Ball companies free", tes0.today.me.crystal === "all");

  const fre = await homeMoves(FRE);
  check("Fen (Free): the same three, nothing named", same(fre.moves.map((m) => m.id), [P.tall, P.salt, P.copp]) && fre.moves.every((m) => m.hidden && m.name === null && m.do === "open"), fre.moves);
  check("Free's answer names no company and no person", !found(fre.today).length, found(fre.today));
  check("Free opens one a day", fre.today.me.crystal === "one" && /one free Crystal Ball company today/.test(fre.moves[0].line), fre.moves[0].line);
  check("a locked company's free facts still show", fre.moves[0].facts === "SaaS · 51–200 · TX" || /SaaS · 51–200/.test(fre.moves[0].facts), fre.moves[0].facts);

  const few = await homeMoves(FEW);
  check("fewer than three good ones: what there is", same(few.moves.map((m) => m.id), [P.salt, P.nort]) && few.moves[1].way.kind === "none", few.moves.map((m) => [nameOf(m.id), m.way.kind]));
  const han = (await todayView("tok-han-moves"))!;
  check("none at all: an empty list, and nothing else breaks", han.moves!.list.length === 0 && han.companies.length === 0 && han.radar.rows.length === 0);

  /* ================= what a move may show: the member's own table and network, nothing else ================= */
  console.log("\nprivacy");
  for (const [who, tok] of [["Morgan", MOR], ["Tess", TES], ["Fen", FRE], ["Oto", OTH], ["Finn", FEW]] as const) {
    const h = await homeMoves(tok);
    const view = await T.buildView(tok);
    const byId = new Map(view.companies.map((c) => [c.id, c]));
    const raw = JSON.stringify(h.today);
    check(`${who}: ?today=1 is under its size`, raw.length < TODAY_MAX, raw.length);
    check(`${who}: each move comes with its record, in order`, h.recs.length === h.today.moves!.list.length && h.recs.every((c, k) => c.id === h.today.moves!.list[k].id));
    check(`${who}: each record is the table's own record, locks and all`, h.recs.every((c) => same(c, byId.get(c.id))), h.recs.find((c) => !same(c, byId.get(c.id)))?.id);
    const fromView = h.today.moves!.list.map((w) => M.buildMove(byId.get(w.id)!, w.row, w.know, view.me!));
    check(`${who}: the move built from ?today=1 is the move built from the full view`, same(h.moves, fromView));
    const fp = await firstPage(tok, "");
    check(`${who}: the first screen (?first=1 on Home) carries the same moves`, !!fp && "today" in fp && same(fp.today.moves, h.today.moves));
    // Every secret word a move shows is one the member's own table, Crystal Ball or network already shows them.
    const net = await G.networkView(tok);
    const mine = JSON.stringify([view.companies, view.me, await radar.radarView(tok), net]);
    const shown = found(h.moves);
    check(`${who}: a move shows nothing their table, Crystal Ball and network don't`, shown.every((w) => mine.toLowerCase().includes(w.toLowerCase())), shown.filter((w) => !mine.toLowerCase().includes(w.toLowerCase())));
    // Who they know is the network view's own person.
    const netCos = net && net.on ? new Map(net.companies.map((c) => [c.id, c])) : new Map();
    check(
      `${who}: each person is from their own network view, as it shows them`,
      h.today.moves!.list.every((w) => !w.know || same(w.know, M.knowFrom(netCos.get(w.id)?.people ?? []))),
      h.today.moves!.list.map((w) => w.know?.name),
    );
  }
  const oth = await homeMoves(OTH);
  check("Oto knows Zelda at Northwind: his first move, and only his", oth.moves[0].id === P.nort && oth.moves[0].way.kind === "know" && oth.moves[0].way.person.name === "Zelda Quince", oth.moves[0]);
  check("nobody else's Home has her, or Morgan's people", !found(mor.today, ["Zelda", "zelda@", "otherco"]).length && !found(oth.today, ["Dana", "Priya", "Nia Castell", "halerevops"]).length && !found(tes0.today, NETWORK_WORDS).length && !found(fre.today, NETWORK_WORDS).length);
  check("Northwind is named for Oto alone", oth.moves[0].name === "Northwind Supply" && !found(fre.today, ["Northwind"]).length);

  /* ================= opening, and the ways in that follow ================= */
  console.log("\nthe way in");
  const credits = async (tok: string) => (await T.buildView(tok)).me!.credits;
  /** An unlock of who held a seat, which is free now (PEERS_FREE): "Nothing here is locked" is the answer, and fine. */
  const free = (p: Promise<unknown>) => p.catch((e: Error) => {
    if (!/Nothing here is locked/.test(String(e?.message))) throw e;
  });
  const before = await credits(TES);
  for (const id of [P.tall, P.salt, P.copp]) await act(TES, { type: "unlock", entity: "company", id, field: "identity", from: "crystal" });
  check("opening a company from a move costs what Crystal Ball costs: nothing on Trial", (await credits(TES)) === before, [before, await credits(TES)]);
  let tes = await homeMoves(TES);
  const bySeat = (m: Move) => (m.way.kind === "holder" || m.way.kind === "role" ? m.way.seatId : "");
  // Fellow fractionals are free (PEERS_FREE): once the company is open, who held its seat shows at no charge.
  check("opened: who held the seat shows free, and the move is to reach them", tes.moves[1].way.kind === "holder" && tes.moves[1].way.name === "Hana H." /* a member, named the way she chose */ && tes.moves[1].do !== "seeHolder" && !tes.moves[1].hidden, tes.moves[1]);
  check("opened: the open role's posting came with the company", tes.moves[0].do === "reply" && tes.moves[0].way.kind === "role" && tes.moves[0].way.posting === "https://tallgrass.example/careers/revops", tes.moves[0].way);
  check("the role's title is shown as the record has it", tes.moves[0].way.kind === "role" && tes.moves[0].way.title === "Fractional VP RevOps ($9k/mo)");
  check("seat holders cost nothing: no credit spent on them", (await credits(TES)) === before && !!bySeat(tes.moves[1]) && !!bySeat(tes.moves[2]), [before, await credits(TES)]);
  tes = await homeMoves(TES);
  const [tTall, tSalt, tCopp] = tes.moves;
  check("a seat holder on Merlin: Message the seat holder", tSalt.do === "holderMessage" && tSalt.title === "Message the seat holder" && tSalt.way.kind === "holder" && tSalt.way.name === "Hana H." && tSalt.way.member, tSalt);
  check("a seat holder not on Merlin yet: Invite them to connect, with the claim link", tCopp.do === "holderInvite" && tCopp.title === "Invite them to connect" && tCopp.way.kind === "holder" && tCopp.way.name === "Pella Quist" && !!tCopp.way.invite?.path.startsWith("/claim/"), tCopp);
  check("an open role: Reply to the open role", tTall.do === "reply" && tTall.title === "Reply to the open role" && tTall.hiring);
  check("Fen sees none of what Tess opened", same((await homeMoves(FRE)).moves, fre.moves));
  // Harborline is Morgan's to see (she knows someone there) but its posting is still locked: without the person, the move is to see the posting, at its usual price.
  const harbRec = mor.recs.find((c) => c.id === P.harb)!;
  const harbRow = mor.today.moves!.list.find((w) => w.id === P.harb)!.row;
  const noPerson = M.buildMove(harbRec, harbRow, undefined, mor.today.me);
  // A company she can see is open in full in her trial (open data on paid plans): its open role's posting shows with it.
  check("an open role at a company she can see: the posting shows in her trial, so the move is to reply", noPerson.way.kind === "role" && noPerson.way.posting !== "locked" && noPerson.do !== "seePosting", noPerson);
  check("with the person she knows there, the note goes to them, the posting open", mHarb.open?.posting !== "locked");
  const none = (await homeMoves(FEW)).moves[1];
  check("nothing on file: No way in yet, Open the company", none.way.kind === "none" && none.do === "open" && none.hidden);

  /* ================= the buyer, and where to look for them ================= */
  console.log("\nthe buyer");
  type RadarRow = import("../lib/radar/types").RadarRow;
  const rowOf0 = (h: Awaited<ReturnType<typeof homeMoves>>, id: string) => h.today.moves!.list.find((w) => w.id === id)?.row as RadarRow;
  const VOICES_SHORT: VoiceStyle = { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "never", emoji: false, opener: "direct", phrases: [] };
  const recOf = async (tok: string, id: string) => (await T.buildView(tok)).companies.find((c) => c.id === id)!;
  const rowFor = async (tok: string, id: string) => (await radar.radarView(tok))!.rows.find((r) => r.id === id)!;
  const tesMe = (await T.buildView(TES)).me!;
  const embrRow = await rowFor(TES, P.embr);
  let embr = await recOf(TES, P.embr);
  let bm = M.buildMove(embr, embrRow, undefined, tesMe);
  check("a locked company: Open the company, and nobody on it is named", bm.do === "open" && bm.way.kind === "buyer" && bm.way.name === null && bm.way.title === null && !found(bm, ["Rhea", "rhea@"]).length, bm);
  check("the seat's hirer is a decision maker on file, though the company has none of its own", embr.people.length === 0 && M.buyersOf(embr).length === 1 && M.buyersOf(embr)[0].e?.id === embr.engagements[0].id && M.buyersOf(embr)[0].rel === "Hiring for the seat");
  const tesC0 = await credits(TES);
  await act(TES, { type: "unlock", entity: "company", id: P.embr, field: "identity", from: "crystal" });
  embr = await recOf(TES, P.embr);
  bm = M.buildMove(embr, embrRow, undefined, tesMe);
  // Opened in the trial: everything there shows but email and phone, so the buyer is named at once, for 0 credits.
  check("opened: the buyer is the way in, named with the company, 0 credits: Write to Rhea, who hired their fractional CMO", bm.way.kind === "buyer" && bm.do === "buyer" && bm.title === "Write to Rhea" && bm.line.startsWith("Rhea, CEO, hired their fractional CMO.") && /Their email is 1 credit on the record/.test(bm.line) && (await credits(TES)) === tesC0, [bm.title, bm.line]);
  check("a buyer on file means nothing to look up", bm.find === null && M.findBuyer(embr, tesMe) === null);
  const rhea = (bm.way as { personId: string }).personId;
  check("their name and title: nothing to buy in the trial", /Nothing here is locked/.test(String(await act(TES, { type: "unlock", entity: "contact", id: rhea, field: "name" }).catch((e: Error) => e.message))) && (await credits(TES)) === tesC0, [tesC0, await credits(TES)]);
  let bf = M.noteFacts(bm, embrRow, tesMe, BASE)!;
  let bd = M.draftNote(bf, null);
  check("the note is the buyer's, to her by name, with no address yet", bf.kind === "buyer" && bf.to?.name === "Rhea Vance" && bf.to.email === null && bd.body.startsWith("Hi Rhea,\n\n"), bf.to);
  check(
    "it says why now from the signal and the pattern the company fits, in the member's words",
    // The seat's role shows in the trial (the company is open in full), so the pattern names it.
    /I saw Emberline Software just raised a round\./.test(bd.body) && bd.body.includes("When a SaaS company is past $5M and has a fractional CMO and no fractional RevOps seat yet, RevOps is usually what needs an owner next.") && /a fractional Head of RevOps/.test(bd.body),
    bd.body,
  );
  const bShort = M.draftNote(bf, VOICES_SHORT);
  check("short: the signal, the pattern and the ask", sentences(bShort.body.replace(/^Hey Rhea,\n\n/, "").replace(/\n\nCheers,\nTess$/, "")).length === 3 && /When a SaaS company/.test(bShort.body), bShort.body);
  check("never 'no RevOps leader' without their team page read", !/no RevOps leader/.test(bd.body) && M.patternLine({ ...bf.pattern!, noLeader: true }, "RevOps")!.neutral.includes("but no RevOps leader yet"));
  check("after a hire signal it says what follows the hire, not the hire twice", M.patternLine(bf.pattern, "RevOps", true)!.neutral === "When a SaaS company past $5M makes that hire, RevOps is usually what needs an owner next.");
  check("no rate (the revenue band is a free fact), no address, nothing she hasn't opened", !RATE.test(bd.body.replace("past $5M", "")) && M.revenueWord("$5M–$20M") === "past $5M" && M.revenueWord("Under $1M") === null && M.industryWord("SaaS") === "SaaS" && M.industryWord("Manufacturing") === "manufacturing" && !/@/.test(bd.body) && !found(bd.body, ["Bastian", "Philippa", "Marisol", "Ivo"]).length);
  await act(TES, { type: "unlock", entity: "contact", id: rhea, field: "email" });
  check("their email: 1 credit", (await credits(TES)) === tesC0 - 1);
  embr = await recOf(TES, P.embr);
  bm = M.buildMove(embr, embrRow, undefined, tesMe);
  bf = M.noteFacts(bm, embrRow, tesMe, BASE)!;
  check("then the note goes to the address she unlocked", bf.to?.email === "rhea@emberline.example" && bf.to.from === "unlocked on Merlin" && /to=rhea%40emberline\.example/.test(M.gmailLink(bf.to.email, "s", "b")) && /A short note to their email on file/.test(bm.line), [bf.to, bm.line]);
  // The order: someone they know, then the buyer, then the seat holder, then an open role.
  const someone = { name: "Sam Known", title: "VP Finance", email: null, warmth: "Warm" as const, last: null, meetings: 2, emails: 0, dm: true, google: false };
  check("someone the member knows comes before the buyer", M.wayIn(embr, embrRow, someone, tesMe).kind === "know");
  const saltT = await recOf(TES, P.salt);
  const withBuyer = { ...saltT, people: [...saltT.people, { id: "p_made_up", engagementId: null, source: "Member added", cells: { name: { s: "locked", ver: 0 }, title: { s: "locked", ver: 0 }, relationship: { s: "value", v: "Decision maker", ver: 0 } } }] } as CompanyRec;
  check("the buyer comes before the seat holder", M.wayIn(saltT, rowOf0(tes, P.salt), undefined, tesMe).kind === "holder" && M.wayIn(withBuyer, rowOf0(tes, P.salt), undefined, tesMe).kind === "buyer");
  {
    // F4: the holder of a seat still going in the member's own function is a peer whose client it is, never their way in.
    // Hana holds Saltmarsh's Sales (CRO) seat now; Tess (another function) may go through her, a Sales member may not.
    const sameFn = M.wayIn(saltT, rowOf0(tes, P.salt), undefined, { ...tesMe, function: "Sales" });
    check("F4: never through a peer to their own current client in the member's function (the seat holder is no way in then)", tesMe.function !== "Sales" && sameFn.kind !== "holder", [tesMe.function, sameFn.kind]);
  }
  check("someone who only worked with the seat is not a buyer", !M.buyersOf(saltT).length && saltT.people.some((p) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Worked with"));
  const tallT = await recOf(TES, P.tall);
  const tallBuyer = { ...tallT, people: [{ id: "p_made_up2", engagementId: null, source: "Member added", cells: { name: { s: "value", v: "Gil Made", ver: 0 }, title: { s: "value", v: "CEO", ver: 0 }, relationship: { s: "value", v: "Decision maker", ver: 0 }, email: { s: "empty" } } }] } as CompanyRec;
  const tb = M.buildMove(tallBuyer, rowOf0(tes, P.tall), undefined, tesMe);
  check("an open role in her function still leads the move, with the note to the buyer", tb.way.kind === "buyer" && tb.do === "reply" && tb.line === "Apply through the posting. Your note to Gil is drafted to go with it." && M.noteFacts(tb, rowOf0(tes, P.tall), tesMe, BASE)?.kind === "roleCold" && M.noteFacts(tb, rowOf0(tes, P.tall), tesMe, BASE)?.to?.name === "Gil Made", [tb.do, tb.line]);

  // Nobody who decides on file: where to look.
  const quayRow = await rowFor(TES, P.quay);
  check("a locked company has nowhere to look yet (its name is locked)", M.findBuyer(await recOf(TES, P.quay), tesMe) === null && M.buildMove(await recOf(TES, P.quay), quayRow, undefined, tesMe).find === null);
  await act(TES, { type: "unlock", entity: "company", id: P.quay, field: "identity", from: "crystal" });
  const quay = await recOf(TES, P.quay);
  const qm = M.buildMove(quay, quayRow, undefined, tesMe);
  const li = new URL(qm.find!.linkedin);
  check("nobody who decides: Find who runs RevOps at Quayside Labs", qm.way.kind === "none" && qm.do === "find" && qm.title === "Find who runs RevOps" && qm.find!.label === "Find who runs RevOps at Quayside Labs", [qm.title, qm.find?.label]);
  check("a LinkedIn people search from the company's name and the titles", li.hostname === "www.linkedin.com" && li.pathname === "/search/results/people/" && li.searchParams.get("keywords") === '"Quayside Labs" ("VP Revenue Operations" OR "Head of RevOps" OR CRO OR Founder OR CEO)', li.searchParams.get("keywords"));
  check("and their website, since it is known", same(qm.find!.site, { href: "https://quayside.example/", label: "Their website" }));
  check("its team page instead, when the leaders read found one", same(M.findBuyer({ ...quay, leads: { checkedAt: today, teamAt: today, fns: [{ fn: "Sales", level: "VP", kind: "full-time", how: "team page", url: "quayside.example/team" }] } }, tesMe)!.site, { href: "https://quayside.example/team", label: "Their team page" }));
  check("the words never say LinkedIn is where Merlin's data comes from", !/linkedin/i.test(qm.line + qm.title + qm.find!.label) && /add them here and earn a credit/.test(qm.line), qm.line);
  check("no website: just the search", M.findBuyer({ ...quay, cells: { ...quay.cells, website: { s: "empty" } } }, tesMe)!.site === null);
  check("without a function: Find who decides", M.findBuyer(quay, { function: null })!.label === "Find who decides at Quayside Labs" && /Founder%20OR%20CEO/.test(M.findBuyer(quay, { function: null })!.linkedin));
  check("someone added at the company ends it", M.findBuyer({ ...quay, people: [{ id: "p_q", engagementId: null, source: "Member added", cells: { name: { s: "value", v: "Q Person", ver: 0 } } }] } as CompanyRec, tesMe) === null);

  // What a move says is what is on file.
  const blueT = await recOf(TES, P.blue);
  await act(TES, { type: "unlock", entity: "company", id: P.blue, field: "identity", from: "crystal" });
  const blueRec = await recOf(TES, P.blue);
  const blueLocked = M.buildMove(blueRec, rowOf0(tes, P.blue) ?? (await rowFor(TES, P.blue)), undefined, tesMe);
  // Fellow fractionals are free (PEERS_FREE): once Bluefin is open, who held its seat shows, and the line names no price.
  check("a seat holder at an open company: free, no price in the line", blueLocked.do !== "seeHolder" && blueLocked.way.kind === "holder" && !/credit/.test(blueLocked.line), blueLocked.line);
  await free(act(TES, { type: "unlock", entity: "engagement", id: (blueLocked.way as { seatId: string }).seatId, field: "operator" }));
  const blueOpen = await recOf(TES, P.blue);
  const noInvite = { ...blueOpen, engagements: blueOpen.engagements.map((e) => ({ ...e, invite: undefined })) } as CompanyRec;
  const bn = M.buildMove(noInvite, await rowFor(TES, P.blue), undefined, tesMe);
  check("named, not on Merlin, no claim link: says so, and that nobody who hired them is on file", bn.do === "record" && bn.line === "Ivo held their Sales seat and isn't on Merlin yet. Nobody who hired them is on file yet." && !/record has who hired/.test(bn.line) && !/invite/i.test(bn.line), bn.line);
  check("and where to look for who decides", !!bn.find && bn.find.label === "Find who runs RevOps at Bluefin Freight");
  check("a seat holder with a claim link: the invite", M.buildMove(blueOpen, await rowFor(TES, P.blue), undefined, tesMe).do === (blueOpen.engagements[0].invite ? "holderInvite" : "record"));
  void blueT;

  /* ================= Google off, and not connected ================= */
  console.log("\nGoogle");
  // The switch is read when a table is built: a change to the state stands in for the restart that flips it.
  const flip = () => act("tok-ada-moves", { type: "settings", digest: true });
  delete process.env.RN_GOOGLE;
  await flip();
  const morOff = await homeMoves(MOR);
  check("connector off: no mention, no person, and the network names nothing", morOff.today.moves!.google === "off" && morOff.today.moves!.list.every((w) => !w.know) && !found(morOff.today, NETWORK_WORDS).length, found(morOff.today, NETWORK_WORDS));
  check("connector off: Morgan's moves are the ones anyone on Trial gets", same(morOff.moves.map((m) => m.id), [P.tall, P.salt, P.copp]) && morOff.moves.every((m) => m.hidden));
  process.env.RN_GOOGLE = "1";
  await flip();
  delete process.env.GOOGLE_CLIENT_ID;
  check("connector on with no Google client set up: nothing to connect to, no mention", (await homeMoves(TES)).today.moves!.google === "off");
  process.env.GOOGLE_CLIENT_ID = "client-test";
  check("and back on: Morgan's three again", same((await homeMoves(MOR)).moves.map((m) => m.id), [P.corv, P.harb, P.lark]));

  /* ================= Done and Snooze ================= */
  console.log("\ndone and snooze");
  const stats0 = T.sharedViewStats();
  const tesView0 = JSON.stringify(sortKeys((await T.buildView(TES)).companies));
  const freToday0 = JSON.stringify(sortKeys((await todayView(FRE))!.moves));
  const ball0 = JSON.stringify((await radar.radarView(MOR))!.rows);
  let r = await act(MOR, { type: "move", id: P.corv, op: "done" });
  check("Mark as done says it was marked, and counts", /^Marked as done\. That's your first move this month\.$/.test(r.message), r.message);
  let m2 = await homeMoves(MOR);
  check("the done company is gone and the next best takes its place", same(m2.moves.map((m) => m.id), [P.harb, P.lark, P.tall]) && m2.today.moves!.month === 1, m2.moves.map((m) => nameOf(m.id)));
  check("Crystal Ball itself is unchanged", JSON.stringify((await radar.radarView(MOR))!.rows) === ball0);
  r = await act(MOR, { type: "move", id: P.lark, op: "snooze" });
  check("Snooze says for how long", r.message === "Snoozed for 7 days.", r.message);
  m2 = await homeMoves(MOR);
  check("the snoozed company is replaced too, and isn't counted", same(m2.moves.map((m) => m.id), [P.harb, P.tall, P.salt]) && m2.today.moves!.month === 1, m2.moves.map((m) => nameOf(m.id)));
  const at = async (ms: number) => (await movesFor(MOR, { nowMs: Date.now() + ms }))!.moves.map((m) => m.id);
  check("6 days on it is still snoozed, 8 days on it is back", !(await at(6 * DAY)).includes(P.lark) && (await at(8 * DAY)).includes(P.lark));
  check("a done company stays away for 30 days", !(await at(29 * DAY)).includes(P.corv) && (await at(31 * DAY)).includes(P.corv));
  await act(MOR, { type: "move", id: P.corv, op: "done" });
  check("done twice counts once", (await homeMoves(MOR)).today.moves!.month === 1);
  r = await act(MOR, { type: "move", id: P.harb, op: "done" });
  check("a second move done: the count says 2", /That's 2 moves this month/.test(r.message) && (await homeMoves(MOR)).today.moves!.month === 2, r.message);
  r = await act(MOR, { type: "move", id: P.harb, op: "undo" });
  m2 = await homeMoves(MOR);
  check("Undo puts it back and takes the count back", r.message === "Back in your moves." && m2.moves[0].id === P.harb && m2.today.moves!.month === 1, m2.moves.map((m) => nameOf(m.id)));
  await act(MOR, { type: "move", id: P.lark, op: "undo" });
  check("Undo of a snooze brings it back", (await homeMoves(MOR)).moves.some((m) => m.id === P.lark));
  check("a company outside her Crystal Ball has no move", (await refused(act(MOR, { type: "move", id: P.out, op: "done" }))) === T.MOVE_NOT_IN);
  check("an unknown thing to do with a move is refused", !!(await refused(act(MOR, { type: "move", id: P.salt, op: "delete" }))) && !!(await refused(act(MOR, { type: "move", id: "nope", op: "done" }))));
  check("signed out: refused", !!(await refused(act("not-a-token", { type: "move", id: P.salt, op: "done" }))));
  // Everyone else is exactly where they were.
  check("Tess's table is the same, byte for byte", JSON.stringify(sortKeys((await T.buildView(TES)).companies)) === tesView0);
  check("Fen's moves are the same", JSON.stringify(sortKeys((await todayView(FRE))!.moves)) === freToday0);
  check("the shared table wasn't built again for it", T.sharedViewStats().builds === stats0.builds, [stats0, T.sharedViewStats()]);
  const state = (await T.exportState()) as Record<string, unknown>;
  check("the export leaves members' moves, voices and networks out", !("moves" in state) && !("voice" in state) && !("network" in state));
  // The log is pure: a month's count is that month's.
  const log = M.emptyMoveLog();
  const jan = Date.UTC(2027, 0, 31, 23);
  M.logMove(log, "c1", "done", jan);
  M.logMove(log, "c2", "done", jan + 2 * HOUR);
  check("the month's count is the calendar month's", M.movesThisMonth(log, jan) === 1 && M.movesThisMonth(log, jan + 2 * HOUR) === 1 && M.movesThisMonth(log, jan + 40 * DAY) === 0, log);
  check("what has run out is forgotten", (M.logMove(log, "c3", "snooze", jan + 400 * DAY), Object.keys(log.done).length === 0 && Object.keys(log.months).length === 0), log);

  /* ================= the note ================= */
  console.log("\nthe note");
  mor.moves = (await homeMoves(MOR)).moves;
  const morNow = await homeMoves(MOR);
  const rowOf = (h: Awaited<ReturnType<typeof homeMoves>>, id: string) => h.today.moves!.list.find((w) => w.id === id)!.row;
  const moveOf = (h: Awaited<ReturnType<typeof homeMoves>>, id: string) => h.moves.find((m) => m.id === id)!;
  tes = await homeMoves(TES);
  const cases: { name: string; h: Awaited<ReturnType<typeof homeMoves>>; id: string; kind: string; tok: string }[] = [
    { name: "someone you know", h: morNow, id: P.lark, kind: "know", tok: MOR },
    { name: "an open role, to someone you know", h: morNow, id: P.harb, kind: "role", tok: MOR },
    { name: "the seat holder on Merlin", h: tes, id: P.salt, kind: "holderMessage", tok: TES },
    { name: "an invite to connect", h: tes, id: P.copp, kind: "holderInvite", tok: TES },
    { name: "an open role", h: tes, id: P.tall, kind: "roleCold", tok: TES },
  ];
  // Asking for an intro: Corvid is done for Morgan now, so read it from the day before she marked it.
  const introFacts = M.noteFacts(mCorv, mor.today.moves!.list.find((w) => w.id === P.corv)!.row, mor.today.me, BASE)!;
  const VOICES: Record<string, VoiceStyle> = {
    casual: { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "sometimes", emoji: true, opener: "smalltalk", phrases: ["Hope the week's treating you well", "No rush at all"] },
    formal: { greeting: "Dear {first},", signoff: "Regards,", name: "full", length: "medium", formality: "formal", contractions: false, exclamations: "never", emoji: false, opener: "direct", phrases: [] },
    terse: { greeting: "none", signoff: "none", name: "none", length: "short", formality: "neutral", contractions: true, exclamations: "never", emoji: false, opener: "direct", phrases: ["Quarterly numbers"] },
    warm: { greeting: "{first},", signoff: "Thanks,", name: "first", length: "medium", formality: "neutral", contractions: true, exclamations: "sometimes", emoji: false, opener: "direct", phrases: ["Looking forward to it"] },
  };
  const allNotes: { who: string; tok: string; text: string }[] = [];
  for (const c of cases) {
    const m = moveOf(c.h, c.id);
    const facts = M.noteFacts(m, rowOf(c.h, c.id), c.h.today.me, BASE);
    check(`${c.name}: a note is drafted, of the right kind`, !!facts && facts.kind === c.kind, facts?.kind);
    if (!facts) continue;
    for (const [vn, v] of [["plain", null], ...Object.entries(VOICES)] as [string, VoiceStyle | null][]) {
      const d = M.draftNote(facts, v);
      allNotes.push({ who: `${c.name} (${vn})`, tok: c.tok, text: `${d.subject}\n${d.body}` });
    }
  }
  for (const [vn, v] of [["plain", null], ...Object.entries(VOICES)] as [string, VoiceStyle | null][]) {
    const d = M.draftNote(introFacts, v);
    allNotes.push({ who: `asking for an intro (${vn})`, tok: MOR, text: `${d.subject}\n${d.body}` });
  }
  check("every situation has its template, plain and in four voices", allNotes.length === 30, allNotes.length);
  // What each member can see: their own table, Crystal Ball and network. A note may use nothing else.
  const visible: Record<string, string> = {};
  for (const tok of [MOR, TES]) visible[tok] = JSON.stringify([(await T.buildView(tok)).companies, await radar.radarView(tok), await G.networkView(tok)]).toLowerCase();
  const leaks = allNotes.flatMap((n) => found(n.text).filter((w) => !visible[n.tok].includes(w.toLowerCase())).map((w) => `${n.who}: ${w}`));
  check("no note has a name, site or contact detail its member can't already see", leaks.length === 0, leaks);
  check("no note has a rate", allNotes.every((n) => !RATE.test(n.text)), allNotes.filter((n) => RATE.test(n.text)).map((n) => n.who));
  check("no note has anyone else's network in it", allNotes.every((n) => !found(n.text, ["Zelda", "Quince", "otherco"]).length) && allNotes.filter((n) => n.tok === TES).every((n) => !found(n.text, NETWORK_WORDS).length));
  check("no note names a person on file the member hasn't opened", allNotes.every((n) => !found(n.text, ["Marisol", "Bastian", "Philippa", "Ivo Castellan", "Odile"]).length));
  check("a note never carries an address in its words", allNotes.every((n) => !/@/.test(n.text)));
  const text = (kind: string, vn = "plain") => allNotes.find((n) => n.who === `${kind} (${vn})`)!.text;
  check("someone you know: the relationship, the why now, her own function", /^Catching up, and a thought on RevOps\nHi Dana,\n\nIt's been since [A-Z][a-z]+( last year)?, which is too long\. I saw Larkfield Robotics hired a fractional CRO 2 months ago\./.test(text("someone you know")) && /a fractional Head of RevOps/.test(text("someone you know")) && /\n\nMorgan$/.test(text("someone you know")), text("someone you know"));
  check("asking for an intro asks for one", /introduc/i.test(text("asking for an intro")) && /^An introduction at Corvid Health\?\nHi Priya,/.test(text("asking for an intro")), text("asking for an intro"));
  check("the seat holder: the seat she can see, and no word on what it paid", /I saw you held the fractional CRO seat at Saltmarsh Energy\./.test(text("the seat holder on Merlin")) && /^Your seat at Saltmarsh Energy\nHi Hana,/.test(text("the seat holder on Merlin")), text("the seat holder on Merlin"));
  const claim = `${BASE}${(tCopp.way as { invite: { path: string } }).invite.path}`;
  check("an invite to connect ends in the seat's claim link, in every voice", ["plain", ...Object.keys(VOICES)].every((vn) => text("an invite to connect", vn).includes(claim) && /Claim it with this link/.test(text("an invite to connect", vn))), text("an invite to connect"));
  check("an open role: the title without its rate, and the posting", /the open Fractional VP RevOps role at Tallgrass Analytics/.test(text("an open role")) && !/9k/.test(text("an open role")), text("an open role"));
  check("an open role with nobody to write to greets nobody by name", /^The Fractional VP RevOps role at Tallgrass Analytics\nHi there,/.test(text("an open role")), text("an open role"));
  check("Merlin never says where a name came from", allNotes.every((n) => !/linkedin|sales navigator|public profile/i.test(n.text)));

  // The voice, setting by setting, on one move.
  const knowFacts = M.noteFacts(moveOf(morNow, P.lark), rowOf(morNow, P.lark), morNow.today.me, BASE)!;
  const plain = M.draftNote(knowFacts, null);
  const body = (v: Partial<VoiceStyle>) => M.draftNote(knowFacts, { ...V.NEUTRAL_VOICE, ...v }).body;
  check("no voice: the plain template, five sentences, signed with her first name", !plain.voiced && M.templateSentences(knowFacts, null).length === 5 && M.templateSentences(knowFacts, null).every((s) => plain.body.includes(s)) && plain.body.startsWith("Hi Dana,\n\n") && plain.body.endsWith("\n\nMorgan"), plain.body);
  check("plain: no exclamation mark, no emoji", !/!/.test(plain.body) && !/\p{Extended_Pictographic}/u.test(plain.body));
  check("greeting: each form", body({ greeting: "Hey {first}," }).startsWith("Hey Dana,\n") && body({ greeting: "{first}," }).startsWith("Dana,\n") && body({ greeting: "Dear {first}," }).startsWith("Dear Dana,\n") && body({ greeting: "none" }).startsWith("It's been since"));
  check("sign-off and name: each form", body({ signoff: "Best,", name: "first" }).endsWith("\n\nBest,\nMorgan") && body({ signoff: "Thanks,", name: "none" }).endsWith("\n\nThanks,") && body({ signoff: "Regards,", name: "full" }).endsWith("\n\nRegards,\nMorgan Hale") && !/Morgan$/.test(body({ signoff: "none", name: "none" })));
  const short = M.templateSentences(knowFacts, { ...V.NEUTRAL_VOICE, length: "short" });
  check("short is three sentences, medium five", short.length === 3 && short.every((s) => body({ length: "short" }).includes(s)) && sentences(body({ length: "short", greeting: "none", name: "none" })).length === 3 && sentences(body({ greeting: "none", name: "none" })).length === 5, sentences(body({ length: "short", greeting: "none", name: "none" })));
  check("tone: casual, neutral and formal read differently", new Set([body({ formality: "casual" }), body({ formality: "neutral" }), body({ formality: "formal" })]).size === 3 && /Would you have 20 minutes/.test(body({ formality: "formal" })) && /Up for 20 minutes/.test(body({ formality: "casual" })));
  const CONTRACTION = /\b(I'm|I'd|I've|it's|that's|you're|don't|isn't|we're|whoever's)\b/i;
  check("contractions: with and without", CONTRACTION.test(body({})) && !CONTRACTION.test(body({ contractions: false })) && /It has been since/.test(body({ contractions: false })) && /I would be glad/.test(body({ contractions: false })), body({ contractions: false }));
  check("contractions off holds in every tone and situation", [...cases.map((c) => M.noteFacts(moveOf(c.h, c.id), rowOf(c.h, c.id), c.h.today.me, BASE)!), introFacts].every((f) => (["casual", "neutral", "formal"] as const).every((formality) => !CONTRACTION.test(M.draftNote(f, { ...V.NEUTRAL_VOICE, formality, contractions: false }).body.replace(/we're connected/, "")))));
  check("exclamation marks: never, or exactly one", !/!/.test(body({ exclamations: "never" })) && (body({ exclamations: "sometimes" }).match(/!/g) ?? []).length === 1 && (body({ exclamations: "sometimes", signoff: "Thanks," }).match(/!/g) ?? []).length === 1 && (body({ exclamations: "sometimes", opener: "smalltalk" }).match(/!/g) ?? []).length === 1, body({ exclamations: "sometimes" }));
  check("emoji: none, or one", (body({ emoji: true }).match(/\p{Extended_Pictographic}/gu) ?? []).length === 1 && !/\p{Extended_Pictographic}/u.test(body({ emoji: false })));
  check("small talk first, or straight to the point", /^Hi Dana,\n\nHope you're well\. It's been since/.test(body({ opener: "smalltalk" })) && /^Hi Dana,\n\nIt's been since/.test(body({ opener: "direct" })) && /I hope this finds you well\./.test(body({ opener: "smalltalk", formality: "formal" })));
  const phrases = ["Hope the week's treating you well", "No rush at all", "Talk soon"];
  const used = (b: string) => phrases.filter((p) => b.includes(p));
  check("a stock phrase goes in where it fits: their own small talk", same(used(body({ opener: "smalltalk", phrases })), ["Hope the week's treating you well"]) && /Hi Dana,\n\nHope the week's treating you well\. It's been/.test(body({ opener: "smalltalk", phrases })));
  check("or their closing line, and never more than one", same(used(body({ opener: "direct", phrases })), ["No rush at all"]) && /\n\nNo rush at all\.\n\nMorgan$/.test(body({ opener: "direct", phrases })), body({ opener: "direct", phrases }));
  check("a phrase that fits nowhere is left out", !body({ phrases: ["Quarterly numbers"] }).includes("Quarterly"));
  check("with a voice the note says so", M.draftNote(knowFacts, VOICES.casual).voiced && !M.draftNote(knowFacts, null).voiced);

  /* ================= sending it ================= */
  console.log("\nmail links");
  const to = (f: ReturnType<typeof M.noteFacts>) => f?.to?.email ?? null;
  check("someone from her own network: the address she already has", to(knowFacts) === "dana@larkfield.example" && knowFacts.to?.from === "your own contacts");
  const gm = M.gmailLink(to(knowFacts), plain.subject, plain.body);
  const mt = M.mailtoLink(to(knowFacts), plain.subject, plain.body);
  check("Open in Gmail: a compose link with the address, the subject and the note", gm.startsWith("https://mail.google.com/mail/?view=cm&fs=1&to=dana%40larkfield.example&su=") && new URL(gm).searchParams.get("body") === plain.body && new URL(gm).searchParams.get("su") === plain.subject, gm.slice(0, 160));
  check("another mail app: a mailto with the same", mt.startsWith("mailto:dana%40larkfield.example?subject=") && decodeURIComponent(mt.split("&body=")[1]) === plain.body, mt.slice(0, 120));
  const saltFacts = M.noteFacts(moveOf(tes, P.salt), rowOf(tes, P.salt), tes.today.me, BASE)!;
  check("a seat holder whose email she hasn't unlocked: To is empty", to(saltFacts) === null && !/to=/.test(M.gmailLink(to(saltFacts), "s", "b")) && M.mailtoLink(to(saltFacts), "s", "b").startsWith("mailto:?subject="), M.gmailLink(to(saltFacts), "s", "b"));
  check("an open role with nobody to write to: To is empty", M.noteFacts(moveOf(tes, P.tall), rowOf(tes, P.tall), tes.today.me, BASE)!.to === null);
  // The person on file with Hana's name shows in her trial (the company is open in full); then she unlocks her email: now the address is hers to use.
  const salt = (await T.buildView(TES)).companies.find((c) => c.id === P.salt)!;
  const hanaRec = salt.engagements.flatMap((e) => e.people).find((p) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Seat holder")!;
  check("her name shows free in the trial", hanaRec.cells.name?.s === "value", hanaRec.cells.name);
  check("the name alone opens no address", to(M.noteFacts(moveOf(await homeMoves(TES), P.salt), rowOf(tes, P.salt), tes.today.me, BASE)) === null);
  await act(TES, { type: "unlock", entity: "contact", id: hanaRec.id, field: "email" });
  tes = await homeMoves(TES);
  const saltNow = M.noteFacts(moveOf(tes, P.salt), rowOf(tes, P.salt), tes.today.me, BASE)!;
  check("a contact she unlocked: the address is in the link", to(saltNow) === "hana@holderco.example" && saltNow.to?.from === "unlocked on Merlin" && M.gmailLink(to(saltNow), "s", "b").includes("to=hana%40holderco.example"));
  check("a link never carries anything that isn't one address", !/to=/.test(M.gmailLink("a@b.co, c@d.co", "s", "b")) && M.mailtoLink("not an address", "s", "b").startsWith("mailto:?") && M.mailtoLink("x@y.example\nbcc: z@y.example", "s", "b").startsWith("mailto:?"));
  check("a locked company, or a locked seat holder, has no note", M.noteFacts(fre.moves[0], fre.today.moves!.list[0].row, fre.today.me, BASE) === null && M.noteFacts(tes0.moves[0], tes0.today.moves!.list[0].row, tes0.today.me, BASE) === null);

  /* ================= the voice ================= */
  console.log("\nthe voice");
  const good = { ...VOICES.casual };
  const bad = (x: unknown) => {
    try {
      V.cleanVoice(x);
      return null;
    } catch (e) {
      return e instanceof V.VoiceProblem ? e.message : `threw ${String(e)}`;
    }
  };
  check("a whole, clean profile is kept as it is", same(V.cleanVoice(good), good));
  check("an unknown field refuses it (message text can't ride in)", /never message text/.test(bad({ ...good, sample: "Hi Dana, thanks for the call yesterday." }) ?? "") && /never message text/.test(bad({ ...good, subject: "Re: Q3" }) ?? ""));
  check("an unknown value refuses it", !!bad({ ...good, greeting: "Yo {first}!" }) && !!bad({ ...good, formality: "very formal" }) && !!bad({ ...good, length: "long" }) && !!bad({ ...good, contractions: "yes" }) && !!bad({ ...good, emoji: 1 }) && !!bad({ ...good, opener: "rambling" }) && !!bad({ ...good, name: "Morgan" }));
  check("a missing field refuses it", !!bad({ greeting: "Hi {first}," }) && !!bad(null) && !!bad("casual") && !!bad([good]));
  const refusedPhrases = [
    "On Tue, Mar 3, Dana Whitfield wrote:", "Re: next steps", "> thanks for the intro", "Hi Dana, thanks for yesterday", "reach me at morgan@halerevops.example", "see https://halerevops.example/deck",
    "book at calendly.com/morgan", "call me on 512 555 0141", "invoice 20391 attached", "first line\nsecond line", "\"as discussed last week\"", "it will be $9k a month",
    "x".repeat(61), "", "One. Two. Three. Four.", "<b>bold</b>",
  ];
  check("phrases that read like mail, an address, a link, a number, or too long are refused", refusedPhrases.every((p) => !!V.phraseProblem(p) && !!bad({ ...good, phrases: [p] })), refusedPhrases.filter((p) => !V.phraseProblem(p)));
  check("their own short phrases are fine", ["Hope you're well", "No rush at all", "Talk soon", "Happy Friday", "Onward", "Appreciate you"].every((p) => V.phraseProblem(p) === null));
  check("at most five phrases, and a repeat counts once", !!bad({ ...good, phrases: ["a", "b", "c", "d", "e", "f"] }) && V.cleanVoice({ ...good, phrases: ["Talk soon", "talk soon"] }).phrases.length === 1);

  // The app: saved by hand, theirs alone, removed.
  r = await act(MOR, { type: "voice", voice: VOICES.formal });
  let me = (await T.buildView(MOR)).me!;
  check("Your profile saves it, checked on the server", /Saved/.test(r.message) && same(V.styleOf(me.voice), VOICES.formal) && me.voice?.by === "you" && !!me.voice?.at, me.voice);
  check("?today=1 carries it for the note sheet", same(V.styleOf((await todayView(MOR))!.me.voice), VOICES.formal));
  check("the app refuses what the server refuses", /never message text/.test((await refused(act(MOR, { type: "voice", voice: { ...VOICES.formal, body: "Dear Dana, ..." } }))) ?? "") && !!(await refused(act(MOR, { type: "voice", voice: { ...VOICES.formal, phrases: ["mail me at a@b.example"] } }))) && same(V.styleOf((await T.buildView(MOR)).me!.voice), VOICES.formal));
  check("nobody else's Me has a voice", !(await T.buildView(TES)).me!.voice && !(await T.buildView(FRE)).me!.voice && !(await T.buildView("tok-ada-moves")).me!.voice);
  const admin = JSON.stringify(await T.buildView("tok-ada-moves"));
  check("an admin's view has nobody's voice, moves or network", !/Regards,|"voice"|"moves"/.test(admin) && !found(admin, NETWORK_WORDS.filter((w) => w.length > 5)).length);
  check("Tess's table is still the same, and the shared table still wasn't built again", JSON.stringify(sortKeys((await T.buildView(TES)).companies)) !== "" && T.sharedViewStats().builds === stats0.builds);
  r = await act(MOR, { type: "voice", remove: true });
  check("Remove takes it away", /removed/.test(r.message) && !(await T.buildView(MOR)).me!.voice);

  // The connector: conclusions only, shown first, saved once the member agrees.
  const ctx = await ctxOf(MOR);
  const toolRefused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => (e instanceof tools.ToolProblem ? e.message : `threw ${String(e)}`));
  let out = await tools.saveMyVoice(ctx, { voice: { ...VOICES.casual } });
  check("save_my_voice without the member's yes saves nothing and says what to show them", out.saved === false && /Show the member/.test(String(out.next)) && !(await T.buildView(MOR)).me!.voice, out);
  out = await tools.saveMyVoice(ctx, { voice: { ...VOICES.casual }, member_agreed: true });
  me = (await T.buildView(MOR)).me!;
  check("with their yes it is saved, from their Claude", out.saved === true && same(V.styleOf(me.voice), VOICES.casual) && me.voice?.by === "claude", me.voice);
  check("save_my_voice refuses message text: another field", /never message text/.test((await toolRefused(tools.saveMyVoice(ctx, { voice: { ...VOICES.casual, examples: ["Hi Dana, great seeing you at the offsite."] }, member_agreed: true }))) ?? "") && /never message text/.test((await toolRefused(tools.saveMyVoice(ctx, { voice: { ...VOICES.formal, sent_mail: "..." }, member_agreed: true }))) ?? "") && !!(await toolRefused(tools.saveMyVoice(ctx, { voice: "Hi Dana, great seeing you.", member_agreed: true }))) && !!(await toolRefused(tools.saveMyVoice(ctx, { member_agreed: true }))));
  check("save_my_voice refuses a phrase that reads like mail, and a value off the list", !!(await toolRefused(tools.saveMyVoice(ctx, { voice: { ...VOICES.formal, phrases: ["On Monday Priya Raman wrote: sounds good"] }, member_agreed: true }))) && !!(await toolRefused(tools.saveMyVoice(ctx, { voice: { ...VOICES.formal, phrases: ["priya@corvidhealth.example"] }, member_agreed: true }))) && !!(await toolRefused(tools.saveMyVoice(ctx, { voice: { ...VOICES.formal, signoff: "Kind regards, Morgan Hale, +1 512 555 0141" }, member_agreed: true }))));
  check("a refused save changed nothing", same(V.styleOf((await T.buildView(MOR)).me!.voice), VOICES.casual));
  const mv = await tools.myVoice(ctx);
  check("my_voice reads it back, the member's own", mv.saved === true && same(mv.voice, VOICES.casual) && /Claude/.test(String(mv.saved_by)), mv);
  check("my_voice for a member with none says how to learn it, and has nobody else's", (await tools.myVoice(await ctxOf(TES))).saved === false && !JSON.stringify(await tools.myVoice(await ctxOf(TES))).includes("Cheers"));
  check("the saved voice is in nobody else's view or Home, and not in the export", !JSON.stringify([await T.buildView(TES), await todayView(TES), await T.buildView(OTH), await T.exportState()]).includes("No rush at all"));

  /* ================= todays_moves ================= */
  console.log("\ntodays_moves");
  const tm = (await tools.todaysMoves(ctx)) as { moves: Record<string, unknown>[]; moves_done_this_month: number; voice: unknown; how_to_use: string };
  const app = (await movesFor(MOR))!;
  // A move's words as the connector may say them: without the person, when the person comes from the member's Google account.
  const said = (m: Move) => (m.way.kind === "know" && m.way.person.google ? M.moveWithoutPerson(m, app.me) : { title: m.title, line: m.line });
  // A company the trial hasn't opened is "Locked company" in the connector and unnamed on Home.
  check("todays_moves is Home's moves: the same companies, in the same order, with the same why", same(tm.moves.map((m) => [m.company_id, m.company, m.why_now]), app.moves.map((m) => [m.id, m.name ?? "Locked company", m.why])), tm.moves.map((m) => m.company));
  check("and the same move, said without the person where the person is from Google", same(tm.moves.map((m) => [m.your_move, m.how]), app.moves.map((m) => [said(m).title, said(m).line])), tm.moves.map((m) => [m.your_move, m.how]));
  check("and the same as ?today=1's", same(tm.moves.map((m) => m.company_id), (await todayView(MOR))!.moves!.list.map((w) => w.id)) && tm.moves_done_this_month === app.wire.month);
  const noteOf = (id: string) => tm.moves.find((m) => m.company_id === id)?.note as { to: string; facts: Record<string, unknown>; merlin_draft?: unknown } | undefined;
  // Morgan's people come from her Google Calendar: nothing of theirs leaves Merlin through the connector.
  const googled = app.moves.filter((m) => m.way.kind === "know" && m.way.person.google);
  const larkApp = app.moves.find((m) => m.id === P.lark)!;
  check("Morgan's two people are from Google (her calendar), and Home still names them", googled.length === 2 && same(googled.map((m) => m.id), [P.harb, P.lark]) && larkApp.title === "Message Dana" && larkApp.way.kind === "know" && larkApp.way.person.name === "Dana Whitfield" && (await todayView(MOR))!.moves!.list.find((w) => w.id === P.lark)!.know!.name === "Dana Whitfield");
  // SHOW=1: print one such move as the connector answers it.
  if (process.env.SHOW) console.log(JSON.stringify(tm.moves.find((m) => m.company_id === P.lark), null, 1));
  const raw = JSON.stringify(tm);
  const theirs =googled.flatMap((m) => (m.way.kind === "know" ? [m.way.person] : []));
  const personWords = [
    ...theirs.flatMap((p) => [p.name, ...p.name.split(" "), p.title ?? "", p.last ?? "", M.knowLine(p), M.sinceMonth(p.last) ?? "", M.lastMetWords(p.last) ?? "", `${p.meetings} meeting`]),
    "Priya", "Raman", "Director of Operations", "last_met", "Last met", "meetings", "relationship",
  ].filter(Boolean);
  check("a Google-sourced person: no name, title, counts or last-met date anywhere in the tool's answer", theirs.length === 2 && !found(raw, personWords).length, found(raw, personWords));
  const wayOf = (id: string) => tm.moves.find((m) => m.company_id === id)!.way_in as Record<string, unknown>;
  check("what stays: that she knows someone there, how warm, and whether they decide", same(Object.keys(wayOf(P.lark)).sort(), ["decision_maker", "from", "kind", "person", "warmth"]) && wayOf(P.lark).kind === "someone the member knows" && wayOf(P.lark).warmth === "Warm" && wayOf(P.lark).decision_maker === true, wayOf(P.lark));
  check("and it says plainly where the name and the note are", /name and the drafted note are on Merlin's Home/.test(String(wayOf(P.lark).person)) && /calendar and contacts the member connected/.test(String(wayOf(P.lark).person)));
  check("the answer's own words carry no company's name (a fixed line can't name one that may be locked)", !/Google/.test(raw));
  check("the move is said without the name", tm.moves.find((m) => m.company_id === P.lark)!.your_move === "Message the person you know there" && /let the person you know there know/.test(String(tm.moves.find((m) => m.company_id === P.harb)!.how)));
  check("its note has a placeholder for the name and no draft of Merlin's", noteOf(P.lark)!.to === "[their first name]" && !("merlin_draft" in noteOf(P.lark)!) && /draft is on Merlin's Home/.test(String((noteOf(P.lark) as unknown as { drafting: string }).drafting)) && !/Hey|Cheers|Hope the week/.test(JSON.stringify(noteOf(P.lark))), noteOf(P.lark));
  check("the facts that aren't the person's stay, so Claude can still help with the wording", same(noteOf(P.lark)!.facts.company, "Larkfield Robotics") && /hired a fractional CRO/.test(String(noteOf(P.lark)!.facts.what_happened)) && same(Object.keys(noteOf(P.lark)!.facts).sort(), ["company", "member", "what_happened"]) && /open_role/.test(JSON.stringify(noteOf(P.harb)!.facts)), noteOf(P.lark)!.facts);
  check("it tells Claude why a name is missing and not to guess one", /calendar and contacts the member connected/.test(tm.how_to_use) && /don't guess/.test(tm.how_to_use) && /\[their first name\]/.test(tm.how_to_use));
  check("the words without the person are the move's own otherwise", same(M.moveWithoutPerson(mCorv, app.me), { title: "Ask the person you know there for an intro", line: "They aren't the buyer on file, but know the team. Ask for an introduction to whoever owns RevOps." }) && same(M.moveWithoutPerson(tSalt, app.me), { title: tSalt.title, line: tSalt.line }));
  check("which sources are Google's: Calendar, Contacts and Gmail, alone or with Claude's; Claude's alone is not", M.fromGoogle(["calendar"]) && M.fromGoogle(["contacts"]) && M.fromGoogle(["gmail"]) && M.fromGoogle(["claude", "contacts"]) && !M.fromGoogle(["claude"]) && M.fromGoogle([]) && M.fromGoogle(null));

  // Finn's one person came from what his own Claude saved: the connector gives them back as before.
  const tmFew = (await tools.todaysMoves(await ctxOf(FEW))) as { moves: Record<string, unknown>[] };
  const appFew = (await movesFor(FEW))!;
  const qMove = appFew.moves[0];
  const q = tmFew.moves[0];
  const qWay = q.way_in as Record<string, unknown>;
  const qNote = q.note as { to: string; facts: Record<string, unknown>; merlin_draft: { subject: string; body: string } };
  const qDraft = M.draftNote(M.noteFacts(qMove, appFew.wire.list[0].row, appFew.me, BASE)!, null);
  check("someone only the member's Claude saved is not Google-sourced", qMove.id === P.salt && qMove.way.kind === "know" && qMove.way.person.name === "Quentin Vale" && qMove.way.person.google === false, qMove.way);
  check("so todays_moves names them, with their title and the relationship", qWay.name === "Quentin Vale" && qWay.title === "Chief Revenue Officer" && qWay.relationship === M.knowLine((qMove.way as { person: import("../lib/moves").KnowPerson }).person) && /14 emails/.test(String(qWay.relationship)) && q.your_move === "Message Quentin" && q.your_move === qMove.title && q.how === qMove.line, qWay);
  check("and its note is the app's own draft, to them by name", qNote.to === "Quentin Vale" && same(qNote.merlin_draft, { subject: qDraft.subject, body: qDraft.body }) && /^Hi Quentin,/.test(qNote.merlin_draft.body) && typeof qNote.facts.last_met === "string", qNote);
  check("still with no address", !/@/.test(JSON.stringify(tmFew)));
  check("no address leaves Merlin through it, and no rate", !/@/.test(JSON.stringify(tm)) && !RATE.test(JSON.stringify(tm.moves.map((m) => [m.note, m.why_now, m.how]))), JSON.stringify(tm).match(/\S+@\S+/)?.[0]);
  check("it tells Claude the member sends, and to use only these facts", /member sends each note themselves/.test(tm.how_to_use) && /never add/.test(tm.how_to_use) && same(tm.voice, VOICES.casual));
  const tmFre = (await tools.todaysMoves(await ctxOf(FRE))) as { moves: Record<string, unknown>[] };
  check("for Free it names nothing and drafts nothing", !found(tmFre).length && tmFre.moves.every((m) => m.company === "Locked company" && m.locked === true && !("note" in m)), found(tmFre));
  const tmTes = (await tools.todaysMoves(await ctxOf(TES))) as { moves: Record<string, unknown>[] };
  check("for Tess: her own moves, nobody's network, and only what she opened", same(tmTes.moves.map((m) => m.company_id), (await movesFor(TES))!.moves.map((m) => m.id)) && !found(tmTes, NETWORK_WORDS).length && !found(tmTes, ["Bastian", "Marisol", "Philippa", "Cheers"]).length, found(tmTes, NETWORK_WORDS));

  // The buyer and "Find who runs RevOps", through the connector (Olga, Pro: the buyer on file, and nobody who decides on file).
  const OLD = "tok-old-moves";
  // Olga is on Pro: every company is open already (open data on paid plans), so nothing needs opening and the buyer is named at once.
  let tmOld = (await tools.todaysMoves(await ctxOf(OLD))) as { moves: Record<string, unknown>[] };
  const oldWay = (id: string) => tmOld.moves.find((m) => m.company_id === id)!.way_in as Record<string, unknown>;
  check("todays_moves on Pro: the buyer as the way in, named at once (everything is open)", oldWay(P.embr).kind === "the buyer: a decision maker on file" && oldWay(P.embr).who === "hired their fractional CMO" && oldWay(P.embr).name === "Rhea Vance", oldWay(P.embr));
  const oldRhea = ((await movesFor(OLD))!.moves.find((m) => m.id === P.embr)!.way as { personId: string }).personId;
  check("her name has nothing to buy on Pro", /Nothing here is locked/.test(String(await act(OLD, { type: "unlock", entity: "contact", id: oldRhea, field: "name" }).catch((e: Error) => e.message))));
  await act(OLD, { type: "unlock", entity: "contact", id: oldRhea, field: "email" });
  tmOld = (await tools.todaysMoves(await ctxOf(OLD))) as { moves: Record<string, unknown>[] };
  const embrTm = tmOld.moves.find((m) => m.company_id === P.embr)!;
  const embrNote = embrTm.note as { to: string; situation: string; facts: Record<string, unknown>; merlin_draft: { body: string } };
  check("once opened: named, with the note to them and the pattern's free facts, and still no address", oldWay(P.embr).name === "Rhea Vance" && embrTm.your_move === "Write to Rhea" && embrNote.to === "Rhea Vance" && /decision maker on file/.test(embrNote.situation) && (embrNote.facts.company_pattern as { hired: string }).hired === "a fractional CMO" && /When a SaaS company is past \$5M/.test(embrNote.merlin_draft.body) && !/@/.test(JSON.stringify(tmOld)), embrTm);
  const quayTm = tmOld.moves.find((m) => m.company_id === P.quay)! as Record<string, unknown> & { find_the_buyer: Record<string, string> };
  check("todays_moves: nobody who decides on file comes with where to look, said as a search to open", !!quayTm.find_the_buyer && quayTm.find_the_buyer.what === "Find who runs RevOps at Quayside Labs" && quayTm.find_the_buyer.linkedin_people_search.startsWith("https://www.linkedin.com/search/results/people/?keywords=") && quayTm.find_the_buyer.website === "https://quayside.example/" && /not facts Merlin holds/.test(quayTm.find_the_buyer.then), quayTm);
  const gcQuay = (await tools.getCompany(await ctxOf(OLD), { company: P.quay })) as { warm_paths: Record<string, unknown>[] };
  const gcEmbr = (await tools.getCompany(await ctxOf(OLD), { company: P.embr })) as { warm_paths: Record<string, unknown>[] };
  check("get_company's warm_paths: the seat's hirer marked as a decision maker", gcEmbr.warm_paths.some((w) => w.person_id === oldRhea && w.decision_maker === true && w.name === "Rhea Vance") && !gcEmbr.warm_paths.some((w) => "find_the_buyer" in w), gcEmbr.warm_paths);
  check("and where to look, when nobody who decides is on file", gcQuay.warm_paths.some((w) => !!w.find_the_buyer), gcQuay.warm_paths);
  const gcLocked = (await tools.getCompany(await ctxOf(TES), { company: P.pine })) as { warm_paths: Record<string, unknown>[] };
  check("never at a locked company (its name would be in the search)", !gcLocked.warm_paths.some((w) => "find_the_buyer" in w) && !found(gcLocked, ["Pinecrest"]).length);

  /* ================= the Pro welcome ================= */
  console.log("\nthe Pro welcome");
  const plan = async (tok: string) => (await T.buildView(tok)).me!.plan!;
  check("right after Pro: the welcome is due", (await plan("tok-pro-moves")).name === "pro" && (await plan("tok-pro-moves")).proWelcome === true);
  check("and ?today=1 says so, for Home's first paint", (await todayView("tok-pro-moves"))!.plan?.proWelcome === true);
  check("bought in the trial, first charge still to come: due too", (await plan("tok-hld-moves")).name === "pro" && (await plan("tok-hld-moves")).proWelcome === true && !!(await plan("tok-hld-moves")).proStartsAt);
  check("never for Trial, Free, or someone on Pro for months", !(await plan(MOR)).proWelcome && !(await plan(FRE)).proWelcome && (await plan("tok-old-moves")).name === "pro" && !(await plan("tok-old-moves")).proWelcome);
  await act("tok-pro-moves", { type: "noticeSeen", kind: "proWelcome" });
  check("Got it: it doesn't come back", !(await plan("tok-pro-moves")).proWelcome && !(await todayView("tok-pro-moves"))!.plan?.proWelcome);
  await act("tok-pro-moves", { type: "noticeSeen", kind: "proWelcome" });
  check("and stays away", !(await plan("tok-pro-moves")).proWelcome);
  check("someone else's welcome is still theirs", (await plan("tok-hld-moves")).proWelcome === true);
  check("the trial-ended card is a different notice", (await plan(FRE)).trialEnded === true);

  /* ================= Free's one a day, from a move ================= */
  console.log("\nFree's one a day");
  const freCredits = await credits(FRE);
  await act(FRE, { type: "unlock", entity: "company", id: P.tall, field: "identity", from: "crystal" });
  const fre2 = await homeMoves(FRE);
  const opened = fre2.moves.find((m) => m.id === P.tall)!;
  check("Free opens one from a move, with everything on it, for no credits", !opened.hidden && opened.name === "Tallgrass Analytics" && opened.do === "reply" && (await credits(FRE)) === freCredits, opened);
  check("then today's is used: the others stay locked and unnamed, and say so", fre2.today.me.crystal === "used" && fre2.moves.filter((m) => m.id !== P.tall).every((m) => m.hidden && m.name === null && m.do === "open" && /is used/.test(m.line)), fre2.moves.map((m) => m.line));
  check("a second one is refused, as from Crystal Ball", !!(await refused(act(FRE, { type: "unlock", entity: "company", id: P.salt, field: "identity", from: "crystal" }))));

  /* ================= "You know this person": their own contacts who hold a seat ================= */
  console.log("\nyou know this person");
  const KIT = "tok-kit-moves";
  const netKit = async () => (await G.networkView(KIT)) as import("../lib/google/types").NetworkView;
  check("the name key folds case and accents and keeps first and last", G.nameMatchKey("Pélla  QUIST") === "pella quist" && G.nameMatchKey("Pella J. Quist") === "pella quist" && G.nameMatchKey("Pella") === null && G.nameMatchKey("Pella Q") === null);
  let nk = await netKit();
  check("a locked company: nobody matched, the contact stays under people at companies not on Merlin", !nk.companies.some((c) => c.id === P.copp) && nk.loose.some((p) => p.name === "Pella Quist"), nk.companies.map((c) => c.name));
  await act(KIT, { type: "unlock", entity: "company", id: P.copp, field: "identity", from: "crystal" });
  nk = await netKit();
  // Fellow fractionals are free (PEERS_FREE): with the company open, its seat holder is seen at once, so the match is made.
  check("the company open: its seat holder is free to see, so the match is made", nk.companies.some((c) => c.id === P.copp));
  await free(act(KIT, { type: "unlock", entity: "engagement", id: pub("e_copp_cmo"), field: "operator" }));
  nk = await netKit();
  const coppNet = nk.companies.find((c) => c.id === P.copp);
  const pella = coppNet?.people.find((p) => p.name === "Pella Quist");
  check("seen by name: her Hot contact with a fractional title is the seat holder, and the company joins her network", !!pella && same(pella.seat, { id: pub("e_copp_cmo"), fn: "Marketing", now: true }) && pella.warmth === "Hot" && pella.email === "pella@quistco.example" && pella.dm === false, coppNet);
  check("so it is in Crystal Ball's Where you know someone (the page cuts the day to her network's companies)", nk.companies.some((c) => c.id === P.copp && c.ball));
  check("and she is no longer listed at companies not on Merlin yet", !nk.loose.some((p) => p.name === "Pella Quist"));
  const kitHome = await homeMoves(KIT);
  const kCopp = kitHome.moves.find((m) => m.id === P.copp);
  check("the move: You know Pella (Hot), who holds their Marketing seat", !!kCopp && kCopp.way.kind === "know" && kCopp.title === "Message Pella" && kCopp.line === "You know Pella (Hot), who holds their Marketing seat. Ask who decides on RevOps there." && M.knowSeatLine(kCopp.way.person) === "You know Pella (Hot), who holds their Marketing seat.", kCopp && [kCopp.title, kCopp.line]);
  const kFacts = kCopp ? M.noteFacts(kCopp, rowOf0(kitHome, P.copp), kitHome.today.me, BASE) : null;
  const kDraft = kFacts ? M.draftNote(kFacts, null) : null;
  check("the draft goes to her, with her address from Kit's own contacts", kFacts?.kind === "knowHolder" && kFacts.to?.email === "pella@quistco.example" && kFacts.to.from === "your own contacts" && /^Hi Pella,\n\n/.test(kDraft!.body) && /I know you hold the Marketing seat there/.test(kDraft!.body) && /Who decides on RevOps there/.test(kDraft!.body), kDraft?.body);
  check("the note has no address in its words and no rate", !!kDraft && !/@/.test(kDraft.body) && !RATE.test(kDraft.body));
  // The decoy: a contact with a seat holder's name and a title that isn't a fractional's, nor the seat's function.
  await act(KIT, { type: "unlock", entity: "company", id: P.blue, field: "identity", from: "crystal" });
  await free(act(KIT, { type: "unlock", entity: "engagement", id: pub("e_blue_cro"), field: "operator" }));
  nk = await netKit();
  check("a name alone never matches: Ivo the office manager isn't the fractional CRO", !nk.companies.some((c) => c.id === P.blue) && nk.loose.some((p) => p.name === "Ivo Castellan"));
  // By email: Hana is a member; her seat is at Saltmarsh, which Kit hasn't opened.
  check("by email, a locked company: no match yet", !nk.companies.some((c) => c.id === P.salt));
  await act(KIT, { type: "unlock", entity: "company", id: P.salt, field: "identity", from: "crystal" });
  check("by email, the company open: the seat holder is free to see, so the match is made", (await netKit()).companies.some((c) => c.id === P.salt));
  await free(act(KIT, { type: "unlock", entity: "engagement", id: pub("e_salt_cro"), field: "operator" }));
  nk = await netKit();
  const hana = nk.companies.find((c) => c.id === P.salt)?.people.find((p) => p.email === "han.moves@example.com");
  check("by email: her contact is Hana, a member, so the seat joins though the names differ", !!hana && hana.seat?.id === pub("e_salt_cro") && !nk.loose.some((p) => p.email === "han.moves@example.com"), nk.companies.find((c) => c.id === P.salt));
  // Theirs alone.
  for (const [who, tok] of [["Morgan", MOR], ["Tess", TES], ["Oto", OTH]] as const) {
    const other = await G.networkView(tok);
    check(`${who}'s network has none of Kit's contacts`, !found(other, ["quistco", "pella@", "han.moves@", "castellan.example"]).length);
  }
  const tmKit = (await tools.todaysMoves(await ctxOf(KIT))) as { moves: Record<string, unknown>[] };
  check("the connector never names a person from her Google account, seat or not", !found(tmKit, ["Pella", "quistco", "han.moves", "Hana H"]).length && (tmKit.moves.find((m) => m.company_id === P.copp)?.your_move ?? "Message the person you know there") === "Message the person you know there", tmKit.moves.map((m) => m.your_move));
  check("nor does my_network", !found(await G.myNetworkForClaude((await T.memberForToken(KIT))!), ["Pella", "quistco", "Hana H", "han.moves"]).length);
  const hanM = (await T.memberForToken("tok-han-moves"))!;
  const seedS = { seed: await T.loadSeed(), s: await T.loadState() };
  const hanOwn = G.seatMatchesOf(seedS.seed, seedS.s, hanM, { con: { at: iso(0), unmatched: 0, real: 1, companies: {}, loose: [{ key: "han.moves@example.com", email: "han.moves@example.com", name: "Hana Holder", title: "Fractional CRO", src: ["contacts"] }] } });
  check("a member's own seat never matches their own contact", hanOwn.length === 0, hanOwn);

  /* ---------- what a note says it saw, and the specific ask for an introduction ---------- */
  console.log("\nWhat a note saw, said as English; the specific ask in every voice");
  const seatRow = (l: string) => ({ id: "c_x", kinds: ["seat" as const], lines: [l] });
  check("an ended seat reads \"that a fractional Sales seat ended at Acme\", never \"A fractional ...\" mid-sentence", M.sawClause(seatRow("A fractional Sales seat ended · 2 months ago"), "Acme") === "that a fractional Sales seat ended at Acme" && M.sawClause(seatRow("Their fractional Sales seat ended"), "Acme") === "that a fractional Sales seat ended at Acme", M.sawClause(seatRow("A fractional Sales seat ended"), "Acme"));
  const seatFacts = { ...knowFacts, saw: M.sawClause(seatRow("A fractional Sales seat ended"), "Acme Robotics") };
  const sawNotes = (["casual", "neutral", "formal"] as const).map((formality) => M.draftNote(seatFacts, { ...V.NEUTRAL_VOICE, formality, length: "medium" }).body);
  check("in each tone: \"Saw that a\", \"I saw that a\", \"I noticed that a\", never \"that that\" or \"saw A\"", /Saw that a fractional Sales seat ended at Acme Robotics\./.test(sawNotes[0]) && /I saw that a fractional Sales seat ended at Acme Robotics\./.test(sawNotes[1]) && /I noticed that a fractional Sales seat ended at Acme Robotics\./.test(sawNotes[2]) && !sawNotes.some((b) => /that that|saw A |noticed that A /.test(b)), sawNotes);
  const intro = {
    lines: [
      { company: "Acorn Ridge Logistics", you: "You worked with Dana Ruiz at Brightloop. Dana Ruiz is now at Acorn Ridge Logistics as their fractional CRO.", now: "hired a fractional CMO 1 month ago and has no Sales leader yet", person: "Dana Ruiz", to: "Dana Ruiz" },
      { company: "Fernway Health", you: "You hold the fractional RevOps seat at Fernway Health.", now: null, person: null, to: "the team there" },
    ],
    locked: 1,
  };
  const askF = { ...knowFacts, kind: "introAsk" as const, intro };
  const asks = [null, ...Object.values(VOICES)].map((v) => M.draftNote(askF, v));
  check("the specific ask names who and where, why now, and asks for that introduction, in every voice", asks.every((d) => d.subject === "An intro at Acorn Ridge Logistics?" && /Dana Ruiz/.test(d.body) && /introduce me to Dana Ruiz\?/.test(d.body) && !/You see a lot of teams/.test(d.body)) && /Acorn Ridge Logistics hired a fractional CMO 1 month ago and has no Sales leader yet/.test(asks[0].body) && /Fernway Health is on my list too\. You hold the fractional RevOps seat at Fernway Health\./.test(asks[0].body), asks[0].body);
  check("no em dash, no locked count in the words, contractions off where the voice says so", asks.every((d) => !/—/.test(d.body) && !/locked/.test(d.body)) && (["casual", "neutral", "formal"] as const).every((formality) => !CONTRACTION.test(M.draftNote(askF, { ...V.NEUTRAL_VOICE, formality, contractions: false }).body)));
  check("with no lines it is the general ask, as before", /You see a lot of teams/.test(M.draftNote({ ...askF, intro: { lines: [], locked: 2 } }, null).body));
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
