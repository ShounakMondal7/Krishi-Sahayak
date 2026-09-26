import React, { useEffect, useState, useMemo } from 'react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line, CartesianGrid
} from 'recharts';
import {
  Activity, MapPin, MessageSquare, Clock, Database,
  Sprout, ShieldCheck, RefreshCw, Search,
  TrendingUp, CheckCircle2, Layers, BarChart3, Table as TableIcon,
  AlertCircle
} from 'lucide-react';
import {
  analyticsService,
  UnifiedAnalyticsResponse
} from '../services/api';

// High-contrast, sunlight-accessible palette conforming to WCAG 2.1 AA
const PIE_COLORS = [
  '#1B5E20', // Forest Green (krishi-primary)
  '#16A34A', // Emerald 600 (krishi-accent)
  '#0D9488', // Teal 600
  '#0284C7', // Sky 600
  '#F59E0B', // Amber 500 (krishi-warning)
  '#EA580C', // Orange 600
  '#7C3AED', // Violet 600
  '#475569', // Slate 600 (krishi-textMuted)
  '#059669', // Emerald 700
  '#2563EB', // Blue 600
];

interface CropFilter {
  id: string;
  name: string;
  icon: string;
  keyword: string;
}

const PAN_INDIA_CROPS: CropFilter[] = [
  { id: 'all', name: 'All Queries', icon: '🌾', keyword: '' },
  { id: 'paddy', name: 'Paddy / Rice', icon: '🌾', keyword: 'paddy|rice|നെല്ല്|धान' },
  { id: 'wheat', name: 'Wheat', icon: '🌾', keyword: 'wheat|गेहूं|ഗോതമ്പ്' },
  { id: 'cotton', name: 'Cotton', icon: '☁️', keyword: 'cotton|कपास|പരുത്തി' },
  { id: 'tomato', name: 'Tomato', icon: '🍅', keyword: 'tomato|टमाटर|തക്കാളി' },
  { id: 'potato', name: 'Potato', icon: '🥔', keyword: 'potato|आलू|ഉരുളക്കിഴങ്ങ്' },
  { id: 'coconut', name: 'Coconut', icon: '🌴', keyword: 'coconut|नारियल|തെങ്ങ്|തേങ്ങ' },
  { id: 'spices', name: 'Spices & Pepper', icon: '🌶️', keyword: 'pepper|spice|കുരുമുളക്|मसाला' },
];

/**
 * Infer crop category and tag from query text
 */
function inferQueryMetadata(queryText: string): { crop: string; category: string; tag: string } {
  const lower = queryText.toLowerCase();
  let crop = 'Pan-India Agriculture';
  let category = 'ICAR Package of Practice';
  let tag = 'General Advisory';

  if (lower.includes('paddy') || lower.includes('rice') || lower.includes('നെല്ല്') || lower.includes('धान')) {
    crop = 'Paddy Rice';
    category = 'Cereal Crop';
  } else if (lower.includes('wheat') || lower.includes('गेहूं') || lower.includes('ഗോതമ്പ്')) {
    crop = 'Wheat & Grain';
    category = 'Rabi Crop';
  } else if (lower.includes('cotton') || lower.includes('कपास') || lower.includes('പരുത്തി')) {
    crop = 'Cotton Crop';
    category = 'Commercial Fiber';
  } else if (lower.includes('tomato') || lower.includes('टमाटर') || lower.includes('തക്കാളി')) {
    crop = 'Tomato Vine';
    category = 'Vegetable Cultivation';
  } else if (lower.includes('potato') || lower.includes('आलू') || lower.includes('ഉരുളക്കിഴങ്ങ്')) {
    crop = 'Potato Crop';
    category = 'Horticulture';
  } else if (lower.includes('coconut') || lower.includes('नारियल') || lower.includes('തെങ്ങ്')) {
    crop = 'Coconut Palm';
    category = 'Plantation Crop';
  } else if (lower.includes('pepper') || lower.includes('കുരുമുളക്') || lower.includes('spice')) {
    crop = 'Spices & Pepper';
    category = 'High-Value Spice';
  }

  if (lower.includes('pest') || lower.includes('insect') || lower.includes('കീട') || lower.includes('कीट') || lower.includes('worm')) {
    tag = 'Pest Management';
  } else if (lower.includes('disease') || lower.includes('blight') || lower.includes('rust') || lower.includes('രോഗം') || lower.includes('रोग') || lower.includes('fung')) {
    tag = 'Disease Control';
  } else if (lower.includes('price') || lower.includes('mandi') || lower.includes('msp') || lower.includes('മാർക്കറ്റ്') || lower.includes('मंडी')) {
    tag = 'Market & MSP';
  } else if (lower.includes('weather') || lower.includes('rain') || lower.includes('മഴ') || lower.includes('मौसम')) {
    tag = 'Weather Advisory';
  } else if (lower.includes('fertilizer') || lower.includes('nutrient') || lower.includes('വളം') || lower.includes('उर्वरक')) {
    tag = 'Soil & Nutrition';
  }

  return { crop, category, tag };
}

