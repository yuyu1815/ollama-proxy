# Domain Layer 詳解

## 概要

Domain Layerは、ビジネスロジックとアプリケーションのコア型定義を担当します。外部依存（AI SDK、HTTPサーバーなど）から独立しており、純粋なTypeScriptコードで構成されます。

---

## types.ts - コア型定義

### プロバイダー型

```typescript
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
```

**役割:** サポートするAIプロバイダーの列挙型

**対応状況:**
- ✅ 完全対応: OpenAI, Anthropic, Google, xAI, Mistral, Cohere, DeepSeek, Together AI, Groq, Fireworks
- ⚠️ 制限あり: Azure（OpenAI互換として処理）
- ❌ 未実装: Bedrock（AWS認証が必要）

---

### ModelConfig - モデル設定

```typescript
export interface ModelConfig {
  name: string;              // Ollamaで呼び出す名前
  provider: string;          // プロバイダーID（providers.jsonのキー）
  provider_type: ProviderType; // プロバイダーの種類
  model_name: string;        // 実際のAIプロバイダーでのモデルID
  api_key?: string;          // モデル固有のAPIキー（プロバイダー設定を上書き）
  base_url?: string;         // モデル固有のベースURL（プロバイダー設定を上書き）
  max_retries?: number;      // 最大リトライ回数
  default_params?: Record<string, unknown>; // デフォルトパラメータ
  rate_limit?: RateLimitConfig; // モデル固有のレート制限
}
```

**使用例:**
```json
{
  "name": "gpt-4o",
  "provider": "my-openai",
  "provider_type": "openai",
  "model_name": "gpt-4o-2024-08-06",
  "rate_limit": {
    "requests": 100,
    "concurrent": 5
  }
}
```

**設計ポイント:**
- `provider` (ID) と `provider_type` (種類) を分離
  - 同じ種類のプロバイダーを複数登録可能
  - 例: `my-openai-1`, `my-openai-2` で異なるAPIキーを使用
- モデル固有設定でプロバイダー設定を上書き可能

---

### ProviderConfig - プロバイダー設定

```typescript
export interface ProviderConfig {
  provider: ProviderType;    // プロバイダーの種類
  api_key?: string;          // デフォルトAPIキー
  base_url?: string;         // デフォルトベースURL
  max_retries?: number;      // デフォルト最大リトライ回数
  rate_limit?: RateLimitConfig; // プロバイダーレベルのレート制限
  models: ModelConfig[];     // 属するモデルのリスト
}
```

**階層構造:**
```
providers.json
├── provider-id-1 (ProviderConfig)
│   ├── api_key: "sk-..."
│   ├── rate_limit: {...}
│   └── models: [ModelConfig, ...]
└── provider-id-2 (ProviderConfig)
```

---

### RateLimitConfig - レート制限設定

```typescript
export interface RateLimitConfig {
  requests?: number;   // ウィンドウ内の最大リクエスト数（デフォルト: 10）
  window_ms?: number;  // ウィンドウサイズ（ミリ秒、デフォルト: 60000）
  concurrent?: number; // 最大同時実行数（デフォルト: 1）
}
```

**優先順位:**
1. **モデル設定** - `model.rate_limit`
2. **プロバイダー設定** - `provider.rate_limit`
3. **グローバル設定** - `server.rate_limit`

**マージロジック（manager.ts）:**
```typescript
// 子設定が親設定を上書き
mergeRateLimitConfigs(parent, child) {
  return {
    requests: child.requests ?? parent.requests,
    window_ms: child.window_ms ?? parent.window_ms,
    concurrent: child.concurrent ?? parent.concurrent,
  };
}
```

**実装方式（トークンバケット）:**
- `requests`: バケットの最大容量
- `window_ms`: トークン回復の時間枠
- `concurrent`: 同時実行可能なリクエスト数
- リクエストごとにトークンを1つ消費
- 時間経過でトークン回復

---

### ServerConfig - サーバー設定

