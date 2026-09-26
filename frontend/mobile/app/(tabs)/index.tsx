/**
 * HomeScreen — Farmer-Centric AI Agricultural Advisory Interface.
 *
 * Sunlight-Readable & Voice-First Refactored Edition:
 * - ☀️ Sunlight-Readable High-Contrast Theme (Pure white #FFFFFF / #F8FAF8, deep dark slate #0F172A text)
 * - 🎙️ Voice-First Dashboard Hierarchy (Prominent 100px circular central Mic FAB, demoted secondary text input)
 * - 🔍 Scaled-Up Touch Targets (+20-30% padding, heights >= 48-56px, generous typography)
 * - 🚀 Mandatory Full-Screen 3-Step Onboarding Flow (Language -> Mobile/OTP/Kisan ID -> Location & GPS)
 * - 🌴 Botanical Crop Cards (Paddy, Wheat, Coconut, Cotton, Sugarcane, Spices, Mango, Mustard, Dairy, Tea)
 * - 🔊 Instant Audio TTS Playback on ICAR Grounded Answers
 * - ⚡ Multi-turn follow-up conversations & verified ICAR source citations
 */
import React, { useState, useRef, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
  Alert,
  Platform,
  KeyboardAvoidingView,
  Animated,
  Easing,
  Image,
  ImageBackground,
  Modal,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import { safeHaptics } from '../../services/haptics';
import { LinearGradient } from 'expo-linear-gradient';
import NetInfo from '@react-native-community/netinfo';
import axios from 'axios';
import Constants from 'expo-constants';

import AdvisoryResponseSheet from '../../components/AdvisoryResponseSheet';
import LanguageSelectorSheet from '../../components/LanguageSelectorSheet';
import LocationPickerModal from '../../components/LocationPickerModal';
import { storageService, offlineCacheService, FarmerProfile } from '../../services/storage';
import {
  LanguageCode,
  SUPPORTED_LANGUAGES,
  getTranslation,
  getFormattedFarmerGreeting,
} from '../../services/i18n';
import {
  getStateDetails,
  findStateForDistrict,
  getFormattedRegionTitle,
  translateLocation,
} from '../../services/locations';
import { detectDeviceLanguage } from '../../services/languageDetector';
import { fetchWeather, invalidateWeatherCache, WeatherData } from '../../services/weather';

const BASE_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig?.extra as any)?.apiUrl ||
  'http://localhost:8000';

// 🌅 Curated regional sunrise farm photography for Hero Banner (Unsplash high-resolution agricultural library)
const STATE_HERO_SUNRISE_IMAGES: Record<string, string> = {
  Punjab: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80',
  Haryana: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80',
  'Uttar Pradesh': 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80',
  Kerala: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=1200&auto=format&fit=crop&q=80',
  'Tamil Nadu': 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=1200&auto=format&fit=crop&q=80',
  'Andhra Pradesh': 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=1200&auto=format&fit=crop&q=80',
  Karnataka: 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=1200&auto=format&fit=crop&q=80',
  'West Bengal': 'https://images.unsplash.com/photo-1592982537447-7440770cbfc9?w=1200&auto=format&fit=crop&q=80',
  Maharashtra: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80',
  Gujarat: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80',
  default: 'https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=1200&auto=format&fit=crop&q=80',
};

// 🌿 Vibrant, Tactile Pan-India Crop Botanical Cards with Semi-Realistic Imagery
const CROP_CATEGORIES = [
  {
    id: 'paddy',
    name: 'Paddy / Rice',
    tag: 'Kharif',
    icon: 'sprout',
    color: '#16A34A',
    accent: '#E2725B',
    imageUrl: 'https://images.unsplash.com/photo-1536657464919-892534f60d6e?w=320&auto=format&fit=crop&q=80',
    query: 'What are the main pest control methods for paddy crops?',
  },
  {
    id: 'wheat',
    name: 'Wheat & Grain',
    tag: 'Rabi',
    icon: 'barley',
    color: '#D97706',
    accent: '#F59E0B',
    imageUrl: 'https://images.unsplash.com/photo-1574323347407-f5e1ad6d020b?w=320&auto=format&fit=crop&q=80',
    query: 'What is the recommended fertilizer schedule for wheat crop?',
  },
  {
    id: 'coconut',
    name: 'Coconut Palm',
    tag: 'Perennial',
    icon: 'palm-tree',
    color: '#059669',
    accent: '#10B981',
    imageUrl: 'https://images.unsplash.com/photo-1512428559087-560fa5ceab42?w=320&auto=format&fit=crop&q=80',
    query: 'How to manage root wilt and bud rot in coconut palms?',
  },
  {
    id: 'cotton',
    name: 'Cotton Crop',
    tag: 'Commercial',
    icon: 'flower-tulip-outline',
    color: '#0284C7',
    accent: '#E2725B',
    imageUrl: 'https://images.unsplash.com/photo-1606041008023-472dfb5e530f?w=320&auto=format&fit=crop&q=80',
    query: 'How to control pink bollworm and whitefly in cotton?',
  },
  {
    id: 'sugarcane',
    name: 'Sugarcane',
    tag: 'Cash Crop',
    icon: 'bamboo',
    color: '#15803D',
    accent: '#F59E0B',
    imageUrl: 'https://images.unsplash.com/photo-1599940824399-b87987ceb72a?w=320&auto=format&fit=crop&q=80',
    query: 'What is the standard drip irrigation and ratoon management for sugarcane?',
  },
  {
    id: 'spices',
    name: 'Pepper & Spices',
    tag: 'Spices',
    icon: 'chili-medium',
    color: '#DC2626',
    accent: '#E2725B',
    imageUrl: 'https://images.unsplash.com/photo-1596040033229-a9821ebd058d?w=320&auto=format&fit=crop&q=80',
    query: 'How to prevent quick wilt disease in black pepper?',
  },
  {
    id: 'mango',
    name: 'Fruit Orchards',
    tag: 'Orchard',
    icon: 'tree',
    color: '#EA580C',
    accent: '#F59E0B',
    imageUrl: 'https://images.unsplash.com/photo-1553279768-865429fa0078?w=320&auto=format&fit=crop&q=80',
    query: 'How to control fruit fly infestation in mango trees?',
  },
  {
    id: 'mustard',
    name: 'Mustard & Oilseeds',
    tag: 'Oilseeds',
    icon: 'flower',
    color: '#CA8A04',
    accent: '#F59E0B',
    imageUrl: 'https://images.unsplash.com/photo-1508873696983-2df5703bc20d?w=320&auto=format&fit=crop&q=80',
    query: 'What is the treatment for white rust and aphid in mustard?',
  },
  {
    id: 'dairy',
    name: 'Dairy & Cattle',
    tag: 'Livestock',
    icon: 'cow',
    color: '#0891B2',
    accent: '#06B6D4',
    imageUrl: 'https://images.unsplash.com/photo-1570042225831-d98fa7577f1e?w=320&auto=format&fit=crop&q=80',
    query: 'What is the prevention and treatment protocol for cow mastitis?',
  },
  {
    id: 'tea',
    name: 'Tea & Coffee',
    tag: 'Plantation',
    icon: 'tea',
    color: '#0D9488',
    accent: '#14B8A6',
    imageUrl: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=320&auto=format&fit=crop&q=80',
    query: 'How to manage red spider mite and blister blight in tea plantations?',
  },
];

interface SourceLabel {
  filename: string;
  display_name: string;
  relevance_score?: number;
}

interface QueryResponse {
  query_id?: number;
  conversation_id?: string;
  answer: string;
  answer_english: string;
  sources: string[];
  source_labels: SourceLabel[];
  response_time_ms: number;
  from_cache: boolean;
  weather_context_used: boolean;
  market_context_used: boolean;
}

interface VoiceQueryResponse extends QueryResponse {
  transcribed_text: string;
}

export interface TimeOfDayDetails {
  period: 'morning' | 'afternoon' | 'evening' | 'night';
  advisoryTitle: string;
  gradientColors: [string, string, string];
  icon: 'white-balance-sunny' | 'weather-sunny' | 'weather-sunset-down' | 'weather-night';
  defaultGreetingEn: string;
  defaultGreetingHi: string;
  greetingPrefixMap: Partial<Record<LanguageCode, string>> & { en: string };
  blessingMap: Partial<Record<LanguageCode, string>> & { en: string };
}

/**
 * Dynamic Time-of-Day Advisory Classifier:
 * - 05:00 - 11:59: "Morning Agro Advisory" (Warm Sunrise gradient)
 * - 12:00 - 16:59: "Afternoon Agro Advisory" (Bright Blue gradient)
 * - 17:00 - 19:59: "Evening Agro Advisory" (Sunset Orange/Purple gradient)
 * - 20:00 - 04:59: "Night Agro Advisory" (Deep Navy/Indigo gradient)
 */
