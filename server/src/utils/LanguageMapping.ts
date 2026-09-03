export interface TargetLanguageInfo {
  name: string;
  code: string;
  nativeName: string;
  promptInstruction: string;
  dialogueInstruction: string;
}

/**
 * Common ISO-3166-1 alpha-2 / country name to primary ISO-639-1 language code mapping.
 * Used when a country name or country code is provided instead of a direct BCP-47 language tag.
 */
const COUNTRY_TO_LANGUAGE_CODE: Record<string, string> = {
  // Asia & Southeast Asia
  vn: 'vi', vietnam: 'vi', 'viet nam': 'vi', sea: 'vi',
  cn: 'zh', china: 'zh', taiwan: 'zh-TW', tw: 'zh-TW', 'hong kong': 'zh-HK', hk: 'zh-HK',
  jp: 'ja', japan: 'ja',
  kr: 'ko', korea: 'ko', 'south korea': 'ko',
  th: 'th', thailand: 'th',
  id: 'id', indonesia: 'id',
  my: 'ms', malaysia: 'ms',
  ph: 'fil', philippines: 'fil',
  in: 'hi', india: 'hi',
  pk: 'ur', pakistan: 'ur',
  bd: 'bn', bangladesh: 'bn',
  sg: 'en', singapore: 'en',
  kh: 'km', cambodia: 'km',
  la: 'lo', laos: 'lo',
  mm: 'my', myanmar: 'my',

  // Europe
  gb: 'en', uk: 'en', 'united kingdom': 'en', england: 'en',
  fr: 'fr', france: 'fr',
  de: 'de', germany: 'de',
  es: 'es', spain: 'es',
  it: 'it', italy: 'it',
  pt: 'pt', portugal: 'pt',
  ru: 'ru', russia: 'ru',
  ua: 'uk', ukraine: 'uk',
  pl: 'pl', poland: 'pl',
  nl: 'nl', netherlands: 'nl',
  se: 'sv', sweden: 'sv',
  no: 'no', norway: 'no',
  dk: 'da', denmark: 'da',
  fi: 'fi', finland: 'fi',
  gr: 'el', greece: 'el',
  tr: 'tr', turkey: 'tr',
  ro: 'ro', romania: 'ro',
  cz: 'cs', czech: 'cs',
  hu: 'hu', hungary: 'hu',
  at: 'de', austria: 'de',
  ch: 'de', switzerland: 'de',
  be: 'fr', belgium: 'fr',
  ie: 'en', ireland: 'en',

  // Americas
  us: 'en', usa: 'en', 'united states': 'en', global: 'en',
  ca: 'en', canada: 'en',
  mx: 'es', mexico: 'es',
  br: 'pt', brazil: 'pt', 'brasil': 'pt',
  ar: 'es', argentina: 'es',
  co: 'es', colombia: 'es',
  cl: 'es', chile: 'es',
  pe: 'es', peru: 'es',
  latam: 'es',

  // Middle East & Africa
  sa: 'ar', 'saudi arabia': 'ar', uae: 'ar', egypt: 'ar', eg: 'ar',
  il: 'he', israel: 'he',
  za: 'en', 'south africa': 'en',
  ng: 'en', nigeria: 'en',
  ke: 'sw', kenya: 'sw',

  // Oceania
  au: 'en', australia: 'en',
  nz: 'en', 'new zealand': 'en',
};

// Cache resolved language infos to avoid redundant Intl lookups
const languageInfoCache = new Map<string, TargetLanguageInfo>();

/**
 * Safely format Intl display name with fallback
 */
function getIntlDisplayName(localeCode: string, targetDisplayLocale: string): string | null {
  try {
    const formatter = new Intl.DisplayNames([targetDisplayLocale], { type: 'language', fallback: 'none' });
    return formatter.of(localeCode) || null;
  } catch {
    return null;
  }
}

/**
 * Dynamically construct full TargetLanguageInfo for any language code
 */
