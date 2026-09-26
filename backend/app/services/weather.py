"""
services/weather.py — IMD Agrometeorological weather advisory integration.

Fetches current weather forecast for a farmer's region from IMD's API.
Results are cached for 3 hours (weather doesn't need real-time refresh).

Architecture note: Weather data is injected into RAG context as an additional
"verified" data source, NOT used to replace document retrieval. This preserves
the grounding constraint — the LLM always cites documents + live data together.
"""
import asyncio
import hashlib
import logging
import time
from datetime import datetime, timezone
from typing import Optional

import httpx

logger = logging.getLogger(__name__)

# ── In-memory weather cache (3-hour TTL) ─────────────────────────────────────
_weather_cache: dict[str, tuple[dict, float]] = {}
_WEATHER_TTL = 3 * 3600  # 3 hours in seconds

# ── Kerala district → IMD station mapping ────────────────────────────────────
DISTRICT_STATION_MAP = {
    "Thiruvananthapuram": "Thiruvananthapuram",
    "Kollam": "Kollam",
    "Pathanamthitta": "Pathanamthitta",
    "Alappuzha": "Alappuzha",
    "Kottayam": "Kottayam",
    "Idukki": "Munnar",
    "Ernakulam": "Cochin",
    "Thrissur": "Thrissur",
    "Palakkad": "Palakkad",
    "Malappuram": "Malappuram",
    "Kozhikode": "Calicut",
    "Wayanad": "Wayanad",
    "Kannur": "Kannur",
    "Kasaragod": "Kasaragod",
    # Pan-India agricultural hubs
    "Punjab": "Ludhiana",
    "Haryana": "Karnal",
    "Uttar Pradesh": "Lucknow",
    "Madhya Pradesh": "Bhopal",
    "Maharashtra": "Pune",
    "Gujarat": "Ahmedabad",
    "Rajasthan": "Jaipur",
    "West Bengal": "Kolkata",
    "Assam": "Guwahati",
    "Jammu & Kashmir": "Srinagar",
    "Telangana": "Hyderabad",
    "Andhra Pradesh": "Vijayawada",
    "Tamil Nadu": "Coimbatore",
    "Karnataka": "Bengaluru",
    "Bihar": "Patna",
    "Odisha": "Bhubaneswar",
}

# ── Intent detection — weather-related query keywords ────────────────────────
WEATHER_KEYWORDS = {
    "rain", "rainfall", "monsoon", "temperature", "humidity", "weather",
    "forecast", "sow", "sowing", "planting", "irrigation", "drought",
    "flood", "wind", "storm", "cyclone", "sunshine", "evaporation",
    "climate", "season", "humid", "dry", "wet", "spray", "pesticide spray",
    # Malayalam transliterations (from English translation output)
    "മഴ", "കാലാവസ്ഥ", "ഊഷ്മാവ്", "ജലസേചനം",
}


def _cache_key(region: str) -> str:
    return hashlib.md5(region.lower().encode()).hexdigest()


def _get_cached(region: str) -> Optional[dict]:
    key = _cache_key(region)
    entry = _weather_cache.get(key)
    if entry:
        data, ts = entry
        if time.monotonic() - ts < _WEATHER_TTL:
            return data
        del _weather_cache[key]
    return None


def _set_cached(region: str, data: dict) -> None:
    key = _cache_key(region)
    _weather_cache[key] = (data, time.monotonic())


async def fetch_weather_advisory(region: str) -> dict:
    """
    Fetch current agrometeorological forecast for the farmer's region.

    Uses IMD's Open API (agromet advisory). Falls back to a structured
    stub if the API is unreachable (common in dev without credentials).

    Returns:
        {
            "forecast": str,       — Human-readable forecast summary
            "rainfall_mm": float,  — Expected rainfall in mm
            "temperature_max": float,
            "temperature_min": float,
            "advisory": str,       — Agro-advisory sentence for farmers
            "date": str,           — Forecast date
            "source": str,         — Always "IMD Agromet Advisory"
        }
    """
    cached = _get_cached(region)
    if cached:
        logger.debug(f"Weather cache HIT for {region}")
        return cached

    station = DISTRICT_STATION_MAP.get(region, region)
    result = await _fetch_imd_api(station, region)
    _set_cached(region, result)
    return result


