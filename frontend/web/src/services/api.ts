import axios from 'axios';

const BASE_URL = 'http://localhost:8000/api/v1/analytics';

const adminKey = (import.meta as any).env?.VITE_ADMIN_API_KEY || '';

const api = axios.create({
  baseURL: BASE_URL,
  timeout: 10000,
  headers: {
    ...(adminKey ? { 'X-Admin-Key': adminKey } : {}),
  },
});

export interface TopQuery {
  query: string;
  count: number;
}

export interface RegionStats {
  region: string;
  count: number;
}

export interface DailyVolume {
  date: string;
  count: number;
}

export interface PerformanceStats {
  avg_response_time_ms: number;
  avg_retrieval_time_ms: number;
  avg_llm_time_ms: number;
  cache_hit_rate: number;
  total_queries: number;
  voice_queries: number;
  text_queries: number;
}

export interface TopQueryItem {
  query: string;
  count: number;
}

export interface DistrictDistributionItem {
  district: string;
  count: number;
  percentage: number;
}

export interface DailyVolumeItem {
  date: string;
  count: number;
}

export interface ModalityCounts {
  text: number;
  voice: number;
  image: number;
}

export interface UnifiedAnalyticsResponse {
  total_queries: number;
  avg_latency: number;
  avg_latency_ms: number;
  top_queries: TopQueryItem[];
  district_distribution: DistrictDistributionItem[];
  daily_volume: DailyVolumeItem[];
  modality_counts: ModalityCounts;
}

export const analyticsService = {
  getAnalytics: async (): Promise<UnifiedAnalyticsResponse> => {
    const res = await api.get<UnifiedAnalyticsResponse>('');
    return res.data;
  },

  getTopQueries: async (limit = 10): Promise<TopQuery[]> => {
    const res = await api.get<TopQuery[]>(`/top-queries?limit=${limit}`);
    return res.data;
  },
  
  getByRegion: async (): Promise<RegionStats[]> => {
    const res = await api.get<RegionStats[]>('/by-region');
    return res.data;
  },
  
  getDailyVolume: async (days = 30): Promise<DailyVolume[]> => {
    const res = await api.get<DailyVolume[]>(`/daily-volume?days=${days}`);
    return res.data;
  },

  getPerformanceStats: async (): Promise<PerformanceStats> => {
    const res = await api.get<PerformanceStats>('/performance');
    return res.data;
  }
};

