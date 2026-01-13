/**
 * 優先段落（Priority Paragraphs）抽出ユーティリティ
 *
 * [n] マーカー付きの段落を全リーフから抽出し、
 * 優先度順にソートして表示するための機能
 */

import { derived } from 'svelte/store'
import { leaves, notes } from '../stores'
import type { Leaf, Note } from '../types'

/**
 * 抽出された優先段落の情報
 */
export interface PriorityItem {
  /** 優先度（数字、小さいほど優先） */
  priority: number
  /** 段落のテキスト内容 */
  content: string
  /** 元のリーフID */
  leafId: string
  /** 元のリーフタイトル */
  leafTitle: string
  /** 元のノートID */
  noteId: string
  /** 元のノート名 */
  noteName: string
  /** パス（ノート名/リーフ名 または 親ノート名/ノート名/リーフ名） */
  path: string
  /** 元リーフ内での行番号（1始まり） */
  line: number
  /** 表示順序（ノート順 + リーフ順） */
  displayOrder: number
}

/**
 * 段落から [n] マーカーを検出し、優先度を抽出する
 *
 * 抽出条件:
 * - 段落の先頭行の左端が [n] で始まり、その後に半角スペースがある
 * - または段落最後行の右端が [n] で終わり、その前に半角スペースがある
 *
 * スペース必須にすることで、参考文献番号 `テキスト[1]` や
 * 配列表記 `array[0]` との誤マッチを防ぐ
 *
 * @param paragraph 段落テキスト
 * @returns 優先度（見つからなければ null）
 */
export function extractPriority(paragraph: string): number | null {
  const lines = paragraph.split('\n')
  if (lines.length === 0) return null

  const firstLine = lines[0]
  const lastLine = lines[lines.length - 1]

  // 先頭行の左端が [n] で始まり、その後にスペースがある場合
  const startMatch = firstLine.match(/^\[(\d+)\] /)
  if (startMatch) {
    return parseInt(startMatch[1], 10)
  }

  // 最後行の右端が [n] で終わり、その前にスペースがある場合
  const endMatch = lastLine.match(/ \[(\d+)\]$/)
  if (endMatch) {
    return parseInt(endMatch[1], 10)
  }

  return null
}

/**
 * [n] マーカーを段落から除去する
 *
 * @param paragraph 段落テキスト
 * @returns マーカーを除去したテキスト
 */
export function removePriorityMarker(paragraph: string): string {
  const lines = paragraph.split('\n')
  if (lines.length === 0) return paragraph

  // 先頭行から [n] を除去（スペースも除去）
  lines[0] = lines[0].replace(/^\[(\d+)\] /, '')

  // 最後行から [n] を除去（スペースも除去）
  lines[lines.length - 1] = lines[lines.length - 1].replace(/ \[(\d+)\]$/, '')

  return lines.join('\n').trim()
}

/**
 * リーフのコンテンツから優先段落を抽出する
 *
 * @param leaf リーフ
 * @param noteName ノート名
 * @param path パス（ノート名/リーフ名）
 * @param displayOrder 表示順序
 * @returns 抽出された優先段落の配列
 */
export function extractPriorityItems(
  leaf: Leaf,
  noteName: string,
  path: string,
  displayOrder: number
): PriorityItem[] {
  const items: PriorityItem[] = []

  // 段落の開始位置を追跡しながら分割
  const content = leaf.content
  const paragraphPattern = /\n\n+/g
  let lastIndex = 0
  let currentLine = 1

  // 段落を順番に処理
  let match: RegExpExecArray | null
  const paragraphs: { text: string; line: number }[] = []

  while ((match = paragraphPattern.exec(content)) !== null) {
    const paragraphText = content.slice(lastIndex, match.index)
    if (paragraphText.trim()) {
      paragraphs.push({ text: paragraphText, line: currentLine })
    }
    // 次の段落の行番号を計算
    const skippedText = content.slice(lastIndex, match.index + match[0].length)
    currentLine += (skippedText.match(/\n/g) || []).length
    lastIndex = match.index + match[0].length
  }

  // 最後の段落
  const lastParagraph = content.slice(lastIndex)
  if (lastParagraph.trim()) {
    paragraphs.push({ text: lastParagraph, line: currentLine })
  }

  for (const { text, line } of paragraphs) {
    const trimmed = text.trim()
    if (!trimmed) continue

    const priority = extractPriority(trimmed)
    if (priority !== null) {
      items.push({
        priority,
        content: removePriorityMarker(trimmed),
        leafId: leaf.id,
        leafTitle: leaf.title,
        noteId: leaf.noteId,
        noteName,
        path,
        line,
        displayOrder,
      })
    }
  }

  return items
}

/**
 * ノートIDからノート名を取得するヘルパー
 */
function getNoteName(noteId: string, noteList: Note[]): string {
  const note = noteList.find((n) => n.id === noteId)
  return note?.name || 'Unknown'
}

/**
 * ノートの表示順序を計算するヘルパー
 * ルートノートの order + サブノートの場合は親の order * 1000 + 自身の order
 */
function getNoteDisplayOrder(noteId: string, noteList: Note[]): number {
  const note = noteList.find((n) => n.id === noteId)
  if (!note) return Infinity

  if (note.parentId) {
    const parent = noteList.find((n) => n.id === note.parentId)
    if (parent) {
      return parent.order * 1000 + note.order
    }
  }
  return note.order
}

