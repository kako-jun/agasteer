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
// 戻り値: pushCount（成功時）、-1（チェック不可：空リポジトリ、認証エラー、ネットワークエラー等）
export async function fetchRemotePushCount(settings: Settings): Promise<number> {
  const validation = validateGitHubSettings(settings)
  if (!validation.valid) {
    // 設定が無効な場合は-1を返す（チェック不可）
    return -1
  }

  try {
    const metadataRes = await fetchGitHubContents(
      'notes/metadata.json',
      settings.repoName,
      settings.token
    )
    if (metadataRes.ok) {
      // ... Base64デコードしてpushCountを取得
      return metadata.pushCount || 0
    }
    // 404の場合（空リポジトリ）は-1を返す
    // 「リモートに変更がありません」ではなく、Pullを実行させる
    if (metadataRes.status === 404) {
      return -1
    }
    // 認証エラーや権限エラーも-1（チェック不可）
    if (metadataRes.status === 401 || metadataRes.status === 403) {
      return -1
    }
    return -1
  } catch (e) {
    // ネットワークエラー等は-1（チェック不可）
    return -1
  }
}

// stale編集かどうかを判定
// 戻り値: staleならtrue、チェック不可（設定無効、ネットワークエラー等）の場合もtrue
export async function checkIfStaleEdit(
  settings: Settings,
  lastPulledPushCount: number
): Promise<boolean> {
  const remotePushCount = await fetchRemotePushCount(settings)
  // -1はチェック不可（設定無効、認証エラー、ネットワークエラー等）
  // この場合はPull/Pushを進めて適切なエラーメッセージを表示
  if (remotePushCount === -1) {
    return true
  }
  return remotePushCount > lastPulledPushCount
}
```

**判定ロジック:**

- `remotePushCount === -1` → チェック不可（Pull/Pushを進めてエラー表示）
- `remotePushCount > lastPulledPushCount` → stale（リモートに新しい変更がある）
- `remotePushCount <= lastPulledPushCount` → 最新（Pushして問題なし）

**チェック不可の場合:**

設定が無効、認証エラー、ネットワークエラー、空リポジトリ（初回コミットなし）などでリモートの状態を確認できない場合、`fetchRemotePushCount`は`-1`を返し、`checkIfStaleEdit`は`true`を返します。これにより、Pull/Push処理が続行され、適切なエラーメッセージ（例: 「トークンが無効です」「リポジトリが見つかりません」）が表示されるか、空リポジトリの場合は正常に初期化されます。

**空リポジトリの扱い:**

metadata.jsonが存在しない（404）場合は`-1`を返します。これにより「リモートに変更はありません」ではなく、Pullが実行され、空リポジトリとして正常に処理されます（github-integration.md参照）。

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

---
