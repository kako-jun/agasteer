import JSZip from 'jszip'
import type { Note, Leaf, Metadata } from '../types'

export interface ImportedLeafData {
  title: string
  content: string
  updatedAt?: number
  sanitized?: string
}

export interface ImportParseResult {
  source: 'simplenote'
  leaves: ImportedLeafData[]
  skipped: number
  errors: string[]
  sanitizedTitles: string[]
}

function sanitizeTitle(raw: string, sanitizedList: string[]): string {
  const trimmed = raw.trim()
  if (trimmed.length === 0) return 'Untitled'
  // Replace path separators and problematic chars to avoid unintended folders
  const cleaned = trimmed.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ')
  const limited = cleaned.slice(0, 80)
  if (cleaned !== trimmed) {
    sanitizedList.push(`${trimmed} -> ${limited || 'Untitled'}`)
  }
  return limited.length === 0 ? 'Untitled' : limited
}

function deriveTitleFromContent(
  content: string,
  fallback: string,
  sanitizedList: string[]
): string {
  const lines = content.split(/\r?\n/).map((l) => l.trim())
  const nonEmpty = lines.find((l) => l.length > 0)
  const base = sanitizeTitle(nonEmpty || fallback, sanitizedList)
  return base.length > 80 ? `${base.slice(0, 80)}…` : base
}

async function parseSimpleNoteJson(buffer: ArrayBuffer): Promise<ImportParseResult | null> {
  try {
    const text = new TextDecoder().decode(buffer)
    const parsed = JSON.parse(text)
    const notes = Array.isArray(parsed?.activeNotes) ? parsed.activeNotes : []
    if (notes.length === 0) return null

    const leaves: ImportedLeafData[] = []
    const errors: string[] = []
    const sanitizedTitles: string[] = []

    notes.forEach((n: any, idx: number) => {
      if (!n || typeof n.content !== 'string') {
        errors.push(`note_${idx}: missing content`)
        return
      }
      const title = deriveTitleFromContent(n.content, n.id || `Note ${idx + 1}`, sanitizedTitles)
      const updatedAt = n.lastModified ? Date.parse(n.lastModified) : undefined
      leaves.push({
        title,
        content: n.content,
        updatedAt: Number.isFinite(updatedAt) ? updatedAt : undefined,
        sanitized:
          sanitizedTitles.length && sanitizedTitles[sanitizedTitles.length - 1] !== title
            ? sanitizedTitles[sanitizedTitles.length - 1]
            : undefined,
      })
    })

    return { source: 'simplenote', leaves, skipped: errors.length, errors, sanitizedTitles }
  } catch (e) {
    return null
  }
}

async function parseSimpleNoteZip(buffer: ArrayBuffer): Promise<ImportParseResult | null> {
  const zip = await JSZip.loadAsync(buffer)
  const files = Object.values(zip.files).filter(
    (f) =>
      !f.dir && (f.name.toLowerCase().endsWith('.txt') || f.name.toLowerCase().endsWith('.json'))
  )

  if (files.length === 0) return null

  const leaves: ImportedLeafData[] = []
  const errors: string[] = []
  const sanitizedTitles: string[] = []

  for (const file of files) {
    try {
      const content = await file.async('string')
      if (file.name.toLowerCase().endsWith('.json')) {
        const sub = await parseSimpleNoteJson(new TextEncoder().encode(content).buffer)
        if (sub) {
          leaves.push(...sub.leaves)
          errors.push(...sub.errors)
          sanitizedTitles.push(...(sub.sanitizedTitles || []))
        }
        continue
      }
      const namePart = file.name.split('/').pop() || 'Untitled'
      const title = sanitizeTitle(namePart.replace(/\.txt$/i, ''), sanitizedTitles)
      leaves.push({ title, content })
    } catch (e: any) {
      errors.push(`${file.name}: ${e?.message || 'parse error'}`)
    }
  }

  return {
    source: 'simplenote',
    leaves,
    skipped: errors.length,
    errors,
    sanitizedTitles,
  }
}

async function parseSimpleNoteTxt(
  buffer: ArrayBuffer,
  fileName: string
): Promise<ImportParseResult> {
  const decoder = new TextDecoder()
  const content = decoder.decode(buffer)
  const sanitizedTitles: string[] = []
  const title = sanitizeTitle(fileName.replace(/\.txt$/i, ''), sanitizedTitles)
  return {
    source: 'simplenote',
    leaves: [{ title, content }],
    skipped: 0,
    errors: [],
    sanitizedTitles,
  }
}

/**
 * SimpleNote のエクスポート（json/zip/txt）を自動判定してパースする
 */
export async function parseSimpleNoteFile(file: File): Promise<ImportParseResult | null> {
  const lower = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()

  if (lower.endsWith('.json')) {
    return parseSimpleNoteJson(buffer)
  }

  if (lower.endsWith('.txt')) {
    return parseSimpleNoteTxt(buffer, file.name)
  }

  if (lower.endsWith('.zip')) {
    return parseSimpleNoteZip(buffer)
  }

  return null
}

