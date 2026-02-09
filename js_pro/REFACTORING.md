# JavaScript/TypeScript リファクタリング提案

## 概要

現在の `js_pro` コードベースは機能しているが、以下の点で改善の余地がある：

- 重複コード（特に `chat.ts` と `generate.ts`）
- 肥大化した `ConfigManager`
- グローバル状態の使用
- 型安全性の不足

**目標**: シンプルさを保ちつつ、保守性を向上させる

---

## 優先度別リファクタリング項目

### 🔴 高優先度（影響大 / 工数中）

#### 1. エラーハンドリングの統一

**現状**: `chat.ts` と `generate.ts` で同じエラー処理ロジックが重複

**影響**: バグ修正時に2箇所を修正する必要がある

**解決策**: 共通のエラーハンドラーを作成

```typescript
// src/domain/errors/handler.ts
export class ApiError extends Error {
  constructor(
    public statusCode: number,
    message: string
  ) {
    super(message);
  }
}

export function handleAIError(error: unknown): ApiError {
  // レート制限エラー
  if (isRateLimitError(error)) {
    return new ApiError(429, 'Rate limit reached');
  }
  // その他のエラー
  return new ApiError(500, error instanceof Error ? error.message : 'Unknown error');
}
```

**工数**: 約1時間

---

#### 2. グローバル状態の排除

**現状**: `RateLimiter` がグローバル変数を使用

**影響**: テストが困難、依存関係が不明確

**解決策**: 依存性注入（DI）パターンを採用

```typescript
// 現在
export function getGlobalRateLimiter(): RateLimiter | null {
  return globalRateLimiter;
}

// 改善後
export function createServer(configManager: ConfigManager) {
  const rateLimiter = new RateLimiter(serverConfig.rate_limit);
  const usageStorage = new UsageStorage();

  // ルーターに注入
  app.route('/api/chat', createChatRouter(configManager, usageStorage, rateLimiter));
}
```

**工数**: 約2時間

---

#### 3. Provider Factoryの簡素化

**現状**: 11個のProviderで同様のswitchケースが繰り返されている

**影響**: 新しいProvider追加時にコードが長くなる

**解決策**: マップベースの実装に変更

```typescript
// src/infrastructure/providers/factory.ts
const PROVIDER_REGISTRY = {
  openai: { default: openai, create: createOpenAI },
  anthropic: { default: anthropic, create: createAnthropic },
  google: { default: google, create: createGoogleGenerativeAI },
  // ... 他のProvider
} as const;

export function createLanguageModel(config: ModelConfig) {
  const provider = PROVIDER_REGISTRY[config.provider_type];
  const needsCustomOptions = config.api_key || config.base_url;

  const factory = needsCustomOptions
    ? provider.create
    : provider.default;

  const options = config.api_key || config.base_url
    ? { apiKey: config.api_key, baseURL: config.base_url }
    : {};

  return needsCustomOptions
    ? factory(options)(config.model_name)
    : factory(config.model_name);
}
```

**工数**: 約1時間

---

### 🟡 中優先度（影響中 / 工数小）

#### 4. ConfigManagerの分割

**現状**: 1つのクラスで設定読み込み、監視、Provider管理を担当

**影響**: テストが困難、責任が不明確

**解決策**: 機能を分割（最小限の変更で）

```typescript
// ConfigManager は設定の取得のみ担当
class ConfigManager {
  getModelConfig(name: string): ModelConfig | undefined { }
  getServerConfig(): ServerConfig { }
  listModels(): string[] { }
}

// ファイル監視は別クラスに
class ConfigWatcher {
  onFileChange(callback: () => void): void { }
  destroy(): void { }
}
```

**工数**: 約2時間

---

#### 5. 型定義の改善

**現状**: `any` 型の使用、オプショナルプロパティの過剰な使用

**影響**: 型安全性の低下、実行時エラーのリスク

**解決策**: 厳密な型定義

```typescript
// 現在
export function createLanguageModel(config: ModelConfig): any

// 改善後
import type { LanguageModelV1 } from '@ai-sdk/provider';

export function createLanguageModel(
  config: ModelConfig
): LanguageModelV1 {
  // 型安全な実装
}
```

**工数**: 約30分

---

### 🟢 低優先度（技術的負債）

#### 6. フロントエンドの簡素化

**現状**: `app.js` が1000行超え

**影響**: 保守性が低い

**解決策**: 機能ごとにファイル分割（最小限）

```
js_pro/src/interface/static/js/
├── app.js           # メインアプリ（調整者）
├── providers.js     # Provider管理ロジック
├── models.js        # Model管理ロジック
└── charts.js        # グラフ描画ロジック
```

**工数**: 約3時間

---

## シンプル化のための戦略

### 原則

1. **過剰な抽象化を避ける**: パターンを実装するためではなく、具体的な問題を解決するためにリファクタリングする
2. **一度に一つの変更**: 小さなステップで進める
3. **既存の動作を維持**: リファクタリング中に機能追加をしない

### 実行しないこと

- ❌ 複雑なDIコンテナの導入
- ❌ 過剰なデザインパターンの適用
- ❌ 大規模な書き直し
- ❌ 外部ライブラリの追加

### 実行すること

- ✅ 重複コードの排除
- ✅ 型安全性の向上
- ✅ グローバル状態の削除
- ✅ シンプルな関数抽出

---

## 実装ロードマップ

### Phase 1: 基礎改善（1日）

1. エラーハンドラーの作成と統合
2. グローバルRateLimiterのDI化
3. Provider Factoryの簡素化

**成果**: 重複コードが減り、テストが書きやすくなる

---

### Phase 2: 構造改善（1日）

1. ConfigManagerの分割
2. 型定義の厳密化
3. 共通ヘルパー関数の抽出

**成果**: コードの責任が明確になり、保守性が向上

---

### Phase 3: フロントエンド改善（任意）

1. app.jsの機能分割
2. 再利用可能な関数の抽出

**成果**: フロントエンドの保守性が向上

---

## テスト戦略

リファクタリング後は以下のテストを追加：

```typescript
// tests/refactoring/error-handler.test.ts
describe('ErrorHandler', () => {
  it('should classify rate limit errors correctly', () => {
    const error = { statusCode: 429 };
    const result = handleAIError(error);
    expect(result.statusCode).toBe(429);
  });
});

// tests/refactoring/factory.test.ts
describe('ProviderFactory', () => {
  it('should use default factory when no custom options', () => {
    const config = { provider_type: 'openai', model_name: 'gpt-4' };
    const model = createLanguageModel(config);
    expect(model).toBeDefined();
  });
});
```

---

## 次のステップ

1. このドキュメントの内容をレビュー
2. 実施する項目を優先度順に選択
3. 各項目を小さなPRで実装
4. テストを追加して動作を保証

---

## 参考資料

- 現在のコードベース: `js_pro/src/`
- テスト: `js_pro/src/**/*.test.ts`
- 型定義: `js_pro/src/domain/types.ts`
