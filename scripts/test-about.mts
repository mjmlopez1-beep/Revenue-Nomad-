/**
 * Checks of the About filler (lib/about): reading a description out of a homepage, the safety
 * rules for fetching one, and how the texts are stored. Nothing leaves the machine: homepages
 * come from a mock server on localhost, and names resolve through a table here.
 *
 *   ABOUT_PORT=4952 npx tsx scripts/test-about.mts
 *
 * ABOUT_PORT is where the mock server listens (4952 when not given). The storage checks run
 * lib/table.ts in this process on a made-up seed in a temporary data folder.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { gzipSync } from "node:zlib";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const PORT = Number(process.env.ABOUT_PORT || 4952);
const dir = mkdtempSync(path.join(tmpdir(), "rn-about-"));
const seed = {
  builtAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  members: [
    { id: "m1", name: "Ada Admin", email: "ada@example.com", title: "Founder", token: "tok-ada" },
    { id: "m2", name: "Sal Sales", email: "sal@example.com", title: "Fractional VP Sales", token: "tok-sal" },
  ],
  companies: [
    { id: "c_meta", fields: { name: "Acme Meta", website: "meta.test" } },
    { id: "c_seeded", fields: { name: "Seeded Co", website: "og.test", about: "Seeded Co makes the original seed text that must never be replaced by a website." } },
    { id: "c_admin", fields: { name: "Admin Co", website: "ld.test" } },
    { id: "c_parked", fields: { name: "Parked Co", website: "parked.test" } },
    { id: "c_slow", fields: { name: "Slow Co", website: "https://www.slow.test/home" } },
    { id: "c_noweb", fields: { name: "No Web Co" } },
    { id: "c_shared", fields: { name: "Shared Co", website: "linkedin.com/company/shared-co" } },
  ],
  engagements: [{ id: "e_meta_sal", companyId: "c_meta", fields: { source: "Published engagement", operator: "Sal Sales", function: "Sales" } }],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
// An About an admin set: the filler never replaces it.
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    companies: [], engagements: [], contacts: [], unlocks: {}, verifications: {}, members: [], ledger: [], profiles: {}, follows: {},
    referralPaid: [], reportLog: [], held: [], benchRates: [], signals: [], notMine: {}, seen: {},
    scan: { lastRunAt: null, sources: [], roles: {} }, digest: { lastSentAt: null, sent: 0, members: {} }, flags: {},
    values: { "c_admin.about": { value: "Admin Co is described here by an admin, and that text stays as it is.", by: "m1", at: new Date().toISOString(), status: "live" } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "ada@example.com",
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RN_ABOUT", "RN_SCAN_TEST", "RN_ABOUT_TEST_PORT", "RESEND_API_KEY", "RN_EMAIL_FROM", "RN_SCAN"]) delete process.env[k];

const { extractAbout, capText, cleanText, junkReason, pageJunk } = await import("../lib/about/extract");
const { addressAllowed, fetchHomepage, publicName, registrable, robotsAllowsRoot, testAllowance, MAX_BYTES, TIMEOUT_MS, ABOUT_UA } = await import("../lib/about/fetch");

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

/* ---------- reading a description ---------- */
console.log("\nExtract");

const page = (head: string, body = "") => `<!doctype html><html><head><title>Home</title>${head}</head><body>${body}</body></html>`;
const LONG = "Acme Meta builds and ships warehouse robots for mid-size retailers across North America, with service crews in twelve cities.";

