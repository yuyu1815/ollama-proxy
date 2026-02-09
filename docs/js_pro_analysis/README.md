# Ollama Proxy JS プロジェクト - 完全ドキュメント

このディレクトリには、`js_pro` プロジェクトの詳細な分析とドキュメントが含まれています。

## ドキュメント構成

### 📋 [00_PROJECT_OVERVIEW.md](./00_PROJECT_OVERVIEW.md)
プロジェクトの基本情報、技術スタック、ディレクトリ構造の概要

**内容:**
- プロジェクト基本情報
- 使用技術（Bun, Hono, Vercel AI SDK）
- ディレクトリ構造
- 主要機能の概要

---

### 🏗️ [01_ARCHITECTURE.md](./01_ARCHITECTURE.md)
アーキテクチャ全体図と設計パターンの解説

**内容:**
- レイヤードアーキテクチャの説明
- 各レイヤーの役割
- 依存関係の方向
- データフローの図解
- 設計パターン一覧
- 拡張ポイント

---

### 🧩 [02_DOMAIN_LAYER.md](./02_DOMAIN_LAYER.md)
Domain Layer（ドメイン層）の詳細解説

**内容:**
- types.ts: 全ての型定義
  - プロバイダー型、モデル設定、レート制限
  - Ollama API 互換型
- converter.ts: AI SDK → Ollama 形式変換
  - 全変換関数の詳細
  - ストリーミング対応
- 設計上の判断

**対象読者:** 型システムを理解したい人、Ollama互換性の詳細を知りたい人

---

### ⚙️ [03_INFRASTRUCTURE_LAYER.md](./03_INFRASTRUCTURE_LAYER.md)
Infrastructure Layer（インフラ層）の詳細解説

**内容:**
- Config Management
  - ConfigManager: 設定管理、ファイル監視
  - ProviderService: プロバイダーCRUD
  - テンプレートシステム
- Provider Factory
  - 12種類のプロバイダー対応
  - カスタム設定のサポート
- Rate Limiter
  - トークンバケットアルゴリズム
  - 階層的な設定
- Storage
  - 使用量記録と統計
- Logging
  - 構造化ロギング
- i18n
  - 多言語対応

**対象読者:** 設定システムを理解したい人、レート制限の実装を知りたい人

---

### 🌐 [04_INTERFACE_LAYER.md](./04_INTERFACE_LAYER.md)
Interface Layer（インターフェース層）の詳細解説

**内容:**
- HTTP Server (server.ts)
  - Honoアプリケーション構築
  - ミドルウェア設定
