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

  const handleGPS = async () => {
    setDetecting(true);
    try {
      const result = await detectLocationGPS();
      setSelectedState(result.state);
      setSelectedDistrict(result.district);
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
              onPress={() => {
                if (selectedState && selectedDistrict) {
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
