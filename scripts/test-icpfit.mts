/**
 * Checks of the ideal client that learns, and the richer fit (lib/idealClient.ts, lib/table.ts
 * idealFor and memberClients, app/post/ui3/model.ts fitFor, lib/about/suggest.ts, the Sells to and
 * Customer size facts, lib/mcp/tools.ts). No server: lib/table.ts runs in process on a made-up seed
 * and seed key in a temporary data dir, fetch replaced, so nothing leaves the machine. Every company
 * and person is made up.
 *
 *   npx tsx scripts/test-icpfit.mts      exits 1 on any failure
 *
 * Covered:
 *  - learning from the member's own clients: seats (revenue and employees as of then), a won deal,
 *    an Evidence Bank case; each learned value says which clients it came from;
 *  - a dropped value stays dropped however often it is learned again, and can be put back;
 *  - what the member chose is never altered by learning; an ideal client saved before the new
 *    criteria loads and keeps working, and an older form's save leaves the newer criteria alone;
 *  - a member's own client is never scored: the pages and the connector say "Your client since
 *    Feb 2025" or "Past client, 2022";
 *  - a fact not on file is left out of the count, never a miss; bands are words;
 *  - a B2C ideal client matches a D2C company (never the other way round); Sales-led is Inside or
 *    Enterprise sales;
 *  - Sells to (up to 3, names that hold a comma) and Customer size are normal facts: they save, earn
 *    and show in the connector's you_can_add;
 *  - onboarding saves the new picks, and starts them from the claimed seats' facts;
 *  - the connector: fits_your_practice, buying_signals, your_client, the ideal client's sources;
 *  - website suggestions: only who it sells to, the model and a product-led motion, never deal size
 *    or sales cycle.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-icpfit-"));
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const ahead = (ms: number) => new Date(t0 + ms).toISOString();
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");

const co = (id: string, name: string, fields: Record<string, string>) => ({ id, fields: { name, website: `${id.slice(2)}.example`, ...fields } });
const companies = [
  // Ava's current client: SaaS that sells to health systems. Revenue today is past what it was when she started.
  co("c_calder", "Calder Vane", { industry: "SaaS", revenue: "$20M–$50M", hq: "Austin, TX", sellsTo: "Healthcare Providers & Health Systems", businessModel: "B2B", motion: "Enterprise sales" }),
  // Her past client (2022): sells to pharma.
  co("c_tribeck", "Tribeck", { industry: "SaaS", employees: "51–200", hq: "Denver, CO", sellsTo: "Pharma & Biotech", businessModel: "B2B" }),
  // A deal she won, with no seat yet.
  co("c_wonder", "Wonderlow", { industry: "Fintech", employees: "11–50", hq: "Boston, MA", dealSize: "$15K–$50K" }),
  // An Evidence Bank case of hers.
  co("c_casey", "Caseworth Labs", { industry: "Cybersecurity", hq: "Chicago, IL" }),
  // Targets.
  co("c_full", "Fullmatch Health", { industry: "SaaS", employees: "51–200", revenue: "$5M–$20M", hq: "Seattle, WA", sellsTo: "Healthcare Providers & Health Systems; Pharma & Biotech", businessModel: "B2B", motion: "Enterprise sales" }),
  co("c_thin", "Thinfile Systems", { industry: "SaaS" }),
  co("c_miss", "Missfield Retail", { industry: "Brick & Mortar Retail", employees: "1,001+", revenue: "$50M+", hq: "Dallas, TX", businessModel: "B2C" }),
  co("c_d2c", "Dayglow Goods", { industry: "E-Commerce & D2C", hq: "Portland, OR", businessModel: "D2C" }),
  co("c_b2c", "Bellwether Apps", { industry: "E-Commerce & D2C", hq: "Miami, FL", businessModel: "B2C" }),
  co("c_empty", "Emptyrecord Co", {}),
];
const seat = (id: string, companyId: string, operator: string, role: string, fn: string, fields: Record<string, string>) => ({
  id,
  companyId,
  verified: false,
  fields: { source: "Member success story", operator, role, function: fn, type: "Fractional", ...fields },
});
const engagements = [
  seat("e_ava_calder", "c_calder", "Ava Lindmark", "Fractional VP Sales", "Sales", { start: "2025-02", status: "Active", end: "Ongoing", revenue: "$5M–$20M", employees: "51–200" }),
  seat("e_ava_tribeck", "c_tribeck", "Ava Lindmark", "Fractional VP Sales", "Sales", { start: "2021-03", status: "Ended", end: "2022-06" }),
  // Someone else's fractional hires at a target, so the buying signals have something to say.
  seat("e_x_full1", "c_full", "Odo Farrant", "Fractional CMO", "Marketing", { start: "2024-01", status: "Ended", end: "2024-12" }),
  seat("e_x_full2", "c_full", "Pia Renwick", "Fractional VP Sales", "Sales", { start: "2023-01", status: "Ended", end: "2023-12" }),
];
const M = (id: string, name: string, title: string) => ({ id, name, email: `${id}@example.com`, title, token: `tok-${id}` });
const members = [M("mem_ava", "Ava Lindmark", "Fractional VP Sales"), M("mem_ben", "Ben Okoro", "Fractional CMO"), M("mem_cy", "Cy Marlowe", "Fractional CFO")];
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify({ builtAt: ago(30 * DAY), members, companies, engagements, contacts: [] }));

// An ideal client saved before the new criteria existed: the first four lists only.
const OLD_ICP = { industries: ["Fintech"], employees: [], revenue: [], countries: ["United States"] };
const caseBase = {
  clientNamed: false, clientLabel: "A security company", title: "Rebuilt the pipeline", role: "Fractional VP Sales", fn: "Sales", hours: "", soldTo: "", problems: [], workType: [], outcomes: [], workedWith: [],
  answers: { before: "", did: "", numbers: "" }, text: "Made-up case.", textBy: "member", showOnCard: false, usedIn: [], createdAt: ago(40 * DAY), updatedAt: ago(40 * DAY),
};
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(members.map((m) => [m.id, ago(HOUR)])),
    profiles: {
      mem_ava: { onboarded: true, function: "Sales", title: "Fractional VP Sales", icp: OLD_ICP },
      mem_ben: { onboarded: true, function: "Marketing", title: "Fractional CMO", icp: { industries: [], employees: [], revenue: [], countries: [], businessModel: ["B2C"] } },
      mem_cy: { onboarded: true, function: "Finance", title: "Fractional CFO" },
    },
    members: [],
    pipeline: {
      mem_ava: {
        entries: [
          { id: "pl_1", companyId: "c_wonder", stage: "won", channel: "email", to: { label: "the founder", name: null, role: null }, source: "manual", dates: { won: ago(20 * DAY) }, via: {}, due: null, follow: 0, lastOut: ago(30 * DAY), seen: {}, notes: [], log: [], won: { pricing: "monthly", rate: 9000, hours: 15, start: "2026-10", months: 6, merlin: true, at: ago(20 * DAY) }, createdAt: ago(40 * DAY), updatedAt: ago(20 * DAY) },
        ],
      },
    },
    evidence: {
      mem_ava: [
        { ...caseBase, id: "ev_1", status: "ready", companyId: "c_casey", start: "2020-01", end: "2020-11", size: "11–50", revenue: "$1M–$5M", motion: "Sales-led", industry: "Cybersecurity" },
        // A draft is not a client yet.
        { ...caseBase, id: "ev_2", status: "draft", companyId: "c_miss", start: "2019-01", end: "2019-06", size: "1,001+", revenue: "$50M+", motion: "Channel", industry: "Brick & Mortar Retail" },
      ],
    },
    billing: { members: Object.fromEntries(members.map((m) => [m.id, { proUntil: ahead(20 * DAY), paidSince: ago(10 * DAY), interval: "month" }])), events: [], payments: [], ended: [] },
  }),
);

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-icp@example.com",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_icpfit",
  STRIPE_WEBHOOK_SECRET: "whsec_test_icpfit",
  STRIPE_PRICE_MONTH: "price_month_icpfit",
  STRIPE_PRICE_YEAR: "price_year_icpfit",
});
for (const k of ["RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_FREE_COMPANY", "RN_GOOGLE"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 900)}`}`);
};
const eq = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

async function main() {
  const ic = await import("../lib/idealClient");
  const tf = await import("../lib/tableFields");
  const { cleanIcp } = await import("../lib/hunt");
  const t = await import("../lib/table");
  const tools = await import("../lib/mcp/tools");
  const model = await import("../app/post/model");
  const u3 = await import("../app/post/ui3/model");
  const sug = await import("../lib/about/suggest");
  const setup = await import("../app/onboard/setupModel");
  const radar = await import("../lib/radar/match");
  const pub = t.tableInternals.pubId;
  const BASE = "https://post.example.com";
  const AVA = "tok-mem_ava";
  const BEN = "tok-mem_ben";
  const CY = "tok-mem_cy";

  /* ---------- 1. pure: learning ---------- */
  console.log("\nLearning from clients (pure)");
  {
    const clients = [
      { companyId: "a", name: "Calder Vane", current: true, start: "2025-02", end: null, facts: { industries: ["SaaS"], revenue: ["$5M–$20M"], sellsTo: ["Healthcare Providers & Health Systems"], motion: ["Enterprise sales"] } },
      { companyId: "b", name: "Tribeck", current: false, start: "2021-03", end: "2022-06", facts: { industries: ["SaaS"], employees: ["51–200"], sellsTo: ["Pharma & Biotech"], countries: ["United States"] } },
    ];
    const learned = ic.learnIcp(clients);
    check("a value both clients share comes first, with both names", eq(learned.industries, [{ v: "SaaS", from: ["Calder Vane", "Tribeck"] }]), learned.industries);
    check("each client's own facts are learned with its name", eq(learned.sellsTo?.map((x) => [x.v, x.from]), [["Healthcare Providers & Health Systems", ["Calder Vane"]], ["Pharma & Biotech", ["Tribeck"]]]), learned.sellsTo);
    check("a value that is not on its pick list is never learned", !ic.learnIcp([{ ...clients[0], facts: { industries: ["Made Up Industry"], motion: ["Telepathy"] } }]).industries);
    const stated = { industries: ["Fintech"], employees: [], revenue: [], countries: ["United States"] };
    const frozen = JSON.stringify(stated);
    const ideal = ic.idealIcp(stated, learned)!;
    check("the ideal client is what was chosen and what was learned, together", eq(ideal.industries, ["Fintech", "SaaS"]) && eq(ideal.revenue, ["$5M–$20M"]) && eq(ideal.sellsTo, ["Healthcare Providers & Health Systems", "Pharma & Biotech"]), ideal);
    check("what the member chose is not altered by learning", JSON.stringify(stated) === frozen);
    check("a value both chosen and learned shows once", ic.idealIcp({ ...stated, industries: ["SaaS"] }, learned)!.industries.length === 1);
    const dropped = ic.dropValue(null, "sellsTo", "Pharma & Biotech");
    const again = ic.learnIcp(clients, dropped);
    check("a dropped value is left out of what is learned", eq(again.sellsTo?.map((x) => x.v), ["Healthcare Providers & Health Systems"]), again.sellsTo);
    check("and stays out when another client has it too", !ic.learnIcp([...clients, { companyId: "c", name: "Third", current: true, start: null, end: null, facts: { sellsTo: ["Pharma & Biotech"] } }], dropped).sellsTo?.some((x) => x.v === "Pharma & Biotech"));
    check("putting it back clears the memory", eq(ic.dropValue(dropped, "sellsTo", "pharma & biotech", false), {}));
    check("sources read You chose and From the clients", ic.sourceWords(true, undefined) === "You chose" && ic.sourceWords(false, ["Calder Vane", "Tribeck"]) === "From Calder Vane, Tribeck" && ic.sourceWords(true, ["Tribeck"]) === "You chose · From Tribeck");
    check("a client's words: since a month, or a past year", ic.clientWords({ current: true, start: "2025-02", end: null }) === "Your client since Feb 2025" && ic.clientWords({ current: false, start: "2021-03", end: "2022-06" }) === "Past client, 2022" && ic.clientWords({ current: true, start: null, end: null }) === "Your client" && ic.clientWords({ current: false, start: null, end: null }) === "Past client");
  }

  /* ---------- 2. pure: fit ---------- */
  console.log("\nFit against the ideal client (pure)");
  {
    check("a B2C ideal client matches a D2C company", ic.criterion("businessModel", ["B2C"], ["D2C"]) === true);
    check("a D2C ideal client does not match a plain B2C company", ic.criterion("businessModel", ["D2C"], ["B2C"]) === false);
    check("Sales-led is Inside or Enterprise sales, never PLG", ic.criterion("motion", [ic.SALES_LED], ["Enterprise sales"]) === true && ic.criterion("motion", [ic.SALES_LED], ["Inside sales"]) === true && ic.criterion("motion", [ic.SALES_LED], ["PLG"]) === false);
    check("a criterion the ideal client doesn't have is not asked; a fact not on file is unknown", ic.criterion("motion", [], ["PLG"]) === undefined && ic.criterion("motion", ["PLG"], []) === null);
    check("Sells to matches when any of the company's industries is wanted", ic.criterion("sellsTo", ["Pharma & Biotech"], ["Restaurants", "Pharma & Biotech"]) === true);
    const icp = { industries: ["SaaS"], employees: ["51–200"], revenue: ["$5M–$20M"], countries: ["United States"], sellsTo: ["Pharma & Biotech"], motion: ["PLG"] };
    const thin = ic.practiceFit(icp, { industries: ["SaaS"] });
    check("a fact not on file is left out of the count, never a miss", thin.matched === 1 && thin.known === 1 && thin.asked === 6 && thin.unknown.length === 5, thin);
    const miss = ic.practiceFit(icp, { industries: ["Restaurants"], employees: ["1,001+"], revenue: ["$50M+"], countries: ["Canada"] });
    check("known facts that conflict are misses", miss.matched === 0 && miss.known === 4 && miss.band === "Worth watching", miss);
    const full = ic.practiceFit(icp, { industries: ["SaaS"], employees: ["51–200"], revenue: ["$5M–$20M"], countries: ["United States"], sellsTo: ["Pharma & Biotech"], motion: ["PLG"] });
    check("bands are words from the share of known criteria matched", full.band === "Strong opportunity" && ic.fitBand(2, 4) === "Good opportunity" && ic.fitBand(1, 4) === "Worth watching" && ic.fitBand(0, 0) === "Worth watching" && ic.fitBand(1, 1) === "Good opportunity");
    check("nothing asked: nothing to count", ic.practiceFit(null, { industries: ["SaaS"] }).asked === 0);
    check("ordering puts a strong fit over a good one over a thin one", ic.fitOrder(full) > ic.fitOrder(ic.practiceFit(icp, { industries: ["SaaS"], employees: ["1–10"] })) && ic.fitOrder(thin) > ic.fitOrder(miss));
    check("no copy holds a percentage", ![u3.FIT_TIP, u3.FIT_FOOT, ...Object.values(u3.SIGNAL_WORDS)].some((x) => /%|percent/i.test(x)));
    check("the tooltip says a fact not on file is left out, and that it is not a chance of winning", /not on file is left out/i.test(u3.FIT_TIP) && /not a chance of winning/.test(u3.FIT_TIP));
  }

  /* ---------- 3. the new facts and lists ---------- */
  console.log("\nSells to, Customer size and the business models");
  {
    check("business models: B2B, B2C, D2C, B2B2C, Marketplace", eq(tf.BUSINESS_MODELS, ["B2B", "B2C", "D2C", "B2B2C", "Marketplace"]));
    check("customer sizes: SMB, Mid-market, Enterprise", eq(tf.CUSTOMER_SIZES, ["SMB", "Mid-market", "Enterprise"]));
    const sells = tf.fieldDef("company", "sellsTo")!;
    const size = tf.fieldDef("company", "customerSize")!;
    check("Sells to and Customer size are free company facts on the industry and size lists", !!sells && !sells.gated && sells.options === tf.RN_INDUSTRIES && sells.multi === true && sells.max === 3 && !!size && !size.gated && eq(size.options, tf.CUSTOMER_SIZES));
    const one = tf.cleanValue(tf.fieldDef("company", "sellsTo")!, "Print, Signage & Promotional Products");
    check("an industry whose name holds a comma is one pick", "value" in one && one.value === "Print, Signage & Promotional Products", one);
    const two = tf.cleanValue(tf.fieldDef("company", "sellsTo")!, "Pharma & Biotech; Print, Signage & Promotional Products");
    check("several picks are stored in the list's order, joined by a semicolon", "value" in two && two.value === "Pharma & Biotech; Print, Signage & Promotional Products", two);
    const commas = tf.cleanValue(tf.fieldDef("company", "sellsTo")!, "SaaS, Fintech");
    check("picks typed with commas between them are read too", "value" in commas && commas.value === "SaaS; Fintech", commas);
    check("more than three is refused", "error" in tf.cleanValue(tf.fieldDef("company", "sellsTo")!, "SaaS; Fintech; Education; Restaurants"));
    check("a value off the list is refused", "error" in tf.cleanValue(tf.fieldDef("company", "sellsTo")!, "Wizards") && "error" in tf.cleanValue(tf.fieldDef("company", "customerSize")!, "Huge"));
    check("Customer size and D2C save", eq(tf.cleanValue(tf.fieldDef("company", "customerSize")!, "Mid-market"), { value: "Mid-market" }) && eq(tf.cleanValue(tf.fieldDef("company", "businessModel")!, "D2C"), { value: "D2C" }) && eq(tf.cleanValue(tf.fieldDef("company", "businessModel")!, "Marketplace"), { value: "Marketplace" }));
    check("why now still splits on commas", eq(tf.cleanValue(tf.fieldDef("engagement", "whyNow")!, "Fundraise, PE deal"), { value: "Fundraise, PE deal" }));
  }

  /* ---------- 4. migration ---------- */
  console.log("\nAn ideal client saved before the new criteria");
  {
    const old = cleanIcp(OLD_ICP)!;
    check("it loads as it was, with no new lists", eq(old, OLD_ICP), old);
    check("the new lists are cleaned to their pick lists", eq(cleanIcp({ ...OLD_ICP, businessModel: ["B2C", "Nope"], motion: ["PLG", "Sales-led"], sellsTo: ["Pharma & Biotech"], customerSize: ["SMB"], dealSize: ["$150K+"], salesCycle: ["3–6 months"] }), { ...OLD_ICP, sellsTo: ["Pharma & Biotech"], customerSize: ["SMB"], businessModel: ["B2C"], motion: ["PLG", "Sales-led"], dealSize: ["$150K+"], salesCycle: ["3–6 months"] }));
    check("an old ideal client is not empty, and one with only a new list is not either", !model.icpEmpty(OLD_ICP) && !model.icpEmpty({ industries: [], employees: [], revenue: [], countries: [], motion: ["PLG"] }) && model.icpEmpty({ industries: [], employees: [], revenue: [], countries: [] }));
  }

  /* ---------- 5. the server: clients and the learned ideal client ---------- */
  console.log("\nThe member's clients and what the ideal client learned");
  let av = await t.buildView(AVA);
  const me = () => av.me!;
  {
    const marks = new Map((me().clients ?? []).map((c) => [c.id, c]));
    check("a current seat reads Your client since its start month", marks.get(pub("c_calder"))?.words === "Your client since Feb 2025" && marks.get(pub("c_calder"))?.current === true, [...marks.values()]);
    check("a seat that ended reads Past client and its year", marks.get(pub("c_tribeck"))?.words === "Past client, 2022");
    check("a won deal is a client too", marks.get(pub("c_wonder"))?.words === "Your client since Oct 2026", marks.get(pub("c_wonder")));
    check("a ready Evidence Bank case is a past client; a draft is not", marks.get(pub("c_casey"))?.words === "Past client, 2020" && !marks.has(pub("c_miss")));
    const L = me().ideal!.learned;
    const from = (k: keyof typeof L, v: string) => L[k]?.find((x) => x.v === v)?.from ?? null;
    check("revenue is learned as of when she worked there, not today's", !!from("revenue", "$5M–$20M")?.includes("Calder Vane") && !from("revenue", "$20M–$50M"), L.revenue);
    check("employees then, and today's where the seat has none", !!from("employees", "51–200") && from("employees", "51–200")!.includes("Calder Vane") && from("employees", "51–200")!.includes("Tribeck"), L.employees);
    check("the case's own size and revenue are learned", !!from("revenue", "$1M–$5M")?.includes("Caseworth Labs") && !!from("employees", "11–50")?.includes("Caseworth Labs"));
    check("the case's Sales-led motion is learned as Sales-led", !!from("motion", "Sales-led")?.includes("Caseworth Labs") && !!from("motion", "Enterprise sales")?.includes("Calder Vane"), L.motion);
    check("who the clients sell to is learned", !!from("sellsTo", "Healthcare Providers & Health Systems") && !!from("sellsTo", "Pharma & Biotech"));
    check("the won deal's facts are learned", !!from("dealSize", "$15K–$50K")?.includes("Wonderlow") && !!from("industries", "Fintech")?.includes("Wonderlow"));
    check("what she chose is sent apart, unchanged", eq(me().ideal!.stated, OLD_ICP), me().ideal!.stated);
    check("Me.icp is the two together", me().icp!.industries.includes("Fintech") && me().icp!.industries.includes("SaaS") && me().icp!.industries.includes("Cybersecurity") && eq(me().icp!.countries, ["United States"]), me().icp);
    const stored = (await t.exportState()).profiles.mem_ava;
    check("the stored ideal client is still exactly what she chose", eq(stored.icp, OLD_ICP), stored.icp);
    const cy = (await t.buildView(CY)).me!;
    check("a member with no clients and nothing chosen has no ideal client", cy.icp === null && (cy.clients ?? []).length === 0 && eq(cy.ideal?.learned, {}));
  }

  /* ---------- 6. removal memory and recompute ---------- */
  console.log("\nRemoving a learned value, and recomputing");
  {
    const r = await t.perform(AVA, { type: "idealDrop", key: "industries", value: "Cybersecurity" }, BASE);
    av = await t.buildView(AVA);
    check("a learned value can be removed", /Removed Cybersecurity/.test(r.message ?? "") && !me().icp!.industries.includes("Cybersecurity") && eq(me().ideal!.dropped.industries, ["Cybersecurity"]), me().ideal);
    check("removing it never touches what she chose", eq((await t.exportState()).profiles.mem_ava.icp, OLD_ICP));
    // A new fact on a client company: learned at once, with its source.
    const f = await t.perform(AVA, { type: "fill", entity: "company", id: pub("c_calder"), field: "customerSize", value: "Mid-market" }, BASE);
    av = await t.buildView(AVA);
    check("a fact added to a client is learned at once, with where it came from", !!f.message && eq(me().ideal!.learned.customerSize, [{ v: "Mid-market", from: ["Calder Vane"] }]), me().ideal!.learned.customerSize);
    // Her own seat's revenue then, edited: the learned value follows.
    await t.perform(AVA, { type: "fill", entity: "engagement", id: pub("e_ava_tribeck"), field: "revenue", value: "$1M–$5M" }, BASE);
    av = await t.buildView(AVA);
    check("a seat edit recomputes: Tribeck's revenue then is learned", !!me().ideal!.learned.revenue?.find((x) => x.v === "$1M–$5M")?.from.includes("Tribeck"), me().ideal!.learned.revenue);
    check("the dropped value stays out after the recompute", !me().icp!.industries.includes("Cybersecurity"));
    // The seat is not hers after all: what only that client taught is gone.
    await t.perform(AVA, { type: "notMine", engagementId: pub("e_ava_tribeck") }, BASE);
    av = await t.buildView(AVA);
    check("a seat removed is no longer a client, and what only it taught is gone", !(me().clients ?? []).some((c) => c.id === pub("c_tribeck")) && !me().ideal!.learned.sellsTo?.some((x) => x.v === "Pharma & Biotech"), me().ideal!.learned.sellsTo);
    const back = await t.perform(AVA, { type: "idealDrop", key: "industries", value: "Cybersecurity", on: false }, BASE);
    av = await t.buildView(AVA);
    check("a removed value can be put back", /back in your ideal client/.test(back.message ?? "") && me().icp!.industries.includes("Cybersecurity") && !me().ideal!.dropped.industries);
    let refused = false;
    try {
      await t.perform(AVA, { type: "idealDrop", key: "nonsense" as never, value: "x" }, BASE);
    } catch {
      refused = true;
    }
    check("a criterion that doesn't exist is refused", refused);
  }

  /* ---------- 7. saving what the member chose ---------- */
  console.log("\nSaving the ideal client and the onboarding picks");
  {
    await t.perform(AVA, { type: "profile", icp: { ...OLD_ICP, businessModel: ["B2B"], motion: ["Enterprise sales"], dealSize: ["$50K–$150K"] } }, BASE);
    let stored = (await t.exportState()).profiles.mem_ava.icp!;
    check("the new picks save with the ideal client", eq(stored.businessModel, ["B2B"]) && eq(stored.motion, ["Enterprise sales"]) && eq(stored.dealSize, ["$50K–$150K"]), stored);
    check("learned values were not saved as chosen", !stored.industries.includes("SaaS") && !stored.revenue.length, stored);
    await t.perform(AVA, { type: "profile", icp: { industries: ["Fintech", "SaaS"], employees: [], revenue: [], countries: ["United States"] } }, BASE);
    stored = (await t.exportState()).profiles.mem_ava.icp!;
    check("an older form that only knows four lists leaves the newer picks alone", eq(stored.businessModel, ["B2B"]) && eq(stored.industries, ["Fintech", "SaaS"]), stored);
    await t.perform(AVA, { type: "profile", icp: { ...stored, businessModel: [] } }, BASE);
    check("a newer list sent empty is cleared", !(await t.exportState()).profiles.mem_ava.icp!.businessModel);
    // Onboarding keeps the picks in its draft.
    const draft = { step: 2, function: "Finance", title: "Fractional CFO", icp: { industries: ["SaaS"], employees: ["11–50"], revenue: [], countries: [], sellsTo: ["Pharma & Biotech"], customerSize: ["SMB"], salesCycle: ["30–90 days"] }, before: null, roles: false, email: true, clients: [], views: [], saved: null, at: new Date().toISOString() };
    await t.perform(CY, { type: "profile", function: "Finance" }, BASE);
    const st0 = await t.exportState();
    // Cy is onboarded in this seed: the draft is kept only while a member is still in onboarding, so read what the draft cleans to.
    const cleaned = cleanIcp(draft.icp)!;
    check("onboarding's picks clean to the ideal client's lists", eq(cleaned.sellsTo, ["Pharma & Biotech"]) && eq(cleaned.customerSize, ["SMB"]) && eq(cleaned.salesCycle, ["30–90 days"]) && !!st0);
    await t.perform(CY, { type: "profile", icp: draft.icp }, BASE);
    const cy = (await t.buildView(CY)).me!;
    check("onboarding's save stores them as chosen", eq(cy.ideal!.stated!.sellsTo, ["Pharma & Biotech"]) && eq(cy.icp!.customerSize, ["SMB"]), cy.ideal);
    // The set-up starts "How do your best clients sell?" from the claimed seats' company facts.
    const infos = model.deriveAll(av.companies);
    const seats = model.mySeats(infos, av.me!);
    const seedPicks = setup.sellFromSeats(seats);
    check("the set-up prefills how clients sell from the claimed seats' facts", eq(seedPicks.sellsTo, ["Healthcare Providers & Health Systems"]) && eq(seedPicks.businessModel, ["B2B"]) && eq(seedPicks.motion, ["Enterprise sales"]) && eq(seedPicks.customerSize, ["Mid-market"]) && !seedPicks.dealSize, seedPicks);
    check("with no seats there is nothing to prefill", eq(setup.sellFromSeats([]), {}));
  }

  /* ---------- 8. fit on the pages ---------- */
  console.log("\nFit on the pages");
  av = await t.buildView(AVA);
  {
    const infos = model.deriveAll(av.companies);
    const by = (id: string) => infos.find((i) => i.c.id === pub(id))!;
    const own = u3.fitFor(by("c_calder"), av.me!);
    check("her own client is not scored: no count, no criteria, only the client's words", own.client?.words === "Your client since Feb 2025" && own.n === 0 && own.of === 0 && own.traits.length === 0 && !u3.isGoodFit(own) && !u3.isStrong(own), own);
    check("a won deal is not scored either", !!u3.fitFor(by("c_wonder"), av.me!).client);
    const full = u3.fitFor(by("c_full"), av.me!);
    check("a target that matches reads Strong, with every criterion named", !full.client && full.band === "Strong opportunity" && full.n >= 4 && full.traits.find((x) => x.key === "sellsTo")?.on === true, { n: full.n, of: full.of, traits: full.traits });
    const thin = u3.fitFor(by("c_thin"), av.me!);
    const nof = thin.traits.filter((x) => x.unknown);
    check("a thin record: what is not on file is Not on file, with the fact to add, and is not counted", thin.of === 1 && thin.n === 1 && thin.asked > thin.of && nof.length === thin.asked - 1 && nof.every((x) => x.value === u3.NOT_ON_FILE && !!x.fact && !x.on), thin);
    check("its count says so in words", u3.fitCount(thin) === "1 of 1 on file match" && u3.fitCount(u3.fitFor(by("c_empty"), av.me!)) === "Nothing on file to compare yet");
    const miss = u3.fitFor(by("c_miss"), av.me!);
    check("a company that conflicts on what is known is Worth watching", miss.band === "Worth watching" && miss.n === 1 && miss.of === 5 && miss.traits.find((x) => x.key === "countries")?.on === true, miss);
    check("the list orders strong over thin over a miss, and a client is never ranked as a fit", full.order > thin.order && thin.order > miss.order && own.order < miss.order);
    check("buying signals are apart from the count", full.signals.length === 4 && full.signals.find((g) => g.key === "repeat")?.on === true && full.signals.find((g) => g.key === "yourFn")?.on === true && !full.traits.some((x) => /hire|repeat/i.test(x.label)), full.signals);
    check("the older name still reads the same fit", eq(u3.fit7(by("c_full"), av.me!).n, full.n));
    // Ben chose B2C: a D2C company matches, and a plain B2C one too.
    const bv = await t.buildView(BEN);
    const bi = model.deriveAll(bv.companies);
    const d2c = u3.fitFor(bi.find((i) => i.c.id === pub("c_d2c"))!, bv.me!);
    check("a B2C ideal client matches a D2C company on the page", d2c.n === 1 && d2c.of === 1 && d2c.traits[0].key === "businessModel" && d2c.traits[0].value === "D2C", d2c);
    check("and the ideal-client filter lets it in", model.icpTest(bv.me!.icp!)(bi.find((i) => i.c.id === pub("c_d2c"))!.c) && model.icpTest(bv.me!.icp!)(bi.find((i) => i.c.id === pub("c_b2c"))!.c) && !model.icpTest(bv.me!.icp!)(bi.find((i) => i.c.id === pub("c_calder"))!.c));
    check("a newer criterion nobody added yet never keeps a company from being a match", model.icpMatch({ industries: ["SaaS"], employees: [], revenue: [], countries: [], motion: ["PLG"], dealSize: ["$150K+"] }, by("c_thin").c) === "match" && model.icpMatch({ industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: [], motion: ["PLG"] }, by("c_thin").c) === "maybe" && model.icpMatch({ industries: [], employees: [], revenue: [], countries: [], businessModel: ["B2C"] }, by("c_full").c) === "no");
    check("what a maybe is missing is said in words", /not on file/.test(model.icpUnknown(av.me!.icp, by("c_thin").c) ?? ""), model.icpUnknown(av.me!.icp, by("c_thin").c));
    // Crystal Ball's own match reads the same criteria.
    const facts = { name: "x", industry: "SaaS", employees: null, revenue: null, country: null, region: null, fit: { motion: ["PLG"] } };
    check("Crystal Ball leaves out a company whose known sales motion conflicts", radar.inIcp({ ...OLD_ICP, industries: ["SaaS"], countries: [], motion: ["Enterprise sales"] }, facts) === false && radar.inIcp({ ...OLD_ICP, industries: ["SaaS"], countries: [], motion: ["PLG"] }, facts) === true);
    check("and a newer criterion nobody added yet never lowers a company", radar.fitOf({ ...OLD_ICP, industries: ["SaaS"], countries: [], motion: ["PLG"] }, { ...facts, fit: {} }) === radar.fitOf({ ...OLD_ICP, industries: ["SaaS"], countries: [] }, { ...facts, fit: {} }));
  }

  /* ---------- 9. the facts through the app and the connector ---------- */
  console.log("\nThe new facts, and the connector");
  {
    const before = (await t.buildView(BEN)).me!.credits;
    const r = await t.perform(BEN, { type: "fill", entity: "company", id: pub("c_thin"), field: "sellsTo", value: "Pharma & Biotech; Print, Signage & Promotional Products" }, BASE);
    const bv = await t.buildView(BEN);
    const cell = bv.companies.find((c) => c.id === pub("c_thin"))!.cells.sellsTo;
    check("Sells to saves as a fact and earns like any other", !!r.message && cell.s === "value" && cell.v === "Pharma & Biotech; Print, Signage & Promotional Products" && bv.me!.credits === before + 1, { cell, before, now: bv.me!.credits });
    const ctxB = { member: (await t.memberForToken(BEN))!, origin: BASE };
    const add = await tools.addCompanyFact(ctxB, { company: pub("c_thin"), field: "customer_size", value: "Enterprise" });
    check("the connector adds Customer size", !!add.message && (await t.buildView(BEN)).companies.find((c) => c.id === pub("c_thin"))!.cells.customerSize.s === "value", add);
    let refused = "";
    try {
      await tools.addCompanyFact(ctxB, { company: pub("c_miss"), field: "sells_to", value: "SaaS; Fintech; Education; Restaurants" });
    } catch (e) {
      refused = String((e as Error).message);
    }
    check("the connector refuses more than three in Sells to", /up to 3/.test(refused), refused);
    const add2 = await tools.addCompanyFact(ctxB, { company: pub("c_miss"), field: "sells_to", value: "Restaurants; Hotels & Resorts" });
    check("and saves two", !!add2.message && (await t.buildView(BEN)).companies.find((c) => c.id === pub("c_miss"))!.cells.sellsTo.s === "value");
    const ctx = { member: (await t.memberForToken(AVA))!, origin: BASE };
    const empty = (await tools.getCompany(ctx, { company: pub("c_empty") })) as Record<string, unknown>;
    check("you_can_add lists the new facts on a company without them", Array.isArray(empty.you_can_add) && ["sells_to", "customer_size", "business_model"].every((k) => (empty.you_can_add as string[]).includes(k)), empty.you_can_add);
    const full = (await tools.getCompany(ctx, { company: pub("c_full") })) as Record<string, unknown>;
    const fp = full.fits_your_practice as Record<string, unknown>;
    check("get_company says how a target fits the practice, in words", !!fp && /^\d+ of \d+ on file$/.test(String(fp.matched)) && fp.band === "Strong opportunity" && Array.isArray(fp.matches) && Array.isArray(fp.not_on_file) && !/%/.test(JSON.stringify(fp)), fp);
    check("and its buying signals apart", Array.isArray(full.buying_signals) && (full.buying_signals as string[]).some((x) => /Repeat hirer/.test(x)), full.buying_signals);
    check("it reads the company's Sells to", /Pharma & Biotech/.test(String(full.sells_to)), full.sells_to);
    const own = (await tools.getCompany(ctx, { company: pub("c_calder") })) as Record<string, unknown>;
    check("her own client carries no fit in the connector, only that it is her client", own.your_client === "Your client since Feb 2025" && !("fit_score" in own) && !("fit" in own) && !("fits_your_practice" in own), Object.keys(own));
    const acct = (await tools.myAccount(ctx)) as Record<string, unknown>;
    const ifp = acct.ideal_fractional_profile as Record<string, unknown>;
    const src = ifp.sources as Record<string, { value: string; source: string }[]>;
    check("my_account's ideal client has the new criteria", Array.isArray(ifp.sells_to) && Array.isArray(ifp.sales_motion) && Array.isArray(ifp.industries), Object.keys(ifp));
    check("and each value's source", src.industries.find((x) => x.value === "Fintech")?.source.startsWith("You chose") === true && /^From Calder Vane/.test(src.revenue.find((x) => x.value === "$5M–$20M")?.source ?? ""), src);
    check("and her clients", Array.isArray(acct.your_clients) && (acct.your_clients as { company?: string; status: string }[]).some((c) => c.company === "Calder Vane" && c.status === "Your client since Feb 2025"), acct.your_clients);
    // The fit fields themselves (a link elsewhere in the answer holds URL escapes).
    const blob = JSON.stringify([full.fits_your_practice, full.buying_signals, full.fit_reason, own.your_client, own.your_client_note, acct.ideal_fractional_profile, acct.your_clients]);
    check("nothing in the connector's answers is a percentage or odds", !/\d\s?%|percent|\bodds\b/i.test(blob), blob.match(/.{40}(\d\s?%|percent|\bodds\b).{40}/i)?.[0]);
  }

  /* ---------- 10. website suggestions ---------- */
  console.log("\nSuggestions from the company's website");
  {
    const a = sug.suggestFromAbout("Tribeck is a B2B platform that helps pharma companies and biotechs run clinical trials. Start free today.");
    check("who it sells to, the model and a product-led motion are suggested from plain words", eq(a.sellsTo, ["Pharma & Biotech"]) && a.businessModel === "B2B" && a.motion === "PLG", a);
    const b = sug.suggestFromAbout("We make software for hospitals and health systems. Book a demo with our team to see pricing from $50K and a 6 month rollout.");
    check("deal size and sales cycle are never guessed, and Book a demo alone suggests no motion", eq(Object.keys(b).sort(), ["businessModel", "motion", "sellsTo"]) && b.motion === null && eq(b.sellsTo, ["Healthcare Providers & Health Systems"]), b);
    check("at most three industries, each on the list", sug.suggestFromAbout("For banks, credit unions, insurers, hospitals, law firms and restaurants everywhere in the country.").sellsTo.length === 3);
    check("a text that says nothing plainly suggests nothing", eq(sug.suggestFromAbout("We build great things for great people all around the world."), { sellsTo: [], businessModel: null, motion: null }) && eq(sug.suggestFromAbout(null), { sellsTo: [], businessModel: null, motion: null }));
    check("a suggestion is the value a confirm would save", sug.suggestionFor(a, "sellsTo") === "Pharma & Biotech" && sug.suggestionFor(a, "motion") === "PLG" && sug.suggestionFor(a, "dealSize") === null && sug.suggestionFor(a, "salesCycle") === null);
    check("it is labelled as a suggestion from the website", sug.SUGGESTED_FROM === "Suggested from the company's website");
  }

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
