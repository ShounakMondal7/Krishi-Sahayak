/**
 * OnboardingFlow — Strict 2-Step Farmer Onboarding Sequence.
 *
 * Sequence:
 * - Step 1: Full-Screen Language Selection. Tapping ANY language immediately routes to Step 2.
 * - Step 2: Login / Credentials Screen (10-digit Mobile + OTP, Demo Profiles, Continue as Guest).
 *           Includes a prominent "← Back" button to return to Language Selection.
 * - Step 3: Submitting login / guest directly completes onboarding and routes to Main Dashboard.
 *
 * Sunlight-Readable Theme: Pure white (#FFFFFF) background, dark slate text (#111827), primary forest green (#1B5E20).
 * Scaled-Up Touch Targets: Minimum heights 56px, generous touch padding, clear typography.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { safeHaptics } from '../services/haptics';

import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  getTranslation,
} from '../services/i18n';
import {
  ALL_INDIAN_STATES,
  getDistrictsForState,
  getStateDetails,
  detectLocationGPS,
} from '../services/locations';
import { storageService, FarmerProfile } from '../services/storage';

interface OnboardingFlowProps {
  initialLang?: LanguageCode;
  initialState?: string;
  initialDistrict?: string;
  onComplete: (profile: FarmerProfile, state: string, district: string, language: LanguageCode) => void;
}

const DEMO_PROFILES: FarmerProfile[] = [
  {
    farmerId: 'KISAN-PB-9421',
    name: 'Harpreet Singh',
    phone: '9876501234',
    state: 'Punjab',
    district: 'Ludhiana',
    primaryCrops: ['Wheat', 'Paddy', 'Mustard'],
    language: 'pa',
    loginTimestamp: new Date().toISOString(),
  },
  {
    farmerId: 'KISAN-KL-7721',
    name: 'Suresh Nair',
    phone: '9847123456',
    state: 'Kerala',
    district: 'Thrissur',
    primaryCrops: ['Paddy', 'Coconut', 'Black Pepper'],
    language: 'ml',
    loginTimestamp: new Date().toISOString(),
  },
  {
    farmerId: 'KISAN-MH-5532',
    name: 'Tukaram Shinde',
    phone: '9822334455',
    state: 'Maharashtra',
    district: 'Pune',
    primaryCrops: ['Cotton', 'Sugarcane', 'Soybean'],
    language: 'mr',
    loginTimestamp: new Date().toISOString(),
  },
  {
    farmerId: 'KISAN-WB-3312',
    name: 'Subhash Ghosh',
    phone: '9830112233',
    state: 'West Bengal',
    district: 'Purba Bardhaman',
    primaryCrops: ['Paddy', 'Jute', 'Potato'],
    language: 'bn',
    loginTimestamp: new Date().toISOString(),
  },
  {
    farmerId: 'KISAN-GJ-8841',
    name: 'Bharat Patel',
    phone: '9825667788',
    state: 'Gujarat',
    district: 'Rajkot',
    primaryCrops: ['Groundnut', 'Cotton', 'Cumin'],
    language: 'gu',
    loginTimestamp: new Date().toISOString(),
  },
];

export default function OnboardingFlow({
  initialLang = 'en',
  initialState = 'Punjab',
  initialDistrict = 'Ludhiana',
  onComplete,
}: OnboardingFlowProps) {
  // Strict 2-step onboarding: 1 = Language Selection, 2 = Login / Credentials
  const [step, setStep] = useState<1 | 2>(1);
  const [selectedLang, setSelectedLang] = useState<LanguageCode>(initialLang);

  // Step 2 Login State
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpCode, setOtpCode] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpNotice, setOtpNotice] = useState<string | null>(null);
  const [farmerName, setFarmerName] = useState('');
  const [kisanId, setKisanId] = useState('');

  // Location State
  const [selectedState, setSelectedState] = useState(initialState);
  const [selectedDistrict, setSelectedDistrict] = useState(initialDistrict);
  const [statePickerVisible, setStatePickerVisible] = useState(false);
  const [districtPickerVisible, setDistrictPickerVisible] = useState(false);
  const [isDetectingGps, setIsDetectingGps] = useState(false);
  const [gpsNotice, setGpsNotice] = useState<string | null>(null);
  const [showLocationSettings, setShowLocationSettings] = useState(false);

  const t = (key: string) => getTranslation(selectedLang, key);

  // ── Step 1: Language Switch — Tapping immediately advances to Step 2 ──
  const handleSelectLanguage = (code: LanguageCode) => {
    safeHaptics.impactMedium();
    setSelectedLang(code);
    storageService.setLanguage(code);
    // Immediate auto-advance to Login screen
    setStep(2);
  };

  const handleNextFromLanguage = () => {
    safeHaptics.impactLight();
    setStep(2);
  };

  // ── Step 2: Login Handlers ───────────────────────────────────────────────
  const handleSendOtp = () => {
    safeHaptics.impactLight();
    const cleanNumber = mobileNumber.replace(/\D/g, '');
    if (cleanNumber.length < 10) {
      alert('Please enter a valid 10-digit mobile number.');
      return;
    }
    setOtpSent(true);
    setOtpNotice('OTP sent via SMS. Enter 1234 for instant verification.');
  };

  const handleUseTestOtp = () => {
    safeHaptics.impactLight();
    setOtpCode('1234');
    setOtpVerified(true);
    setOtpNotice('✅ OTP 1234 verified successfully!');
  };

  const handleVerifyOtp = () => {
    safeHaptics.impactMedium();
    if (otpCode.trim() === '1234' || otpCode.trim().length >= 4) {
      setOtpVerified(true);
      setOtpNotice('✅ OTP verified successfully!');
    } else {
      alert('Please enter OTP code 1234.');
    }
  };

  // 1-Tap Demo profile selection -> Immediately routes to Dashboard
  const handlePickDemoProfile = async (profile: FarmerProfile) => {
    safeHaptics.notificationSuccess();
    const fullProfile: FarmerProfile = {
      ...profile,
      language: selectedLang,
      loginTimestamp: new Date().toISOString(),
    };
    await storageService.setFarmerProfile(fullProfile);
    await storageService.setLanguage(selectedLang);
    await storageService.setOnboardingComplete();
    onComplete(fullProfile, fullProfile.state, fullProfile.district, selectedLang);
  };

  // Continue as Guest -> Immediately routes to Dashboard
  const handleSkipLogin = async () => {
    safeHaptics.impactMedium();
    const guestProfile: FarmerProfile = {
      farmerId: `KISAN-IN-${Math.floor(1000 + Math.random() * 9000)}`,
      name: 'Guest Farmer',
      phone: '9876543210',
      state: selectedState || 'Punjab',
      district: selectedDistrict || 'Ludhiana',
      primaryCrops: ['Wheat', 'Paddy'],
      language: selectedLang,
      loginTimestamp: new Date().toISOString(),
    };
    await storageService.setFarmerProfile(guestProfile);
    await storageService.setLanguage(selectedLang);
    await storageService.setOnboardingComplete();
    onComplete(guestProfile, guestProfile.state, guestProfile.district, selectedLang);
  };

  // Complete onboarding from form -> Immediately routes to Dashboard
  const handleFinishOnboarding = async () => {
    safeHaptics.notificationSuccess();
    const finalId = kisanId.trim() || `KISAN-IN-${Math.floor(1000 + Math.random() * 9000)}`;
    const finalName = farmerName.trim() || (mobileNumber ? `Farmer ${mobileNumber.slice(-4)}` : 'Kisan Bandhu');
    const finalPhone = mobileNumber.replace(/\D/g, '').slice(-10) || '9876543210';
    const stateDetails = getStateDetails(selectedState);

    const profile: FarmerProfile = {
      farmerId: finalId,
      name: finalName,
      phone: finalPhone,
      state: selectedState,
      district: selectedDistrict,
      primaryCrops: stateDetails?.primaryCrops.slice(0, 3) || ['Paddy', 'Wheat'],
      language: selectedLang,
      loginTimestamp: new Date().toISOString(),
    };

    await storageService.setFarmerProfile(profile);
    await storageService.setLanguage(selectedLang);
    await storageService.setOnboardingComplete();

    onComplete(profile, selectedState, selectedDistrict, selectedLang);
  };

  // GPS Auto-detect handler
  const handleAutoDetectGps = async () => {
    safeHaptics.impactMedium();
    setIsDetectingGps(true);
    setGpsNotice('Locating your farm coordinates…');

    try {
      const loc = await detectLocationGPS();
      setSelectedState(loc.state);
      setSelectedDistrict(loc.district);
      safeHaptics.notificationSuccess();
      setGpsNotice(`✅ GPS Pinpointed: ${loc.district}, ${loc.state}`);
    } catch {
      setGpsNotice('Could not pinpoint GPS. Default location retained.');
    } finally {
      setIsDetectingGps(false);
    }
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── TOP 2-STEP PROGRESS BAR ── */}
        <View style={styles.progressContainer}>
          <View style={styles.stepProgressRow}>
            {/* Step 1 Circle */}
            <TouchableOpacity
              style={[styles.stepCircle, step >= 1 && styles.stepCircleActive]}
              onPress={() => setStep(1)}
              activeOpacity={0.8}
            >
              <Text style={[styles.stepCircleText, step >= 1 && styles.stepCircleTextActive]}>1</Text>
            </TouchableOpacity>

            <View style={[styles.stepLine, step >= 2 && styles.stepLineActive]} />

            {/* Step 2 Circle */}
            <View style={[styles.stepCircle, step >= 2 && styles.stepCircleActive]}>
              <Text style={[styles.stepCircleText, step >= 2 && styles.stepCircleTextActive]}>2</Text>
            </View>
          </View>

          <View style={styles.stepLabelsRow}>
            <Text style={[styles.stepLabelText, step === 1 && styles.stepLabelTextActive]}>
              {t('onboardingStep1') || 'Language'}
            </Text>
            <Text style={[styles.stepLabelText, step === 2 && styles.stepLabelTextActive]}>
              {t('onboardingStep2') || 'Sign In / Kisan ID'}
            </Text>
          </View>
        </View>

        {/* ── STEP 1: FULL-SCREEN LANGUAGE SELECTION ── */}
        {step === 1 && (
          <View style={styles.stepContent}>
            <View style={styles.headerBlock}>
              <View style={styles.headerBadge}>
                <MaterialCommunityIcons name="translate" size={24} color="#1B5E20" />
              </View>
              <Text style={styles.mainTitle}>{t('chooseLanguageTitle') || 'Choose Your Language'}</Text>
              <Text style={styles.mainSubtitle}>
                Tap your language to proceed. Spoken voice advice and ICAR guides will adapt automatically.
              </Text>
            </View>

            <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
              <View style={styles.languageStack}>
                {SUPPORTED_LANGUAGES.map((item) => {
                  const isSelected = selectedLang === item.code;
                  return (
                    <TouchableOpacity
                      key={item.code}
                      style={[styles.langCard, isSelected && styles.langCardActive]}
                      onPress={() => handleSelectLanguage(item.code)}
                      activeOpacity={0.85}
                    >
                      <View style={styles.langFlagCircle}>
                        <Text style={styles.langFlagEmoji}>{item.flag}</Text>
                      </View>

                      <View style={styles.langInfo}>
                        <Text style={[styles.langNativeText, isSelected && styles.langNativeTextActive]}>
                          {item.nativeLabel}
                        </Text>
                        <Text style={styles.langEnglishText}>
                          {item.label} • {item.regionHint}
                        </Text>
                      </View>

                      <View style={[styles.radioCircle, isSelected && styles.radioCircleActive]}>
                        {isSelected && <View style={styles.radioInnerDot} />}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </ScrollView>

            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleNextFromLanguage}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#1B5E20', '#2E7D32']}
                  style={styles.primaryGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <Text style={styles.primaryButtonText}>
                    Continue to Sign In ➔
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── STEP 2: LOGIN / CREDENTIALS (WITH PERSISTENT BACK BUTTON) ── */}
        {step === 2 && (
          <View style={styles.stepContent}>
            {/* 🔙 Universal Back Button to Step 1 */}
            <View style={styles.stepNavRow}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  safeHaptics.impactLight();
                  setStep(1);
                }}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#15803D" />
                <Text style={styles.backButtonText}>← {t('onboardingStep1') || 'Language'}</Text>
              </TouchableOpacity>

              <View style={styles.activeLangBadge}>
                <Text style={styles.activeLangBadgeText}>
                  {SUPPORTED_LANGUAGES.find((l) => l.code === selectedLang)?.nativeLabel} ({selectedLang.toUpperCase()})
                </Text>
              </View>
            </View>

            <View style={styles.headerBlock}>
              <View style={styles.headerBadge}>
                <MaterialCommunityIcons name="cellphone-check" size={24} color="#1B5E20" />
              </View>
              <Text style={styles.mainTitle}>{t('loginTitle') || 'Farmer Login & Kisan ID'}</Text>
              <Text style={styles.mainSubtitle}>
                Enter your 10-digit mobile number or select a demo profile to start receiving ICAR advisories.
              </Text>
            </View>

            <ScrollView style={styles.scrollList} showsVerticalScrollIndicator={false}>
              {/* Primary Focus: 10-Digit Mobile Input */}
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>{t('mobileNumberLabel') || '10-Digit Mobile Number:'}</Text>
                <View style={styles.phoneInputRow}>
                  <View style={styles.countryCodeBadge}>
                    <Text style={styles.countryCodeText}>🇮🇳 +91</Text>
                  </View>
                  <TextInput
                    style={styles.phoneInput}
                    value={mobileNumber}
                    onChangeText={setMobileNumber}
                    placeholder="98765 43210"
                    placeholderTextColor="#94A3B8"
                    keyboardType="phone-pad"
                    maxLength={10}
                  />
                  {!otpSent ? (
                    <TouchableOpacity
                      style={[styles.sendOtpBtn, mobileNumber.length < 10 && styles.sendOtpBtnDisabled]}
                      onPress={handleSendOtp}
                      disabled={mobileNumber.length < 10}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.sendOtpText}>{t('getOtpBtn') || 'Send OTP'}</Text>
                    </TouchableOpacity>
                  ) : (
                    <View style={styles.verifiedBadge}>
                      <MaterialCommunityIcons name="check-circle" size={20} color="#16A34A" />
                    </View>
                  )}
                </View>
              </View>

              {/* OTP Verification Box */}
              {otpSent && (
                <View style={styles.otpCard}>
                  <Text style={styles.fieldLabel}>{t('enterOtpLabel') || 'Enter 4-Digit Verification Code:'}</Text>
                  <View style={styles.otpInputRow}>
                    <TextInput
                      style={styles.otpInput}
                      value={otpCode}
                      onChangeText={setOtpCode}
                      placeholder="• • • •"
                      placeholderTextColor="#94A3B8"
                      keyboardType="number-pad"
                      maxLength={4}
                    />
                    <TouchableOpacity
                      style={styles.verifyOtpBtn}
                      onPress={handleVerifyOtp}
                      activeOpacity={0.8}
                    >
                      <Text style={styles.verifyOtpText}>{t('verifyOtpBtn') || 'Verify'}</Text>
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    style={styles.testOtpHintBtn}
                    onPress={handleUseTestOtp}
                    activeOpacity={0.8}
                  >
                    <Text style={styles.testOtpHintText}>
                      👉 {t('testOtpNotice') || 'Quick Test Code: Auto-fill 1234'}
                    </Text>
                  </TouchableOpacity>

                  {otpNotice && (
                    <Text style={[styles.otpNoticeText, otpVerified && styles.otpNoticeSuccess]}>
                      {otpNotice}
                    </Text>
                  )}
                </View>
              )}

              {/* Optional Name & Kisan ID */}
              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>{t('farmerNameLabel') || 'Farmer Name (Optional):'}</Text>
                <TextInput
                  style={styles.standardInput}
                  value={farmerName}
                  onChangeText={setFarmerName}
                  placeholder={t('farmerNamePlaceholder') || 'e.g. Ramesh Kumar'}
                  placeholderTextColor="#94A3B8"
                />
              </View>

              <View style={styles.fieldBox}>
                <Text style={styles.fieldLabel}>Kisan ID (Optional / Auto-Generated):</Text>
                <TextInput
                  style={styles.standardInput}
                  value={kisanId}
                  onChangeText={setKisanId}
                  placeholder="e.g. KISAN-IN-8421"
                  placeholderTextColor="#94A3B8"
                />
              </View>

              {/* Optional Location & Farm Details Accordion */}
              <TouchableOpacity
                style={styles.locationAccordionHeader}
                onPress={() => setShowLocationSettings(!showLocationSettings)}
                activeOpacity={0.8}
              >
                <View style={styles.locationAccordionLeft}>
                  <MaterialCommunityIcons name="map-marker-radius" size={20} color="#15803D" />
                  <Text style={styles.locationAccordionTitle}>
                    📍 Farm Location: {selectedDistrict}, {selectedState}
                  </Text>
                </View>
                <MaterialCommunityIcons
                  name={showLocationSettings ? 'chevron-up' : 'chevron-down'}
                  size={20}
                  color="#64748B"
                />
              </TouchableOpacity>

              {showLocationSettings && (
                <View style={styles.locationAccordionBody}>
                  {/* GPS Detect Button */}
                  <TouchableOpacity
                    style={styles.gpsSmallBtn}
                    onPress={handleAutoDetectGps}
                    disabled={isDetectingGps}
                    activeOpacity={0.8}
                  >
                    {isDetectingGps ? (
                      <ActivityIndicator size="small" color="#15803D" />
                    ) : (
                      <MaterialCommunityIcons name="crosshairs-gps" size={18} color="#15803D" />
                    )}
                    <Text style={styles.gpsSmallBtnText}>
                      {isDetectingGps ? 'Pinpointing GPS…' : 'Auto-Detect Farm GPS'}
                    </Text>
                  </TouchableOpacity>

                  {gpsNotice && (
                    <Text style={styles.gpsNoticeText}>{gpsNotice}</Text>
                  )}

                  {/* State & District Selectors */}
                  <View style={styles.stateSelectRow}>
                    <TouchableOpacity
                      style={styles.statePickerBtn}
                      onPress={() => setStatePickerVisible(true)}
                    >
                      <Text style={styles.statePickerBtnLabel}>State</Text>
                      <Text style={styles.statePickerBtnVal} numberOfLines={1}>{selectedState}</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.statePickerBtn}
                      onPress={() => setDistrictPickerVisible(true)}
                    >
                      <Text style={styles.statePickerBtnLabel}>District</Text>
                      <Text style={styles.statePickerBtnVal} numberOfLines={1}>{selectedDistrict}</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* 1-Tap Quick Demo Profiles -> Instantly logs in and routes to Dashboard */}
              <View style={styles.demoSection}>
                <Text style={styles.demoHeading}>{t('quickDemoTitle') || '🌾 Instant 1-Tap Demo Profiles:'}</Text>
                {DEMO_PROFILES.map((p) => (
                  <TouchableOpacity
                    key={p.farmerId}
                    style={styles.demoCard}
                    onPress={() => handlePickDemoProfile(p)}
                    activeOpacity={0.8}
                  >
                    <View style={styles.demoAvatarCircle}>
                      <MaterialCommunityIcons name="account" size={22} color="#1B5E20" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.demoName}>{p.name} ({p.state})</Text>
                      <Text style={styles.demoCrops}>
                        ID: {p.farmerId} • Crops: {p.primaryCrops.join(', ')}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="arrow-right-circle" size={22} color="#2E7D32" />
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            {/* Bottom Actions: Enter Dashboard & Guest Link */}
            <View style={styles.bottomBar}>
              <TouchableOpacity
                style={styles.primaryActionButton}
                onPress={handleFinishOnboarding}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#1B5E20', '#2E7D32']}
                  style={styles.primaryGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                >
                  <MaterialCommunityIcons name="view-dashboard-outline" size={22} color="#FFF" style={{ marginRight: 8 }} />
                  <Text style={styles.primaryButtonText}>
                    Enter Kisan Dashboard ➔
                  </Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.skipLinkBtn}
                onPress={handleSkipLogin}
                activeOpacity={0.75}
              >
                <Text style={styles.skipLinkText}>
                  {t('skipSignIn') || 'Continue as Guest'} →
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* ── STATE PICKER MODAL ── */}
        <Modal
          visible={statePickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setStatePickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalCard}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>🌾 Select State / UT</Text>
                <TouchableOpacity onPress={() => setStatePickerVisible(false)}>
                  <MaterialCommunityIcons name="close" size={24} color="#334155" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {ALL_INDIAN_STATES.map((st) => {
                  const isSelected = selectedState === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[styles.pickerItemRow, isSelected && styles.pickerItemRowActive]}
                      onPress={() => {
                        safeHaptics.impactLight();
                        setSelectedState(st);
                        const dists = getDistrictsForState(st);
                        setSelectedDistrict(dists[0] || st);
                        setStatePickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                        {st}
                      </Text>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={20} color="#1B5E20" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ── DISTRICT PICKER MODAL ── */}
        <Modal
          visible={districtPickerVisible}
          transparent
          animationType="fade"
          onRequestClose={() => setDistrictPickerVisible(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.pickerModalCard}>
              <View style={styles.pickerModalHeader}>
                <Text style={styles.pickerModalTitle}>📍 Select District ({selectedState})</Text>
                <TouchableOpacity onPress={() => setDistrictPickerVisible(false)}>
                  <MaterialCommunityIcons name="close" size={24} color="#334155" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                <TouchableOpacity
                  style={[
                    styles.pickerItemRow,
                    selectedDistrict === selectedState && styles.pickerItemRowActive,
                  ]}
                  onPress={() => {
                    safeHaptics.impactLight();
                    setSelectedDistrict(selectedState);
                    setDistrictPickerVisible(false);
                  }}
                >
                  <Text style={[styles.pickerItemText, selectedDistrict === selectedState && styles.pickerItemTextActive]}>
                    🌾 Entire State of {selectedState} (All Districts)
                  </Text>
                  {selectedDistrict === selectedState && (
                    <MaterialCommunityIcons name="check-circle" size={20} color="#1B5E20" />
                  )}
                </TouchableOpacity>

                {getDistrictsForState(selectedState).map((dist) => {
                  const isSelected = selectedDistrict === dist;
                  return (
                    <TouchableOpacity
                      key={dist}
                      style={[styles.pickerItemRow, isSelected && styles.pickerItemRowActive]}
                      onPress={() => {
                        safeHaptics.impactLight();
                        setSelectedDistrict(dist);
                        setDistrictPickerVisible(false);
                      }}
                      activeOpacity={0.7}
                    >
                      <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                        {dist}
                      </Text>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={20} color="#1B5E20" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
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
    backgroundColor: '#FFFFFF',
  },
  progressContainer: {
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  stepProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepCircleActive: {
    backgroundColor: '#1B5E20',
    borderColor: '#1B5E20',
  },
  stepCircleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#64748B',
  },
  stepCircleTextActive: {
    color: '#FFFFFF',
  },
  stepLine: {
    flex: 1,
    height: 3,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 12,
  },
  stepLineActive: {
    backgroundColor: '#1B5E20',
  },
  stepLabelsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 6,
    paddingHorizontal: 10,
  },
  stepLabelText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  stepLabelTextActive: {
    color: '#1B5E20',
    fontWeight: '800',
  },
  stepContent: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  stepNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 20,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  backButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  activeLangBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  activeLangBadgeText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  headerBlock: {
    marginBottom: 14,
  },
  headerBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  mainTitle: {
    fontSize: 22,
    fontWeight: '900',
    color: '#111827',
    marginBottom: 4,
  },
  mainSubtitle: {
    fontSize: 13,
    color: '#4B5563',
    lineHeight: 18,
  },
  scrollList: {
    flex: 1,
  },
  languageStack: {
    gap: 10,
    paddingBottom: 24,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    minHeight: 68,
  },
  langCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#16A34A',
    borderWidth: 2,
  },
  langFlagCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAF8',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  langFlagEmoji: {
    fontSize: 22,
  },
  langInfo: {
    flex: 1,
  },
  langNativeText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#111827',
  },
  langNativeTextActive: {
    color: '#166534',
  },
  langEnglishText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  radioCircle: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  radioCircleActive: {
    borderColor: '#16A34A',
  },
  radioInnerDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: '#16A34A',
  },
  fieldBox: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
    height: 54,
  },
  countryCodeBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    height: '100%',
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  countryCodeText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1E293B',
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
  },
  sendOtpBtn: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 16,
    height: '100%',
    justifyContent: 'center',
  },
  sendOtpBtnDisabled: {
    backgroundColor: '#94A3B8',
  },
  sendOtpText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  verifiedBadge: {
    paddingRight: 14,
  },
  otpCard: {
    backgroundColor: '#F8FAF8',
    borderRadius: 14,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  otpInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  otpInput: {
    flex: 1,
    height: 50,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    fontSize: 22,
    fontWeight: '800',
    color: '#111827',
    textAlign: 'center',
    letterSpacing: 8,
  },
  verifyOtpBtn: {
    backgroundColor: '#1B5E20',
    paddingHorizontal: 18,
    height: 50,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyOtpText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  testOtpHintBtn: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  testOtpHintText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
  },
  otpNoticeText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 6,
  },
  otpNoticeSuccess: {
    color: '#166534',
    fontWeight: '700',
  },
  standardInput: {
    height: 52,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    fontSize: 16,
    color: '#111827',
    fontWeight: '600',
  },
  locationAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  locationAccordionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  locationAccordionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  locationAccordionBody: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 14,
    gap: 8,
  },
  gpsSmallBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 8,
  },
  gpsSmallBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#15803D',
  },
  gpsNoticeText: {
    fontSize: 12,
    color: '#065F46',
    fontWeight: '600',
  },
  stateSelectRow: {
    flexDirection: 'row',
    gap: 8,
  },
  statePickerBtn: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  statePickerBtnLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  statePickerBtnVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  demoSection: {
    marginTop: 6,
    marginBottom: 16,
    gap: 8,
  },
  demoHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
    marginBottom: 2,
  },
  demoCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 12,
  },
  demoAvatarCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  demoName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  demoCrops: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  bottomBar: {
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  primaryActionButton: {
    borderRadius: 14,
    overflow: 'hidden',
    height: 54,
  },
  primaryGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  skipLinkBtn: {
    alignItems: 'center',
    paddingVertical: 8,
    marginTop: 4,
  },
  skipLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1B5E20',
    textDecorationLine: 'underline',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    width: '100%',
    maxHeight: '80%',
    padding: 18,
    elevation: 8,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 8,
  },
  pickerModalTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  pickerItemRowActive: {
    backgroundColor: '#F0FDF4',
  },
  pickerItemText: {
    fontSize: 15,
    color: '#334155',
    fontWeight: '600',
  },
  pickerItemTextActive: {
    color: '#166534',
    fontWeight: '800',
  },
});
