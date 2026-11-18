#!/usr/bin/env node
/**
 * Checks of the referral network: Invite to connect, the claim bonus and the conversation it opens,
 * Message on a member's seat, the Referral partners page and the connector's warm paths.
 *
 *   npx tsx scripts/test-partners.mts            (PARTNERS_PORT=4598 by default)
 *
 * No private data: a made-up seed, state and seed key in a scratch folder, removed at the end.
 * Every person in them is made up.
 *
 *  1. Pure: the words (lib/partners.ts): the opener, the invite note, the conversation's first
 *     message, kinds of clients.
 *  2. In process: the connector's warm paths say Message or Invite to connect, with the link, only
 *     after the unlock; "Partners at your kind of clients" (app/post/partnersModel.ts) on a member's
 *     own view never holds a name before the unlock; the page's order and answers with their
 *     20-company and 20-member thresholds (partnersView).
 *  3. Over HTTP: the invite record (no duplicates), the claim through the link (the token verifies
 *     and the invite code is carried), the bonus for both once per invitee within REFERRAL_LIMIT, no
 *     bonus for a self-invite or an already-claimed seat, the conversation opened once with the note,
 *     the inviter told (unread), a claim waiting for an admin connecting on approval, a name taken
 *     off voiding the invite, a member who never signed in connecting by signing in, Connect from
 *     Referral partners, and the opt-out.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};

const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const claimTok = (id: string) => createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`claim:${id}`).digest("base64url").slice(0, 22);
process.env.RN_INTEL_SEED_KEY = TEST_KEY;

/* ---------- 1. the words ---------- */

