/**
 * Checks of "Who leads each function" (lib/leaders): reading titles, finding the pages on a
 * company's own site, the safety rules on the way (robots.txt, the page cap, same site only), how
 * the leaders are stored (never a name), where the product shows them (the record's line, "No
 * fractional Sales yet" and its ranking, the Claude connector), Pilot metrics, and RN_LEADERS off.
 * Nothing leaves the machine: the sites come from a mock server on localhost, and names resolve
 * through a table here. The storage checks run lib/table.ts in this process on a made-up seed in
 * a temporary data folder.
 *
 *   LEADERS_PORT=4953 npx tsx scripts/test-leaders.mts
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.LEADERS_PORT || 4953);
const dir = mkdtempSync(path.join(tmpdir(), "rn-leaders-"));
const DAY = 86_400_000;
const NOW0 = Date.now();
const at = (days: number) => () => new Date(NOW0 + days * DAY).toISOString();

/* ---------- the made-up seed ---------- */

const fin = { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: "2025-01" };
const seed = {
  builtAt: new Date(NOW0 - 2 * DAY).toISOString(),
  members: [
    { id: "m1", name: "Ada Admin", email: "ada@example.com", title: "Founder", token: "tok-ada" },
    { id: "m2", name: "Sal Seller", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal" },
    { id: "m3", name: "Fay Finance", email: "fay@example.com", title: "Fractional CFO", token: "tok-fay" },
  ],
  companies: [
    // Hired a fractional CFO, nobody in Sales on file, and a full-time CMO & CRO on its site: the case this is for.
    { id: "c_true", fields: { name: "TrueDialog Test", website: "truedialog.test", industry: "Software" } },
    // Hired a fractional CFO, nobody in Sales, nothing on its site: the opening.
    { id: "c_gap", fields: { name: "Gap Co", website: "gap.test", industry: "Software" } },
    // No seats on file, a fractional CFO and an interim head of marketing in its JSON-LD.
    { id: "c_ld", fields: { name: "Ledger Co", website: "jsonld.test", industry: "Software" } },
    { id: "c_cards", fields: { name: "Cards Co", website: "cards.test" } },
    { id: "c_robots", fields: { name: "Robots Co", website: "robots.test" } },
    { id: "c_robotsall", fields: { name: "Robots All Co", website: "robotsall.test" } },
    { id: "c_many", fields: { name: "Many Co", website: "many.test" } },
    { id: "c_off", fields: { name: "Offsite Co", website: "offsite.test" } },
    { id: "c_map", fields: { name: "Sitemap Co", website: "sitemap.test" } },
    { id: "c_promo", fields: { name: "Promote Co", website: "promote.test" } },
    { id: "c_moved", fields: { name: "Moved Co", website: "moved.test" } },
    // Has an open role: read first.
    { id: "c_open", fields: { name: "Open Co", website: "open.test" } },
    { id: "c_noweb", fields: { name: "No Web Co" } },
    { id: "c_shared", fields: { name: "Shared Co", website: "crunchbase.com/organization/shared-co" } },
  ],
  engagements: [
    { id: "e_true_fin", companyId: "c_true", fields: fin, verified: false },
    { id: "e_gap_fin", companyId: "c_gap", fields: fin, verified: false },
    { id: "e_open", companyId: "c_open", fields: { source: "Demand scan", function: "Marketing", role: "Fractional CMO", status: "Open role" }, verified: false },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    // Member activity at Cards Co: a follow.
    follows: { m2: ["c_cards"] },
    seen: { m2: new Date(NOW0 - DAY).toISOString(), m3: new Date(NOW0 - DAY).toISOString() },
    profiles: {
      m2: { function: "Sales", title: "Fractional VP Sales", onboarded: true },
      m3: { function: "Finance", title: "Fractional CFO", onboarded: true },
    },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada@example.com",
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RN_LEADERS", "RN_ABOUT", "RN_SCAN_TEST", "RN_ABOUT_TEST_PORT", "RESEND_API_KEY", "RN_EMAIL_FROM", "RN_SCAN", "RN_REQUIRE_SEED"]) delete process.env[k];

/** Names on the fixture pages. None may be stored or sent anywhere. */
const NAMES = ["Jane Zabriskie", "John Pemberton", "Ann Quigley", "Bo Ashcombe", "Kim Farrowdale", "Lu Wendmere", "Al Gorrington", "Lia Ortizabal", "Ray Foxworthy", "Max Itoyama", "Sam Hillcrest", "Tia Mossbank", "Dana Linwick", "Pat Kimbrough", "Quinn Rayburn", "Zed Zeller", "Lee Manyard"];
const nameHits = (x: unknown) => {
  const s = JSON.stringify(x).toLowerCase();
  const out: string[] = [];
  // The surnames are made up and distinctive, so any hit is a name that got through. First names alone are common words.
  for (const n of NAMES) {
    const [first, last] = n.toLowerCase().split(" ");
    if (s.includes(last)) out.push(last);
    if (s.includes(`${first} ${last}`)) out.push(n);
  }
  return [...new Set(out)];
};

const { classifyTitle, extractLeaders, linkKind, dateIn, kindOf, looksLikeName } = await import("../lib/leaders/extract");
const { pickFunctions, mergeFunctions } = await import("../lib/leaders/pick");
const { robotsAllowsPath, robotsAllowsRoot } = await import("../lib/about/fetch");
const types = await import("../lib/leaders/types");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

/* ---------- titles ---------- */
console.log("\nTitles");

const fl = (t: string) => classifyTitle(t).map((x) => `${x.fn}/${x.level}/${x.kind}`);
eq("Chief Revenue Officer is Sales, C-level, full-time", fl("Chief Revenue Officer"), ["Sales/C-level/full-time"]);
eq("CMO & CRO counts for both", fl("CMO & CRO"), ["Marketing/C-level/full-time", "Sales/C-level/full-time"]);
eq("Chief Marketing and Revenue Officer counts for both", fl("Chief Marketing and Revenue Officer"), ["Marketing/C-level/full-time", "Sales/C-level/full-time"]);
eq("VP Sales and Marketing: VP of both", fl("VP Sales and Marketing"), ["Sales/VP/full-time", "Marketing/VP/full-time"]);
eq("Head of Growth", fl("Head of Growth"), ["Growth/Head/full-time"]);
eq("Director of Revenue Operations", fl("Director of Revenue Operations"), ["RevOps/Director/full-time"]);
eq("Fractional CFO", fl("Fractional CFO"), ["Finance/C-level/fractional"]);
eq("Interim Head of Marketing", fl("Interim Head of Marketing"), ["Marketing/Head/interim"]);
eq("Acting CRO is interim", fl("Acting CRO"), ["Sales/C-level/interim"]);
eq("Advisory CMO", fl("Advisory CMO"), ["Marketing/C-level/advisor"]);
eq("Part-time VP Sales", fl("Part-time VP Sales"), ["Sales/VP/part-time"]);
eq("below lead: Marketing Manager", fl("Marketing Manager"), []);
eq("below lead: Senior Account Executive", fl("Senior Account Executive"), []);
eq("below lead: Fractional Content Manager", fl("Fractional Content Manager"), []);
eq("a Lead is not a function's leader", fl("Growth Lead"), []);
eq("a CEO or founder is not counted", fl("Chief Executive Officer & Co-Founder"), []);
eq("  but a CRO who co-founded is", fl("Co-Founder & CRO"), ["Sales/C-level/full-time"]);
eq("a former role is not counted", fl("Former CRO, now board member"), []);
eq("VP, Customer Success", fl("VP, Customer Success"), ["Customer Success/VP/full-time"]);
eq("Chief Growth Officer (CGO)", [fl("CGO"), fl("Chief Growth Officer")], [["Growth/C-level/full-time"], ["Growth/C-level/full-time"]]);
eq("kinds", [kindOf("Fractional CMO"), kindOf("Interim CRO"), kindOf("CMO Advisor"), kindOf("Part time CFO"), kindOf("CMO")], ["fractional", "interim", "advisor", "part-time", "full-time"]);
eq("names are told from titles", [looksLikeName("Jane Doe"), looksLikeName("Chief Revenue Officer"), looksLikeName("Meet the Team"), looksLikeName("Ludwig van Beethoven"), looksLikeName("November 4, 2024")], [true, false, false, true, false]);
eq("dates", [dateIn("March 12, 2024"), dateIn("2025-06-02T09:00:00Z"), dateIn("12 March 2024"), dateIn("Jan 2023"), dateIn("no date here")], ["2024-03-12", "2025-06-02", "2024-03-12", "2023-01", null]);
eq("link kinds", [linkKind(new URL("https://a.test/about-us/leadership"), ""), linkKind(new URL("https://a.test/careers"), "Join our team"), linkKind(new URL("https://a.test/newsroom"), "Newsroom"), linkKind(new URL("https://a.test/news/x"), "Acme appoints Jane Doe as CRO"), linkKind(new URL("https://a.test/our-story"), "")], ["team", null, "press", "release", "about"]);

/* ---------- one page, by rules ---------- */
console.log("\nPages");

const page = (body: string, head = "") => `<!doctype html><html><head><title>x</title>${head}</head><body>${body}</body></html>`;
let c = extractLeaders(page(`<script type="application/ld+json">{"@graph":[{"@type":"Organization","employee":[{"@type":"Person","name":"Kim Park","jobTitle":"Fractional CFO"},{"@type":"Person","name":"Al Gor","jobTitle":"Senior Account Executive"}]}]}</script>`), "https://x.test/");
eq("JSON-LD Person: a fractional CFO, and the account executive left out", c.map((x) => `${x.fn}/${x.kind}/${x.how}`), ["Finance/fractional/team page"]);
c = extractLeaders(page(`<div class="card"><h3>Jane Doe</h3><p>CMO &amp; CRO</p></div><div><h3>Bo Chen</h3><p>VP, Customer Success</p><p>Bo joined in 2024 from a payments firm.</p></div>`), "https://x.test/team");
eq("team cards: a dual title, and joined in 2024", c.map((x) => `${x.fn}/${x.level}/${x.since ?? "-"}`), ["Marketing/C-level/-", "Sales/C-level/-", "Customer Success/VP/2024"]);
c = extractLeaders(page(`<h2>Our people</h2><p>Chief Revenue Officer</p><p>We sell to banks.</p>`), "https://x.test/team");
eq("a title with no name next to it is not a card", c, []);
c = extractLeaders(
  page(`<main><h1>Acme appoints Jane Doe as Chief Revenue Officer</h1><p>AUSTIN, March 12, 2024. Acme today announced it has appointed Jane Doe as Chief Revenue Officer, effective immediately.</p></main>`, `<meta property="article:published_time" content="2024-03-12T09:00:00Z">`),
  "https://x.test/news/1",
  true,
);
check("a press release: appoints … as CRO, since the release's month", c.length > 0 && c.every((x) => x.fn === "Sales" && x.level === "C-level" && x.kind === "full-time" && x.how === "press release" && x.since === "2024-03"), c);
c = extractLeaders(page(`<p>Pat Kim joins Acme as VP Marketing. Pat joined in 2022 after years in retail.</p>`), "https://x.test/news/2", true);
check("a press release with no date: joins … as VP Marketing, since the year it says", c.length > 0 && c.every((x) => x.fn === "Marketing" && x.level === "VP" && x.since === "2022"), c);
c = extractLeaders(page(`<p>Acme names Dana Lin Interim CRO.</p>`), "https://x.test/news/3", true);
check("names … Interim CRO (no 'as')", c.some((x) => x.fn === "Sales" && x.kind === "interim"), c);
c = extractLeaders(page(`<p>Acme appoints Jane Doe to its Board of Directors.</p><p>Acme hires 40 new staff to support growth.</p>`), "https://x.test/news/4", true);
eq("a board seat or a hiring spree is not a leader", c, []);
const names = new Set<string>();
extractLeaders(page(`<div><h3>Jane Doe</h3><p>Chief Revenue Officer</p></div><p>Acme appoints Bo Chen as VP Marketing.</p>`), "https://x.test/", false, names);
check("names seen are collected, only to keep them out of stored addresses", names.has("jane") && names.has("doe") && names.has("bo") === false && names.has("chen"), [...names]);

/* ---------- picking one per function ---------- */
console.log("\nOne leader per function");

const cand = (o: Partial<import("../lib/leaders/extract").Candidate>) => ({ fn: "Sales", level: "VP" as const, kind: "full-time" as const, how: "team page" as const, url: "https://x.test/team", ...o });
let pick = pickFunctions([cand({ level: "VP" }), cand({ level: "C-level" }), cand({ level: "Director" })], "t");
eq("several on a team page: the most senior", pick.Sales.level, "C-level");
pick = pickFunctions([cand({ how: "press release", kind: "interim", level: "C-level", since: "2023-01", date: "2023-01-10" }), cand({ how: "press release", level: "C-level", since: "2025-06", date: "2025-06-02" })], "t");
eq("a newer press release wins over an older one", [pick.Sales.kind, pick.Sales.since], ["full-time", "2025-06"]);
pick = pickFunctions([cand({ level: "C-level" }), cand({ how: "press release", level: "C-level", since: "2024-03", date: "2024-03-12" })], "t");
eq("the team page and a release agree: the release says since when", [pick.Sales.how, pick.Sales.since], ["press release", "2024-03"]);
pick = pickFunctions([cand({ level: "C-level", kind: "fractional" }), cand({ how: "press release", level: "C-level", since: "2021-01", date: "2021-01-05" })], "t");
eq("the team page and an older release disagree on the kind: the team page (today)", pick.Sales.kind, "fractional");
const merged = mergeFunctions(
  { Sales: { level: "C-level", kind: "full-time", since: "2024-03", how: "press release", url: "u1", seenAt: "a" }, Marketing: { level: "VP", kind: "full-time", how: "press release", since: "2022", url: "u2", seenAt: "a" } },
  { Sales: { level: "C-level", kind: "full-time", how: "team page", url: "u3", seenAt: "b" } },
);
eq("a later read keeps the release's since, and a release it no longer reaches", [merged.Sales.since, merged.Sales.seenAt, merged.Marketing?.level], ["2024-03", "b", "VP"]);

/* ---------- robots.txt by path ---------- */
console.log("\nrobots.txt");

eq("a path rule refuses that path only", [robotsAllowsPath("User-agent: *\nDisallow: /team\n", "/team"), robotsAllowsPath("User-agent: *\nDisallow: /team\n", "/about")], [false, true]);
eq("Disallow / refuses every path", robotsAllowsPath("User-agent: *\nDisallow: /\n", "/leadership"), false);
eq("a longer Allow wins", robotsAllowsPath("User-agent: *\nDisallow: /\nAllow: /leadership\n", "/leadership"), true);
eq("wildcards and $", [robotsAllowsPath("User-agent: *\nDisallow: /*.pdf$\n", "/a/b.pdf"), robotsAllowsPath("User-agent: *\nDisallow: /*.pdf$\n", "/a/b.pdf?x=1")], [false, true]);
eq("our own group wins over *", robotsAllowsPath("User-agent: *\nDisallow: /\n\nUser-agent: merlin-about\nDisallow: /press\n", "/team"), true);
eq("the root check is unchanged", [robotsAllowsRoot("User-agent: *\nDisallow: /\n"), robotsAllowsRoot("User-agent: *\nDisallow: /team\n")], [false, true]);

/* ---------- the mock web ---------- */

const P = PORT;
const html = (body: string, head = "") => page(body, head);
const seen: { host: string; path: string; ua: string }[] = [];
const sites: Record<string, Record<string, string | ((r: ServerResponse) => void)>> = {
  "truedialog.test": {
    "/": html(`<nav><a href="/about-us">About us</a><a href="/newsroom">Newsroom</a><a href="/careers">Join our team</a><a href="/pricing">Pricing</a></nav><main><h1>Business texting</h1></main>`),
    "/about-us": html(`<main><h1>About</h1><p>We help brands text their customers.</p><a href="/about-us/leadership">Meet our leadership team</a></main>`),
    "/about-us/leadership": html(
      `<main><section><div class="card"><h3>Jane Zabriskie</h3><p>CMO &amp; CRO</p></div><div class="card"><h3>John Pemberton</h3><p>Chief Executive Officer</p></div><div class="card"><h3>Ann Quigley</h3><p>Marketing Manager</p></div><div class="card"><h3>Bo Ashcombe</h3><p>VP, Customer Success</p></div></section></main>`,
    ),
    "/newsroom": html(
      `<main><ul><li><a href="/news/truedialog-appoints-jane-zabriskie-chief-marketing-and-revenue-officer">TrueDialog Appoints Jane Zabriskie as Chief Marketing and Revenue Officer</a> <span>March 12, 2024</span></li><li><a href="/news/product-launch">TrueDialog launches a new API</a> <span>Feb 1, 2024</span></li></ul></main>`,
    ),
    "/news/truedialog-appoints-jane-zabriskie-chief-marketing-and-revenue-officer": html(
      `<main><h1>TrueDialog Appoints Jane Zabriskie as Chief Marketing and Revenue Officer</h1><p>AUSTIN, Texas, March 12, 2024. TrueDialog today announced it has appointed Jane Zabriskie as Chief Marketing and Revenue Officer. Zabriskie joined TrueDialog in 2022 as VP Marketing.</p></main>`,
      `<meta property="article:published_time" content="2024-03-12T09:00:00Z">`,
    ),
  },
  "gap.test": { "/": html(`<main><h1>Gap Co</h1><p>We make things.</p></main>`) },
  "jsonld.test": {
    "/": html(
      `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"Organization","name":"Ledger Co","employee":[{"@type":"Person","name":"Kim Farrowdale","jobTitle":"Fractional CFO"},{"@type":"Person","name":"Lu Wendmere","jobTitle":"Interim Head of Marketing"},{"@type":"Person","name":"Al Gorrington","jobTitle":"Senior Account Executive"}]}]}</script><main>Ledger</main>`,
    ),
  },
  "cards.test": {
    "/": html(`<nav><a href="/team">Our team</a></nav>`),
    "/team": html(
      `<main><div class="card"><h3>Lia Ortizabal</h3><p>Advisory CMO</p></div><ul><li><span>Ray Foxworthy</span><span>Part-time VP Sales</span><p>Ray joined in 2023 after ten years in software.</p></li></ul><p>Max Itoyama – Director of RevOps</p><div><h4>Sam Hillcrest</h4><p>Former CRO, now board member</p></div><div><h4>Tia Mossbank</h4><p>Fractional Content Manager</p></div></main>`,
    ),
  },
  "robots.test": {
    "/robots.txt": "User-agent: *\nDisallow: /team\nDisallow: /leadership\nDisallow: /about\nDisallow: /press\nDisallow: /news\nDisallow: /company\nDisallow: /sitemap.xml\n",
    "/": html(`<nav><a href="/team">Team</a></nav>`),
    "/team": html(`<div><h3>Zed Zeller</h3><p>Chief Revenue Officer</p></div>`),
  },
  "robotsall.test": { "/robots.txt": "User-agent: *\nDisallow: /\n", "/": html(`<a href="/team">Team</a>`) },
  "many.test": {
    "/": html(
      `<nav>${["leadership", "team", "people", "management", "about", "company", "press", "news", "media"].map((p) => `<a href="/${p}">${p}</a>`).join("")}${[1, 2, 3, 4, 5, 6].map((n) => `<a href="/news/many-names-new-vp-sales-${n}">Many names a new VP Sales ${n}</a>`).join("")}</nav>`,
    ),
    "*": html(`<div><h3>Lee Manyard</h3><p>Head of Partnerships</p></div>`),
  },
  "offsite.test": {
    "/": html(`<nav><a href="http://other.test:${P}/leadership">Leadership</a><a href="/about">About</a></nav>`),
    "/about": (r) => {
      r.writeHead(302, { location: `http://other.test:${P}/about` });
      r.end();
    },
  },
  "other.test": { "*": html(`<div><h3>Zed Zeller</h3><p>Chief Revenue Officer</p></div>`) },
  "sitemap.test": {
    "/": html(`<main>Nothing linked here.</main>`),
    "/sitemap.xml": `<?xml version="1.0"?><urlset><url><loc>http://sitemap.test:${P}/our-leadership</loc></url><url><loc>http://sitemap.test:${P}/blog/post</loc></url><url><loc>http://elsewhere.test:${P}/team</loc></url></urlset>`,
    "/our-leadership": html(`<div><h3>Quinn Rayburn</h3><p>Chief Growth Officer</p></div>`),
  },
  "elsewhere.test": { "*": html(`<div><h3>Zed Zeller</h3><p>Chief Revenue Officer</p></div>`) },
  "promote.test": {
    "/": html(`<nav><a href="/press">Press</a></nav>`),
    "/press": html(
      `<main><article><h2><a href="/press/promote-promotes-dana-linwick-to-chief-revenue-officer">Promote promotes Dana Linwick to Chief Revenue Officer</a></h2><time datetime="2025-06-02">June 2, 2025</time></article><article><h2><a href="/press/promote-names-dana-linwick-interim-cro">Promote names Dana Linwick Interim CRO</a></h2><time datetime="2023-01-10">January 10, 2023</time></article><article><h2><a href="/press/pat-kimbrough-joins-promote-as-vp-marketing">Pat Kimbrough joins Promote as VP Marketing</a></h2></article></main>`,
    ),
    "/press/promote-promotes-dana-linwick-to-chief-revenue-officer": html(`<main><time datetime="2025-06-02">June 2, 2025</time><p>Promote today promoted Dana Linwick to Chief Revenue Officer, effective immediately.</p></main>`),
    "/press/promote-names-dana-linwick-interim-cro": html(`<main><p>Promote names Dana Linwick Interim CRO.</p></main>`, `<meta name="date" content="2023-01-10">`),
    "/press/pat-kimbrough-joins-promote-as-vp-marketing": html(`<main><p>Pat Kimbrough joins Promote as VP Marketing. Pat joined in 2022 after years in retail.</p></main>`),
  },
  "moved.test": {
    "/": (r) => {
      r.writeHead(301, { location: `http://bigco.test:${P}/` });
      r.end();
    },
  },
  "bigco.test": { "*": html(`<div><h3>Zed Zeller</h3><p>Chief Revenue Officer</p></div>`) },
  "open.test": { "/": html(`<main><div><h3>Zed Zeller</h3><p>VP Sales</p></div></main>`) },
};
function send(r: ServerResponse, body: string, status = 200, type = "text/html; charset=utf-8") {
  r.writeHead(status, { "content-type": type });
  r.end(body);
}
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  const p = (req.url ?? "/").replace(/\?.*$/, "");
  seen.push({ host, path: p, ua: String(req.headers["user-agent"] ?? "") });
  const site = sites[host];
  if (!site) return send(res, "no such site", 404, "text/plain");
  const h = site[p] ?? (p === "/robots.txt" || p === "/sitemap.xml" ? undefined : site["*"]);
  if (h === undefined) return send(res, "not here", 404, "text/plain");
  if (typeof h === "function") return h(res);
  return send(res, h, 200, p === "/robots.txt" ? "text/plain" : p.endsWith(".xml") ? "application/xml" : "text/html; charset=utf-8");
});
await new Promise<void>((ok) => server.listen(PORT, "127.0.0.1", ok));
const resolve = async () => ["127.0.0.1"];
const fo = { resolve, allow: { loopback: true, port: PORT }, timeoutMs: 1500 };
const hostSeen = (h: string) => seen.filter((s) => s.host === h);
const pagesAt = (h: string) => hostSeen(h).filter((s) => !["/", "/robots.txt", "/sitemap.xml"].includes(s.path));

/* ---------- one company at a time ---------- */
console.log("\nOne company (mock sites on localhost)");

const { leadersOne, runLeaders, PAGE_CAP } = await import("../lib/leaders/run");
const one = (companyId: string, domain: string) => leadersOne({ companyId, name: companyId, domain, prev: null }, { fetch: fo, delayMs: 0, now: at(0)() });
const sorted = (o: Record<string, string>) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
const summary = (fns: Record<string, { level: string; kind: string; since?: string; how: string }>) =>
  sorted(Object.fromEntries(Object.entries(fns).map(([k, v]) => [k, `${v.level}/${v.kind}/${v.since ?? "-"}/${v.how}`])));

let o = await one("c_true", "truedialog.test");
eq(
  "TrueDialog: a full-time CMO & CRO since Mar 2024 (press release), a VP Customer Success (team page); the CEO and the manager left out",
  summary(o.functions),
  sorted({ Marketing: "C-level/full-time/2024-03/press release", Sales: "C-level/full-time/2024-03/press release", "Customer Success": "VP/full-time/-/team page" }),
);
check("  found the leadership page through the about page, and the release through the newsroom", o.team && o.press && o.pages === 4 && pagesAt("truedialog.test").some((s) => s.path === "/about-us/leadership"), [o.pages, pagesAt("truedialog.test").map((s) => s.path)]);
check("  never read the careers page, or a press item that names no appointment", !hostSeen("truedialog.test").some((s) => s.path === "/careers" || s.path === "/news/product-launch"), hostSeen("truedialog.test").map((s) => s.path));
check("  the stored page is never an address that spells a name", Object.values(o.functions).every((l) => !/jane|zabriskie/i.test(l.url)) && o.functions.Sales.url.endsWith("/newsroom"), Object.values(o.functions).map((l) => l.url));
check("  every request sent the plain User-Agent", hostSeen("truedialog.test").every((s) => s.ua.startsWith("Merlin-About/1.0")), hostSeen("truedialog.test").map((s) => s.ua));

o = await one("c_ld", "jsonld.test");
eq("JSON-LD: a fractional CFO and an interim head of marketing, the account executive left out", summary(o.functions), sorted({ Marketing: "Head/interim/-/team page", Finance: "C-level/fractional/-/team page" }));
check("  with no links, the guessed paths stay under the cap", pagesAt("jsonld.test").length <= PAGE_CAP, pagesAt("jsonld.test").map((s) => s.path));

o = await one("c_cards", "cards.test");
eq("team cards: advisory CMO, part-time VP Sales since 2023, Director of RevOps; former and below-lead left out", summary(o.functions), sorted({ Sales: "VP/part-time/2023/team page", Marketing: "C-level/advisor/-/team page", RevOps: "Director/full-time/-/team page" }));

o = await one("c_robots", "robots.test");
check("robots.txt refuses /team: never requested, counted, nothing found", !hostSeen("robots.test").some((s) => s.path === "/team") && o.robots >= 1 && o.status === "none", [o, hostSeen("robots.test").map((s) => s.path)]);
o = await one("c_robotsall", "robotsall.test");
eq("robots.txt refuses everything: left alone", [o.status, o.why, hostSeen("robotsall.test").map((s) => s.path)], ["skipped", "robots.txt disallows", ["/robots.txt"]]);

o = await one("c_many", "many.test");
check(`at most ${PAGE_CAP} pages besides the homepage`, pagesAt("many.test").length === PAGE_CAP && o.pages === PAGE_CAP, pagesAt("many.test").map((s) => s.path));
check("  the leadership page first, then the releases", pagesAt("many.test")[0]?.path === "/leadership" && pagesAt("many.test").slice(1).every((s) => s.path.startsWith("/news/many-names")), pagesAt("many.test").map((s) => s.path));

o = await one("c_off", "offsite.test");
check("same site only: a link to another site is never followed", !hostSeen("other.test").some((s) => s.path === "/leadership"), hostSeen("other.test"));
eq("  and a page that redirects off the site is not read", [o.status, o.pages, Object.keys(o.functions)], ["none", 0, []]);

o = await one("c_map", "sitemap.test");
eq("sitemap.xml leads to the leadership page", summary(o.functions), { Growth: "C-level/full-time/-/team page" });
check("  never a sitemap entry on another site", hostSeen("elsewhere.test").length === 0, hostSeen("elsewhere.test"));

o = await one("c_promo", "promote.test");
eq("press releases: promoted to CRO in Jun 2025 wins over Interim CRO in 2023; joins as VP Marketing, joined in 2022", summary(o.functions), sorted({ Sales: "C-level/full-time/2025-06/press release", Marketing: "VP/full-time/2022/press release" }));
check("  the addresses kept spell no name", Object.values(o.functions).every((l) => !/dana|linwick|kimbrough|\bpat\b/i.test(l.url)), Object.values(o.functions).map((l) => l.url));

o = await one("c_moved", "moved.test");
eq("a homepage that moved to another company's site is skipped", [o.status, o.why, Object.keys(o.functions)], ["skipped", "redirects to another site", []]);

/* ---------- the run and storage ---------- */
console.log("\nRun and storage");

const table = await import("../lib/table");
const { leadersProgress } = await import("../lib/leaders/types");
const stateOnDisk = () => JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));

