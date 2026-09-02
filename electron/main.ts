import fs from 'node:fs';
import path from 'node:path';
import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  nativeImage,
  safeStorage,
  shell,
  type MessageBoxOptions,
} from 'electron';
import { autoUpdater } from 'electron-updater';
import { startLocalServer, type LocalServerHandle } from '../src/server/startLocalServer';
import type { RuntimeConfigLogger } from '../src/server/runtimeConfig';
import { isAllowedExternalUrl, isInternalAppUrl } from '../src/lib/electronNavigation';
import { createUnavailableUpdateState, type DesktopUpdateState } from '../src/lib/desktopUpdates';
import {
  removeDotEnvKeys,
  type RuntimeSettingsSecretStore,
  type RuntimeSettingsSecretValues,
} from '../src/server/runtimeSettings';
import {
  createDesktopUpdateManager,
  type DesktopUpdateInfo,
} from './updateManager';
import { createUpdatePreferencesStore } from './updatePreferences';
import {
  UPDATE_CHECK_CHANNEL,
  UPDATE_DOWNLOAD_CHANNEL,
  UPDATE_GET_STATE_CHANNEL,
  UPDATE_INSTALL_CHANNEL,
  UPDATE_SET_AUTOMATIC_CHANNEL,
  UPDATE_STATE_CHANGED_CHANNEL,
  WRITE_IMAGE_TO_CLIPBOARD_CHANNEL,
} from './ipcChannels';

let mainWindow: BrowserWindow | null = null;
let serverHandle: LocalServerHandle | null = null;
let serverStartPromise: Promise<LocalServerHandle> | null = null;
let updateManager: ReturnType<typeof createDesktopUpdateManager> | null = null;
let updatePreferencesStore: ReturnType<typeof createUpdatePreferencesStore> | null = null;
let isQuitting = false;

const MAX_CLIPBOARD_IMAGE_DATA_URL_LENGTH = 128 * 1024 * 1024;
const SUPPORTED_CLIPBOARD_IMAGE_DATA_URL = /^data:image\/(?:png|jpe?g|webp|gif);base64,/i;

function assertApplicationWindowSender(event: Electron.IpcMainInvokeEvent, action: string) {
  if (!mainWindow || event.sender !== mainWindow.webContents) {
    throw new Error(`${action} request did not come from the application window`);
  }
}

