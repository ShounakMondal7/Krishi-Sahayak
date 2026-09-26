"""
models/__init__.py — Exposes all ORM models so SQLAlchemy can discover them.
"""
from app.models.query_log import QueryLog, ErrorLog  # noqa: F401

__all__ = ["QueryLog", "ErrorLog"]