const targets0 = await table.leadersTargets(at(0)());
check("targets: every company with a website of its own, never a shared host or none", targets0.length === 12 && !targets0.some((t) => t.companyId === "c_noweb" || t.companyId === "c_shared"), targets0.map((t) => t.companyId));
eq("  the open role first, then member activity, then the rest", targets0.slice(0, 2).map((t) => t.companyId), ["c_open", "c_cards"]);

await table.saveLeaders([], null, at(0)());
const before = stateOnDisk();
const run1 = await runLeaders({ fetch: fo, delayMs: 0, now: at(0), scope: "all" });
eq("first run counts: total, found, none, skipped", [run1.total, run1.found, run1.none, run1.skipped, run1.failed], [12, 7, 3, 2, 0]);
eq("  robots, pages, team pages, press", [run1.robots, run1.read, run1.team > 0, run1.press > 0], [1, 10, true, true]);
eq("  functions found, fractional or interim, full-time", [run1.functions, run1.fractional, run1.fullTime], [13, 2, 9]);
const st = stateOnDisk();
const strip = (x: Record<string, unknown>) => JSON.stringify({ ...x, leaders: undefined, leadersRun: undefined });
check("the run changed the state's leaders and nothing else", strip(st) === strip(before));
eq("TrueDialog on file", { status: st.leaders.c_true.status, fns: summary(st.leaders.c_true.functions) }, { status: "found", fns: sorted({ Marketing: "C-level/full-time/2024-03/press release", Sales: "C-level/full-time/2024-03/press release", "Customer Success": "VP/full-time/-/team page" }) });
check("  with when it was read, a hash, and the source page on its own site", st.leaders.c_true.checkedAt === at(0)() && !!st.leaders.c_true.hash && Object.values(st.leaders.c_true.functions as Record<string, { url: string }>).every((l) => l.url.startsWith(`http://truedialog.test:${P}/`)));
eq("no names stored anywhere in the state", nameHits(st), []);
eq("no ledger rows: nobody earns credits", st.ledger.length, 0);