let x = extractAbout(page(`<meta name="description" content="Acme Meta builds &amp; ships warehouse robots for mid-size retailers.">`), "Acme Meta");
check("meta description wins", x.ok && x.from === "meta" && x.text === "Acme Meta builds & ships warehouse robots for mid-size retailers.", x);
x = extractAbout(page(`<meta content='Robots &#8212; for retail &#x2014; since 2009, from Ohio to Oregon and beyond.' property="og:description">`), "Acme");
check("og:description when there is no meta description (attribute order, entities)", x.ok && x.from === "og" && x.text === "Robots — for retail — since 2009, from Ohio to Oregon and beyond.", x);
x = extractAbout(page(`<meta name="twitter:description" content="Payroll software for restaurants with more than one location.">`), "Payco");
check("twitter:description next", x.ok && x.from === "twitter", x);
x = extractAbout(
  page(`<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":["Organization"],"name":"Ldco","description":"Ldco runs cold-chain logistics for biotech labs in Europe."}]}</script>`),
  "Ldco",
);
check("JSON-LD Organization description (inside @graph)", x.ok && x.from === "jsonld" && x.text.startsWith("Ldco runs cold-chain"), x);
x = extractAbout(
  page("", `<nav><p>Home About Services Contact Blog Careers Pricing Login and more links here to fill the space up</p></nav><main><p>Short intro.</p><p>We use cookies to give you the best experience on our website, and you can change your cookie settings at any time.</p><p>${LONG} <b>Founded</b> in 2009.</p></main>`),
  "Acme Meta",
);
check("first substantial <p> in main (skips nav, short and cookie paragraphs)", x.ok && x.from === "paragraph" && x.text === `${LONG} Founded in 2009.`, x);
x = extractAbout(page(`<meta name="description" content="Acme.">`, `<p>${LONG}</p>`), "Acme Meta");
check("a junk meta falls through to the paragraph", x.ok && x.from === "paragraph", x);
x = extractAbout(page(`<meta name="description" content="Acme Meta.">`), "Acme Meta");
eq("too short", x, { ok: false, reason: "too short" });
eq("parked page", extractAbout(page(`<meta name="description" content="${LONG}">`, "<h1>This domain is for sale!</h1><p>Make an offer today.</p>"), "Acme"), { ok: false, reason: "parked domain" });
eq("parked at Sedo", extractAbout(page("", "<p>The domain acme.com may be for sale. Click here to inquire about this domain. Sedo maintains no relationship with third party advertisers.</p>"), "Acme").ok, false);
eq("GoDaddy parked page", pageJunk(page("", "<p>Parked courtesy of GoDaddy.com. Get this domain.</p>")), "parked domain");
eq("a GoDaddy website builder site is fine", pageJunk(page(`<meta name="description" content="${LONG}">`, "<footer>Powered by GoDaddy Website Builder</footer>")), null);
eq("Cloudflare challenge", extractAbout(`<html><head><title>Just a moment...</title></head><body><div id="cf-wrapper">Checking if the site connection is secure</div><script src="/cdn-cgi/challenge-platform/h/b/orchestrate"></script></body></html>`, "Acme"), { ok: false, reason: "bot challenge" });
eq("captcha", pageJunk(`<title>Verify you are human</title>`), "bot challenge");
eq("a contact form with reCAPTCHA is not a challenge", pageJunk(page(`<meta name="description" content="${LONG}">`, `<form><div class="g-recaptcha"></div></form>`)), null);
eq("access denied", pageJunk(`<title>Access Denied</title><body>You don't have permission to access this server.</body>`), "access denied");
eq("login wall", pageJunk(`<title>Sign in to continue</title>`), "login wall");
eq("server default page", pageJunk(`<title>Welcome to nginx!</title>`), "server default page");
eq("cookie-only text", junkReason("We use cookies to improve your experience. By using our website you accept all cookies.", "Acme"), "cookie notice");
eq("lorem ipsum", junkReason("Lorem ipsum dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.", "Acme"), "placeholder text");
eq("just the company name", junkReason("Welcome to the Official Website of Acme Robotics Inc. | Home", "Acme Robotics"), "just the company name");
eq("a nav list", junkReason("Home | About Us | Services | Products | Contact | Careers", "Acme"), "navigation list");
eq("a nav list without separators", junkReason("Home About Services Products Pricing Blog Careers Contact Login", "Acme"), "navigation list");
eq("WordPress default", junkReason("Just another WordPress site with a longer tail of words", "Acme"), "placeholder text");
x = extractAbout(page(`<meta name="description" content="Wir entwickeln Lagerroboter für den Einzelhandel in Deutschland, Österreich und der Schweiz.">`), "Lagerco");
check("non-English text is kept", x.ok && x.text.includes("Österreich"), x);
x = extractAbout(page(`<meta name="description" content="Acme   Meta\n\t builds <b>robots</b> &lt;br&gt; for   retail and logistics teams everywhere.">`), "Acme Meta");
check("tags out, whitespace collapsed", x.ok && x.text === "Acme Meta builds robots for retail and logistics teams everywhere.", x);
eq("no description at all", extractAbout(page("", "<div>Hi</div>"), "Acme"), { ok: false, reason: "no description" });
const longText = Array.from({ length: 12 }, (_, i) => `Sentence number ${i + 1} says something useful about the company and its customers.`).join(" ");
const capped = capText(longText);
check("cut at about 500 characters, on a sentence", capped.length <= 500 && capped.length > 400 && capped.endsWith("."), capped.length);
const noStops = "word ".repeat(200).trim();
check("no sentence to cut at: cut at a word, with an ellipsis", capText(noStops).length <= 500 && capText(noStops).endsWith("…"), capText(noStops).slice(-10));
eq("entities decoded once more when doubled", cleanText("Tom &amp;amp; Jerry"), "Tom & Jerry");

