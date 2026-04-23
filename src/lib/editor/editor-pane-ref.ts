export interface EditorPaneRef {
  scrollTo(scrollTop: number): void
  focusEditor(): void
  scrollToLine(line: number): void
  insertAtCursor(text: string): void
  getSelectedText(): string
  getLeafId(): string
}
