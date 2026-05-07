import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Settings, StaleCheckResult } from '../types'

// stores: lastKnownCommitSha だけ参照される
const lastKnownCommitSha = { value: null as string | null }

const mocks = {
  fetchRemotePushCount: vi.fn(),
  choiceAsync: vi.fn(),
}

vi.mock('../stores', () => ({
  lastKnownCommitSha,
}))

vi.mock('../api', () => ({
  fetchRemotePushCount: mocks.fetchRemotePushCount,
}))

vi.mock('../ui', () => ({
  choiceAsync: mocks.choiceAsync,
}))

vi.mock('../ui/icons', () => ({
  PULL_ICON: 'PULL_ICON',
  PUSH_ICON: 'PUSH_ICON',
}))

vi.mock('../i18n', () => ({
  _: {
    subscribe(
      run: (translate: (key: string, opts?: { values?: Record<string, unknown> }) => string) => void
    ) {
      run((key, opts) => {
        if (!opts?.values) return key
        // 値が出力に乗ることを検証できるように、values を直列化して連結する
        const valuesStr = Object.entries(opts.values)
          .map(([k, v]) => `${k}=${v}`)
          .join(',')
        return `${key}{${valuesStr}}`
      })
      return () => {}
    },
  },
}))

const { showConflictDialog } = await import('./conflict-dialog')

const settings = {} as Settings

describe('showConflictDialog', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    lastKnownCommitSha.value = null
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'success', pushCount: 7 })
    mocks.choiceAsync.mockResolvedValue('cancel')
  })

  it('stale-push: 本文に modal.staleEdit と diagnostic（local/remote SHA + pushCount）を含める', async () => {
    const staleResult: StaleCheckResult = {
      status: 'stale',
      localCommitSha: 'aaaaaaaabb',
      remoteCommitSha: 'ccccccccdd',
    }

    await showConflictDialog({
      kind: 'stale-push',
      staleResult,
      localPushCount: 3,
      settings,
    })

    expect(mocks.choiceAsync).toHaveBeenCalledTimes(1)
    const [body, options] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.staleEdit')
    expect(body).toContain('localSha=aaaaaaa') // shortSha
    expect(body).toContain('remoteSha=ccccccc')
    expect(body).toContain('localCount=3')
    expect(body).toContain('remoteCount=7')
    // 3 ボタン: pullFirst / pushOverwrite / cancel
    expect(options).toHaveLength(3)
    expect(options.map((o: { value: string }) => o.value)).toEqual(['pull', 'push', 'cancel'])
    expect(options[0].label).toBe('modal.pullFirst')
    expect(options[1].label).toBe('modal.pushOverwrite')
  })

  it('pull-dirty: staleResult なしのときは remote SHA を ? で表示する', async () => {
    lastKnownCommitSha.value = 'eeeeeeeeff'

    await showConflictDialog({
      kind: 'pull-dirty',
      localPushCount: 2,
      settings,
    })

    const [body, options] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.unsavedChangesChoice')
    expect(body).toContain('localSha=eeeeeee')
    expect(body).toContain('remoteSha=?')
    expect(body).toContain('localCount=2')
    expect(body).toContain('remoteCount=7')
    expect(options.map((o: { value: string }) => o.value)).toEqual(['pull', 'push', 'cancel'])
    expect(options[0].label).toBe('modal.pullOverwrite')
    expect(options[1].label).toBe('modal.pushFirst')
  })

  it('pull-dirty: stale な staleResult が渡されたときは remote SHA を流用する', async () => {
    const staleResult: StaleCheckResult = {
      status: 'stale',
      localCommitSha: '1111111122',
      remoteCommitSha: '3333333344',
    }

    await showConflictDialog({
      kind: 'pull-dirty',
      staleResult,
      localPushCount: 1,
      settings,
    })

    const [body] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('localSha=1111111')
    expect(body).toContain('remoteSha=3333333')
  })

  it('startup-dirty + disablePush=true: push ボタンを生成しない（2択）', async () => {
    await showConflictDialog({
      kind: 'startup-dirty',
      localPushCount: 0,
      settings,
      disablePush: true,
    })

    const [body, options] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.unsavedChangesOnStartup')
    expect(options).toHaveLength(2)
    expect(options.map((o: { value: string }) => o.value)).toEqual(['pull', 'cancel'])
  })

  it('fetchRemotePushCount が失敗したら remoteCount を ? にフォールバックする', async () => {
    mocks.fetchRemotePushCount.mockResolvedValue({ status: 'error', reason: 'rate-limit' })

    await showConflictDialog({
      kind: 'stale-push',
      staleResult: {
        status: 'stale',
        localCommitSha: 'aaaa',
        remoteCommitSha: 'bbbb',
      },
      localPushCount: 5,
      settings,
    })

    const [body] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('remoteCount=?')
    expect(body).toContain('localCount=5')
  })

  it('staleResult.status が up_to_date のときは remote SHA を ? で表示する（誤った値を出さない）', async () => {
    lastKnownCommitSha.value = '9999999900'

    await showConflictDialog({
      kind: 'pull-dirty',
      staleResult: { status: 'up_to_date' },
      localPushCount: 4,
      settings,
    })

    const [body] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('localSha=9999999')
    expect(body).toContain('remoteSha=?')
  })

  it('localCommitSha が null のときは "null" 文字列で表示する', async () => {
    lastKnownCommitSha.value = null

    await showConflictDialog({
      kind: 'pull-dirty',
      localPushCount: 0,
      settings,
    })

    const [body] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('localSha=null')
  })

  it('choiceAsync の戻り値をそのまま返す', async () => {
    mocks.choiceAsync.mockResolvedValue('pull')

    const result = await showConflictDialog({
      kind: 'stale-push',
      staleResult: {
        status: 'stale',
        localCommitSha: 'a',
        remoteCommitSha: 'b',
      },
      localPushCount: 1,
      settings,
    })

    expect(result).toBe('pull')
  })
})
