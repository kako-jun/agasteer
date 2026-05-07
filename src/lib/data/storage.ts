/**
 * LocalStorage操作
 * アプリケーションデータの永続化を担当
 *
 * #131: リポジトリ単位の名前空間化
 * - IndexedDB は per-repo DB (`agasteer/db/<sanitized>`) に分割
 * - fonts / backgrounds は共有DB (`agasteer/shared`) に分離
 * - localStorage は `{ settings, globalState, byRepo }` 構造
 */

import type {
  Settings,
  Note,
  Leaf,
  Metadata,
  ThemeType,
  CustomFont,
  CustomBackground,
  Locale,
} from '../types'
import { getLocaleFromNavigator } from 'svelte-i18n'
import { encryptToken, decryptToken, isEncryptedToken, obfuscateToken } from '../utils/crypto'

/**
 * ストレージエラークラス
 * IndexedDBの操作に関するエラーを種類別に分類
 */
export class StorageError extends Error {
  public readonly type: 'db_open' | 'db_blocked' | 'db_upgrade' | 'db_operation' | 'db_closed'

  constructor(
    type: StorageError['type'],
    message: string,
    public readonly originalError?: unknown
  ) {
    super(message)
    this.name = 'StorageError'
    this.type = type
  }

  /**
   * ユーザー向けメッセージのi18nキーを返す
   */
  getMessageKey(): string {
    switch (this.type) {
      case 'db_open':
        return 'storage.dbOpen'
      case 'db_blocked':
        return 'storage.dbBlocked'
      case 'db_upgrade':
        return 'storage.dbUpgrade'
      case 'db_operation':
        return 'storage.dbOperation'
      case 'db_closed':
        return 'storage.dbClosed'
      default:
        return 'storage.dbError'
    }
  }
}

// LocalStorage（単一キーに統合）
const STORAGE_KEY = 'agasteer'
const THEME_OPTIONS: ThemeType[] = ['yomi', 'campus', 'greenboard', 'whiteboard', 'dotsD', 'dotsF']

/**
 * グローバル状態（リポに依存しない永続化データ）
 */
export interface GlobalState {
  tourShown: boolean
  saveGuideShown: boolean
  pwaInstallDismissedAt?: number // PWAインストールバナー却下時刻（7日間cooldown用）
}

const defaultGlobalState: GlobalState = {
  tourShown: false,
  saveGuideShown: false,
  pwaInstallDismissedAt: undefined,
}

/**
 * リポジトリ単位の永続化状態
 */
export interface PerRepoState {
  isDirty: boolean
  lastKnownCommitSha?: string | null // 最後に同期したリモートHEAD commit SHA（stale検出用）
  pushInFlightAt?: number // Push API呼び出し中のタイムスタンプ（スリープによるレスポンス消失検出用）
  metadata?: Metadata // 直近同期済みの home metadata（skip 起動時のバッジ復元用）
  lastPulledPushCount?: number // 直近同期済みの pushCount（skip 起動時の統計復元用）
}

const defaultPerRepoState: PerRepoState = {
  isDirty: false,
}

/**
 * LocalStorage全体の構造（#131以降）
 */
interface StorageData {
  settings: Settings
  globalState: GlobalState
  byRepo: Record<string, PerRepoState>
  v131Migrated?: boolean
}

/**
 * repoName を DB 名に使える形にサニタイズする
 * 例: "kako-jun/notes" -> "kako-jun__notes"
 *
 * GitHub の repoName は `<owner>/<repo>` 形式に正規化済みで、
 * owner/repo 名に使える文字は英数字・`-`・`_`・`.` のみ。
 * したがって `/` だけを置換すれば衝突のない一意な DB 名になる。
 */
