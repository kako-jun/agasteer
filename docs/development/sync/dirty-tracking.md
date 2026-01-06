## 未保存変更の確認機能

### 概要

GitHubにPushされていない変更がある状態で、データを失う可能性のある操作を行う際に確認ダイアログを表示します。

### ダーティフラグ管理

#### isDirtyストア

GitHubにPushされていない変更があるかどうかを追跡する`isDirty`ストア（`stores.ts`）。

```typescript
// isDirtyをLocalStorageに永続化するカスタムストア
// PWA強制終了後も未保存状態を検出可能にする
const IS_DIRTY_KEY = 'agasteer_isDirty'

function createIsDirtyStore() {
  // LocalStorageから初期値を読み込み
  const stored = localStorage.getItem(IS_DIRTY_KEY)
  const initial = stored === 'true'

  const { subscribe, set: originalSet, update } = writable<boolean>(initial)

  return {
    subscribe,
    set: (value: boolean) => {
      originalSet(value)
      // LocalStorageに永続化
      if (value) {
        localStorage.setItem(IS_DIRTY_KEY, 'true')
      } else {
        localStorage.removeItem(IS_DIRTY_KEY)
      }
    },
    update,
  }
}

export const isDirty = createIsDirtyStore()
```

**LocalStorage永続化の目的:**

PWAがOSによってバックグラウンドで強制終了された場合、`beforeunload`イベントが発火しません。この場合、メモリ上の`isDirty`フラグは失われますが、LocalStorageに永続化することで、再起動後も未保存状態を検出できます。

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

#### 1. アプリ起動時（初回Pull）

アプリ起動時は「自動的にPullボタンを押す」のと同じです。handlePull内でダーティチェック、staleチェックが行われます。

```typescript
// onMount内
if (isConfigured) {
  // 初回Pull実行（handlePull内でdirtyチェック、staleチェックを行う）
  // キャンセル時はIndexedDBから読み込んで操作可能にする
  await handlePull(true, async () => {
    try {
      const savedNotes = await loadNotes()
      const savedLeaves = await loadLeaves()
      notes.set(savedNotes)
      leaves.set(savedLeaves)
      isFirstPriorityFetched = true
      restoreStateFromUrl(false)
    } catch (error) {
      console.error('Failed to load from IndexedDB:', error)
      await handlePull(true)
    }
  })
}
```

handlePull関数のシグネチャ:

```typescript
async function handlePull(isInitialStartup = false, onCancel?: () => void)
```

- **isInitialStartup**: trueの場合、確認ダイアログのメッセージが起動時用に変わる
- **onCancel**: 確認ダイアログでキャンセルした時に呼ばれるコールバック

**起動時のキャンセル動作:**

- `isFirstPriorityFetched = true` を設定して操作ロックを解除
- IndexedDBからノート・リーフを読み込んでストアに設定
- URLから状態を復元
- これにより、PWA強制終了後でもローカルの変更を保持して継続編集が可能

#### 2. Pullボタンクリック時

Pullボタンと初回Pullは同じhandlePull関数を使用します。ダーティチェックとstaleチェックを行い、必要に応じて確認ダイアログを表示します。

```typescript
async function handlePull(isInitialStartup = false, onCancel?: () => void) {
  // 交通整理: Pull/Push中は不可
  if (!canSync($isPulling, $isPushing).canPull) return

  // 未保存の変更がある場合は確認
  if (get(isDirty) || getPersistedDirtyFlag()) {
    const message = isInitialStartup
      ? $_('modal.unsavedChangesOnStartup')
      : $_('modal.unsavedChanges')
    showConfirm(message, () => executePullInternal(isInitialStartup), onCancel)
    return
  }

  // staleチェック（比較対象は常にある：初期値0 vs リモート）
  const isStale = await checkIfStaleEdit($settings, get(lastPulledPushCount))
  if (!isStale) {
    showPullToast($_('github.noRemoteChanges'), 'success')
    return
  }

  await executePullInternal(isInitialStartup)
}
```

