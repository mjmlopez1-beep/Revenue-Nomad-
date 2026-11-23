/**
 * Checks of who you know, from each source on its own and all together (the owner's decision: the
 * LinkedIn connections file, a contacts CSV and Google each work alone; together they combine), the
 * general contacts CSV (lib/paths/csv.ts), People I know (lib/paths knownView), "Not a
 * relationship", and the People page's rows (app/post/people/peopleModel.ts).
 *
 *   npx tsx scripts/test-sources.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and file in them is made up.
 *
 *  1. The contacts CSV, as pure functions: Google's, Outlook's and a CRM's headers guessed (a middle
 *     name is never the name), a semicolon and a tab file, notes before the header, what is enough
 *     to read people, only the picked columns written (no other column ever leaves the browser),
 *     the rows kept (a name with a company or an email, once each).
 *  2. LinkedIn alone, Google off: people you know and ways in, Getting started's step 3 done.
 *  3. A CSV alone, Google off: the same; the state keeps only the four columns; Delete removes it
 *     and its ways in.
 *  4. Google alone: the same, from the member's own network, no file.
 *  5. Together: one person once across sources, every source's people, more ways in than any alone.
 *  6. People I know: a record named only by a precise match at a company the member can see, never
 *     a locked company's person, never a value of Merlin's own record; "Not a relationship" and its
 *     Undo.
 *  7. Privacy and limits: another member sees nothing of it, the admin export and a closed
 *     account's purge, the daily upload limit shared by the two files, RN_PATHS=off.
 *  8. The People page's rows: the views, the member's own rows, the chips, the sorts, the example
 *     rows outside every count.
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
const recent = (d: number) => ago(d).slice(0, 10);
const dir = mkdtempSync(path.join(tmpdir(), "rn-sources-"));

/* ---------- the made-up world ---------- */
const co = (id: string, name: string, website: string, industry = "SaaS", employees = "51–200") => ({ id, fields: { name, website, industry, employees, hq: "Austin, TX" } });
const seat = (id: string, companyId: string, fn: string, operator: string, start: string, end: string | null, holderKey?: string) => ({
  id,
  companyId,
  fields: { source: "Published engagement", function: fn, role: `Fractional ${fn} Lead`, operator, start, ...(end ? { end, status: "Ended" } : { status: "Active" }), type: "Fractional" },
  ...(holderKey ? { holderKey } : {}),
});
const fillers = Array.from({ length: 12 }, (_, i) => co(`c_fill${i}`, `Filler Works ${i}`, `fill${i}.example`, "Retail", "11–50"));
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_jo", name: "Jordan Avery", email: "jordan.avery@averyco.example", title: "Fractional CRO", token: "tok-jo-0001" },
    { id: "mem_li", name: "Lin Only", email: "lin.only@example.org", title: "Fractional CMO", token: "tok-li-0001" },
    { id: "mem_cv", name: "Cal Csv", email: "cal.csv@example.net", title: "Fractional COO", token: "tok-cv-0001" },
    { id: "mem_go", name: "Gia Google", email: "gia.google@example.org", title: "Fractional CFO", token: "tok-go-0001" },
    { id: "mem_ot", name: "Otto Other", email: "otto.other@example.org", title: "Fractional CTO", token: "tok-ot-0001" },
    { id: "mem_ad", name: "Ada Admin", email: "ada.admin@example.com", title: "Fractional CTO", token: "tok-ad-0001" },
  ],
  companies: [
    co("c_north", "Northwind Clinics", "northwindclinics.example", "Healthcare", "201–500"),
    co("c_cedar", "Cedar and Pine", "cedarandpine.example", "SaaS", "11–50"),
    co("c_halcyon", "Halcyon Freight", "halcyonfreight.example", "Logistics", "51–200"),
    co("c_lark", "Larkspur Learning", "larkspurlearning.example", "EdTech", "51–200"),
    ...fillers,
  ],
  engagements: [
    seat("e_north_sales", "c_north", "Sales", "Rita Okafor", "2024-04", null, "p_ritafake01"),
    seat("e_cedar_fin", "c_cedar", "Finance", "Pat Sample", "2025-01", null, "p_patfake001"),
    seat("e_halcyon_cro", "c_halcyon", "Sales", "Rita Okafor", "2022-01", "2023-06", "p_ritafake01"),
  ],
  contacts: [
    { id: "p_cedar_dana", companyId: "c_cedar", source: "Published engagement", fields: { name: "Dana Whitfield", title: "CEO", relationship: "Decision maker", email: "dana@cedarandpine.example", linkedin: "https://www.linkedin.com/in/dana-whitfield-fake" } },
    { id: "p_cedar_joan", companyId: "c_cedar", source: "Published engagement", fields: { name: "Joan Tierney", title: "CFO", relationship: "Decision maker", email: "joan@cedarandpine.example" } },
    { id: "p_halcyon_marta", engagementId: "e_halcyon_cro", source: "Published engagement", fields: { name: "Marta Lindholm", title: "COO", relationship: "Hiring for the seat", email: "marta@halcyonfreight.example" } },
    { id: "p_lark_owen", companyId: "c_lark", source: "Published engagement", fields: { name: "Owen Reyes", title: "CEO", relationship: "Decision maker", email: "owen@larkspurlearning.example" } },
    { id: "p_north_sam", companyId: "c_north", source: "Published engagement", fields: { name: "Sam Iverson", title: "CEO", relationship: "Decision maker", email: "sam@northwindclinics.example" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const months = (n: number) => Array.from({ length: n }, (_, i) => new Date(NOW - (n - 1 - i) * 30.44 * DAY).toISOString().slice(0, 7));
const gnet = (people: { key: string; name: string; title: string; meetings: number; last: number }[], companyId: string, domain: string) => ({
  cal: {
    at: ago(1),
    companies: { [companyId]: { domain, meetings: people.reduce((a, p) => a + p.meetings, 0), first: recent(200), last: recent(people[0].last), months: months(5), people: people.map((p) => ({ key: p.key, email: p.key, name: p.name, title: p.title, meetings: p.meetings, first: recent(200), last: recent(p.last), src: ["calendar"] })) } },
    unmatched: 0,
    real: 1,
  },
});
const state = {
  ledger: [],
  values: {},
  // Cedar and Halcyon are open for Jordan and the CSV member; Larkspur is locked for everyone.
  unlocks: { "c_cedar.identity": ["mem_jo", "mem_cv", "mem_li"], "c_halcyon.identity": ["mem_jo", "mem_cv"], "c_north.identity": ["mem_jo", "mem_go"] },
  seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
  profiles: Object.fromEntries(seed.members.map((m) => [m.id, { function: "Sales", onboarded: true }])),
  names: { hide: true },
  connector: { alerts: {}, grants: [] },
  conversations: [],
  network: {
    mem_go: gnet([{ key: "sam@northwindclinics.example", name: "Sam Iverson", title: "CEO", meetings: 14, last: 10 }], "c_north", "northwindclinics.example"),
    mem_jo: gnet([{ key: "sam@northwindclinics.example", name: "Sam Iverson", title: "CEO", meetings: 6, last: 12 }], "c_north", "northwindclinics.example"),
  },
};
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

const LINKEDIN = [
  "Notes:",
  '"When exporting your connection data, you may notice that some of the email addresses are missing."',
  "",
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  "Dana,Whitfield,https://www.linkedin.com/in/dana-whitfield-fake,,Cedar and Pine,CEO,12 Mar 2021",
  "Owen,Reyes,https://www.linkedin.com/in/owen-reyes-fake,,Larkspur Learning,CEO,02 Jan 2024",
  "Rita,Okafor,,,Brightside Partners,Fractional CRO,01 Jan 2022",
].join("\r\n");

// A CRM export: a column of private notes the member never picks, and one they don't need.
const SECRET = "SECRET-DEAL-NOTE-9Q";
const CRM = [
  "Full Name,Company Name,Job Title,Email,Deal notes,Phone",
  `Marta Lindholm,Halcyon Freight,COO,marta@halcyonfreight.example,${SECRET} renewal,555-0100`,
  `"Tierney, Joan",Cedar and Pine,CFO,,${SECRET},555-0101`,
  `Joan Tierney,Cedar and Pine,CFO,joan@cedarandpine.example,${SECRET},555-0102`,
  `Kim Tran,Harbor Search,Talent Partner,,${SECRET},`,
  `No Company,,,,,`,
  `12345,Cedar and Pine,,,,`,
  `Lee Park,,VP Sales,lee@larkspurlearning.example,${SECRET},`,
].join("\n");

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_ID_SECRET: "test-id-secret-not-real",
});
for (const k of ["RN_GOOGLE", "RN_PATHS", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL"]) delete process.env[k];

const JO = "tok-jo-0001";
const LI = "tok-li-0001";
const CV = "tok-cv-0001";
const GO = "tok-go-0001";
const OT = "tok-ot-0001";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");

async function main() {
  const csv = await import("../lib/paths/csv.ts");

  /* ---------- 1. the contacts CSV ---------- */
  console.log("\nA contacts CSV, read in the browser");
  const google = ["First Name", "Middle Name", "Last Name", "Phonetic First Name", "Nickname", "File As", "E-mail 1 - Label", "E-mail 1 - Value", "Phone 1 - Value", "Organization Name", "Organization Title"];
  const g = csv.guessColumns(google);
  check("Google's export: first and last name, company, title, email (never the middle name)", g.first === 0 && g.last === 2 && g.name === undefined && g.email === 7 && g.company === 9 && g.title === 10, g);
  const o = csv.guessColumns(["First Name", "Last Name", "Company", "Job Title", "E-mail Address", "Business Phone"]);
  check("Outlook's export", o.first === 0 && o.last === 1 && o.company === 2 && o.title === 3 && o.email === 4 && o.name === undefined, o);
  const h = csv.guessColumns(["Full Name", "Company Name", "Job Title", "Email", "Deal notes", "Phone"]);
  check("a CRM's export: one name column", h.name === 0 && h.company === 1 && h.title === 2 && h.email === 3 && h.first === undefined, h);
  check("a column the member never needs is never guessed (notes, phone)", !Object.values(h).includes(4) && !Object.values(h).includes(5));
  check("separators: comma, semicolon, tab", csv.separatorOf("a,b;c\n") === "," && csv.separatorOf("Name;Company;Email\nx;y;z") === ";" && csv.separatorOf("Name\tCompany\n") === "\t");
  const semi = csv.readContacts("Name;Firma;Company;Email\nDana Whitfield;x;Cedar and Pine;dana@cedarandpine.example\n");
  check("a semicolon file reads its header and rows", semi.ok && semi.map.name === 0 && semi.map.company === 2 && semi.rows === 1, semi);
  const notes = csv.readContacts("Exported by MadeUpCRM\n\nName,Company,Title\nDana Whitfield,Cedar and Pine,CEO\n");
  check("notes before the header are skipped", notes.ok && notes.at === 2 && notes.header[0] === "Name", notes);
  check("enough to read people: a name, and a company or an email", csv.mapProblem({ name: 0, company: 1 }) === null && csv.mapProblem({ first: 0, last: 1, email: 2 }) === null && csv.mapProblem({ first: 0, company: 1 }) === "no-name" && csv.mapProblem({ name: 0, title: 1 }) === "no-company");
  const zip = csv.readContacts("PK\u0003\u0004 rest");
  const empty = csv.readContacts("  \n ");
  check("an archive and an empty file are refused with why", !zip.ok && zip.problem === "zip" && !empty.ok && empty.problem === "empty" && !!csv.CONTACTS_PROBLEM_WORDS.zip);
  const crm = csv.readContacts(CRM);
  if (!crm.ok) throw new Error("the CRM file didn't read");
  check("the preview: the header and the first three rows", crm.sample.length === 3 && crm.rows === 7 && crm.header[4] === "Deal notes");
  const picked = csv.pickColumns(CRM, crm, crm.map);
  check("only Name, Company, Title and Email are written: the notes and the phone never leave", picked.startsWith("Name,Company,Title,Email\n") && !picked.includes(SECRET) && !picked.includes("555-01"), picked);
  check("a quoted name with a comma stays one field", picked.includes('"Tierney, Joan"'));
  const halves = csv.pickColumns("First,Last,Org\nDana,Whitfield,Cedar and Pine\n", { at: 0, sep: "," }, { first: 0, last: 1, company: 2 });
  check("a first and a last name become one name", halves.split("\n")[1] === "Dana Whitfield,Cedar and Pine,,", halves);
  const parsed = csv.parseContacts(picked);
  check("kept: a name with a company or an email, once each by email", parsed.ok && parsed.rows.length === 5, parsed);
  if (!parsed.ok) throw new Error("nothing parsed");
  check("skipped: no company and no email, no name, the same email twice", parsed.skipped === 2, parsed.skipped);
  check("every kept row holds only the four fields", parsed.rows.every((r) => Object.keys(r).every((k) => ["n", "c", "t", "e"].includes(k))));
  check("an email is kept only when it reads as one, lower case", csv.parseContacts("Name,Company,Email\nA B,Cedar and Pine,not-an-email\nC D,Cedar and Pine,C.D@Cedar.EXAMPLE").ok && (csv.parseContacts("Name,Company,Email\nA B,Cedar and Pine,not-an-email\nC D,Cedar and Pine,C.D@Cedar.EXAMPLE") as { rows: { e?: string }[] }).rows.map((r) => r.e ?? "").join("|") === "|c.d@cedar.example");
  check("a BOM and CRLF read the same", JSON.stringify(csv.parseContacts(`﻿${picked.replace(/\n/g, "\r\n")}`)) === JSON.stringify(parsed));

  const P = await import("../lib/paths/index.ts");
  const t = await import("../lib/table.ts");
  const pub = (id: string) => t.tableInternals.pubId(id);
  type PV = import("../lib/paths/types.ts").PathsView;
  type KV = import("../lib/paths/types.ts").KnownView;
  const view = async (tok: string) => (await P.pathsView(tok)) as PV;
  const known = async (tok: string) => (await P.knownView(tok)) as KV;
  const startedOf = async (tok: string) => (await t.buildView(tok)).me.started;

  /* ---------- 2. LinkedIn alone, Google off ---------- */
  console.log("\nThe LinkedIn file alone, Google off");
  check("Google is off", process.env.RN_GOOGLE === undefined);
  const before = await startedOf(LI);
  check("before: step 3 not done, and offered (the files need no Google)", before?.network === false && before.networkOff === true && before.filesOn === true, before);
  const li = await P.importConnections(LI, LINKEDIN);
  check("the import goes in without Google", /Added 3 connections/.test(li.message), li.message);
  const liV = await view(LI);
  check("ways in from the file alone", liV.on && liV.linkedin?.rows === 3 && liV.csv === null && liV.googleOn === false && !!liV.counts[pub("c_cedar")], liV);
  const liK = await known(LI);
  const dana = liK.people.find((p) => p.name === "Dana Whitfield");
  check("People I know from the file alone: Dana at Cedar, from your LinkedIn file", !!dana && dana.company === pub("c_cedar") && dana.src.join() === "linkedin" && dana.warmth === null && liK.sources.linkedin === 3 && liK.sources.csv === null && liK.sources.google === false, liK);
  check("matched to Merlin's record of her by her public profile (a company the member can see)", dana?.record === pub("p_cedar_dana"));
  check("step 3 is done by the file alone", (await startedOf(LI))?.network === true);

  /* ---------- 3. a CSV alone, Google off ---------- */
  console.log("\nA contacts CSV alone, Google off");
  const cv = await P.importContacts(CV, picked);
  check("the CSV goes in without Google", /Added 5 contacts/.test(cv.message), cv.message);
  const file = stateFile();
  check("the state keeps the four columns only: no notes, no phone", !file.includes(SECRET) && !file.includes("555-0100") && file.includes("marta@halcyonfreight.example"));
  const cvV = await view(CV);
  check("ways in from the CSV alone", cvV.on && cvV.csv?.rows === 5 && cvV.linkedin === null && !!cvV.counts[pub("c_halcyon")] && cvV.csv.matched >= 3, cvV);
  const cvK = await known(CV);
  const marta = cvK.people.find((p) => p.name === "Marta Lindholm");
  check("People I know from the CSV alone: Marta at Halcyon, by her email's website", !!marta && marta.company === pub("c_halcyon") && marta.src.join() === "csv" && marta.email === "marta@halcyonfreight.example" && marta.why === "In your contacts file", marta);
  check("Lee (no company, an email at Larkspur) is placed by the email", cvK.people.some((p) => p.name === "Lee Park" && p.company === pub("c_lark")));
  check("Kim at a company not on Merlin is left out", !cvK.people.some((p) => p.name === "Kim Tran"));
  check("Joan, written two ways, is one person matched to her record", cvK.people.filter((p) => p.company === pub("c_cedar")).length === 2 && cvK.people.some((p) => p.record === pub("p_cedar_joan")), cvK.people.map((p) => [p.name, p.record]));
  check("step 3 is done by the CSV alone", (await startedOf(CV))?.network === true);
  const W = await import("../lib/paths/ways.ts");
  const way = (await W.wayIn(CV, pub("c_halcyon"))) as import("../lib/paths/types.ts").WayInView;
  check("Your way in works from the CSV alone (Google off)", !!way && "routes" in way && way.routes.length > 0, way);
  check("a route through a CSV contact says she is in your contacts, never met", JSON.stringify(way).includes("in your contacts"), JSON.stringify(way).slice(0, 300));

  /* ---------- 4. Google alone ---------- */
  console.log("\nGoogle alone");
  process.env.RN_GOOGLE = "1";
  const goV = await view(GO);
  const goK = await known(GO);
  const sam = goK.people.find((p) => p.name === "Sam Iverson");
  check("ways in from Google alone, no file", goV.on && goV.linkedin === null && goV.csv === null && goV.googleOn === true && !!goV.counts[pub("c_north")], goV);
  check("People I know from Google alone: Sam, how warm and the last meeting", !!sam && sam.src.join() === "google" && sam.warmth !== null && sam.last === recent(10) && sam.lastKind === "Meeting" && goK.sources.google === false, sam);
  check("matched to Merlin's record of him by name at his company", sam?.record === pub("p_north_sam"));

  /* ---------- 5. together ---------- */
  console.log("\nAll three together");
  await P.importConnections(JO, LINKEDIN);
  await P.importContacts(JO, picked);
  const joV = await view(JO);
  const joK = await known(JO);
  const byName = (n: string) => joK.people.filter((p) => p.name === n);
  check("every source's people are in", byName("Dana Whitfield").length === 1 && byName("Marta Lindholm").length === 1 && byName("Sam Iverson").length === 1, joK.people.map((p) => p.name));
  check("Sam from Google keeps his warmth; Dana from the file is one entry", byName("Sam Iverson")[0].src.includes("google") && byName("Dana Whitfield")[0].src.join() === "linkedin");
  const ways = (v: PV) => Object.keys(v.counts).length;
  const union = new Set([...Object.keys(liV.counts), ...Object.keys(cvV.counts), ...Object.keys(goV.counts)]);
  check("together they combine: every company each source alone gives a way into, and more than LinkedIn or Google alone", [...union].every((k) => k in joV.counts) && ways(joV) > ways(liV) && ways(joV) > ways(goV), [ways(joV), ways(liV), ways(cvV), ways(goV)]);
  check("both files counted", joV.linkedin?.rows === 3 && joV.csv?.rows === 5);
  // The same person in two files is one entry with both sources.
  await P.importContacts(JO, "Name,Company,Title,Email\nDana Whitfield,Cedar and Pine,CEO,dana.w@cedarandpine.example\n");
  const joK2 = await known(JO);
  const d2 = joK2.people.filter((p) => p.name === "Dana Whitfield");
  check("one person in the LinkedIn file and the CSV is one entry, from both", d2.length === 1 && d2[0].src.includes("linkedin") && d2[0].src.includes("csv"), d2);
  process.env.RN_GOOGLE = "";
  delete process.env.RN_GOOGLE;
  const joOff = await known(JO);
  check("Google off again: the files' people stay, Google's go", !joOff.people.some((p) => p.src.join() === "google") && joOff.people.some((p) => p.name === "Dana Whitfield"));

  /* ---------- 6. People I know: what it names ---------- */
  console.log("\nPeople I know: what it names");
  const owen = liK.people.find((p) => p.name === "Owen Reyes");
  check("someone at a locked company: their company, never Merlin's record of them", !!owen && owen.company === pub("c_lark") && owen.record === null, owen);
  const kJSON = JSON.stringify(liK);
  check("no value of Merlin's own records (their emails) is in it", !kJSON.includes("dana@cedarandpine.example") && !kJSON.includes("owen@larkspurlearning.example"));
  check("Rita, at a company not on Merlin and not a member, is left out", !liK.people.some((p) => p.name === "Rita Okafor"));
  const cedarBefore = (await view(LI)).counts[pub("c_cedar")]?.n ?? 0;
  const aw = await P.setAway(LI, dana!.key, true);
  check("Not a relationship: remembered, and listed as set aside", "people" in aw && aw.people.find((p) => p.key === dana!.key)?.away === true);
  check("she is no way in any more", ((await view(LI)).counts[pub("c_cedar")]?.n ?? 0) < cedarBefore);
  check("only her key is kept", stateFile().includes(`"away":["${dana!.key}"]`));
  const back = await P.setAway(LI, dana!.key, false);
  check("Undo: back in People I know, a way in again", "people" in back && back.people.find((p) => p.key === dana!.key)?.away === false && ((await view(LI)).counts[pub("c_cedar")]?.n ?? 0) === cedarBefore);
  check("a key that isn't theirs is refused", (await P.setAway(OT, dana!.key, true).then(() => "ok", (e: Error) => e.message)) !== "ok");

  /* ---------- 7. privacy and limits ---------- */
  console.log("\nPrivacy and limits");
  const ot = await known(OT);
  check("another member sees none of it", ot.people.length === 0 && ot.sources.linkedin === null && ot.sources.csv === null);
  const otTable = JSON.stringify(await t.buildView(OT));
  check("another member's table carries no name from the files", !["Marta Lindholm", "Lee Park", "Kim Tran", "lee@larkspurlearning.example"].some((x) => otTable.includes(x)));
  const exp = JSON.stringify(await t.exportState());
  check("the admin export leaves the files out", !exp.includes("marta@halcyonfreight.example") && !exp.includes("Kim Tran") && !exp.includes("dana-whitfield-fake"));
  check("the daily limit is shared by the two files (Jordan used 3)", (await view(JO)).importsLeft === 0 && (await P.importContacts(JO, picked).then(() => "ok", (e: Error) => e.message)).includes("uploads today"));
  await P.deleteContacts(CV);
  const cvGone = await view(CV);
  check("Delete: no CSV, no way in from it, nothing of it in the state", cvGone.csv === null && !cvGone.counts[pub("c_halcyon")] && (await known(CV)).people.length === 0 && !stateFile().includes("Lee Park"), cvGone);
  // A closed account's purge deletes the files with the rest of the member's own data.
  const seedNow = await t.loadSeed();
  await t.tableInternals.mutate((s) => void t.tableInternals.purgeMember(s, seedNow, "mem_jo", new Date().toISOString()));
  check("purged: the files and the set-aside list are gone", !(stateFile().includes("Owen Reyes") && stateFile().includes("jordan")) && !JSON.parse(stateFile()).paths?.mem_jo);
  process.env.RN_PATHS = "off";
  check("RN_PATHS=off: nothing, and no import", JSON.stringify(await P.knownView(LI)) === JSON.stringify({ on: false }) && JSON.stringify(await P.pathsView(LI)) === JSON.stringify({ on: false }) && (await P.importContacts(LI, picked).then(() => "ok", (e: Error) => e.message)) !== "ok");
  const offStarted = await startedOf(OT);
  check("and step 3 is left out where Google is off too", offStarted?.networkOff === true && !offStarted.filesOn);
  delete process.env.RN_PATHS;

  /* ---------- 8. the People page's rows ---------- */
  console.log("\nThe People page's rows");
  const M = await import("../app/post/people/peopleModel.ts");
  const X = await import("../app/post/examples.ts");
  const model = await import("../app/post/model.ts");
  const liView = await t.buildView(LI);
  const infos = model.deriveAll(liView.companies);
  const byId = new Map(infos.map((i) => [i.c.id, i]));
  const kv = (await known(LI)).people;
  const byRecord = new Map(kv.filter((k) => k.record).map((k) => [k.record!, k]));
  const base = model.rowsFor("people", infos);
  const rows = M.withKnown(base, byRecord);
  const own = M.ownRows(kv, byId, new Set(base.map((r) => r.p!.id)));
  const all = [...rows, ...own];
  const names = (rs: import("../app/post/people/peopleModel.ts").PeopleRow[]) => rs.map((r) => M.nameOf(r) ?? "(locked)");
  check("Decision makers: people marked Decision maker", all.filter((r) => M.inView(r, "dm", false)).every((r) => M.relOf(r) === "Decision maker") && all.some((r) => M.inView(r, "dm", false)));
  check("Hired a fractional: who hired or managed a seat", all.filter((r) => M.inView(r, "hired", false)).every((r) => M.HIRED_RELS.includes(M.relOf(r) ?? "")));
  const knownRows = all.filter((r) => M.inView(r, "known", false));
  check("People I know: Dana on Merlin's own row, Owen as the member's own row (no record at a locked company)", knownRows.some((r) => !r.own && r.p?.id === pub("p_cedar_dana")) && knownRows.some((r) => r.own && r.k?.name === "Owen Reyes"), names(knownRows));
  check("a name shows only where the record's cell holds it (Dana's is still locked)", knownRows.find((r) => r.p?.id === pub("p_cedar_dana")) && M.nameOf(knownRows.find((r) => r.p?.id === pub("p_cedar_dana"))!) === null);
  check("the member's own rows are only in People I know and All", own.every((r) => !M.inView(r, "dm", false) && !M.inView(r, "hired", false) && M.inView(r, "all", false)));
  const sizes = all.map((r) => M.sizeOf(r.i));
  check("size groups from the employees band", M.sizeOf(byId.get(pub("c_cedar"))!) === 1 && M.sizeOf(byId.get(pub("c_halcyon"))!) === 2 && M.sizeOf(byId.get(pub("c_north"))!) === 3 && sizes.every((x) => x >= 0));
  check("chips: strong or good needs a warm relationship (a file alone is Cold)", all.filter((r) => M.passesChips(r, new Set(["warm"]), { pipe: new Set() })).length === 0);
  check("chips: not in pipeline", all.filter((r) => M.passesChips(r, new Set(["nopipe"]), { pipe: new Set([pub("c_cedar")]) })).every((r) => r.i.c.id !== pub("c_cedar")));
  check("search reads no name it can't show", !all.some((r) => M.hayOf(r).includes("joan tierney")) && all.some((r) => M.hayOf(r).includes("owen reyes")));
  const sorted = M.sortPeople(all.slice(), 0, () => 0);
  check("best way in first: someone you know before someone you don't", M.knows(sorted[0]));
  check("fill rates of the member's own columns", M.ownFill("know", all, new Set()).filled === all.filter(M.knows).length && M.ownFill("pipe", all, new Set([pub("c_cedar")])).filled === all.filter((r) => r.i.c.id === pub("c_cedar")).length);
  check("the four example rows are examples: labelled, and never counted", M.EXAMPLE_PEOPLE.length === 4 && M.EXAMPLE_PEOPLE.every((x) => X.isExample(x) && x.label === "Example") && X.realOnly(M.EXAMPLE_PEOPLE as unknown[]).length === 0);
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
