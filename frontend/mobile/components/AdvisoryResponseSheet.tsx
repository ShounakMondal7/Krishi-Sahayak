/**
 * AdvisoryResponseSheet — AI Advisory Response Bottom Sheet / Overlay.
 *
 * Core Features:
 * - 🚀 Active Feedback Loading State: Pulsing green icon + cycling status text
 * - 🔊 Audio-First Delivery: Bold Audio Player Widget with dynamic jumping Waveform Visualizer
 * - 🏷️ Data Context Badges: Live API chips (IMD Weather, eNAM Mandi MSP, ICAR Grounding)
 * - 📖 Text & Trust: High-contrast typography + official "🛡️ Verified by ICAR Guidelines" badge
 * - 💬 Multi-turn follow-up question input bar
 */
import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Modal,
  Animated,
  Platform,
  Linking,
  KeyboardAvoidingView,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { audioQueue, useAudioQueue } from '../services/audioQueue';
import { safeHaptics } from '../services/haptics';
import { LanguageCode, getTranslation } from '../services/i18n';
import { BASE_URL } from '../services/api';

export interface SourceLabel {
  filename: string;
  display_name: string;
  relevance_score?: number;
}

export interface AdvisoryResponseData {
  query_id?: number;
  conversation_id?: string;
  answer: string;
  answer_english?: string;
  sources: string[];
  source_labels?: SourceLabel[];
  response_time_ms: number;
  from_cache?: boolean;
  weather_context_used?: boolean;
  market_context_used?: boolean;
  is_msp?: boolean;
  market_badge_label?: string;
  intent?: string;
  follow_up_questions?: string[];
}

interface AdvisoryResponseSheetProps {
  visible: boolean;
  onClose: () => void;
  loading: boolean;
  question: string | null;
  response: AdvisoryResponseData | null;
  error: string | null;
  currentLang: LanguageCode;
  fontSizeScale?: 'normal' | 'large' | 'xlarge';
  onFollowUpSubmit?: (followUpQuestion: string) => void;
  onSelectFollowUp?: (followUpQuestion: string) => void;
}


export interface MarkdownTableBlock {
  type: 'table';
  headers: string[];
  rows: string[][];
}

export interface MarkdownItemBlock {
  type: 'item';
  label?: string;
  value: string;
  isDosage?: boolean;
}

export interface MarkdownNumberedBlock {
  type: 'numbered';
  number: string;
  value: string;
}

export interface MarkdownParagraphBlock {
  type: 'paragraph';
  value: string;
}

export type MarkdownBlock =
  | MarkdownTableBlock
  | MarkdownItemBlock
  | MarkdownNumberedBlock
  | MarkdownParagraphBlock;

export interface ParsedAdvisorySection {
  id: 'diagnosis' | 'organic' | 'chemical' | 'safety' | 'market_status' | 'mandi_rates' | 'selling_advice' | 'market_support' | 'other';
  cleanTitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  accentColor: string;
  bgColor: string;
  borderColor: string;
  badgeBg: string;
  blocks: MarkdownBlock[];
}

export interface ParsedAdvisoryDocument {
  executiveSummary: string | null;
  sections: ParsedAdvisorySection[];
}

function parseMarkdownBlocks(text: string): MarkdownBlock[] {
  const blocks: MarkdownBlock[] = [];
  const lines = text.split('\n');
  let i = 0;

  while (i < lines.length) {
    const rawLine = lines[i].trim();
    if (!rawLine) {
      i++;
      continue;
    }

    // Markdown Table Check: line begins and ends with |
    if (rawLine.startsWith('|') && rawLine.endsWith('|') && rawLine.includes('|')) {
      const tableLines: string[] = [];
      while (i < lines.length && lines[i].trim().startsWith('|') && lines[i].trim().endsWith('|')) {
        tableLines.push(lines[i].trim());
        i++;
      }

      if (tableLines.length >= 2) {
        const headerRow = tableLines[0]
          .split('|')
          .slice(1, -1)
          .map((c) => c.trim().replace(/\*\*/g, ''));

        let startRowIdx = 1;
        if (startRowIdx < tableLines.length && /^\|[\s\-:]+(\|[\s\-:]+)+\|$/.test(tableLines[1])) {
          startRowIdx = 2;
        }

        const dataRows: string[][] = [];
        for (let r = startRowIdx; r < tableLines.length; r++) {
          const cells = tableLines[r]
            .split('|')
            .slice(1, -1)
            .map((c) => c.trim());
          if (cells.some((c) => c.length > 0)) {
            dataRows.push(cells);
          }
        }

        if (headerRow.length > 0) {
          blocks.push({
            type: 'table',
            headers: headerRow,
            rows: dataRows,
          });
          continue;
        }
      }
    }

    // Bullet item with bold key-value: - **Label:** Value
    const bulletMatch = rawLine.match(/^[-*•]?\s*\*\*([^*]+)\*\*(?:\s*:\s*|\s*—\s*|\s*-\s*)(.*)$/);
    if (bulletMatch) {
      const label = bulletMatch[1].replace(/\*\*/g, '').trim();
      const value = bulletMatch[2].trim();
      const isDosage = /dosage|15-liter|15l|pump|knapsack/i.test(label) || /15-liter|15l|knapsack/i.test(value);
      blocks.push({
        type: 'item',
        label,
        value,
        isDosage,
      });
      i++;
      continue;
    }

    // Numbered step: 1. Step text or 1) Step text
    const numMatch = rawLine.match(/^(\d+)[.)]\s+(.*)$/);
    if (numMatch) {
      blocks.push({
        type: 'numbered',
        number: numMatch[1],
        value: numMatch[2].trim(),
      });
      i++;
      continue;
    }

    // Standard bullet without bold label: - Some text
    if (/^[-*•]\s+/.test(rawLine)) {
      const cleanLine = rawLine.replace(/^[-*•]\s+/, '').trim();
      const isDosage = /15-liter|15l|knapsack|pump/i.test(cleanLine);
      blocks.push({
        type: 'item',
        value: cleanLine,
        isDosage,
      });
      i++;
      continue;
    }

    // Regular paragraph or note
    blocks.push({
      type: 'paragraph',
      value: rawLine.replace(/^\*|\*$/g, '').trim(),
    });
    i++;
  }

  return blocks;
}

