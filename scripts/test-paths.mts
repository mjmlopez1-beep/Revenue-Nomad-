/**
 * Checks of Smart ways in (lib/paths): the member's LinkedIn import, the path finder and where it
 * shows, and its privacy.
 *
 *   npx tsx scripts/test-paths.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and file in them is made up.
 *
 *  1. Connections.csv: LinkedIn's notes before the header, quotes, line breaks in a field, CRLF,
 *     dates, empty and duplicate rows, the whole archive or another file refused.
 *  2. Matching: names (accents, credentials, initials), companies (exact, legal suffix, ambiguous,
 *     generic, partial), a name alone never matches.
 *  3. Each kind of path found (leads, hired, seat, works, overlap, colleague, prevco, client) and
 *     ranked: every 1st degree above every 2nd, warmer and newer first.
 *  4. Weak matches refused: a name at another company, an initial, a shared name, a part of a name,
 *     a hidden public-profile name, the member's own client.
 *  5. The words: a locked company is "this company", a bridge the member can't see is its kind, the
 *     person on the other side is never named, the note is in the member's voice.
 *  6. Your hidden paths: saved-view targets, best first.
 *  7. Privacy: another member sees nothing, the table, the admin export and the connector carry no
 *     contact names and never a person key, the daily upload limit.
 *  7b. Disconnect and delete everything on Your network: the ways in through Google go, the
 *     LinkedIn import and its ways in stay (it has its own Delete).
 *  8. Delete removes everything derived from the file. RN_GOOGLE off: nothing.
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
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-paths-"));

/* ---------- the made-up world ---------- */
const co = (id: string, name: string, website: string, industry = "SaaS", employees = "51–200") => ({ id, fields: { name, website, industry, employees } });
const seat = (id: string, companyId: string, fn: string, operator: string, start: string, end: string | null, holderKey?: string, more: Record<string, unknown> = {}) => ({
  id,
  companyId,
  fields: { source: "Published engagement", function: fn, role: `Fractional ${fn} Lead`, operator, start, ...(end ? { end, status: "Ended" } : { status: "Active" }), type: "Fractional" },
  ...(holderKey ? { holderKey } : {}),
  ...more,
});
const fillers = Array.from({ length: 20 }, (_, i) => co(`c_fill${i}`, `Filler Works ${i}`, `fill${i}.example`, "Retail", "11–50"));
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_ana", name: "Ana Member", email: "ana.member@anaco.example", title: "Fractional CRO", token: "tok-ana-0001" },
    { id: "mem_bo", name: "Bo Other", email: "bo.other@example.org", title: "Fractional CMO", token: "tok-bo-0001" },
    { id: "mem_sam", name: "Sam Ortiz", email: "sam.ortiz@example.net", title: "Fractional CMO", token: "tok-sam-0001" },
    { id: "mem_kai", name: "Kai Lane", email: "kai.lane@example.org", title: "Fractional COO", token: "tok-kai-0001" },
    { id: "mem_ad", name: "Ada Admin", email: "ada.admin@example.com", title: "Fractional CTO", token: "tok-ad-0001" },
  ],
  companies: [
    co("c_acme", "Acme Robotics", "acme.example"),
    co("c_bright", "Brightloop", "brightloop.example"),
    co("c_north", "Northwind Labs", "northwind.example", "Fintech", "11–50"),
    co("c_cedar", "Cedar Health", "cedar.example", "Healthcare"),
    co("c_dune", "Dune Analytics", "dune.example", "SaaS", "11–50"),
    co("c_fig", "Fig Logistics", "fig.example", "Logistics", "201–500"),
    co("c_elm", "Elm Street Foods", "elm.example", "Consumer Goods", "51–200"),
    co("c_gale", "Gale Systems", "gale.example"),
    co("c_hollow", "Hollow Peak", "hollow.example", "Fintech", "51–200"),
    co("c_ivy", "Ivy Works", "ivyworks.example"),
    co("c_twin1", "Twin Name", "twin-one.example"),
    co("c_twin2", "Twin Name", "twin-two.example"),
    ...fillers,
  ],
  engagements: [
    // Riley holds Acme's RevOps seat now and held Brightloop's before (one person through the private key).
    seat("e_acme_revops", "c_acme", "RevOps", "Riley Stone", "2025-01", null, "p_rileyfake01"),
    seat("e_bright_revops", "c_bright", "RevOps", "Riley Stone", "2022-06", "2023-09", "p_rileyfake01"),
    // Dana held Brightloop's Sales seat at the same time, and holds Northwind's now.
    seat("e_bright_sales", "c_bright", "Sales", "Dana Reyes", "2023-01", "2024-03", "p_danafake01"),
    seat("e_north_sales", "c_north", "Sales", "Dana Reyes", "2024-04", null, "p_danafake01"),
    // Quinn held Acme's Sales seat years ago and holds Northwind's Marketing seat now.
    seat("e_acme_sales_old", "c_acme", "Sales", "Quinn Hart", "2021-03", "2022-02", "p_quinnfake01"),
    seat("e_north_mkt", "c_north", "Marketing", "Quinn Hart", "2024-09", null, "p_quinnfake01"),
    // Pat holds Cedar's Finance seat.
    seat("e_cedar_fin", "c_cedar", "Finance", "Pat Sample", "2025-03", null, "p_patfake0001"),
    // Jamie holds a seat at Dune: a contact named Jamie Fox at Cedar is not them.
    seat("e_dune_ops", "c_dune", "Operations", "Jamie Fox", "2024-01", null, "p_jamiefake01"),
    // The seat Morgan hired for at Dune.
    seat("e_dune_cmo", "c_dune", "Marketing", "Lou Grant", "2024-05", null, "p_loufake0001"),
    // Ana's own seats: a past one at Elm (a shared client with Sam), and her client now, Ivy Works.
    seat("e_elm_sales_ana", "c_elm", "Sales", "Ana Member", "2022-01", "2023-06"),
    seat("e_ivy_sales_ana", "c_ivy", "Sales", "Ana Member", "2025-06", null),
    // Sam (in the Fractionals directory) worked with Elm too, and holds Gale's Marketing seat now.
    seat("e_elm_mkt_sam", "c_elm", "Marketing", "Sam Ortiz", "2022-05", "2023-02"),
    seat("e_gale_mkt_sam", "c_gale", "Marketing", "Sam Ortiz", "2025-02", null),
    // Kai (a member Ana messaged) holds Hollow Peak's Operations seat.
    seat("e_hollow_ops_kai", "c_hollow", "Operations", "Kai Lane", "2025-04", null),
    // A name from public profiles, hidden by the admins' switch: nobody matches it.
    seat("e_gale_fin_pub", "c_gale", "Finance", "Toni Vega", "2024-02", null, "p_tonifake001", { holderFrom: "public profile" }),
  ],
  contacts: [
    { id: "p_acme_jordan", companyId: "c_acme", source: "Published engagement", fields: { name: "Jordan Vale", title: "CEO", relationship: "Decision maker", linkedin: "https://www.linkedin.com/in/jordan-vale-fake" } },
    { id: "p_fig_jordan", companyId: "c_fig", source: "Published engagement", fields: { name: "Jordan Vale", title: "COO", relationship: "Worked with", linkedin: "linkedin.com/in/jordan-vale-fake/" } },
    { id: "p_dune_morgan", engagementId: "e_dune_cmo", source: "Published engagement", fields: { name: "Morgan Blake", title: "Head of Marketing", relationship: "Hiring for the seat", linkedin: "https://www.linkedin.com/in/morgan-blake-dune" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const recent = (d: number) => ago(d).slice(0, 10);
const months = (n: number) => Array.from({ length: n }, (_, i) => new Date(NOW - (n - 1 - i) * 30.44 * DAY).toISOString().slice(0, 7));
const state = {
  ledger: [],
  values: {},
  unlocks: {},
  seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
  profiles: { mem_ana: { function: "Sales", title: "Fractional CRO", onboarded: true }, mem_sam: { fractionals: true, onboarded: true } },
  names: { hide: true },
  // Ana's Crystal Ball today: Cedar and Dune (kept rows, lib/radar/types.ts RadarSentRow).
  radar: {
    lastRunAt: null,
    lastRunDay: null,
    members: { mem_ana: { sent: {}, days: { [new Date(NOW).toISOString().slice(0, 10)]: ["c_cedar", "c_dune"].map((c) => ({ k: `test:mem_ana:${c}`, c, kind: "role", l: "New open role: Fractional VP Sales · In your function", b: "High", w: "Hiring now" })) } } },
    stats: { runs: 0, sent: 0, emails: 0, slack: 0, instant: 0 },
  },
  connector: { alerts: { mem_ana: [{ id: "al_test1", name: "SaaS 51-200", industry: ["SaaS"], employees: ["51–200"], createdAt: ago(10) }] } },
  conversations: [
    { id: "cv_1", a: "mem_ana", b: "mem_kai", about: { companyId: "", engagementId: "" }, kind: "partners", messages: [{ id: "mg_1", by: "mem_ana", at: ago(20), text: "Made-up hello" }], readAt: {}, status: "open", createdAt: ago(21) },
  ],
  // Ana's own Google network: Rae at Northwind, met often lately.
  network: {
    mem_ana: {
      cal: {
        at: ago(1),
        companies: {
          c_north: { domain: "northwind.example", meetings: 6, first: recent(150), last: recent(5), months: months(5), people: [{ key: "rae@northwind.example", email: "rae@northwind.example", name: "Rae Kim", title: "COO", meetings: 6, first: recent(150), last: recent(5), src: ["calendar"] }] },
        },
        unmatched: 0,
        real: 1,
      },
    },
  },
};
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

const CSV = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing. You will only see email addresses for connections who have allowed their connections to see or download their email address using this setting https://www.linkedin.com/psettings/privacy/email. You can learn more about this here: https://www.linkedin.com/help/linkedin/answer/261"',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Dana,Reyes,https://www.linkedin.com/in/dana-reyes-fake,,Northwind Labs,Fractional Sales Lead,12 Mar 2023",
  "Lee,Park,https://www.linkedin.com/in/lee-park-fake,,\"Acme Robotics, Inc.\",VP Sales,02 Jan 2026",
  'Pat,"Sample, CPA",https://www.linkedin.com/in/pat-sample-fake,,Cedar Health,"Fractional CFO, Cedar",15 Jun 2022',
  "Morgan,Blake,https://www.linkedin.com/in/morgan-blake-dune/,,Dune Analytics,Head of Marketing,20 Feb 2021",
  "Casey,Fox,https://www.linkedin.com/in/casey-fox-fake,,Fig Logistics,Operations Manager,01 Aug 2020",
  "Riley,Stone,https://www.linkedin.com/in/riley-stone-fake,,Stone Consulting,Founder,10 Oct 2019",
  "Dana,R.,,,Brightloop,Sales,01 Jan 2020",
  "Quinn,Hart,,,Twin Name,Advisor,01 Jan 2021",
  "Ali,Brook,,,Acme,Engineer,01 Jan 2021",
  "Jamie,Fox,,,Cedar Health,Nurse Manager,01 Jan 2021",
  "Toni,Vega,,,Gale Systems,Controller,01 Jan 2022",
  "Ivy,Chen,,,Ivy Works,CEO,01 Jan 2022",
  "Sky,Moss,,,Brightloop,\"Head of\nGrowth\",1/15/23",
  ",,,,,,",
  "Dana,Reyes,https://www.linkedin.com/in/dana-reyes-fake,,Northwind Labs,Fractional Sales Lead,12 Mar 2023",
  'Kai "KJ",Lane,,kai.lane@example.org,Hollow Peak,"Partner, Growth",2024-03-03',
  "José,Núñez,,,Brightloop Inc.,Account Executive,5 May 2025",
].join("\r\n");

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_GOOGLE: "1",
});
for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL"]) delete process.env[k];