export interface ImportResult {
  newNote: {
    id: string
    name: string
    order: number
  }
  reportLeaf: {
    id: string
    title: string
    noteId: string
    content: string
    updatedAt: number
    order: number
  }
  importedLeaves: Array<{
    id: string
    title: string
    noteId: string
    content: string
    updatedAt: number
    order: number
  }>
  errors?: string[]
}

export interface ImportOptions {
  existingNoteNames: string[]
  existingNotesCount: number
  existingLeavesMaxOrder: number
  translate: (key: string, options?: { values?: Record<string, any> }) => string
}

/**
 * SimpleNoteファイルをインポートし、Note/Leafデータを生成する
 */
export async function processImportFile(
  file: File,
  options: ImportOptions
): Promise<{ success: false; error: string } | { success: true; result: ImportResult }> {
  const parsed = await parseSimpleNoteFile(file)
  if (!parsed || parsed.leaves.length === 0) {
    return { success: false, error: 'unsupportedFile' }
  }

  const { existingNoteNames, existingNotesCount, existingLeavesMaxOrder, translate } = options

  // ユニークなノート名を生成
  const baseName = 'SimpleNote'
  const existingSet = new Set(existingNoteNames)
  let noteName = `${baseName}1`
  let suffix = 1
  while (existingSet.has(noteName)) {
    suffix += 1
    noteName = `${baseName}${suffix}`
  }

  const noteId = crypto.randomUUID()
  const noteOrder = existingNotesCount

  const newNote = {
    id: noteId,
    name: noteName,
    order: noteOrder,
  }

  const baseLeafOrder = existingLeavesMaxOrder + 1

  const importedLeaves = parsed.leaves.map((leaf, idx) => ({
    id: crypto.randomUUID(),
    title: leaf.title,
    noteId,
    content: leaf.content,
    updatedAt: leaf.updatedAt ?? Date.now(),
    order: baseLeafOrder + 1 + idx,
  }))

  // レポート生成
  const skipped = parsed.skipped || 0
  const reportTitle = translate('settings.importExport.importReportTitle')
  const perItemLines = importedLeaves.map((leaf) =>
    translate('settings.importExport.importReportPerItemLine', { values: { title: leaf.title } })
  )

  const sanitizedLines =
    parsed.sanitizedTitles && parsed.sanitizedTitles.length > 0
      ? [
          translate('settings.importExport.importReportSanitizedHeader'),
          ...parsed.sanitizedTitles.map((entry) =>
            translate('settings.importExport.importReportSanitizedLine', { values: { entry } })
          ),
        ]
      : []

  const errorLines =
    parsed.errors?.length && parsed.errors.length > 0
      ? [
          translate('settings.importExport.importReportErrorsHeader'),
          ...parsed.errors.map((msg) =>
            translate('settings.importExport.importReportErrorLine', { values: { message: msg } })
          ),
        ]
      : []

  const reportLines = [
    translate('settings.importExport.importReportHeader'),
    translate('settings.importExport.importReportSource'),
    translate('settings.importExport.importReportCount', {
      values: { count: importedLeaves.length },
    }),
    translate('settings.importExport.importReportSkipped', { values: { skipped } }),
    translate('settings.importExport.importReportPlacement', { values: { noteName } }),
    translate('settings.importExport.importReportUnsupported'),
    ...sanitizedLines,
    translate('settings.importExport.importReportPerItemHeader'),
    ...perItemLines,
    parsed.errors?.length ? translate('settings.importExport.importReportHasErrors') : '',
    translate('settings.importExport.importReportConsole'),
    ...errorLines,
  ].filter(Boolean)

  const reportLeaf = {
    id: crypto.randomUUID(),
    title: reportTitle,
    noteId,
    content: reportLines.join('\n'),
    updatedAt: Date.now(),
    order: baseLeafOrder,
  }

  return {
    success: true,
    result: {
      newNote,
      reportLeaf,
      importedLeaves,
      errors: parsed.errors,
    },
  }
}

// ============================================
// Agasteer形式のインポート
// ============================================

export interface AgasteerImportResult {
  notes: Note[]
  leaves: Leaf[]
  metadata: Metadata
  archiveNotes: Note[]
  archiveLeaves: Leaf[]
  archiveMetadata: Metadata | undefined
}

/**
 * Agasteerエクスポートzipをパースする
 */
export async function parseAgasteerZip(file: File): Promise<AgasteerImportResult | null> {
  try {
    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)

    // 新形式のみサポート
    const hasNewFormat = zip.file('.agasteer/notes/metadata.json') !== null

    if (!hasNewFormat) {
      return null
    }

    return parseAgasteerFormat(zip)
  } catch (e) {
    console.error('Failed to parse Agasteer zip:', e)
    return null
  }
}

/**
 * .agasteer/notes/ と .agasteer/archive/ をパース
 */
