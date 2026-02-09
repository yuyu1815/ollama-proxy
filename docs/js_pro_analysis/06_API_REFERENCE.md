# API リファレンス

## Ollama互換 API

### ベースURL

```
http://127.0.0.1:11434/api
```

---

## モデル管理

### GET /api/tags

登録済みモデルの一覧を取得

**リクエスト:** なし

**レスポンス (200 OK):**
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

**cURL:**
```bash
curl http://localhost:11434/api/tags
```

---

### POST /api/show

モデルの詳細情報を取得

**リクエスト:**
```json
{
  "name": "gpt-4o"
}
```

**レスポンス (200 OK):**
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

**エラー (404 Not Found):**
```json
{
  "error": "Model 'unknown-model' not found"
}
```

**cURL:**
```bash
curl -X POST http://localhost:11434/api/show \
  -H "Content-Type: application/json" \
  -d '{"name": "gpt-4o"}'
```

---

### GET /api/ps

実行中のモデル（ダミー実装）

**レスポンス (200 OK):**
```json
{
  "models": []
}
```

**注意:** プロキシモードでは常に空配列

---

### GET /api/version

バージョン情報

**レスポンス (200 OK):**
```json
{
  "version": "0.5.0"
}
```

---

## テキスト生成

### POST /api/generate

テキストの生成

**リクエスト:**
```json
{
  "model": "gpt-4o",
  "prompt": "Write a haiku about programming.",
  "stream": true,
  "system": "You are a helpful assistant.",
  "format": "json",
  "options": {
    "temperature": 0.7,
    "num_predict": 50,
    "top_p": 0.9
  }
}
```

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| model | string | ✅ | モデル名 |
| prompt | string | ✅ | プロンプト |
| stream | boolean | ❌ | ストリーミング（デフォルト: true） |
| system | string | ❌ | システムプロンプト |
| format | string | ❌ | 出力形式（"json" のみ対応） |
| options | object | ❌ | 生成パラメータ |

**options:**

| 名前 | 型 | 説明 |
|------|------|------|
| temperature | number | 生成温度（0.0-2.0） |
| num_predict | number | 最大生成トークン数 |
| top_p | number | top-p サンプリング |

**ストリーミングレスポンス:**
```
{"model":"gpt-4o","created_at":"2025-02-09T12:00:00.000Z","response":"Code","done":false}
{"model":"gpt-4o","created_at":"2025-02-09T12:00:00.001Z","response":" flows","done":false}
{"model":"gpt-4o","created_at":"2025-02-09T12:00:00.002Z","response":" like","done":false}
{"model":"gpt-4o","created_at":"2025-02-09T12:00:00.003Z","response":"","done":true,"done_reason":"stop","total_duration":1500000000,"prompt_eval_count":5,"eval_count":8}
```

**非ストリーミングレスポンス:**
```json
{
  "model": "gpt-4o",
  "created_at": "2025-02-09T12:00:00.000Z",
  "response": "Code flows like water,\nLogic builds the future,\nBugs teach us to grow.",
  "done": true,
  "done_reason": "stop",
  "total_duration": 1500000000,
  "load_duration": 0,
  "prompt_eval_count": 5,
  "prompt_eval_duration": 0,
  "eval_count": 8,
  "eval_duration": 0
}
```

**エラー (400 Bad Request):**
```json
{
  "error": "Model and prompt are required"
}
```

**エラー (404 Not Found):**
```json
{
  "error": "Model 'unknown-model' not found"
}
```

**エラー (429 Too Many Requests):**
```json
{
  "error": "Rate limit reached for upstream provider"
}
```

**cURL:**
```bash
# ストリーミング
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","prompt":"Hello","stream":true}'

# 非ストリーミング
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","prompt":"Hello","stream":false}'
```

---

## チャット

### POST /api/chat

チャット補完

**リクエスト:**
```json
{
  "model": "gpt-4o",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "What is 2+2?" },
    { "role": "assistant", "content": "2+2 equals 4." },
    { "role": "user", "content": "And what is 3+3?" }
  ],
  "stream": true,
  "tools": [
    {
      "type": "function",
      "function": {
        "name": "calculator",
        "description": "Performs calculations",
        "parameters": {
          "type": "object",
          "properties": {
            "expression": {
              "type": "string",
              "description": "Math expression"
            }
          },
          "required": ["expression"]
        }
      }
    }
  ],
  "options": {
    "temperature": 0.7,
    "num_predict": 100
  }
}
```

