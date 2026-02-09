# Interface Layer 詳解

## 概要

Interface Layerは、HTTPリクエスト/レスポンスの処理を担当します。Honoフレームワークを使用し、Ollama互換APIと管理画面のWeb UIを提供します。

---

## HTTP Server（server.ts）

### 役割

Honoアプリケーションの構築とミドルウェアの設定

### 初期化フロー

```typescript
export function createServer(configManager: ConfigManager) {
  const usageStorage = new UsageStorage();
  const app = new Hono();

  // 1. レート制限の初期化
  const rateLimiter = new RateLimiter(serverConfig.rate_limit);
  for (const modelName of configManager.listModels()) {
    const modelConfig = configManager.getModelConfig(modelName);
    if (modelConfig?.rate_limit) {
      rateLimiter.setModelConfig(modelName, modelConfig.rate_limit);
    }
  }
  setGlobalRateLimiter(rateLimiter);

  // 2. ミドルウェアの設定
  app.use('*', async (c, next) => {
    c.header('server', 'uvicorn'); // Python版との互換性
    await next();
  });

  // 3. ルーティングの設定
  app.route('/api', createModelsRouter(configManager));
  app.route('/api/generate', createGenerateRouter(configManager));
  app.route('/api/chat', createChatRouter(configManager, usageStorage));
  app.route('/admin', createAdminRouter(configManager, usageStorage));

  // 4. 静的ファイルの配信
  app.use('/admin/static/*', serveStatic({...}));

  return app;
}
```

### サーバー起動（main.ts）

```typescript
const server = Bun.serve({
  hostname: serverConfig.host,
  port: serverConfig.port,
  fetch: app.fetch,
  idleTimeout: 255, // AIリクエストの長時間実行を許容
});
```

### グレースフルシャットダウン

```typescript
process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  configManager.destroy(); // ファイル監視の停止
  server.stop();
  process.exit(0);
});
```

---

## API Routes

### models.ts - モデル管理API

**ベースパス:** `/api`

#### GET /api/tags

モデル一覧の取得

**リクエスト:** なし

**レスポンス:**
```json
{
  "models": [
    {
      "name": "gpt-4o",
      "model": "gpt-4o",
      "modified_at": "2025-02-09T12:00:00.000Z",
      "size": 0,
      "digest": "my-openai/gpt-4o-2024-08-06",
      "details": {
        "format": "api",
        "family": "my-openai",
        "families": null,
        "parameter_size": "unknown",
        "quantization_level": "none"
      }
    }
  ]
}
```

**実装:**
```typescript
router.get('/tags', (c) => {
  const models = configManager.getAllModels();
  const ollamaModels = models.map((m) =>
    toOllamaModelListItem(m.name, m.provider, m.model_name)
  );
  return c.json({ models: ollamaModels });
});
```

---

#### POST /api/show

モデル詳細情報の取得

**リクエスト:**
```json
{
  "name": "gpt-4o"
}
```

**レスポンス:**
```json
{
  "modelfile": "# Model: gpt-4o\nFROM my-openai/gpt-4o-2024-08-06",
  "parameters": "",
  "template": "",
  "details": {
    "format": "api",
    "family": "my-openai",
    "families": null,
    "parameter_size": "unknown",
    "quantization_level": "none"
  },
  "model_info": {
    "general.architecture": "api",
    "general.name": "gpt-4o"
  },
  "license": ""
}
```

---

#### GET /api/ps

実行中のモデル（ダミー実装）

**レスポンス:**
```json
{
  "models": []
}
```

**理由:** プロキシモードなので「実行中」の概念なし

---

#### GET /api/version

バージョン情報

**レスポンス:**
```json
{
  "version": "0.5.0"
}
```

---

#### 未実装エンドポイント

以下のエンドポイントは `501 Not Implemented` を返す:

- POST /api/create
- POST /api/copy
- POST /api/delete
- POST /api/pull
- POST /api/push
- POST /api/embed

**理由:** Ollamaのモデル管理機能はプロキシでは不要

---

### generate.ts - テキスト生成API

**ベースパス:** `/api/generate`

#### POST /api/generate

テキスト生成

**リクエスト:**
```json
{
  "model": "gpt-4o",
  "prompt": "Hello, world!",
  "stream": true,
  "system": "You are a helpful assistant.",
  "format": "json",
  "options": {
    "temperature": 0.7,
    "num_predict": 100,
    "top_p": 0.9
  }
}
```

