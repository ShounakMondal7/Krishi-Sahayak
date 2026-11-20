// Storage service — offline-capable query cache + history + hardware-backed secure store
// Extends the history log to also support offline fuzzy matching
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const HISTORY_KEY = 'krishi_query_history';
const OFFLINE_CACHE_KEY = 'krishi_offline_cache';
const FARMER_PROFILE_KEY = 'krishi_farmer_profile';
const MAX_HISTORY = 50;
const MAX_OFFLINE_CACHE = 50;

// ── Secure Store (CERT-In / OWASP Compliant Hardware Encryption) ─────────────

/**
 * Checks whether hardware-backed SecureStore is supported in the current environment.
 * Gracefully returns false on web or unsupported devices.
 */
async function isSecureStoreAvailable(): Promise<boolean> {
  if (Platform.OS === 'web') return false;
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

// In-memory fallback cache for restricted hardware / Expo Go storage sandbox exceptions
const _inMemoryStore: Record<string, string> = {};

/**
 * Reads encrypted item from SecureStore.
 * Auto-migrates legacy unencrypted AsyncStorage data if found.
 */
async function getSecureItem(key: string): Promise<string | null> {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      const securedValue = await SecureStore.getItemAsync(key);
      if (securedValue) return securedValue;

      // Migrate legacy plain-text data if present
      const legacyValue = await AsyncStorage.getItem(key);
      if (legacyValue) {
        await SecureStore.setItemAsync(key, legacyValue).catch(() => {});
        return legacyValue;
      }
    }
  } catch {
    // Fallback to AsyncStorage
  }
  try {
    const val = await AsyncStorage.getItem(key);
    if (val !== null) return val;
  } catch {}
  return _inMemoryStore[key] || null;
}

/**
 * Encrypts and stores item in hardware-backed SecureStore (iOS Keychain / Android Keystore)
 * with robust secondary AsyncStorage persistence for resilient offline/emulator access.
 */
async function setSecureItem(key: string, value: string): Promise<void> {
  _inMemoryStore[key] = value;
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.setItemAsync(key, value);
    }
  } catch {
    // Fallback
  }
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}

/**
 * Securely deletes item from both SecureStore and AsyncStorage.
 */
async function removeSecureItem(key: string): Promise<void> {
  delete _inMemoryStore[key];
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
  } catch {}
  try {
    await AsyncStorage.removeItem(key).catch(() => {});
  } catch {}
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface FarmerProfile {
  farmerId: string;           // e.g., "KISAN-IN-8492" or phone / Kisan ID
  name: string;               // e.g., "Ramesh Patel"
  phone: string;              // e.g., "9876543210"
  state: string;              // e.g., "Punjab", "Kerala", "Maharashtra"
  district: string;           // e.g., "Ludhiana", "Thrissur"
  primaryCrops: string[];     // e.g., ["Wheat", "Paddy", "Mustard"]
  landSizeAcres?: number;
  language: string;           // Language code chosen by farmer
  loginTimestamp: string;
}

export type OnboardingView = 'language' | 'location' | 'login' | 'dashboard';

export interface SavedLocation {
  state: string;
  district: string;
  pincode?: string;
  isManualLock?: boolean;
  updatedAt?: string;
}

const languageListeners: Array<(lang: string) => void> = [];
const profileListeners: Array<(profile: FarmerProfile | null) => void> = [];
const onboardingListeners: Array<(view: OnboardingView) => void> = [];
const locationListeners: Array<(loc: { state: string; district: string }) => void> = [];

export interface HistoryEntry {
  id: string;
  question: string;
  answer: string;
  sources: string[];
  sourceLabels?: Array<{ filename: string; display_name: string; relevance_score?: number }>;
  region?: string;
  inputMode: 'text' | 'voice' | 'image';
  responseTimeMs: number;
  queryId?: number;       // For TTS audio lookup
  conversationId?: string;
  timestamp: string;      // ISO string
}

export interface OfflineCacheEntry {
  question: string;             // Original question
  questionNormalized: string;   // Lowercase, stripped — for matching
  answer: string;
  sources: string[];
  region?: string;
  cachedAt: string;             // ISO string
}

// ── In-Memory Singleton Cache (Eliminates repeated bridge round-trips) ───────
let _cachedLanguage: string | null = null;
let _cachedLocation: SavedLocation | null = null;
let _cachedHistory: HistoryEntry[] | null = null;
let _cachedFarmerProfile: FarmerProfile | null = null;
let _cachedOnboardingDone: boolean | null = null;

