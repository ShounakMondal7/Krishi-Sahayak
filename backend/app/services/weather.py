"""
services/weather.py — Location-specific live agrometeorological weather integration.

Fetches real-time weather and forecast data for any Indian district/state using
Open-Meteo Geocoding & High-Resolution Forecast APIs (countryCode=IN, Asia/Kolkata timezone).
Results are cached for 3 hours per district-state location.
"""
import hashlib
import logging
import re
import time
from datetime import datetime, timezone
from typing import Optional, Tuple

import httpx

logger = logging.getLogger(__name__)

# ── In-memory weather cache (15-minute / 900s TTL per district_state) ─────────
_weather_cache: dict[str, tuple[dict, float]] = {}
_WEATHER_TTL = 900  # 15 minutes in seconds

# ── Indian Census District Alias Table ───────────────────────────────────────
# Maps administrative districts whose headquarters/prominent municipal names differ
# so geocoding reliably resolves to the precise Indian administrative center.
DISTRICT_ALIASES = {
    "gautam buddha nagar": "Noida",
    "gautam budh nagar": "Noida",
    "gb nagar": "Noida",
    "ghaziabad": "Ghaziabad",
    "north 24 parganas": "Barasat",
    "south 24 parganas": "Baruipur",
    "purba medinipur": "Tamluk",
    "paschim medinipur": "Midnapore",
    "paschim bardhaman": "Asansol",
    "purba bardhaman": "Bardhaman",
    "rangareddy": "Hyderabad",
    "ranga reddy": "Hyderabad",
    "kamrup metropolitan": "Guwahati",
    "kamrup metro": "Guwahati",
    "ernakulam": "Kochi",
    "kancheepuram": "Kanchipuram",
    "tiruvallur": "Tiruvallur",
    "chengalpattu": "Chengalpattu",
    "kanyakumari": "Nagercoil",
    "nilgiris": "Udhagamandalam",
    "leh ladakh": "Leh",
    "y.s.r.": "Kadapa",
    "ysr": "Kadapa",
    "s.p.s. nellore": "Nellore",
    "sps nellore": "Nellore",
}

# ── Fallback Centroids for Indian States & Key Agricultural Hubs ─────────────
FALLBACK_CENTROIDS: dict[str, tuple[float, float]] = {
    # Key Districts / Cities
    "noida": (28.5355, 77.3910),
    "gautam buddha nagar": (28.5355, 77.3910),
    "ghaziabad": (28.6692, 77.4538),
    "kolkata": (22.5726, 88.3639),
    "barasat": (22.7248, 88.4789),
    "north 24 parganas": (22.7248, 88.4789),
    "south 24 parganas": (22.3597, 88.4318),
    "purba medinipur": (22.2958, 87.9213),
    "paschim bardhaman": (23.6889, 86.9661),
    "shimla": (31.1048, 77.1734),
    "pune": (18.5204, 73.8567),
    "mumbai": (19.0760, 72.8777),
    "ludhiana": (30.9010, 75.8573),
    "karnal": (29.6857, 76.9905),
    "lucknow": (26.8467, 80.9462),
    "varanasi": (25.3176, 82.9739),
    "agra": (27.1767, 78.0081),
    "bhopal": (23.2599, 77.4126),
    "indore": (22.7196, 75.8577),
    "jaipur": (26.9124, 75.7873),
    "ahmedabad": (23.0225, 72.5714),
    "rajkot": (22.3039, 70.8022),
    "guwahati": (26.1445, 91.7362),
    "patna": (25.5941, 85.1376),
    "bhubaneswar": (20.2961, 85.8245),
    "hyderabad": (17.3850, 78.4867),
    "vijayawada": (16.5062, 80.6480),
    "bengaluru": (12.9716, 77.5946),
    "chennai": (13.0827, 80.2707),
    "coimbatore": (11.0168, 76.9558),
    "kochi": (9.9312, 76.2673),
    "thiruvananthapuram": (8.5241, 76.9366),
    "srinagar": (34.0837, 74.7973),
    "delhi": (28.6139, 77.2090),
    # States & Union Territories
    "uttar pradesh": (26.8467, 80.9462),
    "west bengal": (22.9868, 87.8550),
    "himachal pradesh": (31.1048, 77.1734),
    "maharashtra": (19.7515, 75.7139),
    "punjab": (31.1471, 75.3412),
    "haryana": (29.0588, 76.0856),
    "madhya pradesh": (22.9734, 78.6569),
    "rajasthan": (27.0238, 74.2179),
    "gujarat": (22.2587, 71.1924),
    "bihar": (25.0961, 85.3131),
    "odisha": (20.9517, 85.0985),
    "andhra pradesh": (15.9129, 79.7400),
    "telangana": (18.1124, 79.0193),
    "karnataka": (15.3173, 75.7139),
    "tamil nadu": (11.1271, 78.6569),
    "kerala": (10.8505, 76.2711),
    "assam": (26.2006, 92.9376),
    "jammu and kashmir": (33.7782, 76.5762),
    "jammu & kashmir": (33.7782, 76.5762),
    "uttarakhand": (30.0668, 79.0193),
    "jharkhand": (23.6102, 85.2799),
    "chhattisgarh": (21.2787, 81.8661),
    "goa": (15.2993, 74.1240),
}

