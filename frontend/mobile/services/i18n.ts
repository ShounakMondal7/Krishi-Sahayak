/**
 * i18n.ts — Multilingual Pan-India localization dictionary for Krishi Sahayak.
 *
 * English is the primary default language.
 * Covers all 22 official Eighth Schedule Indian languages + English (23 total):
 *   - English (en) [Default First]
 *   - हिन्दी (hi) - Hindi
 *   - বাংলা (bn) - Bengali
 *   - मराठी (mr) - Marathi
 *   - తెలుగు (te) - Telugu
 *   - தமிழ் (ta) - Tamil
 *   - ગુજરાતી (gu) - Gujarati
 *   - اردو (ur) - Urdu
 *   - ಕನ್ನಡ (kn) - Kannada
 *   - ଓଡ଼ିଆ (or) - Odia
 *   - മലയാളം (ml) - Malayalam
 *   - ਪੰਜਾਬੀ (pa) - Punjabi
 *   - অসমীয়া (as) - Assamese
 *   - मैथिली (mai) - Maithili
 *   - ᱥᱟᱱᱛᱟᱲᱤ (sat) - Santali
 *   - کأشُر (ks) - Kashmiri
 *   - नेपाली (ne) - Nepali
 *   - कोंकणी (kok) - Konkani
 *   - سنڌي / सिंधी (sd) - Sindhi
 *   - डोगरी (doi) - Dogri
 *   - ꯃꯤꯇꯩꯂꯣꯟ (mni) - Manipuri / Meitei
 *   - बड़ो (brx) - Bodo
 *   - संस्कृतम् (sa) - Sanskrit
 */

export type LanguageCode =
  | 'en'
  | 'hi'
  | 'bn'
  | 'mr'
  | 'te'
  | 'ta'
  | 'gu'
  | 'ur'
  | 'kn'
  | 'or'
  | 'ml'
  | 'pa'
  | 'as'
  | 'mai'
  | 'sat'
  | 'ks'
  | 'ne'
  | 'kok'
  | 'sd'
  | 'doi'
  | 'mni'
  | 'brx'
  | 'sa';

export interface LanguageOption {
  code: LanguageCode;
  label: string;
  nativeLabel: string;
  regionHint: string;
  flag: string;
}

export const SUPPORTED_LANGUAGES: LanguageOption[] = [
  { code: 'en', label: 'English', nativeLabel: 'English', regionHint: 'Default First / Pan-India', flag: '🇬🇧' },
  { code: 'hi', label: 'Hindi', nativeLabel: 'हिन्दी', regionHint: 'North & Central India', flag: '🇮🇳' },
  { code: 'bn', label: 'Bengali', nativeLabel: 'বাংলা', regionHint: 'West Bengal & Tripura', flag: '🌱' },
  { code: 'mr', label: 'Marathi', nativeLabel: 'मराठी', regionHint: 'Maharashtra & Goa', flag: '🌾' },
  { code: 'te', label: 'Telugu', nativeLabel: 'తెలుగు', regionHint: 'Andhra Pradesh & Telangana', flag: '🌿' },
  { code: 'ta', label: 'Tamil', nativeLabel: 'தமிழ்', regionHint: 'Tamil Nadu & Puducherry', flag: '🌾' },
  { code: 'gu', label: 'Gujarati', nativeLabel: 'ગુજરાતી', regionHint: 'Gujarat', flag: '🌻' },
  { code: 'ur', label: 'Urdu', nativeLabel: 'اردو', regionHint: 'Pan-India / J&K', flag: '📜' },
  { code: 'kn', label: 'Kannada', nativeLabel: 'ಕನ್ನಡ', regionHint: 'Karnataka', flag: '🍃' },
  { code: 'or', label: 'Odia', nativeLabel: 'ଓଡ଼ିଆ', regionHint: 'Odisha', flag: '🌿' },
  { code: 'ml', label: 'Malayalam', nativeLabel: 'മലയാളം', regionHint: 'Kerala & Lakshadweep', flag: '🌴' },
  { code: 'pa', label: 'Punjabi', nativeLabel: 'ਪੰਜਾਬੀ', regionHint: 'Punjab & Haryana', flag: '🌾' },
  { code: 'as', label: 'Assamese', nativeLabel: 'অসমীয়া', regionHint: 'Assam & North East', flag: '🍵' },
  { code: 'mai', label: 'Maithili', nativeLabel: 'मैथिली', regionHint: 'Bihar & Jharkhand', flag: '🌾' },
  { code: 'sat', label: 'Santali', nativeLabel: 'ᱥᱟᱱᱛᱟᱲᱤ', regionHint: 'Jharkhand, WB & Odisha', flag: '🏹' },
  { code: 'ks', label: 'Kashmiri', nativeLabel: 'کأشُر', regionHint: 'Jammu & Kashmir', flag: '🏔️' },
  { code: 'ne', label: 'Nepali', nativeLabel: 'नेपाली', regionHint: 'Sikkim & West Bengal', flag: '⛰️' },
  { code: 'kok', label: 'Konkani', nativeLabel: 'कोंकणी', regionHint: 'Goa & Coastal Karnataka', flag: '🏖️' },
  { code: 'sd', label: 'Sindhi', nativeLabel: 'سنڌي / सिंधी', regionHint: 'Gujarat & Maharashtra', flag: '🌊' },
  { code: 'doi', label: 'Dogri', nativeLabel: 'डोगरी', regionHint: 'Jammu', flag: '🌄' },
  { code: 'mni', label: 'Manipuri / Meitei', nativeLabel: 'ꯃꯤꯇꯩꯂꯣꯟ', regionHint: 'Manipur', flag: '🌸' },
  { code: 'brx', label: 'Bodo', nativeLabel: 'बड़ो', regionHint: 'Assam', flag: '🎋' },
  { code: 'sa', label: 'Sanskrit', nativeLabel: 'संस्कृतम्', regionHint: 'Pan-India', flag: '🪷' },
];

