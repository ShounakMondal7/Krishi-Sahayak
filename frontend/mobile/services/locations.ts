/**
 * locations.ts — Pan-India Agricultural States and Districts Registry.
 *
 * Provides full cascading State -> District selection for farmers
 * across all major Indian agro-climatic zones.
 */

import type { LanguageCode } from './i18n';
import { storageService } from './storage';

export interface StateDistrictMapping {
  state: string;
  districts: string[];
  zone: string;
  primaryCrops: string[];
}

import {
  INDIA_STATES_DATA,
  INDIA_STATES_MAP,
  StateData,
} from '../constants/india_locations';

export { INDIA_STATES_DATA, INDIA_STATES_MAP, StateData };

/**
 * Returns an alphabetically sorted array of all 28 States and 8 Union Territories.
 */
export function getAllStates(): string[] {
  return INDIA_STATES_DATA.map((s) => s.state);
}

export const ALL_INDIAN_STATES = getAllStates();

/**
 * Returns an alphabetically sorted array of districts for the given State/UT name.
 */
export function getDistrictsForState(stateName: string): string[] {
  if (!stateName) return [];
  const stateData =
    INDIA_STATES_MAP[stateName] ||
    INDIA_STATES_DATA.find((s) => s.state.toLowerCase() === stateName.toLowerCase());
  return stateData ? [...stateData.districts] : [];
}

/**
 * Returns state agro-climatic details (zone, primary crops, districts).
 */
export function getStateDetails(stateName: string): StateData | null {
  if (!stateName) return null;
  return (
    INDIA_STATES_MAP[stateName] ||
    INDIA_STATES_DATA.find((s) => s.state.toLowerCase() === stateName.toLowerCase()) ||
    null
  );
}

/**
 * Strict alias map mapping common GPS/Nominatim API misnomers & historical names
 * to official canonical dataset names.
 */
export const DISTRICT_ALIAS_MAP: Record<string, string> = {
  greaternoida: 'Gautam Buddha Nagar',
  noida: 'Gautam Buddha Nagar',
  gautambudhnagar: 'Gautam Buddha Nagar',
  gautambuddhanagar: 'Gautam Buddha Nagar',
  bengaluruurban: 'Bangalore Urban',
  bengaluru: 'Bangalore Urban',
  bangalore: 'Bangalore Urban',
  bengalururural: 'Bangalore Rural',
  gurugram: 'Gurgaon',
  gurgaon: 'Gurgaon',
  prayagraj: 'Prayagraj',
  allahabad: 'Prayagraj',
  varanasi: 'Varanasi',
  banaras: 'Varanasi',
  kashi: 'Varanasi',
  ayodhya: 'Ayodhya',
  faizabad: 'Ayodhya',
  ahmedabad: 'Ahmedabad',
  mumbaisuburban: 'Mumbai Suburban',
  mumbaicity: 'Mumbai City',
  bombay: 'Mumbai City',
  calcutta: 'Kolkata',
  madras: 'Chennai',
  baroda: 'Vadodara',
  cochin: 'Ernakulam',
  kochi: 'Ernakulam',
  trivandrum: 'Thiruvananthapuram',
  pondicherry: 'Puducherry',
};

export const STATE_ALIAS_MAP: Record<string, string> = {
  nctofdelhi: 'Delhi',
  delhincr: 'Delhi',
  orissa: 'Odisha',
  uttaranchal: 'Uttarakhand',
  pondicherry: 'Puducherry',
  jammuandkashmir: 'Jammu and Kashmir',
};

export function normalizeDistrictAlias(name: string): string {
  if (!name) return '';
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return DISTRICT_ALIAS_MAP[key] || name;
}

export function normalizeStateAlias(name: string): string {
  if (!name) return '';
  const key = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  return STATE_ALIAS_MAP[key] || name;
}

/**
 * Reverse lookup finding which State/UT a district belongs to.
 */
export function findStateForDistrict(districtName: string): string | null {
  if (!districtName) return null;
  const aliased = normalizeDistrictAlias(districtName);
  const target = aliased.trim().toLowerCase();
  const targetClean = target.replace(/[^a-z0-9]/g, '');

  // Check if it's already a state
  for (const st of ALL_INDIAN_STATES) {
    if (st.toLowerCase() === target || st.toLowerCase().replace(/[^a-z0-9]/g, '') === targetClean) {
      return st;
    }
  }

  // Find which state this district belongs to
  for (const stateObj of INDIA_STATES_DATA) {
    if (
      stateObj.districts.some(
        (d) =>
          d.toLowerCase() === target ||
          d.toLowerCase().replace(/[^a-z0-9]/g, '') === targetClean
      )
    ) {
      return stateObj.state;
    }
  }
  return null;
}

export interface GpsLocationResult {
  state: string;
  district: string;
  source: 'gps_reverse' | 'gps_centroid' | 'fallback';
  latitude?: number;
  longitude?: number;
}

export interface DistrictCentroid {
  state: string;
  district: string;
  lat: number;
  lon: number;
}

/**
 * High-density Pan-India Agricultural District Centroids Registry.
 * Used for precise Euclidean/Haversine nearest-district resolution when GPS coordinates
 * are acquired, guaranteeing an accurate match to INDIA_STATES_DATA.
 */
export const PAN_INDIA_DISTRICT_CENTROIDS: DistrictCentroid[] = [
  // Punjab
  { state: 'Punjab', district: 'Ludhiana', lat: 30.9010, lon: 75.8573 },
  { state: 'Punjab', district: 'Amritsar', lat: 31.6340, lon: 74.8723 },
  { state: 'Punjab', district: 'Jalandhar', lat: 31.3260, lon: 75.5762 },
  { state: 'Punjab', district: 'Patiala', lat: 30.3398, lon: 76.3869 },
  { state: 'Punjab', district: 'Bathinda', lat: 30.2110, lon: 74.9455 },
  { state: 'Punjab', district: 'Sangrur', lat: 30.2506, lon: 75.8412 },
  { state: 'Punjab', district: 'Firozpur', lat: 30.9331, lon: 74.6225 },
  { state: 'Punjab', district: 'Hoshiarpur', lat: 31.5300, lon: 75.9100 },
  { state: 'Punjab', district: 'Moga', lat: 30.8164, lon: 75.1742 },
  { state: 'Punjab', district: 'Muktsar', lat: 30.4744, lon: 74.5165 },
  { state: 'Punjab', district: 'Faridkot', lat: 30.6769, lon: 74.7583 },
  { state: 'Punjab', district: 'Mansa', lat: 29.9880, lon: 75.3920 },
  { state: 'Punjab', district: 'Fazilka', lat: 30.4035, lon: 74.0267 },

  // Haryana
  { state: 'Haryana', district: 'Karnal', lat: 29.6857, lon: 76.9905 },
  { state: 'Haryana', district: 'Hisar', lat: 29.1492, lon: 75.7217 },
  { state: 'Haryana', district: 'Ambala', lat: 30.3782, lon: 76.7767 },
  { state: 'Haryana', district: 'Sirsa', lat: 29.5349, lon: 75.0284 },
  { state: 'Haryana', district: 'Rohtak', lat: 28.8955, lon: 76.6066 },
  { state: 'Haryana', district: 'Kurukshetra', lat: 29.9695, lon: 76.8783 },
  { state: 'Haryana', district: 'Sonipat', lat: 28.9931, lon: 77.0151 },
  { state: 'Haryana', district: 'Panipat', lat: 29.3909, lon: 76.9635 },
  { state: 'Haryana', district: 'Yamunanagar', lat: 30.1290, lon: 77.2674 },
  { state: 'Haryana', district: 'Gurugram', lat: 28.4595, lon: 77.0266 },

  // Uttar Pradesh
  { state: 'Uttar Pradesh', district: 'Varanasi', lat: 25.3176, lon: 82.9739 },
  { state: 'Uttar Pradesh', district: 'Lucknow', lat: 26.8467, lon: 80.9462 },
  { state: 'Uttar Pradesh', district: 'Kanpur', lat: 26.4499, lon: 80.3319 },
  { state: 'Uttar Pradesh', district: 'Prayagraj', lat: 25.4358, lon: 81.8463 },
  { state: 'Uttar Pradesh', district: 'Meerut', lat: 28.9845, lon: 77.7064 },
  { state: 'Uttar Pradesh', district: 'Agra', lat: 27.1767, lon: 78.0081 },
  { state: 'Uttar Pradesh', district: 'Gorakhpur', lat: 26.7606, lon: 83.3732 },
  { state: 'Uttar Pradesh', district: 'Bareilly', lat: 28.3670, lon: 79.4304 },
  { state: 'Uttar Pradesh', district: 'Aligarh', lat: 27.8974, lon: 78.0880 },
  { state: 'Uttar Pradesh', district: 'Ayodhya', lat: 26.7922, lon: 82.1998 },
  { state: 'Uttar Pradesh', district: 'Jhansi', lat: 25.4484, lon: 78.5685 },

  // Maharashtra
  { state: 'Maharashtra', district: 'Pune', lat: 18.5204, lon: 73.8567 },
  { state: 'Maharashtra', district: 'Nashik', lat: 19.9975, lon: 73.7898 },
  { state: 'Maharashtra', district: 'Nagpur', lat: 21.1458, lon: 79.0882 },
  { state: 'Maharashtra', district: 'Chhatrapati Sambhajinagar', lat: 19.8762, lon: 75.3433 },
  { state: 'Maharashtra', district: 'Kolhapur', lat: 16.7050, lon: 74.2433 },
  { state: 'Maharashtra', district: 'Solapur', lat: 17.6599, lon: 75.9064 },
  { state: 'Maharashtra', district: 'Amravati', lat: 20.9320, lon: 77.7523 },
  { state: 'Maharashtra', district: 'Ahmednagar', lat: 19.0948, lon: 74.7480 },
  { state: 'Maharashtra', district: 'Satara', lat: 17.6805, lon: 74.0183 },
  { state: 'Maharashtra', district: 'Jalgaon', lat: 21.0077, lon: 75.5626 },

  // Gujarat
  { state: 'Gujarat', district: 'Rajkot', lat: 22.3039, lon: 70.8022 },
  { state: 'Gujarat', district: 'Surat', lat: 21.1702, lon: 72.8311 },
  { state: 'Gujarat', district: 'Ahmedabad', lat: 23.0225, lon: 72.5714 },
  { state: 'Gujarat', district: 'Vadodara', lat: 22.3072, lon: 73.1812 },
  { state: 'Gujarat', district: 'Bhavnagar', lat: 21.7645, lon: 72.1519 },
  { state: 'Gujarat', district: 'Junagadh', lat: 21.5222, lon: 70.4579 },
  { state: 'Gujarat', district: 'Jamnagar', lat: 22.4707, lon: 70.0577 },
  { state: 'Gujarat', district: 'Anand', lat: 22.5645, lon: 72.9289 },
  { state: 'Gujarat', district: 'Kutch', lat: 23.7337, lon: 69.8597 },

  // Kerala
  { state: 'Kerala', district: 'Thrissur', lat: 10.5276, lon: 76.2144 },
  { state: 'Kerala', district: 'Palakkad', lat: 10.7867, lon: 76.6548 },
  { state: 'Kerala', district: 'Wayanad', lat: 11.6854, lon: 76.1320 },
  { state: 'Kerala', district: 'Ernakulam', lat: 9.9816, lon: 76.2999 },
  { state: 'Kerala', district: 'Kozhikode', lat: 11.2588, lon: 75.7804 },
  { state: 'Kerala', district: 'Alappuzha', lat: 9.4981, lon: 76.3388 },
  { state: 'Kerala', district: 'Thiruvananthapuram', lat: 8.5241, lon: 76.9366 },
  { state: 'Kerala', district: 'Idukki', lat: 9.8494, lon: 76.9710 },
  { state: 'Kerala', district: 'Kottayam', lat: 9.5916, lon: 76.5222 },
  { state: 'Kerala', district: 'Kannur', lat: 11.8745, lon: 75.3704 },

  // Tamil Nadu
  { state: 'Tamil Nadu', district: 'Thanjavur', lat: 10.7870, lon: 79.1378 },
  { state: 'Tamil Nadu', district: 'Coimbatore', lat: 11.0168, lon: 76.9558 },
  { state: 'Tamil Nadu', district: 'Madurai', lat: 9.9252, lon: 78.1198 },
  { state: 'Tamil Nadu', district: 'Tiruchirappalli', lat: 10.7905, lon: 78.7047 },
  { state: 'Tamil Nadu', district: 'Salem', lat: 11.6643, lon: 78.1460 },
  { state: 'Tamil Nadu', district: 'Erode', lat: 11.3410, lon: 77.7172 },
  { state: 'Tamil Nadu', district: 'Tirunelveli', lat: 8.7139, lon: 77.7567 },
  { state: 'Tamil Nadu', district: 'Dindigul', lat: 10.3673, lon: 77.9803 },
  { state: 'Tamil Nadu', district: 'Vellore', lat: 12.9165, lon: 79.1325 },

  // Karnataka
  { state: 'Karnataka', district: 'Mysuru', lat: 12.2958, lon: 76.6394 },
  { state: 'Karnataka', district: 'Belagavi', lat: 15.8497, lon: 74.4977 },
  { state: 'Karnataka', district: 'Shivamogga', lat: 13.9299, lon: 75.5681 },
  { state: 'Karnataka', district: 'Dharwad', lat: 15.4589, lon: 75.0078 },
  { state: 'Karnataka', district: 'Mandya', lat: 12.5218, lon: 76.8951 },
  { state: 'Karnataka', district: 'Tumakuru', lat: 13.3379, lon: 77.1017 },
  { state: 'Karnataka', district: 'Hassan', lat: 13.0067, lon: 76.1003 },
  { state: 'Karnataka', district: 'Chikkamagaluru', lat: 13.3161, lon: 75.7720 },
  { state: 'Karnataka', district: 'Ballari', lat: 15.1394, lon: 76.9214 },

  // Andhra Pradesh
  { state: 'Andhra Pradesh', district: 'Guntur', lat: 16.3067, lon: 80.4365 },
  { state: 'Andhra Pradesh', district: 'Krishna', lat: 16.5730, lon: 80.6800 },
  { state: 'Andhra Pradesh', district: 'East Godavari', lat: 17.3212, lon: 82.0400 },
  { state: 'Andhra Pradesh', district: 'West Godavari', lat: 16.7107, lon: 81.0952 },
  { state: 'Andhra Pradesh', district: 'Kurnool', lat: 15.8281, lon: 78.0373 },
  { state: 'Andhra Pradesh', district: 'Visakhapatnam', lat: 17.6868, lon: 83.2185 },
  { state: 'Andhra Pradesh', district: 'Chittoor', lat: 13.2172, lon: 79.1003 },
  { state: 'Andhra Pradesh', district: 'Anantapur', lat: 14.6819, lon: 77.6006 },

  // Telangana
  { state: 'Telangana', district: 'Warangal', lat: 17.9689, lon: 79.5941 },
  { state: 'Telangana', district: 'Karimnagar', lat: 18.4386, lon: 79.1288 },
  { state: 'Telangana', district: 'Nizamabad', lat: 18.6725, lon: 78.0940 },
  { state: 'Telangana', district: 'Khammam', lat: 17.2473, lon: 80.1514 },
  { state: 'Telangana', district: 'Nalgonda', lat: 17.0500, lon: 79.2700 },
  { state: 'Telangana', district: 'Mahabubnagar', lat: 16.7488, lon: 78.0035 },
  { state: 'Telangana', district: 'Ranga Reddy', lat: 17.3850, lon: 78.4867 },

  // West Bengal
  { state: 'West Bengal', district: 'Purba Bardhaman', lat: 23.2324, lon: 87.8615 },
  { state: 'West Bengal', district: 'Hooghly', lat: 22.9080, lon: 88.2400 },
  { state: 'West Bengal', district: 'Murshidabad', lat: 24.1867, lon: 88.2500 },
  { state: 'West Bengal', district: 'Nadia', lat: 23.4710, lon: 88.5565 },
  { state: 'West Bengal', district: 'North 24 Parganas', lat: 22.7230, lon: 88.4800 },
  { state: 'West Bengal', district: 'South 24 Parganas', lat: 22.1670, lon: 88.5300 },
  { state: 'West Bengal', district: 'Bankura', lat: 23.2320, lon: 87.0700 },
  { state: 'West Bengal', district: 'Birbhum', lat: 23.8400, lon: 87.6100 },
  { state: 'West Bengal', district: 'Malda', lat: 25.0108, lon: 88.1411 },
  { state: 'West Bengal', district: 'Jalpaiguri', lat: 26.5400, lon: 88.7200 },
  { state: 'West Bengal', district: 'Darjeeling', lat: 27.0410, lon: 88.2663 },

  // Madhya Pradesh
  { state: 'Madhya Pradesh', district: 'Indore', lat: 22.7196, lon: 75.8577 },
  { state: 'Madhya Pradesh', district: 'Ujjain', lat: 23.1765, lon: 75.7885 },
  { state: 'Madhya Pradesh', district: 'Bhopal', lat: 23.2599, lon: 77.4126 },
  { state: 'Madhya Pradesh', district: 'Jabalpur', lat: 23.1815, lon: 79.9864 },
  { state: 'Madhya Pradesh', district: 'Gwalior', lat: 26.2183, lon: 78.1828 },
  { state: 'Madhya Pradesh', district: 'Sagar', lat: 23.8388, lon: 78.7378 },

  // Rajasthan
  { state: 'Rajasthan', district: 'Jaipur', lat: 26.9124, lon: 75.7873 },
  { state: 'Rajasthan', district: 'Jodhpur', lat: 26.2389, lon: 73.0243 },
  { state: 'Rajasthan', district: 'Kota', lat: 25.2138, lon: 75.8648 },
  { state: 'Rajasthan', district: 'Bikaner', lat: 28.0229, lon: 73.3119 },
  { state: 'Rajasthan', district: 'Sri Ganganagar', lat: 29.9038, lon: 73.8772 },
  { state: 'Rajasthan', district: 'Udaipur', lat: 24.5854, lon: 73.7125 },
  { state: 'Rajasthan', district: 'Alwar', lat: 27.5530, lon: 76.6346 },

  // Bihar
  { state: 'Bihar', district: 'Patna', lat: 25.5941, lon: 85.1376 },
  { state: 'Bihar', district: 'Muzaffarpur', lat: 26.1209, lon: 85.3647 },
  { state: 'Bihar', district: 'Gaya', lat: 24.7955, lon: 84.9994 },
  { state: 'Bihar', district: 'Bhagalpur', lat: 25.2425, lon: 86.9842 },
  { state: 'Bihar', district: 'Darbhanga', lat: 26.1542, lon: 85.8918 },
  { state: 'Bihar', district: 'Purnia', lat: 25.7771, lon: 87.4753 },

  // Odisha
  { state: 'Odisha', district: 'Cuttack', lat: 20.4625, lon: 85.8828 },
  { state: 'Odisha', district: 'Balasore', lat: 21.4934, lon: 86.9135 },
  { state: 'Odisha', district: 'Sambalpur', lat: 21.4669, lon: 83.9812 },
  { state: 'Odisha', district: 'Bargarh', lat: 21.3395, lon: 83.6151 },
  { state: 'Odisha', district: 'Ganjam', lat: 19.5800, lon: 84.4800 },
  { state: 'Odisha', district: 'Puri', lat: 19.8135, lon: 85.8312 },

  // Assam
  { state: 'Assam', district: 'Kamrup', lat: 26.3400, lon: 91.5600 },
  { state: 'Assam', district: 'Dibrugarh', lat: 27.4728, lon: 94.9120 },
  { state: 'Assam', district: 'Nagaon', lat: 26.3464, lon: 92.6837 },
  { state: 'Assam', district: 'Jorhat', lat: 26.7509, lon: 94.2037 },
  { state: 'Assam', district: 'Tinsukia', lat: 27.4860, lon: 95.3557 },

  // Jammu & Kashmir
  { state: 'Jammu & Kashmir', district: 'Srinagar', lat: 34.0837, lon: 74.7973 },
  { state: 'Jammu & Kashmir', district: 'Jammu', lat: 32.7266, lon: 74.8570 },
  { state: 'Jammu & Kashmir', district: 'Baramulla', lat: 34.2090, lon: 74.3436 },
  { state: 'Jammu & Kashmir', district: 'Anantnag', lat: 33.7311, lon: 75.1487 },
  { state: 'Jammu & Kashmir', district: 'Pulwama', lat: 33.8718, lon: 74.9006 },
];

