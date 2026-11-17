#!/usr/bin/env bash
# Run every Merlin check: types, then each suite.
#
#   npm run build && npm run test:all        (PORT=4600 by default)
#
# The suites that talk to a server each get their own server (next start) on a fresh data
# folder, because they count credits and store test scans. Nothing is left running, and the
# data folders are removed when everything passed. On a failure the logs stay and the path is
# printed. The private seed (data/intel-seed.json) is used when it is there. Without it the
# checks that sign in as a seed member are skipped.
set -u
cd "$(dirname "$0")/.."
PORT="${PORT:-4600}"
# The servers are started with these as RN_SUPPORT_EMAIL and RN_INTRO_EMAIL, and the checks expect them in View.contact.
SUPPORT_EMAIL="support-qa@example.com"
INTRO_EMAIL="intro-qa@example.com"
TMP="$(mktemp -d)"
fails=0

if [ ! -f .next/BUILD_ID ]; then
  echo "Build first: npm run build"
  exit 1
fi

# run <name> <command...>: run one suite, print its last line and any failed checks.
run() {
  local name=$1
  shift
  if "$@" > "$TMP/$name.out" 2>&1; then
    printf 'ok      %-12s %s\n' "$name" "$(tail -n 1 "$TMP/$name.out")"
  else
    fails=$((fails + 1))
    printf 'FAILED  %-12s %s\n' "$name" "$(tail -n 1 "$TMP/$name.out")"
    grep -E '^FAIL' "$TMP/$name.out" | cut -c1-300
  fi
}

# serve <name> <command...>: the same, against a server started for this suite alone.
serve() {
  local name=$1
  shift
  mkdir -p "$TMP/data-$name"
  RN_DATA_DIR="$TMP/data-$name" RN_STARTER_CREDITS=25 RN_ADMIN_EMAILS=admin-qa@example.com RN_SCAN_TEST=1 RN_CRON_SECRET=qa-cron RN_LOGO_LOOKUP=off \
    RN_SUPPORT_EMAIL="$SUPPORT_EMAIL" RN_INTRO_EMAIL="$INTRO_EMAIL" \
    node node_modules/next/dist/bin/next start -p "$PORT" > "$TMP/$name.server.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 80); do
    curl -s -o /dev/null "http://localhost:$PORT/api/health" && break
    sleep 0.5
  done
  run "$name" env BASE="http://localhost:$PORT" STARTER=25 SUPPORT_EMAIL="$SUPPORT_EMAIL" INTRO_EMAIL="$INTRO_EMAIL" "$@"
  kill "$pid" 2> /dev/null
  wait "$pid" 2> /dev/null
  rm -rf "$TMP/data-$name"
}

run types npx tsc --noEmit -p .
serve server node scripts/test-server.mjs
serve rules node scripts/test-rules.mjs
serve credits node scripts/test-credits.mjs
serve integration node scripts/test-integration.mjs
# The landing page's "Try it" preview and example record: real companies, never a person, email, phone, posting or rate, and at most 3 companies with an open role named per answer.
serve preview node scripts/test-preview.mjs
# The same with no open-role company named (lib/preview.ts PREVIEW_OPEN_NAMED at 0, a test-server-only override).
RN_PREVIEW_OPEN_ROLE_COMPANIES=0 serve preview-lock env PREVIEW_LOCKED=1 node scripts/test-preview.mjs
# The Claude connector. RN_MCP_TEST=1: 2-second tokens for one test app, a short refresh grace, and metadata documents over http on localhost.
RN_MCP_TEST=1 serve mcp node scripts/test-mcp.mjs
run scan npx tsx scripts/test-scan.mts
run digest npx tsx scripts/test-digest.ts
run messages npx tsx scripts/test-messages.mjs
# Alerts in Slack and webhooks (lib/notify), with fetch and name lookups replaced: nothing leaves the machine.
run notify npx tsx scripts/test-notify.mts
run signin env SIGNIN_PORT="$PORT" npx tsx scripts/test-signin.mjs
run model npx tsx scripts/test-model.mts
# Clean company data: HQ country and region, standard industry, employees and revenue values, fractional firms removed, research firmographics, place filters.
run geo npx tsx scripts/test-geo.mts
run bench npx tsx scripts/test-bench.mjs
# The seat scan (scripts/add-seat-scan.mjs) and claiming its seats, on a made-up seed, with its own server.
run seatscan env SEATSCAN_PORT="$PORT" npx tsx scripts/test-seatscan.mts
run robust env ROBUST_PORT="$PORT" npx tsx scripts/test-robust.mts

echo
if [ "$fails" -eq 0 ]; then
  rm -rf "$TMP"
  echo "Every suite passed."
else
  echo "$fails failed. Logs are in $TMP"
fi
exit "$fails"
