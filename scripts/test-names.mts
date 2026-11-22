#!/usr/bin/env node
/**
 * Checks of seat-holder names from public profiles, Verify, claim links and Remove my name.
 *
 *   npx tsx scripts/test-names.mts            (NAMES_PORT=4597 by default)
 *
 * No private data: a made-up seed, a made-up seat file and a made-up seed key in a scratch folder,
 * removed at the end. Every person in them is made up.
 *
 *  1. Pure: the name rules (lib/personName.ts) and claim tokens (lib/claimToken.ts).
 *  2. The scripts: add-seat-names.mjs (United States rows only, matched by the hashed or the first
 *     batch's id, names cleaned, rows that don't read as a name skipped and counted, a holder on file
 *     kept, nothing else from the row stored, a second run changes nothing) and claim-outreach.mjs
 *     (one row per named seat, its claim link and message, never inside the repo).
 *  3. In process: the connector (locked until unlocked, then holder_verified false), the weekly
 *     email's data and a Slack post (no name in either).
 *  4. Over HTTP, against a server on the made-up seed: gating (locked until 1 credit, with the role,
 *     Unlock all counting it once, never in a signed-out view or the homepage), Verify (a claim with
 *     a matching name, one without that waits for an admin, two confirmations, This is wrong with a
 *     refund once), the claim page (valid, invalid and claimed links, joining through it with the
 *     invite code carried, Remove my name and Not me without an account, the public Remove my name
 *     page answering the same either way), and the switch by the admins' toggle.
 *  5. A second server whose threshold is below the table's seats: the names read as unnamed.
 */
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHmac } from "node:crypto";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 500)}`);
};

/** A made-up seed key: seats and claim links are keyed by HMACs under it. */
const TEST_KEY = Buffer.alloc(32, 9).toString("base64");
const hashedId = (sid: string) => `e_ss_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`seat-scan:${sid}`).digest("hex").slice(0, 20)}`;
const claimTok = (id: string) => createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`claim:${id}`).digest("base64url").slice(0, 22);
process.env.RN_INTEL_SEED_KEY = TEST_KEY;

/* ---------- 1. pure ---------- */

console.log("\nThe name rules");
const PN = await import("../lib/personName.ts");
const clean = (raw: string) => {
  const r = PN.cleanPersonName(raw);
  return "name" in r ? r.name : `skip: ${r.skip}`;
};
const NAMES: [string, string][] = [
  ["Zelda Quartermaine, MBA, CPA", "Zelda Quartermaine"],
  ["Zelda Quartermaine (she/her)", "Zelda Quartermaine"],
  ["Robert “Bob” Featherstone 🚀", "Robert Featherstone"],
  ["Dr. Pella Vantongeren", "Pella Vantongeren"],
  ["Rhea Ostrowski PhD", "Rhea Ostrowski"],
  ["Sable Underhill - Fractional CMO", "Sable Underhill"],
  ["Tobin Marchetti | Advisor", "Tobin Marchetti"],
  ["WREN CASTELLANOS", "Wren Castellanos"],
  ["ilse van brandvold", "Ilse van Brandvold"],
  ["Ximena Q. Pettigrew", "Ximena Q. Pettigrew"],
  ["Ulric Head", "Ulric Head"],
  ["Odalys Ma", "Odalys Ma"],
  ["Barnaby W.", "skip: last name is only an initial"],
  ["C. Rutledge", "skip: first name is only an initial"],
  ["Dashiell", "skip: one word"],
  ["🚀🚀", "skip: no name"],
  // A greeting or a page's words is no name (lib/nameWords.ts): "Welcome Read" came from a page. A surname that is also a page word stays.
  ["Welcome Read", "skip: a greeting or page words"],
  ["Meet Our Team", "skip: a greeting or page words"],
  ["Hello Sarah", "skip: a greeting or page words"],
  ["Read Ashworth", "skip: a greeting or page words"],
  ["Ashley Read", "Ashley Read"],
  ["Larry Page", "Larry Page"],
  ["Sable Underhill Growth Partners", "Sable Underhill"],
];
for (const [raw, want] of NAMES) check(`clean ${JSON.stringify(raw)} -> ${want}`, clean(raw) === want, clean(raw));
check("a cleaned name always passes the seat holder rule", NAMES.every(([raw]) => {
  const r = PN.cleanPersonName(raw);
  return !("name" in r) || /^(?=.{3,60}$)\p{L}[\p{L}'’.-]*(?: \p{L}[\p{L}'’.-]*)+$/u.test(r.name);
}));
check("the same person: first and last name, without case, accents, middle names or initials", PN.sameName("Ximena Q. Pettigrew", "ximena pettigrew") && PN.sameName("Élise Dorn", "Elise Dorn") && PN.sameName("Ximena Ann Pettigrew", "Ximena Pettigrew"));
check("not the same person: another last name, or another first name", !PN.sameName("Zelda Quartermaine", "Zelda Quartermain") && !PN.sameName("Zelda Quartermaine", "Orrin Quartermaine"));
check("a one-word name matches nothing", !PN.sameName("Zelda", "Zelda Quartermaine"));
check("the first name for a greeting skips an initial", PN.firstNameOf("Z. Orrin Quartermaine") === "Orrin" && PN.firstNameOf("Zelda Quartermaine") === "Zelda");

console.log("\nClaim tokens");
const CT = await import("../lib/claimToken.ts");
const ids = ["e_ss_aaa", "e_ss_bbb", "e_xyz"];
check("a token is 22 base64url characters, the contract's HMAC", CT.claimToken("e_ss_aaa") === claimTok("e_ss_aaa") && /^[A-Za-z0-9_-]{22}$/.test(CT.claimToken("e_ss_aaa")));
check("each seat has its own token", new Set(ids.map((i) => CT.claimToken(i))).size === 3);
check("a token finds its seat", CT.seatForToken(CT.claimToken("e_ss_bbb"), ids) === "e_ss_bbb");
check("a wrong, cut or odd token finds nothing", CT.seatForToken("A".repeat(22), ids) === null && CT.seatForToken(CT.claimToken("e_ss_bbb").slice(0, 21), ids) === null && CT.seatForToken(42, ids) === null && CT.seatForToken("../../etc/passwd", ids) === null);
process.env.RN_INTEL_SEED_KEY = "";
check("without the seed key there are no claim links", CT.claimToken("e_ss_aaa") === "" && CT.seatForToken(claimTok("e_ss_aaa"), ids) === null);
process.env.RN_INTEL_SEED_KEY = TEST_KEY;

/* ---------- 2. the scripts, on a made-up seed and seat file ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "tp-names-"));
const seedPath = path.join(dir, "intel-seed.json");
const csvPath = path.join(dir, "seats.csv");
// Seats the seat scan put on the seed: by the hashed id, one by the first batch's id, one already named, one unnamed nobody in the file holds.
const SEATS: [string, string, string, string, string][] = [
  // [file seat_id, seed id, company, role, function]
  ["fx-a1", hashedId("fx-a1"), "c_alpha", "Fractional VP Sales", "Sales"],
  ["fx-b1", hashedId("fx-b1"), "c_bravo", "Fractional CMO", "Marketing"],
  ["fx-legacy7", "e_ss_fxlegacy7", "c_delta", "Fractional CFO", "Finance"],
  ["fx-c1", hashedId("fx-c1"), "c_charlie", "Fractional RevOps Lead", "RevOps"],
  ["fx-e1", hashedId("fx-e1"), "c_echo", "Fractional Head of Growth", "Growth"],
  ["fx-g1", hashedId("fx-g1"), "c_golf", "Fractional VP Partnerships", "Partnerships"],
  ["fx-h1", hashedId("fx-h1"), "c_hotel", "Fractional Head of CS", "Customer Success"],
  ["fx-f1", hashedId("fx-f1"), "c_foxtrot", "Fractional COO", "Operations"],
  ["fx-i1", hashedId("fx-i1"), "c_india", "Fractional VP Enablement", "Enablement"],
  ["fx-s1", hashedId("fx-s1"), "c_alpha", "Fractional Head of Marketing", "Marketing"],
  ["fx-u1", hashedId("fx-u1"), "c_bravo", "Fractional VP RevOps", "RevOps"],
];
const seat = (sid: string) => SEATS.find((x) => x[0] === sid)!;
const seed = {
  builtAt: new Date().toISOString(),
  members: [{ id: "sm1", name: "Fixture Seedmember", email: "seedmember-names@example.com", title: "Fractional CMO", token: "names-seed-token-1" }],
  companies: [
    { id: "c_alpha", fields: { name: "Alpha Fixture Co", website: "alpha-fixture.example.com", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } },
    { id: "c_bravo", fields: { name: "Bravo Fixture Labs", website: "bravo-fixture.example.com", industry: "Fintech" } },
    { id: "c_charlie", fields: { name: "Charlie Hiring Inc", website: "charlie-fixture.example.com", industry: "SaaS" } },
    { id: "c_delta", fields: { name: "Delta Fixture Works", industry: "Health Care" } },
    { id: "c_echo", fields: { name: "Echo Fixture Systems" } },
    { id: "c_foxtrot", fields: { name: "Foxtrot Fixture Group" } },
    { id: "c_golf", fields: { name: "Golf Fixture Partners" } },
    { id: "c_hotel", fields: { name: "Hotel Fixture Health" } },
    { id: "c_india", fields: { name: "India Fixture Co" } },
  ],
  engagements: SEATS.map(([, id, companyId, role, fn]) => ({
    id,
    companyId,
    fields: { source: "Seat scan", role, type: "Fractional", status: "Active", end: "Ongoing", start: "2025-04", function: fn, ...(id === hashedId("fx-f1") ? { operator: "Kept Holdername" } : {}) },
    verified: false,
  })),
  contacts: [],
};
writeFileSync(seedPath, JSON.stringify(seed));

/** Made-up people. A name may reach only the seed (cleaned) and a view that paid for it. */
const P = {
  zelda: "Zelda Quartermaine",
  orrin: "Orrin Featherstone",
  pella: "Pella Vantongeren",
  rhea: "Rhea Ostrowski",
  sable: "Sable Underhill",
  galatea: "Galatea Moorcroft",
  fenwick: "Fenwick Aldous",
  ilse: "Ilse Brandvold",
  tobin: "Tobin Marchetti",
  quinn: "Quinn Z.",
  yorick: "Yorick Halloran",
  ghost: "Ghostly Nobodyhere",
};
const HEAD = "seat_id,person_name,person_sales_nav_id,seat_title,company_name,company_sales_nav_id,company_linkedin_url,function,role_category,is_gtm,role_type,start_month_est,end_month,is_current,tenure_months,person_location,country,source,source_query,captured_on,company_website,company_industry,company_employee_range,company_employee_count,company_rn_revenue_bucket,company_about,company_likely_fractional_provider";
const csvRow = (o: Record<string, string>) =>
  HEAD.split(",")
    .map((k) => {
      const v = o[k] ?? "";
      return /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
    })
    .join(",");
const base = { role_type: "Fractional", is_current: "TRUE", tenure_months: "7", person_location: "Springfield Fixtureville", source: "fixture source", source_query: "fixture query", captured_on: "2026-11-16" };
const rows = [
  { ...base, seat_id: "fx-a1", person_name: `${P.zelda}, MBA (she/her)`, person_sales_nav_id: "NAVLEAD0001", company_name: "Alpha Fixture Co", country: "United States" },
  { ...base, seat_id: "fx-b1", person_name: "Orrin “Ory” Featherstone 🚀", person_sales_nav_id: "NAVLEAD0002", company_name: "Bravo Fixture Labs", country: "United States" },
  { ...base, seat_id: "fx-legacy7", person_name: `Dr. ${P.pella}`, person_sales_nav_id: "NAVLEAD0003", company_name: "Delta Fixture Works", country: "United States" },
  { ...base, seat_id: "fx-c1", person_name: P.rhea, person_sales_nav_id: "NAVLEAD0004", company_name: "Charlie Hiring Inc", country: "United States" },
  { ...base, seat_id: "fx-e1", person_name: `${P.sable} - Fractional Head of Growth`, person_sales_nav_id: "NAVLEAD0005", company_name: "Echo Fixture Systems", country: "United States" },
  { ...base, seat_id: "fx-g1", person_name: P.galatea, person_sales_nav_id: "NAVLEAD0008", company_name: "Golf Fixture Partners", country: "United States" },
  { ...base, seat_id: "fx-h1", person_name: P.fenwick, person_sales_nav_id: "NAVLEAD0009", company_name: "Hotel Fixture Health", country: "United States" },
  { ...base, seat_id: "fx-i1", person_name: `${P.ilse} ✓`, person_sales_nav_id: "NAVLEAD0012", company_name: "India Fixture Co", country: "United States" },
  // Already named on the seed: kept.
  { ...base, seat_id: "fx-f1", person_name: P.tobin, person_sales_nav_id: "NAVLEAD0006", company_name: "Foxtrot Fixture Group", country: "United States" },
  // Skipped: the last name is only an initial.
  { ...base, seat_id: "fx-s1", person_name: P.quinn, person_sales_nav_id: "NAVLEAD0007", company_name: "Alpha Fixture Co", country: "United States" },
  // Not in the United States: never named.
  { ...base, seat_id: "fx-u1", person_name: P.yorick, person_sales_nav_id: "NAVLEAD0010", company_name: "Bravo Fixture Labs", country: "Canada" },
  // In the United States but not on the seed.
  { ...base, seat_id: "fx-zz9", person_name: P.ghost, person_sales_nav_id: "NAVLEAD0011", company_name: "Nowhere Fixture", country: "United States" },
];
writeFileSync(csvPath, [HEAD, ...rows.map(csvRow)].join("\n") + "\n");
const ALL_NAMES = Object.values(P).filter((n) => n !== P.quinn);
const FILE_ONLY = ["NAVLEAD", "Springfield Fixtureville", "fixture query", "fixture source", "MBA", "she/her", "Ory"];
const leaksIn = (text: string, names = ALL_NAMES) => [...names, ...FILE_ONLY].filter((x) => text.includes(x));

console.log("\nThe names script");
const runNames = (...extra: string[]) =>
  spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-seat-names.mjs"), csvPath, "--seed", seedPath, "--no-seal", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
const dry = runNames("--dry-run");
check("a dry run writes nothing", dry.status === 0 && readFileSync(seedPath, "utf8") === JSON.stringify(seed), dry.stderr);
const first = runNames();
const line = (out: string, re: RegExp) => out.match(re)?.[1];
check("the script runs", first.status === 0, first.stderr);
check("only the United States rows are read (11 of 12)", /United States: 11\b/.test(first.stdout), first.stdout);
check("10 matched (9 by the hashed id, 1 by the first batch's id), 1 not on the seed", line(first.stdout, /matched to a seat on the seed: (\d+)/) === "10" && /9 by the hashed id, 1 by the first batch's id/.test(first.stdout) && line(first.stdout, /not on the seed: (\d+)/) === "1", first.stdout);
check("8 named, 1 kept (already named), 1 skipped (last name only an initial)", line(first.stdout, /named now: (\d+)/) === "8" && line(first.stdout, /\(kept\): (\d+)/) === "1" && line(first.stdout, /skipped \(last name is only an initial\): (\d+)/) === "1", first.stdout);
check("it prints no name", !leaksIn(first.stdout + first.stderr, Object.values(P)).length, leaksIn(first.stdout));
const s1 = JSON.parse(readFileSync(seedPath, "utf8"));
const eng = (id: string) => s1.engagements.find((e: { id: string }) => e.id === id);
check("names are cleaned (credentials, pronouns, nicknames, emoji, honorifics, a tagline)", eng(seat("fx-a1")[1]).fields.operator === P.zelda && eng(seat("fx-b1")[1]).fields.operator === P.orrin && eng(seat("fx-legacy7")[1]).fields.operator === P.pella && eng(seat("fx-e1")[1]).fields.operator === P.sable, SEATS.map((x) => eng(x[1]).fields.operator));
check("each named seat is marked holderFrom public profile", ["fx-a1", "fx-b1", "fx-legacy7", "fx-c1", "fx-e1", "fx-g1", "fx-h1", "fx-i1"].every((sid) => eng(seat(sid)[1]).holderFrom === "public profile"));
check("a holder already on the seed stays, unmarked", eng(seat("fx-f1")[1]).fields.operator === "Kept Holdername" && !eng(seat("fx-f1")[1]).holderFrom);
check("a skipped name and a seat outside the United States get nothing", !eng(seat("fx-s1")[1]).fields.operator && !eng(seat("fx-u1")[1]).fields.operator && !eng(seat("fx-u1")[1]).holderFrom);
const seedText = readFileSync(seedPath, "utf8");
check("nothing else from the file is stored (ids, places, queries, credentials, the skipped name)", !leaksIn(seedText, [P.yorick, P.ghost, P.quinn, P.tobin]).length, leaksIn(seedText, [P.yorick, P.ghost, P.quinn, P.tobin]));
check("only the seat holder and the mark changed", JSON.stringify(s1.companies) === JSON.stringify(seed.companies) && s1.engagements.every((e: { id: string; fields: Record<string, string> }) => {
  const o = seed.engagements.find((x) => x.id === e.id)!;
  const { operator: _a, ...rest } = e.fields;
  const { operator: _b, ...was } = o.fields as Record<string, string>;
  return JSON.stringify(rest) === JSON.stringify(was);
}));
const second = runNames();
check("a second run names nothing and keeps all 9", line(second.stdout, /named now: (\d+)/) === "0" && line(second.stdout, /\(kept\): (\d+)/) === "9", second.stdout);
check("a second run leaves the seed as it was", readFileSync(seedPath, "utf8") === seedText);
check("no seat outside the United States carries a name (the run says 0)", line(first.stdout, /named seats outside the United States: (\d+)/) === "0" && !eng(seat("fx-u1")[1]).fields.operator, first.stdout);
{
  // A seat named from a public profile whose row now puts the holder outside the United States loses the name.
  const moved = {
    ...seed,
    engagements: [{ id: hashedId("fx-uk1"), companyId: "c_bravo", fields: { source: "Seat scan", role: "Fractional CFO", type: "Fractional", status: "Active", end: "Ongoing", operator: P.yorick }, holderFrom: "public profile", verified: false }],
  };
  const movedSeed = path.join(dir, "intel-seed-moved.json");
  const movedCsv = path.join(dir, "seats-moved.csv");
  writeFileSync(movedSeed, JSON.stringify(moved));
  writeFileSync(movedCsv, [HEAD, csvRow({ ...base, seat_id: "fx-uk1", person_name: P.yorick, person_sales_nav_id: "NAVLEAD0099", company_name: "Bravo Fixture Labs", country: "United Kingdom" })].join("\n") + "\n");
  const r = spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-seat-names.mjs"), movedCsv, "--seed", movedSeed, "--no-seal"], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
  const after = JSON.parse(readFileSync(movedSeed, "utf8")).engagements[0];
  check("a public-profile name on a seat outside the United States is taken off", r.status === 0 && !after.fields.operator && !after.holderFrom && /names taken off them: 1; named seats outside the United States: 0/.test(r.stdout), r.stdout + r.stderr);
  check("  and the run prints no name", !leaksIn(r.stdout + r.stderr, Object.values(P)).length);
}

console.log("\nThe outreach file");
const outCsv = path.join(dir, "outreach", "claim-your-seat.csv");
const outreach = spawnSync(process.execPath, [path.join(ROOT, "scripts", "claim-outreach.mjs"), outCsv, "--csv", csvPath, "--seed", seedPath], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY, RN_PUBLIC_URL: "https://merlin.example.com" } });
check("the outreach script runs", outreach.status === 0, outreach.stderr);
check("it prints counts, never a name", /rows written: 8\b/.test(outreach.stdout) && !leaksIn(outreach.stdout + outreach.stderr, Object.values(P)).length, outreach.stdout);
const oText = existsSync(outCsv) ? readFileSync(outCsv, "utf8") : "";
const oRows = oText.trim().split("\n").slice(1);
check("one row per named seat", oRows.length === 8, oRows.length);
check("the header names its columns", oText.startsWith("first_name,full_name,company,role,start_month,claim_link,sales_navigator_lead,email,email_from,message"));
check("a row has the first name, the claim link and the lead link", oText.includes(`Zelda,${P.zelda},Alpha Fixture Co,Fractional VP Sales,Apr 2025,https://merlin.example.com/claim/${claimTok(seat("fx-a1")[1])},https://www.linkedin.com/sales/lead/NAVLEAD0001,`), oRows[0]);
check("the message greets them, says it's free, and never where the name came from", /"?Hi Zelda, your seat as Fractional VP Sales at Alpha Fixture Co is on Merlin/.test(oText) && /free/.test(oText) && !/public profile|Sales Nav|LinkedIn profile|found you/i.test(oText.split("\n").map((l) => l.split(",https://www.linkedin.com")[0]).join("\n").replace(/sales_navigator_lead/, "")));
const inRepo = spawnSync(process.execPath, [path.join(ROOT, "scripts", "claim-outreach.mjs"), path.join(ROOT, "outreach-test.csv"), "--csv", csvPath, "--seed", seedPath], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
check("it refuses to write inside the repo", inRepo.status !== 0 && !existsSync(path.join(ROOT, "outreach-test.csv")), inRepo.stdout + inRepo.stderr);

/* ---------- 3. in process: the connector, the weekly email, Slack ---------- */

console.log("\nIn process");
const procDir = path.join(dir, "proc");
mkdirSync(procDir);
Object.assign(process.env, { RN_DATA_DIR: procDir, RN_INTEL_SEED: seedPath, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ID_SECRET: "names-test", RN_PUBLIC_URL: "https://merlin.example.com", RN_SCAN_TEST: "1" });
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_UNVERIFIED_NAMES_UNTIL"]) delete process.env[k];
// Every post to Slack is caught here. Calls to the test server below go through.
type Sent = { url: string; body: string };
const outbox: Sent[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (/^http:\/\/localhost:/.test(url)) return realFetch(input, init);
  outbox.push({ url, body: String(init?.body ?? "") });
  return new Response("ok", { status: 200 });
}) as typeof fetch;
const T = await import("../lib/table.ts");
const MCP = await import("../lib/mcp/tools.ts");
const MV = await import("../lib/mcp/view.ts");
const N = await import("../lib/notify/index.ts");
const U = await import("../lib/notify/url.ts");
U.setResolver(async () => ["93.184.216.34"]);
const sm = seed.members[0];
const ctx = { member: sm, origin: "https://merlin.example.com" };
// The member unlocks Alpha first (2 credits): every company is locked for a member until they unlock it or know it.
await T.perform(sm.token, { type: "unlock", entity: "company", id: T.tableInternals.pubId("c_alpha"), field: "identity" });
const g0 = (await MCP.getCompany(ctx, { company: "Alpha Fixture Co" })) as { seats: { id: string; seat_holder?: string; role?: string; claimable?: string; holder_verified?: boolean }[]; warm_paths: { name?: string }[] };
const named0 = g0.seats.find((x) => typeof x.seat_holder === "string" && x.seat_holder.startsWith("locked"));
check("connector: a named seat's holder is locked with its role, 1 credit for both", !!named0 && /opens who held this seat and the role they held together/.test(named0.seat_holder ?? "") && /locked/.test(String(named0.role ?? "")), g0.seats);
check("connector: no name before the unlock", !leaksIn(JSON.stringify(g0)).length, leaksIn(JSON.stringify(g0)));
check("connector: a named seat nobody claimed can still be claimed", typeof named0?.claimable === "string");
check("connector: a seat with nobody named says Nobody named yet", g0.seats.some((x) => x.seat_holder === "Nobody named yet"));
await T.perform(sm.token, { type: "unlock", entity: "engagement", id: named0!.id, field: "operator" });
MV.forgetView(sm.id);
const g1 = (await MCP.getCompany(ctx, { company: "Alpha Fixture Co" })) as { seats: { id: string; seat_holder?: string; holder_verified?: boolean }[]; warm_paths: { name?: string; holder_verified?: boolean }[] };
const named1 = g1.seats.find((x) => x.id === named0!.id);
check("connector: after the unlock, the name and holder_verified false", named1?.seat_holder === P.zelda && named1?.holder_verified === false, named1);
check("connector: the warm path says so too", g1.warm_paths.some((w) => w.name === P.zelda && w.holder_verified === false), g1.warm_paths);
check("connector: no Sales Navigator or public profile named as a source", !/Sales Nav|public profile/i.test(JSON.stringify(g1)));
// The weekly email and Slack: a new open role at a company with a named seat.
await N.connect(sm.token, "slack", "https://hooks.slack.com/services/" + "T0009TEST/B0009TEST/namesnamesnamesnamesXYZ");
outbox.length = 0;
await T.applyScan({ roles: [{ key: "names:1", company: "Alpha Fixture Co", domain: "alpha-fixture.example.com", title: "Fractional CMO", function: "Marketing", type: "Fractional", url: "https://jobs.example.com/names-1", source: "board", postedAt: null, rate: null, hoursPerWeek: null }], sources: [{ source: "board", fetched: 1, matched: 1 }] });
for (let i = 0; i < 4; i++) {
  await new Promise((r) => setTimeout(r, 20));
  await N.settled();
}
check("a Slack post went out for the new role", outbox.length >= 1, outbox.length);
check("no name in the Slack post", !leaksIn(outbox.map((x) => x.body).join("\n")).length, outbox.map((x) => x.body));
process.env.RN_DIGEST_ALL = "1";
const dig = await T.digestList(new Date().toISOString(), "https://merlin.example.com");
delete process.env.RN_DIGEST_ALL;
check("the weekly email's data has the new role and no name", dig.length >= 1 && !leaksIn(JSON.stringify(dig)).length, leaksIn(JSON.stringify(dig)));
const R = await import("../lib/digest.ts");
check("the weekly email itself names nobody", dig.every((d) => !leaksIn(JSON.stringify(R.renderDigest(d.data))).length));
globalThis.fetch = realFetch;

/* ---------- 4. over HTTP ---------- */

console.log("\nOver HTTP");
const PORT = Number(process.env.NAMES_PORT ?? 4597);
const BASE = `http://localhost:${PORT}`;
let server: ChildProcess | null = null;
let log = "";
async function startServer(dataDir: string, extra: Record<string, string> = {}): Promise<boolean> {
  mkdirSync(dataDir, { recursive: true });
  const env: NodeJS.ProcessEnv = {
    ...process.env, RN_DATA_DIR: dataDir, RN_INTEL_SEED: seedPath, RN_INTEL_SEED_KEY: TEST_KEY, RN_LOGO_LOOKUP: "off", RN_STARTER_CREDITS: "25", RN_ADMIN_EMAILS: "admin-qa@example.com",
    RN_CRON_SECRET: "qa-cron", RN_SCAN_TEST: "1", RN_ID_SECRET: "names-test", ...extra,
  };
  for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_INTEL_SEED_B64", "RN_SCAN", "RN_DIGEST", "RN_PUBLIC_URL"]) delete env[k];
  if (!extra.RN_UNVERIFIED_NAMES_UNTIL) delete env.RN_UNVERIFIED_NAMES_UNTIL;
  log = "";
  server = spawn(process.execPath, [path.join(ROOT, "node_modules", "next", "dist", "bin", "next"), "start", "-p", String(PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  server.stdout?.on("data", (b) => (log += b));
  server.stderr?.on("data", (b) => (log += b));
  for (let i = 0; i < 150; i++) {
    if ((await realFetch(`${BASE}/api/health`).then((r) => r.status, () => 0)) > 0) return true;
    await new Promise((r) => setTimeout(r, 200));
  }
  return false;
}
async function stopServer() {
  server?.kill("SIGTERM");
  await new Promise((r) => setTimeout(r, 400));
  server = null;
}

let ipN = 0;
type Res = { status: number; json: any; text: string; headers: Headers }; // eslint-disable-line @typescript-eslint/no-explicit-any
async function call(method: string, p: string, o: { token?: string | null; ip?: string; body?: unknown; headers?: Record<string, string> } = {}): Promise<Res> {
  const h: Record<string, string> = { ...(o.headers ?? {}) };
  if (o.token) h.cookie = `rn_table=${o.token}`;
  h["x-forwarded-for"] = o.ip ?? `10.66.${Math.floor(++ipN / 200)}.${ipN % 200}`;
  if (o.body !== undefined) h["content-type"] = "application/json";
  let r: Response | null = null;
  for (let i = 0; !r; i++) {
    try {
      r = await realFetch(BASE + p, { method, headers: h, body: o.body === undefined ? undefined : JSON.stringify(o.body) });
    } catch (e) {
      if (i >= 2) throw e;
    }
  }
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
  text = async () => (await call("GET", "/api/table", { token: this.token, ip: this.ip })).text;
  act = (action: unknown) => call("POST", "/api/table", { token: this.token, ip: this.ip, body: { action } });
}
async function join(name: string, email: string, headers: Record<string, string> = {}, ref?: string) {
  const ip = `10.67.${Math.floor(++ipN / 200)}.${ipN % 200}`;
  const r = await call("POST", "/api/table", { ip, headers, body: { join: { name, email, ref } } });
  const token = cookieOf(r);
  if (!token) throw new Error(`join failed: ${r.status} ${r.text.slice(0, 200)}`);
  const w = new Who(token, ip);
  await w.act({ type: "profile", function: "Sales" });
  return w;
}
type Seat = { id: string; source: string; claimable?: boolean; claimWaiting?: boolean; yours: boolean; cells: Record<string, { s: string; v?: string; unverified?: boolean; iv?: boolean; from?: string; member?: { you?: boolean } }> };
type Co = { id: string; name: string; hidden?: boolean; engagements: Seat[] };
const seatIn = (v: { companies: Co[] }, sid: string) => {
  const role = seat(sid)[3];
  for (const c of v.companies) for (const e of c.engagements) if (e.source === "Seat scan" && c.id && (e.cells.function?.v === seat(sid)[4] || e.cells.role?.v === role) && companyOf(v, c.id) === seat(sid)[2]) return e;
  return undefined;
};
/** Public company id -> the fixture's company id, by name (the view's names). */
const COMPANY_NAMES: Record<string, string> = Object.fromEntries(seed.companies.map((c) => [c.fields.name, c.id]));
const pubCo = new Map<string, string>();
const companyOf = (v: { companies: Co[] }, pub: string) => pubCo.get(pub) ?? COMPANY_NAMES[v.companies.find((c) => c.id === pub)?.name ?? ""] ?? "";
const credits = async (w: Who) => (await w.view()).me.credits as number;

const httpDir = path.join(dir, "http");
const up = await startServer(httpDir);
check("server starts", up, log.slice(-400));
if (up) {
  // An open role at Charlie: the company is locked.
  await call("POST", "/api/table/scan", { headers: { "x-cron-secret": "qa-cron" }, body: { roles: [{ key: "names:charlie", company: "Charlie Hiring Inc", domain: "charlie-fixture.example.com", title: "Fractional VP Marketing", function: "Marketing", type: "Fractional", url: "https://jobs.example.com/charlie", source: "board", postedAt: null, rate: "$150/hr", hoursPerWeek: 10 }], sources: [{ source: "board", fetched: 1, matched: 1 }] } });
  const adm = await join("Admin Qa", "admin-qa@example.com", { "x-cron-secret": "qa-cron" });
  // The admin sees every company: learn the public ids of the fixture's companies from the admin's view.
  for (const c of ((await adm.view()) as { companies: Co[] }).companies) if (COMPANY_NAMES[c.name]) pubCo.set(c.id, COMPANY_NAMES[c.name]);
  const ann = await join("Annika Claimworth", "ann-names@example.com");
  const bob = await join("Bertram Lookwell", "bob-names@example.com");
  const cat = await join("Cosima Rutledge", "cat-names@example.com");
  const dan = await join("Dashiell Ormsby", "dan-names@example.com");
  // Every company is locked for a member until they unlock it or know it (2 credits), and what is paid
  // or claimed at a locked one opens after it: the members unlock the fixture's companies they use
  // here, all but Charlie, whose lock is checked below.
  const pubOf = new Map([...pubCo].map(([pub, id]) => [id, pub]));
  for (const w of [ann, bob, cat, dan]) for (const id of ["c_alpha", "c_bravo", "c_delta", "c_echo", "c_golf", "c_hotel", "c_india"]) await w.act({ type: "unlock", entity: "company", id: pubOf.get(id), field: "identity" });

  /* gating */
  let av = await ann.view();
  const zSeat = seatIn(av, "fx-a1")!;
  check("a named seat: claimable, its holder locked, and its role locked with it", !!zSeat && !!zSeat.claimable && zSeat.cells.operator?.s === "locked" && zSeat.cells.role?.s === "locked", zSeat);
  const unnamed = seatIn(av, "fx-s1")!;
  check("a found seat with nobody named: its role is free (SEAT_SCAN_ROLE_FREE)", unnamed?.cells.role?.s === "value" && (!unnamed.cells.operator || unnamed.cells.operator.s === "empty"), unnamed);
  check("no name in a member's view before an unlock", !leaksIn(await ann.text()).length, leaksIn(await ann.text()));
  const anon = await call("GET", "/api/table");
  check("no name in the signed-out view", !leaksIn(anon.text).length);
  const prev = await call("GET", "/api/table?preview=1&fn=Sales");
  check("the homepage preview says a holder is on file, never the name", prev.status === 200 && !leaksIn(prev.text).length && (prev.json?.counts?.holders ?? 0) >= 1, prev.json?.counts);
  const before = await credits(ann);
  let r = await ann.act({ type: "unlock", entity: "engagement", id: zSeat.id, field: "role" });
  const opCell = r.json?.cells?.find((c: { field: string }) => c.field === "operator")?.cell;
  check("1 credit opens who held it and the role, whichever lock", r.status === 200 && (await credits(ann)) === before - 1 && opCell?.s === "value" && opCell.v === P.zelda && r.json?.cells?.some((c: { field: string; cell: { s: string } }) => c.field === "role" && c.cell.s === "value"), r.json);
  check("the name reads as unverified, from Revenue Nomad research", opCell?.unverified === true && opCell?.from === "research", opCell);
  const oSeat = seatIn(av, "fx-b1")!;
  const b0 = await credits(bob);
  r = await bob.act({ type: "unlockMany", items: [{ entity: "engagement", id: oSeat.id, field: "operator" }, { entity: "engagement", id: oSeat.id, field: "role" }] });
  check("Unlock all counts a seat holder with their role once", r.status === 200 && (await credits(bob)) === b0 - 1, r.json);
  check("another member's view still has the name locked", seatIn(await cat.view(), "fx-a1")?.cells.operator?.s === "locked");

  /* Verify: This is me with a matching name, through the claim page, with the invite code */
  const zTok = claimTok(seat("fx-a1")[1]);
  let page = await call("GET", `/claim/${zTok}`);
  check("the claim page opens signed out, with the seat and no name", page.status === 200 && /Is this your seat\?/.test(page.text) && /Fractional VP Sales at Alpha Fixture Co since Apr 2025/.test(page.text) && !leaksIn(page.text).length, leaksIn(page.text));
  const annCode = (await ann.view()).me.inviteCode as string;
  r = await call("POST", "/api/table/names", { ip: "10.70.0.1", body: { op: "join", t: zTok, name: P.zelda, email: "zelda-names@example.com", ref: annCode } });
  const zTokCookie = cookieOf(r);
  check("joining through the claim link signs in and claims the seat", r.status === 200 && r.json?.claimed === true && !!zTokCookie, r.json);
  check("a matching name is verified by the claim", /matches the one on file, so it's verified/.test(r.json?.message ?? ""), r.json?.message);
  const zelda = new Who(zTokCookie!, "10.70.0.1");
  const zv = await zelda.view();
  const zMine = seatIn(zv, "fx-a1")!;
  check("the seat is theirs now, on Your seats", zMine?.yours && zMine.cells.operator?.s === "value" && zMine.cells.operator.v === P.zelda && !zMine.claimable && !zMine.cells.operator.unverified, zMine);
  check("the invite code came with the link: the inviter has one invite", (await ann.view()).me.invited === 1);
  av = await ann.view();
  check("the member who paid sees the claimed name, verified now", seatIn(av, "fx-a1")?.cells.operator?.v === P.zelda && !seatIn(av, "fx-a1")?.cells.operator?.unverified && !!seatIn(av, "fx-a1")?.cells.operator?.member);
  page = await call("GET", `/claim/${zTok}`);
  check("the claim page says a claimed seat is claimed", /already claimed/.test(page.text), page.text.slice(0, 200));
  page = await call("GET", `/claim/${zTok}`, { token: zTokCookie });
  check("to its holder it says it's their seat", /This is your seat/.test(page.text));
  page = await call("GET", `/claim/${"Q".repeat(22)}`);
  const page2 = await call("GET", "/claim/whatever-this-is");
  check("an invalid link is a friendly page, never an error", page.status === 200 && /didn.{1,6}t work/.test(page.text) && page2.status === 200 && /didn.{1,6}t work/.test(page2.text));

  /* Verify: This is me without a match goes to the admins */
  r = await cat.act({ type: "claimSeat", engagementId: oSeat.id });
  check("This is me on someone else's name waits for an admin", r.status === 200 && /an admin checks your claim first/.test(r.json?.message ?? ""), r.json);
  check("the name is not replaced", seatIn(await bob.view(), "fx-b1")?.cells.operator?.v === P.orrin);
  check("the claimer sees that their claim waits", !!seatIn(await cat.view(), "fx-b1")?.claimWaiting);
  r = await cat.act({ type: "claimSeat", engagementId: oSeat.id });
  check("asking again says it's waiting", /an admin is checking it/.test(r.json?.message ?? ""), r.json);
  r = await cat.act({ type: "claimSeat", engagementId: oSeat.id, preview: true });
  check("the preview says so too", r.status === 400 && /admin is checking it/.test(r.json?.error ?? ""), r.json);
  let adv = await adm.view();
  let waiting = adv.admin?.names?.claims ?? [];
  check("Pilot metrics lists the claim with the name on file", waiting.length === 1 && waiting[0].member === "Cosima Rutledge" && waiting[0].onFile === P.orrin && waiting[0].company === "Bravo Fixture Labs", waiting);
  r = await adm.act({ type: "names", op: "decline", engagementId: waiting[0].engagementId, memberId: waiting[0].memberId });
  check("an admin declines it, and the name stays", r.status === 200 && seatIn(await bob.view(), "fx-b1")?.cells.operator?.v === P.orrin && !seatIn(await cat.view(), "fx-b1")?.claimWaiting, r.json);
  r = await cat.act({ type: "claimSeat", engagementId: oSeat.id });
  adv = await adm.view();
  waiting = adv.admin?.names?.claims ?? [];
  r = await adm.act({ type: "names", op: "approve", engagementId: waiting[0]?.engagementId, memberId: waiting[0]?.memberId });
  const catSeat = seatIn(await cat.view(), "fx-b1");
  check("an admin approves a claim: the claimer's name goes on the seat, on their Your seats", r.status === 200 && !!catSeat?.yours && catSeat.cells.operator?.v === "Cosima Rutledge", { r: r.json, catSeat });
  r = await adm.act({ type: "names", op: "approve", engagementId: waiting[0]?.engagementId, memberId: waiting[0]?.memberId });
  check("a settled claim can't be approved twice", r.status === 400);

  /* Verify: joining through a claim link under another name signs in, and the claim waits for an admin */
  r = await call("POST", "/api/table/names", { ip: "10.70.0.5", body: { op: "join", t: claimTok(seat("fx-i1")[1]), name: "Jory Mismatchwell", email: "jory-names@example.com" } });
  check(
    "joining through a claim link under another name: signed in, and the claim waits for an admin",
    r.status === 200 && r.json?.waiting === true && r.json?.claimed === false && !!cookieOf(r) && /doesn't match yours, so an admin checks your claim first/.test(r.json?.message ?? ""),
    r.json,
  );
  const jory = new Who(cookieOf(r)!, "10.70.0.5");
  page = await call("GET", `/claim/${claimTok(seat("fx-i1")[1])}`, { token: jory.token });
  check("to them the claim page says it's being checked", /checking your claim/.test(page.text), page.text.slice(0, 200));

  /* Verify: two confirmations */
  const pSeat = seatIn(av, "fx-legacy7")!;
  await cat.act({ type: "unlock", entity: "engagement", id: pSeat.id, field: "operator" });
  await dan.act({ type: "unlock", entity: "engagement", id: pSeat.id, field: "operator" });
  const dan0 = await credits(dan);
  r = await cat.act({ type: "verify", entity: "engagement", id: pSeat.id, field: "operator" });
  check("one confirmation: still unverified, and it says one more verifies it", r.status === 200 && !!r.json?.cells?.[0]?.cell?.unverified && /Once one more member confirms it/.test(r.json?.message ?? ""), r.json);
  r = await dan.act({ type: "verify", entity: "engagement", id: pSeat.id, field: "operator" });
  check("two members confirming it verify the name", r.status === 200 && /so it's verified/.test(r.json?.message ?? "") && !r.json?.cells?.[0]?.cell?.unverified, r.json);
  check("confirming earns nothing", (await credits(dan)) === dan0);
  check("a verified name's seat is not unclaimed any more", !seatIn(await bob.view(), "fx-legacy7")?.claimable);
  r = await bob.act({ type: "claimSeat", engagementId: pSeat.id });
  check("This is me on a verified name that isn't yours is refused", r.status === 400, r.json);

  /* Verify: This is wrong */
  const sSeat = seatIn(av, "fx-e1")!;
  await ann.act({ type: "unlock", entity: "engagement", id: sSeat.id, field: "operator" });
  await bob.act({ type: "unlock", entity: "engagement", id: sSeat.id, field: "operator" });
  const ann1 = await credits(ann);
  const bob1 = await credits(bob);
  r = await bob.act({ type: "report", entity: "engagement", id: sSeat.id, field: "operator" });
  check("This is wrong: one report takes the name off for everyone at once", r.status === 200 && /off the seat for everyone now/.test(r.json?.message ?? ""), r.json);
  check("each member who paid gets 1 credit back", (await credits(ann)) === ann1 + 1 && (await credits(bob)) === bob1 + 1);
  const gone = seatIn(await dan.view(), "fx-e1");
  check("the seat reads as unnamed: its role is free and it can be claimed", (!gone?.cells.operator || gone.cells.operator.s === "empty") && gone?.cells.role?.s === "value" && !!gone?.claimable, gone);
  r = await ann.act({ type: "report", entity: "engagement", id: sSeat.id, field: "operator" });
  check("nothing more to report, and no second refund", r.status === 400 && (await credits(ann)) === ann1 + 1);
  check("the credit history names the refund", ((await ann.view()).ledger as { reason: string }[]).some((l) => /seat holder's name that came off/.test(l.reason)));

  /* the claim page: a locked company, Remove my name and Not me without an account */
  const rTok = claimTok(seat("fx-c1")[1]);
  page = await call("GET", `/claim/${rTok}`);
  check("a seat at a company locked by an open role names no company", /a company that.{1,6}s hiring now, since Apr 2025/.test(page.text) && !/Charlie Hiring Inc/.test(page.text), page.text.slice(0, 300));
  // Dan pays for the company and then for the name there, so he is the one to refund.
  const charlie = (await dan.view()).companies.find((c: Co) => c.hidden && c.engagements.some((e) => e.source === "Seat scan"));
  await dan.act({ type: "unlock", entity: "company", id: charlie.id, field: "identity" });
  const rSeat = seatIn(await dan.view(), "fx-c1")!;
  r = await dan.act({ type: "unlock", entity: "engagement", id: rSeat.id, field: "operator" });
  const dan1 = await credits(dan);
  r = await call("POST", "/api/table/names", { ip: "10.71.0.1", body: { op: "remove", t: rTok } });
  check("Remove my name works without an account", r.status === 200 && r.json?.done === true && /Your name is off that seat/.test(r.json?.message ?? ""), r.json);
  check("whoever paid for the name gets the credit back", (await credits(dan)) === dan1 + 1);
  check("the name is off for everyone", (seatIn(await dan.view(), "fx-c1")?.cells.operator?.s ?? "empty") === "empty");
  r = await call("POST", "/api/table/names", { ip: "10.71.0.1", body: { op: "remove", t: rTok } });
  check("removing again says there's nothing on it", r.status === 200 && r.json?.done === false, r.json);
  const gTok = claimTok(seat("fx-g1")[1]);
  r = await call("POST", "/api/table/names", { ip: "10.71.0.2", body: { op: "notme", t: gTok } });
  check("Not me takes the name off too", r.status === 200 && r.json?.done === true, r.json);
  r = await call("POST", "/api/table/names", { ip: "10.71.0.3", body: { op: "remove", t: "A".repeat(22) } });
  check("a bad link is refused, plainly", r.status === 400 && /claim link didn't work/.test(r.json?.error ?? ""), r.json);
  const kTok = claimTok(seat("fx-f1")[1]);
  r = await call("GET", `/api/table/names?t=${kTok}`);
  check("a seat named in our records reads as held", r.json?.status === "held" && r.json?.seat?.named === false, r.json);

  /* the public Remove my name page */
  const yes = await call("POST", "/api/table/names", { ip: "10.72.0.1", body: { op: "forget", name: P.fenwick, company: "Hotel Fixture Health" } });
  const no = await call("POST", "/api/table/names", { ip: "10.72.0.1", body: { op: "forget", name: "Nobody Atall", company: "No Such Company" } });
  check("the public page answers the same whether or not a name matched", yes.status === 200 && no.status === 200 && yes.json?.message === no.json?.message, [yes.json, no.json]);
  check("a matching name came off", (await call("GET", `/api/table/names?t=${claimTok(seat("fx-h1")[1])}`)).json?.seat?.named === false);
  const pv = await call("POST", "/api/table/names", { ip: "10.72.0.1", body: { op: "forget", name: P.pella, company: "Delta Fixture Works" } });
  check("a verified name is not taken off by the public page", pv.status === 200 && seatIn(await cat.view(), "fx-legacy7")?.cells.operator?.v === P.pella);
  let limitedAt = 0;
  for (let i = 0; i < 12 && !limitedAt; i++) if ((await call("POST", "/api/table/names", { ip: "10.72.0.9", body: { op: "forget", name: "Some Person", company: "Somewhere" } })).status === 429) limitedAt = i + 1;
  check("the public page is rate-limited by network", limitedAt === 11, limitedAt);
  check("no claim-page answer named anyone", !leaksIn(log).length);

  /* the switch: the admins' toggle */
  // Bravo's other seat and Golf are unnamed now; put a fresh unverified name back in play: Echo's is gone, so use a fresh member's view of the counts.
  adv = await adm.view();
  const n0 = adv.admin?.names;
  check("Pilot metrics counts the names", n0?.on === true && n0?.shown === true && n0?.limit === 10000 && n0?.claimed === 2 && n0?.removed === 4, n0);
  r = await adm.act({ type: "names", op: "show", on: false });
  check("an admin switches the names off", r.status === 200 && (await adm.view()).admin?.names?.shown === false, r.json);
  const offView = await bob.view();
  const iOff = seatIn(offView, "fx-i1");
  check("off: an unverified name reads as unnamed, its role free, claimable", (!iOff?.cells.operator || iOff.cells.operator.s === "empty") && iOff?.cells.role?.s === "value" && !!iOff?.claimable, iOff);
  check("off: no unverified name in the view", !leaksIn(await bob.text(), [P.ilse]).length);
  check("off: the verified name still shows", seatIn(offView, "fx-legacy7")?.cells.operator?.s === "locked" || seatIn(offView, "fx-legacy7")?.cells.operator?.s === "value");
  check("off: a claimed name still shows", seatIn(offView, "fx-a1")?.cells.operator?.s !== "empty" && seatIn(offView, "fx-b1")?.cells.operator?.s !== "empty");
  await adm.act({ type: "names", op: "show", on: true });
  check("on again: the name is back behind its lock", (await adm.view()).admin?.names?.shown === true && seatIn(await bob.view(), "fx-i1")?.cells.operator?.s === "locked");
  r = await ann.act({ type: "names", op: "show", on: false });
  check("only admins can switch it", r.status === 400);
  const exp = await call("GET", "/api/table?export=1", { token: adm.token, ip: adm.ip });
  check("the admin export keeps no name that was taken off, and nothing from the file", exp.status === 200 && !leaksIn(exp.text, [P.rhea, P.sable, P.galatea, P.fenwick, P.ilse, P.yorick, P.ghost]).length, leaksIn(exp.text, [P.rhea, P.sable, P.galatea, P.fenwick, P.ilse, P.yorick, P.ghost]));
  await stopServer();

  /* 5. a second server: the table is past the threshold */
  console.log("\nPast the threshold");
  const up2 = await startServer(path.join(dir, "http2"), { RN_UNVERIFIED_NAMES_UNTIL: "5" });
  check("second server starts", up2, log.slice(-300));
  if (up2) {
    const eve = await join("Evander Quillfeather", "eve-names@example.com");
    const ev = await eve.view();
    const hidden = ["fx-a1", "fx-b1", "fx-legacy7", "fx-c1", "fx-e1", "fx-g1", "fx-h1", "fx-i1"].map((sid) => seatIn(ev, sid));
    check("past the threshold, unverified names read as unnamed: role free, claimable", hidden.every((e) => e && (!e.cells.operator || e.cells.operator.s === "empty") && (e.cells.role?.s === "value" || e.cells.role?.s === "locked") && e.claimable), hidden.map((e) => [e?.cells.operator?.s, e?.cells.role?.s, e?.claimable]));
    check("and their roles are free again", hidden.filter((e) => e && !ev.companies.find((c: Co) => c.engagements.includes(e))?.hidden).every((e) => e!.cells.role?.s === "value"));
    check("no name anywhere in the view", !leaksIn(await eve.text()).length);
    // (From the record of a company she unlocked first: a claim at a locked one is refused like any fact added there.)
    await eve.act({ type: "unlock", entity: "company", id: ev.companies.find((c: Co) => c.engagements.some((e) => e.id === hidden[4]!.id))?.id, field: "identity" });
    r = await eve.act({ type: "claimSeat", engagementId: hidden[4]!.id });
    check("claims still work", r.status === 200 && /It's yours/.test(r.json?.message ?? ""), r.json);
    const adm2 = await join("Admin Qa", "admin-qa@example.com", { "x-cron-secret": "qa-cron" });
    const n2 = (await adm2.view()).admin?.names;
    check("Pilot metrics says they are not showing, and why", n2?.shown === false && n2?.on === true && n2?.limit === 5 && n2.seats > 5, n2);
    await stopServer();
  }
}

await stopServer();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? `${failed} failed, ` : ""}${passed} passed`);
process.exit(failed ? 1 : 0);
