import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { ModelConfig, ProviderConfig } from '../../domain/types.js';

export class ProviderService {
  private providersPath: string;

  constructor(providersPath?: string) {
    const configDir = join(homedir(), '.ollama-proxy');
    this.providersPath = providersPath || join(configDir, 'providers.json');
  }

  private async readProviders(): Promise<Record<string, ProviderConfig>> {
    try {
      const content = await readFile(this.providersPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as any).code === 'ENOENT') {
        return {};
      }
      throw error;
    }
  }

  private async writeProviders(data: Record<string, ProviderConfig>): Promise<void> {
    await writeFile(this.providersPath, JSON.stringify(data, null, 2));
  }

  async getProviders(): Promise<ProviderConfig[]> {
    const data = await this.readProviders();
    return Object.entries(data).map(([id, config]) => ({
      ...config,
      id, // Helper to include ID in the response if needed, though types might need adjustment if we want to be strict
    }));
  }

  async addProvider(id: string, config: ProviderConfig): Promise<void> {
    const data = await this.readProviders();
    if (data[id]) {
      throw new Error('errors.provider_already_exists');
    }
    data[id] = config;
    await this.writeProviders(data);
  }

  async updateProvider(id: string, updates: Partial<ProviderConfig>): Promise<void> {
    const data = await this.readProviders();
    if (!data[id]) {
      throw new Error('errors.provider_not_found');
    }
    data[id] = { ...data[id], ...updates };
    await this.writeProviders(data);
  }

  async deleteProvider(id: string): Promise<void> {
    const data = await this.readProviders();
    if (!data[id]) {
      throw new Error('errors.provider_not_found');
    }
    delete data[id];
    await this.writeProviders(data);
  }

  async addModel(model: ModelConfig): Promise<void> {
    const data = await this.readProviders();
    const providerId = model.provider;

    if (!data[providerId]) {
      // Auto-create provider if it doesn't exist (legacy behavior support, or just convenient)
      data[providerId] = {
        provider: model.provider,
        models: [],
      };
    }

    if (data[providerId].models.some((m) => m.name === model.name)) {
      throw new Error('errors.model_already_exists');
    }

    data[providerId].models.push(model);
    await this.writeProviders(data);
  }

  async updateModel(name: string, updates: Partial<ModelConfig>): Promise<void> {
    const data = await this.readProviders();
    
    for (const provider of Object.values(data)) {
      const index = provider.models.findIndex((m) => m.name === name);
      if (index !== -1) {
        provider.models[index] = { ...provider.models[index], ...updates };
        await this.writeProviders(data);
        return;
      }
    }
    throw new Error('errors.simple_model_not_found');
  }

  async deleteModel(name: string): Promise<void> {
     const data = await this.readProviders();
     
     for (const provider of Object.values(data)) {
       const index = provider.models.findIndex((m) => m.name === name);
       if (index !== -1) {
         provider.models.splice(index, 1);
         await this.writeProviders(data);
         return;
       }
     }
     throw new Error('errors.simple_model_not_found');
  }

  async hasProvider(id: string): Promise<boolean> {
    const data = await this.readProviders();
    return !!data[id];
  }

  async hasModelInProvider(providerId: string, modelName: string): Promise<boolean> {
    const data = await this.readProviders();
    if (!data[providerId]) return false;
    return data[providerId].models.some((m) => m.name === modelName);
  }

  async findProviderByModelName(modelName: string): Promise<string | null> {
    const data = await this.readProviders();
    for (const [providerId, config] of Object.entries(data)) {
      if (config.models.some((m) => m.name === modelName)) {
        return providerId;
      }
    }
    return null;
  }
}
