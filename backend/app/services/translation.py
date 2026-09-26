"""
services/translation.py — Malayalam ↔ English translation.

Primary:  IndicTrans2 (ai4bharat/indictrans2-indic-en-1B)
Fallback: googletrans (dev only — triggers a WARNING log)

The model is loaded ONCE at module import time (not per-request).
Loading takes ~15–30 seconds on first run; subsequent calls are fast.
"""
import logging
import os
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
        use_flag = str(settings.USE_INDICTRANS2).lower()
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
# GOOGLETRANS FALLBACK
def is_predominantly_english(text: str) -> bool:
    """Check if text contains primarily English/ASCII characters."""
    alpha = [c for c in text if c.isalpha()]
    if not alpha:
        return True
    ascii_alpha = [c for c in alpha if ord(c) < 128]
    return (len(ascii_alpha) / len(alpha)) >= 0.7


# ─────────────────────────────────────────────────────────────────────────────
# GOOGLETRANS / DEEP-TRANSLATOR FALLBACK
# ─────────────────────────────────────────────────────────────────────────────

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
    If target is English, returns immediately (0ms, no network call).
    """
    text = text.strip()
    if not text:
        return text

    if tgt_lang == "en":
        return text

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


def translate_ml_to_en(text: str) -> str:
    """Translate Malayalam text to English."""
    return translate_to_en(text, src_lang="ml")


def translate_en_to_ml(text: str) -> str:
    """Translate English text to Malayalam."""
    return translate_en_to_lang(text, tgt_lang="ml")


def get_translation_backend() -> str:
    """Returns which translation backend is active (for health checks)."""
    return "indictrans2" if _use_indictrans else "googletrans_fallback"
