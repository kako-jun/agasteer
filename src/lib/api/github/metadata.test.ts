import { describe, expect, it } from 'vitest'

import type { Metadata } from '../../types'

// metadata.ts は PRIORITY_LEAF_ID を ../../utils から取り込み、その連鎖で
// storage.ts が module 評価時に localStorage を触る。characterization テストと
// 同じく import 前に localStorage をスタブしておく（純関数の検証には無関係）。
const storageBacking = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void storageBacking.set(k, v),
  removeItem: (k: string) => void storageBacking.delete(k),
  clear: () => storageBacking.clear(),
  key: (i: number) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size
  },
}

const { normalizeMetadata, stableStringify, detectChanges, normalizePulledMetadata } =
  await import('./metadata')

// PRIORITY_LEAF_ID の実値（../../utils）。normalizeMetadata が updatedAt=0 に固定する対象。
const PRIORITY_LEAF_ID = '__priority__'

const makeMeta = (over: Partial<Metadata> = {}): Metadata => ({
  version: 1,
  notes: {},
  leaves: {},
  pushCount: 0,
  ...over,
})

describe('stableStringify', () => {
  it('is independent of key insertion order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('drops undefined-valued keys', () => {
    expect(stableStringify({ a: 1, b: undefined })).toBe('{"a":1}')
  })

  it('serializes primitives and arrays like JSON', () => {
    expect(stableStringify(null)).toBe('null')
    expect(stableStringify(3)).toBe('3')
    expect(stableStringify('x')).toBe('"x"')
    expect(stableStringify([2, 1])).toBe('[2,1]')
  })

  it('recurses stably into nested objects', () => {
    const a = { outer: { z: 1, a: 2 } }
    const b = { outer: { a: 2, z: 1 } }
    expect(stableStringify(a)).toBe(stableStringify(b))
  })
})

describe('normalizeMetadata', () => {
  it('sorts note and leaf keys for a stable output', () => {
    const meta = makeMeta({
      notes: {
        b: { id: 'nb', order: 1 },
        a: { id: 'na', order: 0 },
      },
      leaves: {
        y: { id: 'ly', updatedAt: 10, order: 1 },
        x: { id: 'lx', updatedAt: 5, order: 0 },
      },
    })
    const n = normalizeMetadata(meta)
    expect(Object.keys(n.notes)).toEqual(['a', 'b'])
    expect(Object.keys(n.leaves)).toEqual(['x', 'y'])
  })

  it('keeps id/order and preserves badge fields only when defined', () => {
    const meta = makeMeta({
      notes: {
        a: { id: 'na', order: 0, badgeIcon: 'star', badgeColor: 'red' },
        b: { id: 'nb', order: 1 },
      },
    })
    const n = normalizeMetadata(meta)
    expect(n.notes.a).toEqual({ id: 'na', order: 0, badgeIcon: 'star', badgeColor: 'red' })
    expect(n.notes.b).toEqual({ id: 'nb', order: 1 })
    expect('badgeIcon' in n.notes.b).toBe(false)
  })

  it('pins __priority__ leaf updatedAt to 0 but keeps others', () => {
    const meta = makeMeta({
      leaves: {
        [PRIORITY_LEAF_ID]: { id: 'p', updatedAt: 9999, order: 0 },
        normal: { id: 'nrm', updatedAt: 42, order: 1 },
      },
    })
    const n = normalizeMetadata(meta)
    expect(n.leaves[PRIORITY_LEAF_ID].updatedAt).toBe(0)
    expect(n.leaves.normal.updatedAt).toBe(42)
  })

  it('applies pushCountOverride and defaults version/pushCount', () => {
    const n = normalizeMetadata({ notes: {}, leaves: {} } as unknown as Metadata, 7)
    expect(n.version).toBe(1)
    expect(n.pushCount).toBe(7)
    const d = normalizeMetadata(makeMeta({ pushCount: 3 }))
    expect(d.pushCount).toBe(3)
  })

  it('produces stringify-stable output regardless of source key order', () => {
    const a = makeMeta({ notes: { b: { id: 'b', order: 1 }, a: { id: 'a', order: 0 } } })
    const b = makeMeta({ notes: { a: { id: 'a', order: 0 }, b: { id: 'b', order: 1 } } })
    expect(stableStringify(normalizeMetadata(a))).toBe(stableStringify(normalizeMetadata(b)))
  })
})

