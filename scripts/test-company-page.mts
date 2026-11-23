/**
 * Checks of the company page (app/post/company/CompanyPage.tsx, the new look's record) and the
 * private notes on a company (lib/companyNotes.ts). No server: lib/table.ts runs in process on a
 * made-up seed in a temporary data dir, with fetch replaced, so nothing leaves the machine.
 *
 *   npx tsx scripts/test-company-page.mts      exits 1 on any failure
 *
 * Covered:
 *  - notes, pure: the text is cleaned and cut on a whole character, the limits, change and remove,
 *    a removed company takes its notes, two records folded keep both sets newest first;
 *  - notes, through the action and GET ?notes=: any company on file, open or locked; only their
 *    writer reads them (another member gets none, the view, the connector's get_company and the
 *    admin export carry no word of them); refused in plain words; purgeMember deletes them;
 *  - the page's rules (companyModel.ts): the timeline never draws a guessed month (a year only is
 *    that year, a locked end is a mark at the start), the tab a record opens at, the stage's
 *    primary action, the next move at a locked company;
 *  - the page: a first visit's Example note is labelled and never sent; the tabs, the tab panel
 *    and the title that takes focus; the notes box keeps its text on Esc;
 *  - focus and Esc order (the code that does it, checked in the browser on a test server too):
 *    the person, a form, the spend question and a note being changed each take Esc before the
 *    page, the page then closes and focus goes back to the row it was opened from;
 *  - the registry: company2 draws in place of the list on wider screens in the new look; phones
 *    and the old look keep the drawer, which draws the same sections.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import Module, { register } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

// The pages import their stylesheets: in this process a stylesheet is nothing.
(Module as unknown as { _extensions: Record<string, (m: { exports: unknown }) => void> })._extensions[".css"] = (m) => {
  m.exports = {};
};
register(`data:text/javascript,${encodeURIComponent('export async function load(url, ctx, next) { return /\\.css(\\?|$)/.test(url) ? { format: "module", source: "", shortCircuit: true } : next(url, ctx); }')}`);

const ROOT = path.join(path.dirname(new URL(import.meta.url).pathname), "..");
const dir = mkdtempSync(path.join(tmpdir(), "rn-copage-"));
const BASE = "https://post.example.com";
const DAY = 86_400_000;
const NOW = Date.now();
const ago = (days: number) => new Date(NOW - days * DAY).toISOString();

/* ---------- the made-up seed ---------- */
const CO = {
  north: { id: "c_northwind", name: "Northwind Clinics", site: "northwind-clinics.example" },
  cedar: { id: "c_cedarpine", name: "Cedar and Pine", site: "cedarandpine.example" },
  halc: { id: "c_halcyon", name: "Halcyon Freight", site: "halcyon-freight.example" },
  lark: { id: "c_larkspur", name: "Larkspur Learning", site: "larkspur-learning.example" },
};
const seat = (id: string, companyId: string, fields: Record<string, string>) => ({ id, companyId, fields, verified: false });
const seed = {
  builtAt: ago(10),
  members: [
    { id: "mem_jordan", name: "Jordan Avery", email: "jordan@example.com", title: "Fractional VP Sales", token: "tok-jordan-page" },
    { id: "mem_riley", name: "Riley Moss", email: "riley@example.com", title: "Fractional CMO", token: "tok-riley-page" },
    { id: "mem_admin", name: "Avery Admin", email: "admin-page@example.com", title: "Admin", token: "tok-admin-page" },
  ],
  companies: [
    { id: CO.north.id, fields: { name: CO.north.name, website: CO.north.site, industry: "Health care", employees: "51–200", hq: "Portland, OR" } },
    { id: CO.cedar.id, fields: { name: CO.cedar.name, website: CO.cedar.site, industry: "SaaS", employees: "51–200", hq: "Seattle, WA" } },
    { id: CO.halc.id, fields: { name: CO.halc.name, website: CO.halc.site, industry: "Logistics", hq: "Denver, CO" } },
    { id: CO.lark.id, fields: { name: CO.lark.name, website: CO.lark.site, industry: "EdTech", hq: "Austin, TX" } },
  ],
  engagements: [
    seat("e_north_cfo", CO.north.id, { source: "Member success story", function: "Finance", role: "Fractional CFO", type: "Fractional", status: "Ended", start: "2023-02", end: "2024-01", operator: "Pat Example" }),
    seat("e_cedar_cmo", CO.cedar.id, { source: "Seat scan", function: "Marketing", role: "Fractional CMO", type: "Fractional", status: "Active", start: "2025-06", end: "Ongoing" }),
    seat("e_halc_cro", CO.halc.id, { source: "Member success story", function: "Sales", role: "Fractional CRO", type: "Fractional", status: "Ended", start: "2024", end: "2025-03", operator: "Jordan Avery" }),
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_ADMIN_EMAILS: "admin-page@example.com",
  RN_PUBLIC_URL: BASE,
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_BILLING", "RN_UI2"]) delete process.env[k];
// As before Stage 9 made the new look the default: the server's view here is the old look's (the page itself is checked by its own props).
process.env.RN_UI2 = "off";
globalThis.fetch = (async () => new Response("{}", { status: 200 })) as typeof fetch;

let passes = 0;
let failures = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail).slice(0, 600)}`}`);
};
const src = (rel: string) => readFileSync(path.join(ROOT, rel), "utf8");

