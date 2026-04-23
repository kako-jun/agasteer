import { describe, expect, it } from 'vitest'

import type { EditorPaneRef } from './editor-pane-ref'
import { waitForMatchingEditor } from './wait-for-editor'

function createEditor(leafId: string): EditorPaneRef {
  return {
    scrollTo() {},
    focusEditor() {},
    scrollToLine() {},
    insertAtCursor() {},
    getSelectedText() {
      return ''
    },
    getLeafId() {
      return leafId
    },
  }
}

describe('waitForMatchingEditor', () => {
  it('waits until the target leaf editor is mounted', async () => {
    const editors: Array<EditorPaneRef | null> = [createEditor('old-leaf'), createEditor('target')]
    let index = 0

    const editor = await waitForMatchingEditor(
      () => editors[Math.min(index, editors.length - 1)],
      async () => {
        index += 1
      },
      'target',
      3
    )

    expect(editor?.getLeafId()).toBe('target')
  })

  it('returns null when the target leaf never appears', async () => {
    const editor = await waitForMatchingEditor(
      () => createEditor('other-leaf'),
      async () => {},
      'target',
      2
    )

    expect(editor).toBeNull()
  })
})
