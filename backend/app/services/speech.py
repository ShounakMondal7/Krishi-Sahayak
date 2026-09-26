"""
services/speech.py — Google Cloud Speech-to-Text for Malayalam audio.

Transcribes Malayalam audio (ml-IN locale) from farmers using
their mobile devices. Supports WEBM_OPUS (web) and LINEAR16 (native).
"""
import logging
import os
from typing import Optional

logger = logging.getLogger(__name__)


def transcribe_malayalam_audio(
    audio_bytes: bytes,
    encoding: str = "WEBM_OPUS",
    sample_rate_hertz: int = 48000,
) -> str:
    """
    Transcribe Malayalam audio to text using Google Cloud Speech-to-Text.

    Args:
        audio_bytes: Raw audio file bytes from the uploaded file.
        encoding: Audio encoding format. "WEBM_OPUS" for web browsers,
                  "LINEAR16" for uncompressed WAV.
        sample_rate_hertz: Sample rate (48000 for WEBM_OPUS, 16000 for LINEAR16).

    Returns:
        Malayalam text string transcribed from the audio.

    Raises:
        RuntimeError: If the Google credentials are missing or STT fails.
    """
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if not credentials_path or not os.path.exists(credentials_path):
        raise RuntimeError(
            "Google Cloud credentials not found. "
            "Set GOOGLE_APPLICATION_CREDENTIALS in .env to the path of your "
            "service account JSON file."
        )

    try:
        from google.cloud import speech

        client = speech.SpeechClient()

        # Map encoding string to enum
        encoding_map = {
            "WEBM_OPUS": speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
            "LINEAR16": speech.RecognitionConfig.AudioEncoding.LINEAR16,
            "FLAC": speech.RecognitionConfig.AudioEncoding.FLAC,
            "MP3": speech.RecognitionConfig.AudioEncoding.MP3,
        }
        audio_encoding = encoding_map.get(
            encoding.upper(),
            speech.RecognitionConfig.AudioEncoding.WEBM_OPUS,
        )

        audio = speech.RecognitionAudio(content=audio_bytes)
        config = speech.RecognitionConfig(
            encoding=audio_encoding,
            sample_rate_hertz=sample_rate_hertz,
            language_code="ml-IN",
            # Enhanced model for better accuracy with rural accents
            model="latest_long",
            enable_automatic_punctuation=True,
            # Alternative transcriptions for robustness
            max_alternatives=1,
            # Agricultural context hints (improves accuracy for farming terms)
            speech_contexts=[
                speech.SpeechContext(
                    phrases=[
                        "നെൽ", "ഗോതമ്പ്", "പച്ചക്കറി", "കൃഷി",
                        "ചാഴി", "കുമിൾ", "രോഗം", "വളം", "കീടനാശിനി",
                        "ICAR", "KVK", "കൃഷി വിജ്ഞാന കേന്ദ്രം",
                    ]
                )
            ],
        )

        logger.info(f"Sending {len(audio_bytes)} bytes to Google STT (ml-IN)…")
        response = client.recognize(config=config, audio=audio)

        if not response.results:
            raise RuntimeError("No speech detected in the audio. Please speak clearly.")

        transcript = " ".join(
            result.alternatives[0].transcript
            for result in response.results
            if result.alternatives
        ).strip()

        logger.info(f"STT transcribed: '{transcript[:80]}…'")
        return transcript

    except Exception as exc:
        logger.error(f"Google STT error: {exc}")
        raise RuntimeError(f"Speech transcription failed: {exc}") from exc


def transcribe_demo_mode(audio_bytes: bytes) -> str:
    """
    Demo mode transcription — returns a sample Malayalam query.
    Used when Google credentials are unavailable (development/testing).
    """
    logger.warning(
        "⚠️  STT running in DEMO MODE — returning sample Malayalam query. "
        "Configure GOOGLE_APPLICATION_CREDENTIALS for real transcription."
    )
    # Sample query about rice brown planthopper
    return "നെൽ ചെടിയിൽ തവിട്ട് ചാഴി എങ്ങനെ നിയന്ത്രിക്കാം"
