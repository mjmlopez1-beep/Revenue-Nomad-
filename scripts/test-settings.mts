/**
 * Checks of Settings (Stage 8, app/post/settings): the section list, the old addresses that land on
 * a section, no export or download anywhere on the page (the owner's rule), each Connections row's
 * Remove making the very call its source's own delete makes, Your setup's counts and next step,
 * the Notifications grid's switches going to the homes Alerts and workflows uses, the sample note,
 * the words (Merlin, never another name for its AI; Claude only as an app the member connects), and
 * every section drawn on the server for a made-up member. In process, no server, no seed.
 *
 *   npx tsx scripts/test-settings.mts
 */
import { readFileSync, readdirSync } from "node:fs";
import Module, { register } from "node:module";
import path from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
const M = Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> };
M._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 1200)}`);
};
const root = process.cwd();
const src = (f: string) => readFileSync(path.join(root, f), "utf8");
const DIR = "app/post/settings";
const files = readdirSync(path.join(root, DIR)).filter((f) => /\.(tsx?|css)$/.test(f));
const code = (f: string) => src(`${DIR}/${f}`).replace(/^\s*(\*|\/\/|\/\*).*$/gm, "");
/** What a member reads: the quoted strings and the JSX text, not the code around them. */
const wordsOf = (s: string) =>
  [...s.matchAll(/"((?:[^"\\\n]|\\.)*)"/g), ...s.matchAll(/`((?:[^`\\]|\\.)*)`/g), ...s.matchAll(/>([^<>{}\n]*[A-Za-z][^<>{}\n]*)</g)]
    .map((m) => m[1].replace(/\$\{[^}]*\}/g, " "))
    .filter((w) => /[A-Za-z]{2,}\s+[A-Za-z]/.test(w) && !/^[\w\s-]*\b(btn|st-[\w-]+)\b[\w\s-]*$/.test(w));

