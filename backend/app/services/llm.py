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
from typing import Optional, Union

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


# ── HARDCODED SYSTEM PROMPTS — DO NOT MODIFY AT RUNTIME ───────────────────────
SYSTEM_PROMPT = """You are Krishi Sahayak (कृषि सहायक), an expert agricultural advisory officer grounded strictly in official ICAR (Indian Council of Agricultural Research) recommendations.

Your advice will be read or listened to by Indian farmers in the field. 
Keep language clear, practical, respectful, and free of unnecessary academic jargon.
Never invent chemical brand names, active ingredients, or unverified dosages.

Format your response strictly using these four standardized Markdown sections:

### 🛑 1. Field Diagnosis
- **Identified Issue:** [Name of disease / pest / nutrient deficiency & affected crop]
- **Key Visual Signs:** [2 quick bullet points describing what the farmer can observe on leaves, stems, or fruits]

### 🌿 2. Immediate & Organic Action (Low-Cost)
- **Field Sanitation:** [Pruning, water management, spacing, or removing infected plants]
- **Organic Treatment:** [Neem oil, bio-fungicides (Trichoderma/Pseudomonas), cow urine/buttermilk spray, or sticky traps with clear preparation guidance]

### 🧪 3. Chemical Treatment & Exact Dosage
- **Recommended Chemical:** [Standard approved chemical name and formulation, e.g., Mancozeb 75% WP or Chlorantraniliprole 18.5% SC]
- **Dosage per 15-Liter Pump:** [Crucial: Provide dosage per standard 15L knapsack backpack sprayer (e.g., 30g per 15L tank) AND per liter of water (e.g., 2g / liter)]
- **Spray Timing & Conditions:** [Morning before 10 AM or late afternoon after 4 PM; do not spray if rain or strong wind is forecast]
*(If verified chemical dosage is not in the ICAR text, write: "No verified chemical spray registered in reference data. Use organic measures or consult your local KVK.")*

### ⚠️ 4. Safety & Harvest Precaution
- **Waiting Period (PHI):** [Number of days to wait between spraying and harvesting/consumption]
- **Safety Gear:** [Wear face covering/cloth, rubber gloves, and avoid smoking/eating while spraying]
- **Extension Contact:** [Remind farmer to consult their nearest Krishi Vigyan Kendra (KVK) or Kisan Call Centre (1800-180-1551) for district-level confirmation]
"""

MARKET_SYSTEM_PROMPT = """You are Krishi Sahayak Market & Mandi Advisory Officer.
Answer the farmer's market rate and pricing question with practical, localized trade data.
Never mention disease diagnosis, pests, fungal infections, or chemical sprays when answering market pricing questions.

Format your response strictly using these four Markdown sections:

### 📊 1. Market & Commodity Status
- **Crop & Mandi:** [Crop name and nearest active APMC market based on district, e.g., Dadri / Gautam Buddha Nagar Mandi or Agra Mandi]
- **Market Mechanism:** [Clarify whether this crop trades under open APMC Mandi wholesale auction or has a Central Government MSP]

### 💰 2. Current Estimated Mandi Rates
- **Modal Wholesale Price:** [Estimated benchmark price per Quintal, e.g., ₹1,400 - ₹1,800 per Quintal (100 kg)]
- **Approximate Farmgate/Retail Price:** [Estimated rate in ₹ per kg, e.g., ₹14 - ₹18 per kg wholesale, ₹22 - ₹28 per kg retail]
- **Grade-Wise Variation:** [Grade A (super quality), Grade B (medium), and Grade C (seed/small tubers)]

### 🚛 3. Selling Advice & Storage Guidelines
- **Best Selling Practices:** [Cleaning, sorting, sorting diseased tubers, grading before bringing to mandi]
- **Cold Storage / Holding Advice:** [Current cold storage recommendation, bag packing standards (50 kg mesh bags)]

### 🏛️ 4. Official Market Gateways & Support
- **e-NAM Portal:** Mention that live real-time auction prices can be tracked at enam.gov.in.
- **Kisan Call Centre:** Remind the farmer to dial toll-free 1800-180-1551 for daily localized modal prices.
"""