/* ---------- addresses and robots ---------- */
console.log("\nAddresses, names and robots.txt");

for (const [ip, ok] of [
  ["8.8.8.8", true], ["93.184.216.34", true], ["127.0.0.1", false], ["10.1.2.3", false], ["172.16.0.1", false], ["172.32.0.1", true],
  ["192.168.1.1", false], ["169.254.169.254", false], ["100.64.0.1", false], ["0.0.0.0", false], ["224.0.0.1", false], ["255.255.255.255", false],
  ["198.18.0.1", false], ["::1", false], ["::", false], ["fe80::1", false], ["fd00::1", false], ["fc00::5", false], ["ff02::1", false],
  ["::ffff:127.0.0.1", false], ["::ffff:169.254.169.254", false], ["::ffff:8.8.8.8", true], ["64:ff9b::a00:1", false], ["2002:c0a8:0101::1", false],
  ["2001:db8::1", false], ["2606:4700:4700::1111", true], ["fd00:ec2::254", false], ["not-an-ip", false],
] as [string, boolean][])
  eq(`${ip} ${ok ? "allowed" : "refused"}`, addressAllowed(ip), ok);
eq("loopback only with the test allowance", [addressAllowed("127.0.0.1", true), addressAllowed("::1", true), addressAllowed("10.0.0.1", true)], [true, true, false]);
eq("registrable domains", [registrable("www.acme.com"), registrable("shop.acme.co.uk"), registrable("acme.io")], ["acme.com", "acme.co.uk", "acme.io"]);
eq("public names", [publicName("acme.com"), publicName("printer.local"), publicName("metadata.google.internal"), publicName("localhost"), publicName("10.0.0.1")], [true, false, false, false, false]);
eq("robots: Disallow / for *", robotsAllowsRoot("User-agent: *\nDisallow: /\n"), false);
eq("robots: Disallow / for our agent", robotsAllowsRoot("User-agent: Merlin-About\nDisallow: /\n\nUser-agent: *\nAllow: /\n"), false);
eq("robots: our group allows though * does not", robotsAllowsRoot("User-agent: *\nDisallow: /\n\nUser-agent: merlin-about\nDisallow:\n"), true);
eq("robots: another bot's Disallow does not apply", robotsAllowsRoot("User-agent: BadBot\nDisallow: /\n"), true);
eq("robots: a deeper Disallow leaves / alone", robotsAllowsRoot("User-agent: *\nDisallow: /admin/\n"), true);
eq("robots: Allow / beats Disallow / for the same length", robotsAllowsRoot("User-agent: *\nDisallow: /\nAllow: /\n"), true);
eq("test allowance is not read without RN_SCAN_TEST=1", (process.env.RN_ABOUT_TEST_PORT = String(PORT), testAllowance()), undefined);
process.env.RN_SCAN_TEST = "1";
eq("test allowance with RN_SCAN_TEST=1", testAllowance(), { loopback: true, port: PORT });
delete process.env.RN_SCAN_TEST;
delete process.env.RN_ABOUT_TEST_PORT;
eq("limits: 8 seconds, 512 KB", [TIMEOUT_MS, MAX_BYTES], [8000, 524288]);
check("plain User-Agent with no personal data", ABOUT_UA === "Merlin-About/1.0 (+https://revenuenomad.com)", ABOUT_UA);

