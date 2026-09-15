import test from 'node:test';
import assert from 'node:assert/strict';
import { renderToStaticMarkup } from 'react-dom/server';
import { ModelComparisonSetup } from './ModelComparisonDialog';
import { GenerationInfoCard } from './GenerationInfoCard';
import { ServerModelsPanel } from '../settings/ServerModelsPanel';
import i18n from '../../i18n';

test('comparison setup, result metadata and model discovery render in both languages', async () => {
  try {
    for (const language of ['zh-CN', 'en']) {
      await i18n.changeLanguage(language);
      const setup = renderToStaticMarkup(<ModelComparisonSetup onClose={() => {}} onStart={() => {}} />);
      assert.match(setup, /Image 2\.5 Flare/);
      assert.match(setup, /Image 2\.5 Sunburst/);
      assert.equal((setup.match(/checked=""/g) ?? []).length, 2);
      const info = renderToStaticMarkup(<GenerationInfoCard imageUrl="data:image/png;base64,abc" info={{ apiModel: 'requested-model', requestedQuality: 'high', reportedQuality: 'medium', elapsedMs: 2345 }} />);
      assert.match(info, /PNG/); assert.match(info, /2\.3 s/); assert.match(info, /high → medium/);
      const catalog = renderToStaticMarkup(<ServerModelsPanel connection="https://example.com/v1" />);
      assert.match(catalog, /GET \/v1\/models/);
      assert.doesNotMatch(setup + info + catalog, /comparison\.(title|start)|generationInfo\.title|modelCatalog\.title/);
    }
  } finally { await i18n.changeLanguage('zh-CN'); }
});
