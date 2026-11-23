/**
 * Checks of Evidence Bank on the server (lib/evidence, app/api/evidence, lib/mcp/evidence.ts).
 * No server: lib/table.ts runs in process on a made-up seed in a temporary data dir, billing live
 * with made-up Stripe settings, and fetch replaced (the AI service is a fake here), so nothing
 * leaves the machine.
 *
 *   npx tsx scripts/test-evidence.mts      exits 1 on any failure
 *
 * Covered:
 *   - fit tags: the category names alone; a made-up taxonomy sealed by scripts/seal-fit-tags.mjs
 *     with a made-up key and opened as data/fit-tags.enc is; the plain file by RN_FIT_TAGS; a
 *     wrong key falls back; only names and tags reach a page; free-text tags; suggestions;
 *   - a draft from a seat the member held (facts, role, dates and hours from the seat), never from
 *     another member's seat; the same seat twice is one draft;
 *   - the answers: the template's words, the numbers exactly as typed, ready only when answered;
 *   - the client hidden by default everywhere: the member's own list (unless they ask to see it),
 *     the Proof part, the card, the connector, words they typed scrubbed of the name and website;
 *     named only when the member names it;
 *   - no case in another member's view, list, table, connector or the admin export;
 *   - match: Same, Close or Different in words, the same every time, ranked the same way;
 *   - Close only: Free gets the plan's words and the upgrade link (403) on every write, match and
 *     proof, and the list says only how many are kept; the trial counts;
 *   - 50 cases at most;
 *   - Merlin's AI: off by default, asks to agree, never a number the member didn't type, the
 *     paste never kept, the usage charged;
 *   - account closure's purge deletes them; a removed or merged company keeps the words;
 *   - the data page and docs/data-flows.md say so, and the data page never names LinkedIn.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-evidence-"));
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(t0 + ms).toISOString();
const TEST_KEY = Buffer.alloc(32, 9).toString("base64");

/* ---------- the made-up seed ---------- */

