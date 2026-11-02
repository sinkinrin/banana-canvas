import fs from 'node:fs';
import path from 'node:path';
import { app, dialog, type BrowserWindow } from 'electron';
import { appLog } from '../src/server/appLog';

export async function runDiagnosticsSmoke(window: BrowserWindow, wait: (window: BrowserWindow, source: string, message: string) => Promise<void>) {
  const initial = await window.webContents.executeJavaScript('bananaDesktop.diagnostics.state()');
  if (initial.mode !== 'normal') throw new Error('Fresh diagnostics mode must be normal');
  appLog('debug', 'main', 'smoke-hidden-debug');
  const hidden = await window.webContents.executeJavaScript("bananaDesktop.diagnostics.query({search:'smoke-hidden-debug'})");
  if (hidden.entries.length) throw new Error('Normal mode recorded debug');
  await window.webContents.executeJavaScript("bananaDesktop.diagnostics.setMode('debug')");
  appLog('debug', 'main', 'smoke-visible-debug');
  await wait(window, `Boolean(document.querySelector('[data-app-settings-entry="true"]'))`, 'Settings entry unavailable');
  await window.webContents.executeJavaScript(`document.querySelector('[data-app-settings-entry="true"]')?.click()`);
  await wait(window, `Boolean(document.querySelector('[data-settings-tab="logs"]'))`, 'Log settings tab missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-settings-tab="logs"]').click()`);
  await wait(window, `Boolean(document.querySelector('[data-log-list]')?.textContent.includes('smoke-visible-debug'))`, 'Log viewer did not show debug entry');
  await window.webContents.executeJavaScript(`document.querySelector('[data-log-pause]').click()`);
  appLog('info', 'settings', 'smoke-while-paused');
  await wait(window, `document.querySelector('[data-log-pause]')?.textContent === '跟随最新'`, 'Log viewer did not pause');
  const persisted = await window.webContents.executeJavaScript("bananaDesktop.diagnostics.query({search:'smoke-while-paused'})");
  if (!persisted.entries.length) throw new Error('Pausing viewer stopped recording');
  await window.webContents.executeJavaScript(`document.querySelector('[data-log-pause]').click()`);
  await wait(window, `Boolean(document.querySelector('[data-log-list]')?.textContent.includes('smoke-while-paused'))`, 'Log viewer did not resume');
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-log-search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'smoke-visible-debug');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  await wait(window, `document.querySelectorAll('[data-log-entry]').length === 1 && document.querySelector('[data-log-entry]')?.textContent.includes('smoke-visible-debug')`, 'Log search failed');
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[data-log-search]');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '');
    input.dispatchEvent(new Event('input', {bubbles: true}));
  })()`);
  await wait(window, `document.querySelectorAll('[data-log-entry]').length > 1`, 'Log search reset failed');
  const exportPath = path.join(app.getPath('userData'), 'diagnostics-export.log');
  const showSaveDialog = dialog.showSaveDialog;
  dialog.showSaveDialog = (async () => ({ canceled: false, filePath: exportPath })) as typeof dialog.showSaveDialog;
  try {
    if (!await window.webContents.executeJavaScript('bananaDesktop.diagnostics.exportLogs()')) throw new Error('Log export cancelled');
    const exported = fs.readFileSync(exportPath, 'utf8');
    if (!exported.includes('smoke-visible-debug') || !exported.includes('diagnosticEnvironment')) throw new Error('Log export missing evidence');
  } finally { dialog.showSaveDialog = showSaveDialog; }
  const screenshot = await window.capturePage();
  const screenshotDir = process.env.BANANA_SMOKE_SCREENSHOT_DIR || app.getPath('userData');
  fs.mkdirSync(screenshotDir, { recursive: true });
  fs.writeFileSync(path.join(screenshotDir, 'diagnostics-smoke.png'), screenshot.toPNG());
  await window.webContents.executeJavaScript(`document.querySelector('[data-settings-close]').click()`);
  console.info('[banana:smoke] logging levels, viewer pause/resume and persistence passed');
}
