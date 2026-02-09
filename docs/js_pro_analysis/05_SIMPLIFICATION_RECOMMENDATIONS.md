# JSプロジェクト簡略化の推奨事項

## 現状の問題点

### 1. 過剰なログ出力

**問題:** 処理の各段階で詳細なログが出力されている

**影響:**
- コードの可読性低下
- ログ量が多すぎて問題の特定が困難
- パフォーマンスへの悪影響（I/O）

**例（chat.ts）:**
```typescript
logWithLevel(configManager, 'info', 'Chat request received', {...});
logWithLevel(configManager, 'info', 'Chat request body', {...});
logWithLevel(configManager, 'info', 'Chat processed messages', {...});
logWithLevel(configManager, 'info', 'Chat acquiring rate limit', {...});
logWithLevel(configManager, 'info', 'Chat model resolved', {...});
logWithLevel(configManager, 'debug', 'Chat core messages', {...});
logWithLevel(configManager, 'debug', 'Chat options', {...});
logWithLevel(configManager, 'info', 'Chat stream started', {...});
logWithLevel(configManager, 'debug', 'Chat stream event', {...});
logWithLevel(configManager, 'debug', 'Chat stream chunk', {...});
```

**推奨:** 重要なイベントのみにログを削減

---

### 2. 重複したコードパターン

**問題:** generate.ts と chat.ts で似たような処理が重複

**共通処理:**
- バリデーション
- モデル設定の取得
- レート制限の適用
- エラーハンドリング

**推奨:** 共通関数への抽出

---

### 3. 過剰な抽象化

**問題:** ProviderService が ConfigManager と重複

**ProviderService の役割:**
- providers.json のCRUD

**ConfigManager の役割:**
- providers.json の読み込みと監視
- モデル設定の取得

**推奨:** ConfigManager に統合

---

### 4. 使用量ストレージの非効率性

**問題:** 各リクエストでファイル書き込み

```typescript
async addLog(...) {
  this.logs.push(log);
  await this.saveLogs(); // 毎回書き込み
}
```

**影響:**
- 高負荷時のパフォーマンス低下
- ファイルの破損リスク

**推奨:** バッファリング + 定期フラッシュ

---

### 5. Web UI の複雑さ

**問題:** 単一の大きなファイル

**app.js:**
- 600行以上
- 複数の責務（管理、統計、状態管理）

**推奨:** コンポーネント分割

---

### 6. レート制限の実装

**問題:** グローバルインスタンスへの依存

```typescript
let globalRateLimiter: RateLimiter | null = null;
```

**影響:**
- テストでのモック化が困難
- 依存関係が不明確

**推奨:** 依存性注入への移行

---

## 簡略化プラン

### Phase 1: ログの削減

**目標:** ログ行数を50%削減

**変更:**

1. **削除するログ**
   - `debug` レベルの大部分
   - 重複する情報
   - 些細なイベント

2. **残すログ**
   - `error`: すべて
   - `warn`: すべて
   - `info`: リクエスト受信、エラー、完了
   - `debug`: なし（または開発時のみ）

**実装:**
```typescript
// chat.ts の簡略化
logWithLevel(configManager, 'info', 'Chat request', {
  requestId,
  model: modelName,
  stream
});

// デバッグログは削除
// logWithLevel(configManager, 'debug', 'Chat core messages', {...});

// エラーは保持
logWithLevel(configManager, 'error', 'Chat error', {
  requestId,
  message: error.message
});
```

**期待される効果:**
- コードの可読性向上
- パフォーマンス改善
- トラブルシューティングが容易に

---

### Phase 2: 共通関数の抽出

**目標:** 重複コードを排除

**新しいファイル:** `src/interface/http/routes/common.ts`

```typescript
export async function validateAndResolveModel(
  configManager: ConfigManager,
  modelName: string
): Promise<ModelConfig> {
  const modelConfig = configManager.getModelConfig(modelName);
  if (!modelConfig) {
    throw new NotFoundError(`Model not found: ${modelName}`);
  }
  return modelConfig;
}

export async function withRateLimit(
  modelName: string,
  requestId: string,
  fn: () => Promise<void>
): Promise<void> {
  const rateLimiter = getGlobalRateLimiter();
  if (rateLimiter) {
    await rateLimiter.acquire(modelName, requestId);
  }
  try {
    await fn();
  } finally {
    if (rateLimiter) {
      rateLimiter.release(modelName);
    }
  }
}

export function handleAIError(error: unknown): Response {
  if (error?.statusCode === 429) {
    return c.json({ error: 'Rate limit exceeded' }, 429);
  }
  // ...
}
```

**使用例:**
```typescript
// chat.ts
router.post('/', async (c) => {
  const modelConfig = await validateAndResolveModel(configManager, modelName);

  await withRateLimit(modelName, requestId, async () => {
    // AIプロバイダー呼び出し
  });
});
```

---

### Phase 3: ProviderService の統合

**目標:** ConfigManager に一元化

**変更:**

1. **ProviderService の削除**
2. **ConfigManager にメソッド追加**

```typescript
// manager.ts に追加
async addProvider(id: string, config: ProviderConfig): Promise<void> {
  const data = await this.readProviders();
  if (data[id]) {
    throw new Error('Provider already exists');
  }
  data[id] = config;
  await this.writeProviders(data);
  await this.loadProviders(); // 再読み込み
}

async deleteProvider(id: string): Promise<void> {
  const data = await this.readProviders();
  delete data[id];
  await this.writeProviders(data);
  await this.loadProviders();
}
// ... その他のCRUDメソッド
```

**影響:**
- `admin.ts` の依存先を ConfigManager に変更
- ファイル数の削減
- 責任の明確化