function sanitizeRepoKey(repoName: string): string {
  return repoName.replace(/\//g, '__')
}

/**
 * currentRepoKey() は高頻度で呼ばれるため、repoName だけを軽量に
 * キャッシュして localStorage の全 JSON パースを避ける。
 * loadStorageData()/saveStorageData() を通るたびに更新される。
 * undefined は「未初期化」、null は「設定済みだが repoName 空」を表す。
 */
let cachedRepoName: string | null | undefined = undefined

function updateRepoNameCache(repoName: string | null | undefined): void {
  cachedRepoName = repoName ? repoName : null
}

/**
 * settings.value を loadStorageData/saveStorageData を経由せずに直接代入した場合
 * （例: 起動時の Object.assign(settings.value, loadedSettings)）に呼び、
 * cachedRepoName が stale にならないようにするための外部入口。
 */
export function syncRepoNameCache(repoName: string | null | undefined): void {
  updateRepoNameCache(repoName)
}

/**
 * LocalStorage全体を読み込む
 */
function loadStorageData(): StorageData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      const parsed = JSON.parse(stored) as Partial<StorageData> & {
        state?: Partial<PerRepoState & GlobalState>
      }
      // 新形式を優先。旧形式は state を捨てる（#131 で後方互換なし）
      const merged: StorageData = {
        settings: { ...defaultSettings, ...(parsed.settings ?? {}) } as Settings,
        globalState: { ...defaultGlobalState, ...(parsed.globalState ?? {}) },
        byRepo: parsed.byRepo ?? {},
        v131Migrated: parsed.v131Migrated,
      }
      updateRepoNameCache(merged.settings.repoName)
      return merged
    } catch (error) {
      // #208: silent fallback だと「初回起動」と「JSON 破損」が見分けられず、
      // ヒント再表示や token/repoName 消失の原因追跡が不可能になる。
      // raw を別キーに退避してから初期化することで、後から開発者ツールで
      // 「本当に消えた」のか「読めなかった」のかを切り分けられるようにする。
      const backupKey = `${STORAGE_KEY}-corrupt-${Date.now()}`
      try {
        localStorage.setItem(backupKey, stored)
      } catch {
        // 退避すら失敗（quota 等）→ 諦める。少なくとも console.error は残る。
      }
      console.error(`localStorage parse failed; raw saved as "${backupKey}"`, error)
    }
  }

  const browserLocale = getLocaleFromNavigator()
  const detectedLocale: Locale = browserLocale?.startsWith('ja') ? 'ja' : 'en'

  const fallback: StorageData = {
    settings: { ...defaultSettings, locale: detectedLocale },
    globalState: { ...defaultGlobalState },
    byRepo: {},
  }
  updateRepoNameCache(fallback.settings.repoName)
  return fallback
}

/**
 * LocalStorage全体を保存
 */
function saveStorageData(data: StorageData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
  updateRepoNameCache(data.settings.repoName)
}

// IndexedDB 設定
const DB_VERSION = 1 // #131 でリセット（既存データは破棄）
const LEAVES_STORE = 'leaves'
const NOTES_STORE = 'notes'
const OFFLINE_STORE = 'offline'
const ARCHIVE_LEAVES_STORE = 'archiveLeaves'
const ARCHIVE_NOTES_STORE = 'archiveNotes'
const FONTS_STORE = 'fonts'
const BACKGROUNDS_STORE = 'backgrounds'

const SHARED_DB_NAME = 'agasteer/shared'
const SHARED_DB_VERSION = 1

export const defaultSettings: Settings = {
  token: '',
  repoName: '',
  repoHistory: [],
  theme: 'yomi',
  toolName: 'Agasteer',
  locale: 'en', // デフォルトは英語
  vimMode: false, // デフォルトはVimモードオフ
  linedMode: true, // デフォルトは罫線モードオン
  cursorTrailEnabled: true, // デフォルトはカーソルトレイルオン
}

/**
 * テーマ名の正規化（旧テーマ名の互換性対応）
 */
function normalizeTheme(theme: string): ThemeType {
  if (theme === 'dots' || theme === 'dots1') return 'dotsD'
  if (theme === 'dots2') return 'dotsF'
  if (!THEME_OPTIONS.includes(theme as ThemeType)) return defaultSettings.theme
  return theme as ThemeType
}

/**
 * #131 移行処理: 初回起動時に旧DB `agasteer/db` を削除する
 * ユーザー決定により後方互換なし、ローカルデータは破棄
 *
 * deleteDatabase は非同期。success/blocked/error を確実にハンドルし、
 * blocked の場合は v131Migrated フラグを立てない（次回起動でリトライするため）。
 */
async function runV131MigrationIfNeeded(): Promise<void> {
  const data = loadStorageData()
  if (data.v131Migrated) return
  const deleted = await new Promise<boolean>((resolve) => {
    try {
      const request = indexedDB.deleteDatabase('agasteer/db')
      request.onsuccess = () => resolve(true)
      request.onerror = () => {
        console.warn('Failed to delete legacy agasteer/db:', request.error)
        resolve(false)
      }
      request.onblocked = () => {
        // 他タブが旧DBを開きっぱなし。フラグは立てず次回リトライする。
        console.warn('Legacy agasteer/db deletion is blocked by another tab; will retry next boot')
        resolve(false)
      }
    } catch (error) {
      console.warn('Failed to request deletion of legacy agasteer/db:', error)
      resolve(false)
    }
  })
  if (deleted) {
    data.v131Migrated = true
    saveStorageData(data)
  }
}

// 初回評価時に旧DB削除を試みる（ブラウザ環境でのみ）
if (typeof indexedDB !== 'undefined' && typeof localStorage !== 'undefined') {
  runV131MigrationIfNeeded().catch((error) => {
    console.warn('v131 migration check failed:', error)
  })
}

