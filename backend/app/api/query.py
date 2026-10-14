"""
api/query.py — Core RAG query endpoints (Enhanced).

POST /api/v1/query        — Text query (with weather/market/conversation context)
POST /api/v1/voice-query  — Audio query (multipart/form-data)
POST /api/v1/image-query  — Image + optional text query (GPT-4o vision → RAG)
GET  /api/v1/query/{id}/audio — Text-to-speech for a previous answer

The full RAG pipeline:
  1. Translate Malayalam → English       (IndicTrans2)
  2. [NEW] Detect weather/market intent, inject live data into context
  3. [NEW] Load conversation history for multi-turn grounding
  4. Retrieve context chunks              (ChromaDB)
  5. Generate grounded answer             (GPT-4o-mini)
  6. Translate English → Malayalam        (IndicTrans2)
  7. Log everything to PostgreSQL         (async)
  8. Return response with source labels
"""
import logging
import os
import time
import traceback
import asyncio
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, Response, Query, BackgroundTasks
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.models.query_log import QueryLog, ErrorLog
from app.schemas.query import (
    QueryRequest, QueryResponse, VoiceQueryResponse, ImageQueryResponse,
    TimingBreakdown, ErrorResponse, make_source_labels,
    sanitize_text_input, sanitize_region_input, sanitize_identifier,
)
from app.services import translation, rag, llm, speech, cache as cache_svc
from app.services import weather as weather_svc
from app.services import market as market_svc
from app.services.rate_limiter import rate_limit_query
from app.config import settings

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1", tags=["Query"])

# Hardcoded Malayalam error messages (never expose English server errors)
_ML_LLM_ERROR = "ക്ഷമിക്കണം, ഇപ്പോൾ ഉത്തരം ലഭ്യമല്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക."
_ML_TRANSLATION_ERROR = "വിവർത്തനം പരാജയപ്പെട്ടു. ദയവായി വീണ്ടും ശ്രമിക്കുക."
_ML_IMAGE_ERROR = "ചിത്രം വിശകലനം ചെയ്യാൻ കഴിഞ്ഞില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക."

# Multi-turn conversation cache: conversation_id → list of {"q": str, "a": str}
# TTL: 15 minutes, max 3 turns stored per conversation
_CONV_TTL = 15 * 60
_conv_store: dict[str, tuple[list, float]] = {}

# ── Pre-generated TTS audio cache ─────────────────────────────────────────────
# key = f"{query_id}:{lang}" → audio bytes
# TTL: 1 hour, evicts oldest when > 200 entries
_TTS_CACHE_TTL = 3600
_TTS_CACHE_MAX = 200
_tts_cache: dict[str, tuple[bytes, float]] = {}


def _tts_cache_get(query_id: int, lang: str) -> Optional[bytes]:
    """Retrieve pre-generated TTS audio from cache, or None if expired/missing."""
    key = f"{query_id}:{lang}"
    entry = _tts_cache.get(key)
    if entry:
        audio_bytes, ts = entry
        if time.monotonic() - ts < _TTS_CACHE_TTL:
            return audio_bytes
        del _tts_cache[key]
    return None


def _tts_cache_set(query_id: int, lang: str, audio_bytes: bytes) -> None:
    """Store pre-generated TTS audio in cache with eviction."""
    # Evict oldest entries if cache is full
    if len(_tts_cache) >= _TTS_CACHE_MAX:
        oldest_key = min(_tts_cache, key=lambda k: _tts_cache[k][1])
        del _tts_cache[oldest_key]
    _tts_cache[f"{query_id}:{lang}"] = (audio_bytes, time.monotonic())


def _pregenerate_tts(query_id: int, text: str, lang: str) -> None:
    """
    Background task: generate TTS audio and store in cache.
    Runs AFTER the JSON response has already been sent to the client.
    Any failure is silently logged — the client can still call the
    /query/{id}/audio endpoint which will generate on-demand as fallback.
    """
    try:
        from app.services.tts import synthesize_malayalam_speech, synthesize_with_gtts
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        if credentials_path and os.path.exists(credentials_path) and lang == "ml":
            audio_bytes = synthesize_malayalam_speech(text)
        else:
            audio_bytes = synthesize_with_gtts(text, lang=lang)
        _tts_cache_set(query_id, lang, audio_bytes)
        logger.info(f"TTS pre-generated for query {query_id} (lang: {lang}, {len(audio_bytes)} bytes)")
    except Exception as exc:
        logger.warning(f"Background TTS pre-generation failed for query {query_id}: {exc}")