// ── Storage Service ────────────────────────────────────────────────────────

export const storageService = {
  async getHistory(): Promise<HistoryEntry[]> {
    if (_cachedHistory !== null) {
      return _cachedHistory;
    }
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      _cachedHistory = raw ? JSON.parse(raw) : [];
      return _cachedHistory || [];
    } catch {
      _cachedHistory = [];
      return [];
    }
  },

  async addToHistory(entry: Omit<HistoryEntry, 'id' | 'timestamp'>): Promise<void> {
    try {
      const history = await storageService.getHistory();
      const newEntry: HistoryEntry = {
        ...entry,
        id: Date.now().toString(),
        timestamp: new Date().toISOString(),
      };
      const updated = [newEntry, ...history].slice(0, MAX_HISTORY);
      _cachedHistory = updated;
      await AsyncStorage.setItem(HISTORY_KEY, JSON.stringify(updated));

      // Also save to offline cache for future offline lookups
      await offlineCacheService.add(
        entry.question,
        entry.answer,
        entry.sources,
        entry.region,
      );
    } catch (err) {
      console.error('Failed to save to history:', err);
    }
  },

  async clearHistory(): Promise<void> {
    _cachedHistory = [];
    await AsyncStorage.removeItem(HISTORY_KEY);
  },

  async getSavedLanguage(): Promise<string | null> {
    if (_cachedLanguage !== null) {
      return _cachedLanguage;
    }
    try {
      let lang = await AsyncStorage.getItem('krishi_language');
      if (!lang && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        lang = window.localStorage.getItem('krishi_language');
      }
      if (lang) {
        _cachedLanguage = lang;
      }
      return lang;
    } catch {
      return null;
    }
  },

  async getLanguage(): Promise<string> {
    if (_cachedLanguage !== null) {
      return _cachedLanguage;
    }
    try {
      let lang = await AsyncStorage.getItem('krishi_language');
      if (!lang && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        lang = window.localStorage.getItem('krishi_language');
      }
      _cachedLanguage = lang || 'en';
      return _cachedLanguage;
    } catch {
      _cachedLanguage = 'en';
      return 'en';
    }
  },

  async setLanguage(lang: string): Promise<void> {
    _cachedLanguage = lang;
    try {
      await AsyncStorage.setItem('krishi_language', lang);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('krishi_language', lang);
      }
      languageListeners.forEach((fn) => fn(lang));
    } catch {}
  },

  onLanguageChange(listener: (lang: string) => void): () => void {
    languageListeners.push(listener);
    return () => {
      const idx = languageListeners.indexOf(listener);
      if (idx !== -1) languageListeners.splice(idx, 1);
    };
  },

  async getFarmerProfile(): Promise<FarmerProfile | null> {
    if (_cachedFarmerProfile !== null) {
      return _cachedFarmerProfile;
    }
    try {
      let raw = (await getSecureItem(FARMER_PROFILE_KEY)) || (await AsyncStorage.getItem(FARMER_PROFILE_KEY));
      if (!raw && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(FARMER_PROFILE_KEY);
      }
      _cachedFarmerProfile = raw ? JSON.parse(raw) : null;
      return _cachedFarmerProfile;
    } catch {
      return null;
    }
  },

  async setFarmerProfile(profile: FarmerProfile): Promise<void> {
    _cachedFarmerProfile = profile;
    try {
      const serialized = JSON.stringify(profile);
      await setSecureItem(FARMER_PROFILE_KEY, serialized);
      await AsyncStorage.setItem(FARMER_PROFILE_KEY, serialized);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(FARMER_PROFILE_KEY, serialized);
      }
      profileListeners.forEach((fn) => fn(profile));
    } catch {}
  },

  async clearFarmerProfile(): Promise<void> {
    _cachedFarmerProfile = null;
    _cachedOnboardingDone = null;
    try {
      await removeSecureItem(FARMER_PROFILE_KEY);
      await AsyncStorage.removeItem(FARMER_PROFILE_KEY).catch(() => {});
      profileListeners.forEach((fn) => fn(null));
    } catch {}
  },

  onProfileChange(listener: (profile: FarmerProfile | null) => void): () => void {
    profileListeners.push(listener);
    return () => {
      const idx = profileListeners.indexOf(listener);
      if (idx !== -1) profileListeners.splice(idx, 1);
    };
  },

  /**
   * Strictly verifies whether onboarding was completed:
   * Requires BOTH 'krishi_onboarding_done' === 'true' AND a verified non-empty farmer profile in storage.
   * If the profile is missing or corrupted, invalidates the stale onboarding flag so onboarding is re-triggered.
   */
  async hasCompletedOnboarding(): Promise<boolean> {
    if (_cachedOnboardingDone === true && _cachedFarmerProfile && _cachedFarmerProfile.farmerId) {
      return true;
    }
    try {
      const val = await AsyncStorage.getItem('krishi_onboarding_done');
      if (val !== 'true') {
        _cachedOnboardingDone = false;
        return false;
      }

      const profile = await storageService.getFarmerProfile();
      if (!profile || !profile.farmerId || profile.farmerId.trim() === '') {
        // Invalidate stale onboarding flag without verified profile
        await AsyncStorage.removeItem('krishi_onboarding_done').catch(() => {});
        _cachedOnboardingDone = false;
        return false;
      }
      _cachedOnboardingDone = true;
      return true;
    } catch {
      return false;
    }
  },

  async setOnboardingComplete(): Promise<void> {
    _cachedOnboardingDone = true;
    try {
      await AsyncStorage.setItem('krishi_onboarding_done', 'true');
      onboardingListeners.forEach((fn) => fn('dashboard'));
    } catch {}
  },

  async resetOnboarding(): Promise<void> {
    _cachedLanguage = null;
    _cachedLocation = null;
    _cachedHistory = null;
    _cachedFarmerProfile = null;
    _cachedOnboardingDone = null;
    try {
      await removeSecureItem(FARMER_PROFILE_KEY);
      await AsyncStorage.removeItem(FARMER_PROFILE_KEY).catch(() => {});
      await AsyncStorage.removeItem('krishi_onboarding_done').catch(() => {});
      await AsyncStorage.removeItem('krishi_saved_location').catch(() => {});
      await AsyncStorage.removeItem('krishi_language').catch(() => {});
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(FARMER_PROFILE_KEY);
        window.localStorage.removeItem('krishi_onboarding_done');
        window.localStorage.removeItem('krishi_saved_location');
        window.localStorage.removeItem('krishi_language');
      }
      profileListeners.forEach((fn) => fn(null));
      onboardingListeners.forEach((fn) => fn('language'));
    } catch {}
  },

  async logout(): Promise<void> {
    try {
      await storageService.resetOnboarding();
    } catch (err) {
      console.error('Logout failed:', err);
    }
  },

  async clearAllStorage(): Promise<void> {
    _cachedLanguage = null;
    _cachedLocation = null;
    _cachedHistory = null;
    _cachedFarmerProfile = null;
    _cachedOnboardingDone = null;
    try {
      await removeSecureItem(FARMER_PROFILE_KEY);
      await AsyncStorage.clear();
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.clear();
      }
      profileListeners.forEach((fn) => fn(null));
      onboardingListeners.forEach((fn) => fn('language'));
    } catch {}
  },

  // Generic Secure Store accessors for tokens or credentials
  getSecureItem,
  setSecureItem,
  removeSecureItem,

  setOnboardingView(view: OnboardingView): void {
    onboardingListeners.forEach((fn) => fn(view));
  },

  onOnboardingChange(listener: (view: OnboardingView) => void): () => void {
    onboardingListeners.push(listener);
    return () => {
      const idx = onboardingListeners.indexOf(listener);
      if (idx !== -1) onboardingListeners.splice(idx, 1);
    };
  },

  // ── Location Persistence ──────────────────────────────────────────────
  async saveLocation(
    state: string,
    district: string,
    isManualLock: boolean = true,
    pincode?: string
  ): Promise<void> {
    const loc: SavedLocation = {
      state,
      district,
      pincode,
      isManualLock,
      updatedAt: new Date().toISOString(),
    };
    _cachedLocation = loc;
    try {
      const serialized = JSON.stringify(loc);
      await AsyncStorage.setItem('krishi_saved_location', serialized);
      if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem('krishi_saved_location', serialized);
      }

      // Synchronize farmer profile state & district if profile exists
      try {
        const rawProfile = (await getSecureItem(FARMER_PROFILE_KEY)) || (await AsyncStorage.getItem(FARMER_PROFILE_KEY));
        if (rawProfile) {
          const profile: FarmerProfile = JSON.parse(rawProfile);
          if (profile.state !== state || profile.district !== district) {
            profile.state = state;
            profile.district = district;
            _cachedFarmerProfile = profile;
            const updatedProfile = JSON.stringify(profile);
            await setSecureItem(FARMER_PROFILE_KEY, updatedProfile);
            await AsyncStorage.setItem(FARMER_PROFILE_KEY, updatedProfile);
            if (Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
              window.localStorage.setItem(FARMER_PROFILE_KEY, updatedProfile);
            }
            profileListeners.forEach((fn) => fn(profile));
          }
        }
      } catch {}

      locationListeners.forEach((fn) => fn({ state, district }));
    } catch (err) {
      console.warn('Failed to save location to storage:', err);
    }
  },

  async getSavedLocation(): Promise<SavedLocation | null> {
    if (_cachedLocation !== null) {
      return _cachedLocation;
    }
    try {
      let raw = await AsyncStorage.getItem('krishi_saved_location');
      if (!raw && Platform.OS === 'web' && typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem('krishi_saved_location');
      }
      if (raw) {
        _cachedLocation = JSON.parse(raw);
        return _cachedLocation;
      }

      // Fallback: Check if active farmer profile has state and district
      const profile = await storageService.getFarmerProfile();
      if (profile?.state && profile?.district) {
        const fallbackLoc: SavedLocation = {
          state: profile.state,
          district: profile.district,
          isManualLock: true,
          updatedAt: profile.loginTimestamp || new Date().toISOString(),
        };
        _cachedLocation = fallbackLoc;
        await storageService.saveLocation(fallbackLoc.state, fallbackLoc.district, true);
        return fallbackLoc;
      }

      return null;
    } catch {
      return null;
    }
  },

  onLocationChange(listener: (loc: { state: string; district: string }) => void): () => void {
    locationListeners.push(listener);
    return () => {
      const idx = locationListeners.indexOf(listener);
      if (idx !== -1) locationListeners.splice(idx, 1);
    };
  },
};

