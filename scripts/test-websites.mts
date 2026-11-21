/**
 * Checks of the website finder (lib/websites): the candidate domains a name gives, the SSRF
 * refusals (private and loopback addresses whatever DNS says, redirects to them), parked, for-sale,
 * directory and social pages turned down, a redirect to another brand turned down, the acceptance
 * rules and their confidence, never overwriting a website, the 60-day retry, a dry run writing
 * nothing, the admin's list and Undo, nothing of it visible to members, and the job's schedule
 * default and switch.
 *
 * Nothing leaves the machine: DNS and homepages are a fake layer here (made-up companies on
 * made-up .test and .example names), and the few checks of the real fetch go to a server on
 * 127.0.0.1. lib/table.ts runs in this process on a made-up seed in a temporary data folder.
 *
 *   npx tsx scripts/test-websites.mts      exits 1 on any failure
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-websites-"));
const DAY = 24 * 60 * 60 * 1000;
const longAgo = new Date(Date.now() - 400 * DAY).toISOString();
const seed = {
  builtAt: new Date(Date.now() - 2 * DAY).toISOString(),
  members: [
    { id: "m_ada", name: "Ada Admin", email: "admin-websites@example.com", title: "Founder", token: "tok-ada-web" },
    { id: "m_sal", name: "Sal Seller", email: "sal-websites@example.com", title: "Fractional VP Sales", token: "tok-sal-web" },
  ],
  companies: [
    // Found with high confidence; Sal held a seat here, so the company is Sal's own and Sal sees its website.
    { id: "c_quill", fields: { name: "Quillmoor Robotics Ltd", industry: "Manufacturing" } },
    // Found through a part of its name: medium.
    { id: "c_tern", fields: { name: "Ternwick Cyber" } },
    // Already has a website: never read.
    { id: "c_has", fields: { name: "Hasweb Analytics", website: "hasweb.example" } },
    // Every candidate parked.
    { id: "c_parked", fields: { name: "Parkly Goods" } },
    // Its domain redirects to another brand.
    { id: "c_brand", fields: { name: "Brandshift Labs" } },
    // Nothing resolves.
    { id: "c_none", fields: { name: "Zyxquorbit" } },
    // A person's own practice: named after its seat holder.
    { id: "c_practice", fields: { name: "Fenwright Robotics" } },
    // A fractional firm (lib/firms.ts name rules).
    { id: "c_firm", fields: { name: "Fractional CMO Partners" } },
    // A UK company whose .de domain is someone else's: the country conflicts.
    { id: "c_uk", fields: { name: "Brindlecombe", hq: "London, United Kingdom" } },
    // Two companies with the same name: the second never gets the first one's site.
    { id: "c_twin1", fields: { name: "Twinmarsh" } },
    { id: "c_twin2", fields: { name: "Twinmarsh" } },
    // Its homepage links its LinkedIn page; it has none yet.
    { id: "c_li", fields: { name: "Larkwhistle Health" } },
    // Has a LinkedIn page already: the found one doesn't replace it.
    { id: "c_li2", fields: { name: "Linden Ops", linkedin: "linkedin.com/company/linden-ops-own" } },
    // A website someone sets while the run is going.
    { id: "c_race", fields: { name: "Racewell Foods" } },
  ],
  engagements: [
    { id: "e_quill_sal", companyId: "c_quill", fields: { source: "Published engagement", operator: "Sal Seller", function: "Sales", role: "Fractional VP Sales" } },
    { id: "e_practice", companyId: "c_practice", fields: { source: "Seat scan", operator: "Dana Fenwright", function: "Sales" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    companies: [{ id: "c_added", name: "Fresh Newco", by: "m_sal", at: new Date(Date.now() - DAY).toISOString() }],
    engagements: [], contacts: [], unlocks: {}, verifications: {}, members: [], ledger: [], profiles: {}, follows: {},
    referralPaid: [], reportLog: [], held: [], benchRates: [], signals: [], notMine: {}, seen: {},
    scan: { lastRunAt: null, sources: [], roles: {} }, digest: { lastSentAt: null, sent: 0, members: {} }, flags: {}, values: {},
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-websites@example.com",
  RN_LOGO_LOOKUP: "off",
  RN_DIGEST: "0",
  RN_FREE_COMPANY: "off",
  RN_SCAN_TEST: "1",
});
for (const k of ["RN_WEBSITES", "RN_ABOUT", "RN_SCAN", "RN_LEADERS", "RN_FUNDING", "RN_RADAR", "RN_SCHEDULER", "RN_BILLING", "STRIPE_SECRET_KEY", "RN_REQUIRE_SEED", "RESEND_API_KEY", "RN_EMAIL_FROM", "RN_PUBLIC_URL", "RN_ABOUT_TEST_PORT"]) delete process.env[k];
// Nothing may go out: any fetch() is a failure.
let outbound = 0;
globalThis.fetch = (async () => {
  outbound++;
  return new Response("no", { status: 599 });
}) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), { got, want });

/* ---------- the fake DNS and HTTP layer ---------- */

