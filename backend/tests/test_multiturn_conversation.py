"""
tests/test_multiturn_conversation.py — Multi-turn conversation memory & question-specific answering tests.
Validates that follow-up queries carry conversation history, contextualize retrieval,
and answer specific questions (e.g. mandi auction location, e-NAM registration) instead of dumping static price tables.
"""
import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services.rate_limiter import query_rate_limiter


@pytest.fixture
def client():
    """Provides a TestClient within the application lifespan context."""
    query_rate_limiter.reset()
    with TestClient(app) as c:
        yield c


def test_three_turn_conversation_flow(client):
    """
    Test 3 sequential conversation turns:
      Turn 1: Commodity price enquiry for Beetroot in Gautam Buddha Nagar
      Turn 2: Follow-up asking for nearest APMC Mandi auction location & hours
      Turn 3: Follow-up asking for e-NAM registration process & DBT payment
    """
    region = "Gautam Buddha Nagar, Uttar Pradesh"

    # ── Turn 1: Commodity Price Enquiry ───────────────────────────────────────
    payload_turn1 = {
        "question": "What is the price of beetroot in my area?",
        "language": "en",
        "region": region,
    }
    res1 = client.post("/api/v1/query", json=payload_turn1)
    assert res1.status_code == 200, f"Turn 1 failed: {res1.text}"
    data1 = res1.json()

    assert data1["conversation_id"] is not None
    conv_id = data1["conversation_id"]
    assert len(conv_id) > 5

    ans1 = data1["answer_english"]
    assert "Beetroot" in ans1 or "beetroot" in ans1.lower()
    assert "Mandi" in ans1 or "APMC" in ans1
    assert data1["follow_up_questions"] is not None
    assert len(data1["follow_up_questions"]) > 0

    # ── Turn 2: Auction Location Enquiry (with conversation_id) ───────────────
    payload_turn2 = {
        "question": "Where is the nearest APMC Mandi auction in my district?",
        "language": "en",
        "region": region,
        "conversation_id": conv_id,
    }
    res2 = client.post("/api/v1/query", json=payload_turn2)
    assert res2.status_code == 200, f"Turn 2 failed: {res2.text}"
    data2 = res2.json()

    assert data2["conversation_id"] == conv_id
    ans2 = data2["answer_english"]

    # Must specifically answer the auction location question:
    # 1. Must list local mandis (Dadri Mandi, Noida APMC, Sahibabad)
    assert "Dadri" in ans2
    assert "Noida" in ans2 or "Sahibabad" in ans2
    # 2. Must detail morning auction hours (6:00 AM – 11:00 AM)
    assert "6:00 AM" in ans2 or "06:00 AM" in ans2
    assert "11:00 AM" in ans2
    # 3. Must cover lot entry, quality assaying, and weighment
    assert "assaying" in ans2.lower() or "quality" in ans2.lower()
    assert "weigh" in ans2.lower()
    # 4. Must NOT be the generic 4-box price table
    assert "### 💰 2. Current Estimated Mandi Rates" not in ans2

    # ── Turn 3: e-NAM Registration Enquiry (with conversation_id) ─────────────
    payload_turn3 = {
        "question": "How do I register on e-NAM to sell this crop?",
        "language": "en",
        "region": region,
        "conversation_id": conv_id,
    }
    res3 = client.post("/api/v1/query", json=payload_turn3)
    assert res3.status_code == 200, f"Turn 3 failed: {res3.text}"
    data3 = res3.json()

    assert data3["conversation_id"] == conv_id
    ans3 = data3["answer_english"]

    # Must specifically answer the e-NAM registration question:
    assert "enam.gov.in" in ans3 or "e-NAM" in ans3
    assert "Aadhaar" in ans3
    assert "passbook" in ans3.lower() or "bank" in ans3.lower()
    assert "DBT" in ans3 or "transfer" in ans3.lower()
    # Follow-up questions must be present
    assert data3["follow_up_questions"] is not None
    assert len(data3["follow_up_questions"]) > 0
