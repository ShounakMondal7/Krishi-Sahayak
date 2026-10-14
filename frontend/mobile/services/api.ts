// API service layer — all communication with the FastAPI backend
import axios from 'axios';
import Constants from 'expo-constants';

// ==============================================================================
// ⚠️ IMPORTANT: BACKEND API URL CONFIGURATION (FIX FOR STANDALONE APK BUILD)
// ==============================================================================
// Standalone APKs on physical Android devices CANNOT reach 'localhost' or '127.0.0.1'
// because "localhost" refers to the mobile device itself, not your PC.
//
// BEFORE TRIGGERING AN EAS APK BUILD:
// 1. Find your PC's local Wi-Fi IPv4 address (run `ipconfig` in cmd/powershell).
// 2. Set EXPO_PUBLIC_API_URL in `frontend/mobile/.env` to:
//       http://<YOUR_LOCAL_WIFI_IP>:8000  (e.g., http://192.168.1.100:8000)
//    Or use an Ngrok tunnel:
//       https://your-subdomain.ngrok-free.app
// ==============================================================================
export const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  Constants.expoConfig?.extra?.apiUrl ||
  'http://localhost:8000';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 30000,
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
   * Submit a text query in Malayalam.
   */
  async query(params: QueryRequest): Promise<QueryResponse> {
    const response = await api.post<QueryResponse>('/api/v1/query', params);
    return response.data;
  },

  /**
   * Submit a voice query as multipart/form-data.
   * audio: URI of the recorded audio file
   */
  async voiceQuery(
    audioUri: string,
    region?: string,
  ): Promise<VoiceQueryResponse> {
    const formData = new FormData();
    // React Native FormData accepts URI-based file objects
    formData.append('audio', {
      uri: audioUri,
      type: 'audio/webm',
      name: 'voice_query.webm',
    } as any);

    if (region) {
      formData.append('region', region);
    }
    formData.append('encoding', 'WEBM_OPUS');

    const response = await api.post<VoiceQueryResponse>(
      '/api/v1/voice-query',
      formData,
      {
        headers: { 'Content-Type': 'multipart/form-data' },
      },
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
