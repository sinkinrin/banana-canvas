import i18n from 'i18next';
import { initReactI18next, useTranslation } from 'react-i18next';

import { en } from './locales/en';
import { zhCN } from './locales/zh-CN';

export const SUPPORTED_LANGUAGES = ['en', 'zh-CN'] as const;
export type AppLanguage = (typeof SUPPORTED_LANGUAGES)[number];

export const LANGUAGE_STORAGE_KEY = 'banana-canvas-language';

export function normalizeLanguage(value: string | null | undefined): AppLanguage | null {
  if (!value) return null;
  const normalized = value.toLowerCase();
  if (normalized.startsWith('zh')) return 'zh-CN';
  if (normalized.startsWith('en')) return 'en';
  return null;
}

export function detectLanguage({
  requestedLanguage,
  storedLanguage,
  browserLanguages,
}: {
  requestedLanguage?: string | null;
  storedLanguage?: string | null;
  browserLanguages?: readonly string[];
} = {}): AppLanguage {
  const requested = requestedLanguage ?? (() => {
    try {
      return typeof window === 'undefined'
        ? null
        : new URLSearchParams(window.location.search).get('lng');
    } catch {
      return null;
    }
  })();
  const requestedLocale = normalizeLanguage(requested);
  if (requestedLocale) return requestedLocale;

  const stored = storedLanguage ?? (() => {
    try {
      return typeof window === 'undefined' ? null : window.localStorage.getItem(LANGUAGE_STORAGE_KEY);
    } catch {
      return null;
    }
  })();
  const persisted = normalizeLanguage(stored);
  if (persisted) return persisted;

  if (browserLanguages === undefined && typeof window === 'undefined') return 'zh-CN';

  const candidates = browserLanguages ?? (
    typeof navigator === 'undefined'
      ? []
      : navigator.languages?.length
        ? navigator.languages
        : [navigator.language]
  );
  for (const candidate of candidates) {
    const language = normalizeLanguage(candidate);
    if (language) return language;
  }
  return 'en';
}

void i18n
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: en },
      'zh-CN': { translation: zhCN },
    },
    lng: detectLanguage(),
    fallbackLng: 'en',
    supportedLngs: [...SUPPORTED_LANGUAGES],
    defaultNS: 'translation',
    interpolation: { escapeValue: false },
    initAsync: false,
    returnNull: false,
  });

export function getCurrentLanguage(): AppLanguage {
  return normalizeLanguage(i18n.resolvedLanguage ?? i18n.language) ?? 'en';
}

export async function changeLanguage(language: AppLanguage) {
  try {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    }
  } catch {
    // The interface can still switch when storage is unavailable.
  }
  await i18n.changeLanguage(language);
}

export function useAppTranslation() {
  return useTranslation();
}

export default i18n;