def _get_conversation_history(conversation_id: Optional[str]) -> List[dict]:
    """Returns last 3 turns for a conversation_id, or empty list."""
    if not conversation_id:
        return []
    entry = _conv_store.get(conversation_id)
    if entry:
        history, ts = entry
        if time.monotonic() - ts < _CONV_TTL:
            return history
        del _conv_store[conversation_id]
    return []


def _save_conversation_turn(
    conversation_id: Optional[str],
    question_english: str,
    answer_english: str,
) -> None:
    """Append latest turn to conversation memory (max 3 turns)."""
    if not conversation_id:
        return
    history = _get_conversation_history(conversation_id)
    history.append({"q": question_english, "a": answer_english})
    # Keep only last 3 turns
    _conv_store[conversation_id] = (history[-3:], time.monotonic())


def _format_conversation_context(history: List[dict]) -> str:
    """Format prior turns as a preamble for the LLM context."""
    if not history:
        return ""
    lines = ["[CONVERSATION HISTORY — for context only, do not answer from memory alone]"]
    for i, turn in enumerate(history, 1):
        lines.append(f"Turn {i} — Farmer asked: {turn['q']}")
        lines.append(f"Turn {i} — Previous answer: {turn['a'][:200]}…" if len(turn['a']) > 200 else f"Turn {i} — Previous answer: {turn['a']}")
    return "\n".join(lines)


async def _log_error(
    db: AsyncSession,
    error_type: str,
    error_message: str,
    query_text: Optional[str] = None,
    region: Optional[str] = None,
    endpoint: Optional[str] = None,
) -> None:
    """Log an error server-side without exposing details to the user."""
    try:
        error_log = ErrorLog(
            error_type=error_type,
            error_message=error_message,
            stack_trace=traceback.format_exc(),
            endpoint=endpoint,
            query_text=query_text,
            region=region,
        )
        db.add(error_log)
        await db.commit()
    except Exception as log_exc:
        logger.error(f"Failed to write error log: {log_exc}")


