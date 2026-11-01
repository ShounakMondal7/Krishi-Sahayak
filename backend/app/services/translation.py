"""
services/translation.py — Malayalam ↔ English translation.

Primary:  IndicTrans2 (ai4bharat/indictrans2-indic-en-1B)
Fallback: googletrans / deep-translator (dev only — triggers a WARNING log)

The model is loaded ONCE at module import time (not per-request).
Loading takes ~15–30 seconds on first run; subsequent calls are fast.
"""
import logging
import os
import re
import time
from typing import Optional

logger = logging.getLogger(__name__)

# ── IndicTrans2 module-level state ────────────────────────────────────────────
_indictrans_model = None
_indictrans_tokenizer = None
_use_indictrans = False
_init_error: Optional[str] = None

# ─────────────────────────────────────────────────────────────────────────────
# INITIALISATION (runs once at import)
# ─────────────────────────────────────────────────────────────────────────────

def _load_indictrans2() -> bool:
    """
    Attempt to load IndicTrans2. Returns True on success, False on failure.
    Memory requirement: ~5 GB RAM / ~2 GB VRAM.
    """
    global _indictrans_model, _indictrans_tokenizer, _use_indictrans

    try:
        from app.config import settings
        use_flag = str(getattr(settings, "use_indictrans2", False)).lower()
    except Exception:
        use_flag = os.getenv("USE_INDICTRANS2", "false").lower()

    if use_flag != "true":
        logger.info("USE_INDICTRANS2=false — IndicTrans2 disabled (using lightweight translation).")
        return False

    try:
        from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
        import torch

        model_name = "ai4bharat/indictrans2-indic-en-1B"
        logger.info(f"Loading IndicTrans2 model: {model_name} (this may take ~30s)…")
        t0 = time.time()

        _indictrans_tokenizer = AutoTokenizer.from_pretrained(
            model_name,
            trust_remote_code=True,
        )
        _indictrans_model = AutoModelForSeq2SeqLM.from_pretrained(
            model_name,
            trust_remote_code=True,
        )

        # Use GPU if available
        device = "cuda" if torch.cuda.is_available() else "cpu"
        _indictrans_model = _indictrans_model.to(device)
        _indictrans_model.eval()

        elapsed = time.time() - t0
        logger.info(f"✅ IndicTrans2 loaded on {device} in {elapsed:.1f}s")
        _use_indictrans = True
        return True

    except Exception as exc:
        logger.warning(
            f"⚠️  WARNING: Using googletrans fallback — IndicTrans2 not loaded. "
            f"Reason: {exc}"
        )
        return False


# Kick off loading at module import
_load_indictrans2()


# ─────────────────────────────────────────────────────────────────────────────
# INDICTRANS2 TRANSLATE HELPER
# ─────────────────────────────────────────────────────────────────────────────

def _translate_indictrans(
    text: str,
    src_lang: str,
    tgt_lang: str,
) -> str:
    """Translate using the loaded IndicTrans2 model."""
    import torch

    inputs = _indictrans_tokenizer(
        text,
        return_tensors="pt",
        padding=True,
        truncation=True,
        max_length=512,
        src_lang=src_lang,
    )

    device = next(_indictrans_model.parameters()).device
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        generated = _indictrans_model.generate(
            **inputs,
            num_beams=4,
            max_length=512,
            forced_bos_token_id=_indictrans_tokenizer.lang_code_to_id[tgt_lang],
        )

    decoded = _indictrans_tokenizer.batch_decode(
        generated,
        skip_special_tokens=True,
        clean_up_tokenization_spaces=True,
    )
    return decoded[0].strip()


# ─────────────────────────────────────────────────────────────────────────────
# GOOGLETRANS / DEEP-TRANSLATOR FALLBACK
# ─────────────────────────────────────────────────────────────────────────────

def is_predominantly_english(text: str) -> bool:
    """Check if text contains primarily English/ASCII characters."""
    alpha = [c for c in text if c.isalpha()]
    if not alpha:
        return True
    ascii_alpha = [c for c in alpha if ord(c) < 128]
    return (len(ascii_alpha) / len(alpha)) >= 0.7


def _translate_googletrans(text: str, src: str, dest: str) -> str:
    """Dev fallback translation. Uses deep-translator with fallback."""
    if src == dest or not text.strip():
        return text

    if dest == "en" and is_predominantly_english(text):
        return text

    # Try deep-translator first
    try:
        from deep_translator import GoogleTranslator
        translator = GoogleTranslator(source=src, target=dest)
        return translator.translate(text)
    except Exception as dt_exc:
        logger.debug(f"deep-translator failed: {dt_exc}, attempting googletrans")

    try:
        from googletrans import Translator
        translator = Translator()
        result = translator.translate(text, src=src, dest=dest)
        return result.text
    except Exception as exc:
        logger.warning(f"Translation fallback failed: {exc}. Returning original text.")
        return text


# ─────────────────────────────────────────────────────────────────────────────
# STRUCTURE & UNIT INTEGRITY
# ─────────────────────────────────────────────────────────────────────────────

def _normalize_units(text: str) -> str:
    """Keep standard unit notations intact (15L, g/L, ml/L, 1800-180-1551)."""
    # Standardize 15-Liter pump notations
    text = re.sub(r"\b15\s*[-–]?\s*(?:liter|litre|l)\b", "15L", text, flags=re.IGNORECASE)
    # Standardize g/L, ml/L
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*g\s*/\s*l(?:iter|itre)?\b", r"\1 g/L", text, flags=re.IGNORECASE)
    text = re.sub(r"\b(\d+(?:\.\d+)?)\s*ml\s*/\s*l(?:iter|itre)?\b", r"\1 ml/L", text, flags=re.IGNORECASE)
    return text


