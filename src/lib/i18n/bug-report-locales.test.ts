/**
 * バグレポート関連 i18n キー（#317）の ja / en 整合テスト
 */
import { describe, expect, it } from 'vitest'
import ja from './locales/ja.json'
import en from './locales/en.json'

function get(obj: any, path: string): unknown {
  return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), obj)
}
function flatten(obj: any, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(obj)) {
    const p = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object') Object.assign(out, flatten(v, p))
    else out[p] = String(v)
  }
  return out
}
const placeholders = (s: string) => Array.from(s.matchAll(/\{(\w+)\}/g), (m) => m[1]).sort()

const bugReportKeys = Object.keys(flatten((en as any).settings.bugReport)).map(
  (k) => `settings.bugReport.${k}`
)
const allKeys = [...bugReportKeys, 'modal.conflictBugReportHint']

describe('バグレポートの i18n キー', () => {
  it('settings.bugReport.* が en に存在する（検出元）', () => {
    expect(bugReportKeys.length).toBeGreaterThanOrEqual(9)
  })

  it('ja の settings.bugReport.* は en と同じキー集合', () => {
    const jaKeys = Object.keys(flatten((ja as any).settings.bugReport)).map(
      (k) => `settings.bugReport.${k}`
    )
    expect(jaKeys.sort()).toEqual([...bugReportKeys].sort())
  })

  it.each(allKeys)('%s は ja / en の両方に非空の文字列がある', (key) => {
    for (const [name, loc] of [
      ['ja', ja],
      ['en', en],
    ] as const) {
      const v = get(loc, key)
      expect(typeof v, `${name}:${key}`).toBe('string')
      expect((v as string).trim().length, `${name}:${key}`).toBeGreaterThan(0)
    }
  })

  it.each(allKeys)('%s のプレースホルダは ja / en で一致する', (key) => {
    expect(placeholders(get(ja, key) as string)).toEqual(placeholders(get(en, key) as string))
  })

  it('summary は {count} {from} {to} を ja / en の両方で持つ', () => {
    for (const loc of [ja, en]) {
      expect(placeholders(get(loc, 'settings.bugReport.summary') as string)).toEqual([
        'count',
        'from',
        'to',
      ])
    }
  })

  it('画面から外した説明キーが残っていない', () => {
    for (const loc of [ja, en]) {
      const keys = Object.keys((loc as any).settings.bugReport)
      for (const k of [
        'recordedTitle',
        'recorded',
        'notRecordedTitle',
        'notRecorded',
        'howToTitle',
        'howTo',
        'limit',
        'previewTitle',
        'appVersion',
        'device',
        'summaryEmpty',
        'previewSummary',
      ]) {
        expect(keys).not.toContain(k)
      }
    }
  })
})