/** Host -> addresses. A name not here does not exist (ENOTFOUND). */
const dnsTable: Record<string, string[]> = {};
const lookups: string[] = [];
const resolve = async (host: string) => {
  lookups.push(host);
  const a = dnsTable[host.toLowerCase()];
  if (!a) throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: "ENOTFOUND" });
  return a;
};
/** Domain -> what its homepage read gives (the final address after redirects, and the page). */
type Fake = { url: string; html: string } | { fail: string };
const pages: Record<string, Fake> = {};
const reads: string[] = [];
const fetchPage = async (domain: string) => {
  reads.push(domain);
  const p = pages[domain];
  if (!p) return { ok: false as const, kind: "failed" as const, reason: "connection refused" };
  if ("fail" in p) return { ok: false as const, kind: "skipped" as const, reason: p.fail };
  return { ok: true as const, url: p.url, host: new URL(p.url).hostname, status: 200, html: p.html, truncated: false };
};
const PUBLIC = ["93.184.216.34"];
const site = (domain: string, html: string, url = `https://${domain}/`) => {
  dnsTable[domain] = PUBLIC;
  pages[domain] = { url, html };
};
const html = (o: { title?: string; site?: string; h1?: string; body?: string; foot?: string; head?: string }) =>
  `<!doctype html><html><head><title>${o.title ?? ""}</title>${o.site ? `<meta property="og:site_name" content="${o.site}">` : ""}${o.head ?? ""}</head><body>${o.h1 ? `<h1>${o.h1}</h1>` : ""}<main><p>${o.body ?? "We build things for teams who need them, with care and good service, every day of the week."}</p></main><footer>${o.foot ?? ""}</footer></body></html>`;

