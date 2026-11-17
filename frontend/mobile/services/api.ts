// API service layer — all communication with the FastAPI backend
import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import {
  PUBLIC_TUNNEL_URL,
  LAN_BACKEND_URL,
  LOCALHOST_BACKEND_URL,
  EMULATOR_BACKEND_URL,
} from '../constants/backend_endpoints';

// ==============================================================================
// ⚠️ DYNAMIC BACKEND API URL RESOLUTION & SMART MULTI-ENDPOINT AUTO-FAILOVER
// ==============================================================================
// Candidate URL priority:
// 1. process.env.EXPO_PUBLIC_API_URL (Public HTTPS tunnel e.g. https://krishi-sahayak-ai.loca.lt)
// 2. PUBLIC_TUNNEL_URL constant
// 3. Dynamic browser hostname (if web) or Metro bundler host IP (if Expo Go)
// 4. Discovered LAN IP (http://10.180.42.135:8000)
// 5. Localhost / Android Emulator loopback
// ==============================================================================

export const buildCandidateUrls = (): string[] => {
  const candidates: string[] = [];

  // 1. Environment variable override (Public HTTPS Tunnel)
  const envUrl = process.env.EXPO_PUBLIC_API_URL?.trim();
  if (envUrl && envUrl.startsWith('http')) {
    candidates.push(envUrl.replace(/\/+$/, ''));
  }

  // 2. Pre-configured Public Tunnel URL
  if (PUBLIC_TUNNEL_URL && PUBLIC_TUNNEL_URL.startsWith('http')) {
    candidates.push(PUBLIC_TUNNEL_URL.replace(/\/+$/, ''));
  }

  // 3. Dynamic host extraction from Browser window or Expo Metro bundler
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    const host = window.location.hostname;
    if (host && host !== 'localhost' && host !== '127.0.0.1') {
      const port = window.location.port === '8000' ? '' : ':8000';
      candidates.push(`${window.location.protocol}//${host}${port}`);
    }
  }

  const hostUri =
    Constants.expoConfig?.hostUri ||
    (Constants.manifest2 as any)?.extra?.expoGo?.debuggerHost ||
    (Constants as any).manifest?.debuggerHost;

  if (hostUri) {
    const host = hostUri.split(':')[0];
    if (host && host !== 'localhost' && host !== '127.0.0.1' && host.includes('.')) {
      candidates.push(`http://${host}:8000`);
    }
  }

  // 4. Discovered LAN IP
  if (LAN_BACKEND_URL) {
    candidates.push(LAN_BACKEND_URL.replace(/\/+$/, ''));
  }

  // 5. Localhost & Emulator fallbacks
  if (Platform.OS === 'android') {
    candidates.push(EMULATOR_BACKEND_URL);
  }
  candidates.push(LOCALHOST_BACKEND_URL);
  candidates.push('http://127.0.0.1:8000');

  // Deduplicate preserving priority order
  const uniqueUrls: string[] = [];
  for (const url of candidates) {
    const clean = url.trim().replace(/\/+$/, '');
    if (clean && !uniqueUrls.includes(clean)) {
      uniqueUrls.push(clean);
    }
  }
  return uniqueUrls;
};

export const candidateUrls: string[] = buildCandidateUrls();
let activeCandidateIndex = 0;

export const getActiveBaseUrl = (): string => {
  return candidateUrls[activeCandidateIndex] || candidateUrls[0] || 'http://localhost:8000';
};

export const getBaseUrl = (): string => getActiveBaseUrl();

// Mutable BASE_URL for backward compatibility
export let BASE_URL: string = getActiveBaseUrl();

// Set global axios defaults to bypass localtunnel and ngrok warning pages
axios.defaults.headers.common['bypass-tunnel-reminder'] = 'true';
axios.defaults.headers.common['ngrok-skip-browser-warning'] = 'true';

// ── Axios Instance with Smart Auto-Failover ──────────────────────────────────
export const api = axios.create({
  baseURL: BASE_URL,
  timeout: 35000,
  headers: {
    'Content-Type': 'application/json',
    'bypass-tunnel-reminder': 'true',
    'ngrok-skip-browser-warning': 'true',
  },
});

// Request interceptor: Ensure active baseURL and bypass headers are always present
api.interceptors.request.use((config) => {
  config.baseURL = getActiveBaseUrl();
  config.headers = config.headers || {};
  config.headers['bypass-tunnel-reminder'] = 'true';
  config.headers['ngrok-skip-browser-warning'] = 'true';
  return config;
});

// Response interceptor: Transparent failover to next candidate on Network Error or 502/503/504
api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const config = error.config as (InternalAxiosRequestConfig & { _retryCount?: number }) | undefined;
    if (!config) {
      return Promise.reject(error);
    }

    const isNetworkError =
      !error.response ||
      error.code === 'ERR_NETWORK' ||
      error.code === 'ECONNABORTED' ||
      error.message.includes('Network Error');
    const isGatewayError =
      error.response && [502, 503, 504].includes(error.response.status);

    if (isNetworkError || isGatewayError) {
      const retryCount = config._retryCount || 0;
      if (retryCount < candidateUrls.length - 1) {
        config._retryCount = retryCount + 1;
        activeCandidateIndex = (activeCandidateIndex + 1) % candidateUrls.length;
        const nextUrl = candidateUrls[activeCandidateIndex];
        BASE_URL = nextUrl;
        api.defaults.baseURL = nextUrl;
        config.baseURL = nextUrl;
        console.warn(`[API Failover] Retrying request on candidate ${activeCandidateIndex + 1}/${candidateUrls.length}: ${nextUrl}`);
        return api(config);
      }
    }
    return Promise.reject(error);
  }
);