/**
 * Finds the mathematically closest Indian district from PAN_INDIA_DISTRICT_CENTROIDS.
 */
export function findNearestDistrictByCoords(latitude: number, longitude: number): DistrictCentroid {
  let minDistance = Infinity;
  let closest = PAN_INDIA_DISTRICT_CENTROIDS[0];

  for (const item of PAN_INDIA_DISTRICT_CENTROIDS) {
    // Equirectangular approximation for fast distance
    const latDiff = item.lat - latitude;
    const lonDiff = (item.lon - longitude) * Math.cos(((latitude + item.lat) / 2) * (Math.PI / 180));
    const distSq = latDiff * latDiff + lonDiff * lonDiff;
    if (distSq < minDistance) {
      minDistance = distSq;
      closest = item;
    }
  }

  return closest;
}

/**
 * Automatically detects the farmer's GPS location via browser/device navigator.geolocation,
 * falling back to multi-tier reverse geocoding and agro-centroid proximity matching.
 */
export async function detectLocationGPS(): Promise<GpsLocationResult> {
  const getFallback = async (): Promise<GpsLocationResult> => {
    try {
      const saved = await storageService.getSavedLocation();
      if (saved?.state && saved?.district) {
        return { state: saved.state, district: saved.district, source: 'fallback' };
      }
    } catch {}
    return { state: 'Punjab', district: 'Ludhiana', source: 'fallback' };
  };

  return new Promise((resolve) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      getFallback().then(resolve);
      return;
    }

    const timeoutTimer = setTimeout(() => {
      getFallback().then(resolve);
    }, 8500);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        clearTimeout(timeoutTimer);
        const { latitude, longitude } = pos.coords;

        // Clean candidate text
        const cleanLocationName = (val?: string): string => {
          if (!val) return '';
          return val
            .replace(/state of /i, '')
            .replace(/union territory of /i, '')
            .replace(/ut of /i, '')
            .replace(/ district/i, '')
            .replace(/ division/i, '')
            .trim();
        };

        // 1. Primary: Reverse Geocoding via OpenStreetMap Nominatim (zoom=12 for accurate district/county)
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3800);
          const res = await fetch(
            `https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=12&addressdetails=1`,
            {
              headers: { 'User-Agent': 'KrishiSahayak-FarmerApp/1.0' },
              signal: controller.signal,
            }
          );
          clearTimeout(timer);
          if (res.ok) {
            const data = await res.json();
            const addr = data.address || {};
            const stateCandidate = cleanLocationName(addr.state || addr.province);
            const distCandidates = [
              cleanLocationName(addr.county),
              cleanLocationName(addr.state_district),
              cleanLocationName(addr.city),
              cleanLocationName(addr.town),
              cleanLocationName(addr.district),
            ].filter(Boolean);

            if (stateCandidate) {
              const normStateCandidate = normalizeStateAlias(stateCandidate);
              const matchedState = ALL_INDIAN_STATES.find(
                (s) => s.toLowerCase() === normStateCandidate.toLowerCase() ||
                       normStateCandidate.toLowerCase().includes(s.toLowerCase()) ||
                       s.toLowerCase().includes(normStateCandidate.toLowerCase())
              );

              if (matchedState) {
                const stateDists = getDistrictsForState(matchedState);
                let matchedDist = stateDists[0] || matchedState;

                for (const cand of distCandidates) {
                  const aliasedCand = normalizeDistrictAlias(cand);
                  const candClean = cand.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const aliasedClean = aliasedCand.toLowerCase().replace(/[^a-z0-9]/g, '');

                  const foundD = stateDists.find(
                    (d) => {
                      const dClean = d.toLowerCase().replace(/[^a-z0-9]/g, '');
                      return (
                        d.toLowerCase() === aliasedCand.toLowerCase() ||
                        dClean === aliasedClean ||
                        dClean === candClean ||
                        d.toLowerCase().includes(aliasedCand.toLowerCase()) ||
                        aliasedCand.toLowerCase().includes(d.toLowerCase())
                      );
                    }
                  );
                  if (foundD) {
                    matchedDist = foundD;
                    break;
                  }
                }

                resolve({
                  state: matchedState,
                  district: matchedDist,
                  source: 'gps_reverse',
                  latitude,
                  longitude,
                });
                return;
              }
            }
          }
        } catch {
          // Nominatim failed or timed out
        }

        // 2. Secondary: Fast fallback reverse-geocoding via BigDataCloud client API
        try {
          const controller = new AbortController();
          const timer = setTimeout(() => controller.abort(), 3000);
          const bdcRes = await fetch(
            `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`,
            { signal: controller.signal }
          );
          clearTimeout(timer);
          if (bdcRes.ok) {
            const bdcData = await bdcRes.json();
            const stName = cleanLocationName(bdcData.principalSubdivision);
            const cityName = cleanLocationName(bdcData.locality || bdcData.city);

            if (stName) {
              const normStName = normalizeStateAlias(stName);
              const matchedState = ALL_INDIAN_STATES.find(
                (s) => s.toLowerCase() === normStName.toLowerCase() ||
                       normStName.toLowerCase().includes(s.toLowerCase())
              );
              if (matchedState) {
                const stateDists = getDistrictsForState(matchedState);
                let matchedDist = stateDists[0] || matchedState;
                if (cityName) {
                  const aliasedCity = normalizeDistrictAlias(cityName);
                  const cityClean = cityName.toLowerCase().replace(/[^a-z0-9]/g, '');
                  const aliasedClean = aliasedCity.toLowerCase().replace(/[^a-z0-9]/g, '');

                  const foundD = stateDists.find(
                    (d) => {
                      const dClean = d.toLowerCase().replace(/[^a-z0-9]/g, '');
                      return (
                        d.toLowerCase() === aliasedCity.toLowerCase() ||
                        dClean === aliasedClean ||
                        dClean === cityClean ||
                        d.toLowerCase().includes(aliasedCity.toLowerCase()) ||
                        aliasedCity.toLowerCase().includes(d.toLowerCase())
                      );
                    }
                  );
                  if (foundD) matchedDist = foundD;
                }
                resolve({
                  state: matchedState,
                  district: matchedDist,
                  source: 'gps_reverse',
                  latitude,
                  longitude,
                });
                return;
              }
            }
          }
        } catch {
          // BigDataCloud failed
        }

        // 3. Mathematical Nearest District Centroid Matching (High Precision)
        const closest = findNearestDistrictByCoords(latitude, longitude);
        resolve({
          state: closest.state,
          district: closest.district,
          source: 'gps_centroid',
          latitude,
          longitude,
        });
      },
      () => {
        clearTimeout(timeoutTimer);
        getFallback().then(resolve);
      },
      { timeout: 8000, enableHighAccuracy: true, maximumAge: 60000 }
    );
  });
}

export function getFormattedRegionTitle(region: string, fallbackState?: string): string {
  if (!region) return fallbackState || 'India';
  
  // If region is an entire state
  if (INDIA_STATES_MAP[region]) {
    return `${region} (All)`;
  }
  
  // Find which state this district belongs to
  const actualState = findStateForDistrict(region) || fallbackState;
  if (actualState && actualState !== region) {
    return `${region}, ${actualState}`;
  }
  return region;
}

/**
 * Multilingual Pan-India Translations for ALL 28 States and 8 Union Territories (36 Total)
 * across all 12 supported Indic languages, with 100% pure Hindi localization.
 */
