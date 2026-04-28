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
