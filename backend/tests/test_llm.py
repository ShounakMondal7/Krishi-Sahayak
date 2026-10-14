"""
tests/test_llm.py — Unit tests for LLM prompt engineering, response formats, and extractive fallback.
"""
from app.services.llm import (
    SYSTEM_PROMPT,
    KVK_REFERRAL_EN,
    _build_user_prompt,
    _extract_grounded_fallback,
)


def test_system_prompt_structure_requirements():
    """Validates that the hardcoded system prompt strictly enforces all mandatory sections."""
    assert "### 🛑 Diagnosis" in SYSTEM_PROMPT
    assert "### 🌿 Organic & Cultural Control" in SYSTEM_PROMPT
    assert "### 🧪 Chemical Treatment" in SYSTEM_PROMPT
    assert "Krishi Vigyan Kendra" in SYSTEM_PROMPT
    assert "under 15 words" in SYSTEM_PROMPT


def test_build_user_prompt_with_context():
    """Validates prompt assembly when context chunks are retrieved."""
    chunks = [
        "Brown planthopper causes hopper burn in rice plants.",
        "Spray neem oil 3% as an organic repellent.",
    ]
    prompt = _build_user_prompt("How to control brown planthopper?", chunks)

    assert "CONTEXT FROM VERIFIED AGRICULTURAL DOCUMENTS:" in prompt
    assert "[Source 1]" in prompt
    assert "[Source 2]" in prompt
    assert "FARMER'S QUESTION: How to control brown planthopper?" in prompt
    assert "Brown planthopper causes hopper burn" in prompt


def test_build_user_prompt_empty_context():
    """Validates prompt assembly when no relevant context chunks exist."""
    prompt = _build_user_prompt("Unknown space crop?", [])
    assert "[No relevant documents found in knowledge base]" in prompt


def test_extract_grounded_fallback():
    """Validates extractive ICAR synthesis when OpenAI API key is unavailable."""
    sample_chunk = """
    ICAR Package of Practice for Rice 2024
    ======================================
    Brown planthopper nymphs suck sap from the base of the rice tillers.
    Leaves turn yellow and dry up rapidly producing circular hopper burn patches.
    Drain standing water from the field for 3 to 4 days to disrupt pest lifecycle.
    """

    fallback_answer = _extract_grounded_fallback([sample_chunk])
    assert fallback_answer is not None
    assert len(fallback_answer) > 20
    # Must not contain header delimiters
    assert "=====" not in fallback_answer

    # Test empty chunks returns KVK referral
    empty_fallback = _extract_grounded_fallback([])
    assert empty_fallback == KVK_REFERRAL_EN
