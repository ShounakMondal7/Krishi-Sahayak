// Storage service — offline-capable query cache + history + hardware-backed secure store
// Extends the history log to also support offline fuzzy matching
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const HISTORY_KEY = 'krishi_query_history';
const OFFLINE_CACHE_KEY = 'krishi_offline_cache';
const FARMER_PROFILE_KEY = 'krishi_farmer_profile';
const MAX_HISTORY = 50;         // Increased from 20
const MAX_OFFLINE_CACHE = 50;   // Separate cap for offline answers

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
        await SecureStore.setItemAsync(key, legacyValue);
        await AsyncStorage.removeItem(key).catch(() => {});
        return legacyValue;
      }
      return null;
    }
  } catch {
    // Fallback
  }
  return await AsyncStorage.getItem(key);
}

/**
 * Encrypts and stores item in hardware-backed SecureStore (iOS Keychain / Android Keystore).
 */
async function setSecureItem(key: string, value: string): Promise<void> {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.setItemAsync(key, value);
      // Purge any unencrypted plain-text copy
      await AsyncStorage.removeItem(key).catch(() => {});
      return;
    }
  } catch {
    // Fallback
  }
  await AsyncStorage.setItem(key, value);
}

/**
 * Securely deletes item from both SecureStore and AsyncStorage.
 */
async function removeSecureItem(key: string): Promise<void> {
  try {
    const isAvailable = await isSecureStoreAvailable();
    if (isAvailable) {
      await SecureStore.deleteItemAsync(key).catch(() => {});
    }
  } catch {}
  await AsyncStorage.removeItem(key).catch(() => {});
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface FarmerProfile {
  farmerId: string;           // e.g., "KISAN-IN-8492" or phone
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
  question: string;             // Original Malayalam question
  questionNormalized: string;   // Lowercase, stripped — for matching
  answer: string;
  sources: string[];
  region?: string;
  cachedAt: string;             // ISO string
}

// ── History ────────────────────────────────────────────────────────────────

export const storageService = {
  async getHistory(): Promise<HistoryEntry[]> {
    try {
      const raw = await AsyncStorage.getItem(HISTORY_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
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
    await AsyncStorage.removeItem(HISTORY_KEY);
  },

  async getSavedLanguage(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('krishi_language');
    } catch {
      return null;
    }
  },

  async getLanguage(): Promise<string> {
    try {
      return (await AsyncStorage.getItem('krishi_language')) || 'en';
    } catch {
      return 'en';
    }
  },

  async setLanguage(lang: string): Promise<void> {
    try {
      await AsyncStorage.setItem('krishi_language', lang);
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
    try {
      const raw = await getSecureItem(FARMER_PROFILE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  },

  async setFarmerProfile(profile: FarmerProfile): Promise<void> {
    try {
      await setSecureItem(FARMER_PROFILE_KEY, JSON.stringify(profile));
      profileListeners.forEach((fn) => fn(profile));
    } catch {}
  },

  async clearFarmerProfile(): Promise<void> {
    try {
      await removeSecureItem(FARMER_PROFILE_KEY);
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

  async hasCompletedOnboarding(): Promise<boolean> {
    try {
      const val = await AsyncStorage.getItem('krishi_onboarding_done');
      return val === 'true';
    } catch {
      return false;
    }
  },

  async setOnboardingComplete(): Promise<void> {
    try {
      await AsyncStorage.setItem('krishi_onboarding_done', 'true');
      onboardingListeners.forEach((fn) => fn('dashboard'));
    } catch {}
  },

  async resetOnboarding(): Promise<void> {
    try {
      await removeSecureItem(FARMER_PROFILE_KEY);
      await AsyncStorage.removeItem('krishi_onboarding_done');
      await AsyncStorage.removeItem('krishi_saved_location');
      onboardingListeners.forEach((fn) => fn('language'));
    } catch {}
  },

  async logout(): Promise<void> {
    try {
      await removeSecureItem(FARMER_PROFILE_KEY);
      await AsyncStorage.removeItem('krishi_onboarding_done');
      await AsyncStorage.removeItem('krishi_saved_location');
      profileListeners.forEach((fn) => fn(null));
      onboardingListeners.forEach((fn) => fn('language'));
    } catch (err) {
      console.error('Logout failed:', err);
    }
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
  async saveLocation(state: string, district: string): Promise<void> {
    try {
      const loc = { state, district };
      await AsyncStorage.setItem('krishi_saved_location', JSON.stringify(loc));
      locationListeners.forEach((fn) => fn(loc));
    } catch {}
  },

  async getSavedLocation(): Promise<{ state: string; district: string } | null> {
    try {
      const raw = await AsyncStorage.getItem('krishi_saved_location');
      return raw ? JSON.parse(raw) : null;
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
