import type { BrowserWindow } from 'electron';

const PROJECT_NAME = 'Window close regression';
const SAVED_DRAFT = 'Draft saved by the window close button';

export async function runWindowCloseSmoke({ window, localUrl, waitForPredicate }: {
  window: BrowserWindow;
  localUrl: string;
  waitForPredicate: (window: BrowserWindow, expression: string, message: string) => Promise<void>;
}) {
  const wait = (expression: string) => waitForPredicate(window, expression, `Window smoke failed: ${expression}`);
  const js = (source: string) => window.webContents.executeJavaScript(source);
  await wait(`document.querySelector('[data-window-action="close"]')`);
  await wait(`(() => {
    const bar = document.querySelector('[data-desktop-titlebar]');
    const drag = document.querySelector('.desktop-titlebar-drag');
    const controls = document.querySelector('.desktop-window-controls');
    return bar.getBoundingClientRect().top === 0 && bar.getBoundingClientRect().height === 32
      && getComputedStyle(drag).getPropertyValue('-webkit-app-region') === 'drag'
      && getComputedStyle(controls).getPropertyValue('-webkit-app-region') === 'no-drag'
      && document.querySelector('main, section').getBoundingClientRect().top >= 32;
  })()`);

  if (process.env.BANANA_SMOKE_RESTART === '1') {
    const { projects } = await (await fetch(`${localUrl}/api/projects`)).json() as { projects: { id: string; name: string }[] };
    const project = projects.find(item => item.name === PROJECT_NAME);
    if (!project) throw new Error('Closed project missing after restarting');
    const { snapshot } = await (await fetch(`${localUrl}/api/projects/${project.id}`)).json() as {
      snapshot: { nodes: { data: { prompt: string } }[] };
    };
    if (snapshot.nodes[0]?.data.prompt !== SAVED_DRAFT) throw new Error('Close did not persist the focused draft');
    console.info('[banana:smoke] restart acquired the single-instance lock and recovered the close-saved draft');
  } else {
    // Native window state is also tested; DOM-only clicks cannot prove this works.
    const [width, height] = window.getSize();
    if (!window.isResizable()) throw new Error('Frameless window is not resizable');
    window.setSize(width + 20, height + 20);
    if (window.getSize()[0] !== width + 20) throw new Error('Window resize failed');
    window.setSize(width, height);
    // Hosted Linux uses bare Xvfb without a window manager. Native window-state
    // transitions are verified on Windows, the platform we ship installers for.
    if (process.platform === 'win32') {
      window.showInactive();
      await js(`document.querySelector('[data-window-action="maximize"]').click()`);
      await wait(`document.querySelector('[data-window-action="maximize"]').getAttribute('aria-label') === '还原窗口'`);
      if (!window.isMaximized()) throw new Error('Maximize control did not maximize the native window');
      await js(`document.querySelector('[data-window-action="maximize"]').click()`);
      await wait(`document.querySelector('[data-window-action="maximize"]').getAttribute('aria-label') === '最大化窗口'`);
      if (window.isMaximized()) throw new Error('Restore control did not restore the native window');
      const minimized = new Promise<void>(resolve => window.once('minimize', () => resolve()));
      await js(`document.querySelector('[data-window-action="minimize"]').click()`);
      await minimized;
      if (!window.isMinimized()) throw new Error('Minimize control did not minimize the native window');
      window.restore();
      console.info('[banana:smoke] native Windows minimize/maximize/restore controls passed');
    }

    const created = await fetch(`${localUrl}/api/projects`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: PROJECT_NAME, snapshot: {
        nodes: [{ id: 'close-prompt', type: 'promptNode', position: { x: 250, y: 250 }, data: { prompt: 'Before close' } }],
        edges: [], assets: {},
      } }),
    });
    if (!created.ok) throw new Error('Could not create close regression project');
    const { project } = await created.json() as { project: { id: string } };
    await window.loadURL(`${localUrl}/projects/${project.id}?lng=zh-CN`);
    await wait(`(() => {
      const editor = document.querySelector('textarea');
      return editor?.value === 'Before close' && getComputedStyle(editor).visibility === 'visible'
        && editor.getBoundingClientRect().height > 0;
    })()`);
    // Delay the save so a close that bypasses the save handshake loses the draft.
    window.webContents.session.webRequest.onBeforeRequest({ urls: [`${localUrl}/api/projects/${project.id}`] }, (request, callback) => {
      if (request.method === 'PUT') setTimeout(() => callback({}), 250);
      else callback({});
    });
    window.webContents.focus();
    await js(`(() => {
      const editor = document.querySelector('textarea');
      editor.focus();
      editor.select();
    })()`);
    await wait(`document.activeElement?.tagName === 'TEXTAREA'`);
    await window.webContents.insertText(SAVED_DRAFT);
    await wait(`document.activeElement?.value === ${JSON.stringify(SAVED_DRAFT)}`);
    console.info('[banana:smoke] frameless layout, resize and window controls passed');
  }
  console.info('[banana:smoke] requesting normal window close');
  await js(`document.querySelector('[data-window-action="close"]').click()`);
}