export function getTimeOfDayDetails(date = new Date()): TimeOfDayDetails {
  const hour = date.getHours();

  if (hour >= 5 && hour < 12) {
    return {
      period: 'morning',
      advisoryTitle: 'Morning Agro Advisory',
      icon: 'white-balance-sunny',
      gradientColors: ['rgba(217, 119, 6, 0.45)', 'rgba(180, 83, 9, 0.75)', 'rgba(15, 23, 42, 0.92)'],
      defaultGreetingEn: 'Good Morning',
      defaultGreetingHi: 'शुभ प्रभात',
      greetingPrefixMap: {
        en: 'Good Morning',
        hi: 'शुभ प्रभात',
        ml: 'സുപ്രഭാതം',
        ta: 'காலை வணக்கம்',
        te: 'శుభోదయం',
        kn: 'ಶುಭೋದಯ',
        bn: 'সুপ্রভাত',
        mr: 'शुभ प्रभात',
        gu: 'સુપ્રભાત',
        pa: 'ਸ਼ੁਭ ਸਵੇਰ',
        or: 'ଶୁଭ ପ୍ରଭାତ',
        as: 'সুপ্ৰভাত',
        ur: 'صبح بخیر',
        sa: 'सुप्रभातम्',
        sd: 'صبح جو سلام',
        ks: 'صُبحک سلام',
        ne: 'शुभ प्रभात',
        kok: 'देव बरे दिस दींव',
        mni: 'ꯑꯌꯨꯛꯀꯤ ꯈꯨꯔꯨꯃꯖꯔꯤ',
        brx: 'फुंनि खुलुमबाय',
        doi: 'शुभ प्रभात',
        mai: 'शुभ प्रभात',
        sat: 'ᱥᱮᱛᱟᱜ ᱡᱚᱦᱟᱨ',
      },
      blessingMap: {
        en: 'May your morning harvest be bountiful today 🌾',
        hi: 'आज आपकी सुबह की फसल भरपूर और समृद्ध हो 🌾',
        ml: 'ഇന്നത്തെ പ്രഭാതം നിങ്ങളുടെ കൃഷിക്ക് ഐശ്വര്യപ്രദമാകട്ടെ 🌾',
        ta: 'இன்றைய விடியல் உங்கள் பயிர்களுக்கு செழிப்பைத் தரட்டும் 🌾',
        te: 'నేటి ఉదయం మీ పంటలకు సమృద్ధిని కలిగించుగాక 🌾',
        kn: 'ಇಂದಿನ ಮುಂಜಾನೆ ನಿಮ್ಮ ಬೆಳೆಗಳಿಗೆ ಸಮೃದ್ಧಿಯನ್ನು ನೀಡಲಿ 🌾',
        bn: 'আজকের সকাল আপনার ফসলের জন্য বরকতময় হোক 🌾',
        mr: 'आजची सकाळ तुमच्या शेतीसाठी भरभराटीची ठरो 🌾',
        gu: 'આજની સવાર તમારી ખેતી માટે ફળદાયી રહે 🌾',
        pa: 'ਅੱਜ ਦੀ ਸਵੇਰ ਤੁਹਾਡੀ ਫ਼ਸਲ ਲਈ ਬਰਕਤਾਂ ਭਰੀ ਹੋਵੇ 🌾',
        or: 'ଆଜିର ସକାଳ ଆପଣଙ୍କ ଫସଲ ପାଇଁ ସମୃଦ୍ଧିମୟ ହେଉ 🌾',
        as: 'আজিৰ পুৱাটো আপোনাৰ খেতিৰ বাবে সমৃদ্ধিময় হওক 🌾',
        ur: 'آج صبح کی فصل آپ کے لیے برکت والی ہو 🌾',
        sa: 'अद्य भवतः प्रभातफलं समृद्धिकरं भवतु 🌾',
        sd: 'اڄوڪي صبح توهان جي فصل لاءِ سرسبز رهي 🌾',
        ks: 'اَزکٕہ صُبحٕک فصل گژھِ برکت دار آسُن 🌾',
        ne: 'आज बिहानको बाली तपाईंको लागि फलदायी रहोस् 🌾',
        kok: 'आयचो सकाळचो पीक तुमकां समृद्धी हाडून दींव 🌾',
        mni: 'ꯉꯁꯤ ꯑꯌꯨꯛꯀꯤ ꯂꯧ-ꯁꯤꯡ ꯅꯍꯥꯛꯀꯤꯗꯃꯛ ꯊꯧꯔꯥꯡꯕ ꯑꯣꯏꯔꯁꯅꯨ 🌾',
        brx: 'दिनैनि फुंनि फसलआ नोंथांनि थाखाय गोजोनथि लाबोगोन 🌾',
        doi: 'अज्जै दी तड़के दी फसल तुंदे लेई समृद्ध होऐ 🌾',
        mai: 'आईनक भोरुक फसल अपनेक लेल समृद्धिकारक होअय 🌾',
        sat: 'ᱛᱮᱦᱮᱧᱟᱜ ᱥᱮᱛᱟᱜ ᱟᱨᱡᱟᱣ ᱟᱢ ᱞᱟᱹᱜᱤᱫ ᱥᱟᱨᱠᱚᱜ ᱢᱟ 🌾',
      },
    };
  } else if (hour >= 12 && hour < 17) {
    return {
      period: 'afternoon',
      advisoryTitle: 'Afternoon Agro Advisory',
      icon: 'weather-sunny',
      gradientColors: ['rgba(2, 132, 199, 0.45)', 'rgba(3, 105, 161, 0.75)', 'rgba(15, 23, 42, 0.92)'],
      defaultGreetingEn: 'Good Afternoon',
      defaultGreetingHi: 'शुभ दोपहर',
      greetingPrefixMap: {
        en: 'Good Afternoon',
        hi: 'शुभ दोपहर',
        ml: 'നമസ്കാരം',
        ta: 'மதிய வணக்கம்',
        te: 'శుభ మధ్యాహ్నం',
        kn: 'ಶುಭ ಮಧ್ಯಾಹ್ನ',
        bn: 'শুভ দুপুর',
        mr: 'शुभ दुपार',
        gu: 'શુભ બપોર',
        pa: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ',
        or: 'ଶୁଭ ଅପରାହ୍ନ',
        as: 'শুভ অপৰাহ্ণ',
        ur: 'دوپہر بخیر',
        sa: 'शुभापराह्णम्',
        sd: 'منجھند جو سلام',
        ks: 'دۄپہرک سلام',
        ne: 'शुभ दिउँसो',
        kok: 'बरे उपरान',
        mni: 'ꯅꯨꯃꯤꯗꯥꯡꯋꯥꯏ ꯈꯨꯔꯨꯃꯖꯔꯤ',
        brx: 'बेलासिनि खुलुमबाय',
        doi: 'शुभ दुपहर',
        mai: 'शुभ दोपहर',
        sat: 'ᱛᱤᱠᱤᱱ ᱡᱚᱦᱟᱨ',
      },
      blessingMap: {
        en: 'Stay hydrated during field inspection this afternoon ☀️',
        hi: 'दोपहर में खेत निरीक्षण के दौरान पर्याप्त पानी पिएं ☀️',
        ml: 'ഉച്ചവെയിലിൽ കൃഷിയിടത്തിൽ ആവശ്യത്തിന് വെള്ളം കുടിക്കുക ☀️',
        ta: 'பிற்பகல் களப்பணியின் போது போதிய தண்ணீர் குடியுங்கள் ☀️',
        te: 'మధ్యాహ్న పొలం పనులలో తగినంత నీరు త్రాగండి ☀️',
        kn: 'ಮಧ್ಯಾಹ್ನದ ಹೊಲ ತಪಾಸಣೆಯ ಸಮಯದಲ್ಲಿ ಸಾಕಷ್ಟು ನೀರು ಕುಡಿಯಿರಿ ☀️',
        bn: 'দুপুরে মাঠ পরিদর্শনের সময় প্রচুর জল পান করুন ☀️',
        mr: 'दुपारी शेतीकामाच्या वेळी भरपूर पाणी प्या ☀️',
        gu: 'બપોરે ખેતરની મુલાકાત વખતે પૂરતું પાણી પીઓ ☀️',
        pa: 'ਦੁਪਹਿਰੇ ਖੇਤ ਦੇ ਕੰਮ ਦੌਰਾਨ ਪਾਣੀ ਜ਼ਰੂਰ ਪੀਂਦੇ ਰਹੋ ☀️',
        or: 'ଅପରାହ୍ନରେ ବିଲ କାମ ସମୟରେ ପ୍ରଚୁର ପାଣି ପିଅନ୍ତୁ ☀️',
        as: 'দুপৰীয়া খেতি পথাৰত কাম কৰাৰ সময়ত প্ৰচুৰ পানী খাওক ☀️',
        ur: 'دوپہر میں کھیت کے معائنے کے دوران پانی ضرور پئیں ☀️',
        sa: 'अपराह्णे क्षेत्रनिरीक्षणसमये पर्याप्तं जलं पिबतु ☀️',
        sd: 'منجهند جو ٻنيءَ جي چڪاس دوران ڪافي پاڻي پيئو ☀️',
        ks: 'دۄپہرس منٛز کؠتن ہُنٛد چکر لگاونہٕ وزِ آب چِوو ☀️',
        ne: 'दिउँसो खेत निरीक्षण गर्दा प्रशस्त पानी पिउनुहोस् ☀️',
        kok: 'दुपारां शेताचे तपासणे वेळार भरपूर उदक पियात ☀️',
        mni: 'ꯅꯨꯃꯤꯗꯥꯡꯋꯥꯏ ꯂꯧꯕꯨꯛ ꯌꯦꯡꯁꯤꯟꯕ ꯃꯇꯝꯗ ꯏꯁꯤꯡ ꯀꯟꯅ ꯊꯛꯄꯤꯌꯨ ☀️',
        brx: 'बेलासिआव फोथार नायदिंनाय समाव थोजासे दै लों ☀️',
        doi: 'दुपहरे च खेत दा चक्कर लांदे बेल्लै मते पानी पियो ☀️',
        mai: 'दुपहरिया मे खेत देखरेख करैत काल पर्याप्त पानि पिबू ☀️',
        sat: 'ᱛᱤᱠᱤᱱ ᱵᱮᱲᱟ ᱠᱷᱮᱛ ᱧᱮᱞ ᱡᱚᱦᱚᱜ ᱟᱹᱰᱤ ᱫᱟᱜ ᱧᱩᱭ ᱢᱮ ☀️',
      },
    };
  } else if (hour >= 17 && hour < 20) {
    return {
      period: 'evening',
      advisoryTitle: 'Evening Agro Advisory',
      icon: 'weather-sunset-down',
      gradientColors: ['rgba(234, 88, 12, 0.45)', 'rgba(124, 58, 237, 0.75)', 'rgba(15, 23, 42, 0.92)'],
      defaultGreetingEn: 'Good Evening',
      defaultGreetingHi: 'शुभ संध्या',
      greetingPrefixMap: {
        en: 'Good Evening',
        hi: 'शुभ संध्या',
        ml: 'ശുഭ സായാഹ്നം',
        ta: 'மாலை வணக்கம்',
        te: 'శుభ సాయంత్రం',
        kn: 'ಶುಭ ಸಂಜೆ',
        bn: 'শুভ সন্ধ্যা',
        mr: 'शुभ संध्याकाळ',
        gu: 'શુભ સાંજ',
        pa: 'ਸ਼ੁਭ ਸ਼ਾਮ',
        or: 'ଶୁଭ ସନ୍ଧ୍ୟା',
        as: 'শুভ সন্ধিয়া',
        ur: 'شام بخیر',
        sa: 'शुभसायम्',
        sd: 'سانجھ جو سلام',
        ks: 'شامک سلام',
        ne: 'शुभ सन्ध्या',
        kok: 'बरी सांज',
        mni: 'ꯅꯨꯃꯤꯗꯥꯡ ꯈꯨꯔꯨꯃꯖꯔꯤ',
        brx: 'सान्दाउनि खुलुमबाय',
        doi: 'शुभ संझ',
        mai: 'शुभ संध्या',
        sat: 'ᱟᱹᱭᱩᱵ ᱡᱚᱦᱟᱨ',
      },
      blessingMap: {
        en: 'Plan your irrigation and pest check for tomorrow 🌾',
        hi: 'कल के लिए सिंचाई और कीट नियंत्रण की योजना बनाएं 🌾',
        ml: 'നാളത്തെ നനയും കീടനിയന്ത്രണവും മുൻകൂട്ടി പ്ലാൻ ചെയ്യാം 🌾',
        ta: 'நாளைய பாசனம் மற்றும் பூச்சி கண்காணிப்பை திட்டமிடுங்கள் 🌾',
        te: 'రేపటి నీటిపారుదల మరియు తెగుళ్ల పరిశీలనను ప్రణాళిక చేసుకోండి 🌾',
        kn: 'ನಾಳೆಯ ನೀರಾವರಿ ಮತ್ತು ಕೀಟ ಪರಿಶೀಲನೆಯನ್ನು ಯೋಜಿಸಿ 🌾',
        bn: 'আগামীকালের সেच ও পোকা দমনের পরিকল্পনা তৈরি করুন 🌾',
        mr: 'उद्याच्या पाणी व्यवस्थापनाचे व कीड तपासणीचे नियोजन करा 🌾',
        gu: 'આવતીકાલ માટે પિયત અને જીવાત નિયંત્રણનું આયોજન કરો 🌾',
        pa: 'ਕੱਲ੍ਹ ਦੀ ਸਿੰਚਾਈ ਅਤੇ ਕੀਟ ਪ੍ਰਬੰਧਨ ਦੀ ਯੋਜਨਾ ਬਣਾਓ 🌾',
        or: 'ଆସନ୍ତାକାଲି ପାଇଁ ଜଳସେଚନ ଓ କୀଟ ନିୟନ୍ତ୍ରଣ ଯୋଜନା କରନ୍ତୁ 🌾',
        as: 'কাইলৈৰ জলসিঞ্চন আৰু কীট পৰীক্ষাৰ পৰিকল্পনা কৰক 🌾',
        ur: 'کل کے لیے آبپاشی اور کیڑوں کی جانچ کی منصوبہ بندی کریں 🌾',
        sa: 'श्वस्तनसेचनस्य कीटपरीक्षणस्य च योजनां रचयतु 🌾',
        sd: 'سڀاڻي لاءِ پاڻي ڏيڻ ۽ جيتن جي بچاءَ جي رٿابندي ڪريو 🌾',
        ks: 'پگاہس خٲطرٕ کؠتن آب دِنٕک تہٕ کؠمن ہُنٛد بندوبست کٔرِو 🌾',
        ne: 'भोलिको सिँचाइ र कीरा नियन्त्रणको योजना बनाउनुहोस् 🌾',
        kok: 'फाल्यांचे उदक दिवपाची आनी किडींची तपासणी येवजण करात 🌾',
        mni: 'ꯍꯌꯦꯡꯒꯤ ꯏꯁꯤꯡ ꯆꯩꯁꯤꯟꯕ ꯑꯃꯁꯨꯡ ꯇꯤꯟ-ꯀꯥꯡ ꯌꯦꯡꯁꯤꯟꯕꯒꯤ ꯊꯧꯔꯥꯡ ꯇꯧꯕꯤꯌꯨ 🌾',
        brx: 'गाबोननि दै होनै आरो एंगार-गियान नायबिजिरनायनि थाखाय बिथांखि ला 🌾',
        doi: 'कल लेई सिंचाई ते कीड़े नियंत्रण दी योजना बणाओ 🌾',
        mai: 'काल्हिक पटौनी आ कीटनाशक छिड़कावक योजना बनाउ 🌾',
        sat: 'ᱜᱟᱯᱟ ᱞᱟᱹᱜᱤᱫ ᱫᱟᱜ ᱯᱟᱴᱟᱣ ᱟᱨ ᱛᱤᱡᱩ ᱧᱮᱞ ᱨᱮᱭᱟᱜ ᱯᱞᱟᱱ ᱵᱮᱱᱟᱣ ᱢᱮ 🌾',
      },
    };
  } else {
    return {
      period: 'night',
      advisoryTitle: 'Night Agro Advisory',
      icon: 'weather-night',
      gradientColors: ['rgba(30, 58, 138, 0.50)', 'rgba(15, 23, 42, 0.88)', 'rgba(2, 6, 23, 0.95)'],
      defaultGreetingEn: 'Good Night',
      defaultGreetingHi: 'शुभ रात्रि',
      greetingPrefixMap: {
        en: 'Good Night',
        hi: 'शुभ रात्रि',
        ml: 'നമസ്കാരം',
        ta: 'இனிய இரவு',
        te: 'శుభ రాత్రి',
        kn: 'ಶುಭ ರಾತ್ರಿ',
        bn: 'শুভ রাত্রি',
        mr: 'शुभ रात्री',
        gu: 'શુભ રાત્રિ',
        pa: 'ਸਤਿ ਸ੍ਰੀ ਅਕਾਲ',
        or: 'ଶୁଭ ରାତ୍ରି',
        as: 'শুভ ৰাত্ৰি',
        ur: 'شب بخیر',
        sa: 'शुभरात्रिः',
        sd: 'شب بخير',
        ks: 'شب بخیر',
        ne: 'शुभ रात्रि',
        kok: 'बरी रात',
        mni: 'ꯅꯨꯃꯤꯗꯥꯡ ꯅꯨꯡꯉꯥꯏꯕ ꯇꯨꯝꯕꯤꯌꯨ',
        brx: 'हरनि खुलुमबाय',
        doi: 'शुभ रात',
        mai: 'शुभ रात्रि',
        sat: 'ᱧᱤᱫᱟᱹ ᱡᱚᱦᱟᱨ',
      },
      blessingMap: {
        en: 'Rest well after a hard day in the fields 🌙',
        hi: 'खेतों में दिनभर की कड़ी मेहनत के बाद शुभ विश्राम 🌙',
        ml: 'കൃഷിയിടത്തിലെ അധ്വാനത്തിന് ശേഷം സുഖനിദ്ര ആശംസിക്കുന്നു 🌙',
        ta: 'வயல்வெளி உழைப்பிற்குப் பின் இனிய ஓய்வு 🌙',
        te: 'పొలంలో కష్టపడిన తర్వాత హాయిగా విశ్రాంతి తీసుకోండి 🌙',
        kn: 'ಹೊಲದ ಕಠಿಣ ದುಡಿಮೆಯ ನಂತರ ಸುಖಕರ ವಿಶ್ರಾಂತಿ 🌙',
        bn: 'মাঠের কঠোর পরিশ্রমের পর সুন্দর বিশ্রামের কামনা 🌙',
        mr: 'शेतकामाच्या कष्टांनंतर शांत विश्रांती घ्या 🌙',
        gu: 'ખેતરના પરિશ્રમ પછી શાંત આराમ કરો 🌙',
        pa: 'ਖੇਤਾਂ ਵਿੱਚ ਸਖ਼ਤ ਮਿਹਨਤ ਤੋਂ ਬਾਅਦ ਸੁਖਾਲਾ ਆਰਾਮ ਕਰੋ 🌙',
        or: 'ବିଲ କାମ ପରେ ଆରାମରେ ବିଶ୍ରାମ ନିଅନ୍ତୁ 🌙',
        as: 'পথাৰৰ কষ্টৰ অন্তত সুନ୍ଦৰ বিশ্ৰাম লওক 🌙',
        ur: 'کھیتوں میں محنت کے بعد آرام دہ نیند 🌙',
        sa: 'क्षेत्रे श्रमानन्तरं सुखनिद्रा 🌙',
        sd: 'ٻنين ۾ سخت پورهئي کانپوءِ سٺو آرام 🌙',
        ks: 'کؠتن منٛز مِحنت پتہٕ آرام کٔرِو 🌙',
        ne: 'खेतमा कडा परिश्रमपछि आराम गर्नुहोस् 🌙',
        kok: 'शेतांतल्या कश्टां उपरांत बरो विसव घेयात 🌙',
        mni: 'ꯂꯧꯕꯨꯛꯇ ꯀꯟꯅ ꯍꯣꯠꯅꯔꯕ ꯃꯇꯨꯡꯗ ꯅꯨꯡꯉꯥꯏꯅ ꯄꯣꯊꯥꯕꯤꯌꯨ 🌙',
        brx: 'फोथाराव खामानि मावनायनि उनाव मोजाङै बिस्राम ला 🌙',
        doi: 'खेतें च कड्डी मेहनत दे बाद आराम करो 🌙',
        mai: 'खेत मे दिनभरि मिहनत कएलाक बाद आराम करू 🌙',
        sat: 'ᱠᱷᱮᱛ ᱨᱮ ᱠᱟᱹᱢᱤ ᱛᱟᱭᱚᱢ ᱱᱟᱯᱟᱭ ᱡᱤᱨᱟᱹᱣ ᱢᱮ 🌙',
      },
    };
  }
}