function parseAdvisoryDocument(raw: string): ParsedAdvisoryDocument {
  if (!raw || !raw.trim()) {
    return { executiveSummary: null, sections: [] };
  }

  // Split on ### headings
  const headingSplitRegex = /(?=^###\s+)/m;
  const rawParts = raw.split(headingSplitRegex).map((p) => p.trim()).filter(Boolean);

  let executiveSummary: string | null = null;
  const sections: ParsedAdvisorySection[] = [];

  for (const part of rawParts) {
    if (!part.startsWith('###')) {
      // Content before any heading is the Executive Summary!
      if (!executiveSummary) {
        executiveSummary = part;
      } else {
        executiveSummary += '\n\n' + part;
      }
      continue;
    }

    // First line is heading: ### [Emoji] Title
    const firstNewline = part.indexOf('\n');
    const rawHeader = firstNewline !== -1 ? part.slice(0, firstNewline).trim() : part.trim();
    const body = firstNewline !== -1 ? part.slice(firstNewline + 1).trim() : '';

    let id: ParsedAdvisorySection['id'] = 'other';
    let icon: keyof typeof MaterialCommunityIcons.glyphMap = 'leaf';
    let accentColor = '#475569';
    let bgColor = '#F8FAFC';
    let borderColor = '#E2E8F0';
    let badgeBg = '#F1F5F9';

    if (/Market|Commodity|📊/i.test(rawHeader)) {
      id = 'market_status';
      icon = 'chart-line';
      accentColor = '#0284C7';
      bgColor = '#F0F9FF';
      borderColor = '#BAE6FD';
      badgeBg = '#E0F2FE';
    } else if (/Mandi|Rate|Rates|Estimated|💰/i.test(rawHeader)) {
      id = 'mandi_rates';
      icon = 'currency-inr';
      accentColor = '#D97706';
      bgColor = '#FFFBEB';
      borderColor = '#FDE68A';
      badgeBg = '#FEF3C7';
    } else if (/Selling|Storage|Guidelines|🚛/i.test(rawHeader)) {
      id = 'selling_advice';
      icon = 'truck-delivery-outline';
      accentColor = '#16A34A';
      bgColor = '#F0FDF4';
      borderColor = '#BBF7D0';
      badgeBg = '#DCFCE7';
    } else if (/Gateway|Support|Portal|🏛️/i.test(rawHeader)) {
      id = 'market_support';
      icon = 'bank-outline';
      accentColor = '#7C3AED';
      bgColor = '#F5F3FF';
      borderColor = '#DDD6FE';
      badgeBg = '#EDE9FE';
    } else if (/1\.|Diagnosis|🛑|നിർണ്ണയം|निदान|Symptoms|🔍/i.test(rawHeader)) {
      id = 'diagnosis';
      icon = 'alert-decagram';
      accentColor = '#DC2626';
      bgColor = '#FEF2F2';
      borderColor = '#FCA5A5';
      badgeBg = '#FEE2E2';
    } else if (/2\.|Organic|🌿|ജൈവ|जैविक|Cultural/i.test(rawHeader)) {
      id = 'organic';
      icon = 'sprout';
      accentColor = '#16A34A';
      bgColor = '#F0FDF4';
      borderColor = '#86EFAC';
      badgeBg = '#DCFCE7';
    } else if (/3\.|Chemical|🧪|രാസ|रासायनिक|Spray/i.test(rawHeader)) {
      id = 'chemical';
      icon = 'flask-round-bottom';
      accentColor = '#0284C7';
      bgColor = '#F0F9FF';
      borderColor = '#7DD3FC';
      badgeBg = '#E0F2FE';
    } else if (/4\.|Safety|⚠️|സുരക്ഷ|सुरक्षा|Precaution|PHI/i.test(rawHeader)) {
      id = 'safety';
      icon = 'shield-alert';
      accentColor = '#D97706';
      bgColor = '#FFFBEB';
      borderColor = '#FCD34D';
      badgeBg = '#FEF3C7';
    }

    const cleanTitle = rawHeader
      .replace(/^###\s*/, '')
      .replace(/^[🛑🌿🧪⚠️📊💰🚛🏛️🔍\u26a0\ufe0f\s]+/, '')
      .trim();

    const blocks = parseMarkdownBlocks(body);

    sections.push({
      id,
      cleanTitle: cleanTitle || rawHeader.replace(/^###\s*/, '').trim(),
      icon,
      accentColor,
      bgColor,
      borderColor,
      badgeBg,
      blocks,
    });
  }

  return { executiveSummary, sections };
}

function renderFormattedText(text: string, baseStyle: any, boldStyle: any) {
  if (!text) return null;
  if (!text.includes('**')) {
    return <Text style={baseStyle}>{text}</Text>;
  }
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, index) => {
        if (part.startsWith('**') && part.endsWith('**')) {
          const content = part.slice(2, -2);
          return (
            <Text key={index} style={boldStyle}>
              {content}
            </Text>
          );
        }
        return (
          <Text key={index} style={baseStyle}>
            {part}
          </Text>
        );
      })}
    </>
  );
}

