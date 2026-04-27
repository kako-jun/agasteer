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

export function registerEditorFlusher(pane: Pane, fn: () => void): void {
  flushers.set(pane, fn)
}

export function unregisterEditorFlusher(pane: Pane): void {
  flushers.delete(pane)
}

/**
 * 登録済みの全エディタに composition flush を促す。
 * push 直前に呼び、IME 確定前の入力で leaf.content が更新されない状況を解消する（#186）。
 */
export function flushAllEditors(): void {
  for (const fn of flushers.values()) {
    try {
      fn()
    } catch (e) {
      console.error('[editor-registry] flusher failed', e)
    }
  }
}