export const STATE_TRANSLATIONS: Record<string, Partial<Record<LanguageCode, string>>> = {
  'Andaman and Nicobar Islands': {
    en: 'Andaman and Nicobar Islands',
    hi: 'अंडमान और निकोबार द्वीप समूह',
    ml: 'ആൻഡമാൻ നിക്കോബാർ ദ്വീപുകൾ',
    ta: 'அந்தமான் நிக்கோபார் தீவுகள்',
    te: 'అండమాన్ మరియు నికోబార్ దీవులు',
    kn: 'ಅಂಡಮಾನ್ ಮತ್ತು ನಿಕೋಬಾರ್ ದ್ವೀಪಗಳು',
    bn: 'আন্দামান ও নিকোবর দ্বীপপুঞ্জ',
    mr: 'अंदमान आणि निकोबार द्वीपसमूह',
    gu: 'અંદમાન અને નિકોબાર દ્વીપસમૂહ',
    pa: 'ਅੰਡੇਮਾਨ ਅਤੇ ਨਿਕੋਬਾਰ ਦੀਪ ਸਮੂਹ',
    or: 'ଆଣ୍ଡାମାନ ଏବଂ ନିକୋବର ଦ୍ୱୀପପୁଞ୍ଜ',
    as: 'আন্দামান আৰু নিকোবৰ দ্বীপপুঞ্জ',
  },
  'Andaman & Nicobar Islands': {
    en: 'Andaman and Nicobar Islands',
    hi: 'अंडमान और निकोबार द्वीप समूह',
    ml: 'ആൻഡമാൻ നിക്കോബാർ ദ്വീപുകൾ',
    ta: 'அந்தமான் நிக்கோபார் தீவுகள்',
    te: 'అండమాన్ మరియు నికోబార్ దీవులు',
    kn: 'ಅಂಡಮಾನ್ ಮತ್ತು ನಿಕೋಬಾರ್ ದ್ವೀಪಗಳು',
    bn: 'আন্দামান ও নিকোবর দ্বীপপুঞ্জ',
    mr: 'अंदमान आणि निकोबार द्वीपसमूह',
    gu: 'અંદમાન અને નિકોબાર દ્વીપસમૂહ',
    pa: 'ਅੰਡੇਮਾਨ ਅਤੇ ਨਿਕੋਬਾਰ ਦੀਪ ਸਮੂਹ',
    or: 'ଆଣ୍ଡାମାନ ଏବଂ ନିକୋବର ଦ୍ୱୀପପୁଞ୍ଜ',
    as: 'আন্দামান আৰু নিকোবৰ দ্বীপপুঞ্জ',
  },
  'Andhra Pradesh': {
    en: 'Andhra Pradesh',
    hi: 'आंध्र प्रदेश',
    ml: 'ആന്ധ്രാപ്രദേശ്',
    ta: 'ஆந்திரப் பிரதேசம்',
    te: 'ఆంధ్ర ప్రదేశ్',
    kn: 'ಆಂಧ್ರ ಪ್ರದೇಶ',
    bn: 'অন্ধ্র প্রদেশ',
    mr: 'आंध्र प्रदेश',
    gu: 'આંધ્ર પ્રદેશ',
    pa: 'ਆਂਧਰਾ ਪ੍ਰਦੇਸ਼',
    or: 'ଆନ୍ଧ୍ର ପ୍ରଦେଶ',
    as: 'অন্ধ্ৰ প্ৰদেশ',
  },
  'Arunachal Pradesh': {
    en: 'Arunachal Pradesh',
    hi: 'अरुणाचल प्रदेश',
    ml: 'അരുണാചൽ പ്രദേശ്',
    ta: 'அருணாச்சலப் பிரதேசம்',
    te: 'అరుణాచల్ ప్రదేశ్',
    kn: 'ಅರುಣಾಚಲ ಪ್ರದೇಶ',
    bn: 'অরুণাচল প্রদেশ',
    mr: 'अरुणाचल प्रदेश',
    gu: 'અરુણાચલ પ્રદેશ',
    pa: 'ਅਰੁਣਾਚਲ ਪ੍ਰਦੇਸ਼',
    or: 'ଅରୁଣାଚଳ ପ୍ରଦେଶ',
    as: 'অৰুণাচল প্ৰদেশ',
  },
  'Assam': {
    en: 'Assam',
    hi: 'असम',
    ml: 'അസം',
    ta: 'அசாம்',
    te: 'அస్సాం',
    kn: 'ಅಸ್ಸಾಂ',
    bn: 'আসাম',
    mr: 'आसाम',
    gu: 'આસામ',
    pa: 'ਅਸਾਮ',
    or: 'ଆସାମ',
    as: 'অসম',
  },
  'Bihar': {
    en: 'Bihar',
    hi: 'बिहार',
    ml: 'ബീഹാർ',
    ta: 'பீகார்',
    te: 'బీహార్',
    kn: 'ಬಿಹಾರ',
    bn: 'বিহার',
    mr: 'बिहार',
    gu: 'બિહાર',
    pa: 'ਬਿਹਾਰ',
    or: 'ବିହାର',
    as: 'বিহাৰ',
  },
  'Chandigarh': {
    en: 'Chandigarh',
    hi: 'चंडीगढ़',
    ml: 'ചണ്ഡീഗഡ്',
    ta: 'சண்டிகர்',
    te: 'చండీగఢ్',
    kn: 'ಚಂಡೀಗಢ',
    bn: 'চণ্ডীগড়',
    mr: 'चंदिगढ',
    gu: 'ચંદીગઢ',
    pa: 'ਚੰਡੀਗੜ੍ਹ',
    or: 'ଚଣ୍ଡିଗଡ଼',
    as: 'চণ্ডীগড়',
  },
  'Chhattisgarh': {
    en: 'Chhattisgarh',
    hi: 'छत्तीसगढ़',
    ml: 'ഛത്തീസ്ഗഡ്',
    ta: 'சத்தீசுகர்',
    te: 'ఛత్తీస్‌గఢ్',
    kn: 'ಛತ್ತೀಸ್‌ಗಢ',
    bn: 'ছত্তিশগড়',
    mr: 'छत्तीसगड',
    gu: 'છત્તીસગઢ',
    pa: 'ਛੱਤੀਸਗੜ੍ਹ',
    or: 'ଛତିଶଗଡ଼',
    as: 'ছত্তীশগড়',
  },
  'Dadra and Nagar Haveli and Daman and Diu': {
    en: 'Dadra and Nagar Haveli and Daman and Diu',
    hi: 'दादरा और नगर हवेली और दमन और दीव',
    ml: 'ദാദ്ര & നഗർ ഹവേലി ദാമൻ & ദിയു',
    ta: 'தாத்ரா மற்றும் நகர் ஹவேலி மற்றும் தாமன் மற்றும் தியூ',
    te: 'దాద్రా మరియు నగర్ హవేలీ మరియు డామన్ మరియు డయ్యు',
    kn: 'ದಾದ್ರಾ ಮತ್ತು ನಗರ ಹವೇಲಿ ಮತ್ತು ದಮನ್ ಮತ್ತು ದಿಯು',
    bn: 'দাদরা ও নগর হাভেলি এবং দমন ও দিউ',
    mr: 'दादरा आणि नगर हवेली आणि दमण आणि दीव',
    gu: 'દાદરા અને નગર હવેલી અને દમણ અને દીવ',
    pa: 'ਦਾਦਰਾ ਅਤੇ ਨਗਰ ਹਵੇਲੀ ਅਤੇ ਦਮਨ ਅਤੇ ਦੀਉ',
    or: 'ଦାଦ୍ରା ଏବଂ ନଗର ହାବେଳି ଏବଂ ଦମନ ଏବଂ ଦିଉ',
    as: 'দাদৰা আৰু নগৰ হাভেলি আৰু দমন আৰু দিউ',
  },
  'Dadra & Nagar Haveli and Daman & Diu': {
    en: 'Dadra and Nagar Haveli and Daman and Diu',
    hi: 'दादरा और नगर हवेली और दमन और दीव',
    ml: 'ദാദ്ര & നഗർ ഹവേലി ദാമൻ & ദിയു',
    ta: 'தாத்ரா மற்றும் நகர் ஹவேலி மற்றும் தாமன் மற்றும் தியூ',
    te: 'దాద్రా మరియు నగర్ హవేలీ మరియు డామన్ మరియు డయ్యు',
    kn: 'ದಾದ್ರಾ ಮತ್ತು ನಗರ ಹವೇಲಿ ಮತ್ತು ದಮನ್ ಮತ್ತು ದಿಯು',
    bn: 'দাদরা ও নগর হাভেলি এবং দমন ও দিউ',
    mr: 'दादरा आणि नगर हवेली आणि दमण आणि दीव',
    gu: 'દાદરા અને નગર હવેલી અને દમણ અને દીવ',
    pa: 'ਦਾਦਰਾ ਅਤੇ ਨਗਰ ਹਵੇਲੀ ਅਤੇ ਦਮਨ ਅਤੇ ਦੀਉ',
    or: 'ଦାଦ୍ରା ଏବଂ ନଗର ହାବେଳି ଏବଂ ଦମନ ଏବଂ ଦିଉ',
    as: 'দাদৰা আৰু নগৰ হাভেলি আৰু দমন আৰু দিউ',
  },
  'Delhi': {
    en: 'Delhi',
    hi: 'दिल्ली',
    ml: 'ഡൽഹി',
    ta: 'தில்லி',
    te: 'ఢిల్లీ',
    kn: 'ದೆಹಲಿ',
    bn: 'দিল্লি',
    mr: 'दिल्ली',
    gu: 'દિલ્હી',
    pa: 'ਦਿੱਲੀ',
    or: 'ଦିଲ୍ଲୀ',
    as: 'দিল্লী',
  },
  'Goa': {
    en: 'Goa',
    hi: 'गोवा',
    ml: 'ഗോവ',
    ta: 'கோவா',
    te: 'గోవా',
    kn: 'ಗೋವಾ',
    bn: 'গোয়া',
    mr: 'गोवा',
    gu: 'ગોવા',
    pa: 'ਗੋਆ',
    or: 'ଗୋଆ',
    as: 'গোৱা',
  },
  'Gujarat': {
    en: 'Gujarat',
    hi: 'गुजरात',
    ml: 'ഗുജറാത്ത്',
    ta: 'குஜராத்',
    te: 'గుజరాత్',
    kn: 'ಗುಜರಾತ್',
    bn: 'গুজরাট',
    mr: 'गुजरात',
    gu: 'ગુજરાત',
    pa: 'ਗੁਜਰਾਤ',
    or: 'ଗୁଜରାଟ',
    as: 'গুজৰাট',
  },
  'Haryana': {
    en: 'Haryana',
    hi: 'हरियाणा',
    ml: 'ഹരിയാന',
    ta: 'அரியானா',
    te: 'హర్యానా',
    kn: 'ಹರಿಯಾಣ',
    bn: 'হরিয়ানা',
    mr: 'हरियाणा',
    gu: 'હરિયાણા',
    pa: 'ਹਰਿਆਣਾ',
    or: 'ହରିୟାଣା',
    as: 'হাৰিয়ানা',
  },
  'Himachal Pradesh': {
    en: 'Himachal Pradesh',
    hi: 'हिमाचल प्रदेश',
    ml: 'ഹിമാചൽ പ്രദേശ്',
    ta: 'இமாச்சலப் பிரதேசம்',
    te: 'హిమాచల్ ప్రదేశ్',
    kn: 'ಹಿಮಾಚಲ ಪ್ರದೇಶ',
    bn: 'হিমাচল প্রদেশ',
    mr: 'हिमाचल प्रदेश',
    gu: 'હિમાચલ પ્રદેશ',
    pa: 'ਹਿਮਾਚਲ ਪ੍ਰਦੇਸ਼',
    or: 'ହିମାଚଳ ପ୍ରଦେଶ',
    as: 'হিমাচল প্ৰদেশ',
  },
  'Jammu and Kashmir': {
    en: 'Jammu and Kashmir',
    hi: 'जम्मू और कश्मीर',
    ml: 'ജമ്മു & കശ്മീർ',
    ta: 'ஜம்மு & காஷ்மீர்',
    te: 'జమ్మూ & కాశ్మీర్',
    kn: 'ಜಮ್ಮು ಮತ್ತು ಕಾಶ್ಮೀರ',
    bn: 'জম্মু ও কাশ্মীর',
    mr: 'जम्मू आणि काश्मीर',
    gu: 'જમ્મુ અને કાશ્મીર',
    pa: 'ਜੰਮੂ ਅਤੇ ਕਸ਼ਮੀਰ',
    or: 'ଜମ୍ମୁ ଏବଂ କାଶ୍ମୀର',
    as: 'জম্মু আৰু কাশ্মীৰ',
  },
  'Jammu & Kashmir': {
    en: 'Jammu & Kashmir',
    hi: 'जम्मू और कश्मीर',
    ml: 'ജമ്മു & കശ്മീർ',
    ta: 'ஜம்மு & காஷ்மீர்',
    te: 'జమ్మూ & కాశ్മീர்',
    kn: 'ಜಮ್ಮು ಮತ್ತು ಕಾಶ್ಮೀರ',
    bn: 'জম্মু ও কাশ্মীর',
    mr: 'जम्मू आणि काश्मीर',
    gu: 'જમ્મુ અને કાશ્મીર',
    pa: 'ਜੰਮੂ ਅਤੇ ਕਸ਼ਮੀਰ',
    or: 'ଜମ୍ମୁ ଏବଂ କାଶ୍ମୀର',
    as: 'জম্মু আৰু কাশ্মীৰ',
  },
  'Jharkhand': {
    en: 'Jharkhand',
    hi: 'झारखंड',
    ml: 'ജാർഖണ്ഡ്',
    ta: 'ஜார்க்கண்ட்',
    te: 'జార్ఖండ్',
    kn: 'ಜಾರ್ಖಂಡ್',
    bn: 'ঝাড়খণ্ড',
    mr: 'झारखंड',
    gu: 'ઝારખંડ',
    pa: 'ਝਾਰਖੰਡ',
    or: 'ଝାଡ଼ଖଣ୍ଡ',
    as: 'ঝাৰখণ্ড',
  },
  'Karnataka': {
    en: 'Karnataka',
    hi: 'कर्नाटक',
    ml: 'കർണാടക',
    ta: 'கர்நாடகம்',
    te: 'కర్ణాటక',
    kn: 'ಕರ್ನಾಟಕ',
    bn: 'কর্ণাটক',
    mr: 'कर्नाटक',
    gu: 'કર્ણાટક',
    pa: 'ਕਰਨਾਟਕ',
    or: 'କର୍ଣ୍ଣାଟକ',
    as: 'কৰ্ণাটক',
  },
  'Kerala': {
    en: 'Kerala',
    hi: 'केरल',
    ml: 'കേരളം',
    ta: 'கேரளம்',
    te: 'కేరళ',
    kn: 'ಕೇರಳ',
    bn: 'কেরালা',
    mr: 'केरळ',
    gu: 'કેરળ',
    pa: 'ਕੇਰਲ',
    or: 'କେରଳ',
    as: 'কেৰালা',
  },
  'Ladakh': {
    en: 'Ladakh',
    hi: 'लद्दाख',
    ml: 'ലഡാക്ക്',
    ta: 'லடாக்',
    te: 'లడఖ్',
    kn: 'ಲಡಾಖ್',
    bn: 'লাদাখ',
    mr: 'लडाख',
    gu: 'લદ્દાખ',
    pa: 'ਲੱਦਾਖ',
    or: 'ଲଦାଖ',
    as: 'লাডাখ',
  },
  'Lakshadweep': {
    en: 'Lakshadweep',
    hi: 'लक्षद्वीप',
    ml: 'ലക്ഷദ്വീപ്',
    ta: 'லட்சத்தீவு',
    te: 'లక్షద్వీప్',
    kn: 'ಲಕ್ಷದ್ವೀಪ',
    bn: 'লক্ষদ্বীপ',
    mr: 'लक्षद्वीप',
    gu: 'લક્ષદ્વીપ',
    pa: 'ਲਕਸ਼ਦੀਪ',
    or: 'ଲାକ୍ଷାଦ୍ୱୀପ',
    as: 'লাক্ষাদ্বীপ',
  },
  'Madhya Pradesh': {
    en: 'Madhya Pradesh',
    hi: 'मध्य प्रदेश',
    ml: 'മധ്യപ്രദേശ്',
    ta: 'மத்தியப் பிரதேசம்',
    te: 'మధ్యప్రదేశ్',
    kn: 'ಮಧ್ಯ ಪ್ರದೇಶ',
    bn: 'মধ্যপ্রদেশ',
    mr: 'मध्य प्रदेश',
    gu: 'મધ્ય પ્રદેશ',
    pa: 'ਮੱਧ ਪ੍ਰਦੇਸ਼',
    or: 'ମଧ୍ୟ ପ୍ରଦେଶ',
    as: 'মধ্য প্ৰদেশ',
  },
  'Maharashtra': {
    en: 'Maharashtra',
    hi: 'महाराष्ट्र',
    ml: 'മഹാരാഷ്ട്ര',
    ta: 'மகாராட்டிர',
    te: 'మహారాష్ట్ర',
    kn: 'ಮಹಾರಾಷ್ಟ್ರ',
    bn: 'মহারাষ্ট্র',
    mr: 'महाराष्ट्र',
    gu: 'મહારાષ્ટ્ર',
    pa: 'ਮਹਾਰਾਸ਼ਟਰ',
    or: 'ମହାରାଷ୍ଟ୍ର',
    as: 'মহাৰাষ্ট্ৰ',
  },
  'Manipur': {
    en: 'Manipur',
    hi: 'मणिपुर',
    ml: 'മണിപ്പൂർ',
    ta: 'மணிப்பூர்',
    te: 'మణిపూర్',
    kn: 'ಮಣಿಪುರ',
    bn: 'মণিপুর',
    mr: 'मणिपूर',
    gu: 'મણિપુર',
    pa: 'ਮਨੀਪੁਰ',
    or: 'ମଣିପୁର',
    as: 'মণিপুৰ',
  },
  'Meghalaya': {
    en: 'Meghalaya',
    hi: 'मेघालय',
    ml: 'മേഘാലയ',
    ta: 'மேகாலயா',
    te: 'మేఘాలయ',
    kn: 'ಮೇಘಾಲಯ',
    bn: 'মেঘালয়',
    mr: 'मेघालय',
    gu: 'મેઘાલય',
    pa: 'ਮੇਘਾਲਿਆ',
    or: 'ମେଘାଳୟ',
    as: 'মেঘালয়',
  },
  'Mizoram': {
    en: 'Mizoram',
    hi: 'मिज़ोरम',
    ml: 'മിസോറാം',
    ta: 'மிசோரம்',
    te: 'మిజోరం',
    kn: 'ಮಿಜೋರಾಂ',
    bn: 'মিজোরাম',
    mr: 'मिझोरम',
    gu: 'મિઝોરમ',
    pa: 'ਮਿਜ਼ੋਰਮ',
    or: 'ମିଜୋରାମ',
    as: 'মিজোৰাম',
  },
  'Nagaland': {
    en: 'Nagaland',
    hi: 'नागालैंड',
    ml: 'നാഗാലാൻഡ്',
    ta: 'நாகாலாந்து',
    te: 'నాగాలాండ్',
    kn: 'ನಾಗಾಲ್ಯಾಂಡ್',
    bn: 'নাগাল্যান্ড',
    mr: 'नागालँड',
    gu: 'નાગાલેન્ડ',
    pa: 'ਨਾਗਾਲੈਂਡ',
    or: 'ନାଗାଲାଣ୍ଡ',
    as: 'নাগালেণ্ড',
  },
  'Odisha': {
    en: 'Odisha',
    hi: 'ओडिशा',
    ml: 'ഒഡീഷ',
    ta: 'ஒடிசா',
    te: 'ఒడిశా',
    kn: 'ಒಡಿಶಾ',
    bn: 'ওড়িশা',
    mr: 'ओडिशा',
    gu: 'ઓડિશા',
    pa: 'ਓਡੀਸ਼ਾ',
    or: 'ଓଡ଼ିଶା',
    as: 'ওড়িশা',
  },
  'Puducherry': {
    en: 'Puducherry',
    hi: 'पुडुचेरी',
    ml: 'പുതുച്ചേരി',
    ta: 'புதுச்சேரி',
    te: 'పుదుచ్చేరి',
    kn: 'ಪುದುಚೇರಿ',
    bn: 'পুদুচেরি',
    mr: 'पुडुचेरी',
    gu: 'પુડુચેરી',
    pa: 'ਪੁਡੂਚੇਰੀ',
    or: 'ପୁଡୁଚେରୀ',
    as: 'পুডুচেৰী',
  },
  'Punjab': {
    en: 'Punjab',
    hi: 'पंजाब',
    ml: 'പഞ്ചാബ്',
    ta: 'பஞ்சாப்',
    te: 'పంజాబ్',
    kn: 'ಪಂಜಾಬ್',
    bn: 'পাঞ্জাব',
    mr: 'पंजाब',
    gu: 'પંજાબ',
    pa: 'ਪੰਜਾਬ',
    or: 'ପଞ୍ଜାବ',
    as: 'পঞ্জাব',
  },
  'Rajasthan': {
    en: 'Rajasthan',
    hi: 'राजस्थान',
    ml: 'രാജസ്ഥാൻ',
    ta: 'ராஜஸ்தான்',
    te: 'రాజస్థాన్',
    kn: 'ರಾಜಸ್ಥಾನ',
    bn: 'রাজস্থান',
    mr: 'राजस्थान',
    gu: 'રાજસ્થાન',
    pa: 'ਰਾਜਸਥਾਨ',
    or: 'ରାਜସ୍ଥାନ',
    as: 'ৰাজস্থান',
  },
  'Sikkim': {
    en: 'Sikkim',
    hi: 'सिक्किम',
    ml: 'സിക്കിം',
    ta: 'சிக்கிம்',
    te: 'సిక్కిం',
    kn: 'ಸಿಕ್ಕಿಂ',
    bn: 'সিকিম',
    mr: 'सिक्कीम',
    gu: 'સિક્કિમ',
    pa: 'ਸਿੱਕਮ',
    or: 'ସିକ୍କିମ',
    as: 'ছিকিম',
  },
  'Tamil Nadu': {
    en: 'Tamil Nadu',
    hi: 'तमिलनाडु',
    ml: 'തമിഴ്‌നാട്',
    ta: 'தமிழ்நாடு',
    te: 'తమిళనాడు',
    kn: 'ತಮಿಳುನಾಡು',
    bn: 'তামিলনাড়ু',
    mr: 'तमिळनाडू',
    gu: 'તમિલનાડુ',
    pa: 'ਤਾਮਿਲਨਾਡੂ',
    or: 'ਤਾମିଲନାଡୁ',
    as: 'তামিলনাডু',
  },
  'Telangana': {
    en: 'Telangana',
    hi: 'तेलंगाना',
    ml: 'തെലങ്കാന',
    ta: 'தெலுங்கானா',
    te: 'తెలంగాణ',
    kn: 'ತೆಲಂಗಾಣ',
    bn: 'তেলেঙ্গানা',
    mr: 'तेलंगणा',
    gu: 'તેલંગાણા',
    pa: 'ਤੇਲੰਗਾਨਾ',
    or: 'ତେଲେଙ୍ଗାନା',
    as: 'তেলেংগানা',
  },
  'Tripura': {
    en: 'Tripura',
    hi: 'त्रिपुरा',
    ml: 'ത്രിപുര',
    ta: 'திரிபுரா',
    te: 'త్రిపుర',
    kn: 'ತ್ರಿಪುರ',
    bn: 'ত্রিপুরা',
    mr: 'त्रिपुरा',
    gu: 'ત્રિપુરા',
    pa: 'ਤ੍ਰਿਪੁਰਾ',
    or: 'ତ୍ରିପୁରା',
    as: 'ত্ৰিপুৰা',
  },
  'Uttar Pradesh': {
    en: 'Uttar Pradesh',
    hi: 'उत्तर प्रदेश',
    ml: 'ഉത്തർപ്രദേശ്',
    ta: 'உத்தரப் பிரதேசம்',
    te: 'ఉత్తర ప్రదేశ్',
    kn: 'ಉತ್ತರ ಪ್ರದೇಶ',
    bn: 'উত্তর প্রদেশ',
    mr: 'उत्तर प्रदेश',
    gu: 'ઉત્તર પ્રદેશ',
    pa: 'ਉੱਤਰ ਪ੍ਰਦੇਸ਼',
    or: 'ଉତ୍ତର ପ୍ରଦେଶ',
    as: 'উত্তৰ প্ৰদেশ',
  },
  'Uttarakhand': {
    en: 'Uttarakhand',
    hi: 'उत्तराखंड',
    ml: 'ഉത്തരാഖണ്ഡ്',
    ta: 'உத்தராகண்டம்',
    te: 'ఉత్తరాఖండ్',
    kn: 'ಉತ್ತರಾಖಂಡ',
    bn: 'উত্তরাখণ্ড',
    mr: 'उत्तराखंड',
    gu: 'ઉત્તરાખંડ',
    pa: 'ਉੱਤਰਾਖੰਡ',
    or: 'ଉତ୍ତରାଖଣ୍ଡ',
    as: 'উত্তৰাখণ্ড',
  },
  'West Bengal': {
    en: 'West Bengal',
    hi: 'पश्चिम बंगाल',
    ml: 'പശ്ചിമ ബംഗാൾ',
    ta: 'மேற்கு வங்காளம்',
    te: 'పశ్చిమ బెంగాల్',
    kn: 'ಪಶ್ಚಿಮ ಬಂಗಾಳ',
    bn: 'পশ্চিমবঙ্গ',
    mr: 'पश्चिम बंगाल',
    gu: 'પશ્ચિમ બંગાળ',
    pa: 'ਪੱਛਮੀ ਬੰਗਾਲ',
    or: 'ପଶ୍ଚିମ ବଙ୍ଗ',
    as: 'পশ্চিম বংগ',
  },
};

