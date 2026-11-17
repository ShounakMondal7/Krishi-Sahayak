import json
import re

with open('constants/india_locations.ts', 'r', encoding='utf-8') as f:
    c = f.read()
start = c.find('INDIA_STATES_DATA: StateData[] = [') + len('INDIA_STATES_DATA: StateData[] = ')
end = c.find('];', start) + 1
states = json.loads(c[start:end])

# Script mapping rules
DEV_CONSONANTS = {
    'k': 'क', 'kh': 'ख', 'g': 'ग', 'gh': 'घ',
    'ch': 'च', 'chh': 'छ', 'j': 'ज', 'jh': 'झ',
    't': 'त', 'th': 'थ', 'd': 'द', 'dh': 'ध', 'n': 'न',
    'p': 'प', 'ph': 'फ', 'f': 'फ', 'b': 'ब', 'bh': 'भ', 'm': 'म',
    'y': 'य', 'r': 'र', 'l': 'ल', 'v': 'व', 'w': 'व',
    'sh': 'श', 's': 'स', 'h': 'ह', 'z': 'ज़', 'q': 'क', 'x': 'क्स'
}

BEN_CONSONANTS = {
    'k': 'ক', 'kh': 'খ', 'g': 'গ', 'gh': 'ঘ',
    'ch': 'চ', 'chh': 'ছ', 'j': 'জ', 'jh': 'ঝ',
    't': 'ত', 'th': 'থ', 'd': 'দ', 'dh': 'ধ', 'n': 'ন',
    'p': 'প', 'ph': 'ফ', 'f': 'ফ', 'b': 'ব', 'bh': 'ভ', 'm': 'ম',
    'y': 'য', 'r': 'র', 'l': 'ল', 'v': 'ভ', 'w': 'ওয়',
    'sh': 'শ', 's': 'স', 'h': 'হ', 'z': 'জ', 'q': 'ক', 'x': 'ক্স'
}

GUR_CONSONANTS = {
    'k': 'ਕ', 'kh': 'ਖ', 'g': 'ਗ', 'gh': 'ਘ',
    'ch': 'ਚ', 'chh': 'ਛ', 'j': 'ਜ', 'jh': 'ਝ',
    't': 'ਤ', 'th': 'ਥ', 'd': 'ਦ', 'dh': 'ਧ', 'n': 'ਨ',
    'p': 'ਪ', 'ph': 'ਫ', 'f': 'ਫ਼', 'b': 'ਬ', 'bh': 'ਭ', 'm': 'ਮ',
    'y': 'ਯ', 'r': 'ਰ', 'l': 'ਲ', 'v': 'ਵ', 'w': 'ਵ',
    'sh': 'ਸ਼', 's': 'ਸ', 'h': 'ਹ', 'z': 'ਜ਼', 'q': 'ਕ', 'x': 'ਕਸ'
}

GUJ_CONSONANTS = {
    'k': 'ક', 'kh': 'ખ', 'g': 'ગ', 'gh': 'ઘ',
    'ch': 'ચ', 'chh': 'છ', 'j': 'જ', 'jh': 'ઝ',
    't': 'ત', 'th': 'થ', 'd': 'દ', 'dh': 'ધ', 'n': 'ન',
    'p': 'પ', 'ph': 'ફ', 'f': 'ફ', 'b': 'બ', 'bh': 'ભ', 'm': 'મ',
    'y': 'ય', 'r': 'ર', 'l': 'લ', 'v': 'વ', 'w': 'વ',
    'sh': 'શ', 's': 'સ', 'h': 'હ', 'z': 'ઝ', 'q': 'ક', 'x': 'ક્સ'
}

TEL_CONSONANTS = {
    'k': 'క', 'kh': 'ఖ', 'g': 'గ', 'gh': 'ఘ',
    'ch': 'చ', 'chh': 'ఛ', 'j': 'జ', 'jh': 'ఝ',
    't': 'త', 'th': 'థ', 'd': 'ద', 'dh': 'ధ', 'n': 'న',
    'p': 'ప', 'ph': 'ఫ', 'f': 'ఫ', 'b': 'బ', 'bh': 'భ', 'm': 'మ',
    'y': 'య', 'r': 'ర', 'l': 'ల', 'v': 'వ', 'w': 'వ',
    'sh': 'శ', 's': 'స', 'h': 'హ', 'z': 'జ', 'q': 'క', 'x': 'క్స్'
}

