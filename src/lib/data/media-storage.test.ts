/**
 * media-storage（mediaPending / mediaCache アクセサ）と DB v1→v2 移行のテスト（#242）
 *
 * fake-indexeddb で per-repo IndexedDB を再現する。storage.ts はモジュールレベルに
 * DB ハンドルキャッシュを持つため、テストごとに vi.resetModules() + 動的 import で
 * 素の状態から開き直す。
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'

const REPO_KEY = 'owner/repo'
const DB_NAME = 'agasteer/db/owner__repo'

// storage.ts はモジュール読み込み時に localStorage を触る（#131 移行チェック）ため、
// 既存 characterization テストに倣ってスタブする。
const storageBacking = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => storageBacking.get(k) ?? null,
  setItem: (k: string, v: string) => void storageBacking.set(k, v),
  removeItem: (k: string) => void storageBacking.delete(k),
  clear: () => storageBacking.clear(),
  key: (i: number) => Array.from(storageBacking.keys())[i] ?? null,
  get length() {
    return storageBacking.size
  },
}

/** localStorage に「設定済み・#131 移行済み」の状態を仕込む */
function seedLocalStorage(): void {
  storageBacking.clear()
  storageBacking.set(
    'agasteer',
    JSON.stringify({
      settings: { token: '', repoName: REPO_KEY },
      globalState: { tourShown: true, saveGuideShown: true },
      byRepo: {},
      v131Migrated: true,
    })
  )
}

/** 素の media-storage / storage を fresh な fake IndexedDB とともに読み込む */
async function loadModules() {
  vi.resetModules()
  const storage = await import('./storage')
  const mediaStorage = await import('./media-storage')
  return { storage, mediaStorage }
}

function makePendingItem(overrides: Partial<import('./media-storage').MediaPendingItem> = {}) {
  return {
    filename: '20260709-abcd1234-photo.png',
    url: 'https://raw.githubusercontent.com/owner/repo-media/main/20260709-abcd1234-photo.png',
    data: new Uint8Array([1, 2, 3]).buffer as ArrayBuffer,
    size: 3,
    mimeType: 'image/png',
    enqueuedAt: 1000,
    ...overrides,
  }
}

