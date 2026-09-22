import { useStore } from '../../store';
import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createMaskGenerationRunner,
  buildImageMaskGenerationPayload,
  buildPromptMaskGenerationPayload,
} from './useMaskGeneration';

const sourceImage = { data: 'source', mimeType: 'image/png', url: 'data:image/png;base64,source' };
const extraImage = { data: 'extra', mimeType: 'image/png', url: 'data:image/png;base64,extra' };
const maskImage = { data: 'mask', mimeType: 'image/png' } as const;

test('both mask entry points preserve Image 2.5 while Banana keeps its Image2 fallback', () => {
  for (const imageModel of ['image2.5-flare', 'image2.5-sunburst', 'banana'] as const) {
    const input = { imageModel, maskPrompt: 'blue star', maskImage, sourceImage, image2Options: { background: 'transparent' as const }, aspectRatio: '1:1' as const, imageSize: '1K' as const };
    const expected = imageModel === 'banana' ? 'image2' : imageModel;
    assert.equal(buildImageMaskGenerationPayload(input).imageModel, expected);
    assert.equal(buildPromptMaskGenerationPayload({ ...input, sourceIndex: 0, referenceImages: [sourceImage] }).imageModel, expected);
  }
});

test('prompt mask generation places source image first and excludes edited reference duplicate', () => {
  assert.deepEqual(
    buildPromptMaskGenerationPayload({
      maskPrompt: '改帽子',
      maskImage,
      sourceImage,
      sourceIndex: 0,
      referenceImages: [sourceImage, extraImage],
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: { quality: 'high' },
    }),
    {
      prompt: '改帽子',
      imageModel: 'image2',
      aspectRatio: '1:1',
      imageSize: '1K',
      image2Options: { quality: 'high' },
      referenceImages: [
        { data: 'source', mimeType: 'image/png' },
        { data: 'extra', mimeType: 'image/png' },
      ],
      maskImage,
    }
  );
});

test('image mask generation uses only the edited image as reference', () => {
  assert.deepEqual(
    buildImageMaskGenerationPayload({
      maskPrompt: '改帽子',
      maskImage,
      sourceImage,
      aspectRatio: '16:9',
      imageSize: '2K',
      image2Options: { responseFormat: 'url' },
    }),
    {
      prompt: '改帽子',
      imageModel: 'image2',
      aspectRatio: '16:9',
      imageSize: '2K',
      image2Options: { responseFormat: 'url' },
      referenceImages: [{ data: 'source', mimeType: 'image/png' }],
      maskImage,
    }
  );
});


test('mask tasks abort on deletion, project switching, and component exit', async () => {
  for (const action of ['delete-source', 'delete-result', 'switch', 'unmount']) {
    const nodes = ['source', 'result'].map(id => ({ id, type: 'imageNode', position: { x: 0, y: 0 }, data: {} }));
    useStore.getState().hydrateProject({ nodes, edges: [], assets: {} });
    let signal: AbortSignal | undefined;
    let finish!: () => void;
    const runner = createMaskGenerationRunner('source', async input => {
      signal = input.signal;
      // Simulate a provider that returns a late result even after cancellation.
      await new Promise<void>(resolve => { finish = resolve; });
      return { imageUrl: 'data:image/png;base64,aGVsbG8=' };
    });
    const result = runner.run({ prompt: 'mask', imageModel: 'image2' }, 'result');
    if (action === 'delete-source') useStore.getState().deleteNode('source');
    if (action === 'delete-result') useStore.getState().deleteNode('result');
    if (action === 'switch') useStore.getState().hydrateProject({ nodes, edges: [], assets: {} });
    if (action === 'unmount') runner.abort();
    assert.equal(signal?.aborted, true, action);
    finish();
    await assert.rejects(result, { name: 'AbortError' });
  }
});
