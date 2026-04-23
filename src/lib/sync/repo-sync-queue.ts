export interface RepoSyncActivityState {
  isPulling: boolean
  isPushing: boolean
  isArchiveLoading: boolean
}

export function isRepoSyncBusy(state: RepoSyncActivityState): boolean {
  return state.isPulling || state.isPushing || state.isArchiveLoading
}

export function shouldQueueRepoSync(
  state: RepoSyncActivityState,
  hasValidConfig: boolean
): boolean {
  return hasValidConfig && isRepoSyncBusy(state)
}

export function canRunPendingRepoSync(
  state: RepoSyncActivityState,
  hasValidConfig: boolean,
  pendingRepoSync: boolean
): boolean {
  return pendingRepoSync && hasValidConfig && !isRepoSyncBusy(state)
}

export async function runPendingRepoSyncIfIdle(
  state: RepoSyncActivityState,
  hasValidConfig: boolean,
  pendingRepoSync: boolean,
  clearPendingRepoSync: () => void,
  triggerPull: () => Promise<void>
): Promise<boolean> {
  if (!canRunPendingRepoSync(state, hasValidConfig, pendingRepoSync)) {
    return false
  }

  clearPendingRepoSync()
  await triggerPull()
  return true
}
