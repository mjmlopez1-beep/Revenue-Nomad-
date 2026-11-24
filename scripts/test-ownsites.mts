/**
 * Checks of own sites (lib/ownsites, scripts/add-own-sites.mjs): the email addresses fractionals
 * publish on their own firm's website.
 *
 *  - the import: United States only, California excluded (read as a yes or no, never stored), a
 *    known site from an own-firm row, a firm name from the current company, only people on a named
 *    seat, person keys only (no profile id anywhere in the seed), counts only in its output, --dry;
 *  - the acceptance rules: a name match, an obfuscated address, the only address on a one-person
 *    site, a generic inbox on a one-person site (invites only), a generic address on a bigger site
 *    rejected, an address at another domain rejected; nicknames with the last name (never alone),
 *    first initial and last name, the person's own bio page on a team site, a one-person site's
 *    team page;
 *  - invites only: a generic inbox is stored flagged, never on a member's or admin's table, the
 *    connector or the export, and the outreach file marks it for invites to Merlin only;
 *  - the reader: robots.txt honoured (the whole site, and one page), the 5-page cap, same site only,
 *    a firm's site found by name;
 *  - the start-up dry run: counts only in the log (no email, domain or name), once per N, nothing usable;
 *  - the switch: off, nothing shows anywhere; on, the seat holder's record shows the email locked,
 *    "From their website", after the name; 1 credit opens it, the same on their other seat; Invite
 *    to connect and claim outreach get it; the connector says where it came from;
 *  - Remove my name takes it off with the credit back, and the site is never read again; Undo; the
 *    Automatic jobs row; the real seed holds no profile id;
 *  - prospects (no seat, a known own-firm site, outreach only): linked by person key with their name,
 *    California still out, read with the known sites before any firm-name lookup, never in any
 *    member's or admin's table, Fractionals or the connector, only in the admin's sample and the
 *    outreach file's join list (join Merlin, not claim a seat); Remove my name by their firm or site.
 *
 * Nothing leaves the machine: the sites come from a mock server on 127.0.0.1, names resolve
 * through a table here, lib/table.ts runs in this process on a made-up seed in a temporary data
 * folder. Every name, firm and address here is made up.
 *
 *   OWNSITES_PORT=7003 npx tsx scripts/test-ownsites.mts
 */
import { spawnSync } from "node:child_process";
import { createHmac } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const PORT = Number(process.env.OWNSITES_PORT || 7003);
const dir = mkdtempSync(path.join(tmpdir(), "rn-ownsites-"));
const DAY = 86_400_000;
const iso = (days: number) => new Date(Date.now() + days * DAY).toISOString();
const TEST_KEY = Buffer.alloc(32, 7).toString("base64");
const personKeyOf = (id: string) => `p_${createHmac("sha256", Buffer.from(TEST_KEY, "base64")).update(`person:${id}`).digest("hex").slice(0, 20)}`;

let passed = 0;
let failed = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || detail === undefined ? "" : `\n      got ${typeof detail === "string" ? detail : JSON.stringify(detail).slice(0, 900)}`}`);
}
const eq = (name: string, got: unknown, want: unknown) => check(name, JSON.stringify(got) === JSON.stringify(want), got);

/* ---------- the people (all made up) ---------- */

interface P {
  id: string;
  name: string;
  firm: string;
  site?: string;
  location: string;
  country?: string;
  /** A second seat (a client). */
  two?: boolean;
  /** Known by firm name only (the past seats file's current company). */
  firmOnly?: boolean;
  /** No seat on the seed at all: a prospect, outreach only. */
  prospect?: boolean;
}
const people: P[] = [
  { id: "SNAV-AVERY-001", name: "Avery Quinlan", firm: "Quinlan Advisory", site: "quinlanadvisory.test", location: "Austin, Texas, United States", two: true },
  { id: "SNAV-BLAKE-002", name: "Blake Ortez", firm: "Ortez Growth", site: "ortezgrowth.test", location: "Denver, Colorado, United States" },
  { id: "SNAV-CASEY-003", name: "Casey Wren", firm: "Wren Partners", site: "wrenpartners.test", location: "Boston, Massachusetts, United States" },
  { id: "SNAV-DANA-004", name: "Dana Pike", firm: "Pike Collective", site: "pikecollective.test", location: "Chicago, Illinois, United States" },
  { id: "SNAV-ELLIS-005", name: "Ellis Marr", firm: "Marr CFO", site: "marrcfo.test", location: "Miami, Florida, United States" },
  { id: "SNAV-FINN-006", name: "Finn Hale", firm: "Hale Strategy", site: "halestrategy.test", location: "Seattle, Washington, United States" },
  { id: "SNAV-GRAY-007", name: "Gray Lund", firm: "Lund Ventures", site: "lundventures.test", location: "Portland, Oregon, United States" },
  { id: "SNAV-HARPER-008", name: "Harper Voss", firm: "Voss Revenue", site: "vossrevenue.test", location: "San Francisco Bay Area" },
  { id: "SNAV-INDY-009", name: "Indy Roe", firm: "Roe Marketing", site: "roemarketing.test", location: "London, England, United Kingdom", country: "United Kingdom" },
  { id: "SNAV-JULES-010", name: "Jules Kentwood", firm: "Kentwood Advisory", location: "Atlanta, Georgia, United States", firmOnly: true },
  { id: "SNAV-KIT-011", name: "Kit Sorel", firm: "Sorel Group", site: "sorelgroup.test", location: "Nashville, Tennessee, United States" },
  { id: "SNAV-UNA-012", name: "Una Dowling", firm: "Dowling Consulting", site: "dowlingconsulting.test", location: "Columbus, Ohio, United States" },
  { id: "SNAV-LEE-013", name: "Lee Ashdown", firm: "Ashdown Labs", site: "ashdownlabs.test", location: "Los Angeles Metropolitan Area" },
  // Prospects: no seat on the seed (their only seat was their own firm), a known own-firm site.
  { id: "SNAV-NELL-015", name: "Nell Brookfield", firm: "Brookfield Advisory", site: "brookfieldadvisory.test", location: "Raleigh, North Carolina, United States", prospect: true },
  { id: "SNAV-OPAL-016", name: "Opal Fenwick", firm: "Fenwick Growth", site: "fenwickgrowth.test", location: "San Diego, California, United States", prospect: true },
];
const byName = (n: string) => people.find((p) => p.name === n)!;

/* ---------- the made-up seed: one client seat per person, named from public profiles ---------- */

const seed = {
  builtAt: iso(-2),
  members: [
    { id: "m_admin", name: "Ada Admin", email: "admin-own@example.com", title: "Founder", token: "tok-admin-own" },
    { id: "m_sal", name: "Sal Seller", email: "sal-own@example.com", title: "Fractional VP Sales", token: "tok-sal-own" },
    // Blake is a member who keeps himself out of the Fractionals directory: his own choice holds.
    { id: "m_blake", name: "Blake Ortez", email: "blake-own@example.com", title: "Fractional CMO", token: "tok-blake-own" },
  ],
  companies: [] as { id: string; fields: Record<string, string> }[],
  engagements: [] as Record<string, unknown>[],
  contacts: [],
};
people.forEach((p, i) => {
  if (p.prospect) return;
  const cid = `c_client${i}`;
  seed.companies.push({ id: cid, fields: { name: `Clientco ${String.fromCharCode(65 + i)} Systems`, website: `clientco${i}.test`, industry: "Software", hq: "Austin, TX" } });
  // Harper (California) and Indy (abroad) have seats too: the import must still leave them out.
  const named = p.country !== "United Kingdom";
  seed.engagements.push({
    id: `e_ss_seat${i}`,
    companyId: cid,
    fields: { source: "Seat scan", role: "Fractional VP Sales", function: "Sales", type: "Fractional", status: "Active", ...(named ? { operator: p.name } : {}) },
    ...(named ? { holderFrom: "public profile" } : {}),
    holderKey: personKeyOf(p.id),
  });
  if (p.two) {
    seed.companies.push({ id: `c_second${i}`, fields: { name: `Secondco ${String.fromCharCode(65 + i)} Health`, website: `secondco${i}.test`, industry: "Healthcare", hq: "Dallas, TX" } });
    seed.engagements.push({
      id: `e_ss_seat${i}b`,
      companyId: `c_second${i}`,
      fields: { source: "Seat scan", role: "Fractional CRO", function: "Sales", type: "Fractional", status: "Ended", start: "2023", end: "2024", operator: p.name },
      holderFrom: "public profile",
      holderKey: personKeyOf(p.id),
    });
  }
});
const seedFile = path.join(dir, "intel-seed.json");
writeFileSync(seedFile, JSON.stringify(seed));

/* ---------- the files the import reads ---------- */

const csv = (rows: Record<string, string>[]) => {
  const keys = Object.keys(rows[0]);
  const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [keys.join(","), ...rows.map((r) => keys.map((k) => cell(r[k] ?? "")).join(","))].join("\n") + "\n";
};
const seatRows: Record<string, string>[] = [];
const pastRows: Record<string, string>[] = [];
for (const p of people) {
  if (p.firmOnly) {
    // Known only from the past seats file: their current title and company.
    pastRows.push({
      person_name: p.name, person_sales_nav_id: p.id, company_name: "Clientco Old Corp", company_website: "clientcoold.test", company_employee_range: "51-200",
      company_likely_fractional_provider: "FALSE", provider_by_name: "FALSE", country: p.country ?? "United States", person_location: p.location,
      person_current_title: "Founder & Fractional CRO", person_current_company: p.firm,
    });
    continue;
  }
  // The own-firm row the importers drop (named after the person), with its website.
  seatRows.push({
    person_name: p.name, person_sales_nav_id: p.id, company_name: p.firm, company_website: `https://www.${p.site}/`, company_employee_range: "2-10",
    company_likely_fractional_provider: "FALSE", country: p.country ?? "United States", person_location: p.location,
  });
}
// Someone with no own firm at all: a client seat only.
seatRows.push({ person_name: "Mo Plainview", person_sales_nav_id: "SNAV-MO-014", company_name: "Clientco Big", company_website: "clientcobig.test", company_employee_range: "201-500", company_likely_fractional_provider: "FALSE", country: "United States", person_location: "Detroit, Michigan, United States" });
seed.engagements.push({ id: "e_ss_mo", companyId: "c_client0", fields: { source: "Seat scan", role: "Fractional CMO", function: "Marketing", operator: "Mo Plainview" }, holderFrom: "public profile", holderKey: personKeyOf("SNAV-MO-014") });
writeFileSync(seedFile, JSON.stringify(seed));
const seatsCsv = path.join(dir, "seats.csv");
const pastCsv = path.join(dir, "past.csv");
writeFileSync(seatsCsv, csv(seatRows));
writeFileSync(pastCsv, csv(pastRows));

