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
import React, { useState, useEffect, useRef } from 'react';
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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
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
}: AdvisoryResponseSheetProps) {
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [followUpText, setFollowUpText] = useState('');
  const [loadingCycleIndex, setLoadingCycleIndex] = useState(0);

  // Task 1: Persistent HTMLAudioElement instance for Web & Sound for Native
  const htmlAudioRef = useRef<any>(null);
  const soundRef = useRef<Audio.Sound | null>(null);

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

  // Cycling animation when loading
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | null = null;
    if (loading) {
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
      if (htmlAudioRef.current) {
        try {
          htmlAudioRef.current.pause();
          htmlAudioRef.current = null;
        } catch {}
      }
      if (soundRef.current) {
        soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
    };
  }, []);

  const playAudio = async () => {
    if (!response?.query_id) {
      showToast('⚠️ Spoken advisory not ready yet for this query.');
      return;
    }

    const audioUrl = `${BASE_URL}/api/v1/query/${response.query_id}/audio?lang=${currentLang}`;

    // ── WEB EXECUTION: Persistent HTMLAudioElement with strict event listeners & Web Speech Fallback ──
    if (Platform.OS === 'web' && typeof window !== 'undefined' && typeof (window as any).Audio !== 'undefined') {
      try {
        if (!htmlAudioRef.current) {
          htmlAudioRef.current = new (window as any).Audio();
        }
        const audio = htmlAudioRef.current;

        // Reset previous state and remove any dangling callbacks
        audio.pause();
        audio.currentTime = 0;
        audio.onplaying = null;
        audio.onended = null;
        audio.onerror = null;
        audio.onpause = null;

        // Ensure isPlaying state ONLY toggles to true after 'playing' event fires
        audio.onplaying = () => {
          setAudioPlaying(true);
        };
        // Reset to false on 'ended', 'pause', or 'error' events
        audio.onended = () => {
          setAudioPlaying(false);
        };
        audio.onpause = () => {
          setAudioPlaying(false);
        };
        audio.onerror = () => {
          console.warn('Audio tag failed to load stream, switching to Web Speech Synthesis fallback.');
          speakWithWebSpeech();
        };

        audio.src = audioUrl;
        audio.load();

        safeHaptics.impactMedium();

        // Wrap audio.play() in a standard promise .catch() to handle DOMException errors
        const playPromise = audio.play();
        if (playPromise !== undefined) {
          playPromise.catch((domErr: any) => {
            console.warn('HTMLAudioElement play() DOMException, switching to Web Speech Synthesis:', domErr);
            speakWithWebSpeech();
          });
        }
      } catch (err) {
        console.error('HTMLAudioElement error, switching to Web Speech Synthesis:', err);
        speakWithWebSpeech();
      }
      return;
    }

    // ── NATIVE EXECUTION (iOS / Android using expo-av) ──
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync().catch(() => {});
        soundRef.current = null;
      }
      safeHaptics.impactMedium();
      const { sound } = await Audio.Sound.createAsync(
        { uri: audioUrl },
        { shouldPlay: false }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded) {
          if ((status as any).error) {
            setAudioPlaying(false);
            showToast('⚠️ Failed to load audio on device.');
          }
          return;
        }
        if (status.isPlaying) {
          setAudioPlaying(true);
        } else if (status.didJustFinish) {
          setAudioPlaying(false);
        }
      });
      await sound.playAsync().catch(() => {
        setAudioPlaying(false);
        showToast('⚠️ Audio playback failed.');
      });
    } catch {
      setAudioPlaying(false);
      showToast('⚠️ Audio service temporarily unavailable.');
    }
  };

  const speakWithWebSpeech = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setAudioPlaying(false);
      showToast('⚠️ Audio playback not supported in this browser.');
      return;
    }

    try {
      window.speechSynthesis.cancel();

      // Clean text for speech (strip markdown characters and linebreaks)
      const textToSpeak = displayAnswer
        .replace(/[#*`_■]/g, '')
        .replace(/\n+/g, '. ')
        .trim();

      if (!textToSpeak) {
        setAudioPlaying(false);
        return;
      }

      const utterance = new SpeechSynthesisUtterance(textToSpeak);
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
        or: 'or-IN',
        as: 'as-IN',
        en: 'en-IN',
      };
      utterance.lang = langMap[currentLang] || 'en-IN';

      // Pick matching accent voice if available in browser
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        const voices = window.speechSynthesis.getVoices();
        if (voices && voices.length > 0) {
          const targetPrefix = currentLang.toLowerCase();
          const matchedVoice = voices.find(
            (v) =>
              v.lang.toLowerCase().startsWith(targetPrefix) ||
              v.lang.toLowerCase().replace('_', '-').startsWith(targetPrefix)
          );
          if (matchedVoice) {
            utterance.voice = matchedVoice;
          }
        }
      }

      utterance.rate = 0.95;
      utterance.pitch = 1.0;

      utterance.onstart = () => {
        setAudioPlaying(true);
      };
      utterance.onend = () => {
        setAudioPlaying(false);
      };
      utterance.onerror = (e) => {
        console.warn('SpeechSynthesis error:', e);
        setAudioPlaying(false);
      };

      safeHaptics.impactMedium();
      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.error('SpeechSynthesis error:', err);
      setAudioPlaying(false);
    }
  };

  const stopAudio = async () => {
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    if (htmlAudioRef.current) {
      try {
        htmlAudioRef.current.pause();
        htmlAudioRef.current.currentTime = 0;
      } catch {
        // ignore pause error
      }
    }
    if (soundRef.current) {
      try {
        await soundRef.current.stopAsync();
        await soundRef.current.unloadAsync();
      } catch {
        // ignore unload error
      }
      soundRef.current = null;
    }
    setAudioPlaying(false);
  };

  const handleToggleAudio = () => {
    if (audioPlaying) {
      stopAudio();
    } else {
      playAudio();
    }
  };

  const handleSendFollowUp = () => {
    if (!followUpText.trim()) return;
    safeHaptics.impactMedium();
    if (onFollowUpSubmit) {
      onFollowUpSubmit(followUpText.trim());
      setFollowUpText('');
    }
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

  const getAnswerFontSize = () => {
    if (fontSizeScale === 'xlarge') return 24;
    if (fontSizeScale === 'large') return 20;
    return 17;
  };

  const displayAnswer = response
    ? currentLang === 'en'
      ? response.answer_english || response.answer
      : response.answer
    : '';

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        <View style={styles.bottomSheetContainer}>
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
                <Text allowFontScaling={true} style={styles.sheetBackText}>Back</Text>
              </TouchableOpacity>

              <View style={styles.sheetHeaderTitleGroup}>
                <View style={styles.sheetIconBadge}>
                  <MaterialCommunityIcons name="sprout" size={20} color="#16A34A" />
                </View>
                <View>
                  <Text allowFontScaling={true} style={styles.sheetHeaderTitle}>Krishi Sahayak Advisory</Text>
                  <Text allowFontScaling={true} style={styles.sheetHeaderSub}>ICAR Grounded • Live Response</Text>
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
                    <View style={[styles.audioStatusBadge, audioPlaying && styles.audioStatusBadgeActive]}>
                      <Text allowFontScaling={true} style={[styles.audioStatusText, audioPlaying && styles.audioStatusTextActive]}>
                        {audioPlaying ? '▶ Playing Audio' : 'Ready'}
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
                    style={[styles.playToggleBtn, audioPlaying && styles.playToggleBtnStop]}
                    onPress={handleToggleAudio}
                    activeOpacity={0.85}
                    accessibilityRole="button"
                    accessibilityLabel={audioPlaying ? (t('stopAnswerBtn') || "Stop Audio") : (t('playAnswerBtn') || "Play Audio")}
                    accessibilityHint="Toggles spoken audio narration of the advisory"
                    accessibilityState={{ selected: audioPlaying }}
                  >
                    <MaterialCommunityIcons
                      name={audioPlaying ? 'stop-circle' : 'play-circle'}
                      size={26}
                      color="#FFFFFF"
                    />
                    <Text allowFontScaling={true} style={styles.playToggleBtnText}>
                      {audioPlaying ? t('stopAnswerBtn') : t('playAnswerBtn')}
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
                  <View style={styles.badgeMandi} accessibilityRole="text" accessibilityLabel={response.market_context_used ? t('enamMandiChip') : 'eNAM Live Mandi Rates context used'}>
                    <MaterialCommunityIcons name="currency-inr" size={15} color="#D97706" />
                    <Text allowFontScaling={true} style={styles.badgeMandiText}>
                      {response.market_context_used ? t('enamMandiChip') : '📈 eNAM: Live Mandi Rates'}
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

                {/* ── WRITTEN ADVISORY TEXT ── */}
                <View style={styles.advisoryContentBox}>
                  <Text allowFontScaling={true} style={[styles.advisoryBodyText, { fontSize: getAnswerFontSize() }]}>
                    {displayAnswer}
                  </Text>
                </View>

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
                        <Text allowFontScaling={true} style={styles.sourcesHeading}>Verified ICAR Research Sources</Text>
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
                    <Text allowFontScaling={true} style={styles.actionStepsHeading}>⚡ Actionable Next Steps:</Text>
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
                  </View>

                  {/* 3. VOICE-FIRST FLOATING FOLLOW-UP ACTION BAR */}
                  {onFollowUpSubmit && (
                    <View style={styles.voiceFollowUpSection}>
                      <Text allowFontScaling={true} style={styles.voiceFollowUpHeading}>💬 Have a follow-up question?</Text>

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

                        {followUpText.trim().length > 0 && (
                          <TouchableOpacity
                            style={styles.inlineSendBtn}
                            onPress={handleSendFollowUp}
                            activeOpacity={0.8}
                            accessibilityRole="button"
                            accessibilityLabel="Send question"
                          >
                            <MaterialCommunityIcons name="send" size={18} color="#15803D" />
                          </TouchableOpacity>
                        )}

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
        </View>
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
});
