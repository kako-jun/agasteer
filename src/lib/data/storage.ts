/**
 * LocalStorage操作
 * アプリケーションデータの永続化を担当
 */

import type {
  Settings,
  Note,
  Leaf,
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
 * アプリ状態（settings以外の永続化データ）
 */
export interface AppState {
  isDirty: boolean
  tourShown: boolean
  saveGuideShown: boolean
  pwaInstallDismissedAt?: number // PWAインストールバナー却下時刻（7日間cooldown用）
  lastKnownCommitSha?: string | null // 最後に同期したリモートHEAD commit SHA（stale検出用）
  pushInFlightAt?: number // Push API呼び出し中のタイムスタンプ（スリープによるレスポンス消失検出用）
}

const defaultState: AppState = {
  isDirty: false,
  tourShown: false,
  saveGuideShown: false,
  pwaInstallDismissedAt: undefined,
}

/**
 * LocalStorage全体の構造
 */
interface StorageData {
  settings: Settings
  state: AppState
}

/**
 * LocalStorage全体を読み込む
 */
function loadStorageData(): StorageData {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored) {
    try {
      return JSON.parse(stored) as StorageData
    } catch {
      // パース失敗時はデフォルト値
    }
  }

  const browserLocale = getLocaleFromNavigator()
  const detectedLocale: Locale = browserLocale?.startsWith('ja') ? 'ja' : 'en'

  return {
    settings: { ...defaultSettings, locale: detectedLocale },
    state: { ...defaultState },
  }
}

/**
 * LocalStorage全体を保存
 */
function saveStorageData(data: StorageData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}
const DB_NAME = 'agasteer/db'
const DB_VERSION = 5
const LEAVES_STORE = 'leaves'
const NOTES_STORE = 'notes'
const FONTS_STORE = 'fonts'
const BACKGROUNDS_STORE = 'backgrounds'
const OFFLINE_STORE = 'offline'
const ARCHIVE_LEAVES_STORE = 'archiveLeaves'
const ARCHIVE_NOTES_STORE = 'archiveNotes'

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

/**
 * アプリ状態を読み込む
 */
export function loadAppState(): AppState {
  return loadStorageData().state
}

/**
 * アプリ状態の一部を更新
 */
export function updateAppState(partial: Partial<AppState>): void {
  const data = loadStorageData()
  data.state = { ...data.state, ...partial }
  saveStorageData(data)
}

/**
 * ダーティフラグを取得（起動時チェック用）
 */
export function getPersistedDirtyFlag(): boolean {
  return loadStorageData().state.isDirty
}

/**
 * ダーティフラグを設定
 */
export function setPersistedDirtyFlag(isDirty: boolean): void {
  updateAppState({ isDirty })
}

/**
 * ツアー表示済みフラグを取得
 */
export function isTourShown(): boolean {
  return loadStorageData().state.tourShown
}

/**
 * ツアー表示済みフラグを設定
 */
export function setTourShown(shown: boolean): void {
  updateAppState({ tourShown: shown })
}

/**
 * lastKnownCommitShaを取得（起動時の復元用）
 */
export function getPersistedCommitSha(): string | null {
  return loadStorageData().state.lastKnownCommitSha ?? null
}

/**
 * lastKnownCommitShaを保存
 */
export function setPersistedCommitSha(sha: string | null): void {
  updateAppState({ lastKnownCommitSha: sha })
}

/**
 * 保存ガイド表示済みフラグを取得
 */
export function isSaveGuideShown(): boolean {
  return loadStorageData().state.saveGuideShown ?? false
}

/**
 * 保存ガイド表示済みフラグを設定
 */
export function setSaveGuideShown(shown: boolean): void {
  updateAppState({ saveGuideShown: shown })
}

/**
 * PWAインストールバナー却下時刻を取得
 */
export function getPwaInstallDismissedAt(): number | undefined {
  return loadStorageData().state.pwaInstallDismissedAt
}

/**
 * PWAインストールバナー却下時刻を設定
 */
export function setPwaInstallDismissedAt(timestamp: number | undefined): void {
  updateAppState({ pwaInstallDismissedAt: timestamp })
}

/**
 * Push飛行中フラグを取得（スリープによるレスポンス消失検出用）
 */
export function getPushInFlightAt(): number | undefined {
  return loadStorageData().state.pushInFlightAt
}

/**
 * Push飛行中フラグを設定
 */
