import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createPromptTitle,
  filterPromptTemplates,
  normalizePromptTags,
  parsePromptTags,
  type PromptTemplate,
} from './prompts';

const prompts: PromptTemplate[] = [{
  id: 'poster',
  title: '电影海报',
  content: '一张带有霓虹灯光的宽银幕海报',
  tags: ['海报', '电影感'],
  createdAt: '2026-09-02T00:00:00.000Z',
  updatedAt: '2026-09-02T00:00:00.000Z',
}, {
  id: 'portrait',
  title: '自然人像',
  content: '柔和窗边光线下的人物肖像',
  tags: ['摄影'],
  createdAt: '2026-09-01T00:00:00.000Z',
  updatedAt: '2026-09-01T00:00:00.000Z',
}];

test('prompt tags normalize Chinese separators, whitespace, and duplicates', () => {
  assert.deepEqual(parsePromptTags(' 海报，电影感, 海报\n夜景 '), ['海报', '电影感', '夜景']);
  assert.deepEqual(normalizePromptTags(['Photo', ' photo ', '人物']), ['Photo', '人物']);
});

test('prompt search matches title, content, and tags', () => {
  assert.deepEqual(filterPromptTemplates(prompts, '电影').map((item) => item.id), ['poster']);
  assert.deepEqual(filterPromptTemplates(prompts, '窗边').map((item) => item.id), ['portrait']);
  assert.deepEqual(filterPromptTemplates(prompts, '摄影').map((item) => item.id), ['portrait']);
});

test('empty prompt titles derive from the first content line', () => {
  assert.equal(createPromptTitle('第一行\n第二行'), '第一行');
  assert.match(createPromptTitle('x'.repeat(80)), /…$/);
});
