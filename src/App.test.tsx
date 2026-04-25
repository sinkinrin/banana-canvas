import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';

import { AppRouter } from './App';

test('AppRouter renders the projects page at the index route', () => {
  const html = renderToStaticMarkup(<AppRouter route={{ name: 'projects' }} />);

  assert.match(html, /加载项目中/);
});

test('AppRouter renders the requested project canvas route', () => {
  const html = renderToStaticMarkup(
    <AppRouter route={{ name: 'project', projectId: 'project-1' }} requireApiKey={false} />
  );

  assert.match(html, /加载项目中/);
});
