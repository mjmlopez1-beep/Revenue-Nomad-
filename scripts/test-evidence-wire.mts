/**
 * Checks of Evidence Bank as the rest of Merlin uses it (lib/evidenceWire.ts, lib/proposals/proof.ts,
 * the Proof wiring in lib/proposals/store.ts, GET /api/evidence/closest's closestView, the
 * Closest evidence column), on lib/evidence's real store. No server: lib/table.ts runs in process on
 * a made-up seed in a temporary data dir, billing live, fetch replaced. The cases are written into
 * the state as lib/evidence keeps them. Every person, company and case is made up.
 *
 *   npx tsx scripts/test-evidence-wire.mts      exits 1 on any failure
 *
 * Covered:
 *   - one source: the ranking is lib/evidence matchIn's, Proof's pick is its proofIn's, each case's
 *     line is its proofLine of the case's ProofItem, the column's rows are its matchRowsIn's, the card
 *     its cardIn's; matchCompany carries caseId and ranked;
 *   - Proof sourcing: a new proposal for a company takes the closest one or two ready cases (Same or
 *     Close, never Different, never a draft), their ids and "evidence" as the source; nothing for a
 *     company no case fits, no company, a template without Proof, a member with no cases (Merlin never
 *     invents a case); the cases the member chose (Use in a new proposal), and a stale pick falls back;
 *     linking a company later fills an empty Proof, never one typed;
 *   - Used in: a case in Proof is noted as used in that proposal (markUsedIn), a case swapped out
 *     before anything went out leaves it, a deleted proposal leaves every case (forgetProposalIn);
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

const co = (id: string, name: string, site: string, f: Record<string, string>) => ({ id, fields: { name, website: site, hq: "Columbus, OH", ...f } });
const companies = [
  co("c_nw", "Northwind Clinics", "northwindclinics.example", { industry: "Health Care", employees: "201–500", revenue: "$20M–$50M", motion: "Inside sales" }),
  co("c_cp", "Cedar and Pine", "cedarandpine.example", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", motion: "Inside sales" }),
  co("c_hf", "Halcyon Freight", "halcyonfreight.example", { industry: "Freight & Trucking", employees: "1,001+", revenue: "$50M+", motion: "Channel" }),
  co("c_ll", "Larkspur Learning", "larkspurlearning.example", { industry: "EdTech", employees: "51–200", revenue: "$5M–$20M" }),
];
/* The cases, as lib/evidence keeps them (State.evidence). */
const kase = (id: string, more: Record<string, unknown>) => ({
  id, status: "ready", clientNamed: false, clientLabel: "A past client", title: "", role: "Fractional VP Sales", fn: "Sales", start: "2024-02", end: "2024-12", hours: "12",
  size: "", revenue: "", motion: "", industry: "", soldTo: "", problems: [], workType: [], outcomes: [], workedWith: [], answers: { problem: "", did: "", numbers: "" },
  text: "", textBy: "member", showOnCard: false, usedIn: [], createdAt: iso(-20 * DAY), updatedAt: iso(-2 * DAY), ...more,
});
const jordanCases = [
  kase("ev_nw", { seatId: "e_x", companyId: "c_nw", clientName: "Northwind Clinics", clientSite: "northwindclinics.example", clientLabel: "A 40-clinic health care group, $20M to $50M", title: "Sales off the founder's desk", industry: "Health Care", size: "201–500", revenue: "$20M–$50M", motion: "Sales-led", text: "Northwind Clinics had four reps and no shared process.", outcomes: [{ k: "Forecast miss", before: "30%", after: "8%" }], updatedAt: iso(-3 * DAY) }),
  kase("ev_lark", { companyId: "c_ll", clientNamed: true, clientName: "Larkspur Learning", clientLabel: "An EdTech company, $5M to $20M", title: "A sales process in six months", industry: "SMB Software", size: "51–200", revenue: "$5M–$20M", motion: "Sales-led", text: "The founder was the only person selling.", outcomes: [{ k: "Sales cycle", before: "74", after: "51", unit: "days" }], updatedAt: iso(-5 * DAY) }),
  kase("ev_media", { clientLabel: "An $8M media company", title: "Renewals with an owner", industry: "Media & Content", size: "1–10", revenue: "Under $1M", motion: "Channel", text: "Revenue had been flat for two years.", outcomes: [{ k: "Renewal rate", before: "71%", after: "88%" }], updatedAt: iso(-1 * DAY) }),
  kase("ev_draft", { status: "draft", companyId: "c_hf", clientName: "Halcyon Freight", clientLabel: "A logistics company", title: "Halcyon Freight draft" }),
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
    evidence: { mem_jordan: jordanCases, mem_fred: jordanCases.map((c) => ({ ...c, id: `${c.id}_fred` })) },
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
  const ES = await import("../lib/evidence/store");
  const C = await import("../app/post/workbench/columns");
  const CL = await import("../app/post/workbench/closest");

  const JORDAN = "tok-jordan-evwire";
  const OONA = "tok-oona-evwire";
  const FRED = "tok-fred-evwire";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const TPL = "fractional-sales-leader";
  const now = async () => ({ seed: await T.loadSeed(), s: await T.loadState() });
  const usedOf = async (id: string) => ((await T.loadState()).evidence?.mem_jordan ?? []).find((c) => c.id === id)?.usedIn ?? [];
  const HIDDEN = /Northwind|northwindclinics|"c_(nw|cp|hf|ll)"/;

  /* ---------- one source ---------- */
  console.log("One source");
  {
    const { seed, s } = await now();
    const m = (await E.matchCompany("mem_jordan", pub("c_cp")))!;
    check("matchCompany: every ready case ranked, the closest one's caseId, label and words on top", JSON.stringify(m.ranked.map((r) => r.caseId)) === JSON.stringify(["ev_lark", "ev_nw", "ev_media"]) && m.caseId === "ev_lark" && m.label === "Same" && JSON.stringify(m.same) === JSON.stringify(m.ranked[0].same), m);
    check("…the same list as lib/evidence matchIn's", JSON.stringify(m.ranked) === JSON.stringify(E.matchIn(seed, s, "mem_jordan", "c_cp")!.cases));
    const allDiff = (await E.matchCompany("mem_jordan", "c_hf"))!;
    check("…every case Different: no caseId, the label Different", !allDiff.caseId && allDiff.label === "Different" && allDiff.ranked.every((r) => r.label === "Different"), allDiff);
    check("…null without Close", (await E.matchCompany("mem_fred", "c_cp")) === null);
    const items = E.proofIn(seed, s, "mem_jordan", "c_cp");
    check("Proof's pick is proofIn's top two", JSON.stringify((await W.autoProof("mem_jordan", "c_cp"))?.ids) === JSON.stringify(items.map((i) => i.caseId)));
    check("…its text is proofLine of each ProofItem", (await W.autoProof("mem_jordan", "c_cp"))?.text === items.map(E.proofLine).join("\n"));
    check("proofFor gives the same two", JSON.stringify((await E.proofFor("mem_jordan", pub("c_cp"))).map((i) => i.caseId)) === JSON.stringify(items.map((i) => i.caseId)));
  }

  /* ---------- Proof sourcing ---------- */
  console.log("\nProof sourcing");
  const p1 = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp") });
  const lines = (p1.fields.caseStudies ?? "").split("\n");
  if (process.env.SHOW) console.log(lines);
  check("a new proposal takes the closest two ready cases, closest first", JSON.stringify(p1.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]) && lines.length === 2, { ids: p1.proofCases, lines });
  check("…its source says Evidence Bank", p1.sources.caseStudies === "evidence");
  check("…a named client by name, a hidden one by its label", lines[0].startsWith("Larkspur Learning: A sales process in six months.") && lines[1].startsWith("A 40-clinic health care group, $20M to $50M: Sales off the founder's desk."), lines);
  check("…the hidden client's name taken out of the member's own words too", !HIDDEN.test(p1.fields.caseStudies ?? "") && /The client had four reps/.test(lines[1]), lines[1]);
  check("…the numbers as the member typed them", /Sales cycle: 74 days to 51 days\./.test(lines[0]) && /Forecast miss: 30% to 8%\./.test(lines[1]), lines);
  check("…never a Different case, never a draft", !/media|Renewal|Halcyon/i.test(p1.fields.caseStudies ?? ""));
  check("…both cases noted as used in it (markUsedIn)", (await usedOf("ev_lark")).includes(p1.id) && (await usedOf("ev_nw")).includes(p1.id) && !(await usedOf("ev_media")).includes(p1.id));
  const proofBlock = L.rendered(p1.blocks, L.docFields(p1)).find((b) => /Proof/i.test(b.title) || b.text.includes("Work like this before"));
  check("the document the client reads: each case a bullet, no hidden name", !!proofBlock && /- Larkspur Learning:/.test(proofBlock.text) && /- A 40-clinic health care group/.test(proofBlock.text) && !HIDDEN.test(proofBlock.text), proofBlock?.text);
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
  check("…and no case is noted as used in it", !(await usedOf("ev_lark")).includes(typed.id));
  const chose = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp"), proofCases: ["ev_media"] });
  check("Use in a new proposal: the case chosen in Evidence Bank is its Proof, even one a match would skip", JSON.stringify(chose.proofCases) === JSON.stringify(["ev_media"]) && /^An \$8M media company: Renewals with an owner\./.test(chose.fields.caseStudies ?? "") && (await usedOf("ev_media")).includes(chose.id), chose.fields.caseStudies);
  const stalePick = await S.createProposal(JORDAN, { templateId: TPL, companyId: pub("c_cp"), proofCases: ["ev_draft"] });
  check("…a pick no longer ready never stops the proposal: the closest ones fill it", JSON.stringify(stalePick.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]));

  /* ---------- linking later ---------- */
  console.log("\nLinking a company later");
  const unl = await S.createProposal(JORDAN, { templateId: TPL, companyName: "Someone New Ltd" });
  const linked = await S.linkProposal(JORDAN, unl.id, { companyId: pub("c_cp") });
  check("linking fills an empty Proof from the closest cases", JSON.stringify(linked.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]) && !!linked.fields.caseStudies && (await usedOf("ev_lark")).includes(unl.id));
  const unl2 = await S.createProposal(JORDAN, { templateId: TPL, companyName: "Someone Else Ltd", fields: { caseStudies: "Typed before linking" } });
  const linked2 = await S.linkProposal(JORDAN, unl2.id, { companyId: pub("c_cp") });
  check("…never over what the member typed", linked2.fields.caseStudies === "Typed before linking" && !linked2.proofCases);

  /* ---------- the editor's Proof view ---------- */
  console.log("\nThe editor's Proof");
  const v = (await PF.proofView(JORDAN, p1.id))!;
  check("every ready case, closest to its company first", v.on && JSON.stringify(v.cases.map((c) => c.id)) === JSON.stringify(["ev_lark", "ev_nw", "ev_media"]), v.cases.map((c) => c.id));
  check("…with each one's match and words", v.cases[0].label === "Same" && v.cases[0].same.length > 0 && v.cases[1].label === "Close" && v.cases[2].label === "Different");
  check("…the ones it holds, Merlin's own pick, and the drafts by title", JSON.stringify(v.chosen) === JSON.stringify(["ev_lark", "ev_nw"]) && JSON.stringify(v.picked) === JSON.stringify(["ev_lark", "ev_nw"]) && v.drafts.length === 1);
  check("…where each came from", v.cases[1].src === "From your seat · client name hidden" && v.cases[0].src === "Your case · client named");
  const vj = JSON.stringify(v);
  check("…no hidden client's name and no internal company id", !HIDDEN.test(vj) && !/companyId/.test(vj), vj.slice(0, 300));
  check("…each case's line is the line Proof carries", v.cases[0].text === lines[0] && v.cases[1].text === lines[1]);
  check("another member can't read it", (await PF.proofView(OONA, p1.id)) === null);

  /* ---------- Swap case ---------- */
  console.log("\nSwap case");
  const sw = await S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_lark", "ev_media"], rev: p1.rev });
  check("a swap: the cases' lines in Proof, their ids, a new revision", JSON.stringify(sw.proofCases) === JSON.stringify(["ev_lark", "ev_media"]) && /An \$8M media company: Renewals with an owner\./.test(sw.fields.caseStudies ?? "") && sw.rev === p1.rev + 1, sw.fields.caseStudies);
  check("…the case swapped in is used in it, the one swapped out (nothing sent yet) no longer", (await usedOf("ev_media")).includes(p1.id) && !(await usedOf("ev_nw")).includes(p1.id));
  const stale = await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_nw"], rev: p1.rev }));
  check("an older revision is refused (409), as any change", stale?.status === 409 && stale.message === S.STALE, stale);
  check("a case that isn't ready is refused (never a draft)", /isn't ready/.test((await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_draft"] })))?.message ?? ""));
  check("a case that isn't theirs is refused", /isn't ready/.test((await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_nw_fred"] })))?.message ?? ""));
  check("three cases are refused (two at most)", /up to 2/.test((await refused(S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_lark", "ev_nw", "ev_media"] })))?.message ?? ""));
  check("another member can't swap it", (await refused(S.updateProposal(OONA, p1.id, { proofCases: [] })))?.status === 404);
  const emptied = await S.updateProposal(JORDAN, p1.id, { proofCases: [] });
  check("none: Proof is empty again (Send without Proof or a new case)", !emptied.fields.caseStudies && !emptied.proofCases && !(await usedOf("ev_lark")).includes(p1.id));
  const back = await S.updateProposal(JORDAN, p1.id, { proofCases: ["ev_nw"] });
  const hand = await S.updateProposal(JORDAN, p1.id, { setFields: { caseStudies: `${back.fields.caseStudies} And more in my words.` } });
  check("a hand edit of Proof keeps the words and drops the case ids", !hand.proofCases && /And more in my words\./.test(hand.fields.caseStudies ?? ""));
  check("a swap on a proposal without Proof is refused", /no Proof section/.test((await refused(S.updateProposal(JORDAN, blank.id, { proofCases: ["ev_nw"] })))?.message ?? ""));
  const dup = await S.duplicateProposal(JORDAN, linked.id);
  check("a copy holds the same cases, noted as used in it too", JSON.stringify(dup.proofCases) === JSON.stringify(["ev_lark", "ev_nw"]) && (await usedOf("ev_lark")).includes(dup.id));
  await S.deleteProposal(JORDAN, dup.id);
  check("a deleted proposal leaves every case's Used in (forgetProposalIn)", !(await usedOf("ev_lark")).includes(dup.id) && !(await usedOf("ev_nw")).includes(dup.id));

  /* ---------- the closest rows ---------- */
  console.log("\nClosest evidence");
  const cv = (await W.closestView(JORDAN, [pub("c_cp"), pub("c_hf"), pub("c_nw"), pub("c_ll")]))!;
  check("the counts: ready cases and drafts", cv.on && cv.ready === 3 && cv.drafts === 1, cv);
  check("a company with a Same case: its title, why and first outcome", cv.rows[pub("c_cp")]?.label === "Same" && cv.rows[pub("c_cp")]?.title === "A sales process in six months" && cv.rows[pub("c_cp")]?.outcome === "Sales cycle: 74 days to 51 days", cv.rows[pub("c_cp")]);
  check("a company only Different cases fit: no close case", !cv.rows[pub("c_hf")]);
  check("a hidden client's company: its own case, never its name", cv.rows[pub("c_nw")]?.caseId === "ev_nw" && cv.rows[pub("c_nw")]?.label === "Same" && !HIDDEN.test(JSON.stringify(cv)), cv.rows[pub("c_nw")]);
  const route = (await ES.matchEvidence(JORDAN, { companyIds: [pub("c_cp"), pub("c_hf"), pub("c_nw"), pub("c_ll")] })) as { rows: Record<string, { label: string; caseId: string } | null> };
  check("the rows are Evidence Bank's own match (POST match companyIds), Different left out", JSON.stringify(Object.keys(cv.rows).sort()) === JSON.stringify(Object.entries(route.rows).filter(([, r]) => r && r.label !== "Different").map(([k]) => k).sort()) && Object.entries(cv.rows).every(([k, r]) => route.rows[k]?.caseId === r.caseId), { cv: cv.rows, route: route.rows });
  check("…the route's rows carry the first outcome too, and no hidden name", (route.rows[pub("c_cp")] as { outcome?: string } | null)?.outcome === "Sales cycle: 74 days to 51 days" && !HIDDEN.test(JSON.stringify(route)));
  check("only what was asked", Object.keys((await W.closestView(JORDAN, [pub("c_cp")]))!.rows).join() === pub("c_cp"));
  check("signed out: nothing", (await W.closestView("tok-nobody", [pub("c_cp")])) === null);

  /* ---------- the card ---------- */
  console.log("\nThe card");
  await T.tableInternals.mutate((s) => {
    for (const c of s.evidence!.mem_jordan) c.showOnCard = c.id === "ev_nw" || c.id === "ev_draft";
  });
  {
    const s = await T.loadState();
    const card = W.cardCases(s, "mem_jordan");
    check("the card: cardIn's cases (ready, switched on), title and one outcome", JSON.stringify(card) === JSON.stringify(E.cardIn(s, "mem_jordan").map((i) => ({ title: i.title, outcome: E.outcomeLine(i.outcomes[0]) }))) && card.length === 1 && card[0].outcome === "Forecast miss: 30% to 8%", card);
    check("…never the hidden client's name", !HIDDEN.test(JSON.stringify(card)));
  }

  /* ---------- Close only ---------- */
  console.log("\nClose only");
  const fv = (await W.closestView(FRED, [pub("c_cp")]))!;
  check("off Close: on false, no counts, no rows", fv.on === false && fv.ready === 0 && fv.drafts === 0 && !Object.keys(fv.rows).length, fv);
  await T.tableInternals.mutate((s) => {
    (s.proposals ??= []).push({ ...structuredClone((s.proposals ?? []).find((x) => x.id === p1.id)!), id: "pr_fred_old", memberId: "mem_fred" });
  });
  check("off Close: the Proof view says on false and carries no case", JSON.stringify(await PF.proofView(FRED, "pr_fred_old")) === JSON.stringify({ on: false, cases: [], chosen: [], drafts: [], picked: [] }));
  const fs = await refused(S.updateProposal(FRED, "pr_fred_old", { proofCases: ["ev_nw_fred"] }));
  check("off Close: a swap is refused with the upgrade", fs?.status === 403, fs);
  check("off Close: no card cases either", W.cardCases(await T.loadState(), "mem_fred").length === 0);
  check("off Close: no Proof pick", (await W.autoProof("mem_fred", "c_cp")) === null);

  /* ---------- the column ---------- */
  console.log("\nThe Closest evidence column");
  const col = C.columnOf("companies", "evidence")!;
  const row = (id: string) => ({ i: { c: { id } } }) as never;
  CL.clearClosest();
  CL.putClosest([pub("c_cp"), pub("c_hf")], cv.rows);
  check("Close's column, free to show, counted as matched", col.plan === "close" && col.cost === "free" && C.fillWords(col, [row(pub("c_cp")), row(pub("c_hf"))]) === "50% matched");
  check("not in the usual columns (picked from Tools or the column list)", !C.defaultCols("companies").includes("evidence"));
  const words = CL.closestWords(CL.closestOf(pub("c_cp")));
  check("the words: label and title", words?.label === "Same" && words.title === "A sales process in six months" && words.why === cv.rows[pub("c_cp")]!.same.slice(0, 2).join(" · ") && CL.labelWords("Close") === "Close match", words);

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
