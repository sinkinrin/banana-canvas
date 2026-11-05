import { useAppTranslation } from '../../i18n';
import type { RuntimeSettingsForm, OfficialImagesSettings } from '../../lib/runtimeSettings';
import { ServerModelsPanel } from './ServerModelsPanel';

type Props = { value: RuntimeSettingsForm['officialImages']; settings?: OfficialImagesSettings; onChange: (value: RuntimeSettingsForm['officialImages']) => void };
const fieldClass = 'w-full rounded-lg border border-[#F2C14E]/20 bg-[#141210] px-3 py-2 text-sm text-[#EEE4CE]';
export function OfficialImagesFields({ value, settings, onChange }: Props) {
  const { t } = useAppTranslation();
  const patch = (update: Partial<typeof value>) => onChange({ ...value, ...update });
  const textField = (key: 'baseUrl' | 'proxyUrl' | 'organization' | 'project', label: string, placeholder?: string) => <label className="block space-y-1 text-xs text-[#B8A58D]">{label}<input name={`officialImages.${key}`} className={fieldClass} value={value[key]} placeholder={placeholder} onChange={event => patch({ [key]: event.target.value })} /></label>;
  return <section data-official-images-settings="true" className="space-y-4 rounded-xl border border-[#F2C14E]/20 bg-[#1D1A14] p-4">
    <div className="flex items-center justify-between"><h3 className="font-semibold">{t('officialImages.provider')}</h3><span className="text-xs text-[#B8A58D]">{t(settings?.apiKeyConfigured ? 'settings.savedSecret' : 'settings.notConfigured')}</span></div>
    <p className="text-xs text-[#96836F]">{t('officialImages.connectionHint')}</p>
    <div className="grid gap-3 md:grid-cols-2">
      {textField('baseUrl', 'Base URL', 'https://api.openai.com/v1')}
      <label className="space-y-1 text-xs text-[#B8A58D]">API Key<input name="officialImages.apiKey" type="password" autoComplete="new-password" className={fieldClass} value={value.apiKey} placeholder={settings?.apiKeyConfigured ? t('settings.newKeyPlaceholder') : 'sk-…'} onChange={event => patch({ apiKey: event.target.value, clearApiKey: false })} /></label>
      {textField('organization', t('officialImages.organization'))}
      {textField('project', t('officialImages.project'))}
      {textField('proxyUrl', t('officialImages.proxyUrl'), 'http://127.0.0.1:7890')}
      <label className="space-y-1 text-xs text-[#B8A58D]">{t('officialImages.timeout')}<input name="officialImages.requestTimeoutMs" type="number" min={1000} max={900000} className={fieldClass} value={value.requestTimeoutMs} onChange={event => patch({ requestTimeoutMs: Number(event.target.value) })} /></label>
    </div>
    <div className="flex flex-wrap gap-4 text-xs text-[#B8A58D]">
      <label><input type="checkbox" name="officialImages.proxyEnabled" checked={value.proxyEnabled} onChange={event => patch({ proxyEnabled: event.target.checked })} /> {t('officialImages.proxyEnabled')}</label>
      <label><input type="checkbox" name="officialImages.stream" checked={value.stream} onChange={event => patch({ stream: event.target.checked })} /> {t('officialImages.streamDefault')}</label>
      {settings?.apiKeyConfigured && <label><input type="checkbox" checked={value.clearApiKey} onChange={event => patch({ clearApiKey: event.target.checked, apiKey: '' })} /> {t('officialImages.clearKey')}</label>}
    </div>
    <ServerModelsPanel connection={settings?.baseUrl ?? value.baseUrl} provider="official" />
  </section>;
}
