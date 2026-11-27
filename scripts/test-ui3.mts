/**
 * Checks of the new design behind RN_UI3 (lib/ui3.ts, app/post/ui3). No browser, no server:
 * lib/table.ts runs in process on a made-up seed in a temporary data dir, with fetch replaced, so
 * nothing leaves the machine.
 *
 *   npx tsx scripts/test-ui3.mts      exits 1 on any failure
 *
 * Covered:
 *   - the flag: unset and off send nothing of the new design, and the current look's places are as
 *     before (?p=network is Warm paths in the new look); optin offers the switch to admins only, keeps
 *     their choice and refuses everyone else; on is everyone's, with no switch; it rides on RN_UI2;
 *   - Saved and Hidden companies, kept on the profile through the settings action, cleaned and capped;
 *   - with the flag on the shell is the new one: TradingPost draws ui3/Frame's nav, top bar and tab
 *     bar in place of the new look's, and every page the brief names is built;
 *   - the fit: seven traits from facts on file, bands from the count, nothing matched without them;
 *   - the copy: no em dashes, no AI words and no percentages in the new design's own words.
 */
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const dir = mkdtempSync(path.join(tmpdir(), "rn-ui3-"));
const DAY = 86_400_000;
const t0 = Date.now();
const ago = (ms: number) => new Date(t0 - ms).toISOString();
const companies = Array.from({ length: 6 }, (_, k) => ({
  id: `c_uithree${k}`,
  fields: { name: `Uithree Co ${k}`, website: `uithree${k}.example`, industry: "SaaS", employees: "51–200", revenue: "$1M–$5M", hq: "Austin, TX" },
}));
const seed = {
  builtAt: ago(30 * DAY),
  members: [
    { id: "mem_adm", name: "Ada Uithree", email: "admin-ui3@example.com", title: "Fractional VP Sales", token: "tok-adm-ui3" },
    { id: "mem_mem", name: "Mo Uithree", email: "mo.ui3@example.com", title: "Fractional VP Sales", token: "tok-mem-ui3" },
  ],
  companies,
  engagements: [{ id: "e_ui3_0", companyId: "c_uithree0", verified: false, fields: { source: "Seat scan", role: "Fractional VP Sales", function: "Sales", type: "Fractional", start: "2025-01", status: "Active", end: "Ongoing" } }],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({
    ledger: [],
    values: {},
    unlocks: {},
    seen: Object.fromEntries(seed.members.map((m) => [m.id, ago(3_600_000)])),
    profiles: { mem_adm: { function: "Sales", onboarded: true }, mem_mem: { function: "Sales", onboarded: true } },
  }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
  RN_SCAN_TEST: "1",
  RN_DIGEST: "0",
  RN_ADMIN_EMAILS: "admin-ui3@example.com",
});
for (const k of ["RN_BILLING", "STRIPE_SECRET_KEY", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_RADAR", "RESEND_API_KEY", "RN_UI2", "RN_UI3"]) delete process.env[k];
globalThis.fetch = (async () => new Response("ok", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const root = process.cwd();
const read = (p: string) => readFileSync(path.join(root, p), "utf8");

async function main() {
  const u3 = await import("../lib/ui3");
  const t = await import("../lib/table");
  const { parsePlace } = await import("../app/post/place");

  /* ---------- the flag, as pure functions ---------- */
  check("RN_UI3 unset: off", u3.ui3Mode() === "off");
  for (const v of ["off", "0", "no", "yes", "ON2", ""]) {
    process.env.RN_UI3 = v;
    check(`RN_UI3=${JSON.stringify(v)}: off`, u3.ui3Mode() === "off");
  }
  process.env.RN_UI3 = "optin";
  check("RN_UI3=optin", u3.ui3Mode() === "optin");
  process.env.RN_UI3 = " On ";
  check("RN_UI3=on (spaces and case aside)", u3.ui3Mode() === "on");
  delete process.env.RN_UI3;
  const adm = { admin: true, ui2: true };
  const mem = { admin: false, ui2: true };
  check("off: Me carries nothing of it, even with a choice on the profile", JSON.stringify(u3.ui3Me({ ui3: true, ui3Saved: ["c_x123"] }, adm, "off")) === "{}");
  check("optin: nothing for a member who isn't an admin", JSON.stringify(u3.ui3Me({ ui3: true }, mem, "optin")) === "{}");
  check("optin: an admin is offered the switch, off until chosen", JSON.stringify(u3.ui3Me({}, adm, "optin")) === JSON.stringify({ ui3: false, ui3Optin: true }));
  check("optin: an admin's choice is kept", u3.ui3Me({ ui3: true }, adm, "optin").ui3 === true);
  check("on: everyone, no switch", u3.ui3Me({}, mem, "on").ui3 === true && u3.ui3Me({}, mem, "on").ui3Optin === undefined);
  check("it rides on the new look: RN_UI2 off is RN_UI3 off", JSON.stringify(u3.ui3Me({}, { admin: true, ui2: false }, "on")) === "{}");
  const s1 = u3.ui3Setting({ ui3: true }, {}, mem, "optin");
  check("optin: a member who isn't an admin is refused", !!s1 && "refused" in s1);
  const s2 = u3.ui3Setting({ ui3: true }, {}, adm, "optin");
  check("optin: an admin turns it on", !!s2 && "profile" in s2 && s2.profile.ui3 === true && !/—/.test(s2.message));
  const s3 = u3.ui3Setting({ ui3: false }, { ui3: true }, adm, "optin");
  check("optin: and back to the current design", !!s3 && "profile" in s3 && s3.profile.ui3 === undefined);
  check("on: the switch is refused in plain words", (u3.ui3Setting({ ui3: true }, {}, adm, "on") as { refused?: string })?.refused === "The new design is on for everyone now.");
  check("off: the switch is refused", "refused" in (u3.ui3Setting({ ui3: true }, {}, adm, "off") ?? {}));
  check("anything else is not the new design's", u3.ui3Setting({ digest: true }, {}, adm, "on") === null);

  /* ---------- Saved and Hidden ---------- */
  const sv = u3.ui3Setting({ ui3Save: { id: "c_abc123", on: true } }, {}, mem, "on");
  check("Save keeps a company in Saved", !!sv && "profile" in sv && sv.profile.ui3Saved?.join() === "c_abc123");
  const sv2 = u3.ui3Setting({ ui3Save: { id: "c_abc123", on: false } }, { ui3Saved: ["c_abc123"] }, mem, "on");
  check("and takes it out again", !!sv2 && "profile" in sv2 && sv2.profile.ui3Saved === undefined);
  const hd = u3.ui3Setting({ ui3Hide: { id: "c_def456", on: true } }, { ui3Hidden: ["c_def456"] }, mem, "on");
  check("Hide keeps a company once", !!hd && "profile" in hd && hd.profile.ui3Hidden?.join() === "c_def456");
  check("an id that is no public id is refused", "refused" in (u3.ui3Setting({ ui3Hide: { id: "../etc", on: true } }, {}, mem, "on") ?? {}));
  check("Save is refused while the flag is off", "refused" in (u3.ui3Setting({ ui3Save: { id: "c_abc123", on: true } }, {}, mem, "off") ?? {}));
  const many = Array.from({ length: u3.UI3_LIST_MAX + 20 }, (_, k) => `c_many${k}`);
  check("the lists are capped", u3.ui3Me({ ui3Saved: many, ui3Hidden: ["bad id", "c_ok1234"] }, mem, "on").ui3Saved!.length === u3.UI3_LIST_MAX && u3.ui3Me({ ui3Hidden: ["bad id", "c_ok1234"] }, mem, "on").ui3Hidden!.join() === "c_ok1234");

  /* ---------- through the server (lib/table.ts) ---------- */
  const was = { ui2: process.env.RN_UI2, ui3: process.env.RN_UI3 };
  try {
    delete process.env.RN_UI3;
    const off = await t.buildView("tok-adm-ui3");
    check("RN_UI3 unset: nothing of the new design is sent, to an admin either", off.me!.ui3 === undefined && off.me!.ui3Optin === undefined && off.me!.ui3Saved === undefined && off.me!.ui3Hidden === undefined);
    check("RN_UI3 unset: the new look is as it was", off.me!.ui2 === true);
    const refused = await t.perform("tok-adm-ui3", { type: "settings", ui3: true } as never).then(() => null, (e: Error) => e.message);
    check("RN_UI3 unset: turning it on is refused", refused === "The new design isn't open yet.", refused);
    process.env.RN_UI3 = "optin";
    const a1 = await t.buildView("tok-adm-ui3");
    const m1 = await t.buildView("tok-mem-ui3");
    check("optin: the admin is offered it, off until chosen", a1.me!.ui3 === false && a1.me!.ui3Optin === true);
    check("optin: a member sees nothing of it", m1.me!.ui3 === undefined && m1.me!.ui3Optin === undefined);
    const mref = await t.perform("tok-mem-ui3", { type: "settings", ui3: true } as never).then(() => null, (e: Error) => e.message);
    check("optin: a member can't turn it on", !!mref);
    await t.perform("tok-adm-ui3", { type: "settings", ui3: true } as never);
    const a2 = await t.buildView("tok-adm-ui3");
    check("optin: Try the new design turns it on, kept on the profile", a2.me!.ui3 === true && Array.isArray(a2.me!.ui3Saved));
    // Saved and Hidden take a company's public id as the view gives it (F36: an id that is not on Merlin is refused).
    const ids = a2.companies.map((c) => c.id);
    const [saveId, hideId] = [ids[2], ids[3]];
    check("the view gives the fixture companies' public ids", ids.length === companies.length && !!saveId && !!hideId && !ids.includes("c_uithree2"), ids);
    await t.perform("tok-adm-ui3", { type: "settings", ui3Save: { id: saveId, on: true } } as never);
    await t.perform("tok-adm-ui3", { type: "settings", ui3Hide: { id: hideId, on: true } } as never);
    const a3 = await t.buildView("tok-adm-ui3");
    check("Saved and Hidden come back on Me", a3.me!.ui3Saved!.join() === saveId && a3.me!.ui3Hidden!.join() === hideId, [a3.me!.ui3Saved, a3.me!.ui3Hidden]);
    for (const bad of ["c_nosuchco999", "c_uithree2", "../etc"]) {
      const why = await t.perform("tok-adm-ui3", { type: "settings", ui3Save: { id: bad, on: true } } as never).then(() => null, (e: Error) => e.message);
      check(`Save of a company that isn't on Merlin (${bad}) is refused in plain words`, why === "That company isn't on Merlin. Refresh the page and try again.", why);
    }
    const a3b = await t.buildView("tok-adm-ui3");
    check("...and nothing was kept", a3b.me!.ui3Saved!.join() === saveId);
    const out = await t.perform("tok-adm-ui3", { type: "settings", ui3Save: { id: "c_nosuchco999", on: false } } as never).then(() => null, (e: Error) => e.message);
    check("taking out an id that is not on Merlin is allowed (a stale one can go)", out === null, out);
    process.env.RN_UI3 = "on";
    const m2 = await t.buildView("tok-mem-ui3");
    check("on: everyone, and no switch", m2.me!.ui3 === true && m2.me!.ui3Optin === undefined);
    process.env.RN_UI2 = "off";
    const m3 = await t.buildView("tok-mem-ui3");
    check("on, with the new look rolled back: nothing of the new design", m3.me!.ui3 === undefined && m3.me!.ui2 === undefined);
  } finally {
    if (was.ui2 === undefined) delete process.env.RN_UI2;
    else process.env.RN_UI2 = was.ui2;
    if (was.ui3 === undefined) delete process.env.RN_UI3;
    else process.env.RN_UI3 = was.ui3;
  }

  /* ---------- places: flag off is unchanged ---------- */
  const v = await t.buildView("tok-mem-ui3");
  const me = v.me!;
  check("flag off: ?p=network opens Warm paths in the new look, as before", parsePlace(me, "?p=network", new Set(), undefined, { ui2: true }).p === "warm");
  check("flag off: the old look keeps ?p=network", parsePlace(me, "?p=network", new Set(), undefined, {}).p === "network");
  check("flag on: ?p=network is My Network", parsePlace(me, "?p=network", new Set(), undefined, { ui2: true, ui3: true }).p === "network");
  check("flag on: Google's return still opens Settings", parsePlace(me, "?p=network&google=connected", new Set(), undefined, { ui2: true, ui3: true }).p === "settings");
  for (const [q, p] of [["?p=radar", "radar"], ["?p=getin", "warm"], ["?p=pipeline", "pipeline"], ["?p=proposals", "proposals"], ["?p=messages", "messages"], ["?p=evidence", "evidence"], ["?p=alerts", "alerts"]] as const)
    check(`flag on: ${q} opens ${p}, as with it off`, parsePlace(me, q, new Set(), undefined, { ui2: true, ui3: true }).p === p && parsePlace(me, q, new Set(), undefined, { ui2: true }).p === p);

  /* ---------- the shell, read as source ---------- */
  const tp = read("app/post/TradingPost.tsx");
  check("TradingPost loads the new design on its own (a lazy module)", /nextDynamic\(\(\) => import\("\.\/ui3\/Frame"\)/.test(tp));
  check("the new look's rail, tab bar and More are drawn only without the new design", /navSide && ui2 && !ui3 && \(\s*<Rail/.test(tp) && /!navSide && ui2 && !ui3 && <TabBar2/.test(tp) && /moreOpen && !navSide && ui2 && !ui3 && \(\s*<MoreSheet2/.test(tp));
  check("with it on: the forest nav, the top bar, the phone bar and the tab bar", /navSide && ui3 && <Ui3Frame part="nav"/.test(tp) && /<Ui3Frame part="top"/.test(tp) && /ui3 && !navSide && <Ui3Frame part="mtop"/.test(tp) && /!navSide && ui3 && <Ui3Frame part="tabbar"/.test(tp));
  check("ui3 is only ever on with Me.ui3 and the new look", /const ui3 = ui2 && !!me\.ui3;/.test(tp));
  check("the account menu offers the switch only with Me.ui3Optin", /me\.ui3Optin \? \[\{ group: "The new design"/.test(tp));
  const head = read("app/post/ui3/head.ts");
  for (const k of ["home", "crystal", "targets", "company", "network", "warm"]) check(`the new design's ${k} page is built`, new RegExp(`UI3_BUILT[^\\n]*"${k}"`).test(head));
  const shell = read("app/post/ui3/Shell.tsx");
  for (const w of ["Find", "Work", "Community"]) check(`the nav has its ${w} group`, new RegExp(`sec\\("${w}"`).test(shell));
  for (const k of ["pipeline", "alerts", "proposals", "contracts", "evidence", "fractionals", "messages", "people", "engagements", "hiring", "settings", "credits", "rates", "agent", "metrics", "find"])
    check(`every page stays reachable: ${k}`, new RegExp(`mk\\("${k}"`).test(shell));
  const css = read("app/post/ui3/ui3.css") + read("app/post/ui3/shell.css") + read("app/post/ui3/pages.css");
  const rules = css.replace(/\/\*[\s\S]*?\*\//g, "").replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g, "");
  const sels = [...rules.matchAll(/([^{}@]+)\{[^{}]*\}/g)].map((m) => m[1].trim()).filter((s) => s && !/^(from|to|\d+%)$/.test(s));
  // A selector list, split at its own commas (not those inside :is() or :where()).
  const splitTop = (s: string) => {
    const out: string[] = [];
    let depth = 0;
    let cur = "";
    for (const ch of s) {
      if (ch === "(") depth++;
      if (ch === ")") depth--;
      if (ch === "," && depth === 0) (out.push(cur), (cur = ""));
      else cur += ch;
    }
    return [...out, cur];
  };
  const leaks = sels.flatMap((s) => splitTop(s).map((x) => x.trim())).filter((x) => x && !/(^|\s|:where\()\.ui3\b|^\.ui3|\.u3p\b|\.u3\b|tp-app\.ui3|:has\(\.tp-app\.ui3\)|^:root/.test(x));
  check("every style of the new design is scoped under .ui3 (nothing reaches the current look)", leaks.length === 0, leaks.slice(0, 8));
  // Class names the current look's CSS also uses: each needs its undo in pages.css (found by building My Network in dark mode).
  for (const [cls, prop] of [["nw-list", "background: transparent"], ["nw-row", "margin-top: 0"], ["nw-co", "padding: 0"], ["wp-bar", "border-bottom: 0"]] as const)
    check(`.${cls} (also the current look's) is reset in the new design`, new RegExp(`\\.u3p \\.${cls} \\{[^}]*${prop}`).test(css));
  const pkg = read("package.json");
  check("the fonts are bundled, no Google Fonts link", /@fontsource-variable\/fraunces/.test(pkg) && /@fontsource-variable\/geist"/.test(pkg) && !/fonts\.googleapis/.test(css + shell + read("app/post/ui3/fonts.ts")));

  /* ---------- the fit, split in two: criteria of the ideal client on file, and the buying signals apart ---------- */
  const { deriveAll } = await import("../app/post/model");
  const { fit7, fitFor, bandOf, fitCount, FIT_TIP } = await import("../app/post/ui3/model");
  const infos = deriveAll(v.companies);
  const i0 = infos.find((x) => x.c.engagements.length > 0) ?? infos[0];
  check("the made-up seed's companies reach the fit", !!i0, infos.map((x) => x.c.id));
  const none = fitFor(i0, { icp: null, function: "Sales" });
  check("no ideal client: nothing is asked, nothing is counted, and the buying signals still read", none.traits.length === 0 && none.n === 0 && none.of === 0 && none.asked === 0 && none.signals.length === 4 && fitCount(none) === "Set your ideal client to see fit", none);
  const full = fitFor(i0, { icp: { industries: ["SaaS"], employees: ["51–200"], revenue: ["$1M–$5M"], countries: ["United States"] }, function: "Sales" });
  check("a matching ideal client and a past Sales hire: the criteria that match are on, and the hire is a buying signal, not a criterion", full.traits.find((x) => x.key === "industries")!.on && full.traits.find((x) => x.key === "employees")!.on && full.signals.find((x) => x.key === "yourFn")!.on && !full.traits.some((x) => (x.key as string) === "yourFn"), full);
  check("the count is of the criteria on file: one not on file is listed, never counted", full.of === full.traits.filter((x) => !x.unknown).length && full.n === full.traits.filter((x) => x.on).length && full.traits.filter((x) => x.unknown).every((x) => x.value === "Not on file" && !x.on));
  const more = fitFor(i0, { icp: { industries: ["SaaS"], employees: ["51–200"], revenue: [], countries: [], motion: ["PLG"], dealSize: ["$150K+"] }, function: "Sales" });
  check("a criterion nobody has added a fact for is Not on file, and the count is unchanged by it", more.traits.find((x) => x.key === "motion")?.unknown === true && more.traits.find((x) => x.key === "motion")?.fact === "motion" && more.of === 2 && more.n === 2 && more.asked === 4, more);
  check("the member's own client is never scored", ((f) => !!f.client && f.traits.length === 0 && f.of === 0)(fitFor(i0, { icp: { industries: ["SaaS"], employees: [], revenue: [], countries: [] }, function: "Sales", clients: [{ id: i0.c.id, current: true, words: "Your client since Feb 2025" }] })));
  check("the older name reads the same fit", fit7 === fitFor);
  check("bands are words from the share of known criteria matched", bandOf(4, 4) === "Strong opportunity" && bandOf(3, 4) === "Strong opportunity" && bandOf(2, 4) === "Good opportunity" && bandOf(1, 4) === "Worth watching" && bandOf(2, 2) === "Good opportunity" && bandOf(0, 0) === "Worth watching");
  // The ring reads as criteria matched of the ones on file, never a chance of winning: a "fit" caption, its count in its name, and which match, which don't and which are not on file.
  const parts = read("app/post/ui3/parts.tsx");
  check("the fit ring: a fit caption, its name says what is on file, and its popover lists each criterion and the buying signals apart", /m-fit-cap">fit</.test(parts) && /on file match/.test(parts) && /Not matched: /.test(parts) && /Not on file: /.test(parts) && /Buying signals/.test(parts) && /not a chance of winning/.test(parts) && /fit\.traits\.map/.test(parts) && /fit\.signals\.map/.test(parts));
  check("the member's own client shows its words where the ring would be", /if \(fit\.client\) return <ClientTag/.test(parts));
  check("the tooltip says a fact not on file is left out, with no percentage", /not on file is left out/i.test(FIT_TIP) && !/%|percent|of 7/.test(FIT_TIP));
  for (const f of ["app/post/ui3/Targets.tsx", "app/post/ui3/Company.tsx", "app/post/ui3/Crystal.tsx", "app/post/ui3/Home.tsx", "app/post/ui3/Network.tsx", "app/post/ui3/data.ts"]) check(`${f} no longer counts out of seven`, !/of 7|fit\.n >= \d/.test(read(f)));

  /* ---------- the acceptance test's findings (2026-11-25): one source, every surface agrees ---------- */
  {
    const M = await import("../app/post/ui3/model");
    type WR = import("../lib/paths/types").WarmRow;
    const wr = (x: Partial<WR>): WR => ({ id: "c1", name: "Open Co", facts: "", locked: false, fit: 2, fitWords: [], odds: "Low", hiringNow: false, ball: false, list: null, best: 40, way: "Good path", band: null, src: "fellow", via: "Through Tess", direct: false, person: null, people: [], fresh: null, zone: "go", x: 60, y: 60, onMap: true, plan: false, rank: 1, ...x }) as WR;
    // F7: one warm-path list and count; a locked company's way in is counted apart, the same in the count and the list.
    const wv = { rows: [wr({ id: "a", best: 70, odds: "Low", fit: 2, rank: 1 }), wr({ id: "b", best: 20, odds: "High", hiringNow: true, fit: 4, rank: 2 }), wr({ id: "c", locked: true, name: null, rank: 3 }), wr({ id: "d", src: "direct", via: "A cold note to their CEO", rank: 4 })] } as unknown as import("../lib/paths/types").WarmView;
    const wl = M.warmList(wv);
    check("F7: one warm list: locked companies and cold notes are not in it, and the count is its length", wl.map((r) => r.id).join() === "b,a" && M.lockedWarm(wv) === 1, wl.map((r) => r.id));
    // F4: the next move favours a company that needs the member (hiring, then odds, then fit) over a warmer path to a quiet one.
    check("F4: the next move is the company hiring for the member, ahead of a warmer path to one with no sign of need", wl[0].id === "b");
    for (const f of ["app/post/ui3/Home.tsx", "app/post/ui3/Network.tsx", "app/post/ui3/Warm.tsx", "app/post/ui3/Shell.tsx"])
      check(`F7: ${f} reads the one warm list (warmList), never its own filter`, /warmList\(/.test(read(f)) && !/rows\.filter\(isWarm\)|\.filter\(\(r\) => isWarm\(r\) && !r\.locked/.test(read(f)));
    // F19: the person the member knows who decides is never asked for an intro to themself.
    check("F19: someone in between: Request an intro", M.askOf({ direct: false, hiringNow: true, src: "google" }, "Tess").l === "Request an intro from Tess");
    check("F19: the member knows who decides: Discuss opportunity when hiring, else Reconnect, never an intro", M.askOf({ direct: true, hiringNow: true, src: "linkedin" }).l === "Discuss opportunity" && M.askOf({ direct: true, hiringNow: false, src: "google" }).l === "Reconnect");
    check("F19: a cold note is Write to them", M.askOf({ direct: true, hiringNow: true, src: "direct" }, "Dana").l === "Write to Dana");
    const net = read("app/post/ui3/Network.tsx");
    check("F19: My Network's action for someone who decides is Discuss opportunity or Reconnect, and its menu never offers them an intro", /if \(x\.dm\) return x\.demand \? \{ k: "discuss"/.test(net) && /a\.k !== "intro" && x\.demand && !x\.dm/.test(net) && /const ask = askOf\(next,/.test(net));
    // F6: Crystal Ball's purple feed has no posted role; a row with only a role is not in it.
    const rows = [
      { id: "r1", kinds: ["role"], lines: ["New open role: VP Sales"], sigs: [{ kind: "role", line: "New open role: VP Sales" }], h: [0, 1] },
      { id: "r2", kinds: ["role", "adjacent"], lines: ["New open role: VP Sales", "Hired a fractional CFO 1 month ago"], notes: ["", "Medium"], sigs: [{ kind: "adjacent", line: "Hired a fractional CFO 1 month ago" }, { kind: "role", line: "New open role: VP Sales" }], h: [0, 1] },
      { id: "r3", kinds: ["adjacent"], lines: ["Hired a fractional CFO 2 months ago"] },
    ] as unknown as import("../lib/radar/types").RadarRow[];
    const pr = M.predicted(rows);
    check("F6: a row with only a posted role leaves the predicted feed; a mixed row keeps only its predicted signals", pr.map((r) => r.id).join() === "r2,r3" && pr[0].kinds.join() === "adjacent" && pr[0].lines.join() === "Hired a fractional CFO 1 month ago" && pr[0].notes!.join() === "Medium" && pr[0].sigs!.every((g) => g.kind !== "role") && pr[0].h === undefined, pr);
    for (const f of ["app/post/ui3/Home.tsx", "app/post/ui3/Crystal.tsx", "app/post/ui3/Network.tsx"]) check(`F6: ${f} reads Crystal Ball through predicted()`, /predicted\(/.test(read(f)));
    // F8: a locked company is described by its free facts.
    const lockedCo = { c: { hidden: true, shownName: null, name: "", cells: { industry: { s: "value", v: "Fintech" }, employees: { s: "value", v: "11–50" }, revenue: { s: "value", v: "$5M–$20M" }, hq: { s: "value", v: "Austin, TX" } } } } as never;
    check("F8: a locked company reads as its facts, never a bare Locked company", M.coTitle(lockedCo) === "A Fintech company" && M.coFacts(lockedCo) === "11–50 people · $5M–$20M · Austin, TX", [M.coTitle(lockedCo), M.coFacts(lockedCo)]);
    const home = read("app/post/ui3/Home.tsx");
    check("F8: Home lists one open-the-company move a day, with the company's facts", /if \(opens\+\+ && me\.crystal !== "all"\) continue;/.test(home) && /coFacts\(i\)/.test(home) && /coTitle\(i\)/.test(home));
    const cb = read("app/post/ui3/Crystal.tsx");
    check("F8: Crystal Ball's lanes and rows say a locked company's facts", /coTitle\(r\.i\)/.test(cb) && /coFacts\(r\.i\)/.test(cb));
    // F9, F23, F5 on Crystal Ball.
    check("F9: Explore on Free says it spends the day's free open (Open free · 1 left today)", /crystalButton\(c\.me\)/.test(cb) && /c\.me\.crystal === "one" \? cb\.label : "Explore"/.test(cb));
    check("F23: no 'by how likely' anywhere in the new design", !/how likely/i.test(["Crystal.tsx", "Home.tsx", "Network.tsx", "Warm.tsx", "Targets.tsx", "Company.tsx"].map((f) => read(`app/post/ui3/${f}`)).join("\n")));
    check("F5: New this week is when a signal happened (its own day), never the day Merlin listed it", /latestAt\(row\.sigs/.test(cb) && !/fresh: !!row\.day/.test(cb) && !/whenLong/.test(cb));
    const co = read("app/post/ui3/Company.tsx");
    check("F5: the company's timeline draws a hire or a posting once (the seat's own date, Crystal Ball's same event skipped)", /kinds\.some\(\(x\) => x\.k === k && near\(/.test(co));
    // F17: one hiring count: the card, the chip, the tile and Opportunities read TRow.hire (the member's function).
    const tg = read("app/post/ui3/Targets.tsx");
    check("F17: Who's hiring for my expertise, the Hiring now chip and the tile all count TRow.hire", /k: "hiring", l: "Hiring now", ic: "brief", f: \(r\) => r\.hire/.test(tg) && /const hiringMine = t\.all\.filter\(\(r\) => r\.hire\)/.test(tg) && /tile === "hiring"\) xs = xs\.filter\(\(r\) => r\.hire\)/.test(tg));
    check("F17: Opportunities put hiring in the member's function first", /Number\(b\.hire\) - Number\(a\.hire\)/.test(read("app/post/ui3/data.ts")));
    // F1 in the pages: the band only from RouteLink.rel; F28 headline; F32 one fellow count; F33 who you know.
    const wp = read("app/post/ui3/Warm.tsx");
    check("F1: Warm Paths says a band only from rel, else how the two are connected", /l0\.rel \?/.test(wp) && !/\.band\} relationship/.test(wp) && /\{l\.rel && \(/.test(wp));
    check("F1: the graph weighs a link by rel only; any other link is drawn as connected", /l\.rel \? SW\[l\.rel\]/.test(read("app/post/ui3/Graph.tsx")) && !/SW\[l\.band\]/.test(read("app/post/ui3/Graph.tsx")));
    check("F28: the headline never reads 'the company at <company>', and a cold route is not 'closer than you think'", !/"the company" :/.test(wp) && /cold \? "Start with a direct note\."/.test(wp));
    check("F32: My Network's card, chip and line count fellow fractionals one way", /fellow: !!p\.member,/.test(net) && /k: "member", l: "Fellow fractionals", f: \(x\) => x\.fellow/.test(net) && !/plural\(warm\.directory/.test(net));
    check("F33: the company page never calls a fellow fractional someone the member knows", /viaFellow \? "Nobody you know yet\. A fellow fractional can help\."/.test(co) && !/Nobody yet, but you're connected/.test(co));
  }

  /* ---------- the copy ---------- */
  const files = [...readdirSync(path.join(root, "app/post/ui3")).filter((f) => /\.(tsx|ts)$/.test(f)).map((f) => `app/post/ui3/${f}`), "lib/ui3.ts"];
  for (const f of files) {
    const src = read(f).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    // Words a member reads: string literals and JSX text.
    const strings = [...src.matchAll(/"([^"\\\n]{3,})"|`([^`]{3,})`|>([^<>{}\n]{3,})</g)].map((m) => m[1] ?? m[2] ?? m[3]).filter((s) => /[A-Za-z]{3}/.test(s) && !/^[a-z0-9-]+$/.test(s) && !/^(m|u3|ui3|wp|nw|cv|tg|op|lk|gr|rv|tm|fc|h)-/.test(s));
    const words = strings.join("\n");
    check(`${f}: no em dashes`, !/—/.test(words));
    const ai = words.match(/\b(insights?|leverag\w*|seamless\w*|empower\w*|actionable|unlock(s|ed|ing)? (your|the power|potential))\b/gi);
    check(`${f}: no AI words`, !ai, ai);
    const pct = words.split("\n").filter((s) => /\d\s?%|\bpercent/i.test(s) && !/^(\d+%|calc|translate|[\d. ]+%)/.test(s.trim()) && !/width|height|translate|calc\(/.test(s));
    check(`${f}: no percentages`, pct.length === 0, pct);
  }
}

try {
  await main();
} catch (e) {
  failures++;
  console.log("FAIL threw:", e);
}
console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
