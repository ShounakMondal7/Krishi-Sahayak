/**
 * languageDetector.ts — Automatic Farmer Language & Region Detection.
 *
 * Automatically detects the farmer's preferred language from the device/browser
 * environment (supporting Android, iOS, and Web) across 12 Pan-India languages:
 * English, Hindi, Malayalam, Tamil, Telugu, Kannada, Bengali, Marathi,
 * Gujarati, Punjabi, Odia, and Assamese.
 *
 * Also maps the detected regional language to the farmer's primary agricultural hub.
 */
import { LanguageCode, SUPPORTED_LANGUAGES } from './i18n';

export interface DetectedLanguageInfo {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  flag: string;
  isAutoDetected: boolean;
  detectedLocale: string;
  defaultState: string;
  defaultDistrict: string;
}

export function detectDeviceLanguage(): DetectedLanguageInfo {
  let detectedLocale = 'en';

  try {
    if (typeof navigator !== 'undefined') {
      if (Array.isArray(navigator.languages) && navigator.languages.length > 0) {
        detectedLocale = navigator.languages[0];
      } else if (navigator.language) {
        detectedLocale = navigator.language;
      }
    } else if (typeof Intl !== 'undefined' && Intl.DateTimeFormat) {
      detectedLocale = Intl.DateTimeFormat().resolvedOptions().locale || 'en';
    }
  } catch {
    detectedLocale = 'en';
  }

  const clean = detectedLocale.toLowerCase();

  // 1. Malayalam (Kerala)
  if (clean.startsWith('ml')) {
    return buildResult('ml', true, detectedLocale, 'Kerala', 'Thrissur');
  }
  // 2. Hindi (North & Central India)
  if (clean.startsWith('hi')) {
    return buildResult('hi', true, detectedLocale, 'Uttar Pradesh', 'Lucknow');
  }
  // 3. Punjabi (Punjab & Haryana)
  if (clean.startsWith('pa')) {
    return buildResult('pa', true, detectedLocale, 'Punjab', 'Ludhiana');
  }
  // 4. Marathi (Maharashtra)
  if (clean.startsWith('mr')) {
    return buildResult('mr', true, detectedLocale, 'Maharashtra', 'Pune');
  }
  // 5. Bengali (West Bengal)
  if (clean.startsWith('bn')) {
    return buildResult('bn', true, detectedLocale, 'West Bengal', 'Purba Bardhaman');
  }
  // 6. Gujarati (Gujarat)
  if (clean.startsWith('gu')) {
    return buildResult('gu', true, detectedLocale, 'Gujarat', 'Rajkot');
  }
  // 7. Tamil (Tamil Nadu)
  if (clean.startsWith('ta')) {
    return buildResult('ta', true, detectedLocale, 'Tamil Nadu', 'Thanjavur');
  }
  // 8. Telugu (Andhra Pradesh & Telangana)
  if (clean.startsWith('te')) {
    return buildResult('te', true, detectedLocale, 'Andhra Pradesh', 'Guntur');
  }
  // 9. Kannada (Karnataka)
  if (clean.startsWith('kn')) {
    return buildResult('kn', true, detectedLocale, 'Karnataka', 'Mysuru');
  }
  // 10. Odia (Odisha)
  if (clean.startsWith('or') || clean.startsWith('ory')) {
    return buildResult('or', true, detectedLocale, 'Odisha', 'Cuttack');
  }
  // 11. Assamese (Assam)
  if (clean.startsWith('as')) {
    return buildResult('as', true, detectedLocale, 'Assam', 'Kamrup');
  }
  // 12. Urdu (Pan-India / J&K)
  if (clean.startsWith('ur')) {
    return buildResult('ur', true, detectedLocale, 'Jammu & Kashmir', 'Srinagar');
  }
  // 13. Sanskrit (Pan-India)
  if (clean.startsWith('sa')) {
    return buildResult('sa', true, detectedLocale, 'Uttarakhand', 'Haridwar');
  }
  // 14. Sindhi (Gujarat & Maharashtra)
  if (clean.startsWith('sd')) {
    return buildResult('sd', true, detectedLocale, 'Gujarat', 'Kutch');
  }
  // 15. Kashmiri (Jammu & Kashmir)
  if (clean.startsWith('ks')) {
    return buildResult('ks', true, detectedLocale, 'Jammu & Kashmir', 'Srinagar');
  }
  // 16. Nepali (Sikkim & West Bengal)
  if (clean.startsWith('ne')) {
    return buildResult('ne', true, detectedLocale, 'Sikkim', 'East Sikkim');
  }
  // 17. Konkani (Goa & Coastal Karnataka)
  if (clean.startsWith('kok')) {
    return buildResult('kok', true, detectedLocale, 'Goa', 'North Goa');
  }
  // 18. Manipuri (Manipur)
  if (clean.startsWith('mni')) {
    return buildResult('mni', true, detectedLocale, 'Manipur', 'Imphal West');
  }
  // 19. Bodo (Assam)
  if (clean.startsWith('brx')) {
    return buildResult('brx', true, detectedLocale, 'Assam', 'Kokrajhar');
  }
  // 20. Dogri (Jammu)
  if (clean.startsWith('doi')) {
    return buildResult('doi', true, detectedLocale, 'Jammu & Kashmir', 'Jammu');
  }
  // 21. Maithili (Bihar & Jharkhand)
  if (clean.startsWith('mai')) {
    return buildResult('mai', true, detectedLocale, 'Bihar', 'Darbhanga');
  }
  // 22. Santali (Jharkhand, WB & Odisha)
  if (clean.startsWith('sat')) {
    return buildResult('sat', true, detectedLocale, 'Jharkhand', 'Ranchi');
  }

  // Default: English (Pan-India / ICAR National Standard)
  return buildResult('en', clean.startsWith('en'), detectedLocale, 'Punjab', 'Ludhiana');
}

function buildResult(
  code: LanguageCode,
  isAutoDetected: boolean,
  detectedLocale: string,
  defaultState: string,
  defaultDistrict: string
): DetectedLanguageInfo {
  const langOpt = SUPPORTED_LANGUAGES.find((l) => l.code === code) || SUPPORTED_LANGUAGES[0];
  return {
    code,
    label: langOpt.label,
    nativeLabel: langOpt.nativeLabel,
    flag: langOpt.flag,
    isAutoDetected,
    detectedLocale,
    defaultState,
    defaultDistrict,
  };
}
