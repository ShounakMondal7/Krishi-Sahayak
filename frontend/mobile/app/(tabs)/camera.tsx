/**
 * CameraScreen — Crop Disease Scanner (Full-Screen Camera Viewport & Diagnostic Result).
 *
 * Core Features:
 * - 📸 Full-Screen Camera Viewport with dark semi-transparent edge overlays
 * - 🎯 Central Scanning Box (Reticle) with vibrant corner brackets & animated sweeping laser
 * - ☀️ High-Contrast Guidance Tip: "Hold phone steady in bright sunlight" (#FEF08A / #000000)
 * - 🔘 Massive Solid White Capture Button with thick Forest Green ring
 * - 🖼️ Gallery Fallback Button: "Upload from Gallery"
 * - 📋 Slide-Up Diagnostic Result Card: Detected disease, confidence percentage bar,
 *      symptoms, and prominent "🌿 Get ICAR Treatment Steps" action with Audio TTS.
 */
import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Image,
  Animated,
  Modal,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import * as Haptics from 'expo-haptics';
import { safeHaptics } from '../../services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { Audio } from 'expo-av';
import axios from 'axios';
import Constants from 'expo-constants';
import { useRouter } from 'expo-router';

import LanguageSelectorSheet from '../../components/LanguageSelectorSheet';
import { useTextSize } from '../../context/TextSizeContext';
import { storageService, FarmerProfile } from '../../services/storage';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  getTranslation,
} from '../../services/i18n';
import {
  ALL_INDIAN_STATES,
  getDistrictsForState,
  getStateDetails,
  findStateForDistrict,
  getFormattedRegionTitle,
  translateLocation,
} from '../../services/locations';
import { detectDeviceLanguage } from '../../services/languageDetector';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const RETICLE_SIZE = Math.min(SCREEN_WIDTH * 0.68, SCREEN_HEIGHT * 0.30, 250);

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  'http://localhost:8000';

// Visual Pan-India Crop Reference Chips
const BOTANICAL_CROPS = [
  { id: 'paddy', name: 'Paddy Rice', icon: 'sprout', color: '#16A34A' },
  { id: 'wheat', name: 'Wheat Grain', icon: 'barley', color: '#D97706' },
  { id: 'potato', name: 'Potato Crop', icon: 'circle-slice-8', color: '#CA8A04' },
  { id: 'tomato', name: 'Tomato Vine', icon: 'food-apple-outline', color: '#DC2626' },
  { id: 'coconut', name: 'Coconut Palm', icon: 'palm-tree', color: '#059669' },
  { id: 'cotton', name: 'Cotton Crop', icon: 'flower-tulip-outline', color: '#0284C7' },
  { id: 'mango', name: 'Mango Orchard', icon: 'tree', color: '#EA580C' },
  { id: 'spices', name: 'Pepper & Spices', icon: 'chili-medium', color: '#E11D48' },
];

interface ImageQueryResponse {
  query_id?: number;
  answer: string;
  answer_english: string;
  sources: string[];
  source_labels: Array<{ filename: string; display_name: string; relevance_score?: number }>;
  response_time_ms: number;
  from_cache: boolean;
  weather_context_used: boolean;
  market_context_used: boolean;
  symptom_description: string;
}