/* ---------- the product ---------- */
console.log("\nThe product");

const { deriveAll, bestFit, toggleTest, fnGap, sortRows, rowsFor } = await import("../app/post/model");
const { fnChipPlan } = await import("../app/post/display");
const view = await table.buildView("tok-sal");
eq("the view names no one", nameHits(view.companies), []);
const rec = (name: string) => view.companies.find((x) => x.name === name)!;
const tdRec = rec("TrueDialog Test");
eq(
  "the record's line",
  types.leadsLine(tdRec.leads!, new Date(NOW0)),
  `Sales: full-time CRO since Mar 2024 · Marketing: full-time CMO since Mar 2024 · Customer Success: full-time VP Customer Success · from the company's website, checked ${types.checkedWords(at(0)(), new Date(NOW0))}`,
);
check("  free: nothing in it is locked, and it costs nothing", !!tdRec.leads && view.me?.credits === 25);
const infos = deriveAll(view.companies);
const info = (name: string) => infos.find((i) => i.c.name === name)!;
const sal = view.me!;
eq("the member reads as Sales", sal.function, "Sales");
const td = info("TrueDialog Test");
const gap = info("Gap Co");
const g1 = fnGap(td, "Sales");
check("TrueDialog: in place of No fractional Sales yet, Sales led full-time since 2024", g1.gap && !!g1.led && types.ledFullTimeWords("Sales", g1.led) === "Sales led full-time since 2024", g1);
const plan = fnChipPlan(td, "Sales", { total: 3 });
check("  the table's chip says it (and shows with the filter on too)", plan.gap && !!plan.led && fnChipPlan(td, "Sales", { total: 3, gap: false }).led !== null, plan);
const g2 = fnGap(gap, "Sales");
check("Gap Co: still No fractional Sales yet", g2.gap && !g2.led, g2);
const bTd = bestFit(td, sal);
const bGap = bestFit(gap, sal);
check("best fit ranks TrueDialog below Gap Co", bTd.score < bGap.score && /Sales led full-time since 2024/.test(bTd.reason) && /no Sales seat/.test(bGap.reason), [bTd, bGap]);
const notMine = toggleTest("notMine", sal);
const rows = rowsFor("companies", infos).filter(notMine);
const ranked = sortRows(rows, "best", false, "", { me: sal });
const order = ranked.map((r) => r.i.c.name);
check("No fractional Sales yet keeps both, Gap Co first", order.includes("TrueDialog Test") && order.includes("Gap Co") && order.indexOf("Gap Co") < order.indexOf("TrueDialog Test"), order);
const ld = info("Ledger Co");
check("a fractional CFO on the team counts as a fractional hire: Ledger Co is in No fractional Sales yet", rows.some((r) => r.i.c.name === "Ledger Co"), order);
const fay = (await table.buildView("tok-fay")).me!;
const ldFay = fnGap(ld, "Finance");
check("  and for a fractional CFO it reads Fractional CFO on the team, not a gap", !ldFay.gap && !!ldFay.team && types.onTheTeamWords(ldFay.team) === "Fractional CFO on the team" && !toggleTest("notMine", fay)({ key: ld.c.id, i: ld }), ldFay);
check("  and best fit says so", /fractional CFO on the team/.test(bestFit(ld, fay).reason), bestFit(ld, fay).reason);