/**
 * ノート/サブノート/リーフのパスを構築（検索結果と同じ形式）
 * 例: "parentNote/note/leafTitle" または "note/leafTitle"
 */
function buildPath(
  noteId: string,
  leafTitle: string,
  noteList: Note[],
  noteMap: Map<string, Note>
): string {
  const note = noteMap.get(noteId)
  if (!note) return leafTitle

  // 親ノートがあればサブノート
  if (note.parentId) {
    const parentNote = noteMap.get(note.parentId)
    if (parentNote) {
      return `${parentNote.name}/${note.name}/${leafTitle}`
    }
  }

  return `${note.name}/${leafTitle}`
}

/**
 * 全リーフから優先段落を抽出し、ソートされた状態で返す derived store
 *
 * ソート順:
 * 1. 優先度（数字昇順）
 * 2. 同じ優先度の場合は表示順（ノート順 + リーフ順）
 */
export const priorityItems = derived([leaves, notes], ([$leaves, $notes]) => {
  const items: PriorityItem[] = []

  // noteMapを作成（パス構築用）
  const noteMap = new Map<string, Note>()
  for (const note of $notes) {
    noteMap.set(note.id, note)
  }

  for (const leaf of $leaves) {
    const noteName = getNoteName(leaf.noteId, $notes)
    const noteDisplayOrder = getNoteDisplayOrder(leaf.noteId, $notes)
    // 表示順序: ノート順 * 10000 + リーフ順
    const displayOrder = noteDisplayOrder * 10000 + leaf.order
    // パスを構築（検索結果と同じ形式）
    const path = buildPath(leaf.noteId, leaf.title, $notes, noteMap)

    const extracted = extractPriorityItems(leaf, noteName, path, displayOrder)
    items.push(...extracted)
  }

  // ソート: 優先度昇順 → 同じ優先度は表示順
  items.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority
    }
    return a.displayOrder - b.displayOrder
  })

  return items
})

/**
 * 仮想リーフの固定名
 */
export const PRIORITY_LEAF_NAME = 'Priority'

/**
 * 仮想リーフの固定ID（Gitには保存しない）
 */
export const PRIORITY_LEAF_ID = '__priority__'

/**
 * 優先段落をMarkdownコンテンツとして生成する
 */
export function generatePriorityContent(items: PriorityItem[]): string {
  if (items.length === 0) {
    return `# ${PRIORITY_LEAF_NAME}\n\n_No priority items found._\n_Add markers like "[1] " at the start or " [2]" at the end of paragraphs._`
  }

  const lines: string[] = [`# ${PRIORITY_LEAF_NAME}`, '']

  for (const item of items) {
    // 優先度バッジ + 内容
    lines.push(`**[${item.priority}]** ${item.content}`)
    // 出典（クリックで元リーフの該当行へジャンプ）
    lines.push(`_— [${item.path}](#priority:${item.leafId}:${item.line})_`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 仮想PriorityリーフのQRコード/シェア用プレーンテキストを生成
 * マークダウン装飾とリンクを除去した見やすいテキスト形式
 */
export function generatePriorityPlainText(items: PriorityItem[]): string {
  if (items.length === 0) {
    return `${PRIORITY_LEAF_NAME}\n\nNo priority items found.\nAdd markers like "[1] " at the start or " [2]" at the end of paragraphs.`
  }

  const lines: string[] = [PRIORITY_LEAF_NAME, '']

  for (const item of items) {
    // 優先度バッジ + 内容
    lines.push(`[${item.priority}] ${item.content}`)
    // 出典（リンクなし）
    lines.push(`— ${item.path}`)
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 仮想Priorityリーフを生成する（ホーム直下なのでnoteIdは空）
 * @param items 優先段落の配列
 * @param badgeIcon バッジアイコン（metadataから復元）
 * @param badgeColor バッジカラー（metadataから復元）
 */
export function createPriorityLeaf(
  items: PriorityItem[],
  badgeIcon?: string,
  badgeColor?: string
): Leaf {
  return {
    id: PRIORITY_LEAF_ID,
    title: PRIORITY_LEAF_NAME,
    noteId: '',
    content: generatePriorityContent(items),
    updatedAt: Date.now(),
    order: 0,
    badgeIcon,
    badgeColor,
  }
}

/**
 * リーフIDが仮想Priorityリーフかどうかを判定
 */
export function isPriorityLeaf(leafId: string): boolean {
  return leafId === PRIORITY_LEAF_ID
}

/**
 * リーフがGit保存対象かどうかを判定
 *
 * ホーム直下のリーフ（noteIdが実際のノートに存在しない）は保存対象外
 * 仕様: このアプリはホーム直下はノートのみ許可し、リーフは許可しない
 *
 * @param leaf リーフ
 * @param allNotes 全ノート配列
 * @returns 保存対象ならtrue
 */
export function isLeafSaveable(leaf: Leaf, allNotes: Note[]): boolean {
  return allNotes.some((n) => n.id === leaf.noteId)
}

/**
 * ノートがGit保存対象かどうかを判定
 *
 * 仮想ノート（IDが__で始まる）は保存対象外
 *
 * @param note ノート
 * @returns 保存対象ならtrue
 */
export function isNoteSaveable(note: Note): boolean {
  return !note.id.startsWith('__')
}
