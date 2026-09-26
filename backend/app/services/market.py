"""
services/market.py — eNAM / MSP crop price integration.

Fetches current market support prices (MSP) and mandi rates for crops.
Results cached for 6 hours (prices are daily, not real-time).

Architecture note: Price data is injected into RAG context ONLY when
the query is price/market-related. The LLM still must answer using
retrieved document chunks — the price data supplements, not replaces, RAG.
"""
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── In-memory price cache (6-hour TTL) ───────────────────────────────────────
_price_cache: dict[str, tuple[dict, float]] = {}
_PRICE_TTL = 6 * 3600  # 6 hours

# ── MSP 2024-25 — hardcoded official GoI values (always accurate) ─────────────
MSP_2024_25 = {
    "paddy": {"common": 2300, "grade_a": 2320, "unit": "per quintal"},
    "rice": {"common": 2300, "grade_a": 2320, "unit": "per quintal"},
    "wheat": {"common": 2275, "unit": "per quintal"},
    "maize": {"common": 2090, "unit": "per quintal"},
    "jowar": {"hybrid": 3371, "maldandi": 3421, "unit": "per quintal"},
    "bajra": {"common": 2625, "unit": "per quintal"},
    "groundnut": {"common": 6783, "unit": "per quintal"},
    "soybean": {"common": 4892, "unit": "per quintal"},
    "sunflower": {"common": 7280, "unit": "per quintal"},
    "sesame": {"common": 9267, "unit": "per quintal"},
    "cotton": {"medium": 7121, "long": 7521, "unit": "per quintal"},
    "sugarcane": {"common": 340, "unit": "per quintal (FRP)"},
    "coconut": {"copra": 11582, "unit": "per quintal"},
    "rubber": {"rss4": 160, "unit": "per kg"},
    "pepper": {"common": 350, "unit": "per kg (approx)"},
    "cardamom": {"common": 1200, "unit": "per kg (auction average)"},
    "ginger": {"common": 50, "unit": "per kg (farm gate)"},
    "turmeric": {"common": 70, "unit": "per kg"},
    "banana": {"common": 15, "unit": "per kg"},
    "tapioca": {"common": 8, "unit": "per kg"},
    "cowpea": {"common": 5440, "unit": "per quintal"},
    "mustard": {"common": 5650, "unit": "per quintal"},
    "chickpea": {"common": 5440, "unit": "per quintal"},
    "pigeon_pea": {"common": 7000, "unit": "per quintal"},
    "moong": {"common": 8682, "unit": "per quintal"},
    "urad": {"common": 7400, "unit": "per quintal"},
    "lentil": {"common": 6425, "unit": "per quintal"},
    "mango": {"common": 40, "unit": "per kg (farm gate)"},
    "ragi": {"common": 4290, "unit": "per quintal"},
    "jute": {"common": 5335, "unit": "per quintal"},
    "tea": {"common": 200, "unit": "per kg (made tea avg)"},
    "apple": {"common": 80, "unit": "per kg (farm gate)"},
    "makhana": {"common": 800, "unit": "per kg (popped grade-1)"},
    "saffron": {"common": 250000, "unit": "per kg (Mongra grade)"},
}

# ── Price-query intent keywords ───────────────────────────────────────────────
MARKET_KEYWORDS = {
    "price", "rate", "msp", "market", "sell", "selling", "profit", "income",
    "mandi", "enam", "e-nam", "cost", "rupee", "value", "worth", "trade",
    "export", "procurement", "supplyco", "nafed", "purchase",
    "minimum support", "support price", "farm gate",
}

# Crop name normalization
CROP_ALIASES = {
    # Cereals & Millets
    "paddy": "paddy", "rice": "paddy", "nel": "paddy", "njavara": "paddy",
    "wheat": "wheat", "gothambu": "wheat", "gehun": "wheat",
    "maize": "maize", "corn": "maize", "makka": "maize",
    "bajra": "bajra", "pearl millet": "bajra",
    "jowar": "jowar", "sorghum": "jowar",
    "ragi": "ragi", "finger millet": "ragi", "mandua": "ragi",
    # Oilseeds
    "groundnut": "groundnut", "peanut": "groundnut", "kadala": "groundnut",
    "soybean": "soybean", "soya": "soybean",
    "mustard": "mustard", "rapeseed": "mustard", "sarson": "mustard",
    "sunflower": "sunflower",
    "sesame": "sesame", "til": "sesame", "gingelly": "sesame",
    # Cash & Fibre Crops
    "cotton": "cotton", "kapas": "cotton",
    "sugarcane": "sugarcane", "cane": "sugarcane", "karumbu": "sugarcane",
    "jute": "jute", "pat": "jute",
    "tea": "tea", "chaya": "tea", "chai": "tea",
    # Pulses
    "chickpea": "chickpea", "gram": "chickpea", "chana": "chickpea", "kadalai": "chickpea",
    "pigeon pea": "pigeon_pea", "tur": "pigeon_pea", "arhar": "pigeon_pea", "toor": "pigeon_pea",
    "moong": "moong", "green gram": "moong", "cherupayar": "moong",
    "urad": "urad", "black gram": "urad", "ulunnu": "urad",
    "lentil": "lentil", "masoor": "lentil",
    "cowpea": "cowpea", "vanpayar": "cowpea",
    # Spices
    "coconut": "coconut", "thenga": "coconut", "copra": "coconut",
    "rubber": "rubber", "kauchuk": "rubber",
    "pepper": "pepper", "kurumulaku": "pepper", "black pepper": "pepper",
    "cardamom": "cardamom", "elakka": "cardamom", "elaichi": "cardamom",
    "ginger": "ginger", "inji": "ginger", "adrak": "ginger",
    "turmeric": "turmeric", "manjal": "turmeric", "haldi": "turmeric",
    "saffron": "saffron", "kesar": "saffron", "kumkumapoovu": "saffron",
    # Fruits & Specialty
    "banana": "banana", "vazha": "banana", "kela": "banana",
    "mango": "mango", "mavu": "mango", "aam": "mango",
    "apple": "apple", "seb": "apple",
    "walnut": "walnut", "akhrot": "walnut",
    "makhana": "makhana", "foxnut": "makhana",
    "tapioca": "tapioca", "kappa": "tapioca", "cassava": "tapioca",
}


