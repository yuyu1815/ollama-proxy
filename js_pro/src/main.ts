/**
 * Main Entry Point
 * Ollama Proxy Server
 */

import { ConfigManager } from './infrastructure/config/manager.js';
import { createServer } from './interface/http/server.js';

async function main() {
  console.log('🚀 Starting Ollama Proxy Server...\n');

  // Initialize config manager
  const configManager = new ConfigManager();
  const serverConfig = configManager.getServerConfig();

  console.log(`📁 Config directory: ~/.ollama-proxy/`);
  console.log(`📝 Loaded ${configManager.listModels().length} models\n`);

  // Create and start server
  const app = createServer(configManager);

  console.log(`🌐 Server ready:`);
  console.log(
    `   Ollama API: http://${serverConfig.host}:${serverConfig.port}`
  );
  console.log(
    `   Admin UI:   http://${serverConfig.host}:${serverConfig.port}/admin\n`
  );

  // Start server
  const server = Bun.serve({
    hostname: serverConfig.host,
    port: serverConfig.port,
    fetch: app.fetch,
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('\n👋 Shutting down...');
    configManager.destroy();
    server.stop();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('\n👋 Shutting down...');
    configManager.destroy();
    server.stop();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});