export default function HomeScreen() {
  const [currentLang, setCurrentLang] = useState<LanguageCode>('en');
  const [farmerProfile, setFarmerProfile] = useState<FarmerProfile | null>(null);
  const [question, setQuestion] = useState('');
  const [selectedState, setSelectedState] = useState<string>('Punjab');
  const [region, setRegion] = useState('Ludhiana');
  const [selectedCropId, setSelectedCropId] = useState<string>('paddy');

  // Navigation sheets & Modals
  const [showLanguageSheet, setShowLanguageSheet] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [showLocationModal, setShowLocationModal] = useState(false);
  const [weatherData, setWeatherData] = useState<WeatherData | null>(null);
  const [temperature, setTemperature] = useState<string | null>(null);
  const [weatherDesc, setWeatherDesc] = useState<string | null>(null);
  const [weatherIcon, setWeatherIcon] = useState<string>('⛅');
  const [weatherLoading, setWeatherLoading] = useState<boolean>(true);

  // Voice-first & demoted text query
  const [showTextInput, setShowTextInput] = useState(false);
  const [fontSizeScale, setFontSizeScale] = useState<'normal' | 'large' | 'xlarge'>('normal');
  const [sheetVisible, setSheetVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [response, setResponse] = useState<QueryResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState<string | null>(null);
  const [isOffline, setIsOffline] = useState(false);
  const [isOfflineCached, setIsOfflineCached] = useState(false);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [isFollowUp, setIsFollowUp] = useState(false);

  const recordingRef = useRef<Audio.Recording | null>(null);
  const webSpeechRecognitionRef = useRef<any>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const soundRef = useRef<Audio.Sound | null>(null);
  const breatheAnim = useRef(new Animated.Value(1)).current;
  const soilRippleAnim = useRef(new Animated.Value(0)).current;
  const recordingPulseAnim = useRef(new Animated.Value(1)).current;
  const recordingRippleAnim = useRef(new Animated.Value(0)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scrollRef = useRef<ScrollView>(null);

  // Translation helper
  const t = (key: string) => getTranslation(currentLang, key);

  // Initial Load: Load Language, Location & Farmer Profile
  useEffect(() => {
    (async () => {
      const savedLang = await storageService.getSavedLanguage();
      if (savedLang) {
        setCurrentLang(savedLang as LanguageCode);
      } else {
        const detected = detectDeviceLanguage();
        setCurrentLang(detected.code);
        setSelectedState(detected.defaultState);
        setRegion(detected.defaultDistrict);
      }

      const savedLoc = await storageService.getSavedLocation();
      if (savedLoc) {
        setSelectedState(savedLoc.state);
        setRegion(savedLoc.district);
      }

      const profile = await storageService.getFarmerProfile();
      if (profile) {
        setFarmerProfile(profile);
        if (!savedLoc) {
          const actualState = profile.state || findStateForDistrict(profile.district) || 'Punjab';
          setSelectedState(actualState);
          setRegion(profile.district || profile.state || 'Ludhiana');
        }
      }
    })();

    const unsubLang = storageService.onLanguageChange((lang) => {
      setCurrentLang(lang as LanguageCode);
    });
    const unsubProfile = storageService.onProfileChange((prof) => {
      setFarmerProfile(prof);
      if (prof?.state) {
        setSelectedState(prof.state);
      } else if (prof?.district) {
        const st = findStateForDistrict(prof.district);
        if (st) setSelectedState(st);
      }
      if (prof?.district || prof?.state) {
        setRegion(prof.district || prof.state);
      }
    });
    const unsubLoc = storageService.onLocationChange((loc) => {
      setSelectedState(loc.state);
      setRegion(loc.district);
    });

    return () => {
      unsubLang();
      unsubProfile();
      unsubLoc();
    };
  }, []);

  // Dynamic time-of-day information based on device clock (05:00-11:59 Morning, 12:00-16:59 Afternoon, 17:00-19:59 Evening, 20:00-04:59 Night)
  const timeOfDayInfo = useMemo(() => {
    return getTimeOfDayDetails();
  }, []);

  // Culturally resonant dynamic greeting — reactively updates whenever language, profile, or time-of-day changes
  const farmerGreeting = useMemo(() => {
    const localizedGuest = getTranslation(currentLang, 'guestFarmer') || getTranslation(currentLang, 'kisanMitra') || 'Farmer';
    const isGuest = !farmerProfile?.name || farmerProfile.name.trim() === '' || farmerProfile.name.trim().toLowerCase() === 'guest farmer';
    const nameToUse = isGuest ? localizedGuest : farmerProfile.name.trim();

    const prefix = timeOfDayInfo.greetingPrefixMap[currentLang] || timeOfDayInfo.greetingPrefixMap.en;
    const blessing = timeOfDayInfo.blessingMap[currentLang] || timeOfDayInfo.blessingMap.en;

    // e.g. "Good Morning, Shon!" or "Good Evening, Ramesh!"
    const greetingTitle = `${prefix}, ${nameToUse}!`;

    return {
      greetingTitle,
      blessing,
      advisoryTitle: timeOfDayInfo.advisoryTitle,
      gradientColors: timeOfDayInfo.gradientColors,
      icon: timeOfDayInfo.icon,
    };
  }, [currentLang, farmerProfile, timeOfDayInfo]);

  // Real-time Weather Fetching (Open-Meteo API)
  useEffect(() => {
    let active = true;
    setWeatherLoading(true);
    (async () => {
      try {
        const targetState = selectedState || 'Uttar Pradesh';
        const targetRegion = region || 'Gautam Buddha Nagar';
        const w = await fetchWeather(targetState, targetRegion);
        if (active) {
          setWeatherData(w);
          if (w && w.temperature !== null) {
            setTemperature(`${w.temperature}°C`);
            setWeatherDesc(w.description);
            setWeatherIcon(w.icon || '⛅');
          } else {
            setTemperature(null);
            setWeatherDesc(null);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch weather:', err);
        if (active) {
          setWeatherData(null);
          setTemperature(null);
          setWeatherDesc(null);
        }
      } finally {
        if (active) {
          setWeatherLoading(false);
        }
      }
    })();
    return () => {
      active = false;
    };
  }, [selectedState, region]);

  // Dynamic crops popular in current state
  const regionalCrops = useMemo(() => {
    const stateData = getStateDetails(selectedState);
    const popularCrops = stateData?.primaryCrops || [];

    const matchesCrop = (catId: string, catName: string) => {
      const lowerId = catId.toLowerCase();
      const lowerName = catName.toLowerCase();
      return popularCrops.some((pc) => {
        const lowerPc = pc.toLowerCase();
        return (
          lowerId.includes(lowerPc) ||
          lowerPc.includes(lowerId) ||
          lowerName.includes(lowerPc) ||
          lowerPc.includes(lowerName) ||
          (lowerPc === 'rice' && lowerId === 'paddy') ||
          (lowerPc === 'paddy' && lowerId === 'paddy') ||
          (lowerPc.includes('pepper') && lowerId === 'spices') ||
          (lowerPc.includes('coffee') && lowerId === 'tea') ||
          (lowerPc.includes('oilseeds') && lowerId === 'mustard')
        );
      });
    };

    const popularList = CROP_CATEGORIES.filter((c) => matchesCrop(c.id, c.name)).map((c) => ({
      ...c,
      isRegional: true,
    }));
    const otherList = CROP_CATEGORIES.filter((c) => !matchesCrop(c.id, c.name)).map((c) => ({
      ...c,
      isRegional: false,
    }));

    return [...popularList, ...otherList];
  }, [selectedState]);

  // Monitor Network Connectivity
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      setIsOffline(!state.isConnected);
    });
    return () => unsubscribe();
  }, []);

  // 🌿 Living Soil Continuous Microphone Animation (Breathing pulse + soft emerald ripple)
  useEffect(() => {
    // 1. Gentle continuous breathing pulse
    const breatheAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(breatheAnim, {
          toValue: 1.06,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(breatheAnim, {
          toValue: 1.0,
          duration: 1600,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: true,
        }),
      ])
    );

    // 2. Continuous calming soundwave/ripple effect in soft emerald
    const rippleAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(soilRippleAnim, {
          toValue: 1,
          duration: 2200,
          easing: Easing.out(Easing.ease),
          useNativeDriver: true,
        }),
        Animated.timing(soilRippleAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: true,
        }),
      ])
    );

    breatheAnimation.start();
    rippleAnimation.start();

    return () => {
      breatheAnimation.stop();
      rippleAnimation.stop();
    };
  }, []);

  // Intense pulse & ripple animation when actively recording voice
  useEffect(() => {
    let recordingAnim: Animated.CompositeAnimation | null = null;
    if (isRecording) {
      recordingAnim = Animated.loop(
        Animated.parallel([
          Animated.sequence([
            Animated.timing(recordingPulseAnim, { toValue: 1.18, duration: 500, useNativeDriver: true }),
            Animated.timing(recordingPulseAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
          ]),
          Animated.sequence([
            Animated.timing(recordingRippleAnim, { toValue: 1, duration: 1000, useNativeDriver: true }),
            Animated.timing(recordingRippleAnim, { toValue: 0, duration: 0, useNativeDriver: true }),
          ]),
        ])
      );
      recordingAnim.start();
    } else {
      recordingPulseAnim.setValue(1);
      recordingRippleAnim.setValue(0);
    }

    return () => {
      if (recordingAnim) recordingAnim.stop();
    };
  }, [isRecording]);

  const fadeIn = () => {
    fadeAnim.setValue(0);
    Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }).start();
  };

  const cycleFontSize = () => {
    safeHaptics.impactLight();
    if (fontSizeScale === 'normal') setFontSizeScale('large');
    else if (fontSizeScale === 'large') setFontSizeScale('xlarge');
    else setFontSizeScale('normal');
  };

  const getAnswerFontSize = () => {
    if (fontSizeScale === 'xlarge') return 24;
    if (fontSizeScale === 'large') return 20;
    return 17;
  };

  const clearConversation = () => {
    setConversationId(null);
    setIsFollowUp(false);
    setResponse(null);
    setQuestion('');
    setError(null);
    setTranscribedText(null);
  };

  // ── Voice Recording ────────────────────────────────────────────────────────
  const startRecording = async () => {
    // ── 1. WEB BROWSER: Native Web Speech Recognition API (Zero-latency, 100% accurate) ──
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
        recognition.maxAlternatives = 1;

        const langMap: Record<string, string> = {
          en: 'en-IN',
          hi: 'hi-IN',
          ml: 'ml-IN',
          ta: 'ta-IN',
          te: 'te-IN',
          kn: 'kn-IN',
          bn: 'bn-IN',
          mr: 'mr-IN',
          gu: 'gu-IN',
          pa: 'pa-IN',
        };
        recognition.lang = langMap[currentLang] || 'en-IN';

        let capturedTranscript = '';

        recognition.onstart = () => {
          setIsRecording(true);
          setRecordingDuration(0);
          setError(null);
          safeHaptics.impactHeavy();
          if (durationTimerRef.current) clearInterval(durationTimerRef.current);
          durationTimerRef.current = setInterval(() => {
            setRecordingDuration((d) => {
              if (d >= 29) {
                stopRecording();
                return 30;
              }
              return d + 1;
            });
          }, 1000);
        };

        recognition.onresult = (event: any) => {
          let text = '';
          for (let i = event.resultIndex; i < event.results.length; ++i) {
            text += event.results[i][0].transcript;
          }
          if (text) {
            capturedTranscript = text;
            setQuestion(text);
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('SpeechRecognition error:', event.error);
          if (durationTimerRef.current) clearInterval(durationTimerRef.current);
          setIsRecording(false);
          if (event.error === 'not-allowed') {
            setError('Microphone access blocked. Click the lock/camera icon in your browser address bar to allow microphone.');
          } else if (event.error !== 'no-speech') {
            setError(`Voice input notice: ${event.error}. You can also type your question.`);
          }
        };

        recognition.onend = () => {
          if (durationTimerRef.current) clearInterval(durationTimerRef.current);
          setIsRecording(false);
          const finalQuery = capturedTranscript.trim() || question.trim();
          if (finalQuery) {
            executeQuery(finalQuery);
          }
        };

        webSpeechRecognitionRef.current = recognition;
        recognition.start();
        return;
      } catch (err: any) {
        console.warn('Web SpeechRecognition init failed, falling back to Audio.Recording:', err);
      }
    }

    // ── 2. NATIVE DEVICE (or fallback) RECORDING ──
    try {
      const { granted } = await Audio.requestPermissionsAsync();
      if (!granted) {
        Alert.alert('Permission Required', 'Microphone permission is needed for voice questions.');
        return;
      }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const { recording } = await Audio.Recording.createAsync(
        Audio.RecordingOptionsPresets.HIGH_QUALITY
      );
      recordingRef.current = recording;
      setIsRecording(true);
      setRecordingDuration(0);
      setError(null);
      safeHaptics.impactHeavy();

      durationTimerRef.current = setInterval(() => {
        setRecordingDuration((d) => {
          if (d >= 29) { stopRecording(); return 30; }
          return d + 1;
        });
      }, 1000);
    } catch {
      setError('Could not start microphone recording. Click the address bar to allow mic or type your question.');
    }
  };

  const stopRecording = async () => {
    if (durationTimerRef.current) clearInterval(durationTimerRef.current);

    // Stop web speech recognition if active
    if (webSpeechRecognitionRef.current) {
      try {
        webSpeechRecognitionRef.current.stop();
      } catch {}
      webSpeechRecognitionRef.current = null;
    }

    if (!recordingRef.current) {
      setIsRecording(false);
      return;
    }

    safeHaptics.impactMedium();
    setIsRecording(false);
    try {
      await recordingRef.current.stopAndUnloadAsync();
      const uri = recordingRef.current.getURI();
      recordingRef.current = null;
      if (!uri) { setError('Audio recording file not found.'); return; }

      setLoading(true);
      setResponse(null);
      setTranscribedText(null);
      setIsOfflineCached(false);
      setSheetVisible(true);

      const formData = new FormData();
      // Handle Web Blob vs Native File object correctly
      if (Platform.OS === 'web') {
        const audioBlob = await fetch(uri).then((r) => r.blob());
        formData.append('audio', audioBlob, 'voice_query.webm');
      } else {
        formData.append('audio', { uri, type: 'audio/webm', name: 'voice_query.webm' } as any);
      }
      formData.append('region', region);
      formData.append('language', currentLang);
      if (conversationId) formData.append('conversation_id', conversationId);

      const res = await axios.post<VoiceQueryResponse>(
        `${BASE_URL}/api/v1/voice-query`,
        formData,
        { headers: { 'Content-Type': 'multipart/form-data' }, timeout: 35000 }
      );

      const data = res.data;
      setTranscribedText(data.transcribed_text);
      setQuestion(data.transcribed_text);
      setResponse(data);
      if (data.conversation_id) { setConversationId(data.conversation_id); setIsFollowUp(true); }
      fadeIn();

      const displayAnswer = currentLang === 'en' ? data.answer_english || data.answer : data.answer;

      await storageService.addToHistory({
        question: data.transcribed_text,
        answer: displayAnswer,
        sources: data.sources,
        sourceLabels: data.source_labels,
        region,
        inputMode: 'voice',
        responseTimeMs: data.response_time_ms,
        queryId: data.query_id,
        conversationId: data.conversation_id,
      });

      scrollRef.current?.scrollToEnd({ animated: true });
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Failed to process voice question.';
      setError(`Notice: ${msg}`);
    } finally {
      setLoading(false);
    }
  };

  const toggleRecording = () => (isRecording ? stopRecording() : startRecording());

  // ── Text Query Execution ───────────────────────────────────────────────────
  const executeQuery = async (queryText: string) => {
    const trimmed = queryText.trim();
    if (!trimmed) {
      Alert.alert('', 'Please enter a farming question.');
      return;
    }

    setLoading(true);
    setResponse(null);
    setError(null);
    setTranscribedText(trimmed);
    setIsOfflineCached(false);
    setSheetVisible(true);
    safeHaptics.impactLight();

    if (isOffline) {
      const cached = await offlineCacheService.findBestMatch(trimmed);
      if (cached) {
        setResponse({
          answer: cached.answer,
          answer_english: cached.answer,
          sources: cached.sources,
          source_labels: cached.sources.map((s) => ({
            filename: s,
            display_name: s.replace('.txt', '').replace(/_/g, ' ').toUpperCase(),
          })),
          response_time_ms: 0,
          from_cache: true,
          weather_context_used: false,
          market_context_used: false,
        });
        setIsOfflineCached(true);
        fadeIn();
      } else {
        setError('No internet connection. This question was not found in your offline cache.');
      }
      setLoading(false);
      return;
    }

    try {
      const res = await axios.post<QueryResponse>(
        `${BASE_URL}/api/v1/query`,
        {
          question: trimmed,
          language: currentLang,
          region,
          conversation_id: conversationId,
        },
        { timeout: 30000 }
      );

      const data = res.data;
      setResponse(data);
      if (data.conversation_id) { setConversationId(data.conversation_id); setIsFollowUp(true); }
      fadeIn();

      const displayAnswer = currentLang === 'en' ? data.answer_english || data.answer : data.answer;

      await storageService.addToHistory({
        question: trimmed,
        answer: displayAnswer,
        sources: data.sources,
        sourceLabels: data.source_labels,
        region,
        inputMode: 'text',
        responseTimeMs: data.response_time_ms,
        queryId: data.query_id,
        conversationId: data.conversation_id,
      });

      scrollRef.current?.scrollToEnd({ animated: true });
    } catch (err: any) {
      const msg = err?.response?.data?.detail?.message || err?.message || 'Server connection issue. Please check backend.';
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  // ── Audio TTS Playback ─────────────────────────────────────────────────────
  const playAudio = async (queryId?: number) => {
    if (!queryId) return;
    try {
      if (soundRef.current) {
        await soundRef.current.unloadAsync();
        soundRef.current = null;
      }
      if (audioPlaying) {
        setAudioPlaying(false);
        return;
      }
      setAudioPlaying(true);
      const { sound } = await Audio.Sound.createAsync(
        { uri: `${BASE_URL}/api/v1/query/${queryId}/audio?lang=${currentLang}` },
        { shouldPlay: true }
      );
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (!status.isLoaded || status.didJustFinish) setAudioPlaying(false);
      });
    } catch {
      setAudioPlaying(false);
      Alert.alert('', 'Audio advisory could not be played.');
    }
  };

  const stopAudio = async () => {
    if (soundRef.current) {
      await soundRef.current.stopAsync();
      await soundRef.current.unloadAsync();
      soundRef.current = null;
    }
    setAudioPlaying(false);
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>

        {/* ── TOP BAR (Sunlight-Readable & Decluttered) ── */}
        <View style={styles.topBar}>
          {/* Weather / Location Indicator (Clickable to change farm location) */}
          <TouchableOpacity
            style={styles.locationWeatherBadge}
            onPress={() => {
              safeHaptics.impactLight();
              setShowLocationModal(true);
            }}
            activeOpacity={0.75}
            accessibilityRole="button"
            accessibilityLabel={`Farm location: ${translateLocation(region, currentLang)}${region !== selectedState ? `, ${translateLocation(selectedState, currentLang)}` : ''}`}
            accessibilityHint="Double tap to change farm location"
          >
            <MaterialCommunityIcons name="map-marker" size={16} color="#15803D" />
            <Text style={styles.locationWeatherText} numberOfLines={1} allowFontScaling={true}>
              {translateLocation(region, currentLang)}{region !== selectedState ? `, ${translateLocation(selectedState, currentLang)}` : ''} • {weatherLoading ? '⛅ Fetching...' : (temperature !== null ? `${weatherIcon} ${temperature}` : `⛅ ${t('weatherUnavailable') || 'Weather unavailable'}`)}
            </Text>
            <MaterialCommunityIcons name="chevron-down" size={14} color="#15803D" />
          </TouchableOpacity>

          {/* Right Actions: Persistent Language Changer + Minimal Profile Icon */}
          <View style={styles.topBarRight}>
            {/* 🌐 Persistent Global Language Changer Button */}
            <TouchableOpacity
              style={styles.langSelectorBtn}
              onPress={() => {
                safeHaptics.impactLight();
                setShowLanguageSheet(true);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel={`Change language, active is ${currentLang.toUpperCase()}`}
              accessibilityHint="Double tap to open language selection"
            >
              <MaterialCommunityIcons name="earth" size={17} color="#15803D" />
              <Text style={styles.langSelectorFlag} allowFontScaling={true}>
                {SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.flag || '🇬🇧'}
              </Text>
              <Text style={styles.langSelectorText} allowFontScaling={true}>
                {currentLang.toUpperCase()} / {SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.nativeLabel.slice(0, 6)}
              </Text>
            </TouchableOpacity>

            {/* 👤 Minimal Profile Icon */}
            <TouchableOpacity
              style={styles.profileBtn}
              onPress={() => {
                safeHaptics.impactLight();
                setShowProfileModal(true);
              }}
              activeOpacity={0.75}
              accessibilityRole="button"
              accessibilityLabel="Farmer profile and logout"
              accessibilityHint="Double tap to view farmer profile or switch farmer"
            >
              <MaterialCommunityIcons name="account-circle" size={24} color="#15803D" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MINIMAL PROFILE MODAL (Farmer Details & Switch Farmer / Logout) ── */}
        <Modal
          visible={showProfileModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowProfileModal(false)}
        >
          <View style={styles.modalBackdrop}>
            <TouchableOpacity
              style={styles.modalBackdropTouch}
              activeOpacity={1}
              onPress={() => setShowProfileModal(false)}
              accessibilityRole="button"
              accessibilityLabel="Close profile modal"
            />
            <View style={styles.profileModalCard}>
              <View style={styles.profileModalHeader} accessibilityRole="header">
                <View style={styles.profileModalAvatar} accessible={false}>
                  <MaterialCommunityIcons name="account" size={32} color="#15803D" />
                </View>
                <View style={styles.profileModalTitleWrap}>
                  <Text style={styles.profileModalName} allowFontScaling={true}>
                    {farmerProfile?.name && farmerProfile.name !== 'Guest Farmer'
                      ? farmerProfile.name
                      : (t('guestFarmer') || 'Guest Farmer')}
                  </Text>
                  <Text style={styles.profileModalSub} allowFontScaling={true}>
                    {farmerProfile?.phone ? `+91 ${farmerProfile.phone}` : (t('guestSession') || 'Guest Session')}
                  </Text>
                </View>
                <TouchableOpacity
                  style={styles.profileModalCloseBtn}
                  onPress={() => setShowProfileModal(false)}
                  accessibilityRole="button"
                  accessibilityLabel="Close profile modal"
                >
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.profileInfoList}>
                <View style={styles.profileInfoRow}>
                  <MaterialCommunityIcons name="badge-account-horizontal" size={18} color="#64748B" />
                  <Text style={styles.profileInfoLabel} allowFontScaling={true}>{t('kisanIdBadge') || 'Kisan ID:'}</Text>
                  <Text style={styles.profileInfoValue} allowFontScaling={true}>
                    {farmerProfile?.farmerId || 'KSN-DEMO'}
                  </Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <MaterialCommunityIcons name="map-marker-outline" size={18} color="#64748B" />
                  <Text style={styles.profileInfoLabel} allowFontScaling={true}>{t('regionLabel') || 'Region:'}</Text>
                  <Text style={styles.profileInfoValue} allowFontScaling={true}>
                    {translateLocation(region, currentLang)}{region !== selectedState ? `, ${translateLocation(selectedState, currentLang)}` : ''}
                  </Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <MaterialCommunityIcons name="sprout" size={18} color="#64748B" />
                  <Text style={styles.profileInfoLabel} allowFontScaling={true}>{t('primaryCropsLabel') || 'Primary Crops:'}</Text>
                  <Text style={styles.profileInfoValue} allowFontScaling={true}>
                    {farmerProfile?.primaryCrops?.join(', ') || 'Wheat, Paddy'}
                  </Text>
                </View>
                <View style={styles.profileInfoRow}>
                  <MaterialCommunityIcons name="translate" size={18} color="#64748B" />
                  <Text style={styles.profileInfoLabel} allowFontScaling={true}>{t('activeLanguageLabel') || 'Active Language:'}</Text>
                  <Text style={styles.profileInfoValue} allowFontScaling={true}>
                    {SUPPORTED_LANGUAGES.find((l) => l.code === currentLang)?.nativeLabel || 'English'} ({currentLang.toUpperCase()})
                  </Text>
                </View>
              </View>

              <View style={styles.profileModalActions}>
                <TouchableOpacity
                  style={styles.logoutBtn}
                  onPress={async () => {
                    setShowProfileModal(false);
                    await storageService.logout();
                  }}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('logoutBtn') || 'Switch Farmer / Log Out'}
                  accessibilityHint="Double tap to clear farmer session and return to language selection"
                >
                  <MaterialCommunityIcons name="logout-variant" size={18} color="#DC2626" />
                  <Text style={styles.logoutBtnText} allowFontScaling={true}>
                    {t('logoutBtn') || 'Switch Farmer / Log Out'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalDoneBtn}
                  onPress={() => setShowProfileModal(false)}
                  activeOpacity={0.8}
                  accessibilityRole="button"
                  accessibilityLabel={t('doneBtn') || 'Done'}
                >
                  <Text style={styles.modalDoneBtnText} allowFontScaling={true}>{t('doneBtn') || 'Done'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Offline Notification */}
        {isOffline && (
          <View style={styles.offlineBanner} accessibilityRole="alert">
            <MaterialCommunityIcons name="wifi-off" size={16} color="#DC2626" />
            <Text style={styles.offlineBannerText} allowFontScaling={true}>{t('offlineAlert')}</Text>
          </View>
        )}

        {/* Multi-turn Threading Banner */}
        {isFollowUp && conversationId && (
          <View style={styles.threadBanner} accessibilityRole="summary">
            <MaterialCommunityIcons name="forum-outline" size={18} color="#166534" />
            <Text style={styles.threadBannerText} allowFontScaling={true}>{t('conversationActive')}</Text>
            <TouchableOpacity
              onPress={clearConversation}
              style={styles.clearThreadBtn}
              accessibilityRole="button"
              accessibilityLabel="Clear conversation thread"
            >
              <MaterialCommunityIcons name="close-circle" size={18} color="#DC2626" />
            </TouchableOpacity>
          </View>
        )}

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.flex}
          keyboardVerticalOffset={80}
        >
          <ScrollView
            ref={scrollRef}
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >

            {/* 🌅 RESTORED SUNRISE FARM HERO BANNER (Localized Warm Greeting Overlay) */}
            <View style={styles.sunriseBannerContainer} accessibilityRole="summary">
              <ImageBackground
                source={{ uri: STATE_HERO_SUNRISE_IMAGES[selectedState] || STATE_HERO_SUNRISE_IMAGES.default }}
                style={styles.sunriseBannerImage}
                imageStyle={styles.sunriseBannerImageStyle}
                resizeMode="cover"
              >
                <LinearGradient
                  colors={farmerGreeting.gradientColors}
                  style={styles.sunriseGradientOverlay}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 0, y: 1 }}
                >
                  <View style={styles.sunriseBannerContent}>
                    <View style={styles.sunriseGreetingBadge}>
                      <MaterialCommunityIcons name={farmerGreeting.icon} size={14} color="#FBBF24" />
                      <Text style={styles.sunriseGreetingBadgeText} allowFontScaling={true}>
                        {farmerGreeting.advisoryTitle}
                      </Text>
                      {weatherLoading ? (
                        <Text style={styles.sunriseWeatherTag} allowFontScaling={true}>
                          • ⛅ Fetching...
                        </Text>
                      ) : temperature !== null && weatherDesc ? (
                        <Text style={styles.sunriseWeatherTag} allowFontScaling={true}>
                          • {weatherIcon} {temperature} ({weatherDesc})
                        </Text>
                      ) : (
                        <Text style={styles.sunriseWeatherTag} allowFontScaling={true}>
                          • ⛅ {t('weatherUnavailable') || 'Weather unavailable'}
                        </Text>
                      )}
                    </View>
                    <Text style={styles.sunriseGreetingTitle} numberOfLines={1} allowFontScaling={true}>
                      {farmerGreeting.greetingTitle}
                    </Text>
                    <Text style={styles.sunriseGreetingBlessing} numberOfLines={1} allowFontScaling={true}>
                      {farmerGreeting.blessing}
                    </Text>
                  </View>
                </LinearGradient>
              </ImageBackground>
            </View>

            {/* 🎙️ 1. PRIMARY VOICE-FIRST HERO SECTION WITH "LIVING" MICROPHONE */}
            <View style={styles.voiceHeroCard}>
              <Text style={styles.voicePromptTitle} allowFontScaling={true} accessibilityRole="header">
                {isRecording ? t('voicePromptListening') : (t('tapToSpeakHero') || 'TAP TO SPEAK')}
              </Text>

              <Text style={styles.voicePromptSubtitle} allowFontScaling={true}>
                {isRecording
                  ? (t('voicePromptListeningSub') || 'Listening to your farm question…')
                  : (t('voicePromptSubtitle') || 'Ask about crops, pests, fertilizers, or mandi prices')}
              </Text>

              {/* Central Floating Circular Mic FAB with Living Soil Animation */}
              <View style={styles.micOrbWrapper}>
                {/* Continuous Living Soil Soundwave / Ripple Background Layer */}
                <Animated.View
                  style={[
                    styles.livingSoilRipple,
                    {
                      transform: [{
                        scale: soilRippleAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [1, 1.48],
                        }),
                      }],
                      opacity: soilRippleAnim.interpolate({
                        inputRange: [0, 0.25, 0.75, 1],
                        outputRange: [0.65, 0.45, 0.15, 0],
                      }),
                    },
                  ]}
                />

                {/* Active recording acoustic ripple (when recording) */}
                {isRecording && (
                  <Animated.View
                    style={[
                      styles.acousticRipple,
                      {
                        transform: [{
                          scale: recordingRippleAnim.interpolate({
                            inputRange: [0, 1],
                            outputRange: [1, 2.1],
                          }),
                        }],
                        opacity: recordingRippleAnim.interpolate({
                          inputRange: [0, 1],
                          outputRange: [0.8, 0],
                        }),
                      },
                    ]}
                  />
                )}

                {/* Living Soil Breathing Animated Wrapper */}
                <Animated.View style={{ transform: [{ scale: isRecording ? recordingPulseAnim : breatheAnim }] }}>
                  {/* Outer Emerald Halo Ring */}
                  <View style={[styles.livingMicOuterRing, isRecording && styles.livingMicOuterRingActive]}>
                    <TouchableOpacity
                      style={[styles.micFabBtn, isRecording && styles.micFabBtnActive]}
                      onPress={toggleRecording}
                      disabled={loading}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={isRecording ? "Stop voice recording" : "Record voice question"}
                      accessibilityState={{ busy: isRecording || loading }}
                      accessibilityHint="Double tap to start or stop recording your question via microphone"
                    >
                      <LinearGradient
                        colors={isRecording ? ['#DC2626', '#EF4444', '#B91C1C'] : ['#14532D', '#15803D', '#16A34A']}
                        style={styles.micFabGradient}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                      >
                        <MaterialCommunityIcons
                          name={isRecording ? 'stop' : 'microphone'}
                          size={46}
                          color="#FFFFFF"
                        />
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </Animated.View>
              </View>

              {isRecording ? (
                <View style={styles.recordingTimerBadge} accessibilityRole="timer">
                  <View style={styles.recordingRedDot} />
                  <Text style={styles.recordingTimerLabel} allowFontScaling={true}>
                    {t('recordingProgress')} {recordingDuration}s / 30s
                  </Text>
                </View>
              ) : (
                <Text style={styles.tapToSpeakInstruction} allowFontScaling={true}>{t('tapToSpeak')}</Text>
              )}

              {/* ✏️ VISUALLY DEMOTED SECONDARY TEXT QUERY LINK */}
              {!showTextInput ? (
                <TouchableOpacity
                  style={styles.demotedTextLink}
                  onPress={() => { setShowTextInput(true); safeHaptics.impactLight(); }}
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
              ) : (
                /* Expandable Text Input Box */
                <View style={styles.expandedTextCard}>
                  <View style={styles.expandedTextHeader}>
                    <Text style={styles.textCardHeader} allowFontScaling={true}>{t('typeQuestionLabel')}</Text>
                    <TouchableOpacity
                      onPress={() => setShowTextInput(false)}
                      style={styles.hideTextLinkBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Hide text box"
                    >
                      <Text style={styles.hideTextLinkText} allowFontScaling={true}>
                        {t('hideTypeQuestionHint') || 'Hide text box'} ▲
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <TextInput
                    style={[styles.sunlightTextInput, { fontSize: getAnswerFontSize() }]}
                    value={question}
                    onChangeText={setQuestion}
                    placeholder={t('typePlaceholder')}
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={3}
                    textAlignVertical="top"
                    editable={!loading}
                    allowFontScaling={true}
                    accessibilityLabel="Type your farming question"
                    accessibilityHint="Enter your agricultural question here"
                  />

                  <TouchableOpacity
                    style={[styles.askSubmitBtn, (!question.trim() || loading) && styles.askSubmitBtnDisabled]}
                    onPress={() => executeQuery(question)}
                    disabled={!question.trim() || loading}
                    activeOpacity={0.8}
                    accessibilityRole="button"
                    accessibilityLabel={t('askBtn') || 'Ask Question'}
                    accessibilityState={{ disabled: !question.trim() || loading }}
                    accessibilityHint="Double tap to submit your typed question"
                  >
                    <LinearGradient
                      colors={loading ? ['#94A3B8', '#94A3B8'] : ['#1B5E20', '#2E7D32']}
                      style={styles.askSubmitGradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                    >
                      {loading ? (
                        <ActivityIndicator color="#FFF" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="send" size={20} color="#FFF" />
                          <Text style={styles.askSubmitBtnText} allowFontScaling={true}>{t('askBtn')}</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* 🌿 2. VIBRANT, TACTILE CROP CARDS */}
            <View style={styles.cropsSection}>
              <View style={styles.cropSectionHeader} accessibilityRole="header">
                <Text style={styles.cropSectionTitle} allowFontScaling={true}>
                  🌾 {t('keyCropsLabel') || 'Key Regional Crops'}
                </Text>
                <Text style={styles.cropSectionSubtitle} allowFontScaling={true}>
                  {t('popularInYourRegion') || 'Popular in your region'}
                </Text>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.cropScroll}>
                {regionalCrops.map((crop) => {
                  const isSelected = selectedCropId === crop.id;
                  return (
                    <TouchableOpacity
                      key={crop.id}
                      style={[
                        styles.cropCard,
                        isSelected && styles.cropCardSelected,
                        crop.isRegional && styles.cropCardRegional,
                      ]}
                      onPress={() => {
                        setSelectedCropId(crop.id);
                        executeQuery(crop.query);
                      }}
                      activeOpacity={0.82}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('crop_' + crop.id) || crop.name}, ${crop.tag}`}
                      accessibilityState={{ selected: isSelected }}
                      accessibilityHint="Double tap to ask advice for this crop"
                    >
                      <View style={styles.cropImageWrapper} accessible={false}>
                        <Image
                          source={{ uri: crop.imageUrl }}
                          style={styles.cropCardImage}
                          resizeMode="cover"
                        />
                        {/* Status Floating Badge (Top-Right) */}
                        {isSelected ? (
                          <View style={styles.activeCropBadge} accessible={false}>
                            <Text style={styles.activeCropBadgeText} allowFontScaling={false}>
                              ACTIVE
                            </Text>
                          </View>
                        ) : crop.isRegional ? (
                          <View style={styles.regionalCropBadge} accessible={false}>
                            <Text style={styles.regionalCropBadgeText} allowFontScaling={false}>
                              POPULAR
                            </Text>
                          </View>
                        ) : null}

                        {/* Season / Category Tag Pill (Bottom-Left) */}
                        <View style={[styles.cropTagPill, { backgroundColor: `${crop.color}E6` }]}>
                          <Text style={styles.cropTagText} allowFontScaling={false}>
                            {crop.tag}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.cropCardTitle} numberOfLines={2} allowFontScaling={true}>
                        {t('crop_' + crop.id) || crop.name}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* 1-Tap Quick Topics (+30% Scaled Up Touch Targets) */}
            <View style={styles.quickTopicsContainer}>
              <Text style={styles.quickTopicsHeading} allowFontScaling={true}>{t('quickTopicsLabel')}</Text>
              <View style={styles.quickChipsWrap}>
                {[
                  { label: t('topicPaddy'), query: 'Why are paddy leaves turning yellow and what pesticide or fertilizer is recommended?' },
                  { label: t('topicWheat'), query: 'What is the optimal nitrogen urea schedule and yellow rust prevention for wheat?' },
                  { label: t('topicCoconut'), query: 'How to manage root wilt and rhinoceros beetle in coconut trees?' },
                  { label: t('topicCotton'), query: 'How to manage pink bollworm and sucking pests in cotton?' },
                  { label: t('topicPest'), query: 'What are organic neem-based treatments for caterpillar and stem borer control?' },
                  { label: t('topicWeather'), query: `What is the current weather forecast and agricultural advisory for ${region}?` },
                  { label: t('topicMsp'), query: 'What are the current minimum support price (MSP) rates declared by the Government of India?' },
                  { label: t('topicPmKisan'), query: 'How to check PM-Kisan installment status and eKYC requirements?' },
                  { label: t('topicDairy'), query: 'What are the preventive measures and antibiotic-free treatments for bovine mastitis?' },
                ].map((item, idx) => (
                  <TouchableOpacity
                    key={idx}
                    style={styles.quickChip}
                    onPress={() => executeQuery(item.query)}
                    disabled={loading}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={item.label}
                    accessibilityState={{ disabled: loading }}
                    accessibilityHint="Double tap to ask this topic"
                  >
                    <MaterialCommunityIcons name="leaf" size={16} color="#16A34A" />
                    <Text style={styles.quickChipText} allowFontScaling={true}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Loading Box */}
            {loading && (
              <View style={styles.loadingBox} accessibilityRole="progressbar" accessibilityLabel="Generating farming advisory">
                <ActivityIndicator size="large" color="#16A34A" />
                <Text style={styles.loadingBoxTitle} allowFontScaling={true}>{t('loadingTitle')}</Text>
                <Text style={styles.loadingBoxSub} allowFontScaling={true}>{t('loadingSub')}</Text>
              </View>
            )}

            {/* Transcribed Voice Text Card */}
            {transcribedText && !loading && (
              <View style={styles.transcriptCard} accessibilityRole="text" accessibilityLabel={`Transcribed voice: ${transcribedText}`}>
                <View style={styles.transcriptHeader}>
                  <MaterialCommunityIcons name="microphone" size={18} color="#166534" />
                  <Text style={styles.transcriptHeaderLabel} allowFontScaling={true}>{t('transcribedTitle')}</Text>
                </View>
                <Text style={[styles.transcriptBodyText, { fontSize: getAnswerFontSize() }]} allowFontScaling={true}>
                  "{transcribedText}"
                </Text>
              </View>
            )}

            {/* Error Banner */}
            {error && !loading && (
              <View style={styles.errorBox} accessibilityRole="alert">
                <MaterialCommunityIcons name="alert-circle-outline" size={24} color="#DC2626" />
                <Text style={styles.errorText} allowFontScaling={true}>{error}</Text>
              </View>
            )}

            {/* 🌿 Grounded Answer Card (Sunlight-Readable White Card) */}
            {response && !loading && (
              <Animated.View style={[styles.answerCard, { opacity: fadeAnim }]} accessibilityRole="summary" accessibilityLabel="Agricultural advisory response">
                {isOfflineCached && (
                  <View style={styles.offlineAnswerPill}>
                    <MaterialCommunityIcons name="database-clock" size={14} color="#DC2626" />
                    <Text style={styles.offlineAnswerPillText} allowFontScaling={true}>{t('cachedAnswer')}</Text>
                  </View>
                )}

                <View style={styles.answerTopBar}>
                  <View style={styles.answerTitleWrapper}>
                    <View style={styles.shieldIconCircle} accessible={false}>
                      <MaterialCommunityIcons name="shield-check" size={18} color="#16A34A" />
                    </View>
                    <Text style={styles.answerTitleText} allowFontScaling={true}>{t('answerTitle')}</Text>
                  </View>

                  {/* 🔊 Audio Player Button */}
                  {response.query_id && !isOfflineCached && (
                    <TouchableOpacity
                      style={[styles.audioPlayPill, audioPlaying && styles.audioPlayPillActive]}
                      onPress={audioPlaying ? stopAudio : () => playAudio(response.query_id)}
                      activeOpacity={0.8}
                      accessibilityRole="button"
                      accessibilityLabel={audioPlaying ? (t('stopAudio') || 'Stop Audio') : (t('listenAudio') || 'Listen to Audio')}
                      accessibilityState={{ busy: audioPlaying }}
                      accessibilityHint="Double tap to listen or pause spoken audio advisory"
                    >
                      <MaterialCommunityIcons
                        name={audioPlaying ? 'stop-circle' : 'volume-high'}
                        size={20}
                        color={audioPlaying ? '#FFF' : '#166534'}
                      />
                      <Text style={[styles.audioPlayPillText, audioPlaying && styles.audioPlayPillTextActive]} allowFontScaling={true}>
                        {audioPlaying ? t('stopAudio') : t('listenAudio')}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>

                {/* Main Advisory Content — Sunlight Dark Text */}
                <Text style={[styles.answerBodyText, { fontSize: getAnswerFontSize() }]} allowFontScaling={true}>
                  {currentLang === 'en' ? response.answer_english || response.answer : response.answer}
                </Text>

                {/* Context Badges (Weather / Mandi) */}
                <View style={styles.contextBadgesRow}>
                  {response.weather_context_used && (
                    <View style={styles.contextBadgeWeather}>
                      <MaterialCommunityIcons name="weather-partly-cloudy" size={15} color="#0284C7" />
                      <Text style={styles.contextBadgeWeatherText} allowFontScaling={true}>{t('imdWeatherLive')}</Text>
                    </View>
                  )}
                  {response.market_context_used && (
                    <View style={styles.contextBadgeMandi}>
                      <MaterialCommunityIcons name="currency-inr" size={15} color="#D97706" />
                      <Text style={styles.contextBadgeMandiText} allowFontScaling={true}>{t('enamMarketPrice')}</Text>
                    </View>
                  )}
                </View>

                {/* Verified Government Sources */}
                {response.source_labels && response.source_labels.length > 0 && (
                  <View style={styles.sourcesBox} accessibilityRole="summary" accessibilityLabel={t('sourcesTitle') || 'Sources'}>
                    <Text style={styles.sourcesBoxTitle} allowFontScaling={true}>{t('sourcesTitle')}</Text>
                    <View style={styles.sourceChipsWrapper}>
                      {response.source_labels.map((src, idx) => (
                        <View key={idx} style={styles.sourceTagChip}>
                          <MaterialCommunityIcons name="check-decagram" size={16} color="#16A34A" />
                          <Text style={styles.sourceTagTitle} numberOfLines={1} ellipsizeMode="tail" allowFontScaling={true}>
                            {src.display_name}
                          </Text>
                          {src.relevance_score != null && (
                            <Text style={styles.sourceTagScore} allowFontScaling={true}>
                              {(src.relevance_score * 100).toFixed(0)}%
                            </Text>
                          )}
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                <Text style={styles.responseTimeLabel} allowFontScaling={true}>
                  ⚡ {t('responseTime')} {(response.response_time_ms / 1000).toFixed(1)}s
                </Text>
              </Animated.View>
            )}

            <View style={{ height: 40 }} />
          </ScrollView>
        </KeyboardAvoidingView>

        {/* ── AI ADVISORY RESPONSE VIEW (Bottom Sheet / Overlay) ── */}
        <AdvisoryResponseSheet
          visible={sheetVisible}
          onClose={() => setSheetVisible(false)}
          loading={loading}
          question={transcribedText || question}
          response={response}
          error={error}
          currentLang={currentLang}
          fontSizeScale={fontSizeScale}
          onFollowUpSubmit={(followUpQuery) => {
            setQuestion(followUpQuery);
            executeQuery(followUpQuery);
          }}
        />
 
        {/* ── 🌐 GLOBAL LANGUAGE SELECTOR BOTTOM SHEET ── */}
        <LanguageSelectorSheet
          visible={showLanguageSheet}
          currentLang={currentLang}
          onClose={() => setShowLanguageSheet(false)}
          onSelect={(code) => {
            setCurrentLang(code);
          }}
        />

        {/* ── 📍 INTERACTIVE FARM LOCATION PICKER MODAL ── */}
        <LocationPickerModal
          visible={showLocationModal}
          currentState={selectedState}
          currentDistrict={region}
          currentLang={currentLang}
          onClose={() => setShowLocationModal(false)}
          onSave={async (state, district) => {
            setSelectedState(state);
            setRegion(district);
            await storageService.saveLocation(state, district);
            invalidateWeatherCache();
            setWeatherLoading(true);
            try {
              const freshWeather = await fetchWeather(state, district);
              setWeatherData(freshWeather);
              if (freshWeather && freshWeather.temperature !== null) {
                setTemperature(`${freshWeather.temperature}°C`);
                setWeatherDesc(freshWeather.description);
                setWeatherIcon(freshWeather.icon || '⛅');
              } else {
                setTemperature(null);
                setWeatherDesc(null);
              }
            } catch (err) {
              console.warn('Weather re-fetch failed:', err);
              setWeatherData(null);
              setTemperature(null);
              setWeatherDesc(null);
            } finally {
              setWeatherLoading(false);
            }
          }}
        />

      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#FDFBF7',
  },
  container: {
    flex: 1,
    backgroundColor: '#FDFBF7',
  },
  flex: {
    flex: 1,
  },
  initialLoadingCenter: {
    flex: 1,
    backgroundColor: '#FDFBF7',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* Clean Sunlight-Readable Top Bar */
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1.5,
    borderBottomColor: '#E2E8F0',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  locationWeatherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    maxWidth: '56%',
  },
  locationWeatherText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  langSelectorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },
  langSelectorFlag: {
    fontSize: 14,
  },
  langSelectorText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  profileBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },

  /* Minimal Profile Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalBackdropTouch: {
    ...StyleSheet.absoluteFillObject,
  },
  profileModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  profileModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  profileModalAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  profileModalTitleWrap: {
    flex: 1,
  },
  profileModalName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
  },
  profileModalSub: {
    fontSize: 12,
    fontWeight: '700',
    color: '#15803D',
    marginTop: 2,
  },
  profileModalCloseBtn: {
    padding: 6,
  },
  profileInfoList: {
    gap: 12,
    marginBottom: 20,
  },
  profileInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  profileInfoLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
    minWidth: 100,
  },
  profileInfoValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  profileModalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  logoutBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    borderWidth: 1.5,
    borderColor: '#FECACA',
    paddingVertical: 12,
    borderRadius: 12,
  },
  logoutBtnText: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 13,
  },
  modalDoneBtn: {
    paddingHorizontal: 20,
    backgroundColor: '#15803D',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
  },

  offlineBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FEF2F2',
    paddingVertical: 8,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#FECACA',
  },
  offlineBannerText: {
    color: '#DC2626',
    fontSize: 13,
    fontWeight: '700',
  },
  threadBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#BBF7D0',
  },
  threadBannerText: {
    color: '#15803D',
    fontSize: 13,
    fontWeight: '700',
  },
  clearThreadBtn: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
  },

  // ── 🌿 4. VIBRANT, TACTILE CROP CARDS STYLING ──
  cropsSection: {
    marginBottom: 12,
  },
  cropSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  cropSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#15803D',
  },
  cropSectionSubtitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
  },
  cropScroll: {
    flexDirection: 'row',
    overflow: 'visible',
  },
  cropCard: {
    position: 'relative',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 8,
    marginRight: 10,
    width: 116,
    minHeight: 136,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#EAE3D2',
    elevation: 2,
    shadowColor: '#78350F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  cropCardSelected: {
    borderColor: '#E2725B',
    borderWidth: 2.5,
    backgroundColor: '#FFFBF9',
    shadowColor: '#E2725B',
    shadowOpacity: 0.35,
    elevation: 4,
  },
  activeCropBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#DC2626',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  activeCropBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 13,
    zIndex: 10,
  },
  cropCardRegional: {
    borderColor: '#86EFAC',
    backgroundColor: '#F0FDF4',
  },
  regionalCropBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    backgroundColor: '#15803D',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    zIndex: 10,
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.25,
    shadowRadius: 2,
  },
  regionalCropBadgeText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.5,
    lineHeight: 13,
    zIndex: 10,
  },
  cropImageWrapper: {
    position: 'relative',
    width: 100,
    height: 74,
    borderRadius: 10,
    overflow: 'hidden',
    marginBottom: 6,
    backgroundColor: '#F1ECE1',
  },
  cropCardImage: {
    width: '100%',
    height: '100%',
  },
  cropTagPill: {
    position: 'absolute',
    bottom: 5,
    left: 5,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    zIndex: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 1.5,
  },
  cropTagText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.3,
    lineHeight: 13,
    zIndex: 10,
  },
  cropCardTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    lineHeight: 15,
  },

  /* 🌅 Sunrise Farm Hero Banner - Compact & Sunlight-Readable */
  sunriseBannerContainer: {
    marginBottom: 10,
    borderRadius: 20,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
  },
  sunriseBannerImage: {
    width: '100%',
    height: 124,
  },
  sunriseBannerImageStyle: {
    borderRadius: 20,
  },
  sunriseGradientOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
    padding: 12,
    borderRadius: 20,
  },
  sunriseBannerContent: {
    gap: 3,
  },
  sunriseGreetingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 12,
    marginBottom: 1,
  },
  sunriseGreetingBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FDE68A',
  },
  sunriseWeatherTag: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E2E8F0',
  },
  sunriseGreetingTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.3,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  sunriseGreetingBlessing: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#A7F3D0',
    lineHeight: 15,
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },

  // ── 🎙️ 5. THE "LIVING SOIL" MICROPHONE HERO CARD STYLES ──
  voiceHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    elevation: 2,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  voicePromptTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  voicePromptSubtitle: {
    fontSize: 12,
    color: '#475569',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 8,
  },
  micOrbWrapper: {
    width: 124,
    height: 124,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  livingSoilRipple: {
    position: 'absolute',
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: 'rgba(22, 163, 74, 0.3)',
  },
  acousticRipple: {
    position: 'absolute',
    width: 114,
    height: 114,
    borderRadius: 57,
    backgroundColor: 'rgba(239, 68, 68, 0.35)',
  },
  livingMicOuterRing: {
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: '#ECFDF5',
    borderWidth: 3,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  livingMicOuterRingActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    shadowColor: '#EF4444',
  },
  micFabBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  micFabBtnActive: {
    borderColor: '#FFFFFF',
  },
  micFabGradient: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordingTimerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  recordingRedDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#DC2626',
  },
  recordingTimerLabel: {
    color: '#DC2626',
    fontWeight: '800',
    fontSize: 12,
  },
  tapToSpeakInstruction: {
    marginTop: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  demotedTextLink: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  demotedTextLinkText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#166534',
  },
  expandedTextCard: {
    width: '100%',
    marginTop: 16,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  expandedTextHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  textCardHeader: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  hideTextLinkBtn: {
    paddingVertical: 4,
    paddingHorizontal: 6,
  },
  hideTextLinkText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '700',
  },
  sunlightTextInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    color: '#0F172A',
    fontSize: 17,
    minHeight: 90,
  },
  askSubmitBtn: {
    borderRadius: 12,
    overflow: 'hidden',
    marginTop: 10,
    height: 54,
  },
  askSubmitBtnDisabled: {
    opacity: 0.6,
  },
  askSubmitGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  askSubmitBtnText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '800',
  },
  quickTopicsContainer: {
    marginBottom: 18,
  },
  quickTopicsHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 10,
  },
  quickChipsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  quickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    elevation: 1,
    minHeight: 48,
  },
  quickChipText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  loadingBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 18,
    gap: 8,
  },
  loadingBoxTitle: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
  },
  loadingBoxSub: {
    color: '#64748B',
    fontSize: 13,
  },
  transcriptCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  transcriptHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  transcriptHeaderLabel: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  transcriptBodyText: {
    color: '#0F172A',
    fontStyle: 'italic',
    lineHeight: 24,
  },
  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FEF2F2',
    borderRadius: 14,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#FCA5A5',
  },
  errorText: {
    color: '#B91C1C',
    fontSize: 14,
    fontWeight: '700',
    flex: 1,
  },
  answerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    marginBottom: 20,
    borderWidth: 2,
    borderColor: '#BBF7D0',
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    gap: 14,
  },
  offlineAnswerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF2F2',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FECACA',
    alignSelf: 'flex-start',
  },
  offlineAnswerPillText: {
    color: '#DC2626',
    fontSize: 12,
    fontWeight: '800',
  },
  answerTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    flexWrap: 'wrap',
    gap: 8,
  },
  answerTitleWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  shieldIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E8F5E9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  answerTitleText: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  audioPlayPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
  },
  audioPlayPillActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  audioPlayPillText: {
    color: '#166534',
    fontSize: 13,
    fontWeight: '800',
  },
  audioPlayPillTextActive: {
    color: '#DC2626',
  },
  answerBodyText: {
    color: '#0F172A',
    lineHeight: 28,
  },
  contextBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  contextBadgeWeather: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F0F9FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  contextBadgeWeatherText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0369A1',
  },
  contextBadgeMandi: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  contextBadgeMandiText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  sourcesBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  sourcesBoxTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  sourceChipsWrapper: {
    gap: 6,
  },
  sourceTagChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sourceTagTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  sourceTagScore: {
    fontSize: 11,
    fontWeight: '800',
    color: '#166534',
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  responseTimeLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
  },
});
