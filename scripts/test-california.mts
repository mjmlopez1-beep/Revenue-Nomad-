/**
 * The California rule, one everywhere (lib/california.ts, BUILD_PLAN part 8): a person's name and
 * email never show when the person is in California, judged by the person's own location, never
 * the company's. Checks the helper, and that each place that shows a person from outside members
 * uses it: the email finder on their own website (scripts/add-own-sites.mjs), seat holders' names
 * from public profiles (scripts/seat-import.mjs, so add-seat-names.mjs and add-past-seats.mjs),
 * ways in (lib/paths/ways.ts, which no longer reads the company's state) and leaders read from
 * company websites (lib/table.ts). The importers themselves run in test-names, test-pastseats and
 * test-ownsites; ways in in test-paths3; leaders in test-leaders-names. Made-up places only.
 *
 *   npx tsx scripts/test-california.mts
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { californian, inCalifornia, nameMayShow } from "../lib/california";
import { inCalifornia as fromOwnSites } from "../lib/ownsites/types";

let passed = 0;
let failed = 0;
const check = (name: string, ok: boolean, detail?: unknown) => {
  if (ok) passed++;
  else failed++;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}${ok || detail === undefined ? "" : `: ${JSON.stringify(detail)}`}`);
};
const src = (p: string) => readFileSync(path.join(process.cwd(), p), "utf8");

console.log("The helper");
const ca = ["San Francisco Bay Area", "Oakland, California, United States", "Los Angeles Metropolitan Area", "Irvine, CA", "Greater San Diego Area", "california"];
const notCa = ["Austin, Texas, United States", "Denver, Colorado", "Portland, Oregon", "Cary, NC", "Canada", "", null, undefined];
check("a location in California, by name, by ', CA' or by its cities", ca.every(inCalifornia), ca.filter((x) => !inCalifornia(x)));
check("anywhere else is not", notCa.every((x) => !inCalifornia(x)), notCa.filter((x) => inCalifornia(x)));
check("a person is a Californian by their own location, or the yes an import kept", californian({ location: "Oakland, California" }) && californian({ california: true }) && !californian({ location: "Austin, TX" }) && !californian({}) && !californian(null));
check("their name may show unless they are", nameMayShow({ location: "Denver, Colorado" }) && !nameMayShow({ location: "Palo Alto, California" }) && nameMayShow(null));
check("the own-site finder reads the same rule", fromOwnSites === inCalifornia);

console.log("\nEvery place uses it, by the person");
check("the email finder: a person's own location, through the helper", /californian\(\{ location: r\.person_location \}\)/.test(src("scripts/add-own-sites.mjs")));
const imp = src("scripts/seat-import.mjs");
check("seat holders' names from public profiles: never a Californian, and a rerun takes the name off", /export const inCa = \(r\) => californian\(\{ location: r\.person_location \}\)/.test(imp) && /if \(nameRowOk\(r\)\) continue;/.test(imp));
check("  both importers skip a Californian", /if \(inCa\(r\)\)/.test(src("scripts/add-seat-names.mjs")) && /if \(inCa\(r\)\)/.test(src("scripts/add-past-seats.mjs")));
const ways = src("lib/paths/ways.ts");
check("ways in no longer judges by the company's state", !/region !== "California"/.test(ways) && /function publicNameOk/.test(ways));
check("leaders read from websites go through the helper", /const leaderMayShow = \(l: \{ california\?: true \}\) => nameMayShow\(/.test(src("lib/table.ts")));

console.log(`\n${failed ? "FAILED" : "ok"}: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
