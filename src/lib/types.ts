/**
 * 型定義
 * アプリケーション全体で使用される型を定義
 */

export type UUID = string

export type ThemeType = 'yomi' | 'campus' | 'greenboard' | 'whiteboard' | 'dotsD' | 'dotsF'

export type Locale = 'ja' | 'en'

export type View = 'home' | 'settings' | 'edit' | 'note' | 'preview'

/** ワールド（Home/Archive）の識別子 */
export type WorldType = 'home' | 'archive'

export interface Settings {
  token: string
  repoName: string
  theme: ThemeType
  toolName: string
  locale: Locale
  vimMode?: boolean
  linedMode?: boolean
  hasCustomFont?: boolean
  hasCustomBackgroundLeft?: boolean
  hasCustomBackgroundRight?: boolean
  backgroundOpacityLeft?: number
  backgroundOpacityRight?: number
}

export interface CustomFont {
  name: string
  data: ArrayBuffer
  type: string
}

export interface CustomBackground {
  name: string
  data: ArrayBuffer
  type: string
}

export interface Metadata {
  version: number
  notes: Record<string, { id: string; order: number; badgeIcon?: string; badgeColor?: string }>
  leaves: Record<
    string,
    { id: string; updatedAt: number; order: number; badgeIcon?: string; badgeColor?: string }
  >
  pushCount: number
}

export interface Note {
  id: UUID
  name: string
  parentId?: UUID
  order: number
  badgeIcon?: string
  badgeColor?: string
}

export interface Leaf {
  id: UUID
  title: string
  noteId: UUID
  content: string
  updatedAt: number
  order: number
  badgeIcon?: string
  badgeColor?: string
}

export interface BreadcrumbSibling {
  id: UUID
  label: string
  isCurrent: boolean
}

export interface Breadcrumb {
  label: string
  action: () => void
  id: UUID
  type: 'home' | 'note' | 'leaf' | 'settings'
  /** 同階層の兄弟ノート/リーフ一覧（ドロップダウン表示用） */
  siblings?: BreadcrumbSibling[]
}

export type ModalType = 'confirm' | 'alert' | 'prompt' | 'choice'

export interface ModalState {
  show: boolean
  message: string
  type: ModalType
  callback: (() => void) | null
  promptCallback?: ((value: string) => void) | null
  placeholder?: string
}

// ============================================
// Stale検出関連の型
// ============================================

/**
 * リモートpushCount取得の結果
 * マジックナンバー(-1など)を使わず、明確な状態を表現
 */
export type FetchPushCountResult =
  | { status: 'success'; pushCount: number }
  | { status: 'empty_repository' } // リポジトリが空、またはmetadata.jsonがない
  | { status: 'settings_invalid' } // GitHub設定が未入力/不正
  | { status: 'auth_error' } // 認証エラー（401/403）
  | { status: 'network_error'; error?: unknown } // ネットワークエラー

/**
 * Staleチェックの結果
 * 呼び出し側で各状態に応じた適切な処理を行うための型
 */
export type StaleCheckResult =
  | { status: 'stale'; remotePushCount: number; localPushCount: number } // リモートに新しい変更あり
  | { status: 'up_to_date' } // 最新状態（Pushして良い）
  | { status: 'check_failed'; reason: FetchPushCountResult } // チェック失敗（設定不正、認証エラー、ネットワークエラー等）

// ============================================
// 検索関連の型
// ============================================

// 検索マッチの種類（優先順: note > leafTitle > content）
export type SearchMatchType = 'note' | 'leafTitle' | 'content'

// 検索結果の型
export interface SearchMatch {
  matchType: SearchMatchType // マッチの種類
  leafId: UUID // ノートマッチの場合は空文字列
  leafTitle: string // ノートマッチの場合は空文字列
  noteName: string
  noteId: UUID
  path: string // ノート/サブノート/リーフのパス形式
  line: number // マッチ行番号（ノートマッチの場合は0）
  snippet: string // マッチ箇所のスニペット（前後N文字含む）
  matchStart: number // スニペット内のマッチ開始位置
  matchEnd: number // スニペット内のマッチ終了位置
  world: WorldType // 検索結果のワールド（home/archive）
}