// Global axios interceptor as well for any raw axios calls
axios.interceptors.request.use((config) => {
  config.headers = config.headers || {};
  config.headers['bypass-tunnel-reminder'] = 'true';
  config.headers['ngrok-skip-browser-warning'] = 'true';
  return config;
});

/**
 * Pings candidate endpoints in order to lock onto the fastest available backend.
 */
export async function checkBackendConnection(): Promise<{ connected: boolean; url: string; error?: string }> {
  for (let i = 0; i < candidateUrls.length; i++) {
    const url = candidateUrls[i];
    try {
      const res = await axios.get(`${url}/health`, {
        timeout: 4000,
        headers: {
          'bypass-tunnel-reminder': 'true',
          'ngrok-skip-browser-warning': 'true',
        },
      });
      if (res.status === 200 && res.data?.status === 'ok') {
        activeCandidateIndex = i;
        BASE_URL = url;
        api.defaults.baseURL = url;
        return { connected: true, url };
      }
    } catch {
      // try next candidate
    }
  }
  return { connected: false, url: getActiveBaseUrl(), error: 'All backend endpoints unreachable' };
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface QueryRequest {
  question: string;
  language?: string;
  region?: string;
  session_id?: string;
  conversation_id?: string;
}

export interface SourceLabel {
  filename: string;
  display_name: string;
  relevance_score?: number;
}

export interface TimingBreakdown {
  translation_input_ms?: number;
  retrieval_ms?: number;
  llm_ms?: number;
  translation_output_ms?: number;
  total_ms: number;
}

export interface QueryResponse {
  query_id?: number;
  conversation_id?: string;
  answer: string;
  answer_english: string;
  sources: string[];
  source_labels?: SourceLabel[];
  response_time_ms: number;
  from_cache: boolean;
  weather_context_used?: boolean;
  market_context_used?: boolean;
  is_msp?: boolean;
  market_badge_label?: string;
  intent?: string;
  follow_up_questions?: string[];
  timing?: TimingBreakdown;
}

export interface VoiceQueryResponse extends QueryResponse {
  transcribed_text: string;
}

export interface ImageQueryResponse extends QueryResponse {
  symptom_description?: string;
}

export interface HealthResponse {
  status: string;
  chroma_documents: number;
  db: string;
  version: string;
  uptime_seconds?: number;
  timestamp: string;
}

// ── API Methods ────────────────────────────────────────────────────────────

export const apiService = {
  /**
   * Submit a text query in Indian languages.
   */
  async query(params: QueryRequest): Promise<QueryResponse> {
    const response = await api.post<QueryResponse>('/api/v1/query', params);
    return response.data;
  },

  /**
   * Submit a voice query as multipart/form-data.
   * Cross-platform support for Web (Blob/File) and Native (URI object).
   */
  async voiceQuery(
    audioData: string | Blob,
    region?: string,
    language: string = 'en',
    conversationId?: string,
  ): Promise<VoiceQueryResponse> {
    const formData = new FormData();

    if (Platform.OS === 'web') {
      let blob: Blob;
      if (typeof audioData === 'string') {
        blob = await fetch(audioData).then((r) => r.blob());
      } else {
        blob = audioData;
      }
      formData.append('audio', blob, 'recording.webm');
      formData.append('audio_file', blob, 'recording.webm');
    } else {
      const uri = typeof audioData === 'string' ? audioData : (audioData as any).uri;
      const fileObj = {
        uri,
        type: 'audio/m4a',
        name: 'recording.m4a',
      } as any;
      formData.append('audio', fileObj);
      formData.append('audio_file', fileObj);
    }

    if (region) {
      formData.append('region', region);
    }
    formData.append('language', language);
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }
    formData.append('encoding', Platform.OS === 'web' ? 'WEBM_OPUS' : 'LINEAR16');

    // On Web, omit Content-Type so Axios/browser automatically sets the multipart boundary
    const headers: Record<string, string> = {};
    if (Platform.OS !== 'web') {
      headers['Content-Type'] = 'multipart/form-data';
    }

    const response = await api.post<VoiceQueryResponse>(
      '/api/v1/voice-query',
      formData,
      { headers, timeout: 45000 },
    );
    return response.data;
  },

  /**
   * Submit an image query for crop disease diagnosis.
   */
  async imageQuery(
    imageData: string | Blob,
    cropName: string = 'crop',
    region?: string,
    language: string = 'en',
    conversationId?: string,
  ): Promise<ImageQueryResponse> {
    const formData = new FormData();
    const filename = typeof imageData === 'string' ? (imageData.split('/').pop() || 'crop.jpg') : 'crop.jpg';

    if (Platform.OS === 'web') {
      let blob: Blob;
      if (typeof imageData === 'string') {
        blob = await fetch(imageData).then((r) => r.blob());
      } else {
        blob = imageData;
      }
      formData.append('image', blob, filename);
    } else {
      formData.append('image', {
        uri: imageData,
        type: 'image/jpeg',
        name: filename,
      } as any);
    }

    formData.append('question', `Diagnose crop disease for ${cropName} and provide ICAR treatment guidelines.`);
    formData.append('language', language);
    if (region) {
      formData.append('region', region);
    }
    if (conversationId) {
      formData.append('conversation_id', conversationId);
    }

    const headers: Record<string, string> = {};
    if (Platform.OS !== 'web') {
      headers['Content-Type'] = 'multipart/form-data';
    }

    const response = await api.post<ImageQueryResponse>(
      '/api/v1/image-query',
      formData,
      { headers, timeout: 60000 },
    );
    return response.data;
  },

  /**
   * System health check.
   */
  async health(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },

  checkBackendConnection,
};

export default apiService;