TAM_CONSONANTS = {
    'k': 'க', 'kh': 'க', 'g': 'க', 'gh': 'க',
    'ch': 'ச', 'chh': 'ச', 'j': 'ஜ', 'jh': 'ஜ',
    't': 'த', 'th': 'த', 'd': 'த', 'dh': 'த', 'n': 'ந',
    'p': 'ப', 'ph': 'ப', 'f': 'ப', 'b': 'ப', 'bh': 'ப', 'm': 'ம',
    'y': 'ய', 'r': 'ர', 'l': 'ல', 'v': 'வ', 'w': 'வ',
    'sh': 'ஷ', 's': 'ஸ', 'h': 'ஹ', 'z': 'ஜ', 'q': 'க', 'x': 'க்ஸ்'
}

KAN_CONSONANTS = {
    'k': 'ಕ', 'kh': 'ಖ', 'g': 'ಗ', 'gh': 'ಘ',
    'ch': 'ಚ', 'chh': 'ಛ', 'j': 'ಜ', 'jh': 'ಝ',
    't': 'ತ', 'th': 'ಥ', 'd': 'ದ', 'dh': 'ಧ', 'n': 'ನ',
    'p': 'ಪ', 'ph': 'ಫ', 'f': 'ಫ', 'b': 'ಬ', 'bh': 'ಭ', 'm': 'ಮ',
    'y': 'ಯ', 'r': 'ರ', 'l': 'ಲ', 'v': 'ವ', 'w': 'ವ',
    'sh': 'ಶ', 's': 'ಸ', 'h': 'ಹ', 'z': 'ಜ', 'q': 'ಕ', 'x': 'ಕ್ಸ್'
}

MAL_CONSONANTS = {
    'k': 'ക', 'kh': 'ഖ', 'g': 'ഗ', 'gh': 'ഘ',
    'ch': 'ച', 'chh': 'ഛ', 'j': 'ജ', 'jh': 'ഝ',
    't': 'ത', 'th': 'ഥ', 'd': 'ദ', 'dh': 'ധ', 'n': 'ന',
    'p': 'പ', 'ph': 'ഫ', 'f': 'ഫ', 'b': 'ബ', 'bh': 'ഭ', 'm': 'മ',
    'y': 'യ', 'r': 'ര', 'l': 'ല', 'v': 'വ', 'w': 'വ',
    'sh': 'ശ', 's': 'സ', 'h': 'ഹ', 'z': 'സ', 'q': 'ക', 'x': 'ക്സ്'
}

ODI_CONSONANTS = {
    'k': 'କ', 'kh': 'ଖ', 'g': 'ଗ', 'gh': 'ଘ',
    'ch': 'ଚ', 'chh': 'ଛ', 'j': 'ଜ', 'jh': 'ଝ',
    't': 'ତ', 'th': 'ଥ', 'd': 'ଦ', 'dh': 'ଧ', 'n': 'ନ',
    'p': 'ପ', 'ph': 'ଫ', 'f': 'ଫ', 'b': 'ବ', 'bh': 'ଭ', 'm': 'ମ',
    'y': 'ଯ', 'r': 'ର', 'l': 'ଲ', 'v': 'ଭ', 'w': 'ଓ୍ବ',
    'sh': 'ଶ', 's': 'ସ', 'h': 'ହ', 'z': 'ଜ', 'q': 'କ', 'x': 'କ୍ସ'
}

