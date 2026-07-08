/**
 * Push 進捗ステージ（#238）
 *
 * Push の実体 `pushAllWithTreeAPI`（api/github.ts）は直列の API 呼び出し
 * チェーンなので、「残りステージ数」は正確にわかる。7 コールを 5 ステージに
 * 束ね、FF 風カウントダウン（5→4→3→2→1）としてトーストに表示する。
 *
 * | 表示 | 実処理                                                |
 * | ---- | ----------------------------------------------------- |
 * | 5    | repo / ref 取得（空リポジトリ初期化経路もここに含む） |
 * | 4    | base commit / 現行 tree 取得                          |
 * | 3    | 新 tree 作成 = 本文アップロード（支配的に重い）       |
 * | 2    | commit 作成                                           |
 * | 1    | ref 更新（着地）                                      |
 *
 * 数字は「残り秒数」ではなく残りステージ数。見た目はカウントダウンだが
 * 嘘をつかない（秒数を騙らない）。
 */

/** Push の総ステージ数 */
export const PUSH_STAGE_TOTAL = 5

/** ステージ5: repo / ref 取得（空リポジトリ初期化の Contents API PUT も含む） */
export const PUSH_STAGE_REFS = 5
/** ステージ4: base commit / 現行 tree 取得 */
export const PUSH_STAGE_BASE_TREE = 4
/** ステージ3: 新 tree 作成（本文アップロード・最長） */
export const PUSH_STAGE_UPLOAD = 3
/** ステージ2: commit 作成 */
export const PUSH_STAGE_COMMIT = 2
/** ステージ1: ref 更新 */
export const PUSH_STAGE_FINALIZE = 1

/**
 * Push 進捗通知コールバック。残りステージ数（5→1）を受け取る。
 */
export type PushProgressCallback = (remainingStages: number) => void

/**
 * カウントダウン表示の単調減少ガード（純粋関数）。
 *
 * リトライ・救済経路で内部的にステージが巻き戻っても、表示上の数字は
 * 絶対に増やさない（数字が増えるのは最悪の UX）。トースト表示中の最小値を
 * 保持する。新しい Push が最初から始まった場合は呼び出し側が
 * current=null にリセットしてから使う。
 *
 * @param current - 現在表示中の残りステージ数（未表示なら null）
 * @param next - 新たに通知された残りステージ数
 * @returns 表示すべき残りステージ数（単調減少を保証）
 */
export function clampMonotonicCountdown(current: number | null, next: number): number {
  if (current === null) return next
  return Math.min(current, next)
}
