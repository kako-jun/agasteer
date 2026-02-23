import JSZip from 'jszip'
import type { Leaf, Note, Metadata } from '../types'
import { get } from 'svelte/store'
import { leaves } from '../stores'
import { showPushToast } from '../ui'

/**
 * リーフをMarkdownファイルとしてダウンロード
 */
export function downloadLeafAsMarkdown(
  leafId: string,
  isOperationsLocked: boolean,
  translate: (key: string) => string
): void {
  if (isOperationsLocked) {
    showPushToast(translate('toast.needInitialPullDownload'), 'error')
    return
  }

  const allLeaves = get(leaves)
  const targetLeaf = allLeaves.find((l) => l.id === leafId)
  if (!targetLeaf) return

  const blob = new Blob([targetLeaf.content], { type: 'text/markdown' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${targetLeaf.title}.md`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

export interface ExportNotesOptions {
  gitPolicyLine: string
  infoFooterLine: string
}

export type ExportNotesFailure = 'empty' | 'error'

export interface ExportNotesResult {
  success: boolean
  blob?: Blob
  reason?: ExportNotesFailure
  error?: unknown
}

/**
 * .agasteer/ 配下の構造（notes/ と archive/）と metadata.json を含む ZIP を生成する。
 * .git は含めない（履歴なしの作業ツリー相当）。
 */
export async function buildNotesZip(
  notes: Note[],
  leaves: Leaf[],
  metadata: Metadata | undefined,
  options: ExportNotesOptions,
  archiveNotes: Note[] = [],
  archiveLeaves: Leaf[] = [],
  archiveMetadata: Metadata | undefined = undefined
): Promise<ExportNotesResult> {
  if (
    notes.length === 0 &&
    leaves.length === 0 &&
    archiveNotes.length === 0 &&
    archiveLeaves.length === 0
  ) {
    return { success: false, reason: 'empty' }
  }

  try {
    const zip = new JSZip()
    const agasteerFolder = zip.folder('.agasteer')
    if (!agasteerFolder) {
      throw new Error('Failed to create .agasteer folder in ZIP')
    }

    const notesFolder = agasteerFolder.folder('notes')
    if (!notesFolder) {
      throw new Error('Failed to create notes folder in ZIP')
    }

    // ルートに.gitkeep
    notesFolder.file('.gitkeep', '')

    const noteMap = new Map<string, Note>(notes.map((n) => [n.id, n]))
    const buildFolderPath = (note: Note): string => {
      const segments: string[] = []
      let current: Note | undefined | null = note
      while (current) {
        segments.unshift(current.name)
        current = current.parentId ? noteMap.get(current.parentId) || null : null
      }
      return segments.join('/')
    }

    // ノートごとにディレクトリと.gitkeep
    for (const note of notes) {
      const folderPath = buildFolderPath(note)
      if (folderPath) {
        notesFolder.folder(folderPath)
        notesFolder.file(`${folderPath}/.gitkeep`, '')
      }
    }

    // リーフを追加
    const sortedLeaves = [...leaves].sort((a, b) => a.order - b.order)
    const usedPaths = new Set<string>()
    for (const leaf of sortedLeaves) {
      const note = noteMap.get(leaf.noteId) || null
      const folderPath = note ? buildFolderPath(note) : ''
      const safeTitle = leaf.title.replace(/[/\\:*?"<>|]/g, '_')
      let basePath = folderPath ? `${folderPath}/${safeTitle}.md` : `${safeTitle}.md`
      if (usedPaths.has(basePath)) {
        let suffix = 2
        let candidate: string
        do {
          candidate = folderPath
            ? `${folderPath}/${safeTitle}_${suffix}.md`
            : `${safeTitle}_${suffix}.md`
          suffix++
        } while (usedPaths.has(candidate))
        basePath = candidate
      }
      usedPaths.add(basePath)
      notesFolder.file(basePath, leaf.content)
    }

    // metadata.json
    const metadataToWrite: Metadata = {
      version: 1,
      pushCount: metadata?.pushCount ?? 0,
      notes: {},
      leaves: {},
    }

    for (const note of notes) {
      const folderPath = buildFolderPath(note)
      const meta: Record<string, unknown> = { id: note.id, order: note.order }
      if (note.badgeIcon !== undefined) meta.badgeIcon = note.badgeIcon
      if (note.badgeColor !== undefined) meta.badgeColor = note.badgeColor
      metadataToWrite.notes[folderPath] = meta as Metadata['notes'][string]
    }

    const usedMetaPaths = new Set<string>()
    for (const leaf of sortedLeaves) {
      const note = noteMap.get(leaf.noteId) || null
      const folderPath = note ? buildFolderPath(note) : ''
      const safeTitle = leaf.title.replace(/[/\\:*?"<>|]/g, '_')
      let relativePath = folderPath ? `${folderPath}/${safeTitle}.md` : `${safeTitle}.md`
      if (usedMetaPaths.has(relativePath)) {
        let suffix = 2
        let candidate: string
        do {
          candidate = folderPath
            ? `${folderPath}/${safeTitle}_${suffix}.md`
            : `${safeTitle}_${suffix}.md`
          suffix++
        } while (usedMetaPaths.has(candidate))
        relativePath = candidate
      }
      usedMetaPaths.add(relativePath)
      const meta: Record<string, unknown> = {
        id: leaf.id,
        updatedAt: leaf.updatedAt,
        order: leaf.order,
      }
      if (leaf.badgeIcon !== undefined) meta.badgeIcon = leaf.badgeIcon
      if (leaf.badgeColor !== undefined) meta.badgeColor = leaf.badgeColor
      metadataToWrite.leaves[relativePath] = meta as Metadata['leaves'][string]
    }

    notesFolder.file('metadata.json', JSON.stringify(metadataToWrite, null, 2))

    // アーカイブフォルダの作成
    const archiveFolder = agasteerFolder.folder('archive')
    if (!archiveFolder) {
      throw new Error('Failed to create archive folder in ZIP')
    }
    archiveFolder.file('.gitkeep', '')

    // アーカイブデータがある場合のみ追加
    if (archiveNotes.length > 0 || archiveLeaves.length > 0) {
      const archiveNoteMap = new Map<string, Note>(archiveNotes.map((n) => [n.id, n]))
      const buildArchiveFolderPath = (note: Note): string => {
        const segments: string[] = []
        let current: Note | undefined | null = note
        while (current) {
          segments.unshift(current.name)
          current = current.parentId ? archiveNoteMap.get(current.parentId) || null : null
        }
        return segments.join('/')
      }

      // アーカイブノートごとにディレクトリと.gitkeep
      for (const note of archiveNotes) {
        const folderPath = buildArchiveFolderPath(note)
        if (folderPath) {
          archiveFolder.folder(folderPath)
          archiveFolder.file(`${folderPath}/.gitkeep`, '')
        }
      }

      // アーカイブリーフを追加
      const sortedArchiveLeaves = [...archiveLeaves].sort((a, b) => a.order - b.order)
      const usedArchivePaths = new Set<string>()
      for (const leaf of sortedArchiveLeaves) {
        const note = archiveNoteMap.get(leaf.noteId) || null
        const folderPath = note ? buildArchiveFolderPath(note) : ''
        const safeTitle = leaf.title.replace(/[/\\:*?"<>|]/g, '_')
        let path = folderPath ? `${folderPath}/${safeTitle}.md` : `${safeTitle}.md`
        if (usedArchivePaths.has(path)) {
          let suffix = 2
          let candidate: string
          do {
            candidate = folderPath
              ? `${folderPath}/${safeTitle}_${suffix}.md`
              : `${safeTitle}_${suffix}.md`
            suffix++
          } while (usedArchivePaths.has(candidate))
          path = candidate
        }
        usedArchivePaths.add(path)
        archiveFolder.file(path, leaf.content)
      }

      // アーカイブ用metadata.json
      const archiveMetadataToWrite: Metadata = {
        version: 1,
        pushCount: archiveMetadata?.pushCount ?? 0,
        notes: {},
        leaves: {},
      }

      for (const note of archiveNotes) {
        const folderPath = buildArchiveFolderPath(note)
        const meta: Record<string, unknown> = { id: note.id, order: note.order }
        if (note.badgeIcon !== undefined) meta.badgeIcon = note.badgeIcon
        if (note.badgeColor !== undefined) meta.badgeColor = note.badgeColor
        archiveMetadataToWrite.notes[folderPath] = meta as Metadata['notes'][string]
      }

      const usedArchiveMetaPaths = new Set<string>()
      for (const leaf of sortedArchiveLeaves) {
        const note = archiveNoteMap.get(leaf.noteId) || null
        const folderPath = note ? buildArchiveFolderPath(note) : ''
        const safeTitle = leaf.title.replace(/[/\\:*?"<>|]/g, '_')
        let relativePath = folderPath ? `${folderPath}/${safeTitle}.md` : `${safeTitle}.md`
        if (usedArchiveMetaPaths.has(relativePath)) {
          let suffix = 2
          let candidate: string
          do {
            candidate = folderPath
              ? `${folderPath}/${safeTitle}_${suffix}.md`
              : `${safeTitle}_${suffix}.md`
            suffix++
          } while (usedArchiveMetaPaths.has(candidate))
          relativePath = candidate
        }
        usedArchiveMetaPaths.add(relativePath)
        const meta: Record<string, unknown> = {
          id: leaf.id,
          updatedAt: leaf.updatedAt,
          order: leaf.order,
        }
        if (leaf.badgeIcon !== undefined) meta.badgeIcon = leaf.badgeIcon
        if (leaf.badgeColor !== undefined) meta.badgeColor = leaf.badgeColor
        archiveMetadataToWrite.leaves[relativePath] = meta as Metadata['leaves'][string]
      }

      archiveFolder.file('metadata.json', JSON.stringify(archiveMetadataToWrite, null, 2))
    }

    const infoLines = [
      options.gitPolicyLine,
      options.infoFooterLine,
      `exported_at: ${new Date().toISOString()}`,
    ].join('\n')
    zip.file('EXPORT_INFO.txt', infoLines)

    const blob = await zip.generateAsync({ type: 'blob' })
    return { success: true, blob }
  } catch (error) {
    return { success: false, reason: 'error', error }
  }
}
