/**
 * Checks of the company lock: every company's identity (name, website, LinkedIn) is locked for a
 * member until they unlock it for COMPANY_PRICE credits or already know it (they added to it,
 * held a seat there, or paid for anything there). Its About shows without its name, web address,
 * links and emails, and its logo through GET /api/logo/<id> (lib/logo.ts) with the icon services
 * replaced, never with the domain in the page. No server: lib/table.ts runs in
 * process on a made-up seed in a temporary data dir, with fetch replaced, so nothing leaves the
 * machine.
 *
 *   npx tsx scripts/test-company-lock.mts      exits 1 on any failure
 *
 * Covered: locked by default for a new member, the free facts still there, no real name, domain,
 * logo, website, LinkedIn or About anywhere in the member's view (packed and unpacked), Referral
 * partners, the radar, search (the table's and the Add form's lookup) or the connector's answers;
 * Unlock company charged once at 2 credits and idempotent, the daily limit counting it as 2, the
 * wall at 1 credit and at 0; companies the member already knows (held a seat, added a fact, paid
 * under the old rules) named; admins see everything and "See it as a member" doesn't; the
 * landing page's preview still names companies; who held a seat opens after the company; Add by
 * name opens only with something added; a removed company is paid back in full.
 *
 * The logo and the About: the route reads the icon from the company's own website only (a mock
 * server on 127.0.0.1 for every company's host: its <link rel="icon">, else /favicon.ico, robots.txt
 * first, never a link to another site, never Google, DuckDuckGo or Clearbit) and sends image bytes,
 * never a redirect or the site's headers, 204 with no body (no logo, so no console error) for an unknown id, a seat's id, no website or no icon
 * (an SVG included), from memory and then from the data volume without asking again; the web app
 * manifest (linked, else /site.webmanifest and /manifest.json), the JSON-LD Organization logo (a
 * wide wordmark passed over), /apple-touch-icon.png and /favicon.ico always, the largest icon of
 * 64px or more first; the landing page's logo ids (lp_<row seed>) for the companies it names
 * only, never a kept-back open-role company's or a blurred row's; nothing
 * fetched with RN_LOGO_LOOKUP=off, 429 past its per-address limit; every logo the page draws is our
 * own /api/logo/<public id>, a named company with no id gets its letters; the page's markup for a locked company points at /api/logo/<public id> and holds no icon
 * service address, domain or name; the plain tile has no letters. A locked company's About (GET
 * ?about=, get_company) reads "the company" for its name and drops its links and emails, the
 * unlocked and the found-by-name record get it whole, and aboutWithout's cases one by one.
 *
 * Found by exact name (the action "find", GET ?find=): a company's exact name or website names it
 * in that answer only, case, punctuation, a leading "The" and legal suffixes aside; a part of a
 * name, a prefix or a near miss finds nothing and says no count; the tables, Referral partners,
 * the radar and the connector's lists keep it locked, and a fresh view does too; the record from
 * the search shows its identity and About, with postings and holders at the usual prices; Unlock
 * company and a fact added there keep it named; a repeat the same day is free; the limits (25 new
 * a day on Free, 100 on Pro, 50 misses); the connector's find_company; Pilot metrics' counts.
 */
