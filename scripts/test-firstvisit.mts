/**
 * A member's first visit in a browser, against a running server: the page itself says the browser
 * holds a sign-in cookie (middleware.ts sets rn_in=1), so app/Root.tsx asks for Home's small first
 * screen (GET ?first=1) before the whole table, as it does for a member it remembers.
 *
 *   BASE=http://localhost:3000 npx tsx scripts/test-firstvisit.mts      exits 1 on any failure
 *
 * Start the server on a fresh RN_DATA_DIR with RN_ADMIN_EMAILS=admin-qa@example.com,
 * RN_CRON_SECRET=qa-cron and email off (scripts/test-all.sh does). It joins two members and an
 * admin. Covered:
 *   - the page: a sign-in cookie gets rn_in=1 (readable by the page, no other value, the page's
 *     HTML byte for byte the same as without it); signed out, no cookie at all and the same page
 *     as before; rn_in without a sign-in cookie is taken off; nothing else answers with it;
 *   - the first visit's payload: Home's first screen for a member and for an admin is Today's
 *     answer, under its size cap and a small part of the whole table, and each company it carries
 *     is the whole table's own record of it, locks and all (nothing the table keeps locked);
 *   - a sign-in cookie that is nobody's: ?first=1 answers the signed-out view itself, the same as
 *     GET /api/table, so the page needs no second request; signed out the same;
 *   - an admin's and a member's whole table: the same however often asked, before and after the
 *     first screen.
 */
import { unpackCompany, unpackView } from "../lib/viewWire";
import type { CompanyRec, View } from "../lib/tableTypes";

const BASE = (process.env.BASE || "http://localhost:3000").replace(/\/$/, "");
const CRON_SECRET = process.env.CRON_SECRET ?? "qa-cron";
const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "admin-qa@example.com";
const RUN = Date.now().toString(36);
const IP = `10.77.${(Date.now() >> 8) & 255}`;
/** Today's cap (lib/today.ts TODAY_MAX). */
const TODAY_MAX = 20_000;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 400)}`}`);
};
const same = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
const sortKeys = (x: unknown): unknown =>
  Array.isArray(x) ? x.map(sortKeys) : x && typeof x === "object" ? Object.fromEntries(Object.keys(x).sort().map((k) => [k, sortKeys((x as Record<string, unknown>)[k])])) : x;

const get = (p: string, cookie?: string, n = 1) => fetch(BASE + p, { headers: { ...(cookie ? { cookie } : {}), "x-forwarded-for": `${IP}.${n}`, "accept-encoding": "gzip" }, redirect: "manual" });
const setCookies = (r: Response) => r.headers.getSetCookie?.() ?? [];

async function join(name: string, n: number, email?: string, headers: Record<string, string> = {}): Promise<string> {
  const r = await fetch(`${BASE}/api/table`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": `${IP}.${n}`, ...headers },
    body: JSON.stringify({ join: { name, email: email ?? `qa+${RUN}-fv${n}@example.com` } }),
  });
  const token = setCookies(r).map((c) => c.match(/^rn_table=([^;]+)/)?.[1]).find(Boolean);
  if (!token) throw new Error(`join ${name}: ${r.status} ${(await r.text()).slice(0, 200)}`);
  // As onboarding leaves them (the profile answer marks it done).
  await fetch(`${BASE}/api/table`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: `rn_table=${token}`, "x-forwarded-for": `${IP}.${n}` },
    body: JSON.stringify({ action: { type: "profile", function: "Sales", goal: "friendly" } }),
  });
  return token;
}

