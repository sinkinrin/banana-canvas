import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildGenerationReferenceData,
  buildImagePlaceholderData,
  buildPromptGenerationEdges,
  createPromptGenerationRunner,
} from './usePromptGeneration';

const referenceImage = { data: 'base64', mimeType: 'image/png', url: 'data:image/png;base64,base64' };

test('buildGenerationReferenceData prefers asset IDs over inline references', () => {
  assert.deepEqual(
    buildGenerationReferenceData({
      referenceImageIds: ['asset-1'],
      referenceImages: [referenceImage],
    }),
    { referenceImageIds: ['asset-1'] }
  );

  assert.deepEqual(
    buildGenerationReferenceData({
      referenceImageIds: [],
      referenceImages: [referenceImage],
    }),
    { referenceImages: [referenceImage] }
  );
});

test('buildImagePlaceholderData keeps model-specific options on generated placeholders', () => {
  assert.deepEqual(
    buildImagePlaceholderData({
      prompt: 'draw',
      imageModel: 'banana',
      imageModelLabel: 'Banana',
      aspectRatio: '1:1',
      imageSize: '1K',
      bananaOptions: { thinkingLevel: 'HIGH' },
      image2Options: { quality: 'high' },
      createdAt: '2026-04-27T00:00:00.000Z',
      referenceData: {},
    }),
    {
      prompt: 'draw',
      imageModel: 'banana',
      aspectRatio: '1:1',
      imageSize: '1K',
      bananaOptions: { thinkingLevel: 'HIGH' },
      image2Options: undefined,
      isLoading: true,
      error: undefined,
      createdAt: '2026-04-27T00:00:00.000Z',
      generationTitle: 'Banana | draw',
    }
  );
});

test('buildPromptGenerationEdges creates one edge per generated image node', () => {
  assert.deepEqual(
    buildPromptGenerationEdges('prompt-1', ['image-1', 'image-2']),
    [
      { id: 'e-prompt-1-image-1', source: 'prompt-1', target: 'image-1' },
      { id: 'e-prompt-1-image-2', source: 'prompt-1', target: 'image-2' },
    ]
  );
});

test('prompt generation runner ignores empty prompt without side effects', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      calls.push('generate');
      return 'data:image/png;base64,result';
    },
    addNode: () => {
      calls.push('add');
      return 'image-1';
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: '   ',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.deepEqual(calls, []);
});

test('prompt generation runner blocks concurrent runs', async () => {
  const calls: string[] = [];
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      calls.push('generate');
      await gate;
      return 'data:image/png;base64,result';
    },
    addNode: () => {
      calls.push('add');
      return 'image-1';
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  const first = runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });
  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw again',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });
  release();
  await first;

  assert.equal(calls.filter((call) => call === 'generate').length, 1);
});

test('prompt generation runner blocks pending reference hydration', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => 'data:image/png;base64,result',
    addNode: () => 'image-1',
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: ['asset-1'],
    referenceImages: [],
    hasPendingReferenceHydration: true,
    nodePosition: { x: 0, y: 0 },
  });

  assert.deepEqual(calls, ['update:prompt-1:{"error":"参考图仍在加载中，请稍候"}']);
});

test('prompt generation runner creates batch placeholders, edges, and final images', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async ({ prompt }) => `data:image/png;base64,${prompt}`,
    addNode: (_type, position, data) => {
      const id = `image-${calls.filter((call) => call.startsWith('add:')).length + 1}`;
      calls.push(`add:${id}:${position.x},${position.y}:${data.generationTitle}`);
      return id;
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.map((edge) => edge.target).join(',')}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 2,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 10, y: 20 },
  });

  assert.deepEqual(calls.slice(0, 4), [
    'commit',
    'update:prompt-1:{"isLoading":true}',
    'add:image-1:410,20:Banana | draw',
    'add:image-2:410,450:Banana | draw',
  ]);
  assert.ok(calls.includes('edges:image-1,image-2'));
  assert.ok(calls.some((call) => call.includes('"imageUrl":"data:image/png;base64,draw"')));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});

