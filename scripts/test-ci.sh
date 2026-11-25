#!/usr/bin/env bash
# The checks as CI runs them (.github/workflows/ci.yml): every suite of scripts/test-all.sh, with
# no private seed, no seed key and no secrets. The serve suites run on a made-up seed made here
# (scripts/make-test-seed.mjs), so their seed-member checks run too.
#
#   npm run build && bash scripts/test-ci.sh
#
# It refuses to run where the real seed is (data/intel-seed.json or data/intel-seed.key): in a
# worktree those are links to real member data. Run it from a clean checkout (CI's, or a copy
# made with `git archive`).
#
# Writes to CI_OUT (default: a new temporary folder): test-seed.json, logs/ (every suite's
# output), test-all.log, summary.json and summary.md. With GITHUB_STEP_SUMMARY set, summary.md is
# added to the job summary. Exits with test-all's code: the number of suites that failed.
#
#   TYPES_CHECKED=1   the workflow ran npx tsc --noEmit in its own step: the types suite is listed as skipped
#   SUITE_TIMEOUT     seconds before one suite is stopped (default 900)
set -u
cd "$(dirname "$0")/.."

for f in data/intel-seed.json data/intel-seed.key; do
  if [ -e "$f" ] || [ -L "$f" ]; then
    echo "test-ci: $f is here. CI runs without the real seed: run this from a clean checkout (git archive), never next to member data." >&2
    exit 2
  fi
done

# Nothing that could open the sealed seed or reach a real service.
for v in $(env | sed -n 's/^\(RN_INTEL_SEED[A-Z0-9_]*\)=.*/\1/p') RN_REQUIRE_SEED RN_ID_SECRET RN_SEAL_KEY \
  ANTHROPIC_API_KEY ANTHROPIC_BASE_URL ANTHROPIC_AUTH_TOKEN RESEND_API_KEY STRIPE_SECRET_KEY STRIPE_WEBHOOK_SECRET \
  GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET GOOGLE_GMAIL_CLIENT_ID GOOGLE_GMAIL_CLIENT_SECRET SLACK_CLIENT_ID SLACK_CLIENT_SECRET \
  RN_BACKUP_S3_ENDPOINT RN_BACKUP_S3_BUCKET RN_BACKUP_S3_KEY_ID RN_BACKUP_S3_SECRET RN_FREEHIRE_KEY RN_GREENHOUSE_BOARDS; do
  unset "$v"
done

OUT="${CI_OUT:-$(mktemp -d)}"
mkdir -p "$OUT"
OUT="$(cd "$OUT" && pwd)"
rm -rf "$OUT/logs"

node scripts/make-test-seed.mjs "$OUT/test-seed.json" || exit 2

SKIPS=""
if [ "${TYPES_CHECKED:-}" = "1" ]; then
  SKIPS="types|checked in the workflow's own Type check step (npx tsc --noEmit), before the build"
fi

SERVE_SEED="$OUT/test-seed.json" SKIP_SUITES="$SKIPS" SUITE_TIMEOUT="${SUITE_TIMEOUT:-900}" \
  LOG_DIR="$OUT/logs" SUMMARY_JSON="$OUT/summary.json" \
  bash scripts/test-all.sh 2>&1 | tee "$OUT/test-all.log"
rc=${PIPESTATUS[0]}

if [ -s "$OUT/summary.json" ] && node scripts/test-summary.mjs --markdown "$OUT/summary.json" > "$OUT/summary.md"; then
  if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then cat "$OUT/summary.md" >> "$GITHUB_STEP_SUMMARY"; fi
else
  echo "test-ci: no summary was written" >&2
  [ "$rc" -eq 0 ] && rc=1
fi
echo "test-ci: logs and summary in $OUT"
exit "$rc"
