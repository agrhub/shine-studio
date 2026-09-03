import { createI18n } from 'vue-i18n';
import en from './locales/en.json';
import vi from './locales/vi.json';
import zh from './locales/zh.json';
import jp from './locales/jp.json';
import es from './locales/es.json';
import fr from './locales/fr.json';

export const SUPPORTED_LOCALES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'vi', label: 'Tiếng Việt', flag: '🇻🇳' },
  { code: 'zh', label: '中文', flag: '🇨🇳' },
  { code: 'jp', label: '日本語', flag: '🇯🇵' },
  { code: 'es', label: 'Español', flag: '🇪🇸' },
  { code: 'fr', label: 'Français', flag: '🇫🇷' },
] as const;

export type SupportedLocale = typeof SUPPORTED_LOCALES[number]['code'];

const savedLocale = (localStorage.getItem('shine_language') as SupportedLocale) || 'en';

const i18n = createI18n({
  legacy: false,
  locale: savedLocale,
  fallbackLocale: 'en',
  messages: {
    en,
    vi,
    zh,
    jp,
    es,
    fr,
  },
});

export default i18n;
