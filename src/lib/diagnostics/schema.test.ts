/**
 * 診断ログ許可リスト（#317）のテスト。最重要の安全要件:
 * ノート本文・タイトル・パス・認証トークン・リポ名・ユーザー名は保存されない。
 */
import { describe, expect, it } from 'vitest'
import { DIAG_SCHEMA, buildEntry, type FieldType } from './schema'

const SHA7 = 'abc1234'
const SHA40 = 'a'.repeat(40)
const SHA64 = 'f'.repeat(64)

const spec = DIAG_SCHEMA as unknown as Record<string, Record<string, FieldType>>
const kinds = Object.keys(spec)

/** 各型に対する「正しい値」 */
function validValue(t: FieldType): string | number | boolean | null {
  if (t === 'sha') return SHA40
  if (t === 'int') return 42
  if (t === 'bool') return true
  if (t === 'iso') return '2026-01-02T03:04:05Z'
  return t[0]
}

function validData(kind: string): Record<string, unknown> {
  const d: Record<string, unknown> = {}
  for (const [k, t] of Object.entries(spec[kind])) d[k] = validValue(t)
  return d
}

describe('buildEntry: 全 kind の正常保存', () => {
  it.each(kinds)('%s: 許可された全キーが正しい値のまま保存される', (kind) => {
    const e = buildEntry(kind, validData(kind), 123)
    expect(e).not.toBeNull()
    expect(e!.kind).toBe(kind)
    expect(e!.at).toBe(123)
    expect(e!.data).toEqual(validData(kind))
  })

  it('データ空でも kind だけで保存できる', () => {
    expect(buildEntry('inflight-set', {}, 1)).toEqual({ at: 1, kind: 'inflight-set', data: {} })
  })
})

describe('buildEntry: 未知 kind は保存しない', () => {
  it.each(['unknown', '', '__proto__', 'constructor', 'hasOwnProperty', 'toString', 'valueOf'])(
    '%j は null',
    (kind) => {
      expect(buildEntry(kind, { stamp: 1 }, 1)).toBeNull()
    }
  )
})

describe('buildEntry: 定義外キーは捨てる', () => {
  it('許可リスト外のキーは出力に含まれない', () => {
    const e = buildEntry('inflight-set', { stamp: 1, token: 'ghp_x', title: 'T', path: 'a.md' }, 1)
    expect(e!.data).toEqual({ stamp: 1 })
  })

  it('他 kind のキーは捨てる', () => {
    const e = buildEntry('inflight-set', { commitSha: SHA40, stamp: 2 }, 1)
    expect(e!.data).toEqual({ stamp: 2 })
  })
})

describe('buildEntry: sha 欄に機微な文字列を渡しても捨てる', () => {
  // 注: sha 欄は「hex 7〜64 桁」しか検証しない。hex だけの文字列（例: 'deadbeef' 風のタイトル）は
  // 通る。これは仕様として許容しており、sha 欄に入る値は GitHub 応答由来の経路に限る設計。
  const secrets = [
    'ghp_abcdefghijklmnopqrstuvwxyz0123456789',
    'github_pat_11AAAAAAA',
    'notes/a.md',
    'owner/repo',
    'My secret title',
    'SECRET_TITLE',
    'secret/repo',
    '',
    ' abc1234',
    'abc1234 ',
    'abc1234\n',
    'g'.repeat(40),
  ]
  it.each(secrets)('%j は捨てる', (s) => {
    const e = buildEntry('push-success', { commitSha: s }, 1)
    expect(e!.data).toEqual({})
  })

  it('hex だけの文字列は sha として通る（仕様として許容。経路は GitHub 応答由来に限る）', () => {
    expect(buildEntry('push-success', { commitSha: 'deadbeef' }, 1)!.data.commitSha).toBe(
      'deadbeef'
    )
  })
})

