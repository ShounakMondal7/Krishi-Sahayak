/**
 * LanguageSelectorSheet — Dedicated Global Language Picker Bottom Sheet.
 *
 * Requirements:
 * - Decoupled from onboarding: Opens anytime from the header globe button.
 * - Displays all 22 official Eighth Schedule Indian languages + English with native script, region hints, and flags.
 * - High-contrast sunlight-readable ivory aesthetic (#FDFBF7 container, #111827 text).
 * - Instant update: persists to storageService, invokes onSelect callback, and closes.
 */
import React from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  Modal,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { safeHaptics } from '../services/haptics';
import { LanguageCode, SUPPORTED_LANGUAGES, getTranslation } from '../services/i18n';
import { storageService } from '../services/storage';

interface LanguageSelectorSheetProps {
  visible: boolean;
  currentLang: LanguageCode;
  onClose: () => void;
  onSelect: (code: LanguageCode) => void;
}

export default function LanguageSelectorSheet({
  visible,
  currentLang,
  onClose,
  onSelect,
}: LanguageSelectorSheetProps) {
  const t = (key: string) => getTranslation(currentLang, key);

  const handleSelect = async (code: LanguageCode) => {
    safeHaptics.impactMedium();
    await storageService.setLanguage(code);
    onSelect(code);
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <Pressable
          style={styles.backdropTouch}
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close language selector modal"
        />
        <View style={styles.sheetContainer}>
          {/* Top Drag Handle */}
          <View style={styles.dragHandleRow} accessible={false}>
            <View style={styles.dragHandle} />
          </View>

          {/* Sheet Header */}
          <View style={styles.headerRow} accessibilityRole="header">
            <View style={styles.headerLeft}>
              <View style={styles.globeBadge} accessible={false}>
                <MaterialCommunityIcons name="earth" size={24} color="#15803D" />
              </View>
              <View>
                <Text style={styles.sheetTitle} allowFontScaling={true}>
                  {t('chooseLanguageTitle') || 'Choose Language / भाषा'}
                </Text>
                <Text style={styles.sheetSub} allowFontScaling={true}>
                  Voice advice and ICAR guidelines adapt instantly
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeBtn}
              onPress={() => {
                safeHaptics.impactLight();
                onClose();
              }}
              activeOpacity={0.7}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              accessibilityRole="button"
              accessibilityLabel="Close"
              accessibilityHint="Double tap to close language selector"
            >
              <MaterialCommunityIcons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          {/* Languages List */}
          <ScrollView
            style={styles.languageList}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          >
            {SUPPORTED_LANGUAGES.map((lang) => {
              const isSelected = currentLang === lang.code;
              return (
                <TouchableOpacity
                  key={lang.code}
                  style={[styles.langItemCard, isSelected && styles.langItemCardActive]}
                  onPress={() => handleSelect(lang.code)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={`${lang.nativeLabel}, ${lang.label}, ${lang.regionHint}${isSelected ? ', currently selected' : ''}`}
                  accessibilityState={{ selected: isSelected }}
                  accessibilityHint="Double tap to switch active application language"
                >
                  <View style={styles.langFlagCircle} accessible={false}>
                    <Text style={styles.langFlagEmoji} allowFontScaling={true}>{lang.flag}</Text>
                  </View>

                  <View style={styles.langDetails}>
                    <View style={styles.langTitleRow}>
                      <Text style={[styles.langNativeText, isSelected && styles.langNativeTextActive]} allowFontScaling={true}>
                        {lang.nativeLabel}
                      </Text>
                      {isSelected && (
                        <View style={styles.activePill} accessible={false}>
                          <Text style={styles.activePillText} allowFontScaling={true}>Active</Text>
                        </View>
                      )}
                    </View>
                    <Text style={styles.langEnglishText} allowFontScaling={true}>
                      {lang.label} • {lang.regionHint}
                    </Text>
                  </View>

                  <View style={[styles.checkCircle, isSelected && styles.checkCircleActive]} accessible={false}>
                    {isSelected && (
                      <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                    )}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Bottom dismiss button */}
          <View style={styles.bottomBar}>
            <TouchableOpacity
              style={styles.doneBtn}
              onPress={onClose}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel="Close language selector"
            >
              <Text style={styles.doneBtnText} allowFontScaling={true}>Close / ठीक है</Text>
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
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  backdropTouch: {
    flex: 1,
  },
  sheetContainer: {
    backgroundColor: '#FDFBF7',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 20,
    paddingBottom: 24,
    maxHeight: '85%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#E7E2D5',
  },
  dragHandleRow: {
    alignItems: 'center',
    paddingVertical: 4,
    marginBottom: 8,
  },
  dragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#EAE5D8',
    marginBottom: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  globeBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  sheetTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sheetSub: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  languageList: {
    maxHeight: 460,
  },
  listContent: {
    paddingVertical: 6,
    gap: 10,
  },
  langItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  langItemCardActive: {
    backgroundColor: '#F0FDF4',
    borderColor: '#15803D',
    borderWidth: 2,
  },
  langFlagCircle: {
    width: 42,
    height: 42,
    borderRadius: 21,
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
  langDetails: {
    flex: 1,
  },
  langTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langNativeText: {
    fontSize: 17,
    fontWeight: '700',
    color: '#1E293B',
  },
  langNativeTextActive: {
    color: '#15803D',
    fontWeight: '800',
  },
  activePill: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  activePillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
  },
  langEnglishText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  checkCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  checkCircleActive: {
    backgroundColor: '#15803D',
    borderColor: '#15803D',
  },
  bottomBar: {
    marginTop: 12,
    paddingTop: 8,
  },
  doneBtn: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  doneBtnText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#475569',
  },
});
