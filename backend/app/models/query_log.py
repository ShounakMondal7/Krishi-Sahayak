"""
models/query_log.py — SQLAlchemy ORM models for audit logging.

Tables:
  - query_logs   : Every query made by a farmer
  - error_logs   : Server-side error tracking (never exposed to users)
"""
from datetime import datetime, timezone
from sqlalchemy import (
    Integer, Text, String, DateTime, Float, Boolean, JSON
)
from sqlalchemy.orm import Mapped, mapped_column

from app.database import Base


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class QueryLog(Base):
    """
    Records every farmer query end-to-end.
    Used for analytics, quality assurance, and research/paper data.
    """
    __tablename__ = "query_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Input ──────────────────────────────────────────────────────────
    question_original: Mapped[str] = mapped_column(Text, nullable=False)
    question_english: Mapped[str] = mapped_column(Text, nullable=True)
    input_mode: Mapped[str] = mapped_column(String(10), default="text")  # "text" | "voice" | "image"
    image_description: Mapped[str] = mapped_column(Text, nullable=True)  # GPT-4o vision output

    # ── Output ─────────────────────────────────────────────────────────
    answer_english: Mapped[str] = mapped_column(Text, nullable=True)
    answer_malayalam: Mapped[str] = mapped_column(Text, nullable=True)
    sources: Mapped[str] = mapped_column(Text, nullable=True)  # comma-separated filenames

    # ── RAG Metadata ─────────────────────────────────────────────────
    retrieval_score: Mapped[float] = mapped_column(Float, nullable=True)  # avg similarity
    chunks_retrieved: Mapped[int] = mapped_column(Integer, default=0)
    from_cache: Mapped[bool] = mapped_column(Boolean, default=False)
    weather_injected: Mapped[bool] = mapped_column(Boolean, default=False)
    market_injected: Mapped[bool] = mapped_column(Boolean, default=False)

    # ── Context ────────────────────────────────────────────────────────
    language: Mapped[str] = mapped_column(String(5), default="ml")
    region: Mapped[str] = mapped_column(String(100), nullable=True)
    session_id: Mapped[str] = mapped_column(String(64), nullable=True)   # anonymous session
    conversation_id: Mapped[str] = mapped_column(String(64), nullable=True)  # multi-turn thread

    # ── Performance ────────────────────────────────────────────────────
    response_time_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    translation_time_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    retrieval_time_ms: Mapped[int] = mapped_column(Integer, nullable=True)
    llm_time_ms: Mapped[int] = mapped_column(Integer, nullable=True)

    # ── Timestamps ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<QueryLog id={self.id} region={self.region} at={self.created_at}>"



class ErrorLog(Base):
    """
    Server-side error tracking.
    Stack traces and raw error details are stored here, never in API responses.
    """
    __tablename__ = "error_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)

    # ── Error Context ──────────────────────────────────────────────────
    error_type: Mapped[str] = mapped_column(String(100), nullable=False)
    error_message: Mapped[str] = mapped_column(Text, nullable=True)
    stack_trace: Mapped[str] = mapped_column(Text, nullable=True)
    endpoint: Mapped[str] = mapped_column(String(200), nullable=True)

    # ── Request Context ────────────────────────────────────────────────
    query_text: Mapped[str] = mapped_column(Text, nullable=True)
    region: Mapped[str] = mapped_column(String(100), nullable=True)
    extra_data: Mapped[dict] = mapped_column(JSON, nullable=True)

    # ── Timestamps ─────────────────────────────────────────────────────
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=utcnow,
        nullable=False,
    )

    def __repr__(self) -> str:
        return f"<ErrorLog id={self.id} type={self.error_type} at={self.created_at}>"
