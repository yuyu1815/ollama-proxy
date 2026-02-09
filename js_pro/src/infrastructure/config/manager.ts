/**
 * Config Manager
 * Manages providers.json and config.json with file watching
 */

import { access, copyFile, mkdir, readFile, writeFile } from 'fs/promises';
import { watch } from 'fs';
import { dirname, join } from 'path';
import { homedir } from 'os';
import { fileURLToPath } from 'url';
import type { ModelConfig, ProviderConfig, ServerConfig, RateLimitConfig } from '../../domain/types.js';

export class ConfigManager {
  private configDir: string;
  private providersPath: string;
  private configPath: string;
  private providers: Map<string, ModelConfig> = new Map();
  private serverConfig: ServerConfig;
  private watchers: ReturnType<typeof watch>[] = [];
  private reloadCallbacks: (() => void)[] = [];

  constructor(configDir?: string, configPath?: string) {
    this.configDir = configDir || join(homedir(), '.ollama-proxy');
    this.configPath = configPath || join(this.configDir, 'config.json');
    this.providersPath = join(this.configDir, 'providers.json');

    this.serverConfig = {
      host: '127.0.0.1',
      port: 11434,
      providers_file: '~/.ollama-proxy/providers.json',
      log_level: 'info',
    };
  }

  async initialize(): Promise<void> {
    await this.loadServerConfig();
    await this.loadProviders();
    this.startWatching();
  }

  getProvidersPath(): string {
    return this.providersPath;
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

  private async loadServerConfig(): Promise<void> {
    try {
      await access(this.configPath);
      const data = await readFile(this.configPath, 'utf-8');
      const config = JSON.parse(data);
      this.serverConfig = { ...this.serverConfig, ...config };
    } catch {
      // Config doesn't exist, create from template
      await this.ensureConfigDir();
      const templatePath = this.getTemplatePath('default-config.json');
      await copyFile(templatePath, this.configPath);
      console.log(`Created config from template: ${this.configPath}`);
    }
  }

  private async loadProviders(): Promise<void> {
    try {
      await access(this.providersPath);
      const data = await readFile(this.providersPath, 'utf-8');
      const providersData: Record<string, ProviderConfig> = JSON.parse(data);

      this.providers.clear();

      for (const [providerId, config] of Object.entries(providersData)) {
        for (const model of config.models) {
          this.providers.set(model.name, {
            ...model,
            provider: providerId,
            provider_type: config.provider,
            api_key: model.api_key || config.api_key,
            base_url: model.base_url || config.base_url,
            max_retries: model.max_retries ?? config.max_retries,
            rate_limit: model.rate_limit ?? config.rate_limit,
          });
        }
      }

      console.log(`Loaded ${this.providers.size} models`);
    } catch (err) {
      // Providers file doesn't exist, create from template
      await this.ensureConfigDir();
      const templatePath = this.getTemplatePath('default-providers.json');
      await copyFile(templatePath, this.providersPath);
      console.log(`Created providers from template: ${this.providersPath}`);
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
    const modelConfig = this.providers.get(modelName);
    if (!modelConfig) return undefined;

    // Merge rate limit configs with priority: model > provider > global
    const globalRateLimit = this.serverConfig.rate_limit;
    const mergedRateLimit = this.mergeRateLimitConfigs(
      globalRateLimit,
      modelConfig.rate_limit
    );

    return {
      ...modelConfig,
      rate_limit: mergedRateLimit,
    };
  }

  /**
   * Merge rate limit configs with child overriding parent
   * Priority: child > parent
   */
  private mergeRateLimitConfigs(
    parent?: RateLimitConfig,
    child?: RateLimitConfig
  ): RateLimitConfig | undefined {
    if (!parent && !child) return undefined;
    if (!parent) return child;
    if (!child) return parent;

    return {
      requests: child.requests ?? parent.requests,
      window_ms: child.window_ms ?? parent.window_ms,
      concurrent: child.concurrent ?? parent.concurrent,
    };
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

  private startWatching(): void {
    // Watch providers.json
    try {
      const providerWatcher = watch(this.providersPath, (eventType) => {
        if (eventType === 'change') {
          console.log('providers.json changed, reloading...');
          this.loadProviders().then(() => {
            this.notifyReload();
          });
        }
      });
      this.watchers.push(providerWatcher);
    } catch {
      // File might not exist yet
    }
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

  private async ensureConfigDir(): Promise<void> {
    try {
      await access(this.configDir);
    } catch {
      await mkdir(this.configDir, { recursive: true });
    }
  }

  private getTemplatePath(filename: string): string {
    const __filename = fileURLToPath(import.meta.url);
    const __dirname = dirname(__filename);
    return join(__dirname, 'templates', filename);
  }
}