import http from "node:http";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import Module, { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// The company page imports its stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const dir = mkdtempSync(path.join(tmpdir(), "rn-lock-"));
const BASE = "https://post.example.com";
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/* ---------- the made-up seed ---------- */

/** Every company's identity: what must never reach a member who hasn't unlocked it. */
const CO = {
  acme: { id: "c_acmeworks", name: "Acmeworks Robotics", site: "acmeworks-robotics.example", linkedin: "linkedin.com/company/acmeworks-robotics", about: "Acmeworks builds warehouse robots for grocers." },
  blue: {
    id: "c_bluefin",
    name: "Bluefin Freightlines",
    site: "bluefin-freightlines.example",
    linkedin: "linkedin.com/company/bluefin-freightlines",
    about: "The Bluefin Freightlines, LLC team moves cold freight across the Gulf for bluefin-freightlines.example customers. Quotes: hello@bluefin-freightlines.example. Read more at https://www.bluefin-freightlines.example/about-us.",
  },
  cobalt: { id: "c_cobalt", name: "Cobaltharbor Analytics", site: "cobaltharbor.example", linkedin: "linkedin.com/company/cobaltharbor", about: "Cobaltharbor sells port analytics." },
  dun: { id: "c_dunmore", name: "Dunmorely Labs", site: "dunmorely.example", linkedin: "linkedin.com/company/dunmorely", about: "Dunmorely makes lab kits." },
  elm: { id: "c_elmstead", name: "Elmsteadia Bank", site: "elmsteadia.example", linkedin: "linkedin.com/company/elmsteadia", about: "Elmsteadia is a community bank." },
  fox: { id: "c_foxglove", name: "Foxglovia Health", site: "foxglovia.example", linkedin: "linkedin.com/company/foxglovia", about: "Foxglovia runs clinics." },
  gran: { id: "c_granite", name: "Granitepeak Outfitters", site: "granitepeak.example", linkedin: "linkedin.com/company/granitepeak", about: "Granitepeak sells gear." },
  holl: { id: "c_hollowell", name: "Hollowell Partners", site: "hollowell-partners.example", linkedin: "linkedin.com/company/hollowell-partners", about: "Hollowell advises family offices." },
  iris: { id: "c_irisdale", name: "Irisdale Media", site: "irisdale.example", linkedin: "linkedin.com/company/irisdale", about: "Irisdale publishes trade magazines." },
  halc: { id: "c_halcyon", name: "Halcyon Freight", site: "halcyon-freight.example", linkedin: "linkedin.com/company/halcyon-freight", about: "Halcyon Freight moves parcels." },
};
/** What a locked company's About reads before the unlock (lib/scan/clean.ts aboutWithout): no name, no domain, no link or email. */
const SCRUBBED = {
  acme: "The company builds warehouse robots for grocers.",
  blue: "The company team moves cold freight across the Gulf for the company customers.",
};
/** A company with no website and no icon on file: its logo is the plain tile. */
const NOSITE = { id: "c_nositeco", name: "Nositeco Widgets", site: "", linkedin: "", about: "" };
const coFields = (c: (typeof CO)[keyof typeof CO], extra: Record<string, string>) => ({ name: c.name, website: c.site, linkedin: c.linkedin, about: c.about, ...extra });
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, fields, verified: false });
const seed = {
  builtAt: ago(10),
  members: [
    { id: "m_nora", name: "Nora Newcomer", email: "nora@example.com", title: "Fractional CMO", token: "tok-nora-lock" },
    { id: "m_hank", name: "Hank Holdsworth", email: "hank@example.com", title: "Fractional VP Sales", token: "tok-hank-lock" },
    { id: "m_ada", name: "Ada Adderley", email: "ada@example.com", title: "Fractional COO", token: "tok-ada-lock" },
    { id: "m_olga", name: "Olga Oldbuyer", email: "olga@example.com", title: "Fractional CFO", token: "tok-olga-lock" },
    { id: "m_pete", name: "Pete Pennyless", email: "pete@example.com", title: "Fractional CRO", token: "tok-pete-lock" },
    { id: "m_zed", name: "Zed Zerocredit", email: "zed@example.com", title: "Fractional CRO", token: "tok-zed-lock" },
    { id: "m_cap", name: "Cara Capped", email: "cara@example.com", title: "Fractional CRO", token: "tok-cara-lock" },
    { id: "m_sam", name: "Sam Spammer", email: "sam@example.com", title: "Fractional CRO", token: "tok-sam-lock" },
    { id: "m_admin", name: "Avery Admin", email: "admin-lock@example.com", title: "Admin", token: "tok-admin-lock" },
    { id: "m_finn", name: "Finn Finder", email: "finn@example.com", title: "Fractional CMO", token: "tok-finn-lock" },
    { id: "m_fcap", name: "Fay Freecap", email: "fay@example.com", title: "Fractional CMO", token: "tok-fcap-lock" },
    { id: "m_pcap", name: "Pia Procap", email: "pia@example.com", title: "Fractional CMO", token: "tok-pcap-lock" },
    { id: "m_miss", name: "Milo Misser", email: "milo@example.com", title: "Fractional CMO", token: "tok-miss-lock" },
    // Owner review M2, the unlock prices against the ledger: one member a case, nothing else on their ledger.
    { id: "m_m2free", name: "Mia Freeopen", email: "mia-m2@example.com", title: "Fractional CMO", token: "tok-m2free-lock" },
    { id: "m_m2paid", name: "Pax Paidopen", email: "pax-m2@example.com", title: "Fractional CMO", token: "tok-m2paid-lock" },
    { id: "m_m2vis", name: "Vic Visible", email: "vic-m2@example.com", title: "Fractional CRO", token: "tok-m2vis-lock" },
  ],
  companies: [
    { id: CO.acme.id, fields: coFields(CO.acme, { hq: "Austin, TX", industry: "SaaS", revenue: "$1M–$5M", employees: "11–50" }) },
    { id: CO.blue.id, fields: coFields(CO.blue, { hq: "Houston, TX", industry: "Logistics", employees: "51–200" }) },
    { id: CO.cobalt.id, fields: coFields(CO.cobalt, { hq: "Boston, MA", industry: "SaaS" }) },
    { id: CO.dun.id, fields: coFields(CO.dun, { hq: "Denver, CO" }) },
    { id: CO.elm.id, fields: coFields(CO.elm, { hq: "Chicago, IL" }) },
    { id: CO.fox.id, fields: coFields(CO.fox, { hq: "Miami, FL" }) },
    { id: CO.gran.id, fields: coFields(CO.gran, { hq: "Portland, OR" }) },
    { id: CO.holl.id, fields: coFields(CO.holl, { hq: "New York, NY" }) },
    { id: CO.iris.id, fields: coFields(CO.iris, { hq: "Seattle, WA" }) },
    { id: CO.halc.id, fields: coFields(CO.halc, { hq: "Tulsa, OK", industry: "Logistics", revenue: "$5M–$20M", employees: "51–200" }) },
    { id: NOSITE.id, fields: { name: NOSITE.name, hq: "Reno, NV", industry: "Manufacturing" } },
  ],
  engagements: [
    // A past seat with its holder on file: who held it opens after the company.
    seat("e_acme_sales", CO.acme.id, { source: "Member success story", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Ended", start: "2024-02", end: "2024-11", operator: "Paula Pastholder" }),
    seat("e_acme_mkt", CO.acme.id, { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Active", start: "2025-06", end: "Ongoing" }),
    // An open role from our records, whose title names the company: the title is free, without the name.
    seat("e_blue_open", CO.blue.id, { source: "Demand scan", function: "Marketing", role: "Fractional CMO at Bluefin Freightlines", status: "Open role", posting: "https://bluefin-freightlines.example/jobs/cmo", rate: "$9k/mo", hours: "20" }),
    seat("e_cobalt_hank", CO.cobalt.id, { source: "Member success story", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Active", start: "2025-01", operator: "Hank Holdsworth" }),
    seat("e_dun", CO.dun.id, { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: "2025-03", end: "Ongoing" }),
    seat("e_elm", CO.elm.id, { source: "Seat scan", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Active", start: "2025-04", end: "Ongoing" }),
    seat("e_fox_open", CO.fox.id, { source: "Demand scan", function: "Sales", role: "Fractional CRO", status: "Open role", posting: "https://foxglovia.example/careers/cro" }),
    seat("e_gran", CO.gran.id, { source: "Seat scan", function: "RevOps", role: "Fractional RevOps Lead", type: "Fractional", status: "Active", start: "2025-05", end: "Ongoing" }),
    seat("e_holl", CO.holl.id, { source: "Seat scan", function: "Sales", role: "Fractional VP Sales", type: "Fractional", status: "Active", start: "2025-07", end: "Ongoing" }),
    // An open role at a company the landing page lists (industry and revenue on file): named there while open-role companies are, kept back otherwise.
    seat("e_halc_open", CO.halc.id, { source: "Demand scan", function: "Marketing", role: "Head of Marketing", status: "Open role" }),
    seat("e_iris", CO.iris.id, { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Active", start: "2025-08", end: "Ongoing" }),
  ],
  contacts: [{ id: "p_gran_ceo", companyId: CO.gran.id, fields: { name: "Gwen Granitehead", title: "CEO", relationship: "Decision maker", email: "gwen@granitepeak.example" } }],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
/** A company a member added (Sam): it can be removed with everything Sam added, and whoever paid for it is paid back. */
const SPAM = { id: "c_spamwise", name: "Spamwise Holdings", site: "spamwise-holdings.example" };
const v = (value: string, by: string, at = ago(5)) => ({ value, by, at, status: "live" });
// Cara is in her first 24 hours with 24 of her 25 day-one unlocks used (old rows, 1 credit each), and 100 credits to spend.
const capRows = Array.from({ length: 24 }, (_, k) => ({ memberId: "m_cap", delta: -1, reason: "unlock", ref: `e_iris.x${k}`, at: ago(0.1) }));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    members: [{ id: "m_cap", name: "Cara Capped", email: "cara@example.com", title: "Fractional CRO", token: "tok-cara-lock", at: ago(0.2) }],
    ledger: [
      // Olga bought under the old rules: a company (1 credit), an open role's posting at another, a person's name at a third.
      { memberId: "m_olga", delta: -1, reason: "unlock", ref: `${CO.elm.id}.identity`, at: ago(30) },
      { memberId: "m_olga", delta: -1, reason: "unlock", ref: "e_fox_open.posting", at: ago(30) },
      { memberId: "m_olga", delta: -1, reason: "unlock", ref: "p_gran_ceo.name", at: ago(30) },
      // Pete has 1 credit left, Zed none. Pete used today's free company already (on a company gone since).
      { memberId: "m_pete", delta: -24, reason: "reversal", ref: "x.y", at: ago(30) },
      { memberId: "m_pete", delta: 0, reason: "unlock", ref: "c_gone_free.identity", at: ago(0), why: "free" },
      { memberId: "m_zed", delta: -25, reason: "reversal", ref: "x.y", at: ago(30) },
      { memberId: "m_cap", delta: 100, reason: "plan", ref: "plan", at: ago(0.1) },
      // Pax used today's free company already (on a company gone since), so his next company is paid.
      { memberId: "m_m2paid", delta: 0, reason: "unlock", ref: "c_gone_free2.identity", at: ago(0), why: "free" },
      ...capRows,
    ],
    unlocks: { [`${CO.elm.id}.identity`]: ["m_olga"], "e_fox_open.posting": ["m_olga"], "p_gran_ceo.name": ["m_olga"] },
    companies: [{ id: SPAM.id, name: SPAM.name, by: "m_sam", at: ago(3) }],
    // Fay has looked up 24 companies by name today (Free: 25), Pia 99 (Pro: 100), Milo has 49 lookups that matched nothing (50).
    found: {
      m_fcap: Array.from({ length: 24 }, (_, k) => ({ id: `c_gone${k}`, at: ago(0.2) })),
      m_pcap: Array.from({ length: 99 }, (_, k) => ({ id: `c_gone${k}`, at: ago(0.2) })),
      // Yesterday's lookups don't count today.
      m_finn: [{ id: "c_gone_old", at: ago(2) }],
    },
    findMisses: { m_miss: Array.from({ length: 49 }, () => ago(0.2)) },
    billing: { members: { m_pcap: { proUntil: new Date(NOW + 20 * DAY).toISOString(), interval: "month" } }, events: [], payments: [], ended: [] },
    values: {
      // Ada added the industry at Dunmorely: she knows it.
      [`${CO.dun.id}.industry`]: v("Biotech", "m_ada"),
      // Vic added a fact at Foxglovia: the company is already visible to him (its open role's posting is still locked).
      [`${CO.fox.id}.employees`]: v("201–500", "m_m2vis"),
      [`${SPAM.id}.website`]: v(SPAM.site, "m_sam"),
      [`${SPAM.id}.industry`]: v("SaaS", "m_sam"),
    },
    // Who leads Sales at Acmeworks, read from its own site (lib/leaders): a free fact, its page link the company's own.
    leaders: {
      [CO.acme.id]: { status: "found", checkedAt: ago(2), functions: { Sales: { level: "VP", kind: "full-time", since: "2024", how: "team page", url: `https://${CO.acme.site}/team`, seenAt: ago(2) } } },
    },
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(1)])),
    profiles: Object.fromEntries(seed.members.map((m) => [m.id, { title: m.title, onboarded: true }])),
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-lock@example.com",
  RN_PUBLIC_URL: BASE,
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_BILLING"]) delete process.env[k];

/* ---------- the network, replaced ---------- */

/** A PNG or ICO header of the given width, as the icon services send them (lib/logo.ts reads the width). */
const png = (w: number) => {
  const b = new Uint8Array(40);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, w);
  return b;
};
const ico = (w: number) => Uint8Array.from([0, 0, 1, 0, 1, 0, w, w, 0, 0, 1, 0, 32, 0, 9, 9, 9, 9, 22, 0, 0, 0]);
/** Every request the code made, with how it asked to treat redirects. */
const fetched: { url: string; redirect?: string }[] = [];
/** fetch, replaced: nothing leaves the machine. The logo never uses it (it reads sites through lib/about/fetch.ts), so any icon service here is a failure. */
globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input instanceof Request ? input.url : input);
  fetched.push({ url, redirect: init?.redirect });
  return new Response("ok", { status: 200 });
}) as typeof fetch;

/**
 * Every company's own website, on one mock server on 127.0.0.1 (lib/logo.ts is pointed at it with a
 * resolver that answers 127.0.0.1 for every name, and this port). By the Host it was asked for:
 * Acmeworks links a 64px icon on its homepage, beside an SVG one and one on another site (both
 * passed over), and keeps an icon under /private that robots.txt disallows; Bluefin links none and
 * has a 32px /favicon.ico; Dunmorely links only an SVG and sends SVG for /favicon.ico; Irisdale's
 * robots.txt disallows everything; Granitepeak's homepage redirects to another site; the rest 404.
 * Each image carries headers that name the domain, which must never reach the page.
 */
const ICON_PORT = 6781;
/** A PNG header that says width and height apart (a wide wordmark). */
const pngWH = (w: number, h: number) => {
  const b = png(w);
  new DataView(b.buffer).setUint32(20, h);
  return b;
};
/** An .ico holding 16, 32 and 48px images: its width is the largest. */
const ico3 = Uint8Array.from([0, 0, 1, 0, 3, 0, 16, 16, 0, 0, 1, 0, 32, 0, 1, 1, 1, 1, 54, 0, 0, 0, 32, 32, 0, 0, 1, 0, 32, 0, 1, 1, 1, 1, 54, 0, 0, 0, 48, 48, 0, 0, 1, 0, 32, 0, 1, 1, 1, 1, 54, 0, 0, 0, 9, 9]);
/**
 * More made-up sites, for where else an icon is looked for (lib/logo.ts), by host then path:
 *  - guessed-manifest: no links, no manifest link; /site.webmanifest is missing and /manifest.json lists a 256px PNG;
 *  - ld-square: JSON-LD Organization logo (an ImageObject) on its own site, beside one on another site;
 *  - ld-wide: its only JSON-LD logo is a wide wordmark (passed over) and /favicon.ico is 32px;
 *  - touch-guess: links a 16px and a 32px icon and a mask-icon (SVG); /apple-touch-icon.png is 180px, /favicon.ico an .ico of 16, 32 and 48;
 *  - many-links: four icon links that all 404, and a 32px /favicon.ico (always tried);
 *  - sized: a 32px icon link and a 192px one: the 192px, and no manifest is read;
 *  - small-only: only a 32px /favicon.ico and a 48px icon link: the largest of them, the 48px.
 */
const MORE_SITES: Record<string, Record<string, [string, string | Uint8Array]>> = {
  "guessed-manifest.example": {
    "/": ["text/html", "<html><head><title>x</title></head></html>"],
    "/manifest.json": ["application/json", JSON.stringify({ name: "x", icons: [{ src: "/i/256.png", sizes: "256x256", type: "image/png" }] })],
    "/i/256.png": ["image/png", png(256)],
  },
  "ld-square.example": {
    "/": [
      "text/html",
      `<html><head><script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite","name":"x"},{"@type":"Organization","logo":"https://cdn.elsewhere.example/logo.png"},{"@type":["Corporation"],"logo":{"@type":"ImageObject","url":"/brand/logo-200.png"}}]}</script></head></html>`,
    ],
    "/brand/logo-200.png": ["image/png", png(200)],
  },
  "ld-wide.example": {
    "/": ["text/html", `<html><head><script type="application/ld+json">{"@type":"Organization","logo":"/wordmark.png"}</script></head></html>`],
    "/wordmark.png": ["image/png", pngWH(600, 100)],
    "/favicon.ico": ["image/x-icon", ico(32)],
  },
  "touch-guess.example": {
    "/": ["text/html", `<html><head><link rel="icon" href="/f16.png" sizes="16x16"><link rel="icon" href="/f32.png" sizes="32x32"><link rel="mask-icon" href="/mask.svg" color="#000"></head></html>`],
    "/f16.png": ["image/png", png(16)],
    "/f32.png": ["image/png", png(32)],
    "/apple-touch-icon.png": ["image/png", png(180)],
    "/favicon.ico": ["image/x-icon", ico3],
  },
  "many-links.example": {
    "/": ["text/html", `<html><head><link rel="icon" href="/a.png"><link rel="icon" href="/b.png"><link rel="icon" href="/c.png"><link rel="icon" href="/d.png"></head></html>`],
    "/favicon.ico": ["image/x-icon", ico(32)],
  },
  "sized.example": {
    "/": ["text/html", `<html><head><link rel="icon" href="/s32.png" sizes="32x32"><link rel="icon" href="/s192.png" sizes="192x192"><link rel="manifest" href="/m.json"></head></html>`],
    "/s32.png": ["image/png", png(32)],
    "/s192.png": ["image/png", png(192)],
    "/m.json": ["application/json", JSON.stringify({ icons: [{ src: "/m512.png", sizes: "512x512" }] })],
  },
  "small-only.example": {
    "/": ["text/html", `<html><head><link rel="icon" href="/s48.png" sizes="48x48"></head></html>`],
    "/s48.png": ["image/png", png(48)],
    "/favicon.ico": ["image/x-icon", ico(32)],
  },
};
const siteAsked: { host: string; path: string }[] = [];
const sites = http.createServer((req, res) => {
  const host = String(req.headers.host ?? "").replace(/:\d+$/, "");
  const p = req.url ?? "/";
  siteAsked.push({ host, path: p });
  const leaky = { "x-upstream-domain": host, "content-disposition": `inline; filename="${host}.png"`, etag: `"${host}"`, "x-company": "Acmeworks Robotics" };
  const send = (status: number, type: string, body: string | Uint8Array, extra: Record<string, string> = {}) => {
    res.writeHead(status, { "content-type": type, ...extra });
    res.end(body);
  };
  if (p === "/robots.txt") {
    if (host === CO.iris.site) return send(200, "text/plain", "User-agent: *\nDisallow: /\n");
    if (host === CO.acme.site) return send(200, "text/plain", "User-agent: *\nDisallow: /private/\n");
    return send(404, "text/plain", "none");
  }
  if (host === CO.acme.site) {
    if (p === "/")
      return send(
        200,
        "text/html",
        `<html><head><link rel="icon" type="image/svg+xml" href="/icon.svg"><link rel="apple-touch-icon" href="https://cdn.elsewhere.example/acme.png"><link rel="icon" href="/private/secret.png" sizes="128x128"><link rel="shortcut icon" href="/static/icon-64.png" sizes="64x64"></head><body>Acmeworks</body></html>`,
      );
    if (p === "/static/icon-64.png") return send(200, "image/png", png(64), leaky);
    return send(404, "text/plain", "no");
  }
  if (host === CO.blue.site) {
    if (p === "/") return send(200, "text/html", "<html><head><title>Bluefin</title></head></html>");
    if (p === "/favicon.ico") return send(200, "image/vnd.microsoft.icon", ico(32), leaky);
    return send(404, "text/plain", "no");
  }
  if (host === CO.dun.site) {
    if (p === "/") return send(200, "text/html", `<html><head><link rel="icon" href="/logo.svg"></head></html>`);
    return send(200, "image/svg+xml", "<svg xmlns='http://www.w3.org/2000/svg'/>", leaky);
  }
  if (host === CO.gran.site && p === "/") return send(302, "text/plain", "", { location: "http://other-brand.example/" });
  // Halcyon: no icon link, only its web app manifest, which lists an SVG, a monochrome mask, one on another site and a 192px PNG.
  if (host === CO.halc.site) {
    if (p === "/") return send(200, "text/html", `<html><head><link rel="manifest" href="/app/site.webmanifest"></head></html>`);
    if (p === "/app/site.webmanifest")
      return send(200, "application/manifest+json", JSON.stringify({ icons: [{ src: "icon.svg", sizes: "any", type: "image/svg+xml" }, { src: "mono-512.png", sizes: "512x512", purpose: "monochrome" }, { src: "https://cdn.elsewhere.example/h512.png", sizes: "512x512" }, { src: "/img/h192.png", sizes: "192x192", type: "image/png" }] }));
    if (p === "/img/h192.png") return send(200, "image/png", png(192), leaky);
    return send(404, "text/plain", "no");
  }
  const more = MORE_SITES[host]?.[p];
  if (more) return send(200, more[0], more[1]);
  if (host in MORE_SITES) return send(404, "text/plain", "no");
  return send(404, "text/plain", "not found");
});

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};

/** The identity of every company in `ids`, in the forms it could leak: name, domain, the website's own name, LinkedIn, About. */
const identityOf = (ids: string[]) =>
  [...Object.values(CO), { ...SPAM, linkedin: "", about: "" }, NOSITE]
    .filter((c) => ids.includes(c.id))
    .flatMap((c) => [c.name, c.name.split(" ")[0], c.site, c.site.split(".")[0], c.linkedin, c.about].filter((x) => x && x.length >= 5));
/** The identities found anywhere in `out` (any JSON), lowercased: none is the pass. */
const leaks = (out: unknown, ids: string[]) => {
  const text = JSON.stringify(out).toLowerCase();
  return identityOf(ids).filter((x) => text.includes(x.toLowerCase()));
};

async function main() {
  const T = await import("../lib/table");
  const F = await import("../lib/tableFields");
  const M = await import("../app/post/model");
  const W = await import("../lib/viewWire");
  const L = await import("../app/post/ledger");
  const tools = await import("../lib/mcp/tools");
  const { forgetView } = await import("../lib/mcp/view");
  const { radarView } = await import("../lib/radar");
  const { preview } = await import("../lib/preview");
  const pub = T.tableInternals.pubId;
  const ALL = [...Object.values(CO).map((c) => c.id), SPAM.id, NOSITE.id];
  const view = (token: string, asMember = false) => T.buildView(token, { asMember });
  const coOf = (vw: Awaited<ReturnType<typeof view>>, id: string) => vw.companies.find((c) => c.id === pub(id));
  const act = async (token: string, a: Parameters<typeof T.perform>[1]) => {
    try {
      return { ok: true as const, r: await T.perform(token, a, BASE) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };

  /* ---------- a new member ---------- */
  console.log("A new member");
  const v0 = await view("tok-nora-lock");
  check("every company is locked for a new member", v0.companies.length === ALL.length && v0.companies.every((c) => c.hidden && c.name === F.HIDDEN_COMPANY && c.iconDomain === null), v0.companies.map((c) => [c.name, c.hidden]));
  check("website and LinkedIn come back locked", v0.companies.every((c) => ["website", "linkedin"].every((k) => !c.cells[k] || c.cells[k].s !== "value")));
  check(
    "the About is there, as the table's marker without its text (GET ?about= has it)",
    v0.companies.every((c) => !c.cells.about || c.cells.about.s === "empty" || (c.cells.about.s === "value" && c.cells.about.v === "" && c.cells.about.lazy === true)) &&
      coOf(v0, CO.acme.id)!.cells.about?.s === "value",
    v0.companies.map((c) => c.cells.about),
  );
  const a0 = coOf(v0, CO.acme.id)!;
  check(
    "the free facts are there: industry, revenue, size and the HQ's region only",
    a0.cells.industry?.s === "value" && a0.cells.industry.v === "SaaS" && a0.cells.revenue?.s === "value" && a0.cells.employees?.s === "value" && a0.cells.hq?.s === "value" && a0.cells.hq.v === "TX" && a0.region === "Texas",
    a0.cells,
  );
  check(
    "which functions hired and when are free, and so are the seat counts",
    a0.friendly.functions.includes("Sales") && a0.friendly.functions.includes("Marketing") && a0.engagements.length === 2 && a0.engagements.some((e) => e.cells.start?.s === "value" && e.cells.start.v === "2024-02"),
    a0.friendly,
  );
  const b0 = coOf(v0, CO.blue.id)!;
  const bRole = b0.engagements[0];
  check(
    "an open role's title, function and hours-free facts show, without the company's name",
    bRole.cells.role?.s === "value" && bRole.cells.role.v === "Fractional CMO" && bRole.cells.function?.s === "value" && bRole.cells.posting?.s === "locked" && b0.friendly.open === 1,
    bRole.cells,
  );
  check("who leads each function is free on a locked company, without the page it came from", a0.leads?.fns[0]?.fn === "Sales" && a0.leads.fns[0].kind === "full-time" && !("url" in a0.leads.fns[0]), a0.leads);
  const ab = await T.aboutCells("tok-nora-lock", [pub(CO.acme.id), pub(CO.blue.id)]);
  const abText = (x: typeof ab, id: string) => (x?.about[pub(id)]?.s === "value" ? (x.about[pub(id)] as { v: string }).v : null);
  check(
    "GET ?about= gives a locked company's About, its name and the leading The and legal suffix read as the company",
    abText(ab, CO.acme.id) === SCRUBBED.acme && abText(ab, CO.blue.id) === SCRUBBED.blue,
    ab,
  );
  check("and it names nothing: no name, no first word of it, no domain, no link, no email", leaks(ab, ALL).length === 0 && !/\.example|@|https?:/i.test(JSON.stringify(ab)), leaks(ab, ALL));
  check("the client model's teaser reads the free facts", M.deriveAll([a0])[0].teaser === "SaaS · $1M–$5M · 11–50 · TX", M.deriveAll([a0])[0].teaser);
  check("no locked company's name, domain, LinkedIn or About anywhere in the view", leaks(v0, ALL).length === 0, leaks(v0, ALL));
  const packed = W.packView(structuredClone(v0));
  check("nor in the packed view, nor unpacked", leaks(packed, ALL).length === 0 && leaks(W.unpackView(structuredClone(packed)), ALL).length === 0);
  const ids = v0.companies.filter((c) => c.hidden).map((c) => c.id);
  check("locked companies are ordered by their public id, not by name", ids.join() === [...ids].sort().join() || v0.companies.some((c) => c.friendly.score !== v0.companies[0].friendly.score));

  /* ---------- search ---------- */
  console.log("\nSearch");
  const infos0 = M.deriveAll(v0.companies);
  const found = (q: string) => M.applyFilters(M.rowsFor("companies", infos0), M.EMPTY_FILTERS, "all", q, v0.me!).rows.length;
  check("the table's search finds no locked company by its name or domain", found("acmeworks") === 0 && found("bluefin") === 0 && found("acmeworks-robotics.example") === 0, [found("acmeworks"), found("bluefin")]);
  check("it still finds them by free facts", found("saas") >= 2, found("saas"));
  check("the Add form's lookup by a name read off a website (not typed) doesn't name or point to a locked company", (await T.existingCompany(null, CO.acme.name, "tok-nora-lock")) === null);
  const adminLook = await T.existingCompany(CO.acme.site, CO.acme.name, "tok-admin-lock");
  check("an admin's lookup still finds it", adminLook?.name === CO.acme.name, adminLook);

  /* ---------- Referral partners, the radar, the connector ---------- */
  console.log("\nOther answers");
  const pv = await T.partnersView("tok-nora-lock");
  check("Referral partners names no locked company", !!pv && leaks(pv, ALL).length === 0, leaks(pv, ALL));
  const rv = await radarView("tok-nora-lock");
  check("the radar names no locked company", leaks(rv, ALL).length === 0, leaks(rv, ALL));
  const nora = (await T.memberForToken("tok-nora-lock"))!;
  const ctx = { member: nora, origin: BASE };
  const sc = await tools.searchCompanies(ctx, {});
  const scQ = await tools.searchCompanies(ctx, { query: "Acmeworks" });
  const or = await tools.listOpenRoles(ctx, {});
  const gc = await tools.getCompany(ctx, { company: pub(CO.blue.id) });
  check("the connector's search, open roles and records name no locked company", [sc, scQ, or, gc].every((x) => leaks(x, ALL).length === 0), [sc, or, gc].map((x) => leaks(x, ALL)));
  check(
    "get_company gives a locked company's About without its name or links, says so, and keeps its website and LinkedIn locked",
    gc.about === SCRUBBED.blue && typeof gc.about_note === "string" && /left out/.test(gc.about_note as string) && /locked until you unlock/.test(String(gc.website)) && /locked until you unlock/.test(String(gc.linkedin)),
    { about: gc.about, note: gc.about_note, website: gc.website, linkedin: gc.linkedin },
  );
  check("the connector describes a locked company by its free facts and an id", (sc.companies as { id: string; name: string; hidden?: boolean; industry?: string }[]).some((c) => c.hidden && c.name === F.HIDDEN_COMPANY && c.id === pub(CO.acme.id) && c.industry === "SaaS"), sc.companies);
  check("the connector's search can't find one by name", scQ.total === 0, scQ.total);
  let byName = "";
  try {
    await tools.getCompany(ctx, { company: CO.acme.name });
  } catch (e) {
    byName = (e as Error).message;
  }
  check("nor can get_company take its name", /No company with that id or name/.test(byName), byName);
  const dry = await tools.unlock(ctx, { entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("the connector's unlock asks first, and says the free company of the day costs nothing", dry.confirmed === false && dry.would_spend === 0 && /free company of the day/.test(String(dry.message)) && leaks(dry, ALL).length === 0, dry);
  check("my_account says the free company is left today", /^1 left/.test(String((await tools.myAccount(ctx)).free_company_today)));
  check("and spent nothing", (await view("tok-nora-lock")).me!.credits === 25);

  /* ---------- who held a seat waits for the company ---------- */
  console.log("\nUnlock company");
  const held = await act("tok-nora-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "operator" });
  check("who held a seat at a locked company waits for the company", !held.ok && held.error === T.COMPANY_FIRST, held);
  const endEarly = await act("tok-nora-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "end" });
  check("so does any other paid fact there (a 1-credit unlock would open the company)", !endEarly.ok && endEarly.error === T.COMPANY_FIRST && coOf(await view("tok-nora-lock"), CO.acme.id)!.hidden === true, endEarly);
  const un = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check(
    "the first company of the day is free, names it, and says so",
    un.ok && un.r.me?.credits === 25 && un.r.me?.freeCompany === false && un.r.message === `Unlocked Acmeworks Robotics. ${T.FREE_COMPANY_USED}`,
    un.ok ? un.r.message : un,
  );
  const v1 = await view("tok-nora-lock");
  const a1 = coOf(v1, CO.acme.id)!;
  const ab1 = await T.aboutCells("tok-nora-lock", [pub(CO.acme.id)]);
  check("once unlocked, GET ?about= gives its About, and the leader's page comes with the record", ab1?.about[pub(CO.acme.id)]?.s === "value" && (ab1.about[pub(CO.acme.id)] as { v: string }).v === CO.acme.about && coOf(await view("tok-nora-lock"), CO.acme.id)?.leads?.fns[0]?.url === `https://${CO.acme.site}/team`, ab1);
  check(
    "the member now sees its name, website, LinkedIn, logo and About, and the full HQ",
    !a1.hidden && a1.name === CO.acme.name && a1.cells.website?.s === "value" && a1.cells.linkedin?.s === "value" && a1.cells.about?.s === "value" && a1.cells.hq?.s === "value" && a1.cells.hq.v === "Austin, TX" && !!a1.unlocked,
    a1,
  );
  const rows = (await view("tok-nora-lock")).ledger.filter((l) => l.reason === "unlock" || l.reason === T.FREE_COMPANY_LINE);
  check("one ledger row of 0 credits, read as Free company of the day", rows.length === 1 && rows[0].delta === 0 && L.ledgerLine(rows[0], 25).text === `Free company of the day: ${CO.acme.name}`, rows);
  check("my_account says it is used today", /^used today/.test(String((await tools.myAccount(ctx)).free_company_today)));
  const again = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("asking again spends nothing", !again.ok && /Nothing here is locked/.test(again.error) && (await view("tok-nora-lock")).me!.credits === 25, again);
  const held2 = await act("tok-nora-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "operator" });
  // Fellow fractionals are free (PEERS_FREE): once the company is open, who held its seat shows at no charge.
  const acmeSeat = coOf(await view("tok-nora-lock"), CO.acme.id)!.engagements.find((e) => e.id === pub("e_acme_sales"));
  check("then who held the seat shows free: nothing to buy", !held2.ok && /Nothing here is locked/.test(held2.error) && acmeSeat?.cells.operator?.s === "value" && !acmeSeat.cells.operator.paid && (await view("tok-nora-lock")).me!.credits === 25, held2.ok ? held2.r.message : [held2, acmeSeat?.cells.operator]);
  check("the other companies stay locked", leaks(await view("tok-nora-lock"), ALL.filter((x) => x !== CO.acme.id)).length === 0);
  const ub = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(CO.blue.id), field: "identity" });
  const b1 = coOf(await view("tok-nora-lock"), CO.blue.id)!;
  check(
    "the next company the same day costs 2 credits: a hiring company comes with its open role's job posting and posted rate",
    ub.ok && ub.r.me?.credits === 23 && / for 2 credits\.$/.test(ub.r.message) && b1.engagements[0].cells.posting?.s === "value" && b1.engagements[0].cells.rate?.s === "value",
    ub.ok ? ub.r.message : ub,
  );
  const mcpAfter = await tools.searchCompanies(ctx, {});
  forgetView(nora.id);
  check("the connector names what the member unlocked, and only that", leaks(mcpAfter, [CO.acme.id]).length > 0 && leaks(await tools.searchCompanies(ctx, {}), ALL.filter((x) => x !== CO.acme.id && x !== CO.blue.id)).length === 0);

  /* ---------- the wall and the daily limit ---------- */
  console.log("\nThe wall and the limit");
  const pete = await act("tok-pete-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("with 1 credit, a company is refused and nothing is spent", (!pete.ok && /needs 2 credits and you have 1/.test(pete.error)) || (pete.ok && pete.r.message === "" && (await view("tok-pete-lock")).me!.credits === 1), pete);
  check("Pete still has 1 credit and the company stays locked", (await view("tok-pete-lock")).me!.credits === 1 && coOf(await view("tok-pete-lock"), CO.acme.id)!.hidden === true);
  const zedFree = await act("tok-zed-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("at 0 credits the free company of the day still opens one", zedFree.ok && zedFree.r.me?.credits === 0 && coOf(await view("tok-zed-lock"), CO.acme.id)!.hidden === false, zedFree);
  const zed = await act("tok-zed-lock", { type: "unlock", entity: "company", id: pub(CO.blue.id), field: "identity" });
  check("then at 0 credits it is the wall", (!zed.ok && /out of credits/.test(zed.error)) || (zed.ok && zed.r.message === ""), zed);
  const capV = await view("tok-cara-lock");
  check("the daily limit counts in credits: 1 unlock left today", capV.me!.unlocksLeft === 1, capV.me!.unlocksLeft);
  const cap = await act("tok-cara-lock", { type: "unlock", entity: "company", id: pub(CO.acme.id), field: "identity" });
  check("so a company (2) is past it, and nothing is spent", !cap.ok && /You can unlock 1 more today/.test(cap.error) && (await view("tok-cara-lock")).me!.credits === 101, cap);

  /* ---------- companies a member already knows ---------- */
  console.log("\nWhat a member already knows");
  const vh = await view("tok-hank-lock");
  check("a seat holder sees the company where they held a seat", !coOf(vh, CO.cobalt.id)!.hidden && coOf(vh, CO.cobalt.id)!.name === CO.cobalt.name);
  check("and nothing else", leaks(vh, ALL.filter((x) => x !== CO.cobalt.id)).length === 0);
  const va = await view("tok-ada-lock");
  check("a member who added a fact sees that company", !coOf(va, CO.dun.id)!.hidden && leaks(va, ALL.filter((x) => x !== CO.dun.id)).length === 0);
  const vo = await view("tok-olga-lock");
  check(
    "what a member bought under the old rules owns the company: a company, an open role's posting, a person",
    [CO.elm.id, CO.fox.id, CO.gran.id].every((id) => !coOf(vo, id)!.hidden) && leaks(vo, ALL.filter((x) => ![CO.elm.id, CO.fox.id, CO.gran.id].includes(x))).length === 0,
    vo.companies.map((c) => [c.name, c.hidden]),
  );
  const vs = await view("tok-sam-lock");
  check("a member sees the company they added", !coOf(vs, SPAM.id)!.hidden);

  /* ---------- admins ---------- */
  console.log("\nAdmins");
  const vAdm = await view("tok-admin-lock");
  check("an admin sees every company", vAdm.companies.every((c) => !c.hidden && c.name !== F.HIDDEN_COMPANY));
  const vAsM = await view("tok-admin-lock", true);
  check("See it as a member locks them all again", vAsM.companies.every((c) => c.hidden) && leaks(vAsM, ALL).length === 0);

  /* ---------- Add by name ---------- */
  console.log("\nAdd by name");
  const noNew = await act("tok-nora-lock", { type: "add", company: CO.holl.name });
  check("Add with a locked company's exact name, nothing new, names it in the answer (a lookup by name)", noNew.ok && noNew.r.message.includes(CO.holl.name) && /already on Merlin/.test(noNew.r.message), noNew);
  check("and the company stays locked in the tables", coOf(await view("tok-nora-lock"), CO.holl.id)!.hidden === true);
  const partAdd = await act("tok-nora-lock", { type: "add", company: "Irisdale", companyFields: { industry: "SaaS" } });
  check("Add with a part of a name makes a new company and names no locked one", partAdd.ok && leaks(partAdd.r, [CO.iris.id]).every((x) => x.toLowerCase() === "irisdale") && !JSON.stringify(partAdd.r).includes(CO.iris.name), partAdd);
  const mySeat = await act("tok-nora-lock", {
    type: "add",
    company: CO.holl.name,
    newEngagement: true,
    engagementFields: { function: "Marketing", role: "Fractional CMO", operator: "Nora Newcomer", start: "2024-01", end: "2024-12" },
    operatorMemberId: "me",
  });
  const h1 = coOf(await view("tok-nora-lock"), CO.holl.id)!;
  check("adding a seat the member held there opens it for them", mySeat.ok && !!mySeat.r.id && !h1.hidden && h1.name === CO.holl.name, mySeat.ok ? mySeat.r.message : mySeat);
  check("and it counts toward the day's adds (it earned like any fact)", mySeat.ok && (mySeat.r.me?.earned24h ?? 0) > 0, mySeat.ok ? mySeat.r.me?.earned24h : null);

  /* ---------- refunds ---------- */
  console.log("\nRefunds");
  const us = await act("tok-nora-lock", { type: "unlock", entity: "company", id: pub(SPAM.id), field: "identity" });
  const before = (await view("tok-nora-lock")).me!.credits;
  const rm = await act("tok-admin-lock", { type: "adminRemoveMember", memberId: pub("m_sam") });
  const after = (await view("tok-nora-lock")).me!.credits;
  check("a company removed later is paid back in full (2 credits)", us.ok && rm.ok && after === before + 2, { us, rm: rm.ok ? rm.r.message : rm, before, after });

  /* ---------- found by exact name ---------- */
  console.log("\nFound by exact name");
  const find = (token: string, text: string) => act(token, { type: "find", text });
  const finnV0 = await view("tok-finn-lock");
  for (const t of ["Acmeworks", "Acmeworks Rob", "acmework robotics", "Robotics", "acmeworks-robo", "bluefin-freight.example", "Ac"]) {
    const r = await find("tok-finn-lock", t);
    const out = r.ok ? r.r : r.error;
    check(`"${t}" (a part, a prefix or a near miss) finds nothing, names nothing and says no count`, (r.ok ? r.r.found === "none" && !r.r.id && !r.r.ids && r.r.message === F.FIND_NONE : r.error === F.FIND_HINT) && leaks(out, ALL).length === 0 && !/\d/.test(JSON.stringify(r.ok ? r.r.message : r.error)), out);
  }
  const f1 = await find("tok-finn-lock", "  ACMEWORKS robotics, Inc. ");
  check("the exact name, case, spaces and a legal suffix aside, finds it and names it in the answer", f1.ok && f1.r.found === "new" && f1.r.ids?.length === 1 && f1.r.ids[0] === pub(CO.acme.id) && f1.r.message.includes(CO.acme.name), f1);
  check("a lookup the day before doesn't count today: 24 new ones left", f1.ok && f1.r.findsLeft === 24, f1.ok ? f1.r.findsLeft : f1);
  const fp = await T.viewPatch("tok-finn-lock", [pub(CO.acme.id)], { found: true });
  const fa = fp!.companies![0];
  check(
    "the record from the search shows what Unlock company would: name, logo, website, LinkedIn, the full HQ",
    fa.found === true && !fa.hidden && fa.name === CO.acme.name && fa.iconDomain !== undefined && fa.cells.website?.s === "value" && fa.cells.linkedin?.s === "value" && fa.cells.hq?.s === "value" && fa.cells.hq.v === "Austin, TX",
    fa,
  );
  const fab = await T.aboutCells("tok-finn-lock", [pub(CO.acme.id)], { found: true });
  const fabTable = await T.aboutCells("tok-finn-lock", [pub(CO.acme.id)]);
  check("and its whole About (GET ?about=&found=1) while it is open from the search", abText(fab, CO.acme.id) === CO.acme.about, fab);
  check("while the tables' locked record of it asks without found=1 and reads it without the name", abText(fabTable, CO.acme.id) === SCRUBBED.acme, fabTable);
  // The company is named in this answer, so it is visible: who held its seat shows free (PEERS_FREE).
  check("who held a seat there shows free, the company being named in this answer", fa.engagements.find((e) => e.id === pub("e_acme_sales"))?.cells.operator?.s === "value");
  const finnV1 = await view("tok-finn-lock");
  check("the tables keep it locked: a fresh view names nothing", coOf(finnV1, CO.acme.id)!.hidden === true && leaks(finnV1, ALL).length === 0, leaks(finnV1, ALL));
  check("nor does the packed view", leaks(W.packView(structuredClone(finnV1)), ALL).length === 0);
  const plainPatch = await T.viewPatch("tok-finn-lock", [pub(CO.acme.id)]);
  check("an action's ordinary patch keeps it locked too", plainPatch!.companies![0].hidden === true && leaks(plainPatch, ALL).length === 0);
  const finn = (await T.memberForToken("tok-finn-lock"))!;
  const fctx = { member: finn, origin: BASE };
  forgetView(finn.id);
  const lists = [await T.partnersView("tok-finn-lock"), await radarView("tok-finn-lock"), await tools.searchCompanies(fctx, {}), await tools.listOpenRoles(fctx, {}), await tools.getCompany(fctx, { company: pub(CO.acme.id) })];
  check("Referral partners, the radar and the connector's lists and records keep it locked", lists.every((x) => leaks(x, ALL).length === 0), lists.map((x) => leaks(x, ALL)));
  const f1b = await find("tok-finn-lock", "acmeworks robotics");
  check("looking it up again the same day is free and counts nothing", f1b.ok && f1b.r.found === "again" && f1b.r.findsLeft === 24, f1b);
  const fd = await find("tok-finn-lock", `https://www.${CO.blue.site}/about-us`);
  check("an exact website (scheme, www and path aside) finds it", fd.ok && fd.r.found === "new" && fd.r.ids?.[0] === pub(CO.blue.id) && fd.r.findsLeft === 23, fd);
  const fthe = await find("tok-finn-lock", "The Bluefin Freightlines LLC");
  check("a leading The and a legal suffix don't matter (and it's a repeat)", fthe.ok && fthe.r.found === "again", fthe);
  const fb = (await T.viewPatch("tok-finn-lock", [pub(CO.blue.id)], { found: true }))!.companies![0];
  check("a hiring company found by name keeps its job posting locked, at the usual price", fb.found === true && fb.engagements[0].cells.posting?.s === "locked", fb.engagements[0].cells);
  const credits0 = (await view("tok-finn-lock")).me!.credits;
  const buyHolder = await act("tok-finn-lock", { type: "unlock", entity: "engagement", id: pub("e_acme_sales"), field: "operator" });
  check("who held a seat there costs nothing: nothing to buy, nothing spent", !buyHolder.ok && /Nothing here is locked/.test(buyHolder.error) && (await view("tok-finn-lock")).me!.credits === credits0, buyHolder.ok ? buyHolder.r.message : buyHolder);
  const buyPost = await act("tok-finn-lock", { type: "unlock", entity: "engagement", id: pub("e_blue_open"), field: "posting" });
  check("an open role's posting (with its rate) is 1 credit", buyPost.ok && buyPost.r.me?.credits === credits0 - 1, buyPost.ok ? buyPost.r.message : buyPost);
  const fc = await find("tok-finn-lock", CO.cobalt.name);
  const keep = await act("tok-finn-lock", { type: "unlock", entity: "company", id: pub(CO.cobalt.id), field: "identity" });
  const finnV2 = await view("tok-finn-lock");
  check(
    "Unlock company from the search (here the free company of the day) keeps it named in the tables",
    fc.ok && keep.ok && keep.r.me?.credits === credits0 - 1 && /free company today/.test(keep.r.message) && coOf(finnV2, CO.cobalt.id)!.hidden === false && coOf(finnV2, CO.cobalt.id)!.name === CO.cobalt.name,
    keep.ok ? keep.r.message : keep,
  );
  const fe = await find("tok-finn-lock", CO.dun.site);
  const fill = await act("tok-finn-lock", { type: "fill", entity: "company", id: pub(CO.dun.id), field: "employees", value: "11–50" });
  check("adding a fact from the search makes it theirs: named in the tables", fe.ok && fill.ok && coOf(await view("tok-finn-lock"), CO.dun.id)!.hidden === false, fill.ok ? fill.r.message : fill);
  const fg = await find("tok-finn-lock", CO.gran.name);
  const finnV3 = await view("tok-finn-lock");
  check("a company only looked up (nothing bought or added) is locked again in a reloaded view", fg.ok && coOf(finnV3, CO.gran.id)!.hidden === true && leaks(finnV3, [CO.gran.id, CO.elm.id, CO.iris.id, CO.holl.id, CO.fox.id]).length === 0);
  // Who held Acme's seat was free, so Finn bought nothing there: it stays locked in the tables. Bluefin's posting was a purchase.
  check("the companies Finn bought something at are his (a purchase owns a company), a free look is not", coOf(finnV3, CO.acme.id)!.hidden === true && coOf(finnV3, CO.blue.id)!.hidden === false);

  console.log("\nThe limits");
  const fay1 = await find("tok-fcap-lock", CO.acme.name);
  check("on Free, the 25th new company of the day is found", fay1.ok && fay1.r.found === "new" && fay1.r.findsLeft === 0, fay1);
  const fay2 = await find("tok-fcap-lock", CO.blue.name);
  check("the 26th is refused, with the limit in plain words", !fay2.ok && fay2.error === "You've looked up 25 companies by name today. More tomorrow, or unlock one from the table." && leaks(fay2.error, ALL).length === 0, fay2);
  const fay3 = await find("tok-fcap-lock", CO.acme.site);
  check("a repeat still works at the limit", fay3.ok && fay3.r.found === "again", fay3);
  const fay4 = await act("tok-fcap-lock", { type: "add", company: CO.blue.name });
  check("Add with an exact name counts toward the same limit: at it, the answer names nothing", fay4.ok && !fay4.r.message.includes(CO.blue.name) && /looked up 25 companies by name today/.test(fay4.r.message), fay4);
  const keepEnv = { ...process.env };
  Object.assign(process.env, { RN_BILLING: "1", STRIPE_SECRET_KEY: "sk_test_madeup", STRIPE_WEBHOOK_SECRET: "whsec_madeup", STRIPE_PRICE_MONTH: "price_m", STRIPE_PRICE_YEAR: "price_y" });
  try {
    const pia1 = await find("tok-pcap-lock", CO.acme.name);
    const pia2 = await find("tok-pcap-lock", CO.blue.name);
    // Open data on paid plans: on Pro every company is open, so a lookup by name reveals nothing and no daily lookup limit binds.
    check("on Pro every company is already open: lookups find it with no limit", pia1.ok && pia1.r.found === "again" && pia2.ok && pia2.r.found === "again", [pia1, pia2]);
    const fay5 = await find("tok-fcap-lock", CO.iris.name);
    check("with billing live, Free is still 25", !fay5.ok && /looked up 25 companies/.test(fay5.error), fay5);
  } finally {
    for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET", "STRIPE_PRICE_MONTH", "STRIPE_PRICE_YEAR"]) if (keepEnv[k] === undefined) delete process.env[k];
  }
  const milo1 = await find("tok-miss-lock", "Nowhere Industries");
  check("the 50th lookup with no match still answers", milo1.ok && milo1.r.found === "none" && milo1.r.message === F.FIND_NONE, milo1);
  const milo2 = await find("tok-miss-lock", "Nowhere Else Corp");
  const milo3 = await find("tok-miss-lock", CO.acme.name);
  check("past 50 misses, lookups stop for the day (an exact name too), naming nothing", !milo2.ok && !milo3.ok && milo2.error === T.FIND_MISS_CAP && milo3.error === T.FIND_MISS_CAP, [milo2, milo3]);

  console.log("\nThe connector and Pilot metrics");
  const mcpFind = await tools.findCompanyByName(fctx, { name: `${CO.iris.name}, Inc.` });
  const mc = (mcpFind.companies as Record<string, unknown>[])?.[0];
  check("find_company names a locked company for that answer, with its website and the note", mcpFind.found === true && mc?.name === CO.iris.name && mc?.named_for_this_answer === true && JSON.stringify(mc).includes(CO.iris.site), mcpFind);
  check("with its whole About, and no note that something is left out", mc?.about === CO.iris.about && !("about_note" in (mc ?? {})), mc);
  forgetView(finn.id);
  const after2 =[await tools.searchCompanies(fctx, {}), await tools.getCompany(fctx, { company: pub(CO.iris.id) })];
  check("and the connector's lists and get_company keep it locked after", after2.every((x) => leaks(x, [CO.iris.id]).length === 0), after2.map((x) => leaks(x, [CO.iris.id])));
  const mcpPart = await tools.findCompanyByName(fctx, { name: "Irisda Med" });
  check("find_company with a part of a name finds nothing and names nothing", mcpPart.found === false && leaks(mcpPart, ALL).length === 0, mcpPart);
  const siteLook = await T.existingCompany(CO.elm.site, null, "tok-finn-lock");
  check("the Add form's lookup by an exact website names it (a lookup by name, counted)", siteLook?.name === CO.elm.name && coOf(await view("tok-finn-lock"), CO.elm.id)!.hidden === true, siteLook);
  const adm = (await view("tok-admin-lock")).admin as { finds?: { today: number; members: number; atCap: number; misses: number; missCap: number } } | undefined;
  check("Pilot metrics counts lookups today and members at the limits", !!adm?.finds && adm.finds.today >= 24 + 99 && adm.finds.members >= 3 && adm.finds.atCap === 2 && adm.finds.missCap === 1, adm?.finds);
  // Health (lib/health.ts, its numbers in scripts/test-health.mts): in an admin's view, counts only.
  const hl = ((await view("tok-admin-lock")).admin as { health?: { funnel: { n: number }[]; weeks: unknown[]; credits: unknown[]; insights: unknown } } | undefined)?.health;
  const memberWords = [...seed.members.flatMap((m) => [m.name, m.email]), "Cara Capped", "cara@example.com"];
  check(
    "Pilot metrics carries Health: the funnel from members who joined, 12 weeks of facts and credits, no name or email",
    !!hl && hl.funnel.length === 5 && hl.funnel[0].n >= 1 && hl.weeks.length === 12 && hl.credits.length === 12 && !memberWords.some((x) => JSON.stringify(hl).includes(x)),
    hl?.funnel,
  );
  const memberHl = ((await view("tok-finn-lock")).admin as unknown) ?? null;
  check("and a member's view has none of it", memberHl === null);

  /* ---------- the logo (GET /api/logo/<id>, lib/logo.ts) ---------- */
  console.log("\nThe logo");
  const Lg = await import("../lib/logo");
  await new Promise<void>((done) => sites.listen(ICON_PORT, "127.0.0.1", done));
  const iconDir = path.join(dir, "icons-test");
  Lg.iconTest.opts = { resolve: async () => ["127.0.0.1"], allow: { loopback: true, port: ICON_PORT } };
  Lg.iconTest.dir = iconDir;
  process.env.RN_LOGO_LOOKUP = "on";
  const ask = (id: string, ip = "198.51.100.7") => Lg.logoResponse(new Request(`${BASE}/api/logo/${encodeURIComponent(id)}`, { headers: { "x-forwarded-for": ip } }), id);
  const headersOf = (r: Response) => Object.fromEntries(r.headers.entries());
  const ownSites = new Set(Object.values(CO).map((c) => c.site));
  const fetchedBefore = fetched.length;
  let from = siteAsked.length;
  const lg1 = await ask(pub(CO.acme.id));
  const lgBytes = new Uint8Array(await lg1.arrayBuffer());
  const lgAsked = siteAsked.slice(from);
  check(
    "a locked company's id gives its icon as image bytes, kept by browsers for a day",
    lg1.status === 200 && lg1.headers.get("content-type") === "image/png" && lgBytes.length === 40 && lgBytes[0] === 0x89 && lg1.headers.get("cache-control") === "public, max-age=86400",
    { status: lg1.status, headers: headersOf(lg1), n: lgBytes.length },
  );
  check(
    "never a redirect, and none of the site's headers: no domain and no name in them",
    lg1.status < 300 && !lg1.headers.has("location") && ["etag", "content-disposition", "x-upstream-domain", "x-company"].every((k) => !lg1.headers.has(k)) && leaks(headersOf(lg1), ALL).length === 0,
    headersOf(lg1),
  );
  check(
    "the server read the company's own site: robots.txt, the homepage, then the icon its homepage links",
    lgAsked.map((x) => `${x.host}${x.path}`).join(" ") === `${CO.acme.site}/robots.txt ${CO.acme.site}/ ${CO.acme.site}/robots.txt ${CO.acme.site}/static/icon-64.png`,
    lgAsked,
  );
  check("it passed over the SVG icon, the icon on another site and the one robots.txt disallows", !lgAsked.some((x) => /svg|secret|acme\.png/.test(x.path) || x.host !== CO.acme.site), lgAsked);
  from = siteAsked.length;
  const lg2 = await ask(pub(CO.acme.id));
  check("a second ask comes from memory, without asking the site again", lg2.status === 200 && siteAsked.length === from, siteAsked.slice(from));
  Lg.forgetIcons();
  const lg3 = await ask(pub(CO.acme.id));
  check("after a restart it comes from the data volume, still without asking the site", lg3.status === 200 && siteAsked.length === from && new Uint8Array(await lg3.arrayBuffer()).length === 40, siteAsked.slice(from));
  from = siteAsked.length;
  const lgBlue = await ask(pub(CO.blue.id));
  check(
    "a homepage that links no icon: its /favicon.ico",
    lgBlue.status === 200 && lgBlue.headers.get("content-type") === "image/x-icon" && siteAsked.slice(from).at(-1)?.path === "/favicon.ico" && siteAsked.slice(from).every((x) => x.host === CO.blue.site),
    { status: lgBlue.status, type: lgBlue.headers.get("content-type"), asked: siteAsked.slice(from) },
  );
  const lgNone = await ask(pub(CO.cobalt.id));
  check("no icon on the site: 204, with no body (never a 404 the browser logs)", lgNone.status === 204 && (await lgNone.text()) === "" && leaks(headersOf(lgNone), ALL).length === 0, { status: lgNone.status, headers: headersOf(lgNone) });
  const lgSvg = await ask(pub(CO.dun.id));
  check("an SVG is never sent on (it can carry script): 204", lgSvg.status === 204, lgSvg.status);
  from = siteAsked.length;
  const lgRobots = await ask(pub(CO.iris.id));
  check("a site whose robots.txt says no is left alone after reading it: 204", lgRobots.status === 204 && siteAsked.slice(from).every((x) => x.path === "/robots.txt"), siteAsked.slice(from));
  from = siteAsked.length;
  const lgAway = await ask(pub(CO.gran.id));
  check("a homepage that redirects to another site is not followed there", lgAway.status === 204 && siteAsked.slice(from).every((x) => x.host === CO.gran.site), siteAsked.slice(from));
  check(
    "every request went to a company's own site: none to Google, DuckDuckGo, Clearbit or any other host, and fetch was never used",
    siteAsked.every((x) => ownSites.has(x.host)) && fetched.length === fetchedBefore && !fetched.some((x) => /google|duckduckgo|clearbit/i.test(x.url)),
    { hosts: [...new Set(siteAsked.map((x) => x.host))], fetched: fetched.slice(fetchedBefore) },
  );
  from = siteAsked.length;
  const odd = await Promise.all(["c_madeupmadeup1", "../../etc/passwd", "", CO.acme.id, pub("e_acme_sales"), pub(NOSITE.id)].map((id) => ask(id)));
  check(
    "an unknown id, a made-up one, a seat's id, an internal id, a company with no website: 204 with no body, and nothing is fetched",
    odd.every((r) => r.status === 204) && siteAsked.length === from,
    { status: odd.map((r) => r.status), asked: siteAsked.slice(from) },
  );
  process.env.RN_LOGO_LOOKUP = "off";
  Lg.forgetIcons();
  from = siteAsked.length;
  const offKept = await ask(pub(CO.acme.id));
  const offNew = await ask(pub(CO.elm.id));
  check("RN_LOGO_LOOKUP=off: an icon already kept still shows, nothing new is fetched (a 204 and the tile)", offKept.status === 200 && offNew.status === 204 && siteAsked.length === from, { kept: offKept.status, fresh: offNew.status, asked: siteAsked.slice(from) });
  const burst: number[] = [];
  for (let k = 0; k <= Lg.LOGO_PER_MINUTE; k++) burst.push((await ask("c_madeupmadeup2", "198.51.100.99")).status);
  const other = await ask(pub(CO.acme.id), "198.51.100.100");
  check("past LOGO_PER_MINUTE a minute from one address: 429, other addresses unaffected", burst.at(-1) === 429 && burst.slice(0, -1).every((s) => s === 204) && other.status === 200, { last: burst.at(-1), other: other.status });

  // Where else an icon is looked for, on the company's own site only.
  const sizeOf = (img: Awaited<ReturnType<typeof Lg.fetchSiteIcon>>) => (img ? Lg.imageWidth(new Uint8Array(img.body)) : null);
  const askedAt = (host: string, since: number) => siteAsked.slice(since).filter((x) => x.host === host).map((x) => x.path);
  const iconAt = async (host: string) => {
    const at = siteAsked.length;
    const img = await Lg.fetchSiteIcon(host);
    return { w: sizeOf(img), type: img?.type ?? null, asked: askedAt(host, at), others: siteAsked.slice(at).filter((x) => x.host !== host) };
  };
  process.env.RN_LOGO_LOOKUP = "on";
  Lg.forgetIcons();
  from = siteAsked.length;
  const halc = await ask(pub(CO.halc.id));
  const halcAsked = siteAsked.slice(from);
  check(
    "the web app manifest the homepage links: its 192px PNG, never its SVG, its monochrome mask or the one on another site",
    halc.status === 200 && Lg.imageWidth(new Uint8Array(await halc.arrayBuffer())) === 192 && halcAsked.some((x) => x.path === "/app/site.webmanifest") && halcAsked.every((x) => x.host === CO.halc.site && !/svg|mono|h512/.test(x.path)),
    { status: halc.status, asked: halcAsked },
  );
  const guessed = await iconAt("guessed-manifest.example");
  check("no manifest link: /site.webmanifest, then /manifest.json, and its 256px icon", guessed.w === 256 && guessed.asked.includes("/site.webmanifest") && guessed.asked.includes("/manifest.json") && !guessed.others.length, guessed);
  const ldSq = await iconAt("ld-square.example");
  check("the schema.org Organization logo in JSON-LD, on the company's own site (the one on another site passed over)", ldSq.w === 200 && ldSq.asked.includes("/brand/logo-200.png") && !ldSq.others.length, ldSq);
  const ldWide = await iconAt("ld-wide.example");
  check("a JSON-LD logo that is a wide wordmark is passed over: /favicon.ico", ldWide.w === 32 && ldWide.type === "image/x-icon" && ldWide.asked.includes("/wordmark.png"), ldWide);
  const touch = await iconAt("touch-guess.example");
  check(
    "small icon links only: /apple-touch-icon.png (180px) is asked for and wins; the mask-icon (SVG) is never read",
    touch.w === 180 && touch.asked.includes("/apple-touch-icon.png") && !touch.asked.includes("/mask.svg"),
    touch,
  );
  const many = await iconAt("many-links.example");
  check("four icon links that all fail: /favicon.ico is still tried, within ICON_TRIES images", many.w === 32 && many.asked.includes("/favicon.ico") && many.asked.filter((x) => /\.(png|ico)$/.test(x)).length <= Lg.ICON_TRIES, many);
  const sized = await iconAt("sized.example");
  check("the largest declared icon of 64px or more is read first, and then no manifest", sized.w === 192 && sized.asked.includes("/s192.png") && !sized.asked.includes("/s32.png") && !sized.asked.includes("/m.json"), sized);
  const small = await iconAt("small-only.example");
  check("nothing of 64px: the largest found (48px over a 32px favicon)", small.w === 48 && small.asked.includes("/favicon.ico"), small);
  check("an .ico's width is its largest image", Lg.imageWidth(ico3) === 48, Lg.imageSize(ico3));
  const jpeg = Uint8Array.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 120, 0, 96, 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1]);
  const webp = Uint8Array.from([...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBPVP8X"), 10, 0, 0, 0, 0, 0, 0, 0, 127, 0, 0, 63, 0, 0]);
  check("JPEG and WebP sizes are read from their headers", JSON.stringify(Lg.imageSize(jpeg)) === '{"w":96,"h":120}' && JSON.stringify(Lg.imageSize(webp)) === '{"w":128,"h":64}', { jpeg: Lg.imageSize(jpeg), webp: Lg.imageSize(webp) });
  const mIcons = Lg.manifestIcons({ icons: [{ src: "a.svg" }, { src: "data:image/png;base64,AA", sizes: "64x64" }, { src: "m.png", sizes: "96x96", purpose: "monochrome" }, { src: "k.png", sizes: "96x96", purpose: "maskable" }, { src: "ok.png", sizes: "48x48 144x144" }] }, "https://x.example/static/m.json");
  check("manifest icons: no SVG, no inline data, no monochrome mask; sizes read, a maskable one counted smaller", mIcons.map((c) => `${c.url}@${c.size}`).join() === "https://x.example/static/k.png@76,https://x.example/static/ok.png@144", mIcons);
  check("a page with no JSON-LD, or a broken block, has no logo", Lg.ldLogos(`<script type="application/ld+json">{oops</script>`, "https://x.example/").length === 0);
  check(
    "no request in these went anywhere but each company's own site",
    siteAsked.slice(from).every((x) => x.host === CO.halc.site || x.host in MORE_SITES) && fetched.length === fetchedBefore,
    [...new Set(siteAsked.slice(from).map((x) => x.host))],
  );

  /* ---------- the landing page's logos (GET /api/logo/lp_<seed>, lib/preview.ts previewLogoDomain) ---------- */
  console.log("\nThe landing page's logos");
  const lpAnswer = await preview({ fn: "Marketing" });
  const lpNamed = [...lpAnswer.rows.map((r) => r.company), lpAnswer.example?.company].filter((c): c is NonNullable<typeof c> => !!c);
  const lpOf = (name: string) => lpNamed.find((c) => c.name === name)?.logoId ?? null;
  const acmeLp = lpOf(CO.acme.name);
  const halcLp = lpOf(CO.halc.name);
  check(
    "every named company on the landing page carries a logo id: \"lp_\" and its row's seed, never its public id",
    lpNamed.length > 0 && lpNamed.every((c) => c.logoId && /^lp_[\w-]{14}$/.test(c.logoId)) && !JSON.stringify(lpAnswer).includes(pub(CO.acme.id)) && lpAnswer.rows.some((r) => r.company && `lp_${r.seed}` === r.company.logoId),
    lpNamed,
  );
  from = siteAsked.length;
  const lpAcme = acmeLp ? await ask(acmeLp) : null;
  const lpHalc = halcLp ? await ask(halcLp) : null;
  check("the hero's and the rows' logo ids give the company's own icon, as image bytes", lpAcme?.status === 200 && lpAcme.headers.get("content-type") === "image/png" && lpHalc?.status === 200, { acme: lpAcme?.status, halc: lpHalc?.status, acmeLp, halcLp });
  const lpOdd = await Promise.all(["lp_madeupmadeup12", `lp_${pub(CO.acme.id)}`, "lp_", "lp_../../etc/pass", `lp_${acmeLp?.slice(3, 10)}`].map((id) => ask(id)));
  check("a made-up, short or public-id logo id: 204 with no body, nothing fetched", lpOdd.every((r) => r.status === 204) && siteAsked.length === from, lpOdd.map((r) => r.status));
  // Open-role companies kept back (RN_PREVIEW_OPEN_ROLE_COMPANIES=0 on a test server): Halcyon's logo id from before names nothing now.
  Object.assign(process.env, { RN_SCAN_TEST: "1", RN_PREVIEW_OPEN_ROLE_COMPANIES: "0" });
  const keptAnswer = await preview({ fn: "Marketing" });
  const keptRow = keptAnswer.rows.find((r) => r.kind === "open" && !r.company);
  const halcKept = halcLp ? await ask(halcLp) : null;
  const acmeStill = acmeLp ? await ask(acmeLp) : null;
  check(
    "a kept-back open-role company has no logo id, and its old one answers 204 (its row keeps its lock tile); a company the page names still shows",
    !!keptRow && !keptAnswer.rows.some((r) => r.company?.name === CO.halc.name) && halcKept?.status === 204 && acmeStill?.status === 200,
    { kept: !!keptRow, halc: halcKept?.status, acme: acmeStill?.status },
  );
  delete process.env.RN_PREVIEW_OPEN_ROLE_COMPANIES;
  delete process.env.RN_SCAN_TEST;
  await preview({ fn: "Marketing" });
  process.env.RN_LOGO_LOOKUP = "off";
  // The landing page draws them from our own route by that id, and the blurred rows draw a plain tile with no request.
  {
    const React = await import("react");
    (globalThis as { React?: unknown }).React = React;
    const { renderToStaticMarkup } = await import("react-dom/server");
    const S = await import("../app/ui/shared");
    const hero = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: CO.acme.name, domain: CO.acme.site, seed: acmeLp ?? undefined, size: "lg" }));
    const blur = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: "", domain: null, hidden: true, noLogo: true, seed: acmeLp?.slice(3) }));
    check("the page asks /api/logo/lp_<seed> for a named company, and nothing for a blurred row", hero.includes(`src="/api/logo/${acmeLp}"`) && !hero.includes(CO.acme.site) && !blur.includes("/api/logo"), { hero, blur });
  }
  await new Promise<void>((done) => sites.close(() => done()));
  const linkOrder = Lg.iconLinks(`<link rel="icon" href="/a.png" sizes="16x16"><link rel="apple-touch-icon" href="/t.png"><link rel="icon" href="/b.png" sizes="32x32"><link rel="icon" href="/c.svg"><link rel="icon" href="data:image/png;base64,AA">`, "https://x.example/");
  check("icon links best first: apple-touch-icon, then the largest, never SVG or data", linkOrder.join() === "https://x.example/t.png,https://x.example/b.png,https://x.example/a.png", linkOrder);

  /* ---------- the page: what it draws for a locked company ---------- */
  console.log("\nThe page");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const S = await import("../app/ui/shared");
  const vLock = await view("tok-nora-lock");
  const locked = vLock.companies.filter((c) => c.hidden);
  const html = locked
    .map((c) =>
      renderToStaticMarkup(
        React.createElement(
          "div",
          null,
          React.createElement(S.CompanyLogo, { name: c.name, domain: c.iconDomain, hidden: true, seed: c.id }),
          React.createElement(S.CompanyLogo, { name: c.name, domain: c.iconDomain, hidden: true, seed: c.id, size: "lg" }),
          React.createElement(S.LockedName, { seed: c.id }),
          React.createElement(S.LockedSite, { seed: c.id }),
        ),
      ),
    )
    .join("\n");
  check(
    "a locked company's logo is drawn from /api/logo/<its public id>",
    locked.length > 3 && locked.every((c) => html.includes(`src="/api/logo/${c.id}"`)),
    html.slice(0, 600),
  );
  check(
    "and the page has no icon service's address, domain or name for it (src, srcset, alt, title)",
    !/google\.com\/s2|duckduckgo|favicon|srcset|title=/i.test(html) && leaks(html, ALL).length === 0 && /alt=""/.test(html),
    leaks(html, ALL),
  );
  // Nora added a company of her own called "Irisdale" (Add by name, above): that one is hers to see.
  const lockedIds = ALL.filter((x) => !coOf(vLock, x) || coOf(vLock, x)!.hidden);
  check("nor does the view the page is built from", !/google\.com\/s2|duckduckgo|favicon/i.test(JSON.stringify(vLock)) && leaks(vLock, lockedIds).filter((x) => x.toLowerCase() !== "irisdale").length === 0, { ids: lockedIds, leaks: leaks(vLock, lockedIds), icon: JSON.stringify(vLock).match(/.{40}(favicon|duckduckgo).{40}/i)?.[0] });
  // The company page (company/CompanyPage.tsx, the new look's record): every tab of every locked company, first visit and not.
  const { CompanyRecord } = await import("../app/post/company/CompanyPage");
  const { TABS } = await import("../app/post/company/companyModel");
  const { UiCtx, CellUiCtx } = await import("../app/post/ui");
  const noop = () => {};
  const uiFor = (me: unknown) => ({ me, act: async () => ({ ok: true, message: "" }), layout: "desktop", busy: new Set(), flash: new Set(), pulse: null, unlock: noop, unlockMany: async () => true, edit: noop, fill: async () => true, openCompany: noop, openAdd: noop, isHidden: (id: string) => locked.some((c) => c.id === id), holdsSeat: () => false, addable: () => [], seats: { n: 0, missing: 0 }, openSeats: noop, openPage: noop, contact: null });
  const pageOf = (vw: typeof vLock, i: ReturnType<typeof M.deriveAll>[number], tab: (typeof TABS)[number], first: boolean) =>
    renderToStaticMarkup(
      React.createElement(
        UiCtx.Provider,
        { value: uiFor(vw.me) as never },
        React.createElement(CellUiCtx.Provider, { value: uiFor(vw.me) as never }, React.createElement(CompanyRecord, { i, focus: null, pos: { n: 1, of: 2 }, onClose: noop, onStep: noop, crumbs: [{ label: "Companies" }], first, startTab: tab })),
      ),
    );
  const lockedInfos = M.deriveAll(vLock.companies).filter((i) => i.c.hidden);
  const pages = lockedInfos.flatMap((i) => TABS.flatMap((t) => [pageOf(vLock, i, t, true), pageOf(vLock, i, t, false)]));
  const pageLeaks = leaks(pages.join("\n"), lockedIds).filter((x) => x.toLowerCase() !== "irisdale");
  check("the company page never shows a locked company's name, website, LinkedIn or About, on any tab, first visit or not", lockedInfos.length > 3 && pages.length === lockedInfos.length * TABS.length * 2 && pageLeaks.length === 0, pageLeaks);
  const lockedHrefs = pages.join("\n").match(/href="[^"]*"/g) ?? [];
  check("and it links to no company's site: no website, public company page or job posting while it is locked", lockedHrefs.every((h) => !lockedIds.some((id) => { const c = Object.values(CO).find((x) => x.id === id); return !!c && h.toLowerCase().includes(c.site.split(".")[0]); }) && !/linkedin\.com\/company|\/jobs\/|\/careers\//.test(h)), lockedHrefs.slice(0, 10));
  // The same page at a company the member paid for names it (so the check above is not empty by accident).
  const vOlga = await view("tok-olga-lock");
  const elm = M.deriveAll(vOlga.companies).find((i) => i.c.id === pub(CO.elm.id))!;
  const elmPage = pageOf(vOlga, elm, "overview", false);
  check("and at a company the member opened, the page names it and links its website", !!elm && !elm.c.hidden && elmPage.includes(CO.elm.name) && elmPage.includes(CO.elm.site) && !/Free, showing now/.test(elmPage));
  const lockedPage = pages[0];
  check("a locked company's page says Locked company, what is free, what opening costs and has one button to open it", /<h1[^>]*>Locked company<\/h1>/.test(lockedPage) && /Free, showing now/.test(lockedPage) && /Opens with the company/.test(lockedPage) && /Still locked after that/.test(lockedPage) && (lockedPage.match(/Unlock company/g) ?? []).length >= 1 && !/Unlock all/.test(lockedPage));
  check("its tabs are a tab list, and the title takes focus (tabindex -1)", /role="tablist"/.test(lockedPage) && (lockedPage.match(/role="tab"/g) ?? []).length === TABS.length && /role="tabpanel"/.test(lockedPage) && /<h1 class="co-name-h" tabindex="-1">/.test(lockedPage));
  const tile = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: "", domain: null, hidden: true, seed: "Zq3-preview-seed", noLogo: true }));
  check("with no logo, a plain soft tile: a building, never made-up letters", /class="logo logo-locked"/.test(tile) && /<svg/.test(tile) && !/>[A-Z?]{1,2}</.test(tile) && !tile.includes("/api/logo"), tile);
  const noService = (h: string) => !/google|duckduckgo|clearbit|favicon|https?:\/\//i.test(h);
  const namedBare = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: CO.acme.name, domain: CO.acme.site }));
  check("a company the member can name, with no id the page knows: its letters, and no icon service", /class="logo"/.test(namedBare) && />AR</.test(namedBare) && !namedBare.includes("<img") && noService(namedBare), namedBare);
  const namedSeed = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: CO.acme.name, domain: CO.acme.site, seed: pub(CO.acme.id) }));
  check("with its id: our own /api/logo/<id>, no icon service and no domain in the markup", namedSeed.includes(`src="/api/logo/${pub(CO.acme.id)}"`) && noService(namedSeed) && !namedSeed.includes(CO.acme.site), namedSeed);
  // The table the page loads fills the domain-to-id map in the browser (app/post/model.ts), so a logo drawn from a domain alone uses our route too.
  const LI = await import("../app/ui/logoIds");
  const g0 = globalThis as { window?: unknown };
  g0.window = globalThis;
  LI.rememberLogo(`www.${CO.blue.site}`, pub(CO.blue.id));
  delete g0.window;
  LI.rememberLogo(CO.cobalt.site, pub(CO.cobalt.id)); // on the server: kept nowhere
  const namedDomain = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: CO.blue.name, domain: CO.blue.site }));
  const serverSide = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: CO.cobalt.name, domain: CO.cobalt.site }));
  check("a domain the member's table named maps to our route by its id; the server keeps no such map", namedDomain.includes(`src="/api/logo/${pub(CO.blue.id)}"`) && noService(namedDomain) && !serverSide.includes("<img"), { namedDomain, serverSide });
  const lockedNoMap = renderToStaticMarkup(React.createElement(S.CompanyLogo, { name: "", domain: CO.blue.site, hidden: true }));
  check("a locked logo never uses the domain map", !lockedNoMap.includes("/api/logo/"), lockedNoMap);

  /* ---------- the About, read without the company ---------- */
  console.log("\nThe About without the company");
  const { aboutWithout } = await import("../lib/scan/clean");
  const scrubCases: [string, string, string[], string][] = [
    ["Acme Robotics, Inc. builds robots. Acme's robots pick groceries.", "Acme Robotics", ["acme-robotics.com"], "The company builds robots. The company's robots pick groceries."],
    ["Founded in 2015, the Home Depot sells tools at homedepot.com.", "The Home Depot", ["https://www.homedepot.com"], "Founded in 2015, the company sells tools at the company."],
    ["Global Payments moves money. We are a global leader. Email press@globalpayments.com or visit https://globalpayments.com/news.", "Global Payments Inc.", ["globalpayments.com"], "The company moves money. We are a global leader."],
    ["ACME LABS makes widgets (acme.io). Learn more at www.acme.io/about-us.\n\nacme labs ships worldwide.", "Acme Labs", ["acme.io"], "The company makes widgets.\n\nThe company ships worldwide."],
    // A website on a shared host is no address of the company's own; the name the About opens with still goes.
    ["Northwind sells tea. Its LinkedIn page is linkedin.com/company/northwind.", "Northwind Tea", ["linkedin.com/company/northwind"], "The company sells tea. Its LinkedIn page is linkedin.com/company/northwind."],
    // The name before a separator, and the run of the name's words the About opens with, as written.
    ["Terra Reporting offers an ESG platform. Terra Reporting is based in Oslo.", "Terra Reporting | ESG Platform | Cloud", [], "The company offers an ESG platform. The company is based in Oslo."],
    ["Cygnet is a gin brand made in Wales. Every Cygnet bottle is hand-labelled. A cygnet is a young swan.", "Cygnet Gin", [], "The company is a gin brand made in Wales. Every bottle is hand-labelled. A cygnet is a young swan."],
    // It reads as natural words: "At the company, we", "the company's", a capital where a sentence starts, never "the company Technologies".
    ["At Zentrix, we help clinics. Zentrix's platform is HIPAA-ready.", "Zentrix Health, Inc.", ["zentrix.io"], "At the company, we help clinics. The company's platform is HIPAA-ready."],
    ["Quillmark Technologies provides ledgers. Teams trust Quillmark Cloud.", "Quillmark", ["https://quillmark.com"], "The company provides ledgers. Teams trust the company."],
    ["Orders ship from Brambleway Co. Each box is recycled. Brambleway Co. is based in Leeds.", "Brambleway", [], "Orders ship from the company. Each box is recycled. The company is based in Leeds."],
    ["Fox and Finch builds furniture. TidalBloom grows kelp for it.", "Fox & Finch", [], "The company builds furniture. TidalBloom grows kelp for it."],
    ["TidalBloom grows kelp. Tidal-Bloom ships it.", "Tidal Bloom", [], "The company grows kelp. The company ships it."],
    // Its initials: everywhere once given after the name, otherwise only where they stand as the company.
    ["Corvane Energy Technologies (CET) detects gas leaks. CET serves utilities.", "Corvane Energy Technologies", [], "The company detects gas leaks. The company serves utilities."],
    ["Halverd Customer Metrics sells CRM software. HCM is based in Leeds.", "Halverd Customer Metrics", [], "The company sells CRM software. The company is based in Leeds."],
    // A distinctive first word, and the name in capitals; a common one stays.
    ["Founded in 1914, Quendry is one of the largest freight brokers. QUENDRY ships fast.", "Quendry Freight Partners", [], "Founded in 1914, the company is one of the largest freight brokers. The company ships fast."],
    ["Global teams use Global Kite. Global Kite is based in Oslo.", "Global Kite", [], "Global teams use the company. The company is based in Oslo."],
    ["Velo Labs is a bike maker. Every Velo frame is hand-built, and velo means bike.", "Velo Labs", [], "The company is a bike maker. Every frame is hand-built, and velo means bike."],
    // "the U.S., and" keeps its comma; "Dr." before a person's name goes with their sentence.
    ["Kestrelia helps founders expand into the U.S., Canada and Europe.", "Kestrelia", [], "The company helps founders expand into the U.S., Canada and Europe."],
    ["Brightline builds maps. Its CEO is Dr. Dana Roe. It has 40 staff.", "Brightline Maps", [], "The company builds maps. It has 40 staff."],
    ["Elk Ridge Investments buys rental homes.", "Investments Elk Ridge", [], "The company buys rental homes."],
    // A sentence naming one of its people (a paid fact) goes.
    ["Brightline builds maps. Founded by Dana Roe and Sam Lee, it serves cities. It has 40 staff.", "Brightline Maps", [], "The company builds maps. It has 40 staff."],
  ];
  for (const [text, name, sites, want] of scrubCases) {
    const got = aboutWithout(text, name, sites, /Dana Roe/.test(text) ? ["Dana Roe", null, "Pat"] : []);
    check(`aboutWithout: ${JSON.stringify(text.slice(0, 48))}...`, got === want, got);
  }

  /* ---------- the landing page ---------- */
  console.log("\nThe landing page");
  const p = await preview({ fn: "Marketing" });
  const named = p.rows.filter((r) => r.company && "name" in r.company && r.company.name).map((r) => (r.company as { name: string }).name);
  check("the signed-out preview still names companies, as before", named.length > 0 && named.some((n) => Object.values(CO).some((c) => c.name === n)), named);
  /* ---------- owner review M2: what an unlock costs, against the ledger ---------- */
  console.log("\nUnlock prices against the ledger (owner review M2)");
  {
    const rowsOf = async (memberId: string) => (await T.loadState()).ledger.filter((l) => l.memberId === memberId && l.reason === "unlock");
    // Free: an entitlement applies (the free company of the day). Asking for the posting of a locked hiring company buys the company bundle, for 0.
    const f0 = (await view("tok-m2free-lock")).me!.credits;
    const fr = await act("tok-m2free-lock", { type: "unlock", entity: "engagement", id: pub("e_blue_open"), field: "posting" });
    const fRows = await rowsOf("m_m2free");
    const fBlue = coOf(await view("tok-m2free-lock"), CO.blue.id)!;
    check("M2 free: the posting at a locked company opens with the company, free with the free company of the day", fr.ok && fr.r.me?.credits === f0 && fBlue.hidden !== true && fBlue.engagements[0].cells.posting?.s === "value" && fBlue.engagements[0].cells.rate?.s === "value", fr.ok ? fr.r.message : fr);
    check("M2 free: one ledger row, 0 credits, on the company, marked free", fRows.length === 1 && fRows[0].delta === 0 && fRows[0].ref === `${CO.blue.id}.identity` && fRows[0].why === "free", fRows);
    // Paid: the locked-company bundle, 2 credits, one row on the company (the posting and rate come with it, no row of their own).
    const p0 = (await view("tok-m2paid-lock")).me!.credits;
    const pr = await act("tok-m2paid-lock", { type: "unlock", entity: "engagement", id: pub("e_blue_open"), field: "posting" });
    const pRows = (await rowsOf("m_m2paid")).filter((l) => l.ref !== "c_gone_free2.identity");
    const pBlue = coOf(await view("tok-m2paid-lock"), CO.blue.id)!;
    check("M2 paid: the posting at a locked company is the company bundle, 2 credits", pr.ok && pr.r.me?.credits === p0 - 2 && / for 2 credits\.$/.test(pr.r.message) && pBlue.hidden !== true && pBlue.engagements[0].cells.posting?.s === "value" && pBlue.engagements[0].cells.rate?.s === "value", pr.ok ? pr.r.message : pr);
    check("M2 paid: one ledger row of -2 on the company, none for the posting or the rate", pRows.length === 1 && pRows[0].delta === -2 && pRows[0].ref === `${CO.blue.id}.identity` && !pRows[0].why, pRows);
    // Already visible: a new posting at a company the member can see is 1 credit, on the posting.
    const vFox0 = coOf(await view("tok-m2vis-lock"), CO.fox.id)!;
    const v0 = (await view("tok-m2vis-lock")).me!.credits;
    const vr = await act("tok-m2vis-lock", { type: "unlock", entity: "engagement", id: pub("e_fox_open"), field: "posting" });
    const vRows = await rowsOf("m_m2vis");
    check("M2 already visible: the company is named and its open role's posting is locked before", vFox0.hidden !== true && vFox0.name === CO.fox.name && vFox0.engagements.find((e) => e.id === pub("e_fox_open"))?.cells.posting?.s === "locked", vFox0.engagements.map((e) => e.cells.posting));
    check("M2 already visible: the posting is 1 credit", vr.ok && vr.r.me?.credits === v0 - 1 && / for 1 credit\.$/.test(vr.r.message), vr.ok ? vr.r.message : vr);
    check("M2 already visible: one ledger row of -1 on the posting, none on the company", vRows.length === 1 && vRows[0].delta === -1 && vRows[0].ref === "e_fox_open.posting", vRows);
    // Repeated: each again is free, and writes no ledger row.
    const again = [
      await act("tok-m2free-lock", { type: "unlock", entity: "engagement", id: pub("e_blue_open"), field: "posting" }),
      await act("tok-m2paid-lock", { type: "unlock", entity: "company", id: pub(CO.blue.id), field: "identity" }),
      await act("tok-m2paid-lock", { type: "unlock", entity: "engagement", id: pub("e_blue_open"), field: "rate" }),
      await act("tok-m2vis-lock", { type: "unlock", entity: "engagement", id: pub("e_fox_open"), field: "posting" }),
    ];
    const after = [(await rowsOf("m_m2free")).length, (await rowsOf("m_m2paid")).length, (await rowsOf("m_m2vis")).length];
    const credits = [(await view("tok-m2free-lock")).me!.credits, (await view("tok-m2paid-lock")).me!.credits, (await view("tok-m2vis-lock")).me!.credits];
    check("M2 repeated: asking again spends nothing, in plain words", again.every((x) => !x.ok && /Nothing here is locked, so no credit was spent\./.test(x.error)), again.map((x) => (x.ok ? x.r.message : x.error)));
    check("M2 repeated: no new ledger rows and the same balances", after.join() === "1,2,1" && credits.join() === [f0, p0 - 2, v0 - 1].join(), [after, credits]);
    // The words at the point of action say the same rules.
    const pmodel = readFileSync(path.join(process.cwd(), "app/post/model.ts"), "utf8");
    check("M2 words: in the app a locked company's posting says it comes with the company for 2 credits, a visible one's says 1 credit", pmodel.includes("Comes with the company. Unlock the company for ${COMPANY_PRICE_SAY} and you see its name, the job posting and the posted rate.") && pmodel.includes("One credit opens the job posting and the posted rate."));
    const vis = readFileSync(path.join(process.cwd(), "app/landing/Visuals.tsx"), "utf8");
    check("M2 words: the landing hero's posting is quoted as the locked-company bundle (2 credits) and says when it is 1", /PostingUnlock/.test(vis) && /COMPANY_PRICE/.test(vis) && /already see the company, a new job posting there is 1 credit/.test(vis));
    const PM = await import("../app/post/model");
    const hiddenBlue = { c: { hidden: true }, engs: [{ id: "eb", opened: "2026-01-01", cells: {} }] } as never;
    const openBlue = { c: { hidden: false }, engs: [{ id: "eb", opened: "2026-01-01", cells: {} }] } as never;
    check("M2 quote: in the app, a posting at a locked company is quoted as the company (buysCompany), at a visible one as 1 credit", PM.buysCompany(hiddenBlue, { entity: "engagement", id: "eb", field: "posting" }) && PM.buysCompany(hiddenBlue, { entity: "engagement", id: "eb", field: "rate" }) && !PM.buysCompany(openBlue, { entity: "engagement", id: "eb", field: "posting" }) && !PM.buysCompany(hiddenBlue, { entity: "engagement", id: "eb", field: "operator" }));
    const tpSrc = readFileSync(path.join(process.cwd(), "app/post/TradingPost.tsx"), "utf8");
    check("M2 quote: the question before an unlock uses that price and names the company", /const costOf = \(t: FactRef, from\?: "crystal"\) => \(t\.field === "identity" \|\| buysCompany\(ownerOf\.get\(t\.id\), t\) \? \(from === "crystal" \|\| freeCompanyNow\(me\) \? 0 : COMPANY_PRICE\) : 1\);/.test(tpSrc) && /confirmSpend\(costOf\(t, opts\?\.from\), whatOf\(t\)\)/.test(tpSrc));
    const readme = readFileSync(path.join(process.cwd(), "README.md"), "utf8");
    check("M2 README: the locked-company bundle is 2 credits, a posting at a visible company 1, a repeat free", /A hidden company is one purchase with the role and posting of each open role there: asking for the company, such a role or such a posting buys all of them for 2 credits/.test(readme) && /posting and posted rate of an open role at a company the member can already see are one purchase for 1 credit/.test(readme) && /Asking again for anything already open spends nothing/.test(readme) && !/buys all of them for 1 credit/.test(readme));
  }

  const signedOut = await T.buildView(null);
  check("the signed-out table sends counts only", !signedOut.companies.length || leaks(signedOut, ALL).length === 0);

  // Logos: a company logo is asked for by the company's public id, so every CompanyLogo that
  // names a company passes it (seed). Without it the page draws letters even when the company's
  // own site has a logo (owner, 2026-11-24: "lots of pages still missing logos"). The one
  // exception is the Add modal's preview of a website being typed, which has no id yet.
  const tsxFiles = (d: string): string[] =>
    readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? tsxFiles(path.join(d, e.name)) : e.name.endsWith(".tsx") ? [path.join(d, e.name)] : []));
  const appDir = path.join(process.cwd(), "app");
  const noSeed: string[] = [];
  for (const f of tsxFiles(appDir))
    for (const [k, line] of readFileSync(f, "utf8").split("\n").entries())
      if (line.includes("<CompanyLogo ") && !/\bseed=|\bnoLogo\b/.test(line) && !line.includes("(!linkedin && website)")) noSeed.push(`${path.relative(appDir, f)}:${k + 1}`);
  check("every company logo is asked for by the company's id", noSeed.length === 0, noSeed);
  const tileFiles = ["post/find/Find.tsx", "post/network/WarmPaths.tsx", "post/network/Paths.tsx", "post/proposalsPage/ProposalsHome.tsx", "post/contracts/ContractsPage.tsx", "post/messages/Messages2.tsx"];
  const noTile = tileFiles.filter((f) => !readFileSync(path.join(appDir, f), "utf8").includes("<TileLogo "));
  check("hand-made company letter tiles carry the company's logo over the letters", noTile.length === 0, noTile);

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
