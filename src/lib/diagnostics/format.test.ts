/**
 * 診断ログの切り捨て・整形（#317）のテスト
 */
import { describe, expect, it } from 'vitest'
import {
  MAX_ENTRIES,
  MAX_TOTAL_BYTES,
  trimEntries,
  formatEntry,
  summarize,
  summarizeUserAgent,
  formatReport,
} from './format'
import type { DiagEntry } from './schema'

function mk(i: number, data: DiagEntry['data'] = {}): DiagEntry {
  return { id: i, at: 1_700_000_000_000 + i, kind: 'inflight-set', data }
}
function size(e: DiagEntry): number {
  return JSON.stringify({ at: e.at, kind: e.kind, data: e.data }).length
}
/** JSON 化したサイズがちょうど target になる data を持つエントリ */
function sized(i: number, target: number): DiagEntry {
  const base = size(mk(i, { x: '' }))
  const pad = target - base
  if (pad < 0) throw new Error('target too small')
  return mk(i, { x: 'a'.repeat(pad) })
}

describe('trimEntries: 件数上限', () => {
  const make = (n: number) => Array.from({ length: n }, (_, i) => mk(i + 1))
  it('299 件はそのまま', () => expect(trimEntries(make(299))).toHaveLength(299))
  it('300 件はそのまま', () => expect(trimEntries(make(300))).toHaveLength(300))
  it('301 件は最古 1 件が落ち、新しい側が残り昇順が保たれる', () => {
    const out = trimEntries(make(301))
    expect(out).toHaveLength(MAX_ENTRIES)
    expect(out[0].id).toBe(2)
    expect(out[out.length - 1].id).toBe(301)
    const ids = out.map((e) => e.id!)
    expect(ids).toEqual([...ids].sort((a, b) => a - b))
  })
  it('空配列は空', () => expect(trimEntries([])).toEqual([]))
  it('1 件はそのまま', () => {
    const e = mk(1)
    expect(trimEntries([e])).toEqual([e])
  })
  it('入力配列を破壊しない', () => {
    const input = make(310)
    const copy = [...input]
    trimEntries(input)
    expect(input).toEqual(copy)
    expect(input).toHaveLength(310)
  })
})

describe('trimEntries: サイズ上限', () => {
  it('合計が丁度 MAX_TOTAL_BYTES なら全件残る', () => {
    const half = MAX_TOTAL_BYTES / 2
    const list = [sized(1, half), sized(2, half)]
    expect(size(list[0]) + size(list[1])).toBe(MAX_TOTAL_BYTES)
    expect(trimEntries(list)).toHaveLength(2)
  })
  it('合計が MAX_TOTAL_BYTES + 1 なら最古が落ちる', () => {
    const half = MAX_TOTAL_BYTES / 2
    const list = [sized(1, half + 1), sized(2, half)]
    const out = trimEntries(list)
    expect(out.map((e) => e.id)).toEqual([2])
  })
  it('合計が MAX_TOTAL_BYTES - 1 なら全件残る', () => {
    const half = MAX_TOTAL_BYTES / 2
    const list = [sized(1, half - 1), sized(2, half)]
    expect(trimEntries(list)).toHaveLength(2)
  })
  it('古い側から削除され、新しい側が残る', () => {
    const list = [1, 2, 3, 4].map((i) => sized(i, 80 * 1024))
    expect(trimEntries(list).map((e) => e.id)).toEqual([3, 4])
  })
  it('単一エントリが上限超過だと全捨て（最新の 1 件自体も消える。現状の挙動を固定）', () => {
    const big = sized(1, MAX_TOTAL_BYTES + 1)
    expect(trimEntries([big])).toEqual([])
    // 小さい旧エントリがあっても、最新が大きいと break で全部消える
    expect(trimEntries([mk(1), big])).toEqual([])
  })
})

