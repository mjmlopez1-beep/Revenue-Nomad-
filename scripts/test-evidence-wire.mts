/**
 * Checks of Evidence Bank as the rest of Merlin uses it (lib/evidenceWire.ts, lib/proposals/proof.ts,
 * the Proof wiring in lib/proposals/store.ts, GET /api/evidence/closest's closestView, the
 * Closest evidence column). No server: lib/table.ts runs in process on a made-up seed in a temporary
 * data dir, billing live, fetch replaced. lib/evidence's three helpers (listCases, matchCompany,
 * proofFor) are swapped for made-up ones (evidenceWireInternals.use), so this runs before and after
 * Builder A's store is merged. Every person, company and case is made up.
 *
 *   npx tsx scripts/test-evidence-wire.mts      exits 1 on any failure
 *
 * Covered:
 *   - Proof sourcing: a new proposal for a company takes the closest one or two ready cases (Same or
 *     Close, never Different, never a draft, never one unmatched), their ids and "evidence" as the
 *     source; nothing for a company no case fits, no company, a template without Proof, a member with
 *     no cases, or lib/evidence as the stub has it (Merlin never invents a case); proofFor's own
 *     words when it gives them; linking a company later fills an empty Proof, never one typed;
 *   - the client's name hidden unless named: in Proof's text, the rendered document, the editor's
 *     Proof view and the closest rows; the internal company id never in an answer;
 *   - Swap case: only the member's own ready cases, two at most, [] empties Proof; the revision
 *     check (409) holds; a hand edit of Proof drops the case ids; another member can't see or swap;
 *   - Close gating: off Close the closest view and the Proof view say on: false and carry nothing,
 *     and a swap is refused with the upgrade; signed out is null;
 *   - the Closest evidence column counts only companies with a Same or Close case.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-evwire-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();

const co = (id: string, name: string, site: string, more: Record<string, string> = {}) => ({ id, fields: { name, website: site, industry: "Health Care", employees: "51–200", revenue: "$20M–$50M", hq: "Columbus, OH", ...more } });
const companies = [
  co("c_nw", "Northwind Clinics", "northwindclinics.example"),
  co("c_cp", "Cedar and Pine", "cedarandpine.example", { industry: "Software" }),
  co("c_hf", "Halcyon Freight", "halcyonfreight.example", { industry: "Logistics" }),
  co("c_ll", "Larkspur Learning", "larkspurlearning.example", { industry: "Education" }),
];
const member = (id: string, name: string, title: string) => ({ id, name, email: `${id.slice(4)}.evwire@example.com`, title, token: `tok-${id.slice(4)}-evwire` });
const members = [member("mem_jordan", "Jordan Avery", "Fractional VP Sales"), member("mem_oona", "Oona Other", "Fractional CMO"), member("mem_fred", "Fred Free", "Fractional VP Sales")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements: [], contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: Object.fromEntries(members.map((m) => [m.id, { function: "Sales", title: m.title, onboarded: true }])),
    billing: { members: { mem_jordan: trial, mem_oona: trial, mem_fred: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 9).toString("base64"),
  RN_ID_SECRET: "test-id-secret-evwire",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_evwire",
  STRIPE_WEBHOOK_SECRET: "whsec_test_evwire",
  STRIPE_PRICE_MONTH: "price_month_evwire",
  STRIPE_PRICE_YEAR: "price_year_evwire",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RESEND_API_KEY"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 700)}`}`);
};
const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error & { status?: number }) => ({ message: e.message, status: e.status }));

async function main() {
  const T = await import("../lib/table");
  const S = await import("../lib/proposals/store");
  const L = await import("../lib/proposals/library");
  const PF = await import("../lib/proposals/proof");
  const W = await import("../lib/evidenceWire");
  const E = await import("../lib/evidence");
  const C = await import("../app/post/workbench/columns");
  const CL = await import("../app/post/workbench/closest");
  type EvidenceCase = import("../lib/evidence").EvidenceCase;
  type EvidenceMatch = import("../lib/evidence").EvidenceMatch;

  const JORDAN = "tok-jordan-evwire";
  const OONA = "tok-oona-evwire";
  const FRED = "tok-fred-evwire";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const TPL = "fractional-sales-leader";

  const mk = (id: string, more: Partial<EvidenceCase>): EvidenceCase => ({
    id, status: "ready", clientNamed: false, clientLabel: "A past client", title: "", problems: [], workType: [], outcomes: [], workedWith: [], text: "", showOnCard: false, usedIn: [], createdAt: iso(-20 * DAY), updatedAt: iso(-2 * DAY), ...more,
  });
  const CASES: Record<string, EvidenceCase[]> = {
    mem_jordan: [
      mk("ev_nw", { companyId: "c_nw", clientLabel: "A 40-clinic health care group, $20M to $50M", title: "Northwind Clinics: sales off the founder's desk", text: "Northwind Clinics had four reps and no shared process.", outcomes: [{ k: "Forecast miss", before: "30%", after: "8%" }], seatId: "e_x", updatedAt: iso(-3 * DAY) }),
      mk("ev_lark", { companyId: "c_ll", clientNamed: true, clientLabel: "An EdTech company, $10M to $20M", title: "A sales process in six months", text: "The founder was the only person selling.", outcomes: [{ k: "Sales cycle", before: "74", after: "51", unit: "days" }], updatedAt: iso(-5 * DAY) }),
      mk("ev_media", { clientLabel: "An $8M media company", title: "Renewals with an owner", text: "Revenue had been flat for two years.", outcomes: [{ k: "Renewal rate", before: "71%", after: "88%" }], updatedAt: iso(-1 * DAY) }),
      mk("ev_draft", { status: "draft", companyId: "c_hf", clientLabel: "A logistics company", title: "Halcyon Freight draft" }),
    ],
  };
  const r = (caseId: string, label: "Same" | "Close" | "Different", same: string[] = [], diff: string[] = []) => ({ caseId, label, same, diff });
  const MATCH: Record<string, EvidenceMatch> = {
    c_cp: { label: "Same", same: ["Same size"], diff: [], caseId: "ev_lark", ranked: [r("ev_lark", "Same", ["Same size", "Founder-led"]), r("ev_nw", "Close", ["Same revenue"], ["A different industry"]), r("ev_media", "Different", [], ["A different motion"])] },
    c_hf: { label: "Different", same: [], diff: ["A different industry"], caseId: "ev_media", ranked: [r("ev_media", "Different"), r("ev_nw", "Different"), r("ev_lark", "Different")] },
    c_nw: { label: "Close", same: ["Same industry"], diff: [] , caseId: "ev_nw" },
  };
  let proofWords = "";
  const fake = {
    listCases: async (m: string) => (CASES[m] ?? []).map((c) => structuredClone(c)),
    matchCompany: async (_m: string, c: string) => MATCH[c] ?? { label: "Different" as const, same: [], diff: [] },
    proofFor: async () => proofWords,
  };

  /* ---------- the stub: never a case ---------- */
  console.log("lib/evidence as it stands");
  check("the stub has the agreed names, each empty", (await E.listCases("mem_jordan")).length === 0 && (await E.matchCompany("mem_jordan", "c_cp")).label === "Different" && (await E.proofFor("mem_jordan", "c_cp")) === "");
  const stubbed = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp") });
  check("with no cases, Proof stays empty: Merlin never writes one", !stubbed.fields.caseStudies && !stubbed.proofCases, stubbed.fields.caseStudies);

  W.evidenceWireInternals.use(fake);

  /* ---------- Proof sourcing ---------- */
  console.log("\nProof sourcing");
  const p1 = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp") });
  const lines = (p1.fields.caseStudies ?? "").split("\n");
  if (process.env.SHOW) console.log(lines);
  check("a new proposal takes the closest two ready cases, closest first", JSON.stringify(p1.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]) && lines.length === 2, { ids: p1.proofCases, lines });
  check("…its source says Evidence Bank", p1.sources.caseStudies === "evidence");
  check("…a named client by name, a hidden one by its label", lines[0].startsWith("Larkspur Learning:") && lines[1].startsWith("A 40-clinic health care group, $20M to $50M:"), lines);
  check("…the hidden client's name taken out of the member's own words too", !/Northwind/i.test(p1.fields.caseStudies ?? "") && /: Sales off the founder's desk\. The client had four reps/.test(lines[1]), lines[1]);
  check("…the numbers as the member typed them", /Sales cycle: 74 days to 51 days\./.test(lines[0]) && /Forecast miss: 30% to 8%\./.test(lines[1]), lines);
  check("…never a Different case, never a draft", !/media|Renewal|Halcyon/i.test(p1.fields.caseStudies ?? ""));
  const proofBlock = L.rendered(p1.blocks, L.docFields(p1)).find((b) => /Proof/i.test(b.title) || b.text.includes("Work like this before"));
  check("the document the client reads: each case a bullet, no hidden name", !!proofBlock && /- Larkspur Learning:/.test(proofBlock.text) && /- A 40-clinic health care group/.test(proofBlock.text) && !/Northwind/.test(proofBlock.text), proofBlock?.text);
  const none = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_hf") });
  check("a company no case fits: Proof stays empty", !none.fields.caseStudies && !none.proofCases);
  const noCo = await S.createProposal(JORDAN, { templateId: TPL, companyName: "Not On Merlin Works" });
  check("no company on Merlin: Proof stays empty", !noCo.fields.caseStudies && !noCo.proofCases);
  const blank = await S.createProposal(JORDAN, { templateId: "advisory", companyId: pub("c_cp") });
  check("a template without Proof: nothing filled", !blank.fields.caseStudies && !blank.proofCases);
  const oonas = await S.createProposal(OONA, { templateId: TPL, companyId: pub("c_cp") });
  check("another member's cases are never used (she has none)", !oonas.fields.caseStudies && !oonas.proofCases);
  const typed = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp"), fields: { caseStudies: "My own words about past work" } });
  check("Proof the call or the agent wrote wins, and isn't marked as Evidence Bank's", typed.fields.caseStudies === "My own words about past work" && !typed.proofCases && typed.sources.caseStudies !== "evidence", typed.sources);
  proofWords = "Words lib/evidence chose for Cedar and Pine.";
  const given = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp") });
  check("proofFor's own words when it gives them", given.fields.caseStudies === proofWords && JSON.stringify(given.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]));
  proofWords = "";

  /* ---------- linking later ---------- */
  console.log("\nLinking a company later");
  const unl = await S.createProposal(JORDAN, { templateId: TPL, companyName: "Someone New Ltd" });
  const linked = await S.linkProposal(JORDAN, unl.id, { companyId: pub("c_cp") });
  check("linking fills an empty Proof from the closest cases", JSON.stringify(linked.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]) && !!linked.fields.caseStudies);
  const unl2 = await S.createProposal(JORDAN, { templateId: TPL, companyName: "Someone Else Ltd", fields: { caseStudies: "Typed before linking" } });
  const linked2 = await S.linkProposal(JORDAN, unl2.id, { companyId: pub("c_cp") });
  check("…never over what the member typed", linked2.fields.caseStudies === "Typed before linking" && !linked2.proofCases);

  /* ---------- the editor's Proof view ---------- */
  console.log("\nThe editor's Proof");
  const v = (await PF.proofView(JORDAN, p1.id))!;
  check("every ready case, closest to its company first", v.on && JSON.stringify(v.cases.map((c) => c.id)) === JSON.stringify(["ev_lark", "ev_nw", "ev_media"]), v.cases.map((c) => c.id));
  check("…with each one's match and words", v.cases[0].label === "Same" && v.cases[0].same.includes("Founder-led") && v.cases[1].label === "Close" && v.cases[2].label === "Different");
  check("…the ones it holds, Merlin's own pick, and the drafts by title", JSON.stringify(v.chosen) === JSON.stringify(["ev_lark", "ev_nw"]) && JSON.stringify(v.picked) === JSON.stringify(["ev_lark", "ev_nw"]) && v.drafts.length === 1);
  const vj = JSON.stringify(v.cases);
  check("…no hidden client's name and no internal company id", !/Northwind/.test(vj) && !/"c_nw"|"c_ll"|companyId/.test(vj), vj.slice(0, 300));
  check("…each case's line is the line Proof carries", v.cases[0].text === lines[0] && v.cases[1].text === lines[1]);
  check("another member can't read it", (await PF.proofView(OONA, p1.id)) === null);

  /* ---------- Swap case ---------- */
  console.log("\nSwap case");
  const sw = await S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_lark", "ev_media"], rev: p1.rev });
  check("a swap: the cases' lines in Proof, their ids, a new revision", JSON.stringify(sw.proofCases) === JSON.stringify(["ev_lark", "ev_media"]) && /An \$8M media company: Renewals with an owner\./.test(sw.fields.caseStudies ?? "") && sw.rev === p1.rev + 1, sw.fields.caseStudies);
  const stale = await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_nw"], rev: p1.rev }));
  check("an older revision is refused (409), as any change", stale?.status === 409 && stale.message === S.STALE, stale);
  check("a case that isn't ready is refused (never a draft)", /isn't ready/.test((await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_draft"] })))?.message ?? ""));
  check("a case that isn't theirs is refused", /isn't ready/.test((await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_someone_elses"] })))?.message ?? ""));
  check("three cases are refused (two at most)", /up to 2/.test((await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_lark", "ev_nw", "ev_media"] })))?.message ?? ""));
  check("another member can't swap it", (await refused(S.updateProposal(OONA, p1.id, { proofCases: [] })))?.status === 404);
  const emptied = await S.updateProposal(JORDAN, p1.id, { proofCases: [] });
  check("none: Proof is empty again (Send without Proof or a new case)", !emptied.fields.caseStudies && !emptied.proofCases);
  const back = await S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_nw"] });
  const hand = await S.updateProposal(JORDAN, p1.id, { setFields: { caseStudies: `${back.fields.caseStudies} And more in my words.` } });
  check("a hand edit of Proof keeps the words and drops the case ids", !hand.proofCases && /And more in my words\./.test(hand.fields.caseStudies ?? ""));
  check("a swap on a proposal without Proof is refused", /no Proof section/.test((await refused(S.updateProposal(JORDAN, blank.id, { proofCases: ["ev_nw"] })))?.message ?? ""));

  /* ---------- the closest rows ---------- */
  console.log("\nClosest evidence");
  const cv = (await W.closestView(JORDAN, [pub("c_cp"), pub("c_hf"), pub("c_nw"), pub("c_ll")]))!;
  check("the counts: ready cases and drafts", cv.on && cv.ready === 3 && cv.drafts === 1, cv);
  check("a company with a Same case: its title and why", cv.rows[pub("c_cp")]?.label === "Same" && cv.rows[pub("c_cp")]?.title === "A sales process in six months" && cv.rows[pub("c_cp")]?.same.includes("Founder-led"), cv.rows[pub("c_cp")]);
  check("a company only Different cases fit: no close case", !cv.rows[pub("c_hf")]);
  check("a hidden client's company: its own case, by label words, never its name", cv.rows[pub("c_nw")]?.label === "Close" && !/Northwind/.test(JSON.stringify(cv)), cv.rows[pub("c_nw")]);
  check("a company with nothing matched: nothing", !cv.rows[pub("c_ll")]);
  check("no internal company id in the answer", !/"c_(nw|cp|hf|ll)"/.test(JSON.stringify(cv)));
  check("only what was asked", Object.keys((await W.closestView(JORDAN, [pub("c_cp")]))!.rows).join() === pub("c_cp"));
  check("signed out: nothing", (await W.closestView("tok-nobody", [pub("c_cp")])) === null);

  /* ---------- Close only ---------- */
  console.log("\nClose only");
  CASES.mem_fred = CASES.mem_jordan.map((c) => ({ ...c }));
  const fv = (await W.closestView(FRED, [pub("c_cp")]))!;
  check("off Close: on false, no counts, no rows", fv.on === false && fv.ready === 0 && fv.drafts === 0 && !Object.keys(fv.rows).length, fv);
  await T.tableInternals.mutate((s) => {
    (s.proposals ??= []).push({ ...structuredClone((s.proposals ?? []).find((x) => x.id === p1.id)!), id: "pr_fred_old", memberId: "mem_fred" });
  });
  check("off Close: the Proof view says on false and carries no case", JSON.stringify(await PF.proofView(FRED, "pr_fred_old")) === JSON.stringify({ on: false, cases: [], chosen: [], drafts: [], picked: [] }));
  const fs = await refused(S.updateProposal(FRED, "pr_fred_old", { proofCases: ["ev_nw"] }));
  check("off Close: a swap is refused with the upgrade", fs?.status === 403, fs);
  check("off Close: no card cases either", (await W.cardCases(await T.loadSeed(), await T.loadState(), "mem_fred")).length === 0);

  /* ---------- the column ---------- */
  console.log("\nThe Closest evidence column");
  const col = C.columnOf("companies", "evidence")!;
  const row = (id: string) => ({ i: { c: { id } } }) as never;
  CL.clearClosest();
  CL.putClosest([pub("c_cp"), pub("c_hf")], cv.rows);
  check("Close's column, free to show, counted as matched", col.plan === "close" && col.cost === "free" && C.fillWords(col, [row(pub("c_cp")), row(pub("c_hf"))]) === "50% matched");
  check("not in the usual columns (picked from Tools or the column list)", !C.defaultCols("companies").includes("evidence"));
  check("the words: label and title", JSON.stringify(CL.closestWords(CL.closestOf(pub("c_cp")))) === JSON.stringify({ label: "Same", title: "A sales process in six months", why: "Same size · Founder-led" }) && CL.labelWords("Close") === "Close match");

  W.evidenceWireInternals.use(null);
  console.log(`\n${passes} passed, ${failures} failed`);
}

main()
  .catch((e) => {
    failures++;
    console.error("FAIL the suite threw", e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    process.exit(failures ? 1 : 0);
  });
