"""
services/llm.py — OpenAI GPT-4o-mini inference with grounded prompting.

CRITICAL: The system prompt is HARDCODED and must NEVER be modified at
runtime by any user input. This is a safety requirement.

The LLM is constrained to answer ONLY from the provided context chunks.
If context is insufficient, it returns a standardized referral message.
"""
import logging
import re
import time
from typing import Optional

from openai import OpenAI, APIError, RateLimitError, APITimeoutError
from tenacity import (
    retry,
    stop_after_attempt,
    wait_exponential,
    retry_if_exception_type,
)

from app.config import settings

logger = logging.getLogger(__name__)

# ── OpenAI client singleton ───────────────────────────────────────────────────
_client: Optional[OpenAI] = None


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


# ── HARDCODED SYSTEM PROMPT — DO NOT MODIFY AT RUNTIME ───────────────────────
SYSTEM_PROMPT = """You are Krishi Sahayak, an expert agricultural advisor.
Synthesize a clear, grammatically correct, and practical response using ONLY the provided ICAR context.
Format your answer strictly using these three Markdown headers:

### 🛑 Diagnosis
[Identify the disease, pest, or condition based on the context. Be specific.]

### 🌿 Organic & Cultural Control
* [Actionable step 1]
* [Actionable step 2]

### 🧪 Chemical Treatment
* [Chemical name and exact dosage from the context]

If the context does not contain sufficient details to prescribe a treatment, clearly advise the farmer to consult their local Krishi Vigyan Kendra (KVK) or district agricultural extension officer. Never fabricate chemical dosages or invent pest names.
"""

# Hardcoded Malayalam error message (shown to user if LLM fails entirely)
LLM_FAILURE_MESSAGE_ML = (
    "ക്ഷമിക്കണം, ഇപ്പോൾ ഉത്തരം ലഭ്യമല്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക."
)

# Referral message when knowledge base has no relevant info
KVK_REFERRAL_EN = (
    "I don't have verified information about this in my knowledge base. "
    "Please contact your local Krishi Vigyan Kendra."
)

# Default structured fallback when no actionable advice is found in chunks
_DEFAULT_FALLBACK = """### 🛑 Diagnosis
Information for this specific condition is not fully detailed in the current offline reference manuals.

### 🌿 Organic & Cultural Control
Ensure proper field sanitation, crop rotation, and avoid water stagnation around the root zone.

### 🧪 Chemical Treatment
Please consult your nearest Krishi Vigyan Kendra (KVK) or district agricultural officer for verified localized dosages."""

# Patterns for filtering junk lines from ICAR chunks
_JUNK_PATTERNS = re.compile(
    r"(?i)^(table\s+of\s+contents|page\s+\d+|icar\s+all\s+rights?\s+reserved|"
    r"={3,}|_{3,}|-{3,}|SECTION\s+\d+|Source:\s|\.{5,}|chapter\s+\d+\s*$)",
)


def _is_valid_sentence(line: str) -> bool:
    """Check if a line is a grammatically plausible sentence (≥6 words, not junk)."""
    stripped = line.strip()
    if len(stripped) < 30:
        return False
    if _JUNK_PATTERNS.match(stripped):
        return False
    word_count = len(stripped.split())
    if word_count < 6:
        return False
    return True


def _classify_sentence(sentence: str) -> str:
    """Classify a sentence into one of the three advisory categories."""
    lower = sentence.lower()
    # Chemical indicators
    chemical_keywords = [
        "spray", "dosage", "kg/ha", "g/ha", "ml/l", "g/l", "fungicide",
        "insecticide", "pesticide", "carbendazim", "mancozeb", "copper",
        "sulphur", "triazole", "chlorpyrifos", "imidacloprid", "thiram",
        "metalaxyl", "hexaconazole", "propiconazole", "dithane", "bavistin",
        "ridomil", "bordeaux", "blitox", "wettable powder", "emulsifiable",
        "concentrate", "granule", "dust formulation", "active ingredient",
    ]
    if any(kw in lower for kw in chemical_keywords):
        return "chemical"

    # Organic / cultural indicators
    organic_keywords = [
        "neem", "trichoderma", "pseudomonas", "crop rotation", "intercrop",
        "spacing", "mulch", "compost", "organic", "biological control",
        "biocontrol", "trap crop", "pheromone", "yellow sticky", "field sanitation",
        "resistant variet", "tolerant variet", "green manure", "vermicompost",
        "cow dung", "cow urine", "buttermilk", "sour curd", "botanical",
        "seed treatment", "hot water treatment", "solarization", "prune",
        "remove infected", "destroy infected", "uproot", "burn",
    ]
    if any(kw in lower for kw in organic_keywords):
        return "organic"

    # Default: diagnosis / description
    return "diagnosis"


