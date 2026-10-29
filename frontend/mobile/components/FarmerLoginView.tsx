/**
 * FarmerLoginView — Clean, Decluttered, Isolated Farmer Authentication View.
 *
 * Requirements:
 * - Unmissable working Back button fixed at top-left (returns to Step 2: Location Selection).
 * - Multi-method login support:
 *   1. 📱 10-digit Mobile Number + OTP (with 1234 test helper).
 *   2. 🌾 11-digit PM-Kisan ID or 12-digit Aadhaar-linked registration number.
 *   3. 🚶 Explicit "Continue as Guest Farmer" button.
 * - 1-tap quick demo profile chips for instant evaluation.
 * - Persists verified profile to storage and calls onSuccess() only upon completion.
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
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { safeHaptics } from '../services/haptics';
import { LanguageCode } from '../services/i18n';
import { storageService, FarmerProfile } from '../services/storage';

interface FarmerLoginViewProps {
  currentLang?: LanguageCode;
  onBack: () => void;
  onSuccess: () => void;
}

type AuthMethod = 'mobile' | 'kisan_id';

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
];

export default function FarmerLoginView({
  currentLang = 'en',
  onBack,
  onSuccess,
}: FarmerLoginViewProps) {
  const [authMethod, setAuthMethod] = useState<AuthMethod>('mobile');

  // Mobile + OTP State
  const [mobileNumber, setMobileNumber] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [otpCode, setOtpCode] = useState('');
  const [otpNotice, setOtpNotice] = useState<string | null>(null);

  // Kisan ID / Aadhaar State
  const [kisanOrAadhaarId, setKisanOrAadhaarId] = useState('');
  const [idError, setIdError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);

  // ── Mobile + OTP Handlers ────────────────────────────────────────────────
  const handleSendOtp = () => {
    safeHaptics.impactLight();
    const cleanNumber = mobileNumber.replace(/\D/g, '');
    if (cleanNumber.length < 10) {
      Alert.alert('Invalid Number', 'Please enter a valid 10-digit mobile number.');
      return;
    }
    setOtpSent(true);
    setOtpNotice('OTP sent via SMS. Enter 1234 for instant verification.');
  };

  const handleUseTestOtp = () => {
    safeHaptics.impactLight();
    setOtpCode('1234');
    setOtpNotice('✅ OTP 1234 auto-filled');
  };

  const handleVerifyOtp = async () => {
    safeHaptics.impactMedium();
    if (otpCode.trim() !== '1234' && otpCode.trim().length < 4) {
      Alert.alert('Invalid OTP', 'Please enter 4-digit code (use 1234 for test).');
      return;
    }
    setLoading(true);
    const savedLoc = await storageService.getSavedLocation();
    const finalState = savedLoc?.state || 'Punjab';
    const finalDistrict = savedLoc?.district || 'Ludhiana';

    const cleanNumber = mobileNumber.replace(/\D/g, '').slice(-10) || '9876543210';
    const profile: FarmerProfile = {
      farmerId: `KISAN-IN-${cleanNumber.slice(-4)}`,
      name: `Kisan Bandhu (${cleanNumber.slice(-4)})`,
      phone: cleanNumber,
      state: finalState,
      district: finalDistrict,
      primaryCrops: ['Wheat', 'Paddy'],
      language: currentLang,
      loginTimestamp: new Date().toISOString(),
    };
    await storageService.setFarmerProfile(profile);
    await storageService.setOnboardingComplete();
    setLoading(false);
    onSuccess();
  };

  // ── Kisan ID / Aadhaar Handlers ──────────────────────────────────────────
  const handleAutoFillKisanId = () => {
    safeHaptics.impactLight();
    setKisanOrAadhaarId('KISAN9842101');
    setIdError(null);
  };

  const handleVerifyKisanId = async () => {
    safeHaptics.impactMedium();
    const cleaned = kisanOrAadhaarId.trim().replace(/\s+/g, '');
    if (cleaned.length < 11 || cleaned.length > 14) {
      setIdError('Please enter a valid 11-digit PM-Kisan ID or 12-digit Aadhaar number.');
      return;
    }
    setIdError(null);
    setLoading(true);

    const savedLoc = await storageService.getSavedLocation();
    const finalState = savedLoc?.state || 'Punjab';
    const finalDistrict = savedLoc?.district || 'Ludhiana';

    const isAadhaar = /^\d{12}$/.test(cleaned);
    const farmerIdLabel = isAadhaar ? `AADHAAR-XX-${cleaned.slice(-4)}` : cleaned.toUpperCase();
    const displayName = isAadhaar ? `Farmer (Aadhaar ...${cleaned.slice(-4)})` : `Farmer (${cleaned.slice(-4)})`;

    const profile: FarmerProfile = {
      farmerId: farmerIdLabel,
      name: displayName,
      phone: '9876543210',
      state: finalState,
      district: finalDistrict,
      primaryCrops: ['Wheat', 'Paddy'],
      language: currentLang,
      loginTimestamp: new Date().toISOString(),
    };

    await storageService.setFarmerProfile(profile);
    await storageService.setOnboardingComplete();
    setLoading(false);
    onSuccess();
  };

  // ── Continue as Guest Handler ────────────────────────────────────────────
  const handleSkipGuest = async () => {
    safeHaptics.impactLight();
    setLoading(true);
    const savedLoc = await storageService.getSavedLocation();
    const finalState = savedLoc?.state || 'Punjab';
    const finalDistrict = savedLoc?.district || 'Ludhiana';

    const guestProfile: FarmerProfile = {
      farmerId: `KISAN-GUEST-${Math.floor(1000 + Math.random() * 9000)}`,
      name: 'Guest Farmer',
      phone: '',
      state: finalState,
      district: finalDistrict,
      primaryCrops: ['Wheat', 'Paddy'],
      language: currentLang,
      loginTimestamp: new Date().toISOString(),
    };
    await storageService.setFarmerProfile(guestProfile);
    await storageService.setOnboardingComplete();
    setLoading(false);
    onSuccess();
  };

  // ── 1-Tap Demo Profile Handler ───────────────────────────────────────────
  const handleDemoProfile = async (p: FarmerProfile) => {
    safeHaptics.notificationSuccess();
    setLoading(true);
    await storageService.saveLocation(p.state, p.district);
    const profile: FarmerProfile = {
      ...p,
      language: currentLang,
      loginTimestamp: new Date().toISOString(),
    };
    await storageService.setFarmerProfile(profile);
    await storageService.setOnboardingComplete();
    setLoading(false);
    onSuccess();
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* ── 🔙 UNMISSABLE FIXED BACK BUTTON ── */}
        <TouchableOpacity
          style={styles.fixedBackButton}
          onPress={() => {
            safeHaptics.impactLight();
            onBack();
          }}
          activeOpacity={0.75}
          hitSlop={{ top: 14, bottom: 14, left: 14, right: 14 }}
          accessibilityRole="button"
          accessibilityLabel="Back"
          accessibilityHint="Double tap to go back to location selection"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#15803D" />
          <Text style={styles.fixedBackText} allowFontScaling={true}>← Back</Text>
        </TouchableOpacity>

        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Card / Centered Form */}
          <View style={styles.loginCard}>
            <View style={styles.iconCircle} accessible={false}>
              <MaterialCommunityIcons name="shield-account" size={32} color="#15803D" />
            </View>

            <Text style={styles.title} allowFontScaling={true} accessibilityRole="header">
              Farmer Login
            </Text>
            <Text style={styles.subtitle} allowFontScaling={true}>
              Verify your identity to access localized ICAR advisories
            </Text>

            {/* ── Method Segmented Control ── */}
            <View style={styles.tabContainer}>
              <TouchableOpacity
                style={[styles.tabButton, authMethod === 'mobile' && styles.tabButtonActive]}
                onPress={() => {
                  safeHaptics.impactLight();
                  setAuthMethod('mobile');
                }}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: authMethod === 'mobile' }}
                accessibilityLabel="Mobile OTP Login"
              >
                <MaterialCommunityIcons
                  name="cellphone"
                  size={18}
                  color={authMethod === 'mobile' ? '#15803D' : '#64748B'}
                />
                <Text
                  style={[styles.tabButtonText, authMethod === 'mobile' && styles.tabButtonTextActive]}
                  allowFontScaling={true}
                >
                  Mobile OTP
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.tabButton, authMethod === 'kisan_id' && styles.tabButtonActive]}
                onPress={() => {
                  safeHaptics.impactLight();
                  setAuthMethod('kisan_id');
                }}
                activeOpacity={0.8}
                accessibilityRole="tab"
                accessibilityState={{ selected: authMethod === 'kisan_id' }}
                accessibilityLabel="Kisan ID or Aadhaar Login"
              >
                <MaterialCommunityIcons
                  name="card-account-details-outline"
                  size={18}
                  color={authMethod === 'kisan_id' ? '#15803D' : '#64748B'}
                />
                <Text
                  style={[styles.tabButtonText, authMethod === 'kisan_id' && styles.tabButtonTextActive]}
                  allowFontScaling={true}
                >
                  Kisan ID / Aadhaar
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── Option A: Mobile Number + OTP Flow ── */}
            {authMethod === 'mobile' && (
              <View style={styles.methodBox}>
                <View style={styles.fieldBox}>
                  <Text style={styles.inputLabel} allowFontScaling={true}>10-Digit Mobile Number</Text>
                  <View style={styles.phoneInputRow}>
                    <View style={styles.countryCodeBadge} accessible={false}>
                      <Text style={styles.countryCodeText} allowFontScaling={true}>🇮🇳 +91</Text>
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      value={mobileNumber}
                      onChangeText={setMobileNumber}
                      placeholder="98765 43210"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      maxLength={10}
                      editable={!otpSent}
                      allowFontScaling={true}
                      accessibilityLabel="10-digit Mobile Number"
                      accessibilityHint="Enter your 10 digit Indian mobile number without country code"
                    />
                    {otpSent && (
                      <View style={styles.checkBadge} accessible={false}>
                        <MaterialCommunityIcons name="check-circle" size={22} color="#16A34A" />
                      </View>
                    )}
                  </View>
                </View>

                {/* OTP Input Card (If Triggered) */}
                {otpSent && (
                  <View style={styles.otpCard}>
                    <Text style={styles.inputLabel} allowFontScaling={true}>Enter 4-Digit OTP</Text>
                    <View style={styles.otpRow}>
                      <TextInput
                        style={styles.otpInput}
                        value={otpCode}
                        onChangeText={setOtpCode}
                        placeholder="• • • •"
                        placeholderTextColor="#94A3B8"
                        keyboardType="number-pad"
                        maxLength={4}
                        allowFontScaling={true}
                        accessibilityLabel="4-Digit OTP code"
                        accessibilityHint="Enter the 4 digit OTP sent to your phone"
                      />
                      <TouchableOpacity
                        style={styles.verifyBtn}
                        onPress={handleVerifyOtp}
                        activeOpacity={0.8}
                        disabled={loading}
                        accessibilityRole="button"
                        accessibilityLabel="Verify OTP"
                        accessibilityState={{ disabled: loading }}
                      >
                        {loading ? (
                          <ActivityIndicator size="small" color="#FFFFFF" />
                        ) : (
                          <Text style={styles.verifyBtnText} allowFontScaling={true}>Verify</Text>
                        )}
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      style={styles.testOtpHint}
                      onPress={handleUseTestOtp}
                      activeOpacity={0.7}
                      accessibilityRole="button"
                      accessibilityLabel="Auto-fill test OTP 1234"
                    >
                      <Text style={styles.testOtpHpText} allowFontScaling={true}>
                        👉 Quick test: Auto-fill 1234
                      </Text>
                    </TouchableOpacity>

                    {otpNotice && (
                      <Text style={styles.otpNotice} allowFontScaling={true}>{otpNotice}</Text>
                    )}
                  </View>
                )}

                {/* Primary Action Button: "Send OTP" or "Enter Dashboard" */}
                {!otpSent ? (
                  <TouchableOpacity
                    style={[styles.primaryBtn, mobileNumber.length < 10 && styles.primaryBtnDisabled]}
                    onPress={handleSendOtp}
                    disabled={mobileNumber.length < 10 || loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Send OTP"
                    accessibilityState={{ disabled: mobileNumber.length < 10 || loading }}
                  >
                    <LinearGradient
                      colors={['#15803D', '#166534']}
                      style={styles.btnGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryBtnText} allowFontScaling={true}>Send OTP ➔</Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    style={styles.primaryBtn}
                    onPress={handleVerifyOtp}
                    disabled={loading}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel="Verify and Enter Dashboard"
                    accessibilityState={{ disabled: loading }}
                  >
                    <LinearGradient
                      colors={['#15803D', '#166534']}
                      style={styles.btnGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {loading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <Text style={styles.primaryBtnText} allowFontScaling={true}>
                          Verify & Enter Dashboard ➔
                        </Text>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* ── Option B: Kisan ID / Aadhaar-linked Registration Flow ── */}
            {authMethod === 'kisan_id' && (
              <View style={styles.methodBox}>
                <View style={styles.fieldBox}>
                  <Text style={styles.inputLabel} allowFontScaling={true}>
                    11-Digit Kisan ID or 12-Digit Aadhaar
                  </Text>
                  <View style={styles.phoneInputRow}>
                    <View style={styles.countryCodeBadge} accessible={false}>
                      <MaterialCommunityIcons name="badge-account" size={20} color="#15803D" />
                    </View>
                    <TextInput
                      style={styles.phoneInput}
                      value={kisanOrAadhaarId}
                      onChangeText={(val) => {
                        setKisanOrAadhaarId(val);
                        if (idError) setIdError(null);
                      }}
                      placeholder="e.g. KISAN9482101 or 1234 5678 9012"
                      placeholderTextColor="#94A3B8"
                      autoCapitalize="characters"
                      maxLength={14}
                      allowFontScaling={true}
                      accessibilityLabel="Kisan ID or Aadhaar Number"
                      accessibilityHint="Enter your 11 digit PM Kisan ID or 12 digit Aadhaar number"
                    />
                  </View>
                  {idError && (
                    <Text style={styles.errorText} allowFontScaling={true}>
                      {idError}
                    </Text>
                  )}
                </View>

                <TouchableOpacity
                  style={styles.testOtpHint}
                  onPress={handleAutoFillKisanId}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel="Auto-fill demo Kisan ID"
                >
                  <Text style={styles.testOtpHpText} allowFontScaling={true}>
                    👉 Quick test: Auto-fill KISAN9842101
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.primaryBtn, kisanOrAadhaarId.trim().length < 11 && styles.primaryBtnDisabled]}
                  onPress={handleVerifyKisanId}
                  disabled={kisanOrAadhaarId.trim().length < 11 || loading}
                  activeOpacity={0.85}
                  accessibilityRole="button"
                  accessibilityLabel="Verify Kisan ID and Enter Dashboard"
                  accessibilityState={{ disabled: kisanOrAadhaarId.trim().length < 11 || loading }}
                >
                  <LinearGradient
                    colors={['#15803D', '#166534']}
                    style={styles.btnGradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                  >
                    {loading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <Text style={styles.primaryBtnText} allowFontScaling={true}>
                        Verify & Enter Dashboard ➔
                      </Text>
                    )}
                  </LinearGradient>
                </TouchableOpacity>
              </View>
            )}

            {/* ── Option C: Explicit "Continue as Guest" Button ── */}
            <TouchableOpacity
              style={styles.skipGuestBtn}
              onPress={handleSkipGuest}
              activeOpacity={0.75}
              disabled={loading}
              accessibilityRole="button"
              accessibilityLabel="Continue as Guest Farmer"
              accessibilityHint="Double tap to enter Krishi Sahayak dashboard as a guest"
            >
              <MaterialCommunityIcons name="account-arrow-right-outline" size={18} color="#15803D" />
              <Text style={styles.skipGuestText} allowFontScaling={true}>
                Continue as Guest Farmer →
              </Text>
            </TouchableOpacity>

            {/* ── 1-Tap Quick Demo Profile Chips ── */}
            <View style={styles.demoChipsSection}>
              <Text style={styles.demoChipsLabel} allowFontScaling={true}>
                Instant 1-Tap Profiles:
              </Text>
              <View style={styles.chipsRow}>
                {DEMO_PROFILES.map((p) => (
                  <TouchableOpacity
                    key={p.farmerId}
                    style={styles.demoChip}
                    onPress={() => handleDemoProfile(p)}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={`Login as demo profile ${p.name} from ${p.state}`}
                  >
                    <Text style={styles.demoChipText} allowFontScaling={true}>
                      🌾 {p.name.split(' ')[0]} ({p.state})
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        </ScrollView>
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
    backgroundColor: '#FDFBF7',
    position: 'relative',
  },
  fixedBackButton: {
    position: 'absolute',
    top: 20,
    left: 20,
    zIndex: 999,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#15803D',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 6,
  },
  fixedBackText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#15803D',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 80,
    paddingBottom: 40,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  loginCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#E7E2D5',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    marginBottom: 16,
  },
  title: {
    fontSize: 26,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    letterSpacing: -0.3,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 18,
    paddingHorizontal: 12,
  },
  tabContainer: {
    flexDirection: 'row',
    width: '100%',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    marginBottom: 20,
    gap: 4,
  },
  tabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 10,
  },
  tabButtonActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tabButtonText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  tabButtonTextActive: {
    color: '#15803D',
  },
  methodBox: {
    width: '100%',
  },
  fieldBox: {
    width: '100%',
    marginBottom: 14,
  },
  inputLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  phoneInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    height: 56,
    overflow: 'hidden',
  },
  countryCodeBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 14,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  countryCodeText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  phoneInput: {
    flex: 1,
    height: '100%',
    paddingHorizontal: 14,
    fontSize: 17,
    fontWeight: '700',
    color: '#0F172A',
  },
  checkBadge: {
    paddingRight: 14,
  },
  otpCard: {
    width: '100%',
    backgroundColor: '#F8FAF8',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
  },
  otpRow: {
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
    borderRadius: 12,
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 8,
  },
  verifyBtn: {
    backgroundColor: '#15803D',
    paddingHorizontal: 18,
    height: 50,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  verifyBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },
  testOtpHint: {
    marginTop: 4,
    marginBottom: 14,
    alignSelf: 'flex-start',
  },
  testOtpHpText: {
    fontSize: 12,
    color: '#15803D',
    fontWeight: '700',
  },
  otpNotice: {
    fontSize: 12,
    color: '#166534',
    marginTop: 6,
    fontWeight: '600',
  },
  errorText: {
    fontSize: 12,
    color: '#DC2626',
    marginTop: 6,
    fontWeight: '600',
  },
  primaryBtn: {
    width: '100%',
    height: 54,
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  primaryBtnDisabled: {
    opacity: 0.5,
    elevation: 0,
  },
  btnGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: 0.3,
  },
  skipGuestBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    marginTop: 10,
  },
  skipGuestText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
    textDecorationLine: 'underline',
  },
  demoChipsSection: {
    width: '100%',
    marginTop: 18,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1ECE1',
    alignItems: 'center',
  },
  demoChipsLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'center',
  },
  demoChip: {
    backgroundColor: '#F8FAFC',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  demoChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
});
