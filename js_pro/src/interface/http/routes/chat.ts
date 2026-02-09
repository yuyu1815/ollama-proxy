/**
 * Chat Route
 * Ollama-compatible chat completion endpoint
 */

import { randomUUID } from 'crypto';
import { Hono } from 'hono';
import { type CoreMessage, generateText, streamText } from 'ai';
import { ConfigManager } from '../../../infrastructure/config/manager.js';
import { createLanguageModel } from '../../../infrastructure/providers/factory.js';
import { UsageStorage } from '../../../infrastructure/storage/usage.js';
import {
  toOllamaChatResponse,
  toOllamaChatStreamChunk,
} from '../../../domain/converter.js';
import type { OllamaChatRequest } from '../../../domain/types.js';
import i18n from '../../../infrastructure/i18n/index.js';
import { logWithLevel } from '../../../infrastructure/logging/logger.js';
import { getGlobalRateLimiter } from '../../../infrastructure/ratelimit/ratelimiter.js';

export function createChatRouter(
  configManager: ConfigManager,
  usageStorage: UsageStorage
) {
  const router = new Hono();

  router.post('/', async (c) => {
    const body = (await c.req.json()) as OllamaChatRequest;
    const {
      model: modelName,
      messages,
      stream = true,
      format: _format,
      tools: _tools,
    } = body;
    const requestId = randomUUID();

    logWithLevel(configManager, 'info', 'Chat request received', {
      requestId,
      model: modelName,
      messageCount: Array.isArray(messages) ? messages.length : 0,
      stream,
      hasTools: Array.isArray(_tools) ? _tools.length > 0 : !!_tools,
      format: _format,
    });
    logWithLevel(configManager, 'info', 'Chat request body', {
      requestId,
      body: JSON.stringify(body, null, 2),
    });

    // Log processed messages
    logWithLevel(configManager, 'info', 'Chat processed messages', {
      requestId,
      messages: JSON.stringify(messages, null, 2),
    });

    // Use guard clauses for validation
    if (!modelName || !messages || !Array.isArray(messages)) {
      logWithLevel(configManager, 'warn', 'Chat validation failed', {
        requestId,
        hasModel: !!modelName,
        hasMessages: Array.isArray(messages),
      });
      return c.json(
        { error: i18n.t('errors.model_and_messages_required') },
        400
      );
    }

    const modelConfig = configManager.getModelConfig(modelName);
    if (!modelConfig) {
      logWithLevel(configManager, 'warn', 'Chat model not found', {
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
      logWithLevel(configManager, 'info', 'Chat acquiring rate limit', {
        requestId,
        model: modelName,
        queueSize: rateLimiter.getQueueSize(modelName),
        runningCount: rateLimiter.getRunningCount(modelName),
      });
      await rateLimiter.acquire(modelName, requestId);
    }

    try {
      logWithLevel(configManager, 'info', 'Chat model resolved', {
        requestId,
        model: modelName,
        provider: modelConfig.provider,
        litellmModel: modelConfig.model_name,
        apiKeyExists: !!modelConfig.api_key,
        apiKeyPrefix: modelConfig.api_key
          ? modelConfig.api_key.substring(0, 10) + '...'
          : undefined,
        baseUrl: modelConfig.base_url,
      });
      const model = createLanguageModel(modelConfig);
      const options = body.options || {};
      const coreMessages: CoreMessage[] = messages.map((msg) => ({
        role: msg.role as any,
        content: msg.content,
      }));

      logWithLevel(configManager, 'debug', 'Chat core messages', {
        requestId,
        coreMessages: JSON.stringify(coreMessages, null, 2),
      });

      logWithLevel(configManager, 'debug', 'Chat options', {
        requestId,
        options: JSON.stringify(options, null, 2),
        format: _format,
        hasTools: Array.isArray(_tools) ? _tools.length > 0 : !!_tools,
        toolsCount: Array.isArray(_tools) ? _tools.length : 0,
      });

      // Handle JSON format option (same as Python version)
      // Add instruction to request JSON output when format is 'json'
      if (_format === 'json' && coreMessages.length > 0) {
        const lastMsg = coreMessages[coreMessages.length - 1];
        if (lastMsg.role === 'user') {
          lastMsg.content += '\n\nPlease respond with valid JSON only.';
        }
      }

      // Handle tools option (same as Python version)
      // Convert OpenAI-compatible tools format to AI SDK tools format
      const tools =
        _tools && Array.isArray(_tools) && _tools.length > 0
          ? Object.fromEntries(
              _tools.map((t: any) => [
                t.function?.name || t.name,
                {
                  description: t.function?.description || t.description || '',
                  parameters: jsonSchema(
                    t.function?.parameters || t.parameters || {}
                  ),
                },
              ])
            )
          : undefined;

      // Handle Streaming Response
      if (stream) {
        const result = await streamText({
          model,
          messages: coreMessages,
          temperature: options.temperature,
          maxTokens: options.num_predict,
          topP: options.top_p,
          maxRetries: modelConfig.max_retries ?? 5,
          ...(tools && { tools }),
          onFinish: async (event) => {
            await usageStorage.addLog(
              modelConfig.provider,
              modelName,
              event.usage.promptTokens,
              event.usage.completionTokens
            );
            logWithLevel(configManager, 'info', 'Chat usage recorded', {
              requestId,
              model: modelName,
              provider: modelConfig.provider,
              promptTokens: event.usage.promptTokens,
              completionTokens: event.usage.completionTokens,
            });
          },
        });

        const startTime = Date.now();
        const encoder = new TextEncoder();

        return new Response(
          new ReadableStream({
            async start(controller) {
              try {
                logWithLevel(configManager, 'info', 'Chat stream started', {
                  requestId,
                  model: modelName,
                });
                let chunkCount = 0;
                let totalChars = 0;
                let content = '';
                let reasoning = '';
                let usage = undefined;
                const toolCalls: any[] = [];

                for await (const chunk of result.fullStream) {
                  logWithLevel(configManager, 'debug', 'Chat stream event', {
                    requestId,
                    eventType: chunk.type,
                    eventData: JSON.stringify(chunk),
                  });

                  if (chunk.type === 'text-delta') {
                    chunkCount += 1;
                    totalChars += chunk.textDelta.length;
                    content += chunk.textDelta;
                    logWithLevel(configManager, 'debug', 'Chat stream chunk', {
                      requestId,
                      chunkIndex: chunkCount,
                      chunkLength: chunk.textDelta.length,
                    });
                    const data = toOllamaChatStreamChunk(
                      chunk.textDelta,
                      modelName,
                      false
                    );
                    controller.enqueue(
                      encoder.encode(JSON.stringify(data) + '\n')
                    );
                  } else if (chunk.type === 'reasoning') {
                    reasoning += chunk.textDelta;
                  } else if (chunk.type === 'tool-call') {
                    toolCalls.push({
                      id: chunk.toolCallId,
                      type: 'function',
                      function: {
                        name: chunk.toolName,
                        arguments: JSON.stringify(chunk.args),
                      },
                    });
                  } else if (chunk.type === 'error') {
                    logWithLevel(
                      configManager,
                      'error',
                      'Chat stream error event',
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
                      'Chat stream finish event',
                      {
                        requestId,
                        finishReason: chunk.finishReason,
                        usage: chunk.usage,
                      }
                    );
                  }
                }

                const duration = (Date.now() - startTime) / 1000;
                const finalData = toOllamaChatResponse(
                  '',
                  modelName,
                  duration,
                  usage?.promptTokens ?? 0,
                  usage?.completionTokens ?? 0,
                  toolCalls
                );
                controller.enqueue(
                  encoder.encode(JSON.stringify(finalData) + '\n')
                );
                logWithLevel(configManager, 'info', 'Chat stream completed', {
                  requestId,
                  model: modelName,
                  durationSeconds: duration,
                  chunkCount,
                  outputChars: totalChars,
                  response: content,
                });
                controller.close();
              } catch (err) {
                logWithLevel(configManager, 'error', 'Chat stream error', {
                  requestId,
                  message: err instanceof Error ? err.message : String(err),
                });
                controller.error(err);
              } finally {
                // Release rate limit
                if (rateLimiter) {
                  rateLimiter.release(modelName);
                  logWithLevel(configManager, 'info', 'Chat rate limit released', {
                    requestId,
                    model: modelName,
                  });
                }
              }
            },
          }),
          {
            headers: {
              'Content-Type': 'application/x-ndjson',
            },
          }
        );
      } else {
        // Handle Non-Streaming Response
        try {
          const startTime = Date.now();

          const {
            text,
            usage,
            toolCalls: toolCallsResult,
          } = await generateText({
            model,
            messages: coreMessages,
            temperature: options.temperature,
            maxTokens: options.num_predict,
            topP: options.top_p,
            maxRetries: modelConfig.max_retries ?? 5,
            ...(tools && { tools }),
          });

          const content = text;
          // Convert AI SDK tool calls to Ollama format
          const toolCalls = toolCallsResult
            ? toolCallsResult.map((tc: any) => ({
                id: tc.toolCallId,
                type: 'function',
                function: {
                  name: tc.toolName,
                  arguments: JSON.stringify(tc.args),
                },
              }))
            : [];

          const duration = (Date.now() - startTime) / 1000;

          logWithLevel(configManager, 'info', 'Chat response completed', {
            requestId,
            model: modelName,
            durationSeconds: duration,
            outputChars: content.length,
            usage,
            toolCalls: toolCalls.length,
          });

          // Record usage for non-streaming
          if (usage) {
            await usageStorage.addLog(
              modelConfig.provider,
              modelName,
              usage.promptTokens,
              usage.completionTokens
            );
          }
        } finally {
          // Release rate limit
          if (rateLimiter) {
            rateLimiter.release(modelName);
            logWithLevel(configManager, 'info', 'Chat rate limit released', {
              requestId,
              model: modelName,
            });
          }
        }

        return c.json(
          toOllamaChatResponse(
            content,
            modelName,
            duration,
            usage?.promptTokens ?? 0,
            usage?.completionTokens ?? 0,
            toolCalls
          )
        );
      }
    } catch (error) {
      logWithLevel(configManager, 'error', 'Chat error', {
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
