/**
 * LocationSelectionView — Full-screen, isolated location picker.
 *
 * Step 2 of the onboarding flow: Language → **Location** → Dashboard
 *
 * Features:
 * - Bilingual header ("Where is your farm? / आपका खेत कहाँ है?")
 * - Prominent GPS Auto-Detect button
 * - Cascade State → District manual selection
 * - Back button to return to Language selection
 * - Zero dashboard leaks
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getAllStates,
  getDistrictsForState,
  getStateDetails,
  detectLocationGPS,
  translateLocation,
} from '../services/locations';
import { LanguageCode, getTranslation } from '../services/i18n';
import { storageService } from '../services/storage';

interface Props {
  currentLang: LanguageCode;
  onBack: () => void;
  onContinue: (state: string, district: string) => void;
}

export default function LocationSelectionView({ currentLang, onBack, onContinue }: Props) {
  const [activeLang, setActiveLang] = useState<LanguageCode>(currentLang);
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [districts, setDistricts] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [detectedInfo, setDetectedInfo] = useState<string | null>(null);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);

  // Keep language in sync with prop and storageService events
  useEffect(() => {
    setActiveLang(currentLang);
  }, [currentLang]);

  useEffect(() => {
    const unsub = storageService.onLanguageChange((l) => {
      setActiveLang(l as LanguageCode);
    });
    (async () => {
      const saved = await storageService.getSavedLanguage();
      if (saved) setActiveLang(saved as LanguageCode);
    })();
    return () => unsub();
  }, []);

  const t = (key: string) => getTranslation(activeLang, key);

  useEffect(() => {
    if (selectedState) {
      const dists = getDistrictsForState(selectedState);
      setDistricts(dists);
      // Auto-select first district if none selected for this state
      if (!selectedDistrict || !dists.includes(selectedDistrict)) {
        setSelectedDistrict(dists[0] || null);
      }
    }
  }, [selectedState]);

  const handleGPSDetect = async () => {
    setDetecting(true);
    setDetectedInfo(null);
    try {
      const result = await detectLocationGPS();
      setSelectedState(result.state);
      setSelectedDistrict(result.district);
      const sourceLabel = result.source === 'gps_reverse'
        ? `📡 ${t('gpsDetected') || 'GPS Detected'}`
        : result.source === 'gps_centroid'
        ? `📍 ${t('nearestRegion') || 'Nearest Region'}`
        : `🔄 ${t('defaultRegion') || 'Default Region'}`;
      setDetectedInfo(`${sourceLabel}: ${translateLocation(result.district, activeLang)}, ${translateLocation(result.state, activeLang)}`);
    } catch {
      setDetectedInfo(`⚠️ ${t('gpsFailed') || 'GPS detection failed. Please select manually.'}`);
    } finally {
      setDetecting(false);
    }
  };

  const canContinue = selectedState && selectedDistrict;

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ← Back to Language */}
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={t('backBtn') || 'Back'}
          accessibilityHint="Double tap to go back to language selection"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#15803D" />
          <Text style={styles.backBtnText} allowFontScaling={true}>
            {t('backBtn') || 'Back'}
          </Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* Header */}
          <View style={styles.headerSection} accessibilityRole="header">
            <View style={styles.headerIconCircle} accessible={false}>
              <MaterialCommunityIcons name="map-marker-radius" size={40} color="#15803D" />
            </View>
            <Text style={styles.headerTitle} allowFontScaling={true}>
              {t('whereIsYourFarmTitle')}
            </Text>
            {activeLang !== 'en' && (
              <Text style={styles.headerTitleNative} allowFontScaling={true}>
                {getTranslation('en', 'whereIsYourFarmTitle')}
              </Text>
            )}
            <Text style={styles.headerSubtitle} allowFontScaling={true}>
              {t('whereIsYourFarmSubtitle')}
            </Text>
          </View>

          {/* 📍 GPS Auto-Detect Button */}
          <TouchableOpacity
            style={styles.gpsBtn}
            onPress={handleGPSDetect}
            disabled={detecting}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={detecting ? (t('detectingLocation') || 'Detecting Location…') : (t('autoDetectGps') || 'Auto-Detect farm location via GPS')}
            accessibilityState={{ busy: detecting }}
            accessibilityHint="Double tap to automatically detect farm state and district via device GPS"
          >
            <LinearGradient
              colors={['#0D9488', '#14B8A6']}
              style={styles.gpsBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              {detecting ? (
                <ActivityIndicator color="#FFF" size="small" />
              ) : (
                <MaterialCommunityIcons name="crosshairs-gps" size={24} color="#FFF" />
              )}
              <Text style={styles.gpsBtnText} allowFontScaling={true}>
                {detecting ? (t('detectingLocation') || 'Detecting Location…') : (t('autoDetectGps') || '📍 Auto-Detect via GPS')}
              </Text>
            </LinearGradient>
          </TouchableOpacity>

          {detectedInfo && (
            <View style={styles.detectedBadge} accessibilityRole="text" accessibilityLabel={detectedInfo}>
              <Text style={styles.detectedBadgeText} allowFontScaling={true}>{detectedInfo}</Text>
            </View>
          )}

          {/* Divider */}
          <View style={styles.dividerRow}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText} allowFontScaling={true}>{t('orSelectManually') || 'OR SELECT MANUALLY'}</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* State Picker */}
          <Text style={styles.pickerLabel} allowFontScaling={true}>🏛️ {t('selectState') || 'Select State'}</Text>
          <TouchableOpacity
            style={styles.pickerTrigger}
            onPress={() => { setShowStatePicker(!showStatePicker); setShowDistrictPicker(false); }}
            activeOpacity={0.8}
            accessibilityRole="combobox"
            accessibilityLabel={`${t('selectState') || 'Select State'}, ${selectedState ? translateLocation(selectedState, activeLang) : 'None selected'}`}
            accessibilityState={{ expanded: showStatePicker }}
            accessibilityHint="Double tap to expand or collapse state dropdown"
          >
            <MaterialCommunityIcons name="map" size={20} color="#15803D" />
            <Text style={styles.pickerTriggerText} allowFontScaling={true}>
              {selectedState ? translateLocation(selectedState, activeLang) : (t('tapToChooseState') || 'Tap to choose your state')}
            </Text>
            <MaterialCommunityIcons
              name={showStatePicker ? 'chevron-up' : 'chevron-down'}
              size={22}
              color="#64748B"
            />
          </TouchableOpacity>

          {showStatePicker && (
            <View style={styles.optionsList}>
              {getAllStates().map((state) => {
                const isActive = state === selectedState;
                const stateData = getStateDetails(state);
                return (
                  <TouchableOpacity
                    key={state}
                    style={[styles.optionItem, isActive && styles.optionItemActive]}
                    onPress={() => {
                      setSelectedState(state);
                      setSelectedDistrict(null);
                      setShowStatePicker(false);
                      setShowDistrictPicker(true);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`${translateLocation(state, activeLang)}, ${stateData?.zone || ''}`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <View style={styles.optionContent}>
                      <Text style={[styles.optionText, isActive && styles.optionTextActive]} allowFontScaling={true}>
                        {translateLocation(state, activeLang)}
                      </Text>
                      <Text style={styles.optionHint} allowFontScaling={true}>
                        {stateData?.zone}
                      </Text>
                    </View>
                    {isActive && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#15803D" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}

          {/* District Picker */}
          {selectedState && (
            <>
              <Text style={styles.pickerLabel} allowFontScaling={true}>📍 {t('selectDistrict') || 'Select District'} ({translateLocation(selectedState, activeLang)})</Text>
              <TouchableOpacity
                style={styles.pickerTrigger}
                onPress={() => { setShowDistrictPicker(!showDistrictPicker); setShowStatePicker(false); }}
                activeOpacity={0.8}
                accessibilityRole="combobox"
                accessibilityLabel={`${t('selectDistrict') || 'Select District'}, ${selectedDistrict ? translateLocation(selectedDistrict, activeLang) : 'None selected'}`}
                accessibilityState={{ expanded: showDistrictPicker }}
                accessibilityHint="Double tap to expand or collapse district dropdown"
              >
                <MaterialCommunityIcons name="map-marker" size={20} color="#15803D" />
                <Text style={styles.pickerTriggerText} allowFontScaling={true}>
                  {selectedDistrict ? translateLocation(selectedDistrict, activeLang) : (t('tapToChooseDistrict') || 'Tap to choose your district')}
                </Text>
                <MaterialCommunityIcons
                  name={showDistrictPicker ? 'chevron-up' : 'chevron-down'}
                  size={22}
                  color="#64748B"
                />
              </TouchableOpacity>

              {showDistrictPicker && (
                <View style={styles.optionsList}>
                  {districts.map((dist) => {
                    const isActive = dist === selectedDistrict;
                    return (
                      <TouchableOpacity
                        key={dist}
                        style={[styles.optionItem, isActive && styles.optionItemActive]}
                        onPress={() => {
                          setSelectedDistrict(dist);
                          setShowDistrictPicker(false);
                        }}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={translateLocation(dist, activeLang)}
                        accessibilityState={{ selected: isActive }}
                      >
                        <Text style={[styles.optionText, isActive && styles.optionTextActive]} allowFontScaling={true}>
                          {translateLocation(dist, activeLang)}
                        </Text>
                        {isActive && (
                          <MaterialCommunityIcons name="check-circle" size={20} color="#15803D" />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </>
          )}

          {/* Selected Summary Card */}
          {selectedState && selectedDistrict && (
            <View style={styles.summaryCard} accessibilityRole="summary" accessibilityLabel={`${t('yourFarmLocation') || 'Your Farm Location'}: ${translateLocation(selectedDistrict, activeLang)}, ${translateLocation(selectedState, activeLang)}`}>
              <View style={styles.summaryHeader}>
                <MaterialCommunityIcons name="check-decagram" size={22} color="#15803D" />
                <Text style={styles.summaryTitle} allowFontScaling={true}>{t('yourFarmLocation') || 'Your Farm Location'}</Text>
              </View>
              <Text style={styles.summaryLocation} allowFontScaling={true}>
                📍 {translateLocation(selectedDistrict, activeLang)}, {translateLocation(selectedState, activeLang)}
              </Text>
              <Text style={styles.summaryZone} allowFontScaling={true}>
                {t('zoneLabel') || 'Zone'}: {getStateDetails(selectedState)?.zone}
              </Text>
              <Text style={styles.summaryCrops} allowFontScaling={true}>
                {t('keyCropsLabel') || 'Key Crops:'} {getStateDetails(selectedState)?.primaryCrops.join(', ')}
              </Text>
            </View>
          )}

          {/* Spacer for scroll */}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* Continue Button (Fixed Bottom) */}
        <View style={styles.bottomBtnWrap}>
          <TouchableOpacity
            style={[styles.continueBtn, !canContinue && styles.continueBtnDisabled]}
            onPress={() => {
              if (canContinue) onContinue(selectedState!, selectedDistrict!);
            }}
            disabled={!canContinue}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('continueToKrishi') || 'Continue'}
            accessibilityState={{ disabled: !canContinue }}
            accessibilityHint="Double tap to confirm farm location and proceed to login"
          >
            <LinearGradient
              colors={canContinue ? ['#14532D', '#15803D'] : ['#94A3B8', '#94A3B8']}
              style={styles.continueBtnGradient}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
            >
              <Text style={styles.continueBtnText} allowFontScaling={true}>
                {t('continueToKrishi') || 'Continue →'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FDFBF7',
  },
  container: {
    flex: 1,
  },
  backBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: Platform.OS === 'web' ? 16 : 8,
    paddingBottom: 8,
    gap: 6,
  },
  backBtnText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#15803D',
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 24,
    paddingBottom: 40,
  },
  headerSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 24,
  },
  headerIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    borderWidth: 2,
    borderColor: '#A5D6A7',
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  headerTitleNative: {
    fontSize: 22,
    fontWeight: '700',
    color: '#15803D',
    textAlign: 'center',
    marginTop: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 20,
    maxWidth: 340,
  },
  gpsBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    elevation: 3,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  gpsBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 24,
    gap: 12,
  },
  gpsBtnText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#FFF',
    letterSpacing: 0.3,
  },
  detectedBadge: {
    backgroundColor: '#E8F5E9',
    borderRadius: 12,
    padding: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#A5D6A7',
  },
  detectedBadgeText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#166534',
    textAlign: 'center',
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
    gap: 12,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  dividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  pickerLabel: {
    fontSize: 15,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
    marginTop: 4,
  },
  pickerTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 16,
    gap: 10,
    marginBottom: 8,
  },
  pickerTriggerText: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionsList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    maxHeight: 280,
    overflow: 'scroll' as any,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionItemActive: {
    backgroundColor: '#E8F5E9',
  },
  optionContent: {
    flex: 1,
  },
  optionText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  optionHint: {
    fontSize: 12,
    color: '#94A3B8',
    marginTop: 2,
  },
  summaryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 20,
    marginTop: 20,
    borderWidth: 2,
    borderColor: '#86EFAC',
  },
  summaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  summaryTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#166534',
  },
  summaryLocation: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  summaryZone: {
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  summaryCrops: {
    fontSize: 13,
    color: '#15803D',
    fontWeight: '600',
    marginTop: 4,
  },
  bottomBtnWrap: {
    paddingHorizontal: 24,
    paddingVertical: 16,
    backgroundColor: '#FDFBF7',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  continueBtn: {
    borderRadius: 16,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  continueBtnDisabled: {
    elevation: 0,
    shadowOpacity: 0,
  },
  continueBtnGradient: {
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  continueBtnText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFF',
    letterSpacing: 0.5,
  },
});
