import type { BrowserWindow } from 'electron';

export async function runComparisonSmoke({ window, localUrl, imageUrl, flush, waitForPredicate }: {
  window: BrowserWindow; localUrl: string; imageUrl: string; flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  const response = await fetch(`${localUrl}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Model comparison smoke', snapshot: {
    nodes: [{ id: 'comparison-prompt', type: 'promptNode', position: { x: 100, y: 100 }, data: { prompt: 'identical comparison input', imageModel: 'image2.5-flare', image2Options: { quality: 'high' } } }], edges: [], assets: {},
  } }) });
  const created = await response.json() as { project?: { id?: string } };
  if (!response.ok || !created.project?.id) throw new Error('Comparison smoke project creation failed');
  const projectUrl = `${localUrl}/projects/${created.project.id}`;
  await window.loadURL(projectUrl);
  await waitForPredicate(window, `!!document.querySelector('[data-compare-models="true"]')`, 'Comparison entry is missing');
  await window.webContents.executeJavaScript(`(() => {
    globalThis.__comparisonOriginalFetch = globalThis.fetch;
    globalThis.__comparisonRequests = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/generate-image') {
        const body = JSON.parse(init.body); globalThis.__comparisonRequests.push(body);
        return new Response(JSON.stringify({ imageUrl: ${JSON.stringify(imageUrl)}, generationInfo: { apiModel: 'gpt-' + body.imageModel, requestedQuality: 'high', reportedQuality: 'low', elapsedMs: 1234 } }), { headers: { 'Content-Type': 'application/json' } });
      }
      if (url.pathname === '/api/runtime-settings/models') return new Response(JSON.stringify({ models: [{ id: 'gpt-image-2.5-flare', ownedBy: 'openai' }, { id: 'text-model' }] }), { headers: { 'Content-Type': 'application/json' } });
      return globalThis.__comparisonOriginalFetch(input, init);
    };
    document.querySelector('[data-compare-models="true"]').click();
  })()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-model-comparison] input[type="checkbox"]:checked').length === 2`, 'Default comparison models are incorrect');
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('[data-model-comparison] button')].find(button => button.textContent.includes('开始对比生成')).click()`);
  await waitForPredicate(window, `(() => {
    const modal = document.querySelector('[data-model-comparison]');
    return modal?.querySelectorAll('article img').length === 2 && modal.textContent.includes('high → low') && modal.textContent.includes('4 × 3')
      && globalThis.__comparisonRequests.length === 2 && globalThis.__comparisonRequests.every(body => body.prompt === 'identical comparison input' && body.includeGenerationInfo === true);
  })()`, 'Comparison did not generate two results with actual dimensions and server metadata');
  await window.webContents.executeJavaScript(`(() => {
    const slider = document.querySelector('[data-model-comparison] input[type="range"]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(slider, '2');
    slider.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-model-comparison] article button').click();
  })()`);
  await waitForPredicate(window, `(() => {
    const modal = document.querySelector('[data-model-comparison]');
    return [...modal.querySelectorAll('article img')].every(image => image.style.transform.includes('scale(2)')) && modal.querySelectorAll('button[aria-pressed="true"]').length === 1;
  })()`, 'Synchronized zoom or best-result selection failed');
  await window.webContents.executeJavaScript(`document.querySelector('[data-model-comparison] header button').click()`);
  await flush();
  await window.loadURL(projectUrl);
  await waitForPredicate(window, `document.querySelectorAll('[data-generation-info="true"]').length === 2 && document.body.textContent.includes('最佳方案')`, 'Comparison metadata or winner did not survive project reload');
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('查看对比')).click()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-model-comparison] article').length === 2 && document.querySelectorAll('[data-model-comparison] button[aria-pressed="true"]').length === 1`, 'Saved comparison could not be reopened');
  await window.webContents.executeJavaScript(`document.querySelector('[data-model-comparison] header button').click()`);

  // Only the isolated smoke profile is configured; catalog requests are intercepted in its renderer.
  const saved = await fetch(`${localUrl}/api/runtime-settings`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ image2: { baseUrl: 'https://relay.example/v1', apiKey: 'smoke-fixture-key' } }) });
  if (!saved.ok) throw new Error('Model catalog smoke connection setup failed');
  await window.webContents.executeJavaScript(`(() => {
    globalThis.__catalogOriginalFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname === '/api/runtime-settings/models') return new Response(JSON.stringify({ models: [{ id: 'gpt-image-2.5-flare', ownedBy: 'openai' }, { id: 'text-model' }] }), { headers: { 'Content-Type': 'application/json' } });
      return globalThis.__catalogOriginalFetch(input, init);
    };
    document.querySelector('[data-app-settings-entry="true"]').click();
  })()`);
  await waitForPredicate(window, `!!document.querySelector('[data-server-models] button:not(:disabled)')`, 'Model catalog load button is missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-server-models] button').click()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-server-models] li').length === 2`, 'Server model list was not rendered');
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-server-models] input');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'text-model');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-server-models] li').length === 1 && document.querySelector('[data-server-models] li').textContent.includes('text-model')`, 'Model catalog filtering failed');
  await window.webContents.executeJavaScript(`globalThis.fetch = globalThis.__catalogOriginalFetch; delete globalThis.__catalogOriginalFetch;`);
  console.info('[banana:smoke] multi-model comparison, synchronized zoom, winner persistence, result metadata and model catalog passed');
}
