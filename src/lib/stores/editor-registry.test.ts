import { describe, expect, it, beforeEach, vi } from 'vitest'

import type { Pane } from '../navigation'

// 他のテスト同様 jsdom を有効にしていないため、storage 系モジュールが
// トップレベルで参照する localStorage をスタブしてから動的 import する。
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: (i: number) => Array.from(store.keys())[i] ?? null,
  get length() {
    return store.size
  },
}

const { registerEditorFlusher, unregisterEditorFlusher, flushAllEditors } =
  await import('./editor-registry.svelte')

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
})
