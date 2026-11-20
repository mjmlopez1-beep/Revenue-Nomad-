/**
 * Funding from SEC Form D filings (lib/funding): the EDGAR listings and the Form D document
 * parsed from fixtures, the fair-access fetcher (User-Agent, spacing, backoff, stop on 403), the
 * conservative match to companies on file, the daily run on a made-up seed (events kept, never a
 * person's name, never twice, never a new company, counts by reason, a dry run keeps nothing),
 * the radar's funding source with RN_FUNDING=1 and the card's words. No network: every fetch is
 * a fixture, and the run is in a temporary data folder.
 *
 *   npx tsx scripts/test-funding.mts
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

/* ---------- a scratch table ---------- */

const dir = mkdtempSync(path.join(tmpdir(), "rn-funding-"));
const seed = {
  builtAt: "2026-10-01T00:00:00.000Z",
  members: [{ id: "m1", name: "Sal Sales", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal" }],
  companies: [
    { id: "c_quill", fields: { name: "Quillfeather Analytics", website: "quillfeather.example.com", hq: "Austin, TX", industry: "SaaS" } },
    { id: "c_zorb", fields: { name: "Zorbix", website: "zorbix.example.com", hq: "Denver, Colorado", industry: "SaaS" } },
    { id: "c_nohq", fields: { name: "Plinkett", website: "plinkett.example.com", industry: "SaaS" } },
    { id: "c_twin1", fields: { name: "Marrowgate Labs", website: "marrowgate.example.com", hq: "Boston, MA" } },
    { id: "c_twin2", fields: { name: "Marrowgate Labs Inc", website: "marrowgate-labs.example.com", hq: "Chicago, IL" } },
    { id: "c_summit", fields: { name: "Summit", website: "summit.example.com", hq: "Austin, TX" } },
    { id: "c_kelp", fields: { name: "Kelpwise Software", website: "kelpwise.example.com", hq: "Portland, Oregon", industry: "SaaS" } },
    { id: "c_brine", fields: { name: "Brinestone Systems", website: "brinestone.example.com", hq: "Miami, FL", industry: "Enterprise Software" } },
    { id: "c_uk", fields: { name: "Thistledown Robotics", website: "thistledown.example.co.uk", hq: "London, United Kingdom", industry: "Hardware / IoT" } },
  ],
  engagements: [{ id: "e_quill", companyId: "c_quill", fields: { source: "Published engagement", operator: "Sal Sales", function: "Sales" } }],
  contacts: [],
};
writeFileSync(path.join(dir, "seed.json"), JSON.stringify(seed));
Object.assign(process.env, { RN_DATA_DIR: dir, RN_INTEL_SEED: path.join(dir, "seed.json"), RN_STARTER_CREDITS: "25", RN_LOGO_LOOKUP: "off", RN_SCAN_TEST: "1" });
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_FUNDING"]) delete process.env[k];
console.error = process.env.FUNDING_DEBUG ? console.error : () => {};
console.warn = () => {};
console.log = ((log) => (...a: unknown[]) => (/^(PASS|FAIL|\n|[0-9]+ passed)/.test(String(a[0])) ? log(...a) : undefined))(console.log);

const sec = await import("../lib/funding/sec");
const m = await import("../lib/funding/match");
const types = await import("../lib/funding/types");
const run = await import("../lib/funding/run");
const t = await import("../lib/table");
const radarFunding = await import("../lib/radar/sources/funding");
const sig = await import("../lib/radar/signals");
const present = await import("../lib/radar/present");

/* ---------- fixtures ---------- */

/** People a filing lists. None of these may ever reach the state, an event or a card. */
const PEOPLE = ["Execone Zzyzxalpha", "Directwo Zzyzxbeta", "Signthree Zzyzxgamma"];

const formD = (o: { name: string; state?: string; stateName?: string; industry?: string; amendment?: boolean; firstSale?: string | null; sold?: string; offered?: string; types?: string; combination?: boolean; fund?: string }) => `<?xml version="1.0"?>
<edgarSubmission>
  <schemaVersion>X0708</schemaVersion>
  <submissionType>${o.amendment ? "D/A" : "D"}</submissionType>
  <testOrLive>LIVE</testOrLive>
  <primaryIssuer>
    <cik>0009990001</cik>
    <entityName>${o.name}</entityName>
    <issuerAddress>
      <street1>1 Example Way</street1>
      <city>Somewhere</city>
      <stateOrCountry>${o.state ?? "TX"}</stateOrCountry>
      <stateOrCountryDescription>${o.stateName ?? "TEXAS"}</stateOrCountryDescription>
      <zipCode>00000</zipCode>
    </issuerAddress>
    <jurisdictionOfInc>DELAWARE</jurisdictionOfInc>
    <entityType>Corporation</entityType>
  </primaryIssuer>
  <relatedPersonsList>
    <relatedPersonInfo>
      <relatedPersonName><firstName>Execone</firstName><lastName>Zzyzxalpha</lastName></relatedPersonName>
      <relatedPersonRelationshipList><relationship>Executive Officer</relationship></relatedPersonRelationshipList>
    </relatedPersonInfo>
    <relatedPersonInfo>
      <relatedPersonName><firstName>Directwo</firstName><lastName>Zzyzxbeta</lastName></relatedPersonName>
      <relatedPersonRelationshipList><relationship>Director</relationship></relatedPersonRelationshipList>
    </relatedPersonInfo>
  </relatedPersonsList>
  <offeringData>
    <industryGroup><industryGroupType>${o.industry ?? "Other Technology"}</industryGroupType>${o.fund ?? ""}</industryGroup>
    <issuerSize><revenueRange>Decline to Disclose</revenueRange></issuerSize>
    <federalExemptionsExclusions><item>06b</item></federalExemptionsExclusions>
    <typeOfFiling>
      <newOrAmendment><isAmendment>${o.amendment ? "true" : "false"}</isAmendment></newOrAmendment>
      <dateOfFirstSale>${o.firstSale === null ? "<yetToOccur>true</yetToOccur>" : `<value>${o.firstSale ?? "2026-11-02"}</value>`}</dateOfFirstSale>
    </typeOfFiling>
    <typesOfSecuritiesOffered>${o.types ?? "<isEquityType>true</isEquityType>"}</typesOfSecuritiesOffered>
    <businessCombinationTransaction><isBusinessCombinationTransaction>${o.combination ? "true" : "false"}</isBusinessCombinationTransaction></businessCombinationTransaction>
    <offeringSalesAmounts>
      <totalOfferingAmount>${o.offered ?? "6000000"}</totalOfferingAmount>
      <totalAmountSold>${o.sold ?? "4500000"}</totalAmountSold>
      <totalRemaining>1500000</totalRemaining>
    </offeringSalesAmounts>
    <signatureBlock>
      <signature><issuerName>${o.name}</issuerName><signatureName>Signthree Zzyzxgamma</signatureName><nameOfSigner>Signthree Zzyzxgamma</nameOfSigner><signatureTitle>CEO</signatureTitle></signature>
    </signatureBlock>
  </offeringData>
</edgarSubmission>`;

const idxLine = (form: string, name: string, cik: string, day: string, acc: string) => `${form.padEnd(12)}${name.padEnd(62)}${cik.padEnd(12)}${day.replace(/-/g, "")}    edgar/data/${cik}/${acc}.txt`;
const indexText = (day: string, lines: string[]) => `Description:           Daily Index of EDGAR Dissemination Feed by Form Type
Last Data Received:    ${day}
Comments:              webmaster@sec.gov
Anonymous FTP:         ftp://ftp.sec.gov/edgar/




Form Type   Company Name                                                  CIK         Date Filed  File Name
---------------------------------------------------------------------------------------------------------------------------------------------
${idxLine("10-K", "QUILLFEATHER ANALYTICS INC", "9990001", day, "0009990001-26-000009")}
${lines.join("\n")}
`;

/* ---------- the listings ---------- */

console.log("\nEDGAR listings");
const sampleIdx = indexText("2026-11-17", [
  idxLine("D", "QUILLFEATHER ANALYTICS, INC.", "9990001", "2026-11-17", "0009990001-26-000001"),
  idxLine("D/A", "ZORBIX INC", "9990002", "2026-11-17", "0009990002-26-000001"),
  idxLine("D", "SUN VALLEY 708, LLC", "9990003", "2026-11-17", "0009990003-26-000001"),
]);
const listed = sec.parseFormIndex(sampleIdx);
eq("the daily index gives Form D and D/A lines only", listed.map((l) => [l.form, l.name, l.cik, l.filed, l.accession]), [
  ["D", "QUILLFEATHER ANALYTICS, INC.", "9990001", "2026-11-17", "0009990001-26-000001"],
  ["D/A", "ZORBIX INC", "9990002", "2026-11-17", "0009990002-26-000001"],
  ["D", "SUN VALLEY 708, LLC", "9990003", "2026-11-17", "0009990003-26-000001"],
]);
eq("  and nothing from text that isn't an index", sec.parseFormIndex("<html>Not found</html>"), []);
const efts = {
  hits: {
    total: { value: 2, relation: "eq" },
    hits: [
      { _id: "0009990001-26-000001:primary_doc.xml", _source: { ciks: ["0009990001"], display_names: ["Quillfeather Analytics, Inc.  (CIK 0009990001)"], file_date: "2026-11-17", form: "D", adsh: "0009990001-26-000001", biz_states: ["TX"] } },
      { _id: "0009990005-26-000002:primary_doc.xml", _source: { ciks: ["0009990005", "0009990006"], display_names: ["Fund IV, LP  (CIK 0009990005)", "Fund IV-A, LP  (CIK 0009990006)"], file_date: "2026-11-17", form: "D/A", adsh: "0009990005-26-000002", biz_states: ["VA", "VA"] } },
    ],
  },
};
const ep = sec.parseEfts(efts);
eq("full-text search gives one listing per issuer, with its state", ep?.listings.map((l) => [l.form, l.name, l.cik, l.state]), [["D", "Quillfeather Analytics, Inc.", "9990001", "TX"], ["D/A", "Fund IV, LP", "9990005", "VA"], ["D/A", "Fund IV-A, LP", "9990006", "VA"]]);
eq("  and its total", ep?.total, 2);
eq("  and null for anything else", sec.parseEfts({ error: "x" }), null);
eq("where things are", [sec.dayIndexUrl("2026-11-17"), sec.eftsUrl("2026-11-17", 100), sec.primaryDocUrl("0009990001", "0009990001-26-000001")], [
  "https://www.sec.gov/Archives/edgar/daily-index/2026/QTR4/form.20261117.idx",
  "https://efts.sec.gov/LATEST/search-index?forms=D&dateRange=custom&startdt=2026-11-17&enddt=2026-11-17&from=100",
  "https://www.sec.gov/Archives/edgar/data/9990001/000999000126000001/primary_doc.xml",
]);

/* ---------- one filing ---------- */

console.log("\nThe Form D document");
const fd = sec.parseFormD(formD({ name: "Quillfeather Analytics, Inc.", types: "<isOtherType>true</isOtherType><descriptionOfOtherType>Simple Agreement for Future Equity (SAFE)</descriptionOfOtherType>" }))!;
eq("the issuer and the offering are read", [fd.name, fd.stateCode, fd.stateName, fd.industry, fd.amendment, fd.firstSale, fd.offered, fd.sold, fd.isFund, fd.combination], ["Quillfeather Analytics, Inc.", "TX", "TEXAS", "Other Technology", false, "2026-11-02", 6000000, 4500000, false, false]);
check("no person in what is read", !PEOPLE.some((p) => JSON.stringify(fd).includes(p.split(" ")[1])), fd);
eq("a SAFE, equity, a convertible note, debt", [
  sec.roundOf(fd),
  sec.roundOf(sec.parseFormD(formD({ name: "X" }))!),
  sec.roundOf(sec.parseFormD(formD({ name: "X", types: "<isDebtType>true</isDebtType><isOptionToAcquireType>true</isOptionToAcquireType>" }))!),
  sec.roundOf(sec.parseFormD(formD({ name: "X", types: "<isDebtType>true</isDebtType>" }))!),
  sec.roundOf(sec.parseFormD(formD({ name: "X", types: "<isEquityType>true</isEquityType><isDebtType>true</isDebtType>" }))!),
], ["SAFE", "equity", "convertible note", "debt", null]);
const fundDoc = sec.parseFormD(formD({ name: "Y Fund", industry: "Pooled Investment Fund", fund: "<investmentFundInfo><investmentFundType>Venture Capital Fund</investmentFundType></investmentFundInfo>" }))!;
check("a pooled investment fund is a fund", fundDoc.isFund);
eq("an amendment, a merger, nothing sold yet, Indefinite", [
  sec.parseFormD(formD({ name: "X", amendment: true }))!.amendment,
  sec.parseFormD(formD({ name: "X", combination: true }))!.combination,
  sec.parseFormD(formD({ name: "X", firstSale: null }))!.firstSale,
  sec.parseFormD(formD({ name: "X", offered: "Indefinite" }))!.offered,
], [true, true, null, null]);
eq("not a Form D: null", [sec.parseFormD("<html></html>"), sec.parseFormD("")], [null, null]);
eq("amount bands", [100_000, 400_000, 4_500_000, 12_000_000, 30_000_000, 75_000_000, 250_000_000].map(sec.amountBand), ["Under $250K", "$250K–$1M", "$1M–$5M", "$5M–$20M", "$20M–$50M", "$50M–$100M", "$100M+"]);
eq("about amounts", [450_000, 2_500_000, 4_500_000, 12_300_000, 1_200_000_000, 9_000].map(sec.aboutAmount), ["about $450K", "about $2.5M", "about $4.5M", "about $12M", "about $1.2B", "about $10K"]);
eq("the card's note", [types.fundingNote("2026-10-14"), types.fundingNote("bad")], ["SEC filing, Oct 2026", "SEC filing"]);

/* ---------- the fetcher ---------- */

console.log("\nFair access");
check("a User-Agent that says who we are, with the company's contact", sec.SEC_UA === "Merlin data bot admin@revenuenomad.com");
{
  const calls: number[] = [];
  const answers = [{ status: 429, text: "" }, { status: 503, text: "" }, { status: 200, text: "ok" }];
  const slept: number[] = [];
  const f = sec.secFetcher({
    gapMs: 30,
    raw: async () => (calls.push(Date.now()), answers.shift() ?? { status: 200, text: "ok" }),
    sleep: async (ms) => void slept.push(ms),
  });
  const r = await f("https://www.sec.gov/x");
  eq("429 and 503 are retried with backoff, then the answer comes", [r.status, r.text, calls.length, slept.filter((x) => x >= 1000)], [200, "ok", 3, [1000, 2000]]);
  const g = sec.secFetcher({ gapMs: 40, raw: async () => (calls.push(Date.now()), { status: 200, text: "" }) });
  calls.length = 0;
  await Promise.all([g("https://www.sec.gov/a"), g("https://www.sec.gov/b"), g("https://www.sec.gov/c"), g("https://www.sec.gov/d")]);
  const gaps = calls.slice(1).map((x, i) => x - calls[i]);
  check("one request at a time, spaced (never over 10 a second)", gaps.every((x) => x >= 35), gaps);
  const h = sec.secFetcher({ gapMs: 0, raw: async () => ({ status: 403, text: "Undeclared Automated Tool" }) });
  let refused = false;
  await h("https://www.sec.gov/z").catch((e) => (refused = e instanceof sec.SecRefused));
  check("403 stops: no retry", refused);
  const k = sec.secFetcher({ gapMs: 0, retries: 2, raw: async () => ({ status: 0, text: "" }), sleep: async () => {} });
  eq("a network error, after the retries, is status 0", (await k("https://www.sec.gov/y")).status, 0);
}

/* ---------- matching ---------- */

console.log("\nMatching, conservatively");
eq("legal suffixes, Holdings, Co and EDGAR's tags go", ["ACME ROBOTICS, INC.", "Acme Robotics Holdings, Inc.", "Acme Robotics Corp /DE/", "Acme Robotics, LLC", "Acme Robotics Co.", "The Acme Robotics PBC", "Acme Robotics Inc d/b/a Acmebot"].map(m.fundingKey), Array(7).fill("acmerobotics"));
check("  but a different name stays different", m.fundingKey("Acme Robotics Technologies Inc") !== m.fundingKey("Acme Robotics"));
eq("generic names", ["Summit", "Digital Solutions LLC", "Global Capital Partners, LP", "ABC Inc", "Stealth Startup", "Quillfeather Analytics", "Zorbix"].map(m.isGenericName), [true, true, true, true, true, false, false]);
const targets = run.fundingTargets(await t.loadSeed(), await t.loadState());
check("the companies on file are the targets", targets.length === seed.companies.length && targets.find((x) => x.id === "c_quill")?.region === "Texas", targets);
const idx = m.fundingIndex(targets);
const cand = (n: string) => {
  const r = m.candidateFor(n, idx);
  return "skip" in r ? r.skip : r.company.id;
};
eq("a listing's name: one company, none, two, too common", [cand("QUILLFEATHER ANALYTICS, INC."), cand("NORTHWIND TRADERS LLC"), cand("MARROWGATE LABS, INC."), cand("SUMMIT INC")], ["c_quill", "no-company", "ambiguous", "generic-name"]);
const q = targets.find((x) => x.id === "c_quill")!;
const z = targets.find((x) => x.id === "c_zorb")!;
const nohq = targets.find((x) => x.id === "c_nohq")!;
const uk = targets.find((x) => x.id === "c_uk")!;
eq("the place and industry decide", [
  m.confirmMatch(q, { name: "Quillfeather Analytics Inc", stateName: "TEXAS", industry: "Other Technology" }),
  m.confirmMatch(q, { name: "Quillfeather Analytics Inc", stateName: "OHIO", industry: "Other Technology" }),
  m.confirmMatch(q, { name: "Quillfeather Analytics Inc", stateName: "TEXAS", industry: "Residential" }),
  m.confirmMatch(z, { name: "Zorbix Inc", stateName: "COLORADO", industry: "Other Technology" }),
  m.confirmMatch(nohq, { name: "Plinkett Inc", stateName: "CALIFORNIA", industry: null }),
  m.confirmMatch(uk, { name: "Thistledown Robotics Ltd", stateName: "UNITED KINGDOM", industry: "Manufacturing" }),
  m.confirmMatch(uk, { name: "Thistledown Robotics Ltd", stateName: "CALIFORNIA", industry: "Manufacturing" }),
], [null, "place", "industry", null, "place", null, "place"]);
const usOnly = (name: string) => ({ id: "x", name, country: "United States", region: null, industry: null });
eq("a one-word name with only the country on file: the same country and 5 letters or more", [
  m.confirmMatch(usOnly("Vexlio"), { name: "Vexlio Inc", stateName: "TEXAS", industry: null }),
  m.confirmMatch(usOnly("Pask"), { name: "Pask Inc", stateName: "TEXAS", industry: null }),
  m.confirmMatch(usOnly("Vexlio"), { name: "Vexlio Ltd", stateName: "UNITED KINGDOM", industry: null }),
  m.confirmMatch(usOnly("Vexlio"), { name: "Vexlio Inc", stateName: null, industry: null }),
], [null, "place", "place", "place"]);

/* ---------- the daily run ---------- */

console.log("\nThe daily run");
const NOW = "2026-11-19T08:00:00.000Z";
const docs: Record<string, string> = {};
const urls: string[] = [];
const doc = (cik: string, acc: string, xml: string) => void (docs[sec.primaryDocUrl(cik, acc)] = xml);
// Mon 2026-11-16: an index; Tue 2026-11-17: the index can't be read, full-text search answers; Wed 2026-11-18: not posted yet (404, recent).
const day16 = indexText("2026-11-16", [
  idxLine("D", "QUILLFEATHER ANALYTICS, INC.", "9990001", "2026-11-16", "0009990001-26-000001"),
  idxLine("D/A", "ZORBIX INC", "9990002", "2026-11-16", "0009990002-26-000001"),
  idxLine("D", "NORTHWIND TRADERS LLC", "9990003", "2026-11-16", "0009990003-26-000001"),
  idxLine("D", "SUMMIT INC", "9990004", "2026-11-16", "0009990004-26-000001"),
  idxLine("D", "MARROWGATE LABS, INC.", "9990005", "2026-11-16", "0009990005-26-000001"),
  idxLine("D", "KELPWISE SOFTWARE HOLDINGS, INC.", "9990006", "2026-11-16", "0009990006-26-000001"),
  idxLine("D", "BRINESTONE SYSTEMS LLC", "9990007", "2026-11-16", "0009990007-26-000001"),
  idxLine("D", "ZORBIX INC", "9990002", "2026-11-16", "0009990002-26-000002"),
  idxLine("D", "PLINKETT INC", "9990008", "2026-11-16", "0009990008-26-000001"),
]);
doc("9990001", "0009990001-26-000001", formD({ name: "Quillfeather Analytics, Inc.", types: "<isOtherType>true</isOtherType><descriptionOfOtherType>SAFE</descriptionOfOtherType>" }));
doc("9990006", "0009990006-26-000001", formD({ name: "Kelpwise Software Holdings, Inc.", state: "OR", stateName: "OREGON", industry: "Pooled Investment Fund" }));
doc("9990007", "0009990007-26-000001", formD({ name: "Brinestone Systems LLC", state: "FL", stateName: "FLORIDA", sold: "0" }));
doc("9990002", "0009990002-26-000002", formD({ name: "Zorbix Inc", state: "CO", stateName: "COLORADO", sold: "12300000", firstSale: "2026-11-03" }));
doc("9990008", "0009990008-26-000001", formD({ name: "Plinkett Inc", state: "CA", stateName: "CALIFORNIA" }));
const day17Efts = {
  hits: {
    total: { value: 1 },
    hits: [{ _id: "0009990009-26-000001:primary_doc.xml", _source: { ciks: ["0009990009"], display_names: ["Thistledown Robotics Ltd  (CIK 0009990009)"], file_date: "2026-11-17", form: "D", adsh: "0009990009-26-000001", biz_states: ["X0"] } }],
  },
};
doc("9990009", "0009990009-26-000001", formD({ name: "Thistledown Robotics Ltd", state: "X0", stateName: "UNITED KINGDOM", industry: "Manufacturing", sold: "800000", firstSale: "2024-01-10" }));
const fixtureFetch: import("../lib/funding/sec").SecFetch = async (u) => {
  urls.push(u);
  if (u === sec.dayIndexUrl("2026-11-16")) return { status: 200, text: day16 };
  if (u === sec.dayIndexUrl("2026-11-17")) return { status: 500, text: "" };
  if (u.startsWith(sec.eftsUrl("2026-11-17"))) return { status: 200, text: JSON.stringify(day17Efts) };
  if (u in docs) return { status: 200, text: docs[u] };
  return { status: 404, text: "" };
};
eq("the days due: the last five before today, oldest first", run.dueDays(types.emptyFunding(), Date.parse(NOW)), ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18"]);
check("tests never reach EDGAR without a fetch of their own", !(await run.runFunding({ now: NOW })).ran);

const dry = await run.runFunding({ fetch: fixtureFetch, now: NOW, dryRun: true });
check("a dry run keeps nothing", dry.ran && dry.events.length === 2 && !(await t.loadState()).funding, dry.counts);

urls.length = 0;
const r1 = await run.runFunding({ fetch: fixtureFetch, now: NOW });
const c1 = r1.counts!;
eq("filings read, matched, and unmatched by reason", [c1.filings, c1.read, c1.matched, c1.unmatched], [
  10,
  6,
  2,
  { amendment: 1, "no-company": 1, "generic-name": 1, ambiguous: 1, fund: 1, "no-amount": 1, place: 1, "old-sale": 1 },
]);
check("only a filing whose name is one company's is fetched", urls.filter((u) => u.endsWith("primary_doc.xml")).length === 6 && !urls.some((u) => /9990003|9990004|9990005/.test(u)), urls);
check("every request is to SEC", urls.every((u) => /^https:\/\/(?:www|efts)\.sec\.gov\//.test(u)));
const s1 = await t.loadState();
const ev = s1.funding!.events;
eq("one event per matched company: the date, the band, the round, the source", ev.map((e) => [e.companyId, e.filed, e.firstSale, e.band, e.about, e.round, e.source]), [
  ["c_quill", "2026-11-16", "2026-11-02", "$1M–$5M", "about $4.5M", "SAFE", "SEC filing"],
  ["c_zorb", "2026-11-16", "2026-11-03", "$5M–$20M", "about $12M", "equity", "SEC filing"],
]);
eq("days read are kept; the day not posted yet is not", Object.keys(s1.funding!.days).sort(), ["2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17"]);
const raw = readFileSync(path.join(dir, "intel.json"), "utf8");
check("no person's name anywhere in the state", !PEOPLE.some((p) => raw.includes(p) || raw.includes(p.split(" ")[1])));
check("no company is ever created from a filing", s1.companies.length === 0 && !raw.includes("NORTHWIND") && !raw.includes("Northwind"));

const r2 = await run.runFunding({ fetch: fixtureFetch, now: "2026-11-19T20:00:00.000Z" });
check("a second run reads only the day still due, and adds nothing twice", r2.counts!.days.length === 0 && (await t.loadState()).funding!.events.length === 2, r2.counts);
// The same raise filed again on a later day, as a new D with the same first sale.
const again = async (u: string) => (u === sec.dayIndexUrl("2026-11-18") ? { status: 200, text: indexText("2026-11-18", [idxLine("D", "ZORBIX INC", "9990002", "2026-11-18", "0009990002-26-000003")]) } : u === sec.primaryDocUrl("9990002", "0009990002-26-000003") ? { status: 200, text: formD({ name: "Zorbix Inc", state: "CO", stateName: "COLORADO", firstSale: "2026-11-03" }) } : { status: 404, text: "" });
const r3 = await run.runFunding({ fetch: again, now: "2026-11-20T08:00:00.000Z" });
eq("the same first sale filed again is a duplicate", [r3.counts!.matched, r3.counts!.unmatched.duplicate], [0, 1]);
const s3 = await t.loadState();
eq("totals add up over runs", [s3.funding!.totals.filings, s3.funding!.totals.matched], [11, 2]);
const refusing = async () => ({ status: 403, text: "" });
const r4 = await run.runFunding({ fetch: sec.secFetcher({ raw: refusing, gapMs: 0 }), now: "2026-11-24T08:00:00.000Z" });
check("SEC refusing stops the run and says so", !!r4.counts?.error && /403/.test(r4.counts.error), r4.counts);

/* ---------- Pilot metrics ---------- */

console.log("\nPilot metrics");
const ps = types.fundingAdminStats((await t.loadState()).funding, Date.parse("2026-11-24T09:00:00Z"));
check("counts only, with the switch", ps.enabled === false && ps.events30 === 2 && ps.companies30 === 2 && ps.totals.matched === 2 && !JSON.stringify(ps).includes("c_quill"), ps);
check("  and they reach the admin view's stats type", "funding" in ({ funding: ps } as Partial<import("../lib/tableTypes").AdminStats>));

/* ---------- the radar ---------- */

console.log("\nCrystal Ball's funding signal");
const since = Date.parse("2026-11-19T00:00:00Z");
const until = Date.parse("2026-11-19T13:00:00Z");
const companies = sig.fundingCompanies(await t.loadSeed(), await t.loadState());
check("off: the radar's source is none", radarFunding.fundingSource().name === "none" && (await radarFunding.fundingSource().events({ sinceMs: since, nowMs: until, companies })).length === 0);
process.env.RN_FUNDING = "1";
const fe = await radarFunding.fundingSource().events({ sinceMs: since, nowMs: until, companies });
eq("on: the events recorded in the window, with the card's words", fe.map((e) => [e.companyId, e.amount, e.round, e.source, e.note]), [
  ["c_quill", "about $4.5M", "SAFE", "SEC filing", "SEC filing, Nov 2026"],
  ["c_zorb", "about $12M", "equity", "SEC filing", "SEC filing, Nov 2026"],
]);
eq("  and none outside it", (await radarFunding.fundingSource().events({ sinceMs: until, nowMs: until + 3600_000, companies })).length, 0);
const sigs = sig.detectSignals(await t.loadSeed(), await t.loadState(), since, until, fe);
const fs = sigs.filter((x) => x.kind === "funding");
check("each becomes a funding signal", fs.length === 2 && fs.every((x) => x.fundNote === "SEC filing, Nov 2026"), fs);
const ms = { ...fs.find((x) => x.companyId === "c_zorb")!, why: "Money in usually means hiring" };
const ctx = { cardId: (x: string) => x, coId: (x: string) => x, url: "/x" };
eq("a card at a company the member knows", present.cardOf(ms, { ...ctx, visible: () => true }).headline, "Zorbix raised about $12M (equity, SEC filing, Nov 2026)");
eq("  and one they don't: no name", present.cardOf(ms, { ...ctx, visible: () => false }).headline, "A SaaS company raised about $12M (equity, SEC filing, Nov 2026)");
eq("the day's view line", present.viewLine({ ...ms, round: null }), "Raised about $12M (SEC filing, Nov 2026) · Money in usually means hiring");
check("a provider's own round still reads as before", present.viewLine({ ...ms, fundNote: null, round: "Series A", amount: "$12M" }) === "Raised a Series A ($12M) · Money in usually means hiring");
delete process.env.RN_FUNDING;

rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