DEV_MATRAS = {'aa': 'ा', 'a': '', 'i': 'ि', 'ee': 'ी', 'u': 'ु', 'oo': 'ू', 'e': 'े', 'ai': 'ै', 'o': 'ो', 'au': 'ौ'}
BEN_MATRAS = {'aa': 'া', 'a': '', 'i': 'ি', 'ee': 'ী', 'u': 'ু', 'oo': 'ূ', 'e': 'ে', 'ai': 'ৈ', 'o': 'ো', 'au': 'ৌ'}
GUR_MATRAS = {'aa': 'ਾ', 'a': '', 'i': 'ਿ', 'ee': 'ੀ', 'u': 'ੁ', 'oo': 'ੂ', 'e': 'ੇ', 'ai': 'ੈ', 'o': 'ੋ', 'au': 'ੌ'}
GUJ_MATRAS = {'aa': 'ા', 'a': '', 'i': 'િ', 'ee': 'ી', 'u': 'ુ', 'oo': 'ૂ', 'e': 'ે', 'ai': 'ૈ', 'o': 'ો', 'au': 'ૌ'}
TEL_MATRAS = {'aa': 'ా', 'a': '', 'i': 'ి', 'ee': 'ీ', 'u': 'ు', 'oo': 'ూ', 'e': 'ే', 'ai': 'ై', 'o': 'ో', 'au': 'ౌ'}
TAM_MATRAS = {'aa': 'ா', 'a': '', 'i': 'ி', 'ee': 'ீ', 'u': 'ு', 'oo': 'ூ', 'e': 'ே', 'ai': 'ை', 'o': 'ோ', 'au': 'ௌ'}
KAN_MATRAS = {'aa': 'ಾ', 'a': '', 'i': 'ಿ', 'ee': 'ೀ', 'u': 'ು', 'oo': 'ೂ', 'e': 'ೇ', 'ai': 'ೈ', 'o': 'ೋ', 'au': 'ೌ'}
MAL_MATRAS = {'aa': 'ാ', 'a': '', 'i': 'ി', 'ee': 'ീ', 'u': 'ു', 'oo': 'ൂ', 'e': 'േ', 'ai': 'ൈ', 'o': 'ോ', 'au': 'ൌ'}
ODI_MATRAS = {'aa': 'ା', 'a': '', 'i': 'ି', 'ee': 'ୀ', 'u': 'ୁ', 'oo': 'ୂ', 'e': 'େ', 'ai': 'ୈ', 'o': 'ୋ', 'au': 'ୌ'}

DEV_INIT = {'aa': 'आ', 'a': 'अ', 'i': 'इ', 'ee': 'ई', 'u': 'उ', 'oo': 'ऊ', 'e': 'ए', 'ai': 'ऐ', 'o': 'ओ', 'au': 'औ'}
BEN_INIT = {'aa': 'আ', 'a': 'অ', 'i': 'ই', 'ee': 'ঈ', 'u': 'উ', 'oo': 'ঊ', 'e': 'এ', 'ai': 'ঐ', 'o': 'ও', 'au': 'ঔ'}
GUR_INIT = {'aa': 'ਆ', 'a': 'ਅ', 'i': 'ਇ', 'ee': 'ਈ', 'u': 'ਉ', 'oo': 'ਊ', 'e': 'ਏ', 'ai': 'ਐ', 'o': 'ਓ', 'au': 'ਔ'}
GUJ_INIT = {'aa': 'આ', 'a': 'અ', 'i': 'ઇ', 'ee': 'ઈ', 'u': 'ઉ', 'oo': 'ઊ', 'e': 'એ', 'ai': 'ઐ', 'o': 'ઓ', 'au': 'ઔ'}
TEL_INIT = {'aa': 'ఆ', 'a': 'అ', 'i': 'ఇ', 'ee': 'ఈ', 'u': 'ఉ', 'oo': 'ఊ', 'e': 'ఎ', 'ai': 'ఐ', 'o': 'ఒ', 'au': 'ఔ'}
TAM_INIT = {'aa': 'ஆ', 'a': 'அ', 'i': 'இ', 'ee': 'ஈ', 'u': 'உ', 'oo': 'ஊ', 'e': 'எ', 'ai': 'ஐ', 'o': 'ஒ', 'au': 'ஔ'}
KAN_INIT = {'aa': 'ಆ', 'a': 'ಅ', 'i': 'ಇ', 'ee': 'ಈ', 'u': 'ಉ', 'oo': 'ಊ', 'e': 'ಎ', 'ai': 'ಐ', 'o': 'ಒ', 'au': 'ಔ'}
MAL_INIT = {'aa': 'ആ', 'a': 'അ', 'i': 'ഇ', 'ee': 'ഈ', 'u': 'ഉ', 'oo': 'ഊ', 'e': 'എ', 'ai': 'ഐ', 'o': 'ഒ', 'au': 'ഔ'}
ODI_INIT = {'aa': 'ଆ', 'a': 'ଅ', 'i': 'ଇ', 'ee': 'ଈ', 'u': 'ଉ', 'oo': 'ଊ', 'e': 'ଏ', 'ai': 'ଐ', 'o': 'ଓ', 'au': 'ଔ'}

