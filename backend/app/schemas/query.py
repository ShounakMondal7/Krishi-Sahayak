"""
schemas/query.py — Pydantic v2 request/response models.

These are the public API contracts. Keep them stable — changes here
are breaking changes for all API consumers.
"""
import html
import re
from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, field_validator


# ═══════════════════════════════════════════════════════════════════════════════
# INPUT SANITIZATION UTILITIES (CERT-In / OWASP Hardening)
# ═══════════════════════════════════════════════════════════════════════════════

# Dangerous XSS script patterns: <script>...</script>, <iframe>, <object>, <embed>, javascript:, inline event handlers
_SCRIPT_PATTERN = re.compile(
    r"(<script\b[^>]*>([\s\S]*?)<\/script>|<script\b[^>]*\/?>|javascript:|vbscript:|data:text\/html|<iframe\b[^>]*>|<object\b[^>]*>|<embed\b[^>]*>|on\w+\s*=)",
    re.IGNORECASE,
)
_HTML_TAG_PATTERN = re.compile(r"<[^>]+>")

# SQL injection patterns that represent malicious payloads
_SQLI_PATTERN = re.compile(
    r"((\bunion\s+(all\s+)?select\b)|(\bdrop\s+(table|database|schema)\b)|(\binsert\s+into\b)|(\bdelete\s+from\b)|(\bselect\b.*\bfrom\b.*--)|(;\s*drop\b)|(;\s*delete\b)|(;\s*insert\b)|(;\s*shutdown\b)|(\bxp_\w+)|(--\s*$))",
    re.IGNORECASE,
)

# Safe identifier patterns (alphanumeric, hyphens, underscores, dots)
_SAFE_ID_PATTERN = re.compile(r"^[a-zA-Z0-9_\-\.]{1,64}$")

# Safe region pattern (supports English, regional Indian Unicode scripts, spaces, hyphens, commas, periods)
_SAFE_REGION_PATTERN = re.compile(r"^[\w\s,\.\-\u0900-\u0D7F]+$", re.UNICODE)


def sanitize_text_input(v: str, allow_html: bool = False) -> str:
    """
    Sanitizes user input to prevent XSS and injection attacks.
    - Rejects explicit SQL injection attack payloads
    - Strips script tags, iframe, dangerous event handlers
    - Escapes residual HTML characters
    """
    if not v:
        return v
    v = v.strip()

    # Reject SQL injection attack patterns
    if _SQLI_PATTERN.search(v):
        raise ValueError("Input contains disallowed SQL injection patterns.")

    # Remove script tags and event handlers
    cleaned = _SCRIPT_PATTERN.sub("", v)

    # Strip general HTML tags unless specifically allowed
    if not allow_html:
        cleaned = _HTML_TAG_PATTERN.sub("", cleaned)

    # HTML escape any residual characters
    escaped = html.escape(cleaned.strip())
    if not escaped and v:
        raise ValueError("Input was rejected due to dangerous content.")
    return escaped


