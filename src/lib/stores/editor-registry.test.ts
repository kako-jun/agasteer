import { describe, expect, it, beforeEach, vi } from 'vitest'

import type { Pane } from '../navigation'
import {
  registerEditorFlusher,
  unregisterEditorFlusher,
  flushAllEditors,
  registerLeafEditorSync,
  unregisterLeafEditorSync,
  syncLeafEditors,
  getActiveEditorPane,
} from './editor-registry'

describe('editor-registry', () => {
  beforeEach(() => {
    // 各テストの前に既存の登録をクリア
    unregisterEditorFlusher('left' as Pane)
    unregisterEditorFlusher('right' as Pane)
    unregisterLeafEditorSync('leaf-1', 'left' as Pane)
    unregisterLeafEditorSync('leaf-1', 'right' as Pane)
    unregisterLeafEditorSync('leaf-2', 'left' as Pane)
    unregisterLeafEditorSync('leaf-2', 'right' as Pane)
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

  it('同じ leafId の別ペインエディタへだけ内容同期する', () => {
    const left = { applyExternalContent: vi.fn() }
    const right = { applyExternalContent: vi.fn() }
    registerLeafEditorSync('leaf-1', 'left' as Pane, left)
    registerLeafEditorSync('leaf-1', 'right' as Pane, right)

    syncLeafEditors('leaf-1', 'updated', 'left' as Pane)

    expect(left.applyExternalContent).not.toHaveBeenCalled()
    expect(right.applyExternalContent).toHaveBeenCalledWith('updated')
  })

  it('leafId が違うエディタには同期しない', () => {
    const left = { applyExternalContent: vi.fn() }
    const right = { applyExternalContent: vi.fn() }
    registerLeafEditorSync('leaf-1', 'left' as Pane, left)
    registerLeafEditorSync('leaf-2', 'right' as Pane, right)

    syncLeafEditors('leaf-1', 'updated')

    expect(left.applyExternalContent).toHaveBeenCalledWith('updated')
    expect(right.applyExternalContent).not.toHaveBeenCalled()
  })

  it('returns the pane of the active editor element', () => {
    const editor = {
      getAttribute: vi.fn((name: string) => (name === 'data-pane' ? 'right' : null)),
    }
    const content = {
      closest: vi.fn((selector: string) => (selector === '.cm-editor' ? editor : null)),
    }

    const doc = {
      activeElement: content,
      querySelector: vi.fn(),
    } as unknown as Document

    expect(getActiveEditorPane(doc)).toBe('right')
  })

  it('falls back to .cm-focused editor when activeElement is outside the editor', () => {
    const focusedEditor = {
      getAttribute: vi.fn((name: string) => (name === 'data-pane' ? 'left' : null)),
    }

    const doc = {
      activeElement: {
        closest: vi.fn(() => null),
      },
      querySelector: vi.fn(() => focusedEditor),
    } as unknown as Document

    expect(getActiveEditorPane(doc)).toBe('left')
  })
})