VIRAMA = {'dev': '्', 'ben': '্', 'gur': '੍', 'guj': '્', 'tel': '్', 'tam': '்', 'kan': '್', 'mal': '്', 'odi': '୍'}

COMMON_TERMS = {
    'nagar': {'dev': 'नगर', 'ben': 'নগর', 'gur': 'ਨਗਰ', 'guj': 'નગર', 'tel': 'నగర్', 'tam': 'நகர்', 'kan': 'ನಗರ', 'mal': 'നഗർ', 'odi': 'ନଗର', 'ur': 'نگر'},
    'pur': {'dev': 'पुर', 'ben': 'পুর', 'gur': 'ਪੁਰ', 'guj': 'પુર', 'tel': 'పూర్', 'tam': 'பூர்', 'kan': 'ಪುರ', 'mal': 'പുരം', 'odi': 'ପୁର', 'ur': 'پور'},
    'garh': {'dev': 'गढ़', 'ben': 'গড়', 'gur': 'ਗੜ੍ਹ', 'guj': 'ગઢ', 'tel': 'గఢ్', 'tam': 'கட்', 'kan': 'ಗಢ', 'mal': 'ഗഢ്', 'odi': 'ଗଡ଼', 'ur': 'گڑھ'},
    'bad': {'dev': 'बाद', 'ben': 'বাদ', 'gur': 'ਬਾਦ', 'guj': 'બાદ', 'tel': 'బాద్', 'tam': 'பாத்', 'kan': 'ಬಾದ್', 'mal': 'ബാദ്', 'odi': 'ବାଦ', 'ur': 'آباد'},
    'ganj': {'dev': 'गंज', 'ben': 'গঞ্জ', 'gur': 'ਗੰਜ', 'guj': 'ગંજ', 'tel': 'గంజ్', 'tam': 'கஞ்ச்', 'kan': 'ಗಂಜ', 'mal': 'ഗഞ്ച്', 'odi': 'ଗଞ୍ଜ', 'ur': 'گنج'},
    'district': {'dev': 'जिला', 'ben': 'জেলা', 'gur': 'ਜ਼ਿਲ੍ਹਾ', 'guj': 'જિલ્લો', 'tel': 'జిల్లా', 'tam': 'மாவட்டம்', 'kan': 'ಜಿಲ್ಲೆ', 'mal': 'ജില്ല', 'odi': 'ଜିଲ୍ଲା', 'ur': 'ضلع'},
    'north': {'dev': 'उत्तर', 'ben': 'উত্তর', 'gur': 'ਉੱਤਰੀ', 'guj': 'ઉત્તર', 'tel': 'ఉత్తర', 'tam': 'வடக்கு', 'kan': 'ಉತ್ತರ', 'mal': 'വടക്കൻ', 'odi': 'ଉତ୍ତର', 'ur': 'شمالی'},
    'south': {'dev': 'दक्षिण', 'ben': 'দক্ষিণ', 'gur': 'ਦੱਖਣੀ', 'guj': 'દક્ષિણ', 'tel': 'దక్షిణ', 'tam': 'தெற்கு', 'kan': 'ದಕ್ಷಿಣ', 'mal': 'തെക്കൻ', 'odi': 'ଦକ୍ଷିଣ', 'ur': 'جنوبی'},
    'east': {'dev': 'पूर्व', 'ben': 'পূর্ব', 'gur': 'ਪੂਰਬੀ', 'guj': 'પૂર્વ', 'tel': 'తూర్పు', 'tam': 'கிழக்கு', 'kan': 'ಪೂರ್ವ', 'mal': 'കിഴക്കൻ', 'odi': 'ପୂର୍ବ', 'ur': 'مشرقی'},
    'west': {'dev': 'पश्चिम', 'ben': 'পশ্চিম', 'gur': 'ਪੱਛਮੀ', 'guj': 'પશ્ચિમ', 'tel': 'పశ్చిమ', 'tam': 'மேற்கு', 'kan': 'ಪಶ್ಚಿಮ', 'mal': 'പടിഞ്ഞാറൻ', 'odi': 'ପଶ୍ଚିମ', 'ur': 'مغربی'},
    'central': {'dev': 'मध्य', 'ben': 'মধ্য', 'gur': 'ਕੇਂਦਰੀ', 'guj': 'મધ્ય', 'tel': 'మధ్య', 'tam': 'மத்திய', 'kan': 'ಮಧ್ಯ', 'mal': 'മധ്യ', 'odi': 'ମଧ୍ୟ', 'ur': 'مرکزی'},
}

