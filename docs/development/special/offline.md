# Offlineリーフ

ローカル専用のメモ機能。GitHubとの同期対象外で、IndexedDBにのみ保存される。

## 概要

- **用途**: オフライン時や急ぎのメモ用
- **保存先**: IndexedDBのみ（GitHubには保存しない）
- **表示位置**: ホーム画面の先頭（Priorityリーフの前）
- **編集制限**: なし（Pull中でも編集可能）

## 仕様

| 項目         | 内容                            |
| ------------ | ------------------------------- |
| **リーフID** | `__offline__`                   |
| **リーフ名** | `Offline`                       |
| **noteId**   | 空文字（ホーム直下）            |
| **order**    | -1（最上位表示）                |
| **保存**     | IndexedDB（`offlineLeafStore`） |
| **統計**     | リーフ数・文字数に含めない      |
| **バッジ**   | 設定可能（IndexedDBに永続化）   |

## 実装

### 定数とファクトリ関数

```typescript
// src/lib/utils/offline.ts

export const OFFLINE_LEAF_NAME = 'Offline'
export const OFFLINE_LEAF_ID = '__offline__'

export function createOfflineLeaf(content?: string, badgeIcon?: string, badgeColor?: string): Leaf {
  return {
    id: OFFLINE_LEAF_ID,
    title: OFFLINE_LEAF_NAME,
    noteId: '',
    content: content || `# ${OFFLINE_LEAF_NAME}\n\n`,
    updatedAt: Date.now(),
    order: -1,
    badgeIcon,
    badgeColor,
  }
}

export function isOfflineLeaf(leafId: string): boolean {
  return leafId === OFFLINE_LEAF_ID
}
```

### ストア管理

```typescript
// src/lib/stores.ts

// オフラインリーフ専用ストア
export const offlineLeafStore = writable<{
  content: string
  badgeIcon?: string
  badgeColor?: string
}>({
  content: '',
  badgeIcon: undefined,
  badgeColor: undefined,
})
```

### IndexedDB保存

```typescript
// src/lib/data/storage.ts

export async function saveOfflineLeaf(data: {
  content: string
  badgeIcon?: string
  badgeColor?: string
}): Promise<void> {
  const db = await openDB()
  await db.put('offlineLeaf', data, 'current')
}

export async function loadOfflineLeaf(): Promise<{
  content: string
  badgeIcon?: string
  badgeColor?: string
} | null> {
  const db = await openDB()
  return await db.get('offlineLeaf', 'current')
}
```

## Pull中の編集保護除外

Pull中はガラス効果オーバーレイが表示されるが、Offlineリーフは除外される。

```svelte
<!-- PaneView.svelte -->
{#if ($state.isLoadingUI || $isPushing) && !(currentLeaf && isOfflineLeaf(currentLeaf.id))}
  <Loading />
{/if}
```

## ファイル構成

```
src/lib/utils/offline.ts
├── OFFLINE_LEAF_NAME      # 固定名
├── OFFLINE_LEAF_ID        # 固定ID
├── getOfflineLeafInitialContent()  # 初期コンテンツ
├── createOfflineLeaf()    # リーフ生成
└── isOfflineLeaf()        # ID判定

src/lib/stores.ts
└── offlineLeafStore       # 専用ストア

src/lib/data/storage.ts
├── saveOfflineLeaf()      # IndexedDB保存
└── loadOfflineLeaf()      # IndexedDB読み込み
```