describe('buildEntry: sha の桁数・文字種', () => {
  it('6 桁は拒否', () => {
    expect(buildEntry('push-success', { commitSha: 'abcdef' }, 1)!.data).toEqual({})
  })
  it('7 桁は許可', () => {
    expect(buildEntry('push-success', { commitSha: SHA7 }, 1)!.data.commitSha).toBe(SHA7)
  })
  it('64 桁は許可', () => {
    expect(buildEntry('push-success', { commitSha: SHA64 }, 1)!.data.commitSha).toBe(SHA64)
  })
  it('65 桁は拒否', () => {
    expect(buildEntry('push-success', { commitSha: 'a'.repeat(65) }, 1)!.data).toEqual({})
  })
  it('非 hex を含むと拒否', () => {
    expect(buildEntry('push-success', { commitSha: 'abc123z' }, 1)!.data).toEqual({})
  })
  it('大文字 hex は許可', () => {
    expect(buildEntry('push-success', { commitSha: 'ABCDEF1234' }, 1)!.data.commitSha).toBe(
      'ABCDEF1234'
    )
  })
  it('null は許可（保存される）', () => {
    expect(buildEntry('push-success', { commitSha: null }, 1)!.data).toEqual({ commitSha: null })
  })
  it('undefined は欠落扱い（キー自体が出ない）', () => {
    const e = buildEntry('push-success', { commitSha: undefined }, 1)!
    expect(e.data).toEqual({})
    expect('commitSha' in e.data).toBe(false)
  })
})

describe('buildEntry: int の境界', () => {
  const stamp = (v: unknown) => buildEntry('inflight-set', { stamp: v }, 1)!.data
  it('1.9 は 1 に切り捨て', () => expect(stamp(1.9)).toEqual({ stamp: 1 }))
  it('-1.9 は -1 に切り捨て（0 方向）', () => expect(stamp(-1.9)).toEqual({ stamp: -1 }))
  it('-0 は 0 同等（Math.trunc(-0) は -0）で保存される', () => {
    const v = stamp(-0).stamp as number
    expect(v === 0).toBe(true)
    expect(Object.is(v, -0)).toBe(true) // 現状の挙動を固定: -0 のまま
  })
  it('NaN は捨てる', () => expect(stamp(NaN)).toEqual({}))
  it('Infinity / -Infinity は捨てる', () => {
    expect(stamp(Infinity)).toEqual({})
    expect(stamp(-Infinity)).toEqual({})
  })
  it('文字列 "5" は拒否', () => expect(stamp('5')).toEqual({}))
  it('1e300 は有限なのでそのまま保存される（上限なしの現状を固定）', () => {
    expect(stamp(1e300)).toEqual({ stamp: 1e300 })
  })
  it('大きな整数も保持', () =>
    expect(stamp(Number.MAX_SAFE_INTEGER)).toEqual({ stamp: 9007199254740991 }))
})

describe('buildEntry: bool', () => {
  it.each(['true', 'false', 0, 1, null, 'yes'])('%j は捨てる', (v) => {
    expect(buildEntry('push-success', { noChanges: v }, 1)!.data).toEqual({})
  })
  it('true / false は保存', () => {
    expect(buildEntry('push-success', { noChanges: false }, 1)!.data).toEqual({ noChanges: false })
    expect(buildEntry('push-success', { noChanges: true }, 1)!.data).toEqual({ noChanges: true })
  })
})

describe('buildEntry: iso', () => {
  const date = (v: unknown) => buildEntry('stale-remote-commit', { commitDate: v }, 1)!.data
  it.each([
    '2026-01-02T03:04:05Z',
    '2026-01-02T03:04:05.123Z',
    '2026-01-02T03:04:05+09:00',
    '2026-01-02T03:04:05+0900',
    '2026-01-02T03:04:05',
  ])('%s は許可', (s) => {
    expect(date(s)).toEqual({ commitDate: s })
  })
  it.each([
    '2026-01-02T03:04:05Z\nsecret',
    '2026-01-02T03:04:05Z<script>',
    '<script>alert(1)</script>',
    '2026-01-02',
    'yesterday',
    '',
    ' 2026-01-02T03:04:05Z',
    '2026-01-02T03:04:05Z ',
  ])('%j は拒否', (s) => {
    expect(date(s)).toEqual({})
  })
  it('文字列以外は拒否', () => {
    expect(date(1700000000000)).toEqual({})
    expect(date(new Date())).toEqual({})
  })
})

/** enum 欄の一覧 */
const enumFields: [string, string, readonly string[]][] = []
for (const kind of kinds)
  for (const [key, t] of Object.entries(spec[kind]))
    if (Array.isArray(t)) enumFields.push([kind, key, t as readonly string[]])