/* ---------- the mock web ---------- */

const html = (head: string, body = "") => page(head, body);
let metaText = "Acme Meta builds and ships warehouse robots for mid-size retailers across North America.";
const seen: { host: string; path: string; ua: string }[] = [];
let active = new Map<string, number>();
let maxActive = 0;
const sites: Record<string, (req: IncomingMessage, res: ServerResponse) => void | Promise<void>> = {
  "meta.test": (_q, r) => send(r, html(`<meta name="description" content="${metaText}">`)),
  "www.meta.test": (_q, r) => send(r, html(`<meta name="description" content="${metaText}">`)),
  "og.test": (_q, r) => send(r, html(`<meta property="og:description" content="Seeded Co sells the og text, which must not replace the seed's About.">`)),
  "ld.test": (_q, r) => send(r, html(`<script type="application/ld+json">{"@type":"Organization","description":"Admin Co ships the JSON-LD text that must not replace the admin's About."}</script>`)),
  "para.test": (_q, r) => send(r, html("", `<main><p>Hi.</p><p>${LONG}</p></main>`)),
  "parked.test": (_q, r) => send(r, html("", "<h1>parked.test</h1><p>This domain is for sale. Buy this domain today.</p>")),
  "cf.test": (_q, r) => send(r, `<html><head><title>Just a moment...</title></head><body><script src="/cdn-cgi/challenge-platform/x"></script></body></html>`, 403),
  "short.test": (_q, r) => send(r, html(`<meta name="description" content="Short Co.">`)),
  "huge.test": (_q, r) => {
    r.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    r.write(html(`<meta name="description" content="${LONG}">`, "<p>"));
    const chunk = "x".repeat(64 * 1024);
    let sent = 0;
    const more = () => {
      while (sent < 3 * 1024 * 1024) {
        sent += chunk.length;
        if (!r.write(chunk)) return r.once("drain", more);
      }
      r.end("</p></body></html>");
    };
    r.on("error", () => {});
    more();
  },
  "json.test": (_q, r) => send(r, JSON.stringify({ description: LONG }), 200, "application/json"),
  "redir.test": (_q, r) => redirect(r, `http://www.meta.test:${PORT}/`),
  "hop.test": (_q, r) => redirect(r, "http://10.0.0.8/"),
  "hopname.test": (_q, r) => redirect(r, `http://private.test:${PORT}/`),
  "hopmeta.test": (_q, r) => redirect(r, "http://169.254.169.254/latest/meta-data/"),
  "hopport.test": (_q, r) => redirect(r, "http://www.meta.test:8080/"),
  "hopfile.test": (_q, r) => redirect(r, "file:///etc/passwd"),
  "loopy.test": (q, r) => redirect(r, `http://loopy.test:${PORT}/${Number((q.url ?? "/").slice(1) || 0) + 1}`),
  "robots.test": (_q, r) => send(r, html(`<meta name="description" content="${LONG}">`)),
  "robotsmine.test": (_q, r) => send(r, html(`<meta name="description" content="${LONG}">`)),
  "slow.test": () => {},
  "www.slow.test": () => {},
  "gzip.test": (_q, r) => {
    r.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
    r.end(gzipSync(html(`<meta name="description" content="${LONG}">`)));
  },
  "latin.test": (_q, r) => {
    r.writeHead(200, { "content-type": "text/html; charset=iso-8859-1" });
    r.end(Buffer.from(html(`<meta name="description" content="Café Latin roasts coffee in München for restaurants and offices nearby.">`), "latin1"));
  },
  "gate.test": async (_q, r) => {
    await new Promise((ok) => setTimeout(ok, 120));
    send(r, html(`<meta name="description" content="${LONG}">`));
  },
  "e500.test": (_q, r) => send(r, "oops", 500, "text/plain"),
};
function send(r: ServerResponse, body: string, status = 200, type = "text/html; charset=utf-8") {
  r.writeHead(status, { "content-type": type });
  r.end(body);
}
function redirect(r: ServerResponse, to: string) {
  r.writeHead(301, { location: to });
  r.end();
}
const server = createServer(async (req, res) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  seen.push({ host, path: req.url ?? "", ua: String(req.headers["user-agent"] ?? "") });
  active.set(host, (active.get(host) ?? 0) + 1);
  maxActive = Math.max(maxActive, active.get(host)!);
  res.on("close", () => active.set(host, (active.get(host) ?? 1) - 1));
  if (req.url === "/robots.txt") {
    if (host === "robots.test") return send(res, "User-agent: *\nDisallow: /\n", 200, "text/plain");
    if (host === "robotsmine.test") return send(res, "User-agent: Merlin-About/1.0\nDisallow: /\n\nUser-agent: *\nAllow: /\n", 200, "text/plain");
    if (host === "slow.test" || host === "www.slow.test") return; // robots hangs too
    if (host === "gate.test") return send(res, "User-agent: *\nAllow: /\n", 200, "text/plain");
    return send(res, "not here", 404, "text/plain");
  }
  const site = sites[host];
  if (!site) return send(res, "no such site", 404, "text/plain");
  await site(req, res);
});
await new Promise<void>((ok) => server.listen(PORT, "127.0.0.1", ok));

