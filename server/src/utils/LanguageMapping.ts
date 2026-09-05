export interface TargetLanguageInfo {
  name: string;
  code: string;
  nativeName: string;
  promptInstruction: string;
  dialogueInstruction: string;
}

/**
 * Validates whether a string matches the standard BCP-47 language tag format
 * (e.g. 'en-US', 'vi-VN', 'ja-JP', 'en', 'vi', 'zh-CN', etc.)
 */
export function isValidBCP47(tag: string): boolean {
  if (!tag || typeof tag !== 'string') return false;
  const trimmed = tag.trim();
  if (!/^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/i.test(trimmed)) {
    return false;
  }
  try {
    const loc = new Intl.Locale(trimmed);
    return Boolean(loc.language);
  } catch {
    return false;
  }
}

/**
 * Asserts that a string is a valid BCP-47 language tag; throws an Error if invalid.
 */
export function assertValidBCP47(tag: string): void {
  if (!isValidBCP47(tag)) {
    throw new Error(`Invalid language code "${tag}". Language code must follow the BCP-47 standard (e.g. "en-US", "vi-VN", "ja-JP").`);
  }
}

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
 * Dynamically construct full TargetLanguageInfo for any valid BCP-47 language code
 */
export function getLanguageInfo(code: string, explicitName?: string, explicitNativeName?: string): TargetLanguageInfo {
  assertValidBCP47(code);
  const normCode = code.trim();
  const cacheKey = `${normCode.toLowerCase()}_${explicitName || ''}_${explicitNativeName || ''}`;
  if (languageInfoCache.has(cacheKey)) {
    return languageInfoCache.get(cacheKey)!;
  }

  // Extract base language code (e.g. 'vi-VN' -> 'vi', 'zh-CN' -> 'zh')
  const baseCode = normCode.split(/[-_]/)[0];

  // Resolve English display name (e.g. "Vietnamese", "Japanese", "Spanish")
  let name = explicitName || getIntlDisplayName(normCode, 'en') || getIntlDisplayName(baseCode, 'en');
  if (!name) {
    name = normCode;
  }

  // Resolve native display name (e.g. "Tiếng Việt", "日本語", "Español")
  let nativeName = explicitNativeName || getIntlDisplayName(normCode, normCode) || getIntlDisplayName(baseCode, baseCode);
  if (!nativeName || nativeName === name) {
    nativeName = getIntlDisplayName(baseCode, baseCode) || name;
  }

  const info: TargetLanguageInfo = {
    name,
    code: normCode,
    nativeName,
    promptInstruction: `All titles, synopsis, story core, hidden line, three-act structure, cliffhanger hooks, character identities, character traits, sceneCore, and conflictEscalation MUST be written natively in ${name} (${nativeName}).`,
    dialogueInstruction: `Character spoken dialogue, emotional subtext, action descriptions, and scene directions MUST BE IN ${name.toUpperCase()} (${nativeName}) so that neural TTS voiceover dubbing matches the target language without translation.`,
  };

  languageInfoCache.set(cacheKey, info);
  return info;
}

