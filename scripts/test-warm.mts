/**
 * Checks of Warm paths (the new look's map, app/post/network/WarmPaths.tsx, over lib/paths/ways.ts
 * warmOf) and of the root causes the old map had (lib/paths/rank.ts, getInOf):
 *
 *   npx tsx scripts/test-warm.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person, company and file in them is made up.
 *
 *  1. The lines placed from the data, as pure functions: a member with no contacts of their own
 *     (best routes at 10% to 25%) still gets marks on both sides of the line across; a whole value
 *     when it splits well, else by rank; every mark stays in its own quadrant; how fresh a path is.
 *  2. A first visit (no Google, no file): never empty. Fellow fractionals in the directory who held
 *     a seat at a company that fits are paths already; companies in all four quadrants, on the map
 *     and in the list; a fellow who keeps out of the directory is never on a route; a locked company
 *     is its facts and never names who held its seat.
 *  3. The old map (getInOf): the line across from the data, the best of each quadrant first (Low
 *     odds companies are no longer dropped), the counts are the dots, with every fit beside them.
 *  4. The member's own LinkedIn file, with Google off: its paths show where the company is open; at
 *     a locked company the match is a count only (the locked-match rule), on the map and in the
 *     connector's ways_in; ways_in is registered without RN_GOOGLE.
 *  5. The page, drawn on the server: the map's marks are buttons in all four quadrants, the
 *     quadrants say what they mean, the Sources panel, the first visit's example labelled Example.
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
const M = Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> };
M._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

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
const ym = (monthsAgo: number) => new Date(NOW - monthsAgo * 30.44 * DAY).toISOString().slice(0, 7);
const dir = mkdtempSync(path.join(tmpdir(), "rn-warm-"));

/* ---------- the made-up world ---------- */
const co = (id: string, name: string, industry = "SaaS", employees = "51–200", hq = "Austin, TX") => ({ id, fields: { name, website: `${id.slice(2)}.example`, industry, employees, hq } });
const seat = (id: string, companyId: string, fn: string, operator: string, start: string, end: string | null) => ({
  id,
  companyId,
  fields: { source: "Published engagement", function: fn, role: `Fractional ${fn} Lead`, operator, start, ...(end ? { end, status: "Ended" } : { status: "Active" }), type: "Fractional" },
});
const role = (id: string, companyId: string, fn: string) => ({ id, companyId, fields: { source: "Demand scan", function: fn, role: `Fractional VP ${fn}`, status: "Open role", type: "Fractional" } });
const NAMES = ["Northwind Clinics", "Cedar and Pine", "Halcyon Freight", "Larkspur Learning", "Bluegate Systems", "Fernhill Software", "Quillmoor", "Kestrel Analytics", "Pinecrest Data", "Redwood Pay", "Sable Works", "Osprey Legal", "Tallgrass Foods", "Mesa Robotics", "Wren Print", "Dunmore Hotels", "Alder Row Dental", "Brightwater Labs"];
const IDS = NAMES.map((_, i) => `c_${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`);
const companies = NAMES.map((name, i) => co(IDS[i], name, i % 3 === 2 ? "Logistics" : "SaaS", i % 4 === 3 ? "201–500" : "51–200"));
const engagements = [
  // Rita (in the directory): Sales now at the first, Marketing and Finance before.
  seat("e_a_rita", IDS[0], "Sales", "Rita Okafor", ym(8), null),
  seat("e_b_rita", IDS[1], "Marketing", "Rita Okafor", ym(30), ym(10)),
  seat("e_c_rita", IDS[2], "Finance", "Rita Okafor", ym(70), ym(50)),
  // Nell (in the directory) at two more; one is locked for Jordan.
  seat("e_d_nell", IDS[3], "Sales", "Nell Brooks", ym(20), ym(3)),
  seat("e_e_nell", IDS[4], "Finance", "Nell Brooks", ym(40), ym(26)),
  // Hugo keeps out of the directory: never a way in, never named.
  seat("e_f_hugo", IDS[5], "Sales", "Hugo Hiddenqa", ym(12), null),
  // Sales seats and open roles here and there: fit and hiring signals.
  seat("e_g_x", IDS[6], "Sales", "Pat Sample", ym(60), ym(40)),
  seat("e_h_x", IDS[7], "Sales", "Lee Sample", ym(10), ym(2)),
  role("e_i_role", IDS[8], "Sales"),
  role("e_j_role", IDS[9], "Sales"),
  role("e_a_role", IDS[0], "Sales"),
  seat("e_k_x", IDS[10], "Operations", "Kim Sample", ym(30), null),
  seat("e_l_x", IDS[11], "Finance", "Sky Sample", ym(90), ym(80)),
];
const seed = {
  builtAt: ago(30),
  members: [
    { id: "mem_jo", name: "Jordan Avery", email: "jordan.avery@averyco.example", title: "Fractional VP Sales", token: "tok-jo-0001" },
    { id: "mem_rita", name: "Rita Okafor", email: "rita.okafor@example.org", title: "Fractional CRO", token: "tok-rita-0001" },
    { id: "mem_nell", name: "Nell Brooks", email: "nell.brooks@example.org", title: "Fractional CFO", token: "tok-nell-0001" },
    { id: "mem_hugo", name: "Hugo Hiddenqa", email: "hugo.hidden@example.org", title: "Fractional CRO", token: "tok-hugo-0001" },
  ],
  companies,
  engagements,
  contacts: [
    { id: "p_a_dm", engagementId: "e_a_rita", source: "Published engagement", fields: { name: "Dana Whitfield", title: "CEO", relationship: "Reported to" } },
    { id: "p_g_dm", companyId: IDS[6], source: "Published engagement", fields: { name: "Theo Grant", title: "Founder", relationship: "Decision maker" } },
  ],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));

