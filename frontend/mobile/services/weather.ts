/**
 * weather.ts — Real-time agricultural weather service via Open-Meteo API.
 *
 * Free, no API key required. Resolves Indian districts using Open-Meteo Geocoding
 * (countryCode=IN, admin1 filtering) and fetches high-resolution current weather & forecast.
 *
 * WMO Weather Interpretation Codes:
 *   0: Clear sky, 1-3: Mainly clear/partly cloudy/overcast,
 *   45-48: Fog, 51-55: Drizzle, 56-57: Freezing drizzle,
 *   61-65: Rain, 66-67: Freezing rain, 71-77: Snow/grain,
 *   80-82: Rain showers, 85-86: Snow showers, 95-99: Thunderstorm
 */

// ── District Alias Table ───────────────────────────────────────────────────
// Maps administrative districts whose headquarters have a different city name
export const DISTRICT_ALIASES: Record<string, string> = {
  'gautam buddha nagar': 'Noida',
  'gautam budh nagar': 'Noida',
  'gb nagar': 'Noida',
  'ghaziabad': 'Ghaziabad',
  'north 24 parganas': 'Barasat',
  'south 24 parganas': 'Baruipur',
  'purba medinipur': 'Tamluk',
  'paschim medinipur': 'Midnapore',
  'paschim bardhaman': 'Asansol',
  'purba bardhaman': 'Bardhaman',
  'rangareddy': 'Hyderabad',
  'ranga reddy': 'Hyderabad',
  'kamrup metropolitan': 'Guwahati',
  'kamrup metro': 'Guwahati',
  'ernakulam': 'Kochi',
  'kancheepuram': 'Kanchipuram',
  'tiruvallur': 'Tiruvallur',
  'chengalpattu': 'Chengalpattu',
  'kanyakumari': 'Nagercoil',
  'nilgiris': 'Udhagamandalam',
  'leh ladakh': 'Leh',
  'y.s.r.': 'Kadapa',
  'ysr': 'Kadapa',
  's.p.s. nellore': 'Nellore',
  'sps nellore': 'Nellore',
};

// ── District Centroid Fallbacks ────────────────────────────────────────────
const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
  // Key Agricultural Hubs
  'Noida': { lat: 28.5355, lon: 77.3910 },
  'Gautam Buddha Nagar': { lat: 28.5355, lon: 77.3910 },
  'Ghaziabad': { lat: 28.6692, lon: 77.4538 },
  'Kolkata': { lat: 22.5726, lon: 88.3639 },
  'Barasat': { lat: 22.7248, lon: 88.4789 },
  'North 24 Parganas': { lat: 22.7248, lon: 88.4789 },
  'South 24 Parganas': { lat: 22.3597, lon: 88.4318 },
  'Purba Medinipur': { lat: 22.2958, lon: 87.9213 },
  'Paschim Bardhaman': { lat: 23.6889, lon: 86.9661 },
  'Shimla': { lat: 31.1048, lon: 77.1734 },
  'Pune': { lat: 18.5204, lon: 73.8567 },
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Ludhiana': { lat: 30.9010, lon: 75.8573 },
  'Karnal': { lat: 29.6857, lon: 76.9905 },
  'Lucknow': { lat: 26.8467, lon: 80.9462 },
  'Varanasi': { lat: 25.3176, lon: 82.9739 },
  'Agra': { lat: 27.1767, lon: 78.0081 },
  'Bhopal': { lat: 23.2599, lon: 77.4126 },
  'Indore': { lat: 22.7196, lon: 75.8577 },
  'Jaipur': { lat: 26.9124, lon: 75.7873 },
  'Ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'Rajkot': { lat: 22.3039, lon: 70.8022 },
  'Guwahati': { lat: 26.1445, lon: 91.7362 },
  'Patna': { lat: 25.5941, lon: 85.1376 },
  'Bhubaneswar': { lat: 20.2961, lon: 85.8245 },
  'Hyderabad': { lat: 17.3850, lon: 78.4867 },
  'Bengaluru': { lat: 12.9716, lon: 77.5946 },
  'Chennai': { lat: 13.0827, lon: 80.2707 },
  'Coimbatore': { lat: 11.0168, lon: 76.9558 },
  'Kochi': { lat: 9.9312, lon: 76.2673 },
  'Ernakulam': { lat: 9.9312, lon: 76.2673 },
  'Thiruvananthapuram': { lat: 8.5241, lon: 76.9366 },
  'Srinagar': { lat: 34.0837, lon: 74.7973 },
  'Delhi': { lat: 28.6139, lon: 77.2090 },
};

