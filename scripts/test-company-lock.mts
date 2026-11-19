/**
 * Checks of the company lock: every company's identity (name, website, logo, LinkedIn, About) is
 * locked for a member until they unlock it for COMPANY_PRICE credits or already know it (they
 * added to it, held a seat there, or paid for anything there). No server: lib/table.ts runs in
 * process on a made-up seed in a temporary data dir, with fetch replaced, so nothing leaves the
 * machine.
 *
 *   npx tsx scripts/test-company-lock.mts      exits 1 on any failure
 *
 * Covered: locked by default for a new member, the free facts still there, no real name, domain,
 * logo, website, LinkedIn or About anywhere in the member's view (packed and unpacked), Referral
 * partners, the radar, search (the table's and the Add form's lookup) or the connector's answers;
 * Unlock company charged once at 2 credits and idempotent, the daily limit counting it as 2, the
 * wall at 1 credit and at 0; companies the member already knows (held a seat, added a fact, paid
 * under the old rules) named; admins see everything and "See it as a member" doesn't; the
 * landing page's preview still names companies; who held a seat opens after the company; Add by
 * name opens only with something added; a removed company is paid back in full.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-lock-"));
const BASE = "https://post.example.com";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/* ---------- the made-up seed ---------- */

/** Every company's identity: what must never reach a member who hasn't unlocked it. */
const CO = {
  acme: { id: "c_acmeworks", name: "Acmeworks Robotics", site: "acmeworks-robotics.example", linkedin: "linkedin.com/company/acmeworks-robotics", about: "Acmeworks builds warehouse robots for grocers." },
  blue: { id: "c_bluefin", name: "Bluefin Freightlines", site: "bluefin-freightlines.example", linkedin: "linkedin.com/company/bluefin-freightlines", about: "Bluefin moves cold freight across the Gulf." },
  cobalt: { id: "c_cobalt", name: "Cobaltharbor Analytics", site: "cobaltharbor.example", linkedin: "linkedin.com/company/cobaltharbor", about: "Cobaltharbor sells port analytics." },
  dun: { id: "c_dunmore", name: "Dunmorely Labs", site: "dunmorely.example", linkedin: "linkedin.com/company/dunmorely", about: "Dunmorely makes lab kits." },
  elm: { id: "c_elmstead", name: "Elmsteadia Bank", site: "elmsteadia.example", linkedin: "linkedin.com/company/elmsteadia", about: "Elmsteadia is a community bank." },
  fox: { id: "c_foxglove", name: "Foxglovia Health", site: "foxglovia.example", linkedin: "linkedin.com/company/foxglovia", about: "Foxglovia runs clinics." },
  gran: { id: "c_granite", name: "Granitepeak Outfitters", site: "granitepeak.example", linkedin: "linkedin.com/company/granitepeak", about: "Granitepeak sells gear." },
  holl: { id: "c_hollowell", name: "Hollowell Partners", site: "hollowell-partners.example", linkedin: "linkedin.com/company/hollowell-partners", about: "Hollowell advises family offices." },
  iris: { id: "c_irisdale", name: "Irisdale Media", site: "irisdale.example", linkedin: "linkedin.com/company/irisdale", about: "Irisdale publishes trade magazines." },
};
const coFields = (c: (typeof CO)[keyof typeof CO], extra: Record<string, string>) => ({ name: c.name, website: c.site, linkedin: c.linkedin, about: c.about, ...extra });
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, fields, verified: false });
const seed = {
  builtAt: ago(10),
  members: [
    { id: "m_nora", name: "Nora Newcomer", email: "nora@example.com", title: "Fractional CMO", token: "tok-nora-lock" },
    { id: "m_hank", name: "Hank Holdsworth", email: "hank@example.com", title: "Fractional VP Sales", token: "tok-hank-lock" },
    { id: "m_ada", name: "Ada Adderley", email: "ada@example.com", title: "Fractional COO", token: "tok-ada-lock" },
    { id: "m_olga", name: "Olga Oldbuyer", email: "olga@example.com", title: "Fractional CFO", token: "tok-olga-lock" },
    { id: "m_pete", name: "Pete Pennyless", email: "pete@example.com", title: "Fractional CRO", token: "tok-pete-lock" },
    { id: "m_zed", name: "Zed Zerocredit", email: "zed@example.com", title: "Fractional CRO", token: "tok-zed-lock" },
    { id: "m_cap", name: "Cara Capped", email: "cara@example.com", title: "Fractional CRO", token: "tok-cara-lock" },
    { id: "m_sam", name: "Sam Spammer", email: "sam@example.com", title: "Fractional CRO", token: "tok-sam-lock" },
    { id: "m_admin", name: "Avery Admin", email: "admin-lock@example.com", title: "Admin", token: "tok-admin-lock" },
  ],
  companies: [
    { id: CO.acme.id, fields: coFields(CO.acme, { hq: "Austin, TX", industry: "SaaS", revenue: "$1M–$5M", employees: "11–50" }) },
    { id: CO.blue.id, fields: coFields(CO.blue, { hq: "Houston, TX", industry: "Logistics", employees: "51–200" }) },
    { id: CO.cobalt.id, fields: coFields(CO.cobalt, { hq: "Boston, MA", industry: "SaaS" }) },
    { id: CO.dun.id, fields: coFields(CO.dun, { hq: "Denver, CO" }) },
    { id: CO.elm.id, fields: coFields(CO.elm, { hq: "Chicago, IL" }) },
    { id: CO.fox.id, fields: coFields(CO.fox, { hq: "Miami, FL" }) },
    { id: CO.gran.id, fields: coFields(CO.gran, { hq: "Portland, OR" }) },
    { id: CO.holl.id, fields: coFields(CO.holl, { hq: "New York, NY" }) },
    { id: CO.iris.id, fields: coFields(CO.iris, { hq: "Seattle, WA" }) },
  ],
  engagements: [
    // A past seat with its holder on file: who held it opens after the company.
    seat("e_acme_sales", CO.acme.id, { source: "Member success story", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Ended", start: "2024-02", end: "2024-11", operator: "Paula Pastholder" }),
    seat("e_acme_mkt", CO.acme.id, { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Active", start: "2025-06", end: "Ongoing" }),
    // An open role from our records, whose title names the company: the title is free, without the name.
    seat("e_blue_open", CO.blue.id, { source: "Demand scan", function: "Marketing", role: "Fractional CMO at Bluefin Freightlines", status: "Open role", posting: "https://bluefin-freightlines.example/jobs/cmo", rate: "$9k/mo", hours: "20" }),
    seat("e_cobalt_hank", CO.cobalt.id, { source: "Member success story", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Active", start: "2025-01", operator: "Hank Holdsworth" }),
    seat("e_dun", CO.dun.id, { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: "2025-03", end: "Ongoing" }),
    seat("e_elm", CO.elm.id, { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: "2025-04", end: "Ongoing" }),
    seat("e_fox_open", CO.fox.id, { source: "Demand scan", function: "Sales", role: "Fractional CRO", status: "Open role", posting: "https://foxglovia.example/careers/cro" }),
    seat("e_gran", CO.gran.id, { source: "Seat scan", function: "RevOps", role: "Fractional RevOps Lead", type: "Fractional", status: "Active", start: "2025-05", end: "Ongoing" }),
    seat("e_holl", CO.holl.id, { source: "Seat scan", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Active", start: "2025-07", end: "Ongoing" }),
    seat("e_iris", CO.iris.id, { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Active", start: "2025-08", end: "Ongoing" }),
  ],
  contacts: [{ id: "p_gran_ceo", companyId: CO.gran.id, fields: { name: "Gwen Granitehead", title: "CEO", relationship: "Decision maker", email: "gwen@granitepeak.example" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
/** A company a member added (Sam): it can be removed with everything Sam added, and whoever paid for it is paid back. */
const SPAM = { id: "c_spamwise", name: "Spamwise Holdings", site: "spamwise-holdings.example" };
const v = (value: string, by: string, at = ago(5)) => ({ value, by, at, status: "live" });
// Cara is in her first 24 hours with 24 of her 25 day-one unlocks used (old rows, 1 credit each), and 100 credits to spend.
const capRows = Array.from({ length: 24 }, (_, k) => ({ memberId: "m_cap", delta: -1, reason: "unlock", ref: `e_iris.x${k}`, at: ago(0.1) }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    members: [{ id: "m_cap", name: "Cara Capped", email: "cara@example.com", title: "Fractional CRO", token: "tok-cara-lock", at: ago(0.2) }],
    ledger: [
      // Olga bought under the old rules: a company (1 credit), an open role's posting at another, a person's name at a third.
      { memberId: "m_olga", delta: -1, reason: "unlock", ref: `${CO.elm.id}.identity`, at: ago(30) },
      { memberId: "m_olga", delta: -1, reason: "unlock", ref: "e_fox_open.posting", at: ago(30) },
      { memberId: "m_olga", delta: -1, reason: "unlock", ref: "p_gran_ceo.name", at: ago(30) },
      // Pete has 1 credit left, Zed none.
      { memberId: "m_pete", delta: -24, reason: "reversal", ref: "x.y", at: ago(30) },
      { memberId: "m_zed", delta: -25, reason: "reversal", ref: "x.y", at: ago(30) },
      { memberId: "m_cap", delta: 100, reason: "plan", ref: "plan", at: ago(0.1) },
      ...capRows,
    ],
    unlocks: { [`${CO.elm.id}.identity`]: ["m_olga"], "e_fox_open.posting": ["m_olga"], "p_gran_ceo.name": ["m_olga"] },
    companies: [{ id: SPAM.id, name: SPAM.name, by: "m_sam", at: ago(3) }],
    values: {
      // Ada added the industry at Dunmorely: she knows it.
      [`${CO.dun.id}.industry`]: v("Biotech", "m_ada"),
      [`${SPAM.id}.website`]: v(SPAM.site, "m_sam"),
      [`${SPAM.id}.industry`]: v("SaaS", "m_sam"),
    },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, { title: m.title, onboarded: true }])),
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-lock@example.com",
  RN_PUBLIC_URL: BASE,
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_BILLING"]) delete process.env[k];

/* ---------- the network, replaced ---------- */

globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

/** The identity of every company in `ids`, in the forms it could leak: name, domain, the website's own name, LinkedIn, About. */
const identityOf = (ids: string[]) =>
  [...Object.values(CO), { ...SPAM, linkedin: "", about: "" }]
    .filter((c) => ids.includes(c.id))
    .flatMap((c) => [c.name, c.name.split(" ")[0], c.site, c.site.split(".")[0], c.linkedin, c.about].filter((x) => x && x.length >= 5));
/** The identities found anywhere in `out` (any JSON), lowercased: none is the pass. */
const leaks = (out: unknown, ids: string[]) => {
  const text = JSON.stringify(out).toLowerCase();
  return identityOf(ids).filter((x) => text.includes(x.toLowerCase()));
};

async function main() {
  const T = await import("../lib/table");
  const F = await import("../lib/tableFields");
  const M = await import("../app/post/model");
  const W = await import("../lib/viewWire");
  const L = await import("../app/post/ledger");
  const tools = await import("../lib/mcp/tools");
  const { forgetView } = await import("../lib/mcp/view");
  const { radarView } = await import("../lib/radar");
  const { preview } = await import("../lib/preview");
  const pub = T.tableInternals.pubId;
  const ALL = [...Object.values(CO).map((c) => c.id), SPAM.id];
  const view = (token: string, asMember = false) => T.buildView(token, { asMember });
  const coOf = (vw: Awaited<ReturnType<typeof view>>, id: string) => vw.companies.find((c) => c.id === pub(id));
  const act = async (token: string, a: Parameters<typeof T.perform>[1]) => {
    try {
      return { ok: true as const, r: await T.perform(token, a, BASE) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };

  /* ---------- a new member ---------- */
  console.log("A new member");
  const v0 = await view("tok-nora-lock");
  check("every company is locked for a new member", v0.companies.length === ALL.length && v0.companies.every((c) => c.hidden && c.name === F.HIDDEN_COMPANY && c.iconDomain === null), v0.companies.map((c) => [c.name, c.hidden]));
  check("website, LinkedIn and About come back locked", v0.companies.every((c) => ["website", "linkedin", "about"].every((k) => !c.cells[k] || c.cells[k].s !== "value")));
  const a0 = coOf(v0, CO.acme.id)!;
  check(
    "the free facts are there: industry, revenue, size and the HQ's region only",
    a0.cells.industry?.s === "value" && a0.cells.industry.v === "SaaS" && a0.cells.revenue?.s === "value" && a0.cells.employees?.s === "value" && a0.cells.hq?.s === "value" && a0.cells.hq.v === "TX" && a0.region === "Texas",
    a0.cells,
  );
  check(
    "which functions hired and when are free, and so are the seat counts",
    a0.friendly.functions.includes("Sales") && a0.friendly.functions.includes("Marketing") && a0.engagements.length === 2 && a0.engagements.some((e) => e.cells.start?.s === "value" && e.cells.start.v === "2024-02"),
    a0.friendly,
  );
  const b0 = coOf(v0, CO.blue.id)!;
  const bRole = b0.engagements[0];
  check(
    "an open role's title, function and hours-free facts show, without the company's name",
    bRole.cells.role?.s === "value" && bRole.cells.role.v === "Fractional CMO" && bRole.cells.function?.s === "value" && bRole.cells.posting?.s === "locked" && b0.friendly.open === 1,
    bRole.cells,
  );
  check("the client model's teaser reads the free facts", M.deriveAll([a0])[0].teaser === "SaaS · $1M–$5M · 11–50 · TX", M.deriveAll([a0])[0].teaser);
  check("no locked company's name, domain, LinkedIn or About anywhere in the view", leaks(v0, ALL).length === 0, leaks(v0, ALL));
  const packed = W.packView(structuredClone(v0));
  check("nor in the packed view, nor unpacked", leaks(packed, ALL).length === 0 && leaks(W.unpackView(structuredClone(packed)), ALL).length === 0);
  const ids = v0.companies.filter((c) => c.hidden).map((c) => c.id);
  check("locked companies are ordered by their public id, not by name", ids.join() === [...ids].sort().join() || v0.companies.some((c) => c.friendly.score !== v0.companies[0].friendly.score));

  /* ---------- search ---------- */
  console.log("\nSearch");
  const infos0 = M.deriveAll(v0.companies);
  const found = (q: string) => M.applyFilters(M.rowsFor("companies", infos0), M.EMPTY_FILTERS, "all", q, v0.me!).rows.length;
  check("the table's search finds no locked company by its name or domain", found("acmeworks") === 0 && found("bluefin") === 0 && found("acmeworks-robotics.example") === 0, [found("acmeworks"), found("bluefin")]);
  check("it still finds them by free facts", found("saas") >= 2, found("saas"));
  check("the Add form's lookup doesn't name or point to a locked company", (await T.existingCompany(CO.acme.site, CO.acme.name, "tok-nora-lock")) === null);
  const adminLook = await T.existingCompany(CO.acme.site, CO.acme.name, "tok-admin-lock");
  check("an admin's lookup still finds it", adminLook?.name === CO.acme.name, adminLook);

  /* ---------- Referral partners, the radar, the connector ---------- */
  console.log("\nOther answers");
  const pv = await T.partnersView("tok-nora-lock");
  check("Referral partners names no locked company", !!pv && leaks(pv, ALL).length === 0, leaks(pv, ALL));
  const rv = await radarView("tok-nora-lock");
  check("the radar names no locked company", leaks(rv, ALL).length === 0, leaks(rv, ALL));
  const nora = (await T.memberForToken("tok-nora-lock"))!;
  const ctx = { member: nora, origin: BASE };
  const sc = await tools.searchCompanies(ctx, {});
  const scQ = await tools.searchCompanies(ctx, { query: "Acmeworks" });
  const or = await tools.listOpenRoles(ctx, {});
  const gc = await tools.getCompany(ctx, { company: pub(CO.blue.id) });
  check("the connector's search, open roles and records name no locked company", [sc, scQ, or, gc].every((x) => leaks(x, ALL).length === 0), [sc, or, gc].map((x) => leaks(x, ALL)));
  check("the connector describes a locked company by its free facts and an id", (sc.companies as { id: string; name: string; hidden?: boolean; industry?: string }[]).some((c) => c.hidden && c.name === F.HIDDEN_COMPANY && c.id === pub(CO.acme.id) && c.industry === "SaaS"), sc.companies);
  check("the connector's search can't find one by name", scQ.total === 0, scQ.total);
  let byName = "";
  try {
    await tools.getCompany(ctx, { company: CO.acme.name });
  } catch (e) {
    byName = (e as Error).message;
  }
  check("nor can get_company take its name", /No company with that id or name/.test(byName), byName);
  const dry = await tools.unlock(ctx, { entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("the connector's unlock asks first and says it costs 2 credits", dry.confirmed === false && dry.would_spend === 2 && leaks(dry, ALL).length === 0, dry);
  check("and spent nothing", (await view("tok-nora-lock")).me!.credits === 25);

  /* ---------- who held a seat waits for the company ---------- */
  console.log("\nUnlock company");
  const held = await act("tok-nora-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "operator" });
  check("who held a seat at a locked company waits for the company", !held.ok && held.error === T.COMPANY_FIRST, held);
  const endEarly = await act("tok-nora-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "end" });
  check("so does any other paid fact there (a 1-credit unlock would open the company)", !endEarly.ok && endEarly.error === T.COMPANY_FIRST && coOf(await view("tok-nora-lock"), CO.acme.id)!.hidden === true, endEarly);
  const un = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("Unlock company costs 2 credits and names it", un.ok && un.r.me?.credits === 23 && /^Unlocked Acmeworks Robotics for 2 credits\.$/.test(un.r.message), un.ok ? un.r.message : un);
  const v1 = await view("tok-nora-lock");
  const a1 = coOf(v1, CO.acme.id)!;
  check(
    "the member now sees its name, website, LinkedIn, logo and About, and the full HQ",
    !a1.hidden && a1.name === CO.acme.name && a1.cells.website?.s === "value" && a1.cells.linkedin?.s === "value" && a1.cells.about?.s === "value" && a1.cells.hq?.s === "value" && a1.cells.hq.v === "Austin, TX" && !!a1.unlocked,
    a1,
  );
  const rows = (await view("tok-nora-lock")).ledger.filter((l) => l.reason === "unlock");
  check("one ledger row of 2 credits, read as Unlocked a company", rows.length === 1 && rows[0].delta === -2 && L.ledgerLine(rows[0], 25).text === `Unlocked a company: ${CO.acme.name}`, rows);
  const again = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("asking again spends nothing", !again.ok && /Nothing here is locked/.test(again.error) && (await view("tok-nora-lock")).me!.credits === 23, again);
  const held2 = await act("tok-nora-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "operator" });
  check("then who held the seat is 1 credit", held2.ok && held2.r.me?.credits === 22, held2.ok ? held2.r.message : held2);
  check("the other companies stay locked", leaks(await view("tok-nora-lock"), ALL.filter((x) => x !== CO.acme.id)).length === 0);
  const ub = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(CO.blue.id), field: "identity" });
  const b1 = coOf(await view("tok-nora-lock"), CO.blue.id)!;
  check(
    "a hiring company comes with its open role's job posting and posted rate",
    ub.ok && ub.r.me?.credits === 20 && b1.engagements[0].cells.posting?.s === "value" && b1.engagements[0].cells.rate?.s === "value",
    ub.ok ? ub.r.message : ub,
  );
  const mcpAfter = await tools.searchCompanies(ctx, {});
  forgetView(nora.id);
  check("the connector names what the member unlocked, and only that", leaks(mcpAfter, [CO.acme.id]).length > 0 && leaks(await tools.searchCompanies(ctx, {}), ALL.filter((x) => x !== CO.acme.id && x !== CO.blue.id)).length === 0);

  /* ---------- the wall and the daily limit ---------- */
  console.log("\nThe wall and the limit");
  const pete = await act("tok-pete-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("with 1 credit, a company is refused and nothing is spent", (!pete.ok && /needs 2 credits and you have 1/.test(pete.error)) || (pete.ok && pete.r.message === "" && (await view("tok-pete-lock")).me!.credits === 1), pete);
  check("Pete still has 1 credit and the company stays locked", (await view("tok-pete-lock")).me!.credits === 1 && coOf(await view("tok-pete-lock"), CO.acme.id)!.hidden === true);
  const zed = await act("tok-zed-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("at 0 credits it is the wall", (!zed.ok && /out of credits/.test(zed.error)) || (zed.ok && zed.r.message === ""), zed);
  const capV = await view("tok-cara-lock");
  check("the daily limit counts in credits: 1 unlock left today", capV.me!.unlocksLeft === 1, capV.me!.unlocksLeft);
  const cap = await act("tok-cara-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("so a company (2) is past it, and nothing is spent", !cap.ok && /You can unlock 1 more today/.test(cap.error) && (await view("tok-cara-lock")).me!.credits === 101, cap);

  /* ---------- companies a member already knows ---------- */
  console.log("\nWhat a member already knows");
  const vh = await view("tok-hank-lock");
  check("a seat holder sees the company where they held a seat", !coOf(vh, CO.cobalt.id)!.hidden && coOf(vh, CO.cobalt.id)!.name === CO.cobalt.name);
  check("and nothing else", leaks(vh, ALL.filter((x) => x !== CO.cobalt.id)).length === 0);
  const va = await view("tok-ada-lock");
  check("a member who added a fact sees that company", !coOf(va, CO.dun.id)!.hidden && leaks(va, ALL.filter((x) => x !== CO.dun.id)).length === 0);
  const vo = await view("tok-olga-lock");
  check(
    "what a member bought under the old rules owns the company: a company, an open role's posting, a person",
    [CO.elm.id, CO.fox.id, CO.gran.id].every((id) => !coOf(vo, id)!.hidden) && leaks(vo, ALL.filter((x) => ![CO.elm.id, CO.fox.id, CO.gran.id].includes(x))).length === 0,
    vo.companies.map((c) => [c.name, c.hidden]),
  );
  const vs = await view("tok-sam-lock");
  check("a member sees the company they added", !coOf(vs, SPAM.id)!.hidden);

  /* ---------- admins ---------- */
  console.log("\nAdmins");
  const vAdm = await view("tok-admin-lock");
  check("an admin sees every company", vAdm.companies.every((c) => !c.hidden && c.name !== F.HIDDEN_COMPANY));
  const vAsM = await view("tok-admin-lock", true);
  check("See it as a member locks them all again", vAsM.companies.every((c) => c.hidden) && leaks(vAsM, ALL).length === 0);

  /* ---------- Add by name ---------- */
  console.log("\nAdd by name");
  const noNew = await act("tok-nora-lock", { type: "add", company: CO.holl.name });
  check("Add naming a locked company, with nothing new, names nothing and hands over no id", noNew.ok && !noNew.r.id && !noNew.r.message.includes("Hollowell") && /Nothing new was added/.test(noNew.r.message), noNew);
  check("and the company stays locked", coOf(await view("tok-nora-lock"), CO.holl.id)!.hidden === true);
  const site = await act("tok-nora-lock", { type: "add", company: "Some Name", website: CO.iris.site });
  check("a web address alone doesn't look a company up either", site.ok && !site.r.id && !JSON.stringify(site.r).toLowerCase().includes("irisdale media"), site);
  const mySeat = await act("tok-nora-lock", {
    type: "add",
    company: CO.holl.name,
    newEngagement: true,
    engagementFields: { function: "Marketing", role: "Fractional CMO", operator: "Nora Newcomer", start: "2024-01", end: "2024-12" },
    operatorMemberId: "me",
  });
  const h1 = coOf(await view("tok-nora-lock"), CO.holl.id)!;
  check("adding a seat the member held there opens it for them", mySeat.ok && !!mySeat.r.id && !h1.hidden && h1.name === CO.holl.name, mySeat.ok ? mySeat.r.message : mySeat);
  check("and it counts toward the day's adds (it earned like any fact)", mySeat.ok && (mySeat.r.me?.earned24h ?? 0) > 0, mySeat.ok ? mySeat.r.me?.earned24h : null);

  /* ---------- refunds ---------- */
  console.log("\nRefunds");
  const us = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(SPAM.id), field: "identity" });
  const before = (await view("tok-nora-lock")).me!.credits;
  const rm = await act("tok-admin-lock", { type: "adminRemoveMember", memberId: pub("m_sam") });
  const after = (await view("tok-nora-lock")).me!.credits;
  check("a company removed later is paid back in full (2 credits)", us.ok && rm.ok && after === before + 2, { us, rm: rm.ok ? rm.r.message : rm, before, after });

  /* ---------- the landing page ---------- */
  console.log("\nThe landing page");
  const p = await preview({ fn: "Marketing" });
  const named = p.rows.filter((r) => r.company && "name" in r.company && r.company.name).map((r) => (r.company as { name: string }).name);
  check("the signed-out preview still names companies, as before", named.length > 0 && named.some((n) => Object.values(CO).some((c) => c.name === n)), named);
  const signedOut = await T.buildView(null);
  check("the signed-out table sends counts only", !signedOut.companies.length || leaks(signedOut, ALL).length === 0);

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
