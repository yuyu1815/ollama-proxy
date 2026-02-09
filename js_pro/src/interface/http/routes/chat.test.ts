import { describe, expect, it, vi } from 'vitest';
import { createChatRouter } from './chat.js';
import type { ConfigManager } from '../../../infrastructure/config/manager.js';
import type { UsageStorage } from '../../../infrastructure/storage/usage.js';
import type { ModelConfig } from '../../../domain/types.js';

// Mock external AI SDK to avoid real API calls
vi.mock('ai', () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield 'Hello';
      yield ' World';
    })(),
  })),
}));

vi.mock('../../../infrastructure/providers/factory.js', () => ({
  createLanguageModel: vi.fn(() => ({})),
}));

const testModel: ModelConfig = {
  name: 'test-model',
  provider: 'openai',
  model_name: 'gpt-4',
  api_key: 'fake-key',
};

function createMockConfigManager(
  models: ModelConfig[] = [testModel]
): ConfigManager {
  return {
    getModelConfig: vi.fn((name: string) =>
      models.find((m) => m.name === name)
    ),
    getAllModels: vi.fn(() => models),
    listModels: vi.fn(() => models.map((m) => m.name)),
    getServerConfig: vi.fn(),
    getProvidersPath: vi.fn(),
    updateConfig: vi.fn(),
    onReload: vi.fn(),
    destroy: vi.fn(),
  } as unknown as ConfigManager;
}

function createMockUsageStorage(): UsageStorage {
  return {
    addLog: vi.fn(),
    getLogs: vi.fn(() => []),
    getStatsByProvider: vi.fn(() => ({})),
    getStatsByModel: vi.fn(() => ({})),
    getDailyStats: vi.fn(() => ({})),
  } as unknown as UsageStorage;
}

describe('Chat Router', () => {
  describe('POST /', () => {
    it('非ストリーミングでassistantメッセージを返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const usageStorage = createMockUsageStorage();
      const router = createChatRouter(configManager, usageStorage);

      // Act
      const res = await router.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: false,
        }),
      });
      const body = await res.json();

      // Assert
      expect(res.status).toBe(200);
      expect(body.message.role).toBe('assistant');
      expect(body.message.content).toBe('Hello World');
      expect(body.done).toBe(true);
      expect(body.model).toBe('test-model');
    });

    it('ストリーミングでndjsonチャンクを返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const usageStorage = createMockUsageStorage();
      const router = createChatRouter(configManager, usageStorage);

      // Act
      const res = await router.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'test-model',
          messages: [{ role: 'user', content: 'Hi' }],
          stream: true,
        }),
      });

      // Assert
      expect(res.headers.get('Content-Type')).toBe('application/x-ndjson');
      const text = await res.text();
      const lines = text
        .trim()
        .split('\n')
        .map((l) => JSON.parse(l));
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines[0].message.content).toBe('Hello');
      expect(lines[lines.length - 1].done).toBe(true);
    });

    it('モデル名が未指定の場合は400を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const usageStorage = createMockUsageStorage();
      const router = createChatRouter(configManager, usageStorage);

      // Act
      const res = await router.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [{ role: 'user', content: 'Hi' }] }),
      });

      // Assert
      expect(res.status).toBe(400);
    });

    it('messagesが未指定の場合は400を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const usageStorage = createMockUsageStorage();
      const router = createChatRouter(configManager, usageStorage);

      // Act
      const res = await router.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'test-model' }),
      });

      // Assert
      expect(res.status).toBe(400);
    });

    it('存在しないモデルは404を返す', async () => {
      // Arrange
      const configManager = createMockConfigManager();
      const usageStorage = createMockUsageStorage();
      const router = createChatRouter(configManager, usageStorage);

      // Act
      const res = await router.request('/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'nonexistent',
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      // Assert
      expect(res.status).toBe(404);
    });
  });
});
