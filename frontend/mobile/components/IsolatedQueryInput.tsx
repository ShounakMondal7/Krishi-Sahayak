import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { safeHaptics } from '../services/haptics';

export interface IsolatedQueryInputProps {
  showTextInput: boolean;
  setShowTextInput: (show: boolean) => void;
  onSubmit: (text: string) => void;
  loading: boolean;
  fontSize: number;
  t: (key: string) => string;
}

const IsolatedQueryInputComponent: React.FC<IsolatedQueryInputProps> = ({
  showTextInput,
  setShowTextInput,
  onSubmit,
  loading,
  fontSize,
  t,
}) => {
  const [localText, setLocalText] = useState('');

  const handleSubmit = useCallback(() => {
    const trimmed = localText.trim();
    if (!trimmed || loading) return;
    safeHaptics.impactLight();
    onSubmit(trimmed);
    Keyboard.dismiss();
  }, [localText, loading, onSubmit]);

  const handleToggle = useCallback(
    (show: boolean) => {
      safeHaptics.impactLight();
      setShowTextInput(show);
      if (!show) {
        setLocalText('');
        Keyboard.dismiss();
      }
    },
    [setShowTextInput]
  );

  if (!showTextInput) {
    return (
      <TouchableOpacity
        style={styles.demotedTextLink}
        onPress={() => handleToggle(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('orTypeQuestionHint') || 'Prefer to type? Tap here to write'}
        accessibilityHint="Double tap to open text typing box"
      >
        <MaterialCommunityIcons name="keyboard-outline" size={20} color="#166534" />
        <Text style={styles.demotedTextLinkText} allowFontScaling={true}>
          {t('orTypeQuestionHint') || 'Prefer to type? Tap here to write ✏️'}
        </Text>
      </TouchableOpacity>
    );
  }

  return (
    <View style={styles.expandedTextCard}>
      <View style={styles.expandedTextHeader}>
        <Text style={styles.textCardHeader} allowFontScaling={true}>
          {t('typeQuestionLabel') || 'Type Farming Question'}
        </Text>
        <TouchableOpacity
          onPress={() => handleToggle(false)}
          activeOpacity={0.7}
          style={styles.hideTextLink}
          accessibilityRole="button"
          accessibilityLabel="Hide text typing box"
        >
          <MaterialCommunityIcons name="close-circle-outline" size={18} color="#64748B" />
          <Text style={styles.hideTextLinkText} allowFontScaling={true}>
            {t('hideTextInput') || 'Hide'}
          </Text>
        </TouchableOpacity>
      </View>

      <TextInput
        style={[styles.sunlightTextInput, { fontSize }]}
        value={localText}
        onChangeText={setLocalText}
        placeholder={t('typePlaceholder') || 'e.g. How much urea to apply for wheat during first irrigation?'}
        placeholderTextColor="#94A3B8"
        multiline
        numberOfLines={3}
        textAlignVertical="top"
        editable={!loading}
        allowFontScaling={true}
        accessibilityLabel="Type your farming question"
      />

      <View style={styles.textInputActionsRow}>
        <Text style={styles.characterCountText} allowFontScaling={true}>
          {localText.length} chars
        </Text>
        <TouchableOpacity
          style={[
            styles.askSubmitBtn,
            (!localText.trim() || loading) && styles.askSubmitBtnDisabled,
          ]}
          onPress={handleSubmit}
          disabled={!localText.trim() || loading}
          activeOpacity={0.75}
          accessibilityRole="button"
          accessibilityLabel="Submit question"
        >
          {loading ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <>
              <MaterialCommunityIcons name="send" size={18} color="#FFFFFF" />
              <Text style={styles.askSubmitBtnText} allowFontScaling={true}>
                {t('askButton') || 'Ask Advisor'}
              </Text>
            </>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );
};

export const IsolatedQueryInput = React.memo(IsolatedQueryInputComponent);
export default IsolatedQueryInput;

const styles = StyleSheet.create({
  demotedTextLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 20,
    backgroundColor: '#F0FDF4',
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 8,
    alignSelf: 'center',
    marginTop: 4,
    minHeight: 48,
  },
  demotedTextLinkText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803D',
  },
  expandedTextCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginTop: 4,
  },
  expandedTextHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  textCardHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    letterSpacing: 0.2,
  },
  hideTextLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    padding: 4,
  },
  hideTextLinkText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  sunlightTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    color: '#0F172A',
    fontSize: 16,
    minHeight: 90,
  },
  textInputActionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  characterCountText: {
    fontSize: 12,
    color: '#94A3B8',
    fontWeight: '500',
  },
  askSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#15803D',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 12,
    minHeight: 44,
  },
  askSubmitBtnDisabled: {
    backgroundColor: '#94A3B8',
    opacity: 0.6,
  },
  askSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
});