const NAMES: Record<string, string> = { "private.test": "10.0.0.8", "metaip.test": "169.254.169.254", "v6loop.test": "::1" };
const resolve = async (host: string) => [NAMES[host] ?? "127.0.0.1"];
const allow = { loopback: true, port: PORT };
const fo = { resolve, allow, timeoutMs: 600 };
const get = (d: string, o: Record<string, unknown> = fo) => fetchHomepage(d, o);

/* ---------- fetching ---------- */
console.log("\nFetch (mock server on localhost)");

let p = await get("meta.test");
check("reads a homepage", p.ok && p.html.includes("warehouse robots") && p.host === "meta.test", p);
check("sends the plain User-Agent", seen.some((s) => s.host === "meta.test" && s.ua === ABOUT_UA), seen.slice(-2));
check("reads robots.txt first", seen.findIndex((s) => s.host === "meta.test" && s.path === "/robots.txt") < seen.findIndex((s) => s.host === "meta.test" && s.path === "/"), seen.slice(-2));
p = await get("redir.test");
check("follows a redirect to the same domain (www)", p.ok && p.host === "www.meta.test", p);
eq("refuses a redirect to a private IP", await get("hop.test"), { ok: false, kind: "skipped", reason: "private address" });
eq("refuses a redirect to a name that resolves to a private IP", await get("hopname.test"), { ok: false, kind: "skipped", reason: "private address" });
eq("refuses a redirect to the metadata address", await get("hopmeta.test"), { ok: false, kind: "skipped", reason: "private address" });
eq("refuses a redirect to another port", await get("hopport.test"), { ok: false, kind: "skipped", reason: "port not allowed" });
eq("refuses a redirect to file:", await get("hopfile.test"), { ok: false, kind: "skipped", reason: "not http" });
eq("stops after 3 redirects", await get("loopy.test"), { ok: false, kind: "skipped", reason: "too many redirects" });
check("  and made only 4 page requests there", seen.filter((s) => s.host === "loopy.test" && s.path !== "/robots.txt").length === 4, seen.filter((s) => s.host === "loopy.test").length);
eq("a name resolving to 127.0.0.1 is refused without the test allowance", await get("meta.test", { resolve, timeoutMs: 600 }), { ok: false, kind: "skipped", reason: "private address" });
eq("::1 is refused without the test allowance", await get("v6loop.test", { resolve, timeoutMs: 600 }), { ok: false, kind: "skipped", reason: "private address" });
eq("a name resolving to the metadata address is refused", await get("metaip.test", { resolve, timeoutMs: 600 }), { ok: false, kind: "skipped", reason: "private address" });
const before = seen.length;
await get("meta.test", { resolve, timeoutMs: 600 });
check("  and nothing was requested", seen.length === before, seen.slice(before));
eq("robots.txt Disallow / for *", await get("robots.test"), { ok: false, kind: "skipped", reason: "robots.txt disallows" });
eq("robots.txt Disallow / for our agent", await get("robotsmine.test"), { ok: false, kind: "skipped", reason: "robots.txt disallows" });
check("  the page itself was never requested", !seen.some((s) => (s.host === "robots.test" || s.host === "robotsmine.test") && s.path === "/"));
eq("non-HTML", await get("json.test"), { ok: false, kind: "skipped", reason: "not html" });
eq("Cloudflare challenge (403)", await get("cf.test"), { ok: false, kind: "skipped", reason: "bot challenge" });
eq("server error is a failure", await get("e500.test"), { ok: false, kind: "failed", reason: "http 500" });
const t0 = Date.now();
eq("timeout", await get("slow.test"), { ok: false, kind: "failed", reason: "timeout" });
check("  within the time limit (robots and page)", Date.now() - t0 < 2500, Date.now() - t0);
p = await get("huge.test");
check("a huge page is cut at 512 KB", p.ok && p.truncated && p.html.length <= MAX_BYTES && p.html.length > MAX_BYTES - 70_000, p.ok ? [p.truncated, p.html.length] : p);
check("  and its description is still read", p.ok && extractAbout(p.html, "Huge").ok);
p = await get("gzip.test");
check("gzip is decompressed", p.ok && extractAbout(p.html, "Gzip").ok, p);
p = await get("latin.test");
check("a latin-1 page is decoded", p.ok && (extractAbout(p.html, "Cafe Latin") as { text?: string }).text?.includes("München") === true, p.ok ? extractAbout(p.html, "x") : p);
eq("a website that is not a host name", await get("not a domain!"), { ok: false, kind: "skipped", reason: "bad website" });

