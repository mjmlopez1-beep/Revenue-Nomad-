/**
 * Checks of the QA fixes, on made-up seeds in temporary data dirs (nothing real, nothing leaves the
 * machine):
 *
 *   npm run build && npx tsx scripts/test-qafix.mts      exits 1 on any failure
 *   QAFIX_PORT=7201 npx tsx scripts/test-qafix.mts        the browser checks' server port (default 7201)
 *
 * In process (lib/ on a made-up seed, fetch replaced):
 *   - names that are a greeting or a page's words (lib/nameWords.ts): "Welcome Read" and "Meet Our
 *     Team" refused by the importers' cleaner (lib/personName.ts cleanPersonName), the leaders reader
 *     (lib/leaders/extract.ts keptName) and a member adding a person (a clear message); "Ashley Read"
 *     and "Larry Page" kept; a page word after a whole name cut off; on view, a seed seat or person
 *     with such a name reads as nobody named, a member's own name always kept; scripts/clean-bad-names.mjs
 *     on a copy: counts only, never a name, the member's own seat untouched, a second run changes nothing;
 *   - company names for an admin's review (lib/scan/clean.ts companyNameFlag): a bare domain, digits
 *     only, 1 or 2 characters, in the admin's firmReview and still in the table;
 *   - Admin Health's outcomes (lib/pipeline.ts outcomeStats): a deal that went Sent, Proposal, Won
 *     reached Sent, Proposal and Won, never Replied or Meeting, and the shares count only both stages;
 *   - no logo is a 204 with no body (lib/logo.ts), never a 404 the browser logs;
 *   - unlocking what is already unlocked (another device): the server's words read as a calm notice
 *     (app/ui/shared.tsx alreadyOpen, calmRefusal), not a red error;
 *   - Home with nothing new this week but companies in Crystal Ball (lib/today.ts radar.total):
 *     "Your Crystal Ball has 1 company. Open one to start.";
 *   - ?sig= clamped to a day that happened (lib/radar/types.ts sigDayOf, app/post/place.ts).
 *
 * In a browser (Playwright, Chromium as a Pixel 7; skipped with a note when Playwright isn't there),
 * against `next start` on QAFIX_PORT:
 *   - Back with a sheet open closes the sheet and stays on the page (More, Your profile), and what
 *     was typed is there when the sheet opens again; closing by its own X takes its entry off once
 *     (the page doesn't move, Back is not popped twice);
 *   - a long search doesn't push the page sideways; no logo request logs an error;
 *   - a used sign-in link (?k=) on a signed-in browser shows a small notice; ?sig=2099-12-31 opens today.
 */