# Hardcoded Malayalam error message (shown to user if LLM fails entirely)
LLM_FAILURE_MESSAGE_ML = (
    "ക്ഷമിക്കണം, ഇപ്പോൾ ഉത്തരം ലഭ്യമല്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക."
)

# Referral message when knowledge base has no relevant info
KVK_REFERRAL_EN = (
    "I don't have verified information about this in my knowledge base. "
    "Please contact your nearest Krishi Vigyan Kendra (KVK) or call Kisan Call Centre at 1800-180-1551."
)

# Standardized 4-section fallback when offline or no specific advice in chunks
_DEFAULT_FALLBACK = """### 🛑 1. Field Diagnosis
- **Identified Issue:** Crop health condition requiring localized diagnosis.
- **Key Visual Signs:** Inspect foliage for discoloured lesions, wilted vascular tissue, or pest nymph activity.

### 🌿 2. Immediate & Organic Action (Low-Cost)
- **Field Sanitation:** Prune heavily infested foliage, clear weed hosts along borders, and avoid standing water at root zones.
- **Organic Treatment:** Spray 5% Neem Seed Kernel Extract (NSKE) or Neem oil 3000 ppm @ 5 ml per liter of water as an eco-friendly barrier.

### 🧪 3. Chemical Treatment & Exact Dosage
- **Recommended Chemical:** No verified chemical spray registered in current offline reference data. Use organic measures or consult your local KVK.
- **Dosage per 15-Liter Pump:** Do not guess dosages. Consult your local extension office for verified localized guidance.
- **Spray Timing & Conditions:** Apply sprays strictly before 10:00 AM or after 4:00 PM in calm weather without rain forecast.

### ⚠️ 4. Safety & Harvest Precaution
- **Waiting Period (PHI):** Observe minimum 7 to 14 days waiting period before harvesting.
- **Safety Gear:** Always wear a cloth face mask and protective gloves when applying agricultural treatments.
- **Extension Contact:** Consult your nearest Krishi Vigyan Kendra (KVK) or call Kisan Call Centre (1800-180-1551)."""

# Patterns for filtering junk lines from ICAR chunks
_JUNK_PATTERNS = re.compile(
    r"(?i)^(table\s+of\s+contents|page\s+\d+|icar\s+all\s+rights?\s+reserved|"
    r"={3,}|_{3,}|-{3,}|SECTION\s+\d+|Source:\s|\.{5,}|chapter\s+\d+\s*$)",
)

# Regex category matchers with word boundaries
_SAFETY_RE = re.compile(
    r"\b(?:phi|pre-harvest|preharvest|waiting\s+period|safety|gloves|mask|calm\s+weather)\b",
    re.IGNORECASE,
)
_SANITATION_RE = re.compile(
    r"\b(?:cultural(?:\s+control)?|prune|pruning|sanitation|spacing|airflow|drain|drainage|crop\s+rotation|intercrop|uproot|destroy|fallen|overhead)\b",
    re.IGNORECASE,
)
_ORGANIC_RE = re.compile(
    r"\b(?:neem|trichoderma|pseudomonas|bio-|organic|trap|cow\s+dung|cow\s+urine|buttermilk|sticky|pheromone)\b",
    re.IGNORECASE,
)
_DOSAGE_RE = re.compile(
    r"\b(?:g/l|ml/l|g/litre|ml/litre|kg/ha|per\s+liter|per\s+litre|15-liter|pump|dosage)\b",
    re.IGNORECASE,
)
_CHEM_RE = re.compile(
    r"\b(?:chemical(?:\s+control)?|spray|fungicide|insecticide|pesticide|mancozeb|carbendazim|metalaxyl|copper|chlorpyrifos|imidacloprid|tricyclazole|hexaconazole|propiconazole|thiram|dithane|bavistin|ridomil|blitox|wp|sc|ec|sl|wg)\b",
    re.IGNORECASE,
)
_DIAG_RE = re.compile(
    r"\b(?:caused\s+by|symptom|symptoms|lesion|lesions|spot|spots|wilt|blight|rot|mildew|rust|blast|hopper|borer|leaf|leaves|stem|fruit|fruits|damage)\b",
    re.IGNORECASE,
)


