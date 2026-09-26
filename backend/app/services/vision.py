"""
services/vision.py — GPT-4o vision for crop image symptom description.

CRITICAL DESIGN CONSTRAINT:
  The vision model ONLY describes visible physical symptoms.
  It NEVER diagnoses, recommends treatment, or produces a final answer.
  The description is then fed into the existing RAG pipeline as the query,
  ensuring ALL answers are grounded in verified ICAR documents.

  This is the core differentiator from systems like Plantix:
  Plantix → image → classifier → answer (disconnected, no grounding)
  Krishi Sahayak → image → describe → RAG retrieve → grounded answer
"""
import base64
import logging
from typing import Optional

from openai import OpenAI

from app.config import settings

logger = logging.getLogger(__name__)

# ── Singleton client ──────────────────────────────────────────────────────────
_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


# ── HARDCODED vision prompt — never expose to user manipulation ───────────────
_VISION_SYSTEM_PROMPT = (
    "You are a visual symptom observer for agricultural field photos. "
    "Your ONLY job is to describe what you physically see on the plant in this image. "
    "Describe: leaf color changes, spots, lesions, wilting, yellowing, holes, "
    "pest presence, webbing, sticky residue, mold, or any abnormalities. "
    "Be precise and factual. Do NOT diagnose. Do NOT recommend any treatment. "
    "Do NOT name the disease. Just describe what is visually observable. "
    "Keep your description under 80 words."
)

_VISION_USER_PROMPT = (
    "Describe only the visible physical symptoms on the plant in this photograph."
)


def describe_crop_image(image_bytes: bytes, mime_type: str = "image/jpeg") -> str:
    """
    Use GPT-4o vision to extract a factual symptom description from a crop photo.

    Args:
        image_bytes: Raw bytes of the JPEG/PNG image (max 5 MB).
        mime_type: "image/jpeg" or "image/png"

    Returns:
        A plain-English symptom description string (no diagnosis, no treatment).
        This string becomes the RAG query that retrieves ICAR document chunks.

    Raises:
        RuntimeError: If vision API call fails.
    """
    if len(image_bytes) > 5 * 1024 * 1024:
        raise ValueError("Image too large — maximum allowed size is 5 MB.")

    client = _get_client()

    # Base64 encode for OpenAI vision API
    image_b64 = base64.b64encode(image_bytes).decode("utf-8")

    try:
        response = client.chat.completions.create(
            model="gpt-4o",  # gpt-4o has vision; gpt-4o-mini does NOT reliably
            temperature=0.1,  # Low temperature for factual description
            max_tokens=200,
            messages=[
                {"role": "system", "content": _VISION_SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{mime_type};base64,{image_b64}",
                                "detail": "high",
                            },
                        },
                        {"type": "text", "text": _VISION_USER_PROMPT},
                    ],
                },
            ],
        )
        description = response.choices[0].message.content.strip()
        logger.info(f"Vision description: '{description[:100]}…'")
        return description

    except Exception as exc:
        logger.error(f"Vision API failed: {exc}")
        raise RuntimeError(f"Image analysis failed: {exc}") from exc


def combine_image_and_text_query(
    symptom_description: str,
    farmer_question: Optional[str] = None,
) -> str:
    """
    Combine the vision-generated symptom description with an optional
    text question from the farmer into a single RAG query.

    The combined query is what gets embedded and searched in ChromaDB.
    """
    if farmer_question and farmer_question.strip():
        return (
            f"Plant showing these symptoms: {symptom_description}. "
            f"Farmer's question: {farmer_question.strip()}"
        )
    return f"Plant showing these symptoms: {symptom_description}. What is causing this and how to treat it?"
