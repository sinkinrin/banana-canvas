import type { BrowserWindow } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

export async function runLayoutSmoke({ window, localUrl, imageUrl, flush, waitForPredicate }: {
  window: BrowserWindow; localUrl: string; imageUrl: string; flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  const response = await fetch(`${localUrl}/api/projects`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Layout and categories smoke', snapshot: {
    nodes: [{ id: 'layout-prompt', type: 'promptNode', position: { x: 100, y: 100 }, data: { prompt: 'layout fixture', imageModel: 'image2', aspectRatio: '16:9', imageSize: '2K', batchCount: 2, officialImageOptions: { n: 3, safetyIdentifier: 'layout-saved-setting' } } },
      { id: 'layout-image', type: 'imageNode', position: { x: 700, y: 100 }, data: { imageUrl, generationMode: 'mask-edit', sourceImage: { url: imageUrl, data: imageUrl.split(',')[1], mimeType: 'image/jpeg' }, prompt: 'Layout comparison '.repeat(20) } }], edges: [], assets: {},
  } }) });
  const created = await response.json() as { project?: { id?: string } };
  if (!response.ok || !created.project?.id) throw new Error('Layout smoke fixture failed');
  const projectUrl = `${localUrl}/projects/${created.project.id}?lng=zh-CN`;
  await window.loadURL(projectUrl);
  const wait = (predicate: string, message: string) => waitForPredicate(window, predicate, message);
  const screenshot = async (name: string) => {
    const directory = process.env.BANANA_LAYOUT_SCREENSHOT_DIR;
    if (!directory) return;
    await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
    fs.mkdirSync(directory, { recursive: true });
    fs.writeFileSync(path.join(directory, `${name}.png`), (await window.webContents.capturePage()).toPNG());
  };
  await wait(`!!document.querySelector('[data-compare-models]')`, 'Layout fixture did not render');
  await window.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
  await wait(`(() => {
    const node = document.querySelector('[data-prompt-node-id="layout-prompt"]');
    const model = node.querySelector('[name="imageModel"]').getBoundingClientRect();
    const generate = node.querySelector('[data-generate-image]').getBoundingClientRect();
    const compare = node.querySelector('[data-compare-models]').getBoundingClientRect();
    const advanced = node.querySelector('[data-advanced-options]');
    return node.offsetWidth === 400 && node.offsetHeight < 760 && node.scrollWidth <= node.clientWidth
      && model.height > 0 && model.bottom < generate.top && generate.bottom < compare.top && !advanced.open
      && !node.querySelector('[data-generate-image]').textContent.includes('Image2');
  })()`, 'Common settings, compact width, collapsed options or action hierarchy is incorrect');
  await screenshot('prompt-default');
  const select = async (name: string, value: string) => {
    await window.webContents.executeJavaScript(`(() => {
      const input = document.querySelector('select[name="' + ${JSON.stringify(name)} + '"]');
      input.value = ${JSON.stringify(value)}; input.dispatchEvent(new Event('change', { bubbles: true }));
    })()`);
  };
  await select('imageModel', 'banana-2.1');
  await wait(`!!document.querySelector('[data-advanced-options="banana"]')`, 'Banana options missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-advanced-options="banana"] summary').click()`);
  await select('bananaThinkingLevel', 'HIGH');
  await wait(`document.querySelector('[data-advanced-options="banana"] summary').textContent.includes('high')
    && document.querySelector('[name="bananaThinkingLevel"]').getBoundingClientRect().height > 0`, 'Banana thinking choice or collapsed summary is missing');
  await screenshot('prompt-banana-thinking');
  await window.webContents.executeJavaScript(`document.querySelector('[data-options-body="banana"] button[popovertarget]').click()`);
  await wait(`!!document.querySelector('[popover]:popover-open')`, 'Parameter help did not open above the scrolling options');
  await window.webContents.executeJavaScript(`document.querySelector('[popover]:popover-open button').click()`);
  await wait(`!document.querySelector('[popover]:popover-open')`, 'Parameter help did not close');

  await select('imageModel', 'openai-image2.6-sunburst');
  await wait(`!!document.querySelector('[data-generation-count="6"][aria-pressed="true"]')
    && document.querySelector('[data-advanced-options="official-images"] summary').textContent.includes('已启用高级配置')`, 'Legacy total count or saved advanced settings are hidden');
  await window.webContents.executeJavaScript(`document.querySelector('[data-generation-count="4"]').click(); document.querySelector('[data-advanced-options="official-images"] summary').click()`);
  await wait(`document.querySelector('[data-generation-count="4"]')?.getAttribute('aria-pressed') === 'true'`, 'Total image count was multiplied again');
  await select('officialImage.quality', 'max');
  await select('officialImage.outputFormat', 'jpeg');
  await select('officialImage.background', 'transparent');
  await wait(`document.querySelector('[name="officialImage.outputFormat"]').value === 'png'`, 'Transparent background did not choose a compatible output format');
  await select('aspectRatio', 'custom');
  await wait(`!!document.querySelector('[name="officialImage.size"]') && document.querySelector('[name="imageSize"]').disabled`, 'Custom size conflicts with canvas presets');
  await select('aspectRatio', '16:9');
  await wait(`!document.querySelector('[name="officialImage.size"]') && !document.querySelector('[name="imageSize"]').disabled`, 'Returning to presets did not clear custom size');
  await window.webContents.executeJavaScript(`document.querySelector('[data-official-technical] summary').click()`);
  await wait(`(() => {
    const body = document.querySelector('[data-options-body="official-images"]');
    const node = document.querySelector('[data-prompt-node-id="layout-prompt"]');
    return body.clientHeight <= 320 && body.scrollHeight > body.clientHeight && body.scrollWidth <= body.clientWidth
      && node.scrollWidth <= node.clientWidth && !document.querySelector('[name="officialImage.n"]');
  })()`, 'Expanded technical settings overflow the node or expose duplicate count controls');
  await screenshot('prompt-official-advanced');
  await window.webContents.executeJavaScript(`document.querySelector('[data-advanced-options="official-images"] summary').click()`);

  await window.webContents.executeJavaScript(`document.querySelector('[data-node-category="layout-prompt"]').click()`);
  await wait(`!!document.querySelector('[data-assign-category]')`, 'Category picker missing');
  await window.webContents.executeJavaScript(`document.querySelector('[data-assign-category="#3b82f6"]').click()`);
  await wait(`!!document.querySelector('[role="dialog"] input:not(:disabled)')`, 'Assigned category cannot be named');
  await window.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('[role="dialog"] input:not(:disabled)');
    input.focus(); input.value = '产品 A'; input.blur();
  })()`);
  await wait(`document.querySelector('[data-node-category="layout-prompt"]').textContent.includes('产品 A')`, 'Category name did not update');
  await screenshot('categories');
  await window.webContents.executeJavaScript(`document.querySelector('[role="dialog"] header button').click(); document.querySelector('[data-category-panel] > button').click()`);
  await wait(`document.querySelector('[data-locate-category="#3b82f6"]')?.textContent.includes('产品 A')`, 'Category count/locator missing');
  await flush();
  await window.loadURL(projectUrl);
  await wait(`document.querySelector('[data-node-category="layout-prompt"]')?.textContent.includes('产品 A')`, 'Category did not survive project reload');
  await wait(`document.querySelector('[data-generation-count="4"]')?.getAttribute('aria-pressed') === 'true'
    && document.querySelector('[name="officialImage.quality"]').value === 'max'
    && document.querySelector('[name="officialImage.background"]').value === 'transparent'
    && document.querySelector('input[value="layout-saved-setting"]')
    && !document.querySelector('[data-advanced-options]').open`, 'Prompt settings did not survive project reload');


  const contentSize = window.getContentSize();
  const minimumSize = window.getMinimumSize();
  window.setMinimumSize(360, 360);
  try {
    for (const [width, height] of [[1280, 800], [800, 600], [480, 480]]) {
      window.setContentSize(width, height);
      await window.webContents.executeJavaScript(`document.querySelector('[data-app-settings-entry]').click()`);
      await wait(`!!document.querySelector('[data-settings-actions]')`, 'Settings actions missing');
      await window.webContents.executeJavaScript(`document.querySelector('[data-settings-body] details').open = true`);
      await wait(`(() => {
        const body = document.querySelector('[data-settings-body]');
        const footer = document.querySelector('[data-settings-actions]');
        const box = footer.getBoundingClientRect();
        const button = footer.querySelector('button:last-child');
        const rect = button.getBoundingClientRect();
        return body.scrollHeight > body.clientHeight && box.top >= 0 && box.bottom <= innerHeight && button.contains(document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2));
      })()`, `Settings save button clipped at ${width}x${height}`);
      await screenshot(`settings-${width}`);
      await window.webContents.executeJavaScript(`document.querySelector('[data-settings-body]').scrollTop = 99999`);
      await wait(`document.querySelector('[data-settings-actions]').getBoundingClientRect().bottom <= innerHeight`, 'Scrolling moved settings footer');
      await window.webContents.executeJavaScript(`document.querySelector('[data-settings-tab="updates"]').click()`);
      await wait(`(() => { const box = document.querySelector('[data-update-actions]')?.getBoundingClientRect(); return box && box.top >= 0 && box.bottom <= innerHeight; })()`, `Update actions clipped at ${width}x${height}`);
      await screenshot(`updates-${width}`);
      await window.webContents.executeJavaScript(`document.querySelector('[data-settings-close]').click(); document.querySelector('[data-compare-models]').click()`);
      await wait(`(() => { const modal = document.querySelector('[data-model-comparison]'); const box = modal?.querySelector('footer')?.getBoundingClientRect(); return box && box.top >= 0 && box.bottom <= innerHeight && Math.round(modal.getBoundingClientRect().width) <= 896; })()`, `Comparison action clipped at ${width}x${height}`);
      await screenshot(`comparison-${width}`);
      await window.webContents.executeJavaScript(`document.querySelector('[data-model-comparison] header button').click()`);
      await window.webContents.executeJavaScript(`document.querySelector('[data-image-node-id="layout-image"] button[title="对比原图和新图"]').click()`);
      await wait(`(() => { const button = [...document.querySelectorAll('button')].find(item => item.textContent.includes('继续编辑新图')); const box = button?.getBoundingClientRect(); return box && box.top >= 0 && box.bottom <= innerHeight; })()`, `Mask comparison action clipped at ${width}x${height}`);
      await screenshot(`mask-comparison-${width}`);
      await window.webContents.executeJavaScript(`[...document.querySelectorAll('button')].find(item => item.textContent.includes('继续编辑新图')).click()`);
      await wait(`(() => {
        const box = document.querySelector('aside > button')?.getBoundingClientRect();
        const preview = document.querySelector('[data-mask-preview]');
        const image = preview?.querySelector('img');
        const frame = preview?.getBoundingClientRect();
        const rect = image?.getBoundingClientRect();
        return box && box.top >= 0 && box.bottom <= innerHeight && image.naturalWidth === 640 && rect.height > 50 && rect.top >= frame.top && rect.bottom <= frame.bottom + 1 && Math.abs(rect.width / rect.height - 4 / 3) < 0.02;
      })()`, `Mask action or source image clipped at ${width}x${height}`);
      await screenshot(`mask-editor-${width}`);
      await window.webContents.executeJavaScript(`document.querySelector('button[title="关闭"]').click()`);
    }
  } finally {
    window.setMinimumSize(minimumSize[0], minimumSize[1]);
    window.setContentSize(contentSize[0], contentSize[1]);
  }
  console.info('[banana:smoke] category assignment/name/reload and fixed actions at 1280x800, 800x600, 480x480 passed');
}
