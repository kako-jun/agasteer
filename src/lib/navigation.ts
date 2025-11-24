import type { Note, Leaf, View } from './types'
import type { Writable, Readable } from 'svelte/store'

// ナビゲーション状態の型定義
export type Pane = 'left' | 'right'

export interface NavigationState {
  // ビュー状態
  leftView: View
  leftNote: Note | null
  leftLeaf: Leaf | null
  rightView: View
  rightNote: Note | null
  rightLeaf: Leaf | null

  // UI状態
  isDualPane: boolean
  focusedPane: Pane
  selectedIndexLeft: number
  selectedIndexRight: number
  showSettings: boolean
  isOperationsLocked: boolean

  // エディタ参照
  leftEditorView: any
  rightEditorView: any
}

export interface NavigationDependencies {
  notes: Writable<Note[]>
  leaves: Writable<Leaf[]>
  rootNotes: Readable<Note[]>
}

// ========================================
// ナビゲーション制御の中核
// ========================================

/**
 * ペインのビューを切り替え、フォーカスと選択状態を適切に管理する
 * すべてのナビゲーション処理はこの関数を通す
 */
export function navigateToView(
  state: NavigationState,
  deps: NavigationDependencies,
  pane: Pane,
  view: View,
  note: Note | null = null,
  leaf: Leaf | null = null,
  options: { selectItem?: boolean; focusEditor?: boolean; updateFocus?: boolean } = {}
): NavigationState {
  const { selectItem = true, focusEditor = true, updateFocus = true } = options

  // ビューと状態を更新
  if (pane === 'left') {
    state.leftView = view
    state.leftNote = note
    state.leftLeaf = leaf
  } else {
    state.rightView = view
    state.rightNote = note
    state.rightLeaf = leaf
  }

  // 選択状態を更新
  if (selectItem) {
    updateSelectedIndex(state, deps, pane, view, note, leaf)
  }

  // フォーカスを管理（updateFocus=true の場合は focusedPane も更新）
  if (updateFocus) {
    manageFocus(state, pane, view, focusEditor)
  }

  return state
}

/**
 * ビューに応じて選択インデックスを更新
 */
export function updateSelectedIndex(
  state: NavigationState,
  deps: NavigationDependencies,
  pane: Pane,
  view: View,
  note: Note | null,
  leaf: Leaf | null
): void {
  if (view === 'home') {
    // ホーム画面：最初のアイテムを選択
    if (pane === 'left') {
      state.selectedIndexLeft = 0
    } else {
      state.selectedIndexRight = 0
    }
  } else if (view === 'note' && note) {
    // ノート画面：指定されたノートまたはリーフのインデックスを見つける
    const items = getCurrentItems(state, deps, pane)
    let targetIndex = 0

    if (leaf) {
      // リーフから戻ってきた場合：そのリーフを選択
      targetIndex = items.findIndex((item) => 'title' in item && item.id === leaf.id)
    } else {
      // ノートを開いた場合：最初のアイテムを選択
      targetIndex = 0
    }

    if (targetIndex === -1) targetIndex = 0

    if (pane === 'left') {
      state.selectedIndexLeft = targetIndex
    } else {
      state.selectedIndexRight = targetIndex
    }
  }
  // edit/preview の場合は選択状態を変更しない
}

/**
 * ビューに応じてフォーカスを管理
 */
export function manageFocus(
  state: NavigationState,
  pane: Pane,
  view: View,
  shouldFocusEditor: boolean
): void {
  // フォーカス中のペインを更新（キーボードナビゲーションが正しく動作するように）
  state.focusedPane = pane

  // 現在のフォーカスを外す
  if (document.activeElement instanceof HTMLElement) {
    document.activeElement.blur()
  }

  // エディタビューの場合はエディタにフォーカス
  if (view === 'edit' && shouldFocusEditor) {
    const editor = pane === 'left' ? state.leftEditorView : state.rightEditorView
    if (editor && editor.focusEditor) {
      setTimeout(() => {
        editor.focusEditor()
      }, 0)
    }
  }
  // home/noteビューの場合はフォーカスを外したまま（キーボードナビゲーション用）
}

// ========================================
// 公開ナビゲーション関数（すべて navigateToView を使用）
// ========================================

export function goHome(state: NavigationState, deps: NavigationDependencies, pane: Pane): void {
  navigateToView(state, deps, pane, 'home', null, null)
}

export function selectNote(
  state: NavigationState,
  deps: NavigationDependencies,
  note: Note,
  pane: Pane
): void {
  navigateToView(state, deps, pane, 'note', note, null)
}

export function selectLeaf(
  state: NavigationState,
  deps: NavigationDependencies,
  leaf: Leaf,
  pane: Pane
): void {
  let notes: Note[] = []
  deps.notes.subscribe((n) => (notes = n))()

  const note = notes.find((n) => n.id === leaf.noteId)
  if (note) {
    navigateToView(state, deps, pane, 'edit', note, leaf)
  }
}

