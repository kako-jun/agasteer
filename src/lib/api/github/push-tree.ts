/**
 * GitHub Push 側の tree 構築・メタデータ生成（純粋層）
 *
 * fetch・settings・IO に一切触れない。入力→出力が決定的な変換のみを置く
 * （sha 計算の await は入るが fetch 非依存＝純粋扱い）。
 * github.ts の pushAllWithTreeAPI から純移動（Phase 3 / #226）。振る舞いは不変。
 *
 * fetch オーケストレーション（repo/ref/commit GET・tree/commit POST・ref PATCH・
 * rate-limit/error 分岐・空リポ初期化 PUT・truncated throw・差分後のアーカイブ保全と
 * home metadata.json の append）は github.ts 側に残す。
 */

import type { Leaf, Metadata, Note } from '../../types'
import { PRIORITY_LEAF_ID } from '../../utils'
import {
  NOTES_PATH,
  ARCHIVE_PATH,
  ARCHIVE_METADATA_PATH,
  getFolderPath,
  getNotePath,
  buildPath,
} from './paths'
import { calculateGitBlobSha } from './sha'

/** GitHub Tree API の tree エントリ形状（content か sha のどちらかを持つ blob） */
export interface TreeItem {
  path: string
  mode: string
  type: string
  content?: string
  sha?: string
}

/** buildPushMetadata の入力 */
export interface BuildPushMetadataParams {
  notes: Note[]
  leaves: Leaf[]
  localMetadata?: Metadata
  existingMetadata: Metadata
  pushCount: number
  world: 'home' | 'archive'
}

/**
 * notes/leaves から push 用の Metadata オブジェクトを構築する（同期・完全純粋）。
 *
 * - undefined の badge は含めない（元インライン実装と同じく meta に代入しない）
 * - home 側のみ __priority__ 仮想リーフのバッジ情報を復元する。
 *   復元元は `localMetadata?.leaves?.[PRIORITY_LEAF_ID] || existingMetadata?.leaves?.[PRIORITY_LEAF_ID]`
 *   の優先順（ローカルストア優先・なければ GitHub 既存）。
 *   priority エントリは updatedAt:0 / order:0 をハードコードで付与する
 *   （normalizeMetadata の updatedAt=0 固定とは別ロジック。統合しない）。
 * - archive 側は pushCount:0・priority 復元なし（呼び出し側で world='archive' を渡す）。
 */
export function buildPushMetadata(params: BuildPushMetadataParams): Metadata {
  const { notes, leaves, localMetadata, existingMetadata, pushCount, world } = params
  const basePath = world === 'home' ? NOTES_PATH : ARCHIVE_PATH

  const metadata: Metadata = {
    version: 1,
    notes: {},
    leaves: {},
    pushCount,
  }

  // ノートのメタ情報を追加（undefinedは含めない）
  for (const note of notes) {
    const folderPath = getFolderPath(note, notes)
    const meta: Record<string, unknown> = {
      id: note.id,
      order: note.order,
    }
    if (note.badgeIcon !== undefined) meta.badgeIcon = note.badgeIcon
    if (note.badgeColor !== undefined) meta.badgeColor = note.badgeColor
    metadata.notes[folderPath] = meta as Metadata['notes'][string]
  }

  // リーフのメタ情報を追加（undefinedは含めない）
  for (const leaf of leaves) {
    const fullPath = buildPath(leaf, notes, world)
    // ベースパス(.agasteer/notes/ or .agasteer/archive/)を除去して相対パスにする
    const path = fullPath.replace(new RegExp(`^${basePath}/`), '')
    const meta: Record<string, unknown> = {
      id: leaf.id,
      updatedAt: leaf.updatedAt,
      order: leaf.order,
    }
    if (leaf.badgeIcon !== undefined) meta.badgeIcon = leaf.badgeIcon
    if (leaf.badgeColor !== undefined) meta.badgeColor = leaf.badgeColor
    metadata.leaves[path] = meta as Metadata['leaves'][string]
  }

  // 仮想リーフ（Priority）のバッジ情報を保持（home のみ）
  // 仮想リーフはGitにファイルとして保存されないが、バッジ情報はmetadataで永続化
  // ローカルのmetadataストアを優先し、なければGitHubの既存metadataから復元
  if (world === 'home') {
    const priorityMeta =
      localMetadata?.leaves?.[PRIORITY_LEAF_ID] || existingMetadata?.leaves?.[PRIORITY_LEAF_ID]
    if (
      priorityMeta &&
      (priorityMeta.badgeIcon !== undefined || priorityMeta.badgeColor !== undefined)
    ) {
      metadata.leaves[PRIORITY_LEAF_ID] = {
        id: PRIORITY_LEAF_ID,
        updatedAt: 0, // 固定値（仮想リーフなので実際の更新時刻は不要、比較時の差分を防ぐ）
        order: 0,
        badgeIcon: priorityMeta.badgeIcon,
        badgeColor: priorityMeta.badgeColor,
      }
    }
  }

  return metadata
}

/** buildTreeItems の入力 */
export interface BuildTreeItemsParams {
  notes: Note[]
  leaves: Leaf[]
  archiveNotes?: Note[]
  archiveLeaves?: Leaf[]
  isArchiveLoaded: boolean
  existingNotesFiles: Map<string, string>
  existingArchiveFiles: Map<string, string>
  preserveItems: TreeItem[]
  emptyGitkeepSha: string
  /** アーカイブがロード済みの場合の archive 用 Metadata（metadata.json content 化に使う raw） */
  archiveMetadata?: Metadata
}

export interface BuildTreeItemsResult {
  treeItems: TreeItem[]
  changedHomeLeafPaths: string[]
  changedArchiveLeafPaths: string[]
}

