/**
 * Svelteストア（互換性維持のための再エクスポート）
 *
 * #300: god-file化していた stores.svelte.ts（約930行）を関心ごとに分割した。
 * - core-state.svelte.ts    ... ノート/リーフ/アーカイブ/同期フラグ等の $state 宣言
 * - pane-state.svelte.ts    ... 左右ペインの表示状態（PR #309 レビューで追加分割）
 * - dirty-tracking.ts       ... 差分検出・Pushスナップショット管理
 * - store-mutations.ts      ... ノート/リーフ更新・in-place field mutation ヘルパー
 * - persistence-effects.svelte.ts ... LocalStorage/IndexedDB永続化の $effect
 * - repo-switch-reset.ts    ... リポジトリ切替時の状態リセット
 *
 * rehydrate.svelte.ts（stores/ 内の別モジュール）や、このファイルを vi.mock
 * している既存テストが `'./stores.svelte'` を直接 import しているのを壊さない
 * よう、分割後の各モジュールをまとめて re-export する。新規コードは
 * stores/index.ts 経由（'$lib/stores'）で import すること。
 *
 * dirty-tracking からは差分検出の内部ヘルパー（updateHomeDirtyIds /
 * updateArchiveDirtyIds / resetPushedSnapshots）を除いた公開 API だけを
 * re-export する。この3つは stores/ 内部モジュール（store-mutations.ts /
 * repo-switch-reset.ts）だけが './dirty-tracking' から直接 import して使う
 * private 相当の関数のため、'$lib/stores' 経由では公開しない。
 */
export * from './core-state.svelte'
export * from './pane-state.svelte'
export {
  isNoteDirty,
  getLastPushedContent,
  setLastPushedSnapshot,
  setArchiveBaseline,
  addNotesToBaseline,
  addLeafToBaseline,
  refreshDirtyState,
  clearAllChanges,
} from './dirty-tracking'
export * from './store-mutations'
export * from './persistence-effects.svelte'
export * from './repo-switch-reset'