/* ---------- the import ---------- */
console.log("\nThe import (scripts/add-own-sites.mjs)");

const importer = (...extra: string[]) =>
  spawnSync(process.execPath, [path.join(ROOT, "scripts", "add-own-sites.mjs"), "--seats", seatsCsv, "--past", pastCsv, "--seed", seedFile, "--no-seal", ...extra], { cwd: ROOT, encoding: "utf8", env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY } });
const before = readFileSync(seedFile, "utf8");
const dry = importer("--dry");
check("--dry prints the counts and writes nothing", dry.status === 0 && /people linked: \d+/.test(dry.stdout) && readFileSync(seedFile, "utf8") === before, dry.stdout + dry.stderr);
const imp = importer("--counts-only");
check("the import runs", imp.status === 0, imp.stdout + imp.stderr);
const num = (re: RegExp) => Number(imp.stdout.match(re)?.[1] ?? NaN);
eq("people linked: 10 (9 with a site, 1 firm only)", [num(/people linked: (\d+)/), num(/with site: (\d+)/), num(/firm only: (\d+)/)], [10, 9, 1]);
eq("excluded, California: 3 (the Bay Area, Los Angeles, and Opal in San Diego)", num(/excluded, California: (\d+)/), 3);
eq("excluded, no own firm: 1", num(/excluded, no own firm: (\d+)/), 1);
eq("prospects: 1 (Nell; Opal is in California)", num(/prospects \(no named seat, a known own-firm site, outreach only\): (\d+)/), 1);
check("its output names nobody: no name, firm, site or profile id", !people.some((p) => [p.name, p.firm, p.site ?? "@@", p.id, p.name.split(" ")[1]].some((x) => imp.stdout.includes(x) || imp.stderr.includes(x))), imp.stdout);
const after = JSON.parse(readFileSync(seedFile, "utf8"));
const links = after.ownSites as Record<string, { site?: string; firm?: string; how: string }>;
eq("Avery is linked by person key to their own site, as a known site", links[personKeyOf("SNAV-AVERY-001")], { site: "quinlanadvisory.test", how: "known site" });
eq("Jules is linked by the firm's name only (their current company)", links[personKeyOf("SNAV-JULES-010")], { firm: "Kentwood Advisory", how: "current company" });
check("California (Harper, Lee) and abroad (Indy) are not linked", !links[personKeyOf("SNAV-HARPER-008")] && !links[personKeyOf("SNAV-LEE-013")] && !links[personKeyOf("SNAV-INDY-009")]);
const flat = JSON.stringify(after);
check("no profile id anywhere in the seed, and no location", !people.some((p) => flat.includes(p.id)) && !flat.includes("SNAV-") && !/Bay Area|Los Angeles|Texas, United States/.test(flat));
const prospectsIn = after.ownSiteProspects as Record<string, { name: string; site: string; firm?: string; how: string }>;
eq("Nell is a prospect, by person key, with her name to greet her and match her email", prospectsIn[personKeyOf("SNAV-NELL-015")], { name: "Nell Brookfield", site: "brookfieldadvisory.test", firm: "Brookfield Advisory", how: "known site" });
check("a California prospect (Opal) is left out, and no seat holder is a prospect", !prospectsIn[personKeyOf("SNAV-OPAL-016")] && !Object.keys(prospectsIn).some((k) => links[k]));
check("the prospects section holds person keys, names, sites, firm names and how only", Object.entries(prospectsIn).every(([k, v]) => /^p_[0-9a-f]{20}$/.test(k) && Object.keys(v).every((f) => ["name", "site", "firm", "how"].includes(f))));
check("the seed's own-sites section holds person keys, sites, firm names and how only", Object.entries(links).every(([k, v]) => /^p_[0-9a-f]{20}$/.test(k) && Object.keys(v).every((f) => ["site", "firm", "how"].includes(f))));
// The real seed: person keys only, never a profile id (the private file, when it is here).
const realSeed = path.join(ROOT, "data", "intel-seed.json");
if (existsSync(realSeed)) {
  const real = JSON.parse(readFileSync(realSeed, "utf8"));
  const own = real.ownSites ?? {};
  check(
    "the real seed's own-sites section: person keys only, and no field beyond site, firm and how",
    Object.entries(own).every(([k, v]) => /^p_[0-9a-f]{20}$/.test(k) && Object.keys(v as object).every((f) => ["site", "firm", "how"].includes(f))),
  );
  check(
    "the real seed's prospects: person keys only, and no field beyond name, site, firm and how",
    Object.entries(real.ownSiteProspects ?? {}).every(([k, v]) => /^p_[0-9a-f]{20}$/.test(k) && Object.keys(v as object).every((f) => ["name", "site", "firm", "how"].includes(f))),
  );
  check("the real seed carries no Sales Navigator id field or lead link", !/person_sales_nav_id|sales_nav_id|linkedin\.com\/sales\/lead/.test(readFileSync(realSeed, "utf8")));
}

