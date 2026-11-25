#!/usr/bin/env node
/**
 * The summary of one scripts/test-all.sh run, from its log folder.
 *
 *   node scripts/test-summary.mjs <log dir> [seconds]      the JSON summary (stdout)
 *   node scripts/test-summary.mjs --markdown <summary.json> the same as Markdown (for $GITHUB_STEP_SUMMARY)
 *
 * The log folder holds results.tsv (one line a suite: name, kind, status, milliseconds, reason)
 * and each suite's output, <name>.out. A suite's checks are read from its last
 * "N passed, M failed" line (or "##RESULT N M"), else counted from its PASS and FAIL lines; a suite
 * that prints neither (types, load) counts as one check, passed when it exited 0. Its FAIL lines are
 * its failures and its SKIP lines its skipped checks. A suite test-all did not run (SKIP_SUITES) is
 * listed with its reason. Nothing here decides whether the run passed: test-all's exit code does.
 */
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";

const MAX_LINES = 50;
const cut = (s, n = 300) => (s.length > n ? `${s.slice(0, n)}…` : s);

function summarize(dir, totalSeconds) {
  const rows = existsSync(path.join(dir, "results.tsv"))
    ? readFileSync(path.join(dir, "results.tsv"), "utf8").split("\n").filter(Boolean).map((l) => l.split("\t"))
    : [];
  const suites = [];
  for (const [name, kind, status, ms, reason = ""] of rows) {
    const s = { name, kind, status, seconds: Math.round(Number(ms) / 100) / 10 };
    if (status === "skipped") {
      s.reason = reason;
      suites.push(s);
      continue;
    }
    const file = path.join(dir, `${name}.out`);
    const out = existsSync(file) ? readFileSync(file, "utf8") : "";
    const lines = out.split("\n");
    const fails = lines.filter((l) => /^FAIL\b/.test(l));
    const skips = lines.map((l) => l.trim()).filter((l) => /^SKIP\b/.test(l));
    let passed = null;
    let failed = null;
    for (const l of lines) {
      const m = l.match(/(\d+) passed(?:, (\d+) failed)?/) ?? l.match(/^##RESULT (\d+) (\d+)/);
      if (m) [passed, failed] = [Number(m[1]), Number(m[2] ?? 0)];
    }
    if (passed === null) {
      const p = lines.filter((l) => /^PASS\b/.test(l)).length;
      if (p || fails.length) [passed, failed] = [p, fails.length];
    }
    s.counted = passed !== null;
    if (passed === null) [passed, failed] = status === "ok" ? [1, 0] : [0, 1];
    Object.assign(s, { passed, failed, skipped: skips.length, last: cut(lines.filter((l) => l.trim()).slice(-1)[0] ?? "", 200) });
    if (status === "failed") {
      s.failures = fails.slice(0, MAX_LINES).map((l) => cut(l));
      if (!fails.length) s.failures = [cut(s.last || "exited non-zero with no FAIL line")];
      if (reason) s.reason = reason;
    }
    if (skips.length) s.skips = skips.slice(0, MAX_LINES).map((l) => cut(l, 240));
    suites.push(s);
  }
  const ran = suites.filter((s) => s.status !== "skipped");
  const sum = (k) => ran.reduce((n, s) => n + (s[k] ?? 0), 0);
  return {
    ok: ran.length > 0 && ran.every((s) => s.status === "ok"),
    seconds: totalSeconds ?? Math.round(suites.reduce((n, s) => n + s.seconds, 0)),
    suites: { total: suites.length, ran: ran.length, passed: ran.filter((s) => s.status === "ok").length, failed: ran.filter((s) => s.status === "failed").length, skipped: suites.length - ran.length },
    checks: { passed: sum("passed"), failed: sum("failed"), skipped: sum("skipped") },
    failures: ran.filter((s) => s.status === "failed").map((s) => ({ suite: s.name, ...(s.reason ? { reason: s.reason } : {}), lines: s.failures })),
    skippedSuites: suites.filter((s) => s.status === "skipped").map((s) => ({ suite: s.name, reason: s.reason })),
    skippedChecks: ran.filter((s) => s.skips).map((s) => ({ suite: s.name, lines: s.skips })),
    results: suites,
  };
}

const md = (s) => String(s).replace(/\|/g, "\\|").replace(/</g, "&lt;");
function markdown(j) {
  const o = [];
  o.push(`## ${j.ok ? "All suites passed" : `${j.suites.failed} suite${j.suites.failed === 1 ? "" : "s"} failed`}`);
  o.push("");
  o.push(`| Suites run | Passed | Failed | Skipped | Checks passed | Checks failed | Checks skipped | Time |`);
  o.push(`|---|---|---|---|---|---|---|---|`);
  o.push(`| ${j.suites.ran} | ${j.suites.passed} | ${j.suites.failed} | ${j.suites.skipped} | ${j.checks.passed} | ${j.checks.failed} | ${j.checks.skipped} | ${Math.floor(j.seconds / 60)}m ${j.seconds % 60}s |`);
  o.push("");
  if (j.failures.length) {
    o.push("### Failed");
    for (const f of j.failures) {
      o.push(`**${md(f.suite)}**${f.reason ? ` (${md(f.reason)})` : ""}`);
      o.push("```");
      o.push(...f.lines);
      o.push("```");
    }
    o.push("");
  }
  if (j.skippedSuites.length) {
    o.push("### Suites skipped");
    for (const s of j.skippedSuites) o.push(`- **${md(s.suite)}**: ${md(s.reason)}`);
    o.push("");
  }
  if (j.skippedChecks.length) {
    o.push(`<details><summary>Checks the suites skipped (${j.checks.skipped})</summary>`);
    o.push("");
    for (const s of j.skippedChecks) for (const l of s.lines) o.push(`- ${md(s.suite)}: ${md(l)}`);
    o.push("");
    o.push("</details>");
    o.push("");
  }
  o.push(`<details><summary>Every suite (${j.suites.total})</summary>`);
  o.push("");
  o.push(`| Suite | Kind | Result | Passed | Failed | Skipped | Seconds |`);
  o.push(`|---|---|---|---|---|---|---|`);
  for (const s of j.results)
    o.push(`| ${md(s.name)} | ${s.kind} | ${s.status === "ok" ? "ok" : s.status === "failed" ? "**FAILED**" : "skipped"} | ${s.passed ?? ""} | ${s.failed ?? ""} | ${s.skipped ?? ""} | ${s.seconds} |`);
  o.push("");
  o.push("</details>");
  return o.join("\n");
}

const args = process.argv.slice(2);
if (args[0] === "--markdown" && args[1]) {
  console.log(markdown(JSON.parse(readFileSync(args[1], "utf8"))));
} else if (args[0]) {
  console.log(JSON.stringify(summarize(args[0], args[1] === undefined ? undefined : Number(args[1]))));
} else {
  console.error("usage: node scripts/test-summary.mjs <log dir> [seconds] | --markdown <summary.json>");
  process.exit(2);
}