// A hidden company shows the line, without a link to its site.
const openRec = (await table.buildView("tok-sal")).companies.find((x) => x.id && x.hidden);
check("a hidden company shows who leads, with no page address", !!openRec?.leads && openRec.leads.fns.length === 1 && openRec.leads.fns.every((l) => !l.url), openRec?.leads);

// The Claude connector.
const tools = await import("../lib/mcp/tools");
const ctx = { member: (await table.memberForToken("tok-sal"))!, origin: "https://post.example.com" };
const s1 = (await tools.searchCompanies(ctx, { no_function_yet: "Sales", limit: 25 })) as { companies: { name: string; who_leads?: string[]; who_leads_source?: string; no_function_yet_note?: string }[] };
const names1 = s1.companies.map((x) => x.name);
check("connector: no_function_yet lists Gap Co before TrueDialog, with a note", names1.indexOf("Gap Co") >= 0 && names1.indexOf("Gap Co") < names1.indexOf("TrueDialog Test") && s1.companies.find((x) => x.name === "TrueDialog Test")?.no_function_yet_note === "Sales led full-time since 2024 (company website)", s1.companies);
const g = (await tools.getCompany(ctx, { company: "TrueDialog Test" })) as { who_leads?: string[]; who_leads_source?: string };
eq("connector: the company carries the same lines", [g.who_leads, /^Company website, checked /.test(g.who_leads_source ?? "")], [["Sales: full-time CRO since Mar 2024", "Marketing: full-time CMO since Mar 2024", "Customer Success: full-time VP Customer Success"], true]);
eq("connector output names no one", nameHits([s1, g]), []);
check("the line names its source as the company website and no other", !/linked\s*in|navigator/i.test(JSON.stringify([tdRec.leads, g.who_leads, g.who_leads_source, types.leadsLine(tdRec.leads!)])));