/**
 * Translations for prominent agricultural districts in India.
 */
export const DISTRICT_TRANSLATIONS: Record<string, Partial<Record<LanguageCode, string>>> = {
  // West Bengal
  'Purba Bardhaman': { en: 'Purba Bardhaman', bn: 'পূর্ব বর্ধমান', hi: 'पूर्व बर्धमान', ml: 'പൂർവ്വ ബർധമാൻ', ta: 'கிழக்கு பர்த்வான்', te: 'పూర్వ వర్ధమాన్', pa: 'ਪੂਰਬੀ ਬਰਧਮਾਨ' },
  'Hooghly': { en: 'Hooghly', bn: 'হুগলি', hi: 'हुगली', ml: 'ഹൂഗ്ലി', ta: 'ஹூக்ளி', te: 'హుగ్లీ', pa: 'ਹੁਗਲੀ' },
  'Murshidabad': { en: 'Murshidabad', bn: 'মুর্শিদাবাদ', hi: 'मुर्शिदाबाद', ml: 'മുർഷിദാബാദ്', ta: 'முர்ஷிதாபாத்', te: 'ముర్షిదాబాద్', pa: 'ਮੁਰਸ਼ਿਦਾਬਾਦ' },
  'Nadia': { en: 'Nadia', bn: 'নদিয়া', hi: 'नादिया', ml: 'നാദിയ', ta: 'நாடியா', te: 'నదియా', pa: 'ਨਾਦੀਆ' },
  'North 24 Parganas': { en: 'North 24 Parganas', bn: 'উত্তর ২৪ পরগণা', hi: 'उत्तर २४ परगना', ml: 'നോർത്ത് 24 പർഗാനാസ്', ta: 'வடக்கு 24 பர்கானாஸ்', te: 'ఉత్తర 24 పరగణాలు', pa: 'ਉੱਤਰੀ 24 ਪਰਗਨਾ' },
  'South 24 Parganas': { en: 'South 24 Parganas', bn: 'দক্ষিণ ২৪ পরগণা', hi: 'दक्षिण २४ परगना', ml: 'സൗത്ത് 24 പർഗാനാസ്', ta: 'தெற்கு 24 பர்கானாஸ்', te: 'దక్షిణ 24 పరగణాలు', pa: 'ਦੱਖਣੀ 24 ਪਰਗਨਾ' },
  'Bankura': { en: 'Bankura', bn: 'বাঁকুড়া', hi: 'बांकुड़ा', ml: 'ബാങ്കുറ', ta: 'பாங்குரா', te: 'బంకురా', pa: 'ਬਾਂਕੁਰਾ' },
  'Birbhum': { en: 'Birbhum', bn: 'বীরভূম', hi: 'बीरभूम', ml: 'ബീർഭൂം', ta: 'பீர்பூம்', te: 'బీర్భూమ్', pa: 'ਬੀਰਭੂਮ' },
  'Malda': { en: 'Malda', bn: 'মালদা', hi: 'मालदा', ml: 'മാൾഡ', ta: 'மால்டா', te: 'మాల్డా', pa: 'ਮਾਲਦਾ' },
  'Jalpaiguri': { en: 'Jalpaiguri', bn: 'জলপাইগুড়ি', hi: 'जलपाईगुड़ी', ml: 'ജൽപായ്ഗുരി', ta: 'ஜல்பைகுரி', te: 'జల్పైగురి', pa: 'ਜਲਪਾਈਗੁੜੀ' },
  'Darjeeling': { en: 'Darjeeling', bn: 'দার্জিলিং', hi: 'दार्जिलिंग', ml: 'ഡാർജിലിംഗ്', ta: 'டார்ஜிலிங்', te: 'డార్జిలింగ్', pa: 'ਦਾਰਜੀਲਿੰਗ' },
  'Paschim Medinipur': { en: 'Paschim Medinipur', bn: 'পশ্চিম মেদিনীপুর', hi: 'पश्चिम मेदिनीपुर', ml: 'പശ്ചിമ മേദിനിപൂർ', ta: 'மேற்கு மேதினிபூர்', te: 'పశ్చిమ మేదినీపూర్', pa: 'ਪੱਛਮੀ ਮੇਦਿਨੀਪੁਰ' },
  'Purba Medinipur': { en: 'Purba Medinipur', bn: 'পূর্ব মেদিনীপুর', hi: 'पूर्व मेदिनीपुर', ml: 'പൂർവ്വ മേദിനിപൂർ', ta: 'கிழக்கு மேதினிபூர்', te: 'పూర్వ మేదినీపూర్', pa: 'ਪੂਰਬੀ ਮੇਦਿਨੀਪੁਰ' },
  'Dinajpur': { en: 'Dinajpur', bn: 'দিনাজপুর', hi: 'दीनाजपुर', ml: 'ദിനാജ്പൂർ', ta: 'தினஜ்பூர்', te: 'దినాజ్‌పూర్', pa: 'ਦੀਨਾਜਪੁਰ' },

  // Punjab
  'Ludhiana': { en: 'Ludhiana', pa: 'ਲੁਧਿਆਣਾ', hi: 'लुधियाना', bn: 'লুধিয়ানা', ml: 'ലുധിയാന', ta: 'லூதியானா', te: 'లూధియానా', mr: 'लुधियाना', gu: 'લુધિયાણા' },
  'Amritsar': { en: 'Amritsar', pa: 'ਅੰਮ੍ਰਿਤਸਰ', hi: 'अमृतसर', bn: 'অমৃতসর', ml: 'അമൃത്സർ', ta: 'அமிர்தசரஸ்', te: 'అమృత్‌సర్', mr: 'अमृतसर', gu: 'અમૃતસર' },
  'Jalandhar': { en: 'Jalandhar', pa: 'ਜਲੰਧਰ', hi: 'जालंधर', bn: 'জলন্ধর', ml: 'ജലന്ധർ', ta: 'ஜலந்தர்', te: 'జలంధర్', mr: 'जालंधर', gu: 'જલંધર' },
  'Patiala': { en: 'Patiala', pa: 'ਪਟਿਆਲਾ', hi: 'पटियाला', bn: 'পাতিয়ালা', ml: 'പട്യാല', ta: 'பாட்டியாலா', te: 'పాటియాలా', mr: 'पटियाला', gu: 'પટિયાલા' },
  'Bathinda': { en: 'Bathinda', pa: 'ਬਠਿੰਡਾ', hi: 'बठिंडा', bn: 'ভাটিণ্ডা', ml: 'ബതിന്ദ', ta: 'பதிண்டா', te: 'భటిండా', mr: 'भटिंडा', gu: 'ભટિંડા' },
  'Sangrur': { en: 'Sangrur', pa: 'ਸੰਗਰੂਰ', hi: 'संगरूर', bn: 'সাঙ্গরুর', ml: 'സംഗ്രൂർ', ta: 'சங்ரூர்', te: 'సంగ్రూర్' },
  'Firozpur': { en: 'Firozpur', pa: 'ਫ਼ਿਰੋਜ਼ਪੁਰ', hi: 'फिरोजपुर', bn: 'ফিরোজপুর', ml: 'ഫിറോസ്പൂർ', ta: 'பிரோஸ்பூர்', te: 'ఫిరోజ్‌పూర్' },
  'Gurdaspur': { en: 'Gurdaspur', pa: 'ਗੁਰਦਾਸਪੁਰ', hi: 'गुरदासपुर', bn: 'গুরুদাসপুর', ml: 'ഗുർദാസ്പൂർ', ta: 'குர்தாஸ்பூர்', te: 'గురుదాస్‌పూర్' },
  'Hoshiarpur': { en: 'Hoshiarpur', pa: 'ਹੁਸ਼ਿਆਰਪੁਰ', hi: 'होशियारपुर', bn: 'হোশিয়ারপুর', ml: 'ഹോഷിയാർപൂർ' },
  'Moga': { en: 'Moga', pa: 'ਮੋਗਾ', hi: 'मोगा', bn: 'মোগা', ml: 'മോഗ' },
  'Muktsar': { en: 'Muktsar', pa: 'ਮੁਕਤਸਰ', hi: 'मुक्तसर', bn: 'মুক্তসর', ml: 'മുക്ത്സർ' },
  'Faridkot': { en: 'Faridkot', pa: 'ਫ਼ਰੀਦਕੋਟ', hi: 'फरीदकोट', bn: 'ফরিদকোট', ml: 'ഫരീദ്കോട്ട്' },
  'Kapurthala': { en: 'Kapurthala', pa: 'ਕਪੂਰਥਲਾ', hi: 'कपूरथला', bn: 'কাপুরথালা', ml: 'കപൂർത്തല' },
  'Mansa': { en: 'Mansa', pa: 'ਮਾਨਸਾ', hi: 'मानसा', bn: 'মানসা', ml: 'മാൻസ' },
  'Fazilka': { en: 'Fazilka', pa: 'ਫ਼ਾਜ਼ਿਲਕਾ', hi: 'फाजिल्का', bn: 'ফাজিলকা', ml: 'ഫാസിൽക്ക' },

  // Kerala
  'Thrissur': { en: 'Thrissur', ml: 'തൃശ്ശൂർ', hi: 'त्रिशूर', bn: 'ত্রিশূর', ta: 'திருச்சூர்', te: 'త్రిసూర్', kn: 'ತ್ರಿಶೂರ್', pa: 'ਤ੍ਰਿਸੂਰ' },
  'Palakkad': { en: 'Palakkad', ml: 'പാലക്കാട്', hi: 'पालक्काड़', bn: 'পালাক্কাদ', ta: 'பாலக்காடு', te: 'పాలక్కాడ్', kn: 'ಪಾಲಕ್ಕಾಡ್', pa: 'ਪਾਲੱਕੜ' },
  'Wayanad': { en: 'Wayanad', ml: 'വയനാട്', hi: 'वायनाड', bn: 'ওয়ায়নাড়', ta: 'வயநாடு', te: 'వాయనాడ్', kn: 'ವಯನಾಡ್', pa: 'ਵਾਇਨਾਡ' },
  'Ernakulam': { en: 'Ernakulam', ml: 'എറണാകുളം', hi: 'एर्नाकुलम', bn: 'এরনাকুলাম', ta: 'எர்ணாகுளம்', te: 'ఎర్నాకుళం', kn: 'ಎರ್ನಾಕುಲಂ' },
  'Kozhikode': { en: 'Kozhikode', ml: 'കോഴിക്കോട്', hi: 'कोझिकोड', bn: 'কোঝিকোড়', ta: 'கோழிக்கோடு', te: 'కోజికోడ్', kn: 'ಕೋಝಿಕೋಡ್' },
  'Alappuzha': { en: 'Alappuzha', ml: 'ആലപ്പുഴ', hi: 'अलप्पुझा', bn: 'আলাপ্পুঝা', ta: 'ஆலப்புழா', te: 'ఆలప్పుళా' },
  'Kannur': { en: 'Kannur', ml: 'കണ്ണൂർ', hi: 'कन्नूर', bn: 'কান্নুর', ta: 'கண்ணூர்', te: 'కన్నూర్' },
  'Malappuram': { en: 'Malappuram', ml: 'മലപ്പുറം', hi: 'मलप्पुरम', bn: 'মালাপ্পুরম', ta: 'மலப்புறம்', te: 'మలప్పురం' },
  'Kottayam': { en: 'Kottayam', ml: 'കോട്ടയം', hi: 'कोट्टायम', bn: 'কোট্টায়াম', ta: 'கோட்டயம்', te: 'కొట్టాయం' },
  'Idukki': { en: 'Idukki', ml: 'ഇടുക്കി', hi: 'इडुक्की', bn: 'ইডুক্কি', ta: 'இடுக்கி', te: 'ఇడుక్కి' },
  'Thiruvananthapuram': { en: 'Thiruvananthapuram', ml: 'തിരുവനന്തപുരം', hi: 'तिरुवनंतपुरम', bn: 'তিরুবনন্তপুরম', ta: 'திருவனந்தபுரம்', te: 'తిరువనంతపురం' },
  'Kollam': { en: 'Kollam', ml: 'കൊല്ലം', hi: 'कोल्लम', bn: 'কোল্লাম', ta: 'கொல்லம்', te: 'కొల్లం' },
  'Pathanamthitta': { en: 'Pathanamthitta', ml: 'പത്തനംതിട്ട', hi: 'पथनमथिट्टा', bn: 'পত্তনমতিট্টা', ta: 'பத்தனம்திட்டா', te: 'పతనంతిట్ట' },
  'Kasaragod': { en: 'Kasaragod', ml: 'കാസർഗോഡ്', hi: 'कासरगोड', bn: 'কাসারগোদ', ta: 'காசர்கோடு', te: 'కాసర్గోడ్' },

  // Haryana
  'Karnal': { en: 'Karnal', hi: 'करनाल', pa: 'ਕਰਨਾਲ', bn: 'কার্নাল', ml: 'കർണാൽ' },
  'Hisar': { en: 'Hisar', hi: 'हिसार', pa: 'ਹਿਸਾਰ', bn: 'হিসার', ml: 'ഹിസാർ' },
  'Ambala': { en: 'Ambala', hi: 'अंबाला', pa: 'ਅੰਬਾਲਾ', bn: 'আম্বালা', ml: 'അംബാല' },
  'Sirsa': { en: 'Sirsa', hi: 'सिरसा', pa: 'ਸਿਰਸਾ', bn: 'সিরসা' },
  'Rohtak': { en: 'Rohtak', hi: 'रोहतक', pa: 'ਰੋਹਤਕ', bn: 'রোহতক' },
  'Kurukshetra': { en: 'Kurukshetra', hi: 'कुरुक्षेत्र', pa: 'ਕੁਰੂਕਸ਼ੇਤਰ', bn: 'কুরুক্ষেত্র' },
  'Sonipat': { en: 'Sonipat', hi: 'सोनीपत', pa: 'ਸੋਨੀਪਤ', bn: 'সোনিপথ' },
  'Fatehabad': { en: 'Fatehabad', hi: 'फतेहाबाद', pa: 'ਫਤਿਹਾਬਾਦ', bn: 'ফতেহাবাদ' },
  'Panipat': { en: 'Panipat', hi: 'पानीपत', pa: 'ਪਾਨੀਪਤ', bn: 'পানিপথ' },
  'Yamunanagar': { en: 'Yamunanagar', hi: 'यमुनानगर', pa: 'ਯਮੁਨਾਨਗਰ', bn: 'যমুনানগর' },
  'Jind': { en: 'Jind', hi: 'जींद', pa: 'ਜੀਂਦ', bn: 'জিন্দ' },
  'Bhiwani': { en: 'Bhiwani', hi: 'भिवानी', pa: 'ਭਿਵਾਨੀ', bn: 'ভিবানি' },
  'Rewari': { en: 'Rewari', hi: 'रेवाड़ी', pa: 'ਰੇਵਾੜੀ', bn: 'রেওয়ারি' },
  'Kaithal': { en: 'Kaithal', hi: 'कैथल', pa: 'ਕੈਥਲ', bn: 'কৈথাল' },
  'Gurugram': { en: 'Gurugram', hi: 'गुरुग्राम', pa: 'ਗੁਰੂਗ੍ਰਾਮ', bn: 'গুরুগ্রাম' },

  // Uttar Pradesh
  'Ambedkar Nagar': { en: 'Ambedkar Nagar', hi: 'अम्बेडकर नगर', bn: 'আম্বেদকর নগর', pa: 'ਅੰਬੇਡਕਰ ਨਗਰ', gu: 'આંબેડકર નગર', mr: 'आंबेडकर नगर', ta: 'அம்பேத்கர் நகர்', te: 'అంబేద్కర్ నగర్', kn: 'ಅಂಬೇಡ್ಕರ್ ನಗರ', ml: 'അംബേദ്കർ നഗർ', or: 'ଆମ୍ବେଦକର ନଗର', as: 'আম্বেদকাৰ নগৰ' },
  'Gautam Buddha Nagar': { en: 'Gautam Buddha Nagar', hi: 'गौतम बुद्ध नगर', bn: 'গৌতম বুদ্ধ নগর', pa: 'ਗੌਤਮ ਬੁੱਧ ਨਗਰ', gu: 'ગૌતમ બુદ્ધ નગર', mr: 'गौतम बुद्ध नगर', ta: 'கௌதம் புத்தா நகர்', te: 'గౌతమ్ బుద్ధ నగర్', kn: 'ಗೌತಮ್ ಬುದ್ಧ ನಗರ', ml: 'ഗൗതം ബുദ്ധ നഗർ' },
  'Ghaziabad': { en: 'Ghaziabad', hi: 'गाजियाबाद', bn: 'গাজিয়াবাদ', pa: 'ਗ਼ਾਜ਼ੀਆਬਾਦ', mr: 'गाझियाबाद', gu: 'ગાઝિયાબાદ' },
  'Mathura': { en: 'Mathura', hi: 'मथुरा', bn: 'মথুরা', pa: 'ਮਥੁਰਾ', mr: 'मथुरा', gu: 'મથુરા' },
  'Firozabad': { en: 'Firozabad', hi: 'फिरोजाबाद', bn: 'ফিরোজাবাদ', pa: 'ਫ਼ਿਰੋਜ਼ਾਬਾਦ' },
  'Mirzapur': { en: 'Mirzapur', hi: 'मिर्जापुर', bn: 'মির্জাপুর', pa: 'ਮਿਰਜ਼ਾਪੁਰ' },
  'Sitapur': { en: 'Sitapur', hi: 'सीतापुर', bn: 'সীতাপুর', pa: 'ਸੀਤਾਪੁਰ' },
  'Banda': { en: 'Banda', hi: 'बांदा', bn: 'বান্দা', pa: 'ਬਾਂਦਾ' },
  'Ballia': { en: 'Ballia', hi: 'बलिया', bn: 'বালিয়া', pa: 'ਬਲੀਆ' },
  'Bijnor': { en: 'Bijnor', hi: 'बिजनौर', bn: 'বিজনোর', pa: 'ਬਿਜਨੌਰ' },
  'Budaun': { en: 'Budaun', hi: 'बदायूं', bn: 'বদাউন', pa: 'ਬਦਾਯੂੰ' },
  'Deoria': { en: 'Deoria', hi: 'देवरिया', bn: 'দেওরিয়া', pa: 'ਦੇਵਰੀਆ' },
  'Etawah': { en: 'Etawah', hi: 'इटावा', bn: 'ইটাওয়া', pa: 'ਇਟਾਵਾ' },
  'Farrukhabad': { en: 'Farrukhabad', hi: 'फर्रुखाबाद', bn: 'ফার্রুখাবাদ', pa: 'ਫਰੂਖ਼ਾਬਾਦ' },
  'Fatehpur': { en: 'Fatehpur', hi: 'फतेहपुर', bn: 'ফতেহপুর', pa: 'ਫ਼ਤਹਿਪੁਰ' },
  'Ghazipur': { en: 'Ghazipur', hi: 'गाजीपुर', bn: 'গাজীপুর', pa: 'ਗ਼ਾਜ਼ੀਪੁਰ' },
  'Gonda': { en: 'Gonda', hi: 'गोंडा', bn: 'গোন্ডা', pa: 'ਗੋਂਡਾ' },
  'Hardoi': { en: 'Hardoi', hi: 'हरदोई', bn: 'হারদোই', pa: 'ਹਰਦੋਈ' },
  'Hathras': { en: 'Hathras', hi: 'हाथरस', bn: 'হাথরস', pa: 'ਹਾਥਰਸ' },
  'Jaunpur': { en: 'Jaunpur', hi: 'जौनपुर', bn: 'জৌনপুর', pa: 'ਜੌਨਪੁਰ' },
  'Kushinagar': { en: 'Kushinagar', hi: 'कुशीनगर', bn: 'কুশীনগর', pa: 'ਕੁਸ਼ੀਨਗਰ' },
  'Lalitpur': { en: 'Lalitpur', hi: 'ललितपुर', bn: 'ললিতপুর', pa: 'ਲਲਿਤਪੁਰ' },
  'Mainpuri': { en: 'Mainpuri', hi: 'मैनपुरी', bn: 'মৈনপুরী', pa: 'ਮੈਨਪੁਰੀ' },
  'Pilibhit': { en: 'Pilibhit', hi: 'पीलीभीत', bn: 'পিলভিট', pa: 'ਪੀਲੀਭੀਤ' },
  'Pratapgarh': { en: 'Pratapgarh', hi: 'प्रतापगढ़', bn: 'প্রতাপগড়', pa: 'ਪ੍ਰਤਾਪਗੜ੍ਹ' },
  'Raebareli': { en: 'Raebareli', hi: 'रायबरेली', bn: 'রায়বেরেলি', pa: 'ਰਾਏਬਰੇਲੀ' },
  'Rampur': { en: 'Rampur', hi: 'रामपुर', bn: 'রামপুর', pa: 'ਰਾਮਪੁਰ' },
  'Shahjahanpur': { en: 'Shahjahanpur', hi: 'शाहजहांपुर', bn: 'শাহজাহানপুর', pa: 'ਸ਼ਾਹਜਹਾਨਪੁਰ' },
  'Sultanpur': { en: 'Sultanpur', hi: 'सुल्तानपुर', bn: 'সুলতানপুর', pa: 'ਸੁਲਤਾਨਪੁਰ' },
  'Unnao': { en: 'Unnao', hi: 'उन्नाव', bn: 'উন্নাও', pa: 'ਉਨਾਵ' },
  'Varanasi': { en: 'Varanasi', hi: 'वाराणसी', bn: 'বারাণসী', ml: 'വാരണാസി', ta: 'வாரணாசி', te: 'వారణాసి', pa: 'ਵਾਰਾਣਸੀ' },
  'Lucknow': { en: 'Lucknow', hi: 'लखनऊ', bn: 'লখনউ', ml: 'ലഖ്‌നൗ', ta: 'லக்னோ', te: 'లక్నో', pa: 'ਲਖਨਊ' },
  'Kanpur': { en: 'Kanpur', hi: 'कानपुर', bn: 'কানপুর', ml: 'കാൺപൂർ', ta: 'கான்பூர்', te: 'కాన్పూర్', pa: 'ਕਾਨਪੁਰ' },
  'Prayagraj': { en: 'Prayagraj', hi: 'प्रयागराज', bn: 'প্রয়াগরাজ', ml: 'പ്രയാഗ്‌രാജ്', ta: 'பிரயாக்ராஜ்', te: 'ప్రయాగ్‌రాజ్', pa: 'ਪ੍ਰਯਾਗਰਾਜ' },
  'Meerut': { en: 'Meerut', hi: 'मेरठ', bn: 'মিরাট', ml: 'മീററ്റ്', pa: 'ਮੇਰਠ' },
  'Agra': { en: 'Agra', hi: 'आगरा', bn: 'আগ্রা', ml: 'ആഗ്ര', ta: 'ஆக்ரா', te: 'ఆగ్రా', pa: 'ਆਗਰਾ' },
  'Gorakhpur': { en: 'Gorakhpur', hi: 'गोरखपुर', bn: 'গোরক্ষপুর', ml: 'ഗോരഖ്പൂർ', pa: 'ਗੋਰਖਪੁਰ' },
  'Bareilly': { en: 'Bareilly', hi: 'बरेली', bn: 'বেরেলি', ml: 'ബറേലി', pa: 'ਬਰੇਲੀ' },
  'Aligarh': { en: 'Aligarh', hi: 'अलीगढ़', bn: 'আলীগড়', ml: 'അലിഗഡ്', pa: 'ਅਲੀਗੜ੍ਹ' },
  'Moradabad': { en: 'Moradabad', hi: 'मुरादाबाद', bn: 'মুরাদাবাদ', ml: 'മൊറാദാബാദ്', pa: 'ਮੁਰਾਦਾਬਾਦ' },
  'Ayodhya': { en: 'Ayodhya', hi: 'अयोध्या', bn: 'অযোধ্যা', ml: 'അയോധ്യ', ta: 'அயோத்தி', te: 'అయోధ్య', pa: 'ਅਯੋਧਿਆ' },
  'Jhansi': { en: 'Jhansi', hi: 'झांसी', bn: 'ঝাঁসি', ml: 'ഝാൻസി', pa: 'ਝਾਂਸੀ' },
  'Muzaffarnagar': { en: 'Muzaffarnagar', hi: 'मुजफ्फरनगर', bn: 'মুজাফফরনগর', pa: 'ਮੁਜ਼ੱਫਰਨਗਰ' },
  'Saharanpur': { en: 'Saharanpur', hi: 'सहारनपुर', bn: 'সাহারানপুর', pa: 'ਸਹਾਰਨਪੁਰ' },
  'Barabanki': { en: 'Barabanki', hi: 'बाराबंकी', bn: 'বারাবাঁকি', pa: 'ਬਾਰਾਬੰਕੀ' },

  // Maharashtra
  'Pune': { en: 'Pune', mr: 'पुणे', hi: 'पुणे', bn: 'পুনে', ml: 'പൂനെ', ta: 'புனே', te: 'పూణే', kn: 'ಪುಣೆ', gu: 'પુણે' },
  'Nashik': { en: 'Nashik', mr: 'नाशिक', hi: 'नासिक', bn: 'নাসিক', ml: 'നാസിക്', ta: 'நாசிக்', te: 'నాసిక్', gu: 'નાસિક' },
  'Nagpur': { en: 'Nagpur', mr: 'नागपूर', hi: 'नागपुर', bn: 'নাগপুর', ml: 'നാഗ്പൂർ', ta: 'நாக்பூர்', te: 'నాగ్‌పూర్', gu: 'નાગપુર' },
  'Chhatrapati Sambhajinagar': { en: 'Chhatrapati Sambhajinagar', mr: 'छत्रपती संभाजीनगर', hi: 'छत्रपति संभाजीनगर', bn: 'ছত্রপতি সম্ভাজিনগর', ml: 'ഛത്രപതി സംഭാജിനഗർ' },
  'Kolhapur': { en: 'Kolhapur', mr: 'कोल्हापूर', hi: 'कोल्हापुर', bn: 'কোলহাপুর', ml: 'കോലാപ്പൂർ' },
  'Solapur': { en: 'Solapur', mr: 'सोलापूर', hi: 'सोलापुर', bn: 'সোলাপুর', ml: 'സോളാപൂർ' },
  'Amravati': { en: 'Amravati', mr: 'अमरावती', hi: 'अमरावती', bn: 'অমরাবতী', ml: 'അമരാവതി', te: 'అమరావతి' },
  'Ahmednagar': { en: 'Ahmednagar', mr: 'अहमदनगर', hi: 'अहमदनगर', bn: 'আহমেদনগর' },
  'Satara': { en: 'Satara', mr: 'सातारा', hi: 'सतारा', bn: 'সাতারা' },
  'Jalgaon': { en: 'Jalgaon', mr: 'जळगाव', hi: 'जलगांव', bn: 'জলগাঁও' },
  'Yavatmal': { en: 'Yavatmal', mr: 'यवतमाळ', hi: 'यवतमाल', bn: 'যবতমাল' },
  'Nanded': { en: 'Nanded', mr: 'नांदेड', hi: 'नांदेड़', bn: 'নান্দেড়' },
  'Sangli': { en: 'Sangli', mr: 'सांगली', hi: 'सांगली', bn: 'সাংলি' },
  'Latur': { en: 'Latur', mr: 'लातूर', hi: 'लातूर', bn: 'লাতুর' },
  'Buldhana': { en: 'Buldhana', mr: 'बुलढाणा', hi: 'बुलढाणा', bn: 'বুলদহানা' },

  // Gujarat
  'Rajkot': { en: 'Rajkot', gu: 'રાજકોટ', hi: 'राजकोट', bn: 'রাজকোট', ml: 'രാജ്‌കോട്ട്', mr: 'राजकोट' },
  'Surat': { en: 'Surat', gu: 'સુરત', hi: 'सूरत', bn: 'সুরাট', ml: 'സൂററ്റ്', mr: 'सुरत' },
  'Ahmedabad': { en: 'Ahmedabad', gu: 'અમદાવાદ', hi: 'अहमदाबाद', bn: 'আহমেদাবাদ', ml: 'അഹമ്മദാബാദ്', mr: 'अहमदाबाद' },
  'Vadodara': { en: 'Vadodara', gu: 'વડોદરા', hi: 'वडोदरा', bn: 'ভদোদরা', ml: 'വഡോദര', mr: 'वडोदरा' },
  'Bhavnagar': { en: 'Bhavnagar', gu: 'ભાવનગર', hi: 'भावनगर', bn: 'ভাবনগর', ml: 'ഭാവ്‌നഗർ' },
  'Junagadh': { en: 'Junagadh', gu: 'જૂનાગઢ', hi: 'जूनागढ़', bn: 'জুনাগড়', ml: 'ജുനാഗഡ്' },
  'Jamnagar': { en: 'Jamnagar', gu: 'જામનગર', hi: 'जामनगर', bn: 'জামনগর', ml: 'ജാംനഗർ' },
  'Anand': { en: 'Anand', gu: 'આણંદ', hi: 'आनंद', bn: 'আনন্দ' },
  'Mehsana': { en: 'Mehsana', gu: 'મહેસાણા', hi: 'मेहसाणा', bn: 'মেহসানা' },
  'Kutch': { en: 'Kutch', gu: 'કચ્છ', hi: 'कच्छ', bn: 'কচ্ছ' },
  'Amreli': { en: 'Amreli', gu: 'અમરેલી', hi: 'अमरेली', bn: 'আমরেলি' },
  'Banaskantha': { en: 'Banaskantha', gu: 'બનાસકાંઠા', hi: 'बनासकांठा', bn: 'বনাসকাঁথা' },
  'Patan': { en: 'Patan', gu: 'પાટણ', hi: 'पाटन', bn: 'পাটন' },
  'Bharuch': { en: 'Bharuch', gu: 'ભરૂચ', hi: 'भरूच', bn: 'ভরুচ' },
  'Surendranagar': { en: 'Surendranagar', gu: 'સુરેન્દ્રનગર', hi: 'सुरेंद्रनगर', bn: 'সুরেন্দ্রনগর' },

  // Tamil Nadu
  'Thanjavur': { en: 'Thanjavur', ta: 'தஞ்சாவூர்', hi: 'तंजावुर', bn: 'তাঞ্জাভুর', ml: 'തഞ്ചാവൂർ', te: 'తంజావూరు', kn: 'ತಂಜಾವೂರು' },
  'Coimbatore': { en: 'Coimbatore', ta: 'கோயம்புத்தூர்', hi: 'कोयंबटूर', bn: 'কোয়েম্বাটোর', ml: 'കോയമ്പത്തൂർ', te: 'కోయంబత్తూరు' },
  'Madurai': { en: 'Madurai', ta: 'மதுரை', hi: 'मदुरै', bn: 'মাদুরাই', ml: 'മധുര', te: 'మధురై', kn: 'ಮಧುರೈ' },
  'Tiruchirappalli': { en: 'Tiruchirappalli', ta: 'திருச்சிராப்பள்ளி', hi: 'तिरुचिरापल्ली', bn: 'তিরুচিরাপল্লী', ml: 'തിരുച്ചിറപ്പള്ളി' },
  'Salem': { en: 'Salem', ta: 'சேலம்', hi: 'सलेम', bn: 'সালেম', ml: 'സേലം' },
  'Erode': { en: 'Erode', ta: 'ஈரோடு', hi: 'इरोड', bn: 'ইরোড', ml: 'ഈറോഡ്' },
  'Tirunelveli': { en: 'Tirunelveli', ta: 'திருநெல்வேலி', hi: 'तिरुनेलवेली', bn: 'তিরুনেলভেলি', ml: 'തിരുനെൽവേലി' },
  'Dindigul': { en: 'Dindigul', ta: 'திண்டுக்கல்', hi: 'डिंडीगुल', bn: 'দিন্দিগুল', ml: 'ദിണ്ഡിഗൽ' },
  'Vellore': { en: 'Vellore', ta: 'வேலூர்', hi: 'वेल्लोर', bn: 'ভেলোর', ml: 'വെല്ലൂർ' },
  'Cuddalore': { en: 'Cuddalore', ta: 'கடலூர்', hi: 'कड्डालोर', bn: 'কাড্ডালোর', ml: 'കടലൂർ' },
  'Nagapattinam': { en: 'Nagapattinam', ta: 'நாகப்பட்டினம்', hi: 'नागापट्टिनम', bn: 'নাগাপত্তিনম', ml: 'നാഗപട്ടണം' },
  'Tiruvarur': { en: 'Tiruvarur', ta: 'திருவாரூர்', hi: 'तिरुवारूर', bn: 'তিরুভারুর', ml: 'തിരുവാരൂർ' },
  'Theni': { en: 'Theni', ta: 'தேனி', hi: 'थेनी', bn: 'থেনি', ml: 'തേനി' },
  'Dharmapuri': { en: 'Dharmapuri', ta: 'தர்மபுரி', hi: 'धर्मपुरी', bn: 'ধর্মপুরী', ml: 'ധർമ്മപുരി' },
  'Kanyakumari': { en: 'Kanyakumari', ta: 'கன்னியாகுமரி', hi: 'कन्याकुमारी', bn: 'কন্যাকুমারী', ml: 'കന്യാകുമാരി' },

  // Karnataka
  'Mysuru': { en: 'Mysuru', kn: 'ಮೈಸೂರು', hi: 'मैसूरु', bn: 'মহীশূর', ml: 'മൈസൂരു', ta: 'மைசூரு', te: 'మైసూర్' },
  'Belagavi': { en: 'Belagavi', kn: 'ಬೆಳಗಾವಿ', hi: 'बेलगावी', bn: 'বেলাগাভি', ml: 'ബെളഗാവി' },
  'Shivamogga': { en: 'Shivamogga', kn: 'ಶಿವಮೊಗ್ಗ', hi: 'शिवमोग्गा', bn: 'শিবমোগ্গা', ml: 'ശിവമോഗ್ഗ' },
  'Dharwad': { en: 'Dharwad', kn: 'ಧಾರವಾಡ', hi: 'धारवाड़', bn: 'ধারওয়াড়', ml: 'ധാർവാഡ്' },
  'Mandya': { en: 'Mandya', kn: 'ಮಂಡ್ಯ', hi: 'मांड्या', bn: 'মান্ড্য', ml: 'മാണ്ഡ്യ' },
  'Tumakuru': { en: 'Tumakuru', kn: 'ತುಮಕೂರು', hi: 'तुमकुरु', bn: 'তুমাকুরু', ml: 'തുമകൂരു' },
  'Hassan': { en: 'Hassan', kn: 'ಹಾಸನ', hi: 'हासन', bn: 'হাসান', ml: 'ഹാസൻ' },
  'Davangere': { en: 'Davangere', kn: 'ದಾವಣಗೆರೆ', hi: 'दावणगेरे', bn: 'দাভাঙ্গেরে', ml: 'ദാവൻഗരെ' },
  'Vijayapura': { en: 'Vijayapura', kn: 'ವಿಜಯಪುರ', hi: 'विजयपुरा', bn: 'বিজাপুর', ml: 'വിജയപുര' },
  'Chikkamagaluru': { en: 'Chikkamagaluru', kn: 'ಚಿಕ್ಕಮಗಳೂರು', hi: 'चिकमगलूरु', bn: 'চিকমাগালুর', ml: 'ചിക്കമംഗളൂരു' },
  'Ballari': { en: 'Ballari', kn: 'ಬಳ್ಳಾರಿ', hi: 'बल्लारी', bn: 'বেল্লারি', ml: 'ബല്ലാരി' },
  'Kalaburagi': { en: 'Kalaburagi', kn: 'ಕಲಬುರಗಿ', hi: 'कलबुर्गी', bn: 'কালবুর্গী', ml: 'കലബുർഗി' },
  'Udupi': { en: 'Udupi', kn: 'ಉಡುಪಿ', hi: 'उडुपी', bn: 'উডুপি', ml: 'ഉഡുപ്പി' },
  'Dakshina Kannada': { en: 'Dakshina Kannada', kn: 'ದಕ್ಷಿಣ ಕನ್ನಡ', hi: 'दक्षिण कन्नड़', bn: 'দক্ষিণ কন্নড়', ml: 'ദക്ഷിണ കന്നഡ' },
  'Bagalkote': { en: 'Bagalkote', kn: 'ಬಾಗಲಕೋಟೆ', hi: 'बागलकोट', bn: 'বাগলকোট', ml: 'ബാഗൽകോട്ട്' },

  // Andhra Pradesh & Telangana
  'Guntur': { en: 'Guntur', te: 'గుంటూరు', hi: 'गुंटूर', bn: 'গুন্টুর', ml: 'ഗുണ്ടൂർ', ta: 'குண்டூர்', kn: 'ಗುಂಟೂರು' },
  'Krishna': { en: 'Krishna', te: 'కృష్ణా', hi: 'कृष्णा', bn: 'কৃষ্ণা', ml: 'കൃഷ്ണ', ta: 'கிருஷ்ணா' },
  'East Godavari': { en: 'East Godavari', te: 'తూర్పు గోదావరి', hi: 'पूर्वी गोदावरी', bn: 'পূর্ব গোদাবরী', ml: 'കിഴക്കൻ ഗോദാവരി' },
  'West Godavari': { en: 'West Godavari', te: 'పశ్చిమ గోదావరి', hi: 'पश्चिम गोदावरी', bn: 'পশ্চিম গোদাবরী', ml: 'പശ്ചിമ ഗോദാവരി' },
  'Kurnool': { en: 'Kurnool', te: 'కర్నూలు', hi: 'कर्नूल', bn: 'কুর্নুল', ml: 'കർണൂൽ' },
  'Visakhapatnam': { en: 'Visakhapatnam', te: 'విశాఖపట్నం', hi: 'विशाखापट्टनम', bn: 'বিশাখাপত্তনম', ml: 'വിശാഖപട്ടണം', ta: 'விசாகப்பட்டினம்' },
  'Chittoor': { en: 'Chittoor', te: 'చిత్తూరు', hi: 'चित्तूर', bn: 'চিত্তুর', ml: 'ചിറ്റൂർ' },
  'Anantapur': { en: 'Anantapur', te: 'అనంతపురం', hi: 'अनंतपुर', bn: 'অনন্তপুর', ml: 'അനന്തപൂർ' },
  'SPSR Nellore': { en: 'SPSR Nellore', te: 'నెల్లూరు', hi: 'नेल्लोर', bn: 'নেল্লোর', ml: 'നെല്ലൂർ' },
  'Prakasam': { en: 'Prakasam', te: 'ప్రకాశం', hi: 'प्रकाशम', bn: 'প্রকাশম', ml: 'പ്രകാശം' },
  'YSR Kadapa': { en: 'YSR Kadapa', te: 'వైఎస్ఆర్ కడప', hi: 'कडपा', bn: 'কাদাপা', ml: 'കടപ്പ' },
  'Srikakulam': { en: 'Srikakulam', te: 'శ్రీకాకుళం', hi: 'श्रीकाकुलम', bn: 'শ্রীকাকুলাম', ml: 'ശ്രീകാകുളം' },
  'Vizianagaram': { en: 'Vizianagaram', te: 'విజయనగరం', hi: 'विजयनगरम', bn: 'বিজয়নগরম', ml: 'വിജയനഗരം' },
  'Warangal': { en: 'Warangal', te: 'వరంగల్', hi: 'वारंगल', bn: 'ওয়ারাঙ্গল', ml: 'വാറങ്കൽ' },
  'Karimnagar': { en: 'Karimnagar', te: 'కరీంనగర్', hi: 'करीमनगर', bn: 'করিম নগর', ml: 'കരീംനഗർ' },
  'Nizamabad': { en: 'Nizamabad', te: 'నిజామాబాద్', hi: 'निजामाबाद', bn: 'নিজামাবাদ', ml: 'നിസാമാബാദ്' },
  'Khammam': { en: 'Khammam', te: 'ఖమ్మం', hi: 'खम्मम', bn: 'খাম্মাম', ml: 'ഖമ്മം' },
  'Nalgonda': { en: 'Nalgonda', te: 'నల్గొండ', hi: 'नलगोंडा', bn: 'নালগোণ্ডা', ml: 'നൽഗൊണ്ട' },
  'Mahabubnagar': { en: 'Mahabubnagar', te: 'మహబూబ్‌నగర్', hi: 'महबूबनगर', bn: 'মেহবুবনগর', ml: 'മഹബൂബ് നഗർ' },
  'Ranga Reddy': { en: 'Ranga Reddy', te: 'రంగారెడ్డి', hi: 'रंगारेड्डी', bn: 'রঙ্গারেন্ডি', ml: 'രംഗറെഡ്ഡി' },
  'Medak': { en: 'Medak', te: 'మెదక్', hi: 'मेदक', bn: 'মেদাক', ml: 'മെദക്' },
  'Adilabad': { en: 'Adilabad', te: 'ఆదిలాబాద్', hi: 'आदिलाबाद', bn: 'আদিলাবাদ', ml: 'ആദിലാബാദ്' },
  'Siddipet': { en: 'Siddipet', te: 'సిద్దిపేట', hi: 'सिद्दीपेट', bn: 'সিদ্দিপেট', ml: 'സിദ്ധിപേട്ട്' },

  // Bihar, Rajasthan, MP, Odisha, Assam, J&K
  'Patna': { en: 'Patna', hi: 'पटना', bn: 'পাটনা', ml: 'പട്ന', ta: 'பாட்னா', te: 'పాట్నా' },
  'Gaya': { en: 'Gaya', hi: 'गया', bn: 'গয়া', ml: 'ഗയ' },
  'Muzaffarpur': { en: 'Muzaffarpur', hi: 'मुजफ्फरपुर', bn: 'মুজাফফরপুর', ml: 'മുസാഫർപൂർ' },
  'Bhagalpur': { en: 'Bhagalpur', hi: 'भागलपुर', bn: 'ভাগলপুর', ml: 'ഭാഗൽപൂർ' },
  'Darbhanga': { en: 'Darbhanga', hi: 'दरभंगा', bn: 'দারভাঙ্গা', ml: 'ദർഭംഗ' },
  'Purnia': { en: 'Purnia', hi: 'पूर्णिया', bn: 'পূর্ণিয়া' },
  'Samastipur': { en: 'Samastipur', hi: 'समस्तीपुर', bn: 'সমস্তিপুর' },
  'Begusarai': { en: 'Begusarai', hi: 'बेगूसराय', bn: 'বেগুসরাই' },
  'Rohtas': { en: 'Rohtas', hi: 'रोहतास', bn: 'রোহতাস' },
  'Vaishali': { en: 'Vaishali', hi: 'वैशाली', bn: 'বৈশালী' },
  'Nalanda': { en: 'Nalanda', hi: 'नालंदा', bn: 'নালন্দা' },
  'Saran': { en: 'Saran', hi: 'सारण', bn: 'সারণ' },
  'Siwan': { en: 'Siwan', hi: 'सीवान', bn: 'সিওয়ান' },
  'Madhubani': { en: 'Madhubani', hi: 'मधुबनी', bn: 'মধুবনী' },
  'Saharsa': { en: 'Saharsa', hi: 'सहरसा', bn: 'সহরসা' },

  'Jaipur': { en: 'Jaipur', hi: 'जयपुर', bn: 'জয়পুর', ml: 'ജയ്പൂർ', ta: 'ஜெய்ப்பூர்', te: 'జైపూర్', gu: 'જયપુર', pa: 'ਜੈਪੁਰ' },
  'Jodhpur': { en: 'Jodhpur', hi: 'जोधपुर', bn: 'যোধপুর', ml: 'ജോധ്പൂർ', gu: 'જોધપુર', pa: 'ਜੋਧਪੁਰ' },
  'Kota': { en: 'Kota', hi: 'कोटा', bn: 'কোটা', ml: 'കോട്ട', gu: 'કોટા', pa: 'ਕੋਟਾ' },
  'Bikaner': { en: 'Bikaner', hi: 'बीकानेर', bn: 'বিকানের', ml: 'ബിക്കാനീർ', gu: 'બિકાનેર' },
  'Sri Ganganagar': { en: 'Sri Ganganagar', hi: 'श्रीगंगानगर', bn: 'শ্রী গঙ্গানগর', pa: 'ਸ੍ਰੀ ਗੰਗਾਨਗਰ' },
  'Udaipur': { en: 'Udaipur', hi: 'उदयपुर', bn: 'উদয়পুর', ml: 'ഉദയ്പൂർ', gu: 'ઉદયપુર' },
  'Alwar': { en: 'Alwar', hi: 'अलवर', bn: 'আলওয়ার' },
  'Bharatpur': { en: 'Bharatpur', hi: 'भरतपुर', bn: 'ভরতপুর' },
  'Hanumangarh': { en: 'Hanumangarh', hi: 'हनुमानगढ़', bn: 'হনুমানগড়', pa: 'ਹਨੂਮਾਨਗੜ੍ਹ' },
  'Nagaur': { en: 'Nagaur', hi: 'नागौर', bn: 'নাগৌর' },
  'Sikar': { en: 'Sikar', hi: 'सीकर', bn: 'সীকর' },
  'Barmer': { en: 'Barmer', hi: 'बाड़मेर', bn: 'বারমের' },
  'Chittorgarh': { en: 'Chittorgarh', hi: 'चित्तौड़गढ़', bn: 'চিত্তোরগড়' },
  'Pali': { en: 'Pali', hi: 'पाली', bn: 'পালি' },
  'Tonk': { en: 'Tonk', hi: 'टोंक', bn: 'টঙ্ক' },

  'Indore': { en: 'Indore', hi: 'इंदौर', bn: 'ইন্দোর', ml: 'ഇൻഡോർ', gu: 'ઇન્દોર', mr: 'इंदूर' },
  'Ujjain': { en: 'Ujjain', hi: 'उज्जैन', bn: 'উজ্জয়িনী', ml: 'ഉജ്ജയിൻ', gu: 'ઉજ્જૈન', mr: 'उज्जैन' },
  'Bhopal': { en: 'Bhopal', hi: 'भोपाल', bn: 'ভোপাল', ml: 'ഭോപ്പാൽ', ta: 'போபால்', te: 'భోపాల్', gu: 'ભોપાલ', mr: 'भोपाळ' },
  'Jabalpur': { en: 'Jabalpur', hi: 'जबलपुर', bn: 'জবলপুর', ml: 'ജബൽപൂർ', mr: 'जबलपूर' },
  'Gwalior': { en: 'Gwalior', hi: 'ग्वालियर', bn: 'গোয়ালিয়র', ml: 'ഗ്വാളിയോർ', mr: 'ग्वाल्हेर' },
  'Sagar': { en: 'Sagar', hi: 'सागर', bn: 'সাগর' },
  'Dewas': { en: 'Dewas', hi: 'देवास', bn: 'দেওয়াস' },
  'Khargone': { en: 'Khargone', hi: 'खरगोन', bn: 'খারগোন' },
  'Dhar': { en: 'Dhar', hi: 'धार', bn: 'ধার' },
  'Chhindwara': { en: 'Chhindwara', hi: 'छिंदवाड़ा', bn: 'ছিন্দওয়াড়া' },
  'Ratlam': { en: 'Ratlam', hi: 'रतलाम', bn: 'রতলাম' },
  'Rewa': { en: 'Rewa', hi: 'रीवा', bn: 'রেওয়া' },
  'Sehore': { en: 'Sehore', hi: 'सीहोर', bn: 'সিহোর' },
  'Vidisha': { en: 'Vidisha', hi: 'विदिशा', bn: 'বিদিশা' },

  'Cuttack': { en: 'Cuttack', or: 'କଟକ', hi: 'कटक', bn: 'কটক', ml: 'കട്ടക്ക്' },
  'Balasore': { en: 'Balasore', or: 'ବାଲେଶ୍ୱର', hi: 'बालेश्वर', bn: 'বালেশ্বর', ml: 'ബാലസോർ' },
  'Sambalpur': { en: 'Sambalpur', or: 'ସମ୍ବଲପୁର', hi: 'संबलपुर', bn: 'সম্বলপুর' },
  'Bargarh': { en: 'Bargarh', or: 'ବରଗଡ଼', hi: 'बरगढ़', bn: 'বরগড়' },
  'Ganjam': { en: 'Ganjam', or: 'ଗଞ୍ଜାମ', hi: 'गंजम', bn: 'গঞ্জাম' },
  'Puri': { en: 'Puri', or: 'ପୁରୀ', hi: 'पुरी', bn: 'পুরী', ml: 'പുരി' },
  'Khurda': { en: 'Khurda', or: 'ଖୋର୍ଦ୍ଧା', hi: 'खुर्दा', bn: 'খুরদা' },
  'Bhadrak': { en: 'Bhadrak', or: 'ଭଦ୍ରକ', hi: 'भद्रक', bn: 'ভদ্রক' },
  'Koraput': { en: 'Koraput', or: 'କୋରାପୁଟ', hi: 'कोरापुट', bn: 'কোরাপুট' },
  'Mayurbhanj': { en: 'Mayurbhanj', or: 'ମୟୂରଭଞ୍ଜ', hi: 'मयूरभंज', bn: 'ময়ূরভঞ্জ' },
  'Sundargarh': { en: 'Sundargarh', or: 'ସୁନ୍ଦରଗଡ଼', hi: 'सुंदरगढ़', bn: 'সুন্দরগড়' },
  'Kalahandi': { en: 'Kalahandi', or: 'କଳାହାଣ୍ଡି', hi: 'कालाहांडी', bn: 'কালাহান্ডি' },
  'Bolangir': { en: 'Bolangir', or: 'ବଲାଙ୍ਗୀର', hi: 'बलांगीर', bn: 'বলাঙ্গীর' },
  'Jajpur': { en: 'Jajpur', or: 'ଯାଜପୁର', hi: 'जाजपुर', bn: 'যাজপুর' },

  'Kamrup': { en: 'Kamrup', as: 'কামৰূপ', hi: 'कामरूप', bn: 'কামরূপ', ml: 'കാമരൂപ്' },
  'Dibrugarh': { en: 'Dibrugarh', as: 'ডিব্ৰুগড়', hi: 'डिब्रूगढ़', bn: 'ডিব্রুগড়', ml: 'ദിബ്രുഗഡ്' },
  'Nagaon': { en: 'Nagaon', as: 'নগাঁও', hi: 'नगांव', bn: 'নগাঁও' },
  'Jorhat': { en: 'Jorhat', as: 'যোৰহাট', hi: 'जोरहाट', bn: 'যোরহাট' },
  'Cachar': { en: 'Cachar', as: 'কাছাৰ', hi: 'कछार', bn: 'কাছাড়' },
  'Sonitpur': { en: 'Sonitpur', as: 'শোণিতপুৰ', hi: 'शोणितपुर', bn: 'শোনিতপুর' },
  'Barpeta': { en: 'Barpeta', as: 'বৰপেটা', hi: 'बरपेटा', bn: 'বরপেটা' },
  'Tinsukia': { en: 'Tinsukia', as: 'তিনিচুকীয়া', hi: 'तिनसुकिया', bn: 'তিনসুকিয়া' },
  'Golaghat': { en: 'Golaghat', as: 'গোলাঘাট', hi: 'गोलाघाट', bn: 'গোলাঘাট' },
  'Darrang': { en: 'Darrang', as: 'দৰং', hi: 'दरंग', bn: 'দরং' },
  'Sivasagar': { en: 'Sivasagar', as: 'শিৱসাগৰ', hi: 'शिवसागर', bn: 'শিবসাগর' },
  'Lakhimpur': { en: 'Lakhimpur', as: 'লখিমপুৰ', hi: 'लखीमपुर', bn: 'লখিমপুর' },
  'Goalpara': { en: 'Goalpara', as: 'গোৱালপাৰা', hi: 'गोलपारा', bn: 'গোয়ালপাড়া' },
  'Karbi Anglong': { en: 'Karbi Anglong', as: 'কাৰ্বি আংলং', hi: 'कार्बी आंगलोंग', bn: 'কার্বি আংলং' },

  'Srinagar': { en: 'Srinagar', hi: 'श्रीनगर', bn: 'শ্রীনগর', ml: 'ശ്രീനഗർ', pa: 'ਸ਼੍ਰੀਨਗਰ' },
  'Baramulla': { en: 'Baramulla', hi: 'बारामूला', bn: 'বারামুল্লা', pa: 'ਬਾਰਾਮੂਲਾ' },
  'Anantnag': { en: 'Anantnag', hi: 'अनंतनाग', bn: 'অনন্তনাগ', pa: 'ਅਨੰਤਨਾਗ' },
  'Jammu': { en: 'Jammu', hi: 'जम्मू', bn: 'জম্মু', ml: 'ജമ്മു', pa: 'ਜੰਮੂ' },
  'Pulwama': { en: 'Pulwama', hi: 'पुलवामा', bn: 'পুলওয়ামা' },
  'Kathua': { en: 'Kathua', hi: 'कठुआ', bn: 'কাঠুয়া' },
  'Budgam': { en: 'Budgam', hi: 'बडगाम', bn: 'বুদগাম' },
  'Kupwara': { en: 'Kupwara', hi: 'कुपवाड़ा', bn: 'কুপওয়ারা' },
  'Udhampur': { en: 'Udhampur', hi: 'उधमपुर', bn: 'উধমপুর' },
  'Shopian': { en: 'Shopian', hi: 'शोपियां', bn: 'শোপিয়ান' },
};

