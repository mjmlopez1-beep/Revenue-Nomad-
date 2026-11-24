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
# Stage 8: Rate benchmarks and Credits and usage in the new look (tabs and old addresses, the working of What should I charge on the server's floors, ledger kinds with Other and Workflows, ways to earn, no export). In process.
run rates-credits npx tsx scripts/test-rates-credits.mts
# The company lock: every company's name, website and LinkedIn locked for a member until they unlock it (2 credits) or already know it, its About without its name or links, its logo through /api/logo read from the company's own site (a mock server on 127.0.0.1:6781, never an icon service), on a made-up seed in process.
run lock npx tsx scripts/test-company-lock.mts
# Health at the top of Pilot metrics (lib/health.ts) on a made-up state with known counts: the funnel, retention by month, facts and credits a week, invites, plans, the outcomes from members' pipelines (outcomeStats as rows, replies and wins through Merlin at 20 members a group), What's working and What isn't (20 members a group), CSV; and the public data page (app/data). In process.
run health npx tsx scripts/test-health.mts
# The Privacy Policy and Terms of Service (app/privacy, app/terms): both render with the effective date and version, Google's Limited Use sentence word for word with its link and #google, the support address, the Terms' numbers from the billing rules and the sender's duty from the proposals, no em dashes or owner notes, the governing law Connecticut's with its state and federal courts, and the links from the landing page, the signing page, the signed copy, Your credits and each Connect Google; the verification kit's scopes and no secrets.
serve legal npx tsx scripts/test-legal.mts
# Onboarding: suggestions and their heading, Find your seats cards, a new member's title, the weekly email offered at the end.
serve onboard npx tsx scripts/test-onboard.mts
run scan npx tsx scripts/test-scan.mts
# Funding from SEC Form D filings (lib/funding): the EDGAR listings and Form D parsed from fixtures, fair access (User-Agent, spacing, backoff, stop on 403), the conservative match, the daily run on a made-up seed (never a person, never twice, never a new company, counts by reason), the radar's funding source and card. No network.
run funding npx tsx scripts/test-funding.mts
run seniority npx tsx scripts/test-seniority.mts
run digest npx tsx scripts/test-digest.ts
# The studio pass (docs/design-system.md): every email in the new frame (the lockup and its Fractions strip on pine, never the photo banner, one pine button, dark mode), the header strips and the link preview at their sizes, monogram tiles in brand tints only, the system's components (Chip, Stat, EmptyState, PageHead, Logo, WonMoment) and where WonMoment lives, the loading shell with the lockup (over HTTP).
serve studio npx tsx scripts/test-studio.mts
run messages npx tsx scripts/test-messages.mjs
# Messages in the new look (app/post/messages, lib/messagesDraft.ts, lib/messagesAi.ts, app/api/messages): kinds, filters and words, Draft with Merlin from a template in the member's voice, Merlin's AI behind its switch, Close and its own agreement, the route, purge and the export. In process, on a made-up seed.
run messages2 npx tsx scripts/test-messages2.mts
# Alerts in Slack and webhooks (lib/notify), with fetch and name lookups replaced: nothing leaves the machine.
run notify npx tsx scripts/test-notify.mts
# The radar (lib/radar; FEATURE_NAME to members): each signal, the profile and before-function matching, never twice, every signal for every member with nothing locked named, links to the day's companies, the day's view and its 2-credit unlock, instant for Pro, no nothing-days, opt-out and unsubscribe, Slack and email, follow-ups due from Your pipeline (above the companies, a day with only follow-ups still emails once, nothing locked or from Google named). Fetch replaced: nothing leaves the machine.
run radar npx tsx scripts/test-radar.mts
# Crystal Ball's ranges (lib/radar radarView with &range=): Today, Last 7 days, Last 30 days, each company once at its latest day, most likely first; the default (Today, else 7, else 30); an email's day link opens that day alone, one past the keep the default range; "new" counted as before; Trial names, Free one a day across 30 days, the server's check; the 31-day keep and the state's cost. In process, billing live with made-up Stripe settings.
run radar-ranges npx tsx scripts/test-radar-ranges.mts
# Today before the table (GET ?today=1, lib/today.ts): the view's own Me, Crystal Ball's top 4, today's moves with records exactly as the table builds them (its locks with them), under 20 KB, the "Since Tuesday" counts. In process.
run today npx tsx scripts/test-today.mts
# Your three moves today (lib/moves.ts, lib/movesView.ts), the drafted note, the writing voice (lib/voice.ts, save_my_voice, my_voice, todays_moves) and Home's one-time Pro welcome: which three and in what order (someone you know, a seat holder or an open role, nothing), each plan, Google on, off and not connected, a move's record and person the member's own table's and network's, Done and Snooze (the next best, 7 days, the month's count, Undo, others untouched), every note template in every voice never with a locked name, a rate or another member's data, mail links with an address only when the member has it, what a voice refuses, todays_moves the same as Home, ?today=1 under its size, the welcome once. In process, billing live with made-up Stripe settings, fetch replaced.
run moves npx tsx scripts/test-moves.mts
# Your pipeline (lib/pipeline.ts, lib/pipelineActions.ts, lib/pipelineNote.ts): Merlin moves each deal by itself (a note used or Mark as sent, Merlin messages and invites, replies on Merlin, Gmail headers and calendar attendees from a fake Google, the proposal hook, a seat added), Went quiet, corrections, Lost and Not now, follow-ups due in business days with their words, Won and Add it as your seat (credits as usual), intros credited on the win, privacy (another member, the shared table, the export, the connector, never a title, subject or text), my_pipeline and update_pipeline, outcomeStats, and deleting what came from Google (Disconnect and delete everything, access removed at Google kept 29 days and deleted at 30). In process, a fake Google on 127.0.0.1.
run pipeline npx tsx scripts/test-pipeline.mts
# Pipeline in the new look (app/post/pipeline, lib/pipeline.ts value and pitch, lib/pipelineActions.ts papersFor): a deal's value a month and the seat pitched as the member typed them (never a guess), Add a deal, the value on the card, a deal's proposal or contract (their own only), the board's words, filters, sorts and totals, the two Example cards never counted. In process.
run pipeline2 npx tsx scripts/test-pipeline2.mts
# The table's first page before the full view (GET ?first=1, lib/firstPage.ts, app/post/place.ts): each company exactly the full view's record (a member with unlocks, one without, no profile, an admin), only the first 50 rows' companies, the same first rows in the same order on the page, the whole table's counts. In process.
run first npx tsx scripts/test-first.mts
# A member's first visit in a browser (middleware.ts, app/Root.tsx): the page says a sign-in cookie is there (rn_in=1), the same page byte for byte and no cookie signed out; Home's first screen for a member and an admin is Today's small answer with the whole table's own records; a cookie that is nobody's gets the signed-out view from ?first=1 itself; the whole table unchanged.
serve firstvisit npx tsx scripts/test-firstvisit.mts
# The same person on two records at one company (lib/table.ts samePersonHeld): paying for one record's name and title opens the other's for that member alone, at no charge; a different name, or the same name at another company, stays locked; contact details come over only when identical; the first page, Today's patch and the connector agree. In process.
run same-person npx tsx scripts/test-same-person.mts
# Opening companies from Crystal Ball, billing live (lib/table.ts crystalOf, the unlock's from "crystal", lib/radar crystalCompanyIds): Trial and Pro open any Crystal Ball company for 0 credits (theirs, ledger why crystal, the free company of the day kept), people still 1; outside it 2 as before; a company not in theirs refused; Free names nothing there and opens one a UTC day with everything on it (contact details and seat holders), then refused, then again the next day; nothing for Free outside it; a fully known company doesn't use it; another member untouched; the connector's quotes, ?first=1 and ?today=1, the Slack and email words. In process.
run crystal npx tsx scripts/test-crystal.mts
# Crystal Ball in the new look (lib/radar/tune.ts, out.ts, app/post/crystal): tuning by signal group (Profile.radarTune) and that nobody untuned changes, Why not (left out by you, kept off the email by Merlin), each signal's date, window and weight, the page's words. In process.
run crystal-ball npx tsx scripts/test-crystal-ball.mts
# The shared table (lib/table.ts memberView): every member's table, admins' included, the same JSON as the table built whole after each kind of action; nothing one member did in another's; a change in everyone's next table; built once per state. In process.
run viewcache npx tsx scripts/test-viewcache.mts
# Automatic jobs (lib/schedule.ts, lib/scheduler.ts, lib/jobs.ts, app/api/table/jobs, instrumentation.ts): each cadence's due and next run across day and week boundaries, env switches that keep a job off, a running job never started twice, cadence changes admin-only and checked, the timer never during a build or on a test server. In process, homepage reads replaced.
run schedule npx tsx scripts/test-schedule.mts
# The website finder (lib/websites): the candidate domains a name gives, never a private or loopback address (DNS that lies, redirects to one), parked, for-sale, directory and social pages and redirects to another brand turned down, the acceptance rules and their confidence, a country that conflicts, never overwriting a website or LinkedIn page, the 60-day retry, a dry run that writes nothing, the admin's finds and Undo, nothing of it in a member's table, the schedule's default and RN_WEBSITES. A fake DNS and HTTP layer and a server on 127.0.0.1; nothing leaves the machine.
run websites npx tsx scripts/test-websites.mts
# Crystal Ball's likelihood and timing (lib/radar/predict.ts): the rules by stage and ownership, the unknown-type blend, the Beta update, the timing curve, the ranking, Low off the email, the new seat and company facts (who introduced you stays the seat holder's), first sales hires and departed leaders. In process, fetch replaced.
run predict npx tsx scripts/test-predict.mts
# Recently hired (lib/hired.ts): the filter, its counts and sort, the address and saved views, the weekly email's line, the post in Slack and the connector's params, on a made-up seed with fetch replaced.
run hired npx tsx scripts/test-hired.mts
# Hiring now (app/post/hiring): its place in the registry and old addresses, views, columns, fit and way in, status, sorts, and the "role posted" list alert down to the weekly email's matcher. Pure.
run hiring npx tsx scripts/test-hiring.mts
# About texts from company websites (lib/about): extraction, the fetch safety rules and storage, against a mock server on $PORT. Nothing leaves the machine.
run about env ABOUT_PORT="$PORT" npx tsx scripts/test-about.mts
# Who leads each function, from company websites (lib/leaders): titles, the pages found, robots.txt, the page cap, same site only, no names where the HQ isn't in the United States, the record's line, "No fractional Sales yet" and its ranking, the connector, Pilot metrics, RN_LEADERS off. A mock server on $PORT; nothing leaves the machine.
run leaders env LEADERS_PORT="$PORT" npx tsx scripts/test-leaders.mts
# The leaders named from a company's website as decision makers: the CEO and each function's leader, nobody below, US companies only, Remove my name on every later read, a member's own choice, 1 credit for name and title then 1 for the email, merged with a member-added person, the likely email (2 or more emails on one pattern, never verified), the connector, Pilot metrics. A mock server on $PORT.
run leaders-names env LEADERS_PORT="$PORT" npx tsx scripts/test-leaders-names.mts
# Own sites (lib/ownsites, scripts/add-own-sites.mjs): the import (US only, California out, person keys only, counts only), which address is theirs (a name match with first initial forms, nicknames with the last name, their own bio page, obfuscations, a generic inbox only on a one-person site and then invites only: never on a table, the connector or the export, never another domain), robots.txt, the 5-page cap, same site only, the start-up dry run's counts-only log, the switch off and on, 1 credit after the name, Invite to connect and claim outreach, the connector, Remove my name, Undo, the job's row. A mock server on $PORT.
run ownsites env OWNSITES_PORT="$PORT" npx tsx scripts/test-ownsites.mts
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
# Ended seats (scripts/add-past-seats.mjs) and person keys (add-seat-scan.mjs --backfill-holder-keys): the drop rules, year-only dates, status Ended, HMAC ids and keys kept off every view, re-runs, duplicates of current seats, enrichment by match_method, US-only names and the refusal, counts-only output, the firm rule, claiming an ended seat and no hire alert for one, on a made-up seed and key.
run pastseats npx tsx scripts/test-pastseats.mts
run seatspage npx tsx scripts/test-seatspage.mts
# Referral partners: Invite to connect, the claim bonus and the conversation it opens, Message, the Referral partners page and the connector's warm paths, on a made-up seed and key, with its own server.
run partners env PARTNERS_PORT="$PORT" npx tsx scripts/test-partners.mts
# Fractionals (lib/fractionals.ts, lib/fractionalsCore.ts, lib/table.ts personIndex, unlockFractional and activate): one record per fractional (by member, by person key, else the seat), who shows and how, every credit case (no second charge, plans, limits, refunds), invites and activating a profile with its bonuses and cap, Not mine, This isn't me, Remove my name, old claim links, Referral partners' links, the rename, and no person key in any answer. In process, billing live with made-up Stripe settings, fetch replaced.
run fractionals npx tsx scripts/test-fractionals.mts
# Profile, privacy and onboarding (lib/memberName.ts, lib/rates.ts parseRate, lib/table.ts foundOf, displayName, foundSeats): one rule for how a member's name shows to others (directory, seat holders, Peers, Messages, connector, search), one profile per fractional with "Are these yours?" inside the claim rules, the self-serve display name and its guard, one rate reader everywhere a rate is typed, Google turned away (RN_GOOGLE_VERIFIED) with the LinkedIn file and a CSV first, and a new account's starting credits with nothing opened. In process.
run profile npx tsx scripts/test-profile.mts
# Peers (lib/peers.ts, lib/peersCore.ts, lib/mcp/peers.ts): the sections per member and private (the member's own LinkedIn, Google contacts and conversations; complementary functions), pass a lead (the company and its open role's posting open free for the peer alone, the passer's 5 credits on take, 10 a day, mute, a win counted for the passer in outcomeStats), team up (the shared thread, both pipeline entries, the draft, leaving), circles (formation up to 8, the monthly thread, the shared Crystal Ball view with no locked name or anyone's contacts, admin counts), Home's From your peers, the emails to a fake endpoint and their switch, the connector's tools asking first, the export, ?p=fractionals. In process, on a made-up seed.
run peers npx tsx scripts/test-peers.mts
# Closing an account (lib/account.ts, lib/table.ts purgeMember): closed at once (signed out, out of Peers, the directory and every list, no email but the restore link), restored by the link or an admin within 30 days, the scheduled delete after 30 days (profile, LinkedIn import, network, messages written, proposals, AI usage, saved views), facts kept with no attribution, the legal pages and the data page. In process, on a made-up seed.
run closure npx tsx scripts/test-closure.mts
# Plans and payments (lib/plan.ts, lib/billing): the trial and its extension, pause, cancel, the Stripe webhook (signature, each event, once), monthly credits and top-ups, Free's limits on and off, nothing changed with billing off. Fetch replaced: nothing reaches Stripe.
run billing npx tsx scripts/test-billing.mts
# Plans, credits and upgrade moments (the PLG decisions): Pro opens 15 companies a day free, fellow fractionals free, contact details paid, PlanPill, Free / Pro / Close and the landing pricing, the three choices at 0 credits, the trial summary, Keep Pro or Keep Close for an active Close user, no Free earning taper (25 a day for good) with the clock moved. In process.
run plg npx tsx scripts/test-plg.mts
# Your network (lib/google): the OAuth start and callback, sealed tokens, the sync and matching on fixture companies, warmth, named free, privacy (another member, admins, the export, the connector), Gmail via Claude (text refused, the caps, deletion), Gmail headers for test members (the gate, bulk skipped, invalid_grant), disconnect, RN_GOOGLE off. A fake Google server on 127.0.0.1; nothing leaves the machine.
run google npx tsx scripts/test-google.mts
# What a member sees with Google connected (app/post/network, Charge.tsx): a record's Your way in once with the people they know first, Crystal Ball's chip with its warmth printed, the connect moment's numbers against Your network and Crystal Ball (many, 2, none), What to charge them by the Rate benchmarks' own floors on Free and Pro with the member's own rate for them alone, Confirm and Not a seat on the seats their calendar suggests (credits, the claim, when confirmed), another member's table, network and Crystal Ball unchanged, and the line on Your network when Google access was removed. Rendered in process; a fake Google server on 127.0.0.1.
run google-pages npx tsx scripts/test-google-pages.mts
# Granola (lib/granola, app/api/integrations/granola, lib/mcp/granola.ts) and Integrations' top row: connect a personal API key (its shape, a bad key, a plan without the API; sealed, the last four only), calls by a company's domain, by email or any recent call (30 days, newest first, today's before Granola's search has it, a locked company refused, titles only when asked), a picked call's transcript (in pages when too large, transcripts off, Close), 429 backoff and pacing, nothing stored after drafting, the key never in an answer, the export or a log, a revoked key, Disconnect, account closure and the 30-day delete, list_granola_calls, the routes, RN_GRANOLA off; the top row's statuses (Claude grants active, expired and revoked; Google's Calendar, Contacts, Gmail, reconnect, RN_GOOGLE off; Granola; Slack). A fake Granola on 127.0.0.1, billing live with made-up Stripe settings.
run granola npx tsx scripts/test-granola.mts
# Smart ways in (lib/paths): the member's own LinkedIn Connections.csv (its notes, quotes, dates), matching precisely (weak matches refused), each kind of path found and ranked, the words (no locked name, the member's voice), Your hidden paths, privacy (another member, the table, the export, the connector by count only, never a person key), the daily upload limit, delete removing everything from the file, and Disconnect Google taking its ways in and leaving the import. A made-up seed and file.
run paths npx tsx scripts/test-paths.mts
# LinkedIn's names-only Connections.csv (December 2026, lib/paths/csv.ts, index.ts contactsOf linkMatch, lib/notify/knownView.ts): the file reads (an older one as before, neither Company nor URL refused, no Sales Navigator id kept), people placed by profile link alone (a person on file at one company, a member's own profile), never by a name, a locked company a count only, a Californian never matched or named, the record's locked values never shown, Someone you know only when precise, Suggested additions untouched. A made-up seed, in process.
run paths-li npx tsx scripts/test-paths-li.mts
run lix npx tsx scripts/test-linkedin-export.mts
# Your way into a company (lib/paths/rank.ts, plan.ts, ways.ts, lib/mcp/ways.ts, app/post/network/Ways.tsx): Est. success (the links, the hand-offs, who decides, the hiring signals, rounded to 5 and kept between 5 and 85, more hand-offs lower), the plan's state machine (go, each step, No reply yet and its nudge, can't help and plan B, switch), persistence (hop ids, never a name) and Go with on the pipeline deal, the gates (a locked company never named, people by today's rules, public-profile names on US seats outside California only, Google and LinkedIn people never named by ways_in, no Gmail text, LinkedIn never Merlin's source), the export, deleting (Google, the LinkedIn import, account closure), Where you can get in, Home's move, the route line, the pages and the reduced-motion CSS. A made-up seed, in process.
run paths3 npx tsx scripts/test-paths3.mts
# Warm paths (lib/paths/ways.ts warmOf, rank.ts, app/post/network/WarmPaths.tsx): the lines placed from the data, all four quadrants, fellow fractionals as routes, the locked-match rule, the file without Google, ways_in with RN_PATHS, the page's words, no export. A made-up seed, in process.
run warm npx tsx scripts/test-warm.mts
# Numbers and names that agree across screens (branch consist): a person shown with one company, never another company's title beside the one they decide at (lib/paths find, words, ways, intro). Pure, a made-up world.
run consist npx tsx scripts/test-consist.mts
# Suggested additions from your connections (lib/paths/suggest.ts, RN_SUGGEST, off by default): only ticked rows added, name, title and relationship only, Google never feeds it, California and non-US never suggested, credits and the cap, Remove my name. In process.
run suggest npx tsx scripts/test-suggest.mts
# Proposals (lib/proposals, lib/mcp/proposals.ts): the library and its checklist, the transcript extractor (no model), create, edit and reorder, fields from the record, profile and call, the rate suggestion, Free's one template and Pro's sending, privacy (another member, the export, the signer's view), send with a signed expiring link, the email code, consent, signing with the document's SHA-256 and the audit trail, decline, void, a new version on a change, an expired link, the pipeline moving on send, sign and decline (Proposal, Won with the proposal's fee and hours and any intro credited, Lost), the connector's tools asking first, drafting with Claude against a fake Anthropic endpoint (off without RN_AI_DRAFTS, the kit in one request, the transcript never stored), the AI budget (metered in micro-dollars from the API usage, nothing charged on a failure, allowed just under 100 percent and refused at it, the trial budget, packs after the budget and granted once per payment, the 50, 75 and 90 percent notices once a month, the month rolling over, a percentage only in what the member reads, Build it in Claude never metered), get_proposal_kit, My templates read from a .docx, .pdf, .md and .txt made in the test, one unit after a price, the company named once in the email. In process, billing live with made-up Stripe settings, email to a fake endpoint, fetch replaced.
run proposals npx tsx scripts/test-proposals.mts
# Proposals in the new look (app/post/proposalsPage): the rows' words, views and next steps, the Example rows never counted, a template from the library read back, the outline (Proof says Evidence Bank is coming), the client preview, and in the source: Merlin never Claude, no export, the one editor's saving and two-tab check, the addresses unchanged. Pure.
run proposals-page npx tsx scripts/test-proposals-page.mts
# Evidence Bank on the server (lib/evidence, lib/mcp/evidence.ts save_evidence_case): fit tags, drafts from a seat, the client hidden by default, Close only, case studies from the member's agent marked for review, the coverage count moving from 0 to 1 of 10 on a save. In process, on a made-up seed.
run evidence npx tsx scripts/test-evidence.mts
# Evidence Bank as the rest of Merlin uses it (lib/evidenceWire.ts): Proof's pick, the Closest evidence column, one source for the ranking. In process, on a made-up seed.
run evidence-wire npx tsx scripts/test-evidence-wire.mts
# Evidence Bank's page (app/post/evidence): Case studies by client with real name and logo, tiles that edit in place, tag search, the wizard and where it picks up, Build this for me, the coverage count from the saved list, Close only, no export. Pure.
run evidence-page npx tsx scripts/test-evidence-page.mts
# Documents to sign (lib/documents): a PDF uploaded and kept private on the volume, fields placed for each signer, signing in order (the sender too), the plan gate, the signer's code, consent, hash and fields, typed and drawn signatures, the final PDF with the values stamped in and the audit trail page (read back with pdf-lib and pdf.js), both fingerprints, everyone emailed the PDF, decline, void, expiry, the pipeline, privacy. In process, PDFs made here, email to a fake endpoint.
run documents npx tsx scripts/test-documents.mts
# After it goes out (lib/close, app/api/sign/activity): beacon validation and rate limits, readers by a cookie (never an IP), section and option time capped by the time that passed, the follow-up rules, alerts (first open, a new reader, engaged at most once in 6 hours, signed and the pipeline at Won, each channel's switch, Slack only when connected), reminders (day 2, day 7, before the link closes, off per proposal, stopped on sign, decline and withdraw), the renewal and its copy, the Close gate, a document moving to Won, privacy, the plan rows. In process, email and Slack to fakes.
run activity npx tsx scripts/test-activity.mts
# What the client sees and signs (app/sign, lib/proposals/pricing.ts, sections.ts, pdf.ts, lib/seal.ts, app/check): 1, 2 and 3 options and a short one-price proposal rendered with their sections and data-section ids, add-on totals, the pick changing until signed and locked after, the choice in the signed record, the member's view and both emails, the sealed PDF with Unicode names, the seal (a match, an altered byte, an unknown file), /check storing nothing, the seal key without RN_SEAL_KEY, documents sealed too, and the Close gates. In process, PDFs made here, email to a fake endpoint.
run clientview npx tsx scripts/test-clientview.mts
# Getting contracts out with no manual work (lib/documents/detect.ts, smart.ts, lib/proposals/change.ts, numbers.ts, startCall.ts, the connector): signature blocks found on made-up PDFs (two columns, stacked, Client and Consultant under rules, none), who signs in order and where each was found, the note in the member's voice, the plan saved and sent with a title to check, the numbers check, Change it off without the key and through a fake Anthropic API (agree first, only the changed sections, metered, a new version kept, compare and restore), draft_proposal_from_call (never kept, a Granola note id through its resolver), change_proposal and send_document_for_signature asking first, the Close gates and plan rows, and Merlin's AI wording never naming Claude or Anthropic while the Privacy page does. In process, PDFs made here.
run contracts npx tsx scripts/test-contracts.mts
# What joins the four Close pieces (scripts/test-close-merge.mts): a Granola call picked and drafted with a fake Granola and a fake AI, nothing Granola-specific with RN_GRANOLA off, the connector's granola_note_id (Close only); the client's page with options as options and each section's own title, a pick and an add-on in the member's activity, the notice on every signing page, a download of the signed PDF told and nothing else once signed; a question and a hand-off as alerts; the three ways the member signs (none, now, countersign) with one Signed alert and the pipeline to Won exactly once, the renewal clock from the fully signed moment; a link with no end date (null, 0 in the token, no warning before it closes, never expired); the reminder switches saved through /api/activity before a send, for a proposal and a document; the connector's pricing, link length and signature mode; the member's saved signature on a contract they sign last; wording, plan rows and legal versions; account closure deleting every new store and the export holding none. In process, PDFs made here.
run close-merge npx tsx scripts/test-close-merge.mts
# The QA fixes on signing, proposals, activity and alerts (scripts/test-qa6.mts): the email code before asking, passing on or declining; the hand-off count; each sign field's type; one email per event and every switch respected; client_signed until the countersignature; the countersignature on the timeline; /check naming every signer; the beacon taking only the proposal's own ids; a deleted proposal's notifications gone; the drawing's own size words; a CJK name never "?" in the PDF; a typed company kept; signed-out 401s; a made-up blank in words; a stale write refused from a tab and the connector; a restored version's options. In process, on a made-up seed.
run qa6 npx tsx scripts/test-qa6.mts
# Saved views: rename, the same view twice, remove and Undo, on the server and through the connector, on a made-up seed.
run views npx tsx scripts/test-views.mts
# Alerts (Stage 7a, lib/inbox.ts, lib/notify/events.ts afterWatch): the alert fields on saved lists, the plan's gates, the bell's inbox and the alert log, a seat ended, a new leader, a fact, funding, Companies you follow, Someone you know changed jobs, the locked naming rule, one-click turn-off, export and purge. In process, on a made-up seed.
run alerts npx tsx scripts/test-alerts.mts
# Agent access (Stage 7a, lib/mcp/agentTools.ts, lib/mcp/log.ts): every connector tool on the page, switches that refuse in plain words, a log with no arguments, the daily spend limit across calls and agents, export and purge, the page. In process, on a made-up seed.
run agent npx tsx scripts/test-agent.mts
# The credits meter (lib/creditsMeter.ts, Me.meter): the period (since the plan grant, else the UTC month), what is left, the connector's line after a spend with the top-up and upgrade at 20% or less, the bell once a period at 80% used and at 0, the pages. In process, on a made-up seed.
run meter npx tsx scripts/test-meter.mts
# Settings (Stage 8, app/post/settings): the sections, the old addresses that land on one (?p=integrations, Google's return, ?p=voice), no export or download anywhere, each Connections Remove making its source's own delete, Your setup's counts, Notifications on Alerts and workflows' own switches, the sample note, the words, every section drawn for a made-up member. In process, no seed.
run settings npx tsx scripts/test-settings.mts
run svcicons npx tsx scripts/test-service-icons.mts
# The Stage 7a merge's wiring (lib/notify/knownView.ts, KnownMoves.tsx): Someone you know on Home and Warm paths from the LinkedIn file and CSV only (never Google, no Californian named, a locked company described), and the connector setting an alert's triggers and how often through the app's plan gate. In process, on a made-up seed.
run known npx tsx scripts/test-known.mts
# Workflows (Stage 7b, Beta, RN_WORKFLOWS, lib/workflows): a run's estimate equals what it spends, auto-spend by default, the warning once, the cap that stops and asks (yes runs, no doesn't), Merlin's daily caps, the workflow's name on every ledger line, notes as drafts only, never a locked company or a Californian named, the flag off running nothing, the plan gates, reminders, a signed proposal's Evidence Bank draft, export and purge. In process, on a made-up seed.
run workflows npx tsx scripts/test-workflows.mts
# A call ends (lib/calls): a fake Granola MCP server, a fake Fathom API and a fake AI endpoint, in process.
run call-triggers npx tsx scripts/test-call-triggers.mts
# The invite loop: the inviter told once when a friend joins (app, email, Slack), never the friend's email, and the invitee's onboarding line, on a made-up seed with fetch replaced.
run invites npx tsx scripts/test-invites.mts
run robust env ROBUST_PORT="$PORT" npx tsx scripts/test-robust.mts
# [ux ws3] One nudge at a time (app/post/nudges.ts): which one shows, its words, and two toasts from one action as one sentence.
run nudges npx tsx scripts/test-nudges.mts
# The way around (app/post/navModel.ts, Sidebar.tsx): every page one link away, one item on and the right one, admin-only items for admins, the counts the table's own (place.ts placeRows), Home's search by page name. In process, on a made-up seed.
run nav npx tsx scripts/test-nav.mts
# The QA fixes (scripts/test-qafix.mts): names that are a greeting or a page's words refused and hidden (and scripts/clean-bad-names.mjs on a copy), odd company names for review, outcomes counted only for stages that happened, no logo a 204, an unlock already done elsewhere a calm notice, Home's Crystal Ball line, ?sig= clamped; then in Chromium as a Pixel 7 on its own server: Back closes the sheet on top and keeps what was typed, its X never pops twice, a long search, logos, a used sign-in link, ?sig=2099-12-31.
run qafix env QAFIX_PORT="$PORT" npx tsx scripts/test-qafix.mts
# The QA fixes, batch B (scripts/test-qafixb.mts): Undo an unlock and the question before a spend, Unlock and send, Hide my name on my seats, the words (who sees a name, the free opens, PRO_STORY, plain words for a 500, the proposal's labelled blanks, Draft it's signer); then in Chromium at 1440 and as an iPhone 13: the top search keeps every letter and Add never opens, the price at rest, Undo, the full table failing then Try again, Fractionals at 1024, 44px targets.
run qafixb env QAFIXB_PORT="$PORT" npx tsx scripts/test-qafixb.mts
# The QA fixes, batch 6U (scripts/test-qa6u.mts): the plan by name everywhere (Free, Pro, Close, Close trial: billing page, thanks, sidebar, renewal and trial emails, the credit history, the month's credits on a yearly plan), Home's trial card, one balance on the table, Unlock and send asks once, where a claimed seat was found, You've messaged, locked sites as dots; then in Chromium: the record modal at 768 with focus back, onboarding's chips by arrow keys, Fractionals at 768, 44px on touch.
run qa6u env QA6U_PORT="$PORT" npx tsx scripts/test-qa6u.mts
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