- **ダイアログタイプ**: Modal.svelteベースの既存モーダル
- **メッセージ（通常）**: 「未保存の変更があります。Pullすると上書きされます。続行しますか？」
- **メッセージ（起動時）**: 「前回の編集内容がGitHubに保存されていません。Pullすると失われます。Pullしますか？」
- **OK**: Pullを実行
- **キャンセル**: onCancelコールバックがあれば実行、なければ何もしない

#### 3. ページ離脱時（ブラウザ標準ダイアログ）

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

#### 通常フロー

1. **リーフを編集** → `isDirty.set(true)` → LocalStorageに永続化 → 保存ボタンに赤い丸印表示
2. **Pushボタンをクリック** → Push実行 → 成功時に `isDirty.set(false)` → LocalStorageから削除 → 赤い丸印消える
3. **未保存の状態でPullボタンをクリック** → 確認ダイアログ表示
4. **未保存の状態でタブを閉じる** → ブラウザ標準の確認ダイアログ表示

#### PWA強制終了フロー

```
PWA強制終了 (isDirty=true のままLocalStorageに残る)
    ↓
PWA再起動
    ↓
onMount: LocalStorageからisDirty=trueを検出
    ↓
確認ダイアログ表示
    ├─ OK → Pull実行（GitHubの最新に上書き、ローカル変更は破棄）
    └─ キャンセル → IndexedDBから読み込み、操作可能に（Pushすればローカル変更を保存可能）
```

---

## リーフごとのダーティ追跡

### 概要

リーフ単位で未保存の変更を追跡し、UIに赤丸で表示します。これにより、ユーザーはどのリーフが未保存なのかを一目で把握できます。

### データ構造

```typescript
export interface Leaf {
  id: UUID
  title: string
  noteId: UUID
  content: string
  updatedAt: number
  order: number
  badgeIcon?: string
  badgeColor?: string
  isDirty?: boolean // 未Pushの変更があるかどうか
}
```

### ストア構成

```typescript
// リーフごとのisDirtyから派生
const hasAnyLeafDirty = derived(leaves, ($leaves) => $leaves.some((l) => l.isDirty))

// ノート構造変更フラグ（作成/削除/名前変更など）
export const isStructureDirty = writable<boolean>(false)

// 全体のダーティ判定（リーフ変更 or 構造変更）
export const isDirty = derived(
  [hasAnyLeafDirty, isStructureDirty],
  ([$hasAnyLeafDirty, $isStructureDirty]) => $hasAnyLeafDirty || $isStructureDirty
)
```

### ヘルパー関数

```typescript
// 特定のリーフをダーティに設定
export function setLeafDirty(leafId: string, dirty: boolean = true): void {
  leaves.update(($leaves) => $leaves.map((l) => (l.id === leafId ? { ...l, isDirty: dirty } : l)))
}

// 全リーフのダーティをクリア
export function clearAllDirty(): void {
  leaves.update(($leaves) => $leaves.map((l) => ({ ...l, isDirty: false })))
}

// 全変更をクリア（Push/Pull成功時に呼び出し）
export function clearAllChanges(): void {
  clearAllDirty()
  isStructureDirty.set(false)
}

// 特定ノート配下のリーフがダーティかどうか
export function isNoteDirty(noteId: string, $leaves: Leaf[]): boolean {
  return $leaves.some((l) => l.noteId === noteId && l.isDirty)
}
```

### UI表示

#### リーフカードの赤丸

```svelte
<strong class="text-ellipsis">
  {item.leaf.title}
  {#if item.leaf.isDirty}
    <span class="dirty-indicator" title={$_('leaf.unsaved')}></span>
  {/if}
</strong>
```

#### ノートカードの赤丸

```svelte
<NoteCard
  note={subNote}
  isDirty={allLeaves.some((l) => l.noteId === subNote.id && l.isDirty)}
  ...
/>
```

#### CSSスタイル

```css
.dirty-indicator {
  display: inline-block;
  width: 8px;
  height: 8px;
  background: #ef4444;
  border-radius: 50%;
  margin-left: 4px;
  vertical-align: middle;
}
```

### ダーティフラグの設定タイミング

1. **エディタで編集時** (`MarkdownEditor.svelte`)

   ```typescript
   if (!isOfflineLeaf(leafId) && !isPriorityLeaf(leafId)) {
     setLeafDirty(leafId)
   }
   ```

