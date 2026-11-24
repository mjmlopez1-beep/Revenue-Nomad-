/**
 * Checks of the profile, privacy and onboarding fixes (branch profile):
 *  1. one rule for how a member's name shows to other members (lib/memberName.ts): first name and
 *     last initial until they choose the directory, full only then, their own name in full for them;
 *     the same in the directory, a seat's holder cell, Peers, Messages, the connector and search;
 *  2. one fractional, one profile: a research record under a signed-up member's own name folds into
 *     their card (lib/table.ts foundOf), with "Are these yours?" (Me.foundSeats, the foundSeats
 *     action): Yes claims within the daily claim limit, unticked and No are "This isn't me", two
 *     members with that name fold nothing;
 *  3. the display name a member types in Settings (displayName): the rules, the guard against
 *     another member's name, three changes in 30 days, each logged, claims by the name they joined with;
 *  4. one rate reader (lib/rates.ts parseRate) for every typed rate, on the server and in the
 *     connector's add_my_seat, with an error that lists forms that work;
 *  5. Google turned away (RN_GOOGLE_VERIFIED off): the callback's "blocked", its words with the
 *     LinkedIn file and a CSV, Settings opening the LinkedIn file, the files first in onboarding;
 *  6. a truly new account: the starting credits, nothing opened, nothing in its credit history.
 * In process on a made-up seed and seed key in a temporary data dir, fetch replaced, nothing leaves
 * the machine. Every person and company is made up.
 *
 *   npx tsx scripts/test-profile.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-profile-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const K = { sam: "p_5a5a5a5a5a5a5a5a5a11", lee: "p_1e1e1e1e1e1e1e1e1e12", pat: "p_0a0a0a0a0a0a0a0a0a13" };

const co = (id: string, name: string, hq: string) => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq } });
const companies = [
  co("c_north", "Northwind Clinics", "Denver, CO"),
  co("c_cedar", "Cedar and Pine", "Boston, MA"),
  co("c_halcyon", "Halcyon Freight", "Chicago, IL"),
  co("c_lark", "Larkspur Learning", "Raleigh, NC"),
  co("c_quill", "Quillmark Data", "Omaha, NE"),
  co("c_tern", "Ternfield Pay", "Tampa, FL"),
];
const seat = (id: string, companyId: string, operator: string, role: string, fn: string, start: string, status: "Active" | "Ended", x: { source?: string; key?: string } = {}) => ({
  id,
  companyId,
  verified: false,
  fields: { source: x.source ?? "Seat scan", operator, role, function: fn, type: "Fractional", start, status, end: status === "Active" ? "Ongoing" : "2025" },
  ...((x.source ?? "Seat scan") === "Seat scan" ? { holderFrom: "public profile" } : {}),
  ...(x.key ? { holderKey: x.key } : {}),
});
const engagements = [
  // Sam Riverton: a research record (three seats, one person key), and Sam joined Merlin under that name.
  seat("e_sam_1", "c_north", "Sam Riverton", "Fractional VP Sales", "Sales", "2025-02", "Active", { key: K.sam }),
  seat("e_sam_2", "c_cedar", "Sam Riverton", "Fractional VP Sales", "Sales", "2023-04", "Ended", { key: K.sam }),
  seat("e_sam_3", "c_halcyon", "Sam Riverton", "Fractional Head of Sales", "Sales", "2021-04", "Ended", { key: K.sam }),
  // Lee Quarry: four research seats, for the daily claim limit.
  seat("e_lee_1", "c_north", "Lee Quarry", "Fractional CFO", "Finance", "2025-01", "Active", { key: K.lee }),
  seat("e_lee_2", "c_cedar", "Lee Quarry", "Fractional CFO", "Finance", "2024-01", "Ended", { key: K.lee }),
  seat("e_lee_3", "c_lark", "Lee Quarry", "Fractional CFO", "Finance", "2023-01", "Ended", { key: K.lee }),
  seat("e_lee_4", "c_quill", "Lee Quarry", "Fractional CFO", "Finance", "2022-01", "Ended", { key: K.lee }),
  // Pat Morrow: a research seat, and two members by that name: nothing folds.
  seat("e_pat_1", "c_tern", "Pat Morrow", "Fractional CMO", "Marketing", "2024-05", "Ended", { key: K.pat }),
  // Rory Quinlan: a member with a seat of his own, and a research record under his name (the outside tester's case: two profiles under one name).
  seat("e_rory_own", "c_tern", "Rory Quinlan", "Fractional COO", "Operations", "2025-06", "Active", { source: "Member success story" }),
  seat("e_rory_r1", "c_lark", "Rory Quinlan", "Fractional COO", "Operations", "2023-01", "Ended", { key: "p_7e07e07e07e07e07e14" }),
  seat("e_rory_r2", "c_halcyon", "Rory Quinlan", "Fractional COO", "Operations", "2022-01", "Ended", { key: "p_7e07e07e07e07e07e14" }),
  // Members' own seats.
  seat("e_dana_1", "c_lark", "Dana Whitfield", "Fractional CFO", "Finance", "2025-03", "Active", { source: "Member success story" }),
  seat("e_theo_1", "c_quill", "Theo Wrenshaw", "Fractional CRO", "Sales", "2025-09", "Active", { source: "Member success story" }),
];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}@member.example`, title, token: `tok-${id}` });
const members = [M("mem_jordan", "Jordan Avery", "Fractional CMO"), M("mem_dana", "Dana Whitfield", "Fractional CFO"), M("mem_theo", "Theo Wrenshaw", "Fractional CRO"), M("mem_pat", "Pat Morrow", "Fractional CMO"), M("mem_rory", "Rory Quinlan", "Fractional COO")];
const seed = { builtAt: ago(30 * DAY), members, companies, engagements, contacts: [] };
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

const joined = [
  { id: "j_sam", name: "Sam Riverton", email: "sam@joined.example", title: "", token: "tok-j_sam", at: ago(5 * DAY), ipHash: "aaaaaaaaaaaaaaaa", proven: true },
  { id: "j_lee", name: "Lee Quarry", email: "lee@joined.example", title: "", token: "tok-j_lee", at: ago(5 * DAY), ipHash: "bbbbbbbbbbbbbbbb", proven: true },
  { id: "j_pat", name: "Pat Morrow", email: "pat2@joined.example", title: "", token: "tok-j_pat", at: ago(5 * DAY), ipHash: "cccccccccccccccc", proven: true },
];
const ids = [...members.map((m) => m.id), ...joined.map((m) => m.id)];
const unlock = (memberId: string, ref: string) => ({ memberId, delta: -2, reason: "unlock", ref, at: ago(2 * DAY) });
const ledger = ["c_north", "c_cedar", "c_halcyon", "c_lark", "c_quill", "c_tern"].map((c) => unlock("mem_jordan", `${c}.identity`));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger,
    values: {},
    unlocks: Object.fromEntries(ledger.map((l) => [l.ref, [l.memberId]])),
    seen: Object.fromEntries(ids.map((id) => [id, ago(HOUR)])),
    profiles: {
      ...Object.fromEntries(ids.map((id) => [id, { onboarded: true }])),
      mem_dana: { onboarded: true, function: "Finance", fractionals: true },
      mem_theo: { onboarded: true, function: "Sales" },
    },
    members: joined,
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_GOOGLE: "1",
  GOOGLE_CLIENT_ID: "client-profile.example",
  GOOGLE_CLIENT_SECRET: "secret-profile",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_FREE_COMPANY", "RN_BILLING", "RN_GOOGLE_VERIFIED"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const throws = async (f: () => Promise<unknown>): Promise<string | null> => {
  try {
    await f();
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
};

async function main() {
  const mn = await import("../lib/memberName");
  const rates = await import("../lib/rates");
  const fields = await import("../lib/tableFields");
  const t = await import("../lib/table");
  const fr = await import("../lib/fractionals");
  const tools = await import("../lib/mcp/tools");
  const fm = await import("../app/post/fractionalsModel");
  const pub = t.tableInternals.pubId;
  const BASE = "https://post.example.com";
  const JORDAN = "tok-mem_jordan";

  /* ---------- 1. one rule for a member's name ---------- */
  console.log("\nHow a member's name shows to others");
  check("not chosen yet: first name and last initial", mn.nameForOthers("Jordan Avery", {}) === "Jordan A." && mn.nameForOthers("Jordan Avery", null) === "Jordan A.");
  check("in the directory: their full name", mn.nameForOthers("Jordan Avery", { fractionals: true }) === "Jordan Avery");
  check("out of the directory: first name and last initial", mn.nameForOthers("Jordan Avery", { fractionals: false }) === "Jordan A.");
  check("Referral partners off before choosing: never full", mn.nameForOthers("Jordan Avery", { fractionals: true, partnersOff: true }) === "Jordan A.");
  check("hide my name: their seats say so, elsewhere first name and last initial", mn.nameShowOf({ nameHidden: true, fractionals: true }) === "hidden" && mn.nameForOthers("Jordan Avery", { nameHidden: true, fractionals: true }) === "Jordan A.");
  check("the member sees their own name in full", mn.nameAsSeenBy("Jordan Avery", "m1", "m1", {}) === "Jordan Avery" && mn.nameAsSeenBy("Jordan Avery", "m1", "m2", {}) === "Jordan A.");
  check("the card preview says the same", fm.cardName({ name: "Jordan Avery" }).name === "Jordan A." && fm.cardName({ name: "Jordan Avery", fractionals: true }).name === "Jordan Avery" && fm.cardName({ name: "Jordan Avery", nameHidden: true }).name === fields.NAME_HIDDEN);

  const dirOf = async (tok: string) => (await fr.fractionalsView(tok))!;
  const recOf = (d: Awaited<ReturnType<typeof dirOf>>, seatId: string) => d.records.find((r) => r.seats.some((s) => s.id === pub(seatId)));
  let d = await dirOf(JORDAN);
  const theo = recOf(d, "e_theo_1");
  check("the directory: a member who hasn't chosen shows first name and last initial, never in full", theo?.name === "Theo W." && !JSON.stringify(d).includes("Wrenshaw"), theo);
  check("the directory: a member in the directory shows in full", recOf(d, "e_dana_1")?.name === "Dana Whitfield");
  const view = await t.buildView(JORDAN);
  const engCell = (v: Awaited<ReturnType<typeof t.buildView>>, seatId: string, f: string) => v.companies.flatMap((c) => c.engagements).find((e) => e.id === pub(seatId))?.cells[f];
  check("a seat's holder cell: the same rule", engCell(view, "e_theo_1", "operator")?.v === "Theo W." && engCell(view, "e_dana_1", "operator")?.v === "Dana Whitfield", [engCell(view, "e_theo_1", "operator"), engCell(view, "e_dana_1", "operator")]);
  const theoView = await t.buildView("tok-mem_theo");
  check("Theo sees his own name in full on his seat", engCell(theoView, "e_theo_1", "operator")?.v === "Theo Wrenshaw" && theoView.me?.name === "Theo Wrenshaw" && theoView.me?.shownAs === "Theo W.", theoView.me?.shownAs);
  const ctx = { member: (await t.memberForToken(JORDAN))!, origin: BASE };
  const mcp = JSON.stringify(await tools.getCompany(ctx, { company: pub("c_quill") }));
  check("the connector: the same rule (no full name of a member who hasn't chosen)", !mcp.includes("Wrenshaw") && mcp.includes("Theo W."), mcp.slice(0, 400));
  const search = await t.searchMembers(JORDAN, "Theo");
  check("member search: the same rule", search.length === 1 && search[0].name === "Theo W.", search);
  const src = (f: string) => readFileSync(path.join(process.cwd(), f), "utf8");
  for (const f of ["lib/messages.ts", "lib/peers.ts", "lib/pipelineActions.ts", "lib/fractionals.ts"])
    check(`${f} names members through the one rule`, /memberNameFor|memberNameById|x\.nameOf/.test(src(f)));
  check("Peers: leads and team-ups name the other member through the one rule", !/otherName = other\?\.name/.test(src("lib/peers.ts")));

  /* ---------- 2. one fractional, one profile ---------- */
  console.log("\nOne fractional, one profile");
  const samRec = d.records.filter((r) => r.seats.some((s) => ["e_sam_1", "e_sam_2", "e_sam_3"].map(pub).includes(s.id)));
  check("the research record under Sam's own name is not a second profile in the directory", samRec.length === 1 && !!samRec[0].memberId && !JSON.stringify(d).includes("Sam Riverton"), samRec);
  const samCards = d.records.filter((r) => r.name?.startsWith("Sam"));
  check("Sam (no seats of his own yet) shows as ONE card: his account, with the research seats, named the way he chose", samCards.length === 1 && samCards[0].name === "Sam R." && !!samCards[0].memberId && samCards[0].onMerlin && samCards[0].seats.length === 3, samCards);
  check("the research seats show Sam the way Sam chose, never the full name", engCell(view, "e_sam_1", "operator")?.v === "Sam R.", engCell(view, "e_sam_1", "operator"));
  check("two members with that name: nothing folds, the research record stays its own", !!recOf(d, "e_pat_1") && engCell(view, "e_pat_1", "operator")?.v === "Pat Morrow");
  const roryCards = d.records.filter((r) => r.seats.some((x) => ["e_rory_own", "e_rory_r1", "e_rory_r2"].map(pub).includes(x.id)));
  check("a member with a card of his own and a research record under his name: ONE card, his account", roryCards.length === 1 && roryCards[0].name === "Rory Q." && roryCards[0].seats.length === 1 && !JSON.stringify(d).includes("Quinlan"), roryCards.map((r) => [r.name, r.seats.length]));
  check("Rory is asked about the two research seats", (await t.buildView("tok-mem_rory")).me?.foundSeats?.length === 2);
  let samView = await t.buildView("tok-j_sam");
  const found = samView.me?.foundSeats ?? [];
  check("Sam is asked: Are these yours? (the three seats, newest first; a company he can't see is described, never named)", found.length === 3 && found[0].id === pub("e_sam_1") && found[0].company === null && /SaaS/.test(found[0].facts) && found[0].now === true && !JSON.stringify(found).includes("Northwind"), found);
  check("Me.foundSeats carries no person key", !Object.values(K).some((k) => JSON.stringify(samView.me).includes(k)));
  const noneTicked = await throws(() => t.perform("tok-j_sam", { type: "foundSeats", answer: "mine", skip: found.map((f) => f.id) }));
  check("Yes with nothing ticked is refused, in words", !!noneTicked && /Tick at least one/.test(noneTicked), noneTicked);
  const yes = await t.perform("tok-j_sam", { type: "foundSeats", answer: "mine", skip: [pub("e_sam_3")] });
  check("Yes claims the ticked seats and says what happened", /2 seats are on your profile now/.test(yes.message) && /other one/.test(yes.message), yes.message);
  samView = await t.buildView("tok-j_sam");
  const yours = (v: typeof samView, id: string) => v.companies.flatMap((c) => c.engagements).find((e) => e.id === pub(id))?.yours;
  check("the two claimed seats are Sam's now", !!yours(samView, "e_sam_1") && !!yours(samView, "e_sam_2") && !yours(samView, "e_sam_3"));
  check("the question is answered: nothing left to ask", !samView.me?.foundSeats?.length, samView.me?.foundSeats);
  const patch = await t.viewPatch("tok-j_sam", [pub("e_sam_1")]);
  check("the action's answer carries an empty list, so the page's Me (merged over) drops the question", Array.isArray(patch?.me.foundSeats) && patch!.me.foundSeats!.length === 0, patch?.me.foundSeats);
  d = await dirOf(JORDAN);
  const samCard = recOf(d, "e_sam_1");
  check("the directory: one card for Sam with the claimed seats", !!samCard && samCard.seats.some((s) => s.id === pub("e_sam_2")) && samCard.name === "Sam R.", samCard);
  check("the unticked seat is someone else again (This isn't me)", recOf(d, "e_sam_3")?.memberId !== samCard?.memberId && (await t.loadState()).notMine.j_sam?.includes("e_sam_3"));
  // The daily claim limit: Lee has four, claims three today.
  const lee = await t.perform("tok-j_lee", { type: "foundSeats", answer: "mine" });
  const leeView = await t.buildView("tok-j_lee");
  check("Yes stays inside the daily claim limit (3 in 24 hours): the rest wait for tomorrow", /3 seats are on your profile now/.test(lee.message) && /waits here for tomorrow/.test(lee.message) && leeView.me?.foundSeats?.length === 1, [lee.message, leeView.me?.foundSeats?.length]);
  check("the one still waiting shows Lee the way he chose, never his full name", engCell(await t.buildView(JORDAN), "e_lee_4", "operator")?.v === "Lee Q.", engCell(await t.buildView(JORDAN), "e_lee_4", "operator"));
  const leeAgain = await throws(() => t.perform("tok-j_lee", { type: "foundSeats", answer: "mine" }));
  check("at the limit, Yes is refused in words and the seat keeps waiting", !!leeAgain && /3 seats in 24 hours/.test(leeAgain), leeAgain);
  const leeNo = await t.perform("tok-j_lee", { type: "foundSeats", answer: "notMine" });
  check("None of these are me: the last one is left for whoever held it", /aren't yours/.test(leeNo.message) && !(await t.buildView("tok-j_lee")).me?.foundSeats?.length);
  check("Jordan (no record under his name) is asked nothing", Array.isArray(view.me?.foundSeats) && !view.me?.foundSeats.length);

  /* ---------- 3. the display name ---------- */
  console.log("\nThe display name");
  const bad: [string, RegExp][] = [
    ["", /Type your name/],
    ["J", /at least 2/],
    ["jordan@avery.example", /email/],
    ["Jordan www.avery.example", /links/],
    ["https://avery.example", /links|email/],
    ["Jordan Avery 3", /letters, spaces, hyphens and apostrophes/],
    ["Jordan", /first and last name/],
    ["A".repeat(30) + " " + "B".repeat(31), /60 characters/],
  ];
  for (const [v, re] of bad) check(`refused: ${JSON.stringify(v.slice(0, 30))}`, re.test(mn.displayNameProblem(v) ?? ""), mn.displayNameProblem(v));
  for (const v of ["Jordan Avery-Lane", "Jordan O'Avery", "Jordan  Avery ", "Zoë Ångström", "Jean-Luc d’Avery"]) check(`allowed: ${v}`, mn.displayNameProblem(v) === null, mn.displayNameProblem(v));
  const settingsSrc = src("app/post/settings/SettingsPage.tsx");
  check("Settings: the name is a field now, not 'Write to us to change it'", !/Write to us to change it/.test(settingsSrc) && /type: "displayName"/.test(settingsSrc) && /displayNameProblem/.test(settingsSrc));
  const taken = await throws(() => t.perform(JORDAN, { type: "displayName", name: "Dana Whitfield" }));
  check("never another member's name (anti-impersonation)", !!taken && /Another member goes by that name/.test(taken), taken);
  const r1 = await t.perform(JORDAN, { type: "displayName", name: "Jordan Avery-Lane" });
  const jv = await t.buildView(JORDAN);
  check("a change saves and says how it shows", /Other members see Jordan A\. You can/.test(r1.message) && !/\.\./.test(r1.message) && jv.me?.name === "Jordan Avery-Lane" && jv.me?.nameChangesLeft === 2, [r1.message, jv.me?.name, jv.me?.nameChangesLeft]);
  check("every change is logged on the profile", (await t.loadState()).profiles.mem_jordan.nameLog?.length === 1);
  check("others see the new name by the same rule", (await t.searchMembers("tok-mem_theo", "Jordan"))[0]?.name === "Jordan A.");
  await t.perform(JORDAN, { type: "displayName", name: "Jordan Avery" });
  await t.perform(JORDAN, { type: "displayName", name: "Jordan Lane Avery" });
  const fourth = await throws(() => t.perform(JORDAN, { type: "displayName", name: "Jordan Averyson" }));
  check("three changes in 30 days, then refused in words", !!fourth && /3 times in 30 days/.test(fourth), fourth);
  check("the log keeps each change", (await t.loadState()).profiles.mem_jordan.nameLog?.length === 3);
  // Claims go by the name they joined with: Sam changes his display name, his research record still folds into him (nothing else changes).
  await t.perform("tok-j_sam", { type: "displayName", name: "Samuel Riverton" });
  const sam2 = await t.buildView("tok-j_sam");
  check("a changed display name: their own seats take it", engCell(sam2, "e_sam_1", "operator")?.v === "Samuel Riverton", engCell(sam2, "e_sam_1", "operator"));
  const imp = await throws(() => t.perform("tok-mem_theo", { type: "displayName", name: "Sam Riverton" }));
  check("a name another member joined with is refused too", !!imp && /Another member goes by that name/.test(imp), imp);

  /* ---------- 4. one rate reader ---------- */
  console.log("\nOne rate reader");
  const ok: [string, string, string][] = [
    ["5000", "month", "$5k/mo"],
    ["$5,000", "month", "$5k/mo"],
    ["5k", "month", "$5k/mo"],
    ["$5k/mo", "month", "$5k/mo"],
    ["5000/month", "month", "5000/month"],
    ["150/hr", "hour", "150/hr"],
    ["$150 an hour", "hour", "$150 an hour"],
    ["150", "hour", "$150/hr"],
    ["$8-10k per month", "month", "$8-10k per month"],
  ];
  for (const [raw, unit, value] of ok) {
    const p = rates.parseRate(raw);
    check(`reads ${JSON.stringify(raw)} as ${value}`, p.ok && p.unit === unit && p.value === value, p);
  }
  for (const raw of ["abc", "5000 bananas", "ask me"]) {
    const p = rates.parseRate(raw);
    check(`refuses ${JSON.stringify(raw)} with the forms that work`, !p.ok && p.error === rates.RATE_HELP && /5000/.test(p.error) && /\$150\/hr/.test(p.error), p);
  }
  check("the field's own check takes 5000 (no more silent refusal)", fields.cleanValue(fields.fieldDef("engagement", "rate")!, "5000").value === "$5k/mo");
  check("the benchmarks' reader: 5000 is monthly, 150/hr hourly, a day rate refused in words", (() => {
    const a = rates.benchRead("5000");
    const b = rates.benchRead("150/hr");
    const c = rates.benchRead("$900/day");
    return a.ok && a.kind === "monthly" && a.amount === 5000 && b.ok && b.kind === "hourly" && !c.ok && c.error === rates.BENCH_RATE_HELP;
  })());
  for (const f of ["app/post/Seats.tsx", "app/post/Benchmarks.tsx", "app/post/AddModal.tsx", "app/post/ui.tsx", "lib/mcp/tools.ts"])
    check(`${f} reads rates with the one reader`, /benchRead|parseRate/.test(src(f)) && !/\breadRate\(/.test(src(f)));
  const theoSeat = pub("e_theo_1");
  const filled = await t.perform("tok-mem_theo", { type: "fill", entity: "engagement", id: theoSeat, field: "rate", value: "5000" });
  check("Your seats: 5000 on a seat saves, kept as $5k/mo", !!filled && engCell(await t.buildView("tok-mem_theo"), "e_theo_1", "rate")?.v === "$5k/mo", engCell(await t.buildView("tok-mem_theo"), "e_theo_1", "rate"));
  const badFill = await throws(() => t.perform("tok-mem_dana", { type: "fill", entity: "engagement", id: pub("e_dana_1"), field: "rate", value: "lots" }));
  check("a rate that can't be read is refused with the forms", !!badFill && /5000, \$5k\/mo/.test(badFill), badFill);
  const bench = await t.perform("tok-mem_dana", { type: "benchRate", engagementId: pub("e_dana_1"), pricing: "Hourly", rate: "$150 an hour" });
  check("the rates share takes $150 an hour", !!bench.message, bench.message);
  const ctxTheo = { member: (await t.memberForToken("tok-mem_theo"))!, origin: BASE };
  const mcpBad = await throws(() => tools.addMySeat(ctxTheo, { company: "Larkspur Learning", function: "Sales", rate: "whatever", rate_visibility: "members" }));
  check("add_my_seat: an unreadable rate is refused with the forms", !!mcpBad && /5000, \$5k\/mo/.test(mcpBad), mcpBad);
  const mcpOk = await tools.addMySeat(ctxTheo, { company: "Larkspur Learning", function: "Sales", role: "Fractional CRO", rate: "5k", rate_visibility: "members" });
  const seatId = (mcpOk as { seat_id?: string }).seat_id;
  check("add_my_seat: 5k saves as $5k/mo", !!seatId && (await t.buildView("tok-mem_theo")).companies.flatMap((c) => c.engagements).find((e) => e.id === seatId)?.cells.rate?.v === "$5k/mo", mcpOk);

  /* ---------- 5. Google turned away ---------- */
  console.log("\nGoogle turned away");
  const g = await import("../lib/google");
  const cfg = await import("../lib/google/config");
  const start = await g.startConnect(JORDAN, BASE, "google", "onboard");
  check("Connect Google starts (made-up client)", start.ok, start);
  if (start.ok) {
    const out = await g.finishConnect(JORDAN, { state: start.state, code: null, error: "access_denied" }, start.state, BASE);
    check("before Google's check is done, access_denied comes back as blocked", out.outcome === "blocked" && out.from === "onboard", out);
  }
  process.env.RN_GOOGLE_VERIFIED = "1";
  const start2 = await g.startConnect(JORDAN, BASE, "google");
  if (start2.ok) {
    const out = await g.finishConnect(JORDAN, { state: start2.state, code: null, error: "access_denied" }, start2.state, BASE);
    check("once verified, access_denied is the member's Cancel again", out.outcome === "denied", out);
  }
  check("RN_GOOGLE_VERIFIED reads on and off", cfg.googleVerified() === true && ((process.env.RN_GOOGLE_VERIFIED = "0"), cfg.googleVerified() === false));
  delete process.env.RN_GOOGLE_VERIFIED;
  const nv = await g.networkView(JORDAN);
  check("the network view says Google isn't verified yet (default off)", !!nv && nv.on === true && nv.verified === false, nv && (nv as { verified?: boolean }).verified);
  const words = src("app/post/network/useNetwork.ts");
  check("the words: Google's check, and the LinkedIn file or a CSV meanwhile", /finishing Google's check of Merlin/.test(words) && /LinkedIn connections file or a contacts CSV/.test(words) && /blocked: GOOGLE_BLOCKED/.test(words));
  const at = await import("../app/post/settings/at");
  check("Settings, back from Google turned away: the LinkedIn file opens", at.atOf("?p=network&google=blocked").open === "linkedin" && at.atOf("?p=network&google=denied").open === "google");
  const sm = await import("../app/post/settings/model");
  const rowsOf = (verified: boolean) =>
    sm.connRows({ google: { configured: true, verified, link: null, gmail: null, claude: null, syncing: false, companies: 0 }, paths: { linkedin: null, csv: null }, integ: null, granola: null, apps: null, nowMs: t0 } as never).map((r) => r.key);
  check("Connections: while unverified, the LinkedIn file and a CSV come before Google", rowsOf(false).indexOf("linkedin") < rowsOf(false).indexOf("google") && rowsOf(false).indexOf("csv") < rowsOf(false).indexOf("google"), rowsOf(false));
  check("Connections: verified, Google first as before", rowsOf(true)[0] === "google", rowsOf(true));
  const know = src("app/onboard/SetupKnow.tsx");
  check("onboarding: the LinkedIn file first while unverified, the refusal notice with both files", /verified \? \["google", "linkedin", "csv"\] : \["linkedin", "csv", "google"\]/.test(know) && /Add your LinkedIn file/.test(know) && /Add a contacts CSV/.test(know) && /takeNotice\(\)/.test(know));
  const started = (await t.buildView(JORDAN)).me?.started;
  check("Get started's who-you-know step is done by the LinkedIn file or a CSV alone (no Google needed)", /!!files\?\.linkedin \|\| !!files\?\.csv/.test(src("lib/table.ts")) && started?.network === false);

  /* ---------- 6. a truly new account ---------- */
  console.log("\nA new account");
  const fresh = await t.joinMember("Casey Newfield", "casey@new.example", undefined, "10.9.9.9");
  const nvw = await t.buildView(fresh.token);
  const me = nvw.me!;
  check("starts with the documented credits (25, RN_STARTER_CREDITS)", me.credits === 25 && t.STARTER_CREDITS === 25, me.credits);
  check("nothing in its credit history", nvw.ledger.length === 0, nvw.ledger);
  check("nothing opened: every company locked", nvw.companies.length > 0 && nvw.companies.every((c) => c.hidden || !c.name || c.name === fields.HIDDEN_COMPANY || !c.engagements.some((e) => e.cells.operator?.s === "value" && !e.cells.operator.mine)), nvw.companies.filter((c) => !c.hidden).map((c) => c.name));
  check("nothing unlocked, no company opened", (me.unlocked ?? 0) === 0 && (me.companiesUnlocked ?? 0) === 0 && (me.holdersUnlocked ?? 0) === 0, [me.unlocked, me.companiesUnlocked, me.holdersUnlocked]);
  check("no seats claimed or guessed for a name nobody holds", !me.foundSeats?.length);

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
