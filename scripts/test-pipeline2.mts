/**
 * Checks of Pipeline in the new look (app/post/pipeline/*, Pipeline.dc.html) and what it added to
 * Your pipeline: a deal's value a month and the seat pitched (lib/pipeline.ts value, pitch,
 * dealMonthly), Add a deal ("pipeline.deal"), changing the value on the card ("pipeline.value"), the
 * proposal or contract on a deal (lib/pipelineActions.ts papersFor), the board's words, filters,
 * sorts and totals (app/post/pipeline/model.ts), and the two Example cards of a first visit.
 *
 *   npx tsx scripts/test-pipeline2.mts      exits 1 on any failure
 *
 * No server and no network: lib/table.ts runs in process on a made-up seed in a temporary data
 * folder, removed at the end. Every person and company is made up.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 700)}`);
};

const DAY = 86_400_000;
const NOW = Date.now();
const iso = (ms: number) => new Date(NOW + ms).toISOString();
const dir = mkdtempSync(path.join(tmpdir(), "rn-pipeline2-"));

const co = (id: string, name: string, site: string) => ({ id, fields: { name, website: site, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Austin, TX" } });
const companies = [co("c_wren", "Wrenfield Analytics", "wrenfield.example"), co("c_moss", "Mosswood Supply", "mosswood.example"), co("c_hid", "Quillback Systems", "quillback.example"), co("c_ost", "Ostrander Freight", "ostrander.example")];
const seat = (id: string, companyId: string) => ({ id, companyId, verified: false, fields: { type: "Fractional", status: "Active", end: "Ongoing", start: "2025-01", source: "Member success story", role: "Fractional CRO", function: "Sales" } });
const engagements = companies.map((c) => seat(`e_${c.id.slice(2)}`, c.id));
const member = (id: string, name: string, email: string) => ({ id, name, email, title: "Fractional VP Sales", token: `tok-${id.slice(4)}-pl2` });
const members = [member("mem_jor", "Jordan Avery", "jordan.avery@avery.example"), member("mem_kit", "Kit Other", "kit.other@other.example")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: iso(-60 * DAY), members, companies, engagements, contacts: [] }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, iso(-3_600_000)])),
    profiles: Object.fromEntries(members.map((m) => [m.id, { function: "Sales", onboarded: true, icp: { industries: [], employees: [], revenue: [], countries: [] } }])),
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: Buffer.alloc(32, 7).toString("base64"),
  RN_ID_SECRET: "test-id-secret-not-real",
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
});
for (const k of ["RN_FREE_COMPANY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_BILLING", "RN_GOOGLE", "RN_DIGEST", "RN_ADMIN_EMAILS"]) delete process.env[k];

async function main() {
  const P = await import("../lib/pipeline");
  const M = await import("../app/post/pipeline/model");
  const X = await import("../app/post/examples");
  const T = await import("../lib/table");
  const PA = await import("../lib/pipelineActions");

  /* ================= the rules, pure ================= */
  console.log("\nwhat a deal is worth");
  check("9000, $9,000 and 9k are $9,000 a month", [P.cleanValue("9000"), P.cleanValue("$9,000"), P.cleanValue("9k"), P.cleanValue(9000)].every((v) => v.value?.amount === 9000 && v.value.per === "month"));
  check("empty or null takes the value off", P.cleanValue("").value === null && P.cleanValue(null).value === null && P.cleanValue("  ").value === null);
  check("not a number, zero, below zero and too high are said in words", [P.cleanValue("lots"), P.cleanValue("0"), P.cleanValue("-5"), P.cleanValue(600_000)].every((v) => !!v.error && v.value === undefined));
  check("the seat pitched: one line, at most 60, nothing too short", P.cleanPitch("  Fractional\n VP   Sales ") === "Fractional VP Sales" && P.cleanPitch("x") === null && (P.cleanPitch("a".repeat(90)) ?? "").length === P.PITCH_MAX);
  check("seats to pitch for Sales are plain titles", JSON.stringify(P.pitchesFor("Sales")) === JSON.stringify(["Fractional VP Sales", "Fractional CRO", "Sales advisor"]) && P.pitchesFor(null).length > 0);

  const log = P.emptyPipeline();
  const t0 = Date.UTC(2026, 10, 23, 15);
  const a = P.addDeal(log, { id: "d1", companyId: "c_x", nowMs: t0, stage: "sent", value: { amount: 9000, per: "month" }, pitch: "Fractional CRO" });
  check("Add a deal at Sent: a new deal, marked by you, its follow-up in 3 business days", a.created && a.entry.stage === "sent" && a.entry.via.sent === "you" && a.entry.due === "2026-11-26" && a.entry.source === "record", a.entry);
  check("it keeps the value and the seat the member typed", a.entry.value?.amount === 9000 && a.entry.pitch === "Fractional CRO");
  check("its log says you added the deal, then moved it", a.entry.log.some((l) => l.text === "To reach out: you added the deal") && a.entry.log.some((l) => l.text === "You moved it to Sent"));
  const again = P.addDeal(log, { id: "d2", companyId: "c_x", nowMs: t0, stage: "won", value: { amount: 1, per: "month" } });
  check("adding again at the same company keeps the one deal as it was", !again.created && log.entries.length === 1 && again.entry.stage === "sent" && again.entry.value?.amount === 9000);
  const b = P.addDeal(log, { id: "d3", companyId: "c_y", nowMs: t0 });
  check("no stage given: To reach out, nothing due, no value", b.entry.stage === "reach" && b.entry.due === null && !b.entry.value && !b.entry.pitch);
  check("setDeal changes and logs the value", P.setDeal(b.entry, { value: { amount: 7500, per: "month" } }, t0) && b.entry.value?.amount === 7500 && b.entry.log.at(-1)!.text === "Value: $7,500 a month");
  check("the same value again changes nothing", !P.setDeal(b.entry, { value: { amount: 7500, per: "month" } }, t0));
  check("null takes it off; undefined leaves it", P.setDeal(b.entry, { value: null, pitch: undefined }, t0) && !b.entry.value && b.entry.log.at(-1)!.text === "Value taken off");
  check("dealMonthly: an open deal counts its value", P.dealMonthly(a.entry) === 9000 && P.dealMonthly(b.entry) === 0);
  const w = { ...a.entry, stage: "won" as const, won: { pricing: "hourly" as const, rate: 175, hours: 15, start: null, months: null, merlin: true, at: iso(0) } };
  check("dealMonthly: a Won deal with terms counts its terms, not the value typed", P.dealMonthly(w) === Math.round((175 * 15 * 52) / 12));
  check("Home's funnel words for open value", P.openValueWords({ openMonthly: 16500 }) === "$16,500 a month in play" && P.openValueWords({ openMonthly: 0 }) === null);

  /* ================= the board's words ================= */
  console.log("\nthe board");
  check("columns are Merlin's own stages, Lost folded last", JSON.stringify(M.COLS) === JSON.stringify(["reach", "sent", "replied", "meeting", "proposal", "won", "closed"]) && M.COL_WORDS.reach === P.STAGE_WORDS.reach && M.COL_WORDS.sent === "Sent");
  check("Lost, Not now and Went quiet fold into the Lost column; a drop there is Lost", (["lost", "notnow", "quiet"] as const).every((s) => M.colOf(s) === "closed") && M.colOf("meeting") === "meeting" && M.dropStage("closed") === "lost");
  check("every stage the member can move to is a column's drop", P.MOVE_STAGES.every((s) => s === "notnow" || M.COLS.some((k) => M.dropStage(k) === s)));
  check("due today, late and ahead in words", M.dueWords("2026-11-23", "2026-11-23").text === "Due today" && M.dueWords("2026-11-20", "2026-11-23").text === "Due Fri Nov 20, 3 days late" && M.dueWords("2026-11-25", "2026-11-23").text === "Due Wed Nov 25" && !M.dueWords("2026-11-25", "2026-11-23").hot);

  const rec = (o: Partial<import("../lib/pipeline").PipelineRec>): import("../lib/pipeline").PipelineRec => ({
    id: "r",
    company: "pub",
    name: "Wrenfield Analytics",
    stage: "sent",
    channel: "email",
    to: { label: "Dana", name: "Dana Whitfield", role: "CEO", google: false },
    source: "record",
    merlinDefault: false,
    dates: {},
    via: {},
    how: "From your note on Nov 20",
    due: null,
    follow: 0,
    next: null,
    fix: [],
    notes: [],
    log: [],
    value: null,
    pitch: null,
    monthly: 0,
    createdAt: iso(0),
    updatedAt: iso(0),
    ...o,
  });
  check("next move at Sent names who it went to", M.nextOf(rec({ due: "2026-11-23" }), "2026-11-23").title === "Follow up with Dana" && M.nextOf(rec({ due: "2026-11-23" }), "2026-11-23").hot);
  check("a locked deal at To reach out opens first", M.nextOf(rec({ stage: "reach", name: null }), "2026-11-23").title === "Open the company, then write your note");
  check("a proposal waiting on the member is due today", M.nextOf(rec({ stage: "proposal", paper: { kind: "proposal", id: "p", title: "t", state: "Signed by Dana. You sign next", tone: "you", log: [] } }), "2026-11-23").title === "Countersign the proposal");
  check("the way in: an intro, a lead, a route; none chosen is null", M.wayOf(rec({ intro: { id: "i", by: "Rita Okafor", status: "made" } })) === "Through Rita Okafor's intro" && M.wayOf(rec({ lead: { id: "l", by: "Ana Lindqvist" } })) === "Referred to you by Ana" && M.wayOf(rec({}), { via: "via Casey → Rita" }) === "Your route via Casey → Rita" && M.wayOf(rec({})) === null);
  const list = [rec({ id: "1", name: "Bravo", monthly: 9000, due: "2026-11-30" }), rec({ id: "2", name: "Alpha", monthly: 12000, due: "2026-11-20" }), rec({ id: "3", name: null, monthly: 0, due: null })];
  check("sort by value: highest first", M.sortDeals(list, "value").map((r) => r.id).join() === "2,1,3");
  check("sort by company: A to Z, locked last", M.sortDeals(list, "company").map((r) => r.id).join() === "2,1,3");
  check("sort by next move: the latest first, none last", M.sortDeals(list, "due").map((r) => r.id).join() === "2,1,3");
  check("column totals: count and value a month, 'No value yet' without one", M.colTotal("sent", list).n === 3 && M.colTotal("sent", list).words === "$21,000 a month" && M.colTotal("won", [rec({ stage: "won", monthly: 5000, won: { monthly: 5000 } as never })]).words === "$5,000 a month won" && M.colTotal("sent", [rec({})]).words === "No value yet");
  // A Won deal without terms shows no value (the value typed before it was won is not what it won), as Home's numbers count it.
  check("a Won deal without terms shows no value, and its column says so", M.shownMonthly(rec({ stage: "won", monthly: 9000 })) === 0 && M.colTotal("won", [rec({ stage: "won", monthly: 9000 })]).words === "No value yet" && M.shownMonthly(rec({ stage: "sent", monthly: 9000 })) === 9000);
  check("filters: due, with a proposal, no way in, with a peer", M.passes("due", list[1], "2026-11-23") && !M.passes("due", list[0], "2026-11-23") && M.passes("noway", list[0], "2026-11-23") && !M.passes("peer", list[0], "2026-11-23"));

  console.log("\nthe Example cards");
  check("two Example cards, each wrapped and labelled Example, frozen", M.EXAMPLE_CARDS.length === 2 && M.EXAMPLE_CARDS.every((x) => X.isExample(x) && x.label === "Example" && Object.isFrozen(x)));
  check("an Example has nothing an action takes: no id, no company id", M.EXAMPLE_CARDS.every((x) => !("id" in x) && !("companyId" in x) && !("id" in (x.value as object)) && !("company" in x)));
  check("examples are taken out of whatever counts", M.realDeals([...M.EXAMPLE_CARDS, list[0]]).length === 1);
  check("the summary of a first visit says the examples are examples and counts nothing", M.summaryWords({ entries: [], openMonthly: 0, today: "2026-11-23" }) === "No deals yet. The 2 cards marked Example show how one works.");
  check("examples use the made-up cast", JSON.stringify(M.EXAMPLE_CARDS).includes("Northwind Clinics") && JSON.stringify(M.EXAMPLE_CARDS).includes("Cedar and Pine"));

  /* ================= the actions ================= */
  console.log("\nAdd a deal and the value, in process");
  const JOR = "tok-jor-pl2";
  const KIT = "tok-kit-pl2";
  const pub = (id: string) => T.tableInternals.pubId(id);
  const refused = async (p: Promise<unknown>) => p.then(() => null, (e: Error) => e.message);
  const act = (tok: string, x: Record<string, unknown>) => PA.performPipeline(tok, x as never);
  for (const c of ["c_wren", "c_moss", "c_ost"]) await T.perform(JOR, { type: "unlock", entity: "company", id: pub(c), field: "identity" } as never, "https://post.example.com");
  let r = await act(JOR, { type: "pipeline.deal", companyId: pub("c_wren"), stage: "sent", value: "$9,000", pitch: "Fractional VP Sales" });
  let d = r.pipeline!.entries.find((e) => e.company === pub("c_wren"))!;
  check("Add a deal: at Sent with its value and the seat pitched", !!d && d.stage === "sent" && d.value === 9000 && d.monthly === 9000 && d.pitch === "Fractional VP Sales" && /never spends a credit/.test(r.message), [d, r.message]);
  check("the view sums open value and how many have one", r.pipeline!.openMonthly === 9000 && r.pipeline!.valued === 1);
  check("a locked company is refused: open it first", /Open the company first/.test((await refused(act(JOR, { type: "pipeline.deal", companyId: pub("c_hid") }))) ?? ""));
  check("a company not on Merlin is refused, in words", /isn't on Merlin/.test((await refused(act(JOR, { type: "pipeline.deal", companyId: "nope" }))) ?? ""));
  check("a bad value is refused before anything is added", /Type what it is worth/.test((await refused(act(JOR, { type: "pipeline.deal", companyId: pub("c_moss"), value: "lots" }))) ?? "") && !(await PA.pipelineViewFor(JOR))!.entries.some((e) => e.company === pub("c_moss")));
  check("a stage Merlin keeps for itself (Went quiet) is refused", !!(await refused(act(JOR, { type: "pipeline.deal", companyId: pub("c_moss"), stage: "quiet" }))));
  r = await act(JOR, { type: "pipeline.deal", companyId: pub("c_wren"), stage: "won", value: 1 });
  check("adding the same company again keeps its deal and says where it is", /already, at Sent/.test(r.message) && r.pipeline!.entries.filter((e) => e.company === pub("c_wren")).length === 1 && r.pipeline!.entries.find((e) => e.company === pub("c_wren"))!.value === 9000, r.message);
  r = await act(JOR, { type: "pipeline.deal", companyId: pub("c_moss") });
  const moss = r.pipeline!.entries.find((e) => e.company === pub("c_moss"))!;
  check("no stage, no value: To reach out, no value yet", moss.stage === "reach" && moss.value === null && moss.monthly === 0 && r.pipeline!.openMonthly === 9000);
  r = await act(JOR, { type: "pipeline.value", id: moss.id, value: "11000", pitch: "Fractional CRO" });
  check("the value changed on the card counts in the totals", r.pipeline!.entries.find((e) => e.id === moss.id)!.value === 11000 && r.pipeline!.openMonthly === 20000 && r.pipeline!.valued === 2 && r.message === "Saved: $11,000 a month.", r.message);
  check("its log says so", r.pipeline!.entries.find((e) => e.id === moss.id)!.log.some((l) => l.text === "Value: $11,000 a month"));
  r = await act(JOR, { type: "pipeline.value", id: moss.id, value: null });
  check("taken off: back to no value, the seat kept", r.pipeline!.entries.find((e) => e.id === moss.id)!.value === null && r.pipeline!.entries.find((e) => e.id === moss.id)!.pitch === "Fractional CRO" && r.pipeline!.openMonthly === 9000);
  check("a bad value on the card is refused", /Type what it is worth/.test((await refused(act(JOR, { type: "pipeline.value", id: moss.id, value: "-3" }))) ?? ""));
  check("another member can't change Jordan's deal", /isn't in your pipeline/.test((await refused(act(KIT, { type: "pipeline.value", id: d.id, value: 1 }))) ?? ""));
  const kitView = (await PA.pipelineViewFor(KIT))!;
  check("nothing of Jordan's reaches Kit's view", kitView.entries.length === 0 && kitView.openMonthly === 0 && !JSON.stringify(kitView).includes("Fractional VP Sales"));
  // Won: the terms count, not the value typed, and it leaves the open total.
  await act(JOR, { type: "pipeline.move", id: d.id, stage: "won" });
  r = await act(JOR, { type: "pipeline.won", id: d.id, pricing: "monthly", rate: "12000", merlin: true });
  d = r.pipeline!.entries.find((e) => e.id === d.id)!;
  check("won with terms: the deal counts its terms, out of the open total", d.monthly === 12000 && d.value === 9000 && r.pipeline!.openMonthly === 0 && r.pipeline!.wonMonthly === 12000, [d.monthly, r.pipeline!.openMonthly]);

  console.log("\nthe proposal or contract on a deal");
  const ost = (await act(JOR, { type: "pipeline.deal", companyId: pub("c_ost"), stage: "proposal" })).pipeline!.entries.find((e) => e.company === pub("c_ost"))!;
  check("no proposal yet: no paper", !ost.paper);
  const send = (o: Record<string, unknown>) => ({ id: "ps1", version: 1, signer: { name: "Dana Whitfield", email: "dana@ostrander.example", title: "CEO" }, sentAt: iso(-2 * DAY), expiresAt: iso(28 * DAY), events: [{ kind: "sent", at: iso(-2 * DAY) }, { kind: "viewed", at: iso(-DAY) }, { kind: "viewed", at: iso(-DAY / 2) }], ...o });
  await T.tableInternals.mutate((s) => {
    (s as unknown as { proposals: unknown[] }).proposals = [{ id: "pr1", memberId: "mem_jor", companyId: "c_ost", companyPub: pub("c_ost"), companyName: "Ostrander Freight", templateId: null, title: "Fractional VP Sales, 3 days a week", blocks: [], fields: {}, sources: {}, notes: [], signerOnCall: null, signer: null, version: 1, createdAt: iso(-3 * DAY), updatedAt: iso(-DAY / 2), sends: [send({})] }];
  });
  let p = (await PA.pipelineViewFor(JOR))!.entries.find((e) => e.id === ost.id)!.paper;
  check("a proposal out: opened 2 times, in play", p?.kind === "proposal" && p.state === "Opened 2 times" && p.tone === "live" && p.log[0].text === "Dana opened it 2 times", p);
  check("its activity, newest first, names the signer by first name", p!.log.map((x) => x.text).join(" | ").startsWith("Dana opened it 2 times | Sent to Dana. The signing link ends"), p!.log);
  check("Kit never sees Jordan's proposal", !JSON.stringify(await PA.pipelineViewFor(KIT)).includes("Ostrander"));
  await T.tableInternals.mutate((s) => {
    const pr = (s as unknown as { proposals: { sends: unknown[]; updatedAt: string }[] }).proposals[0];
    pr.sends = [send({ memberMode: "after", signed: { name: "Dana Whitfield", at: iso(-3_600_000), ip: "", ua: "", consent: "", consentVersion: "", hash: "", email: "" } })];
  });
  p = (await PA.pipelineViewFor(JOR))!.entries.find((e) => e.id === ost.id)!.paper;
  check("signed by the client, countersign mode: waiting on the member", p?.state === "Signed by Dana. You sign next" && p.tone === "you", p);
  const next = M.nextOf((await PA.pipelineViewFor(JOR))!.entries.find((e) => e.id === ost.id)!, P.dayOf(NOW));
  check("and its next move is to countersign, due today", next.title === "Countersign the proposal" && next.hot);
  await T.tableInternals.mutate((s) => {
    (s as unknown as { documents: unknown[] }).documents = [
      { id: "dc_1", memberId: "mem_jor", companyId: "c_moss", companyPub: pub("c_moss"), companyName: "Mosswood Supply", title: "Consulting agreement", fileName: "a.pdf", size: 1, pages: [], sha256: "", fields: [], signers: [{ id: "ds1", name: "Lee Moss", email: "lee@mosswood.example", viewedAt: iso(-DAY) }, { id: "ds2", name: "Jordan Avery", email: "jordan.avery@avery.example", sender: true }], ordered: true, createdAt: iso(-2 * DAY), updatedAt: iso(-DAY), sentAt: iso(-2 * DAY), expiresAt: iso(20 * DAY), events: [] },
    ];
  });
  p = (await PA.pipelineViewFor(JOR))!.entries.find((e) => e.id === moss.id)!.paper;
  check("a contract out for signature shows on its deal", p?.kind === "contract" && p.state === "Opened" && p.log.some((x) => x.text === "Lee opened it"), p);

  console.log("\nnothing of an example is ever stored");
  const st = readFileSync(path.join(dir, "intel.json"), "utf8");
  check("the state holds no Example card's company or person", !/Northwind Clinics|Cedar and Pine|Sam Iverson/.test(st));
  check("and no deal outside the four made-up companies", JSON.parse(st).pipeline.mem_jor.entries.every((e: { companyId: string }) => ["c_wren", "c_moss", "c_ost"].includes(e.companyId)));
  check("value is stored as typed, dollars a month", JSON.parse(st).pipeline.mem_jor.entries.find((e: { companyId: string }) => e.companyId === "c_wren").value.amount === 9000);

  console.log(`\n${passed} passed, ${failed} failed`);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log("FAIL the run threw:", e);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
process.exit(failed ? 1 : 0);