describe('buildEntry: enum 欄', () => {
  it.each(enumFields)('%s.%s: 許可値は通る', (kind, key, values) => {
    for (const v of values) expect(buildEntry(kind, { [key]: v }, 1)!.data).toEqual({ [key]: v })
  })

  it.each(enumFields)(
    '%s.%s: 自由文字列・部分一致・大小違い・前後空白は捨てる',
    (kind, key, values) => {
      const v = values[0]
      const bad = [
        'free text',
        'SECRET_TITLE',
        'ghp_token',
        v + 'x',
        v.slice(0, -1),
        v.toUpperCase() === v ? v.toLowerCase() + 'Z' : v.toUpperCase(),
        ' ' + v,
        v + ' ',
        v + '\n',
        '',
      ]
      for (const b of bad) {
        if (values.includes(b)) continue
        expect(buildEntry(kind, { [key]: b }, 1)!.data).toEqual({})
      }
    }
  )
})

describe('buildEntry: 非プリミティブ値は捨てる', () => {
  const weird: [string, unknown][] = [
    ['配列', ['a']],
    ['オブジェクト', { a: 1 }],
    ['関数', () => 1],
    ['Symbol', Symbol('x')],
    ['BigInt', 10n],
    ['Date', new Date()],
  ]
  for (const kind of kinds) {
    for (const key of Object.keys(spec[kind])) {
      it.each(weird)(`${kind}.${key} に %s を渡すと捨てる`, (_n, v) => {
        expect(buildEntry(kind, { [key]: v }, 1)!.data).toEqual({})
      })
    }
  }
})

describe('buildEntry: プロトタイプ汚染・特殊オブジェクト', () => {
  it('own key の __proto__ を入れても Object.prototype は汚染されない', () => {
    const data = JSON.parse('{"__proto__":{"polluted":true},"stamp":1}')
    const e = buildEntry('inflight-set', data, 1)!
    expect(e.data).toEqual({ stamp: 1 })
    expect(({} as any).polluted).toBeUndefined()
    expect((Object.prototype as any).polluted).toBeUndefined()
  })

  it('Object.create(null) の data でも落ちない', () => {
    const d = Object.create(null)
    d.stamp = 5
    expect(buildEntry('inflight-set', d, 1)!.data).toEqual({ stamp: 5 })
  })

  it('継承されたプロパティ（own でない）は読まない', () => {
    const parent = { stamp: 5 }
    const child = Object.create(parent)
    expect(buildEntry('inflight-set', child, 1)!.data).toEqual({})
  })
})

describe('buildEntry: 悪意ある値の総当たり', () => {
  const malicious: unknown[] = [
    'ghp_SECRET',
    'secret/repo',
    'SECRET_TITLE',
    'notes/SECRET.md',
    '<script>alert(1)</script>',
    '"; DROP TABLE x;--',
    { toString: () => 'ghp_SECRET' },
    ['ghp_SECRET'],
    Symbol('s'),
    10n,
    () => 'ghp_SECRET',
    NaN,
    Infinity,
    -0,
    1.5,
    'true',
    undefined,
    null,
    true,
    0,
  ]
  it('全 kind × 全キー × 悪意ある値でも、出力の全値は string|number|boolean|null で秘匿文字列を含まない', () => {
    for (const kind of kinds) {
      for (const key of Object.keys(spec[kind])) {
        for (const m of malicious) {
          const e = buildEntry(kind, { [key]: m }, 1)!
          for (const v of Object.values(e.data)) {
            expect(['string', 'number', 'boolean'].includes(typeof v) || v === null).toBe(true)
          }
          const json = JSON.stringify(e)
          expect(json).not.toContain('ghp_')
          expect(json).not.toContain('SECRET')
          expect(json).not.toContain('secret/')
          expect(json).not.toContain('<script>')
        }
      }
    }
  })

  it('全キーに同時に悪意ある値を入れても秘匿文字列は出ない', () => {
    for (const kind of kinds) {
      const data: Record<string, unknown> = {}
      for (const key of Object.keys(spec[kind])) data[key] = 'ghp_SECRET notes/SECRET.md'
      const json = JSON.stringify(buildEntry(kind, data, 1))
      expect(json).not.toContain('ghp_')
      expect(json).not.toContain('SECRET')
    }
  })
})