async function writeImageDataUrlToClipboard(imageDataUrl: unknown) {
  if (
    typeof imageDataUrl !== 'string'
    || imageDataUrl.length > MAX_CLIPBOARD_IMAGE_DATA_URL_LENGTH
    || !SUPPORTED_CLIPBOARD_IMAGE_DATA_URL.test(imageDataUrl)
  ) {
    throw new Error('Unsupported clipboard image payload');
  }

  const image = nativeImage.createFromDataURL(imageDataUrl);
  if (image.isEmpty()) throw new Error('Clipboard image could not be decoded');

  for (let attempt = 0; attempt < 3; attempt += 1) {
    clipboard.writeImage(image);
    if (!clipboard.readImage().isEmpty()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error('System clipboard did not accept the image');
}

ipcMain.handle(WRITE_IMAGE_TO_CLIPBOARD_CHANNEL, async (event, imageDataUrl: unknown) => {
  assertApplicationWindowSender(event, 'Clipboard');
  await writeImageDataUrlToClipboard(imageDataUrl);
});

function getUpdatePreferencesStore() {
  updatePreferencesStore ??= createUpdatePreferencesStore(
    path.join(app.getPath('userData'), 'update-preferences.json')
  );
  return updatePreferencesStore;
}

function getDesktopUpdateState(): DesktopUpdateState {
  if (updateManager) return updateManager.getState();
  const unavailable = createUnavailableUpdateState(app.getVersion());
  if (!app.isPackaged || isSmokeTest()) return unavailable;
  return {
    ...unavailable,
    supported: true,
    automaticUpdatesEnabled: getUpdatePreferencesStore().get().automaticUpdatesEnabled,
  };
}

function emitDesktopUpdateState(state: DesktopUpdateState) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send(UPDATE_STATE_CHANGED_CHANNEL, state);
}

ipcMain.handle(UPDATE_GET_STATE_CHANNEL, async (event) => {
  assertApplicationWindowSender(event, 'Update state');
  startDesktopUpdates();
  return getDesktopUpdateState();
});

ipcMain.handle(UPDATE_CHECK_CHANNEL, async (event) => {
  assertApplicationWindowSender(event, 'Update check');
  startDesktopUpdates();
  return updateManager ? await updateManager.checkNow() : getDesktopUpdateState();
});

ipcMain.handle(UPDATE_DOWNLOAD_CHANNEL, async (event) => {
  assertApplicationWindowSender(event, 'Update download');
  startDesktopUpdates();
  return updateManager ? await updateManager.downloadUpdate() : getDesktopUpdateState();
});

ipcMain.handle(UPDATE_INSTALL_CHANNEL, async (event) => {
  assertApplicationWindowSender(event, 'Update install');
  startDesktopUpdates();
  return updateManager ? await updateManager.installNow() : getDesktopUpdateState();
});

ipcMain.handle(UPDATE_SET_AUTOMATIC_CHANNEL, async (event, enabled: unknown) => {
  assertApplicationWindowSender(event, 'Update preference');
  if (typeof enabled !== 'boolean') throw new Error('Automatic update preference must be a boolean');
  getUpdatePreferencesStore().replace({ automaticUpdatesEnabled: enabled });
  startDesktopUpdates();
  return updateManager
    ? updateManager.setAutomaticUpdatesEnabled(enabled)
    : getDesktopUpdateState();
});

function isSmokeTest() {
  return process.env.BANANA_SMOKE_TEST === '1';
}

function configureSmokeUserDataDir() {
  const smokeUserDataDir = process.env.BANANA_SMOKE_USER_DATA_DIR?.trim();
  if (!isSmokeTest() || !smokeUserDataDir) return;

  const resolvedDir = path.resolve(smokeUserDataDir);
  fs.mkdirSync(resolvedDir, { recursive: true });
  app.setPath('userData', resolvedDir);
}

configureSmokeUserDataDir();

const logger: RuntimeConfigLogger = ({ level, message }) => {
  const prefix = `[banana:${level}]`;
  if (level === 'error') {
    console.error(prefix, message);
    return;
  }
  if (level === 'warn') {
    console.warn(prefix, message);
    return;
  }
  console.info(prefix, message);
};

async function prepareForUpdateInstall() {
  if (isQuitting) return;
  isQuitting = true;
  updateManager?.stop();

  if (!serverHandle) return;
  try {
    await serverHandle.close();
  } catch (error) {
    logger({
      level: 'warn',
      message: `[update] 关闭本地服务失败，将继续安装：${error instanceof Error ? error.message : String(error)}`,
    });
  } finally {
    serverHandle = null;
  }
}

async function promptToRestartForUpdate(info: DesktopUpdateInfo) {
  const options: MessageBoxOptions = {
    type: 'info',
    title: '香蕉画图更新已就绪',
    message: `版本 ${info.version} 已在后台下载完成`,
    detail: [
      info.releaseName?.trim(),
      '是否立即重启并安装？选择“稍后”会在退出应用后自动安装。',
      '当前安装包未进行代码签名，Windows 可能显示安全提示。',
    ].filter(Boolean).join('\n\n'),
    buttons: ['立即重启并安装', '稍后'],
    defaultId: 0,
    cancelId: 1,
    noLink: true,
  };
  const result = mainWindow
    ? await dialog.showMessageBox(mainWindow, options)
    : await dialog.showMessageBox(options);
  return result.response === 0;
}

function startDesktopUpdates() {
  if (!app.isPackaged || isSmokeTest() || updateManager) return;

  const preferences = getUpdatePreferencesStore().get();
  updateManager = createDesktopUpdateManager({
    updater: autoUpdater,
    currentVersion: app.getVersion(),
    automaticUpdatesEnabled: preferences.automaticUpdatesEnabled,
    logger: (level, message) => logger({ level, message: `[update] ${message}` }),
    promptToRestart: promptToRestartForUpdate,
    beforeInstall: prepareForUpdateInstall,
    onStateChange: emitDesktopUpdateState,
  });
  updateManager.start();
}

function getAppRoot() {
  return app.getAppPath();
}

function ensureUserEnvFile(userDataDir: string, appRoot: string) {
  const envPath = path.join(userDataDir, '.env');
  if (fs.existsSync(envPath)) return envPath;

  fs.mkdirSync(userDataDir, { recursive: true });
  const examplePath = path.join(appRoot, '.env.example');
  const initialContent = fs.existsSync(examplePath)
    ? fs.readFileSync(examplePath, 'utf8')
    : 'GEMINI_API_KEY=""\nIMAGE2_BASE_URL=""\nIMAGE2_API_KEY=""\nIMAGE2_MODEL="gpt-image-2"\n';
  fs.writeFileSync(envPath, initialContent, { encoding: 'utf8', mode: 0o600 });
  return envPath;
}

function createElectronRuntimeSecretsStore(userDataDir: string): RuntimeSettingsSecretStore {
  const secretsPath = path.join(userDataDir, 'runtime-secrets.bin');

  return {
    get: () => {
      if (!fs.existsSync(secretsPath)) return {};
      const encrypted = Buffer.from(fs.readFileSync(secretsPath, 'utf8'), 'base64');
      const parsed = JSON.parse(safeStorage.decryptString(encrypted)) as RuntimeSettingsSecretValues;
      return {
        GEMINI_API_KEY: typeof parsed.GEMINI_API_KEY === 'string' ? parsed.GEMINI_API_KEY : '',
        IMAGE2_API_KEY: typeof parsed.IMAGE2_API_KEY === 'string' ? parsed.IMAGE2_API_KEY : '',
      };
    },
    replace: (values) => {
      fs.mkdirSync(userDataDir, { recursive: true });
      const encrypted = safeStorage.encryptString(JSON.stringify(values));
      const tempPath = `${secretsPath}.${process.pid}.tmp`;
      fs.writeFileSync(tempPath, encrypted.toString('base64'), { encoding: 'utf8', mode: 0o600 });
      fs.renameSync(tempPath, secretsPath);
    },
  };
}

function migrateLegacyDesktopSecrets(
  envFilePath: string,
  secretStore: RuntimeSettingsSecretStore
) {
  const text = fs.readFileSync(envFilePath, 'utf8');
  const legacyValues: RuntimeSettingsSecretValues = {};

  for (const key of ['GEMINI_API_KEY', 'IMAGE2_API_KEY'] as const) {
    const match = text.match(new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=\\s*(.*)$`, 'm'));
    if (!match) continue;
    const rawValue = match[1].trim();
    try {
      const parsed = JSON.parse(rawValue);
      if (typeof parsed === 'string' && parsed) legacyValues[key] = parsed;
    } catch {
      if (rawValue) legacyValues[key] = rawValue.replace(/^['"]|['"]$/g, '');
    }
  }

  if (Object.values(legacyValues).some(Boolean)) {
    secretStore.replace({ ...secretStore.get(), ...legacyValues });
  }
  const nextText = removeDotEnvKeys(text, ['GEMINI_API_KEY', 'IMAGE2_API_KEY']);
  if (nextText !== text) fs.writeFileSync(envFilePath, nextText, { encoding: 'utf8', mode: 0o600 });
}

function configureExternalNavigation(window: BrowserWindow, localUrl: string) {
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (isInternalAppUrl(url, localUrl)) {
      void window.loadURL(url);
      return { action: 'deny' };
    }
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });

  window.webContents.on('will-navigate', (event, url) => {
    if (isInternalAppUrl(url, localUrl)) return;
    event.preventDefault();
    if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  });
}

async function waitForSmokeRenderer(window: BrowserWindow) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const state = await window.webContents.executeJavaScript(`({
      title: document.title,
      lang: document.documentElement.lang,
      rootChildren: document.querySelector('#root')?.childElementCount ?? 0
    })`) as { title: string; lang: string; rootChildren: number };
    if (state.title === '香蕉画图' && state.lang === 'zh-CN' && state.rootChildren > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Desktop smoke renderer did not become ready');
}

async function waitForSmokePredicate(
  window: BrowserWindow,
  expression: string,
  failureMessage: string
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const matched = await window.webContents.executeJavaScript(`Boolean(${expression})`) as boolean;
    if (matched) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(failureMessage);
}

async function waitForSmokeClipboardImage() {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    const image = clipboard.readImage();
    if (!image.isEmpty()) return image.getSize();
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error('Image copy smoke test did not write to the system clipboard');
}

function captureSmokeClipboard() {
  const data: Parameters<typeof clipboard.write>[0] = {};
  const text = clipboard.readText();
  const html = clipboard.readHTML();
  const rtf = clipboard.readRTF();
  const image = clipboard.readImage();
  const bookmark = process.platform === 'linux' ? undefined : clipboard.readBookmark();

  if (text) data.text = text;
  if (html) data.html = html;
  if (rtf) data.rtf = rtf;
  if (!image.isEmpty()) data.image = image;
  if (bookmark?.url) {
    data.text = bookmark.url;
    data.bookmark = bookmark.title;
  }
  return data;
}

function restoreSmokeClipboard(data: Parameters<typeof clipboard.write>[0]) {
  if (Object.keys(data).length > 0) {
    clipboard.write(data);
    return;
  }
  clipboard.clear();
}

function createSmokeJpegDataUrl(red = 0x34, green = 0x9a, blue = 0xeb) {
  const width = 4;
  const height = 3;
  const bitmap = Buffer.alloc(width * height * 4);
  for (let index = 0; index < bitmap.length; index += 4) {
    bitmap[index] = red;
    bitmap[index + 1] = green;
    bitmap[index + 2] = blue;
    bitmap[index + 3] = 0xff;
  }
  const jpeg = nativeImage.createFromBitmap(bitmap, { width, height }).toJPEG(90);
  if (jpeg.length === 0) throw new Error('Could not create JPEG fixture for clipboard smoke test');
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
}

async function clickSmokeElementWithMouse(
  window: BrowserWindow,
  selector: string,
  failureMessage: string
) {
  const readCenter = async () => await window.webContents.executeJavaScript(`(() => {
    const element = document.querySelector(${JSON.stringify(selector)});
    if (!(element instanceof HTMLElement)) return null;
    const rect = element.getBoundingClientRect();
    return { x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) };
  })()`) as { x: number; y: number } | null;

  let center = await readCenter();
  if (!center) throw new Error(failureMessage);
  window.webContents.sendInputEvent({ type: 'mouseMove', x: center.x, y: center.y });
  await window.webContents.executeJavaScript(`(() => {
    const target = document.querySelector(${JSON.stringify(selector)});
    target?.closest('[data-image-node-id]')?.dispatchEvent(new MouseEvent('mouseover', {
      bubbles: true,
      clientX: ${JSON.stringify(center.x)},
      clientY: ${JSON.stringify(center.y)},
    }));
  })()`);
  await new Promise((resolve) => setTimeout(resolve, 80));
  center = await readCenter();
  if (!center) throw new Error(failureMessage);
  const hitTest = await window.webContents.executeJavaScript(`(() => {
    const hit = document.elementFromPoint(${JSON.stringify(center.x)}, ${JSON.stringify(center.y)});
    const target = document.querySelector(${JSON.stringify(selector)});
    const targetRect = target?.getBoundingClientRect();
    const nodeRect = target?.closest('.react-flow__node')?.getBoundingClientRect();
    return {
      center: ${JSON.stringify(center)},
      viewport: { width: innerWidth, height: innerHeight },
      targetRect: targetRect ? { x: targetRect.x, y: targetRect.y, width: targetRect.width, height: targetRect.height } : null,
      nodeRect: nodeRect ? { x: nodeRect.x, y: nodeRect.y, width: nodeRect.width, height: nodeRect.height } : null,
      hit: hit instanceof Element ? hit.outerHTML.slice(0, 240) : null,
      targetContainsHit: target instanceof Element && hit instanceof Element
        ? target === hit || target.contains(hit)
        : false,
      overlayClass: target?.closest('.absolute.inset-0')?.className,
    };
  })()` ) as { hit: string | null; targetContainsHit: boolean; overlayClass?: string };
  if (!hitTest.targetContainsHit) {
    throw new Error(`${failureMessage}: mouse hit test missed target ${JSON.stringify(hitTest)}`);
  }
  window.webContents.sendInputEvent({ type: 'mouseDown', x: center.x, y: center.y, button: 'left', clickCount: 1 });
  window.webContents.sendInputEvent({ type: 'mouseUp', x: center.x, y: center.y, button: 'left', clickCount: 1 });
}

async function runImageRerunSmokeTest(window: BrowserWindow) {
  const rerunImageUrl = createSmokeJpegDataUrl(0xe8, 0x7d, 0x32);
  await window.webContents.executeJavaScript(`(() => {
    globalThis.__bananaSmokeOriginalFetch = globalThis.fetch;
    globalThis.__bananaSmokeGenerateCalls = 0;
    globalThis.fetch = async (input, init) => {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url;
      if (new URL(url, location.href).pathname === '/api/generate-image') {
        globalThis.__bananaSmokeGenerateCalls += 1;
        return new Response(${JSON.stringify(JSON.stringify({ imageUrl: rerunImageUrl }))}, {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return globalThis.__bananaSmokeOriginalFetch(input, init);
    };
  })()`);

  try {
    await clickSmokeElementWithMouse(
      window,
      '[data-image-node-id="clipboard-smoke-image"] button[aria-label="重新生成"]',
      'Image rerun smoke test could not find the rerun button'
    );
    try {
      await waitForSmokePredicate(
        window,
        `(() => {
          const node = document.querySelector('[data-image-node-id="clipboard-smoke-image"]');
          const image = node?.querySelector('img');
          return image?.getAttribute('src') === ${JSON.stringify(rerunImageUrl)}
            && node?.textContent?.includes('已重新生成');
        })()`,
        'Image rerun smoke action did not update the result or show success feedback'
      );
    } catch (error) {
      const details = await window.webContents.executeJavaScript(`(() => {
        const node = document.querySelector('[data-image-node-id="clipboard-smoke-image"]');
        const image = node?.querySelector('img');
        const button = node?.querySelector('button[aria-label="重新生成"]');
        return {
          calls: globalThis.__bananaSmokeGenerateCalls,
          imageMatches: image?.getAttribute('src') === ${JSON.stringify(rerunImageUrl)},
          imagePrefix: image?.getAttribute('src')?.slice(0, 48),
          buttonDisabled: button?.disabled,
          text: node?.textContent,
        };
      })()`);
      throw new Error(`${error instanceof Error ? error.message : String(error)}: ${JSON.stringify(details)}`);
    }
  } finally {
    await window.webContents.executeJavaScript(`(() => {
      if (globalThis.__bananaSmokeOriginalFetch) {
        globalThis.fetch = globalThis.__bananaSmokeOriginalFetch;
        delete globalThis.__bananaSmokeOriginalFetch;
        delete globalThis.__bananaSmokeGenerateCalls;
      }
    })()`);
  }
}

async function runPromptLibrarySmokeTest(localUrl: string, window: BrowserWindow) {
  const promptText = 'smoke test cinematic banana poster';
  await clickSmokeElementWithMouse(
    window,
    'button[data-prompt-library-entry="canvas"]',
    'Prompt library smoke test could not find the canvas entry'
  );
  await waitForSmokePredicate(
    window,
    `document.querySelector('[data-prompt-library-dialog="true"]')`,
    'Prompt library smoke dialog did not open'
  );

  await window.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('[data-prompt-library-dialog="true"]');
    const button = [...(dialog?.querySelectorAll('button') ?? [])]
      .find((item) => item.textContent?.includes('新建提示词'));
    button?.click();
  })()`);
  await waitForSmokePredicate(
    window,
    `document.querySelector('[data-prompt-library-editor="true"]')`,
    'Prompt library smoke editor did not open'
  );

  const filled = await window.webContents.executeJavaScript(`(() => {
    const form = document.querySelector('[data-prompt-library-editor="true"]');
    const inputs = form?.querySelectorAll('input');
    const textarea = form?.querySelector('textarea');
    if (!inputs || inputs.length < 2 || !(textarea instanceof HTMLTextAreaElement)) return false;
    const setValue = (element, value) => {
      const prototype = element instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, value);
      element.dispatchEvent(new Event('input', { bubbles: true }));
    };
    setValue(inputs[0], 'Smoke 海报模板');
    setValue(textarea, ${JSON.stringify(promptText)});
    setValue(inputs[1], 'smoke，海报');
    return true;
  })()`) as boolean;
  if (!filled) throw new Error('Prompt library smoke editor fields were unavailable');

  await window.webContents.executeJavaScript(`
    document.querySelector('[data-prompt-library-editor="true"] button[type="submit"]')?.click()
  `);
  await waitForSmokePredicate(
    window,
    `(() => {
      const dialog = document.querySelector('[data-prompt-library-dialog="true"]');
      return dialog?.textContent?.includes('Smoke 海报模板')
        && [...(dialog?.querySelectorAll('button') ?? [])]
          .some((button) => button.textContent?.includes('使用此提示词'));
    })()`,
    'Prompt library smoke template was not saved'
  );

  await window.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('[data-prompt-library-dialog="true"]');
    [...(dialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes('使用此提示词'))
      ?.click();
  })()`);
  await waitForSmokePredicate(
    window,
    `[...document.querySelectorAll('textarea')].some((textarea) => textarea.value === ${JSON.stringify(promptText)})`,
    'Prompt library smoke template was not applied to a new prompt node'
  );

  const response = await fetch(`${localUrl}/api/prompts`);
  const body = await response.json() as { prompts?: Array<{ title?: string; tags?: string[] }> };
  if (
    !response.ok
    || body.prompts?.length !== 1
    || body.prompts[0]?.title !== 'Smoke 海报模板'
    || body.prompts[0]?.tags?.join(',') !== 'smoke,海报'
  ) {
    throw new Error('Prompt library smoke persistence did not match the saved template');
  }
}

async function runApplicationSettingsSmokeTest(window: BrowserWindow) {
  const opened = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('button')]
      .find((item) => item.textContent?.trim() === '模型设置');
    button?.click();
    return Boolean(button);
  })()`) as boolean;
  if (!opened) throw new Error('Application settings smoke entry was unavailable');

  await waitForSmokePredicate(
    window,
    `document.querySelector('[data-runtime-settings-dialog="true"]')`,
    'Application settings smoke dialog did not open'
  );
  await window.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('[data-runtime-settings-dialog="true"]');
    [...(dialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes('软件更新'))
      ?.click();
  })()`);
  await waitForSmokePredicate(
    window,
    `(() => {
      const dialog = document.querySelector('[data-runtime-settings-dialog="true"]');
      return dialog?.textContent?.includes('手动检查更新')
        && dialog?.textContent?.includes('自动更新默认关闭')
        && dialog?.textContent?.includes('SmartScreen');
    })()`,
    'Application settings smoke update panel was incomplete'
  );

  await window.webContents.executeJavaScript(`(() => {
    const dialog = document.querySelector('[data-runtime-settings-dialog="true"]');
    [...(dialog?.querySelectorAll('button') ?? [])]
      .find((button) => button.textContent?.includes('模型与连接'))
      ?.click();
  })()`);
  await waitForSmokePredicate(
    window,
    `(() => {
      const dialog = document.querySelector('[data-runtime-settings-dialog="true"]');
      const proxyInput = [...(dialog?.querySelectorAll('input') ?? [])]
        .find((input) => input.placeholder === 'http://127.0.0.1:7890');
      return dialog?.textContent?.includes('Banana 与提示词优化使用代理')
        && proxyInput instanceof HTMLInputElement;
    })()`,
    'Application settings smoke Banana proxy controls were incomplete'
  );

  await window.webContents.executeJavaScript(`
    document.querySelector('[data-runtime-settings-dialog="true"] button[aria-label="关闭设置"]')?.click()
  `);
  await waitForSmokePredicate(
    window,
    `!document.querySelector('[data-runtime-settings-dialog="true"]')`,
    'Application settings smoke dialog did not close'
  );
}

async function runImageClipboardSmokeTest(window: BrowserWindow) {
  const previousClipboard = captureSmokeClipboard();
  try {
    clipboard.clear();
    const clicked = await window.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('button')]
        .find((item) => item.getAttribute('title') === '复制图片');
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`) as boolean;
    if (!clicked) throw new Error('Image copy smoke test could not find the copy button');

    const size = await waitForSmokeClipboardImage();
    if (size.width !== 4 || size.height !== 3) {
      throw new Error(`Image copy smoke test wrote an unexpected size: ${size.width}x${size.height}`);
    }
  } finally {
    restoreSmokeClipboard(previousClipboard);
  }
}

