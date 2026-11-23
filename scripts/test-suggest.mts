/**
 * Checks of Suggested additions from your connections (lib/paths/suggest.ts, the "suggestAdd" action
 * in lib/table.ts, POST /api/paths suggestAdd and suggestSkip), behind RN_SUGGEST:
 *
 *   npx tsx scripts/test-suggest.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and file in them is made up.
 *
 *  1. Off by default: nothing is listed, nothing can be added.
 *  2. Who is suggested: a leader in the member's own LinkedIn file or CSV at a US company outside
 *     California with no decision maker or leader on file, at a company the member can see; a
 *     locked company's match is a count only. Never anyone from Google, never a Californian (the
 *     files hold no location, so no company based in California), never outside the US, never a
 *     fractional's or an adviser's title, never a one-word or initials name, never another member,
 *     never a company that already has a leader.
 *  3. Adding: only the ticked rows; only the name, title and relationship, never an email, a phone
 *     or another field from the file; 1 credit a person; the daily cap; a key the server did not
 *     work out is refused; added people are suggested no more; "no" is remembered.
 *  4. Remove my name (/remove) takes a suggested person off, and they are never suggested again;
 *     closing the account deletes the member's suggestion keys; the admin export leaves them out.
 *  5. Docs: docs/data-flows.md and the /data page say what it adds and what it never does.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 1200)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const ago = (d: number) => new Date(NOW - d * DAY).toISOString();
const recent = (d: number) => ago(d).slice(0, 10);
const dir = mkdtempSync(path.join(tmpdir(), "rn-suggest-"));

const co = (id: string, name: string, website: string, hq = "Austin, TX") => ({ id, fields: { name, website, industry: "SaaS", employees: "51–200", hq } });
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_jo", name: "Jordan Avery", email: "jordan.avery@averyco.example", title: "Fractional VP Sales", token: "tok-jo-0001" },
    { id: "mem_ot", name: "Otto Other", email: "otto.other@example.org", title: "Fractional CFO", token: "tok-ot-0001" },
    { id: "mem_ri", name: "Rhea Member", email: "rhea@northwindclinics.example", title: "Fractional CMO", token: "tok-ri-0001" },
  ],
  companies: [
    co("c_cedar", "Cedar and Pine", "cedarandpine.example"),
    co("c_halcyon", "Halcyon Freight", "halcyonfreight.example", "Dallas, TX"),
    co("c_gale", "Gale Systems", "galesystems.example", "San Jose, CA"),
    co("c_maple", "Maple Harbour", "mapleharbour.example", "Toronto, Canada"),
    co("c_lark", "Larkspur Learning", "larkspurlearning.example"),
    co("c_north", "Northwind Clinics", "northwindclinics.example"),
    co("c_quill", "Quillmoor", "quillmoor.example"),
    co("c_fern", "Fernhill Software", "fernhillsoftware.example"),
  ],
  engagements: [],
  contacts: [
    { id: "p_hal_dm", companyId: "c_halcyon", source: "Published engagement", fields: { name: "Abel Tran", title: "CEO", relationship: "Decision maker" } },
    { id: "p_fern_cfo", companyId: "c_fern", source: "Published engagement", fields: { name: "Ines Calder", title: "Chief Financial Officer" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const OPEN = ["c_cedar", "c_halcyon", "c_gale", "c_maple", "c_north", "c_quill", "c_fern"];
const state = {
  ledger: [],
  values: {},
  unlocks: Object.fromEntries(OPEN.map((id) => [`${id}.identity`, ["mem_jo"]])),
  seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
  profiles: Object.fromEntries(seed.members.map((m) => [m.id, { function: "Sales", onboarded: true }])),
  names: {},
  connector: { alerts: {}, grants: [] },
  conversations: [],
  // Jordan's Google network: a founder at Quillmoor, a company with nobody on file. Google never feeds suggestions.
  network: {
    mem_jo: {
      google: { at: ago(2), scopes: ["calendar"], email: "jordan.avery@averyco.example" },
      cal: {
        at: ago(1),
        companies: { c_quill: { domain: "quillmoor.example", meetings: 5, first: recent(200), last: recent(5), months: [], people: [{ key: "theo@quillmoor.example", email: "theo@quillmoor.example", name: "Theo Grant", title: "Founder", meetings: 5, first: recent(200), last: recent(5), src: ["calendar"] }] } },
        unmatched: 0,
        real: 1,
      },
    },
  },
};
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

const SECRET_EMAIL = "dana.private@cedarandpine.example";
const LINKEDIN = [
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  `Dana,Whitfield,https://www.linkedin.com/in/dana-whitfield-fake,${SECRET_EMAIL},Cedar and Pine,CEO,12 Mar 2021`,
  "Marta,Lindholm,,,Halcyon Freight,COO,02 Jan 2023",
  "Gina,Coast,,,Gale Systems,CEO,02 Jan 2023",
  "Harper,North,,,Maple Harbour,President,02 Jan 2023",
  "Owen,Reyes,,,Larkspur Learning,CEO,02 Jan 2024",
  "Rita,Okafor,,,Cedar and Pine,Fractional CRO,01 Jan 2022",
  "Ivo,Brandt,,,Fernhill Software,VP Sales,01 Jan 2022",
].join("\r\n");
const CSV = [
  "Name,Company,Title,Email",
  "Sam Iverson,Northwind Clinics,VP Sales,sam@northwindclinics.example",
  "Admin,Northwind Clinics,CEO,",
  "J. Smith,Northwind Clinics,CEO,",
  "Rhea Member,Northwind Clinics,Chief Marketing Officer,rhea@northwindclinics.example",
  "Pat Advisor,Northwind Clinics,Board Advisor,",
].join("\n");

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
for (const k of ["RN_PATHS", "RN_SUGGEST", "RN_LOCKED_MATCHES", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL"]) delete process.env[k];

const JO = "tok-jo-0001";
const OT = "tok-ot-0001";
const stateFile = () => readFileSync(path.join(dir, "intel.json"), "utf8");
const err = async (f: () => Promise<unknown>) => {
  try {
    await f();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};

async function main() {
  const P = await import("../lib/paths/index.ts");
  const S = await import("../lib/paths/suggest.ts");
  const t = await import("../lib/table.ts");
  await P.importConnections(JO, LINKEDIN);
  await P.importContacts(JO, CSV);

  /* ---------- 1. off by default ---------- */
  console.log("\nOff by default");
  const off = await S.suggestView(JO);
  check("RN_SUGGEST unset: nothing is listed", !!off && off.on === false && off.rows.length === 0);
  check("...and nothing can be added, not even through the table's own action", /aren't on/.test((await err(() => S.suggestAdd(JO, ["sAAAAAAAAAAAAAAAA"]))) ?? "") && /aren't on/.test((await err(() => t.perform(JO, { type: "suggestAdd", keys: ["sAAAAAAAAAAAAAAAA"] } as never))) ?? ""));

  /* ---------- 2. who is suggested ---------- */
  process.env.RN_SUGGEST = "on";
  console.log("\nWho is suggested (RN_SUGGEST=on)");
  const v = (await S.suggestView(JO))!;
  const names = v.rows.map((r) => r.name).sort();
  check("a leader at a US company with nobody like that on file, from the LinkedIn file and from the CSV", JSON.stringify(names) === JSON.stringify(["Dana Whitfield", "Sam Iverson"]), names);
  check("added as a Decision maker, said where it came from", v.rows.every((r) => r.rel === "Decision maker") && v.rows.find((r) => r.name === "Dana Whitfield")?.from === "linkedin" && v.rows.find((r) => r.name === "Sam Iverson")?.from === "csv");
  const all = JSON.stringify(v);
  check("never anyone from Google (Theo is their Google contact at a company with nobody on file)", !all.includes("Theo"));
  check("never a Californian: no company based in California, as the files hold no person's location", !all.includes("Gina") && !all.includes("Gale"));
  check("never outside the United States", !all.includes("Harper") && !all.includes("Maple"));
  check("never at a company that has a decision maker or a leader on file already", !all.includes("Marta") && !all.includes("Ivo"));
  check("never a fractional's or an adviser's title, a one-word or initials name, or another member", !all.includes("Rita") && !all.includes("Advisor") && !all.includes("Admin") && !all.includes("Smith") && !all.includes("Rhea"));
  check("a locked company's match is a count only (the locked-match rule)", v.locked === 1 && !all.includes("Owen") && !all.includes("Larkspur"), v.locked);
  check("each row holds the name, title, relationship and company only: never the email", v.rows.every((r) => Object.keys(r).sort().join(",") === "company,companyId,from,key,name,rel,title") && !all.includes(SECRET_EMAIL) && !all.includes("@"));
  check("the credits the member can still earn today are said", v.earnLeft === 25, v.earnLeft);
  const ov = (await S.suggestView(OT))!;
  check("another member's list holds nothing from Jordan's files", ov.on && ov.rows.length === 0 && ov.locked === 0);
  check("the leader test", S.leaderTitle("CEO") && S.leaderTitle("Chief Revenue Officer") && S.leaderTitle("Co-founder") && S.leaderTitle("VP of Sales") && S.leaderTitle("Head of Growth") && !S.leaderTitle("Fractional CFO") && !S.leaderTitle("Interim COO") && !S.leaderTitle("Sales Manager") && !S.leaderTitle("Advisor to the CEO"));

  /* ---------- 3. adding ---------- */
  console.log("\nAdding: only what was ticked");
  const dana = v.rows.find((r) => r.name === "Dana Whitfield")!;
  const sam = v.rows.find((r) => r.name === "Sam Iverson")!;
  const before = JSON.parse(stateFile());
  const forged = await err(() => S.suggestAdd(JO, ["sZZZZZZZZZZZZZZZZ"]));
  check("a key the server didn't work out is refused, and nothing is added", /aren't suggested/.test(forged ?? "") && JSON.parse(stateFile()).contacts.length === before.contacts.length, forged);
  const r1 = await S.suggestAdd(JO, [dana.key]);
  const s1 = JSON.parse(stateFile());
  const added = (s1.contacts as { id: string; companyId: string; via?: string; by: string }[]).filter((p) => p.via === "suggest");
  check("only the ticked person is added (Sam was not ticked)", added.length === 1 && added[0].companyId === "c_cedar" && added[0].by === "mem_jo" && !JSON.stringify(s1.values).includes("Sam Iverson"), added);
  const keys = Object.keys(s1.values).filter((k) => k.startsWith(`${added[0].id}.`)).sort();
  check("only the name, the title and the relationship go in", JSON.stringify(keys) === JSON.stringify([`${added[0].id}.name`, `${added[0].id}.relationship`, `${added[0].id}.title`].sort()) && s1.values[`${added[0].id}.relationship`].value === "Decision maker" && s1.values[`${added[0].id}.title`].value === "CEO", keys);
  check("never the email from the file (nor its profile address) anywhere in the shared record", !JSON.stringify(s1.values).includes(SECRET_EMAIL) && !JSON.stringify(s1.values).includes("dana-whitfield-fake"));
  const earned = (s1.ledger as { memberId: string; delta: number; reason: string }[]).filter((l) => l.memberId === "mem_jo" && l.reason === "fill");
  check("1 credit for the person", r1.earned === 1 && earned.reduce((a, l) => a + l.delta, 0) === 1 && /You earned 1 credit/.test(r1.message), { r1, earned });
  check("added people are suggested no more; the rest stay", !r1.view.rows.some((r) => r.key === dana.key) && r1.view.rows.some((r) => r.key === sam.key));
  check("adding the same person again is refused", /aren't suggested/.test((await err(() => S.suggestAdd(JO, [dana.key]))) ?? ""));
  // The day's earning cap: 25 credits earned today already.
  await t.tableInternals.mutate((st) => {
    for (let i = 0; i < 24; i++) st.ledger.push({ memberId: "mem_jo", delta: 1, reason: "fill", ref: `c_quill.fake${i}`, at: new Date().toISOString() } as never);
  });
  const capped = (await S.suggestView(JO))!;
  check("at the cap, the list says no more credits today", capped.earnLeft === 0, capped.earnLeft);
  const r2 = await S.suggestAdd(JO, [sam.key]);
  check("...and the person is still added, for no credit, and it says why", r2.added === 1 && r2.earned === 0 && /earned today's 25/.test(r2.message), r2.message);
  // "No": remembered.
  await P.importContacts(JO, `${CSV}\nNoel Hart,Quillmoor,COO,`);
  const v3 = (await S.suggestView(JO))!;
  const noel = v3.rows.find((r) => r.name === "Noel Hart");
  check("a new file's leader is suggested", !!noel, v3.rows.map((r) => r.name));
  const after = await S.suggestSkip(JO, [noel!.key]);
  check("Don't suggest again is remembered, as a one-way key, never the name", !after.rows.some((r) => r.name === "Noel Hart") && JSON.parse(stateFile()).paths.mem_jo.suggest.skip.includes(noel!.key) && !JSON.stringify(JSON.parse(stateFile()).paths.mem_jo.suggest).includes("Noel"));

  /* ---------- 4. remove, closure, export ---------- */
  console.log("\nRemove my name, closing the account, the export");
  await t.nameOffByName("Dana Whitfield", "Cedar and Pine");
  const s4 = JSON.parse(stateFile());
  check("Remove my name takes a suggested person off, with every fact on them", !(s4.contacts as { via?: string; companyId: string }[]).some((p) => p.via === "suggest" && p.companyId === "c_cedar") && !Object.keys(s4.values).some((k) => k.startsWith(`${added[0].id}.`)));
  await t.tableInternals.mutate((st) => {
    const sg = (st as unknown as { paths: Record<string, { suggest?: { skip: string[]; added: string[] } }> }).paths.mem_jo.suggest!;
    sg.added = [];
  });
  check("...and they are never suggested again (Remove my name's mark), even with the member's own list cleared", !(await S.suggestView(JO))!.rows.some((r) => r.name === "Dana Whitfield"));
  const ex = JSON.stringify(await t.exportState());
  check("the admin export leaves the member's suggestion keys out (they live with their files)", !ex.includes(noel!.key) && !ex.includes(dana.key) && !ex.includes("\"skip\""));
  await t.tableInternals.mutate((st, sd) => {
    t.tableInternals.purgeMember(st, sd, "mem_jo", new Date().toISOString());
  });
  check("closing the account deletes them with the files", !JSON.parse(stateFile()).paths?.mem_jo);

  /* ---------- 5. docs ---------- */
  console.log("\nDocs");
  const doc = readFileSync(new URL("../docs/data-flows.md", import.meta.url), "utf8");
  const page = readFileSync(new URL("../app/data/DataFlows.tsx", import.meta.url), "utf8");
  check("docs/data-flows.md says what it adds and what it never does", /Suggested additions from your connections/.test(doc) && /RN_SUGGEST/.test(doc) && /never an email/i.test(doc) && /Google/.test(doc) && /California/.test(doc));
  check("the /data page says it too", /Suggested additions/.test(page) && /never an email/i.test(page));
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
