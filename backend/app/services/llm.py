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


class LLMAnswer(str):
    """
    Enhanced string response that also carries dynamic, context-locked follow-up questions.
    Behaves 100% as a standard str for all string operations and backwards compatibility.
    """
    follow_up_questions: list[str] = []

    def __new__(cls, content: str, follow_ups: Optional[list[str]] = None):
        obj = super().__new__(cls, content)
        obj.follow_up_questions = list(follow_ups or [])
        return obj


def _get_client() -> OpenAI:
    global _client
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key)
    return _client


# ── HARDCODED SYSTEM PROMPTS — DO NOT MODIFY AT RUNTIME ───────────────────────
SYSTEM_PROMPT = """You are Krishi Sahayak (कृषि सहायक), an experienced, empathetic Krishi Vigyan Kendra (KVK) field agronomist talking face-to-face with an Indian farmer in their field. Your advice is grounded strictly in official ICAR (Indian Council of Agricultural Research) recommendations.

PERSONA & TONE RULES:
- Speak as a warm, knowledgeable, respectful agricultural officer who genuinely cares about the farmer's crop and livelihood.
- Never sound robotic, bureaucratic, or overly academic. Avoid dense jargon; explain concepts in clear, practical terms a farmer can act upon today.
- Never invent unverified chemical brand names, active ingredients, or unscientific dosages.

CRITICAL INSTRUCTIONS FOR DIRECT QUESTION-SPECIFIC ANSWERING:
1. Direct 2-Sentence Human Opening:
   - Begin your response with a 2-sentence warm, reassuring, and direct human summary that directly answers the farmer's question in plain language first before any heading.
   - Example tone: "Don't worry—yellowing on lower wheat leaves right now is usually caused by nitrogen deficiency or mild waterlogging after irrigation. You can fix this quickly within 4–5 days using a targeted urea top-dressing or foliar spray."
   - If the user asks a specific follow-up (e.g., "Can I mix this with neem oil?", "What if it rains after spraying?", "What is the waiting period?"), answer that exact question directly in this opening summary and adjust sections accordingly. Do NOT force unrelated sections.
2. Multi-Turn Context Continuity:
   - Carry forward the active crop, disease, pest, or region established in prior conversation turns unless the farmer explicitly switches topics.
3. Clean, Scannable Visual Structure:
   - Organize the response using clear Markdown headings (###) with relevant emojis and generous vertical breathing room.
   - Use bold numbers and key metrics (**30 grams per 15L pump**, **7 to 10 days**).
   - Format action instructions as clear numbered steps (1., 2., 3.).
   - Always include a compact Markdown comparison table under Section 3 comparing treatment options and dosages.
   - Crucial knapsack dosage rule: Always state chemical & fertilizer dosages in practical grams (g) or milliliters (ml) per standard 15-Liter backpack knapsack spray pump alongside per-acre quantities.
   - Always specify the best spray window (early morning before 10 AM or late afternoon after 4 PM) and the Pre-Harvest Interval (PHI) safety waiting days.
   - Keep sentences spoken-friendly and rhythmic so that when the farmer taps "Play Audio Answer", the text-to-speech audio sounds like a warm, supportive human officer speaking naturally.

Format your response using this clean structure:

[2-sentence warm, natural human summary directly answering the farmer's question]

### 🛑 1. Field Diagnosis
- **Identified Condition:** [Name of crop, pest, disease, weed, or nutrient deficiency]
- **Key Visual Symptoms:** [2 clear, observable signs the farmer can check on leaves, stems, roots, or soil]

### 🌿 2. Immediate & Organic Action (Low-Cost)
- **Field Sanitation:** [Pruning, drainage, weed removal, or infected plant rogueing]
- **Organic / Bio-Control:** [Neem oil (5ml/L), Trichoderma, Pseudomonas, Jeevamrit, sticky traps, or beneficial bio-agents with clear preparation instructions]

### 🧪 3. Recommended Treatment & Exact Dosage
| Treatment Method | Recommended Formulation | Dosage per 15-Liter Pump | Application Window |
| :--- | :--- | :--- | :--- |
| Primary Option | [Standard ICAR/CIB-approved chemical formulation] | [Exact g or ml per 15L knapsack pump (e.g. 30g/15L) AND per liter (e.g. 2g/L)] | [Early morning < 10 AM or late afternoon > 4 PM] |
| Alternate / Bio Option | [Bio-agent or secondary formulation] | [Dosage per 15L pump] | [Repeat after 10-14 days if needed] |

1. **Step-by-Step Spray Instructions:** [Step 1: Preparation in small bucket, Step 2: Pouring through filter into 15L tank with clean water].
2. **Optimal Weather Window:** [Spray during calm morning/evening hours; never spray in rain, heavy fog, or high wind].
*(If no chemical spray is registered in reference data, write: "No chemical spray registered in ICAR reference data. Use organic measures or consult your local KVK.")*

### ⚠️ 4. Safety & Harvest Precaution
- **Waiting Period (PHI):** [Exact number of days to wait between spraying and crop harvest/consumption]
- **Protective Measures:** [Wear cloth mask, rubber gloves, spray with wind at back, wash thoroughly afterwards]
- **KVK & Helpline Contact:** [Remind farmer to consult nearest Krishi Vigyan Kendra (KVK) or call Kisan Call Centre at toll-free 1800-180-1551]

4. Dynamic Context-Locked Follow-Up Questions:
   - At the very end of your response, output exactly this delimiter on a new line:
---FOLLOWUPS---
   - Followed by exactly 3 specific, context-locked follow-up questions tied directly to the current answer and active crop (one per line).
"""