/**
 * Translates an Indian state or district name to the given active language.
 * Falls back safely to the original name if untranslated or if lang is 'en'.
 * Supports compound strings like "Ludhiana, Punjab" or "Purba Bardhaman, West Bengal".
 */
/**
 * Common geographical keywords & suffixes mapped to Indic languages.
 */
const COMMON_GEO_TERMS: Record<string, Partial<Record<LanguageCode, string>>> = {
  nagar: { hi: 'नगर', mr: 'नगर', bn: 'নগর', as: 'নগৰ', pa: 'ਨਗਰ', gu: 'નગર', ta: 'நகர்', te: 'నగర్', kn: 'ನಗರ', ml: 'നഗർ', or: 'ନଗର' },
  pur: { hi: 'पुर', mr: 'पूर', bn: 'পুর', as: 'পুৰ', pa: 'ਪੁਰ', gu: 'પુર', ta: 'புரம்', te: 'పురం', kn: 'ಪುರ', ml: 'പുരം', or: 'ପୁର' },
  puri: { hi: 'पुरी', mr: 'पुरी', bn: 'পুরী', as: 'পুৰী', pa: 'ਪੁਰੀ', gu: 'પુરી', ta: 'புரி', te: 'పురి', kn: 'ಪುರಿ', ml: 'പുരി', or: 'ପୁରୀ' },
  garh: { hi: 'गढ़', mr: 'गड', bn: 'গড়', as: 'গড়', pa: 'ਗੜ੍ਹ', gu: 'ગઢ', ta: 'கட்', te: 'గఢ్', kn: 'ಗಢ', ml: 'ഗഡ്', or: 'ଗଡ଼' },
  ganj: { hi: 'गंज', mr: 'गंज', bn: 'গঞ্জ', as: 'গঞ্জ', pa: 'ਗੰਜ', gu: 'ગંજ', ta: 'கஞ்ச்', te: 'గంజ్', kn: 'ಗಂಜ್', ml: 'ഗഞ്ച്', or: 'ଗଞ୍ଜ' },
  north: { hi: 'उत्तर', mr: 'उत्तर', bn: 'উত্তর', as: 'উত্তৰ', pa: 'ਉੱਤਰੀ', gu: 'ઉત્તર', ta: 'வடக்கு', te: 'ఉత్తర', kn: 'ಉತ್ತರ', ml: 'വടക്കൻ', or: 'ଉତ୍ତର' },
  south: { hi: 'दक्षिण', mr: 'दक्षिण', bn: 'দক্ষিণ', as: 'দক্ষিণ', pa: 'ਦੱਖਣੀ', gu: 'દક્ષિણ', ta: 'தெற்கு', te: 'దక్షిణ', kn: 'ದಕ್ಷಿಣ', ml: 'തെക്കൻ', or: 'ଦକ୍ଷିଣ' },
  east: { hi: 'पूर्व', mr: 'पूर्व', bn: 'পূর্ব', as: 'পূব', pa: 'ਪੂਰਬੀ', gu: 'પૂર્વ', ta: 'கிழக்கு', te: 'తూర్పు', kn: 'ಪೂರ್ವ', ml: 'കിഴക്കൻ', or: 'ପୂର୍ବ' },
  west: { hi: 'पश्चिम', mr: 'पश्चिम', bn: 'পশ্চিম', as: 'পশ্চিম', pa: 'ਪੱਛਮੀ', gu: 'ਪશ્ચિમ', ta: 'மேற்கு', te: 'పశ్చిమ', kn: 'ಪಶ್ಚಿಮ', ml: 'പടിഞ്ഞാറൻ', or: 'ପଶ୍ଚିਮ' },
  central: { hi: 'मध्य', mr: 'मध्य', bn: 'মধ্য', as: 'মধ্য', pa: 'ਕੇਂਦਰੀ', gu: 'મધ્ય', ta: 'மத்திய', te: 'మధ్య', kn: 'ಮಧ್ಯ', ml: 'മധ്യ', or: 'ମଧ୍ୟ' },
  urban: { hi: 'शहरी', mr: 'शहरी', bn: 'শহুরে', as: 'নগৰীয়া', pa: 'ਸ਼ਹਿਰੀ', gu: 'શહેરી', ta: 'நகர்ப்புற', te: 'పట్టణ', kn: 'ನಗರ', ml: 'നഗരം', or: 'ସହରାଞ୍ଚଳ' },
  rural: { hi: 'ग्रामीण', mr: 'ग्रामीण', bn: 'গ্রামীণ', as: 'গ্ৰাম্য', pa: 'ਪੇਂਡੂ', gu: 'ગ્રામીણ', ta: 'ஊரக', te: 'గ్రామీణ', kn: 'ಗ್ರಾಮೀಣ', ml: 'ഗ്രാമീണ', or: 'ଗ୍ରାମୀଣ' },
  city: { hi: 'शहर', mr: 'शहर', bn: 'শহর', as: 'চহৰ', pa: 'ਸ਼ਹਿਰ', gu: 'શહેર', ta: 'நகரம்', te: 'నగరం', kn: 'ನಗರ', ml: 'നഗരം', or: 'ସହର' },
  district: { hi: 'ज़िला', mr: 'जिल्हा', bn: 'জেলা', as: 'জিলা', pa: 'ਜ਼ਿਲ੍ਹਾ', gu: 'જિલ્લો', ta: 'மாவட்டம்', te: 'జిల్లా', kn: 'ಜಿಲ್ಲೆ', ml: 'ജില്ല', or: 'ଜିଲ୍ଲା' },
  ambedkar: { hi: 'अम्बेडकर', mr: 'आंबेडकर', bn: 'আম্বেদকর', as: 'আম্বেদকাৰ', pa: 'ਅੰਬੇਡਕਰ', gu: 'આંબેડકર', ta: 'அம்பேத்கர்', te: 'అంబేద్కర్', kn: 'ಅಂಬೇಡ್ಕರ್', ml: 'അംബേദ്കർ', or: 'ଆମ୍ବେଦକର' },
};

