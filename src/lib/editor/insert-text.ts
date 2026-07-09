/**
 * カーソル位置へのテキスト挿入（MarkdownEditor の insertAtCursor 本体）(#243)
 *
 * view は構造的型で受け、node 環境の vitest でフォーカス挙動を検証できる形にする。
 */

/** 挿入に必要な最小の EditorView 形 */
export interface CursorInsertView {
  state: { selection: { main: { from: number } } }
  dispatch(spec: { changes: { from: number; insert: string }; selection: { anchor: number } }): void
  focus(): void
}

export interface InsertTextOptions {
  /**
   * 挿入後にエディタへフォーカスを移すか（既定 true、従来挙動）。
   *
   * メディア添付経由の挿入はアップロード完了時（添付から数秒〜数分後）に走るため
   * false を渡す。true のままだと反対ペインで作業中でもフォーカスを奪い、
   * モバイルでは仮想キーボードがポップアップする（#243 レビュー should-3）。
   */
  focus?: boolean
}

/**
 * カーソル位置に text を挿入し、カーソルを挿入末尾へ移す。
 */
export function insertTextAtCursor(
  view: CursorInsertView,
  text: string,
  options: InsertTextOptions = {}
): void {
  const { focus = true } = options
  const from = view.state.selection.main.from
  view.dispatch({
    changes: { from, insert: text },
    selection: { anchor: from + text.length },
  })
  if (focus) {
    view.focus()
  }
}