/* ---------- the acceptance rules, by themselves ---------- */
console.log("\nWhich address is theirs");

const X = await import("../lib/ownsites/extract");
const types0 = await import("../lib/ownsites/types");
const page = (body: string, title = "Home") => `<!doctype html><html><head><title>${title}</title><script>var x = "decoy@scripted.test";</script></head><body>${body}</body></html>`;
eq("mailto links, the text, and obfuscations ([at] [dot], (at)(dot), entities) are read; scripts are not", X.emailsOf(page(`<a href="mailto:Avery@Quinlan.test?subject=hi">Write</a> or ann [at] quinlan [dot] test, bo(at)quinlan(dot)test, cy&#64;quinlan.test`)), ["avery@quinlan.test", "ann@quinlan.test", "bo@quinlan.test", "cy@quinlan.test"]);
const forms = ["avery", "quinlan", "avery.quinlan", "averyquinlan", "aquinlan", "averyq", "avery_quinlan", "aq", "Avery.Quinlan", "avery-quinlan"];
check("the person's local parts: first, last, first.last, firstlast, flast, firstl, first_last, initials (case folded)", forms.every((l) => X.localMatches(l, "Avery Quinlan")), forms.filter((l) => !X.localMatches(l, "Avery Quinlan")));
check("accents are folded", X.localMatches("jose.nunez", "José Núñez"));
check("someone else's local part is not theirs", !X.localMatches("bob", "Avery Quinlan") && !X.localMatches("info", "Avery Quinlan"));
const d = (pages: [string, string][], site: string, name: string) => X.decide(pages.map(([url, html]) => ({ url, html })), site, name);
const nm = d([["https://q.test/", page(`<p>Avery Quinlan, fractional CRO.</p><a href="mailto:info@q.test">info</a> <a href="mailto:avery@q.test">me</a>`)]], "q.test", "Avery Quinlan");
check("a name match wins over a generic address", nm.ok && nm.email === "avery@q.test" && nm.how === "name match", nm);
const ob = d([["https://o.test/about", page(`Reach Blake at blake [at] o [dot] test`)]], "o.test", "Blake Ortez");
check("an obfuscated address that matches the name", ob.ok && ob.email === "blake@o.test" && ob.how === "name match", ob);
const solo = d([["https://w.test/", page(`<h1>Casey Wren</h1><p>I help founders build their first sales team.</p>`)], ["https://w.test/contact", page(`<a href="mailto:hello@w.test">hello@w.test</a>`)]], "w.test", "Casey Wren");
check("a generic inbox on a one-person site that names them: accepted, marked generic inbox, one-person site, invites only", solo.ok && solo.email === "hello@w.test" && solo.how === "generic inbox, one-person site" && solo.invitesOnly === true, solo);
const soloTeam = d([["https://w2.test/", page(`<h1>Casey Wren</h1><p>I help founders.</p>`)], ["https://w2.test/team", page(`<p>Casey Wren</p><p>Rory Stone</p>`)], ["https://w2.test/contact", page(`<a href="mailto:hello@w2.test">hello@w2.test</a>`)]], "w2.test", "Casey Wren");
check("  a site with a team page that names others is not one person's: its generic inbox is rejected", !soloTeam.ok && soloTeam.s === "email not theirs", soloTeam);
check("  the old how name reads back as invites only too", types0.ownInvitesOnly({ how: "generic on a one-person site" }) && types0.ownInvitesOnly({ how: "x", invitesOnly: true }) && !types0.ownInvitesOnly({ how: "name match" }));
// Nicknames: a common nickname of the first name counts with the last name, never alone.
const nickForms = ["mike.quinlan", "mikequinlan", "mike-quinlan", "mike_quinlan", "quinlan.mike", "quinlanmike"];
check("a nickname with the last name (Mike for Michael): nickname forms", nickForms.every((l) => X.nicknameMatches(l, "Michael Quinlan")) && X.nicknameMatches("bill.oduya", "William Oduya") && X.nicknameMatches("liz.hart", "Elizabeth Hart"), nickForms.filter((l) => !X.nicknameMatches(l, "Michael Quinlan")));
check("  and the other way (Michael for a Mike on file)", X.nicknameMatches("michael.quinlan", "Mike Quinlan"));
check("  a nickname alone, or its initials alone, is never theirs", !X.nicknameMatches("mike", "Michael Quinlan") && !X.localMatches("mike", "Michael Quinlan") && !X.nicknameMatches("mq", "Michael Quinlan") && !X.nicknameMatches("bill", "William Oduya"));
const nk = d([["https://mq.test/", page(`<p>Michael Quinlan</p><a href="mailto:info@mq.test">info</a> <a href="mailto:mike.quinlan@mq.test">write</a>`)]], "mq.test", "Michael Quinlan");
check("  on the site: accepted, marked nickname match", nk.ok && nk.email === "mike.quinlan@mq.test" && nk.how === "nickname match", nk);
const nkAlone = d([["https://mq2.test/", page(`<h2>Our team</h2><p>Michael Quinlan</p><a href="mailto:mike@mq2.test">write</a>`)]], "mq2.test", "Michael Quinlan");
check("  mike@ alone on a team site: rejected", !nkAlone.ok, nkAlone);
const gmNick = d([["https://g7.test/", page(`<p>William Oduya</p><a href="mailto:bill.oduya@gmail.com">write</a>`)]], "g7.test", "William Oduya");
check("  a nickname with the whole last name at a personal provider: their whole name", gmNick.ok && gmNick.how === "name match, personal address", gmNick);
// First initial and last name, at the site's own domain.
const inits = ["jsmith", "j.smith", "j_smith", "j-smith", "smithj", "smith.j"];
check("first initial and last name: jsmith, j.smith, j_smith, j-smith, smithj, smith.j are a name match", inits.every((l) => X.localMatches(l, "Jordan Smith")), inits.filter((l) => !X.localMatches(l, "Jordan Smith")));
const fi = d([["https://js.test/", page(`<h2>Meet the team</h2><p>Jordan Smith, Ana Bell</p><a href="mailto:smithj@js.test">a</a> <a href="mailto:abell@js.test">b</a>`)]], "js.test", "Jordan Smith");
check("  smithj@ on a team site: name match", fi.ok && fi.email === "smithj@js.test" && fi.how === "name match", fi);
check("  another domain's jsmith@ is not theirs", !d([["https://js2.test/", page(`<p>Jordan Smith</p><a href="mailto:jsmith@other.test">a</a>`)]], "js2.test", "Jordan Smith").ok);
// Their own bio page names them: its one personal address is theirs, on a team site too.
const bio = d(
  [
    ["https://pc.test/", page(`<h2>Our team</h2><a href="/team/dana-pike">Dana Pike</a> <a href="/team/rory-stone">Rory Stone</a>`)],
    ["https://pc.test/team", page(`<h2>Our team</h2><p>Dana Pike</p><p>Rory Stone</p><a href="mailto:rs.ops@pc.test">rs</a> <a href="mailto:dk.growth@pc.test">dk</a>`)],
    ["https://pc.test/team/dana-pike", page(`<h1>Dana Pike</h1><p>Dana Pike leads revenue.</p><a href="mailto:dk.growth@pc.test">Email Dana</a><a href="mailto:info@pc.test">info</a>`, "Dana Pike")],
  ],
  "pc.test",
  "Dana Pike",
);
check("their own bio page (/team/dana-pike) names them: its one personal address is theirs, marked bio page", bio.ok && bio.email === "dk.growth@pc.test" && bio.how === "bio page" && /dana-pike$/.test(bio.page), bio);
const bioHead = d([["https://pc2.test/", page(`<p>Dana Pike and partners</p>`)], ["https://pc2.test/about", page(`<h1>About Dana Pike</h1><p>Dana Pike, founder.</p><a href="mailto:dk.growth@pc2.test">write</a>`)]], "pc2.test", "Dana Pike");
check("  an about page whose heading names them counts too", bioHead.ok && bioHead.how === "bio page", bioHead);
const listing = d([["https://pc3.test/team", page(`<h1>Our team</h1><p>Dana Pike</p><p>Rory Stone</p><a href="mailto:dk.growth@pc3.test">dk</a> <a href="mailto:rs.ops@pc3.test">rs</a>`)]], "pc3.test", "Dana Pike");
check("  a team listing with everyone's addresses is never one person's bio page", !listing.ok, listing);
const otherBio = d([["https://pc4.test/team/rory-stone", page(`<h1>Rory Stone</h1><p>Rory Stone works with Dana Pike.</p><a href="mailto:rs.ops@pc4.test">write</a>`)]], "pc4.test", "Dana Pike");
check("  someone else's bio page that mentions them is not theirs", !otherBio.ok, otherBio);
const big = d([["https://p.test/", page(`<h2>Meet the team</h2><p>Dana Pike</p><p>Rory Stone</p><a href="mailto:info@p.test">info@p.test</a>`)]], "p.test", "Dana Pike");
check("a generic address on a bigger site: rejected (not theirs)", !big.ok && big.s === "email not theirs", big);
const other = d([["https://m.test/", page(`<p>Ellis Marr</p><a href="mailto:ellis.marr@gmail.test">ellis.marr@gmail.test</a>`)]], "m.test", "Ellis Marr");
check("their name at another domain: rejected (not the site's)", !other.ok && other.s === "email not theirs", other);
const alias = d([["https://firm.test/", page(`<p>Gale Ivers</p><a href="https://firm.co/">our other site</a><a href="mailto:gale@firm.co">gale@firm.co</a>`)]], "firm.test", "Gale Ivers");
check("an alias the site links, with the same name on another ending: accepted", alias.ok && alias.email === "gale@firm.co", alias);
const onlyOne = d([["https://s.test/", page(`<p>Sam Teller</p><p>I advise B2B founders.</p><a href="mailto:st.growth@s.test">st.growth@s.test</a>`)]], "s.test", "Sam Teller");
check("the only personal-looking address on a one-person site that names them", onlyOne.ok && onlyOne.how === "only address on a one-person site", onlyOne);
const unnamed = d([["https://u.test/", page(`<p>We help B2B founders.</p><a href="mailto:hello@u.test">hello@u.test</a>`)]], "u.test", "Uma Nolan");
check("a generic address on a site that doesn't name them: rejected", !unnamed.ok && unnamed.s === "email not theirs", unnamed);
eq("no address at all: no email", d([["https://n.test/", page(`<p>Hi</p>`)]], "n.test", "Nia Bell"), { ok: false, s: "no email", found: 0 });
const gm = d([["https://g.test/", page(`<p>Gwen Harlow, fractional CMO.</p><a href="mailto:gwen.harlow@gmail.com">gwen.harlow@gmail.com</a>`)]], "g.test", "Gwen Harlow");
check("their whole name at a personal provider, on their own site: accepted, marked name match, personal address", gm.ok && gm.email === "gwen.harlow@gmail.com" && gm.how === "name match, personal address", gm);
const gm2 = d([["https://g2.test/", page(`<p>Gwen Harlow</p><a href="mailto:gharlow77@outlook.com">write</a>`)]], "g2.test", "Gwen Harlow");
check("first initial and last name with digits at a personal provider: accepted", gm2.ok && gm2.email === "gharlow77@outlook.com" && gm2.how === "name match, personal address", gm2);
const gmFirst = d([["https://g3.test/", page(`<p>Gwen Harlow</p><a href="mailto:gwen@gmail.com">write</a>`)]], "g3.test", "Gwen Harlow");
check("a first name alone at a personal provider: rejected, why personal address, not their whole name", !gmFirst.ok && gmFirst.s === "email not theirs" && gmFirst.why === "personal address, not their whole name", gmFirst);
const gmInit = d([["https://g4.test/", page(`<p>Gwen Harlow</p><a href="mailto:gh@yahoo.com">write</a>`)]], "g4.test", "Gwen Harlow");
check("initials at a personal provider: rejected", !gmInit.ok, gmInit);
const gmOther = d([["https://g5.test/", page(`<p>Gwen Harlow</p><a href="mailto:pat.lee@gmail.com">write</a>`)]], "g5.test", "Gwen Harlow");
check("someone else's whole name at a personal provider: rejected", !gmOther.ok, gmOther);
const ownFirst = d([["https://g6.test/", page(`<p>Gwen Harlow</p><a href="mailto:gwen.harlow@gmail.com">a</a> <a href="mailto:gwen@g6.test">b</a>`)]], "g6.test", "Gwen Harlow");
check("an address at the site's own domain comes before a personal provider's", ownFirst.ok && ownFirst.email === "gwen@g6.test" && ownFirst.how === "name match", ownFirst);
check("why: only other companies' addresses", !other.ok && other.s === "email not theirs" && other.why === "only other companies' addresses", other);
check("why: role address on a team site", !big.ok && big.s === "email not theirs" && big.why === "role address on a team site", big);
check("why: role address, site doesn't name them", !unnamed.ok && unnamed.s === "email not theirs" && unnamed.why === "role address, site doesn't name them", unnamed);
const elses = d([["https://e.test/", page(`<p>Meet the team: Ivy Cole, Ron Dale</p><a href="mailto:ron@e.test">ron</a>`)]], "e.test", "Ivy Cole");
check("why: someone else's address on a team site", !elses.ok && elses.s === "email not theirs" && elses.why === "someone else's address on a team site", elses);

