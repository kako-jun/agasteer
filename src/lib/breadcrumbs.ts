/**
 * パンくずリスト生成ユーティリティ
 */
import type { Note, Leaf, Breadcrumb, View } from './types'

type Pane = 'left' | 'right'

/**
 * パンくずリストを生成
 */
export function getBreadcrumbs(
  view: View,
  note: Note | null,
  leaf: Leaf | null,
  allNotes: Note[],
  pane: Pane,
  goHome: (pane: Pane) => void,
  selectNote: (note: Note, pane: Pane) => void
): Breadcrumb[] {
  const crumbs: Breadcrumb[] = []
  const suffix = pane === 'right' ? '-right' : ''

  crumbs.push({
    label: 'Agasteer',
    action: () => goHome(pane),
    id: `home${suffix}`,
    type: 'home',
  })

  if (note) {
    const parentNote = allNotes.find((f) => f.id === note.parentId)
    if (parentNote) {
      crumbs.push({
        label: parentNote.name,
        action: () => selectNote(parentNote, pane),
        id: `${parentNote.id}${suffix}`,
        type: 'note',
      })
    }
    crumbs.push({
      label: note.name,
      action: () => selectNote(note, pane),
      id: `${note.id}${suffix}`,
      type: 'note',
    })
  }

  if (leaf) {
    crumbs.push({
      label: leaf.title,
      action: () => {},
      id: `${leaf.id}${suffix}`,
      type: 'leaf',
    })
  }

  return crumbs
}

/**
 * リーフのコンテンツから # 見出しを抽出
 */
export function extractH1Title(content: string): string | null {
  const firstLine = content.split('\n')[0]
  const match = firstLine.match(/^# (.+)/)
  return match ? match[1].trim() : null
}

/**
 * リーフのコンテンツの1行目の # 見出しを更新
 */
export function updateH1Title(content: string, newTitle: string): string {
  const lines = content.split('\n')
  const firstLine = lines[0]
  if (firstLine.match(/^# /)) {
    lines[0] = `# ${newTitle}`
    return lines.join('\n')
  }
  return content
}
