"""
services/tts.py — Natural, Expressive Agricultural Advisory Speech Synthesis.

Converts agricultural advisory markdown into natural, human-like spoken audio (MP3).
- Pre-processes Markdown into an expressive spoken script using SSML.
- Uses Google Cloud Text-to-Speech (Neural2 / WaveNet) when credentials are available.
- Features zero-cost, high-expressiveness Indian neural voices via edge-tts and OpenAI TTS.
- Falls back gracefully to gTTS and offline demo audio if external services are unreachable.
"""

import asyncio
import concurrent.futures
import html
import io
import logging
import os
import re
from typing import Dict, List, Optional

from app.config import settings

logger = logging.getLogger(__name__)

# ── Google Cloud TTS Voice Priority (Neural2 / WaveNet) ───────────────────────
GCLOUD_VOICE_MAP: Dict[str, List[str]] = {
    "en": ["en-IN-Neural2-B", "en-IN-Neural2-A", "en-IN-Wavenet-B", "en-IN-Standard-B"],
    "hi": ["hi-IN-Neural2-A", "hi-IN-Neural2-D", "hi-IN-Wavenet-A", "hi-IN-Standard-A"],
    "bn": ["bn-IN-Neural2-A", "bn-IN-Wavenet-A", "bn-IN-Standard-A"],
    "ta": ["ta-IN-Neural2-A", "ta-IN-Wavenet-A", "ta-IN-Standard-A"],
    "te": ["te-IN-Standard-A", "te-IN-Standard-B"],
    "ml": ["ml-IN-Neural2-A", "ml-IN-Wavenet-A", "ml-IN-Standard-A"],
    "mr": ["mr-IN-Neural2-A", "mr-IN-Wavenet-A", "mr-IN-Standard-A"],
    "gu": ["gu-IN-Neural2-A", "gu-IN-Wavenet-A", "gu-IN-Standard-A"],
    "kn": ["kn-IN-Neural2-A", "kn-IN-Wavenet-A", "kn-IN-Standard-A"],
    "pa": ["pa-IN-Wavenet-A", "pa-IN-Standard-A"],
}

# ── Edge-TTS High-Expressiveness Indian Neural Voice Mapping ───────────────────
EDGE_TTS_VOICE_MAP: Dict[str, str] = {
    "en": "en-IN-NeerjaNeural",
    "hi": "hi-IN-SwaraNeural",
    "bn": "bn-IN-TanishaaNeural",
    "mr": "mr-IN-AarohiNeural",
    "ta": "ta-IN-PallaviNeural",
    "te": "te-IN-ShrutiNeural",
    "ml": "ml-IN-SobhanaNeural",
    "kn": "kn-IN-SapnaNeural",
    "gu": "gu-IN-DhwaniNeural",
    "ur": "ur-IN-GulNeural",
    "pa": "hi-IN-MadhurNeural",  # High-quality Hindi neural fallback for Punjabi
}

# ── Localized Advisory Greetings ──────────────────────────────────────────────
ADVISORY_GREETINGS: Dict[str, str] = {
    "en": "Here is your advisory. ",
    "hi": "यहाँ आपकी सलाह है। ",
    "bn": "এখানে আপনার পরামর্শ দেওয়া হলো। ",
    "mr": "येथे तुमचा सल्ला आहे। ",
    "ta": "இதோ உங்கள் ஆலோசனை. ",
    "te": "ఇదిగో మీ సలహా. ",
    "pa": "ਇਹ ਤੁਹਾਡੀ ਸਲਾਹ ਹੈ। ",
    "gu": "અહીં તમારી સલાહ છે. ",
    "kn": "ಇಲ್ಲಿ ನಿಮ್ಮ ಸಲಹೆ ಇದೆ. ",
    "ml": "ഇതാ നിങ്ങളുടെ ഉപദേശം. ",
    "or": "ଏଠାରେ ଆପଣଙ୍କ ପରାମର୍ଶ ରହିଛି। ",
    "as": "ইয়াত আপোনাৰ পৰামৰ্শ দিয়া হৈছে। ",
    "ur": "یہ آپ کے لیے مشورہ ہے۔ ",
}


# ── Text Cleaning & Normalization (100% Clean Spoken Text, Zero SSML) ──────────

