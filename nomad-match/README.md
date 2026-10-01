# nomad-match

A click-through demo of plain-English matching for Revenue Nomad. A company describes what's not working in its own words. The demo writes a short hiring brief, then returns the three best fractional operators with the evidence behind each match: the engagement where they solved something similar, the strongest client review, and the verified tags that match.

This is a prototype for showing the idea, not production code.

## Run it

```bash
cd nomad-match
./run.sh
```

Then open **http://localhost:8000**.

`./run.sh` is also the restart command. The first run creates a Python environment, installs packages and downloads the embedding model (about 90 MB), so it takes a few minutes. Later runs start in seconds.

To use Claude for the intake, set your key before starting:

```bash
export ANTHROPIC_API_KEY=sk-ant-...
./run.sh
```

Without a key the demo still works. The brief comes from simple keyword rules, and the top bar says so.

Requirements: Python 3.10 or newer and an internet connection for the first run.

## How to use it

1. **Pick a sample** from the dropdown, or type your own situation.
2. Press **Match**. Claude reads it. If something important is missing (revenue stage, what good looks like in 90 days, hours or budget), it asks at most two short questions. You can answer them or skip.
3. The **brief** appears in the middle: recommended role, 90-day scope, revenue stage, hours, rate range and the fit tags to look for. Edit any of it and press **Re-run match with this brief**.
4. The **matches** appear on the right:
   - the top three, with evidence
   - "Also consider", the next three
   - "Filtered out, and why", for example booked, rate above your ceiling, or the wrong revenue stage
5. Turn on **Show scoring** to see the raw similarity scores and the final score formula for every operator.

Filters on the left are optional. Any filter left empty uses the brief: its revenue stage, the top of its rate range and its hours.

## What each layer does

| Layer | File | What it does |
|---|---|---|
| Sample data | `data/operators.json` | 10 fictional operator profiles: rates, availability, revenue stages, industries, fit tags with tiers (self, verified, expert), engagements with outcomes, and client reviews. |
| Reputation Index | `nomad_match/reputation.py` | Scores each operator 0 to 99 from reviews, would-hire-again, verified tags, number of engagements and recency. The formula is documented at the top of the file. |
| Embeddings | `nomad_match/embeddings.py` | Turns text into vectors with the all-MiniLM-L6-v2 model, running locally on the CPU. No API key needed. |
| Vector store | `nomad_match/store.py` | One "matching document" per operator (headline, tags, stages, industries, every engagement's problem and outcome, every review), plus one vector per engagement so a match can cite the engagement that fit. Stored in SQLite and searched with numpy. |
| Intake | `nomad_match/intake.py` | Claude (`claude-sonnet-4-6`) turns the description into a structured JSON brief, asking at most two follow-up questions. Falls back to keyword rules with no key. |
| Matching | `nomad_match/matching.py` | Applies hard filters, scores everyone, ranks and assembles the evidence. |
| Web app | `nomad_match/app.py`, `nomad_match/static/index.html` | FastAPI plus a single HTML page. |

### How a match is scored

1. **Hard filters (pass or fail):**
   - availability: booked operators are out, and so is anyone with fewer hours than you need
   - revenue stage overlap
   - rate ceiling
   - industry, if you pick one
2. **Semantic score:** how close your problem is to the operator. It's the average of two cosine similarities: one to their whole profile, one to their single best-matching engagement. It's then rescaled so the closest operator scores 1 and the furthest 0.
3. **Final score:** `0.60 × semantic + 0.25 × Reputation Index / 99 + 0.15 × verified tag coverage`. Verified tag coverage is the share of the brief's tags the operator holds at verified or expert tier.
4. **Evidence:** the best-matching engagement and its outcome, the strongest review (highest rating, then most relevant), and the matching verified tags. The one-line "why" says "has solved this kind of problem before" only when that engagement is a close match; otherwise it says "closest experience is…".

Rebuild the index after editing the profiles:

```bash
.venv/bin/python -m nomad_match.build_index
```

## What the five samples show

| Sample | Top match | What it demonstrates |
|---|---|---|
| $12M services business, founder is the only closer | Dana Whitfield | Priya Desai fits on paper but is filtered out as booked |
| Series A SaaS, first outbound team and comp plan | Marcus Bell | Revenue stage filter removes the larger-company specialists |
| HubSpot is a mess, board meeting in 6 weeks | Aisha Okafor | Ryan Cho (strong depth, zero reviews) ranks second: close on fit, held back by a low Reputation Index |
| Marketing agency, $4M, churn | Jordan Blake | A role other than sales wins when the problem is retention |
| Two AEs ramping slowly | Megan Torres | "Not another manager" steers to enablement, not a VP of Sales |

Grant Holloway's rate ($300/hr) sits well above the others, so he's filtered out whenever the brief's rate ceiling is lower.

## What would change on the real platform

- **Profiles:** load real operator profiles from the platform's API instead of `data/operators.json`. Rebuild an operator's vectors whenever their profile, engagements or reviews change.
- **Vector store:** use Postgres with **pgvector** instead of SQLite and numpy, so search scales past a few thousand operators and filters run in the same query.
- **Reputation Index:** pull the live score from the platform's scoring instead of the stand-in formula in `reputation.py`.
- **Fit tags:** load the taxonomy from the real list of about 1,100 tags. Have Claude choose tags from that list, and match tags by ID instead of by text.
- **Embedding model:** consider a stronger model (for example bge-base or a hosted embedding API) and evaluate on real client descriptions.
- **Weights:** tune 0.60 / 0.25 / 0.15 and the "solved this before" threshold on real outcomes (intros accepted, hires made), not on five samples.
- **Intake:** keep the conversation history server-side, log briefs for review, and add guardrails for off-topic input.
- **Production basics:** authentication, rate limiting, error monitoring and tests.

## Assumptions

- All 10 operators, their companies, reviews and outcomes are fictional.
- Hours available are per month. "Limited" operators pass the filter if they have enough hours; "booked" operators never pass.
- Revenue stage is a hard filter, using the one you choose or else the brief's. An operator passes if any of their stages matches.
- The rate ceiling defaults to the top of the brief's rate range. Clear or change it in the filters.
- Semantic scores are rescaled across the operator set, so they show relative fit within this pool, not an absolute score.
- Tag coverage matches the brief's tags to the operator's verified and expert tags by text, with some tolerance for wording.
- The embedding model downloads from Hugging Face. If that is blocked, the same model is fetched from fastembed's public mirror on Google Cloud Storage.
- The Claude intake uses `claude-sonnet-4-6`, as requested, with structured JSON output.
