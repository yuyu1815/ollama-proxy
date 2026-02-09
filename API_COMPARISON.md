# Ollama Proxy API 比較ドキュメント

## 概要

このドキュメントでは、2つのOllama Proxy実装（Python版とJavaScript版）のAPIエンドポイントを徹底的に比較します。

---

## 1. 共通エンドポイント一覧

### 1.1 GET エンドポイント

| エンドポイント | Python版 | JavaScript版 | 説明 |
|---------------|----------|--------------|------|
| `GET /` | ✅ | ✅ | ヘルスチェック/ステータス確認 |
| `GET /api/tags` | ✅ | ✅ | モデル一覧取得 |
| `GET /api/ps` | ✅ | ✅ | 実行中モデル一覧（常に空配列） |
| `GET /api/version` | ✅ | ✅ | バージョン情報取得 |

### 1.2 POST エンドポイント

| エンドポイント | Python版 | JavaScript版 | 説明 |
|---------------|----------|--------------|------|
| `POST /api/generate` | ✅ | ✅ | テキスト生成 |
| `POST /api/chat` | ✅ | ✅ | チャット完了 |
| `POST /api/show` | ✅ | ✅ | モデル情報取得 |
| `POST /api/embed` | ⚠️ 501 | ⚠️ 501 | 埋め込み生成（未実装） |
| `POST /api/create` | ⚠️ 501 | ⚠️ 501 | モデル作成（未実装） |
| `POST /api/copy` | ⚠️ 501 | ⚠️ 501 | モデルコピー（未実装） |
| `POST /api/pull` | ⚠️ 501 | ⚠️ 501 | モデルプル（未実装） |
| `POST /api/push` | ⚠️ 501 | ⚠️ 501 | モデルプッシュ（未実装） |

### 1.3 DELETE エンドポイント

| エンドポイント | Python版 | JavaScript版 | 説明 |
|---------------|----------|--------------|------|
| `DELETE /api/delete` | ⚠️ 501 | ⚠️ 501 | モデル削除（未実装） |

### 1.4 Admin API（JavaScript版のみ）

| エンドポイント | メソッド | 説明 |
|---------------|----------|------|
| `/admin/api/config` | GET/POST | サーバー設定の取得/更新 |
| `/admin/api/models` | GET/POST | モデル一覧/作成 |
| `/admin/api/models/:name` | PUT/DELETE | モデル更新/削除 |
| `/admin/api/providers` | GET/POST | プロバイダー一覧/作成 |
| `/admin/api/providers/:id` | PUT/DELETE | プロバイダー更新/削除 |
| `/admin/api/reload` | POST | 設定リロード |
| `/admin/api/stats` | GET | 使用統計取得 |

---

## 2. 詳細な違い

### 2.1 `/api/generate` - テキスト生成

#### リクエストボディ

| フィールド | Python版 | JavaScript版 | 差異 |
|-----------|----------|--------------|------|
| `model` | ✅ 必須 | ✅ 必須 | 同じ |
| `prompt` | ✅ 必須 | ✅ 必須 | 同じ |
| `stream` | ✅ デフォルト: `true` | ✅ デフォルト: `true` | 同じ |
| `system` | ✅ サポート | ✅ サポート | 同じ |
| `format` | ✅ `json`サポート | ⚠️ 未使用 | **JavaScript版は未使用** |
| `options` | ✅ サポート | ✅ サポート | 同じ |
| `options.temperature` | ✅ | ✅ | 同じ |
| `options.num_predict` | ✅ | ✅ | 同じ（maxTokensとして使用） |
| `options.top_p` | ✅ | ✅ | 同じ |

#### レスポンスの違い

**Python版:**
- LiteLLMの`acompletion`を直接使用
- ストリーミング: `StreamingResponse` (FastAPI)
- 非ストリーミング: `JSONResponse`
- トークン使用量をLiteLLMから直接取得
- `reasoning_effort`と`thinking_budget`設定サポート

