import { describe, it, expect, beforeEach, vi } from 'vitest'
import type { Settings, StaleCheckResult } from '../types'

// stores: lastKnownCommitSha だけ参照される
const lastKnownCommitSha = { value: null as string | null }

// #317: 診断ログ記録の観測用
const diag = { recordDiag: vi.fn() }

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

vi.mock('../diagnostics/record', () => ({ recordDiag: diag.recordDiag }))

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
    diag.recordDiag.mockReset()
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

  it('push-hang: 本文に modal.pushHangRecovery を含み、stale-push と同じ並び（pull/push/cancel）', async () => {
    // #205: Push ハング復旧後の判断は専用 UI ではなく共通 3 択に寄せる。
    // ボタン配置は stale-push と同一（pullFirst primary / pushOverwrite secondary / cancel）。
    const staleResult: StaleCheckResult = {
      status: 'stale',
      localCommitSha: '4444444455',
      remoteCommitSha: '6666666677',
    }

    await showConflictDialog({
      kind: 'push-hang',
      staleResult,
      localPushCount: 9,
      settings,
    })

    const [body, options] = mocks.choiceAsync.mock.calls[0]
    expect(body).toContain('modal.pushHangRecovery')
    expect(body).toContain('localSha=4444444')
    expect(body).toContain('remoteSha=6666666')
    expect(body).toContain('localCount=9')
    expect(options).toHaveLength(3)
    expect(options.map((o: { value: string }) => o.value)).toEqual(['pull', 'push', 'cancel'])
    expect(options[0].label).toBe('modal.pullFirst')
    expect(options[1].label).toBe('modal.pushOverwrite')
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

  // ---- #317: バグレポート案内と診断ログ記録 ----

  it('#317: 4 kind すべてで本文の末尾に modal.conflictBugReportHint が付き、既存の本文も保たれる', async () => {
    const bodies: Record<string, string> = {
      'stale-push': 'modal.staleEdit',
      'pull-dirty': 'modal.unsavedChangesChoice',
      'startup-dirty': 'modal.unsavedChangesOnStartup',
      'push-hang': 'modal.pushHangRecovery',
    }
    for (const [kind, key] of Object.entries(bodies)) {
      mocks.choiceAsync.mockClear()
      await showConflictDialog({ kind: kind as any, localPushCount: 1, settings })
      const [body] = mocks.choiceAsync.mock.calls[0]
      expect(body).toContain(key)
      expect(body.endsWith('\n\nmodal.conflictBugReportHint')).toBe(true)
    }
  })

  it('#317: 4 kind すべてで conflict-dialog が dialogKind 付きで 1 回ずつ記録される', async () => {
    for (const kind of ['stale-push', 'pull-dirty', 'startup-dirty', 'push-hang'] as const) {
      diag.recordDiag.mockClear()
      await showConflictDialog({ kind: kind as any, localPushCount: 1, settings })
      expect(diag.recordDiag).toHaveBeenCalledTimes(1)
      expect(diag.recordDiag.mock.calls[0][0]).toBe('conflict-dialog')
      expect(diag.recordDiag.mock.calls[0][1].dialogKind).toBe(kind)
    }
  })

  it('#317: stale のとき localSha / remoteSha は staleResult の全桁 SHA', async () => {
    await showConflictDialog({
      kind: 'stale-push',
      staleResult: { status: 'stale', localCommitSha: 'aaaaaaaabb', remoteCommitSha: 'ccccccccdd' },
      localPushCount: 1,
      settings,
    })
    expect(diag.recordDiag).toHaveBeenCalledWith('conflict-dialog', {
      dialogKind: 'stale-push',
      localSha: 'aaaaaaaabb',
      remoteSha: 'ccccccccdd',
    })
  })

  it('#317: 非 stale のとき localSha は lastKnownCommitSha・remoteSha は null', async () => {
    lastKnownCommitSha.value = 'eeeeeeeeff'
    await showConflictDialog({ kind: 'pull-dirty', localPushCount: 1, settings })
    expect(diag.recordDiag).toHaveBeenCalledWith('conflict-dialog', {
      dialogKind: 'pull-dirty',
      localSha: 'eeeeeeeeff',
      remoteSha: null,
    })
  })

  it('#317: staleResult が up_to_date のときも remoteSha は null（誤った値を記録しない）', async () => {
    lastKnownCommitSha.value = null
    await showConflictDialog({
      kind: 'pull-dirty',
      staleResult: { status: 'up_to_date' } as StaleCheckResult,
      localPushCount: 1,
      settings,
    })
    expect(diag.recordDiag).toHaveBeenCalledWith('conflict-dialog', {
      dialogKind: 'pull-dirty',
      localSha: null,
      remoteSha: null,
    })
  })

  it('#317: ボタン構成は案内追加で増えない（stale-push は 3 択のまま）', async () => {
    await showConflictDialog({ kind: 'stale-push', localPushCount: 1, settings })
    expect(mocks.choiceAsync.mock.calls[0][1]).toHaveLength(3)
  })
})