def _is_valid_sentence(line: str) -> bool:
    """Check if a line is a grammatically plausible sentence (≥4 words, not junk)."""
    stripped = line.strip()
    if len(stripped) < 18:
        return False
    if _JUNK_PATTERNS.match(stripped):
        return False
    word_count = len(stripped.split())
    if word_count < 4:
        return False
    return True


def _clean_bullet(line: str) -> str:
    """Remove existing markdown bullets, dashes, or numbered prefixes."""
    return re.sub(r"^[\s*•\-–—\d.)]+", "", line).strip()


def _clean_label_prefixes(text: str) -> str:
    """Remove common header label prefixes like 'Cultural control:', 'Chemical control:', 'Safety:'."""
    return re.sub(
        r"^(?:cultural\s+control|chemical\s+control|biological\s+control|management|safety|identification|symptoms)\s*:\s*",
        "",
        text,
        flags=re.IGNORECASE,
    ).strip()


def _extract_15l_pump_dosage(text: str) -> Optional[str]:
    """
    Examines text for dosages like '2.5 g per liter' or '2 ml/l' and calculates
    the equivalent 15-Liter knapsack pump dosage if not already stated.
    """
    # If the text already specifies 15-liter or pump dosage, extract that portion
    parenthetical_15l = re.search(r"\(([^)]*15-liter[^)]*)\)", text, re.IGNORECASE)
    if parenthetical_15l:
        pump_part = parenthetical_15l.group(1).strip()
        # Find per liter part if also present
        per_l_match = re.search(r"@?\s*(\d+(?:\.\d+)?\s*(?:g|ml|gm)\s*(?:per|\/)\s*(?:l|liter|litre)(?:\s+of\s+water)?)", text, re.IGNORECASE)
        if per_l_match:
            per_l_clean = per_l_match.group(1).strip()
            return f"{pump_part} ({per_l_clean})"
        return pump_part

    if "15-liter" in text.lower() or "15l" in text.lower():
        return text

    # Look for e.g. '2.5 g per liter' or '2 ml/l'
    match = re.search(r"(\d+(?:\.\d+)?)\s*(g|ml|gm|gram|grams)\s*(?:per|\/)\s*(?:l|liter|litre)", text, re.IGNORECASE)
    if match:
        amount_per_liter = float(match.group(1))
        unit = match.group(2).lower()
        pump_amount = amount_per_liter * 15
        pump_str = f"{pump_amount:g}{'g' if 'g' in unit else 'ml'}"
        return f"{pump_str} per 15-liter knapsack pump ({amount_per_liter:g} {unit}/L of water)"

    return None


def _extract_chemical_name(text: str) -> str:
    """Extract standard chemical name and formulation (e.g., Metalaxyl + Mancozeb 72 WP)."""
    cleaned = _clean_label_prefixes(text)
    # Match pattern like 'Metalaxyl + Mancozeb 72 WP' or 'Chlorantraniliprole 18.5% SC'
    match = re.search(
        r"(?:Spray\s+)?([A-Za-z0-9\s\+\-–/]+\s+(?:\d+(?:\.\d+)?\s*%?\s*(?:WP|SC|EC|SL|WG|FS|SP|GR)))",
        cleaned,
        re.IGNORECASE,
    )
    if match:
        name = match.group(1).strip()
        name = re.sub(r"^(?:Spray\s+|Apply\s+)", "", name, flags=re.IGNORECASE)
        return name
    return cleaned