describe('normalizePulledMetadata', () => {
  it('fills defaults for a fully populated object', () => {
    const parsed = { version: 2, notes: { a: { id: 'a', order: 0 } }, leaves: {}, pushCount: 5 }
    expect(normalizePulledMetadata(parsed)).toEqual(parsed)
  })

  it('applies defaults for missing fields', () => {
    expect(normalizePulledMetadata({})).toEqual({
      version: 1,
      notes: {},
      leaves: {},
      pushCount: 0,
    })
  })

  it('throws on null / undefined input (元インライン実装の parsed.version 直読みと等価)', () => {
    // 旧実装は JSON.parse 結果に対し parsed.version を直読みしていたため、
    // リテラル null（JSON.parse('null')）や undefined ではプロパティ参照で throw し、
    // 呼び出し側 fetch 層の try/catch が warn + defaults に落としていた。
    // ここで握り潰すと warn 経路が消えるため、純移動として throw を保存する。
    expect(() => normalizePulledMetadata(null)).toThrow()
    expect(() => normalizePulledMetadata(undefined)).toThrow()
  })

  it('coerces falsy version/pushCount (0) to defaults, matching || semantics', () => {
    const r = normalizePulledMetadata({ version: 0, pushCount: 0, notes: {}, leaves: {} })
    expect(r.version).toBe(1)
    expect(r.pushCount).toBe(0)
  })
})

describe('detectChanges', () => {
  const base = () => ({
    existingMetadata: makeMeta(),
    metadata: makeMeta(),
    currentPushCount: 3,
    changedHomeLeafPaths: [] as string[],
    changedArchiveLeafPaths: [] as string[],
    isArchiveLoaded: false,
    archiveNotes: undefined,
    archiveLeaves: undefined,
    archiveMeta: undefined as Metadata | undefined,
    existingArchiveMetadata: makeMeta(),
  })

  it('reports no changes when everything is identical', () => {
    const r = detectChanges(base())
    expect(r).toEqual({
      metadataChanged: false,
      archiveMetadataChanged: false,
      leafChanged: false,
      hasAnyChanges: false,
    })
  })

  it('ignores pushCount differences (comparison excludes increment)', () => {
    const input = base()
    input.existingMetadata = makeMeta({ pushCount: 1 })
    input.metadata = makeMeta({ pushCount: 99 })
    expect(detectChanges(input).metadataChanged).toBe(false)
  })

  it('detects home metadata change', () => {
    const input = base()
    input.metadata = makeMeta({ notes: { a: { id: 'a', order: 0 } } })
    const r = detectChanges(input)
    expect(r.metadataChanged).toBe(true)
    expect(r.hasAnyChanges).toBe(true)
  })

  it('detects leaf change via changed home paths', () => {
    const input = base()
    input.changedHomeLeafPaths = ['x.md']
    const r = detectChanges(input)
    expect(r.leafChanged).toBe(true)
    expect(r.hasAnyChanges).toBe(true)
  })

  it('detects leaf change via changed archive paths', () => {
    const input = base()
    input.changedArchiveLeafPaths = ['a/y.md']
    expect(detectChanges(input).leafChanged).toBe(true)
  })

  it('detects archive metadata change only when archive is loaded', () => {
    const input = base()
    input.existingArchiveMetadata = makeMeta()
    input.archiveMeta = makeMeta({ notes: { a: { id: 'a', order: 0 } } })
    input.archiveNotes = []
    input.archiveLeaves = []

    // ロードされていない → archive 差分は無視
    input.isArchiveLoaded = false
    expect(detectChanges(input).archiveMetadataChanged).toBe(false)

    // ロード済み → 差分を検出
    input.isArchiveLoaded = true
    const r = detectChanges(input)
    expect(r.archiveMetadataChanged).toBe(true)
    expect(r.hasAnyChanges).toBe(true)
  })

  it('compares archive metadata with pushCount forced to 0 (asymmetry preserved)', () => {
    const input = base()
    input.isArchiveLoaded = true
    input.archiveNotes = []
    input.archiveLeaves = []
    input.existingArchiveMetadata = makeMeta({ pushCount: 4 })
    input.archiveMeta = makeMeta({ pushCount: 8 })
    // pushCount 差のみ → archive は常に 0 で比較するので変化なし
    expect(detectChanges(input).archiveMetadataChanged).toBe(false)
  })
})
