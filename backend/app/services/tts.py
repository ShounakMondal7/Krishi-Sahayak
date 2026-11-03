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

# ── Conversational Spoken Transitions by Language ────────────────────────────
TRANSITIONS: Dict[str, Dict[str, str]] = {
    "en": {
        "diagnosis": "Here is your crop advisory. Based on the symptoms described, ",
        "organic": "First, for low-cost organic management, ",
        "chemical": "For chemical control, use the following verified mixture, ",
        "safety": "Important precautions: Ensure you follow the waiting period before harvest and observe safety guidelines. ",
    },
    "hi": {
        "diagnosis": "यहाँ आपकी फसल सलाह है। बताए गए लक्षणों के आधार पर, ",
        "organic": "सबसे पहले, कम लागत वाले जैविक प्रबंधन के लिए, ",
        "chemical": "रासायनिक नियंत्रण के लिए, अनुशंसित मिश्रण का सावधानीपूर्वक उपयोग करें, ",
        "safety": "महत्वपूर्ण सावधानियाँ: छिड़काव के बाद सुरक्षा और तुड़ाई के समय का ध्यान रखें। ",
    },
    "ml": {
        "diagnosis": "ഇതാ നിങ്ങളുടെ വിള പരിപാലന ഉപദേശം. ലക്ഷണങ്ങളുടെ അടിസ്ഥാനത്തിൽ, ",
        "organic": "ആദ്യമായി, ചിലവ് കുറഞ്ഞ ജൈവ നിയന്ത്രണത്തിനായി, ",
        "chemical": "രാസ കീടനാശിനി പ്രയോഗത്തിന്, നിർദ്ദേശിച്ച അളവ് ശ്രദ്ധയോടെ ഉപയോഗിക്കുക, ",
        "safety": "പ്രധാന മുൻകരുതലുകൾ: വിളവെടുപ്പിന് മുമ്പുള്ള കാത്തിരിപ്പ് കാലാവധിയും സുരക്ഷയും പാലിക്കുക. ",
    },
    "bn": {
        "diagnosis": "এখানে আপনার ফসলের পরামর্শ দেওয়া হলো। বর্ণিত লক্ষণ অনুযায়ী, ",
        "organic": "প্রথমে, কম খরচে জৈব ব্যবস্থাপনার জন্য, ",
        "chemical": "রাসায়নিক নিয়ন্ত্রণের জন্য, অনুমোদিত মিশ্রণটি সাবধানে প্রয়োগ করুন, ",
        "safety": "গুরুত্বপূর্ণ সতর্কতা: ফসল তোলার আগে নির্দিষ্ট সময়সীমা এবং সুরক্ষা বিধি মেনে চলুন। ",
    },
    "mr": {
        "diagnosis": "येथे आपला पीक सल्ला दिला आहे. नमूद केलेल्या लक्षणांवरून, ",
        "organic": "सर्वप्रथम, कमी खर्चाच्या सेंद्रिय नियंत्रणासाठी, ",
        "chemical": "रासायनिक नियंत्रणासाठी, खालील प्रमाणित मिश्रण काळजीपूर्वक वापरा, ",
        "safety": "महत्त्वाच्या खबरदाऱ्या: काढणीपूर्वी प्रतीक्षा मुदत आणि सुरक्षेची काळजी घ्या. ",
    },
    "ta": {
        "diagnosis": "உங்கள் பயிர் பாதுகாப்பு ஆலோசனை இதோ. அறிகுறிகளின் அடிப்படையில், ",
        "organic": "முதலில், குறைந்த செலவிலான இயற்கை மேலாண்மைக்கு, ",
        "chemical": "இரசாயனக் கட்டுப்பாட்டிற்கு, பரிந்துரைக்கப்பட்ட மருந்தளவை கவனமாகப் பயன்படுத்தவும், ",
        "safety": "முக்கிய பாதுகாப்பு வழிமுறைகள்: அறுவடைக்கு முன் காத்திருப்பு காலம் மற்றும் பாதுகாப்பு விதிகளைப் பின்பற்றவும். ",
    },
    "te": {
        "diagnosis": "ఇది మీ పంట సంరక్షణ సలహా. కనిపించే లక్షణాల ఆధారంగా, ",
        "organic": "మొదటగా, తక్కువ ఖర్చుతో కూడిన సేంద్రీయ యాజమాన్యం కోసం, ",
        "chemical": "రసాయన నియంత్రణ కోసం, సిఫార్సు చేసిన మిశ్రమాన్ని జాగ్రత్తగా వాడండి, ",
        "safety": "ముఖ్యమైన జాగ్రత్తలు: పంట కోతకు ముందు వేచి ఉండే సమయాన్ని మరియు భద్రతా సూచనలను పాటించండి. ",
    },
    "kn": {
        "diagnosis": "ಇದು ನಿಮ್ಮ ಬೆಳೆ ಸಲಹೆ. ರೋಗಲಕ್ಷಣಗಳ ಆಧಾರದ ಮೇಲೆ, ",
        "organic": "ಮೊದಲನೆಯದಾಗಿ, ಕಡಿಮೆ ವೆಚ್ಚದ ಸಾವಯವ ನಿರ್ವಹಣೆಗಾಗಿ, ",
        "chemical": "ರಾಸಾಯನಿಕ ನಿಯಂತ್ರಣಕ್ಕಾಗಿ, ಶಿಫಾರಸು ಮಾಡಿದ ಪ್ರಮಾಣವನ್ನು ಜಾಗರೂಕತೆಯಿಂದ ಬಳಸಿ, ",
        "safety": "ಮುಖ್ಯ ಮುನ್ನೆಚ್ಚರಿಕೆಗಳು: ಕೊಯ್ಲಿನ ಮುನ್ನ ಕಾಯುವ ಅವಧಿ ಮತ್ತು ಸುರಕ್ಷತಾ ಕ್ರಮಗಳನ್ನು ಪಾಲಿಸಿ. ",
    },
    "gu": {
        "diagnosis": "અહીં તમારી પાક સલાહ છે. આપેલા લક્ષણોના આધારે, ",
        "organic": "સૌ પ્રથમ, ઓછા ખર્ચના જૈવિક વ્યવસ્થાપન માટે, ",
        "chemical": "રાસાયણિક નિયંત્રણ માટે, ભલામણ કરેલ માત્રાનો સાવધાનીપૂર્વક ઉપયોગ કરો, ",
        "safety": "મહત્વપૂર્ણ સાવચેતીઓ: પાક લણણી પહેલાંનો સમયગાળો અને સુરક્ષાના નિયમો પાળો. ",
    },
    "pa": {
        "diagnosis": "ਇਹ ਤੁਹਾਡੀ ਫ਼ਸਲ ਲਈ ਸਲਾਹ ਹੈ। ਦੱਸੇ ਗਏ ਲੱਛਣਾਂ ਦੇ ਆਧਾਰ ਤੇ, ",
        "organic": "ਪਹਿਲਾਂ, ਘੱਟ ਲਾਗਤ ਵਾਲੇ ਜੈਵਿਕ ਪ੍ਰਬੰਧਨ ਲਈ, ",
        "chemical": "ਕੈਮੀਕਲ ਨਿਯੰਤਰਣ ਲਈ, ਸਿਫ਼ਾਰਿਸ਼ ਕੀਤੀ ਮਾਤਰਾ ਦਾ ਧਿਆਨ ਨਾਲ ਛਿੜਕਾਅ ਕਰੋ, ",
        "safety": "ਜ਼ਰੂਰੀ ਸਾਵਧਾਨੀਆਂ: ਵਾਢੀ ਤੋਂ ਪਹਿਲਾਂ ਨਿਰਧਾਰਿਤ ਸਮਾਂ ਅਤੇ ਸੁਰੱਖਿਆ ਨਿਯਮਾਂ ਦਾ ਧਿਆਨ ਰੱਖੋ। ",
    },
}

