"""
services/rag.py — ChromaDB vector retrieval for RAG pipeline.

Uses PersistentClient (not ephemeral) so the knowledge base survives
container restarts. Embeddings use sentence-transformers:
  paraphrase-multilingual-MiniLM-L12-v2

The embedding model is loaded ONCE at module level — it's 500 MB.
"""
import logging
import time
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from app.config import settings as app_settings

logger = logging.getLogger(__name__)


# ── Lazy-loaded singletons ─────────────────────────────────────────────────────
_chroma_client: Optional[chromadb.PersistentClient] = None
_collection = None
_embedding_model: Optional[SentenceTransformer] = None


def _get_embedding_model() -> SentenceTransformer:
    global _embedding_model
    if _embedding_model is None:
        logger.info(f"Loading embedding model: {app_settings.embedding_model}…")
        t0 = time.time()
        _embedding_model = SentenceTransformer(app_settings.embedding_model)
        logger.info(f"✅ Embedding model loaded in {time.time() - t0:.1f}s")
    return _embedding_model


def _get_collection():
    """Returns the ChromaDB collection, creating it if needed."""
    global _chroma_client, _collection
    if _collection is None:
        _chroma_client = chromadb.PersistentClient(
            path=app_settings.chroma_persist_path,
            settings=ChromaSettings(anonymized_telemetry=False),
        )
        _collection = _chroma_client.get_or_create_collection(
            name=app_settings.collection_name,
            metadata={"hnsw:space": "cosine"},  # Use cosine similarity
        )
        doc_count = _collection.count()
        logger.info(
            f"✅ ChromaDB connected — collection '{app_settings.collection_name}' "
            f"has {doc_count} documents."
        )
    return _collection


def retrieve_context(
    english_query: str,
    top_k: int = 4,
) -> tuple[list[str], list[str], list[float]]:
    """
    Retrieve the most semantically similar document chunks for a query.

    Args:
        english_query: The farmer's question translated to English.
        top_k: Number of top chunks to retrieve (default: 4).

    Returns:
        Tuple of:
          - list[str]: document chunk texts
          - list[str]: source filenames (one per chunk)
          - list[float]: similarity scores (0–1, higher = more similar)

    Notes:
        - Never raises even if ChromaDB has 0 documents; returns empty lists.
        - The LLM service handles the case of empty context gracefully.
    """
    collection = _get_collection()
    model = _get_embedding_model()

    doc_count = collection.count()
    if doc_count == 0:
        logger.warning("ChromaDB collection is empty — no context to retrieve.")
        return [], [], []

    # Clamp top_k to available documents
    effective_k = min(top_k, doc_count)

    # Embed the query
    query_embedding = model.encode(english_query, normalize_embeddings=True).tolist()

    # Query ChromaDB
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=effective_k,
        include=["documents", "metadatas", "distances"],
    )

    chunks: list[str] = results["documents"][0]
    metadatas: list[dict] = results["metadatas"][0]
    # ChromaDB cosine distance → similarity: similarity = 1 - distance
    distances: list[float] = results["distances"][0]
    similarities = [round(1.0 - d, 4) for d in distances]

    sources: list[str] = [
        meta.get("source", "unknown") for meta in metadatas
    ]

    logger.debug(
        f"Retrieved {len(chunks)} chunks for query '{english_query[:50]}…' "
        f"— top similarity: {similarities[0] if similarities else 'N/A'}"
    )

    return chunks, sources, similarities


def get_document_count() -> int:
    """Returns number of documents in the ChromaDB collection."""
    try:
        return _get_collection().count()
    except Exception as exc:
        logger.error(f"ChromaDB count failed: {exc}")
        return -1


def get_embedding_model() -> SentenceTransformer:
    """Public accessor for the embedding model (used by ingest.py)."""
    return _get_embedding_model()


def get_collection():
    """Public accessor for the ChromaDB collection (used by ingest.py)."""
    return _get_collection()
