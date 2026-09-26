"""
services/tts.py — Google Cloud Text-to-Speech for Malayalam audio output.

Converts Malayalam answer text to spoken audio (MP3).
Audio is generated ON DEMAND via /api/v1/query/{query_id}/audio — not automatically
for every query — to conserve bandwidth on 2G connections.

Uses Neural2 or WaveNet Malayalam voice if available, falls back to Standard.
"""
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)

# Malayalam voice priority list (best → fallback)
_VOICE_PRIORITY = [
    "ml-IN-Neural2-A",    # Neural2 — highest quality (check availability)
    "ml-IN-Wavenet-A",    # WaveNet — excellent quality
    "ml-IN-Wavenet-B",    # WaveNet — alternative
    "ml-IN-Standard-A",   # Standard — always available
    "ml-IN-Standard-B",   # Standard — fallback
]


def synthesize_malayalam_speech(text: str, voice_name: Optional[str] = None) -> bytes:
    """
    Convert Malayalam text to spoken audio using Google Cloud TTS.

    Args:
        text: Malayalam text to synthesize (the translated answer).
        voice_name: Optional specific voice to use. Defaults to best available.

    Returns:
        MP3 audio bytes ready to stream to the client.

    Raises:
        RuntimeError: If Google credentials are missing or TTS fails.
    """
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if not credentials_path or not os.path.exists(credentials_path):
        raise RuntimeError(
            "Google Cloud credentials not configured. "
            "Set GOOGLE_APPLICATION_CREDENTIALS in .env to enable text-to-speech."
        )

    try:
        from google.cloud import texttospeech

        client = texttospeech.TextToSpeechClient()

        # Synthesize the text
        synthesis_input = texttospeech.SynthesisInput(text=text)

        # Select voice — try priority list
        selected_voice = voice_name or _VOICE_PRIORITY[0]
        voice_params = texttospeech.VoiceSelectionParams(
            language_code="ml-IN",
            name=selected_voice,
        )

        audio_config = texttospeech.AudioConfig(
            audio_encoding=texttospeech.AudioEncoding.MP3,
            speaking_rate=0.9,   # Slightly slower for clarity
            pitch=0.0,
            volume_gain_db=2.0,  # Slightly louder for outdoor use
        )

        response = client.synthesize_speech(
            input=synthesis_input,
            voice=voice_params,
            audio_config=audio_config,
        )

        logger.info(
            f"TTS synthesized {len(text)} chars of Malayalam "
            f"→ {len(response.audio_content)} bytes MP3 (voice: {selected_voice})"
        )
        return response.audio_content

    except Exception as exc:
        # Try fallback voice if first choice fails
        if voice_name is None and _VOICE_PRIORITY[0] not in str(exc):
            logger.warning(f"TTS voice {_VOICE_PRIORITY[0]} failed, trying standard voice…")
            return synthesize_malayalam_speech(text, voice_name=_VOICE_PRIORITY[-1])
        logger.error(f"TTS synthesis failed: {exc}")
        raise RuntimeError(f"Text-to-speech synthesis failed: {exc}") from exc


def synthesize_with_gtts(text: str, lang: str = "ml") -> bytes:
    """
    Synthesize speech using gTTS (Google Translate TTS).
    Works with zero configuration or service account keys.
    Supports ml (Malayalam), hi (Hindi), en (English), ta, te, kn, mr, bn, gu, etc.
    """
    try:
        from gtts import gTTS
        import io

        # Clean text for spoken clarity: strip Markdown headers, bullets, and excessive symbols
        clean_text = text.replace("#", "").replace("*", "").replace("`", "").replace("■", "").strip()
        # Cap length to first 400 characters for snappy 2G playback
        clean_text = clean_text[:400]

        gtts_lang = lang.lower() if lang.lower() in ["ml", "hi", "en", "ta", "te", "kn", "mr", "bn", "gu", "pa"] else "en"
        tts = gTTS(text=clean_text, lang=gtts_lang, slow=False)
        buf = io.BytesIO()
        tts.write_to_fp(buf)
        audio_bytes = buf.getvalue()
        logger.info(f"gTTS synthesized {len(clean_text)} chars in [{gtts_lang}] → {len(audio_bytes)} bytes MP3")
        return audio_bytes
    except Exception as exc:
        logger.warning(f"gTTS synthesis failed: {exc}, returning fallback silence")
        return synthesize_demo_audio()


def synthesize_demo_audio() -> bytes:
    """
    Returns a minimal valid MP3 silence byte sequence for demo mode.
    Used when neither Google credentials nor gTTS are available.
    """
    logger.warning("TTS returning demo fallback audio.")
    return bytes([
        0xFF, 0xFB, 0x90, 0x00,  # MPEG sync + header
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
        0x00, 0x00, 0x00, 0x00,
    ] * 50)  # Repeat for ~2 second silent audio