// ── State Centroid Fallbacks ───────────────────────────────────────────────
const STATE_COORDS: Record<string, { lat: number; lon: number }> = {
  'Uttar Pradesh': { lat: 26.8467, lon: 80.9462 },
  'West Bengal': { lat: 22.9868, lon: 87.8550 },
  'Himachal Pradesh': { lat: 31.1048, lon: 77.1734 },
  'Maharashtra': { lat: 19.7515, lon: 75.7139 },
  'Punjab': { lat: 31.1471, lon: 75.3412 },
  'Haryana': { lat: 29.0588, lon: 76.0856 },
  'Madhya Pradesh': { lat: 22.9734, lon: 78.6569 },
  'Rajasthan': { lat: 27.0238, lon: 74.2179 },
  'Gujarat': { lat: 22.2587, lon: 71.1924 },
  'Bihar': { lat: 25.0961, lon: 85.3131 },
  'Odisha': { lat: 20.9517, lon: 85.0985 },
  'Andhra Pradesh': { lat: 15.9129, lon: 79.7400 },
  'Telangana': { lat: 18.1124, lon: 79.0193 },
  'Karnataka': { lat: 15.3173, lon: 75.7139 },
  'Tamil Nadu': { lat: 11.1271, lon: 78.6569 },
  'Kerala': { lat: 10.8505, lon: 76.2711 },
  'Assam': { lat: 26.2006, lon: 92.9376 },
  'Jammu and Kashmir': { lat: 33.7782, lon: 76.5762 },
  'Jammu & Kashmir': { lat: 33.7782, lon: 76.5762 },
  'Uttarakhand': { lat: 30.0668, lon: 79.0193 },
  'Jharkhand': { lat: 23.6102, lon: 85.2799 },
  'Chhattisgarh': { lat: 21.2787, lon: 81.8661 },
  'Goa': { lat: 15.2993, lon: 74.1240 },
};

// ── WMO Weather Code → Emoji + Description Mapping ──────────────────────────
export const WMO_WEATHER: Record<number, { icon: string; description: string }> = {
  0: { icon: '☀️', description: 'Clear sky' },
  1: { icon: '🌤️', description: 'Mainly clear' },
  2: { icon: '⛅', description: 'Partly cloudy' },
  3: { icon: '☁️', description: 'Overcast' },
  45: { icon: '🌫️', description: 'Fog' },
  48: { icon: '🌫️', description: 'Rime fog' },
  51: { icon: '🌧️', description: 'Light drizzle' },
  53: { icon: '🌧️', description: 'Moderate drizzle' },
  55: { icon: '🌧️', description: 'Dense drizzle' },
  56: { icon: '🌧️', description: 'Freezing drizzle' },
  57: { icon: '🌧️', description: 'Freezing drizzle' },
  61: { icon: '🌧️', description: 'Slight rain' },
  63: { icon: '🌧️', description: 'Moderate rain' },
  65: { icon: '🌧️', description: 'Heavy rain' },
  66: { icon: '🌧️', description: 'Freezing rain' },
  67: { icon: '🌧️', description: 'Freezing rain' },
  71: { icon: '🌨️', description: 'Slight snow' },
  73: { icon: '🌨️', description: 'Moderate snow' },
  75: { icon: '🌨️', description: 'Heavy snow' },
  77: { icon: '🌨️', description: 'Snow grains' },
  80: { icon: '🌧️', description: 'Rain showers' },
  81: { icon: '🌧️', description: 'Heavy rain showers' },
  82: { icon: '🌧️', description: 'Violent rain showers' },
  85: { icon: '🌨️', description: 'Snow showers' },
  86: { icon: '🌨️', description: 'Heavy snow showers' },
  95: { icon: '⛈️', description: 'Thunderstorm' },
  96: { icon: '⛈️', description: 'Thunderstorm with hail' },
  99: { icon: '⛈️', description: 'Heavy thunderstorm' },
};

// ── Types ──────────────────────────────────────────────────────────────────
export interface WeatherData {
  temperature: number | null;
  weatherCode: number | null;
  description: string;
  icon: string;
  windSpeed: number;
  isDay: boolean;
  fetchedAt: number; // timestamp ms
  isAvailable?: boolean;
}

export const WEATHER_UNAVAILABLE_FALLBACK: WeatherData = {
  temperature: null,
  weatherCode: null,
  description: 'Weather unavailable',
  icon: '⛅',
  windSpeed: 0,
  isDay: true,
  fetchedAt: Date.now(),
  isAvailable: false,
};