MARKET_SYSTEM_PROMPT = """You are Krishi Sahayak Market & Mandi Advisory Officer, an experienced agricultural marketing specialist talking face-to-face with an Indian farmer.
Answer the farmer's mandi rate, APMC auction, e-NAM, MSP, and selling questions with practical, localized, and actionable trade guidance.
Never mention plant pathology, pests, fungal infections, or chemical sprays when answering market questions.

PERSONA & TONE RULES:
- Speak as a helpful, street-smart mandi advisor who understands local market yards, commission agents (arthiyas), grading, and realistic prices.
- Be warm, encouraging, practical, and transparent about rates and price trends.

CRITICAL INSTRUCTIONS FOR DIRECT QUESTION-SPECIFIC ANSWERING:
1. Direct 2-Sentence Human Opening:
   - Begin with a 2-sentence direct, natural human summary stating the crop wholesale benchmark, current mandi trend, and primary selling advice immediately before any heading.
   - If the user asks about the nearest APMC Mandi auction or location, name the actual APMC yards in their district (e.g. Dadri Mandi, Meerut APMC, etc.), typical morning auction hours (6:00 AM – 11:00 AM), gate entry, and trading flow. Do NOT dump an irrelevant generic price table.
   - If the user asks about e-NAM registration, explain the free farmer signup on enam.gov.in, required documents (Aadhaar, bank passbook with IFSC, land patta/sowing proof), assaying, and direct online settlement.
2. Multi-Turn Context Continuity:
   - Carry forward the active crop and district from prior turns unless the farmer introduces a new crop.
3. Clean, Scannable Visual Structure:
   - Organize with clear Markdown headings (###), bold numbers (**₹2,275/Quintal**), and compact tables.
   - Keep sentences conversational and TTS-friendly for clear voice playback.

Format your response using this clean structure:

[2-sentence warm, natural human summary directly answering the farmer's market question]

### 📊 1. Market & Commodity Status
- **Crop & Mandi:** [Crop name and nearest active APMC market based on district, e.g., Dadri Mandi, Meerut Mandi, or regional APMC hub]
- **Market Mechanism:** [Clarify whether this crop trades under open APMC wholesale auction, private mandi buyers, or has a Central Government MSP]

### 💰 2. Current Estimated Mandi Rates
| Grade / Market Tier | Wholesale Modal Rate (₹/Quintal) | Approx Farmgate / Retail (₹/kg) | Key Quality Specification |
| :--- | :--- | :--- | :--- |
| Grade A (Super Quality) | [₹/Qtl benchmark range] | [₹/kg wholesale - retail] | [FAQ Grade: Uniform size, clean, <12% moisture] |
| Grade B (Medium Standard) | [₹/Qtl commercial range] | [₹/kg standard rate] | [Commercial grade, minor blemishes] |
| Grade C / Local Auction | [₹/Qtl local range] | [₹/kg local rate] | [Small size / local spot trade] |

- **Modal Wholesale Price:** [Estimated benchmark price per Quintal (100 kg)]
- **Approximate Farmgate/Retail Price:** [Estimated rate in ₹ per kg]
- **Price Trend & Demand:** [Whether prices are stable, rising, or softening due to seasonal arrivals]

### 🚛 3. Selling Advice & Storage Guidelines
1. **Pre-Mandi Grading & Cleaning:** [Sorting damaged produce, winnowing dust, checking moisture <12% for grains].
2. **Holding vs Selling Strategy:** [Whether to sell immediately at spot market or store in warehouse / cold storage for better off-season prices].

### 🏛️ 4. Official Gateways & Farmer Support
- **e-NAM Live Portal:** Track daily live auction prices across linked mandis at enam.gov.in.
- **Kisan Call Centre:** Call toll-free 1800-180-1551 (6 AM – 10 PM) for real-time daily mandi rates in your district.

4. Dynamic Context-Locked Follow-Up Questions:
   - At the very end of your response, output exactly this delimiter on a new line:
---FOLLOWUPS---
   - Followed by exactly 3 specific, context-locked follow-up questions tied directly to the current answer and active crop (one per line).
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
_DEFAULT_FALLBACK = """Based on official ICAR agronomy guidelines, prompt field sanitation combined with calibrated knapsack pump spraying ensures effective control of crop issues.

