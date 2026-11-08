import { watch } from 'vue';
import { createI18n } from 'vue-i18n';
// English is bundled as the fallback; other languages are fetched on demand
// (each locale file is ~100 KB, so bundling all six cost ~0.6 MB per visit).
import en from './locales/en.json';

const localeLoaders: Record<string, () => Promise<{ default: Record<string, unknown> }>> = {
  vi: () => import('./locales/vi.json'),
  zh: () => import('./locales/zh.json'),
  jp: () => import('./locales/jp.json'),
  es: () => import('./locales/es.json'),
  fr: () => import('./locales/fr.json'),
};

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
  messages: { en } as Record<string, any>,
});

/** Loads a language's messages if they are not loaded yet (no-op for English or unknown codes). */
export async function loadLocaleMessages(code: string): Promise<void> {
  if (i18n.global.availableLocales.includes(code as any) || !localeLoaders[code]) return;
  try {
    const messages = await localeLoaders[code]();
    i18n.global.setLocaleMessage(code as any, messages.default as any);
  } catch (err) {
    console.warn(`[i18n] Could not load locale "${code}", falling back to English`, err);
  }
}

// Any code that switches i18n.global.locale gets its messages loaded automatically.
watch(
  () => (i18n.global.locale as any).value,
  (code) => void loadLocaleMessages(String(code))
);

export const initialLocale = savedLocale;
export default i18n;