console.log("\nThe words");
const W = await import("../lib/partners.ts");
const opener = W.seatOpener({ first: "Pella", role: "Fractional CMO", fn: "Marketing", company: "Alpha Partner Co", myTitle: "Fractional VP Sales", myFn: "Sales" });
check(
  "Message: the owner's opener",
  opener === "Hi Pella, I saw you held the fractional CMO seat at Alpha Partner Co. I work with similar companies as a fractional VP Sales. Open to swapping notes and referrals?",
  opener,
);
check("Message: a role without Fractional, and no role, read right", W.seatWords("VP Marketing", "Marketing") === "the fractional VP Marketing seat" && W.seatWords(null, "Finance") === "the fractional Finance seat" && W.seatWords("Interim CFO", null) === "the interim CFO seat");
check("Message: no title reads from the function, else a fractional leader", W.myWords("", "RevOps") === "a fractional RevOps leader" && W.myWords(null, null) === "a fractional leader" && W.myWords("Fractional CRO at Acme", "Sales") === "a fractional CRO");
const icp = { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: ["United States"] };
check("kinds of clients from an Ideal Fractional Profile", W.clientKinds(icp) === "SaaS companies of 51–200 people in the US", W.clientKinds(icp));
check("no profile, no kinds", W.clientKinds(null) === null && W.clientKinds({ industries: [], employees: [], revenue: [], countries: [] }) === null);
const link = `https://merlin.example.com/claim/${"A".repeat(22)}?ref=abcd1234`;
const note = W.inviteNote({ first: "Pella", role: "Fractional CMO", fn: "Marketing", company: "Alpha Partner Co", myTitle: "Fractional VP Sales", myFn: "Sales", icp, link });
check("Invite: the note has their first name, the seat, the member's function and kind of clients, and the link", /^Hi Pella, I saw you held the fractional CMO seat at Alpha Partner Co\. I'm a fractional VP Sales and I work with SaaS companies of 51–200 people in the US\./.test(note) && note.endsWith(link), note);
check("Invite: it never says where the name came from", !/linkedin|sales nav|public profile|found you/i.test(note));
check("Invite: no colons or em dashes in its sentences", !/—/.test(note) && !/[a-z]:\s/i.test(note.replace(link, "")));
const first = W.connectText("Ivy", note);
check("the conversation's first message: who invited them, then the note without its claim link", first.startsWith("Ivy invited you to connect as referral partners.\n\nHi Pella") && !first.includes("/claim/") && !first.includes("Claim it with this link"), first);
check("a note is kept to 2,000 characters, line breaks and all", W.cleanNote("a\r\n\r\n\r\n\r\nb" + "x".repeat(3000)).length === 2000 && W.cleanNote("a\r\n\r\n\r\nb").startsWith("a\n\nb"));
check("Connect from Referral partners: its opener", W.partnerOpener({ first: "Sam", myTitle: "Fractional VP Sales", myFn: "Sales", icp }) === "Hi Sam, I'm a fractional VP Sales working with SaaS companies of 51–200 people in the US. I found you in Merlin's referral partners. Open to swapping notes and referrals?");

/* ---------- the made-up seed and state ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "tp-partners-"));
const seedPath = path.join(dir, "intel-seed.json");
const FIRSTS = ["Abel", "Bree", "Cato", "Dara", "Esme", "Finn", "Gale", "Hugo", "Iris", "Jude", "Kemp", "Lyra", "Milo", "Nell", "Otto", "Pia", "Rhys", "Sage", "Tova", "Uma"];
const LARKS = ["Lark Ashby", "Lark Brandt", "Lark Corwin", "Lark Dorsey", "Lark Ellery", "Lark Fenwick"];
const P = {
  pella: "Pella Partnerton",
  rory: "Rory Waitwell",
  zed: "Zed Removable",
  quinn: "Quinn Mirrorly",
  nora: "Nora Neverin",
  sam: "Sam Signedin",
  mara: "Mara Memberly",
  selma: "Selma Samefunc",
  farrah: "Farrah Outside",
  fula: "Fula Fulltimer",
};
const seedMembers = [
  { id: "sm_vera", name: "Vera Viewpoint", email: "vera-pt@example.com", title: "Fractional VP Sales", token: "pt-tok-vera" },
  { id: "sm_sam", name: P.sam, email: "sam-pt@example.com", title: "Fractional RevOps Lead", token: "pt-tok-sam" },
  { id: "sm_nora", name: P.nora, email: "nora-pt@example.com", title: "Fractional CMO", token: "pt-tok-nora" },
  { id: "sm_mara", name: P.mara, email: "mara-pt@example.com", title: "Fractional CMO", token: "pt-tok-mara" },
  { id: "sm_hide", name: "Hollis Hidden", email: "hollis-pt@example.com", title: "Fractional CFO", token: "pt-tok-hide" },
  ...FIRSTS.map((f, i) => ({ id: `sm_as${i}`, name: `${f} Answerwell`, email: `as${i}-pt@example.com`, title: "Fractional VP Sales", token: `pt-tok-as${i}` })),
  ...FIRSTS.slice(0, 19).map((f, i) => ({ id: `sm_am${i}`, name: `${f} Marketeer`, email: `am${i}-pt@example.com`, title: "Fractional CMO", token: `pt-tok-am${i}` })),
];
const fit = { industry: "SaaS", employees: "51–200" };
const companies = [
  { id: "c_alpha", fields: { name: "Alpha Partner Co", website: "alpha-pt.example.com", ...fit, hq: "Austin, TX" } },
  { id: "c_bravo", fields: { name: "Bravo Partner Labs", website: "bravo-pt.example.com", ...fit, hq: "Denver, CO" } },
  { id: "c_far", fields: { name: "Far Partner Werke", website: "far-pt.example.com", industry: "Manufacturing", employees: "1,001+", hq: "Berlin, Germany" } },
  ...Array.from({ length: 20 }, (_, i) => ({ id: `c_o${i}`, fields: { name: `Orchard Labs ${i + 1}` } })),
  ...Array.from({ length: 19 }, (_, i) => ({ id: `c_f${i}`, fields: { name: `Fieldstone Group ${i + 1}` } })),
  ...Array.from({ length: 20 }, (_, i) => ({ id: `c_g${i}`, fields: { name: `Granite Works ${i + 1}` } })),
  { id: "c_j1", fields: { name: "Juniper Ledger" } },
  { id: "c_j2", fields: { name: "Juniper Funnel" } },
];
const seat = (id: string, companyId: string, fields: Record<string, string>, extra: Record<string, unknown> = {}) => ({
  id,
  companyId,
  fields: { type: "Fractional", status: "Active", end: "Ongoing", ...fields },
  verified: false,
  ...extra,
});
const found = (id: string, companyId: string, fn: string, role: string, operator: string | null, start = "2024-09") =>
  seat(id, companyId, { source: "Seat scan", function: fn, role, start, ...(operator ? { operator } : {}) }, operator ? { holderFrom: "public profile" } : {});
const engagements = [
  found("e_pt_pella", "c_alpha", "Marketing", "Fractional CMO", P.pella, "2025-02"),
  found("e_pt_fin1", "c_alpha", "Finance", "Fractional CFO", null),
  found("e_pt_fin2", "c_alpha", "Finance", "Fractional VP Finance", null),
  found("e_pt_selma", "c_alpha", "Sales", "Fractional VP Sales", P.selma, ""),
  found("e_pt_quinn", "c_alpha", "Product Marketing", "Fractional PMM Lead", P.quinn),
  seat("e_pt_sam", "c_alpha", { source: "Published engagement", function: "RevOps", role: "Fractional RevOps Lead", operator: P.sam, start: "2024-03" }),
  seat("e_pt_mara", "c_alpha", { source: "Published engagement", function: "Marketing", role: "Fractional Head of Marketing", operator: P.mara, start: "2022-01" }),
  seat("e_pt_fula", "c_alpha", { source: "Member success story", function: "Marketing", role: "Head of Marketing", operator: P.fula, type: "Full-time", start: "2021-06" }),
  ...LARKS.map((n, k) => found(`e_pt_lark${k}`, "c_bravo", "Customer Success", "Fractional Head of CS", n)),
  found("e_pt_rory", "c_bravo", "Partnerships", "Fractional VP Partnerships", P.rory),
  found("e_pt_zed", "c_bravo", "Growth", "Fractional Head of Growth", P.zed),
  found("e_pt_pella2", "c_bravo", "Enablement", "Fractional VP Enablement", P.pella),
  seat("e_pt_nora", "c_bravo", { source: "Published engagement", function: "Marketing", role: "Fractional CMO", operator: P.nora, start: "2023-05", status: "Ended", end: "2024-01" }),
  found("e_pt_far", "c_far", "Marketing", "Fractional CMO", P.farrah),
  // The order: Marketing before Sales and RevOps after it at 20 companies, Finance before it at 19 (with
  // full-time Marketing seats that would make Marketing 25 if they counted), Growth before a year-only
  // Sales start at 20 (a year alone is its December), and open roles that would make Partnerships 20.
  ...Array.from({ length: 20 }, (_, i) => [
    found(`e_o${i}m`, `c_o${i}`, "Marketing", "Fractional CMO", null, "2023-01"),
    found(`e_o${i}s`, `c_o${i}`, "Sales", "Fractional VP Sales", null, "2024-06"),
    // A member's story, not a third found seat (three found seats and nothing else reads as a fractional firm, lib/firms.ts).
    seat(`e_o${i}r`, `c_o${i}`, { source: "Member success story", function: "RevOps", role: "Fractional RevOps Lead", start: "2025-01" }),
    seat(`e_o${i}p`, `c_o${i}`, { source: "Demand scan", function: "Partnerships", role: "Fractional VP Partnerships", status: "Open role", start: "2020-01", end: "" }),
  ]).flat(),
  ...Array.from({ length: 19 }, (_, i) => [
    found(`e_f${i}f`, `c_f${i}`, "Finance", "Fractional CFO", null, "2022-03"),
    found(`e_f${i}s`, `c_f${i}`, "Sales", "Fractional VP Sales", null, "2023-03"),
    ...(i < 5 ? [seat(`e_f${i}x`, `c_f${i}`, { source: "Member success story", function: "Marketing", role: "VP Marketing", type: "Full-time", start: "2021-01" })] : []),
  ]).flat(),
  ...Array.from({ length: 20 }, (_, i) => [
    found(`e_g${i}s`, `c_g${i}`, "Sales", "Fractional VP Sales", null, "2024"),
    found(`e_g${i}g`, `c_g${i}`, "Growth", "Fractional Head of Growth", null, "2024-11"),
  ]).flat(),
  // Leadership seats only: a seat whose title reads below Lead is no hire before or after anyone. Counted, this
  // Finance Manager before a VP Sales would give Finance its 20th company, and this Sales Manager after a CMO
  // would give Marketing a 21st and the page two more companies.
  found("e_j1f", "c_j1", "Finance", "Fractional Finance Manager", null, "2022-03"),
  found("e_j1s", "c_j1", "Sales", "Fractional VP Sales", null, "2023-03"),
  found("e_j2m", "c_j2", "Marketing", "Fractional CMO", null, "2023-01"),
  found("e_j2s", "c_j2", "Sales", "Fractional Sales Manager", null, "2024-06"),
];
const seed = { builtAt: new Date(Date.now() - 3 * 24 * 3600 * 1000).toISOString(), members: seedMembers, companies, engagements, contacts: [] };
writeFileSync(seedPath, JSON.stringify(seed));
const HOLDER_NAMES = [...Object.values(P), ...LARKS];
const leaks = (text: string, names: string[] = HOLDER_NAMES) => names.filter((n) => text.includes(n));

/** The state every server starts from: who has signed in, and members' answers to "Which fractional usually gets hired before you?" (contract 3). */
function startState(dataDir: string) {
  mkdirSync(dataDir, { recursive: true });
  const at = new Date().toISOString();
  const seen: Record<string, string> = { sm_sam: at, sm_mara: at, sm_hide: at };
  const profiles: Record<string, Record<string, unknown>> = { sm_hide: { onboarded: true, partnersOff: true } };
  FIRSTS.forEach((_, i) => {
    seen[`sm_as${i}`] = at;
    // 20 Sales members answered: 15 name Marketing and RevOps, 4 Finance, 1 "Not sure".
    profiles[`sm_as${i}`] = { onboarded: true, function: "Sales", before: i < 15 ? ["Marketing", "RevOps"] : i < 19 ? ["Finance"] : [] };
  });
  FIRSTS.slice(0, 19).forEach((_, i) => {
    seen[`sm_am${i}`] = at;
    profiles[`sm_am${i}`] = { onboarded: true, function: "Marketing", before: ["Sales"] };
  });
  writeFileSync(path.join(dataDir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks: {}, verifications: {}, seen, profiles }));
}

