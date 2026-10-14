"""
services/rate_limiter.py — In-memory sliding-window rate limiter for FastAPI.

Protects public advisory endpoints against automated abuse, scraping,
and excessive external API token consumption.
"""
import time
import logging
from typing import Dict, List
from threading import Lock
from fastapi import Request, HTTPException, status

from app.config import settings

logger = logging.getLogger(__name__)


class SlidingWindowRateLimiter:
    """
    Thread-safe in-memory sliding window rate limiter.
    Tracks timestamped requests per client identifier within a moving window.
    """

    def __init__(self, requests_limit: int = 30, window_seconds: int = 60):
        self.requests_limit = requests_limit
        self.window_seconds = window_seconds
        self._clients: Dict[str, List[float]] = {}
        self._lock = Lock()

    def is_allowed(self, client_id: str) -> tuple[bool, int, int]:
        """
        Check if request is allowed for client_id.

        Returns:
            (allowed: bool, remaining: int, retry_after: int)
        """
        now = time.monotonic()
        cutoff = now - self.window_seconds

        with self._lock:
            timestamps = self._clients.get(client_id, [])

            # Filter out timestamps older than the window
            valid_timestamps = [ts for ts in timestamps if ts > cutoff]

            if len(valid_timestamps) >= self.requests_limit:
                # Rate limit exceeded
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, int(oldest_in_window + self.window_seconds - now))
                self._clients[client_id] = valid_timestamps
                return False, 0, retry_after

            # Request is allowed — append current timestamp
            valid_timestamps.append(now)
            self._clients[client_id] = valid_timestamps
            remaining = self.requests_limit - len(valid_timestamps)
            return True, remaining, 0

    def cleanup_stale_clients(self) -> None:
        """Removes client records with no requests in the current window."""
        now = time.monotonic()
        cutoff = now - self.window_seconds
        with self._lock:
            stale_keys = [
                cid for cid, timestamps in self._clients.items()
                if not timestamps or timestamps[-1] <= cutoff
            ]
            for key in stale_keys:
                del self._clients[key]

    def reset(self) -> None:
        """Clears all rate limit state (primarily for test isolation)."""
        with self._lock:
            self._clients.clear()


# Module-level singleton
query_rate_limiter = SlidingWindowRateLimiter(
    requests_limit=settings.rate_limit_per_minute,
    window_seconds=60,
)


def get_client_ip(request: Request) -> str:
    """Extract real client IP address considering proxy headers."""
    forwarded = request.headers.get("X-Forwarded-For")
    if forwarded:
        return forwarded.split(",")[0].strip()
    real_ip = request.headers.get("X-Real-IP")
    if real_ip:
        return real_ip.strip()
    return request.client.host if request.client else "127.0.0.1"


async def rate_limit_query(request: Request) -> None:
    """
    FastAPI dependency to rate-limit query endpoints.
    Raises HTTP 429 when client exceeds requests per minute.
    """
    client_ip = get_client_ip(request)
    allowed, remaining, retry_after = query_rate_limiter.is_allowed(client_ip)

    if not allowed:
        logger.warning(f"Rate limit exceeded for client IP: {client_ip}")
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Rate limit exceeded. Please wait {retry_after} seconds before asking another query.",
            headers={
                "Retry-After": str(retry_after),
                "X-RateLimit-Limit": str(query_rate_limiter.requests_limit),
                "X-RateLimit-Remaining": "0",
            },
        )
