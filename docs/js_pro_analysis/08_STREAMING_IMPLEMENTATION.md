# ストリーミング実装詳細解説

このドキュメントでは、Ollama Proxy JS プロジェクトで実装されているストリーミング処理の複雑なロジックについて詳細に解説します。

## 目次

1. [概要](#概要)
2. [ストリーミングアーキテクチャ](#ストリーミングアーキテクチャ)
3. [実装詳細](#実装詳細)
4. [チャンク処理ロジック](#チャンク処理ロジック)
5. [エラーハンドリング](#エラーハンドリング)
6. [パフォーマンス最適化](#パフォーマンス最適化)

---

## 概要

### ストリーミングの目的

ストリーミング処理は、以下の目的で実装されています：

1. **リアルタイム応答**: ユーザーに生成テキストを逐次的に表示
2. **UX の向上**: 最初のレスポンス時間（TTFB）を短縮
3. **リソース効率**: メモリ使用量を削減（全レスポンスを保持しない）
4. **Ollama 互換性**: Ollama API のストリーミング形式を模倣

### サポートされるエンドポイント

| エンドポイント | ストリーミング対応 | 形式 |
|---------------|------------------|------|
| `POST /api/generate` | ✓ | NDJSON |
| `POST /api/chat` | ✓ | NDJSON |

### NDJSON 形式

NDJSON (Newline-Delimited JSON) は、JSON オブジェクトを改行で区切った形式です：

```json
{"model":"gpt-4","created_at":"2025-02-09T12:00:00.000Z","response":"Hello","done":false}
{"model":"gpt-4","created_at":"2025-02-09T12:00:00.100Z","response":" World","done":false}
{"model":"gpt-4","created_at":"2025-02-09T12:00:00.200Z","response":"","done":true,"done_reason":"stop"}
```

---

## ストリーミングアーキテクチャ

### 全体フロー

```
クライアント
  ↓ (HTTP Request)
Hono Router
  ↓ (generateText/streamText)
Vercel AI SDK
  ↓ (Stream Events)
Stream Processor
  ↓ (Ollama Format Converter)
ReadableStream
  ↓ (NDJSON)
クライアント
```

### 主要コンポーネント

1. **Vercel AI SDK の streamText()**
   - AI プロバイダーからストリーミングレスポンスを取得
   - 様々なイベントを発行

2. **Stream Processor**
   - AI SDK のイベントを Ollama 形式に変換
   - チャンクごとの処理

3. **ReadableStream**
   - Web Streams API 標準
   - バッファリングとバックプレッシャー制御

4. **TextEncoder**
   - 文字列を UTF-8 バイト列にエンコード
   - 効率的なバイナリデータ転送

---

## 実装詳細

### generate.ts のストリーミング実装

#### 基本構造

```typescript
router.post('/', async (c) => {
  const body = await c.req.json();
  const { model, prompt, stream = true } = body;
  
  // モデル設定を取得
  const modelConfig = configManager.getModelConfig(model);
  
  // ストリーミングリクエストを作成
  const result = streamText({
    model: createLanguageModel(modelConfig),
    messages: [{ role: 'user', content: prompt }],
    temperature: options.temperature,
    maxTokens: options.num_predict,
    maxRetries: modelConfig.max_retries ?? 1
  });
  
  // ReadableStream を作成
  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        
        for await (const chunk of result.fullStream) {
          // チャンク処理
          if (chunk.type === 'text-delta') {
            const data = toOllamaGenerateStreamChunk(
              chunk.textDelta,
              model,
              false
            );
            controller.enqueue(
              encoder.encode(JSON.stringify(data) + '\n')
            );
          }
        }
        
        // 最終チャンク
        const finalData = toOllamaGenerateResponse(...);
        controller.enqueue(
          encoder.encode(JSON.stringify(finalData) + '\n')
        );
        
        controller.close();
      }
    }),
    {
      headers: {
        'Content-Type': 'application/x-ndjson'
      }
    }
  );
});
```

### chat.ts のストリーミング実装

#### 追加機能

chat.ts では、generate.ts に加えて以下の機能をサポート：

1. **Tool Calls の処理**
2. **Reasoning デルタの処理**
3. **Usage 統計の記録**

#### 完全な実装

```typescript
router.post('/', async (c) => {
  const body = await c.req.json();
  const { model, messages, stream = true, tools } = body;
  const requestId = randomUUID();
  
  // レート制限
  const rateLimiter = getGlobalRateLimiter();
  if (rateLimiter) {
    await rateLimiter.acquire(model, requestId);
  }
  
  try {
    const result = streamText({
      model: createLanguageModel(modelConfig),
      messages: coreMessages,
      temperature: options.temperature,
      maxTokens: options.num_predict,
      tools: convertedTools,  // ツール変換
      maxRetries: modelConfig.max_retries ?? 5,
      onFinish: async (event) => {
        // 使用量を記録
        await usageStorage.addLog(
          modelConfig.provider,
          model,
          event.usage.promptTokens,
          event.usage.completionTokens
        );
      }
    });
    
    const startTime = Date.now();
    const encoder = new TextEncoder();
    
    return new Response(
      new ReadableStream({
        async start(controller) {
          try {
            let content = '';
            let reasoning = '';
            let toolCalls: any[] = [];
            let usage = undefined;
            
            for await (const chunk of result.fullStream) {
              switch (chunk.type) {
                case 'text-delta':
                  content += chunk.textDelta;
                  const data = toOllamaChatStreamChunk(
                    chunk.textDelta,
                    model,
                    false
                  );
                  controller.enqueue(
                    encoder.encode(JSON.stringify(data) + '\n')
                  );
                  break;
                  
                case 'reasoning':
                  reasoning += chunk.textDelta;
                  break;
                  
                case 'tool-call':
                  toolCalls.push({
                    id: chunk.toolCallId,
                    type: 'function',
                    function: {
                      name: chunk.toolName,
                      arguments: JSON.stringify(chunk.args)
                    }
                  });
                  break;
                  
                case 'error':
                  throw chunk.error;
                  
                case 'finish':
                  usage = chunk.usage;
                  break;
              }
            }
            
            // 最終チャンク
            const duration = (Date.now() - startTime) / 1000;
            const finalData = toOllamaChatResponse(
              '',  // 空のレスポンス
              model,
              duration,
              usage?.promptTokens ?? 0,
              usage?.completionTokens ?? 0,
              toolCalls
            );
            controller.enqueue(
              encoder.encode(JSON.stringify(finalData) + '\n')
            );
            
            controller.close();
          } catch (err) {
            controller.error(err);
          } finally {
            // レート制限を解放
            if (rateLimiter) {
              rateLimiter.release(model);
            }
          }
        }
      }),
      {
        headers: {
          'Content-Type': 'application/x-ndjson'
        }
      }
    );
  } catch (error) {
    // エラーハンドリング
  }
});
```

---

## チャンク処理ロジック

### Vercel AI SDK のイベントタイプ

| イベントタイプ | 説明 | chat.ts | generate.ts |
|--------------|------|---------|-------------|
| `text-delta` | テキストの増分 | ✓ | ✓ |
| `reasoning` | 推論プロセス | ✓ | ✓ |
| `tool-call` | ツール呼び出し | ✓ | - |
| `error` | エラーイベント | ✓ | ✓ |
| `finish` | 完了イベント | ✓ | ✓ |
| `tool-result` | ツール実行結果 | - | - |

### イベント処理フロー

```
Stream Start
  ↓
[text-delta] → テキストチャンクを送信
  ↓
[reasoning] → 内部状態に保存（送信しない）
  ↓
[tool-call]  → ツール呼び出しを記録
  ↓
[finish]     → 使用量統計を記録
  ↓
Final Chunk  → done=true のチャンクを送信
  ↓
Stream Close
```

### converter.ts の変換関数

#### Generate 用

```typescript
export function toOllamaGenerateStreamChunk(
  content: string,
  modelName: string,
  done: boolean = false
): Partial<OllamaResponse> {
  const data: Partial<OllamaResponse> = {
    model: modelName,
    created_at: getTimestamp(),
    response: content,
    done
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
```

#### Chat 用

```typescript
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
      tool_calls: toolCalls
    },
    done
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
```

---

## エラーハンドリング

### エラーの種類と処理

#### 1. ストリーミング中のエラー

```typescript
for await (const chunk of result.fullStream) {
  if (chunk.type === 'error') {
    // エラーログを記録
    logWithLevel(configManager, 'error', 'Stream error', {
      requestId,
      error: JSON.stringify(chunk.error)
    });
    
    // エラーをスロー
    throw chunk.error;
  }
}
```

#### 2. レート制限エラー

```typescript
catch (error) {
  // 429 エラーを特別に処理
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
  
  // リトライエラーの処理
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
          error: 'Rate limit reached (after retries)'
        },
        429
      );
    }
  }
  
  // 一般的なエラー
  return c.json(
    {
      error: error instanceof Error 
        ? error.message 
        : i18n.t('errors.unknown_error')
    },
    500
  );
}
```

#### 3. finally ブロックでのクリーンアップ

```typescript
try {
  // ストリーミング処理
} catch (err) {
  controller.error(err);
} finally {
  // レート制限を解放
  if (rateLimiter) {
    rateLimiter.release(model);
  }
}
```

---

## パフォーマンス最適化

### バックプレッシャー制御

ReadableStream は自動的にバックプレッシャーを制御します：

```typescript
const stream = new ReadableStream({
  async start(controller) {
    // controller.enqueue() は内部バッファが満杯の場合に
    // 自動的に待機する
    for await (const chunk of result.fullStream) {
      controller.enqueue(encoder.encode(data));
      // バッファが満杯の場合、ここで一時停止
    }
  }
});
```

### バッファサイズの考慮事項

| ファクター | 推奨値 | 説明 |
|-----------|--------|------|
| チャンクサイズ | 1-10 文字 | 小さい方が応答性が高い |
| バッファサイズ | 自動 | ReadableStream が自動制御 |
| タイムアウト | 255 秒 | 長い AI リクエスト対応 |

### メモリ使用量の削減

**推奨される手法:**

1. **不要なデータの蓄積を避ける**
   ```typescript
   // 良い例 - 即座に送信
   for await (const chunk of result.fullStream) {
     controller.enqueue(encoder.encode(data));
   }
   
   // 悪い例 - 全てを蓄積
   const chunks = [];
   for await (const chunk of result.fullStream) {
     chunks.push(chunk);
   }
   for (const chunk of chunks) {
     controller.enqueue(encoder.encode(chunk));
   }
   ```

2. **デバッグログを条件付きで有効化**
   ```typescript
   if (configManager.getServerConfig().log_level === 'debug') {
     logWithLevel(configManager, 'debug', 'Chunk', { chunk });
   }
   ```

---

## トラブルシューティング

### よくある問題

#### 1. ストリームが途中で切断される

**原因:** ネットワークの問題、タイムアウト、エラー

**解決策:**
```typescript
// タイムアウト値を確認
const server = Bun.serve({
  idleTimeout: 255,  // 十分に長い値を設定
  fetch: app.fetch
});
```

#### 2. チャンクが受信されない

**原因:** Content-Type ヘッダーの問題

**解決策:**
```typescript
// 正しい Content-Type を設定
return new Response(stream, {
  headers: {
    'Content-Type': 'application/x-ndjson'  // not 'application/json'
  }
});
```

#### 3. 最終チャンクが欠落する

**原因:** `controller.close()` が呼ばれていない

**解決策:**
```typescript
try {
  // 全てのチャンクを処理
} finally {
  // 最終チャンクを送信
  controller.enqueue(encoder.encode(finalData + '\n'));
  // 必ず close を呼ぶ
  controller.close();
}
```

---

## 関連ドキュメント

- [02_DOMAIN_LAYER.md](./02_DOMAIN_LAYER.md) - converter.ts の詳細
- [04_INTERFACE_LAYER.md](./04_INTERFACE_LAYER.md) - ルート実装の概要
- [06_API_REFERENCE.md](./06_API_REFERENCE.md) - API 使用例

---

## 実装ファイル

- `src/interface/http/routes/generate.ts` - generate エンドポイント
- `src/interface/http/routes/chat.ts` - chat エンドポイント
- `src/domain/converter.ts` - Ollama 形式への変換
- `src/interface/http/server.ts` - サーバー設定

---

*最終更新: 2025-02-09*
