import type { Note, Leaf, WorldType } from '../types'
import type { PullPriority } from '../api/github'

/**
 * パス解決の結果
 */
export interface PathResolution {
  type: 'home' | 'note' | 'leaf'
  note: Note | null
  leaf: Leaf | null
  isPreview: boolean
  world: WorldType
}

/**
 * パスからワールドプレフィックスを抽出する
 * @param path - パス文字列（例: "archive:仕事>議事録"）
 * @returns { world, cleanPath } - ワールドとプレフィックスを除去したパス
 */
export function extractWorldPrefix(path: string): { world: WorldType; cleanPath: string } {
  if (path.startsWith('archive:')) {
    return { world: 'archive', cleanPath: path.slice(8) }
  }
  if (path.startsWith('home:')) {
    return { world: 'home', cleanPath: path.slice(5) }
  }
  return { world: 'home', cleanPath: path }
}

/**
 * パス文字列からノート・リーフを解決する
 *
 * @param path - パス文字列（例: "仕事>会議>議事録" または "archive:仕事>会議>議事録"）
 * @param notes - 全ノート配列
 * @param leaves - 全リーフ配列
 * @returns パス解決結果（ワールド情報を含む）
 */
export function resolvePath(path: string, notes: Note[], leaves: Leaf[]): PathResolution {
  // ホームまたは空パス
  if (!path || path === '/' || path === '') {
    return { type: 'home', note: null, leaf: null, isPreview: false, world: 'home' }
  }

  // ワールドプレフィックスを抽出
  const { world, cleanPath: pathWithoutWorld } = extractWorldPrefix(path)

  // ワールドプレフィックスのみの場合（"archive:" や "home:"）
  if (!pathWithoutWorld || pathWithoutWorld === '/' || pathWithoutWorld === '') {
    return { type: 'home', note: null, leaf: null, isPreview: false, world }
  }

  // `:preview` サフィックスを検出
  let isPreview = false
  let cleanPath = pathWithoutWorld
  if (pathWithoutWorld.endsWith(':preview')) {
    isPreview = true
    cleanPath = pathWithoutWorld.slice(0, -8) // ':preview' を除去
  }

  // パスを分割（">" で区切る、URLエンコード不要）
  const segments = cleanPath.split('>')
  if (segments.length === 0 || segments[0] === '') {
    return { type: 'home', note: null, leaf: null, isPreview: false, world }
  }

  // デコード（念のため）
  const decodedSegments = segments.map((s) => decodeURIComponent(s))

  // 1番目: ルートノートを探す
  const rootNote = notes.find((n) => !n.parentId && n.name === decodedSegments[0])
  if (!rootNote) {
    // ノートが見つからない場合はホームに戻す（ワールドは維持）
    return { type: 'home', note: null, leaf: null, isPreview: false, world }
  }

  // 1セグメントのみ: ルートノートを返す
  if (decodedSegments.length === 1) {
    return { type: 'note', note: rootNote, leaf: null, isPreview: false, world }
  }

  // 2番目: サブノートまたはリーフを探す
  const secondName = decodedSegments[1]

  // サブノートを探す
  const subNote = notes.find((n) => n.parentId === rootNote.id && n.name === secondName)

  if (subNote && decodedSegments.length === 2) {
    // 2セグメント: サブノートを返す
    return { type: 'note', note: subNote, leaf: null, isPreview: false, world }
  }

  if (!subNote && decodedSegments.length === 2) {
    // サブノートが見つからない場合、リーフを探す
    const leaf = leaves.find((l) => l.noteId === rootNote.id && l.title === secondName)
    if (leaf) {
      return { type: 'leaf', note: rootNote, leaf, isPreview, world }
    }
    // リーフも見つからない場合はルートノートに戻す
    return { type: 'note', note: rootNote, leaf: null, isPreview: false, world }
  }

  // 3番目: リーフを探す（サブノート配下）
  if (subNote && decodedSegments.length === 3) {
    const leafTitle = decodedSegments[2]
    const leaf = leaves.find((l) => l.noteId === subNote.id && l.title === leafTitle)
    if (leaf) {
      return { type: 'leaf', note: subNote, leaf, isPreview, world }
    }
    // リーフが見つからない場合はサブノートに戻す
    return { type: 'note', note: subNote, leaf: null, isPreview: false, world }
  }

  // それ以外は階層が深すぎるのでルートノートに戻す
  return { type: 'note', note: rootNote, leaf: null, isPreview: false, world }
}

