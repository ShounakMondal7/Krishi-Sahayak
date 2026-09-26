/**
 * scripts/generate_locales.js
 * Generates JSON locale dictionary files for the 11 Eighth Schedule Indian languages
 * in frontend/mobile/locales/
 */
const fs = require('fs');
const path = require('path');

const I18N_PATH = path.resolve(__dirname, '../frontend/mobile/services/i18n.ts');
const LOCALES_DIR = path.resolve(__dirname, '../frontend/mobile/locales');

if (!fs.existsSync(LOCALES_DIR)) {
  fs.mkdirSync(LOCALES_DIR, { recursive: true });
}

const fileContent = fs.readFileSync(I18N_PATH, 'utf8');

// Extract English dictionary
const enMatch = fileContent.match(/en:\s*\{([\s\S]*?)\n\s*\},/);
if (!enMatch) {
  console.error('Could not find en dictionary in i18n.ts');
  process.exit(1);
}

const enBlock = enMatch[1];
const enDict = {};
const lineRegex = /^\s*([a-zA-Z0-9_]+):\s*(['"`])([\s\S]*?)\2,/gm;
let m;
while ((m = lineRegex.exec(enBlock)) !== null) {
  enDict[m[1]] = m[3];
}

console.log('Loaded English keys count:', Object.keys(enDict).length);

// Also write en.json
fs.writeFileSync(path.join(LOCALES_DIR, 'en.json'), JSON.stringify(enDict, null, 2), 'utf8');
console.log('Created locales/en.json');

// Definitions of key translations for the 11 languages
const NEW_LANGS = {
  brx: {
    name: 'Bodo',
    nativeName: 'बड़ो',
    overrides: {
      hero_greeting: 'कृषि सहायकाव बरायबाय',
      welcomeFarmer: 'आबादारी, बरायबाय!',
      guestFarmer: 'आलासि आबादारी',
      goodNight: 'हरनि खुलुमबाय',
      goodMorning: 'फुंनि खुलुमबाय',
      goodAfternoon: 'बेलासिनि खुलुमबाय',
      goodEvening: 'सान्दाउनि खुलुमबाय',
      tapToSpeakHero: 'बुंनो थाखाय थु',
      tapToSpeak: '👉 बुंनो थाखाय थु',
      voicePromptSubtitle: 'आबाद, एंगार-गियान, साहा बा बाजारनि बेसेननि सोमोन्दै सों',
      voicePromptListeningSub: 'नोंथांनि आबादनि सोंनायखौ खोनासं गासिनो दं…',
      voicePromptListening: 'खोनासं गासिनो दं... दा रोखायै बुं',
      chooseLanguageTitle: 'गावनि रावखौ सायख’',
      chooseLanguageSubtitle: 'आबादनि बोसोननि थाखाय गावनि राव सायख’',
      yourFarmLocation: 'नोंथांनि आबाद फोथारनि जायगा',
      continueToKrishi: 'थांगासिनो था →',
      signIn: 'साइन इन',
      skipSignIn: 'आलासि महरै थाबाय था',
      backBtn: '← उनथिं',
      doneBtn: 'जाबाय',
      appTitle: 'कृषि सहायक',
      appSubtitle: 'एआई आबाद बोसोन ब्यबस्था',
      greetingPrefix: 'खुलुमबाय',
      greetingBlessing: 'फोथाराव खामानि मावनायनि उनाव मोजाङै बिस्राम ला 🌙'
    }
  },
  ur: {
    name: 'Urdu',
    nativeName: 'اردو',
    overrides: {
      hero_greeting: 'کرشی سہایک میں خوش آمدید',
      welcomeFarmer: 'خوش آمدید، کسان بھائی!',
      guestFarmer: 'مہمان کسان',
      goodNight: 'شب بخیر',
      goodMorning: 'صبح بخیر',
      goodAfternoon: 'دوپہر بخیر',
      goodEvening: 'شام بخیر',
      tapToSpeakHero: 'بولنے کے لیے ٹیپ کریں',
      tapToSpeak: '👉 بولنے کے لیے ٹیپ کریں',
      voicePromptSubtitle: 'فصلوں، کیڑوں، کھادوں یا منڈی کے نرخوں کے بارے میں پوچھیں',
      voicePromptListeningSub: 'آپ کے کھیتی سے متعلق سوال کو سنا جا رہا ہے…',
      voicePromptListening: 'غور سے سن رہے ہیں… اب صاف بولیں',
      chooseLanguageTitle: 'اپنی زبان منتخب کریں',
      chooseLanguageSubtitle: 'کاشتکاری کے مشورے کے لیے اپنی زبان منتخب کریں',
      yourFarmLocation: 'آپ کے فارم کا مقام',
      continueToKrishi: 'جاری رکھیں →',
      signIn: 'سائن ان',
      skipSignIn: 'مہمان کے طور پر جاری رکھیں',
      backBtn: '← واپس',
      doneBtn: 'مکمل',
      appTitle: 'کرشی سہایک',
      appSubtitle: 'اے آئی زرعی مشاورتی نظام',
      greetingPrefix: 'آداب',
      greetingBlessing: 'کھیتوں میں محنت کے بعد آرام دہ نیند 🌙'
    }
  },
  sa: {
    name: 'Sanskrit',
    nativeName: 'संस्कृतम्',
    overrides: {
      hero_greeting: 'कृषि सहायके स्वागतम्',
      welcomeFarmer: 'स्वागतम्, हे कृषक!',
      guestFarmer: 'अतिथि कृषकः',
      goodNight: 'शुभरात्रिः',
      goodMorning: 'सुप्रभातम्',
      goodAfternoon: 'शुभापराह्णम्',
      goodEvening: 'शुभसायम्',
      tapToSpeakHero: 'वक्तुं स्पृशतु',
      tapToSpeak: '👉 वक्तुं स्पृशतु',
      voicePromptSubtitle: 'सस्यानां, कीटानां, उर्वराणां वा मूल्यविषये पृच्छतु',
      voicePromptListeningSub: 'भवतः कृषिसम्बन्धी प्रश्नः श्रूयते…',
      voicePromptListening: 'श्रूयते... इदानीं स्पष्टं वदतु',
      chooseLanguageTitle: 'स्वभाषां चिनुत',
      chooseLanguageSubtitle: 'कृषिपरामर्शार्थं स्वभाषां चिनुत',
      yourFarmLocation: 'भवतः कृषिक्षेत्रस्य स्थानम्',
      continueToKrishi: 'अग्रे सरतु →',
      signIn: 'प्रवेशः',
      skipSignIn: 'अतिथिरूपेण प्रवर्तताम्',
      backBtn: '← प्रतिनिवर्तताम्',
      doneBtn: 'सम्पन्नम्',
      appTitle: 'कृषि सहायकः',
      appSubtitle: 'एआई कृषिपरामर्शप्रणाली',
      greetingPrefix: 'नमो नमः',
      greetingBlessing: 'क्षेत्रे श्रमानन्तरं सुखनिद्रा 🌙'
    }
  },
  sd: {
    name: 'Sindhi',
    nativeName: 'سنڌي / सिंधी',
    overrides: {
      hero_greeting: 'ڪرشي سھائڪ ۾ ڀلي ڪري آيا',
      welcomeFarmer: 'ڀلي ڪري آيا، هاري ڀاءُ!',
      guestFarmer: 'مھمان هاري',
      goodNight: 'شب بخير',
      goodMorning: 'صبح جو سلام',
      goodAfternoon: 'منجھند جو سلام',
      goodEvening: 'سانجھ جو سلام',
      tapToSpeakHero: 'ڳالهائڻ لاءِ ٽيپ ڪريو',
      tapToSpeak: '👉 ڳالهائڻ لاءِ ٽيپ ڪريو',
      voicePromptSubtitle: 'فصلن، جيتن، ڀاڻ يا مارڪيٽ جي اگهن بابت پڇو',
      voicePromptListeningSub: 'توهان جو زرعي سوال ٻڌو پيو وڃي…',
      voicePromptListening: 'ٻڌي رهيا آهيون... هاڻي صاف ڳالهايو',
      chooseLanguageTitle: 'پنهنجي ٻولي چونڊيو',
      chooseLanguageSubtitle: 'زرعي صلاحن لاءِ پنھنجي ٻولي چونڊيو',
      yourFarmLocation: 'توهان جي ٻنيءَ جي جاءِ',
      continueToKrishi: 'اڳتي وڌو →',
      signIn: 'سائن ان',
      skipSignIn: 'مھمان طور جاري رکو',
      backBtn: '← پوئتي',
      doneBtn: 'مڪمل',
      appTitle: 'ڪرشي سھائڪ',
      appSubtitle: 'اي آءِ زرعي صلاحڪار نظام',
      greetingPrefix: 'नमस्कार',
      greetingBlessing: 'ٻنين ۾ سخت پورهئي کانپوءِ سٺو آرام 🌙'
    }
  },
  ks: {
    name: 'Kashmiri',
    nativeName: 'کأشُر',
    overrides: {
      hero_greeting: 'کرشی سہایکس منٛز خوش آمدید',
      welcomeFarmer: 'خوش آمدید، کِسان صٲب!',
      guestFarmer: 'مِہمان کِسان',
      goodNight: 'شب بخیر',
      goodMorning: 'صُبحک سلام',
      goodAfternoon: 'دۄپہرک سلام',
      goodEvening: 'شامک سلام',
      tapToSpeakHero: 'کَتھ باتھ خٲطرٕ کٔرِو ٹیپ',
      tapToSpeak: '👉 کَتھ باتھ خٲطرٕ کٔرِو ٹیپ',
      voicePromptSubtitle: 'فصلن، کؠمن، کھاد یا منڈی کین درن متعلق پرژھِو',
      voicePromptListeningSub: 'تُہنٛد زراعتک سوال چُھ بوزنہٕ یِوان…',
      voicePromptListening: 'بوزان چھِ... وۆنۍ کٔرِو صاف کتھ',
      chooseLanguageTitle: 'پَنٕنۍ زَبان چُنِو',
      chooseLanguageSubtitle: 'زراعت کین مشورن باپتھ پَنٕنۍ زَبان چُنِو',
      yourFarmLocation: 'تُہنٛدِ کؠتِک جاہے',
      continueToKrishi: 'برونٛہہ پکِو →',
      signIn: 'سائن اِن',
      skipSignIn: 'مِہمان پٲٹھۍ جاری تھٲوِو',
      backBtn: '← واپس',
      doneBtn: 'مکمل',
      appTitle: 'کرشی سہایک',
      appSubtitle: 'اے آئی زرعی مشاورتی نظام',
      greetingPrefix: 'سلام',
      greetingBlessing: 'کؠتن منٛز مِحنت پتہٕ آرام کٔرِو 🌙'
    }
  },
  ne: {
    name: 'Nepali',
    nativeName: 'नेपाली',
    overrides: {
      hero_greeting: 'कृषि सहायकमा स्वागत छ',
      welcomeFarmer: 'स्वागत छ, किसान साथी!',
      guestFarmer: 'अतिथि किसान',
      goodNight: 'शुभ रात्रि',
      goodMorning: 'शुभ प्रभात',
      goodAfternoon: 'शुभ दिउँसो',
      goodEvening: 'शुभ सन्ध्या',
      tapToSpeakHero: 'बोल्न ट्याप गर्नुहोस्',
      tapToSpeak: '👉 बोल्न ट्याप गर्नुहोस्',
      voicePromptSubtitle: 'बाली, कीरा, मल वा बजार भाउबारे सोध्नुहोस्',
      voicePromptListeningSub: 'तपाईंको खेतीसम्बन्धी प्रश्न सुनिँदैछ…',
      voicePromptListening: 'सुन्दैछौं... अब स्पष्ट बोल्नुहोस्',
      chooseLanguageTitle: 'आफ्नो भाषा छान्नुहोस्',
      chooseLanguageSubtitle: 'कृषि सल्लाहका लागि आफ्नो भाषा छान्नुहोस्',
      yourFarmLocation: 'तपाईंको खेतको स्थान',
      continueToKrishi: 'अगाडि बढ्नुहोस् →',
      signIn: 'साइन इन',
      skipSignIn: 'अतिथिको रूपमा जारी राख्नुहोस्',
      backBtn: '← पछाडि',
      doneBtn: 'सम्पन्न',
      appTitle: 'कृषि सहायक',
      appSubtitle: 'एआई कृषि सल्लाह प्रणाली',
      greetingPrefix: 'नमस्ते',
      greetingBlessing: 'खेतमा कडा परिश्रमपछि आराम गर्नुहोस् 🌙'
    }
  },
  kok: {
    name: 'Konkani',
    nativeName: 'कोंकणी',
    overrides: {
      hero_greeting: 'कृषी सहायकांत येवकार',
      welcomeFarmer: 'येवकार, शेतकार भाव!',
      guestFarmer: 'पावणो शेतकार',
      goodNight: 'बरी रात',
      goodMorning: 'देव बरे दिस दींव',
      goodAfternoon: 'बरे उपरान',
      goodEvening: 'बरी सांज',
      tapToSpeakHero: 'उलयत खातीर तेंको',
      tapToSpeak: '👉 उलयत खातीर तेंको',
      voicePromptSubtitle: 'पिकां, किडी, सारां वा बाजार दरांचेर विचारात',
      voicePromptListeningSub: 'तुमचो शेतकामाचो प्रस्न आयकतात…',
      voicePromptListening: 'आयकतात... आतां स्पश्ट उलयत',
      chooseLanguageTitle: 'तुमची भास वेंचून काढा',
      chooseLanguageSubtitle: 'शेतीच्या सल्ल्या खातीर तुमची भास निवडा',
      yourFarmLocation: 'तुमच्या शेताची सुवात',
      continueToKrishi: 'फुडे वचात →',
      signIn: 'साइन इन',
      skipSignIn: 'पावणो म्हणून फुडे वचात',
      backBtn: '← फाटीं',
      doneBtn: 'जालें',
      appTitle: 'कृषी सहायक',
      appSubtitle: 'एआय शेतकी सल्लो वेवस्था',
      greetingPrefix: 'देव बरें करूं',
      greetingBlessing: 'शेतांतल्या कश्टां उपरांत बरो विसव घेयात 🌙'
    }
  },
  mni: {
    name: 'Manipuri',
    nativeName: 'ꯃꯤꯇꯩꯂꯣꯟ',
    overrides: {
      hero_greeting: 'ꯀ꯭ꯔꯤꯁꯤ ꯁꯍꯥꯌꯛꯇ ꯇꯔꯥꯝꯅ ꯑꯣꯛꯆꯔꯤ',
      welcomeFarmer: 'ꯇꯔꯥꯝꯅ ꯑꯣꯛꯆꯔꯤ, ꯂꯧꯃꯤ ꯏꯆꯤꯜ-ꯏꯅꯥꯎ!',
      guestFarmer: 'ꯑꯊꯣꯏꯕ ꯂꯧꯃꯤ',
      goodNight: 'ꯅꯨꯃꯤꯗꯥꯡ ꯅꯨꯡꯉꯥꯏꯕ ꯇꯨꯝꯕꯤꯌꯨ',
      goodMorning: 'ꯑꯌꯨꯛꯀꯤ ꯈꯨꯔꯨꯃꯖꯔꯤ',
      goodAfternoon: 'ꯅꯨꯃꯤꯗꯥꯡꯋꯥꯏ ꯈꯨꯔꯨꯃꯖꯔꯤ',
      goodEvening: 'ꯅꯨꯃꯤꯗꯥꯡ ꯈꯨꯔꯨꯃꯖꯔꯤ',
      tapToSpeakHero: 'ꯋꯥ ꯉꯥꯡꯅꯕ ꯊꯨꯕꯤꯌꯨ',
      tapToSpeak: '👉 ꯋꯥ ꯉꯥꯡꯅꯕ ꯊꯨꯕꯤꯌꯨ',
      voicePromptSubtitle: 'ꯄꯥꯝꯕꯤ, ꯇꯤꯟ-ꯀꯥꯡ, ꯂꯩꯍꯥꯎ ꯅꯠꯇ꯭ꯔꯒ ꯀꯩꯊꯦꯜ ꯃꯃꯜꯒꯤ ꯃꯇꯥꯡꯗ ꯍꯪꯕꯤꯌꯨ',
      voicePromptListeningSub: 'ꯅꯍꯥꯛꯀꯤ ꯂꯧ-ꯁꯤꯡꯒꯤ ꯋꯥꯍꯪ ꯇꯥꯔꯤ…',
      voicePromptListening: 'ꯇꯥꯔꯤ... ꯍꯧꯖꯤꯛ ꯁꯦꯡꯅ ꯉꯥꯡꯕꯤꯌꯨ',
      chooseLanguageTitle: 'ꯅꯍꯥꯛꯀꯤ ꯂꯣꯟ ꯈꯟꯕꯤꯌꯨ',
      chooseLanguageSubtitle: 'ꯂꯧ-ꯁꯤꯡ ꯄꯥꯎꯇꯥꯛꯀꯤꯗꯃꯛ ꯂꯣꯟ ꯈꯟꯕꯤꯌꯨ',
      yourFarmLocation: 'ꯅꯍꯥꯛꯀꯤ ꯂꯧꯎ-ꯁꯤꯡꯎ ꯃꯐꯝ',
      continueToKrishi: 'ꯃꯈꯥ ꯆꯠꯊꯕꯤꯌꯨ →',
      signIn: 'ꯁꯥꯏꯟ ꯏꯟ',
      skipSignIn: 'ꯑꯊꯣꯏꯕ ꯑꯣꯏꯅ ꯃꯈꯥ ꯆꯠꯊꯕꯤꯌꯨ',
      backBtn: '← ꯍꯟꯗꯣꯛꯄ',
      doneBtn: 'ꯂꯣꯏꯔꯦ',
      appTitle: 'ꯀ꯭ꯔꯤꯁꯤ ꯁꯍꯥꯌꯛ',
      appSubtitle: 'ꯑꯦꯑꯥꯏ ꯂꯧ-ꯁꯤꯡ ꯄꯥꯎꯇꯥꯛ ꯊꯧꯔꯥꯡ',
      greetingPrefix: 'ꯈꯨꯔꯨꯃꯖꯔꯤ',
      greetingBlessing: 'ꯂꯧꯕꯨꯛꯇ ꯀꯟꯅ ꯍꯣꯠꯅꯔꯕ ꯃꯇꯨꯡꯗ ꯅꯨꯡꯉꯥꯏꯅ ꯄꯣꯊꯥꯕꯤꯌꯨ 🌙'
    }
  },
  doi: {
    name: 'Dogri',
    nativeName: 'डोगरी',
    overrides: {
      hero_greeting: 'कृषि सहायक च तुंदा स्वागत ऐ',
      welcomeFarmer: 'स्वागत ऐ, किसान भरा!',
      guestFarmer: 'प्राह्ना किसान',
      goodNight: 'शुभ रात',
      goodMorning: 'शुभ प्रभात',
      goodAfternoon: 'शुभ दुपहर',
      goodEvening: 'शुभ संझ',
      tapToSpeakHero: 'बोलने लेई टैप करो',
      tapToSpeak: '👉 बोलने लेई टैप करो',
      voicePromptSubtitle: 'फसलें, कीड़े, खाद जां मंडी दे भाव बारे पुच्छो',
      voicePromptListeningSub: 'तुंदे खेती दा सवाल सुनेआ जा करदा ऐ…',
      voicePromptListening: 'सुना करदे आं... हुण साफ बोलो',
      chooseLanguageTitle: 'अपनी बोली चुनो',
      chooseLanguageSubtitle: 'खेती दी सलाह लेई अपनी बोली चुनो',
      yourFarmLocation: 'तुंदे खेत दी थाह्',
      continueToKrishi: 'अग्गे बधो →',
      signIn: 'साइन इन',
      skipSignIn: 'प्राह्ने दे रूप च अग्गे बधो',
      backBtn: '← पिच्छे',
      doneBtn: 'मुक्की गेआ',
      appTitle: 'कृषि सहायक',
      appSubtitle: 'एआई खेती सलाह प्रणाली',
      greetingPrefix: 'नमस्ते',
      greetingBlessing: 'खेतें च कड्डी मेहनत दे बाद आराम करो 🌙'
    }
  },
  mai: {
    name: 'Maithili',
    nativeName: 'मैथिली',
    overrides: {
      hero_greeting: 'कृषि सहायक मे अपनेक स्वागत अछि',
      welcomeFarmer: 'स्वागत अछि, किसान भाई!',
      guestFarmer: 'अतिथि किसान',
      goodNight: 'शुभ रात्रि',
      goodMorning: 'शुभ प्रभात',
      goodAfternoon: 'शुभ दोपहर',
      goodEvening: 'शुभ संध्या',
      tapToSpeakHero: 'बाजए लेल टैप करू',
      tapToSpeak: '👉 बाजए लेल टैप करू',
      voicePromptSubtitle: 'फसल, कीरा, खाद आ मंडी भावक संबंध मे पूछू',
      voicePromptListeningSub: 'अहाँक खेतीक सवाल सुनल जा रहल अछि…',
      voicePromptListening: 'सुनि रहल छी... आब स्पष्ट बाजूद',
      chooseLanguageTitle: 'अपने भाषा चुनू',
      chooseLanguageSubtitle: 'कृषि सलाह लेल अपन भाषा चुनू',
      yourFarmLocation: 'अपनेक खेतक स्थान',
      continueToKrishi: 'आगू बढ़ू →',
      signIn: 'साइन इन',
      skipSignIn: 'अतिथि रूप मे आगू बढ़ू',
      backBtn: '← पाछाँ',
      doneBtn: 'सम्पन्न',
      appTitle: 'कृषि सहायक',
      appSubtitle: 'एआई कृषि सलाह प्रणाली',
      greetingPrefix: 'प्रणाम',
      greetingBlessing: 'खेत मे दिनभरि मिहनत कएलाक बाद आराम करू 🌙'
    }
  },
  sat: {
    name: 'Santali',
    nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ',
    overrides: {
      hero_greeting: 'ᱠᱨᱤᱥᱤ ᱥᱚᱦᱟᱭᱚᱠ ᱨᱮ ᱥᱟᱜᱩᱱ ᱫᱟᱨᱟᱢ',
      welcomeFarmer: 'ᱥᱟᱜᱩᱱ ᱫᱟᱨᱟᱢ, ᱪᱟᱥᱤ ᱵᱚᱭᱦᱟ!',
      guestFarmer: 'ᱯᱮᱲᱟ ᱪᱟᱥᱤ',
      goodNight: 'ᱧᱤᱫᱟᱹ ᱡᱚᱦᱟᱨ',
      goodMorning: 'ᱥᱮᱛᱟᱜ ᱡᱚᱦᱟᱨ',
      goodAfternoon: 'ᱛᱤᱠᱤᱱ ᱡᱚᱦᱟᱨ',
      goodEvening: 'ᱟᱹᱭᱩᱵ ᱡᱚᱦᱟᱨ',
      tapToSpeakHero: 'ᱨᱚᱲ ᱞᱟᱹᱜᱤᱫ ᱡᱚᱴᱮᱫ ᱢᱮ',
      tapToSpeak: '👉 ᱨᱚᱲ ᱞᱟᱹᱜᱤᱫ ᱡᱚᱴᱮᱫ ᱢᱮ',
      voicePromptSubtitle: 'ᱪᱟᱥ, ᱛᱤᱡᱩ, ᱥᱟᱨ ᱟᱨ ᱵᱟᱡᱟᱨ ᱫᱚᱨ ᱵᱟᱵᱚᱛ ᱠᱩᱞᱤ ᱢᱮ',
      voicePromptListeningSub: 'ᱟᱢᱟᱜ ᱪᱟᱥ ᱠᱩᱠᱞᱤ ᱟᱸᱡᱚᱢᱚᱜ ᱠᱟᱱᱟ…',
      voicePromptListening: 'ᱟᱸᱡᱚᱢᱚᱜ ᱠᱟᱱᱟ... ᱱᱤᱛ ᱯᱷᱟᱨᱪᱟ ᱨᱚᱲ ᱢᱮ',
      chooseLanguageTitle: 'ᱟᱢᱟᱜ ᱯᱟᱹᱨᱥᱤ ᱵᱟᱪᱷᱟᱣ ᱢᱮ',
      chooseLanguageSubtitle: 'ᱪᱟᱥ ᱫᱤᱥᱟᱹ ᱦᱩᱫᱤᱥ ᱞᱟᱹᱜᱤᱫ ᱟᱢᱟᱜ ᱯᱟᱹᱨᱥᱤ ᱵᱟᱪᱷᱟᱣ ᱢᱮ',
      yourFarmLocation: 'ᱟᱢᱟᱜ ᱠᱷᱮᱛ ᱴᱷᱟᱶ',
      continueToKrishi: 'ᱞᱟᱦᱟᱜ ᱢᱮ →',
      signIn: 'ᱥᱟᱭᱤᱱ ᱤᱱ',
      skipSignIn: 'ᱯᱮᱲᱟ ᱞᱮᱠᱟᱛᱮ ᱞᱟᱦᱟᱜ ᱢᱮ',
      backBtn: '← ᱛᱟᱭᱚᱢ',
      doneBtn: 'ᱪᱟᱵᱟᱭᱮᱱᱟ',
      appTitle: 'ᱠᱨᱤᱥᱤ ᱥᱚᱦᱟᱭᱚᱠ',
      appSubtitle: 'ᱮᱟᱭ ᱪᱟᱥ ᱫᱤᱥᱟᱹ ᱦᱩᱫᱤᱥ ᱵᱮᱵᱚᱥᱛᱷᱟ',
      greetingPrefix: 'ᱡᱚᱦᱟᱨ',
      greetingBlessing: 'ᱠᱷᱮᱛ ᱨᱮ ᱠᱟᱹᱢᱤ ᱛᱟᱭᱚᱢ ᱱᱟᱯᱟᱭ ᱡᱤᱨᱟᱹᱣ ᱢᱮ 🌙'
    }
  }
};

for (const [code, info] of Object.entries(NEW_LANGS)) {
  // Start with English fallback values
  const dict = Object.assign({}, enDict);
  
  // Apply specific native translations
  for (const [k, v] of Object.entries(info.overrides)) {
    dict[k] = v;
  }
  
  const targetPath = path.join(LOCALES_DIR, `${code}.json`);
  fs.writeFileSync(targetPath, JSON.stringify(dict, null, 2), 'utf8');
  console.log(`Generated: ${code}.json (${info.name} - ${info.nativeName}) with ${Object.keys(info.overrides).length} localized keys`);
}

console.log('\nAll 11 locale JSON dictionaries generated successfully in:');
console.log(LOCALES_DIR);
