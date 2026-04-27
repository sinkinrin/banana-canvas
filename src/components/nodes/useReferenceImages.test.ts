import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAddReferenceImagePatch,
  buildRemoveReferenceImagePatch,
  canAddReferenceImage,
  createReferenceImageController,
  extractPasteImageFiles,
  parseImageDataUrl,
  selectImageFiles,
} from './useReferenceImages';

const image = { data: 'base64', mimeType: 'image/png', url: 'data:image/png;base64,base64' };
const secondImage = { data: 'second', mimeType: 'image/png', url: 'data:image/png;base64,second' };
const thirdImage = { data: 'third', mimeType: 'image/webp', url: 'data:image/webp;base64,third' };

test('canAddReferenceImage enforces hydration and four-image limit', () => {
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: true, referenceCount: 0 }), false);
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: false, referenceCount: 4 }), false);
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: false, referenceCount: 3 }), true);
});

test('selectImageFiles keeps only image files and respects remaining slots', () => {
  const png = { type: 'image/png', name: 'a.png' } as File;
  const jpg = { type: 'image/jpeg', name: 'b.jpg' } as File;
  const text = { type: 'text/plain', name: 'notes.txt' } as File;

  assert.deepEqual(selectImageFiles([png, text, jpg], { currentCount: 3, maxCount: 4 }), [png]);
  assert.deepEqual(selectImageFiles([png, jpg], { currentCount: 4, maxCount: 4 }), []);
});

test('extractPasteImageFiles reads image files from clipboard items without DOM dependencies', () => {
  const png = { type: 'image/png', name: 'paste.png' } as File;
  const files = extractPasteImageFiles({
    items: [
      { kind: 'string', type: 'text/plain', getAsFile: () => null },
      { kind: 'file', type: 'image/png', getAsFile: () => png },
    ],
  });

  assert.deepEqual(files, [png]);
});

test('parseImageDataUrl returns inline image data without FileReader', () => {
  assert.deepEqual(
    parseImageDataUrl('data:image/png;base64,abc123'),
    { mimeType: 'image/png', data: 'abc123', url: 'data:image/png;base64,abc123' }
  );
  assert.throws(() => parseImageDataUrl('not-a-data-url'), /Invalid image format/);
});

test('reference image controller upload and paste read through injected reader and patch node data', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'upload.png' } as File;
  const paste = { type: 'image/jpeg', name: 'paste.jpg' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  const uploadEvent = { target: { files: [png], value: 'selected' } };
  await controller.handleImageUpload(uploadEvent);

  let prevented = false;
  await controller.handlePaste({
    clipboardData: { items: [{ kind: 'file', type: 'image/jpeg', getAsFile: () => paste }] },
    preventDefault: () => {
      prevented = true;
    },
  });

  assert.equal(uploadEvent.target.value, '');
  assert.equal(prevented, true);
  assert.deepEqual(patches, [
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{ data: 'upload.png', mimeType: 'image/png', url: 'data:image/png;base64,upload.png' }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
    {
      nodeId: 'prompt-1',
      patch: {
        referenceImages: [{ data: 'paste.jpg', mimeType: 'image/jpeg', url: 'data:image/jpeg;base64,paste.jpg' }],
        referenceImageIds: undefined,
        referenceImage: undefined,
      },
    },
  ]);
});

test('reference image controller accumulates multiple uploaded files with existing inline references', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'second' } as File;
  const webp = { type: 'image/webp', name: 'third' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [image] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  await controller.handleImageUpload({ target: { files: [png, webp], value: 'selected' } });

  assert.deepEqual(patches.at(-1), {
    nodeId: 'prompt-1',
    patch: {
      referenceImages: [image, secondImage, thirdImage],
      referenceImageIds: undefined,
      referenceImage: undefined,
    },
  });
});

