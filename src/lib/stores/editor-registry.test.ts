import { describe, expect, it, beforeEach, vi } from 'vitest'

import type { Pane } from '../navigation'
import { registerEditorFlusher, unregisterEditorFlusher, flushAllEditors } from './editor-registry'

describe('editor-registry', () => {
  beforeEach(() => {
    // 各テストの前に既存の登録をクリア
    unregisterEditorFlusher('left' as Pane)
    unregisterEditorFlusher('right' as Pane)
  })

  it('register した flusher が flushAllEditors で呼ばれる', () => {
    const fn = vi.fn()
    registerEditorFlusher('left' as Pane, fn)
    flushAllEditors()
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('unregister した flusher は flushAllEditors で呼ばれない', () => {
    const fn = vi.fn()
    registerEditorFlusher('left' as Pane, fn)
    unregisterEditorFlusher('left' as Pane)
    flushAllEditors()
    expect(fn).not.toHaveBeenCalled()
  })

  it('flushAllEditors は登録順に全関数を呼ぶ', () => {
    const calls: string[] = []
    registerEditorFlusher('left' as Pane, () => calls.push('left'))
    registerEditorFlusher('right' as Pane, () => calls.push('right'))
    flushAllEditors()
    expect(calls).toEqual(['left', 'right'])
  })

  it('同じ pane で再 register すると上書きされる', () => {
    const first = vi.fn()
    const second = vi.fn()
    registerEditorFlusher('left' as Pane, first)
    registerEditorFlusher('left' as Pane, second)
    flushAllEditors()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
  })

  it('flusher が例外を投げても他の flusher は呼ばれる（#186）', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const throwing = vi.fn(() => {
      throw new Error('boom')
    })
    const ok = vi.fn()
    registerEditorFlusher('left' as Pane, throwing)
    registerEditorFlusher('right' as Pane, ok)
    flushAllEditors()
    expect(throwing).toHaveBeenCalledTimes(1)
    expect(ok).toHaveBeenCalledTimes(1)
    expect(errorSpy).toHaveBeenCalled()
    errorSpy.mockRestore()
  })

  it('expectedFn を渡した unregister は登録関数と一致した時のみ削除する', () => {
    const fn1 = vi.fn()
    const fn2 = vi.fn()
    registerEditorFlusher('left' as Pane, fn1)
    // fn2 を expected に渡す → 一致しないので削除されない
    unregisterEditorFlusher('left' as Pane, fn2)
    flushAllEditors()
    expect(fn1).toHaveBeenCalledTimes(1)
    // fn1 を expected に渡す → 一致するので削除される
    unregisterEditorFlusher('left' as Pane, fn1)
    fn1.mockClear()
    flushAllEditors()
    expect(fn1).not.toHaveBeenCalled()
  })

  it('登録なしで flushAllEditors を呼んでも例外にならない（#186 push 直前の no-op 保証）', () => {
    expect(() => flushAllEditors()).not.toThrow()
  })
})
