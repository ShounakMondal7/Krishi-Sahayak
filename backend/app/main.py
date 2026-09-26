"""
main.py — FastAPI application entry point.

Initializes the app with:
  - CORS middleware
  - Lifespan context (startup/shutdown)
  - Router registration
  - OpenAPI documentation customization
"""
import logging
import time
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.config import settings
from app.database import create_all_tables
from app.api import query, analytics, health

# ── Logging ───────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.DEBUG if settings.is_development else logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s — %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)
logger = logging.getLogger(__name__)


# ── Lifespan ──────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator:
    """
    Startup & shutdown lifecycle.
    Runs once when the server starts, then yields, then runs cleanup on shutdown.
    """
    logger.info(f"🚀 Starting {settings.app_name} v{settings.app_version} [{settings.env}]")

    # Create DB tables
    await create_all_tables()
    logger.info("✅ Database ready.")

    # Pre-warm ChromaDB and embedding model (non-blocking)
    try:
        from app.services.rag import get_collection, get_document_count
        doc_count = get_document_count()
        logger.info(f"✅ ChromaDB ready — {doc_count} documents in collection.")
    except Exception as exc:
        logger.warning(f"⚠️  ChromaDB pre-warm failed: {exc}")

    logger.info("✅ Server startup complete. Accepting requests.")
    yield

    # Shutdown
    logger.info("👋 Shutting down gracefully.")


# ── App Factory ────────────────────────────────────────────────────────────────
app = FastAPI(
    title="AI Farmer Advisory System",
    description=(
        "A Retrieval-Augmented Generation (RAG) system for Malayalam-speaking farmers. "
        "Provides grounded agricultural advice using verified ICAR/Kerala Agri documents. "
        "Built with FastAPI, ChromaDB, IndicTrans2, and GPT-4o-mini."
    ),
    version=settings.app_version,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
    lifespan=lifespan,
    contact={
        "name": "AI Farmer Advisory Research Team",
        "email": "research@example.com",
    },
    license_info={
        "name": "MIT",
        "url": "https://opensource.org/licenses/MIT",
    },
)


# ── CORS Middleware (CERT-In / OWASP Hardened) ─────────────────────────────────
# Enforce strict origin whitelisting: no wildcard '*' in production or with credentials
configured_origins = [o.strip() for o in settings.cors_origins_list if o.strip()]
if settings.is_production:
    # Strictly remove any wildcard origin in production environments
    strict_origins = [o for o in configured_origins if o != "*"]
    if not strict_origins:
        strict_origins = ["https://krishisahayak.gov.in"]
        logger.warning("No explicit CORS origins set in production; defaulted to strict domain.")
else:
    strict_origins = configured_origins

app.add_middleware(
    CORSMiddleware,
    allow_origins=strict_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization", "Accept", "X-Requested-With"],
)


# ── Request Timing Middleware ──────────────────────────────────────────────────
@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """Adds X-Process-Time header to every response for monitoring."""
    start = time.time()
    response = await call_next(request)
    process_time = int((time.time() - start) * 1000)
    response.headers["X-Process-Time-Ms"] = str(process_time)
    return response


# ── Global Exception Handler (CERT-In Mandate) ──────────────────────────────────
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """
    Catches unhandled 500 exceptions and returns an opaque, sanitized JSON response.
    Stack traces and system internals are strictly logged server-side and NEVER exposed to clients.
    """
    logger.error(f"Unhandled 500 error on {request.method} {request.url.path}: {exc}", exc_info=True)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal Service Error"},
    )


# ── Router Registration ────────────────────────────────────────────────────────
app.include_router(query.router)
app.include_router(analytics.router)
app.include_router(health.router)


# ── Root Redirect ─────────────────────────────────────────────────────────────
@app.get("/", include_in_schema=False)
async def root():
    """Root endpoint — redirects to API docs."""
    return {
        "name": settings.app_name,
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/health",
        "status": "running",
    }