/* ---------- 2. in process ---------- */

console.log("\nIn process");
const procDir = path.join(dir, "proc");
startState(procDir);
Object.assign(process.env, { RN_DATA_DIR: procDir, RN_INTEL_SEED: seedPath, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ID_SECRET: "partners-test", RN_PUBLIC_URL: "https://merlin.example.com", RN_SCAN_TEST: "1" });
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_UNVERIFIED_NAMES_UNTIL"]) delete process.env[k];
const T = await import("../lib/table.ts");
const MCP = await import("../lib/mcp/tools.ts");
const MV = await import("../lib/mcp/view.ts");
const M = await import("../app/post/model.ts");
const PM = await import("../app/post/partnersModel.ts");
const vera = seedMembers[0];
const pub = T.tableInternals.pubId;
await T.perform(vera.token, { type: "profile", function: "Sales", title: "Fractional VP Sales", icp });
const ctx = { member: vera, origin: "https://merlin.example.com" };
type Path = { name?: string; seat_id?: string; next_step?: string; invite_link?: string; suggested_note?: string; suggested_message?: string; how?: string; linkedin_search?: string };
const paths = async () => {
  MV.forgetView(vera.id);
  return ((await MCP.getCompany(ctx, { company: "Alpha Partner Co" })) as { warm_paths: Path[] }).warm_paths;
};
let wp = await paths();
const pellaPath = (l: Path[]) => l.find((w) => w.seat_id === pub("e_pt_pella"));
check("connector: before the unlock, no next step and no link", !!pellaPath(wp) && !pellaPath(wp)!.next_step && !pellaPath(wp)!.invite_link && !leaks(JSON.stringify(wp)).length, pellaPath(wp));
await T.perform(vera.token, { type: "unlock", entity: "engagement", id: pub("e_pt_pella"), field: "operator" });
wp = await paths();
const pp = pellaPath(wp);
const veraCode = T.inviteCode(vera.id);
check(
  "connector: after the unlock, Invite to connect with the seat's claim link and the member's invite code",
  pp?.next_step === "Invite to connect" && pp.invite_link === `https://merlin.example.com/claim/${claimTok("e_pt_pella")}?ref=${veraCode}`,
  pp,
);
check("connector: with the note the app writes, and what happens when they claim it", !!pp?.suggested_note?.startsWith("Hi Pella, I saw you held the fractional CMO seat at Alpha Partner Co.") && pp.suggested_note.includes(pp.invite_link!) && /conversation opens between you/.test(pp.how ?? ""), pp);
check("connector: no Revenue Nomad intro inbox anywhere", !/intro/i.test(JSON.stringify(wp)) && !/ask_revenue_nomad/.test(JSON.stringify(await MCP.getCompany(ctx, { company: "Alpha Partner Co" }))));
await T.perform(vera.token, { type: "unlock", entity: "engagement", id: pub("e_pt_sam"), field: "operator" });
wp = await paths();
const sp = wp.find((w) => w.seat_id === pub("e_pt_sam"));
check("connector: a seat holder who is on Merlin reads Message, with the opener", sp?.next_step === "Message Sam" && !sp.invite_link && !!sp.suggested_message?.startsWith("Hi Sam, I saw you held the fractional RevOps Lead seat"), sp);
const g1 = (await MCP.getCompany(ctx, { company: "Alpha Partner Co" })) as { seats: { id: string; reach_them?: Path }[] };
check("connector: the seat says the same", g1.seats.find((x) => x.id === pub("e_pt_pella"))?.reach_them?.next_step === "Invite to connect");

