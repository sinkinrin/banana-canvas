import type { BrowserWindow } from 'electron';

export async function runComparisonSmoke({ window, localUrl, imageUrl, flush, waitForPredicate }: {
  window: BrowserWindow; localUrl: string; imageUrl: string; flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  const response = await fetch(`${localUrl}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Model comparison smoke', snapshot: {
    nodes: [{ id: 'comparison-prompt', type: 'promptNode', position: { x: 100, y: 100 }, data: { prompt: 'identical comparison input', imageModel: 'image2.5-flare', aspectRatio: '16:9', imageSize: '2K', color: '#3b82f6', categoryName: '产品 A', image2Options: { quality: 'high' } } }], edges: [], assets: {},
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
  await waitForPredicate(window, `(() => { const selects = document.querySelectorAll('[data-model-comparison] select'); return selects[0]?.value === '16:9' && selects[1]?.value === '2K'; })()`, 'Comparison did not inherit node parameters');
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('[data-model-comparison] button')].find(button => button.textContent.includes('开始对比生成')).click()`);
  await waitForPredicate(window, `!document.querySelector('[data-model-comparison]') && document.querySelectorAll('[data-generation-info]').length === 2`, 'Comparison should return to canvas without opening results');
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('查看对比')).click()`);
  await waitForPredicate(window, `!document.querySelector('[data-model-comparison]') && document.querySelectorAll('[data-view-comparison]').length === 2 && globalThis.__comparisonRequests.length === 2 && globalThis.__comparisonRequests.every(body => body.aspectRatio === '16:9' && body.imageSize === '2K')`, 'Comparison should locate results on canvas');
  await window.webContents.executeJavaScript(`document.querySelector('[data-comparison-winner]').click()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-comparison-winner][aria-pressed="true"]').length === 1`, 'Canvas best-result selection failed');
  await flush();
  await window.loadURL(projectUrl);
  await waitForPredicate(window, `document.querySelectorAll('[data-generation-info="true"]').length === 2 && document.body.textContent.includes('最佳方案')`, 'Comparison metadata or winner did not survive project reload');
  await waitForPredicate(window, `[...document.querySelectorAll('[data-node-category]')].filter(button => button.textContent.includes('产品 A')).length === 3`, 'Generated results did not inherit and persist category');
  await window.webContents.executeJavaScript(`document.querySelector('[data-compare-models]').click()`);
  await waitForPredicate(window, `(() => { const modal = document.querySelector('[data-model-comparison]'); const selects = modal?.querySelectorAll('select'); return modal?.querySelectorAll('input:checked').length === 2 && selects[0]?.value === '16:9' && selects[1]?.value === '2K'; })()`, 'Comparison preferences did not survive reload');
  await window.webContents.executeJavaScript(`document.querySelector('[data-model-comparison] header button').click()`);
  await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(button => button.textContent.includes('查看对比')).click()`);
  await waitForPredicate(window, `!document.querySelector('[data-model-comparison]') && document.querySelectorAll('[data-comparison-winner][aria-pressed="true"]').length === 1`, 'Saved comparison should remain on canvas');

  await window.webContents.executeJavaScript(`(() => {
    globalThis.__singleTaskRequests = [];
    globalThis.__beforeCancelFetch = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/generate-image') return globalThis.__beforeCancelFetch(input, init);
      return new Promise((resolve, reject) => {
        const request = { aborted: false, complete: () => resolve(new Response(JSON.stringify({ imageUrl: ${JSON.stringify(imageUrl)} }), { headers: { 'Content-Type': 'application/json' } })) };
        globalThis.__singleTaskRequests.push(request);
        init.signal.addEventListener('abort', () => { request.aborted = true; reject(new DOMException('Stopped', 'AbortError')); }, { once: true });
      });
    };
    document.querySelector('[data-compare-models]').click();
  })()`);
  await waitForPredicate(window, `!!document.querySelector('[data-model-comparison] footer button')`, 'Second comparison setup missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-model-comparison] footer button').click()`);
  await waitForPredicate(window, `globalThis.__singleTaskRequests.length === 2 && document.querySelectorAll('[data-generation-cancel]').length === 2 && !document.querySelector('[data-model-comparison]')`, 'Independent stop controls missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-generation-cancel]').click()`);
  await waitForPredicate(window, `globalThis.__singleTaskRequests[0].aborted && !globalThis.__singleTaskRequests[1].aborted && document.querySelectorAll('[data-generation-cancel]').length === 1`, 'Stopping one result also cancelled its sibling');
  await window.webContents.executeJavaScript(`globalThis.__singleTaskRequests[1].complete()`);
  await waitForPredicate(window, `document.querySelectorAll('[data-generation-cancel]').length === 0 && document.querySelectorAll('[data-generation-info]').length === 3 && !document.querySelector('[data-compare-models]').disabled`, 'Remaining comparison result did not finish');
  await window.webContents.executeJavaScript(`globalThis.fetch = globalThis.__beforeCancelFetch; delete globalThis.__beforeCancelFetch;`);

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
  console.info('[banana:smoke] multi-model comparison, canvas navigation, independent cancellation, winner persistence, result metadata and model catalog passed');
}