// The next-client radar's "no fractional Sales yet" line.
const { matchWhy, signalsFor } = await import("../lib/radar/match");
const sigOf = (key: string, extra: Record<string, unknown> = {}) =>
  ({ key, kind: "adjacent", companyId: "c", at: at(0)(), atMs: NOW0, fn: "Finance", title: null, co: { name: "x", industry: "Software", employees: null, revenue: null, country: null, region: null }, hiredFns: ["Finance"], ...extra }) as unknown as Parameters<typeof matchWhy>[0];
const prof = { memberId: "m2", fn: "Sales", icp: { industries: ["Software"], employees: [], revenue: [], countries: [] }, before: ["Finance"], beforeFromMember: true };
eq(
  "radar: a full-time leader on the site is said in place of no fractional Sales yet, and comes after",
  [matchWhy(sigOf("a"), prof), matchWhy(sigOf("b", { ledFullTime: { Sales: "2024" } }), prof), matchWhy(sigOf("c", { hiredFns: ["Finance", "Sales"] }), prof), signalsFor([sigOf("b", { ledFullTime: { Sales: "2024" }, atMs: NOW0 + 1 }), sigOf("a")], prof).map((x) => x.key)],
  ["Finance usually comes before Sales, and they have no fractional Sales yet", "Finance usually comes before Sales. Sales led full-time since 2024", null, ["a", "b"]],
);