console.log("\nPartners at your kind of clients (the member's own view)");
// A fresh member, so nothing is unlocked yet.
const fresh = await T.joinMember("Wren Freshview", "wren-pt@example.com", null, "10.90.0.1");
await T.perform(fresh.token, { type: "profile", function: "Sales", icp });
let v = await T.buildView(fresh.token);
let pg = PM.partnerGroups(M.deriveAll(v.companies), v.me!);
const fnsOf = (groups: { fn: string }[]) => groups.map((x) => x.fn).sort();
check("only other functions, at companies that fit the profile", JSON.stringify(fnsOf(pg.groups)) === JSON.stringify(["Customer Success", "Enablement", "Finance", "Growth", "Marketing", "Partnerships", "Product Marketing", "RevOps"]), fnsOf(pg.groups));
check("two companies fit (the one in Germany doesn't)", pg.fits === 2, pg.fits);
check("no seat holder's name before an unlock (the cells are locks)", !leaks(JSON.stringify(pg.groups.map((x) => x.seats.map((s) => s.e)))).length, leaks(JSON.stringify(pg.groups.map((x) => x.seats.map((s) => s.e)))));
const fin = pg.groups.find((x) => x.fn === "Finance");
check("seats with nobody named are a count", fin?.seats.length === 0 && fin.unnamed === 2, fin && { seats: fin.seats.length, unnamed: fin.unnamed });
check("a full-time seat is not a partner", !pg.groups.some((x) => x.seats.some((s) => s.e.id === pub("e_pt_fula"))));
for (const id of ["e_pt_pella", "e_pt_nora", "e_pt_mara"]) await T.perform(fresh.token, { type: "unlock", entity: "engagement", id: pub(id), field: "operator" });
v = await T.buildView(fresh.token);
pg = PM.partnerGroups(M.deriveAll(v.companies), v.me!);
const mk = pg.groups.find((x) => x.fn === "Marketing")!;
const shownName = (s: { e: { cells: Record<string, { s: string; v?: string }> } }) => s.e.cells.operator?.v;
check("after the unlock the names are there: a member on Merlin first, then the most recent start", JSON.stringify(mk.seats.map(shownName)) === JSON.stringify([P.mara, P.pella, P.nora]), mk.seats.map(shownName));
const pellaSeat = mk.seats.find((s) => shownName(s) === P.pella)!.e;
check("a name nobody verified can be invited (and Verified)", !!pellaSeat.invite?.path.startsWith(`/claim/${claimTok("e_pt_pella")}?ref=`) && pellaSeat.cells.operator.s === "value" && !!(pellaSeat.cells.operator as { unverified?: boolean }).unverified);
const noraSeat = mk.seats.find((s) => shownName(s) === P.nora)!.e;
check("a member who never signed in can be invited too", !!noraSeat.invite && !(noraSeat.cells.operator as { member?: unknown }).member);
const maraSeat = mk.seats.find((s) => shownName(s) === P.mara)!.e;
check("a member on Merlin is messaged, not invited", !maraSeat.invite && !!(maraSeat.cells.operator as { member?: unknown }).member && PM.holderIsMember(maraSeat));
check("no profile, no partners list", PM.partnerGroups(M.deriveAll(v.companies), { icp: null, function: "Sales" }).groups.length === 0);

console.log("\nWho gets hired before and after you");
const pv = (await T.partnersView(vera.token))!;
const line = (fn: string, when: string) => pv.order.find((x) => x.fn === fn && x.when === when)?.companies;
check("a line backed by 20 companies shows: Marketing before Sales", line("Marketing", "before") === 20, pv.order);
check("and RevOps after Sales", line("RevOps", "after") === 20, pv.order);
check("19 companies is not enough: no Finance line", line("Finance", "before") === undefined, pv.order);
check("a year-only start counts as its December: Growth before a 2024 Sales start", line("Growth", "before") === 20, pv.order);
check("full-time seats and open roles are not hires", line("Marketing", "before") === 20 && line("Partnerships", "before") === undefined, pv.order);
check("it counts the companies behind it", pv.companies === 59 && pv.min === 20, { companies: pv.companies, min: pv.min });
check(
  "leadership seats only: a Finance Manager before the VP Sales doesn't make Finance's 20th company, and a Sales Manager is no Sales seat to count from",
  line("Finance", "before") === undefined && line("Marketing", "before") === 20 && pv.companies === 59,
  { order: pv.order, companies: pv.companies },
);
check("members' answers as counts once 20 of the function answered (Not sure counts as an answer)", pv.answers?.n === 20 && JSON.stringify(pv.answers.fns) === JSON.stringify([{ fn: "Marketing", n: 15 }, { fn: "RevOps", n: 15 }, { fn: "Finance", n: 4 }]), pv.answers);
const mara = seedMembers[3];
await T.perform(mara.token, { type: "profile", function: "Marketing" });
const pvM = (await T.partnersView(mara.token))!;
check("19 members of a function is not enough: no answers", pvM.answers === null, pvM.answers);
check("the answers never name anyone", !/Answerwell|Marketeer/.test(JSON.stringify(pv.answers)));

