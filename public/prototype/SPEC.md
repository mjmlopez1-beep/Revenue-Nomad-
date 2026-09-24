# Revenue Nomad master prototype: product spec

Read with `DESIGN.md` (build contract). Research inventories live outside the repo; builders get their paths in the task.

## 1. What this is

One system for three audiences, built on one data model and one set of standard fields:

- **Clients** (companies hiring; never call them "buyers" in UI copy, L168) browse without login, shortlist, compare, request intros, post projects.
- **Operators** get a Studio that pays off even when no intro happens: who viewed and why, positioning, credibility for direct deals, search and AI visibility, opportunities.
- **Everyone** gets a destination for Fractional GTM: research, the Rate Index, the GTM Framework, the Fit Tag Library, guides, Engagement Blueprints.

The platform's own IP, surfaced everywhere and linked together: **Reputation Index** (0–100, tiers), **CORE** client reviews, **GTM Framework** (6 areas × 7 stages), **Fit Tag Library** (verified vs claimed), **Rate Index**, **State of Fractional GTM** research, **Engagement Blueprints** (scoped project templates), **Match Signals**.

## 2. Route map and owners

| Route | Screen | File |
|---|---|---|
| `#home` | Destination homepage | home.js |
| `#browse`, `#browse.<roleCategory slug>` | Browse talent, category landing pages (SEO role pages) | browse.js |
| `#compare` | Compare up to 4 | compare.js |
| `#op.<slug>` | Operator profile (visual source of truth) | profile.js |
| `#proof.<id>` | Tracked private proof link (profile for one prospect, direct deals) | profile.js |
| `#projects`, `#project.new`, `#project.<id>` | Client projects: list, post (from a Blueprint), ranked matches and responses | projects.js |
| `#blueprints`, `#blueprint.<id>` | Engagement Blueprints library (public IP, SEO) | projects.js |
| `#insights` | Insights hub | insights.js |
| `#report` | State of Fractional GTM 2027 (interactive) | insights.js |
| `#rates` | Rate Index + rate estimator + fractional vs full-time calculator | insights.js |
| `#framework` | GTM Framework explorer (6 areas × 7 stages) | research.js |
| `#library` | Fit Tag Library (taxonomy explorer, demand vs supply) | research.js |
| `#guides`, `#guide.<slug>` | Guides and Q&A pages written for search and AI answers | research.js |
| `#join`, `#join.operator`, `#join.done` | Sign-up decision, operator intake (standard fields), after-submit landing | join.js |
| `#studio`, `#studio.<tab>` | Operator Studio (shell in studio.js) | studio-a.js, studio-b.js |
| `#buyer`, `#buyer.<tab>` | Client workspace: shortlist, intros, projects, company profile + match preferences | buyer.js |
| `#review.<requestId>` | Client submits a CORE review | review.js |
| `#admin`, `#admin.<tab>` | Team: approvals, demand intelligence, intro lifecycle, directory | admin.js |
| `#about`, `#how`, `#results`, `#talk`, `#operators`, `#levels` | Company pages, talk-to-us flow, operator value proposition, levels explainer | pages.js |

Header nav: Browse Talent · Post a Project · Insights · For Operators · About. Right side by persona: visitor (Log in, Talk to us), client (Shortlist, Workspace), operator (Studio, avatar), admin (Admin).

## 3. The loops that make it one system (every builder must wire their side)

1. **Search → impressions → Studio "Why you appeared".** Browse logs `RN.track('search', {q, tags, filters, results})` once per search and `RN.track('impression', {opId, q, filters, position})` for the first 12 results. Studio Visibility reads them (plus illustrative history) through `RN.model.analytics`.
2. **Profile view → "Who viewed" (firmographic, never company names).** Profile logs `profile_view` with `source` (card, search, compare, proof, home, direct). When the viewer is the signed-in client, `RN.track` attaches their company firmographics automatically.
3. **Shortlist / compare → "Compared, not chosen".** `shortlist_add/remove`, `compare_add`, `compare_view` events feed Studio's lost-compare insights.
4. **Intro request → operator inbox → admin lifecycle → client workspace.** One shared record (`RN.intro`), statuses Pending → Interested → RN Qualified → Introduced → Hired / Declined. Operators see requests blind (scope, value, firmographics) until Introduced.
5. **Project (from a Blueprint) → ranked matches → invites → operator responses → client decision.** Same standard fields as operator profiles, so `RN.model.rank(brief)` needs no translation. Invites land in the Studio inbox.
6. **Review request (Studio) → client review page → verified fit tags + Reputation Index.** Operators see only Sent / Completed. A submitted review verifies tags (rated 4.0+), adds to CORE and lifts the score; the profile updates immediately.
7. **Proof link (Studio) → prospect opens `#proof.<id>` → Studio shows who read what.** Direct-deal credibility: the prospect sees a notice that the operator can see what was read.
8. **Operator intake → pending → admin approves (Approve profile, Generate score) → profile live at Vetted 50.** The after-submit page explains the review timeline (comment H328).
9. **Zero-result and unmet searches → Admin demand view and Studio positioning.** "Clients searched for X, only N operators match" nudges operators to add or verify tags.
10. **Research ↔ marketplace.** Every chart in Insights uses the standard picklists, and every chart links into Browse with the same filter applied (for example, the Rate Index for Revenue Operations at $20M–$50M opens Browse with those filters).

