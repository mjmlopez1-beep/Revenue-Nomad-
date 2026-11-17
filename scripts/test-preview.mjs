#!/usr/bin/env node
/**
 * The landing page's "Try it" (GET /api/table?preview=1, lib/preview.ts) never gives a company
 * away: no company name, website, domain, LinkedIn or public id, no person, seat holder or
 * hiring contact, no job posting link and no rate, for every function, industry and country
 * it offers. Run against a throwaway server on a FRESH data dir:
 *
 *   BASE=http://localhost:4600 node scripts/test-preview.mjs
 *
 * The server needs RN_ADMIN_EMAILS=admin-qa@example.com, RN_SCAN_TEST=1 and RN_CRON_SECRET (as
 * scripts/test-all.sh starts it). An admin sees every company by name, so the list of names to
 * look for comes from the admin's view, plus the private seed (people and seat holders) when
 * data/intel-seed.json is there. Nothing from either is printed.
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const RUN = Date.now().toString(36);
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
let ipN = 0;
// A fresh address per request: the preview allows 60 a minute per address, and this sends hundreds.
const nextIp = () => `${IP_BASE.split(".").slice(0, 2).join(".")}.${(++ipN >> 8) & 255}.${ipN & 255}`;

let failures = 0;
let passes = 0;
const pass = (name) => (passes++, console.log(`PASS ${name}`));
const fail = (name, detail) => (failures++, console.log(`FAIL ${name}${detail === undefined ? "" : `: ${String(detail).slice(0, 300)}`}`));
const check = (name, ok, detail) => (ok ? pass(name) : fail(name, detail));

async function call(method, path, { token, body, headers = {} } = {}) {
  const h = { "x-forwarded-for": nextIp(), ...headers };
  if (token) h.cookie = `rn_table=${token}`;
  if (body !== undefined) h["content-type"] = "application/json";
  const r = await fetch(BASE + path, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* not JSON */
  }
  return { status: r.status, json, text, headers: r.headers };
}

const preview = (q = {}) => {
  const p = new URLSearchParams({ preview: "1" });
  for (const [k, v] of Object.entries(q)) if (v) p.set(k, v);
  return call("GET", `/api/table?${p}`);
};

let seedFile = null;
try {
  seedFile = JSON.parse(readFileSync(process.env.SEED_FILE ?? "data/intel-seed.json", "utf8"));
} catch {
  /* no seed here: names come from the admin's view alone */
}

/* ---------- what must never show ---------- */

