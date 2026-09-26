/**
 * scripts/validate_locales.js — Programmatic Localization & Script Bleeding Auditor
 *
 * Audits all state and district localization mappings for script-leaking bugs
 * against strict Indic Unicode ranges:
 *   - Hindi (Devanagari): /^[\u0900-\u097F\s\.,\-\(\)]+$/
 *   - Bengali (Bangla):   /^[\u0980-\u09FF\s\.,\-\(\)]+$/
 *
 * Automatically detects foreign script contamination (e.g. Gujarati, Gurmukhi,
 * Tamil, stray English characters), applies verified script corrections,
 * rewrites the source file, and re-validates for 100% cleanliness.
 */

const fs = require('fs');
const path = require('path');

const LOCATIONS_PATH = path.resolve(__dirname, '../frontend/mobile/services/locations.ts');

const HINDI_REGEX = /^[\u0900-\u097F\s\.,\-\(\)]+$/;
const BENGALI_REGEX = /^[\u0980-\u09FF\s\.,\-\(\)]+$/;

function identifyScript(char) {
  const code = char.charCodeAt(0);
  if (code >= 0x0030 && code <= 0x0039) return 'ASCII Digits';
  if ((code >= 0x0041 && code <= 0x005a) || (code >= 0x0061 && code <= 0x007a)) return 'Latin (English)';
  if (code >= 0x0900 && code <= 0x097f) return 'Devanagari (Hindi)';
  if (code >= 0x0980 && code <= 0x09ff) return 'Bengali / Assamese';
  if (code >= 0x0a00 && code <= 0x0a7f) return 'Gurmukhi (Punjabi)';
  if (code >= 0x0a80 && code <= 0x0aff) return 'Gujarati';
  if (code >= 0x0b00 && code <= 0x0b7f) return 'Odia';
  if (code >= 0x0b80 && code <= 0x0bff) return 'Tamil';
  if (code >= 0x0c00 && code <= 0x0c7f) return 'Telugu';
  if (code >= 0x0c80 && code <= 0x0cff) return 'Kannada';
  if (code >= 0x0d00 && code <= 0x0d7f) return 'Malayalam';
  return `Unicode U+${code.toString(16).toUpperCase()}`;
}

// Verified correct mappings for detected anomalies
const VERIFIED_CORRECTIONS = {
  // Hindi & Bengali Primary Targets
  "bn:Gujarat": {
    old: "ગુજરાત",
    fixed: "গুজরাট",
    reason: "Gujarati script (U+0A97...) leaked into Bengali dictionary"
  },
  "bn:Sitapur": {
    old: "सীতাপুর",
    fixed: "সীতাপুর",
    reason: "Devanagari 'स' (U+0938) leaked into Bengali dictionary"
  },
  "hi:North 24 Parganas": {
    old: "उत्तर 24 परगना",
    fixed: "उत्तर २४ परगना",
    reason: "ASCII numerals '24' replaced with Devanagari numerals '२४' (U+0968 U+096A)"
  },
  "hi:South 24 Parganas": {
    old: "दक्षिण 24 परगना",
    fixed: "दक्षिण २४ परगना",
    reason: "ASCII numerals '24' replaced with Devanagari numerals '२४' (U+0968 U+096A)"
  },

  // Cross-Script Sanitization for full codebase integrity
  "te:Assam": {
    old: "அஸ்ஸாம்",
    fixed: "అస్సాం",
    reason: "Tamil 'அ' (U+0B85) leaked into Telugu state translation"
  },
  "as:Karnataka": {
    old: "ಕৰ್ণাটক",
    fixed: "কৰ্ণাটক",
    reason: "Kannada 'ಕ' (U+0C95) leaked into Assamese state translation"
  },
  "or:Tamil Nadu": {
    old: "ਤਾਮਿਲਨਾਡੂ",
    fixed: "ତାମିଲନାଡୁ",
    reason: "Gurmukhi (U+0A24...) leaked into Odia state translation"
  },
  "te:Ambedkar Nagar": {
    old: "அంబేద్కర్ నగర్",
    fixed: "అంబేద్కర్ నగర్",
    reason: "Tamil 'அ' (U+0B85) leaked into Telugu district translation"
  },
  "pa:Hathras": {
    old: "হাথরস",
    fixed: "ਹਾਥਰਸ",
    reason: "Bengali (U+09B9...) leaked into Punjabi district translation"
  },
  "pa:Jaunpur": {
    old: "ਜੌনਪੁਰ",
    fixed: "ਜੌਨਪੁਰ",
    reason: "Bengali 'ন' (U+09A8) leaked into Punjabi district translation"
  },
  "ml:Shivamogga": {
    old: "ശിവമോഗ്ഗ",
    fixed: "ശിവമോഗ",
    reason: "Kannada conjunct (U+0CCD U+0C97) leaked into Malayalam district translation"
  },
  "ml:Hassan": {
    old: "ഹാಸನ್",
    fixed: "ഹാസൻ",
    reason: "Kannada 'ಸ' (U+0CB8) leaked into Malayalam district translation"
  },
  "ml:Vijayapura": {
    old: "ವಿಜಯಪುರ",
    fixed: "വിജയപുര",
    reason: "Full Kannada script (U+0CB5...) leaked into Malayalam district translation"
  }
};

