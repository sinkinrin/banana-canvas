import type { BrowserWindow } from 'electron';

type SavedNode = { id: string; type: string; data: { isLoading?: boolean; imageAssetId?: string } };

export async function runGenerationViewportSmoke({ window, localUrl, imageUrl, flush, waitForPredicate }: {
  window: BrowserWindow;
  localUrl: string;
  imageUrl: string;
  flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  const created = await fetch(`${localUrl}/api/projects`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'Generation viewport regression', snapshot: {
      nodes: [{ id: 'viewport-prompt', type: 'promptNode', position: { x: 100, y: 100 },
        data: { prompt: 'viewport regression fixture', imageModel: 'banana' } }], edges: [], assets: {},
    } }),
  });
  if (!created.ok) throw new Error('Could not create viewport smoke project');
  const { project } = await created.json() as { project: { id: string } };
  const projectUrl = `${localUrl}/projects/${project.id}`;
  const js = (source: string) => window.webContents.executeJavaScript(source);
  const wait = (predicate: string) => waitForPredicate(window, predicate, `Generation viewport smoke failed: ${predicate}`);
  const snapshot = async () => {
    await flush();
    const response = await fetch(`${localUrl}/api/projects/${project.id}`);
    return (await response.json() as { snapshot: { nodes: SavedNode[]; edges: unknown[] } }).snapshot;
  };
  const promptSelector = '.react-flow__node-promptNode';
  const start = () => js(`([...document.querySelectorAll('${promptSelector} button')].find(b => b.textContent.includes('生成图像'))).click()`);
  const fit = async () => {
    await js(`document.activeElement?.blur(); window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))`);
    await wait(`(() => { const r = document.querySelector('${promptSelector}')?.getBoundingClientRect(); return r && r.left >= 0 && r.right <= innerWidth; })()`);
  };
  const installMock = () => js(`(() => {
    const original = window.fetch;
    window.__viewportRequests = [];
    window.fetch = (input, init) => {
      const url = new URL(typeof input === 'string' ? input : input.url, location.href);
      if (url.pathname !== '/api/generate-image') return original(input, init);
      return new Promise((resolve, reject) => {
        const request = { aborted: false, complete: () => resolve(new Response(JSON.stringify({ imageUrl: ${JSON.stringify(imageUrl)} }), { headers: { 'Content-Type': 'application/json' } })) };
        window.__viewportRequests.push(request);
        init.signal.addEventListener('abort', () => { request.aborted = true; reject(new DOMException('Aborted', 'AbortError')); }, { once: true });
      });
    };
  })()`);
  try {
    await window.loadURL(`${projectUrl}?lng=zh-CN`);
    await wait(`!!document.querySelector('${promptSelector} textarea')`);
    await installMock();
    await start();
    await wait(`window.__viewportRequests.length === 1 && !!document.querySelector('.react-flow__node-imageNode')`);
    await fit();
    // Native Chromium input reproduces dragging a task to the edge and auto-panning
    // its source prompt out of view. A visible window also exercises compositor hit testing.
    window.show();
    window.webContents.debugger.attach('1.3');
    const point = await js(`(() => { const r = document.querySelector('.react-flow__node-imageNode').getBoundingClientRect(); return { x: r.x + 80, y: r.y + 200 }; })()`);
    const edgeX = await js('innerWidth - 5');
    const mouse = (params: Record<string, unknown>) => window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', params);
    await mouse({ type: 'mouseMoved', ...point });
    await mouse({ type: 'mousePressed', ...point, button: 'left', buttons: 1, clickCount: 1 });
    try {
      for (let x = point.x + 20; x < edgeX; x += 20) {
        await mouse({ type: 'mouseMoved', x, y: point.y, button: 'left', buttons: 1 });
      }
      await mouse({ type: 'mouseMoved', x: edgeX, y: point.y, button: 'left', buttons: 1 });
      await wait(`(() => { const n = document.querySelector('${promptSelector}'); return !n || n.getBoundingClientRect().right < 0; })()`);
    } finally {
      await mouse({ type: 'mouseReleased', x: edgeX, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
    }
    if (await js('window.__viewportRequests[0].aborted')) throw new Error('Dragging to the edge aborted generation');
    const pending = await snapshot();
    if (pending.nodes.length !== 2 || pending.edges.length !== 1) {
      throw new Error('Offscreen generation was lost from the saved project');
    }
    // Complete while the source is outside the viewport, then return and reload.
    await js('window.__viewportRequests[0].complete()');
    await wait(`!!document.querySelector('[data-generation-info="true"]')`);
    const completed = await snapshot();
    if (!completed.nodes.find(n => n.type === 'imageNode')?.data.imageAssetId || completed.nodes.some(n => n.data.isLoading)) {
      throw new Error('Offscreen generation did not finish and persist');
    }
    await fit();
    await window.loadURL(`${projectUrl}?lng=zh-CN`);
    await wait(`!!document.querySelector('[data-generation-info="true"]')`);
    await installMock();
    await start();
    await wait('window.__viewportRequests.length === 1');
    await js(`([...document.querySelectorAll('${promptSelector} button')].find(b => b.textContent.includes('停止全部'))).click()`);
    await wait('window.__viewportRequests[0].aborted');
    await wait(`document.querySelectorAll('.react-flow__node-imageNode').length === 1`);
    if ((await snapshot()).nodes.length !== 2) throw new Error('Explicit cancellation removed a completed result');
    // Actual node removal still cancels its task.
    await start();
    await wait('window.__viewportRequests.length === 2');
    await js(`document.querySelector('${promptSelector} button[title="删除节点"]').click()`);
    await wait('window.__viewportRequests[1].aborted');
    await wait(`document.querySelectorAll('.react-flow__node').length === 1`);
    if ((await snapshot()).nodes[0]?.type !== 'imageNode') throw new Error('Deleting the source lost its completed result');
    // Restore the source only in this isolated fixture and verify leaving a project.
    await fetch(`${localUrl}/api/projects/${project.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...completed, nodes: [...completed.nodes] }) });
    await window.loadURL(`${projectUrl}?lng=zh-CN`);
    await wait(`!!document.querySelector('${promptSelector} textarea')`);
    await installMock();
    await start();
    await wait('window.__viewportRequests.length === 1');
    await js(`history.pushState({}, '', '/'); window.dispatchEvent(new PopStateEvent('popstate'))`);
    await wait('window.__viewportRequests[0].aborted');
    console.info('[banana:smoke] edge drag, offscreen completion, saved results, explicit cancel, source deletion and project exit passed');
  } finally {
    if (window.webContents.debugger.isAttached()) window.webContents.debugger.detach();
    // Keep the smoke window visible: hiding it suspends layout frames on Xvfb
    // and prevents subsequent React Flow mount/close checks from initializing.
  }
}
