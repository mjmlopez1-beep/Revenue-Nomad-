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
 *
 * Before the server, with no server (PURE=1 runs only these): the new look's first visits
 * (BUILD_PLAN F6), pure. The six steps, each derived from what the member has (step 3 left out
 * while Your network is off, step 6 only with Evidence Bank built and Close); a step once done
 * stays done; the card's "N of M done" and minutes; each page's first visit, its strip and its
 * dismissal; example rows never counted, never mistaken for a record; and the flag's settings
 * (lib/ui2.ts): off sends nothing, optin keeps the member's choice, strips kept by page key.
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

/* ---------- the new look's first visits, pure ---------- */
async function pure() {
  const gs = await import("../app/post/getStarted");
  const fv = await import("../app/post/firstVisit");
  const ex = await import("../app/post/examples");
  const u2 = await import("../lib/ui2");
  type SixMe = Parameters<typeof gs.sixSteps>[0]["me"];
  {
    type P = NonNullable<Parameters<typeof fv.planLine>[0]>;
    const plan = (x: Partial<P>) => ({ name: "pro", tier: "close", trialDaysLeft: null, ...x }) as P;
    check("Home's plan line: a paid Close member reads Close, never the trial", fv.planLine(plan({})) === "You're on Close. " && !/trial/i.test(fv.planLine(plan({}))));
    check("…paid Pro reads Pro; the trial its days left; billing off nothing", fv.planLine(plan({ tier: "pro" })) === "You're on Pro. " && fv.planLine(plan({ name: "trial", trialDaysLeft: 9 })) === "Your trial is on for 9 more days. " && fv.planLine(plan({ name: "trial", trialDaysLeft: 1 })) === "Your trial is on for 1 more day. " && fv.planLine(undefined) === "");
  }
  const blank: SixMe = { icp: null, holdersUnlocked: 0, companiesUnlocked: 0, savedViews: [], started: { note: false, network: false }, crystal: "all" } as SixMe;
  const icp = { industries: ["SaaS"], employees: [], revenue: [], countries: [] };
  const view = (email: boolean) => ({ id: "v1", name: "Open Sales roles", place: "v=hiring", criteria: {}, email, createdAt: "2026-11-01T00:00:00Z" });
  const six = (me: Partial<SixMe>, x: Partial<Parameters<typeof gs.sixSteps>[0]> = {}) => gs.sixSteps({ me: { ...blank, ...me } as SixMe, seatsHeld: 0, ...x });

  const s0 = six({});
  check("six steps: a new member without Close, none done, of 5 (step 6 is Close's)", s0.done === 0 && s0.of === 5 && s0.next?.key === "icp" && s0.steps.map((x) => x.n).join() === "1,2,3,4,5", s0.steps.map((x) => x.key));
  check("six steps: the card's words", gs.sixLine(s0) === "0 of 5 done" && s0.minutes === 12);
  check("step 1: an ideal client on file", six({ icp }).steps[0].done && !six({ icp: { industries: [], employees: [], revenue: [], countries: [] } }).steps[0].done);
  check("step 2: a seat held", six({}, { seatsHeld: 1 }).steps.find((x) => x.key === "seat")!.done && six({}, { seatsHeld: 1 }).steps.find((x) => x.key === "seat")!.pill === "Earns credits");
  // Acceptance F37: a reload on set-up's "Your first company" (the profile is in, so the member reads as onboarded) stays there until Finish.
  {
    const SMod = await import("../app/onboard/setupModel");
    const rootSrc = (await import("node:fs")).readFileSync("app/Root.tsx", "utf8");
    const setupSrc = (await import("node:fs")).readFileSync("app/onboard/Setup.tsx", "utf8");
    check("a reload on Your first company keeps set-up on screen (history says screen 6), and Setup opens on it", SMod.PROFILE_SCREEN === 6 && /Number\(window\.history\.state\?\.ob\) === 6\) setObHold\(true\)/.test(rootSrc) && /me\.onboarded && entryStep\(\) === PROFILE_SCREEN \? PROFILE_SCREEN :/.test(setupSrc));
  }
  // Acceptance F38: on a paid plan the steps lead with value, never with earning credits.
  const paid = six({ icp }, { paid: true });
  check("on Pro, Close or the trial: after the ideal client comes bringing in who you know, then the seats", paid.next?.key === "network" && paid.steps.map((x) => x.key).slice(0, 3).join() === "icp,network,seat" && paid.steps.map((x) => x.n).join() === "1,2,3,4,5", paid.steps.map((x) => x.key));
  check("…and the seats step says what a seat does for them, with no earn pill", !/credit/i.test(paid.steps.find((x) => x.key === "seat")!.gives) && !paid.steps.find((x) => x.key === "seat")!.pill);
  check("step 3: Google or the LinkedIn connections file brought in", six({ started: { note: false, network: true } }).steps.find((x) => x.key === "network")!.done);
  const noNet = six({ started: { note: false, network: false, networkOff: true } });
  check("step 3 is left out while Your network is off (it could never be done)", !noNet.steps.some((x) => x.key === "network") && noNet.of === 4 && gs.sixLine(noNet) === "0 of 4 done");
  check("step 4: a company opened, or a seat holder or person paid for", six({ companiesUnlocked: 1 }).steps.find((x) => x.key === "open")!.done && six({ holdersUnlocked: 1 }).steps.find((x) => x.key === "open")!.done && six({}, { seen: true }).steps.find((x) => x.key === "open")!.done);
  check("step 4 says free where it is", six({}).steps.find((x) => x.key === "open")!.pillKind === "free" && !six({ crystal: undefined, proOpens: undefined, freeCompany: false }).steps.find((x) => x.key === "open")!.pill);
  check("step 5: a saved list with its email on", six({ savedViews: [view(true)] as never }).steps.find((x) => x.key === "alert")!.done && !six({ savedViews: [view(false)] as never }).steps.find((x) => x.key === "alert")!.done);
  check("step 5 reads a list's alert switch once lists have one (F5)", !gs.alertOn({ email: true, alert: { on: false } }) && gs.alertOn({ email: false, alert: { on: true } }));
  check("step 6 is on now Evidence Bank is built, for Close only", gs.EVIDENCE_ON && six({}, { close: true }).steps.some((x) => x.key === "evidence") && !six({}, { close: false }).steps.some((x) => x.key === "evidence"));
  const ev = six({}, { close: true, evidence: true });
  check("step 6 is Close's: of 6 with Close, of 5 without", ev.of === 6 && ev.steps[5].label === "Write your first case study" && six({}, { close: false, evidence: true }).of === 5);
  check("step 6 is done once one case is ready, not before (a draft doesn't count)", !six({}, { close: true }).steps[5].done && !six({}, { close: true, evidenceReady: 0 }).steps[5].done && six({}, { close: true, evidenceReady: 1 }).steps[5].done);
  check("step 6 done counts toward the card: 1 of 6", gs.sixLine(six({}, { close: true, evidenceReady: 2 })) === "1 of 6 done");
  check("without Close a ready case never shows step 6", !six({}, { close: false, evidenceReady: 3 }).steps.some((x) => x.key === "evidence"));
  const all5 = six({ icp, companiesUnlocked: 1, savedViews: [view(true)] as never, started: { note: false, network: true } }, { seatsHeld: 2 });
  check("every step done: no next, nothing left", all5.done === 5 && all5.next === null && all5.minutes === 0);
  check("a step once done stays done in this browser (a refund never takes a tick back)", six({}, { stuck: new Set(["six:open"]) }).steps.find((x) => x.key === "open")!.done);
  check("the next step is the first not done", six({ icp }).next?.key === "seat");

  // First visits and their strips.
  const me = { added: 0, unlocked: 0, companiesUnlocked: 0, holdersUnlocked: 0, savedViews: [], started: { note: false, network: false }, benchRates: [], icp: null } as never;
  check("Home on a first visit: its strip", fv.firstOf("home", fv.ownOf("home", me)).first && /Your day starts here/.test(fv.firstOf("home", 0).strip ?? ""));
  check("a strip dismissed stays gone", fv.firstOf("home", 0, ["home"]).strip === null && fv.firstOf("home", 0, ["home"]).first);
  check("with the member's own data, no strip", fv.firstOf("companies", 3).strip === null && !fv.firstOf("companies", 3).first);
  check("unknown is never a first visit (no strip on a guess)", fv.firstOf("proposals", null).strip === null && fv.ownOf("proposals", me) === null);
  check("every strip points at a step", Object.values(fv.STRIPS).every((x) => !!x.step));
  check("each page's step is one of the six", Object.values(fv.STRIPS).every((x) => (gs.SIX_KEYS as readonly string[]).includes(x.step!)));
  check("Companies: first until a company is opened", fv.ownOf("companies", me) === 0 && fv.ownOf("companies", { ...(me as object), companiesUnlocked: 2 } as never) === 2);
  check("strip keys are page keys the server accepts", Object.keys(fv.STRIPS).every((k) => u2.STRIP_KEY_RE.test(k)));

  // Examples: never counted, never a record.
  const deal = { company: "Cedar and Pine", stage: "Target" as const, person: "Head of Sales", line: "A real deal" };
  const rows = [deal, ...ex.EXAMPLE_DEALS];
  check("example rows are taken out of what counts", ex.realOnly(rows).length === 1 && ex.realOnly(rows)[0] === deal);
  check("examples alone are said to be examples", ex.onlyExamples(ex.EXAMPLE_DEALS) && !ex.onlyExamples(rows) && !ex.onlyExamples([]));
  check("every example is labelled Example and frozen", [...ex.EXAMPLE_DEALS, ...ex.EXAMPLE_CONVERSATIONS, ...ex.EXAMPLE_PROPOSALS, ...ex.EXAMPLE_CONTRACTS].every((x) => ex.isExample(x) && x.label === "Example" && Object.isFrozen(x)));
  check("an example is no record: it has no id, no company id, nothing an action takes", ex.EXAMPLE_DEALS.every((x) => !("id" in x) && !("companyId" in x) && !("id" in (x.value as object))));
  check("the six steps read no list's rows: examples can't tick a step", JSON.stringify(six({ savedViews: ex.EXAMPLE_DEALS as never }).steps.find((x) => x.key === "alert")!.done) === "false");
  check("examples use the made-up cast only", JSON.stringify([ex.EXAMPLE_DEALS, ex.EXAMPLE_CONVERSATIONS, ex.EXAMPLE_PROPOSALS, ex.EXAMPLE_CONTRACTS]).match(/Northwind Clinics|Cedar and Pine|Halcyon Freight|Larkspur Learning|Dana Whitfield/g)!.length >= 4);

  // The flag's settings (lib/ui2.ts).
  check("RN_UI2 off: Me carries nothing of it", JSON.stringify(u2.ui2Me({ ui2: true, stripsOff: ["home"] }, "off")) === "{}");
  check("RN_UI2 optin: off until chosen, the switch offered", JSON.stringify(u2.ui2Me({}, "optin")) === JSON.stringify({ ui2: false, ui2Optin: true }) && u2.ui2Me({ ui2: true }, "optin").ui2 === true);
  check("RN_UI2 on: everyone, no switch", u2.ui2Me({}, "on").ui2 === true && !u2.ui2Me({}, "on").ui2Optin);
  const t1 = u2.ui2Setting({ ui2: true }, {}, "optin");
  check("Try the new Merlin: kept on the profile", !!t1 && "profile" in t1 && t1.profile.ui2 === true);
  const t2 = u2.ui2Setting({ ui2: false }, { ui2: true }, "optin");
  check("Back to the old look: taken off the profile", !!t2 && "profile" in t2 && t2.profile.ui2 === undefined);
  const t3 = u2.ui2Setting({ ui2: true }, {}, "off");
  check("with the flag off the switch is refused", !!t3 && "refused" in t3);
  const t4 = u2.ui2Setting({ stripOff: "companies" }, { stripsOff: ["home"] }, "on");
  check("a strip dismissed is added once", !!t4 && "profile" in t4 && t4.profile.stripsOff!.join() === "home,companies");
  const t5 = u2.ui2Setting({ stripOn: "home" }, { stripsOff: ["home"] }, "on");
  check("Undo brings it back, and an empty list goes", !!t5 && "profile" in t5 && t5.profile.stripsOff === undefined);
  check("a key that is no page key is refused", "refused" in (u2.ui2Setting({ stripOff: "../x" }, {}, "on") ?? {}));
  check("anything else is not the new look's", u2.ui2Setting({ digest: true }, {}, "on") === null);

  // Stage 9, the switch-over: the new look is the default; RN_UI2=off is still the rollback.
  const was = process.env.RN_UI2;
  try {
    delete process.env.RN_UI2;
    check("RN_UI2 unset: the new look, for everyone", u2.ui2Mode() === "on" && u2.ui2Me({}).ui2 === true);
    process.env.RN_UI2 = "";
    check("RN_UI2 empty: the new look too", u2.ui2Mode() === "on");
    for (const off of ["off", "OFF", "0", "false", "no"]) {
      process.env.RN_UI2 = off;
      check(`RN_UI2=${off}: the old look (the rollback), nothing of the new one sent`, u2.ui2Mode() === "off" && JSON.stringify(u2.ui2Me({ ui2: true })) === "{}");
    }
    process.env.RN_UI2 = "optin";
    check("RN_UI2=optin: still the member's choice", u2.ui2Mode() === "optin");
    process.env.RN_UI2 = "on";
    check("RN_UI2=on: on", u2.ui2Mode() === "on");
  } finally {
    if (was === undefined) delete process.env.RN_UI2;
    else process.env.RN_UI2 = was;
  }

  // What's new (shell/WhatsNew.tsx, releaseNotes.ts): once in the new look, dismissed like a strip.
  const rn = await import("../app/post/shell/releaseNotes");
  const { readFileSync } = await import("node:fs");
  const words = rn.WHATS_NEW.map((x) => x.text).join(" ");
  check("What's new: its key is a strip key the server keeps", u2.STRIP_KEY_RE.test(rn.WHATS_NEW_KEY));
  check("What's new: shown in the new look until closed, on this device or another", rn.whatsNewShown({ ui2: true, stripsOff: [], gone: false }) && !rn.whatsNewShown({ ui2: true, stripsOff: ["whatsnew"], gone: false }) && !rn.whatsNewShown({ ui2: true, stripsOff: [], gone: true }) && !rn.whatsNewShown({ ui2: false, stripsOff: [], gone: false }));
  const closed = u2.ui2Setting({ stripOff: rn.WHATS_NEW_KEY }, {}, "on");
  check("What's new: closing it is kept on the profile", !!closed && "profile" in closed && closed.profile.stripsOff!.includes("whatsnew"));
  check("What's new: saved views are lists with alerts, search and Invite moved, Settings in one place, Alerts and workflows", /Saved views are lists/.test(words) && /alert/.test(words) && /Search moved to Find/.test(words) && /Invite a fractional moved/.test(words) && /Settings is one page/.test(words) && /Alerts and workflows/.test(words));
  check("What's new: plain words, no numbers, no exclamation marks, no dashes as punctuation", !/\d/.test(words) && !/!/.test(words) && !/ - |—|–/.test(words), words);
  check("What's new: each line opens its page", rn.WHATS_NEW.every((x) => ["find", "credits", "settings", "alerts"].includes(x.page) && !!x.go));
  check("What's new is not drawn on any page (owner, 2026-11-24: no members used the old look yet)", !["app/post/TradingPost.tsx", "app/post/Home2.tsx"].some((f) => /<WhatsNew\b/.test(readFileSync(f, "utf8"))));
  check("a member who starts in the new look never gets it: the set-up closes it as it ends", /stripOff: "whatsnew"/.test(readFileSync("app/onboard/Setup.tsx", "utf8")));
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
  await pure();
  if (process.env.PURE !== "1") await main();
} catch (e) {
  failures++;
  console.log("FAIL threw:", e);
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
