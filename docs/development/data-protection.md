# データ保護機能

Agasteerのデータ保護関連機能の実装詳細について説明します。

## Push回数カウント機能

### 概要

アプリの使用状況を可視化するため、GitHub Push回数をカウントして統計情報として表示します。ユーザーがアプリを使い続けてきた長さを示し、楽しみを提供する機能です。

### データ構造

Push回数は `metadata.json` の `pushCount` フィールドに保存されます。

```typescript
export interface Metadata {
  version: number
  notes: Record<string, { id: string; order: number }>
  leaves: Record<string, { id: string; updatedAt: number; order: number }>
  pushCount: number // Push回数
}
```

### Push時の自動インクリメント

`pushAllWithTreeAPI` 関数内で、Push実行前に既存の `pushCount` を取得し、インクリメントします。

```typescript
// 既存のmetadata.jsonからpushCountを取得
let currentPushCount = 0
try {
  const metadataRes = await fetch(
    `https://api.github.com/repos/${settings.repoName}/contents/notes/metadata.json`,
    { headers }
  )
  if (metadataRes.ok) {
    const metadataData = await metadataRes.json()
    if (metadataData.content) {
      const base64 = metadataData.content.replace(/\n/g, '')
      const decoded = atob(base64)
      const existingMetadata: Metadata = JSON.parse(decoded)
      currentPushCount = existingMetadata.pushCount || 0
    }
  }
} catch (e) {
  // エラーは無視（初回Pushの場合）
}

// metadata.jsonを生成
const metadata: Metadata = {
  version: 1,
  notes: {},
  leaves: {},
  pushCount: currentPushCount + 1, // インクリメント
}
```

### Pull時のデータ取得

`pullFromGitHub` 関数内で、metadata.jsonから `pushCount` を取得し、Svelteストアに保存します。

```typescript
// notes/metadata.jsonを取得
let metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
try {
  const metadataRes = await fetch(
    `https://api.github.com/repos/${settings.repoName}/contents/notes/metadata.json`,
    { headers }
  )
  if (metadataRes.ok) {
    const metadataData = await metadataRes.json()
    if (metadataData.content) {
      const base64 = metadataData.content.replace(/\n/g, '')
      const jsonText = decodeURIComponent(escape(atob(base64)))
      const parsed = JSON.parse(jsonText)
      // 古いmetadata.jsonにはpushCountがない可能性があるので、デフォルト値を設定
      metadata = {
        version: parsed.version || 1,
        notes: parsed.notes || {},
        leaves: parsed.leaves || {},
        pushCount: parsed.pushCount || 0,
      }
    }
  }
} catch (e) {
  console.warn('notes/metadata.json not found or invalid, using defaults')
}

return {
  success: true,
  message: '✅ Pull OK',
  notes: sortedNotes,
  leaves: sortedLeaves,
  metadata, // metadataを返す
}
```

### ストア管理

`stores.ts` に metadata ストアを追加。

```typescript
export const metadata = writable<Metadata>({
  version: 1,
  notes: {},
  leaves: {},
  pushCount: 0,
})
```

App.svelte でPull時にmetadataをストアに保存：

```typescript
// GitHubから取得したデータでIndexedDBを再作成
updateNotes(result.notes)
updateLeaves(result.leaves)
metadata.set(result.metadata) // metadataを保存
```

### UI表示

HomeView.svelte でホーム画面の右下に統計情報を表示。

```svelte
<div class="statistics">
  <div class="stat-item">
    <div class="stat-label">Push回数</div>
    <div class="stat-value">{$metadata.pushCount}</div>
  </div>
