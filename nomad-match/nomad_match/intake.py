"""Conversational intake: turn a plain-English problem into a structured brief.

With ANTHROPIC_API_KEY set, Claude (claude-sonnet-4-6) reads the situation, asks at most two
follow-up questions when something important is missing, and returns a brief as JSON.
Without a key, a rules-based brief is produced so the demo still runs.
"""
from __future__ import annotations

import json
import os
import re

MODEL = "claude-sonnet-4-6"
ROLE_CATEGORIES = [
    "Fractional VP of Sales",
    "Fractional CMO",
    "Fractional RevOps leader",
    "Fractional Sales Enablement leader",
    "Fractional Customer Success leader",
]
REVENUE_STAGES = ["Pre-revenue", "Under $1M", "$1M-$5M", "$5M-$20M", "$20M-$50M", "$50M+"]
MAX_QUESTIONS = 2

BRIEF_SCHEMA = {
    "type": "object",
    "properties": {
        "follow_up_questions": {"type": "array", "items": {"type": "string"}},
        "brief": {
            "type": "object",
            "properties": {
                "role_category": {"type": "string", "enum": ROLE_CATEGORIES},
                "inferred_fit_tags": {"type": "array", "items": {"type": "string"}},
                "revenue_stage": {"type": "string", "enum": REVENUE_STAGES},
                "scope_summary": {"type": "string"},
                "suggested_hours_per_month": {"type": "integer"},
                "rate_range": {
                    "type": "object",
                    "properties": {"min": {"type": "integer"}, "max": {"type": "integer"}},
                    "required": ["min", "max"],
                    "additionalProperties": False,
                },
                "rationale": {"type": "string"},
            },
            "required": ["role_category", "inferred_fit_tags", "revenue_stage", "scope_summary", "suggested_hours_per_month", "rate_range", "rationale"],
            "additionalProperties": False,
        },
    },
    "required": ["follow_up_questions", "brief"],
    "additionalProperties": False,
}

SYSTEM = """You are the intake specialist for Revenue Nomad, a marketplace of fractional go-to-market (GTM) operators.
A company describes what is not working. Your job is to write a short hiring brief that a matching engine uses to find the right fractional operator.

Rules:
- Always return a complete best-guess brief, even when you also ask questions.
- Ask follow-up questions only if an answer would change the brief materially. Useful topics: revenue stage, what good looks like in 90 days, budget or hours per month. Ask at most {remaining} question(s), each one sentence. Return an empty list when you have enough, or when told not to ask more.
- role_category: the single best fractional role for the problem.
- inferred_fit_tags: 4 to 8 tags, copied exactly from the tag vocabulary below.
- revenue_stage: from the company's revenue if stated or implied; otherwise your best guess.
- scope_summary: 2 to 3 plain sentences describing what the operator would deliver in a 90-day engagement, ending with what success looks like at day 90.
- suggested_hours_per_month: 20 to 100.
- rate_range: hourly USD, typical fractional rates are $150 to $300.
- rationale: one sentence on why this role.

Tag vocabulary:
{tags}"""


def tag_vocabulary(operators: list[dict]) -> list[str]:
    return sorted({t["tag"] for op in operators for t in op["fit_tags"]}, key=str.lower)


def has_api_key() -> bool:
    return bool(os.environ.get("ANTHROPIC_API_KEY"))


def run_intake(text: str, answers: list[dict], operators: list[dict]) -> dict:
    """answers: [{"question": ..., "answer": ...}] from earlier rounds. Returns
    {"source": "claude"|"rules", "questions": [...], "brief": {...}, "note": str|None}."""
    if not has_api_key():
        return {
            "source": "rules",
            "questions": [],
            "brief": rules_brief(text + " " + " ".join(a.get("answer", "") for a in answers), operators),
            "note": "ANTHROPIC_API_KEY is not set, so this brief came from simple keyword rules, not Claude. Matching still uses the local embedding model.",
        }
    try:
        return _claude_intake(text, answers, operators)
    except Exception as e:  # keep the demo running if the API call fails
        return {
            "source": "rules",
            "questions": [],
            "brief": rules_brief(text, operators),
            "note": f"Claude was unavailable ({type(e).__name__}: {str(e)[:160]}), so this brief came from keyword rules.",
        }


