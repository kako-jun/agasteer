/**
 * recordDiag（#317）: appendDiagEntry が（契約に反して）reject しても unhandledrejection を出さない
 *
 * 期待する正しい挙動。現状の record.ts は `void appendDiagEntry(entry)` で reject を握らないため落ちる
 * （実害は log-store が全体 try/catch で reject しない契約に依存。防御の一層が無い）。
 */
import { describe, expect, it, afterEach, vi } from 'vitest'

afterEach(() => {
  vi.doUnmock('./log-store')
  vi.restoreAllMocks()
})

describe('recordDiag: append の reject を外に出さない', () => {
  it('appendDiagEntry が reject しても unhandledrejection が発生しない', async () => {
    vi.resetModules()
    const unhandled = vi.fn()
    process.on('unhandledRejection', unhandled)
    try {
      // 注: vi.fn() は戻り値の Promise に then を付けて reject を握ってしまうため、素の関数を使う
      vi.doMock('./log-store', () => ({ appendDiagEntry: () => Promise.reject(new Error('x')) }))
      const { recordDiag } = await import('./record')
      recordDiag('inflight-set', { stamp: 1 })
      await new Promise((r) => setTimeout(r, 50))
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off('unhandledRejection', unhandled)
    }
  })
})