def sanitize_identifier(v: Optional[str], field_name: str = "id") -> Optional[str]:
    """Validates and sanitizes session/conversation identifiers."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if not _SAFE_ID_PATTERN.match(v):
        raise ValueError(f"Invalid characters in {field_name}. Only alphanumeric, hyphen, underscore, and dot allowed.")
    return v


def sanitize_region_input(v: Optional[str]) -> Optional[str]:
    """Validates and sanitizes region/district names."""
    if v is None:
        return None
    v = v.strip()
    if not v:
        return None
    if _SCRIPT_PATTERN.search(v) or _SQLI_PATTERN.search(v):
        raise ValueError("Invalid characters or injection pattern in region.")
    cleaned = _HTML_TAG_PATTERN.sub("", v).strip()
    if not _SAFE_REGION_PATTERN.match(cleaned):
        raise ValueError("Region contains invalid special characters.")
    return cleaned


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class QueryRequest(BaseModel):
    """Farmer's text query request."""
    question: str = Field(
        ...,
        min_length=2,
        max_length=1000,
        description="Farmer's question — expected in Malayalam (ml)",
        examples=["എന്റെ നെൽ ചെടികൾ മഞ്ഞ നിറമാകുന്നു"],
    )
    language: str = Field(
        default="en",
        pattern=r"^[a-z]{2}$",
        description="ISO 639-1 language code (e.g., 'en', 'hi', 'ml', 'ta', 'te', 'kn', 'bn', 'mr', 'gu', 'pa', 'or', 'as').",
    )
    region: Optional[str] = Field(
        default=None,
        max_length=100,
        description="Farmer's district/region (e.g., 'Thrissur', 'Wayanad')",
        examples=["Thrissur"],
    )
    session_id: Optional[str] = Field(
        default=None,
        max_length=64,
        description="Anonymous session identifier for grouping queries",
    )
    conversation_id: Optional[str] = Field(
        default=None,
        max_length=64,
        description=(
            "Conversation thread ID for multi-turn follow-up queries. "
            "Supply the same ID across turns to get contextually aware answers."
        ),
    )

    @field_validator("question")
    @classmethod
    def validate_and_sanitize_question(cls, v: str) -> str:
        return sanitize_text_input(v)

    @field_validator("region")
    @classmethod
    def validate_and_sanitize_region(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_region_input(v)

    @field_validator("session_id")
    @classmethod
    def validate_session_id(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_identifier(v, "session_id")

    @field_validator("conversation_id")
    @classmethod
    def validate_conversation_id(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_identifier(v, "conversation_id")


# ═══════════════════════════════════════════════════════════════════════════════
# RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class SourceDocument(BaseModel):
    """A source document retrieved from the knowledge base."""
    filename: str
    display_name: str   # Human-readable label (e.g. "ICAR Rice Pest Management")
    relevance_score: Optional[float] = None


class TimingBreakdown(BaseModel):
    """Per-phase timing for transparency and research logging."""
    translation_input_ms: Optional[int] = None
    retrieval_ms: Optional[int] = None
    llm_ms: Optional[int] = None
    translation_output_ms: Optional[int] = None
    total_ms: int


class QueryResponse(BaseModel):
    """Response returned to the farmer."""
    query_id: Optional[int] = Field(default=None, description="DB row ID for audio generation")
    conversation_id: Optional[str] = Field(default=None, description="Thread ID for follow-up queries")
    answer: str = Field(description="Final answer in Malayalam")
    answer_english: str = Field(description="English answer (for logging/debug)")
    sources: List[str] = Field(description="Source document filenames used")
    source_labels: List[SourceDocument] = Field(
        default_factory=list,
        description="Human-readable source labels for UI display",
    )
    response_time_ms: int = Field(description="Total end-to-end latency in ms")
    from_cache: bool = Field(default=False, description="True if served from in-memory cache")
    weather_context_used: bool = Field(default=False, description="True if live weather data was injected")
    market_context_used: bool = Field(default=False, description="True if live price data was injected")
    timing: Optional[TimingBreakdown] = None

    model_config = {"json_schema_extra": {
        "example": {
            "query_id": 42,
            "conversation_id": None,
            "answer": "തവിട്ട് ചാഴി നിയന്ത്രിക്കാൻ ക്ലോർപൈറിഫോസ് 20 EC...",
            "answer_english": "To control brown planthopper, apply Chlorpyrifos 20 EC...",
            "sources": ["icar_rice_pest_management.txt"],
            "source_labels": [{"filename": "icar_rice_pest_management.txt",
                                "display_name": "ICAR Rice Pest Management", "relevance_score": 0.92}],
            "response_time_ms": 2341,
            "from_cache": False,
            "weather_context_used": False,
            "market_context_used": False,
        }
    }}


class VoiceQueryResponse(QueryResponse):
    """Response for voice queries — adds the transcribed text."""
    transcribed_text: str = Field(
        description="Malayalam text as transcribed from the audio"
    )


class ImageQueryResponse(QueryResponse):
    """Response for image queries — adds the vision-generated symptom description."""
    symptom_description: str = Field(
        description="Physical symptoms observed in the image by GPT-4o vision"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# ANALYTICS RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class TopQuery(BaseModel):
    query: str
    count: int


class RegionStats(BaseModel):
    region: str
    count: int


class DailyVolume(BaseModel):
    date: str  # ISO 8601 date string YYYY-MM-DD
    count: int


class PerformanceStats(BaseModel):
    avg_response_time_ms: Optional[float] = None
    avg_retrieval_time_ms: Optional[float] = None
    avg_llm_time_ms: Optional[float] = None
    cache_hit_rate: Optional[float] = None
    total_queries: int
    voice_queries: int
    text_queries: int
    image_queries: int = 0


class TopQueryItem(BaseModel):
    query: str
    count: int


class DistrictDistributionItem(BaseModel):
    district: str
    count: int
    percentage: float


class DailyVolumeItem(BaseModel):
    date: str  # YYYY-MM-DD
    count: int


class ModalityCounts(BaseModel):
    text: int = 0
    voice: int = 0
    image: int = 0


class UnifiedAnalyticsResponse(BaseModel):
    total_queries: int = 0
    avg_latency: float = 0.0          # in seconds
    avg_latency_ms: float = 0.0       # in milliseconds
    top_queries: List[TopQueryItem] = Field(default_factory=list)
    district_distribution: List[DistrictDistributionItem] = Field(default_factory=list)
    daily_volume: List[DailyVolumeItem] = Field(default_factory=list)
    modality_counts: ModalityCounts = Field(default_factory=ModalityCounts)


class HealthResponse(BaseModel):
    status: str                # "ok" | "degraded" | "error"
    chroma_documents: int
    db: str                    # "ok" | "error"
    version: str
    uptime_seconds: Optional[float] = None
    timestamp: datetime


# ═══════════════════════════════════════════════════════════════════════════════
# ERROR MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ErrorResponse(BaseModel):
    error: str
    detail: Optional[str] = None
    # NOTE: Never include stack_trace here — logged server-side only


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER — filename → display label
# ═══════════════════════════════════════════════════════════════════════════════

_SOURCE_LABELS: dict[str, str] = {
    # Kerala / South India
    "icar_rice_diseases.txt": "ICAR — Rice Diseases Guide",
    "icar_rice_pest_management.txt": "ICAR — Rice Pest Management",
    "icar_soil_health_management.txt": "ICAR — Soil Health Management",
    "icar_vegetable_cultivation.txt": "ICAR — Vegetable Cultivation Guide",
    "kerala_agri_advisory_2024.txt": "Kerala Agriculture Dept Advisory 2024",
    "kerala_coconut_advisory.txt": "ICAR-CPCRI — Coconut Advisory",
    "icar_spices_south_india.txt": "ICAR-IISR — Spices Advisory (Pepper, Cardamom, Turmeric, Ginger)",
    "icar_banana_cultivation.txt": "ICAR-NRCB — Banana Cultivation Guide",
    # North India
    "icar_wheat_north_india.txt": "ICAR-IIWBR — Wheat Cultivation Guide (North India)",
    "icar_mustard_advisory.txt": "ICAR-DRMR — Mustard Cultivation Advisory",
    # Central India
    "icar_soybean_advisory.txt": "ICAR-IISR — Soybean Advisory (MP/Maharashtra)",
    "icar_cotton_advisory.txt": "ICAR-CICR — Cotton Advisory (Vidarbha/Telangana/Gujarat)",
    "icar_sugarcane_advisory.txt": "ICAR-SBI — Sugarcane Advisory (UP/Maharashtra/TN)",
    # Pan-India
    "icar_pulses_advisory.txt": "ICAR-IIPR — Pulses Advisory (Chickpea, Tur, Moong, Urad, Lentil)",
    "icar_groundnut_advisory.txt": "ICAR-DGR — Groundnut Advisory (Gujarat/AP/TN)",
    "icar_mango_cultivation.txt": "ICAR-CISH — Mango Cultivation (UP/Maharashtra/Gujarat/AP)",
    "icar_organic_farming_india.txt": "ICAR-NCONF — Organic and Natural Farming Guide",
    "govt_farmer_schemes_india_2024.txt": "Govt of India — Farmer Welfare Schemes 2024-25 (PM-KISAN, PMFBY, MSP)",
    # Northeast & Hill Agriculture
    "icar_northeast_hill_agriculture.txt": "ICAR-NEH / Tocklai — Northeast & Hill Agriculture (Tea, Cardamom, Lakadong)",
    # Millets / Shree Anna
    "icar_millets_shree_anna.txt": "ICAR-IIMR — Millets & Shree Anna (Jowar, Bajra, Ragi, Minor Millets)",
    # Eastern India
    "icar_jute_makhana_east_india.txt": "ICAR-CRIJAF / RCER — Jute & Mithila Makhana Advisory (WB/Bihar/Assam)",
    # Himalayan Horticulture
    "icar_himalayan_horticulture.txt": "ICAR-CITH — Himalayan Horticulture (High-Density Apple, Walnut, Saffron)",
    # Livestock & Animal Husbandry
    "icar_livestock_dairy_poultry.txt": "ICAR-NDRI / CARI — Dairy, Goat & Poultry Husbandry Advisory",
    # Fisheries & Aquaculture
    "icar_fisheries_aquaculture.txt": "ICAR-CIFA / CMFRI — Fisheries & Aquaculture Advisory",
}


def make_source_labels(filenames: List[str], scores: Optional[List[float]] = None) -> List[SourceDocument]:
    """Convert raw filenames to SourceDocument objects with human-readable labels."""
    result = []
    for i, fname in enumerate(filenames):
        label = _SOURCE_LABELS.get(
            fname,
            fname.replace("_", " ").replace(".txt", "").replace(".pdf", "").title()
        )
        score = scores[i] if scores and i < len(scores) else None
        result.append(SourceDocument(filename=fname, display_name=label, relevance_score=score))
    return result
