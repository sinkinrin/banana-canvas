import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { MissingProjectState } from './MissingProjectState';

test('MissingProjectState explains that the project was not found', () => {
  const html = renderToStaticMarkup(<MissingProjectState onBack={() => {}} />);

  assert.match(html, /项目不存在/);
  assert.match(html, /返回项目列表/);
});