/* ---------- the run and storage ---------- */
console.log("\nRun and storage");

const table = await import("../lib/table");
const { runAbout, aboutOne, hostGates } = await import("../lib/about/run");
const { aboutProgress } = await import("../lib/about/types");
const { deriveAll, searchTest } = await import("../app/post/model");
const { readFileSync } = await import("node:fs");
const stateOnDisk = () => JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
const NOW0 = Date.now();
const at = (days: number) => () => new Date(NOW0 + days * 86_400_000).toISOString();

const targets0 = await table.aboutTargets(at(0)());
eq(
  "targets: companies with a website and no About, never a seed's or an admin's About, a shared host or no website",
  targets0.map((t) => [t.companyId, t.domain]).sort(),
  [["c_meta", "meta.test"], ["c_parked", "parked.test"], ["c_slow", "slow.test"]],
);

const run1 = await runAbout({ fetch: fo, delayMs: 0, now: at(0) });
eq("first run counts", [run1.total, run1.done, run1.filled, run1.skipped, run1.failed], [3, 3, 1, 1, 1]);
let st = stateOnDisk();
eq("the text is a live system value by website", st.values["c_meta.about"], { value: metaText, by: "website", at: at(0)(), status: "live" });
eq("status per company, with reasons and times", Object.fromEntries(Object.entries(st.about.companies as Record<string, { s: string; why?: string }>).map(([k, v]) => [k, [v.s, v.why ?? null]])), {
  c_meta: ["filled", null], c_parked: ["skipped", "parked domain"], c_slow: ["failed", "timeout"],
});
check("every status has a time", Object.values(st.about.companies as Record<string, { at: string }>).every((v) => v.at === at(0)()));
eq("no ledger rows: nobody earns credits", st.ledger.length, 0);
eq("the admin's About stays", st.values["c_admin.about"].value, "Admin Co is described here by an admin, and that text stays as it is.");
check("the seed's About is not written over", !st.values["c_seeded.about"]);
eq("last run is stored", [st.about.lastRun.total, st.about.lastRun.filled, !!st.about.lastRun.endedAt], [3, 1, true]);

