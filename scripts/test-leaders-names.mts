/**
 * Checks of the leaders Merlin names from a company's own website (lib/leaders, lib/table.ts
 * leaderPeople): the name and title of the top leader (CEO, president or founder) and of each
 * function's leader, nobody below; names only at a company with a United States HQ (an unknown
 * country is not); Remove my name honoured, and on every later read; a member's own privacy choice
 * kept; the leaders as decision makers in the same people model (name and title 1 credit, then
 * email 1 credit); a member-added person of the same name merged, not doubled; a likely email from
 * the pattern of two or more emails on file (one pattern only), never shown as verified; the
 * connector; Pilot metrics. Nothing leaves the machine: the sites come from a mock server on
 * localhost, names resolve through a table here, lib/table.ts runs in this process on a made-up
 * seed in a temporary data folder. Every name here is made up.
 *
 *   LEADERS_PORT=4954 npx tsx scripts/test-leaders-names.mts
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.LEADERS_PORT || 4954);
const dir = mkdtempSync(path.join(tmpdir(), "rn-leader-names-"));
const DAY = 86_400_000;
const NOW0 = Date.now();
const at = (days: number) => () => new Date(NOW0 + days * DAY).toISOString();
const iso = (days: number) => new Date(NOW0 + days * DAY).toISOString();

/* ---------- the made-up seed ---------- */