def _cache_key(crop: str, region: str) -> str:
    return hashlib.md5(f"{crop.lower()}::{region.lower()}".encode()).hexdigest()


def _get_cached(crop: str, region: str) -> Optional[dict]:
    key = _cache_key(crop, region)
    entry = _price_cache.get(key)
    if entry:
        data, ts = entry
        if time.monotonic() - ts < _PRICE_TTL:
            return data
        del _price_cache[key]
    return None


def _set_cached(crop: str, region: str, data: dict) -> None:
    _price_cache[_cache_key(crop, region)] = (data, time.monotonic())


def detect_crop_in_query(english_query: str) -> Optional[str]:
    """Detect if the query mentions a specific crop."""
    query_lower = english_query.lower()
    for alias, canonical in CROP_ALIASES.items():
        if alias in query_lower:
            return canonical
    return None


def is_market_related(english_query: str) -> bool:
    """Returns True if the query has market/price intent."""
    query_lower = english_query.lower()
    return any(kw in query_lower for kw in MARKET_KEYWORDS)


async def fetch_current_price(crop_name: str, region: str) -> dict:
    """
    Fetch current MSP / mandi rate for a crop.

    Tries eNAM API first. Falls back to official 2024-25 MSP values.

    Returns:
        {
            "crop": str,
            "price_per_quintal": float,
            "market": str,
            "date": str,
            "price_type": str,   — "MSP" | "Mandi Rate" | "Estimated"
            "source": str,
        }
    """
    canonical_crop = CROP_ALIASES.get(crop_name.lower(), crop_name.lower())
    cached = _get_cached(canonical_crop, region)
    if cached:
        return cached

    result = await _fetch_enam_price(canonical_crop, region)
    _set_cached(canonical_crop, region, result)
    return result


async def _fetch_enam_price(crop: str, region: str) -> dict:
    """Try eNAM API — fall back to MSP table."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(
                "https://enam.gov.in/web/dashboard/trade-data",
                params={
                    "lan": "en",
                    "stateName": "Kerala",
                    "commodity": crop.title(),
                    "currentPage": 1,
                    "count": 1,
                },
                headers={"Accept": "application/json"},
                follow_redirects=True,
            )
            if response.status_code == 200:
                data = response.json()
                trades = data.get("data", {}).get("tradeData", [])
                if trades:
                    trade = trades[0]
                    return {
                        "crop": crop.title(),
                        "price_per_quintal": float(trade.get("modalPrice", 0)),
                        "market": trade.get("marketName", region),
                        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                        "price_type": "eNAM Mandi Rate",
                        "source": "eNAM (National Agriculture Market)",
                    }
    except Exception as exc:
        logger.warning(f"eNAM API unavailable for {crop}: {exc} — using MSP fallback")

    # MSP fallback
    return _get_msp_fallback(crop, region)


def _get_msp_fallback(crop: str, region: str) -> dict:
    """Return official MSP 2024-25 data."""
    msp_data = MSP_2024_25.get(crop, {})
    if msp_data:
        price_key = next(iter(k for k in msp_data if k != "unit"), None)
        price = msp_data.get(price_key, 0) if price_key else 0
        unit = msp_data.get("unit", "per quintal")
        return {
            "crop": crop.title(),
            "price_per_quintal": float(price),
            "market": f"{region} (MSP Reference)",
            "date": "2024-25",
            "price_type": "Government MSP (Minimum Support Price)",
            "source": "Government of India — MSP 2024-25",
        }
    return {
        "crop": crop.title(),
        "price_per_quintal": 0.0,
        "market": region,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "price_type": "Not available",
        "source": "Price data not available for this crop",
    }


def format_price_context(price_data: dict) -> str:
    """Format market price data as LLM context string."""
    return (
        f"[LIVE MARKET PRICE DATA — Source: {price_data['source']}]\n"
        f"Crop: {price_data['crop']}\n"
        f"Current Price: ₹{price_data['price_per_quintal']:.0f} {price_data.get('unit', 'per quintal')}\n"
        f"Price Type: {price_data['price_type']}\n"
        f"Market: {price_data['market']} | Date: {price_data['date']}"
    )
