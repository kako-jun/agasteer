/**
 * 自動保存機構
 * ユーザー操作を検知し、無操作が一定時間続いたら自動保存を実行
 */

import { get, writable, type Readable } from 'svelte/store'
import { leaves, notes, offlineLeafStore } from './stores'
import { saveLeaves, saveNotes, saveOfflineLeaf } from '../data/storage'
import { createOfflineLeaf } from '../utils/offline'

/**
 * 自動Push進捗（0〜1）
 * 最後の編集から自動Pushまでの進捗を表示
 * 0 = 編集なし or Push完了直後、1 = 自動Push直前
 */
export const autoPushProgress = writable<number>(0)

// デバウンス間隔（ミリ秒）
const AUTO_SAVE_DELAY = 1000

// 自動Push間隔（ミリ秒）
const AUTO_PUSH_INTERVAL_MS = 5 * 60 * 1000 // 5分

// 保存が必要かどうかのフラグ
let pendingLeavesSave = false
let pendingNotesSave = false
let pendingOfflineSave = false

// タイマーID
let activityTimerId: ReturnType<typeof setTimeout> | null = null

// 初期化済みフラグ
let initialized = false

// 進捗更新用のストア参照（遅延初期化で循環参照を回避）
let hasChangesValue = false
let dirtyStartTime = 0 // ダーティになった時刻
let lastPushTimeStore: Readable<number> | null = null
let hasAnyChangesStore: Readable<boolean> | null = null

/**
 * 進捗追跡を初期化（stores.tsからの参照を遅延設定）
 */
export function initAutoPushProgress(
  lastPushTime: Readable<number>,
  hasAnyChanges: Readable<boolean>
): void {
  lastPushTimeStore = lastPushTime
  hasAnyChangesStore = hasAnyChanges

  hasAnyChanges.subscribe((value) => {
    // false → true になった瞬間に開始時刻を記録
    if (value && !hasChangesValue) {
      dirtyStartTime = Date.now()
    }
    // true → false になった瞬間にリセット
    if (!value && hasChangesValue) {
      dirtyStartTime = 0
    }
    hasChangesValue = value
  })
}

// 自動Pushトリガー用ストア（5分経過時にtrueになる）
export const shouldAutoPush = writable<boolean>(false)

// 進捗自動更新タイマー（1秒ごとに進捗計算と自動Push判定）
const PROGRESS_UPDATE_INTERVAL = 1000 // 1秒ごと
const progressUpdateIntervalId = setInterval(() => {
  if (!hasChangesValue || dirtyStartTime === 0) {
    autoPushProgress.set(0)
    shouldAutoPush.set(false)
    return
  }
  const elapsed = Date.now() - dirtyStartTime
  const progress = Math.min(elapsed / AUTO_PUSH_INTERVAL_MS, 1)
  autoPushProgress.set(progress)

  // 5分経過で自動Pushをトリガー
  if (elapsed >= AUTO_PUSH_INTERVAL_MS) {
    shouldAutoPush.set(true)
  }
}, PROGRESS_UPDATE_INTERVAL)

/**
 * リーフ保存をスケジュール
 */
export function scheduleLeavesSave(): void {
  pendingLeavesSave = true
  resetActivityTimer()
}

/**
 * ノート保存をスケジュール
 */
export function scheduleNotesSave(): void {
  pendingNotesSave = true
  resetActivityTimer()
}

/**
 * オフラインリーフ保存をスケジュール
 */
export function scheduleOfflineSave(): void {
  pendingOfflineSave = true
  resetActivityTimer()
}

/**
 * 保留中の保存を即座に実行
 */
export async function flushPendingSaves(): Promise<void> {
  if (activityTimerId) {
    clearTimeout(activityTimerId)
    activityTimerId = null
  }
  await executePendingSaves()
}

/**
 * 保留中の保存を実行（内部用）
 */
async function executePendingSaves(): Promise<void> {
  const promises: Promise<void>[] = []

  if (pendingLeavesSave) {
    pendingLeavesSave = false
    const currentLeaves = get(leaves)
    promises.push(
      saveLeaves(currentLeaves).catch((err) => console.error('Failed to persist leaves:', err))
    )
  }

  if (pendingNotesSave) {
    pendingNotesSave = false
    const currentNotes = get(notes)
    promises.push(
      saveNotes(currentNotes).catch((err) => console.error('Failed to persist notes:', err))
    )
  }

  if (pendingOfflineSave) {
    pendingOfflineSave = false
    const current = get(offlineLeafStore)
    const leaf = createOfflineLeaf(current.content, current.badgeIcon, current.badgeColor)
    leaf.updatedAt = current.updatedAt
    promises.push(
      saveOfflineLeaf(leaf).catch((err) => console.error('Failed to persist offline leaf:', err))
    )
  }

  await Promise.all(promises)
}

/**
 * アクティビティタイマーをリセット
 * 最後の操作から AUTO_SAVE_DELAY ミリ秒後に保存を実行
 */
function resetActivityTimer(): void {
  if (activityTimerId) {
    clearTimeout(activityTimerId)
  }

  activityTimerId = setTimeout(() => {
    activityTimerId = null
    executePendingSaves()
  }, AUTO_SAVE_DELAY)
}

/**
 * ユーザーアクティビティを検知するイベントハンドラ
 */
function handleUserActivity(): void {
  // 保留中の保存がある場合のみタイマーをリセット
  if (pendingLeavesSave || pendingNotesSave || pendingOfflineSave) {
    resetActivityTimer()
  }
}

/**
 * アクティビティ検知を初期化
 * App.svelte の onMount で呼び出す
 */
export function initActivityDetection(): () => void {
  if (initialized) {
    return () => {}
  }
  initialized = true

  // 検知するイベント
  const events = ['keydown', 'keyup', 'click', 'touchstart', 'scroll', 'mousemove']

  // passive: true でパフォーマンス向上
  const options: AddEventListenerOptions = { passive: true, capture: true }

  events.forEach((event) => {
    document.addEventListener(event, handleUserActivity, options)
  })

  // クリーンアップ関数を返す
  return () => {
    events.forEach((event) => {
      document.removeEventListener(event, handleUserActivity, options)
    })
    if (activityTimerId) {
      clearTimeout(activityTimerId)
      activityTimerId = null
    }
    initialized = false
  }
}

/**
 * ページ離脱時に保留中の保存を実行
 */
export function setupBeforeUnloadSave(): () => void {
  const handler = () => {
    // beforeunload では非同期処理が完了する保証がないため、
    // 同期的に実行できる範囲で保存をトリガー
    if (pendingLeavesSave || pendingNotesSave || pendingOfflineSave) {
      executePendingSaves()
    }
  }

  window.addEventListener('beforeunload', handler)
  return () => window.removeEventListener('beforeunload', handler)
}
