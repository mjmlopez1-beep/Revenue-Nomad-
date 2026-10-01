"""Rebuild the vector index from data/operators.json:  python -m nomad_match.build_index"""
from .store import build

if __name__ == "__main__":
    build()