def _extract_grounded_fallback(context_chunks: list[str]) -> str:
    """
    Direct extractive grounding fallback when OpenAI API key is not configured.
    Synthesizes sentences from ICAR documents strictly into the 4 standardized field sections:
      ### 🛑 1. Field Diagnosis
      ### 🌿 2. Immediate & Organic Action (Low-Cost)
      ### 🧪 3. Chemical Treatment & Exact Dosage
      ### ⚠️ 4. Safety & Harvest Precaution
    """
    if not context_chunks:
        return KVK_REFERRAL_EN

    diag_lines: list[str] = []
    sanitation_lines: list[str] = []
    organic_lines: list[str] = []
    chemical_lines: list[str] = []
    dosage_lines: list[str] = []
    safety_lines: list[str] = []

    for chunk in context_chunks:
        # Skip conversation history preamble chunk so previous turns do not contaminate new diagnoses/dosages
        if chunk.startswith("[CONVERSATION HISTORY"):
            continue
        raw_lines = re.split(r"(?<=[.!?])\s+|\n+", chunk)
        for line in raw_lines:
            cleaned = _clean_bullet(line.strip())
            if not _is_valid_sentence(cleaned):
                continue

            # Prioritize Safety / PHI
            if _SAFETY_RE.search(cleaned):
                if len(safety_lines) < 2:
                    safety_lines.append(cleaned)

            # Sanitation & Cultural control
            elif _SANITATION_RE.search(cleaned) and not _CHEM_RE.search(cleaned):
                if len(sanitation_lines) < 2:
                    sanitation_lines.append(cleaned)

            # Organic Treatments
            elif _ORGANIC_RE.search(cleaned) and not _CHEM_RE.search(cleaned):
                if len(organic_lines) < 2:
                    organic_lines.append(cleaned)

            # Chemical & Dosage
            elif _CHEM_RE.search(cleaned):
                if _DOSAGE_RE.search(cleaned):
                    if len(dosage_lines) < 2:
                        dosage_lines.append(cleaned)
                elif len(chemical_lines) < 2:
                    chemical_lines.append(cleaned)

            # Diagnosis & Visual Signs
            elif _DIAG_RE.search(cleaned):
                if len(diag_lines) < 3:
                    diag_lines.append(cleaned)

    # If no useful information was gathered from chunks, return standard structured default
    if not any([diag_lines, sanitation_lines, organic_lines, chemical_lines, dosage_lines, safety_lines]):
        return _DEFAULT_FALLBACK

    sections: list[str] = []

    # 🛑 1. Field Diagnosis
    sections.append("### 🛑 1. Field Diagnosis")
    if diag_lines:
        issue_name = _clean_label_prefixes(diag_lines[0])
        signs = [_clean_label_prefixes(s) for s in diag_lines[1:3]]
        sections.append(f"- **Identified Issue:** {issue_name}")
        if signs:
            sections.append(f"- **Key Visual Signs:** {' '.join(signs)}")
        else:
            sections.append("- **Key Visual Signs:** Inspect foliage for characteristic lesions, wilting, or insect nymph activity.")
    else:
        sections.append("- **Identified Issue:** Crop condition requiring localized diagnosis.")
        sections.append("- **Key Visual Signs:** Inspect foliage for discoloured lesions, vascular wilting, or pest activity.")

    # 🌿 2. Immediate & Organic Action (Low-Cost)
    sections.append("\n### 🌿 2. Immediate & Organic Action (Low-Cost)")
    if sanitation_lines:
        clean_sanitation = " ".join(_clean_label_prefixes(s) for s in sanitation_lines)
        sections.append(f"- **Field Sanitation:** {clean_sanitation}")
    else:
        sections.append("- **Field Sanitation:** Remove and destroy severely infected plant debris; avoid water stagnation around root zones.")

    if organic_lines:
        clean_organic = " ".join(_clean_label_prefixes(o) for o in organic_lines)
        sections.append(f"- **Organic Treatment:** {clean_organic}")
    else:
        sections.append("- **Organic Treatment:** Spray 5% Neem Seed Kernel Extract (NSKE) or Neem oil 3000 ppm @ 5 ml per liter of water.")

    # 🧪 3. Chemical Treatment & Exact Dosage
    sections.append("\n### 🧪 3. Chemical Treatment & Exact Dosage")
    if chemical_lines or dosage_lines:
        chem_source = chemical_lines[0] if chemical_lines else dosage_lines[0]
        chem_name = _extract_chemical_name(chem_source)
        sections.append(f"- **Recommended Chemical:** {chem_name}")

        # Compute or extract 15L pump dosage
        if dosage_lines:
            dosage_text = dosage_lines[0]
            calculated_pump = _extract_15l_pump_dosage(dosage_text)
            if calculated_pump:
                sections.append(f"- **Dosage per 15-Liter Pump:** {calculated_pump}")
            else:
                clean_dosage = _clean_label_prefixes(dosage_text)
                sections.append(f"- **Dosage per 15-Liter Pump:** {clean_dosage}")
        else:
            sections.append("- **Dosage per 15-Liter Pump:** Consult package label or local KVK for exact 15-liter knapsack pump dilution.")

        sections.append("- **Spray Timing & Conditions:** Morning before 10 AM or late afternoon after 4 PM; do not spray if rain or strong wind is forecast.")
    else:
        sections.append("- **Recommended Chemical:** No verified chemical spray registered in reference data. Use organic measures or consult your local KVK.")
        sections.append("- **Dosage per 15-Liter Pump:** Do not guess dosages. Consult your nearest KVK.")
        sections.append("- **Spray Timing & Conditions:** Morning before 10 AM or late afternoon after 4 PM in calm weather.")

    # ⚠️ 4. Safety & Harvest Precaution
    sections.append("\n### ⚠️ 4. Safety & Harvest Precaution")
    if safety_lines:
        clean_safety = " ".join(_clean_label_prefixes(s) for s in safety_lines)
        sections.append(f"- **Waiting Period (PHI):** {clean_safety}")
    else:
        sections.append("- **Waiting Period (PHI):** Maintain at least 7 to 14 days waiting period between spray and crop harvest.")

    sections.append("- **Safety Gear:** Wear face mask/cloth covering, protective rubber gloves, and wash thoroughly after spraying.")
    sections.append("- **Extension Contact:** Consult your nearest Krishi Vigyan Kendra (KVK) or call Kisan Call Centre (1800-180-1551) for district confirmation.")

    return "\n".join(sections)


