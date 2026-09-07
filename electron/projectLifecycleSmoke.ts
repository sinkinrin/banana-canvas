import type { BrowserWindow } from 'electron';

export async function runProjectLifecycleSmoke({
  window, localUrl, flush, waitForPredicate,
}: {
  window: BrowserWindow;
  localUrl: string;
  flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, expression: string, message: string) => Promise<void>;
}) {
  const ids: string[] = [];
  for (const name of ['A', 'B']) {
    const response = await fetch(`${localUrl}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: `Lifecycle ${name}`, snapshot: {
        nodes: [{ id: `lifecycle-${name}`, type: 'promptNode', position: { x: 250, y: 250 }, data: { prompt: name } }],
        edges: [], assets: {},
      } }),
    });
    if (!response.ok) throw new Error('Could not create lifecycle smoke project');
    ids.push((await response.json() as { project: { id: string } }).project.id);
  }
  await flush();
  await window.loadURL(`${localUrl}/?lng=zh-CN`);
  const js = async (source: string) => {
    try { return await window.webContents.executeJavaScript(source); }
    catch (error) { throw new Error(`Lifecycle smoke script failed: ${source}`, { cause: error }); }
  };
  const wait = (source: string) => waitForPredicate(window, source, `Project lifecycle smoke failed: ${source}`);
  const navigate = (id: string) => js(`(() => {
    history.pushState({}, '', ${JSON.stringify(`/projects/${id}`)});
    window.dispatchEvent(new PopStateEvent('popstate'));
  })()`);
  await wait(`document.querySelector('[data-app-settings-entry="true"]')`);
  let releaseLoadA: (() => void) | undefined;
  let releaseSave: (() => void) | undefined;
  let holdSave = false;
  let failSave = false;
  const waitForRequest = async (ready: () => boolean) => {
    const deadline = Date.now() + 10_000;
    while (!ready()) {
      if (Date.now() >= deadline) throw new Error('Lifecycle smoke request did not arrive');
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
  };
  const session = window.webContents.session;
  session.webRequest.onBeforeRequest({ urls: [`${localUrl}/api/projects/*`] }, (request, callback) => {
    if (request.url === `${localUrl}/api/projects/${ids[0]}` && request.method === 'GET') {
      releaseLoadA = () => callback({});
    } else if (request.url === `${localUrl}/api/projects/${ids[1]}` && request.method === 'PUT') {
      if (failSave) callback({ cancel: true });
      else if (holdSave) releaseSave = () => callback({});
      else callback({});
    } else callback({});
  });
  try {
    await navigate(ids[0]);
    await waitForRequest(() => Boolean(releaseLoadA));
    await navigate(ids[1]);
    await wait(`document.querySelector('textarea')?.value === 'B'`);
    releaseLoadA!();
    releaseLoadA = undefined;
    await new Promise((resolve) => setTimeout(resolve, 150));
    if (!await js(`document.querySelector('textarea')?.value === 'B'`)) {
      throw new Error('Late project A response replaced project B');
    }
    const edit = async (value: string) => {
      await wait(`(() => { const editor = document.querySelector('textarea'); return editor && getComputedStyle(editor).visibility === 'visible' && editor.getBoundingClientRect().height > 0; })()`);
      window.webContents.focus();
      await js(`(() => {
        const editor = document.querySelector('textarea');
        editor.focus();
        Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(editor, ${JSON.stringify(value)});
        editor.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await js(`document.querySelector('textarea').focus()`);
    };
    holdSave = true;
    await edit('edited B');
    // Exercise browser unload protection, including an uncommitted focused draft.
    const prevented = await js(`(() => {
      const before = document.activeElement?.tagName;
      const event = new Event('beforeunload', { cancelable: true });
      window.dispatchEvent(event);
      return { before, focused: document.hasFocus(), prevented: event.defaultPrevented, active: document.activeElement?.tagName, value: document.querySelector('textarea')?.value, text: document.querySelector('main')?.textContent?.slice(0, 150) };
    })()`);
    if (!prevented.prevented) throw new Error(`Unloading with an unsaved draft was not prevented: ${JSON.stringify(prevented)}`);
    let acknowledged = false;
    const pendingFlush = flush().then(() => { acknowledged = true; });
    await waitForRequest(() => Boolean(releaseSave));
    if (acknowledged) throw new Error('Desktop acknowledged saving before persistence finished');
    releaseSave!();
    releaseSave = undefined;
    await pendingFlush;
    holdSave = false;
    failSave = true;
    await edit('retry B');
    let rejected = false;
    try { await flush(); } catch { rejected = true; }
    if (!rejected) throw new Error('Desktop accepted a failed project save');
    failSave = false;
    await flush();
    const stored = await (await fetch(`${localUrl}/api/projects/${ids[1]}`)).json() as {
      snapshot: { nodes: { id: string; data: { prompt: string } }[] };
    };
    if (stored.snapshot.nodes[0]?.id !== 'lifecycle-B' || stored.snapshot.nodes[0]?.data.prompt !== 'retry B') {
      throw new Error('Project B was not saved correctly');
    }
  } finally {
    releaseLoadA?.();
    releaseSave?.();
    session.webRequest.onBeforeRequest(null);
  }
  await window.loadURL(`${localUrl}/projects/${ids[1]}?lng=zh-CN`);
  await wait(`document.querySelector('textarea')?.value === 'retry B'`);
  console.info('[banana:smoke] project switching, unload protection, desktop save acknowledgement, retry, and reload passed');
}
