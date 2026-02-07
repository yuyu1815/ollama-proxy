/**
 * AI Provider Factory
 * Creates AI SDK provider instances based on configuration
 */

import { openai } from '@ai-sdk/openai';
import { anthropic } from '@ai-sdk/anthropic';
import { google } from '@ai-sdk/google';
import { xai } from '@ai-sdk/xai';
import { mistral } from '@ai-sdk/mistral';
import { cohere } from '@ai-sdk/cohere';
import { deepseek } from '@ai-sdk/deepseek';
import { fireworks } from '@ai-sdk/fireworks';
import { groq } from '@ai-sdk/groq';
import { togetherai } from '@ai-sdk/togetherai';
import type { ModelConfig, ProviderType } from '../../domain/types.js';

// Azure and Bedrock require special handling
 // eslint-disable-next-line @typescript-eslint/no-explicit-any
export function createLanguageModel(config: ModelConfig): any {
  const { provider, model_name, api_key, base_url } = config;

  const commonOptions: Record<string, string> = {};
  if (api_key) commonOptions.apiKey = api_key;
  if (base_url) commonOptions.baseURL = base_url;

  switch (provider) {
    case 'openai':
      return openai(model_name, commonOptions);

    case 'anthropic':
      return anthropic(model_name, commonOptions);

    case 'google':
      return google(model_name, commonOptions);

    case 'xai':
      return xai(model_name, commonOptions);

    case 'mistral':
      return mistral(model_name, commonOptions);

    case 'cohere':
      return cohere(model_name, commonOptions);

    case 'deepseek':
      return deepseek(model_name);

    case 'fireworks':
      return fireworks(model_name);

    case 'groq':
      return groq(model_name, commonOptions);

    case 'togetherai':
      return togetherai(model_name);

    case 'azure':
      // Azure requires special handling via environment variables
      // or explicit azure provider setup
      return openai(model_name, {
        ...commonOptions,
        // Azure-specific configuration would go here
      });

    case 'bedrock':
      // Bedrock requires AWS credentials
      throw new Error(
        'Bedrock provider requires AWS credentials setup. Please use other providers or configure AWS.'
      );

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
    'azure',
    'mistral',
    'cohere',
    'deepseek',
    'togetherai',
    'groq',
    'fireworks',
    'bedrock',
  ];
  return supported.includes(provider as ProviderType);
}