const ANA = "tok-ana-0001";
const BO = "tok-bo-0001";
const ORIGIN = "https://post.example.com";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");

async function main() {
  const csv = await import("../lib/paths/csv.ts");
  const M = await import("../lib/paths/match.ts");
  const types = await import("../lib/paths/types.ts");

  /* ---------- 1. the file ---------- */
  console.log("\nConnections.csv");
  const r = csv.parseConnections(CSV);
  check("reads past LinkedIn's notes to the header", r.ok, r);
  if (!r.ok) throw new Error("the file didn't read");
  const byName = (f: string, l?: string) => r.rows.find((x) => x.f === f && (l === undefined || x.l === l));
  check("every person with a first and last name, once (the duplicate and the empty row skipped)", r.rows.length === 15 && r.skipped === 1, { n: r.rows.length, skipped: r.skipped });
  check("a quoted company with a comma", byName("Lee")?.c === "Acme Robotics, Inc.");
  check("a line break inside a quoted field", byName("Sky")?.p === "Head of Growth", byName("Sky"));
  check("doubled quotes inside a field", byName('Kai "KJ"')?.l === "Lane", r.rows.find((x) => x.l === "Lane"));
  check("dates: 12 Mar 2023, 1/15/23, 2024-03-03", byName("Dana", "Reyes")?.d === "2023-03-12" && byName("Sky")?.d === "2023-01-15" && byName('Kai "KJ"')?.d === "2024-03-03");
  check("the profile's slug, the email when LinkedIn gave one", byName("Morgan")?.u === "morgan-blake-dune" && byName('Kai "KJ"')?.e === "kai.lane@example.org" && !byName("Lee")?.e);
  check("a BOM and LF line endings read the same", (() => {
    const x = csv.parseConnections(`﻿${CSV.replace(/\r\n/g, "\n")}`);
    return x.ok && x.rows.length === r.rows.length && JSON.stringify(x.rows) === JSON.stringify(r.rows);
  })());
  const zip = csv.parseConnections("PK\u0003\u0004 not a csv");
  const other = csv.parseConnections("Name,Email\nA,b@c.example");
  const empty = csv.parseConnections("   ");
  const noRows = csv.parseConnections("Notes:\n\nFirst Name,Last Name,URL,Email Address,Company,Position,Connected On\n");
  check("the whole archive, another file, an empty file and a header alone are refused with why", !zip.ok && zip.problem === "zip" && !other.ok && other.problem === "not-connections" && !empty.ok && empty.problem === "empty" && !noRows.ok && noRows.problem === "no-rows");
  check("records keep quotes, commas and CRLF apart", JSON.stringify(csv.csvRecords('a,"b,c","d""e"\r\nf,"g\nh",')) === JSON.stringify([["a", "b,c", 'd"e'], ["f", "g\nh", ""]]));

  /* ---------- 2. matching ---------- */
  console.log("\nMatching people and companies");
  check("names fold accents, case, credentials, pronouns and middle names", M.personKey("Dana Q. Reyes, MBA (she/her)") === "dana reyes" && M.personKey("DANA REYES") === "dana reyes" && M.personKey("José Núñez") === "jose nunez");
  check("a one-word name or a last initial matches nobody", M.personKey("Dana") === null && M.personKey("Dana R.") === null);
  const C = await import("../lib/google/compute.ts");
  const d0 = C.makeDirectory(seed.companies.map((c) => ({ id: c.id, website: c.fields.website, name: c.fields.name })));
  check("a company by its exact name, legal suffix aside", C.matchOrg(d0, "Acme Robotics, Inc.") === "c_acme" && C.matchOrg(d0, "Brightloop Inc.") === "c_bright");
  check("a part of a name, a generic word or a name two companies share matches nothing", C.matchOrg(d0, "Acme") === null && C.matchOrg(d0, "Consulting") === null && C.matchOrg(d0, "Twin Name") === null);
  check("operators come from Merlin's members for now (lib/paths/operators.ts)", (await import("../lib/paths/operators.ts")).operatorSourceName() === "members");

  /* ---------- 3. the paths ---------- */
  const P = await import("../lib/paths/index.ts");
  const t = await import("../lib/table.ts");
  const tools = await import("../lib/mcp/tools.ts");
  const member = async (id: string) => (await t.memberById(id))!;
  const pub = (id: string) => t.tableInternals.pubId(id);
  const view = async (tok = ANA) => (await P.pathsView(tok)) as import("../lib/paths/types.ts").PathsView;
  const at = async (id: string, tok = ANA) => ((await P.companyPaths(tok, pub(id))) as import("../lib/paths/types.ts").CompanyPathsView).paths;

  console.log("\nBefore the import: Google and messages only");
  const v0 = await view();
  check("no LinkedIn yet", v0.on && v0.linkedin === null && v0.importsLeft === 3);
  check("Rae (Google) is already a way into Northwind", (await at("c_north")).some((p) => p.via.name === "Rae Kim" && p.kind === "leads"));
  check("Kai, a member Ana messaged, holds Hollow Peak's seat: a 1st degree way in", (await at("c_hollow")).some((p) => p.via.name === "Kai Lane" && p.kind === "seat" && p.degree === 1 && p.via.src.includes("messages")), await at("c_hollow"));

  console.log("\nThe import");
  const im = await P.importConnections(ANA, CSV);
  check("kept for Ana, with the count", /^Added 15 connections\. Only you see them\.$/.test(im.message), im.message);
  const v1 = await view();
  check("what the page says: rows, the ones at companies on Merlin", v1.linkedin?.rows === 15 && v1.linkedin.matched >= 10, v1.linkedin);

  const acme = await at("c_acme");
  const kinds = (l: typeof acme) => l.map((p) => `${p.kind}:${p.via.name}`);
  console.log("  Acme:", kinds(acme).join(", "));
  check("leads: Lee Park, VP Sales at Acme (a LinkedIn connection), 1st degree, first", acme[0]?.kind === "leads" && acme[0].via.name === "Lee Park" && acme[0].degree === 1, kinds(acme));
  const overlap = acme.find((p) => p.kind === "overlap");
  check("overlap: Dana held a seat at Brightloop at the same time as Acme's RevOps lead", overlap?.via.name === "Dana Reyes" && overlap.degree === 2, kinds(acme));
  const colleague = acme.find((p) => p.kind === "colleague");
  check("colleague: Rae (Google) works at Northwind, where Acme's past Sales seat holder holds a seat now", colleague?.via.name === "Rae Kim" && /held this company's fractional Sales seat in 2021 holds a seat now/.test(colleague.line), colleague?.line);
  const prev = acme.find((p) => p.kind === "prevco" && p.via.name === "Casey Fox");
  const viaBright = acme.find((p) => p.kind === "prevco" && p.via.name === "José Núñez");
  check("prevco: Casey works at Fig, where one of Acme's leaders also worked (the same LinkedIn profile on both records)", prev?.via.name === "Casey Fox" && /where one of this company's leaders also worked/.test(prev.line), prev?.line);
  check("prevco: José works at Brightloop (his own company, so it is named), where Acme's RevOps lead held a seat in 2022", viaBright?.line === "José Núñez (your LinkedIn connection) works at Brightloop, where this company's fractional RevOps lead held a seat in 2022.", viaBright?.line);
  check("every 1st degree path above every 2nd, and the scores say so", acme.every((p, i) => i === 0 || acme[i - 1].score >= p.score) && Math.min(...acme.filter((p) => p.degree === 1).map((p) => p.score)) > Math.max(...acme.filter((p) => p.degree === 2).map((p) => p.score)));
  check("among 2nd degree, the lead there now through a recent overlap first; an old seat holder and a leader's old record after", acme.filter((p) => p.degree === 2)[0]?.kind === "overlap" && acme.findIndex((p) => p.kind === "overlap") < acme.findIndex((p) => p.via.name === "Rae Kim") && acme.findIndex((p) => p.via.name === "Rae Kim") < acme.findIndex((p) => p.via.name === "Casey Fox"), kinds(acme));
  check("Dana's best way to Acme is through Acme's lead now (Brightloop, 2023), not through an Acme seat that ended in 2022", /fractional RevOps lead at /.test(acme.find((p) => p.via.name === "Dana Reyes")!.line), acme.find((p) => p.via.name === "Dana Reyes")!.line);

  const cedar = await at("c_cedar");
  check("seat: Pat Sample (\"Sample, CPA\" on LinkedIn) holds Cedar's Finance seat now", cedar.some((p) => p.kind === "seat" && p.via.name === "Pat Sample" && /holds this company's fractional Finance seat now/.test(p.line)), cedar.map((p) => p.line));
  const dune = await at("c_dune");
  check("hired: Morgan Blake hired Dune's fractional Marketing lead (the same LinkedIn profile as the person on file)", dune.some((p) => p.kind === "hired" && p.via.name === "Morgan Blake" && /hired this company's fractional Marketing lead/.test(p.line)), dune.map((p) => p.line));
  const gale = await at("c_gale");
  const client = gale.find((p) => p.kind === "client");
  check("client: Sam Ortiz (Fractionals directory) and Ana both worked with Elm; Sam holds Gale's Marketing seat", !!client && client.via.name === "Sam Ortiz" && /^You and Sam Ortiz both worked with .+\. Sam holds this company's fractional Marketing seat now\.$/.test(client.line) && client.action === "Message Sam on Merlin. You share a client.", client);
  const bright = await at("c_bright");
  check("works and a past seat at Brightloop: Sky leads (Head of Growth), Dana held its Sales seat", bright.some((p) => p.via.name === "Sky Moss" && p.kind === "leads") && bright.some((p) => p.via.name === "Dana Reyes" && p.kind === "seat" && /held this company's fractional Sales seat in 2023/.test(p.line)), bright.map((p) => p.line));
  const north = await at("c_north");
  check("Kai on LinkedIn and Kai on Merlin are one person (the email): one way in at Hollow Peak", (await at("c_hollow")).filter((p) => p.via.name.includes("Kai")).length === 1 && (await at("c_hollow"))[0].via.src.includes("linkedin") && (await at("c_hollow"))[0].via.src.includes("messages"));
  check("Rae: Google warmth on the path", north.find((p) => p.via.name === "Rae Kim")?.via.warmth === "Hot", north.find((p) => p.via.name === "Rae Kim")?.via);

  /* ---------- 4. weak matches refused ---------- */
  console.log("\nWeak matches refused");
  const all = async () => {
    const v = await view();
    const out: import("../lib/paths/types.ts").PathView[] = [];
    for (const id of Object.keys(v.counts)) out.push(...((await P.companyPaths(ANA, id)) as import("../lib/paths/types.ts").CompanyPathsView).paths);
    return out;
  };
  const every = await all();
  check("Riley on LinkedIn at Stone Consulting is not Acme's Riley: no path through her", !every.some((p) => p.via.name === "Riley Stone"));
  check("Jamie Fox at Cedar is not the Jamie Fox who holds Dune's seat: a works path at Cedar only", every.filter((p) => p.via.name === "Jamie Fox").every((p) => p.kind === "works") && !dune.some((p) => p.via.name === "Jamie Fox"));
  check("\"Acme\" (a part of a name) and \"Twin Name\" (two companies) lead nowhere", !every.some((p) => p.via.name === "Ali Brook" || p.via.name === "Quinn Hart"));
  check("\"Dana R.\" (a last initial) works at Brightloop, but is never matched to Dana Reyes's seats", every.filter((p) => p.via.name === "Dana R.").every((p) => p.kind !== "seat" && p.kind !== "overlap") && !bright.some((p) => p.via.name === "Dana R." && p.kind === "seat"));
  check("a name from public profiles the switch hides matches nobody: Toni works at Gale, holds no seat there", gale.some((p) => p.via.name === "Toni Vega" && p.kind === "works") && !every.some((p) => p.via.name === "Toni Vega" && p.kind === "seat"));
  check("Ana's own client (Ivy Works) needs no way in", !(pub("c_ivy") in (await view()).counts));
  check("never a path through Ana herself", !every.some((p) => p.via.name === "Ana Member"));

  /* ---------- 5. the words ---------- */
  console.log("\nThe words");
  check("a company Ana can't see is \"this company\", never its name", !JSON.stringify(acme).includes("Acme"));
  check("a bridge Ana can't see is its kind", /^Dana Reyes \(your LinkedIn connection\) worked with this company's fractional RevOps lead at a SaaS company in 2023\.$/.test(overlap!.line), overlap!.line);
  check("the person on the other side is never named", !every.some((p) => /Riley|Quinn|Jordan|Lou Grant/.test(`${p.line} ${p.action} ${p.note.body}`)));
  check("one next action each", acme[0].action === "Write to Lee." && overlap!.action === "Ask Dana for an intro.");
  check("the note is the member's: her name, her title, no locked name", /^Hi Dana,\n\nQuick ask\. I'm a fractional CRO\./.test(overlap!.note.body) && /\n\nAna$/.test(overlap!.note.body), overlap!.note.body);
  await t.tableInternals.mutate((s) => {
    s.unlocks["c_acme.name"] = ["mem_ana"];
    (s as unknown as { voice: Record<string, unknown> }).voice = { mem_ana: { greeting: "Hey {first},", signoff: "Cheers,", name: "full", length: "short", formality: "casual", contractions: false, exclamations: "never", emoji: false, opener: "direct", phrases: [], at: ago(1), by: "you" } };
  });
  const acme2 = await at("c_acme");
  if (process.env.SHOW) for (const p of [...acme2, ...(await at("c_gale")), ...(await at("c_dune")), ...(await at("c_cedar"))]) console.log(`  ${p.score} ${p.strength} | ${p.line} | ${p.action}\n${p.note.subject}\n${p.note.body}\n`);
  check("once Ana can see Acme, it is named", acme2[0].line === "Lee Park (your LinkedIn connection) is VP Sales at Acme Robotics." && acme2.find((p) => p.kind === "overlap")!.line.includes("Acme Robotics' fractional RevOps lead"), acme2.map((p) => p.line));
  const n2 = acme2.find((p) => p.kind === "overlap")!.note.body;
  check("in her saved voice: Hey, Cheers, her full name, no contractions", n2.startsWith("Hey Dana,") && n2.endsWith("Cheers,\nAna Member") && !/I'm|I'd/.test(n2), n2);

  /* ---------- 6. Your hidden paths ---------- */
  console.log("\nYour hidden paths");
  const v2 = await view();
  const ids = v2.targets.map((x) => x.id);
  check("saved-view targets with a way in (SaaS 51–200): Acme and Gale", ids.includes(pub("c_acme")) && ids.includes(pub("c_gale")) && !ids.includes(pub("c_north")), v2.targets.map((x) => x.name ?? x.facts));
  check("best first: Acme (a 1st degree leader) before Gale", ids.indexOf(pub("c_acme")) < ids.indexOf(pub("c_gale")) || v2.targets[0].best.score >= v2.targets[1].best.score);
  const tAcme = v2.targets.find((x) => x.id === pub("c_acme"))!;
  check("each with its saved view, its best way and how many", tAcme.view === "SaaS 51-200" && tAcme.best.via.name === "Lee Park" && tAcme.count === acme2.length && tAcme.first === 1, tAcme);
  check("a target Ana can't see goes without its name", v2.targets.find((x) => x.id === pub("c_gale"))!.name === null);
  const ballT = v2.targets.filter((x) => x.ball).map((x) => x.id);
  check("Crystal Ball targets too: Cedar and Dune, marked as in her Crystal Ball", ballT.includes(pub("c_cedar")) && ballT.includes(pub("c_dune")) && ballT.length === 2, v2.targets.map((x) => [x.facts, x.ball, x.view]));
  check("every target has a way in; companies with none never show", v2.targets.every((x) => x.count > 0 && !!x.best) && !ids.includes(pub("c_fill0")));
  check("best first across all of them", v2.targets.every((x, i) => i === 0 || v2.targets[i - 1].best.score >= x.best.score));
  check("the counts say how many are 1st degree", v2.counts[pub("c_acme")].n === acme2.length && v2.counts[pub("c_acme")].first === 1);

  /* ---------- 6b. the specific ask: who someone can introduce Ana to ---------- */
  console.log("\nThe specific ask for an introduction");
  const plans = async (tok = ANA) => (await view(tok)).people;
  const planOf = async (key: string) => (await plans()).find((x) => x.keys.includes(key)) ?? null;
  if (process.env.SHOW) for (const x of await plans()) console.log(`  ${x.name} | ${x.strength} | ${x.why}\n${x.targets.map((t) => `    ${t.score} ${t.name ?? t.facts} | ${t.inWords} | ${t.how} | ${t.now ?? ""} | ${t.open ?? ""}`).join("\n")}`);
  const dana = await planOf("l:dana-reyes-fake");
  check("Dana (a LinkedIn connection) can introduce Ana to Acme, a company in her saved view", !!dana && dana.targets.some((x) => x.id === pub("c_acme") && x.inWords === "Saved view: SaaS 51-200"), dana);
  const danaAcme = dana!.targets.find((x) => x.id === pub("c_acme"))!;
  // Fellow fractionals are free once the company is open (PEERS_FREE): Ana sees Acme, so who holds its RevOps seat is named. The bridge she can't see is still its kind.
  check("who Dana worked with there is named once Ana sees the company (fellow fractionals are free), and the bridge she can't see is its kind", danaAcme.name === "Acme Robotics" && danaAcme.how === "Dana worked with Riley Stone at a SaaS company. Riley Stone holds Acme Robotics' fractional RevOps seat now.", danaAcme.how);
  const rae = await planOf("g:rae@northwind.example");
  check("how strong each relationship is, said plainly: Rae from Ana's own calendar, Dana from her LinkedIn file", !!rae && /^6 meetings since [A-Z][a-z]{2} \d{4}, last [A-Z][a-z]{2} \d+ · Strong$/.test(rae.strength) && /^LinkedIn connection since 2023 · Not met yet$/.test(dana!.strength), [rae?.strength, dana?.strength]);
  check("\"Why Rae\": the counts and how many companies in her profile", /^6 meetings since [A-Z][a-z]{2} \d{4} · can introduce you to 2 companies in your profile$/.test(rae!.why) && rae!.count === 2, rae?.why);
  check("Rae works where Acme's past Sales lead holds a seat now, said as it is, named and whose seat they held", rae!.targets.some((x) => x.how === "Rae works at Northwind Labs, where Quinn Hart, who held Acme Robotics' fractional Sales seat, holds a seat now."), rae!.targets.map((x) => x.how));
  check("at a company Ana can't see yet, the seat holder stays unnamed", rae!.targets.some((x) => x.how === "Rae works at Northwind Labs, where the person who held this company's fractional Sales seat holds a seat now."), rae!.targets.map((x) => x.how));
  const pat = await planOf("l:pat-sample-fake");
  const patCedar = pat?.targets.find((x) => x.id === pub("c_cedar"));
  check("Pat holds the seat at Cedar, in Ana's Crystal Ball: locked, so it says what opening it costs and never its name", !!patCedar && patCedar.name === null && patCedar.open === "Open it for 2 credits" && patCedar.inWords === "In your Crystal Ball" && patCedar.how === "Pat holds this company's fractional Finance seat now." && !JSON.stringify(pat).includes("Cedar Health"), patCedar);
  check("with nothing it may name, the note asks generally (no specific ask)", pat!.ask === null && pat!.locked >= 1);
  check("only companies in her own list: never a filler, never her own clients (Elm, a past seat; Ivy Works, now)", (await plans()).every((x) => x.targets.every((t) => ![pub("c_elm"), pub("c_ivy"), pub("c_fill0")].includes(t.id))));
  check("best first: within a person, by the way in times the fit (a Crystal Ball company above a saved view's)", (await plans()).every((x) => x.targets.every((t, i) => i === 0 || x.targets[i - 1].score >= t.score)) && (await plans())[0].targets[0].inWords === "In your Crystal Ball");
  // Ana opens who holds Acme's RevOps seat: now Riley is named, in the page and in the note.
  await t.tableInternals.mutate((st) => {
    st.unlocks["e_acme_revops.operator"] = ["mem_ana"];
  });
  const dana2 = (await planOf("l:dana-reyes-fake"))!;
  const acme3 = dana2.targets.find((x) => x.id === pub("c_acme"))!;
  check("once Ana has unlocked who holds the seat, the page names Riley", acme3.how === "Dana worked with Riley Stone at a SaaS company. Riley Stone holds Acme Robotics' fractional RevOps seat now.", acme3.how);
  const line = dana2.ask?.lines.find((l) => l.company === "Acme Robotics");
  check("and the note's line says it to Dana, asks to meet Riley, and keeps the bridge Ana can't see as Dana's own past client", !!line && line.you === "You worked with Riley Stone at one of your past clients. Riley Stone is now at Acme Robotics as their fractional RevOps Lead." && line.person === "Riley Stone" && line.to === "Riley Stone", line);
  const MN = await import("../lib/moveNote.ts");
  const facts = (intro: typeof dana2.ask) => ({ kind: (intro ? "introAsk" : "ask") as "introAsk" | "ask", company: "Northwind Labs", to: { name: "Dana Reyes", email: null, from: null }, since: null, saw: null, me: { first: "Ana", name: "Ana Member", as: "a fractional CRO", fn: "Sales", clients: null }, seat: null, role: null, link: null, via: "fractional" as const, intro });
  const note = MN.draftNote(facts(dana2.ask));
  check("the drafted note names who and where, and asks for that introduction", note.subject === "An intro at Acme Robotics?" && note.body.includes("You worked with Riley Stone at one of your past clients.") && note.body.includes("Would you introduce me to Riley Stone?") && !/You see a lot of teams/.test(note.body), note.body);
  const casual = MN.draftNote(facts(dana2.ask), { greeting: "Hey {first},", signoff: "Cheers,", name: "first", length: "short", formality: "casual", contractions: true, exclamations: "never", emoji: false, opener: "direct", phrases: [] });
  check("in a short casual voice too: three sentences, the ask kept", casual.body.startsWith("Hey Dana,") && /Any chance you'd introduce me to Riley Stone\?/.test(casual.body), casual.body);
  const generic = MN.draftNote(facts(null));
  check("with nothing specific the note is the general ask", /You see a lot of teams/.test(generic.body) && generic.subject === "An introduction?");
  const all6 = JSON.stringify(await plans());
  check("never a person key or an internal id in the answer", !/p_(riley|dana|quinn|pat|jamie|lou|toni)fake|"c_acme"|e_acme_revops|"e_/.test(all6));
  check("Bo has no one: Ana's people are hers alone", (await plans(BO)).length === 0);

  /* ---------- 7. privacy ---------- */
  console.log("\nPrivacy");
  const vBo = await view(BO);
  check("Bo sees nothing of Ana's: no import, no ways in", vBo.linkedin === null && Object.keys(vBo.counts).length === 0 && vBo.targets.length === 0);
  check("Bo's Acme has no paths", (await at("c_acme", BO)).length === 0);
  const NAMES = ["Lee Park", "Casey Fox", "Sky Moss", "Morgan Blake", "lee-park-fake", "Rae Kim"];
  const anaTable = JSON.stringify(await t.buildView(ANA));
  const boTable = JSON.stringify(await t.buildView(BO));
  check("the table view carries no contact names (Ana's or Bo's)", !NAMES.some((x) => anaTable.includes(x) || boTable.includes(x)), NAMES.filter((x) => anaTable.includes(x) || boTable.includes(x)));
  const exp = JSON.stringify(await t.exportState());
  check("the admin export leaves every member's LinkedIn out", !exp.includes("Lee Park") && !exp.includes("lee-park-fake") && !exp.includes('"paths"'));
  const gc = await tools.getCompany({ member: await member("mem_ana"), origin: ORIGIN }, { company: pub("c_acme") });
  check("the connector says how many, never who", typeof gc.ways_in_through_people_you_know === "string" && /^You have \d+ ways in through people you know\. Open the company in Merlin/.test(gc.ways_in_through_people_you_know as string) && !NAMES.some((x) => JSON.stringify(gc).includes(x)), gc.ways_in_through_people_you_know);
  const acc = await tools.myAccount({ member: await member("mem_ana"), origin: ORIGIN });
  check("my_account: a count only", typeof acc.smart_ways_in === "string" && !NAMES.some((x) => JSON.stringify(acc).includes(x)), acc.smart_ways_in);
  const gcBo = await tools.getCompany({ member: await member("mem_bo"), origin: ORIGIN }, { company: pub("c_acme") });
  check("Bo's connector has no line", !("ways_in_through_people_you_know" in gcBo));
  const answers = JSON.stringify([v2, await at("c_acme"), await at("c_bright"), gc, acc]);
  check("never a person key", !/p_(riley|dana|quinn|pat|jamie|lou|toni)fake/.test(answers) && !/p_(riley|dana|quinn|pat|jamie|lou|toni)fake/.test(anaTable));
  check("Bo can't delete Ana's import", (await P.deleteConnections(BO)) && (await view()).linkedin?.rows === 15);
  await P.importConnections(ANA, CSV);
  await P.importConnections(ANA, CSV);
  const fourth = await P.importConnections(ANA, CSV).then(() => "ok", (e: Error) => e.message);
  check("3 uploads a day, then a clear no", /^That's 3 uploads today/.test(fourth), fourth);
  check("a bad file is refused with why, and nothing changes", (await P.importConnections(BO, "Name,Email\nA,b@c.example").then(() => "ok", (e: Error) => e.message)) === csv.CSV_PROBLEM_WORDS["not-connections"] && (await view(BO)).linkedin === null);

  /* ---------- 7b. Disconnect and delete everything (Your network) ---------- */
  console.log("\nDisconnect Google: its ways in go, the LinkedIn import stays");
  const G = await import("../lib/google/index.ts");
  const keptNet = structuredClone((await t.loadState()).network!.mem_ana);
  const pathsNow = async () => JSON.stringify([await view(), ...(await Promise.all(Object.keys((await view()).counts).map((id) => P.companyPaths(ANA, id))))]);
  check("before: a way in through Rae from her calendar", (await pathsNow()).includes("Rae Kim"));
  await G.disconnectAll(ANA);
  const gone = await pathsNow();
  check("after: no way in through anyone from Google, nothing of them in the state", !gone.includes("Rae Kim") && !stateFile().includes("Rae Kim") && !stateFile().includes("rae@northwind.example"));
  check("the LinkedIn import and its ways in stay, with the members she messaged", (await view()).linkedin?.rows === 15 && gone.includes("Lee Park") && gone.includes("Kai Lane"));
  // Her network back as it was, for the checks below.
  await t.tableInternals.mutate((s) => {
    (s.network ??= {}).mem_ana = keptNet;
  });

  /* ---------- 8. delete, and off ---------- */
  console.log("\nDelete and off");
  await P.deleteConnections(ANA);
  const v3 = await view();
  const after = JSON.stringify([v3, ...(await Promise.all(Object.keys(v3.counts).map((id) => P.companyPaths(ANA, id))))]);
  check("deleted: no import, and no way in from it is left", v3.linkedin === null && !["Lee Park", "Casey Fox", "Sky Moss", "Morgan Blake", "Dana Reyes", "Pat Sample"].some((x) => after.includes(x)), after.slice(0, 400));
  check("what came from Google and messages stays (Rae, Kai)", after.includes("Rae Kim") && after.includes("Kai Lane"));
  const file = stateFile();
  check("the state file keeps nothing from the file", !["Lee", "lee-park-fake", "Casey", "Sky", "Morgan Blake", "Stone Consulting"].some((x) => file.includes(x)));
  check("the daily upload count stays (not from the file)", v3.importsLeft === 0);
  check("the connector's lines go with it", !("smart_ways_in" in (await tools.myAccount({ member: await member("mem_bo"), origin: ORIGIN }))));
  delete process.env.RN_GOOGLE;
  check("Your network off: nothing", JSON.stringify(await P.pathsView(ANA)) === JSON.stringify({ on: false }) && JSON.stringify(await P.pathsLine(await member("mem_ana"), pub("c_acme"))) === "{}");
  check("and no import", (await P.importConnections(ANA, CSV).then(() => "ok", (e: Error) => e.message)) !== "ok");
  check("the words of the chip", types.waysWords(2) === "2 ways in through people you know" && types.waysWords(1) === "1 way in through people you know");
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