def _extract_market_fallback(english_question: str, context_chunks: list[str]) -> str:
    """
    Extractive / pattern-based market fallback when OpenAI API key is not configured.
    Synthesizes localized market rates into the 4 standardized market sections:
      ### 📊 1. Market & Commodity Status
      ### 💰 2. Current Estimated Mandi Rates
      ### 🚛 3. Selling Advice & Storage Guidelines
      ### 🏛️ 4. Official Market Gateways & Support
    """
    full_context = "\n".join(context_chunks or [])
    q_lower = english_question.lower()
    ctx_lower = full_context.lower()

    from app.services.market import extract_crop_from_query, get_market_price

    # 1. Identify Crop dynamically (word-boundary safe, greedy match)
    detected = extract_crop_from_query(english_question) or extract_crop_from_query(full_context)

    # 2. Identify Mandi / Market
    mandi_name = "Dadri Mandi (Gautam Buddha Nagar) / Regional APMC"
    mandi_match = re.search(r"Market\s*(?:\/\s*Region)?:\s*([^\n]+)", full_context, re.IGNORECASE)
    if mandi_match:
        mandi_name = mandi_match.group(1).strip()
    elif "gautam" in q_lower or "dadri" in q_lower or "noida" in q_lower:
        mandi_name = "Dadri Mandi (Gautam Buddha Nagar) / Noida APMC"
    elif "agra" in q_lower or "agra" in ctx_lower:
        mandi_name = "Agra APMC Mandi"
    elif "delhi" in q_lower or "azadpur" in q_lower:
        mandi_name = "Azadpur Mandi (Delhi)"

    # 3. Retrieve benchmark data for detected crop (never defaults to potato)
    benchmark = get_market_price(detected, mandi_name) if detected else None

    if benchmark:
        crop_name = benchmark.get("crop", detected.title())
        mechanism = benchmark.get("mechanism", "Open APMC Mandi Wholesale Auction")
        price_qtl = benchmark.get("price_per_quintal", 0)
        range_qtl = benchmark.get("price_range_per_quintal", "")
        if price_qtl > 0:
            modal_price_str = f"₹{price_qtl:,.0f} per Quintal ({range_qtl})"
        else:
            modal_price_str = range_qtl or "Refer to daily Mandi e-NAM bulletin"
        approx_rates = f"{benchmark.get('rate_per_kg_wholesale', 'Variable')} wholesale, {benchmark.get('rate_per_kg_retail', 'Variable')} retail"
        grade_str = benchmark.get("grade_criteria", "Grade A (super quality), Grade B (medium), Grade C (small/lower grade)")
        best_selling = benchmark.get("selling_advice", "Clean, grade, and pack produce in breathable crates or leno bags.")
        storage_advice = benchmark.get("storage_advice", "Store in clean, ventilated godowns or cold storage.")
    else:
        crop_match = re.search(r"Crop:\s*([^\n]+)", full_context, re.IGNORECASE)
        crop_name = crop_match.group(1).strip() if crop_match else "Agricultural Commodity"
        mechanism = "Open APMC Mandi wholesale auction (Daily Mandi Spot Trading)"
        modal_price_str = "Refer to daily APMC Mandi e-NAM auction bulletin"
        approx_rates = "Variable based on daily arrivals and grade"
        grade_str = "Grade A (uniform size, undamaged, high dry matter), Grade B (standard commercial grade), Grade C (undersized/blemished)"
        best_selling = "Clean soil clods, remove damaged produce, and sort into uniform size grades before transport to fetch top modal prices."
        storage_advice = "Hold in designated APMC warehouse or cold storage based on crop perishability to avoid distress selling."

    # 4. Context overrides if specific fields were provided in RAG chunks
    range_match = re.search(
        r"(?:range\s+(?:is\s+)?from\s+|Wholesale\s+Benchmark\s+Range:\s*)(₹?\s*[\d,]+\s*(?:-|to)\s*₹?\s*[\d,]+(?:\s*(?:per|\/)\s*quintal)?)",
        full_context,
        re.IGNORECASE,
    )
    if range_match:
        raw_range = range_match.group(1).strip()
        modal_price_str = f"{raw_range} (100 kg)"

    wh_match = re.search(r"Approx Wholesale Rate per kg:\s*([^\n]+)", full_context, re.IGNORECASE)
    rt_match = re.search(r"Approx Retail Rate per kg:\s*([^\n]+)", full_context, re.IGNORECASE)
    if wh_match and rt_match:
        approx_rates = f"{wh_match.group(1).strip()} wholesale, {rt_match.group(1).strip()} retail"

    grade_match = re.search(r"Grade-Wise Criteria:\s*([^\n]+)", full_context, re.IGNORECASE)
    if grade_match:
        grade_str = grade_match.group(1).strip()

    sell_match = re.search(r"Selling Advice:\s*([^\n]+)", full_context, re.IGNORECASE)
    if sell_match:
        best_selling = sell_match.group(1).strip()

    stor_match = re.search(r"Storage Guidelines:\s*([^\n]+)", full_context, re.IGNORECASE)
    if stor_match:
        storage_advice = stor_match.group(1).strip()

    sections = [
        "### 📊 1. Market & Commodity Status",
        f"- **Crop & Mandi:** {crop_name} — {mandi_name}",
        f"- **Market Mechanism:** {mechanism}",
        "\n### 💰 2. Current Estimated Mandi Rates",
        f"- **Modal Wholesale Price:** {modal_price_str}",
        f"- **Approximate Farmgate/Retail Price:** {approx_rates}",
        f"- **Grade-Wise Variation:** {grade_str}",
        "\n### 🚛 3. Selling Advice & Storage Guidelines",
        f"- **Best Selling Practices:** {best_selling}",
        f"- **Cold Storage / Holding Advice:** {storage_advice}",
        "\n### 🏛️ 4. Official Market Gateways & Support",
        "- **e-NAM Portal:** Live real-time auction prices can be tracked at enam.gov.in.",
        "- **Kisan Call Centre:** Remind the farmer to dial toll-free 1800-180-1551 for daily localized modal prices.",
    ]
    return "\n".join(sections)