// Every company is locked for a member until they unlock it (2 credits): Sal unlocks the ones he reads here that are locked for him.
let unlockedNow = 0;
{
  const named = (await table.buildView("tok-ada")).companies;
  const mine = (await table.buildView("tok-sal")).companies;
  for (const n of ["Acme Meta", "Seeded Co"]) {
    const id = named.find((c) => c.name === n)!.id;
    if (!mine.find((c) => c.id === id)?.hidden) continue;
    await table.perform("tok-sal", { type: "unlock", entity: "company", id, field: "identity" });
    unlockedNow++;
  }
}
const view = await table.buildView("tok-sal");
const co = view.companies.find((c) => c.name === "Acme Meta")!;
eq("the view carries it as a marker without the text", co.cells.about, { s: "value", v: "", ver: 0, system: true, lazy: true });
check("no About text anywhere in the view", !JSON.stringify(view).includes("warehouse robots") && !JSON.stringify(view).includes("original seed text"));
const readAbout = async (tok: string, id: string) => (await table.aboutCells(tok, [id]))?.about[id];
eq("GET ?about= gives it whole: a system value from the company website", await readAbout("tok-sal", co.id), { s: "value", v: metaText, ver: 0, system: true, from: "website" });
eq("it is not the member's fact (Me.added) and costs nothing past the company", [view.me?.added, view.me?.credits], [0, 25 - 2 * Math.max(0, unlockedNow - 1)]); // the first company of the day is free
const info = deriveAll(view.companies).find((i) => i.c.id === co.id)!;
const row = { key: co.id, i: info };
check("search does not read the About (the table no longer carries it)", !searchTest("warehou")?.(row) && !searchTest("retailers")?.(row) && !!searchTest("acme")?.(row));
const seeded = view.companies.find((c) => c.name === "Seeded Co")!;
const seededCell = await readAbout("tok-sal", seeded.id);
check("a seed About carries no website source", seededCell?.s === "value" && seededCell.v.startsWith("Seeded Co makes") && !("from" in seededCell && seededCell.from), seededCell);
eq("signed out, ?about= is nothing (the route answers 401)", await table.aboutCells("nobody", [co.id]), null);
const adminView = await table.buildView("tok-ada");
const a = adminView.admin?.about;
check("Pilot metrics: About counts", !!a && a.onFile.filled === 1 && a.onFile.skipped === 1 && a.onFile.failed === 1 && a.waiting === 0 && a.run?.done === 3 && a.enabled === false && a.running === false, a);
check("Pilot metrics: reasons", !!a && a.reasons.some((r) => r.why === "parked domain" && r.n === 1) && a.reasons.some((r) => r.why === "timeout"), a?.reasons);
check("Pilot metrics: companies with an About (seed, admin, website)", !!a && a.withAbout === 3 && a.companies === 7, a);
check("no admin block for a member", !(await table.buildView("tok-sal")).admin);

const run2 = await runAbout({ fetch: fo, delayMs: 0, now: at(1) });
eq("resumable: a run the next day has nothing to do", run2.total, 0);
const run3 = await runAbout({ fetch: fo, delayMs: 0, now: at(31) });
eq("skips and failures are tried again after 30 days", [run3.total, run3.skipped, run3.failed], [2, 1, 1]);
const run4 = await runAbout({ fetch: fo, delayMs: 0, now: at(92) });
eq("a filled text is read again after 90 days (with the other two, due again), and an unchanged site writes nothing", [run4.total, run4.unchanged, run4.filled], [3, 1, 0]);
eq("  the value keeps its first time", stateOnDisk().values["c_meta.about"].at, at(0)());
metaText = "Acme Meta now builds delivery drones for grocers, pharmacies and hardware stores in rural areas.";
const run5 = await runAbout({ fetch: fo, delayMs: 0, now: at(183) });
eq("after another 90 days a changed site replaces our own text", [run5.total, run5.filled], [3, 1]);
eq("  with the new text", stateOnDisk().values["c_meta.about"].value, metaText);
// The changed text end to end: the table still carries only the marker, and ?about= reads the new text from the state.
eq("  the table's marker is unchanged", (await table.buildView("tok-sal")).companies.find((c) => c.id === co.id)?.cells.about, { s: "value", v: "", ver: 0, system: true, lazy: true });
eq("  and ?about= gives the new text", (await readAbout("tok-sal", co.id))?.s === "value" && (await readAbout("tok-sal", co.id) as { v: string }).v, metaText);

