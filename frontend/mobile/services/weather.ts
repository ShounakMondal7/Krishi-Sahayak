/**
 * weather.ts — Real-time agricultural weather service via Open-Meteo API.
 *
 * Free, no API key required. Returns current temperature, weather condition,
 * and descriptive emoji for any Indian district/state.
 *
 * WMO Weather Interpretation Codes:
 *   0: Clear sky, 1-3: Mainly clear/partly cloudy/overcast,
 *   45-48: Fog, 51-55: Drizzle, 56-57: Freezing drizzle,
 *   61-65: Rain, 66-67: Freezing rain, 71-77: Snow/grain,
 *   80-82: Rain showers, 85-86: Snow showers, 95-99: Thunderstorm
 */

// ── District Coordinates (Centroids for key agricultural districts) ──────
const DISTRICT_COORDS: Record<string, { lat: number; lon: number }> = {
  // Punjab
  'Ludhiana': { lat: 30.9010, lon: 75.8573 },
  'Amritsar': { lat: 31.6340, lon: 74.8723 },
  'Jalandhar': { lat: 31.3260, lon: 75.5762 },
  'Patiala': { lat: 30.3398, lon: 76.3869 },
  'Bathinda': { lat: 30.2110, lon: 74.9455 },
  'Sangrur': { lat: 30.2506, lon: 75.8412 },
  'Firozpur': { lat: 30.9331, lon: 74.6225 },
  'Moga': { lat: 30.8164, lon: 75.1742 },

  // Haryana
  'Karnal': { lat: 29.6857, lon: 76.9905 },
  'Hisar': { lat: 29.1492, lon: 75.7217 },
  'Ambala': { lat: 30.3782, lon: 76.7767 },
  'Sirsa': { lat: 29.5349, lon: 75.0284 },
  'Rohtak': { lat: 28.8955, lon: 76.6066 },
  'Kurukshetra': { lat: 29.9695, lon: 76.8783 },

  // Uttar Pradesh
  'Varanasi': { lat: 25.3176, lon: 82.9739 },
  'Lucknow': { lat: 26.8467, lon: 80.9462 },
  'Kanpur': { lat: 26.4499, lon: 80.3319 },
  'Prayagraj': { lat: 25.4358, lon: 81.8463 },
  'Meerut': { lat: 28.9845, lon: 77.7064 },
  'Agra': { lat: 27.1767, lon: 78.0081 },
  'Gorakhpur': { lat: 26.7606, lon: 83.3732 },
  'Gautam Buddha Nagar': { lat: 28.5355, lon: 77.3910 },
  'Noida': { lat: 28.5355, lon: 77.3910 },

  // Maharashtra
  'Pune': { lat: 18.5204, lon: 73.8567 },
  'Nashik': { lat: 19.9975, lon: 73.7898 },
  'Nagpur': { lat: 21.1458, lon: 79.0882 },
  'Kolhapur': { lat: 16.7050, lon: 74.2433 },
  'Solapur': { lat: 17.6599, lon: 75.9064 },
  'Ahmednagar': { lat: 19.0948, lon: 74.7480 },
  'Chhatrapati Sambhajinagar': { lat: 19.8762, lon: 75.3433 },

  // Gujarat
  'Rajkot': { lat: 22.3039, lon: 70.8022 },
  'Surat': { lat: 21.1702, lon: 72.8311 },
  'Ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'Vadodara': { lat: 22.3072, lon: 73.1812 },
  'Bhavnagar': { lat: 21.7645, lon: 72.1519 },
  'Junagadh': { lat: 21.5222, lon: 70.4579 },
  'Anand': { lat: 22.5645, lon: 72.9289 },

  // Kerala
  'Thrissur': { lat: 10.5276, lon: 76.2144 },
  'Palakkad': { lat: 10.7867, lon: 76.6548 },
  'Wayanad': { lat: 11.6854, lon: 76.1320 },
  'Ernakulam': { lat: 9.9816, lon: 76.2999 },
  'Kozhikode': { lat: 11.2588, lon: 75.7804 },
  'Alappuzha': { lat: 9.4981, lon: 76.3388 },
  'Thiruvananthapuram': { lat: 8.5241, lon: 76.9366 },
  'Idukki': { lat: 9.8494, lon: 76.9710 },

  // Tamil Nadu
  'Thanjavur': { lat: 10.7870, lon: 79.1378 },
  'Coimbatore': { lat: 11.0168, lon: 76.9558 },
  'Madurai': { lat: 9.9252, lon: 78.1198 },
  'Tiruchirappalli': { lat: 10.7905, lon: 78.7047 },
  'Salem': { lat: 11.6643, lon: 78.1460 },
  'Erode': { lat: 11.3410, lon: 77.7172 },

  // Karnataka
  'Mysuru': { lat: 12.2958, lon: 76.6394 },
  'Belagavi': { lat: 15.8497, lon: 74.4977 },
  'Shivamogga': { lat: 13.9299, lon: 75.5681 },
  'Dharwad': { lat: 15.4589, lon: 75.0078 },
  'Mandya': { lat: 12.5218, lon: 76.8951 },
  'Hassan': { lat: 13.0067, lon: 76.1003 },
  'Chikkamagaluru': { lat: 13.3161, lon: 75.7720 },

  // Andhra Pradesh
  'Guntur': { lat: 16.3067, lon: 80.4365 },
  'Krishna': { lat: 16.5730, lon: 80.6800 },
  'East Godavari': { lat: 17.3212, lon: 82.0400 },
  'Kurnool': { lat: 15.8281, lon: 78.0373 },
  'Visakhapatnam': { lat: 17.6868, lon: 83.2185 },
  'Chittoor': { lat: 13.2172, lon: 79.1003 },

  // Telangana
  'Warangal': { lat: 17.9689, lon: 79.5941 },
  'Karimnagar': { lat: 18.4386, lon: 79.1288 },
  'Nizamabad': { lat: 18.6725, lon: 78.0940 },
  'Khammam': { lat: 17.2473, lon: 80.1514 },
  'Nalgonda': { lat: 17.0500, lon: 79.2700 },

  // West Bengal
  'Purba Bardhaman': { lat: 23.2324, lon: 87.8615 },
  'Hooghly': { lat: 22.9080, lon: 88.2400 },
  'Murshidabad': { lat: 24.1867, lon: 88.2500 },
  'Nadia': { lat: 23.4710, lon: 88.5565 },
  'Darjeeling': { lat: 27.0410, lon: 88.2663 },
  'Malda': { lat: 25.0108, lon: 88.1411 },

  // Madhya Pradesh
  'Indore': { lat: 22.7196, lon: 75.8577 },
  'Ujjain': { lat: 23.1765, lon: 75.7885 },
  'Bhopal': { lat: 23.2599, lon: 77.4126 },
  'Jabalpur': { lat: 23.1815, lon: 79.9864 },
  'Gwalior': { lat: 26.2183, lon: 78.1828 },
  'Sagar': { lat: 23.8388, lon: 78.7378 },

  // Rajasthan
  'Jaipur': { lat: 26.9124, lon: 75.7873 },
  'Jodhpur': { lat: 26.2389, lon: 73.0243 },
  'Kota': { lat: 25.2138, lon: 75.8648 },
  'Bikaner': { lat: 28.0229, lon: 73.3119 },
  'Sri Ganganagar': { lat: 29.9038, lon: 73.8772 },
  'Udaipur': { lat: 24.5854, lon: 73.7125 },

  // Bihar
  'Patna': { lat: 25.5941, lon: 85.1376 },
  'Muzaffarpur': { lat: 26.1209, lon: 85.3647 },
  'Gaya': { lat: 24.7955, lon: 84.9994 },
  'Bhagalpur': { lat: 25.2425, lon: 86.9842 },
  'Darbhanga': { lat: 26.1542, lon: 85.8918 },
  'Purnia': { lat: 25.7771, lon: 87.4753 },

  // Odisha
  'Cuttack': { lat: 20.4625, lon: 85.8828 },
  'Balasore': { lat: 21.4934, lon: 86.9135 },
  'Sambalpur': { lat: 21.4669, lon: 83.9812 },
  'Bargarh': { lat: 21.3395, lon: 83.6151 },
  'Ganjam': { lat: 19.5800, lon: 84.4800 },
  'Puri': { lat: 19.8135, lon: 85.8312 },

  // Assam
  'Kamrup': { lat: 26.3400, lon: 91.5600 },
  'Dibrugarh': { lat: 27.4728, lon: 94.9120 },
  'Nagaon': { lat: 26.3464, lon: 92.6837 },
  'Jorhat': { lat: 26.7509, lon: 94.2037 },
  'Tinsukia': { lat: 27.4860, lon: 95.3557 },

  // Jammu & Kashmir
  'Srinagar': { lat: 34.0837, lon: 74.7973 },
  'Jammu': { lat: 32.7266, lon: 74.8570 },
  'Baramulla': { lat: 34.2090, lon: 74.3436 },
  'Anantnag': { lat: 33.7311, lon: 75.1487 },
  'Pulwama': { lat: 33.8718, lon: 74.9006 },
};