def _prepare_clean_spoken_text(markdown_text: str, language: str = "en") -> str:
    """
    Strips ALL XML/SSML tags, Markdown formatting, emojis, and artifacts.
    Produces clean, natural spoken sentences starting with 'Here is your advisory.'
    (localized to the active language). Zero XML tags are output.
    """
    lang_key = language.lower().strip() if language else "en"
    if lang_key not in ADVISORY_GREETINGS:
        lang_key = "en"
    greeting = ADVISORY_GREETINGS[lang_key]

    if not markdown_text or not markdown_text.strip():
        return greeting.strip()

    text = markdown_text

    # 1. Strip any existing XML/HTML tags completely
    text = re.sub(r"<[^>]+>", " ", text)

    # 2. Convert / strip Markdown tables into natural spoken phrases
    table_lines = text.splitlines()
    converted_lines: List[str] = []
    for line in table_lines:
        sline = line.strip()
        # Skip table divider rows (|---| or |:---|---:|)
        if sline.startswith("|") and sline.endswith("|") and re.match(r"^\|[\s\-:|]+\|$", sline):
            continue
        # Table content row (| Col1 | Col2 | ...)
        if sline.startswith("|") and sline.endswith("|"):
            cells = [c.strip() for c in sline.strip("|").split("|") if c.strip()]
            if cells:
                if len(cells) >= 2:
                    converted_lines.append(f"{cells[0]}: {', '.join(cells[1:])}.")
                else:
                    converted_lines.append(f"{cells[0]}.")
            continue
        converted_lines.append(line)
    text = "\n".join(converted_lines)

    # 3. Strip Markdown headings (###, ##, #)
    text = re.sub(r"^\s*#+\s*", "", text, flags=re.MULTILINE)

    # 4. Strip emojis, currency symbols (convert ₹ to Rs), and visual icons
    text = re.sub(r"₹\s*(\d+)", r"Rs \1", text)
    text = text.replace("₹", "Rs ")
    emoji_re = re.compile(
        "[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\ufe0f🛑🌿🧪⚠️👉🌾📱🚶■▶⏹⏳🛡️💰]",
        flags=re.UNICODE,
    )
    text = emoji_re.sub("", text)

    # 5. Strip Markdown bold, italic, code, underline, dividers, and table pipes
    text = re.sub(r"\*\*([^*]+)\*\*", r"\1", text)
    text = re.sub(r"\*([^*]+)\*", r"\1", text)
    text = re.sub(r"`([^`]+)`", r"\1", text)
    text = re.sub(r"__([^_]+)__", r"\1", text)
    text = re.sub(r"_([^_]+)_", r"\1", text)
    text = re.sub(r"~~([^~]+)~~", r"\1", text)
    text = re.sub(r"^\s*[-=_]{3,}\s*$", "", text, flags=re.MULTILINE)
    text = text.replace("|", " ")

    # 6. Strip bullet prefixes and numbered list prefixes
    text = re.sub(r"^\s*[-*•]\s*", "", text, flags=re.MULTILINE)
    text = re.sub(r"^\s*\d+\.\s*", "", text, flags=re.MULTILINE)

    # 7. Strip URLs and keep markdown link text
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"https?://\S+", "", text)

    # 8. Spoken phonetics for units and acronyms (English)
    if lang_key == "en":
        text = re.sub(r"\b15\s*[Ll]\b", "15-liter", text)
        text = re.sub(r"\b(\d+)\s*[Ll]\b", r"\1-liter", text)
        text = re.sub(r"\bg/[Ll]\b", "grams per liter", text)
        text = re.sub(r"\bml/[Ll]\b", "milliliters per liter", text)
        text = re.sub(r"\bkg/ha\b", "kilograms per hectare", text)
        text = re.sub(r"\bWP\b", "W P", text)
        text = re.sub(r"\bEC\b", "E C", text)
        text = re.sub(r"\bSC\b", "S C", text)
        text = re.sub(r"\bSP\b", "S P", text)
        text = re.sub(r"\bSL\b", "S L", text)
        text = re.sub(r"\bPHI\b", "pre-harvest interval", text)
        text = re.sub(r"\b1800-180-1551\b", "1800 180 1551", text)
        text = re.sub(r"\bKVK\b", "K V K", text)

    # 9. Strip any residual XML/HTML characters and unescape entities
    text = re.sub(r"<[^>]+>", " ", text)
    text = text.replace("<", " ").replace(">", " ").replace("&amp;", "and").replace("&lt;", "").replace("&gt;", "")
    text = html.unescape(text)

    # 10. Replace newlines with natural periods for natural breathing pauses
    lines = [line.strip() for line in text.splitlines() if line.strip()]
    formatted_lines: List[str] = []
    for line in lines:
        if not line.endswith((".", "!", "?", "।", ":", ";")):
            line += "."
        formatted_lines.append(line)

    body_text = " ".join(formatted_lines)
    body_text = re.sub(r"\s+", " ", body_text).strip()

    if not body_text:
        return greeting.strip()

    # Avoid duplicate greeting if text already starts with it
    if body_text.startswith(greeting.strip()):
        return body_text

    return f"{greeting}{body_text}".strip()