const host = (v) =>
  String(v ?? "")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split(/[/?#]/)[0];

async function main() {
  // A role whose posted title names its company and its site: the preview must scrub both.
  const co = `Zephyrquill Dynamics ${RUN}`;
  const site = `zephyrquill-${RUN}.example.com`;
  const now = new Date().toISOString();
  const scan = await call("POST", "/api/table/scan", {
    headers: { "x-cron-secret": CRON_SECRET },
    body: {
      now,
      sources: [{ source: `qa-preview-${RUN}`, fetched: 3, matched: 2 }],
      roles: [
        { key: `qapreview${RUN}:1`, company: co, domain: site, title: `Fractional VP Sales at ${co} (${site})`, function: "Sales", type: "Fractional", url: `https://jobs.example.com/qa-preview/${RUN}/1`, source: `qa-preview-${RUN}`, postedAt: now.slice(0, 10), rate: "$175/hr", hoursPerWeek: 12 },
        { key: `qapreview${RUN}:2`, company: `${co} Labs`, domain: null, title: `${co} Labs is hiring a Fractional CMO`, function: "Marketing", type: "Fractional", url: `https://jobs.example.com/qa-preview/${RUN}/2`, source: `qa-preview-${RUN}`, postedAt: null, rate: "$9k/mo", hoursPerWeek: null },
      ],
    },
  });
  check("a test scan with company names in the titles is stored", scan.status === 200 && scan.json?.result?.opened === 2, scan.text.slice(0, 200));

  // Every company by name: the admin's view hides nothing.
  const join = await call("POST", "/api/table", { headers: { "x-cron-secret": CRON_SECRET }, body: { join: { name: "Admin Qa", email: process.env.ADMIN_EMAIL || "admin-qa@example.com" } } });
  const token = (join.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  const adminView = token ? (await call("GET", "/api/table", { token })).json : null;
  const companies = adminView?.companies ?? [];
  check("the admin's view lists companies by name (the list to look for)", companies.length > 0 && companies.some((c) => c.name === co), companies.length);

  const names = new Set();
  const hosts = new Set();
  const ids = new Set();
  const people = new Set();
  const links = new Set();
  const addName = (n) => {
    const v = String(n ?? "").trim().toLowerCase();
    if (v.length >= 4) names.add(v);
  };
  for (const c of companies) {
    addName(c.name);
    ids.add(c.id);
    for (const v of [c.iconDomain, c.cells?.website?.v]) if (v && host(v).includes(".")) hosts.add(host(v));
    if (c.cells?.linkedin?.v) links.add(String(c.cells.linkedin.v).toLowerCase());
    for (const e of c.engagements ?? []) {
      ids.add(e.id);
      for (const f of ["operator", "posting", "rate"]) if (e.cells?.[f]?.s === "value" && e.cells[f].v) (f === "operator" ? people : links).add(String(e.cells[f].v).toLowerCase());
      for (const p of e.people ?? []) for (const f of ["name", "email", "phone", "linkedin"]) if (p.cells?.[f]?.s === "value") people.add(String(p.cells[f].v).toLowerCase());
    }
    for (const p of c.people ?? []) for (const f of ["name", "email", "phone", "linkedin"]) if (p.cells?.[f]?.s === "value") people.add(String(p.cells[f].v).toLowerCase());
  }
  if (seedFile) {
    for (const c of seedFile.companies ?? []) {
      addName(c.fields?.name);
      if (c.fields?.website && host(c.fields.website).includes(".")) hosts.add(host(c.fields.website));
      if (c.fields?.linkedin) links.add(String(c.fields.linkedin).toLowerCase());
    }
    for (const e of seedFile.engagements ?? []) {
      if (e.fields?.operator) people.add(String(e.fields.operator).toLowerCase());
      for (const f of ["posting", "rate"]) if (e.fields?.[f]) links.add(String(e.fields[f]).toLowerCase());
    }
    for (const p of seedFile.contacts ?? []) for (const f of ["name", "email", "phone", "linkedin"]) if (p.fields?.[f]) people.add(String(p.fields[f]).toLowerCase());
    for (const m of seedFile.members ?? []) for (const v of [m.name, m.email, m.token]) if (v) people.add(String(v).toLowerCase());
  }
  hosts.add(site);
  for (const s of [...people]) if (s.length < 5) people.delete(s);
  for (const s of [...links]) if (s.length < 6) links.delete(s);

  /** What a preview field may hold in its free fields: the words these lists use are not company names. */
  const words = (s) => String(s ?? "").toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const nameRes = [...names].map((n) => [n, new RegExp(`(^|[^\\p{L}\\p{N}])${esc(n)}($|[^\\p{L}\\p{N}])`, "iu")]);

  const ROW_KEYS = new Set(["seed", "kind", "title", "function", "when", "industry", "employees", "country", "holder"]);
  const TOP_KEYS = new Set(["fn", "industry", "country", "counts", "rows", "options"]);
  let answers = 0;
  let rowsSeen = 0;
  const leaks = [];
  const shape = [];
  const allowed = new Set();
  /** Look through one answer. `vocab`: the option lists, which may hold words that are also some company's name. */
  const inspect = (label, a, text) => {
    answers++;
    if (!a || typeof a !== "object") return shape.push(`${label}: not JSON`);
    for (const k of Object.keys(a)) if (!TOP_KEYS.has(k)) shape.push(`${label}: key ${k}`);
    if (!Array.isArray(a.rows) || a.rows.length > 6) shape.push(`${label}: ${a.rows?.length} rows`);
    const low = text.toLowerCase();
    for (const h of hosts) if (low.includes(h)) leaks.push(`${label}: a company domain`);
    for (const id of ids) if (text.includes(`"${id}"`)) leaks.push(`${label}: a public id`);
    for (const p of people) if (low.includes(p)) leaks.push(`${label}: a person or member`);
    for (const l of links) if (low.includes(l)) leaks.push(`${label}: a link or rate`);
    if (/https?:|www\.|@/.test(low)) leaks.push(`${label}: a link or an email`);
    for (const r of a.rows ?? []) {
      rowsSeen++;
      for (const k of Object.keys(r)) if (!ROW_KEYS.has(k)) shape.push(`${label}: row key ${k}`);
      if (typeof r.seed !== "string" || ids.has(r.seed)) shape.push(`${label}: seed is not opaque`);
      // Titles are the one free text: no company's name in them as a whole word, unless it is
      // one of the words the free fields use anyway (a company called "Growth").
      for (const [n, re] of nameRes) if (!allowed.has(n) && re.test(words(r.title))) leaks.push(`${label}: a company name in a title`);
    }
  };

  const first = await preview({ fn: "Sales" });
  check("the preview answers for Sales", first.status === 200 && first.json?.counts && Array.isArray(first.json.rows), first.text.slice(0, 200));
  const opts = first.json?.options ?? { functions: [], industries: [], countries: [] };
  for (const x of [...opts.functions, ...opts.industries, ...opts.countries]) allowed.add(x.toLowerCase());
  for (const w of ["fractional", "interim", "sales", "marketing", "head", "lead", "leader", "vp", "chief", "officer", "director", "seat", "role"]) allowed.add(w);
  check("it offers every function but Other, and industries and countries", opts.functions.length >= 15 && !opts.functions.includes("Other") && opts.industries.length > 0 && opts.countries.length > 0, JSON.stringify(opts).slice(0, 200));
  inspect("Sales", first.json, first.text);

  const sales = first.json?.rows ?? [];
  check("the scrubbed test role is among the Sales rows", sales.some((r) => r.kind === "open" && /fractional vp sales/i.test(r.title)), JSON.stringify(sales.map((r) => r.title)));
  check("its title keeps no trace of the company or its site", !sales.some((r) => /zephyrquill/i.test(r.title)));
  const mk = await preview({ fn: "Marketing" });
  check("a title that starts with the company's name loses it", mk.status === 200 && !/zephyrquill/i.test(mk.text), (mk.json?.rows ?? []).map((r) => r.title).join(" | "));

  // Every function alone, with each country, and with each industry.
  for (const fn of opts.functions) {
    const qs = [{ fn }, ...opts.countries.map((country) => ({ fn, country })), ...opts.industries.map((ind) => ({ fn, ind }))];
    for (let i = 0; i < qs.length; i += 16) {
      const batch = qs.slice(i, i + 16);
      const rs = await Promise.all(batch.map((q) => preview(q)));
      rs.forEach((r, n) => {
        const q = batch[n];
        const label = `${q.fn}/${q.country ?? q.ind ?? "any"}`;
        if (r.status !== 200) return shape.push(`${label}: status ${r.status}`);
        if (r.json.fn !== q.fn) shape.push(`${label}: answered for ${r.json.fn}`);
        inspect(label, r.json, r.text);
      });
    }
  }
  check(`no company name, domain, id, person, link or rate in any of ${answers} answers (${rowsSeen} rows)`, leaks.length === 0, `${leaks.length} found, first ${leaks.slice(0, 3).join("; ")}`);
  check("every answer has only the fields the preview promises", shape.length === 0, shape.slice(0, 5).join("; "));
  check("the answers covered rows of both kinds", rowsSeen > 0);

  // Counts hang together.
  const c = first.json?.counts ?? {};
  check("counts are whole numbers and hold together", ["hired", "notYet", "hiring", "holders", "repeat", "anyHire"].every((k) => Number.isInteger(c[k]) && c[k] >= 0) && c.holders <= c.hired && c.hired <= c.anyHire && c.notYet <= c.anyHire, JSON.stringify(c));

  // Values not on the lists are refused, and nothing comes back but the message.
  for (const [what, q] of [
    ["a function", { fn: "Astronaut" }],
    ["an industry", { fn: "Sales", ind: "<script>" }],
    ["a country", { fn: "Sales", country: "Atlantis" }],
    ["a company name as the country", { fn: "Sales", country: co }],
  ]) {
    const r = await preview(q);
    check(`${what} not on the list is refused`, r.status === 400 && r.json?.error && !r.json.rows, `${r.status} ${r.text.slice(0, 120)}`);
  }
  const lower = await preview({ fn: "sales", country: opts.countries[0]?.toLowerCase() });
  check("a value in another case reads as the list's own", lower.status === 200 && lower.json?.fn === "Sales" && lower.json?.country === opts.countries[0], lower.text.slice(0, 120));
  const none = await preview({});
  check("no function reads as Sales", none.status === 200 && none.json?.fn === "Sales");

  // Signed out, the main view still carries no companies.
  const anon = await call("GET", "/api/table");
  check("the signed-out view still has no company records", anon.status === 200 && Array.isArray(anon.json?.companies) && anon.json.companies.length === 0);
}

try {
  await main();
} catch (e) {
  fail("preview checks (threw)", String(e?.stack ?? e));
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
