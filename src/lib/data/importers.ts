import JSZip from 'jszip'
import type { Note, Leaf, Metadata } from '../types'

export type ImportSource = 'simplenote' | 'google-keep' | 'cosense'

export interface ImportedLeafData {
  title: string
  content: string
  updatedAt?: number
  sanitized?: string
}

export interface ImportParseResult {
  source: ImportSource
  leaves: ImportedLeafData[]
  skipped: number
  errors: string[]
  sanitizedTitles: string[]
  unsupported: string[]
}

// ============================================
// 共通ユーティリティ
// ============================================

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

const NOTE_NAMES: Record<ImportSource, string> = {
  simplenote: 'SimpleNote_1',
  'google-keep': 'GoogleKeep_1',
  cosense: 'Cosense_1',
}

// ============================================
// SimpleNote パーサー
// ============================================

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

    return {
      source: 'simplenote',
      leaves,
      skipped: errors.length,
      errors,
      sanitizedTitles,
      unsupported: [
        'pinned state',
        'tags',
        'deleted/trashed notes',
        'attachments/media',
        'creation time (only lastModified used)',
        'rich formatting',
      ],
    }
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
    unsupported: [
      'pinned state',
      'tags',
      'deleted/trashed notes',
      'attachments/media',
      'creation time (only lastModified used)',
      'rich formatting',
    ],
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
    unsupported: [],
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

// ============================================
// Google Keep パーサー
// ============================================

interface KeepNote {
  color?: string
  isTrashed?: boolean
  isPinned?: boolean
  isArchived?: boolean
  title?: string
  textContent?: string
  textContentHtml?: string
  listContent?: Array<{ text: string; isChecked: boolean }>
  annotations?: Array<{ title?: string; url?: string; description?: string; source?: string }>
  attachments?: Array<{ filePath?: string; mimetype?: string }>
  labels?: Array<{ name?: string }>
  userEditedTimestampUsec?: number
  createdTimestampUsec?: number
}

function isKeepNote(obj: any): obj is KeepNote {
  return (
    obj &&
    typeof obj === 'object' &&
    'isTrashed' in obj &&
    'isArchived' in obj &&
    ('textContent' in obj || 'listContent' in obj || 'attachments' in obj)
  )
}

function convertKeepNote(
  note: KeepNote,
  sanitizedTitles: string[],
  unsupportedCollector: Set<string>
): { leaf: ImportedLeafData; skipped: boolean; error?: string } {
  // Skip trashed notes
  if (note.isTrashed) {
    return { leaf: null as any, skipped: true, error: undefined }
  }

  // Build content
  let content = ''

  if (note.textContent) {
    // Trim leading/trailing blank lines, compress runs of 3+ blank lines to 2
    content = note.textContent
      .replace(/^\n+/, '')
      .replace(/\n+$/, '')
      .replace(/\n{3,}/g, '\n\n')
  } else if (note.listContent && note.listContent.length > 0) {
    content = note.listContent
      .map((item) => {
        const check = item.isChecked ? '[x]' : '[ ]'
        return `- ${check} ${item.text || ''}`
      })
      .join('\n')
  }

  // Append annotations as links section
  if (note.annotations && note.annotations.length > 0) {
    const urls = new Set(
      (content.match(/https?:\/\/[^\s)]+/g) || []).map((u) => u.replace(/[.,;:!?]+$/, ''))
    )
    const newLinks = note.annotations.filter((a) => a.url && !urls.has(a.url))
    if (newLinks.length > 0) {
      const linkLines = newLinks.map((a) => {
        const linkTitle = a.title || a.url || ''
        return `- [${linkTitle}](${a.url})`
      })
      content += '\n\n## Links\n\n' + linkLines.join('\n')
    }
  }

  // Track unsupported features
  if (note.attachments && note.attachments.length > 0) {
    unsupportedCollector.add('attachments/images')
  }
  if (note.color && note.color !== 'DEFAULT') {
    unsupportedCollector.add('color')
  }
  if (note.labels && note.labels.length > 0) {
    unsupportedCollector.add('labels')
  }
  if (note.isPinned) {
    unsupportedCollector.add('pinned state')
  }

  // Determine title
  let title: string
  if (note.title && note.title.trim().length > 0) {
    title = sanitizeTitle(note.title, sanitizedTitles)
  } else {
    title = deriveTitleFromContent(content, 'Untitled', sanitizedTitles)
  }

  // Timestamp: μsec → msec
  const updatedAt = note.userEditedTimestampUsec
    ? Math.floor(note.userEditedTimestampUsec / 1000)
    : undefined

  return {
    leaf: { title, content, updatedAt },
    skipped: false,
  }
}