# Backwards-compatible aliases for existing tests / modules
def _clean_markdown_text(text: str, language: str = "en") -> str:
    return _prepare_clean_spoken_text(text, language=language)

def _prepare_spoken_script(markdown_text: str, language: str = "en") -> str:
    return _prepare_clean_spoken_text(markdown_text, language=language)

def _prepare_spoken_plain_text(markdown_text: str, language: str = "en") -> str:
    return _prepare_clean_spoken_text(markdown_text, language=language)

def split_script_into_chunks(spoken_text: str, max_chunk_chars: int = 350) -> List[str]:
    clean = _prepare_clean_spoken_text(spoken_text)
    return [clean]


# ── Step 2: Google Cloud Text-to-Speech (Neural2 / WaveNet) ───────────────────

def synthesize_with_google_cloud(
    clean_text: str,
    lang: str = "en",
    voice_name: Optional[str] = None,
) -> bytes:
    """
    Synthesize speech using Google Cloud TTS with Neural2 or WaveNet voices.
    Uses clean plain text without SSML markup.
    """
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if not credentials_path or not os.path.exists(credentials_path):
        raise RuntimeError(
            "Google Cloud credentials not configured. "
            "Set GOOGLE_APPLICATION_CREDENTIALS in .env to enable Google Cloud TTS."
        )

    try:
        from google.cloud import texttospeech

        client = texttospeech.TextToSpeechClient()
        synthesis_input = texttospeech.SynthesisInput(text=clean_text)

        lang_key = lang.lower() if lang.lower() in GCLOUD_VOICE_MAP else "en"
        voice_list = GCLOUD_VOICE_MAP[lang_key]
        selected_voice = voice_name or voice_list[0]

        voice_params = texttospeech.VoiceSelectionParams(
            language_code=f"{lang_key}-IN",
            name=selected_voice,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=0.95,
            pitch=0.0,
            volume_gain_db=2.0,
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice_params,
            audio_config=audio_config,
        )

        logger.info(
            f"Google Cloud TTS synthesized speech for [{lang_key}] "
            f"→ {len(response.audio_content)} bytes MP3 (voice: {selected_voice})"
        )
        return response.audio_content

    except Exception as exc:
        logger.warning(f"Google Cloud TTS failed: {exc}")
        raise RuntimeError(f"Google Cloud TTS failed: {exc}") from exc


# ── Step 3: Zero-Cost Expressive Fallback (edge-tts / OpenAI / gTTS) ───────────

async def _synthesize_with_edge_tts(clean_text: str, lang: str = "en") -> bytes:
    """
    Synthesizes expressive audio using Edge-TTS with regional Indian neural voices.
    Uses 100% clean plain text (zero XML/SSML tags).
    """
    import edge_tts

    lang_key = lang.lower() if lang.lower() in EDGE_TTS_VOICE_MAP else "en"
    voice_name = EDGE_TTS_VOICE_MAP[lang_key]

    communicate = edge_tts.Communicate(
        text=clean_text,
        voice=voice_name,
    )

    chunks: List[bytes] = []
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.append(chunk["data"])

    audio_bytes = b"".join(chunks)
    if not audio_bytes:
        raise RuntimeError("Edge-TTS produced 0 audio bytes")

    logger.info(
        f"Edge-TTS synthesized expressive audio for [{lang_key}] "
        f"using {voice_name} → {len(audio_bytes)} bytes MP3"
    )
    return audio_bytes


def _synthesize_with_openai_tts(plain_text: str) -> bytes:
    """
    Synthesizes expressive audio using OpenAI's tts-1 model.
    """
    if not settings.openai_api_key or not settings.openai_api_key.startswith("sk-"):
        raise ValueError("No valid OpenAI API key configured")

    from openai import OpenAI

    client = OpenAI(api_key=settings.openai_api_key)
    response = client.audio.speech.create(
        model="tts-1",
        voice="nova",
        input=plain_text[:4096],
    )
    audio_content = response.content
    logger.info(f"OpenAI TTS synthesized {len(plain_text)} chars → {len(audio_content)} bytes MP3")
    return audio_content


