"""Export everything the browser version needs into artifact/data.js:
profiles with Reputation Index, and precomputed all-MiniLM-L6-v2 vectors for every operator
document, engagement, review quote, sample problem, role sentence and fit tag.

    python -m nomad_match.export_artifact
"""
from __future__ import annotations

import base64
import json
from pathlib import Path

import numpy as np

from . import embeddings, intake
from .app import SAMPLE_PROMPTS
from .matching import STRONG_ENGAGEMENT, W_PROBLEM, W_REPUTATION, W_ROLE, W_SEMANTIC, W_TAG_MEAN, W_TAGS, role_sentence, tag_sentence
from .store import engagement_text, load_operators, matching_document

OUT = Path(__file__).resolve().parent.parent / "artifact" / "data.js"


def b64(vecs: np.ndarray) -> str:
    return base64.b64encode(np.ascontiguousarray(vecs, dtype=np.float32).tobytes()).decode()


def main() -> None:
    ops = load_operators()
    tags = intake.tag_vocabulary(ops)
    doc_vecs = embeddings.embed([matching_document(o) for o in ops])
    for o, v in zip(ops, doc_vecs):
        o["vec"] = b64(v[None])
        o["eng_vecs"] = b64(embeddings.embed([engagement_text(e) for e in o["engagements"]]))
        o["review_vecs"] = b64(embeddings.embed([r["quote"] for r in o["reviews"]])) if o["reviews"] else ""
    data = {
        "dim": int(doc_vecs.shape[1]),
        "operators": ops,
        "samples": [{"text": s, "vec": b64(embeddings.embed([s]))} for s in SAMPLE_PROMPTS],
        "roles": {r: b64(embeddings.embed([role_sentence(r)])) for r in intake.ROLE_CATEGORIES},
        "tags": {t: b64(embeddings.embed([tag_sentence(t)])) for t in tags},
        "tag_vocabulary": tags,
        "revenue_stages": intake.REVENUE_STAGES,
        "role_categories": intake.ROLE_CATEGORIES,
        "industries": sorted({i for o in ops for i in o["industries"]}),
        "weights": {"semantic": W_SEMANTIC, "reputation": W_REPUTATION, "tags": W_TAGS, "problem": W_PROBLEM, "role": W_ROLE, "tag_mean": W_TAG_MEAN, "strong_engagement": STRONG_ENGAGEMENT},
        "rules": [{"keywords": k, "role": r, "tags": t} for k, r, t in intake.RULES],
        "rate_by_role": intake.RATE_BY_ROLE,
        "scope_by_role": intake.SCOPE_BY_ROLE,
        "intake_system": intake.SYSTEM,
        "max_questions": intake.MAX_QUESTIONS,
    }
    OUT.parent.mkdir(exist_ok=True)
    OUT.write_text("window.NM_DATA = " + json.dumps(data, separators=(",", ":")) + ";\n")
    print(f"Wrote {OUT} ({OUT.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