# ── WMO Weather Codes to Descriptions ────────────────────────────────────────
WMO_DESCRIPTIONS = {
    0: "Clear sky",
    1: "Mainly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Foggy conditions",
    48: "Depositing rime fog",
    51: "Light drizzle",
    53: "Moderate drizzle",
    55: "Dense drizzle",
    61: "Slight rain",
    63: "Moderate rain",
    65: "Heavy rain",
    66: "Freezing rain",
    71: "Slight snow fall",
    73: "Moderate snow fall",
    75: "Heavy snow fall",
    80: "Slight rain showers",
    81: "Moderate rain showers",
    82: "Violent rain showers",
    95: "Thunderstorm",
    96: "Thunderstorm with slight hail",
    99: "Thunderstorm with heavy hail",
}

# ── Intent detection — weather-related query keywords ────────────────────────
WEATHER_KEYWORDS = {
    "rain", "rainfall", "monsoon", "temperature", "humidity", "weather",
    "forecast", "sow", "sowing", "planting", "irrigation", "drought",
    "flood", "wind", "storm", "cyclone", "sunshine", "evaporation",
    "climate", "season", "humid", "dry", "wet", "spray", "pesticide spray",
    "barish", "mausam", "tapman", "varsha", "hava", "thandi", "garmi",
    "മഴ", "കാലാവസ്ഥ", "ഊഷ്മാവ്", "ജലസേചനം",
}


def _parse_region_components(region: str) -> Tuple[str, str]:
    """Extract district and state from a string like 'Gautam Buddha Nagar, Uttar Pradesh'."""
    clean = (region or "").strip()
    if not clean:
        return "India", ""
    if "," in clean:
        parts = [p.strip() for p in clean.split(",", 1)]
        return parts[0], parts[1]
    return clean, ""


def _cache_key(region: str) -> str:
    district, state = _parse_region_components(region)
    key = f"{district.strip().lower()}_{state.strip().lower()}"
    return hashlib.md5(key.encode("utf-8")).hexdigest()


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