/**
 * 設定を読み込む（非同期版）
 * トークンが暗号化されている場合は復号する
 */
export async function loadSettings(): Promise<Settings> {
  const data = loadStorageData()
  const settings = { ...defaultSettings, ...data.settings }
  settings.theme = normalizeTheme(settings.theme)

  // 暗号化されたトークンを復号
  if (settings.token && isEncryptedToken(settings.token)) {
    settings.token = await decryptToken(settings.token)
  }

  return settings
}

/**
 * 設定を保存
 * トークンを暗号化してLocalStorageに保存する
 * 暗号化は非同期のため、暗号化完了後にLocalStorageを再更新する
 */
export function saveSettings(settings: Settings): void {
  const data = loadStorageData()
  // まずトークンを仮の状態で保存（token以外の設定変更を即座に反映）
  const settingsForStorage = { ...settings }

  // トークンが平文（暗号化プレフィックスなし）の場合、非同期で暗号化
  if (settingsForStorage.token && !isEncryptedToken(settingsForStorage.token)) {
    // 暗号化完了までは平文で保存せず、空にしておく
    // 暗号化が完了したら上書きする
    const plainToken = settingsForStorage.token
    settingsForStorage.token =
      data.settings?.token && isEncryptedToken(data.settings.token)
        ? data.settings.token // 既存の暗号化トークンを維持
        : '' // 初回は空（暗号化完了で上書き）
    data.settings = settingsForStorage
    saveStorageData(data)

    // 非同期で暗号化してから再保存
    // NOTE: この非同期処理と他のsaveSettings呼び出しの間にレースコンディションの可能性があるが、
    // トークン変更は低頻度のため現状は許容する
    encryptToken(plainToken)
      .then((encrypted) => {
        const freshData = loadStorageData()
        freshData.settings = { ...freshData.settings, token: encrypted }
        saveStorageData(freshData)
      })
      .catch((err) => {
        console.error('Failed to encrypt token, using obfuscation fallback:', err)
        // 暗号化失敗時は難読化で保存（平文をlocalStorageに入れない）
        const freshData = loadStorageData()
        freshData.settings = { ...freshData.settings, token: obfuscateToken(plainToken) }
        saveStorageData(freshData)
      })
  } else {
    // 既に暗号化済み or トークン空 → そのまま保存
    data.settings = settingsForStorage
    saveStorageData(data)
  }
}

// ============================================
// グローバル状態アクセサ
// ============================================

function updateGlobalState(partial: Partial<GlobalState>): void {
  const data = loadStorageData()
  data.globalState = { ...data.globalState, ...partial }
  saveStorageData(data)
}

/**
 * ツアー表示済みフラグを取得
 */
export function isTourShown(): boolean {
  return loadStorageData().globalState.tourShown
}

/**
 * ツアー表示済みフラグを設定
 */
export function setTourShown(shown: boolean): void {
  updateGlobalState({ tourShown: shown })
}

/**
 * 保存ガイド表示済みフラグを取得
 */
export function isSaveGuideShown(): boolean {
  return loadStorageData().globalState.saveGuideShown ?? false
}

/**
 * 保存ガイド表示済みフラグを設定
 */
export function setSaveGuideShown(shown: boolean): void {
  updateGlobalState({ saveGuideShown: shown })
}

/**
 * PWAインストールバナー却下時刻を取得
 */
export function getPwaInstallDismissedAt(): number | undefined {
  return loadStorageData().globalState.pwaInstallDismissedAt
}

/**
 * PWAインストールバナー却下時刻を設定
 */
export function setPwaInstallDismissedAt(timestamp: number | undefined): void {
  updateGlobalState({ pwaInstallDismissedAt: timestamp })
}

/**
 * PWAインストールバナーを表示すべきか判定（7日間cooldown）
 */
export function shouldShowPwaInstallBanner(): boolean {
  const dismissedAt = getPwaInstallDismissedAt()
  if (dismissedAt === undefined) return true
  const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000
  if (Date.now() - dismissedAt < SEVEN_DAYS_MS) return false
  // cooldown期間が過ぎたら記録をクリア
  setPwaInstallDismissedAt(undefined)
  return true
}

// ============================================
// リポ単位の状態アクセサ
// ============================================

/**
 * 現在のリポ (settings.repoName) のキーを返す。未設定時は null。
 *
 * 高頻度に呼ばれるため、キャッシュ未初期化時のみ localStorage を読み込み、
 * 以降は loadStorageData()/saveStorageData() を通るたびに更新される
 * キャッシュから返す。
 */
function currentRepoKey(): string | null {
  if (cachedRepoName === undefined) {
    // まだ一度も localStorage を読んでいない場合のみ読み込む。
    // 読み込み自体が updateRepoNameCache を呼ぶため、以降は localStorage を触らない。
    loadStorageData()
  }
  return cachedRepoName ?? null
}