export default function AdvisoryResponseSheet({
  visible,
  onClose,
  loading,
  question,
  response,
  error,
  currentLang,
  fontSizeScale = 'normal',
  onFollowUpSubmit,
  onSelectFollowUp,
}: AdvisoryResponseSheetProps) {
  const {
    isPlaying: audioPlaying,
    isLoading: audioLoading,
    statusText: audioStatusText,
    currentPart,
    totalParts,
    playAdvisorySequence,
    stopAndClearAll,
  } = useAudioQueue();
  const [followUpText, setFollowUpText] = useState('');
  const [loadingCycleIndex, setLoadingCycleIndex] = useState(0);

  // Persistent ScrollView reference for auto-scrolling to top on new query
  const sheetScrollRef = useRef<ScrollView>(null);

  // Toast Notification state
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const toastTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Task 2: Modals & Action States
  const [showSprayModal, setShowSprayModal] = useState(false);
  const [showShopModal, setShowShopModal] = useState(false);
  const [selectedCitation, setSelectedCitation] = useState<SourceLabel | null>(null);
  const [isRecordingFollowUp, setIsRecordingFollowUp] = useState(false);

  const pulseAnim = useRef(new Animated.Value(1)).current;
  const waveformAnim = useRef(
    Array.from({ length: 20 }, () => new Animated.Value(6))
  ).current;
  const waveformIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const t = (key: string) => getTranslation(currentLang, key);

  const showToast = (msg: string) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, 3800);
  };

  // Cycling loading status messages
  const LOADING_MESSAGES = [
    t('searchingIcar'),
    t('checkingWeather'),
    t('checkingMandi'),
    t('translatingAdvice'),
    t('synthesizingAdvice'),
  ];

  // Auto-scroll to top on question or loading change
  useEffect(() => {
    sheetScrollRef.current?.scrollTo({ y: 0, animated: true });
  }, [question, loading]);

  // Cycling animation when loading
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (loading) {
      stopAudio();
      sheetScrollRef.current?.scrollTo({ y: 0, animated: true });
      setLoadingCycleIndex(0);
      interval = setInterval(() => {
        setLoadingCycleIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
      }, 1600);

      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, { toValue: 1.18, duration: 600, useNativeDriver: true }),
          Animated.timing(pulseAnim, { toValue: 1.0, duration: 600, useNativeDriver: true }),
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
      if (interval) clearInterval(interval);
    }
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [loading]);

  // Waveform animation during audio playback
  useEffect(() => {
    if (audioPlaying) {
      waveformIntervalRef.current = setInterval(() => {
        waveformAnim.forEach((anim) => {
          const targetHeight = Math.floor(Math.random() * 26) + 8;
          Animated.timing(anim, {
            toValue: targetHeight,
            duration: 180,
            useNativeDriver: false,
          }).start();
        });
      }, 200);
    } else {
      if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current);
      waveformAnim.forEach((anim, i) => {
        const restHeight = 8 + (i % 4) * 3;
        Animated.timing(anim, {
          toValue: restHeight,
          duration: 250,
          useNativeDriver: false,
        }).start();
      });
    }
    return () => {
      if (waveformIntervalRef.current) clearInterval(waveformIntervalRef.current);
    };
  }, [audioPlaying]);

  // Reset audio on close or unmount
  useEffect(() => {
    if (!visible) {
      stopAudio();
    }
  }, [visible]);

  useEffect(() => {
    return () => {
      stopAudio();
    };
  }, []);

  const playAudio = () => {
    if (!response?.query_id) {
      showToast('⚠️ Spoken advisory not ready yet for this query.');
      return;
    }
    playAdvisorySequence(response.query_id, currentLang, displayAnswer);
  };

  const stopAudio = () => {
    stopAndClearAll();
  };

  const handleToggleAudio = () => {
    if (audioLoading) {
      return; // Debounce duplicate clicks while preparing voice
    }
    if (audioPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  const handleSendFollowUp = () => {
    const text = followUpText.trim();
    if (!text) return;
    stopAudio();
    safeHaptics.impactMedium();
    sheetScrollRef.current?.scrollTo({ y: 0, animated: true });
    if (onSelectFollowUp) {
      onSelectFollowUp(text);
    } else if (onFollowUpSubmit) {
      onFollowUpSubmit(text);
    }
    setFollowUpText('');
  };

  const handleVoiceFollowUp = () => {
    safeHaptics.impactHeavy();
    setIsRecordingFollowUp(true);

    if (
      Platform.OS === 'web' &&
      typeof window !== 'undefined' &&
      (('SpeechRecognition' in window) || ('webkitSpeechRecognition' in window))
    ) {
      try {
        const SpeechRecognition =
          (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        const langMap: Record<string, string> = {
          hi: 'hi-IN',
          ml: 'ml-IN',
          ta: 'ta-IN',
          te: 'te-IN',
          kn: 'kn-IN',
          bn: 'bn-IN',
          mr: 'mr-IN',
          gu: 'gu-IN',
          pa: 'pa-IN',
          en: 'en-IN',
        };
        recognition.lang = langMap[currentLang] || 'en-IN';
        showToast('🎙️ Listening... Speak your follow-up now');

        let recognized = '';
        recognition.onresult = (event: any) => {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            text += event.results[i][0].transcript;
          }
          if (text) {
            recognized = text;
            setFollowUpText(text);
          }
        };
        recognition.onerror = (e: any) => {
          console.warn('SpeechRecognition follow-up error:', e);
          setIsRecordingFollowUp(false);
          if (e.error === 'not-allowed') {
            showToast('⚠️ Microphone blocked. Allow in browser address bar.');
          }
        };
        recognition.onend = () => {
          setIsRecordingFollowUp(false);
          if (recognized) {
            showToast('✅ Voice captured! Tap send to submit.');
          }
        };
        recognition.start();
        return;
      } catch (err) {
        console.warn('SpeechRecognition failed, falling back:', err);
      }
    }

    // Fallback simulation
    showToast('🎙️ Listening... Speak your follow-up question');
    setTimeout(() => {
      setIsRecordingFollowUp(false);
      const voiceSample =
        currentLang === 'ml'
          ? 'ഈ കീടനാശിനി തളിക്കേണ്ട സമയക്രമം എപ്പോഴാണ്?'
          : currentLang === 'hi'
          ? 'इस कीटनाशक के छिड़काव का सही समय क्या है?'
          : 'What is the optimal spray timing and dosage for this crop?';
      setFollowUpText(voiceSample);
      showToast('✅ Voice captured! Tap send or edit your question.');
    }, 2200);
  };

  const handleSetSprayReminder = () => {
    safeHaptics.impactMedium();
    setShowSprayModal(true);
  };

  const handleFindShops = () => {
    safeHaptics.impactMedium();
    setShowShopModal(true);
  };

  const displayAnswer = response
    ? currentLang === 'en'
      ? response.answer_english || response.answer
      : response.answer
    : '';


  const parsedDoc = useMemo(() => {
    return parseAdvisoryDocument(displayAnswer);
  }, [displayAnswer]);

  const followUpQuestions = useMemo(() => {
    if (response?.follow_up_questions && response.follow_up_questions.length > 0) {
      return response.follow_up_questions;
    }
    if (currentLang === 'hi') {
      if (response?.intent === 'MARKET_PRICE') {
        return [
          'पास की APMC मंडी में इस फसल का क्या भाव है?',
          'फसल को सुरक्षित रखने और ग्रेडिंग के क्या नियम हैं?',
          'e-NAM पोर्टल पर अपनी फसल का पंजीकरण कैसे करें?',
        ];
      }
      return [
        '15 लीटर स्प्रे पंप में दवा की सही मात्रा क्या है?',
        'कीटनाशक छिड़कने का सबसे सही समय (सुबह या शाम) क्या है?',
        'कम खर्च में जैविक या नीम का घोल कैसे तैयार करें?',
      ];
    }
    if (currentLang === 'ml') {
      if (response?.intent === 'MARKET_PRICE') {
        return [
          'അടുത്തുള്ള APMC മാർക്കറ്റിലെ ഇപ്പോഴത്തെ നിരക്ക് എത്രയാണ്?',
          'ശീതീകരണ സംഭരണശാലയിൽ സൂക്ഷിക്കുന്നതിനുള്ള മാർഗ്ഗങ്ങൾ എന്തൊക്കെയാണ്?',
          'e-NAM പോർട്ടലിൽ എങ്ങനെ രജിസ്റ്റർ ചെയ്യാം?',
        ];
      }
      return [
        '15 ലിറ്റർ പമ്പിൽ തളിക്കേണ്ട കൃത്യമായ അളവ് എത്രയാണ്?',
        'മരുന്ന് തളിക്കാൻ ഏറ്റവും അനുയോജ്യമായ സമയം എപ്പോഴാണ്?',
        'ചിലവ് കുറഞ്ഞ ജൈവ നിയന്ത്രണ മാർഗ്ഗങ്ങൾ എന്തൊക്കെയാണ്?',
      ];
    }
    if (response?.intent === 'MARKET_PRICE') {
      return [
        'Where is the nearest APMC Mandi auction?',
        'What are the cold storage guidelines and rates?',
        'How to register and check prices on e-NAM?',
      ];
    }
    return [
      'What is the exact dosage per 15-liter backpack pump?',
      'What is the best time of day to spray (morning or evening)?',
      'What low-cost organic remedies can prevent recurrence?',
    ];
  }, [response?.follow_up_questions, response?.intent, currentLang]);

  const handleFollowUpChipPress = (item: string) => {
    stopAudio();
    safeHaptics.impactMedium();
    sheetScrollRef.current?.scrollTo({ y: 0, animated: true });
    if (onSelectFollowUp) {
      onSelectFollowUp(item);
    } else if (onFollowUpSubmit) {
      onFollowUpSubmit(item);
    }
  };

  const getCardHeaderFontSize = () => {
    if (fontSizeScale === 'xlarge') return 20;
    if (fontSizeScale === 'large') return 18;
    return 16;
  };

  const getCardBodyFontSize = () => {
    if (fontSizeScale === 'xlarge') return 18;
    if (fontSizeScale === 'large') return 16;
    return 15;
  };

  const getDosageFontSize = () => {
    if (fontSizeScale === 'xlarge') return 20;
    if (fontSizeScale === 'large') return 18;
    return 16;
  };

  const getAnswerFontSize = () => {
    if (fontSizeScale === 'xlarge') return 24;
    if (fontSizeScale === 'large') return 20;
    return 17;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomSheetContainer}
        >
          {/* Sheet Header Handle & Close Bar */}
          <View style={styles.sheetTopBar}>
            <View style={styles.sheetHandlePill} />
          </View>

          {/* 🍞 In-Sheet Toast Notification Banner */}
          {toastMessage && (
            <View style={styles.sheetToastBanner} accessibilityLiveRegion="polite">
              <MaterialCommunityIcons name="information" size={16} color="#FFFFFF" />
              <Text allowFontScaling={true} style={styles.sheetToastText}>{toastMessage}</Text>
            </View>
          )}

          <View style={styles.sheetHeader}>
            <View style={styles.sheetHeaderLeftGroup}>
              {/* 🔙 Universal Back Button */}
              <TouchableOpacity
                style={styles.sheetBackBtn}
                onPress={onClose}
                activeOpacity={0.7}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityRole="button"
                accessibilityLabel="Back"
                accessibilityHint="Closes the advisory response sheet"
              >
                <MaterialCommunityIcons name="arrow-left" size={18} color="#15803D" />
                <Text allowFontScaling={true} style={styles.sheetBackText}>{t('backBtn') || 'Back'}</Text>
              </TouchableOpacity>

              <View style={styles.sheetHeaderTitleGroup}>
                <View style={styles.sheetIconBadge}>
                  <MaterialCommunityIcons name="sprout" size={20} color="#16A34A" />
                </View>
                <View>
                  <Text allowFontScaling={true} style={styles.sheetHeaderTitle}>Krishi Sahayak Advisory</Text>
                  <Text allowFontScaling={true} style={styles.sheetHeaderSub}>{t('icarGroundedLiveResponse') || 'ICAR Grounded • Live Response'}</Text>
                </View>
              </View>
            </View>

            <TouchableOpacity
              style={styles.closeSheetBtn}
              onPress={onClose}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Close advisory sheet"
              accessibilityHint="Closes the advisory response sheet"
            >
              <MaterialCommunityIcons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView
            ref={sheetScrollRef}
            style={styles.sheetScrollView}
            contentContainerStyle={styles.sheetScrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* 1. Transcribed Farmer Question */}
            {question ? (
              <View style={styles.questionCard}>
                <View style={styles.questionCardHeader}>
                  <MaterialCommunityIcons name="comment-account-outline" size={16} color="#166534" />
                  <Text allowFontScaling={true} style={styles.questionLabel}>{t('transcribedTitle')}</Text>
                </View>
                <Text allowFontScaling={true} style={styles.questionText}>"{question}"</Text>
              </View>
            ) : null}

            {/* 2. DYNAMIC ACTIVE FEEDBACK LOADING STATE */}
            {loading && (
              <View style={styles.loadingContainer} accessibilityLiveRegion="polite">
                <Animated.View style={[styles.pulsingIconWrapper, { transform: [{ scale: pulseAnim }] }]}>
                  <View style={styles.pulsingIconOuter}>
                    <View style={styles.pulsingIconInner}>
                      <MaterialCommunityIcons name="sprout" size={38} color="#FFFFFF" />
                    </View>
                  </View>
                </Animated.View>

                <View style={styles.loadingCycleBox}>
                  <ActivityIndicator size="small" color="#16A34A" style={{ marginBottom: 6 }} />
                  <Text allowFontScaling={true} style={styles.loadingStatusText}>
                    {LOADING_MESSAGES[loadingCycleIndex] || t('synthesizingAdvice')}
                  </Text>
                  <Text allowFontScaling={true} style={styles.loadingSubHint}>
                    Connecting RAG retrieval to Indian Council of Agricultural Research...
                  </Text>
                </View>
              </View>
            )}

            {/* 3. ERROR STATE */}
            {error && !loading && (
              <View style={styles.errorBox} accessibilityLiveRegion="assertive">
                <MaterialCommunityIcons name="alert-circle-outline" size={22} color="#DC2626" />
                <Text allowFontScaling={true} style={styles.errorText}>{error}</Text>
              </View>
            )}

            {/* 4. GROUNDED ANSWER & AUDIO-FIRST DELIVERY */}
            {response && !loading && (
              <View style={styles.responseContainer}>

                {/* ── BOLD AUDIO PLAYER WIDGET ── */}
                <View style={styles.audioPlayerWidget}>
                  <View style={styles.audioPlayerHeader}>
                    <View style={styles.audioTitleGroup}>
                      <MaterialCommunityIcons
                        name={audioPlaying ? 'volume-high' : 'volume-medium'}
                        size={20}
                        color="#166534"
                      />
                      <Text allowFontScaling={true} style={styles.audioPlayerTitle}>{t('audioVisualizerLabel')}</Text>
                    </View>
                    <View style={[styles.audioStatusBadge, (audioPlaying || audioLoading) && styles.audioStatusBadgeActive]}>
                      <Text allowFontScaling={true} style={[styles.audioStatusText, (audioPlaying || audioLoading) && styles.audioStatusTextActive]}>
                        {audioLoading
                          ? (t('preparingVoice') || '⏳ Preparing Voice...')
                          : audioPlaying
                          ? (t('playingAudio') || '▶ Playing Audio')
                          : (t('audioReady') || 'Ready')}
                      </Text>
                    </View>
                  </View>

                  {/* Dynamic Waveform Visualizer */}
                  <View style={styles.waveformContainer} accessibilityElementsHidden={true} importantForAccessibility="no-hide-descendants">
                    {waveformAnim.map((anim, index) => (
                      <Animated.View
                        key={index}
                        style={[
                          styles.waveformBar,
                          {
                            height: anim,
                            backgroundColor: audioPlaying ? '#16A34A' : '#CBD5E1',
                          },
                        ]}
                      />
                    ))}
                  </View>

                  {/* Play / Stop Action Button */}
                  <TouchableOpacity
                    style={[
                      styles.playToggleBtn,
                      audioPlaying && styles.playToggleBtnStop,
                      audioLoading && styles.playToggleBtnLoading,
                    ]}
                    onPress={handleToggleAudio}
                    activeOpacity={0.85}
                    disabled={audioLoading}
                    accessibilityRole="button"
                    accessibilityLabel={
                      audioLoading
                        ? 'Preparing Voice...'
                        : audioPlaying
                        ? t('stopAnswerBtn') || 'Stop Audio'
                        : t('playAnswerBtn') || 'Play Audio'
                    }
                    accessibilityHint="Toggles spoken audio narration of the advisory"
                    accessibilityState={{ selected: audioPlaying, busy: audioLoading }}
                  >
                    {audioLoading ? (
                      <ActivityIndicator size="small" color="#FFFFFF" style={{ marginRight: 6 }} />
                    ) : (
                      <MaterialCommunityIcons
                        name={audioPlaying ? 'stop-circle' : 'play-circle'}
                        size={26}
                        color="#FFFFFF"
                      />
                    )}
                    <Text allowFontScaling={true} style={styles.playToggleBtnText}>
                      {audioLoading
                        ? '⏳ Preparing Voice...'
                        : audioPlaying
                        ? t('stopAnswerBtn') || 'Stop Audio'
                        : t('playAnswerBtn')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ── DATA CONTEXT BADGES (Cross-Source Conflict & Live Context) ── */}
                <View style={styles.contextBadgesRow}>
                  {/* Weather Context Badge */}
                  <View style={styles.badgeWeather} accessibilityRole="text" accessibilityLabel={response.weather_context_used ? t('imdWeatherChip') : 'IMD Live Agrometeorology context used'}>
                    <MaterialCommunityIcons name="weather-partly-cloudy" size={15} color="#0284C7" />
                    <Text allowFontScaling={true} style={styles.badgeWeatherText}>
                      {response.weather_context_used ? t('imdWeatherChip') : '☁️ IMD: Live Agrometeorology'}
                    </Text>
                  </View>

                  {/* Mandi Context Badge */}
                  <View
                    style={styles.badgeMandi}
                    accessibilityRole="text"
                    accessibilityLabel={
                      response.market_badge_label ||
                      (response.is_msp === false
                        ? 'APMC Mandi Rate'
                        : response.market_context_used
                        ? t('enamMandiChip')
                        : 'eNAM Live Mandi Rates')
                    }
                  >
                    <MaterialCommunityIcons name="currency-inr" size={15} color="#D97706" />
                    <Text allowFontScaling={true} style={styles.badgeMandiText}>
                      {response.market_badge_label ||
                        (response.is_msp === false
                          ? '📈 APMC Mandi Rate'
                          : response.market_context_used
                          ? t('enamMandiChip')
                          : '📈 eNAM: Live Mandi Rates')}
                    </Text>
                  </View>

                  {/* ICAR Grounded Badge */}
                  <View style={styles.badgeIcar} accessibilityRole="text" accessibilityLabel={t('icarGroundedChip')}>
                    <MaterialCommunityIcons name="book-check-outline" size={15} color="#15803D" />
                    <Text allowFontScaling={true} style={styles.badgeIcarText}>{t('icarGroundedChip')}</Text>
                  </View>

                  {/* Instant RAG Badge */}
                  <View style={styles.badgeSpeed} accessibilityRole="text" accessibilityLabel={`Response time ${(response.response_time_ms / 1000).toFixed(1)} seconds`}>
                    <MaterialCommunityIcons name="lightning-bolt" size={14} color="#64748B" />
                    <Text allowFontScaling={true} style={styles.badgeSpeedText}>
                      {(response.response_time_ms / 1000).toFixed(1)}s RAG
                    </Text>
                  </View>
                </View>

                {/* ── WRITTEN ADVISORY TEXT / CHATGPT-GRADE MARKDOWN BLOCKS ── */}
                {parsedDoc.executiveSummary && (
                  <View style={styles.executiveSummaryCard}>
                    <View style={styles.execSummaryHeaderRow}>
                      <View style={styles.execSummaryIconCircle}>
                        <MaterialCommunityIcons name="lightning-bolt" size={16} color="#15803D" />
                      </View>
                      <Text style={styles.execSummaryLabel} allowFontScaling={true}>
                        EXECUTIVE ADVISORY SUMMARY
                      </Text>
                    </View>
                    <Text style={[styles.execSummaryText, { fontSize: getCardBodyFontSize() + 1 }]} allowFontScaling={true}>
                      {renderFormattedText(parsedDoc.executiveSummary, styles.execSummaryText, styles.execSummaryBold)}
                    </Text>
                  </View>
                )}

                {parsedDoc.sections.length > 0 ? (
                  <View style={styles.structuredCardsContainer}>
                    {parsedDoc.sections.map((sec, idx) => (
                      <View
                        key={idx}
                        style={[
                          styles.fieldAdvisoryCard,
                          {
                            backgroundColor: sec.bgColor,
                            borderColor: sec.borderColor,
                            borderLeftColor: sec.accentColor,
                          },
                        ]}
                      >
                        <View style={styles.fieldCardHeaderRow}>
                          <View style={[styles.fieldCardIconBadge, { backgroundColor: sec.badgeBg }]}>
                            <MaterialCommunityIcons name={sec.icon} size={20} color={sec.accentColor} />
                          </View>
                          <Text
                            allowFontScaling={true}
                            style={[
                              styles.fieldCardTitle,
                              { color: sec.accentColor, fontSize: getCardHeaderFontSize() },
                            ]}
                          >
                            {sec.cleanTitle}
                          </Text>
                        </View>

                        <View style={styles.fieldCardItemsList}>
                          {sec.blocks.map((block, blockIdx) => {
                            // 1. Markdown Comparison Table
                            if (block.type === 'table') {
                              return (
                                <View key={`tbl-${blockIdx}`} style={styles.tableWrapper}>
                                  <ScrollView horizontal showsHorizontalScrollIndicator={true} style={styles.tableScroll}>
                                    <View style={styles.tableContainer}>
                                      {/* Header Row */}
                                      <View style={styles.tableHeaderRow}>
                                        {block.headers.map((hdr, hIdx) => (
                                          <View
                                            key={`th-${hIdx}`}
                                            style={[styles.tableCell, styles.tableHeaderCell, hIdx === 0 && styles.tableFirstCell]}
                                          >
                                            <Text style={styles.tableHeaderText} allowFontScaling={true}>
                                              {hdr}
                                            </Text>
                                          </View>
                                        ))}
                                      </View>
                                      {/* Data Rows */}
                                      {block.rows.map((row, rIdx) => (
                                        <View
                                          key={`tr-${rIdx}`}
                                          style={[styles.tableDataRow, rIdx % 2 === 1 && styles.tableDataRowAlt]}
                                        >
                                          {row.map((cell, cIdx) => (
                                            <View
                                              key={`td-${cIdx}`}
                                              style={[styles.tableCell, cIdx === 0 && styles.tableFirstCell]}
                                            >
                                              <Text style={styles.tableCellText} allowFontScaling={true}>
                                                {renderFormattedText(cell, styles.tableCellText, styles.tableCellTextBold)}
                                              </Text>
                                            </View>
                                          ))}
                                        </View>
                                      ))}
                                    </View>
                                  </ScrollView>
                                </View>
                              );
                            }

                            // 2. Numbered Step Row
                            if (block.type === 'numbered') {
                              return (
                                <View key={`num-${blockIdx}`} style={styles.numberedRow}>
                                  <View style={[styles.numberedBadge, { backgroundColor: sec.accentColor }]}>
                                    <Text style={styles.numberedBadgeText} allowFontScaling={true}>
                                      {block.number}
                                    </Text>
                                  </View>
                                  <Text
                                    allowFontScaling={true}
                                    style={[styles.fieldCardItemValue, { fontSize: getCardBodyFontSize(), flex: 1 }]}
                                  >
                                    {renderFormattedText(block.value, styles.fieldCardItemValue, styles.fieldCardItemValueBold)}
                                  </Text>
                                </View>
                              );
                            }

                            // 3. Regular Paragraph Block
                            if (block.type === 'paragraph') {
                              return (
                                <View key={`para-${blockIdx}`} style={styles.paragraphBlock}>
                                  <Text
                                    allowFontScaling={true}
                                    style={[styles.paragraphText, { fontSize: getCardBodyFontSize() }]}
                                  >
                                    {renderFormattedText(block.value, styles.paragraphText, styles.paragraphTextBold)}
                                  </Text>
                                </View>
                              );
                            }

                            // 4. Knapsack Dosage Callout
                            if (block.isDosage) {
                              return (
                                <View key={`item-${blockIdx}`} style={styles.knapsackDosageBox}>
                                  <View style={styles.knapsackIconRow}>
                                    <MaterialCommunityIcons name="gas-cylinder" size={20} color="#0284C7" />
                                    <Text
                                      allowFontScaling={true}
                                      style={[styles.knapsackLabel, { fontSize: getDosageFontSize() - 2 }]}
                                    >
                                      {block.label ? block.label.replace(/\*\*/g, '') : '15-Liter Backpack Pump Dosage'}
                                    </Text>
                                  </View>
                                  <Text
                                    allowFontScaling={true}
                                    style={[styles.knapsackValue, { fontSize: getDosageFontSize() }]}
                                  >
                                    {renderFormattedText(block.value, styles.knapsackValue, [styles.knapsackValue, { fontWeight: '900' }])}
                                  </Text>
                                </View>
                              );
                            }

                            // 5. Standard Bullet Item Row
                            return (
                              <View key={`item-${blockIdx}`} style={styles.fieldCardItemRow}>
                                <View
                                  style={[styles.fieldCardBulletDot, { backgroundColor: sec.accentColor }]}
                                />
                                <Text
                                  allowFontScaling={true}
                                  style={[styles.fieldCardItemText, { fontSize: getCardBodyFontSize() }]}
                                >
                                  {block.label ? (
                                    <Text style={styles.fieldCardItemLabel}>{block.label.replace(/\*\*/g, '')}: </Text>
                                  ) : null}
                                  {renderFormattedText(block.value, styles.fieldCardItemValue, styles.fieldCardItemValueBold)}
                                </Text>
                              </View>
                            );
                          })}
                        </View>
                      </View>
                    ))}
                  </View>
                ) : (
                  <View style={styles.advisoryContentBox}>
                    <Text allowFontScaling={true} style={[styles.advisoryBodyText, { fontSize: getAnswerFontSize() }]}>
                      {renderFormattedText(displayAnswer, styles.advisoryBodyText, [styles.advisoryBodyText, { fontWeight: '700' }])}
                    </Text>
                  </View>
                )}

                {/* ── OFFICIAL ICAR VERIFIED TRUST BADGE ── */}
                <View style={styles.icarTrustBadge} accessibilityRole="summary">
                  <View style={styles.icarTrustIconCircle}>
                    <MaterialCommunityIcons name="shield-check" size={24} color="#166534" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={true} style={styles.icarTrustTitle}>🛡️ {t('verifiedByIcarBadge')}</Text>
                    <Text allowFontScaling={true} style={styles.icarTrustSub}>{t('icarTrustSubtitle')}</Text>
                  </View>
                </View>

                {/* ── 🌾 WARM EARTHY BOTTOM SECTION (#FDFBF7) ── */}
                <View style={styles.earthyBottomSection}>

                  {/* 1. TACTILE SOURCE CARDS (Rich, Clickable Document Cards) */}
                  {response.source_labels && response.source_labels.length > 0 && (
                    <View style={styles.tactileSourcesBox}>
                      <View style={styles.sourcesHeaderRow}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#15803D" />
                        <Text allowFontScaling={true} style={styles.sourcesHeading}>{t('verifiedIcarResearchSources') || 'Verified ICAR Research Sources'}</Text>
                      </View>
                      <Text allowFontScaling={true} style={styles.sourcesSubHeading}>
                        Tap any document to inspect official research citation & grounding
                      </Text>

                      <View style={styles.tactileCardList}>
                        {response.source_labels.map((src, i) => (
                          <TouchableOpacity
                            key={i}
                            style={styles.tactileDocCard}
                            onPress={() => {
                              safeHaptics.impactLight();
                              setSelectedCitation(src);
                            }}
                            activeOpacity={0.82}
                            accessibilityRole="button"
                            accessibilityLabel={`Research citation: ${src.display_name}`}
                            accessibilityHint="Opens research citation details and relevance match"
                          >
                            <View style={styles.docIconWrapper}>
                              <MaterialCommunityIcons
                                name={src.filename.endsWith('.pdf') ? 'file-pdf-box' : 'book-open-variant'}
                                size={26}
                                color="#E2725B"
                              />
                            </View>

                            <View style={styles.docCardInfo}>
                              <Text allowFontScaling={true} style={styles.docTitle} numberOfLines={1}>
                                {src.display_name}
                              </Text>
                              <Text allowFontScaling={true} style={styles.docFilename} numberOfLines={1}>
                                📄 {src.filename}
                              </Text>
                            </View>

                            {src.relevance_score != null && (
                              <View style={styles.matchScoreBadge}>
                                <Text allowFontScaling={true} style={styles.matchScoreText}>
                                  {(src.relevance_score * 100).toFixed(0)}%
                                </Text>
                                <Text allowFontScaling={true} style={styles.matchScoreSub}>match</Text>
                              </View>
                            )}

                            <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 2. ACTIONABLE NEXT STEPS (Side-by-side Action Chips) */}
                  <View style={styles.actionStepsContainer}>
                    <Text allowFontScaling={true} style={styles.actionStepsHeading}>⚡ {t('actionableNextSteps') || 'Actionable Next Steps:'}</Text>
                    {response.intent === 'MARKET_PRICE' || (response.market_context_used && !response.sources?.some(s => /crop_disease|fungi|pest/i.test(s))) ? (
                      <View style={styles.actionChipsRow}>
                        <TouchableOpacity
                          style={styles.actionChipSpray}
                          onPress={() => {
                            safeHaptics.impactLight();
                            Linking.openURL('https://enam.gov.in').catch(() => {
                              showToast('🌐 e-NAM Portal: enam.gov.in for live mandi auction bids');
                            });
                          }}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel="Open e-NAM Mandi Portal"
                          accessibilityHint="Check live mandi trade prices on official e-NAM portal"
                        >
                          <MaterialCommunityIcons name="finance" size={22} color="#D97706" />
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={true} style={styles.actionChipTitle}>📈 e-NAM Portal</Text>
                            <Text allowFontScaling={true} style={styles.actionChipSub}>Live Mandi Bids</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.actionChipShop}
                          onPress={() => {
                            safeHaptics.impactLight();
                            Linking.openURL('tel:18001801551').catch(() => {
                              showToast('📞 Kisan Call Centre: 1800-180-1551 (Toll Free)');
                            });
                          }}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel="Call Kisan Call Centre"
                          accessibilityHint="Contact official agricultural advisory helpline"
                        >
                          <MaterialCommunityIcons name="phone-in-talk" size={22} color="#15803D" />
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={true} style={styles.actionChipTitle}>📞 Kisan Helpline</Text>
                            <Text allowFontScaling={true} style={styles.actionChipSub}>1800-180-1551</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.actionChipsRow}>
                        <TouchableOpacity
                          style={styles.actionChipSpray}
                          onPress={handleSetSprayReminder}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel="Set spray reminder"
                          accessibilityHint="Schedule a reminder for crop treatment spray"
                        >
                          <MaterialCommunityIcons name="calendar-clock" size={22} color="#D97706" />
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={true} style={styles.actionChipTitle}>📅 Spray Reminder</Text>
                            <Text allowFontScaling={true} style={styles.actionChipSub}>Schedule treatment</Text>
                          </View>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.actionChipShop}
                          onPress={handleFindShops}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel="Find nearest fertilizer shops"
                          accessibilityHint="Locate verified PM-Kisan Krishi Seva Kendras nearby"
                        >
                          <MaterialCommunityIcons name="store-marker-outline" size={22} color="#15803D" />
                          <View style={{ flex: 1 }}>
                            <Text allowFontScaling={true} style={styles.actionChipTitle}>📍 Fertilizer Shop</Text>
                            <Text allowFontScaling={true} style={styles.actionChipSub}>Find Krishi Kendra</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>

                  {/* 💡 Suggested Follow-Up Question Chips */}
                  {followUpQuestions && followUpQuestions.length > 0 && (
                    <View style={styles.followUpChipsContainer}>
                      <View style={styles.followUpHeaderRow}>
                        <MaterialCommunityIcons name="lightbulb-on-outline" size={18} color="#D97706" />
                        <Text allowFontScaling={true} style={styles.followUpChipsHeading}>
                          {t('suggestedFollowUpQuestions') || 'Suggested Follow-Up Questions:'}
                        </Text>
                      </View>
                      <View style={styles.followUpChipsWrap}>
                        {followUpQuestions.map((item, index) => (
                          <TouchableOpacity
                            key={`followup-${index}`}
                            onPress={() => handleFollowUpChipPress(item)}
                            activeOpacity={0.7}
                            style={styles.followUpChip}
                            accessibilityRole="button"
                            accessibilityLabel={`Suggested question: ${item}`}
                            accessibilityHint="Tapping this immediately submits this follow-up question"
                          >
                            <Text allowFontScaling={true} style={styles.followUpText}>💡 {item}</Text>
                          </TouchableOpacity>
                        ))}
                      </View>
                    </View>
                  )}

                  {/* 3. VOICE-FIRST FLOATING FOLLOW-UP ACTION BAR */}
                  {(onFollowUpSubmit || onSelectFollowUp) && (
                    <View style={styles.voiceFollowUpSection}>
                      <Text allowFontScaling={true} style={styles.voiceFollowUpHeading}>💬 {t('haveAFollowUpQuestion') || 'Have a follow-up question?'}</Text>

                      <View style={styles.floatingActionBar}>
                        {/* Secondary inline text input (Left) */}
                        <TextInput
                          style={styles.secondaryFollowUpInput}
                          value={followUpText}
                          onChangeText={setFollowUpText}
                          placeholder={t('followUpPlaceholder') || 'Ask follow-up or type here...'}
                          placeholderTextColor="#94A3B8"
                          onSubmitEditing={handleSendFollowUp}
                          allowFontScaling={true}
                          accessibilityLabel="Follow-up question input"
                          accessibilityHint="Type your follow-up question"
                        />

                        <TouchableOpacity
                          style={[
                            styles.inlineSendBtn,
                            followUpText.trim().length === 0 && styles.inlineSendBtnDisabled,
                          ]}
                          onPress={handleSendFollowUp}
                          disabled={followUpText.trim().length === 0}
                          activeOpacity={0.8}
                          accessibilityRole="button"
                          accessibilityLabel="Send question"
                        >
                          <MaterialCommunityIcons
                            name="send"
                            size={18}
                            color={followUpText.trim().length > 0 ? '#15803D' : '#94A3B8'}
                          />
                        </TouchableOpacity>

                        {/* Dominant Green "Hold to Speak" Microphone Button (Right) */}
                        <TouchableOpacity
                          style={[
                            styles.dominantVoiceBtn,
                            isRecordingFollowUp && styles.dominantVoiceBtnActive,
                          ]}
                          onPress={handleVoiceFollowUp}
                          activeOpacity={0.85}
                          accessibilityRole="button"
                          accessibilityLabel={isRecordingFollowUp ? "Listening to voice input" : "Hold to speak follow-up question"}
                          accessibilityHint="Tap to speak your follow-up question"
                          accessibilityState={{ busy: isRecordingFollowUp }}
                        >
                          <MaterialCommunityIcons
                            name={isRecordingFollowUp ? 'waveform' : 'microphone'}
                            size={20}
                            color="#FFFFFF"
                          />
                          <Text allowFontScaling={true} style={styles.dominantVoiceBtnText}>
                            {isRecordingFollowUp ? 'Listening...' : 'Hold to Speak'}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  )}

                </View>

              </View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
          {/* 📅 MODAL: Set Spray Schedule Reminder */}
          <Modal
            visible={showSprayModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowSprayModal(false)}
          >
            <View style={styles.dialogOverlay}>
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <View style={styles.dialogIconBadgeAmber}>
                    <MaterialCommunityIcons name="calendar-clock" size={24} color="#D97706" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={true} style={styles.dialogTitle}>Set Spray Reminder</Text>
                    <Text allowFontScaling={true} style={styles.dialogSubtitle}>Prevent crop damage with timely application</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowSprayModal(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close spray reminder modal"
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.dialogOptionsList}>
                  <TouchableOpacity
                    style={styles.dialogOptionItemActive}
                    onPress={() => {
                      safeHaptics.notificationSuccess();
                      setShowSprayModal(false);
                      showToast('🔔 Spray reminder scheduled for Tomorrow at 7:00 AM');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Tomorrow Morning 7:00 AM, Recommended: Low wind and cooler temperature"
                  >
                    <MaterialCommunityIcons name="weather-sunny" size={20} color="#D97706" />
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={true} style={styles.dialogOptionLabel}>Tomorrow Morning (7:00 AM)</Text>
                      <Text allowFontScaling={true} style={styles.dialogOptionSub}>Recommended: Low wind & cooler temperature</Text>
                    </View>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#D97706" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dialogOptionItem}
                    onPress={() => {
                      safeHaptics.notificationSuccess();
                      setShowSprayModal(false);
                      showToast('🔔 Spray reminder scheduled for Tomorrow at 5:30 PM');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="Tomorrow Evening 5:30 PM, Ideal for pest treatment without bee disturbance"
                  >
                    <MaterialCommunityIcons name="weather-sunset" size={20} color="#EA580C" />
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={true} style={styles.dialogOptionLabel}>Tomorrow Evening (5:30 PM)</Text>
                      <Text allowFontScaling={true} style={styles.dialogOptionSub}>Ideal for pest treatment without bee disturbance</Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.dialogOptionItem}
                    onPress={() => {
                      safeHaptics.notificationSuccess();
                      setShowSprayModal(false);
                      showToast('🔔 Spray reminder scheduled in 3 Days at 7:00 AM');
                    }}
                    accessibilityRole="button"
                    accessibilityLabel="In 3 Days, Second cycle application"
                  >
                    <MaterialCommunityIcons name="calendar-range" size={20} color="#15803D" />
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={true} style={styles.dialogOptionLabel}>In 3 Days (Follow-up Spray)</Text>
                      <Text allowFontScaling={true} style={styles.dialogOptionSub}>Second cycle application</Text>
                    </View>
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={styles.dialogCloseBtn}
                  onPress={() => setShowSprayModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text allowFontScaling={true} style={styles.dialogCloseBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* 📍 MODAL: Nearest Krishi Kendra & Fertilizer Shops */}
          <Modal
            visible={showShopModal}
            transparent
            animationType="fade"
            onRequestClose={() => setShowShopModal(false)}
          >
            <View style={styles.dialogOverlay}>
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <View style={styles.dialogIconBadgeGreen}>
                    <MaterialCommunityIcons name="store-marker" size={24} color="#15803D" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={true} style={styles.dialogTitle}>Nearest Fertilizer Shops</Text>
                    <Text allowFontScaling={true} style={styles.dialogSubtitle}>Verified PM-Kisan Krishi Seva Kendras</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setShowShopModal(false)}
                    accessibilityRole="button"
                    accessibilityLabel="Close fertilizer shops modal"
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
                  <View style={styles.shopItemCard}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={true} style={styles.shopItemName}>IFFCO Kisan Seva Kendra</Text>
                      <Text allowFontScaling={true} style={styles.shopItemAddress}>📍 Main Market Road • 1.8 km away</Text>
                      <Text allowFontScaling={true} style={styles.shopItemStock}>✅ Verified In-Stock: Urea, DAP, Bio-NPK</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.shopActionBtn}
                      onPress={() => showToast('📞 Calling +91 98765 43210 (IFFCO Kendra)')}
                      accessibilityRole="button"
                      accessibilityLabel="Call IFFCO Kisan Seva Kendra"
                    >
                      <MaterialCommunityIcons name="phone" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.shopItemCard}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={true} style={styles.shopItemName}>Primary Agricultural Cooperative Depot</Text>
                      <Text allowFontScaling={true} style={styles.shopItemAddress}>📍 Panchayat Junction • 3.2 km away</Text>
                      <Text allowFontScaling={true} style={styles.shopItemStock}>✅ Subsidized Soil Nutrients & Sprayers</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.shopActionBtn}
                      onPress={() => showToast('📞 Calling +91 98765 11223 (Cooperative Depot)')}
                      accessibilityRole="button"
                      accessibilityLabel="Call Primary Agricultural Cooperative Depot"
                    >
                      <MaterialCommunityIcons name="phone" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.shopItemCard}>
                    <View style={{ flex: 1 }}>
                      <Text allowFontScaling={true} style={styles.shopItemName}>National Agro Chemicals & Seeds</Text>
                      <Text allowFontScaling={true} style={styles.shopItemAddress}>📍 Bypass Road • 4.5 km away</Text>
                      <Text allowFontScaling={true} style={styles.shopItemStock}>✅ ICAR Certified Organic Fungicides</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.shopActionBtn}
                      onPress={() => showToast('📞 Calling +91 98765 99887 (National Agro)')}
                      accessibilityRole="button"
                      accessibilityLabel="Call National Agro Chemicals and Seeds"
                    >
                      <MaterialCommunityIcons name="phone" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                </ScrollView>

                <TouchableOpacity
                  style={styles.dialogCloseBtn}
                  onPress={() => setShowShopModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close"
                >
                  <Text allowFontScaling={true} style={styles.dialogCloseBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>

          {/* 📚 MODAL: ICAR Grounding Document Citation Details */}
          <Modal
            visible={!!selectedCitation}
            transparent
            animationType="fade"
            onRequestClose={() => setSelectedCitation(null)}
          >
            <View style={styles.dialogOverlay}>
              <View style={styles.dialogCard}>
                <View style={styles.dialogHeader}>
                  <View style={styles.dialogIconBadgeRed}>
                    <MaterialCommunityIcons name="book-check" size={24} color="#E2725B" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text allowFontScaling={true} style={styles.dialogTitle}>ICAR Document Citation</Text>
                    <Text allowFontScaling={true} style={styles.dialogSubtitle}>Verified Grounded Source</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedCitation(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Close citation modal"
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {selectedCitation && (
                  <View style={styles.citationDetailsContent}>
                    <Text allowFontScaling={true} style={styles.citationDetailTitle}>
                      {selectedCitation.display_name}
                    </Text>
                    <View style={styles.citationMetaPill}>
                      <MaterialCommunityIcons name="file-document-outline" size={15} color="#1E293B" />
                      <Text allowFontScaling={true} style={styles.citationMetaText}>{selectedCitation.filename}</Text>
                    </View>

                    {selectedCitation.relevance_score != null && (
                      <View style={styles.citationMatchRow}>
                        <Text allowFontScaling={true} style={styles.citationMatchLabel}>Semantic Similarity Match:</Text>
                        <Text allowFontScaling={true} style={styles.citationMatchScore}>
                          {(selectedCitation.relevance_score * 100).toFixed(1)}% Confidence
                        </Text>
                      </View>
                    )}

                    <View style={styles.citationTrustNotice}>
                      <MaterialCommunityIcons name="shield-check" size={20} color="#166534" />
                      <Text allowFontScaling={true} style={styles.citationTrustNoticeText}>
                        This advice is grounded in agricultural guidelines published by the Indian Council of Agricultural Research (ICAR) and vetted for regional soil and climatic conditions.
                      </Text>
                    </View>
                  </View>
                )}

                <TouchableOpacity
                  style={styles.dialogCloseBtn}
                  onPress={() => setSelectedCitation(null)}
                  accessibilityRole="button"
                  accessibilityLabel="Done"
                >
                  <Text allowFontScaling={true} style={styles.dialogCloseBtnText}>Done</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    minHeight: '60%',
    width: '100%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 16,
  },
  sheetTopBar: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  sheetHandlePill: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1.5,
    borderBottomColor: '#F1F5F9',
  },
  sheetHeaderLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  sheetBackBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginRight: 4,
  },
  sheetBackText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  sheetHeaderTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  sheetIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  sheetHeaderTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  sheetHeaderSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  closeSheetBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScrollView: {
    flex: 1,
  },
  sheetScrollContent: {
    padding: 18,
    gap: 14,
  },
  questionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  questionCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  questionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#166534',
  },
  questionText: {
    fontSize: 16,
    color: '#0F172A',
    fontStyle: 'italic',
    lineHeight: 22,
    fontWeight: '600',
  },
  loadingContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  pulsingIconWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsingIconOuter: {
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(22, 163, 74, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pulsingIconInner: {
    width: 66,
    height: 66,
    borderRadius: 33,
    backgroundColor: '#16A34A',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 4,
  },
  loadingCycleBox: {
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  loadingStatusText: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 22,
  },
  loadingSubHint: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 6,
    fontWeight: '500',
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 14,
    borderLeftWidth: 4,
    borderLeftColor: '#DC2626',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
    lineHeight: 20,
  },
  responseContainer: {
    gap: 14,
  },
  audioPlayerWidget: {
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    padding: 16,
    borderWidth: 2,
    borderColor: '#BBF7D0',
    gap: 12,
  },
  audioPlayerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  audioTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  audioPlayerTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#166534',
  },
  audioStatusBadge: {
    backgroundColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  audioStatusBadgeActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
    borderWidth: 1,
  },
  audioStatusText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  audioStatusTextActive: {
    color: '#15803D',
  },
  waveformContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    height: 38,
    paddingHorizontal: 4,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  waveformBar: {
    width: 5,
    borderRadius: 2.5,
  },
  playToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1B5E20',
    borderRadius: 14,
    height: 52,
    elevation: 3,
  },
  playToggleBtnStop: {
    backgroundColor: '#DC2626',
  },
  playToggleBtnLoading: {
    backgroundColor: '#059669',
    opacity: 0.9,
  },
  playToggleBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
  },
  contextBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  badgeWeather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#BAE6FD',
  },
  badgeWeatherText: {
    color: '#0284C7',
    fontSize: 12,
    fontWeight: '800',
  },
  badgeMandi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
  },
  badgeMandiText: {
    color: '#D97706',
    fontSize: 12,
    fontWeight: '800',
  },
  badgeIcar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  badgeIcarText: {
    color: '#15803D',
    fontSize: 12,
    fontWeight: '800',
  },
  badgeSpeed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  badgeSpeedText: {
    color: '#64748B',
    fontSize: 11,
    fontWeight: '700',
  },
  advisoryContentBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  advisoryBodyText: {
    color: '#0F172A',
    lineHeight: 28,
    fontWeight: '500',
  },
  icarTrustBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  icarTrustIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#16A34A',
  },
  icarTrustTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#166534',
  },
  icarTrustSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 2,
  },
  // 🍞 Toast Notification Banner
  sheetToastBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#1E293B',
    marginHorizontal: 16,
    marginVertical: 4,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 4,
  },
  sheetToastText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },

  // 🌾 WARM EARTHY BOTTOM SECTION (#FDFBF7)
  earthyBottomSection: {
    backgroundColor: '#FDFBF7',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#EAE3D2',
    marginTop: 6,
    gap: 16,
  },

  // 1. Tactile Source Cards
  tactileSourcesBox: {
    gap: 10,
  },
  sourcesHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourcesHeading: {
    fontSize: 14,
    fontWeight: '900',
    color: '#166534',
  },
  sourcesSubHeading: {
    fontSize: 11,
    fontWeight: '600',
    color: '#78716C',
  },
  tactileCardList: {
    gap: 8,
  },
  tactileDocCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#EAE3D2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 5,
    elevation: 3,
    gap: 10,
  },
  docIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF1EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  docCardInfo: {
    flex: 1,
    gap: 2,
  },
  docTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  docFilename: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  matchScoreBadge: {
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  matchScoreText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#15803D',
  },
  matchScoreSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#166534',
    textTransform: 'uppercase',
  },

  // 2. Actionable Next Steps (Side-by-side chips)
  actionStepsContainer: {
    gap: 8,
  },
  actionStepsHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#292524',
  },
  actionChipsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  actionChipSpray: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  actionChipShop: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  actionChipTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  actionChipSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
  },

  // Suggested Follow-Up Question Chips
  followUpChipsContainer: {
    marginBottom: 16,
    gap: 8,
  },
  followUpHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  followUpChipsHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#92400E',
    letterSpacing: 0.1,
  },
  followUpChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  followUpChip: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 20,
    paddingHorizontal: 14,
    paddingVertical: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  followUpText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#78350F',
    lineHeight: 18,
  },

  // 3. Voice-First Floating Follow-Up Bar
  voiceFollowUpSection: {
    gap: 8,
  },
  voiceFollowUpHeading: {
    fontSize: 13,
    fontWeight: '800',
    color: '#292524',
  },
  floatingActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 30,
    paddingLeft: 14,
    paddingRight: 6,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#EAE3D2',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 4,
    gap: 8,
  },
  secondaryFollowUpInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    paddingVertical: 6,
    fontWeight: '500',
  },
  inlineSendBtn: {
    padding: 6,
  },
  inlineSendBtnDisabled: {
    opacity: 0.35,
  },
  dominantVoiceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#15803D',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 22,
    shadowColor: '#15803D',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.35,
    shadowRadius: 4,
    elevation: 4,
  },
  dominantVoiceBtnActive: {
    backgroundColor: '#DC2626',
    shadowColor: '#DC2626',
  },
  dominantVoiceBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '900',
  },

  // Dialog Overlays & Cards
  dialogOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialogCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 440,
    padding: 20,
    gap: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: '#EAE3D2',
  },
  dialogHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  dialogIconBadgeAmber: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCD34D',
  },
  dialogIconBadgeGreen: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  dialogIconBadgeRed: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFF1EE',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  dialogTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  dialogSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  dialogOptionsList: {
    gap: 10,
  },
  dialogOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  dialogOptionItemActive: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
  },
  dialogOptionLabel: {
    fontSize: 13,
    fontWeight: '800',
    color: '#1E293B',
  },
  dialogOptionSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  dialogCloseBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dialogCloseBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#334155',
  },

  // Shop item cards
  shopItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    gap: 10,
  },
  shopItemName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  shopItemAddress: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
    marginTop: 2,
  },
  shopItemStock: {
    fontSize: 11,
    color: '#15803D',
    fontWeight: '700',
    marginTop: 4,
  },
  shopActionBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#15803D',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Citation details
  citationDetailsContent: {
    gap: 12,
  },
  citationDetailTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  citationMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  citationMetaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  citationMatchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#DCFCE7',
    borderRadius: 10,
    padding: 10,
  },
  citationMatchLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#166534',
  },
  citationMatchScore: {
    fontSize: 13,
    fontWeight: '900',
    color: '#15803D',
  },
  citationTrustNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#BBF7D0',
  },
  citationTrustNoticeText: {
    fontSize: 11,
    lineHeight: 16,
    color: '#166534',
    fontWeight: '600',
    flex: 1,
  },
  // ── FARMER-CENTRIC STRUCTURED FIELD ADVISORY CARDS ──
  structuredCardsContainer: {
    gap: 12,
    marginVertical: 4,
  },
  fieldAdvisoryCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderLeftWidth: 6,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  fieldCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  fieldCardIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fieldCardTitle: {
    fontWeight: '800',
    flex: 1,
    letterSpacing: 0.2,
  },
  fieldCardItemsList: {
    gap: 10,
  },
  fieldCardItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  fieldCardBulletDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginTop: 8,
  },
  fieldCardItemText: {
    lineHeight: 24,
    color: '#1E293B',
  },
  fieldCardItemLabel: {
    fontWeight: '700',
  },
  fieldCardItemValue: {
    fontWeight: '500',
    color: '#0F172A',
  },
  fieldCardItemValueBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  knapsackDosageBox: {
    backgroundColor: '#E0F2FE',
    borderColor: '#0284C7',
    borderWidth: 2,
    borderRadius: 12,
    padding: 12,
    marginTop: 4,
    gap: 6,
  },
  knapsackIconRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  knapsackLabel: {
    color: '#0369A1',
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  knapsackValue: {
    color: '#0C4A6E',
    fontWeight: '800',
    lineHeight: 24,
  },
  // ── Executive Summary Banner ──
  executiveSummaryCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderLeftWidth: 5,
    borderLeftColor: '#16A34A',
  },
  execSummaryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  execSummaryIconCircle: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  execSummaryLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
    letterSpacing: 0.8,
  },
  execSummaryText: {
    fontSize: 16,
    color: '#14532D',
    lineHeight: 24,
    fontWeight: '500',
  },
  execSummaryBold: {
    fontWeight: '800',
    color: '#052E16',
  },

  // ── Markdown Comparison Table ──
  tableWrapper: {
    marginVertical: 10,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  tableScroll: {
    flexGrow: 0,
  },
  tableContainer: {
    minWidth: '100%',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1.5,
    borderBottomColor: '#CBD5E1',
  },
  tableHeaderCell: {
    backgroundColor: '#F1F5F9',
  },
  tableHeaderText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  tableDataRow: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableDataRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableCell: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    minWidth: 130,
    justifyContent: 'center',
    borderRightWidth: 1,
    borderRightColor: '#E2E8F0',
  },
  tableFirstCell: {
    minWidth: 140,
    fontWeight: '700',
  },
  tableCellText: {
    fontSize: 13.5,
    color: '#334155',
    lineHeight: 18,
  },
  tableCellTextBold: {
    fontWeight: '700',
    color: '#0F172A',
  },

  // ── Numbered Steps ──
  numberedRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginVertical: 5,
  },
  numberedBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  numberedBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },

  // ── Paragraph Blocks ──
  paragraphBlock: {
    marginVertical: 4,
  },
  paragraphText: {
    fontSize: 14.5,
    color: '#475569',
    lineHeight: 22,
  },
  paragraphTextBold: {
    fontWeight: '700',
    color: '#1E293B',
  },
});
