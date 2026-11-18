/**
 * Checks of saved views: rename, the same view twice, remove and put back (lib/hunt.ts), on the
 * server and through the Claude connector, which keeps the same list.
 *
 *   npx tsx scripts/test-views.mts
 *
 * No private data and no network: a made-up seed and state in a temporary folder, removed at the
 * end. Every person in them is made up.
 *
 *  1. Pure: placeKey and criteriaKey (one view however its place or criteria are written),
 *     sameView, and each savedViewAction op (save refuses a view the member has already and names
 *     it, rename keeps save's name rules, delete, restore with its id and place in the list).
 *  2. In process, through perform: the same, with the answer's id; a first view removed and put
 *     back is the first view again; onboarding's re-save (delete, then save) still works; the
 *     connector lists the new name and refuses a search it has already.
 */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${typeof detail === "string" ? detail : JSON.stringify(detail)}`.slice(0, 600)}`);
};

const dir = mkdtempSync(path.join(tmpdir(), "rn-views-"));
const seed = {
  builtAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
  members: [
    { id: "mem_vi", name: "Vi Viewsaver", email: "vi.viewsaver@example.com", title: "Fractional VP Sales", token: "tok-vi-0001" },
    { id: "mem_oz", name: "Oz Otherview", email: "oz.otherview@example.com", title: "Fractional CMO", token: "tok-oz-0001" },
  ],
  companies: [{ id: "c_view", fields: { name: "Viewpoint Labs", website: "viewpoint.example", industry: "SaaS", employees: "51–200" } }],
  engagements: [
    { id: "e_view_cfo", companyId: "c_view", fields: { source: "Published engagement", function: "Finance", role: "Fractional CFO", start: "2026-06", status: "Active", type: "Fractional" } },
  ],
  contacts: [],
};
writeFileSync(path.join(dir, "intel-seed.json"), JSON.stringify(seed));
const at0 = new Date().toISOString();
writeFileSync(
  path.join(dir, "intel.json"),
  JSON.stringify({ ledger: [], values: {}, unlocks: {}, seen: { mem_vi: at0, mem_oz: at0 }, profiles: { mem_vi: { function: "Sales", onboarded: true }, mem_oz: { function: "Marketing", onboarded: true } } }),
);
Object.assign(process.env, {
  RN_DATA_DIR: dir,
  RN_INTEL_SEED: path.join(dir, "intel-seed.json"),
  RN_STARTER_CREDITS: "25",
  RN_PUBLIC_URL: "https://post.example.com",
  RN_LOGO_LOOKUP: "off",
});
for (const k of ["RESEND_API_KEY", "RN_EMAIL_FROM", "RN_DIGEST", "RN_DIGEST_ALL", "RN_SCAN", "RN_REQUIRE_SEED", "RN_BACKUP_S3_ENDPOINT", "RN_ADMIN_EMAILS"]) delete process.env[k];
// Nothing leaves the machine.
globalThis.fetch = (async () => new Response("{}", { status: 404 })) as typeof fetch;