async function main() {
  const N = await import("../lib/companyNotes");
  const T = await import("../lib/table");
  const pub = T.tableInternals.pubId;
  const act = async (token: string, a: Parameters<typeof T.perform>[1]) => {
    try {
      return { ok: true as const, r: await T.perform(token, a, BASE) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  };

  /* ---------- notes, pure ---------- */
  console.log("Notes, the rules");
  check("the text is trimmed, control characters go, blank runs shrink, a line break stays", N.cleanNote("  a\u0000b​\n\n\n\nc\t ") === "ab\n\nc");
  check("empty or not text is nothing", N.cleanNote("   ") === null && N.cleanNote(42) === null && N.cleanNote(null) === null);
  const long = "é".repeat(N.COMPANY_NOTE_LIMITS.chars - 1) + "😀😀";
  const cut = N.cleanNote(long)!;
  check("a long note is cut at the limit on a whole character", [...cut].length === N.COMPANY_NOTE_LIMITS.chars && !cut.includes("😀\ud83d") && cut.endsWith("😀"));
  const all: Record<string, Record<string, { id: string; at: string; text: string; edited?: string }[]>> = {};
  N.addNote(all, "m1", "c1", "first", ago(2), "n1");
  N.addNote(all, "m1", "c1", "second", ago(1), "n2");
  check("newest first", N.notesOf(all, "m1", "c1").map((n) => n.text).join() === "second,first");
  N.editNote(all, "m1", "c1", "n1", "first, changed", ago(0));
  check("a change keeps its day and says when it changed", all.m1.c1[1].text === "first, changed" && !!all.m1.c1[1].edited && all.m1.c1[1].at === ago(2));
  let refused = "";
  try {
    N.editNote(all, "m1", "c1", "nope", "x", ago(0));
  } catch (e) {
    refused = (e as Error).message;
  }
  check("a note that isn't there: said plainly", refused === N.NOTE_GONE);
  for (let k = 0; k < N.COMPANY_NOTE_LIMITS.perCompany - 2; k++) N.addNote(all, "m1", "c1", `n${k}`, ago(0), `x${k}`);
  refused = "";
  try {
    N.addNote(all, "m1", "c1", "one more", ago(0), "over");
  } catch (e) {
    refused = (e as Error).message;
  }
  check(`at ${N.COMPANY_NOTE_LIMITS.perCompany} notes on a company, the next is refused with what to do`, refused === N.NOTE_FULL && all.m1.c1.length === N.COMPANY_NOTE_LIMITS.perCompany);
  const two: typeof all = { m1: { a: [{ id: "1", at: ago(3), text: "old" }], b: [{ id: "2", at: ago(1), text: "new" }] }, m2: { a: [{ id: "3", at: ago(1), text: "theirs" }] } };
  N.mergeCompany(two, "a", "b");
  check("two records of one company folded: each member's notes join, newest first", two.m1.b.map((n) => n.text).join() === "new,old" && !two.m1.a && two.m2.b[0].text === "theirs");
  N.forgetCompany(two, "b");
  check("a removed company takes its notes, and an empty member part goes", JSON.stringify(two) === "{}");
  N.removeNote(all, "m1", "c1", "n2");
  check("remove", !all.m1.c1.some((n) => n.id === "n2"));

  /* ---------- notes, through the action ---------- */
  console.log("\nNotes, through Merlin");
  const J = "tok-jordan-page";
  const R = "tok-riley-page";
  const vJ0 = await T.buildView(J);
  const cedar = vJ0.companies.find((c) => c.id === pub(CO.cedar.id))!;
  check("(Cedar and Pine is locked for Jordan)", !!cedar && !!cedar.hidden);
  const TEXT = "Dana wants the founder out of every deal by Q2. Budget for one senior hire.";
  const a1 = await act(J, { type: "companyNote", op: "add", companyId: cedar.id, text: TEXT });
  check("a note on a locked company is kept, and the answer is the company's notes", a1.ok && a1.r.notes?.length === 1 && a1.r.notes[0].text === TEXT && /Only you see it/.test(a1.r.message), a1);
  const got = await T.companyNotesFor(J, cedar.id);
  check("GET ?notes= reads them back", got?.notes.length === 1 && got.notes[0].text === TEXT);
  check("another member reads none of them", (await T.companyNotesFor(R, cedar.id))?.notes.length === 0);
  check("signed out: null; an id that names no company: undefined", (await T.companyNotesFor(null, cedar.id)) === null && (await T.companyNotesFor(J, "c_nothing_here")) === undefined && (await T.companyNotesFor(J, pub("e_cedar_cmo"))) === undefined);
  const e1 = await act(J, { type: "companyNote", op: "add", companyId: cedar.id, text: "   " });
  const e2 = await act(J, { type: "companyNote", op: "remove", companyId: cedar.id, noteId: "n_nope" });
  const e3 = await act(J, { type: "companyNote", op: "add", companyId: "c_nothing_here", text: "x" });
  const e4 = await act(J, { type: "companyNote", op: "shout" as never, companyId: cedar.id, text: "x" });
  check("refused in plain words: an empty note, a note that isn't there, a company that isn't, an unknown op", !e1.ok && e1.error === N.NOTE_EMPTY && !e2.ok && e2.error === N.NOTE_GONE && !e3.ok && !e4.ok, [e1, e2, e3, e4]);
  const id1 = a1.ok ? a1.r.notes![0].id : "";
  const a2 = await act(J, { type: "companyNote", op: "edit", companyId: cedar.id, noteId: id1, text: `${TEXT} Call after Jan 20.` });
  check("change one", a2.ok && a2.r.notes?.[0].text.endsWith("Call after Jan 20.") && !!a2.r.notes?.[0].edited);
  const a3 = await act(R, { type: "companyNote", op: "remove", companyId: cedar.id, noteId: id1 });
  check("another member can't remove it (it isn't theirs to find)", !a3.ok && a3.error === N.NOTE_GONE && (await T.companyNotesFor(J, cedar.id))!.notes.length === 1);
  const north = vJ0.companies.find((c) => c.id === pub(CO.north.id))!;
  await act(J, { type: "companyNote", op: "add", companyId: north.id, text: "Northwind: the COO hires the seat." });
  const words = ["Dana wants the founder", "Northwind: the COO"];
  const has = (x: unknown) => words.some((w) => JSON.stringify(x).includes(w));
  check("no word of them in Jordan's own view, nor Riley's", !has(await T.buildView(J)) && !has(await T.buildView(R)));
  const tools = await import("../lib/mcp/tools");
  const jordan = (await T.memberForToken(J))!;
  const gc = await tools.getCompany({ member: jordan, origin: BASE }, { company: north.id }).catch((e: Error) => e.message);
  check("nor in the connector's get_company", !has(gc), JSON.stringify(gc).slice(0, 200));
  const ex = await T.exportState();
  check("the admin export leaves the whole part out", !("companyNotes" in ex) && !has(ex));
  const s0 = await T.loadState();
  check("kept by member and internal company id", s0.companyNotes?.mem_jordan?.[CO.cedar.id]?.length === 1 && s0.companyNotes?.mem_jordan?.[CO.north.id]?.length === 1);
  const rm = await act(J, { type: "companyNote", op: "remove", companyId: north.id, noteId: (await T.companyNotesFor(J, north.id))!.notes[0].id });
  check("removing the last note on a company leaves nothing behind for it", rm.ok && !(await T.loadState()).companyNotes?.mem_jordan?.[CO.north.id]);
  await act(R, { type: "companyNote", op: "add", companyId: cedar.id, text: "Riley's own." });
  const A = await import("../lib/account");
  await A.closeAccount(J, { origin: BASE });
  const closedAt = Date.parse((await T.loadState()).closures!.mem_jordan.at);
  await A.purgeDue(closedAt + 30 * DAY + 60_000);
  const s1 = await T.loadState();
  check("closing an account deletes its notes 30 days on (purgeMember); another member's stay", !s1.companyNotes?.mem_jordan && s1.companyNotes?.mem_riley?.[CO.cedar.id]?.[0].text === "Riley's own.", s1.companyNotes);

  /* ---------- the page's rules ---------- */
  console.log("\nThe page's rules");
  const Mo = await import("../app/post/company/companyModel");
  const M = await import("../app/post/model");
  const cell = (v: string) => ({ s: "value" as const, v, ver: 0 });
  const lockedCell = { s: "locked" as const, ver: 0 };
  const eng = (id: string, cells: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({ id, source: "Seat scan", verified: false, cells, people: [], updatedAt: null, yours: false, ...extra });
  const co = (engagements: unknown[]) =>
    M.deriveAll([
      { id: "c_x", name: "Halcyon Freight", iconDomain: null, cells: {}, friendly: { score: 0, tier: null, fractional: 0, functions: [], open: 0, repeat: false }, engagements, people: [], following: false, facts: { known: 0, locked: 0, missing: 0 }, updatedAt: null, mine: false } as never,
    ])[0];
  const now = Date.UTC(2026, 10, 23);
  const info = co([
    eng("e1", { function: cell("Finance"), role: cell("Fractional CFO"), start: cell("2026-03"), end: cell("Ongoing"), status: cell("Active") }),
    eng("e2", { function: cell("Marketing"), role: cell("Fractional CMO"), start: cell("2024-01"), end: cell("2025-02"), status: cell("Ended") }),
    eng("e3", { function: cell("Finance"), role: cell("Fractional CFO"), start: cell("2022-06"), end: lockedCell, status: cell("Ended") }),
    eng("e4", { function: cell("Sales"), role: cell("Fractional VP Sales"), start: cell("2023"), status: cell("Ended") }),
    eng("e5", { function: cell("Ops"), role: cell("Fractional COO") }),
    eng("e6", { function: cell("RevOps"), role: cell("Fractional RevOps lead"), status: cell("Open role") }, { opened: "2026-11-16", closed: null }),
  ]);
  const tl = Mo.timelineOf(info, now, (m) => m);
  const bar = (id: string) => tl.bars.find((b) => b.id === id)!;
  const month = 1 / (tl.years.length * 12);
  check("the timeline runs from the first year on file to this year", tl.years[0] === 2022 && tl.years.at(-1) === 2026, tl.years);
  check("a seat still going runs to now, a seat that ended to its end month", bar("e1").kind === "going" && Math.abs(bar("e1").left + bar("e1").width - (Mo.monthOf("2026-11")!.m + 1 - 2022 * 12) * month) < 1e-9 && bar("e2").kind === "ended" && Math.abs(bar("e2").width - 14 * month) < 1e-9);
  check("a locked end is a mark at the start, never a bar of a length nobody paid to see", bar("e3").kind === "endLocked" && Math.abs(bar("e3").width - month) < 1e-9 && /end locked/.test(bar("e3").when));
  check("a year only is that whole year, never a guessed month", bar("e4").kind === "year" && Math.abs(bar("e4").width - 12 * month) < 1e-9 && bar("e4").when.startsWith("2023"));
  check("a seat with no start is left out; an open role is a mark at the day it was listed", !tl.bars.some((b) => b.id === "e5") && bar("e6").kind === "open" && /Listed 2026-11/.test(bar("e6").when));
  check("no bar runs past now", tl.bars.every((b) => b.left + b.width <= 1 + 1e-9));
  check("a record opens at its focus's tab: a seat, a listed role, a person, else Overview", Mo.tabFor(info, "e2") === "seats" && Mo.tabFor(info, "e6") === "roles" && Mo.tabFor(info, null) === "overview" && Mo.tabFor(info, "nobody") === "overview");
  check("the primary action follows the stage", Mo.primaryFor(null).go === "add" && Mo.primaryFor("reach").go === "ways" && Mo.primaryFor("meeting").go === "proposals" && Mo.primaryFor("won").go === "seat" && Mo.primaryFor("lost").go === "pipeline");
  const hiddenInfo = M.deriveAll([{ ...info.c, hidden: true }])[0];
  const nm = Mo.nextMoveOf(hiddenInfo, null, { freeOpen: true });
  check("at a locked company the next move is to open it, free when it is, in three steps", nm.title === "Open this company" && /free for you today/.test(nm.body) && nm.steps?.length === 3 && nm.go === "open");
  check("the fill counts read a lock as on file", Mo.fillOf([cell("a"), lockedCell, { s: "empty" } as never, undefined]) === "2 of 4");

  /* ---------- the page ---------- */
  console.log("\nThe page");
  const React = await import("react");
  (globalThis as { React?: unknown }).React = React;
  const { renderToStaticMarkup } = await import("react-dom/server");
  const { CompanyRecord } = await import("../app/post/company/CompanyPage");
  const { UiCtx, CellUiCtx } = await import("../app/post/ui");
  const vR = await T.buildView(R);
  const noop = () => {};
  const uiFor = (me: unknown) => ({ me, act: async () => ({ ok: true, message: "" }), layout: "desktop", busy: new Set(), flash: new Set(), pulse: null, unlock: noop, unlockMany: async () => true, edit: noop, fill: async () => true, openCompany: noop, openAdd: noop, isHidden: () => true, holdsSeat: () => false, addable: () => [], seats: { n: 0, missing: 0 }, openSeats: noop, openPage: noop, contact: null });
  const page = (i: unknown, tab: string, first: boolean) =>
    renderToStaticMarkup(React.createElement(UiCtx.Provider, { value: uiFor(vR.me) as never }, React.createElement(CellUiCtx.Provider, { value: uiFor(vR.me) as never }, React.createElement(CompanyRecord, { i, focus: null, pos: null, onClose: noop, onStep: noop, crumbs: [{ label: "Companies" }], first, startTab: tab } as never))));
  const rInfo = M.deriveAll(vR.companies).find((i) => i.c.id === pub(CO.cedar.id))!;
  const notesFirst = page(rInfo, "notes", true);
  const notesLater = page(rInfo, "notes", false);
  check("Notes and activity: the box, its label, and that only the member sees them", /<label[^>]*for="co-note-new"[^>]*>Add a note<\/label>/.test(notesFirst) && /Private\. Only you see them\./.test(notesFirst));
  check("the strip says what the page is for on a first visit, at a locked company", /What this page is for\./.test(notesFirst) && !/What this page is for\./.test(notesLater));
  check("the page's tabs: seven, one selected, roving tabindex, and the panel labelled by it", (notesFirst.match(/role="tab"/g) ?? []).length === 7 && (notesFirst.match(/aria-selected="true"/g) ?? []).length === 1 && /id="co-tab-notes"[^>]*aria-selected="true"[^>]*tabindex="0"/.test(notesFirst) && /role="tabpanel" aria-labelledby="co-tab-notes"/.test(notesFirst));
  check("the header: the breadcrumb, Previous and Next with their keys, and Back (Esc)", /aria-label="Breadcrumb"/.test(notesFirst) && /title="Previous in the list \(K\)"/.test(notesFirst) && /title="Next in the list \(J\)"/.test(notesFirst) && /title="Back to the list \(Esc\)"/.test(notesFirst));
  const parts = src("app/post/company/parts.tsx");
  check("a first visit's Example note says Example and that it isn't saved, and is never sent (no action carries it)", /co-example/.test(parts) && /It isn&apos;t saved/.test(parts) && !/act\("add", \{ text: "The CEO wants/.test(parts));
  check("Closest evidence shows on Close only (Evidence Bank is Close)", /\{closeOn && <EvidenceCard companyId=\{i\.c\.id\}/.test(src("app/post/company/CompanyPage.tsx")) && !/Evidence Bank is coming/.test(parts));
  check("…the member's closest case with its match and why, or the way to the first case (step 6)", /useClosest\(\[companyId\], true\)/.test(parts) && /Closest evidence case · private/.test(parts) && /No finished case yet/.test(parts) && /No close case/.test(parts) && /Step 6\. It fills the Proof part of every proposal\./.test(parts));

  /* ---------- focus and Esc order ---------- */
  console.log("\nFocus and Esc");
  const pageSrc = src("app/post/company/CompanyPage.tsx");
  const bubbleSrc = src("app/post/PersonBubble.tsx");
  const uiSrc = src("app/post/ui.tsx");
  const tp = src("app/post/TradingPost.tsx");
  const env = src("app/post/company/sections/env.tsx");
  check("Esc inside the page is taken first by what is open there (useEscape, in the capture phase, stopping the page's own)", /window\.addEventListener\("keydown", onKey, true\)/.test(env) && /e\.stopImmediatePropagation\(\);/.test(env));
  check("the person bubble (PersonBubble, handed in by CompanyPage) takes Esc before the page, and gives focus back to the name that opened it", /<Anchored anchor=\{anchor\}/.test(bubbleSrc) && /onEscape: \(\) => closeRef\.current\(\)/.test(uiSrc) && /className=\{`tp-pop \$\{className\}`\}/.test(uiSrc) && /\.tp-pop, \.tp-modal-wrap, \.tp-sheet-wrap/.test(env) && /const target = prev && prev\.isConnected/.test(uiSrc) && /bubble=\{\(o\) => \(\s*<PersonBubble/.test(pageSrc) && !existsSync(path.join(ROOT, "app/post/company/PersonPeek.tsx")));
  check("names on the seats table open the same bubble (PersonNameButton), handed to the table by the page", /<SeatTable i=\{i\} nameOf=\{\(p, e\) => <PersonNameButton/.test(pageSrc) && !/PersonBubble/.test(src("app/post/company/parts.tsx")));
  check("Add a person, Unlock all's question, claiming a seat each take Esc first (the drawer's own, reused)", /useEscape\(true, \(\) => \{/.test(src("app/post/company/sections/People.tsx")) && /useEscape\(ask && !inSheet, cancel\)/.test(src("app/post/company/sections/Unlock.tsx")) && /useEscape\(ask, cancel\)/.test(src("app/post/company/sections/Seats.tsx")));
  check("a note being written or changed takes Esc (it keeps the text) and marks it handled, which the app's Esc respects", (parts.match(/e\.key === "Escape"/g) ?? []).length >= 2 && (parts.match(/e\.preventDefault\(\);\s*e\.stopPropagation\(\);/g) ?? []).length >= 2 && /if \(e\.defaultPrevented \|\| el === searchRef\.current\) return;/.test(tp));
  check("then Esc closes the record (the app's closeTop), and focus goes back to the row it was opened from", /else if \(drawer\) closeDrawer\(\);/.test(tp) && /\[data-row="\$\{CSS\.escape\(f\)\}"\]/.test(pageSrc) && /\[data-row="\$\{CSS\.escape\(id\)\}"\]/.test(pageSrc));
  check("the title takes focus when the page opens, when J or K step, and once the company opens", /h1\.co-name-h/.test(pageSrc) && /\}, \[c\.id, focus\]\);/.test(pageSrc) && /\}, \[c\.hidden\]\);/.test(pageSrc) && /<h1 class="co-name-h" tabindex="-1">/.test(notesFirst));
  check("the tab list moves with Left, Right, Home and End", /e\.key === "ArrowRight"/.test(pageSrc) && /e\.key === "ArrowLeft"/.test(pageSrc) && /e\.key === "Home"/.test(pageSrc) && /e\.key === "End"/.test(pageSrc));

  /* ---------- the registry ---------- */
  console.log("\nWhere it draws");
  const pages = src("app/post/shell/pages.tsx");
  check("the registry has the company page (company2), drawing its own header and strip", /company2: \{ title: "Company", component: CompanyP, ownHeader: true, ownStrip: true \}/.test(pages) && /record\?: RecordCtx \| null;/.test(pages));
  check("the app draws it in the new look on wider screens only, in place of the list, and the drawer otherwise", /const recordPage = ui2 && !phone && !!drawer && !!drawerInfo && page === "table"/.test(tp) && /\{RecordPage \? \(\s*<RecordPage \/>/.test(tp) && /page === "table" && !RecordPage && \(\s*<Drawer/.test(tp));
  check("old /?c= addresses open it: the record is the same state (drawer, ?c=) either way", /c: recordOpen \? drawer!\.id : null/.test(tp) && /place0\.c && !place0\.p/.test(tp));
  const drawer = src("app/post/Drawer.tsx");
  check("the drawer draws the same sections, from company/sections/", /from "\.\/company\/sections\/Record"/.test(drawer) && /<SeatsSection i=\{i\} focus=\{focus\} \/>/.test(drawer) && /<PeopleSection key=\{c\.id\} i=\{i\} \/>/.test(drawer) && drawer.split("\n").length < 700);

  console.log(`\n${passes} passed, ${failures} failed`);
  rmSync(dir, { recursive: true, force: true });
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  rmSync(dir, { recursive: true, force: true });
  process.exit(1);
});
