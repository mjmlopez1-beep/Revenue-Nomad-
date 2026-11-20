/**
 * Checks of the same person on two records at one company (samePersonHeld in lib/table.ts): a
 * person is kept per company or per seat, so one decision maker can be on file twice. No server:
 * lib/table.ts runs in process on a made-up seed in a temporary data dir, with fetch replaced, so
 * nothing leaves the machine.
 *
 *   npx tsx scripts/test-same-person.mts      exits 1 on any failure
 *
 * Covered:
 *   - the same name (sameName) at the same company opens the other record's name and title for the
 *     member who paid for one of them, at no charge, and the unlock refuses to charge for it;
 *   - a different name at that company, and the same name at another company, stay locked;
 *   - a past unlock (one in the state before this rule, of the title half) opens the twin too;
 *   - LinkedIn, email and phone come over only when the other record's value is the one paid for;
 *   - only a purchase counts: a name the member typed in themselves opens nothing;
 *   - nothing reaches another member, and a record that stays locked reads exactly as it does for
 *     a member who paid for nobody there (its cells, the company's counts, no name in the JSON);
 *   - the first page (?first=1), the patch Today builds from (viewPatch) and the connector
 *     (get_company, unlock) give the same answer as the table.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-same-person-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();

const companies = [
  { id: "c_twin", fields: { name: "Twinfold Labs", website: "twinfold.example", industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } },
  { id: "c_other", fields: { name: "Otherway Systems", website: "otherway.example", industry: "SaaS", employees: "11–50", revenue: "$1M–$5M", hq: "Denver, CO" } },
  { id: "c_plain", fields: { name: "Plainview Goods", website: "plainview.example", industry: "Manufacturing", employees: "11–50", revenue: "$1M–$5M", hq: "Boise, ID" } },
];
const engagements = [
  { id: "e_twin_a", companyId: "c_twin", verified: false, fields: { source: "Seat scan", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-03", status: "Active", end: "Ongoing" } },
  { id: "e_other_a", companyId: "c_other", verified: false, fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2025-05", status: "Active", end: "Ongoing" } },
  { id: "e_plain_a", companyId: "c_plain", verified: false, fields: { source: "Seat scan", role: "Fractional CFO", function: "Finance", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" } },
];
const contacts = [
  // The same person twice at Twinfold: once for the company, once on the seat (a middle initial and lower case on one).
  {
    id: "p_twin_co",
    companyId: "c_twin",
    fields: { name: "Dana Q. Rivers", title: "Chief Executive Zeta", relationship: "Decision maker", email: "dana@twinfold.example", linkedin: "https://www.linkedin.com/in/dana-rivers-zz", phone: "512.555.0101" },
  },
  {
    id: "p_twin_seat",
    engagementId: "e_twin_a",
    fields: { name: "dana rivers", title: "Founder Omega", relationship: "Decision maker", email: "DANA@twinfold.example ", linkedin: "https://linkedin.com/in/dana-rivers-other", phone: "(512) 555-0101" },
  },
  // Someone else at Twinfold: another surname, and another first name.
  { id: "p_twin_near", engagementId: "e_twin_a", fields: { name: "Dana Riversong", title: "Treasurer Quokka", relationship: "Reported to", email: "near@twinfold.example" } },
  { id: "p_twin_cfo", companyId: "c_twin", fields: { name: "Morgan Halewood", title: "Controller Narwhal", relationship: "Reported to", email: "morgan@twinfold.example" } },
  // The same name at another company: another person as far as Merlin can tell.
  { id: "p_other_dana", companyId: "c_other", fields: { name: "Dana Rivers", title: "Board Observer Ibis", relationship: "Decision maker", email: "dana@otherway.example" } },
  // A third company, where Pia paid for the title half of one record before this rule existed.
  { id: "p_plain_seat", engagementId: "e_plain_a", fields: { name: "Lee Okonkwo", title: "Owner Pelican", relationship: "Decision maker" } },
  { id: "p_plain_co", companyId: "c_plain", fields: { name: "Lee B. Okonkwo", title: "President Heron", relationship: "Decision maker" } },
];
const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_sal", name: "Sal Sameperson", email: "sal.same@example.com", title: "Fractional VP Sales", token: "tok-sal-same" },
    { id: "mem_mo", name: "Mo Otherone", email: "mo.same@example.com", title: "Fractional CMO", token: "tok-mo-same" },
    { id: "mem_pia", name: "Pia Pastunlock", email: "pia.same@example.com", title: "Fractional CFO", token: "tok-pia-same" },
    { id: "mem_ada", name: "Ada Admin", email: "admin-same@example.com", title: "Admin", token: "tok-ada-same" },
  ],
  companies,
  engagements,
  contacts,
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [
      { memberId: "mem_pia", delta: -2, reason: "unlock", ref: "c_plain.identity", at: ago(10 * DAY) },
      { memberId: "mem_pia", delta: -1, reason: "unlock", ref: "p_plain_co.title", at: ago(9 * DAY) },
    ],
    values: {},
    // Pia's purchases from before: the company, and the title half of the company-level record.
    unlocks: { "c_plain.identity": ["mem_pia"], "p_plain_co.title": ["mem_pia"] },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(HOUR)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, { function: "Sales", onboarded: true }])),
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-same@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_INTEL_SEED_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));

async function main() {
  const t = await import("../lib/table");
  const { firstPage } = await import("../lib/firstPage");
  const { unpackView } = await import("../lib/viewWire");
  const tools = await import("../lib/mcp/tools");
  type View = Awaited<ReturnType<typeof t.buildView>>;
  type Company = View["companies"][number];
  type Person = Company["people"][number];
  const BASE = "https://post.example.com";
  const SAL = "tok-sal-same";
  const MO = "tok-mo-same";
  const PIA = "tok-pia-same";

  // Public ids: companies from the admin's table (admins see every company's name), people from their seed ids.
  const ada = await t.buildView("tok-ada-same");
  const coOf = (name: string) => ada.companies.find((c) => c.name === name)!;
  const peopleOf = (c: Company): Person[] => [...c.people, ...c.engagements.flatMap((e) => e.people)];
  const personId = (co: string, seedId: string) => peopleOf(coOf(co)).find((p) => p.id === t.tableInternals.pubId(seedId))?.id ?? "";
  const TWIN = coOf("Twinfold Labs").id;
  const OTHER = coOf("Otherway Systems").id;
  const PLAIN = coOf("Plainview Goods").id;
  const P = {
    co: personId("Twinfold Labs", "p_twin_co"),
    seat: personId("Twinfold Labs", "p_twin_seat"),
    near: personId("Twinfold Labs", "p_twin_near"),
    cfo: personId("Twinfold Labs", "p_twin_cfo"),
    other: personId("Otherway Systems", "p_other_dana"),
    plainSeat: personId("Plainview Goods", "p_plain_seat"),
    plainCo: personId("Plainview Goods", "p_plain_co"),
  };
  check("the made-up seed's people are all on file", Object.values(P).every(Boolean), P);

  const view = (tok: string) => t.buildView(tok);
  const person = (v: View, id: string) => v.companies.flatMap(peopleOf).find((p) => p.id === id)!;
  const company = (v: View, id: string) => v.companies.find((c) => c.id === id)!;
  const cell = (v: View, id: string, f: string) => person(v, id).cells[f];
  const credits = async (tok: string) => (await view(tok)).me!.credits;
  const unlock = (tok: string, id: string, field: string) => t.perform(tok, { type: "unlock", entity: "contact", id, field }, BASE);
  const refused = async (tok: string, id: string, field: string) => {
    try {
      await unlock(tok, id, field);
      return null;
    } catch (e) {
      return (e as Error).message;
    }
  };

  // Sal and Mo both open the two companies (a person there opens only after the company).
  for (const tok of [SAL, MO]) for (const co of [TWIN, OTHER]) await t.perform(tok, { type: "unlock", entity: "company", id: co, field: "identity" }, BASE);
  let sal = await view(SAL);
  check(
    "before: every person at Twinfold is locked for Sal",
    [P.co, P.seat, P.near, P.cfo].every((id) => cell(sal, id, "name").s === "locked" && cell(sal, id, "title").s === "locked"),
  );

  // Sal pays for the company-level record's name (1 credit).
  const c0 = await credits(SAL);
  await unlock(SAL, P.co, "name");
  sal = await view(SAL);
  check("Sal paid 1 credit for the first record's name and title", (await credits(SAL)) === c0 - 1, { before: c0, after: await credits(SAL) });
  check("the first record shows name and title", cell(sal, P.co, "name").s === "value" && cell(sal, P.co, "title").s === "value");
  const twinName = cell(sal, P.seat, "name");
  const twinTitle = cell(sal, P.seat, "title");
  check(
    "same name at the same company: the seat's record opens, its own name and title",
    twinName.s === "value" && twinName.v === "dana rivers" && twinTitle.s === "value" && twinTitle.v === "Founder Omega",
    [twinName, twinTitle],
  );
  check("a different name at that company stays locked (another surname)", cell(sal, P.near, "name").s === "locked" && cell(sal, P.near, "title").s === "locked");
  check("a different name at that company stays locked (another person)", cell(sal, P.cfo, "name").s === "locked" && cell(sal, P.cfo, "title").s === "locked");
  check("the same name at another company stays locked", cell(sal, P.other, "name").s === "locked" && cell(sal, P.other, "title").s === "locked");

  // No charge for the second record.
  const c1 = await credits(SAL);
  const r1 = await refused(SAL, P.seat, "name");
  const r2 = await refused(SAL, P.seat, "title");
  check("unlocking the second record's name refuses to charge", !!r1 && /no credit was spent/i.test(r1), r1);
  check("and so does its title", !!r2 && /no credit was spent/i.test(r2), r2);
  const dry = await t.perform(SAL, { type: "unlockMany", items: [{ entity: "contact", id: P.seat, field: "name" }, { entity: "contact", id: P.seat, field: "title" }] }, BASE, { dryRun: true });
  check("Unlock all on it quotes nothing", (dry.spent ?? 0) === 0, dry);
  check("Sal's credits did not move", (await credits(SAL)) === c1, { before: c1, after: await credits(SAL) });

  // Contact details: locked on the twin until paid for on the first, then only an identical value comes over.
  check("the twin's contact details stay locked before any is paid for", ["email", "linkedin", "phone"].every((f) => cell(sal, P.seat, f).s === "locked"));
  await unlock(SAL, P.co, "email");
  await unlock(SAL, P.co, "linkedin");
  await unlock(SAL, P.co, "phone");
  sal = await view(SAL);
  check("an email identical to the one paid for comes over (case and spaces aside)", cell(sal, P.seat, "email").s === "value", cell(sal, P.seat, "email"));
  check("a phone with the same digits comes over (how it is written aside)", cell(sal, P.seat, "phone").s === "value", cell(sal, P.seat, "phone"));
  check("a different LinkedIn stays locked", cell(sal, P.seat, "linkedin").s === "locked", cell(sal, P.seat, "linkedin"));
  const c2 = await credits(SAL);
  const r3 = await refused(SAL, P.seat, "email");
  check("unlocking the email that came over refuses to charge", !!r3 && /no credit was spent/i.test(r3) && (await credits(SAL)) === c2, r3);
  await unlock(SAL, P.seat, "linkedin");
  sal = await view(SAL);
  check("the twin's own LinkedIn can be bought (1 credit), as its name is known", cell(sal, P.seat, "linkedin").s === "value" && (await credits(SAL)) === c2 - 1);
  check("the different people's details stay locked", [P.near, P.cfo, P.other].every((id) => cell(sal, id, "email").s === "locked"));

  // Another member: nothing of Sal's reaches Mo, and the records that stay locked read the same for both.
  const mo = await view(MO);
  check("Mo sees every person at Twinfold locked", [P.co, P.seat, P.near, P.cfo].every((id) => ["name", "title", "email", "phone", "linkedin"].every((f) => cell(mo, id, f).s !== "value")));
  const moJson = JSON.stringify(mo);
  check("no name, title or detail Sal opened is anywhere in Mo's table", !/Rivers|rivers|Zeta|Omega|dana@|DANA@|555/.test(moJson));
  for (const id of [P.near, P.cfo, P.other]) check(`a record that stays locked reads the same for Sal and Mo (${id === P.near ? "another surname" : id === P.cfo ? "another person" : "another company"})`, same(person(sal, id).cells, person(mo, id).cells), [person(sal, id).cells.name, person(mo, id).cells.name]);
  check("the other company's record is the same for Sal and Mo, counts included", same(company(sal, OTHER).people, company(mo, OTHER).people) && same(company(sal, OTHER).facts, company(mo, OTHER).facts));
  const salJson = JSON.stringify(sal);
  check("no locked name or title is anywhere in Sal's table", !/Riversong|Treasurer Quokka|Halewood|Controller Narwhal|Board Observer Ibis|near@|morgan@|dana@otherway/.test(salJson));

  // A past unlock (the title half, from before this rule) opens the twin too, when the table is built.
  const pia = await view(PIA);
  check("a past unlock of one record's title opens it", cell(pia, P.plainCo, "name").s === "value" && cell(pia, P.plainCo, "title").s === "value");
  check("and its same-name record at that company, built from the unlock already on file", cell(pia, P.plainSeat, "name").s === "value" && cell(pia, P.plainSeat, "title").s === "value");
  const r4 = await refused(PIA, P.plainSeat, "name");
  check("which Pia can't be charged for", !!r4 && /no credit was spent/i.test(r4), r4);
  check("Pia's unlock opens nothing for Sal", cell(sal, P.plainSeat, "name").s !== "value" && cell(sal, P.plainCo, "name").s !== "value");

  // The other ways in: ?first=1, the patch Today is built from, and the connector.
  const full = await view(SAL);
  const fp = await firstPage(SAL, `?c=${TWIN}`);
  const fpRec = fp && "view" in fp ? unpackView(JSON.parse(JSON.stringify(fp.view))).companies.find((c) => c.id === TWIN) : undefined;
  check("?first=1 carries Twinfold exactly as the table does", !!fpRec && same(fpRec, company(full, TWIN)));
  const patch = await t.viewPatch(SAL, [TWIN]);
  check("the patch Today builds from (viewPatch) carries Twinfold exactly as the table does", !!patch && same(patch.companies?.find((c) => c.id === TWIN), company(full, TWIN)));
  const moPatch = await t.viewPatch(MO, [TWIN]);
  check("and Mo's patch keeps it locked", !!moPatch && peopleOf(moPatch.companies!.find((c) => c.id === TWIN)!).every((p) => p.cells.name.s !== "value"));

  const ctx = { member: (await t.memberForToken(SAL))!, origin: BASE };
  const got = JSON.stringify(await tools.getCompany(ctx, { company: TWIN }));
  check("the connector's get_company shows the second record's name and title", got.includes("dana rivers") && got.includes("Founder Omega"));
  check("and none of the locked people", !/Riversong|Halewood|Quokka|Narwhal/.test(got));
  const q = (await tools.unlock(ctx, { entity: "person", id: P.seat, field: "name" })) as { spent?: number; would_spend?: number; message: string };
  check("the connector's unlock of the second record spends nothing", q.spent === 0 && /Nothing to unlock/.test(q.message), q);
  const q2 = (await tools.unlock(ctx, { entity: "person", id: P.near, field: "name" })) as { would_spend?: number };
  check("and quotes 1 credit for the different person", q2.would_spend === 1, q2);
  const moCtx = { member: (await t.memberForToken(MO))!, origin: BASE };
  const moGot = JSON.stringify(await tools.getCompany(moCtx, { company: TWIN }));
  check("Mo's get_company names nobody at Twinfold", !/Rivers|rivers|Halewood|Founder Omega|Zeta/.test(moGot));
  const q3 = (await tools.unlock(moCtx, { entity: "person", id: P.seat, field: "name" })) as { would_spend?: number };
  check("and Mo is still quoted 1 credit for the second record", q3.would_spend === 1, q3);

  // Search: the connector's search never finds a locked name.
  const s1 = JSON.stringify(await tools.searchCompanies(ctx, { query: "Riversong" }).catch((e) => ({ error: String(e) })));
  check("the connector's search for a locked name at Twinfold does not find it", !s1.includes(TWIN), s1.slice(0, 200));

  // Only a purchase counts: a name the member typed in themselves opens nothing (or adding a guess would test a locked name).
  await t.perform(PIA, { type: "unlock", entity: "company", id: TWIN, field: "identity" }, BASE);
  await t.perform(PIA, { type: "addPerson", companyId: TWIN, person: { name: "Dana X. Rivers", title: "Guess Title" } }, BASE);
  const piaTwin = await view(PIA);
  check("a name Pia typed in herself opens neither record of that name", [P.co, P.seat].every((id) => cell(piaTwin, id, "name").s === "locked" && cell(piaTwin, id, "title").s === "locked"));
  check("and Pia's table names nobody else at Twinfold", !/Dana Q|dana rivers|Zeta|Omega/.test(JSON.stringify(company(piaTwin, TWIN))));
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
