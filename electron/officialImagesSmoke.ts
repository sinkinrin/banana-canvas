import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export async function runOfficialImagesSmoke({ window, localUrl, imageUrl, userDataDir, flush, waitForPredicate: wait }: {
  window: BrowserWindow; localUrl: string; imageUrl: string; userDataDir: string; flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  const svgUrl = `data:image/svg+xml;base64,${Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><circle cx="32" cy="32" r="24" fill="royalblue"/></svg>').toString('base64')}`;
  const gifUrl = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';
  const createdResponse = await fetch(`${localUrl}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Official image smoke', snapshot: { nodes: [
    { id: 'official-prompt', type: 'promptNode', position: { x: 0, y: 0 }, data: { prompt: 'official image smoke', imageModel: 'openai-image2.6-flare', officialImageOptions: { quality: 'max', complexity: 'low', n: 2, partialImages: 1 } } },
    { id: 'official-svg', type: 'imageNode', position: { x: 450, y: 0 }, data: { imageModel: 'openai-image2.6-flare', imageUrl: svgUrl } },
    { id: 'official-gif', type: 'imageNode', position: { x: 450, y: 400 }, data: { imageModel: 'openai-image2.6-flare', imageUrl: gifUrl } },
  ], edges: [], assets: {} } }) });
  const created = await createdResponse.json() as { project?: { id: string } };
  if (!createdResponse.ok || !created.project) throw new Error('Official smoke project creation failed');
  const projectUrl = `${localUrl}/projects/${created.project.id}`;
  await window.loadURL(projectUrl);
  await wait(window, `document.querySelector('[data-image-node-id="official-svg"] img')?.naturalWidth === 64 && document.querySelector('[data-image-node-id="official-gif"] img')?.naturalWidth === 1`, 'SVG/GIF image display failed');
  await window.webContents.executeJavaScript(`document.querySelector('[data-app-settings-entry]').click()`);
  await wait(window, `!!document.querySelector('[data-official-images-settings]')`, 'Official connection settings missing');
  await window.webContents.executeJavaScript(`(() => {
    const set = (name, value) => { const input = document.querySelector('input[name="officialImages.' + name + '"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, value); input.dispatchEvent(new Event('input', { bubbles: true })); };
    set('apiKey', 'smoke-official-fixture'); set('proxyUrl', 'http://127.0.0.1:7890');
    if (!document.querySelector('input[name="officialImages.proxyEnabled"]').checked) document.querySelector('input[name="officialImages.proxyEnabled"]').click();
  })()`);
  await window.webContents.executeJavaScript(`document.querySelector('[data-settings-actions] button:last-child').click()`);
  await wait(window, `document.querySelector('[data-official-images-settings]')?.textContent.includes('已保存')`, 'Official credentials did not save');
  const snapshot = await (await fetch(`${localUrl}/api/runtime-settings`)).json() as { officialImages?: { apiKeyConfigured: boolean; proxyEnabled: boolean } };
  if (!snapshot.officialImages?.apiKeyConfigured || !snapshot.officialImages.proxyEnabled || JSON.stringify(snapshot).includes('smoke-official-fixture')) throw new Error('Official key/proxy snapshot is invalid');
  if (fs.readFileSync(path.join(userDataDir, '.env'), 'utf8').includes('smoke-official-fixture')) throw new Error('Official key leaked into the env file');
  await window.webContents.executeJavaScript(`document.querySelector('[data-settings-close]').click(); document.querySelector('[data-prompt-node-action="settings"]').click();`);
  await wait(window, `!!document.querySelector('select[name="officialImage.quality"]')`, 'Official parameters missing');
  const controls = await window.webContents.executeJavaScript(`(() => {
    const quality = document.querySelector('select[name="officialImage.quality"]');
    const model = document.querySelector('select[name="imageModel"]');
    return quality.value === 'max' && !quality.querySelector('option[value="max"]').disabled && model.querySelector('option[value="image2.5-flare"]').textContent.includes('残血版') && model.querySelector('option[value="openai-image2.6-flare"]').textContent.includes('满血版');
  })()`);
  if (!controls) throw new Error('Full quality or provider labels missing');
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('select[name="officialImage.outputFormat"]'); input.value = 'gif'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await wait(window, `!!document.querySelector('input[name="officialImage.frameCount"]') && !document.querySelector('select[name="officialImage.stream"]')`, 'GIF controls are incompatible with streaming');
  await window.webContents.executeJavaScript(`(() => { const input = document.querySelector('select[name="officialImage.outputFormat"]'); input.value = 'png'; input.dispatchEvent(new Event('change', { bubbles: true })); })()`);
  await window.webContents.executeJavaScript(`(() => {
    globalThis.__officialBeforeFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/generate-image') return globalThis.__officialBeforeFetch(input, init);
      globalThis.__officialRequest = JSON.parse(init.body);
      return new Response(new ReadableStream({ start(controller) {
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'image.partial', index: 0, partialImageIndex: 0, imageUrl: ${JSON.stringify(imageUrl)} }) + String.fromCharCode(10, 10)));
        globalThis.__officialFinish = () => { controller.enqueue(encoder.encode('data: ' + JSON.stringify({ type: 'image.completed', imageUrl: ${JSON.stringify(imageUrl)}, images: [${JSON.stringify(imageUrl)}, ${JSON.stringify(imageUrl)}], generationInfo: { apiModel: 'gpt-image-2.6-flare', reportedQuality: 'max', svgUsage: { input_tokens: 10 } } }) + String.fromCharCode(10, 10))); controller.close(); };
      } }), { headers: { 'Content-Type': 'text/event-stream' } });
    };
    document.querySelector('[data-generate-image]').click();
  })()`);
  try {
    await wait(window, `!!globalThis.__officialFinish && !!document.querySelector('[data-generation-cancel]') && [...document.querySelectorAll('img')].some(img => img.alt.includes('生成') && img.src === ${JSON.stringify(imageUrl)})`, 'Official partial image was not displayed');
    await window.webContents.executeJavaScript(`globalThis.__officialFinish()`);
    await wait(window, `!document.querySelector('[data-generation-cancel]') && document.querySelectorAll('[data-generation-info]').length === 4`, 'Official batch results were lost');
  } finally { await window.webContents.executeJavaScript(`globalThis.fetch = globalThis.__officialBeforeFetch; delete globalThis.__officialBeforeFetch;`); }
  await flush(); await window.loadURL(projectUrl);
  await wait(window, `document.querySelectorAll('[data-generation-info]').length === 4 && document.querySelector('[data-image-node-id="official-svg"] img')?.naturalWidth === 64`, 'Official images did not survive project reload');
  const screenshotDir = process.env.BANANA_SMOKE_SCREENSHOT_DIR;
  if (screenshotDir) { fs.mkdirSync(screenshotDir, { recursive: true }); fs.writeFileSync(path.join(screenshotDir, 'official-images-smoke.png'), (await window.capturePage()).toPNG()); }
  console.info('[banana:smoke] official settings, encrypted key, full quality, streaming previews, batch results, SVG/GIF and project reload passed');
}