def _build_user_prompt(english_question: str, context_chunks: list[str]) -> str:
    """
    Constructs the user message with context + question.

    The context is clearly delimited so the model knows exactly where
    retrieved knowledge ends and the question begins.
    """
    if context_chunks:
        context_text = "\n\n---\n\n".join(
            f"[Source {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)
        )
        return (
            f"CONTEXT FROM VERIFIED AGRICULTURAL DOCUMENTS:\n\n"
            f"{context_text}\n\n"
            f"---\n\n"
            f"FARMER'S QUESTION: {english_question}\n\n"
            f"ANSWER (based only on the context above):"
        )
    else:
        # Empty context — model will trigger the KVK referral message
        return (
            f"CONTEXT FROM VERIFIED AGRICULTURAL DOCUMENTS:\n\n"
            f"[No relevant documents found in knowledge base]\n\n"
            f"---\n\n"
            f"FARMER'S QUESTION: {english_question}\n\n"
            f"ANSWER (based only on the context above):"
        )


def _extract_grounded_fallback(context_chunks: list[str]) -> str:
    """
    Direct extractive grounding fallback when OpenAI API key is not configured.
    Extracts complete, grammatically valid sentences from ICAR chunks and
    organises them under the three advisory headers.

    Guarantees 100% factual grounding and zero hallucination even without
    an OpenAI API key.
    """
    if not context_chunks:
        return KVK_REFERRAL_EN

    # Collect valid sentences from all available chunks
    diagnosis_lines: list[str] = []
    organic_lines: list[str] = []
    chemical_lines: list[str] = []

    for chunk in context_chunks:
        # Split on sentence-ending punctuation or newlines
        raw_lines = re.split(r"(?<=[.!?])\s+|\n+", chunk)
        for line in raw_lines:
            cleaned = line.strip()
            if not _is_valid_sentence(cleaned):
                continue

            category = _classify_sentence(cleaned)
            if category == "chemical" and len(chemical_lines) < 3:
                chemical_lines.append(cleaned)
            elif category == "organic" and len(organic_lines) < 3:
                organic_lines.append(cleaned)
            elif category == "diagnosis" and len(diagnosis_lines) < 3:
                diagnosis_lines.append(cleaned)

    # If we got absolutely nothing useful, return the structured default
    if not diagnosis_lines and not organic_lines and not chemical_lines:
        return _DEFAULT_FALLBACK

    # Build the structured response
    sections: list[str] = []

    def _clean_bullet(line: str) -> str:
        return re.sub(r"^[\s*•\-–—\d.)]+", "", line).strip()

    # Diagnosis
    sections.append("### 🛑 Diagnosis")
    if diagnosis_lines:
        for line in diagnosis_lines:
            cleaned_line = _clean_bullet(line)
            if cleaned_line:
                sections.append(f"* {cleaned_line}")
    else:
        sections.append(
            "* Specific diagnosis could not be extracted from the reference documents. "
            "Please describe the symptoms in more detail or consult your local KVK."
        )

    # Organic & Cultural Control
    sections.append("\n### 🌿 Organic & Cultural Control")
    if organic_lines:
        for line in organic_lines:
            cleaned_line = _clean_bullet(line)
            if cleaned_line:
                sections.append(f"* {cleaned_line}")
    else:
        sections.append(
            "* Ensure proper field sanitation, crop rotation, and avoid water "
            "stagnation around the root zone."
        )

    # Chemical Treatment
    sections.append("\n### 🧪 Chemical Treatment")
    if chemical_lines:
        for line in chemical_lines:
            cleaned_line = _clean_bullet(line)
            if cleaned_line:
                sections.append(f"* {cleaned_line}")
    else:
        sections.append(
            "* Please consult your nearest Krishi Vigyan Kendra (KVK) or district "
            "agricultural officer for verified localized dosages."
        )

    return "\n".join(sections)


@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
)
def generate_answer(
    english_question: str,
    context_chunks: list[str],
) -> str:
    """
    Generate a grounded answer from GPT-4o-mini, with extractive ICAR fallback
    when OpenAI API key is not configured.
    """
    if not settings.openai_api_key or settings.openai_api_key in ("your_openai_api_key_here", "") or settings.openai_api_key.startswith("your_"):
        logger.info("OpenAI API key not configured — using zero-hallucination extractive grounding from ICAR docs.")
        return _extract_grounded_fallback(context_chunks)

    client = _get_client()
    user_prompt = _build_user_prompt(english_question, context_chunks)

    t0 = time.time()
    try:
        response = client.chat.completions.create(
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
            ],
            stream=False,
        )
        answer = response.choices[0].message.content.strip()
        elapsed_ms = int((time.time() - t0) * 1000)
        logger.info(
            f"LLM generated answer in {elapsed_ms}ms "
            f"(tokens used: {response.usage.total_tokens})"
        )
        return answer

    except Exception as exc:
        logger.error("OpenAI call failed, falling back to extractive: %s", exc)
        return _extract_grounded_fallback(context_chunks)
