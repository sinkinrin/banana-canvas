import { app, safeStorage, type BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export async function runGeminiProviderSettingsSmoke(
  window: BrowserWindow,
  wait: (window: BrowserWindow, expression: string, message: string) => Promise<unknown>,
) {
  const change = async (name: string, value: string, select = false) => {
    await window.webContents.executeJavaScript(`(() => {
      const element = document.querySelector('[name="${name}"]');
      const prototype = ${select ? 'HTMLSelectElement' : 'HTMLInputElement'}.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, ${JSON.stringify(value)});
      element.dispatchEvent(new Event('${select ? 'change' : 'input'}', { bubbles: true }));
    })()`);
  };
  const save = async () => {
    await window.webContents.executeJavaScript(`
      [...document.querySelectorAll('[data-settings-actions] button')]
        .find(button => button.textContent.includes('保存并应用')).click()
    `);
    await wait(window, `document.querySelector('[data-runtime-settings-dialog]')?.textContent.includes('配置已保存并立即生效')`, 'Provider settings did not save');
  };
  await change('geminiProvider', 'vertex-ai', true);
  await wait(window, `document.querySelector('input[name="vertexApiKey"]') && !document.querySelector('input[name="geminiApiKey"]')`, 'Vertex key controls did not replace AI Studio controls');
  await change('vertexApiKey', 'fixture-desktop-vertex-key');
  await change('vertexBaseUrl', 'https://vertex-smoke.example/v1');
  await save();
  await change('vertexAuthMode', 'adc', true);
  await wait(window, `document.querySelector('input[name="vertexProject"]')`, 'Vertex ADC controls did not appear');
  await change('vertexProject', 'smoke-project');
  await change('vertexLocation', 'us-central1');
  await save();

  await window.webContents.executeJavaScript(`document.querySelector('[data-settings-close]').click()`);
  await wait(window, `!document.querySelector('[data-runtime-settings-dialog]')`, 'Provider settings did not close');
  await window.webContents.executeJavaScript(`document.querySelector('[data-app-settings-entry]').click()`);
  await wait(window, `document.querySelector('[name="vertexProject"]')?.value === 'smoke-project'
    && document.querySelector('[name="vertexLocation"]')?.value === 'us-central1'
    && document.querySelector('[name="vertexBaseUrl"]')?.value === 'https://vertex-smoke.example/v1'`, 'Vertex settings did not survive reopening');
  await change('geminiProvider', 'ai-studio', true);
  await wait(window, `document.querySelector('input[name="geminiApiKey"]') && !document.querySelector('input[name="vertexApiKey"]')`, 'AI Studio controls did not return');
  await save();
  const persisted = await window.webContents.executeJavaScript(`fetch('/api/runtime-settings').then(r => r.json())`);
  if (persisted.gemini.provider !== 'ai-studio' || !persisted.gemini.vertexApiKeyConfigured
    || persisted.gemini.baseUrl !== '' || persisted.gemini.vertexBaseUrl !== 'https://vertex-smoke.example/v1') {
    throw new Error('Provider settings did not retain independent URLs and credentials');
  }
  const dir = app.getPath('userData');
  const envText = fs.readFileSync(path.join(dir, '.env'), 'utf8');
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = fs.readFileSync(path.join(dir, 'runtime-secrets.bin'), 'utf8');
    const secrets = JSON.parse(safeStorage.decryptString(Buffer.from(encrypted, 'base64')));
    if (secrets.VERTEX_API_KEY !== 'fixture-desktop-vertex-key'
      || encrypted.includes('fixture-desktop-vertex-key') || envText.includes('fixture-desktop-vertex-key')) {
      throw new Error('Vertex key did not survive encrypted desktop persistence');
    }
  } else if (!envText.includes('VERTEX_API_KEY="fixture-desktop-vertex-key"')) {
    throw new Error('Vertex key did not survive the existing unencrypted fallback store');
  }
  console.info('[banana:smoke] provider selection, custom URLs, ADC fields and desktop Vertex key persistence passed');
}