</div>
```

```css
.statistics {
  position: absolute;
  bottom: 1rem;
  right: 1rem;
  z-index: 0; /* ノート・リーフカードの背面 */
  opacity: 0.5; /* 半透明で控えめに */
  pointer-events: none; /* クリック不可 */
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: var(--accent-color);
}
```

### 後方互換性

古いバージョンで作成された `metadata.json` には `pushCount` フィールドがない可能性があります。そのため、Pull時にフォールバック処理を実装：

```typescript
pushCount: parsed.pushCount || 0
```

フィールドが存在しない場合は `0` として扱われます。

### 動作フロー

1. **初回Pull**: metadata.jsonから `pushCount: 0` を取得
2. **初回Push**: `pushCount` を1にインクリメントしてGitHubに保存
3. **2回目Pull**: `pushCount: 1` を取得してホーム画面に表示
4. **2回目Push**: `pushCount` を2にインクリメント
5. **以降同様に継続**

### 表示位置とデザイン

- **表示位置**: ホーム画面の右下
- **z-index**: 0（ノート・リーフカードの背面）
- **opacity**: 0.5（半透明で控えめ）
- **ラベル**: 小さなグレーのテキスト
- **数値**: 大きく太字でアクセントカラー

これにより、ユーザーの視線を邪魔せず、かつアプリを使い続けてきた実績を可視化できます。

---

## 未保存変更の確認機能

### 概要

GitHubにPushされていない変更がある状態で、データを失う可能性のある操作を行う際に確認ダイアログを表示します。

### ダーティフラグ管理

#### isDirtyストア

GitHubにPushされていない変更があるかどうかを追跡する`isDirty`ストア（`stores.ts`）。

```typescript
export const isDirty = writable<boolean>(false)
```

#### ダーティフラグが立つタイミング

1. **エディタで編集時** (`MarkdownEditor.svelte`)

   ```typescript
   EditorView.updateListener.of((update) => {
     if (update.docChanged) {
       const newContent = update.state.doc.toString()
       onChange(newContent)
       // エディタで変更があったらダーティフラグを立てる
       isDirty.set(true)
     }
   })
   ```

2. **ノート操作時** (`stores.ts`)

   ```typescript
   export function updateNotes(newNotes: Note[]): void {
     notes.set(newNotes)
     saveNotes(newNotes).catch((err) => console.error('Failed to persist notes:', err))
     // ノートの変更があったらダーティフラグを立てる
     isDirty.set(true)
   }
   ```

3. **リーフ操作時** (`stores.ts`)
   ```typescript
   export function updateLeaves(newLeaves: Leaf[]): void {
     leaves.set(newLeaves)
     saveLeaves(newLeaves).catch((err) => console.error('Failed to persist leaves:', err))
     // リーフの変更があったらダーティフラグを立てる
     isDirty.set(true)
   }
   ```

**対象操作:**

- ノート/リーフの作成、削除、名前変更、並び替え
- リーフのコンテンツ編集

#### ダーティフラグがクリアされるタイミング

1. **Push成功時** (`App.svelte`)

   ```typescript
   const result = await executePush($leaves, $notes, $settings, isOperationsLocked)

   if (result.variant === 'success') {
     isDirty.set(false) // Push成功時にダーティフラグをクリア
   }
   ```

2. **Pull成功時** (`App.svelte`)
   ```typescript
   if (result.success) {
     updateNotes(result.notes)
     updateLeaves(result.leaves)
     metadata.set(result.metadata)
     isDirty.set(false) // Pull成功時はGitHubと同期したのでクリア
   }
   ```

### 確認ダイアログの表示

#### 1. Pull実行時（既存モーダル）

未保存の変更がある状態でPullを実行しようとすると確認ダイアログを表示。

```typescript
async function handlePull(isInitial = false) {
  // 初回Pull以外で未保存の変更がある場合は確認
  if (!isInitial && get(isDirty)) {
    showConfirm('未保存の変更があります。Pullを実行しますか？', () =>
      executePullInternal(isInitial)
    )
    return
  }

  await executePullInternal(isInitial)
}
```

- **ダイアログタイプ**: Modal.svelteベースの既存モーダル
- **メッセージ**: 「未保存の変更があります。Pullを実行しますか？」
- **OK**: Pullを実行（GitHubのデータでIndexedDBを上書き）
- **キャンセル**: Pullをキャンセル

#### 2. ページ離脱時（ブラウザ標準ダイアログ）

タブを閉じる、リロード、外部サイトへの移動時に確認ダイアログを表示。

```typescript
const handleBeforeUnload = (e: BeforeUnloadEvent) => {
  if (get(isDirty)) {
    e.preventDefault()
    e.returnValue = '' // Chrome requires returnValue to be set
  }
}
window.addEventListener('beforeunload', handleBeforeUnload)
```

- **ダイアログタイプ**: ブラウザ標準の確認ダイアログ
- **メッセージ**: ブラウザが自動生成（「変更が保存されていない可能性があります」など）
- **OK**: ページを離脱
- **キャンセル**: ページに留まる

### 視覚的なフィードバック

#### 保存ボタンへのダーティマーク

未保存の変更がある場合、保存ボタンに赤い丸印（notification badge）を表示。

```svelte
<button type="button" class="primary save-button" on:click={handleSaveToGitHub}>
  <svg><!-- 保存アイコン --></svg>
  {#if $isDirty}
    <span class="notification-badge"></span>
  {/if}
</button>
```

```css
.save-button {
  position: relative;
}

.notification-badge {
  position: absolute;
  top: 4px;
  right: 4px;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
}
```

- **表示位置**: 保存ボタンの右上
- **サイズ**: 8x8px
- **色**: #ef4444（赤色）
- **形状**: 円形
- **デザイン**: 設定ボタンのnotification badgeと同じスタイル

### アプリ内ナビゲーションは制限されない

このアプリは編集時に自動的にIndexedDBに保存されるため、アプリ内のナビゲーション（ホーム、ノート、リーフ間の移動）ではデータが失われません。

**確認が不要な操作:**

- ホームへの移動
- ノート/リーフの選択
- ブラウザの戻る/進むボタン
- ノート/リーフの作成、削除、名前変更、並び替え

**確認が必要な操作:**

- **Pull実行**: GitHubのデータでIndexedDBを上書きするため
- **ページ離脱**: ブラウザのタブを閉じる、リロード、外部サイトへの移動

ダーティフラグは「GitHubにPushしていない」という意味であり、GitHubとの同期を失う操作のみ確認が必要です。

### 動作フロー

1. **リーフを編集** → `isDirty.set(true)` → 保存ボタンに赤い丸印表示
2. **Pushボタンをクリック** → Push実行 → 成功時に `isDirty.set(false)` → 赤い丸印消える
3. **未保存の状態でPullボタンをクリック** → 確認ダイアログ表示
4. **未保存の状態でタブを閉じる** → ブラウザ標準の確認ダイアログ表示

---

## Stale編集警告機能

### 概要

PCとスマホなど複数デバイスで同時に編集している場合、他のデバイスでPushされた変更を上書きしてしまう危険があります。この機能は、リモートに新しい変更があることを検出し、Push前に警告を表示します。

### 仕組み

`metadata.json`の`pushCount`を使用して、ローカルとリモートの状態を比較します。

#### lastPulledPushCountストア

最後にPullした時点の`pushCount`を保持するストア（`stores.ts`）。

```typescript
export const lastPulledPushCount = writable<number>(0)
```

#### stale検出ロジック

```typescript
// リモートのpushCountを取得
export async function fetchRemotePushCount(settings: Settings): Promise<number> {
  const metadataRes = await fetchGitHubContents(
    'notes/metadata.json',
    settings.repoName,
    settings.token
  )
  if (!metadataRes.ok) return 0
  const data = await metadataRes.json()
  // ... Base64デコードしてpushCountを取得
  return metadata.pushCount || 0
}

// stale編集かどうかを判定
export async function checkIfStaleEdit(
  settings: Settings,
  lastPulledPushCount: number
): Promise<boolean> {
  const remotePushCount = await fetchRemotePushCount(settings)
  return remotePushCount > lastPulledPushCount
}
```

**判定ロジック:**

- `remotePushCount > lastPulledPushCount` → stale（リモートに新しい変更がある）
- `remotePushCount <= lastPulledPushCount` → 最新（Pushして問題なし）

### Push時の確認フロー

```typescript
async function handleSaveToGitHub() {
  // 交通整理: Push不可なら何もしない
  if (!canSync().canPush) return

  isPushing = true
  try {
    // stale編集かどうかチェック
    const isStale = await checkIfStaleEdit($settings, get(lastPulledPushCount))
    if (isStale) {
      // staleの場合は確認ダイアログを表示
      isPushing = false
      showConfirm($_('modal.staleEdit'), () => executePushInternal())
      return
    }

    // staleでなければそのままPush
    await executePushInternal()
  } catch (e) {
    // チェック失敗時もPushを続行
    await executePushInternal()
  } finally {
    isPushing = false
  }
}
```

### Push成功後のpushCount更新

Push成功後は、ローカルの`lastPulledPushCount`を+1して更新します。これにより、連続Pushでstale警告が出ることを防ぎます。

```typescript
if (result.variant === 'success') {
  isDirty.set(false)
  // Push成功後はリモートと同期したのでpushCountを+1
  lastPulledPushCount.update((n) => n + 1)
}
```

### i18nメッセージ

```json
{
  "modal": {
    "staleEdit": "リモートに新しい変更があります。このまま保存すると上書きされます。続行しますか？"
  }
}
```

### 動作フロー

1. **Pull実行** → `lastPulledPushCount`にリモートの`pushCount`を保存
2. **別デバイスでPush** → リモートの`pushCount`がインクリメント
3. **このデバイスでPush** → `checkIfStaleEdit`でリモートの`pushCount`を取得
4. **比較** → `remotePushCount > lastPulledPushCount`ならstale
5. **警告表示** → ユーザーが確認後にPush、またはキャンセル
6. **Push成功** → `lastPulledPushCount`を+1

### 設計思想

- **個人用アプリ**: 複数ユーザーの同時編集は想定しない
- **警告のみ**: ブロックせず、ユーザーの判断で上書き可能
- **ネットワークエラー時**: チェック失敗時はPushを続行（使い勝手優先）
- **force: true**: Git Tree APIでの強制更新は維持（常に成功を優先）
