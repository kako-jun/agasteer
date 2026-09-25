/**
 * LocalStorage/IndexedDB永続化の副作用（#300）
 *
 * stores.svelte.ts から分離。isDirty / lastKnownCommitSha / metadata /
 * lastPulledPushCount の変化を $effect で監視し、永続化ストレージへ書き戻す。
 * core-state.svelte.ts への一方向 import のみを持つ（循環 import 回避）。
 */

import {
  setPersistedDirtyFlag,
  getPersistedDirtyFlag as getPersistedDirtyFlagFromStorage,
  setPersistedCommitSha,
  setPersistedLastPulledPushCount,
} from '../data/storage'
// #295 S4: metadata 永続化はstorage.tsから分離済み
import { setPersistedMetadata } from '../data/metadata-storage'
import { isDirty, lastKnownCommitSha, metadata, lastPulledPushCount } from './core-state.svelte'

// リポジトリ切替中は in-memory への一時的な代入が localStorage に
// 書き戻されないようにするためのガード。rehydrateForRepo が true/false
// をセットする。読み取り時はリアクティブ依存を作らないよう素の変数を使う。
let isRehydrating = false

export function setRehydrating(v: boolean): void {
  isRehydrating = v
}

// LocalStorage永続化のための副作用初期化
export function initStoreEffects(): () => void {
  return $effect.root(() => {
    // isDirty → LocalStorage永続化
    $effect(() => {
      const value = isDirty.value
      if (isRehydrating) return
      setPersistedDirtyFlag(value)
    })
    // lastKnownCommitSha → LocalStorage永続化
    $effect(() => {
      const value = lastKnownCommitSha.value
      if (isRehydrating) return
      setPersistedCommitSha(value)
    })
    // metadata → IndexedDB永続化
    $effect(() => {
      const value = metadata.value
      if (isRehydrating) return
      void setPersistedMetadata(value).catch((error) => {
        console.error('Failed to persist metadata:', error)
      })
    })
    // lastPulledPushCount → LocalStorage永続化
    $effect(() => {
      const value = lastPulledPushCount.value
      if (isRehydrating) return
      setPersistedLastPulledPushCount(value)
    })
  })
}

// 起動時のLocalStorageチェック用（PWA強制終了対策）
// storage.tsからre-export
export const getPersistedDirtyFlag = getPersistedDirtyFlagFromStorage
