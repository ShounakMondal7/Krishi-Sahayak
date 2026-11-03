import pytest
from app.services import cache as cache_svc
from app.services import llm


def test_follow_up_cache_keys_distinct():
    q1 = "How to control leaf blight in rice?"
    q2 = "What is the dosage of Mancozeb?"

    key1 = cache_svc.query_cache._make_key(q1, region="Uttar Pradesh", language="en")
    key2 = cache_svc.query_cache._make_key(q2, region="Uttar Pradesh", language="en")

    assert key1 != key2, "Follow-up question must produce a distinct cache key from parent query"


def test_extractive_fallback_ignores_conversation_preamble():
    # Simulate conversation history preamble from prior turns
    conv_chunk = (
        "[CONVERSATION HISTORY - for context only, do not answer from memory alone]\n"
        "Turn 1 - Farmer asked: How to control bacterial blight?\n"
        "Turn 1 - Previous answer: Use streptocycline 100 ppm spray."
    )
    # New retrieval chunk for the follow-up question about Mancozeb dosage
    mancozeb_chunk = (
        "For fungal blast and blight, spray Mancozeb 75% WP @ 2.0 to 2.5 g per liter of water. "
        "Spray early in the morning or late evening. Waiting period before harvest is 14 days."
    )

    answer = llm._extract_grounded_fallback(
        [conv_chunk, mancozeb_chunk]
    )

    # Must contain dosage / waiting period extracted from the new document
    assert "37.5g" in answer or "14 days" in answer
    # Must NOT repeat the old streptocycline answer from the conversation history preamble
    assert "streptocycline" not in answer.lower()