async def _run_rag_pipeline(
    question_original: str,
    language: str,
    region: Optional[str],
    session_id: Optional[str],
    conversation_id: Optional[str],
    input_mode: str,
    db: AsyncSession,
    background_tasks: Optional[BackgroundTasks] = None,
    extra_context_chunks: Optional[List[str]] = None,
    image_description: Optional[str] = None,
    already_english: bool = False,
) -> QueryResponse:
    """
    Full RAG pipeline — shared between text, voice, and image query endpoints.

    New in this version:
    - Weather + market context auto-injected when query intent matches
    - Conversation history prepended for multi-turn grounding
    - RAG retrieval always runs fresh (no memory-only answers)
    - source_labels with human-readable names returned in response
    - already_english flag allows image/multimodal queries to skip redundant translation
    """
    t_total_start = time.time()
    timings: dict[str, int] = {}

    # ── Step 1: Translate Input → English (Bypassed if already English) ─────
    t0 = time.time()
    if already_english or language == "en" or translation.is_predominantly_english(question_original):
        question_english = question_original
        timings["translation_input_ms"] = 0
        logger.info(f"Query in English (mode={input_mode}): '{question_english[:50]}…'")
    else:
        try:
            question_english = translation.translate_to_en(question_original, src_lang=language)
        except Exception as exc:
            logger.warning(f"Translation to English failed, using raw query: {exc}")
            question_english = question_original
        timings["translation_input_ms"] = int((time.time() - t0) * 1000)
        logger.info(f"Processed: '{question_original[:50]}…' → '{question_english[:50]}…'")

    # ── Step 2: Check cache (skip for image queries — always fresh) ────────
    weather_used = False
    market_used = False

    if input_mode != "image":
        cached = cache_svc.query_cache.get(question_english, region)
        if cached:
            logger.info("Serving from cache.")
            return QueryResponse(
                answer=cached["answer"],
                answer_english=cached["answer_english"],
                sources=cached["sources"],
                source_labels=make_source_labels(cached["sources"]),
                response_time_ms=cached["response_time_ms"],
                from_cache=True,
                weather_context_used=cached.get("weather_context_used", False),
                market_context_used=cached.get("market_context_used", False),
                conversation_id=conversation_id,
                timing=cached.get("timing"),
            )

    # ── Step 3: Detect intent → fetch live data in parallel ───────────────
    live_context_chunks: List[str] = list(extra_context_chunks or [])
    weather_task = None
    market_task = None

    if region and weather_svc.is_weather_related(question_english):
        weather_task = asyncio.create_task(
            weather_svc.fetch_weather_advisory(region)
        )
    if market_svc.is_market_related(question_english):
        crop = market_svc.detect_crop_in_query(question_english)
        if crop and region:
            market_task = asyncio.create_task(
                market_svc.fetch_current_price(crop, region)
            )

    if weather_task:
        try:
            weather_data = await weather_task
            live_context_chunks.append(weather_svc.format_weather_context(weather_data))
            weather_used = True
            logger.info(f"Weather context injected for {region}")
        except Exception as exc:
            logger.warning(f"Weather fetch failed (non-fatal): {exc}")

    if market_task:
        try:
            price_data = await market_task
            live_context_chunks.append(market_svc.format_price_context(price_data))
            market_used = True
            logger.info(f"Market price context injected")
        except Exception as exc:
            logger.warning(f"Market fetch failed (non-fatal): {exc}")

    # ── Step 4: Load conversation history ─────────────────────────────────
    conv_history = _get_conversation_history(conversation_id)
    conv_context = _format_conversation_context(conv_history)

    # ── Step 5: Retrieve context from ChromaDB ─────────────────────────────
    t0 = time.time()
    chunks, sources, scores = rag.retrieve_context(
        english_query=question_english,
        top_k=settings.rag_top_k,
    )
    timings["retrieval_ms"] = int((time.time() - t0) * 1000)
    avg_score = round(sum(scores) / len(scores), 4) if scores else 0.0

    # Deduplicate source filenames while preserving order
    seen: set = set()
    unique_sources = [s for s in sources if not (s in seen or seen.add(s))]

    # Merge: conversation context + live data + RAG chunks
    # Order matters: conv history first (light context), then live data, then docs
    all_chunks = []
    if conv_context:
        all_chunks.append(conv_context)
    all_chunks.extend(live_context_chunks)
    all_chunks.extend(chunks)

    # ── Step 6: Generate English answer from LLM ───────────────────────────
    t0 = time.time()
    try:
        answer_english = llm.generate_answer(question_english, all_chunks)
    except RuntimeError as exc:
        await _log_error(
            db, "LLMError", str(exc),
            query_text=question_english, region=region,
            endpoint=input_mode,
        )
        raise HTTPException(
            status_code=503,
            detail={"error": "Service unavailable", "message": _ML_LLM_ERROR},
        )
    timings["llm_ms"] = int((time.time() - t0) * 1000)

    # ── Step 7: Localize English → Target Language ─────────────────────────
    t0 = time.time()
    if language == "en":
        answer_localized = answer_english
        timings["translation_output_ms"] = 0
    else:
        try:
            answer_localized = translation.translate_en_to_lang(answer_english, tgt_lang=language)
        except Exception as exc:
            logger.warning(f"Translation to {language} failed, returning English: {exc}")
            answer_localized = answer_english
        timings["translation_output_ms"] = int((time.time() - t0) * 1000)

    total_ms = int((time.time() - t_total_start) * 1000)

    # ── Step 8: Save conversation turn ────────────────────────────────────
    _save_conversation_turn(conversation_id, question_english, answer_english)

    # ── Step 9: Log to PostgreSQL ─────────────────────────────────────────
    query_id = None
    try:
        log_entry = QueryLog(
            question_original=question_original,
            question_english=question_english,
            answer_english=answer_english,
            answer_malayalam=answer_localized,
            sources=",".join(unique_sources),
            language=language,
            region=region,
            session_id=session_id,
            conversation_id=conversation_id,
            input_mode=input_mode,
            image_description=image_description,
            retrieval_score=avg_score,
            chunks_retrieved=len(chunks),
            from_cache=False,
            weather_injected=weather_used,
            market_injected=market_used,
            response_time_ms=total_ms,
            translation_time_ms=(
                timings.get("translation_input_ms", 0) +
                timings.get("translation_output_ms", 0)
            ),
            retrieval_time_ms=timings.get("retrieval_ms", 0),
            llm_time_ms=timings.get("llm_ms", 0),
        )
        db.add(log_entry)
        await db.commit()
        await db.refresh(log_entry)
        query_id = log_entry.id
    except Exception as exc:
        logger.error(f"Failed to write query log: {exc}")
        # Non-fatal — don't fail the user request over a logging error

    # ── Step 10: Build and cache response ─────────────────────────────────
    timing_obj = TimingBreakdown(
        translation_input_ms=timings.get("translation_input_ms"),
        retrieval_ms=timings.get("retrieval_ms"),
        llm_ms=timings.get("llm_ms"),
        translation_output_ms=timings.get("translation_output_ms"),
        total_ms=total_ms,
    )

    source_labels = make_source_labels(unique_sources, scores)

    response = QueryResponse(
        query_id=query_id,
        conversation_id=conversation_id,
        answer=answer_localized,
        answer_english=answer_english,
        sources=unique_sources,
        source_labels=source_labels,
        response_time_ms=total_ms,
        from_cache=False,
        weather_context_used=weather_used,
        market_context_used=market_used,
        timing=timing_obj,
    )

    # Cache plain-dict version (no Pydantic objects inside)
    if input_mode != "image":
        cache_svc.query_cache.set(
            question_english,
            {
                "answer": answer_localized,
                "answer_english": answer_english,
                "sources": unique_sources,
                "response_time_ms": total_ms,
                "weather_context_used": weather_used,
                "market_context_used": market_used,
                "timing": timing_obj.model_dump(),
            },
            region,
        )

    # ── Step 11: Schedule background TTS pre-generation ─────────────────────
    # The JSON response is returned IMMEDIATELY to the client.
    # TTS audio generates in the background so it's ready when the farmer
    # taps the speaker button a few seconds later.
    if background_tasks and query_id:
        tts_text = answer_localized if language != "en" else answer_english
        if tts_text:
            background_tasks.add_task(_pregenerate_tts, query_id, tts_text, language)
            logger.info(f"Scheduled background TTS for query {query_id} (lang: {language})")

    return response