**JavaScript版:**
- AI SDKの`streamText`を使用
- 独自の`ReadableStream`実装
- トークン使用量はAI SDKの`onFinish`イベントから取得（チャットのみ）
- generateではトークン使用量を0として返す（`toOllamaGenerateResponse`の呼び出しで`0, 0`を渡している）

#### 重要な差異

1. **トークン使用量の取得:**
   - Python版: LiteLLMの`response.usage`から直接取得
   - JavaScript版: AI SDKの`onFinish`イベントで取得（chatのみ）

2. **Thinking/Reasoning設定:**
   - Python版: `_apply_config_options`で`reasoning_effort`と`thinking_budget`をサポート
   - JavaScript版: 未サポート

3. **Custom OpenAIプロバイダー処理:**
   - Python版: `custom_openai`を`openai`に変換
   - JavaScript版: 変換なし

---

### 2.2 `/api/chat` - チャット完了

#### リクエストボディ

| フィールド | Python版 | JavaScript版 | 差異 |
|-----------|----------|--------------|------|
| `model` | ✅ 必須 | ✅ 必須 | 同じ |
| `messages` | ✅ 必須 | ✅ 必須 | 同じ |
| `stream` | ✅ デフォルト: `true` | ✅ デフォルト: `true` | 同じ |
| `format` | ✅ `json`サポート | ⚠️ 未使用 | **JavaScript版は未使用** |
| `tools` | ✅ サポート | ⚠️ 未使用 | **JavaScript版は未使用** |
| `options` | ✅ サポート | ✅ サポート | 同じ |

#### レスポンスの違い

**Python版:**
- `tools`パラメータを完全にサポート
- `format: "json"`で`response_format: {type: "json_object"}`を設定
- `tool_calls`をレスポンスに含める
- ストリームチャンクにも`tool_calls`を含める

**JavaScript版:**
- `tools`と`format`パラメータを受け取るが未使用（`_tools`、`_format`として無視）
- トークン使用量は`onFinish`イベントで取得し、`usageStorage`に記録

#### 重要な差異

1. **ツールコールサポート:**
   - Python版: 完全サポート（`tools`パラメータ、レスポンスの`tool_calls`）
   - JavaScript版: パラメータは受け取るが無視

2. **JSONフォーマット:**
   - Python版: `format: "json"`で`response_format`を設定
   - JavaScript版: パラメータは受け取るが無視

3. **トークン使用記録:**
   - Python版: レスポンスに含めるのみ
   - JavaScript版: `usageStorage.addLog()`で永続化

4. **ログ出力:**
   - Python版: `dev_mode`時のみデバッグログ出力
   - JavaScript版: `logWithLevel`で詳細な構造化ログ出力

---

### 2.3 `/api/tags` - モデル一覧

#### 違い

**Python版:**
```python
@app.get("/api/tags")
async def list_models() -> JSONResponse:
    models = []
    for model_name in config.list_models():
        lite_config = config.get_litellm_config(model_name)
        if lite_config:
            models.append(
                converter.to_ollama_model_list_item(...)
            )
    return JSONResponse({"models": models})
```

**JavaScript版:**
```typescript
router.get('/tags', (c) => {
  const models = configManager.getAllModels();
  const ollamaModels = models.map((m) =>
    toOllamaModelListItem(m.name, m.provider, m.model_name)
  );
  return c.json({ models: ollamaModels });
});
```

#### 差異

- **関数名:** Python版は`list_models`、JavaScript版は`getAllModels`
- **コンバーター:** 両方とも同名だが異なるファイルで実装

---

### 2.4 `/api/show` - モデル情報

#### リクエストボディ

| フィールド | Python版 | JavaScript版 | 差異 |
|-----------|----------|--------------|------|
| `name` | ✅ 必須 | ✅ 必須 | 同じ |

#### エラーハンドリング

**Python版:**
```python
if not lite_config:
    return JSONResponse(
        {"error": f"model '{model_name}' not found"},
        status_code=404,
    )
```

