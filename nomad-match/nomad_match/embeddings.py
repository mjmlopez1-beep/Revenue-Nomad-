"""Local text embeddings with all-MiniLM-L6-v2. No API key, runs on the CPU.

Loads the model through fastembed (ONNX, no PyTorch). fastembed normally downloads from
Hugging Face; when that is blocked it fetches the same model from fastembed's public
Google Cloud Storage mirror. If fastembed is not installed, sentence-transformers is used.
"""
from __future__ import annotations

import os
import tarfile
import urllib.request
from functools import lru_cache
from pathlib import Path

import numpy as np

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
ROOT = Path(__file__).resolve().parent.parent
MODELS_DIR = ROOT / ".models"
MIRROR_URL = "https://storage.googleapis.com/qdrant-fastembed/sentence-transformers-all-MiniLM-L6-v2.tar.gz"
MIRROR_DIR = MODELS_DIR / "fast-all-MiniLM-L6-v2"


def _from_mirror():
    from fastembed import TextEmbedding

    if not (MIRROR_DIR / "model.onnx").exists():
        MODELS_DIR.mkdir(parents=True, exist_ok=True)
        tgz = MODELS_DIR / "minilm.tar.gz"
        print(f"Downloading {MODEL_NAME} from {MIRROR_URL} ...")
        urllib.request.urlretrieve(MIRROR_URL, tgz)
        with tarfile.open(tgz) as tar:
            tar.extractall(MODELS_DIR, filter="data")
        tgz.unlink(missing_ok=True)
    return TextEmbedding(MODEL_NAME, specific_model_path=str(MIRROR_DIR))


@lru_cache(maxsize=1)
def _model():
    try:
        from fastembed import TextEmbedding
    except ImportError:
        from sentence_transformers import SentenceTransformer

        st = SentenceTransformer(MODEL_NAME)
        return ("st", st)
    if (MIRROR_DIR / "model.onnx").exists():
        return ("fe", _from_mirror())
    try:
        return ("fe", TextEmbedding(MODEL_NAME, cache_dir=str(MODELS_DIR)))
    except Exception as e:  # Hugging Face unreachable (proxy, offline): use the mirror
        print(f"Hugging Face download failed ({type(e).__name__}); using the fastembed mirror.")
        return ("fe", _from_mirror())


def embed(texts: list[str]) -> np.ndarray:
    """Return L2-normalised vectors, one row per text, so a dot product is cosine similarity."""
    kind, m = _model()
    if kind == "st":
        vecs = np.asarray(m.encode(texts, normalize_embeddings=True), dtype=np.float32)
    else:
        vecs = np.asarray(list(m.embed(texts)), dtype=np.float32)
    norms = np.linalg.norm(vecs, axis=1, keepdims=True)
    return vecs / np.clip(norms, 1e-9, None)


def embed_one(text: str) -> np.ndarray:
    return embed([text])[0]


os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
