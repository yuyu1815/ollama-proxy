/**
 * Generate Route
 * Ollama-compatible text generation endpoint
 */

import { Hono } from 'hono';
import { type CoreMessage, streamText } from 'ai';
import { ConfigManager } from '../../../infrastructure/config/manager.js';
import { createLanguageModel } from '../../../infrastructure/providers/factory.js';
import {
  toOllamaGenerateResponse,
  toOllamaGenerateStreamChunk,
} from '../../../domain/converter.js';
import type { OllamaGenerateRequest } from '../../../domain/types.js';
import i18n from '../../../infrastructure/i18n/index.js';

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

    if (!modelName || !prompt) {
      return c.json({ error: i18n.t('errors.model_and_prompt_required') }, 400);
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
      const messages: CoreMessage[] = [];

      if (system) {
        messages.push({ role: 'system', content: system });
      }
      messages.push({ role: 'user', content: prompt });

      const options = body.options || {};

      if (stream) {
        // Streaming response
        const startTime = Date.now();
        const result = streamText({
          model,
          messages,
          temperature: options.temperature,
          maxTokens: options.num_predict,
          topP: options.top_p,
        });

        const encoder = new TextEncoder();

        const stream = new ReadableStream({
          async start(controller) {
            let _content = '';

            for await (const chunk of result.textStream) {
              _content += chunk;
              const data = toOllamaGenerateStreamChunk(chunk, modelName, false);
              controller.enqueue(encoder.encode(JSON.stringify(data) + '\n'));
            }

            // Final chunk
            const duration = (Date.now() - startTime) / 1000;
            const finalData = toOllamaGenerateResponse('', modelName, duration);
            controller.enqueue(
              encoder.encode(JSON.stringify(finalData) + '\n')
            );
            controller.close();
          },
        });

        return new Response(stream, {
          headers: {
            'Content-Type': 'application/x-ndjson',
            'Transfer-Encoding': 'chunked',
          },
        });
      } else {
        // Non-streaming response
        const startTime = Date.now();
        const result = await streamText({
          model,
          messages,
          temperature: options.temperature,
          maxTokens: options.num_predict,
          topP: options.top_p,
        });

        const content = await result.text;
        const duration = (Date.now() - startTime) / 1000;

        const response = toOllamaGenerateResponse(
          content,
          modelName,
          duration,
          0, // prompt tokens not available in simple API
          0 // completion tokens not available in simple API
        );

        return c.json(response);
      }
    } catch (error) {
      console.error('Generate error:', error);
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