**JavaScript版:**
```typescript
if (!modelName) {
  return c.json({ error: i18n.t('errors.model_name_required') }, 400);
}
if (!modelConfig) {
  return c.json(
    { error: i18n.t('errors.model_not_found', { modelName }) },
    404
  );
}
```

#### 差異

1. **バリデーション:**
   - Python版: `name`フィールドの存在チェックなし（空文字列でも処理）
   - JavaScript版: `name`フィールドの存在を明示的にチェック（400エラー）

2. **エラーメッセージ:**
   - Python版: ハードコードされた英語メッセージ
   - JavaScript版: i18n対応メッセージ

---

### 2.5 エラーレスポンス

#### ステータスコード

| シナリオ | Python版 | JavaScript版 |
|---------|----------|--------------|
| モデル未検出 | 404 | 404 |
| 必須パラメータ不足 | 404（generate） | 400（明示的チェック） |
| サーバーエラー | 500 | 500 |
| 未実装機能 | 501 | 501 |

#### エラーメッセージ形式

**Python版:**
```json
{
  "error": "model 'xxx' not found"
}
```

**JavaScript版:**
```json
{
  "error": "翻訳されたメッセージ"
}
```

#### 差異

- Python版は英語のハードコードメッセージ
- JavaScript版はi18n対応（日本語・英語）

---

### 2.6 バージョン情報

| 項目 | Python版 | JavaScript版 |
|------|----------|--------------|
| バージョン番号 | `"0.1.0"` | `"0.5.0"` |

---

## 3. 実装アーキテクチャの違い

### 3.1 フレームワーク

| 項目 | Python版 | JavaScript版 |
|------|----------|--------------|
| フレームワーク | FastAPI | Hono |
| LLMライブラリ | LiteLLM | AI SDK |
| ストリーミング | FastAPIの`StreamingResponse` | 独自`ReadableStream`実装 |

### 3.2 設定管理

**Python版:**
- `ConfigManager`クラス
- `get_litellm_config()`メソッド
- `list_models()`メソッド

**JavaScript版:**
- `ConfigManager`クラス
- `getModelConfig()`メソッド
- `getAllModels()`メソッド
- `ProviderService`クラスでプロバイダー管理

### 3.3 ログ記録

**Python版:**
```python
def debug_log(message: str) -> None:
    if config.get_server_config().dev_mode:
        print(f"[DEBUG] {message}", flush=True)
```

**JavaScript版:**
```typescript
logWithLevel(configManager, 'info', 'message', { /* metadata */ });
```

**差異:**
- Python版: シンプルなprintデバッグ
- JavaScript版: 構造化ログ（レベル、メタデータ付き）

### 3.4 使用統計

**Python版:**
- 使用統計の永続化なし

**JavaScript版:**
- `UsageStorage`クラスで使用統計を記録
- Admin APIで統計情報を提供

---

## 4. コンバーター関数の違い

### 4.1 関数名の違い

| 機能 | Python版 | JavaScript版 |
|------|----------|--------------|
| モデル一覧アイテム | `to_ollama_model_list_item` | `toOllamaModelListItem` |
| モデル情報 | `to_ollama_model_info` | `toOllamaModelInfo` |
| 生成レスポンス | `to_ollama_generate_response` | `toOllamaGenerateResponse` |
| 生成ストリームチャンク | `to_ollama_generate_stream_chunk` | `toOllamaGenerateStreamChunk` |
| チャットレスポンス | `to_ollama_chat_response` | `toOllamaChatResponse` |
| チャットストリームチャンク | `to_ollama_chat_stream_chunk` | `toOllamaChatStreamChunk` |

### 4.2 パラメータの違い

#### `to_ollama_generate_response` / `toOllamaGenerateResponse`

**Python版:**
```python
to_ollama_generate_response(
    content: str,
    model_name: str,
    duration_seconds: float,
    prompt_tokens: int,
    completion_tokens: int,
)
```