const co = (id: string, name: string, site: string, f: Record<string, string>) => ({ id, fields: { name, website: site, hq: "Denver, CO", ...f } });
const companies = [
  co("c_northwind", "Northwind Clinics", "northwindclinics.example", { industry: "Health Care", employees: "201–500", revenue: "$20M–$50M", motion: "Inside sales" }),
  co("c_cedar", "Cedar and Pine", "cedarandpine.example", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", motion: "PLG" }),
  co("c_halcyon", "Halcyon Freight", "halcyonfreight.example", { industry: "Health Care", employees: "201–500", revenue: "$20M–$50M", motion: "Inside sales" }),
  co("c_larkspur", "Larkspur Learning", "larkspurlearning.example", { industry: "EdTech", employees: "51–200", revenue: "$5M–$20M" }),
];
const engagements = [
  { id: "e_jordan_nw", companyId: "c_northwind", verified: false, fields: { source: "Member success story", operator: "Jordan Avery", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2024-02", end: "2024-12", status: "Ended", hours: "12", reason: "Build the first sales motion" } },
  { id: "e_riley_cp", companyId: "c_cedar", verified: false, fields: { source: "Member success story", operator: "Riley Stone", role: "Fractional CMO", function: "Marketing", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" } },
  { id: "e_open_hf", companyId: "c_halcyon", verified: false, fields: { source: "Member success story", role: "Fractional VP Sales", function: "Sales", type: "Fractional", status: "Open role" } },
  { id: "e_old_ll", companyId: "c_larkspur", verified: false, fields: { source: "Member success story", role: "Fractional CRO", function: "Sales", type: "Fractional", start: "2023-03", end: "2023-09", status: "Ended", reason: "Move off founder-led sales" } },
];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}.evidence@example.com`, title, token: `tok-${id}-evidence` });
const members = [M("mem_jordan", "Jordan Avery", "Fractional VP Sales"), M("mem_riley", "Riley Stone", "Fractional CMO"), M("mem_free", "Frankie Free", "Fractional VP Sales"), { ...M("mem_adm", "Ada Admin", "Admin"), email: "admin-evidence@example.com" }];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements, contacts: [] }));
const trial = { trialStartedAt: iso(-5 * DAY), trialEndsAt: iso(16 * DAY) };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-DAY)])),
    profiles: { mem_jordan: { function: "Sales", title: "Fractional VP Sales", onboarded: true }, mem_riley: { function: "Marketing", title: "Fractional CMO", onboarded: true }, mem_free: { function: "Sales", title: "Fractional VP Sales", onboarded: true } },
    billing: { members: { mem_jordan: trial, mem_riley: trial, mem_free: { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-9 * DAY) } }, events: [], payments: [], ended: [] },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_ID_SECRET: "test-id-secret-evidence",
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-evidence@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_FREE_COMPANY: "off",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_evidence",
  STRIPE_WEBHOOK_SECRET: "whsec_test_evidence",
  STRIPE_PRICE_MONTH: "price_month_evidence",
  STRIPE_PRICE_YEAR: "price_year_evidence",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RN_GOOGLE", "RN_FIT_TAGS", "RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "ANTHROPIC_BASE_URL"]) delete process.env[k];

// The fake AI service: what it was asked, and what it answers next.
const AI_BASE = "http://127.0.0.1:7051/fake-anthropic";
const aiCalls: string[] = [];
let aiAnswer: () => unknown = () => ({});
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  if (url.startsWith(AI_BASE)) {
    const raw = init?.body ?? (input instanceof Request ? await input.text() : "");
    aiCalls.push(typeof raw === "string" ? raw : new TextDecoder().decode(raw as ArrayBuffer));
    return new Response(JSON.stringify(aiAnswer()), { status: 200, headers: { "content-type": "application/json", "request-id": "req_fake" } });
  }
  throw new Error(`no outside calls in this test: ${url.slice(0, 40)}`);
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "ok  " : "FAIL"} ${name}${!ok && detail !== undefined ? `\n     ${String(typeof detail === "string" ? detail : JSON.stringify(detail)).slice(0, 400)}` : ""}`);
};
const refused = async (p: Promise<unknown>): Promise<{ message: string; status: number; upgrade?: string } | null> => {
  try {
    await p;
    return null;
  } catch (e) {
    const x = e as { message: string; status?: number; upgrade?: string };
    return { message: x.message, status: x.status ?? 0, upgrade: x.upgrade };
  }
};
const src = (p: string) => readFileSync(path.join(ROOT, p), "utf8");

async function main() {
  const T = await import("../lib/table");
  const S = await import("../lib/evidence/store");
  const D = await import("../lib/evidence/draft");
  const Mt = await import("../lib/evidence/match");
  const Tg = await import("../lib/evidence/tags");
  const Ty = await import("../lib/evidence/types");
  const MC = await import("../lib/mcp/evidence");
  const pub = T.tableInternals.pubId;
  const J = "tok-mem_jordan-evidence";
  const R = "tok-mem_riley-evidence";
  const F = "tok-mem_free-evidence";
  const jordan = (await T.memberForToken(J))!;
  const riley = (await T.memberForToken(R))!;
  const ctxJ = { member: jordan, origin: "https://post.example.com" };
  const ctxR = { member: riley, origin: "https://post.example.com" };

  console.log("Fit tags");
  Tg.resetFitTags();
  const names = Tg.fitTags();
  check("no list set up: the eight categories, then Finance and Technology, with no tags", names.categories.length === 10 && names.categories.slice(0, 8).map((c) => c.name).join("|") === Tg.FIT_CATEGORIES.join("|") && names.categories.every((c) => c.groups.length === 0) && Tg.fitTagsFrom() === "names");
  // A made-up taxonomy, sealed the way the owner's is, with a made-up key, outside the repo.
  const plain = path.join(dir, "made-up-fit-tags.json");
  const TAX = {
    sources: ["SECRET-SOURCE-NOTE"],
    categories: [
      { name: "Sales Leadership", slug: "sales-leadership", roles: ["VP Sales"], roles_doc_summary: "SECRET-ROLES-DOC", roles_doc_section: "SECRET-SECTION", groups: [{ name: "Process", source: "SECRET-GROUP-SOURCE", tags: ["Sales process design", "Forecast methodology", "Founder-led sales exit"] }] },
      { name: "Revenue Operations", slug: "revenue-operations", groups: [{ name: "Systems", source: "x", tags: ["Lead routing and assignment", "CRM sales configuration"] }] },
    ],
  };
  writeFileSync(plain, JSON.stringify(TAX));
  const sealed = path.join(dir, "fit-tags.enc");
  const sealOut = execFileSync(process.execPath, [path.join(ROOT, "scripts/seal-fit-tags.mjs"), plain, "--out", sealed], { env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY }, encoding: "utf8" });
  check("seal-fit-tags.mjs seals it and prints counts only, never the key or a tag", /^sealed 2 categories, 5 tags/.test(sealOut) && !sealOut.includes(TEST_KEY) && !sealOut.includes("Forecast"), sealOut);
  let inRepo = "";
  try {
    execFileSync(process.execPath, [path.join(ROOT, "scripts/seal-fit-tags.mjs"), path.join(ROOT, "package.json"), "--out", path.join(dir, "x.enc")], { env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY }, encoding: "utf8", stdio: "pipe" });
  } catch (e) {
    inRepo = String((e as { stderr?: string }).stderr ?? "");
  }
  check("it refuses a plain file inside the repo", /must not be inside the repo/.test(inRepo), inRepo);
  const enc = readFileSync(sealed, "utf8");
  check("the sealed file holds no tag in the clear", !enc.includes("Forecast") && !enc.includes("SECRET"));
  const fromSealed = Tg.loadFitTags({ sealedPath: sealed, key: TEST_KEY });
  check("data/fit-tags.enc opens with RN_INTEL_SEED_KEY: its categories, groups and tags, then Finance and Technology", fromSealed.from === "sealed" && fromSealed.categories.length === 4 && fromSealed.categories[0].groups[0].tags.includes("Forecast methodology"), fromSealed);
  check("  only names, slugs, group names and tags are kept: never sources, roles or role documents", !JSON.stringify(fromSealed).includes("SECRET") && !JSON.stringify(fromSealed).includes("roles") && !JSON.stringify(fromSealed).includes("source"), JSON.stringify(fromSealed).slice(0, 300));
  const wrongKey = Tg.loadFitTags({ sealedPath: sealed, key: Buffer.alloc(32, 1).toString("base64") });
  check("a wrong key falls back to the category names", wrongKey.from === "names" && wrongKey.categories.length === 10);
  check("RN_FIT_TAGS, a plain file on the host, comes first", Tg.loadFitTags({ plainPath: plain, sealedPath: sealed, key: TEST_KEY }).from === "file");
  check("neither there: the names", Tg.loadFitTags({ plainPath: path.join(dir, "none.json"), sealedPath: path.join(dir, "none.enc"), key: TEST_KEY }).from === "names");
  Tg.resetFitTags(fromSealed);
  check("a known tag is filed under its category; a member's own tag under none", Tg.categoryOf("forecast methodology") === "Sales Leadership" && Tg.categoryOf("Lead routing and assignment") === "Revenue Operations" && Tg.categoryOf("Board reporting") === null);
  check("free-text tags are kept, known ones take the list's spelling, no repeats", JSON.stringify(Tg.cleanTags(["forecast methodology", "Board reporting", "FORECAST METHODOLOGY", "", 7])) === JSON.stringify(["Forecast methodology", "Board reporting"]));
  const sug1 = Tg.suggestTags("I set up lead routing and assignment and rebuilt the forecast methodology for the team.");
  check("suggestions: the tags the words name, the same every time", JSON.stringify(sug1) === JSON.stringify(Tg.suggestTags("I set up lead routing and assignment and rebuilt the forecast methodology for the team.")) && sug1.map((x) => x.name).sort().join("|") === "Forecast methodology|Lead routing and assignment", sug1);

  console.log("\nA draft from a seat");
  const seatJ = pub("e_jordan_nw");
  const d1 = await S.draftFromSeat(J, seatJ);
  check("filled from Jordan's seat: industry, size, revenue, role, dates, hours, why they hired", d1.industry === "Health Care" && d1.size === "201–500" && d1.revenue === "$20M–$50M" && d1.role === "Fractional VP Sales" && d1.fn === "Sales" && d1.start === "2024-02" && d1.end === "2024-12" && d1.hours === "12" && d1.problems[0] === "Build the first sales motion" && d1.status === "draft", d1);
  check("  the client hidden by default, read as its label", d1.client.named === false && d1.client.label === "A health care company, $20M to $50M", d1.client);
  check("  its title from the seat, and the dates in words", d1.title === "Fractional VP Sales seat, Feb 2024 to Dec 2024" && d1.dates === "Feb 2024 to Dec 2024", d1.title);
  check("  the seat and company as public ids, never internal ones", d1.seatId === seatJ && d1.companyId === pub("c_northwind") && !JSON.stringify(d1).includes("c_northwind") && !JSON.stringify(d1).includes("e_jordan_nw"));
  check("the same seat again is the same draft", (await S.draftFromSeat(J, seatJ)).id === d1.id);
  const notMine = await refused(S.draftFromSeat(J, pub("e_riley_cp")));
  check("another member's seat: refused", notMine?.status === 404 && notMine.message === Ty.SEAT_NOT_YOURS, notMine);
  check("a seat id that isn't one: refused", (await refused(S.draftFromSeat(J, "e_nothing")))?.status === 404);

  console.log("\nThe answers and the words");
  const notReady = await refused(S.saveCase(J, { id: d1.id, status: "ready" }));
  check("ready needs the problem and what they did", notReady?.message === Ty.NOT_READY, notReady);
  const NUMBERS = "Win rate went from 22% to 31%. The sales cycle went from 94 days to 61 days. Forecast miss: 30% to 8%";
  const saved = await S.saveCase(J, {
    id: d1.id,
    title: "One sales process and a forecast that holds",
    answers: { problem: "At Northwind Clinics four reps sold four different ways, see northwindclinics.example.", did: "Set one sales process and a weekly forecast, and wrote the first playbook.", numbers: NUMBERS },
    workType: ["forecast methodology", "Sales playbook"],
    workedWith: ["CEO", "4 account executives"],
    motion: "Sales-led",
    soldTo: "Clinic groups",
    status: "ready",
  });
  check("the numbers exactly as typed", JSON.stringify(saved.outcomes) === JSON.stringify([{ k: "Win rate", before: "22%", after: "31%" }, { k: "Sales cycle", before: "94 days", after: "61 days" }, { k: "Forecast miss", before: "30%", after: "8%" }]), saved.outcomes);
  check("the template's words: the client, the problem, what they did, what changed", saved.textBy === "template" && /^The client: a health care company, \$20M to \$50M\. The problem: /.test(saved.text) && /What I did: set one sales process/.test(saved.text) && /What changed: Win rate went from 22% to 31%\./.test(saved.text), saved.text);
  check("ready, with its tags (a known one in the list's spelling) and titles only", saved.status === "ready" && JSON.stringify(saved.workType) === JSON.stringify(["Forecast methodology", "Sales playbook"]) && saved.workedWith.length === 2);
  const list0 = await S.listEvidence(J);
  const listed = JSON.stringify(list0);
  check("the member's own list: the client's name and website scrubbed out of the words they typed", list0.canUse && !listed.includes("Northwind") && !listed.includes("northwindclinics") && list0.cases[0].answers.problem.startsWith("At the client four reps"), list0.cases[0].answers.problem);
  const revealed = await S.listEvidence(J, { reveal: true });
  check("  shown to them when they ask (the eye button): the name, as typed", revealed.cases[0].client.name === "Northwind Clinics" && revealed.cases[0].answers.problem.includes("Northwind Clinics"));
  check("  the list carries the fit tags, the problems and the motions, and AI is off", list0.tags.categories.includes("Sales Leadership") && list0.tags.tags.some((x) => x.name === "Forecast methodology") && list0.problems.length === 10 && list0.motions.length === 4 && list0.ai.on === false);
  const label = await refused(S.saveCase(J, { id: d1.id, clientLabel: "Northwind, a clinic group" }));
  check("a label with the client's name in it is refused", label?.message === S.LABEL_NAMES, label);
  const badMonth = await refused(S.saveCase(J, { id: d1.id, start: "Feb" }));
  const badRev = await refused(S.saveCase(J, { id: d1.id, revenue: "lots" }));
  const email = await refused(S.saveCase(J, { id: d1.id, workedWith: ["sam@northwind.example"] }));
  check("bad months, bands and an email for who they worked with are refused, and change nothing", !!badMonth && !!badRev && !!email && (await S.listEvidence(J)).cases[0].start === "2024-02");
  const own = await S.saveCase(J, { id: d1.id, text: "My own words about it." });
  check("the member's own text stays theirs", own.textBy === "member" && own.text === "My own words about it.");
  const again = await S.saveCase(J, { id: d1.id, answers: { did: "Set one sales process." } });
  check("  a changed answer doesn't overwrite it", again.text === "My own words about it.");
  const back = await S.saveCase(J, { id: d1.id, text: "" });
  check("  emptied, the template's words come back", back.textBy === "template" && /What I did: set one sales process\./.test(back.text), back.text);

  console.log("\nThe client hidden everywhere");
  const s1 = await T.loadState();
  const seed = await T.loadSeed();
  const proof = S.proofIn(seed, s1, jordan.id, "c_halcyon");
  check("the Proof part: the closest case, the client as its label, the words scrubbed", proof.length === 1 && proof[0].client === "A health care company, $20M to $50M" && proof[0].named === false && !JSON.stringify(proof).includes("Northwind") && !JSON.stringify(proof).includes("northwindclinics"), proof);
  check("  with its match in words", proof[0].match?.label === "Same" && proof[0].match.same.includes("Same industry"), proof[0].match);
  const viaProof = await S.toProof(J, { companyId: pub("c_halcyon") });
  check("toProof by the company's public id: the same", JSON.stringify(viaProof.items) === JSON.stringify(proof));
  check("proofFor and listCases, the helpers by member id: hidden too", !JSON.stringify(await S.proofFor(jordan.id, pub("c_halcyon"))).includes("Northwind") && !JSON.stringify(await S.listCases(jordan.id)).includes("Northwind") && (await S.proofFor(jordan.id, "c_halcyon")).length === 1);
  const card = await S.setCard(J, d1.id, true);
  check("on the card: hidden-client-safe", card.card.length === 1 && card.card[0].client === "A health care company, $20M to $50M" && !JSON.stringify(card).includes("Northwind"), card);
  check("  and as any reader reads it (cardFor)", JSON.stringify(await S.cardFor(jordan.id)) === JSON.stringify(card.card));
  const mcpList = await MC.listEvidenceTool(ctxJ, {});
  check("the connector's list_evidence: the label, no name, no company or seat id", JSON.stringify(mcpList).includes("A health care company, $20M to $50M") && !JSON.stringify(mcpList).includes("Northwind") && !/company_?id|seat_?id|c_northwind|e_jordan/i.test(JSON.stringify(mcpList)), JSON.stringify(mcpList).slice(0, 300));
  await S.saveCase(J, { id: d1.id, clientNamed: true });
  const namedProof = S.proofIn(seed, await T.loadState(), jordan.id, "c_halcyon");
  check("named by the member: the name goes with it", namedProof[0].client === "Northwind Clinics" && namedProof[0].named && namedProof[0].text.startsWith("The client: Northwind Clinics, a health care company"), namedProof[0]);
  check("  and the connector says it", JSON.stringify(await MC.listEvidenceTool(ctxJ, {})).includes("Northwind Clinics"));
  await S.saveCase(J, { id: d1.id, clientNamed: false });
  check("hidden again: gone again", !JSON.stringify(await MC.listEvidenceTool(ctxJ, {})).includes("Northwind") && !JSON.stringify(S.proofIn(seed, await T.loadState(), jordan.id, "c_halcyon")).includes("Northwind"));

  console.log("\nEach member's own");
  const rList = await S.listEvidence(R);
  check("Riley's list has none of Jordan's cases", rList.canUse && rList.cases.length === 0);
  check("Riley can't change, remove, use or show Jordan's case", (await refused(S.saveCase(R, { id: d1.id, title: "Mine now" })))?.status === 404 && (await refused(S.removeCase(R, d1.id)))?.status === 404 && (await refused(S.toProof(R, { caseIds: [d1.id] })))?.status === 404 && (await refused(S.setCard(R, d1.id, true)))?.status === 404);
  const rView = JSON.stringify(await T.buildView(R, { fresh: true }));
  check("Riley's table carries nothing of it", !rView.includes(d1.id) && !rView.includes("One sales process") && !rView.includes("forecast that holds"));
  check("Riley's connector: nothing of Jordan's", !JSON.stringify(await MC.listEvidenceTool(ctxR, {})).includes("sales process"));
  check("Riley's proof for the same company: nothing", S.proofIn(seed, await T.loadState(), riley.id, "c_halcyon").length === 0);
  const exp = JSON.stringify(await T.exportState());
  check("the admin export leaves the whole part out", !exp.includes('"evidence"') && !exp.includes(d1.id) && !exp.includes("forecast that holds") && !exp.includes('"evidenceAi"'));
  const otherProp = await refused(S.toProof(J, { companyId: pub("c_halcyon"), proposalId: "pr_not_mine" }));
  check("toProof into a proposal that isn't theirs: refused", otherProp?.status === 404, otherProp);
  await T.tableInternals.mutate((st) => void (st.proposals ??= []).push({ id: "pr_jordan", memberId: "mem_jordan", sends: [] } as never));
  await S.toProof(J, { companyId: pub("c_halcyon"), proposalId: "pr_jordan" });
  await S.toProof(J, { caseIds: [d1.id], proposalId: "pr_jordan" });
  check("toProof into one of theirs: the case notes it is used there, once", JSON.stringify((await S.listEvidence(J)).cases.find((c) => c.id === d1.id)?.usedIn) === JSON.stringify(["pr_jordan"]));
  const rileyProof = await refused(S.toProof(R, { companyId: pub("c_halcyon"), proposalId: "pr_jordan" }));
  check("  Riley can't note use in Jordan's proposal", rileyProof?.status === 404, rileyProof);

  console.log("\nMatch, in words, the same every time");
  const caseF = { industry: "Health Care", size: "201–500", revenue: "$20M–$50M", motion: "Sales-led", fn: "Sales", problems: [], workType: [] };
  const coF = { industry: "Health Care", size: "201–500", revenue: "$20M–$50M", motion: "Inside sales", founderLed: false, reasons: [], openFns: ["Sales"], endedFns: [] };
  const m1 = Mt.matchCase(caseF, coF);
  check("the same facts and an open Sales role: Same, with every reason", m1.label === "Same" && JSON.stringify(m1.same) === JSON.stringify(["Same industry", "Same size", "Same revenue", "Sales-led", "Hiring Sales now"]) && m1.diff.length === 0, m1);
  check("deterministic: the same words every time", JSON.stringify(Mt.matchCase(caseF, coF)) === JSON.stringify(m1) && JSON.stringify(Mt.matchCase(structuredClone(caseF), structuredClone(coF))) === JSON.stringify(m1));
  const m2 = Mt.matchCase(caseF, { ...coF, industry: "Pharma & Biotech", size: "51–200", openFns: [] });
  check("a related industry, one band smaller: Close", m2.label === "Close" && m2.same.includes("A related industry") && m2.same.includes("Similar size"), m2);
  const m3 = Mt.matchCase(caseF, { industry: "Restaurants", size: "1–10", revenue: "Under $1M", motion: "Channel", founderLed: false, reasons: [], openFns: [], endedFns: [] });
  check("far off on everything: Different, and what differs", m3.label === "Different" && m3.same.length === 0 && JSON.stringify(m3.diff) === JSON.stringify(["A different industry", "A much larger client", "A client with more revenue", "Sales-led, not channel"]), m3);
  const m4 = Mt.matchCase({ ...caseF, motion: "Founder-led", problems: ["Move off founder-led sales"] }, { ...coF, industry: "", size: "", revenue: "", motion: "", founderLed: true, reasons: ["Move off founder-led sales"], openFns: [] });
  check("founder-led and the same problem on file: Same, said so", m4.label === "Same" && m4.same.includes("Founder-led") && m4.same.includes("Same problem"), m4);
  const m5 = Mt.matchCase({ ...caseF, industry: "", size: "", revenue: "", motion: "", fn: "" }, coF);
  check("nothing to compare: Different, saying so", m5.label === "Different" && m5.diff.includes("Too little on file to compare"), m5);
  check("no percentage anywhere in the words", ![m1, m2, m3, m4, m5].some((m) => /%|\d/.test([...m.same, ...m.diff].join(" "))));
  const facts = S.evidenceInternals.companyFactsIn(seed, await T.loadState(), "c_larkspur")!;
  check("a company's facts from the table: free ones only, founder-led and the ended Sales seat read", facts.industry === "EdTech" && facts.founderLed && JSON.stringify(facts.endedFns) === JSON.stringify(["Sales"]) && facts.openFns.length === 0 && !JSON.stringify(facts).includes("Larkspur"), facts);
  const hfFacts = S.evidenceInternals.companyFactsIn(seed, await T.loadState(), "c_halcyon")!;
  check("  an open role's function", JSON.stringify(hfFacts.openFns) === JSON.stringify(["Sales"]), hfFacts);
  // A second ready case, to rank.
  const c2 = await S.saveCase(J, { title: "Sales off the founder's desk", industry: "EdTech", size: "51–200", revenue: "$5M–$20M", motion: "Founder-led", fn: "Sales", problems: ["Move off founder-led sales"], answers: { problem: "The founder closed every deal.", did: "Built the sales process and hired two reps." }, status: "ready" });
  const r1 = await S.matchEvidence(J, { companyId: pub("c_larkspur") });
  const r2 = await S.matchEvidence(J, { companyId: pub("c_larkspur") });
  check("ranked for a company: the closest first, the same order every time", "cases" in r1 && r1.cases[0].caseId === c2.id && r1.cases[0].closest && r1.cases[0].label === "Same" && !r1.cases[1].closest && JSON.stringify(r1) === JSON.stringify(r2), r1);
  check("  and for Halcyon, the other way round", (() => {
    return true;
  })() && ("cases" in (await S.matchEvidence(J, { companyId: pub("c_halcyon") })) ? ((await S.matchEvidence(J, { companyId: pub("c_halcyon") })) as { cases: { caseId: string }[] }).cases[0].caseId === d1.id : false));
  const rows = await S.matchEvidence(J, { companyIds: [pub("c_halcyon"), pub("c_larkspur"), "c_nothing"] });
  check("a list's rows: the closest case per company, null for one not on file", "rows" in rows && rows.rows[pub("c_halcyon")]?.caseId === d1.id && rows.rows[pub("c_larkspur")]?.caseId === c2.id && rows.rows["c_nothing"] === null, rows);
  check("an internal company id from outside is not a company", (await refused(S.matchEvidence(J, { companyId: "c_halcyon" })))?.status === 404);
  const mm = await MC.matchEvidenceTool(ctxJ, { company_id: pub("c_larkspur") });
  check("the connector's match_evidence: words, the closest first", (mm.ranked as { match: string; closest: boolean }[])[0].closest && ["Same", "Close", "Different"].includes((mm.ranked as { match: string }[])[0].match) && !JSON.stringify(mm).includes("Larkspur"), mm);
  const dr = await S.draftFromSeat(J, seatJ);
  check("drafts are skipped in a match", "cases" in r1 && r1.skipped === 0 && dr.id === d1.id);

  console.log("\nClose only");
  const fl = await S.listEvidence(F);
  check("Free: the list says Close, with the link, and keeps no case or tag", fl.canUse === false && fl.plan === S.CLOSE_EVIDENCE && /Close: \$79 a month/.test(fl.plan!) && /p=billing/.test(fl.upgrade ?? "") && fl.cases.length === 0 && fl.tags.tags.length === 0 && fl.kept === 0, fl);
  const gates = await Promise.all([
    refused(S.saveCase(F, { title: "x" })),
    refused(S.draftFromSeat(F, seatJ)),
    refused(S.matchEvidence(F, { companyId: pub("c_halcyon") })),
    refused(S.matchEvidence(F, { companyIds: [pub("c_halcyon")] })),
    refused(S.toProof(F, { companyId: pub("c_halcyon") })),
    refused(S.setCard(F, undefined, false)),
    refused(S.removeCase(F, "ev_x")),
    refused(S.tagPicker(F)),
    refused(S.suggestFor(F, "forecast methodology")),
  ]);
  check("Free: every write, match, proof, card and the tag list refused, 403, with the upgrade link", gates.every((g) => g?.status === 403 && g.message === S.CLOSE_EVIDENCE && /p=billing/.test(g.upgrade ?? "")), gates);
  const fm = (await T.memberForToken(F))!;
  check("Free: the helpers give nothing", S.proofIn(seed, await T.loadState(), fm.id, "c_halcyon").length === 0 && S.cardIn(await T.loadState(), fm.id).length === 0 && (await S.matchCompany(fm.id, "c_halcyon")) === null);
  const fmc = await MC.listEvidenceTool({ member: fm, origin: "https://post.example.com" }, {});
  const fms = await MC.saveEvidenceTool({ member: fm, origin: "https://post.example.com" }, { problem: "x", confirm: true });
  check("Free in the connector: the plan's words and the link, nothing saved", fmc.can_use === false && /Evidence Bank is on Close/.test(String(fmc.plan)) && fms.can_use === false && !(await T.loadState()).evidence?.mem_free);
  // Jordan's trial ends: his cases are kept, unused, and come back on Close.
  const was = structuredClone((await T.loadState()).billing!.members.mem_jordan);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_jordan = { trialStartedAt: iso(-30 * DAY), trialEndsAt: iso(-DAY) }));
  const off = await S.listEvidence(J);
  check("after the trial: kept, not shown or used, the card empty", off.canUse === false && off.kept === 2 && S.cardIn(await T.loadState(), jordan.id).length === 0 && S.proofIn(seed, await T.loadState(), jordan.id, "c_halcyon").length === 0);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_jordan = { ...was, tier: "close", proUntil: iso(30 * DAY) } as typeof was));
  check("on Close: back as they were", (await S.listEvidence(J)).cases.length === 2);
  await T.tableInternals.mutate((st) => void (st.billing!.members.mem_jordan = was));
  // The route turns a refusal into 403 with `upgrade`.
  const { GET, POST } = await import("../app/api/evidence/route");
  const { NextRequest } = await import("next/server");
  const req = (method: string, tok: string, body?: unknown, q = "") =>
    new NextRequest(`https://post.example.com/api/evidence${q}`, { method, headers: { cookie: `rn_table=${tok}`, "content-type": "application/json", "x-forwarded-for": "203.0.113.7" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const rf = await POST(req("POST", F, { op: "save", title: "x" }));
  const rfj = await rf.json();
  check("the route: Free's save is 403 with the words and `upgrade`", rf.status === 403 && rfj.error === S.CLOSE_EVIDENCE && /p=billing/.test(rfj.upgrade), [rf.status, rfj]);
  const rg = await GET(req("GET", F));
  check("  Free's list is 200 with canUse false", rg.status === 200 && (await rg.json()).canUse === false);
  const rj = await (await GET(req("GET", J))).json();
  check("  Jordan's list, client hidden; with ?reveal=1 the name", !JSON.stringify(rj).includes("Northwind") && JSON.stringify(await (await GET(req("GET", J, undefined, "?reveal=1"))).json()).includes("Northwind Clinics"));
  check("  signed out: 401", (await GET(req("GET", "nobody"))).status === 401 && (await POST(req("POST", "nobody", { op: "list" }))).status === 401);
  check("  an unknown op: 400", (await POST(req("POST", J, { op: "nope" }))).status === 400);
  const rt = await (await POST(req("POST", J, { op: "suggestTags", text: "Rebuilt the forecast methodology." }))).json();
  check("  suggestTags on Close: from the words", rt.tags?.[0]?.name === "Forecast methodology", rt);

  console.log("\nThe connector asks first");
  const prev = await MC.saveEvidenceTool(ctxR, { title: "A brand plan", problem: "No brand at Cedar and Pine.", what_i_did: "Wrote the brand plan.", client_name: "Cedar and Pine", industry: "SaaS", ready: true });
  check("save_evidence_case without confirm saves nothing, and shows it with the client hidden", prev.confirmed === false && !(await T.loadState()).evidence?.mem_riley?.length && !JSON.stringify(prev).includes("Cedar and Pine") && (prev.would_save as { client: string }).client === "A SaaS company", prev);
  const conf = await MC.saveEvidenceTool(ctxR, { title: "A brand plan", problem: "No brand at Cedar and Pine.", what_i_did: "Wrote the brand plan.", client_name: "Cedar and Pine", industry: "SaaS", ready: true, confirm: true });
  check("  with confirm: saved, still hidden", conf.confirmed === true && (await T.loadState()).evidence?.mem_riley?.length === 1 && !JSON.stringify(conf).includes("Cedar and Pine"), conf);

  console.log("\n50 at most");
  const already = (await T.loadState()).evidence!.mem_jordan.length;
  for (let i = already; i < Ty.EVIDENCE_LIMITS.cases; i++) await S.saveCase(J, { title: `Case ${i}` });
  check("50 cases", (await T.loadState()).evidence!.mem_jordan.length === 50);
  const full = await refused(S.saveCase(J, { title: "One more" }));
  check("the 51st is refused, with what to do", full?.status === 409 && full.message === Ty.FULL, full);
  check("  a draft from a seat too", (await refused(S.saveCase(J, {}))) !== null);
  await S.removeCase(J, (await T.loadState()).evidence!.mem_jordan.at(-1)!.id);
  check("remove one: room for one", (await S.saveCase(J, { title: "One more" })).title === "One more");

  console.log("\nMerlin's AI");
  const offAi = await refused(S.writeCase(J, d1.id, {}));
  check("off by default: Merlin joins the answers instead (409)", offAi?.status === 409 && offAi.message === S.AI_OFF_CASE);
  Object.assign(process.env, { RN_AI_DRAFTS: "1", ANTHROPIC_API_KEY: "sk-made-up-evidence", RN_AI_MODEL: "made-up-model", RN_AI_TEST_BASE_URL: AI_BASE });
  const ask = await refused(S.writeCase(J, d1.id, {}));
  check("on: asks to agree first (428), and nothing went out", ask?.status === 428 && aiCalls.length === 0, ask);
  const msg = (o: Record<string, string>) => ({ id: "msg_1", type: "message", role: "assistant", model: "made-up-model", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(o) }], usage: { input_tokens: 1000, output_tokens: 200 } });
  aiAnswer = () => msg({ title: "A forecast that holds", problem: "Four reps sold four ways.", did: "I set one process and a weekly forecast for 40 reps.", numbers: "Win rate went from 22% to 31%.", text: "A health care company, $20M to $50M, had four reps selling four ways. I set one process. Win rate went from 22% to 35%." });
  const PASTE = "PASTED-RESULTS-EMAIL: the win rate went from 22% to 31% this year.";
  const w = await S.writeCase(J, d1.id, { agree: true, paste: PASTE });
  check("one request, with the label, never the hidden client's name", aiCalls.length === 1 && aiCalls[0].includes("A health care company, $20M to $50M") && !aiCalls[0].includes("Northwind Clinics") && aiCalls[0].includes("made-up-model"), aiCalls[0]?.slice(0, 300));
  check("a number the member didn't type keeps their own words (40 reps, 35%)", w.case.answers.did === "Set one sales process." && w.kept.includes("did") && w.kept.includes("text") && w.case.textBy === "template" && !w.case.text.includes("35%"), w);
  check("  what has only their numbers is used", w.case.answers.problem === "Four reps sold four ways." && w.case.title === "One sales process and a forecast that holds");
  const sAfter = await T.loadState();
  check("the paste is never kept; the agreement and the usage are", !JSON.stringify(sAfter).includes("PASTED-RESULTS-EMAIL") && !!sAfter.evidenceAi?.mem_jordan && (sAfter.aiUsage?.mem_jordan?.log?.length ?? 0) === 1);
  aiAnswer = () => msg({ title: "x", problem: "Four reps sold four ways.", did: "Set one process.", numbers: "Win rate went from 22% to 31%.", text: "Four reps sold four ways at Northwind Clinics. I set one process. Win rate went from 22% to 31%." });
  const w2 = await S.writeCase(J, d1.id, {});
  check("with only their numbers: Merlin's words, scrubbed of the hidden client", w2.case.textBy === "merlin" && !JSON.stringify((await S.listEvidence(J)).cases.find((c) => c.id === d1.id)).includes("Northwind") && w2.kept.length === 0, w2);
  for (const k of ["RN_AI_DRAFTS", "ANTHROPIC_API_KEY", "RN_AI_MODEL", "RN_AI_TEST_BASE_URL"]) delete process.env[k];

  console.log("\nCompanies removed or merged");
  const all = structuredClone((await T.loadState()).evidence!);
  Ty.mergeCompanyEvidence(all, "c_northwind", "c_northwind2");
  check("merged: the case points to the company kept", all.mem_jordan.find((c) => c.id === d1.id)!.companyId === "c_northwind2");
  Ty.forgetCompanyEvidence(all, "c_northwind2");
  const gone = all.mem_jordan.find((c) => c.id === d1.id)!;
  check("removed: the words and label stay, the link goes", !gone.companyId && !gone.seatId && gone.clientLabel === "A health care company, $20M to $50M" && !!gone.text);

  console.log("\nAccount closure");
  await T.tableInternals.mutate((st, sd) => void T.tableInternals.purgeMember(st, sd, jordan.id, new Date().toISOString()));
  const sp = await T.loadState();
  check("purge: every case of his and his AI agreement, gone", !sp.evidence?.mem_jordan && !sp.evidenceAi?.mem_jordan && !JSON.stringify(sp).includes("forecast that holds"));
  check("  Riley's untouched", sp.evidence?.mem_riley?.length === 1);

  console.log("\nThe words");
  const data = src("app/data/DataFlows.tsx");
  const doc = src("docs/data-flows.md");
  check("the data page: Evidence Bank, the client hidden, only you, deleted with your data", /Inside Merlin: your Evidence Bank/.test(data) && /The client is hidden unless you choose to name it/.test(data) && /your Evidence Bank, (your alerts and the bell, )?the messages you wrote/.test(data));
  check("  and it never names LinkedIn", !/LinkedIn/.test(data));
  check("docs/data-flows.md: the store, purge and export", /### Evidence Bank/.test(doc) && /State\.evidence\[memberId\]/.test(doc) && /exportState/.test(doc) && /purgeMember/.test(doc) && /fit-tags\.enc/.test(doc));
  check("the closing words name it", /your Evidence Bank cases/.test(src("lib/account.ts")));
  const dLabel = D.clientLabelOf({ industry: "EdTech", size: "51–200" });
  check("labels: an EdTech company, its size when there's no revenue", dLabel === "An EdTech company, 51 to 200 people" && D.clientLabelOf({}) === "A client company" && D.clientLabelOf({ industry: "Healthcare Providers & Health Systems", revenue: "$50M+" }) === "A company in healthcare providers & health systems, over $50M", dLabel);

  console.log(`\n${passes} passed, ${failures} failed`);
  done(failures ? 1 : 0);
}

function done(code: number): never {
  rmSync(dir, { recursive: true, force: true, maxRetries: 3 });
  process.exit(code);
}

main().catch((e) => {
  console.error(e);
  done(1);
});
