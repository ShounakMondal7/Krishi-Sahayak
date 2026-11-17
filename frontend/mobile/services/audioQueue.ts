/**
 * services/audioQueue.ts — Global Singleton Sequential Audio Queue.
 *
 * Enforces:
 * 1. Strict single-channel audio lock (only ONE audio stream plays at any time).
 * 2. Single complete clean MP3 advisory delivery (speaks once, never loops).
 * 3. Instant UI feedback (< 50ms) and fast-start playback.
 * 4. Automatic release of native and web audio resources to prevent memory/session leaks.
 * 5. Immediate cancellation and flush (stopAndClearAll) on navigation, modal close, or follow-ups.
 */

import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { BASE_URL } from './api';
import { safeHaptics } from './haptics';

export interface AudioQueueItem {
  id: string;
  fetchOrUri: () => Promise<string | Blob | null> | string;
  fallbackText?: string;
  title?: string;
  partIndex?: number;
  totalParts?: number;
}

export interface AudioQueueState {
  isPlaying: boolean;
  isLoading: boolean;
  statusText: string;
  currentPart: number;
  totalParts: number;
  activeSequenceId: string | null;
}

type AudioQueueListener = (state: AudioQueueState) => void;

class AudioQueueService {
  private state: AudioQueueState = {
    isPlaying: false,
    isLoading: false,
    statusText: '',
    currentPart: 0,
    totalParts: 0,
    activeSequenceId: null,
  };

  private listeners: Set<AudioQueueListener> = new Set();
  private queue: AudioQueueItem[] = [];
  private activePlayer: any = null;
  private activeAbortController: AbortController | null = null;
  private activeBlobUrl: string | null = null;