beforeEach(() => {
  // テストごとに空の IndexedDB 世界を作る
  vi.stubGlobal('indexedDB', new IDBFactory())
  seedLocalStorage()
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

// ============================================
// DB v1 → v2 移行
// ============================================
describe('per-repo DB の v1→v2 移行', () => {
  it('v1 の既存データを無傷に保ったまま media 用 store が追加される', async () => {
    // v1 構造の DB（leaves/notes/offline/archive×2）をデータ入りで作っておく
    const v1Db = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 1)
      request.onupgradeneeded = () => {
        const db = request.result
        db.createObjectStore('leaves', { keyPath: 'id' })
        db.createObjectStore('notes', { keyPath: 'id' })
        db.createObjectStore('offline', { keyPath: 'id' })
        db.createObjectStore('archiveLeaves', { keyPath: 'id' })
        db.createObjectStore('archiveNotes', { keyPath: 'id' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    await new Promise<void>((resolve, reject) => {
      const tx = v1Db.transaction(['leaves', 'notes'], 'readwrite')
      tx.objectStore('leaves').put({ id: 'leaf-1', title: 'existing leaf', content: 'body' })
      tx.objectStore('notes').put({ id: 'note-1', name: 'existing note', order: 0 })
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    v1Db.close()

    const { storage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)
    const db = await storage.getCurrentDb()

    // v2 で新 store が存在する
    expect(db.version).toBe(2)
    expect(Array.from(db.objectStoreNames)).toEqual(
      expect.arrayContaining(['mediaPending', 'mediaCache'])
    )
    // 既存データが無傷で読める
    const leaves = await storage.loadLeaves()
    expect(leaves).toEqual([{ id: 'leaf-1', title: 'existing leaf', content: 'body' }])
    const notes = await storage.loadNotes()
    expect(notes).toEqual([{ id: 'note-1', name: 'existing note', order: 0 }])
  })

  it('接続保持中に上位バージョンの open が来ても blocked にならない（onversionchange で自ら閉じる）', async () => {
    const { storage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)
    await storage.getCurrentDb() // v2 接続を握った状態にする

    let blocked = false
    const db3 = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, 3)
      request.onblocked = () => {
        blocked = true
      }
      request.onupgradeneeded = () => {
        // スキーマ変更なし（バージョンだけ上げる）
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })

    expect(blocked).toBe(false)
    expect(db3.version).toBe(3)
    db3.close()
  })

  it('新規 DB でも全 7 store が揃う', async () => {
    const { storage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)
    const db = await storage.getCurrentDb()

    expect(Array.from(db.objectStoreNames).sort()).toEqual(
      [
        'archiveLeaves',
        'archiveNotes',
        'leaves',
        'mediaCache',
        'mediaPending',
        'notes',
        'offline',
      ].sort()
    )
  })
})

// ============================================
// mediaPending アクセサ
// ============================================
describe('mediaPending アクセサ', () => {
  it('MediaPendingItem の put→get で ArrayBuffer が byte 単位で無傷に戻る', async () => {
    const { storage, mediaStorage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)

    const bytes = new Uint8Array(256)
    for (let i = 0; i < bytes.length; i++) bytes[i] = i
    const item = makePendingItem({ data: bytes.buffer as ArrayBuffer, size: bytes.length })
    await mediaStorage.putPendingMedia(item)

    const loaded = await mediaStorage.getPendingMedia(item.filename)
    expect(loaded).not.toBeNull()
    expect(loaded!.url).toBe(item.url)
    expect(loaded!.mimeType).toBe('image/png')
    expect(loaded!.enqueuedAt).toBe(1000)
    expect(Array.from(new Uint8Array(loaded!.data))).toEqual(Array.from(bytes))
  })

  it('structured clone できない値の put は Promise reject になる', async () => {
    const { storage, mediaStorage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)

    const bad = makePendingItem() as Record<string, unknown>
    bad.callback = () => {} // 関数は structured clone 不可
    await expect(
      mediaStorage.putPendingMedia(bad as unknown as import('./media-storage').MediaPendingItem)
    ).rejects.toThrow()
  })

  it('getAllPendingMedia は挿入順に依らず enqueuedAt 昇順で返す', async () => {
    const { storage, mediaStorage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)

    // キー順（a→b→c）と enqueuedAt 順が食い違うように入れる
    await mediaStorage.putPendingMedia(makePendingItem({ filename: 'a.png', enqueuedAt: 300 }))
    await mediaStorage.putPendingMedia(makePendingItem({ filename: 'b.png', enqueuedAt: 100 }))
    await mediaStorage.putPendingMedia(makePendingItem({ filename: 'c.png', enqueuedAt: 200 }))

    const items = await mediaStorage.getAllPendingMedia()
    expect(items.map((i) => i.filename)).toEqual(['b.png', 'c.png', 'a.png'])
  })

  it('未存在キーの get は null を返す', async () => {
    const { storage, mediaStorage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)

    expect(await mediaStorage.getPendingMedia('no-such-file.png')).toBeNull()
    expect(await mediaStorage.getCachedMedia('https://example.invalid/none')).toBeNull()
  })
})

// ============================================
// mediaCache アクセサ
// ============================================
describe('mediaCache アクセサ', () => {
  it('getAllCachedMediaMeta は url/size/lastAccessedAt のみで data を含まない', async () => {
    const { storage, mediaStorage } = await loadModules()
    await storage.setCurrentRepo(REPO_KEY)

    const url = 'https://raw.githubusercontent.com/owner/repo-media/main/x.png'
    await mediaStorage.putCachedMedia({
      url,
      data: new Uint8Array([9, 9, 9]).buffer as ArrayBuffer,
      size: 3,
      lastAccessedAt: 42,
    })

    const metas = await mediaStorage.getAllCachedMediaMeta()
    expect(metas).toEqual([{ url, size: 3, lastAccessedAt: 42 }])
    expect(metas[0]).not.toHaveProperty('data')
  })
})