_VOICE_PRIORITY = GCLOUD_VOICE_MAP["ml"]


# ── Text Cleaning & Normalization ─────────────────────────────────────────────

def _clean_markdown_text(text: str, language: str = "en") -> str:
    """
    Strips visual markdown artifacts, bullet markers, emojis, and normalizes
    agricultural terms and units for spoken clarity.
    """
    # 1. Strip emojis and visual icons
    emoji_re = re.compile(
        "[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf\ufe0f🛑🌿🧪⚠️👉🌾📱🚶■]",
        flags=re.UNICODE,
    )
    cleaned = emoji_re.sub("", text)

    # 2. Strip Markdown bold, italic, code, underline
    cleaned = re.sub(r"\*\*([^*]+)\*\*", r"\1", cleaned)
    cleaned = re.sub(r"\*([^*]+)\*", r"\1", cleaned)
    cleaned = re.sub(r"`([^`]+)`", r"\1", cleaned)
    cleaned = re.sub(r"__([^_]+)__", r"\1", cleaned)
    cleaned = re.sub(r"_([^_]+)_", r"\1", cleaned)

    # 3. Strip bullet prefixes (- , * , • )
    cleaned = re.sub(r"^\s*[-*•]\s*", "", cleaned, flags=re.MULTILINE)

    # 4. Spoken phonetics for units and acronyms (English)
    if language.lower() == "en":
        cleaned = re.sub(r"\b15\s*[Ll]\b", "15-liter", cleaned)
        cleaned = re.sub(r"\b(\d+)\s*[Ll]\b", r"\1-liter", cleaned)
        cleaned = re.sub(r"\bg/[Ll]\b", "grams per liter", cleaned)
        cleaned = re.sub(r"\bml/[Ll]\b", "milliliters per liter", cleaned)
        cleaned = re.sub(r"\bkg/ha\b", "kilograms per hectare", cleaned)
        cleaned = re.sub(r"\bWP\b", "W P", cleaned)
        cleaned = re.sub(r"\bEC\b", "E C", cleaned)
        cleaned = re.sub(r"\bSC\b", "S C", cleaned)
        cleaned = re.sub(r"\bSP\b", "S P", cleaned)
        cleaned = re.sub(r"\bSL\b", "S L", cleaned)
        cleaned = re.sub(r"\bPHI\b", "pre-harvest interval", cleaned)
        cleaned = re.sub(r"\b1800-180-1551\b", "1800 180 1551", cleaned)
        cleaned = re.sub(r"\bKVK\b", "K V K", cleaned)

    return cleaned.strip()