**パラメータ:**

| 名前 | 型 | 必須 | 説明 |
|------|------|------|------|
| model | string | ✅ | モデル名 |
| messages | array | ✅ | 会話履歴 |
| stream | boolean | ❌ | ストリーミング（デフォルト: true） |
| tools | array | ❌ | ツール定義（OpenAI互換） |
| format | string | ❌ | 出力形式（"json" のみ対応） |
| options | object | ❌ | 生成パラメータ |

**messages:**

| role | 説明 |
|------|------|
| system | システムプロンプト |
| user | ユーザーメッセージ |
| assistant | アシスタントの応答 |

**ストリーミングレスポンス:**
```
{"model":"gpt-4o","created_at":"...","message":{"role":"assistant","content":"3","images":null,"tool_calls":[]},"done":false}
{"model":"gpt-4o","created_at":"...","message":{"role":"assistant","content":"+","images":null,"tool_calls":[]},"done":false}
{"model":"gpt-4o","created_at":"...","message":{"role":"assistant","content":"3","images":null,"tool_calls":[]},"done":false}
{"model":"gpt-4o","created_at":"...","message":{"role":"assistant","content":" equals","done":false}
{"model":"gpt-4o","created_at":"...","message":{"role":"assistant","content":" 6.","done":true,"done_reason":"stop",...}
```

**ツールコールを含むレスポンス:**
```json
{
  "model": "gpt-4o",
  "created_at": "2025-02-09T12:00:00.000Z",
  "message": {
    "role": "assistant",
    "content": "",
    "images": null,
    "tool_calls": [
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "calculator",
          "arguments": "{\"expression\":\"2+2\"}"
        }
      }
    ]
  },
  "done": true,
  "done_reason": "stop",
  ...
}
```

**cURL:**
```bash
curl -X POST http://localhost:11434/api/chat \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-4o",
    "messages": [
      {"role": "user", "content": "Hello!"}
    ]
  }'
```

---

## 管理画面 API

### ベースURL

```
http://127.0.0.1:11434/admin
```

---

### 設定管理

#### GET /admin/api/config

サーバー設定の取得

**レスポンス (200 OK):**
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

#### POST /admin/api/config

サーバー設定の更新

**リクエスト:**
```json
{
  "log_level": "debug",
  "port": 8080
}
```

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

**注意:** ポート変更には再起動が必要

---

### プロバイダー管理

#### GET /admin/api/providers

全プロバイダーの取得

**レスポンス (200 OK):**
```json
[
  {
    "id": "my-openai",
    "provider": "openai",
    "api_key": "sk-...",
    "base_url": null,
    "max_retries": 5,
    "rate_limit": {
      "requests": 100,
      "concurrent": 5
    },
    "models": [...]
  }
]
```

---

#### POST /admin/api/providers

プロバイダーの作成

**リクエスト:**
```json
{
  "id": "my-anthropic",
  "provider": "anthropic",
  "api_key": "sk-ant-...",
  "base_url": null,
  "max_retries": 3,
  "rate_limit": {
    "requests": 50,
    "concurrent": 2
  },
  "models": []
}
```

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

**エラー (400 Bad Request):**
```json
{
  "error": "Provider already exists"
}
```

---

#### PUT /admin/api/providers/:id

プロバイダーの更新

**リクエスト:**
```json
{
  "api_key": "sk-new-key",
  "max_retries": 5
}
```

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

---

#### DELETE /admin/api/providers/:id

プロバイダーの削除

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

**エラー (404 Not Found):**
```json
{
  "error": "Provider not found"
}
```

---

### モデル管理

#### GET /admin/api/models

全モデルの取得

**レスポンス (200 OK):**
```json
[
  {
    "name": "gpt-4o",
    "provider": "my-openai",
    "provider_type": "openai",
    "model_name": "gpt-4o-2024-08-06",
    "api_key": null,
    "base_url": null,
    "max_retries": null,
    "rate_limit": {
      "requests": 100,
      "concurrent": 5
    }
  }
]
```

---

#### POST /admin/api/models

モデルの作成

