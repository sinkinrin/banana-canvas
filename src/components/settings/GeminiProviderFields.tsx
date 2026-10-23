import { useAppTranslation } from '../../i18n';
import type { RuntimeSettingsForm, RuntimeSettingsSnapshot } from '../../lib/runtimeSettings';

const fieldClassName = 'w-full rounded-lg border px-3 py-2 text-sm outline-none focus:border-[#F2C14E]';
const fieldStyle = { background: '#141210', borderColor: 'rgba(242,193,78,0.18)', color: '#EEE4CE' };

export function GeminiProviderFields({ form, settings, onChange }: {
  form: RuntimeSettingsForm;
  settings: RuntimeSettingsSnapshot['gemini'];
  onChange: (patch: Partial<RuntimeSettingsForm>) => void;
}) {
  const { t } = useAppTranslation();
  const vertex = form.geminiProvider === 'vertex-ai';
  return (
    <div className="mb-4 space-y-4" data-gemini-provider-fields="true">
      <label className="block space-y-1.5">
        <span className="text-xs">{t('settings.geminiProvider')}</span>
        <select name="geminiProvider" value={form.geminiProvider}
          onChange={(event) => onChange({ geminiProvider: event.target.value as RuntimeSettingsForm['geminiProvider'] })}
          className={fieldClassName} style={fieldStyle}>
          <option value="ai-studio">Google AI Studio</option>
          <option value="vertex-ai">Vertex AI</option>
        </select>
      </label>
      {vertex && <>
        <label className="block space-y-1.5">
          <span className="text-xs">{t('settings.vertexAuthMode')}</span>
          <select name="vertexAuthMode" value={form.vertexAuthMode}
            onChange={(event) => onChange({ vertexAuthMode: event.target.value as RuntimeSettingsForm['vertexAuthMode'] })}
            className={fieldClassName} style={fieldStyle}>
            <option value="api-key">API Key (Express Mode)</option>
            <option value="adc">{t('settings.vertexAdc')}</option>
          </select>
        </label>
        {form.vertexAuthMode === 'api-key' ? <>
          <label className="block space-y-1.5">
            <span className="flex justify-between gap-2 text-xs">
              <span>Vertex AI API Key</span>
              <span style={{ color: settings.vertexApiKeyConfigured ? '#7CCB8A' : '#96836F' }}>
                {t(settings.vertexApiKeyConfigured ? 'settings.savedSecret' : 'settings.notConfigured')}
              </span>
            </span>
            <input name="vertexApiKey" type="password" autoComplete="off" value={form.vertexApiKey}
              onChange={(event) => onChange({ vertexApiKey: event.target.value, clearVertexApiKey: false })}
              placeholder={t(settings.vertexApiKeyConfigured ? 'settings.newKeyPlaceholder' : 'settings.apiKeyPlaceholder')}
              className={fieldClassName} style={fieldStyle} />
          </label>
          {settings.vertexApiKeyConfigured && <label className="flex items-center gap-2 text-xs">
            <input type="checkbox" checked={form.clearVertexApiKey}
              onChange={(event) => onChange({ clearVertexApiKey: event.target.checked, vertexApiKey: '' })} />
            {t('settings.clearVertexKey')}
          </label>}
          <p className="text-xs leading-5" style={{ color: '#96836F' }}>{t('settings.vertexKeyHint')}</p>
        </> : <>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs">{t('settings.vertexProject')}</span>
              <input name="vertexProject" value={form.vertexProject} placeholder="my-cloud-project"
                onChange={(event) => onChange({ vertexProject: event.target.value })}
                className={fieldClassName} style={fieldStyle} />
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs">{t('settings.vertexLocation')}</span>
              <input name="vertexLocation" value={form.vertexLocation} placeholder="global"
                onChange={(event) => onChange({ vertexLocation: event.target.value })}
                className={fieldClassName} style={fieldStyle} />
            </label>
          </div>
          <p className="text-xs leading-5" style={{ color: '#96836F' }}>{t('settings.vertexAdcHint')}</p>
        </>}
      </>}
      <label className="block space-y-1.5">
        <span className="text-xs">{t('settings.geminiBaseUrl')}</span>
        <input name={vertex ? 'vertexBaseUrl' : 'geminiBaseUrl'} type="url" inputMode="url"
          value={vertex ? form.vertexBaseUrl : form.geminiBaseUrl}
          onChange={(event) => onChange(vertex ? { vertexBaseUrl: event.target.value } : { geminiBaseUrl: event.target.value })}
          placeholder={vertex ? 'https://aiplatform.googleapis.com' : 'https://generativelanguage.googleapis.com'}
          className={fieldClassName} style={fieldStyle} />
        <span className="block text-xs leading-5" style={{ color: '#96836F' }}>{t('settings.geminiBaseUrlHint')}</span>
      </label>
    </div>
  );
}
