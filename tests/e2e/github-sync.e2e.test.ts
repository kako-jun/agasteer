/**
 * 実 GitHub 往復 e2e テスト（#231）
 *
 * pushAllWithTreeAPI / pullFromGitHub を **実際の GitHub API** に対して呼び、
 * notes ツリー（.agasteer/notes/）の push→pull 往復健全性・冪等性・増分反映を検証する。
 * fetch はモックしない。
 *
 * ## 通常は丸ごと skip される
 * 後述の env が全て揃い、かつ AGASTEER_E2E_ALLOW_WRITES=1 が明示されたときだけ走る。
 * env が無ければ `describe.skipIf` で describe ごと skip され、通常の `npm test` は
 * 影響を受けない（緑のまま、本テストは skipped 表示）。
 *
 * ## 必要な env
 *   AGASTEER_E2E_GITHUB_TOKEN  fine-grained PAT（テスト用リポだけに Contents read/write）
 *   AGASTEER_E2E_OWNER         テスト用リポの owner（例: kako-jun）
 *   AGASTEER_E2E_REPO          テスト用リポ名（例: agasteer-e2e-fixture）
 *   AGASTEER_E2E_ALLOW_WRITES  "1" のときだけ書き込みを許可（誤爆防止の必須フラグ）
 *
 * 注: ブランチは指定しない。sync 層（push/pull）はリポの default branch を自動検出する。
 *
 * ## 危険性（ランブック docs/development/e2e-setup.md 参照）
 * このアプリの push は notes ツリー全体を**上書き再構築**する。本物の notes リポを
 * 誤って指すと中身を破壊する。だから「中身が消えてよい使い捨てリポ」+ ALLOW_WRITES
 * フラグの二重ガードを掛けている。
 *
 * ## 実 GitHub に対して検証済み
 * 2026-07-15 に使い捨てリポ kako-jun/agasteer-test で実 GitHub 往復を green 確認済み
 * （#226 Phase 3 リファクタの実機 golden path 検証）。実ネットワークは5秒を超えるため
 * 各テストに E2E_TIMEOUT(60秒) を設定。env 無しでは従来どおり describe ごと skip。
 */

import { describe, expect, it, beforeAll, afterAll } from 'vitest'

import type { Leaf, Note, Metadata, Settings } from '../../src/lib/types'

// github.ts は ../utils バレル経由で stores を巻き込み、モジュール読み込み時に
// localStorage に触れる（characterization テストと同じ理由）。静的 import だと
// 評価順で落ちるため、localStorage をスタブしてから動的 import する。
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

const { pushAllWithTreeAPI, pullFromGitHub } = await import('../../src/lib/api/github')

// ============================================
// env ゲート
// ============================================

const env = (k: string): string | undefined => {
  const v = process.env[k]
  return v && v.length > 0 ? v : undefined
}

const E2E_TOKEN = env('AGASTEER_E2E_GITHUB_TOKEN')
const E2E_OWNER = env('AGASTEER_E2E_OWNER')
const E2E_REPO = env('AGASTEER_E2E_REPO')
const E2E_ALLOW_WRITES = env('AGASTEER_E2E_ALLOW_WRITES') === '1'

/**
 * 全ガードが揃って初めて true。
 * - token / owner / repo が揃う
 * - ALLOW_WRITES=1 が明示されている（誤爆防止）
 */
const hasE2eEnv = Boolean(E2E_TOKEN && E2E_OWNER && E2E_REPO && E2E_ALLOW_WRITES)

// ============================================
// テスト用データ構築ヘルパ
// ============================================

const REPO_NAME = `${E2E_OWNER}/${E2E_REPO}`

// 実 GitHub 往復は push→pull で複数ラウンドトリップ＋blob 操作が走り、vitest 既定の
// 5秒では足りずタイムアウトする。ネットワーク遅延に耐える余裕を持たせる。
const E2E_TIMEOUT = 60000

function makeSettings(): Settings {
  return {
    token: E2E_TOKEN ?? '',
    repoName: REPO_NAME,
    theme: 'yomi',
    toolName: 'Agasteer',
    locale: 'ja',
  }
}

let noteSeq = 0
let leafSeq = 0

function makeNote(name: string, opts: Partial<Note> = {}): Note {
  noteSeq += 1
  return {
    id: opts.id ?? `e2e-note-${noteSeq}`,
    name,
    parentId: opts.parentId,
    order: opts.order ?? noteSeq,
    badgeIcon: opts.badgeIcon,
    badgeColor: opts.badgeColor,
  }
}