  constructor() {
    // Ensure clean state on browser reload
    if (Platform.OS === 'web' && typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.stopAndClearAll();
      });
    }
  }

  public getState(): AudioQueueState {
    return { ...this.state };
  }

  public subscribe(listener: AudioQueueListener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify(): void {
    const currentState = this.getState();
    this.listeners.forEach((listener) => {
      try {
        listener(currentState);
      } catch (err) {
        console.warn('AudioQueue listener error:', err);
      }
    });
  }

  /**
   * Hard Stop / Flush:
   * 1. Aborts in-flight audio fetches.
   * 2. Stops and releases active Web/Native audio players.
   * 3. Cancels any active Web Speech Synthesis.
   * 4. Clears queue and resets all playback flags.
   */
  public stopAndClearAll(): void {
    // 1. Abort any in-flight HTTP fetches
    if (this.activeAbortController) {
      try {
        this.activeAbortController.abort();
      } catch {}
      this.activeAbortController = null;
    }

    // 2. Stop & clean Web HTMLAudioElement
    if (this.activePlayer) {
      try {
        if (Platform.OS === 'web') {
          this.activePlayer.pause();
          this.activePlayer.removeAttribute?.('src');
          this.activePlayer.src = '';
          this.activePlayer.onplaying = null;
          this.activePlayer.onended = null;
          this.activePlayer.onerror = null;
          this.activePlayer.onpause = null;
        } else {
          // Native expo-audio player
          this.activePlayer.pause?.();
          this.activePlayer.release?.();
          this.activePlayer.remove?.();
        }
      } catch {}
      this.activePlayer = null;
    }

    // 3. Revoke any active Blob URL
    if (this.activeBlobUrl && typeof URL !== 'undefined' && URL.revokeObjectURL) {
      try {
        URL.revokeObjectURL(this.activeBlobUrl);
      } catch {}
      this.activeBlobUrl = null;
    }

    // 4. Cancel Web Speech Synthesis
    if (Platform.OS === 'web' && typeof window !== 'undefined' && 'speechSynthesis' in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }

    // 5. Clear queue and reset state
    this.queue = [];
    this.state = {
      isPlaying: false,
      isLoading: false,
      statusText: '',
      currentPart: 0,
      totalParts: 0,
      activeSequenceId: null,
    };
    this.notify();
  }

  /**
   * Single Exclusive Clean Advisory Playback:
   * Plays the complete clean synthesized MP3 advisory audio once from /api/v1/query/{queryId}/audio.
   * Specks once and terminates cleanly. Never loops.
   * Toggles stop if tapped while playing.
   */
  public async playAdvisorySequence(
    queryId: number,
    lang: string,
    fallbackText?: string
  ): Promise<void> {
    const seqId = `query_${queryId}_${lang}`;

    // 1. Toggle stop if user taps the same playing or loading advisory
    if (this.state.activeSequenceId === seqId) {
      if (this.state.isPlaying || this.state.isLoading) {
        this.stopAndClearAll();
        return;
      }
    }

    // 2. Ignore duplicate rapid taps while already loading a query
    if (this.state.isLoading) {
      return;
    }

    // 3. Stop any existing playback and lock channel
    this.stopAndClearAll();
    safeHaptics.impactMedium();

    this.state.activeSequenceId = seqId;
    this.state.isLoading = true;
    this.state.isPlaying = false;
    this.state.currentPart = 1;
    this.state.totalParts = 1;
    this.state.statusText = 'Preparing Voice...';
    this.notify();

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    const audioUrl = `${BASE_URL}/api/v1/query/${queryId}/audio?lang=${lang}`;

    try {
      if (Platform.OS === 'web') {
        const response = await fetch(audioUrl, {
          signal: abortController.signal,
          headers: {
            'bypass-tunnel-reminder': 'true',
          },
        });

        if (this.state.activeSequenceId !== seqId) return;

        if (!response.ok) {
          throw new Error(`HTTP ${response.status} fetching advisory audio`);
        }

        const blob = await response.blob();
        if (this.state.activeSequenceId !== seqId) return;

        if (this.activeBlobUrl && typeof URL !== 'undefined') {
          URL.revokeObjectURL(this.activeBlobUrl);
        }
        const blobUrl = URL.createObjectURL(blob);
        this.activeBlobUrl = blobUrl;

        await this.playWebAudioUrl(blobUrl, seqId, fallbackText, lang);
      } else {
        // Native (Android / iOS via expo-audio)
        const { createAudioPlayer } = require('expo-audio');
        const player = createAudioPlayer({ uri: audioUrl });
        this.activePlayer = player;
        try {
          player.loop = false; // Strictly non-looping
        } catch {}

        this.state.isLoading = false;
        this.state.isPlaying = true;
        this.state.currentPart = 1;
        this.state.totalParts = 1;
        this.state.statusText = 'Speaking...';
        this.notify();

        (player as any).addListener('playbackStatusUpdate', (status: any) => {
          if (this.state.activeSequenceId !== seqId) return;

          if (status.didJustFinish) {
            // Audio finished playing completely once -> stop and release
            this.stopAndClearAll();
          }
        });

        player.play();
      }
    } catch (err: any) {
      if (err?.name === 'AbortError' || this.state.activeSequenceId !== seqId) {
        return; // Normal abort on user stop or new question
      }
      console.warn(`Advisory audio error for ${seqId}:`, err);

      // On failure on web, fallback to clean Web Speech Synthesis
      if (Platform.OS === 'web' && fallbackText) {
        this.speakWithWebSpeech(fallbackText, lang);
      } else {
        this.stopAndClearAll();
      }
    }
  }

  // Alias for single exclusive audio playback
  public async playExclusiveAudio(
    queryId: number,
    lang: string,
    fallbackText?: string
  ): Promise<void> {
    return this.playAdvisorySequence(queryId, lang, fallbackText);
  }

  private playWebAudioUrl(
    url: string,
    seqId: string,
    fallbackText?: string,
    lang: string = 'en'
  ): Promise<void> {
    return new Promise((resolve) => {
      if (typeof window === 'undefined' || typeof (window as any).Audio === 'undefined') {
        resolve();
        return;
      }

      if (!this.activePlayer) {
        this.activePlayer = new (window as any).Audio();
      }
      const audio: HTMLAudioElement = this.activePlayer;

      audio.pause();
      audio.currentTime = 0;
      audio.loop = false; // MUST NEVER LOOP
      audio.onplaying = null;
      audio.onended = null;
      audio.onerror = null;
      audio.onpause = null;

      audio.onplaying = () => {
        if (this.state.activeSequenceId !== seqId) return;
        this.state.isLoading = false;
        this.state.isPlaying = true;
        this.state.currentPart = 1;
        this.state.totalParts = 1;
        this.state.statusText = 'Speaking...';
        this.notify();
      };

      audio.onended = () => {
        // Advisory audio finished playing once: stop completely, never loop
        if (this.state.activeSequenceId === seqId) {
          this.stopAndClearAll();
        }
        resolve();
      };

      audio.onerror = (e) => {
        console.warn('HTMLAudioElement error playing advisory:', e);
        if (fallbackText) {
          this.speakWithWebSpeech(fallbackText, lang);
        } else {
          this.stopAndClearAll();
        }
        resolve();
      };

      audio.src = url;
      audio.load();

      const playPromise = audio.play();
      if (playPromise !== undefined) {
        playPromise.catch((domErr) => {
          console.warn('HTMLAudioElement play() DOMException:', domErr);
          if (fallbackText) {
            this.speakWithWebSpeech(fallbackText, lang);
          } else {
            this.stopAndClearAll();
          }
          resolve();
        });
      }
    });
  }

  /**
   * Zero-latency browser Web Speech Synthesis fallback for offline / audio-tag failures.
   * Strips all SSML/XML tags, starts with localized greeting, and speaks once without looping.
   */
  public speakWithWebSpeech(text: string, lang: string): void {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      this.stopAndClearAll();
      return;
    }

    try {
      window.speechSynthesis.cancel();

      const greetings: Record<string, string> = {
        en: 'Here is your advisory. ',
        hi: 'यहाँ आपकी सलाह है। ',
        ml: 'ഇതാ താങ്കൾക്കുള്ള കാർഷിക നിർദ്ദേശം. ',
        ta: 'இதோ உங்களுக்கான வேளாண் ஆலோசனை. ',
        te: 'ఇది మీ వ్యవసాయ సలహా. ',
        kn: 'ಇಲ್ಲಿ ನಿಮ್ಮ ಕೃಷಿ ಸಲಹೆ ಇದೆ. ',
        bn: 'এখানে আপনার কৃষি পরামর্শ রয়েছে। ',
        mr: 'येथे तुमचा कृषी सल्ला आहे. ',
        gu: 'અહીં તમારી કૃષિ સલાહ છે. ',
        pa: 'ਇੱਥੇ ਤੁਹਾਡੀ ਖੇਤੀ ਸਲਾਹ ਹੈ। ',
      };
      const greeting = greetings[lang] || 'Here is your advisory. ';

      // Strip XML/HTML tags, markdown artifacts, emojis
      let cleanText = text
        .replace(/<[^>]+>/g, ' ')
        .replace(/[#*`_■🛑🌿🧪⚠️👉🌾📱🚶▶⏹⏳🛡️💰]/g, '')
        .replace(/\|[\s\-:|]+\|/g, '')
        .replace(/\|/g, ', ')
        .replace(/\n+/g, '. ')
        .trim();

      if (!cleanText.startsWith(greeting.trim())) {
        cleanText = greeting + cleanText;
      }

      if (!cleanText) {
        this.stopAndClearAll();
        return;
      }

      const utterance = new SpeechSynthesisUtterance(cleanText);
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
      utterance.lang = langMap[lang] || 'en-IN';
      utterance.rate = 0.95;

      utterance.onstart = () => {
        this.state.isLoading = false;
        this.state.isPlaying = true;
        this.state.statusText = 'Speaking...';
        this.notify();
      };

      utterance.onend = () => {
        this.stopAndClearAll();
      };

      utterance.onerror = () => {
        this.stopAndClearAll();
      };

      window.speechSynthesis.speak(utterance);
    } catch {
      this.stopAndClearAll();
    }
  }

  /**
   * Rule 1 & Rule 2: Strict FIFO queue.
   * If already playing/loading, enqueue and return immediately without overlapping.
   */
  public enqueue(item: AudioQueueItem): void {
    if (this.state.isPlaying || this.state.isLoading) {
      this.queue.push(item);
      return;
    }
    this.queue.push(item);
    this.processNextInQueue();
  }

  public async playExclusiveSequence(
    sequenceId: string,
    items: AudioQueueItem[]
  ): Promise<void> {
    if (this.state.activeSequenceId === sequenceId) {
      if (this.state.isPlaying || this.state.isLoading) {
        this.stopAndClearAll();
        return;
      }
    }
    if (this.state.isLoading) {
      return;
    }
    this.stopAndClearAll();
    this.state.activeSequenceId = sequenceId;
    this.state.isLoading = true;
    this.state.statusText = 'Preparing Voice...';
    this.notify();

    this.queue = [...items];
    await this.processNextInQueue();
  }

  private async processNextInQueue(): Promise<void> {
    if (this.queue.length === 0) {
      this.stopAndClearAll();
      return;
    }

    const item = this.queue.shift()!;
    this.state.isLoading = true;
    this.state.isPlaying = false;
    this.notify();

    try {
      let resolvedUriOrBlob: string | Blob | null = null;
      if (typeof item.fetchOrUri === 'function') {
        resolvedUriOrBlob = await item.fetchOrUri();
      } else {
        resolvedUriOrBlob = item.fetchOrUri;
      }

      if (!resolvedUriOrBlob) {
        this.processNextInQueue();
        return;
      }

      const seqId = this.state.activeSequenceId || item.id;
      const partIdx = item.partIndex || 1;
      const total = item.totalParts || 1;

      if (Platform.OS === 'web') {
        let playUrl: string;
        if (typeof resolvedUriOrBlob === 'string') {
          playUrl = resolvedUriOrBlob;
        } else {
          if (this.activeBlobUrl && typeof URL !== 'undefined') {
            URL.revokeObjectURL(this.activeBlobUrl);
          }
          playUrl = URL.createObjectURL(resolvedUriOrBlob);
          this.activeBlobUrl = playUrl;
        }

        await this.playWebAudioUrl(playUrl, seqId, item.fallbackText, 'en');
        this.processNextInQueue();
      } else {
        const { createAudioPlayer } = require('expo-audio');
        const uri = typeof resolvedUriOrBlob === 'string' ? resolvedUriOrBlob : '';
        const player = createAudioPlayer({ uri });
        this.activePlayer = player;
        try {
          player.loop = false;
        } catch {}

        this.state.isLoading = false;
        this.state.isPlaying = true;
        this.state.currentPart = partIdx;
        this.state.totalParts = total;
        this.state.statusText = 'Speaking...';
        this.notify();

        (player as any).addListener('playbackStatusUpdate', (status: any) => {
          if (status.didJustFinish) {
            try {
              player.release?.();
              player.remove?.();
            } catch {}
            this.activePlayer = null;
            this.processNextInQueue();
          }
        });

        player.play();
      }
    } catch (err) {
      console.warn('Error processing queue item:', err);
      if (item.fallbackText && Platform.OS === 'web') {
        this.speakWithWebSpeech(item.fallbackText, 'en');
      } else {
        this.processNextInQueue();
      }
    }
  }
}

export const audioQueue = new AudioQueueService();

/**
 * React hook subscribing to centralized AudioQueue state.
 */
export function useAudioQueue() {
  const [queueState, setQueueState] = useState<AudioQueueState>(audioQueue.getState());

  useEffect(() => {
    return audioQueue.subscribe((newState) => {
      setQueueState({ ...newState });
    });
  }, []);

  return {
    ...queueState,
    playAdvisorySequence: audioQueue.playAdvisorySequence.bind(audioQueue),
    playExclusiveAudio: audioQueue.playExclusiveAudio.bind(audioQueue),
    playExclusiveSequence: audioQueue.playExclusiveSequence.bind(audioQueue),
    stopAndClearAll: audioQueue.stopAndClearAll.bind(audioQueue),
    enqueue: audioQueue.enqueue.bind(audioQueue),
  };
}
