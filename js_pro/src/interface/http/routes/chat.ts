/**
 * Chat Route
 * Ollama-compatible chat completion endpoint
 */

import { Hono } from 'hono';
import { type CoreMessage, streamText } from 'ai';
import { ConfigManager } from '../../../infrastructure/config/manager.js';
import { createLanguageModel } from '../../../infrastructure/providers/factory.js';
import {
  toOllamaChatResponse,
  toOllamaChatStreamChunk,
} from '../../../domain/converter.js';
import type { OllamaChatRequest } from '../../../domain/types.js';
import i18n from '../../../infrastructure/i18n/index.js';

export function createChatRouter(configManager: ConfigManager) {
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

    // Use guard clauses for validation
    if (!modelName || !messages || !Array.isArray(messages)) {
      return c.json(
        { error: i18n.t('errors.model_and_messages_required') },
        400
      );
    }

    const modelConfig = configManager.getModelConfig(modelName);
    if (!modelConfig) {
      return c.json(
        { error: i18n.t('errors.model_not_found', { modelName }) },
        404
      );
    }

    try {
      const model = createLanguageModel(modelConfig);
      const options = body.options || {};
      const coreMessages: CoreMessage[] = messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));

      const result = await streamText({
        model,
        messages: coreMessages,
        temperature: options.temperature,
        maxTokens: options.num_predict,
        topP: options.top_p,
      });

      // Handle Streaming Response
      if (stream) {
        const startTime = Date.now();
        const encoder = new TextEncoder();

        return new Response(
          new ReadableStream({
            async start(controller) {
              for await (const chunk of result.textStream) {
                const data = toOllamaChatStreamChunk(chunk, modelName, false);
                controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
              }
              const duration = (Date.now() - startTime) / 1000;
              const finalData = toOllamaChatResponse('', modelName, duration);
              controller.enqueue(
                encoder.encode(JSON.stringify(finalData) + '\n')
              );
              controller.close();
            },
          }),
          {
            headers: {
              'Content-Type': 'application/x-ndjson',
              'Transfer-Encoding': 'chunked',
            },
          }
        );
      }

      // Handle Non-Streaming Response
      const startTime = Date.now();
      const content = await result.text;
      const duration = (Date.now() - startTime) / 1000;

      return c.json(
        toOllamaChatResponse(content, modelName, duration, 0, 0, [])
      );
    } catch (error) {
      console.error('Chat error:', error);
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