async function runBananaModelSelectionSmokeTest(window: BrowserWindow) {
  await window.webContents.executeJavaScript(`
    document.querySelector('button[title="设置"]')?.click()
  `);
  await waitForSmokePredicate(
    window,
    `(() => {
      const select = [...document.querySelectorAll('select')]
        .find((item) => [...item.options].some((option) => option.value === 'banana-lite'));
      const values = select ? [...select.options].map((option) => option.value) : [];
      return ['banana', 'banana-lite', 'banana-pro', 'image2']
        .every((value) => values.includes(value));
    })()`,
    'Banana model smoke selector did not expose every model'
  );

  await window.webContents.executeJavaScript(`(() => {
    const select = [...document.querySelectorAll('select')]
      .find((item) => [...item.options].some((option) => option.value === 'banana-lite'));
    if (!select) return false;
    select.value = 'banana-lite';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForSmokePredicate(
    window,
    `(() => {
      const byLabel = (text) => [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.trim() === text)
        ?.parentElement?.querySelector('select');
      const aspectValues = [...(byLabel('画面比例')?.options ?? [])].map((option) => option.value);
      const sizeValues = [...(byLabel('分辨率')?.options ?? [])].map((option) => option.value);
      const thinking = byLabel('思考等级');
      const mediaResolution = byLabel('参考图解析');
      const search = byLabel('Search grounding');
      return document.body.textContent?.includes('Banana 2 Lite 高级参数')
        && aspectValues.includes('1:8')
        && aspectValues.includes('8:1')
        && sizeValues.length === 1
        && sizeValues[0] === '1K'
        && thinking instanceof HTMLSelectElement
        && !thinking.disabled
        && [...thinking.options].some((option) => option.value === 'HIGH')
        && mediaResolution instanceof HTMLSelectElement
        && [...mediaResolution.options].some((option) => option.value === 'MEDIA_RESOLUTION_HIGH')
        && search instanceof HTMLSelectElement
        && search.disabled
        && ![...search.options].some((option) => option.value === 'on');
    })()`,
    'Banana model smoke Lite capabilities did not render correctly'
  );

  await window.webContents.executeJavaScript(`(() => {
    const select = [...document.querySelectorAll('select')]
      .find((item) => [...item.options].some((option) => option.value === 'banana-pro'));
    if (!select) return false;
    select.value = 'banana-pro';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
  await waitForSmokePredicate(
    window,
    `(() => {
      const byLabel = (text) => [...document.querySelectorAll('label')]
        .find((label) => label.textContent?.trim() === text)
        ?.parentElement?.querySelector('select');
      const aspectValues = [...(byLabel('画面比例')?.options ?? [])].map((option) => option.value);
      const sizeValues = [...(byLabel('分辨率')?.options ?? [])].map((option) => option.value);
      const thinking = byLabel('思考等级');
      const mediaResolution = byLabel('参考图解析');
      const search = byLabel('Search grounding');
      return document.body.textContent?.includes('Banana Pro 高级参数')
        && !aspectValues.includes('1:8')
        && aspectValues.includes('21:9')
        && ['1K', '2K', '4K'].every((value) => sizeValues.includes(value))
        && thinking instanceof HTMLSelectElement
        && thinking.disabled
        && mediaResolution instanceof HTMLSelectElement
        && mediaResolution.disabled
        && ![...mediaResolution.options].some((option) => option.value === 'MEDIA_RESOLUTION_HIGH')
        && search instanceof HTMLSelectElement
        && !search.disabled
        && [...search.options].some((option) => option.value === 'on');
    })()`,
    'Banana model smoke Pro capabilities did not render correctly'
  );

  await window.webContents.executeJavaScript(`(() => {
    const select = [...document.querySelectorAll('select')]
      .find((item) => [...item.options].some((option) => option.value === 'image2'));
    if (!select) return false;
    select.value = 'image2';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  })()`);
}

async function runSketchSmokeTest(localUrl: string, window: BrowserWindow) {
  const createResponse = await fetch(`${localUrl}/api/projects`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: 'QuickDraw smoke',
      snapshot: {
        nodes: [{
          id: 'quickdraw-smoke-prompt',
          type: 'promptNode',
          position: { x: 250, y: 250 },
          data: { prompt: 'a person in motion', imageModel: 'image2', aspectRatio: '1:1' },
        }, {
          id: 'clipboard-smoke-image',
          type: 'imageNode',
          position: { x: 720, y: 250 },
          data: {
            prompt: 'clipboard JPEG smoke fixture',
            imageModel: 'banana',
            aspectRatio: '1:1',
            imageSize: '1K',
            imageUrl: createSmokeJpegDataUrl(),
          },
        }],
        edges: [],
        assets: {},
      },
    }),
  });
  const created = await createResponse.json() as { project?: { id?: string } };
  const projectId = created.project?.id;
  if (!createResponse.ok || !projectId) {
    throw new Error(`QuickDraw smoke project creation failed with HTTP ${createResponse.status}`);
  }

  await window.loadURL(`${localUrl}/projects/${encodeURIComponent(projectId)}`);
  await waitForSmokePredicate(
    window,
    `[...document.querySelectorAll('button')].some((button) => button.textContent?.includes('绘制构图草图'))`,
    'QuickDraw smoke prompt node did not become ready'
  );
  await runApplicationSettingsSmokeTest(window);
  await runImageClipboardSmokeTest(window);
  await runImageRerunSmokeTest(window);
  await runPromptLibrarySmokeTest(localUrl, window);
  await runBananaModelSelectionSmokeTest(window);
  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('绘制构图草图'))
      ?.click()
  `);
  await waitForSmokePredicate(
    window,
    `document.querySelector('[data-sketch-editor-modal="true"] .qd-root')`,
    'QuickDraw smoke editor did not open'
  );

  const drawResult = await window.webContents.executeJavaScript(`(() => {
    const modal = document.querySelector('[data-sketch-editor-modal="true"]');
    const canvas = modal?.querySelector('.qd-canvas');
    if (!(canvas instanceof HTMLCanvasElement)) return { ok: false, reason: 'canvas missing' };
    const rect = canvas.getBoundingClientRect();
    const point = (type, x, y, buttons) => new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      pointerId: 77,
      pointerType: 'mouse',
      button: 0,
      buttons,
      pressure: buttons ? 0.5 : 0,
      clientX: rect.left + x,
      clientY: rect.top + y,
    });
    canvas.dispatchEvent(point('pointerdown', rect.width * 0.3, rect.height * 0.35, 1));
    canvas.dispatchEvent(point('pointermove', rect.width * 0.5, rect.height * 0.55, 1));
    canvas.dispatchEvent(point('pointermove', rect.width * 0.7, rect.height * 0.4, 1));
    canvas.dispatchEvent(point('pointerup', rect.width * 0.7, rect.height * 0.4, 0));
    return { ok: true };
  })()` ) as { ok: boolean; reason?: string };
  if (!drawResult.ok) throw new Error(`QuickDraw smoke draw failed: ${drawResult.reason ?? 'unknown'}`);

  await waitForSmokePredicate(
    window,
    `(() => { const button = [...document.querySelectorAll('[data-sketch-editor-modal="true"] button')].find((item) => item.textContent?.includes('应用为参考图')); return Boolean(button && !button.disabled); })()`,
    'QuickDraw smoke drawing did not enable apply'
  );

  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('[data-sketch-editor-modal="true"] button')]
      .find((button) => button.textContent?.includes('应用为参考图'))
      ?.click()
  `);
  await waitForSmokePredicate(
    window,
    `!document.querySelector('[data-sketch-editor-modal="true"]') && document.body.textContent?.includes('草图 · 1/1')`,
    'QuickDraw smoke sketch was not attached as a reference image'
  );

  await window.webContents.executeJavaScript(`
    [...document.querySelectorAll('button')]
      .find((button) => button.textContent?.includes('编辑构图草图'))
      ?.click()
  `);
  await waitForSmokePredicate(
    window,
    `(() => { const root = document.querySelector('[data-sketch-editor-modal="true"] .qd-root'); const button = [...document.querySelectorAll('[data-sketch-editor-modal="true"] button')].find((item) => item.textContent?.includes('应用为参考图')); return Boolean(root && button && !button.disabled); })()`,
    'QuickDraw smoke editable snapshot did not reopen'
  );
}

