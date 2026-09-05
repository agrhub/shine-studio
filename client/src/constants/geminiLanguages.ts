import { findCountry } from './countries';

export interface GeminiSpeechLanguage {
  code: string; // e.g. "en-US"
  language: string; // e.g. "English"
  nativeName: string; // e.g. "English (US)"
  region: string; // e.g. "United States"
  countryCode: string; // ISO 3166-1 alpha-2, e.g. "us"
  flag: string; // Emoji flag, e.g. "🇺🇸"
}

export const GEMINI_SPEECH_LANGUAGES: GeminiSpeechLanguage[] = [
  { code: 'vi-VN', language: 'Vietnamese', nativeName: 'Tiếng Việt', region: 'Vietnam', countryCode: 'vn', flag: '🇻🇳' },
  { code: 'en-US', language: 'English', nativeName: 'English (US)', region: 'United States', countryCode: 'us', flag: '🇺🇸' },
  { code: 'en-GB', language: 'English', nativeName: 'English (UK)', region: 'United Kingdom', countryCode: 'gb', flag: '🇬🇧' },
  { code: 'en-AU', language: 'English', nativeName: 'English (Australia)', region: 'Australia', countryCode: 'au', flag: '🇦🇺' },
  { code: 'en-IN', language: 'English', nativeName: 'English (India)', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'zh-CN', language: 'Chinese', nativeName: '中文 (简体)', region: 'China', countryCode: 'cn', flag: '🇨🇳' },
  { code: 'zh-TW', language: 'Chinese', nativeName: '中文 (繁體)', region: 'Taiwan', countryCode: 'tw', flag: '🇹🇼' },
  { code: 'yue-HK', language: 'Cantonese', nativeName: '粵語 (香港)', region: 'Hong Kong', countryCode: 'hk', flag: '🇭🇰' },
  { code: 'ja-JP', language: 'Japanese', nativeName: '日本語', region: 'Japan', countryCode: 'jp', flag: '🇯🇵' },
  { code: 'ko-KR', language: 'Korean', nativeName: '한국어', region: 'South Korea', countryCode: 'kr', flag: '🇰🇷' },
  { code: 'th-TH', language: 'Thai', nativeName: 'ไทย', region: 'Thailand', countryCode: 'th', flag: '🇹🇭' },
  { code: 'id-ID', language: 'Indonesian', nativeName: 'Bahasa Indonesia', region: 'Indonesia', countryCode: 'id', flag: '🇮🇩' },
  { code: 'fil-PH', language: 'Filipino', nativeName: 'Filipino', region: 'Philippines', countryCode: 'ph', flag: '🇵🇭' },
  { code: 'es-ES', language: 'Spanish', nativeName: 'Español (España)', region: 'Spain', countryCode: 'es', flag: '🇪🇸' },
  { code: 'es-MX', language: 'Spanish', nativeName: 'Español (México)', region: 'Mexico', countryCode: 'mx', flag: '🇲🇽' },
  { code: 'es-US', language: 'Spanish', nativeName: 'Español (US)', region: 'United States', countryCode: 'us', flag: '🇺🇸' },
  { code: 'fr-FR', language: 'French', nativeName: 'Français (France)', region: 'France', countryCode: 'fr', flag: '🇫🇷' },
  { code: 'fr-CA', language: 'French', nativeName: 'Français (Canada)', region: 'Canada', countryCode: 'ca', flag: '🇨🇦' },
  { code: 'de-DE', language: 'German', nativeName: 'Deutsch', region: 'Germany', countryCode: 'de', flag: '🇩🇪' },
  { code: 'it-IT', language: 'Italian', nativeName: 'Italiano', region: 'Italy', countryCode: 'it', flag: '🇮🇹' },
  { code: 'pt-BR', language: 'Portuguese', nativeName: 'Português (Brasil)', region: 'Brazil', countryCode: 'br', flag: '🇧🇷' },
  { code: 'pt-PT', language: 'Portuguese', nativeName: 'Português (Portugal)', region: 'Portugal', countryCode: 'pt', flag: '🇵🇹' },
  { code: 'ru-RU', language: 'Russian', nativeName: 'Русский', region: 'Russia', countryCode: 'ru', flag: '🇷🇺' },
  { code: 'uk-UA', language: 'Ukrainian', nativeName: 'Українська', region: 'Ukraine', countryCode: 'ua', flag: '🇺🇦' },
  { code: 'ar-SA', language: 'Arabic', nativeName: 'العربية', region: 'Saudi Arabia', countryCode: 'sa', flag: '🇸🇦' },
  { code: 'hi-IN', language: 'Hindi', nativeName: 'हिन्दी', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'bn-IN', language: 'Bengali', nativeName: 'বাংলা', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'ta-IN', language: 'Tamil', nativeName: 'தமிழ்', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'te-IN', language: 'Telugu', nativeName: 'తెలుగు', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'mr-IN', language: 'Marathi', nativeName: 'मराठी', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'gu-IN', language: 'Gujarati', nativeName: 'ગુજરાતી', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'kn-IN', language: 'Kannada', nativeName: 'ಕನ್ನಡ', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'ml-IN', language: 'Malayalam', nativeName: 'മലയാളം', region: 'India', countryCode: 'in', flag: '🇮🇳' },
  { code: 'ur-PK', language: 'Urdu', nativeName: 'اردو', region: 'Pakistan', countryCode: 'pk', flag: '🇵🇰' },
  { code: 'tr-TR', language: 'Turkish', nativeName: 'Türkçe', region: 'Turkey', countryCode: 'tr', flag: '🇹🇷' },
  { code: 'pl-PL', language: 'Polish', nativeName: 'Polski', region: 'Poland', countryCode: 'pl', flag: '🇵🇱' },
  { code: 'nl-NL', language: 'Dutch', nativeName: 'Nederlands', region: 'Netherlands', countryCode: 'nl', flag: '🇳🇱' },
  { code: 'sv-SE', language: 'Swedish', nativeName: 'Svenska', region: 'Sweden', countryCode: 'se', flag: '🇸🇪' },
  { code: 'no-NO', language: 'Norwegian', nativeName: 'Norsk', region: 'Norway', countryCode: 'no', flag: '🇳🇴' },
  { code: 'da-DK', language: 'Danish', nativeName: 'Dansk', region: 'Denmark', countryCode: 'dk', flag: '🇩🇰' },
  { code: 'fi-FI', language: 'Finnish', nativeName: 'Suomi', region: 'Finland', countryCode: 'fi', flag: '🇫🇮' },
  { code: 'cs-CZ', language: 'Czech', nativeName: 'Čeština', region: 'Czech Republic', countryCode: 'cz', flag: '🇨🇿' },
  { code: 'hu-HU', language: 'Hungarian', nativeName: 'Magyar', region: 'Hungary', countryCode: 'hu', flag: '🇭🇺' },
  { code: 'ro-RO', language: 'Romanian', nativeName: 'Română', region: 'Romania', countryCode: 'ro', flag: '🇷🇴' },
  { code: 'sk-SK', language: 'Slovak', nativeName: 'Slovenčina', region: 'Slovakia', countryCode: 'sk', flag: '🇸🇰' },
  { code: 'el-GR', language: 'Greek', nativeName: 'Ελληνικά', region: 'Greece', countryCode: 'gr', flag: '🇬🇷' },
  { code: 'he-IL', language: 'Hebrew', nativeName: 'עברית', region: 'Israel', countryCode: 'il', flag: '🇮🇱' },
];