/* ---------- the mock web ---------- */

const hits: string[] = [];
const sites: Record<string, Record<string, string> & { robots?: string }> = {
  "quinlanadvisory.test": {
    "/": page(`<nav><a href="/contact-us">Contact</a><a href="/about">About</a></nav><p>Avery Quinlan, fractional CRO for B2B software.</p>`),
    "/contact-us": page(`<a href="mailto:info@quinlanadvisory.test">info@quinlanadvisory.test</a> or <a href="mailto:avery@quinlanadvisory.test">avery@quinlanadvisory.test</a>`),
    "/about": page(`<p>Avery Quinlan has run sales at three startups.</p>`),
  },
  "ortezgrowth.test": { "/": page(`<a href="/about">About</a>`), "/about": page(`<p>Blake Ortez. Write to blake [at] ortezgrowth [dot] test.</p>`) },
  "wrenpartners.test": { "/": page(`<h1>Casey Wren</h1><p>I help founders build their first sales team.</p><a href="/contact">Contact</a>`), "/contact": page(`<a href="mailto:hello@wrenpartners.test">hello@wrenpartners.test</a>`) },
  "pikecollective.test": { "/": page(`<h2>Our team</h2><p>Dana Pike</p><p>Rory Stone</p><p>Tess Arden</p><a href="mailto:info@pikecollective.test">info@pikecollective.test</a>`) },
  "marrcfo.test": { "/": page(`<p>Ellis Marr, fractional CFO.</p><a href="mailto:ellis.marr@gmail.test">ellis.marr@gmail.test</a>`) },
  "halestrategy.test": { robots: "User-agent: *\nDisallow: /\n", "/": page(`<a href="mailto:finn@halestrategy.test">finn@halestrategy.test</a>`) },
  "lundventures.test": {
    "/": page(
      ["contact", "contact-2", "about", "about-team", "team", "our-team", "meet", "bio", "story", "people"].map((x) => `<a href="/${x}">${x}</a>`).join(" ") + `<a href="https://elsewhere.test/contact">elsewhere</a><p>Gray Lund</p>`,
    ),
    ...Object.fromEntries(["contact", "contact-2", "about", "about-team", "team", "our-team", "meet", "bio", "story", "people"].map((x) => [`/${x}`, page(`<p>${x}</p><a href="/${x}-more">more contact</a>`)])),
  },
  "sorelgroup.test": { robots: "User-agent: *\nDisallow: /contact\n", "/": page(`<p>Kit Sorel</p><a href="/contact">Contact</a>`), "/contact": page(`<a href="mailto:kit@sorelgroup.test">kit@sorelgroup.test</a>`) },
  "kentwoodadvisory.com": { "/": page(`<h1>Kentwood Advisory</h1><p>Jules Kentwood, founder.</p><a href="/contact">Contact</a>`, "Kentwood Advisory"), "/contact": page(`<a href="mailto:jules@kentwoodadvisory.com">jules@kentwoodadvisory.com</a>`) },
  "brookfieldadvisory.test": { "/": page(`<p>Nell Brookfield helps founders hire their first CFO.</p><a href="/contact">Contact</a>`), "/contact": page(`<a href="mailto:nell@brookfieldadvisory.test">nell@brookfieldadvisory.test</a>`) },
  "elsewhere.test": { "/contact": page(`<a href="mailto:gray@elsewhere.test">gray@elsewhere.test</a>`) },
  // A team firm (not on the seed): the person's own bio page is linked from the team page, past the usual pages.
  "tollandgroup.test": {
    "/": page(`<h2>Our team</h2><a href="/contact">Contact</a><a href="/about">About</a><a href="/team">Team</a><a href="/our-story">Story</a><p>Rhea Tolland and Sol Brand</p>`),
    "/contact": page(`<a href="mailto:info@tollandgroup.test">info@tollandgroup.test</a>`),
    "/about": page(`<p>We are a team of advisors.</p>`),
    "/team": page(`<h1>Our team</h1><a href="/team/rhea-tolland">Rhea Tolland</a> <a href="/team/sol-brand">Sol Brand</a>`),
    "/our-story": page(`<p>Since 2019.</p>`),
    "/team/rhea-tolland": page(`<h1>Rhea Tolland</h1><p>Rhea Tolland runs finance for growth companies.</p><a href="mailto:rt.finance@tollandgroup.test">Email Rhea</a>`, "Rhea Tolland"),
    "/team/sol-brand": page(`<h1>Sol Brand</h1><a href="mailto:sb.ops@tollandgroup.test">Email Sol</a>`, "Sol Brand"),
  },
};
const server = createServer((req: IncomingMessage, res: ServerResponse) => {
  const host = (req.headers.host ?? "").replace(/:\d+$/, "");
  const p = (req.url ?? "/").replace(/\?.*$/, "");
  hits.push(`${host}${p}`);
  const s = sites[host];
  if (p === "/robots.txt") {
    if (s?.robots) {
      res.writeHead(200, { "content-type": "text/plain" });
      return res.end(s.robots);
    }
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("none");
  }
  const body = s?.[p];
  if (body === undefined || p === "robots") {
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("not here");
  }
  res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
  res.end(body);
});
await new Promise<void>((ok) => server.listen(PORT, "127.0.0.1", ok));
const fo = { resolve: async () => ["127.0.0.1"], allow: { loopback: true, port: PORT }, timeoutMs: 1500 };
// The website finder's DNS: only Kentwood Advisory's .com resolves.
const dns = async (h: string) => {
  if (h === "kentwoodadvisory.com") return ["127.0.0.1"];
  throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${h}`), { code: "ENOTFOUND" });
};
const readOpts = { fetch: fo, delayMs: 0, find: { resolve: dns } };

/* ---------- the reader on the mock web ---------- */
console.log("\nThe reader");

const R = await import("../lib/ownsites/read");
const read = (name: string, site?: string, firm?: string) => R.readOwnSite({ key: "p_test", name, ...(site ? { site } : {}), ...(firm ? { firm } : {}) }, readOpts);
const avery = await read("Avery Quinlan", "quinlanadvisory.test");
check("Avery: found on the linked contact page, a name match", avery.s === "found" && avery.email === "avery@quinlanadvisory.test" && avery.how === "name match" && /\/contact-us$/.test(avery.page), avery);
const hale = await read("Finn Hale", "halestrategy.test");
check("robots.txt refusing the whole site: nothing read past robots.txt", hale.s === "robots" && !hits.includes("halestrategy.test/"), { hale, hits: hits.filter((h) => h.startsWith("halestrategy")) });
const sorel = await read("Kit Sorel", "sorelgroup.test");
check("robots.txt refusing /contact: that page is never requested", sorel.s !== "found" && !hits.includes("sorelgroup.test/contact"), { sorel, hits: hits.filter((h) => h.startsWith("sorel")) });
hits.length = 0;
const lund = await read("Gray Lund", "lundventures.test");
const lundPages = hits.filter((h) => h.startsWith("lundventures.test/") && h !== "lundventures.test/robots.txt");
check("at most 5 pages of a site, the homepage included", lund.pages <= 5 && lundPages.length <= 5, { pages: lund.pages, lundPages });
check("same site only: a page on another site is never read", !hits.some((h) => h.startsWith("elsewhere.test")) && lund.s === "no email", { hits, lund });
const kent = await read("Jules Kentwood", undefined, "Kentwood Advisory");
check("a firm known by name: its site found (it names the firm and the person), then read", kent.s === "found" && kent.email === "jules@kentwoodadvisory.com" && kent.s === "found" && kent.lookedUp === "kentwoodadvisory.com", kent);
const none = await read("Nora Blank", undefined, "Zzqx Nothing Advisory");
eq("a firm whose site can't be found: no site found", none.s, "no site found");
const down = await read("Una Dowling", "dowlingconsulting.test");
eq("a site that doesn't answer: site unreachable", down.s, "site unreachable");
hits.length = 0;
const rhea = await read("Rhea Tolland", "tollandgroup.test");
const tollandPages = hits.filter((h) => h.startsWith("tollandgroup.test/") && h !== "tollandgroup.test/robots.txt");
check("their bio page, linked from the team page past the usual pages: read, and its address is theirs (bio page)", rhea.s === "found" && rhea.email === "rt.finance@tollandgroup.test" && rhea.how === "bio page", rhea);
check(`  at most ${types0.PAGE_CAP} pages and ${types0.BIO_PAGES} more for a bio page, never someone else's bio page`, tollandPages.length <= types0.PAGE_CAP + types0.BIO_PAGES && rhea.pages <= types0.PAGE_CAP + types0.BIO_PAGES && !tollandPages.includes("tollandgroup.test/team/sol-brand"), tollandPages);

/* ---------- the table, in process ---------- */

writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: Object.fromEntries(seed.companies.map((c) => [`${c.id}.identity`, ["m_sal"]])),
    seen: { m_sal: iso(-1) },
    profiles: { m_sal: { function: "Sales", title: "Fractional VP Sales", onboarded: true }, m_blake: { function: "Marketing", title: "Fractional CMO", onboarded: true, fractionals: false } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: seedFile,
  RN_INTEL_SEED_KEY: TEST_KEY,
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-own@example.com",
  RN_LOGO_LOOKUP: "off",
  RN_FREE_COMPANY: "off",
  RN_PUBLIC_URL: "https://post.example.com",
});
for (const k of ["RN_OWNSITES", "RN_OWNSITES_DRYRUN", "RN_LEADERS", "RN_ABOUT", "RN_WEBSITES", "RN_SCAN_TEST", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BILLING", "STRIPE_SECRET_KEY", "RESEND_API_KEY", "RN_EMAIL_FROM", "RN_SCHEDULER"]) delete process.env[k];

const table = await import("../lib/table");
const run = await import("../lib/ownsites/run");
const store = await import("../lib/ownsites/store");
const types = await import("../lib/ownsites/types");
const stateOnDisk = () => JSON.parse(readFileSync(path.join(dir, "intel.json"), "utf8"));
const view = (tok: string) => table.buildView(tok, { fresh: true });
type V = Awaited<ReturnType<typeof view>>;
const ownPeople = (v: V) => v.companies.flatMap((c) => c.engagements.flatMap((e) => e.people.filter((p) => p.source === types.OWNSITE_SOURCE).map((p) => ({ c, e, p }))));
const waitIdle = async () => {
  for (let i = 0; i < 400 && run.ownSitesRunning(); i++) await new Promise((r) => setTimeout(r, 50));
};
const secretsIn = (text: string) =>
  people.flatMap((p) => [p.name, p.name.split(" ")[0], p.name.split(" ")[1], p.site ?? "@@@", p.firm]).filter((x) => text.toLowerCase().includes(x.toLowerCase())).concat(/@/.test(text) ? ["an @"] : []).concat(/\.test\b|\.com\b/.test(text) ? ["a domain"] : []);

console.log("\nThe start-up dry run (RN_OWNSITES_DRYRUN)");
const order = await store.ownTargets({ dry: true });
const firstLookup = order.findIndex((t) => !t.site);
check(
  "known sites first, seat holders and prospects alike, then firm-name lookups",
  firstLookup === order.length - 1 && order[firstLookup].key === personKeyOf("SNAV-JULES-010") && order.some((t) => t.key === personKeyOf("SNAV-NELL-015") && t.prospect),
  order.map((t) => [t.site ? "site" : "firm", t.prospect ? "prospect" : "seat"]),
);
const logs: string[] = [];
const realLog = console.log;
const realErr = console.error;
console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
console.error = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
const started = await run.maybeOwnSitesDry({ env: { RN_OWNSITES_DRYRUN: "50" }, run: { read: readOpts, delayMs: 0, logEvery: 4, log: (l) => console.log(l) } });
await waitIdle();
const again = await run.maybeOwnSitesDry({ env: { RN_OWNSITES_DRYRUN: "50" }, run: { read: readOpts, delayMs: 0, log: (l) => console.log(l) } });
await waitIdle();
console.log = realLog;
console.error = realErr;
check("it starts once", started === true && again === false, { started, again });
const doneLine = logs.find((l) => l.startsWith("ownsites dry run (RN_OWNSITES_DRYRUN=50) done: "));
check("its log: a progress line every so many people and one at the end, the counts by reason and by how", !!doneLine && logs.some((l) => /RN_OWNSITES_DRYRUN=50\): \d+ of \d+ tried: .*s so far$/.test(l)) && /tried: \d+ no site found, \d+ site unreachable, \d+ blocked by robots, \d+ no email on site, \d+ accepted \(\d+ name match, \d+ nickname match, \d+ on their bio page, \d+ only address on a one-person site, \d+ generic inbox on a one-person site \(invites only\), \d+ name match on a personal address\), \d+ rejected \(not theirs\); \d+ pages read; [\d.]+s; nothing made usable$/.test(doneLine ?? ""), logs);
check("its log names nobody: no email, no domain, no name, no firm", logs.every((l) => !secretsIn(l).length), logs.map((l) => [l, secretsIn(l)]));
const dryRun = stateOnDisk().ownSitesJob?.lastDry;
eq(
  "it read the 9 linked people who may be read (not Blake, a member who keeps himself out of view) and Nell, a prospect: 4 accepted (3 name match, 1 generic inbox on a one-person site), 2 robots, 1 unreachable, 2 not theirs, 1 no email",
  dryRun && [dryRun.tried, dryRun.accepted, dryRun.byHow["name match"], dryRun.byHow["generic inbox, one-person site"], dryRun.robots, dryRun.unreachable, dryRun.notTheirs, dryRun.noEmail],
  [10, 4, 3, 1, 2, 1, 2, 1],
);
const st1 = stateOnDisk();
check("what it found is stored pending, never usable", Object.values(st1.ownEmails ?? {}).length > 0 && Object.values(st1.ownEmails ?? {}).every((e) => (e as { pending?: boolean }).pending === true), st1.ownEmails);
eq("it is marked done for N=50, so a restart doesn't repeat it", st1.ownSitesJob.dryDone, [50]);
process.env.RN_OWNSITES = "1";
let sal = await view("tok-sal-own");
check("even with RN_OWNSITES=1, a dry run's find shows nowhere", ownPeople(sal).length === 0 && !JSON.stringify(sal).includes("quinlanadvisory"));
delete process.env.RN_OWNSITES;

console.log("\nThe switch");
const realRun = await run.runOwnSites({ read: readOpts, delayMs: 0, limit: 50, log: () => {} });
check("a real run reads the people the dry run read (a dry try holds nobody back)", realRun.tried === 10 && realRun.accepted === 4, realRun);
const st2 = stateOnDisk();
check("its finds are stored usable, by person key", st2.ownEmails[personKeyOf("SNAV-AVERY-001")]?.email === "avery@quinlanadvisory.test" && !st2.ownEmails[personKeyOf("SNAV-AVERY-001")].pending, st2.ownEmails);
const caseyStored = st2.ownEmails[personKeyOf("SNAV-CASEY-003")];
check("a generic inbox on a one-person site is stored flagged invites only", caseyStored?.email === "hello@wrenpartners.test" && caseyStored.invitesOnly === true && caseyStored.how === "generic inbox, one-person site" && !st2.ownEmails[personKeyOf("SNAV-AVERY-001")].invitesOnly, caseyStored);
await table.tableInternals.mutate(() => {});
sal = await view("tok-sal-own");
check("switch off: nothing usable anywhere (no record, no address in the member's table)", ownPeople(sal).length === 0 && !JSON.stringify(sal).includes("quinlanadvisory") && !JSON.stringify(sal).includes("@wrenpartners"));

process.env.RN_OWNSITES = "1";
await table.tableInternals.mutate(() => {});
sal = await view("tok-sal-own");
const recs = ownPeople(sal);
const averyRecs = recs.filter(({ e }) => e.cells.operator.s === "locked" || e.cells.operator.s === "value").filter(({ c }) => /Clientco A|Secondco A/.test(c.name));
eq(
  "switch on: a record on each of the accepted people's seats (Avery has two), none for Blake, a member who keeps himself out of view, and none for Casey's generic inbox (invites only)",
  [recs.length, averyRecs.length, recs.filter(({ c }) => /Clientco B/.test(c.name)).length, recs.filter(({ c }) => /Clientco C/.test(c.name)).length],
  [3, 2, 0, 0],
);
check("  the invites-only address is nowhere in the member's table", !JSON.stringify(sal).includes("hello@wrenpartners"));
const ar = averyRecs.find(({ c }) => c.name.startsWith("Clientco"))!;
// Fellow fractionals are free (PEERS_FREE): Sal knows these companies, so who held the seat (the record's name) shows free.
// The email they publish is a contact detail and keeps its price.
check(
  "the record: the seat holder, the name free with the seat, the email for the email finder only (private, never for sale)",
  ar.p.cells.relationship.s === "value" && ar.p.cells.relationship.v === types.OWNSITE_RELATIONSHIP && ar.p.cells.name.s === "value" && ar.p.cells.name.v === "Avery Quinlan" && ar.e.cells.operator.s === "value" && ar.p.cells.email.s === "empty" && (ar.p.cells.email as { find?: true }).find === true,
  ar.p.cells,
);
check("nothing of the address goes out while locked", !JSON.stringify(sal.companies).includes("avery@"));
const credits = async (tok: string) => (await view(tok)).me!.credits;
const refused = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
    return null;
  } catch (e) {
    return (e as Error).message;
  }
};
const BASE = "https://post.example.com";
const c0 = await credits("tok-sal-own");
check("the record's name has nothing to buy", /Nothing here is locked/.test((await refused(() => table.perform("tok-sal-own", { type: "unlock", entity: "contact", id: ar.p.id, field: "name" }, BASE))) ?? "") && (await credits("tok-sal-own")) === c0);
check("the email is not for sale (the email finder's results are private)", /Nothing here is locked/.test((await refused(() => table.perform("tok-sal-own", { type: "unlock", entity: "contact", id: ar.p.id, field: "email" }, BASE))) ?? "") && (await credits("tok-sal-own")) === c0);
await table.perform("tok-sal-own", { type: "findEmail", id: ar.p.id }, BASE);
sal = await view("tok-sal-own");
let a2 = ownPeople(sal).find(({ p }) => p.id === ar.p.id)!;
check("the email finder opens it for this member only, free, From their website", a2.p.cells.email.s === "value" && a2.p.cells.email.v === "avery@quinlanadvisory.test" && a2.p.cells.email.from === "ownsite" && (a2.p.cells.email as { found?: true }).found === true && (await credits("tok-sal-own")) === c0, a2.p.cells.email);
eq("nothing can be added to the record: it comes from the seat", await refused(() => table.perform("tok-sal-own", { type: "fill", entity: "contact", id: ar.p.id, field: "phone", value: "+1 555 010 0000" }, BASE)), table.OWN_RECORD_NO_ADD);
// Their other seat: the name shows free there too, and the email they paid for shows at no charge.
const o3 = ownPeople(sal).find(({ c }) => c.name.startsWith("Secondco A"))!;
check("their other seat: the name shows, and the email found for them shows too, at no charge", o3.e.cells.operator.s === "value" && o3.p.cells.email.s === "value" && (await credits("tok-sal-own")) === c0, { op: o3.e.cells.operator, email: o3.p.cells.email });
// Invite to connect: the app's Drawer writes to the seat's person with the holder's name and a visible email (emailOnFile).
const emailOnFile = (e: (typeof a2)["e"], name: string) => e.people.find((p) => p.cells.name?.s === "value" && p.cells.name.v === name && p.cells.email?.s === "value");
check("Invite to connect picks it: the seat has its claim link, and the seat holder's email on file for Email it", !!a2.e.invite?.path && (emailOnFile(a2.e, "Avery Quinlan")?.cells.email as { v?: string } | undefined)?.v === "avery@quinlanadvisory.test", a2.e.invite);
const { personOut } = await import("../lib/mcp/tools");
const outLocked = personOut(ownPeople(sal).find(({ c }) => /Clientco J/.test(c.name))!.p);
const outOpen = personOut(a2.p);
check("the connector: an email nobody found for this member never goes out; the member's own find does", !JSON.stringify(outLocked).includes("@") && outOpen.email === "avery@quinlanadvisory.test", { outLocked, outOpen });
const admin = await view("tok-admin-own");
check("an admin's table follows the same rules (the record, From their website; never the invites-only inbox)", ownPeople(admin).length === 3 && !JSON.stringify(admin).includes("hello@wrenpartners"));
const exported = JSON.stringify(await table.exportState());
check("the export carries no invites-only address (the usable ones stay, as before)", !exported.includes("hello@wrenpartners") && exported.includes("avery@quinlanadvisory.test"));
// Prospects: found and stored, never anywhere a member or an admin reads the table, Fractionals or the connector.
const nellEmail = stateOnDisk().ownEmails[personKeyOf("SNAV-NELL-015")];
check("a prospect's email is found and stored, marked prospect", nellEmail?.email === "nell@brookfieldadvisory.test" && nellEmail.prospect === true && !nellEmail.pending, nellEmail);
const { fractionalsView } = await import("../lib/fractionals");
const noNell = (x: unknown) => !/brookfield|nell@/i.test(JSON.stringify(x ?? null));
check("never in a member's table, an admin's, or Fractionals", noNell(sal) && noNell(admin) && noNell(await fractionalsView("tok-sal-own")) && noNell(await fractionalsView("tok-admin-own")));
const mcp = await import("../lib/mcp/view");
const connectorView = await mcp.memberView({ id: "m_sal", name: "Sal Seller", email: "sal-own@example.com", title: "Fractional VP Sales", token: "tok-sal-own" } as never).catch(() => null);
check("never in the connector's view of the table", connectorView !== null && noNell(connectorView), connectorView === null ? "no view" : undefined);
check("the connector's view never carries the invites-only inbox", connectorView !== null && !JSON.stringify(connectorView).includes("hello@wrenpartners"));

