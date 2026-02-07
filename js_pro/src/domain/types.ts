/**
 * Domain Types
 * Core type definitions for Ollama Proxy
 */

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'azure'
  | 'mistral'
  | 'cohere'
  | 'deepseek'
  | 'togetherai'
  | 'groq'
  | 'fireworks'
  | 'bedrock';

export interface ModelConfig {
  name: string;
  provider: ProviderType;
  model_name: string;
  api_key?: string;
  base_url?: string;
  default_params?: Record<string, unknown>;
}

export interface ProviderConfig {
  provider: ProviderType;
  api_key?: string;
  base_url?: string;
  models: ModelConfig[];
}

export interface ServerConfig {
  host: string;
  port: number;
  providers_file: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
}

export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  system?: string;
  format?: 'json';
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
  tools?: unknown[];
}

export interface OllamaResponse {
  model: string;
  created_at: string;
  response?: string;
  message?: {
    role: string;
    content: string;
    images?: null;
    tool_calls?: unknown[];
  };
  done: boolean;
  done_reason?: 'stop' | 'length';
  total_duration: number;
  load_duration: number;
  prompt_eval_count: number;
  prompt_eval_duration: number;
  eval_count: number;
  eval_duration: number;
  context?: number[];
}
