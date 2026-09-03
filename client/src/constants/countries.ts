export interface WorldCountry {
  code: string; // ISO 3166-1 alpha-2 lower-case (e.g. "vn", "us", "jp")
  name: string; // English Country Name (e.g. "Vietnam", "United States")
  nativeName: string; // Localized native name (e.g. "Việt Nam", "日本")
  flag: string; // Emoji flag (e.g. "🇻🇳")
  continent: 'Asia' | 'Europe' | 'North America' | 'South America' | 'Africa' | 'Oceania' | 'Middle East';
  primaryLang: string; // Gemini Speech Language Code (e.g. "vi-VN", "en-US", "ja-JP")
  isPopular?: boolean; // Highlighted in quick selection chips
}

export const TOP_COUNTRIES: WorldCountry[] = [
  // ─── Top Drama & Creator Markets (Popular) ──────────────────────────────────
  { code: 'vn', name: 'Vietnam', nativeName: 'Việt Nam', flag: '🇻🇳', continent: 'Asia', primaryLang: 'vi-VN', isPopular: true },
  { code: 'us', name: 'United States', nativeName: 'United States', flag: '🇺🇸', continent: 'North America', primaryLang: 'en-US', isPopular: true },
  { code: 'cn', name: 'China', nativeName: '中国', flag: '🇨🇳', continent: 'Asia', primaryLang: 'zh-CN', isPopular: true },
  { code: 'jp', name: 'Japan', nativeName: '日本', flag: '🇯🇵', continent: 'Asia', primaryLang: 'ja-JP', isPopular: true },
  { code: 'kr', name: 'South Korea', nativeName: '대한민국', flag: '🇰🇷', continent: 'Asia', primaryLang: 'ko-KR', isPopular: true },
  { code: 'th', name: 'Thailand', nativeName: 'ไทย', flag: '🇹🇭', continent: 'Asia', primaryLang: 'th-TH', isPopular: true },
  { code: 'id', name: 'Indonesia', nativeName: 'Indonesia', flag: '🇮🇩', continent: 'Asia', primaryLang: 'id-ID', isPopular: true },
  { code: 'ph', name: 'Philippines', nativeName: 'Pilipinas', flag: '🇵🇭', continent: 'Asia', primaryLang: 'fil-PH', isPopular: true },
  { code: 'gb', name: 'United Kingdom', nativeName: 'United Kingdom', flag: '🇬🇧', continent: 'Europe', primaryLang: 'en-GB', isPopular: true },
  { code: 'fr', name: 'France', nativeName: 'France', flag: '🇫🇷', continent: 'Europe', primaryLang: 'fr-FR', isPopular: true },
  { code: 'de', name: 'Germany', nativeName: 'Deutschland', flag: '🇩🇪', continent: 'Europe', primaryLang: 'de-DE', isPopular: true },
  { code: 'br', name: 'Brazil', nativeName: 'Brasil', flag: '🇧🇷', continent: 'South America', primaryLang: 'pt-BR', isPopular: true },
  { code: 'mx', name: 'Mexico', nativeName: 'México', flag: '🇲🇽', continent: 'North America', primaryLang: 'es-MX', isPopular: true },
  { code: 'in', name: 'India', nativeName: 'भारत', flag: '🇮🇳', continent: 'Asia', primaryLang: 'hi-IN', isPopular: true },
  { code: 'es', name: 'Spain', nativeName: 'España', flag: '🇪🇸', continent: 'Europe', primaryLang: 'es-ES', isPopular: true },
];