/**
 * push 用の tree エントリ配列を構築する（async・fetch 非依存）。
 *
 * 生成順（POST /git/trees の tree 配列順として pin されている・崩さない）:
 *   1. preserve（.agasteer 以外の保全）
 *   2. .agasteer/notes/.gitkeep
 *   3. 各ノートの .gitkeep（home）
 *   4. home リーフ blob（既存 sha 一致なら sha 再利用・違えば content 送信）
 *   5. アーカイブがロード済みなら: archive/.gitkeep → archive 各ノート .gitkeep →
 *      archive リーフ blob → archive metadata.json（raw JSON.stringify）
 *
 * ※ 変更なし時の early return より後に来る「アーカイブ未ロード時の既存 archive 保全」と
 *   「home metadata.json の append（normalizeMetadata(…, pushCount+1)）」は
 *   この関数に含めず github.ts 側に残す（早期 return と不可分・非対称のため）。
 */
export async function buildTreeItems(params: BuildTreeItemsParams): Promise<BuildTreeItemsResult> {
  const {
    notes,
    leaves,
    archiveNotes,
    archiveLeaves,
    isArchiveLoaded,
    existingNotesFiles,
    existingArchiveFiles,
    preserveItems,
    emptyGitkeepSha,
    archiveMetadata,
  } = params

  const treeItems: TreeItem[] = []

  // notes/以外のファイルを保持
  for (const item of preserveItems) {
    treeItems.push(item)
  }

  // .agasteer/notes/.gitkeep を追加（notesディレクトリが空でも削除されないように）
  const notesGitkeepPath = `${NOTES_PATH}/.gitkeep`
  const notesGitkeepExisting = existingNotesFiles.get(notesGitkeepPath)
  treeItems.push({
    path: notesGitkeepPath,
    mode: '100644',
    type: 'blob',
    ...(notesGitkeepExisting === emptyGitkeepSha ? { sha: notesGitkeepExisting } : { content: '' }),
  })

  // 全ノートに対して.gitkeepを配置（リーフがなくてもディレクトリを保持）
  for (const note of notes) {
    const notePath = getNotePath(note, notes, 'home')
    const gitkeepPath = `${notePath}/.gitkeep`
    const gitkeepExisting = existingNotesFiles.get(gitkeepPath)
    treeItems.push({
      path: gitkeepPath,
      mode: '100644',
      type: 'blob',
      ...(gitkeepExisting === emptyGitkeepSha ? { sha: gitkeepExisting } : { content: '' }),
    })
  }

  const changedHomeLeafPaths: string[] = []
  const changedArchiveLeafPaths: string[] = []

  // 全リーフをTreeに追加（変化していないファイルは既存SHAを使用）
  for (const leaf of leaves) {
    const path = buildPath(leaf, notes, 'home')
    const existingSha = existingNotesFiles.get(path)

    if (existingSha) {
      // 既存ファイルがある場合、SHAを計算して比較
      const localSha = await calculateGitBlobSha(leaf.content)
      if (localSha === existingSha) {
        // 変化なし → 既存のSHAを使用（転送量削減）
        treeItems.push({
          path,
          mode: '100644',
          type: 'blob',
          sha: existingSha,
        })
        continue
      }
    }

    // 新規ファイルまたは変化あり → contentを送信
    treeItems.push({
      path,
      mode: '100644',
      type: 'blob',
      content: leaf.content,
    })
    changedHomeLeafPaths.push(path)
  }

  // アーカイブの処理（hasAnyChangesチェックの前に実行し、アーカイブの変更も検出する）
  if (isArchiveLoaded && archiveNotes && archiveLeaves) {
    // アーカイブの.gitkeep
    const archiveGitkeepPath = `${ARCHIVE_PATH}/.gitkeep`
    const archiveGitkeepExisting = existingArchiveFiles.get(archiveGitkeepPath)
    treeItems.push({
      path: archiveGitkeepPath,
      mode: '100644',
      type: 'blob',
      ...(archiveGitkeepExisting === emptyGitkeepSha
        ? { sha: archiveGitkeepExisting }
        : { content: '' }),
    })

    // アーカイブノートの.gitkeep
    for (const note of archiveNotes) {
      const notePath = getNotePath(note, archiveNotes, 'archive')
      const gitkeepPath = `${notePath}/.gitkeep`
      const gitkeepExisting = existingArchiveFiles.get(gitkeepPath)
      treeItems.push({
        path: gitkeepPath,
        mode: '100644',
        type: 'blob',
        ...(gitkeepExisting === emptyGitkeepSha ? { sha: gitkeepExisting } : { content: '' }),
      })
    }

    // アーカイブリーフ
    for (const leaf of archiveLeaves) {
      const path = buildPath(leaf, archiveNotes, 'archive')
      const existingSha = existingArchiveFiles.get(path)

      if (existingSha) {
        const localSha = await calculateGitBlobSha(leaf.content)
        if (localSha === existingSha) {
          treeItems.push({
            path,
            mode: '100644',
            type: 'blob',
            sha: existingSha,
          })
          continue
        }
      }

      treeItems.push({
        path,
        mode: '100644',
        type: 'blob',
        content: leaf.content,
      })
      changedArchiveLeafPaths.push(path)
    }

    // アーカイブのmetadata.json（raw JSON.stringify・normalize しない・pushCount は常に 0）
    const archiveMetaContent = JSON.stringify(archiveMetadata, null, 2)
    treeItems.push({
      path: ARCHIVE_METADATA_PATH,
      mode: '100644',
      type: 'blob',
      content: archiveMetaContent,
    })
  }

  return { treeItems, changedHomeLeafPaths, changedArchiveLeafPaths }
}
