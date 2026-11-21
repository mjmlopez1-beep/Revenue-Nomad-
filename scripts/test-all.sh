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
# The free company of the day (one free company unlock a member a day) is off on these servers
# (RN_FREE_COMPANY=off, honoured only with RN_SCAN_TEST=1), so their checks of what unlocks cost
# stay exact. FREE_COMPANY=on serve ... keeps it on: credits-free checks it over HTTP, and the
# in-process suites (lock, radar, invites, econ, billing) run with it on.
serve() {
  local name=$1
  shift
  mkdir -p "$TMP/data-$name"
  RN_DATA_DIR="$TMP/data-$name" RN_STARTER_CREDITS=25 RN_ADMIN_EMAILS=admin-qa@example.com RN_SCAN_TEST=1 RN_CRON_SECRET=qa-cron RN_LOGO_LOOKUP=off RN_FREE_COMPANY="${FREE_COMPANY:-off}" \
    RN_SUPPORT_EMAIL="$SUPPORT_EMAIL" RN_INTRO_EMAIL="$INTRO_EMAIL" \
    node node_modules/next/dist/bin/next start -p "$PORT" > "$TMP/$name.server.log" 2>&1 &
  local pid=$!
  for _ in $(seq 1 80); do
    curl -s -o /dev/null "http://localhost:$PORT/api/health" && break
    sleep 0.5
  done
  run "$name" env BASE="http://localhost:$PORT" STARTER=25 SUPPORT_EMAIL="$SUPPORT_EMAIL" INTRO_EMAIL="$INTRO_EMAIL" FREE_COMPANY="${FREE_COMPANY:-off}" "$@"
  kill "$pid" 2> /dev/null
  wait "$pid" 2> /dev/null
  rm -rf "$TMP/data-$name"
}

