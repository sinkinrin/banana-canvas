import test from 'node:test';
import assert from 'node:assert/strict';
import { cancelGenerationTask } from '../../lib/generationTasks';

import {
  buildGenerationReferenceData,
  buildImagePlaceholderData,
  buildPromptGenerationEdges,
  createPromptGenerationRunner,
} from './usePromptGeneration';

const referenceImage = { data: 'base64', mimeType: 'image/png', url: 'data:image/png;base64,base64' };

test('stopping one comparison task aborts only its request and discards late results', async () => {
  for (const lateResult of [false, true]) {
    const nodes: Record<string, any> = {};
    const requests: Array<{ signal: AbortSignal; finish: () => void }> = [];
    let count = 0;
    const runner = createPromptGenerationRunner({
      generateImage: ({ signal }) => new Promise((resolve, reject) => {
        requests.push({ signal: signal!, finish: () => resolve('data:image/png;base64,result') });
        if (!lateResult) signal!.addEventListener('abort', () => reject(new DOMException('Stopped', 'AbortError')), { once: true });
      }),
      addNode: (_type, _position, data) => { const id = `cancel-${count++}`; nodes[id] = data; return id; },
      updateNodeData: (id, patch) => { nodes[id] = { ...nodes[id], ...patch }; },
      deleteNode: id => { delete nodes[id]; }, setEdges: () => {}, commitPrompt: () => {}, now: () => '2026-09-23T00:00:00Z',
    });
    const run = runner.run({ nodeId: 'parent', prompt: 'same input', imageModel: 'image2', imageModelLabel: 'Image2', aspectRatio: '1:1', imageSize: '1K', batchCount: 2,
      comparisonModels: ['banana', 'image2.5-flare'], comparisonGroupId: 'pair', referenceImageIds: [], referenceImages: [], hasPendingReferenceHydration: false });
    assert.equal(requests.length, 2);
    cancelGenerationTask('cancel-0');
    assert.equal(requests[0].signal.aborted, true);
    assert.equal(requests[1].signal.aborted, false);
    assert.equal(runner.abortController?.signal.aborted, false);
    requests.forEach(request => request.finish());
    await run;
    assert.equal(nodes['cancel-0'], undefined);
    assert.equal(nodes['cancel-1'].imageUrl, 'data:image/png;base64,result');
    assert.equal(nodes.parent.isLoading, false);
    assert.equal(nodes.parent.error, undefined);
    cancelGenerationTask('cancel-1');
    assert.equal(requests[1].signal.aborted, false, 'completed task registration is cleaned up');
  }
});

test('multi-model comparison shares input, places results side by side and isolates failures', async () => {
  const nodes: Record<string, { position: { x: number; y: number }; data: any }> = {};
  const requests: any[] = [];
  let count = 0;
  const runner = createPromptGenerationRunner({
    generateImage: async (input) => {
      requests.push(input);
      if (input.imageModel === 'banana-lite') throw new Error('model unavailable');
      return { imageUrl: 'data:image/png;base64,result', generationInfo: { elapsedMs: 120, reportedQuality: 'medium' } };
    },
    addNode: (_type, position, data) => { const id = `n${count++}`; nodes[id] = { position, data }; return id; },
    updateNodeData: (id, patch) => { if (nodes[id]) Object.assign(nodes[id].data, patch); },
    deleteNode: id => { delete nodes[id]; }, setEdges: () => {}, commitPrompt: () => {}, now: () => '2026-09-15T00:00:00Z',
  });
  await runner.run({ nodeId: 'parent', prompt: 'same prompt', imageModel: 'image2', imageModelLabel: 'Image2', aspectRatio: '1:1', imageSize: '1K',
    batchCount: 4, comparisonModels: ['image2.5-flare', 'banana-lite', 'image2.5-sunburst'], comparisonGroupId: 'comparison',
    referenceImageIds: [], referenceImages: [referenceImage], hasPendingReferenceHydration: false,
  });
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.prompt === 'same prompt' && request.referenceImages[0].data === referenceImage.data));
  assert.ok(nodes.n0.position.x < nodes.n1.position.x && nodes.n1.position.x < nodes.n2.position.x);
  assert.equal(nodes.n0.position.y, nodes.n2.position.y);
  assert.equal(nodes.n0.data.generationInfo.elapsedMs, 120);
  assert.equal(nodes.n1.data.error, 'model unavailable');
  assert.ok(nodes.n2.data.imageUrl);
  assert.ok(Object.values(nodes).every(node => node.data.comparisonGroupId === 'comparison' && node.data.isLoading === false));
});

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

  assert.equal(
    buildImagePlaceholderData({
      prompt: 'pro asset',
      imageModel: 'banana-pro',
      imageModelLabel: 'Banana Pro',
      aspectRatio: '16:9',
      imageSize: '4K',
      bananaOptions: { searchGrounding: true },
      image2Options: { quality: 'high' },
      createdAt: '2026-09-02T00:00:00.000Z',
      referenceData: {},
    }).bananaOptions?.searchGrounding,
    true
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

test('prompt generation runner reports invalid Banana key and always clears loading', async () => {
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

  assert.ok(calls.some((call) => call.includes('API key not valid')));
  assert.ok(calls.includes('update:prompt-1:{"isLoading":false}'));
});


test('request timeout keeps a failed result while explicit cancellation removes it', async () => {
  for (const reason of ['TimeoutError', 'AbortError']) {
    const nodes: Record<string, any> = { parent: {} };
    const runner = createPromptGenerationRunner({
      generateImage: async () => { throw new DOMException('request timed out', reason); },
      addNode: (_type, _position, data) => { nodes.result = data; return 'result'; },
      updateNodeData: (id, patch) => { if (nodes[id]) Object.assign(nodes[id], patch); },
      deleteNode: id => { delete nodes[id]; }, setEdges: () => {}, commitPrompt: () => {}, now: () => new Date().toISOString(),
    });
    await runner.run({ nodeId: 'parent', prompt: 'draw', imageModel: 'image2', imageModelLabel: 'Image2', aspectRatio: '1:1', imageSize: '1K', batchCount: 1,
      referenceImageIds: [], referenceImages: [], hasPendingReferenceHydration: false });
    if (reason === 'TimeoutError') {
      assert.equal(nodes.result.error, 'request timed out');
      assert.equal(nodes.result.isLoading, false);
      assert.equal(nodes.parent.error, 'request timed out');
    } else assert.equal(nodes.result, undefined);
  }
});