function auditContent(content) {
  const anomalies = [];
  let totalHindiChecked = 0;
  let totalBengaliChecked = 0;

  // Regex to extract translation blocks: 'Location': { ... }
  const blockRegex = /'([^']+)':\s*\{([^}]+)\}/g;
  let match;

  while ((match = blockRegex.exec(content)) !== null) {
    const locationName = match[1];
    const body = match[2];

    // Check Hindi
    const hiMatch = /hi:\s*'([^']+)'/.exec(body);
    if (hiMatch) {
      totalHindiChecked++;
      const val = hiMatch[1];
      if (!HINDI_REGEX.test(val)) {
        const leakedScripts = [];
        for (const ch of val) {
          if (!HINDI_REGEX.test(ch)) {
            leakedScripts.push(`${ch} [${identifyScript(ch)}]`);
          }
        }
        anomalies.push({
          location: locationName,
          lang: 'hi',
          value: val,
          leaked: [...new Set(leakedScripts)].join(', ')
        });
      }
    }

    // Check Bengali
    const bnMatch = /bn:\s*'([^']+)'/.exec(body);
    if (bnMatch) {
      totalBengaliChecked++;
      const val = bnMatch[1];
      if (!BENGALI_REGEX.test(val)) {
        const leakedScripts = [];
        for (const ch of val) {
          if (!BENGALI_REGEX.test(ch)) {
            leakedScripts.push(`${ch} [${identifyScript(ch)}]`);
          }
        }
        anomalies.push({
          location: locationName,
          lang: 'bn',
          value: val,
          leaked: [...new Set(leakedScripts)].join(', ')
        });
      }
    }
  }

  return { anomalies, totalHindiChecked, totalBengaliChecked };
}

function runAudit() {
  console.log('================================================================');
  console.log('🔍 PAN-INDIA LOCATION DICTIONARY SCRIPT AUDITOR');
  console.log('Target: ' + LOCATIONS_PATH);
  console.log('================================================================\n');

  let fileContent = fs.readFileSync(LOCATIONS_PATH, 'utf8');

  // Step 1: Initial Audit
  console.log('Phase 1: Auditing Hindi (Devanagari) & Bengali (Bangla) dictionaries...');
  const initialAudit = auditContent(fileContent);

  console.log(`Total Hindi location entries checked:   ${initialAudit.totalHindiChecked}`);
  console.log(`Total Bengali location entries checked: ${initialAudit.totalBengaliChecked}`);
  console.log(`Total Anomalies Detected:               ${initialAudit.anomalies.length}\n`);

  if (initialAudit.anomalies.length > 0) {
    console.log('🚩 FLAGGED ANOMALIES (Script-Bleeding Detected):');
    console.table(
      initialAudit.anomalies.map((a) => ({
        'Location Name': a.location,
        'Target Lang': a.lang.toUpperCase(),
        'Corrupted Value': a.value,
        'Contaminating Characters / Scripts': a.leaked
      }))
    );
  }

  // Step 2: Auto-Correction
  console.log('\nPhase 2: Applying Auto-Corrections & Regenerating Target Scripts...');
  const correctionsApplied = [];

  for (const [key, correction] of Object.entries(VERIFIED_CORRECTIONS)) {
    const [lang, locName] = key.split(':');
    
    // Look for exact pattern in fileContent: e.g. lang: 'old'
    const targetPattern = new RegExp(`(${lang}:\\s*)'${correction.old.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&')}'`, 'g');
    
    if (targetPattern.test(fileContent)) {
      fileContent = fileContent.replace(targetPattern, `$1'${correction.fixed}'`);
      correctionsApplied.push({
        'Location': locName,
        'Language': lang.toUpperCase(),
        'Original Value': correction.old,
        'Corrected Value': correction.fixed,
        'Fix Details': correction.reason
      });
    }
  }

  console.log(`Total Corrections Applied: ${correctionsApplied.length}`);
  console.table(correctionsApplied);

  // Write updated file
  fs.writeFileSync(LOCATIONS_PATH, fileContent, 'utf8');
  console.log(`\n💾 Successfully wrote sanitized translations back to:\n   ${LOCATIONS_PATH}`);

  // Step 3: Verification Audit
  console.log('\nPhase 3: Post-Correction Verification Audit...');
  const verifyContent = fs.readFileSync(LOCATIONS_PATH, 'utf8');
  const postAudit = auditContent(verifyContent);

  console.log(`Verified Hindi entries:   ${postAudit.totalHindiChecked} (Clean: ${postAudit.totalHindiChecked - postAudit.anomalies.filter(a => a.lang === 'hi').length})`);
  console.log(`Verified Bengali entries: ${postAudit.totalBengaliChecked} (Clean: ${postAudit.totalBengaliChecked - postAudit.anomalies.filter(a => a.lang === 'bn').length})`);
  console.log(`Remaining Anomalies:     ${postAudit.anomalies.length}`);

  if (postAudit.anomalies.length === 0) {
    console.log('\n✅ 100% AUDIT PASS: All Hindi and Bengali location mappings strictly conform');
    console.log('   to their respective Unicode blocks with ZERO script-bleeding!\n');
    console.log('   Hindi Block:   \\u0900-\\u097F [100% PURE DEVANAGARI]');
    console.log('   Bengali Block: \\u0980-\\u09FF [100% PURE BANGLA]');
    console.log('================================================================\n');
  } else {
    console.error('❌ Residual anomalies remaining:');
    console.table(postAudit.anomalies);
    process.exit(1);
  }
}

runAudit();
