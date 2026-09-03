import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Server, Settings, X } from 'lucide-react';
import { useAppTranslation } from '../../i18n';

import {
  createRuntimeSettingsForm,
  createRuntimeSettingsUpdate,
  type RuntimeSettingsForm,
  type RuntimeSettingsSnapshot,
} from '../../lib/runtimeSettings';
import { loadRuntimeSettings, saveRuntimeSettings } from '../../services/runtimeSettings';
import { SoftwareUpdatePanel } from './SoftwareUpdatePanel';
import { LanguageSelector } from './LanguageSelector';

const fieldClassName = 'w-full rounded-lg border px-3 py-2 text-sm outline-none';
const fieldStyle = {
  background: '#141210',
  borderColor: 'rgba(242,193,78,0.2)',
  color: '#EEE4CE',
};

function NumberField({
  value,
  min,
  max,
  onChange,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}) {
  return (
    <input
      type="number"
      value={value}
      min={min}
      max={max}
      onChange={(event) => {
        const next = Number(event.target.value);
        if (Number.isFinite(next)) onChange(Math.min(max, Math.max(min, Math.trunc(next))));
      }}
      className={fieldClassName}
      style={fieldStyle}
    />
  );
}

function ConfiguredState({ configured }: { configured: boolean }) {
  const { t } = useAppTranslation();

  return (
    <span className="text-xs" style={{ color: configured ? '#7CCB8A' : '#D97B3A' }}>
      {configured ? t('settings.savedSecret') : t('settings.notConfigured')}
    </span>
  );
}

