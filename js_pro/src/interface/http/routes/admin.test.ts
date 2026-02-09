import { describe, expect, it, vi } from 'vitest';
import { createAdminRouter } from './admin.js';
import type { ConfigManager } from '../../../infrastructure/config/manager.js';
import type { UsageStorage } from '../../../infrastructure/storage/usage.js';
import type { ModelConfig } from '../../../domain/types.js';

// Mock ProviderService to avoid filesystem access
vi.mock('../../../infrastructure/config/provider_service.js', () => {
  class MockProviderService {
    getProviders = vi.fn(async () => []);
    addProvider = vi.fn(async () => {});
    hasProvider = vi.fn(async () => false);
    updateProvider = vi.fn(async () => {});
    deleteProvider = vi.fn(async () => {});
    addModel = vi.fn(async () => {});
    hasModelInProvider = vi.fn(async () => false);
    findProviderByModelName = vi.fn(async (name: string) =>
      name === 'existing-model' ? 'openai' : null
    );
    updateModel = vi.fn(async () => {});
    deleteModel = vi.fn(async () => {});
  }
  return { ProviderService: MockProviderService };
});

const sampleModels: ModelConfig[] = [
  { name: 'gpt-4', provider: 'openai', model_name: 'gpt-4' },
];

function createMockConfigManager(): ConfigManager {
  return {
    getAllModels: vi.fn(() => sampleModels),
    getModelConfig: vi.fn(),
    listModels: vi.fn(() => ['gpt-4']),
    getServerConfig: vi.fn(() => ({
      host: '127.0.0.1',
      port: 11434,
      providers_file: 'test',
      log_level: 'info',
    })),
    getProvidersPath: vi.fn(() => '/tmp/test-providers.json'),
    updateConfig: vi.fn(),
    onReload: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ConfigManager;
}

function createMockUsageStorage(): UsageStorage {
  return {
    addLog: vi.fn(),
    getLogs: vi.fn(() => [
      {
        timestamp: '2025-01-01T00:00:00Z',
        provider: 'openai',
        model: 'gpt-4',
        input_tokens: 10,
        output_tokens: 20,
      },
    ]),
    getStatsByProvider: vi.fn(() => ({
      openai: { total_input_tokens: 10, total_output_tokens: 20, count: 1 },
    })),
    getStatsByModel: vi.fn(() => ({
      'gpt-4': { total_input_tokens: 10, total_output_tokens: 20, count: 1 },
    })),
    getDailyStats: vi.fn(() => ({
      '2025-01-01': {
        total_input_tokens: 10,
        total_output_tokens: 20,
        count: 1,
      },
    })),
  } as unknown as UsageStorage;
}

describe('Admin Router', () => {
  describe('GET /api/config', () => {
    it('サーバー設定を返す', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/config');
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.host).toBe('127.0.0.1');
      expect(body.port).toBe(11434);
    });
  });

  describe('POST /api/config', () => {
    it('設定を更新して成功を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const router = createAdminRouter(configManager, createMockUsageStorage());

      // Act
      const res = await router.request('/api/config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ port: 8080 }),
      });
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
      expect(configManager.updateConfig).toHaveBeenCalledWith({ port: 8080 });
    });
  });

  describe('GET /api/models', () => {
    it('全モデル一覧を返す', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/models');
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body).toHaveLength(1);
      expect(body[0].name).toBe('gpt-4');
    });
  });

  describe('DELETE /api/models/:name', () => {
    it('存在するモデルを削除できる', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/models/existing-model', {
        method: 'DELETE',
      });
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });

    it('存在しないモデルの削除は404を返す', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/models/nonexistent', {
        method: 'DELETE',
      });

      // Assert
      expect(res.status).toBe(404);
    });
  });

  describe('GET /api/providers', () => {
    it('プロバイダー一覧を返す', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/providers');
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(Array.isArray(body)).toBe(true);
    });
  });

  describe('POST /api/reload', () => {
    it('リロード成功を返す', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/reload', { method: 'POST' });
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.success).toBe(true);
    });
  });

  describe('GET /api/stats', () => {
    it('使用統計を返す', async () => {
      // Arrange
      const router = createAdminRouter(
        createMockConfigManager(),
        createMockUsageStorage()
      );

      // Act
      const res = await router.request('/api/stats');
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.daily).toBeDefined();
      expect(body.models).toBeDefined();
      expect(body.providers).toBeDefined();
      expect(body.recent).toBeDefined();
    });
  });
});
