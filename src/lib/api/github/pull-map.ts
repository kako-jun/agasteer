/**
 * GitHub Pull のパス折り畳み（純粋層）
 *
 * fetch・settings・IO に一切触れない純粋関数のみを置く。
 * github.ts から純移動（Phase 3 / #226）。振る舞いは不変。
 */

import { sanitizePathPart } from './paths'

/**
 * ノートパス（ファイル名を除いた parts）を最大2階層へ折り畳む。
 * 3階層以上は先頭と残りを '/' で結合した1つにまとめ、各要素は sanitizePathPart を通す
 * （collapse 後の '/'→'-' 変換は仕様）。
 */
export function collapseToTwoLevels(parts: string[]): string[] {
  if (parts.length <= 2) return parts.map((p) => sanitizePathPart(p))
  return [sanitizePathPart(parts[0]), sanitizePathPart(parts.slice(1).join('/'))]
}