export function closeLeaf(state: NavigationState, deps: NavigationDependencies, pane: Pane): void {
  const leaf = pane === 'left' ? state.leftLeaf : state.rightLeaf
  if (!leaf) return

  let notes: Note[] = []
  deps.notes.subscribe((n) => (notes = n))()

  const parentNote = notes.find((n) => n.id === leaf.noteId)
  if (parentNote) {
    // リーフから親ノートに戻る：リーフを選択状態にする
    navigateToView(state, deps, pane, 'note', parentNote, leaf)
  }
}

export function switchPane(state: NavigationState, deps: NavigationDependencies, pane: Pane): void {
  // 2ペイン表示時のみ有効
  if (!state.isDualPane) return

  // もう一方のペインに切り替え
  const newPane = pane === 'left' ? 'right' : 'left'

  // 切り替え先のビューに応じてフォーカスを管理（manageFocus内でfocusedPaneが更新される）
  const targetView = newPane === 'left' ? state.leftView : state.rightView
  manageFocus(state, newPane, targetView, true)
}

export function togglePreview(
  state: NavigationState,
  deps: NavigationDependencies,
  pane: Pane
): void {
  const currentView = pane === 'left' ? state.leftView : state.rightView
  const currentNote = pane === 'left' ? state.leftNote : state.rightNote
  const currentLeaf = pane === 'left' ? state.leftLeaf : state.rightLeaf

  if (currentView === 'edit') {
    navigateToView(state, deps, pane, 'preview', currentNote, currentLeaf, {
      selectItem: false,
      focusEditor: false,
    })
  } else if (currentView === 'preview') {
    navigateToView(state, deps, pane, 'edit', currentNote, currentLeaf, {
      selectItem: false,
      focusEditor: true,
    })
  }
}

// ========================================
// キーボードナビゲーション
// ========================================

/**
 * グローバルキーボードナビゲーションのイベントハンドラ
 */
export function handleGlobalKeyDown(
  state: NavigationState,
  deps: NavigationDependencies,
  e: KeyboardEvent,
  callbacks: {
    onSwitchPane: (pane: Pane) => void
    onNavigateGrid: (direction: 'up' | 'down' | 'left' | 'right') => void
    onOpenSelectedItem: () => void
    onGoBackToParent: () => void
  }
): void {
  // event.targetを取得してどこから来たイベントか判定
  const target = e.target as HTMLElement
  if (!target) return

  // CodeMirrorエディタ内からのイベントは無視
  const isInEditor = target.closest('.cm-content') || target.closest('.cm-editor')
  if (isInEditor) return

  // input/textarea内からのイベントは無視
  if (target.tagName === 'INPUT') return
  if (target.tagName === 'TEXTAREA') return

  // contenteditable要素内からのイベントは無視
  if (target.getAttribute('contenteditable') === 'true') return
  if (target.closest('[contenteditable="true"]')) return

  // 設定画面が開いている場合も無効化
  if (state.showSettings) return

  // フォーカス中のペインがhome/noteビューでない場合は無効化
  const currentView = state.focusedPane === 'left' ? state.leftView : state.rightView
  if (currentView !== 'home' && currentView !== 'note') return

  // 処理するキーの場合のみデフォルト動作を防止
  if (['h', 'j', 'k', 'l', 'Enter', 'Escape', ' '].includes(e.key)) {
    e.preventDefault()
  } else {
    return // 処理対象外のキーは無視
  }

  switch (e.key) {
    case ' ':
      // スペースでペイン切り替え（2ペイン表示時のみ）
      if (state.isDualPane) {
        callbacks.onSwitchPane(state.focusedPane)
      }
      break
    case 'h':
      callbacks.onNavigateGrid('left')
      break
    case 'j':
      callbacks.onNavigateGrid('down')
      break
    case 'k':
      callbacks.onNavigateGrid('up')
      break
    case 'l':
      callbacks.onNavigateGrid('right')
      break
    case 'Enter':
      callbacks.onOpenSelectedItem()
      break
    case 'Escape':
      callbacks.onGoBackToParent()
      break
  }
}

/**
 * 現在のビューに応じたアイテムリストを取得
 */
