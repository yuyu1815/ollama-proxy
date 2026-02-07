/**
 * Models Routes
 * Ollama-compatible model management endpoints
 */

import { Hono } from 'hono';
import { ConfigManager } from '../../../infrastructure/config/manager.js';
import {
  toOllamaModelListItem,
  toOllamaModelInfo,
} from '../../../domain/converter.js';
import i18n from '../../../infrastructure/i18n/index.js';

export function createModelsRouter(configManager: ConfigManager) {
  const router = new Hono();

  // GET /api/tags - List models
  router.get('/tags', (c) => {
    const models = configManager.getAllModels();
    const ollamaModels = models.map((m) =>
      toOllamaModelListItem(m.name, m.provider, m.model_name)
    );

    return c.json({ models: ollamaModels });
  });

  // POST /api/show - Show model info
  router.post('/show', async (c) => {
    const body = await c.req.json();
    const modelName = body.name;

    if (!modelName) {
      return c.json({ error: i18n.t('errors.model_name_required') }, 400);
    }

    const modelConfig = configManager.getModelConfig(modelName);
    if (!modelConfig) {
      return c.json({ error: i18n.t('errors.model_not_found', { modelName }) }, 404);
    }

    const info = toOllamaModelInfo(
      modelName,
      modelConfig.provider,
      modelConfig.model_name
    );

    return c.json(info);
  });

  // GET /api/ps - List running models (always empty for proxy)
  router.get('/ps', (c) => {
    return c.json({ models: [] });
  });

  // GET /api/version - Version info
  router.get('/version', (c) => {
    return c.json({ version: '0.5.0' });
  });

  // Root endpoint
  router.get('/', (c) => {
    return c.json({ status: i18n.t('server.status') });
  });

  // Unimplemented endpoints
  const unimplemented = [
    '/create',
    '/copy',
    '/delete',
    '/pull',
    '/push',
    '/embed',
  ];

  for (const endpoint of unimplemented) {
    router.post(endpoint, (c) => {
      return c.json(
        {
          error: i18n.t('errors.not_supported_in_proxy', { endpoint: endpoint.replace('/', '') }),
        },
        501
      );
    });
  }

  return router;
}
