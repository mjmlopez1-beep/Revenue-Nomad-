"""Vector store: SQLite tables of float32 vectors, searched with numpy cosine similarity.

Two kinds of vectors:
  - one "matching document" per operator (headline, tags with tiers, stages, industries,
    every engagement's problem and outcome, every review quote)
  - one vector per engagement, so a match can cite the engagement that fit best

Rebuild with:  python -m nomad_match.build_index
"""
from __future__ import annotations

import json
import sqlite3
from pathlib import Path

import numpy as np

from . import embeddings
from .reputation import breakdown

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data" / "operators.json"
DB = ROOT / "data" / "index.sqlite"


def load_operators() -> list[dict]:
    ops = json.loads(DATA.read_text())
    for op in ops:
        b = breakdown(op)
        op["reputation_index"] = b["total"]
        op["reputation_breakdown"] = {k: round(v, 1) for k, v in b.items() if k != "total"}
    return ops


def matching_document(op: dict) -> str:
    parts = [
        f"{op['role_category']}. {op['headline']}.",
        "Fit tags: " + "; ".join(f"{t['tag']} ({t['tier']})" for t in op["fit_tags"]) + ".",
        "Revenue stages: " + ", ".join(op["revenue_stage_fit"]) + ".",
        "Industries: " + ", ".join(op["industries"]) + ".",
    ]
    for e in op["engagements"]:
        parts.append(f"Hired by {e['company']} because: {e['problem']} Outcome: {e['outcome']}")
    for r in op["reviews"]:
        parts.append(f"Client review: {r['quote']}")
    return "\n".join(parts)


def engagement_text(e: dict) -> str:
    return f"{e['company']}. Problem: {e['problem']} What they did: {e['what_they_did']} Outcome: {e['outcome']}"


def build() -> None:
    ops = load_operators()
    docs = [matching_document(o) for o in ops]
    doc_vecs = embeddings.embed(docs)
    eng_rows = [(o["id"], i, engagement_text(e)) for o in ops for i, e in enumerate(o["engagements"])]
    eng_vecs = embeddings.embed([t for _, _, t in eng_rows])
    DB.unlink(missing_ok=True)
    con = sqlite3.connect(DB)
    con.execute("CREATE TABLE operators (id TEXT PRIMARY KEY, doc TEXT, vec BLOB)")
    con.execute("CREATE TABLE engagements (op_id TEXT, idx INTEGER, text TEXT, vec BLOB)")
    con.executemany("INSERT INTO operators VALUES (?,?,?)", [(o["id"], d, v.tobytes()) for o, d, v in zip(ops, docs, doc_vecs)])
    con.executemany("INSERT INTO engagements VALUES (?,?,?,?)", [(oid, i, t, v.tobytes()) for (oid, i, t), v in zip(eng_rows, eng_vecs)])
    con.commit()
    con.close()
    print(f"Indexed {len(ops)} operators and {len(eng_rows)} engagements into {DB.relative_to(ROOT)}")


class Index:
    """The vectors loaded into memory. Small enough to brute-force with numpy."""

    def __init__(self) -> None:
        if not DB.exists():
            build()
        con = sqlite3.connect(DB)
        rows = con.execute("SELECT id, vec FROM operators").fetchall()
        self.op_ids = [r[0] for r in rows]
        self.op_vecs = np.stack([np.frombuffer(r[1], dtype=np.float32) for r in rows])
        erows = con.execute("SELECT op_id, idx, vec FROM engagements").fetchall()
        self.eng_keys = [(r[0], r[1]) for r in erows]
        self.eng_vecs = np.stack([np.frombuffer(r[2], dtype=np.float32) for r in erows])
        con.close()

    def doc_scores(self, q: np.ndarray) -> dict[str, float]:
        return dict(zip(self.op_ids, (self.op_vecs @ q).tolist()))

    def best_engagements(self, q: np.ndarray) -> dict[str, tuple[int, float]]:
        best: dict[str, tuple[int, float]] = {}
        for (oid, idx), s in zip(self.eng_keys, (self.eng_vecs @ q).tolist()):
            if oid not in best or s > best[oid][1]:
                best[oid] = (idx, s)
        return best