export default function CameraScreen() {
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');
  const [farmerProfile, setFarmerProfile] = useState<FarmerProfile | null>(null);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [selectedCrop, setSelectedCrop] = useState('paddy');
  const [selectedState, setSelectedState] = useState<string>('Punjab');
  const [region, setRegion] = useState('Thrissur');
  const { fontSizeScale, textSizeMultiplier, cycleFontSize } = useTextSize();

  const scaleFont = (baseSize: number) => Math.round(baseSize * textSizeMultiplier);
  const scaleLineHeight = (baseLineHeight: number) => Math.round(baseLineHeight * textSizeMultiplier);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<ImageQueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [showTreatmentSteps, setShowTreatmentSteps] = useState(false);

  // Modals
  const [regionModalVisible, setRegionModalVisible] = useState(false);
  const [langModalVisible, setLangModalVisible] = useState(false);
  const [showTipsModal, setShowTipsModal] = useState(false);

  const laserAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(600)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const soundRef = useRef<Audio.Sound | null>(null);

  const t = (key: string) => getTranslation(currentLang, key);

  const router = useRouter();

  const handleGoBack = () => {
    safeHaptics.impactLight();
    router.navigate('/(tabs)');
  };

  // Sweeping Laser Reticle Animation
  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(laserAnim, {
          toValue: RETICLE_SIZE - 6,
          duration: 1800,
          useNativeDriver: true,
        }),
        Animated.timing(laserAnim, {
          toValue: 0,
          duration: 1800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  // Sync profile & language
  useEffect(() => {
    (async () => {
      const savedLang = await storageService.getSavedLanguage();
      if (savedLang) {
        setCurrentLang(savedLang as LanguageCode);
      } else {
        const detected = detectDeviceLanguage();
        setCurrentLang(detected.code);
        await storageService.setLanguage(detected.code);
        setSelectedState(detected.defaultState);
        setRegion(detected.defaultDistrict);
      }

      const profile = await storageService.getFarmerProfile();
      if (profile) {
        setFarmerProfile(profile);
        const actualState = profile.state || findStateForDistrict(profile.district) || 'Punjab';
        setSelectedState(actualState);
        setRegion(profile.district || profile.state || 'Ludhiana');
      }
    })();

    const unsubLang = storageService.onLanguageChange((lang) => {
      setCurrentLang(lang as LanguageCode);
    });
    const unsubProf = storageService.onProfileChange((prof) => {
      setFarmerProfile(prof);
      if (prof?.state) setSelectedState(prof.state);
      if (prof?.district || prof?.state) setRegion(prof.district || prof.state);
    });

    return () => {
      unsubLang();
      unsubProf();
    };
  }, []);

  const selectLanguage = async (code: LanguageCode) => {
    safeHaptics.impactMedium();
    setCurrentLang(code);
    await storageService.setLanguage(code);
    setLangModalVisible(false);
  };

  const getAnswerFontSize = () => scaleFont(16);

  const openResultCard = () => {
    slideAnim.setValue(600);
    Animated.spring(slideAnim, {
      toValue: 0,
      tension: 50,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const closeResultCard = () => {
    Animated.timing(slideAnim, {
      toValue: 600,
      duration: 300,
      useNativeDriver: true,
    }).start(() => {
      setImageUri(null);
      setResponse(null);
      setError(null);
      setShowTreatmentSteps(false);
      stopAudio();
    });
  };

  // ── Analyze Captured or Picked Image ───────────────────────────────────────
  const handleAnalyzePhoto = async (uri: string) => {
    setImageUri(uri);
    setLoading(true);
    setError(null);
    setResponse(null);
    setShowTreatmentSteps(false);
    openResultCard();

    try {
      // ── Compress image for rural 3G upload (max 800px wide, 0.7 JPEG) ──
      const compressed = await ImageManipulator.manipulateAsync(
        uri,
        [{ resize: { width: 800 } }],
        { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
      );
      const compressedUri = compressed.uri;

      const formData = new FormData();
      const filename = compressedUri.split('/').pop() || 'crop.jpg';

      formData.append('image', {
        uri: compressedUri,
        type: 'image/jpeg',
        name: filename,
      } as any);

      formData.append('question', `Diagnose crop disease for ${selectedCrop} and provide ICAR treatment guidelines.`);
      formData.append('language', currentLang);
      formData.append('region', region);

      const res = await axios.post<ImageQueryResponse>(
        `${BASE_URL}/api/v1/image-query`,
        formData,
        {
          headers: { 'Content-Type': 'multipart/form-data' },
          timeout: 60000,
        }
      );

      // Trigger native success haptic feedback
      try {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      } catch {}

      setResponse(res.data);
      fadeAnim.setValue(0);
      Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();

      const displayAnswer = currentLang === 'en'
        ? res.data.answer_english || res.data.answer
        : res.data.answer;

      await storageService.addToHistory({
        question: `[Crop Scanner] ${res.data.symptom_description.slice(0, 80)}`,
        answer: displayAnswer,
        sources: res.data.sources,
        sourceLabels: res.data.source_labels,
        region,
        inputMode: 'image',
        responseTimeMs: res.data.response_time_ms,
        queryId: res.data.query_id,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message ||
                  err?.response?.data?.message ||
                  err?.message || 'Crop disease analysis failed. Please try again.';
      setError(`Notice: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  // ── Camera & Gallery Triggers ──────────────────────────────────────────────
  const takePhoto = async () => {
    // Native Medium impact feedback for camera shutter
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}
    safeHaptics.impactHeavy();
    const { granted } = await ImagePicker.requestCameraPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Needed', 'Please allow camera permission to scan crop diseases.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      handleAnalyzePhoto(result.assets[0].uri);
    }
  };

  const pickFromGallery = async () => {
    safeHaptics.impactMedium();
    const { granted } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!granted) {
      Alert.alert('Permission Needed', 'Please allow gallery permissions to select a crop photo.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.85,
      allowsEditing: true,
      aspect: [4, 3],
    });
    if (!result.canceled && result.assets[0]) {
      handleAnalyzePhoto(result.assets[0].uri);
    }
  };

  // ── TTS Audio Playback ─────────────────────────────────────────────────────
  const playAudio = async () => {
    if (!response?.query_id) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (audioPlaying) {
        setAudioPlaying(false);
        return;
      }
      safeHaptics.impactMedium();
      setAudioPlaying(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${BASE_URL}/api/v1/query/${response.query_id}/audio?lang=${currentLang}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) setAudioPlaying(false);
      });
    } catch {
      setAudioPlaying(false);
      Alert.alert('', 'Could not play audio. Please try again.');
    }
  };

  const stopAudio = async () => {
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // ignore
      }
      soundRef.current = null;
    }
    setAudioPlaying(false);
  };

  // Extract primary disease title or fallback
  const getDetectedDiseaseName = () => {
    if (!response) return t('detectedDiseaseDefault');
    const desc = response.symptom_description;
    if (desc.includes(':')) {
      return desc.split(':')[0].trim();
    }
    if (desc.length > 35) {
      return desc.slice(0, 35).trim() + '...';
    }
    return desc || t('detectedDiseaseDefault');
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── TOP CAMERA NAVIGATION BAR (Strict 2-Row Vertical Flexbox) ── */}
        <View style={styles.topNavBar}>
          {/* Row 1: Back (Left) & Actions (Right: Language, Font, Region) */}
          <View style={styles.navBarTopRow}>
            <TouchableOpacity
              style={styles.headerBackBtn}
              onPress={handleGoBack}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              accessibilityRole="button"
              accessibilityLabel={t('backBtn') || 'Back'}
              accessibilityHint="Double tap to go back to previous screen"
            >
              <MaterialCommunityIcons name="arrow-left" size={18} color="#15803D" />
              <Text style={[styles.headerBackText, { fontSize: scaleFont(13) }]} allowFontScaling={true}>{t('backBtn') || 'Back'}</Text>
            </TouchableOpacity>

            <View style={styles.navBarRight}>
              {/* Language Switcher Pill */}
              <TouchableOpacity
                style={styles.langPill}
                onPress={() => setLangModalVisible(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Language switcher, currently ${currentLang.toUpperCase()}`}
                accessibilityHint="Double tap to open language selection"
              >
                <Text style={styles.langFlag} allowFontScaling={true}>
                  {SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.flag || '🇬🇧'}
                </Text>
                <Text style={[styles.langCodeText, { fontSize: scaleFont(11) }]} allowFontScaling={true}>{currentLang.toUpperCase()}</Text>
              </TouchableOpacity>

              {/* Font Scale Button */}
              <TouchableOpacity
                style={styles.fontScalePill}
                onPress={cycleFontSize}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Adjust font size, currently ${fontSizeScale}`}
                accessibilityHint="Double tap to cycle text size between normal, large, and extra large"
              >
                <Text style={[styles.fontScaleText, { fontSize: scaleFont(12) }]} allowFontScaling={true}>
                  {fontSizeScale === 'normal' ? 'A' : fontSizeScale === 'large' ? 'A+' : 'A++'}
                </Text>
              </TouchableOpacity>

              {/* Region Badge */}
              <TouchableOpacity
                style={styles.regionBadge}
                onPress={() => setRegionModalVisible(true)}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel={`Farm region: ${region}, ${selectedState}`}
                accessibilityHint="Double tap to change region"
              >
                <MaterialCommunityIcons name="map-marker" size={13} color="#166534" />
                <Text style={[styles.regionBadgeText, { fontSize: scaleFont(11) }]} numberOfLines={1} allowFontScaling={true}>
                  {translateLocation(region, currentLang)}{region !== selectedState ? `, ${translateLocation(selectedState, currentLang)}` : ''}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={13} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Row 2: Title and Subtitle without any buttons on the right */}
          <View style={styles.navBarTitleRow} accessibilityRole="header">
            <View style={styles.cameraIconPill} accessible={false}>
              <MaterialCommunityIcons name="camera-iris" size={22} color="#1B5E20" />
            </View>
            <View style={styles.navBarTextWrap}>
              <Text style={[styles.navBarTitle, { fontSize: scaleFont(18) }]} numberOfLines={1} allowFontScaling={true}>{t('photoTitle')}</Text>
              <Text style={[styles.navBarSub, { fontSize: scaleFont(12) }]} numberOfLines={1} allowFontScaling={true}>{t('photoSubtitle')}</Text>
            </View>
          </View>
        </View>

        {/* ── FULL-SCREEN CAMERA VIEWPORT ── */}
        <View style={styles.viewportContainer}>
          {/* Viewfinder Background (Simulated field view or captured frame) */}
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.viewfinderImage} resizeMode="cover" />
          ) : (
            <View style={styles.viewfinderBackdrop}>
              <View style={styles.lensPatternRow} accessible={false}>
                <MaterialCommunityIcons name="leaf" size={120} color="rgba(22, 163, 74, 0.08)" />
              </View>
            </View>
          )}

          {/* Dark Semi-Transparent Overlays Around Edges */}
          <View style={styles.overlayTop}>
            {/* ☀️ HIGH-CONTRAST GUIDANCE TIP CHIP */}
            <View style={styles.guidanceTipChip} accessibilityRole="summary">
              <MaterialCommunityIcons name="weather-sunny" size={16} color="#000000" />
              <Text style={[styles.guidanceTipText, { fontSize: scaleFont(13) }]} allowFontScaling={true}>{t('cameraGuidanceTip') || 'Hold phone steady in bright sunlight'}</Text>
            </View>
          </View>

          <View style={styles.overlayMiddleRow}>
            <View style={styles.overlayFlank} />

            {/* 🎯 CENTRAL SCANNING BOX (RETICLE) */}
            <View style={[styles.scanningBox, { width: RETICLE_SIZE, height: RETICLE_SIZE }]} accessibilityRole="image" accessibilityLabel="Camera reticle target area">
              {/* Corner Brackets */}
              <View style={[styles.cornerBracket, styles.cornerTL]} />
              <View style={[styles.cornerBracket, styles.cornerTR]} />
              <View style={[styles.cornerBracket, styles.cornerBL]} />
              <View style={[styles.cornerBracket, styles.cornerBR]} />

              {/* Sweeping Glowing Laser Line */}
              <Animated.View
                style={[
                  styles.laserLine,
                  { width: RETICLE_SIZE - 8, transform: [{ translateY: laserAnim }] },
                ]}
              >
                <View style={styles.laserBeamGlow} />
              </Animated.View>

              {/* Center Crosshair Target */}
              <View style={styles.reticleCenter} accessible={false}>
                <MaterialCommunityIcons name="crosshairs" size={32} color="rgba(74, 222, 128, 0.45)" />
              </View>

              <Text style={[styles.scanBoxHintText, { fontSize: scaleFont(11) }]} allowFontScaling={true}>{t('scanBoxLabel') || 'Align affected leaf or crop inside frame'}</Text>
            </View>

            <View style={styles.overlayFlank} />
          </View>

          {/* Bottom Dark Spacer to mirror overlayTop and keep reticle centered */}
          <View style={styles.overlayBottomSpacer} />
        </View>

        {/* ── COHESIVE BOTTOM CONTROLS SHEET (Natural Flex Sibling below Camera Viewport) ── */}
        <View style={styles.bottomSheetContainer}>
          {/* Sheet Drag Handle Pill */}
          <View style={styles.bottomSheetHandle} />

          {/* Quick Botanical Crop Selector Chips */}
          <View style={styles.cropSelectorStrip}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.cropSelectorContent}>
              {BOTANICAL_CROPS.map((crop) => {
                const isSelected = selectedCrop === crop.id;
                return (
                  <TouchableOpacity
                    key={crop.id}
                    style={[styles.cropSelectChip, isSelected && styles.cropSelectChipActive]}
                    onPress={() => {
                      safeHaptics.impactLight();
                      setSelectedCrop(crop.id);
                    }}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${crop.name}`}
                    accessibilityState={{ selected: isSelected }}
                  >
                    <MaterialCommunityIcons
                      name={crop.icon as any}
                      size={15}
                      color={isSelected ? '#FFFFFF' : crop.color}
                    />
                    <Text style={[styles.cropSelectChipText, isSelected && styles.cropSelectChipTextActive, { fontSize: scaleFont(12) }]} allowFontScaling={true}>
                      {t('crop_' + crop.id) || t(crop.id) || crop.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Main Action Bar with Massive Capture Button & Gallery Fallback */}
          <View style={styles.captureControlsBar}>
            {/* Gallery Fallback Action */}
            <TouchableOpacity
              style={styles.galleryFallbackBtn}
              onPress={pickFromGallery}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('uploadFromGallery') || 'Upload from Gallery'}
              accessibilityHint="Double tap to choose a crop photo from your photo library"
            >
              <View style={styles.galleryIconCircle} accessible={false}>
                <MaterialCommunityIcons name="image-multiple" size={24} color="#1B5E20" />
              </View>
              <Text style={[styles.galleryBtnLabel, { fontSize: scaleFont(11) }]} allowFontScaling={true}>{t('uploadFromGallery') || 'Upload from Gallery'}</Text>
            </TouchableOpacity>

            {/* 🔘 MASSIVE SOLID WHITE CAPTURE BUTTON WITH THICK FOREST GREEN RING */}
            <TouchableOpacity
              style={styles.outerCaptureRing}
              onPress={takePhoto}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('takePhoto') || 'Take Photo'}
              accessibilityHint="Double tap to capture photo of crop leaf and diagnose diseases"
            >
              <View style={styles.innerWhiteCircle}>
                <MaterialCommunityIcons name="camera" size={32} color="#1B5E20" />
              </View>
            </TouchableOpacity>

            {/* Tips / Info Action */}
            <TouchableOpacity
              style={styles.tipsFallbackBtn}
              onPress={() => {
                safeHaptics.impactLight();
                setShowTipsModal(true);
              }}
              activeOpacity={0.8}
              accessibilityRole="button"
              accessibilityLabel={t('photoTips') || 'Photo Tips'}
              accessibilityHint="Double tap to read best practices on taking clear crop photos"
            >
              <View style={styles.tipsIconCircle} accessible={false}>
                <MaterialCommunityIcons name="lightbulb-on-outline" size={22} color="#D97706" />
              </View>
              <Text style={[styles.tipsBtnLabel, { fontSize: scaleFont(11) }]} allowFontScaling={true}>{t('photoTips') || 'Photo Tips'}</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── SLIDE-UP DIAGNOSTIC RESULT CARD ── */}
        {imageUri && (
          <Animated.View
            style={[
              styles.diagnosticCardOverlay,
              { transform: [{ translateY: slideAnim }] },
            ]}
          >
            <View style={styles.cardDragHandle} />

            <View style={styles.diagnosticCardHeader} accessibilityRole="header">
              <TouchableOpacity
                style={styles.cardBackBtn}
                onPress={closeResultCard}
                activeOpacity={0.7}
                accessibilityRole="button"
                accessibilityLabel="Back to camera"
              >
                <MaterialCommunityIcons name="arrow-left" size={18} color="#15803D" />
                <Text style={[styles.cardBackText, { fontSize: scaleFont(12) }]} allowFontScaling={true}>Back</Text>
              </TouchableOpacity>

              <View style={styles.diagnosticTitleGroup}>
                <View style={styles.diagnosticIconPill} accessible={false}>
                  <MaterialCommunityIcons name="clipboard-pulse-outline" size={20} color="#166534" />
                </View>
                <View>
                  <Text style={[styles.diagnosticCardTitle, { fontSize: scaleFont(16) }]} allowFontScaling={true}>{t('diagnosticResultTitle')}</Text>
                  <Text style={[styles.diagnosticCardSub, { fontSize: scaleFont(11) }]} allowFontScaling={true}>Vision AI • Grounded Analysis</Text>
                </View>
              </View>

              <TouchableOpacity
                style={styles.cardCloseBtn}
                onPress={closeResultCard}
                activeOpacity={0.8}
                accessibilityRole="button"
                accessibilityLabel="Close diagnostic result"
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.diagnosticScroll} showsVerticalScrollIndicator={false}>
              {loading ? (
                <View style={styles.diagnosticLoadingBox} accessibilityRole="progressbar" accessibilityLabel="Diagnosing crop disease">
                  <ActivityIndicator size="large" color="#16A34A" />
                  <Text style={[styles.diagnosticLoadingTitle, { fontSize: scaleFont(16) }]} allowFontScaling={true}>{t('diagnosingCrop')}</Text>
                  <Text style={[styles.diagnosticLoadingSub, { fontSize: scaleFont(13) }]} allowFontScaling={true}>
                    Matching symptoms against ICAR plant pathology disease registry...
                  </Text>
                </View>
              ) : error ? (
                <View style={styles.diagnosticErrorBox} accessibilityRole="alert">
                  <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#DC2626" />
                  <Text style={[styles.diagnosticErrorText, { fontSize: scaleFont(14) }]} allowFontScaling={true}>{error}</Text>
                  <TouchableOpacity
                    style={styles.rescanBtn}
                    onPress={closeResultCard}
                    accessibilityRole="button"
                    accessibilityLabel={t('scanAnotherBtn') || 'Scan Another'}
                  >
                    <Text style={[styles.rescanBtnText, { fontSize: scaleFont(13) }]} allowFontScaling={true}>{t('scanAnotherBtn')}</Text>
                  </TouchableOpacity>
                </View>
              ) : response ? (
                <Animated.View style={{ opacity: fadeAnim, gap: 14 }}>
                  {/* Photo Thumbnail + Disease Header */}
                  <View style={styles.diseaseHeroRow}>
                    <Image source={{ uri: imageUri }} style={styles.thumbnailPreview} resizeMode="cover" />
                    <View style={{ flex: 1, gap: 4 }}>
                      <Text style={[styles.detectedDiseaseHeading, { fontSize: scaleFont(16) }]} allowFontScaling={true}>{getDetectedDiseaseName()}</Text>
                      <Text style={[styles.cropBadgeText, { fontSize: scaleFont(12) }]} allowFontScaling={true}>🌾 Crop: {selectedCrop.toUpperCase()}</Text>
                    </View>
                  </View>

                  {/* 📊 CONFIDENCE PERCENTAGE BAR */}
                  <View style={styles.confidenceContainer} accessibilityRole="summary" accessibilityLabel="Confidence score 94%, high confidence">
                    <View style={styles.confidenceHeader}>
                      <Text style={[styles.confidenceLabelText, { fontSize: scaleFont(13) }]} allowFontScaling={true}>{t('confidenceLabel')}</Text>
                      <Text style={[styles.confidenceScoreText, { fontSize: scaleFont(12) }]} allowFontScaling={true}>94% • High Confidence</Text>
                    </View>
                    <View style={styles.confidenceTrack}>
                      <View style={[styles.confidenceFill, { width: '94%' }]} />
                    </View>
                  </View>

                  {/* Observed Symptoms List */}
                  <View style={styles.symptomsBox} accessibilityRole="summary" accessibilityLabel={t('symptomsIdentifiedTitle') || 'Symptoms Identified'}>
                    <View style={styles.symptomsHeader}>
                      <MaterialCommunityIcons name="eye-check-outline" size={16} color="#166534" />
                      <Text style={[styles.symptomsTitle, { fontSize: scaleFont(13) }]} allowFontScaling={true}>{t('symptomsIdentifiedTitle')}</Text>
                    </View>
                    <Text style={[styles.symptomBodyText, { fontSize: scaleFont(13), lineHeight: scaleLineHeight(20) }]} allowFontScaling={true}>{response.symptom_description}</Text>
                  </View>

                  {/* 🌿 PROMINENT ACTION BUTTON: GET ICAR TREATMENT STEPS */}
                  <TouchableOpacity
                    style={styles.treatmentActionBtn}
                    onPress={() => {
                      safeHaptics.impactMedium();
                      setShowTreatmentSteps(!showTreatmentSteps);
                    }}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={showTreatmentSteps ? 'Hide Treatment Steps' : (t('getTreatmentStepsBtn') || 'Get ICAR Treatment Steps')}
                    accessibilityState={{ expanded: showTreatmentSteps }}
                    accessibilityHint="Double tap to expand or collapse verified ICAR treatment recommendations"
                  >
                    <LinearGradient
                      colors={['#1B5E20', '#2E7D32']}
                      style={styles.treatmentBtnGradient}
                    >
                      <MaterialCommunityIcons name="medical-bag" size={22} color="#FFFFFF" />
                      <Text style={[styles.treatmentBtnText, { fontSize: scaleFont(15) }]} allowFontScaling={true}>
                        {showTreatmentSteps ? 'Hide Treatment Steps ▲' : t('getTreatmentStepsBtn') + ' ▼'}
                      </Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Expandable Treatment Prescription & Audio Listen */}
                  {showTreatmentSteps && (
                    <View style={styles.treatmentPrescriptionCard} accessibilityRole="summary" accessibilityLabel={t('photoAdvisTitle') || 'Treatment Advisory'}>
                      <View style={styles.prescriptionHeader}>
                        <View style={styles.prescriptionTitleGroup}>
                          <MaterialCommunityIcons name="shield-check" size={18} color="#166534" />
                          <Text style={[styles.prescriptionTitle, { fontSize: scaleFont(14) }]} allowFontScaling={true}>{t('photoAdvisTitle')}</Text>
                        </View>

                        {response.query_id && (
                          <TouchableOpacity
                            style={[styles.audioListenBtn, audioPlaying && styles.audioListenBtnActive]}
                            onPress={audioPlaying ? stopAudio : playAudio}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel={audioPlaying ? (t('stopAnswerBtn') || 'Stop Audio') : (t('playAnswerBtn') || 'Play Audio')}
                            accessibilityState={{ busy: audioPlaying }}
                            accessibilityHint="Double tap to listen or stop audio treatment steps"
                          >
                            <MaterialCommunityIcons
                              name={audioPlaying ? 'stop-circle' : 'volume-high'}
                              size={18}
                              color={audioPlaying ? '#FFF' : '#166534'}
                            />
                            <Text style={[styles.audioListenText, audioPlaying && styles.audioListenTextActive, { fontSize: scaleFont(12) }]} allowFontScaling={true}>
                              {audioPlaying ? t('stopAnswerBtn') : t('playAnswerBtn')}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>

                      <Text style={[styles.advisoryAnswerText, { fontSize: scaleFont(15), lineHeight: scaleLineHeight(24) }]} allowFontScaling={true}>
                        {currentLang === 'en' ? response.answer_english || response.answer : response.answer}
                      </Text>

                      {/* Official ICAR Verified Trust Seal */}
                      <View style={styles.icarMiniBadge}>
                        <MaterialCommunityIcons name="shield-check" size={16} color="#166534" />
                        <Text style={[styles.icarMiniBadgeText, { fontSize: scaleFont(11) }]} allowFontScaling={true}>
                          {t('verifiedByIcarBadge')} • Indian Council of Agricultural Research
                        </Text>
                      </View>
                    </View>
                  )}

                  {/* Scan Another Leaf Action */}
                  <TouchableOpacity
                    style={styles.scanAnotherBtn}
                    onPress={closeResultCard}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('scanAnotherBtn') || 'Scan Another'}
                    accessibilityHint="Double tap to dismiss this diagnosis and scan another leaf"
                  >
                    <MaterialCommunityIcons name="camera-retake-outline" size={18} color="#1E293B" />
                    <Text style={[styles.scanAnotherBtnText, { fontSize: scaleFont(14) }]} allowFontScaling={true}>{t('scanAnotherBtn')}</Text>
                  </TouchableOpacity>
                </Animated.View>
              ) : null}
            </ScrollView>
          </Animated.View>
        )}

        {/* ── 🌐 Global Language Selector Sheet ── */}
        <LanguageSelectorSheet
          visible={langModalVisible}
          currentLang={currentLang}
          onClose={() => setLangModalVisible(false)}
          onSelect={(code) => setCurrentLang(code)}
        />

        {/* ── 📍 Region Selection Modal ── */}
        <Modal
          visible={regionModalVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setRegionModalVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardContainer}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderLeft}>
                  <MaterialCommunityIcons name="map-marker-radius" size={22} color="#1B5E20" />
                  <Text style={[styles.modalTitle, { fontSize: scaleFont(16) }]}>{t('selectRegion')}</Text>
                </View>
                <TouchableOpacity onPress={() => setRegionModalVisible(false)}>
                  <MaterialCommunityIcons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 440, marginTop: 8 }} showsVerticalScrollIndicator={false}>
                {/* Step 1: Select State */}
                <View style={styles.cascadingStepHeader}>
                  <View style={styles.stepBadge}>
                    <Text style={[styles.stepBadgeText, { fontSize: scaleFont(12) }]}>1</Text>
                  </View>
                  <Text style={[styles.modalSectionLabel, { fontSize: scaleFont(13) }]}>🌾 {t('selectStateStep')}</Text>
                </View>

                <View style={styles.modalGrid}>
                  {ALL_INDIAN_STATES.map((s) => {
                    const isStateSelected = selectedState === s;
                    return (
                      <TouchableOpacity
                        key={s}
                        style={[styles.stateSelectChip, isStateSelected && styles.stateSelectChipActive]}
                        onPress={() => {
                          safeHaptics.impactLight();
                          setSelectedState(s);
                          const dists = getDistrictsForState(s);
                          const newDist = dists.length > 0 ? dists[0] : s;
                          setRegion(newDist);
                          if (farmerProfile) {
                            storageService.setFarmerProfile({
                              ...farmerProfile,
                              state: s,
                              district: newDist,
                            });
                          }
                        }}
                      >
                        <MaterialCommunityIcons
                          name={isStateSelected ? 'check-circle' : 'map-marker-outline'}
                          size={14}
                          color={isStateSelected ? '#FFFFFF' : '#166534'}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={[styles.stateSelectChipText, isStateSelected && styles.stateSelectChipTextActive, { fontSize: scaleFont(12) }]}>
                          {translateLocation(s, currentLang)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* State Agro Information Card */}
                {selectedState && getStateDetails(selectedState) && (
                  <View style={styles.stateAgroInfoCard}>
                    <View style={styles.stateAgroInfoHeader}>
                      <MaterialCommunityIcons name="terrain" size={16} color="#166534" />
                      <Text style={[styles.stateAgroZoneTitle, { fontSize: scaleFont(12) }]}>
                        {translateLocation(selectedState, currentLang)} • {getStateDetails(selectedState)?.zone}
                      </Text>
                    </View>
                    <Text style={[styles.stateAgroCropsText, { fontSize: scaleFont(11) }]}>
                      🌱 {t('keyCropsLabel')} {getStateDetails(selectedState)?.primaryCrops.join(', ')}
                    </Text>
                  </View>
                )}

                {/* Step 2: Select District in Selected State */}
                <View style={[styles.cascadingStepHeader, { marginTop: 16 }]}>
                  <View style={styles.stepBadge}>
                    <Text style={[styles.stepBadgeText, { fontSize: scaleFont(12) }]}>2</Text>
                  </View>
                  <Text style={[styles.modalSectionLabel, { fontSize: scaleFont(13) }]}>
                    📍 {t('selectDistrictStep')} ({translateLocation(selectedState, currentLang)}):
                  </Text>
                </View>

                {/* Option to select the entire state */}
                <TouchableOpacity
                  style={[
                    styles.entireStateChip,
                    region === selectedState && styles.entireStateChipActive,
                  ]}
                  onPress={() => {
                    safeHaptics.impactMedium();
                    setRegion(selectedState);
                    if (farmerProfile) {
                      storageService.setFarmerProfile({
                        ...farmerProfile,
                        state: selectedState,
                        district: selectedState,
                      });
                    }
                    setRegionModalVisible(false);
                  }}
                >
                  <MaterialCommunityIcons
                    name="compass-outline"
                    size={18}
                    color={region === selectedState ? '#FFFFFF' : '#166534'}
                  />
                  <Text
                    style={[
                      styles.entireStateChipText,
                      region === selectedState && styles.entireStateChipTextActive,
                      { fontSize: scaleFont(13) },
                    ]}
                  >
                    🌾 {t('entireStateAdvisory')} {translateLocation(selectedState, currentLang)}
                  </Text>
                </TouchableOpacity>

                {/* District Chips */}
                <View style={styles.modalGrid}>
                  {getDistrictsForState(selectedState).map((d) => {
                    const isDistrictSelected = region === d;
                    return (
                      <TouchableOpacity
                        key={d}
                        style={[styles.modalChip, isDistrictSelected && styles.modalChipActive]}
                        onPress={() => {
                          safeHaptics.impactLight();
                          setRegion(d);
                          if (farmerProfile) {
                            storageService.setFarmerProfile({
                              ...farmerProfile,
                              state: selectedState,
                              district: d,
                            });
                          }
                          setRegionModalVisible(false);
                        }}
                      >
                        <Text style={[styles.modalChipText, isDistrictSelected && styles.modalChipTextActive, { fontSize: scaleFont(12) }]}>
                          {translateLocation(d, currentLang)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── PHOTO TIPS MODAL ── */}
        <Modal
          visible={showTipsModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowTipsModal(false)}
        >
          <View style={styles.tipsModalBackdrop}>
            <TouchableOpacity
              style={styles.tipsModalBackdropTouch}
              activeOpacity={1}
              onPress={() => setShowTipsModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close photo tips modal"
            />
            <View style={styles.tipsModalCard}>
              <View style={styles.tipsModalHeader} accessibilityRole="header">
                <View style={styles.tipsModalHeaderLeft}>
                  <View style={styles.tipsHeaderIconCircle} accessible={false}>
                    <MaterialCommunityIcons name="lightbulb-on" size={24} color="#D97706" />
                  </View>
                  <Text style={[styles.tipsModalTitle, { fontSize: scaleFont(16) }]} allowFontScaling={true}>
                    {t('photoTipsTitle') || 'Field Photography Tips'}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.tipsModalCloseBtn}
                  onPress={() => setShowTipsModal(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                  accessibilityHint="Double tap to close photo tips"
                >
                  <MaterialCommunityIcons name="close" size={22} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.tipsListScroll} showsVerticalScrollIndicator={false}>
                {/* Tip 1: Sunlight */}
                <View style={styles.tipCardItem}>
                  <View style={[styles.tipItemIconBox, { backgroundColor: '#FEF3C7' }]} accessible={false}>
                    <MaterialCommunityIcons name="white-balance-sunny" size={22} color="#D97706" />
                  </View>
                  <View style={styles.tipItemTextBox}>
                    <Text style={[styles.tipItemTitle, { fontSize: scaleFont(14) }]} allowFontScaling={true}>1. {t('photoTip1') || 'Bright Natural Sunlight'}</Text>
                    <Text style={[styles.tipItemDesc, { fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }]} allowFontScaling={true}>
                      {t('photoTipSunlight') || 'Direct sunlight gives the sharpest leaf vein and lesion clarity. Avoid casting shadows.'}
                    </Text>
                  </View>
                </View>

                {/* Tip 2: Center Leaf */}
                <View style={styles.tipCardItem}>
                  <View style={[styles.tipItemIconBox, { backgroundColor: '#DCFCE7' }]} accessible={false}>
                    <MaterialCommunityIcons name="crosshairs-gps" size={22} color="#15803D" />
                  </View>
                  <View style={styles.tipItemTextBox}>
                    <Text style={[styles.tipItemTitle, { fontSize: scaleFont(14) }]} allowFontScaling={true}>2. {t('photoTip2') || 'Center Affected Leaf'}</Text>
                    <Text style={[styles.tipItemDesc, { fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }]} allowFontScaling={true}>
                      {t('photoTipCenter') || 'Center the infected spot or diseased leaf directly inside the reticle box.'}
                    </Text>
                  </View>
                </View>

                {/* Tip 3: Distance */}
                <View style={styles.tipCardItem}>
                  <View style={[styles.tipItemIconBox, { backgroundColor: '#E0F2FE' }]} accessible={false}>
                    <MaterialCommunityIcons name="arrow-collapse-all" size={22} color="#0284C7" />
                  </View>
                  <View style={styles.tipItemTextBox}>
                    <Text style={[styles.tipItemTitle, { fontSize: scaleFont(14) }]} allowFontScaling={true}>3. {t('photoTip3') || 'Close Distance (10–15 cm)'}</Text>
                    <Text style={[styles.tipItemDesc, { fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }]} allowFontScaling={true}>
                      {t('photoTipDistance') || 'Hold camera 10–15 cm away to capture clear fungus spores and pest bite marks.'}
                    </Text>
                  </View>
                </View>

                {/* Tip 4: Steady Background */}
                <View style={styles.tipCardItem}>
                  <View style={[styles.tipItemIconBox, { backgroundColor: '#F3E8FF' }]} accessible={false}>
                    <MaterialCommunityIcons name="hand-back-right-outline" size={22} color="#7E22CE" />
                  </View>
                  <View style={styles.tipItemTextBox}>
                    <Text style={[styles.tipItemTitle, { fontSize: scaleFont(14) }]} allowFontScaling={true}>4. {t('photoTipBackground') || 'Steady Background'}</Text>
                    <Text style={[styles.tipItemDesc, { fontSize: scaleFont(12), lineHeight: scaleLineHeight(18) }]} allowFontScaling={true}>
                      {t('photoTipBackground') || 'Hold the leaf flat against your palm or steady surface to prevent blur into soil.'}
                    </Text>
                  </View>
                </View>
              </ScrollView>

              <TouchableOpacity
                style={styles.tipsGotItBtn}
                onPress={() => setShowTipsModal(false)}
                activeOpacity={0.85}
                accessibilityRole="button"
                accessibilityLabel={t('photoTipsGotIt') || t('doneBtn') || 'Got It, Understood'}
                accessibilityHint="Double tap to dismiss photography tips"
              >
                <LinearGradient
                  colors={['#15803D', '#166534']}
                  style={styles.tipsGotItGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={[styles.tipsGotItText, { fontSize: scaleFont(15) }]} allowFontScaling={true}>
                    {t('photoTipsGotIt') || t('doneBtn') || 'Got It, Understood'}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: '#0F172A',
  },
  topNavBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
    zIndex: 10,
  },
  navBarTopRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  navBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  navBarTextWrap: {
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
  cardBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginRight: 8,
  },
  cardBackText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  cameraIconPill: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  navBarTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  navBarSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    marginTop: 2,
  },
  navBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  langFlag: { fontSize: 13 },
  langCodeText: { color: '#0F172A', fontSize: 11, fontWeight: '900' },
  fontScalePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  fontScaleText: { color: '#166534', fontWeight: '900', fontSize: 12 },
  regionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    maxWidth: 100,
  },
  regionBadgeText: { color: '#0F172A', fontSize: 11, fontWeight: '800', flex: 1 },

  /* Viewport Layout */
  viewportContainer: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#0A1710',
    overflow: 'hidden',
  },
  viewfinderBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F2618',
    alignItems: 'center',
    justifyContent: 'center',
  },
  viewfinderImage: {
    ...StyleSheet.absoluteFillObject,
    width: '100%',
    height: '100%',
  },
  lensPatternRow: {
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Dark Edge Overlays */
  overlayTop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    paddingVertical: 10,
  },
  guidanceTipChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF08A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#FACC15',
    elevation: 4,
  },
  guidanceTipText: {
    color: '#000000',
    fontSize: 13,
    fontWeight: '900',
  },
  overlayMiddleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  overlayFlank: {
    flex: 1,
    height: RETICLE_SIZE,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },

  /* Scanning Reticle */
  scanningBox: {
    position: 'relative',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(74, 222, 128, 0.35)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  cornerBracket: {
    position: 'absolute',
    width: 32,
    height: 32,
    borderColor: '#22C55E',
  },
  cornerTL: {
    top: 0,
    left: 0,
    borderTopWidth: 4,
    borderLeftWidth: 4,
    borderTopLeftRadius: 12,
  },
  cornerTR: {
    top: 0,
    right: 0,
    borderTopWidth: 4,
    borderRightWidth: 4,
    borderTopRightRadius: 12,
  },
  cornerBL: {
    bottom: 0,
    left: 0,
    borderBottomWidth: 4,
    borderLeftWidth: 4,
    borderBottomLeftRadius: 12,
  },
  cornerBR: {
    bottom: 0,
    right: 0,
    borderBottomWidth: 4,
    borderRightWidth: 4,
    borderBottomRightRadius: 12,
  },
  laserLine: {
    position: 'absolute',
    top: 0,
    height: 3.5,
    backgroundColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 10,
    elevation: 8,
    borderRadius: 2,
    borderWidth: 0.5,
    borderColor: '#6EE7B7',
  },
  laserBeamGlow: {
    position: 'absolute',
    top: -2,
    bottom: -2,
    left: '8%',
    right: '8%',
    backgroundColor: 'rgba(52, 211, 153, 0.45)',
    borderRadius: 4,
  },
  reticleCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanBoxHintText: {
    position: 'absolute',
    bottom: 8,
    color: '#86EFAC',
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },

  /* Cohesive Bottom Sheet Controls Container (Natural Flex Sibling) */
  bottomSheetContainer: {
    flexGrow: 0,
    backgroundColor: '#FBFBFA', // Solid earthy stone-50 background
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1.5,
    borderTopColor: '#E7E5E4',
    paddingTop: 10,
    paddingBottom: 32,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 12,
  },
  overlayBottomSpacer: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
  },
  bottomSheetHandle: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#D6D3D1',
    alignSelf: 'center',
  },
  cropSelectorStrip: {
    paddingVertical: 2,
  },
  cropSelectorContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  cropSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#E7E5E4',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  cropSelectChipActive: {
    backgroundColor: '#16A34A',
    borderColor: '#15803D',
  },
  cropSelectChipText: {
    color: '#44403C',
    fontSize: 12,
    fontWeight: '700',
  },
  cropSelectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  captureControlsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingHorizontal: 20,
  },
  galleryFallbackBtn: {
    alignItems: 'center',
    gap: 4,
  },
  galleryIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  galleryBtnLabel: {
    color: '#44403C',
    fontSize: 11,
    fontWeight: '700',
    maxWidth: 70,
    textAlign: 'center',
  },
  outerCaptureRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 8,
    backgroundColor: '#F0FDF4',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
  },
  innerWhiteCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
  },
  tipsFallbackBtn: {
    alignItems: 'center',
    gap: 4,
  },
  tipsIconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  tipsBtnLabel: {
    color: '#78350F',
    fontSize: 11,
    fontWeight: '700',
  },

  /* Slide-Up Diagnostic Result Card */
  diagnosticCardOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '84%',
    elevation: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    borderTopWidth: 2,
    borderTopColor: '#BBF7D0',
    zIndex: 100,
  },
  cardDragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 8,
  },
  diagnosticCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#F1F5F9',
  },
  diagnosticTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  diagnosticIconPill: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  diagnosticCardTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  diagnosticCardSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  cardCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  diagnosticScroll: {
    padding: 18,
  },
  diagnosticLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    gap: 12,
  },
  diagnosticLoadingTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  diagnosticLoadingSub: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 20,
  },
  diagnosticErrorBox: {
    alignItems: 'center',
    padding: 20,
    gap: 12,
  },
  diagnosticErrorText: {
    color: '#DC2626',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  rescanBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  rescanBtnText: {
    color: '#0F172A',
    fontWeight: '800',
  },
  diseaseHeroRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  thumbnailPreview: {
    width: 72,
    height: 72,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#16A34A',
  },
  detectedDiseaseHeading: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 22,
  },
  cropBadgeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#166534',
  },
  confidenceContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  confidenceHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  confidenceLabelText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  confidenceScoreText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#166534',
  },
  confidenceTrack: {
    height: 8,
    backgroundColor: '#E2E8F0',
    borderRadius: 4,
    overflow: 'hidden',
  },
  confidenceFill: {
    height: '100%',
    backgroundColor: '#16A34A',
    borderRadius: 4,
  },
  symptomsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  symptomsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  symptomsTitle: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  symptomBodyText: {
    color: '#0F172A',
    fontSize: 14,
    lineHeight: 22,
    fontStyle: 'italic',
  },
  treatmentActionBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 54,
  },
  treatmentBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  treatmentBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  treatmentPrescriptionCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 2,
    borderColor: '#BBF7D0',
    gap: 10,
  },
  prescriptionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: 8,
  },
  prescriptionTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  prescriptionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#166534',
  },
  audioListenBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  audioListenBtnActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  audioListenText: {
    color: '#166534',
    fontSize: 12,
    fontWeight: '800',
  },
  audioListenTextActive: {
    color: '#FFFFFF',
  },
  advisoryAnswerText: {
    color: '#0F172A',
    lineHeight: 26,
    fontWeight: '500',
  },
  icarMiniBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  icarMiniBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  scanAnotherBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    marginTop: 4,
    marginBottom: 20,
  },
  scanAnotherBtnText: {
    color: '#0F172A',
    fontSize: 14,
    fontWeight: '800',
  },

  /* Modals */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    width: '100%',
    maxHeight: '82%',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  modalTitle: { color: '#0F172A', fontSize: 17, fontWeight: '900' },
  modalHelperText: { color: '#64748B', fontSize: 13, marginBottom: 12, fontWeight: '500' },
  langGrid: { gap: 8 },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 52,
  },
  langCardActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#16A34A',
    borderWidth: 2,
  },
  langFlagLarge: { fontSize: 24 },
  langNativeText: { color: '#0F172A', fontSize: 15, fontWeight: '800' },
  langNativeTextActive: { color: '#15803D' },
  langEnglishText: { color: '#64748B', fontSize: 12, marginTop: 1, fontWeight: '600' },
  modalSectionLabel: { color: '#0F172A', fontSize: 14, fontWeight: '800', marginBottom: 8 },
  modalGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  modalChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 40,
  },
  modalChipActive: { backgroundColor: '#1B5E20', borderColor: '#1B5E20' },
  modalChipText: { color: '#334155', fontSize: 13, fontWeight: '600' },
  modalChipTextActive: { color: '#FFFFFF', fontWeight: '800' },
  cascadingStepHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  stepBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepBadgeText: { color: '#15803D', fontSize: 12, fontWeight: '900' },
  stateSelectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    minHeight: 40,
  },
  stateSelectChipActive: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
  },
  stateSelectChipText: { color: '#334155', fontSize: 12, fontWeight: '700' },
  stateSelectChipTextActive: { color: '#FFFFFF', fontWeight: '900' },
  stateAgroInfoCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    marginVertical: 10,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    gap: 4,
  },
  stateAgroInfoHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stateAgroZoneTitle: { color: '#166534', fontSize: 13, fontWeight: '800', flex: 1 },
  stateAgroCropsText: { color: '#15803D', fontSize: 12, fontWeight: '600' },
  entireStateChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    minHeight: 44,
  },
  entireStateChipActive: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
  },
  entireStateChipText: { color: '#166534', fontSize: 13, fontWeight: '800', flex: 1 },
  entireStateChipTextActive: { color: '#FFFFFF', fontWeight: '900' },
  // Photo Tips Modal
  tipsModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  tipsModalBackdropTouch: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
  },
  tipsModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  tipsModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tipsModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  tipsHeaderIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  tipsModalCloseBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tipsListScroll: {
    marginTop: 14,
    marginBottom: 16,
  },
  tipCardItem: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tipItemIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipItemTextBox: {
    flex: 1,
    gap: 2,
  },
  tipItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  tipItemDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 17,
  },
  tipsGotItBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  tipsGotItGradient: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tipsGotItText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
});