const Dashboard: React.FC = () => {
  const [analytics, setAnalytics] = useState<UnifiedAnalyticsResponse | null>(null);
  const [selectedCrop, setSelectedCrop] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [activeQueryView, setActiveQueryView] = useState<'table' | 'chart'>('table');
  const [lastSyncTime, setLastSyncTime] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const fetchData = async () => {
    setIsRefreshing(true);
    setErrorMessage(null);
    try {
      const data = await analyticsService.getAnalytics();
      setAnalytics(data);
      setLastSyncTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      console.error('Failed to load telemetry from backend:', err);
      setErrorMessage(
        'Unable to reach backend analytics service at http://localhost:8000/api/v1/analytics. Please ensure the backend is running.'
      );
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 30000); // 30-second live telemetry refresh
    return () => clearInterval(interval);
  }, []);

  // Filter top queries by selected crop keyword and search query
  const filteredQueries = useMemo(() => {
    if (!analytics || !analytics.top_queries) return [];

    const activeCropFilter = PAN_INDIA_CROPS.find((c) => c.id === selectedCrop);
    const regex = activeCropFilter && activeCropFilter.keyword ? new RegExp(activeCropFilter.keyword, 'i') : null;

    return analytics.top_queries.filter((item) => {
      const matchesCrop = !regex || regex.test(item.query);
      const matchesSearch =
        !searchQuery.trim() ||
        item.query.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesCrop && matchesSearch;
    });
  }, [analytics, selectedCrop, searchQuery]);

  if (loading) {
    return (
      <div className="bg-krishi-canvas min-h-screen text-krishi-textMain font-sans flex items-center justify-center p-8">
        <div className="bg-krishi-surface border border-krishi-border rounded-2xl p-8 shadow-sm flex flex-col items-center gap-4 text-center max-w-md">
          <div className="w-12 h-12 rounded-full bg-emerald-50 border border-krishi-border flex items-center justify-center text-krishi-primary animate-spin">
            <RefreshCw className="w-6 h-6 text-krishi-accent" />
          </div>
          <h2 className="text-xl font-bold text-krishi-textMain">Connecting to Krishi Sahayak Telemetry</h2>
          <p className="text-sm text-krishi-textMuted">
            Querying live ICAR knowledge-grounded database and regional telemetry...
          </p>
        </div>
      </div>
    );
  }

  const totalQueries = analytics?.total_queries || 0;
  const avgLatencySec = analytics?.avg_latency || 0;
  const avgLatencyMs = analytics?.avg_latency_ms || 0;
  const topQueries = analytics?.top_queries || [];
  const districtDistribution = analytics?.district_distribution || [];
  const dailyVolume = analytics?.daily_volume || [];
  const modalityCounts = analytics?.modality_counts || { text: 0, voice: 0, image: 0 };
  const totalModality = modalityCounts.text + modalityCounts.voice + modalityCounts.image;

  return (
    <div className="bg-krishi-canvas min-h-screen text-krishi-textMain font-sans pb-16">
      {/* ── TOP BRAND HEADER & PILOT BADGES ── */}
      <header className="bg-krishi-surface border-b border-krishi-border sticky top-0 z-30 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-krishi-border flex items-center justify-center text-krishi-primary shadow-xs">
              <Sprout className="w-6 h-6 text-krishi-accent" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-lg text-krishi-textMain tracking-tight">
                  Krishi Sahayak
                </span>
                <span className="text-xs bg-emerald-100 text-krishi-primary font-bold px-2 py-0.5 rounded-full border border-emerald-300">
                  RESEARCH PILOT
                </span>
              </div>
              <p className="text-xs text-krishi-textMuted font-medium hidden sm:block">
                ICAR Knowledge-Grounded Agricultural Intelligence • Prototype
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-full bg-krishi-canvas border border-krishi-border text-xs text-krishi-textMuted font-semibold">
              <ShieldCheck className="w-4 h-4 text-krishi-primary" />
              GIGW 3.0 & IS-17802 Aligned UI
            </div>

            <button
              onClick={fetchData}
              disabled={isRefreshing}
              aria-label="Refresh telemetry data"
              className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-krishi-surface border border-krishi-border hover:bg-emerald-50 text-krishi-primary text-xs font-bold transition-all focus:ring-2 focus:ring-krishi-accent focus:outline-none cursor-pointer shadow-2xs active:scale-95"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-8">
        {/* Error notification banner if backend disconnects */}
        {errorMessage && (
          <div className="rounded-2xl p-4 bg-amber-50 border border-amber-300 text-amber-900 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-bold">Backend Connection Alert: </span>
              {errorMessage}
            </div>
          </div>
        )}

        {/* ── 🌅 SUNRISE HERO OVERVIEW CARD ── */}
        <section
          aria-label="Executive Intelligence Overview"
          className="rounded-3xl p-6 sm:p-8 bg-gradient-to-r from-stone-900 via-stone-800 to-amber-900/50 text-white shadow-xl relative overflow-hidden border border-amber-900/30"
        >
          <div className="absolute -right-16 -top-16 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute right-32 bottom-0 w-64 h-64 bg-emerald-500/10 rounded-full blur-2xl pointer-events-none" />

          {/* Top Utility Bar inside Sunrise Hero */}
          <div className="flex flex-wrap items-center justify-between gap-3 relative z-10 border-b border-white/10 pb-4 mb-5">
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="inline-flex items-center gap-2 bg-emerald-950/70 border border-emerald-500/40 px-3 py-1 rounded-full text-xs font-semibold text-emerald-300 backdrop-blur-md">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                🟢 Live Telemetry ({isRefreshing ? 'Syncing...' : 'Active 30s'})
              </div>

              <div className="inline-flex items-center gap-1.5 bg-white/10 border border-white/15 px-3 py-1 rounded-full text-xs font-medium text-amber-200 backdrop-blur-md">
                <MapPin className="w-3.5 h-3.5 text-amber-400" />
                {districtDistribution.length > 0
                  ? `${districtDistribution.length} Active Districts Reporting Telemetry`
                  : 'Pan-India Multi-District Monitoring'}
              </div>
            </div>

            <div className="text-xs text-stone-400 font-medium">
              Last Synced:{' '}
              <span className="text-stone-200 font-mono">
                {lastSyncTime || 'Just now'}
              </span>
            </div>
          </div>

          {/* Executive Hero Content */}
          <div className="relative z-10 space-y-2 max-w-4xl">
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight text-white leading-tight">
              Krishi Sahayak Officer Intelligence Hub
            </h1>
            <p className="text-stone-300 text-sm sm:text-base font-normal leading-relaxed">
              Real-time agrometeorological telemetry, verified ICAR grounding accuracy, and agricultural query monitoring.
              High-contrast, sunlight-readable portal for District Agricultural Officers and researchers.
            </p>
          </div>
        </section>

        {/* ── 🌾 CROP FILTER CHIPS ── */}
        <section aria-label="Crop Category Filters" className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-krishi-primary" />
              <h2 className="text-sm font-bold text-krishi-textMain tracking-wide uppercase">
                Filter Queries by Pan-India Crop
              </h2>
            </div>
            <span className="text-xs text-krishi-textMuted font-medium">
              {totalQueries === 0 ? '0 logged queries' : `${filteredQueries.length} of ${topQueries.length} top topics`}
            </span>
          </div>

          <div className="flex items-center gap-2.5 overflow-x-auto pb-2 scrollbar-thin">
            {PAN_INDIA_CROPS.map((crop) => {
              const isActive = selectedCrop === crop.id;
              return (
                <button
                  key={crop.id}
                  onClick={() => setSelectedCrop(crop.id)}
                  aria-pressed={isActive}
                  className={
                    isActive
                      ? 'bg-krishi-primary text-white ring-2 ring-krishi-accent rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap shadow-sm cursor-pointer focus:ring-2 focus:ring-krishi-accent focus:outline-none transition-all flex items-center gap-2'
                      : 'bg-krishi-surface border border-krishi-border text-krishi-textMain rounded-full px-4 py-2 hover:bg-emerald-50 transition-colors text-sm font-semibold whitespace-nowrap cursor-pointer focus:ring-2 focus:ring-krishi-accent focus:outline-none flex items-center gap-2'
                  }
                >
                  <span>{crop.icon}</span>
                  <span>{crop.name}</span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── 📊 EXECUTIVE KEY METRIC STATS ── */}
        <section aria-label="Performance Metrics" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
          {/* 1. Total Queries */}
          <div className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-krishi-textMuted">
                Total Farmer Queries
              </span>
              <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-200 flex items-center justify-center text-krishi-primary">
                <MessageSquare className="w-4 h-4" />
              </div>
            </div>
            <div className="font-bold text-3xl text-krishi-textMain tracking-tight">
              {totalQueries.toLocaleString()}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-700">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {totalQueries > 0
                  ? 'Real-time database telemetry'
                  : 'No queries logged yet'}
              </span>
            </div>
          </div>

          {/* 2. Avg Response Latency */}
          <div className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-krishi-textMuted">
                Avg Response Time
              </span>
              <div className="w-8 h-8 rounded-lg bg-sky-50 border border-sky-200 flex items-center justify-center text-sky-700">
                <Clock className="w-4 h-4" />
              </div>
            </div>
            <div className="font-bold text-3xl text-krishi-textMain tracking-tight">
              {totalQueries > 0 ? `${avgLatencySec.toFixed(2)}s` : '—'}
            </div>
            <p className="mt-2 text-xs text-krishi-textMuted font-medium">
              {totalQueries > 0
                ? `${avgLatencyMs} ms (ICAR RAG + Vector Grounding)`
                : 'Awaiting farmer query telemetry'}
            </p>
          </div>

          {/* 3. Monitored Districts */}
          <div className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-krishi-textMuted">
                Monitored Districts
              </span>
              <div className="w-8 h-8 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-center text-amber-700">
                <MapPin className="w-4 h-4" />
              </div>
            </div>
            <div className="font-bold text-3xl text-krishi-textMain tracking-tight">
              {districtDistribution.length}
            </div>
            <div className="flex items-center gap-1.5 mt-2 text-xs font-semibold text-emerald-700">
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {districtDistribution.length > 0
                  ? 'Active telemetry streams'
                  : 'Awaiting regional telemetry'}
              </span>
            </div>
          </div>

          {/* 4. Multimodal Inputs */}
          <div className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-5 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-krishi-textMuted">
                Multimodal Inputs
              </span>
              <div className="w-8 h-8 rounded-lg bg-purple-50 border border-purple-200 flex items-center justify-center text-purple-700">
                <Database className="w-4 h-4" />
              </div>
            </div>
            <div className="font-bold text-3xl text-krishi-textMain tracking-tight">
              {totalModality.toLocaleString()}
            </div>
            <div className="flex items-center gap-2 mt-2 text-xs font-medium">
              <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-krishi-primary border border-emerald-200 font-bold">
                🎤 {modalityCounts.voice} Voice
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 font-bold">
                📝 {modalityCounts.text} Text
              </span>
              {modalityCounts.image > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-sky-50 text-sky-700 border border-sky-200 font-bold">
                  📷 {modalityCounts.image} Image
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ── 📋 TOP FARMER QUERIES DATA TABLE / FREQUENCY BAR CHART ── */}
        <section
          aria-label="Top Farmer Queries and Issue Tags"
          className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-6 hover:shadow-md transition-shadow"
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-krishi-primary" />
                <h3 className="text-lg font-extrabold text-krishi-textMain tracking-tight">
                  Top Farmer Queries & Crop Concerns
                </h3>
              </div>
              <p className="text-xs text-krishi-textMuted mt-1">
                Natural-language farmer queries logged by the system, sorted by frequency
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full sm:w-auto">
              {/* Toggle View: Table vs BarChart */}
              <div className="inline-flex rounded-xl bg-krishi-canvas border border-krishi-border p-1 self-start sm:self-auto">
                <button
                  onClick={() => setActiveQueryView('table')}
                  aria-label="Switch to Table view"
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer focus:ring-2 focus:ring-krishi-accent focus:outline-none ${
                    activeQueryView === 'table'
                      ? 'bg-krishi-surface text-krishi-primary shadow-xs'
                      : 'text-krishi-textMuted hover:text-krishi-textMain'
                  }`}
                >
                  <TableIcon className="w-3.5 h-3.5" />
                  Table
                </button>
                <button
                  onClick={() => setActiveQueryView('chart')}
                  aria-label="Switch to Bar Chart view"
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer focus:ring-2 focus:ring-krishi-accent focus:outline-none ${
                    activeQueryView === 'chart'
                      ? 'bg-krishi-surface text-krishi-primary shadow-xs'
                      : 'text-krishi-textMuted hover:text-krishi-textMain'
                  }`}
                >
                  <BarChart3 className="w-3.5 h-3.5" />
                  Frequency Chart
                </button>
              </div>

              {/* Search Box */}
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search queries..."
                  className="w-full pl-9 pr-4 py-1.5 rounded-xl bg-krishi-canvas border border-krishi-border text-sm text-krishi-textMain placeholder-slate-400 focus:ring-2 focus:ring-krishi-accent focus:outline-none transition-all"
                />
              </div>
            </div>
          </div>

          {totalQueries === 0 ? (
            /* Empty State for 0 Total Queries */
            <div className="rounded-xl border border-dashed border-krishi-border bg-krishi-canvas p-10 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-50 border border-emerald-200 flex items-center justify-center text-krishi-primary mb-3">
                <MessageSquare className="w-6 h-6 text-krishi-accent" />
              </div>
              <h4 className="text-base font-bold text-krishi-textMain">No farmer queries logged yet</h4>
              <p className="text-xs text-krishi-textMuted max-w-md mt-1">
                Queries submitted via mobile app or web voice portal will appear here in real time.
              </p>
            </div>
          ) : filteredQueries.length === 0 ? (
            /* Empty Filter State */
            <div className="rounded-xl border border-dashed border-krishi-border bg-krishi-canvas p-8 flex flex-col items-center justify-center text-center">
              <p className="text-sm font-semibold text-krishi-textMain">No queries match the current filter or search</p>
              <p className="text-xs text-krishi-textMuted mt-1">
                Try selecting "All Queries" or clearing the search keyword.
              </p>
            </div>
          ) : activeQueryView === 'table' ? (
            /* Accessible Real Data Table */
            <div className="overflow-x-auto rounded-xl border border-krishi-border">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-emerald-50/60 border-b border-krishi-border">
                    <th scope="col" className="text-krishi-textMuted text-xs uppercase font-bold py-3 px-4">
                      Farmer Query / Observation
                    </th>
                    <th scope="col" className="text-krishi-textMuted text-xs uppercase font-bold py-3 px-4">
                      Crop Category
                    </th>
                    <th scope="col" className="text-krishi-textMuted text-xs uppercase font-bold py-3 px-4">
                      Topic Tag
                    </th>
                    <th scope="col" className="text-krishi-textMuted text-xs uppercase font-bold py-3 px-4 text-right">
                      Logged Frequency
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-sm">
                  {filteredQueries.map((item, idx) => {
                    const meta = inferQueryMetadata(item.query);
                    return (
                      <tr key={`query-${idx}`} className="hover:bg-emerald-50/30 transition-colors">
                        <td className="py-3.5 px-4 font-medium text-krishi-textMain max-w-md">
                          <div className="flex items-start gap-2">
                            <span className="text-krishi-primary font-bold">“</span>
                            <span className="leading-snug">{item.query}</span>
                            <span className="text-krishi-primary font-bold">”</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-krishi-textMuted whitespace-nowrap">
                          <div className="font-semibold text-krishi-textMain">{meta.crop}</div>
                          <div className="text-xs text-krishi-textMuted">{meta.category}</div>
                        </td>
                        <td className="py-3.5 px-4 whitespace-nowrap">
                          <span className="bg-emerald-50 text-krishi-primary border border-emerald-200 text-xs font-bold px-2 py-1 rounded-full inline-flex items-center gap-1 shadow-2xs">
                            <CheckCircle2 className="w-3 h-3 text-krishi-accent" />
                            {meta.tag}
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span className="font-bold text-krishi-textMain font-mono text-base">
                            {item.count}
                          </span>
                          <span className="text-xs text-krishi-textMuted block">queries</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            /* Bar Chart View of Top Queries */
            <div className="h-80 w-full pt-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredQueries} layout="vertical" margin={{ top: 5, right: 30, left: 10, bottom: 5 }}>
                  <XAxis type="number" stroke="#475569" fontSize={11} allowDecimals={false} />
                  <YAxis
                    dataKey="query"
                    type="category"
                    width={260}
                    stroke="#475569"
                    fontSize={11}
                    tickFormatter={(val: string) => (val.length > 34 ? val.substring(0, 32) + '...' : val)}
                  />
                  <RechartsTooltip
                    cursor={{ fill: 'rgba(22, 163, 74, 0.08)' }}
                    contentStyle={{
                      backgroundColor: '#FFFFFF',
                      border: '1px solid #A7F3D0',
                      borderRadius: '12px',
                      boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      color: '#0F172A',
                      fontWeight: 600,
                    }}
                  />
                  <Bar dataKey="count" fill="#1B5E20" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </section>

        {/* ── 📈 CHARTS GRID: REGIONAL TELEMETRY & DAILY VOLUME ── */}
        <section aria-label="Visual Telemetry and Charts" className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* 1. Regional Distribution */}
          <div className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <MapPin className="w-5 h-5 text-krishi-primary" />
                <h3 className="text-base font-extrabold text-krishi-textMain">
                  Queries by Agro-Climatic Zone
                </h3>
              </div>
              <span className="text-xs text-krishi-textMuted font-medium">
                {districtDistribution.length} reporting districts
              </span>
            </div>

            {districtDistribution.length === 0 ? (
              <div className="h-72 w-full rounded-xl border border-dashed border-krishi-border bg-krishi-canvas flex flex-col items-center justify-center text-center p-6">
                <MapPin className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-krishi-textMain">
                  Awaiting regional telemetry from connected districts
                </p>
                <p className="text-xs text-krishi-textMuted mt-1">
                  District telemetry will be populated as queries arrive from farmer devices.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={districtDistribution}
                        cx="50%"
                        cy="50%"
                        innerRadius={55}
                        outerRadius={95}
                        paddingAngle={3}
                        dataKey="count"
                        nameKey="district"
                        label={({ district, percentage }: { district?: string; percentage?: number }) =>
                          `${district || 'Unknown'} (${(percentage || 0).toFixed(0)}%)`
                        }
                      >
                        {districtDistribution.map((_, index) => (
                          <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <RechartsTooltip
                        formatter={(value: any, _name: any, item: any) => [
                          `${value} queries (${item.payload.percentage}%)`,
                          item.payload.district
                        ]}
                        contentStyle={{
                          backgroundColor: '#FFFFFF',
                          border: '1px solid #A7F3D0',
                          borderRadius: '12px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                          color: '#0F172A',
                          fontWeight: 600,
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Full genuine district breakdown list */}
                <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 pr-1 scrollbar-thin">
                  {districtDistribution.map((dist, idx) => (
                    <div key={dist.district} className="py-2 flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{ backgroundColor: PIE_COLORS[idx % PIE_COLORS.length] }}
                        />
                        <span className="font-semibold text-krishi-textMain">{dist.district}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-krishi-textMuted">{dist.count} queries</span>
                        <span className="font-bold text-krishi-primary font-mono w-12 text-right">
                          {dist.percentage}%
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 2. Daily Advisory Volume Line Chart */}
          <div className="bg-krishi-surface border border-krishi-border shadow-xs rounded-2xl p-6 hover:shadow-md transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-krishi-primary" />
                <h3 className="text-base font-extrabold text-krishi-textMain">
                  Daily Advisory Volume (Last 30 Days)
                </h3>
              </div>
              <span className="text-xs text-emerald-700 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                Live Query Telemetry
              </span>
            </div>

            {dailyVolume.length === 0 ? (
              <div className="h-72 w-full rounded-xl border border-dashed border-krishi-border bg-krishi-canvas flex flex-col items-center justify-center text-center p-6">
                <Activity className="w-8 h-8 text-slate-300 mb-2" />
                <p className="text-sm font-semibold text-krishi-textMain">
                  No query telemetry logged in the past 30 days
                </p>
                <p className="text-xs text-krishi-textMuted mt-1">
                  Advisory query volume timestamps will populate here automatically.
                </p>
              </div>
            ) : (
              <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={dailyVolume} margin={{ top: 10, right: 20, left: -20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                    <XAxis
                      dataKey="date"
                      stroke="#475569"
                      fontSize={11}
                      tickFormatter={(tick: string) => (tick.length >= 10 ? tick.substring(5) : tick)}
                    />
                    <YAxis stroke="#475569" fontSize={11} allowDecimals={false} />
                    <RechartsTooltip
                      contentStyle={{
                        backgroundColor: '#FFFFFF',
                        border: '1px solid #A7F3D0',
                        borderRadius: '12px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        color: '#0F172A',
                        fontWeight: 600,
                      }}
                    />
                    <Line
                      type="monotone"
                      dataKey="count"
                      stroke="#16A34A"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#1B5E20' }}
                      activeDot={{ r: 7, fill: '#16A34A' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </section>

        {/* ── 🛡️ RESEARCH PILOT & ICAR CITATION FOOTER ── */}
        <footer className="bg-krishi-surface border border-krishi-border rounded-2xl p-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-krishi-textMuted shadow-2xs">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center text-krishi-primary font-bold">
              ICAR
            </div>
            <div>
              <p className="font-bold text-krishi-textMain">Indian Council of Agricultural Research Grounding Engine</p>
              <p>Grounding verified against 580+ indexed agricultural manuals, package of practices, and IMD telemetry.</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <span className="inline-flex items-center gap-1 text-emerald-800 font-semibold">
              <CheckCircle2 className="w-4 h-4 text-krishi-accent" /> WCAG 2.1 AA Aligned
            </span>
            <span>•</span>
            <span className="font-mono text-slate-500">Research Prototype v1.0.0</span>
          </div>
        </footer>
      </main>
    </div>
  );
};

export default Dashboard;
