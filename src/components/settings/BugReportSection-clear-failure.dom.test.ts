// @vitest-environment jsdom
/**
 * BugReportSection（#317）: Clear 失敗時の表示（実装の不具合疑い: 失敗でも cleared と表示する）
 *
 * diagnostics の永続化層は差し替え、formatReport などの純粋層は実物を使う
 * （コピーされる全文＝実際の整形結果を検証するため）。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { DiagEntry } from '../../lib/diagnostics'

// vitest は svelte を server 条件で解決するため mount / onMount が使えない。
// クライアント実装を明示的に差し込む（svelte の exports には src/ が無いので node_modules への相対パスで import）。
vi.mock('svelte', async () => await import('../../../node_modules/svelte/src/index-client.js'))
const { mount, unmount, tick } = await import('svelte')

const store = vi.hoisted(() => ({
  entries: [] as any[],
  readImpl: null as null | (() => Promise<any[]>),
  clearImpl: null as null | (() => Promise<boolean>),
}))

vi.mock('../../lib/diagnostics', async () => {
  const format = await import('../../lib/diagnostics/format')
  return {
    readDiagEntries: vi.fn(() =>
      store.readImpl ? store.readImpl() : Promise.resolve([...store.entries])
    ),
    clearDiagEntries: vi.fn(async () => {
      if (store.clearImpl) return store.clearImpl()
      store.entries = []
      return true
    }),
    formatReport: format.formatReport,
    summarize: format.summarize,
    summarizeUserAgent: format.summarizeUserAgent,
  }
})

vi.mock('../../lib/i18n', () => ({
  _: {
    subscribe(
      run: (t: (key: string, opts?: { values?: Record<string, unknown> }) => string) => void
    ) {
      run((key, opts) =>
        opts?.values
          ? `${key}{${Object.entries(opts.values)
              .map(([k, v]) => `${k}=${v}`)
              .join(',')}}`
          : key
      )
      return () => {}
    },
  },
}))

const diagnostics = await import('../../lib/diagnostics')
const { default: BugReportSection } = await import('./BugReportSection.svelte')

function entry(i: number): DiagEntry {
  return {
    id: i,
    at: Date.UTC(2026, 0, 1, 0, 0, i),
    kind: 'inflight-set',
    data: { stamp: i },
  }
}

let target: HTMLElement
let comp: ReturnType<typeof mount>

async function render() {
  comp = mount(BugReportSection, { target })
  await tick()
  await vi.advanceTimersByTimeAsync(0)
  await tick()
}

const q = <T extends Element = HTMLElement>(sel: string) => target.querySelector<T>(sel)!
const copyBtn = () =>
  Array.from(target.querySelectorAll('button')).find(
    (b) => b.textContent!.includes('settings.bugReport.copy') && !b.textContent!.includes('Failed')
  )!
const clearBtn = () =>
  Array.from(target.querySelectorAll('button')).find((b) =>
    b.textContent!.includes('settings.bugReport.clear')
  )!
const status = () => q('.status').textContent!.trim()

beforeEach(() => {
  vi.useFakeTimers()
  store.entries = []
  store.readImpl = null
  store.clearImpl = null
  target = document.createElement('div')
  document.body.appendChild(target)
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  try {
    unmount(comp)
  } catch {}
  target.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

function stubClipboard(writeText: (t: string) => Promise<void>) {
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
}

describe('BugReportSection Clear 失敗', () => {
  it('Clear が失敗（false）したとき、ログは消えていないのに cleared と表示してはいけない', async () => {
    store.entries = [entry(1)]
    store.clearImpl = async () => false
    await render()
    clearBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    await vi.advanceTimersByTimeAsync(0)
    expect(target.textContent).toContain('settings.bugReport.summary{count=1')
    expect(status()).not.toBe('settings.bugReport.cleared')
  })
})