test('prompt generation runner resets and increments generatedCount progress per completed image', async () => {
  const progress: number[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async ({ prompt }) => `data:image/png;base64,${prompt}`,
    addNode: () => `image-${progress.length + 1}`,
    deleteNode: () => {},
    updateNodeData: () => {},
    setEdges: () => {},
    commitPrompt: () => {},
    now: () => '2026-04-27T00:00:00.000Z',
    onGeneratedCountChange: (count) => progress.push(count),
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 3,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.deepEqual(progress, [0, 1, 2, 3]);
});

test('prompt generation runner aborts the injected controller and passes its signal to generateImage', async () => {
  const controller = new AbortController();
  let abortCalled = false;
  const originalAbort = controller.abort.bind(controller);
  controller.abort = () => {
    abortCalled = true;
    originalAbort();
  };
  let receivedSignal: AbortSignal | undefined;
  let release!: () => void;
  const pending = new Promise<string>((resolve) => {
    release = () => resolve('data:image/png;base64,result');
  });
  const runner = createPromptGenerationRunner({
    generateImage: async ({ signal }) => {
      receivedSignal = signal;
      return pending;
    },
    addNode: () => 'image-1',
    deleteNode: () => {},
    updateNodeData: () => {},
    setEdges: () => {},
    commitPrompt: () => {},
    now: () => '2026-04-27T00:00:00.000Z',
    createAbortController: () => controller,
  });

  const runPromise = runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });
  await new Promise((resolve) => setTimeout(resolve, 0));

  runner.abort();
  release();
  await runPromise;

  assert.equal(abortCalled, true);
  assert.equal(receivedSignal, controller.signal);
  assert.equal(controller.signal.aborted, true);
});

test('prompt generation runner deletes placeholders on abort', async () => {
  const calls: string[] = [];
  const abortError = Object.assign(new Error('aborted'), { name: 'AbortError' });
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      throw abortError;
    },
    addNode: () => {
      calls.push('add:image-1');
      return 'image-1';
    },
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.ok(calls.includes('delete:image-1'));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});

test('prompt generation runner marks provider failures on placeholder and source node', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      throw new Error('provider failed');
    },
    addNode: () => 'image-1',
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.ok(calls.some((call) => call === 'update:image-1:{"isLoading":false,"error":"provider failed"}'));
  assert.ok(calls.some((call) => call === 'update:prompt-1:{"error":"provider failed"}'));
});

test('prompt generation runner handles invalid Banana key and always clears loading', async () => {
  const calls: string[] = [];
  const runner = createPromptGenerationRunner({
    generateImage: async () => {
      throw new Error('API key not valid. Please pass a valid API key.');
    },
    addNode: () => 'image-1',
    deleteNode: (nodeId) => calls.push(`delete:${nodeId}`),
    updateNodeData: (nodeId, patch) => calls.push(`update:${nodeId}:${JSON.stringify(patch)}`),
    setEdges: (edges) => calls.push(`edges:${edges.length}`),
    commitPrompt: () => calls.push('commit'),
    removeApiKey: (key) => calls.push(`remove-key:${key}`),
    openSelectKey: () => calls.push('open-key-picker'),
    now: () => '2026-04-27T00:00:00.000Z',
  });

  await runner.run({
    nodeId: 'prompt-1',
    prompt: 'draw',
    imageModel: 'banana',
    imageModelLabel: 'Banana',
    aspectRatio: '1:1',
    imageSize: '1K',
    batchCount: 1,
    referenceImageIds: [],
    referenceImages: [],
    hasPendingReferenceHydration: false,
    nodePosition: { x: 0, y: 0 },
  });

  assert.ok(calls.includes('remove-key:custom_gemini_api_key'));
  assert.ok(calls.includes('open-key-picker'));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});
