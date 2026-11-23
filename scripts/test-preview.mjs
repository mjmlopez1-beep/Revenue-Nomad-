#!/usr/bin/env node
/**
 * The landing page's "Try it" and example record (GET /api/table?preview=1, lib/preview.ts)
 * show real companies (name, domain, logo, industry, size, revenue, country), role titles and
 * dates, and never a person: no seat holder, hiring contact or member name, no email, no phone,
 * no person's LinkedIn, no job posting link and no rate, for every function, industry and
 * country it offers. No public id either: a named company's logo id is "lp_" and its row's seed. Each answer names at most 10 companies: the rows after
 * the 10th carry no company at all (`company: null`, `blur: true`) and no company's name in their
 * title, so the page can only blur a made-up one. Of the companies with an open role (hidden in
 * the app until a member unlocks one), the preview names at most 3 IN ALL, rows and example record
 * together, across every function, industry, country and tab, and the same 3 between requests
 * (lib/preview.ts PREVIEW_OPEN_NAMED); the rest come with no company, a title with no trace of it
 * and a seed made for that answer alone. A picked country keeps the companies whose country isn't
 * on file, says how many are in that country (`inCountry`), and lists that country's first.
 * Run against a throwaway server on a FRESH data dir:
 *
 *   BASE=http://localhost:4600 node scripts/test-preview.mjs
 *
 * The server needs RN_ADMIN_EMAILS=admin-qa@example.com, RN_SCAN_TEST=1 and RN_CRON_SECRET (as
 * scripts/test-all.sh starts it). The admin's view has every person, posting and rate, so the
 * list to look for comes from it, plus the private seed (people, seat holders and members) when
 * data/intel-seed.json is there. Nothing from either is printed.
 *
 * PREVIEW_LOCKED=1: the server runs with RN_PREVIEW_OPEN_ROLE_COMPANIES=0 (no open-role company
 * named, a test-server-only override of PREVIEW_OPEN_NAMED), and the checks expect that:
 * no company on an open-role row, titles scrubbed of the company, and no open-role company named.
 */
import { readFileSync } from "node:fs";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const RUN = Date.now().toString(36);
const IP_BASE = `10.${(Date.now() >> 8) & 255}.${Date.now() & 255}`;
let ipN = 0;
// A fresh address per request: the preview allows 60 a minute per address, and this sends hundreds.
const nextIp = () => `${IP_BASE.split(".").slice(0, 2).join(".")}.${(++ipN >> 8) & 255}.${ipN & 255}`;

