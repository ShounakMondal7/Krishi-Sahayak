/**
 * LanguageSelectionView — Pure, Full-Screen Language Selection View.
 *
 * Requirements:
 * - Rendered in isolation (view === 'language').
 * - Zero dashboard headers, zero weather widgets, zero bottom tabs, zero background cards.
 * - Clean centered title: "Select Your Language / अपनी भाषा चुनें".
 * - Large tactile language cards with native script + English + flag.
 * - Tapping any language directly transitions to the Login screen.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { safeHaptics } from '../services/haptics';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
} from '../services/i18n';

interface LanguageSelectionViewProps {
  currentLang?: LanguageCode;
  onSelect: (code: LanguageCode) => void;
}

export default function LanguageSelectionView({
  currentLang = 'en',
  onSelect,
}: LanguageSelectionViewProps) {
  const handleSelectLanguage = (code: LanguageCode) => {
    safeHaptics.impactMedium();
    onSelect(code);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        {/* Header Block — Centered & Clean */}
        <View style={styles.headerBlock} accessibilityRole="header">
          <View style={styles.iconCircle} accessible={false}>
            <MaterialCommunityIcons name="translate" size={28} color="#15803D" />
          </View>
          <Text style={styles.mainTitle} allowFontScaling={true}>
            Select Your Language
          </Text>
          <Text style={styles.hindiTitle} allowFontScaling={true}>
            अपनी भाषा चुनें
          </Text>
          <Text style={styles.subtitle} allowFontScaling={true}>
            Voice advice and ICAR guidelines will adapt automatically
          </Text>
        </View>

        {/* 22 Official Eighth Schedule Indian Languages + English (23 Total) */}
        <ScrollView
          style={styles.scrollList}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.languageStack}>
            {SUPPORTED_LANGUAGES.map((item) => {
              const isSelected = currentLang === item.code;
              return (
                <TouchableOpacity
                  key={item.code}
                  style={[styles.langCard, isSelected && styles.langCardSelected]}
                  onPress={() => handleSelectLanguage(item.code)}
                  activeOpacity={0.82}
                  accessibilityRole="button"
                  accessibilityLabel={`${item.nativeLabel}, ${item.label}, ${item.regionHint}`}
                  accessibilityHint="Double tap to select this language"
                  accessibilityState={{ selected: isSelected }}
                >
                  <View style={styles.langFlagCircle} accessible={false}>
                    <Text style={styles.langFlagEmoji} allowFontScaling={true}>{item.flag}</Text>
                  </View>

                  <View style={styles.langInfo}>
                    <Text style={[styles.langNativeText, isSelected && styles.langNativeTextSelected]} allowFontScaling={true}>
                      {item.nativeLabel}
                    </Text>
                    <Text style={styles.langEnglishText} allowFontScaling={true}>
                      {item.label} • {item.regionHint}
                    </Text>
                  </View>

                  <View style={[styles.arrowCircle, isSelected && styles.arrowCircleSelected]} accessible={false}>
                    <MaterialCommunityIcons
                      name="arrow-right"
                      size={18}
                      color={isSelected ? '#FFFFFF' : '#94A3B8'}
                    />
                  </View>
                </TouchableOpacity>
              );
            })}
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
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  headerBlock: {
    alignItems: 'center',
    marginBottom: 20,
    paddingTop: 10,
  },
  iconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    marginBottom: 14,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 3,
  },
  mainTitle: {
    fontSize: 24,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: -0.3,
  },
  hindiTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#15803D',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    maxWidth: 320,
    lineHeight: 18,
  },
  scrollList: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 32,
  },
  languageStack: {
    gap: 10,
  },
  langCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
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
  langCardSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#15803D',
    borderWidth: 2,
  },
  langFlagCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#F8FAFC',
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
    fontSize: 19,
    fontWeight: '800',
    color: '#0F172A',
  },
  langNativeTextSelected: {
    color: '#15803D',
  },
  langEnglishText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  arrowCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arrowCircleSelected: {
    backgroundColor: '#15803D',
  },
});
