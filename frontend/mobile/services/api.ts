// API service layer — all communication with the FastAPI backend
import axios from 'axios';
import Constants from 'expo-constants';
import { Platform } from 'react-native';

// ==============================================================================
// ⚠️ DYNAMIC BACKEND API URL RESOLUTION
// ==============================================================================
// Web uses standard localhost:8000 (avoids LAN IP CORS blocks during local testing)
// Android Emulator requires 10.0.2.2 to bridge to the host machine's localhost:8000
// Physical device uses the configured LAN IPv4 address (e.g., 10.180.41.217:8000)
// ==============================================================================
export const getBaseUrl = (): string => {
  if (Platform.OS === 'web') {
    return 'http://localhost:8000';
  }
  const envUrl = process.env.EXPO_PUBLIC_API_URL;
  if (Platform.OS === 'android') {
    // If a LAN IP (e.g. 192.168.x.x / 10.x.x.x) or domain is configured, use it
    if (envUrl && !envUrl.includes('localhost') && !envUrl.includes('127.0.0.1')) {
      return envUrl;
    }
    // Android Studio Emulator loopback bridge to host machine
    return 'http://10.0.2.2:8000';
  }
  if (envUrl) {
    return envUrl;
  }
  return (Constants.expoConfig?.extra as any)?.apiUrl || 'http://localhost:8000';
};

export const BASE_URL = getBaseUrl();

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 35000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Types ──────────────────────────────────────────────────────────────────

export interface QueryRequest {
  question: string;
  language?: string;
  region?: string;
  session_id?: string;
}

export interface TimingBreakdown {
  translation_input_ms?: number;
  retrieval_ms?: number;
  llm_ms?: number;
  translation_output_ms?: number;
  total_ms: number;
}

export interface QueryResponse {
  answer: string;
  answer_english: string;
  sources: string[];
  response_time_ms: number;
  from_cache: boolean;
  timing?: TimingBreakdown;
}

export interface VoiceQueryResponse extends QueryResponse {
  transcribed_text: string;
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
   * System health check.
   */
  async health(): Promise<HealthResponse> {
    const response = await api.get<HealthResponse>('/health');
    return response.data;
  },
};

export default apiService;