### 🛑 1. Field Diagnosis
- **Identified Issue:** Crop health condition requiring localized diagnosis.
- **Key Visual Signs:** Inspect foliage for discoloured lesions, wilted vascular tissue, or pest nymph activity.

### 🌿 2. Immediate & Organic Action (Low-Cost)
- **Field Sanitation:** Prune heavily infested foliage, clear weed hosts along borders, and avoid standing water at root zones.
- **Organic Treatment:** Spray 5% Neem Seed Kernel Extract (NSKE) or Neem oil 3000 ppm @ 5 ml per liter of water as an eco-friendly barrier.

### 🧪 3. Chemical Treatment & Exact Dosage
| Treatment Method | Recommended Formulation | Dosage per 15-Liter Pump | Application Window |
| :--- | :--- | :--- | :--- |
| Primary Chemical | Consult package label or KVK | Dilute strictly per ICAR norm | Early morning < 10 AM |
| Organic Barrier | Neem Oil 3000 ppm / NSKE 5% | 45-75 ml per 15L tank | Preventative / Early stage |

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


def _extract_grounded_fallback(
    chunks_or_q: Union[list[str], str],
    chunks_or_q2: Optional[Union[list[str], str]] = None,
) -> str:
    """
    Direct extractive grounding fallback when OpenAI API key is not configured.
    Synthesizes sentences from ICAR documents strictly into ChatGPT-style executive answer,
    Markdown comparison table, and the 4 standardized field sections:
      ### 🛑 1. Field Diagnosis
      ### 🌿 2. Immediate & Organic Action (Low-Cost)
      ### 🧪 3. Chemical Treatment & Exact Dosage
      ### ⚠️ 4. Safety & Harvest Precaution
    """
    if isinstance(chunks_or_q, list):
        context_chunks = chunks_or_q
        english_question = str(chunks_or_q2 or "")
    else:
        english_question = str(chunks_or_q or "")
        context_chunks = chunks_or_q2 if isinstance(chunks_or_q2, list) else []

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

    # Detect crop / topic from question or diagnosis
    topic = ""
    for crop in ["potato", "tomato", "paddy", "rice", "wheat", "cotton", "maize", "corn", "chilli", "onion", "mustard", "soybean", "groundnut", "sugarcane", "banana", "mango"]:
        if crop in english_question.lower() or any(crop in c.lower() for c in context_chunks if not c.startswith("[CONVERSATION HISTORY")):
            topic = crop.title()
            break

    if diag_lines:
        issue_name = _clean_label_prefixes(diag_lines[0])
    else:
        issue_name = f"{topic} health issue" if topic else "crop condition"

    exec_summary = (
        f"Based on ICAR agronomy guidelines for {issue_name}, immediate field sanitation combined with calibrated knapsack spraying ensures rapid control. "
        f"Apply the recommended formulation using exact 15-liter pump dilutions below for optimal field efficacy."
    )

    sections: list[str] = [exec_summary, ""]

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

        # Compute or extract 15L pump dosage
        if dosage_lines:
            dosage_text = dosage_lines[0]
            calculated_pump = _extract_15l_pump_dosage(dosage_text)
            pump_dosage_val = calculated_pump if calculated_pump else _clean_label_prefixes(dosage_text)
        else:
            pump_dosage_val = "Consult package label (standard 15L dilution)"

        sections.append("| Treatment Method | Recommended Formulation | Dosage per 15-Liter Pump | Application Window |")
        sections.append("| :--- | :--- | :--- | :--- |")
        sections.append(f"| Primary Chemical | {chem_name} | {pump_dosage_val} | Morning < 10 AM or Late Afternoon |")
        sections.append("| Organic Barrier | Neem Oil 3000 ppm / NSKE 5% | 45-75 ml per 15L tank (3-5 ml/L) | At early onset / preventative |")
        sections.append("")
        sections.append(f"- **Recommended Chemical:** {chem_name}")
        sections.append(f"- **Dosage per 15-Liter Pump:** {pump_dosage_val}")
        sections.append("- **Spray Timing & Conditions:** Morning before 10 AM or late afternoon after 4 PM; do not spray if rain or strong wind is forecast.")
    else:
        sections.append("| Treatment Method | Recommended Formulation | Dosage per 15-Liter Pump | Application Window |")
        sections.append("| :--- | :--- | :--- | :--- |")
        sections.append("| Organic Barrier | Neem Oil 3000 ppm / NSKE 5% | 45-75 ml per 15L tank (3-5 ml/L) | Early morning < 10 AM |")
        sections.append("| Extension Support | Consult local KVK / KCC | District-approved spray schedule | Contact toll-free 1800-180-1551 |")
        sections.append("")
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

    clean_content = "\n".join(sections)
    follow_ups = [
        "Can I mix this treatment with neem oil or other sprays?",
        "What should I do if it rains shortly after spraying?",
        "What is the exact pre-harvest waiting period (PHI) for this crop?",
    ]
    return LLMAnswer(clean_content, follow_ups)


