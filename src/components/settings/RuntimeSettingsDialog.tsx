import { useEffect, useState } from 'react';
import { CheckCircle2, KeyRound, Loader2, RefreshCw, Server, Settings, X } from 'lucide-react';

import {
  createRuntimeSettingsForm,
  createRuntimeSettingsUpdate,
  type RuntimeSettingsForm,
  type RuntimeSettingsSnapshot,
} from '../../lib/runtimeSettings';
import { loadRuntimeSettings, saveRuntimeSettings } from '../../services/runtimeSettings';
import { SoftwareUpdatePanel } from './SoftwareUpdatePanel';

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
  return (
    <span className="text-xs" style={{ color: configured ? '#7CCB8A' : '#D97B3A' }}>
      {configured ? '已保存；留空保持不变' : '尚未配置'}
    </span>
  );
}

export function RuntimeSettingsDialog({ onClose }: { onClose: () => void }) {
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
        setErrorMessage(error instanceof Error ? error.message : '加载配置失败');
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
      setMessage('配置已保存并立即生效；下次启动会自动加载。');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : '保存配置失败');
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
              <h2 id="runtime-settings-title" className="text-lg font-semibold">应用设置</h2>
              <p className="mt-0.5 text-xs" style={{ color: '#96836F' }}>
                管理模型连接、网络代理与桌面版本更新。
              </p>
            </div>
          </div>
          <button type="button" aria-label="关闭设置" onClick={onClose} className="rounded-lg p-2" style={{ color: '#96836F' }}>
            <X size={18} />
          </button>
        </header>

        <nav
          className="sticky top-[73px] z-10 flex gap-1 border-b px-6 py-2"
          style={{ background: 'rgba(29,26,20,0.98)', borderColor: 'rgba(242,193,78,0.12)' }}
          aria-label="设置分类"
          role="tablist"
        >
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'models'}
            onClick={() => setActiveTab('models')}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={activeTab === 'models'
              ? { background: 'rgba(242,193,78,0.14)', color: '#F2C14E' }
              : { color: '#96836F' }}
          >
            <Server size={15} />
            模型与连接
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'updates'}
            onClick={() => setActiveTab('updates')}
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium"
            style={activeTab === 'updates'
              ? { background: 'rgba(242,193,78,0.14)', color: '#F2C14E' }
              : { color: '#96836F' }}
          >
            <RefreshCw size={15} />
            软件更新
          </button>
        </nav>

        {activeTab === 'updates' ? (
          <SoftwareUpdatePanel />
        ) : !form || !settings ? (
          <div className="flex min-h-64 items-center justify-center gap-3" style={{ color: '#96836F' }}>
            {errorMessage ? errorMessage : <><Loader2 size={18} className="animate-spin" />加载配置中...</>}
          </div>
        ) : (
          <div className="space-y-6 p-6">
            <section className="rounded-xl border p-5" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Server size={18} style={{ color: '#F2C14E' }} />
                  <h3 className="font-semibold">Image2（默认模型）</h3>
                </div>
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs" style={{ background: settings.image2.ready ? 'rgba(124,203,138,0.12)' : 'rgba(217,123,58,0.12)', color: settings.image2.ready ? '#7CCB8A' : '#D97B3A' }}>
                  {settings.image2.ready && <CheckCircle2 size={13} />}
                  {settings.image2.ready ? '连接参数完整' : `缺少 ${settings.image2.missingKeys.join('、')}`}
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
                  <span className="text-xs" style={{ color: '#B8A58D' }}>模型名称</span>
                  <input
                    value={form.image2Model}
                    onChange={(event) => patchForm({ image2Model: event.target.value })}
                    placeholder="gpt-image-2"
                    className={fieldClassName}
                    style={fieldStyle}
                  />
                </label>

                <label className="space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>接口类型</span>
                  <select
                    value={form.image2EndpointType}
                    onChange={(event) => patchForm({ image2EndpointType: event.target.value as RuntimeSettingsForm['image2EndpointType'] })}
                    className={fieldClassName}
                    style={fieldStyle}
                  >
                    <option value="auto">自动判断</option>
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
                    type="password"
                    value={form.image2ApiKey}
                    onChange={(event) => patchForm({ image2ApiKey: event.target.value, clearImage2ApiKey: false })}
                    placeholder={settings.image2.apiKeyConfigured ? '输入新 Key 可替换已保存值' : '请输入 API Key'}
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
                      清除已保存的 Image2 Key
                    </label>
                  )}
                </label>
              </div>

              <details className="mt-5 rounded-lg border p-4" style={{ borderColor: 'rgba(242,193,78,0.12)' }}>
                <summary className="cursor-pointer text-sm font-medium" style={{ color: '#F2C14E' }}>网络与高级设置</summary>
                <div className="mt-4 grid gap-4 md:grid-cols-2">
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>Image2 专用代理 URL（可选）</span>
                    <input
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
                    <span className="text-xs" style={{ color: '#B8A58D' }}>代理模式</span>
                    <select
                      value={form.image2ProxyMode}
                      onChange={(event) => patchForm({ image2ProxyMode: event.target.value as RuntimeSettingsForm['image2ProxyMode'] })}
                      className={fieldClassName}
                      style={fieldStyle}
                    >
                      <option value="direct">直连</option>
                      <option value="auto">失败后自动切换</option>
                      <option value="proxy">仅代理</option>
                    </select>
                  </label>
                  <label className="flex items-center gap-3 self-end rounded-lg border px-3 py-2 text-sm" style={{ borderColor: 'rgba(242,193,78,0.12)', color: '#B8A58D' }}>
                    <input
                      type="checkbox"
                      checked={form.image2Stream}
                      onChange={(event) => patchForm({ image2Stream: event.target.checked })}
                    />
                    启用 SSE 流式结果
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>局部图数量（0–3）</span>
                    <NumberField value={form.image2PartialImages} min={0} max={3} onChange={(value) => patchForm({ image2PartialImages: value })} />
                  </label>
                  <label className="space-y-1.5">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>最大尝试次数（1–8）</span>
                    <NumberField value={form.image2MaxAttempts} min={1} max={8} onChange={(value) => patchForm({ image2MaxAttempts: value })} />
                  </label>
                  <label className="space-y-1.5 md:col-span-2">
                    <span className="text-xs" style={{ color: '#B8A58D' }}>单次请求超时（毫秒）</span>
                    <NumberField value={form.image2RequestTimeoutMs} min={1_000} max={900_000} onChange={(value) => patchForm({ image2RequestTimeoutMs: value })} />
                  </label>
                </div>
              </details>
            </section>

            <section className="rounded-xl border p-5" style={{ background: '#18150F', borderColor: 'rgba(242,193,78,0.14)' }}>
              <div className="mb-4 flex items-center gap-2">
                <KeyRound size={18} style={{ color: '#D97B3A' }} />
                <div>
                  <h3 className="font-semibold">Gemini Key（可选）</h3>
                  <p className="text-xs" style={{ color: '#96836F' }}>仅用于 Banana 系列模型和提示词优化。</p>
                </div>
              </div>
              <label className="space-y-1.5">
                <span className="flex items-center justify-between gap-2 text-xs" style={{ color: '#B8A58D' }}>
                  <span>Gemini API Key</span>
                  <ConfiguredState configured={settings.gemini.apiKeyConfigured} />
                </span>
                <input
                  type="password"
                  value={form.geminiApiKey}
                  onChange={(event) => patchForm({ geminiApiKey: event.target.value, clearGeminiApiKey: false })}
                  placeholder={settings.gemini.apiKeyConfigured ? '输入新 Key 可替换已保存值' : 'AIza...'}
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
                  清除已保存的 Gemini Key
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
                    <span className="block text-sm font-medium">Banana 与提示词优化使用代理</span>
                    <span className="mt-1 block text-xs leading-5" style={{ color: '#96836F' }}>
                      默认关闭；只影响 Gemini API，不会改变 Image2 的独立代理模式。
                    </span>
                  </span>
                </label>
                <label className="mt-3 block space-y-1.5">
                  <span className="text-xs" style={{ color: '#B8A58D' }}>Banana / Gemini 代理 URL</span>
                  <input
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
                保存后服务端热更新，无需重启软件。
              </p>
              <div className="flex gap-2">
                <button type="button" onClick={onClose} className="rounded-lg px-4 py-2 text-sm" style={{ background: '#141210', color: '#B8A58D' }}>
                  取消
                </button>
                <button
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={isSaving}
                  className="inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-60"
                  style={{ background: '#F2C14E', color: '#16130F' }}
                >
                  {isSaving && <Loader2 size={15} className="animate-spin" />}
                  保存并应用
                </button>
              </div>
            </footer>
          </div>
        )}
      </section>
    </div>
  );
}
