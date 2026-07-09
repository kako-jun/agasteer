export interface EditorPaneRef {
  scrollTo(scrollTop: number): void
  focusEditor(): void
  scrollToLine(line: number): void
  insertAtCursor(text: string): void
  /** メディアファイルを添付する（フッターの添付ボタン用、#243） */
  attachFiles(files: File[]): void
  getSelectedText(): string
  getLeafId(): string
}