/**
 * Dynamic transliteration fallback for Indian place names into Indic scripts.
 * Gracefully translates known words/suffixes or preserves English tokens.
 */
export function dynamicIndicTransliterate(name: string, lang: LanguageCode): string {
  if (!name || lang === 'en') return name;
  const words = name.trim().split(/\s+/);
  let changed = false;

  const translatedWords = words.map((word) => {
    const cleanWord = word.toLowerCase().replace(/[^a-z0-9]/g, '');
    const term = COMMON_GEO_TERMS[cleanWord];
    if (term && term[lang]) {
      changed = true;
      return term[lang]!;
    }
    // Check if word itself has direct entry in DISTRICT_TRANSLATIONS
    for (const [k, v] of Object.entries(DISTRICT_TRANSLATIONS)) {
      if (k.toLowerCase() === cleanWord && v[lang]) {
        changed = true;
        return v[lang]!;
      }
    }
    return word;
  });

  if (!changed) return name;

  // Prevent mixed-language / partial word replacement bug (e.g., "Dadra and नगर Haveli", "जम्मू and Kashmir"):
  // If the result contains BOTH Latin letters [a-zA-Z] and Indic Unicode characters, reject partial replacement!
  const result = translatedWords.join(' ');
  const hasLatin = /[a-zA-Z]/.test(result);
  const hasIndic = /[^\u0000-\u007F]/.test(result);
  if (hasLatin && hasIndic) {
    return name;
  }

  return result;
}