// Alias for backwards compatibility
export const createLanguageInfo = getLanguageInfo;

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

  // 2. Automated wizard system prompt check - always treat standard English generation prompt as English
  if (/^Please generate a complete micro-drama master plan/i.test(clean) ||
      /\bInitiating Series Master Plan Generation\b/i.test(clean)) {
    return 'en';
  }

  // 3. Multi-signal scoring for Latin-based languages
  let viScore = 0;
  let enScore = 0;
  let esScore = 0;
  let frScore = 0;
  let deScore = 0;

  // Vietnamese UNIQUE characters (horn, circumflex, hook, tilde, dot-below, đ):
  // NOTE: Simple accented vowels like é, è, á, à, ó, ò, ú, ù, í, ì alone are NOT unique to Vietnamese;
  // they exist in French, Spanish, Italian, and common English loanwords (e.g. fiancé, café, résumé).
  // Only count characters with distinctive Vietnamese markers!
  const viUniqueLetters = /[ăâđêôơưảãạẳẵặẩẫậẻẽẹểễệỉĩịỏõọởỡợổỗộủũụửữựỳỷỹỵđĂÂĐÊÔƠƯẢÃẠẲẴẶẨẪẬẺẼẸỂỄỆỈĨỊỎÕỌỞỠỢỔỖỘỦŨỤỬỮỰỲỶỸỴĐ]/g;
  const viUniqueMatches = clean.match(viUniqueLetters);
  if (viUniqueMatches) {
    viScore += viUniqueMatches.length * 3;
  }

  // Vietnamese distinctive vocabulary & grammar keywords
  const viKeywords = clean.match(/\b(chào|hãy|tạo|kịch bản|tập|phim|nhân vật|câu chuyện|tiếng việt|bạn|tôi|của|cho|và|với|là|được|trong|này|nhé|nào|ý tưởng|trả thù|hào môn|tổng tài|kiểm tra|xem|sửa|đổi|bối cảnh|đạo cụ|xem lại|đánh giá|phân tích|xác nhận)\b/gi);
  if (viKeywords) {
    viScore += viKeywords.length * 5;
  }

  // English distinctive vocabulary & grammar keywords
  const enKeywords = clean.match(/\b(the|is|are|was|were|and|to|in|for|with|of|at|by|from|as|on|it|this|that|please|generate|complete|micro|drama|master|plan|title|genre|target|country|language|episodes|format|synopsis|review|character|characters|location|locations|prop|props|scene|scenes|script|check|audit|create|series|confirm|start|what|how|why|can|you|about|after|before|her|his|their|my|me|so|all|any|new|betrayed|bankrupted|revenge|rich|story|narrative|suggest|outline|dialogue)\b/gi);
  if (enKeywords) {
    enScore += enKeywords.length * 2;
  }

  // Spanish markers & words
  const esWords = clean.match(/\b(hola|por favor|crear|guion|historia|personaje|episodio|para|con|como|gracias|buenos|venganza)\b/gi);
  if (/[¿¡]/.test(clean) || esWords) {
    esScore += (esWords ? esWords.length * 3 : 0) + (/[¿¡]/.test(clean) ? 5 : 0);
  }

  // French markers & words
  const frWords = clean.match(/\b(bonjour|salut|créer|scénario|histoire|personnage|épisode|pour|avec|merci|plaît)\b/gi);
  if (frWords) {
    frScore += frWords.length * 3;
  }

  // German markers & words
  const deWords = clean.match(/\b(hallo|bitte|erstellen|drehbuch|geschichte|charakter|folge|für|mit|danke)\b/gi);
  if (deWords) {
    deScore += deWords.length * 3;
  }

  const maxScore = Math.max(viScore, enScore, esScore, frScore, deScore);
  if (maxScore >= 2) {
    if (enScore === maxScore) return 'en';
    if (viScore === maxScore) return 'vi';
    if (esScore === maxScore) return 'es';
    if (frScore === maxScore) return 'fr';
    if (deScore === maxScore) return 'de';
  }

  // 4. Default: If text contains predominantly Latin characters with multiple words, default to English
  if (/^[a-zA-Z0-9\s.,!?'"()\-–—:;@#$%&*+=\/\\<>éèáàóòúùíìçñ]+$/.test(clean) && clean.split(/\s+/).length >= 2) {
    return 'en';
  }

  return null;
}

/**
 * Resolve Chatbot Language with strict 3-tier priority:
 * 1. Priority 1: Language of user's message in the chat box (scored accurately).
 * 2. Priority 2: Project Script Language / Target Country from context.
 * 3. Priority 3: User's app setting / profile language.
 */
export function resolveChatLanguage(userMessage: string, context?: any): {
  languageCode: string;
  languageName: string;
  nativeName: string;
  priority: 'user_message' | 'context_language' | 'app_profile';
  instruction: string;
} {
  // Priority 1: User's chat message
  const detectedCode = detectTextLanguage(userMessage);

  // Priority 2: Context Language (e.g. 'en-US', 'vi-VN')
  const contextLang = context?.language || context?.scriptLanguage;
  let contextLangCode: string | undefined = undefined;
  if (contextLang && typeof contextLang === 'string' && isValidBCP47(contextLang)) {
    contextLangCode = contextLang.trim();
  }

  let resolvedCode: string;
  let priority: 'user_message' | 'context_language' | 'app_profile';

  if (detectedCode && isValidBCP47(detectedCode)) {
    resolvedCode = detectedCode;
    priority = 'user_message';
  } else if (contextLangCode) {
    resolvedCode = contextLangCode;
    priority = 'context_language';
  } else {
    const appLang = context?.appLanguage || context?.profileLanguage;
    if (appLang && typeof appLang === 'string' && isValidBCP47(appLang)) {
      resolvedCode = appLang.trim();
      priority = 'app_profile';
    } else {
      resolvedCode = 'en-US';
      priority = 'app_profile';
    }
  }

  const langInfo = getLanguageInfo(resolvedCode);

  const prohibitionNote = langInfo.code === 'en'
    ? 'STRICT PROHIBITION: NEVER respond in Vietnamese or any language other than English. All conversational output, summaries, critiques, and thoughts MUST be 100% in English.'
    : `STRICT PROHIBITION: NEVER respond in any language other than ${langInfo.name} unless the user explicitly switches languages.`;

  const instruction = `[CRITICAL LANGUAGE MANDATE - ABSOLUTE PRIORITY]:
The conversation language has been resolved as: ${langInfo.name} (${langInfo.nativeName}, code: ${langInfo.code}) based on ${
    priority === 'user_message'
      ? 'the natural language of the user message'
      : priority === 'context_language'
      ? 'the project script language / target country setting'
      : 'the application profile setting'
  }.
You MUST write 100% of your conversational response, explanations, brainstorm pitches, titles, character descriptions, dialogue samples, and status reports in ${langInfo.name} (${langInfo.nativeName}).
${prohibitionNote}`;

  return {
    languageCode: langInfo.code,
    languageName: langInfo.name,
    nativeName: langInfo.nativeName,
    priority,
    instruction,
  };
}

