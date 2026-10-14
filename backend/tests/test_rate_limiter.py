"""
tests/test_rate_limiter.py — Unit tests for the sliding-window rate limiter service.
"""
from app.services.rate_limiter import SlidingWindowRateLimiter


def test_rate_limiter_allows_under_limit():
    """Validates that requests under the limit are permitted."""
    limiter = SlidingWindowRateLimiter(requests_limit=5, window_seconds=60)
    client_ip = "192.168.1.50"

    for i in range(5):
        allowed, remaining, retry_after = limiter.is_allowed(client_ip)
        assert allowed is True
        assert remaining == 4 - i
        assert retry_after == 0


def test_rate_limiter_blocks_over_limit():
    """Validates that requests exceeding the limit are blocked with retry_after."""
    limiter = SlidingWindowRateLimiter(requests_limit=3, window_seconds=60)
    client_ip = "192.168.1.51"

    # Consume allowed quota
    for _ in range(3):
        allowed, _, _ = limiter.is_allowed(client_ip)
        assert allowed is True

    # 4th request must be rejected
    allowed, remaining, retry_after = limiter.is_allowed(client_ip)
    assert allowed is False
    assert remaining == 0
    assert retry_after > 0


def test_rate_limiter_isolated_per_client():
    """Validates that limits on one IP do not impact other client IPs."""
    limiter = SlidingWindowRateLimiter(requests_limit=2, window_seconds=60)
    client_a = "10.0.0.1"
    client_b = "10.0.0.2"

    limiter.is_allowed(client_a)
    limiter.is_allowed(client_a)
    # client_a is at limit
    assert limiter.is_allowed(client_a)[0] is False

    # client_b should still be allowed
    assert limiter.is_allowed(client_b)[0] is True
