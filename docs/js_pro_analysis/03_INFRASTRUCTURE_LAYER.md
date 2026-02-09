# Infrastructure Layer 詳解

## 概要

Infrastructure Layerは、外部システムとの連携、技術的な関心事の実装を担当します。設定管理、AIプロバイダーとの通信、ログ、ストレージなどが含まれます。

---

## Config Management（設定管理）

### manager.ts - ConfigManager

**役割:** 設定ファイルの読み込み、保存、監視

#### 初期化フロー

```typescript
async initialize(): Promise<void> {
  await this.loadServerConfig();   // config.json 読み込み
  await this.loadProviders();      // providers.json 読み込み
  this.startWatching();            // ファイル監視開始
}
```

#### 設定ファイルの場所

```
~/.ollama-proxy/
├── config.json        # サーバー設定
├── providers.json     # プロバイダー・モデル設定
└── usage_logs.json    # 使用量ログ
```

#### 主要メソッド

**loadServerConfig()**
- `~/.ollama-proxy/config.json` を読み込み
- 存在しない場合はテンプレートからコピー
- デフォルト値とのマージ

**loadProviders()**
- `~/.ollama-proxy/providers.json` を読み込み
- プロバイダーごとにモデル設定を展開
- `Map<string, ModelConfig>` に変換

**getModelConfig(modelName)**
- モデル名から設定を取得
- レート制限のマージ処理（モデル > プロバイダー > グローバル）

**listModels() / getAllModels()**
- 登録済みモデルの一覧取得

**onReload(callback)**
- 設定ファイル変更時のコールバック登録
- Web UI での自動更新に利用

#### ファイル監視

```typescript
private startWatching(): void {
  const providerWatcher = watch(this.providersPath, (eventType) => {
    if (eventType === 'change') {
      console.log('providers.json changed, reloading...');
      this.loadProviders().then(() => {
        this.notifyReload(); // コールバック実行
      });
    }
  });
  this.watchers.push(providerWatcher);
}
```

**監視対象:** `providers.json` のみ  
**理由:** サーバー設定（host, port）の変更には再起動が必要

#### レート制限マージロジック

```typescript
private mergeRateLimitConfigs(
  parent?: RateLimitConfig,
  child?: RateLimitConfig
): RateLimitConfig | undefined {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;

  return {
    requests: child.requests ?? parent.requests,
    window_ms: child.window_ms ?? parent.window_ms,
    concurrent: child.concurrent ?? parent.concurrent,
  };
}
```

**優先順位:** `child`（モデル/プロバイダー） > `parent`（グローバル/プロバイダー）

---

### provider_service.ts - ProviderService

**役割:** providers.json のCRUD操作

#### データ構造

```typescript
// providers.json の構造
type ProvidersData = Record<string, ProviderConfig>;
// 例:
{
  "my-openai": {
    "provider": "openai",
    "api_key": "sk-...",
    "models": [
      {
        "name": "gpt-4o",
        "provider": "my-openai",
        "provider_type": "openai",
        "model_name": "gpt-4o-2024-08-06"
      }
    ]
  }
}
```

#### 主要メソッド

**getProviders()**
- 全プロバイダーの取得
- IDを含めた拡張情報を返す

**addProvider(id, config)**
- 新規プロバイダーの追加
- IDの重複チェック

**updateProvider(id, updates)**
- プロバイダー設定の更新
- 部分更新対応

**deleteProvider(id)**
- プロバイダーの削除
- 配下のモデルも削除

**addModel(model)**
- モデルの追加
- プロバイダーが存在しない場合は自動作成

**updateModel(name, updates)**
- モデルの更新
- 全プロバイダーを検索

**deleteModel(name)**
- モデルの削除
- 全プロバイダーを検索

**findProviderByModelName(modelName)**
- モデル名からプロバイダーIDを検索
- O(1) ではないが、プロバイダー数は少ないため許容

#### エラーハンドリング

```typescript
private async readProviders(): Promise<Record<string, ProviderConfig>> {
  try {
    const content = await readFile(this.providersPath, 'utf-8');
    return JSON.parse(content);
  } catch (error) {
    if (error.code === 'ENOENT') {
      return {}; // ファイルが存在しない場合は空オブジェクト
    }
    throw error;
  }
}
```

---

### templates/ - 設定テンプレート

**default-config.json**
```json
{
  "host": "127.0.0.1",
  "port": 11434,
  "providers_file": "~/.ollama-proxy/providers.json",
  "log_level": "info",
  "rate_limit_requests": 10,
  "rate_limit_window_ms": 60000,
  "rate_limit_concurrent": 1
}
```