export function getLanguageByCode(code: string): GeminiSpeechLanguage {
  const found = GEMINI_SPEECH_LANGUAGES.find(l => l.code.toLowerCase() === (code || '').toLowerCase());
  return found || GEMINI_SPEECH_LANGUAGES.find(l => l.code === 'en-US')!;
}

export function getVoiceoverTrackId(langCode: string): string {
  const safeLang = (langCode || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `track_voiceover_${safeLang}`;
}

export function getCaptionTrackId(langCode: string): string {
  const safeLang = (langCode || 'default').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `track_caption_${safeLang}`;
}

export function parseRenderVersionKey(key: string): {
  voiceLang: string;
  capLang: string;
  label: string;
  voiceObj: GeminiSpeechLanguage;
  capObj: GeminiSpeechLanguage;
} {
  if (!key) {
    const defaultLang = GEMINI_SPEECH_LANGUAGES[0];
    return {
      voiceLang: defaultLang.code,
      capLang: defaultLang.code,
      label: defaultLang.nativeName,
      voiceObj: defaultLang,
      capObj: defaultLang,
    };
  }

  // Handle dub_XX_cap_YY format (e.g. dub_vi-VN_cap_en-US or dub_vi_VN_cap_en_US)
  const match = key.match(/^dub_([a-zA-Z0-9_-]+)_cap_([a-zA-Z0-9_-]+)$/);
  if (match) {
    const rawVoice = match[1].replace(/_/g, '-');
    const rawCap = match[2].replace(/_/g, '-');
    const voiceObj = getLanguageByCode(rawVoice);
    const capObj = getLanguageByCode(rawCap);
    return {
      voiceLang: rawVoice,
      capLang: rawCap,
      label: `${voiceObj.nativeName} (${capObj.nativeName} Sub)`,
      voiceObj,
      capObj,
    };
  }

  // Simple lang code like 'vi-VN' or 'en-US'
  const langObj = getLanguageByCode(key.replace(/_/g, '-'));
  return {
    voiceLang: langObj.code,
    capLang: langObj.code,
    label: langObj.nativeName,
    voiceObj: langObj,
    capObj: langObj,
  };
}

export const GEMINI_LANGUAGE_DEFAULTS: Record<string, { label: string; voiceId?: string }> = Object.fromEntries(
  GEMINI_SPEECH_LANGUAGES.map((l) => [
    l.code,
    {
      label: l.nativeName,
    },
  ])
);