```typescript
export interface ServerConfig {
  host: string;              // バインドアドレス（デフォルト: "127.0.0.1"）
  port: number;              // ポート番号（デフォルト: 11434）
  providers_file: string;    // プロバイダーファイルパス
  log_level: 'debug' | 'info' | 'warn' | 'error';
  rate_limit?: RateLimitConfig; // グローバルレート制限
}
```

**デフォルト設定（default-config.json）:**
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

---

### Ollama API 互換型

#### OllamaModel - モデル情報
```typescript
export interface OllamaModel {
  name: string;          // モデル名
  model: string;         // モデル識別子
  modified_at: string;   // 更新日時
  size: number;          // モデルサイズ
  digest: string;        // モデルハッシュ
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}
```

**Ollamaとの違い:**
- `size` は常に 0（プロキシモデルなので物理サイズなし）
- `digest` は `provider/model_name` 形式
- `details.format` は "api"

#### OllamaGenerateRequest - テキスト生成リクエスト
```typescript
export interface OllamaGenerateRequest {
  model: string;                  // モデル名
  prompt: string;                 // プロンプト
  stream?: boolean;               // ストリーミング有無（デフォルト: true）
  system?: string;                // システムプロンプト
  format?: 'json';                // JSON出力指定
  options?: {
    temperature?: number;         // 生成温度
    num_predict?: number;         // 最大生成トークン数
    top_p?: number;               // top-p サンプリング
  };
}
```

#### OllamaChatRequest - チャットリクエスト
```typescript
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
  tools?: unknown[];  // OpenAI互換のツール定義
}
```

**tools パラメータの処理:**
- OpenAI形式のツール定義を受け付ける
- AI SDK形式に変換して使用

#### OllamaResponse - 共通レスポンス
```typescript
export interface OllamaResponse {
  model: string;                    // 使用モデル名
  created_at: string;               // 作成日時
  response?: string;                // テキスト生成の結果
  message?: {                       // チャットの結果
    role: string;
    content: string;
    images?: null;
    tool_calls?: unknown[];
  };
  done: boolean;                    // 完了フラグ
  done_reason?: 'stop' | 'length';  // 完了理由
  total_duration: number;           // 総所要時間（ナノ秒）
  load_duration: number;            // モデルロード時間
  prompt_eval_count: number;        // 入力トークン数
  prompt_eval_duration: number;     // 入力処理時間
  eval_count: number;               // 出力トークン数
  eval_duration: number;            // 出力処理時間
  context?: number[];               // コンテキスト（ダミー）
}
```

**時間の表現:**
- Ollamaはナノ秒を使用
- 実装では `Date.now()` の差分をナノ秒変換
- `nsFromSeconds(seconds: number)` ヘルパー関数使用

---

### UsageLog, UsageStats - 使用量記録

```typescript
export interface UsageLog {
  timestamp: string;        // ISO 8601フォーマット
  provider: string;         // プロバイダーID
  model: string;            // モデル名
  input_tokens: number;     // 入力トークン数
  output_tokens: number;    // 出力トークン数
}

export interface UsageStats {
  total_input_tokens: number;
  total_output_tokens: number;
  count: number;            // リクエスト数
}
```

**保存場所:** `~/.ollama-proxy/usage_logs.json`

---

## converter.ts - 形式変換ロジック

### 目的

AI SDKのレスポンスをOllama互換形式に変換します。

### ヘルパー関数

#### getTimestamp()
```typescript
function getTimestamp(): string {
  return new Date().toISOString().replace(/(\.\d{3})\d*Z$/, '$1Z');
}
```
- ISO 8601形式のタイムスタンプ生成
- ミリ秒を3桁に丸める（Ollama準拠）

#### nsFromSeconds()
```typescript
function nsFromSeconds(seconds: number): number {
  return Math.floor(seconds * 1e9);
}
```
- 秒をナノ秒に変換

---

### 変換関数

#### toOllamaGenerateResponse()
```typescript
export function toOllamaGenerateResponse(
  content: string,
  modelName: string,
  durationSeconds: number,
  promptTokens: number = 0,
  completionTokens: number = 0
): OllamaResponse
```

