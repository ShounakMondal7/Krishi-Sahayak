/**
 * LocationPickerModal — Compact modal for switching farm location from the dashboard.
 *
 * Opened when the farmer taps the location pill in the top bar.
 * Same cascade State → District pickers as LocationSelectionView but compact.
 */
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import {
  getAllStates,
  getDistrictsForState,
  detectLocationGPS,
  lookupLocationByPincode,
  translateLocation,
} from '../services/locations';
import { LanguageCode, getTranslation } from '../services/i18n';
import { storageService } from '../services/storage';

interface Props {
  visible: boolean;
  currentState: string;
  currentDistrict: string;
  currentLang?: LanguageCode;
  onClose: () => void;
  onSave: (state: string, district: string) => void;
}

export default function LocationPickerModal({
  visible,
  currentState,
  currentDistrict,
  currentLang,
  onClose,
  onSave,
}: Props) {
  const [activeLang, setActiveLang] = useState<LanguageCode>(currentLang || 'en');
  const [selectedState, setSelectedState] = useState(currentState);
  const [selectedDistrict, setSelectedDistrict] = useState(currentDistrict);
  const [districts, setDistricts] = useState<string[]>([]);
  const [detecting, setDetecting] = useState(false);
  const [showStatePicker, setShowStatePicker] = useState(false);
  const [showDistrictPicker, setShowDistrictPicker] = useState(false);
  const [gpsWarning, setGpsWarning] = useState<string | null>(null);

  // 📮 PIN Code State
  const [pincode, setPincode] = useState('');
  const [pincodeLoading, setPincodeLoading] = useState(false);
  const [pincodeNotice, setPincodeNotice] = useState<string | null>(null);
  const [pincodeError, setPincodeError] = useState<string | null>(null);

  useEffect(() => {
    if (currentLang) setActiveLang(currentLang);
  }, [currentLang]);

  useEffect(() => {
    (async () => {
      const saved = await storageService.getSavedLanguage();
      if (saved) setActiveLang(saved as LanguageCode);
    })();
  }, []);

  const t = (key: string) => getTranslation(activeLang, key);

  const localizeState = (stateName: string) => {
    if (!stateName) return '';
    return t(stateName) || translateLocation(stateName, activeLang) || stateName;
  };

  const localizeDistrict = (districtName: string) => {
    if (!districtName) return '';
    return translateLocation(districtName, activeLang) || t(districtName) || districtName;
  };

  useEffect(() => {
    if (visible) {
      setSelectedState(currentState);
      setSelectedDistrict(currentDistrict);
      setGpsWarning(null);
      setPincodeNotice(null);
      setPincodeError(null);
      (async () => {
        const saved = await storageService.getSavedLocation();
        if (saved?.pincode) setPincode(saved.pincode);
      })();
    }
  }, [visible, currentState, currentDistrict]);

  useEffect(() => {
    if (selectedState) {
      const dists = getDistrictsForState(selectedState);
      setDistricts(dists);
      if (!dists.includes(selectedDistrict)) {
        setSelectedDistrict(dists[0] || '');
      }
    }
  }, [selectedState]);

  // 📮 PIN Code Instant Lookup
  const handlePincodeChange = async (val: string) => {
    const clean = val.replace(/\D/g, '').slice(0, 6);
    setPincode(clean);
    setPincodeError(null);
    setPincodeNotice(null);

    if (clean.length === 6) {
      setPincodeLoading(true);
      try {
        const res = await lookupLocationByPincode(clean);
        if (res) {
          setSelectedState(res.state);
          setSelectedDistrict(res.district);
          setGpsWarning(null);
          setPincodeNotice(
            `✅ PIN ${clean}: ${localizeDistrict(res.district)}, ${localizeState(res.state)}${res.postOfficeName ? ` (${res.postOfficeName})` : ''}`
          );
        } else {
          setPincodeError(
            activeLang === 'hi'
              ? '⚠️ पिन कोड नहीं मिला। कृपया सीधे राज्य/जिला चुनें।'
              : '⚠️ PIN code not found. Please verify digits or select State/District manually.'
          );
        }
      } catch {
        setPincodeError(
          activeLang === 'hi'
            ? '⚠️ पिन कोड सत्यापन विफल। कृपया सीधे राज्य/जिला चुनें।'
            : '⚠️ Could not verify PIN code. Please select State/District manually.'
        );
      } finally {
        setPincodeLoading(false);
      }
    }
  };

  const handleGPS = async () => {
    setDetecting(true);
    setGpsWarning(null);
    try {
      const result = await detectLocationGPS();
      setSelectedState(result.state);
      setSelectedDistrict(result.district);
      if (result.warning) {
        setGpsWarning(result.warning);
      }
    } catch {}
    setDetecting(false);
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <TouchableOpacity
          style={styles.backdropTouch}
          activeOpacity={1}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close location modal"
        />
        <View style={styles.sheet}>
          {/* Header */}
          <View style={styles.header} accessibilityRole="header">
            <View style={styles.headerLeft}>
              <MaterialCommunityIcons name="map-marker-radius" size={24} color="#15803D" />
              <Text style={styles.headerTitle} allowFontScaling={true}>{t('whereIsYourFarmTitle') || 'Change Farm Location'}</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={styles.closeBtn}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityHint="Double tap to close location modal"
            >
              <MaterialCommunityIcons name="close" size={22} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.body} showsVerticalScrollIndicator={false}>
            {/* GPS Button */}
            <TouchableOpacity
              style={styles.gpsBtn}
              onPress={handleGPS}
              disabled={detecting}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={detecting ? (t('detectingLocation') || 'Detecting…') : (t('autoDetectGps') || 'Auto-Detect GPS')}
              accessibilityState={{ busy: detecting }}
              accessibilityHint="Double tap to detect farm location via device GPS"
            >
              {detecting ? (
                <ActivityIndicator color="#0D9488" size="small" />
              ) : (
                <MaterialCommunityIcons name="crosshairs-gps" size={20} color="#0D9488" />
              )}
              <Text style={styles.gpsBtnText} allowFontScaling={true}>
                {detecting ? (t('detectingLocation') || 'Detecting…') : (t('autoDetectGps') || '📍 Auto-Detect GPS')}
              </Text>
            </TouchableOpacity>

            {/* ⚠️ Coarse IP Browser Privacy Geolocation Warning */}
            {gpsWarning && (
              <View style={styles.warningBox} accessibilityRole="alert">
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#D97706" />
                <Text style={styles.warningBoxText} allowFontScaling={true}>
                  {gpsWarning}
                </Text>
              </View>
            )}

            {/* 📮 Instant 6-Digit PIN Code Lookup */}
            <View style={styles.pincodeSection}>
              <View style={styles.pincodeHeaderRow}>
                <MaterialCommunityIcons name="mailbox" size={16} color="#15803D" />
                <Text style={styles.pincodeLabel} allowFontScaling={true}>
                  {activeLang === 'hi' ? 'पिन कोड (सटीक जिला खोज)' : 'Enter 6-Digit PIN Code (Instant Match)'}
                </Text>
              </View>
              <View style={styles.pincodeInputRow}>
                <TextInput
                  style={styles.pincodeInput}
                  value={pincode}
                  onChangeText={handlePincodeChange}
                  placeholder={activeLang === 'hi' ? 'उदा. 201310 या 141001' : 'e.g. 201310 or 141001'}
                  placeholderTextColor="#94A3B8"
                  keyboardType="number-pad"
                  maxLength={6}
                  allowFontScaling={true}
                />
                {pincodeLoading && (
                  <View style={styles.pincodeSpinner}>
                    <ActivityIndicator size="small" color="#15803D" />
                  </View>
                )}
              </View>
              {pincodeNotice && (
                <View style={styles.pincodeSuccessBadge} accessibilityRole="text">
                  <MaterialCommunityIcons name="check-circle" size={14} color="#15803D" />
                  <Text style={styles.pincodeSuccessText} allowFontScaling={true}>{pincodeNotice}</Text>
                </View>
              )}
              {pincodeError && (
                <View style={styles.pincodeErrorBadge} accessibilityRole="alert">
                  <MaterialCommunityIcons name="alert-circle" size={14} color="#DC2626" />
                  <Text style={styles.pincodeErrorText} allowFontScaling={true}>{pincodeError}</Text>
                </View>
              )}
            </View>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText} allowFontScaling={true}>{t('orSelectManually') || 'OR SELECT DROPDOWN'}</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* State Picker */}
            <Text style={styles.label} allowFontScaling={true}>{t('selectState') || 'State'}</Text>
            <TouchableOpacity
              style={styles.picker}
              onPress={() => { setShowStatePicker(!showStatePicker); setShowDistrictPicker(false); }}
              activeOpacity={0.8}
              accessibilityRole="combobox"
              accessibilityLabel={`${t('selectState') || 'State'}, ${selectedState ? localizeState(selectedState) : 'None'}`}
              accessibilityState={{ expanded: showStatePicker }}
              accessibilityHint="Double tap to toggle state dropdown"
            >
              <Text style={styles.pickerText} allowFontScaling={true}>
                {selectedState ? localizeState(selectedState) : (t('tapToChooseState') || 'Select State')}
              </Text>
              <MaterialCommunityIcons
                name={showStatePicker ? 'chevron-up' : 'chevron-down'}
                size={20}
                color="#64748B"
              />
            </TouchableOpacity>

            {showStatePicker && (
              <ScrollView style={styles.optionsList} nestedScrollEnabled>
                {getAllStates().map((state) => {
                  const localizedStateName = localizeState(state);
                  return (
                    <TouchableOpacity
                      key={state}
                      style={[styles.optionItem, state === selectedState && styles.optionActive]}
                      onPress={() => {
                        setSelectedState(state);
                        setSelectedDistrict('');
                        setShowStatePicker(false);
                        setShowDistrictPicker(true);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={localizedStateName}
                      accessibilityState={{ selected: state === selectedState }}
                    >
                      <Text style={[styles.optionText, state === selectedState && styles.optionTextActive]} allowFontScaling={true}>
                        {localizedStateName}
                      </Text>
                      {state === selectedState && (
                        <MaterialCommunityIcons name="check" size={18} color="#15803D" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* District Picker */}
            {selectedState && (
              <>
                <Text style={styles.label} allowFontScaling={true}>{t('selectDistrict') || 'District'}</Text>
                <TouchableOpacity
                  style={styles.picker}
                  onPress={() => { setShowDistrictPicker(!showDistrictPicker); setShowStatePicker(false); }}
                  activeOpacity={0.8}
                  accessibilityRole="combobox"
                  accessibilityLabel={`${t('selectDistrict') || 'District'}, ${selectedDistrict ? localizeDistrict(selectedDistrict) : 'None'}`}
                  accessibilityState={{ expanded: showDistrictPicker }}
                  accessibilityHint="Double tap to toggle district dropdown"
                >
                  <Text style={styles.pickerText} allowFontScaling={true}>
                    {selectedDistrict ? localizeDistrict(selectedDistrict) : (t('tapToChooseDistrict') || 'Select District')}
                  </Text>
                  <MaterialCommunityIcons
                    name={showDistrictPicker ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {showDistrictPicker && (
                  <ScrollView style={styles.optionsList} nestedScrollEnabled>
                    {districts.map((dist) => {
                      const localizedDistName = localizeDistrict(dist);
                      return (
                        <TouchableOpacity
                          key={dist}
                          style={[styles.optionItem, dist === selectedDistrict && styles.optionActive]}
                          onPress={() => {
                            setSelectedDistrict(dist);
                            setShowDistrictPicker(false);
                          }}
                          accessibilityRole="button"
                          accessibilityLabel={localizedDistName}
                          accessibilityState={{ selected: dist === selectedDistrict }}
                        >
                          <Text style={[styles.optionText, dist === selectedDistrict && styles.optionTextActive]} allowFontScaling={true}>
                            {localizedDistName}
                          </Text>
                          {dist === selectedDistrict && (
                            <MaterialCommunityIcons name="check" size={18} color="#15803D" />
                          )}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}
              </>
            )}

            {/* Current Selection Summary */}
            {selectedState && selectedDistrict && (
              <View style={styles.summaryRow} accessibilityRole="summary" accessibilityLabel={`Selected farm location: ${localizeDistrict(selectedDistrict)}, ${localizeState(selectedState)}`}>
                <MaterialCommunityIcons name="map-marker-check" size={18} color="#15803D" />
                <Text style={styles.summaryText} allowFontScaling={true}>
                  {localizeDistrict(selectedDistrict)}, {localizeState(selectedState)}
                </Text>
              </View>
            )}

            <View style={{ height: 20 }} />
          </ScrollView>

          {/* Save Button */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.saveBtn, (!selectedState || !selectedDistrict) && styles.saveBtnDisabled]}
              onPress={async () => {
                if (selectedState && selectedDistrict) {
                  await storageService.saveLocation(
                    selectedState,
                    selectedDistrict,
                    true,
                    pincode.length === 6 ? pincode : undefined
                  );
                  onSave(selectedState, selectedDistrict);
                  onClose();
                }
              }}
              disabled={!selectedState || !selectedDistrict}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('continueToKrishi') || 'Save Location'}
              accessibilityState={{ disabled: !selectedState || !selectedDistrict }}
              accessibilityHint="Double tap to save farm location and apply changes"
            >
              <LinearGradient
                colors={selectedState && selectedDistrict ? ['#14532D', '#15803D'] : ['#94A3B8', '#94A3B8']}
                style={styles.saveBtnGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
              >
                <MaterialCommunityIcons name="check" size={20} color="#FFF" />
                <Text style={styles.saveBtnText} allowFontScaling={true}>{t('continueToKrishi') || 'Save Location'}</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheet: {
    backgroundColor: '#FDFBF7',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '80%',
    minHeight: 400,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#0F172A',
  },
  closeBtn: {
    padding: 4,
  },
  body: {
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  gpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 2,
    borderColor: '#99F6E4',
    borderRadius: 14,
    padding: 14,
    gap: 10,
    marginBottom: 16,
  },
  gpsBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#0D9488',
  },
  warningBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#F59E0B',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  },
  warningBoxText: {
    flex: 1,
    fontSize: 13,
    color: '#92400E',
    lineHeight: 18,
    fontWeight: '600',
  },
  pincodeSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    gap: 8,
  },
  pincodeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pincodeLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  pincodeInputRow: {
    position: 'relative',
    justifyContent: 'center',
  },
  pincodeInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    fontWeight: '700',
    color: '#0F172A',
    letterSpacing: 2,
  },
  pincodeSpinner: {
    position: 'absolute',
    right: 12,
  },
  pincodeSuccessBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  pincodeSuccessText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
    flex: 1,
  },
  pincodeErrorBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 6,
  },
  pincodeErrorText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#DC2626',
    flex: 1,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  dividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    letterSpacing: 1,
  },
  label: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  picker: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 14,
    marginBottom: 6,
  },
  pickerText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionsList: {
    backgroundColor: '#FFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxHeight: 200,
    marginBottom: 10,
  },
  optionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  optionActive: {
    backgroundColor: '#E8F5E9',
  },
  optionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
  },
  optionTextActive: {
    color: '#15803D',
    fontWeight: '700',
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 12,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  summaryText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#166534',
  },
  footer: {
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  saveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    elevation: 3,
  },
  saveBtnDisabled: {
    elevation: 0,
  },
  saveBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  saveBtnText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFF',
  },
});