/**
 * 指定リポの状態を読む。存在しなければデフォルト。
 */
export function getPerRepoState(repoKey: string): PerRepoState {
  const data = loadStorageData()
  return { ...defaultPerRepoState, ...(data.byRepo[repoKey] ?? {}) }
}

/**
 * 指定リポの状態を部分更新する。
 */
export function setPerRepoState(repoKey: string, patch: Partial<PerRepoState>): void {
  const data = loadStorageData()
  const current = { ...defaultPerRepoState, ...(data.byRepo[repoKey] ?? {}) }
  data.byRepo[repoKey] = { ...current, ...patch }
  saveStorageData(data)
}

/**
 * 現在リポの状態を部分更新する。repoName 未設定なら何もしない。
 */
function updateCurrentRepoState(patch: Partial<PerRepoState>): void {
  const key = currentRepoKey()
  if (!key) return
  setPerRepoState(key, patch)
}

/**
 * ダーティフラグを取得（現在リポ。起動時チェック用）
 *
 * `settings.repoName` 未設定（GitHub未連携）の場合は常に false を返す。
 * per-repo slot は repoName をキーに引くため、未設定時は参照先がなく、
 * dirty復元もスキップする仕様。ユーザーが設定画面からリポを指定すると
 * 以降このフラグが該当 slot を参照する。
 */
export function getPersistedDirtyFlag(): boolean {
  const key = currentRepoKey()
  if (!key) return false
  return getPerRepoState(key).isDirty
}

/**
 * ダーティフラグを設定（現在リポ）
 */
export function setPersistedDirtyFlag(isDirty: boolean): void {
  updateCurrentRepoState({ isDirty })
}

/**
 * lastKnownCommitShaを取得（現在リポ。起動時の復元用）
 */
export function getPersistedCommitSha(): string | null {
  const key = currentRepoKey()
  if (!key) return null
  return getPerRepoState(key).lastKnownCommitSha ?? null
}

/**
 * lastKnownCommitShaを保存（現在リポ）
 */
export function setPersistedCommitSha(sha: string | null): void {
  updateCurrentRepoState({ lastKnownCommitSha: sha })
}

/**
 * home metadata を取得（現在リポ。起動時の復元用）
 */
export function getPersistedMetadata(): Metadata | null {
  const key = currentRepoKey()
  if (!key) return null
  return getPerRepoState(key).metadata ?? null
}

/**
 * home metadata を保存（現在リポ）
 */
export function setPersistedMetadata(metadata: Metadata): void {
  updateCurrentRepoState({ metadata })
}

/**
 * Pull成功時の pushCount を取得（現在リポ。起動時の統計復元用）
 */
export function getPersistedLastPulledPushCount(): number | null {
  const key = currentRepoKey()
  if (!key) return null
  return getPerRepoState(key).lastPulledPushCount ?? null
}

/**
 * Pull成功時の pushCount を保存（現在リポ）
 */
export function setPersistedLastPulledPushCount(pushCount: number): void {
  updateCurrentRepoState({ lastPulledPushCount: pushCount })
}

/**
 * Push飛行中フラグを取得（現在リポ。スリープによるレスポンス消失検出用）
 */
export function getPushInFlightAt(): number | undefined {
  const key = currentRepoKey()
  if (!key) return undefined
  return getPerRepoState(key).pushInFlightAt
}

/**
 * Push飛行中フラグを設定（現在リポ）
 */
export function setPushInFlightAt(timestamp: number | undefined): void {
  updateCurrentRepoState({ pushInFlightAt: timestamp })
}

// ============================================
// IndexedDB (per-repo + shared)
// ============================================

// DB接続監視用のコールバック
let onDbClosedCallback: (() => void) | null = null

/**
 * DB接続が予期せず閉じられたときのコールバックを設定
 */
export function setOnDbClosed(callback: (() => void) | null): void {
  onDbClosedCallback = callback
}

// 現在の per-repo DB ハンドル（キャッシュ）
let currentDb: IDBDatabase | null = null
let currentDbRepoKey: string | null = null
let currentDbPromise: Promise<IDBDatabase> | null = null
// 連続リポ切替で古い open() の resolve が後着して currentDb を上書きする
// レースを防ぐため epoch を導入する。setCurrentRepo を呼ぶたびに加算し、
// open() 完了時に自分の epoch が最新でなければ破棄する。
let currentDbEpoch = 0

// 共有DB (fonts, backgrounds)
let sharedDb: IDBDatabase | null = null
let sharedDbPromise: Promise<IDBDatabase> | null = null