**用途:** 非ストリーミング `/api/generate` の最終レスポンス

**戻り値例:**
```json
{
  "model": "gpt-4o",
  "created_at": "2025-02-09T12:00:00.000Z",
  "response": "生成されたテキスト",
  "done": true,
  "done_reason": "stop",
  "total_duration": 1500000000,
  "prompt_eval_count": 10,
  "eval_count": 20
}
```

---

#### toOllamaGenerateStreamChunk()
```typescript
export function toOllamaGenerateStreamChunk(
  content: string,
  modelName: string,
  done: boolean = false
): Partial<OllamaResponse>
```

**用途:** ストリーミング `/api/generate` の各チャンク

**ストリーミングパターン:**
```
{"response": "Hello", "done": false}
{"response": " world", "done": false}
{"response": "", "done": true, "done_reason": "stop", ...}
```

**注意:** 最終チャンク（`done: true`）でのみ統計情報を含める

---

#### toOllamaChatResponse()
```typescript
export function toOllamaChatResponse(
  content: string,
  modelName: string,
  durationSeconds: number,
  promptTokens: number = 0,
  completionTokens: number = 0,
  toolCalls: unknown[] = []
): OllamaResponse
```

**用途:** 非ストリーミング `/api/chat` の最終レスポンス

**違い:** `response` ではなく `message` フィールドを使用

---

#### toOllamaChatStreamChunk()
```typescript
export function toOllamaChatStreamChunk(
  content: string,
  modelName: string,
  done: boolean = false,
  toolCalls: unknown[] = []
): Partial<OllamaResponse>
```

**用途:** ストリーミング `/api/chat` の各チャンク

---

#### toOllamaModelListItem()
```typescript
export function toOllamaModelListItem(
  modelName: string,
  provider: string,
  actualModel: string
): OllamaModel
```

**用途:** `/api/tags` レスポンスのモデルリスト

**マッピング:**
- `name`, `model` → Ollamaでのモデル名
- `digest` → `provider/actualModel` 形式で識別
- `details.family` → プロバイダー名

---

#### toOllamaModelInfo()
```typescript
export function toOllamaModelInfo(
  modelName: string,
  provider: string,
  actualModel: string
): Record<string, unknown>
```

**用途:** `/api/show` レスポンスのモデル詳細

**戻り値構造:**
```json
{
  "modelfile": "FROM provider/actualModel",
  "parameters": "",
  "template": "",
  "details": {...},
  "model_info": {...},
  "license": ""
}
```

---

### テストカバレッジ

**converter.test.ts** でカバーされているテスト:

1. タイムスタンプ形式の検証
2. 期間のナノ秒変換
3. ストリーミングチャンクの構造
4. モデル情報のマッピング

**実行方法:**
```bash
bun test src/domain/converter.test.ts
```

---

## 設計上の判断

### 1. プロバイダーIDと種類の分離

**理由:** 複数の同じ種類のプロバイダーを管理可能にするため

**例:**
```json
{
  "openai-prod": {
    "provider": "openai",
    "api_key": "sk-prod-...",
    "models": [...]
  },
  "openai-dev": {
    "provider": "openai",
    "api_key": "sk-dev-...",
    "models": [...]
  }
}
```

### 2. レート制限の階層化

**理由:** 柔軟な制御を実現するため

- グローバル: 全体のデフォルト
- プロバイダー: プロバイダー固有の制限
- モデル: モデル固有の制限（最優先）

### 3. Ollama互換性の優先

**理由:** 既存のOllamaクライアントをそのまま使用可能にするため

- リクエスト/レスポンス形式を完全に模倣
- 一部のエンドポイントはダミー実装（`/api/ps` など）

### 4. オプションのデフォルト値

**理由:** TypeScriptの型安全性と利便性のバランス

- `?:` でオプショナルにし、実行時にデフォルト値を適用
- テストコードで明示的にデフォルトを指定
