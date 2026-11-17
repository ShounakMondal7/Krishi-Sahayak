"""
tests/test_tts_expressive.py — Unit tests for expressive SSML advisory speech synthesis.
"""

import asyncio
import pytest

from app.services.tts import (
    _prepare_clean_spoken_text,
    _prepare_spoken_script,
    _prepare_spoken_plain_text,
    _clean_markdown_text,
    split_script_into_chunks,
    synthesize_advisory_audio,
    synthesize_advisory_audio_sync,
    synthesize_demo_audio,
    GCLOUD_VOICE_MAP,
    EDGE_TTS_VOICE_MAP,
)

SAMPLE_ADVISORY = """
### 🛑 1. Field Diagnosis
- **Identified Issue:** Paddy Yellow Stem Borer
- **Key Visual Signs:** Dead hearts in early stage, white ears at panicle stage.

### 🌿 2. Immediate & Organic Action (Low-Cost)
- **Field Sanitation:** Clip seedling tips before transplanting.
- **Organic Treatment:** Install pheromone traps at 5 per acre.

### 🧪 3. Chemical Treatment & Exact Dosage
- **Recommended Chemical:** Cartap Hydrochloride 50% SP
- **Dosage per 15-Liter Pump:** Mix 30 grams per 15L tank. Spray in the morning.

### ⚠️ 4. Safety & Harvest Precaution
- **Waiting Period:** 21 days before harvest.
- **Safety:** Wear face mask while spraying.
"""


def test_prepare_spoken_script_structure():
    """Verify zero SSML tags, visual artifact removal, and 'Here is your advisory.' greeting."""
    clean = _prepare_clean_spoken_text(SAMPLE_ADVISORY, language="en")

    # Check that ALL SSML / XML tags are completely absent
    assert "<speak>" not in clean
    assert "</speak>" not in clean
    assert "<prosody" not in clean
    assert "<break" not in clean
    assert "<" not in clean and ">" not in clean

    # Check visual artifacts are stripped
    assert "###" not in clean
    assert "🛑" not in clean
    assert "🌿" not in clean
    assert "🧪" not in clean
    assert "⚠️" not in clean
    assert "**" not in clean

    # Check localized warm greeting at start
    assert clean.startswith("Here is your advisory.")
    assert "Paddy Yellow Stem Borer" in clean
    assert "Cartap Hydrochloride" in clean


def test_prepare_spoken_plain_text():
    """Verify clean plain text generation without XML tags for non-SSML engines."""
    plain = _prepare_spoken_plain_text(SAMPLE_ADVISORY, language="en")

    assert "<speak>" not in plain
    assert "</speak>" not in plain
    assert "<break" not in plain
    assert "###" not in plain
    assert "🛑" not in plain
    assert "**" not in plain

    assert "Here is your advisory." in plain
    assert "Cartap Hydrochloride" in plain


def test_clean_markdown_text_spoken_units():
    """Verify spoken unit normalization (e.g. 15L -> 15-liter, SP -> S P)."""
    text = "Mix 30g in 15L tank with Cartap SP at 2 g/L. Consult KVK at 1800-180-1551."
    cleaned = _clean_markdown_text(text, language="en")

    assert "15-liter" in cleaned
    assert "S P" in cleaned
    assert "grams per liter" in cleaned
    assert "K V K" in cleaned
    assert "1800 180 1551" in cleaned


def test_voice_mappings_coverage():
    """Verify major Indian languages have valid voice mappings."""
    expected_langs = ["en", "hi", "bn", "ta", "te", "ml", "mr"]
    for lang in expected_langs:
        assert lang in GCLOUD_VOICE_MAP, f"Missing Google Cloud voice for {lang}"
        assert lang in EDGE_TTS_VOICE_MAP, f"Missing Edge-TTS voice for {lang}"


def test_synthesize_demo_audio():
    """Verify demo audio generates valid MP3 bytes."""
    demo_bytes = synthesize_demo_audio()
    assert isinstance(demo_bytes, bytes)
    assert len(demo_bytes) > 100
    assert demo_bytes.startswith(b"\xff\xfb")


@pytest.mark.anyio
async def test_synthesize_advisory_audio_async():
    """Verify synthesize_advisory_audio returns non-empty audio content."""
    short_text = "### 🛑 1. Field Diagnosis\n- **Identified Issue:** Rice Blast"
    audio = await synthesize_advisory_audio(short_text, lang="en")
    assert isinstance(audio, bytes)
    assert len(audio) > 1000


def test_clean_markdown_text_strips_tables():
    """Verify markdown table syntax (|---| divider rows and pipes) is stripped/converted."""
    table_text = (
        "| Mandi | Modal Price |\n"
        "| :--- | :--- |\n"
        "| Nashik APMC | Rs 1800/q |\n"
        "| Pune APMC | Rs 2000/q |\n"
    )
    cleaned = _clean_markdown_text(table_text, language="en")
    assert "| --- |" not in cleaned
    assert "| :--- |" not in cleaned
    assert "|" not in cleaned
    assert "Nashik APMC: Rs 1800/q" in cleaned
    assert "Pune APMC: Rs 2000/q" in cleaned


def test_split_script_into_chunks():
    """Verify single complete clean advisory speech delivered with 'Here is your advisory.' greeting."""
    long_advisory = (
        "### 🛑 1. Field Diagnosis\n"
        "- **Identified Issue:** Tomato leaf curl virus.\n"
        "Based on observed curling and stunted growth, whitefly infestation is suspected. "
        "For organic control, spray neem oil at 5ml per liter of water. "
        "Install yellow sticky traps at 10 traps per acre across the field. "
        "For chemical control, apply Acetamiprid 20 SP at 15 grams per 15-liter pump. "
        "Important precautions: observe a 7-day waiting period before harvest and wear protective gloves."
    )
    chunks = split_script_into_chunks(long_advisory)
    assert len(chunks) == 1
    assert chunks[0].startswith("Here is your advisory.")
    assert "Tomato leaf curl virus" in chunks[0]
    assert "Acetamiprid" in chunks[0]
    assert "7-day waiting period" in chunks[0]
