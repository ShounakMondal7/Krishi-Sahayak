"""
tests/test_schemas.py — Unit tests for Pydantic request/response models and CERT-In input sanitizers.
"""
import pytest
from pydantic import ValidationError

from app.schemas.query import (
    QueryRequest,
    sanitize_text_input,
    sanitize_region_input,
    sanitize_identifier,
    make_source_labels,
)


def test_query_request_validation():
    """Validates that valid query requests pass and invalid ones raise ValidationError."""
    req = QueryRequest(question="  എന്റെ നെൽ ചെടികൾ മഞ്ഞ നിറമാകുന്നു  ", language="ml")
    # Whitespace must be stripped automatically
    assert req.question == "എന്റെ നെൽ ചെടികൾ മഞ്ഞ നിറമാകുന്നു"
    assert req.language == "ml"
    assert req.region is None

    # Test invalid short question
    with pytest.raises(ValidationError):
        QueryRequest(question="a", language="ml")

    # Test invalid language pattern
    with pytest.raises(ValidationError):
        QueryRequest(question="Valid question", language="malayalam")


def test_sanitize_text_input():
    """Validates input sanitization for farmer text queries."""
    clean = sanitize_text_input("How to treat rice blast disease?")
    assert clean == "How to treat rice blast disease?"

    # Strips null bytes
    with_null = "Rice blast\x00 disease"
    cleaned = sanitize_text_input(with_null)
    assert "\x00" not in cleaned

    # Strips script tags
    with_script = "Rice blast <script>alert('xss')</script> treatment"
    cleaned_script = sanitize_text_input(with_script)
    assert "<script>" not in cleaned_script
    assert "alert" not in cleaned_script

    # Rejects SQL injection attack patterns
    with pytest.raises(ValueError, match="SQL injection"):
        sanitize_text_input("test; DROP TABLE query_logs;--")

    # Rejects overly long inputs on QueryRequest
    long_input = "x" * 1500
    with pytest.raises(ValidationError):
        QueryRequest(question=long_input)


def test_sanitize_region_input():
    """Validates region input sanitization."""
    assert sanitize_region_input(None) is None
    assert sanitize_region_input("  Thrissur  ") == "Thrissur"
    assert sanitize_region_input("Ludhiana, Punjab") == "Ludhiana, Punjab"

    # Rejects invalid characters
    with pytest.raises(ValueError, match="Invalid characters"):
        sanitize_region_input("Thrissur<script>")


def test_sanitize_identifier():
    """Validates session and conversation ID sanitization."""
    assert sanitize_identifier(None, "session_id") is None
    assert sanitize_identifier("session-123_abc", "session_id") == "session-123_abc"

    # Rejects invalid formats
    with pytest.raises(ValueError, match="alphanumeric"):
        sanitize_identifier("invalid/session;drop table", "session_id")


def test_make_source_labels():
    """Validates mapping of raw filenames to human-readable ICAR labels."""
    filenames = ["icar_rice_diseases.txt", "kerala_agri_advisory_2024.txt", "custom_doc.txt"]
    labels = make_source_labels(filenames)
    assert len(labels) == 3

    assert labels[0].filename == "icar_rice_diseases.txt"
    assert "ICAR" in labels[0].display_name

    assert labels[1].filename == "kerala_agri_advisory_2024.txt"
    assert "Kerala" in labels[1].display_name
