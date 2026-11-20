import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { safeHaptics } from '../services/haptics';

export interface IsolatedFollowUpInputProps {
  onSend: (text: string) => void;
  onVoiceToggle: () => void;
  isRecording: boolean;
  recordingTimer: string;
  t: (key: string) => string;
  loading?: boolean;
}

const IsolatedFollowUpInputComponent: React.FC<IsolatedFollowUpInputProps> = ({
  onSend,
  onVoiceToggle,
  isRecording,
  recordingTimer,
  t,
  loading = false,
}) => {
  const [localText, setLocalText] = useState('');

  const handleSend = useCallback(() => {
    const trimmed = localText.trim();
    if (!trimmed || loading) return;
    safeHaptics.impactLight();
    onSend(trimmed);
    setLocalText('');
    Keyboard.dismiss();
  }, [localText, loading, onSend]);

  const handleVoicePress = useCallback(() => {
    safeHaptics.impactMedium();
    onVoiceToggle();
  }, [onVoiceToggle]);

  return (
    <View style={styles.floatingActionBar}>
      {/* Secondary inline text input (Left) */}
      <TextInput
        style={styles.secondaryFollowUpInput}
        value={localText}
        onChangeText={setLocalText}
        placeholder={t('followUpPlaceholder') || 'Ask follow-up or type here...'}
        placeholderTextColor="#94A3B8"
        onSubmitEditing={handleSend}
        returnKeyType="send"
        editable={!loading}
        allowFontScaling={true}
        accessibilityLabel="Follow-up question input"
        accessibilityHint="Type your follow-up question"
      />

      <TouchableOpacity
        style={[
          styles.inlineSendBtn,
          (localText.trim().length === 0 || loading) && styles.inlineSendBtnDisabled,
        ]}
        onPress={handleSend}
        disabled={localText.trim().length === 0 || loading}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel="Send question"
      >
        <MaterialCommunityIcons
          name="send"
          size={18}
          color={localText.trim().length > 0 && !loading ? '#15803D' : '#94A3B8'}
        />
      </TouchableOpacity>

      {/* Dominant Tap-to-Start / Tap-to-Stop Toggle Button (Right) */}
      <TouchableOpacity
        style={[
          styles.dominantVoiceBtn,
          isRecording && styles.dominantVoiceBtnActive,
        ]}
        onPress={handleVoicePress}
        activeOpacity={0.85}
        accessibilityRole="button"
        accessibilityLabel={
          isRecording
            ? `Recording in progress, tap to stop. Elapsed ${recordingTimer}`
            : 'Tap to speak follow-up question'
        }
        accessibilityHint={
          isRecording
            ? 'Tap to stop recording and send question'
            : 'Tap to start recording follow-up question'
        }
        accessibilityState={{ busy: isRecording }}
      >
        <MaterialCommunityIcons
          name={isRecording ? 'record-circle-outline' : 'microphone'}
          size={20}
          color="#FFFFFF"
        />
        <Text allowFontScaling={true} style={styles.dominantVoiceBtnText}>
          {isRecording ? `Stop (${recordingTimer})` : t('tapToSpeak') || 'Tap to Speak'}
        </Text>
      </TouchableOpacity>
    </View>
  );
};

export const IsolatedFollowUpInput = React.memo(IsolatedFollowUpInputComponent);
export default IsolatedFollowUpInput;

const styles = StyleSheet.create({
  floatingActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 8,
  },
  secondaryFollowUpInput: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    color: '#0F172A',
    fontSize: 14,
    maxHeight: 48,
  },
  inlineSendBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineSendBtnDisabled: {
    backgroundColor: '#F1F5F9',
  },
  dominantVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    minHeight: 44,
  },
  dominantVoiceBtnActive: {
    backgroundColor: '#DC2626',
  },
  dominantVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '700',
  },
});
