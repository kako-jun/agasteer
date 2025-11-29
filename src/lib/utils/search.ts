/**
 * 検索機能
 * 全リーフを横断検索するロジック・ストア・ハンドラー
 */

import { writable, derived, get } from 'svelte/store'
import type { Leaf, Note, SearchMatch } from '../types'
import { leaves, notes } from '../stores'

// ========== 定数 ==========
const MAX_RESULTS = 50
const SNIPPET_CONTEXT_CHARS = 30

// ========== ストア ==========
export const searchQuery = writable<string>('')
export const isSearchOpen = writable<boolean>(false)
export const selectedResultIndex = writable<number>(-1)

// 派生ストア: 検索結果（クエリ変更時に自動計算）
export const searchResults = derived([searchQuery, leaves, notes], ([$query, $leaves, $notes]) => {
  if (!$query.trim()) return []
  return searchLeaves($query, $leaves, $notes)
})

// ========== 検索ロジック ==========

/**
 * ノート/サブノート/リーフのパスを構築
 */
function buildPath(note: Note | undefined, leaf: Leaf, noteMap: Map<string, Note>): string {
  if (!note) return leaf.title

  // 親ノートがあればサブノート
  if (note.parentId) {
    const parentNote = noteMap.get(note.parentId)
    if (parentNote) {
      return `${parentNote.name}/${note.name}/${leaf.title}`
    }
  }

  return `${note.name}/${leaf.title}`
}

/**
 * リーフを検索してマッチ結果を返す
 */
export function searchLeaves(query: string, allLeaves: Leaf[], allNotes: Note[]): SearchMatch[] {
  const normalizedQuery = query.toLowerCase().trim()
  if (!normalizedQuery) return []

  const noteMap = new Map(allNotes.map((n) => [n.id, n]))
  const results: SearchMatch[] = []

  for (const leaf of allLeaves) {
    const content = leaf.content.toLowerCase()
    let searchIndex = 0

    while (searchIndex < content.length && results.length < MAX_RESULTS) {
      const matchIndex = content.indexOf(normalizedQuery, searchIndex)
      if (matchIndex === -1) break

      const note = noteMap.get(leaf.noteId)
      const { snippet, matchStart, matchEnd } = createSnippet(
        leaf.content,
        matchIndex,
        normalizedQuery.length,
        SNIPPET_CONTEXT_CHARS
      )

      results.push({
        leafId: leaf.id,
        leafTitle: leaf.title,
        noteName: note?.name ?? '',
        noteId: leaf.noteId,
        path: buildPath(note, leaf, noteMap),
        line: getLineNumber(leaf.content, matchIndex),
        snippet,
        matchStart,
        matchEnd,
      })

      // 同じリーフで複数マッチがある場合、次のマッチを探す
      searchIndex = matchIndex + normalizedQuery.length
    }

    if (results.length >= MAX_RESULTS) break
  }

  return results
}

/**
 * マッチ箇所を含むスニペットを生成
 * マッチがある行を抽出し、前後contextChars文字を表示
 */
export function createSnippet(
  content: string,
  matchIndex: number,
  matchLength: number,
  contextChars: number
): { snippet: string; matchStart: number; matchEnd: number } {
  // マッチがある行を特定
  const lineStart = content.lastIndexOf('\n', matchIndex - 1) + 1
  const lineEnd = content.indexOf('\n', matchIndex)
  const actualLineEnd = lineEnd === -1 ? content.length : lineEnd

  // 行内でのマッチ位置
  const matchInLine = matchIndex - lineStart
  const line = content.slice(lineStart, actualLineEnd)

  // スニペットの総幅（前後contextChars + マッチ自体）
  const totalWidth = contextChars * 2 + matchLength

  // 行が短い場合はそのまま返す
  if (line.length <= totalWidth) {
    return {
      snippet: line,
      matchStart: matchInLine,
      matchEnd: matchInLine + matchLength,
    }
  }

  // マッチを中心にスニペット範囲を決定
  let start = matchInLine - contextChars
  let end = matchInLine + matchLength + contextChars

  // 前が足りない場合、後ろを伸ばす
  if (start < 0) {
    end += -start
    start = 0
  }

  // 後ろが足りない場合、前を伸ばす
  if (end > line.length) {
    start -= end - line.length
    end = line.length
  }

  // 最終調整
  start = Math.max(0, start)
  end = Math.min(line.length, end)

  const snippet = line.slice(start, end)
  const relativeMatchStart = matchInLine - start
  const relativeMatchEnd = relativeMatchStart + matchLength

  // 前後に省略記号
  const prefix = start > 0 ? '...' : ''
  const suffix = end < line.length ? '...' : ''

  return {
    snippet: prefix + snippet + suffix,
    matchStart: prefix.length + relativeMatchStart,
    matchEnd: prefix.length + relativeMatchEnd,
  }
}

/**
 * 文字位置から行番号を取得（1始まり）
 */
export function getLineNumber(content: string, charIndex: number): number {
  const beforeMatch = content.slice(0, charIndex)
  return (beforeMatch.match(/\n/g) || []).length + 1
}

// ========== ハンドラー ==========

export function openSearch(): void {
  isSearchOpen.set(true)
}

export function closeSearch(): void {
  isSearchOpen.set(false)
  // 検索クエリはクリアしない（ユーザーが明示的にクリアするまで保持）
  selectedResultIndex.set(-1)
}

export function toggleSearch(): void {
  if (get(isSearchOpen)) {
    closeSearch()
  } else {
    openSearch()
  }
}

export function clearSearch(): void {
  searchQuery.set('')
  selectedResultIndex.set(-1)
}

export function handleSearchInput(query: string): void {
  searchQuery.set(query)
  selectedResultIndex.set(-1)
}

export function selectNextResult(): void {
  const results = get(searchResults)
  const currentIndex = get(selectedResultIndex)
  if (results.length === 0) return

  const nextIndex = currentIndex < results.length - 1 ? currentIndex + 1 : 0
  selectedResultIndex.set(nextIndex)
}

export function selectPrevResult(): void {
  const results = get(searchResults)
  const currentIndex = get(selectedResultIndex)
  if (results.length === 0) return

  const prevIndex = currentIndex > 0 ? currentIndex - 1 : results.length - 1
  selectedResultIndex.set(prevIndex)
}

export function getSelectedResult(): SearchMatch | null {
  const results = get(searchResults)
  const index = get(selectedResultIndex)
  if (index < 0 || index >= results.length) return null
  return results[index]
}
