import test from 'node:test';
import assert from 'node:assert/strict';

import { copyImageToClipboard, copyTextToClipboard, inferImageMimeTypeFromUrl } from './clipboard';

test('inferImageMimeTypeFromUrl reads data URL MIME types', () => {
  assert.equal(inferImageMimeTypeFromUrl('data:image/webp;base64,abc'), 'image/webp');
});

test('inferImageMimeTypeFromUrl falls back from file extensions', () => {
  assert.equal(inferImageMimeTypeFromUrl('https://example.com/file.jpg?token=1'), 'image/jpeg');
  assert.equal(inferImageMimeTypeFromUrl('https://example.com/file.webp'), 'image/webp');
  assert.equal(inferImageMimeTypeFromUrl('https://example.com/file'), 'image/png');
});

test('copyImageToClipboard starts clipboard write before image fetch resolves', async () => {
  let resolveFetch!: (response: Response) => void;
  const fetchStarted = new Promise<Response>((resolve) => {
    resolveFetch = resolve;
  });
  let writeCalled = false;
  const writtenItems: unknown[] = [];

  class FakeClipboardItem {
    readonly items: Record<string, Promise<Blob>>;

    constructor(items: Record<string, Promise<Blob>>) {
      this.items = items;
    }
  }

  const copyPromise = copyImageToClipboard('data:image/png;base64,abc', {
    fetcher: async () => await fetchStarted,
    clipboard: {
      async write(items) {
        writeCalled = true;
        writtenItems.push(...items);
      },
    },
    clipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
  });

  await Promise.resolve();
  assert.equal(writeCalled, true);

  resolveFetch(new Response(new Blob(['image-bytes'], { type: 'image/png' })));
  await copyPromise;

  assert.equal(writtenItems.length, 1);
});

test('copyImageToClipboard advertises PNG and converts fetched non-PNG blobs', async () => {
  const jpegBlob = new Blob(['jpeg-bytes'], { type: 'image/jpeg' });
  const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
  const writtenItems: FakeClipboardItem[] = [];
  const convertedTypes: string[] = [];

  class FakeClipboardItem {
    readonly items: Record<string, Promise<Blob>>;

    constructor(items: Record<string, Promise<Blob>>) {
      this.items = items;
    }
  }

  await copyImageToClipboard('https://example.com/generated-image', {
    fetcher: async () => new Response(jpegBlob),
    clipboard: {
      async write(items) {
        writtenItems.push(...items as unknown as FakeClipboardItem[]);
      },
    },
    clipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    convertBlobToPng: async (blob) => {
      convertedTypes.push(blob.type);
      return pngBlob;
    },
  });

  assert.equal(writtenItems.length, 1);
  assert.deepEqual(Object.keys(writtenItems[0].items), ['image/png']);
  assert.equal(await writtenItems[0].items['image/png'], pngBlob);
  assert.deepEqual(convertedTypes, ['image/jpeg']);
});

test('copyImageToClipboard converts unknown-type blobs when the URL does not explicitly identify PNG', async () => {
  const unknownBlob = new Blob(['unknown-image-bytes']);
  const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
  const convertedTypes: string[] = [];

  class FakeClipboardItem {
    constructor(readonly items: Record<string, Promise<Blob>>) {}
  }

  await copyImageToClipboard('https://example.com/generated-image?token=1', {
    fetcher: async () => new Response(unknownBlob),
    clipboard: {
      async write(items) {
        await (items[0] as unknown as FakeClipboardItem).items['image/png'];
      },
    },
    clipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    convertBlobToPng: async (blob) => {
      convertedTypes.push(blob.type);
      return pngBlob;
    },
  });

  assert.deepEqual(convertedTypes, ['']);
});

test('copyImageToClipboard converts unknown-type blobs even when the URL has a PNG extension', async () => {
  const unknownBlob = new Blob(['unknown-image-bytes']);
  const pngBlob = new Blob(['png-bytes'], { type: 'image/png' });
  const convertedTypes: string[] = [];

  class FakeClipboardItem {
    constructor(readonly items: Record<string, Promise<Blob>>) {}
  }

  await copyImageToClipboard('https://example.com/generated-image.png', {
    fetcher: async () => new Response(unknownBlob),
    clipboard: {
      async write(items) {
        await (items[0] as unknown as FakeClipboardItem).items['image/png'];
      },
    },
    clipboardItem: FakeClipboardItem as unknown as typeof ClipboardItem,
    convertBlobToPng: async (blob) => {
      convertedTypes.push(blob.type);
      return pngBlob;
    },
  });

  assert.deepEqual(convertedTypes, ['']);
});

test('copyTextToClipboard waits for clipboard writeText', async () => {
  const calls: string[] = [];

  await copyTextToClipboard('prompt', {
    clipboard: {
      async writeText(text) {
        calls.push(text);
      },
    },
  });

  assert.deepEqual(calls, ['prompt']);
});
