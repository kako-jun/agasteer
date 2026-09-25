// @vitest-environment jsdom
/**
 * stores/sync-signal.ts のテスト（#314 S2）。
 *
 * これまで restoreStateFromUrl 側のテスト（pane-navigation-restore-archive-lock.test.ts
 * 等）は毎回 `vi.mock('./stores/sync-signal', ...)` でこのモジュールをフェイクに
 * 差し替えていたため、notifySyncActivityChanged()/waitForSyncActivityChange() 自体の
 * 配線（wait→notifyで解決する・notify後waiterが空になる）と、isPulling/isPushing/
 * isPushingBackground/appState.isArchiveLoading の setter が実際にこの本物の
 * notifySyncActivityChanged() を呼ぶことは、どのテストでも本物経由で検証されて
 * いなかった。
 *
 * このファイルは sync-signal.ts 自体の単体テスト（(a)）と、対象4フラグの本物の
 * setter に代入したときに waitForSyncActivityChange() が実際に解決することを
 * 確認する結線テスト（(b)）を持つ。(b) は core-state.svelte.ts / app-state.svelte.ts を
 * vi.mock せず本物を import する（フェイクだと setter 内の
 * notifySyncActivityChanged() 呼び出し自体を検証できないため）。
 */

import { beforeEach, describe, expect, it, vi } from 'vitest'

// #314 S2b: appState.isArchiveLoading の実 setter を確認するには app-state.svelte.ts を
// 本物で import する必要があるが、この本物は '../main'（src/main.ts、PWA の
// service worker チェック）を非 type import しており、main.ts はモジュール
// トップレベルで Svelte の mount() を呼ぶ（ブラウザの実エントリポイント）。
// テスト環境ではこの mount() が失敗する（"mount(...) is not available on the
// server"）ため、'../main' だけをフェイクにして回避する。isArchiveLoading の
// setter 自体・呼び出す notifySyncActivityChanged（'./sync-signal'）は本物のまま。
vi.mock('../../main', () => ({
  waitForSwCheck: vi.fn(async () => {}),
}))

// app-state.svelte.ts は module-level で window.matchMedia（isPWAStandalone 検出）を
// 評価する。jsdom には無いため、動的 import より前にトップレベルで用意しておく
// （app-state-heartbeat.svelte.test.ts と同じ理由・同じ対処）。
if (typeof (globalThis as { matchMedia?: unknown }).matchMedia !== 'function') {
  ;(globalThis as { matchMedia?: unknown }).matchMedia = () => ({
    matches: false,
    addEventListener() {},
    removeEventListener() {},
  })
}

describe('sync-signal.ts 単体（#314 S2a）', () => {
  beforeEach(() => {
    // モジュールの waiters Set はモジュールスコープに閉じているため、テスト間で
    // 汚染しないよう毎回 resetModules する。
  })

  it('waitForSyncActivityChange() は次の notifySyncActivityChanged() 呼び出しで解決する', async () => {
    const { notifySyncActivityChanged, waitForSyncActivityChange } = await import('./sync-signal')

    let resolved = false
    const p = waitForSyncActivityChange().then(() => {
      resolved = true
    })

    // notify 前はまだ解決しない
    await Promise.resolve()
    await Promise.resolve()
    expect(resolved).toBe(false)

    notifySyncActivityChanged()
    await p

    expect(resolved).toBe(true)
  })

  it('notify 後は waiter が空になり、次の notify では起こされない（前回の waiter が2回起きない）', async () => {
    const { notifySyncActivityChanged, waitForSyncActivityChange } = await import('./sync-signal')

    let resolveCount = 0
    void waitForSyncActivityChange().then(() => {
      resolveCount++
    })

    notifySyncActivityChanged()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolveCount).toBe(1)

    // waiter が既に空なので、ここでの notify は誰も起こさない（no-op）。
    notifySyncActivityChanged()
    await Promise.resolve()
    await Promise.resolve()
    expect(resolveCount).toBe(1)
  })

  it('複数の waiter がいる場合、1回の notify で全員が起きる', async () => {
    const { notifySyncActivityChanged, waitForSyncActivityChange } = await import('./sync-signal')

    let count = 0
    const waiters = [
      waitForSyncActivityChange().then(() => count++),
      waitForSyncActivityChange().then(() => count++),
      waitForSyncActivityChange().then(() => count++),
    ]

    notifySyncActivityChanged()
    await Promise.all(waiters)

    expect(count).toBe(3)
  })
})

describe('sync-signal.ts の本物の setter 結線（#314 S2b: vi.mock なしで実配線を確認）', () => {
  it('isPulling.value への代入で waitForSyncActivityChange() が解決する', async () => {
    const { isPulling } = await import('./core-state.svelte')
    const { waitForSyncActivityChange } = await import('./sync-signal')

    let resolved = false
    const p = waitForSyncActivityChange().then(() => {
      resolved = true
    })

    isPulling.value = true
    await p

    expect(resolved).toBe(true)
    isPulling.value = false
  })

  it('isPushing.value への代入で waitForSyncActivityChange() が解決する', async () => {
    const { isPushing } = await import('./core-state.svelte')
    const { waitForSyncActivityChange } = await import('./sync-signal')

    let resolved = false
    const p = waitForSyncActivityChange().then(() => {
      resolved = true
    })

    isPushing.value = true
    await p

    expect(resolved).toBe(true)
    isPushing.value = false
  })

  it('isPushingBackground.value への代入で waitForSyncActivityChange() が解決する', async () => {
    const { isPushingBackground } = await import('./core-state.svelte')
    const { waitForSyncActivityChange } = await import('./sync-signal')

    let resolved = false
    const p = waitForSyncActivityChange().then(() => {
      resolved = true
    })

    isPushingBackground.value = true
    await p

    expect(resolved).toBe(true)
    isPushingBackground.value = false
  })

  it('appState.isArchiveLoading への代入で waitForSyncActivityChange() が解決する', async () => {
    const { appState } = await import('../app-state.svelte')
    const { waitForSyncActivityChange } = await import('./sync-signal')

    let resolved = false
    const p = waitForSyncActivityChange().then(() => {
      resolved = true
    })

    appState.isArchiveLoading = true
    await p

    expect(resolved).toBe(true)
    appState.isArchiveLoading = false
  })
})