// State-level fallback coordinates
const STATE_COORDS: Record<string, { lat: number; lon: number }> = {
  'Punjab': { lat: 30.9010, lon: 75.8573 },
  'Haryana': { lat: 29.6857, lon: 76.9905 },
  'Uttar Pradesh': { lat: 26.8467, lon: 80.9462 },
  'Maharashtra': { lat: 18.5204, lon: 73.8567 },
  'Gujarat': { lat: 22.3039, lon: 70.8022 },
  'Kerala': { lat: 10.5276, lon: 76.2144 },
  'Tamil Nadu': { lat: 10.7870, lon: 79.1378 },
  'Karnataka': { lat: 12.2958, lon: 76.6394 },
  'Andhra Pradesh': { lat: 16.3067, lon: 80.4365 },
  'Telangana': { lat: 17.9689, lon: 79.5941 },
  'West Bengal': { lat: 23.2324, lon: 87.8615 },
  'Madhya Pradesh': { lat: 22.7196, lon: 75.8577 },
  'Rajasthan': { lat: 26.9124, lon: 75.7873 },
  'Bihar': { lat: 25.5941, lon: 85.1376 },
  'Odisha': { lat: 20.4625, lon: 85.8828 },
  'Assam': { lat: 26.3400, lon: 91.5600 },
  'Jammu & Kashmir': { lat: 34.0837, lon: 74.7973 },
};