/* ---------- 3. over HTTP ---------- */

console.log("\nOver HTTP");
const PORT = Number(process.env.PARTNERS_PORT ?? 4598);
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess | null = null;
let log = "";
async function startServer(dataDir: string): Promise<boolean> {
  startState(dataDir);
  const env: NodeJS.ProcessEnv = {
    ...process.env, RN_DATA_DIR: dataDir, RN_INTEL_SEED: seedPath, RN_INTEL_SEED_KEY: TEST_KEY, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qa@example.com",
    RN_CRON_SECRET: "qa-cron", RN_SCAN_TEST: "1", RN_ID_SECRET: "partners-test",
  };
  for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_INTEL_SEED_B64", "RN_SCAN", "RN_DIGEST", "RN_PUBLIC_URL", "RN_UNVERIFIED_NAMES_UNTIL"]) delete env[k];
  log = "";
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (b) => (log += b));
  server.stderr?.on("data", (b) => (log += b));
  for (let i = 0; i < 150; i++) {
    if ((await fetch(`${BASE}/api/health`).then((r) => r.status, () => 0)) > 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
async function stopServer() {
  server?.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  server = null;
}
type Res = { status: number; json: any; text: string; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
let ipN = 0;
async function call(method: string, p: string, o: { token?: string | null; ip?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const h: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.token) h.cookie = `rn_table=${o.token}`;
  h["x-forwarded-for"] = o.ip ?? `10.81.${Math.floor(++ipN / 200)}.${ipN % 200}`;
  if (o.body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + p, { method, headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers };
}
const cookieOf = (r: Res) => (r.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
class Who {
  constructor(readonly token: string, readonly ip: string) {}
  view = async () => (await call("GET", "/api/table", { token: this.token, ip: this.ip })).json;
  act = (action: unknown) => call("POST", "/api/table", { token: this.token, ip: this.ip, body: { action } });
  partners = async () => (await call("GET", "/api/table?partners=1", { token: this.token, ip: this.ip })).json;
  messages = async () => (await call("GET", "/api/table?messages=1", { token: this.token, ip: this.ip })).json;
  names = (body: Record<string, unknown>) => call("POST", "/api/table/names", { token: this.token, ip: this.ip, body });
  credits = async () => (await this.view()).me.credits as number;
}
let joinN = 0;
async function join(name: string, email: string, headers: Record<string, string> = {}) {
  const ip = `10.82.${Math.floor(++joinN / 200)}.${joinN % 200}`;
  const r = await call("POST", "/api/table", { ip, headers, body: { join: { name, email } } });
  const token = cookieOf(r);
  if (!token) throw new Error(`join failed: ${r.status} ${r.text.slice(0, 200)}`);
  return new Who(token, ip);
}
/** Join through a seat's claim link with an invite code (the claim page's "Claim it, join free"). */
async function joinByLink(t: string, name: string, email: string, ref: string | null) {
  const ip = `10.83.${Math.floor(++joinN / 200)}.${joinN % 200}`;
  const r = await call("POST", "/api/table/names", { ip, body: { op: "join", t, name, email, ...(ref ? { ref } : {}) } });
  const token = cookieOf(r);
  return { r, who: token ? new Who(token, ip) : null };
}
type Seat = { id: string; invite?: { path: string; at?: string }; cells: Record<string, { s: string; v?: string; member?: unknown }> };
type Co = { id: string; name: string; engagements: Seat[] };
const seatOf = (v: { companies: Co[] }, internal: string) => {
  for (const c of v.companies) for (const e of c.engagements) if (e.id === pubIds.get(internal)) return e;
  return undefined;
};
/** Public ids of the fixture's seats: the HTTP server signs them with the same RN_ID_SECRET as in process. */
const pubIds = new Map(engagements.map((e) => [e.id, pub(e.id)]));
const unlock = (w: Who, internal: string) => w.act({ type: "unlock", entity: "engagement", id: pubIds.get(internal), field: "operator" });
const invite = (w: Who, internal: string, text?: string) => w.act({ type: "invite", engagementId: pubIds.get(internal), ...(text ? { note: text } : {}) });

const up = await startServer(path.join(dir, "http"));
check("server starts", up, log.slice(-400));
if (up) {
  const adm = await join("Admin Qa", "admin-qa@example.com", { "x-cron-secret": "qa-cron" });
  const ivy = await join("Ivy Inviter", "ivy-pt@example.com");
  await ivy.act({ type: "profile", function: "Sales", title: "Fractional VP Sales", icp });
  const ivyCode = (await ivy.view()).me.inviteCode as string;

  /* the invite record */
  let r = await invite(ivy, "e_pt_pella", "Hi Pella");
  check("no invite before the unlock", r.status === 400 && /Unlock who held this seat first/.test(r.json?.error ?? ""), r.json);
  check("and no link in the view", !seatOf(await ivy.view(), "e_pt_pella")?.invite);
  await unlock(ivy, "e_pt_pella");
  let ps = seatOf(await ivy.view(), "e_pt_pella")!;
  const pellaTok = claimTok("e_pt_pella");
  check("after the unlock the seat offers Invite to connect, with its claim link and the member's invite code", ps.invite?.path === `/claim/${pellaTok}?ref=${encodeURIComponent(ivyCode)}` && !ps.invite.at, ps.invite);
  const NOTE = W.inviteNote({ first: "Pella", role: "Fractional CMO", fn: "Marketing", company: "Alpha Partner Co", myTitle: "Fractional VP Sales", myFn: "Sales", icp, link: `${BASE}${ps.invite!.path}` }) + "\n\nP.S. Plumtree marmalade.";
  r = await invite(ivy, "e_pt_pella", NOTE);
  ps = seatOf(await ivy.view(), "e_pt_pella")!;
  const at1 = ps.invite?.at;
  check("sending it records the invite (Invited <date>)", r.status === 200 && !!at1, r.json);
  await new Promise((x) => setTimeout(x, 20));
  await invite(ivy, "e_pt_pella", NOTE);
  check("sending it again keeps the first date", seatOf(await ivy.view(), "e_pt_pella")?.invite?.at === at1);
  r = await invite(ivy, "e_pt_sam");
  await unlock(ivy, "e_pt_sam");
  r = await invite(ivy, "e_pt_sam");
  const samSeat = seatOf(await ivy.view(), "e_pt_sam")!;
  check("a seat holder on Merlin is messaged, not invited", r.status === 400 && /is on Merlin already/.test(r.json?.error ?? "") && !samSeat.invite && !!samSeat.cells.operator.member, r.json);

  /* the claim page and the claim through the link */
  let page = await call("GET", `/api/table/names?t=${pellaTok}&ref=${encodeURIComponent(ivyCode)}`);
  check("the token verifies and the page names who sent it", page.json?.status === "open" && page.json?.inviter === "Ivy", page.json);
  page = await call("GET", `/claim/${pellaTok}?ref=${encodeURIComponent(ivyCode)}`);
  // (React's server render puts <!-- --> between the pieces of a sentence.)
  check("the claim page says who sent the link, and no name", /Ivy sent you this link/.test(page.text.replace(/<!-- -->/g, "")) && !leaks(page.text).length, leaks(page.text));
  const ivy0 = await ivy.credits();
  const pj = await joinByLink(pellaTok, P.pella, "pella-pt@example.com", ivyCode);
  const pella = pj.who!;
  check("joining through the link claims the seat (the names match)", pj.r.status === 200 && pj.r.json?.claimed === true && !!pella, pj.r.json);
  check("it says the conversation is open and both get the bonus", /conversation is open in Messages/.test(pj.r.json?.message ?? "") && /You and Ivy each get 10 credits/.test(pj.r.json?.message ?? ""), pj.r.json?.message);
  check("the claim counts as the invitee's first fact: 25 + 10", (await pella.credits()) === 35);
  check("the inviter gets 10 too", (await ivy.credits()) === ivy0 + 10);
  check("the invite code was carried: the inviter has one invite", (await ivy.view()).me.invited === 1);
  const pm = await pella.messages();
  const pconv = pm.conversations?.[0];
  check("a conversation opened between them about the seat, from the inviter", pm.conversations?.length === 1 && pconv.kind === "invite" && pconv.started === false && pconv.with.first === "Ivy" && pconv.messages.length === 1 && pconv.messages[0].mine === false, pconv);
  check("its first message says who invited them, then the note without the claim link", /^Ivy invited you to connect as referral partners\.\n\nHi Pella/.test(pconv?.messages[0].text ?? "") && pconv.messages[0].text.includes("Plumtree marmalade") && !pconv.messages[0].text.includes("/claim/"), pconv?.messages[0].text);
  const im = await ivy.messages();
  check("the inviter is told: the conversation is unread for them too", im.unread === 1 && im.conversations?.[0]?.kind === "invite" && im.conversations[0].started === true && im.conversations[0].unread === 1, { unread: im.unread, c: im.conversations?.[0] });
  const ps2 = seatOf(await ivy.view(), "e_pt_pella")!;
  check("the seat is a member's now: Message, no more invite", !ps2.invite && !!ps2.cells.operator.member && ps2.cells.operator.v === P.pella, ps2.cells.operator);
  r = await call("POST", "/api/table", { token: ivy.token, ip: ivy.ip, body: { action: { type: "message.read", conversationId: im.conversations[0].id } } });
  check("opening it clears it", (await ivy.messages()).unread === 0);
  r = await pella.names({ op: "claim", t: pellaTok, ref: ivyCode });
  check("the link again: the seat is theirs already, and no second conversation", r.status === 200 && /yours already/.test(r.json?.message ?? "") && (await pella.messages()).conversations.length === 1, r.json);
  check("and no second bonus", (await pella.credits()) === 35 && (await ivy.credits()) === ivy0 + 10);

  /* once per invitee: a second inviter */
  const jo = await join("Jo Joiner", "jo-pt@example.com");
  await unlock(jo, "e_pt_pella2");
  await invite(jo, "e_pt_pella2", "Hi Pella, Jo here.");
  const jo0 = await jo.credits();
  r = await pella.names({ op: "claim", t: claimTok("e_pt_pella2"), ref: (await jo.view()).me.inviteCode });
  check("a second invite connects them too", r.status === 200 && /Jo invited you/.test(r.json?.message ?? "") && (await pella.messages()).conversations.length === 2, r.json);
  check("but the bonus is once per invitee", !/credits/.test(r.json?.message ?? "") && (await pella.credits()) === 35 && (await jo.credits()) === jo0, r.json?.message);

  /* an already-claimed seat */
  const mo = await joinByLink(pellaTok, "Mo Latecomer", "mo-pt@example.com", ivyCode);
  check("a claimed seat can't be claimed again through the link: no bonus, no conversation", mo.r.status === 200 && mo.r.json?.claimed === false && !!mo.who && (await mo.who!.credits()) === 25 && (await mo.who!.messages()).conversations.length === 0, mo.r.json);

  /* a self-invite */
  const quinn = await join(P.quinn, "quinn-pt@example.com");
  await unlock(quinn, "e_pt_quinn");
  await invite(quinn, "e_pt_quinn", "Hi Quinn");
  const quinnCode = (await quinn.view()).me.inviteCode;
  r = await quinn.names({ op: "claim", t: claimTok("e_pt_quinn"), ref: quinnCode });
  check("a self-invite claims the seat but connects nobody and pays nothing", r.status === 200 && /It's yours/.test(r.json?.message ?? "") && !/conversation|credits/.test(r.json?.message ?? "") && (await quinn.credits()) === 24 && (await quinn.messages()).conversations.length === 0, r.json);

  /* REFERRAL_LIMIT: 6 invitees, the inviter is paid for 5 */
  const kit = await join("Kit Kinvite", "kit-pt@example.com");
  for (let k = 0; k < LARKS.length; k++) {
    await unlock(kit, `e_pt_lark${k}`);
    await invite(kit, `e_pt_lark${k}`, `Hi ${LARKS[k].split(" ")[0]}`);
  }
  const kitCode = (await kit.view()).me.inviteCode;
  const larks: Who[] = [];
  for (let k = 0; k < LARKS.length; k++) {
    const j = await joinByLink(claimTok(`e_pt_lark${k}`), LARKS[k], `lark${k}-pt@example.com`, kitCode);
    if (j.who) larks.push(j.who);
  }
  check("six invitees claimed their seats through the links", larks.length === 6);
  check("each invitee gets the bonus", (await Promise.all(larks.map((w) => w.credits()))).every((c) => c === 35));
  const kv = (await kit.view()).me;
  check("the inviter is paid for 5 invitees in 30 days (REFERRAL_LIMIT), within the daily cap (the rest held)", kv.invitesPaid === 5 && kv.credits === 25 - 6 + 25 && kv.held === 25, { paid: kv.invitesPaid, credits: kv.credits, held: kv.held });
  check("and a conversation opened with each of them", (await kit.messages()).conversations.length === 6 && (await kit.messages()).unread === 6);

  /* a claim that waits for an admin, then approved */
  await unlock(ivy, "e_pt_rory");
  await invite(ivy, "e_pt_rory", "Hi Rory");
  const ivy1 = await ivy.credits();
  const rb = await joinByLink(claimTok("e_pt_rory"), "Roberta Waitley", "roberta-pt@example.com", ivyCode);
  check("a claim under another name waits for an admin: no bonus, no conversation yet", rb.r.json?.waiting === true && (await rb.who!.credits()) === 25 && (await rb.who!.messages()).conversations.length === 0, rb.r.json);
  const claims = (await adm.view()).admin?.names?.claims ?? [];
  const rc = claims.find((c: { company: string }) => c.company === "Bravo Partner Labs");
  r = await adm.act({ type: "names", op: "approve", engagementId: rc?.engagementId, memberId: rc?.memberId });
  check("an admin approves it: the invite connects them now", r.status === 200 && /came through Ivy's invite/.test(r.json?.message ?? "") && (await rb.who!.messages()).conversations.length === 1, r.json);
  check("and the bonus goes to both", (await rb.who!.credits()) === 35 && (await ivy.credits()) === ivy1 + 10);

  /* a name taken off after the invite */
  await unlock(ivy, "e_pt_zed");
  await invite(ivy, "e_pt_zed", "Hi Zed");
  const bob = await join("Bob Reporter", "bob-pt@example.com");
  await unlock(bob, "e_pt_zed");
  const ivy2 = await ivy.credits();
  r = await bob.act({ type: "report", entity: "engagement", id: pubIds.get("e_pt_zed"), field: "operator" });
  const zj = await joinByLink(claimTok("e_pt_zed"), P.zed, "zed-pt@example.com", ivyCode);
  check("the name came off after the invite: the claim goes through, but the invite no longer stands", zj.r.json?.claimed === true && !/conversation/.test(zj.r.json?.message ?? "") && (await zj.who!.messages()).conversations.length === 0, zj.r.json);
  check("so no bonus at the claim (the inviter only got the name's credit back)", (await zj.who!.credits()) === 25 && (await ivy.credits()) === ivy2 + 1, { zed: await zj.who!.credits(), ivy: await ivy.credits(), was: ivy2 });

  /* a member who never signed in */
  await unlock(ivy, "e_pt_nora");
  const ns = seatOf(await ivy.view(), "e_pt_nora")!;
  check("a member who never signed in can be invited", !!ns.invite?.path.startsWith(`/claim/${claimTok("e_pt_nora")}`), ns.invite);
  await invite(ivy, "e_pt_nora", "Hi Nora, come say hello.");
  page = await call("GET", `/api/table/names?t=${claimTok("e_pt_nora")}&ref=${encodeURIComponent(ivyCode)}`);
  check("their claim page asks them to sign in (the seat is theirs already)", page.json?.status === "signin" && page.json?.seat?.role === "Fractional CMO" && page.json?.inviter === "Ivy", page.json);
  const html = await call("GET", `/claim/${claimTok("e_pt_nora")}?ref=${encodeURIComponent(ivyCode)}`);
  check("the page says so, with no name", /on Merlin already, under the name of the fractional who held it/.test(html.text) && !leaks(html.text).length, leaks(html.text));
  const si = await call("POST", "/api/table", { ip: "10.84.0.1", body: { signIn: "pt-tok-nora" } });
  const nora = new Who(cookieOf(si)!, "10.84.0.1");
  r = await nora.names({ op: "claim", t: claimTok("e_pt_nora"), ref: ivyCode });
  check("signed in through the link, they are connected (no bonus: they were on Merlin)", r.status === 200 && /yours already/.test(r.json?.message ?? "") && /Ivy invited you/.test(r.json?.message ?? "") && (await nora.messages()).conversations.length === 1 && (await nora.credits()) === 25, r.json);

  /* Referral partners: the page's server half */
  const pz = await ivy.partners();
  check("Referral partners answers a signed-in member", pz?.fn === "Sales" && Array.isArray(pz.members), pz && { fn: pz.fn });
  check("signed out: refused", (await call("GET", "/api/table?partners=1")).status === 401);
  check("the order and the answers, with their thresholds", pz.order.some((x: { fn: string; when: string; companies: number }) => x.fn === "Marketing" && x.when === "before" && x.companies === 20) && !pz.order.some((x: { fn: string }) => x.fn === "Finance") && pz.answers?.n === 20, { order: pz.order, answers: pz.answers });
  const names = pz.members.map((m: { first: string }) => m.first);
  check("members on Merlin are listed by default, first names only, never an email", names.includes("Sam") && names.includes("Mara") && !/@/.test(JSON.stringify(pz.members)) && !/Signedin|Memberly|Answerwell|Marketeer/.test(JSON.stringify(pz.members)), names.slice(0, 8));
  check("a member who turned it off isn't listed, nor one who never signed in, nor the viewer", !names.includes("Hollis") && !names.includes("Vera") && !names.includes("Ivy"), names);
  check("members in other functions come first", pz.members.findIndex((m: { fn: string }) => m.fn === "Sales") > pz.members.findIndex((m: { fn: string }) => m.fn === "RevOps"));

  /* Connect */
  const samRow = pz.members.find((m: { first: string }) => m.first === "Sam");
  r = await ivy.act({ type: "message.connect", memberId: samRow.id, text: "Hi Sam, partners?" });
  check("Connect starts a conversation about no seat", r.status === 200 && r.json?.conversation?.kind === "partners" && r.json.conversation.about.engagementId === "", r.json?.conversation);
  r = await ivy.act({ type: "message.connect", memberId: samRow.id, text: "Following up." });
  const ivyConvs = (await ivy.messages()).conversations.filter((c: { kind?: string }) => c.kind === "partners");
  check("Connect again writes in the same one", r.status === 200 && ivyConvs.length === 1 && ivyConvs[0].messages.length === 2, ivyConvs.length);
  const sam = new Who(cookieOf(await call("POST", "/api/table", { ip: "10.84.0.2", body: { signIn: "pt-tok-sam" } }))!, "10.84.0.2");
  const sc = (await sam.messages()).conversations.find((c: { kind?: string }) => c.kind === "partners");
  check("the member sees it, from Referral partners", !!sc && sc.started === false && sc.with.first === "Ivy" && sc.unread === 2, sc);
  const hollis = new Who(cookieOf(await call("POST", "/api/table", { ip: "10.84.0.3", body: { signIn: "pt-tok-hide" } }))!, "10.84.0.3");
  const hollisId = T.tableInternals.pubId("sm_hide");
  r = await ivy.act({ type: "message.connect", memberId: hollisId, text: "Hi" });
  check("a member who turned Referral partners off can't be connected with", r.status === 400 && /isn't listed/.test(r.json?.error ?? ""), r.json);
  r = await ivy.act({ type: "message.connect", memberId: pub((await ivy.view()).me.id), text: "Hi" });
  check("nor yourself", r.status === 400 && /That's you/.test(r.json?.error ?? ""), r.json);
  void hollis;

  /* the opt-out */
  r = await ivy.act({ type: "settings", partners: false });
  check("Your profile: Show me in Referral partners, off", r.status === 200 && (await ivy.view()).me.partners === false, r.json);
  check("then other members don't see them listed", !(await sam.partners()).members.some((m: { first: string }) => m.first === "Ivy") && (await ivy.partners()).listed === false);
  await ivy.act({ type: "settings", partners: true });
  check("and on again, they are", (await sam.partners()).members.some((m: { first: string }) => m.first === "Ivy") && (await ivy.view()).me.partners === true);

  /* the export */
  const exp = await call("GET", "/api/table?export=1", { token: adm.token, ip: adm.ip });
  const inv = (exp.json?.seatInvites ?? []) as { claimedBy?: string; note?: string }[];
  check("the admin export keeps the invites without their notes", exp.status === 200 && inv.length >= 10 && inv.every((x) => x.note === undefined) && !exp.text.includes("Plumtree marmalade"), { n: inv.length });
  check("one record per member and seat", new Set(inv.map((x: { by?: string; engagementId?: string } & Record<string, unknown>) => `${x.by} ${x.engagementId}`)).size === inv.length);
  check("no answer named a seat holder from public profiles in the log", !leaks(log, [P.rory, P.zed, ...LARKS]).length);
  await stopServer();
}

await stopServer();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} failed, ` : ""}${passed} passed`);
process.exit(failed ? 1 : 0);