# ── ENDPOINT: Text Query ───────────────────────────────────────────────────────

@router.post(
    "/query",
    response_model=QueryResponse,
    summary="Ask a farming question (text)",
    description=(
        "Submit a Malayalam farming question. Returns a grounded answer with "
        "source citations. Supports follow-up questions via conversation_id. "
        "Automatically injects live weather and market data when relevant."
    ),
    responses={
        422: {"model": ErrorResponse, "description": "Translation failed"},
        429: {"description": "Rate limit exceeded (max 30 queries per minute)"},
        503: {"model": ErrorResponse, "description": "LLM service unavailable"},
    },
)
async def text_query(
    request: QueryRequest,
    background_tasks: BackgroundTasks,
    _: None = Depends(rate_limit_query),
    db: AsyncSession = Depends(get_db),
) -> QueryResponse:
    return await _run_rag_pipeline(
        question_original=request.question,
        language=request.language,
        region=request.region,
        session_id=request.session_id,
        conversation_id=request.conversation_id,
        input_mode="text",
        db=db,
        background_tasks=background_tasks,
    )


# ── ENDPOINT: Voice Query ──────────────────────────────────────────────────────

@router.post(
    "/voice-query",
    response_model=VoiceQueryResponse,
    summary="Ask a farming question (voice)",
    description=(
        "Upload Malayalam audio. Transcribes via Google STT, shows the farmer "
        "the transcribed text, then runs the full RAG pipeline."
    ),
    responses={
        422: {"model": ErrorResponse, "description": "Translation or STT failed"},
        429: {"description": "Rate limit exceeded (max 30 queries per minute)"},
        503: {"model": ErrorResponse, "description": "LLM service unavailable"},
    },
)
async def voice_query(
    audio: UploadFile = File(..., description="Malayalam audio file (WEBM_OPUS recommended)"),
    encoding: str = Form(default="WEBM_OPUS", description="Audio encoding format"),
    region: Optional[str] = Form(default=None, description="Farmer's region"),
    session_id: Optional[str] = Form(default=None),
    conversation_id: Optional[str] = Form(default=None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _: None = Depends(rate_limit_query),
    db: AsyncSession = Depends(get_db),
) -> VoiceQueryResponse:

    audio_bytes = await audio.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio file uploaded.")

    logger.info(f"Received audio: {audio.filename} ({len(audio_bytes)} bytes, {encoding})")

    # Transcribe audio
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if not credentials_path or not os.path.exists(credentials_path):
        transcribed_text = speech.transcribe_demo_mode(audio_bytes)
    else:
        try:
            transcribed_text = speech.transcribe_malayalam_audio(audio_bytes, encoding=encoding)
        except RuntimeError as exc:
            await _log_error(
                db, "STTError", str(exc),
                endpoint="voice-query",
                region=region,
            )
            raise HTTPException(
                status_code=422,
                detail={"error": "Speech transcription failed", "detail": str(exc)},
            )

    # Sanitize inputs (CERT-In / OWASP)
    try:
        region = sanitize_region_input(region)
        session_id = sanitize_identifier(session_id, "session_id")
        conversation_id = sanitize_identifier(conversation_id, "conversation_id")
    except ValueError as val_err:
        raise HTTPException(
            status_code=422,
            detail={"error": "Invalid input", "detail": str(val_err)},
        )

    text_response = await _run_rag_pipeline(
        question_original=transcribed_text,
        language="ml",
        region=region,
        session_id=session_id,
        conversation_id=conversation_id,
        input_mode="voice",
        db=db,
        background_tasks=background_tasks,
    )

    return VoiceQueryResponse(
        **text_response.model_dump(),
        transcribed_text=transcribed_text,
    )


# ── ENDPOINT: Image Query ──────────────────────────────────────────────────────

@router.post(
    "/image-query",
    response_model=ImageQueryResponse,
    summary="Ask a farming question using a crop photo",
    description=(
        "Upload a crop photo (JPEG/PNG, max 5MB). GPT-4o vision describes the visible "
        "symptoms WITHOUT diagnosing — that description then feeds the standard RAG "
        "pipeline so all answers remain grounded in ICAR documents. "
        "Optionally add a text question alongside the photo."
    ),
    responses={
        400: {"model": ErrorResponse, "description": "Invalid image"},
        422: {"model": ErrorResponse, "description": "Vision or translation failed"},
        429: {"description": "Rate limit exceeded (max 30 queries per minute)"},
        503: {"model": ErrorResponse, "description": "LLM service unavailable"},
    },
)
async def image_query(
    image: UploadFile = File(..., description="Crop photo — JPEG or PNG, max 5MB"),
    question: Optional[str] = Form(default=None, description="Optional text question"),
    language: str = Form(default="en"),
    region: Optional[str] = Form(default=None),
    session_id: Optional[str] = Form(default=None),
    conversation_id: Optional[str] = Form(default=None),
    background_tasks: BackgroundTasks = BackgroundTasks(),
    _: None = Depends(rate_limit_query),
    db: AsyncSession = Depends(get_db),
) -> ImageQueryResponse:

    # Read and validate image
    image_bytes = await image.read()
    if not image_bytes:
        raise HTTPException(status_code=400, detail="Empty image file.")
    if len(image_bytes) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="Image too large — max 5 MB.")

    content_type = image.content_type or "image/jpeg"
    if content_type not in ("image/jpeg", "image/png", "image/webp"):
        raise HTTPException(
            status_code=400,
            detail="Unsupported image format. Use JPEG, PNG, or WebP.",
        )

    # Step 1: Describe symptoms with GPT-4o vision (no diagnosis)
    try:
        from app.services.vision import describe_crop_image, combine_image_and_text_query
        symptom_description = describe_crop_image(image_bytes, mime_type=content_type)
    except RuntimeError as exc:
        await _log_error(db, "VisionError", str(exc), endpoint="image-query", region=region)
        raise HTTPException(
            status_code=422,
            detail={"error": "Image analysis failed", "message": _ML_IMAGE_ERROR},
        )

    logger.info(f"Vision description: '{symptom_description[:80]}…'")

    # Step 2: Sanitize inputs & translate farmer's optional text question
    farmer_question_english = None
    try:
        if question and question.strip():
            question = sanitize_text_input(question)
        region = sanitize_region_input(region)
        session_id = sanitize_identifier(session_id, "session_id")
        conversation_id = sanitize_identifier(conversation_id, "conversation_id")
    except ValueError as val_err:
        raise HTTPException(
            status_code=422,
            detail={"error": "Invalid input", "detail": str(val_err)},
        )

    if question and question.strip():
        try:
            farmer_question_english = translation.translate_ml_to_en(question.strip())
        except Exception:
            farmer_question_english = question.strip()  # Use as-is if translation fails

    # Step 3: Combine symptom description + optional question
    from app.services.vision import combine_image_and_text_query
    combined_english_query = combine_image_and_text_query(
        symptom_description, farmer_question_english
    )

    # Step 4: Run RAG pipeline with combined English query
    # We pass the combined query as an already-translated English string.
    # Skip the Malayalam→English translation step by passing it directly.
    rag_response = await _run_rag_pipeline(
        question_original=combined_english_query,   # Already in English
        language=language,
        region=region,
        session_id=session_id,
        conversation_id=conversation_id,
        input_mode="image",
        db=db,
        background_tasks=background_tasks,
        image_description=symptom_description,
        already_english=True,
    )

    return ImageQueryResponse(
        **rag_response.model_dump(),
        symptom_description=symptom_description,
    )