/**
 * ノート・リーフからパス文字列を生成する
 *
 * @param note - ノート
 * @param leaf - リーフ（オプション）
 * @param notes - 全ノート配列
 * @param view - ビュータイプ（オプション）
 * @param world - ワールド（オプション、'archive'の場合のみプレフィックスを追加）
 * @returns パス文字列（例: "仕事>会議>議事録"、アーカイブ時は "archive:仕事>会議>議事録"）
 */
export function buildPath(
  note: Note | null,
  leaf: Leaf | null,
  notes: Note[],
  view?: string,
  world?: WorldType
): string {
  // ワールドプレフィックス（archiveの場合のみ追加、homeは省略）
  const worldPrefix = world === 'archive' ? 'archive:' : ''

  if (!note) {
    // ホーム画面の場合もワールドプレフィックスを付ける（archiveの場合）
    return world === 'archive' ? 'archive:' : ''
  }

  const segments: string[] = []

  // 親ノートがあれば追加
  if (note.parentId) {
    const parentNote = notes.find((n) => n.id === note.parentId)
    if (parentNote) {
      segments.push(parentNote.name)
    }
  }

  // 現在のノートを追加
  segments.push(note.name)

  // リーフがあれば追加
  if (leaf) {
    segments.push(leaf.title)
  }

  let path = worldPrefix + segments.join('>')

  // プレビューモードの場合は `:preview` サフィックスを追加
  if (view === 'preview' && leaf) {
    path += ':preview'
  }

  return path
}

/**
 * URLから優先情報を取得（Pull時の優先度ソート用）
 * リーフパスとノートIDを返す
 * 注意: この関数はホームワールドのPull用。アーカイブプレフィックスは除外される。
 *
 * @param allNotes - 全ノート配列
 * @returns PullPriority（優先的に取得するリーフパスとノートID）
 */
export function getPriorityFromUrl(allNotes: Note[]): PullPriority {
  const params = new URLSearchParams(window.location.search)
  const leftPath = params.get('left')
  const rightPath = params.get('right')

  const leafPaths: string[] = []
  const noteIds: string[] = []

  const processPath = (path: string | null) => {
    if (!path || path === '/') return

    // ワールドプレフィックスを除去（アーカイブの場合はスキップ）
    const { world, cleanPath: pathWithoutWorld } = extractWorldPrefix(path)
    if (world === 'archive') return // アーカイブはホームのPull優先度に影響しない

    // :previewサフィックスを除去
    const cleanPath = pathWithoutWorld.endsWith(':preview')
      ? pathWithoutWorld.slice(0, -8)
      : pathWithoutWorld

    if (!cleanPath || cleanPath === '/') return

    // パスを分割（">" で区切る）
    const segments = cleanPath.split('>').map((s) => decodeURIComponent(s))
    if (segments.length === 0) return

    // ルートノートを探す
    const rootNote = allNotes.find((n) => !n.parentId && n.name === segments[0])
    if (!rootNote) return

    if (segments.length === 1) {
      // ルートノートのみ → そのノート配下を優先
      noteIds.push(rootNote.id)
      return
    }

    // サブノートを探す
    const subNote = allNotes.find((n) => n.parentId === rootNote.id && n.name === segments[1])

    if (subNote && segments.length === 2) {
      // サブノートのみ → そのノート配下を優先
      noteIds.push(subNote.id)
      return
    }

    if (!subNote && segments.length === 2) {
      // ルートノート配下のリーフ
      const leafPath = `${segments[0]}/${segments[1]}.md`
      leafPaths.push(leafPath)
      noteIds.push(rootNote.id)
      return
    }

    if (subNote && segments.length === 3) {
      // サブノート配下のリーフ
      const leafPath = `${segments[0]}/${segments[1]}/${segments[2]}.md`
      leafPaths.push(leafPath)
      noteIds.push(subNote.id)
      return
    }
  }

  processPath(leftPath)
  processPath(rightPath)

  // 重複を除去
  return {
    leafPaths: [...new Set(leafPaths)],
    noteIds: [...new Set(noteIds)],
  }
}