/**
 * Translates an Indian state or district name to the given active language.
 * Falls back safely to the original name if untranslated or if lang is 'en'.
 * Supports compound strings like "Ludhiana, Punjab" or "Ambedkar Nagar, Uttar Pradesh".
 */
export function translateLocation(name: string | null | undefined, lang: LanguageCode): string {
  if (!name || lang === 'en') return name || '';
  const trimmed = name.trim();

  // 1. Direct State Match (Exact Full String)
  if (STATE_TRANSLATIONS[trimmed]?.[lang]) {
    return STATE_TRANSLATIONS[trimmed][lang]!;
  }

  // 1b. Normalized State Match (Exact Full String with Case/Ampersand Invariance)
  const cleanTrimmedState = trimmed.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const matchedStateKey = Object.keys(STATE_TRANSLATIONS).find((k) => {
    const cleanK = k.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
    return cleanK === cleanTrimmedState;
  });
  if (matchedStateKey && STATE_TRANSLATIONS[matchedStateKey]?.[lang]) {
    return STATE_TRANSLATIONS[matchedStateKey][lang]!;
  }

  // 2. Direct District Match (Exact Full String)
  if (DISTRICT_TRANSLATIONS[trimmed]?.[lang]) {
    return DISTRICT_TRANSLATIONS[trimmed][lang]!;
  }

  // 2b. Normalized District Match (Exact Full String with Case Invariance)
  const cleanTrimmedDist = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedDistKey = Object.keys(DISTRICT_TRANSLATIONS).find((k) => {
    const cleanK = k.toLowerCase().replace(/[^a-z0-9]/g, '');
    return cleanK === cleanTrimmedDist;
  });
  if (matchedDistKey && DISTRICT_TRANSLATIONS[matchedDistKey]?.[lang]) {
    return DISTRICT_TRANSLATIONS[matchedDistKey]![lang]!;
  }

  // 3. Comma-separated compound match (e.g. "Ambedkar Nagar, Uttar Pradesh")
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    return parts.map((p) => translateLocation(p, lang)).join(', ');
  }

  // 4. Dynamic Indic Transliteration Fallback
  const transliterated = dynamicIndicTransliterate(trimmed, lang);
  if (transliterated && transliterated !== trimmed) {
    return transliterated;
  }

  // 5. Graceful fallback to English
  return trimmed;
}