/* ---------- Pilot metrics ---------- */
console.log("\nPilot metrics");

const admin = (await table.buildView("tok-ada")).admin?.leaders;
check("the counts", !!admin && admin.onFile.read === 10 && admin.onFile.functions === 13 && admin.onFile.fractional === 2 && admin.onFile.fullTime === 9 && admin.onFile.robots === 1 && admin.onFile.skipped === 1 && admin.onFile.team > 0 && admin.onFile.press > 0 && admin.due === 0 && admin.enabled === false, admin);
check("  the run's counts", !!admin?.run && admin.run.total === 12 && admin.run.done === 12 && !!admin.run.endedAt, admin?.run);
check("  why some were not read", !!admin && admin.reasons.some((r) => r.why === "robots.txt disallows") && admin.reasons.some((r) => r.why === "redirects to another site"), admin?.reasons);
check("no admin block for a member", !(await table.buildView("tok-sal")).admin);

/* ---------- again later ---------- */
console.log("\nAgain later");

const run2 = await runLeaders({ fetch: fo, delayMs: 0, now: at(1), scope: "all" });
eq("resumable: a run the next day has nothing to do", run2.total, 0);
const run3 = await runLeaders({ fetch: fo, delayMs: 0, now: at(31), scope: "all" });
eq("nothing found, skipped or failed: tried again after 30 days", run3.total, 5);
const run4 = await runLeaders({ fetch: fo, delayMs: 0, now: at(92), scope: "next", limit: 3 });
eq("leaders on file: read again after 90 days; a run takes the next N", run4.total, 3);
// TrueDialog's press page moves on: the release stays on file.
sites["truedialog.test"]["/newsroom"] = html(`<main><p>Nothing new.</p></main>`);
const run5 = await runLeaders({ fetch: fo, delayMs: 0, now: at(200), scope: "all" });
check("a later read that no longer reaches the release keeps its since", run5.total > 0 && stateOnDisk().leaders.c_true.functions.Sales.since === "2024-03", stateOnDisk().leaders.c_true.functions.Sales);