def _build_user_prompt(
    english_question: str,
    context_chunks: list[str],
    intent: Optional[str] = None,
) -> str:
    """
    Constructs the user message with context + question.
    """
    if intent == "MARKET_PRICE":
        format_instr = "the 4-section Market Pricing format (### 📊 1. Market & Commodity Status, ### 💰 2. Current Estimated Mandi Rates, ### 🚛 3. Selling Advice & Storage Guidelines, ### 🏛️ 4. Official Market Gateways & Support)"
    else:
        format_instr = "the 4-section Field Diagnosis format"

    if context_chunks:
        context_text = "\n\n---\n\n".join(
            f"[Source {i+1}]\n{chunk}" for i, chunk in enumerate(context_chunks)
        )
        return (
            f"CONTEXT FROM VERIFIED AGRICULTURAL DOCUMENTS:\n\n"
            f"{context_text}\n\n"
            f"---\n\n"
            f"FARMER'S QUESTION: {english_question}\n\n"
            f"ANSWER (based strictly on the context above in {format_instr}):"
        )
    else:
        return (
            f"CONTEXT FROM VERIFIED AGRICULTURAL DOCUMENTS:\n\n"
            f"[No relevant documents found in knowledge base]\n\n"
            f"---\n\n"
            f"FARMER'S QUESTION: {english_question}\n\n"
            f"ANSWER (based strictly on the context above in {format_instr}):"
        )