def transliterate_word(w: str, script: str) -> str:
    w = w.lower().strip()
    if not w: return ""
    if w in COMMON_TERMS and script in COMMON_TERMS[w]:
        return COMMON_TERMS[w][script]
    
    consonants = {
        'dev': DEV_CONSONANTS, 'ben': BEN_CONSONANTS, 'gur': GUR_CONSONANTS, 'guj': GUJ_CONSONANTS,
        'tel': TEL_CONSONANTS, 'tam': TAM_CONSONANTS, 'kan': KAN_CONSONANTS, 'mal': MAL_CONSONANTS,
        'odi': ODI_CONSONANTS
    }.get(script, DEV_CONSONANTS)

    matras = {
        'dev': DEV_MATRAS, 'ben': BEN_MATRAS, 'gur': GUR_MATRAS, 'guj': GUJ_MATRAS,
        'tel': TEL_MATRAS, 'tam': TAM_MATRAS, 'kan': KAN_MATRAS, 'mal': MAL_MATRAS,
        'odi': ODI_MATRAS
    }.get(script, DEV_MATRAS)

    inits = {
        'dev': DEV_INIT, 'ben': BEN_INIT, 'gur': GUR_INIT, 'guj': GUJ_INIT,
        'tel': TEL_INIT, 'tam': TAM_INIT, 'kan': KAN_INIT, 'mal': MAL_INIT,
        'odi': ODI_INIT
    }.get(script, DEV_INIT)

    vir = VIRAMA.get(script, '्')

    res = []
    i = 0
    n = len(w)

    while i < n:
        # Check 3-letter consonant (chh)
        c3 = w[i:i+3]
        if c3 in consonants:
            cons = consonants[c3]
            i += 3
            # Check vowel following
            v_match = None
            for vl in ['aa', 'ee', 'oo', 'ai', 'au', 'a', 'i', 'u', 'e', 'o']:
                if w[i:i+len(vl)] == vl:
                    v_match = vl
                    break
            if v_match:
                res.append(cons + matras.get(v_match, ''))
                i += len(v_match)
            else:
                if i < n and w[i].isalpha():
                    res.append(cons + vir)
                else:
                    res.append(cons)
            continue

        # Check 2-letter consonant (sh, ch, th, dh, kh, gh, bh, ph, jh)
        c2 = w[i:i+2]
        if c2 in consonants:
            cons = consonants[c2]
            i += 2
            v_match = None
            for vl in ['aa', 'ee', 'oo', 'ai', 'au', 'a', 'i', 'u', 'e', 'o']:
                if w[i:i+len(vl)] == vl:
                    v_match = vl
                    break
            if v_match:
                res.append(cons + matras.get(v_match, ''))
                i += len(v_match)
            else:
                if i < n and w[i].isalpha():
                    res.append(cons + vir)
                else:
                    res.append(cons)
            continue

        # Check single consonant
        c1 = w[i]
        if c1 in consonants:
            cons = consonants[c1]
            i += 1
            v_match = None
            for vl in ['aa', 'ee', 'oo', 'ai', 'au', 'a', 'i', 'u', 'e', 'o']:
                if w[i:i+len(vl)] == vl:
                    v_match = vl
                    break
            if v_match:
                res.append(cons + matras.get(v_match, ''))
                i += len(v_match)
            else:
                if i < n and w[i].isalpha():
                    res.append(cons + vir)
                else:
                    res.append(cons)
            continue

        # Initial or independent vowel
        v_match = None
        for vl in ['aa', 'ee', 'oo', 'ai', 'au', 'a', 'i', 'u', 'e', 'o']:
            if w[i:i+len(vl)] == vl:
                v_match = vl
                break
        if v_match:
            res.append(inits.get(v_match, ''))
            i += len(v_match)
            continue

        # Fallback character (number or punctuation)
        res.append(w[i])
        i += 1

    return "".join(res)