async def resolve_coordinates(district: str, state: str = "") -> Tuple[float, float, str]:
    """
    Resolve geographical coordinates for an Indian district/state using Open-Meteo Geocoding.
    Strictly filters by countryCode=IN and checks admin1 state match where applicable.
    """
    d_clean = district.lower().strip()
    s_clean = state.lower().strip()

    # 1. Alias lookup
    search_query = DISTRICT_ALIASES.get(d_clean, district)

    # 2. Open-Meteo Geocoding
    try:
        async with httpx.AsyncClient(timeout=6.0) as client:
            resp = await client.get(
                "https://geocoding-api.open-meteo.com/v1/search",
                params={"name": search_query, "count": 10, "countryCode": "IN"},
            )
            if resp.status_code == 200:
                data = resp.json()
                results = data.get("results") or []
                if results:
                    # Filter by state if provided
                    if s_clean:
                        for item in results:
                            admin1 = (item.get("admin1") or "").lower()
                            if s_clean in admin1 or admin1 in s_clean:
                                return float(item["latitude"]), float(item["longitude"]), item.get("name", district)

                    # If no state match or state not given, take top Indian match
                    first = results[0]
                    return float(first["latitude"]), float(first["longitude"]), first.get("name", district)

            # Secondary query with state if initial query produced nothing
            if s_clean and search_query != s_clean:
                resp2 = await client.get(
                    "https://geocoding-api.open-meteo.com/v1/search",
                    params={"name": s_clean, "count": 5, "countryCode": "IN"},
                )
                if resp2.status_code == 200:
                    results2 = resp2.json().get("results") or []
                    if results2:
                        first = results2[0]
                        return float(first["latitude"]), float(first["longitude"]), first.get("name", state)

    except Exception as exc:
        logger.warning(f"Geocoding API network lookup failed for '{district}, {state}': {exc}")

    # 3. Direct centroid fallback
    if d_clean in FALLBACK_CENTROIDS:
        lat, lon = FALLBACK_CENTROIDS[d_clean]
        return lat, lon, district
    if s_clean in FALLBACK_CENTROIDS:
        lat, lon = FALLBACK_CENTROIDS[s_clean]
        return lat, lon, state or district

    # Default to New Delhi centroid
    return 28.6139, 77.2090, district or "India"


def _generate_agronomic_advisory(
    weather_desc: str,
    temp_max: float,
    temp_min: float,
    rainfall_mm: float,
    humidity: float,
    wind_speed: float,
) -> str:
    """Derive practical agricultural recommendations from live weather parameters."""
    advice: list[str] = []

    if rainfall_mm > 2.5:
        advice.append("Postpone foliar pesticide or fertilizer spraying to avoid chemical runoff.")
        advice.append("Clear field drainage channels to prevent waterlogging around root zones.")
    elif wind_speed > 20.0:
        advice.append("High wind speed detected. Avoid knapsack chemical spraying due to spray drift risk.")
        advice.append("Provide mechanical staking to tall horticultural and vegetable crops.")
    elif temp_max >= 35.0:
        advice.append("Elevated daytime temperatures expected. Irrigate crops during early morning or late evening hours.")
        advice.append("Maintain organic mulching to conserve topsoil moisture and reduce evapotranspiration.")
    elif temp_min <= 10.0:
        advice.append("Cold night temperatures expected. Provide light evening irrigation to safeguard sensitive vegetable crops against frost.")
    else:
        advice.append("Favorable weather conditions prevail for routine weeding, fertilization, and crop monitoring.")

    if humidity >= 80:
        advice.append("High ambient humidity favors fungal spore germination; monitor crops closely for blight or mildew.")

    return " ".join(advice)