async def _generate_fallback_audio(markdown_text: str, lang: str = "en") -> bytes:
    """
    Multi-tier zero-cost expressive fallback engine:
    1. OpenAI TTS (if API key available).
    2. Edge-TTS (high-expressiveness Indian neural voices, zero cost).
    3. gTTS (standard fallback).
    4. Demo silence audio.
    """
    clean_text = _prepare_clean_spoken_text(markdown_text, language=lang)

    # 1. Try OpenAI TTS if configured
    if settings.openai_api_key and settings.openai_api_key.startswith("sk-"):
        try:
            return _synthesize_with_openai_tts(clean_text)
        except Exception as exc:
            logger.warning(f"OpenAI TTS synthesis failed, trying Edge-TTS: {exc}")

    # 2. Try Edge-TTS with regional Indian neural voices
    try:
        return await _synthesize_with_edge_tts(clean_text, lang=lang)
    except Exception as exc:
        logger.warning(f"Edge-TTS synthesis failed, falling back to gTTS: {exc}")

    # 3. Fall back to gTTS
    try:
        return synthesize_with_gtts(clean_text, lang=lang)
    except Exception as exc:
        logger.warning(f"gTTS synthesis failed, returning demo audio: {exc}")

    # 4. Ultimate fallback: demo silence bytes
    return synthesize_demo_audio()


# ── Main Entry Points ─────────────────────────────────────────────────────────

async def synthesize_advisory_audio(markdown_text: str, lang: str = "en") -> bytes:
    """
    Main asynchronous speech synthesis entry point for agricultural advisories.
    Converts markdown advisory to expressive spoken narration.
    """
    clean_text = _prepare_clean_spoken_text(markdown_text, language=lang)

    # Attempt Google Cloud TTS if credentials are present
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if credentials_path and os.path.exists(credentials_path):
        try:
            return synthesize_with_google_cloud(clean_text, lang=lang)
        except Exception as exc:
            logger.warning(f"Google Cloud TTS failed, falling back to neural audio: {exc}")

    # Fallback to Edge-TTS / OpenAI / gTTS
    return await _generate_fallback_audio(markdown_text, lang=lang)


def synthesize_advisory_audio_sync(markdown_text: str, lang: str = "en") -> bytes:
    """
    Synchronous wrapper for synthesize_advisory_audio, safe to call from sync functions
    or threads regardless of whether an asyncio event loop is currently active.
    """
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            with concurrent.futures.ThreadPoolExecutor(max_workers=1) as pool:
                return pool.submit(
                    asyncio.run,
                    synthesize_advisory_audio(markdown_text, lang=lang),
                ).result()
        return loop.run_until_complete(
            synthesize_advisory_audio(markdown_text, lang=lang)
        )
    except RuntimeError:
        return asyncio.run(synthesize_advisory_audio(markdown_text, lang=lang))


# ── Backwards-Compatibility Functions ─────────────────────────────────────────

def synthesize_malayalam_speech(text: str, voice_name: Optional[str] = None) -> bytes:
    """
    Legacy entry point: Synthesizes Malayalam advisory audio.
    """
    return synthesize_advisory_audio_sync(text, lang="ml")


def synthesize_with_gtts(text: str, lang: str = "ml") -> bytes:
    """
    Synthesize speech using gTTS (Google Translate TTS).
    Works with zero configuration or service account keys.
    """
    try:
        from gtts import gTTS

        clean_text = _clean_markdown_text(text, language=lang)[:600]
        gtts_lang = (
            lang.lower()
            if lang.lower() in ["ml", "hi", "en", "ta", "te", "kn", "mr", "bn", "gu", "pa"]
            else "en"
        )
        tts = gTTS(text=clean_text, lang=gtts_lang, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        audio_bytes = buf.getvalue()
        logger.info(
            f"gTTS synthesized {len(clean_text)} chars in [{gtts_lang}] → {len(audio_bytes)} bytes MP3"
        )
        return audio_bytes
    except Exception as exc:
        logger.warning(f"gTTS synthesis failed: {exc}, returning fallback silence")
        return synthesize_demo_audio()


def synthesize_demo_audio() -> bytes:
    """
    Returns a minimal valid MP3 silence byte sequence for demo mode.
    Used when no network connection or synthesis provider is available.
    """
    logger.warning("TTS returning demo fallback audio.")
    return bytes(
        [
            0xFF, 0xFB, 0x90, 0x00,  # MPEG sync + header
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00,
        ]
        * 50
    )
