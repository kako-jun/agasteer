import type { Note, Leaf, Settings, Metadata } from './types'
import { pushAllWithTreeAPI, pullFromGitHub, fetchRemotePushCount } from './github'
import type { PullOptions } from './github'

export type { PullOptions, PullPriority, LeafSkeleton } from './github'

/**
 * Push操作の結果
 */
export interface PushResult {
  success: boolean
  message: string
  variant: 'success' | 'error'
}

/**
 * Pull操作の結果
 */
export interface PullResult {
  success: boolean
  message: string
  variant: 'success' | 'error'
  notes: Note[]
  leaves: Leaf[]
  metadata: Metadata
}

/**
 * 全リーフをGitHubにPush（Git Tree APIを使用）
 *
 * Git Tree APIにより、1コミットで全変更を反映：
 * - リネーム・削除されたファイルも正しく処理
 * - APIリクエスト数を最小化（約6回）
 * - IndexedDBには一切触らない（メモリ上のみで処理）
 *
 * @param leaves - Push対象のリーフ配列
 * @param notes - ノート配列（パス構築に必要）
 * @param settings - GitHub設定
 * @param isOperationsLocked - 操作ロック状態
 * @returns Push結果
 */
export async function executePush(
  leaves: Leaf[],
  notes: Note[],
  settings: Settings,
  isOperationsLocked: boolean
): Promise<PushResult> {
  // 操作ロック中はエラー
  if (isOperationsLocked) {
    return {
      success: false,
      message: '初回Pullが完了するまで保存できません',
      variant: 'error',
    }
  }

  // リーフが空の場合はエラー
  if (leaves.length === 0) {
    return {
      success: false,
      message: '保存するリーフがありません',
      variant: 'error',
    }
  }

  // Git Tree APIで一括Push
  const result = await pushAllWithTreeAPI(leaves, notes, settings)

  return {
    success: result.success,
    message: result.message,
    variant: result.success ? 'success' : 'error',
  }
}

/**
 * GitHubから全データをPull
 *
 * 重要: GitHubが唯一の真実の情報源（Single Source of Truth）
 * IndexedDBは単なるキャッシュであり、Pull成功時に全削除→全作成される
 *
 * @param settings - GitHub設定
 * @param options - Pull時のオプション（優先度、コールバック）
 * @returns Pull結果
 */
export async function executePull(settings: Settings, options?: PullOptions): Promise<PullResult> {
  const result = await pullFromGitHub(settings, options)

  if (result.success) {
    return {
      success: true,
      message: 'Pullしました',
      variant: 'success',
      notes: result.notes,
      leaves: result.leaves,
      metadata: result.metadata,
    }
  } else {
    return {
      success: false,
      message: 'Pullに失敗しました',
      variant: 'error',
      notes: [],
      leaves: [],
      metadata: result.metadata,
    }
  }
}

/**
 * stale編集かどうかを判定
 * リモートのpushCountがローカルのlastPulledPushCountより大きければstale
 *
 * @param settings - GitHub設定
 * @param lastPulledPushCount - 最後にPullしたときのpushCount
 * @returns staleならtrue
 */
export async function checkIfStaleEdit(
  settings: Settings,
  lastPulledPushCount: number
): Promise<boolean> {
  const remotePushCount = await fetchRemotePushCount(settings)
  return remotePushCount > lastPulledPushCount
}