async function main() {
  const hunt = await import("../lib/hunt.ts");

  /* ---------- 1. pure ---------- */
  console.log("\nOne view, however it is written");
  const A = "v=all&t=companies&s=hired&f=hiredFn:Finance|Marketing~hiredWithin:6~notMine~icp";
  check("the same place with its parts in another order is the same place", hunt.placeKey(A) === hunt.placeKey("f=icp~notMine~hiredWithin:6~hiredFn:Marketing|Finance&t=companies&v=all&s=hired"));
  check("the sort doesn't make another view", hunt.placeKey(A) === hunt.placeKey(A.replace("s=hired", "s=best")) && hunt.placeKey(A) === hunt.placeKey(A.replace("s=hired&", "")));
  check("a leading ? and a search's case and spaces don't either", hunt.placeKey("?v=all&q=Acme%20%20Labs") === hunt.placeKey("v=all&q=acme labs"));
  check("another search, list, tab or filter is another place", new Set([A, A.replace("t=companies", "t=seats"), A.replace("v=all", "v=repeat"), `${A}&q=acme`, A.replace("~notMine", "")].map(hunt.placeKey)).size === 5);
  check("no filters is no filters, written either way", hunt.placeKey("v=all&f=-") === hunt.placeKey("v=all&f=") && hunt.placeKey("v=all&f=-") === hunt.placeKey("v=all"));
  check("no place is none", hunt.placeKey("") === null && hunt.placeKey(null) === null && hunt.placeKey("?") === null);
  check("one function and a list of one are the same criteria", hunt.criteriaKey({ function: "Sales" }) === hunt.criteriaKey({ functions: ["Sales"] }));
  check("lists in any order, and US or United States, are the same criteria", hunt.criteriaKey({ industry: ["SaaS", "Fintech"], country: ["US"] }) === hunt.criteriaKey({ industry: ["Fintech", "SaaS"], country: ["United States"] }));
  check("other criteria are other criteria", hunt.criteriaKey({ function: "Sales" }) !== hunt.criteriaKey({ function: "Sales", fractionalFriendly: true }) && hunt.criteriaKey({ hiredFn: ["Finance"], hiredWithin: 6 }) !== hunt.criteriaKey({ hiredFn: ["Finance"], hiredWithin: 12 }));

  console.log("\nSave refuses a view the member has already");
  let n = 0;
  const id = () => `al_test${String(++n).padStart(4, "0")}`;
  const NOW = new Date().toISOString();
  const s1 = hunt.savedViewAction([], { op: "save", name: "Finance hires", place: A, criteria: { hiredFn: ["Finance", "Marketing"], hiredWithin: 6 } }, id, NOW);
  check("a first save is saved, with its id", s1.list.length === 1 && s1.id === s1.list[0].id && s1.list[0].name === "Finance hires" && /^Saved "Finance hires"\./.test(s1.message), s1);
  const again = hunt.savedViewAction(s1.list, { op: "save", name: "Something else", place: A, criteria: { hiredFn: ["Finance", "Marketing"], hiredWithin: 6 } }, id, NOW);
  check('the same place again says "You saved this view already, as …" and returns its id', again.message === 'You saved this view already, as "Finance hires".' && again.id === s1.id && again.list === s1.list, again);
  const sorted = hunt.savedViewAction(s1.list, { op: "save", place: A.replace("s=hired", "s=name"), criteria: {} }, id, NOW);
  check("so does the same view in another sort or order", sorted.id === s1.id && sorted.list.length === 1 && hunt.savedViewAction(s1.list, { op: "save", place: "f=icp~notMine~hiredWithin:6~hiredFn:Marketing|Finance&t=companies&v=all", criteria: {} }, id, NOW).id === s1.id);
  const other = hunt.savedViewAction(s1.list, { op: "save", place: `${A}&q=acme`, criteria: { hiredFn: ["Finance", "Marketing"], hiredWithin: 6 } }, id, NOW);
  check("the same criteria with another search is another view (a view is its place)", other.list.length === 2 && other.id !== s1.id, other.message);
  const claude = [{ id: "al_claude01", name: "Sales roles at SaaS companies", function: "Sales", industry: ["SaaS"], createdAt: NOW }];
  const fromApp = hunt.savedViewAction(claude, { op: "save", place: "v=hiring&t=seats&af=1&f=fn:Sales~industry:SaaS", criteria: { functions: ["Sales"], industry: ["SaaS"] } }, id, NOW);
  check("a search saved in Claude (no place) is the same as a view with the same criteria", fromApp.id === "al_claude01" && fromApp.list.length === 1 && /as "Sales roles at SaaS companies"/.test(fromApp.message), fromApp);
  check("and a view with other criteria is not", hunt.savedViewAction(claude, { op: "save", place: "v=hiring&f=fn:Sales", criteria: { function: "Sales" } }, id, NOW).list.length === 2);
  const full = Array.from({ length: 20 }, (_, i) => ({ id: `al_full${String(i).padStart(4, "0")}`, name: `View ${i}`, createdAt: NOW, place: `v=all&q=view${i}` }));
  const dupFull = hunt.savedViewAction(full, { op: "save", place: "v=all&q=view7", criteria: {} }, id, NOW);
  check("at 20 views, the same view still answers with its id, not the limit", dupFull.id === "al_full0007" && /saved this view already/.test(dupFull.message), dupFull.message);
  const tooMany = (() => {
    try {
      hunt.savedViewAction(full, { op: "save", place: "v=all&q=new", criteria: {} }, id, NOW);
      return "saved";
    } catch (e) {
      return (e as Error).message;
    }
  })();
  check("a new one past 20 is refused as before", /20 saved views/.test(tooMany), tooMany);

  console.log("\nRename, with save's name rules");
  const r1 = hunt.savedViewAction(other.list, { op: "rename", id: s1.id, name: "  <b>Finance</b>​  hires\u0007 for Q1  " }, id, NOW);
  check("rename keeps the view and takes the new name, cleaned as save cleans it", r1.list.length === 2 && r1.list[0].id === s1.id && r1.list[0].name === "bFinance/b  hires for Q1" && r1.list[0].place === A && r1.id === s1.id, r1.list[0].name);
  check('and says "Renamed it …"', r1.message === 'Renamed it "bFinance/b  hires for Q1".', r1.message);
  check("a long name is cut to 100 characters", hunt.savedViewAction(r1.list, { op: "rename", id: s1.id, name: "x".repeat(300) }, id, NOW).list[0].name.length === 100);
  const blank = hunt.savedViewAction(r1.list, { op: "rename", id: s1.id, name: "  ​ " }, id, NOW);
  check("an empty name takes a name made from what it looks for, as save does", blank.list[0].name === "Companies that hired a fractional Finance or Marketing leader in the last 6 months", blank.list[0].name);
  const throws = (fn: () => unknown) => {
    try {
      fn();
      return "";
    } catch (e) {
      return (e as Error).message;
    }
  };
  check("renaming a view that is gone says so", throws(() => hunt.savedViewAction(r1.list, { op: "rename", id: "al_nothere", name: "x" }, id, NOW)) === "That saved view is gone already.");
  check("another op is refused in words", throws(() => hunt.savedViewAction(r1.list, { op: "shuffle" }, id, NOW)) === "Save, rename, delete or email.");

  console.log("\nRemove, and put back");
  const three = hunt.savedViewAction(r1.list, { op: "save", name: "Open Sales roles", place: "v=hiring&t=seats&f=fn:Sales", criteria: { function: "Sales" } }, id, NOW).list;
  const middle = three[1];
  const removed = hunt.savedViewAction(three, { op: "delete", id: middle.id }, id, NOW);
  check("remove takes one out", removed.list.length === 2 && !removed.list.some((x) => x.id === middle.id) && removed.message === "Removed that saved view.");
  check("removing it again says it is gone", throws(() => hunt.savedViewAction(removed.list, { op: "delete", id: middle.id }, id, NOW)) === "That saved view is gone already.");
  const out = hunt.savedViewsOut([middle])[0];
  const back = hunt.savedViewAction(removed.list, { op: "restore", view: out, at: 1 }, id, NOW);
  check("Undo puts it back where it was, with its id, name, date, place and email", back.id === middle.id && back.list[1].id === middle.id && back.list[1].name === middle.name && back.list[1].createdAt === middle.createdAt && back.list[1].place === middle.place && back.list.length === 3, back.list.map((x) => x.id));
  check('and says it is back', back.message === `"${middle.name}" is back.`, back.message);
  const twice = hunt.savedViewAction(back.list, { op: "restore", view: out, at: 1 }, id, NOW);
  check("putting back a view that is there already is the same view, not a second", twice.list === back.list && twice.id === middle.id);
  const forged = hunt.savedViewAction(removed.list, { op: "restore", view: { ...out, id: "../../etc", createdAt: "2999-01-01T00:00:00.000Z" }, at: 99 }, id, NOW);
  check("an id we wouldn't make, a date in the future and a place past the end are not taken", forged.id !== "../../etc" && /^al_test/.test(forged.id ?? "") && forged.list[2].createdAt === NOW && forged.list.length === 3, forged.list[2]);
  const gone = hunt.savedViewAction(claude, { op: "delete", id: "al_claude01" }, id, NOW);
  const claudeBack = hunt.savedViewAction(gone.list, { op: "restore", view: hunt.savedViewsOut(claude)[0], at: 0 }, id, NOW);
  check("a search saved in Claude comes back with no place, as it was saved", claudeBack.list[0].id === "al_claude01" && !("place" in claudeBack.list[0]) && hunt.savedViewsOut(claudeBack.list)[0].place === null, claudeBack.list[0]);

  /* ---------- 2. in process ---------- */
  const t = await import("../lib/table.ts");
  const tools = await import("../lib/mcp/tools.ts");
  const VI = "tok-vi-0001";
  const OZ = "tok-oz-0001";
  const act = async (token: string, a: Parameters<typeof t.perform>[1]) => {
    try {
      return { ok: true as const, ...(await t.perform(token, a, "https://post.example.com")) };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message, message: "", id: undefined };
    }
  };
  const viewsOf = async (token: string) => (await t.buildView(token)).me?.savedViews ?? [];

  console.log("\nOn the server");
  const PLACE = "v=all&t=companies&f=hiredFn:Finance~hiredWithin:6~notMine~icp";
  const crit = { hiredFn: ["Finance"], hiredWithin: 6 };
  const sv = await act(VI, { type: "savedView", op: "save", name: "Finance hires", place: PLACE, criteria: crit, email: true });
  check("a view saves and the answer carries its id", sv.ok && typeof sv.id === "string" && (await viewsOf(VI)).length === 1, sv);
  const dup = await act(VI, { type: "savedView", op: "save", name: "Finance hires 2", place: PLACE.replace("f=", "s=hired&f="), criteria: crit, email: true });
  check('saving it again is refused in words, with the id of the one they have', dup.ok && dup.message === 'You saved this view already, as "Finance hires".' && dup.id === sv.id && (await viewsOf(VI)).length === 1, dup);
  const ozSame = await act(OZ, { type: "savedView", op: "save", name: "Mine too", place: PLACE, criteria: crit });
  check("another member can save the same view: the list is each member's own", ozSame.ok && ozSame.id !== sv.id && (await viewsOf(OZ)).length === 1);
  const ren = await act(VI, { type: "savedView", op: "rename", id: sv.id, name: "Finance leaders hired lately" });
  const afterRen = await viewsOf(VI);
  check("rename changes the name and nothing else", ren.ok && afterRen.length === 1 && afterRen[0].id === sv.id && afterRen[0].name === "Finance leaders hired lately" && afterRen[0].place === PLACE && afterRen[0].email === true, afterRen[0]);
  const steal = await act(OZ, { type: "savedView", op: "rename", id: sv.id, name: "Got it" });
  check("another member can't rename it", !steal.ok && /gone already/.test(steal.error ?? "") && (await viewsOf(VI))[0].name === "Finance leaders hired lately");
  const ctx = { member: (await t.memberForToken(VI))!, origin: "https://post.example.com" };
  const listed = (await tools.alerts(ctx, { action: "list" })) as { saved_searches: { id: string; name: string }[] };
  check("the connector lists the same view under its new name", listed.saved_searches.length === 1 && listed.saved_searches[0].id === sv.id && listed.saved_searches[0].name === "Finance leaders hired lately", listed.saved_searches);

  console.log("\nA first view removed and put back");
  await act(VI, { type: "profile", firstView: sv.id });
  check("it is their first view", (await t.buildView(VI)).me?.firstView === sv.id);
  const v0 = (await viewsOf(VI))[0];
  const del = await act(VI, { type: "savedView", op: "delete", id: sv.id });
  check("Remove takes it off, and it is no first view while it is gone", del.ok && (await viewsOf(VI)).length === 0 && (await t.buildView(VI)).me?.firstView === null);
  const undo = await act(VI, { type: "savedView", op: "restore", view: v0, at: 0 });
  const after = await t.buildView(VI);
  check("Undo brings it back with its id, so it is their first view again", undo.ok && undo.id === sv.id && after.me?.savedViews?.[0]?.id === sv.id && after.me?.firstView === sv.id, { id: undo.id, first: after.me?.firstView });

  console.log("\nOnboarding's re-save still works");
  const fv1 = await act(VI, { type: "savedView", op: "save", name: "First view", place: "v=all&t=companies&f=hiredFn:Marketing~hiredWithin:12~notMine~icp", criteria: { hiredFn: ["Marketing"], hiredWithin: 12 }, email: true });
  const fvAgain = await act(VI, { type: "savedView", op: "save", name: "First view", place: "v=all&t=companies&f=hiredFn:Marketing~hiredWithin:12~notMine~icp", criteria: { hiredFn: ["Marketing"], hiredWithin: 12 }, email: true });
  check("saving the first view twice gives back the one saved, so onboarding keeps it", fv1.ok && fvAgain.ok && fvAgain.id === fv1.id && (await viewsOf(VI)).length === 2);
  await act(VI, { type: "savedView", op: "delete", id: fv1.id! });
  const fv2 = await act(VI, { type: "savedView", op: "save", name: "First view", place: "v=all&t=companies&f=hiredFn:Marketing|Finance~hiredWithin:12~notMine~icp", criteria: { hiredFn: ["Marketing", "Finance"], hiredWithin: 12 }, email: true });
  check("a changed answer replaces it: the earlier one goes, the new one saves", fv2.ok && fv2.id !== fv1.id && (await viewsOf(VI)).filter((x) => x.name === "First view").length === 1, await viewsOf(VI));
  const fv3 = await act(VI, { type: "savedView", op: "save", name: "First view", place: "v=all&t=companies&f=hiredFn:Marketing~hiredWithin:12~notMine~icp", criteria: { hiredFn: ["Marketing"], hiredWithin: 12 }, email: true });
  check("and the answer from before can be saved again once its view is gone", fv3.ok && fv3.id !== fv1.id && (await viewsOf(VI)).length === 3);

  console.log("\nThe connector keeps the same list");
  const c1 = (await tools.alerts(ctx, { action: "save", function: "Sales", industry: ["saas"] })) as { message: string; saved_search: { id: string } };
  const c2 = (await tools.alerts(ctx, { action: "save", name: "Again", function: "sales", industry: ["SaaS"] })) as { message: string; saved_search: { id: string } };
  check("a search saved twice in Claude is one search, and the connector says so", /^Saved "/.test(c1.message) && c2.message === `You saved this search already, as "Fractional Sales roles at SaaS companies".` && c2.saved_search.id === c1.saved_search.id, c2);
  const c3 = await act(VI, { type: "savedView", op: "save", name: "Sales at SaaS", place: "v=hiring&t=seats&f=fn:Sales~industry:SaaS", criteria: { function: "Sales", industry: ["SaaS"] } });
  check("the app's save finds it too", c3.ok && c3.id === c1.saved_search.id && /saved this view already/.test(c3.message), c3);
  const all = (await tools.alerts(ctx, { action: "list" })) as { saved_searches: unknown[] };
  check("and the list has each one once", all.saved_searches.length === (await viewsOf(VI)).length && all.saved_searches.length === 4, all.saved_searches.length);
  const cdel = (await tools.alerts(ctx, { action: "delete", id: c1.saved_search.id })) as { message: string };
  check("the connector still deletes", /Deleted/.test(cdel.message) && (await viewsOf(VI)).length === 3);
}

try {
  await main();
} catch (e) {
  failed++;
  console.log(`FAIL the suite stopped: ${(e as Error).stack ?? e}`);
} finally {
  rmSync(dir, { recursive: true, force: true });
}
console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