// Import master localization dictionaries for all 23 languages
import enTranslations from '../locales/en.json';
import hiTranslations from '../locales/hi.json';
import bnTranslations from '../locales/bn.json';
import mrTranslations from '../locales/mr.json';
import teTranslations from '../locales/te.json';
import taTranslations from '../locales/ta.json';
import guTranslations from '../locales/gu.json';
import urTranslations from '../locales/ur.json';
import knTranslations from '../locales/kn.json';
import orTranslations from '../locales/or.json';
import mlTranslations from '../locales/ml.json';
import paTranslations from '../locales/pa.json';
import asTranslations from '../locales/as.json';
import maiTranslations from '../locales/mai.json';
import satTranslations from '../locales/sat.json';
import ksTranslations from '../locales/ks.json';
import neTranslations from '../locales/ne.json';
import kokTranslations from '../locales/kok.json';
import sdTranslations from '../locales/sd.json';
import doiTranslations from '../locales/doi.json';
import mniTranslations from '../locales/mni.json';
import brxTranslations from '../locales/brx.json';
import saTranslations from '../locales/sa.json';

import { ALL_DISTRICTS_LOCALIZED } from '../constants/district_translations';
import { translateLocation, STATE_TRANSLATIONS } from './locations';

export const TRANSLATIONS: Record<LanguageCode, Record<string, string>> = {
  en: enTranslations,
  hi: hiTranslations,
  bn: bnTranslations,
  mr: mrTranslations,
  te: teTranslations,
  ta: taTranslations,
  gu: guTranslations,
  ur: urTranslations,
  kn: knTranslations,
  or: orTranslations,
  ml: mlTranslations,
  pa: paTranslations,
  as: asTranslations,
  mai: maiTranslations,
  sat: satTranslations,
  ks: ksTranslations,
  ne: neTranslations,
  kok: kokTranslations,
  sd: sdTranslations,
  doi: doiTranslations,
  mni: mniTranslations,
  brx: brxTranslations,
  sa: saTranslations,
};

export const getTranslation = (lang: LanguageCode, key: string): string => {
  if (!key) return '';
  const langDict = TRANSLATIONS[lang] || TRANSLATIONS.en || {};
  const enDict = TRANSLATIONS.en || {};

  // 1. Direct match in active language or English
  if (langDict[key]) return langDict[key];
  if (enDict[key]) return enDict[key];

  // 2. Try with/without crop_ prefix
  if (key.startsWith('crop_')) {
    const rawKey = key.slice(5);
    if (langDict[rawKey]) return langDict[rawKey];
    if (enDict[rawKey]) return enDict[rawKey];
  } else {
    const cropKey = 'crop_' + key;
    if (langDict[cropKey]) return langDict[cropKey];
    if (enDict[cropKey]) return enDict[cropKey];
  }

  // 3. Try with/without location_ prefix
  if (key.startsWith('location_')) {
    const locName = key.slice(9);
    if (langDict[locName]) return langDict[locName];
    if (enDict[locName]) return enDict[locName];
  }

  // 4. State & District Location Translation
  const locTrans = localizeLocationName(key, lang);
  if (locTrans && locTrans !== key) return locTrans;

  return key;
};