export function getCurrentItems(
  state: NavigationState,
  deps: NavigationDependencies,
  pane: Pane
): Array<Note | Leaf> {
  const view = pane === 'left' ? state.leftView : state.rightView
  const note = pane === 'left' ? state.leftNote : state.rightNote

  let notes: Note[] = []
  let leaves: Leaf[] = []
  let rootNotes: Note[] = []

  deps.notes.subscribe((n) => (notes = n))()
  deps.leaves.subscribe((l) => (leaves = l))()
  deps.rootNotes.subscribe((r) => (rootNotes = r))()

  if (view === 'home') {
    return rootNotes
  } else if (view === 'note' && note) {
    // サブノートとリーフを結合
    const subNotes = notes.filter((n) => n.parentId === note.id).sort((a, b) => a.order - b.order)
    const noteLeaves = leaves.filter((l) => l.noteId === note.id).sort((a, b) => a.order - b.order)
    return [...subNotes, ...noteLeaves]
  }
  return []
}

/**
 * グリッドナビゲーション（方向指定）
 */
export function navigateGrid(
  state: NavigationState,
  deps: NavigationDependencies,
  direction: 'up' | 'down' | 'left' | 'right'
): void {
  const items = getCurrentItems(state, deps, state.focusedPane)
  const currentIndex =
    state.focusedPane === 'left' ? state.selectedIndexLeft : state.selectedIndexRight

  if (items.length === 0) return

  // グリッドのカラム数を計算（CSS Gridの設定に合わせる）
  const gridColumns = calculateGridColumns()

  let newIndex = currentIndex

  switch (direction) {
    case 'up':
      newIndex = Math.max(0, currentIndex - gridColumns)
      break
    case 'down':
      newIndex = Math.min(items.length - 1, currentIndex + gridColumns)
      break
    case 'left':
      if (currentIndex % gridColumns !== 0) {
        newIndex = Math.max(0, currentIndex - 1)
      }
      break
    case 'right':
      if ((currentIndex + 1) % gridColumns !== 0 && currentIndex < items.length - 1) {
        newIndex = Math.min(items.length - 1, currentIndex + 1)
      }
      break
  }

  // 選択インデックスを更新
  if (state.focusedPane === 'left') {
    state.selectedIndexLeft = newIndex
  } else {
    state.selectedIndexRight = newIndex
  }
}

/**
 * グリッドのカラム数を計算
 * 実際のDOM要素の位置から正確に計算
 */
export function calculateGridColumns(): number {
  // .card-grid 内のカード要素を取得
  const cards = document.querySelectorAll('.card-grid > .note-card, .card-grid > .leaf-card')
  if (cards.length === 0) return 1 // カードがない場合は1カラム

  if (cards.length === 1) return 1 // カードが1つしかない場合は1カラム

  // 最初のカードの上端Y座標を取得
  const firstCardTop = cards[0].getBoundingClientRect().top

  // 同じ行にあるカードを数える（Y座標が同じもの）
  let columnsInFirstRow = 0
  for (let i = 0; i < cards.length; i++) {
    const cardTop = cards[i].getBoundingClientRect().top
    // 1px以内の誤差は同じ行とみなす
    if (Math.abs(cardTop - firstCardTop) < 1) {
      columnsInFirstRow++
    } else {
      // 次の行に到達したら終了
      break
    }
  }

  return Math.max(1, columnsInFirstRow)
}

/**
 * 選択中のアイテムを開く（Enterキー用）
 */
export function openSelectedItem(
  state: NavigationState,
  deps: NavigationDependencies,
  onSelectLeaf: (leaf: Leaf, pane: Pane) => void,
  onSelectNote: (note: Note, pane: Pane) => void
): void {
  const items = getCurrentItems(state, deps, state.focusedPane)
  const index = state.focusedPane === 'left' ? state.selectedIndexLeft : state.selectedIndexRight

  if (index < 0 || index >= items.length) return

  const item = items[index]
  if ('noteId' in item) {
    onSelectLeaf(item as Leaf, state.focusedPane)
  } else {
    onSelectNote(item as Note, state.focusedPane)
  }
}

/**
 * 親に戻る（Escキー用）
 */
export function goBackToParent(state: NavigationState, deps: NavigationDependencies): void {
  const pane = state.focusedPane
  const view = pane === 'left' ? state.leftView : state.rightView
  const note = pane === 'left' ? state.leftNote : state.rightNote

  if (view === 'note' && note) {
    let notes: Note[] = []
    deps.notes.subscribe((n) => (notes = n))()

    const parentNote = notes.find((n) => n.id === note.parentId)
    if (parentNote) {
      // 親ノートに移動
      navigateToView(state, deps, pane, 'note', parentNote, null)

      // 親ノートのビューで表示されるアイテムリスト（親ノートの子供たち）を取得
      const items = getCurrentItems(state, deps, pane)

      // 元のノートを選択
      const targetIndex = items.findIndex((item) => 'name' in item && item.id === note.id)
      if (targetIndex !== -1) {
        if (pane === 'left') {
          state.selectedIndexLeft = targetIndex
        } else {
          state.selectedIndexRight = targetIndex
        }
      }
    } else {
      goHome(state, deps, pane)
    }
  }
  // ホーム画面やエディタでは何もしない
}
