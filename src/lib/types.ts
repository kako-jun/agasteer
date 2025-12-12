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
  isDirty?: boolean // 未Pushの変更があるかどうか
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

export type ModalType = 'confirm' | 'alert' | 'prompt'

export interface ModalState {
  show: boolean
  message: string
  type: ModalType
  callback: (() => void) | null
  promptCallback?: ((value: string) => void) | null
  placeholder?: string
}

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
}
