/**
 * HistoryScreen — Farmer Query History with Multilingual English-First Support,
 * Expandable Grounded Answers, and Audio TTS Playback.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  RefreshControl,
  Alert,
  Modal,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import * as Haptics from 'expo-haptics';
import { ShieldCheck, Volume2 } from 'lucide-react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import { safeHaptics } from '../../services/haptics';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import LanguageSelectorSheet from '../../components/LanguageSelectorSheet';
import { useTextSize } from '../../context/TextSizeContext';
import { storageService, HistoryEntry, FarmerProfile } from '../../services/storage';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  getTranslation,
  translateHistoryQuery,
} from '../../services/i18n';
import { translateLocation } from '../../services/locations';

const LOCALE_MAP: Record<LanguageCode, string> = {
  en: 'en-IN',
  hi: 'hi-IN',
  bn: 'bn-IN',
  ml: 'ml-IN',
  ta: 'ta-IN',
  te: 'te-IN',
  kn: 'kn-IN',
  mr: 'mr-IN',
  gu: 'gu-IN',
  pa: 'pa-IN',
  or: 'or-IN',
  as: 'as-IN',
  ur: 'ur-IN',
  sa: 'sa-IN',
  sd: 'sd-IN',
  ks: 'ks-IN',
  ne: 'ne-IN',
  kok: 'kok-IN',
  mni: 'mni-IN',
  brx: 'brx-IN',
  doi: 'doi-IN',
  mai: 'mai-IN',
  sat: 'sat-IN',
};

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  'http://localhost:8000';

export default function HistoryScreen() {
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');
  const [farmerProfile, setFarmerProfile] = useState<FarmerProfile | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const { fontSizeScale, textSizeMultiplier, cycleFontSize } = useTextSize();
  const [langModalVisible, setLangModalVisible] = useState(false);

  const soundRef = useRef<Audio.Sound | null>(null);

  const t = (key: string) => getTranslation(currentLang, key);

  const router = useRouter();

  const handleGoBack = () => {
    safeHaptics.impactLight();
    router.navigate('/(tabs)');
  };

  useEffect(() => {
    (async () => {
      const savedLang = await storageService.getLanguage();
      if (savedLang) setCurrentLang(savedLang as LanguageCode);
      const prof = await storageService.getFarmerProfile();
      if (prof) setFarmerProfile(prof);
    })();

    const unsubLang = storageService.onLanguageChange((lang) => {
      setCurrentLang(lang as LanguageCode);
    });
    const unsubProf = storageService.onProfileChange((prof) => {
      setFarmerProfile(prof);
    });

    return () => {
      unsubLang();
      unsubProf();
    };
  }, []);

  const loadHistory = async () => {
    try {
      const data = await storageService.getHistory();
      setHistory(data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const onRefresh = () => {
    setRefreshing(true);
    loadHistory();
  };

  const selectLanguage = async (code: LanguageCode) => {
    safeHaptics.impactMedium();
    setCurrentLang(code);
    await storageService.setLanguage(code);
    setLangModalVisible(false);
  };

  const getTextSizeMultiplier = () => textSizeMultiplier;

  const getAnswerFontSize = () => {
    if (fontSizeScale === 'xlarge') return 22;
    if (fontSizeScale === 'large') return 18;
    return 15;
  };

  const toggleExpand = async (id: string) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    safeHaptics.impactLight();
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const playAudio = async (item: HistoryEntry) => {
    if (!item.queryId) return;
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch {}
    safeHaptics.impactLight();
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (playingId === item.id) {
        setPlayingId(null);
        return;
      }
      setPlayingId(item.id);
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${BASE_URL}/api/v1/query/${item.queryId}/audio?lang=${currentLang}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) setPlayingId(null);
      });
    } catch {
      setPlayingId(null);
      Alert.alert('', 'Could not play audio.');
    }
  };

  const clearHistory = () => {
    Alert.alert(
      t('clearHistoryBtn'),
      t('clearHistoryConfirm'),
      [
        { text: t('cancelBtn'), style: 'cancel' },
        {
          text: t('clearBtn'),
          style: 'destructive',
          onPress: async () => {
            await storageService.clearHistory();
            setHistory([]);
          },
        },
      ]
    );
  };

  const formatDate = (isoString: string) => {
    const d = new Date(isoString);
    const locale = LOCALE_MAP[currentLang] || 'en-IN';
    return d.toLocaleDateString(locale, {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getModeIcon = (mode: string) => {
    if (mode === 'voice') return 'microphone';
    if (mode === 'image') return 'camera';
    return 'keyboard';
  };

  const renderItem = ({ item }: { item: HistoryEntry }) => {
    const isExpanded = expandedIds.has(item.id);
    const multiplier = getTextSizeMultiplier();

    return (
      <View style={styles.card} accessibilityRole="summary" accessibilityLabel={`History record from ${formatDate(item.timestamp)}`}>
        {/* Card Header: Mode + Date + ICAR Grounded Shield + Region */}
        <View style={styles.cardHeader}>
          <View style={styles.badgeRow}>
            <MaterialCommunityIcons name={getModeIcon(item.inputMode)} size={Math.round(14 * multiplier)} color="#166534" />
            <Text style={[styles.dateText, { fontSize: Math.round(12 * multiplier) }]} allowFontScaling={true}>
              {formatDate(item.timestamp)}
            </Text>
          </View>

          {/* ICAR Grounded Trust Badge with Lucide ShieldCheck */}
          <View style={styles.icarShieldBadge}>
            <ShieldCheck size={Math.round(12 * multiplier)} color="#16A34A" />
            <Text style={[styles.icarShieldText, { fontSize: Math.round(11 * multiplier) }]} allowFontScaling={true}>
              ICAR Grounded
            </Text>
          </View>

          {item.region && (
            <Text style={[styles.regionText, { fontSize: Math.round(13 * multiplier) }]} allowFontScaling={true}>
              📍 {translateLocation(item.region, currentLang)}
            </Text>
          )}
        </View>

        {/* Question Text */}
        <Text
          style={[
            styles.questionText,
            {
              fontSize: Math.round(16 * multiplier),
              lineHeight: Math.round(24 * multiplier),
            },
          ]}
          allowFontScaling={true}
        >
          <Text
            style={[styles.qLabel, { fontSize: Math.round(16 * multiplier) }]}
            allowFontScaling={true}
          >
            {t('transcribedTitle')}{' '}
          </Text>
          {translateHistoryQuery(item.question, currentLang)}
        </Text>

        <View style={styles.divider} />

        {/* Answer Text — Expandable */}
        <Text
          style={[
            styles.answerText,
            {
              fontSize: Math.round(15 * multiplier),
              lineHeight: Math.round(26 * multiplier),
            },
          ]}
          numberOfLines={isExpanded ? undefined : 3}
          allowFontScaling={true}
        >
          <Text
            style={[styles.aLabel, { fontSize: Math.round(15 * multiplier) }]}
            allowFontScaling={true}
          >
            {t('answerTitle')}:{' '}
          </Text>
          {item.answer}
        </Text>

        {/* Read More / Less Toggle */}
        <TouchableOpacity
          style={styles.expandBtn}
          onPress={() => toggleExpand(item.id)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={isExpanded ? (t('collapseAnswer') || 'Collapse Answer') : (t('expandAnswer') || 'Expand Answer')}
        >
          <Text
            style={[styles.expandBtnText, { fontSize: Math.round(13 * multiplier) }]}
            allowFontScaling={true}
          >
            {isExpanded ? t('collapseAnswer') : t('expandAnswer')}
          </Text>
        </TouchableOpacity>

        {/* Source Labels */}
        {item.sourceLabels && item.sourceLabels.length > 0 && (
          <View style={styles.sourceTagsRow}>
            {item.sourceLabels.slice(0, 3).map((src, idx) => (
              <View key={idx} style={styles.sourceTag}>
                <ShieldCheck size={Math.round(12 * multiplier)} color="#16A34A" />
                <Text
                  style={[styles.sourceTagText, { fontSize: Math.round(12 * multiplier) }]}
                  allowFontScaling={true}
                >
                  {src.display_name}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* TTS Audio Player Button (+30% scaled touch target) with Dynamic Playing Indicator */}
        {item.queryId && (
          <TouchableOpacity
            style={[styles.listenBtn, playingId === item.id && styles.listenBtnPlaying]}
            onPress={() => playAudio(item)}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={playingId === item.id ? (t('stopAudio') || 'Stop Audio') : (t('listenAudio') || 'Listen to Audio')}
            accessibilityState={{ busy: playingId === item.id }}
            accessibilityHint="Double tap to listen or pause spoken audio response"
          >
            {playingId === item.id ? (
              <View style={styles.listenRow}>
                <MaterialCommunityIcons name="waveform" size={Math.round(18 * multiplier)} color="#FFFFFF" />
                <Text
                  style={[styles.listenBtnText, styles.listenBtnTextPlaying, { fontSize: Math.round(14 * multiplier) }]}
                  allowFontScaling={true}
                >
                  ⏹️ Playing Audio...
                </Text>
              </View>
            ) : (
              <View style={styles.listenRow}>
                <Volume2 size={Math.round(16 * multiplier)} color="#166534" />
                <Text
                  style={[styles.listenBtnText, { fontSize: Math.round(14 * multiplier) }]}
                  allowFontScaling={true}
                >
                  🔊 {t('listenAudio') || 'Listen to Advisory'}
                </Text>
              </View>
            )}
          </TouchableOpacity>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Centered Phone-Width Advisory Slip Container (max-w-2xl) */}
        <View style={styles.slipWrapper}>
          {/* Header — Strict 2-Row Vertical Flexbox */}
          <View style={styles.header}>
            {/* Row 1: Back (Left) & Actions (Right) */}
            <View style={styles.headerTopRow}>
              <TouchableOpacity
                style={styles.headerBackBtn}
                onPress={handleGoBack}
                activeOpacity={0.7}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel={t('backBtn') || 'Back'}
                accessibilityHint="Double tap to go back to the previous screen"
              >
                <MaterialCommunityIcons name="arrow-left" size={18} color="#15803D" />
                <Text style={styles.headerBackText} allowFontScaling={true}>{t('backBtn') || 'Back'}</Text>
              </TouchableOpacity>

              <View style={styles.headerActions}>
                {/* Language Switcher */}
                <TouchableOpacity
                  style={styles.langHeaderPill}
                  onPress={() => setLangModalVisible(true)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Language switcher, currently ${currentLang.toUpperCase()}`}
                  accessibilityHint="Double tap to open language selection"
                >
                  <Text style={styles.langFlag} allowFontScaling={true}>
                    {SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.flag || '🇬🇧'}
                  </Text>
                  <Text style={styles.langCodeText} allowFontScaling={true}>{currentLang.toUpperCase()}</Text>
                </TouchableOpacity>

                {/* Font Scale Button */}
                <TouchableOpacity
                  style={styles.fontScaleBtn}
                  onPress={cycleFontSize}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`Adjust font size, currently ${fontSizeScale}`}
                  accessibilityHint="Double tap to cycle text size between normal, large, and extra large"
                >
                  <Text style={styles.fontScaleText} allowFontScaling={true}>
                    {fontSizeScale === 'normal' ? 'A' : fontSizeScale === 'large' ? 'A+' : 'A++'}
                  </Text>
                </TouchableOpacity>

                {history.length > 0 && (
                  <TouchableOpacity
                    onPress={clearHistory}
                    style={styles.clearBtn}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel="Clear history"
                    accessibilityHint="Double tap to delete all saved query history"
                  >
                    <MaterialCommunityIcons name="delete-outline" size={22} color="#DC2626" />
                  </TouchableOpacity>
                )}
              </View>
            </View>

            {/* Row 2: Title and Subtitle without buttons on the right */}
            <View style={styles.headerTitleRow} accessibilityRole="header">
              <View style={styles.glowingIconPill} accessible={false}>
                <MaterialCommunityIcons name="history" size={22} color="#1B5E20" />
              </View>
              <View style={styles.headerTextWrap}>
                <Text style={styles.headerTitle} numberOfLines={1} allowFontScaling={true}>{t('historyTitle')}</Text>
                {farmerProfile && (
                  <Text style={styles.headerSub} numberOfLines={1} allowFontScaling={true}>
                    {farmerProfile.name} • <Text style={{ color: '#0F172A', fontWeight: '900' }} allowFontScaling={true}>{farmerProfile.farmerId}</Text>
                  </Text>
                )}
              </View>
            </View>
          </View>

          {loading ? (
            <View style={styles.center} accessibilityRole="progressbar" accessibilityLabel="Loading history">
              <ActivityIndicator size="large" color="#1B5E20" />
              <Text style={styles.loadingText} allowFontScaling={true}>{t('loadingTitle')}</Text>
            </View>
          ) : history.length === 0 ? (
            <View style={styles.center} accessibilityRole="summary" accessibilityLabel={t('emptyHistoryTitle') || 'No History'}>
              <View style={styles.emptyIconCircle} accessible={false}>
                <MaterialCommunityIcons name="chat-question-outline" size={54} color="#1B5E20" />
              </View>
              <Text style={styles.emptyTitle} allowFontScaling={true}>{t('emptyHistoryTitle')}</Text>
              <Text style={styles.emptySub} allowFontScaling={true}>{t('emptyHistorySub')}</Text>
            </View>
          ) : (
            <FlashList
              data={history}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              extraData={{ fontSizeScale, expandedIds, playingId, currentLang }}
              estimatedItemSize={200}
              contentContainerStyle={styles.listContent}
              refreshControl={
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor="#1B5E20"
                />
              }
            />
          )}
        </View>

        {/* ── 🌐 Global Language Selector Sheet ── */}
        <LanguageSelectorSheet
          visible={langModalVisible}
          currentLang={currentLang}
          onClose={() => setLangModalVisible(false)}
          onSelect={(code) => selectLanguage(code)}
        />

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#F8FAF8' },
  slipWrapper: {
    flex: 1,
    width: '100%',
    maxWidth: 768,
    alignSelf: 'center',
    backgroundColor: '#F8FAF8',
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  headerTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  headerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerTextWrap: {
    flex: 1,
  },
  headerBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  headerBackText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  glowingIconPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8F5E9',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  headerSub: { fontSize: 13, color: '#166534', marginTop: 2, fontWeight: '700' },
  headerActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  langHeaderPill: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1',
  },
  langFlag: { fontSize: 14 },
  langCodeText: { color: '#0F172A', fontSize: 11, fontWeight: '900' },
  fontScaleBtn: {
    backgroundColor: '#F1F5F9', paddingHorizontal: 9, paddingVertical: 6,
    borderRadius: 10, borderWidth: 1.5, borderColor: '#CBD5E1',
  },
  fontScaleText: { color: '#166534', fontWeight: '900', fontSize: 12 },
  clearBtn: { padding: 6 },
  center: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    gap: 12, paddingHorizontal: 32,
  },
  emptyIconCircle: {
    width: 90, height: 90, borderRadius: 45,
    backgroundColor: '#E8F5E9',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#A7F3D0',
  },
  loadingText: { fontSize: 15, color: '#0F172A', fontWeight: '800' },
  emptyTitle: { fontSize: 18, color: '#0F172A', fontWeight: '900', textAlign: 'center' },
  emptySub: { fontSize: 14, color: '#64748B', textAlign: 'center', lineHeight: 22, fontWeight: '500' },
  listContent: { padding: 16, gap: 12 },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderLeftWidth: 4.5,
    borderLeftColor: '#16A34A', // Physical advisory slip styling
    elevation: 3,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    gap: 8,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
    flexWrap: 'wrap',
    gap: 6,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  icarShieldBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  icarShieldText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.2,
  },
  dateText: { fontSize: 12, color: '#64748B', fontWeight: '600' },
  regionText: { fontSize: 13, color: '#166534', fontWeight: '800' },
  questionText: { fontSize: 16, color: '#0F172A', lineHeight: 24, fontWeight: '700' },
  qLabel: { fontWeight: '900', color: '#166534' },
  divider: { height: 1, backgroundColor: '#E2E8F0', marginVertical: 4 },
  answerText: { color: '#1E293B', lineHeight: 26 },
  aLabel: { fontWeight: '900', color: '#1B5E20' },
  expandBtn: { alignSelf: 'flex-start', paddingVertical: 4 },
  expandBtnText: { color: '#166534', fontSize: 13, fontWeight: '800' },
  sourceTagsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
  sourceTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  sourceTagText: { fontSize: 12, color: '#334155', fontWeight: '700' },
  listenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginTop: 6,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    minHeight: 48,
  },
  listenRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  listenBtnPlaying: { backgroundColor: '#DC2626', borderColor: '#DC2626' },
  listenBtnText: { color: '#166534', fontSize: 14, fontWeight: '800' },
  listenBtnTextPlaying: { color: '#FFFFFF' },
  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center', alignItems: 'center', padding: 20,
  },
  modalCardContainer: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 20,
    width: '100%', maxHeight: '82%', borderWidth: 1.5, borderColor: '#CBD5E1',
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingBottom: 12, borderBottomWidth: 1.5, borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  modalHelperText: { color: '#64748B', fontSize: 13, marginBottom: 12, fontWeight: '500' },
  langGrid: { gap: 8 },
  langCard: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: '#F8FAFC', borderRadius: 12,
    padding: 12, borderWidth: 1.5, borderColor: '#E2E8F0', minHeight: 52,
  },
  langCardActive: {
    backgroundColor: '#DCFCE7', borderColor: '#16A34A', borderWidth: 2,
  },
  langFlagLarge: { fontSize: 24 },
  langNativeText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  langNativeTextActive: { color: '#15803D' },
  langEnglishText: { color: '#64748B', fontSize: 12, marginTop: 1, fontWeight: '600' },
});
