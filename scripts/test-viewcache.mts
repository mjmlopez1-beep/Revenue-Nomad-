/**
 * Checks of the shared table (lib/table.ts memberView): a member's table is Nobody's record of
 * every company they have nothing to do with, built once per state and kept for all members, and
 * their own companies built for them. No server: lib/table.ts runs in process on a made-up seed in
 * a temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-viewcache.mts      exits 1 on any failure
 *
 * Covered: every member's table, admins' and "See it as a member" included, is the table built
 * whole (byte for byte, as JSON, and packed as the route sends it), after each kind of thing a member does (Unlock company, a fact
 * added, a follow, a confirmation, a report, a claim, an invite, a leader report, a private rate);
 * what one member did never shows in another's table (their unlock, their name on a fact, their
 * follow, their report, their confirmation); a change to a company shows in every member's next
 * table, from the shared part built from the one before (only the companies a change reached)
 * or whole (a member joining, the clock); the shared part is built once for many members; and a
 * seat holder sees their seat as theirs.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-viewcache-"));
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();
const BASE = "https://post.example.com";

const co = (id: string, name: string, site: string, extra: Record<string, string> = {}) => ({ id, fields: { name, website: site, linkedin: `linkedin.com/company/${id}`, about: `${name} makes things.`, ...extra } });
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, fields, verified: false });
const seed = {
  builtAt: ago(10),
  members: [
    { id: "m_ann", name: "Ann Aster", email: "ann@example.com", title: "Fractional CMO", token: "tok-ann-cache" },
    { id: "m_bob", name: "Bob Birch", email: "bob@example.com", title: "Fractional VP Sales", token: "tok-bob-cache" },
    { id: "m_cal", name: "Cal Cedar", email: "cal@example.com", title: "Fractional CFO", token: "tok-cal-cache" },
    { id: "m_hal", name: "Hal Holder", email: "hal@example.com", title: "Fractional CRO", token: "tok-hal-cache" },
    { id: "m_adm", name: "Ada Admin", email: "admin-cache@example.com", title: "Admin", token: "tok-adm-cache" },
    // A seed member who never signed in, holding a seat: their first visit makes them a member on Merlin.
    { id: "m_sid", name: "Sid Sleeper", email: "sid@example.com", title: "Fractional CMO", token: "tok-sid-cache" },
  ],
  companies: [
    co("c_alpha", "Alphaquill Systems", "alphaquill.example", { hq: "Austin, TX", industry: "SaaS", employees: "11–50" }),
    co("c_bravo", "Bravoline Freight", "bravoline.example", { hq: "Houston, TX", industry: "Logistics" }),
    co("c_cobra", "Cobraside Analytics", "cobraside.example", { hq: "Boston, MA", industry: "SaaS" }),
    co("c_delta", "Deltamoor Labs", "deltamoor.example", { hq: "Denver, CO" }),
    co("c_echo", "Echovale Bank", "echovale.example", { hq: "Chicago, IL" }),
    co("c_fable", "Fablewick Health", "fablewick.example", { hq: "Miami, FL" }),
  ],
  engagements: [
    seat("e_alpha_sales", "c_alpha", { source: "Member success story", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Ended", start: "2024-02", end: "2024-11", operator: "Paula Pastholder" }),
    seat("e_bravo_open", "c_bravo", { source: "Demand scan", function: "Marketing", role: "Fractional CMO at Bravoline Freight", status: "Open role", posting: "https://bravoline.example/jobs/cmo", rate: "$9k/mo", hours: "20" }),
    seat("e_cobra_hal", "c_cobra", { source: "Member success story", function: "Sales", role: "Fractional CRO", type: "Fractional", status: "Active", start: "2025-01", operator: "Hal Holder" }),
    seat("e_delta", "c_delta", { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: "2025-03", end: "Ongoing" }),
    seat("e_echo", "c_echo", { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Active", start: "2025-04", end: "Ongoing" }),
    seat("e_fable_open", "c_fable", { source: "Demand scan", function: "Sales", role: "Fractional CRO", status: "Open role", posting: "https://fablewick.example/careers/cro" }),
    seat("e_echo_sid", "c_echo", { source: "Member success story", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Ended", start: "2023-01", end: "2023-09", operator: "Sid Sleeper" }),
  ],
  contacts: [{ id: "p_alpha_ceo", companyId: "c_alpha", fields: { name: "Gwen Gatekeeper", title: "CEO", relationship: "Decision maker", email: "gwen@alphaquill.example" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(path.join(dir, "intel.json"), JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: Object.fromEntries(seed.members.filter((m) => m.id !== "m_sid").map((m) => [m.id, ago(1)])) }));
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-cache@example.com",
  RN_PUBLIC_URL: BASE,
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_FREE_COMPANY", "RESEND_API_KEY", "RN_GOOGLE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;
const realNow = Date.now.bind(Date);
let skew = 0;
Date.now = () => realNow() + skew;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

async function main() {
  const t = await import("../lib/table");
  const W = await import("../lib/viewWire");
  const TOK = Object.fromEntries(seed.members.map((m) => [m.id.slice(2), m.token])) as Record<"ann" | "bob" | "cal" | "hal" | "adm", string>;
  const pub = t.tableInternals.pubId;
  const act = (tok: string, a: unknown) => t.perform(tok, a as Parameters<typeof t.perform>[1], BASE);
  /** The member's table from the shared part, and built whole: the same JSON, or what differs. */
  const parity = async (label: string, toks: string[] = Object.values(TOK)) => {
    const bad: string[] = [];
    for (const tok of toks) {
      for (const asMember of [false, true]) {
        const v = await t.buildView(tok, { asMember });
        const a = JSON.stringify(v);
        const b = JSON.stringify(await t.buildView(tok, { asMember, fresh: true }));
        if (a !== b) bad.push(`${tok}${asMember ? " as member" : ""}`);
        // The packed JSON from each record's kept JSON (the route's answer), twice: built, then kept.
        const want = JSON.stringify(W.packView(v));
        if (W.packedViewJson(v) !== want || W.packedViewJson(v) !== want) bad.push(`${tok}${asMember ? " as member" : ""} packed`);
      }
    }
    check(`${label}: every member's table is the one built whole`, !bad.length, bad);
  };
  const rec = async (tok: string, companyId: string) => (await t.buildView(tok)).companies.find((c) => c.id === pub(companyId))!;

  await parity("at the start");
  check("a member nobody did anything for sees every company locked", (await t.buildView(TOK.ann)).companies.every((c) => c.hidden && c.name === "Locked company"));
  const hal = await rec(TOK.hal, "c_cobra");
  check("a seat holder sees the company of their seat named, and the seat as theirs", !hal.hidden && hal.name === "Cobraside Analytics" && hal.engagements.some((e) => e.yours), hal.name);
  check("and nobody else does", (await rec(TOK.bob, "c_cobra")).hidden);

  // The shared part: built once for many members on one state.
  const b0 = t.sharedViewStats().builds;
  for (const tok of [TOK.ann, TOK.bob, TOK.cal, TOK.hal]) await t.buildView(tok);
  check("the shared part is built once for four members on the same state", t.sharedViewStats().builds - b0 <= 1, t.sharedViewStats().builds - b0);
  await Promise.all([TOK.ann, TOK.bob, TOK.cal].map((tok) => t.buildView(tok)));
  check("and not again for members asking at the same time", t.sharedViewStats().builds - b0 <= 1, t.sharedViewStats().builds - b0);

  // Ann does one of each thing a member can do at a company.
  await act(TOK.ann, { type: "unlock", entity: "company", id: pub("c_alpha"), field: "identity" });
  await parity("after Ann's Unlock company");
  const annAlpha = await rec(TOK.ann, "c_alpha");
  check("Ann sees the company she unlocked named", !annAlpha.hidden && annAlpha.name === "Alphaquill Systems" && annAlpha.unlocked === true);
  const bobView = JSON.stringify(await t.buildView(TOK.bob));
  check("Bob's table names nothing Ann unlocked", !bobView.includes("Alphaquill") && !bobView.includes("alphaquill.example") && (await rec(TOK.bob, "c_alpha")).hidden);
  check("Bob's record of it has no unlocked mark", !("unlocked" in (await rec(TOK.bob, "c_alpha"))));

  await act(TOK.ann, { type: "fill", entity: "company", id: pub("c_alpha"), field: "ownership", value: "VC-backed" });
  await parity("after Ann adds a fact");
  check("Ann's fact is hers in her table", (await rec(TOK.ann, "c_alpha")).cells.ownership?.s === "value" && ((await rec(TOK.ann, "c_alpha")).cells.ownership as { mine?: boolean }).mine === true);
  const bobOwn = (await rec(TOK.bob, "c_alpha")).cells.ownership;
  check("and a fact like any other in Bob's: not his, not hers", bobOwn?.s === "value" && !(bobOwn as { mine?: boolean }).mine, bobOwn);

  const built = () => t.sharedViewStats().builds + t.sharedViewStats().patches;
  await t.buildView(TOK.bob);
  const bob1 = t.sharedViewStats();
  await act(TOK.ann, { type: "follow", companyId: pub("c_delta"), on: true });
  await t.buildView(TOK.bob);
  check("a follow (nothing Nobody sees) builds no company of the shared part again", t.sharedViewStats().builds === bob1.builds && t.sharedViewStats().patches === bob1.patches + 1, t.sharedViewStats());
  await parity("after Ann follows a company");
  check("Ann follows it, Bob doesn't", (await rec(TOK.ann, "c_delta")).following && !(await rec(TOK.bob, "c_delta")).following);

  await act(TOK.ann, { type: "verify", entity: "company", id: pub("c_cobra"), field: "industry" });
  await parity("after Ann confirms a fact");
  const annEcho = (await rec(TOK.ann, "c_cobra")).cells.industry as { iv?: boolean; ver?: number };
  const bobEcho = (await rec(TOK.bob, "c_cobra")).cells.industry as { iv?: boolean; ver?: number };
  check("Ann's confirmation is hers, and counts for Bob", annEcho.iv === true && bobEcho.iv === false && bobEcho.ver === 1, { annEcho, bobEcho });

  await act(TOK.ann, { type: "report", entity: "company", id: pub("c_bravo"), field: "industry" });
  await parity("after Ann reports a fact");
  check("Ann's report hides the fact from her alone", (await rec(TOK.ann, "c_bravo")).cells.industry?.s === "reported" && (await rec(TOK.bob, "c_bravo")).cells.industry?.s === "value");

  await act(TOK.cal, { type: "unlock", entity: "company", id: pub("c_fable"), field: "identity" });
  const tried = async (what: string, a: unknown) => check(`Cal: ${what}`, await act(TOK.cal, a).then(() => true, (e) => (console.log(String(e)), false)));
  await tried("a private rate", { type: "benchRate", function: "Sales", pricing: "Hourly", rate: "$150" });
  await tried("a leader report", { type: "leaderReport", companyId: pub("c_fable"), fn: "Sales", role: "CRO" });
  await tried("Unlock company of a seat it found", { type: "unlock", entity: "company", id: pub("c_echo"), field: "identity" });
  await tried("a claim on that seat", { type: "claimSeat", engagementId: pub("e_echo") });
  await parity("after Cal's unlock, rate, leader report and claim");

  // A change to a company shows in every member's next table: that company built again, not the whole shared part.
  await t.buildView(TOK.bob);
  const before = t.sharedViewStats();
  await act(TOK.cal, { type: "fill", entity: "company", id: pub("c_fable"), field: "employees", value: "51–200" });
  const bobFable = (await rec(TOK.bob, "c_fable")).cells.employees;
  check("a fact Cal adds shows in Bob's next table", bobFable?.s === "value" && (bobFable as { v: string }).v === "51–200", bobFable);
  check("built from the one before, not whole", t.sharedViewStats().builds === before.builds && t.sharedViewStats().patches === before.patches + 1, t.sharedViewStats());
  await parity("after Cal adds a fact Bob can see");
  // Two members report the same fact: hidden for everyone, at once.
  // (Reporting opens once a member added a fact: Bob adds one first.)
  await act(TOK.bob, { type: "unlock", entity: "company", id: pub("c_delta"), field: "identity" });
  await act(TOK.bob, { type: "fill", entity: "company", id: pub("c_delta"), field: "ownership", value: "Bootstrapped" });
  await act(TOK.ann, { type: "report", entity: "company", id: pub("c_fable"), field: "employees" });
  await act(TOK.bob, { type: "report", entity: "company", id: pub("c_fable"), field: "employees" });
  const halFable = (await rec(TOK.hal, "c_fable")).cells.employees;
  check("a fact two members reported is hidden in a third member's next table", halFable?.s === "reported", halFable);
  await parity("after a fact is reported twice");
  // A new member joining (who is on Merlin changes): the shared part is built whole.
  const whole0 = t.sharedViewStats().builds;
  const nia = await t.joinMember("Nia Newcomer", "nia@example.com", "", "10.1.2.3");
  await t.buildView(TOK.bob);
  check("a member joining builds the shared part whole", t.sharedViewStats().builds === whole0 + 1, t.sharedViewStats());
  await parity("after a new member joins", [...Object.values(TOK), nia.token]);

  // The clock: the shared part is built whole again after SHARED_KEEP_MS, even from changes since.
  await t.buildView(TOK.bob);
  const k0 = t.sharedViewStats().builds;
  await t.buildView(TOK.bob);
  check("the shared part serves again on the same state", built() === k0 + t.sharedViewStats().patches);
  skew += t.SHARED_KEEP_MS / 2;
  await act(TOK.cal, { type: "fill", entity: "company", id: pub("c_fable"), field: "revenue", value: "$5M–$20M" });
  await t.buildView(TOK.bob);
  check("half way, a change builds from the one before", t.sharedViewStats().builds === k0, { k0, now: t.sharedViewStats() });
  skew += t.SHARED_KEEP_MS / 2 + 1000;
  await act(TOK.cal, { type: "fill", entity: "company", id: pub("c_fable"), field: "ownership", value: "Bootstrapped" });
  await t.buildView(TOK.bob);
  check("and once the whole build is SHARED_KEEP_MS old, it is built whole", t.sharedViewStats().builds === k0 + 1, t.sharedViewStats());
  await parity("later on");

  // A seed member's first visit: who is on Merlin changed, so the shared part is built whole.
  const sid0 = t.sharedViewStats().builds;
  await t.touch("tok-sid-cache", "10.9.9.9");
  await t.buildView(TOK.bob);
  check("a seed member's first visit builds the shared part whole", t.sharedViewStats().builds === sid0 + 1, t.sharedViewStats());
  await parity("after a seed member's first visit", [...Object.values(TOK), "tok-sid-cache"]);
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