async function runSmokeTest(localUrl: string, window: BrowserWindow) {
  const [pageResponse, settingsResponse] = await Promise.all([
    fetch(localUrl),
    fetch(`${localUrl}/api/runtime-settings`),
  ]);
  const pageHtml = await pageResponse.text();
  const settings = await settingsResponse.json() as {
    autoLoad?: boolean;
    image2?: { model?: string };
  };

  if (!pageResponse.ok || !pageHtml.includes('<div id="root"></div>')) {
    throw new Error(`Desktop smoke page probe failed with HTTP ${pageResponse.status}`);
  }
  if (!settingsResponse.ok || settings.autoLoad !== true || settings.image2?.model !== 'gpt-image-2') {
    throw new Error(`Desktop smoke settings probe failed with HTTP ${settingsResponse.status}`);
  }

  await waitForSmokeRenderer(window);

  await runSketchSmokeTest(localUrl, window);

  console.info('[banana:smoke] page, settings/update UI, prompt library, image actions, Banana models, and QuickDraw probes passed');
}

async function ensureLocalServer() {
  if (serverHandle) return serverHandle;
  if (serverStartPromise) return serverStartPromise;

  const userDataDir = app.getPath('userData');
  const appRoot = getAppRoot();
  const envFilePath = ensureUserEnvFile(userDataDir, appRoot);
  const dataDir = path.join(userDataDir, 'data');
  const runtimeSecrets = safeStorage.isEncryptionAvailable()
    ? createElectronRuntimeSecretsStore(userDataDir)
    : undefined;
  if (runtimeSecrets) {
    migrateLegacyDesktopSecrets(envFilePath, runtimeSecrets);
  } else {
    logger({
      level: 'warn',
      message: 'System credential encryption is unavailable; desktop keys will use the legacy .env store.',
    });
  }

  serverStartPromise = startLocalServer({
    rootDir: appRoot,
    envFilePath,
    host: '127.0.0.1',
    port: 0,
    env: {
      NODE_ENV: 'production',
      BANANA_DATA_DIR: dataDir,
    },
    envFilePrecedence: 'file',
    repairInvalidEnvFile: true,
    runtimeSecrets,
    logger,
  });

  try {
    serverHandle = await serverStartPromise;
    return serverHandle;
  } finally {
    serverStartPromise = null;
  }
}

