/**
 * Checks of the Stage 7a merge's wiring:
 *   - Someone you know changed jobs on Home and Warm paths (lib/notify/knownView.ts knownFor,
 *     GET /api/table?known=1, app/post/network/KnownMoves.tsx): from the member's own LinkedIn
 *     file and contacts CSV only, never Google; a Californian is never named; at a company the
 *     member hasn't opened nobody is named and the company is described by its industry and size;
 *     only the last 30 days; the watch's alert reads the same sources;
 *   - the connector's alerts tool sets an alert's triggers and how often through the app's own
 *     ops and plan gate (lib/hunt.ts savedViewAction, alertPlanProblem): on Free, as it happens
 *     and New decision maker are refused in plain words and nothing changes.
 * In process, on a made-up seed in a temporary data dir, with fetch replaced: nothing leaves the machine.
 *
 *   npx tsx scripts/test-known.mts      exits 1 on any failure
 */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-known-"));
const MIN = 60_000;
const DAY = 86_400_000;
const t0 = Date.now();
const iso = (ms: number) => new Date(ms).toISOString();
const seed = {
  builtAt: iso(t0 - 60 * DAY),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@avery.example", title: "Fractional VP Sales", token: "tok-jordan-known" },
    { id: "mem_free", name: "Frankie Free", email: "frankie@free.example", title: "Fractional CFO", token: "tok-free-known" },
    { id: "mem_gee", name: "Gale Google", email: "gale@google-only.example", title: "Fractional CMO", token: "tok-gee-known" },
  ],
  companies: [
    { id: "c_north", fields: { name: "Northwind Clinics", website: "northwind.example", industry: "Hospitals and Health Care", employees: "51-200", hq: "Denver, CO" } },
    { id: "c_cedar", fields: { name: "Cedar and Pine", website: "cedarpine.example", industry: "Software Development", employees: "11-50", hq: "Austin, TX" } },
    { id: "c_halcyon", fields: { name: "Halcyon Freight", website: "halcyon.example", industry: "Truck Transportation", employees: "201-500", hq: "Dallas, TX" } },
    { id: "c_lark", fields: { name: "Larkspur Learning", website: "larkspur.example", industry: "E-Learning Providers", employees: "51-200", hq: "Boston, MA" } },
  ],
  engagements: [],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const T1 = iso(t0 - 10 * MIN);
