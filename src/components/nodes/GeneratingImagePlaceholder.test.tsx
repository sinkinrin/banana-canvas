import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { GeneratingImagePlaceholder } from './GeneratingImagePlaceholder';

test('GeneratingImagePlaceholder renders an image2 generation card while waiting', () => {
  const html = renderToStaticMarkup(
    <GeneratingImagePlaceholder
      modelLabel="Image2"
      title="gpt-image-2 | 111"
      prompt="一只香蕉在太空"
      createdAt="2026-04-24T02:10:00.000Z"
    />
  );

  assert.match(html, /gpt-image-2 \| 111/);
  assert.match(html, /一只香蕉在太空/);
  assert.match(html, /aria-label="生成中"/);
  assert.match(html, /生成中/);
  assert.match(html, /已耗时/);
  assert.doesNotMatch(html, /bg-white/);
});
