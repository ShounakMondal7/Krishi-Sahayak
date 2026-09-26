"""
database.py — Async SQLAlchemy engine, session factory, and Base.

All DB operations throughout the app must be async.
Import `AsyncSessionLocal` and `get_db` dependency here.
"""
import logging
from contextlib import asynccontextmanager
from typing import AsyncGenerator

from sqlalchemy.ext.asyncio import (
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy import text
from sqlalchemy.pool import AsyncAdaptedQueuePool

from app.config import settings

logger = logging.getLogger(__name__)


# ── Engine ────────────────────────────────────────────────────────────────────
is_sqlite = "sqlite" in settings.database_url
engine_kwargs = {
    "echo": settings.is_development,
    "pool_size": 10,
    "max_overflow": 20,
    "pool_recycle": 1800,
    "pool_pre_ping": True,
}

if is_sqlite:
    # SQLite async engine defaults to NullPool; use AsyncAdaptedQueuePool to enable connection pooling
    engine_kwargs["poolclass"] = AsyncAdaptedQueuePool

engine = create_async_engine(settings.database_url, **engine_kwargs)

# ── Session Factory ───────────────────────────────────────────────────────────
AsyncSessionLocal = async_sessionmaker(
    bind=engine,
    class_=AsyncSession,
    expire_on_commit=False,
    autoflush=False,
    autocommit=False,
)


# ── Declarative Base ──────────────────────────────────────────────────────────
class Base(DeclarativeBase):
    pass


# ── FastAPI Dependency ────────────────────────────────────────────────────────
async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Yields an async DB session and ensures it is closed after use.
    Use as a FastAPI dependency:

        async def my_endpoint(db: AsyncSession = Depends(get_db)):
            ...
    """
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


# ── Table Initialisation ──────────────────────────────────────────────────────
async def create_all_tables() -> None:
    """
    Creates all ORM-mapped tables if they don't already exist.
    Called once at startup from main.py lifespan.
    """
    from app.models import query_log  # noqa: F401 — ensures models are registered
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("✅ Database tables verified / created.")


async def check_db_health() -> bool:
    """Returns True if DB is reachable, False otherwise."""
    try:
        async with AsyncSessionLocal() as session:
            await session.execute(text("SELECT 1"))
        return True
    except Exception as exc:
        logger.error(f"Database health check failed: {exc}")
        return False
