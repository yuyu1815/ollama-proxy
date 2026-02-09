# Ollama Proxy JS プロジェクト概要

## プロジェクト基本情報

**プロジェクト名:** ollama-proxy  
**バージョン:** 1.0.0  
**説明:** Vercel AI SDKを使用したOllama互換APIプロキシサーバー

## 技術スタック

### ランタイム
- **Bun** - 高速JavaScriptランタイム（Node.js互換）
- **TypeScript 5.6** - 型安全な開発

### フレームワーク・ライブラリ
- **Hono 4.6** - 軽量Webフレームワーク
- **Vercel AI SDK 4.0** - AIプロバイダー統一インターフェース
- **i18next 25.8** - 国際化対応

### AIプロバイダー対応
- OpenAI, Anthropic, Google, xAI, Azure
- Mistral, Cohere, DeepSeek, Together AI
- Groq, Fireworks, AWS Bedrock

### 開発ツール
- **Vitest** - テストフレームワーク
- **ESLint** - リンティング
- **Prettier** - コードフォーマット

## プロジェクト構造

```
js_pro/
├── src/
│   ├── domain/              # ドメイン層（型定義・変換ロジック）
│   │   ├── types.ts         # コア型定義
│   │   ├── converter.ts     # Ollama形式への変換
│   │   └── converter.test.ts
│   │
│   ├── infrastructure/      # インフラ層
│   │   ├── config/          # 設定管理
│   │   │   ├── manager.ts
│   │   │   ├── provider_service.ts
│   │   │   └── templates/   # デフォルト設定テンプレート
│   │   ├── providers/       # AIプロバイダーファクトリー
│   │   │   ├── factory.ts
│   │   │   └── factory.test.ts
│   │   ├── logging/         # ログ機能
│   │   ├── ratelimit/       # レート制限
│   │   ├── storage/         # 使用量記録
│   │   └── i18n/            # 国際化
│   │
│   ├── interface/           # インターフェース層
│   │   ├── http/            # HTTPサーバー・ルート
│   │   │   ├── server.ts    # サーバーエントリー
│   │   │   └── routes/      # APIルート
│   │   │       ├── models.ts    # モデル管理
│   │   │       ├── generate.ts  # テキスト生成
│   │   │       ├── chat.ts      # チャット
│   │   │       └── admin.ts     # 管理画面API
│   │   └── static/          # Web UI静的ファイル
│   │       ├── index.html
│   │       ├── css/
│   │       └── js/
│   │
│   ├── locales/             # 翻訳ファイル
│   │   ├── en.json
│   │   └── ja.json
│   │
│   └── main.ts              # アプリケーションエントリー
│
├── package.json
├── tsconfig.json
├── vitest.config.ts
└── eslint.config.mjs
```

## 設定ファイルの場所

すべての設定は `~/.ollama-proxy/` ディレクトリに保存されます：

- `config.json` - サーバー設定（ポート、ホスト、ログレベル等）
- `providers.json` - プロバイダー・モデル設定
- `usage_logs.json` - 使用量ログ

## アーキテクチャの概要

### レイヤードアーキテクチャ

```
┌─────────────────────────────────────────────┐
│           Interface Layer (Hono)            │
│  HTTP Routes + Static Web UI               │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│         Domain Layer (Types + Logic)        │
│  Type Definitions + Converters              │
└──────────────────┬──────────────────────────┘
                   │
┌──────────────────▼──────────────────────────┐
│      Infrastructure Layer (Services)        │
│  Config, Providers, RateLimit, Storage,     │
│  Logging, i18n                              │
└─────────────────────────────────────────────┘
```

### 依存関係の方向

- **Interface** → Domain → Infrastructure
- Infrastructure層はDomain層の型に依存
- Interface層はInfrastructure層のサービスを利用

## 主要機能

1. **Ollama互換API** - `/api/*` エンドポイント
   - モデル一覧 (`/api/tags`)
   - テキスト生成 (`/api/generate`)
   - チャット (`/api/chat`)

2. **管理画面** - `/admin` エンドポイント
   - プロバイダー管理
   - モデル管理
   - 使用量統計

3. **マルチプロバイダー対応**
   - 12種類以上のAIプロバイダー
   - 統一されたインターフェース

4. **レート制限**
   - グローバル/プロバイダー/モデル単位
   - トークンバケットアルゴリズム

5. **使用量トラッキング**
   - トークン使用量の記録
   - 日次/モデル/プロバイダー別統計