console.log("\nClaim outreach");
const stateCopy = path.join(dir, "state-copy.json");
writeFileSync(stateCopy, JSON.stringify(stateOnDisk()));
const outCsvDir = mkdtempSync(path.join(tmpdir(), "rn-own-out-"));
// The seat file claim-outreach reads: seat_id rows whose seats (scanSeatId) are on the seed.
const { scanSeatId } = await import("./seat-import.mjs");
const outSeed = JSON.parse(readFileSync(seedFile, "utf8"));
const seatIds = new Map<string, string>();
outSeed.engagements = outSeed.engagements.map((e: { id: string; holderKey: string }, i: number) => {
  const sid = `SEAT-${i}`;
  const id = scanSeatId(Buffer.from(TEST_KEY, "base64"), sid);
  seatIds.set(e.id, id);
  return { ...e, id };
});
const outSeedFile = path.join(dir, "outreach-seed.json");
writeFileSync(outSeedFile, JSON.stringify(outSeed));
const outRows = outSeed.engagements.map((_: unknown, i: number) => ({ seat_id: `SEAT-${i}`, company_name: "", company_sales_nav_id: "", seat_title: "", person_sales_nav_id: "", country: "United States" }));
writeFileSync(path.join(dir, "outreach-seats.csv"), csv(outRows));
const outreach = (on: boolean) =>
  spawnSync(process.execPath, [path.join(ROOT, "scripts", "claim-outreach.mjs"), path.join(outCsvDir, "out.csv"), "--csv", path.join(dir, "outreach-seats.csv"), "--seed", outSeedFile, "--state", stateCopy], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, RN_INTEL_SEED_KEY: TEST_KEY, RN_OWNSITES: on ? "1" : "0" },
  });