def _split_markdown_sections(text: str) -> List[tuple[str, str]]:
    """
    Splits text by markdown '###' headers into a list of (title, body) tuples.
    If no headers exist, returns [("", text)].
    """
    lines = text.strip().splitlines()
    sections: List[tuple[str, str]] = []
    current_title = ""
    current_body: List[str] = []

    for line in lines:
        stripped = line.strip()
        if stripped.startswith("###"):
            if current_title or current_body:
                sections.append((current_title, "\n".join(current_body).strip()))
            current_title = stripped.lstrip("#").strip()
            current_body = []
        else:
            current_body.append(line)

    if current_title or current_body:
        sections.append((current_title, "\n".join(current_body).strip()))

    return sections


def _classify_section(title: str, body: str) -> str:
    """Classifies a section into diagnosis, organic, chemical, or safety."""
    combined = f"{title} {body}".lower()
    if re.search(r"\b1\b|diagnos|लक्षण|നിർണ്ണയം|शनাক্তকরণ|निदान|रोग", combined):
        return "diagnosis"
    if re.search(r"\b2\b|organic|cultural|जैविक|ജൈവ|জৈব|सेंद्रिय|இயற்கை|సేంద్రీయ", combined):
        return "organic"
    if re.search(r"\b3\b|chemical|treatment|dosage|रासायनिक|രാസ|রাসায়নিক|இரசாயன|రసాయన", combined):
        return "chemical"
    if re.search(r"\b4\b|safety|precaution|harvest|सावधानी|മുൻകരുതൽ|সতর্কता|खबरदारी|பாதுகாப்பு|జాగ్రత్త", combined):
        return "safety"
    return "general"


def _insert_sentence_pauses(text: str) -> str:
    """
    Escapes XML characters and joins sentences with `<break time="250ms"/>`.
    """
    escaped = (
        text.replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
        .replace("'", "&apos;")
    )
    raw_sentences = re.split(r"(?<=[.!?।])\s+", escaped)
    sentences = [s.strip() for s in raw_sentences if s.strip()]
    if not sentences:
        return escaped
    return '<break time="250ms"/>'.join(sentences)


# ── Step 1: Pre-Process Markdown into SSML Script ─────────────────────────────