async function createMainWindow() {
  const localServer = await ensureLocalServer();

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    show: false,
    title: '香蕉画图',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  configureExternalNavigation(mainWindow, localServer.url);
  mainWindow.once('ready-to-show', () => {
    if (!isSmokeTest()) mainWindow?.show();
  });
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  await mainWindow.loadURL(localServer.url);

  if (isSmokeTest()) {
    await runSmokeTest(localServer.url, mainWindow);
    mainWindow.destroy();
    mainWindow = null;
    await localServer.close();
    serverHandle = null;
    app.quit();
  }
}

const hasSingleInstanceLock = app.requestSingleInstanceLock();

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (!mainWindow) return;
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.show();
    mainWindow.focus();
  });
}

if (hasSingleInstanceLock) app.whenReady().then(async () => {
  try {
    await createMainWindow();
    startDesktopUpdates();
  } catch (error) {
    const message = error instanceof Error ? error.stack || error.message : String(error);
    if (isSmokeTest()) {
      console.error('[banana:smoke] failed', message);
      app.exit(1);
      return;
    }
    console.error('[banana:startup] failed', message);
    const displayMessage = error instanceof Error ? error.message : String(error);
    dialog.showErrorBox('香蕉画图启动失败', displayMessage);
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    void createMainWindow();
  }
});

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', (event) => {
  updateManager?.stop();
  if (!serverHandle || isQuitting) return;

  event.preventDefault();
  isQuitting = true;
  serverHandle.close().finally(() => {
    serverHandle = null;
    app.quit();
  });
});
