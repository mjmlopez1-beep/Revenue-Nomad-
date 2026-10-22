# DFD Index: Input Inventory (build step 1)

Compiled 2026-10-22. The brief's INPUTS block was blank, so this inventory comes from a search of Matt's Google Drive. **Nothing has been generated yet.** This file is the first checkpoint: the build waits here for review.

## Bottom line

1. **Measured patient-access data exists for one state, Oregon, and only as statewide totals.** The Oregon benchmark doc reports call results across 25 organisations. The per-organisation scores appear only as an embedded chart image, and the line-level call log is not in Drive.
2. **No measured data exists for any other state.** This includes after-hours calls, IVR depth and every digital metric.
3. **The system universe is strong.** It holds 1,154 real systems across 50 states plus DC and PR, with provider, hospital and RHC counts. It also includes hand-tiered lists for OR, PA, ME and AZ.

Under the integrity rule, there are therefore **zero records that can be tagged `measured` today** at the system level. See "Decisions needed" below.

## Sources found

| # | Source (Drive) | What it is | Coverage | Usable for |
|---|---|---|---|---|
| 1 | *Digital Front Door: Oregon Patient Access Benchmark 2026* (Doc `157t3c…`, Oct 1) | Published-style report from AI-voice-agent calls | OR: 25 orgs, 575 clinic lines, 634 calls, all on Mon 2026-09-21, in two business-hours windows | Anchoring the Phone Access distribution (aggregates only) |
| 2 | *Oregon_Rural_Rounds_Tiered_Account_List* (Sheet `1M_z22…`, Sept 18) | Tiered target list | OR: 41 orgs (real names) | Segment, clinic count, rurality |
| 3 | *Pennsylvania_Rural_Rounds_Tiered_Account_List* (Sheet `1WevjO…`, Sept 21) | Tiered target list | PA: 50 orgs | Segment, clinic count, rurality |
| 4 | *Rural_Rounds_ME_AZ_audit* (Sheet `1cX2…`, Oct 1) | Audit / outreach priority | ME 18, AZ 17 (plus rosters of 30 each) | Segment, partial clinic counts |
| 5 | *Lookalike-Scored-2026-04-27-Full.xlsx* | Scored national system list | **1,154 systems, 50 states + DC + PR** | Sample frame: provider, hospital, RHC and employee counts, integration level |
| 6 | *ClarusCare - Lookalike Model v1 (Oct 2026)* | Planned attribute model | OR control set | Methodology intent only. Answer rate, after-hours and scheduler slots are all "Not yet run". |
| 7 | *Rural_Rounds_Schedule_Board* | Campaign tracker | States done: NC, KS, ID, NJ, OR, PA. Active: AZ, CO, UT, CA, ME, MD, MS. | State context only |
| 8 | *NJ_Target_List_Scored* | Target list | NJ: 18 accounts | Not yet pulled |
| ✗ | *CALL-INTELLIGENCE-ACCEPTANCE-CRITERIA-TEST-RESULTS.xlsx* | Product QA for the Weave/Salesforce call-intelligence feature | n/a | **Not patient-access data. Excluded.** |
| ✗ | *Clarus Care - Call Tracker* | Outbound sales calls to executives | n/a | **Excluded.** It holds personal contact data and is not a measurement source. |

## Oregon benchmark: what it actually gives us

Figures below are quoted from the doc text.

- **Calls:** "634 calls to 575 distinct clinic lines." Calls ran mid-morning and early afternoon PT, and "most lines received one call per window."
- **Answer rate:** "53 percent of calls reached a person. 338 of 634."
- **Time to human:**
  - "Median 58 seconds… the average was 2 minutes."
  - 1 in 4 answered calls waited more than 2 minutes, and 1 in 10 waited more than 5 minutes.
  - 13 calls waited more than 10 minutes. The longest wait that still reached a person was 19 min 49 s.
- **Failures:**
  - 112 calls hit the 20-minute cap.
  - On 38 lines the call sat in queue the full 20 minutes.
  - 24 lines held the call and then disconnected.
  - 6 lines held the call and then said nobody was available.
- **Per-system index:** a composite of reach rate, wait and bad outcomes, zero-centred on the state average, for 25 organisations. **It exists only as image `i.3`, not as data.**

**Problems to resolve before any of this goes on a page a COO will read:**