function parseKeepJsonString(
  jsonStr: string,
  leaves: ImportedLeafData[],
  errors: string[],
  sanitizedTitles: string[],
  unsupportedCollector: Set<string>,
  fileName: string
): { skippedCount: number } {
  let skippedCount = 0
  try {
    const parsed = JSON.parse(jsonStr)
    if (!isKeepNote(parsed)) {
      return { skippedCount: 0 }
    }
    const { leaf, skipped, error } = convertKeepNote(parsed, sanitizedTitles, unsupportedCollector)
    if (skipped) {
      skippedCount++
      return { skippedCount }
    }
    if (error) {
      errors.push(error)
      skippedCount++
      return { skippedCount }
    }
    if (leaf && leaf.content.length > 0) {
      leaves.push(leaf)
    } else {
      // Empty note
      skippedCount++
    }
  } catch (e: any) {
    errors.push(`${fileName}: ${e?.message || 'parse error'}`)
    skippedCount++
  }
  return { skippedCount }
}

async function parseGoogleKeepJson(buffer: ArrayBuffer): Promise<ImportParseResult | null> {
  try {
    const text = new TextDecoder().decode(buffer)
    const parsed = JSON.parse(text)
    if (!isKeepNote(parsed)) return null

    const leaves: ImportedLeafData[] = []
    const errors: string[] = []
    const sanitizedTitles: string[] = []
    const unsupportedCollector = new Set<string>()

    const { skippedCount } = parseKeepJsonString(
      text,
      leaves,
      errors,
      sanitizedTitles,
      unsupportedCollector,
      'input.json'
    )

    if (leaves.length === 0 && skippedCount === 0) return null

    return {
      source: 'google-keep',
      leaves,
      skipped: skippedCount,
      errors,
      sanitizedTitles,
      unsupported: Array.from(unsupportedCollector),
    }
  } catch {
    return null
  }
}

async function parseGoogleKeepZip(buffer: ArrayBuffer): Promise<ImportParseResult | null> {
  try {
    const zip = await JSZip.loadAsync(buffer)

    // Find JSON files in the ZIP (may be under Takeout/Keep/ or Keep/ or root)
    const jsonFiles = Object.values(zip.files).filter(
      (f) => !f.dir && f.name.toLowerCase().endsWith('.json')
    )

    const leaves: ImportedLeafData[] = []
    const errors: string[] = []
    const sanitizedTitles: string[] = []
    const unsupportedCollector = new Set<string>()
    let totalSkipped = 0
    let keepNoteFound = false

    for (const file of jsonFiles) {
      try {
        const content = await file.async('string')
        const parsed = JSON.parse(content)
        if (!isKeepNote(parsed)) continue
        keepNoteFound = true

        const fileName = file.name.split('/').pop() || file.name
        const { skippedCount } = parseKeepJsonString(
          content,
          leaves,
          errors,
          sanitizedTitles,
          unsupportedCollector,
          fileName
        )
        totalSkipped += skippedCount
      } catch {
        // Not a valid JSON, skip
      }
    }

    if (!keepNoteFound) return null

    return {
      source: 'google-keep',
      leaves,
      skipped: totalSkipped,
      errors,
      sanitizedTitles,
      unsupported: Array.from(unsupportedCollector),
    }
  } catch {
    return null
  }
}

/**
 * Google Keep のエクスポート（json/zip）を自動判定してパースする
 */
export async function parseGoogleKeepFile(file: File): Promise<ImportParseResult | null> {
  const lower = file.name.toLowerCase()
  const buffer = await file.arrayBuffer()

  if (lower.endsWith('.json')) {
    return parseGoogleKeepJson(buffer)
  }

  if (lower.endsWith('.zip')) {
    return parseGoogleKeepZip(buffer)
  }

  return null
}

// ============================================
// Cosense (Scrapbox) パーサー
// ============================================

interface CosenseLine {
  text?: string
  created?: number
  updated?: number
  userId?: string
}

interface CosensePage {
  title?: string
  created?: number
  updated?: number
  id?: string
  views?: number
  image?: string | null
  lines?: CosenseLine[]
}

interface CosenseExport {
  name?: string
  displayName?: string
  exported?: number
  users?: unknown[]
  pages?: CosensePage[]
}

function isCosenseExport(obj: unknown): obj is CosenseExport {
  if (!obj || typeof obj !== 'object') return false
  const o = obj as Record<string, unknown>
  return typeof o.name === 'string' && typeof o.exported === 'number' && Array.isArray(o.pages)
}