2. **ノート構造変更時** (`stores.ts`)
   - ノート/リーフの作成、削除、名前変更、移動
   - `isStructureDirty.set(true)`

### ダーティフラグのクリアタイミング

1. **Push成功時**: `clearAllChanges()`
2. **Pull成功時**: `clearAllChanges()`

---

## 自動Push機能

### 概要

編集後5分経過すると自動的にGitHubにPushします。これにより、PWA強制終了時のデータ損失リスクを軽減します。

### 設定値

```typescript
const AUTO_PUSH_INTERVAL_MS = 5 * 60 * 1000 // 5分（Push間隔）
const AUTO_PUSH_CHECK_INTERVAL_MS = 30 * 1000 // 30秒（チェック間隔）
```

### 実装

```typescript
const autoPushIntervalId = setInterval(async () => {
  // バックグラウンドでは実行しない
  if (document.visibilityState !== 'visible') return

  // GitHub設定がなければスキップ
  if (!$githubConfigured) return

  // Push/Pull中はスキップ
  if ($isPulling || $isPushing) return

  // ダーティがなければスキップ
  if (!get(isDirty)) return

  // 前回Pushから5分経過していなければスキップ
  const now = Date.now()
  const lastPush = get(lastPushTime)
  if (lastPush > 0 && now - lastPush < AUTO_PUSH_INTERVAL_MS) return

  // 初回Pullが完了していなければスキップ
  if (!isFirstPriorityFetched) return

  // staleチェックを実行
  const staleResult = await executeStaleCheck($settings, get(lastPulledPushCount))
  if (staleResult.status === 'stale') {
    // staleの場合は確認ダイアログを表示（手動Pushと同じ）
    isStale.set(true)
    const confirmed = await confirmAsync($_('modal.staleEdit'))
    if (!confirmed) return
  }

  // 自動Push実行
  await handleSaveToGitHub()
}, AUTO_PUSH_CHECK_INTERVAL_MS)
```

### 動作条件

自動Pushが実行される条件:

1. ブラウザタブがアクティブ（`visibilityState === 'visible'`）
2. GitHub設定済み
3. Push/Pull処理中でない
4. ダーティな変更がある（`isDirty === true`）
5. 前回Pushから5分以上経過
6. 初回Pull完了済み
7. staleでない（リモートに新しい変更がない）

### stale検出時の動作

リモートに新しい変更がある場合（他のデバイスでPushされた場合）:

1. `isStale`ストアを`true`に設定
2. Pullボタンに赤丸を表示
3. トースト通知「他のデバイスで変更があります。先にPullしてください。」
4. 自動Pushは実行しない

### Pullボタンの赤丸

```svelte
<!-- Header.svelte -->
<div class="pull-button-wrapper">
  <div class="pull-button">
    <IconButton onClick={onPull} ...>
      <OctocatPullIcon />
    </IconButton>
  </div>
  {#if isStale}
    <span class="notification-badge" title={$_('header.staleRemote')}></span>
  {/if}
</div>
```

### 関連ストア

```typescript
// stale状態（リモートに新しい変更がある）
export const isStale = writable<boolean>(false)

// 最後にPush成功した時刻
export const lastPushTime = writable<number>(0)
```

### 動作フロー

```
編集開始
    ↓
setLeafDirty(leafId) → isDirty = true
    ↓
30秒ごとにチェック
    ↓
5分経過 + ダーティあり + アクティブ
    ↓
staleチェック
    ├─ staleでない → 自動Push実行 → lastPushTime更新 → clearAllChanges()
    └─ stale → isStale = true → Pullボタンに赤丸 → 自動Pushスキップ
```

### Pull後のstale解除

```typescript
// Pull成功時
clearAllChanges()
isStale.set(false) // Pullしたのでstale状態を解除
```

### 設計思想

- **5分間隔**: PWA強制終了（5分）より短い間隔で自動保存
- **バックグラウンド非実行**: バッテリー消費を抑制
- **staleチェック**: 他デバイスとの競合を防止
- **ユーザー透過**: 自動で保存されるため意識不要
