/**
 * Domain Types
 * Core type definitions for Ollama Proxy
 */

export type ProviderType =
  | 'openai'
  | 'anthropic'
  | 'google'
  | 'xai'
  | 'mistral'
  | 'cohere'
  | 'deepseek'
  | 'togetherai'
  | 'groq'
  | 'fireworks';

export interface ModelConfig {
  name: string;
  provider: string;
  provider_type: ProviderType;
  model_name: string;
  api_key?: string;
  base_url?: string;
  max_retries?: number;
  default_params?: Record<string, unknown>;
  /** Model-specific rate limit (highest priority) */
  rate_limit?: RateLimitConfig;
}

export interface ProviderConfig {
  provider: ProviderType;
  api_key?: string;
  base_url?: string;
  max_retries?: number;
  /** Provider-specific rate limit (medium priority) */
  rate_limit?: RateLimitConfig;
  models: ModelConfig[];
}

/**
 * Rate limit configuration
 */
export interface RateLimitConfig {
  /** Maximum requests per window (default: 10) */
  requests?: number;
  /** Window size in milliseconds (default: 60000) */
  window_ms?: number;
  /** Maximum concurrent requests (default: 1) */
  concurrent?: number;
}

export interface ServerConfig {
  host: string;
  port: number;
  providers_file: string;
  log_level: 'debug' | 'info' | 'warn' | 'error';
  /** Global rate limit configuration */
  rate_limit?: RateLimitConfig;
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

export interface UsageLog {
  timestamp: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}

export interface UsageStats {
  total_input_tokens: number;
  total_output_tokens: number;
  count: number;
}
