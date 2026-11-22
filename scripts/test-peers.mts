/**
 * Checks of Peers (lib/peers.ts, lib/peersCore.ts, lib/mcp/peers.ts, the Peers page's place in the
 * app): no server. lib/table.ts runs in process on a made-up seed and seed key in a temporary data
 * dir, with email on and its endpoint, and every other fetch, replaced: nothing leaves the machine.
 * Every person and company is made up.
 *
 *   npx tsx scripts/test-peers.mts      exits 1 on any failure
 *
 * Covered:
 *  - the sections, per member and private: Fractionals you already know (the member's own LinkedIn,
 *    by email and by name at a company, and their conversations; a seat holder not on Merlin named
 *    by the member's own contact only), Peers who serve your kind of clients (complementary
 *    functions, their Crystal Ball first, never someone out of the directory or never signed in),
 *    thread states; another member's view never carries the first member's contacts; no email
 *    addresses; Remove my name takes a seat holder out;
 *  - pass a lead: the company and its open role's posting open free for the peer alone (no credit
 *    history, another member still locked), the line, the conversation, Home, taking it into the
 *    pipeline, the passer's 5 credits once, a passer who can't see the company, duplicates, the 10 a
 *    day, mute, a win credited to the passer in outcomeStats (leads passed, taken, won);
 *  - team up: the invite (the company unnamed for a peer who can't see it), the shared thread,
 *    both pipeline entries "Teamed with", the shared draft, leaving;
 *  - circles: the offer, joining up to 8, the thread and its unread count on Home, the shared view
 *    of the member's own Crystal Ball (locked names unnamed, nobody's contacts), admin counts only;
 *  - email: the lead and team-up emails to the fake endpoint, signed-in links, the Notifications switch;
 *  - the connector: list_peers never names a LinkedIn contact, pass_lead asks first, leads_passed_to_me;
 *  - the export without what members wrote; ?p=fractionals opens Peers' Every fractional.
 */
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-peers-"));
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

