"""
services/cache.py — In-memory TTL cache for repeated queries.

Prevents redundant translation + ChromaDB + LLM calls for identical
questions. Uses a simple LRU dict with expiry timestamps.

No Redis dependency — designed for single-instance deployment.
For multi-instance production, replace with Redis.
"""
import hashlib
import logging
import time
from typing import Any, Optional
from threading import Lock

from app.config import settings

logger = logging.getLogger(__name__)


class TTLCache:
    """
    Thread-safe in-memory cache with Time-To-Live expiry.

    Key: SHA-256 hash of (question_english, region)
    Value: cached QueryResponse dict
    """

    def __init__(self, ttl_seconds: int = 300, max_size: int = 500):
        self._store: dict[str, tuple[Any, float]] = {}  # key -> (value, expires_at)
        self._ttl = ttl_seconds
        self._max_size = max_size
        self._lock = Lock()
        self._hits = 0
        self._misses = 0

    def _make_key(self, question_english: str, region: Optional[str] = None) -> str:
        """Deterministic cache key from English question + region."""
        raw = f"{question_english.strip().lower()}::{(region or '').lower()}"
        return hashlib.sha256(raw.encode()).hexdigest()

    def get(self, question_english: str, region: Optional[str] = None) -> Optional[Any]:
        """Returns cached value or None if missing/expired."""
        key = self._make_key(question_english, region)
        with self._lock:
            entry = self._store.get(key)
            if entry is None:
                self._misses += 1
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                del self._store[key]
                self._misses += 1
                return None
            self._hits += 1
            logger.debug(f"Cache HIT for key {key[:8]}…")
            return value

    def set(self, question_english: str, value: Any, region: Optional[str] = None) -> None:
        """Stores a value with TTL expiry. Evicts oldest if at max capacity."""
        key = self._make_key(question_english, region)
        expires_at = time.monotonic() + self._ttl
        with self._lock:
            # Simple eviction: remove oldest entry if full
            if len(self._store) >= self._max_size:
                oldest_key = next(iter(self._store))
                del self._store[oldest_key]
                logger.debug("Cache evicted oldest entry (max_size reached).")
            self._store[key] = (value, expires_at)

    @property
    def hit_rate(self) -> float:
        total = self._hits + self._misses
        return self._hits / total if total > 0 else 0.0

    @property
    def size(self) -> int:
        return len(self._store)

    def clear(self) -> None:
        with self._lock:
            self._store.clear()
            self._hits = 0
            self._misses = 0


# ── Module-level singleton ────────────────────────────────────────────────────
query_cache = TTLCache(
    ttl_seconds=settings.cache_ttl_seconds,
    max_size=500,
)
