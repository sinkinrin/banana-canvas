import test from 'node:test';
import assert from 'node:assert/strict';
import { getPromptImageCount, promptImageCountPatch } from './promptImageCount';

test('legacy official batches display their actual total and choosing a count avoids multiplying it again', () => {
  const options = { n: 3, quality: 'max' as const, imageInputs: [{ file_id: 'file-reference' }] };
  assert.equal(getPromptImageCount('openai-image2.6-sunburst', 2, options), 6);
  const patch = promptImageCountPatch('openai-image2.6-sunburst', 4, options);
  assert.equal(getPromptImageCount('openai-image2.6-sunburst', patch.batchCount, patch.officialImageOptions), 4);
  assert.deepEqual(patch.officialImageOptions, { quality: 'max', imageInputs: options.imageInputs });
  assert.equal(options.n, 3);
});

test('Banana and relay counts ignore official settings without deleting them', () => {
  for (const model of ['banana-2.1', 'image2'] as const) {
    assert.equal(getPromptImageCount(model, 2, { n: 3 }), 2);
    assert.deepEqual(promptImageCountPatch(model, 4, { n: 3 }), { batchCount: 4 });
  }
});