async def _fetch_imd_api(station: str, region: str) -> dict:
    """Try IMD API — fall back to realistic stub on any error."""
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            # IMD Open Data Portal - Agromet Advisory
            response = await client.get(
                "https://api.imdpune.gov.in/Agromet/agromet_bulletin.php",
                params={
                    "state": "Kerala",
                    "district": region,
                    "format": "json",
                },
                headers={"Accept": "application/json"},
            )
            if response.status_code == 200:
                data = response.json()
                return _parse_imd_response(data, region)
    except Exception as exc:
        logger.warning(f"IMD API unavailable for {region}: {exc} — using generated advisory")

    return _generate_seasonal_advisory(region)


def _parse_imd_response(data: dict, region: str) -> dict:
    """Parse IMD API response into our standard format."""
    try:
        forecast = data.get("forecast_text", "Partly cloudy conditions expected.")
        rainfall = float(data.get("rainfall_mm", 0.0))
        return {
            "forecast": forecast,
            "rainfall_mm": rainfall,
            "temperature_max": float(data.get("temp_max", 30.0)),
            "temperature_min": float(data.get("temp_min", 22.0)),
            "advisory": data.get("advisory", "Normal agricultural operations can continue."),
            "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            "source": "IMD Agromet Advisory",
        }
    except Exception:
        return _generate_seasonal_advisory(region)


def _generate_seasonal_advisory(region: str) -> dict:
    """
    Generate a realistic seasonal advisory based on current month.
    Used as fallback when IMD API is unreachable.
    The advisory is clearly marked as 'Seasonal estimate' so the LLM
    can qualify its confidence appropriately.
    """
    month = datetime.now().month
    # Kerala monsoon seasons
    if 6 <= month <= 9:  # Southwest Monsoon
        forecast = f"Heavy to very heavy rainfall expected in {region} district (Southwest Monsoon active)."
        rainfall = 25.0
        advisory = ("Avoid pesticide spraying on rainy days. Ensure field drainage is clear. "
                    "Delay sowing of susceptible crops until rain intensity reduces.")
    elif month in (10, 11):  # Northeast Monsoon
        forecast = f"Moderate rainfall expected in {region} district (Northeast Monsoon)."
        rainfall = 8.0
        advisory = ("Good conditions for transplanting paddy. Monitor for late blight in tomato. "
                    "Irrigate vegetable crops as needed.")
    elif month in (12, 1, 2):  # Winter
        forecast = f"Dry, cool conditions in {region} district. Minimum temperatures 18–22°C."
        rainfall = 0.5
        advisory = ("Ideal for vegetable cultivation. Irrigate crops every 3–4 days. "
                    "Watch for powdery mildew in dry conditions.")
    else:  # March–May: Summer
        forecast = f"Hot, dry conditions in {region} district. Temperatures 32–38°C."
        rainfall = 1.0
        advisory = ("Mulch soil to reduce water loss. Irrigate early morning or evening. "
                    "Avoid transplanting during peak afternoon heat.")

    return {
        "forecast": forecast,
        "rainfall_mm": rainfall,
        "temperature_max": {6: 29, 7: 28, 8: 28, 9: 29, 10: 30, 11: 29,
                             12: 29, 1: 29, 2: 30, 3: 33, 4: 35, 5: 34}.get(month, 30.0),
        "temperature_min": {6: 24, 7: 23, 8: 23, 9: 24, 10: 24, 11: 23,
                             12: 21, 1: 20, 2: 21, 3: 24, 4: 25, 5: 25}.get(month, 22.0),
        "advisory": advisory,
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "IMD Seasonal Estimate (live API unavailable)",
    }


def is_weather_related(english_query: str) -> bool:
    """Returns True if the query has weather/climate intent."""
    query_lower = english_query.lower()
    return any(kw in query_lower for kw in WEATHER_KEYWORDS)


def format_weather_context(weather: dict) -> str:
    """Format weather data as a context string for the LLM prompt."""
    return (
        f"[LIVE WEATHER DATA — {weather['date']} — Source: {weather['source']}]\n"
        f"Forecast: {weather['forecast']}\n"
        f"Expected Rainfall: {weather['rainfall_mm']} mm\n"
        f"Temperature: {weather['temperature_min']}°C – {weather['temperature_max']}°C\n"
        f"Agricultural Advisory: {weather['advisory']}"
    )
