/**
 * insertTextAtCursor のテスト（#243）
 *
 * MarkdownEditor.insertAtCursor の本体。フェイク view で dispatch 内容と
 * フォーカス挙動（既定=フォーカスする / 添付経由=focus:false で抑制）を検証する。
 */

import { describe, expect, it, vi } from 'vitest'

import { insertTextAtCursor, type CursorInsertView } from './insert-text'

function makeView(cursorFrom: number): CursorInsertView & {
  dispatch: ReturnType<typeof vi.fn>
  focus: ReturnType<typeof vi.fn>
} {
  return {
    state: { selection: { main: { from: cursorFrom } } },
    dispatch: vi.fn(),
    focus: vi.fn(),
  }
}

describe('insertTextAtCursor', () => {
  it('カーソル位置に挿入し、カーソルを挿入末尾へ移す', () => {
    const view = makeView(5)
    insertTextAtCursor(view, 'abc')
    expect(view.dispatch).toHaveBeenCalledWith({
      changes: { from: 5, insert: 'abc' },
      selection: { anchor: 8 },
    })
  })

  it('既定ではエディタにフォーカスを移す（従来挙動）', () => {
    const view = makeView(0)
    insertTextAtCursor(view, 'x')
    expect(view.focus).toHaveBeenCalledOnce()
  })

  it('focus: false でフォーカス移動を抑制する（メディア添付経由の挿入用）', () => {
    const view = makeView(0)
    insertTextAtCursor(view, 'x', { focus: false })
    expect(view.dispatch).toHaveBeenCalledOnce()
    expect(view.focus).not.toHaveBeenCalled()
  })

  it('focus: true を明示しても既定と同じ', () => {
    const view = makeView(0)
    insertTextAtCursor(view, 'x', { focus: true })
    expect(view.focus).toHaveBeenCalledOnce()
  })
})
