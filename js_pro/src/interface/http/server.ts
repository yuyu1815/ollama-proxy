/**
 * HTTP Server
 * Hono-based server with Ollama-compatible API and Web UI
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../../infrastructure/config/manager.js';
import { UsageStorage } from '../../infrastructure/storage/usage.js';
import { RateLimiter, setGlobalRateLimiter } from '../../infrastructure/ratelimit/ratelimiter.js';
import { createModelsRouter } from './routes/models.js';
import { createGenerateRouter } from './routes/generate.js';
import { createChatRouter } from './routes/chat.js';
import { createAdminRouter } from './routes/admin.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, '..', 'static');

export function createServer(configManager: ConfigManager) {
  const usageStorage = new UsageStorage();
  const app = new Hono();

  // Initialize rate limiter
  const serverConfig = configManager.getServerConfig();
  const rateLimiter = new RateLimiter(serverConfig.rate_limit);
  
  // Register per-model rate limit configurations
  for (const modelName of configManager.listModels()) {
    const modelConfig = configManager.getModelConfig(modelName);
    if (modelConfig?.rate_limit) {
      rateLimiter.setModelConfig(modelName, modelConfig.rate_limit);
      console.log(`[RateLimiter] Registered config for model ${modelName}:`, modelConfig.rate_limit);
    }
  }
  
  setGlobalRateLimiter(rateLimiter);

  // Request logging (disabled to match Python behavior)
  // app.use(logger());

  // Add Server header to match Python (uvicorn) behavior
  app.use('*', async (c, next) => {
    c.header('server', 'uvicorn');
    await next();
  });

  // Ollama-compatible API routes
  app.route('/api', createModelsRouter(configManager));
  app.route('/api/generate', createGenerateRouter(configManager));
  app.route('/api/chat', createChatRouter(configManager, usageStorage));

  // Admin API routes
  app.route('/admin', createAdminRouter(configManager, usageStorage));

  // Serve static files for Web UI
  app.use(
    '/admin/static/*',
    serveStatic({
      root: staticDir,
      rewriteRequestPath: (path) => path.replace(/^\/admin\/static/, ''),
    })
  );

  // Serve index.html for /admin
  app.get('/admin', async (c) => {
    const indexPath = join(staticDir, 'index.html');
    const content = await Bun.file(indexPath).text();
    return c.html(content);
  });

  // Root endpoint
  app.get('/', (c) => {
    return c.json({ status: 'Ollama is running' });
  });

  return app;
}