/**
 * Localizes any Indian State, Union Territory, or District (all 782 Indian Districts).
 * Displays pure English when lang === 'en'.
 * Matches both English and native scripts.
 */
export function localizeLocationName(name: string | null | undefined, lang: LanguageCode): string {
  if (!name || lang === 'en') return name || '';
  const trimmed = name.trim();

  // 1. Exact District Match from 782-District Database
  if (ALL_DISTRICTS_LOCALIZED[trimmed]?.[lang]) {
    return ALL_DISTRICTS_LOCALIZED[trimmed]![lang]!;
  }

  // 1b. Normalized District Match (case/punctuation insensitive)
  const cleanTrimmedDist = trimmed.toLowerCase().replace(/[^a-z0-9]/g, '');
  const matchedDistKey = Object.keys(ALL_DISTRICTS_LOCALIZED).find(
    (k) => k.toLowerCase().replace(/[^a-z0-9]/g, '') === cleanTrimmedDist
  );
  if (matchedDistKey && ALL_DISTRICTS_LOCALIZED[matchedDistKey]?.[lang]) {
    return ALL_DISTRICTS_LOCALIZED[matchedDistKey]![lang]!;
  }

  // 2. Direct State Match
  if (STATE_TRANSLATIONS[trimmed]?.[lang]) {
    return STATE_TRANSLATIONS[trimmed]![lang]!;
  }

  // 2b. Normalized State Match
  const cleanTrimmedState = trimmed.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '');
  const matchedStateKey = Object.keys(STATE_TRANSLATIONS).find(
    (k) => k.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]/g, '') === cleanTrimmedState
  );
  if (matchedStateKey && STATE_TRANSLATIONS[matchedStateKey]?.[lang]) {
    return STATE_TRANSLATIONS[matchedStateKey]![lang]!;
  }

  // 3. Comma-separated compound match (e.g. "Ambedkar Nagar, Uttar Pradesh")
  if (trimmed.includes(',')) {
    const parts = trimmed.split(',').map((p) => p.trim());
    return parts.map((p) => localizeLocationName(p, lang)).join(', ');
  }

  // 4. Fallback to translateLocation
  return translateLocation(trimmed, lang);
}

/**
 * Returns culturally resonant greetings tailored to the farmer's language and state.
 */