async function main() {
  const place = await import("../app/post/place.ts");
  const model = await import("../app/post/settings/model.ts");
  const at = await import("../app/post/settings/at.ts");

  /* ---------- 1. the sections ---------- */
  console.log("The sections");
  const keys = model.SECTIONS.map((s) => s.key);
  check("ten sections, in the mockup's order with Your agents before Plan", keys.join(",") === "profile,ideal,voice,conn,notif,sig,priv,agents,plan,data", keys);
  check("the names", model.SECTIONS.map((s) => s.name).join(", ") === "Profile and card, Ideal client, Voice, Connections, Notifications, Signature, Privacy, Your agents, Plan, Your account");
  check("place.ts knows the same sections", place.SETTINGS_SECTIONS.join(",") === keys.join(","));
  const page = code("SettingsPage.tsx");
  check("the page draws each one", keys.every((k) => page.includes(`sec === "${k}" &&`)), keys.filter((k) => !page.includes(`sec === "${k}" &&`)));
  check("each has a lead", keys.every((k) => model.SEC_LEAD[k].length > 20));
  const pages = src("app/post/shell/pages.tsx");
  check("the registry draws Settings in the new look and Integrations in the old", /settings: \{ title: "Settings", component: SettingsP, ownHeader: true, ownStrip: true/.test(pages) && /c\.ui2 \? <SettingsL \/> : <IntegrationsP \/>/.test(pages) && /loadEvidence, loadSettings, loadAlerts/.test(pages));
  check("the old Integrations page is untouched for the old look", /integrations: \{ title: "Integrations", component: IntegrationsP \}/.test(pages));

  /* ---------- 2. old addresses ---------- */
  console.log("\nOld addresses land on their section");
  const me = { icp: null, function: null, goal: null } as never;
  const P = (q: string, ui2 = true) => place.parsePlace(me, q, new Set(), undefined, { ui2 }).p;
  const lands: [string, string | null, string | null, string | null][] = [
    // address, page in the new look, section, row opened
    ["?p=settings", "settings", null, null],
    ["?p=settings&sec=voice", "settings", "voice", null],
    ["?p=settings&sec=notifications", "settings", "notif", null],
    ["?p=settings&sec=connections&open=google", "settings", "conn", "google"],
    ["?p=integrations", "settings", "conn", null],
    ["?p=integrations&slack=connected", "settings", "conn", "slack"],
    ["?p=network&google=connected", "settings", "conn", "google"],
    ["?p=network&google=denied", "settings", "conn", "google"],
    ["?p=profile", "settings", "profile", null],
    ["?p=voice", "settings", "voice", null],
    ["?p=connections", "settings", "conn", null],
    ["?p=signature", "settings", "sig", null],
    ["?p=privacy", "settings", "priv", null],
    ["?p=account", "settings", "data", null],
  ];
  for (const [q, p, sec, open] of lands) {
    const a = at.atOf(q);
    check(`${q}: ${p}${sec ? `, ${sec}` : ""}${open ? `, ${open} open` : ""}`, P(q) === p && place.settingsSecOf(q) === sec && a.sec === sec && a.open === open, { p: P(q), sec: place.settingsSecOf(q), at: a });
  }
  check("?p=network alone is Warm paths in the new look (no longer Your network)", P("?p=network") === "warm");
  check("the old look keeps Your network, Integrations, and knows no short Settings address", P("?p=network", false) === "network" && P("?p=network&google=connected", false) === "network" && P("?p=integrations", false) === "integrations" && P("?p=voice", false) === null && P("?p=settings", false) === null);
  check("a section that is no section, or one of Object's own names, is no section", place.settingsSecOf("?p=settings&sec=constructor") === null && place.settingsSecOf("?p=settings&sec=nope") === null && P("?p=constructor") === null && at.atOf("?p=settings&open=toString").open === null);
  const tp = src("app/post/TradingPost.tsx");
  check("the address keeps the section and the open row (TradingPost placeUrl reads settings/at.ts atOf)", /if \(x\.p === "settings" && typeof window !== "undefined"\) \{\s*const at = settingsAtOf\(window\.location\.search\);\s*if \(at\.sec\) q\.set\("sec", at\.sec\);\s*if \(at\.open\) q\.set\("open", at\.open\);/.test(tp));
  check("the member menu's Your profile opens Settings at Profile in the new look, the sheet in the old", /ui2 \? openSettings\(openShellPage, "profile"\) : setIcpOpen\(true\)/.test(tp));
  check("the shell reads where Settings opens as it loads (pages.tsx imports settings/at)", /import "\.\.\/settings\/at";/.test(pages));
  const warm = src("app/post/network/WarmPaths.tsx");
  const cp = src("app/post/network/ConnectPanel.tsx");
  check("Warm paths and Bring in who you know link Google to Settings / Connections, not Your network", /openSettings\(c\.openPage, "conn", "google"\)/.test(warm) && /Manage or delete in Settings/.test(warm) && /href="\/\?p=settings&sec=conn&open=google"/.test(cp) && !/Open Your network/.test(warm + cp));

  /* ---------- 3. no export, no download (the owner's rule) ---------- */
  console.log("\nNo export or download anywhere in Settings");
  const all = files.map((f) => code(f)).join("\n");
  const words = files.filter((f) => !f.endsWith(".css")).flatMap((f) => wordsOf(code(f)));
  const bad = words.filter((w) => /\bexport|download|\.csv|\bCSV\b/i.test(w));
  check("no word offers an export, a download or a CSV", bad.length === 0, bad.slice(0, 5));
  check("no download link, no file made in the browser", !/\bdownload[=:]|createObjectURL|new Blob\(|\.xlsx|text\/csv/.test(all));
  check("Your account has no export row (the plan's export everything is cancelled)", !/Export everything|Export my data|Export the companies/i.test(all));

  /* ---------- 4. Connections ---------- */
  console.log("\nConnections");
  const NOW = Date.parse("2026-11-20T15:00:00Z");
  const d = (days: number) => new Date(NOW - days * 86_400_000).toISOString();
  const link = { email: "jordan@averyrevenue.example", status: "ok" as const, goneAt: null, deleteOn: null, syncedAt: d(0), connectedAt: d(30), calendar: true, contacts: true, error: null };
  const file = { at: d(2), rows: 40, matched: 12, skipped: 1 };
  const dest = (masked: string) => ({ kind: "slack" as never, masked, addedAt: d(20), lastOkAt: d(1), problem: null, broken: false, channel: "#merlin-alerts", team: "Avery Revenue", viaApp: true });
  const on = model.connRows({
    google: { configured: true, link, gmail: null, claude: null, syncing: false, companies: 9 },
    paths: { linkedin: file, csv: file },
    integ: { allowed: true, slackApp: true, slack: dest("hooks.slack.com/…/k3Qd"), webhook: dest("hooks.zapier.com/…/9xTe") },
    granola: { on: true, connected: true, last4: "4f2a", canDraft: true, connectedAt: d(5) },
    apps: [
      { id: "g1", name: "Claude", connectedAt: d(28), lastUsedAt: d(1) },
      { id: "g2", name: "Claude Code", connectedAt: d(17), lastUsedAt: d(4) },
    ],
    nowMs: NOW,
  });
  check("every source has a row: Google, the LinkedIn file, a contacts file, Slack, other tools, Granola, an agent", on.map((r) => r.key).join(",") === "google,linkedin,csv,slack,hook,granola,agent", on.map((r) => r.key));
  check("each row says what it reads, what it never does, its last activity and what it feeds", on.every((r) => r.reads.length > 10 && r.never.length > 10 && r.last && r.feeds.length > 0));
  check("connected rows can be removed, each asking first", on.every((r) => r.on && !!r.remove && r.remove.ask.endsWith(".") && !!r.remove.yes));
  check("last activity from what each source says: Google read today, Slack posted yesterday", on[0].last === "Read today" && on[3].last === "Posted yesterday", [on[0].last, on[3].last]);
  const off = model.connRows({ google: null, paths: null, integ: { allowed: true, slackApp: false, slack: null, webhook: null }, granola: { on: false, connected: false, canDraft: false }, apps: [], nowMs: NOW });
  check("Google off on this Merlin (RN_GOOGLE): no Google row; files off: no file rows; Granola off (RN_GRANOLA): no Granola row", off.map((r) => r.key).join(",") === "slack,hook,agent", off.map((r) => r.key));
  check("nothing connected: nothing to remove, and each row's button connects", off.every((r) => !r.on && r.remove === null && r.go === "Connect"));
  const fresh = model.connRows({ google: { configured: true, link: null, gmail: null, claude: null, syncing: false, companies: 0 }, paths: { linkedin: null, csv: null }, integ: null, granola: null, apps: null, nowMs: NOW });
  check("a first visit: Google and the LinkedIn file are step 3 of getting started", fresh[0].since === "Step 3 of getting started" && fresh[1].since === "Step 3 of getting started" && fresh[1].go === "Add the file");
  check("LinkedIn only as the member's own connections file", on.filter((r) => /LinkedIn/.test(`${r.name} ${r.sub} ${r.reads} ${r.never}`)).every((r) => r.name === "LinkedIn connections file") && !/Sales Navigator/i.test(all));
  check("Google stays the member's own: only they see it", /Only you see it, and it never feeds another member/.test(code("Connections.tsx")) && /Seen by", "Only you"/.test(code("Connections.tsx")));
  check("each Remove is that source's own delete", JSON.stringify(model.REMOVE) === JSON.stringify({ google: { via: "google", op: "disconnect" }, linkedin: { via: "paths", op: "delete" }, csv: { via: "paths", op: "deleteCsv" }, slack: { via: "integrations", body: { op: "remove", field: "slack" } }, hook: { via: "integrations", body: { op: "remove", field: "webhook" } }, granola: { via: "granola", op: "disconnect" }, agent: { via: "oauth", op: "revoke" } }));
  check("the deletes they mirror are still those (Your network, the files, Integrations, Granola, Connected apps)", /netAct\("disconnect"\)/.test(src("app/post/network/Network.tsx")) && /pathsAct\("delete"\)/.test(cp) && /pathsAct\("deleteCsv"\)/.test(cp) && /op: "remove", field: "slack"/.test(src("app/post/Integrations.tsx")) && /op: "remove", field: "webhook"/.test(src("app/post/Integrations.tsx")) && /disconnectKey\(\)/.test(src("app/post/GranolaSection.tsx")) && /revoke: app\.id/.test(src("app/post/ConnectedApps.tsx")));
  check("the table's Remove runs runRemove(REMOVE[key])", /runRemove\(REMOVE\[r\.key\], data\.apps \?\? \[\]\)/.test(code("Connections.tsx")));
  // Each Remove, run against a recorded fetch: the request each one makes.
  const sent: { url: string; body: unknown }[] = [];
  const realFetch = globalThis.fetch;
  globalThis.fetch = (async (url: string, init?: { body?: string }) => {
    sent.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : null });
    const u = String(url);
    const view = u.includes("/api/integrations/granola") ? { status: { on: true, connected: false, canDraft: true }, message: "Granola is disconnected." } : u.includes("/api/integrations/google") || u.includes("/api/paths") ? { view: { on: false }, message: "Deleted." } : { message: "Deleted." };
    return new Response(JSON.stringify(view), { status: 200, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
  const { runRemove } = await import("../app/post/settings/calls.ts");
  const want: Record<string, { url: string; body: unknown }[]> = {
    google: [{ url: "/api/integrations/google", body: { op: "disconnect" } }],
    linkedin: [{ url: "/api/paths", body: { op: "delete" } }],
    csv: [{ url: "/api/paths", body: { op: "deleteCsv" } }],
    slack: [{ url: "/api/integrations", body: { op: "remove", field: "slack" } }],
    hook: [{ url: "/api/integrations", body: { op: "remove", field: "webhook" } }],
    granola: [{ url: "/api/integrations/granola/disconnect", body: {} }],
    agent: [
      { url: "/api/oauth/apps", body: { revoke: "g1" } },
      { url: "/api/oauth/apps", body: { revoke: "g2" } },
    ],
  };
  for (const k of at.CONN_KEYS) {
    sent.length = 0;
    const r = await runRemove(model.REMOVE[k], [{ id: "g1" }, { id: "g2" }]);
    // A delete of the files reads who you know again: only the delete itself counts here.
    const posts = sent.filter((x) => x.body !== null);
    check(`Remove ${k}: ${want[k].map((w) => `POST ${w.url} ${JSON.stringify(w.body)}`).join(", ")}`, r.ok && JSON.stringify(posts) === JSON.stringify(want[k]), posts);
  }
  globalThis.fetch = realFetch;

  /* ---------- 5. Your setup ---------- */
  console.log("\nYour setup");
  const none = model.setupMeter({ headline: false, icp: false, seats: 0, source: false, voice: false, sig: false, alert: false });
  check("nothing done: 0 of 7, next is the ideal client", none.text === "0 of 7 done" && none.of === 7 && none.next?.key === "ideal" && none.note.startsWith("Next: say who you want as clients."), none);
  check("the seven: profile, ideal client, seats, a source, voice, signature, alerts", none.items.map((i) => i.key).sort().join(",") === "alerts,ideal,profile,seats,sig,source,voice");
  const some = model.setupMeter({ headline: true, icp: true, seats: 2, source: false, voice: false, sig: false, alert: true });
  check("four done: 4 of 7, next is bringing in who you know (Connections)", some.done === 4 && some.next?.key === "source" && "sec" in some.next.go && some.next.go.sec === "conn", some);
  const noSig = model.setupMeter({ headline: true, icp: true, seats: 1, source: true, voice: true, sig: null, alert: true });
  check("signing not on the plan: it isn't counted, 6 of 6 and all set", noSig.text === "6 of 6 done" && noSig.next === null && noSig.note === "All set. Nothing is waiting on you.", noSig);
  const seatsNext = model.setupMeter({ headline: false, icp: true, seats: 0, source: true, voice: false, sig: false, alert: false });
  check("seats and alerts go to their pages", seatsNext.next?.key === "seats" && JSON.stringify(seatsNext.next.go) === JSON.stringify({ page: "seats" }) && JSON.stringify(seatsNext.items.find((i) => i.key === "alerts")?.go) === JSON.stringify({ page: "alerts" }));
  check("the page counts from what the member has (headline, ideal client, seats, sources, voice, saved signature, an alert on)", /headline: !!me\.headline\?\.trim\(\)/.test(page) && /seats: c\.shell\.seats\.length/.test(page) && /alert: \(me\.savedViews \?\? \[\]\)\.some\(alertOn\)/.test(page) && /sig: canClose \?/.test(page));

  /* ---------- 6. Notifications ---------- */
  console.log("\nNotifications: the same switches as Alerts and workflows");
  const am = await import("../app/post/alerts/model.ts");
  const meN = { savedViews: [{ id: "v1", name: "Sales-led SaaS", place: "v=all", criteria: {}, email: true, alert: { on: true, triggers: ["role"], every: "daily", email: true, slack: false, bell: true } }], digest: true, messageEmail: true, peerEmail: true, radarEmail: "daily", radarSlack: true, function: "Sales", plan: { name: "trial", canClose: true } } as never;
  const integ = { allowed: true, slackApp: false, function: "Sales", savedViews: 1, slack: dest("x"), webhook: null, alerts: { roles: true, message: true, seat: true } } as never;
  const close = { open: true, email: true, slack: true, items: [], prefs: { opened: { email: true, slack: false, app: true } } } as never;
  const groups = am.alertGroups({ me: meN, email: true, digest: true, integ, close, alerts: null, starters: [], nowMs: NOW });
  const rows = model.notifRows(groups);
  check("the grid: every event with a home of its own, lists left to Alerts and workflows", rows.length > 6 && !rows.some((r) => r.kind === "list" || r.kind === "starter") && ["radar", "digest", "follows", "known", "message", "peer", "seat", "proposal"].every((k) => rows.some((r) => r.kind === k)), rows.map((r) => r.kind));
  check("the lists' line counts the list alerts", model.listsLine(groups) === "1 of 1 list has an alert on.", model.listsLine(groups));
  const R = (k: string) => rows.find((r) => r.kind === k)!;
  const calls: [string, unknown, unknown][] = [
    ["Crystal Ball email off", model.chipCall(R("radar"), "email", false), { via: "act", action: { type: "settings", radarEmail: "off" } }],
    ["Crystal Ball in Slack off", model.chipCall(R("radar"), "slack", false), { via: "act", action: { type: "settings", radarSlack: false } }],
    ["the weekly roles email off", model.chipCall(R("digest"), "email", false), { via: "act", action: { type: "settings", digest: false } }],
    ["the weekly roles in Slack off", model.chipCall(R("digest"), "slack", false), { via: "integrations", body: { op: "alerts", roles: false } }],
    ["Companies you follow in Slack on", model.chipCall(R("follows"), "slack", true), { via: "act-fixed", action: { type: "alerts.fixed", key: "follows", slack: true, on: true } }],
    ["Someone you know changed jobs by email off", model.chipCall(R("known"), "email", false), { via: "act-fixed", action: { type: "alerts.fixed", key: "known", email: false } }],
    ["message emails off", model.chipCall(R("message"), "email", false), { via: "act", action: { type: "settings", messageEmail: false } }],
    ["messages in Slack off", model.chipCall(R("message"), "slack", false), { via: "integrations", body: { op: "alerts", message: false } }],
    ["peer emails off", model.chipCall(R("peer"), "email", false), { via: "act", action: { type: "settings", peerEmail: false } }],
    ["a proposal opened, the bell off", model.chipCall(R("proposal"), "bell", false), { via: "close", kind: rows.find((r) => r.kind === "proposal")!.proposal, channel: "app", on: false }],
  ];
  for (const [name, got, w] of calls) check(`${name}: ${JSON.stringify(w)}`, JSON.stringify(got) === JSON.stringify(w), got);
  check("a switch that can't move makes no call (always in the bell, Pro's, Slack not connected)", model.chipCall(R("radar"), "bell", false) === null && model.chipCall(R("peer"), "slack", true) === null && model.chipCall(R("seat"), "slack", false) === null);
  const alertsSrc = src("app/post/alerts/Alerts.tsx");
  check("Alerts and workflows still makes those same calls (one home for each switch)", /radarEmail: on \? "daily" : "off"/.test(alertsSrc) && /radarSlack: on/.test(alertsSrc) && /integOp\(\{ op: "alerts", roles: on \}\)/.test(alertsSrc) && /integOp\(\{ op: "alerts", message: on \}\)/.test(alertsSrc) && /integOp\(\{ op: "alerts", seat: on \}\)/.test(alertsSrc) && /type: "alerts\.fixed", key/.test(alertsSrc) && /ch\.key === "bell" \? "app" : ch\.key/.test(alertsSrc));
  check("the grid reads Alerts and workflows' own rows (alertGroups), nothing stored of its own", /alertGroups\(\{ me, email: !!c\.view\.email/.test(page) && !/localStorage|sessionStorage/.test(all));
  check("Crystal Ball's how often is the same setting", model.RADAR_FREQ.map((f) => f.key).join(",") === "daily,twice,weekly,off" && /action: \{ type: "settings", radarEmail: v \}/.test(page));

  /* ---------- 7. the sample note ---------- */
  console.log("\nVoice: the sample note");
  const { NEUTRAL_VOICE } = await import("../lib/voice.ts");
  const base = { ...NEUTRAL_VOICE, signoff: "Best," as const, phrases: [] as string[] };
  const n1 = model.sampleNote(base, { name: "Jordan Avery", fn: "Sales" });
  check("to a made-up person at a made-up company, signed with the first name", n1.startsWith("Hi Dana,") && n1.includes("Cedar and Pine") && n1.endsWith("Best,\nJordan"), n1);
  const n2 = model.sampleNote({ ...base, contractions: false, greeting: "none", signoff: "none", name: "full", length: "medium", formality: "formal", opener: "smalltalk", phrases: ["No rush at all"] }, { name: "Jordan Avery", fn: "RevOps" });
  check("the picks show: no contractions, no greeting, formal, longer, small talk, a phrase, the full name", !/I've|I'd|It's/.test(n2) && n2.includes("I have led RevOps") && !n2.startsWith("Hi") && n2.includes("Would you be open") && n2.includes("Northwind Clinics") && n2.includes("I hope the quarter") && n2.includes("No rush at all.") && n2.endsWith("Jordan Avery"), n2);
  check("the sample says it is an example", /Example · To Dana, CEO at Cedar and Pine/.test(page));

  /* ---------- 8. the words ---------- */
  console.log("\nThe words");
  const flat = words.filter((w) => w !== "!" && !/\$\{bang\}/.test(w));
  check("no exclamation marks, no dashes as punctuation", words.length > 200 && !flat.some((w) => /!|—|–| - /.test(w)), flat.filter((w) => /!|—|–| - /.test(w)).slice(0, 4));
  check("never Anthropic; Claude only as an app the member connects", !/Anthropic/.test(all) && words.filter((w) => /Claude/.test(w)).every((w) => /such as Claude|Claude, ChatGPT|Claude or another agent|"Claude"|Claude Code/.test(`"${w}"`) || /Connect Claude/.test(w)), words.filter((w) => /Claude/.test(w)));
  check("the volt is never used here (nothing on Settings earns)", !/volt|#2ee59d/i.test(code("settings.css")) && !/btn-volt/.test(all));

  /* ---------- 9. drawn on the server ---------- */
  console.log("\nEvery section, drawn for a made-up member");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { AppCtxProvider } = await import("../app/post/shell/pages.tsx");
  const { SettingsPage } = await import("../app/post/settings/SettingsPage.tsx");
  const noop = () => {};
  const member = {
    id: "mem_jordan", name: "Jordan Avery", email: "jordan@averyrevenue.example", title: "Fractional VP Sales", function: "Sales", goal: null, onboarded: true, credits: 25, earned24h: 0, earnCap: 25, earnResetsAt: null, held: 0, admin: false, token: "tok_example", inviteCode: "INV", invited: 0, invitesPaid: 0, invitePending: false, added: 4, unlocked: 2, digest: true, proInterest: false, benchRates: [],
    icp: { industries: ["SaaS"], employees: [], revenue: [], countries: ["United States"] }, headline: "I build the first repeatable sales motion for software companies.", city: "Denver, Colorado", fractionals: true, savedViews: [], ui2: true,
    plan: { name: "trial", trialEndsAt: d(-16), trialDaysLeft: 16, trialExtended: false, hadTrial: true, ending: false, proUntil: null, interval: null, cancelAt: null, pause: null, pausedFrom: null, pausedUntil: null, subscribed: false, portal: false, firstChargeAt: null, proStartsAt: null, topup: true, notLooking: false, annualLine: null, prices: { month: 59, year: 590, closeMonth: 79, closeYear: 790, topup: 10, topupCredits: 25, proCredits: 0 }, tier: "close", keep: "close", canClose: true },
    proOpens: { left: 12, of: 15 },
  };
  const table = { since: null, filters: {}, setFilters: noop, setRecordType: noop, setTab: noop };
  const app = { view: { companies: [], email: true, ledger: [], scan: { digest: true } }, me: member, act: async () => ({ ok: true, message: "" }), refresh: async () => {}, infos: [], byId: new Map(), waiting: false, phone: false, ui2: true, page: "settings", openCompany: noop, openPage: noop, hrefOf: (p: string) => `/?p=${p}`, toBase: noop, openAdd: noop, openSeats: noop, openProfile: noop, table, shell: { seats: [] }, headerActions: null, start: { stripOff: () => false, dismissStrip: noop, run: noop, six: { of: 6 } } };
  const text = (x: string) => x.replace(/<[^>]+>/g, " ").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/\s+/g, " ");
  const draw = (ctx: unknown) => renderToStaticMarkup(React.createElement(AppCtxProvider, { value: ctx as never }, React.createElement(SettingsPage)));
  const expect: Record<string, RegExp[]> = {
    profile: [/One line about you/, /YOUR CARD IN FRACTIONALS/, /Save profile/],
    ideal: [/Your function/, /Industries/, /WHAT THIS CHANGES/, /Save ideal client/],
    voice: [/Greeting/, /Opens with/, /SAMPLE NOTE IN YOUR VOICE/, /Example · To Dana/],
    conn: [/aria-label="Connections"/, /Slack/, /Other tools/, /An agent, such as Claude/, /What it feeds/],
    notif: [/Crystal Ball email/, /aria-label="What Merlin sends you"/, /Open Alerts and workflows/, /WHERE IT GOES/],
    sig: [/HOW IT IS USED/],
    priv: [/Show me in the Fractionals directory/, /Hide my name on my seats/, /Open to leads/],
    agents: [/Open Agent access/],
    plan: [/Compare plans/, /Credits and usage/, /Your trial · 16 days left/],
    data: [/Your sign-in link/, /Where your data goes/, /Close your account/],
  };
  for (const k of keys) {
    at.openSettings(noop, k);
    const html = draw(app);
    const t = text(html);
    const miss = expect[k].filter((re) => !re.test(html) && !re.test(t));
    check(`${model.secName(k)}: its title, the setup meter, the section list, and what it shows`, new RegExp(`<h1 id="st-h">${model.secName(k)}</h1>`).test(html) && /Your setup/.test(t) && /aria-current="page"/.test(html) && miss.length === 0, miss.map(String));
    check(`  ${model.secName(k)}: no export or download`, !/\bexport|download/i.test(t));
  }
  const phone = text(draw({ ...app, phone: true }));
  check("a phone opens on the list: Your setup and every section, no section yet", /Your setup/.test(phone) && model.SECTIONS.every((s) => phone.includes(s.name)) && !/id="st-h"/.test(draw({ ...app, phone: true })));
  at.openSettings(noop, "conn");
  const ph2 = draw({ ...app, phone: true });
  check("a phone with a section: the way back to the list", /All settings/.test(text(ph2)) && /<h1 id="st-h">Connections<\/h1>/.test(ph2));
  const firstRun = text(draw({ ...app, me: { ...member, icp: null, headline: undefined } }));
  const signUp = draw({ ...app, me: { ...member, headline: undefined } });
  check("just signed up (an ideal client from sign-up, nothing else yet): the strip, Ideal client first, From your sign-up answers", /What Settings is for\./.test(text(signUp)) && /<h1 id="st-h">Ideal client<\/h1>/.test(signUp) && /From your sign-up answers/.test(text(signUp)));
  const inUse = draw(app);
  check("in use (a one line on file): no strip, Connections first", !/What Settings is for\./.test(text(inUse)) && /<h1 id="st-h">Connections<\/h1>/.test(inUse));
  check("a first visit opens on Ideal client, with the strip that says what Settings is for", /What Settings is for\./.test(firstRun) && /Ideal client/.test(firstRun) && /Next: say who you want as clients/.test(firstRun), firstRun.slice(0, 300));
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