def _prepare_spoken_script(markdown_text: str, language: str = "en") -> str:
    """
    Pre-processes raw advisory markdown into an expressive, natural SSML script:
    1. Strips visual markdown, bullet symbols, and emojis.
    2. Injects conversational transitions for each section.
    3. Wraps sentences with 250ms breathing pauses and sections with 500ms absorption pauses.
    4. Sets prosody rate to 93% for clear outdoor comprehension.
    """
    lang_key = language.lower() if language.lower() in TRANSITIONS else "en"
    trans = TRANSITIONS[lang_key]

    raw_sections = _split_markdown_sections(markdown_text)
    spoken_sections: List[str] = []

    for title, body in raw_sections:
        cleaned_body = _clean_markdown_text(body, language=lang_key)
        if not cleaned_body:
            continue

        sec_type = _classify_section(title, body)
        prefix = trans.get(sec_type, "")

        body_lines = [line.strip() for line in cleaned_body.splitlines() if line.strip()]
        formatted_lines: List[str] = []
        for line in body_lines:
            if not line.endswith((".", "!", "?", "।")):
                line += "."
            formatted_lines.append(line)

        section_text = " ".join(formatted_lines)
        if prefix:
            section_text = f"{prefix.strip()} {section_text}"

        ssml_section = _insert_sentence_pauses(section_text)
        spoken_sections.append(ssml_section)

    if not spoken_sections:
        cleaned_all = _clean_markdown_text(markdown_text, language=lang_key)
        spoken_sections.append(_insert_sentence_pauses(cleaned_all))

    inner_ssml = '\n<break time="500ms"/>\n'.join(spoken_sections)
    return f'<speak>\n<prosody rate="93%" pitch="+0st">\n{inner_ssml}\n</prosody>\n</speak>'


def _prepare_spoken_plain_text(markdown_text: str, language: str = "en") -> str:
    """
    Generates clean, human-like conversational plain text (without XML tags)
    for synthesizers that do not support SSML (e.g. OpenAI TTS, gTTS).
    """
    ssml = _prepare_spoken_script(markdown_text, language=language)
    text = re.sub(r"</?speak>", "", ssml)
    text = re.sub(r"</?prosody[^>]*>", "", text)
    text = re.sub(r'<break\s+time="500ms"\s*/>', "\n\n", text)
    text = re.sub(r'<break\s+time="250ms"\s*/>', " ", text)
    text = (
        text.replace("&quot;", '"')
        .replace("&apos;", "'")
        .replace("&gt;", ">")
        .replace("&lt;", "<")
        .replace("&amp;", "&")
    )
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ── Step 2: Google Cloud Text-to-Speech (Neural2 / WaveNet) ───────────────────

def synthesize_with_google_cloud(
    ssml_script: str,
    lang: str = "en",
    voice_name: Optional[str] = None,
) -> bytes:
    """
    Synthesize speech using Google Cloud TTS with Neural2 or WaveNet voices.
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
        synthesis_input = texttospeech.SynthesisInput(ssml=ssml_script)

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

async def _synthesize_with_edge_tts(ssml_script: str, lang: str = "en") -> bytes:
    """
    Synthesizes expressive audio using Edge-TTS with regional Indian neural voices.
    """
    import edge_tts

    lang_key = lang.lower() if lang.lower() in EDGE_TTS_VOICE_MAP else "en"
    voice_name = EDGE_TTS_VOICE_MAP[lang_key]

    communicate = edge_tts.Communicate(
        text=ssml_script,
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
    plain_text = _prepare_spoken_plain_text(markdown_text, language=lang)
    ssml_script = _prepare_spoken_script(markdown_text, language=lang)

    # 1. Try OpenAI TTS if configured
    if settings.openai_api_key and settings.openai_api_key.startswith("sk-"):
        try:
            return _synthesize_with_openai_tts(plain_text)
        except Exception as exc:
            logger.warning(f"OpenAI TTS synthesis failed, trying Edge-TTS: {exc}")

    # 2. Try Edge-TTS with regional Indian neural voices
    try:
        return await _synthesize_with_edge_tts(ssml_script, lang=lang)
    except Exception as exc:
        logger.warning(f"Edge-TTS synthesis failed, falling back to gTTS: {exc}")

    # 3. Fall back to gTTS
    try:
        return synthesize_with_gtts(plain_text, lang=lang)
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
    ssml_script = _prepare_spoken_script(markdown_text, language=lang)

    # Attempt Google Cloud TTS if credentials are present
    credentials_path = os.getenv("GOOGLE_APPLICATION_CREDENTIALS", "")
    if credentials_path and os.path.exists(credentials_path):
        try:
            return synthesize_with_google_cloud(ssml_script, lang=lang)
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
