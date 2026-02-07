/**
 * Ollama Response Converter
 * Converts AI SDK responses to Ollama format
 */

import type { OllamaResponse, OllamaModel } from '../domain/types.js';

function getTimestamp(): string {
  return new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');
}

function nsFromSeconds(seconds: number): number {
  return Math.floor(seconds * 1e9);
}

export function toOllamaGenerateResponse(
  content: string,
  modelName: string,
  durationSeconds: number,
  promptTokens: number = 0,
  completionTokens: number = 0
): OllamaResponse {
  return {
    model: modelName,
    created_at: getTimestamp(),
    response: content,
    done: true,
    done_reason: 'stop',
    context: [],
    total_duration: nsFromSeconds(durationSeconds),
    load_duration: 0,
    prompt_eval_count: promptTokens,
    prompt_eval_duration: 0,
    eval_count: completionTokens,
    eval_duration: 0,
  };
}

export function toOllamaGenerateStreamChunk(
  content: string,
  modelName: string,
  done: boolean = false
): Partial<OllamaResponse> {
  const data: Partial<OllamaResponse> = {
    model: modelName,
    created_at: getTimestamp(),
    response: content,
    done,
  };

  if (done) {
    data.done_reason = 'stop';
    data.context = [];
    data.total_duration = 0;
    data.load_duration = 0;
    data.prompt_eval_count = 0;
    data.prompt_eval_duration = 0;
    data.eval_count = 0;
    data.eval_duration = 0;
  }

  return data;
}

export function toOllamaChatResponse(
  content: string,
  modelName: string,
  durationSeconds: number,
  promptTokens: number = 0,
  completionTokens: number = 0,
  toolCalls: unknown[] = []
): OllamaResponse {
  return {
    model: modelName,
    created_at: getTimestamp(),
    message: {
      role: 'assistant',
      content,
      images: null,
      tool_calls: toolCalls,
    },
    done: true,
    done_reason: 'stop',
    total_duration: nsFromSeconds(durationSeconds),
    load_duration: 0,
    prompt_eval_count: promptTokens,
    prompt_eval_duration: 0,
    eval_count: completionTokens,
    eval_duration: 0,
  };
}

export function toOllamaChatStreamChunk(
  content: string,
  modelName: string,
  done: boolean = false,
  toolCalls: unknown[] = []
): Partial<OllamaResponse> {
  const data: Partial<OllamaResponse> = {
    model: modelName,
    created_at: getTimestamp(),
    message: {
      role: 'assistant',
      content,
      images: null,
      tool_calls: toolCalls,
    },
    done,
  };

  if (done) {
    data.done_reason = 'stop';
    data.total_duration = 0;
    data.load_duration = 0;
    data.prompt_eval_count = 0;
    data.prompt_eval_duration = 0;
    data.eval_count = 0;
    data.eval_duration = 0;
  }

  return data;
}

export function toOllamaModelListItem(
  modelName: string,
  provider: string,
  actualModel: string
): OllamaModel {
  return {
    name: modelName,
    model: modelName,
    modified_at: getTimestamp(),
    size: 0,
    digest: `${provider}/${actualModel}`,
    details: {
      format: 'api',
      family: provider,
      families: null,
      parameter_size: 'unknown',
      quantization_level: 'none',
    },
  };
}

export function toOllamaModelInfo(
  modelName: string,
  provider: string,
  actualModel: string
): Record<string, unknown> {
  return {
    modelfile: `# Model: ${modelName}\nFROM ${provider}/${actualModel}`,
    parameters: '',
    template: '',
    details: {
      format: 'api',
      family: provider,
      families: null,
      parameter_size: 'unknown',
      quantization_level: 'none',
    },
    model_info: {
      'general.architecture': 'api',
      'general.name': modelName,
    },
    license: '',
  };
}