const OLD = iso(t0 - 40 * DAY);
const seen = iso(t0 - 2 * DAY);
const fnRec = (name: string, title: string, more: Record<string, unknown> = {}) => ({ level: "VP", kind: "full-time", how: "team page", url: "https://x.example/team", seenAt: T1, name, title, ...more });
// Google's network shape, as lib/google keeps it: a person the member knows only through Google.
const googleOnly = { companies: { c_halcyon: { people: [{ name: "Robin Hale", title: "COO" }] } } };
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    // Jordan opened Northwind and Larkspur. Cedar and Pine and Halcyon stay locked for them.
    unlocks: { "c_north.identity": ["mem_jordan"], "c_lark.identity": ["mem_jordan"] },
    seen: { mem_jordan: seen, mem_free: seen, mem_gee: seen },
    profiles: { mem_jordan: { function: "Sales", onboarded: true }, mem_free: { function: "Finance", onboarded: true }, mem_gee: { function: "Marketing", onboarded: true } },
    // Billing is live in this run: Jordan is on Pro, Frankie's trial ended (Free).
    billing: {
      members: { mem_jordan: { proUntil: iso(t0 + 30 * DAY) }, mem_free: { trialStartedAt: iso(t0 - 40 * DAY), trialEndsAt: iso(t0 - 19 * DAY) }, mem_gee: { proUntil: iso(t0 + 30 * DAY) } },
      events: [],
      payments: [],
      ended: [],
    },
    connector: { clients: [], grants: [], alerts: {} },
    leaders: {
      c_cedar: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Sales: fnRec("Dana Reyes", "VP Sales") } },
      c_north: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Marketing: fnRec("Sam Ortiz", "VP Marketing"), Finance: fnRec("Casey Vale", "VP Finance", { california: true }) } },
      c_halcyon: { status: "found", checkedAt: T1, ok: true, team: true, functions: { Operations: fnRec("Robin Hale", "VP Operations") } },
      c_lark: { status: "found", checkedAt: OLD, ok: true, team: true, functions: { Sales: fnRec("Jo Park", "VP Sales") } },
    },
    leaderArrivals: [
      { companyId: "c_cedar", fn: "Sales", kind: "full-time", level: "VP", at: T1 },
      { companyId: "c_north", fn: "Marketing", kind: "full-time", level: "VP", at: T1 },
      { companyId: "c_north", fn: "Finance", kind: "full-time", level: "VP", at: T1 },
      { companyId: "c_halcyon", fn: "Operations", kind: "full-time", level: "VP", at: T1 },
      // Older than Home's 30 days.
      { companyId: "c_lark", fn: "Sales", kind: "full-time", level: "VP", at: OLD },
    ],
    // Jordan's own files: Dana and Casey were at Halcyon (LinkedIn file), Sam and Jo at other companies (contacts CSV).
    paths: {
      mem_jordan: {
        linkedin: { at: seen, skipped: 0, rows: [{ f: "Dana", l: "Reyes", c: "Halcyon Freight" }, { f: "Casey", l: "Vale", c: "Halcyon Freight" }] },
        csv: { at: seen, skipped: 0, rows: [{ n: "Sam Ortiz", c: "Larkspur Learning" }, { n: "Jo Park", c: "Halcyon Freight" }] },
      },
    },
    // Robin Hale is in Jordan's Google network at Larkspur, and Gale knows people only through Google: neither ever feeds this.
    network: {
      mem_jordan: { con: { companies: { c_lark: { people: [{ name: "Robin Hale", title: "COO" }] } } } },
      mem_gee: { con: googleOnly, cal: googleOnly },
    },
    alertWatch: { at: iso(t0 - 20 * MIN), members: {} },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_FREE_COMPANY: "off",
  RN_BILLING: "1",
  STRIPE_SECRET_KEY: "sk_test_madeup_not_a_key",
  STRIPE_WEBHOOK_SECRET: "whsec_madeup_test_secret",
  STRIPE_PRICE_MONTH: "price_month_test",
  STRIPE_PRICE_YEAR: "price_year_test",
  STRIPE_API_URL: "http://stripe.test",
});
for (const k of ["RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS", "RESEND_API_KEY", "RN_EMAIL_FROM"]) delete process.env[k];
globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 700)}`}`);
};
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main() {
  const KV = await import("../lib/notify/knownView");
  const H = await import("../lib/hunt");
  const t = await import("../lib/table");
  const ev = await import("../lib/notify/events");
  const n = await import("../lib/notify");
  const tools = await import("../lib/mcp/tools");
  const pub = t.tableInternals.pubId;

  /* ---------- Someone you know on Home and Warm paths ---------- */
  console.log("\nSomeone you know changed jobs, on Home and Warm paths");
  const v = await KV.knownFor("tok-jordan-known", t0);
  const lines = (v?.list ?? []).map((x) => x.line);
  const all = JSON.stringify(v);
  check("knownFor answers for a member, null for nobody", !!v && (await KV.knownFor("tok-nobody", t0)) === null);
  check("the member's files are sources", v?.sources === true);
  check("a person from the contacts CSV, now a new leader at a company they opened: named", lines.includes("Sam Ortiz, someone you know, is a new Marketing leader at Northwind Clinics"), lines);
  check("a Californian by their own location is never named", lines.includes("Someone you know is a new Finance leader at Northwind Clinics") && !/Casey|Vale/.test(all), lines);
  const locked = v?.list.find((x) => x.company === pub("c_cedar"));
  check("at a locked company: nobody named, the company described by its industry and size", !!locked && !locked.named && /^Someone you know started at a locked SaaS company with 11.50 employees$/.test(locked.line), locked);
  check("  never the company's name or the person's", !/Cedar|cedarpine|Dana|Reyes/.test(all));
  check("Google never feeds it: a person known only through Google is never matched", !/Robin|Hale/.test(all) && !v?.list.some((x) => x.company === pub("c_halcyon")), lines);
  check("only the last 30 days", !/Jo Park/.test(all) && !v?.list.some((x) => x.company === pub("c_lark")));
  check("each move opens its company by public id, newest first, at most 5", (v?.list ?? []).every((x) => x.company === pub(["c_north", "c_cedar", "c_halcyon", "c_lark"].find((c) => pub(c) === x.company) ?? "") && !["c_north", "c_cedar"].includes(x.company)) && (v?.list ?? []).every((x, k, a) => !k || a[k - 1].at >= x.at) && (v?.list.length ?? 0) <= KV.KNOWN_MAX, v?.list);
  const gee = await KV.knownFor("tok-gee-known", t0);
  check("a member with only Google has no source here, and no move", gee?.sources === false && gee.list.length === 0, gee);
  const s0 = await t.loadState();
  check("hasKnownSources: the LinkedIn file or the CSV only", KV.hasKnownSources(s0, "mem_jordan") && !KV.hasKnownSources(s0, "mem_gee"));
  check("knownPeopleOf reads only the files", KV.knownPeopleOf(s0, { id: "mem_jordan" }).every((p) => p.src === "linkedin" || p.src === "csv") && !KV.knownPeopleOf(s0, { id: "mem_jordan" }).some((p) => p.name === "Robin Hale") && KV.knownPeopleOf(s0, { id: "mem_gee" }).length === 0);

  // The watch's alert reads the same sources.
  await ev.afterWatch(t0);
  for (let i = 0; i < 4; i++) {
    await new Promise((r) => setTimeout(r, 15));
    await n.settled();
  }
  const s1 = await t.loadState();
  const jBox = (s1.inbox?.mem_jordan ?? []).filter((x) => x.alert === "known");
  const gBox = (s1.inbox?.mem_gee ?? []).filter((x) => x.alert === "known");
  check("the watch's alert: the same lines in the bell", jBox.some((x) => x.line === "Sam Ortiz, someone you know, is a new Marketing leader at Northwind Clinics") && jBox.some((x) => /^Someone you know started at a locked /.test(x.line)), jBox.map((x) => x.line));
  check("  and never from Google", !JSON.stringify(s1.inbox ?? {}).match(/Robin|Hale/) && gBox.length === 0);

  // The pages: Home's Today and Warm paths draw it, from GET /api/table?known=1.
  const home = src("app/post/Home2.tsx");
  const warm = src("app/post/network/WarmPaths.tsx");
  const comp = src("app/post/network/KnownMoves.tsx");
  const route = src("app/api/table/route.ts");
  check("Home's Today shows it", /<KnownMoves where="home"/.test(home));
  check("Warm paths shows it, only with a LinkedIn file or a CSV, never in its Example", /<KnownMoves where="warm" enabled=\{v\.own\.linkedin \|\| v\.own\.csv\}/.test(warm) && /!first && !ex && <KnownMoves/.test(warm));
  check("the component reads GET /api/table?known=1, and the route answers it", /\/api\/table\?known=1/.test(comp) && /searchParams\.get\("known"\)/.test(route) && /knownFor\(token\)/.test(route));
  check("the component draws the server's words only: no name of its own, no export", !/download|Blob|\.csv|text\/csv/i.test(comp));
  const kv = src("lib/notify/knownView.ts").replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, "");
  check("the server half never reads Google's network", !/\.network\b|google|gm\b|\bcal\b|\bcon\b/i.test(kv));

  /* ---------- the connector sets an alert's triggers and how often ---------- */
  console.log("\nThe connector's alerts: triggers and how often, with the app's plan gate");
  const jordan = (await t.memberById("mem_jordan"))!;
  const frankie = (await t.memberById("mem_free"))!;
  const ctxJ = { member: jordan, origin: "https://post.example.com" };
  const ctxF = { member: frankie, origin: "https://post.example.com" };
  const refusal = async (f: () => Promise<unknown>) => {
    try {
      await f();
      return "";
    } catch (e) {
      return e instanceof tools.ToolProblem ? e.message : `other: ${(e as Error).message}`;
    }
  };
  const j1 = (await tools.alerts(ctxJ, { action: "save", function: "Sales", industry: ["Software Development"], alert: { on: true, triggers: ["seat", "leader"], every: "instant", bell: true } })) as { saved_search: { id: string; alert: Record<string, unknown> } };
  check("Pro: a list saved with its triggers and as it happens", JSON.stringify(j1.saved_search.alert) === JSON.stringify({ on: true, triggers: ["seat", "leader"], every: "instant", email: true, slack: true, bell: true }), j1.saved_search);
  const id = j1.saved_search.id;
  const j2 = (await tools.alerts(ctxJ, { action: "update", id, alert: { every: "daily", triggers: ["seat", "funding"] } })) as { message: string; saved_search: { alert: Record<string, unknown> } };
  check("update changes how often and the triggers, the rest stays as it was", JSON.stringify(j2.saved_search.alert) === JSON.stringify({ on: true, triggers: ["seat", "funding"], every: "daily", email: true, slack: true, bell: true }) && /every morning/.test(j2.message), j2);
  const j3 = (await tools.alerts(ctxJ, { action: "update", id, alert: { slack: false } })) as { saved_search: { alert: Record<string, unknown> } };
  check("an alert given in part keeps its triggers and how often (no more forced weekly)", (j3.saved_search.alert as { every: string; triggers: string[]; slack: boolean }).every === "daily" && (j3.saved_search.alert as { triggers: string[] }).triggers.join() === "seat,funding" && (j3.saved_search.alert as { slack: boolean }).slack === false);
  const j4 = (await tools.alerts(ctxJ, { action: "update", id, alert: { triggers: ["nonsense"] } })) as { saved_search: { alert: { triggers: string[] } } };
  check("an unknown trigger changes nothing", j4.saved_search.alert.triggers.join() === "seat,funding");
  const sJ = await t.loadState();
  const stored = sJ.connector?.alerts?.mem_jordan?.find((x) => x.id === id);
  check("the app's saved list holds what the connector set (one store)", stored?.alert?.every === "daily" && stored.alert.triggers?.join() === "seat,funding" && stored.email === true);

  const f0 = await refusal(() => tools.alerts(ctxF, { action: "save", function: "Finance", alert: { on: true, every: "instant" } }));
  check("Free: a list saved as it happens is refused in plain words", /^As it happens is part of Pro\. On Free an alert comes every morning or weekly\. See Pro: https:\/\/post\.example\.com\/\?p=billing&plans=1/.test(f0), f0);
  check("  and nothing was saved", !((await t.loadState()).connector?.alerts?.mem_free ?? []).length);
  const f0b = await refusal(() => tools.alerts(ctxF, { action: "save", function: "Finance", alert: { on: true, triggers: ["leader"], every: "daily" } }));
  check("Free: a list saved with New decision maker is refused", /^New decision maker is part of Pro/.test(f0b), f0b);
  const f1 = (await tools.alerts(ctxF, { action: "save", function: "Finance", alert: { on: true, triggers: ["seat"], every: "daily" } })) as { saved_search: { id: string; alert: { every: string } } };
  const fid = f1.saved_search.id;
  check("Free: every morning with a seat trigger is saved", f1.saved_search.alert.every === "daily");
  const before = JSON.stringify((await t.loadState()).connector?.alerts?.mem_free);
  const f2 = await refusal(() => tools.alerts(ctxF, { action: "update", id: fid, alert: { every: "instant" } }));
  const f3 = await refusal(() => tools.alerts(ctxF, { action: "update", id: fid, alert: { triggers: ["seat", "leader"] } }));
  const f4 = await refusal(() => tools.alerts(ctxF, { action: "update", id: fid, kind: "seats", alert: { every: "instant" } }));
  check("Free: update to as it happens is refused", /^As it happens is part of Pro/.test(f2), f2);
  check("Free: adding New decision maker is refused", /^New decision maker is part of Pro/.test(f3), f3);
  check("  a refused alert writes nothing, not even the kind given with it", JSON.stringify((await t.loadState()).connector?.alerts?.mem_free) === before && !!f4);
  const f5 = (await tools.alerts(ctxF, { action: "update", id: fid, alert: { triggers: ["seat", "funding", "fact"], every: "weekly" } })) as { saved_search: { alert: { every: string; triggers: string[] } } };
  check("Free: the triggers Free has, weekly, are saved", f5.saved_search.alert.every === "weekly" && f5.saved_search.alert.triggers.join() === "seat,fact,funding", f5.saved_search);
  const none = await refusal(() => tools.alerts(ctxF, { action: "update", id: "al_missing00", alert: { every: "daily" } }));
  check("an id that isn't theirs: no saved search", /No saved search with that id/.test(none), none);

  // The same gate as the app: the Alerts page's ops (lib/hunt.ts).
  check("alertPlanProblem: Pro passes, Free is told, what an alert had already stays", H.alertPlanProblem({ every: "instant", triggers: ["leader"] }, null, false) === null && H.alertPlanProblem({ every: "instant", triggers: ["role"] }, null, true) === H.ALERT_INSTANT_PRO && H.alertPlanProblem({ every: "daily", triggers: ["leader"] }, null, true) === H.ALERT_LEADER_PRO && H.alertPlanProblem({ every: "instant", triggers: ["leader"] }, { every: "instant", triggers: ["leader"] }, true) === null);
  let hunt = "";
  try {
    H.savedViewAction([], { op: "save", name: "x", place: "v=all", criteria: {}, list: { alert: { on: true, triggers: ["leader"], every: "daily" } } }, () => "al_aaaaaaaa", iso(t0), { free: true });
  } catch (e) {
    hunt = (e as Error).message;
  }
  check("the app's save op: Free can't save a list with New decision maker", hunt === H.ALERT_LEADER_PRO, hunt);
  const toolsSrc = src("lib/mcp/tools.ts");
  const serverSrc = src("lib/mcp/server.ts");
  check("the connector routes alert changes through the app's own op (savedViewAction) with the plan", /savedViewAction\(list, \{ op: "alert"/.test(toolsSrc) && /onFreePlan\(s, ctx\.member\.id\)/.test(toolsSrc));
  check("the tool's schema offers triggers, how often and the bell", /triggers: z\s*\.array\(z\.enum\(ALERT_TRIGGERS\)\)/.test(serverSrc) && /every: z\.enum\(ALERT_EVERY\)/.test(serverSrc) && /bell: z\.boolean\(\)/.test(serverSrc));

  /* ---------- Settings points to Agent access in the new look ---------- */
  console.log("\nSettings and Agent access");
  const integ = src("app/post/Integrations.tsx");
  const pages = src("app/post/shell/pages.tsx");
  check("Settings in the new look links Agent access, the old look keeps Use it in Claude", /onAgent=\{c\.ui2 \? \(\) => c\.openPage\("agent"\) : undefined\}/.test(pages) && /Open Agent access/.test(integ) && /Use it in Claude/.test(integ));
  check("  and keeps the network and voice prompts in both", (integ.match(/<VoicePrompt \/>/g) ?? []).length === 2 && (integ.match(/<ClaudeNetworkPrompt \/>/g) ?? []).length === 2);
  check("Alerts and Agent access are both pages of the new look", /alerts: \{ title: "Alerts and workflows", component: AlertsP/.test(pages) && /agent: \{ title: "Agent access", component: AgentP/.test(pages) && /loadAlerts, loadAgent\]/.test(pages));
}

main()
  .catch((e) => {
    failures++;
    console.error(e);
  })
  .finally(() => {
    rmSync(dir, { recursive: true, force: true });
    console.log(`\n${passes} passed, ${failures} failed`);
    process.exit(failures ? 1 : 0);
  });
