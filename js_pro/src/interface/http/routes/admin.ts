/**
 * Admin Routes
 * GUI management API endpoints
 */

import { type Context, Hono } from 'hono';
import type { ConfigManager } from '../../../infrastructure/config/manager.js';
import type { UsageStorage } from '../../../infrastructure/storage/usage.js';
import { ProviderService } from '../../../infrastructure/config/provider_service.js';
import type {
  ModelConfig,
  ProviderConfig,
  ServerConfig,
} from '../../../domain/types.js';
import i18n from '../../../infrastructure/i18n/index.js';

export function createAdminRouter(
  configManager: ConfigManager,
  usageStorage: UsageStorage
) {
  const router = new Hono();
  const providerService = new ProviderService(configManager.getProvidersPath());

  // Helper for error handling
  const handleError = (c: Context, error: unknown, messageKey: string) => {
    return c.json(
      {
        error: error instanceof Error ? error.message : i18n.t(messageKey),
      },
      500
    );
  };

  // GET /admin/api/config - Get server config
  router.get('/api/config', (c) => c.json(configManager.getServerConfig()));

  // POST /admin/api/config - Update server config
  router.post('/api/config', async (c) => {
    try {
      const config = (await c.req.json()) as Partial<ServerConfig>;
      await configManager.updateConfig(config);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_save_config');
    }
  });

  // GET /admin/api/models - List all models
  router.get('/api/models', (c) => c.json(configManager.getAllModels()));

  // POST /admin/api/models - Create model
  router.post('/api/models', async (c) => {
    try {
      const model = (await c.req.json()) as ModelConfig;

      if (
        await providerService.hasModelInProvider(model.provider, model.name)
      ) {
        return c.json({ error: i18n.t('errors.model_already_exists') }, 400);
      }

      await providerService.addModel(model);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_create_model');
    }
  });

  // PUT /admin/api/models/:name - Update model
  router.put('/api/models/:name', async (c) => {
    try {
      const modelName = c.req.param('name');
      const updates = (await c.req.json()) as Partial<ModelConfig>;

      const providerId =
        await providerService.findProviderByModelName(modelName);
      if (!providerId) {
        return c.json({ error: i18n.t('errors.simple_model_not_found') }, 404);
      }

      await providerService.updateModel(modelName, updates);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_update_model');
    }
  });

  // DELETE /admin/api/models/:name - Delete model
  router.delete('/api/models/:name', async (c) => {
    try {
      const modelName = c.req.param('name');

      const providerId =
        await providerService.findProviderByModelName(modelName);
      if (!providerId) {
        return c.json({ error: i18n.t('errors.simple_model_not_found') }, 404);
      }

      await providerService.deleteModel(modelName);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_delete_model');
    }
  });

  // GET /admin/api/providers - List providers
  router.get('/api/providers', async (c) => {
    try {
      const providers = await providerService.getProviders();
      return c.json(providers);
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_load_providers');
    }
  });

  // POST /admin/api/providers - Create provider
  router.post('/api/providers', async (c) => {
    try {
      const { id, ...config } = await c.req.json();

      if (await providerService.hasProvider(id)) {
        return c.json({ error: i18n.t('errors.provider_already_exists') }, 400);
      }

      await providerService.addProvider(id, config);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_create_provider');
    }
  });

  // PUT /admin/api/providers/:id - Update provider
  router.put('/api/providers/:id', async (c) => {
    try {
      const providerId = c.req.param('id');
      const updates = (await c.req.json()) as Partial<ProviderConfig>;

      if (!(await providerService.hasProvider(providerId))) {
        return c.json({ error: i18n.t('errors.provider_not_found') }, 404);
      }

      await providerService.updateProvider(providerId, updates);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_update_provider');
    }
  });

  // DELETE /admin/api/providers/:id - Delete provider
  router.delete('/api/providers/:id', async (c) => {
    try {
      const providerId = c.req.param('id');

      if (!(await providerService.hasProvider(providerId))) {
        return c.json({ error: i18n.t('errors.provider_not_found') }, 404);
      }

      await providerService.deleteProvider(providerId);
      return c.json({ success: true });
    } catch (error) {
      return handleError(c, error, 'errors.failed_to_delete_provider');
    }
  });

  // POST /admin/api/reload - Reload configuration
  router.post('/api/reload', (c) => c.json({ success: true }));

  // GET /admin/api/stats - Get usage stats
  router.get('/api/stats', (c) => {
    return c.json({
      daily: usageStorage.getDailyStats(),
      models: usageStorage.getStatsByModel(),
      providers: usageStorage.getStatsByProvider(),
      recent: usageStorage.getLogs().slice(-100).reverse(),
    });
  });

  return router;
}
