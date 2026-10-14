"""
tests/test_cache.py — Unit tests for the in-memory TTLCache service.
"""
import time
from app.services.cache import TTLCache


def test_ttl_cache_basic_operations():
    """Validates get, set, and cache hit/miss counting."""
    cache = TTLCache(ttl_seconds=60, max_size=10)

    # Initially empty
    assert cache.get("What is brown planthopper?") is None
    assert cache.hit_rate == 0.0

    # Set value
    cached_payload = {"answer": "Pest control steps", "sources": ["doc1.txt"]}
    cache.set("What is brown planthopper?", cached_payload, region="Palakkad")

    # Retrieve value
    retrieved = cache.get("what is brown planthopper? ", region="palakkad")
    assert retrieved is not None
    assert retrieved["answer"] == "Pest control steps"
    assert cache.hit_rate > 0.0


def test_ttl_cache_expiration():
    """Validates that expired items are evicted and return None."""
    # Fast TTL of 0.1s for test
    cache = TTLCache(ttl_seconds=1, max_size=10)
    cache._ttl = 0.05  # 50 milliseconds

    cache.set("query", {"answer": "fast expiry"})
    assert cache.get("query") is not None

    time.sleep(0.08)
    # Must now be expired
    assert cache.get("query") is None


def test_ttl_cache_capacity_eviction():
    """Validates that oldest items are evicted when capacity is reached."""
    cache = TTLCache(ttl_seconds=60, max_size=3)

    cache.set("q1", "ans1")
    cache.set("q2", "ans2")
    cache.set("q3", "ans3")
    assert cache.size == 3

    # Add 4th item, should evict q1
    cache.set("q4", "ans4")
    assert cache.size == 3
    assert cache.get("q1") is None
    assert cache.get("q4") == "ans4"
