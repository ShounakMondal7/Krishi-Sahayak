/**
 * useVoiceRecorder — Universal Cross-Platform Voice Recording Hook for Krishi Sahayak.
 *
 * Capabilities:
 * - 📱 Native Android & iOS via expo-audio AudioRecorder & RecordingPresets.HIGH_QUALITY
 * - 🌐 Web Browser fallback via standard MediaRecorder API (audio/webm, opus)
 * - 🔊 Clean Audio Session Management:
 *     - setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true }) on start
 *     - setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }) on stop
 *       (Crucial: prevents Android from locking into earpiece communication routing,
 *        guaranteeing subsequent TTS advisories play loud on the speaker)
 * - ⏱️ Live elapsed recording timer (00:01, 00:02...)
 * - 🛡️ 600ms minimum recording threshold to prevent accidental clicks
 * - 🔗 Normalized URI (file:// prefixed on native) & Blob returns
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { Platform, Alert } from 'react-native';
import {
  AudioModule,
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
} from 'expo-audio';
import { safeHaptics } from '../services/haptics';

export interface VoiceRecordingResult {
  uri?: string;
  blob?: Blob;
  durationMs: number;
}

export interface UseVoiceRecorderReturn {
  isRecording: boolean;
  elapsedSeconds: number;
  formattedTimer: string;
  error: string | null;
  startRecording: () => Promise<boolean>;
  stopRecording: () => Promise<VoiceRecordingResult | null>;
  cancelRecording: () => Promise<void>;
  clearError: () => void;
}

export function useVoiceRecorder(): UseVoiceRecorderReturn {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const nativeRecorderRef = useRef<any>(null);
  const webMediaRecorderRef = useRef<any>(null);
  const webMediaStreamRef = useRef<any>(null);
  const webAudioChunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerRef = useRef<any>(null);

  // Live timer interval
  useEffect(() => {
    if (isRecording) {
      setElapsedSeconds(0);
      timerRef.current = setInterval(() => {
        setElapsedSeconds((prev) => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
      setElapsedSeconds(0);
    }
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
      }
    };
  }, [isRecording]);

  const cleanupSession = useCallback(async () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (webMediaStreamRef.current) {
      try {
        webMediaStreamRef.current.getTracks().forEach((track: any) => track.stop());
      } catch {}
      webMediaStreamRef.current = null;
    }
    webMediaRecorderRef.current = null;
    webAudioChunksRef.current = [];
    nativeRecorderRef.current = null;
    setIsRecording(false);
    setElapsedSeconds(0);

    // Reset native audio mode to exit recording mode so TTS media speaker is unblocked
    if (Platform.OS !== 'web') {
      try {
        await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      } catch {}
    }
  }, []);

  const startRecording = useCallback(async (): Promise<boolean> => {
    setError(null);
    startTimeRef.current = Date.now();

    // ── 1. Web Browser MediaRecorder ──────────────────────────────────────────
    if (Platform.OS === 'web') {
      try {
        if (typeof navigator === 'undefined' || !navigator?.mediaDevices?.getUserMedia) {
          setError('Microphone recording is not supported in this browser.');
          return false;
        }

        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        webMediaStreamRef.current = stream;
        webAudioChunksRef.current = [];

        let mimeType = 'audio/webm';
        if (typeof MediaRecorder !== 'undefined') {
          if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
            mimeType = 'audio/webm;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/webm')) {
            mimeType = 'audio/webm';
          } else if (MediaRecorder.isTypeSupported('audio/ogg;codecs=opus')) {
            mimeType = 'audio/ogg;codecs=opus';
          } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
            mimeType = 'audio/mp4';
          }
        }

        const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        webMediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event: any) => {
          if (event.data && event.data.size > 0) {
            webAudioChunksRef.current.push(event.data);
          }
        };

        recorder.onerror = (event: any) => {
          console.warn('[useVoiceRecorder] Web MediaRecorder error:', event.error);
          cleanupSession();
          setError('Microphone recording error. Please try again.');
        };

        recorder.start(250);
        setIsRecording(true);
        safeHaptics.impactHeavy();
        return true;
      } catch (err: any) {
        console.warn('[useVoiceRecorder] Web microphone access error:', err);
        cleanupSession();
        if (err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError') {
          setError('Microphone permission denied. Please allow microphone access.');
        } else {
          setError('Could not access microphone.');
        }
        return false;
      }
    }

    // ── 2. Native Expo Audio (Android / iOS) ──────────────────────────────────
    try {
      const { granted } = await requestRecordingPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed for voice questions.');
        setError('Microphone permission denied.');
        return false;
      }

      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      const recorder = new AudioModule.AudioRecorder(RecordingPresets.HIGH_QUALITY);
      nativeRecorderRef.current = recorder;
      await recorder.prepareToRecordAsync();
      recorder.record();
      setIsRecording(true);
      safeHaptics.impactHeavy();
      return true;
    } catch (err: any) {
      console.warn('[useVoiceRecorder] Native microphone recording error:', err);
      cleanupSession();
      setError('Could not start microphone recording. Please check permissions.');
      return false;
    }
  }, [cleanupSession]);

  const stopRecording = useCallback(async (): Promise<VoiceRecordingResult | null> => {
    safeHaptics.impactMedium();
    setIsRecording(false);

    const durationMs = Date.now() - (startTimeRef.current || 0);
    if (durationMs < 600) {
      await cleanupSession();
      setError('Hold or speak for at least 1 second.');
      return null;
    }

    // ── 1. Web Stop & Blob Extraction ─────────────────────────────────────────
    if (Platform.OS === 'web') {
      const recorder = webMediaRecorderRef.current;
      webMediaRecorderRef.current = null;

      try {
        if (recorder && recorder.state !== 'inactive') {
          await new Promise<void>((resolve) => {
            recorder.onstop = () => resolve();
            recorder.stop();
          });
        }

        if (webMediaStreamRef.current) {
          try {
            webMediaStreamRef.current.getTracks().forEach((track: any) => track.stop());
          } catch {}
          webMediaStreamRef.current = null;
        }

        const chunks = webAudioChunksRef.current;
        webAudioChunksRef.current = [];

        if (!chunks || chunks.length === 0) {
          setError('No audio recorded. Please speak clearly.');
          return null;
        }

        const audioBlob = new Blob(chunks, { type: 'audio/webm' });
        return { blob: audioBlob, durationMs };
      } catch (err: any) {
        console.warn('[useVoiceRecorder] Web audio stop error:', err);
        setError('Failed to process recorded audio.');
        return null;
      } finally {
        await cleanupSession();
      }
    }

    // ── 2. Native Stop & File Normalization ────────────────────────────────────
    const recorder = nativeRecorderRef.current;
    nativeRecorderRef.current = null;

    try {
      if (recorder) {
        await recorder.stop();
        let uri = recorder.uri;
        if (!uri) {
          setError('Audio file could not be created.');
          return null;
        }
        // Normalize file URI format so multipart/form-data works on all Android vendors
        if (!uri.startsWith('file://') && !uri.startsWith('content://') && !uri.startsWith('http')) {
          uri = `file://${uri}`;
        }
        return { uri, durationMs };
      }
      return null;
    } catch (err: any) {
      console.warn('[useVoiceRecorder] Native audio stop error:', err);
      setError('Failed to save audio recording.');
      return null;
    } finally {
      await cleanupSession();
    }
  }, [cleanupSession]);

  const cancelRecording = useCallback(async () => {
    safeHaptics.impactLight();
    await cleanupSession();
  }, [cleanupSession]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const formattedTimer = `${Math.floor(elapsedSeconds / 60)
    .toString()
    .padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`;

  return {
    isRecording,
    elapsedSeconds,
    formattedTimer,
    error,
    startRecording,
    stopRecording,
    cancelRecording,
    clearError,
  };
}
