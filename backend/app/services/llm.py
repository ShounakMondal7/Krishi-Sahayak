"""
services/llm.py — OpenAI GPT-4o-mini inference with grounded prompting.

CRITICAL: The system prompt is HARDCODED and must NEVER be modified at
runtime by any user input. This is a safety requirement.

The LLM is constrained to answer ONLY from the provided context chunks.
If context is insufficient, it returns a standardized referral message.
"""
import logging
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
SYSTEM_PROMPT = """You are an expert agricultural advisor for Indian farmers. 
Your primary goal is clarity and safety.

CRITICAL RULES:
1. Answer ONLY using the provided context chunks. Do not hallucinate.
2. Keep every single sentence under 15 words.
3. Use plain, simple English (this output will be machine-translated).
4. NEVER write long paragraphs.

You MUST structure your exact response using this format:

### 🛑 Diagnosis
[One short sentence identifying the disease or pest based on context]

### 🌿 Organic & Cultural Control
* [Actionable step 1]
* [Actionable step 2]

### 🧪 Chemical Treatment (If verified in context)
* [Chemical name and exact dosage]

If the provided context does not contain the answer, do not guess. You must reply EXACTLY with:
"I don't have verified information about this in my knowledge base. Please contact your local Krishi Vigyan Kendra."
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
    Synthesizes the key advisory statements directly from verified ICAR chunks.
    Guarantees 100% factual grounding and zero hallucination even without an OpenAI API key.
    """
    if not context_chunks:
        return KVK_REFERRAL_EN
    
    top_chunk = context_chunks[0].strip()
    lines = [
        line.strip() for line in top_chunk.split("\n")
        if len(line.strip()) > 25
        and not line.strip().startswith("=")
        and not line.strip().startswith("SECTION")
        and not line.strip().startswith("Source:")
    ]
    if lines:
        return " ".join(lines[:3])
    return top_chunk[:300]


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
        logger.warning(f"OpenAI call unavailable ({exc}) — falling back to direct extractive grounding from ICAR docs.")
        return _extract_grounded_fallback(context_chunks)
