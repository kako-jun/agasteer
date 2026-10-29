/**
 * docs/development/bug-report.md の種別表と DIAG_SCHEMA の一致を検証する（#317）。
 * 表の書式には最小限だけ依存する: 行頭が "| `種別` |" の行を種別行とみなし、
 * 2 列目の `キー`( の並びをキー名として抽出する。
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DIAG_SCHEMA } from './schema'

const md = readFileSync(resolve(process.cwd(), 'docs/development/bug-report.md'), 'utf8')

const rows = new Map<string, string[]>()
for (const line of md.split('\n')) {
  const m = line.match(/^\|\s*`([a-z][a-z-]*)`\s*\|([^|]*)\|/)
  if (!m) continue
  const keys = [...m[2].matchAll(/`([A-Za-z][A-Za-z0-9]*)`\(/g)].map((x) => x[1])
  rows.set(m[1], keys)
}

describe('bug-report.md と DIAG_SCHEMA の同期', () => {
  it('表に載る種別の集合が schema の種別集合と一致する', () => {
    expect([...rows.keys()].sort()).toEqual(Object.keys(DIAG_SCHEMA).sort())
  })

  it('各種別のキー名が schema と一致する', () => {
    const schema = DIAG_SCHEMA as unknown as Record<string, Record<string, unknown>>
    for (const [kind, keys] of rows) {
      expect(keys.sort(), kind).toEqual(Object.keys(schema[kind]).sort())
    }
  })
})
