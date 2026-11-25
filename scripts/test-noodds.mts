/**
 * No false precision (owner, 2026-11-25): Merlin has no validated outcome data yet, so no
 * member-facing screen or connector output shows an estimated success percentage or a predicted
 * timeline ("Est. success 55%", "1 to 2 weeks", "days to a meeting", "35% or more", "within 3
 * months"). The score stays inside, for ordering and the map; members see its band in words.
 *
 *  1. The words: three bands from one score (Long shot, Good path, Warm intro), the axis in words.
 *  2. The sources of the screens and tools that used to print numbers: no percent built from a
 *     score, no week range, no time to a meeting, no predicted months window.
 *  3. The connector's ways_in: its description, and that its output has no percent or time field.
 *
 * Pure, no seed: reads source files and calls pure functions. Run: npx tsx scripts/test-noodds.mts
 */
import { readFileSync } from "node:fs";

let pass = 0;
let fail = 0;
function check(name: string, ok: boolean, detail?: unknown) {
  if (ok) pass++;
  else {
    fail++;
    console.log(`FAIL ${name}${detail === undefined ? "" : `: ${JSON.stringify(detail)?.slice(0, 400)}`}`);
  }
}
const src = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
/** Lines that are not comments: what can reach a screen or a tool's answer. */
const code = (p: string) =>
  src(p)
    .split("\n")
    .filter((l) => !/^\s*(\/\/|\*|\/\*\*?)/.test(l))
    .join("\n");

async function main() {
  const R = await import("../lib/paths/rank.ts");

  console.log("\nThe words");
  check("three bands, coldest first", R.WAY_BANDS.join("|") === "Long shot|Good path|Warm intro");
  check("each score has one band, warmer with a higher score", [5, 10, 15, 30, 35, 60, 85].map(R.wayBandOf).join("|") === "Long shot|Long shot|Good path|Good path|Warm intro|Warm intro|Warm intro");
  check("no band word or hint has a number in it", R.WAY_BANDS.every((b) => !/\d/.test(b) && !/\d/.test(R.WAY_BAND_HINT[b])));
  check("the axis says how warm your way in is", R.WAY_AXIS === "How warm your way in is");
  check("the explainer says it is a guide, not a prediction, and has no number", /not a prediction/.test(R.HOW_ESTIMATED) && !/\d/.test(R.HOW_ESTIMATED));
  check("the old words are gone: no estWords, no timeWords", !("estWords" in R) && !("timeWords" in R) && !("STEP_DAYS" in R));

  console.log("\nThe screens and tools");
  const files = [
    "app/post/network/Ways.tsx",
    "app/post/network/WarmPaths.tsx",
    "app/post/network/warmExamples.ts",
    "app/post/hiring/hiringModel.ts",
    "app/post/crystal/CrystalBall.tsx",
    "app/post/crystal/crystalModel.ts",
    "lib/paths/ways.ts",
    "lib/paths/rank.ts",
    "lib/mcp/ways.ts",
    "lib/workflows/steps.ts",
    "lib/radar/match.ts",
  ];
  // A percent sign right after a score, or written next to the old label: "${r.est}%", "{x.est}%", "${w.best}%", "35% or more".
  const pctOfScore = /\$?\{[^}]*\b(est|best|warmest)\b[^}]*\}\s?%|\b\d+% or more|from 5% to 85%/;
  const weekRange = /\d+\s?(?:–|-|to)\s?\d+\s?weeks|\bone to two weeks\b/i;
  // The old labels and field; the connector's own "never ... a time to a meeting" is allowed.
  const meetingTime = /Time to a meeting|To a meeting<|time_to_a_meeting|% to a meeting|[Dd]ays to a meeting/;
  const oldLabel = /Est\. success|est_success|Estimated success|estimate of success/;
  const monthsAhead = /Within \$\{|In \$\{h\[0\]\} to|Likely within|Likely in \$\{|May hire|12 months ahead/;
  for (const f of files) {
    const c = code(f);
    check(`${f}: no percent made from a score`, !pctOfScore.test(c), c.match(pctOfScore)?.[0]);
    check(`${f}: no week range`, !weekRange.test(c), c.match(weekRange)?.[0]);
    check(`${f}: no time to a meeting`, !meetingTime.test(c), c.match(meetingTime)?.[0]);
    check(`${f}: no Est. success label`, !oldLabel.test(c), c.match(oldLabel)?.[0]);
    check(`${f}: no predicted months window`, !monthsAhead.test(c), c.match(monthsAhead)?.[0]);
  }
  const wp = src("app/post/network/WarmPaths.tsx");
  check("Warm paths filters by band (Warm intros), not by a percentage", /label: "Warm intros", n: wc\.warmIntro/.test(wp) && /r\.way === "Warm intro"/.test(wp));
  check("Warm paths' axis is in words, from rank.ts", /\{WAY_AXIS\}/.test(wp) && /sideBands\(rows, false/.test(wp));
  check("Ways' map axis names the bands", /\{WAY_AXIS\}/.test(src("app/post/network/Ways.tsx")) && /WAY_BANDS\[0\]/.test(src("app/post/network/Ways.tsx")));
  const types = src("lib/paths/types.ts");
  check("a route carries its band (way), and no time field", /\bway: WayBand;/.test(types) && !/\btime: string;/.test(types.slice(types.indexOf("export interface RouteView"), types.indexOf("export interface PlanView"))));

  console.log("\nCrystal Ball: dated facts only");
  const CM = await import("../app/post/crystal/crystalModel.ts");
  check("an open role reads Open now; else the newest signal's day; never months ahead", CM.whenWords([0, 1]) === "Open now" && CM.whenWords([2, 6], [{ at: "2026-09-02" }, { at: "2026-11-20" }], "2026-11-25") === "Signal Nov 20" && CM.whenWords([0, 6]) === null);
  const P = await import("../lib/radar/predict.ts");
  const after = (x: string) => x.split(" · ").slice(1).join(" · ");
  check("a why-now line never says when a hire comes (only when the signal happened)", [2, 6, 12].every((t) => !/\d|months/.test(after(P.hireWhyNow("Marketing", "Sales", t, { gap: [4, 9], rule: P.RULES[4] })))));
  check("lines kept from before lose their window", P.noWindow("Raised a Series A 3 weeks ago · RevOps usually follows in 2–6 months") === "Raised a Series A 3 weeks ago · RevOps usually follows");

  console.log("\nThe connector");
  const tools: { name: string; description: string }[] = [];
  const fake = { registerTool: (name: string, def: { description: string }) => tools.push({ name, description: def.description }) };
  const W = await import("../lib/mcp/ways.ts");
  W.registerWayTools(fake as never, {} as never, (async () => ({})) as never);
  const d = tools.find((t) => t.name === "ways_in")?.description ?? "";
  check("ways_in says it returns way_in in words, never a percentage", /way_in/.test(d) && /Warm intro, Good path or Long shot/.test(d) && !/\d\s?%/.test(d) && !/Est\. success/.test(d), d);
  const mc = code("lib/mcp/ways.ts");
  check("ways_in returns way_in, not est_success or a time to a meeting", /way_in: r\.way/.test(mc) && !/est_success|time_to_a_meeting|r\.time/.test(mc));
  check("the server's instructions and the other tools never promise a percentage of success", !/Est\. success|est_success|success \d+%/.test(code("lib/mcp/server.ts")) && !/Est\. success|est_success/.test(code("lib/mcp/tools.ts")));

  console.log(`\n${fail ? "FAILED" : "ok"}: ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => {
  console.log(`FAIL the suite stopped: ${e?.stack ?? e}`);
  process.exit(1);
});