1. **The answer-rate denominator contradicts the stated method.** The text says calls abandoned before an answer are excluded, yet 338/634 uses every call as the denominator.
2. **The call count does not reconcile.** 575 lines plus 64 dialed twice gives 639, not 634.
3. **The headline and body disagree.** The title says "just over 50%" and the body says 53%.
4. **The latest version drops caveats.** The "-clean" draft said the answer rate "is a floor" and that single-clinic numbers are "directional". The latest version removed both lines.

## Field coverage vs. the brief's schema

"Agg" means only statewide aggregates exist.

| Brief field / metric | Status | Source and fill |
|---|---|---|
| system_name, state, city | ✅ | Lookalike-Scored 1,154/1,154. State lists 100%. |
| system_type | 🟡 | Integration level 945/1,154. Segment 100% on OR, PA, ME, AZ. |
| location_count | 🟡 | OR 38/41, PA 46/50, ME/AZ partial. Nationally only hospitals + RHC as a proxy. |
| provider_count | 🟡 | Lookalike-Scored only, 1,154/1,154. Missing from every state list. |
| rurality | 🟡 | 0–5 score on the OR/PA lists. Rural-presence sub-score nationally. Needs a RUCA mapping to rural / micro / metro. |
| ehr | 🟡 | OR 18/25 and PA ~29/51, Tyler's tabs only. Leave null elsewhere. |
| **Phone Access** (answer rate, time to human) | 🟠 Agg | OR statewide only. No per-system values. |
| Phone Access: IVR menu layers | ❌ | Not captured. |
| Phone Access: abandon rate | 🟠 Agg | OR counts only: hold-then-drop and 20-minute cap. |
| Phone Access: answered within stated hours | ❌ | Stated hours were never collected. |
| **After-Hours** (all metrics) | ❌ | No after-hours calls placed anywhere. |
| **Digital Self-Service** (booking, portal, forms, next-available, click-to-call) | ❌ | Never inspected. |
| **Findability & Accessibility** (2-click number/hours, mobile, WCAG) | ❌ | Never inspected. |
| measured_at | 🟠 | OR only: 2026-09-21. |

## What this means for the build (brief §9 flags)

- **Phone Access is the only pillar with any real anchor, and that anchor is thin.** It rests on one state, one day and two windows, with no per-system rows. It can set plausible ranges for answer rate and time to human, and their skew: median 58 s, mean about 120 s, and a long tail to the 20-minute cap. It cannot support correlations such as IVR depth versus hold time, because IVR depth was never measured.
- **After-Hours, Digital Self-Service and Findability have no real data at all (0%).** Building all four pillars now would mean three of them are entirely invented. Per §9, I'm flagging this rather than generating it.
- **Two of the empty pillars are cheap to measure.** Digital Self-Service and Findability come from inspecting public websites, not calls. A crawler plus an automated accessibility checker such as axe-core could produce real `measured` data for all ~1,150 systems in the frame in days. After-Hours needs one more voice-agent batch after 6pm, which the Lookalike Model already plans as variable 20.

## Decisions needed before step 2

1. **Get the Oregon line-level export.** This means the Retell / voice-agent export or the "full report" with per-system rows. Without it, even Oregon cannot carry `measured` records with real names, and the page has no real anchor.
2. **Are the 15 already-called states (per the meeting) in a dialer export somewhere?** Only Oregon turned up in Drive. If Gabe or Nate have the others, send paths.
3. **Pick a pillar plan:**
   - **(a) Recommended.** Build the prototype on all four pillars, but run the web-inspection pass for Digital Self-Service and Findability against the real 1,154-system frame first. Those two pillars become `measured` nationally. Phone Access is synthetic except Oregon. After-Hours stays synthetic and is clearly labelled until a night batch runs.
   - **(b)** Ship three pillars and drop After-Hours until it is measured.
   - **(c)** Treat all four pillars as synthetic for the mockup, with invented names only. This is the fastest route, but the page can show no real data at all.
4. **Fix the Oregon doc issues above** before any figure from it is quoted as a headline.
5. **Sample frame:** use Lookalike-Scored (1,154 real systems) plus the OR, PA, ME, AZ and NJ lists, then top up toward roughly 1,500–2,000 with Tyler's combined system list due Tuesday. Confirm that's the plan.

## Data handling notes

- **No patient PHI was found in any source.**
- **Lookalike-Scored contains personal contact details.** It has names, emails and phones for 639 systems' executives. Those columns were stripped from every working copy and will never enter the dataset.
- **Internal staff names in notes columns will not be carried into the dataset.** They appear across the account lists.
- **Raw pulls are kept outside the repo.** They are in the session scratchpad and are not committed, because they contain real organisation targeting notes.