- API Routes
  - /api/tags: モデル一覧
  - /api/generate: テキスト生成
  - /api/chat: チャット補完
  - /admin/*: 管理画面API
- Static Web UI
  - Vue 3 アプリケーション
  - コンポーネント構造
  - 状態管理
- エラーハンドリング
- ロギング戦略

**対象読者:** APIエンドポイントを利用したい人、Web UIをカスタマイズしたい人

---

### 🔧 [05_SIMPLIFICATION_RECOMMENDATIONS.md](./05_SIMPLIFICATION_RECOMMENDATIONS.md)
簡略化のための具体的な改善提案

**内容:**
- 現状の問題点（6つ）
- 簡略化プラン（6フェーズ）
  - Phase 1: ログの削減
  - Phase 2: 共通関数の抽出
  - Phase 3: ProviderService の統合
  - Phase 4: 使用量ストレージの改善
  - Phase 5: Web UI の分割
  - Phase 6: 依存性注入の導入
- 期待される効果（コード量、パフォーマンス、保守性）
- 実装の優先順位
- テスト計画
- ロールバック計画

**対象読者:** プロジェクトを改善したい人、リファクタリングを計画している人

---

### 📖 [06_API_REFERENCE.md](./06_API_REFERENCE.md)
完全な API リファレンス

**内容:**
- Ollama互換 API
  - モデル管理 (GET /api/tags, POST /api/show)
  - テキスト生成 (POST /api/generate)
  - チャット (POST /api/chat)
- 管理画面 API
  - 設定管理
  - プロバイダー管理
  - モデル管理
  - 統計
- エラーレスポンス
- レート制限
- 設定ファイル
- クライアントライブラリ使用例

**対象読者:** APIを利用する開発者、クライアントを実装する人

---

## 読み方ガイド

### 初めてプロジェクトを見る人

1. **[00_PROJECT_OVERVIEW.md](./00_PROJECT_OVERVIEW.md)** から始める
2. **[01_ARCHITECTURE.md](./01_ARCHITECTURE.md)** で全体像を理解
3. **[06_API_REFERENCE.md](./06_API_REFERENCE.md)** で API 使用方法を確認

### プロジェクトを改善したい人

1. **[05_SIMPLIFICATION_RECOMMENDATIONS.md](./05_SIMPLIFICATION_RECOMMENDATIONS.md)** を確認
2. 優先順位に従って改善を実施
3. 各レイヤーのドキュメントを参照しながら実装

### 特定の機能を理解したい人

| 関心事 | 参照ドキュメント |
|--------|-----------------|
| 型定義 | [02_DOMAIN_LAYER.md](./02_DOMAIN_LAYER.md) |
| 設定管理 | [03_INFRASTRUCTURE_LAYER.md](./03_INFRASTRUCTURE_LAYER.md) (Config Management) |
| レート制限 | [03_INFRASTRUCTURE_LAYER.md](./03_INFRASTRUCTURE_LAYER.md) (Rate Limiter) |
| APIエンドポイント | [04_INTERFACE_LAYER.md](./04_INTERFACE_LAYER.md), [06_API_REFERENCE.md](./06_API_REFERENCE.md) |
| Web UI | [04_INTERFACE_LAYER.md](./04_INTERFACE_LAYER.md) (Static Web UI) |
| 使用量統計 | [03_INFRASTRUCTURE_LAYER.md](./03_INFRASTRUCTURE_LAYER.md) (Storage) |

---

## プロジェクト構造（簡易版）

```
js_pro/src/
├── domain/                 # ドメイン層
│   ├── types.ts           # 型定義
│   └── converter.ts       # 変換ロジック
│
├── infrastructure/        # インフラ層
│   ├── config/           # 設定管理
│   ├── providers/        # AIプロバイダーファクトリー
│   ├── ratelimit/        # レート制限
│   ├── storage/          # 使用量記録
│   ├── logging/          # ロギング
│   └── i18n/             # 国際化
│
├── interface/            # インターフェース層
│   ├── http/
│   │   ├── server.ts     # サーバー構築
│   │   └── routes/       # APIルート
│   │       ├── models.ts
│   │       ├── generate.ts
│   │       ├── chat.ts
│   │       └── admin.ts
│   └── static/           # Web UI
│
└── main.ts               # エントリーポイント
```

---

## 主要な概念

### レイヤードアーキテクチャ

```
Interface Layer (Hono)
       ↓
Domain Layer (Types + Logic)
       ↓
Infrastructure Layer (Services)
```

### 依存関係の原則

- **上のレイヤー** は **下のレイヤー** に依存
- **下のレイヤー** は **上のレイヤー** を知らない
- **同レイヤー内** での依存は最小限

### Ollama 互換性

- リクエスト/レスポンス形式を完全に模倣
- 既存の Ollama クライアントがそのまま使用可能
- 一部のエンドポイントはダミー実装

---

## 用語集

| 用語 | 説明 |
|------|------|
| **ProviderType** | AI プロバイダーの種類 (openai, anthropic, etc.) |
| **ProviderConfig** | プロバイダーの設定 (APIキー、ベースURL等) |
| **ModelConfig** | モデル固有の設定 |
| **RateLimitConfig** | レート制限設定 |
| **OllamaResponse** | Ollama 形式のレスポンス |
| **Token Bucket** | レート制限アルゴリズム |
| **NDJSON** | 改行区切りの JSON（ストリーミング用） |

---

## 関連リソース

### 外部ドキュメント

- [Bun Documentation](https://bun.sh/docs)
- [Hono Documentation](https://hono.dev)
- [Vercel AI SDK](https://sdk.vercel.ai/docs)
- [Ollama API](https://github.com/ollama/ollama/blob/main/docs/api.md)

### プロジェクトファイル

- `package.json` - 依存パッケージ
- `tsconfig.json` - TypeScript 設定
- `vitest.config.ts` - テスト設定

---

## 更新履歴

- **2025-02-09**: 初版作成
  - 全6ドキュメントの作成
  - アーキテクチャの完全な分析
  - 簡略化プランの策定

---

## フィードバック

このドキュメントに関する質問や改善提案は、プロジェクトの Issue または Pull Request で受け付けています。
