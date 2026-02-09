import { describe, expect, it } from 'vitest';
import { isProviderSupported } from './factory.js';

describe('isProviderSupported', () => {
  it('サポート済みプロバイダーはtrueを返す', () => {
    // Arrange
    const supported = [
      'openai',
      'anthropic',
      'google',
      'xai',
      'azure',
      'mistral',
      'cohere',
      'deepseek',
      'togetherai',
      'groq',
      'fireworks',
      'bedrock',
    ];

    // Act & Assert
    for (const provider of supported) {
      expect(isProviderSupported(provider)).toBe(true);
    }
  });

  it('未サポートプロバイダーはfalseを返す', () => {
    // Arrange
    const unsupported = ['unknown', 'ollama', '', 'OPENAI'];

    // Act & Assert
    for (const provider of unsupported) {
      expect(isProviderSupported(provider)).toBe(false);
    }
  });
});