# ── ENDPOINT: Text-to-Speech for a previous answer ────────────────────────────

@router.get(
    "/query/{query_id}/audio",
    summary="Get spoken audio for a previous query answer",
    description=(
        "Generates Malayalam speech for a previous query's answer using "
        "Google Cloud TTS. Called on-demand only (not auto-generated) to save "
        "bandwidth on 2G connections. Returns MP3 audio bytes."
    ),
    responses={
        200: {"content": {"audio/mpeg": {}}, "description": "MP3 audio bytes"},
        404: {"description": "Query ID not found"},
        503: {"description": "TTS not configured or failed"},
    },
)
async def get_query_audio(
    query_id: int,
    lang: Optional[str] = Query(default=None, description="Target language code for audio (e.g. 'en', 'hi', 'ml', 'ta')"),
    db: AsyncSession = Depends(get_db),
) -> Response:

    # ── Fast path: serve from pre-generated TTS cache ─────────────────────
    target_lang_hint = (lang or "ml").strip().lower()
    cached_audio = _tts_cache_get(query_id, target_lang_hint)
    if cached_audio:
        logger.info(f"TTS cache HIT for query {query_id} (lang: {target_lang_hint})")
        return Response(
            content=cached_audio,
            media_type="audio/mpeg",
            headers={
                "Content-Disposition": f'inline; filename="answer_{query_id}_{target_lang_hint}.mp3"',
                "Cache-Control": "public, max-age=3600",
                "X-TTS-Source": "pre-generated",
            },
        )

    # ── Slow path: on-demand generation (fallback) ────────────────────────
    # Fetch the stored answer from DB
    result = await db.execute(
        select(QueryLog).where(QueryLog.id == query_id)
    )
    log_entry = result.scalar_one_or_none()

    if not log_entry:
        raise HTTPException(status_code=404, detail=f"Query ID {query_id} not found.")

    target_lang = (lang or log_entry.language or "ml").strip().lower()

    if target_lang == "en" and log_entry.answer_english:
        text_to_speak = log_entry.answer_english
    elif target_lang == (log_entry.language or "ml").strip().lower() and log_entry.answer_malayalam:
        text_to_speak = log_entry.answer_malayalam
    else:
        # If target language differs from original query log, localize English base if possible
        english_base = log_entry.answer_english or log_entry.answer_malayalam
        if english_base and target_lang != "en":
            try:
                from app.services import translation
                text_to_speak = translation.translate_en_to_lang(english_base, tgt_lang=target_lang)
            except Exception as exc:
                logger.warning(f"On-demand TTS translation to {target_lang} failed: {exc}")
                text_to_speak = log_entry.answer_malayalam or log_entry.answer_english
        else:
            text_to_speak = log_entry.answer_malayalam or log_entry.answer_english

    if not text_to_speak:
        raise HTTPException(status_code=404, detail="No answer text stored for this query.")

    # Generate TTS (on-demand fallback)
    try:
        from app.services.tts import synthesize_malayalam_speech, synthesize_with_gtts
        credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
        if credentials_path and os.path.exists(credentials_path) and target_lang == "ml":
            audio_bytes = synthesize_malayalam_speech(text_to_speak)
        else:
            logger.info(f"Generating spoken audio via gTTS for query {query_id} (lang: {target_lang})")
            audio_bytes = synthesize_with_gtts(text_to_speak, lang=target_lang)
    except RuntimeError as exc:
        raise HTTPException(
            status_code=503,
            detail=f"Text-to-speech failed: {exc}",
        )

    # Store in cache for future requests
    _tts_cache_set(query_id, target_lang, audio_bytes)

    return Response(
        content=audio_bytes,
        media_type="audio/mpeg",
        headers={
            "Content-Disposition": f'inline; filename="answer_{query_id}_{target_lang}.mp3"',
            "Cache-Control": "public, max-age=3600",
            "X-TTS-Source": "on-demand",
        },
    )