async function main() {
  /* ---------- the page ---------- */
  const out = await get("/");
  const outHtml = await out.text();
  check("signed out: the page is there", out.status === 200 && outHtml.includes("<html"), out.status);
  check("signed out: no cookie is set (the page as before)", setCookies(out).length === 0, setCookies(out));
  const inn = await get("/", "rn_table=whoever-this-is");
  const innHtml = await inn.text();
  const said = setCookies(inn).filter((c) => c.startsWith("rn_in="));
  check("a sign-in cookie: the page says so with rn_in=1", said.length === 1 && /^rn_in=1;/.test(said[0]) && setCookies(inn).length === 1, setCookies(inn));
  check("rn_in is readable by the page, for the whole site", !/httponly/i.test(said[0] ?? "") && /path=\//i.test(said[0] ?? ""), said[0]);
  check("and the page itself is the same, byte for byte", innHtml === outHtml, { a: innHtml.length, b: outHtml.length });
  const onAddress = await get("/?c=c_anything&v=hiring", "rn_table=whoever-this-is");
  check("on any of the app's addresses", setCookies(onAddress).some((c) => /^rn_in=1;/.test(c)));
  const again = await get("/", "rn_table=whoever-this-is; rn_in=1");
  check("not set again while it is there", setCookies(again).length === 0, setCookies(again));
  const left = await get("/", "rn_in=1");
  check("rn_in without a sign-in cookie is taken off", setCookies(left).some((c) => /^rn_in=;/.test(c) && /expires=thu, 01 jan 1970/i.test(c)), setCookies(left));
  const api = await get("/api/health", "rn_table=whoever-this-is");
  check("nothing but the page answers with it", !setCookies(api).some((c) => c.startsWith("rn_in=")), setCookies(api));

  /* ---------- signed out and a cookie that is nobody's ---------- */
  const anon = await (await get("/api/table?compact=1", undefined, 9)).json();
  check("signed out, the table is the counts only, as before", anon.me === null && Array.isArray(anon.companies) && anon.companies.length === 0 && !!anon.stats, Object.keys(anon));
  {
    const f = await get("/api/table?first=1&place=", "rn_table=nobody-has-this-token", 9);
    const j = await f.json();
    check("a sign-in cookie that is nobody's: ?first=1 answers the signed-out view itself, the same as GET /api/table", f.status === 200 && same({ ...j, version: undefined }, { ...anon, version: undefined }), Object.keys(j));
  }
  // SE-02: with no sign-in cookie at all (the page never asks then) ?first=1 is 401 as documented, and ?today=1 is 401 signed out either way.
  for (const [label, cookie] of [
    ["no sign-in cookie", undefined],
    ["a sign-in cookie that is nobody's", "rn_table=nobody-has-this-token"],
  ] as const) {
    const t = await get("/api/table?today=1", cookie, 9);
    check(`${label}: ?today=1 answers 401`, t.status === 401 && /signed out/.test(((await t.json()) as { error?: string }).error ?? ""));
  }
  check("no sign-in cookie: ?first=1 answers 401", (await get("/api/table?first=1&place=", undefined, 9)).status === 401);

  /* ---------- a member's and an admin's first visit ---------- */
  const sal = await join("Sal Firstvisit", 1);
  const mo = await join("Mo Firstvisit", 2);
  const ada = await join("Ada Firstvisit", 3, ADMIN_EMAIL, { "x-cron-secret": CRON_SECRET });
  for (const [who, tok, n] of [
    ["a member", sal, 1],
    ["another member", mo, 2],
    ["an admin", ada, 3],
  ] as const) {
    const cookie = `rn_table=${tok}`;
    const fullRes = await get("/api/table?compact=1", cookie, n);
    const fullText = await fullRes.text();
    const full = unpackView(JSON.parse(fullText) as View);
    check(`${who}: the whole table`, !!full.me && full.companies.length > 0, full.companies.length);
    const firstRes = await get("/api/table?first=1&place=", cookie, n);
    const firstText = await firstRes.text();
    const first = JSON.parse(firstText) as { today?: { me: { id: string; admin?: boolean }; companies: CompanyRec[] }; view?: unknown };
    check(`${who}: Home's first screen is Today's answer, no table`, !!first.today && !first.view && first.today.me.id === full.me!.id, Object.keys(first));
    check(`${who}: under Today's cap, and a small part of the whole table`, firstText.length <= TODAY_MAX && firstText.length * 20 < fullText.length, { first: firstText.length, full: fullText.length });
    const byId = new Map(full.companies.map((c) => [c.id, c]));
    const recs = (first.today?.companies ?? []).map(unpackCompany);
    const bad = recs.filter((c) => !same(c, byId.get(c.id)));
    check(`${who}: each company on the first screen is the whole table's own record, locks and all`, !bad.length, bad.map((c) => c.id));
    const locked = full.companies.filter((c) => c.hidden).length;
    check(`${who}: nothing named on it that the whole table keeps locked`, recs.every((c) => !c.hidden || c.name === "Locked company") && (who !== "an admin" || locked === 0), { locked });
    // The whole table again, after the first screen: the same (an action-free visit changes nothing in it).
    // An admin's pilot metrics (`admin`) say when background jobs last ran, which they may do meanwhile.
    const again = unpackView((await (await get("/api/table?compact=1", cookie, n)).json()) as View);
    const { version: _a, admin: _c, ...x } = again as View & { admin?: unknown };
    const { version: _b, admin: _d, ...y } = full as View & { admin?: unknown };
    void _a, _b, _c, _d;
    check(`${who}: the whole table after the first screen is the one before it`, same(x, y));
  }
  // What an admin sees (every name) and a member doesn't: still so.
  const adaFull = unpackView((await (await get("/api/table?compact=1", `rn_table=${ada}`, 3)).json()) as View);
  const salFull = unpackView((await (await get("/api/table?compact=1", `rn_table=${sal}`, 1)).json()) as View);
  check("an admin's table names every company, a new member's keeps companies locked", adaFull.companies.every((c) => !c.hidden) && salFull.companies.some((c) => c.hidden), {
    adminHidden: adaFull.companies.filter((c) => c.hidden).length,
  });
}

try {
  await main();
} catch (e) {
  failures++;
  console.log("FAIL threw:", e);
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