run types npx tsc --noEmit -p .
serve server node scripts/test-server.mjs
serve rules node scripts/test-rules.mjs
serve credits node scripts/test-credits.mjs
# The free company of the day over HTTP: 0 credits, its ledger line, then 2 credits, and the day's limit.
FREE_COMPANY=on serve credits-free env ONLY=freeco node scripts/test-credits.mjs
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
# The company lock: every company's name, website and LinkedIn locked for a member until they unlock it (2 credits) or already know it, its About without its name or links, its logo through /api/logo with fetch replaced, on a made-up seed in process.
run lock npx tsx scripts/test-company-lock.mts
# Onboarding: suggestions and their heading, Find your seats cards, a new member's title, the weekly email offered at the end.
serve onboard npx tsx scripts/test-onboard.mts
run scan npx tsx scripts/test-scan.mts
# Funding from SEC Form D filings (lib/funding): the EDGAR listings and Form D parsed from fixtures, fair access (User-Agent, spacing, backoff, stop on 403), the conservative match, the daily run on a made-up seed (never a person, never twice, never a new company, counts by reason), the radar's funding source and card. No network.
run funding npx tsx scripts/test-funding.mts
run seniority npx tsx scripts/test-seniority.mts
run digest npx tsx scripts/test-digest.ts
run messages npx tsx scripts/test-messages.mjs
# Alerts in Slack and webhooks (lib/notify), with fetch and name lookups replaced: nothing leaves the machine.
run notify npx tsx scripts/test-notify.mts
# The radar (lib/radar; FEATURE_NAME to members): each signal, the profile and before-function matching, never twice, every signal for every member with nothing locked named, links to the day's companies, the day's view and its 2-credit unlock, instant for Pro, no nothing-days, opt-out and unsubscribe, Slack and email. Fetch replaced: nothing leaves the machine.
run radar npx tsx scripts/test-radar.mts
# Today before the table (GET ?today=1, lib/today.ts): the view's own Me, Crystal Ball's top 4, today's moves with records exactly as the table builds them (its locks with them), under 20 KB, the "Since Tuesday" counts. In process.
run today npx tsx scripts/test-today.mts
# Your three moves today (lib/moves.ts, lib/movesView.ts), the drafted note, the writing voice (lib/voice.ts, save_my_voice, my_voice, todays_moves) and Home's one-time Pro welcome: which three and in what order (someone you know, a seat holder or an open role, nothing), each plan, Google on, off and not connected, a move's record and person the member's own table's and network's, Done and Snooze (the next best, 7 days, the month's count, Undo, others untouched), every note template in every voice never with a locked name, a rate or another member's data, mail links with an address only when the member has it, what a voice refuses, todays_moves the same as Home, ?today=1 under its size, the welcome once. In process, billing live with made-up Stripe settings, fetch replaced.
run moves npx tsx scripts/test-moves.mts
# The table's first page before the full view (GET ?first=1, lib/firstPage.ts, app/post/place.ts): each company exactly the full view's record (a member with unlocks, one without, no profile, an admin), only the first 50 rows' companies, the same first rows in the same order on the page, the whole table's counts. In process.
run first npx tsx scripts/test-first.mts
# The same person on two records at one company (lib/table.ts samePersonHeld): paying for one record's name and title opens the other's for that member alone, at no charge; a different name, or the same name at another company, stays locked; contact details come over only when identical; the first page, Today's patch and the connector agree. In process.
run same-person npx tsx scripts/test-same-person.mts
# Opening companies from Crystal Ball, billing live (lib/table.ts crystalOf, the unlock's from "crystal", lib/radar crystalCompanyIds): Trial and Pro open any Crystal Ball company for 0 credits (theirs, ledger why crystal, the free company of the day kept), people still 1; outside it 2 as before; a company not in theirs refused; Free names nothing there and opens one a UTC day with everything on it (contact details and seat holders), then refused, then again the next day; nothing for Free outside it; a fully known company doesn't use it; another member untouched; the connector's quotes, ?first=1 and ?today=1, the Slack and email words. In process.
run crystal npx tsx scripts/test-crystal.mts
# The shared table (lib/table.ts memberView): every member's table, admins' included, the same JSON as the table built whole after each kind of action; nothing one member did in another's; a change in everyone's next table; built once per state. In process.
run viewcache npx tsx scripts/test-viewcache.mts
# Automatic jobs (lib/schedule.ts, lib/scheduler.ts, lib/jobs.ts, app/api/table/jobs, instrumentation.ts): each cadence's due and next run across day and week boundaries, env switches that keep a job off, a running job never started twice, cadence changes admin-only and checked, the timer never during a build or on a test server. In process, homepage reads replaced.
run schedule npx tsx scripts/test-schedule.mts
# Crystal Ball's likelihood and timing (lib/radar/predict.ts): the rules by stage and ownership, the unknown-type blend, the Beta update, the timing curve, the ranking, Low off the email, the new seat and company facts (who introduced you stays the seat holder's), first sales hires and departed leaders. In process, fetch replaced.
run predict npx tsx scripts/test-predict.mts
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
# Fractionals (lib/fractionals.ts, lib/fractionalsCore.ts, lib/table.ts personIndex, unlockFractional and activate): one record per fractional (by member, by person key, else the seat), who shows and how, every credit case (no second charge, plans, limits, refunds), invites and activating a profile with its bonuses and cap, Not mine, This isn't me, Remove my name, old claim links, Referral partners' links, the rename, and no person key in any answer. In process, billing live with made-up Stripe settings, fetch replaced.
run fractionals npx tsx scripts/test-fractionals.mts
# Plans and payments (lib/plan.ts, lib/billing): the trial and its extension, pause, cancel, the Stripe webhook (signature, each event, once), monthly credits and top-ups, Free's limits on and off, nothing changed with billing off. Fetch replaced: nothing reaches Stripe.
run billing npx tsx scripts/test-billing.mts
# Your network (lib/google): the OAuth start and callback, sealed tokens, the sync and matching on fixture companies, warmth, named free, privacy (another member, admins, the export, the connector), Gmail via Claude (text refused, the caps, deletion), Gmail headers for test members (the gate, bulk skipped, invalid_grant), disconnect, RN_GOOGLE off. A fake Google server on 127.0.0.1; nothing leaves the machine.
run google npx tsx scripts/test-google.mts
# What a member sees with Google connected (app/post/network, Charge.tsx): a record's Your way in once with the people they know first, Crystal Ball's chip with its warmth printed, the connect moment's numbers against Your network and Crystal Ball (many, 2, none), What to charge them by the Rate benchmarks' own floors on Free and Pro with the member's own rate for them alone, Confirm and Not a seat on the seats their calendar suggests (credits, the claim, when confirmed), and another member's table, network and Crystal Ball unchanged. Rendered in process; a fake Google server on 127.0.0.1.
run google-pages npx tsx scripts/test-google-pages.mts
# Saved views: rename, the same view twice, remove and Undo, on the server and through the connector, on a made-up seed.
run views npx tsx scripts/test-views.mts
# The invite loop: the inviter told once when a friend joins (app, email, Slack), never the friend's email, and the invitee's onboarding line, on a made-up seed with fetch replaced.
run invites npx tsx scripts/test-invites.mts
run robust env ROBUST_PORT="$PORT" npx tsx scripts/test-robust.mts
# [ux ws3] One nudge at a time (app/post/nudges.ts): which one shows, its words, and two toasts from one action as one sentence.
run nudges npx tsx scripts/test-nudges.mts
# The way around (app/post/navModel.ts, Sidebar.tsx): every page one link away, one item on and the right one, admin-only items for admins, the counts the table's own (place.ts placeRows), Home's search by page name. In process, on a made-up seed.
run nav npx tsx scripts/test-nav.mts
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
