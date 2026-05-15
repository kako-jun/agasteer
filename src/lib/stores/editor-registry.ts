import type { Pane } from '../navigation'

/**
 * pane → composition flush 関数のレジストリ。
 *
 * Android などで IME composition が確定する前に push を押すと、
 * MarkdownEditor 側の `pendingCompositionChange` が立ったまま
 * `onChange` が呼ばれず、`leaves.value` が IME 確定前の古い content
 * のまま push されてしまう問題（#186）への対策。
 *
 * push 直前に `flushAllEditors()` を呼ぶことで、登録済みの全エディタに
 * composition の強制 flush を促す。
 */
const flushers = new Map<Pane, () => void>()

interface LeafEditorSyncHandle {
  applyExternalContent: (content: string) => void
}

const leafEditorSyncHandles = new Map<Pane, { leafId: string; handle: LeafEditorSyncHandle }>()

export function registerEditorFlusher(pane: Pane, fn: () => void): void {
  flushers.set(pane, fn)
}

/**
 * pane の flusher を解除する。
 * `expectedFn` を渡すと「自分が登録した関数と一致するときだけ削除」する
 * 防御的解除になる（同じ pane で旧コンポーネント destroy 前に新コンポーネント
 * mount が走った場合に、新登録を旧 destroy が消すのを防ぐ）。
 */
export function unregisterEditorFlusher(pane: Pane, expectedFn?: () => void): void {
  if (expectedFn !== undefined && flushers.get(pane) !== expectedFn) return
  flushers.delete(pane)
}

/**
 * 登録済みの全エディタに composition flush を促す。
 * push 直前に呼び、IME 確定前の入力で leaf.content が更新されない状況を解消する（#186）。
 */
export function flushAllEditors(): void {
  for (const [pane, fn] of flushers) {
    try {
      fn()
    } catch (e) {
      console.error('[editor-registry] flusher failed for pane', pane, e)
    }
  }
}

export function registerLeafEditorSync(
  leafId: string,
  pane: Pane,
  handle: LeafEditorSyncHandle
): void {
  leafEditorSyncHandles.set(pane, { leafId, handle })
}

export function unregisterLeafEditorSync(
  leafId: string,
  pane: Pane,
  expectedHandle?: LeafEditorSyncHandle
): void {
  const current = leafEditorSyncHandles.get(pane)
  if (!current || current.leafId !== leafId) return
  if (expectedHandle !== undefined && current.handle !== expectedHandle) return
  leafEditorSyncHandles.delete(pane)
}

export function syncLeafEditors(leafId: string, content: string, sourcePane?: Pane): void {
  for (const [pane, registration] of leafEditorSyncHandles) {
    if (registration.leafId !== leafId) continue
    if (sourcePane !== undefined && pane === sourcePane) continue
    try {
      registration.handle.applyExternalContent(content)
    } catch (e) {
      console.error('[editor-registry] leaf sync failed for pane', pane, e)
    }
  }
}

export function getActiveEditorPane(doc: Document = document): Pane | null {
  const active = doc.activeElement
  const fromActive = active?.closest?.('.cm-editor')?.getAttribute('data-pane')
  if (fromActive === 'left' || fromActive === 'right') return fromActive

  const focusedEditor = doc.querySelector<HTMLElement>('.cm-editor.cm-focused[data-pane]')
  const fromFocused = focusedEditor?.getAttribute('data-pane')
  if (fromFocused === 'left' || fromFocused === 'right') return fromFocused

  return null
}