function perRepoDbName(repoKey: string): string {
  return `agasteer/db/${sanitizeRepoKey(repoKey)}`
}

/**
 * 現在アクティブなリポの DB ハンドルを取得する
 * setCurrentRepo 未呼び出しの場合は settings.repoName から自動で設定する
 */
async function getCurrentDb(): Promise<IDBDatabase> {
  if (currentDb && currentDbRepoKey) {
    return currentDb
  }
  if (currentDbPromise) {
    return currentDbPromise
  }
  const key = currentDbRepoKey ?? currentRepoKey()
  if (!key) {
    throw new StorageError('db_open', 'No repository configured: cannot open per-repo IndexedDB')
  }
  currentDbRepoKey = key
  currentDbPromise = openPerRepoDB(key).then((db) => {
    currentDb = db
    currentDbPromise = null
    return db
  })
  try {
    return await currentDbPromise
  } catch (error) {
    currentDbPromise = null
    throw error
  }
}

/**
 * 現在の per-repo DB を指定リポに切り替える
 * 既に開いている DB は閉じ、新しい DB を開く
 *
 * 連続呼び出し対応: epoch を採番し、open() 完了時に自分の epoch が最新で
 * なければ結果を破棄する（古い promise が後着して currentDb を上書きする
 * のを防ぐ）。
 */
export async function setCurrentRepo(repoKey: string): Promise<void> {
  if (currentDbRepoKey === repoKey && currentDb) {
    return
  }
  // 既存 DB をクローズ
  if (currentDb) {
    try {
      currentDb.close()
    } catch (error) {
      console.warn('Failed to close previous DB:', error)
    }
  }
  currentDb = null
  currentDbPromise = null
  currentDbRepoKey = repoKey
  const myEpoch = ++currentDbEpoch
  const promise = openPerRepoDB(repoKey).then((db) => {
    if (myEpoch !== currentDbEpoch) {
      // 自分より新しい setCurrentRepo 呼び出しがあった → この結果は破棄する。
      try {
        db.close()
      } catch (error) {
        console.warn('Failed to close stale DB handle:', error)
      }
      throw new StorageError('db_open', 'setCurrentRepo superseded by newer call')
    }
    currentDb = db
    currentDbPromise = null
    return db
  })
  currentDbPromise = promise
  try {
    await promise
  } catch (error) {
    // superseded は正常なキャンセル扱い。呼び出し元には「古い切替」であることを伝える。
    if (myEpoch !== currentDbEpoch) {
      return
    }
    throw error
  }
}

/**
 * 現在の per-repo DB を閉じてハンドルをクリアする
 */
export function closeCurrentRepoDb(): void {
  if (currentDb) {
    try {
      currentDb.close()
    } catch (error) {
      console.warn('Failed to close current DB:', error)
    }
  }
  currentDb = null
  currentDbPromise = null
  currentDbRepoKey = null
  // 進行中の open() が後着で上書きするのを防ぐ
  currentDbEpoch++
}

/**
 * per-repo IndexedDBを開く（leaves / notes / offline / archive 用）
 * エラー時は最大3回リトライする
 * タイムアウト付きでハングを防止
 */
