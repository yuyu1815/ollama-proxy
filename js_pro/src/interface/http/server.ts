/**
 * HTTP Server
 * Hono-based server with Ollama-compatible API and Web UI
 */

import { Hono } from 'hono';
import { serveStatic } from 'hono/bun';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { ConfigManager } from '../../infrastructure/config/manager.js';
import { createModelsRouter } from './routes/models.js';
import { createGenerateRouter } from './routes/generate.js';
import { createChatRouter } from './routes/chat.js';
import { createAdminRouter } from './routes/admin.js';
import i18n from '../../infrastructure/i18n/index.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const staticDir = join(__dirname, '..', 'static');

export function createServer(configManager: ConfigManager) {
  const app = new Hono();

  // CORS middleware
  app.use('*', async (c, next) => {
    c.header('Access-Control-Allow-Origin', '*');
    c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (c.req.method === 'OPTIONS') {
      return c.body(null, 204);
    }

    return next();
  });

  // Ollama-compatible API routes
  app.route('/api', createModelsRouter(configManager));
  app.route('/api/generate', createGenerateRouter(configManager));
  app.route('/api/chat', createChatRouter(configManager));

  // Admin API routes
  app.route('/admin', createAdminRouter(configManager));

  // Serve static files for Web UI
  app.use('/admin/static/*', serveStatic({ root: staticDir }));

  // Serve index.html for /admin
  app.get('/admin', async (c) => {
    const indexPath = join(staticDir, 'index.html');
    const content = await Bun.file(indexPath).text();
    return c.html(content);
  });

  // Root endpoint
  app.get('/', (c) => {
    return c.json({
      status: i18n.t('server.status'),
      admin: '/admin',
      api: '/api',
    });
  });

  return app;
}