export function createLanguageInfo(code: string, explicitName?: string, explicitNativeName?: string): TargetLanguageInfo {
  const normCode = code.toLowerCase().trim();
  const cacheKey = `${normCode}_${explicitName || ''}_${explicitNativeName || ''}`;
  if (languageInfoCache.has(cacheKey)) {
    return languageInfoCache.get(cacheKey)!;
  }

  // Extract base language code (e.g. 'vi-VN' -> 'vi', 'zh-CN' -> 'zh')
  const baseCode = normCode.split(/[-_]/)[0];

  // Resolve English display name (e.g. "Vietnamese", "Japanese", "Spanish")
  let name = explicitName || getIntlDisplayName(normCode, 'en') || getIntlDisplayName(baseCode, 'en');
  if (!name) {
    name = normCode.toUpperCase();
  }

  // Resolve native display name (e.g. "Tiếng Việt", "日本語", "Español")
  let nativeName = explicitNativeName || getIntlDisplayName(normCode, normCode) || getIntlDisplayName(baseCode, baseCode);
  if (!nativeName || nativeName === name) {
    // Try base code in its own locale
    nativeName = getIntlDisplayName(baseCode, baseCode) || name;
  }

  const info: TargetLanguageInfo = {
    name,
    code: normCode,
    nativeName,
    promptInstruction: `All titles, synopsis, story core, hidden line, three-act structure, cliffhanger hooks, character identities, character traits, sceneCore, and conflictEscalation MUST be written natively in ${name} (${nativeName}).`,
    dialogueInstruction: `Character spoken dialogue, emotional subtext, action descriptions, and scene directions MUST BE IN ${name.toUpperCase()} (${nativeName}) so that neural TTS voiceover dubbing matches the target country without translation.`,
  };

  languageInfoCache.set(cacheKey, info);
  return info;
}

/**
 * Resolve any country name, country code, or BCP-47 language tag to TargetLanguageInfo.
 * Automatically supports 100% of countries and languages worldwide without hardcoded restrictions.
 */
export function getLanguageForCountry(countryOrLanguage?: string): TargetLanguageInfo {
  if (!countryOrLanguage) {
    return createLanguageInfo('en', 'English', 'English (US)');
  }

  const clean = countryOrLanguage.toLowerCase().trim().replace(/[-_]/g, ' ');
  const rawCode = countryOrLanguage.trim();

  // 1. Direct match in COUNTRY_TO_LANGUAGE_CODE map
  if (COUNTRY_TO_LANGUAGE_CODE[clean]) {
    const langCode = COUNTRY_TO_LANGUAGE_CODE[clean];
    return createLanguageInfo(langCode);
  }

  // 2. Tokenized partial match in country dictionary (e.g. "viet nam", "united states")
  const parts = clean.split(/\s+/);
  for (const part of parts) {
    if (COUNTRY_TO_LANGUAGE_CODE[part]) {
      return createLanguageInfo(COUNTRY_TO_LANGUAGE_CODE[part]);
    }
  }

  // 3. Check if rawCode is already a valid BCP-47 / ISO-639 language tag (e.g. 'vi', 'vi-VN', 'zh', 'zh-CN', 'ja', 'es', 'pt-BR')
  try {
    const locale = new Intl.Locale(rawCode);
    if (locale.language) {
      return createLanguageInfo(locale.baseName || locale.language);
    }
  } catch {
    // If not a valid standard locale tag, continue to fallback
  }

  // 4. Try matching partial country keys
  for (const [countryKey, langCode] of Object.entries(COUNTRY_TO_LANGUAGE_CODE)) {
    if (clean.includes(countryKey) || countryKey.includes(clean)) {
      return createLanguageInfo(langCode);
    }
  }

  // 5. Fallback: create dynamic language info directly from the input string
  return createLanguageInfo(rawCode, countryOrLanguage, countryOrLanguage);
}

/**
 * Heuristically detect natural language of a text string.
 * Returns ISO-639-1 language code or null if ambiguous/undetermined.
 */
