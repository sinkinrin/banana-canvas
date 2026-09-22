import { nativeImage, type BrowserWindow } from 'electron';

// Synthetic fixtures only; no user photos or provider credentials in smoke tests.
const CMYK_ORIENTED = '/9j/7gAOQWRvYmUAZAAAAAAA/+EAIkV4aWYAAE1NACoAAAAIAAEBEgADAAAAAQAGAAAAAAAA/9sAQwAIBgYHBgUIBwcHCQkICgwUDQwLCwwZEhMPFB0aHx4dGhwcICQuJyAiLCMcHCg3KSwwMTQ0NB8nOT04MjwuMzQy/8AAFAgAAwACBEMRAE0RAFkRAEsRAP/EAB8AAAEFAQEBAQEBAAAAAAAAAAABAgMEBQYHCAkKC//EALUQAAIBAwMCBAMFBQQEAAABfQECAwAEEQUSITFBBhNRYQcicRQygZGhCCNCscEVUtHwJDNicoIJChYXGBkaJSYnKCkqNDU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6g4SFhoeIiYqSk5SVlpeYmZqio6Slpqeoqaqys7S1tre4ubrCw8TFxsfIycrS09TV1tfY2drh4uPk5ebn6Onq8fLz9PX29/j5+v/aAA4EQwBNAFkASwAAPwD3+vn+vn+vf6//2Q==';
const PNG16 = 'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACEAAAAAAHTY67AAAAEklEQVR4nGNsYGBgYGJgYGAAAASeAISGqV6rAAAAAElFTkSuQmCC';
const TRANSPARENT_GIF = 'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

export async function runReferenceImageSmoke({ window, localUrl, imageUrl, flush, waitForPredicate }: {
  window: BrowserWindow; localUrl: string; imageUrl: string; flush: () => Promise<void>;
  waitForPredicate: (window: BrowserWindow, predicate: string, message: string) => Promise<void>;
}) {
  const jpeg = nativeImage.createFromDataURL(imageUrl).toJPEG(90);
  const mpo = Buffer.concat([jpeg.subarray(0, 2), Buffer.from([255,226,0,8,77,80,70,0,0,0]), jpeg.subarray(2), jpeg]);
  const created = await fetch(`${localUrl}/api/projects`, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({
    name:'Reference image compatibility smoke', snapshot:{nodes:[{id:'reference-prompt',type:'promptNode',position:{x:100,y:100},
      data:{prompt:'reference compatibility',imageModel:'image2'}}],edges:[],assets:{}},
  })}).then(response => response.json()) as {project:{id:string}};
  const url = `${localUrl}/projects/${created.project.id}`;
  await window.loadURL(url);
  await waitForPredicate(window, `!!document.querySelector('input[type="file"]')`, 'Reference upload input missing');
  await window.webContents.executeJavaScript(`(() => {
    globalThis.__referenceRequests = [];
    globalThis.__referenceReject = false;
    const original = globalThis.fetch;
    globalThis.fetch = async (input, init) => {
      if (String(input).includes('/api/generate-image')) {
        globalThis.__referenceRequests.push(JSON.parse(init.body));
        return new Response(JSON.stringify(globalThis.__referenceReject
          ? {code:'INVALID_REFERENCE_IMAGE',imageIndex:2,requestId:'smoke-request',error:'private upstream detail'}
          : {imageUrl:${JSON.stringify(imageUrl)}}), {status:globalThis.__referenceReject ? 422 : 200,headers:{'Content-Type':'application/json'}});
      }
      return original(input,init);
    };
    const fixtures = ${JSON.stringify([
      {name:'camera.mpo',mimeType:'image/mpo',data:mpo.toString('base64')},
      {name:'transparent.gif',mimeType:'image/gif',data:TRANSPARENT_GIF},
      {name:'print.jpg',mimeType:'image/jpeg',data:CMYK_ORIENTED},
      {name:'16bit.png',mimeType:'image/png',data:PNG16},
    ])};
    const transfer = new DataTransfer();
    for (const f of fixtures) transfer.items.add(new File([Uint8Array.from(atob(f.data),c=>c.charCodeAt(0))],f.name,{type:f.mimeType}));
    const input = document.querySelector('input[type="file"]');
    input.files = transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  })()`);
  await waitForPredicate(window, `document.querySelectorAll('.react-flow__node-promptNode img').length === 4`, 'Reference files not loaded');
  const generate = `(() => { const b = [...document.querySelectorAll('.react-flow__node-promptNode button')].find(b=>b.textContent.includes('生成图像')); if (!b || b.disabled) throw Error('Generate unavailable'); b.click(); })()`;
  await window.webContents.executeJavaScript(generate);
  await waitForPredicate(window, `globalThis.__referenceRequests.length === 1 && document.querySelector('.react-flow__node-imageNode img')`, 'Prepared references did not generate');
  const references = await window.webContents.executeJavaScript(`globalThis.__referenceRequests[0].referenceImages`) as Array<{data:string;mimeType:string}>;
  if (references[0].data !== jpeg.toString('base64') || references[0].mimeType !== 'image/jpeg') throw new Error('MPO primary extraction was not lossless');
  if (references.slice(1).some(image => image.mimeType !== 'image/png')) throw new Error('Special formats were not converted');
  const transparent = nativeImage.createFromBuffer(Buffer.from(references[1].data,'base64')).toBitmap();
  if (transparent[3] !== 0) throw new Error('GIF transparency was lost');
  const convertedCmyk = nativeImage.createFromBuffer(Buffer.from(references[2].data,'base64'));
  if (convertedCmyk.getSize().width !== 3 || convertedCmyk.getSize().height !== 2) throw new Error('EXIF orientation was lost');
  const pixels = convertedCmyk.toBitmap();
  if (pixels[2] < 200 || pixels[0] > 30 || pixels[1] > 30) throw new Error('CMYK red did not convert to RGB red');
  await flush();
  const saved = await fetch(`${localUrl}/api/projects/${created.project.id}`).then(response=>response.json());
  if (!JSON.stringify(saved).includes(mpo.toString('base64'))) throw new Error('Original MPO was replaced in project storage');
  await window.webContents.executeJavaScript(`globalThis.__referenceReject = true;`);
  await window.webContents.executeJavaScript(generate);
  await waitForPredicate(window, `document.body.textContent.includes('服务端不支持第 2 张参考图') && !document.body.textContent.includes('private upstream detail')`, 'Safe specific image error missing');
  await flush();
  await window.loadURL(localUrl);
  console.info('[banana:smoke] reference MPO lossless extraction, first-frame alpha, CMYK/orientation, 16-bit PNG, original persistence and specific errors passed');
}
