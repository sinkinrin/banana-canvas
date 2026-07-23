import fs from 'node:fs';
import path from 'node:path';
import { app, BrowserWindow, dialog, safeStorage, shell } from 'electron';
import { startLocalServer, type LocalServerHandle } from '../src/server/startLocalServer';
import type { RuntimeConfigLogger } from '../src/server/runtimeConfig';
import { isAllowedExternalUrl, isInternalAppUrl } from '../src/lib/electronNavigation';
import {
  removeDotEnvKeys,
  type RuntimeSettingsSecretStore,
  type RuntimeSettingsSecretValues,
} from '../src/server/runtimeSettings';

let mainWindow: BrowserWindow | null = null;
let serverHandle: LocalServerHandle | null = null;
let serverStartPromise: Promise<LocalServerHandle> | null = null;
let isQuitting = false;

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

  console.info('[banana:smoke] page, runtime settings, and renderer probes passed');
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
  if (!serverHandle || isQuitting) return;

  event.preventDefault();
  isQuitting = true;
  serverHandle.close().finally(() => {
    serverHandle = null;
    app.quit();
  });
});
