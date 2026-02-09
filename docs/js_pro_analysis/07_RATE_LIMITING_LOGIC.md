# レート制限ロジック詳細解説

このドキュメントでは、Ollama Proxy JS プロジェクトで実装されているレート制限（Rate Limiting）の複雑なロジックについて詳細に解説します。

## 目次

1. [概要](#概要)
2. [トークンバケットアルゴリズム](#トークンバケットアルゴリズム)
3. [階層的な設定システム](#階層的な設定システム)
4. [実装詳細](#実装詳細)
5. [使用例](#使用例)
6. [パフォーマンス考慮事項](#パフォーマンス考慮事項)

---

## 概要

### レート制限の目的

レート制限は、以下の目的で実装されています：

1. **API プロバイダーの保護**: 上流の AI サービスプロバイダーのレート制限を超えないようにする
2. **コスト管理**: 予期しない高額請求を防ぐ
3. **リソース管理**: 同時接続数を制限し、システムの安定性を維持
4. **公平性**: 複数のユーザー/モデル間でリソースを公平に配分

### サポートされる制御パラメータ

| パラメータ | 説明 | デフォルト値 |
|-----------|------|------------|
| `requests` | ウィンドウ内の最大リクエスト数 | 10 |
| `window_ms` | ウィンドウサイズ（ミリ秒） | 60000 (1分) |
| `concurrent` | 最大同時実行数 | 1 |

---

## トークンバケットアルゴリズム

### アルゴリズムの基本概念

トークンバケットアルゴリズムは、以下のように動作します：

```
初期状態: バケットにトークンが「requests」個入っている

リクエスト処理時:
1. トークンが1つ以上あるか確認
2. トークンがある場合:
   - 1つのトークンを消費
   - リクエストを処理開始
3. トークンがない場合:
   - キューに追加
   - トークンが補充されるまで待機

定期的な補充:
- 経過時間に応じてトークンを追加
- 最大「requests」個まで補充
```

### 数学的モデル

時刻 t におけるトークン数 T(t) の計算：

```
elapsed = t - lastRefill
tokensToAdd = floor((elapsed / window_ms) * requests)
T(t) = min(T(t-1) + tokensToAdd, requests)
```

### アルゴリズムの特徴

**メリット:**
- バーストトラフィックを許容（一時的に大量のリクエストを処理可能）
- 長期的な平均レートを保証
- 実装がシンプル

**デメリット:**
- 短期的なバースト後に急激に制限がかかる
- ウィンドウの境界で一時的にリクエストが集中する可能性

---

## 階層的な設定システム

### 設定の優先順位

レート制限設定は3つのレベルで定義でき、以下の優先順位で適用されます：

```
1. モデル固有設定 (最高優先度)
   ↓
2. プロバイダー設定
   ↓
3. グローバル設定 (最低優先度)
```

### 設定のマージロジック

```typescript
// ConfigManager.mergeRateLimitConfigs() のロジック
mergeRateLimitConfigs(parent?: RateLimitConfig, child?: RateLimitConfig) {
  if (!parent && !child) return undefined;
  if (!parent) return child;
  if (!child) return parent;

  return {
    requests: child.requests ?? parent.requests,      // 子が優先
    window_ms: child.window_ms ?? parent.window_ms,    // 子が優先
    concurrent: child.concurrent ?? parent.concurrent, // 子が優先
  };
}
```

### 設定例

#### グローバル設定
```json
{
  "rate_limit": {
    "requests": 10,
    "window_ms": 60000,
    "concurrent": 1
  }
}
```

#### プロバイダー設定
```json
{
  "openai": {
    "provider": "openai",
    "rate_limit": {
      "requests": 20,      // グローバルより高い
      "window_ms": 60000,
      "concurrent": 2
    },
    "models": [...]
  }
}
```

#### モデル固有設定
```json
{
  "gpt-4": {
    "name": "gpt4-model",
    "model_name": "gpt-4",
    "rate_limit": {
      "requests": 5,       // プロバイダーより低い
      "window_ms": 60000,
      "concurrent": 1
    }
  }
}
```

---

## 実装詳細

### RateLimiter クラス構造

```typescript
class RateLimiter {
  // 設定ストレージ
  private configs: Map<string, Required<RateLimitConfig>>
  
  // 状態ストレージ
  private states: Map<string, ModelState>
  
  // デフォルト設定
  private defaultConfig: Required<RateLimitConfig>
}

interface ModelState {
  tokens: number;        // 現在のトークン数
  lastRefill: number;    // 最後の補充時刻 (Unix timestamp)
  running: number;       // 現在実行中のリクエスト数
  queue: RequestQueueItem[]; // 待機キュー
}
```

### 主要メソッドのフロー

#### 1. acquire() - リクエスト許可の取得

```typescript
async acquire(model: string, requestId: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // 即時処理可能か確認
    if (this.canProcess(model)) {
      this.startProcessing(model);
      resolve();
      return;
    }

    // キューに追加
    const item: RequestQueueItem = {
      id: requestId,
      model,
      resolve,
      reject,
      timestamp: Date.now()
    };
    this.getState(model).queue.push(item);

    // キュー処理を試行
    this.processQueue(model);
  });
}
```

**フローチャート:**

```
開始
  ↓
トークン補充 (refillBucket)
  ↓
実行可能かチェック (canProcess)
  ↓
    ├─ YES → 開始処理 (startProcessing) → resolve()
    │
    └─ NO  → キューに追加
              ↓
         キュー処理 (processQueue)
              ↓
         待機...
```

#### 2. canProcess() - 処理可能性の確認

```typescript
private canProcess(model: string): boolean {
  this.refillBucket(model);  // 最初にトークン補充
  
  const state = this.getState(model);
  const config = this.getConfig(model);
  
  // 両方の条件を満たす必要あり
  return state.tokens > 0 && state.running < config.concurrent;
}
```

**条件:**
1. `tokens > 0`: 利用可能なトークンがある
2. `running < concurrent`: 同時実行数の上限に達していない

#### 3. refillBucket() - トークン補充

```typescript
private refillBucket(model: string): void {
  const state = this.getState(model);
  const config = this.getConfig(model);
  
  const now = Date.now();
  const elapsed = now - state.lastRefill;
  
  // 経過時間に応じてトークンを計算
  const tokensToAdd = Math.floor(
    (elapsed / config.window_ms) * config.requests
  );
  
  if (tokensToAdd > 0) {
    // トークンを追加（上限あり）
    state.tokens = Math.min(
      state.tokens + tokensToAdd, 
      config.requests
    );
    state.lastRefill = now;
  }
}
```

**計算例:**

```
設定: requests=10, window_ms=60000 (1分)

状態:
- tokens = 3
- lastRefill = 12:00:00
- 現在時刻 = 12:02:30 (経過: 150秒)

計算:
tokensToAdd = floor(150000 / 60000) * 10
            = floor(2.5) * 10
            = 2 * 10
            = 20

新しいトークン数:
min(3 + 20, 10) = 10  (上限でキャップ)
```

#### 4. release() - リソース解放

```typescript
release(model: string): void {
  const state = this.getState(model);
  
  // 実行中カウントを減少
  if (state.running > 0) {
    state.running--;
  }
  
  // 次のリクエストを処理
  this.processQueue(model);
}
```

**重要:** `release()` はトークンを返しません。トークンは時間経過でのみ補充されます。

#### 5. processQueue() - キュー処理

```typescript
private processQueue(model: string): void {
  const state = this.getState(model);
  
  // 処理可能なリクエストがない限りループ
  while (state.queue.length > 0 && this.canProcess(model)) {
    const item = state.queue.shift();  // 先頭から取得
    
    if (item) {
      this.startProcessing(model);
      item.resolve();  // Promise を解決
    }
  }
}
```

---

## 使用例

### 基本的な使用

```typescript
// 1. RateLimiter の初期化
const rateLimiter = new RateLimiter({
  requests: 10,
  window_ms: 60000,
  concurrent: 1
});

// 2. モデル固有の設定
rateLimiter.setModelConfig('gpt-4', {
  requests: 5,
  window_ms: 60000,
  concurrent: 1
});

// 3. リクエストの処理
const requestId = 'req-123';
await rateLimiter.acquire('gpt-4', requestId);

try {
  // API リクエストを実行
  await callAIProvider();
} finally {
  // 必ず release を呼ぶ
  rateLimiter.release('gpt-4');
}
```

### HTTP ルートでの使用

```typescript
router.post('/api/generate', async (c) => {
  const { model } = await c.req.json();
  const requestId = randomUUID();
  
  // レート制限を取得
  await rateLimiter.acquire(model, requestId);
  
  try {
    // リクエスト処理
    const result = await generateText({ model });
    return c.json(result);
  } finally {
    // 解放
    rateLimiter.release(model);
  }
});
```

### エラーハンドリング

```typescript
try {
  await rateLimiter.acquire(model, requestId);
} catch (error) {
  // キューが満タンの場合のエラーハンドリング
  console.error('Rate limit exceeded');
  return c.json({ error: 'Too many requests' }, 429);
}
```

---

## パフォーマンス考慮事項

### メモリ使用量

各モデルの状態は以下のように保存されます：

```typescript
ModelState {
  tokens: number,           // 8 bytes
  lastRefill: number,       // 8 bytes
  running: number,          // 4 bytes
  queue: Array              // 可変
}
```

**推定メモリ使用量:**
- 1 モデルあたり: 約 50-100 bytes（キューなし）
- キュー内の1アイテム: 約 100 bytes

### 計算複雑度

| 操作 | 時間複雑度 | 説明 |
|------|----------|------|
| `acquire()` | O(1) | 定数時間（即時処理の場合） |
| `release()` | O(n) | n はキューのサイズ |
| `refillBucket()` | O(1) | 単純な計算 |
| `processQueue()` | O(n) | n は処理するキュー数 |

### 最適化のヒント

1. **適切な concurrent 値の設定**
   - 小さすぎる: スループットが低下
   - 大きすぎる: メモリ使用量が増加

2. **ウィンドウサイズの調整**
   - 短いウィンドウ: 制限の応答が速い
   - 長いウィンドウ: バーストを許容しやすい

3. **キュータイムアウトの実装（推奨）**
   ```typescript
   // 現在は未実装
   // 実装例:
   const timeout = 30000; // 30秒
   item.timestamp = Date.now() + timeout;
   
   // 定期的にタイムアウトをチェック
   const now = Date.now();
   state.queue = state.queue.filter(item => item.timestamp > now);
   ```

---

## トラブルシューティング

### よくある問題

#### 1. リクエストがタイムアウトする

**原因:** キューが満タンで、リクエストが永遠に待機

**解決策:**
```typescript
// タイムアウトを追加
const timeout = setTimeout(() => {
  reject(new Error('Rate limit timeout'));
}, 30000);

await rateLimiter.acquire(model, requestId);
clearTimeout(timeout);
```

#### 2. レート制限が正しく機能しない

**原因:** `release()` が呼ばれていない

**解決策:**
```typescript
// 必ず try-finally を使用
try {
  await rateLimiter.acquire(model, requestId);
  // 処理
} finally {
  rateLimiter.release(model);
}
```

#### 3. トークンが補充されない

**原因:** `refillBucket()` が呼ばれていない

**確認:** `canProcess()` の最初で `refillBucket()` が呼ばれていることを確認

---

## 関連ドキュメント

- [03_INFRASTRUCTURE_LAYER.md](./03_INFRASTRUCTURE_LAYER.md) - レート制限の概要
- [06_API_REFERENCE.md](./06_API_REFERENCE.md) - API 使用例
- [05_SIMPLIFICATION_RECOMMENDATIONS.md](./05_SIMPLIFICATION_RECOMMENDATIONS.md) - 改善提案

---

## 実装ファイル

- `src/infrastructure/ratelimit/ratelimiter.ts` - レート制限の実装
- `src/domain/types.ts` - RateLimitConfig 型定義
- `src/infrastructure/config/manager.ts` - 設定マージロジック

---

*最終更新: 2025-02-09*