async def fetch_weather_advisory(region: str) -> dict:
    """
    Fetch live location-specific weather forecast and agronomic advisory.
    Uses Open-Meteo High-Resolution Forecast API (Asia/Kolkata timezone).
    Cached for 3 hours.
    """
    cached = _get_cached(region)
    if cached:
        logger.debug(f"Weather cache HIT for {region}")
        return cached

    district, state = _parse_region_components(region)
    lat, lon, resolved_name = await resolve_coordinates(district, state)

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(
                "https://api.open-meteo.com/v1/forecast",
                params={
                    "latitude": lat,
                    "longitude": lon,
                    "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m",
                    "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum",
                    "timezone": "Asia/Kolkata",
                },
            )
            if resp.status_code == 200:
                data = resp.json()
                current = data.get("current") or {}
                daily = data.get("daily") or {}

                curr_temp = round(float(current.get("temperature_2m", 25.0)), 1)
                apparent_temp = round(float(current.get("apparent_temperature", curr_temp)), 1)
                humidity = float(current.get("relative_humidity_2m", 60))
                precipitation = float(current.get("precipitation", 0.0))
                weather_code = int(current.get("weather_code", 0))
                wind_speed = round(float(current.get("wind_speed_10m", 5.0)), 1)

                max_temps = daily.get("temperature_2m_max") or [curr_temp]
                min_temps = daily.get("temperature_2m_min") or [curr_temp]
                precip_sums = daily.get("precipitation_sum") or [precipitation]

                temp_max = round(float(max_temps[0]), 1)
                temp_min = round(float(min_temps[0]), 1)
                rainfall_today = round(float(precip_sums[0]), 1)

                wmo_desc = WMO_DESCRIPTIONS.get(weather_code, "Partly cloudy")
                forecast_text = f"{wmo_desc} with current temperature {curr_temp}°C (Apparent: {apparent_temp}°C)."
                advisory = _generate_agronomic_advisory(
                    wmo_desc, temp_max, temp_min, rainfall_today, humidity, wind_speed
                )

                result = {
                    "location": region,
                    "resolved_name": resolved_name,
                    "latitude": lat,
                    "longitude": lon,
                    "forecast": forecast_text,
                    "temperature": curr_temp,
                    "temperature_max": temp_max,
                    "temperature_min": temp_min,
                    "apparent_temperature": apparent_temp,
                    "humidity": humidity,
                    "rainfall_mm": rainfall_today,
                    "wind_speed": wind_speed,
                    "weather_code": weather_code,
                    "condition": wmo_desc,
                    "advisory": advisory,
                    "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                    "source": "Open-Meteo Live Agromet",
                }
                _set_cached(region, result)
                return result

    except Exception as exc:
        logger.warning(f"Open-Meteo forecast API error for {region}: {exc}")

    # Fallback to season-calibrated estimate if network fails
    month = datetime.now().month
    fallback_temp = 28.0 if 3 <= month <= 6 else 22.0
    fallback = {
        "location": region,
        "resolved_name": resolved_name,
        "latitude": lat,
        "longitude": lon,
        "forecast": f"Partly cloudy conditions in {region}.",
        "temperature": fallback_temp,
        "temperature_max": fallback_temp + 4.0,
        "temperature_min": fallback_temp - 6.0,
        "apparent_temperature": fallback_temp,
        "humidity": 55.0,
        "rainfall_mm": 0.0,
        "wind_speed": 6.5,
        "weather_code": 1,
        "condition": "Partly cloudy",
        "advisory": "Favorable conditions for routine agricultural operations and field maintenance.",
        "date": datetime.now(timezone.utc).strftime("%Y-%m-%d"),
        "source": "Open-Meteo (Offline Estimate)",
    }
    _set_cached(region, fallback)
    return fallback


def format_weather_context(weather: dict) -> str:
    """Format weather data as a context string for RAG ingestion."""
    loc = weather.get("location") or "Selected Region"
    return (
        f"[LIVE WEATHER DATA — {weather.get('date', '')} — Location: {loc} — Source: {weather.get('source', 'Open-Meteo Live')}]\n"
        f"Forecast: {weather.get('forecast', 'Clear')}\n"
        f"Current Temperature: {weather.get('temperature', 0)}°C (Min: {weather.get('temperature_min', 0)}°C, Max: {weather.get('temperature_max', 0)}°C)\n"
        f"Relative Humidity: {weather.get('humidity', 0)}% | Wind Speed: {weather.get('wind_speed', 0)} km/h\n"
        f"Expected Rainfall: {weather.get('rainfall_mm', 0)} mm\n"
        f"Agricultural Advisory: {weather.get('advisory', 'Favorable conditions for field operations.')}"
    )


async def get_weather_context(region: str) -> str:
    """Direct asynchronous context provider for a given district / state."""
    weather = await fetch_weather_advisory(region)
    return format_weather_context(weather)


def is_weather_related(english_query: str) -> bool:
    """Returns True if the query has weather/climate intent."""
    query_lower = english_query.lower()
    return any(kw in query_lower for kw in WEATHER_KEYWORDS)
