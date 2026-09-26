import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { safeHaptics } from '../services/haptics';

export type FontSizeScale = 'normal' | 'large' | 'xlarge';

export interface TextSizeContextType {
  fontSizeScale: FontSizeScale;
  textSizeMultiplier: number;
  cycleFontSize: () => void;
  setFontSizeScale: (scale: FontSizeScale) => void;
}

const FONT_SIZE_KEY = 'krishi_font_size_scale';

export const MULTIPLIERS: Record<FontSizeScale, number> = {
  normal: 1.0,
  large: 1.18,
  xlarge: 1.35,
};

const TextSizeContext = createContext<TextSizeContextType>({
  fontSizeScale: 'normal',
  textSizeMultiplier: 1.0,
  cycleFontSize: () => {},
  setFontSizeScale: () => {},
});

export const TextSizeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [fontSizeScale, setFontSizeScaleState] = useState<FontSizeScale>('normal');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const saved = await AsyncStorage.getItem(FONT_SIZE_KEY);
        if (mounted && (saved === 'normal' || saved === 'large' || saved === 'xlarge')) {
          setFontSizeScaleState(saved);
        }
      } catch {}
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const setFontSizeScale = useCallback(async (scale: FontSizeScale) => {
    setFontSizeScaleState(scale);
    try {
      await AsyncStorage.setItem(FONT_SIZE_KEY, scale);
    } catch {}
  }, []);

  const cycleFontSize = useCallback(() => {
    safeHaptics.impactLight();
    setFontSizeScaleState((prev) => {
      const next: FontSizeScale =
        prev === 'normal' ? 'large' : prev === 'large' ? 'xlarge' : 'normal';
      AsyncStorage.setItem(FONT_SIZE_KEY, next).catch(() => {});
      return next;
    });
  }, []);

  const textSizeMultiplier = MULTIPLIERS[fontSizeScale] || 1.0;

  return (
    <TextSizeContext.Provider
      value={{
        fontSizeScale,
        textSizeMultiplier,
        cycleFontSize,
        setFontSizeScale,
      }}
    >
      {children}
    </TextSizeContext.Provider>
  );
};

export const useTextSize = (): TextSizeContextType => {
  const ctx = useContext(TextSizeContext);
  return (
    ctx || {
      fontSizeScale: 'normal',
      textSizeMultiplier: 1.0,
      cycleFontSize: () => {},
      setFontSizeScale: () => {},
    }
  );
};

export default TextSizeContext;
