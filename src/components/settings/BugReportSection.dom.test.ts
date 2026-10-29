// @vitest-environment jsdom
/**
 * BugReportSection（#317）: 診断ログの表示・コピー・消去
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

/** コピーボタンを押し、clipboard.writeText に渡された文字列を返す（画面には内容を出さないため） */
async function copied(): Promise<string> {
  const write = vi.fn(async (_t: string) => {})
  stubClipboard(write)
  copyBtn().click()
  await vi.advanceTimersByTimeAsync(0)
  await tick()
  expect(write).toHaveBeenCalledTimes(1)
  return write.mock.calls[0][0]
}

describe('BugReportSection 表示', () => {
  it('0 件: 要約行も「まだ記録はありません」も出ず、Clear は disabled', async () => {
    await render()
    expect(target.textContent).not.toContain('settings.bugReport.summary')
    expect(target.textContent).not.toContain('summaryEmpty')
    expect(target.textContent).not.toContain('まだ記録はありません')
    expect(target.querySelector('.meta')).toBeNull()
    expect(clearBtn().disabled).toBe(true)
  })

  it('0 件: textarea も details も出さない', async () => {
    await render()
    expect(target.querySelector('textarea')).toBeNull()
    expect(target.querySelector('details')).toBeNull()
  })

  it('0 件でも見出し・説明・ボタンは出る', async () => {
    await render()
    expect(target.textContent).toContain('settings.bugReport.title')
    expect(target.textContent).toContain('settings.bugReport.description')
    expect(copyBtn()).toBeTruthy()
  })

  it('削除した説明ブロック（記録するもの・しないもの・使い方・上限）は出ない', async () => {
    store.entries = [entry(1)]
    await render()
    for (const k of [
      'recordedTitle',
      'recorded',
      'notRecordedTitle',
      'notRecorded',
      'howToTitle',
      'howTo',
      'limit',
      'previewTitle',
    ]) {
      expect(target.textContent).not.toContain(`settings.bugReport.${k}`)
    }
  })

  it('N 件: サマリに件数が出て、details も textarea も無く、Clear が有効', async () => {
    store.entries = [entry(1), entry(2), entry(3)]
    await render()
    expect(target.textContent).toContain('settings.bugReport.summary{count=3')
    expect(target.querySelector('.meta')).not.toBeNull()
    expect(target.querySelector('details')).toBeNull()
    expect(target.querySelector('textarea')).toBeNull()
    expect(target.textContent).not.toContain('previewSummary')
    expect(clearBtn().disabled).toBe(false)
  })

  it('N 件: コピーされる内容に件数と記録が入っている', async () => {
    store.entries = [entry(1), entry(2), entry(3)]
    await render()
    const text = await copied()
    expect(text).toContain('entries: 3')
    expect(text).toContain('inflight-set stamp=1')
    expect(text).toContain('inflight-set stamp=3')
  })

  it('画面にバージョン・端末の行は出ないが、コピーされる全文のヘッダには入っている', async () => {
    store.entries = [entry(1)]
    await render()
    for (const text of [
      'settings.bugReport.appVersion',
      'settings.bugReport.device',
      'アプリのバージョン',
      '端末:',
      'App version',
      'Device:',
    ]) {
      expect(target.textContent).not.toContain(text)
    }
    const lines = (await copied()).split('\n')
    expect(lines.some((l) => l.startsWith('app: '))).toBe(true)
    expect(lines.some((l) => l.startsWith('device: '))).toBe(true)
  })

  it('読み込み失敗（read が空配列を返す）でもクラッシュせず 0 件表示', async () => {
    store.readImpl = async () => []
    await render()
    expect(target.textContent).not.toContain('settings.bugReport.summary')
    expect(target.querySelector('.meta')).toBeNull()
  })

  it('settings に token 等があっても コピー内容にも画面にも含まれない（コンポーネントは settings を読まない）', async () => {
    ;(globalThis as any).localStorage?.setItem?.(
      'agasteer',
      JSON.stringify({ settings: { token: 'ghp_SECRET', repoName: 'secret/repo' } })
    )
    store.entries = [entry(1)]
    await render()
    const all = (await copied()) + target.textContent
    expect(all).not.toContain('ghp_SECRET')
    expect(all).not.toContain('secret/repo')
  })
})

describe('BugReportSection Copy', () => {
  it('Copy は clipboard.writeText を formatReport と同じ文字列で呼び、copied 表示を出す', async () => {
    store.entries = [entry(1), entry(2)]
    await render()
    const text = await copied()
    expect(text).toBe(
      diagnostics.formatReport(store.entries, {
        appVersion: text.split('\n')[1].slice(5),
        device: text.split('\n')[2].slice(8),
      })
    )
    expect(text).toContain('app: ')
    expect(text).toContain('device: ')
    expect(status()).toBe('settings.bugReport.copied')
  })

  it('clipboard が reject なら copyFailed 表示で、投げない', async () => {
    stubClipboard(async () => {
      throw new Error('denied')
    })
    await render()
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(status()).toBe('settings.bugReport.copyFailed')
  })

  it('navigator.clipboard が未定義でも copyFailed 表示で、投げない', async () => {
    Object.defineProperty(navigator, 'clipboard', { value: undefined, configurable: true })
    await render()
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(status()).toBe('settings.bugReport.copyFailed')
  })

  it('表示は 3 秒後に消える', async () => {
    stubClipboard(async () => {})
    await render()
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(status()).toBe('settings.bugReport.copied')
    await vi.advanceTimersByTimeAsync(3000)
    await tick()
    expect(status()).toBe('')
  })

  it('Copy 連打: 最後の操作から 3 秒で消え、表示が壊れない', async () => {
    stubClipboard(async () => {})
    await render()
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2000)
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    await vi.advanceTimersByTimeAsync(2000) // 最初の操作から 4 秒後 / 2 回目から 2 秒後
    await tick()
    expect(status()).toBe('settings.bugReport.copied')
    await vi.advanceTimersByTimeAsync(1000)
    await tick()
    expect(status()).toBe('')
  })

  it('Copy 成功後に失敗しても、最新の状態だけが表示される', async () => {
    const write = vi.fn(async () => {})
    stubClipboard(write)
    await render()
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    write.mockRejectedValueOnce(new Error('x'))
    copyBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    expect(status()).toBe('settings.bugReport.copyFailed')
  })
})

describe('BugReportSection Clear', () => {
  it('Clear で 0 件に戻り、cleared 表示が出る', async () => {
    store.entries = [entry(1), entry(2)]
    await render()
    clearBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    await vi.advanceTimersByTimeAsync(0)
    expect(diagnostics.clearDiagEntries).toHaveBeenCalledTimes(1)
    expect(target.textContent).not.toContain('settings.bugReport.summary')
    expect(target.querySelector('.meta')).toBeNull()
    expect(target.querySelector('textarea')).toBeNull()
    expect(status()).toBe('settings.bugReport.cleared')
    expect(clearBtn().disabled).toBe(true)
  })

  it('Clear 連打でも 0 件のまま壊れない', async () => {
    store.entries = [entry(1)]
    await render()
    clearBtn().click()
    clearBtn().click()
    await vi.advanceTimersByTimeAsync(0)
    await tick()
    await vi.advanceTimersByTimeAsync(0)
    expect(target.textContent).not.toContain('settings.bugReport.summary')
    expect(target.querySelector('.meta')).toBeNull()
  })
})