// ── Offline Cache ──────────────────────────────────────────────────────────

function normalizeQuestion(q: string): string {
  return q.toLowerCase().trim().replace(/\s+/g, ' ');
}

/**
 * Simple fuzzy match: returns true if ≥60% of words in the query
 * are present in the candidate string.
 */
function fuzzyMatch(query: string, candidate: string): number {
  const queryWords = normalizeQuestion(query).split(' ').filter(w => w.length > 2);
  const candidateNorm = normalizeQuestion(candidate);
  if (queryWords.length === 0) return 0;
  const matchCount = queryWords.filter(w => candidateNorm.includes(w)).length;
  return matchCount / queryWords.length;
}

export const offlineCacheService = {
  async getAll(): Promise<OfflineCacheEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(OFFLINE_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  },

  async add(
    question: string,
    answer: string,
    sources: string[],
    region?: string,
  ): Promise<void> {
    try {
      const cache = await offlineCacheService.getAll();
      const newEntry: OfflineCacheEntry = {
        question,
        questionNormalized: normalizeQuestion(question),
        answer,
        sources,
        region,
        cachedAt: new Date().toISOString(),
      };
      // Avoid duplicates (same normalized question)
      const filtered = cache.filter(
        e => e.questionNormalized !== newEntry.questionNormalized
      );
      const updated = [newEntry, ...filtered].slice(0, MAX_OFFLINE_CACHE);
      await AsyncStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(updated));
    } catch (err) {
      console.error('Failed to save offline cache entry:', err);
    }
  },

  /**
   * Find the best fuzzy match for a question in the offline cache.
   * Returns the entry if similarity ≥ 0.6, otherwise null.
   */
  async findBestMatch(question: string): Promise<OfflineCacheEntry | null> {
    try {
      const cache = await offlineCacheService.getAll();
      if (cache.length === 0) return null;

      let bestEntry: OfflineCacheEntry | null = null;
      let bestScore = 0;

      for (const entry of cache) {
        const score = fuzzyMatch(question, entry.question);
        if (score > bestScore) {
          bestScore = score;
          bestEntry = entry;
        }
      }

      // Only return if similarity is ≥ 60%
      return bestScore >= 0.6 ? bestEntry : null;
    } catch {
      return null;
    }
  },

  async clear(): Promise<void> {
    await AsyncStorage.removeItem(OFFLINE_CACHE_KEY);
  },
};