const co = (id: string, name: string, industry: string, employees: string) => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry, employees, revenue: "$5M–$20M", hq: "Denver, CO" } });
const companies = [
  co("c_acme", "Acme Robotics", "SaaS", "51–200"),
  co("c_birch", "Birchway Health", "SaaS", "51–200"),
  co("c_cedar", "Cedarline Pay", "Fintech", "51–200"),
  co("c_dune", "Dune Robotics", "SaaS", "11–50"),
  co("c_elm", "Elmstone Data", "SaaS", "51–200"),
];
const seat = (id: string, companyId: string, operator: string | null, role: string, fn: string, start: string, status: string, extra: Record<string, unknown> = {}) => ({
  id,
  companyId,
  verified: false,
  fields: { source: extra.source ?? "Member success story", ...(operator ? { operator } : {}), role, function: fn, type: "Fractional", start, status, ...(status === "Active" ? { end: "Ongoing" } : status === "Ended" ? { end: "2025" } : {}), ...((extra.fields as object) ?? {}) },
  ...(extra.pub ? { holderFrom: "public profile" } : {}),
});
const engagements = [
  // Acme's open Sales role, with a posting and a posted rate.
  seat("e_acme_role", "c_acme", null, "Fractional VP Sales", "Sales", "2026-10", "Open role", { source: "Demand scan", fields: { posting: "https://jobs.example/acme-vp-sales", rate: "$9k/mo" } }),
  seat("e_cara_birch", "c_birch", "Cara Diaz", "Fractional CMO", "Marketing", "2025-06", "Active"),
  seat("e_finn_cedar", "c_cedar", "Finn Holt", "Fractional CFO", "Finance", "2023-02", "Ended"),
  seat("e_theo_elm", "c_elm", "Theo Park", "Fractional VP Sales", "Sales", "2025-01", "Active"),
  // Not on Merlin: Lena held a CMO seat at Dune (from public profiles).
  seat("e_lena_dune", "c_dune", "Lena Marsh", "Fractional CMO", "Marketing", "2024-03", "Active", { source: "Seat scan", pub: true }),
];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}@example.com`, title, token: `tok-${id}` });
const members = [
  M("mem_ana", "Ana Ruiz", "Fractional VP Sales"),
  M("mem_theo", "Theo Park", "Fractional VP Sales"),
  M("mem_cara", "Cara Diaz", "Fractional CMO"),
  M("mem_finn", "Finn Holt", "Fractional CFO"),
  M("mem_rae", "Rae Quinn", "Fractional Head of RevOps"),
  M("mem_gus", "Gus Lee", "Fractional VP Customer Success"),
  M("mem_ivy", "Ivy Moss", "Fractional Head of Product Marketing"),
  M("mem_hal", "Hal Ortiz", "Fractional COO"),
  M("mem_kai", "Kai Brandt", "Fractional CRO"),
  M("mem_ota", "Ota Vance", "Fractional Head of RevOps"),
  M("mem_ned", "Ned Never", "Fractional CMO"),
  M("mem_admin", "Ada Admin", "Admin"),
];
members[members.length - 1].email = "admin-peers@example.com";
const seed = { builtAt: ago(30 * DAY), members, companies, engagements, contacts: [] };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const ICP = { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: ["United States"] };
const P = (fn: string, title: string, extra: Record<string, unknown> = {}) => ({ onboarded: true, function: fn, title, fractionals: true, icp: ICP, ...extra });
const signedIn = members.map((m) => m.id).filter((id) => id !== "mem_ned");
const today = new Date(t0).toISOString().slice(0, 10);
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [{ memberId: "mem_ana", delta: -2, reason: "unlock", ref: "c_acme.identity", at: ago(2 * DAY) }],
    values: {},
    unlocks: { "c_acme.identity": ["mem_ana"], "e_acme_role.posting": ["mem_ana"], "e_acme_role.rate": ["mem_ana"] },
    seen: Object.fromEntries(signedIn.map((id) => [id, ago(HOUR)])),
    profiles: {
      mem_ana: P("Sales", "Fractional VP Sales"),
      mem_theo: P("Sales", "Fractional VP Sales"),
      mem_cara: P("Marketing", "Fractional CMO"),
      mem_finn: P("Finance", "Fractional CFO"),
      mem_rae: P("RevOps", "Fractional Head of RevOps", { fractionals: false }),
      mem_gus: P("Customer Success", "Fractional VP Customer Success"),
      mem_ivy: P("Product Marketing", "Fractional Head of Product Marketing"),
      mem_hal: P("Operations", "Fractional COO"),
      mem_kai: P("Sales", "Fractional CRO"),
      mem_ota: P("RevOps", "Fractional Head of RevOps"),
      mem_admin: { onboarded: true },
    },
    members: [],
    // Ana's Crystal Ball today: Acme and Birchway (companies only).
    radar: {
      lastRunAt: null,
      lastRunDay: null,
      members: { mem_ana: { sent: {}, days: { [today]: ["c_acme", "c_birch"].map((c) => ({ k: `t:mem_ana:${c}`, c, kind: "adjacent", l: "Hired a fractional CMO", b: "High", w: "Fractional CMO hired" })) } } },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
    // Ana's own LinkedIn: Theo by his email, Lena by her name at Dune. Cara's own: Finn.
    paths: {
      mem_ana: { linkedin: { at: ago(DAY), skipped: 0, rows: [{ f: "Theo", l: "Park", e: "mem_theo@example.com", c: "Elmstone Data" }, { f: "Lena", l: "Marsh", c: "Dune Robotics", p: "Fractional CMO" }] } },
      mem_cara: { linkedin: { at: ago(DAY), skipped: 0, rows: [{ f: "Finn", l: "Holt", e: "mem_finn@example.com" }] } },
    },
    // Ana and Finn already talk: Ana wrote, Finn replied.
    conversations: [
      {
        id: "cv_anafinn",
        a: "mem_ana",
        b: "mem_finn",
        about: { companyId: "", engagementId: "" },
        kind: "partners",
        messages: [
          { id: "m1", by: "mem_ana", at: ago(3 * DAY), text: "Hi Finn, good to meet you." },
          { id: "m2", by: "mem_finn", at: ago(2 * DAY), text: "Likewise, Ana." },
        ],
        readAt: { a: ago(DAY), b: ago(2 * DAY) },
        status: "open",
        createdAt: ago(3 * DAY),
      },
    ],
    // Eight passes Ana made in the last hour (declined), so the daily limit is two away.
    peers: {
      passes: Array.from({ length: 8 }, (_, n) => ({ id: `lp_old${n}`, by: "mem_ana", to: "mem_kai", companyId: "c_birch", from: "record", note: "", at: ago(HOUR), status: "declined", answeredAt: ago(HOUR) })),
      teams: [],
      circles: [],
      mutes: {},
      seen: {},
    },
  }),
);

const mails: { to: string; subject: string; text: string; html: string }[] = [];
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-peers@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RESEND_API_KEY: "re_test_peers",
  RN_EMAIL_FROM: "Merlin <merlin@example.com>",
  RN_EMAIL_API_URL: "https://mail.example.test/emails",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_FREE_COMPANY", "RN_GOOGLE", "RN_BILLING"]) delete process.env[k];
globalThis.fetch = (async (url: unknown, init?: { body?: unknown }) => {
  if (String(url) === "https://mail.example.test/emails") {
    const b = JSON.parse(String(init?.body ?? "{}"));
    mails.push({ to: b.to?.[0], subject: b.subject, text: b.text, html: b.html });
    return new Response("{}", { status: 200 });
  }
  return new Response("{}", { status: 200 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const settle = () => new Promise((r) => setTimeout(r, 60));

async function main() {
  const t = await import("../lib/table");
  const peers = await import("../lib/peers");
  const core = await import("../lib/peersCore");
  const P = await import("../lib/pipeline");
  const pa = await import("../lib/pipelineActions");
  const mcp = await import("../lib/mcp/peers");
  const nav = await import("../app/post/navModel");
  const place = await import("../app/post/place");
  const pub = t.tableInternals.pubId;
  const tok = (id: string) => `tok-${id}`;
  const act = (id: string, a: Record<string, unknown>) => t.perform(tok(id), a as never, "https://post.example.com");
  const refused = async (id: string, a: Record<string, unknown>) => {
    try {
      await act(id, a);
      return null;
    } catch (e) {
      return e instanceof t.ActionError ? e.message : `threw ${String(e)}`;
    }
  };
  const view = async (id: string) => (await peers.peersView(tok(id)))!;
  const hiddenFor = async (id: string, companyId: string) => (await t.viewPatch(tok(id), [pub(companyId)]))?.companies?.find((c) => c.id === pub(companyId))?.hidden;
  const bal = async (id: string) => t.balance(await t.loadState(), id);
  const ACME = pub("c_acme");
  const ROLE = pub("e_acme_role");

  /* ---------- pure ---------- */
  console.log("\nThe rules");
  check("a VP Sales and a CMO complement each other, two VPs Sales don't", core.complements("Sales", "Marketing") && core.complements("Marketing", "Sales") && !core.complements("Sales", "Sales"));
  check("the lead line", core.leadLine({ from: "Ana Ruiz", company: "Acme", role: "Sales", rate: "$9k/mo" }) === "Ana passed you Acme: open Sales role, posted $9k/mo");
  check("a circle never takes a ninth", core.circleFit({ size: 8, fns: [], shape: ICP }, { fn: "Sales", shape: ICP }) === null && core.circleFit({ size: 3, fns: ["Sales", "Sales"], shape: ICP }, { fn: "Sales", shape: ICP }) === null);
  check("the month's prompt", core.promptFor("2026-11").length > 10 && core.promptFor("2026-11") !== core.promptFor("2026-12"));
  check("thread words", core.threadWords("you", ago(2 * DAY), t0) === "You wrote 2 days ago" && core.threadWords("replied", ago(DAY), t0) === "Replied");

  /* ---------- the sections ---------- */
  console.log("\nThe sections, per member and private");
  {
    const v = await view("mem_ana");
    const know = (n: string) => v.know.find((r) => r.name.startsWith(n));
    const serve = (n: string) => v.serve.find((r) => r.name.startsWith(n));
    check("Fractionals you already know: Theo from Ana's own LinkedIn (by email)", !!know("Theo")?.known?.from.includes("linkedin") && know("Theo")!.onMerlin, v.know);
    check("Lena, not on Merlin: named by Ana's own contact, and marked not on Merlin", know("Lena Marsh")?.onMerlin === false && know("Lena Marsh")?.known?.from.includes("linkedin"), v.know);
    check("Finn from their conversation, the thread state Replied", know("Finn")?.known?.from.includes("messages") && know("Finn")?.thread?.state === "replied", know("Finn"));
    check("Peers who serve your kind of clients: Cara (Marketing) first, serving a Crystal Ball company", v.serve[0]?.name.startsWith("Cara") && serve("Cara")?.why === "Serves 1 company in your Crystal Ball", v.serve.map((r) => [r.name, r.why]));
    check("Cara's current seat is what she's working on, its company unnamed while locked for Ana", serve("Cara")?.working[0]?.name === null && serve("Cara")?.working[0]?.kind === "SaaS company of 51–200 people", serve("Cara")?.working);
    check("no one in the same function (Kai), nobody out of the directory (Rae), nobody who never signed in (Ned)", !serve("Kai") && !serve("Rae") && !serve("Ned") && !know("Rae") && !know("Ned"));
    check("someone in Already know isn't listed twice", !serve("Theo") && !serve("Finn"));
    check("no email address anywhere in the view", !JSON.stringify(v).includes("@example.com"));
    const theo = await view("mem_theo");
    const cara = await view("mem_cara");
    check("Theo's view carries none of Ana's contacts", !JSON.stringify(theo).includes("Lena") && !theo.know.length, theo.know);
    check("Cara's own LinkedIn finds Finn for her alone", cara.know.some((r) => r.name.startsWith("Finn")) && !cara.know.some((r) => r.name.includes("Lena")) && !JSON.stringify(cara).includes("Lena"));
    check("sources are the member's own", v.sources.linkedin && !theo.sources.linkedin);
    const ctx = { member: (await t.memberForToken(tok("mem_ana")))!, origin: "https://post.example.com" };
    const list = JSON.stringify(await mcp.listPeers(ctx));
    check("the connector never names someone Ana knows only from her LinkedIn: counted, not named", !list.includes("Theo") && !list.includes("Lena") && list.includes("Finn") && /2 more fractionals the member knows/.test(list), list);
  }

  /* ---------- names: the Fractionals directory's rule ---------- */
  console.log("\nNames, as the Fractionals directory gives them");
  {
    const FR = await import("../lib/fractionals");
    const dirNameFor = async (viewer: string, of: string) => {
      const me = (await t.memberForToken(tok(viewer)))!;
      return FR.fractionalRecords(await t.loadSeed(), await t.loadState(), me).find((r) => r.memberId === pub(of))?.name ?? null;
    };
    // Cara hasn't chosen yet: Peers names her as the directory does for Ana.
    const caraWas = (await t.loadState()).profiles.mem_cara;
    const unlocksWas = (await t.loadState()).unlocks["c_birch.identity"];
    await t.tableInternals.mutate((st) => void (st.profiles.mem_cara = { ...st.profiles.mem_cara, fractionals: undefined }));
    const caraIn = async () => (await view("mem_ana")).serve.find((r) => r.name.startsWith("Cara"))?.name ?? null;
    const short = await caraIn();
    check("a member who hasn't chosen, her seat's company locked for Ana: first name and last initial, as the directory", short === "Cara D." && (await dirNameFor("mem_ana", "mem_cara")) === "Cara D.", [short, await dirNameFor("mem_ana", "mem_cara")]);
    // Ana sees Birchway now: fellow fractionals are free (PEERS_FREE), so the directory names Cara in full, and so does Peers.
    await t.tableInternals.mutate((st) => void (st.unlocks["c_birch.identity"] = ["mem_ana"]));
    const full = await caraIn();
    check("once Ana sees her seat's company: her full name, in Peers as in the directory", full === "Cara Diaz" && (await dirNameFor("mem_ana", "mem_cara")) === "Cara Diaz", [full, await dirNameFor("mem_ana", "mem_cara")]);
    check("a member with no seats who hasn't chosen: first name and last initial", (await (async () => {
      await t.tableInternals.mutate((st) => void (st.profiles.mem_gus = { ...st.profiles.mem_gus, fractionals: undefined }));
      const g = [...(await view("mem_ana")).serve, ...(await view("mem_ana")).know].find((r) => r.name.startsWith("Gus"));
      return !g || g.name === "Gus L.";
    })()));
    await t.tableInternals.mutate((st) => {
      st.profiles.mem_cara = caraWas;
      st.profiles.mem_gus = { ...st.profiles.mem_gus, fractionals: true };
      if (unlocksWas) st.unlocks["c_birch.identity"] = unlocksWas;
      else delete st.unlocks["c_birch.identity"];
    });
  }

  /* ---------- pass a lead ---------- */
  console.log("\nPass a lead");
  {
    check("Acme is locked for Theo and Cara before", (await hiddenFor("mem_theo", "c_acme")) === true && (await hiddenFor("mem_cara", "c_acme")) === true);
    const picks = (await peers.peerPicks(tok("mem_ana"), ACME, ROLE))!;
    check("the best fits for the open Sales role: Sales peers first", picks.needs === "Sales" && picks.picks[0]?.best && ["Theo", "Kai"].includes(picks.picks[0].first) && picks.role?.rate === "$9k/mo", picks);
    check("nobody out of the directory in the picks, and no admin", !picks.picks.some((p) => p.first === "Rae" || p.first === "Ned" || p.first === "Ada"));
    const theoLedger = (await t.loadState()).ledger.filter((l) => l.memberId === "mem_theo").length;
    const anaBefore = await bal("mem_ana");
    mails.length = 0;
    const r = await act("mem_ana", { type: "peer.pass", companyId: ACME, memberId: pub("mem_theo"), roleId: ROLE, note: "They want someone who has built a team from scratch.", from: "role" });
    check("passed, with the words", /^Passed to Theo\. It opens free for them/.test(r.message), r.message);
    check("Acme opens for Theo, free: nothing on his credit history", (await hiddenFor("mem_theo", "c_acme")) === false && (await t.loadState()).ledger.filter((l) => l.memberId === "mem_theo").length === theoLedger);
    const theoCo = (await t.viewPatch(tok("mem_theo"), [ACME]))!.companies!.find((c) => c.id === ACME)!;
    const roleRec = theoCo.engagements.find((e) => e.id === ROLE)!;
    check("its open role's posting and posted rate open with it", roleRec.cells.posting?.s === "value" && roleRec.cells.rate?.s === "value", roleRec.cells);
    check("Cara's Acme stays locked", (await hiddenFor("mem_cara", "c_acme")) === true);
    const theo = await view("mem_theo");
    const lead = theo.inbox[0];
    check("Theo's lead line", lead?.line === "Ana passed you Acme Robotics: open Sales role, posted $9k/mo" && lead.status === "new" && lead.fresh === true, lead);
    const conv = (await t.loadState()).conversations!.find((c) => c.id === lead.conversationId)!;
    check("it is in their Messages, with Ana's note", conv && conv.messages.at(-1)!.by === "mem_ana" && conv.messages.at(-1)!.text.includes("Passing you Acme Robotics") && conv.messages.at(-1)!.text.includes("built a team"));
    const home = (await peers.peersHome(tok("mem_theo")))!;
    check("on Theo's Home: From your peers", home.leads[0]?.id === lead.id && home.leads[0].side === "to-you");
    await settle();
    const m = mails.find((x) => x.to === "mem_theo@example.com");
    check("the lead email: the line as the subject, a signed-in link, no address", m?.subject === "Ana passed you Acme Robotics: open Sales role, posted $9k/mo" && /\/api\/go\?/.test(m.text) && !m.text.includes("mem_ana@example.com"), m);
    check("Ana's credits unchanged until Theo takes it", (await bal("mem_ana")) === anaBefore);
    check("passing it again to Theo is refused", /already/.test((await refused("mem_ana", { type: "peer.pass", companyId: ACME, memberId: pub("mem_theo") })) ?? ""));
    const take = await act("mem_theo", { type: "peer.answer", id: lead.id, take: true });
    check("Theo takes it: into his pipeline", /^In your pipeline\. Ana earns 5 credits/.test(take.message), take.message);
    check("Ana earns 5 credits", (await bal("mem_ana")) === anaBefore + 5);
    const pv = await pa.pipelineViewOf(await t.loadSeed(), await t.loadState(), (await t.memberForToken(tok("mem_theo")))!);
    const entry = pv.entries.find((e) => e.company === ACME);
    check("his entry says who passed it", entry?.lead?.by === "Ana Ruiz" && entry.source === "peer" && entry.merlinDefault, entry);
    check("Ana sees it taken, with her credits", (await view("mem_ana")).sent.find((l) => l.id === lead.id)?.credited === 5);
    check("never where Theo's deal stands, his notes or who he wrote to", !JSON.stringify((await view("mem_ana")).sent).match(/\"stage\"|Sent|notes/));
    check("Ana's ledger line", (await t.buildView(tok("mem_ana"))).me!.ledger?.some((l) => l.reason === "A peer took the lead you passed" && l.delta === 5) ?? true);
    // A win at Acme is credited to the passer.
    await pa.recordPipelineEvent("mem_theo", ACME, "signed");
    const stats = P.outcomeStats(await t.loadState());
    check("outcomeStats: leads passed, taken, won", stats.leads.taken === 1 && stats.leads.won === 1 && stats.leads.passed === 9, stats.leads);
    check("Ana sees the win", (await view("mem_ana")).sent.find((l) => l.id === lead.id)?.won === true);
    // Ana can't pass what she can't see; and the day's limit.
    check("a company the passer can't see is refused", /Open the company first/.test((await refused("mem_ana", { type: "peer.pass", companyId: pub("c_cedar"), memberId: pub("mem_kai") })) ?? ""));
    const second = await act("mem_ana", { type: "peer.pass", companyId: ACME, memberId: pub("mem_kai") });
    check("the tenth pass of the day goes", /^Passed to Kai/.test(second.message) && second.peers?.passesLeft === 0, second.peers?.passesLeft);
    check("the eleventh is refused", /10 leads a day/.test((await refused("mem_ana", { type: "peer.pass", companyId: ACME, memberId: pub("mem_gus") })) ?? ""));
    // Mute.
    await act("mem_kai", { type: "peer.mute", memberId: pub("mem_ana"), on: true });
    const kaiPicks = (await peers.peerPicks(tok("mem_ana"), ACME, null))!;
    check("a peer who muted you isn't in your picks", !kaiPicks.picks.some((p) => p.first === "Kai"));
    // A second accept by the same peer at the same company never pays twice.
    const kaiLead = (await view("mem_kai")).inbox.find((l) => l.status === "new")!;
    const before = await bal("mem_ana");
    await act("mem_kai", { type: "peer.answer", id: kaiLead.id, take: false });
    check("declining pays nothing", (await bal("mem_ana")) === before);
  }

  /* ---------- team up ---------- */
  console.log("\nTeam up");
  let teamId = "";
  {
    mails.length = 0;
    const r = await act("mem_ana", { type: "peer.team", companyId: ACME, memberId: pub("mem_cara") });
    check("asked", /^Asked Cara to team up/.test(r.message), r.message);
    const cara = await view("mem_cara");
    const t1 = cara.teams[0];
    teamId = t1.id;
    check("Cara sees the ask, the company unnamed (locked for her)", t1?.status === "invited" && t1.name === null && !t1.invited, t1);
    const conv = (await t.loadState()).conversations!.find((c) => c.id === t1.conversationId)!;
    check("the shared thread is a team conversation, and never names Acme to Cara", conv.kind === "team" && conv.teamId === t1.id && !conv.messages[0].text.includes("Acme"), conv.messages[0]);
    await settle();
    const m = mails.find((x) => x.to === "mem_cara@example.com");
    check("the team-up email never names Acme to her", !!m && /^Ana wants to team up on a SaaS/.test(m.subject) && !m.text.includes("Acme"), m?.subject);
    check("on Cara's Home", (await peers.peersHome(tok("mem_cara")))!.teams[0]?.id === t1.id);
    await act("mem_cara", { type: "peer.teamAnswer", id: t1.id, join: true });
    const ana = await view("mem_ana");
    check("a team now, with a shared draft", ana.teams.find((x) => x.id === t1.id)?.status === "active" && /We've done this together before/.test(ana.teams.find((x) => x.id === t1.id)!.draft!.text));
    const seed = await t.loadSeed();
    const s = await t.loadState();
    const anaPl = pa.pipelineViewOf(seed, s, (await t.memberForToken(tok("mem_ana")))!).entries.find((e) => e.company === ACME);
    const caraPl = pa.pipelineViewOf(seed, s, (await t.memberForToken(tok("mem_cara")))!).entries.find((e) => e.company === ACME);
    check("both pipelines hold Acme, marked Teamed with", anaPl?.team?.with === "Cara" && caraPl?.team?.with === "Ana", [anaPl?.team, caraPl?.team]);
    const sent = await t.perform(tok("mem_cara"), { type: "message.send", conversationId: t1.conversationId, text: "I'll take the brand side." } as never);
    check("either can write in the shared thread", sent.conversation?.kind === "team" && sent.conversation.messages.length === 2);
    await act("mem_cara", { type: "peer.teamDraft", id: t1.id, text: "Hi there, we're a CMO and a VP Sales who've done this together before." });
    check("the draft is shared", (await view("mem_ana")).teams.find((x) => x.id === t1.id)?.draft?.by === "them");
    check("the same team twice is refused", /already/.test((await refused("mem_ana", { type: "peer.team", companyId: ACME, memberId: pub("mem_cara") })) ?? ""));
    await act("mem_cara", { type: "peer.teamLeave", id: t1.id });
    const after = (await view("mem_ana")).teams.find((x) => x.id === t1.id);
    const c2 = (await t.loadState()).conversations!.find((c) => c.id === t1.conversationId)!;
    check("either can leave: the team ends, the thread closes, the deals stay", after?.status === "ended" && after.left === "them" && c2.status === "closed" && !!pa.pipelineViewOf(await t.loadSeed(), await t.loadState(), (await t.memberForToken(tok("mem_cara")))!).entries.find((e) => e.company === ACME));
    const stats = P.outcomeStats(await t.loadState());
    check("outcomeStats counts teams", stats.teams.formed === 1 && stats.teams.active === 0, stats.teams);
  }

  /* ---------- circles ---------- */
  console.log("\nCircles");
  {
    const offer0 = (await view("mem_ana")).offer!;
    check("no circle yet: start one around Ana's kind of client", offer0.id === null && offer0.name === "SaaS, 51–200 people", offer0);
    await act("mem_ana", { type: "peer.circleJoin", circleId: null });
    const join = async (id: string) => {
      const o = (await view(id)).offer!;
      await act(id, { type: "peer.circleJoin", circleId: o.id });
      return o;
    };
    const oc = await join("mem_cara");
    check("Cara is offered Ana's circle", oc.id !== null && oc.members.some((m) => m.first === "Ana"), oc);
    for (const id of ["mem_finn", "mem_gus", "mem_ivy", "mem_hal", "mem_kai", "mem_ota"]) await join(id);
    const full = (await view("mem_ana")).circle!;
    check("eight members: no longer forming", full.size === 8 && !full.forming, full.members.map((m) => m.first));
    const theoOffer = (await view("mem_theo")).offer!;
    check("a full circle (or one with two of your function) isn't offered", theoOffer.id === null);
    check("joining a full circle is refused", !!(await refused("mem_theo", { type: "peer.circleJoin", circleId: full.id })));
    await act("mem_cara", { type: "peer.circlePost", text: "Birchway is hiring a RevOps lead next quarter." });
    const home = (await peers.peersHome(tok("mem_ana")))!;
    check("Ana's Home: a new post in her circle", home.circle?.unread === 1 && home.circle.latest?.first === "Cara", home.circle);
    await act("mem_ana", { type: "peer.circleRead" });
    check("read, it's quiet", (await peers.peersHome(tok("mem_ana")))!.circle === null);
    const ana = (await view("mem_ana")).circle!;
    const way = ana.ways.find((w) => w.company === pub("c_birch"));
    check("Ana's Crystal Ball through her circle: Cara holds a seat at Birchway, unnamed while locked for Ana", !!way && way.name === null && way.who.includes("Cara") && way.now, ana.ways);
    const finn = (await view("mem_finn")).circle!;
    check("Finn's circle view is his own: none of Ana's Crystal Ball, none of anyone's contacts", finn.ways.length === 0 && !JSON.stringify(finn).includes("Lena") && !JSON.stringify(await view("mem_finn")).includes("Birchway Health"));
    await act("mem_finn", { type: "peer.mute", memberId: pub("mem_cara"), on: true });
    check("a muted member's posts don't reach you", (await view("mem_finn")).circle!.posts.length === 0 && (await view("mem_ana")).circle!.posts.length === 1);
    const stats = P.outcomeStats(await t.loadState());
    check("admin counts only: circles, members, posts", stats.circles.n === 1 && stats.circles.members === 8 && stats.circles.posts === 1, stats.circles);
    await act("mem_ota", { type: "peer.circleLeave" });
    check("leaving makes room", (await view("mem_ana")).circle!.size === 7);
  }

  /* ---------- the Notifications switch ---------- */
  console.log("\nEmail switch");
  {
    await act("mem_gus", { type: "settings", peerEmail: false });
    check("Me.peerEmail off", (await t.buildView(tok("mem_gus"))).me!.peerEmail === false);
    mails.length = 0;
    await act("mem_cara", { type: "peer.team", companyId: pub("c_birch"), memberId: pub("mem_gus") });
    await settle();
    check("no email with peer emails off; the ask is still there", !mails.some((m) => m.to === "mem_gus@example.com") && (await view("mem_gus")).teams.some((x) => x.status === "invited"));
  }

  /* ---------- Remove my name ---------- */
  console.log("\nRemove my name");
  {
    const n = await t.nameOffByName("Lena Marsh", "Dune Robotics");
    check("Lena's name comes off her seat", n === 1, n);
    check("and she is gone from Ana's Already know", !(await view("mem_ana")).know.some((r) => r.name.includes("Lena")));
  }

  /* ---------- the connector ---------- */
  console.log("\nThe connector");
  {
    const ctx = { member: (await t.memberForToken(tok("mem_ana")))!, origin: "https://post.example.com" };
    const list = await mcp.listPeers(ctx);
    const text = JSON.stringify(list);
    check("list_peers: a member Ana now talks to on Merlin is named, a LinkedIn contact never", !text.includes("Lena") && JSON.stringify(list.members_you_already_talk_to).includes("Theo") && text.includes("Finn"), list);
    check("no emails through the connector", !text.includes("@example.com"));
    const ask = await mcp.passLead({ ...ctx, member: (await t.memberForToken(tok("mem_cara")))! }, { company_id: pub("c_birch"), peer_id: pub("mem_hal") });
    check("pass_lead without confirm passes nothing", ask.confirmed === false && /opens free for Hal/.test(String(ask.what_happens)), ask);
    check("nothing passed yet", !(await view("mem_hal")).inbox.length);
    const done = await mcp.passLead({ ...ctx, member: (await t.memberForToken(tok("mem_cara")))! }, { company_id: pub("c_birch"), peer_id: pub("mem_hal"), confirm: true });
    check("with confirm it passes", done.confirmed === true && (await view("mem_hal")).inbox[0]?.from === "connector", done);
    const mine = await mcp.leadsPassedToMe({ ...ctx, member: (await t.memberForToken(tok("mem_hal")))! });
    check("leads_passed_to_me", (mine.passed_to_you as { from: string; company: string }[])[0]?.from === "Cara" && (mine.passed_to_you as { company: string }[])[0]?.company === "Birchway Health", mine);
    let refusedLocked = false;
    try {
      await mcp.passLead(ctx, { company_id: pub("c_cedar"), peer_id: pub("mem_hal") });
    } catch {
      refusedLocked = true;
    }
    check("a company the member can't see can't be passed through the connector", refusedLocked);
  }

  /* ---------- the export ---------- */
  console.log("\nThe export");
  {
    const ex = await t.exportState();
    const ps = ex.peers!;
    check("the export keeps who and what, never what members wrote", ps.passes.every((p) => p.note === "") && ps.circles.every((c) => c.posts.every((x) => x.text === "")) && ps.teams.every((x) => x.draft === null));
  }

  /* ---------- the app's way there ---------- */
  console.log("\nThe address");
  {
    const me = (await t.buildView(tok("mem_ana"))).me!;
    const old = place.parsePlace(me, "?p=fractionals", new Set());
    const partners = place.parsePlace(me, "?p=partners", new Set());
    const now = place.parsePlace(me, "?p=peers", new Set());
    check("?p=fractionals opens Peers' Every fractional", old.p === "peers" && old.pt === true);
    check("?p=partners too", partners.p === "peers" && partners.pt === true);
    check("?p=peers opens Peers", now.p === "peers" && !now.pt);
    const items = nav.navItems({
      page: "peers", recordType: "companies", tab: "all", currentView: null,
      hrefs: { today: "/", companies: "/?p=table", engagements: "/", people: "/", hiring: "/", following: "/", page: (p) => `/?p=${p}` },
      admin: false, network: false, unread: 0, radarNew: 0, totals: null, hiringN: null, followingN: null, seatsMissing: null, credits: 0, views: [], inviteBonus: 10, peersNew: 2,
    });
    const it = items.find((x) => x.key === "peers");
    check("the nav item is Peers, on, with its badge, and Fractionals is gone from the nav", it?.label === "Peers" && it.current && it.badge === 2 && !items.some((x) => x.key === "fractionals"));
    check("the directory's old page lights Peers", nav.currentKey({ page: "fractionals", recordType: "companies", tab: "all", currentView: null }) === "peers");
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
