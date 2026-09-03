import assert from 'node:assert/strict';
import test from 'node:test';
import { renderToStaticMarkup } from 'react-dom/server';

import { ProjectsList } from '../components/projects/ProjectsList';
import i18n from './index';

test('the project screen renders in English after changing language', async () => {
  await i18n.changeLanguage('en');
  try {
    const html = renderToStaticMarkup(
      <ProjectsList
        projects={[]}
        onCreate={() => {}}
        onOpen={() => {}}
        onRename={() => {}}
        onDelete={() => {}}
      />
    );

    assert.match(html, /Banana Canvas/);
    assert.match(html, /New project/);
    assert.match(html, /No projects yet/);
    assert.doesNotMatch(html, /新建项目|还没有项目/);
  } finally {
    await i18n.changeLanguage('zh-CN');
  }
});