export function setPushInFlightAt(timestamp: number | undefined): void {
  updateAppState({ pushInFlightAt: timestamp })
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

// DB接続監視用のコールバック
let onDbClosedCallback: (() => void) | null = null

/**
 * DB接続が予期せず閉じられたときのコールバックを設定
 */
export function setOnDbClosed(callback: (() => void) | null): void {
  onDbClosedCallback = callback
}

/**
 * IndexedDBを開く（note/leaves/fonts/backgrounds用）
 * エラー時は最大3回リトライする
 * マイグレーション処理を明示化し、既存データを保護する
 * タイムアウト付きでハングを防止
 */
async function openAppDB(retryCount = 0): Promise<IDBDatabase> {
  const MAX_RETRIES = 3
  const RETRY_DELAY_MS = 100 // 100ms, 200ms, 300ms
  const TIMEOUT_MS = 5000 // 5秒でタイムアウト

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

    // タイムアウト処理
    timeoutId = setTimeout(() => {
      settle(() => {
        console.error(`IndexedDB open timed out after ${TIMEOUT_MS}ms (attempt ${retryCount + 1})`)
        if (retryCount < MAX_RETRIES) {
          // リトライ
          setTimeout(
            async () => {
              try {
                const db = await openAppDB(retryCount + 1)
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

    const request = indexedDB.open(DB_NAME, DB_VERSION)

    // ブロック時（他のタブで古いバージョンが開いている場合）
    request.onblocked = () => {
      settle(() => {
        console.warn('IndexedDB is blocked by another tab')
        reject(new StorageError('db_blocked', 'Database is blocked by another tab'))
      })
    }

    // マイグレーション処理（既存データを保護しながらストアを追加）
    request.onupgradeneeded = (event) => {
      const db = request.result
      const oldVersion = event.oldVersion

      console.log(`IndexedDB upgrade: ${oldVersion} -> ${DB_VERSION}`)

      try {
        // バージョン0（新規）または1からのアップグレード
        if (oldVersion < 1) {
          // 初回作成
          if (!db.objectStoreNames.contains(LEAVES_STORE)) {
            db.createObjectStore(LEAVES_STORE, { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains(NOTES_STORE)) {
            db.createObjectStore(NOTES_STORE, { keyPath: 'id' })
          }
        }

        // バージョン2からのアップグレード（fontsストア追加）
        if (oldVersion < 2) {
          if (!db.objectStoreNames.contains(FONTS_STORE)) {
            db.createObjectStore(FONTS_STORE, { keyPath: 'name' })
          }
        }

        // バージョン3からのアップグレード（backgroundsストア追加）
        if (oldVersion < 3) {
          if (!db.objectStoreNames.contains(BACKGROUNDS_STORE)) {
            db.createObjectStore(BACKGROUNDS_STORE, { keyPath: 'name' })
          }
        }

        // バージョン4: offline store追加（leaves storeから完全分離）
        if (oldVersion < 4) {
          if (!db.objectStoreNames.contains(OFFLINE_STORE)) {
            db.createObjectStore(OFFLINE_STORE, { keyPath: 'id' })
          }
        }

        // バージョン5: archive stores追加（アーカイブのIndexedDB永続化）
        if (oldVersion < 5) {
          if (!db.objectStoreNames.contains(ARCHIVE_LEAVES_STORE)) {
            db.createObjectStore(ARCHIVE_LEAVES_STORE, { keyPath: 'id' })
          }
          if (!db.objectStoreNames.contains(ARCHIVE_NOTES_STORE)) {
            db.createObjectStore(ARCHIVE_NOTES_STORE, { keyPath: 'id' })
          }
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

        // DB接続監視: 予期しない切断を検知
        db.onclose = () => {
          console.warn('IndexedDB connection closed unexpectedly')
          if (onDbClosedCallback) {
            onDbClosedCallback()
          }
        }

        // エラー監視
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
          // リトライ前に少し待機（エクスポネンシャルバックオフ）
          await new Promise((r) => setTimeout(r, RETRY_DELAY_MS * (retryCount + 1)))
          try {
            const db = await openAppDB(retryCount + 1)
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

function getAllFromStore<T>(db: IDBDatabase, storeName: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readonly')
    const store = tx.objectStore(storeName)
    const request = store.getAll()

    request.onsuccess = () => resolve((request.result as T[]) || [])
    request.onerror = () => reject(request.error)
  })
}

function replaceAllInStore<T extends { id: string }>(
  db: IDBDatabase,
  storeName: string,
  items: T[]
): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, 'readwrite')
    const store = tx.objectStore(storeName)

    tx.oncomplete = () => resolve()
    tx.onerror = () => reject(tx.error)
    tx.onabort = () => reject(tx.error ?? new Error('Transaction aborted'))

    const clearReq = store.clear()
    clearReq.onsuccess = () => {
      for (const item of items) {
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
    const db = await openAppDB()
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
    const db = await openAppDB()
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
    const db = await openAppDB()
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
    const db = await openAppDB()
    await replaceAllInStore<Note>(db, NOTES_STORE, notes)
  } catch (error) {
    console.error('Failed to save notes to IndexedDB:', error)
    throw error
  }
}

/**
 * 全データを削除（notes/leavesストアをクリア）
 * オフラインリーフは別storeなので影響なし
 */
export async function clearAllData(): Promise<void> {
  try {
    const db = await openAppDB()
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
    const db = await openAppDB()
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
    const db = await openAppDB()
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
    const db = await openAppDB()
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
    const db = await openAppDB()
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
    const db = await openAppDB()
    await replaceAllInStore<Leaf>(db, ARCHIVE_LEAVES_STORE, [])
    await replaceAllInStore<Note>(db, ARCHIVE_NOTES_STORE, [])
  } catch (error) {
    console.error('Failed to clear archive data in IndexedDB:', error)
  }
}

/**
 * 汎用: アイテムを保存
 */
async function putItem<T>(storeName: string, item: T): Promise<void> {
  const db = await openAppDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await new Promise<void>((resolve, reject) => {
    const request = store.put(item)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * カスタムフォントを保存
 */
export async function saveCustomFont(font: CustomFont): Promise<void> {
  try {
    await putItem(FONTS_STORE, font)
  } catch (error) {
    console.error('Failed to save custom font to IndexedDB:', error)
    throw error
  }
}

/**
 * 汎用: アイテムを読み込む
 */
async function getItem<T>(storeName: string, key: string): Promise<T | null> {
  const db = await openAppDB()
  const tx = db.transaction(storeName, 'readonly')
  const store = tx.objectStore(storeName)
  return await new Promise<T | null>((resolve, reject) => {
    const request = store.get(key)
    request.onsuccess = () => resolve((request.result as T) || null)
    request.onerror = () => reject(request.error)
  })
}

/**
 * カスタムフォントを読み込む
 */
export async function loadCustomFont(name: string): Promise<CustomFont | null> {
  try {
    return await getItem<CustomFont>(FONTS_STORE, name)
  } catch (error) {
    console.error('Failed to load custom font from IndexedDB:', error)
    return null
  }
}

/**
 * 汎用: アイテムを削除
 */
async function deleteItem(storeName: string, key: string): Promise<void> {
  const db = await openAppDB()
  const tx = db.transaction(storeName, 'readwrite')
  const store = tx.objectStore(storeName)
  await new Promise<void>((resolve, reject) => {
    const request = store.delete(key)
    request.onsuccess = () => resolve()
    request.onerror = () => reject(request.error)
  })
}

/**
 * カスタムフォントを削除
 */
export async function deleteCustomFont(name: string): Promise<void> {
  try {
    await deleteItem(FONTS_STORE, name)
  } catch (error) {
    console.error('Failed to delete custom font from IndexedDB:', error)
    throw error
  }
}

/**
 * カスタム背景画像を保存
 */
export async function saveCustomBackground(background: CustomBackground): Promise<void> {
  try {
    await putItem(BACKGROUNDS_STORE, background)
  } catch (error) {
    console.error('Failed to save custom background to IndexedDB:', error)
    throw error
  }
}

/**
 * カスタム背景画像を読み込む
 */
export async function loadCustomBackground(name: string): Promise<CustomBackground | null> {
  try {
    return await getItem<CustomBackground>(BACKGROUNDS_STORE, name)
  } catch (error) {
    console.error('Failed to load custom background from IndexedDB:', error)
    return null
  }
}

/**
 * カスタム背景画像を削除
 */
export async function deleteCustomBackground(name: string): Promise<void> {
  try {
    await deleteItem(BACKGROUNDS_STORE, name)
  } catch (error) {
    console.error('Failed to delete custom background from IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを保存（専用storeに保存、Pull/Pushの影響を受けない）
 */
export async function saveOfflineLeaf(leaf: Leaf): Promise<void> {
  try {
    await putItem(OFFLINE_STORE, leaf)
  } catch (error) {
    console.error('Failed to save offline leaf to IndexedDB:', error)
    throw error
  }
}

/**
 * オフラインリーフを読み込む（専用storeから読み込み）
 */
export async function loadOfflineLeaf(id: string): Promise<Leaf | null> {
  try {
    return await getItem<Leaf>(OFFLINE_STORE, id)
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
    const db = await openAppDB()
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
    const db = await openAppDB()
    await replaceAllInStore<Note>(db, NOTES_STORE, backup.notes)
    await replaceAllInStore<Leaf>(db, LEAVES_STORE, backup.leaves)
  } catch (error) {
    console.error('Failed to restore from IndexedDB backup:', error)
    throw error
  }
}
