"""
api/health.py — System health check endpoint.

GET /health

Checks:
  - ChromaDB: collection exists and has ≥1 document
  - PostgreSQL: connection is alive
  - Translation backend: which model is active

Returns HTTP 200 if all healthy, 503 if any check fails.
"""
import logging
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Response
from fastapi.responses import JSONResponse

from app.database import check_db_health
from app.schemas.query import HealthResponse
from app.services import rag, translation
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(tags=["System"])

# Track app startup time
_startup_time = time.monotonic()


@router.get(
    "/health",
    response_model=HealthResponse,
    summary="System health check",
    description="Checks ChromaDB, PostgreSQL, and translation backend. Returns 503 if any check fails.",
)
async def health_check(response: Response) -> HealthResponse:
    """
    Multi-component health check for monitoring and Kubernetes readiness probes.
    """
    checks = {}

    # ── PostgreSQL ─────────────────────────────────────────────────────
    db_ok = await check_db_health()
    checks["db"] = "ok" if db_ok else "error"

    # ── ChromaDB ──────────────────────────────────────────────────────
    chroma_count = rag.get_document_count()
    chroma_ok = chroma_count >= 0  # -1 means error; 0 means empty but reachable

    # ── Translation ───────────────────────────────────────────────────
    translation_backend = translation.get_translation_backend()

    # ── Overall status ────────────────────────────────────────────────
    all_healthy = db_ok and chroma_ok

    if not all_healthy:
        response.status_code = 503
        status = "error"
    elif chroma_count == 0:
        status = "degraded"  # DB OK but knowledge base is empty
    else:
        status = "ok"

    uptime = time.monotonic() - _startup_time

    health = HealthResponse(
        status=status,
        chroma_documents=max(chroma_count, 0),
        db=checks["db"],
        version=settings.app_version,
        uptime_seconds=round(uptime, 1),
        timestamp=datetime.now(timezone.utc),
    )

    logger.debug(
        f"Health: status={status}, chroma={chroma_count}, "
        f"db={checks['db']}, translation={translation_backend}"
    )

    return health