## 4. Surface briefs

### Home (`#home`, chrome `over`)
Destination for Fractional GTM, not a directory page. Order: hero (dark photo band `assets/brand/hero-highfive.webp`, headline from the site prototype, search bar with the inline-search tag picker fix, role category chips from `RN.fields.roleCategory`), live network strip (ticker of real activity from the store plus illustrative), "Find by the problem you have" (the `need` picklist → Browse filtered), featured operators (top Reputation Index with photos, `RN.ui.opCard`), the GTM Framework teaser (6 areas), Market pulse (Rate Index medians by category, demand index, top searched this week, linking to Insights), State of Fractional GTM 2027 teaser (book cover, key stats), client quotes (real: Trista Kempa, COO of Ferry, with `quote-1.webp`; label placeholder quotes as samples), how it works in 3 steps, For operators band ("Your Studio shows who viewed you and why"), final "Talk to us" band. Keep L374 hero option "Scale with Proven Experts" as the eyebrow or sub-line if it fits.

### Browse (`#browse`, `#browse.<cat>`)
Search bar + tag picker (inline search), filter drawer built only from `RN.w.field` with standard keys: role category (up to 5, OR), focus areas (fit tags, up to 5, AND; clients see "Focus areas", L131), availability, available time, company revenue, employee range, industries (up to 3), engagement type, hourly rate (one range control), Reputation Index 70+/80+/90+. Active filters as removable chips color-coded by type (L222). Result count, sort (Best match, Reputation Index, Available soonest, Rate). Cards via `RN.ui.opCard` with the `why` line from `RN.model.search`. No dead ends: zero results shows the closest alternatives and "Tell us what you need" (logs zero-result search for Admin). Category landing pages add an SEO intro block (what this role does, typical rate from the Rate Index, common Blueprints, top guides). Rate hidden for logged-out visitors ("Log in to see rate", Scope). Track search and impressions.

### Compare (`#compare`)
Up to 4 side by side. Rows use standard field labels: Reputation Index, CORE average, verified focus areas (top 6), availability, available time, next available start date, rate (login-gated), company revenue, employee range, industries, GTM motion, engagement types, match signals (signed-in client), engagement history count. "N/A" for missing data (L-B). Request intro per column; "Remove"; suggestions to fill empty columns (similar operators). Logs `compare_view` for each operator.