export const WORLD_COUNTRIES: WorldCountry[] = [
  ...TOP_COUNTRIES,

  // ─── Asia & Pacific ─────────────────────────────────────────────────────────
  { code: 'tw', name: 'Taiwan', nativeName: '台灣', flag: '🇹🇼', continent: 'Asia', primaryLang: 'zh-TW', isPopular: true },
  { code: 'hk', name: 'Hong Kong', nativeName: '香港', flag: '🇭🇰', continent: 'Asia', primaryLang: 'yue-HK', isPopular: true },
  { code: 'sg', name: 'Singapore', nativeName: 'Singapore', flag: '🇸🇬', continent: 'Asia', primaryLang: 'en-US', isPopular: true },
  { code: 'my', name: 'Malaysia', nativeName: 'Malaysia', flag: '🇲🇾', continent: 'Asia', primaryLang: 'en-US', isPopular: true },
  { code: 'au', name: 'Australia', nativeName: 'Australia', flag: '🇦🇺', continent: 'Oceania', primaryLang: 'en-AU' },
  { code: 'nz', name: 'New Zealand', nativeName: 'New Zealand', flag: '🇳🇿', continent: 'Oceania', primaryLang: 'en-GB' },
  { code: 'pk', name: 'Pakistan', nativeName: 'پاکستان', flag: '🇵🇰', continent: 'Asia', primaryLang: 'ur-PK' },
  { code: 'bd', name: 'Bangladesh', nativeName: 'বাংলাদেশ', flag: '🇧🇩', continent: 'Asia', primaryLang: 'bn-IN' },
  { code: 'lk', name: 'Sri Lanka', nativeName: 'ශ්‍රී ලංකාව', flag: '🇱🇰', continent: 'Asia', primaryLang: 'ta-IN' },
  { code: 'kh', name: 'Cambodia', nativeName: 'កម្ពុជា', flag: '🇰🇭', continent: 'Asia', primaryLang: 'en-US' },
  { code: 'la', name: 'Laos', nativeName: 'ລາວ', flag: '🇱🇦', continent: 'Asia', primaryLang: 'th-TH' },
  { code: 'mm', name: 'Myanmar', nativeName: 'မြန်မာ', flag: '🇲🇲', continent: 'Asia', primaryLang: 'en-US' },
  { code: 'np', name: 'Nepal', nativeName: 'नेपाल', flag: '🇳🇵', continent: 'Asia', primaryLang: 'hi-IN' },
  { code: 'mn', name: 'Mongolia', nativeName: 'Монгол', flag: '🇲🇳', continent: 'Asia', primaryLang: 'en-US' },
  { code: 'kz', name: 'Kazakhstan', nativeName: 'Қазақстан', flag: '🇰🇿', continent: 'Asia', primaryLang: 'ru-RU' },
  { code: 'uz', name: 'Uzbekistan', nativeName: 'Oʻzbekiston', flag: '🇺🇿', continent: 'Asia', primaryLang: 'ru-RU' },

  // ─── Europe ─────────────────────────────────────────────────────────────────
  { code: 'it', name: 'Italy', nativeName: 'Italia', flag: '🇮🇹', continent: 'Europe', primaryLang: 'it-IT' },
  { code: 'nl', name: 'Netherlands', nativeName: 'Nederland', flag: '🇳🇱', continent: 'Europe', primaryLang: 'nl-NL' },
  { code: 'be', name: 'Belgium', nativeName: 'België', flag: '🇧🇪', continent: 'Europe', primaryLang: 'fr-FR' },
  { code: 'ch', name: 'Switzerland', nativeName: 'Schweiz', flag: '🇨🇭', continent: 'Europe', primaryLang: 'de-DE' },
  { code: 'at', name: 'Austria', nativeName: 'Österreich', flag: '🇦🇹', continent: 'Europe', primaryLang: 'de-DE' },
  { code: 'pt', name: 'Portugal', nativeName: 'Portugal', flag: '🇵🇹', continent: 'Europe', primaryLang: 'pt-PT' },
  { code: 'se', name: 'Sweden', nativeName: 'Sverige', flag: '🇸🇪', continent: 'Europe', primaryLang: 'sv-SE' },
  { code: 'no', name: 'Norway', nativeName: 'Norge', flag: '🇳🇴', continent: 'Europe', primaryLang: 'no-NO' },
  { code: 'dk', name: 'Denmark', nativeName: 'Danmark', flag: '🇩🇰', continent: 'Europe', primaryLang: 'da-DK' },
  { code: 'fi', name: 'Finland', nativeName: 'Suomi', flag: '🇫🇮', continent: 'Europe', primaryLang: 'fi-FI' },
  { code: 'ie', name: 'Ireland', nativeName: 'Éire', flag: '🇮🇪', continent: 'Europe', primaryLang: 'en-GB' },
  { code: 'pl', name: 'Poland', nativeName: 'Polska', flag: '🇵🇱', continent: 'Europe', primaryLang: 'pl-PL' },
  { code: 'cz', name: 'Czech Republic', nativeName: 'Česko', flag: '🇨🇿', continent: 'Europe', primaryLang: 'cs-CZ' },
  { code: 'hu', name: 'Hungary', nativeName: 'Magyarország', flag: '🇭🇺', continent: 'Europe', primaryLang: 'hu-HU' },
  { code: 'ro', name: 'Romania', nativeName: 'România', flag: '🇷🇴', continent: 'Europe', primaryLang: 'ro-RO' },
  { code: 'gr', name: 'Greece', nativeName: 'Ελλάδα', flag: '🇬🇷', continent: 'Europe', primaryLang: 'el-GR' },
  { code: 'tr', name: 'Turkey', nativeName: 'Türkiye', flag: '🇹🇷', continent: 'Europe', primaryLang: 'tr-TR' },
  { code: 'ua', name: 'Ukraine', nativeName: 'Україна', flag: '🇺🇦', continent: 'Europe', primaryLang: 'uk-UA' },
  { code: 'ru', name: 'Russia', nativeName: 'Россия', flag: '🇷🇺', continent: 'Europe', primaryLang: 'ru-RU' },
  { code: 'sk', name: 'Slovakia', nativeName: 'Slovensko', flag: '🇸🇰', continent: 'Europe', primaryLang: 'sk-SK' },
  { code: 'bg', name: 'Bulgaria', nativeName: 'България', flag: '🇧🇬', continent: 'Europe', primaryLang: 'ru-RU' },
  { code: 'hr', name: 'Croatia', nativeName: 'Hrvatska', flag: '🇭🇷', continent: 'Europe', primaryLang: 'en-US' },
  { code: 'rs', name: 'Serbia', nativeName: 'Srbija', flag: '🇷🇸', continent: 'Europe', primaryLang: 'en-US' },

  // ─── Americas ───────────────────────────────────────────────────────────────
  { code: 'ca', name: 'Canada', nativeName: 'Canada', flag: '🇨🇦', continent: 'North America', primaryLang: 'en-US' },
  { code: 'ar', name: 'Argentina', nativeName: 'Argentina', flag: '🇦🇷', continent: 'South America', primaryLang: 'es-ES' },
  { code: 'cl', name: 'Chile', nativeName: 'Chile', flag: '🇨🇱', continent: 'South America', primaryLang: 'es-ES' },
  { code: 'co', name: 'Colombia', nativeName: 'Colombia', flag: '🇨🇴', continent: 'South America', primaryLang: 'es-ES' },
  { code: 'pe', name: 'Peru', nativeName: 'Perú', flag: '🇵🇪', continent: 'South America', primaryLang: 'es-ES' },
  { code: 've', name: 'Venezuela', nativeName: 'Venezuela', flag: '🇻🇪', continent: 'South America', primaryLang: 'es-ES' },
  { code: 'ec', name: 'Ecuador', nativeName: 'Ecuador', flag: '🇪🇨', continent: 'South America', primaryLang: 'es-ES' },
  { code: 'gt', name: 'Guatemala', nativeName: 'Guatemala', flag: '🇬🇹', continent: 'North America', primaryLang: 'es-MX' },
  { code: 'cr', name: 'Costa Rica', nativeName: 'Costa Rica', flag: '🇨🇷', continent: 'North America', primaryLang: 'es-MX' },
  { code: 'pa', name: 'Panama', nativeName: 'Panamá', flag: '🇵🇦', continent: 'North America', primaryLang: 'es-MX' },
  { code: 'do', name: 'Dominican Republic', nativeName: 'República Dominicana', flag: '🇩🇴', continent: 'North America', primaryLang: 'es-MX' },
  { code: 'pr', name: 'Puerto Rico', nativeName: 'Puerto Rico', flag: '🇵🇷', continent: 'North America', primaryLang: 'es-US' },

  // ─── Middle East & Africa ───────────────────────────────────────────────────
  { code: 'sa', name: 'Saudi Arabia', nativeName: 'المملكة العربية السعودية', flag: '🇸🇦', continent: 'Middle East', primaryLang: 'ar-SA' },
  { code: 'ae', name: 'United Arab Emirates', nativeName: 'الإمارات العربية المتحدة', flag: '🇦🇪', continent: 'Middle East', primaryLang: 'ar-SA' },
  { code: 'qa', name: 'Qatar', nativeName: 'قطر', flag: '🇶🇦', continent: 'Middle East', primaryLang: 'ar-SA' },
  { code: 'kw', name: 'Kuwait', nativeName: 'الكويت', flag: '🇰🇼', continent: 'Middle East', primaryLang: 'ar-SA' },
  { code: 'il', name: 'Israel', nativeName: 'ישראל', flag: '🇮🇱', continent: 'Middle East', primaryLang: 'he-IL' },
  { code: 'eg', name: 'Egypt', nativeName: 'مصر', flag: '🇪🇬', continent: 'Africa', primaryLang: 'ar-SA' },
  { code: 'za', name: 'South Africa', nativeName: 'South Africa', flag: '🇿🇦', continent: 'Africa', primaryLang: 'en-GB' },
  { code: 'ng', name: 'Nigeria', nativeName: 'Nigeria', flag: '🇳🇬', continent: 'Africa', primaryLang: 'en-GB' },
  { code: 'ke', name: 'Kenya', nativeName: 'Kenya', flag: '🇰🇪', continent: 'Africa', primaryLang: 'en-GB' },
  { code: 'ma', name: 'Morocco', nativeName: 'المغرب', flag: '🇲🇦', continent: 'Africa', primaryLang: 'ar-SA' },
  { code: 'dz', name: 'Algeria', nativeName: 'الجزائر', flag: '🇩🇿', continent: 'Africa', primaryLang: 'ar-SA' },
  { code: 'tn', name: 'Tunisia', nativeName: 'تونس', flag: '🇹🇳', continent: 'Africa', primaryLang: 'ar-SA' },
  { code: 'gh', name: 'Ghana', nativeName: 'Ghana', flag: '🇬🇭', continent: 'Africa', primaryLang: 'en-GB' },
];

export function findCountry(query?: string): WorldCountry {
  if (!query) return WORLD_COUNTRIES[0]; // Vietnam default or first
  const clean = query.toLowerCase().trim();

  // Try exact match on code or name
  const match = WORLD_COUNTRIES.find(
    (c) =>
      c.code === clean ||
      c.name.toLowerCase() === clean ||
      c.nativeName.toLowerCase() === clean ||
      c.primaryLang.toLowerCase() === clean
  );
  if (match) return match;

  // Partial match
  const partial = WORLD_COUNTRIES.find(
    (c) => c.name.toLowerCase().includes(clean) || clean.includes(c.name.toLowerCase())
  );
  return partial || WORLD_COUNTRIES[0];
}

export function getDefaultCountryForLocale(localeStr?: string): WorldCountry {
  if (!localeStr) return findCountry('United States');
  const clean = localeStr.toLowerCase().trim();
  if (clean.startsWith('vi')) return findCountry('Vietnam');
  if (clean.startsWith('zh')) return findCountry('China');
  if (clean.startsWith('ja') || clean.startsWith('jp')) return findCountry('Japan');
  if (clean.startsWith('es')) return findCountry('Spain');
  if (clean.startsWith('fr')) return findCountry('France');
  return findCountry('United States');
}