export function detectTextLanguage(text: string): string | null {
  if (!text || typeof text !== 'string') return null;
  const clean = text.trim();
  if (clean.length < 2) return null;

  // 1. Check East Asian and unique character scripts
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(clean)) return 'ja'; // Japanese Hiragana/Katakana
  if (/[\uac00-\ud7af\u1100-\u11ff]/.test(clean)) return 'ko'; // Korean Hangul
  if (/[\u4e00-\u9fa5]/.test(clean)) return 'zh'; // Chinese Hanzi
  if (/[\u0e00-\u0e7f]/.test(clean)) return 'th'; // Thai
  if (/[\u0600-\u06ff]/.test(clean)) return 'ar'; // Arabic
  if (/[\u0400-\u04ff]/.test(clean)) return 'ru'; // Russian/Cyrillic

  // 2. Vietnamese diacritics & specific common words
  const viDiacritics = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđ]/i;
  const viKeywords = /\b(chào|hãy|tạo|kịch bản|tập|phim|nhân vật|câu chuyện|tiếng việt|bạn|tôi|của|cho|và|với|là|được|trong|này|nhé|nào|lên ý tưởng|ý tưởng|trả thù|hào môn|tổng tài)\b/i;
  if (viDiacritics.test(clean) || viKeywords.test(clean)) {
    return 'vi';
  }

  // 3. Spanish markers & common words
  const esMarkers = /[¿¡]|(\b(hola|por favor|crear|guion|historia|personaje|episodio|para|con|como|gracias|buenos días|buenas noches|venganza)\b)/i;
  if (esMarkers.test(clean)) {
    return 'es';
  }

  // 4. French markers & common words
  const frMarkers = /\b(bonjour|salut|créer|scénario|histoire|personnage|épisode|pour|avec|merci|s'il vous plaît)\b/i;
  if (frMarkers.test(clean)) {
    return 'fr';
  }

  // 5. German markers & common words
  const deMarkers = /\b(hallo|bitte|erstellen|drehbuch|geschichte|charakter|folge|für|mit|danke|guten tag)\b/i;
  if (deMarkers.test(clean)) {
    return 'de';
  }

  // 6. English words & standard Latin phrasing
  const enKeywords = /\b(the|is|and|to|in|for|with|let's|brainstorm|create|write|script|series|episode|character|story|plot|revenge|urban|drama|about|what|how|why|can|you|please|hello|hi|hey|help|generate|plan|design|review|audit)\b/i;
  if (enKeywords.test(clean)) {
    return 'en';
  }

  // 7. If text is predominantly Latin without diacritics, default to English if it contains multiple words
  if (/^[a-zA-Z0-9\s.,!?'"()\-–—:;@#$%&*+=\/\\<>]+$/.test(clean) && clean.split(/\s+/).length >= 2) {
    return 'en';
  }

  return null;
}

/**
 * Resolve Chatbot Language with strict 2-tier priority:
 * 1. Priority 1: Language of user's message in the chat box.
 * 2. Priority 2: User's app setting / profile language.
 */
export function resolveChatLanguage(userMessage: string, context?: any): {
  languageCode: string;
  languageName: string;
  nativeName: string;
  priority: 'user_message' | 'app_profile';
  instruction: string;
} {
  // Priority 1: User's chat message
  const detectedCode = detectTextLanguage(userMessage);
  let resolvedCode: string | undefined = detectedCode || undefined;
  let priority: 'user_message' | 'app_profile' = 'user_message';

  // Priority 2: Fallback to App UI / Profile Language
  if (!resolvedCode) {
    priority = 'app_profile';
    const appLang = context?.appLanguage || context?.profileLanguage || context?.language || 'en';
    resolvedCode = appLang.toLowerCase().split(/[-_]/)[0] || 'en';
  }

  const langInfo = getLanguageForCountry(resolvedCode || 'en');

  const instruction = `[CRITICAL LANGUAGE MANDATE - ABSOLUTE PRIORITY]:
The user's conversation language has been detected as: ${langInfo.name} (${langInfo.nativeName}, code: ${langInfo.code}) based on ${priority === 'user_message' ? 'the natural language of their message' : 'their application profile setting'}.
You MUST write 100% of your conversational response, explanations, brainstorm pitches, titles, character descriptions, dialogue samples, and status reports in ${langInfo.name} (${langInfo.nativeName}).
STRICT PROHIBITION: NEVER respond in any other language unless the user explicitly switches languages in subsequent messages.`;

  return {
    languageCode: langInfo.code,
    languageName: langInfo.name,
    nativeName: langInfo.nativeName,
    priority,
    instruction,
  };
}