const LOCKED = process.env.PREVIEW_LOCKED === "1";
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
        // Older Sales roles at other companies, so Sales has more open roles than the preview names.
        ...[1, 2, 3, 4, 5].map((k) => ({ key: `qapreview${RUN}:s${k}`, company: `Quillfern Works ${RUN} ${k}`, domain: `quillfern-${RUN}-${k}.example.com`, title: `Fractional Head of Sales at Quillfern Works ${RUN} ${k}`, function: "Sales", type: "Fractional", url: `https://jobs.example.com/qa-preview/${RUN}/s${k}`, source: `qa-preview-${RUN}`, postedAt: new Date(Date.parse(now) - k * 86_400_000).toISOString().slice(0, 10), rate: null, hoursPerWeek: null })),
      ],
    },
  });
  check("a test scan with company names in the titles is stored", scan.status === 200 && scan.json?.result?.opened === 7, scan.text.slice(0, 200));

  // Every company by name: the admin's view hides nothing.
  const join = await call("POST", "/api/table", { headers: { "x-cron-secret": CRON_SECRET }, body: { join: { name: "Admin Qa", email: process.env.ADMIN_EMAIL || "admin-qa@example.com" } } });
  const token = (join.headers.getSetCookie?.() ?? []).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean) ?? null;
  const adminView = token ? (await call("GET", "/api/table", { token })).json : null;
  const companies = adminView?.companies ?? [];
  check("the admin's view lists companies by name (the list to look for)", companies.length > 0 && companies.some((c) => c.name === co), companies.length);

  // The homepage lists only companies with their industry and revenue on file: give the test companies both.
  for (const c of companies.filter((x) => /zephyrquill|quillfern/i.test(x.name ?? ""))) {
    for (const [field, value] of [["industry", "SaaS"], ["revenue", "$5M-$20M"]]) {
      if (c.cells?.[field]?.s === "value") continue;
      const r = await call("POST", "/api/table", { token, body: { action: { type: "fill", entity: "company", id: c.id, field, value } } });
      if (r.status !== 200) console.log("fill failed", field, r.text.slice(0, 160));
    }
  }

  /** Companies with an open role: named only while open-role companies are shown. */
  const names = new Set();
  /** Every company's name: none may show on a row past the 10th. */
  const everyName = new Set();
  const hosts = new Set();
  const ids = new Set();
  const people = new Set();
  const links = new Set();
  const addName = (n) => {
    const v = String(n ?? "").trim().toLowerCase();
    if (v.length >= 4) names.add(v);
  };
  const isOpen = (e) => (e.opened ? !e.closed : e.cells?.status?.v === "Open role");
  for (const c of companies) {
    const nm = String(c.name ?? "").trim().toLowerCase();
    if (nm.length >= 4) everyName.add(nm);
    if ((c.engagements ?? []).some(isOpen)) {
      addName(c.name);
      for (const v of [c.iconDomain, c.cells?.website?.v]) if (v && host(v).includes(".")) hosts.add(host(v));
    }
    ids.add(c.id);
    for (const e of c.engagements ?? []) {
      ids.add(e.id);
      for (const f of ["operator", "posting", "rate"]) if (e.cells?.[f]?.s === "value" && e.cells[f].v) (f === "operator" ? people : links).add(String(e.cells[f].v).toLowerCase());
      for (const p of e.people ?? []) for (const f of ["name", "email", "phone", "linkedin"]) if (p.cells?.[f]?.s === "value") people.add(String(p.cells[f].v).toLowerCase());
    }
    for (const p of c.people ?? []) for (const f of ["name", "email", "phone", "linkedin"]) if (p.cells?.[f]?.s === "value") people.add(String(p.cells[f].v).toLowerCase());
  }
  if (seedFile) {
    for (const e of seedFile.engagements ?? []) {
      if (e.fields?.operator) people.add(String(e.fields.operator).toLowerCase());
      for (const f of ["posting", "rate"]) if (e.fields?.[f]) links.add(String(e.fields[f]).toLowerCase());
    }
    for (const p of seedFile.contacts ?? []) for (const f of ["name", "email", "phone", "linkedin"]) if (p.fields?.[f]) people.add(String(p.fields[f]).toLowerCase());
    for (const m of seedFile.members ?? []) for (const v of [m.name, m.email, m.token]) if (v) people.add(String(v).toLowerCase());
  }
  hosts.add(site);
  for (let k = 1; k <= 5; k++) hosts.add(`quillfern-${RUN}-${k}.example.com`);
  // A word shorter than 5 letters (a first name alone) can be part of anything; whole names and contacts are what count.
  for (const s of [...people]) if (s.length < 5) people.delete(s);
  for (const s of [...links]) if (s.length < 6) links.delete(s);

  /** What a preview field may hold in its free fields: the words these lists use are not company names. */
  const words = (s) => String(s ?? "").toLowerCase();
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const wordRe = (n) => new RegExp(`(^|[^\\p{L}\\p{N}])${esc(n)}($|[^\\p{L}\\p{N}])`, "iu");
  const nameRes = [...names].map((n) => [n, wordRe(n)]);
  // Every company name as its words, so a title is checked by its word runs, not thousands of regexes.
  const wordsOf = (v) => String(v).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const everyKey = new Set([...everyName].map((n) => wordsOf(n).join(" ")).filter(Boolean));
  const namesIn = (t) => {
    const w = wordsOf(t);
    const hits = [];
    for (let i = 0; i < w.length; i++) for (let j = i + 1; j <= Math.min(w.length, i + 8); j++) if (everyKey.has(w.slice(i, j).join(" "))) hits.push(w.slice(i, j).join(" "));
    // The words these lists use (functions, industries, countries, title words) are not taken as a company's name.
    const ok = new Set([...allowed].map((x) => wordsOf(x).join(" ")));
    return hits.filter((h) => !ok.has(h));
  };

  const ROW_KEYS = new Set(["seed", "kind", "company", "blur", "title", "function", "type", "when", "industry", "employees", "revenue", "country", "holder", "ledSince"]);
  const NAMED_MAX = 10;
  /** Companies with an open role one answer may name, rows and example together. */
  const OPEN_NAMED_MAX = LOCKED ? 0 : 3;
  let openNamedMost = 0;
  let openKept = 0;
  const ROWS_MAX = 25;
  const CO_KEYS = new Set(["name", "domain", "logo", "logoId"]);
  const EX_KEYS = { top: new Set(["company", "open", "seat"]), company: new Set(["name", "domain", "logo", "logoId", "industry", "employees", "revenue", "country"]), open: new Set(["title", "function", "when"]), seat: new Set(["function", "start", "rnMember"]) };
  const TOP_KEYS = new Set(["fn", "view", "total", "industry", "country", "counts", "inCountry", "rows", "example", "openRoleCompanies", "options"]);
  /** Every open-role company any answer named: the preview's one set, at most OPEN_NAMED_MAX. */
  const openNamedUnion = new Set();
  /** Seeds of rows whose company is withheld, by answer: no two answers may share one. */
  const withheldSeeds = new Map();
  let namedRows = 0;
  let namedSlots = 0;
  let blurRows = 0;
  let notYetRows = 0;
  let openRows = 0;
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
    if (!Array.isArray(a.rows) || a.rows.length > ROWS_MAX) shape.push(`${label}: ${a.rows?.length} rows`);
    if (!["all", "hiring", "notyet"].includes(a.view)) shape.push(`${label}: view ${a.view}`);
    if (!Number.isInteger(a.total) || a.total < (a.rows?.length ?? 0)) shape.push(`${label}: total ${a.total}`);
    const named = (a.rows ?? []).filter((r) => r.company).length;
    if (named > NAMED_MAX) shape.push(`${label}: ${named} named companies`);
    const low = text.toLowerCase();
    for (const id of ids) if (text.includes(`"${id}"`)) leaks.push(`${label}: a public id`);
    // A company's own name can hold a person's name (a foundation named after someone, e.g. "John W. Brick
    // Mental Health Foundation"), which then matches a contact elsewhere named "John W.". The names the
    // answer shows are allowed, so they are taken out before looking for people.
    let lowPeople = low;
    for (const n of [...(a.rows ?? []).map((r) => r.company?.name), a.example?.company?.name]) if (n) lowPeople = lowPeople.split(JSON.stringify(String(n).toLowerCase())).join('""');
    for (const p of people) if (lowPeople.includes(p)) leaks.push(`${label}: a person, member or contact detail`);
    for (const l of links) if (low.includes(l)) leaks.push(`${label}: a posting link, a rate or a LinkedIn page`);
    if (/https?:|www\.|linkedin\.com\/|@/.test(low)) leaks.push(`${label}: a link or an email`);
    if (a.openRoleCompanies !== !LOCKED) shape.push(`${label}: openRoleCompanies is ${a.openRoleCompanies}`);
    // The open-role companies this answer names (rows and example together): at most OPEN_NAMED_MAX.
    const lc = (n) => String(n).trim().toLowerCase();
    const openNamed = new Set([...(a.rows ?? []).map((r) => r.company?.name), a.example?.company?.name].filter((n) => n && names.has(lc(n))).map(lc));
    openNamedMost = Math.max(openNamedMost, openNamed.size);
    for (const n of openNamed) openNamedUnion.add(n);
    if (openNamed.size > OPEN_NAMED_MAX) shape.push(`${label}: ${openNamed.size} open-role companies named`);
    const key = `${a.fn}|${a.industry ?? ""}|${a.country ?? ""}|${a.view}`;
    if (!withheldSeeds.has(key)) withheldSeeds.set(key, new Set((a.rows ?? []).filter((r) => !r.company).map((r) => r.seed)));
    // A picked country keeps the companies whose country isn't on file: no row is in another country, and
    // that country's rows come first among the open roles, and among the past seats (open roles lead).
    if (a.country) {
      if ((a.rows ?? []).some((r) => r.country && r.country !== a.country)) shape.push(`${label}: a row in another country`);
      for (const kind of ["open", "hired", "notyet"]) {
        const ctry = (a.rows ?? []).filter((r) => r.kind === kind).map((r) => r.country);
        if (ctry.some((x, n) => x === a.country && n > 0 && ctry[n - 1] !== a.country)) shape.push(`${label}: a ${kind} row in ${a.country} after one with no country`);
      }
      const ic = a.inCountry;
      if (!ic || ["hired", "notYet", "hiring", "holders", "all"].some((k) => !Number.isInteger(ic[k]) || ic[k] < 0 || ic[k] > a.counts?.[k])) shape.push(`${label}: inCountry ${JSON.stringify(ic)}`);
    } else if (a.inCountry !== null) shape.push(`${label}: inCountry with no country picked`);
    // Every other open-role company: not named anywhere in the answer, not even in a title.
    const shownHosts = [...(a.rows ?? []).flatMap((r) => [r.company?.domain, r.company?.logo]), a.example?.company?.domain, a.example?.company?.logo].filter(Boolean).map(lc);
    for (const h of hosts) if (low.includes(h) && !shownHosts.some((d) => d === h || h.endsWith(`.${d}`) || d.endsWith(`.${h}`))) leaks.push(`${label}: a kept-back open-role company's domain`);
    for (const [n, re] of nameRes) if (!allowed.has(n) && ![...openNamed].some((m) => m.includes(n)) && re.test(low)) leaks.push(`${label}: a kept-back open-role company's name`);
    const ex = a.example;
    if (ex) {
      for (const k of Object.keys(ex)) if (!EX_KEYS.top.has(k)) shape.push(`${label}: example key ${k}`);
      for (const part of ["company", "open", "seat"]) for (const k of Object.keys(ex[part] ?? {})) if (!EX_KEYS[part].has(k)) shape.push(`${label}: example ${part} key ${k}`);
      if (typeof ex.company?.name !== "string" || !ex.company.name || typeof ex.seat?.rnMember !== "boolean") shape.push(`${label}: example shape`);
      if (LOCKED && ex.open) shape.push(`${label}: example has an open role while open-role companies are kept back`);
    }
    (a.rows ?? []).forEach((r, n) => {
      rowsSeen++;
      if (n >= NAMED_MAX) {
        // Past the 10th row: nothing that names the company, not even in the title.
        blurRows++;
        if (r.company !== null || r.blur !== true) shape.push(`${label}: row ${n + 1} carries its company (${JSON.stringify(r.company)}) or is not blur`);
        for (const k of ["name", "domain", "logo"]) if (k in r) shape.push(`${label}: row ${n + 1} has ${k}`);
        const t = String(r.title ?? "").toLowerCase();
        if (namesIn(t).length) leaks.push(`${label}: a company name on row ${n + 1}`);
        if (/\b[a-z0-9-]+\.(com|io|co|ai|net|org|app|dev)\b/i.test(t)) leaks.push(`${label}: a domain on row ${n + 1}`);
      } else {
        namedSlots++;
        if (r.blur !== undefined) shape.push(`${label}: row ${n + 1} is blur within the first ${NAMED_MAX}`);
      }
      for (const k of Object.keys(r)) if (!ROW_KEYS.has(k)) shape.push(`${label}: row key ${k}`);
      if (typeof r.seed !== "string" || ids.has(r.seed)) shape.push(`${label}: seed is not opaque`);
      if (r.company) {
        namedRows++;
        for (const k of Object.keys(r.company)) if (!CO_KEYS.has(k)) shape.push(`${label}: company key ${k}`);
        if (typeof r.company.name !== "string" || !r.company.name) shape.push(`${label}: a company with no name`);
        for (const d of [r.company.domain, r.company.logo]) if (d !== null && !/^[a-z0-9.-]+\.[a-z]{2,}$/i.test(String(d))) shape.push(`${label}: a domain that is not a bare domain`);
        // The logo id is "lp_" and the row's own seed: nothing new, and never a public id.
        if (r.company.logoId != null && r.company.logoId !== `lp_${r.seed}`) shape.push(`${label}: row ${n + 1} logo id is not lp_<its seed>`);
      }
      if (a.view !== (r.kind === "notyet" ? "notyet" : a.view === "hiring" ? "hiring" : "all") || (a.view === "hiring" && r.kind !== "open")) shape.push(`${label}: a ${r.kind} row in the ${a.view} tab`);
      if (r.kind === "notyet") notYetRows++;
      if (r.kind === "open") {
        openRows++;
        if (LOCKED && r.company !== null) shape.push(`${label}: open-role row company ${JSON.stringify(r.company)}`);
        if (!r.blur && !r.company) openKept++;
      }
    });
  };

  const first = await preview({ fn: "Sales" });
  check("the preview answers for Sales", first.status === 200 && first.json?.counts && Array.isArray(first.json.rows), first.text.slice(0, 200));
  const opts = first.json?.options ?? { functions: [], industries: [], countries: [] };
  for (const x of [...opts.functions, ...opts.industries, ...opts.countries]) allowed.add(x.toLowerCase());
  for (const w of ["fractional", "interim", "sales", "marketing", "head", "lead", "leader", "vp", "chief", "officer", "director", "seat", "role", "hired", "more", "other functions", "other", "functions"]) allowed.add(w);
  check("it offers every function but Other, and industries and countries", opts.functions.length >= 15 && !opts.functions.includes("Other") && opts.industries.length > 0 && opts.countries.length > 0, JSON.stringify(opts).slice(0, 200));
  inspect("Sales", first.json, first.text);

  const sales = first.json?.rows ?? [];
  const mine = sales.find((r) => r.kind === "open" && /fractional vp sales/i.test(r.title));
  check("the test role is among the Sales rows", !!mine, JSON.stringify(sales.map((r) => r.title)));
  const mk = await preview({ fn: "Marketing" });
  if (LOCKED) {
    check("open-role companies kept back: its title keeps no trace of the company or its site", !sales.some((r) => /zephyrquill/i.test(r.title)));
    check("open-role companies kept back: the row has no company", mine?.company === null, JSON.stringify(mine?.company));
    check("open-role companies kept back: a title that starts with the company's name loses it", mk.status === 200 && !/zephyrquill/i.test(mk.text), (mk.json?.rows ?? []).map((r) => r.title).join(" | "));
  } else {
    check("the newest open role names its company and domain", mine?.company?.name === co && mine.company.domain === site, JSON.stringify(mine?.company));
    const openSales = sales.filter((r) => r.kind === "open");
    const openNamedSales = openSales.filter((r) => r.company);
    check("Sales has more open roles than it names, and names at most 3 of them, the newest", openSales.length >= 6 && openNamedSales.length >= 1 && openNamedSales.length <= 3 && openSales.slice(0, openNamedSales.length).every((r) => r.company), openSales.map((r) => `${r.when} ${r.company?.name ?? "-"}`).join(" | "));
    const kept = openSales.filter((r) => !r.company && !r.blur);
    // A real open role from the seed can sit among the test's own (it depends on the day), so the titles checked are the test's.
    const ours = kept.filter((r) => /fractional head of sales/i.test(r.title));
    check("the other open roles keep their title, with no trace of the company", ours.length >= 2 && kept.every((r) => !/quillfern/i.test(r.title)), kept.map((r) => r.title).join(" | "));
    check("open-role companies shown: no posting link and no posted rate with it", !/jobs\.example\.com|\$175\/hr|\$9k\/mo/i.test(first.text + mk.text));
  }
  check("a past seat's row says only that a seat holder is on file", sales.filter((r) => r.kind === "hired").every((r) => /^(Fractional )?Sales seat$/.test(r.title) && (r.holder === undefined || typeof r.holder === "boolean")));
  const ex = first.json?.example;
  check("the example record is a real company with a seat holder on file, nobody named", ex === null || (typeof ex?.company?.name === "string" && typeof ex.seat?.function === "string" && !("holder" in ex.seat) && !("name" in ex.seat)), JSON.stringify(ex)?.slice(0, 200));

  // Every function alone, with each country, and with each industry, and each function's other two tabs.
  /** What the page's band of numbers shows as counted across every function, from each function's own answer with nothing else picked. */
  const acrossAll = new Set();
  for (const fn of opts.functions) {
    const qs = [{ fn }, { fn, view: "hiring" }, { fn, view: "notyet" }, ...opts.countries.map((country) => ({ fn, country })), ...opts.industries.map((ind) => ({ fn, ind }))];
    for (let i = 0; i < qs.length; i += 16) {
      const batch = qs.slice(i, i + 16);
      const rs = await Promise.all(batch.map((q) => preview(q)));
      rs.forEach((r, n) => {
        const q = batch[n];
        const label = `${q.fn}/${q.country ?? q.ind ?? "any"}${q.view ? `/${q.view}` : ""}`;
        if (r.status !== 200) return shape.push(`${label}: status ${r.status}`);
        if (r.json.fn !== q.fn) shape.push(`${label}: answered for ${r.json.fn}`);
        if (!q.country && !q.ind) acrossAll.add([r.json.counts?.anyHire, r.json.counts?.repeat, r.json.options?.functions?.length].join("/"));
        inspect(label, r.json, r.text);
      });
    }
  }
  check(
    "the counts the page shows across every function (any fractional hire, repeat hirers, functions) are the same whichever function is picked",
    acrossAll.size === 1 && /^\d+\/\d+\/\d+$/.test([...acrossAll][0]),
    [...acrossAll].join(" | "),
  );
  /**
   * The cap of 3 is for the whole preview, not one answer: every function with the other two tabs
   * in each country; every withheld open role asked about with its own industry and country (the
   * way someone would try to name it); and a fixed sample of function, industry, country and tab
   * together. However they are picked, no open-role company outside the one set is named.
   */
  const asked = new Set();
  const ask = async (qs) => {
    const todo = qs.filter((q) => {
      const k = `${q.fn}|${q.ind ?? ""}|${q.country ?? ""}|${q.view ?? "all"}`;
      if (asked.has(k)) return false;
      asked.add(k);
      return true;
    });
    for (let i = 0; i < todo.length; i += 16) {
      const batch = todo.slice(i, i + 16);
      const rs = await Promise.all(batch.map((q) => preview(q)));
      rs.forEach((r, n) => {
        const q = batch[n];
        const label = `${q.fn}/${q.ind ?? "any"}/${q.country ?? "any"}/${q.view ?? "all"}`;
        if (r.status !== 200) return shape.push(`${label}: status ${r.status}`);
        inspect(label, r.json, r.text);
      });
    }
    return todo.length;
  };
  let combos = 0;
  if (!LOCKED) {
    const withheld = [];
    const fnQs = [];
    for (const fn of opts.functions)
      for (const view of ["hiring", "notyet"])
        for (const country of opts.countries) fnQs.push({ fn, country, view });
    combos += await ask(fnQs);
    // Each open role kept back so far, asked with its own industry and country, on every tab.
    for (const fn of opts.functions) {
      const r = await preview({ fn, view: "hiring" });
      for (const row of r.json?.rows ?? []) if (row.kind === "open" && !row.company) withheld.push({ fn, ind: row.industry, country: row.country });
    }
    const own = [];
    for (const w of withheld) {
      const ind = opts.industries.find((x) => x === w.ind) ?? null;
      const country = opts.countries.find((x) => x === w.country) ?? null;
      for (const view of ["all", "hiring", "notyet"]) {
        if (ind) own.push({ fn: w.fn, ind, view });
        if (ind && country) own.push({ fn: w.fn, ind, country, view });
        if (country) own.push({ fn: w.fn, country, view });
      }
    }
    combos += await ask(own);
    // A fixed sample of everything together (the same each run).
    // mulberry32, seeded: the same sample on every run.
    let s = 7;
    const rnd = (n) => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = Math.imul(s ^ (s >>> 15), s | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    const sample = [];
    for (let k = 0; k < 400; k++) {
      const fn = opts.functions[rnd(opts.functions.length)];
      const ind = rnd(4) ? opts.industries[rnd(opts.industries.length)] : undefined;
      const country = rnd(3) ? opts.countries[rnd(opts.countries.length)] : undefined;
      sample.push({ fn, ind, country, view: ["all", "hiring", "notyet"][rnd(3)] });
    }
    combos += await ask(sample);
  }
  check(
    LOCKED
      ? "no open-role company is named in any answer"
      : `across every function, industry, country and tab (${answers} answers, ${combos} of them combined filters), at most ${OPEN_NAMED_MAX} open-role companies are named in all`,
    openNamedUnion.size <= OPEN_NAMED_MAX && (LOCKED || (openNamedUnion.size > 0 && combos > 500)),
    [...openNamedUnion].length,
  );
  {
    // A withheld row's seed is made for its answer: the same seed in two answers would let them be matched up.
    const seen = new Map();
    let shared = 0;
    for (const [k, seeds] of withheldSeeds) for (const sd of seeds) seen.has(sd) && seen.get(sd) !== k ? shared++ : seen.set(sd, k);
    check("a row whose company is withheld carries a seed of its own answer, never one another answer shares", shared === 0 && seen.size > 0, shared);
  }
  check(`no person, email, phone, LinkedIn, posting, rate or id in any of ${answers} answers (${rowsSeen} rows)${LOCKED ? ", and no open-role company" : ""}`, leaks.length === 0, `${leaks.length} found, first ${leaks.slice(0, 3).join("; ")}`);
  check("every answer has only the fields the preview promises", shape.length === 0, shape.slice(0, 5).join("; "));
  check("the answers covered rows of both kinds", rowsSeen > 0 && openRows > 0 && rowsSeen > openRows, `${rowsSeen} rows, ${openRows} open`);
  check("rows in the first 10 name their company, past seats and a few open roles", namedRows > 0 && namedRows <= namedSlots, `${namedRows} of ${namedSlots}`);
  check(
    LOCKED ? "no answer names a company with an open role" : `no answer names more than ${OPEN_NAMED_MAX} companies with an open role, and some name one`,
    LOCKED ? openNamedMost === 0 : openNamedMost > 0 && openNamedMost <= OPEN_NAMED_MAX,
    openNamedMost,
  );
  check("open roles past the named ones come with no company in the first 10 rows", openKept > 0, openKept);
  check("answers go past 10 rows, and those rows are blurred with no company", blurRows > 0, `${blurRows} blurred rows`);
  check("the No fractional yet tab has rows", notYetRows > 0, notYetRows);

  // The three tabs for Sales: the total holds together with the counts, and a tab not on the list is refused.
  const [tAll, tHiring, tNot] = await Promise.all(["all", "hiring", "notyet"].map((view) => preview({ fn: "Sales", view })));
  check(
    "the tabs answer with their own rows, and totals no bigger than the counts (only companies with industry and revenue are listed)",
    tAll.json?.view === "all" && tHiring.json?.view === "hiring" && tNot.json?.view === "notyet" && tHiring.json.total <= tHiring.json.counts.hiring && tNot.json.total <= tNot.json.counts.notYet && tAll.json.total >= tHiring.json.total && tAll.json.total <= tAll.json.counts.all,
    [tAll, tHiring, tNot].map((t) => `${t.json?.view} ${t.json?.total}`).join(", "),
  );
  check("a long tab sends 10 named rows, then blurred ones", (tAll.json?.total ?? 0) <= NAMED_MAX || ((tAll.json?.rows ?? []).filter((r) => r.company || !r.blur).length === NAMED_MAX && tAll.json.rows.length === Math.min(ROWS_MAX, tAll.json.total)), `${tAll.json?.total} total, ${tAll.json?.rows?.length} rows`);
  check("every listed row has its industry and revenue on file", [tAll, tHiring, tNot].every((x) => (x.json?.rows ?? []).every((r) => r.industry && r.revenue)));
  const badView = await preview({ fn: "Sales", view: "everything" });
  check("a tab not on the list is refused", badView.status === 400 && !badView.json?.rows, badView.status);

  // The same open-role companies between requests, and after the table changes (any change rebuilds what the preview reads).
  if (!LOCKED) {
    const namedNow = async () => {
      const rs = await Promise.all([{ fn: "Sales" }, { fn: "Sales", view: "hiring" }, { fn: "Marketing", view: "hiring" }].map((q) => preview(q)));
      const set = new Set();
      for (const r of rs) for (const n of [...(r.json?.rows ?? []).map((x) => x.company?.name), r.json?.example?.company?.name]) if (n && names.has(String(n).trim().toLowerCase())) set.add(String(n).trim().toLowerCase());
      return [...set].sort().join(" | ");
    };
    const before = await namedNow();
    const q1 = companies.find((x) => /quillfern/i.test(x.name ?? ""));
    const fill = q1 ? await call("POST", "/api/table", { token, body: { action: { type: "fill", entity: "company", id: q1.id, field: "hq", value: "Boise, ID" } } }) : null;
    const again = await namedNow();
    check("the same open-role companies are named between requests and after the table changes", before.length > 0 && before === again && fill?.status === 200, { same: before === again, fill: fill?.status });
  }

  // A picked country keeps the companies whose country isn't on file, and says how many are in it.
  {
    const us = opts.countries.includes("United States") ? "United States" : opts.countries[0];
    const [anyC, inC, inCHiring] = await Promise.all([preview({ fn: "Sales" }), preview({ fn: "Sales", country: us }), preview({ fn: "Sales", country: us, view: "hiring" })]);
    const a0 = anyC.json?.counts ?? {};
    const a1 = inC.json?.counts ?? {};
    const ic = inC.json?.inCountry ?? {};
    check(
      `a country keeps the companies with no country on file: ${us} answers ${a1.hired} hired, ${ic.hired} of them in ${us}`,
      a1.hired > ic.hired && a1.hired <= a0.hired && a1.all <= a0.all && a1.all > ic.all && ic.hired > 0 && anyC.json?.inCountry === null,
      { any: a0.hired, kept: a1.hired, inCountry: ic.hired },
    );
    check(
      "its rows include that country's companies (first in each kind, checked above), and the hiring tab counts roles with no country on file too",
      (inC.json?.rows ?? []).some((r) => r.country === us) && (inCHiring.json?.counts?.hiring ?? 0) >= (inCHiring.json?.inCountry?.hiring ?? 0) && inCHiring.json?.inCountry !== null,
      (inC.json?.rows ?? []).slice(0, 3).map((r) => r.country),
    );
  }

  // Counts hang together.
  const c = first.json?.counts ?? {};
  check("counts are whole numbers and hold together", ["hired", "notYet", "hiring", "holders", "all", "repeat", "anyHire"].every((k) => Number.isInteger(c[k]) && c[k] >= 0) && c.hiring <= c.all && c.hired <= c.anyHire && c.notYet <= c.anyHire, JSON.stringify(c));

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