const ox = outreach(true);
const oText = existsSync(path.join(outCsvDir, "out.csv")) ? readFileSync(path.join(outCsvDir, "out.csv"), "utf8") : "";
check("with RN_OWNSITES=1 the outreach file carries the email from their website", ox.status === 0 && oText.includes("avery@quinlanadvisory.test,their website") && /with an email from their website: [1-9]/.test(ox.stdout), ox.stdout + ox.stderr);
check("  a generic inbox goes in for the invite to Merlin only, marked so", oText.includes("hello@wrenpartners.test,their website (generic inbox; invites to Merlin only)") && !oText.includes("avery@quinlanadvisory.test,their website (generic"), oText.split("\n").filter((l) => l.includes("wrenpartners")));
outreach(false);
const oOff = readFileSync(path.join(outCsvDir, "out.csv"), "utf8");
check("with it off, no email goes in the file", !oOff.includes("@quinlanadvisory"));
const joinFile = path.join(outCsvDir, "out.join.csv");
outreach(true);
const jText = existsSync(joinFile) ? readFileSync(joinFile, "utf8") : "";
const claimText = readFileSync(path.join(outCsvDir, "out.csv"), "utf8");
check(
  "prospects go in a separate join list: their email, and an invite to join Merlin (no seat to claim) that says how to be taken off",
  jText.startsWith("first_name,full_name,firm,site,email,email_from,join_link,message") && jText.includes("nell@brookfieldadvisory.test,their website") && /Joining is free/.test(jText) && !/claim/i.test(jText) && /\/remove takes your name and email off/.test(jText),
  jText,
);
check("  and never in the claim list", !/brookfield/i.test(claimText));
outreach(false);
check("  with RN_OWNSITES off, the join list has no one", (existsSync(joinFile) ? readFileSync(joinFile, "utf8") : "").trim().split("\n").length === 1);
rmSync(outCsvDir, { recursive: true, force: true });
void seatIds;

