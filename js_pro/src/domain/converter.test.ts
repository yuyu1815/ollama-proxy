import { describe, expect, it } from 'vitest';
import {
  toOllamaChatResponse,
  toOllamaChatStreamChunk,
  toOllamaGenerateResponse,
  toOllamaGenerateStreamChunk,
  toOllamaModelInfo,
  toOllamaModelListItem,
} from './converter.js';

describe('toOllamaGenerateResponse', () => {
  it('完了レスポンスを正しいフォーマットで返す', () => {
    // Arrange
    const content = 'Hello, world!';
    const modelName = 'test-model';
    const duration = 1.5;

    // Act
    const result = toOllamaGenerateResponse(content, modelName, duration);

    // Assert
    expect(result.model).toBe('test-model');
    expect(result.response).toBe('Hello, world!');
    expect(result.done).toBe(true);
    expect(result.done_reason).toBe('stop');
    expect(result.total_duration).toBe(1_500_000_000);
    expect(result.context).toEqual([]);
    expect(result.created_at).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('トークン数を正しく設定する', () => {
    // Arrange & Act
    const result = toOllamaGenerateResponse('text', 'model', 1, 10, 20);

    // Assert
    expect(result.prompt_eval_count).toBe(10);
    expect(result.eval_count).toBe(20);
  });
});

describe('toOllamaGenerateStreamChunk', () => {
  it('中間チャンクはdone=falseで返す', () => {
    // Arrange & Act
    const result = toOllamaGenerateStreamChunk('chunk', 'model', false);

    // Assert
    expect(result.response).toBe('chunk');
    expect(result.done).toBe(false);
    expect(result.done_reason).toBeUndefined();
  });

  it('最終チャンクはdone=trueでメタデータを含む', () => {
    // Arrange & Act
    const result = toOllamaGenerateStreamChunk('', 'model', true);

    // Assert
    expect(result.done).toBe(true);
    expect(result.done_reason).toBe('stop');
    expect(result.context).toEqual([]);
  });
});

describe('toOllamaChatResponse', () => {
  it('assistantメッセージを含むレスポンスを返す', () => {
    // Arrange
    const content = 'AI response';
    const modelName = 'chat-model';

    // Act
    const result = toOllamaChatResponse(content, modelName, 2.0);

    // Assert
    expect(result.message).toEqual({
      role: 'assistant',
      content: 'AI response',
      images: null,
      tool_calls: [],
    });
    expect(result.done).toBe(true);
    expect(result.model).toBe('chat-model');
    expect(result.total_duration).toBe(2_000_000_000);
  });

  it('tool_callsを渡せる', () => {
    // Arrange
    const tools = [{ name: 'test' }];

    // Act
    const result = toOllamaChatResponse('', 'model', 0, 0, 0, tools);

    // Assert
    expect(result.message?.tool_calls).toEqual([{ name: 'test' }]);
  });
});

describe('toOllamaChatStreamChunk', () => {
  it('中間チャンクはメッセージ付きでdone=false', () => {
    // Arrange & Act
    const result = toOllamaChatStreamChunk('hello', 'model', false);

    // Assert
    expect(result.message?.content).toBe('hello');
    expect(result.message?.role).toBe('assistant');
    expect(result.done).toBe(false);
    expect(result.done_reason).toBeUndefined();
  });

  it('最終チャンクはdone=trueでメタデータを含む', () => {
    // Arrange & Act
    const result = toOllamaChatStreamChunk('', 'model', true);

    // Assert
    expect(result.done).toBe(true);
    expect(result.done_reason).toBe('stop');
    expect(result.total_duration).toBe(0);
  });
});

describe('toOllamaModelListItem', () => {
  it('Ollamaモデル一覧アイテムを正しく生成する', () => {
    // Arrange & Act
    const result = toOllamaModelListItem('my-gpt', 'openai', 'gpt-4');

    // Assert
    expect(result.name).toBe('my-gpt');
    expect(result.model).toBe('my-gpt');
    expect(result.digest).toBe('openai/gpt-4');
    expect(result.details.family).toBe('openai');
    expect(result.details.format).toBe('api');
    expect(result.size).toBe(0);
  });
});

describe('toOllamaModelInfo', () => {
  it('モデル情報を正しく生成する', () => {
    // Arrange & Act
    const result = toOllamaModelInfo('my-gpt', 'openai', 'gpt-4');

    // Assert
    expect(result.modelfile).toContain('openai/gpt-4');
    expect(result.details).toEqual({
      format: 'api',
      family: 'openai',
      families: null,
      parameter_size: 'unknown',
      quantization_level: 'none',
    });
    expect((result.model_info as any)['general.name']).toBe('my-gpt');
  });
});