async function openPerRepoDB(repoKey: string, retryCount = 0): Promise<IDBDatabase> {
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 100 // 100ms, 200ms, 300ms
  const TIMEOUT_MS = 5000 // 5秒でタイムアウト
  const dbName = perRepoDbName(repoKey)

  return new Promise((resolve, reject) => {
    let settled = false
    let timeoutId: ReturnType<typeof setTimeout> | null = null

    const settle = (fn: () => void) => {
      if (settled) return
      settled = true
      if (timeoutId) {
        clearTimeout(timeoutId)
        timeoutId = null
      }
      fn()
    }

    timeoutId = setTimeout(() => {
      settle(() => {
        console.error(`IndexedDB open timed out after ${TIMEOUT_MS}ms (attempt ${retryCount + 1})`)
        if (retryCount < MAX_RETRIES) {
          setTimeout(
            async () => {
              try {
                const db = await openPerRepoDB(repoKey, retryCount + 1)
                resolve(db)
              } catch (retryError) {
                reject(retryError)
              }
            },
            RETRY_DELAY_MS * (retryCount + 1)
          )
        } else {
          reject(
            new StorageError(
              'db_open',
              `IndexedDB open timed out after ${MAX_RETRIES + 1} attempts`
            )
          )
        }
      })
    }, TIMEOUT_MS)

    const request = indexedDB.open(dbName, DB_VERSION)

    request.onblocked = () => {
      settle(() => {
        console.warn('IndexedDB is blocked by another tab')
        reject(new StorageError('db_blocked', 'Database is blocked by another tab'))
      })
    }

    request.onupgradeneeded = () => {
      const db = request.result
      try {
        if (!db.objectStoreNames.contains(LEAVES_STORE)) {
          db.createObjectStore(LEAVES_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(NOTES_STORE)) {
          db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
          db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(ARCHIVE_LEAVES_STORE)) {
          db.createObjectStore(ARCHIVE_LEAVES_STORE, { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains(ARCHIVE_NOTES_STORE)) {
          db.createObjectStore(ARCHIVE_NOTES_STORE, { keyPath: 'id' })
        }
      } catch (upgradeError) {
        console.error('IndexedDB upgrade failed:', upgradeError)
        settle(() => {
          reject(new StorageError('db_upgrade', 'Database upgrade failed', upgradeError))
        })
      }
    }

    request.onsuccess = () => {
      settle(() => {
        const db = request.result
        db.onclose = () => {
          console.warn('IndexedDB connection closed unexpectedly')
          // 当該 DB が現在の current DB なら参照をクリア
          if (db === currentDb) {
            currentDb = null
            currentDbPromise = null
          }
          if (onDbClosedCallback) {
            onDbClosedCallback()
          }
        }
        db.onerror = (event) => {
          console.error('IndexedDB error:', event)
        }
        resolve(db)
      })
    }

    request.onerror = () => {
      settle(async () => {
        const error = request.error
        console.error(
          `IndexedDB open failed (attempt ${retryCount + 1}/${MAX_RETRIES + 1}):`,
          error
        )
        if (retryCount < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)))
          try {
            const db = await openPerRepoDB(repoKey, retryCount + 1)
            resolve(db)
          } catch (retryError) {
            reject(retryError)
          }
        } else {
          reject(
            new StorageError(
              'db_open',
              `IndexedDB failed to open after ${MAX_RETRIES + 1} attempts`,
              error
            )
          )
        }
      })
    }
  })
}

/**
 * 共有DBを開く（fonts, backgrounds 用）
 */
async function openSharedDB(): Promise<IDBDatabase> {
  if (sharedDb) return sharedDb
  if (sharedDbPromise) return sharedDbPromise
  sharedDbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(SHARED_DB_NAME, SHARED_DB_VERSION)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(FONTS_STORE)) {
        db.createObjectStore(FONTS_STORE, { keyPath: 'name' })
      }
      if (!db.objectStoreNames.contains(BACKGROUNDS_STORE)) {
        db.createObjectStore(BACKGROUNDS_STORE, { keyPath: 'name' })
      }
    }
    request.onsuccess = () => {
      sharedDb = request.result
      sharedDbPromise = null
      sharedDb.onclose = () => {
        sharedDb = null
      }
      resolve(request.result)
    }
    request.onerror = () => {
      sharedDbPromise = null
      reject(new StorageError('db_open', 'Shared IndexedDB failed to open', request.error))
    }
    request.onblocked = () => {
      sharedDbPromise = null
      reject(new StorageError('db_blocked', 'Shared database is blocked by another tab'))
    }
  })
  return sharedDbPromise
}

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => resolve((request.result as T[]) || [])
    request.onerror = () => reject(request.error)
  })
}

/**
 * IndexedDB put に渡す前に Svelte 5 の $state proxy を剥がす。
 * proxy のまま store.put() に渡すと structuredClone が内部シンボルを
 * 辿ってしまい DataCloneError: #<Object> could not be cloned が出る。
 * Note/Leaf/Settings 等の保存データは JSON セーフな素データなので、
 * JSON ラウンドトリップで安全にプレーン化できる（undefined フィールド
 * は落ちるがスキーマ上問題なし）。
 */
function toPlain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function replaceAllInStore<T extends { id: string }>(
  db: IDBDatabase,
  storeName: string,
  items: T[]
): Promise<void> {
  const plainItems = toPlain(items)
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))

    const clearReq = store.clear()
    clearReq.onsuccess = () => {
      for (const item of plainItems) {
        store.put(item)
      }
    }
  })
}

/**
 * ノートを読み込む（IndexedDB）
 */
export async function loadLeaves(): Promise<Leaf[]> {
  try {
    const db = await getCurrentDb()
    return await getAllFromStore<Leaf>(db, LEAVES_STORE)
  } catch (error) {
    console.error('Failed to load leaves from IndexedDB:', error)
    return []
  }
}

/**
 * リーフを保存（オフラインリーフは別storeなので影響なし）
 */
export async function saveLeaves(newLeaves: Leaf[]): Promise<void> {
  try {
    const db = await getCurrentDb()
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, newLeaves)
  } catch (error) {
    console.error('Failed to save leaves to IndexedDB:', error)
    throw error
  }
}

/**
 * ノートを読み込む
 */