function makeLeaf(title: string, noteId: string, content: string, opts: Partial<Leaf> = {}): Leaf {
  leafSeq += 1
  return {
    id: opts.id ?? `e2e-leaf-${leafSeq}`,
    title,
    noteId,
    content,
    updatedAt: opts.updatedAt ?? 1_700_000_000_000 + leafSeq,
    order: opts.order ?? leafSeq,
    badgeIcon: opts.badgeIcon,
    badgeColor: opts.badgeColor,
  }
}

/**
 * push した内容と pull した内容を**パス・本文ベース**で比較するための正規化。
 *
 * push は leaf.title をファイル名に、note 階層をディレクトリにして
 * `<note>/.../<title>.md` という相対パスを作る。pull はそのパスから title を、
 * metadata から id/order/noteId/updatedAt を復元する。
 * よって「相対パス → 本文」の Map と「ノート名 → 親ノート名」の集合が一致すれば往復健全。
 */
function leafPathContentMap(leaves: Leaf[], notes: Note[]): Map<string, string> {
  const noteById = new Map(notes.map((n) => [n.id, n]))
  const folderPath = (note: Note): string => {
    const parent = note.parentId ? noteById.get(note.parentId) : undefined
    return parent ? `${parent.name}/${note.name}` : note.name
  }
  const sanitize = (raw: string): string => {
    const cleaned = raw.replace(/[\\/:*?"<>|#]/g, '-').replace(/\s+/g, ' ')
    const limited = cleaned.slice(0, 80)
    return limited.length === 0 ? 'Untitled' : limited
  }
  const map = new Map<string, string>()
  for (const leaf of leaves) {
    const note = noteById.get(leaf.noteId)
    const dir = note ? folderPath(note) : ''
    const rel = dir ? `${dir}/${sanitize(leaf.title)}.md` : `${sanitize(leaf.title)}.md`
    map.set(rel, leaf.content)
  }
  return map
}

/** ノート集合を「フルパス」で表現（親名/子名）。pull 後の構造比較に使う。 */
function noteFullPaths(notes: Note[]): Set<string> {
  const byId = new Map(notes.map((n) => [n.id, n]))
  const full = (note: Note): string => {
    const parent = note.parentId ? byId.get(note.parentId) : undefined
    return parent ? `${parent.name}/${note.name}` : note.name
  }
  return new Set(notes.map(full))
}

// 全 run 通しで使う既知 fixture 状態（複数ノート・サブフォルダ・日本語/絵文字・metadata）
function buildBaseState(): { leaves: Leaf[]; notes: Note[]; metadata: Metadata } {
  noteSeq = 0
  leafSeq = 0

  const rootA = makeNote('日記', { order: 0, badgeIcon: 'pencil', badgeColor: '#46B278' })
  const rootB = makeNote('Tech', { order: 1 })
  const subB = makeNote('rust 🦀', { parentId: rootB.id, order: 0 })

  const notes: Note[] = [rootA, rootB, subB]

  const leaves: Leaf[] = [
    makeLeaf('今日の出来事', rootA.id, '# 今日\n\nお茶を飲んだ。🍵\n', {
      order: 0,
      badgeIcon: 'star',
    }),
    makeLeaf('memo', rootB.id, 'plain ascii note\n', { order: 0 }),
    makeLeaf('所有権 🦀', subB.id, '# Ownership\n\nborrow checker と仲良く。\n絵文字 ✅\n', {
      order: 0,
    }),
  ]

  const metadata: Metadata = { version: 1, notes: {}, leaves: {}, pushCount: 0 }
  return { leaves, notes, metadata }
}

// ============================================
// テスト本体（env 無しでは describe ごと skip）
// ============================================

describe.skipIf(!hasE2eEnv)('e2e: real GitHub sync round-trip', () => {
  const settings = makeSettings()

  beforeAll(() => {
    // 念押しのガード。万一 skipIf を抜けても ALLOW_WRITES 無しでは絶対に書かない。
    if (!E2E_ALLOW_WRITES) {
      throw new Error(
        'AGASTEER_E2E_ALLOW_WRITES=1 is required to run write-heavy e2e tests. Refusing to write.'
      )
    }
  })

  afterAll(async () => {
    // 後始末: 既知のベース状態へ reset push して、次回 run をクリーンに保つ。
    if (!hasE2eEnv) return
    const { leaves, notes, metadata } = buildBaseState()
    await pushAllWithTreeAPI({ leaves, notes, settings, localMetadata: metadata })
  }, E2E_TIMEOUT)

  // 順序依存（直列）。push した状態を後続テストが前提にするため it.sequential 相当に
  // 並べる。vitest はファイル内テストを宣言順に直列実行する（並列化は別ファイル間のみ）。

  it(
    'e2e push then pull yields identical paths, content, and note structure',
    async () => {
      const { leaves, notes, metadata } = buildBaseState()

      const pushed = await pushAllWithTreeAPI({ leaves, notes, settings, localMetadata: metadata })
      expect(pushed.success, `push failed: ${pushed.message} ${pushed.errorCode ?? ''}`).toBe(true)

      // 別の空状態へ pull
      const pull = await pullFromGitHub(settings)
      expect(pull.success, `pull failed: ${pull.message} ${pull.errorCode ?? ''}`).toBe(true)

      // 往復一致: パス→本文の Map が一致
      const expectedMap = leafPathContentMap(leaves, notes)
      const actualMap = leafPathContentMap(pull.leaves, pull.notes)
      expect(actualMap.size).toBe(expectedMap.size)
      for (const [path, content] of expectedMap) {
        expect(actualMap.has(path), `missing leaf path after pull: ${path}`).toBe(true)
        expect(actualMap.get(path)).toBe(content)
      }

      // ノート構造（サブフォルダ含む）一致
      const expectedNotes = noteFullPaths(notes)
      const actualNotes = noteFullPaths(pull.notes)
      expect(actualNotes).toEqual(expectedNotes)

      // metadata 健全性: pull した metadata.leaves に各リーフ相対パスのエントリがある
      for (const path of expectedMap.keys()) {
        expect(
          pull.metadata.leaves[path],
          `metadata.leaves missing entry for ${path}`
        ).toBeDefined()
      }
    },
    E2E_TIMEOUT
  )

  it(
    'e2e idempotent push reports noChanges on identical state',
    async () => {
      const { leaves, notes, metadata } = buildBaseState()

      // 1 回目（前テストの状態と同一なので noChanges になる想定だが、念のため push）
      await pushAllWithTreeAPI({ leaves, notes, settings, localMetadata: metadata })

      // 2 回目: 同一状態 → 変更なし経路
      const again = await pushAllWithTreeAPI({ leaves, notes, settings, localMetadata: metadata })
      expect(again.success).toBe(true)
      expect(again.message).toBe('github.noChanges')
      expect(again.changedLeafCount ?? 0).toBe(0)
    },
    E2E_TIMEOUT
  )

  it(
    'e2e incremental: editing one leaf is reflected on next pull',
    async () => {
      const { leaves, notes, metadata } = buildBaseState()
      await pushAllWithTreeAPI({ leaves, notes, settings, localMetadata: metadata })

      // 1 リーフだけ本文を変更
      const edited = leaves.map((l) =>
        l.title === 'memo' ? { ...l, content: 'plain ascii note\n\nEDITED ✏️\n' } : l
      )

      const pushed = await pushAllWithTreeAPI({
        leaves: edited,
        notes,
        settings,
        localMetadata: metadata,
      })
      expect(pushed.success).toBe(true)
      // 変更ありなので noChanges ではないこと、変更リーフ数 1 を期待
      expect(pushed.message).not.toBe('github.noChanges')
      expect(pushed.changedLeafCount).toBe(1)

      const pull = await pullFromGitHub(settings)
      expect(pull.success).toBe(true)
      const actualMap = leafPathContentMap(pull.leaves, pull.notes)
      // memo は Tech ノート直下なので相対パスは `Tech/memo.md`
      expect(actualMap.get('Tech/memo.md')).toBe('plain ascii note\n\nEDITED ✏️\n')
    },
    E2E_TIMEOUT
  )
})

// env 無しのときに「ちゃんと skip された」ことを可視化する軽量テスト（常に走る）。
// hasE2eEnv が false なら 1 件 green、true なら skip（本体側で実検証するため）。
describe('e2e gate sanity (always runs)', () => {
  it.skipIf(hasE2eEnv)('e2e suite is skipped when env is absent', () => {
    expect(hasE2eEnv).toBe(false)
  })
})