export function getFormattedFarmerGreeting(
  lang: LanguageCode,
  farmerName?: string,
  state?: string
): { greetingTitle: string; blessing: string; timeOfDay: string } {
  const LANGUAGE_GREETINGS: Record<LanguageCode, { prefix: string; honorific: string }> = {
    pa: { prefix: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ', honorific: 'ਜੀ' },
    bn: { prefix: 'নমস্কার', honorific: 'বাবু' },
    hi: { prefix: 'नमस्ते', honorific: 'जी' },
    ml: { prefix: 'നമസ്കാരം', honorific: '' },
    ta: { prefix: 'வணக்கம்', honorific: 'அவர்களே' },
    te: { prefix: 'నమస్కారం', honorific: 'గారు' },
    kn: { prefix: 'ನಮಸ್ಕಾರ', honorific: 'ಅವರೇ' },
    mr: { prefix: 'नमस्कार', honorific: 'जी' },
    gu: { prefix: 'નમસ્તે', honorific: 'ભાઈ' },
    or: { prefix: 'ନମସ୍କାର', honorific: 'ଆଜ୍ଞା' },
    as: { prefix: 'নমস্কাৰ', honorific: 'ডাঙৰীয়া' },
    en: { prefix: 'Welcome', honorific: '' },
    ur: { prefix: 'آداب', honorific: 'صاحب' },
    sa: { prefix: 'नमो नमः', honorific: 'महोदय' },
    sd: { prefix: 'नमस्कार', honorific: 'साहिब' },
    ks: { prefix: 'سلام', honorific: 'صاحب' },
    ne: { prefix: 'नमस्ते', honorific: 'ज्यू' },
    kok: { prefix: 'देव बरें करूं', honorific: 'बाब' },
    mni: { prefix: 'ꯈꯨꯔꯨꯃꯖꯔꯤ', honorific: '' },
    brx: { prefix: 'खुलुमबाय', honorific: '' },
    doi: { prefix: 'नमस्ते', honorific: 'जी' },
    mai: { prefix: 'प्रणाम', honorific: 'जी' },
    sat: { prefix: 'ᱡᱚᱦᱟᱨ', honorific: '' },
  };

  const defaultGreeting = LANGUAGE_GREETINGS[lang] || LANGUAGE_GREETINGS.en;
  let prefix = getTranslation(lang, 'greetingPrefix') || defaultGreeting.prefix;
  let honorific = getTranslation(lang, 'greetingHonorific') || defaultGreeting.honorific;

  const normState = (state || '').toLowerCase();
  if (lang === 'hi') {
    if (normState.includes('punjab') || normState.includes('haryana') || normState.includes('rajasthan')) {
      prefix = 'राम राम';
      honorific = 'जी';
    }
  } else if (lang === 'gu' && normState.includes('gujarat')) {
    prefix = 'જય શ્રી કૃષ્ણ';
  } else if (lang === 'mr' && normState.includes('maharashtra')) {
    prefix = 'राम राम';
    honorific = 'जी';
  }

  const localizedGuest = getTranslation(lang, 'guestFarmer') || getTranslation(lang, 'kisanMitra') || 'Farmer';
  const isGuest = !farmerName || farmerName.trim() === '' || farmerName.trim().toLowerCase() === 'guest farmer';
  const nameToUse = isGuest ? localizedGuest : farmerName!.trim();

  const honorificPart = honorific ? ` ${honorific}` : '';
  const greetingTitle = lang === 'en'
    ? `${prefix}, ${nameToUse}!`
    : `${prefix}, ${nameToUse}${honorificPart}`;

  const blessing = getTranslation(lang, 'greetingBlessing') || 'May your harvest be bountiful today 🌾';
  const timeOfDay = getTranslation(lang, 'heroSubtitleMorning') || 'Sunrise Farm Advisory • Direct from Field';

  return {
    greetingTitle,
    blessing,
    timeOfDay,
  };
}

/**
 * Historical Query Localization Dictionary & Resolver.
 */
const COMMON_QUERY_TRANSLATIONS: Record<string, Partial<Record<LanguageCode, string>>> = {
  rice_yellowing: {
    en: 'Why are rice plant leaves turning yellow? What medicine to spray?',
    hi: 'धान की पत्तियां पीली क्यों हो रही हैं? कौन सी दवा छिड़कें?',
    bn: 'ধানের পাতা হলুদ হচ্ছে কেন? কী ওষুধ দেব?',
    ml: 'നെൽച്ചെടിയുടെ ഇലകൾ മഞ്ഞനിറമാകുന്നത് എന്തുകൊണ്ട്? ഏത് മരുന്ന് തളിക്കണം?',
    ta: 'நெல் இலைகள் ஏன் மஞ்சளாகின்றன? என்ன மருந்து தெளிக்க வேண்டும்?',
    te: 'వరి ఆకులు ఎందుకు పసుపు రంగులోకి మారుతున్నాయి? ఏ మందు పిచికారీ చేయాలి?',
    kn: 'ಭತ್ತದ ಎಲೆಗಳು ಹಳದಿಯಾಗುತ್ತಿರುವುದು ಏಕೆ? ಯಾವ ಔಷಧಿ ಸಿಂಪಡಿಸಬೇಕು?',
    mr: 'भाताची पाने पिवळी का पडत आहेत? कोणते औषध फवारावे?',
    gu: 'ડાંગરના પાન કેમ પીળા પડી રહ્યા છે? કઈ દવા છાંટવી?',
    pa: 'ਝੋਨੇ ਦੇ ਪੱਤੇ ਪੀਲੇ ਕਿਉਂ ਪੈ ਰਹੇ ਹਨ? ਕਿਹੜੀ ਦਵਾਈ ਛਿੜਕਣੀ ਚਾਹੀਦੀ ਹੈ?',
    or: 'ଧାନ ଗଛର ପତ୍ର କାହିଁକି ହଳଦିଆ ପଡୁଛି? କେଉଁ ଔଷଧ ସ୍ପ୍ରେ କରିବି?',
    as: 'ধানৰ পাত কিয় হালধীয়া হৈছে? কি ঔষধ ছটিয়াব লাগিব?',
  },
  weather_forecast: {
    en: 'What is the current weather forecast for this week?',
    hi: 'इस सप्ताह का वर्तमान मौसम पूर्वानुमान क्या है?',
    bn: 'এই সপ্তাহের বর্তমান আবহাওয়ার পূর্বাভাস কী?',
    ml: 'ഈ ആഴ്ചയിലെ നിലവിലെ കാലാവസ്ഥാ പ്രവചനം എന്താണ്?',
    ta: 'இந்த வாரத்தின் தற்போதைய வானிலை முன்னறிவிப்பு என்ன?',
    te: 'ఈ వారం ప్రస్తుత వాతావరణ సూచన ఏమిటి?',
    kn: 'ಈ ವಾರದ ಪ್ರಸ್ತುತ ಹವಾಮಾನ ಮುನ್ಸೂಚನೆ ಏನು?',
    mr: 'या आठवड्याचा चालू हवामान अंदाज काय आहे?',
    gu: 'આ અઠવાડિયાની વર્તમાન હવામાન આગાહી શું છે?',
    pa: 'ਇਸ ਹਫ਼ਤੇ ਲਈ ਮੌਜੂਦਾ ਮੌਸਮ ਦਾ ਅਨੁਮਾਨ ਕੀ ਹੈ?',
    or: 'ଏହି ସପ୍ତାହ ପାଇଁ ବର୍ତ୍ତମାନର ପାଣିପାଗ ପୂର୍ବାନୁମାନ କ’ଣ?',
    as: 'এই সপ্তাহৰ বৰ্তমান বতৰৰ পূৰ্বাভাস কি?',
  },
  msp_rates: {
    en: 'What is the minimum support price (MSP) for paddy and wheat?',
    hi: 'धान और गेहूं का न्यूनतम समर्थन मूल्य (एमएसपी) क्या है?',
    bn: 'ধান ও গমের ন্যূনতম সহায়ক মূল্য (এমএসপি) কত?',
    ml: 'നെല്ലിനും ഗോതമ്പിനും ഉള്ള മിനിമം താങ്ങുവില (എം.എസ്.പി) എത്രയാണ്?',
    ta: 'நெல் மற்றும் கோதுமைக்கான குறைந்தபட்ச ஆதரவு விலை (MSP) என்ன?',
    te: 'వరి మరియు గోధుమలకు కనీస మద్దతు ధర (MSP) ఎంత?',
    kn: 'ಭತ್ತ ಮತ್ತು ಗೋಧಿ ಬೆಂಬಲ ಬೆಲೆ (MSP) ಎಷ್ಟು?',
    mr: 'भात आणि गव्हासाठी हमीभाव (MSP) किती आहे?',
    gu: 'ડાંગર અને ઘઉં માટે લઘુત્તમ ટેકાના ભાવ (MSP) કેટલા છે?',
    pa: 'ਝੋਨੇ ਅਤੇ ਕਣਕ ਲਈ ਘੱਟੋ-ਘੱਟ ਸਮਰਥਨ ਮੁੱਲ (MSP) ਕੀ ਹੈ?',
    or: 'ଧାନ ଏବଂ ଗହମ ପାଇଁ ସର୍ବନିମ୍ନ ସହାୟକ ମୂଲ୍ୟ (MSP) କେତେ?',
    as: 'ধান আৰু ঘেঁহুৰ বাবে ন্যূনতম সমৰ্থন মূল্য (MSP) কিমান?',
  },
  coconut_root_wilt: {
    en: 'How to treat root wilt disease in coconut palms?',
    hi: 'नारियल में जड़ सड़न रोग का उपचार कैसे करें?',
    bn: 'নারকেল গাছের শিকড় পচা রোগ কীভাবে নিরাময় করবেন?',
    ml: 'തെങ്ങിലെ കാറ്റുവീഴ്ച രോഗം എങ്ങനെ നിയന്ത്രിക്കാം?',
    ta: 'தென்னையில் வேர் வாடல் நோயை எப்படிக் குணப்படுத்துவது?',
    te: 'కొబ్బరి చెట్లలో వేరు కుళ్లు తెగులును ఎలా నివారించాలి?',
    kn: 'ತೆಂಗಿನ ಬೇರು ಕೊಳೆ ರೋಗವನ್ನು ಹೇಗೆ ಗುಣಪಡಿಸುವುದು?',
    mr: 'नारळातील मूळ कुज रोगावर कसा उपाय करावा?',
    gu: 'નાળિયેરમાં મૂળના સડા રોગની સારવાર કેવી રીતે કરવી?',
    pa: 'ਨਾਰੀਅਲ ਦੇ ਜੜ੍ਹ ਗਲਣ ਰੋਗ ਦਾ ਇਲਾਜ ਕਿਵੇਂ ਕਰੀਏ?',
    or: 'ନଡିଆ ଗଛର ଚେର ସଢା ରୋଗ କିପରି ଉପଶମ କରିବେ?',
    as: 'নাৰিকল গছৰ শিপা পচা ৰোগ কেনেকৈ নিৰাময় কৰিব?',
  },
  wheat_urea: {
    en: 'What is the recommended dose of urea for wheat crop?',
    hi: 'गेहूं की फसल के लिए यूरिया की अनुशंसित मात्रा क्या है?',
    bn: 'গম ফসলের জন্য ইউরিয়ার প্রস্তাবিত মাত্রা কত?',
    ml: 'ഗോതമ്പ് കൃഷിക്ക് ശുപാർശ ചെയ്യുന്ന യൂറിയയുടെ അളവ് എത്രയാണ്?',
    ta: 'கோதுமைப் பயிருக்கு பரிந்துரைக்கப்பட்ட யூரியா அளவு என்ன?',
    te: 'గోధుమ పంటకు సిఫార్సు చేసిన యూరియా మోతాదు ఎంత?',
    kn: 'ಗೋಧಿ ಬೆಳೆಗೆ ಯೂರಿಯಾದ ಶಿಫಾರಸು ಮಾಡಿದ ಪ್ರಮಾಣ ಎಷ್ಟು?',
    mr: 'गहू पिकासाठी युरियाचे शिफारस केलेले प्रमाण काय आहे?',
    gu: 'ઘઉંના પાક માટે યુરિયાનો ભલામણ કરેલ ડોઝ કેટલો છે?',
    pa: 'ਕਣਕ ਦੀ ਫਸਲ ਲਈ ਯੂਰੀਆ ਦੀ ਸਿਫਾਰਸ਼ ਕੀਤੀ ਖੁਰਾਕ ਕੀ ਹੈ?',
    or: 'ଗହମ ଫସଲ ପାଇଁ ୟୁରିଆର ସୁପାରିଶ ପରିମାଣ କେତେ?',
    as: 'ঘেঁহু খেতিৰ বাবে ইউৰিয়াৰ অনুমোদিত মাত্ৰা কিমান?',
  },
  cotton_bollworm: {
    en: 'How to control pink bollworm in cotton crop?',
    hi: 'कपास की फसल में गुलाबी सुंडी को कैसे नियंत्रित करें?',
    bn: 'তুলা ফসলে গোলাপী শুঁয়োপোকা কীভাবে দমন করবেন?',
    ml: 'പരുത്തിയിലെ പിങ്ക് കായ്തുരപ്പൻ പുഴുവിനെ എങ്ങനെ നിയന്ത്രിക്കാം?',
    ta: 'பருத்தியில் இளஞ்சிவப்பு காய்ப்புழுவை எவ்வாறு கட்டுப்படுத்துவது?',
    te: 'పత్తి పంటలో గులాబీ రంగు కాయ తొలుచు పురుగును ఎలా నివారించాలి?',
    kn: 'ಹತ್ತಿ ಬೆಳೆಯಲ್ಲಿ ಗುಲಾಬಿ ಕಾಯಿ ಕೊರೆಯುವ ಹುಳುವನ್ನು ಹೇಗೆ ನಿಯಂತ್ರಿಸುವುದು?',
    mr: 'कापूस पिकातील बोंडअळीचे नियंत्रण कसे करावे?',
    gu: 'કપાસના પાકમાં ગુલાબી ઇયળનું નિયંત્રણ કેવી રીતે કરવું?',
    pa: 'ਨਰਮੇ/ਕਪਾਹ ਵਿੱਚ ਗੁਲਾਬੀ ਸੁੰਡੀ ਦੀ ਰੋਕਥਾਮ ਕਿਵੇਂ ਕਰੀਏ?',
    or: 'କପା ଫସଲରେ ଗୋଲାପୀ ପୋକ କିପରି ନିୟନ୍ତ୍ରଣ କରିବେ?',
    as: 'কপাহ খেতিত গুলপীয়া বৰল কেনেকৈ নিয়ন্ত্ৰণ কৰিব?',
  },
  organic_pest: {
    en: 'What are organic pest management methods for vegetables?',
    hi: 'सब्जियों के लिए जैविक कीट प्रबंधन विधियां क्या हैं?',
    bn: 'শাকসবজির জন্য জৈব কীটনাশক পদ্ধতি কী কী?',
    ml: 'പച്ചക്കറികൾക്കുള്ള ജൈവ കീടനിയന്ത്രണ മാർഗ്ഗങ്ങൾ ഏവ?',
    ta: 'காய்கறிகளுக்கான இயற்கை பூச்சி மேலாண்மை முறைகள் யாவை?',
    te: 'కూరగాయలకు సేంద్రీయ తెగుళ్ల నివారణ పద్ధతులు ఏమిటి?',
    kn: 'ತರಕಾರಿಗಳಿಗೆ ಸಾವಯವ ಕೀಟ ನಿರ್ವಹಣಾ ವಿಧಾನಗಳು ಯಾವುವು?',
    mr: 'भाज्यांसाठी सेंद्रिय कीड व्यवस्थापन पद्धती कोणत्या आहेत?',
    gu: 'શાકભાજી માટે જૈવિક જીવાત નિયંત્રણ પદ્ધતિઓ કઈ છે?',
    pa: 'ਸਬਜ਼ੀਆਂ ਲਈ ਜੈਵਿਕ ਕੀਟ ਪ੍ਰਬੰਧਨ ਦੇ ਕਿਹੜੇ ਤਰੀਕੇ ਹਨ?',
    or: 'ପନିପରିବା ପାଇଁ ଜୈବିକ କୀଟନାଶକ ପଦ୍ଧତି କ’ଣ?',
    as: 'শাক-পাচলিৰ বাবে জৈৱিক কীট নিয়ন্ত্ৰণ পদ্ধতি কি কি?',
  },
  pm_kisan: {
    en: 'How to register for PM-Kisan Samman Nidhi scheme?',
    hi: 'पीएम-किसान सम्मान निधि योजना के लिए पंजीकरण कैसे करें?',
    bn: 'পিএম-কিষাণ সম্মান নিধি প্রকল্পে কীভাবে আবেদন করবেন?',
    ml: 'പി.എം-കിസാൻ സമ്മാൻ നിധി പദ്ധതിയിൽ എങ്ങനെ രജിസ്റ്റർ ചെയ്യാം?',
    ta: 'பிஎம்-கிசான் திட்டத்தில் எவ்வாறு பதிவு செய்வது?',
    te: 'పీఎం-కిసాన్ సమ్మాన్ నిధి పథకానికి ఎలా దరఖాస్తు చేసుకోవాలి?',
    kn: 'ಪಿಎಂ-ಕಿಸಾನ್ ಸಮ್ಮಾನ್ ನಿಧಿ ಯೋಜನೆಗೆ ನೋಂದಾಯಿಸುವುದು ಹೇಗೆ?',
    mr: 'पीएम-किसान सन्मान निधी योजनेसाठी नोंदणी कशी करावी?',
    gu: 'પીએમ-કિસાન સન્માન નિધિ યોજના માટે કેવી રીતે નોંધણી કરવી?',
    pa: 'ਪੀਐੱਮ-ਕਿਸਾਨ ਸਨਮਾਨ ਨਿਧੀ ਸਕੀਮ ਲਈ ਰਜਿਸਟ੍ਰੇਸ਼ਨ ਕਿਵੇਂ ਕਰੀਏ?',
    or: 'ପିଏମ୍-କିଷାନ ସମ୍ମାନ ନିଧି ଯୋଜନା ପାଇଁ କିପରି ପଞ୍ଜୀକରଣ କରିବେ?',
    as: 'পিএম-কিষাণ সন্মান নিধি আঁচনিৰ বাবে কেনেকৈ পঞ্জীয়ন কৰিব?',
  },
  dairy_mastitis: {
    en: 'How to prevent and treat bovine mastitis in dairy cows?',
    hi: 'दुधारू गायों में थनैला रोग की रोकथाम और उपचार कैसे करें?',
    bn: 'দুধেল গাভীর ওলানফোলা রোগ কীভাবে প্রতিরোধ ও চিকিৎসা করবেন?',
    ml: 'കറവപ്പശുക്കളിലെ അകിടുവീക്കം എങ്ങനെ തടയാം, ചികിത്സിക്കാം?',
    ta: 'கறவை மாடுகளின் மடிநோய் தடுப்பு மற்றும் சிகிச்சை முறைகள் என்ன?',
    te: 'పాడి ఆవులలో పొదుగు వాపు వ్యాధి నివారణ మరియు చికిత్స ఎలా?',
    kn: 'ಹೈನು ಹಸುಗಳಲ್ಲಿ ಕೆಚ್ಚಲು ಬಾವು ರೋಗ ತಡೆಗಟ್ಟುವುದು ಮತ್ತು ಚಿಕಿತ್ಸೆ ಹೇಗೆ?',
    mr: 'दुभत्या गाईंमध्ये मस्तान रोग प्रतिबंध व उपचार कसा करावा?',
    gu: 'દૂધાળા પશુઓમાં મસ્ટાઇટિસ (આંચળનો સોજો) રોગની સારવાર કેવી રીતે કરવી?',
    pa: 'ਦੁਧਾਰੂ ਗਾਵਾਂ ਵਿੱਚ ਲੇਵੇ ਦੀ ਸੋਜਸ਼ (ਮਸਟਾਈਟਿਸ) ਦੀ ਰੋਕਥਾਮ ਅਤੇ ਇਲਾਜ ਕਿਵੇਂ ਕਰੀਏ?',
    or: 'ଦୁଗ୍ଧ ଗାଈମାନଙ୍କର ଥନେଲା ରୋଗ କିପରି ନିରାକରଣ ଓ ଚିକିତ୍ସା କରିବେ?',
    as: 'গাখীৰতী গাইৰ ওহাৰ ফুলা ৰোগৰ প্ৰতিৰোধ আৰু চিকিৎসা কেনেকৈ কৰিব?',
  },
};

/**
 * Translates historical questions into the active language.
 */
export function translateHistoryQuery(query: string, lang: LanguageCode): string {
  if (!query || lang === 'en') return query;
  const q = query.trim().toLowerCase();

  if (q.includes('yellow') && (q.includes('rice') || q.includes('paddy') || q.includes('leaf') || q.includes('leaves'))) {
    return COMMON_QUERY_TRANSLATIONS.rice_yellowing[lang] || query;
  }
  if (q.includes('weather') || q.includes('forecast') || q.includes('rain')) {
    return COMMON_QUERY_TRANSLATIONS.weather_forecast[lang] || query;
  }
  if (q.includes('msp') || q.includes('minimum support price') || q.includes('support price')) {
    return COMMON_QUERY_TRANSLATIONS.msp_rates[lang] || query;
  }
  if (q.includes('root wilt') || (q.includes('coconut') && (q.includes('wilt') || q.includes('disease')))) {
    return COMMON_QUERY_TRANSLATIONS.coconut_root_wilt[lang] || query;
  }
  if (q.includes('urea') || (q.includes('wheat') && (q.includes('dose') || q.includes('fertilizer')))) {
    return COMMON_QUERY_TRANSLATIONS.wheat_urea[lang] || query;
  }
  if (q.includes('bollworm') || (q.includes('cotton') && q.includes('worm'))) {
    return COMMON_QUERY_TRANSLATIONS.cotton_bollworm[lang] || query;
  }
  if (q.includes('organic') && (q.includes('pest') || q.includes('vegetable'))) {
    return COMMON_QUERY_TRANSLATIONS.organic_pest[lang] || query;
  }
  if (q.includes('pm-kisan') || q.includes('pm kisan') || q.includes('samman nidhi')) {
    return COMMON_QUERY_TRANSLATIONS.pm_kisan[lang] || query;
  }
  if (q.includes('mastitis') || (q.includes('cow') && q.includes('disease'))) {
    return COMMON_QUERY_TRANSLATIONS.dairy_mastitis[lang] || query;
  }

  for (const item of Object.values(COMMON_QUERY_TRANSLATIONS)) {
    if (item.en && item.en.toLowerCase() === q) {
      return item[lang] || query;
    }
  }

  return query;
}