#### 処理フロー

1. **バリデーション**
   ```typescript
   if (!modelName || !prompt) {
     return c.json({ error: '...' }, 400);
   }
   ```

2. **モデル設定の取得**
   ```typescript
   const modelConfig = configManager.getModelConfig(modelName);
   if (!modelConfig) {
     return c.json({ error: '...' }, 404);
   }
   ```

3. **レート制限の適用**
   ```typescript
   await rateLimiter.acquire(modelName, requestId);
   ```

4. **AIプロバイダーの生成**
   ```typescript
   const model = createLanguageModel(modelConfig);
   ```

5. **メッセージの構築**
   ```typescript
   const messages: CoreMessage[] = [];
   if (system) {
     messages.push({ role: 'system', content: system });
   }
   messages.push({ role: 'user', content: prompt });
   ```

6. **JSONフォーマットの処理**
   ```typescript
   if (_format === 'json') {
     lastMsg.content += '\n\nPlease respond with valid JSON only.';
   }
   ```

7. **ストリーミング/非ストリーミングの分岐**

#### ストリーミング応答

```typescript
if (stream) {
  const result = streamText({
    model,
    messages,
    temperature: options.temperature,
    maxTokens: options.num_predict,
    topP: options.top_p,
  });

  return new Response(
    new ReadableStream({
      async start(controller) {
        for await (const chunk of result.fullStream) {
          if (chunk.type === 'text-delta') {
            const data = toOllamaGenerateStreamChunk(
              chunk.textDelta,
              modelName,
              false
            );
            controller.enqueue(
              encoder.encode(JSON.stringify(data) + '\n')
            );
          }
        }
        // 最終チャンク
        const finalData = toOllamaGenerateResponse(...);
        controller.enqueue(encoder.encode(JSON.stringify(finalData) + '\n'));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } }
  );
}
```

#### 非ストリーミング応答

```typescript
const { text, usage } = await generateText({
  model,
  messages,
  temperature: options.temperature,
  maxTokens: options.num_predict,
  topP: options.top_p,
});

return c.json(toOllamaGenerateResponse(text, modelName, duration, ...));
```

---

### chat.ts - チャットAPI

**ベースパス:** `/api/chat`

#### POST /api/chat

チャット補完

**リクエスト:**
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" },
    { "role": "assistant", "content": "Hi there!" },
    { "role": "user", "content": "How are you?" }
  ],
  "stream": true,
  "tools": [...],
  "options": {...}
}
```

#### ツールの処理

OpenAI互換のツール定義をAI SDK形式に変換:

```typescript
const tools = _tools && Array.isArray(_tools) && _tools.length > 0
  ? Object.fromEntries(
      _tools.map((t: any) => [
        t.function?.name || t.name,
        {
          description: t.function?.description || t.description || '',
          parameters: jsonSchema(t.function?.parameters || t.parameters || {}),
        },
      ])
    )
  : undefined;