**default-providers.json**
```json
{
  "ollama": {
    "provider": "ollama",
    "api_key": "",
    "base_url": "http://localhost:11434",
    "models": []
  }
}
```

**用途:** 初回起動時にファイルが存在しない場合の雛形

---

## Provider Factory（プロバイダーファクトリー）

### factory.ts

**役割:** 設定からAI SDKのプロバイダーインスタンスを生成

### createLanguageModel()

```typescript
export function createLanguageModel(config: ModelConfig): any {
  const { provider, model_name, api_key, base_url } = config;

  const options: Record<string, string> = {};
  if (api_key) options.apiKey = api_key;
  if (base_url) options.baseURL = base_url;

  switch (provider) {
    case 'openai':
      if (api_key || base_url) {
        return createOpenAI(options)(model_name);
      }
      return openai(model_name);

    case 'anthropic':
      // 同様のパターン
    // ...
    default:
      throw new Error(`Unsupported provider: ${provider}`);
  }
}
```

### 対応プロバイダー一覧

| プロバイダー | AI SDKパッケージ | 備考 |
|------------|-----------------|------|
| OpenAI | @ai-sdk/openai | ✅ |
| Anthropic | @ai-sdk/anthropic | ✅ |
| Google | @ai-sdk/google | ✅ |
| xAI | @ai-sdk/xai | ✅ |
| Azure | @ai-sdk/openai | OpenAI互換モード |
| Mistral | @ai-sdk/mistral | ✅ |
| Cohere | @ai-sdk/cohere | ✅ |
| DeepSeek | @ai-sdk/deepseek | ✅ |
| Together AI | @ai-sdk/togetherai | ✅ |
| Groq | @ai-sdk/groq | ✅ |
| Fireworks | @ai-sdk/fireworks | ✅ |
| Bedrock | - | ❌ AWS認証が必要 |

### カスタム設定のサポート

```typescript
// 環境変数の代わりに明示的に設定
const config: ModelConfig = {
  name: "custom-gpt4",
  provider: "openai",
  model_name: "gpt-4",
  api_key: "sk-custom-...",
  base_url: "https://custom-proxy.com/v1"
};
```

**利点:**
- 環境変数不要
- プロキシ経由のアクセスが可能
- 複数のアカウントを同時使用

---

## Rate Limiter（レート制限）

### ratelimiter.ts

**役割:** トークンバケットアルゴリズムによるレート制限

### アルゴリズム

```typescript
interface ModelState {
  tokens: number;      // 現在のトークン数
  lastRefill: number;  // 最後のリフィル時間
  running: number;     // 実行中のリクエスト数
  queue: RequestQueueItem[];  // 待機キュー
}
```

### 主要メソッド

**acquire(model, requestId)**
- リクエストの許可を待機
- 即時実行可能なら `resolve()`
- 不可ならキューに追加

**release(model)**
- リクエスト完了時に呼び出し
- 次のキュー項目を処理

**refillBucket(model)**
- 時間経過によるトークン回復
- `tokensToAdd = floor((elapsed / window_ms) * requests)`

**processQueue(model)**
- キューの処理
- 利用可能なトークンと同時実行枠を確認

### 設定の階層構造

```typescript
1. グローバル設定 (server.rate_limit)
   ↓ (継承)
2. プロバイダー設定 (provider.rate_limit)
   ↓ (継承)
3. モデル設定 (model.rate_limit)  ← 最優先
```

**実装:**
```typescript
private getConfig(model: string): Required<RateLimitConfig> {
  return this.configs.get(model) ?? this.defaultConfig;
}
```

### グローバルインスタンス

```typescript
let globalRateLimiter: RateLimiter | null = null;

export function getGlobalRateLimiter(): RateLimiter | null {
  return globalRateLimiter;
}

export function setGlobalRateLimiter(limiter: RateLimiter): void {
  globalRateLimiter = limiter;
}
```

**理由:** ルートハンドラーから簡単にアクセスするため

### 使用例

```typescript
// チャットルート
const rateLimiter = getGlobalRateLimiter();
if (rateLimiter) {
  await rateLimiter.acquire(modelName, requestId);
}

try {
  // AIプロバイダー呼び出し
} finally {
  if (rateLimiter) {
    rateLimiter.release(modelName);
  }
}
```

---

## Storage（ストレージ）

### usage.ts - UsageStorage

**役割:** トークン使用量の記録と統計

### データ構造

```typescript
interface UsageLog {
  timestamp: string;
  provider: string;
  model: string;
  input_tokens: number;
  output_tokens: number;
}
```