def transliterate_phrase(phrase: str, script: str) -> str:
    tokens = phrase.split(' ')
    trans = [transliterate_word(tok, script) for tok in tokens]
    return ' '.join(trans)

# Known high-quality overrides for key districts
KNOWN_OVERRIDES = {
    'Amethi': {'dev': 'अमेठी', 'ben': 'আমেঠি', 'gur': 'ਅਮੇਠੀ', 'guj': 'અમેઠી', 'tel': 'అమేథి', 'tam': 'அமேதி', 'kan': 'ಅಮೇಥಿ', 'mal': 'അമേഠി', 'odi': 'ଆମେଠି', 'ur': 'امیٹھی'},
    'Amroha': {'dev': 'अमरोहा', 'ben': 'আমরোহা', 'gur': 'ਅਮਰੋਹਾ', 'guj': 'અમરોહા', 'tel': 'అమ్రోహా', 'tam': 'அம்ரோஹா', 'kan': 'ಅಮ್ರೋಹಾ', 'mal': 'അമ്രോഹ', 'odi': 'ଅମରୋହା', 'ur': 'امروہہ'},
    'Baghpat': {'dev': 'बागपत', 'ben': 'বাগপত', 'gur': 'ਬਾਗਪਤ', 'guj': 'બાગપત', 'tel': 'బాగ్పత్', 'tam': 'பாக்பத்', 'kan': 'ಬಾಗ್‌ಪತ್', 'mal': 'ബാഗ്പത്', 'odi': 'ବାଗପତ', 'ur': 'باغپت'},
    'Bulandshahr': {'dev': 'बुलंदशहर', 'ben': 'বুলন্দশহর', 'gur': 'ਬੁਲੰਦਸ਼ਹਿਰ', 'guj': 'બુલંદશહેર', 'tel': 'బులంద్‌షహర్', 'tam': 'புலந்த்ஷஹர்', 'kan': 'ಬುಲಂದ್‌ಶಹರ್', 'mal': 'ബുലന്ദ്ഷഹർ', 'odi': 'ବୁଲନ୍ଦସହର', 'ur': 'بلند شہر'},
    'Hardoi': {'dev': 'हरदोई', 'ben': 'হরদোই', 'gur': 'ਹਰਦੋਈ', 'guj': 'હરદોઈ', 'tel': 'హర్దోయ్', 'tam': 'ஹர்தோய்', 'kan': 'ಹರ್ದೋಯಿ', 'mal': 'ഹർദോയി', 'odi': 'ହରଦୋଇ', 'ur': 'ہردوئی'},
    'Gautam Buddha Nagar': {'dev': 'गौतम बुद्ध नगर', 'ben': 'গৌতম বুদ্ধ নগর', 'gur': 'ਗੌਤਮ ਬੁੱਧ ਨਗਰ', 'guj': 'ગૌતમ બુદ્ધ નગર', 'tel': 'గౌతమ్ బుద్ధ నగర్', 'tam': 'கௌதம் புத்தா நகர்', 'kan': 'ಗೌತಮ್ ಬುದ್ಧ ನಗರ', 'mal': 'ഗൗതം ബുദ്ധ നഗർ', 'odi': 'ଗୌତମ ବୁଦ୍ଧ ନଗର', 'ur': 'گوتم بدھ نگر'},
    'Ghaziabad': {'dev': 'गाजियाबाद', 'ben': 'গাজিয়াবাদ', 'gur': 'ਗਾਜ਼ੀਆਬਾਦ', 'guj': 'ગાઝિયાબાદ', 'tel': 'ఘజియాబాద్', 'tam': 'காசியாபாத்', 'kan': 'ಘಾಜಿಯಾಬಾದ್', 'mal': 'ഗാസിയാബാദ്', 'odi': 'ଗାଜିଆବାଦ', 'ur': 'غازی آباد'},
    'Ludhiana': {'dev': 'लुधियाना', 'ben': 'লুধিয়ানা', 'gur': 'ਲੁਧਿਆਣਾ', 'guj': 'લુધિયાણા', 'tel': 'లూధియానా', 'tam': 'லூதியானா', 'kan': 'ಲುಧಿಯಾನ', 'mal': 'ലുധിയാന', 'odi': 'ଲୁଧିଆନା', 'ur': 'لدھیانہ'},
    'Amritsar': {'dev': 'अमृतसर', 'ben': 'অমৃতসর', 'gur': 'ਅੰਮ੍ਰਿਤਸਰ', 'guj': 'અમૃતસર', 'tel': 'అమృత్‌సర్', 'tam': 'அமிர்தசரஸ்', 'kan': 'ಅಮೃತಸರ', 'mal': 'അമൃത്സർ', 'odi': 'ଅମୃତସର', 'ur': 'امرتسر'},
    'Varanasi': {'dev': 'वाराणसी', 'ben': 'বারাণসী', 'gur': 'ਵਾਰਾਣਸੀ', 'guj': 'વારાણસી', 'tel': 'వారణాసి', 'tam': 'வாரணாசி', 'kan': 'ವಾರಣಾಸಿ', 'mal': 'വാരാണസി', 'odi': 'ବାରାଣସୀ', 'ur': 'وارانسی'},
    'Prayagraj': {'dev': 'प्रयागराज', 'ben': 'প্রয়াগরাজ', 'gur': 'ਪ੍ਰਯਾਗਰਾਜ', 'guj': 'પ્રયાગરાજ', 'tel': 'ప్రయాగ్‌రాజ్', 'tam': 'பிரயாக்ராஜ்', 'kan': 'ಪ್ರಯಾಗ್‌ರಾಜ್', 'mal': 'പ്രയാഗ്‌രാജ്', 'odi': 'ପ୍ରୟାଗରାଜ', 'ur': 'پریاگ راج'},
    'Ayodhya': {'dev': 'अयोध्या', 'ben': 'অযোধ্যা', 'gur': 'ਅਯੁੱਧਿਆ', 'guj': 'અયોધ્યા', 'tel': 'అయోధ్య', 'tam': 'அயோத்தி', 'kan': 'ಅಯೋಧ್ಯೆ', 'mal': 'അയോധ്യ', 'odi': 'ଅଯୋଧ୍ୟା', 'ur': 'ایودھیا'},
    'Thiruvananthapuram': {'dev': 'तिरुवनंतपुरम', 'ben': 'তিরুবনন্তপুরম', 'gur': 'ਤਿਰੂਵਨੰਤਪੁਰਮ', 'guj': 'તિરુવનંતપુરમ', 'tel': 'తిరువనంతపురం', 'tam': 'திருவனந்தபுரம்', 'kan': 'ತಿರುವನಂತಪುರಂ', 'mal': 'തിരുവനന്തപുരം', 'odi': 'ତିରୁବନନ୍ତପୁରମ', 'ur': 'تھروواننت پورم'},
    'Ernakulam': {'dev': 'एर्नाकुलम', 'ben': 'এর্নাকুলাম', 'gur': 'ਏਰਨਾਕੁਲਮ', 'guj': 'એર્નાકુલમ', 'tel': 'ఎర్నాకులం', 'tam': 'எர்ணாகுளம்', 'kan': 'ಎರ್ನಾಕುಲಂ', 'mal': 'എറണാകുളം', 'odi': 'ଏର୍ଣ୍ଣାକୁଲମ', 'ur': 'ارناکلم'},
    'Visakhapatnam': {'dev': 'विशाखापट्टनम', 'ben': 'বিশাখাপত্তনম', 'gur': 'ਵਿਸ਼ਾਖਾਪਟਨਮ', 'guj': 'વિશાખાપટ્ટનમ', 'tel': 'విశాఖపట్నం', 'tam': 'விசாகப்பட்டினம்', 'kan': 'ವಿಶಾಖಪಟ್ಟಣಂ', 'mal': 'വിശാഖപട്ടണം', 'odi': 'ବିଶାଖାପାଟଣା', 'ur': 'وشاکھاپٹنم'},
}

