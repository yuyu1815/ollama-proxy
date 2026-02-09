/**
 * AI Provider Factory
 * Creates AI SDK provider instances based on configuration
 */

import { createOpenAI, openai } from '@ai-sdk/openai';
import { anthropic, createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI, google } from '@ai-sdk/google';
import { createXai, xai } from '@ai-sdk/xai';
import { createMistral, mistral } from '@ai-sdk/mistral';
import { cohere, createCohere } from '@ai-sdk/cohere';
import { createDeepSeek, deepseek } from '@ai-sdk/deepseek';
import { createFireworks, fireworks } from '@ai-sdk/fireworks';
import { createGroq, groq } from '@ai-sdk/groq';
import { createTogetherAI, togetherai } from '@ai-sdk/togetherai';
import type { ModelConfig, ProviderType } from '../../domain/types.js';

// Azure and Bedrock require special handling
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLanguageModel(config: ModelConfig): any {
  const { provider, model_name, api_key, base_url } = config;

  const options: Record<string, string> = {};
  if (api_key) options.apiKey = api_key;
  if (base_url) options.baseURL = base_url;

  switch (provider) {
    case 'openai':
      if (api_key || base_url) {
        return createOpenAI(options)(model_name);
      }
      return openai(model_name);

    case 'anthropic':
      if (api_key || base_url) {
        return createAnthropic(options)(model_name);
      }
      return anthropic(model_name);

    case 'google':
      if (api_key || base_url) {
        return createGoogleGenerativeAI(options)(model_name);
      }
      return google(model_name);

    case 'xai':
      if (api_key || base_url) {
        return createXai(options)(model_name);
      }
      return xai(model_name);

    case 'mistral':
      if (api_key || base_url) {
        return createMistral(options)(model_name);
      }
      return mistral(model_name);

    case 'cohere':
      if (api_key || base_url) {
        return createCohere(options)(model_name);
      }
      return cohere(model_name);

    case 'deepseek':
      if (api_key || base_url) {
        return createDeepSeek(options)(model_name);
      }
      return deepseek(model_name);

    case 'fireworks':
      if (api_key || base_url) {
        return createFireworks(options)(model_name);
      }
      return fireworks(model_name);

    case 'groq':
      if (api_key || base_url) {
        return createGroq(options)(model_name);
      }
      return groq(model_name);

    case 'togetherai':
      if (api_key || base_url) {
        return createTogetherAI(options)(model_name);
      }
      return togetherai(model_name);

    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}

export function isProviderSupported(
  provider: string
): provider is ProviderType {
  const supported: ProviderType[] = [
    'openai',
    'anthropic',
    'google',
    'xai',
    'mistral',
    'cohere',
    'deepseek',
    'togetherai',
    'groq',
    'fireworks',
  ];
  return supported.includes(provider as ProviderType);
}