**JavaScript版:**
```typescript
toOllamaGenerateResponse(
  content: string,
  modelName: string,
  durationSeconds: number,
  promptTokens = 0,  // デフォルト値
  completionTokens = 0,  // デフォルト値
)
```

**差異:**
- JavaScript版は`generate`でトークン数を0として返す
- Python版はLiteLLMから実際のトークン数を取得

---

## 5. 未実装エンドポイントの扱い

### 5.1 Python版

各エンドポイントに個別の関数を定義:
```python
@app.post("/api/embed")
async def generate_embeddings(_request: Request) -> JSONResponse:
    return JSONResponse(
        {"error": "embeddings are not yet supported"},
        status_code=501,
    )
```

### 5.2 JavaScript版

ループで一括定義:
```typescript
const unimplemented = ['/create', '/copy', '/delete', '/pull', '/push', '/embed'];
for (const endpoint of unimplemented) {
  router.post(endpoint, (c) => {
    return c.json(
      { error: i18n.t('errors.not_supported_in_proxy', { endpoint }) },
      501
    );
  });
}
```

**差異:**
- Python版: 各エンドポイント個別に実装
- JavaScript版: 一括定義でDRY（Don't Repeat Yourself）原則を適用

---

## 6. セキュリティとバリデーション

### 6.1 入力検証

**Python版:**
- 最小限のバリデーション
- パラメータの存在チェックのみ

**JavaScript版:**
- 明示的なガード節（guard clauses）
- 型チェック（`Array.isArray(messages)`）
- 詳細なエラーログ

### 6.2 エラーハンドリング

**Python版:**
```python
try:
    response = await litellm.acompletion(...)
except Exception as e:
    return JSONResponse({"error": str(e)}, status_code=500)
```

**JavaScript版:**
```typescript
try {
  // ...
} catch (error) {
  logWithLevel(configManager, 'error', 'Chat error', {
    requestId,
    message: error instanceof Error ? error.message : String(error),
  });
  return c.json({ error: ... }, 500);
}
```

**差異:**
- JavaScript版はより詳細なエラーログを記録
- `requestId`を使用してリクエストを追跡

---

## 7. まとめ

### 7.1 主要な差異

1. **機能的差異:**
   - Python版: `tools`/`format`パラメータを完全サポート
   - JavaScript版: Admin API、使用統計、i18nサポート

2. **アーキテクチャ差異:**
   - Python版: LiteLLMを直接使用
   - JavaScript版: AI SDKを使用、よりモジュール化された設計

3. **ログとモニタリング:**
   - Python版: シンプルなデバッグログ
   - JavaScript版: 構造化ログ、使用統計、リクエスト追跡

4. **設定管理:**
   - Python版: 単一の設定ファイル
   - JavaScript版: プロバイダーとモデルの分離管理

### 7.2 推奨事項

- **tools/formatサポート**が必要な場合: Python版を使用
- **Admin GUIや使用統計**が必要な場合: JavaScript版を使用
- **シンプルさ**を重視する場合: Python版
- **拡張性とモニタリング**を重視する場合: JavaScript版

---

## 8. 型定義の比較

### 8.1 Python版（Pydantic未使用 - 辞書ベース）

```python
# 型定義なし - 辞書として処理
body = await request.json()
model_name = body.get("model", "")
prompt = body.get("prompt", "")
```

### 8.2 JavaScript版（TypeScriptインターフェース）

```typescript
// domain/types.ts で定義
export interface OllamaGenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  system?: string;
  format?: string;
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}

export interface OllamaChatRequest {
  model: string;
  messages: Array<{ role: string; content: string }>;
  stream?: boolean;
  format?: string;
  tools?: unknown[];
  options?: {
    temperature?: number;
    num_predict?: number;
    top_p?: number;
  };
}
```

**差異:**
- Python版: 実行時型チェックのみ
- JavaScript版: コンパイル時型チェック（TypeScript）

---

*最終更新: 2026-02-09*
