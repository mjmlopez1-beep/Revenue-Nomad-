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
# What members add stays honest: a seat already found is claimed, not added twice; a person already on file is added to; Not my seat takes back what it earned; example names; contact details only after the name.
serve integrity node scripts/test-integrity.mjs
# The landing page's "Try it" preview and example record: real companies, never a person, email, phone, posting or rate, and at most 3 companies with an open role named in all, the same 3 whatever the filters.
serve preview node scripts/test-preview.mjs
# The same with no open-role company named (lib/preview.ts PREVIEW_OPEN_NAMED at 0, a test-server-only override).
RN_PREVIEW_OPEN_ROLE_COMPANIES=0 serve preview-lock env PREVIEW_LOCKED=1 node scripts/test-preview.mjs
# The Claude connector. RN_MCP_TEST=1: 2-second tokens for one test app, a short refresh grace, and metadata documents over http on localhost.
RN_MCP_TEST=1 serve mcp node scripts/test-mcp.mjs
# What members read about prices: the connector's words and unlock plans for the bundles (who held a seat with their role, contact details after the name, people after the company) on view data shaped as the server sends it, and the landing page's matrix and Questions.
run prices npx tsx scripts/test-prices.mts
# The company lock: every company's name, website, logo, LinkedIn and About locked for a member until they unlock it (2 credits) or already know it, on a made-up seed in process.
run lock npx tsx scripts/test-company-lock.mts
# Onboarding: suggestions and their heading, Find your seats cards, a new member's title, the weekly email offered at the end.
serve onboard npx tsx scripts/test-onboard.mts
run scan npx tsx scripts/test-scan.mts
run seniority npx tsx scripts/test-seniority.mts
run digest npx tsx scripts/test-digest.ts
run messages npx tsx scripts/test-messages.mjs
# Alerts in Slack and webhooks (lib/notify), with fetch and name lookups replaced: nothing leaves the machine.
run notify npx tsx scripts/test-notify.mts
# The next-client radar (lib/radar): each signal, the profile and before-function matching, never twice, a free view that names nothing, Pro, no nothing-days, opt-out and unsubscribe, Slack and email, billing off as free. Fetch replaced: nothing leaves the machine.
run radar npx tsx scripts/test-radar.mts
# Recently hired (lib/hired.ts): the filter, its counts and sort, the address and saved views, the weekly email's line, the post in Slack and the connector's params, on a made-up seed with fetch replaced.
run hired npx tsx scripts/test-hired.mts
# About texts from company websites (lib/about): extraction, the fetch safety rules and storage, against a mock server on $PORT. Nothing leaves the machine.
run about env ABOUT_PORT="$PORT" npx tsx scripts/test-about.mts
# Who leads each function, from company websites (lib/leaders): titles, the pages found, robots.txt, the page cap, same site only, no names stored, the record's line, "No fractional Sales yet" and its ranking, the connector, Pilot metrics, RN_LEADERS off. A mock server on $PORT; nothing leaves the machine.
run leaders env LEADERS_PORT="$PORT" npx tsx scripts/test-leaders.mts
run signin env SIGNIN_PORT="$PORT" npx tsx scripts/test-signin.mjs
run model npx tsx scripts/test-model.mts
# Bundles and prices on the server module: Ongoing end months free and refunded once on load, SEAT_SCAN_ROLE_FREE both ways (a copy of lib/ flips it).
run econ npx tsx scripts/test-econ.mts
# Clean company data: HQ country and region, standard industry, employees and revenue values, fractional firms removed, research firmographics, place filters.
run geo npx tsx scripts/test-geo.mts
run bench npx tsx scripts/test-bench.mjs
# The seat scan (scripts/add-seat-scan.mjs) and claiming its seats, on a made-up seed, with its own server.
run seatscan env SEATSCAN_PORT="$PORT" npx tsx scripts/test-seatscan.mts
# Names on found seats (scripts/add-seat-names.mjs, claim-outreach.mjs), Verify, claim links, Remove my name and the switch, on a made-up seed and key, with its own servers.
run names env NAMES_PORT="$PORT" npx tsx scripts/test-names.mts
# Referral partners: Invite to connect, the claim bonus and the conversation it opens, Message, the Referral partners page and the connector's warm paths, on a made-up seed and key, with its own server.
run partners env PARTNERS_PORT="$PORT" npx tsx scripts/test-partners.mts
# Plans and payments (lib/plan.ts, lib/billing): the trial and its extension, pause, cancel, the Stripe webhook (signature, each event, once), monthly credits and top-ups, Free's limits on and off, nothing changed with billing off. Fetch replaced: nothing reaches Stripe.
run billing npx tsx scripts/test-billing.mts
# Saved views: rename, the same view twice, remove and Undo, on the server and through the connector, on a made-up seed.
run views npx tsx scripts/test-views.mts
# The invite loop: the inviter told once when a friend joins (app, email, Slack), never the friend's email, and the invitee's onboarding line, on a made-up seed with fetch replaced.
run invites npx tsx scripts/test-invites.mts
run robust env ROBUST_PORT="$PORT" npx tsx scripts/test-robust.mts
# 20 members acting at once on their own server: every answer carries the member's numbers and the table version, no server errors, at most one table a minute each.
run load env LOAD_PORT="$PORT" LOAD_MEMBERS=20 LOAD_SECONDS=20 LOAD_BUDGET=1 node scripts/test-load.mjs

echo
if [ "$fails" -eq 0 ]; then
  rm -rf "$TMP"
  echo "Every suite passed."
else
  echo "$fails failed. Logs are in $TMP"
fi
exit "$fails"
