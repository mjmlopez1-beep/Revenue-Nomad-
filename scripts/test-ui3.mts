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
    await t.perform("tok-adm-ui3", { type: "settings", ui3Save: { id: "c_uithree2", on: true } } as never);
    await t.perform("tok-adm-ui3", { type: "settings", ui3Hide: { id: "c_uithree3", on: true } } as never);
    const a3 = await t.buildView("tok-adm-ui3");
    check("Saved and Hidden come back on Me", a3.me!.ui3Saved!.join() === "c_uithree2" && a3.me!.ui3Hidden!.join() === "c_uithree3");
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

  /* ---------- the fit: seven traits from facts on file ---------- */
  const { deriveAll } = await import("../app/post/model");
  const { fit7, bandOf } = await import("../app/post/ui3/model");
  const infos = deriveAll(v.companies);
  const i0 = infos.find((x) => x.c.engagements.length > 0) ?? infos[0];
  check("the made-up seed's companies reach the fit", !!i0, infos.map((x) => x.c.id));
  const none = fit7(i0, { icp: null, function: "Sales" });
  check("no ideal client: its four traits are not matched", none.traits.slice(0, 4).every((x) => !x.on) && none.traits.length === 7);
  const full = fit7(i0, { icp: { industries: ["SaaS"], employees: ["51–200"], revenue: ["$1M–$5M"], countries: ["United States"] }, function: "Sales" });
  check("a matching ideal client and a past Sales hire: the traits that match are on", full.traits.find((x) => x.key === "industry")!.on && full.traits.find((x) => x.key === "size")!.on && full.traits.find((x) => x.key === "yourFn")!.on, full.traits);
  check("bands come from the count only", bandOf(7) === "Strong opportunity" && bandOf(6) === "Strong opportunity" && bandOf(5) === "Good opportunity" && bandOf(4) === "Good opportunity" && bandOf(3) === "Worth watching");
  // The ring reads as traits matched, never a chance of winning: a "fit" caption, "x of 7 traits" in its name, and which traits match.
  const parts = read("app/post/ui3/parts.tsx");
  check("the fit ring: a fit caption, its name says traits matched, and its popover lists each trait", /m-fit-cap">fit</.test(parts) && /`Fit: \$\{f\.n\} of \$\{of\} traits match/.test(parts) && /Not matched: /.test(parts) && /not a chance of winning/.test(parts) && /fit\.traits\.map/.test(parts));
  check("an ideal client part the member hasn't set says so", none.traits[0].value === "Not set in your ideal client", none.traits[0]);

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
