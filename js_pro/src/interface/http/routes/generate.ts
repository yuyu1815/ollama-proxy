/**
 * Generate Route
 * Ollama-compatible text generation endpoint
 */

import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { type CoreMessage, generateText, streamText } from 'ai';
import { ConfigManager } from '../../../infrastructure/config/manager.js';
import { createLanguageModel } from '../../../infrastructure/providers/factory.js';
import {
  toOllamaGenerateResponse,
  toOllamaGenerateStreamChunk,
} from '../../../domain/converter.js';
import type { OllamaGenerateRequest } from '../../../domain/types.js';
import i18n from '../../../infrastructure/i18n/index.js';
import { logWithLevel } from '../../../infrastructure/logging/logger.js';
import { getGlobalRateLimiter } from '../../../infrastructure/ratelimit/ratelimiter.js';

export function createGenerateRouter(configManager: ConfigManager) {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = (await c.req.json()) as OllamaGenerateRequest;
    const {
      model: modelName,
      prompt,
      stream = true,
      system,
      format: _format,
    } = body;
    const requestId = randomUUID();

    logWithLevel(configManager, 'info', 'Generate request received', {
      requestId,
      model: modelName,
      promptLength: prompt ? prompt.length : 0,
      stream,
      hasSystem: !!system,
      format: _format,
    });
    logWithLevel(configManager, 'info', 'Generate request body', {
      requestId,
      body: JSON.stringify(body, null, 2),
    });

    // Log processed messages
    logWithLevel(configManager, 'info', 'Generate processed prompt', {
      requestId,
      prompt,
      system,
    });

    if (!modelName || !prompt) {
      logWithLevel(configManager, 'warn', 'Generate validation failed', {
        requestId,
        hasModel: !!modelName,
        hasPrompt: !!prompt,
      });
      return c.json({ error: i18n.t('errors.model_and_prompt_required') }, 400);
    }

    const modelConfig = configManager.getModelConfig(modelName);
    if (!modelConfig) {
      logWithLevel(configManager, 'warn', 'Generate model not found', {
        requestId,
        model: modelName,
      });
      return c.json(
        { error: i18n.t('errors.model_not_found', { modelName }) },
        404
      );
    }

    // Rate limiting
    const rateLimiter = getGlobalRateLimiter();
    if (rateLimiter) {
      logWithLevel(configManager, 'info', 'Generate acquiring rate limit', {
        requestId,
        model: modelName,
        queueSize: rateLimiter.getQueueSize(modelName),
        runningCount: rateLimiter.getRunningCount(modelName),
      });
      await rateLimiter.acquire(modelName, requestId);
    }

    try {
      logWithLevel(configManager, 'info', 'Generate model resolved', {
        requestId,
        model: modelName,
        provider: modelConfig.provider,
        litellmModel: modelConfig.model_name,
        apiKeyExists: !!modelConfig.api_key,
        apiKeyPrefix: modelConfig.api_key
          ? modelConfig.api_key.substring(0, 10) + '...'
          : null,
        baseUrl: modelConfig.base_url,
      });
      const model = createLanguageModel(modelConfig);
      const messages: CoreMessage[] = [];

      if (system) {
        messages.push({ role: 'system', content: system });
      }
      messages.push({ role: 'user', content: prompt });

      logWithLevel(configManager, 'debug', 'Generate messages', {
        requestId,
        messages: JSON.stringify(messages, null, 2),
      });

      const options = body.options || {};

      logWithLevel(configManager, 'debug', 'Generate options', {
        requestId,
        options: JSON.stringify(options, null, 2),
        format: _format,
      });

      // Handle JSON format option (same as Python version)
      // Add system message to request JSON output when format is 'json'
      if (_format === 'json' && messages.length > 0) {
        const lastMsg = messages[messages.length - 1];
        if (lastMsg.role === 'user') {
          lastMsg.content += '\n\nPlease respond with valid JSON only.';
        }
      }

      if (stream) {
        // Streaming response
        const startTime = Date.now();
        const result = streamText({
          model,
          messages,
          temperature: options.temperature,
          maxTokens: options.num_predict,
          topP: options.top_p,
          maxRetries: modelConfig.max_retries ?? 1,
        });

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            try {
              logWithLevel(configManager, 'info', 'Generate stream started', {
                requestId,
                model: modelName,
              });
              let _content = '';
              let chunkCount = 0;
              let _reasoning = '';
              let usage = undefined;

              for await (const chunk of result.fullStream) {
                logWithLevel(configManager, 'debug', 'Generate stream event', {
                  requestId,
                  eventType: chunk.type,
                  eventData: JSON.stringify(chunk),
                });

                if (chunk.type === 'text-delta') {
                  chunkCount += 1;
                  _content += chunk.textDelta;
                  logWithLevel(
                    configManager,
                    'debug',
                    'Generate stream chunk',
                    {
                      requestId,
                      chunkIndex: chunkCount,
                      chunkLength: chunk.textDelta.length,
                    }
                  );
                  const data = toOllamaGenerateStreamChunk(
                    chunk.textDelta,
                    modelName,
                    false
                  );
                  controller.enqueue(
                    encoder.encode(JSON.stringify(data) + '\n')
                  );
                } else if (chunk.type === 'reasoning') {
                  _reasoning += chunk.textDelta;
                } else if (chunk.type === 'error') {
                  logWithLevel(
                    configManager,
                    'error',
                    'Generate stream error event',
                    {
                      requestId,
                      error: JSON.stringify(chunk.error),
                    }
                  );
                  throw chunk.error;
                } else if (chunk.type === 'finish') {
                  usage = chunk.usage;
                  logWithLevel(
                    configManager,
                    'info',
                    'Generate stream finish event',
                    {
                      requestId,
                      finishReason: chunk.finishReason,
                      usage: chunk.usage,
                    }
                  );
                }
              }

              // Final chunk
              const duration = (Date.now() - startTime) / 1000;
              const finalData = toOllamaGenerateResponse(
                '',
                modelName,
                duration,
                usage?.promptTokens ?? 0,
                usage?.completionTokens ?? 0
              );
              controller.enqueue(
                encoder.encode(JSON.stringify(finalData) + '\n')
              );
              logWithLevel(configManager, 'info', 'Generate stream completed', {
                requestId,
                model: modelName,
                durationSeconds: duration,
                chunkCount,
                outputChars: _content.length,
                response: _content,
              });
              controller.close();
            } catch (err) {
              logWithLevel(configManager, 'error', 'Generate stream error', {
                requestId,
                error: err instanceof Error ? err.message : String(err),
                stack: err instanceof Error ? err.stack : undefined,
              });
              controller.error(err);
            } finally {
              // Release rate limit
              if (rateLimiter) {
                rateLimiter.release(modelName);
                logWithLevel(configManager, 'info', 'Generate rate limit released', {
                  requestId,
                  model: modelName,
                });
              }
            }
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
          },
        });
      } else {
        // Non-streaming response
        try {
          const startTime = Date.now();
          const { text, usage } = await generateText({
            model,
            messages,
            temperature: options.temperature,
            maxTokens: options.num_predict,
            topP: options.top_p,
            maxRetries: modelConfig.max_retries ?? 5,
          });

          const duration = (Date.now() - startTime) / 1000;

          logWithLevel(configManager, 'info', 'Generate response completed', {
            requestId,
            model: modelName,
            durationSeconds: duration,
            outputChars: text.length,
            usage,
          });

          const response = toOllamaGenerateResponse(
            text,
            modelName,
            duration,
            usage?.promptTokens ?? 0,
            usage?.completionTokens ?? 0
          );

          return c.json(response);
        } finally {
          // Release rate limit
          if (rateLimiter) {
            rateLimiter.release(modelName);
            logWithLevel(configManager, 'info', 'Generate rate limit released', {
              requestId,
              model: modelName,
            });
          }
        }
      }
    } catch (error) {
      logWithLevel(configManager, 'error', 'Generate error', {
        requestId,
        message: error instanceof Error ? error.message : String(error),
      });

      // Handle Rate Limit (429) specifically
      if (
        error &&
        typeof error === 'object' &&
        'statusCode' in error &&
        (error as any).statusCode === 429
      ) {
        return c.json(
          { error: 'Rate limit reached for upstream provider' },
          429
        );
      }

      if (
        error &&
        typeof error === 'object' &&
        'name' in error &&
        (error as any).name === 'AI_RetryError'
      ) {
        const lastError = (error as any).lastError;
        if (lastError && lastError.statusCode === 429) {
          return c.json(
            {
              error: 'Rate limit reached for upstream provider (after retries)',
            },
            429
          );
        }
      }

      return c.json(
        {
          error:
            error instanceof Error
              ? error.message
              : i18n.t('errors.unknown_error'),
        },
        500
      );
    }
  });

  return router;
}