export async function loadNotes(): Promise<Note[]> {
  try {
    const db = await getCurrentDb()
    const notes = await getAllFromStore<Note>(db, NOTES_STORE)
    // orderが欠けていたら付与
    return notes.map((note, index) => (note.order === undefined ? { ...note, order: index } : note))
  } catch (error) {
    console.error('Failed to load notes from IndexedDB:', error)
    return []
  }
}

/**
 * ノートを保存
 */
export async function saveNotes(notes: Note[]): Promise<void> {
  try {
    const db = await getCurrentDb()
    await replaceAllInStore<Note>(db, NOTES_STORE, notes)
  } catch (error) {
    console.error('Failed to save notes to IndexedDB:', error)
    throw error
  }
}

/**
 * 全データを削除（現在リポの notes/leaves ストアをクリア）
 * オフラインリーフ・共有ストア(fonts/bg)は影響なし
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await getCurrentDb()
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, [])
    await replaceAllInStore<Note>(db, NOTES_STORE, [])
  } catch (error) {
    console.error('Failed to clear data in IndexedDB:', error)
  }
}

/**
 * アーカイブリーフを読み込む（IndexedDB）
 */
export async function loadArchiveLeaves(): Promise<Leaf[]> {
  try {
    const db = await getCurrentDb()
    return await getAllFromStore<Leaf>(db, ARCHIVE_LEAVES_STORE)
  } catch (error) {
    console.error('Failed to load archive leaves from IndexedDB:', error)
    return []
  }
}

/**
 * アーカイブリーフを保存
 */
export async function saveArchiveLeaves(newLeaves: Leaf[]): Promise<void> {
  try {
    const db = await getCurrentDb()
    await replaceAllInStore<Leaf>(db, ARCHIVE_LEAVES_STORE, newLeaves)
  } catch (error) {
    console.error('Failed to save archive leaves to IndexedDB:', error)
    throw error
  }
}

/**
 * アーカイブノートを読み込む
 */
export async function loadArchiveNotes(): Promise<Note[]> {
  try {
    const db = await getCurrentDb()
    const notes = await getAllFromStore<Note>(db, ARCHIVE_NOTES_STORE)
    return notes.map((note, index) => (note.order === undefined ? { ...note, order: index } : note))
  } catch (error) {
    console.error('Failed to load archive notes from IndexedDB:', error)
    return []
  }
}

/**
 * アーカイブノートを保存
 */
export async function saveArchiveNotes(notes: Note[]): Promise<void> {
  try {
    const db = await getCurrentDb()
    await replaceAllInStore<Note>(db, ARCHIVE_NOTES_STORE, notes)
  } catch (error) {
    console.error('Failed to save archive notes to IndexedDB:', error)
    throw error
  }
}

/**
 * アーカイブデータを削除（リポ切り替え時用）
 */
export async function clearArchiveData(): Promise<void> {
  try {
    const db = await getCurrentDb()
    await replaceAllInStore<Leaf>(db, ARCHIVE_LEAVES_STORE, [])
    await replaceAllInStore<Note>(db, ARCHIVE_NOTES_STORE, [])
  } catch (error) {
    console.error('Failed to clear archive data in IndexedDB:', error)
  }
}

/**
 * 汎用: per-repo ストアへアイテム保存
 */