const seed = {
  builtAt: iso(-2),
  members: [
    { id: "m1", name: "Ada Admin", email: "ada@example.com", title: "Founder", token: "tok-ada" },
    { id: "m2", name: "Sal Seller", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal" },
    { id: "m3", name: "Mo Marketer", email: "mo@example.com", title: "Fractional CMO", token: "tok-mo" },
    // A fractional CFO who is a member and keeps herself out of the Fractionals directory.
    { id: "m4", name: "Fia Quillfeather", email: "fia@example.com", title: "Fractional CFO", token: "tok-fia" },
  ],
  companies: [
    { id: "c_us", fields: { name: "Acme Test", website: "acme-us.test", industry: "Software", hq: "Austin, TX" } },
    { id: "c_uk", fields: { name: "Brit Test", website: "brit.test", industry: "Software", hq: "London, United Kingdom" } },
    { id: "c_nohq", fields: { name: "Nowhere Test", website: "nowhere.test", industry: "Software" } },
    { id: "c_merge", fields: { name: "Merge Test", website: "merge.test", industry: "Software", hq: "Denver, CO" } },
    { id: "c_mail", fields: { name: "Mail Test", website: "mailco.test", industry: "Software", hq: "Boston, MA" } },
    { id: "c_mix", fields: { name: "Mix Test", website: "mixco.test", industry: "Software", hq: "Seattle, WA" } },
    { id: "c_one", fields: { name: "One Test", website: "oneco.test", industry: "Software", hq: "Chicago, IL" } },
    { id: "c_priv", fields: { name: "Priv Test", website: "priv.test", industry: "Software", hq: "Miami, FL" } },
    { id: "c_press", fields: { name: "Press Test", website: "pressco.test", industry: "Software", hq: "Portland, OR" } },
  ],
  engagements: [],
  contacts: [],
};
/** A person members added, with an email. */
const added = (id: string, companyId: string, name: string, email: string | null, by = "m2") => ({ id, companyId, name, email, by });
const memberPeople = [
  // Merge Test: a member added Kim before the site was read.
  added("p_merge_kim", "c_merge", "Kim Ravenhollow", null),
  // Mail Test: two emails at its domain, both first.last.
  added("p_mail_ann", "c_mail", "Ann Brightwater", "ann.brightwater@mailco.test"),
  added("p_mail_bob", "c_mail", "Bob Coldstream", "bob.coldstream@mailco.test", "m3"),
  // Mix Test: two emails at its domain on two patterns.
  added("p_mix_jo", "c_mix", "Jo Amberfield", "jo.amberfield@mixco.test"),
  added("p_mix_lu", "c_mix", "Lu Birchmont", "lbirchmont@mixco.test"),
  // One Test: one email only.
  added("p_one_ty", "c_one", "Ty Cobaltine", "ty.cobaltine@oneco.test"),
];
const values: Record<string, unknown> = {};
for (const p of memberPeople) {
  values[`${p.id}.name`] = { value: p.name, by: p.by, at: iso(-1), status: "live" };
  values[`${p.id}.relationship`] = { value: "Worked with", by: p.by, at: iso(-1), status: "live" };
  if (p.email) values[`${p.id}.email`] = { value: p.email, by: p.by, at: iso(-1), status: "live" };
}
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    contacts: memberPeople.map((p) => ({ id: p.id, engagementId: null, companyId: p.companyId, by: p.by, at: iso(-1) })),
    values,
    unlocks: Object.fromEntries(["c_us", "c_uk", "c_nohq", "c_merge", "c_mail", "c_mix", "c_one", "c_priv", "c_press"].map((c) => [`${c}.identity`, ["m2", "m3"]])),
    seen: { m2: iso(-1), m3: iso(-1), m4: iso(-1) },
    profiles: {
      m2: { function: "Sales", title: "Fractional VP Sales", onboarded: true },
      m3: { function: "Marketing", title: "Fractional CMO", onboarded: true },
      m4: { function: "Finance", title: "Fractional CFO", onboarded: true, fractionals: false },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada@example.com",
  RN_LOGO_LOOKUP: "off",
  RN_FREE_COMPANY: "off",
  RN_PUBLIC_URL: "https://post.example.com",
});
for (const k of ["RN_LEADERS", "RN_ABOUT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL", "RN_ABOUT_TEST_PORT", "RESEND_API_KEY", "RN_EMAIL_FROM", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BILLING", "STRIPE_SECRET_KEY", "RN_INTEL_SEED_KEY"]) delete process.env[k];

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);
/** A made-up surname found anywhere in a value. */
const has = (x: unknown, surname: string) => JSON.stringify(x).toLowerCase().includes(surname.toLowerCase());

/* ---------- the likely email, by itself ---------- */
console.log("\nLikely email (the pattern)");

const { likelyEmail, patternsOf, likelyWords } = await import("../lib/leaders/likely");
eq("the patterns an email follows", [patternsOf("Jane Doe", "jane.doe@x.test"), patternsOf("Jane Doe", "jdoe@x.test"), patternsOf("Jane Doe", "janed@x.test"), patternsOf("Jane Doe", "jane_doe@x.test"), patternsOf("Jane Doe", "jane@x.test"), patternsOf("Jane Doe", "sales@x.test")], [["first.last"], ["flast"], ["firstl"], ["first_last"], ["first"], []]);
const two = [
  { name: "Ann Brightwater", email: "ann.brightwater@acme.test" },
  { name: "Bob Coldstream", email: "Bob.Coldstream@acme.test" },
];
eq("two emails on one pattern: the leader's likely email, and how many it was read from", likelyEmail("Cara Q. Leadwell", "acme.test", two), { email: "cara.leadwell@acme.test", n: 2, pattern: "first.last" });
eq("flast too", likelyEmail("Cara Leadwell", "acme.test", [{ name: "Ann Brightwater", email: "abrightwater@acme.test" }, { name: "Bob Coldstream", email: "bcoldstream@acme.test" }])?.email, "cleadwell@acme.test");
eq("one email is not enough", likelyEmail("Cara Leadwell", "acme.test", two.slice(0, 1)), null);
eq("two patterns: none", likelyEmail("Cara Leadwell", "acme.test", [two[0], { name: "Bob Coldstream", email: "bcoldstream@acme.test" }]), null);
eq("an email that follows none of them breaks the pattern", likelyEmail("Cara Leadwell", "acme.test", [...two, { name: "Dee Ember", email: "deeember77@acme.test" }]), null);
eq("emails at another domain don't count", likelyEmail("Cara Leadwell", "acme.test", two.map((x) => ({ ...x, email: x.email.replace("acme.test", "gmail.test") }))), null);
eq("the words", likelyWords(3), "Likely, from the pattern of 3 emails on file");

/* ---------- names on the page ---------- */
console.log("\nNames on the page");

const { extractLeaders, topRank } = await import("../lib/leaders/extract");
const { pickFunctions, pickTop } = await import("../lib/leaders/pick");
const page = (body: string, head = "") => `<!doctype html><html><head><title>x</title>${head}</head><body>${body}</body></html>`;
eq(
  "the top leader: a CEO, a president, a founder, and never an assistant to one or a vice president",
  ["Chief Executive Officer", "CEO, CO-FOUNDER", "President & COO", "Co-Founder", "Executive Assistant to the CEO", "Senior Vice President", "President of EMEA", "Former CEO", "Chief Revenue Officer"].map(topRank),
  [0, 0, 1, 2, null, null, null, null, null],
);
const grid = page(
  `<main>${[
    ["Rhea Topwright", "Chief Executive Officer"],
    ["Sid Salesford", "Chief Revenue Officer"],
    ["Mona Markwell", "VP Marketing"],
    ["Lowe Underling", "Marketing Manager"],
    ["Pat Juniper", "Senior Account Executive"],
  ]
    .map(([n, t]) => `<div class="card"><h3>${n}</h3><p>${t}</p></div>`)
    .join("")}</main>`,
);
const cs = extractLeaders(grid, "https://x.test/leadership");
const fns = pickFunctions(cs, "t");
const top = pickTop(cs, "t");
eq("each function's leader with the name and title the page prints", Object.entries(fns).map(([fn, l]) => `${fn}: ${l.name} (${l.title})`).sort(), ["Marketing: Mona Markwell (VP Marketing)", "Sales: Sid Salesford (Chief Revenue Officer)"]);
eq("  and the CEO as the top leader", top && [top.name, top.title, top.rank], ["Rhea Topwright", "Chief Executive Officer", 0]);
check("  nobody below a function's leader is a candidate at all", !has(cs, "underling") && !has(cs, "juniper"), cs);
const titleFirst = extractLeaders(page(`<main><h2>Leadership</h2>${[["Chief Revenue Officer", "Sid Salesford"], ["VP Marketing", "Mona Markwell"]].map(([t, n]) => `<div><p>${t}</p><h3>${n}</h3></div>`).join("")}</main>`), "https://x.test/team");
eq("a grid with the title above the name pairs each title with its own name", pickFunctions(titleFirst, "t").Marketing?.name, "Mona Markwell");
const release = extractLeaders(page(`<main><p>Acme today announced it has appointed industry veteran Gale Hartwick as Chief Revenue Officer, effective immediately.</p></main>`, `<meta name="date" content="2025-02-03">`), "https://x.test/news/1", true);
eq("a press release naming an appointment gives the name and the title", release.map((c) => [c.fn, c.name, c.title]), [["Sales", "Gale Hartwick", "Chief Revenue Officer"]]);
const vague = extractLeaders(page(`<main><p>Our sales team is led by a Chief Revenue Officer.</p><p>the chief revenue officer</p><p>sales leader</p></main>`), "https://x.test/about");
check("anything that isn't a clear name-and-title card or an appointment gives nothing", vague.length === 0, vague);

/* ---------- the mock web ---------- */

const html = page;
const sites: Record<string, Record<string, string>> = {
  "acme-us.test": {
    "/": html(`<nav><a href="/leadership">Leadership</a></nav>`),
    "/leadership": grid,
  },
  "brit.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Nigel Oakhurst</h3><p>Chief Executive Officer</p></div><div><h3>Imogen Fairleigh</h3><p>Chief Revenue Officer</p></div>`) },
  "nowhere.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Una Placeless</h3><p>Chief Executive Officer</p></div><div><h3>Vic Unmapped</h3><p>VP Sales</p></div>`) },
  "merge.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Kim Ravenhollow</h3><p>Chief Financial Officer</p></div><div><h3>Ray Thornbury</h3><p>Chief Revenue Officer</p></div>`) },
  "mailco.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Cara Leadwell</h3><p>Chief Revenue Officer</p></div>`) },
  "mixco.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Dex Marlowe</h3><p>Chief Revenue Officer</p></div>`) },
  "oneco.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Eli Northgate</h3><p>Chief Revenue Officer</p></div>`) },
  "pressco.test": {
    "/": html(`<nav><a href="/news">News</a></nav>`),
    "/news": html(`<main><ul><li><a href="/news/pressco-appoints-gale-hartwick-as-cro">Pressco appoints Gale Hartwick as Chief Revenue Officer</a></li></ul></main>`),
    "/news/pressco-appoints-gale-hartwick-as-cro": html(`<main><p>Pressco today announced it has appointed Gale Hartwick as Chief Revenue Officer.</p></main>`, `<meta name="date" content="2025-02-03">`),
  },
  "priv.test": { "/": html(`<nav><a href="/team">Team</a></nav>`), "/team": html(`<div><h3>Fia Quillfeather</h3><p>Fractional CFO</p></div><div><h3>Gil Openshaw</h3><p>Chief Revenue Officer</p></div>`) },
};
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  const p = (req.url ?? "/").replace(/\?.*$/, "");
  const body = sites[host]?.[p];
  if (body === undefined) {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not here");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise<void>((ok) => server.listen(PORT, "127.0.0.1", ok));
const fo = { resolve: async () => ["127.0.0.1"], allow: { loopback: true, port: PORT }, timeoutMs: 1500 };

/* ---------- the run and what is kept ---------- */
console.log("\nThe run: what is kept");

const table = await import("../lib/table");
const { runLeaders } = await import("../lib/leaders/run");
const types = await import("../lib/leaders/types");
const stateOnDisk = () => JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
eq("the reader is at version 3, so every company read before is read again in the daily batches", types.READER_VERSION, 3);
const run1 = await runLeaders({ fetch: fo, delayMs: 0, now: at(0), scope: "all" });
const st = stateOnDisk();
eq("the run counts the named leaders it kept (Acme 3, Merge 2, Mail 1, Mix 1, One 1, Priv 1, Press 1)", run1.named, 10);
const L = st.leaders;
eq("Acme (Austin, TX): the CEO and each function's leader, named", [L.c_us.top?.name, L.c_us.top?.title, L.c_us.functions.Sales?.name, L.c_us.functions.Marketing?.name], ["Rhea Topwright", "Chief Executive Officer", "Sid Salesford", "Mona Markwell"]);
check("  nobody below a function's leader is stored", !has(st, "underling") && !has(st, "juniper"));
check("Brit Test (London): who leads Sales is kept, never a name", L.c_uk.functions.Sales && !L.c_uk.functions.Sales.name && !L.c_uk.top && !has(st, "oakhurst") && !has(st, "fairleigh"), L.c_uk);
check("Nowhere Test (no HQ on file): no name either", L.c_nohq.functions.Sales && !L.c_nohq.functions.Sales.name && !L.c_nohq.top && !has(st, "placeless") && !has(st, "unmapped"), L.c_nohq);
check("a fractional who is a member and keeps herself out of view: not named", !has(st, "quillfeather") && L.c_priv.functions.Finance?.kind === "fractional" && L.c_priv.functions.Sales?.name === "Gil Openshaw", L.c_priv);

/* ---------- decision makers on the record ---------- */
console.log("\nDecision makers on the record");

const BASE = "https://post.example.com";
const view = (tok: string) => table.buildView(tok);
type V = Awaited<ReturnType<typeof view>>;
const co = (v: V, name: string) => v.companies.find((c) => c.name === name)!;
const ppl = (v: V, name: string) => co(v, name).people;
const byPid = (v: V, name: string, pid: string) => ppl(v, name).find((p) => p.id === pid)!;
let sal = await view("tok-sal");
const acme = ppl(sal, "Acme Test");
const site = acme.filter((p) => p.source === types.LEADERS_SOURCE);
eq("Acme lists three decision makers from the company's website", site.length, 3);
check("  each a Decision maker, its name and title locked, the source page on the company's own site", site.every((p) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker" && p.cells.name.s === "locked" && p.cells.title.s === "locked" && /^http:\/\/acme-us\.test:\d+\/leadership$/.test(p.site?.url ?? "")), site);
check("  the locked cells say where they are from (the company's website), and no name goes out", site.every((p) => p.cells.name.s === "locked" && p.cells.name.from === "website") && !has(sal.companies, "topwright") && !has(sal.companies, "salesford"), site.map((p) => p.cells.name));
eq("Brit Test and Nowhere Test show no one from their websites", [ppl(sal, "Brit Test").length, ppl(sal, "Nowhere Test").length], [0, 0]);
eq("Priv Test shows Gil only", ppl(sal, "Priv Test").filter((p) => p.source === types.LEADERS_SOURCE).length, 1);
const mergeP = ppl(sal, "Merge Test");
eq("Merge Test: the member-added Kim and the site's Ray, not a second Kim", [mergeP.length, mergeP.filter((p) => p.source === types.LEADERS_SOURCE).length], [2, 1]);

// The way-in logic and the source filter read leaders as any decision maker.
const { deriveAll } = await import("../app/post/model");
const info = deriveAll(sal.companies).find((i) => i.c.name === "Acme Test")!;
check("the app's model sees them as people at the company (the way in and the tables read these)", info.people.filter(({ p }) => p.cells.relationship?.s === "value" && p.cells.relationship.v === "Decision maker").length === 3, info.people.length);

const gale = ppl(sal, "Press Test").find((p) => p.source === types.LEADERS_SOURCE)!;
check("a leader from a press release: while the name is locked, the page shown is the press page, never the release's address that spells it", /\/news$/.test(gale.site?.url ?? "") && !has(gale, "hartwick"), gale.site);

/* ---------- prices ---------- */
console.log("\nPrices");

const credits = async (tok: string) => (await view(tok)).me!.credits;
const unlock = (tok: string, id: string, field: string) => table.perform(tok, { type: "unlock", entity: "contact", id, field }, BASE);
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const sidId = site[1].id; // the CEO first, then each function in the order functions are listed: Sales, then Marketing
const c0 = await credits("tok-sal");
await unlock("tok-sal", sidId, "name");
sal = await view("tok-sal");
const sid = byPid(sal, "Acme Test", sidId);
eq("name and title are one purchase: 1 credit opens both", [c0 - (await credits("tok-sal")), sid.cells.name.s, sid.cells.title.s], [1, "value", "value"]);
eq("  the name and title as the page prints them, from the company's website", sid.cells.name.s === "value" && sid.cells.title.s === "value" && [sid.cells.name.v, sid.cells.title.v, sid.cells.name.from], ["Sid Salesford", "Chief Revenue Officer", "website"]);
check("  the other two stay locked", site.filter((p) => p.id !== sidId).every((p) => byPid(sal, "Acme Test", p.id).cells.name.s === "locked"));
check("  another member still sees it locked", byPid(await view("tok-mo"), "Acme Test", sidId).cells.name.s === "locked");

// Mo knows Sid: Add a person with the same name merges into the website's record, and the email earns.
const mo0 = await credits("tok-mo");
await table.perform("tok-mo", { type: "addPerson", companyId: co(sal, "Acme Test").id, engagementId: null, person: { name: "Sid Salesford", email: "sid@acme-us.test" } }, BASE);
let mo = await view("tok-mo");
eq("a member adding the same name merges into the website's record, no second person", ppl(mo, "Acme Test").length, 3);
eq("  and earns for the email they added", (await credits("tok-mo")) - mo0, 1);
sal = await view("tok-sal");
eq("the email is 1 credit after the name", byPid(sal, "Acme Test", sidId).cells.email.s, "locked");
const c1 = await credits("tok-sal");
await unlock("tok-sal", sidId, "email");
sal = await view("tok-sal");
eq("  1 credit, and it opens", [c1 - (await credits("tok-sal")), byPid(sal, "Acme Test", sidId).cells.email.s], [1, "value"]);

await unlock("tok-sal", gale.id, "name");
const galeSeen = byPid(await view("tok-sal"), "Press Test", gale.id);
check("  once the name is unlocked, the release itself", /\/news\/pressco-appoints-gale-hartwick-as-cro$/.test(galeSeen.site?.url ?? "") && galeSeen.cells.title.s === "value" && galeSeen.cells.title.v === "Chief Revenue Officer", galeSeen);

/* ---------- the likely email ---------- */
console.log("\nThe likely email");

const cara = ppl(sal, "Mail Test").find((p) => p.source === types.LEADERS_SOURCE)!;
const em = cara.cells.email;
check("Mail Test: two emails at its domain on one pattern give Cara a likely email, locked, from the pattern of 2", em.s === "locked" && em.from === "pattern" && em.likely === 2, em);
check("  it opens only after her name, like any email", /name and title first/i.test((await refused(() => unlock("tok-sal", cara.id, "email"))) ?? ""));
const c2 = await credits("tok-sal");
await unlock("tok-sal", cara.id, "name");
await unlock("tok-sal", cara.id, "email");
sal = await view("tok-sal");
const ce = byPid(sal, "Mail Test", cara.id).cells.email;
eq("  priced like an email: 1 for her name and title, 1 for the email", c2 - (await credits("tok-sal")), 2);
check("  the likely email, labelled likely, never verified", ce.s === "value" && ce.v === "cara.leadwell@mailco.test" && ce.from === "pattern" && ce.likely === 2, ce);
const { marksConfirmed } = await import("../app/post/display");
await unlock("tok-mo", cara.id, "name");
await unlock("tok-mo", cara.id, "email");
await table.perform("tok-sal", { type: "verify", entity: "contact", id: cara.id, field: "email" }, BASE);
await table.perform("tok-mo", { type: "verify", entity: "contact", id: cara.id, field: "email" }, BASE);
sal = await view("tok-sal");
const cv = byPid(sal, "Mail Test", cara.id).cells.email;
check("  confirmed by two members, it still never shows as verified", cv.s === "value" && cv.ver === 2 && cv.from === "pattern" && !marksConfirmed(cv), cv);
eq("no likely email with two emails on two patterns, or with one email", [ppl(sal, "Mix Test").find((p) => p.source === types.LEADERS_SOURCE)?.cells.email.s, ppl(sal, "One Test").find((p) => p.source === types.LEADERS_SOURCE)?.cells.email.s], ["empty", "empty"]);
const tools = await import("../lib/mcp/tools");
const ctxMo = { member: (await table.memberForToken("tok-mo"))!, origin: BASE };
const gMail = (await tools.getCompany(ctxMo, { company: "Mail Test" })) as { people?: { email?: string; email_is?: string; email_verified?: boolean }[] };
check(
  "the connector says a likely email is likely and not verified",
  (gMail.people ?? []).filter((p) => p.email_is === "Likely, from the pattern of 2 emails on file. Not verified." && p.email_verified === false && p.email === "cara.leadwell@mailco.test").length === 1,
  gMail.people,
);
// A member who knows the real email adds it over the likely one, and earns.
const mo1 = await credits("tok-mo");
await table.perform("tok-mo", { type: "fill", entity: "contact", id: cara.id, field: "email", value: "cara@mailco.test" }, BASE);
mo = await view("tok-mo");
const real = byPid(mo, "Mail Test", cara.id).cells.email;
check("a member's real email takes the likely one's place, a fact like any other, and earns", real.s === "value" && real.v === "cara@mailco.test" && real.mine === true && !real.from && (await credits("tok-mo")) - mo1 === 1, real);
// Report: the existing flow.
const rep = await refused(() => table.perform("tok-sal", { type: "report", entity: "contact", id: sidId, field: "email" }, BASE));
check("a member can report a fact on a website leader's record like any other", rep === null, rep);

/* ---------- the connector ---------- */
console.log("\nThe connector");

const gMo = (await tools.getCompany(ctxMo, { company: "Acme Test" })) as { people?: { name?: string; source?: string; source_page?: string }[] };
const fromSite = (gMo.people ?? []).filter((p) => p.source === types.LEADERS_SOURCE_SAY);
eq("get_company lists the website's leaders as people, from the company's website", fromSite.length, 3);
check("  names Mo hasn't unlocked stay locked, and no name leaks", fromSite.filter((p) => p.name !== "Sid Salesford").every((p) => /locked/i.test(p.name ?? "")) && !has(gMo, "topwright") && !has(gMo, "markwell"), gMo.people);
const warm = tools.warmPaths(deriveAll((await view("tok-mo")).companies).find((i) => i.c.name === "Acme Test")!);
check("  the ways in list them as decision makers, locked at 1 credit for name and title", warm.filter((w) => /decision maker/.test(String(w.who)) && (w.opens === "their name and title, 1 credit" || w.name === "Sid Salesford")).length === 3, warm);

/* ---------- Remove my name ---------- */
console.log("\nRemove my name");

await unlock("tok-sal", site[0].id, "name");
const s0 = await credits("tok-sal");
const rhea = byPid(await view("tok-sal"), "Acme Test", site[0].id);
check("before: Sal paid for the CEO's name", rhea.cells.name.s === "value" && rhea.cells.name.v === "Rhea Topwright", rhea.cells.name);
await table.nameOffByName("Rhea Q. Topwright", "Acme Test");
sal = await view("tok-sal");
const st2 = stateOnDisk();
check("her record is gone, and her name is nowhere in the state or the view", !ppl(sal, "Acme Test").some((p) => p.id === site[0].id) && !has(st2, "topwright") && !has(sal.companies, "topwright"));
eq("  whoever paid to see it got the credit back", (await credits("tok-sal")) - s0, 1);
check("  what is kept is a one-way mark, not a name", Array.isArray(st2.leadersRemoved?.c_us) && st2.leadersRemoved.c_us.length === 1 && !has(st2.leadersRemoved, "rhea"));
const run2 = await runLeaders({ fetch: fo, delayMs: 0, now: at(100), scope: "all" });
const st3 = stateOnDisk();
check("a later read of the same page never keeps her again", run2.total > 0 && !has(st3, "topwright") && st3.leaders.c_us.functions.Sales?.name === "Sid Salesford", st3.leaders.c_us);
await table.nameOffByName("Nobody Atall", "Acme Test");
check("the page answers the same whatever matched (the call returns, the rest stays)", stateOnDisk().leaders.c_us.functions.Sales?.name === "Sid Salesford");

/* ---------- Pilot metrics ---------- */
console.log("\nPilot metrics");

const admin = (await view("tok-ada")).admin?.leaders;
check("the run's progress and what is on file count named leaders", typeof admin?.run?.named === "number" && admin.onFile.named === 9, admin && { run: admin.run, onFile: admin.onFile });
check("nothing names LinkedIn or Sales Navigator as a source", !/linked\s*in|navigator/i.test(JSON.stringify([types.LEADERS_SOURCE_SAY, likelyWords(2)])));

/* ---------- the California rule (lib/california.ts): the person's own location ---------- */
console.log("\nCalifornia");

const sidBefore = ppl(await view("tok-mo"), "Acme Test").filter((p) => p.site).length;
// A leader whose own location says California (LeaderFn.california): never named, at a Texas company too.
await table.tableInternals.mutate((d: { leaders?: Record<string, { functions: Record<string, { california?: true }> }> }) => {
  const sales = d.leaders?.c_us?.functions.Sales;
  if (sales) sales.california = true;
});
const afterCa = ppl(await view("tok-mo"), "Acme Test").filter((p) => p.site);
check("a leader in California by their own location is not on the record, whatever the company's state", afterCa.length === sidBefore - 1 && !has(await view("tok-sal"), "salesford"), { before: sidBefore, after: afterCa.length });

server.close();
server.closeAllConnections?.();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? "FAILED" : "passed"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