```

#### ストリーミング時のツールコール

```typescript
for await (const chunk of result.fullStream) {
  if (chunk.type === 'tool-call') {
    toolCalls.push({
      id: chunk.toolCallId,
      type: 'function',
      function: {
        name: chunk.toolName,
        arguments: JSON.stringify(chunk.args),
      },
    });
  }
}
```

---

### admin.ts - 管理画面API

**ベースパス:** `/admin`

#### 設定管理

**GET /admin/api/config**
```json
{
  "host": "127.0.0.1",
  "port": 11434,
  "log_level": "info"
}
```

**POST /admin/api/config**
```json
{
  "log_level": "debug"
}
```

---

#### プロバイダー管理

**GET /admin/api/providers**
```json
[
  {
    "id": "my-openai",
    "provider": "openai",
    "api_key": "sk-...",
    "models": [...]
  }
]
```

**POST /admin/api/providers**
```json
{
  "id": "new-provider",
  "provider": "anthropic",
  "api_key": "sk-ant-..."
}
```

**PUT /admin/api/providers/:id**
```json
{
  "api_key": "sk-new-key"
}
```

**DELETE /admin/api/providers/:id**

---

#### モデル管理

**GET /admin/api/models**
```json
[
  {
    "name": "gpt-4o",
    "provider": "my-openai",
    "provider_type": "openai",
    "model_name": "gpt-4o-2024-08-06"
  }
]
```

**POST /admin/api/models**
```json
{
  "name": "claude-3-5-sonnet",
  "provider": "my-anthropic",
  "provider_type": "anthropic",
  "model_name": "claude-3-5-sonnet-20241022"
}
```

**PUT /admin/api/models/:name**
```json
{
  "model_name": "claude-3-5-sonnet-latest"
}
```

**DELETE /admin/api/models/:name**

---

#### 統計

**GET /admin/api/stats**
```json
{
  "daily": {
    "2025-02-09": {
      "total_input_tokens": 1000,
      "total_output_tokens": 500,
      "count": 10
    }
  },
  "models": {
    "gpt-4o": {
      "total_input_tokens": 800,
      "total_output_tokens": 400,
      "count": 8
    }
  },
  "providers": {
    "my-openai": {
      "total_input_tokens": 1000,
      "total_output_tokens": 500,
      "count": 10
    }
  },
  "recent": [
    {
      "timestamp": "2025-02-09T12:00:00.000Z",
      "provider": "my-openai",
      "model": "gpt-4o",
      "input_tokens": 10,
      "output_tokens": 20
    }
  ]
}
```

---

## Static Web UI

### 概要

Vue 3 + PicoCSS による管理画面

### 技術スタック

- **Vue 3** - CDN版（ES Modules）
- **PicoCSS** - 軽量CSSフレームワーク
- **Chart.js** - グラフ描画
- **Phosphor Icons** - アイコン

### アプリケーション構造

```
index.html
├── ヘッダー（ロゴ、再読み込みボタン）
├── コンテナ
│   ├── プロバイダーセクション
│   │   ├── 追加/編集フォーム
│   │   └── プロバイダーリスト
│   └── モデルセクション
│       ├── 追加/編集フォーム
│       └── モデルリスト（プロバイダー別グループ化）
└── トースト通知
```

### 主要機能

#### 1. プロバイダー管理

**プロバイダー種類の選択**
```javascript
const availableProviders = [
  'openai', 'anthropic', 'google', 'azure',
  'mistral', 'cohere', 'deepseek', 'groq',
  'togetherai', 'fireworks', 'xai'
];
```

**フォーム項目:**
- プロバイダーID（一意の名称）
- APIキー
- ベースURL（OpenAI/Anthropicのみ）
- 最大リトライ回数
- レート制限（リクエスト/分、同時実行数）

**表示項目:**
- ID
- APIキー（マスク表示）
- レート制限
- 編集/削除ボタン

---

#### 2. モデル管理

**フォーム項目:**
- プロバイダー選択（ボタンUI）
- モデル名（Ollamaでの名称）
- 実際のモデルID
- レート制限

**プロバイダー別グループ化:**
```javascript
const groupedModels = computed(() => {
  const groups = {};
  models.forEach((model) => {
    const providerId = model.provider;
    const providerType = model.provider_type;

    if (!groups[providerType]) {
      groups[providerType] = {};
    }
    if (!groups[providerType][providerId]) {
      groups[providerType][providerId] = [];
    }
    groups[providerType][providerId].push(model);
  });

  // アルファベット順ソート
  return sortedGroups;
});
```

---

#### 3. 統計ダッシュボード

（現在は無効化されているが、コードは存在）

**チャート:**
- 日次使用量（積み上げ棒グラフ）
- プロバイダー分布（ドーナツグラフ）
- モデル分布（横向き棒グラフ）

---

### 状態管理

**Composition API パターン:**

```javascript
const App = {
  setup() {
    // ストア
    const modelsStore = useModels();
    const providersStore = useProviders();
    const configStore = useConfig();
    const toastStore = useToast();

    // ローカル状態
    const currentTab = ref('configuration');
    const showAddProvider = ref(false);
    const showAddModel = ref(false);

    // フォーム
    const modelForm = ref({...});
    const providerForm = ref({...});

    // メソッド
    const createModel = async () => {...};
    const editModel = (model) => {...};
    const deleteModel = async (name) => {...};

    return {
      currentTab,
      showAddProvider,
      modelForm,
      createModel,
      ...
    };
  }
};
```

---

### API通信

**api.js（推定）:**
```javascript
export const api = {
  async get(url) {
    const res = await fetch(url);
    return res.json();
  },
  async post(url, data) {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },
  // ...
};
```

---

### UIの特徴

1. **レスポンシブデザイン**
   - PicoCSSによるモバイル対応

2. **ダークモード**
   - `data-theme="dark"` で有効化

3. **トースト通知**
   - 成功/エラーのフィードバック
   - Vue Transitionによるアニメーション

4. **編集モード**
   - 既存項目の編集時はフォームに入力
   - スムーズスクロールでフォームに移動

5. **確認ダイアログ**
   - 削除時の確認（`confirm()`）

---

## エラーハンドリング

### 共通パターン

```typescript
try {
  // 処理
} catch (error) {
  logWithLevel(configManager, 'error', '...', {
    message: error instanceof Error ? error.message : String(error),
  });
  return c.json({
    error: error instanceof Error ? error.message : '...'
  }, 500);
}
```

### レート制限エラー

```typescript
if (error?.statusCode === 429) {
  return c.json({
    error: 'Rate limit reached for upstream provider'
  }, 429);
}
```

### AI_RetryErrorの処理

```typescript
if (error?.name === 'AI_RetryError') {
  const lastError = error.lastError;
  if (lastError?.statusCode === 429) {
    return c.json({
      error: 'Rate limit reached (after retries)'
    }, 429);
  }
}
```

---

## ロギング戦略

### リクエストログ

**受信時:**
```typescript
logWithLevel(configManager, 'info', 'Chat request received', {
  requestId,
  model: modelName,
  messageCount: messages.length,
  stream,
  hasTools: Array.isArray(tools) && tools.length > 0,
});
```

**バリデーション失敗:**
```typescript
logWithLevel(configManager, 'warn', 'Chat validation failed', {
  requestId,
  hasModel: !!modelName,
  hasMessages: Array.isArray(messages),
});
```

### 処理ログ

**モデル解決:**
```typescript
logWithLevel(configManager, 'info', 'Chat model resolved', {
  requestId,
  model: modelName,
  provider: modelConfig.provider,
  apiKeyExists: !!modelConfig.api_key,
  apiKeyPrefix: modelConfig.api_key?.substring(0, 10) + '...',
});
```

**ストリーミング:**
```typescript
logWithLevel(configManager, 'debug', 'Chat stream chunk', {
  requestId,
  chunkIndex: chunkCount,
  chunkLength: chunk.textDelta.length,
});
```

### 完了ログ

```typescript
logWithLevel(configManager, 'info', 'Chat response completed', {
  requestId,
  model: modelName,
  durationSeconds: duration,
  outputChars: content.length,
  usage,
});
```

---

## 設計上の判断

### 1. Ollama互換性の優先

**Serverヘッダー:**
```typescript
c.header('server', 'uvicorn');
```

**理由:** Python版との完全互換性

### 2. ストリーミングのNDJSON形式

```typescript
{ headers: { 'Content-Type': 'application/x-ndjson' } }
```

**理由:** Ollamaの形式に合わせる

### 3. リクエストIDの導入

```typescript
const requestId = randomUUID();
```

**理由:** ログの追跡を容易にするため

### 4. アーリーリターンパターン

```typescript
if (!modelName || !prompt) {
  return c.json({ error: '...' }, 400);
}
// 複雑なネストを避ける
```

**理由:** コードの可読性向上

### 5. フォームのボタンUI

**プロバイダー選択:**
```html
<button
  :class="[modelForm.provider === p.id ? 'primary' : 'secondary']"
  @click="modelForm.provider = p.id">
  {{ p.id }}
</button>
```

**理由:** ドロップダウンより直感的

---

## 拡張ポイント

### 新しいルートの追加

1. `routes/` に新しいファイルを作成
2. ルーター関数をエクスポート
3. `server.ts` でルーティング

```typescript
// routes/embeddings.ts
export function createEmbeddingsRouter(configManager: ConfigManager) {
  const router = new Hono();
  router.post('/', async (c) => {
    // 実装
  });
  return router;
}

// server.ts
app.route('/api/embeddings', createEmbeddingsRouter(configManager));
```

### ミドルウェアの追加

```typescript
app.use('*', async (c, next) => {
  const start = Date.now();
  await next();
  const duration = Date.now() - start;
  c.header('X-Response-Time', `${duration}ms`);
});
```

### Web UIの拡張

**新しいタブの追加:**
1. `index.html` にセクション追加
2. `app.js` にタブ定義追加
3. APIエンドポイント追加