// ── WMO Weather Code → Emoji + Description Mapping ──────────────────────
export const WMO_WEATHER: Record<number, { icon: string; description: string }> = {
  0: { icon: '☀️', description: 'Clear sky' },
  1: { icon: '⛅', description: 'Mainly clear' },
  2: { icon: '⛅', description: 'Partly cloudy' },
  3: { icon: '⛅', description: 'Overcast' },
  45: { icon: '🌫️', description: 'Fog' },
  48: { icon: '🌫️', description: 'Fog' },
  51: { icon: '🌧️', description: 'Drizzle' },
  53: { icon: '🌧️', description: 'Drizzle' },
  55: { icon: '🌧️', description: 'Drizzle' },
  56: { icon: '🌧️', description: 'Drizzle' },
  57: { icon: '🌧️', description: 'Drizzle' },
  61: { icon: '🌧️', description: 'Rain' },
  63: { icon: '🌧️', description: 'Rain' },
  65: { icon: '🌧️', description: 'Rain' },
  66: { icon: '🌧️', description: 'Rain' },
  67: { icon: '🌧️', description: 'Rain' },
  71: { icon: '🌨️', description: 'Snow' },
  73: { icon: '🌨️', description: 'Snow' },
  75: { icon: '🌨️', description: 'Snow' },
  77: { icon: '🌨️', description: 'Snow' },
  80: { icon: '🌧️', description: 'Rain' },
  81: { icon: '🌧️', description: 'Rain' },
  82: { icon: '🌧️', description: 'Rain' },
  85: { icon: '🌨️', description: 'Snow' },
  86: { icon: '🌨️', description: 'Snow' },
  95: { icon: '⛈️', description: 'Thunderstorm' },
  96: { icon: '⛈️', description: 'Thunderstorm / Hail' },
  99: { icon: '⛈️', description: 'Thunderstorm / Hail' },
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

// ── Cache ──────────────────────────────────────────────────────────────────
let cachedWeather: WeatherData | null = null;
let cachedLocationKey: string = '';
const CACHE_DURATION_MS = 30 * 60 * 1000; // 30 minutes

function getCoordsForLocation(state: string, district: string): { lat: number; lon: number } {
  return DISTRICT_COORDS[district] || STATE_COORDS[state] || { lat: 28.6139, lon: 77.2090 }; // Delhi fallback
}

/**
 * Fetch current weather for a given state + district from Open-Meteo API.
 * Optionally accepts exact coordinates (e.g. from GPS).
 * Results are cached for 30 minutes per location to avoid redundant calls.
 * Returns fallback state "Weather unavailable" if network fails.
 */
export async function fetchWeather(
  state: string,
  district: string,
  coordsOverride?: { lat: number; lon: number }
): Promise<WeatherData | null> {
  const locationKey = coordsOverride
    ? `coords|${coordsOverride.lat.toFixed(3)}|${coordsOverride.lon.toFixed(3)}`
    : `${state}|${district}`;

  // Return cached result if still fresh
  if (
    cachedWeather &&
    cachedLocationKey === locationKey &&
    Date.now() - cachedWeather.fetchedAt < CACHE_DURATION_MS
  ) {
    return cachedWeather;
  }

  const coords = coordsOverride || getCoordsForLocation(state, district);

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lon}&current_weather=true`,
      { signal: controller.signal }
    );
    clearTimeout(timeout);

    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const data = await res.json();
    const cw = data.current_weather;

    if (!cw) throw new Error('Missing current_weather in response');

    const wmoEntry = WMO_WEATHER[cw.weathercode] || { icon: '⛅', description: 'Weather unavailable' };

    const result: WeatherData = {
      temperature: Math.round(cw.temperature),
      weatherCode: cw.weathercode,
      description: wmoEntry.description,
      icon: wmoEntry.icon,
      windSpeed: Math.round(cw.windspeed),
      isDay: cw.is_day === 1,
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
