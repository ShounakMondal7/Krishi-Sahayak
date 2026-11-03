"""
services/rag.py — ChromaDB vector retrieval for RAG pipeline.

Uses PersistentClient (not ephemeral) so the knowledge base survives
container restarts. Embeddings use sentence-transformers:
  paraphrase-multilingual-MiniLM-L12-v2

The embedding model is loaded ONCE at module level — it's 500 MB.
"""
import logging
import re
import time
from typing import Optional

import chromadb
from chromadb.config import Settings as ChromaSettings
from sentence_transformers import SentenceTransformer

from app.config import settings as app_settings

logger = logging.getLogger(__name__)

# ── Similarity threshold ───────────────────────────────────────────────────────
# Chunks with cosine similarity below this threshold are considered irrelevant
# and excluded from the context passed to the LLM.
# cosine similarity = 1 - cosine_distance. Threshold of 0.20 means we drop
# chunks where distance > 0.80.
MIN_SIMILARITY_THRESHOLD = 0.20

# ── Junk chunk detection patterns ──────────────────────────────────────────────
_JUNK_PATTERNS = re.compile(
    r"(?i)^(table\s+of\s+contents|list\s+of\s+(tables|figures|plates)|"
    r"icar\s+all\s+rights?\s+reserved|acknowledgements?|bibliography|"
    r"index\s*$|references?\s*$|appendix\s+[a-z]?\s*$)",
)


def _is_junk_chunk(text: str) -> bool:
    """
    Returns True if a chunk is likely a boilerplate/index fragment
    rather than actionable agricultural content.
    """
    stripped = text.strip()
    # Too short to be useful
    if len(stripped) < 30:
        return True
    # Matches a known boilerplate pattern
    if _JUNK_PATTERNS.match(stripped):
        return True
    # Dominated by page numbers / dots (e.g., "Chapter 1 ...... 3")
    dots_and_digits = sum(1 for c in stripped if c in ".…0123456789")
    if len(stripped) > 0 and dots_and_digits / len(stripped) > 0.4:
        return True
    return False


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


def _sync_retrieve_context(
    english_query: str,
    top_k: int = 4,
) -> tuple[list[str], list[str], list[float]]:
    """
    Synchronously retrieve document chunks using sentence-transformers and ChromaDB.
    """
    collection = _get_collection()
    model = _get_embedding_model()

    doc_count = collection.count()
    if doc_count == 0:
        logger.warning("ChromaDB collection is empty — no context to retrieve.")
        return [], [], []

    # Clamp top_k to available documents
    effective_k = min(top_k, doc_count)

    # Clean the query string — strip trailing quotes and excess whitespace
    clean_query = english_query.strip().strip('"').strip("'").strip()

    # Embed the query
    query_embedding = model.encode(clean_query, normalize_embeddings=True).tolist()

    # Query ChromaDB
    results = collection.query(
        query_embeddings=[query_embedding],
        n_results=effective_k,
        include=["documents", "metadatas", "distances"],
    )

    raw_chunks: list[str] = results["documents"][0]
    metadatas: list[dict] = results["metadatas"][0]
    # ChromaDB cosine distance → similarity: similarity = 1 - distance
    distances: list[float] = results["distances"][0]
    raw_similarities = [round(1.0 - d, 4) for d in distances]

    # ── Filter: remove low-similarity and junk chunks ──────────────────────
    filtered_chunks: list[str] = []
    filtered_sources: list[str] = []
    filtered_similarities: list[float] = []

    for chunk, meta, sim in zip(raw_chunks, metadatas, raw_similarities):
        source = meta.get("source", "unknown")

        # Skip chunks below similarity threshold
        if sim < MIN_SIMILARITY_THRESHOLD:
            logger.debug(
                f"Dropping chunk (similarity {sim:.4f} < {MIN_SIMILARITY_THRESHOLD}): "
                f"'{chunk[:60]}…'"
            )
            continue

        # Skip junk/boilerplate chunks
        if _is_junk_chunk(chunk):
            logger.debug(
                f"Dropping junk chunk (source={source}): '{chunk[:60]}…'"
            )
            continue

        filtered_chunks.append(chunk)
        filtered_sources.append(source)
        filtered_similarities.append(sim)

    logger.debug(
        f"Retrieved {len(raw_chunks)} raw → {len(filtered_chunks)} filtered chunks "
        f"for query '{clean_query[:50]}…' "
        f"— top similarity: {filtered_similarities[0] if filtered_similarities else 'N/A'}"
    )

    return filtered_chunks, filtered_sources, filtered_similarities


def retrieve_context(
    english_query: str,
    top_k: int = 4,
) -> tuple[list[str], list[str], list[float]]:
    """
    Synchronous interface for document chunk retrieval.
    """
    return _sync_retrieve_context(english_query, top_k=top_k)


async def retrieve_context_async(
    english_query: str,
    top_k: int = 4,
) -> tuple[list[str], list[str], list[float]]:
    """
    Asynchronously retrieve document chunks by offloading heavy CPU embedding
    and ChromaDB vector queries to a worker thread via asyncio.to_thread.
    This prevents blocking concurrent network requests in the FastAPI event loop.
    """
    import asyncio
    return await asyncio.to_thread(_sync_retrieve_context, english_query, top_k)


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