// saveAbout never writes over an About someone else set.
eq(
  "saveAbout keeps an admin's and a seed's About",
  await table.saveAbout(
    [
      { companyId: "c_admin", s: "filled", text: "A website text that must not land.", hash: "h1" },
      { companyId: "c_seeded", s: "filled", text: "Another website text that must not land.", hash: "h2" },
    ],
    null,
  ),
  ["kept", "kept"],
);
st = stateOnDisk();
check("  both stay as they were", st.values["c_admin.about"].by === "m1" && !st.values["c_seeded.about"], [st.values["c_admin.about"], st.values["c_seeded.about"]]);
eq("  and are not read again", (await table.aboutTargets(at(400)())).map((t) => t.companyId).sort(), ["c_meta", "c_parked", "c_slow"]);

// A member can't write the About field, so no member can earn a credit there either.
let refused = "";
try {
  await table.perform("tok-sal", { type: "fill", entity: "company", id: co.id, field: "about", value: "A member's own text about the company." });
} catch (e) {
  refused = e instanceof Error ? e.message : String(e);
}
check("a member can't fill the About field", !!refused, refused);

/* ---------- politeness ---------- */
console.log("\nPoliteness");

maxActive = 0;
active = new Map();
const gate = hostGates();
const many = Array.from({ length: 5 }, (_, i) => ({ companyId: `x${i}`, name: `Gate ${i}`, domain: "gate.test", prev: null }));
await Promise.all(many.map((t) => aboutOne(t, { ...fo, hostGate: gate })));
eq("one request per host at a time", maxActive, 1);
maxActive = 0;
await Promise.all(many.map((t) => aboutOne(t, fo)));
check("  (without the gate they would overlap)", maxActive > 1, maxActive);

/* ---------- triggers ---------- */
console.log("\nTriggers");

const tryAct = async (token: string) => {
  try {
    return (await table.perform(token, { type: "aboutNow" })).message;
  } catch (e) {
    return `refused: ${e instanceof Error ? e.message : String(e)}`;
  }
};
check("a member can't start it", (await tryAct("tok-sal")).startsWith("refused: Only admins"), await tryAct("tok-sal"));
check("an admin can't start it while RN_ABOUT is off", (await tryAct("tok-ada")).includes("RN_ABOUT=1"), await tryAct("tok-ada"));
/** Until a run other than `prev` has started and ended (at most 10 seconds). */
const waitRun = async (prev: unknown) => {
  for (let i = 0; i < 200 && (aboutProgress.run === prev || aboutProgress.running); i++) await new Promise((r) => setTimeout(r, 50));
  return aboutProgress.run !== prev && !aboutProgress.running;
};
// With the switch on, the server reads homepages over http on the test port (RN_SCAN_TEST=1 only).
process.env.RN_ABOUT = "1";
process.env.RN_SCAN_TEST = "1";
process.env.RN_ABOUT_TEST_PORT = String(PORT);
// (Every company was tried "later" above, so these runs find nothing due and read no site.)
let prevRun = aboutProgress.run;
const started = await tryAct("tok-ada");
check("an admin starts it with RN_ABOUT=1", started.startsWith("Started"), started);
check("  and it ran to the end", (await waitRun(prevRun)) && !!aboutProgress.run?.endedAt, aboutProgress.run);
prevRun = aboutProgress.run;
await table.runScan(undefined, { collect: async () => ({ roles: [], all: [], sources: [] }) });
check("a weekly scan starts a run after it (RN_ABOUT=1)", await waitRun(prevRun), aboutProgress.run);
delete process.env.RN_ABOUT;
const lastAfter = stateOnDisk().about.lastRun.startedAt;
await table.runScan(undefined, { collect: async () => ({ roles: [], all: [], sources: [] }) });
await new Promise((r) => setTimeout(r, 300));
eq("no run after a scan while RN_ABOUT is off", stateOnDisk().about.lastRun.startedAt, lastAfter);

server.close();
server.closeAllConnections?.();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${failed ? "FAILED" : "passed"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