/**
 * Cosense (Scrapbox) 記法を Markdown に寄せて変換する。
 * - `[URL 説明]` / `[説明 URL]` → `[説明](URL)`
 * - `[URL]` で画像拡張子 → `![](URL)` かつ hasExternalImage を立てる
 * - `[URL]` で非画像 → `<URL>`
 * - `[ページ名]`（URLを含まない） → そのまま残す
 * - `#tag` → そのまま残す
 *
 * 行頭のインデント（空白/タブ）は保持する。
 *
 * flags:
 * - hasExternalImage: 画像URLブラケットを検出したら立つ
 * - hasDecoration: `[* ...]` `[** ...]` `[/ ...]` `[- ...]` を検出
 * - hasMathBlock: `[$ ...]` を検出
 * - hasCodeBlock: 行頭 `code:filename` を検出
 * - hasTable: 行頭 `table:name` を検出
 */
export function convertCosenseNotation(
  text: string,
  flags: {
    hasExternalImage: boolean
    hasDecoration?: boolean
    hasMathBlock?: boolean
    hasCodeBlock?: boolean
    hasTable?: boolean
  }
): string {
  const lines = text.split('\n')
  const converted = lines.map((line) => {
    const indentMatch = line.match(/^[ \t]*/)
    const indent = indentMatch ? indentMatch[0] : ''
    const body = line.slice(indent.length)

    // 行頭 code:filename / table:name の検出（インデントの次に来ることがある）
    if (/^code:\S/.test(body)) {
      flags.hasCodeBlock = true
    }
    if (/^table:\S/.test(body)) {
      flags.hasTable = true
    }

    // 装飾・数式ブラケットの検出
    if (/\[\*{1,}\s/.test(body) || /\[\/\s/.test(body) || /\[-\s/.test(body)) {
      flags.hasDecoration = true
    }
    if (/\[\$\s/.test(body)) {
      flags.hasMathBlock = true
    }

    // ブラケット記法のグローバル置換
    const replaced = body.replace(/\[([^\[\]\n]+)\]/g, (_match, inner: string) => {
      const parts = inner.trim().split(/\s+/)
      const urlRe = /^https?:\/\/\S+$/
      const urlIdx = parts.findIndex((p) => urlRe.test(p))

      if (urlIdx === -1) {
        // URLなし → 内部リンク扱いでそのまま残す
        return `[${inner}]`
      }

      // 末尾句読点を URL から剥がす（Keep パーサーと同じ扱い）
      let url = parts[urlIdx]
      url = url.replace(/[.,;:!?]+$/, '')
      const others = parts.filter((_, i) => i !== urlIdx)

      if (others.length === 0) {
        // URL単独
        const lower = url.toLowerCase()
        if (/\.(png|jpe?g|gif|webp|svg)(\?|#|$)/.test(lower)) {
          flags.hasExternalImage = true
          return `![](${url})`
        }
        return `<${url}>`
      }

      // URL + 説明
      const label = others.join(' ')
      return `[${label}](${url})`
    })

    return indent + replaced
  })

  return converted.join('\n')
}

async function parseCosenseJson(buffer: ArrayBuffer): Promise<ImportParseResult | null> {
  try {
    const text = new TextDecoder().decode(buffer)
    const parsed: unknown = JSON.parse(text)
    if (!isCosenseExport(parsed)) return null
    const pages = parsed.pages || []
    if (!Array.isArray(pages)) return null

    const leaves: ImportedLeafData[] = []
    const errors: string[] = []
    const sanitizedTitles: string[] = []
    const unsupportedCollector = new Set<string>()
    const conversionFlags: {
      hasExternalImage: boolean
      hasDecoration?: boolean
      hasMathBlock?: boolean
      hasCodeBlock?: boolean
      hasTable?: boolean
    } = { hasExternalImage: false }
    let hasThumbnail = false
    let hasViews = false
    let skippedCount = 0

    pages.forEach((page, idx) => {
      if (!page || typeof page !== 'object') {
        errors.push(`page_${idx}: invalid`)
        return
      }
      const rawTitle = typeof page.title === 'string' ? page.title : `Page ${idx + 1}`
      const title = sanitizeTitle(rawTitle, sanitizedTitles)

      const lines = Array.isArray(page.lines) ? page.lines : []
      const texts = lines.map((l) => (l && typeof l.text === 'string' ? l.text : ''))

      // Cosense は先頭行にタイトルを入れる慣習。title と一致（前後空白を無視）なら削除。
      if (texts.length > 0 && texts[0].trim() === rawTitle.trim()) {
        texts.shift()
      }

      // Keep と挙動を統一: lines が空 or 全 text が空白/空ならスキップ
      const hasAnyContent = texts.some((t) => t.trim().length > 0)
      if (!hasAnyContent) {
        skippedCount++
        return
      }

      const body = texts.join('\n')
      const content = convertCosenseNotation(body, conversionFlags)

      if (page.image) {
        hasThumbnail = true
      }
      if (typeof page.views === 'number') {
        hasViews = true
      }

      const updatedAt =
        typeof page.updated === 'number' && Number.isFinite(page.updated)
          ? page.updated * 1000
          : undefined

      leaves.push({ title, content, updatedAt })
    })

    if (hasThumbnail) {
      unsupportedCollector.add('page thumbnails (page.image)')
    }
    if (hasViews) {
      unsupportedCollector.add('page views count')
    }
    unsupportedCollector.add('user attribution and line timestamps')
    unsupportedCollector.add('hashtags kept as plain text (no internal link target)')
    unsupportedCollector.add('internal [page name] links kept as bracketed text')
    if (conversionFlags.hasExternalImage) {
      unsupportedCollector.add('external images (URLs preserved; host availability not guaranteed)')
    }
    if (conversionFlags.hasDecoration) {
      unsupportedCollector.add('Cosense decorations ([*, [**, [/, [-] kept as-is)')
    }
    if (conversionFlags.hasMathBlock) {
      unsupportedCollector.add('math blocks ([$ ...]) kept as-is')
    }
    if (conversionFlags.hasCodeBlock) {
      unsupportedCollector.add('code blocks (code:filename) kept as plain text')
    }
    if (conversionFlags.hasTable) {
      unsupportedCollector.add('tables (table:name) kept as plain text')
    }

    return {
      source: 'cosense',
      leaves,
      skipped: errors.length + skippedCount,
      errors,
      sanitizedTitles,
      unsupported: Array.from(unsupportedCollector),
    }
  } catch {
    return null
  }
}

/**
 * Cosense (Scrapbox) のエクスポート/バックアップ JSON をパースする。
 */
export async function parseCosenseFile(file: File): Promise<ImportParseResult | null> {
  const lower = file.name.toLowerCase()
  if (!lower.endsWith('.json')) return null
  const buffer = await file.arrayBuffer()
  return parseCosenseJson(buffer)
}

// ============================================
// 統合パーサー（自動判定）
// ============================================

/**
 * ファイルの中身を見て SimpleNote / Google Keep / Cosense を自動判定してパースする。
 * SimpleNote → Google Keep → Cosense の順に試す。
 */
async function parseImportFile(file: File): Promise<ImportParseResult | null> {
  // Try SimpleNote first (has activeNotes key → quick to reject if not)
  const snResult = await parseSimpleNoteFile(file)
  if (snResult && snResult.leaves.length > 0) return snResult

  // Try Google Keep
  const gkResult = await parseGoogleKeepFile(file)
  if (gkResult && gkResult.leaves.length > 0) return gkResult

  // Try Cosense (Scrapbox)
  const csResult = await parseCosenseFile(file)
  if (csResult && csResult.leaves.length > 0) return csResult

  return null
}

// ============================================
// 共通インポート処理
// ============================================

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
  existingNotesCount: number
  existingLeavesMaxOrder: number
  translate: (key: string, options?: { values?: Record<string, any> }) => string
}

/**
 * ファイルをインポートし、Note/Leafデータを生成する。
 * SimpleNote / Google Keep / Cosense を自動判定する。
 */
export async function processImportFile(
  file: File,
  options: ImportOptions
): Promise<{ success: false; error: string } | { success: true; result: ImportResult }> {
  const parsed = await parseImportFile(file)
  if (!parsed || parsed.leaves.length === 0) {
    return { success: false, error: 'unsupportedFile' }
  }

  const { existingNotesCount, existingLeavesMaxOrder, translate } = options
  const { source } = parsed

  const noteName = NOTE_NAMES[source]

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

  const sourceLabel =
    source === 'google-keep'
      ? translate('settings.importExport.importReportSourceGoogleKeep')
      : source === 'cosense'
        ? translate('settings.importExport.importReportSourceCosense')
        : translate('settings.importExport.importReportSourceSimpleNote')

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

  const unsupportedLine =
    parsed.unsupported && parsed.unsupported.length > 0
      ? translate('settings.importExport.importReportUnsupportedGeneric', {
          values: { items: parsed.unsupported.join(', ') },
        })
      : ''

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
    translate('settings.importExport.importReportHeaderGeneric', {
      values: { source: sourceLabel },
    }),
    sourceLabel,
    translate('settings.importExport.importReportCount', {
      values: { count: importedLeaves.length },
    }),
    translate('settings.importExport.importReportSkipped', { values: { skipped } }),
    translate('settings.importExport.importReportPlacementGeneric', { values: { noteName } }),
    unsupportedLine,
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