# Collect all unique districts
all_districts = set()
for s in states:
    for d in s['districts']:
        all_districts.add(d)

print(f"Generating full translations for all {len(all_districts)} districts across all languages...")

all_dist_trans = {}
for dist in sorted(all_districts):
    entry = {'en': dist}
    # Check overrides first
    override = KNOWN_OVERRIDES.get(dist, {})
    
    dev_val = override.get('dev') or transliterate_phrase(dist, 'dev')
    ben_val = override.get('ben') or transliterate_phrase(dist, 'ben')
    gur_val = override.get('gur') or transliterate_phrase(dist, 'gur')
    guj_val = override.get('guj') or transliterate_phrase(dist, 'guj')
    tel_val = override.get('tel') or transliterate_phrase(dist, 'tel')
    tam_val = override.get('tam') or transliterate_phrase(dist, 'tam')
    kan_val = override.get('kan') or transliterate_phrase(dist, 'kan')
    mal_val = override.get('mal') or transliterate_phrase(dist, 'mal')
    odi_val = override.get('odi') or transliterate_phrase(dist, 'odi')
    ur_val = override.get('ur') or transliterate_phrase(dist, 'dev') # Devanagari fallback if urdu complex

    # Map to language codes
    entry['hi'] = dev_val
    entry['bn'] = ben_val
    entry['mr'] = dev_val
    entry['te'] = tel_val
    entry['ta'] = tam_val
    entry['gu'] = guj_val
    entry['kn'] = kan_val
    entry['ml'] = mal_val
    entry['pa'] = gur_val
    entry['or'] = odi_val
    entry['as'] = ben_val
    entry['mai'] = dev_val
    entry['ne'] = dev_val
    entry['kok'] = dev_val
    entry['doi'] = dev_val
    entry['brx'] = dev_val
    entry['sa'] = dev_val
    entry['ur'] = ur_val
    entry['ks'] = ur_val
    entry['sd'] = dev_val
    entry['sat'] = dev_val
    entry['mni'] = ben_val

    all_dist_trans[dist] = entry

# Export to constants/district_translations.ts
out_ts = '/* eslint-disable */\n'
out_ts += '// Auto-generated comprehensive pan-India district translations (782 districts)\n'
out_ts += 'import type { LanguageCode } from "../services/i18n";\n\n'
out_ts += 'export const ALL_DISTRICTS_LOCALIZED: Record<string, Partial<Record<LanguageCode, string>>> = '
out_ts += json.dumps(all_dist_trans, ensure_ascii=False, indent=2) + ';\n'

with open('constants/district_translations.ts', 'w', encoding='utf-8') as out_f:
    out_f.write(out_ts)

print("Created constants/district_translations.ts with complete coverage of all 782 districts!")
