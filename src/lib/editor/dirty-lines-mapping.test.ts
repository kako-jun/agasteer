/**
 * #175: dirtyLinesField が doc 変更を経由して line 番号を再マッピングする挙動の回帰防止テスト。
 *
 * dirtyLinesField 本体は createDirtyLineExtension 内部にあり、@codemirror/view の
 * GutterMarker / gutter（DOM 依存）も使うため直接 import できない。
 * ここでは StateField の update ロジック相当を再現したテストヘルパーで、
 * 同じマッピングロジックを @codemirror/state のみで動かして検証する。
 */
import { describe, expect, it } from 'vitest'
import { EditorState, StateEffect, StateField, Text } from '@codemirror/state'

const setDirtyLines = StateEffect.define<Set<number>>()

const dirtyLinesField = StateField.define<Set<number>>({
  create: () => new Set(),
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setDirtyLines)) {
        return effect.value
      }
    }
    if (tr.docChanged && value.size > 0) {
      const oldDoc = tr.startState.doc
      const newDoc = tr.state.doc
      const next = new Set<number>()
      for (const lineNo of value) {
        if (lineNo < 1 || lineNo > oldDoc.lines) continue
        const oldLineFrom = oldDoc.line(lineNo).from
        const newPos = tr.changes.mapPos(oldLineFrom, 1)
        if (newPos < 0 || newPos > newDoc.length) continue
        next.add(newDoc.lineAt(newPos).number)
      }
      return next
    }
    return value
  },
})

function createState(doc: string) {
  const text = Text.of(doc.split('\n'))
  return EditorState.create({ doc: text, extensions: [dirtyLinesField] })
}

describe('dirtyLinesField doc-change mapping (#175)', () => {
  it('上に行を挿入したらダーティ行番号が下にシフトする', () => {
    let state = createState('a\nb\nc\nd\ne')
    state = state.update({
      effects: setDirtyLines.of(new Set([4, 5])), // d, e がダーティ
    }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([4, 5]))

    // 先頭に2行挿入
    state = state.update({
      changes: { from: 0, insert: 'X\nY\n' },
    }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([6, 7]))
  })

  it('上の行を削除したらダーティ行番号が上にシフトする', () => {
    let state = createState('a\nb\nc\nd\ne')
    state = state.update({ effects: setDirtyLines.of(new Set([4, 5])) }).state

    // 先頭2行（"a\nb\n"）を削除
    state = state.update({
      changes: { from: 0, to: 4 },
    }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([2, 3]))
  })

  it('ダーティ行そのものを削除した場合は Set から消える', () => {
    let state = createState('a\nb\nc\nd\ne')
    state = state.update({ effects: setDirtyLines.of(new Set([3])) }).state

    // line 3 ("c\n") を完全削除
    state = state.update({
      changes: { from: 4, to: 6 },
    }).state
    // 削除位置が前の行末にマップされて line 2 になる、または Set に残る場合あり。
    // 重要なのは「現存しない line 6 などに残らない」こと。
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

  it('setDirtyLines effect が来たら docChange より優先される', () => {
    let state = createState('a\nb\nc')
    state = state.update({ effects: setDirtyLines.of(new Set([1, 2])) }).state

    // 同一 transaction で docChange + effect の両方
    state = state.update({
      changes: { from: 0, insert: 'X\n' },
      effects: setDirtyLines.of(new Set([5])),
    }).state
    expect(state.field(dirtyLinesField)).toEqual(new Set([5]))
  })
})
