import fs from 'node:fs/promises';
import path from 'node:path';
import type { BrowserWindow } from 'electron';

export async function runCutoutSmoke({ window, localUrl, flush, waitForPredicate }: {
  window: BrowserWindow; localUrl: string; flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  async function waitForResultImage(message: string, timeoutMs = 180_000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('[data-image-node-id]:has([data-cutout-result]) img'))`);
      if (ready) return;
      const failure = await window.webContents.executeJavaScript(`document.querySelector('[data-image-node-id]:has([data-cutout-result]) [role="alert"]')?.textContent || ''`);
      if (failure) throw new Error(`${message}: ${failure}`);
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    throw new Error(message);
  }
  const fixture = process.env.BANANA_CUTOUT_SMOKE_IMAGE;
  if (!fixture) throw new Error('Missing cutout smoke fixture');
  const source = `data:image/jpeg;base64,${(await fs.readFile(fixture)).toString('base64')}`;
  const response = await fetch(`${localUrl}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Cutout smoke', snapshot: { nodes: [{ id: 'cutout-source', type: 'imageNode', position: { x: 30, y: 50 }, data: { imageUrl: source } }], edges: [], assets: {} } }),
  });
  const project = await response.json() as { project?: { id: string } };
  if (!response.ok || !project.project?.id) throw new Error('Could not create cutout smoke project');
  const url = `${localUrl}/projects/${project.project.id}`;
  await window.loadURL(url);
  await waitForPredicate(window, `Boolean(document.querySelector('[data-image-node-id="cutout-source"] img'))`, 'Cutout source did not load');
  const initial = await window.webContents.executeJavaScript('window.bananaDesktop.cutout.getState()');
  if (initial.selectedModelId !== 'isnet-int8' || !initial.installed.includes('isnet-int8')) throw new Error('Bundled INT8 default unavailable');
  const blocked: string[] = [];
  window.webContents.session.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    const external = new URL(details.url).origin !== new URL(localUrl).origin;
    if (external) blocked.push(details.url);
    callback({ cancel: external });
  });
  try {
    await window.webContents.executeJavaScript(`(() => {
      const node = document.querySelector('[data-image-node-id="cutout-source"]');
      node.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
      node.querySelector('[data-image-action="tools"]').click();
    })()`);
    await waitForPredicate(window, `Boolean(document.querySelector('[data-image-action="cutout"]'))`, 'Cutout menu did not open');
    await window.webContents.executeJavaScript(`document.querySelector('[data-image-action="cutout"]').click()`);
    await waitForResultImage('Real INT8 cutout did not produce an image');
    const result = await window.webContents.executeJavaScript(`(async () => {
      const img = document.querySelector('[data-image-node-id]:has([data-cutout-result]) img');
      await img.decode();
      const canvas = document.createElement('canvas'); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0);
      const corner = ctx.getImageData(4, 4, 1, 1).data[3];
      const face = ctx.getImageData(192, 240, 1, 1).data[3];
      return { width: img.naturalWidth, height: img.naturalHeight, corner, face, png: img.src.startsWith('data:image/png;base64,'), original: document.querySelector('[data-image-node-id="cutout-source"] img').src };
    })()`);
    if (result.width !== 384 || result.height !== 480 || result.corner > 20 || result.face < 230 || !result.png || result.original !== source || blocked.length) throw new Error(`Cutout offline/alpha check failed: ${JSON.stringify({ ...result, original: undefined, blocked })}`);
    await flush();
    await window.loadURL(url);
    await waitForResultImage('Cutout result did not survive reload', 60_000);
    console.info('[banana:smoke] bundled INT8 offline cutout, transparent PNG, original preservation and project reload passed');
  } finally {
    window.webContents.session.webRequest.onBeforeRequest(null);
  }
  await window.webContents.executeJavaScript(`document.querySelector('[data-app-settings-entry]').click()`);
  await waitForPredicate(window, `Boolean(document.querySelector('[data-settings-tab="cutout"]'))`, 'Cutout settings tab missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-settings-tab="cutout"]').click()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-cutout-model]').length === 3`, 'Cutout settings models missing');
  if (process.env.BANANA_CUTOUT_SCREENSHOT_DIR) {
    await fs.mkdir(process.env.BANANA_CUTOUT_SCREENSHOT_DIR, { recursive: true });
    await fs.writeFile(path.join(process.env.BANANA_CUTOUT_SCREENSHOT_DIR, 'cutout-settings.png'), (await window.webContents.capturePage()).toPNG());
  }
  if (process.env.BANANA_CUTOUT_OPTIONAL_SMOKE === '1') {
    console.info('[banana:smoke] downloading BiRefNet Lite through the desktop model manager');
    await window.webContents.executeJavaScript(`window.bananaDesktop.cutout.download('birefnet-lite-fp32')`);
    await waitForPredicate(window, `Boolean(document.querySelector('[data-cutout-select="birefnet-lite-fp32"]'))`, 'Downloaded model did not become selectable');
    await window.webContents.executeJavaScript(`document.querySelector('[data-cutout-select="birefnet-lite-fp32"]').click()`);
    await waitForPredicate(window, `document.querySelector('[data-cutout-model="birefnet-lite-fp32"]').textContent.includes('正在使用')`, 'Downloaded model did not become selected');
    await window.loadURL(url);
    const selected = await window.webContents.executeJavaScript('window.bananaDesktop.cutout.getState()');
    if (selected.selectedModelId !== 'birefnet-lite-fp32') throw new Error('Model selection did not survive page reload');
    await waitForPredicate(window, `Boolean(document.querySelector('[data-image-node-id="cutout-source"] img'))`, 'Optional cutout source unavailable');
    await window.webContents.executeJavaScript(`document.querySelector('[data-image-node-id="cutout-source"] [data-image-action="tools"]').click()`);
    await waitForPredicate(window, `Boolean(document.querySelector('[data-image-action="cutout"]'))`, 'Optional cutout menu unavailable');
    await window.webContents.executeJavaScript(`document.querySelector('[data-image-action="cutout"]').click()`);
    const deadline = Date.now() + 60_000;
    let completed = false;
    while (Date.now() < deadline) {
      completed = await window.webContents.executeJavaScript(`document.querySelectorAll('[data-image-node-id]:has([data-cutout-result]) img').length === 2`);
      if (completed) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
    if (!completed) throw new Error('Downloaded BiRefNet Lite inference failed');
    const alpha = await window.webContents.executeJavaScript(`(async () => {
      const node = [...document.querySelectorAll('[data-image-node-id]:has([data-cutout-result])')].find(node => node.textContent.includes('BiRefNet Lite'));
      const image = node.querySelector('img'); await image.decode();
      const canvas = document.createElement('canvas'); canvas.width = image.naturalWidth; canvas.height = image.naturalHeight;
      const ctx = canvas.getContext('2d'); ctx.drawImage(image, 0, 0);
      return [ctx.getImageData(4, 4, 1, 1).data[3], ctx.getImageData(192, 240, 1, 1).data[3]];
    })()`);
    if (alpha[0] > 20 || alpha[1] < 230) throw new Error('Downloaded model alpha is invalid');
    await window.webContents.executeJavaScript(`window.bananaDesktop.cutout.remove('birefnet-lite-fp32')`);
    const removed = await window.webContents.executeJavaScript('window.bananaDesktop.cutout.getState()');
    if (removed.selectedModelId !== 'isnet-int8' || removed.installed.includes('birefnet-lite-fp32')) throw new Error('Removing selected model did not restore bundled default');
    console.info('[banana:smoke] optional model download, SHA256, selection, inference, removal and default fallback passed');
  } else {
    await window.webContents.executeJavaScript(`document.querySelector('[data-settings-close]').click()`);
  }
  if (process.env.BANANA_CUTOUT_SCREENSHOT_DIR) {
    await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    await fs.writeFile(path.join(process.env.BANANA_CUTOUT_SCREENSHOT_DIR, 'cutout-canvas.png'), (await window.webContents.capturePage()).toPNG());
  }
}