**リクエスト:**
```json
{
  "name": "claude-3-5-sonnet",
  "provider": "my-anthropic",
  "provider_type": "anthropic",
  "model_name": "claude-3-5-sonnet-20241022",
  "rate_limit": {
    "requests": 50,
    "concurrent": 2
  }
}
```

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

---

#### PUT /admin/api/models/:name

モデルの更新

**リクエスト:**
```json
{
  "model_name": "claude-3-5-sonnet-latest",
  "rate_limit": {
    "requests": 100
  }
}
```

---

#### DELETE /admin/api/models/:name

モデルの削除

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

---

### 統計

#### GET /admin/api/stats

使用統計の取得

**レスポンス (200 OK):**
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

#### POST /admin/api/reload

設定の再読み込み

**レスポンス (200 OK):**
```json
{
  "success": true
}
```

**動作:** `providers.json` を再読み込み

---

## Web UI

### アクセス

```
http://127.0.0.1:11434/admin
```

### 機能

1. **プロバイダー管理**
   - 一覧表示
   - 追加・編集・削除
   - APIキーのマスク表示

2. **モデル管理**
   - プロバイダー別グループ化
   - 追加・編集・削除
   - レート制限の設定

3. **統計ダッシュボード**（無効化中）
   - 日次使用量
   - モデル別統計
   - プロバイダー別統計

---

## エラーレスポンス

### 共通形式

```json
{
  "error": "エラーメッセージ"
}
```

### HTTPステータスコード

| コード | 説明 |
|--------|------|
| 200 | 成功 |
| 400 | リクエストエラー（必須パラメータ不足など） |
| 404 | リソース未検出 |
| 429 | レート制限超過 |
| 500 | サーバーエラー |
| 501 | 未実装 |

---

## 認証

現在は認証機能なし。

**将来の拡張:**
- APIキー認証
- JWTトークン
- OAuth2

---

## レート制限

### 設定階層

1. **グローバル** - `config.json`
2. **プロバイダー** - `providers.json`
3. **モデル** - `providers.json`

### 設定例

```json
{
  "rate_limit": {
    "requests": 100,
    "window_ms": 60000,
    "concurrent": 5
  }
}
```

### 挙動

- `requests`: ウィンドウ内の最大リクエスト数
- `window_ms`: ウィンドウサイズ（ミリ秒）
- `concurrent`: 最大同時実行数

超過した場合、429 エラーを返す

---

## ストリーミング

### 形式

**NDJSON (Newline-Delimited JSON)**

各行が独立したJSONオブジェクト

### 実装

```typescript
const encoder = new TextEncoder();

const stream = new ReadableStream({
  async start(controller) {
    for await (const chunk of result.fullStream) {
      const data = toOllamaStreamChunk(...);
      controller.enqueue(
        encoder.encode(JSON.stringify(data) + '\n')
      );
    }
    controller.close();
  },
});

return new Response(stream, {
  headers: { 'Content-Type': 'application/x-ndjson' }
});
```

---

## 設定ファイル

### config.json

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

### providers.json

```json
{
  "my-openai": {
    "provider": "openai",
    "api_key": "sk-...",
    "base_url": null,
    "max_retries": 5,
    "rate_limit": {
      "requests": 100,
      "window_ms": 60000,
      "concurrent": 5
    },
    "models": [
      {
        "name": "gpt-4o",
        "provider": "my-openai",
        "provider_type": "openai",
        "model_name": "gpt-4o-2024-08-06",
        "rate_limit": {
          "requests": 50
        }
      }
    ]
  }
}
```

---

## クライアントライブラリ

### Python (ollama-python)

```python
import ollama

client = ollama.Client(host='http://localhost:11434')

response = client.chat(
    model='gpt-4o',
    messages=[
        {'role': 'user', 'content': 'Hello!'}
    ]
)
print(response['message']['content'])
```

### JavaScript

```javascript
const response = await fetch('http://localhost:11434/api/chat', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gpt-4o',
    messages: [{ role: 'user', content: 'Hello!' }]
  })
});

const data = await response.json();
console.log(data.message.content);
```

### cURL

```bash
curl http://localhost:11434/api/tags
curl -X POST http://localhost:11434/api/generate \
  -H "Content-Type: application/json" \
  -d '{"model":"gpt-4o","prompt":"Hello"}'
```