/* ---------- triggers ---------- */
console.log("\nTriggers");

const tryAct = async (token: string, scope?: "next" | "all") => {
  try {
    return (await table.perform(token, { type: "leadersNow", ...(scope ? { scope } : {}) })).message;
  } catch (e) {
    return `refused: ${e instanceof Error ? e.message : String(e)}`;
  }
};
const snap = readFileSync(path.join(dir, "intel.json"), "utf8");
const seenBefore = seen.length;
check("a member can't start it", (await tryAct("tok-sal")).startsWith("refused: Only admins"));
check("an admin can't start it while RN_LEADERS is off", (await tryAct("tok-ada")).includes("RN_LEADERS=1"));
await new Promise((r) => setTimeout(r, 200));
check("  and nothing ran and nothing changed", !leadersProgress.running && seen.length === seenBefore && readFileSync(path.join(dir, "intel.json"), "utf8") === snap);
await table.runScan(undefined, { collect: async () => ({ roles: [], all: [], sources: [] }) });
await new Promise((r) => setTimeout(r, 300));
check("the weekly scan never starts it", seen.length === seenBefore && stateOnDisk().leadersRun.startedAt === at(200)(), stateOnDisk().leadersRun.startedAt);
process.env.RN_LEADERS = "1";
const prevRun = leadersProgress.run;
const started = await tryAct("tok-ada", "next");
check("an admin starts it with RN_LEADERS=1 (the next 200)", started.startsWith("Started on the next 200"), started);
for (let i = 0; i < 200 && (leadersProgress.run === prevRun || leadersProgress.running); i++) await new Promise((r) => setTimeout(r, 50));
check("  it ran to the end (nothing was due)", leadersProgress.run !== prevRun && !leadersProgress.running && leadersProgress.run?.total === 0 && leadersProgress.run?.scope === "next", leadersProgress.run);
check("  all companies too", (await tryAct("tok-ada", "all")).startsWith("Started on every company due"));
for (let i = 0; i < 200 && leadersProgress.running; i++) await new Promise((r) => setTimeout(r, 50));
delete process.env.RN_LEADERS;

eq("in the end, still no names in the state", nameHits(stateOnDisk()), []);

server.close();
server.closeAllConnections?.();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? "FAILED" : "passed"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