### Profile (`#op.<slug>`) and proof link (`#proof.<id>`)
Rebuild the Operator Profile Explorer faithfully in the unified design system (research: ope_ui.md, ope_data.md). Hero band (night), 3 proof cards (Reputation Index with peer distribution via `RN.chart.bell`, How long clients stay, Would hire again), sticky section sub-nav (only links to sections that exist), About, Fit ("Who {first} is right for": revenue and employee range strips from the operator's own ranges, industries, Operating range role fields via `RN.fields.roleFields`), Expertise (GTM Framework radar + stage bowtie from verified vs claimed tags, top 7 tags then expand, tag definitions on hover), Tech stack (Matt), Work samples / Portfolio (Matt; fixes D371), Engagement History (L319/L322 spec), Client reviews, CORE section. Right rail: Engage card (availability, next available start date, available time, rate login-gated, Request intro via `intro-open`, Add to compare, Save), Match signals (signed-in client, 5 Scope signals from `RN.model.fit`), Reputation Index card with "How score is calculated" (`RN.ui.risExplainer`), Talk to us. Operators viewing their own profile see "Preview as client" and edit shortcuts to Studio. Log `profile_view` once per visit. Proof link variant: a private, focused version for one named prospect (banner "Prepared for Elena Ruiz, Harbor Property Group"), notice that viewing is shared with the operator, sections chosen by the operator, CTA "Book a call with Matt"; opening it appends a view to the proof link record.

### Projects + Blueprints (`#projects`, `#project.new`, `#project.<id>`, `#blueprints`, `#blueprint.<id>`)
Rebuild the Projects prototype (research: a_projects.md) on the standard fields. Blueprints are the templates library turned into public IP: each has the role category, typical hours and term, a 30/60/90-day outcome plan, the focus areas it needs, typical rate range from the Rate Index, and "Post this project" prefilled. Posting is 3 steps max, every field standard. Detail page shows ranked matches (`RN.model.rank`) with match signals, invite in one click, responses as they arrive (operators respond in Studio inbox), decision actions (request intro, decline with reason). Visitors can post; they give company basics once (same as the intro sheet).

### Insights hub, report and Rate Index (`#insights`, `#report`, `#rates`)
Hub: the destination front door (report, Rate Index, GTM Framework, Fit Tag Library, Blueprints, Guides), "This week in fractional GTM" (market pulse), newsletter sign-up. Report: rebuild the State of Fractional GTM 2027 mockup as an interactive long-form page with chapter nav; filter chips on charts using standard picklists (role category, company revenue); each chart ends with a link into Browse or Rates; methodology notes that every cut uses the platform's fields; mark data illustrative. Rate Index: medians and p25/p75 by role category (`RN.data.market.rateIndex`), estimator (role category × company revenue × available time → monthly range, "Typical Engagement Range" format like "$10,000 - $30,000/mo", L58), fractional vs full-time cost calculator, trend chart, link to Browse with filters.

### Framework, Fit Tag Library, Guides (`#framework`, `#library`, `#guides`, `#guide.<slug>`)
Framework explorer: 6 areas × 7 buyer-journey stages (copy from `RN.data.framework`), click a cell to see what good looks like, the focus areas that live there, verified operator count, and "Find operators strong here" → Browse. Buyer self-diagnostic (5 questions → where your gap is → Blueprint + operators). Fit Tag Library: search all tags (`RN.fields.fitTags.options`), grouped by role category and group, definitions, demand vs verified supply (`RN.model.market()`), operators with the tag verified. Guides: 8–12 Q&A pages written to be cited by AI answer engines (clear question title, 2-sentence direct answer, then detail with Rate Index numbers, FAQ list, related operators and Blueprints, schema.org FAQPage shown as a "structured data" note for the dev team). Include a glossary.

### Join (`#join`, `#join.operator`, `#join.done`)
`#join`: sign-up decision page (Scope): "I'm hiring" (no account needed: browse, post a project, talk to us) vs "I'm a fractional operator" (apply). Operator intake: few steps, progress saved, every field from `RN.fields` in the live order: role category and role → identity and location (country → postal code → derived city and time zone; non-US asks US hours) → company fit (revenue range, employee range, industries up to 10, GTM motion after revenue range, L74) → role details for the chosen category (`RN.fields.roleFields`) → availability (status, next available start date, available time, new client capacity 1–10, engagement types, hourly rate) → fit tags (picker with inline search, up to 25, suggestions from role category) → headline, bio, photo, optional intro video → review with edit buttons per section. Submit adds to `RN.store.state.pending`, logs `signup_submit`, emails, and lands on `#join.done`: what happens next (review within 2 business days, profile goes live at Vetted 50, how to raise it), preview of the profile, "View dashboard" (Studio, limited until approved).

### Studio (`#studio`, operator Matt Lopez; shell in studio.js)
studio-a.js owns: **Overview** (this week at a glance: impressions, views, shortlists, intros with deltas and sparklines; "Why clients found you" top 3; Recent activity timeline as a notification center; Demand signal feed replacing How it works (L48); profile strength and next best action; Reputation Index breakdown card; weekly digest preview), **Visibility** (funnel impressions → views → shortlists → intros vs similar operators, search terms that surfaced you, filters applied, where you appeared, who viewed by firmographic segment with small segments grouped, compared-not-chosen with the reason the other operator won, traffic sources), **Positioning** (rate vs Rate Index p25/p50/p75 with win-rate context, focus-area opportunities: demand vs verified supply with one action each, unmet searches in your category, industry and company-size fit vs what clients who view you look like, headline and profile suggestions), **Search & AI visibility** (Google queries and clicks for the profile page, AI answer engine prompts tracked across ChatGPT, Perplexity, Google AI Overviews, Claude, Gemini with mention/citation rate, what raises it, schema.org status, indexable profile URL).
studio-b.js owns: **Inbox** (intro requests blind until introduced, with Interested / Pass and the 72-hour clock; project invites with Respond), **Credibility** (Reputation Index breakdown by the five factors with points available, tier ladder and what each tier unlocks, review requests with Sent / Completed only and a 3-step request form, verified fit tags, proof links: create, copy, see views by section; embeddable verified badge with copyable code), **Opportunities** (fractional job board and predictive prospects from the repo's Operator Portal, research: a_repo.md and repo_samples.json: why-now signals, fit and timing meters, suggested angle, draft outreach), **Profile** (edit with the same standard fields as intake, saved to `RN.store.state.edits`, Preview as client, completeness checklist).

### Client workspace (`#buyer`) and review (`#review.<id>`)
Workspace tabs: Overview (next steps across intros and projects), Shortlist (cards, compare selected, request intros), Intros (status timeline per request), Projects (link into projects.js), Company (company profile with the same revenue, employee, industry picklists + match preferences: role you are hiring for, GTM motion, engagement type, what you need; "Every operator profile you open is scored against these"). Review page (`#review.<id>` for a review request): 3 short steps: engagement (role delivered, dates, engagement type, spend), CORE (four questions verbatim with 1–5 stars each + optional reason, overall experience required, would hire again), focus areas to verify (operator's tags as chips, add missing) and outcomes (1–3, rated Exceeded / Met / Partially met / Not achieved). Submit pushes to `RN.store.state.reviews`, marks the request Completed, emails the operator, and thanks the reviewer.

### Admin (`#admin`)
Approvals (pending operator applications: review, Approve profile, Generate score at 50, request changes), Demand intelligence (top searches normalized, zero-result searches with query and filters, unmet demand by focus area, client funnel search → impression → profile view → intro, supply by role category), Intro lifecycle (move intros through RN Qualified → Introduced → Hired), Operator directory (search, edit, hide), Reviews (no moderation queue: reviews auto-publish; show recent).

### Company pages (`#about`, `#how`, `#results`, `#talk`, `#operators`, `#levels`)
About (story, the CORE values, founder note with `founder.webp`, plain facts), How it works (clients and operators side by side), Results (client outcomes, real quote from Trista Kempa, verified engagements), Talk to us (the site prototype's short auto-advancing flow rebuilt on standard picklists: what you need, company revenue, employee range, start timeline → name and email → suggested operators; phone +1 203-200-0482), For operators (why join when supply is crowded: Studio value without intros, credibility for direct deals, visibility; the invest-more-get-more ladder; no pay-to-win), Levels (Reputation Index tiers, factors, what each tier unlocks, fit tag verification curve).

## 5. Decisions made in this prototype (for the founder to confirm)

| Conflict | Decision | Why |
|---|---|---|
| Three Reputation Index ladders (sheet L247, explorer, live labels) and mismatched operator vs client labels (H390) | One ladder derived from the score everywhere: Indexing (<50, before approval) · Vetted 50–59 · Proven 60–69 · Trusted 70–79 · Elite 80–89 · Apex 90–100 | Consistent with the floor of 50; the explorer is the visual source of truth |
| "Verified" at score 50 for 78 of 100 live profiles with no client evidence | Entry tier renamed "Vetted"; "Verified" is reserved for client-confirmed proof (tags, engagements) | Keeps "Verified" credible, which the badge and proof links depend on |
| Intro start timeline (ASAP / 2 Weeks / 1+ Month) vs availability chips | Client start timeline uses the availability slugs | Matches operator availability with no translation |
| Review form Project / Retainer and LinkedIn size bands | Review form uses the four engagement types and the standard employee ranges | One vocabulary across intake, intros, projects and reviews |
| Hours stored as raw numbers (legacy 5/10/15/30) | Stored as the chip codes (19 = <20, 20, 40, 60, 80, 100, 160) | "Store chip keys, not numbers" |
| Tool proficiency "Builder" vs "Power User" | Power User (intake and comment E397) | Latest founder wording |
| Fit tag filter OR vs AND | AND for focus areas (up to 5), OR within role categories and industries | Part A / Part B final rows |
| GTM motion 4 vs 5 options ("Direct") | Four: PLG, Channel, Inside Sales, Enterprise Sales | "Direct" was never confirmed |
| Who viewed | Firmographic segments only, groups under 5 visits combined; never company or person names | Privacy and trust; Performance & Insights spec |
