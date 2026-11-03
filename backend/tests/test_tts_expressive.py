"""
tests/test_tts_expressive.py — Unit tests for expressive SSML advisory speech synthesis.
"""

import asyncio
import pytest

from app.services.tts import (
    _prepare_spoken_script,
    _prepare_spoken_plain_text,
    _clean_markdown_text,
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
    """Verify SSML structure, pauses, prosody, and visual artifact removal."""
    ssml = _prepare_spoken_script(SAMPLE_ADVISORY, language="en")

    # Check root tags & prosody
    assert ssml.startswith("<speak>")
    assert ssml.endswith("</speak>")
    assert '<prosody rate="93%" pitch="+0st">' in ssml

    # Check breathing & absorption pauses
    assert '<break time="500ms"/>' in ssml
    assert '<break time="250ms"/>' in ssml

    # Check visual artifacts are stripped
    assert "###" not in ssml
    assert "🛑" not in ssml
    assert "🌿" not in ssml
    assert "🧪" not in ssml
    assert "⚠️" not in ssml
    assert "**" not in ssml

    # Check conversational transitions
    assert "Here is your crop advisory" in ssml
    assert "First, for low-cost organic management" in ssml
    assert "For chemical control, use the following verified mixture" in ssml
    assert "Important precautions" in ssml


def test_prepare_spoken_plain_text():
    """Verify clean plain text generation without XML tags for non-SSML engines."""
    plain = _prepare_spoken_plain_text(SAMPLE_ADVISORY, language="en")

    assert "<speak>" not in plain
    assert "</speak>" not in plain
    assert "<break" not in plain
    assert "###" not in plain
    assert "🛑" not in plain
    assert "**" not in plain

    assert "Here is your crop advisory" in plain
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