def _claude_intake(text: str, answers: list[dict], operators: list[dict]) -> dict:
    import anthropic

    client = anthropic.Anthropic()
    remaining = max(0, MAX_QUESTIONS - len(answers))
    convo = f"Company's description of what is not working:\n{text}"
    if answers:
        convo += "\n\nAnswers to your follow-up questions:\n" + "\n".join(
            f"Q: {a['question']}\nA: {a.get('answer') or '(skipped)'}" for a in answers
        )
    if remaining == 0 or answers:
        convo += "\n\nDo not ask any more questions. Return the final brief with an empty follow_up_questions list."
    try:
        response = client.messages.create(
            model=MODEL,
            max_tokens=2000,
            system=SYSTEM.format(remaining=remaining, tags="\n".join(f"- {t}" for t in tag_vocabulary(operators))),
            messages=[{"role": "user", "content": convo}],
            output_config={"format": {"type": "json_schema", "schema": BRIEF_SCHEMA}},
        )
    except anthropic.AuthenticationError as e:
        raise RuntimeError("the API key was rejected") from e
    except anthropic.RateLimitError as e:
        raise RuntimeError("rate limited, try again in a moment") from e
    except anthropic.APIConnectionError as e:
        raise RuntimeError("could not reach the Anthropic API") from e
    if response.stop_reason == "refusal":
        raise RuntimeError("Claude declined this request")
    data = json.loads(next(b.text for b in response.content if b.type == "text"))
    questions = [q for q in data.get("follow_up_questions", []) if q.strip()][:remaining]
    brief = data["brief"]
    vocab = {t.lower(): t for t in tag_vocabulary(operators)}
    brief["inferred_fit_tags"] = [vocab.get(t.lower(), t) for t in brief["inferred_fit_tags"]]
    return {"source": "claude", "questions": questions, "brief": brief, "note": None}


# ---------------- Rules-based fallback ----------------

RULES = [
    # (keywords, role category, tags)
    (["founder", "only closer", "only one closing", "inbound", "untouched", "sitting", "follow up", "follow-up"], "Fractional VP of Sales",
     ["founder-led to sales-led transition", "inbound", "lead response SLA", "first sales hire", "sales process design"]),
    (["outbound", "sdr", "bdr", "comp plan", "compensation", "quota", "first sales team", "plg", "product-led"], "Fractional VP of Sales",
     ["outbound", "SDR team build", "comp plan design", "PLG", "first sales hire"]),
    (["pipeline dried", "pipeline is down", "pipeline recovery", "turnaround", "distributor", "channel"], "Fractional VP of Sales",
     ["pipeline recovery", "channel", "sales team restructure", "mid-market"]),
    (["hubspot", "salesforce", "crm", "pipeline numbers", "dashboard", "board", "reporting", "data", "trust the"], "Fractional RevOps leader",
     ["HubSpot", "CRM cleanup", "pipeline reporting", "board metrics", "forecasting", "data hygiene"]),
    (["churn", "retention", "renewal", "expansion", "upsell", "customer success", "clients leaving"], "Fractional Customer Success leader",
     ["churn reduction", "CS to expansion", "account management", "QBR program", "retainer renewals"]),
    (["ramp", "ramping", "onboarding", "enablement", "playbook", "coaching", "training", "new aes", "new reps"], "Fractional Sales Enablement leader",
     ["AE onboarding and ramp", "sales playbook", "call coaching", "discovery framework"]),
    (["brand", "positioning", "messaging", "demand gen", "marketing", "content", "seo", "traffic", "leads are low"], "Fractional CMO",
     ["demand generation", "positioning and messaging", "content engine", "inbound"]),
]
RATE_BY_ROLE = {
    "Fractional VP of Sales": (200, 260),
    "Fractional CMO": (175, 240),
    "Fractional RevOps leader": (160, 220),
    "Fractional Sales Enablement leader": (150, 210),
    "Fractional Customer Success leader": (150, 210),
}
SCOPE_BY_ROLE = {
    "Fractional VP of Sales": "Own the sales motion for 90 days: diagnose where deals stall, put a simple process and weekly pipeline review in place, and hire or coach the people who will run it. Success at day 90 is a sales team that works the pipeline without the founder in every deal.",
    "Fractional CMO": "Lead marketing for 90 days: sharpen positioning, pick the two channels that matter and stand up a repeatable demand program. Success at day 90 is a predictable flow of qualified leads with cost per lead tracked.",
    "Fractional RevOps leader": "Own revenue operations for 90 days: clean up the CRM, agree one definition of pipeline and bookings, and build the dashboards leadership and the board rely on. Success at day 90 is numbers everyone trusts, built from the CRM in under an hour.",
    "Fractional Sales Enablement leader": "Lead enablement for 90 days: write the sales playbook, build a 30-60-90 onboarding plan and run weekly call coaching. Success at day 90 is new sellers ramping measurably faster with a playbook they actually use.",
    "Fractional Customer Success leader": "Lead customer success for 90 days: find why clients leave, put onboarding, health scores and business reviews in place, and start an expansion motion. Success at day 90 is falling churn and the first expansion deals in pipeline.",
}