@retry(
    retry=retry_if_exception_type((RateLimitError, APITimeoutError)),
    stop=stop_after_attempt(3),
    wait=wait_exponential(multiplier=1, min=2, max=10),
)
def generate_answer(
    english_question: str,
    context_chunks: list[str],
    intent: Optional[str] = None,
) -> str:
    """
    Generate a grounded answer from GPT-4o-mini, with extractive ICAR fallback
    when OpenAI API key is not configured.
    """
    if not intent:
        from app.services.market import classify_query_intent
        intent = classify_query_intent(english_question)

    if not settings.openai_api_key or settings.openai_api_key in ("your_openai_api_key_here", "") or settings.openai_api_key.startswith("your_"):
        logger.info(f"OpenAI API key not configured — using extractive grounding (intent: {intent}).")
        if intent == "MARKET_PRICE":
            return _extract_market_fallback(english_question, context_chunks)
        return _extract_grounded_fallback(context_chunks)

    client = _get_client()
    system_prompt = MARKET_SYSTEM_PROMPT if intent == "MARKET_PRICE" else SYSTEM_PROMPT
    user_prompt = _build_user_prompt(english_question, context_chunks, intent=intent)

    t0 = time.time()
    try:
        response = client.chat.completions.create(
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            messages=[
                {"role": "system", "content": system_prompt},
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
        if intent == "MARKET_PRICE":
            return _extract_market_fallback(english_question, context_chunks)
        return _extract_grounded_fallback(context_chunks)


async def generate_advisory(
    english_question: str,
    context: Union[str, list[str]],
    intent: Optional[str] = None,
) -> str:
    """
    Async interface for generating a field-ready agricultural advisory.
    Accepts context as a string or list of chunk strings, and optional intent.
    """
    if isinstance(context, str):
        chunks = [c.strip() for c in context.strip().split("\n\n") if c.strip()]
        if not chunks and context.strip():
            chunks = [context.strip()]
    else:
        chunks = list(context)
    return generate_answer(english_question, chunks, intent=intent)
