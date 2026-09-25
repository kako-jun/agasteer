/**
 * ストアの基礎状態（#300）
 *
 * ノート/リーフ/アーカイブ/同期フラグ等、アプリ全体で共有する $state の
 * 宣言そのものだけを置くモジュール。他の stores/ サブモジュール（dirty-tracking,
 * store-mutations, persistence-effects, repo-switch-reset）はここから
 * 読むだけの一方向 import に統一し、このファイル自身は他の stores/ サブモジュールを
 * import しない（循環 import 回避の基盤レイヤー）。
 *
 * 左右ペインの表示状態（leftNote/rightNote/leftLeaf/rightLeaf/leftView/rightView/
 * leftInitialLine/rightInitialLine）は pane-state.svelte.ts に分離されている
 * （PR #309 レビュー nit: このファイルが400行ハウスルールを超過したため）。
 * pane-state.svelte.ts はこのファイルと同様に他の stores/ サブモジュールを
 * import しない独立した基盤レイヤーであり、dirty-tracking 等と異なりこのファイルを
 * import しない（このファイルの $state を参照しない）。
 *
 * #295/#297 分離済みの metadata 永続化・rehydrate 処理、#300 で分離した
 * dirty-tracking / store-mutations / persistence-effects / repo-switch-reset は
 * このファイルの $state を getter/setter 経由で参照する。
 */

import type { Settings, Note, Leaf, Metadata, WorldType } from '../types'
import type { Pane } from '../navigation'
// 循環参照回避: data/index.tsではなく、直接storage/metadata-storageからインポート
import {
  defaultSettings,
  getPersistedCommitSha,
  getPersistedLastPulledPushCount,
} from '../data/storage'
// #314 S1: isPulling/isPushing/isPushingBackground の setter から、待機者
// （restoreStateFromUrl の waitForSyncIdle）へ変化を通知する。sync-signal.ts は
// 他の stores/app-state を import しない末端レイヤーなので循環 import は起きない。
import { notifySyncActivityChanged } from './sync-signal'

// ============================================
// 基本ストア（Home用）
// ============================================
let _settings = $state<Settings>(defaultSettings)
export const settings = {
  get value() {
    return _settings
  },
  // proxy 同一性を保つため置換ではなくフィールドごとにミューテートする（#121）
  set value(v: Settings) {
    Object.assign(_settings, v)
  },
}

let _notes = $state<Note[]>([])
export const notes = {
  get value() {
    return _notes
  },
  set value(v: Note[]) {
    _notes = v
  },
}

let _leaves = $state<Leaf[]>([])
export const leaves = {
  get value() {
    return _leaves
  },
  set value(v: Leaf[]) {
    _leaves = v
  },
}

let _metadata = $state<Metadata>({ version: 1, notes: {}, leaves: {}, pushCount: 0 })
export const metadata = {
  get value() {
    return _metadata
  },
  set value(v: Metadata) {
    _metadata = v
  },
}

// ============================================
// アーカイブ用ストア
// ============================================
let _archiveNotes = $state<Note[]>([])
export const archiveNotes = {
  get value() {
    return _archiveNotes
  },
  set value(v: Note[]) {
    _archiveNotes = v
  },
}

let _archiveLeaves = $state<Leaf[]>([])
export const archiveLeaves = {
  get value() {
    return _archiveLeaves
  },
  set value(v: Leaf[]) {
    _archiveLeaves = v
  },
}

let _archiveMetadata = $state<Metadata>({
  version: 1,
  notes: {},
  leaves: {},
  pushCount: 0,
})
export const archiveMetadata = {
  get value() {
    return _archiveMetadata
  },
  set value(v: Metadata) {
    _archiveMetadata = v
  },
}

/** アーカイブがGitHubからロード済みかどうか */
let _isArchiveLoaded = $state<boolean>(false)
export const isArchiveLoaded = {
  get value() {
    return _isArchiveLoaded
  },
  set value(v: boolean) {
    _isArchiveLoaded = v
  },
}

// ============================================
// 現在のワールド（ペインごとに管理）
// ============================================
let _leftWorld = $state<WorldType>('home')
export const leftWorld = {
  get value() {
    return _leftWorld
  },
  set value(v: WorldType) {
    _leftWorld = v
  },
}

let _rightWorld = $state<WorldType>('home')
export const rightWorld = {
  get value() {
    return _rightWorld
  },
  set value(v: WorldType) {
    _rightWorld = v
  },
}

// ============================================
// ダーティフラグ管理（リーフごと + 全体）
// ============================================

// ノート構造変更フラグ（作成/削除/名前変更など、リーフ以外の変更）
let _isStructureDirty = $state<boolean>(false)
export const isStructureDirty = {
  get value() {
    return _isStructureDirty
  },
  set value(v: boolean) {
    _isStructureDirty = v
  },
}

