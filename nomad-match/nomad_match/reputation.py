"""Reputation Index (0-99) for the demo, computed from an operator's record.

The live platform has its own scoring; this is a transparent stand-in so the demo can show
how reputation is weighed against fit. Points:
  - Reviews      up to 30: review count (capped at 5) x average rating
  - Hire again   up to 10: share of reviewers who would hire again
  - Tags         up to 20: share of fit tags that are verified (expert counts 1.5x)
  - Engagements  up to 15: number of engagements on record (capped at 4)
  - Recency      up to 14: 14 if working now, 10 if an engagement ended in the last 12 months, else 4
  - Base         10 for every approved operator
"""
from datetime import date

TIER_WEIGHT = {"self": 0.0, "verified": 1.0, "expert": 1.5}


def months_since(ym: str, today: date) -> int:
    y, m = (int(x) for x in ym.split("-"))
    return (today.year - y) * 12 + (today.month - m)


def breakdown(op: dict, today: date | None = None) -> dict:
    today = today or date.today()
    reviews = op.get("reviews", [])
    n = len(reviews)
    avg = sum(r["rating"] for r in reviews) / n if n else 0.0
    rev_pts = min(n, 5) / 5 * 30 * (avg / 5)
    again_pts = (sum(1 for r in reviews if r["would_hire_again"]) / n * 10) if n else 0.0
    tags = op.get("fit_tags", [])
    tag_pts = min(1.0, sum(TIER_WEIGHT[t["tier"]] for t in tags) / max(1, len(tags))) * 20
    eng = op.get("engagements", [])
    eng_pts = min(len(eng), 4) / 4 * 15
    if any(e.get("current") for e in eng):
        rec_pts = 14.0
    elif any(e.get("ended") and months_since(e["ended"], today) <= 12 for e in eng):
        rec_pts = 10.0
    else:
        rec_pts = 4.0
    parts = {"base": 10.0, "reviews": rev_pts, "hire_again": again_pts, "verified_tags": tag_pts, "engagements": eng_pts, "recency": rec_pts}
    parts["total"] = min(99, round(sum(parts.values())))
    return parts


def reputation_index(op: dict, today: date | None = None) -> int:
    return breakdown(op, today)["total"]