async function main() {
  const C = await import("../lib/websites/candidates");
  const V = await import("../lib/websites/verify");
  const F = await import("../lib/websites/find");
  const S = await import("../lib/schedule");
  const types = await import("../lib/websites/types");

  /* ---------- candidates ---------- */
  console.log("\nCandidates from the name");
  const dom = (name: string, o?: Parameters<typeof C.candidates>[1]) => C.candidates(name, o).map((c) => c.domain);
  const q = dom("Quillmoor Robotics Ltd");
  eq("joined on .com first", q[0], "quillmoorrobotics.com");
  check("a legal suffix is dropped (Ltd), and says the United Kingdom: .co.uk next", q[1] === "quillmoorrobotics.co.uk", q.slice(0, 4));
  check("hyphenated soon after", q.indexOf("quillmoor-robotics.com") > 0 && q.indexOf("quillmoor-robotics.com") < 5, q.slice(0, 6));
  check("never more than 40", q.length <= C.MAX_CANDIDATES && C.MAX_CANDIDATES === 40, q.length);
  check("the generic TLDs in the stated order after .com and the country's", ["io", "co", "ai", "net", "org", "tech", "health", "app"].every((t, i, a) => i === 0 || q.indexOf(`quillmoorrobotics.${a[i - 1]}`) < q.indexOf(`quillmoorrobotics.${t}`)), q);
  check("the first word alone, later", q.includes("quillmoor.com") && q.indexOf("quillmoor.com") > q.indexOf("quillmoorrobotics.app"), q);
  check("with get, try, hq, app and labs", ["getquillmoorrobotics.com", "tryquillmoorrobotics.com", "quillmoorroboticshq.com", "quillmoorroboticsapp.com", "quillmoorroboticslabs.com"].every((d) => q.includes(d)), q);
  eq("& is and, accents go, punctuation goes", dom("Bäcker & Sons GmbH").slice(0, 2), ["backerandsons.com", "backerandsons.de"]);
  check("  and & left out is tried too", dom("Bäcker & Sons GmbH").includes("backersons.com"));
  for (const [suffix, name] of [["Inc", "Corvane Inc"], ["LLC", "Corvane, LLC"], ["BV", "Corvane B.V."], ["SAS", "Corvane SAS"], ["S.r.l.", "Corvane S.r.l."], ["AG", "Corvane AG"], ["plc", "Corvane plc"], ["Corp", "Corvane Corp."], ["Holdings", "Corvane Holdings"], ["Group", "Corvane Group"]] as const)
    eq(`  ${suffix} dropped`, dom(name)[0], "corvane.com");
  eq("the HQ's country decides its TLD", dom("Corvane", { country: "France" }).slice(0, 2), ["corvane.com", "corvane.fr"]);
  eq("  Australia is .com.au", dom("Corvane", { country: "Australia" })[1], "corvane.com.au");
  check("  with an HQ on file, no other country's TLD", !dom("Corvane GmbH", { country: "France" }).some((d) => d.endsWith(".de")), dom("Corvane GmbH", { country: "France" }));
  check("no country on file: .co.uk is tried after the generic ones", dom("Corvane").includes("corvane.co.uk") && dom("Corvane").indexOf("corvane.co.uk") > dom("Corvane").indexOf("corvane.ai"), dom("Corvane"));
  eq("a name written as a domain is tried as it is, first", dom("Vexmont.energy")[0], "vexmont.energy");
  check("a name ending in a TLD word: the domain hack", dom("RevQuillPro").includes("revquill.pro"), dom("RevQuillPro").slice(0, 6));
  check("initials of a long name", dom("International Widget Standards Organisation").includes("iwso.com"));
  check("a tagline after a dash is a second name", dom("Fattoria Bellucci - Cantina Morandi").includes("cantinamorandi.com"));
  check("words after an opener (Maison X Y)", dom("Maison Corvane Lupin").includes("corvanelupin.com"));
  eq("nothing a domain could be made of: no candidates", dom("مستشفى"), []);
  eq("trademark signs go", dom("Ottervane®")[0], "ottervane.com");

  /* ---------- SSRF ---------- */
  console.log("\nNever a private or loopback address");
  for (const [what, addrs] of [
    ["10/8", ["10.0.0.5"]],
    ["loopback", ["127.0.0.1"]],
    ["the cloud metadata address", ["169.254.169.254"]],
    ["IPv6 loopback", ["::1"]],
    ["IPv4 loopback inside IPv6", ["::ffff:127.0.0.1"]],
    ["CGNAT", ["100.64.1.2"]],
    ["a public and a private address", ["93.184.216.34", "192.168.1.10"]],
  ] as [string, string[]][])
    eq(`DNS gives ${what}: refused`, (await F.checkDns("x.test", async () => addrs)).s, "private");
  eq("a public address is fine", (await F.checkDns("x.test", async () => PUBLIC)).s, "ok");
  eq("no such host", (await F.checkDns("x.test", resolve)).s, "nx");
  eq("a resolver that never answers: an error, not 'no such host'", (await F.checkDns("x.test", () => new Promise(() => {}), 30)).s, "error");

  dnsTable["evilcorp-intranet.com"] = ["10.1.2.3"];
  reads.length = 0;
  const evil = await F.findWebsite({ companyId: "x", name: "Evilcorp Intranet", country: null, prev: null, queued: false }, { resolve, fetchPage });
  check("a candidate that resolves privately is never read", !reads.includes("evilcorp-intranet.com") && evil.s === "none", { reads, evil });

  // The real homepage read (lib/about/fetch.ts), with a resolver that lies.
  const A = await import("../lib/about/fetch");
  const viaReal = async (host: string, addrs: string[]) => (await A.fetchHomepage(host, { resolve: async () => addrs, timeoutMs: 2000 })) as { ok: boolean; reason?: string };
  eq("the real read, DNS says 127.0.0.1: refused before connecting", (await viaReal("sneaky.example", ["127.0.0.1"])).reason, "private address");
  eq("the real read, DNS says 169.254.169.254: refused", (await viaReal("sneaky.example", ["169.254.169.254"])).reason, "private address");
  eq("the real read, DNS says fd00::1: refused", (await viaReal("sneaky.example", ["fd00::1"])).reason, "private address");
  // A redirect to a private address, from a server on loopback (allowed for tests only).
  const srv = createServer((req: IncomingMessage, res: ServerResponse) => {
    const host = String(req.headers.host ?? "").split(":")[0];
    if (req.url === "/robots.txt") return void res.writeHead(404).end();
    if (host === "hop.test") return void res.writeHead(302, { location: "http://169.254.169.254/latest/meta-data/" }).end();
    if (host === "hop2.test") return void res.writeHead(301, { location: "http://10.0.0.1/" }).end();
    if (host === "hop3.test") return void res.writeHead(302, { location: "http://intranet.local/" }).end();
    if (host === "quillsitetools.com")
      return void res.writeHead(200, { "content-type": "text/html" }).end(html({ title: "Quillsite Tools | Home", body: "Quillsite Tools makes tools for teams, built with care for people who make things every day." }));
    res.writeHead(404).end();
  });
  await new Promise<void>((ok) => srv.listen(0, "127.0.0.1", ok));
  const port = (srv.address() as AddressInfo).port;
  const loop = { allow: { loopback: true, port }, resolve: async () => ["127.0.0.1"], timeoutMs: 3000 };
  eq("a redirect to the metadata address: refused", ((await A.fetchHomepage("hop.test", loop)) as { reason?: string }).reason, "private address");
  eq("a redirect to 10.0.0.1: refused", ((await A.fetchHomepage("hop2.test", loop)) as { reason?: string }).reason, "private address");
  check("a redirect to a .local name: refused", !(await A.fetchHomepage("hop3.test", loop)).ok);
  const real = await F.findWebsite({ companyId: "x", name: "Quillsite Tools", country: null, prev: null, queued: false }, {
    resolve: async (h) => (h === "quillsitetools.com" ? ["127.0.0.1"] : Promise.reject(Object.assign(new Error("nx"), { code: "ENOTFOUND" }))),
    fetch: { allow: { loopback: true, port }, timeoutMs: 3000 },
    // The real read (lib/about/fetch.ts fetchHomepage), not the fake layer.
  });
  eq("end to end through the real read (loopback for the test only): found, high", [real.s, real.confidence], ["found", "high"]);
  srv.close();

  /* ---------- parked, directory, brand ---------- */
  console.log("\nTurned down");
  const cand = (domain: string, kind: "full" | "affix" | "part" = "full") => ({ domain, kind });
  const vf = (name: string, domain: string, page: string, finalUrl = `https://${domain}/`, country: string | null = null, kind: "full" | "affix" | "part" = "full") =>
    V.verify({ name, cand: cand(domain, kind), finalUrl, html: page, country });
  for (const [what, page] of [
    ["a for-sale page", html({ title: "parklygoods.com is for sale", body: "This domain is for sale. Make an offer today." })],
    ["'buy this domain'", html({ title: "Parkly Goods", body: "Buy this domain. Parkly Goods could be yours." })],
    ["a registrar's parking page", html({ title: "parklygoods.com", body: "This domain has been registered at Namecheap. Parked free, courtesy of the registrar." })],
    ["sponsored listings", html({ title: "Parkly Goods", body: "Related searches: goods, parkly, shop. Sponsored listings shown." })],
    ["a coming soon page", html({ title: "Coming soon", body: "Parkly Goods is coming soon." })],
    ["a server's default page", html({ title: "Welcome to nginx!", body: "Parkly Goods" })],
  ] as [string, string][]) {
    const v = vf("Parkly Goods", "parklygoods.com", page);
    check(`${what}: turned down`, !v.ok, v);
  }
  check("a redirect to a parking host: turned down", !vf("Parkly Goods", "parklygoods.com", html({ title: "Parkly Goods" }), "https://www.hugedomains.com/domain_profile.cfm?d=parklygoods").ok);
  check("a redirect to a social profile: turned down", !vf("Parkly Goods", "parklygoods.com", html({ title: "Parkly Goods" }), "https://www.linkedin.com/company/parkly-goods/").ok);
  check("a directory or registry host: turned down", !vf("Parkly Goods", "parklygoods.com", html({ title: "Parkly Goods - Company profile" }), "https://www.zoominfo.com/c/parkly-goods/1").ok);
  check("  a site builder's address too", !vf("Parkly Goods", "parklygoods.com", html({ title: "Parkly Goods" }), "https://parklygoods.wixsite.com/home").ok);
  const brand = vf("Brandshift Labs", "brandshiftlabs.com", html({ title: "Megacorp | Brandshift Labs is now part of Megacorp" }), "https://www.megacorp.example/");
  eq("a redirect that lands on another brand: turned down", brand, { ok: false, why: "redirect to another brand" });
  const same = vf("Brandshift Labs", "brandshiftlabs.io", html({ title: "Brandshift Labs" }), "https://brandshiftlabs.com/en");
  check("a redirect to the same name on another TLD: kept, at the domain it lands on", same.ok && same.domain === "brandshiftlabs.com" && same.confidence === "high", same);
  const grp = vf("Kestrelby", "kestrelby.com", html({ title: "Kestrelby Group" }), "https://www.kestrelbygroup.com/");
  check("  and to the name with 'group': kept", grp.ok && grp.domain === "kestrelbygroup.com", grp);
  eq("a country TLD that conflicts with the HQ: turned down", vf("Brindlecombe", "brindlecombe.de", html({ title: "Brindlecombe GmbH" }), undefined, "United Kingdom"), { ok: false, why: "country conflicts" });
  check("  the HQ's own TLD is fine", vf("Brindlecombe", "brindlecombe.co.uk", html({ title: "Brindlecombe" }), undefined, "United Kingdom").ok);
  check("  a generic TLD never conflicts", vf("Brindlecombe", "brindlecombe.io", html({ title: "Brindlecombe" }), undefined, "United Kingdom").ok);
  check("  nor without an HQ on file", vf("Brindlecombe", "brindlecombe.de", html({ title: "Brindlecombe" })).ok);
  eq("a page that names someone else: turned down", vf("Ottervane", "ottervane.com", html({ title: "Welcome to Riverquokka Dental" })), { ok: false, why: "page doesn't name the company" });
  check("  a page whose only mention is its own domain (a parked page's title): turned down", !vf("Ottervane", "ottervane.com", html({ title: "ottervane.com", body: "Welcome. More here soon, we hope, for all who visit." })).ok);
  const indus = vf("Industrial Quokkas", "industrial.com", html({ title: "Industrial Supply Co", body: "Pipes, valves and fittings for every plant, shipped fast across the country." }), undefined, null, "part");
  check("a domain from the first word, the page lacks the rest of the name: turned down", !indus.ok, indus);

  /* ---------- acceptance ---------- */
  console.log("\nAccepted, and how sure");
  const hi = vf("Quillmoor Robotics Ltd", "quillmoorrobotics.com", html({ title: "Home | Quillmoor Robotics" }));
  eq("domain and page both match: high", hi.ok && hi.confidence, "high");
  eq("og:site_name is read", (vf("Ottervane", "ottervane.com", html({ title: "Home", site: "Ottervane" })) as { confidence?: string }).confidence, "high");
  eq("the first h1 is read", (vf("Ottervane", "ottervane.com", html({ title: "Home", h1: "Ottervane" })) as { confidence?: string }).confidence, "high");
  eq("the footer's copyright line is read", (vf("Ottervane", "ottervane.com", html({ title: "Home", foot: "© 2025 Ottervane Ltd. All rights reserved." })) as { confidence?: string }).confidence, "high");
  check("a suffix on the page is fine (Ltd there, none on file)", vf("Ottervane", "ottervane.com", html({ title: "Ottervane Limited" })).ok);
  check("& on file, 'and' on the page", vf("Bäcker & Sons", "backerandsons.com", html({ title: "Backer and Sons Bakery" })).ok);
  check("  and the other way round", vf("Backer and Sons", "backerandsons.com", html({ title: "Bäcker & Sons" })).ok);
  check("a name squeezed on the page ('SupportQuokka' for 'Support Quokka')", vf("Support Quokka", "supportquokka.com", html({ title: "SupportQuokka helpdesk" })).ok);
  check("  but a short name must stand as a word (Quiv is not in Quivering)", !vf("Quiv", "quiv.com", html({ title: "Quivering Arrows archery" })).ok && vf("Quiv", "quiv.com", html({ title: "Quiv | payments" })).ok);
  check("with get in front: high", (vf("Corvane", "getcorvane.com", html({ title: "Corvane" }), undefined, null, "affix") as { confidence?: string }).confidence === "high");
  const med = vf("Ternwick Cyber", "ternwick.com", html({ title: "Ternwick | Managed IT", body: "Ternwick keeps your systems safe with cyber security for small firms, day and night." }), undefined, null, "part");
  eq("a domain from part of the name, the rest on the page: medium", med.ok && med.confidence, "medium");
  eq("its LinkedIn page, when the homepage links exactly one", V.linkedinOf('<a href="https://www.linkedin.com/company/larkwhistle-health/">in</a> <a href="https://linkedin.com/company/larkwhistle-health">again</a>'), "linkedin.com/company/larkwhistle-health");
  eq("  two different ones: none", V.linkedinOf('<a href="https://linkedin.com/company/a-co">x</a><a href="https://linkedin.com/company/b-co">y</a>'), null);

  /* ---------- the scheduler's default and switch ---------- */
  console.log("\nThe schedule");
  check("a job among the automatic jobs", (S.JOBS as readonly string[]).includes("websites"));
  eq("by default each day at 03:00 UTC (off-peak)", S.settingOf(null, "websites"), { every: "daily", hourUtc: 3 });
  check("  an hour no other job starts at", S.JOBS.filter((j) => j !== "websites").every((j) => S.JOB_DEFAULTS[j].hourUtc !== 3));
  eq("off without RN_WEBSITES=1", S.envOff("websites", {}), "Off: set RN_WEBSITES=1 in Railway");
  eq("on with it", S.envOff("websites", { RN_WEBSITES: "1" }), null);
  check("300 a run: about 12 days for 3,500", types.RUN_LIMIT === 300 && Math.ceil(3500 / types.RUN_LIMIT) === 12);
  eq("the log line's words", types.runWords({ done: 300, found: 190, high: 140, medium: 50, failed: 0, kept: 0 }), "300 read, 190 found (140 high, 50 medium), 0 failed");

  /* ---------- the run on the table ---------- */
  console.log("\nThe run on the table");
  const t = await import("../lib/table");
  const store = await import("../lib/websites/store");
  const R = await import("../lib/websites/run");
  const jobs = await import("../lib/jobs");
  const stateFile = path.join(dir, "intel.json");
  const disk = () => JSON.parse(readFileSync(stateFile, "utf8"));
  const iso = (ms: number) => new Date(ms).toISOString();
  // Today at 03:00 UTC: whatever day the test runs, nothing it stores is due again before the test ends (so the real Run now below reads nothing).
  const t0 = Math.floor(Date.now() / DAY) * DAY + 3 * 3600_000;

  site("quillmoorrobotics.com", html({ title: "Quillmoor Robotics | Warehouse robots", foot: "© 2026 Quillmoor Robotics Ltd" }));
  site("ternwick.com", html({ title: "Ternwick | Managed IT", body: "Ternwick keeps your systems safe with cyber security for small firms, day and night." }));
  site("parklygoods.com", html({ title: "parklygoods.com is for sale", body: "This domain is for sale." }));
  site("parkly-goods.com", html({ title: "Parkly Goods", body: "Buy this domain now." }));
  site("brandshiftlabs.com", html({ title: "Megacorp" }), "https://www.megacorp.example/");
  site("brindlecombe.com", html({ title: "Brindlecombe Hardware Inc." }), "https://brindlecombe.de/");
  site("twinmarsh.com", html({ title: "Twinmarsh" }));
  site("larkwhistlehealth.com", html({ title: "Larkwhistle Health", body: '<a href="https://www.linkedin.com/company/larkwhistle-health">Follow us</a> We care for people and families across the region every day.' }));
  site("lindenops.com", html({ title: "Linden Ops", body: '<a href="https://www.linkedin.com/company/linden-ops-other">Follow</a> Operations help for growing teams, with people who have done it before.' }));
  site("racewellfoods.com", html({ title: "Racewell Foods" }));
  site("freshnewco.com", html({ title: "Fresh Newco" }));
  site("hasweb-analytics.com", html({ title: "Hasweb Analytics" }));
  site("fenwrightrobotics.com", html({ title: "Fenwright Robotics" }));

  const targets = await store.websiteTargets(iso(t0));
  const ids = targets.map((x) => x.companyId);
  eq("a company a member added lately is read first (the queue)", ids[0], "c_added");
  check("companies with a website are never read", !ids.includes("c_has"), ids);
  check("a person's own practice is skipped (its seat holder's surname)", !ids.includes("c_practice"), ids);
  check("a one-person company is skipped (an employee count of one, as an import may carry it)", store.personalPractice("Solotrek", [], "1") && store.personalPractice("Solotrek", [], "Self-employed") && !store.personalPractice("Solotrek", [], "1–10"));
  check("a fractional firm is skipped", !ids.includes("c_firm"), ids);
  check("the rest are read", ["c_quill", "c_tern", "c_parked", "c_brand", "c_none", "c_uk", "c_twin1", "c_twin2", "c_li", "c_li2", "c_race"].every((x) => ids.includes(x)), ids);
  eq("the HQ's country comes along", targets.find((x) => x.companyId === "c_uk")?.country, "United Kingdom");
  check("placeholder names are skipped", store.skipReason((await t.loadState()), { id: "c_ph", name: "Stealth Startup", seedFields: { name: "Stealth Startup" } } as never, [], new Set()) === "placeholder name");
  eq("a person's practice: their surname in the name", store.personalPractice("Fenwright Growth", ["Dana Fenwright"], null), true);
  eq("  not when it isn't", store.personalPractice("Quillmoor Robotics", ["Sal Seller"], null), false);

  // A dry run: reads and checks, writes nothing.
  const before = readFileSync(stateFile, "utf8");
  reads.length = 0;
  lookups.length = 0;
  const dry = await R.runWebsites({ dry: true, delayMs: 0, find: { resolve, fetchPage }, now: () => iso(t0) });
  check("the dry run read the companies", dry.dry && dry.done === targets.length && reads.length > 0, dry);
  check("  and found some", dry.found >= 4 && dry.high >= 3 && dry.medium >= 1, dry);
  eq("  it wrote nothing", readFileSync(stateFile, "utf8") === before, true);
  check("  nothing in memory either: no website on the state", !Object.keys((await t.loadState()).values).some((k) => k.endsWith(".website")));
  const dryRow = jobs.jobRow(await t.loadState(), "websites", t0);
  check("  the card says how it went, with the hit rate, and that nothing was saved", !!dryRow.dryNote && /read, \d+ found \(\d+ high, \d+ medium\), 0 failed/.test(dryRow.dryNote) && /% found/.test(dryRow.dryNote) && /Nothing was saved/.test(dryRow.dryNote), dryRow.dryNote);
  check("  and the real run's last run is still none", dryRow.lastAt === null, dryRow);
  eq("  nothing went to the network", outbound, 0);

  // The real run, with a website set for one company while it reads.
  let raced = false;
  const racingFetch = async (d: string, o: Parameters<typeof fetchPage>[1]) => {
    if (d === "racewellfoods.com" && !raced) {
      raced = true;
      await t.tableInternals.mutate((s) => void (s.values["c_race.website"] = { value: "racewell.example", by: "m_sal", at: iso(t0), status: "live" }));
    }
    return fetchPage(d, o as never);
  };
  const run1 = await R.runWebsites({ delayMs: 0, concurrency: 1, find: { resolve, fetchPage: racingFetch }, now: () => iso(t0) });
  const s1 = await t.loadState();
  const W = s1.websites!.companies;
  eq("high: domain and page match", [s1.values["c_quill.website"]?.value, W.c_quill?.confidence], ["quillmoorrobotics.com", "high"]);
  eq("  stored as a system value by 'found', live", [s1.values["c_quill.website"]?.by, s1.values["c_quill.website"]?.status], [types.WEBSITE_FOUND_BY, "live"]);
  eq("medium: a part of the name, the rest on the page", [s1.values["c_tern.website"]?.value, W.c_tern?.confidence], ["ternwick.com", "medium"]);
  check("parked pages: not found", !s1.values["c_parked.website"] && W.c_parked?.s === "none", W.c_parked);
  check("a redirect to another brand: not found", !s1.values["c_brand.website"] && W.c_brand?.s === "none", W.c_brand);
  check("a country conflict (a UK company landing on .de): not found", !s1.values["c_uk.website"] && W.c_uk?.s === "none", W.c_uk);
  eq("nothing resolves: not found", [W.c_none?.s, W.c_none?.why], ["none", "nothing resolves"]);
  check("same name twice: the second never gets the first one's site", [s1.values["c_twin1.website"]?.value, s1.values["c_twin2.website"]?.value].filter(Boolean).length === 1, [W.c_twin1, W.c_twin2]);
  eq("the LinkedIn page the homepage links, on a company with none", [s1.values["c_li.linkedin"]?.value, s1.values["c_li.linkedin"]?.by, W.c_li?.linkedin], ["linkedin.com/company/larkwhistle-health", types.WEBSITE_FOUND_BY, "linkedin.com/company/larkwhistle-health"]);
  check("  a LinkedIn page on file stays", !s1.values["c_li2.linkedin"] && !W.c_li2?.linkedin && s1.values["c_li2.website"]?.value === "lindenops.com", W.c_li2);
  eq("a website someone set while it read is never overwritten", [s1.values["c_race.website"]?.value, s1.values["c_race.website"]?.by, W.c_race?.s], ["racewell.example", "m_sal", "kept"]);
  check("a website on file is never touched", !s1.values["c_has.website"] && !W.c_has);
  eq("the run's counts", [run1.done, run1.found, run1.high, run1.medium, run1.failed, run1.kept], [targets.length, run1.high + run1.medium, run1.high, run1.medium, 0, 1]);
  const row1 = jobs.jobRow(s1, "websites", t0 + 3600_000);
  eq("the card's last run, counts only", row1.lastNote, types.runWords(run1));
  check("  no company named in it", !/Quillmoor|Ternwick|Larkwhistle/.test(JSON.stringify(row1)), row1);
  check("nobody earned a credit", !s1.ledger.some((l) => l.reason === "fill"), s1.ledger);

  // The 60-day retry.
  const at = (days: number) => iso(t0 + days * DAY);
  const due = async (days: number) => (await store.websiteTargets(at(days))).map((x) => x.companyId);
  check("not found: not read again at 59 days", !(await due(59)).includes("c_none"));
  check("  read again at 60", (await due(60)).includes("c_none"));
  check("found: never read again", !(await due(400)).includes("c_quill"));
  check("network trouble: read again after 2 days", store.dueAgain({ s: "failed", at: at(0) }, t0 + 2 * DAY) && !store.dueAgain({ s: "failed", at: at(0) }, t0 + DAY));
  const allFail = await F.findWebsite({ companyId: "x", name: "Nowhere Dns", country: null, prev: null, queued: false }, { resolve: async () => Promise.reject(Object.assign(new Error("x"), { code: "EAI_AGAIN" })), fetchPage });
  eq("  every lookup failing (not 'no such host') is that kind", allFail.s, "failed");

  /* ---------- nothing for members to see ---------- */
  console.log("\nNothing visible to members");
  const view = await t.buildView("tok-sal-web", { fresh: true });
  const quill = view.companies.find((c) => c.name === "Quillmoor Robotics Ltd");
  check("the member sees the website as the company's website", quill?.cells.website?.s === "value" && (quill.cells.website as { v?: string }).v === "quillmoorrobotics.com", quill?.cells.website);
  check("  with no source, no mark", !("from" in (quill?.cells.website ?? {})) && !("system" in (quill?.cells.website ?? {})), quill?.cells.website);
  const vj = JSON.stringify(view);
  check("the member's table never says how it was found", !/Found by Merlin|found by merlin|"confidence"|undoneBy|"websites"|best guess/i.test(vj));
  check("  nor carries Pilot metrics", !(view as { admin?: unknown }).admin);
  const { NextRequest } = await import("next/server");
  const route = await import("../app/api/table/jobs/route");
  const req = (method: "GET" | "POST", token: string | null, body?: unknown, query = "") =>
    new NextRequest(`https://post.example.com/api/table/jobs${query}`, {
      method,
      headers: { "content-type": "application/json", ...(token ? { cookie: `rn_table=${token}` } : {}) },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  const call = async (r: InstanceType<typeof NextRequest>) => {
    const res = r.method === "GET" ? await route.GET(r) : await route.POST(r);
    return { status: res.status, body: (await res.json()) as Record<string, unknown> };
  };
  eq("a member can't read the finds", (await call(req("GET", "tok-sal-web", undefined, "?finds=websites"))).status, 403);
  eq("  nor run it, dry or not", [(await call(req("POST", "tok-sal-web", { op: "run", job: "websites", dry: true }))).status, (await call(req("POST", "tok-sal-web", { op: "run", job: "websites" }))).status], [403, 403]);
  eq("  nor undo a find", (await call(req("POST", "tok-sal-web", { op: "undoWebsite", companyId: t.tableInternals.pubId("c_quill") }))).status, 403);
  eq("signed out: 401", (await call(req("GET", null, undefined, "?finds=websites"))).status, 401);

  /* ---------- the admin's list and Undo ---------- */
  console.log("\nThe admin's list and Undo");
  const list = await call(req("GET", "tok-ada-web", undefined, "?finds=websites"));
  const finds = (list.body.finds as { companyId: string; name: string; domain: string; confidence: string; live: boolean }[]) ?? [];
  check("an admin sees the recent finds, with name, domain and confidence", list.status === 200 && finds.some((f) => f.name === "Quillmoor Robotics Ltd" && f.domain === "quillmoorrobotics.com" && f.confidence === "high" && f.live), list.body);
  check("  by public id, never an internal one", finds.every((f) => !seed.companies.some((c) => c.id === f.companyId) && f.companyId !== "c_added"), finds.map((f) => f.companyId));
  check("  and the last dry run's finds, not saved", Array.isArray((list.body.dry as { finds?: unknown[] })?.finds));
  const offRun = await call(req("POST", "tok-ada-web", { op: "run", job: "websites" }));
  check("Run now with RN_WEBSITES off: refused, says the switch and the dry run", offRun.status === 400 && /RN_WEBSITES=1/.test(String(offRun.body.error)) && /Dry run/.test(String(offRun.body.error)), offRun);
  const quillPub = finds.find((f) => f.name === "Quillmoor Robotics Ltd")!.companyId;
  await t.tableInternals.mutate((s) => void (s.verifications["c_quill.website"] = ["m_sal"]));
  const undo = await call(req("POST", "tok-ada-web", { op: "undoWebsite", companyId: quillPub }));
  const s2 = await t.loadState();
  check("Undo: the website comes off", undo.status === 200 && !s2.values["c_quill.website"], undo);
  check("  its confirmations too", !s2.verifications["c_quill.website"]);
  eq("  marked taken back, by whom", [s2.websites!.companies.c_quill.s, s2.websites!.companies.c_quill.undoneBy], ["undone", "m_ada"]);
  check("  never read again on its own", !(await due(400)).includes("c_quill"));
  check("  on disk", !disk().values["c_quill.website"] && disk().websites.companies.c_quill.s === "undone");
  const liPub = t.tableInternals.pubId("c_li");
  await call(req("POST", "tok-ada-web", { op: "undoWebsite", companyId: liPub }));
  const s3 = await t.loadState();
  check("Undo takes back the LinkedIn page found with it", !s3.values["c_li.website"] && !s3.values["c_li.linkedin"]);
  // A find whose website someone changed since: Undo leaves their value.
  await t.tableInternals.mutate((s) => void (s.values["c_tern.website"] = { value: "ternwick-own.example", by: "m_sal", at: iso(t0), status: "live" }));
  const kept = await call(req("POST", "tok-ada-web", { op: "undoWebsite", companyId: t.tableInternals.pubId("c_tern") }));
  check("Undo on a website someone set since: theirs stays", kept.status === 200 && (await t.loadState()).values["c_tern.website"]?.value === "ternwick-own.example", kept);
  eq("Undo of something Merlin didn't find: 400", (await call(req("POST", "tok-ada-web", { op: "undoWebsite", companyId: t.tableInternals.pubId("c_has") }))).status, 400);
  eq("Undo twice: fine, says so", (await call(req("POST", "tok-ada-web", { op: "undoWebsite", companyId: quillPub }))).body.message, "Already taken back.");

  /* ---------- the job on the schedule ---------- */
  console.log("\nThe job on its schedule");
  R.resetWebsitesLook();
  check("RN_WEBSITES off: the schedule never starts it", !(await R.maybeWebsites({ nowMs: t0 + 2 * DAY })));
  check("  nor the scheduler's look", !(await jobs.runDueJobs(undefined, t0 + 2 * DAY)).websites);
  const offRow = jobs.jobRow(await t.loadState(), "websites", t0 + 2 * DAY);
  check("  the card says which switch, no next run, Dry run still there", offRow.off === "Off: set RN_WEBSITES=1 in Railway" && offRow.nextAt === null && offRow.canDry === true && !offRow.canRun, offRow);
  process.env.RN_WEBSITES = "1";
  const mon = Math.floor(t0 / DAY) * DAY + 7 * DAY;
  R.resetWebsitesLook();
  check("on: not before 03:00 UTC", !(await R.maybeWebsites({ nowMs: mon + 2 * 3600_000, run: { delayMs: 0, find: { resolve, fetchPage } } })));
  R.resetWebsitesLook();
  check("  at 03:00 UTC it starts", await R.maybeWebsites({ nowMs: mon + 3 * 3600_000, run: { delayMs: 0, find: { resolve, fetchPage }, now: () => iso(mon + 3 * 3600_000) } }));
  for (let i = 0; i < 200 && types.websitesProgress.running; i++) await new Promise((r) => setTimeout(r, 20));
  R.resetWebsitesLook();
  check("  not twice the same day", !(await R.maybeWebsites({ nowMs: mon + 9 * 3600_000, run: { delayMs: 0, find: { resolve, fetchPage } } })));
  const onRow = jobs.jobRow(await t.loadState(), "websites", mon + 9 * 3600_000);
  eq("  next run: tomorrow at 03:00 UTC", onRow.nextAt?.slice(0, 16), iso(mon + DAY + 3 * 3600_000).slice(0, 16));
  const started = await call(req("POST", "tok-ada-web", { op: "run", job: "websites" }));
  check("Run now with RN_WEBSITES=1: starts", started.status === 200 && /Started/.test(String(started.body.message)), started);
  for (let i = 0; i < 200 && types.websitesProgress.running; i++) await new Promise((r) => setTimeout(r, 20));
  eq("  (nothing was due, so it looked nothing up)", [types.websitesProgress.run?.total, types.websitesProgress.run?.lookups], [0, 0]);
  delete process.env.RN_WEBSITES;
  eq("nothing went to the network, all along", outbound, 0);
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${failures ? "FAILED" : "passed"}: ${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