// ── Caches ─────────────────────────────────────────────────────────────────
let cachedWeather: WeatherData | null = null;
let cachedLocationKey: string = '';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

// In-memory resolved coords cache so geocoding only runs once per location
const resolvedCoordsCache: Record<string, { lat: number; lon: number }> = {};

/**
 * Resolve lat/lon for district + state via Open-Meteo Geocoding.
 * Uses alias mapping and filters results by countryCode=IN and admin1.
 */
async function resolveLocationCoordinates(
  state: string,
  district: string
): Promise<{ lat: number; lon: number }> {
  const normDistrict = district.trim();
  const normState = state.trim();
  const lookupKey = `${normDistrict.toLowerCase()}_${normState.toLowerCase()}`;

  if (resolvedCoordsCache[lookupKey]) {
    return resolvedCoordsCache[lookupKey];
  }

  // 1. Direct alias resolution
  const dLower = normDistrict.toLowerCase();
  const searchQuery = DISTRICT_ALIASES[dLower] || normDistrict;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 4000);

    const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(
      searchQuery
    )}&count=10&countryCode=IN`;

    const res = await fetch(geoUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      const data = await res.json();
      const results: any[] = data?.results || [];

      if (results.length > 0) {
        // Filter by state admin1
        if (normState) {
          const sLower = normState.toLowerCase();
          const matched = results.find((r) => {
            const admin = (r.admin1 || '').toLowerCase();
            return admin.includes(sLower) || sLower.includes(admin);
          });
          if (matched) {
            const coords = { lat: matched.latitude, lon: matched.longitude };
            resolvedCoordsCache[lookupKey] = coords;
            return coords;
          }
        }

        // Top Indian result fallback
        const first = results[0];
        const coords = { lat: first.latitude, lon: first.longitude };
        resolvedCoordsCache[lookupKey] = coords;
        return coords;
      }
    }
  } catch (err) {
    console.warn(`Geocoding failed for ${normDistrict}, ${normState}:`, err);
  }

  // 2. Centroid fallback
  const fallback =
    DISTRICT_COORDS[normDistrict] ||
    DISTRICT_COORDS[searchQuery] ||
    STATE_COORDS[normState] || { lat: 28.6139, lon: 77.2090 }; // Delhi default

  resolvedCoordsCache[lookupKey] = fallback;
  return fallback;
}

/**
 * Fetch current weather for a given state + district from Open-Meteo API.
 * Optionally accepts exact coordinates (e.g. from GPS).
 * Results are cached for 30 minutes per location.
 */
export async function fetchWeather(
  state: string,
  district: string,
  coordsOverride?: { lat: number; lon: number }
): Promise<WeatherData | null> {
  const normDistrict = district?.trim() || '';
  const normState = state?.trim() || '';

  const locationKey = coordsOverride
    ? `coords_${coordsOverride.lat.toFixed(3)}_${coordsOverride.lon.toFixed(3)}`
    : `${normDistrict.toLowerCase()}_${normState.toLowerCase()}`;

  // Return cached result if still fresh
  if (
    cachedWeather &&
    cachedLocationKey === locationKey &&
    Date.now() - cachedWeather.fetchedAt < CACHE_DURATION_MS
  ) {
    return cachedWeather;
  }

  const coords = coordsOverride || (await resolveLocationCoordinates(normState, normDistrict));

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const forecastUrl = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current=temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,precipitation_sum&timezone=Asia%2FKolkata`;

    const res = await fetch(forecastUrl, { signal: controller.signal });
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const current = data.current;

    if (!current) throw new Error('Missing current weather data');

    const code = current.weather_code ?? 0;
    const wmoEntry = WMO_WEATHER[code] || { icon: '⛅', description: 'Partly cloudy' };

    const result: WeatherData = {
      temperature: Math.round(current.temperature_2m),
      weatherCode: code,
      description: wmoEntry.description,
      icon: wmoEntry.icon,
      windSpeed: Math.round(current.wind_speed_10m || 0),
      isDay: true,
      fetchedAt: Date.now(),
      isAvailable: true,
    };

    cachedWeather = result;
    cachedLocationKey = locationKey;
    return result;
  } catch (err) {
    console.warn('Weather fetch failed for location:', locationKey, err);
    return WEATHER_UNAVAILABLE_FALLBACK;
  }
}

/**
 * Force invalidate the weather cache (e.g. when location changes).
 */
export function invalidateWeatherCache(): void {
  cachedWeather = null;
  cachedLocationKey = '';
}