describe('formatEntry', () => {
  it('ISO 時刻・kind・key=value 形式', () => {
    const e: DiagEntry = { at: 0, kind: 'push-success', data: { commitSha: 'abc1234', stamp: 5 } }
    expect(formatEntry(e)).toBe('1970-01-01T00:00:00.000Z push-success commitSha=abc1234 stamp=5')
  })
  it('null は "null" 表記', () => {
    const e: DiagEntry = { at: 0, kind: 'push-success', data: { parentSha: null } }
    expect(formatEntry(e)).toBe('1970-01-01T00:00:00.000Z push-success parentSha=null')
  })
  it('bool は true/false', () => {
    const e: DiagEntry = { at: 0, kind: 'push-success', data: { noChanges: false } }
    expect(formatEntry(e)).toContain('noChanges=false')
  })
  it('data のキー順がそのまま出る', () => {
    const e: DiagEntry = { at: 0, kind: 'push-success', data: { stamp: 1, commitSha: 'abc1234' } }
    expect(formatEntry(e)).toBe('1970-01-01T00:00:00.000Z push-success stamp=1 commitSha=abc1234')
  })
  it('data が空なら時刻と kind のみ', () => {
    expect(formatEntry({ at: 0, kind: 'inflight-set', data: {} })).toBe(
      '1970-01-01T00:00:00.000Z inflight-set'
    )
  })
  it('改行を含む値が混入した場合は整形でサニタイズされず、そのまま出る（現状の挙動を固定。schema 通過分では起きない）', () => {
    const e: DiagEntry = { at: 0, kind: 'push-success', data: { commitSha: 'a\nb' } }
    expect(formatEntry(e)).toContain('commitSha=a\nb')
  })
  it('at が NaN だと toISOString が RangeError を投げる（現状の挙動を固定）', () => {
    expect(() => formatEntry({ at: NaN, kind: 'inflight-set', data: {} })).toThrow(RangeError)
  })
  it('at が範囲外でも RangeError', () => {
    expect(() => formatEntry({ at: 8.64e15 + 1, kind: 'inflight-set', data: {} })).toThrow(
      RangeError
    )
  })
})

describe('summarize', () => {
  it('0 件は count=0, from/to=null', () => {
    expect(summarize([])).toEqual({ count: 0, from: null, to: null })
  })
  it('1 件は from=to', () => {
    expect(summarize([mk(1)])).toEqual({ count: 1, from: mk(1).at, to: mk(1).at })
  })
  it('複数件は先頭が from・末尾が to', () => {
    expect(summarize([mk(1), mk(2), mk(3)])).toEqual({ count: 3, from: mk(1).at, to: mk(3).at })
  })
})

describe('summarizeUserAgent', () => {
  const cases: [string, string, string][] = [
    [
      'Android Chrome',
      'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UD1A.230803.041) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.6478.122 Mobile Safari/537.36',
      'Chrome 126 / Android',
    ],
    [
      'iOS Safari',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
      'Safari 17 / iOS',
    ],
    [
      'iOS CriOS',
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1',
      'Chrome 126 / iOS',
    ],
    [
      'Edge Windows',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.2592.81',
      'Edge 126 / Windows',
    ],
    [
      'Firefox Linux',
      'Mozilla/5.0 (X11; Linux x86_64; rv:127.0) Gecko/20100101 Firefox/127.0',
      'Firefox 127 / Linux',
    ],
    [
      'Chrome macOS',
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
      'Chrome 126 / macOS',
    ],
  ]
  it.each(cases)('%s', (_n, ua, expected) => {
    expect(summarizeUserAgent(ua)).toBe(expected)
  })
  it('空文字は Unknown', () => {
    expect(summarizeUserAgent('')).toBe('Unknown browser / Unknown OS')
  })
  it('機種名・ビルド番号を含まない', () => {
    const out = summarizeUserAgent(cases[0][1])
    expect(out).not.toContain('Pixel')
    expect(out).not.toContain('UD1A')
    expect(out).not.toContain('Build')
  })
  it('巨大な UA でも要約は短い（かつ機微な文字列を含まない）', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; SECRET_DEVICE) ' + 'x'.repeat(100000)
    const out = summarizeUserAgent(ua)
    expect(out.length).toBeLessThan(50)
    expect(out).not.toContain('SECRET_DEVICE')
  })
})

describe('formatReport', () => {
  const meta = { appVersion: '2026-01-01', device: 'Chrome 126 / Android' }
  it('ヘッダ（アプリ・端末・件数）と各エントリ行を出す', () => {
    const out = formatReport([mk(1), mk(2)], meta)
    const lines = out.split('\n')
    expect(lines[0]).toBe('Agasteer diagnostic log')
    expect(lines[1]).toBe('app: 2026-01-01')
    expect(lines[2]).toBe('device: Chrome 126 / Android')
    expect(lines[3]).toBe('entries: 2')
    expect(lines[4]).toBe('')
    expect(lines).toHaveLength(7)
  })
  it('0 件はヘッダのみ', () => {
    const out = formatReport([], meta)
    expect(out).toContain('entries: 0')
    expect(out.split('\n')).toHaveLength(5)
  })
  it('長い値でも落ちず全文を含む', () => {
    const long = 'a'.repeat(10000)
    const out = formatReport([{ at: 0, kind: 'push-success', data: { commitSha: long } }], meta)
    expect(out).toContain(long)
  })
  it('at が不正（NaN）なエントリが混ざると formatReport 全体が RangeError で落ちる（現状の挙動を固定）', () => {
    expect(() => formatReport([{ at: NaN, kind: 'inflight-set', data: {} }], meta)).toThrow(
      RangeError
    )
  })
})
