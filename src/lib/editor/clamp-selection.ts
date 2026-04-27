/**
 * #170: full doc replace 時にカーソル位置を保持するためのユーティリティ。
 *
 * CodeMirror 6 の dispatch に selection を渡さない場合、カーソルは
 * doc 先頭にリセットされる。doc を全置換するときも既存の selection を
 * 引き継げるように、各 range を新しい doc 長にクランプして返す。
 */

export interface SelectionRangeLike {
  anchor: number
  head: number
}

export function clampSelectionRanges(
  ranges: readonly SelectionRangeLike[],
  newLength: number
): SelectionRangeLike[] {
  return ranges.map((range) => ({
    anchor: Math.min(Math.max(range.anchor, 0), newLength),
    head: Math.min(Math.max(range.head, 0), newLength),
  }))
}