def _translate_raw_chunk(text: str, tgt_lang: str) -> str:
    """Translate plain text chunk using active backend."""
    if _use_indictrans:
        tgt_map = {
            "ml": "mal_Mlym", "hi": "hin_Deva", "ta": "tam_Taml",
            "te": "tel_Telu", "kn": "kan_Knda", "bn": "ben_Beng",
            "mr": "mar_Deva", "gu": "guj_Gujr", "pa": "pan_Guru",
            "or": "ory_Orya", "as": "asm_Beng",
        }
        tgt_indic = tgt_map.get(tgt_lang, "mal_Mlym")
        return _translate_indictrans(text, src_lang="eng_Latn", tgt_lang=tgt_indic)
    else:
        return _translate_googletrans(text, src="en", dest=tgt_lang)


def translate_structured_advisory(text: str, tgt_lang: str) -> str:
    """
    Translates an agricultural advisory while preserving:
    1. Section delimiters (### 🛑 1., ### 🌿 2., ### 🧪 3., ### ⚠️ 4.)
    2. Bullet prefixes (- **)
    3. Standard unit notations (15L, g/L, ml/L, toll-free contact numbers)
    """
    if tgt_lang == "en" or not text.strip():
        return text

    # Header matching pattern covering emojis and section numbers
    header_pat = r"(###\s*[^#\n]*\d+\.[^\n]+)"
    parts = re.split(header_pat, text)
    if len(parts) <= 1:
        # Not a multi-section advisory, translate normally
        translated = _translate_raw_chunk(text, tgt_lang)
        return _normalize_units(translated)

    translated_blocks: list[str] = []
    current_header = ""

    for part in parts:
        part_str = part.strip()
        if not part_str:
            continue

        # If this part is a header, preserve the emoji, number, and markdown delimiter
        if re.match(r"^###\s*[^#\n]*\d+\.", part_str):
            header_match = re.match(r"^(###\s*[^#\n]*\d+\.\s*)(.*)$", part_str)
            if header_match:
                prefix = header_match.group(1)
                title = header_match.group(2).strip()
                translated_title = _translate_raw_chunk(title, tgt_lang) if title else ""
                current_header = f"{prefix}{translated_title}".strip()
            else:
                current_header = part_str
            translated_blocks.append(current_header)
            continue

        # Body of the section: parse line by line to protect bullet keys
        section_lines: list[str] = []
        for line in part.split("\n"):
            line_str = line.strip()
            if not line_str:
                continue

            bullet_match = re.match(r"^-\s*\*\*([^*]+)\*\*:\s*(.*)$", line_str)
            if bullet_match:
                key = bullet_match.group(1).strip()
                val = bullet_match.group(2).strip()
                translated_key = _translate_raw_chunk(key, tgt_lang)
                translated_val = _translate_raw_chunk(val, tgt_lang) if val else ""
                translated_val = _normalize_units(translated_val)
                section_lines.append(f"- **{translated_key}:** {translated_val}")
            else:
                translated_line = _translate_raw_chunk(line_str, tgt_lang)
                section_lines.append(_normalize_units(translated_line))

        if section_lines:
            translated_blocks.append("\n".join(section_lines))

    result = "\n\n".join(translated_blocks)
    return _normalize_units(result)


# ─────────────────────────────────────────────────────────────────────────────
# PUBLIC API
# ─────────────────────────────────────────────────────────────────────────────

def translate_to_en(text: str, src_lang: str = "auto") -> str:
    """
    Translate text from any supported Indian language to English.
    If text is already English, returns immediately (0ms, no network call).
    """
    text = text.strip()
    if not text:
        return text

    if is_predominantly_english(text) or src_lang == "en":
        return text

    if _use_indictrans:
        src_map = {
            "ml": "mal_Mlym", "hi": "hin_Deva", "ta": "tam_Taml",
            "te": "tel_Telu", "kn": "kan_Knda", "bn": "ben_Beng",
            "mr": "mar_Deva", "gu": "guj_Gujr", "pa": "pan_Guru",
            "or": "ory_Orya", "as": "asm_Beng",
        }
        src_indic = src_map.get(src_lang, "mal_Mlym")
        return _translate_indictrans(text, src_lang=src_indic, tgt_lang="eng_Latn")
    else:
        src = src_lang if src_lang != "auto" else "auto"
        return _translate_googletrans(text, src=src, dest="en")


def translate_en_to_lang(text: str, tgt_lang: str) -> str:
    """
    Translate English text to target Indian language.
    Preserves markdown section headers, bullet keys, and unit notations.
    """
    text = text.strip()
    if not text:
        return text

    if tgt_lang == "en":
        return text

    # Check if this text contains the 4-section advisory headers
    if "### 🛑" in text or "### 🌿" in text or "### 🧪" in text or "### ⚠️" in text or "### 1." in text:
        return translate_structured_advisory(text, tgt_lang)

    return _translate_raw_chunk(text, tgt_lang)


def translate_ml_to_en(text: str) -> str:
    """Translate Malayalam text to English."""
    return translate_to_en(text, src_lang="ml")


def translate_en_to_ml(text: str) -> str:
    """Translate English text to Malayalam."""
    return translate_en_to_lang(text, tgt_lang="ml")


def get_translation_backend() -> str:
    """Returns which translation backend is active (for health checks)."""
    return "indictrans2" if _use_indictrans else "googletrans_fallback"