---

### Phase 4: 使用量ストレージの改善

**目標:** 書き込み回数を削減

**実装:**

```typescript
export class UsageStorage {
  private logs: UsageLog[] = [];
  private buffer: UsageLog[] = [];
  private flushInterval: number = 5000; // 5秒
  private bufferLimit: number = 100;   // 100件

  async addLog(...): Promise<void> {
    this.buffer.push(log);
    this.logs.push(log);

    // バッファが満杯なら即時フラッシュ
    if (this.buffer.length >= this.bufferLimit) {
      await this.flush();
    }
  }

  private async flush(): Promise<void> {
    if (this.buffer.length === 0) return;

    const toSave = [...this.buffer];
    this.buffer = [];

    await writeFile(this.usagePath, JSON.stringify(this.logs, null, 2));
  }

  start(): void {
    // 定期フラッシュ
    this.timer = setInterval(() => this.flush(), this.flushInterval);
  }

  stop(): void {
    clearInterval(this.timer);
    this.flush();
  }
}
```

**使用例:**
```typescript
// main.ts
const usageStorage = new UsageStorage();
usageStorage.start();

process.on('SIGINT', async () => {
  usageStorage.stop();
  // ...
});
```

---

### Phase 5: Web UI の分割

**目標:** コンポーネント化

**新しい構造:**
```
interface/static/js/
├── app.js              # メインアプリ
├── components/
│   ├── ProviderForm.js
│   ├── ProviderList.js
│   ├── ModelForm.js
│   ├── ModelList.js
│   └── StatsDashboard.js
├── stores/
│   ├── models.js
│   ├── providers.js
│   └── config.js
└── api.js
```

**ProviderForm.js:**
```javascript
export const ProviderForm = {
  props: ['providers', 'onSubmit'],
  template: `
    <div class="provider-form-card" v-if="visible">
      <!-- フォーム内容 -->
    </div>
  `,
  setup(props) {
    const visible = ref(false);
    const form = ref({...});

    const submit = async () => {
      await props.onSubmit(form.value);
      visible.value = false;
    };

    return { visible, form, submit };
  }
};
```

**app.js:**
```javascript
import { ProviderForm } from './components/ProviderForm.js';
import { ModelForm } from './components/ModelForm.js';

const App = {
  components: {
    ProviderForm,
    ModelForm,
  },
  // ...
};
```

---

### Phase 6: 依存性注入の導入

**目標:** グローバルインスタンスを廃止

**変更:**

```typescript
// ratelimiter.ts - グローバルインスタンスを削除
export class RateLimiter {
  // ...
}

// server.ts - 明示的な注入
export function createServer(configManager: ConfigManager) {
  const rateLimiter = new RateLimiter(serverConfig.rate_limit);

  // ルートに注入
  app.route('/api/chat', createChatRouter(configManager, usageStorage, rateLimiter));
}

// chat.ts - 引数で受け取る
export function createChatRouter(
  configManager: ConfigManager,
  usageStorage: UsageStorage,
  rateLimiter: RateLimiter  // 追加
) {
  // グローバルインスタンスを使用しない
  router.post('/', async (c) => {
    await rateLimiter.acquire(modelName, requestId);
    // ...
  });
}
```

**利点:**
- テストが容易
- 依存関係が明確
- 複数のインスタンス化が可能

---

## 簡略化後の期待される効果

### コード量

| 項目 | 現在 | 簡略化後 | 削減率 |
|------|------|----------|--------|
| ログ行数 | ~500 | ~250 | 50% |
| 重複コード | ~300 | ~150 | 50% |
| ファイル数 | 22 | ~18 | 18% |

### パフォーマンス

| 項目 | 現在 | 簡略化後 | 改善 |
|------|------|----------|------|
| ログI/O | 高 | 低 | ~70%削減 |
| ファイル書き込み | リクエスト毎 | バッファリング | ~95%削減 |
| メモリ使用 | 基準 | やや増加 | +~1MB |

### 保守性

- **可読性:** ログ削減と関数抽出で向上
- **テスト容易性:** 依存性注入で向上
- **拡張性:** コンポーネント分割で向上

---

## 実装の優先順位

### 高優先度（即時実施）

1. **ログの削減**
   - 影響が小さい
   - 効果が大きい
   - リスクが低い

2. **共通関数の抽出**
   - 重複の排除
   - バグの削減

### 中優先度（段階的実施）

3. **使用量ストレージの改善**
   - パフォーマンス向上
   - データ整合性の向上

4. **ProviderService の統合**
   - シンプル化
   - 責任の明確化

### 低優先度（長期的検討）

5. **Web UI の分割**
   - 大規模な変更
   - テストが必要

6. **依存性注入の導入**
   - アーキテクチャの変更
   - 段階的な移行が必要

---

## テスト計画

### 単体テスト

**簡略化後に追加:**
- 共通関数のテスト
- 使用量ストレージのテスト（バッファリング）

### 統合テスト

**確認項目:**
- APIエンドポイントの動作
- レート制限の正確性
- 使用量記録の正確性

### パフォーマンステスト

**計測項目:**
- レスポンス時間
- スループット
- メモリ使用量

---

## ロールバック計画

各フェーズで問題が発生した場合:

1. **Git ブランチ** で作業
2. **機能フラグ** で新旧を切り替え
3. **段階的デプロイ** で影響を最小化

**例:**
```typescript
const USE_BUFFERED_STORAGE = process.env.USE_BUFFERED_STORAGE === 'true';

export class UsageStorage {
  async addLog(...): Promise<void> {
    if (USE_BUFFERED_STORAGE) {
      this.buffer.push(log);
    } else {
      await this.saveLogs();
    }
  }
}
```
