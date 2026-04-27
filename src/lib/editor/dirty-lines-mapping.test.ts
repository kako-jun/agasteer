/**
 * #175: dirtyLinesField が doc 変更を経由して line 番号を再マッピングする
 * 純関数 remapDirtyLinesThroughChanges の回帰防止テスト。
 *
 * StateField 本体は @codemirror/view（DOM 依存）に紐づくため、
 * 純関数だけを抜き出してテストする。本番コードと同じ関数を import するため
 * test/本体間の drift は起きない。
 */
import { describe, expect, it } from 'vitest'
import { EditorState, StateEffect, StateField, Text } from '@codemirror/state'
import { remapDirtyLinesThroughChanges } from './dirty-lines'

const setDirtyLines = StateEffect.define<Set<number>>()

const dirtyLinesField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDirtyLines)) return effect.value
    }
    return remapDirtyLinesThroughChanges(value, tr)
  },
})

function createState(doc: string) {
  const text = Text.of(doc.split('\n'))
  return EditorState.create({ doc: text, extensions: [dirtyLinesField] })
}

describe('remapDirtyLinesThroughChanges (#175)', () => {
  it('上に行を挿入したらダーティ行番号が下にシフトする', () => {
    let state = createState('a\nb\nc\nd\ne')
    state = state.update({ effects: setDirtyLines.of(new Set([4, 5])) }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([4, 5]))

    state = state.update({ changes: { from: 0, insert: 'X\nY\n' } }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([6, 7]))
  })

  it('上の行を削除したらダーティ行番号が上にシフトする', () => {
    let state = createState('a\nb\nc\nd\ne')
    state = state.update({ effects: setDirtyLines.of(new Set([4, 5])) }).state

    state = state.update({ changes: { from: 0, to: 4 } }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([2, 3]))
  })

  it('ダーティ行そのものを削除しても範囲外の値が残らない', () => {
    let state = createState('a\nb\nc\nd\ne')
    state = state.update({ effects: setDirtyLines.of(new Set([3])) }).state

    state = state.update({ changes: { from: 4, to: 6 } }).state
    const result = state.field(dirtyLinesField)
    for (const lineNo of result) {
      expect(lineNo).toBeLessThanOrEqual(state.doc.lines)
      expect(lineNo).toBeGreaterThanOrEqual(1)
    }
  })

  it('docChanged でも dirty Set が空なら何もしない（高速パス）', () => {
    let state = createState('a\nb\nc')
    state = state.update({ changes: { from: 0, insert: 'X\n' } }).state
    expect(state.field(dirtyLinesField).size).toBe(0)
  })

  it('setDirtyLines effect は docChange より優先される', () => {
    let state = createState('a\nb\nc')
    state = state.update({ effects: setDirtyLines.of(new Set([1, 2])) }).state

    state = state.update({
      changes: { from: 0, insert: 'X\n' },
      effects: setDirtyLines.of(new Set([5])),
    }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([5]))
  })
})