async function putItemRepo<T>(storeName: string, item: T): Promise<void> {
  const db = await getCurrentDb()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  const plainItem = toPlain(item)
  await new Promise<void>((resolve, reject) => {
    const request = store.put(plainItem)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * 汎用: per-repo ストアからアイテム読み込み
 */
async function getItemRepo<T>(storeName: string, key: string): Promise<T | null> {
  const db = await getCurrentDb()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  return await new Promise<T | null>((resolve, reject) => {
    const request = store.get(key)
    request.onsuccess = () => resolve((request.result as T) || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 汎用: 共有DBへアイテム保存
 */
async function putItemShared<T>(storeName: string, item: T): Promise<void> {
  const db = await openSharedDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  const plainItem = toPlain(item)
  await new Promise<void>((resolve, reject) => {
    const request = store.put(plainItem)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * 汎用: 共有DBからアイテム読み込み
 */
async function getItemShared<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openSharedDB()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  return await new Promise<T | null>((resolve, reject) => {
    const request = store.get(key)
    request.onsuccess = () => resolve((request.result as T) || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * 汎用: 共有DBからアイテム削除
 */
async function deleteItemShared(storeName: string, key: string): Promise<void> {
  const db = await openSharedDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await new Promise<void>((resolve, reject) => {
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * blocked 系エラーかどうか判定する（共有DBが他タブの古いバージョンに
 * ブロックされて開けないケース。現状 version=1 固定なのでほぼ起きないが、
 * 防御的にハンドルする）
 */
function isDbBlocked(error: unknown): boolean {
  return error instanceof StorageError && error.type === 'db_blocked'
}

/**
 * カスタムフォントを保存（共有DB）
 *
 * 共有DBが他タブにblockされている場合はwarnして静かに失敗させる
 * （保存できなかっただけで UI を崩さない）。load側も null 返却で
 * 同様に degrade するため、挙動を揃える。
 */
export async function saveCustomFont(font: CustomFont): Promise<void> {
  try {
    await putItemShared(FONTS_STORE, font)
  } catch (error) {
    if (isDbBlocked(error)) {
      console.warn('Custom font save skipped: shared DB is blocked by another tab')
      return
    }
    console.error('Failed to save custom font to IndexedDB:', error)
    throw error
  }
}

/**
 * カスタムフォントを読み込む（共有DB）
 */
export async function loadCustomFont(name: string): Promise<CustomFont | null> {
  try {
    return await getItemShared<CustomFont>(FONTS_STORE, name)
  } catch (error) {
    console.error('Failed to load custom font from IndexedDB:', error)
    return null
  }
}

/**
 * カスタムフォントを削除（共有DB）
 */
export async function deleteCustomFont(name: string): Promise<void> {
  try {
    await deleteItemShared(FONTS_STORE, name)
  } catch (error) {
    console.error('Failed to delete custom font from IndexedDB:', error)
    throw error
  }
}

/**
 * カスタム背景画像を保存（共有DB）
 *
 * saveCustomFont と同様、blocked 時は静かに失敗させて UX を守る。
 */
export async function saveCustomBackground(background: CustomBackground): Promise<void> {
  try {
    await putItemShared(BACKGROUNDS_STORE, background)
  } catch (error) {
    if (isDbBlocked(error)) {
      console.warn('Custom background save skipped: shared DB is blocked by another tab')
      return
    }
    console.error('Failed to save custom background to IndexedDB:', error)
    throw error
  }
}

/**
 * カスタム背景画像を読み込む（共有DB）
 */
export async function loadCustomBackground(name: string): Promise<CustomBackground | null> {
  try {
    return await getItemShared<CustomBackground>(BACKGROUNDS_STORE, name)
  } catch (error) {
    console.error('Failed to load custom background from IndexedDB:', error)
    return null
  }
}

/**
 * カスタム背景画像を削除（共有DB）
 */
export async function deleteCustomBackground(name: string): Promise<void> {
  try {
    await deleteItemShared(BACKGROUNDS_STORE, name)
  } catch (error) {
    console.error('Failed to delete custom background from IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを保存（per-repo専用store、Pull/Pushの影響を受けない）
 */
export async function saveOfflineLeaf(leaf: Leaf): Promise<void> {
  try {
    await putItemRepo(OFFLINE_STORE, leaf)
  } catch (error) {
    console.error('Failed to save offline leaf to IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを読み込む（per-repo専用storeから読み込み）
 */
export async function loadOfflineLeaf(id: string): Promise<Leaf | null> {
  try {
    return await getItemRepo<Leaf>(OFFLINE_STORE, id)
  } catch (error) {
    console.error('Failed to load offline leaf from IndexedDB:', error)
    return null
  }
}

/**
 * Pull操作用のバックアップデータ型
 */
export interface IndexedDBBackup {
  notes: Note[]
  leaves: Leaf[]
  timestamp: number
}

/**
 * IndexedDBのデータをバックアップ（Pull操作前に使用）
 * Pull失敗時にデータを復元するため
 */
export async function createBackup(): Promise<IndexedDBBackup> {
  try {
    const db = await getCurrentDb()
    const [notes, leaves] = await Promise.all([
      getAllFromStore<Note>(db, NOTES_STORE),
      getAllFromStore<Leaf>(db, LEAVES_STORE),
    ])
    return {
      notes: notes.map((note, index) =>
        note.order === undefined ? { ...note, order: index } : note
      ),
      leaves,
      timestamp: Date.now(),
    }
  } catch (error) {
    console.error('Failed to create IndexedDB backup:', error)
    throw error
  }
}

/**
 * バックアップからIndexedDBを復元（Pull失敗時に使用）
 * オフラインリーフは別storeなので影響なし
 */
export async function restoreFromBackup(backup: IndexedDBBackup): Promise<void> {
  if (!backup.notes.length && !backup.leaves.length) {
    console.log('Backup is empty, nothing to restore')
    return
  }

  try {
    console.log(
      `Restoring from backup (${backup.notes.length} notes, ${backup.leaves.length} leaves)`
    )
    const db = await getCurrentDb()
    await replaceAllInStore<Note>(db, NOTES_STORE, backup.notes)
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, backup.leaves)
  } catch (error) {
    console.error('Failed to restore from IndexedDB backup:', error)
    throw error
  }
}