// Jordan opened the first two, Halcyon, the seventh to ninth and the eleventh; the rest stay locked.
const OPEN = [IDS[0], IDS[1], IDS[2], IDS[6], IDS[7], IDS[8], IDS[10]];
const state = {
  ledger: [],
  values: {},
  unlocks: Object.fromEntries(OPEN.map((id) => [`${id}.identity`, ["mem_jo"]])),
  seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
  profiles: {
    mem_jo: { function: "Sales", title: "Fractional VP Sales", onboarded: true, icp: { industries: ["SaaS", "Logistics"], employees: ["51–200", "201–500"], revenue: [], countries: [] } },
    mem_rita: { fractionals: true, onboarded: true },
    mem_nell: { fractionals: true, onboarded: true },
    mem_hugo: { fractionals: false, onboarded: true },
  },
  names: {},
  connector: { alerts: {}, grants: [] },
  conversations: [],
};
writeFileSync(path.join(dir, "intel.json"), JSON.stringify(state));

const LINKEDIN = [
  "First Name,Last Name,URL,Email Address,Company,Position,Connected On",
  `Mara,Quinn,https://www.linkedin.com/in/mara-quinn-fake,,${NAMES[10]},COO,12 Mar 2021`,
  `Owen,Reyes,https://www.linkedin.com/in/owen-reyes-fake,,${NAMES[12]},CEO,02 Jan 2024`,
].join("\r\n");

Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_ADMIN_EMAILS: "ada.admin@example.com",
  RN_ID_SECRET: "test-id-secret-not-real",
});
// Google off: everything here works on the member's own files and Merlin's seats.
for (const k of ["RN_GOOGLE", "RN_PATHS", "RN_SUGGEST", "RN_LOCKED_MATCHES", "GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "RESEND_API_KEY", "RN_SCAN", "RN_BILLING", "RN_BACKUP_S3_ENDPOINT", "RN_SCAN_TEST", "RN_MCP_TEST", "RN_EMAIL_API_URL"]) delete process.env[k];

const JO = "tok-jo-0001";
const ORIGIN = "https://post.example.com";
type WarmView = import("../lib/paths/types.ts").WarmView;
const inQuad = (r: { x: number; y: number; zone: string }) => (r.zone === "go" ? r.x > 50 && r.y > 50 : r.zone === "find" ? r.x < 50 && r.y > 50 : r.zone === "warm" ? r.x > 50 && r.y < 50 : r.x < 50 && r.y < 50);

async function main() {
  const R = await import("../lib/paths/rank.ts");

  /* ---------- 1. the lines, placed from the data ---------- */
  console.log("\nThe lines, placed from the data");
  // A member with no contacts of their own: fellow fractionals' routes top out near 15%, many have no route.
  const coarse = [15, 15, 10, 10, 25, 5, null, null, null, null];
  const fine = [15.2, 14.6, 10.1, 9.8, 24, 5, -1, -1, -1, -1];
  const sp = R.splitLine(coarse, fine);
  const hi = coarse.map((c, k) => R.isHigh(sp, c, fine[k]));
  check("no contacts of their own: the line across leaves marks on both sides (it was fixed at 35%, so every mark sat left)", hi.some(Boolean) && hi.some((x) => !x) && !coarse.some((c) => c !== null && c >= R.WARM_EST), { sp, hi });
  check("a company with no route is never on the warmer side", coarse.every((c, k) => c !== null || !hi[k]));
  const whole = R.splitLine([1, 2, 2, 3, 3, 4, 4, 5], [1.1, 2.2, 2.4, 3.1, 3.5, 4.2, 4.6, 5.1]);
  check("a whole value when it splits well enough (fit 3 of 5 or more)", whole.at === 3, whole);
  const lop = R.splitLine([3, 3, 3, 3, 3, 3, 3, 4], [3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1]);
  check("...else by rank, so the halves are even", lop.at === null && [3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 4.1].filter((v) => v >= lop.fineAt).length === 4, lop);
  check("nothing at all: every row low", R.splitLine([null, null], [-1, -1]).fineAt === Infinity);
  const xs = R.placeAxis(coarse, fine, sp, { lo0: 10, none: 6 });
  check("placed: the warmer side right of 50, the colder left, no route at the far left", xs.every((x, k) => (hi[k] ? x > 50 : x < 50)) && xs.filter((_, k) => coarse[k] === null).every((x) => x === 6), xs);
  const boxed = R.spreadBox(Array.from({ length: 12 }, (_, k) => ({ x: 60, y: 60, box: [54, 95, 54, 95] as [number, number, number, number], k })));
  check("marks on top of each other are moved apart, never out of their quadrant", boxed.every((p) => p.x >= 54 && p.y >= 54) && new Set(boxed.map((p) => `${p.x}|${p.y}`)).size === 12);
  const f1 = R.freshOf([{ kind: "met", meetings: 3, emails: 0, last: new Date(NOW - 12 * DAY).toISOString().slice(0, 10) }], NOW);
  const f2 = R.freshOf([{ kind: "peer" }], NOW);
  const f3 = R.freshOf([{ kind: "seat", active: false, endYear: new Date(NOW).getUTCFullYear() - 3 }], NOW);
  check("how fresh: a meeting 12 days ago is Fresh; a peer never met has nothing dated; a seat that ended 3 years ago is Stale", f1.word === "Fresh" && /12 days ago/.test(f1.line) && f2.word === null && f3.word === "Stale" && /Reconnect first/.test(f3.line), [f1, f2, f3]);

  const W = await import("../lib/paths/ways.ts");
  const t = await import("../lib/table.ts");
  const P = await import("../lib/paths/index.ts");
  const pub = (id: string) => t.tableInternals.pubId(id);
  const jo = (await t.memberForToken(JO))!;
  const warm = async () => (await W.warmView(JO, Date.now())) as WarmView;

  /* ---------- 2. a first visit ---------- */
  console.log("\nA first visit: no Google, no file");
  const v = await warm();
  if (process.env.SHOW) for (const r of v.rows) console.log(`  ${r.rank}. ${r.name ?? "locked"} | ${r.zone} | fit ${r.fit} ${r.fitWords.join("/")} | ${r.best ?? "-"}% ${r.src ?? ""} | ${r.via ?? ""} | ${r.x},${r.y}`);
  check("never empty: the companies that fit, ranked", v.on && v.rows.length >= 12 && v.rows.every((r, k) => r.rank === k + 1), v.rows.length);
  check("none of the member's own sources is in", !v.own.google && !v.own.linkedin && !v.own.csv);
  const fellows = v.rows.filter((r) => r.src === "fellow");
  check("fellow fractionals who held a seat at companies that fit are paths already, free", fellows.length >= 3 && fellows.every((r) => r.best !== null), fellows.map((r) => [r.name, r.best]));
  check("all four quadrants hold companies, on the map and in the list", R.ZONES.every((z) => v.counts[z] > 0 && v.countsAll[z] > 0), { counts: v.counts, all: v.countsAll });
  check("every mark sits in its own quadrant", v.rows.filter((r) => r.onMap).every(inQuad), v.rows.filter((r) => r.onMap && !inQuad(r)).map((r) => [r.zone, r.x, r.y]));
  check("the counts on the map are the marks", R.ZONES.every((z) => v.counts[z] === v.rows.filter((r) => r.onMap && r.zone === z).length));
  check("the counts in all add up", R.ZONES.reduce((a, z) => a + v.countsAll[z], 0) === v.total);
  check("the lines say where they sit, honestly", /^(Fit \d of 5 or more|The better fitting half)$/.test(v.lines.fit.words) && /^(Est\. success \d+% or more|Your warmer half of these ways in)$/.test(v.lines.way.words), v.lines);
  check("the warmest way in is said: the best of the marks' estimates", v.warmest === Math.max(...v.rows.map((r) => r.best ?? 0)), v.warmest);
  check("a cold note to who decides is the weakest way in, and says so", v.rows.filter((r) => r.src === "direct").every((r) => !r.locked ? /^A cold note to /.test(r.via ?? "") : true) && v.rows.some((r) => r.src === "direct"), v.rows.filter((r) => r.src === "direct").map((r) => r.via));
  check("fit is of five, and says which", v.rows.every((r) => r.fit >= 0 && r.fit <= 5 && r.fit === r.fitWords.length && r.fitWords.every((x) => ["function", "industry", "size", "revenue", "a hiring signal"].includes(x))));
  const all = JSON.stringify(v);
  check("a fellow who keeps out of the directory is never on a route and never named", !all.includes("Hugo") && !all.includes("Hiddenqa"));
  const locked = v.rows.filter((r) => r.locked);
  check("a locked company is its facts: no name, no person, and who held its seat stays unsaid", locked.length > 0 && locked.every((r) => r.name === null && r.person === null && r.people.length === 0) && !all.includes(NAMES[3]) && !all.includes(NAMES[4]));
  check("...and a fellow's path there says so without a name", locked.some((r) => r.via === "Through a fellow fractional"), locked.map((r) => r.via));
  const ritaRow = v.rows.find((r) => r.id === pub(IDS[0]));
  check("an open company names the fellow fractional (the directory is free)", !!ritaRow && ritaRow.via === "Through Rita Okafor" && ritaRow.people.some((p) => p.name === "Rita Okafor"), ritaRow);
  check("the sources: messages and the directory counted, ways in by where they come from", v.directory >= 2 && v.conversations === 0 && (v.bySource.fellow ?? 0) >= 3, { d: v.directory, by: v.bySource });
  check("the ideal client in words, for the first visit's line", /^Sales, in SaaS and [^,]+, with 51–200 and 201–500 people$/.test(v.icp ?? ""), v.icp);

  const way = (await W.wayIn(JO, pub(IDS[0]))) as import("../lib/paths/types.ts").WayInView;
  const fr = way.routes.find((r) => r.src === "fellow");
  check("the path: the fellow fractional's route, with where each link comes from and how fresh it is", !!fr && fr.nodes[1].label === "Rita Okafor" && fr.links[0].from === "Fellow fractionals on Merlin" && fr.links[1].from === "Seats on Merlin" && !!fr.fresh && /Newest signal/.test(fr.fresh.line), fr);
  check("its ask is a message on Merlin, drafted, and nothing is sent", fr?.steps[0].act?.kind === "message" && !!fr.steps[0].note?.body && /fellow fractional/.test(fr.steps[0].note.subject), fr?.steps[0]);
  check("who decides is said as the member may see them", !!fr && fr.nodes[2].role === "target");

  /* ---------- 3. the old map ---------- */
  console.log("\nWhere you can get in (the old look)");
  const g = (await W.getInView(JO, Date.now())) as import("../lib/paths/types.ts").GetInView;
  check("the counts are the dots on the map, every fit beside them", R.ZONES.every((z) => g.counts[z] === g.rows.filter((r) => r.zone === z).length) && !!g.countsAll && R.ZONES.reduce((a, z) => a + g.countsAll![z], 0) === g.total, { c: g.counts, a: g.countsAll });
  check("the line across is from the data: the warmer half exists without contacts", g.rows.some((r) => r.zone === "go" || r.zone === "warm"), g.counts);
  check("Low odds companies are on the map too (they were cut by the top 60)", g.rows.some((r) => r.odds === "Low"));
  check("every dot sits in its own quadrant", g.rows.every(inQuad));

  /* ---------- 4. the member's own file, Google off ---------- */
  console.log("\nThe LinkedIn file, with Google off");
  await P.importConnections(JO, LINKEDIN);
  const v2 = await warm();
  check("the file is a source on its own: own.linkedin, and a path from it where the company is open", v2.own.linkedin && v2.rows.some((r) => r.id === pub(IDS[10]) && r.src === "linkedin" && r.via === "You know Mara Quinn"), v2.rows.find((r) => r.id === pub(IDS[10])));
  check("at a locked company the match is a count only: no path from the file, nothing that names it", v2.lockedWays === 1 && !v2.rows.some((r) => r.id === pub(IDS[12]) && r.src === "linkedin") && !JSON.stringify(v2).includes("Owen Reyes") && !JSON.stringify(v2).includes(NAMES[12]), { lw: v2.lockedWays });
  const MCP = await import("../lib/mcp/ways.ts");
  const mk = JSON.stringify(await MCP.waysIn({ member: jo, origin: ORIGIN }, { company_id: pub(IDS[10]) }));
  const ml = JSON.stringify(await MCP.waysIn({ member: jo, origin: ORIGIN }, { company_id: pub(IDS[12]) }));
  const mr = JSON.stringify(await MCP.waysIn({ member: jo, origin: ORIGIN }, { company_id: pub(IDS[0]) }));
  check("the connector's ways_in works without Google: the file's person is someone you know, the fellow fractional is named", /someone you know/.test(mk) && !mk.includes("Mara") && mr.includes("Rita Okafor"), [mk.slice(0, 300), mr.slice(0, 300)]);
  check("...and a locked company stays closed there", /"routes":\[\]/.test(ml) && !ml.includes("Owen") && !ml.includes(NAMES[12]));
  const server = readFileSync(new URL("../lib/mcp/server.ts", import.meta.url), "utf8");
  check("ways_in is registered with ways in on (RN_PATHS), not only with RN_GOOGLE", /if \(pathsOn\(\)\) registerWayTools\(server, ctx, run\)/.test(server) && !/if \(networkOn\(\)\) registerWayTools/.test(server));

  /* ---------- 5. the page ---------- */
  console.log("\nThe page, drawn on the server");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { UiCtx } = await import("../app/post/ui.tsx");
  const { AppCtxProvider } = await import("../app/post/shell/pages.tsx");
  const noop = () => {};
  const me = (await t.buildView(JO)).me!;
  const ui = { me, act: async () => ({ ok: true, message: "" }), layout: "wide", busy: new Set(), flash: new Set(), pulse: null, unlock: noop, unlockMany: async () => true, edit: noop, fill: async () => true, openCompany: noop, openAdd: noop, isHidden: () => false, holdsSeat: () => false, addable: () => [], seats: { n: 0, missing: 0 }, openSeats: noop, openPage: noop, contact: null };
  const app = { me, infos: [], byId: new Map(), phone: false, ui2: true, start: { stripOff: () => false, dismissStrip: noop, run: noop }, openProfile: noop, openPage: noop, openSeats: noop, openCompany: noop, refresh: async () => {}, shell: { wayCo: null } };
  const render = (el: unknown) => renderToStaticMarkup(React.createElement(UiCtx.Provider, { value: ui as never }, React.createElement(AppCtxProvider, { value: app as never }, el as never)));
  const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
  const WP = await import("../app/post/network/WarmPaths.tsx");
  const html = render(React.createElement(WP.WarmBody, { v, reload: async () => {}, phone: false }));
  const marks = html.match(/<button[^>]*class="wp-mark[^"]*"[^>]*>/g) ?? [];
  check("the map: every company on it a button with words for screen readers", marks.length === v.rows.filter((r) => r.onMap).length && marks.every((m) => /aria-label="[^"]+"/.test(m)), marks.length);
  check("the four quadrants, each saying what it means and how many", R.ZONES.every((z) => text(html).includes(WP.QUADRANTS[z].title) && text(html).includes(WP.QUADRANTS[z].hint)));
  check("the lines are explained: placed in the middle of the member's companies", /The lines sit in the middle of your \d+ companies/.test(text(html)) && /Your warmest way in today is \d+%/.test(text(html)), text(html).match(/The lines sit[^.]*\./)?.[0]);
  check("a Map or Table switch, the ranked list, the path aside", /aria-pressed="true"[^>]*>Map</.test(html) && />Table</.test(html) && /aria-label="Ranked list, best first"/.test(html) && /aria-label="The path into the company you picked"/.test(html));
  check("the first visit: Bring in who you know is step 3, inline, with the five sources", /Step 3 of 6\. Bring in who you know/.test(text(html)) && ["Google contacts", "LinkedIn connections file", "CSV", "Merlin messages", "Fellow fractionals"].every((s) => text(html).includes(s)));
  check("...and the example map is offered, labelled", /Example: after you connect/.test(text(html)));
  check("a locked mark says its facts, never its name", marks.some((m) => /aria-label="Locked company, /.test(m)) && !html.includes(NAMES[3]));
  check("no export anywhere", !/Export|Download/.test(text(html)));
  const src = readFileSync(new URL("../app/post/network/WarmPaths.tsx", import.meta.url), "utf8");
  check("the example rows are Examples: wrapped, never counted, never sent", /EXAMPLE_ROWS\.map\(\(x\) => x\.value\)/.test(src) && /ExampleAside/.test(src) && /example<WarmRow>/.test(readFileSync(new URL("../app/post/network/warmExamples.ts", import.meta.url), "utf8")));
  const linkedinOk = (s: string) => !/Sales Navigator/i.test(s) && [...s.matchAll(/LinkedIn/g)].every((m) => /(your |Your )$/.test(s.slice(Math.max(0, m.index! - 5), m.index)) || /^LinkedIn (connections file|file)/.test(s.slice(m.index!)));
  check("the page's words never present LinkedIn or Sales Navigator as Merlin's source", linkedinOk(src.replace(/^\s*(\*|\/\/).*$/gm, "")));
  check("Merlin, never another name for its AI", !/Claude|Anthropic|AI assistant|copilot/i.test(src.replace(/^\s*(\*|\/\/).*$/gm, "")));
  const ex = await import("../app/post/network/warmExamples.ts");
  const exRows = ex.EXAMPLE_ROWS.map((x) => x.value);
  check("the example map fills all four quadrants, every mark in its own", R.ZONES.every((z) => exRows.some((r) => r.zone === z)) && exRows.every(inQuad) && ex.EXAMPLE_ROWS.every((x) => x.kind === "example" && x.label === "Example"));
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
