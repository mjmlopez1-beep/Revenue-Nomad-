# Metric definitions

Scoring logic lives in `scripts/scoring.py`. Weights and letter-band thresholds are defined once there and passed to the page through the dataset's `meta` block.

**Letter bands** apply to both the composite score and each pillar: A ≥ 85, B ≥ 70, C ≥ 55, D ≥ 40, F < 40.

**Composite DFD Score** = 0.35 × Phone + 0.25 × After-Hours + 0.25 × Digital + 0.15 × Findability.

## Phone Access (35%)

Captured by an AI voice agent calling published clinic numbers in business hours. There are at least two windows per line, morning and early afternoon, with a 20-minute cap.

| Field | Measures | Unit | Share of pillar |
|---|---|---|---|
| `answer_rate` | Share of calls that reached a live person | 0–1 | 40%, scored linearly |
| `time_to_human_s` | Median time from call start to the first word from a live person, read from the transcript | seconds | 35%, log scale: 1 s = 100, 2 min ≈ 32, 20 min = 0 |
| `ivr_layers` | Number of phone menu steps before a person | count | 15%: 0–1 layers = 100, then −22 per extra layer |
| `abandon_rate` | Share of calls that were held and then dropped or told "nobody available" | 0–1 | 10%: 0 = 100, 30%+ = 0 |

Whether a call was answered during stated hours is folded into `answer_rate`, because all calls fall inside stated hours.

## After-Hours (25%)

Captured from one call to the main line after 6 pm local time.

| Field | Measures | Share of pillar |
|---|---|---|
| `ah_outcome` | `live` (100), `service` (80), `voicemail` (30), `dead` (no answer or message, 0) | 75% |
| `ah_urgent_path` | Whether the caller is offered a way to reach someone urgently, such as a nurse line, on-call or ED guidance | 25% |

## Digital Self-Service (25%)

Captured by inspecting the public website as a new patient would. Each item is a yes/no check; the points are the item's weight out of 100.

- `online_booking`: a new patient can book without calling (35)
- `patient_portal`: a portal is linked (20)
- `request_forms`: there is an appointment-request or contact form (15)
- `next_available_visible`: the next open appointment time is shown (15)
- `click_to_call`: the main number is a `tel:` link on mobile (15)

## Findability & Accessibility (15%)

- `number_within_2_clicks`: the main access number is reachable from the home page in two clicks or fewer (30 points)
- `hours_within_2_clicks`: hours are reachable in two clicks or fewer (20 points)
- `mobile_responsive`: the site renders without horizontal scroll at 390 px (20 points)
- `wcag_violations`: the count of serious and critical WCAG 2.1 AA issues an automated checker (axe-core) finds on the home page and the find-a-location page (30% of the pillar):
  - 0 issues = 100
  - 10 issues = 50
  - 30 or more issues = 0

  This is a **signal**, not a conformance audit. It is in scope because of the HHS Section 504 web-accessibility deadline of May 11, 2027.

## In this concept build

Every value above is **synthetic**. The generator in `scripts/build_dataset.py` uses one latent "access maturity" factor per system, which produces realistic correlations:

- Deeper phone menus go with longer waits and lower answer rates.
- Larger systems have more digital self-service but deeper menus.
- Rural and FQHC sites lag on digital.

The generator also keeps outliers in both directions. Oregon records are nudged toward the measured statewide aggregates: about 53% of calls reaching a person and a median wait of about 58 s.