test('reference image controller accumulates multiple uploaded files with existing asset references', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const png = { type: 'image/png', name: 'second' } as File;
  const webp = { type: 'image/webp', name: 'third' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImageIds: ['asset-1'] } as any,
    assets: {
      'asset-1': { id: 'asset-1', data: 'base64', mimeType: 'image/png' },
    },
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    readImageFile: async (file) => ({
      data: file.name,
      mimeType: file.type,
      url: `data:${file.type};base64,${file.name}`,
    }),
  });

  await controller.handleImageUpload({ target: { files: [png, webp], value: 'selected' } });

  assert.deepEqual(patches.at(-1), {
    nodeId: 'prompt-1',
    patch: {
      referenceImageIds: ['asset-1'],
      referenceImages: [secondImage, thirdImage],
      referenceImage: undefined,
    },
  });
});

test('reference image controller reports injected read failures without storing node errors and recovers on later reads', async () => {
  const patches: Array<{ nodeId: string; patch: unknown }> = [];
  const readErrors: string[] = [];
  const broken = { type: 'image/png', name: 'broken.png' } as File;
  const good = { type: 'image/png', name: 'good.png' } as File;
  const controller = createReferenceImageController({
    nodeId: 'prompt-1',
    data: { referenceImages: [] } as any,
    assets: {},
    assetsHydrated: true,
    updateNodeData: (nodeId, patch) => patches.push({ nodeId, patch }),
    onReadError: (message) => readErrors.push(message),
    readImageFile: async (file) => {
      if (file.name === 'broken.png') throw new Error('read failed');
      return {
        data: file.name,
        mimeType: file.type,
        url: `data:${file.type};base64,${file.name}`,
      };
    },
  });

  const failedUploadEvent = { target: { files: [broken], value: 'selected' } };
  await controller.handleImageUpload(failedUploadEvent);

  const successfulUploadEvent = { target: { files: [good], value: 'selected' } };
  await controller.handleImageUpload(successfulUploadEvent);

  assert.equal(failedUploadEvent.target.value, '');
  assert.equal(successfulUploadEvent.target.value, '');
  assert.deepEqual(readErrors, ['read failed']);
  assert.equal(patches.some(({ patch }) => 'error' in (patch as Record<string, unknown>)), false);
  assert.deepEqual(patches, [{
    nodeId: 'prompt-1',
    patch: {
      referenceImages: [{ data: 'good.png', mimeType: 'image/png', url: 'data:image/png;base64,good.png' }],
      referenceImageIds: undefined,
      referenceImage: undefined,
    },
  }]);
});

test('asset-backed reference add preserves referenceImageIds precedence and stores new inline image', () => {
  assert.deepEqual(
    buildAddReferenceImagePatch({
      usesReferenceImageIds: true,
      referenceImageIds: ['asset-1'],
      referenceImages: [],
      nextImage: image,
    }),
    {
      referenceImageIds: ['asset-1'],
      referenceImages: [image],
      referenceImage: undefined,
    }
  );
});

test('inline reference add appends and caps at four', () => {
  const existing = [image, image, image, image];
  assert.deepEqual(
    buildAddReferenceImagePatch({
      usesReferenceImageIds: false,
      referenceImageIds: [],
      referenceImages: existing,
      nextImage: image,
    }),
    {
      referenceImages: existing,
      referenceImageIds: undefined,
      referenceImage: undefined,
    }
  );
});

test('remove reference image handles asset-backed and inline references', () => {
  assert.deepEqual(
    buildRemoveReferenceImagePatch({
      usesReferenceImageIds: true,
      referenceImageIds: ['a', 'b'],
      referenceImages: [],
      index: 0,
    }),
    {
      referenceImageIds: ['b'],
      referenceImages: undefined,
      referenceImage: undefined,
    }
  );

  assert.deepEqual(
    buildRemoveReferenceImagePatch({
      usesReferenceImageIds: false,
      referenceImageIds: [],
      referenceImages: [image, { ...image, data: 'second' }],
      index: 1,
    }),
    {
      referenceImages: [image],
      referenceImageIds: undefined,
      referenceImage: undefined,
    }
  );
});

test('add and remove patches are blocked by pending hydration through canAddReferenceImage', () => {
  assert.equal(canAddReferenceImage({ hasPendingReferenceHydration: true, referenceCount: 1 }), false);
});
