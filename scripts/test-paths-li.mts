/**
 * Checks of LinkedIn's names-only Connections.csv (December 2026: "your data download no longer
 * includes your connections' email addresses, current companies, or job titles"): the file still
 * reads, its people are placed by their profile link alone, and the privacy rules hold.
 *
 *   npx tsx scripts/test-paths-li.mts      exits 1 on any failure
 *
 *  1. The file: a names-only file reads (namesOnly), an older file with companies still reads as
 *     before, a file with neither a Company nor a URL column is refused with why, a Sales Navigator
 *     id is never kept, the member's file and a profile on file read as the same slug.
 *  2. The profile-link match: a connection whose profile link is a person on file is placed at that
 *     person's company; a member's own profile places the member; the count and the honest message.
 *  3. Never by a name: a common name with no profile link, or with another profile link, matches
 *     nobody; a profile link on file at two companies places nobody (its records still give ways in).
 *  4. Privacy: a locked company matched from the file is a count only, never named; a Californian
 *     (by their own location, a record's or a member's) is never matched or named; the record's
 *     own locked values (title, email) never show; the state keeps no Sales Navigator id.
 *  5. Someone you know changed jobs: a names-only row says where someone was only when its profile
 *     link is a person on file at exactly one company.
 *  6. Suggested additions (RN_SUGGEST): names-only rows have no title or company, so they suggest
 *     nothing, and nothing breaks.
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and file in them is made up.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 900)}`);
};

const DAY = 86_400_000;
const MIN = 60_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-paths-li-"));

const co = (id: string, name: string, website: string, industry: string, employees: string, hq: string) => ({ id, fields: { name, website, industry, employees, hq } });
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@avery.example", title: "Fractional VP Sales", token: "tok-jordan-li-0001" },
    { id: "mem_casey", name: "Casey Vale", email: "casey@vale.example", title: "Fractional CMO", token: "tok-casey-li-0001" },
    { id: "mem_rio", name: "Rio Grant", email: "rio@grant.example", title: "Fractional CFO", token: "tok-rio-li-0001" },
    { id: "mem_bo", name: "Bo Other", email: "bo@other.example", title: "Fractional COO", token: "tok-bo-li-0001" },
  ],
  companies: [
    co("c_north", "Northwind Clinics", "northwind.example", "Hospitals and Health Care", "51-200", "Denver, CO"),
    co("c_cedar", "Cedar and Pine", "cedarpine.example", "Software Development", "11-50", "Austin, TX"),
    co("c_halcyon", "Halcyon Freight", "halcyon.example", "Truck Transportation", "201-500", "Dallas, TX"),
    co("c_lark", "Larkspur Learning", "larkspur.example", "E-Learning Providers", "51-200", "Boston, MA"),
  ],
  engagements: [
    // Casey (a member, in the Fractionals directory) holds Larkspur's Marketing seat now.
    { id: "e_lark_mkt", companyId: "c_lark", fields: { source: "Published engagement", function: "Marketing", role: "Fractional CMO", operator: "Casey Vale", start: "2025-03", status: "Active", type: "Fractional" } },
  ],
  contacts: [
    // Northwind's decision maker, with her LinkedIn on file (locked: 1 credit) and her email (locked).
    { id: "p_north_dana", companyId: "c_north", source: "Published engagement", fields: { name: "Dana Reyes", title: "CEO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/dana-reyes-nw/", email: "dana.reyes@northwind.example" } },
    // Halcyon's (locked for Jordan) operations lead.
    { id: "p_halcyon_alex", companyId: "c_halcyon", source: "Published engagement", fields: { name: "Alex Kim", title: "VP Operations", relationship: "Decision maker", linkedin: "linkedin.com/in/alex-kim-hf" } },
    // Someone at Cedar whose own location is California: never matched, never named.
    { id: "p_cedar_sky", companyId: "c_cedar", source: "Published engagement", fields: { name: "Sky Moss", title: "CFO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/sky-moss-cp", location: "San Diego, California" } },
    // One profile on file at two companies: precise about the person, not about where they are.
    { id: "p_lark_robin", companyId: "c_lark", source: "Published engagement", fields: { name: "Robin Hale", title: "COO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/robin-hale-x" } },
    { id: "p_cedar_robin", companyId: "c_cedar", source: "Published engagement", fields: { name: "Robin Hale", title: "Advisor", relationship: "Worked with", linkedin: "https://www.linkedin.com/in/robin-hale-x" } },
    // A common name on file with no profile link: a row with the same name never matches it.
    { id: "p_north_pat", companyId: "c_north", source: "Published engagement", fields: { name: "Pat Lee", title: "COO", relationship: "Decision maker" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const T1 = new Date(NOW - 10 * MIN).toISOString();
const fnRec = (name: string, title: string) => ({ level: "VP", kind: "full-time", how: "team page", url: "https://x.example/team", seenAt: T1, name, title });
const state = {
  ledger: [],
  values: {},
  // Jordan opened Northwind, Cedar and Pine and Larkspur. Halcyon stays locked for them.
  unlocks: { "c_north.identity": ["mem_jordan"], "c_cedar.identity": ["mem_jordan"], "c_lark.identity": ["mem_jordan"] },
  seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
  profiles: {
    mem_jordan: { function: "Sales", onboarded: true },
    // Casey's own profile keeps her LinkedIn (the operator list reads it, lib/paths/operators.ts).
    mem_casey: { function: "Marketing", onboarded: true, fractionals: true, linkedin: "https://www.linkedin.com/in/casey-vale-fr" },
    // Rio is based in California by her own profile: her link never matches.
    mem_rio: { function: "Finance", onboarded: true, fractionals: true, linkedin: "https://www.linkedin.com/in/rio-grant-ca", city: "Oakland, CA" },
  },
  // New leaders on the companies' own websites: Dana at Cedar and Pine, Robin at Halcyon, Sky at Larkspur.
  leaders: {
    c_cedar: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Sales: fnRec("Dana Reyes", "VP Sales") } },
    c_halcyon: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Operations: fnRec("Robin Hale", "VP Operations") } },
    c_lark: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Finance: fnRec("Sky Moss", "VP Finance") } },
  },
  leaderArrivals: [
    { companyId: "c_cedar", fn: "Sales", kind: "full-time", level: "VP", at: T1 },
    { companyId: "c_halcyon", fn: "Operations", kind: "full-time", level: "VP", at: T1 },
    { companyId: "c_lark", fn: "Finance", kind: "full-time", level: "VP", at: T1 },
  ],
};
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

const NAMES_ONLY = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  "",
  "First Name,Last Name,URL,Connected On",
  "Dana,Reyes,https://www.linkedin.com/in/dana-reyes-nw,12 Mar 2024",
  "Alex,Kim,https://www.linkedin.com/in/Alex-Kim-HF/,02 Jan 2025",
  "Sky,Moss,https://www.linkedin.com/in/sky-moss-cp,10 Oct 2023",
  "Robin,Hale,https://www.linkedin.com/in/robin-hale-x,01 Aug 2022",
  "Pat,Lee,,01 Jan 2020",
  "Pat,Lee,https://www.linkedin.com/in/pat-lee-elsewhere,05 May 2021",
  "Casey,Vale,https://www.linkedin.com/in/casey-vale-fr,03 Mar 2023",
  "Rio,Grant,https://www.linkedin.com/in/rio-grant-ca,04 Apr 2024",
  "Morgan,Blake,https://www.linkedin.com/sales/lead/ACwAAAbcdefghijklmnopqrstuvwx,07 Jul 2024",
  "Jo,Park,https://www.linkedin.com/in/ACoAABcdefghijklmnopqrstuvwxyz,08 Aug 2024",
  "Lou,Grant,https://www.linkedin.com/in/lou-grant-nobody,09 Sep 2024",
].join("\r\n");
const OLD_STYLE = [
  "Notes:",
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Dana,Reyes,https://www.linkedin.com/in/dana-reyes-nw,,Northwind Clinics,CEO,12 Mar 2024",
  "Pat,Lee,,,Larkspur Learning,Director,01 Jan 2020",
].join("\n");

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_FREE_COMPANY: "off",
  RN_ID_SECRET: "test-id-secret-not-real",
});
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RN_GOOGLE", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL", "RN_LOCKED_MATCHES", "RN_SUGGEST", "RN_PATHS", "RN_ADMIN_EMAILS"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;

const JORDAN = "tok-jordan-li-0001";
const BO = "tok-bo-li-0001";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");

async function main() {
  const csv = await import("../lib/paths/csv.ts");
  const M = await import("../lib/paths/match.ts");
  const types = await import("../lib/paths/types.ts");

  /* ---------- 1. the file ---------- */
  console.log("\nThe file");
  const r = csv.parseConnections(NAMES_ONLY);
  check("a names-only file (First Name, Last Name, URL, Connected On) reads", r.ok && r.rows.length === 11, r);
  if (!r.ok) throw new Error("the names-only file didn't read");
  check("and says it is names-only", r.namesOnly === true);
  const row = (f: string, l: string) => r.rows.filter((x) => x.f === f && x.l === l);
  check("each row keeps the name, the profile's slug (lower case, no slash) and the day connected, nothing else", JSON.stringify(row("Alex", "Kim")) === JSON.stringify([{ f: "Alex", l: "Kim", d: "2025-01-02", u: "alex-kim-hf" }]), row("Alex", "Kim"));
  check("a Sales Navigator link or a LinkedIn internal id is never kept as a profile", row("Morgan", "Blake")[0]?.u === undefined && row("Jo", "Park")[0]?.u === undefined, [row("Morgan", "Blake"), row("Jo", "Park")]);
  check("the same common name twice (one with a profile link) stays two rows", row("Pat", "Lee").length === 2);
  const old = csv.parseConnections(OLD_STYLE);
  check("an older file with companies still reads as before", old.ok && old.namesOnly === false && old.rows[0].c === "Northwind Clinics" && old.rows[0].p === "CEO", old);
  const emptyCo = csv.parseConnections("First Name,Last Name,URL,Email Address,Company,Position,Connected On\nDana,Reyes,https://www.linkedin.com/in/dana-reyes-nw,,,,12 Mar 2024");
  check("a file with a Company column but no company or email in any row is names-only too", emptyCo.ok && emptyCo.namesOnly === true);
  const noCoNoUrl = csv.parseConnections("First Name,Last Name,Connected On\nDana,Reyes,12 Mar 2024");
  check("a file with neither a Company nor a URL column is refused, and the words say what it needs", !noCoNoUrl.ok && noCoNoUrl.problem === "not-connections" && /First Name and Last Name columns, and a URL or Company column/.test(csv.CSV_PROBLEM_WORDS["not-connections"]), noCoNoUrl);
  const urlOnly = csv.parseConnections("First Name,Last Name,URL\nDana,Reyes,https://www.linkedin.com/in/dana-reyes-nw");
  const coOnly = csv.parseConnections("First Name,Last Name,Company\nDana,Reyes,Northwind Clinics");
  check("First and Last Name with a URL alone, or a Company alone, read", urlOnly.ok && urlOnly.namesOnly && coOnly.ok && !coOnly.namesOnly);
  check("a profile on file and the member's file read as the same slug", M.slugOf("https://www.linkedin.com/in/Alex-Kim-HF/") === csv.profileSlug("https://www.linkedin.com/in/Alex-Kim-HF/") && M.slugOf("linkedin.com/in/alex-kim-hf") === "alex-kim-hf" && M.slugOf("alex-kim-hf") === "alex-kim-hf");
  check("a Sales Navigator id is never a slug on either side", M.slugOf("ACwAAAbcdefghijklmnopqrstuvwx") === null && M.slugOf("https://www.linkedin.com/in/ACoAABcdefghijklmnopqrstuvwxyz") === null && csv.profileSlug("https://www.linkedin.com/sales/lead/ACwAAAbcdefghijklmnopqrstuvwx") === undefined);

  /* ---------- 2. the import and the profile-link match ---------- */
  const P = await import("../lib/paths/index.ts");
  const W = await import("../lib/paths/ways.ts");
  const t = await import("../lib/table.ts");
  const KV = await import("../lib/notify/knownView.ts");
  const known = await import("../lib/notify/known.ts");
  const pub = (id: string) => t.tableInternals.pubId(id);
  const view = async (tok = JORDAN) => (await P.pathsView(tok)) as import("../lib/paths/types.ts").PathsView;
  const knownV = async (tok = JORDAN) => (await P.knownView(tok)) as import("../lib/paths/types.ts").KnownView;
  const at = async (id: string, tok = JORDAN) => ((await P.companyPaths(tok, pub(id))) as import("../lib/paths/types.ts").CompanyPathsView).paths;

  console.log("\nThe import, matched by profile link");
  const im = await P.importConnections(JORDAN, NAMES_ONLY);
  const words = types.namesOnlyWords(4, false);
  check("the message says it plainly, with the count Merlin matched by profile link", im.message === `Added 11 connections. Only you see them. ${words}`, im.message);
  check("the words are the owner's", words === "This file has names and profile links only: LinkedIn stopped including companies, titles and emails in December 2026. Merlin matched 4 by profile link. For more ways in, add a contacts file (from Google Contacts, Outlook, your phone or a CRM).");
  check("with Google set up, it offers Google too; with none matched, it says none", types.namesOnlyWords(1, true).endsWith("add a contacts file (from Google Contacts, Outlook, your phone or a CRM) or connect Google.") && types.namesOnlyWords(0, false).includes("Merlin matched none by profile link."));
  const v1 = await view();
  check("the page's counts: rows, names-only, matched by profile link (Dana, Alex, Robin, Casey), at companies (Dana, Alex)", v1.linkedin?.rows === 11 && v1.linkedin.namesOnly === true && v1.linkedin.byLink === 4 && v1.linkedin.matched === 2, v1.linkedin);
  const north = await at("c_north");
  const danaN = north.find((p) => p.via.name === "Dana Reyes");
  check("Dana's profile link is Northwind's decision maker: a 1st degree way in there, in the member's own words", !!danaN && danaN.degree === 1 && danaN.kind === "leads" && danaN.via.src.includes("linkedin") && danaN.via.title === null, north.map((p) => `${p.kind}:${p.via.name}`));
  check("the way in carries the member's own profile link, never the record's email", danaN?.via.linkedin === "https://www.linkedin.com/in/dana-reyes-nw" && danaN?.via.email === null);
  const lark = await at("c_lark");
  check("Casey's profile link is a member's own: the seat she holds at Larkspur is a way in", lark.some((p) => p.via.name === "Casey Vale" && p.kind === "seat" && p.via.member), lark.map((p) => `${p.kind}:${p.via.name}`));
  const k1 = await knownV();
  const kDana = k1.people.find((p) => p.name === "Dana Reyes");
  check("People I know: Dana at Northwind, with no title (the record's is locked) and no email", !!kDana && kDana.company === pub("c_north") && kDana.title === null && kDana.email === null && kDana.record === pub("p_north_dana"), kDana);
  check("People I know: Casey, the member", k1.people.some((p) => p.name === "Casey Vale" && p.member === pub("mem_casey")));

  /* ---------- 3. never by a name ---------- */
  console.log("\nNever by a name");
  const allNow = JSON.stringify([v1, k1, ...(await Promise.all(Object.keys(v1.counts).map((id) => P.companyPaths(JORDAN, id))))]);
  check("a common name with no profile link (Pat Lee, on file at Northwind) matches nobody", !allNow.includes("Pat Lee"), allNow.match(/.{60}Pat Lee.{60}/)?.[0]);
  check("someone with a profile link nobody on file has (Lou Grant) is left out", !allNow.includes("Lou Grant"));
  check("one profile on file at two companies places Robin nowhere: not in People I know", !k1.people.some((p) => p.name === "Robin Hale"));
  check("but the records are that one person: Robin is a way in where he decides (Larkspur)", lark.some((p) => p.via.name === "Robin Hale" && p.kind === "leads"), lark.map((p) => `${p.kind}:${p.via.name}`));

  /* ---------- 4. privacy ---------- */
  console.log("\nPrivacy");
  check("a locked company the file matched (Halcyon, through Alex) is a count only", v1.lockedWays >= 1 && !(pub("c_halcyon") in v1.counts) && k1.locked === 1 && !k1.people.some((p) => p.name === "Alex Kim"), { lockedWays: v1.lockedWays, locked: k1.locked });
  const warm = await W.warmView(JORDAN);
  const answers = JSON.stringify([v1, k1, warm, ...(await Promise.all(Object.keys(v1.counts).map((id) => P.companyPaths(JORDAN, id))))]);
  check("the locked company is never named, nor the person matched there", !answers.includes("Halcyon") && !answers.includes("Alex Kim") && !answers.includes("alex-kim-hf"), answers.match(/.{60}(Halcyon|Alex Kim).{60}/)?.[0]);
  check("a Californian (by the record's own location) is never matched or named: Sky", !answers.includes("Sky Moss") && !answers.includes("sky-moss-cp"));
  check("a member based in California is never matched or named: Rio", !answers.includes("Rio Grant") && !answers.includes("rio-grant-ca"));
  check("the matched record's locked email and title never show", !answers.includes("dana.reyes@northwind.example") && !/"title":"CEO"/.test(answers));
  check("Bo sees nothing of Jordan's", (await view(BO)).linkedin === null && Object.keys((await view(BO)).counts).length === 0 && (await knownV(BO)).people.length === 0);
  check("the state keeps no Sales Navigator id", !/ACwAA|ACoAA/i.test(stateFile()));
  process.env.RN_LOCKED_MATCHES = "show";
  const shown = await view();
  check("with RN_LOCKED_MATCHES=show, the locked company's way in shows by its facts, still never its name", pub("c_halcyon") in shown.counts && !JSON.stringify(await at("c_halcyon")).includes("Halcyon"), Object.keys(shown.counts));
  delete process.env.RN_LOCKED_MATCHES;

  /* ---------- 5. someone you know changed jobs ---------- */
  console.log("\nSomeone you know changed jobs");
  const seedNow = await t.loadSeed();
  const sNow = await t.loadState();
  const g = t.tableInternals.graph(seedNow, sNow);
  const jordan = (await t.memberById("mem_jordan"))!;
  const people = KV.knownPeopleOf(sNow, jordan, g);
  const place = (f: string) => people.find((p) => p.src === "linkedin" && p.name.startsWith(f))?.companyId ?? null;
  check("Dana's profile link is a person on file at exactly one company: her row says where she was (Northwind)", place("Dana") === "c_north");
  check("Robin's is on file at two companies: his row says nothing", place("Robin") === null);
  check("Sky's record is in California: her row says nothing", place("Sky") === null);
  check("without the graph (as before), a row with no company says nothing", KV.knownPeopleOf(sNow, jordan).every((p) => p.companyId === null || p.src !== "linkedin"));
  const kv = KV.knownOf(seedNow, sNow, jordan, NOW);
  check("Dana, at Northwind by her profile link, is a new Sales leader at Cedar and Pine (open for Jordan): said", kv.list.some((x) => x.line === "Dana Reyes, someone you know, is a new Sales leader at Cedar and Pine"), kv.list);
  check("Robin (two companies) and Sky (California) are never said", !kv.list.some((x) => /Robin|Sky/.test(x.line)) && kv.list.length === 1, kv.list);
  check("knownMoves itself: a row placed nowhere says nothing", known.knownMoves([{ name: "Dana Reyes", nameKey: "dana reyes", companyId: null, company: null, src: "linkedin" }], [{ key: "k", companyId: "c_cedar", companyName: "Cedar and Pine", nameKey: "dana reyes", fn: "Sales", at: T1, californian: false }], null).length === 0);

  /* ---------- 6. suggested additions ---------- */
  console.log("\nSuggested additions (RN_SUGGEST)");
  process.env.RN_SUGGEST = "on";
  const S = await import("../lib/paths/suggest.ts");
  const sv = await S.suggestView(JORDAN);
  check("names-only rows have no title or company: they suggest nothing, and nothing breaks", !!sv && sv.on === true && sv.rows.length === 0 && sv.locked === 0, sv);
  delete process.env.RN_SUGGEST;

  /* ---------- the old file again, and delete ---------- */
  console.log("\nAn older file, and delete");
  const im2 = await P.importConnections(JORDAN, OLD_STYLE);
  check("an older file's message is as before", im2.message === "Added 2 connections. Only you see them.", im2.message);
  const v2 = await view();
  check("and the page says it is not names-only, its companies matched by name as before", v2.linkedin?.namesOnly === false && v2.linkedin.byLink === 0 && v2.linkedin.matched === 2, v2.linkedin);
  // A names-only file over the older one keeps what the older one said, by profile link only.
  const im3 = await P.importConnections(JORDAN, NAMES_ONLY);
  const kept = ((await t.loadState()) as unknown as { paths: Record<string, { linkedin?: { rows: { f: string; u?: string; c?: string; p?: string }[]; namesOnly?: boolean } }> }).paths;
  const rows3 = Object.values(kept).flatMap((x) => x.linkedin?.rows ?? []);
  const dana = rows3.find((x) => x.u && /dana-reyes-nw/i.test(x.u));
  const patNoLink = rows3.filter((x) => x.f === "Pat" && !x.u);
  check("a names-only file over an older one keeps the older company and title for the same profile link", !!im3 && dana?.c === "Northwind Clinics" && dana?.p === "CEO", dana);
  check("  never by name: a row with no link keeps nothing from the older file", patNoLink.every((x) => !x.c && !x.p), patNoLink);
  await P.deleteConnections(JORDAN);
  check("delete takes the file and its matches", (await view()).linkedin === null && !(await knownV()).people.some((p) => p.src.includes("linkedin")));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
