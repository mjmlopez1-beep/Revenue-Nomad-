"""Matching: hard filters, then semantic similarity, reputation and verified-tag coverage.

final score = 0.60 x semantic (normalised 0-1 across operators)
            + 0.25 x reputation_index / 99
            + 0.15 x verified tag coverage (share of the brief's tags the operator holds at verified or expert tier)
"""
from __future__ import annotations

import re

import numpy as np

from . import embeddings
from .store import Index, engagement_text

W_SEMANTIC, W_REPUTATION, W_TAGS = 0.60, 0.25, 0.15
STOP = {"and", "the", "of", "to", "a", "for", "in", "on", "with"}


def _tokens(s: str) -> set[str]:
    return {w for w in re.findall(r"[a-z0-9$+]+", s.lower()) if w not in STOP}


def tag_match(brief_tag: str, op_tag: str) -> bool:
    a, b = brief_tag.lower().strip(), op_tag.lower().strip()
    if a == b or a in b or b in a:
        return True
    ta, tb = _tokens(a), _tokens(b)
    return bool(ta and tb) and len(ta & tb) / len(ta | tb) >= 0.5


def query_text(problem: str, brief: dict | None) -> str:
    if not brief:
        return problem
    return "\n".join([
        problem,
        f"Looking for: {brief.get('role_category', '')}.",
        f"Scope: {brief.get('scope_summary', '')}",
        "Needs: " + ", ".join(brief.get("inferred_fit_tags", [])) + ".",
    ])


def hard_filters(op: dict, f: dict) -> list[str]:
    reasons = []
    av = op["availability"]
    if av["status"] == "booked":
        reasons.append("Booked: no hours available right now")
    min_hours = f.get("min_hours")
    if min_hours and av["status"] != "booked" and av["hours_per_month"] < min_hours:
        reasons.append(f"Only {av['hours_per_month']} hrs/month available; you need {min_hours}")
    max_rate = f.get("max_rate")
    if max_rate and op["hourly_rate"] > max_rate:
        reasons.append(f"Rate ${op['hourly_rate']}/hr is above your ceiling of ${max_rate}/hr")
    stage = f.get("revenue_stage")
    if stage and stage not in op["revenue_stage_fit"]:
        reasons.append(f"Works with {', '.join(op['revenue_stage_fit'])} companies, not {stage}")
    industry = f.get("industry")
    if industry and industry.lower() not in [i.lower() for i in op["industries"]]:
        reasons.append(f"No {industry} experience on record")
    return reasons


def _first(s: str) -> str:
    return s.split(" ")[0]


def _lower_first(s: str) -> str:
    return s[:1].lower() + s[1:] if s else s


STRONG_ENGAGEMENT = 0.565  # cosine above which an engagement reads as "the same problem" (tuned on the sample prompts)


def why_sentence(op: dict, eng: dict, eng_score: float, matched: list[str]) -> str:
    who = _first(op["name"])
    where = _lower_first(eng["company"])
    problem = eng["problem"].rstrip(".")
    tags = f" Verified for {', '.join(matched[:2])}." if matched else ""
    if eng_score >= STRONG_ENGAGEMENT:
        return f"{who} has solved this kind of problem before, at {where}: {problem}.{tags}"
    return f"Closest experience is at {where}: {problem}.{tags}"


class Matcher:
    def __init__(self, operators: list[dict]):
        self.ops = {o["id"]: o for o in operators}
        self.index = Index()

    def match(self, problem: str, brief: dict | None, filters: dict) -> dict:
        q_text = query_text(problem, brief)
        q = embeddings.embed_one(q_text)
        doc = self.index.doc_scores(q)
        best_eng = self.index.best_engagements(q)
        # semantic = mean of the whole-profile match and the best single engagement
        raw = {oid: 0.5 * doc[oid] + 0.5 * best_eng[oid][1] for oid in self.ops}
        lo, hi = min(raw.values()), max(raw.values())
        norm = {oid: (v - lo) / (hi - lo) if hi > lo else 1.0 for oid, v in raw.items()}
        brief_tags = (brief or {}).get("inferred_fit_tags", [])
        q_vec = q

        results = []
        for oid, op in self.ops.items():
            verified = [t["tag"] for t in op["fit_tags"] if t["tier"] in ("verified", "expert")]
            matched = [bt for bt in brief_tags if any(tag_match(bt, vt) for vt in verified)]
            coverage = len(matched) / len(brief_tags) if brief_tags else 0.0
            rep = op["reputation_index"] / 99
            final = W_SEMANTIC * norm[oid] + W_REPUTATION * rep + W_TAGS * coverage
            eidx, escore = best_eng[oid]
            eng = op["engagements"][eidx]
            review = self._best_review(op, q_vec)
            matched_op_tags = [t for t in op["fit_tags"] if t["tier"] in ("verified", "expert") and any(tag_match(bt, t["tag"]) for bt in brief_tags)]
            results.append({
                "id": oid,
                "name": op["name"],
                "headline": op["headline"],
                "role_category": op["role_category"],
                "location": op["location"],
                "hourly_rate": op["hourly_rate"],
                "availability": op["availability"],
                "reputation_index": op["reputation_index"],
                "review_count": len(op["reviews"]),
                "filter_reasons": hard_filters(op, filters),
                "scores": {
                    "doc_cosine": round(doc[oid], 4),
                    "best_engagement_cosine": round(escore, 4),
                    "semantic_raw": round(raw[oid], 4),
                    "semantic_normalised": round(norm[oid], 4),
                    "reputation_normalised": round(rep, 4),
                    "tag_coverage": round(coverage, 4),
                    "final": round(final, 4),
                    "formula": f"0.60 x {norm[oid]:.2f} + 0.25 x {rep:.2f} + 0.15 x {coverage:.2f} = {final:.3f}",
                },
                "evidence": {
                    "engagement": {"company": eng["company"], "problem": eng["problem"], "what_they_did": eng["what_they_did"], "outcome": eng["outcome"], "duration_months": eng["duration_months"], "current": eng["current"]},
                    "review": review,
                    "matched_tags": [{"tag": t["tag"], "tier": t["tier"]} for t in matched_op_tags],
                },
                "why": why_sentence(op, eng, escore, [t["tag"] for t in matched_op_tags]),
            })
        passing = sorted([r for r in results if not r["filter_reasons"]], key=lambda r: -r["scores"]["final"])
        failing = sorted([r for r in results if r["filter_reasons"]], key=lambda r: -r["scores"]["final"])
        return {
            "query_text": q_text,
            "top": passing[:3],
            "also_consider": passing[3:6],
            "filtered_out": failing,
            "weights": {"semantic": W_SEMANTIC, "reputation": W_REPUTATION, "tags": W_TAGS},
        }

    @staticmethod
    def _best_review(op: dict, q: np.ndarray) -> dict | None:
        if not op["reviews"]:
            return None
        quotes = [r["quote"] for r in op["reviews"]]
        sims = embeddings.embed(quotes) @ q
        # strongest = highest rating first, then most relevant to the problem
        i = max(range(len(quotes)), key=lambda k: (op["reviews"][k]["rating"], sims[k]))
        r = op["reviews"][i]
        return {"quote": r["quote"], "rating": r["rating"], "would_hire_again": r["would_hire_again"]}
