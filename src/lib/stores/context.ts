/**
 * Svelte Context API の型定義
 * コンポーネント間でアクションを共有するために使用
 */

import type { Note, Leaf, Breadcrumb, WorldType } from '../types'
import type { Pane } from '../navigation'

// Context キー
export const PANE_ACTIONS_KEY = 'paneActions'
export const PANE_STATE_KEY = 'paneState'

/**
 * ペイン操作のアクション
 * App.svelteで定義し、子コンポーネントで使用
 */
export interface PaneActions {
  // ナビゲーション
  selectNote: (note: Note, pane: Pane) => void
  selectLeaf: (leaf: Leaf, pane: Pane) => void
  goHome: (pane: Pane) => void
  closeLeaf: (pane: Pane) => void
  switchPane: (pane: Pane) => void
  togglePreview: (pane: Pane) => void
  openPriorityView: (pane: Pane) => void

  // CRUD操作
  createNote: (parentId: string | undefined, pane: Pane, name?: string) => void
  deleteNote: (pane: Pane) => void
  createLeaf: (pane: Pane, title?: string) => void
  deleteLeaf: (leafId: string, pane: Pane) => void
  updateLeafContent: (content: string, leafId: string) => void
  updateNoteBadge: (noteId: string, icon: string, color: string) => void
  updateLeafBadge: (leafId: string, icon: string, color: string) => void
  updatePriorityBadge: (icon: string, color: string) => void
  updateOfflineBadge: (icon: string, color: string) => void
  updateOfflineContent: (content: string) => void
  openOfflineView: (pane: Pane) => void

  // ドラッグ&ドロップ
  handleDragStartNote: (note: Note) => void
  handleDragEndNote: () => void
  handleDragOverNote: (e: DragEvent, note: Note) => void
  handleDropNote: (note: Note) => void
  handleDragStartLeaf: (leaf: Leaf) => void
  handleDragEndLeaf: () => void
  handleDragOverLeaf: (e: DragEvent, leaf: Leaf) => void
  handleDropLeaf: (leaf: Leaf) => void

  // 移動モーダル
  openMoveModalForNote: (pane: Pane) => void
  openMoveModalForLeaf: (pane: Pane) => void

  // 保存・エクスポート
  handlePushToGitHub: () => void
  downloadLeafAsMarkdown: (leafId: string, pane: Pane) => void
  downloadLeafAsImage: (leafId: string, pane: Pane) => void

  // パンくずリスト
  startEditingBreadcrumb: (crumb: Breadcrumb) => void
  saveEditBreadcrumb: (id: string, newName: string, type: 'note' | 'leaf') => void
  cancelEditBreadcrumb: () => void

  // シェア
  handleCopyUrl: (pane: Pane) => void
  handleCopyMarkdown: (pane: Pane) => void
  handleShareImage: (pane: Pane) => void
  handleShareSelectionImage: (pane: Pane) => void
  getHasSelection: (pane: Pane) => boolean

  // スクロール
  handleLeftScroll: (scrollTop: number, scrollHeight: number) => void
  handleRightScroll: (scrollTop: number, scrollHeight: number) => void

  // スワイプナビゲーション
  goToNextSibling: (pane: Pane) => boolean
  goToPrevSibling: (pane: Pane) => boolean

  // パンくずリストからの兄弟選択
  selectSiblingFromBreadcrumb: (id: string, type: 'note' | 'leaf', pane: Pane) => void

  // Priorityリンククリック（元リーフの該当行へジャンプ）
  handlePriorityLinkClick: (leafId: string, line: number, pane: Pane) => void

  // 無効なPushボタンがクリックされたとき
  handleDisabledPushClick: (reason: string) => void

  // ワールド切り替え・アーカイブ
  handleWorldChange: (world: WorldType) => void
  archiveNote: (pane: Pane) => void
  archiveLeaf: (pane: Pane) => void
  restoreNote: (pane: Pane) => void
  restoreLeaf: (pane: Pane) => void
}

/**
 * ペインの状態（propsで渡すには多すぎるもの）
 */
export interface PaneState {
  /** 第1優先リーフの取得が完了したか（URLで指定されたリーフ） */
  isFirstPriorityFetched: boolean
  /** 全リーフのPullが完了したか */
  isPullCompleted: boolean
  /** Push可能か */
  canPush: boolean
  /** Pushボタンが無効な理由（Pull中の進捗メッセージなど） */
  pushDisabledReason: string
  selectedIndexLeft: number
  selectedIndexRight: number
  editingBreadcrumb: string | null
  dragOverNoteId: string | null
  dragOverLeafId: string | null
  loadingLeafIds: Set<string>
  leafSkeletonMap: Map<string, any>
  totalLeafCount: number
  totalLeafChars: number
  lastPulledPushCount: number
  currentPriorityLeaf: Leaf | null
  currentOfflineLeaf: Leaf | null
  breadcrumbs: Breadcrumb[]
  breadcrumbsRight: Breadcrumb[]
  showWelcome: boolean
  isLoadingUI: boolean
  /** 現在のワールド（home/archive） */
  currentWorld: WorldType
  /** アーカイブがロード中か */
  isArchiveLoading: boolean
}