import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { copyFileSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const agoDay = (n: number) => iso(-n * DAY).slice(0, 10);

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

/* ---------- the made-up seed, in process ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "rn-qafix-"));
const co = (id: string, name: string, hq = "Austin, TX") => ({ id, fields: { name, website: `${id.slice(2).replace(/_/g, "")}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq } });
const seat = (id: string, companyId: string, operator?: string, extra: Record<string, unknown> = {}) => ({
  id,
  companyId,
  verified: false,
  ...extra,
  fields: { source: "Seat scan", ...(operator ? { operator } : {}), role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2024-02", status: "Active", end: "Ongoing" },
});
const seed = {
  builtAt: iso(-60 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Quinlan", email: "sal.qafix@example.com", title: "Fractional VP Sales", token: "tok-sal-qafix" },
    // A member whose own name starts with a page word that is also a word people are named (Dear): their seat keeps it.
    { id: "mem_dear", name: "Dear Halvorsen", email: "dear.qafix@example.com", title: "Fractional CMO", token: "tok-dear-qafix" },
    { id: "mem_uma", name: "Uma Older", email: "uma.qafix@example.com", title: "Fractional VP Sales", token: "tok-uma-qafix" },
    { id: "mem_rae", name: "Rae Today", email: "rae.qafix@example.com", title: "Fractional VP Sales", token: "tok-rae-qafix" },
    { id: "mem_ada", name: "Ada Admin", email: "admin-qafix@example.com", title: "Admin", token: "tok-ada-qafix" },
  ],
  companies: [
    co("c_welcome", "Harborline Labs"),
    co("c_real", "Readwell Systems"),
    co("c_member", "Halvorsen Partners Co"),
    co("c_lock", "Lockwood Freight"),
    co("c_older", "Kestrel Ridge Software"),
    co("c_today", "Alderwick Systems"),
    { id: "c_dom", fields: { name: "zentrix.io", website: "zentrix.io", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Denver, CO" } },
    { id: "c_digits", fields: { name: "1440", website: "fourteenforty.example", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Denver, CO" } },
    { id: "c_short", fields: { name: "GE", website: "ge-like.example", industry: "Manufacturing", employees: "201–500", revenue: "$20M–$50M", hq: "Boston, MA" } },
  ],
  engagements: [
    seat("e_welcome", "c_welcome", "Welcome Read", { holderFrom: "public profile" }),
    seat("e_real", "c_real", "Ashley Read", { holderFrom: "public profile" }),
    seat("e_member", "c_member", "Dear Halvorsen", { holderFrom: "public profile" }),
    seat("e_lock", "c_lock"),
    seat("e_older", "c_older"),
    seat("e_today", "c_today"),
    seat("e_dom", "c_dom"),
    seat("e_digits", "c_digits"),
    seat("e_short", "c_short"),
  ],
  contacts: [
    { id: "p_bad", companyId: "c_real", fields: { name: "Meet Our Team", title: "CEO", relationship: "Decision maker" } },
    { id: "p_ok", companyId: "c_real", fields: { name: "Jordan Read", title: "COO", relationship: "Decision maker" } },
  ],
};
const seedFile = path.join(dir, "intel-seed.json");
writeFileSync(seedFile, JSON.stringify(seed));
const sales = { function: "Sales", onboarded: true, icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] } };
let kn = 0;
const row = (c: string) => ({ k: `test:${c}:${++kn}`, c, kind: "adjacent", l: "Just hired a fractional Marketing leader · Marketing usually comes before Sales", b: "Medium", w: "Fractional CMO hired 2 months ago · Sales usually follows in 4–9 months" });
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, iso(-HOUR)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, sales])),
    radar: {
      lastRunAt: iso(-DAY),
      lastRunDay: agoDay(1),
      members: {
        // Uma: Crystal Ball has one company, 12 days back (onboarding's list shows it), nothing in the last week.
        mem_uma: { sent: {}, days: { [agoDay(12)]: [row("c_older")] } },
        // Rae: a company today.
        mem_rae: { sent: {}, days: { [agoDay(0)]: [row("c_today")] } },
      },
      stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: seedFile,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-qafix@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
  // The old look's sheets and top bar are what the browser checks drive: since Stage 9 the new look is the default, so the rollback is asked for by name.
  RN_UI2: "off",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_INTEL_SEED_KEY", "RN_GOOGLE"]) delete process.env[k];
/** The real fetch, for the browser checks' own server; lib/ in process gets one that answers "ok" and goes nowhere. */
const realFetch = globalThis.fetch;
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

async function inProcess() {
  const W = await import("../lib/nameWords");
  const PN = await import("../lib/personName");
  const LX = await import("../lib/leaders/extract");
  const TF = await import("../lib/tableFields");
  const CL = await import("../lib/scan/clean");
  const P = await import("../lib/pipeline");
  const H = await import("../lib/health");
  const Lg = await import("../lib/logo");
  const S = await import("../app/ui/shared");
  const RT = await import("../lib/radar/types");
  const TM = await import("../app/post/todayModel");
  const t = await import("../lib/table");
  const { todayView } = await import("../lib/today");

  console.log("names that are a greeting or a page's words");
  const skip = (n: string) => {
    const r = PN.cleanPersonName(n);
    return "skip" in r ? r.skip : null;
  };
  const kept = (n: string) => {
    const r = PN.cleanPersonName(n);
    return "name" in r ? r.name : null;
  };
  check("the importers' cleaner refuses Welcome Read, Meet Our Team, Hello There, Learn More, Contact Sales", ["Welcome Read", "Meet Our Team", "Hello There", "Learn More", "Contact Sales"].every((n) => skip(n) !== null), ["Welcome Read", "Meet Our Team", "Hello There", "Learn More", "Contact Sales"].map(skip));
  check("and says why: a greeting or page words", skip("Welcome Read") === "a greeting or page words", skip("Welcome Read"));
  check("a surname that is also a page word is a person: Ashley Read, Larry Page, Joseph Story, Thomas More", ["Ashley Read", "Larry Page", "Joseph Story", "Thomas More"].every((n) => kept(n) === n), ["Ashley Read", "Larry Page", "Joseph Story", "Thomas More"].map(kept));
  check("a page word after a whole name is cut off: Jane Doe Growth Leader is Jane Doe", kept("Jane Doe Growth Leader") === "Jane Doe", kept("Jane Doe Growth Leader"));
  check("the word lists: welcome anywhere, read only first", W.neverAName("Welcome Read") && W.neverAName("Read Ashley") && !W.neverAName("Ashley Read") && W.neverNameWord("Meet Our Team") === "meet", [W.neverAName("Read Ashley"), W.neverNameWord("Meet Our Team")]);
  check("the leaders reader refuses Welcome Read and still reads Jane Doe", LX.keptName("Welcome Read") === undefined && LX.keptName("Hello Sarah") === undefined && LX.keptName("Jane Doe") === "Jane Doe", [LX.keptName("Welcome Read"), LX.keptName("Jane Doe")]);
  const personName = TF.fieldDef("contact", "name")!;
  const companyName = TF.fieldDef("company", "name")!;
  check("a member adding a person named Welcome Read is told why, in words", TF.cleanValue(personName, "Welcome Read").error === W.NEVER_NAME_REFUSED && /greeting or a page heading/.test(W.NEVER_NAME_REFUSED), TF.cleanValue(personName, "Welcome Read"));
  check("Ashley Read as a person, and a company named Welcome Labs, are fine", TF.cleanValue(personName, "Ashley Read").value === "Ashley Read" && TF.cleanValue(companyName, "Welcome Labs").value === "Welcome Labs");

  const ada = await t.buildView("tok-ada-qafix");
  const json = JSON.stringify(ada);
  const coOf = (name: string) => ada.companies.find((c) => c.name === name)!;
  const holderOf = (name: string) => coOf(name)?.engagements[0]?.cells.operator;
  const cells = ada.companies.filter((c) => /Harborline|Readwell|Halvorsen/.test(c.name)).map((c) => [c.name, c.engagements.map((e) => e.cells.operator), c.people.map((p) => p.cells.name)]);
  check("on view, the seed's Welcome Read reads as nobody named", !json.includes("Welcome Read") && holderOf("Harborline Labs")?.s === "empty", cells);
  // Fellow fractionals are free (PEERS_FREE): at a company Ada can see, who held the seat shows by name, at no charge.
  const named = (c: ReturnType<typeof holderOf>, v: string) => c?.s === "value" && (c as { v?: unknown }).v === v;
  // A member is named to others by first name and last initial until they choose the directory (lib/memberName.ts, profile item 1, 2026-11-24).
  check("Ashley Read and a member's own Dear Halvorsen are still on their seats (named, free: fellow fractionals)", named(holderOf("Readwell Systems"), "Ashley Read") && named(holderOf("Halvorsen Partners Co"), "Dear H."), cells);
  const names = coOf("Readwell Systems").people.map((p) => p.cells.name?.s).sort();
  check("a person named Meet Our Team has no name on view; Jordan Read keeps theirs", !json.includes("Meet Our Team") && names.join() === "empty,locked", cells);
  const sal = "tok-sal-qafix";
  const lock = coOf("Lockwood Freight").id;
  await t.perform(sal, { type: "unlock", entity: "company", id: lock, field: "identity" }, "https://post.example.com");
  let refusal = "";
  try {
    await t.perform(sal, { type: "addPerson", companyId: lock, person: { name: "Welcome Read", title: "CEO", relationship: "Decision maker" } }, "https://post.example.com");
  } catch (e) {
    refusal = (e as Error).message;
  }
  check("adding a person named Welcome Read is refused with the clear message", refusal.includes(W.NEVER_NAME_REFUSED), refusal);

  console.log("\ncompany names for an admin's review");
  check("companyNameFlag: a bare domain, digits only, 1 or 2 characters, and none for a plain name", CL.companyNameFlag("zentrix.io") === "a bare domain" && CL.companyNameFlag("https://www.acme-labs.com/") === "a bare domain" && CL.companyNameFlag("1440") === "digits only" && CL.companyNameFlag("GE") === "1 or 2 characters" && CL.companyNameFlag("3M") === "1 or 2 characters" && CL.companyNameFlag("Lockwood Freight") === null && CL.companyNameFlag("Booking Holdings") === null);
  const review = ada.admin?.firmReview ?? [];
  const reasonOf = (name: string) => review.find((r) => r.company === name)?.reason;
  check("each is in the admin's review list with its reason", reasonOf("zentrix.io") === "name is a bare domain" && reasonOf("1440") === "name is digits only" && reasonOf("GE") === "name is 1 or 2 characters", review);
  check("and stays in the table (flagged, never left out)", ["zentrix.io", "1440", "GE"].every((n) => !!coOf(n)), ["zentrix.io", "1440", "GE"].map((n) => !!coOf(n)));
  check("a plain name is not listed", !reasonOf("Lockwood Freight") && !reasonOf("Harborline Labs"));

  console.log("\nunlocking what is already unlocked (another device)");
  let again = "";
  try {
    await t.perform(sal, { type: "unlock", entity: "company", id: lock, field: "identity" }, "https://post.example.com");
  } catch (e) {
    again = (e as Error).message;
  }
  check("the second unlock is refused, nothing spent", !!again && (await t.buildView(sal)).me!.credits === 23, again);
  check("the page reads it as already open: a calm notice, not a red error", S.alreadyOpen(again) && S.calmRefusal(again) && S.calmRefusal(S.ALREADY_OPEN), again);
  check("its words say what happened", /already unlocked for you, maybe on another device, so no credit was spent/.test(S.ALREADY_OPEN));
  check("a real error is still an error", !S.calmRefusal("You're out of credits. Add a fact you know to earn one.") && !S.alreadyOpen("That company isn't on file any more."));
  check("a used sign-in link on a signed-in browser has its notice", S.SIGNED_IN_LINK_USED === "That sign-in link was used or expired. You're still signed in here.");

  console.log("\nAdmin Health's outcomes");
  const entry = (stage: string, dates: Record<string, string>) => ({ id: `pl_${++kn}`, companyId: `c_x${kn}`, stage, dates, via: {}, due: null, createdAt: iso(-9 * DAY), updatedAt: iso(-DAY) });
  const at = (d: number) => iso(-d * DAY);
  const o = P.outcomeStats({ pipeline: { m1: { entries: [entry("won", { sent: at(9), proposal: at(5), won: at(2) })], intros: [] } } as never }, t0);
  check("Sent, Proposal, Won: reached Sent, Proposal and Won, never Replied or Meeting", o.reached.sent === 1 && o.reached.replied === 0 && o.reached.meeting === 0 && o.reached.proposal === 1 && o.reached.won === 1, o.reached);
  check("its shares: Sent to Won 100%, Sent to Replied 0%, none through a meeting it never had", o.conversion.sentToWon === 1 && o.conversion.sentToReplied === 0 && o.conversion.repliedToMeeting === null && o.conversion.meetingToWon === null, o.conversion);
  const rows = H.outcomeRows(o);
  const n = (label: string) => rows.find((r) => r.label === label)?.n;
  check("the Outcomes card: Reached Replied 0 and Meeting 0, Proposal 1, Won 1", n("Reached Replied") === 0 && n("Reached Meeting") === 0 && n("Reached Proposal") === 1 && n("Won") === 1, rows);
  const o2 = P.outcomeStats({ pipeline: { m1: { entries: [entry("meeting", { sent: at(9), meeting: at(3) }), entry("replied", { sent: at(9), replied: at(4) }), entry("sent", { sent: at(1) })], intros: [] } } as never }, t0);
  check("the stage an entry is at counts, a stage it skipped doesn't", o2.reached.sent === 3 && o2.reached.replied === 1 && o2.reached.meeting === 1 && o2.conversion.repliedToMeeting === 0, o2);
  check("reached(): a date or the stage it is at", P.reached({ stage: "won", dates: { sent: at(1), won: at(0) } } as never, "won") && !P.reached({ stage: "won", dates: { sent: at(1), won: at(0) } } as never, "replied") && P.reached({ stage: "proposal", dates: {} } as never, "proposal"));

  console.log("\nno logo");
  const lg = await Lg.logoResponse(new Request("http://localhost/api/logo/c_madeupmadeup1", { headers: { "x-forwarded-for": "203.0.113.7" } }), "c_madeupmadeup1");
  check("an id with no logo: 204 with no body, kept for an hour", lg.status === 204 && (await lg.text()) === "" && /max-age=3600/.test(lg.headers.get("cache-control") ?? ""), { status: lg.status, cc: lg.headers.get("cache-control") });
  const known = await Lg.logoResponse(new Request("http://localhost/api/logo/x", { headers: { "x-forwarded-for": "203.0.113.7" } }), t.tableInternals.pubId("c_lock"));
  check("a company with no icon kept (lookups off): 204 too", known.status === 204, known.status);

  console.log("\nHome and Crystal Ball");
  const uma = await todayView("tok-uma-qafix", null, t0);
  check("nothing new this week: newCount 0, and Crystal Ball's own range holds 1 company (what onboarding showed)", uma?.radar.newCount === 0 && uma.radar.total === 1, uma?.radar);
  const rae = await todayView("tok-rae-qafix", null, t0);
  check("a company today: newCount 1 and no total", rae?.radar.newCount === 1 && rae.radar.total === undefined, rae?.radar);
  check("Home's words for it", TM.crystalLine(1) === "Your Crystal Ball has 1 company. Open one to start." && TM.crystalLine(3) === "Your Crystal Ball has 3 companies. Open one to start.", [TM.crystalLine(1), TM.crystalLine(3)]);
  const homeSrc = readFileSync("app/post/Home.tsx", "utf8");
  const movesSrc = readFileSync("app/post/Moves.tsx", "utf8");
  check("Home says it in its greeting and the empty moves line links Crystal Ball", /crystalN > 0\) return crystalLine\(crystalN\)/.test(homeSrc) && /crystalN=\{crystalN\}/.test(homeSrc) && /crystalN > 0 \? \(/.test(movesSrc) && /Open one to start/.test(movesSrc));

  console.log("\n?sig= days");
  const today = new Date(t0).toISOString().slice(0, 10);
  check("a day still to come reads as today", RT.sigDayOf("2099-12-31", t0) === today, RT.sigDayOf("2099-12-31", t0));
  check("a day that is no date, or before 2020, is none", RT.sigDayOf("2026-13-45", t0) === null && RT.sigDayOf("2026-02-30", t0) === null && RT.sigDayOf("1999-01-01", t0) === null && RT.sigDayOf("x", t0) === null && RT.sigDayOf(null, t0) === null);
  check("a past day stays", RT.sigDayOf(agoDay(3), t0) === agoDay(3) && RT.sigDayOf(today, t0) === today);
  const PL = await import("../app/post/place");
  const me = (await t.buildView(sal)).me!;
  check("the app's place reads ?sig=2099-12-31 as today's Crystal Ball", PL.parsePlace(me, "?sig=2099-12-31", new Set()).sig === today && PL.parsePlace(me, "?sig=2099-12-31", new Set()).p === "radar", PL.parsePlace(me, "?sig=2099-12-31", new Set()));

  console.log("\nscripts/clean-bad-names.mjs on a copy");
  const copy = path.join(dir, "seed-copy.json");
  copyFileSync(seedFile, copy);
  const run = () => spawnSync(process.execPath, ["scripts/clean-bad-names.mjs", "--seed", copy, "--no-seal"], { encoding: "utf8", env: { ...process.env } });
  const r1 = run();
  const out1 = `${r1.stdout}${r1.stderr}`;
  check("it runs", r1.status === 0, out1);
  check("counts: 3 seat holder names, 2 with a page word, 1 a member's own kept, 1 removed; 1 of 2 person names removed", /seat holder names: 3; with a greeting or page word: 2 \(1 a member's own name, kept; 1 removed\)/.test(out1) && /person names: 2; with a greeting or page word: 1 \(0 a member's own name, kept; 1 removed\)/.test(out1), out1);
  check("and the company names for review, counted", /1 a bare domain, 1 digits only, 1 1 or 2 characters/.test(out1), out1);
  check("never a name in what it prints", !/Welcome Read|Ashley|Halvorsen|Meet Our Team|Jordan|Harborline|zentrix/i.test(out1), out1);
  const after = JSON.parse(readFileSync(copy, "utf8"));
  const eng = (id: string) => after.engagements.find((e: { id: string }) => e.id === id);
  check("Welcome Read is off its seat with its public-profile mark; Ashley Read and the member's seat untouched", !eng("e_welcome").fields.operator && !eng("e_welcome").holderFrom && eng("e_real").fields.operator === "Ashley Read" && eng("e_member").fields.operator === "Dear Halvorsen" && eng("e_member").holderFrom === "public profile");
  check("Meet Our Team is off its person, Jordan Read kept, and nothing else changed", !after.contacts[0].fields.name && after.contacts[0].fields.title === "CEO" && after.contacts[1].fields.name === "Jordan Read" && after.companies.length === seed.companies.length);
  const r2 = run();
  check("a second run changes nothing", r2.status === 0 && /nothing to remove/.test(r2.stdout) && readFileSync(copy, "utf8") === JSON.stringify(after), r2.stdout);
}

/* ---------- in a browser ---------- */

function findPlaywright(): { chromium: import("playwright").BrowserType; devices: Record<string, import("playwright").BrowserContextOptions> } | null {
  const require = createRequire(import.meta.url);
  const tries = ["playwright", ...(process.env.NODE_PATH ?? "").split(path.delimiter).filter(Boolean).map((p) => path.join(p, "playwright"))];
  try {
    const g = spawnSync("npm", ["root", "-g"], { encoding: "utf8" }).stdout.trim();
    if (g) tries.push(path.join(g, "playwright"));
  } catch {}
  for (const p of tries) {
    try {
      return require(p);
    } catch {}
  }
  return null;
}

async function inBrowser() {
  const pw = findPlaywright();
  if (!pw) {
    console.log("\nSKIP the browser checks: Playwright isn't installed here (npm i -g playwright).");
    return;
  }
  const PORT = Number(process.env.QAFIX_PORT || 7201);
  const BASE = `http://127.0.0.1:${PORT}`;
  const bdir = mkdtempSync(path.join(tmpdir(), "rn-qafix-web-"));
  const A = ["Quill", "Bramble", "Larkspur", "Copperleaf", "Driftwood", "Saltmarsh", "Juniper", "Ironbark", "Tidewater", "Foxglove", "Hollowell", "Marigold"];
  const B = ["Analytics", "Health", "Robotics", "Logistics", "Labs", "Software"];
  const companies = Array.from({ length: 24 }, (_, k) => ({
    id: `c_qaw${String(k).padStart(2, "0")}`,
    fields: { name: `${A[k % A.length]} ${B[(k * 5) % B.length]}`, website: `${A[k % A.length].toLowerCase()}${k}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" },
  }));
  const engagements = companies.map((c, k) => ({ id: `e_qaw${k}`, companyId: c.id, verified: false, fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2025-03", status: "Active", end: "Ongoing" } }));
  const member = { id: "mem_pix", name: "Pixel Tester", email: "pixel.qafix@example.com", title: "Fractional VP Sales", token: "tok-qafix-pixel-0001" };
  const icp = { industries: [], employees: ["11–50", "51–200", "201–500"], revenue: [], countries: ["United States"] };
  writeFileSync(path.join(bdir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-30 * DAY), members: [member], companies, engagements, contacts: [] }));
  writeFileSync(
    path.join(bdir, "intel.json"),
    JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: { mem_pix: iso(-3 * DAY) }, profiles: { mem_pix: { function: "Sales", onboarded: true, icp, before: ["Marketing"] } } }),
  );
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    RN_DATA_DIR: bdir,
    RN_INTEL_SEED: path.join(bdir, "intel-seed.json"),
    RN_STARTER_CREDITS: "25",
    RN_ADMIN_EMAILS: "admin-qafix-web@example.com",
    RN_SCAN_TEST: "1",
    RN_LOGO_LOOKUP: "off",
    RN_DIGEST: "0",
  };
  for (const k of ["RN_INTEL_SEED_KEY", "RESEND_API_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_GOOGLE", "RN_BILLING", "STRIPE_SECRET_KEY"]) delete env[k];
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-p", String(PORT)], { env, stdio: ["ignore", "pipe", "pipe"] });
  let log = "";
  server.stdout.on("data", (d) => (log += d));
  server.stderr.on("data", (d) => (log += d));
  const stop = () => {
    try {
      server.kill();
    } catch {}
    rmSync(bdir, { recursive: true, force: true });
  };
  try {
    let up = false;
    for (let k = 0; k < 120 && !up; k++) {
      try {
        up = (await realFetch(`${BASE}/api/health`)).ok;
      } catch {}
      if (!up) await new Promise((r) => setTimeout(r, 500));
    }
    check("the server is up", up, log.slice(-400));
    if (!up) return;
    // Straight to the local server, never through a proxy the environment sets.
    const browser = await pw.chromium.launch({ args: ["--no-proxy-server"] });
    try {
      const ctx = await browser.newContext({ ...pw.devices["Pixel 7"] });
      await ctx.addCookies([{ name: "rn_table", value: member.token, url: BASE }]);
      const page = await ctx.newPage();
      const consoleErrors: string[] = [];
      page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
      const logoAnswers: number[] = [];
      page.on("response", (r) => r.url().includes("/api/logo/") && logoAnswers.push(r.status()));
      const settle = () => page.waitForFunction(() => !!document.querySelector(".tp-top") && !document.querySelector(".tp-allwait, .mv-skel, .td-card-skel, .hm-card-wait"), null, { timeout: 30_000 }).catch(() => {});
      const back = async () => {
        await page.evaluate(() => window.history.back());
        await page.waitForTimeout(400);
      };
      const inApp = () => page.evaluate(() => !!document.querySelector(".tp-top") && location.origin === window.location.origin);

      console.log("\nBack with a sheet open (Pixel 7)");
      await page.goto(`${BASE}/`);
      await settle();
      const home = page.url();
      await page.click(".tp-tabbar [data-nav='more']");
      await page.waitForSelector(".tp-more-sheet", { timeout: 5000 });
      await page.waitForTimeout(150);
      const pushed = await page.evaluate(() => (window.history.state as { tpSheet?: string } | null)?.tpSheet ?? null);
      check("the More sheet puts an entry of its own on the history", !!pushed, pushed);
      await back();
      check("Back closes the More sheet", (await page.$(".tp-more-sheet")) === null);
      check("and stays on Home, in the app", page.url() === home && (await inApp()), page.url());

      await page.goto(`${BASE}/?p=table`);
      await settle();
      const table = page.url();
      const len0 = await page.evaluate(() => window.history.length);
      const pill = await page.$(".hunt-pill-edit, .hunt-pill-btn");
      check("the table's profile pill is there to open Your profile", !!pill);
      if (pill) {
        await pill.click();
        await page.waitForSelector(".hunt-sheet #hunt-title", { timeout: 5000 });
        await page.waitForTimeout(150);
        const typed = "Fractional Typed Title QA";
        await page.fill("#hunt-title", typed);
        await back();
        check("Back closes Your profile with something typed", (await page.$(".hunt-sheet")) === null);
        check("and stays on the table (it does not jump to another page)", page.url() === table && (await inApp()), page.url());
        await (await page.$(".hunt-pill-edit, .hunt-pill-btn"))!.click();
        await page.waitForSelector(".hunt-sheet #hunt-title", { timeout: 5000 });
        await page.waitForTimeout(300);
        check("opened again, what was typed is still there", (await page.inputValue("#hunt-title")) === typed, await page.inputValue("#hunt-title"));
        await page.click(".hunt-sheet .tp-sheet-head [aria-label='Done']");
        await page.waitForTimeout(500);
        const st = await page.evaluate(() => ({ sheet: (window.history.state as { tpSheet?: string } | null)?.tpSheet ?? null, len: window.history.length }));
        check("its own X closes it and takes its entry off: the page doesn't move", (await page.$(".hunt-sheet")) === null && page.url() === table && st.sheet === null && (await inApp()), { url: page.url(), st });
        check("no entry piled up, and none popped twice", st.len >= len0 && st.len <= len0 + 2, { len0, st });
        await back();
        check("one more Back after that is the table's own (a sheet's Back never popped it)", (await inApp()) || !page.url().startsWith(BASE), page.url());
      }

      console.log("\nsearch, logos, links");
      await page.goto(`${BASE}/?p=table`);
      await settle();
      // A phone's search opens from its button in the top bar (or sits in the list).
      if (!(await page.locator("input[type='search']:visible").count())) await page.locator("button[aria-label='Search']:visible").first().click().catch(() => {});
      await page.waitForTimeout(200);
      const search = page.locator("input[type='search']:visible").first();
      if (await search.count()) {
        await search.fill("x".repeat(160));
        await page.waitForTimeout(600);
        // Measured against the phone's own width: a page wider than it makes a phone's layout viewport (innerWidth) grow to fit.
        const vw = pw.devices["Pixel 7"].viewport!.width;
        const wide = () =>
          page.evaluate(() => {
            const over = [...document.querySelectorAll("body *")].filter((el) => el.getBoundingClientRect().right > (window as unknown as { __vw: number }).__vw + 1).slice(0, 3).map((el) => `${el.tagName}.${el.className}`);
            return { sw: document.documentElement.scrollWidth, iw: window.innerWidth, q: !!document.querySelector(".tp-q"), over };
          });
        await page.evaluate((x) => ((window as unknown as { __vw: number }).__vw = x), vw);
        const w = await wide();
        check("a long search doesn't push the page sideways on a phone", w.sw <= vw + 1, { vw, ...w });
        // The control: without the wrap rule (app/post/post.css .tp-q) the same query does, so the check above sees what it checks.
        const tag = await page.addStyleTag({ content: ".tp-q{white-space:nowrap!important;overflow-wrap:normal!important;word-break:normal!important}" });
        await page.waitForTimeout(100);
        const w0 = await wide();
        check("(control: the query is on screen, and without the rule it would overflow)", w0.q && w0.sw > vw + 1, { vw, ...w0 });
        await tag.evaluate((el) => el.remove());
      } else check("the table's search is there", false);
      check("logos were asked for, and answered without an error (204 for no logo, never a 404)", logoAnswers.length > 0 && logoAnswers.every((s) => s === 200 || s === 204 || s === 304), logoAnswers.slice(0, 20));
      check("no logo request logged an error in the console", !consoleErrors.some((e) => /404|api\/logo/.test(e)), consoleErrors.slice(0, 5));

      await page.goto(`${BASE}/?k=not-a-real-sign-in-code-0000`);
      await settle();
      const note = await page.waitForSelector(".toasts >> text=That sign-in link was used or expired", { timeout: 8000 }).catch(() => null);
      check("a used sign-in link on a signed-in browser shows a small notice", !!note && (await inApp()));

      await page.goto(`${BASE}/?sig=2099-12-31`);
      await settle();
      await page.waitForTimeout(500);
      const sig = new URL(page.url()).searchParams.get("sig");
      check("?sig=2099-12-31 opens today's Crystal Ball, never that day", sig !== "2099-12-31" && (sig === null || sig <= new Date().toISOString().slice(0, 10)), page.url());
      await ctx.close();
    } catch (e) {
      console.log(`server log: ${log.slice(-1500)}`);
      throw e;
    } finally {
      await browser.close();
    }
  } finally {
    stop();
  }
}

try {
  await inProcess();
  await inBrowser();
} catch (e) {
  failures++;
  console.log(`FAIL crashed: ${(e as Error).stack}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
