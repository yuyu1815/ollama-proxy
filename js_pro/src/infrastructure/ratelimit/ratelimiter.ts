/**
 * Rate Limiter
 * Token bucket implementation for request rate limiting
 * Supports per-model configuration
 */

import type { RateLimitConfig } from '../../domain/types.js';

interface RequestQueueItem {
  id: string;
  model: string;
  resolve: () => void;
  reject: (error: Error) => void;
  timestamp: number;
}

interface ModelState {
  tokens: number;
  lastRefill: number;
  running: number;
  queue: RequestQueueItem[];
}

export class RateLimiter {
  private configs: Map<string, Required<RateLimitConfig>> = new Map();
  private states: Map<string, ModelState> = new Map();
  private defaultConfig: Required<RateLimitConfig>;

  constructor(defaultConfig?: RateLimitConfig) {
    this.defaultConfig = {
      requests: defaultConfig?.requests ?? 10,
      window_ms: defaultConfig?.window_ms ?? 60000,
      concurrent: defaultConfig?.concurrent ?? 1,
    };
  }

  /**
   * Set rate limit configuration for a specific model
   */
  setModelConfig(model: string, config: RateLimitConfig | undefined): void {
    if (!config) {
      this.configs.delete(model);
      return;
    }

    this.configs.set(model, {
      requests: config.requests ?? this.defaultConfig.requests,
      window_ms: config.window_ms ?? this.defaultConfig.window_ms,
      concurrent: config.concurrent ?? this.defaultConfig.concurrent,
    });

    // Initialize state if not exists
    if (!this.states.has(model)) {
      this.states.set(model, {
        tokens: this.configs.get(model)!.requests,
        lastRefill: Date.now(),
        running: 0,
        queue: [],
      });
    }
  }

  /**
   * Get configuration for a model (model-specific or default)
   */
  private getConfig(model: string): Required<RateLimitConfig> {
    return this.configs.get(model) ?? this.defaultConfig;
  }

  /**
   * Get or initialize state for a model
   */
  private getState(model: string): ModelState {
    if (!this.states.has(model)) {
      const config = this.getConfig(model);
      this.states.set(model, {
        tokens: config.requests,
        lastRefill: Date.now(),
        running: 0,
        queue: [],
      });
    }
    return this.states.get(model)!;
  }

  /**
   * Acquire permission to make a request
   */
  async acquire(model: string, requestId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if we can process immediately
      if (this.canProcess(model)) {
        this.startProcessing(model);
        resolve();
        return;
      }

      // Add to queue
      const state = this.getState(model);
      const item: RequestQueueItem = {
        id: requestId,
        model,
        resolve,
        reject,
        timestamp: Date.now(),
      };
      state.queue.push(item);

      console.log(`[RateLimiter] Request ${requestId} for model ${model} queued. Queue size: ${state.queue.length}`);

      // Try to process queue
      this.processQueue(model);
    });
  }

  /**
   * Release the slot after request completion
   */
  release(model: string): void {
    const state = this.getState(model);
    if (state.running > 0) {
      state.running--;
    }

    // Process next item in queue
    this.processQueue(model);
  }

  /**
   * Check if we can process a request immediately
   */
  private canProcess(model: string): boolean {
    this.refillBucket(model);

    const state = this.getState(model);
    const config = this.getConfig(model);

    return state.tokens > 0 && state.running < config.concurrent;
  }

  /**
   * Start processing a request
   */
  private startProcessing(model: string): void {
    const state = this.getState(model);
    state.tokens--;
    state.running++;
  }

  /**
   * Process the queue for a model
   */
  private processQueue(model: string): void {
    const state = this.getState(model);

    while (state.queue.length > 0 && this.canProcess(model)) {
      const item = state.queue.shift();
      if (item) {
        console.log(`[RateLimiter] Processing queued request ${item.id} for model ${model}. Remaining queue: ${state.queue.length}`);
        this.startProcessing(model);
        item.resolve();
      }
    }
  }

  /**
   * Refill tokens based on time elapsed
   */
  private refillBucket(model: string): void {
    const state = this.getState(model);
    const config = this.getConfig(model);

    const now = Date.now();
    const elapsed = now - state.lastRefill;

    // Calculate tokens to add
    const tokensToAdd = Math.floor((elapsed / config.window_ms) * config.requests);

    if (tokensToAdd > 0) {
      state.tokens = Math.min(state.tokens + tokensToAdd, config.requests);
      state.lastRefill = now;
    }
  }

  /**
   * Get queue size for a model
   */
  getQueueSize(model: string): number {
    return this.getState(model).queue.length;
  }

  /**
   * Get running requests count for a model
   */
  getRunningCount(model: string): number {
    return this.getState(model).running;
  }

  /**
   * Update default configuration
   */
  updateDefaultConfig(config: Partial<RateLimitConfig>): void {
    this.defaultConfig = { ...this.defaultConfig, ...config };
  }
}

// Global instance
let globalRateLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(): RateLimiter | null {
  return globalRateLimiter;
}

export function setGlobalRateLimiter(limiter: RateLimiter): void {
  globalRateLimiter = limiter;
}