console.log("\nRemove my name");
const before3 = await credits("tok-sal-own");
const n = await table.nameOffByName("Avery Quinlan", "Clientco A Systems");
const st3 = stateOnDisk();
sal = await view("tok-sal-own");
check("Remove my name takes the name off and the email with it, on every seat of theirs", n >= 1 && !st3.ownEmails[personKeyOf("SNAV-AVERY-001")] && !ownPeople(sal).some(({ c }) => /Clientco A|Secondco A/.test(c.name)) && !JSON.stringify(sal).includes("avery@"), { n, recs: ownPeople(sal).map(({ c }) => c.name) });
// The email finder's results are free and private now, so nobody paid for this one: no credit moves (a purchase from before the rule is refunded by refundOwnEmails).
check("no credit moves: the finder's email was never sold", (await credits("tok-sal-own")) === before3, { before3, after: await credits("tok-sal-own") });
eq("and the job never reads their site again", st3.ownSitesJob.people[personKeyOf("SNAV-AVERY-001")].s, "removed");
const targets = await store.ownTargets({ dry: true });
check("  not even a dry run", !targets.some((t) => t.key === personKeyOf("SNAV-AVERY-001")));

eq("Remove my name for a prospect, by their own firm's website: their email goes", await table.nameOffByName("Nell Brookfield", "brookfieldadvisory.test"), 1);
check("  stored nowhere after, never read again, not even by a dry run", !stateOnDisk().ownEmails[personKeyOf("SNAV-NELL-015")] && stateOnDisk().ownSitesJob.people[personKeyOf("SNAV-NELL-015")].s === "removed" && !(await store.ownTargets({ dry: true })).some((t) => t.key === personKeyOf("SNAV-NELL-015")));
writeFileSync(stateCopy, JSON.stringify(stateOnDisk()));
outreach(true);
check("  and off the join list", !/brookfield/i.test(existsSync(joinFile) ? readFileSync(joinFile, "utf8") : ""));
rmSync(outCsvDir, { recursive: true, force: true });

