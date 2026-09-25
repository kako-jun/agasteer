/**
 * 同期系フラグ（isPulling/isPushing/isPushingBackground/isArchiveLoading）の変化を
 * 待機者へ通知するための最小限のシグナル機構（#314 S1）。
 *
 * 従来 `restoreStateFromUrl()` の待機は 50ms 間隔のポーリングだった。これらの
 * フラグは Svelte ストアの `subscribe` を持たない `$state` の getter/setter
 * （core-state.svelte.ts の isPulling/isPushing/isPushingBackground、
 * app-state.svelte.ts の isArchiveLoading）で、変化を購読する既存の仕組みがない。
 *
 * このモジュールはその setter から呼ぶ `notifySyncActivityChanged()` と、次の
 * 通知まで待つだけの `waitForSyncActivityChange()` を提供する。「何を busy と
 * 見なすか」（どのフラグを見るか）の判断はここでは持たず、呼び出し側
 * （pane-navigation-url-restore.svelte.ts の waitForSyncIdle）の責務にする。
 *
 * 循環 import を避けるため、このモジュールは他の stores/app-state を一切
 * import しない独立した末端レイヤーに保つこと。
 */

type Waiter = () => void

const waiters = new Set<Waiter>()

/** 対象フラグの setter から呼ぶ。待機中のすべての waiter を1回だけ起こす。 */
export function notifySyncActivityChanged(): void {
  if (waiters.size === 0) return
  const toResolve = [...waiters]
  waiters.clear()
  for (const resolve of toResolve) resolve()
}

/** 次の notifySyncActivityChanged() 呼び出しまで待つ。ポーリングしない。 */
export function waitForSyncActivityChange(): Promise<void> {
  return new Promise((resolve) => {
    waiters.add(resolve)
  })
}
