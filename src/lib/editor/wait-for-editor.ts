import type { EditorPaneRef } from './editor-pane-ref'

export async function waitForMatchingEditor(
  getEditor: () => EditorPaneRef | null,
  waitForNextRender: () => Promise<void>,
  expectedLeafId: string,
  maxAttempts = 12
): Promise<EditorPaneRef | null> {
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    await waitForNextRender()
    const editorView = getEditor()
    if (editorView?.getLeafId() === expectedLeafId) {
      return editorView
    }
  }

  return null
}
