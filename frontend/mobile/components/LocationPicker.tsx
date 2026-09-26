/**
 * LocationPicker.tsx — Fully localized State and District Picker component.
 *
 * Implements <Picker.Item label="{...}" value="{...}" /> wrapping all mapped
 * state and district string values with localization functions and dynamic
 * transliteration fallbacks, with graceful fallback to English when untranslated.
 */
import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getAllStates, getDistrictsForState, translateLocation } from '../services/locations';
import { LanguageCode, getTranslation } from '../services/i18n';

export interface PickerItemProps {
  label: string;
  value: string;
  isSelected?: boolean;
  onSelect?: (value: string) => void;
  testID?: string;
}

/**
 * <Picker.Item label="{...}" value="{...}" /> component wrapper
 */
export const PickerItem: React.FC<PickerItemProps> = ({
  label,
  value,
  isSelected,
  onSelect,
  testID,
}) => (
  <TouchableOpacity
    testID={testID}
    style={[styles.itemChip, isSelected && styles.itemChipSelected]}
    onPress={() => onSelect && onSelect(value)}
    activeOpacity={0.75}
    accessibilityRole="button"
    accessibilityLabel={label}
    accessibilityState={{ selected: isSelected }}
  >
    <Text allowFontScaling={true} style={[styles.itemText, isSelected && styles.itemTextSelected]} numberOfLines={1}>
      {label}
    </Text>
    {isSelected && (
      <MaterialCommunityIcons name="check-circle" size={16} color="#15803D" />
    )}
  </TouchableOpacity>
);

export const Picker = {
  Item: PickerItem,
};

export interface LocationPickerProps {
  selectedState: string;
  selectedDistrict: string;
  currentLang?: LanguageCode;
  onStateChange: (state: string) => void;
  onDistrictChange: (district: string) => void;
}

/**
 * Returns localized state or district label with graceful fallback to original English string.
 */
export function getLocalizedLocationLabel(name: string, lang: LanguageCode = 'en'): string {
  if (!name) return '';
  const translated = translateLocation(name, lang);
  return translated || getTranslation(lang, `location_${name}`) || name;
}

export default function LocationPicker({
  selectedState,
  selectedDistrict,
  currentLang = 'en',
  onStateChange,
  onDistrictChange,
}: LocationPickerProps) {
  const allStates = getAllStates();
  const districts = selectedState ? getDistrictsForState(selectedState) : [];
  const t = (key: string) => getTranslation(currentLang, key);

  return (
    <View style={styles.container}>
      {/* ── State Selector ── */}
      <Text allowFontScaling={true} style={styles.pickerSectionTitle}>
        {t('selectState') || 'Select State'}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollRow}
      >
        {allStates.map((state) => {
          const isSelected = state === selectedState;
          const localizedState = getLocalizedLocationLabel(state, currentLang);
          return (
            <Picker.Item
              key={state}
              value={state}
              label={localizedState}
              isSelected={isSelected}
              onSelect={(val) => {
                onStateChange(val);
                const nextDists = getDistrictsForState(val);
                if (nextDists.length > 0 && !nextDists.includes(selectedDistrict)) {
                  onDistrictChange(nextDists[0]);
                }
              }}
            />
          );
        })}
      </ScrollView>

      {/* ── District Selector ── */}
      {selectedState ? (
        <>
          <Text allowFontScaling={true} style={styles.pickerSectionTitle}>
            {t('selectDistrict') || 'Select District'} ({getLocalizedLocationLabel(selectedState, currentLang)})
          </Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollRow}
          >
            {districts.map((district) => {
              const isSelected = district === selectedDistrict;
              const localizedDistrict = getLocalizedLocationLabel(district, currentLang);
              return (
                <Picker.Item
                  key={district}
                  value={district}
                  label={localizedDistrict}
                  isSelected={isSelected}
                  onSelect={(val) => onDistrictChange(val)}
                />
              );
            })}
          </ScrollView>
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 6,
  },
  pickerSectionTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  scrollRow: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 4,
  },
  itemChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  itemChipSelected: {
    backgroundColor: '#DCFCE7',
    borderColor: '#15803D',
  },
  itemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  itemTextSelected: {
    color: '#15803D',
    fontWeight: '700',
  },
});
