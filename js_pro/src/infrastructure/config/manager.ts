/**
 * Config Manager
 * Manages providers.json and config.json with file watching
 */

import { readFile, writeFile, access } from 'fs/promises';
import { watch } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import type {
  ModelConfig,
  ProviderConfig,
  ServerConfig,
} from '../../domain/types.js';

export class ConfigManager {
  private configDir: string;
  private providersPath: string;
  private configPath: string;
  private providers: Map<string, ModelConfig> = new Map();
  private serverConfig: ServerConfig;
  private watchers: ReturnType<typeof watch>[] = [];
  private reloadCallbacks: (() => void)[] = [];

  constructor(configPath?: string) {
    this.configDir = join(homedir(), '.ollama-proxy');
    this.configPath = configPath || join(this.configDir, 'config.json');
    this.providersPath = join(this.configDir, 'providers.json');

    this.serverConfig = {
      host: '127.0.0.1',
      port: 11434,
      providers_file: '~/.ollama-proxy/providers.json',
      log_level: 'info',
    };

    this.loadServerConfig();
    this.loadProviders();
    this.startWatching();
  }

  private async loadServerConfig(): Promise<void> {
    try {
      await access(this.configPath);
      const data = await readFile(this.configPath, 'utf-8');
      const config = JSON.parse(data);
      this.serverConfig = { ...this.serverConfig, ...config };
    } catch {
      // Config doesn't exist, use defaults
      await this.saveServerConfig();
    }
  }

  private async saveServerConfig(): Promise<void> {
    try {
      await writeFile(
        this.configPath,
        JSON.stringify(this.serverConfig, null, 2)
      );
    } catch (err) {
      console.error('Failed to save config:', err);
    }
  }

  private async loadProviders(): Promise<void> {
    try {
      await access(this.providersPath);
      const data = await readFile(this.providersPath, 'utf-8');
      const providersData: Record<string, ProviderConfig> = JSON.parse(data);

      this.providers.clear();

      for (const [_providerId, config] of Object.entries(providersData)) {
        for (const model of config.models) {
          this.providers.set(model.name, {
            ...model,
            provider: config.provider,
            api_key: config.api_key,
            base_url: config.base_url,
          });
        }
      }

      console.log(`Loaded ${this.providers.size} models`);
    } catch (err) {
      console.warn('Failed to load providers:', err);
    }
  }

  private startWatching(): void {
    // Watch providers.json
    try {
      const providerWatcher = watch(this.providersPath, (eventType) => {
        if (eventType === 'change') {
          console.log('providers.json changed, reloading...');
          this.loadProviders();
          this.notifyReload();
        }
      });
      this.watchers.push(providerWatcher);
    } catch {
      // File might not exist yet
    }
  }

  private notifyReload(): void {
    for (const callback of this.reloadCallbacks) {
      callback();
    }
  }

  onReload(callback: () => void): void {
    this.reloadCallbacks.push(callback);
  }

  getModelConfig(modelName: string): ModelConfig | undefined {
    return this.providers.get(modelName);
  }

  listModels(): string[] {
    return Array.from(this.providers.keys());
  }

  getAllModels(): ModelConfig[] {
    return Array.from(this.providers.values());
  }

  getServerConfig(): ServerConfig {
    return this.serverConfig;
  }

  async updateConfig(config: Partial<ServerConfig>): Promise<void> {
    this.serverConfig = { ...this.serverConfig, ...config };
    await this.saveServerConfig();
  }

  destroy(): void {
    for (const watcher of this.watchers) {
      watcher.close();
    }
  }
}
