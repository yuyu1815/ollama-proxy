# Ollama API リファレンス (日本語訳)

このドキュメントは、Ollamaの公式API仕様に基づき、日本語でまとめたものです。`https://ollama-jp.apidog.io/` の内容を補完・集約することを目的としています。

---

## 目次

1. [エンドポイント一覧](#エンドポイント一覧)
2. [規約 (Conventions)](#規約-conventions)
3. [各エンドポイントの詳細](#各エンドポイントの詳細)
   - [Generate a completion (生成)](#1-generate-a-completion-生成)
   - [Generate a chat completion (チャット生成)](#2-generate-a-chat-completion-チャット生成)
   - [Create a Model (モデル作成)](#3-create-a-model-モデル作成)
   - [List Local Models (ローカルモデル一覧)](#4-list-local-models-ローカルモデル一覧)
   - [Show Model Information (モデル情報表示)](#5-show-model-information-モデル情報表示)
   - [Copy a Model (モデルのコピー)](#6-copy-a-model-モデルのコピー)
   - [Delete a Model (モデルの削除)](#7-delete-a-model-モデルの削除)
   - [Pull a Model (モデルのプル)](#8-pull-a-model-モデルのプル)
   - [Push a Model (モデルのプッシュ)](#9-push-a-model-モデルのプッシュ)
   - [Generate Embeddings (埋め込み生成)](#10-generate-embeddings-埋め込み生成)
   - [List Running Models (実行中モデル一覧)](#11-list-running-models-実行中モデル一覧)
   - [Version (バージョン取得)](#12-version-バージョン取得)
4. [Tool Calling (ツール呼び出し)](#tool-calling-ツール呼び出し)

---

## エンドポイント一覧

| 機能           | メソッド | パス            | 説明                                                 |
| :------------- | :------- | :-------------- | :--------------------------------------------------- |
| 生成           | `POST`   | `/api/generate` | 指定したモデルでプロンプトに対する回答を生成します。 |
| チャット生成   | `POST`   | `/api/chat`     | チャット形式で次のメッセージを生成します。           |
| モデル作成     | `POST`   | `/api/create`   | Modelfile等から新しいモデルを作成します。            |
| モデル一覧     | `GET`    | `/api/tags`     | ローカルに存在するモデルの一覧を取得します。         |
| モデル情報     | `POST`   | `/api/show`     | モデルの詳細情報を表示します。                       |
| モデルコピー   | `POST`   | `/api/copy`     | 既存のモデルを別の名前でコピーします。               |
| モデル削除     | `DELETE` | `/api/delete`   | モデルを削除します。                                 |
| モデルプル     | `POST`   | `/api/pull`     | ライブラリからモデルをダウンロードします。           |
| モデルプッシュ | `POST`   | `/api/push`     | ライブラリにモデルをアップロードします。             |
| 埋め込み生成   | `POST`   | `/api/embed`    | テキストからベクトル埋め込みを生成します。           |
| 実行中モデル   | `GET`    | `/api/ps`       | 現在メモリにロードされているモデルを表示します。     |
| バージョン     | `GET`    | `/api/version`  | Ollamaのバージョンを取得します。                     |

---

## 規約 (Conventions)

### モデル名 (Model names)

モデル名は `model:tag` の形式をとります。`model` は `example/model` のようにネームスペースを含むことができます。タグを省略した場合は `latest` がデフォルトとなります。

### 期間 (Durations)

すべての期間（時間）は**ナノ秒**で返されます。

### ストリーミングレスポンス (Streaming responses)

一部のエンドポイントは、レスポンスをJSONオブジェクトのストリームとして返します。リクエストで `{"stream": false}` を指定することで、ストリーミングを無効にし、単一のJSONオブジェクトとして受け取ることができます。

---

## エラーハンドリング (Error Handling)

Ollama APIは、エラー発生時に標準的なHTTPステータスコードとJSON形式のエラーメッセージを返します。

### 一般的なステータスコード

- `400 Bad Request`: リクエストパラメータの欠落や不正なJSONなど。
- `404 Not Found`: 指定されたモデルが見つからない場合など。
- `429 Too Many Requests`: レート制限超過。
- `500 Internal Server Error`: サーバー内部エラー。

### エラーレスポンス形式

#### 非ストリーミング時 (Non-Streaming)

標準的なHTTPエラーレスポンスとして、JSONボディに `error` フィールドが含まれます。

```json
{
  "error": "model 'llama3' not found, try pulling it first"
}
```

#### ストリーミング時 (Streaming)

リクエスト処理中にエラーが発生した場合（ストリーム開始後）、HTTPステータスコードは `200 OK` のままですが、ストリーム内のJSONオブジェクトとしてエラー情報が送信されます。

```json
{
  "error": "unexpected end of stream"
}
```

クライアント実装時は、ストリーム内の各チャンクで `error` フィールドが存在するか確認する必要があります。

---

## 各エンドポイントの詳細

### 1. Generate a completion (生成)

`POST /api/generate`

プロンプトに対して回答を生成します。ストリーミング対応。

#### リクエストパラメータ

- `model`: (必須) モデル名
- `prompt`: 回答を生成するためのプロンプト
- `suffix`: 回答の後に続くテキスト
- `images`: (任意) base64エンコードされた画像のリスト（マルチモーダルモデル用）
- `format`: レスポンスの形式（`json` または JSONスキーマ）
- `options`: 内部パラメータ（`temperature` など）
- `system`: システムメッセージ（Modelfileを上書き）
- `template`: プロンプトテンプレート（Modelfileを上書き）
- `stream`: `false` の場合、単一のオブジェクトで返却
- `raw`: `true` の場合、プロンプトに書式を適用しない
- `keep_alive`: モデルをメモリに保持する時間（デフォルト: `5m`）

#### リクエスト例

```bash
curl http://localhost:11434/api/generate -d '{
  "model": "llama3.2",
  "prompt": "空はなぜ青いのですか？",
  "stream": false
}'
```

#### レスポンス例

```json
{
  "model": "llama3.2",
  "created_at": "2023-08-04T19:22:45.499127Z",
  "response": "空が青いのは、太陽の光が地球の大気で散乱されるためです...",
  "done": true,
  "context": [1, 2, 3],
  "total_duration": 5043500667,
  "load_duration": 5025959,
  "prompt_eval_count": 26,
  "prompt_eval_duration": 325953000,
  "eval_count": 290,
  "eval_duration": 4709213000
}
```

**Token ID配列 (context) について:**
レスポンスに含まれる `context` フィールドは、会話の状態（メモリ）を表す整数（Token ID）の配列です。これを次回の `/api/generate` リクエストの `context` パラメータとして送り返すことで、会話の文脈を維持することができます。
_注: `/api/chat` では `messages` 配列を使用するため、通常この `context` 配列は使用しません。_

---

### 2. Generate a chat completion (チャット生成)

`POST /api/chat`

メッセージ履歴に基づいて次の回答を生成します。

#### リクエストパラメータ

- `model`: (必須) モデル名
- `messages`: チャットメッセージのリスト
  - `role`: `system`, `user`, `assistant`, `tool`
  - `content`: メッセージ内容
  - `images`: (任意) 画像リスト
  - `tool_calls`: (任意) モデルが呼び出そうとしているツール
- `tools`: モデルが使用可能なツールのリスト
- `format`: `json` または JSONスキーマ
- `stream`: ストリーミングの有無
- `keep_alive`: メモリ保持時間

#### リクエスト例

```bash
curl http://localhost:11434/api/chat -d '{
  "model": "llama3.2",
  "messages": [
    { "role": "user", "content": "こんにちは！" }
  ],
  "stream": false
}'
```

---

### 3. Create a Model (モデル作成)

`POST /api/create`

既存のモデルやGGUFファイルから新しいモデルを作成します。

#### パラメータ

- `model`: 作成するモデル名
- `from`: ベースとなるモデル名
- `modelfile`: Modelfileの内容
- `stream`: 進捗状況のストリーミング

---

### 4. List Local Models (ローカルモデル一覧)

`GET /api/tags`

#### レスポンス例

```json
{
  "models": [
    {
      "name": "llama3.2:latest",
      "modified_at": "2023-08-04T19:22:45.499127Z",
      "size": 4661224676,
      "digest": "cb303304d686...",
      "details": {
        "format": "gguf",
        "family": "llama",
        "parameter_size": "3B",
        "quantization_level": "Q4_0"
      }
    }
  ]
}
```

---

### 5. Show Model Information (モデル情報表示)

`POST /api/show`

#### リクエスト

```json
{
  "model": "llama3.2"
}
```

---

### 6. Copy a Model (モデルのコピー)

`POST /api/copy`

#### リクエスト

```json
{
  "source": "llama3.2",
  "destination": "my-llama"
}
```

---

### 7. Delete a Model (モデルの削除)

`DELETE /api/delete`

#### リクエスト

```json
{
  "model": "my-llama"
}
```

---

### 8. Pull a Model (モデルのプル)

`POST /api/pull`

#### リクエスト

```json
{
  "model": "llama3.2"
}
```

---

### 9. Push a Model (モデルのプッシュ)

`POST /api/push`

#### リクエスト

```json
{
  "model": "user/model"
}
```

---

### 10. Generate Embeddings (埋め込み生成)

`POST /api/embed`

#### リクエスト

```json
{
  "model": "all-minilm",
  "input": "こんにちわ"
}
```

---

### 11. List Running Models (実行中モデル一覧)

`GET /api/ps`

現在メモリ上にあるモデルの一覧。

---

### 12. Version (バージョン取得)

`GET /api/version`

#### レスポンス例

```json
{
  "version": "0.1.45"
}
```

---

## Tool Calling (ツール呼び出し)

Ollamaはツール呼び出し（Function calling）をサポートしています。詳細は以下のドキュメントを参照してください。

- [Tool Calling ドキュメント (TOOL_CALLING.md)](TOOL_CALLING.md)

---

_注: このドキュメントは公式ドキュメントを元に作成されました。最新情報は公式リポジトリを確認してください。_