export function RuntimeSettingsDialog({ onClose }: { onClose: () => void }) {
  const { t } = useAppTranslation();
  const [settings, setSettings] = useState<RuntimeSettingsSnapshot>();
  const [form, setForm] = useState<RuntimeSettingsForm>();
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [errorMessage, setErrorMessage] = useState<string>();
  const [activeTab, setActiveTab] = useState<'models' | 'updates'>('models');

  useEffect(() => {
    const controller = new AbortController();
    loadRuntimeSettings(controller.signal)
      .then((loaded) => {
        setSettings(loaded);
        setForm(createRuntimeSettingsForm(loaded));
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        setErrorMessage(error instanceof Error ? error.message : t('settings.loadFailed'));
      });
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const patchForm = (patch: Partial<RuntimeSettingsForm>) => {
    setForm((current) => current ? { ...current, ...patch } : current);
    setMessage(undefined);
    setErrorMessage(undefined);
  };

  const handleSave = async () => {
    if (!form) return;
    setIsSaving(true);
    setMessage(undefined);
    setErrorMessage(undefined);
    try {
      const saved = await saveRuntimeSettings(createRuntimeSettingsUpdate(form));
      setSettings(saved);
      setForm(createRuntimeSettingsForm(saved));
      setMessage(t('settings.saveSuccess'));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : t('settings.saveFailed'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        data-runtime-settings-dialog="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="runtime-settings-title"
        className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl border shadow-2xl"
        style={{ background: '#1D1A14', borderColor: 'rgba(242,193,78,0.24)', color: '#EEE4CE' }}
      >
        <header
          className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-4"
          style={{ background: 'rgba(29,26,20,0.98)', borderColor: 'rgba(242,193,78,0.14)' }}
        >
          <div className="flex items-center gap-3">
            <div className="rounded-xl p-2" style={{ background: 'rgba(242,193,78,0.12)', color: '#F2C14E' }}>
              <Settings size={20} />
            </div>
            <div>
              <h2 id="runtime-settings-title" className="text-lg font-semibold">{t('settings.title')}</h2>
              <p className="mt-0.5 text-xs" style={{ color: '#96836F' }}>
                {t('settings.description')}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <LanguageSelector />
            <button data-settings-close="true" type="button" aria-label={t('settings.close')} onClick={onClose} className="rounded-lg p-2" style={{ color: '#96836F' }}>
              <X size={18} />
            </button>
          </div>
        </header>

        <nav
          className="sticky top-[73px] z-10 flex gap-1 border-b px-6 py-2"
          style={{ background: 'rgba(29,26,20,0.98)', borderColor: 'rgba(242,193,78,0.12)' }}
          aria-label={t('settings.categories')}
          role="tablist"
        >
          <button
            type="button"
            data-settings-tab="models"
            role="tab"
            aria-selected={activeTab === 'models'}
            onClick={() => setActiveTab('models')}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={activeTab === 'models'
              ? { background: 'rgba(242,193,78,0.14)', color: '#F2C14E' }
              : { color: '#96836F' }}
          >
            <Server size={15} />
            {t('settings.connectionTab')}
          </button>
          <button
            type="button"
            data-settings-tab="updates"
            role="tab"
            aria-selected={activeTab === 'updates'}
            onClick={() => setActiveTab('updates')}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={activeTab === 'updates'
              ? { background: 'rgba(242,193,78,0.14)', color: '#F2C14E' }
              : { color: '#96836F' }}
          >
            <RefreshCw size={15} />
            {t('settings.updatesTab')}
          </button>
        </nav>

        {activeTab === 'updates' ? (
          <SoftwareUpdatePanel />
        ) : !form || !settings ? (
          <div className="flex min-h-64 items-center justify-center gap-3" style={{ color: '#96836F' }}>
            {errorMessage ? errorMessage : <><Loader2 size={18} className="animate-spin" />{t('settings.loading')}</>}
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <section className="rounded-xl border p-5" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Server size={18} style={{ color: '#F2C14E' }} />
                  <h3 className="font-semibold">{t('settings.image2Default')}</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: settings.image2.ready ? 'rgba(124,203,138,0.12)' : 'rgba(217,123,58,0.12)', color: settings.image2.ready ? '#7CCB8A' : '#D97B3A' }}>
                  {settings.image2.ready && <CheckCircle2 size={13} />}
                  {settings.image2.ready
                    ? t('settings.connectionReady')
                    : t('settings.missingKeys', { keys: settings.image2.missingKeys.join(', ') })}
                </span>
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="space-y-1.5 md:col-span-2">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>API Base URL</span>
                  <input
                    type="url"
                    inputMode="url"
                    value={form.image2BaseUrl}
                    onChange={(event) => patchForm({ image2BaseUrl: event.target.value })}
                    placeholder="https://example.com/v1"
                    className={fieldClassName}
                    style={fieldStyle}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.modelName')}</span>
                  <input
                    name="image2Model"
                    value={form.image2Model}
                    onChange={(event) => patchForm({ image2Model: event.target.value })}
                    placeholder="gpt-image-2"
                    className={fieldClassName}
                    style={fieldStyle}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.endpointType')}</span>
                  <select
                    name="image2EndpointType"
                    value={form.image2EndpointType}
                    onChange={(event) => patchForm({ image2EndpointType: event.target.value as RuntimeSettingsForm['image2EndpointType'] })}
                    className={fieldClassName}
                    style={fieldStyle}
                  >
                    <option value="auto">{t('settings.endpointAuto')}</option>
                    <option value="images">Images API</option>
                    <option value="chat">Chat Completions</option>
                  </select>
                </label>

                <label className="space-y-1.5 md:col-span-2">
                  <span className="flex items-center justify-between gap-2 text-xs" style={{ color: '#B8A58D' }}>
                    <span>Image2 API Key</span>
                    <ConfiguredState configured={settings.image2.apiKeyConfigured} />
                  </span>
                  <input
                    name="image2ApiKey"
                    type="password"
                    value={form.image2ApiKey}
                    onChange={(event) => patchForm({ image2ApiKey: event.target.value, clearImage2ApiKey: false })}
                    placeholder={settings.image2.apiKeyConfigured ? t('settings.newKeyPlaceholder') : t('settings.apiKeyPlaceholder')}
                    className={fieldClassName}
                    style={fieldStyle}
                  />
                  {settings.image2.apiKeyConfigured && (
                    <label className="flex items-center gap-2 text-xs" style={{ color: '#96836F' }}>
                      <input
                        type="checkbox"
                        checked={form.clearImage2ApiKey}
                        onChange={(event) => patchForm({ clearImage2ApiKey: event.target.checked, image2ApiKey: '' })}
                      />
                      {t('settings.clearImage2Key')}
                    </label>
                  )}
                </label>
              </div>

              <details className="mt-5 rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
                <summary className="cursor-pointer text-sm font-medium" style={{ color: '#F2C14E' }}>{t('settings.networkAdvanced')}</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.image2ProxyUrl')}</span>
                    <input
                      name="image2ProxyUrl"
                      type="url"
                      inputMode="url"
                      value={form.image2ProxyUrl}
                      onChange={(event) => patchForm({ image2ProxyUrl: event.target.value })}
                      placeholder="http://127.0.0.1:7890"
                      className={fieldClassName}
                      style={fieldStyle}
                    />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.proxyMode')}</span>
                    <select
                      name="image2ProxyMode"
                      value={form.image2ProxyMode}
                      onChange={(event) => patchForm({ image2ProxyMode: event.target.value as RuntimeSettingsForm['image2ProxyMode'] })}
                      className={fieldClassName}
                      style={fieldStyle}
                    >
                      <option value="direct">{t('settings.proxyDirect')}</option>
                      <option value="auto">{t('settings.proxyAuto')}</option>
                      <option value="proxy">{t('settings.proxyOnly')}</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 self-end rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(242,193,78,0.12)', color: '#B8A58D' }}>
                    <input
                      type="checkbox"
                      checked={form.image2Stream}
                      onChange={(event) => patchForm({ image2Stream: event.target.checked })}
                    />
                    {t('settings.enableSse')}
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.partialImages')}</span>
                    <NumberField value={form.image2PartialImages} min={0} max={3} onChange={(value) => patchForm({ image2PartialImages: value })} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.maxAttempts')}</span>
                    <NumberField value={form.image2MaxAttempts} min={1} max={8} onChange={(value) => patchForm({ image2MaxAttempts: value })} />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.requestTimeout')}</span>
                    <NumberField value={form.image2RequestTimeoutMs} min={1_000} max={900_000} onChange={(value) => patchForm({ image2RequestTimeoutMs: value })} />
                  </label>
                </div>
              </details>
            </section>

            <section className="rounded-xl border p-5" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}>
              <div className="mb-4 flex items-center gap-2">
                <KeyRound size={18} style={{ color: '#D97B3A' }} />
                <div>
                  <h3 className="font-semibold">{t('settings.geminiOptional')}</h3>
                  <p className="text-xs" style={{ color: '#96836F' }}>{t('settings.geminiDescription')}</p>
                </div>
              </div>
              <label className="mb-4 block space-y-1.5">
                <span className="text-xs" style={{ color: '#B8A58D' }}>
                  {t('settings.geminiPromptOptimizerModel')}
                </span>
                <input
                  name="geminiPromptOptimizerModel"
                  value={form.geminiPromptOptimizerModel}
                  onChange={(event) => patchForm({ geminiPromptOptimizerModel: event.target.value })}
                  placeholder="gemini-3.8-flash"
                  className={fieldClassName}
                  style={fieldStyle}
                />
                <span className="block text-xs leading-5" style={{ color: '#96836F' }}>
                  {t('settings.geminiPromptOptimizerDescription')}
                </span>
              </label>
              <label className="space-y-1.5">
                <span className="flex items-center justify-between gap-2 text-xs" style={{ color: '#B8A58D' }}>
                  <span>Gemini API Key</span>
                  <ConfiguredState configured={settings.gemini.apiKeyConfigured} />
                </span>
                <input
                  name="geminiApiKey"
                  type="password"
                  value={form.geminiApiKey}
                  onChange={(event) => patchForm({ geminiApiKey: event.target.value, clearGeminiApiKey: false })}
                  placeholder={settings.gemini.apiKeyConfigured ? t('settings.newKeyPlaceholder') : 'AIza...'}
                  className={fieldClassName}
                  style={fieldStyle}
                />
              </label>
              {settings.gemini.apiKeyConfigured && (
                <label className="mt-2 flex items-center gap-2 text-xs" style={{ color: '#96836F' }}>
                  <input
                    type="checkbox"
                    checked={form.clearGeminiApiKey}
                    onChange={(event) => patchForm({ clearGeminiApiKey: event.target.checked, geminiApiKey: '' })}
                  />
                  {t('settings.clearGeminiKey')}
                </label>
              )}
              <div className="mt-5 border-t pt-4" style={{ borderColor: 'rgba(242,193,78,0.1)' }}>
                <label className="flex items-start gap-3 rounded-lg border p-3" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
                  <input
                    type="checkbox"
                    className="mt-0.5 accent-[#F2C14E]"
                    checked={form.geminiProxyEnabled}
                    onChange={(event) => patchForm({ geminiProxyEnabled: event.target.checked })}
                  />
                  <span>
                    <span className="block text-sm font-medium">{t('settings.geminiProxy')}</span>
                    <span className="mt-1 block text-xs leading-5" style={{ color: '#96836F' }}>
                      {t('settings.geminiProxyDescription')}
                    </span>
                  </span>
                </label>
                <label className="mt-3 block space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>{t('settings.geminiProxyUrl')}</span>
                  <input
                    name="geminiProxyUrl"
                    type="url"
                    inputMode="url"
                    value={form.geminiProxyUrl}
                    onChange={(event) => patchForm({ geminiProxyUrl: event.target.value })}
                    placeholder="http://127.0.0.1:7890"
                    className={fieldClassName}
                    style={fieldStyle}
                  />
                </label>
              </div>
            </section>

            {(message || errorMessage) && (
              <div className="rounded-lg border px-4 py-3 text-sm" style={{ borderColor: errorMessage ? 'rgba(217,123,58,0.3)' : 'rgba(124,203,138,0.3)', color: errorMessage ? '#D97B3A' : '#7CCB8A', background: errorMessage ? 'rgba(217,123,58,0.08)' : 'rgba(124,203,138,0.08)' }}>
                {errorMessage || message}
              </div>
            )}

            <footer className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs" style={{ color: '#96836F' }}>
                {t('settings.hotReloadHint')}
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={{ background: '#141210', color: '#B8A58D' }}>
                  {t('common.cancel')}
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                  style={{ background: '#F2C14E', color: '#16130F' }}
                >
                  {isSaving && <Loader2 size={15} className="animate-spin" />}
                  {t('settings.saveAndApply')}
                </button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