def revenue_stage_from_text(text: str) -> str | None:
    t = text.lower()
    if "pre-revenue" in t or "pre revenue" in t:
        return "Pre-revenue"
    m = re.search(r"\$?\s?(\d+(?:\.\d+)?)\s?(m|mm|million|k|thousand)\b", t)
    if m:
        n = float(m.group(1)) * (1 if m.group(2) in ("m", "mm", "million") else 0.001)
        for limit, stage in [(1, "Under $1M"), (5, "$1M-$5M"), (20, "$5M-$20M"), (50, "$20M-$50M")]:
            if n < limit:
                return stage
        return "$50M+"
    if "series a" in t or "seed" in t:
        return "$1M-$5M"
    if "series b" in t:
        return "$5M-$20M"
    return None


def rules_brief(text: str, operators: list[dict]) -> dict:
    t = text.lower()
    scored = []
    for kws, role, tags in RULES:
        hits = sum(1 for k in kws if k in t)
        if hits:
            scored.append((hits, role, tags))
    scored.sort(key=lambda x: -x[0])
    if scored:
        role = scored[0][1]
        tags: list[str] = []
        for _, r, tg in scored:
            if r == role:
                tags += [x for x in tg if x not in tags]
        for hits, r, tg in scored[1:2]:  # one secondary theme, only when it is clearly present
            if hits < 2:
                continue
            tags += [x for x in tg[:2] if x not in tags]
    else:
        role, tags = "Fractional VP of Sales", ["sales process design", "inbound", "outbound"]
    for kw, tag in [("hubspot", "HubSpot"), ("salesforce", "Salesforce"), ("gong", "Gong"), ("apollo", "Apollo"), ("outreach", "Outreach"), ("saas", "PLG" if "plg" in t else None)]:
        if kw in t and tag and tag not in tags:
            tags.append(tag)
    vocab = {v.lower() for v in tag_vocabulary(operators)}
    tags = [x for x in tags if x.lower() in vocab][:8]
    lo, hi = RATE_BY_ROLE[role]
    return {
        "role_category": role,
        "inferred_fit_tags": tags,
        "revenue_stage": revenue_stage_from_text(text) or "$5M-$20M",
        "scope_summary": SCOPE_BY_ROLE[role],
        "suggested_hours_per_month": 40,
        "rate_range": {"min": lo, "max": hi},
        "rationale": "Chosen by keyword rules from the description (no Claude API key set).",
    }