def _parse_followups_from_answer(
    raw_text: str,
    default_followups: Optional[list[str]] = None,
) -> tuple[str, list[str]]:
    """
    Parses dynamic follow-up questions from LLM response if separated by ---FOLLOWUPS--- delimiter.
    Returns (clean_answer, list_of_followup_strings).
    """
    if "---FOLLOWUPS---" in raw_text:
        parts = raw_text.split("---FOLLOWUPS---", 1)
        answer_text = parts[0].strip()
        followup_text = parts[1].strip()
        parsed_questions: list[str] = []
        for line in followup_text.splitlines():
            clean_line = re.sub(r"^[\s*•\-–—\d.)]+", "", line).strip()
            if clean_line and len(clean_line) > 5:
                if not clean_line.endswith("?"):
                    clean_line += "?"
                parsed_questions.append(clean_line)
        if parsed_questions:
            return answer_text, parsed_questions[:3]
        return answer_text, list(default_followups or [])

    return raw_text.strip(), list(default_followups or [])


def _extract_market_fallback(
    english_question: str,
    context_chunks: list[str],
    region: Optional[str] = None,
    conversation_history: Optional[list[dict]] = None,
) -> LLMAnswer:
    """
    Extractive / pattern-based market fallback when OpenAI API key is not configured.
    Handles:
      1. Mandi / Auction Location queries -> Direct APMC market yards, hours, and auction procedures.
      2. e-NAM Registration queries -> Step-by-step registration on enam.gov.in, documents, and DBT.
      3. Commodity Price queries -> 4 standardized market sections with wholesale & retail benchmarks.
    """
    full_context = "\n".join(context_chunks or [])
    q_lower = english_question.lower()

    from app.services.market import extract_crop_from_query, get_market_price, get_regional_profile

    # 1. Identify Crop dynamically (word-boundary safe, greedy match, check conversation history)
    detected = extract_crop_from_query(english_question) or extract_crop_from_query(full_context)
    if not detected and conversation_history:
        for turn in reversed(conversation_history):
            text_to_check = turn.get("content") or f"{turn.get('q', '')} {turn.get('a', '')}"
            c = extract_crop_from_query(text_to_check)
            if c:
                detected = c
                break
    detected = detected or "general"

    # 2. Determine target region (priority: argument > context > query cues > default)
    target_region = (region or "").strip()
    if not target_region:
        m_loc = re.search(r"(?:Market\s*(?:\/\s*Region)?|Location):\s*([^\n]+)", full_context, re.IGNORECASE)
        if m_loc:
            target_region = m_loc.group(1).strip()
        elif "gautam" in q_lower or "dadri" in q_lower or "noida" in q_lower:
            target_region = "Gautam Buddha Nagar, Uttar Pradesh"
        elif "kolkata" in q_lower or "bengal" in q_lower:
            target_region = "Kolkata, West Bengal"
        elif "pune" in q_lower or "maharashtra" in q_lower:
            target_region = "Pune, Maharashtra"
        elif "shimla" in q_lower or "himachal" in q_lower:
            target_region = "Shimla, Himachal Pradesh"
        elif "delhi" in q_lower or "azadpur" in q_lower:
            target_region = "Delhi"
        else:
            target_region = "Gautam Buddha Nagar, Uttar Pradesh"

    profile = get_regional_profile(target_region)
    crop_display = detected.title() if detected != "general" else "Agricultural Produce"

    # Check for Auction Location or Mandi Yard query
    is_auction_loc_query = any(k in q_lower for k in [
        "where is", "nearest apmc", "nearest mandi", "auction in my district",
        "mandi auction", "auction yard", "market yard", "auction timing",
        "mandi timing", "auction hours", "trading hours", "how to reach mandi",
        "nearest auction"
    ]) or ("mandi" in q_lower and ("where" in q_lower or "nearest" in q_lower or "location" in q_lower))

    # Check for e-NAM Registration query
    is_enam_reg_query = any(k in q_lower for k in [
        "enam", "e-nam", "register on e-nam", "how do i register", "how to register",
        "registration", "how to sell on enam", "how to sell on e-nam",
        "documents for enam", "documents for e-nam", "enam portal"
    ])

    if is_auction_loc_query:
        mandi_desc = profile.get("market", "Dadri Mandi (Gautam Buddha Nagar) / Noida APMC / Sahibabad")
        if "gautam buddha nagar" in target_region.lower() or not profile.get("district"):
            local_mandis_text = (
                "- **Primary Mandis:** Dadri APMC Mandi (Gautam Buddha Nagar), Noida Phase-2 Fruit & Vegetable APMC Mandi, and Sahibabad Wholesale Mandi (Ghaziabad border).\n"
                "- **Distance & Connectivity:** Situated within 10–25 km across Greater Noida and Noida, easily accessible via Greater Noida Expressway and GT Road for direct farm transport."
            )
        else:
            dist_title = profile.get("district") or target_region
            local_mandis_text = (
                f"- **Primary Mandis:** {mandi_desc}.\n"
                f"- **District Jurisdiction:** Regulated Agricultural Produce Market Committee (APMC) for {dist_title}."
            )

        exec_summary = (
            f"For farmers in {target_region}, the nearest regulated wholesale auction yards for {crop_display} are {mandi_desc}. "
            f"Open electronic and physical auctions run daily from 6:00 AM to 11:00 AM under Mandi Samiti supervision."
        )

        sections = [
            exec_summary,
            "",
            "### 🏛️ 1. Nearest APMC Mandis & Market Yards",
            local_mandis_text,
            "",
            "### ⏰ 2. Mandi Auction Timings & Trading Hours",
            "- **Gate Entry & Lot Numbering:** 04:00 AM – 06:00 AM (Early arrival ensures priority lot placement on the auction platform).",
            "- **Open Wholesale Auction:** 06:00 AM – 11:00 AM (Commission agents and registered traders place open bids).",
            "- **Weighment & Settlement:** 11:00 AM – 02:00 PM (Electronic weighbridge verification and same-day payment processing).",
            "",
            "### ⚖️ 3. Produce Entry, Assaying & Weighment Procedure",
            "1. **Gate Entry:** Present your farmer Aadhaar and vehicle pass at the Mandi Samiti gate to receive a serialized entry lot slip.",
            "2. **Quality Assaying:** Mandi staff inspect moisture content, size grading, and foreign matter to determine the lot grade.",
            "3. **Electronic Weighment:** Weigh your vehicle on the computerized Mandi weighbridge before and after unloading to obtain a stamped weight slip.",
            "4. **Auction Bidding:** Licensed commission agents (Arhtiyas) conduct open outcry or e-NAM digital bidding.",
            "",
            "### 📞 4. Mandi Contact & Farmer Extension Support",
            "- **Mandi Samiti Office:** Visit the Mandi Secretary or Inspector at the administrative office yard.",
            "- **e-NAM Portal:** Live auction rates and lot status can be tracked at enam.gov.in.",
            "- **Kisan Call Centre:** Dial toll-free 1800-180-1551 (6:00 AM – 10:00 PM) for daily district mandi bulletins.",
        ]
        follow_ups = [
            f"How do I register on e-NAM to sell this {crop_display}?",
            f"What are the grading and quality criteria for Grade A {crop_display} rates?",
            f"What are the peak arrival months and price trends for {crop_display}?",
        ]
        return LLMAnswer("\n".join(sections), follow_ups)

    if is_enam_reg_query:
        exec_summary = (
            f"Indian farmers can register for free on the National Agriculture Market (e-NAM) portal (enam.gov.in) or mobile app "
            f"to sell {crop_display} directly to licensed traders across India with 100% direct bank transfer (DBT) payment."
        )
        sections = [
            exec_summary,
            "",
            "### 📱 1. e-NAM Online Registration Steps",
            "1. **Access Portal or App:** Download the official 'e-NAM' mobile app or visit enam.gov.in and click 'Farmer Registration'.",
            "2. **Provide Farmer Details:** Select 'Farmer', choose your state and APMC Mandi, and enter your name, mobile number, and address matching your Aadhaar card.",
            "3. **Upload KYC Documents:** Upload clear photos or PDF copies of your Aadhaar card, bank passbook, and land/crop record.",
            "4. **Mandi Approval:** The local APMC Mandi Secretary verifies and approves your account within 24–48 hours, issuing your unique e-NAM Farmer ID.",
            "",
            "### 📄 2. Mandatory Documents Required",
            "- **Identity Proof:** Aadhaar Card (mandatory for identity verification and DBT linking).",
            "- **Bank Account Details:** Bank Passbook copy or cancelled cheque clearly showing Account Number and IFSC code.",
            "- **Land & Crop Records:** Khasra/Khatauni (Land Patta) or Village Patwari / Gram Panchayat Crop Sowing Certificate for tenant farmers.",
            "- **Photograph:** 1 recent passport-sized photograph.",
            "",
            "### 🌾 3. Mandi Trade Workflow on e-NAM",
            "1. **Gate Entry:** Bring your produce to the nearest e-NAM integrated APMC Mandi and present your e-NAM ID to obtain an e-lot slip.",
            "2. **Quality Assaying:** The mandi assaying laboratory tests moisture, physical purity, and grade parameters.",
            "3. **Online Bidding:** Traders bid competitively on your lot via the digital platform.",
            "4. **Direct Bank Settlement (DBT):** After you accept the highest bid, the sale proceeds are deposited directly into your bank account within 24 hours.",
            "",
            "### 🏛️ 4. Official Support & Farmer Helpline",
            "- **e-NAM Helpdesk:** Dial toll-free 1800-270-0224 (9:00 AM – 6:00 PM) for registration and portal support.",
            "- **Local APMC Mandi Counter:** Visit the e-NAM facilitation counter at your nearest APMC Mandi administrative block.",
            "- **Kisan Call Centre:** Call 1800-180-1551 for general agricultural guidance.",
        ]
        follow_ups = [
            f"Where is the nearest APMC Mandi auction in my district?",
            f"What documents do I need to carry to the mandi gate?",
            f"How is the direct bank transfer (DBT) payment processed after auction?",
        ]
        return LLMAnswer("\n".join(sections), follow_ups)

    # 3. Retrieve calibrated benchmark data for detected crop & location
    benchmark = get_market_price(detected, target_region)

    crop_name = benchmark.get("crop", detected.title())
    mandi_name = benchmark.get("market", f"{target_region} Mandi")
    mechanism = benchmark.get("mechanism", "Open APMC Mandi Wholesale Auction (Perishable crop; No Central Government MSP applies)")
    availability = benchmark.get("availability_status", "In Peak Local Harvest")
    price_qtl = benchmark.get("price_per_quintal", 0)
    range_qtl = benchmark.get("price_range_per_quintal", "")

    if price_qtl > 0:
        modal_price_str = f"₹{price_qtl:,.0f} per Quintal ({range_qtl})"
    else:
        modal_price_str = range_qtl or "Refer to daily APMC Mandi e-NAM bulletin"

    approx_rates = f"{benchmark.get('rate_per_kg_wholesale', 'Variable')} wholesale, {benchmark.get('rate_per_kg_retail', 'Variable')} retail"
    grade_str = benchmark.get("grade_criteria", "Grade A (super quality), Grade B (medium), Grade C (small/lower grade)")
    best_selling = benchmark.get("selling_advice", "Clean, grade, and pack produce in breathable crates or leno bags.")
    storage_advice = benchmark.get("storage_advice", "Store in clean, ventilated godowns or cold storage.")

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

    wh_rate_clean = approx_rates.split(",")[0].strip() if "," in approx_rates else approx_rates

    if price_qtl > 0:
        b_qtl = f"₹{price_qtl * 0.85:,.0f} per Quintal"
        c_qtl = f"₹{price_qtl * 0.70:,.0f} per Quintal"
    else:
        b_qtl = "Commercial benchmark rate"
        c_qtl = "Local spot clearing rate"

    exec_summary = (
        f"In {mandi_name}, current wholesale trading for {crop_name} is benchmarked at {modal_price_str} ({approx_rates}). "
        f"Clean, sorted, and properly graded produce fetches top modal returns under APMC auction."
    )

    sections = [
        exec_summary,
        "",
        "### 📊 1. Market & Commodity Status",
        f"- **Crop & Mandi:** {crop_name} — {mandi_name}",
        f"- **Market Mechanism:** {mechanism}",
        f"- **Availability & Supply Status:** {availability}",
        "",
        "### 💰 2. Current Estimated Mandi Rates",
        "| Grade / Market Tier | Wholesale Modal Rate (₹/Quintal) | Approx Farmgate / Retail (₹/kg) | Key Quality Specification |",
        "| :--- | :--- | :--- | :--- |",
        f"| Grade A (Super Quality) | {modal_price_str} | {wh_rate_clean} | Uniform size, high dry matter, no blemishes |",
        f"| Grade B (Medium Standard) | {b_qtl} | Standard market rate | Standard commercial grade, minor size variation |",
        f"| Grade C / Local Auction | {c_qtl} | Local discounted rate | Small size or spot clearing produce |",
        "",
        f"- **Modal Wholesale Price:** {modal_price_str}",
        f"- **Approximate Farmgate/Retail Price:** {approx_rates}",
        f"- **Grade-Wise Variation:** {grade_str}",
        "",
        "### 🚛 3. Selling Advice & Storage Guidelines",
        f"- **Best Selling Practices:** {best_selling}",
        f"- **Cold Storage / Holding Advice:** {storage_advice}",
        "",
        "### 🏛️ 4. Official Market Gateways & Support",
        "- **e-NAM Portal:** Live real-time auction prices and lot bids can be tracked at enam.gov.in.",
        "- **Kisan Call Centre:** Dial toll-free 1800-180-1551 (6:00 AM – 10:00 PM) for daily localized modal prices from your nearest APMC market yard.",
    ]
    follow_ups = [
        f"Where is the nearest APMC Mandi auction for {crop_name}?",
        f"How do I register on e-NAM to sell this {crop_name}?",
        f"What are the grading and quality criteria for Grade A {crop_name} rates?",
    ]
    return LLMAnswer("\n".join(sections), follow_ups)


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
    region: Optional[str] = None,
    conversation_history: Optional[list[dict]] = None,
) -> LLMAnswer:
    """
    Generate a grounded answer from GPT-4o-mini, with extractive ICAR fallback
    when OpenAI API key is not configured.
    Supports multi-turn conversation memory and dynamic context-locked follow-up generation.
    """
    if not intent:
        from app.services.market import classify_query_intent
        intent = classify_query_intent(english_question)

    if not settings.openai_api_key or settings.openai_api_key in ("your_openai_api_key_here", "") or settings.openai_api_key.startswith("your_"):
        logger.info(f"OpenAI API key not configured — using extractive grounding (intent: {intent}).")
        if intent == "MARKET_PRICE":
            return _extract_market_fallback(english_question, context_chunks, region=region, conversation_history=conversation_history)
        return _extract_grounded_fallback(context_chunks, english_question)

    client = _get_client()
    system_prompt = MARKET_SYSTEM_PROMPT if intent == "MARKET_PRICE" else SYSTEM_PROMPT
    user_prompt = _build_user_prompt(english_question, context_chunks, intent=intent)
    if region:
        user_prompt = f"FARMER LOCATION: {region}\n\n" + user_prompt

    messages = [{"role": "system", "content": system_prompt}]
    if conversation_history:
        for turn in conversation_history[-6:]:
            role = turn.get("role")
            content = turn.get("content")
            if not role and "q" in turn:
                messages.append({"role": "user", "content": turn["q"]})
                if "a" in turn:
                    messages.append({"role": "assistant", "content": turn["a"]})
            elif role and content:
                messages.append({"role": role, "content": content})

    messages.append({"role": "user", "content": user_prompt})

    t0 = time.time()
    try:
        response = client.chat.completions.create(
            model=settings.llm_model,
            temperature=settings.llm_temperature,
            max_tokens=settings.llm_max_tokens,
            messages=messages,
            stream=False,
        )
        raw_answer = response.choices[0].message.content.strip()
        elapsed_ms = int((time.time() - t0) * 1000)
        logger.info(
            f"LLM generated answer in {elapsed_ms}ms "
            f"(tokens used: {response.usage.total_tokens})"
        )

        if intent == "MARKET_PRICE":
            default_followups = [
                "Where is the nearest APMC Mandi auction in my district?",
                "How do I register on e-NAM to sell this crop?",
                "What are the grading and quality criteria for Grade A rates?",
            ]
        else:
            default_followups = [
                "Can I mix this treatment with neem oil or other sprays?",
                "What should I do if it rains shortly after spraying?",
                "What is the exact pre-harvest waiting period (PHI) for this crop?",
            ]

        clean_answer, dynamic_followups = _parse_followups_from_answer(raw_answer, default_followups)
        return LLMAnswer(clean_answer, dynamic_followups)

    except Exception as exc:
        logger.error("OpenAI call failed, falling back to extractive: %s", exc)
        if intent == "MARKET_PRICE":
            return _extract_market_fallback(english_question, context_chunks, region=region, conversation_history=conversation_history)
        return _extract_grounded_fallback(context_chunks, english_question)


async def generate_advisory(
    english_question: str,
    context: Union[str, list[str]],
    intent: Optional[str] = None,
    region: Optional[str] = None,
    conversation_history: Optional[list[dict]] = None,
) -> LLMAnswer:
    """
    Async interface for generating a field-ready agricultural advisory.
    Accepts context as a string or list of chunk strings, optional intent, region, and conversation history.
    """
    if isinstance(context, str):
        chunks = [c.strip() for c in context.strip().split("\n\n") if c.strip()]
        if not chunks and context.strip():
            chunks = [context.strip()]
    else:
        chunks = list(context)
    return generate_answer(
        english_question,
        chunks,
        intent=intent,
        region=region,
        conversation_history=conversation_history,
    )
