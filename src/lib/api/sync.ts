import type { Note, Leaf, Settings, Metadata } from '../types'
import { pushAllWithTreeAPI, pullFromGitHub, fetchRemotePushCount } from './github'
import type { PullOptions, RateLimitInfo } from './github'

export type { PullOptions, PullPriority, LeafSkeleton, RateLimitInfo } from './github'

/**
 * Push操作の結果
 */
export interface PushResult {
  success: boolean
  message: string
  variant: 'success' | 'error'
  rateLimitInfo?: RateLimitInfo
  /** 変更されたリーフの数（コンテンツ変更のみカウント） */
  changedLeafCount?: number
  /** メタデータのみ変更されたか（リーフ変更なしでメタデータ変更あり） */
  metadataOnlyChanged?: boolean
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
  rateLimitInfo?: RateLimitInfo
}

/**
 * Push操作のオプション
 */
export interface ExecutePushOptions {
  leaves: Leaf[]
  notes: Note[]
  settings: Settings
  isOperationsLocked: boolean
  localMetadata?: Metadata
  /** アーカイブのリーフ（ロード済みの場合のみ） */
  archiveLeaves?: Leaf[]
  /** アーカイブのノート（ロード済みの場合のみ） */
  archiveNotes?: Note[]
  /** アーカイブのメタデータ（ロード済みの場合のみ） */
  archiveMetadata?: Metadata
  /** アーカイブがロード済みかどうか */
  isArchiveLoaded?: boolean
}

/**
 * 全リーフをGitHubにPush（Git Tree APIを使用）
 *
 * Git Tree APIにより、1コミットで全変更を反映：
 * - リネーム・削除されたファイルも正しく処理
 * - APIリクエスト数を最小化（約6回）
 * - IndexedDBには一切触らない（メモリ上のみで処理）
 *
 * @param options - Push操作のオプション
 * @returns Push結果
 */
export async function executePush(options: ExecutePushOptions): Promise<PushResult> {
  const {
    leaves,
    notes,
    settings,
    isOperationsLocked,
    localMetadata,
    archiveLeaves,
    archiveNotes,
    archiveMetadata,
    isArchiveLoaded,
  } = options

  // 操作ロック中はエラー
  if (isOperationsLocked) {
    return {
      success: false,
      message: 'toast.pushFailed',
      variant: 'error',
    }
  }

  // リーフが空の場合はエラー
  if (leaves.length === 0) {
    return {
      success: false,
      message: 'toast.noLeaves',
      variant: 'error',
    }
  }

  // Git Tree APIで一括Push（アーカイブデータも含む）
  const result = await pushAllWithTreeAPI({
    leaves,
    notes,
    settings,
    localMetadata,
    archiveLeaves,
    archiveNotes,
    archiveMetadata,
    isArchiveLoaded,
  })

  return {
    success: result.success,
    message: result.message,
    variant: result.success ? 'success' : 'error',
    rateLimitInfo: result.rateLimitInfo,
    changedLeafCount: result.changedLeafCount,
    metadataOnlyChanged: result.metadataOnlyChanged,
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
      message: result.message,
      variant: 'success',
      notes: result.notes,
      leaves: result.leaves,
      metadata: result.metadata,
    }
  } else {
    return {
      success: false,
      message: result.message,
      variant: 'error',
      notes: [],
      leaves: [],
      metadata: result.metadata,
      rateLimitInfo: result.rateLimitInfo,
    }
  }
}

/**
 * stale編集かどうかを判定
 * リモートのpushCountがローカルのlastPulledPushCountより大きければstale
 *
 * @param settings - GitHub設定
 * @param lastPulledPushCount - 最後にPullしたときのpushCount
 * @returns staleならtrue、チェック不可（設定無効、ネットワークエラー等）の場合もtrue（Pullを進めてエラーを表示）
 */
export async function checkIfStaleEdit(
  settings: Settings,
  lastPulledPushCount: number
): Promise<boolean> {
  const remotePushCount = await fetchRemotePushCount(settings)
  // -1はチェック不可（設定無効、認証エラー、ネットワークエラー等）
  // この場合はPullを進めて適切なエラーメッセージを表示
  if (remotePushCount === -1) {
    return true
  }
  return remotePushCount > lastPulledPushCount
}