console.log("\nPrivacy and the US rule");
check("only people the import linked (United States, never California): Harper and Lee have no record", !ownPeople(sal).some(({ c }) => /Clientco H|Clientco M/.test(c.name)));

console.log("\nAutomatic jobs");
const S = await import("../lib/schedule");
const J = await import("../lib/jobs");
check("own sites is a job, every day at 04:00 UTC by default", S.JOBS.includes("ownsites") && JSON.stringify(S.settingOf(null, "ownsites")) === JSON.stringify({ every: "daily", hourUtc: 4 }));
eq("its switch: RN_OWNSITES=1", [S.envOff("ownsites", {}), S.envOff("ownsites", { RN_OWNSITES: "1" })], ["Off: set RN_OWNSITES=1 in Railway", null]);
const panel = await J.jobsPanel();
const row = panel.jobs.find((j) => j.id === "ownsites");
check("its row has Dry run and the last dry run's counts", !!row && row.canDry === true && /^Dry run \d{4}-\d{2}-\d{2}: \d+ of \d+ tried/.test(row.dryNote ?? ""), row);
const stats = await store.ownStats();
check("the admin's counts: usable apart from invites only", stats.linked === 10 && stats.prospects === 1 && stats.usable === 1 && stats.invitesOnly === 1 && stats.removed === 2, stats);
const sample = await store.ownSample();
check("the admin's sample: the seat holder, the email, the site, invites only", sample.rows.some((r) => r.name === "Casey Wren" && r.email === "hello@wrenpartners.test" && r.how === "generic inbox, one-person site" && r.invitesOnly === true), sample);
const due = await run.maybeOwnSites({ nowMs: Date.now(), run: { read: readOpts, delayMs: 0, log: () => {} } });
await waitIdle();
check("the daily job runs on its schedule with the switch on", due === true || stateOnDisk().ownSitesJob.lastRun !== null);
const casey = stateOnDisk().ownEmails[personKeyOf("SNAV-CASEY-003")];
const before4 = await credits("tok-sal-own");
check("(Casey's invites-only inbox has no record to unlock)", !!casey && !ownPeople(await view("tok-sal-own")).some(({ c }) => /Clientco C/.test(c.name)));
const julesRec = ownPeople(await view("tok-sal-own")).find(({ c }) => /Clientco J/.test(c.name))!;
// Who held Jules's seat is free (PEERS_FREE); the email opens with the email finder, free and for this member only.
await table.perform("tok-sal-own", { type: "findEmail", id: julesRec.p.id }, BASE);
check("(Jules's email, found free, the name free)", (await credits("tok-sal-own")) === before4);
const undone = await store.undoOwnEmails("m_admin");
sal = await view("tok-sal-own");
check("Undo takes every found email back (no credit was spent on them)", undone === 2 && ownPeople(sal).length === 0 && Object.keys(stateOnDisk().ownEmails).length === 0 && (await credits("tok-sal-own")) === before4, { undone, credits: await credits("tok-sal-own") });
check("  and those people are not read again on their own", !(await store.ownTargets()).some((t) => t.key === personKeyOf("SNAV-CASEY-003")));

server.close();
rmSync(dir, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
