/**
 * #199: computeDirtyLines の改行コード正規化と dirty 行判定の回帰防止テスト。
 *
 * baseContent（Push 済みの保存内容）が CRLF / 単独 CR を含む一方で、
 * CodeMirror の doc は常に LF のため、改行コード差だけで全行が誤 dirty に
 * なるバグ（#199）を直した。ここでは正規化が入っても既存の LCS 判定
 * （内容差・挿入/削除・base===null・完全一致）が壊れていないことも併せて縛る。
 *
 * computeDirtyLines は純関数なので DOM 依存なしにそのまま import してテストする。
 */
import { describe, expect, it } from 'vitest'
import { computeDirtyLines } from './dirty-lines'

describe('computeDirtyLines 改行コード正規化（回帰 #199）', () => {
  it('CRLF の base と LF の current は改行差だけなら空 Set（核心の回帰）', () => {
    expect(computeDirtyLines('a\r\nb\r\nc', 'a\nb\nc')).toEqual(new Set())
  })

  it('逆向き: LF の base と CRLF の current も改行差だけなら空 Set', () => {
    expect(computeDirtyLines('a\nb', 'a\r\nb')).toEqual(new Set())
  })

  it('旧 Mac の単独 CR も LF と一致扱いで空 Set', () => {
    expect(computeDirtyLines('a\rb', 'a\nb')).toEqual(new Set())
  })

  it('base 内に CRLF・LF・単独 CR が混在していても LF 化して比較し空 Set', () => {
    expect(computeDirtyLines('a\r\nb\nc\rd', 'a\nb\nc\nd')).toEqual(new Set())
  })

  it('改行正規化と内容差が同居: 改行差の行は clean・内容差の行だけ dirty', () => {
    // base/current とも CRLF だが 2 行目だけ内容が違う → 2 行目のみ dirty
    expect(computeDirtyLines('a\r\nb\r\nc', 'a\r\nB\r\nc')).toEqual(new Set([2]))
  })
})

describe('computeDirtyLines 内容差の判定（退行防止）', () => {
  it('改行差のみの 1 行目は clean・内容差の 2 行目だけ dirty', () => {
    // base=CRLF / current=LF かつ 2 行目の中身が b→B
    expect(computeDirtyLines('a\r\nb', 'a\nB')).toEqual(new Set([2]))
  })

  it('複数行のうち中身が変わった行だけ dirty になる', () => {
    expect(computeDirtyLines('line1\nline2\nline3', 'line1\nCHANGED\nline3')).toEqual(new Set([2]))
  })
})

describe('computeDirtyLines base === null（新規リーフ）', () => {
  it('base が null なら全行 dirty（正規化と無関係にこの挙動を維持）', () => {
    expect(computeDirtyLines(null, 'a\nb\nc')).toEqual(new Set([1, 2, 3]))
  })

  it('base が null かつ current が空文字なら 1 行目（空行）が dirty', () => {
    expect(computeDirtyLines(null, '')).toEqual(new Set([1]))
  })

  it('base が null でも current 側の単独 CR を LF 化してから行数を数える', () => {
    // 正規化されなければ "a\rb" は 1 行扱い {1} になってしまう
    expect(computeDirtyLines(null, 'a\rb')).toEqual(new Set([1, 2]))
  })
})

describe('computeDirtyLines 完全一致（LCS スキップ経路）', () => {
  it('正規化後に base===current なら空 Set', () => {
    expect(computeDirtyLines('a\nb\nc', 'a\nb\nc')).toEqual(new Set())
  })

  it('両方とも空文字なら空 Set', () => {
    expect(computeDirtyLines('', '')).toEqual(new Set())
  })
})

describe('computeDirtyLines エッジ（正規化が LCS を壊していないこと）', () => {
  it('空 base に 1 行入力すると 1 行目が dirty', () => {
    expect(computeDirtyLines('', 'a')).toEqual(new Set([1]))
  })

  it('行を挿入すると挿入行だけ dirty になる', () => {
    // "a\nc" に "b" を 2 行目として挿入
    expect(computeDirtyLines('a\nc', 'a\nb\nc')).toEqual(new Set([2]))
  })

  it('行を削除しても残った行は全て clean（dirty 行なし）', () => {
    // 中間行 "b" を削除。残る current 行は base の LCS に全て含まれる
    expect(computeDirtyLines('a\nb\nc', 'a\nc')).toEqual(new Set())
  })

  it('末尾改行を付けると新しく生えた末尾の空行だけ dirty', () => {
    expect(computeDirtyLines('a', 'a\n')).toEqual(new Set([2]))
  })

  it('末尾改行を消しても残る 1 行は clean（dirty 行なし）', () => {
    expect(computeDirtyLines('a\n', 'a')).toEqual(new Set())
  })
})
