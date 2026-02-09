# アーキテクチャ詳細

## レイヤー分割

### 1. Domain Layer（ドメイン層）

**役割:** ビジネスロジックと型定義

**構成要素:**

#### types.ts
- コア型定義
- プロバイダー、モデル、設定の型
- Ollama API互換のリクエスト/レスポンス型
- レート制限設定型

**主要な型:**
```typescript
// プロバイダー設定
ProviderConfig {
  provider: ProviderType
  api_key?: string
  base_url?: string
  max_retries?: number
  rate_limit?: RateLimitConfig
  models: ModelConfig[]
}

// モデル設定
ModelConfig {
  name: string              // Ollamaでの名称
  provider: string          // プロバイダーID
  provider_type: ProviderType
  model_name: string        // 実際のモデルID
  api_key?: string
  base_url?: string
  rate_limit?: RateLimitConfig
}

// レート制限
RateLimitConfig {
  requests?: number         // ウィンドウ内の最大リクエスト数
  window_ms?: number        // ウィンドウサイズ（ミリ秒）
  concurrent?: number       // 最大同時実行数
}
```

#### converter.ts
- AI SDKレスポンス → Ollama形式への変換
- タイムスタンプ・継続時間のフォーマット
- ストリーミング/非ストリーミング両対応

**変換関数:**
- `toOllamaGenerateResponse()` - /api/generate レスポンス
- `toOllamaGenerateStreamChunk()` - ストリーミングチャンク
- `toOllamaChatResponse()` - /api/chat レスポンス
- `toOllamaChatStreamChunk()` - チャットストリーミング
- `toOllamaModelListItem()` - モデル一覧アイテム
- `toOllamaModelInfo()` - モデル詳細情報

---

### 2. Infrastructure Layer（インフラ層）

**役割:** 外部サービス・技術的関心の分離

#### Config Management（設定管理）

**manager.ts** - 設定マネージャー
- `~/.ollama-proxy/` ディレクトリの管理
- config.json, providers.json の読み込み・保存
- ファイル監視による自動リロード
- レート制限設定のマージ（モデル > プロバイダー > グローバル）

**provider_service.ts** - プロバイダーサービス
- providers.json のCRUD操作
- プロバイダーの追加・更新・削除
- モデルの追加・更新・削除
- プロバイダー検索機能

**templates/** - 設定テンプレート
- `default-config.json` - デフォルトサーバー設定
- `default-providers.json` - デフォルトプロバイダー設定

#### Provider Factory（プロバイダーファクトリー）

**factory.ts**
- AI SDKプロバイダーの生成
- 12種類のプロバイダーに対応
- カスタムAPIキー/ベースURLのサポート

**対応プロバイダー:**
```typescript
'openai' | 'anthropic' | 'google' | 'xai' | 'azure'
| 'mistral' | 'cohere' | 'deepseek' | 'togetherai'
| 'groq' | 'fireworks' | 'bedrock'
```

#### Rate Limiter（レート制限）

**ratelimiter.ts**
- トークンバケットアルゴリズム実装
- プロバイダー/モデル別設定
- リクエストキュー管理
- 同時実行数制限

**設定優先順位:**
1. モデル固有設定（最優先）
2. プロバイダー設定
3. グローバル設定

#### Storage（ストレージ）

**usage.ts** - 使用量記録
- トークン使用量の記録
- 日次統計
- モデル別統計
- プロバイダー別統計

#### Logging（ロギング）

**logger.ts** - 構造化ロギング
- ログレベル対応（debug, info, warn, error）
- 設定可能なログレベル
- タイムスタンプ・メタデータ付きログ

#### i18n（国際化）

**index.ts**
- i18nextによる多言語対応
- 英語・日本語翻訳
- エラーメッセージの国際化

---

### 3. Interface Layer（インターフェース層）

**役割:** HTTPリクエスト/レスポンス処理

#### HTTP Server

**server.ts**
- Honoアプリケーションの構築
- ルーティング設定
- 静的ファイル配信
- グローバルミドルウェア設定

#### API Routes

**models.ts** - モデル管理API
```
GET  /api/tags       - モデル一覧
POST /api/show       - モデル詳細
GET  /api/ps         - 実行中モデル（常に空）
GET  /api/version    - バージョン情報
```

**generate.ts** - テキスト生成API
```
POST /api/generate
  - model: モデル名
  - prompt: プロンプト
  - stream: ストリーミング有無
  - system: システムプロンプト
  - format: 出力形式（json）
  - options: 生成パラメータ
```

**chat.ts** - チャットAPI
```
POST /api/chat
  - model: モデル名
  - messages: 会話履歴
  - stream: ストリーミング有無
  - tools: ツール定義
  - format: 出力形式（json）
  - options: 生成パラメータ
```

**admin.ts** - 管理画面API
```
GET    /admin/api/config      - サーバー設定取得
POST   /admin/api/config      - 設定更新
GET    /admin/api/models      - モデル一覧
POST   /admin/api/models      - モデル作成
PUT    /admin/api/models/:id  - モデル更新
DELETE /admin/api/models/:id  - モデル削除
GET    /admin/api/providers   - プロバイダー一覧
POST   /admin/api/providers   - プロバイダー作成
PUT    /admin/api/providers/:id  - プロバイダー更新
DELETE /admin/api/providers/:id  - プロバイダー削除
GET    /admin/api/stats       - 使用統計
POST   /admin/api/reload      - 設定再読み込み
```

#### Static Web UI

**index.html** + **js/app.js**
- Vue 3 ベースのシングルページアプリケーション
- プロバイダー/モデル管理画面
- 統計ダッシュボード
- Chart.js による可視化

---

## データフロー

### チャットリクエストのフロー

```
1. クライアント → POST /api/chat
   ↓
2. chat.ts: リクエスト検証
   - モデル名・メッセージの存在確認
   - ModelConfigの取得
   ↓
3. ratelimit.ts: レート制限チェック
   - 利用可能なトークン確認
   - キューへの追加（必要な場合）
   ↓
4. factory.ts: AIプロバイダー生成
   - 設定に基づくプロバイダーインスタンス作成
   ↓
5. AI SDK: ストリーミング開始
   - generateText() / streamText()
   ↓
6. converter.ts: レスポンス変換
   - AI SDK形式 → Ollama形式
   ↓
7. usage.ts: 使用量記録
   - トークン数の保存
   ↓
8. ratelimit.ts: リリース
   - 次のリクエストを処理
   ↓
9. クライアント ← レスポンス
```

---

## 設計パターン

### 1. 依存性注入
- ConfigManager, UsageStorageをルートに注入
- 各ルートハンドラーが依存を受け取る

### 2. ファクトリーパターン
- createLanguageModel() によるプロバイダー生成
- 抽象化されたプロバイダー作成

### 3. 変換レイヤー
- converter.ts による形式変換
- AI SDK ↔ Ollama のブリッジ

### 4. ストラテジーパターン
- レート制限: モデル/プロバイダー/グローバル
- 優先順位に基づく設定選択

### 5. リポジトリパターン
- ProviderService による設定ファイルのCRUD
- UsageStorage によるログ記録

---

## 拡張ポイント

1. **新しいプロバイダーの追加**
   - factory.ts にケースを追加
   - types.ts にProviderTypeを追加

2. **新しいAI機能の追加**
   - domain/types.ts に型定義
   - converter.ts に変換関数
   - 新しいルートを作成

3. **ミドルウェアの追加**
   - server.ts の app.use() に追加

4. **ログ出力先の変更**
   - logger.ts を拡張してファイル/サービス出力