### 主要メソッド

**addLog(provider, model, inputTokens, outputTokens)**
- 新しいログを追加
- 即時にファイルに保存

**getLogs()**
- 全ログの取得

**getStatsByProvider()**
```typescript
{
  "my-openai": {
    "total_input_tokens": 1000,
    "total_output_tokens": 500,
    "count": 10
  }
}
```

**getStatsByModel()**
```typescript
{
  "gpt-4o": {
    "total_input_tokens": 800,
    "total_output_tokens": 400,
    "count": 8
  }
}
```

**getDailyStats()**
```typescript
{
  "2025-02-09": {
    "total_input_tokens": 2000,
    "total_output_tokens": 1000,
    "count": 20
  }
}
```

### 保存場所

```
~/.ollama-proxy/usage_logs.json
```

### パフォーマンス考慮

- 各リクエストでファイル書き込みが発生
- 将来的な改善: バッファリング + 定期フラッシュ

---

## Logging（ロギング）

### logger.ts

**役割:** 構造化ログ出力

### logWithLevel()

```typescript
export const logWithLevel = (
  configManager: ConfigManager,
  level: LogLevel,
  message: string,
  meta?: Record<string, unknown>
) => {
  const currentLevel = configManager.getServerConfig().log_level;
  if (logLevelOrder[level] < logLevelOrder[currentLevel]) {
    return; // レベル不足で出力しない
  }

  const timestamp = new Date().toISOString();
  const logger = getLoggerMethod(level);
  logger(`[${timestamp}] [${level.toUpperCase()}] ${message}${formatMeta(meta)}`);
};
```

### ログレベル

```typescript
const logLevelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};
```

### 出力例

```
[2025-02-09T12:00:00.000Z] [INFO] Chat request received {"requestId":"...","model":"gpt-4o"}
[2025-02-09T12:00:01.000Z] [DEBUG] Chat stream chunk {"chunkIndex":1,"chunkLength":5}
[2025-02-09T12:00:02.000Z] [ERROR] Chat error {"message":"API error"}
```

---

## i18n（国際化）

### index.ts

**役割:** 多言語対応

### サポート言語

- 英語（デフォルト）
- 日本語

### 翻訳ファイル構造

**locales/ja.json**
```json
{
  "errors": {
    "model_and_messages_required": "モデルとメッセージは必須です",
    "model_not_found": "モデル '{{modelName}}' が見つかりません",
    ...
  },
  "server": {
    "status": "Ollama Proxy is running"
  },
  "admin": {
    "files_saved": "ファイルが正常に保存されました",
    ...
  }
}
```

### 使用方法

```typescript
import i18n from '../../../infrastructure/i18n/index.js';

// エラーレスポンス
return c.json({
  error: i18n.t('errors.model_not_found', { modelName })
}, 404);
```

### 拡張方法

新しい言語を追加する場合:

1. `locales/{lang}.json` を作成
2. `i18n/index.ts` にインポート
3. `resources` に追加

```typescript
import fr from '../../locales/fr.json' with { type: 'json' };

resources: {
  en: { translation: en },
  ja: { translation: ja },
  fr: { translation: fr },  // 追加
}
```

---

## 設計上の判断

### 1. ファイル監視の対象

**providers.json のみ監視**
- モデル/プロバイダーの変更を検知
- サーバー設定（host, port）は再起動が必要

**理由:** 実行中のサーバーのポート変更は不可能

### 2. グローバルインスタンスの使用

**RateLimiter:** `globalRateLimiter` 変数
- ルートハンドラーから簡単にアクセス
- 依存性注入の簡素化

**トレードオフ:** テストでのモック化が少し困難

### 3. 使用量ログの即時保存

**各リクエストで書き込み**
- データ損失のリスクを最小化
- パフォーマンスとのトレードオフ

**将来的な改善:** バッファリング + 定期フラッシュ

### 4. プロバイダーファクトリーの戻り値型

**`any` 型を使用**
- AI SDKのプロバイダー型が複雑
- 型安全性よりも柔軟性を優先

**改善案:** 共通の `LanguageModel` インターフェースを使用

---

## 依存関係図

```
ConfigManager
├── fs/promises (ファイル操作)
├── fs (ファイル監視)
└── path (パス操作)

ProviderService
├── fs/promises
└── path

Provider Factory
└── @ai-sdk/* (各プロバイダーパッケージ)

RateLimiter
└── なし（純粋な実装）

UsageStorage
├── fs/promises
└── path

Logger
└── console

i18n
└── i18next
```
