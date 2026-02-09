import { describe, expect, it, vi } from 'vitest';
import { createModelsRouter } from './models.js';
import type { ConfigManager } from '../../../infrastructure/config/manager.js';
import type { ModelConfig } from '../../../domain/types.js';

function createMockConfigManager(models: ModelConfig[] = []): ConfigManager {
  return {
    getAllModels: vi.fn(() => models),
    getModelConfig: vi.fn((name: string) =>
      models.find((m) => m.name === name)
    ),
    listModels: vi.fn(() => models.map((m) => m.name)),
    getServerConfig: vi.fn(),
    getProvidersPath: vi.fn(),
    updateConfig: vi.fn(),
    onReload: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ConfigManager;
}

const sampleModels: ModelConfig[] = [
  { name: 'gpt-4', provider: 'openai', model_name: 'gpt-4' },
  { name: 'claude', provider: 'anthropic', model_name: 'claude-3-opus' },
];

describe('Models Router', () => {
  describe('GET /tags', () => {
    it('登録済みモデル一覧をOllama形式で返す', async () => {
      // Arrange
      const configManager = createMockConfigManager(sampleModels);
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/tags');
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.models).toHaveLength(2);
      expect(body.models[0].name).toBe('gpt-4');
      expect(body.models[0].digest).toBe('openai/gpt-4');
      expect(body.models[1].name).toBe('claude');
    });

    it('モデルが0件の場合は空配列を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager([]);
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/tags');
      const body = await res.json();

      // Assert
      expect(body.models).toEqual([]);
    });
  });

  describe('POST /show', () => {
    it('存在するモデルの情報を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager(sampleModels);
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'gpt-4' }),
      });
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.details.family).toBe('openai');
    });

    it('存在しないモデルは404を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager(sampleModels);
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'nonexistent' }),
      });

      // Assert
      expect(res.status).toBe(404);
    });

    it('モデル名が未指定の場合は400を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager(sampleModels);
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/show', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });

      // Assert
      expect(res.status).toBe(400);
    });
  });

  describe('GET /ps', () => {
    it('常に空のモデルリストを返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/ps');
      const body = await res.json();

      // Assert
      expect(body.models).toEqual([]);
    });
  });

  describe('GET /version', () => {
    it('バージョン情報を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const router = createModelsRouter(configManager);

      // Act
      const res = await router.request('/version');
      const body = await res.json();

      // Assert
      expect(body.version).toBe('0.5.0');
    });
  });

  describe('未実装エンドポイント', () => {
    it.each(['/create', '/copy', '/delete', '/pull', '/push', '/embed'])(
      'POST %s は501を返す',
      async (endpoint) => {
        // Arrange
        const configManager = createMockConfigManager();
        const router = createModelsRouter(configManager);

        // Act
        const res = await router.request(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });

        // Assert
        expect(res.status).toBe(501);
      }
    );
  });
});
