import { Languages } from 'lucide-react';
import {
  changeLanguage,
  getCurrentLanguage,
  type AppLanguage,
  useAppTranslation,
} from '../../i18n';

export function LanguageSelector() {
  const { t, i18n } = useAppTranslation();
  const currentLanguage = getCurrentLanguage();

  return (
    <label className="flex min-w-48 items-center gap-2 rounded-lg border px-2.5 py-1.5" style={{ borderColor: 'rgba(242,193,78,0.16)', background: '#18150F' }}>
      <Languages size={15} className="shrink-0" style={{ color: '#F2C14E' }} />
      <span className="sr-only">{t('language.label')}</span>
      <select
        data-language-selector="true"
        aria-label={t('language.label')}
        value={currentLanguage}
        onChange={(event) => void changeLanguage(event.target.value as AppLanguage)}
        className="min-w-0 flex-1 bg-transparent text-xs outline-none"
        style={{ color: '#EEE4CE' }}
        key={i18n.resolvedLanguage}
      >
        <option value="en">{t('language.english')}</option>
        <option value="zh-CN">{t('language.simplifiedChinese')}</option>
      </select>
    </label>
  );
}
