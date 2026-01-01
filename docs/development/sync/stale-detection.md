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

### 定期的なstaleチェック

バックグラウンドで定期的にリモートの状態をチェックし、他のデバイスでPushされた変更を検出します。

#### 仕組み

- **チェック間隔**: 5分
- **条件**: 前回のチェックから5分経過後にチェック
- **タブがアクティブ時のみ**: `document.visibilityState === 'visible'`
- **Pull/Push中はスキップ**: 操作中は干渉しない
- **サイレント実行**: UIブロックなし、通知なし

#### lastStaleCheckTimeストア

最後にstaleチェックを実行した時刻を保持するストア（`stores.ts`）。

```typescript
export const lastStaleCheckTime = writable<number>(0)
```

この時刻は以下のタイミングで更新される：

- Pullボタン押下時のstaleチェック
- 手動Push時のstaleチェック
- 自動Push時のstaleチェック
- 定期チェック実行時

これにより、手動操作でチェックが行われた場合は定期チェックが5分延長される。

#### stale-checker.ts

```typescript
// チェック間隔（5分）
const CHECK_INTERVAL_MS = 5 * 60 * 1000

// 進捗ストア（0〜1）
export const staleCheckProgress = writable<number>(0)

// チェック実行条件
function canPerformCheck(): boolean {
  if (!get(githubConfigured)) return false // GitHub未設定
  if (document.visibilityState !== 'visible') return false // タブ非アクティブ
  if (get(isPulling) || get(isPushing)) return false // Pull/Push中
  if (get(lastStaleCheckTime) === 0) return false // 初回Pull前
  return true
}

// 定期チェッカー開始
export function startStaleChecker(): void {
  // 1秒ごとに進捗更新＆チェック判定（統合タイマー）
  progressIntervalId = setInterval(updateProgressAndCheck, 1000)
}
```

#### 進捗バー表示

ヘッダー左上に、次のチェックまでの残り時間を示す進捗バーを表示。

- **位置**: ヘッダー左端、上から下に伸びる
- **幅**: 2px
- **色**: アクセントカラー（opacity: 0.5）
- **高さ**: ヘッダー高さ × 進捗（0〜1）

1ドット（1px）あたりの時間 = 5分 ÷ ヘッダー高さ（約48px）≈ 6.25秒

**バーの表示条件:**

- GitHub設定済み
- タブがアクティブ
- Pull/Push中でない
- 初回Pull完了済み

条件を満たさない場合、バーは表示されない（progress = 0）。

**チェック実行とリセット:**

- 進捗が100%（5分経過）に達するとチェックを実行
- チェック実行で`lastStaleCheckTime`が更新され、バーは0にリセット
- 再び0から伸び始める

#### stale検出時の動作

定期チェックでstaleを検出した場合：

1. `isStale`ストアを`true`に設定
2. Pullボタンに赤い丸印（notification badge）を表示
3. ユーザーがPullボタンを押すまで待機

### 設計思想

- **個人用アプリ**: 複数ユーザーの同時編集は想定しない
- **警告のみ**: ブロックせず、ユーザーの判断で上書き可能
- **ネットワークエラー時**: チェック失敗時はPushを続行（使い勝手優先）
- **force: true**: Git Tree APIでの強制更新は維持（常に成功を優先）
- **定期チェック**: 5分間隔でサイレントにチェック、stale時のみUI通知

---