async function parseAgasteerFormat(zip: JSZip): Promise<AgasteerImportResult> {
  // Home（notes）の読み込み
  const { notes, leaves, metadata } = await parseWorldFromZip(zip, '.agasteer/notes')

  // Archive の読み込み
  let archiveNotes: Note[] = []
  let archiveLeaves: Leaf[] = []
  let archiveMetadata: Metadata | undefined = undefined

  const archiveMetadataFile = zip.file('.agasteer/archive/metadata.json')
  if (archiveMetadataFile) {
    const result = await parseWorldFromZip(zip, '.agasteer/archive')
    archiveNotes = result.notes
    archiveLeaves = result.leaves
    archiveMetadata = result.metadata
  }

  return {
    notes,
    leaves,
    metadata,
    archiveNotes,
    archiveLeaves,
    archiveMetadata,
  }
}

/**
 * 指定されたパス配下のワールドデータをパース
 */
async function parseWorldFromZip(
  zip: JSZip,
  basePath: string
): Promise<{ notes: Note[]; leaves: Leaf[]; metadata: Metadata }> {
  const notes: Note[] = []
  const leaves: Leaf[] = []
  let metadata: Metadata = { version: 1, pushCount: 0, notes: {}, leaves: {} }

  // metadata.json を読み込み
  const metadataFile = zip.file(`${basePath}/metadata.json`)
  if (metadataFile) {
    try {
      const metadataContent = await metadataFile.async('string')
      metadata = JSON.parse(metadataContent)
    } catch (e) {
      console.error('Failed to parse metadata.json:', e)
    }
  }

  // ノートの復元（.gitkeepファイルからディレクトリ構造を読み取り）
  const notePathSet = new Set<string>()
  const files = Object.values(zip.files)

  for (const file of files) {
    if (!file.name.startsWith(`${basePath}/`)) continue
    if (file.name === `${basePath}/metadata.json`) continue
    if (file.name === `${basePath}/.gitkeep`) continue

    const relativePath = file.name.slice(`${basePath}/`.length)

    if (file.name.endsWith('.gitkeep')) {
      // .gitkeepからノートパスを抽出
      const notePath = relativePath.replace(/\/.gitkeep$/, '')
      if (notePath) {
        notePathSet.add(notePath)
      }
    } else if (file.name.endsWith('.md') && !file.dir) {
      // .mdファイルからノートパスを抽出
      const parts = relativePath.split('/')
      if (parts.length > 1) {
        // リーフがある場合、その親ディレクトリをノートとして認識
        const notePath = parts.slice(0, -1).join('/')
        notePathSet.add(notePath)

        // サブノートの場合、親ノートも追加
        if (parts.length > 2) {
          notePathSet.add(parts[0])
        }
      }
    }
  }

  // ノートを作成
  const noteByPath = new Map<string, Note>()
  const sortedPaths = Array.from(notePathSet).sort(
    (a, b) => a.split('/').length - b.split('/').length
  )

  for (const notePath of sortedPaths) {
    const parts = notePath.split('/')
    const name = parts[parts.length - 1]
    const parentPath = parts.length > 1 ? parts.slice(0, -1).join('/') : null

    const metaEntry = metadata.notes[notePath]
    const note: Note = {
      id: metaEntry?.id || crypto.randomUUID(),
      name,
      order: metaEntry?.order ?? notes.length,
      parentId: parentPath ? noteByPath.get(parentPath)?.id : undefined,
      badgeIcon: metaEntry?.badgeIcon,
      badgeColor: metaEntry?.badgeColor,
    }

    notes.push(note)
    noteByPath.set(notePath, note)
  }

  // リーフを読み込み
  for (const file of files) {
    if (!file.name.startsWith(`${basePath}/`)) continue
    if (!file.name.endsWith('.md')) continue
    if (file.dir) continue

    const relativePath = file.name.slice(`${basePath}/`.length)
    const parts = relativePath.split('/')
    const leafFileName = parts[parts.length - 1]
    const leafTitle = leafFileName.replace(/\.md$/, '')
    const notePath = parts.length > 1 ? parts.slice(0, -1).join('/') : ''

    const content = await file.async('string')
    const metaEntry = metadata.leaves[relativePath]

    const leaf: Leaf = {
      id: metaEntry?.id || crypto.randomUUID(),
      title: leafTitle,
      noteId: noteByPath.get(notePath)?.id || '',
      content,
      updatedAt: metaEntry?.updatedAt ?? Date.now(),
      order: metaEntry?.order ?? leaves.length,
      badgeIcon: metaEntry?.badgeIcon,
      badgeColor: metaEntry?.badgeColor,
    }

    // noteIdが空でない場合のみ追加（ノートに属さないリーフは無視）
    if (leaf.noteId || notePath === '') {
      // ルート直下のリーフはnoteIdが空でも許可（ただし通常はノート必須）
      if (notePath !== '' || leaf.noteId) {
        leaves.push(leaf)
      }
    }
  }

  return { notes, leaves, metadata }
}

/**
 * ファイルがAgasteer形式かどうかを判定
 */
export async function isAgasteerZip(file: File): Promise<boolean> {
  try {
    const buffer = await file.arrayBuffer()
    const zip = await JSZip.loadAsync(buffer)
    return zip.file('.agasteer/notes/metadata.json') !== null
  } catch {
    return false
  }
}
