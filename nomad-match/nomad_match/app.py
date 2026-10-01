"""FastAPI app: serves the one-page UI and three JSON endpoints."""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from pydantic import BaseModel

from . import intake
from .matching import Matcher
from .store import load_operators

STATIC = Path(__file__).resolve().parent / "static"

SAMPLE_PROMPTS = [
    "We're a $12M services business, inbound leads are sitting untouched and the founder is still the only closer",
    "Series A SaaS, PLG motion, need someone to build the first outbound team and comp plan",
    "HubSpot is a mess, no one trusts the pipeline numbers, board meeting in 6 weeks",
    "Marketing agency, $4M, churn is eating growth, need a CS and expansion motion",
    "We hired two AEs and they're ramping slowly, need enablement and a playbook, not another manager",
]

OPERATORS = load_operators()
MATCHER = Matcher(OPERATORS)
app = FastAPI(title="nomad-match")

if not intake.has_api_key():
    print("NOTE: ANTHROPIC_API_KEY is not set. The intake will use a rules-based brief instead of Claude. Matching still works.")


class Answer(BaseModel):
    question: str
    answer: str = ""


class IntakeIn(BaseModel):
    text: str
    answers: list[Answer] = []


class MatchIn(BaseModel):
    problem: str
    brief: dict | None = None
    filters: dict = {}


@app.get("/")
def index():
    return FileResponse(STATIC / "index.html")


@app.get("/api/meta")
def meta():
    return {
        "samples": SAMPLE_PROMPTS,
        "revenue_stages": intake.REVENUE_STAGES,
        "role_categories": intake.ROLE_CATEGORIES,
        "industries": sorted({i for o in OPERATORS for i in o["industries"]}),
        "tags": intake.tag_vocabulary(OPERATORS),
        "claude": intake.has_api_key(),
        "model": intake.MODEL,
        "operator_count": len(OPERATORS),
    }


@app.post("/api/intake")
def run_intake(body: IntakeIn):
    return intake.run_intake(body.text, [a.model_dump() for a in body.answers], OPERATORS)


@app.post("/api/match")
def run_match(body: MatchIn):
    return MATCHER.match(body.problem, body.brief, body.filters)