// 構造変更があったノートのID（差分検出で自動更新）
let _dirtyNoteIds = $state<Set<string>>(new Set())
export const dirtyNoteIds = {
  get value() {
    return _dirtyNoteIds
  },
  set value(v: Set<string>) {
    _dirtyNoteIds = v
  },
}

// 構造変更があったリーフのID（新規作成、タイトル変更、順序変更、移動）
let _dirtyLeafIds = $state<Set<string>>(new Set())
export const dirtyLeafIds = {
  get value() {
    return _dirtyLeafIds
  },
  set value(v: Set<string>) {
    _dirtyLeafIds = v
  },
}

// 全体のダーティ判定（リーフ変更 or ノート構造変更 or 手動フラグ）
// スナップショット比較で検出されるため、元に戻せばダーティが消える
// isStructureDirtyはPWA復元やアーカイブ移動など、スナップショット比較で検出できない場合のフォールバック
export const isDirty = {
  get value() {
    return dirtyLeafIds.value.size > 0 || dirtyNoteIds.value.size > 0 || isStructureDirty.value
  },
}

// Pull成功時のリモートpushCountを保持（stale編集検出用）
let _lastPulledPushCount = $state<number>(getPersistedLastPulledPushCount() ?? 0)
export const lastPulledPushCount = {
  get value() {
    return _lastPulledPushCount
  },
  set value(v: number) {
    _lastPulledPushCount = v
  },
}

// 最後に同期した時点のリモートHEAD commit SHA（stale検出用）
// localStorageから復元し、変更時に永続化する（persistence-effects.svelte.ts の initStoreEffects で $effect として設定）
let _lastKnownCommitSha = $state<string | null>(getPersistedCommitSha())
export const lastKnownCommitSha = {
  get value() {
    return _lastKnownCommitSha
  },
  set value(v: string | null) {
    _lastKnownCommitSha = v
  },
}

// stale状態（リモートに新しい変更がある）- Pullボタンに赤丸表示用
let _isStale = $state<boolean>(false)
export const isStale = {
  get value() {
    return _isStale
  },
  set value(v: boolean) {
    _isStale = v
  },
}

// 最後にPush成功した時刻
let _lastPushTime = $state<number>(0)
export const lastPushTime = {
  get value() {
    return _lastPushTime
  },
  set value(v: number) {
    _lastPushTime = v
  },
}

// 最後にstaleチェックした時刻（定期チェック延長用）
let _lastStaleCheckTime = $state<number>(0)
export const lastStaleCheckTime = {
  get value() {
    return _lastStaleCheckTime
  },
  set value(v: number) {
    _lastStaleCheckTime = v
  },
}

// ペイン状態ストア（leftNote/rightNote/leftLeaf/rightLeaf/leftView/rightView/
// leftInitialLine/rightInitialLine）は pane-state.svelte.ts へ分離済み
// （PR #309 レビュー nit: 400行ハウスルール対応）

// 同期状態ストア
let _isPulling = $state<boolean>(false)
export const isPulling = {
  get value() {
    return _isPulling
  },
  set value(v: boolean) {
    _isPulling = v
    notifySyncActivityChanged()
  },
}

let _isPushing = $state<boolean>(false)
export const isPushing = {
  get value() {
    return _isPushing
  },
  set value(v: boolean) {
    _isPushing = v
    notifySyncActivityChanged()
  },
}

// #206: Push の preflight (stale check / 競合ダイアログ / IME flush) を通過した
// 後、HTTP 送信が裏で続いている間だけ true になる「背景 Push 中」フラグ。
// - isPushing は preflight phase の UI ロックに限定する（ガラス効果オーバーレイ）。
// - isPushingBackground は編集を再開可能にしたまま、Pull や別 Push を排他する目的で使う。
//   canSync() は両フラグを見て canPull / canPush を返す。
let _isPushingBackground = $state<boolean>(false)
export const isPushingBackground = {
  get value() {
    return _isPushingBackground
  },
  set value(v: boolean) {
    _isPushingBackground = v
    notifySyncActivityChanged()
  },
}

// フォーカス状態
let _focusedPane = $state<Pane>('left')
export const focusedPane = {
  get value() {
    return _focusedPane
  },
  set value(v: Pane) {
    _focusedPane = v
  },
}

// オフラインリーフ状態ストア
let _offlineLeafStore = $state<{
  content: string
  badgeIcon: string
  badgeColor: string
  updatedAt: number
}>({
  content: '',
  badgeIcon: '',
  badgeColor: '',
  updatedAt: Date.now(),
})
export const offlineLeafStore = {
  get value() {
    return _offlineLeafStore
  },
  set value(v: { content: string; badgeIcon: string; badgeColor: string; updatedAt: number }) {
    _offlineLeafStore = v
  },
}

// 派生ストア
export const rootNotes = {
  get value() {
    return notes.value.filter((f) => !f.parentId).sort((a, b) => a.order - b.order)
  },
}

export const githubConfigured = {
  get value() {
    return !!(settings.value.token && settings.value.repoName)
  },
}
